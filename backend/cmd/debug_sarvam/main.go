package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"time"
	"io"

	"notelytix/internal/stt/providers"
)

func main() {
	// 1. Setup
	apiKey := os.Getenv("SARVAM_API_KEY")
	if apiKey == "" {
		// Hardcode fallback for testing if env not set in shell
		apiKey = "sk_0cjogqsp_zKNGlV7gIKD3QOMOGyh5g0Ti" 
	}
	
	logger := log.New(os.Stdout, "[DebugSarvam] ", log.LstdFlags)
	logger.Printf("Starting debug test with API Key: %s...", apiKey[:5])

	provider := providers.NewSarvamProvider(apiKey)
	
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	go func() {
		<-c
		cancel()
	}()

	// 2. Connect
	config := providers.SarvamConfig{
		Model:      "saaras:v2.5",
		SampleRate: 16000,
		VadSignals: true,
	}
	
	logger.Println("Connecting to Sarvam...")
	if err := provider.Connect(ctx, config); err != nil {
		logger.Fatalf("Connection failed: %v", err)
	}
	logger.Println("Connected!")

	// 3. Start Reading Responses
	msgChan := make(chan string)
	errChan := make(chan error)
	go provider.ReadLoop(msgChan, errChan)

	go func() {
		for {
			select {
			case msg, ok := <-msgChan:
				if !ok { return }
				logger.Printf("TRANSCRIPT RECEIVED: %s", msg)
			case err, ok := <-errChan:
				if !ok { return }
				logger.Printf("ERROR RECEIVED: %v", err)
			case <-ctx.Done():
				return
			}
		}
	}()

	// 4. Read Audio File and Stream
	audioFile := "../tests/test_audio.pcm"
	// Check if exists
	if _, err := os.Stat(audioFile); os.IsNotExist(err) {
		logger.Fatalf("Audio file not found: %s", audioFile)
	}

	f, err := os.Open(audioFile)
	if err != nil {
		logger.Fatalf("Failed to open audio file: %v", err)
	}
	defer f.Close()

	// Read all into buffer
	audioData, err := io.ReadAll(f)
	if err != nil {
		logger.Fatalf("Failed to read audio file: %v", err)
	}
	logger.Printf("Loaded audio file (%d bytes)", len(audioData))

	// Loop to test persistence
	logger.Println("Starting audio stream loop (Press Ctrl+C to stop)...")
	
	chunkSize := 8000 // 0.25s at 16k 16bit mono
	
	// We will loop the file content 3 times to verify persistence
	for i := 0; i < 3; i++ {
		logger.Printf("=== Loop %d ===", i+1)
		
		for offset := 0; offset < len(audioData); offset += chunkSize {
			if ctx.Err() != nil {
				return
			}

			end := offset + chunkSize
			if end > len(audioData) {
				end = len(audioData)
			}
			
			chunk := audioData[offset:end]
			if err := provider.StreamChunk(ctx, chunk); err != nil {
				logger.Printf("Failed to stream chunk: %v", err)
				return
			}
			
			// Simulate real-time streaming
			time.Sleep(250 * time.Millisecond)
		}
		
		logger.Println("--- File Finished, waiting 2s ---")
		time.Sleep(2 * time.Second)
	}
	
	logger.Println("Test completed. Waiting a bit for final responses...")
	time.Sleep(5 * time.Second)
}
