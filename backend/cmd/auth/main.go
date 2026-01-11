package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/sessions"
	_ "github.com/lib/pq"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/google"
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

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email TEXT UNIQUE NOT NULL,
			name TEXT,
			provider TEXT,
			provider_id TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal("Failed to create users table:", err)
	}
	log.Println("Database initialized and connected")
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	callbackURL := "http://localhost:8081/auth/google/callback"
	jwtSecret := os.Getenv("JWT_TOKEN")

	if clientID == "" || clientSecret == "" || jwtSecret == "" {
		log.Fatal("Missing environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or JWT_TOKEN")
	}

	key := os.Getenv("SESSION_SECRET")
	if key == "" {
		key = "random_secret_key_change_me_in_prod"
	}
	maxAge := 86400 * 30 
	isProd := false 

	store := sessions.NewCookieStore([]byte(key))
	store.MaxAge(maxAge)
	store.Options.Path = "/"
	store.Options.HttpOnly = true 
	store.Options.Secure = isProd

	gothic.Store = store

	goth.UseProviders(
		google.New(clientID, clientSecret, callbackURL),
	)

	initDB()

	http.HandleFunc("/auth/google", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[Auth] Starting Google OAuth flow. RemoteAddr: %s", r.RemoteAddr)
		
		// Inject provider into query parameters for Goth
		q := r.URL.Query()
		q.Add("provider", "google")
		r.URL.RawQuery = q.Encode()

		if user, err := gothic.CompleteUserAuth(w, r); err == nil {
			log.Printf("[Auth] User already authenticated: %s", user.Email)
		} else {
			gothic.BeginAuthHandler(w, r)
		}
	})

	http.HandleFunc("/auth/google/callback", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[Auth] Callback received from Google")
		
		// Inject provider into query parameters for Goth callback as well
		q := r.URL.Query()
		q.Add("provider", "google")
		r.URL.RawQuery = q.Encode()

		user, err := gothic.CompleteUserAuth(w, r)
		if err != nil {
			log.Printf("[Auth] Google Auth Failed: %v", err)
			fmt.Fprintln(w, err)
			return
		}
		log.Printf("[Auth] User authenticated: %s (%s)", user.Email, user.UserID)

		// Use shared User model
		u := models.User{
			Email:      user.Email,
			Name:       user.Name,
			Provider:   user.Provider,
			ProviderID: user.UserID,
		}

		// Insert or update user in DB
		_, err = db.Exec(`
			INSERT INTO users (email, name, provider, provider_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (email) DO UPDATE SET 
				name = EXCLUDED.name,
				provider = EXCLUDED.provider,
				provider_id = EXCLUDED.provider_id
		`, u.Email, u.Name, u.Provider, u.ProviderID)

		if err != nil {
			http.Error(w, "Failed to save user", http.StatusInternalServerError)
			log.Printf("DB Error: %v", err)
			return
		}

		// Create JWT
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"email": user.Email,
			"exp":   time.Now().Add(time.Hour * 24).Unix(),
		})

		tokenString, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			http.Error(w, "Failed to generate token", http.StatusInternalServerError)
			return
		}

		// Redirect to frontend with token
		http.Redirect(w, r, "http://localhost:3000?token="+tokenString, http.StatusFound)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Auth Service is healthy"))
	})

	// DEBUG: Create User Endpoint (For Integration Tests)
	http.HandleFunc("/debug/create_user", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Provider string `json:"provider"`
			UserID   string `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid body", http.StatusBadRequest)
			return
		}

		u := models.User{
			Email:      req.Email,
			Name:       req.Name,
			Provider:   req.Provider,
			ProviderID: req.UserID,
		}

		_, err := db.Exec(`
			INSERT INTO users (email, name, provider, provider_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (email) DO NOTHING
		`, u.Email, u.Name, u.Provider, u.ProviderID)
		
		if err != nil {
			log.Printf("Debug Create User Failed: %v", err)
			http.Error(w, "Failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	log.Printf("Auth Service starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
