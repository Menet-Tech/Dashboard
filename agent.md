# Menet-Tech Dashboard Agent Guide

## Project Context

Menet-Tech Dashboard is an ISP billing dashboard with:

- Go backend API and worker in `backend/`
- React + TypeScript frontend in `frontend/`
- Node.js WhatsApp Gateway in `whatsapp/`
- SQLite as the main application database
- Production deployment scripts and systemd units in `deploy/`

The app manages customers, packages, billing, WhatsApp reminders, payment confirmations, MikroTik sync, Discord notifications, backups, and monitoring.

## Use Graphify First

This project has a knowledge graph in `graphify-out/`.

For codebase questions:

- Run `graphify query "<question>"` before broad source browsing when `graphify-out/graph.json` exists.
- Use `graphify path "<A>" "<B>"` for relationships between concepts or files.
- Use `graphify explain "<concept>"` for focused architecture or implementation context.
- Dirty `graphify-out/` files are expected after hooks or updates.
- After code changes, run `graphify update .` to refresh the graph.

## Common Commands

Backend:

```bash
cd backend
go test ./...
```

Frontend:

```bash
cd frontend
npm run build
```

WhatsApp Gateway:

```bash
cd whatsapp
npm test
```

Production package:

```powershell
.\deploy\go-dev\release-windows.ps1
```

## Important Runtime Notes

- The backend and worker share SQLite, so avoid patterns that create unnecessary concurrent writes.
- SQLite should stay in WAL mode with a busy timeout.
- WhatsApp Gateway local default should resolve to IPv4 loopback, `http://127.0.0.1:3001`, while still treating `http://localhost:3001` as a legacy default.
- Automatic WhatsApp notifications must be deduplicated by `bill_id`, `trigger_key`, and `to_number`.
- Queue retry limits apply per queue row. Do not create new rows repeatedly for the same automatic notification when prior `pending` or `failed` rows exist.
- If WhatsApp Gateway is offline, worker processing should not spin in a tight 2-second loop for normal send failures.

## Code Style

- Follow existing package structure and naming.
- Keep changes small and close to the bug or feature being handled.
- Prefer tests around backend behavior when changing billing, queue, worker, notification, or auth flows.
- Do not revert unrelated user changes in this working tree.
- Keep generated release artifacts out of normal feature diffs unless explicitly requested.

## Recent Bug Context

A production issue showed repeated WhatsApp queue rows for the same phone number when the gateway was offline. The fix belongs in the queue layer, not only deployment config:

- Prevent duplicate automatic queue inserts for the same `bill_id + trigger_key + to_number`.
- Skip already-existing duplicate queue rows before sending.
- Treat transport send failures as processed queue attempts so worker throttle is respected.

