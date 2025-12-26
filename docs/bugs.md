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
