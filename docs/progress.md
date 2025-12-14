# Progress Report - December 15, 2024

## Achievements
1.  **Frontend Infrastructure**
    - Dockerized Frontend using `node:20-alpine` to support `react-router-dom` v7.
    - Configured Docker networking to allow Frontend-Backend communication.
    - Fixed initial rendering issues.

2.  **Authentication (Google OAuth)**
    - Implemented Backend `auth` service with `goth` and PostgreSQL `users` table.
    - Implemented Frontend login flow: Redirect to Backend -> Handle Callback -> Store JWT.
    - Verified End-to-End Authentication flow works (User ID/Email captured).

3.  **Audio Streaming & Meetings Architecture**
    - **Meetings Service**: Created PostgreSQL `meetings` table and `POST /meeting/create` API.
    - **STT Service**: Implemented Event-Driven WebSocket Protocol:
        - Handshake: `start_meeting` -> `connecting_stt` -> `connected_stt`.
        - Audio: Binary Int16 PCM streaming.
        - Controls: `pause_meeting`, `resume_meeting`, `end_meeting`, `keep_alive`.
    - **Frontend Recorder**: Refactored `useAudioRecorder` hook to match the new protocol and handle audio queueing.

4.  **Bug Fixes** (Detailed in `docs/bugs.md`)
    - Fixed backend build errors (unused imports).
    - Fixed Frontend runtime crash (`useEffect` reference).
    - Fixed invalid email parameter in `createMeeting` request by decoding JWT.
    - Attempted fix for WebSocket race conditions using `isConnecting` ref.

## Current status & Blockers
- **Immediate Disconnection**: When "Start Recording" is clicked, the User sees a "Connection error" toast immediately, and the UI resets to "IDLE" (Start Recording button reappears).
- **Socket Behavior**: The WebSocket (`ws://localhost:8082/...`) likely opens and immediately closes or errors out, triggering the frontend `onerror` handler.
- **No Handshake**: No handshake messages are exchanged before the error occurs.

## Next Steps (To Resume)
1.  **Debug WebSocket Error**:
    - Check Frontend Console for the exact `WebSocket error` object details (is it `ERR_CONNECTION_REFUSED` or a closed code?).
    - Check Backend `stt` Service Logs: Does it see the connection attempt at all? If not, it's a network/port mapping issue.
    - **Hypothesis**: The frontend container cannot reach `localhost:8082` if it's running in Docker but the browser is on the host. Wait, the browser IS on the host. `localhost:8082` *should* work if the port is mapped.
    - **Check Docker Compose**: Verify `ports: - "8082:8082"` is correctly set for the `stt` service.

2.  **Investigate "Multiple Connections"**:
    - Confirm if the phantom connections persist after the "Hard Refresh" (Ctrl+Shift+R).

3.  **Verify End-to-End**:
    - Once connection is stable, verify audio binary chunks are reaching Sarvam AI.
