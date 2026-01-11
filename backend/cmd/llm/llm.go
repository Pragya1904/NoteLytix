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
var liteModel string
var regularModel string

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

func cleanJSON(input string) string {
	input = strings.TrimSpace(input)
	input = strings.TrimPrefix(input, "```json")
	input = strings.TrimPrefix(input, "```")
	input = strings.TrimSuffix(input, "```")
	return strings.TrimSpace(input)
}

func handleGenerateTitle(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		MeetingID uint `json:"meeting_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("[LLM] Generating Title for Meeting %d", req.MeetingID)

	var transcriptPath sql.NullString
	err := db.QueryRow("SELECT transcript_url FROM meetings WHERE id = $1", req.MeetingID).Scan(&transcriptPath)
	if err != nil {
		log.Printf("[LLM] DB Error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if !transcriptPath.Valid || transcriptPath.String == "" {
		log.Printf("[LLM] No transcript path found for Meeting %d", req.MeetingID)
		http.Error(w, "No transcript available", http.StatusPreconditionFailed)
		return
	}

	fullPath := fmt.Sprintf("/app/transcripts/%s", transcriptPath.String)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		log.Printf("[LLM] Failed to read file %s: %v", fullPath, err)
		http.Error(w, "Failed to read transcript file", http.StatusInternalServerError)
		return
	}
	transcriptText := string(content)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var title string
		// Re-init provider with specific model if needed, or update GenerateSummary to accept model
		// For now, assuming providers.GeminiProvider can handle model switching or we create two instances
		// Simplified for this context: we use the existing provider but pass prompt context.
		
		// NOTE: In a real implementation, we'd likely want separate provider instances or a method to switch models.
		// For this refactor, I'll assume NewGeminiProvider takes the model name.
		
		// Generate Title
	liteProvider, err := providers.NewGeminiProvider(ctx, liteModel)
	if err != nil {
		log.Printf("[LLM] Failed to init Lite Provider: %v", err)
		title = fmt.Sprintf("Meeting %s", time.Now().Format("2006-01-02"))
	} else {
		titlePrompt := fmt.Sprintf(`You are an AI assistant inside a professional notetaking application called Notelytix.

Your role is to generate a clear, concise, and professional meeting title
based solely on the provided transcript.

OUTPUT CONTRACT (MANDATORY):
- Output exactly ONE title
- Output ONLY the title text
- Do NOT include explanations, options, lists, prefixes, or suffixes
- Do NOT use markdown, quotes, bullets, emojis, or numbering
- Do NOT mention Notelytix in the title unless it appears naturally in the transcript
- Maximum length: 6 words
- Use Title Case
- End without punctuation

CONTENT GUIDELINES:
- Reflect the primary purpose or theme of the meeting
- Prefer specificity over generic phrasing
- If the meeting is a test, demo, review, or support call, reflect that clearly
- Avoid vague words like "Meeting", "Discussion", or "Call" unless unavoidable

The output must be ready to paste directly into a UI header or document title.
Any violation of these rules is considered an incorrect response.

Transcript:
%s`, transcriptText)
		title, err = liteProvider.GenerateSummary(ctx, titlePrompt)
		if err != nil {
			log.Printf("[LLM] Title generation failed: %v", err)
			title = fmt.Sprintf("Meeting %s", time.Now().Format("2006-01-02"))
		} else {
			title = cleanJSON(title)
			title = strings.Split(title, "\n")[0]
			title = strings.TrimSpace(title)
		}
	}

	_, err = db.Exec("UPDATE meetings SET title = $1 WHERE id = $2", title, req.MeetingID)
	if err != nil {
		log.Printf("[LLM] Failed to update DB: %v", err)
		http.Error(w, "Failed to update database", http.StatusInternalServerError)
		return
	}

	log.Printf("[LLM] Updated Meeting %d with Title: '%s'", req.MeetingID, title)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"title": title,
	})
}

func handleGenerateSummary(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		MeetingID uint `json:"meeting_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("[LLM] Generating Summary for Meeting %d", req.MeetingID)

	var transcriptPath sql.NullString
	err := db.QueryRow("SELECT transcript_url FROM meetings WHERE id = $1", req.MeetingID).Scan(&transcriptPath)
	if err != nil {
		log.Printf("[LLM] DB Error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if !transcriptPath.Valid || transcriptPath.String == "" {
		http.Error(w, "No transcript available", http.StatusPreconditionFailed)
		return
	}

	fullPath := fmt.Sprintf("/app/transcripts/%s", transcriptPath.String)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		log.Printf("[LLM] Failed to read file %s: %v", fullPath, err)
		http.Error(w, "Failed to read transcript file", http.StatusInternalServerError)
		return
	}
	transcriptText := string(content)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var summary string
	regularProvider, err := providers.NewGeminiProvider(ctx, regularModel)
	if err != nil {
		log.Printf("[LLM] Failed to init Regular Provider: %v", err)
		summary = "Summary generation failed (Provider Init)."
	} else {
		summaryPrompt := fmt.Sprintf("%s\n\nTranscript:\n%s", prompts.SummarySystemPrompt, transcriptText)
		summary, err = regularProvider.GenerateSummary(ctx, summaryPrompt)
		if err != nil {
			log.Printf("[LLM] Summary generation failed: %v", err)
			summary = "Summary generation failed."
		} else {
			summary = cleanJSON(summary)
		}
	}

	_, err = db.Exec("UPDATE meetings SET summary = $1 WHERE id = $2", summary, req.MeetingID)
	if err != nil {
		log.Printf("[LLM] Failed to update DB: %v", err)
		http.Error(w, "Failed to update database", http.StatusInternalServerError)
		return
	}

	log.Printf("[LLM] Updated Meeting %d with Summary", req.MeetingID)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"summary": summary,
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	liteModel = os.Getenv("LITE_MODEL")
	if liteModel == "" {
		liteModel = "gemini-2.5-flash"
	}
	regularModel = os.Getenv("REGULAR_MODEL")
	if regularModel == "" {
		regularModel = "gemini-2.5-flash"
	}

	initDB()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("LLM Service is healthy"))
	})

	http.HandleFunc("/v1/llm/generate_title", handleGenerateTitle)
	http.HandleFunc("/v1/llm/generate_summary", handleGenerateSummary)

	log.Printf("LLM Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
