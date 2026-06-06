# Current Progress

Tanggal update: 2026-06-06, Asia/Jakarta.

## Fokus Terakhir

Menyelesaikan seluruh backlog `docs/bug_fix.md` untuk area backend, frontend, worker, dan WhatsApp gateway.

## Status

- `BUG-001` sampai `BUG-016` di `docs/bug_fix.md` sudah dikerjakan.
- Artefak worker temporary sudah dihapus.
- Socket.IO WhatsApp sudah memakai API key auth.
- Database WhatsApp gateway sudah memakai path deterministik via `WA_DB_PATH` atau default `whatsapp/storage/wa_gateway.db`.
- Scheduled WhatsApp messages sudah persisten di SQLite dan direstore saat startup.
- Health check WhatsApp sudah memakai setting dashboard.
- Upload bukti bayar sudah menolak oversize/truncated upload dan validasi tipe file.
- Button/list WhatsApp sudah menyimpan `account_id` dan emit realtime event.
- UI WhatsApp sudah punya error banner, retry, dan confirmation modal standar.
- Settings backend sudah whitelist key.
- Delete account WhatsApp sudah membersihkan folder session secara aman.
- Worker standby lease sudah punya test agar tidak exit diam-diam.
- Frontend sudah lazy-load halaman berat, bundle utama turun di bawah warning Vite.
- Trace ID sudah dipasang di backend, gateway WhatsApp, dan frontend error handling.
- Coverage WhatsApp gateway naik signifikan dengan test tambahan untuk database, events, client, chatbot, ISP adapter, dan WhatsApp service.

## Verifikasi Terakhir

- `go test ./...` di `backend/`: lulus.
- `npm run build` di `frontend/`: lulus.
- `.\node_modules\.bin\jest.cmd --runInBand --forceExit --cacheDirectory .jest-cache` di `whatsapp/`: lulus, `16` suites, `88` tests, coverage `73.64% lines`.

## Catatan Lanjutan

- Target coverage production ideal tetap `>=80%`; saat ini coverage sudah jauh lebih baik dari baseline `54.1%`, tetapi masih bisa dinaikkan dengan test tambahan untuk controllers media/groups/contacts/accounts dan file handler.
- Worktree masih berisi banyak perubahan dari beberapa batch sebelumnya. Jangan revert perubahan user atau perubahan lama yang belum distage.
