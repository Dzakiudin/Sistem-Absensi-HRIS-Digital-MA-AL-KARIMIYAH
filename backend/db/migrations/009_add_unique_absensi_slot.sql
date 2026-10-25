-- Menambahkan UNIQUE constraint pada madrasah_absensi untuk kolom
-- (username, tanggal, kelas, jam_ke) agar ON CONFLICT di AjukanIzinSakitCuti
-- dan CatatAbsensi bisa berjalan.
--
-- Sebelum menambah constraint, hapus baris duplikat yang mungkin sudah ada,
-- karena ALTER TABLE ADD CONSTRAINT akan gagal jika ada duplikat.
-- Langkah 1: Hapus duplikat, simpan hanya row dengan id terbesar.
DELETE FROM madrasah_absensi a USING madrasah_absensi b
WHERE
  a.username = b.username
  AND a.tanggal = b.tanggal
  AND a.kelas = b.kelas
  AND a.jam_ke = b.jam_ke
  AND a.id < b.id;

-- Langkah 2: Tambahkan UNIQUE constraint.
ALTER TABLE madrasah_absensi ADD CONSTRAINT uq_madrasah_absensi_slot UNIQUE (username, tanggal, kelas, jam_ke);
