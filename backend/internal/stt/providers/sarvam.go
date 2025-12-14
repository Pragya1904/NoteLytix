package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

const sarvamWSURL = "wss://api.sarvam.ai/speech-to-text-streaming/v1"

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
	FlushSnippet       bool   `json:"flush_snippet"`
}

func NewSarvamProvider(apiKey string) *SarvamProvider {
	return &SarvamProvider{
		APIKey: apiKey,
	}
}

func (s *SarvamProvider) Connect(ctx context.Context, cfg SarvamConfig) error {
	// Sarvam connection requires no headers for auth, usually config is sent first.
	// But let's check if API key is header based or payload based.
	// Common Sarvam pattern: connect, then send config.
	// Let's assume standard behavior but with error checking.
	
	dialer := websocket.DefaultDialer
	conn, _, err := dialer.Dial(sarvamWSURL, nil)
	if err != nil {
		return fmt.Errorf("failed to dial sarvam: %w", err)
	}
	s.Conn = conn

	// Prepare Config Payload
	// Sarvam expects: {"config": {...}}
	configPayload := map[string]interface{}{
		"config": map[string]interface{}{
			"model":                cfg.Model,
			"sample_rate_hertz":    cfg.SampleRate,
			"encoding":             cfg.Encoding,
			"vad":                  cfg.VadSignals, // vad=true usually enables VAD
			"flush_snippet":        cfg.FlushSnippet,
			// "language_code":    cfg.LanguageCode, // Optional or Saaras handles it
		},
	}
	
	// Add API Key? Sarvam usually requires an API key header or in payload?
	// Docs often specify header 'api-subscription-key' OR 'Authorization'.
	// Let's re-dial with header just in case, as most APIs require it.
	
	return s.Handshake(configPayload)
}

func (s *SarvamProvider) ConnectWithHeader(ctx context.Context, cfg SarvamConfig) error {
	headers := http.Header{}
	headers.Add("api-subscription-key", s.APIKey)
	
	dialer := websocket.DefaultDialer
	conn, _, err := dialer.Dial(sarvamWSURL, headers)
	if err != nil {
		return fmt.Errorf("failed to dial sarvam: %w", err)
	}
	s.Conn = conn

	// Prepare Config Payload
	configPayload := map[string]interface{}{
		"config": map[string]interface{}{
			"model":                cfg.Model,
			"sample_rate_hertz":    cfg.SampleRate,
			"encoding":             cfg.Encoding,
			"vad":                  cfg.VadSignals,
			"flush_snippet":        cfg.FlushSnippet,
		},
	}
	
	return s.Handshake(configPayload)
}


func (s *SarvamProvider) Handshake(config interface{}) error {
	if err := s.Conn.WriteJSON(config); err != nil {
		return fmt.Errorf("failed to send config: %w", err)
	}
	// Wait for confirmation? Usually streaming APIs just accept it.
	return nil
}

func (s *SarvamProvider) StreamChunk(ctx context.Context, chunk []byte) error {
	if s.Conn == nil {
		return fmt.Errorf("not connected")
	}

	// chunk IS ALREADY BASE64 ENCODED in this design?
	// Request said: "backend must encode it to base64"
	// So input here is raw bytes, we encode it.
	// Go's WriteJSON with []byte automatically base64 encodes it.
	
	payload := map[string]interface{}{
		"audio": chunk, // json.Marshal sees []byte -> results in base64 string
	}
	return s.Conn.WriteJSON(payload)
}

func (s *SarvamProvider) ReadLoop(msgChan chan<- string, errChan chan<- error) {
	defer s.Conn.Close()
	defer close(msgChan)
	defer close(errChan)

	// Ping/Pong handler can be added here if needed

	for {
		_, message, err := s.Conn.ReadMessage()
		if err != nil {
			log.Printf("[Sarvam] Read error: %v", err)
			errChan <- err
			return
		}

		var response map[string]interface{}
		if err := json.Unmarshal(message, &response); err != nil {
			log.Printf("[Sarvam] JSON parse error: %v", err)
			continue
		}

		// Check for transcript
		if results, ok := response["results"].([]interface{}); ok && len(results) > 0 {
			if first, ok := results[0].(map[string]interface{}); ok {
				if transcript, ok := first["transcript"].(string); ok && transcript != "" {
					msgChan <- transcript
				}
			}
		} else if Transcript, ok := response["transcript"].(string); ok && Transcript != "" {
			// Some APIs return direct transcript field
			msgChan <- Transcript
		}
	}
}
