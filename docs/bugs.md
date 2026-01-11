# Bug Log & Solutions

## 1. Frontend Rendering Issue (Blank Screen)
**Issue:** Frontend was only showing "Made by Pragya" and not the React app.
**Cause:** Opening `index.html` directly or running container without `react-router-dom` compatibility.
**Fix:**
- Updated `Dockerfile` to use `node:20-alpine` (Required for `react-router-dom@7.10.1`).
- Ensured `yarn.lock` is copied and `yarn install` is used.
- Connected frontend to `backend_default` network.

## 2. Backend Connection Refused (Port 8081)
**Issue:** `ERR_CONNECTION_REFUSED` when accessing `localhost:8081`.
**Cause:** `auth` service container was crashing due to missing entries in `go.sum`.
**Fix:**
- Ran `go mod tidy` in `backend/` directory to update dependencies.
- Rebuilt the container.

## 3. Goth "You must select a provider" Error
**Issue:** Google OAuth failed with error "you must select a provider" even when hitting `/auth/google`.
**Cause:** `goth` library requires a `provider` query parameter (e.g., `?provider=google`) to identify the provider if not using its default muxing. Also, `gothic.Store` was not initialized.
**Fix:**
- Initialized `gothic.Store` with `gorilla/sessions`.
- Explicitly injected `?provider=google` into the request `r.URL.RawQuery` inside the `/auth/google` and `/auth/google/callback` handlers.

## 13. Historical Summary Generation Blocked
**Issue:** Clicking "Generate Summary" on a historical meeting failed with "Meeting ID not ready".
**Cause:** `handleGenerateSummary` was only looking for the `meetingId` from the active recording state, which is null for historical meetings.
**Fix:**
- Implemented `GET /meeting/generate_summary/{id}` trigger in the `meetings` service.
- Updated frontend to use the historical ID from `localStorage` and call the new trigger endpoint.
- Added automated polling to detect when the summary is ready.

## 14. Direct Logout Without Confirmation
**Issue:** Clicking the user avatar immediately logged the user out, leading to accidental sign-outs.
**Cause:** `onClick` handler on the Avatar component called `handleSignOut` directly.
**Fix:**
- Converted the Avatar into a `DropdownMenu` trigger.
- Added a "Sign Out" menu item that opens a `Dialog` confirmation.
- Only executes `handleSignOut` after user multi-step confirmation.

## 15. Frontend Build Failure After Refactoring
**Issue:** `ReferenceError` or syntax error in `App.js` preventing the app from loading.
**Cause:** Duplicated `catch` and `finally` blocks were accidentally left in the file during a `multi_replace_file_content` operation.
**Fix:** Cleaned up the `handleGenerateSummary` function to remove redundant code blocks and restore proper syntax.

## 4. Sarvam API Key Configuration
**Issue:** API Key should not be hardcoded.
**Fix:**
- Mapped `${SARVAM_API_KEY}` from `.env` to `docker-compose.yml`.

## 5. Unused Imports in STT Service
**Issue:** Go build failed with `strings` and `time` imported but not used.  
**Fix:** Removed unused imports from `cmd/stt/stt.go`.

## 6. Frontend ReferenceError: useEffect
**Issue:** `ReferenceError: useEffect is not defined` in `useAudioRecorder.js`.  
**Fix:** Added `useEffect` to the named imports from `react`.

## 7. Invalid Email in Meeting Creation
**Issue:** `createMeeting` API call failed with 500 error because `userEmail` was being passed as the WebSocket URL string (`'ws://localhost:8082/v1/stt/ws'`) instead of the actual user email.  
**Cause:** `App.js` was passing a hardcoded WebSocket URL as the argument to `useAudioRecorder` hook.  
**Fix:** 
- Updated `App.js` to decode the JWT from `localStorage` on component initialization.
- Extracted the user's email from the JWT payload and passed it correctly to `useAudioRecorder`.

## 8. Multiple WebSocket Connections & Race Conditions
**Issue:** Multiple WebSocket connections appearing in DevTools Network tab, including:
- Multiple connections to `ws://localhost:443/ws` (Webpack HMR sockets).
- Phantom empty connection to `ws://localhost:8082/v1/stt/ws` with no handshake messages.  
**Cause:** 
- React Strict Mode double-invokes `useEffect` hooks in development, causing `startRecording` to be called multiple times.
- A `useEffect` hook (line 234) was re-binding the `onaudioprocess` event handler on every render, creating stale closures and duplicate processing logic.
- No connection guard to prevent duplicate WebSocket instantiation.  
**Fix:** 
- Added `isConnecting` ref guard to prevent `startRecording` from running multiple times concurrently.
- Removed the problematic `useEffect` that re-bound audio processing on every render.
- Added proper cleanup logic in a `useEffect` unmount handler to close WebSocket and stop audio processing.
- Ensured `flushAudioQueueRef` uses `statusRef` to access the latest connection status from within closures.
## 9. Relation "users" does not exist (Race Condition)
**Issue:** `meetings` service failed to start with `error: relation "users" does not exist`.
**Cause:** `meetings` had a hard Foreign Key constraint on the `users` table, but in Docker, services start in parallel. If `meetings` started before `auth` created the table, it crashed.
**Fix:** Removed strict hardware-level Foreign Key constraint to decouple startup order.

## 10. Network "backend_default" not found
**Issue:** Frontend container failed to start with network error.
**Cause:** Inconsistency between `backend/docker-compose.yml` and `frontend/docker-compose.yml` network naming conventions.
**Fix:** Standardized all services to use a single root `docker-compose.yml` with a unified network.

## 11. Type Mismatch (int vs uint) in Meeting IDs
**Issue:** Build errors in `llm` and `meetings` services: `cannot use (variable of type uint) as int value`.
**Cause:** `models.Meeting` used `uint` for IDs, but some function calls and request structs still expected `int`.
**Fix:** Refactored all backend services to standardise on `uint` for database-mapped IDs.

## 12. Missing Environment Variables in Auth Service
**Issue:** Auth service crashed with `Missing environment variables: GOOGLE_CLIENT_ID...`.
**Cause:** `docker-compose.yml` was not pointing to the `.env` file for the `auth` service.
**Fix:** Added `env_file: - ./backend/.env` to the `auth` service configuration.
