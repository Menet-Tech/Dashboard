# AGENTS.md

Instructions for AI coding agents working in this repository.

## First Principles

- Prefer small, targeted changes that match the existing architecture.
- Read the relevant code before editing; do not guess across packages.
- Never revert unrelated user changes in this working tree.
- Do not commit generated release bundles unless explicitly requested.
- Do not log secrets or real credentials.
- Use tests to lock behavior when touching billing, worker, queue, auth, notifications, MikroTik, backup, or migrations.

## Project Map

- `backend/` - Go API, worker, domain services, SQLite migrations.
- `frontend/` - React + TypeScript admin panel.
- `whatsapp/` - Node.js WhatsApp Gateway service.
- `deploy/` - local dev scripts, release scripts, systemd units, production installer.
- `docs/` - architecture, API, deployment, development, roadmap, UAT.
- `graphify-out/` - local code knowledge graph output.
- `Releases/` and release archives - generated artifacts; avoid touching unless release work requires it.

## Graphify

Use Graphify for codebase questions when `graphify-out/graph.json` exists.

```bash
graphify query "<question>"
graphify explain "<concept>"
graphify path "<A>" "<B>"
```

After code changes:

```bash
graphify update .
```

Dirty `graphify-out/` files are expected after hooks or graph updates.

## Build And Test

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

Production release from Windows:

```powershell
.\deploy\go-dev\release-windows.ps1
```

## Backend Conventions

- Keep the existing flow: handler -> service -> repository.
- Register new routes in `backend/internal/http/router/router.go`.
- Put migrations in `backend/internal/platform/migrate/sql/` with the next numeric prefix.
- Keep migrations idempotent where practical with `IF NOT EXISTS` or safe guards.
- Add or update `*_test.go` for behavioral changes.
- Use `log/slog` for production logging.
- Avoid long database transactions around network calls.
- Be careful with SQLite concurrency. The API and worker share the same database file.

## Frontend Conventions

- Feature UI belongs in `frontend/src/features/<domain>/`.
- Shared API calls belong in `frontend/src/lib/api.ts`.
- Shared types belong in `frontend/src/types.ts`.
- Prefer existing UI components and styling patterns.
- Run `npm run build` for frontend changes.

## WhatsApp And Worker Rules

- Local WhatsApp Gateway default should be `http://127.0.0.1:3001`.
- Treat `http://localhost:3001` as a legacy/default value when resolving settings.
- Automatic WhatsApp queue rows must be deduplicated by `bill_id`, `trigger_key`, and `to_number`.
- Retry limits are per queue row; do not create a new automatic queue row when an equivalent `pending` or `failed` row already exists.
- If the gateway is offline, queue processing should count the attempt and respect normal throttle behavior.
- Manual messages may bypass some automatic dedupe rules when explicitly triggered by a user action.

## SQLite Notes

- Keep WAL mode enabled.
- Keep a busy timeout configured.
- Avoid unnecessary concurrent writers.
- Prefer short write operations and release rows/transactions promptly.

## Deployment Notes

- Production systemd units live in `deploy/production/`.
- Development helpers live in `deploy/go-dev/`.
- Release output usually goes under `deploy/go-dev/dist/` or `Releases/`.
- Do not edit production server paths directly from this repo; update scripts or config templates instead.

## Review Checklist

Before finishing a code change:

- Run the smallest relevant test first.
- Run broader tests when shared behavior changed.
- Check `git diff --check`.
- Confirm no secrets, generated bundles, or unrelated files were added.
- Mention any test that could not be run.