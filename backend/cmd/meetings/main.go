package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"notelytix/internal/models"
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
		log.Printf("Waiting for database... (%d/5)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("Could not connect to database:", err)
	}

	// Wait for users table (defined by auth service) to ensure FK integrity
	for i := 0; i < 30; i++ {
		var exists bool
		err = db.QueryRow("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')").Scan(&exists)
		if err == nil && exists {
			log.Println("Users table found, proceeding with schema initialization.")
			break
		}
		log.Printf("Waiting for users table... (%d/30)", i+1)
		time.Sleep(2 * time.Second)
	}

	// Create Meetings Table
	// users table MUST exist from auth service now
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS meetings (
			id SERIAL PRIMARY KEY,
			owner_id TEXT REFERENCES users(email),
			created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			recording_url TEXT,
			transcript_url TEXT,
			summary TEXT,
			title TEXT
		)
	`)
	if err != nil {
		log.Printf("Warning: Failed to create meetings table: %v", err)
	}

	// Migration: Ensure title column exists
	_, err = db.Exec(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title TEXT`)
	if err != nil {
		log.Printf("Warning: Failed to add title column: %v", err)
	}

	log.Println("Database initialized and meetings table checked")
}

// Request structs
type CreateMeetingRequest struct {
	UserEmail string `json:"user_email"`
}

type GetMeetingRequest struct {
	MeetingID string `json:"meeting_id"` // Can be passed as query param too
}

// Response structs
type CreateMeetingResponse struct {
	MeetingID uint   `json:"meeting_id"`
	Status    string `json:"status"`
}

// MeetingDetails is a composite response for the frontend
type MeetingDetails struct {
	ID         uint   `json:"id"`
	OwnerID    string `json:"owner_id"`
	CreatedOn  string `json:"created_on"`
	Title      string `json:"title"`
	Transcript string `json:"transcript,omitempty"`
	Summary    string `json:"summary,omitempty"`
}

func handleGetMeetingDetail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathID := strings.TrimPrefix(r.URL.Path, "/meeting/")
	if pathID == "" || strings.Contains(pathID, "/") {
		http.Error(w, "meeting_id required", http.StatusBadRequest)
		return
	}

	var m MeetingDetails
	var title sql.NullString
	var transcriptURL sql.NullString
	var summary sql.NullString

	err := db.QueryRow(`
		SELECT id, owner_id, created_on, title, transcript_url, summary 
		FROM meetings WHERE id = $1
	`, pathID).Scan(&m.ID, &m.OwnerID, &m.CreatedOn, &title, &transcriptURL, &summary)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Meeting not found", http.StatusNotFound)
		} else {
			log.Printf("DB Error: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}

	if title.Valid { m.Title = title.String }
	if summary.Valid { m.Summary = summary.String }
	
	if transcriptURL.Valid && transcriptURL.String != "" {
		filepath := fmt.Sprintf("/app/transcripts/%s", transcriptURL.String)
		content, err := os.ReadFile(filepath)
		if err == nil {
			m.Transcript = string(content)
		} else {
			log.Printf("Warning: Failed to read transcript file %s: %v", filepath, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func handleGenerateSummaryTrigger(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathID := strings.TrimPrefix(r.URL.Path, "/meeting/generate_summary/")
	if pathID == "" || strings.Contains(pathID, "/") {
		http.Error(w, "meeting_id required", http.StatusBadRequest)
		return
	}

	meetingID, err := strconv.ParseUint(pathID, 10, 32)
	if err != nil {
		http.Error(w, "Invalid meeting_id", http.StatusBadRequest)
		return
	}

	// 1. Verify meeting exists and has transcript
	var transcriptURL sql.NullString
	err = db.QueryRow("SELECT transcript_url FROM meetings WHERE id = $1", meetingID).Scan(&transcriptURL)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Meeting not found", http.StatusNotFound)
		} else {
			log.Printf("DB Error: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}

	if !transcriptURL.Valid || transcriptURL.String == "" {
		http.Error(w, "No transcript available for this meeting. Cannot generate summary.", http.StatusBadRequest)
		return
	}

	// 2. Trigger LLM Service (Async-ish from frontend perspective as it returns success immediately)
	go func() {
		client := &http.Client{Timeout: 30 * time.Second}
		payload := map[string]interface{}{
			"meeting_id": meetingID,
		}
		jsonBody, _ := json.Marshal(payload)
		
		llmURL := "http://llm:8084/v1/llm/generate_summary"
		if h := os.Getenv("LLM_SERVICE_URL"); h != "" {
			llmURL = h
		}

		resp, err := client.Post(llmURL, "application/json", bytes.NewBuffer(jsonBody))
		if err != nil {
			log.Printf("[Meetings] Failed to call LLM service: %v", err)
			return
		}
		defer resp.Body.Close()
		log.Printf("[Meetings] Triggered summary for %d. Status: %s", meetingID, resp.Status)
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "triggered",
		"message": "Summary generation started in background",
	})
}

func handleListMeetings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	userEmail := r.URL.Query().Get("user_email")
	if userEmail == "" {
		http.Error(w, "user_email required", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(`
		SELECT id, title, created_on 
		FROM meetings 
		WHERE owner_id = $1 
		ORDER BY created_on DESC
	`, userEmail)
	if err != nil {
		log.Printf("DB List Error: %v", err)
		http.Error(w, "Failed to fetch meetings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var meetings []MeetingDetails // reusing struct for simplicity, though could use a lighter one
	for rows.Next() {
		var m MeetingDetails
		var title sql.NullString
		if err := rows.Scan(&m.ID, &title, &m.CreatedOn); err != nil {
			log.Printf("Row Scan Error: %v", err)
			continue
		}
		if title.Valid {
			m.Title = title.String
		} else {
			m.Title = "Untitled meeting" // Default title if null
		}
		meetings = append(meetings, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meetings)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	if os.Getenv("DATABASE_URL") == "" {
		os.Setenv("DATABASE_URL", "postgres://user:password@postgres:5432/notelytix?sslmode=disable")
	}

	initDB()

	// GET Meeting Details - Path Parameter Version
	http.HandleFunc("/meeting/", handleGetMeetingDetail)

	// GET Meeting List
	http.HandleFunc("/meeting/list", handleListMeetings)

	// GET Trigger Summary Generation for Historical Meeting
	http.HandleFunc("/meeting/generate_summary/", handleGenerateSummaryTrigger)

	http.HandleFunc("/meeting/create", func(w http.ResponseWriter, r *http.Request) {
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

		var req CreateMeetingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.UserEmail == "" {
			http.Error(w, "user_email is required", http.StatusBadRequest)
			return
		}


		// Use timestamp as temporary title
		tempTitle := time.Now().Format("Meeting 2006-01-02 15:04")

		m := models.Meeting{
			OwnerID: req.UserEmail,
			Title:   tempTitle,
		}

		var meetingID uint
		err := db.QueryRow(`
			INSERT INTO meetings (owner_id, title) 
			VALUES ($1, $2) 
			RETURNING id
		`, m.OwnerID, m.Title).Scan(&meetingID)

		if err != nil {
			log.Printf("Failed to create meeting: %v", err)
			http.Error(w, "Failed to create meeting", http.StatusInternalServerError)
			return
		}

		resp := CreateMeetingResponse{
			MeetingID: meetingID,
			Status:    "active",
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// UPDATE Meeting (Title)
	http.HandleFunc("/meeting/update", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPatch {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			MeetingID uint   `json:"meeting_id"`
			Title     string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.MeetingID == 0 || req.Title == "" {
			http.Error(w, "meeting_id and title are required", http.StatusBadRequest)
			return
		}

		_, err := db.Exec("UPDATE meetings SET title = $1 WHERE id = $2", req.Title, req.MeetingID)
		if err != nil {
			log.Printf("Failed to update meeting title: %v", err)
			http.Error(w, "Failed to update meeting", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Meetings Service is healthy"))
	})

	log.Printf("Meetings Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
