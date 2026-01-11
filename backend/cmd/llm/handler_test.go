package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleGenerateTitle_MethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("GET", "/v1/llm/generate_title", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleGenerateTitle)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusMethodNotAllowed)
	}
}

func TestHandleGenerateSummary_MethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("GET", "/v1/llm/generate_summary", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleGenerateSummary)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusMethodNotAllowed)
	}
}
