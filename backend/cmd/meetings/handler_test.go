package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestListMeetingsHandler_ErrorNoEmail tests that the handler returns 400 when no email is provided.
func TestListMeetingsHandler_ErrorNoEmail(t *testing.T) {
	req, err := http.NewRequest("GET", "/meeting/list", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleListMeetings)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusBadRequest)
	}
}

// TestGetMeetingDetailHandler_ErrorNoId tests that the handler returns 400 when no ID is in path.
func TestGetMeetingDetailHandler_ErrorNoId(t *testing.T) {
	req, err := http.NewRequest("GET", "/meeting/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleGetMeetingDetail)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusBadRequest)
	}
}
