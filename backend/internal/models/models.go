package models

import (
	"time"

	"github.com/google/uuid"
)

type Person struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	Username  string    `json:"username"`
	Email     string    `json:"email" gorm:"unique"`
	CreatedOn time.Time `json:"created_on"`
}

type Meeting struct {
	ID              uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	OwnerID         uuid.UUID `json:"owner_id"`
	CreatedOn       time.Time `json:"created_on"`
	RecordingURL    string    `json:"recording_url"`
	TranscriptURL   string    `json:"transcript_url"`
	Summary         string    `json:"summary"`
	DurationSeconds int       `json:"duration_seconds"`
	Title           string    `json:"title"`
}

type Participant struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	MeetingID   uuid.UUID `json:"meeting_id"`
	PersonID    *uuid.UUID `json:"person_id"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

type Transcript struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	MeetingID    uuid.UUID `json:"meeting_id"`
	S3Path       string    `json:"s3_path"`
	CreatedOn    time.Time `json:"created_on"`
	ContentShort string    `json:"content_short"`
}

type Summary struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	MeetingID   uuid.UUID `json:"meeting_id"`
	SummaryText string    `json:"summary_text"`
	LLMModel    string    `json:"llm_model"`
	CreatedOn   time.Time `json:"created_on"`
	TokensUsed  int       `json:"tokens_used"`
}
