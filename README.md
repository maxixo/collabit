# Live Team Collaborative Text Editor

A full-stack, offline-first collaborative text editor scaffold for real-time teamwork. This repository provides a production-ready foundation with placeholders for CRDT sync, auth, and persistence.

## Features
- Real-time collaboration via WebSockets and CRDT (Yjs) stubs
- Offline-first architecture (IndexedDB + Service Worker placeholders)
- Scalable backend with PostgreSQL
- Docker and Docker Compose for local and production workflows
- Shared types module for client and server

## Tech Stack
- Frontend: React, TypeScript, Vite
- Backend: Express, TypeScript, WebSockets
- CRDT: Yjs (placeholder integration)
- Data: PostgreSQL
- Infra: Docker, Docker Compose

## Local Development (Step by Step)
### Prerequisites
1. Install Node.js LTS (v20+).
2. Install Docker if you want Postgres locally.

### 1) Configure environment
1. Copy the example environment file:
   - `cp .env.example .env`
2. Fill in values in `.env` (at minimum):
   - `DATABASE_URL`
   - `JWT_SECRET`

### 2) Install dependencies
1. From the repo root:
   - `npm install`

### 3) Start infrastructure (Postgres)
Option A: Docker Compose (recommended)
1. Start services:
   - `docker compose up -d postgres`

Option B: Use your own instances
1. Ensure Postgres is reachable.
2. Update `.env` with your connection URLs.

### 4) Run client + server together
1. From the repo root:
   - `npm run dev`
2. Client runs on:
   - `http://localhost:5173/`
3. Server runs on:
   - `http://localhost:4000`

### 5) Run client and server separately (optional)
Client (Vite):
1. `cd client`
2. `npm run dev`

Server (Express):
1. `cd server`
2. `npm run dev`

### 6) Production build (optional)
1. From the repo root:
   - `npm run build`

### Troubleshooting
- If `npm install` fails, retry after clearing npm cache:
  - `npm cache clean --force`

## Offline Demo (Placeholder)
The client includes an IndexedDB wrapper and Service Worker registration stub. Once implemented, you can disconnect your network to verify queued edits are stored locally and replayed on reconnect.

## Architecture Summary
- `client/` hosts the React UI and offline-first scaffolding
- `server/` hosts the API, WebSocket gateway, and collaboration stubs
- `shared/` contains cross-cutting types and event contracts
- `docker/` contains Dockerfiles and Nginx config
- `docs/` contains architectural notes and future design decisions

## Notes
This repository is scaffold-only. TODO markers indicate where business logic and integrations should be implemented.
