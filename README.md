# Sistem Billing Manajemen ISP

**Versi**: 1.0.0  
**Status**: Production Ready  
**Dibuat**: 2026-03-10  
**Bahasa**: PHP, JavaScript, CSS  
**Database**: MySQL/MariaDB  

---

## 📋 Daftar Isi

- [Deskripsi Project](#deskripsi-project)
- [Fitur Utama](#fitur-utama)
- [Persyaratan Sistem](#persyaratan-sistem)
- [Instalasi](#instalasi)
- [Konfigurasi Database](#konfigurasi-database)
- [Struktur Project](#struktur-project)
- [Panduan Penggunaan](#panduan-penggunaan)
- [Autentikasi](#autentikasi)
- [Fitur Teknis](#fitur-teknis)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Deskripsi Project

**Sistem Billing Manajemen ISP** adalah aplikasi web berbasis PHP yang dirancang untuk mengelola tagihan, pelanggan, dan konfigurasi jaringan Mikrotik untuk layanan Internet Service Provider (ISP). 

Aplikasi ini memungkinkan operator ISP untuk:
- Mengelola data pelanggan dan paket bandwidth
- Membuat dan melacak tagihan otomatis
- Mengatur status pembayaran pelanggan
- Mengkonfigurasi IP Pool dan paket bandwith di Mikrotik
- Memonitor status pelanggan secara real-time

---

## ✨ Fitur Utama

### 1. **Dashboard Manajemen**
- Interface dashboard intuitif dengan menu utama
- Menampilkan statistik dan ringkasan bisnis
- Akses cepat ke semua modul utama
- Tanggal dan waktu real-time

### 2. **Manajemen Pelanggan**
- ✅ Tambah pelanggan baru
- ✅ Edit data pelanggan (nama, user PPPoE, password, paket, status)
- ✅ Hapus pelanggan
- ✅ Filter dan pencarian pelanggan
- ✅ Status pelanggan: Active, Limit, Tertunda, Inactive
- ✅ Auto-generate password jika kosong (format: username + "122")

### 3. **Sistem Tagihan**
- ✅ Auto-generate tagihan otomatis
- ✅ Sistem pencatatan tagihan terstruktur
- ✅ Update status pembayaran (Belum/Sudah)
- ✅ Tracking tanggal tagihan dan jatuh tempo
- ✅ Sistem status pembayaran real-time
- ✅ Auto-update status pelanggan berdasarkan keterlambatan

### 4. **Manajemen Paket Bandwidth**
- ✅ Tambah/Edit paket bandwidth
- ✅ Konfigurasi speed limit (upload/download)
- ✅ Penetapan harga paket
- ✅ Validasi paket dan IP Pool
- ✅ Link ke IP Pool tertentu

### 5. **Manajemen IP Pool**
- ✅ Tambah/Edit IP Pool
- ✅ Validasi range IP address
- ✅ Pengaturan gateway untuk setiap pool
- ✅ Status pelacakan pool

### 6. **Keamanan**
- ✅ Sistem login sederhana dengan session
- ✅ Proteksi halaman dengan pengecekan session
- ✅ Input sanitization dan validasi
- ✅ Prepared statements untuk mencegah SQL Injection

---

## 🖥️ Persyaratan Sistem

### Minimum Requirements:
- **PHP**: 7.4 atau lebih tinggi
- **MySQL/MariaDB**: 5.7 atau lebih tinggi
- **Web Server**: Apache atau Nginx
- **Browser**: Chrome, Firefox, Safari, Edge (modern)

### Rekomendasi:
- **PHP**: 8.0+
- **MariaDB**: 10.4+
- **RAM**: 2GB minimum
- **Storage**: 10GB

### Library & Dependencies:
- jQuery (optional, untuk AJAX)
- Font Awesome 6.0.0 (CDN)
- Session PHP Native

---

## 📦 Instalasi

### 1. Persiapan Environment
```bash
# Pastikan XAMPP/LAMPP sudah terinstall
# Buka command prompt dan navigasi ke folder htdocs
cd d:\xampp\htdocs
```

### 2. Clone/Copy Project
```bash
# Copy folder project ke folder htdocs
cp -r billing d:\xampp\htdocs\
# atau manual copy folder billing ke d:\xampp\htdocs\
```

### 3. Setup Database
```
1. Buka phpMyAdmin (http://localhost/phpmyadmin)
2. Buat database baru dengan nama "dashboard"
3. Pilih database "dashboard"
4. Klik tab "Import"
5. Pilih file "dashboard.sql" dari folder project
6. Klik "Import"
```

**atau menggunakan command line:**
```bash
mysql -u root -p dashboard < d:\xampp\htdocs\billing\dashboard.sql
```

### 4. Konfigurasi File
- Edit file `config.php` sesuai konfigurasi database Anda
- Default password kosong untuk root (standard XAMPP)

### 5. Akses Aplikasi
```
URL: http://localhost/billing/
```

---

## 🗄️ Konfigurasi Database

### Koneksi Database (`config.php`)

```php
$servername = "localhost";
$username = "root";
$password = "";  // Sesuaikan dengan password Anda
$dbname = "dashboard";
```

### Tabel-Tabel Database

#### 1. **ip_pools** - Penyimpanan IP Pool
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | INT | Primary Key |
| name | VARCHAR(100) | Nama pool (contoh: "10MBps") |
| start_ip | VARCHAR(15) | IP awal range |
| end_ip | VARCHAR(15) | IP akhir range |
| gateway | VARCHAR(15) | Gateway IP |
| created_at | TIMESTAMP | Waktu dibuat |
| updated_at | TIMESTAMP | Waktu diupdate |

#### 2. **paket_bandwidth** - Paket Layanan
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | INT | Primary Key |
| name | VARCHAR(100) | Nama paket |
| id_local_address | INT | FK ke ip_pools |
| id_remote_address | INT | FK ke ip_pools |
| speed_limit | VARCHAR(50) | Limit kecepatan (contoh: "10M/10M") |
| price | INT | Harga paket dalam Rupiah |
| created_at | TIMESTAMP | Waktu dibuat |
| updated_at | TIMESTAMP | Waktu diupdate |

#### 3. **pelanggan** - Data Pelanggan
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | INT | Primary Key |
| nama | VARCHAR(100) | Nama lengkap pelanggan |
| user_pppoe | VARCHAR(50) | Username PPPoE |
| password_pppoe | VARCHAR(100) | Password PPPoE |
| paket_id | INT | FK ke paket_bandwidth |
| jatuh_tempo | INT(2) | Tanggal jatuh tempo (1-31) |
| harga | INT | Harga berlangganan |
| status | ENUM | active/limit/tertunda/inactive |
| created_at | TIMESTAMP | Waktu dibuat |
| updated_at | TIMESTAMP | Waktu diupdate |

#### 4. **tagihan** - Catatan Tagihan
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | INT | Primary Key |
| pelanggan_id | INT | FK ke pelanggan |
| tanggal_tagihan | DATE | Tanggal tagihan dibuat |
| tanggal_jatuh_tempo | DATE | Batas akhir pembayaran |
| status_bayar | ENUM | belum/sudah |
| created_at | TIMESTAMP | Waktu dibuat |
| updated_at | TIMESTAMP | Waktu diupdate |

---

## 📂 Struktur Project

```
billing/
├── config.php                 # Konfigurasi database & fungsi helper
├── index.php                  # Router utama
├── login.php                  # Halaman login
├── dashboard.php              # Dashboard utama
├── pelanggan.php              # Manajemen pelanggan
├── tagihan.php                # Manajemen tagihan
├── generate_tagihan.php       # Generate tagihan otomatis
├── header.php                 # Header component
├── navbar.php                 # Sidebar navigation
├── style.css                  # Stylesheet utama
├── script.js                  # Script JavaScript utama
├── dashboard.sql              # Database dump/schema
├── mysql.txt                  # Catatan MySQL (reference)
├── main.php                   # (empty/untuk pengembangan)
├── README.md                  # Dokumentasi project ini
├── blueprint.md               # Blueprint arsitektur
├── roadmap.md                 # Roadmap pengembangan
│
└── mikrotik/                  # Module Mikrotik configuration
    ├── paket.php              # Manajemen paket bandwidth
    ├── pool.php               # Manajemen IP Pool
    ├── process_paket.php      # AJAX processor untuk paket
    ├── process_pool.php       # AJAX processor untuk pool
    │
    └── asset/
        └── script.js          # Script khusus Mikrotik module
```

---

## 🚀 Panduan Penggunaan

### Login ke Sistem

**Default Credentials:**
- Username: `admin`
- Password: `12345`

> ⚠️ **Catatan Keamanan**: Segera ubah password default setelah instalasi untuk keamanan produksi.

```
URL Login: http://localhost/billing/login.php
```

### 1. Dashboard
- Beranda utama dengan empat menu: Billing, Maps, User, Mikrotik
- Menampilkan statistik ringkas
- Akses ke semua modul sistem

### 2. Manajemen Pelanggan (`pelanggan.php`)

**Tambah Pelanggan:**
1. Scroll ke bagian "Tambah Pelanggan Baru"
2. Isi form dengan data pelanggan
3. Pilih paket bandwidth dari dropdown
4. Atur tanggal jatuh tempo (1-31)
5. Pilih status (active/limit/tertunda/inactive)
6. Klik "Tambah Pelanggan"

**Edit Pelanggan:**
1. Cari pelanggan di tabel
2. Klik tombol "Edit" pada baris pelanggan
3. Form akan terbuka dengan data terisi
4. Ubah data sesuai kebutuhan
5. Klik "Update" untuk menyimpan

**Hapus Pelanggan:**
1. Klik tombol "Hapus" pada baris pelanggan
2. Konfirmasi penghapusan
3. Pelanggan akan terhapus dari sistem

### 3. Manajemen Tagihan (`tagihan.php`)

**Generate Tagihan Otomatis:**
1. Buka halaman Tagihan
2. Klik tombol "Generate Tagihan Otomatis"
3. Sistem akan membuat tagihan untuk semua pelanggan aktif
4. Tagihan dibuat 3 hari sebelum jatuh tempo

**Update Status Pembayaran:**
1. Cari tagihan di tabel
2. Pilih status pembayaran: "Belum" atau "Sudah Dibayar"
3. Klik "Update Status"
4. Status akan berubah secara real-time

**Filter Tagihan:**
- Filter berdasarkan pelanggan
- Filter berdasarkan status pembayaran
- Filter berdasarkan tanggal

### 4. Mikrotik Configuration

#### Manajemen IP Pool (`mikrotik/pool.php`)

**Tambah IP Pool:**
1. Masuk ke menu Mikrotik → IP Pool
2. Isi nama pool (contoh: "10MBps")
3. Masukkan Start IP (contoh: 192.168.10.1)
4. Masukkan End IP (contoh: 192.168.10.253)
5. Klik "Tambah Pool"

> **Catatan**: Format IP akan divalidasi otomatis

**Edit IP Pool:**
1. Klik tombol "Edit" pada baris pool
2. Ubah data sesuai kebutuhan
3. Klik "Update"

#### Manajemen Paket Bandwidth (`mikrotik/paket.php`)

**Tambah Paket:**
1. Masuk ke menu Mikrotik → Paket Bandwidth
2. Isi nama paket (contoh: "Paket 10 Mbps")
3. Pilih IP Pool dari dropdown
4. Masukkan speed limit (contoh: "10M/10M")
5. Masukkan harga paket (dalam Rupiah)
6. Klik "Tambah Paket"

**Edit Paket:**
1. Klik tombol "Edit" pada baris paket
2. Ubah data sesuai kebutuhan
3. Klik "Update"

---

## 🔐 Autentikasi

### Sistem Login
- Username: `admin`
- Password: `12345`
- Session timeout: Sesuai dengan konfigurasi PHP (default 30 menit)

### Proteksi Halaman
Semua halaman terlindungi dengan pengecekan session:

```php
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}
```

### Logout
Klik tombol "Logout" di sidebar untuk keluar dari sistem. Session akan dihapus dan user diarahkan ke halaman login.

---

## ⚙️ Fitur Teknis

### Validasi Input
- **IP Address Validation**: Memvalidasi format IP dengan regex
- **Range Validation**: Memastikan Start IP < End IP
- **Input Sanitization**: Menggunakan `htmlspecialchars()` dan `trim()`
- **Duplicate Check**: Mencegah duplikasi data

### Database Triggers
Sistem menggunakan MySQL triggers untuk validasi otomatis:

1. **validate_ip_format**: Validitas format IP pada insert/update
2. **update_ip_pool_timestamp**: Auto-update timestamp
3. **validate_paket_id_format**: Validasi ID paket
4. **update_paket_timestamp**: Update timestamp paket
5. **validate_pelanggan_data**: Validasi data pelanggan
6. **update_pelanggan_timestamp**: Update timestamp pelanggan
7. **update_tagihan_timestamp**: Update timestamp tagihan

### Auto-Generate Tagihan
Fitur `generate_tagihan.php` otomatis:
- Membuat tagihan 3 hari sebelum jatuh tempo
- Update status pelanggan berdasarkan keterlambatan
- Skip tagihan duplicate
- Update harga dari paket terkait

### Status Pelanggan Auto-Update
Sistem otomatis mengubah status:
- **Active → Limit**: Jika ada tagihan overdue 1-5 hari
- **Limit → Tertunda**: Jika overdue 5+ hari
- **Tertunda → Inactive**: Jika overdue 10+ hari

---

## 🛠️ Troubleshooting

### 1. Error: "Koneksi database gagal"
**Solusi:**
- Pastikan service MySQL/MariaDB berjalan
- Cek konfigurasi di `config.php`
- Verifikasi username dan password database
- Pastikan database "dashboard" sudah dibuat

### 2. Error: "Database tidak ditemukan"
**Solusi:**
- Import file `dashboard.sql` ke database
- Buka phpMyAdmin dan import manual
- Cek nama database di `config.php`

### 3. Page blank atau error 500
**Solusi:**
- Cek error di Apache error log
- Pastikan PHP mendukung mysqli extension
- Verifikasi file permissions (chmod 755)
- Debug dengan menambahkan `phpinfo()` di awal index.php

### 4. Session tidak bekerja
**Solusi:**
- Pastikan folder `tmp` writable pada server
- Cek session.save_path di php.ini
- Clear browser cookies
- Restart web server

### 5. Validasi IP gagal
**Solusi:**
- Gunakan format IPv4 standard (xxx.xxx.xxx.xxx)
- Setiap octet harus bernilai 0-255
- Contoh valid: 192.168.1.1
- Contoh invalid: 192.168.1.1/24 (gunakan untuk kedua IP)

### 6. Form tidak ter-submit
**Solusi:**
- Cek method form (POST)
- Verifikasi nama field sesuai code
- Pastikan JavaScript tidak memblok submit
- Cek nilai required pada input

---

## 📝 Password Default

Untuk keamanan sistem:

```
Login Credentials:
- Username: admin
- Password: 12345

⚠️ PENTING: Ubah password ini segera di production environment
```

---

## 🔄 Workflow Sistem

### 1. Pelanggan Baru
```
Tambah Pelanggan → Sistem Auto-Generate Tagihan → 
Pelanggan Berkewajiban Membayar → Status Tracking
```

### 2. Billing Cycle
```
Tanggal Jatuh Tempo (hari X) →
3 Hari Sebelumnya: Tagihan Dibuat →
Tagihan dikirim ke pelanggan →
Pelanggan Membayar → Status Updated
```

### 3. Status Pelanggan
```
Active (On-time) → 
Limit (1-5 hari overdue) → 
Tertunda (5+ hari overdue) → 
Inactive (Manual atau 10+ hari)
```

---

## 📞 Support & Maintenance

### Backup Database
```bash
# Backup manual
mysqldump -u root -p dashboard > backup_$(date +%Y%m%d).sql

# atau via phpMyAdmin: export database
```

### Tips Maintenance
1. Backup database setiap hari
2. Monitor disk space
3. Clear old logs secara berkala
4. Update PHP dan MySQL secara regular
5. Test disaster recovery procedures

---

## 📄 Lisensi & Catatan

Aplikasi ini dikembangkan untuk keperluan manajemen ISP lokal. Silakan modify sesuai kebutuhan Anda.

---

**Terakhir diupdate**: 10 Maret 2026  
**Status**: Aktif & Maintained
