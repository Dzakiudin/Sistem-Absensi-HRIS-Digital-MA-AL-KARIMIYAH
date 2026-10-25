-- ============================================================
-- MIGRATION 002: MODUL SISWA & PRESENSI SISWA
-- Menambahkan master tahun ajaran, kelas, siswa, enrollment,
-- dan absensi siswa beserta index pendukung.
-- Idempotent: aman dijalankan pada DB yang sudah ada.
-- ============================================================
CREATE TABLE IF NOT EXISTS madrasah_tahun_ajaran (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(50) UNIQUE NOT NULL, -- mis. 2025/2026
    semester VARCHAR(20) NOT NULL DEFAULT 'Ganjil', -- Ganjil / Genap
    nama VARCHAR(100) NOT NULL,
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    aktif BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS madrasah_kelas (
    id SERIAL PRIMARY KEY,
    kode_kelas VARCHAR(20) UNIQUE NOT NULL, -- mis. VII-A
    nama_kelas VARCHAR(50) NOT NULL, -- mis. Kelas VII-A
    tingkat VARCHAR(10) DEFAULT 'VII', -- VII / VIII / IX
    wali_kelas_id INT REFERENCES madrasah_users (id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS madrasah_siswa (
    id SERIAL PRIMARY KEY,
    nis VARCHAR(30) UNIQUE NOT NULL,
    nisn VARCHAR(30) DEFAULT '',
    nama_lengkap VARCHAR(255) NOT NULL,
    jenis_kelamin VARCHAR(20) DEFAULT 'Laki-laki', -- Laki-laki / Perempuan
    tempat_lahir VARCHAR(100) DEFAULT '',
    tanggal_lahir VARCHAR(20) DEFAULT '', -- dd/MM/yyyy
    alamat TEXT DEFAULT '',
    nama_ortu VARCHAR(255) DEFAULT '',
    no_hp_ortu VARCHAR(50) DEFAULT '',
    status VARCHAR(20) DEFAULT 'Aktif', -- Aktif / Alumni / Pindah
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relasi siswa -> kelas per tahun ajaran (memungkinkan kenaikan/pindah kelas)
CREATE TABLE IF NOT EXISTS madrasah_enrollment (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL REFERENCES madrasah_siswa (id) ON DELETE CASCADE,
    kelas_id INT NOT NULL REFERENCES madrasah_kelas (id) ON DELETE CASCADE,
    tahun_ajaran_id INT NOT NULL REFERENCES madrasah_tahun_ajaran (id) ON DELETE CASCADE,
    tanggal_masuk DATE DEFAULT CURRENT_DATE,
    tanggal_keluar DATE,
    UNIQUE (siswa_id, tahun_ajaran_id)
);

-- Presensi siswa per sesi pembelajaran (terikat jadwal KBM)
CREATE TABLE IF NOT EXISTS madrasah_absensi_siswa (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL REFERENCES madrasah_siswa (id) ON DELETE CASCADE,
    kelas_id INT NOT NULL REFERENCES madrasah_kelas (id) ON DELETE CASCADE,
    jadwal_id INT REFERENCES madrasah_jadwal (id) ON DELETE SET NULL,
    tanggal DATE NOT NULL,
    jam_ke VARCHAR(20) NOT NULL,
    mata_pelajaran VARCHAR(255) NOT NULL DEFAULT '',
    guru_username VARCHAR(100) NOT NULL,
    status VARCHAR(5) NOT NULL DEFAULT 'H', -- H / I / S / A / T
    keterangan TEXT DEFAULT '',
    editor_username VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (siswa_id, kelas_id, jam_ke, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_kelas_tahun ON madrasah_enrollment (kelas_id, tahun_ajaran_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_siswa ON madrasah_enrollment (siswa_id);

CREATE INDEX IF NOT EXISTS idx_absensi_siswa_kelas_tanggal ON madrasah_absensi_siswa (kelas_id, tanggal);

CREATE INDEX IF NOT EXISTS idx_absensi_siswa_siswa ON madrasah_absensi_siswa (siswa_id);