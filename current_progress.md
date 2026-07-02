# Current Progress

## 2026-06-30

- Fixed system monitoring status showing `unknown`:
  - Exposed `/health`, `/livez`, and `/readyz` endpoints under public `/api/v1` group in Go backend router.
  - Changed frontend api.ts `fetchHealth` endpoint to request `/api/v1/health` instead of `/health` so Nginx reverse proxies it correctly in production.
  - Recompiled and packaged binaries into `Releases.zip`.

## 2026-06-09

- Fixed network map authentication mismatch:
  - Frontend mapping API calls now use dashboard session routes under `/api/v1/...` instead of legacy `/api/...` GACS-token routes.
  - Backend exposes dashboard-session map settings and mapping data routes for logged-in users/staff/admin.
- Hardened network map rendering against invalid Leaflet coordinates/zoom values to prevent infinite tile loading.
- Expanded integration checks:
  - `/api/v1/integration/check` now checks WhatsApp, Discord, MikroTik, and GenieACS.
  - `/health` now includes GenieACS configured/online status in the integration payload.
  - Monitoring page displays GenieACS beside WhatsApp/Discord/MikroTik and refreshes statuses after "Check Integrasi".

## Verification To Run

- `go test ./...` from `backend/`
- `npm run build` from `frontend/`
