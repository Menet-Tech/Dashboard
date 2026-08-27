# AGENTS.md

**Manifesto & Instructions for AI Agents working in this repository.**

As an AI Agent, your primary goal is to provide the best possible coding output, strictly adhering to the existing source code architecture, industry best practices, and secure coding standards.

## 1. Core Mindset & Philosophy

- **Code Philosophy:** Write minimal code for maximum impact. Do not over-engineer or over-code. Prefer small, targeted changes that fit naturally into the existing architecture.
- **Security First:** Always follow best practices and secure coding standards. Do not log secrets, raw passwords, or real credentials.
- **Understand Before Editing:** Read the relevant code before making any edits. Do not guess behavior across packages. If requirements are ambiguous, assume the scope defined in `TODO.md` or `docs/ROADMAP.md` and propose the most secure and backward-compatible solution.
- **Preserve User Intent:** Never revert unrelated user changes in the working tree. Do not commit generated release bundles unless explicitly requested.

## 2. Graphify First (Knowledge Graph)

Before reading multiple files manually to understand the architecture or locate code, **ALWAYS** use Graphify (`graphify query`, `graphify explain`, or `graphify path`). This saves token usage, time, and provides an accurate contextual subgraph.

```bash
graphify query "<question>"
graphify explain "<concept>"
graphify path "<A>" "<B>"
```

**Knowledge Graph Maintenance:** ALWAYS update Graphify after making any code changes in this session to keep the AST graph current.
```bash
graphify update .
```
*(Dirty `graphify-out/` files are expected after hooks or graph updates.)*

## 3. Branching & Merging

- **Branching Rule:** ALWAYS create a new branch for every new phase, feature, or bug fix.
  - Format: `phase/X-short-description` (for planned phases) or `fix/issue-name` (for bugs).
- **Merging Rule:** Once the code is stable and tested, merge using `--no-ff` (like GitHub merge commits) so the Git graph remains organized, traceable, and historically accurate.

## 4. Documentation Verification

Always update the relevant documentation or checklist (e.g., `docs/UAT_CHECKLIST.md` or a specific Phase Verification Checklist) when introducing new features.
Your updates must comprehensively include:
- **Title**
- **Explanation (Penjelasan)**
- **Testing Steps (Cara Testing)**
- **Expectations (Ekspektasi)**

## 5. Project Map & Business Flow

This project is an ISP billing dashboard. The business flow includes managing customers, generating automated bills via a background worker, sending WhatsApp notifications for due dates, integrating with MikroTik for PPPoE limits, and a Discord bot for alerts.

- `backend/` - Go API, worker, domain services, SQLite migrations.
- `frontend/` - React 19 + TypeScript admin panel (Vite + Tailwind).
- `whatsapp/` - Node.js WhatsApp Gateway service.
- `deploy/` - Local dev scripts, release scripts, systemd units, production installer.
- `docs/` - Architecture, API, deployment, development, roadmap, UAT.
- `graphify-out/` - Local code knowledge graph output.

## 6. Architecture & Conventions

### Backend (Go)
- **Flow Pattern:** `handler` -> `service` -> `repository`.
  - **Handler:** Parses/validates HTTP requests, checks auth/CSRF. **Never contains business logic.**
  - **Service:** Contains all business rules, orchestrates repository calls, state transitions, and notifications.
  - **Repository:** Raw SQL queries to SQLite, returning domain structs. No business logic.
- **Routing:** Register new routes in `backend/internal/http/router/router.go`.
- **Migrations:** Put migrations in `backend/internal/platform/migrate/sql/` with the next numeric prefix. Ensure they are idempotent (`IF NOT EXISTS`).
- **Concurrency:** The API and Worker share the same SQLite database file. Avoid long database transactions around network calls.
- **Testing:** Add or update `*_test.go` to lock behavior, especially when touching billing, worker, queue, auth, notifications, MikroTik, backup, or migrations.

### SQLite Database
- Keep WAL mode enabled.
- Keep a busy timeout configured.
- Avoid unnecessary concurrent writers. Prefer short write operations and release rows/transactions promptly.

### Frontend (React + TS)
- Feature UI belongs in `frontend/src/features/<domain>/`.
- Shared API calls belong in `frontend/src/lib/api.ts`.
- Shared types belong in `frontend/src/types.ts`.
- Prefer existing UI components and styling patterns.

### External Integrations & Worker Rules
- **WhatsApp Gateway:** Default local URL is `http://127.0.0.1:3001` (treat `localhost:3001` as legacy/default).
  - Automatic queue rows must be deduplicated by `bill_id`, `trigger_key`, and `to_number`.
  - Retry limits are per queue row; do not create a new automatic queue row when an equivalent `pending` or `failed` row already exists.
  - If the gateway is offline, queue processing should count the attempt and respect normal throttle behavior.
  - Manual messages may bypass some automatic dedupe rules when explicitly triggered by a user action.
- **MikroTik Integration:** Triggered primarily via background jobs or manual sync in the service layer. Changes to customer status (e.g., to `isolir`) must properly interact with the MikroTik API.

## 7. Build And Test Commands

**Backend:**
```bash
cd backend
go test ./...
```

**Frontend:**
```bash
cd frontend
npm run build
```

**WhatsApp Gateway:**
```bash
cd whatsapp
npm test
```

**Production Release (from Windows):**
```powershell
.\deploy\go-dev\release-windows.ps1
```

## 8. Review Checklist

Before finishing a code change and ending your turn:
- Run the smallest relevant test first.
- Run broader tests when shared behavior changed.
- Check `git diff --check`.
- Confirm no secrets, generated bundles, or unrelated files were added.
- Ensure the changes are minimal but highly impactful.
- Mention any test that could not be run.