-- ============================================================
-- MIGRASI 013: MODUL BIMBINGAN & KONSELING (GURU BK)
-- ============================================================

CREATE TABLE IF NOT EXISTS madrasah_catatan_bk (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL REFERENCES madrasah_siswa(id) ON DELETE CASCADE,
    kelas VARCHAR(30) DEFAULT '-',
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    kategori VARCHAR(80) NOT NULL DEFAULT 'Kedisiplinan / Presensi',
    tindak_lanjut TEXT DEFAULT '',
    catatan TEXT NOT NULL DEFAULT '',
    status VARCHAR(40) NOT NULL DEFAULT 'Dipantau',
    guru_bk_username VARCHAR(100) NOT NULL,
    guru_bk_nama VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catatan_bk_siswa ON madrasah_catatan_bk (siswa_id);
CREATE INDEX IF NOT EXISTS idx_catatan_bk_tanggal ON madrasah_catatan_bk (tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_catatan_bk_status ON madrasah_catatan_bk (status);

-- Pastikan Guru BK diizinkan menjadi guru pengganti
UPDATE madrasah_users
SET izinkan_guru_pengganti = TRUE
WHERE LOWER(TRIM(mata_pelajaran)) IN ('bk', 'koord bk', 'koordinator bk', 'guru bk', 'bimbingan konseling');
