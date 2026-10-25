-- ============================================================
-- SKEMA DATABASE: Madrasah Tsanawiyah / Aliyah Alkarimiyyah
-- Sistem Absensi Guru Digital
-- ============================================================

CREATE TABLE IF NOT EXISTS madrasah_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'admin', 'kepala', 'guru'
    nama_lengkap VARCHAR(255) NOT NULL,
    mata_pelajaran VARCHAR(255) DEFAULT '-',
    no_hp VARCHAR(50) DEFAULT '-',
    status VARCHAR(50) DEFAULT 'Aktif',
    tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    kelas VARCHAR(50) DEFAULT '-',
    jam_ke VARCHAR(50) DEFAULT '-',
    hari_aktif TEXT DEFAULT '',
    status_sergu VARCHAR(50) DEFAULT '', -- 'Sergu', 'Non-Sergu'
    mapel_aktif TEXT DEFAULT '',
    kelas_aktif TEXT DEFAULT '',
    nip VARCHAR(50) DEFAULT '',
    gelar VARCHAR(100) DEFAULT '',
    status_kepegawaian VARCHAR(50) DEFAULT '',
    -- Identitas lengkap (migration 005)
    nik VARCHAR(30) DEFAULT '',
    tempat_lahir VARCHAR(100) DEFAULT '',
    tanggal_lahir VARCHAR(20) DEFAULT '',
    jenis_kelamin VARCHAR(20) DEFAULT '',
    alamat TEXT DEFAULT '',
    pendidikan VARCHAR(100) DEFAULT '',
    tahun_lulus VARCHAR(10) DEFAULT '',
    tahun_masuk INT DEFAULT 0,
    masa_kerja VARCHAR(50) DEFAULT '',
    izinkan_guru_pengganti BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS madrasah_absensi (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tanggal VARCHAR(20) NOT NULL, -- DD/MM/YYYY
    jam VARCHAR(20) NOT NULL,     -- HH:mm:ss
    username VARCHAR(100) NOT NULL,
    nama_guru VARCHAR(255) NOT NULL,
    mata_pelajaran VARCHAR(255) DEFAULT '-',
    jenis_absen VARCHAR(50) DEFAULT 'Masuk',
    latitude NUMERIC(11, 7) DEFAULT 0,
    longitude NUMERIC(11, 7) DEFAULT 0,
    jarak_dari_sekolah INT DEFAULT 0,
    status_lokasi VARCHAR(50) DEFAULT 'Dalam Radius',
    foto_url TEXT DEFAULT '',
    status_waktu VARCHAR(50) DEFAULT 'Hadir', -- 'Hadir', 'Izin', 'Sakit', 'Cuti', 'Alpa'
    keterangan TEXT DEFAULT '',
    kelas VARCHAR(50) DEFAULT '-',
    jam_ke VARCHAR(50) DEFAULT '-',
    link_maps TEXT DEFAULT '',
    guru_pengganti VARCHAR(255) DEFAULT '',
    status_konfirmasi_pengganti VARCHAR(50) DEFAULT '', -- 'Menunggu', 'Terkonfirmasi'
    substitute_username VARCHAR(100) DEFAULT '',
    CONSTRAINT uq_madrasah_absensi_slot UNIQUE (username, tanggal, kelas, jam_ke)
);

CREATE TABLE IF NOT EXISTS madrasah_pengaturan (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS madrasah_hari_libur (
    id SERIAL PRIMARY KEY,
    tanggal VARCHAR(20) NOT NULL, -- DD/MM/YYYY
    keterangan TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS madrasah_jadwal (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama_guru VARCHAR(255) NOT NULL,
    hari VARCHAR(50) NOT NULL,
    mata_pelajaran VARCHAR(255) NOT NULL,
    kelas VARCHAR(50) NOT NULL,
    jam_ke VARCHAR(50) NOT NULL,
    mapel_id INT,
    jam_mulai TIME,
    jam_selesai TIME
);

CREATE INDEX IF NOT EXISTS idx_jadwal_mapel ON madrasah_jadwal (mapel_id);

-- Catatan: constraint fk_jadwal_mapel dibuat setelah tabel madrasah_mapel
-- didefinisikan di bawah.

CREATE TABLE IF NOT EXISTS madrasah_honor_tambahan (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama_guru VARCHAR(255) NOT NULL,
    bulan INT NOT NULL,
    tahun INT NOT NULL,
    honor_struktural BIGINT DEFAULT 0,
    honor_tugas_tambahan BIGINT DEFAULT 0,
    keterangan TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS madrasah_honor_terkirim (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama_guru VARCHAR(255) NOT NULL,
    bulan INT NOT NULL,
    tahun INT NOT NULL,
    tanggal_kirim VARCHAR(50) NOT NULL,
    sudah_dilihat BOOLEAN DEFAULT FALSE
);

-- Index penyokong query intensif (absensi per slot/hari, jadwal per guru,
-- libur per tanggal, honor terkirim per user+bulan).
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON madrasah_absensi (tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_username_slot ON madrasah_absensi (username, tanggal, kelas, jam_ke);
CREATE INDEX IF NOT EXISTS idx_absensi_guru_ganti ON madrasah_absensi (guru_pengganti, status_konfirmasi_pengganti);
CREATE INDEX IF NOT EXISTS idx_absensi_substitute ON madrasah_absensi (substitute_username);
CREATE INDEX IF NOT EXISTS idx_jadwal_username_hari ON madrasah_jadwal (username, hari);
CREATE INDEX IF NOT EXISTS idx_hari_libur_tanggal ON madrasah_hari_libur (tanggal);
CREATE INDEX IF NOT EXISTS idx_honor_terkirim_user_bulan ON madrasah_honor_terkirim (username, bulan, tahun);

-- Index ekspresi untuk query per bulan. Tanggal disimpan sebagai string
-- DD/MM/YYYY sehingga filter bulan memakai right(tanggal, 7) = 'MM/YYYY'
-- (bukan LIKE suffix). Lihat db/migrations/006_perf_indexes.sql.
CREATE INDEX IF NOT EXISTS idx_absensi_user_bulan_status
  ON madrasah_absensi (username, right(tanggal, 7), status_waktu);
CREATE INDEX IF NOT EXISTS idx_absensi_substitute_bulan
  ON madrasah_absensi (substitute_username, right(tanggal, 7), status_konfirmasi_pengganti);
CREATE INDEX IF NOT EXISTS idx_honor_tambahan_periode
  ON madrasah_honor_tambahan (username, bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_libur_bulan
  ON madrasah_hari_libur (right(tanggal, 7));

-- ============================================================
-- MODUL SISWA & ABSENSI SISWA
-- ============================================================

CREATE TABLE IF NOT EXISTS madrasah_tahun_ajaran (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(50) UNIQUE NOT NULL,               -- mis. 2025/2026
    semester VARCHAR(20) NOT NULL DEFAULT 'Ganjil', -- Ganjil / Genap
    nama VARCHAR(100) NOT NULL,
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    aktif BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS madrasah_kelas (
    id SERIAL PRIMARY KEY,
    kode_kelas VARCHAR(20) UNIQUE NOT NULL,         -- mis. VII-A
    nama_kelas VARCHAR(50) NOT NULL,                -- mis. Kelas VII-A
    tingkat VARCHAR(10) DEFAULT 'VII',              -- VII / VIII / IX
    wali_kelas_id INT REFERENCES madrasah_users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS madrasah_siswa (
    id SERIAL PRIMARY KEY,
    nis VARCHAR(30) UNIQUE NOT NULL,
    nisn VARCHAR(30) DEFAULT '',
    nama_lengkap VARCHAR(255) NOT NULL,
    jenis_kelamin VARCHAR(20) DEFAULT 'Laki-laki',  -- Laki-laki / Perempuan
    tempat_lahir VARCHAR(100) DEFAULT '',
    tanggal_lahir VARCHAR(20) DEFAULT '',           -- dd/MM/yyyy
    alamat TEXT DEFAULT '',
    nama_ortu VARCHAR(255) DEFAULT '',
    no_hp_ortu VARCHAR(50) DEFAULT '',
    status VARCHAR(20) DEFAULT 'Aktif',             -- Aktif / Alumni / Pindah
    -- Identitas lengkap (migration 005)
    nim VARCHAR(30) DEFAULT '',
    nik VARCHAR(30) DEFAULT '',
    nama_ayah VARCHAR(255) DEFAULT '',
    nama_ibu VARCHAR(255) DEFAULT '',
    pekerjaan_ayah VARCHAR(100) DEFAULT '',
    pekerjaan_ibu VARCHAR(100) DEFAULT '',
    desa VARCHAR(100) DEFAULT '',
    kecamatan VARCHAR(100) DEFAULT '',
    kabupaten VARCHAR(100) DEFAULT '',
    anak_ke VARCHAR(10) DEFAULT '',
    umur VARCHAR(10) DEFAULT '',
    tahun_masuk INT DEFAULT 0,
    rt VARCHAR(100) DEFAULT '',
    mark VARCHAR(20) DEFAULT '',
    yatim BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_siswa_nim ON madrasah_siswa (nim);
CREATE INDEX IF NOT EXISTS idx_siswa_nama ON madrasah_siswa (nama_lengkap);

-- Relasi siswa -> kelas per tahun ajaran (memungkinkan kenaikan/pindah kelas)
CREATE TABLE IF NOT EXISTS madrasah_enrollment (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL REFERENCES madrasah_siswa(id) ON DELETE CASCADE,
    kelas_id INT NOT NULL REFERENCES madrasah_kelas(id) ON DELETE CASCADE,
    tahun_ajaran_id INT NOT NULL REFERENCES madrasah_tahun_ajaran(id) ON DELETE CASCADE,
    tanggal_masuk DATE DEFAULT CURRENT_DATE,
    tanggal_keluar DATE,
    UNIQUE (siswa_id, tahun_ajaran_id)
);

-- Presensi siswa per sesi pembelajaran (terikat jadwal KBM)
CREATE TABLE IF NOT EXISTS madrasah_absensi_siswa (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL REFERENCES madrasah_siswa(id) ON DELETE CASCADE,
    kelas_id INT NOT NULL REFERENCES madrasah_kelas(id) ON DELETE CASCADE,
    jadwal_id INT REFERENCES madrasah_jadwal(id) ON DELETE SET NULL,
    sesi_id INT,
    tanggal DATE NOT NULL,
    jam_ke VARCHAR(20) NOT NULL,
    mata_pelajaran VARCHAR(255) NOT NULL DEFAULT '',
    guru_username VARCHAR(100) NOT NULL,
    status VARCHAR(5) NOT NULL DEFAULT 'H',          -- H / I / S / A / T
    keterangan TEXT DEFAULT '',
    editor_username VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (siswa_id, kelas_id, jam_ke, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_kelas_tahun ON madrasah_enrollment (kelas_id, tahun_ajaran_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_siswa ON madrasah_enrollment (siswa_id);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_kelas_tanggal ON madrasah_absensi_siswa (kelas_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_abs_siswa_sesi ON madrasah_absensi_siswa (sesi_id);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_siswa ON madrasah_absensi_siswa (siswa_id);
CREATE INDEX IF NOT EXISTS idx_absensi_siswa_tgl_guru ON madrasah_absensi_siswa (tanggal, guru_username);

-- Penggantian guru untuk satu rentang tanggal (dari-sampai). Guru A menunjuk
-- guru B sebagai pengganti utk seluruh sesi jadwalnya selama rentang aktif.
-- Status: 'Menunggu' -> 'Terkonfirmasi' (B konfirmasi sekali) / 'Ditolak' /
--         'Selesai'  (dihitung otomatis saat tanggal selesai terlampaui).
CREATE TABLE IF NOT EXISTS madrasah_pengganti_rentang (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,                 -- guru yang digantikan (A)
    nama_lengkap VARCHAR(255) NOT NULL,
    guru_pengganti_username VARCHAR(100) NOT NULL,   -- pengganti (B)
    guru_pengganti_nama VARCHAR(255) NOT NULL,
    kategori VARCHAR(50) DEFAULT 'Izin',             -- Izin / Sakit / Cuti
    keterangan TEXT DEFAULT '',
    tanggal_mulai VARCHAR(20) NOT NULL,              -- DD/MM/YYYY
    tanggal_selesai VARCHAR(20) NOT NULL,            -- DD/MM/YYYY
    status_konfirmasi VARCHAR(50) DEFAULT 'Menunggu',
    latitude NUMERIC(11, 7) DEFAULT 0,
    longitude NUMERIC(11, 7) DEFAULT 0,
    jarak_dari_sekolah INT DEFAULT 0,
    foto_url TEXT DEFAULT '',
    link_maps TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pengganti_rentang_user ON madrasah_pengganti_rentang (username);
CREATE INDEX IF NOT EXISTS idx_pengganti_rentang_pengganti ON madrasah_pengganti_rentang (guru_pengganti_username, status_konfirmasi);

-- ============================================================
-- MASTER MAPEL
-- ============================================================
CREATE TABLE IF NOT EXISTS madrasah_mapel (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(20) DEFAULT '',
    nama VARCHAR(100) NOT NULL UNIQUE,
    kelompok VARCHAR(50) DEFAULT 'Wajib',
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapel_aktif ON madrasah_mapel (aktif);

-- ============================================================
-- ABSENSI HARIAN (MASUK / PULANG)
-- ============================================================
-- Satu baris per pegawai per hari, terpisah dari catatan mengajar per sesi.
--   jam_masuk terisi         -> sudah absen masuk
--   jam_pulang terisi        -> sudah absen pulang (lengkap)
--   status_waktu <> 'Hadir'  -> hari izin/sakit/cuti/alpa, tidak perlu absen
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
CREATE INDEX IF NOT EXISTS idx_abs_harian_username_tanggal ON madrasah_absensi_harian (username, tanggal);

-- ============================================================
-- PENGAJUAN IZIN (DISETUJUI KEPALA MADRASAH)
-- ============================================================
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_absensi_harian_izin') THEN
        ALTER TABLE madrasah_absensi_harian
            ADD CONSTRAINT fk_absensi_harian_izin
            FOREIGN KEY (izin_id) REFERENCES madrasah_pengajuan_izin(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- GURU PENGGANTI
-- ============================================================
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
    -- ON CONFLICT (izin_id) pada pembuatan permintaan pengganti membutuhkan
    -- constraint ini.
    CONSTRAINT uq_pengganti_per_izin UNIQUE (izin_id)
);

CREATE INDEX IF NOT EXISTS idx_pengganti_izin ON madrasah_guru_pengganti (izin_id);
CREATE INDEX IF NOT EXISTS idx_pengganti_guru ON madrasah_guru_pengganti (guru_pengganti, status);

-- ============================================================
-- SESI MENGAJAR (DARI JADWAL + PENGGANTIAN)
-- ============================================================
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
    sumber VARCHAR(20) NOT NULL DEFAULT 'Jadwal', -- 'Jadwal' | 'Izin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sesi UNIQUE (tanggal, jadwal_id)
);

CREATE INDEX IF NOT EXISTS idx_sesi_pengguna ON madrasah_sesi_mengajar (pengguna, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_asal ON madrasah_sesi_mengajar (pengajar_utama, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_tanggal ON madrasah_sesi_mengajar (tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_tanggal_pengguna ON madrasah_sesi_mengajar (tanggal, pengguna);
CREATE INDEX IF NOT EXISTS idx_sesi_sumber ON madrasah_sesi_mengajar (sumber);

-- ============================================================
-- HONOR GURU + RINCIAN (GURU DAN STAF)
-- ============================================================
-- Tabel ini sudah ada di instalasi lama dengan kolom versi sebelumnya
-- (nama, tipe, periode, honor_reguler, total_nominal, ...). Kolom alur revisi
-- ditambahkan berdampingan dan isi kolom lama ikut ditulis agar tabel ini
-- konsisten baik di fresh install maupun database yang sudah naik versi.
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
CREATE INDEX IF NOT EXISTS idx_honor_username ON madrasah_honor (username, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_honor_status ON madrasah_honor (status);

-- ============================================================
-- SEED DATA AWAL (Pengaturan, Users, Jadwal)
-- ============================================================

INSERT INTO madrasah_pengaturan (key, value) VALUES
('NamaSekolah', 'MA AL KARIMIYAH'),
('NamaKepala', 'Azmi Arroisiy, S.H.'),
('LatitudeSekolah', '-7.1500'),
('LongitudeSekolah', '112.6500'),
('RadiusMeter', '150'),
('JamMasukBatas', '07:00'),
('JamPulangMinimal', '14:00'),
('TarifHonorPerJam', '9000'),
('MingguLibur', 'true'),
('DaftarMapel', 'Al-Qur''an Hadits, Akidah Akhlak, Aswaja, Fiqih, Sejarah Kebudayaan Islam (SKI), Bahasa Arab, Nahwu, PPKn, Bahasa Indonesia, Matematika, IPA, IPS, Bahasa Inggris, Seni Budaya, PJOK, Prakarya, Informatika, Bahasa Daerah')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Pengaturan alur kerja baru
INSERT INTO madrasah_pengaturan (key, value) VALUES
('HonorGuruSaatIzin', 'TidakDiberi'),
('PersenSaatIzin', '50'),
('JamMasukMulai', '06:30'),
('JamMasukBatasBaru', '07:15'),
('JamPulangMinimalBaru', '13:30'),
('RadiusFoto', '150')
ON CONFLICT (key) DO NOTHING;

-- Backfill master mapel dari DaftarMapel bawaan.
-- Tanda kutip tunggal di nama mapel (Al-Qur'an Hadits) sengaja
-- dipertahankan agar sama dengan madrasah_jadwal.mata_pelajaran.
INSERT INTO madrasah_mapel (kode, nama, kelompok, aktif)
SELECT 'MP' || lpad((row_number() OVER (ORDER BY trim(b.nama)))::text, 2, '0'),
       trim(b.nama), 'Wajib', TRUE
FROM (
    SELECT DISTINCT unnest(string_to_array(value, ',')) AS nama
    FROM madrasah_pengaturan WHERE key = 'DaftarMapel'
) b
WHERE trim(b.nama) <> ''
ON CONFLICT (nama) DO NOTHING;

-- Backfill mapel_id/jam jadwal dijalankan setelah seed Jadwal di bawah.

-- Password sha256 default:
-- admin123  -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- kepala123 -> dcb84249a05bc36f0de2b30bfbfa7fb104889c0a6b93db5f126f53e32a67e106 (or hash of kepala123)
-- guru123   -> e5b7e9927bf791338e1124d0811f365754f9a03b5444db8f01f74815a9ab3a05

INSERT INTO madrasah_users (username, password, role, nama_lengkap, mata_pelajaran, no_hp, status, kelas, jam_ke, hari_aktif, status_sergu, mapel_aktif, kelas_aktif) VALUES
('admin', 'admin123', 'admin', 'Administrator', '-', '-', 'Aktif', '-', '-', '', '', '', ''),
('kepala', 'kepala123', 'kepala', 'Azmi Arroisiy, S.H.', '-', '-', 'Aktif', '-', '-', '', '', '', ''),
('guru1', 'guru123', 'guru', 'Contoh Nama Guru', 'Al-Qur''an Hadits', '081234567890', 'Aktif', 'VII-A', 'I', 'Senin,Rabu,Jumat', 'Non-Sergu', 'Al-Qur''an Hadits', 'VII-A,VII-B'),
('ahmadfauzi', 'guru123', 'guru', 'Ahmad Fauzi, S.Pd.', 'Matematika', '081298765432', 'Aktif', 'VII-A', 'II', 'Senin,Selasa,Kamis', 'Non-Sergu', 'Matematika', 'VII-A,VII-B,VIII-A'),
('sitiaminah', 'guru123', 'guru', 'Siti Aminah, M.Pd.', 'IPA', '081345678901', 'Aktif', 'VIII-B', 'III', 'Selasa,Rabu,Sabtu', 'Sergu', 'IPA', 'VIII-A,VIII-B,IX-A')
ON CONFLICT (username) DO NOTHING;

-- Seed Jadwal
INSERT INTO madrasah_jadwal (username, nama_guru, hari, mata_pelajaran, kelas, jam_ke) VALUES
('guru1', 'Contoh Nama Guru', 'Senin', 'Al-Qur''an Hadits', 'VII-A', 'I'),
('guru1', 'Contoh Nama Guru', 'Senin', 'Al-Qur''an Hadits', 'VII-B', 'II'),
('guru1', 'Contoh Nama Guru', 'Rabu', 'Al-Qur''an Hadits', 'VII-A', 'III'),
('guru1', 'Contoh Nama Guru', 'Jumat', 'Al-Qur''an Hadits', 'VII-C', 'I'),
('ahmadfauzi', 'Ahmad Fauzi, S.Pd.', 'Senin', 'Matematika', 'VII-A', 'II'),
('ahmadfauzi', 'Ahmad Fauzi, S.Pd.', 'Selasa', 'Matematika', 'VIII-A', 'I'),
('sitiaminah', 'Siti Aminah, M.Pd.', 'Selasa', 'IPA', 'VIII-B', 'III')
ON CONFLICT DO NOTHING;

-- Seed Tahun Ajaran
INSERT INTO madrasah_tahun_ajaran (kode, semester, nama, aktif) VALUES
('2025/2026', 'Ganjil', 'Tahun Ajaran 2025/2026 Ganjil', TRUE)
ON CONFLICT (kode) DO UPDATE SET aktif = TRUE;

-- Seed Kelas
INSERT INTO madrasah_kelas (kode_kelas, nama_kelas, tingkat, wali_kelas_id, is_active) VALUES
('VII-A', 'Kelas VII-A', 'VII', (SELECT id FROM madrasah_users WHERE username = 'guru1'), TRUE),
('VII-B', 'Kelas VII-B', 'VII', NULL, TRUE),
('VII-C', 'Kelas VII-C', 'VII', NULL, TRUE),
('VIII-A', 'Kelas VIII-A', 'VIII', (SELECT id FROM madrasah_users WHERE username = 'ahmadfauzi'), TRUE),
('VIII-B', 'Kelas VIII-B', 'VIII', (SELECT id FROM madrasah_users WHERE username = 'sitiaminah'), TRUE),
('IX-A', 'Kelas IX-A', 'IX', NULL, TRUE)
ON CONFLICT (kode_kelas) DO NOTHING;

-- Seed Siswa Contoh (Kelas VII-A)
INSERT INTO madrasah_siswa (nis, nisn, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir, nama_ortu, no_hp_ortu, status) VALUES
('24001', '0253678901', 'Ahmad Rizki Maulana', 'Laki-laki', 'Surabaya', '12/03/2011', 'Bpk. Slamet Hariyadi', '08123400001', 'Aktif'),
('24002', '0253678902', 'Bunga Citra Lestari', 'Perempuan', 'Gresik', '25/07/2011', 'Ibu Sri Wahyuni', '08123400002', 'Aktif'),
('24003', '0253678903', 'Dimas Prasetyo', 'Laki-laki', 'Sidoarjo', '02/11/2010', 'Bpk. Joko Susilo', '08123400003', 'Aktif'),
('24004', '0253678904', 'Fatimah Az-Zahra', 'Perempuan', 'Bangkalan', '18/01/2011', 'Bpk. Ahmad Fadhil', '08123400004', 'Aktif'),
('24005', '0253678905', 'Gilang Ramadhan', 'Laki-laki', 'Surabaya', '09/05/2011', 'Ibu Rina Wati', '08123400005', 'Aktif'),
('24006', '0253678906', 'Hana Safira Putri', 'Perempuan', 'Lamongan', '30/09/2011', 'Bpk. Yusuf Efendi', '08123400006', 'Aktif'),
('24007', '0253678907', 'Iqbal Maulana Yusuf', 'Laki-laki', 'Surabaya', '21/06/2011', 'Ibu Nur Aini', '08123400007', 'Aktif')
ON CONFLICT (nis) DO NOTHING;

-- Seed Enrollment: siswa -> kelas VII-A pada tahun ajaran aktif
INSERT INTO madrasah_enrollment (siswa_id, kelas_id, tahun_ajaran_id)
SELECT s.id, k.id, ta.id
FROM madrasah_siswa s
CROSS JOIN madrasah_kelas k
CROSS JOIN madrasah_tahun_ajaran ta
WHERE s.nis IN ('24001','24002','24003','24004','24005','24006','24007')
  AND k.kode_kelas = 'VII-A'
  AND ta.kode = '2025/2026'
ON CONFLICT (siswa_id, tahun_ajaran_id) DO NOTHING;

-- Backfill mapel_id dan window jam nyata untuk Jadwal seed.
UPDATE madrasah_jadwal SET mapel_id = m.id
FROM madrasah_mapel m
WHERE mapel_id IS NULL AND lower(trim(mata_pelajaran)) = lower(m.nama);

UPDATE madrasah_jadwal SET jam_mulai = '07:00', jam_selesai = '07:40' WHERE jam_ke = 'I'   AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '07:40', jam_selesai = '08:20' WHERE jam_ke = 'II'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '08:20', jam_selesai = '09:00' WHERE jam_ke = 'III' AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '09:20', jam_selesai = '10:00' WHERE jam_ke = 'IV'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:00', jam_selesai = '10:40' WHERE jam_ke = 'V'   AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:40', jam_selesai = '11:20' WHERE jam_ke = 'VI'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '11:20', jam_selesai = '12:00' WHERE jam_ke = 'VII' AND jam_mulai IS NULL;

-- ============================================================
-- FOREIGN KEY ANTAR TABEL (SETELAH SEMUA TABEL ADA)
-- ============================================================
-- Ditambahkan di akhir karena beberapa tabel saling menunjuk: jadwal ->
-- mapel, presensi siswa -> sesi mengajar.

-- Jadwal menunjuk mapel master lewat mapel_id; dihapus dari master berarti
-- jadwal tetap ada tanpa mapel.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_jadwal_mapel'
    ) THEN
        ALTER TABLE madrasah_jadwal
            ADD CONSTRAINT fk_jadwal_mapel
            FOREIGN KEY (mapel_id) REFERENCES madrasah_mapel(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Presensi siswa terikat sesi mengajar hasil penggantian guru.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_absensi_siswa_sesi'
    ) THEN
        ALTER TABLE madrasah_absensi_siswa
            ADD CONSTRAINT fk_absensi_siswa_sesi
            FOREIGN KEY (sesi_id) REFERENCES madrasah_sesi_mengajar(id)
            ON DELETE SET NULL;
    END IF;
END $$;


-- ============================================================
-- VIEW ABSENSI TERPADU (migrasi 011)
-- ============================================================
-- Satu sumber baca untuk halaman admin / kepala madrasah:
--   Harian -> baris dari madrasah_absensi_harian (satu baris per hari)
--   Arsip  -> baris lama dari madrasah_absensi, hanya untuk tanggal yang
--             belum punya baris di tabel harian
--
-- Cabang arsip dikecualikan per (username, tanggal) supaya satu hari tidak
-- pernah dihitung dua kali ketika tabel harian sudah punya baris tanggal itu.
CREATE OR REPLACE VIEW madrasah_absensi_gabungan AS
SELECT
    h.tanggal,
    h.username,
    h.nama AS nama_guru,
    COALESCE(to_char(h.jam_masuk, 'HH24:MI:SS'), '') AS jam,
    COALESCE(to_char(h.jam_pulang, 'HH24:MI:SS'), '') AS jam_pulang,
    h.status_waktu,
    COALESCE(h.keterangan, '') AS keterangan,
    'Masuk'::varchar(20) AS jenis_absen,
    COALESCE(h.lat_masuk, 0) AS latitude,
    COALESCE(h.lng_masuk, 0) AS longitude,
    COALESCE(h.jarak_masuk, 0) AS jarak_dari_sekolah,
    CASE
        WHEN COALESCE(h.jarak_masuk, 0) <= COALESCE(
            (SELECT NULLIF(value, '')::numeric FROM madrasah_pengaturan WHERE key = 'RadiusMeter'),
            150
        ) THEN 'Dalam Radius'
        ELSE 'Luar Radius'
    END::varchar(50) AS status_lokasi,
    COALESCE(h.foto_masuk, '') AS foto_url,
    COALESCE(h.maps_masuk, '') AS link_maps,
    COALESCE(s.mapel, '-') AS mapel,
    COALESCE(s.kelas, '-') AS kelas,
    COALESCE(s.jam_ke, '-') AS jam_ke,
    CASE WHEN s.pengguna IS NOT NULL AND s.pengguna <> h.username
         THEN COALESCE(s.nama_pengganti, '') ELSE '' END::varchar(255) AS guru_pengganti,
    CASE WHEN s.pengguna IS NOT NULL AND s.pengguna <> h.username
         THEN 'Terkonfirmasi' ELSE '' END::varchar(50) AS status_konfirmasi_pengganti,
    COALESCE(s.pengguna, h.username) AS substitute_username,
    h.id AS id,
    'Harian'::varchar(20) AS sumber
FROM madrasah_absensi_harian h
LEFT JOIN LATERAL (
    SELECT s1.mapel, s1.kelas, s1.jam_ke, s1.pengguna, s1.nama_pengganti
    FROM madrasah_sesi_mengajar s1
    WHERE s1.tanggal = h.tanggal
      AND (s1.pengguna = h.username OR s1.pengajar_utama = h.username)
    ORDER BY s1.jam_mulai ASC NULLS LAST, s1.id ASC
    LIMIT 1
) s ON TRUE

UNION ALL

SELECT
    a.tgl AS tanggal,
    a.username,
    a.nama_guru,
    COALESCE(a.jam, '') AS jam,
    '' AS jam_pulang,
    COALESCE(a.status_waktu, 'Hadir') AS status_waktu,
    COALESCE(a.keterangan, '') AS keterangan,
    COALESCE(a.jenis_absen, 'Masuk') AS jenis_absen,
    COALESCE(a.latitude, 0) AS latitude,
    COALESCE(a.longitude, 0) AS longitude,
    COALESCE(a.jarak_dari_sekolah, 0) AS jarak_dari_sekolah,
    COALESCE(NULLIF(a.status_lokasi, ''), 'Dalam Radius')::varchar(50) AS status_lokasi,
    COALESCE(a.foto_url, '') AS foto_url,
    COALESCE(a.link_maps, '') AS link_maps,
    COALESCE(NULLIF(a.mata_pelajaran, ''), '-') AS mapel,
    COALESCE(NULLIF(a.kelas, ''), '-') AS kelas,
    COALESCE(NULLIF(a.jam_ke, ''), '-') AS jam_ke,
    COALESCE(a.guru_pengganti, '')::varchar(255) AS guru_pengganti,
    COALESCE(a.status_konfirmasi_pengganti, '')::varchar(50) AS status_konfirmasi_pengganti,
    COALESCE(NULLIF(a.substitute_username, ''), a.username) AS substitute_username,
    a.id AS id,
    'Arsip'::varchar(20) AS sumber
FROM (
    SELECT x.*, to_date(x.tanggal, 'DD/MM/YYYY') AS tgl
    FROM madrasah_absensi x
    WHERE x.tanggal ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
) a
WHERE NOT EXISTS (
    SELECT 1
    FROM madrasah_absensi_harian h2
    WHERE h2.tanggal = a.tgl
      AND lower(h2.username) = lower(a.username)
);
