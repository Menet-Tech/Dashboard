# Menet-Tech Backup Decryption Tool

Perkakas baris perintah (CLI) mandiri ini digunakan oleh Administrator atau Engineer untuk mendekripsi dan mengekstrak berkas cadangan (backup) database & konfigurasi router MikroTik secara lokal pada komputer/laptop sendiri.

> [!WARNING]
> **KEAMANAN & DEPLOYMENT**:
> Perkakas ini adalah utilitas lokal untuk Engineer. **Jangan menaruh binary hasil kompilasi perkakas ini di server Production.** Jaga kerahasiaan password enkripsi backup Anda.

---

## Cara Kompilasi (Build secara Lokal)

Perkakas ini dibuat menggunakan bahasa pemrograman Go. Untuk menggunakannya, Anda perlu melakukan kompilasi berkas executable di komputer lokal Anda:

1. Buka Terminal / CMD / Powershell pada komputer lokal Anda.
2. Masuk ke folder `backend/`:
   ```bash
   cd backend
   ```
3. Jalankan perintah kompilasi:
   * **Windows**:
     ```bash
     go build -o decrypt-tool.exe ./cmd/decrypt-tool/main.go
     ```
   * **Linux / macOS**:
     ```bash
     go build -o decrypt-tool ./cmd/decrypt-tool/main.go
     ```

Setelah proses kompilasi selesai, Anda akan mendapatkan berkas executable `decrypt-tool.exe` (Windows) atau `decrypt-tool` (Linux/macOS) pada folder tersebut.

---

## Panduan Penggunaan (Usage)

Perkakas ini mendukung dua cara pengisian password enkripsi:

### 1. Mode Interaktif (Sangat Direkomendasikan)
Menjalankan perkakas tanpa menuliskan password di terminal. Program akan meminta Anda memasukkan password secara aman setelah berjalan.

```bash
# Contoh Windows
./decrypt-tool.exe -in "C:\Users\User\Downloads\backup_manual_2026-07-18_15-51-50.zip" -out "C:\Users\User\Downloads\extracted"
```
Setelah dijalankan, terminal akan memunculkan perintah:
```text
Masukkan password dekripsi backup: 
```
Silakan ketik password Anda lalu tekan `Enter`.

### 2. Mode Langsung (Menggunakan Flag `-password`)
Menuliskan password langsung pada argumen baris perintah.

```bash
./decrypt-tool.exe -in "C:\Users\User\Downloads\backup_manual.zip" -out "C:\Users\User\Downloads\extracted" -password admin122
```

---

## Detail Flags (Opsi Parameter)

| Flag | Wajib | Keterangan |
|------|-------|------------|
| `-in` | **Ya** | Path lokasi berkas backup input (`.zip`, `.enc`, atau `.db`). |
| `-out` | Tidak | Folder tujuan ekstraksi hasil dekripsi. Jika dikosongkan, folder output akan otomatis menggunakan folder yang sama dengan lokasi berkas input. |
| `-password` | Tidak | Password enkripsi untuk mendekripsi file backup. Jika dikosongkan, program akan menanyakannya via console. |

---

## Struktur File Hasil Dekripsi

Setelah proses dekripsi ZIP berhasil dilakukan, folder output akan berisi:
* **`dashboard.db`**: Berkas database SQLite plain mentah yang sudah didekripsi dari `dashboard.db.enc`. Berkas ini dapat langsung dibuka menggunakan aplikasi pengelola database seperti *DB Browser for SQLite*.
* **`mikrotik_<NamaRouter>.json`**: Konfigurasi router MikroTik berupa berkas JSON plain mentah yang sudah didekripsi dari `mikrotik_<NamaRouter>.json.enc`.

---

## Informasi Nilai Password Default (Fallback)

Apabila pada menu Pengaturan di Dashboard kolom **Password Enkripsi Backup** dikosongkan, maka enkripsi otomatis menggunakan fallback dengan prioritas berikut:
1. Environment Variable **`DASHBOARD_INTERNAL_API_KEY`** di server.
2. Jika environment tersebut kosong, maka menggunakan password default: **`menettech_backup_pass`**
