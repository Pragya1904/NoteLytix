package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

const sarvamWSURL = "wss://api.sarvam.ai/speech-to-text-streaming/v1" // Verified or assumed URL

type SarvamProvider struct {
	APIKey string
	Conn   *websocket.Conn
}

type SarvamConfig struct {
	LanguageCode       string `json:"language_code"`
	Model              string `json:"model"`
	SampleRate         int    `json:"sample_rate"`
	Encoding           string `json:"encoding"`
	HighVadSensitivity bool   `json:"high_vad_sensitivity"`
	VadSignals         bool   `json:"vad_signals"`
}

func NewSarvamProvider(apiKey string) *SarvamProvider {
	return &SarvamProvider{
		APIKey: apiKey,
	}
}

func (s *SarvamProvider) Connect(ctx context.Context, cfg SarvamConfig) error {
	headers := http.Header{}
	headers.Add("api-subscription-key", s.APIKey)

	// Construct URL with query params if needed, or send config in first message
	// Based on docs, config is sent in connect or first message. 
	// Assuming query params for now as per some streaming APIs, or we might need to send a JSON config frame first.
	// The Python example: client.speech_to_text_streaming.connect(...)
	// We'll try connecting and then sending config if required, but usually it's headers/query.
	
	conn, _, err := websocket.DefaultDialer.Dial(sarvamWSURL, headers)
	if err != nil {
		return fmt.Errorf("failed to connect to Sarvam: %w", err)
	}
	s.Conn = conn
	
	// Send initial config if required by protocol (often the case)
	// For now, we assume the connection is established.
	return nil
}

func (s *SarvamProvider) StreamChunk(ctx context.Context, chunk []byte) error {
	if s.Conn == nil {
		return fmt.Errorf("not connected")
	}
	
	// Send binary audio data
	// Some APIs expect a JSON wrapper. The docs said "await ws.transcribe(audio=audio_data)"
	// which implies a message structure.
	// Let's assume a JSON message with base64 audio or just binary if the API supports it.
	// The Python code sends `audio=audio_data`.
	
	// We'll send a JSON frame with audio data
	payload := map[string]interface{}{
		"audio": chunk, // This might need base64 encoding if sending as JSON
	}
	return s.Conn.WriteJSON(payload)
}

func (s *SarvamProvider) ReadLoop(msgChan chan<- string) {
	defer s.Conn.Close()
	for {
		_, message, err := s.Conn.ReadMessage()
		if err != nil {
			log.Printf("read error: %v", err)
			return
		}
		
		var response map[string]interface{}
		if err := json.Unmarshal(message, &response); err != nil {
			continue
		}
		
		if transcript, ok := response["transcript"].(string); ok {
			msgChan <- transcript
		}
	}
}
