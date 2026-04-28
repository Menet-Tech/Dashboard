# Data Migration Guide (Legacy PHP/MySQL -> go-dev SQLite)

Dokumen ini menjelaskan mapping data inti saat cutover ke backend Go.

## Tujuan

- Memindahkan data operasional inti tanpa mengubah business rule utama.
- Menjaga import dapat diulang (idempotent) dan bisa diverifikasi.

## Perintah Import

Dry-run:

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=true \
go run ./cmd/api import
```

Eksekusi nyata:

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=false \
go run ./cmd/api import
```

## Mapping Tabel

### `paket`
- `kecepatan` (legacy) -> `kecepatan_mbps` (go-dev)
- `deskripsi` tetap dipertahankan jika ada

### `pelanggan`
- `nomor_wa` / `no_wa` -> `nomor_wa`
- `tgl_jatuh_tempo` dipertahankan sebagai integer day-of-month
- status pelanggan dipertahankan (`active` / `limit` / `inactive`)

### `template_wa`
- `trigger` (legacy) -> `trigger_key`
- `template` (legacy) -> `isi_template`

### `pengaturan`
- mendukung variasi kolom `key/value` atau `nama/nilai`

### `tagihan`
- `no_invoice` (legacy) -> `invoice_number`
- `bukti_bayar` (legacy) -> `proof_path`
- status DB tetap `belum_bayar` / `lunas`

## Validasi Pasca Import

1. Bandingkan total row per tabel sumber vs target.
2. Uji login admin di go-dev.
3. Uji list pelanggan/paket/tagihan di UI.
4. Uji satu alur `mark paid` + invoice + notifikasi.
5. Jalankan backup dan verify.

## Catatan Operasional

- Jalankan import pada maintenance window.
- Simpan backup MySQL dan backup SQLite sebelum cutover.
- Untuk rollback, ganti kembali service ke stack lama dan restore snapshot DB sebelumnya.
