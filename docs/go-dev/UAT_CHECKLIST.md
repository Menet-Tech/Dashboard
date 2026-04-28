# UAT Checklist (go-dev)

Checklist ini dipakai sebelum go-live production single VPS.

## A. Akses dan Auth

- [ ] Login admin berhasil.
- [ ] Login petugas berhasil.
- [ ] Logout berhasil dan session invalid.
- [ ] Endpoint mutasi tanpa CSRF token ditolak.

## B. Master Data

- [ ] CRUD paket berjalan normal.
- [ ] CRUD pelanggan berjalan normal.
- [ ] Ubah status pelanggan (`active/limit/inactive`) berjalan.

## C. Billing

- [ ] Generate tagihan periode berjalan sukses dan idempotent.
- [ ] List tagihan tampil lengkap beserta `display_status`.
- [ ] Mark paid berhasil dan status pelanggan direstore sesuai rule.
- [ ] Invoice endpoint terbuka untuk tagihan target.
- [ ] Upload bukti bayar berhasil.

## D. Integrasi dan Notifikasi

- [ ] Template WA dapat dikelola dari UI.
- [ ] Riwayat notifikasi tampil setelah trigger WA.
- [ ] Discord notification event penting terkirim (minimal 1 skenario).

## E. Monitoring dan Backup

- [ ] `/livez`, `/readyz`, `/health` semuanya OK.
- [ ] Worker heartbeat terbarui berkala.
- [ ] Backup manual berhasil.
- [ ] Verify backup (`integrity_check`) berhasil.

## F. Release Gate Teknis

- [ ] `cd backend && go test ./... -timeout 120s` pass.
- [ ] `cd frontend && npm run build` pass.
- [ ] `./deploy/go-dev/smoke.sh` pass pada host target.
- [ ] Tidak ada alert kritikal yang belum ditangani di halaman Monitoring.
