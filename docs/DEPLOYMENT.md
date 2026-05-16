# Deployment Guide — Menet-Tech Dashboard

## Target Environment

- Ubuntu 22.04 / 24.04 LTS
- Single VPS, single binary deployment
- `systemd` manages API and worker processes
- SQLite as database (file-based, WAL mode)
- No Nginx required for basic deployment; optional for TLS termination

---

## Directory Structure on Server

```
/opt/menettech-go/
  backend/
    menettech-go        ← compiled binary
    .env                ← production environment config
  storage/
    dashboard.db        ← SQLite database
    uploads/            ← proof-of-payment files
    backups/            ← auto + manual backup files
  frontend-dist/        ← built React static assets
```

---

## Build

### Backend

```bash
cd backend
go build -o menettech-go ./cmd/api
```

### Frontend

```bash
cd frontend
npm ci
npm run build
# Copy frontend/dist/ to /opt/menettech-go/frontend-dist/
```

### Full release (binary + frontend + SHA256 checksum)

```bash
chmod +x deploy/go-dev/release.sh
./deploy/go-dev/release.sh
```

---

## Production Installation (Linux)

### Automated installer

```bash
sudo chmod +x deploy/go-dev/install-linux.sh
sudo ./deploy/go-dev/install-linux.sh
```

The installer:
1. Checks Go & Node.js versions
2. Creates `menettech` service user
3. Creates `/opt/menettech-go/` directory structure
4. Builds backend binary and frontend assets
5. Sets up SQLite database
6. Creates `.env` from template
7. Installs and enables systemd units

### Manual installation

```bash
# 1. Create service user
sudo useradd --system --shell /sbin/nologin menettech

# 2. Create directories
sudo mkdir -p /opt/menettech-go/{backend,storage/{uploads,backups},frontend-dist}

# 3. Copy files
sudo cp backend/menettech-go /opt/menettech-go/backend/
sudo cp -r frontend/dist/* /opt/menettech-go/frontend-dist/

# 4. Configure .env
sudo cp backend/.env.example /opt/menettech-go/backend/.env
sudo nano /opt/menettech-go/backend/.env

# 5. Set permissions
sudo chown -R menettech:menettech /opt/menettech-go
```

---

## Environment Configuration (Production)

Minimum required settings in `/opt/menettech-go/backend/.env`:

```bash
APP_ENV=production
HTTP_ADDR=:8080
SQLITE_PATH=/opt/menettech-go/storage/dashboard.db
STORAGE_PATH=/opt/menettech-go/storage
FRONTEND_DIST_PATH=/opt/menettech-go/frontend-dist
SESSION_COOKIE_SECURE=true
BOOTSTRAP_ADMIN_PASSWORD=<strong-random-password>
```

---

## Systemd

Template unit files:
- `deploy/go-dev/menettech-go-api.service`
- `deploy/go-dev/menettech-go-worker.service` (also referenced as `menettech-worker.service` / `menettech-api.service`)

```bash
sudo cp deploy/go-dev/menettech-go-api.service /etc/systemd/system/
sudo cp deploy/go-dev/menettech-go-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now menettech-go-api
sudo systemctl enable --now menettech-go-worker
```

Check status:
```bash
sudo systemctl status menettech-go-api menettech-go-worker
sudo journalctl -u menettech-go-api -f
sudo journalctl -u menettech-go-worker -f
```

---

## Optional: Nginx + TLS

```nginx
upstream menettech {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name dashboard.example.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://menettech;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

SSL with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.example.com
```

---

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `/livez` | Process liveness (is the process running?) |
| `/readyz` | Database readiness (is DB connected?) |
| `/health` | Full snapshot: worker, scheduler, backup, integrations, alerts |

Smoke test (run after deployment):
```bash
chmod +x deploy/go-dev/smoke.sh
./deploy/go-dev/smoke.sh http://127.0.0.1:8080
```

---

## Go-Live Checklist

- [ ] Build backend and frontend from the release commit
- [ ] Change bootstrap admin password
- [ ] Set `SESSION_COOKIE_SECURE=true`
- [ ] Verify `FRONTEND_DIST_PATH` points to built React assets
- [ ] Ensure `/opt/menettech-go/storage/` is writable by the service user
- [ ] `cd backend && go test ./... -timeout 120s` passes
- [ ] `cd frontend && npm run build` passes
- [ ] `GET /livez`, `GET /readyz`, `GET /health` all return 200
- [ ] Login as admin
- [ ] Create a backup and verify it
- [ ] Start worker and confirm `last_heartbeat` updates in `/health`
- [ ] Scheduler shows `next_run`, `last_attempt`, no `last_error`
- [ ] Login as petugas (operator account)
- [ ] Test full billing flow: generate → mark paid → invoice
- [ ] `./deploy/go-dev/smoke.sh` passes
- [ ] No critical alerts in Monitoring tab

---

## Data Migration (Legacy PHP/MySQL → Go/SQLite)

Run on maintenance window only.

### Dry run (validate without writing)

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=true \
go run ./cmd/api import
```

### Real import

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=false \
go run ./cmd/api import
```

Output: JSON summary per table (`read`, `upserted`, `skipped`, `errors`).

### Table Mappings

| Legacy (MySQL) | Go-dev (SQLite) | Notes |
|----------------|-----------------|-------|
| `kecepatan` | `speed_mbps` | Package speed field renamed |
| `nomor_wa` / `no_wa` | `whatsapp` | Customer WA number |
| `tgl_jatuh_tempo` | `due_day` | Integer day-of-month |
| `trigger` | `trigger_key` | Template trigger key |
| `template` | `content` | Template body |
| `no_invoice` | `invoice_number` | Bill invoice number |
| `bukti_bayar` | `proof_path` | Payment proof file path |

### Validation After Import

1. Compare row counts per table: source vs. target
2. Login as admin in go-dev
3. Check customer and bill lists
4. Test one full mark-paid + invoice + notification flow
5. Create backup and verify

---

## Rollback Procedures

### Rollback Binary (bad code release)

**Prerequisite**: previous binary saved as `api.prev` and `worker.prev`

```bash
sudo systemctl stop menettech-api menettech-worker

cd /opt/menettech/dashboard
sudo cp api api.broken
sudo cp api.prev api
sudo cp worker.prev worker

sudo systemctl start menettech-api menettech-worker
sudo systemctl status menettech-api menettech-worker
curl -s http://localhost:8080/api/v1/health
```

### Rollback Database (restore from backup)

> ⚠️ **Data after the backup will be lost.** Create a snapshot of the current DB first.

#### Via API (preferred)

```bash
# 1. List available backups
curl -s -b session.cookie -H "X-CSRF-Token: $CSRF" \
  http://localhost:8080/api/v1/backups

# 2. Simulate restore (read-only validation)
BACKUP_FILE="dashboard_2026-05-12_02-00-00.db"
curl -s -X POST -b session.cookie -H "X-CSRF-Token: $CSRF" \
  "http://localhost:8080/api/v1/backups/$BACKUP_FILE/restore"

# 3. Apply restore (triggers systemd restart automatically)
curl -s -X POST -b session.cookie -H "X-CSRF-Token: $CSRF" \
  "http://localhost:8080/api/v1/backups/staging/apply"
```

#### Manual (if API is unreachable)

```bash
sudo systemctl stop menettech-api menettech-worker

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sudo cp /opt/menettech-go/storage/dashboard.db \
        /opt/menettech-go/storage/dashboard.db.broken_$TIMESTAMP

BACKUP_FILE="dashboard_2026-05-12_02-00-00.db"
sudo cp /opt/menettech-go/storage/backups/$BACKUP_FILE \
        /opt/menettech-go/storage/dashboard.db

sudo systemctl start menettech-api menettech-worker
curl -s http://localhost:8080/api/v1/health
```

### Rollback Checklist

- [ ] `GET /health` returns 200
- [ ] Login succeeds
- [ ] Customer and bill lists load
- [ ] `./deploy/go-dev/smoke.sh` passes
- [ ] Notify team and create incident report

### Schema Migration Failure

```bash
# Check error
sudo journalctl -u menettech-api -n 100 --no-pager

# Restore backup from before migration was applied
# Then rollback binary to the version without that migration
```

---

## Incident Runbook

### Worker stale / heartbeat delayed

```bash
systemctl status menettech-go-worker
journalctl -u menettech-go-worker -n 200 --no-pager
# Check worker_lock_owner and worker_lock_until in Settings if needed
sudo systemctl restart menettech-go-worker
```

### Auto backup not running

```bash
# Check settings: backup_auto_enabled, backup_auto_time, backup_retention_count
# Check storage is writable
ls -la /opt/menettech-go/storage/backups/
# Trigger manual backup from Monitoring tab, then Verify
```

### WA/Discord/MikroTik integration pending

```bash
# Check Settings tab for missing config
curl -s http://localhost:8080/health | python3 -m json.tool | grep integrations
# Review 'alerts' section of /health for specific failure messages
```

---

## Soak Test Plan (Pre-Production Worker Validation)

Minimum duration: **72 hours** (ideal: 7 days).

### Environment Setup

- OS: Ubuntu 22.04 LTS (staging)
- Copy production `.env`, Discord pointing to test channel
- `BACKUP_AUTO_ENABLED=1`, `BACKUP_AUTO_TIME=02:00`
- `worker_interval_seconds=60` for faster cycle observation (reset to default for real production)
- `systemd` restart policy: `always` with `RestartSec=5`

### Metrics to Monitor

| Metric | How to Check | Threshold |
|--------|-------------|-----------|
| Memory (RSS) | `ps aux` / `top` | < 100 MB |
| CPU (worker) | `top` | < 5% average |
| Last heartbeat | `GET /health` | < 2 min ago |
| Daily backup | `ls storage/backups/` | 1 file/day |
| Duplicate bills | SQL query | 0 |
| Discord flood | Check channel | < 5 notif/hr idle |
| Service restarts | `systemctl status` | 0 in 72h |

### Observation Schedule

| Time | Activity |
|------|----------|
| T+0 | Start worker, note PID and timestamp |
| T+1h | Check logs, heartbeat, memory |
| T+12h | Check logs, verify overnight backup ran |
| T+24h | Full metrics check |
| T+48h | Full metrics check, verify no restarts |
| T+72h | Final check — promote to production if all OK |

### Monitoring Commands

```bash
# Heartbeat check
curl -s http://staging-host:8080/health | python3 -m json.tool

# Restart count
systemctl show menettech-worker --property=NRestarts

# Memory
ps -o pid,rss,vsz,cmd -p $(pgrep -f 'worker$')

# Latest backups
ls -lhrt /opt/menettech-go/storage/backups/ | tail -5

# Recent errors
sudo journalctl -u menettech-worker --since "24 hours ago" | grep -i error
```

### Pass Criteria (72 hours)

- [ ] No unexpected service restarts
- [ ] Memory stable (not growing continuously)
- [ ] Daily backup present for each day
- [ ] No duplicate bills
- [ ] Heartbeat always updated
- [ ] No undiagnosed Discord error alerts

### If Soak Test Fails

1. Record failure time and conditions
2. Collect goroutine dump if needed: `kill -SIGABRT <pid>`
3. Save logs: `sudo journalctl -u menettech-worker -n 10000 > soak_failure.log`
4. Root-cause analysis before production deployment
