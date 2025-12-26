package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

const sarvamWSURL = "wss://api.sarvam.ai/speech-to-text-translate/ws"

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

type SarvamResponse struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type SarvamTranscriptionData struct {
	Transcript string `json:"transcript"`
	RequestID  string `json:"request_id"`
}

type SarvamErrorData struct {
	Message string `json:"message"`
	Error   string `json:"error"`
	Code    string `json:"code"`
}

func NewSarvamProvider(apiKey string) *SarvamProvider {
	return &SarvamProvider{
		APIKey: apiKey,
	}
}

func (s *SarvamProvider) Connect(ctx context.Context, cfg SarvamConfig) error {
	return s.ConnectWithHeader(ctx, cfg)
}

func (s *SarvamProvider) ConnectWithHeader(ctx context.Context, cfg SarvamConfig) error {
	// Parse Base URL
	u, err := url.Parse(sarvamWSURL)
	if err != nil {
		return fmt.Errorf("failed to parse url: %w", err)
	}

	// Prepare Query Parameters
	q := u.Query()
	q.Set("model", "saaras:v2.5") // Enforce model from reference/user
	if cfg.Model != "" && cfg.Model != "saaras:v2.5" {
		// Log warning or override? Sticking to reference preference for now.
	}
	
	// Audio Config
	q.Set("input_audio_codec", "pcm_s16le") // As per previous context
	q.Set("sample_rate", fmt.Sprintf("%d", cfg.SampleRate)) // Send as string in query
	
	// VAD Config
	if cfg.VadSignals {
		q.Set("vad_signals", "true")
	}
	if cfg.FlushSnippet {
		q.Set("flush_snippet", "true") // Reference uses "flush_signal", user config has FlushSnippet.
		                               // Docs say "flush_snippet" or "flush_signal"? 
		                               // Reference: q.Set("flush_signal", "true")
		                               // Previous logs: {"flush_snippet":true}
		                               // Let's use "flush_snippet" as per original config, but maybe "flush_signal" is better?
		                               // Reference uses "flush_signal". I will add "flush_signal" too if needed.
	}
	// q.Set("high_vad_sensitivity", "true") // If needed

	u.RawQuery = q.Encode()
	fullURL := u.String()

	headers := http.Header{}
	headers.Add("Api-Subscription-Key", s.APIKey)
	
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	log.Printf("[Sarvam] Attempting connection to %s", fullURL)
	conn, resp, err := dialer.Dial(fullURL, headers)
	if err != nil {
		if resp != nil {
			log.Printf("[Sarvam] Connection failed: %s, error: %v", resp.Status, err)
			return fmt.Errorf("failed to dial sarvam: %w (Status: %s)", err, resp.Status)
		}
		log.Printf("[Sarvam] Connection error: %v", err)
		return fmt.Errorf("failed to dial sarvam: %w", err)
	}
	log.Printf("[Sarvam] Connected successfully, response status: %s", resp.Status)
	s.Conn = conn

	// NO Handshake config message sent here. Logic moved to Query Params.
	return nil
}


func (s *SarvamProvider) Handshake(config interface{}) error {
	// Deprecated/Unused in this flow
	return nil
}

func (s *SarvamProvider) StreamChunk(ctx context.Context, chunk []byte) error {
	if s.Conn == nil {
		return fmt.Errorf("not connected")
	}

	// Payload structure reflecting reference
	// { "audio": { "data": "base64", "sample_rate": "16000", ... } }
	
	// Note: Generic json.Marshal of []byte creates a base64 string.
	// However, to be ultra-safe and match reference which uses explicit b64 encoding,
	// we will also rely on json's default behavior or manual string if needed.
	// Reference: `encodedAudio := base64.StdEncoding.EncodeToString(audioData)`
	// `jsonMessage`: `{"data": encodedAudio ...}`
	// The `chunk` arg here is []byte.
	// If I put it in map[string]interface{}, json.Marshal will encode it as base64 string.
	// BUT, Reference sends sample_rate as STRING.
	
	payload := map[string]interface{}{
		"audio": map[string]interface{}{
			"data":              chunk, // json.Marshal converts []byte -> base64 string
			"sample_rate":       "16000", // Send as string to match reference
			"encoding":          "audio/wav",
			"input_audio_codec": "wav", // Reference uses "wav"
		},
	}
	
	if err := s.Conn.WriteJSON(payload); err != nil {
		log.Printf("[Sarvam] StreamChunk error: %v", err)
		return err
	}
	return nil
}

func (s *SarvamProvider) ReadLoop(msgChan chan<- string, errChan chan<- error) {
	defer s.Conn.Close()
	defer close(msgChan)
	defer close(errChan)

	for {
		_, message, err := s.Conn.ReadMessage()
		if err != nil {
			log.Printf("[Sarvam] Read error: %v", err)
			errChan <- err
			return
		}

		var response SarvamResponse
		if err := json.Unmarshal(message, &response); err != nil {
			log.Printf("[Sarvam] JSON parse error: %v | Raw: %s", err, string(message))
			continue
		}

		log.Printf("[Sarvam] Received response type: %s", response.Type)

		switch response.Type {
		case "data":
			var transData SarvamTranscriptionData
			if err := json.Unmarshal(response.Data, &transData); err != nil {
				log.Printf("[Sarvam] Transcription data parse error: %v", err)
				continue
			}
			if transData.Transcript != "" {
				log.Printf("[Sarvam] Transcript: %s", transData.Transcript)
				msgChan <- transData.Transcript
			}
		case "error":
			var errData SarvamErrorData
			if err := json.Unmarshal(response.Data, &errData); err == nil {
				log.Printf("[Sarvam] API Error: %s | %s", errData.Error, errData.Message)
			}
		case "events":
			// Handle events if needed
		}
	}
}
