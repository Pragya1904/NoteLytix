package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	audioFile := flag.String("audio", "/app/tests/harvard.wav", "Path to audio file")
	sttURL := flag.String("stt", "ws://stt:8082/v1/stt/ws", "STT WebSocket URL")
	llmURL := flag.String("llm", "http://llm:8084/v1/summary", "LLM API URL")
	flag.Parse()

	// 1. Read Audio File
	audioData, err := os.ReadFile(*audioFile)
	if err != nil {
		log.Fatalf("Failed to read audio file: %v", err)
	}
	log.Printf("Read %d bytes from %s", len(audioData), *audioFile)

	// 2. Connect to STT
	log.Printf("Connecting to STT service at %s...", *sttURL)
	conn, _, err := websocket.DefaultDialer.Dial(*sttURL, nil)
	if err != nil {
		log.Fatalf("Failed to connect to STT: %v", err)
	}
	defer conn.Close()

	// 3. Stream Audio & Collect Transcript
	transcriptChan := make(chan string)
	done := make(chan struct{})

	go func() {
		defer close(done)
		var fullTranscript string
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Read error (might be closed): %v", err)
				break
			}
			
			var resp map[string]string
			if err := json.Unmarshal(message, &resp); err != nil {
				log.Printf("JSON unmarshal error: %v", err)
				continue
			}
			
			if t, ok := resp["transcript"]; ok {
				log.Printf("Received partial: %s", t)
				fullTranscript += t + " "
			}
		}
		transcriptChan <- fullTranscript
	}()

	// Send audio in chunks
	chunkSize := 4096
	for i := 0; i < len(audioData); i += chunkSize {
		end := i + chunkSize
		if end > len(audioData) {
			end = len(audioData)
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, audioData[i:end]); err != nil {
			log.Fatalf("Write failed: %v", err)
		}
		time.Sleep(10 * time.Millisecond) // Simulate real-time
	}
	
	// Give some time for final processing then close
	time.Sleep(2 * time.Second)
	conn.Close()
	
	finalTranscript := <-transcriptChan
	log.Printf("Final Transcript: %s", finalTranscript)

	// Save transcript to file
	if err := os.WriteFile("transcript.txt", []byte(finalTranscript), 0644); err != nil {
		log.Printf("Failed to save transcript: %v", err)
	}

	// 4. Call LLM Service
	log.Printf("Calling LLM service at %s...", *llmURL)
	reqBody, _ := json.Marshal(map[string]string{
		"transcript": finalTranscript,
	})
	
	resp, err := http.Post(*llmURL, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Fatalf("LLM call failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	log.Printf("LLM Response: %s", string(body))
}
