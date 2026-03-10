# Blueprint Arsitektur Sistem Billing ISP

**Dokumen Teknis**: Deskripsi detail arsitektur, struktur database, dan alur sistem  
**Versi**: 1.0.0  
**Tanggal**: 10 Maret 2026

---

## 📋 Daftar Isi

- [Arsitektur Sistem](#arsitektur-sistem)
- [Diagram Alur](#diagram-alur)
- [Struktur Database](#struktur-database)
- [Relasi Tabel](#relasi-tabel)
- [Komponen Aplikasi](#komponen-aplikasi)
- [Flow Data](#flow-data)
- [Design Pattern](#design-pattern)

---

## 🏗️ Arsitektur Sistem

### Tipe Arsitektur: **MVC-style Web Application**

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
│  (Browser - HTML, CSS, JavaScript)                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               PRESENTATION LAYER                         │
│  (PHP Views - dashboard.php, pelanggan.php, dll)        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               BUSINESS LOGIC LAYER                       │
│  (PHP Logic - Processing, Validation, Auto-generation)  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               DATA ACCESS LAYER                          │
│  (config.php - Database Connection & Functions)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               DATA LAYER                                 │
│  (MySQL Database - Tables, Triggers, Constraints)       │
└─────────────────────────────────────────────────────────┘
```

### Teknologi Stack

| Layer | Teknologi | Deskripsi |
|-------|-----------|-----------|
| **Frontend** | HTML5, CSS3, JavaScript | UI/UX dengan CSS Grid & Flexbox |
| **Backend** | PHP 7.4+ | Server-side logic dan processing |
| **Database** | MySQL/MariaDB 5.7+ | Data persistence |
| **Web Server** | Apache/Nginx | HTTP Server |
| **Session** | PHP Native | Authentication & Session management |

---

## 📊 Diagram Alur

### 1. Login Flow

```
User Input (Username/Password)
        ↓
POST request ke login.php
        ↓
Validasi Input (tidak kosong)
        ↓
Ceck Credentials (admin/12345)
        ↓
✓ Valid                           ✗ Invalid
        ↓                                ↓
Set $_SESSION['user_id']    Display Error Message
Set $_SESSION['username']             ↓
Set $_SESSION['login_time']    Redirect: login.php
        ↓
Redirect: dashboard.php
        ↓
Dashboard Loaded
```

### 2. Add Customer Flow

```
User Input Form (Pelanggan Data)
        ↓
POST request ke pelanggan.php (add_pelanggan)
        ↓
Sanitasi & Validasi Input
        ↓
Check PPPoE Username Uniqueness
        ↓
✓ Unique                      ✗ Exists
        ↓                           ↓
Fetch Package Price       Display Error
        ↓                           ↓
INSERT ke tabel pelanggan   Reload Form
        ↓
Trigger: validate_pelanggan_data
        ↓
Trigger: Auto-set harga dari paket
        ↓
✓ Success                    ✗ Error
        ↓                           ↓
Redirect: pelanggan.php   Display Error Msg
```

### 3. Auto-Generate Invoice Flow

```
Trigger: generate_tagihan.php
        ↓
Loop semua Pelanggan (status: active/limit)
        ↓
Calculate Due Date (based on jatuh_tempo)
        ↓
Generate Tagihan Date (3 hari sebelumnya)
        ↓
Check existing tagihan (avoid duplicate)
        ↓
✓ Not Exists              ✗ Exists
        ↓                      ↓
INSERT Tagihan         Skip (increment skipped)
        ↓
Update Customer Status (based on late payment)
        ↓
        ↓
Active → Limit? (1-5 hari overdue)
Limit → Tertunda? (5+ hari overdue)
Tertunda → Inactive? (10+ hari overdue)
        ↓
Return: success, generated count, skipped count
```

### 4. Payment Update Flow

```
User Click: Update Status Bayar
        ↓
POST request dengan tagihan_id & status
        ↓
Validasi Data
        ↓
UPDATE tagihan SET status_bayar = ?
        ↓
Trigger: update_tagihan_timestamp
        ↓
✓ Success                    ✗ Error
        ↓                           ↓
Redirect: tagihan.php     Display Error
        ↓
Table reloaded dengan status baru
```

---

## 🗄️ Struktur Database

### Entity Relationship Diagram (ERD)

```
┌──────────────────┐      ┌──────────────────┐
│  paket_bandwidth │      │    ip_pools      │
├──────────────────┤      ├──────────────────┤
│ id (PK)          │◄─────│ id (PK)          │
│ name             │  1:M │ name             │
│ id_local_address │─────►│ start_ip         │
│ id_remote_address│      │ end_ip           │
│ speed_limit      │      │ gateway          │
│ price            │      │ created_at       │
│ created_at       │      │ updated_at       │
│ updated_at       │      └──────────────────┘
└────────┬─────────┘
         │ 1:M
         │
         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │   pelanggan      │      │     tagihan      │
    ├──────────────────┤      ├──────────────────┤
    │ id (PK)          │◄─────│ id (PK)          │
    │ nama             │  1:M │ pelanggan_id (FK)│
    │ user_pppoe       │      │ tanggal_tagihan  │
    │ password_pppoe   │      │ tanggal_jatuh_   │
    │ paket_id (FK)────┼─────►│   tempo          │
    │ jatuh_tempo      │      │ status_bayar     │
    │ harga            │      │ created_at       │
    │ status           │      │ updated_at       │
    │ created_at       │      └──────────────────┘
    │ updated_at       │
    └──────────────────┘
```

### Tabel Lengkap & Detil

#### 1. **ip_pools**
Menyimpan konfigurasi IP Pool untuk Mikrotik

```sql
CREATE TABLE ip_pools (
  id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  start_ip varchar(15) NOT NULL,
  end_ip varchar(15) NOT NULL,
  gateway varchar(15) NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Triggers:**
- `validate_ip_format`: Validasi format dan range IP
- `update_ip_pool_timestamp`: Update timestamp otomatis

**Example Data:**
| id | name | start_ip | end_ip | gateway | Keterangan |
|----|------|----------|--------|---------|-----------|
| 90 | 10MBps | 192.168.10.1 | 192.168.10.253 | 192.168.10.254 | Pool untuk 10 Mbps |
| 91 | 20MBps | 192.168.20.1 | 192.168.20.253 | 192.168.20.254 | Pool untuk 20 Mbps |
| 92 | 30MBps | 192.168.30.1 | 192.168.30.253 | 192.168.30.254 | Pool untuk 30 Mbps |
| 94 | 50Mbps | 192.168.50.1 | 192.168.50.100 | 192.168.50.254 | Pool untuk 50 Mbps |

#### 2. **paket_bandwidth**
Menyimpan paket layanan yang ditawarkan

```sql
CREATE TABLE paket_bandwidth (
  id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  id_local_address int(11) NOT NULL,
  id_remote_address int(11) NOT NULL,
  speed_limit varchar(50) NOT NULL,
  price int(11) NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_local_address) REFERENCES ip_pools(id),
  FOREIGN KEY (id_remote_address) REFERENCES ip_pools(id)
);
```

**Triggers:**
- `validate_paket_id_format`: Validasi ID dan harga
- `update_paket_timestamp`: Update timestamp

**Example Data:**
| id | name | speed_limit | price | Bandwidth |
|----|------|-------------|-------|-----------|
| 27 | Paket 10 Mbps | 10M/10M | 99000 | 10 Mbps |
| 28 | Paket 20 Mbps | 20M/20M | 130000 | 20 Mbps |
| 29 | Paket 30 Mbps | 30M/30M | 180000 | 30 Mbps |
| 32 | Paket 50 Mbps | 50M/50M | 250000 | 50 Mbps |

#### 3. **pelanggan**
Menyimpan data pelanggan ISP

```sql
CREATE TABLE pelanggan (
  id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nama varchar(100) NOT NULL,
  user_pppoe varchar(50) NOT NULL UNIQUE,
  password_pppoe varchar(100) NOT NULL,
  paket_id int(11) NOT NULL,
  jatuh_tempo int(2) NOT NULL CHECK (jatuh_tempo BETWEEN 1 AND 31),
  harga int(11) NOT NULL DEFAULT 0,
  status enum('active','limit','tertunda','inactive') DEFAULT 'active',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (paket_id) REFERENCES paket_bandwidth(id)
);
```

**Kolom Penting:**
- `user_pppoe`: Unique identifier untuk koneksi PPPoE
- `jatuh_tempo`: Hari dalam bulan (1-31) kapan tagihan jatuh tempo
- `status`: Menentukan akses pelanggan pada jaringan
- `harga`: Auto-copy dari paket_bandwidth

**Status Pelanggan:**
- `active`: Pembayaran on-time, layanan aktif
- `limit`: Pembayaran overdue 1-5 hari, bandwidth limited
- `tertunda`: Pembayaran overdue 5+ hari, akses terbatas
- `inactive`: Tidak aktif, layanan ditutup

**Example Data:**
| id | nama | user_pppoe | paket_id | jatuh_tempo | status |
|----|------|-----------|----------|-------------|--------|
| 2 | elam | elam | 32 | 7 | active |
| 3 | Irfan Dharmawan | irfan | 32 | 2 | inactive |
| 6 | test | admin | 28 | 12 | active |

#### 4. **tagihan** 
Catatan invoice pelanggan

```sql
CREATE TABLE tagihan (
  id int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pelanggan_id int(11) NOT NULL,
  tanggal_tagihan date NOT NULL,
  tanggal_jatuh_tempo date NOT NULL,
  status_bayar enum('belum','sudah') DEFAULT 'belum',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id)
);
```

**Kolom Penting:**
- `tanggal_tagihan`: Tanggal tagihan dibuat (3 hari sebelum jatuh tempo)
- `tanggal_jatuh_tempo`: Batas akhir pembayaran
- `status_bayar`: Status pembayaran (belum/sudah)

**Example Data:**
| id | pelanggan_id | tanggal_tagihan | tanggal_jatuh_tempo | status_bayar |
|----|--------------|-----------------|---------------------|--------------|
| 11 | 2 | 2026-03-04 | 2026-03-07 | belum |
| 12 | 6 | 2026-03-09 | 2026-03-12 | belum |
| 13 | 3 | 2026-02-27 | 2026-03-02 | belum |

---

## 🔗 Relasi Tabel

### Foreign Key Relationships

```
ip_pools (1) ─────→ (M) paket_bandwidth
  └─ id                ├─ id_local_address
                       └─ id_remote_address

paket_bandwidth (1) ─────→ (M) pelanggan
  └─ id                        └─ paket_id

pelanggan (1) ─────→ (M) tagihan
  └─ id                   └─ pelanggan_id
```

### Constraint & Validation

| Tabel | Validasi | Rule |
|-------|----------|------|
| ip_pools | IP Format | Start < End (INET_ATON) |
| ip_pools | IP Regex | ^([0-9]{1,3}\.){3}[0-9]{1,3}$ |
| paket_bandwidth | Price | > 0 |
| paket_bandwidth | Foreign Key | ID harus exist di ip_pools |
| pelanggan | Jatuh Tempo | BETWEEN 1 AND 31 |
| pelanggan | Auto Harga | Copy dari paket_bandwidth.price |
| pelanggan | User PPPoE | UNIQUE |
| tagihan | Status | enum('belum','sudah') |

---

## 🎯 Komponen Aplikasi

### File Structure & Responsibility

#### **Entry Point**
- **index.php** (Router)
  - Cek session, redirect ke login atau dashboard

#### **Authentication**
- **login.php** (Login Page)
  - Form login dengan validasi
  - Hardcoded credentials: admin/12345
  - Session creation

#### **Layout Components**
- **navbar.php** (Sidebar Navigation)
  - Menu navigation dengan dropdown
  - User info dan logout
  - Responsive design
  
- **header.php** (Content Header)
  - Welcome message
  - Current date/time
  - Notification badge
  
- **style.css** (Stylesheet)
  - Modern design dengan gradient
  - Responsive grid layout
  - Animation & transitions
  
- **script.js** (JavaScript)
  - DOM animations
  - Form validation
  - User interactions

#### **Main Modules**
- **dashboard.php** (Dashboard)
  - Menu cards dengan 4 kategori utama
  - Entry point ke modul lain
  - Statistics summary
  
- **pelanggan.php** (Customer Management)
  - List pelanggan dengan CRUD
  - Form tambah/edit pelanggan
  - Filter & search
  - Status management
  
- **tagihan.php** (Invoice Management)
  - List tagihan dengan JOIN ke pelanggan
  - Button generate tagihan
  - Update payment status
  - Invoice statistics
  
- **generate_tagihan.php** (Invoice Generator)
  - Auto-generate invoices
  - Update customer status based on payment
  - Logic untuk skipped duplicate
  
#### **Mikrotik Management**
- **mikrotik/pool.php** (IP Pool)
  - CRUD untuk IP Pool
  - IP validation
  - Connected ke paket_bandwidth
  
- **mikrotik/paket.php** (Bandwidth Package)
  - CRUD untuk paket bandwidth
  - Link ke IP Pool
  - Price management
  
- **mikrotik/process_paket.php** (AJAX Handler)
  - AJAX processor untuk paket
  - JSON response
  - Backend logic
  
- **mikrotik/process_pool.php** (AJAX Handler)
  - AJAX processor untuk pool
  - JSON response

#### **Configuration & Utility**
- **config.php** (Database Config)
  - Database connection (mysqli)
  - Helper functions:
    - `cleanInput()` - Input sanitization
    - `validateIP()` - IP format validation
    - `validateIPRange()` - Range validation
  - Global $conn object

#### **Database**
- **dashboard.sql** (Database Dump)
  - Schema definition
  - Triggers
  - Sample data
  - Constraints

---

## 🔄 Flow Data

### 1. Pelanggan Registration Flow

```
┌─────────────────────────────────────┐
│  Form: Tambah Pelanggan             │
├─────────────────────────────────────┤
│ - Nama                              │
│ - User PPPoE                        │
│ - Password PPPoE (opt)              │
│ - Paket ID (dropdown)               │
│ - Jatuh Tempo (1-31)                │
│ - Status                            │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Validasi Input                     │
├─────────────────────────────────────┤
│ ✓ Not empty                         │
│ ✓ User PPPoE unique                 │
│ ✓ Jatuh Tempo valid (1-31)          │
│ ✓ Paket exists                      │
└────────┬────────────────────────────┘
         │
         ▼ (if all valid)
┌─────────────────────────────────────┐
│  Generate Password                  │
├─────────────────────────────────────┤
│ if (empty(password))                │
│   password = username + "122"       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Database INSERT                    │
├─────────────────────────────────────┤
│ Fetch harga dari paket_bandwidth    │
│ INSERT INTO pelanggan VALUES (...)  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Database Trigger Executed          │
├─────────────────────────────────────┤
│ validate_pelanggan_data             │
│ - Check jatuh_tempo                 │
│ - Check paket_id exists             │
│ - Auto-set harga                    │
└────────┬────────────────────────────┘
         │
         ▼ (if success)
┌─────────────────────────────────────┐
│  Success ✓                          │
│  Redirect ke pelanggan.php          │
└─────────────────────────────────────┘
```

### 2. Invoice Generation Flow

```
Trigger: generateTagihan()
   │
   ├─→ foreach pelanggan (status IN active, limit)
   │
   ├─→ Calculate:
   │   - Current year/month
   │   - Due date day (jatuh_tempo)
   │   - Due date (yyyy-mm-dd)
   │   - Bill date (3 hari sebelumnya)
   │
   ├─→ Check: Invoice already exists?
   │   │
   │   ├─ YES → Skip (increment skipped)
   │   │
   │   └─ NO → Insert invoice
   │       │
   │       └─→ Set created_at
   │
   ├─→ After all invoices:
   │
   └─→ updateStatusPelanggan()
       │
       ├─→ Query: Unpaid invoices
       │
       ├─→ Check: Days overdue
       │   │
       │   ├─ 1-5 days: Status = limit
       │   ├─ 5+ days: Status = tertunda
       │   └─ 10+ days: Status = inactive
       │
       └─→ Update pelanggan.status
```

### 3. Payment Processing Flow

```
User Interface
   │
   ▼
Form: Update Status Bayar
   │
   ├─ Select: Tagihan
   ├─ Select: Status (Belum/Sudah)
   ├─ Click: Update
   │
   ▼
POST: tagihan.php (bayar_tagihan)
   │
   ├─ Validate input
   │
   ▼
Database
   │
   ├─ UPDATE tagihan SET status_bayar = ? WHERE id = ?
   │
   ▼
Trigger: update_tagihan_timestamp
   │
   ├─ SET updated_at = CURRENT_TIMESTAMP
   │
   ▼
Response
   │
   ├─ Success: Redirect & display message
   │ Failure: Show error
   │
   ▼
User sees updated table
```

---

## 🎨 Design Pattern

### 1. **MVC-like Pattern**
- **Model**: Database operations in config.php
- **View**: HTML templates (*.php files)
- **Controller**: Business logic dalam satu file

### 2. **Singleton Pattern voor Database Connection**
```php
// Global $conn diinisialisasi sekali di config.php
// Digunakan di seluruh aplikasi tanpa re-connect
```

### 3. **Prepared Statements**
```php
$stmt = $conn->prepare("SELECT * FROM pelanggan WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
```
Mencegah SQL Injection

### 4. **Trigger-based Validation**
Database-level validation menggunakan MySQL triggers untuk:
- Data consistency
- Automatic calculations
- Business rule enforcement

### 5. **Helper Functions**
```php
cleanInput($data)      // Input sanitization
validateIP($ip)        // IP validation
validateIPRange(...)   // Range validation
```

### 6. **Session-based Authentication**
```php
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}
```

---

## 🔒 Security Architecture

### Input Protection
1. **Input Sanitization**: `htmlspecialchars()`, `trim()`
2. **Prepared Statements**: Parameterized queries
3. **Type Binding**: Specific type validation

### Session Protection
1. **Session Check**: Setiap halaman
2. **Session Variables**: user_id, username, login_time
3. **Logout**: Session destroy

### Database Protection
1. **Triggers**: Validasi di level database
2. **Constraints**: Foreign keys, CHECK clauses
3. **ENUM fields**: Whitelist values

### Access Control
- Public: login.php, index.php
- Protected: Semua halaman lain (require session)

---

## 📈 Skalabilitas & Performance

### Database Optimization
- Indexes pada primary keys (otomatis)
- Foreign key relationships
- Prepared statements (caching)
- Timestamps untuk audit trail

### Code Optimization
- Single database connection (global $conn)
- Query optimization dengan JOIN
- No N+1 query problems
- Efficient loop structures

### Potential Performance Bottlenecks
1. Large pelanggan tables → Implementasi pagination
2. Complex triggers → Monitor execution time
3. Report generation → Cache results

---

## 🔧 Configuration Points

### Database
- server: localhost (ubah untuk remote DB)
- username: root (ubah sesuai setup)
- password: "" (kosong di XAMPP default)
- database: dashboard (harus ada)

### Session
- Timeout: Default PHP (24 minutes)
- Path: /tmp (default)
- Cookie: Secure flag (untuk HTTPS)

### Application
- Credentials: Hardcoded di login.php
- Date format: 'Y-m-d' (ISO format)
- Default password suffix: "122" untuk new customers
- Invoice offset: 3 hari sebelum due date

---

**Last Updated**: 10 Maret 2026  
**Status**: Production Ready
