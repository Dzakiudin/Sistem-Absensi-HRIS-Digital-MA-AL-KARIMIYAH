-- ============================================================
-- MIGRATION 005: KOLOM IDENTITAS LENGKAP SISWA & GURU
-- Menyesuaikan madrasah_siswa dan madrasah_users agar dapat
-- menyimpan data asli dari berkas master (induk muda/putri):
--   - Siswa: nim, nik, ayah, ibu, pekerjaan ayah/ibu, desa,
--     kecamatan, kabupaten, anak ke, umur, tahun masuk, RT,
--     keterangan (LUAR/YATIM), serta flag yatim.
--   - Guru : nik, tempat/tanggal lahir, jenis kelamin, alamat,
--     pendidikan, tahun lulus, tahun masuk, masa kerja.
-- Idempotent: aman dijalankan berulang dengan database yang ada.
-- ============================================================
ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS nim VARCHAR(30) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS nik VARCHAR(30) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS nama_ayah VARCHAR(255) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS nama_ibu VARCHAR(255) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS pekerjaan_ayah VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS pekerjaan_ibu VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS desa VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS kecamatan VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS kabupaten VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS anak_ke VARCHAR(10) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS umur VARCHAR(10) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS tahun_masuk INT DEFAULT 0;

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS rt VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS mark VARCHAR(20) DEFAULT '';

ALTER TABLE madrasah_siswa
ADD COLUMN IF NOT EXISTS yatim BOOLEAN DEFAULT FALSE;

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS nik VARCHAR(30) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS tempat_lahir VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS tanggal_lahir VARCHAR(20) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS jenis_kelamin VARCHAR(20) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS alamat TEXT DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS pendidikan VARCHAR(100) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS tahun_lulus VARCHAR(10) DEFAULT '';

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS tahun_masuk INT DEFAULT 0;

ALTER TABLE madrasah_users
ADD COLUMN IF NOT EXISTS masa_kerja VARCHAR(50) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_siswa_nim ON madrasah_siswa (nim);

CREATE INDEX IF NOT EXISTS idx_siswa_nama ON madrasah_siswa (nama_lengkap);