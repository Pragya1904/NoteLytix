# NoteLytix Architecture Documentation

## High-Level Design (HLD)

### System Overview
NoteLytix is a meeting recording and transcription system composed of a desktop frontend and a set of backend microservices.

```mermaid
graph TB
    subgraph Client
        Electron[Electron App]
    end

    subgraph Backend Services
        Gateway[API Gateway / Load Balancer]
        Auth[Auth Service]
        STT[STT Service]
        Meetings[Meetings Service]
        LLM[LLM Service]
    end

    subgraph Infrastructure
        Postgres[(PostgreSQL)]
        Redis[(Redis)]
        S3[(Object Storage)]
        Sarvam[Sarvam AI API]
        LLMProvider[LLM Provider API]
    end

    Electron -->|HTTPS/WSS| Gateway
    Gateway -->|/auth| Auth
    Gateway -->|/v1/stt| STT
    Gateway -->|/v1/meetings| Meetings
    Gateway -->|/v1/summary| LLM

    Auth --> Postgres
    Meetings --> Postgres
    STT -->|Audio/Transcript| S3
    STT -->|Stream| Sarvam
    STT -->|Partials| Meetings
    LLM -->|Transcript| S3
    LLM -->|Generate| LLMProvider
    LLM -->|Cache| Redis
```

### Key Components
1.  **Electron App**: Captures audio, handles UI, streams audio to backend.
2.  **Auth Service**: Manages Google OAuth2 and user sessions.
3.  **STT Service**: Handles real-time audio streaming, communicates with Sarvam AI, and manages file uploads to S3.
4.  **Meetings Service**: Manages meeting metadata, participants, and transcript storage references.
5.  **LLM Service**: Generates summaries from transcripts using external LLM providers.

---

## Low-Level Design (LLD) & Workflows

### 1. Authentication Flow
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Auth
    participant Google

    User->>Frontend: Click "Sign in with Google"
    Frontend->>Auth: GET /auth/google/redirect
    Auth-->>Frontend: Redirect URL
    Frontend->>Google: Redirect to Google Login
    Google-->>Frontend: Callback with Code
    Frontend->>Auth: GET /auth/google/callback?code=...
    Auth->>Google: Exchange Code for Token
    Google-->>Auth: Access Token + User Info
    Auth->>Auth: Create/Update User in DB
    Auth->>Auth: Generate JWT
    Auth-->>Frontend: Return JWT
    Frontend->>Frontend: Store JWT securely
```

### 2. Start Meeting & STT Flow
```mermaid
sequenceDiagram
    participant Frontend
    participant Meetings
    participant STT
    participant Sarvam
    participant S3

    Frontend->>Meetings: POST /v1/meetings (Create)
    Meetings-->>Frontend: Meeting ID
    Frontend->>Meetings: POST /v1/meetings/{id}/start
    Meetings->>STT: Notify Start (Optional)
    Meetings-->>Frontend: WS URL + Token
    Frontend->>STT: WS Connect /v1/stt/ws
    STT-->>Frontend: Connected
    
    loop Audio Streaming
        Frontend->>STT: Send Audio Chunk (Binary)
        STT->>STT: Buffer Audio
        STT->>Sarvam: Stream Chunk
        Sarvam-->>STT: Partial Transcript
        STT-->>Frontend: Partial Transcript (JSON)
    end

    Frontend->>Meetings: POST /v1/meetings/{id}/end
    STT->>S3: Upload Full Audio
    STT->>S3: Upload Transcript
    STT->>Meetings: Update Meeting with URLs
```

### 3. Summary Generation Flow
```mermaid
sequenceDiagram
    participant Frontend
    participant LLM
    participant Meetings
    participant S3
    participant AIProvider

    Frontend->>LLM: POST /v1/meetings/{id}/summary
    LLM->>Meetings: Get Meeting Metadata
    LLM->>S3: Fetch Transcript
    S3-->>LLM: Transcript JSON
    LLM->>AIProvider: Generate Summary (Prompt + Transcript)
    AIProvider-->>LLM: Summary Text
    LLM->>Meetings: Save Summary
    LLM-->>Frontend: Return Summary
```

### Database Schema (ER Diagram)
```mermaid
erDiagram
    PERSONS ||--o{ MEETINGS : owns
    MEETINGS ||--o{ PARTICIPANTS : has
    MEETINGS ||--|{ TRANSCRIPTS : has
    MEETINGS ||--o{ SUMMARIES : has

    PERSONS {
        uuid id PK
        string email
        string username
    }

    MEETINGS {
        uuid id PK
        uuid owner_id FK
        string recording_url
        string transcript_url
        string summary
    }

    TRANSCRIPTS {
        uuid id PK
        uuid meeting_id FK
        string s3_path
        string content_short
    }
```
