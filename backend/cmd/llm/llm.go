package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"notelytix/internal/llm/prompts"
	"notelytix/internal/llm/providers"
)

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

	for i := 0; i < 5; i++ {
		err = db.Ping()
		if err == nil {
			break
		}
		log.Printf("[LLM] Waiting for database... (%d/5)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("[LLM] Could not connect to database:", err)
	}
	log.Println("[LLM] Database connected")
}

type SummaryRequest struct {
	MeetingID int `json:"meeting_id"`
}

type LLMResponse struct {
	Summary      string `json:"summary"`
	MeetingTitle string `json:"meeting_title"`
}

func cleanJSON(input string) string {
	input = strings.TrimSpace(input)
	input = strings.TrimPrefix(input, "```json")
	input = strings.TrimPrefix(input, "```")
	input = strings.TrimSuffix(input, "```")
	return strings.TrimSpace(input)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	initDB()

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
		// CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req SummaryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.MeetingID == 0 {
			http.Error(w, "meeting_id is required", http.StatusBadRequest)
			return
		}

		// 1. Fetch transcript from DB
		var transcript sql.NullString
		err := db.QueryRow("SELECT transcript FROM meetings WHERE id = $1", req.MeetingID).Scan(&transcript)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Meeting not found", http.StatusNotFound)
			} else {
				log.Printf("DB Error: %v", err)
				http.Error(w, "Internal DB Error", http.StatusInternalServerError)
			}
			return
		}

		if !transcript.Valid || transcript.String == "" {
			http.Error(w, "No transcript available for this meeting yet", http.StatusPreconditionFailed)
			return
		}

		log.Printf("[LLM] Generating summary for Meeting %d (Length: %d characters)", req.MeetingID, len(transcript.String))

		// 2. Generate Summary
		fullPrompt := fmt.Sprintf("%s\n\nTranscript:\n%s", prompts.SummarySystemPrompt, transcript.String)

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		rawResponse, err := gemini.GenerateSummary(ctx, fullPrompt)
		if err != nil {
			log.Printf("Summary generation failed: %v", err)
			http.Error(w, "Failed to generate summary", http.StatusInternalServerError)
			return
		}

		// 3. Parse JSON Response
		cleanedResponse := cleanJSON(rawResponse)
		var llmResp LLMResponse
		if err := json.Unmarshal([]byte(cleanedResponse), &llmResp); err != nil {
			log.Printf("Failed to parse LLM JSON: %v. Raw: %s", err, cleanedResponse)
			// Fallback: If JSON parse fails, treat whole text as summary and use timestamp as title
			llmResp.Summary = rawResponse
			llmResp.MeetingTitle = fmt.Sprintf("Meeting %s", time.Now().Format("2006-01-02"))
		}

		// 4. Update DB
		_, err = db.Exec("UPDATE meetings SET summary = $1, title = $2 WHERE id = $3", 
			llmResp.Summary, llmResp.MeetingTitle, req.MeetingID)
		if err != nil {
			log.Printf("Failed to update DB with summary: %v", err)
			// Return success anyway as client receives data
		}

		log.Printf("[LLM] Summary generated and saved for Meeting %d", req.MeetingID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(llmResp)
	})

	log.Printf("LLM Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
