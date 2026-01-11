package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	// DB configuration from environment variables
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Could not open DB:", err)
	}
	defer db.Close()

	// 1. Fetch latest meeting with transcript
	var meetingID uint
	err = db.QueryRow("SELECT id FROM meetings WHERE transcript_url IS NOT NULL AND transcript_url != '' ORDER BY created_on DESC LIMIT 1").Scan(&meetingID)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Fatal("No meetings found in database")
		}
		log.Fatal("Failed to fetch latest meeting:", err)
	}

	fmt.Printf("Found latest meeting ID: %d\n", meetingID)

	// 2. Trigger LLM processing
	llmHost := "llm"
	if h := os.Getenv("LLM_HOST"); h != "" {
		llmHost = h
	}

	payload := map[string]interface{}{
		"meeting_id": meetingID,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		log.Fatal("Failed to marshal payload:", err)
	}

	// Test Title Generation
	titleURL := fmt.Sprintf("http://%s:8084/v1/llm/generate_title", llmHost)
	fmt.Printf("Triggering Title Generation at %s...\n", titleURL)
	resp, err := http.Post(titleURL, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("Failed to send request to Title endpoint: %v", err)
	} else {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		fmt.Printf("Title Response Status: %s\n", resp.Status)
		fmt.Printf("Title Response Body: %s\n", string(respBody))
	}

	// Test Summary Generation
	summaryURL := fmt.Sprintf("http://%s:8084/v1/llm/generate_summary", llmHost)
	fmt.Printf("\nTriggering Summary Generation at %s...\n", summaryURL)
	resp2, err := http.Post(summaryURL, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("Failed to send request to Summary endpoint: %v", err)
	} else {
		defer resp2.Body.Close()
		respBody2, _ := io.ReadAll(resp2.Body)
		fmt.Printf("Summary Response Status: %s\n", resp2.Status)
		fmt.Printf("Summary Response Body: %s\n", string(respBody2))
	}
}
