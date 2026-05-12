# Rollback Procedure — Menet-Tech ISP Billing (Go-Dev)

Dokumen ini menjelaskan prosedur rollback apabila terjadi masalah serius setelah deployment baru.

---

## Skenario 1: Rollback Binary (Kode Bermasalah)

### Prasyarat
- Binary lama disimpan di `/opt/menettech/dashboard/api.prev` dan `worker.prev`
- Systemd service sudah aktif

### Langkah-langkah

```bash
# 1. Stop service baru
sudo systemctl stop menettech-api menettech-worker

# 2. Ganti binary dengan versi lama
cd /opt/menettech/dashboard
sudo cp api api.broken
sudo cp api.prev api
sudo cp worker.prev worker

# 3. Start kembali
sudo systemctl start menettech-api menettech-worker

# 4. Verifikasi
sudo systemctl status menettech-api menettech-worker
curl -s http://localhost:8080/api/v1/health
```

---

## Skenario 2: Rollback Database (Restore Backup)

> ⚠️ **PENTING**: Restore akan menggantikan database aktif. Semua data setelah backup dibuat akan hilang.

### Prasyarat
- Backup tersedia di `/opt/menettech/dashboard/storage/backups/`
- Akses admin ke API

### Langkah via API (Rekomendasi)

```bash
# 1. List backup yang tersedia
curl -s -b session.cookie -H "X-CSRF-Token: $CSRF" \
  http://localhost:8080/api/v1/backups

# 2. Simulasikan restore (validasi saja, tidak mengubah data)
BACKUP_FILE="backup_2026-05-12_02-00-00.db"
curl -s -X POST -b session.cookie -H "X-CSRF-Token: $CSRF" \
  "http://localhost:8080/api/v1/backups/$BACKUP_FILE/restore"

# 3. Jika simulasi OK, apply restore (akan restart otomatis via systemd)
curl -s -X POST -b session.cookie -H "X-CSRF-Token: $CSRF" \
  "http://localhost:8080/api/v1/backups/staging/apply"
# Setelah ini aplikasi akan exit dan systemd akan restart otomatis
```

### Langkah Manual (jika API tidak bisa diakses)

```bash
# 1. Stop semua service
sudo systemctl stop menettech-api menettech-worker

# 2. Backup database saat ini (untuk investigasi)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sudo cp /opt/menettech/dashboard/storage/dashboard.db \
        /opt/menettech/dashboard/storage/dashboard.db.broken_$TIMESTAMP

# 3. Copy backup ke posisi aktif
BACKUP_FILE="backup_2026-05-12_02-00-00.db"
sudo cp /opt/menettech/dashboard/storage/backups/$BACKUP_FILE \
        /opt/menettech/dashboard/storage/dashboard.db

# 4. Start kembali
sudo systemctl start menettech-api menettech-worker

# 5. Verifikasi
curl -s http://localhost:8080/api/v1/health
bash tests/smoke_test.sh
```

---

## Skenario 3: Schema Migration Gagal

Jika server tidak bisa start karena migration error:

```bash
# Cek log untuk detail error
sudo journalctl -u menettech-api -n 100 --no-pager

# Jika migration file bermasalah, restore backup sebelum migration dijalankan
# Lalu rollback binary ke versi yang belum ada migration tersebut
```

---

## Checklist Setelah Rollback

- [ ] `GET /api/v1/health` mengembalikan 200
- [ ] Login berhasil dengan kredensial yang benar
- [ ] Daftar pelanggan tampil
- [ ] Daftar tagihan tampil
- [ ] Jalankan smoke test: `bash tests/smoke_test.sh`
- [ ] Notifikasi tim operasional
- [ ] Buat incident report

---

## Kontak Darurat

Update bagian ini sesuai dengan kontak tim:

| Role | Kontak |
|------|--------|
| DevOps | - |
| Backend Dev | - |
| DBA | - |
