<div align="center">

<img src="docs/images/banner.png" alt="Sistem Absensi & HRIS Digital MA AL KARIMIYAH" width="100%"/>

<br/>

# 🏫 Sistem Absensi & HRIS Digital
## MA AL KARIMIYAH — Madrasah Aliyah

**Presensi guru berbasis GPS & selfie · Absensi siswa KBM · Rekapitulasi honor digital · Manajemen jadwal madrasah**

<br/>

[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/Lisensi-Proprietary-red?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](#-lisensi--hak-cipta)

</div>

---

## 📋 Daftar Isi

- [Fitur Unggulan](#-fitur-unggulan)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Instalasi & Menjalankan](#-instalasi--menjalankan-aplikasi)
- [Akses dari HP](#-akses-dari-hp--perangkat-lain)
- [Akun Default](#-akun-default)
- [Deployment Produksi](#-deployment-produksi-vps--docker)
- [Struktur Direktori](#-struktur-direktori)
- [Troubleshooting](#-troubleshooting)
- [Verifikasi Build](#-verifikasi-build)
- [Lisensi](#-lisensi--hak-cipta)

---

## 🌟 Fitur Unggulan

<table>
<tr>
<td width="50%">

### 📍 Presensi Guru
- Validasi radius GPS (Geofencing) dengan peta Leaflet interaktif
- Verifikasi foto selfie real-time saat Masuk & Pulang
- Status otomatis: Hadir, Terlambat, Izin, Sakit, Cuti
- Pencegahan fraud via validasi koordinat GPS

</td>
<td width="50%">

### 🔄 Izin & Guru Pengganti
- Pengajuan izin/cuti/sakit dengan unggah bukti surat
- Delegasi tugas ke Guru Pengganti
- Alur notifikasi & konfirmasi di dashboard

</td>
</tr>
<tr>
<td width="50%">

### 🎓 Presensi Siswa & KBM
- Manajemen tahun ajaran, kelas, dan wali kelas
- Data induk siswa (NIS, NISN, orang tua, kelas)
- Absensi per jam mata pelajaran (Hadir/Izin/Sakit/Alpa)
- Rekapitulasi per kelas, siswa, dan rentang tanggal

</td>
<td width="50%">

### 💰 Honor & Slip Gaji Digital
- Perhitungan otomatis jam tatap muka × tarif honor
- Honor struktural & tunjangan jabatan
- Slip gaji digital — cetak & unduh langsung
- Distribusi slip online + tracking status baca

</td>
</tr>
<tr>
<td width="50%">

### 📅 Jadwal & Kalender Akademik
- Plotting jadwal per hari, kelas, dan jam pelajaran
- Kalender hari libur nasional & cuti bersama
- Presensi otomatis nonaktif di hari libur

</td>
<td width="50%">

### 👥 Hak Akses Multi-Peran (RBAC)
- **Admin** — master data, jadwal, honor, pengaturan
- **Kepala Madrasah** — monitoring & laporan eksekutif
- **Guru** — absensi, presensi siswa, jadwal, slip honor

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|:---|:---|
| **Backend API** | Go (Golang) 1.21+ · Fiber v2 |
| **Database** | PostgreSQL 14+ · pgx/v5 connection pool |
| **Cache & Session** | Redis 7 |
| **Frontend** | Next.js 16 (App Router) · React 19 · CSS Custom Properties |
| **Peta & Geofence** | Leaflet.js (OpenStreetMap) |
| **CI/CD** | GitHub Actions — CodeQL · Semgrep · Gitleaks · TruffleHog |
| **Container** | Docker · Docker Compose |

---

## 📋 Prerequisites

Pastikan software berikut sudah terpasang sebelum memulai:

| Software | Versi Minimum | Link |
|:---|:---|:---|
| Git | terbaru | [git-scm.com](https://git-scm.com/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Go (Golang) | 1.21+ | [go.dev/dl](https://go.dev/dl/) |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) |
| Redis | 7 *(opsional)* | [redis.io](https://redis.io/) |

---

## 🚀 Instalasi & Menjalankan Aplikasi

### Langkah 1 — Setup Database

```bash
# Buat database
psql -h 127.0.0.1 -p 5432 -U postgres -c "CREATE DATABASE paspapan;"

# Instalasi baru — jalankan schema lengkap
psql -h 127.0.0.1 -p 5432 -U postgres -d paspapan -f backend/db/schema.sql
```

<details>
<summary>📄 Database yang sudah ada — jalankan migration berurutan</summary>

```bash
psql ... -f backend/db/migrations/001_create_madrasah_tables.sql
psql ... -f backend/db/migrations/002_modul_siswa.sql
psql ... -f backend/db/migrations/003_guru_identitas.sql
psql ... -f backend/db/migrations/004_pengganti_rentang.sql
psql ... -f backend/db/migrations/005_identitas_lengkap.sql
psql ... -f backend/db/migrations/006_perf_indexes.sql
psql ... -f backend/db/migrations/008_add_izinkan_pengganti.sql
psql ... -f backend/db/migrations/009_add_unique_absensi_slot.sql
psql ... -f backend/db/migrations/010_alur_kerja_revisi.sql
psql ... -f backend/db/migrations/010_refactor_erd.sql
psql ... -f backend/db/migrations/011_absensi_gabungan.sql
```

> **Migration 011** menambahkan kolom `sumber`, view `madrasah_absensi_gabungan`, dan index pendukung. Wajib dijalankan **sebelum** backend versi baru diaktifkan.

</details>

---

### Langkah 2 — Backend (Go)

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgres://postgres:PASSWORD_ANDA@127.0.0.1:5432/paspapan?sslmode=disable
PORT=8080
JWT_SECRET=rahasia-super-aman-ganti-di-production-minimal-32-karakter
```

> ⚠️ Simpan `.env` dengan encoding **UTF-8 Plain (Tanpa BOM)**. `JWT_SECRET` wajib minimal 32 karakter acak.

```bash
go run ./cmd/seed/main.go   # (opsional) isi data awal
go run main.go              # jalankan server → http://localhost:8080
```

---

### Langkah 3 — Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev   # → http://localhost:3000
```

---

## 📱 Akses dari HP / Perangkat Lain

> Fitur absensi butuh **Kamera** dan **GPS**. Browser modern mewajibkan **HTTPS** atau `localhost`.

### ✅ Opsi A — Cloudflare Tunnel *(Direkomendasikan)*

```bash
npx cloudflared tunnel --url http://127.0.0.1:3000
```

Salin URL HTTPS yang muncul → buka di HP → kamera & GPS langsung aktif.

### 📶 Opsi B — WiFi Lokal

1. Cek IP: PowerShell → `ipconfig` → catat **IPv4 Address**
2. Buka `http://192.168.x.x:3000` di browser HP
3. Aktifkan kamera/GPS di HTTP: `chrome://flags` → `Insecure origins treated as secure` → tambahkan alamat → **Enable** → Relaunch

---

## 🔑 Akun Default

> Tersedia setelah menjalankan database seeder.

| Peran | Username | Password | Akses |
|:---|:---|:---|:---|
| Admin Madrasah | `admin` | `admin123` | Master data, jadwal, honor, pengaturan sekolah |
| Kepala Madrasah | `kepala` | `kepala123` | Dashboard monitoring, rekap, cetak laporan |
| Guru (Al-Qur'an Hadits) | `guru1` | `guru123` | Absensi, presensi siswa, jadwal, slip honor |
| Guru (Matematika) | `ahmadfauzi` | `guru123` | Akun guru mata pelajaran Matematika |
| Guru (IPA) | `sitiaminah` | `guru123` | Akun guru mata pelajaran IPA |

---

## 🐳 Deployment Produksi (VPS + Docker)

> ⚠️ Aplikasi **tidak kompatibel dengan shared hosting** (Hostinger cPanel, dsb.) — butuh PostgreSQL persisten dan proses Go yang berjalan terus-menerus.

### Arsitektur

```
Browser  ──►  Nginx  ──┬──►  /api/*, /uploads/*  ──►  Go Fiber :8080  ──►  PostgreSQL 17
                       └──►  /*                   ──►  Next.js :3000
                                                               └──►  Redis 7
```

Rate limit: **1.200 req/mnt** · **10 login/mnt per akun** · **100 login/mnt per IP**

---

### Deploy Step-by-Step

**1. VPS** — minimal 2 vCPU / 2 GB RAM / 60 GB SSD:

```bash
apt update && apt upgrade -y
# Pasang Docker Engine + Compose plugin (ikuti panduan resmi Docker untuk Ubuntu)
```

**2. Clone & konfigurasi:**

```bash
git clone <URL_REPO> /opt/paspapan
cd /opt/paspapan && cp .env.example .env
openssl rand -base64 24   # → POSTGRES_PASSWORD
openssl rand -hex 32      # → JWT_SECRET
nano .env
```

**3. Jalankan:**

```bash
docker compose up -d --build
curl http://IP_VPS/nginx-health   # harus balas: ok
```

**4. HTTPS (Let's Encrypt):**

Buat A record `absensimakarimiyah.tech` → IP VPS. Sertifikat diperbarui otomatis tiap 12 jam.

> Setelah mengubah `nginx/default.conf`:
> ```bash
> docker compose up -d --force-recreate nginx
> ```

**5. Migration pada database yang sudah ada:**

```bash
# Backup dulu
docker compose exec -T db pg_dump -U paspapan -d paspapan -Fc > ./backups/pre-011.dump

# Jalankan migration
docker compose exec -T db psql -U paspapan -d paspapan -v ON_ERROR_STOP=1 \
  < backend/db/migrations/011_absensi_gabungan.sql
```

**6. Operasi sehari-hari:**

```bash
docker compose logs -f backend          # lihat log
docker compose restart backend          # restart
docker compose up -d --build            # deploy versi baru (setelah git pull)
docker compose down                     # stop (data aman di volume)
docker compose exec db psql -U paspapan -d paspapan   # akses psql
```

---

## 📂 Struktur Direktori

```
apk-absen-karimiyah/
│
├── 📁 backend/                     # Server API Go (Fiber)
│   ├── cmd/seed/                   # Seeder data awal
│   ├── db/
│   │   ├── schema.sql              # Struktur tabel lengkap (install baru)
│   │   └── migrations/             # Migration idempotent (001–012)
│   ├── internal/
│   │   ├── config/                 # Konfigurasi environment
│   │   ├── database/               # Connection pool pgx & Redis
│   │   ├── middleware/             # Rate limiter, JWT auth, CORS
│   │   ├── modules/madrasah/       # Logika bisnis (Guru, Siswa, KBM, Honor)
│   │   └── router/                 # Pendaftaran rute API
│   ├── storage/uploads/            # File upload foto selfie
│   ├── .env.example
│   ├── Dockerfile
│   └── main.go
│
├── 📁 frontend/                    # Aplikasi Web (Next.js 16)
│   ├── app/                        # App Router (layout, page, globals.css)
│   ├── public/                     # Static assets (app.js, logo, manifest)
│   ├── src/js/                     # Modul JS (auth, absensi, honor, jadwal…)
│   ├── scripts/                    # Build & validasi tools
│   ├── Dockerfile
│   └── package.json
│
├── 📁 docs/images/                 # Aset dokumentasi & banner
├── 📄 nginx/default.conf           # Reverse proxy + HTTP/HTTPS
├── 📄 docker-compose.yml           # Orkestrasi produksi
├── 📄 .env.example                 # Template environment
├── 📄 .github/workflows/           # CI & Security scanning
└── 📄 README.md
```

---

## 🔧 Troubleshooting

<details>
<summary><b>❌ "dial tcp 127.0.0.1:5432: connectex: No connection could be made"</b></summary>

Service PostgreSQL belum berjalan. Buka **Services** (`Win+R` → `services.msc`) → cari `postgresql-x64-XX` → klik kanan → **Start**.
</details>

<details>
<summary><b>❌ Database berjalan di port 5433</b></summary>

Ubah `DATABASE_URL` di `backend/.env`:
```env
DATABASE_URL=postgres://postgres:password@localhost:5433/paspapan?sslmode=disable
```
</details>

<details>
<summary><b>❌ "unexpected character U+FEFF"</b></summary>

File `.env` tersimpan dengan BOM. Di VS Code, klik encoding di status bar kanan bawah → **Save with Encoding** → **UTF-8** (tanpa BOM).
</details>

<details>
<summary><b>❌ Kamera atau GPS tidak muncul di HP</b></summary>

Gunakan HTTPS via Cloudflare Tunnel:
```bash
npx cloudflared tunnel --url http://127.0.0.1:3000
```
Atau aktifkan di `chrome://flags` → `Insecure origins treated as secure`.
</details>

<details>
<summary><b>⚙️ Mengubah titik koordinat & radius geofence</b></summary>

Login sebagai **Admin** → **Pengaturan Sekolah** → geser pin pada peta atau masukkan koordinat Latitude, Longitude, Radius (meter) → **Simpan**.
</details>

---

## ✅ Verifikasi Build

```bash
# Backend — compile check + unit test
cd backend && go vet ./... && go test ./...

# PostgreSQL integration test
cd backend && go test -tags integration ./...

# Frontend — build, lint, validasi HTML
cd frontend && npm run build:app && npx eslint src/js && npm run validate:html && npm run build
```

---

## 📄 Lisensi & Hak Cipta

<div align="center">

```
╔══════════════════════════════════════════════════════════════════╗
║           HAK CIPTA © 2024–2026 MA AL KARIMIYAH                 ║
║               Madrasah Aliyah Al Karimiyah                      ║
║                 Seluruh hak dilindungi.                         ║
╚══════════════════════════════════════════════════════════════════╝
```

Perangkat lunak ini bersifat **proprietary** dan dikembangkan khusus untuk<br/>
keperluan internal operasional **MA AL KARIMIYAH**.

Dilarang keras **menyalin, mendistribusikan, memodifikasi,** atau **menggunakan**<br/>
seluruh maupun sebagian kode sumber ini tanpa izin tertulis dari pemilik hak cipta.

</div>

---

<div align="center">

Dikembangkan dengan ❤️ untuk **MA AL KARIMIYAH**

**Digital · Terintegrasi · Efisien**

<br/>

*© 2024–2026 MA AL KARIMIYAH. All rights reserved.*

</div>
