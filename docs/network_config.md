# Network & Service Configuration

## Overview
NoteLytix uses a microservices architecture running in a Docker network. All services communicate over the internal network using service names as hostnames.

## Internal Network
- **Network Name**: `notelytix_default`
- **Driver**: `bridge`

## Service Map

| Service | Hostname | Internal Port | External Port | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `auth` | 8081 | 8081 | OAuth2 via Google & JWT issuance |
| **STT** | `stt` | 8082 | 8082 | Real-time audio transcription (WebSockets) |
| **Meetings** | `meetings` | 8083 | 8083 | Meeting metadata & Transcript management |
| **LLM** | `llm` | 8084 | 8084 | Title & Summary generation |
| **PostgreSQL** | `postgres` | 5432 | 5432 | Persistent storage |
| **Frontend** | `frontend` | 3000 | 3000 | React application |

## Shared Resources
- **Transcripts Volume**: `transcripts_data` (Mounted at `/app/transcripts` in STT, Meetings, and LLM).
- **Database Volume**: `postgres_data` (Persistence for PostgreSQL).

## External IPs
Access these services from your host machine (Browser/Postman) via `http://localhost:<External Port>`.

Inside the Docker network, use `http://<Hostname>:<Internal Port>`.
