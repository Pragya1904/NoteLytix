package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/websocket"
	"notelytix/internal/stt/providers"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev
	},
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

	http.HandleFunc("/v1/stt/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("Upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		// Connect to Sarvam
		sarvam := providers.NewSarvamProvider(apiKey)
		// Note: Context handling and config should be improved for prod
		if err := sarvam.Connect(r.Context(), providers.SarvamConfig{}); err != nil {
			log.Printf("Failed to connect to Sarvam: %v", err)
			conn.WriteMessage(websocket.TextMessage, []byte("Failed to connect to STT provider"))
			return
		}
		defer sarvam.Conn.Close()

		// Channel to receive transcripts from Sarvam
		msgChan := make(chan string)
		go sarvam.ReadLoop(msgChan)

		// Forward transcripts to client
		go func() {
			for transcript := range msgChan {
				log.Printf("Transcript received: %s", transcript)
				if err := conn.WriteJSON(map[string]string{"transcript": transcript}); err != nil {
					log.Printf("Write failed: %v", err)
					return
				}
			}
		}()

		// Read audio from client and send to Sarvam
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Read failed: %v", err)
				break
			}
			
			// Assuming message is binary audio
			if err := sarvam.StreamChunk(r.Context(), message); err != nil {
				log.Printf("Stream failed: %v", err)
				break
			}
		}
	})

	log.Printf("STT Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
