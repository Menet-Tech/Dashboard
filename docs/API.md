# API Reference — Menet-Tech Dashboard

Base URL: `http://<host>:8080`

## Authentication

- **Method**: Session cookie (`HttpOnly`, `SameSite=Strict`)
- **CSRF**: All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require `X-CSRF-Token` header
- **Token source**: Returned in login response body as `csrf_token`

---

## Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/livez` | Process liveness (returns `ok`) |
| `GET` | `/readyz` | DB readiness (returns `ok` if SQLite connected) |
| `GET` | `/health` | Full health snapshot |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/meta` | App metadata (name, version, environment) |

### POST /api/v1/auth/login

```json
// Request
{ "username": "admin", "password": "yourpassword" }

// Response 200
{
  "data": {
    "id": 1, "username": "admin", "role": "admin",
    "csrf_token": "<token>"
  }
}

// Response 401
{ "error": "invalid credentials" }
```

---

## Protected Endpoints

All require a valid session cookie. All mutating requests also require `X-CSRF-Token`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/auth/me` | Current user info |
| `POST` | `/api/v1/auth/logout` | Logout (invalidates session) |

---

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/dashboard/summary` | Aggregate stats (totals, chart data, aging) |
| `GET` | `/api/v1/dashboard/revenue` | Monthly revenue by period |
| `GET` | `/api/v1/dashboard/aging` | Accounts receivable aging report |

---

### Packages

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/packages` | List all packages |
| `POST` | `/api/v1/packages` | Create package |
| `PUT` | `/api/v1/packages/{id}` | Update package |
| `DELETE` | `/api/v1/packages/{id}` | Delete package (fails if customers assigned) |

Package schema:
```json
{ "id": 1, "name": "Paket 20 Mbps", "speed_mbps": 20, "price": 150000, "description": "" }
```

---

### Customers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/customers` | List all customers |
| `POST` | `/api/v1/customers` | Create customer |
| `PUT` | `/api/v1/customers/{id}` | Update customer |
| `PATCH` | `/api/v1/customers/{id}/status` | Quick status update |

Customer schema:
```json
{
  "id": 1, "name": "Budi Santoso", "package_id": 2, "package_name": "Paket 20 Mbps",
  "user_pppoe": "budi", "whatsapp": "6281234567890", "address": "Jl. Merdeka No. 1",
  "due_day": 8, "status": "active", "sn_ont": "ABC123", "is_trial": false,
  "trial_ends_at": null, "created_at": "2026-01-01T00:00:00Z"
}
```

Status values: `active` | `limit` | `inactive`

---

### Bills

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/bills` | List bills |
| `POST` | `/api/v1/bills/generate` | Generate bills for a period |
| `POST` | `/api/v1/bills/{id}/pay` | Mark bill as paid |
| `GET` | `/api/v1/bills/{id}/invoice` | Render invoice (HTML) |
| `GET` | `/api/v1/bills/{id}/notifications` | WhatsApp notification logs for bill |
| `POST` | `/api/v1/bills/{id}/proof` | Upload payment proof (multipart) |

#### POST /api/v1/bills/generate

```json
// Request
{ "period": "2026-05" }

// Response 200
{ "data": { "generated": 12, "skipped": 3 } }
```

Generate is idempotent — won't create duplicate bills for the same customer+period.

#### Bill schema

```json
{
  "id": 10, "customer_id": 1, "customer_name": "Budi Santoso",
  "invoice_number": "08-05-2026/1/20/001", "period": "2026-05",
  "amount": 150000, "due_date": "2026-05-08",
  "status": "belum_bayar",
  "display_status": "jatuh_tempo",
  "proof_path": null, "created_at": "2026-05-01T00:00:00Z"
}
```

DB status: `belum_bayar` | `lunas`  
Display status (computed): `belum_bayar` | `jatuh_tempo` | `menunggak` | `lunas`

---

### WhatsApp Templates

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/templates` | List templates |
| `POST` | `/api/v1/templates` | Create template |
| `PUT` | `/api/v1/templates/{id}` | Update template |
| `DELETE` | `/api/v1/templates/{id}` | Delete template |

Template schema:
```json
{
  "id": 1, "trigger_key": "reminder_custom",
  "content": "Halo {{nama}}, tagihan Anda periode {{periode}} sebesar {{nominal}} jatuh tempo {{jatuh_tempo}}.",
  "is_active": true
}
```

Valid trigger keys: `reminder_custom` | `jatuh_tempo` | `limit_5hari` | `lunas`

Available placeholders: `{{nama}}`, `{{periode}}`, `{{nominal}}`, `{{jatuh_tempo}}`

---

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Get all settings as key-value map |
| `PUT` | `/api/v1/settings` | Update settings (partial update supported) |

Key settings fields (all strings):

| Key | Description |
|-----|-------------|
| `wa_api_url` | WhatsApp Gateway base URL |
| `wa_api_key` | WA Gateway API key |
| `wa_account_id` | WA account selector |
| `discord_webhook_url` | Discord alert webhook |
| `discord_billing_url` | Discord billing webhook |
| `billing_reminder_days` | Days before due to send reminder (default `3`) |
| `billing_limit_days` | Days after due before limit (default `5`) |
| `billing_menunggak_days` | Days after due for menunggak (default `30`) |
| `billing_auto_enabled` | `true`/`false` — auto billing scheduler |
| `billing_generate_day` | Day of month to generate bills |
| `billing_generate_time` | Time to generate bills (`HH:MM`) |
| `backup_auto_enabled` | `true`/`false` |
| `backup_auto_time` | Daily backup time (`HH:MM`) |
| `backup_retention_count` | Number of backups to retain |
| `mikrotik_host` | MikroTik router IP |
| `mikrotik_user` | MikroTik API username |
| `mikrotik_pass` | MikroTik API password |

---

### Backups

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/backups` | Create manual backup |
| `GET` | `/api/v1/backups` | List available backups |
| `GET` | `/api/v1/backups/{filename}/download` | Download backup file |
| `POST` | `/api/v1/backups/{filename}/restore` | Simulate restore (validation only) |
| `POST` | `/api/v1/backups/staging/apply` | Apply restore (triggers app restart) |

---

### Users (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/users` | List managed users |
| `POST` | `/api/v1/users` | Create user |
| `PUT` | `/api/v1/users/{id}/role` | Update user role |
| `PATCH` | `/api/v1/users/{id}/status` | Activate/deactivate user |
| `POST` | `/api/v1/users/{id}/reset-password` | Reset user password |

Roles: `admin` | `petugas`

---

### Audit Logs (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/audit-logs` | Paginated audit log |

---

## Error Response Format

All errors follow:
```json
{ "error": "human readable message" }
```

Common status codes:
- `400` — validation error or bad request body
- `401` — not authenticated (no session or expired)
- `403` — forbidden (insufficient role or missing CSRF token)
- `404` — resource not found
- `409` — conflict (e.g., duplicate bill for period)
- `429` — rate limited
- `500` — internal server error
