# Go Dev Roadmap

## Ringkasan

Target branch `go-dev` adalah membangun ulang `Menet-Tech Dashboard` dengan:
- Go backend
- React frontend
- SQLite database

Roadmap ini dibagi supaya migrasi tidak lompat langsung ke full rewrite tanpa fondasi.

## Fase 0 - Planning dan Scaffolding

Output:
- blueprint final
- architecture decision
- struktur repo
- stack final
- script bootstrap dev

Checklist:
- pilih router Go
- pilih UI stack React
- pilih migration tool
- pilih session strategy
- pilih SQLite driver

## Fase 1 - Core Backend

Output:
- binary Go berjalan
- health endpoint
- config loader
- DB connection SQLite
- migration runner
- auth dasar

Checklist:
- `GET /health`
- `POST /auth/login`
- `POST /auth/logout`
- middleware session
- base repositories

## Fase 2 - Core Frontend

Output:
- React app berjalan
- login page
- app shell
- sidebar
- protected routing

Checklist:
- Vite + TS
- auth state
- API client
- layout dashboard

## Fase 3 - Master Data

Output:
- pelanggan module
- paket module
- template WA module
- settings module

Checklist:
- list/create/edit/delete pelanggan
- list/create/edit/delete paket
- CRUD template WA
- settings form

## Fase 4 - Billing Engine

Output:
- generate tagihan
- daftar tagihan
- detail tagihan
- mark paid
- invoice number
- invoice page

Checklist:
- billing rules configurable
- computed display status
- payment history
- auto WA after payment

## Fase 5 - Scheduler dan Integrasi

Output:
- worker mode
- monthly billing
- reminder before due
- auto limit
- auto backup
- Discord alerts

Checklist:
- worker binary stabil
- lock strategy
- action logs
- retry-safe flows

## Fase 6 - Monitoring dan Hardening

Output:
- monitoring page
- service health snapshot
- audit improvements
- backup history

Checklist:
- WA status
- Discord status
- MikroTik status
- cron/worker status

## Fase 7 - Migration Path dari PHP

Output:
- data migration script
- cutover checklist
- rollback plan

Checklist:
- mapping MySQL ke SQLite
- import pelanggan
- import paket
- import tagihan
- import template
- verify counts

## Prioritas Implementasi

Urutan kerja yang paling aman:

1. Backend skeleton Go
2. Frontend shell React
3. Auth
4. Paket + pelanggan
5. Tagihan + invoice
6. Template WA + settings
7. Scheduler
8. Monitoring
9. Import/migration utilities

## Risiko Utama

### 1. SQLite write contention

Mitigasi:
- WAL mode
- transaction discipline
- background jobs serial

### 2. Rewrite terlalu besar

Mitigasi:
- kirim per modul
- jangan langsung semua fitur

### 3. Business rule drift dari master

Mitigasi:
- dokumentasikan rule di service test
- jadikan current PHP behaviour sebagai reference

### 4. Integrasi MikroTik

Mitigasi:
- abstract interface
- mulai dari stub/test adapter

## Definition of Done Fase MVP

MVP `go-dev` dianggap siap uji internal jika sudah punya:
- login/logout
- dashboard basic
- CRUD pelanggan
- CRUD paket
- generate tagihan
- mark paid
- invoice
- template WA
- settings
- scheduler reminder + limit + billing
- backup manual + auto backup

## Dokumen Terkait

- [BLUEPRINT.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/BLUEPRINT.md)
- [ARCHITECTURE.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/ARCHITECTURE.md)
