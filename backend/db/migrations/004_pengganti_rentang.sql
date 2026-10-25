-- Migration 004: Guru pengganti rentang tanggal (dari-sampai).
-- Guru A menunjuk guru B sebagai pengganti utk seluruh sesi jadwalnya selama
-- rentang tanggal tertentu. B konfirmasi sekali; honor dihitung otomatis.
CREATE TABLE IF NOT EXISTS madrasah_pengganti_rentang (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    nama_lengkap VARCHAR(255) NOT NULL,
    guru_pengganti_username VARCHAR(100) NOT NULL,
    guru_pengganti_nama VARCHAR(255) NOT NULL,
    kategori VARCHAR(50) DEFAULT 'Izin',
    keterangan TEXT DEFAULT '',
    tanggal_mulai VARCHAR(20) NOT NULL,
    tanggal_selesai VARCHAR(20) NOT NULL,
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