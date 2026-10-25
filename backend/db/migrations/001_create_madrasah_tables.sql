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
    status_kepegawaian VARCHAR(50) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS madrasah_absensi (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tanggal VARCHAR(20) NOT NULL, -- DD/MM/YYYY
    jam VARCHAR(20) NOT NULL, -- HH:mm:ss
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
    substitute_username VARCHAR(100) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS madrasah_pengaturan (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL);

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
    jam_ke VARCHAR(50) NOT NULL
);

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

-- ============================================================
-- SEED DATA AWAL (Pengaturan, Users, Jadwal)
-- ============================================================
INSERT INTO
    madrasah_pengaturan (key, value)
VALUES
    ('NamaSekolah', 'MA AL KARIMIYAH'),
    ('NamaKepala', 'Azmi Arroisiy, S.H.'),
    ('LatitudeSekolah', '-7.1500'),
    ('LongitudeSekolah', '112.6500'),
    ('RadiusMeter', '150'),
    ('JamMasukBatas', '07:00'),
    ('JamPulangMinimal', '14:00'),
    ('TarifHonorPerJam', '9000'),
    ('MingguLibur', 'true'),
    (
        'DaftarMapel',
        'Al-Qur''an Hadits, Akidah Akhlak, Aswaja, Fiqih, Sejarah Kebudayaan Islam (SKI), Bahasa Arab, Nahwu, PPKn, Bahasa Indonesia, Matematika, IPA, IPS, Bahasa Inggris, Seni Budaya, PJOK, Prakarya, Informatika, Bahasa Daerah'
    ) ON CONFLICT (key) DO
UPDATE
SET
    value = EXCLUDED.value;

-- Password sha256 default:
-- admin123  -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- kepala123 -> dcb84249a05bc36f0de2b30bfbfa7fb104889c0a6b93db5f126f53e32a67e106 (or hash of kepala123)
-- guru123   -> e5b7e9927bf791338e1124d0811f365754f9a03b5444db8f01f74815a9ab3a05
INSERT INTO
    madrasah_users (
        username,
        password,
        role,
        nama_lengkap,
        mata_pelajaran,
        no_hp,
        status,
        kelas,
        jam_ke,
        hari_aktif,
        status_sergu,
        mapel_aktif,
        kelas_aktif
    )
VALUES
    (
        'admin',
        'admin123',
        'admin',
        'Administrator',
        '-',
        '-',
        'Aktif',
        '-',
        '-',
        '',
        '',
        '',
        ''
    ),
    (
        'kepala',
        'kepala123',
        'kepala',
        'Azmi Arroisiy, S.H.',
        '-',
        '-',
        'Aktif',
        '-',
        '-',
        '',
        '',
        '',
        ''
    ),
    (
        'guru1',
        'guru123',
        'guru',
        'Contoh Nama Guru',
        'Al-Qur''an Hadits',
        '081234567890',
        'Aktif',
        'VII-A',
        'I',
        'Senin,Rabu,Jumat',
        'Non-Sergu',
        'Al-Qur''an Hadits',
        'VII-A,VII-B'
    ),
    (
        'ahmadfauzi',
        'guru123',
        'guru',
        'Ahmad Fauzi, S.Pd.',
        'Matematika',
        '081298765432',
        'Aktif',
        'VII-A',
        'II',
        'Senin,Selasa,Kamis',
        'Non-Sergu',
        'Matematika',
        'VII-A,VII-B,VIII-A'
    ),
    (
        'sitiaminah',
        'guru123',
        'guru',
        'Siti Aminah, M.Pd.',
        'IPA',
        '081345678901',
        'Aktif',
        'VIII-B',
        'III',
        'Selasa,Rabu,Sabtu',
        'Sergu',
        'IPA',
        'VIII-A,VIII-B,IX-A'
    ) ON CONFLICT (username) DO NOTHING;

-- Seed Jadwal
INSERT INTO
    madrasah_jadwal (
        username,
        nama_guru,
        hari,
        mata_pelajaran,
        kelas,
        jam_ke
    )
VALUES
    (
        'guru1',
        'Contoh Nama Guru',
        'Senin',
        'Al-Qur''an Hadits',
        'VII-A',
        'I'
    ),
    (
        'guru1',
        'Contoh Nama Guru',
        'Senin',
        'Al-Qur''an Hadits',
        'VII-B',
        'II'
    ),
    (
        'guru1',
        'Contoh Nama Guru',
        'Rabu',
        'Al-Qur''an Hadits',
        'VII-A',
        'III'
    ),
    (
        'guru1',
        'Contoh Nama Guru',
        'Jumat',
        'Al-Qur''an Hadits',
        'VII-C',
        'I'
    ),
    (
        'ahmadfauzi',
        'Ahmad Fauzi, S.Pd.',
        'Senin',
        'Matematika',
        'VII-A',
        'II'
    ),
    (
        'ahmadfauzi',
        'Ahmad Fauzi, S.Pd.',
        'Selasa',
        'Matematika',
        'VIII-A',
        'I'
    ),
    (
        'sitiaminah',
        'Siti Aminah, M.Pd.',
        'Selasa',
        'IPA',
        'VIII-B',
        'III'
    ) ON CONFLICT DO NOTHING;
