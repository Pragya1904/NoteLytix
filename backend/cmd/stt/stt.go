package main

	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
	"notelytix/internal/stt/providers"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev
	},
}

// Inbound Event Types
const (
	EventStartMeeting  = "start_meeting"
	EventPauseMeeting  = "pause_meeting"
	EventResumeMeeting = "resume_meeting"
	EventEndMeeting    = "end_meeting"
	EventKeepAlive     = "keep_alive"
	// Binary messages are implicitly audio chunks
)

// Outbound Event Types
const (
	EventConnectingSTT  = "connecting_stt"
	EventConnectedSTT   = "connected_stt"
	EventTranscribedText = "transcribed_text"
	EventPong           = "keep_alive" // Echo back
	EventError          = "error"
)

type ControlMessage struct {
	Event     string `json:"event"`
	MeetingID int    `json:"meeting_id,omitempty"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	apiKey := os.Getenv("SARVAM_API_KEY")
	if apiKey == "" {
		log.Fatal("SARVAM_API_KEY is required")
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("STT Service is healthy"))
	})

	// Route: /v1/stt/ws/{user_email} -- meeting_id is now in start_meeting event payload
	// User originally planned URL path params for email/callid, but protocol says:
	// "once the recorder hits record button... call backend to create meeting... get meeting_id... 
	// ... then backend connects... internal websocket created... start_meeting event sent"
	//
	// We will keep endpoint generic: /v1/stt/ws
	// And rely on the initial "start_meeting" event to identify session context.

	http.HandleFunc("/v1/stt/ws", func(w http.ResponseWriter, r *http.Request) {
		frontendConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("[STT] Upgrade failed: %v", err)
			return
		}
		defer frontendConn.Close()

		log.Println("[STT] Frontend connected")

		var (
			sarvam     *providers.SarvamProvider
			sarvamMu   sync.Mutex
			isConnected bool
		)

		// Helper to send JSON event to frontend
		sendEvent := func(event string, payload map[string]interface{}) {
			if payload == nil {
				payload = make(map[string]interface{})
			}
			payload["event"] = event
			if err := frontendConn.WriteJSON(payload); err != nil {
				log.Printf("[STT] Write failed: %v", err)
			}
		}

		// Connect Sarvam Helper
		connectSarvam := func() error {
			sarvamMu.Lock()
			defer sarvamMu.Unlock()

			if isConnected && sarvam != nil {
				return nil // Already connected
			}

			sendEvent(EventConnectingSTT, nil)

			s := providers.NewSarvamProvider(apiKey)
			config := providers.SarvamConfig{
				Model:        "saaras:v1",
				SampleRate:   16000,
				Encoding:     "linear16",
				VadSignals:   true,
				FlushSnippet: true,
			}

			// Add timeout or context?
			// Using request context might be cancelled if WS closes? 
			// Let's use background context for the upstream connection itself but tie closer to loop.
			if err := s.ConnectWithHeader(r.Context(), config); err != nil {
				log.Printf("[STT] Failed to connect to Sarvam: %v", err)
				sendEvent(EventError, map[string]interface{}{"error": "Failed to connect to STT provider"})
				return err
			}

			sarvam = s
			isConnected = true
			sendEvent(EventConnectedSTT, nil)
			log.Println("[STT] Connected to Sarvam")

			// Start Read Loop
			msgChan := make(chan string)
			errChan := make(chan error)
			
			go s.ReadLoop(msgChan, errChan)

			// Reader Handler Routine
			go func() {
				for {
					select {
					case transcript, ok := <-msgChan:
						if !ok {
							return // Channel closed
						}
						log.Printf("[STT] Transcript: %s", transcript)
						sendEvent(EventTranscribedText, map[string]interface{}{
							"text": transcript,
						})
					case err := <-errChan:
						log.Printf("[STT] Sarvam Error: %v", err)
						// Should we disconnect?
						// Sarvam closed connection.
						// Update state
						sarvamMu.Lock()
						isConnected = false
						sarvam = nil
						sarvamMu.Unlock()
						// Notify frontend?
						return
					}
				}
			}()

			return nil
		}

		// Disconnect Sarvam Helper
		disconnectSarvam := func() {
			sarvamMu.Lock()
			defer sarvamMu.Unlock()
			if sarvam != nil && isConnected {
				// Close connection
				if sarvam.Conn != nil {
					sarvam.Conn.Close()
				}
				sarvam = nil
				isConnected = false
				log.Println("[STT] Disconnected Sarvam (Paused)")
			}
		}

		// Main Internal Loop (Frontend -> Backend)
		for {
			mt, message, err := frontendConn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[STT] Frontend disconnected: %v", err)
				}
				break
			}

			if mt == websocket.BinaryMessage {
				// Audio Data
				sarvamMu.Lock()
				if isConnected && sarvam != nil {
					// StreamChunk will encode to Base64 and send JSON
					if err := sarvam.StreamChunk(r.Context(), message); err != nil {
						log.Printf("[STT] Failed to stream: %v", err)
					}
				}
				sarvamMu.Unlock()

			} else if mt == websocket.TextMessage {
				// Control Message (JSON)
				var control ControlMessage
				if err := json.Unmarshal(message, &control); err != nil {
					log.Printf("[STT] Check Control Msg Parse Error: %v", err)
					continue
				}

				switch control.Event {
				case EventStartMeeting:
					log.Printf("[STT] Event: start_meeting (ID: %d)", control.MeetingID)
					// Handshake Start
					connectSarvam()

				case EventPauseMeeting:
					log.Println("[STT] Event: pause_meeting")
					disconnectSarvam()
				
				case EventResumeMeeting:
					log.Println("[STT] Event: resume_meeting")
					connectSarvam()

				case EventEndMeeting:
					log.Println("[STT] Event: end_meeting")
					disconnectSarvam()
					// Should we close frontend connection? Usually yes.
					frontendConn.Close()
					return

				case EventKeepAlive:
					// user requested: "event 4: keep_alive --> frontend must send... backend must send back..."
					// Actually docs said: "event 2: keep_alive (ping message)" outbound
					sendEvent(EventPong, nil)

				default:
					log.Printf("[STT] Unknown Event: %s", control.Event)
				}
			}
		}
	})

	log.Printf("STT Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
