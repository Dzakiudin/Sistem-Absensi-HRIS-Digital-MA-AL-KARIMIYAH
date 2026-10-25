-- ============================================================
-- MIGRASI 012 - PRESENSI SISWA PADA RINCIAN HONOR
--
-- Tujuan:
--   Menyimpan rekap status kehadiran siswa (H/I/S/A/T) pada tiap rincian
--   sesi honor. Nilai ini mengunci bukti presensi siswa per sesi pada saat
--   rekap honor di-finalisasi, sehingga slip yang sudah Final tidak berubah
--   meski data absensi siswa diedit di kemudian hari.
--
-- CATATAN SOAL DATA
--   Semua stmt idempotent (ADD COLUMN IF NOT EXISTS), tidak menghapus atau
--   mengubah data lama, aman dijalankan berulang kali.
-- ============================================================
ALTER TABLE madrasah_honor_detail
    ADD COLUMN IF NOT EXISTS hadir INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS izin INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sakit INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alpa INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS telat INT NOT NULL DEFAULT 0;