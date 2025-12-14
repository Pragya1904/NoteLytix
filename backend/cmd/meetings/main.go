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
			summary TEXT
		)
	`)
	if err != nil {
		// It might fail if users table doesn't exist yet (race condition), but auth runs first usually.
		// Or if we run meetings independently.
		log.Printf("Warning: Failed to create meetings table (might be due to missing users table): %v", err)
	} else {
		log.Println("Database initialized and meetings table checked")
	}
}

// Request struct
type CreateMeetingRequest struct {
	UserEmail string `json:"user_email"`
}

// Response struct
type CreateMeetingResponse struct {
	MeetingID int    `json:"meeting_id"`
	Status    string `json:"status"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	initDB()

	http.HandleFunc("/meeting/create", func(w http.ResponseWriter, r *http.Request) {
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

		var req CreateMeetingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.UserEmail == "" {
			http.Error(w, "user_email is required", http.StatusBadRequest)
			return
		}

		var meetingID int
		err := db.QueryRow(`
			INSERT INTO meetings (owner_id) 
			VALUES ($1) 
			RETURNING id
		`, req.UserEmail).Scan(&meetingID)

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
