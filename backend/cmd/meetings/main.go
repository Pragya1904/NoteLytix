package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
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

	// Create Meetings Table
	// users table is assumed to exist from auth service
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS meetings (
			id SERIAL PRIMARY KEY,
			owner_id TEXT REFERENCES users(email),
			created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			recording_url TEXT,
			transcript TEXT,
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
	MeetingID int    `json:"meeting_id"`
	Status    string `json:"status"`
}

type MeetingDetails struct {
	ID        int    `json:"id"`
	OwnerID   string `json:"owner_id"`
	CreatedOn string `json:"created_on"`
	Title     string `json:"title"`
	Transcript string `json:"transcript,omitempty"`
	Summary    string `json:"summary,omitempty"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	initDB()

	// GET Meeting Details
	http.HandleFunc("/meeting/get", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		meetingID := r.URL.Query().Get("id")
		if meetingID == "" {
			http.Error(w, "meeting_id required", http.StatusBadRequest)
			return
		}

		var m MeetingDetails
		var title sql.NullString
		var transcript sql.NullString
		var summary sql.NullString

		// Optimized query: If summary exists, don't fetch full transcript
		err := db.QueryRow(`
			SELECT id, owner_id, created_on, title, 
			       CASE WHEN summary IS NOT NULL AND summary != '' THEN '' ELSE transcript END as transcript_optimized, 
			       summary 
			FROM meetings WHERE id = $1
		`, meetingID).Scan(&m.ID, &m.OwnerID, &m.CreatedOn, &title, &transcript, &summary)

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
		if transcript.Valid { m.Transcript = transcript.String }
		if summary.Valid { m.Summary = summary.String }

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(m)
	})

	// GET Meeting List
	http.HandleFunc("/meeting/list", func(w http.ResponseWriter, r *http.Request) {
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
			if title.Valid { m.Title = title.String }
			meetings = append(meetings, m)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(meetings)
	})

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

		var meetingID int
		err := db.QueryRow(`
			INSERT INTO meetings (owner_id, title) 
			VALUES ($1, $2) 
			RETURNING id
		`, req.UserEmail, tempTitle).Scan(&meetingID)

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

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Meetings Service is healthy"))
	})

	log.Printf("Meetings Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
