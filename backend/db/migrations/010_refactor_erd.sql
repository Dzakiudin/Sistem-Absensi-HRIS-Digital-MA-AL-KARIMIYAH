-- ============================================================
-- MIGRATION 010: Refactor ERD — Tabel baru & kolom baru
-- Aman dijalankan berulang (idempotent) berkat IF NOT EXISTS
-- dan DO $$ guard pada ALTER TABLE.
-- ============================================================

-- ============================================================
-- 1) KOLOM BARU DI TABEL YANG SUDAH ADA
-- ============================================================

-- madrasah_jadwal: mapel_id, jam_mulai, jam_selesai
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='madrasah_jadwal' AND column_name='mapel_id') THEN
        ALTER TABLE madrasah_jadwal ADD COLUMN mapel_id INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='madrasah_jadwal' AND column_name='jam_mulai') THEN
        ALTER TABLE madrasah_jadwal ADD COLUMN jam_mulai TIME;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='madrasah_jadwal' AND column_name='jam_selesai') THEN
        ALTER TABLE madrasah_jadwal ADD COLUMN jam_selesai TIME;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jadwal_mapel ON madrasah_jadwal (mapel_id);

-- madrasah_absensi_siswa: sesi_id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='madrasah_absensi_siswa' AND column_name='sesi_id') THEN
        ALTER TABLE madrasah_absensi_siswa ADD COLUMN sesi_id INT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_abs_siswa_sesi ON madrasah_absensi_siswa (sesi_id);

-- ============================================================
-- 2) TABEL BARU
-- ============================================================

-- 2a) Master Mapel
CREATE TABLE IF NOT EXISTS madrasah_mapel (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(20) DEFAULT '',
    nama VARCHAR(100) NOT NULL UNIQUE,
    kelompok VARCHAR(50) DEFAULT 'Wajib',
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapel_aktif ON madrasah_mapel (aktif);

-- 2b) Absensi Harian (Masuk / Pulang)
CREATE TABLE IF NOT EXISTS madrasah_absensi_harian (
    id SERIAL PRIMARY KEY,
    tanggal DATE NOT NULL,
    username VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    jam_masuk TIME,
    jam_pulang TIME,
    status_terlambat BOOLEAN DEFAULT FALSE,
    menit_terlambat INT DEFAULT 0,
    lat_masuk NUMERIC(11, 7),
    lng_masuk NUMERIC(11, 7),
    jarak_masuk INT DEFAULT 0,
    foto_masuk TEXT DEFAULT '',
    maps_masuk TEXT DEFAULT '',
    lat_pulang NUMERIC(11, 7),
    lng_pulang NUMERIC(11, 7),
    jarak_pulang INT DEFAULT 0,
    foto_pulang TEXT DEFAULT '',
    maps_pulang TEXT DEFAULT '',
    status_waktu VARCHAR(20) NOT NULL DEFAULT 'Hadir',
    keterangan TEXT DEFAULT '',
    izin_id INT,
    dicatat_oleh VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_absensi_harian UNIQUE (username, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_abs_harian_tanggal ON madrasah_absensi_harian (tanggal);
CREATE INDEX IF NOT EXISTS idx_abs_harian_status ON madrasah_absensi_harian (tanggal, status_waktu);

-- 2c) Pengajuan Izin (Disetujui Kepala Madrasah)
CREATE TABLE IF NOT EXISTS madrasah_pengajuan_izin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    jenis VARCHAR(20) NOT NULL,
    tgl_mulai DATE NOT NULL,
    tgl_selesai DATE NOT NULL,
    alasan TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    diajukan_oleh VARCHAR(100) DEFAULT '',
    disetujui_oleh VARCHAR(100) DEFAULT '',
    waktu_keputusan TIMESTAMP,
    catatan_keputusan TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_izin_status ON madrasah_pengajuan_izin (status);
CREATE INDEX IF NOT EXISTS idx_izin_pemohon ON madrasah_pengajuan_izin (username, tgl_mulai, tgl_selesai);

-- FK: absensi_harian.izin_id -> pengajuan_izin.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_absensi_harian_izin') THEN
        ALTER TABLE madrasah_absensi_harian
            ADD CONSTRAINT fk_absensi_harian_izin
            FOREIGN KEY (izin_id) REFERENCES madrasah_pengajuan_izin(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2d) Guru Pengganti (terikat pengajuan izin)
CREATE TABLE IF NOT EXISTS madrasah_guru_pengganti (
    id SERIAL PRIMARY KEY,
    izin_id INT NOT NULL REFERENCES madrasah_pengajuan_izin(id) ON DELETE CASCADE,
    guru_asal VARCHAR(100) NOT NULL,
    nama_asal VARCHAR(255) NOT NULL,
    guru_pengganti VARCHAR(100) NOT NULL,
    nama_pengganti VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    alasan TEXT DEFAULT '',
    respond VARCHAR(100) DEFAULT '',
    waktu_respond TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pengganti_per_izin UNIQUE (izin_id)
);

CREATE INDEX IF NOT EXISTS idx_pengganti_izin ON madrasah_guru_pengganti (izin_id);
CREATE INDEX IF NOT EXISTS idx_pengganti_guru ON madrasah_guru_pengganti (guru_pengganti, status);

-- 2e) Sesi Mengajar (dari jadwal + penggantian)
CREATE TABLE IF NOT EXISTS madrasah_sesi_mengajar (
    id SERIAL PRIMARY KEY,
    jadwal_id INT NOT NULL,
    tanggal DATE NOT NULL,
    hari VARCHAR(20),
    jam_ke VARCHAR(10),
    jam_mulai TIME,
    jam_selesai TIME,
    mapel VARCHAR(100),
    kelas VARCHAR(50),
    pengajar_utama VARCHAR(100) NOT NULL,
    nama_pengajar VARCHAR(255) DEFAULT '',
    pengguna VARCHAR(100) NOT NULL,
    nama_pengganti VARCHAR(255) DEFAULT '',
    status_sesi VARCHAR(20) NOT NULL DEFAULT 'Mengajar',
    durasi_menit INT DEFAULT 40,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sesi UNIQUE (tanggal, jadwal_id)
);

CREATE INDEX IF NOT EXISTS idx_sesi_pengguna ON madrasah_sesi_mengajar (pengguna, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_asal ON madrasah_sesi_mengajar (pengajar_utama, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_tanggal ON madrasah_sesi_mengajar (tanggal);

-- 2f) Honor Guru + Rincian
CREATE TABLE IF NOT EXISTS madrasah_honor (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL DEFAULT '',
    tipe VARCHAR(20) NOT NULL DEFAULT 'guru',
    periode VARCHAR(7) NOT NULL DEFAULT '',
    tahun INT NOT NULL,
    bulan INT NOT NULL,
    total_sesi_reguler INT DEFAULT 0,
    total_sesi_pengganti INT DEFAULT 0,
    total_sesi INT DEFAULT 0,
    durasi_menit INT DEFAULT 0,
    honor_reguler BIGINT DEFAULT 0,
    honor_pengganti BIGINT DEFAULT 0,
    honor_struktural BIGINT DEFAULT 0,
    honor_tugas_tambahan BIGINT DEFAULT 0,
    total_nominal BIGINT DEFAULT 0,
    nama_pegawai VARCHAR(255) NOT NULL DEFAULT '',
    nip VARCHAR(50) DEFAULT '',
    role VARCHAR(50) DEFAULT '',
    total_honor NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_menit INT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    finalisasi_oleh VARCHAR(100) DEFAULT '',
    finalisasi_pada TIMESTAMP,
    tanggal_cetak DATE,
    catatan TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_honor UNIQUE (bulan, tahun, username)
);

CREATE INDEX IF NOT EXISTS idx_honor_periode ON madrasah_honor (bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_honor_username ON madrasah_honor (username, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_honor_status ON madrasah_honor (status);

CREATE TABLE IF NOT EXISTS madrasah_honor_detail (
    id SERIAL PRIMARY KEY,
    honor_id INT NOT NULL REFERENCES madrasah_honor(id) ON DELETE CASCADE,
    sesi_id INT REFERENCES madrasah_sesi_mengajar(id) ON DELETE SET NULL,
    tanggal DATE NOT NULL,
    mapel VARCHAR(255) DEFAULT '',
    kelas VARCHAR(50) DEFAULT '',
    jam_ke VARCHAR(20) DEFAULT '',
    jam_mulai TIME,
    jam_selesai TIME,
    jenis VARCHAR(20) NOT NULL DEFAULT 'Reguler',
    durasi_menit INT DEFAULT 0,
    tarif BIGINT DEFAULT 0,
    persen INT DEFAULT 100,
    nominal BIGINT DEFAULT 0,
    keterangan TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_honor_detail_honor ON madrasah_honor_detail (honor_id);
CREATE INDEX IF NOT EXISTS idx_honor_detail_tanggal ON madrasah_honor_detail (tanggal);
CREATE INDEX IF NOT EXISTS idx_honor_detail_sesi ON madrasah_honor_detail (sesi_id);

-- ============================================================
-- 3) FOREIGN KEYS ANTAR TABEL
-- ============================================================

-- jadwal -> mapel
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jadwal_mapel') THEN
        ALTER TABLE madrasah_jadwal
            ADD CONSTRAINT fk_jadwal_mapel
            FOREIGN KEY (mapel_id) REFERENCES madrasah_mapel(id) ON DELETE SET NULL;
    END IF;
END $$;

-- absensi_siswa -> sesi_mengajar
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_absensi_siswa_sesi') THEN
        ALTER TABLE madrasah_absensi_siswa
            ADD CONSTRAINT fk_absensi_siswa_sesi
            FOREIGN KEY (sesi_id) REFERENCES madrasah_sesi_mengajar(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- 4) SEED DATA BARU (PENGATURAN + MASTER MAPEL + BACKFILL JADWAL)
-- ============================================================

-- Pengaturan alur kerja baru
--
-- HonorGuruSaatIzin default TidakDiberi: honor dibayar ke orang yang benar-benar
-- mengajar, jadi sesi izin yang tidak ada penggantinya tidak dibayar. Migrasi
-- ini sudah pernah diterapkan di produksi, jadi mengubahnya hanya memengaruhi
-- instalasi baru. Pengaturan produksi diubah lewat UPDATE terpisah.
INSERT INTO madrasah_pengaturan (key, value) VALUES
('HonorGuruSaatIzin', 'TidakDiberi'),
('PersenSaatIzin', '50'),
('JamMasukMulai', '06:30'),
('JamMasukBatasBaru', '07:15'),
('JamPulangMinimalBaru', '13:30'),
('RadiusFoto', '150')
ON CONFLICT (key) DO NOTHING;

-- Backfill master mapel dari DaftarMapel bawaan
INSERT INTO madrasah_mapel (kode, nama, kelompok, aktif)
SELECT 'MP' || lpad((row_number() OVER (ORDER BY trim(b.nama)))::text, 2, '0'),
       trim(b.nama), 'Wajib', TRUE
FROM (
    SELECT DISTINCT unnest(string_to_array(value, ',')) AS nama
    FROM madrasah_pengaturan WHERE key = 'DaftarMapel'
) b
WHERE trim(b.nama) <> ''
ON CONFLICT (nama) DO NOTHING;

-- Backfill mapel_id di jadwal yang sudah ada
UPDATE madrasah_jadwal SET mapel_id = m.id
FROM madrasah_mapel m
WHERE mapel_id IS NULL AND lower(trim(mata_pelajaran)) = lower(m.nama);

-- Backfill jam nyata per slot jadwal
UPDATE madrasah_jadwal SET jam_mulai = '07:00', jam_selesai = '07:40' WHERE jam_ke = 'I'   AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '07:40', jam_selesai = '08:20' WHERE jam_ke = 'II'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '08:20', jam_selesai = '09:00' WHERE jam_ke = 'III' AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '09:20', jam_selesai = '10:00' WHERE jam_ke = 'IV'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:00', jam_selesai = '10:40' WHERE jam_ke = 'V'   AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:40', jam_selesai = '11:20' WHERE jam_ke = 'VI'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '11:20', jam_selesai = '12:00' WHERE jam_ke = 'VII' AND jam_mulai IS NULL;

-- ============================================================
-- 5) INDEX TAMBAHAN
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON madrasah_absensi (tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_username_slot ON madrasah_absensi (username, tanggal, kelas, jam_ke);
CREATE INDEX IF NOT EXISTS idx_absensi_guru_ganti ON madrasah_absensi (guru_pengganti, status_konfirmasi_pengganti);
CREATE INDEX IF NOT EXISTS idx_absensi_substitute ON madrasah_absensi (substitute_username);
CREATE INDEX IF NOT EXISTS idx_jadwal_username_hari ON madrasah_jadwal (username, hari);
CREATE INDEX IF NOT EXISTS idx_hari_libur_tanggal ON madrasah_hari_libur (tanggal);
CREATE INDEX IF NOT EXISTS idx_honor_terkirim_user_bulan ON madrasah_honor_terkirim (username, bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_enrollment_kelas_tahun ON madrasah_enrollment (kelas_id, tahun_ajaran_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_siswa ON madrasah_enrollment (siswa_id);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_kelas_tanggal ON madrasah_absensi_siswa (kelas_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_siswa ON madrasah_absensi_siswa (siswa_id);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_tgl_guru ON madrasah_absensi_siswa (tanggal, guru_username);
CREATE INDEX IF NOT EXISTS idx_siswa_nim ON madrasah_siswa (nim);
CREATE INDEX IF NOT EXISTS idx_siswa_nama ON madrasah_siswa (nama_lengkap);
