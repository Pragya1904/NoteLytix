package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
	"notelytix/internal/stt/providers"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev
	},
}

var db *sql.DB

func initDB() {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}

	// Retry loop for DB connection
	for i := 0; i < 5; i++ {
		err = db.Ping()
		if err == nil {
			break
		}
		log.Printf("[STT] Waiting for database... (%d/5)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("[STT] Could not connect to database:", err)
	}
	log.Println("[STT] Database connected")
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

	initDB()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("STT Service is healthy"))
	})

	// Route: /v1/stt/ws
	http.HandleFunc("/v1/stt/ws", func(w http.ResponseWriter, r *http.Request) {
		frontendConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("[STT] Upgrade failed: %v", err)
			return
		}
		defer frontendConn.Close()

		log.Println("[STT] Frontend connected")

		var (
			sarvam          *providers.SarvamProvider
			sarvamMu        sync.Mutex
			isConnected     bool
			currentMeetingID int
			fullTranscript  strings.Builder
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
				Model:        "saaras:v2.5",
				SampleRate:   16000,
				Encoding:     "audio/wav",
				VadSignals:   true,
				FlushSnippet: true,
			}

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
						
						// Accumulate transcript
						sarvamMu.Lock()
						if fullTranscript.Len() > 0 {
							fullTranscript.WriteString(" ")
						}
						fullTranscript.WriteString(transcript)
						sarvamMu.Unlock()

						sendEvent(EventTranscribedText, map[string]interface{}{
							"text": transcript,
						})
					case err := <-errChan:
						log.Printf("[STT] Sarvam Error: %v", err)
						// Update state
						sarvamMu.Lock()
						isConnected = false
						sarvam = nil
						sarvamMu.Unlock()
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
				// sarvamMu.Lock() - Avoid locking for just logging if perf matters, but safer
				sarvamMu.Lock()
				if isConnected && sarvam != nil {
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
					currentMeetingID = control.MeetingID
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
					
					// Save Transcript to DB
					if currentMeetingID != 0 {
						finalTranscript := fullTranscript.String()
						if finalTranscript != "" {
							log.Printf("[STT] Saving transcript for Meeting %d (Length: %d)", currentMeetingID, len(finalTranscript))
							_, err := db.Exec("UPDATE meetings SET transcript = $1 WHERE id = $2", finalTranscript, currentMeetingID)
							if err != nil {
								log.Printf("[STT] Failed to save transcript: %v", err)
							} else {
								log.Println("[STT] Transcript saved successfully")
							}
						}
					}

					frontendConn.Close()
					return

				case EventKeepAlive:
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
