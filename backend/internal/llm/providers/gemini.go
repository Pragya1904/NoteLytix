package providers

import (
	"context"
	"fmt"
	"log"
	"os"

	"google.golang.org/genai"
)

type GeminiProvider struct {
	Client *genai.Client
	Model  string
}

func NewGeminiProvider(ctx context.Context, model string) (*GeminiProvider, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY not set")
	}

	client, err := genai.NewClient(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	if model == "" {
		model = "gemini-2.5-flash"
	}

	return &GeminiProvider{
		Client: client,
		Model:  model,
	}, nil
}

func (g *GeminiProvider) GenerateSummary(ctx context.Context, transcript string) (string, error) {
	prompt := fmt.Sprintf("Please summarize the following meeting transcript:\n\n%s", transcript)
	
	result, err := g.Client.Models.GenerateContent(
		ctx,
		g.Model,
		genai.Text(prompt),
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("failed to generate content: %w", err)
	}

	return result.Text(), nil
}
