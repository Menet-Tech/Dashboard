# Bug Fix Backlog - Dashboard ISP

Tanggal audit: 2026-05-30, Asia/Jakarta.

Ruang lingkup audit: `backend/`, `frontend/`, `backend/internal/worker`, dan `whatsapp/`.

Verifikasi baseline yang sudah dijalankan:
- Backend: `go test ./...` di `backend/` lulus.
- Frontend: `npm run build` di `frontend/` lulus, tetapi Vite memberi warning bundle `569.25 kB` lebih besar dari batas rekomendasi `500 kB`.
- WhatsApp gateway: seluruh Jest suite lulus, `10` suites dan `58` tests, tetapi coverage total masih rendah sekitar `54.1% lines`.

Status penyelesaian terbaru: 2026-06-06, Asia/Jakarta.
- Semua item `BUG-001` sampai `BUG-016` sudah dikerjakan.
- Backend: `go test ./...` di `backend/` lulus.
- Frontend: `npm run build` di `frontend/` lulus; bundle utama sudah turun dari sekitar `569 kB` menjadi sekitar `493 kB` dan warning Vite hilang.
- WhatsApp gateway: Jest lulus, `16` suites dan `88` tests.
- Coverage WhatsApp gateway naik dari sekitar `54.1% lines` menjadi `73.64% lines`; modul runtime penting sudah jauh lebih aman: `database.js` `97.7% lines`, `events.js` `87.17% lines`, `client.js` `81.91% lines`, `chatbot.service.js` `67.76% lines`.
- Catatan lanjutan: target coverage production ideal tetap `>=80%`, tetapi bug coverage rendah pada modul runtime utama sudah dimitigasi signifikan dan tidak lagi berada di kondisi awal yang rawan.

## Status Bug

| ID | Status | Ringkasan Perbaikan |
| --- | --- | --- |
| BUG-001 | Selesai | File artefak worker dihapus. |
| BUG-002 | Selesai | Socket.IO WhatsApp memakai API key auth dan CORS diketatkan via env. |
| BUG-003 | Selesai | Database gateway memakai `WA_DB_PATH` atau default absolut `storage/wa_gateway.db`. |
| BUG-004 | Selesai | Scheduled WhatsApp messages dipersist ke SQLite dan direstore saat startup. |
| BUG-005 | Selesai | Health check WhatsApp memakai setting dashboard `wa_gateway_url`. |
| BUG-006 | Selesai | Upload bukti bayar membaca `maxSize + 1`, menolak oversize, dan validasi content type. |
| BUG-007 | Selesai | Button/list message menyimpan `account_id` dan emit realtime `chat_message`. |
| BUG-008 | Selesai | UI WhatsApp menampilkan error banner dan tombol retry saat gateway gagal. |
| BUG-009 | Selesai | Aksi destruktif WhatsApp memakai confirmation modal standar. |
| BUG-010 | Selesai | Settings backend memakai whitelist key dan menolak key asing. |
| BUG-011 | Selesai | Delete account WhatsApp menghapus session folder secara aman. |
| BUG-012 | Selesai | Validasi schedule bulanan diperketat: day `1-28`, time `HH:mm`, cron divalidasi. |
| BUG-013 | Selesai | Ditambah test worker standby tetap hidup saat lease dipegang worker lain. |
| BUG-014 | Selesai | Frontend lazy-load halaman berat dan bundle utama turun di bawah warning threshold. |
| BUG-015 | Selesai | Ditambah test database, events, client, chatbot, ISP adapter, dan outbound WhatsApp service. |
| BUG-016 | Selesai | Trace ID dipasang end-to-end di backend, gateway, dan frontend error handling. |

Catatan penting untuk AI agent:
- Jangan revert perubahan user yang sudah ada di worktree.
- Prioritaskan bug P0/P1 dulu sebelum polishing.
- Setelah setiap batch, jalankan verifikasi minimal: `go test ./...`, `npm run build`, dan Jest gateway terkait.
- Beberapa item di bawah tidak selalu membuat test gagal, tetapi berisiko di production karena terkait keamanan, data persistence, operasional worker, atau multi-account WhatsApp.

## Ringkasan Prioritas

| ID | Prioritas | Area | Bug | Dampak |
| --- | --- | --- | --- | --- |
| BUG-001 | P0 | Repo/Backend | Ada file artefak `backend/internal/worker/worker.go.<angka>` | Bisa ikut terbaca tooling, membingungkan audit, dan berpotensi ke-commit |
| BUG-002 | P0 | WhatsApp | Socket.IO gateway tanpa auth dan CORS default `*` | QR/chat realtime bisa diakses client tidak sah |
| BUG-003 | P0 | WhatsApp | Database gateway memakai path relatif `wa_gateway.db` | Data bisa pindah lokasi tergantung working directory systemd |
| BUG-004 | P0 | WhatsApp | Scheduled messages hanya in-memory | Jadwal hilang saat restart/crash |
| BUG-005 | P1 | Backend Health | Health check WhatsApp mengabaikan setting `wa_gateway_url` | Monitoring bisa salah status jika URL di dashboard bukan env |
| BUG-006 | P1 | Backend Upload | Upload bukti bayar dapat truncate file jika `header.Size` tidak akurat | Bukti bayar rusak/parsial tetapi dianggap sukses |
| BUG-007 | P1 | WhatsApp | Button/List message history tidak menyimpan `account_id` dan tidak emit socket | Riwayat multi-account salah/tidak realtime |
| BUG-008 | P1 | Frontend WhatsApp | Error load gateway hanya `console.error` | Operator tidak tahu gateway gagal dimuat |
| BUG-009 | P1 | Frontend WhatsApp | Aksi destruktif masih pakai `window.confirm` | UX tidak konsisten dan sulit diaudit/disable pending |
| BUG-010 | P1 | Backend Settings | Endpoint settings menerima key arbitrer | Typo/setting asing tersimpan dan sulit dilacak |
| BUG-011 | P1 | WhatsApp | Account delete tidak menghapus session folder browser | Kredensial WA tertinggal di disk |
| BUG-012 | P1 | WhatsApp | Validasi scheduled cron belum ketat | Input tanggal/jam invalid bisa membuat cron error/runtime tidak stabil |
| BUG-013 | P1 | Worker | Lease standby baru diperbaiki di working tree, perlu test integrasi | Risiko regress worker standby exit diam-diam |
| BUG-014 | P2 | Frontend | Bundle utama terlalu besar | Dashboard terasa lambat di perangkat kecil |
| BUG-015 | P2 | WhatsApp | Coverage gateway rendah di modul chatbot/whatsapp/client/events | Bug runtime WA sulit tertangkap test |
| BUG-016 | P2 | Backend/Frontend | Error observability belum punya trace-id end-to-end | Debug production lambat |

---

## Detail Bug dan Cara Perbaikan

### BUG-001 - File artefak `worker.go.<angka>` masih ada

Prioritas: P0

Area: Backend / repository hygiene

Lokasi:
- `backend/internal/worker/worker.go.2561703095461800631`

Gejala:
- `rg` menemukan file `worker.go.2561703095461800631`.
- File ini tampak seperti artefak temporary dari proses edit/format.

Dampak:
- Agent atau tooling bisa membaca file ini sebagai source bayangan.
- Bisa ikut ter-commit dan membuat reviewer bingung.
- Bisa membuat audit bug menghasilkan false positive.

Solusi terbaik:
1. Pastikan file bukan perubahan penting dengan membandingkan terhadap `backend/internal/worker/worker.go`.
2. Jika hanya artefak, hapus file tersebut.
3. Tambahkan ignore pattern untuk artefak Go temporary jika belum ada, misalnya `backend/**/*.go.[0-9]*` sudah ada di `.gitignore`, jadi cukup pastikan file tidak ter-track.

Verifikasi:
- `git status --short` tidak lagi menampilkan file artefak.
- `rg "worker.go\\." backend/internal/worker` tidak menemukan artefak.

---

### BUG-002 - Socket.IO WhatsApp gateway tanpa autentikasi

Prioritas: P0

Area: WhatsApp gateway security

Lokasi:
- `whatsapp/src/server.js`
- `frontend/src/hooks/useWhatsAppGateway.ts`

Gejala:
- Socket.IO dibuat dengan CORS `origin: '*'`.
- Client frontend connect tanpa API key atau token.
- Event sensitif seperti `qr_code`, `chat_message`, `account_status`, dan `account_removed` dikirim global.

Dampak:
- Pihak tidak sah di jaringan yang sama dapat subscribe QR login WhatsApp.
- Riwayat chat dan nomor pelanggan bisa bocor.
- Ini sangat kritis untuk production.

Solusi terbaik:
1. Tambahkan auth middleware Socket.IO:
   - Client mengirim token via `auth: { apiKey }` atau header jika memungkinkan.
   - Server validasi token sama dengan `API_KEY`.
2. Batasi CORS ke origin dashboard yang sah:
   - Pakai `CORS_ORIGIN` wajib di production.
   - Jangan default `*` saat `NODE_ENV=production`.
3. Ubah frontend `useWhatsAppGateway` agar menerima `apiKey` dan mengirimnya saat connect.
4. Batasi event broadcast berdasarkan role/account jika nanti gateway dipakai multi-tenant.

Verifikasi:
- Test Socket.IO tanpa auth ditolak.
- Test Socket.IO dengan API key valid bisa menerima event.
- Manual test QR tetap tampil di dashboard.

---

### BUG-003 - Path database WhatsApp gateway relatif terhadap working directory

Prioritas: P0

Area: WhatsApp gateway persistence/deployment

Lokasi:
- `whatsapp/src/utils/database.js`

Gejala:
- Database dibuka dengan `new Database('wa_gateway.db')`.
- Saat systemd menjalankan service dari working directory berbeda, file DB bisa dibuat di lokasi lain.

Dampak:
- Data akun WhatsApp, auto-reply, contact form, dan history bisa terlihat hilang setelah restart/deploy.
- Backup/restore sulit karena lokasi DB tidak deterministik.

Solusi terbaik:
1. Tambahkan env `WA_DB_PATH`.
2. Jika env kosong, default ke path absolut berbasis project:
   - `path.join(__dirname, '../../storage/wa_gateway.db')` atau `path.join(__dirname, '../wa_gateway.db')` sesuai struktur yang dipilih.
3. Buat directory jika belum ada.
4. Update deployment docs dan systemd env.

Verifikasi:
- Jalankan gateway dari root repo dan dari folder `whatsapp/`, DB tetap sama.
- Test unit database memakai temporary DB path.
- Restart gateway tidak menghilangkan akun/rule.

---

### BUG-004 - Scheduled WhatsApp messages hanya tersimpan di memory

Prioritas: P0

Area: WhatsApp gateway scheduler

Lokasi:
- `whatsapp/src/services/scheduledMessages.service.js`
- `whatsapp/src/controllers/scheduled.controller.js`
- `whatsapp/src/routes/v1/scheduled.routes.js`

Gejala:
- Scheduler memakai `const scheduledMessages = new Map()`.
- Tidak ada table `scheduled_messages`.
- Restart process membuat semua jadwal hilang.

Dampak:
- Reminder atau broadcast terjadwal gagal terkirim setelah reboot.
- Operator mengira jadwal masih aktif padahal hilang.

Solusi terbaik:
1. Tambahkan table SQLite `scheduled_messages` dengan kolom:
   - `id`, `account_id`, `to_number`, `text`, `type`, `scheduled_at`, `day`, `time`, `cron_expr`, `status`, `last_sent_at`, `created_at`, `updated_at`.
2. Saat create schedule, simpan DB lalu register cron job.
3. Saat startup gateway, load schedule aktif dari DB dan register ulang.
4. Saat one-time sent, update status `sent`; saat gagal update `failed`; recurring tetap `active`.
5. Tambahkan endpoint retry/reschedule bila perlu.

Verifikasi:
- Test create schedule, restart service mock, schedule tetap muncul.
- Test one-time schedule mengubah status ke `sent`.
- Test cancel mengubah status `cancelled` dan job berhenti.

---

### BUG-005 - Health check WhatsApp mengabaikan setting `wa_gateway_url`

Prioritas: P1

Area: Backend monitoring

Lokasi:
- `backend/internal/http/handler/health.go`

Gejala:
- `health.go` masih membaca `WA_GATEWAY_URL` dari environment dan fallback `http://localhost:3001`.
- Setting dashboard `settings.KeyWAGatewayURL` tidak dipakai untuk `whatsapp_configured`.

Dampak:
- Monitoring bisa menampilkan WhatsApp configured walaupun dashboard memakai URL berbeda.
- Jika operator setting URL gateway di UI, health bisa tetap membaca env lama.

Solusi terbaik:
1. Samakan helper resolusi gateway dengan `IntegrationHandler`/`WhatsAppService`:
   - Prefer setting `wa_gateway_url`.
   - Env hanya fallback untuk compatibility.
   - Default `http://localhost:3001`.
2. Tambahkan test health:
   - Setting URL custom membuat health memakai value setting.
   - Env hanya dipakai saat setting kosong/default.

Verifikasi:
- `go test ./...`
- Manual: ubah Gateway URL di Settings, health payload mencerminkan konfigurasi yang benar.

---

### BUG-006 - Upload bukti bayar dapat menerima file oversize secara parsial

Prioritas: P1

Area: Backend payment proof upload

Lokasi:
- `backend/internal/http/handler/bills.go`

Gejala:
- Handler cek `header.Size > maxUploadSize`, lalu memakai `io.LimitReader(file, maxUploadSize)`.
- Jika client mengirim multipart tanpa size akurat atau size lebih kecil dari payload sebenarnya, file bisa terpotong di 5MB dan tetap dianggap sukses.

Dampak:
- Bukti bayar tersimpan rusak/parsial.
- Operator melihat upload sukses tapi file tidak valid.

Solusi terbaik:
1. Gunakan reader batas `maxUploadSize + 1`.
2. Copy ke temp file sambil hitung byte.
3. Jika byte > maxUploadSize, hapus temp file dan return 400.
4. Validasi MIME/content sniffing untuk `jpg/jpeg/png/webp/pdf`.
5. Simpan file setelah validasi final.

Verifikasi:
- Test upload 5MB pas: sukses.
- Test upload 5MB + 1 byte: gagal 400 dan file tidak tersimpan.
- Test ekstensi palsu atau MIME tidak valid: gagal.

---

### BUG-007 - Riwayat Button/List WhatsApp salah account dan tidak realtime

Prioritas: P1

Area: WhatsApp gateway multi-account history

Lokasi:
- `whatsapp/src/services/whatsapp.service.js`

Gejala:
- `sendButtonMessage` dan `sendListMessage` memanggil `saveMessage(...)` tanpa parameter `direction`, `fromNumber`, dan `accountId`.
- Tidak ada `global.io.emit('chat_message', ...)` seperti `sendTextMessage` dan `sendMediaMessage`.

Dampak:
- Riwayat button/list masuk ke account default walaupun dikirim dari akun lain.
- Dashboard chat history tidak realtime untuk button/list.

Solusi terbaik:
1. Samakan implementasi penyimpanan button/list dengan text/media:
   - `saveMessage(to, body/title, 'button'/'list', waID, 'outbound', null, accountId)`.
2. Emit `chat_message` dengan payload lengkap.
3. Buat helper internal `recordOutboundMessage(accountId, to, body, type, result)` agar tidak duplikasi.

Verifikasi:
- Test `sendButtonMessage` menyimpan `account_id` sesuai input.
- Test socket emit dipanggil untuk button/list.
- Manual: kirim button/list dari account non-default, riwayat tampil pada account yang benar.

---

### BUG-008 - Frontend WhatsApp gagal load gateway tapi tidak memberi feedback operator

Prioritas: P1

Area: Frontend WhatsApp UX/error handling

Lokasi:
- `frontend/src/features/whatsapp/WhatsAppPage.tsx`

Gejala:
- Initial load catch hanya `console.error("Failed to load gateway data", err)`.
- Polling catch juga silent.

Dampak:
- Jika API key salah atau gateway mati, operator hanya melihat data kosong.
- Debug operasional lambat.

Solusi terbaik:
1. Tambahkan state `gatewayError`.
2. Tampilkan `ErrorState` dengan pesan user-friendly dan tombol retry.
3. Untuk polling, tampilkan badge `Terakhir gagal sinkron` tanpa spam toast.
4. Jangan memakai `console.error` untuk error yang user perlu tahu.

Verifikasi:
- Matikan gateway, buka tab WhatsApp, UI menampilkan error + retry.
- API key salah, UI menampilkan pesan auth gagal.

---

### BUG-009 - Aksi destruktif WhatsApp masih memakai `window.confirm`

Prioritas: P1

Area: Frontend UX/consistency

Lokasi:
- `frontend/src/features/whatsapp/WhatsAppPage.tsx`

Gejala:
- Hapus akun, reset session, hapus auto-response masih memakai `window.confirm`.

Dampak:
- UI tidak konsisten dengan confirmation modal dashboard.
- Tidak bisa memakai loading state/disabled state yang rapi.
- Sulit untuk audit UX dan accessibility.

Solusi terbaik:
1. Extend props `WhatsAppPage` agar menerima `askForConfirmation` dari `useAppFeedback`.
2. Ganti semua `window.confirm` dengan modal confirmation standar.
3. Pastikan tombol pending disabled saat action berjalan.

Verifikasi:
- Manual: semua aksi destruktif di tab WhatsApp memakai modal dashboard.
- Keyboard navigation dan ESC close tetap bekerja.

---

### BUG-010 - Settings backend menerima key arbitrer

Prioritas: P1

Area: Backend configuration safety

Lokasi:
- `backend/internal/http/handler/settings.go`
- `backend/internal/settings/service.go`

Gejala:
- `SettingsHandler.Update` loop semua key payload lalu `Set`.
- Tidak ada whitelist key yang valid.

Dampak:
- Typo dari frontend atau request manual dapat membuat setting asing.
- Agent/operator sulit membedakan setting aktif dan sampah.
- Bisa jadi vektor konfigurasi yang tidak diaudit.

Solusi terbaik:
1. Tambahkan whitelist di `settings.Service`, misalnya `AllowedKeys() map[string]bool`.
2. `SettingsHandler.Update` return 400 untuk key tidak dikenal.
3. Tambahkan test update key invalid.

Verifikasi:
- `PUT /settings` dengan `{"typo_key":"x"}` gagal 400.
- Semua key valid saat ini tetap tersimpan.

---

### BUG-011 - Hapus akun WhatsApp tidak menghapus session folder

Prioritas: P1

Area: WhatsApp gateway security/storage

Lokasi:
- `whatsapp/src/controllers/accounts.controller.js`
- `whatsapp/src/whatsapp/client.js`

Gejala:
- Delete account memanggil `destroyClient(id)` dan hapus DB, tetapi folder `src/whatsapp/sessions/{accountId}` tidak dihapus.

Dampak:
- Kredensial WhatsApp tertinggal di disk.
- Akun yang dihapus bisa tersambung lagi jika folder session masih dipakai.
- Disk bisa penuh oleh session lama.

Solusi terbaik:
1. Setelah `client.destroy()`, hapus folder session secara aman.
2. Gunakan `fs.rm(sessionPath, { recursive: true, force: true })`.
3. Validasi path tetap berada di root sessions agar tidak path traversal.
4. Tambahkan opsi `keepSession=true` jika ingin disconnect sementara tanpa hapus credential.

Verifikasi:
- Buat akun test, delete akun, folder session hilang.
- Account ID dengan karakter aneh ditolak oleh validator.

---

### BUG-012 - Validasi schedule cron WhatsApp belum ketat

Prioritas: P1

Area: WhatsApp gateway scheduler

Lokasi:
- `whatsapp/src/services/scheduledMessages.service.js`
- `whatsapp/src/controllers/scheduled.controller.js`
- `whatsapp/src/middleware/validator.js`

Gejala:
- Monthly schedule langsung split `config.time` tanpa validasi.
- `config.day` tidak dibatasi 1-28/31.
- Cron expression bisa invalid.

Dampak:
- Request invalid dapat menghasilkan exception runtime.
- Jadwal tanggal 31 tidak jalan di bulan tertentu.

Solusi terbaik:
1. Tambahkan Joi schema schedule:
   - `type`: `once|monthly`.
   - once: `scheduledAt` ISO future.
   - monthly: `day` 1-28 untuk aman, `time` regex `HH:mm`.
2. Validasi di route sebelum controller.
3. `createScheduledMessage` tetap defensive validation sebagai lapisan kedua.

Verifikasi:
- Test day 0, 32, time `99:99`, missing fields: 400.
- Test valid monthly: sukses.

---

### BUG-013 - Worker lease standby perlu test integrasi tambahan

Prioritas: P1

Area: Backend worker HA

Lokasi:
- `backend/internal/worker/worker.go`
- `backend/internal/worker/worker_test.go`

Gejala:
- Kode worker sudah diubah agar standby tidak exit saat lease dipegang proses lain.
- Namun test saat ini baru mencakup helper billing lock, belum mensimulasikan dua worker dengan lease yang berpindah.

Dampak:
- Regress di lease behavior bisa tidak tertangkap.
- Di production multi-process, failover worker bisa diam-diam tidak terjadi.

Solusi terbaik:
1. Tambahkan fake settings repository/service atau test DB yang bisa mengontrol lease.
2. Test skenario:
   - Worker A pegang lease.
   - Worker B `RunLoop` tetap hidup tetapi tidak `RunOnce`.
   - Lease A expired/released.
   - Worker B acquire dan mulai `RunOnce`.
3. Jika sulit karena `billing.Service` konkret, extract interface kecil untuk `RunOnce` dependencies atau test `acquireWorkerLease` + loop dengan context timeout.

Verifikasi:
- `go test ./internal/worker -run TestRunLoopStandbyAcquiresExpiredLease`.

---

### BUG-014 - Bundle frontend utama terlalu besar

Prioritas: P2

Area: Frontend performance

Lokasi:
- `frontend/src/App.tsx`
- `frontend/src/features/*`
- `frontend/vite.config.*` jika ada

Gejala:
- `npm run build` warning: JS bundle sekitar `569.25 kB`, melewati rekomendasi `500 kB`.

Dampak:
- First load lambat di perangkat operator yang lemah.
- Dashboard terasa berat, terutama tab WhatsApp/Chart.

Solusi terbaik:
1. Lazy-load halaman besar dengan `React.lazy` dan route/view-level dynamic imports.
2. Pisahkan vendor chunk Chart.js, lucide, dan WhatsApp page.
3. Pertimbangkan manual chunks di Vite.
4. Pastikan loading skeleton tetap muncul saat chunk dimuat.

Verifikasi:
- Build tidak lagi warning, atau threshold didokumentasikan jika tetap wajar.
- Ukur initial JS gzip turun signifikan.

---

### BUG-015 - Coverage WhatsApp gateway masih rendah untuk modul runtime penting

Prioritas: P2

Area: WhatsApp gateway tests

Lokasi dengan coverage rendah:
- `whatsapp/src/services/chatbot.service.js`
- `whatsapp/src/services/isp.service.js`
- `whatsapp/src/services/whatsapp.service.js`
- `whatsapp/src/whatsapp/client.js`
- `whatsapp/src/whatsapp/events.js`
- beberapa controllers media/groups/contacts/accounts

Gejala:
- Jest lulus, tetapi coverage total sekitar `54.1% lines`.
- Modul yang paling runtime-critical justru coverage rendah.

Dampak:
- Bug WhatsApp runtime baru ketahuan setelah service jalan.
- Perubahan auto-response/chatbot rawan regress.

Solusi terbaik:
1. Tambah unit test `events.js`:
   - inbound group ignored.
   - auto-reply matching mengirim response dan tidak lanjut chatbot.
   - chatbot disabled untuk akun tertentu.
2. Test `whatsapp.service.js` dengan mocked client:
   - text/media/button/list menyimpan history benar.
   - account_id sesuai.
3. Test `chatbot.service.js` untuk menu utama, registered/unregistered, support form.

Verifikasi:
- Target minimal coverage gateway bertahap: 70%, lalu 80%.
- Coverage file `events.js` dan `whatsapp.service.js` naik signifikan.

---

### BUG-016 - Trace ID belum end-to-end backend/frontend/gateway

Prioritas: P2

Area: Observability

Lokasi:
- Backend router middleware: `backend/internal/http/router/router.go`
- Gateway middleware: `whatsapp/src/app.js`, `whatsapp/src/middleware/errorHandler.js`
- Frontend API wrapper: `frontend/src/lib/api.ts`, `frontend/src/lib/gatewayApi.ts`

Gejala:
- Backend memakai request ID middleware, tetapi frontend/gateway tidak mengirim atau menampilkan trace id.
- Error toast tidak mencantumkan request id.

Dampak:
- Debug production lambat karena operator tidak bisa memberi ID error.
- Sulit menghubungkan error frontend, backend, dan gateway.

Solusi terbaik:
1. Backend: expose `X-Request-Id` di response.
2. Frontend API wrapper: baca `X-Request-Id` dan lampirkan di error object/toast detail.
3. Gateway: buat middleware request id sendiri atau pakai package ringan.
4. Log semua error dengan request id.

Verifikasi:
- Error API menampilkan request id di network response dan UI.
- Log backend/gateway bisa dicari berdasarkan id tersebut.

---

### BUG-017 - WhatsApp gateway static CORS dan body limit terlalu longgar

Prioritas: P2

Area: WhatsApp gateway security/hardening

Lokasi:
- `whatsapp/src/app.js`

Gejala:
- `cors()` tanpa konfigurasi origin.
- `express.json({ limit: '50mb' })` untuk semua endpoint.

Dampak:
- Endpoint text/chatbot sederhana menerima body sangat besar.
- Jika gateway terekspos, risiko abuse memory lebih tinggi.

Solusi terbaik:
1. Set CORS origin dari env dan wajib ketat di production.
2. Turunkan default JSON body limit, misalnya `1mb`.
3. Untuk endpoint upload media, pakai limit khusus route.

Verifikasi:
- Request body > limit return 413.
- Origin tidak diizinkan ditolak di production.

---

### BUG-018 - Frontend WhatsApp memakai import/icon yang tidak dipakai

Prioritas: P3

Area: Frontend cleanup/performance kecil

Lokasi:
- `frontend/src/features/whatsapp/WhatsAppPage.tsx`

Gejala:
- Import `useRef`, `GatewayAccount`, dan beberapa icon seperti `Eye`, `EyeOff`, `WifiOff`, `ShieldAlert` terindikasi tidak dipakai pada scan awal.

Dampak:
- Tidak kritis karena TypeScript build masih lulus, tetapi menambah noise dan bisa menghambat lint ketat.

Solusi terbaik:
1. Aktifkan ESLint/TypeScript no-unused lint jika belum.
2. Hapus import yang tidak dipakai.
3. Jalankan `npm run build`.

Verifikasi:
- Tidak ada unused import saat lint/build.

---

## Bug yang Baru Diperbaiki di Working Tree dan Perlu Dipertahankan

Bagian ini bukan backlog baru, tetapi penting agar agent lain tidak mengembalikan bug lama.

### FIXED-WORKER-001 - Billing in-progress marker bisa deadlock sebulan

Lokasi:
- `backend/internal/worker/worker.go`
- `backend/internal/worker/worker_test.go`

Masalah lama:
- `worker_billing_in_progress` dulu hanya menyimpan periode.
- Jika generate gagal/crash, periode itu bisa membuat worker selalu skip generate bulan tersebut.

Perbaikan saat ini:
- Marker sekarang format `period|RFC3339`.
- Marker punya TTL `30 menit`.
- Legacy marker period-only dianggap stale.

Verifikasi:
- `TestBillingInProgressActive` di `worker_test.go`.

### FIXED-WORKER-002 - Worker standby bisa exit saat lease dipegang proses lain

Lokasi:
- `backend/internal/worker/worker.go`

Masalah lama:
- Jika lease worker dipegang proses lain, `RunLoop` return nil.
- Di systemd, service terlihat sukses dan tidak standby mengambil alih.

Perbaikan saat ini:
- Worker tetap hidup dan mencoba acquire lease ulang tiap interval.

Catatan lanjutan:
- Tambahkan test integrasi seperti BUG-013.

### FIXED-HEALTH-001 - Health backup membaca key lama

Lokasi:
- `backend/internal/http/handler/health.go`
- `backend/internal/http/handler/health_test.go`

Masalah lama:
- Worker menyimpan `worker_last_backup_at`, health membaca `worker_last_backup_date`.

Perbaikan saat ini:
- Health fallback dari `worker_last_backup_at` ke date.
- Payload expose `backup.last_run_at`.

Verifikasi:
- `TestHealthHandlerBackupUsesLastBackupAt`.

---

## Urutan Eksekusi yang Disarankan

1. P0 quick cleanup:
   - Hapus file artefak `worker.go.<angka>`.
   - Kunci Socket.IO dengan API key.
   - Stabilkan path database WhatsApp.
   - Persist scheduled messages.

2. P1 reliability:
   - Samakan health WA config dengan settings.
   - Perbaiki upload bukti bayar agar tidak truncate.
   - Perbaiki history button/list multi-account.
   - Tambah test worker lease standby.
   - Whitelist settings key.

3. P1/P2 UX dan observability:
   - Error state WhatsApp tab.
   - Modal confirm standar.
   - Trace ID end-to-end.

4. P2/P3 quality:
   - Code splitting frontend.
   - Tambah coverage gateway.
   - Bersihkan unused import.

## Checklist Verifikasi Setelah Semua Fix

- `go test ./...` dari `backend/`.
- `npm run build` dari `frontend/`.
- `.\node_modules\.bin\jest.cmd --runInBand --forceExit --cacheDirectory .jest-cache` dari `whatsapp/`.
- Manual smoke:
  - Login dashboard.
  - Buka Monitoring.
  - Buka WhatsApp tab.
  - Connect Socket.IO dengan token valid.
  - Kirim auto-response dari account non-default.
  - Generate tagihan otomatis/manual.
  - Upload bukti bayar file valid dan oversized.
  - Restart WhatsApp gateway dan pastikan akun/rule/schedule tetap ada.
