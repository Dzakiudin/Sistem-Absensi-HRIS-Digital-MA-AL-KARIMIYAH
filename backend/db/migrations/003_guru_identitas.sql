-- Migration 003: Tambah kolom identitas guru (NIP, Gelar, Status Kepegawaian)
ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS nip VARCHAR(50) DEFAULT '';
ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS gelar VARCHAR(100) DEFAULT '';
ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS status_kepegawaian VARCHAR(50) DEFAULT '';
