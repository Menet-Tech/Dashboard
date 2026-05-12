# Soak Test Plan — Menet-Tech ISP Billing Worker

Dokumen ini menjelaskan rencana soak test untuk memastikan worker berjalan stabil selama 24/7 di production.

---

## Tujuan

1. Memastikan tidak ada memory leak pada worker loop
2. Memastikan lease lock tidak "stuck" atau hilang dalam jangka panjang
3. Memastikan auto backup berjalan di jadwal yang benar
4. Memastikan billing automation tidak double-generate tagihan
5. Memastikan Discord alert tidak flood ketika error berulang

---

## Durasi

- **Minimum**: 72 jam (3 hari)
- **Ideal**: 7 hari

---

## Environment

- OS: Ubuntu 22.04 LTS
- Mode: `staging` (bukan production live)
- Database: salinan database production (atau data dummy skala penuh)
- Config: `ENVIRONMENT=staging`, semua env var production dikopi, Discord ke channel test

---

## Checklist Sebelum Soak Test

- [ ] Build binary terbaru: `go build -o worker cmd/api/main.go`
- [ ] Salin `.env.production` ke staging
- [ ] Jalankan migration: `./api migrate` atau pastikan migration auto-run saat start
- [ ] Verifikasi health check via smoke test
- [ ] Set `BACKUP_AUTO_ENABLED=1` dan `BACKUP_AUTO_TIME=02:00`
- [ ] Set `WORKER_INTERVAL_SECS=60` untuk test lebih cepat (ubah kembali ke default saat production)
- [ ] Aktifkan Discord alert channel test
- [ ] Pastikan systemd restart policy = `always` dengan `RestartSec=5`

---

## Metrik yang Dipantau

| Metrik | Cara Pantau | Threshold |
|--------|-------------|-----------|
| Memory (RSS) | `ps aux` / `top` | < 100 MB |
| CPU worker | `top` | < 5% rata-rata |
| Heartbeat terakhir | `GET /api/v1/health` | < 2 menit lalu |
| Backup harian | Cek file di `storage/backups/` | 1 file per hari |
| Tagihan duplikat | Query DB | 0 duplikat |
| Discord flood | Cek channel | < 5 notif/jam saat idle |
| Restart count | `systemctl status` | 0 dalam 72 jam |

---

## Jadwal Observasi

| Waktu | Kegiatan |
|-------|----------|
| T+0   | Start worker, catat PID dan timestamp |
| T+1h  | Cek log, cek heartbeat, cek memory |
| T+12h | Cek log, cek apakah backup malam sudah jalan |
| T+24h | Cek full metrik di atas |
| T+48h | Cek full metrik, pastikan tidak ada restart |
| T+72h | Final check — jika semua OK, promote ke production |

---

## Prosedur Monitoring

```bash
# Cek heartbeat
curl -s http://staging-host:8080/api/v1/health | python3 -m json.tool

# Cek restart count worker
systemctl show menettech-worker --property=NRestarts

# Cek memory
ps -o pid,rss,vsz,cmd -p $(pgrep -f 'worker$')

# Cek backup terbaru
ls -lhrt /opt/menettech/dashboard/storage/backups/ | tail -5

# Cek log error
sudo journalctl -u menettech-worker --since "24 hours ago" | grep -i error
```

---

## Kriteria Lulus

Soak test dianggap lulus jika selama 72 jam:

1. ✅ Tidak ada restart service yang tidak terduga
2. ✅ Memory stabil (tidak naik terus menerus)
3. ✅ Backup harian tersedia setiap hari
4. ✅ Tidak ada tagihan duplikat
5. ✅ Heartbeat selalu diperbarui
6. ✅ Tidak ada Discord alert error yang tidak diketahui penyebabnya

---

## Jika Soak Test Gagal

1. Catat waktu dan kondisi kegagalan
2. Ambil goroutine dump: `kill -SIGABRT <pid>` (jika butuh trace)
3. Salin log: `sudo journalctl -u menettech-worker -n 10000 > soak_failure.log`
4. Lakukan analisis root cause sebelum deployment production
