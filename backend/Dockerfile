# Backend Dockerfile
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binaries
RUN go build -o /bin/auth ./cmd/auth
RUN go build -o /bin/stt ./cmd/stt/stt.go
RUN go build -o /bin/meetings ./cmd/meetings
RUN go build -o /bin/llm ./cmd/llm/llm.go

# Development stage with Air for hot reload
FROM golang:1.24-alpine AS dev
WORKDIR /app
RUN apk add --no-cache git
COPY . .
RUN go mod download

# Production stage
FROM alpine:latest AS prod
WORKDIR /app
COPY --from=builder /bin/auth /app/auth
COPY --from=builder /bin/stt /app/stt
COPY --from=builder /bin/meetings /app/meetings
COPY --from=builder /bin/llm /app/llm
# Entrypoint needs to be specified at runtime or via separate images
