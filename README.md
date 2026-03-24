# Collaborative Editor

This repository contains a full-stack collaborative document editor built with React, Vite, Express, PostgreSQL, Better Auth, and Yjs.

## Phase 1 MVP Surface

- Real document create, edit, star, trash, restore, history, and export flows
- Real-time collaboration transport for shared documents
- Offline cached reads plus queued document and star mutations on reconnect
- Shared-documents workspace view at `/editor/shared`
- Self-service profile editing at `/profile`
- Conflict handling with safe fallbacks:
  - duplicate the local copy
  - download the local copy
  - reload the latest server version

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL

### Environment

Create `.env` from `.env.example` and set:

- `DATABASE_URL`
- `JWT_SECRET`
- `AUTH_SECRET`
- `AUTH_BASE_URL`
- `CORS_ORIGINS`
- `VITE_API_BASE_URL`
- `VITE_WS_URL`

Optional for Google OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

### Quality Checks

```bash
npm run lint
npm run test
npm run build
```

## Architecture Notes

- `client/` contains the React application, offline queueing, local cache, and editor UI.
- `server/` contains the HTTP API, auth integration, PostgreSQL-backed document services, and websocket collaboration server.
- `shared/` contains shared event and type contracts used by client and server.

## Offline Behavior

- Cached documents remain readable while offline.
- Title/content saves queue locally when the network is unavailable.
- Star toggles also queue locally.
- On reconnect, queued document saves collapse to the latest change per document before replay.
- If the server changed while the client was offline, the editor opens a conflict dialog instead of overwriting remote content.

## Workspace Behavior

- The MVP uses one active workspace context at a time.
- Shared documents are documents in that workspace that the current user can access but does not own.
- Workspace labels are loaded from backend data with a safe fallback derived from the workspace id.
