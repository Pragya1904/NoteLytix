# Makefile for NoteLytix Project
# 
# Usage:
#   make run    - Build and start all services (backend + frontend)
#   make stop   - Stop all running containers
#   make build  - Rebuild images without starting
#   make logs   - Follow output logs from all containers
#   make clean  - Stop containers and remove volumes (clean slate)

.PHONY: run stop build logs clean help

# Default target
help:
	@echo "NoteLytix Project Makefile"
	@echo "--------------------------"
	@echo "Usage:"
	@echo "  make run    - Build and start application (docker-compose up --build)"
	@echo "  make stop   - Stop application (docker-compose down)"
	@echo "  make build  - Build images only"
	@echo "  make logs   - View and follow logs"
	@echo "  make clean  - Stop and remove volumes"

# Start the application
run:
	@echo "Starting NoteLytix..."
	docker-compose up --build -d
	@echo "Services started! Backend running on ports 8081-8084, Frontend on 3000."
	@echo "Run 'make logs' to follow output."

# Stop the application
stop:
	@echo "Stopping NoteLytix..."
	docker-compose down

# Build images
build:
	@echo "Building images..."
	docker-compose build

# View logs
logs:
	docker-compose logs -f

# Clean up
clean:
	@echo "Cleaning up..."
	docker-compose down -v
