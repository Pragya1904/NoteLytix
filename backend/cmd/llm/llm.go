package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"notelytix/internal/llm/prompts"
	"notelytix/internal/llm/providers"
)

type SummaryRequest struct {
	Transcript string `json:"transcript"`
}

type SummaryResponse struct {
	Summary string `json:"summary"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	ctx := context.Background()
	gemini, err := providers.NewGeminiProvider(ctx, "")
	if err != nil {
		log.Fatalf("Failed to initialize Gemini provider: %v", err)
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("LLM Service is healthy"))
	})

	http.HandleFunc("/v1/summary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req SummaryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Transcript == "" {
			http.Error(w, "Transcript is required", http.StatusBadRequest)
			return
		}

		// Combine system prompt with user transcript
		fullPrompt := fmt.Sprintf("%s\n\nTranscript:\n%s", prompts.SummarySystemPrompt, req.Transcript)

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		summary, err := gemini.GenerateSummary(ctx, fullPrompt)
		if err != nil {
			log.Printf("Summary generation failed: %v", err)
			http.Error(w, "Failed to generate summary", http.StatusInternalServerError)
			return
		}

		resp := SummaryResponse{Summary: summary}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	log.Printf("LLM Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
