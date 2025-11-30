Assume PostgreSQL for relational storage and S3 (AWS S3-compatible) for audio + transcript files. If you prefer another DB or object store, the plan is easily swapped.

---

# High-level product vision (1–2 lines)

Notelytix is a desktop-first meeting recorder and live-transcription app with single-sign-on (Google), automatic saving of recordings + transcripts to S3, and on-demand AI summaries. The UX is minimal and focused on reliable capture of both sides of a meeting and high-fidelity live transcription.

---

# 1) System architecture (overview)

```
[Electron Desktop App / Frontend]  <--->  [API Gateway / Auth Service]  <--->  {K8s/minikube cluster}
                                                              |
                                                              +--> STT Service (Golang)  (websocket/STT provider adapters)
                                                              |
                                                              +--> LLM Service (Golang)  (summary generation)
                                                              |
                                                              +--> Meetings Service (Golang) (DB + metadata)
                                                              |
                                                              +--> File Upload Service (or integrated into STT/Meetings) -> S3
                                                              |
                                                              +--> PostgreSQL (state) + Redis (caching/queue)
```

Notes:

* Each backend is a separate Docker container (microservice) managed under minikube.
* Use an API Gateway (simple traefik/nginx) for routing & TLS.
* Use Google OAuth2 for login; no local username/password.
* STT Service has pluggable provider adapters (e.g., sarvam.go adapter) — `stt` dir layout below.
* Use WebSocket for live STT streaming from the frontend to STT service.
* LLM Service exposes a REST endpoint for on-demand summaries. Can call OpenAI or other LLM provider.

---

# 2) Frontend tech recommendation (desktop + docker friendly)

**Primary choice:** Electron with React (TypeScript) + Tailwind CSS + Zustand for state management.
Why:

* Electron is mature for desktop apps, Dockerizable for builds, and easily integrates with native audio APIs for capturing both sides (mic + loopback/capture device).
* React + TypeScript gives strong dev DX and easy injection into `emergent.sh` prompt.
* Tailwind for fast consistent UI (matches simple UI in the image).
* Google Sign-In: use OAuth2 flow via the backend (recommended) so secrets stay server side.

Alternative: Tauri (lighter) — but Electron is simpler for immediate compatibility.

---

# 3) Backend stack & infra

* Language: Golang for all microservices (fast, static binary, good concurrency).
* Services:

  1. **Auth / Gateway**: handles Google sign-in redirect, session tokens (JWT short-lived), user creation.
  2. **STT service**: websocket ingestion, provider-agnostic adapters, writes audio chunk to S3, emits STT chunks to websocket client and to Meetings Service.
  3. **Meetings service**: stores metadata, transcript pointer, links to S3, exposes meeting CRUD.
  4. **LLM service**: receives transcript -> calls LLM provider (OpenAI or on-prem) -> returns summary, caches results.
  5. **File service** (optional): presigned S3 uploads, archival policies.
* Data stores:

  * PostgreSQL for relational data
  * S3 (or S3-compatible) for audio + transcript files
  * Redis for transient state, caching and job queues (summary jobs)
* Orchestration: Kubernetes (minikube for dev)
* CI/CD: GitHub Actions for build/test → push Docker images to registry → apply k8s manifests / Helm charts to cluster

---

# 4) Database schema (base + recommended improvements)

Base provided:

* `t1_person` (`persons`): `id UUID PK`, `username VARCHAR`, `email VARCHAR UNIQUE`, `created_on TIMESTAMP`
* `t2_meetings` (`meetings`): `id UUID PK`, `owner_id UUID FK->persons.id`, `created_on TIMESTAMP`, `recording_url TEXT`, `transcript_url TEXT`, `summary TEXT`, `duration_seconds INT`, `title TEXT`

**Recommended extended schema**

* `participants` (meeting participants & speaker labels)

  * `id UUID`, `meeting_id UUID`, `person_id UUID NULL`, `display_name TEXT`, `email TEXT`, `role TEXT`, `joined_at TIMESTAMP`
* `transcripts` (one per meeting; can keep multiple segments)

  * `id UUID`, `meeting_id UUID`, `s3_path TEXT`, `created_on TIMESTAMP`, `content_short TEXT` (maybe first N chars)
* `summaries`

  * `id UUID`, `meeting_id UUID`, `summary_text TEXT`, `llm_model TEXT`, `created_on TIMESTAMP`, `tokens_used INT`
* Indexes: index `meetings(owner_id)`, `transcripts(meeting_id)`, `summaries(meeting_id)`, `persons(email)`.

Use UUIDs (v4) for objects and deterministic S3 prefixes for easy cleanup.

S3 path convention:

```
s3://notelytix-bucket/{env}/users/{user_id}/meetings/{meeting_id}/recording-{ts}.wav
s3://notelytix-bucket/{env}/users/{user_id}/meetings/{meeting_id}/transcript-{ts}.json
s3://notelytix-bucket/{env}/users/{user_id}/meetings/{meeting_id}/summary-{ts}.json
```

Retention/archival policy: move older than X months to Glacier or different storage class.

---

# 5) STT service design (golang)

**Goals:** pluggable providers, robust streaming, write audio to S3, produce live transcripts via WebSocket.

**`stt` dir layout (required)**

```
stt/
  utils.go           // helpers: s3 upload helpers, audio chunking, config
  stt.go             // main entrypoint: server, WS handling, orchestration
  sarvam.go          // adapter for "Sarvam" STT provider (example)
  provider.go        // interface declarations for STT providers
  providers/         // other provider adapters if added later
  recorder.go        // logic to accept audio chunks and buffer/persist
  speaker_diarization.go // optional: hooks for diarization
```

**provider.go**

```go
type Provider interface {
    // Initialize provider with credentials/config
    Init(ctx context.Context, cfg ProviderConfig) error
    // StreamChunk sends a chunk and returns text partials or error
    StreamChunk(ctx context.Context, chunk []byte) (partialText string, err error)
    // Close closes the session
    Close() error
}
```

**stt.go responsibilities**

* Accept WebSocket connections from frontend
* Receive audio frames (binary). Accept PCM16 or Opus frames; document expected format in frontend
* Buffer & stream chunks to provider via `Provider.StreamChunk()` while concurrently writing audio to temporary file
* On meeting end, finalize file and upload to S3 (presigned paths described above)
* Send STT partials back down the websocket in realtime; also forward partials to Meetings Service via internal API
* Graceful reconnection and resume logic; on crash leave partial transcript in DB

**sarvam.go responsibilities**

* Implement `Provider` interface for Sarvam provider
* Keep in separate file so provider swaps don't touch `stt.go`.

**Edge cases**

* If user offline: queue data locally and retry to send to service.
* If provider throttles, have backpressure to UI (send `BUSY` event).

---

# 6) LLM service (Golang)

* Endpoint: `POST /v1/meetings/{id}/summary` or `POST /v1/summary` with `meeting_id` and `options` (length, style).
* Steps:

  1. Validate meeting and transcript presence.
  2. Optionally chunk transcript (if > token limit).
  3. Compose prompt with system instructions (see example prompt below).
  4. Call LLM provider (OpenAI or local) with streaming if supported.
  5. Save summary to DB (`summaries`) and optionally to S3.
  6. Return summary & tokens used.
* Caching: If summary for meeting exists and transcript unchanged, return cached summary.
* Queue: For long transcripts use a job queue (Redis + worker) to avoid blocking HTTP.

**Security**: redact PII if requested or offer toggles before sending to third-party LLM.

---

# 7) API surface (selected endpoints)

Auth / Users:

* `GET /auth/google/redirect` — redirect to Google login
* `GET /auth/google/callback` — returns JWT to frontend (set httpOnly cookie or return token)

Meetings / STT:

* `POST /v1/meetings` — create meeting metadata (returns meeting_id)
* `GET /v1/meetings/{meeting_id}` — get meeting metadata
* `POST /v1/meetings/{meeting_id}/start` — create STT session (returns websocket URL + session token)
* `WS  /v1/stt/ws?meeting_id=...&token=...` — encrypted websocket for streaming audio (binary frames)
* `POST /v1/meetings/{meeting_id}/end` — finalize meeting

Files:

* `GET /v1/presign/upload?path=...` — generate presigned URL for direct frontend S3 upload if needed

LLM Summary:

* `POST /v1/meetings/{meeting_id}/summary` — returns summary

Admin:

* `GET /admin/health`, `GET /metrics` — for monitoring.

Auth: Use JWT (signed with service key). For web sockets, accept JWT at connection time.

---

# 8) Frontend flow details (UX)

Flow 1 (Start -> recording):

* Landing screen with big "Start" (Google login top-right or required before start)
* On Start, create meeting via `POST /v1/meetings`. App requests STT session -> receives websocket URL + credentials.
* Start audio capture (Electron gets microphone; for capturing both sides provide guidance: either configure a loopback device or recommend OS-specific instructions; if user uses VoIP inside same machine, use OS loopback).
* Stream audio in small frames (e.g., 100–500ms chunks) to websocket.
* Display live transcript as partials (scrollable, editable inline).
* Provide "Pause/Stop" controls. On stop call `/end` to finalize and upload.

Flow 2 (Live transcription)

* Display partials in a transcript pane with timestamps and speaker (if diarization available).
* Option to edit inline (edits stored locally and optionally in DB).

Flow 3/4 (Save audio + transcript)

* After finalize, STT service uploads audio to S3 and writes transcript file to S3 under meeting folder.
* Meeting metadata contains `recording_url` and `transcript_url`.

Flow 5 (Summary)

* "Generate summary" button calls LLM service; show progress and then display summary; allow regenerating with different options (concise, action-items, minutes).

UI: clean, minimal; match provided reference image: large logo, three actions: Sign up (not used — use Google), Sign in (Google), Start.

---

# 9) `emergent.sh` prompt for frontend agent

This is the exact prompt to inject into `emergent.sh` for the frontend junior agent to implement the desktop UI and client logic.

```
You are a frontend engineer building the Notelytix Electron desktop app (React + TypeScript + Tailwind). Implement a clean, minimal UI mirroring the provided reference: large centered logo, a "Start" button for recording, and a "Sign in with Google" button. The app must:

1. Use Google OAuth via backend: call GET /auth/google/redirect and handle callback that returns a JWT. Store JWT securely in Electron (secure storage recommended).
2. Implement audio capture using WebAudio API or Electron native APIs. Audio must be captured as PCM16 or Opus frames and sent as binary chunks to a WebSocket.
3. Connect to websocket session: after creating a meeting (POST /v1/meetings), call POST /v1/meetings/{id}/start to get WS URL & session token. Open WS and stream audio frames.
4. Render live transcription area that appends partials sent by websocket in real-time with timestamp and optional speaker label. Allow inline edit of transcript; edits go to local buffer and are sendable to Meetings service on save.
5. Provide buttons: Start, Pause, Stop, Download recording, Generate summary. On Stop: call /v1/meetings/{id}/end and show final transcript and S3 URLs returned by API.
6. Implement UX states: connecting, recording (with elapsed time), buffering, error. If STT provider is busy, show an informative message and retry.
7. Implement a settings panel to configure audio format (PCM16 or Opus), sample rate, and enable/disable local loopback capture instructions. Offer OS-specific hints for capturing "both sides" (macOS: use 'BlackHole' or iShowU, Windows: Stereo Mix).
8. Build the app so it can be packaged into a Docker build (Dockerfile) that produces a distributable Electron build; include a script `docker-build.sh`.
9. Add tests (Jest/RTL) for core UI behaviors and a simple E2E test that simulates sign-in, start, streaming (mock WS) and stop.
10. Styling: Tailwind; produce responsive layout for small desktop windows. Use a single-page design with top-right Google sign-in and central action area.

Deliverables:
- A single repo `frontend/` with `package.json`, `src/`, `Dockerfile`, `docker-build.sh`, and README describing local dev and packaging steps.
- A `manifest` describing required env vars: API_URL, GOOGLE_CLIENT_ID, ELECTRON_ENV.
- Provide a short note on how to configure loopback capture for Windows/macOS/Linux.

Make decisions for edges if unspecified and document them in README.
```

---

# 10) Junior agent tasks (concrete, prioritized with acceptance criteria)

### Task A — STT service (junior backend 1)

* Implement Go microservice in `stt/` with files {`stt.go`, `utils.go`, `sarvam.go`, `provider.go`}.
* Accept websocket binary frames and produce JSON partials to client.
* Upload finalized recording to S3 path convention.
* Unit tests: provider mocked; test chunking & s3 upload logic.
  **ACCEPTANCE**: run locally, stream mock PCM to WS, receive partial transcript events, check S3 path exists.

### Task B — Meetings service (junior backend 2)

* REST API for meetings CRUD and transcript pointers.
* Store metadata in Postgres.
* Provide `start` and `end` endpoints used by frontend and STT.
  **ACCEPTANCE**: create meeting via POST and retrieve DB row; `end` attaches `recording_url` and `transcript_url`.

### Task C — LLM service (junior backend 3)

* Expose POST `/summary` for meeting_id.
* Implement prompt / chunking; call LLM provider (mockable).
* Save summary to DB and return.
  **ACCEPTANCE**: call endpoint with sample transcript — returns summary and DB entry.

### Task D — Frontend (junior frontend)

* Implement Electron + React app as per `emergent.sh`.
  **ACCEPTANCE**: can authenticate (mocked), open WS, stream audio (use prerecorded audio), show live transcript partials.

### Task E — Infrastructure & CI/CD

* Provide Dockerfiles for each service.
* GitHub Actions pipeline: run tests -> build images -> push to registry (GHCR) -> deploy to minikube using `kubectl apply -f k8s/`.
* Provide k8s manifests for each service (deployment + service + ingress). Add resource requests/limits.
  **ACCEPTANCE**: CI runs and minikube cluster deploys services, passes health checks.

---

# 11) Example Dockerfile (golang service)

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.21 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/stt ./cmd/stt

FROM gcr.io/distroless/static
COPY --from=build /bin/stt /bin/stt
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/bin/stt"]
```

---

# 12) Example Kubernetes Deployment (snippet)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stt-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: stt
  template:
    metadata:
      labels: { app: stt }
    spec:
      containers:
      - name: stt
        image: ghcr.io/yourorg/stt:latest
        env:
        - name: S3_BUCKET
          value: notelytix-bucket
        ports:
        - containerPort: 8080
        resources:
          requests: { cpu: "250m", memory: "256Mi" }
          limits: { cpu: "1", memory: "1Gi" }
```

Use Helm for parametric deployments.

---

# 13) GitHub Actions CI skeleton

* `ci.yml`:

  * name: CI
  * on: [push, pull_request]
  * jobs: build (runs `go test ./...`, `npm test` for frontend), build docker images and push to GHCR (on main), run `kubectl apply` to minikube (deploy step on a `deploy` branch or protected).

---

# 14) Observability & SRE (basic)

* Metrics: expose `/metrics` Prometheus format for each service.
* Logs: structured JSON logs; push to a logging stack (ELK/Loki) in prod.
* Tracing: opentelemetry integration is strongly advised.
* SLOs: recording success ≥ 99.5%, summary latency ≤ 10s (for short transcripts), retention policy for recordings.
* Backups: daily DB dump + replication; test restores monthly.

---

# 15) Security & privacy

* All data at rest: S3 server-side encryption (SSE), DB encrypted volumes.
* All data in transit: HTTPS + WSS only.
* LLM data: give users toggle to opt-out of sending transcripts to 3rd-party LLM. Provide local LLM option if needed.
* Minimize sensitive logs (redact PII in logs).
* Implement RBAC for admin endpoints.

---

# 16) Testing & QA

* Unit tests for all services; integration tests for STT→Meetings→S3 flow (use localstack for S3 mocking).
* End-to-end test using Electron test runner or Puppeteer.
* Load test STT websockets (locust or k6) to validate concurrency.

---

# 17) Acceptance Criteria for MVP (short list)

1. Google sign-in works and creates user row.
2. Start/Stop recording from desktop app; audio file appears in S3 path.
3. Live transcript displays in app during recording.
4. Transcript JSON saved to S3 and linked in DB.
5. On-demand summary endpoint returns a usable summary and persists it.
6. Deployment via minikube using manifests works and all services are reachable.
7. CI runs tests + builds and can deploy to dev cluster.

---

# 18) Deliverables you can hand to junior agents

* This document (copy to repo `docs/`).
* `emergent.sh` prompt for frontend (above).
* `stt` directory scaffold (files with TODOs) and provider interface (above).
* Example Dockerfile + k8s YAML (above).
* README template for each service explaining env vars and local dev.

---

If you want, I can:

* generate the `stt` dir scaffold (Go files with TODOs and provider interface)
* produce the full `emergent.sh` file content and a ready `README_frontend.md`
* or create the GitHub Actions YAML for CI that builds and deploys to minikube

Which one should I produce next? (I can start by scaffolding the `stt` package and a minimal `stt.go` + `provider.go` and `sarvam.go` with comments and TODOs.)
