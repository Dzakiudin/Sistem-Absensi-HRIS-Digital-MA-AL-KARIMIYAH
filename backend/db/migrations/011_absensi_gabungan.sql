-- ============================================================
-- MIGRASI 011 - SUMBER ABSENSI TERPADU + SESI HARI BIASA
--
-- Tujuan:
--   1. Satu sumber baca untuk halaman admin / kepala madrasah. Data baru
--      diambil dari madrasah_absensi_harian, data lama (arsip per jam
--      pelajaran) tetap terbaca dari madrasah_absensi.
--   2. Menandai asal baris sesi mengajar supaya generator sesi hari biasa
--      tidak pernah menimpa sesi pengganti hasil approval izin.
--
-- CATATAN SOAL DATA (WAJIB dibaca sebelum menjalankan)
--   Tidak ada satu pun stmt yang menghapus atau mengubah data lama.
--     - Tidak ada DROP TABLE / DROP COLUMN / DELETE / TRUNCATE.
--   - madrasah_absensi tetap utuh dan dibaca sebagai arsip.
--   - Yang ditambahkan hanya CREATE OR REPLACE VIEW, satu kolom baru, dan
--     index pendukung.
--   Semua stmt idempotent, aman dijalankan berulang kali.
-- ============================================================


-- ============================================================
-- 1. PENANDA ASAL SESI MENGAJAR
-- ============================================================
-- sumber = 'Jadwal'  -> sesi hari biasa, boleh diperbarui oleh generator
--                         MaterialisasiSesiPeriode (mis. guru yang semula
--                         izin lalu jadi hadir).
-- sumber = 'Izin'    -> sesi pengganti hasil approval pengajuan izin.
--                         Nilai ini TIDAK PERNAH disentuh generator.
--
-- Kolom ini hanya penambahan: baris lama yang sudah ada tetap mendapat nilai
-- default sehingga tidak ada data yang hilang.
ALTER TABLE madrasah_sesi_mengajar
    ADD COLUMN IF NOT EXISTS sumber VARCHAR(20) NOT NULL DEFAULT 'Jadwal';

-- Pengisian ulang hanya untuk instalasi yang somehow punya nilai kosong.
UPDATE madrasah_sesi_mengajar SET sumber = 'Jadwal' WHERE sumber IS NULL OR trim(sumber) = '';


-- ============================================================
-- 2. VIEW ABSENSI TERPADU
-- ============================================================
-- Dua cabang yang tidak saling tumpang tindih per (username, tanggal):
--
--   Harian : satu baris per pegawai per hari dari madrasah_absensi_harian.
--            Mapel / kelas / jam ke diambil dari sesi mengajar hari itu
--            supaya kolom yang ditampilkan admin tetap terisi.
--
--   Arsip  : baris lama per jam pelajaran dari madrasah_absensi, hanya
--            untuk tanggal yang BELUM punya baris di tabel harian. Inilah
--            penjaga agar satu hari tidak dihitung dua kali.
--
-- Status lokasi untuk cabang harian dihitung dari RadiusMeter di
-- Pengaturan Sistem karena tabel harian tidak menyimpan kolom tersebut
-- (sudah dijamin saat proses absen, jadi nilainya selalu 'Dalam Radius'
-- untuk data yang sah).
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


-- ============================================================
-- 3. INDEX PENDUKUNG
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_abs_harian_username_tanggal
    ON madrasah_absensi_harian (username, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_tanggal_pengguna
    ON madrasah_sesi_mengajar (tanggal, pengguna);
CREATE INDEX IF NOT EXISTS idx_sesi_sumber
    ON madrasah_sesi_mengajar (sumber);