-- Indeks performa untuk query bulan-honor & tabel pendukung.
-- Tanggal disimpan sebagai string DD/MM/YYYY; filter bulan memakai
-- right(tanggal, 7) = 'MM/YYYY' sehingga butuh index ekspresi, bukan LIKE suffix.
-- Query honor/rekap absensi: pola (username, bulan, status) + (pengganti, bulan, status).
CREATE INDEX IF NOT EXISTS idx_absensi_user_bulan_status ON madrasah_absensi (username, right (tanggal, 7), status_waktu);

CREATE INDEX IF NOT EXISTS idx_absensi_substitute_bulan ON madrasah_absensi (
  substitute_username,
  right (tanggal, 7),
  status_konfirmasi_pengganti
);

-- Honor tambahan di-cari per (username, bulan, tahun) satu-satu & batch per bulan.
CREATE INDEX IF NOT EXISTS idx_honor_tambahan_periode ON madrasah_honor_tambahan (username, bulan, tahun);

-- Hari libur sering di-filter per bulan.
CREATE INDEX IF NOT EXISTS idx_libur_bulan ON madrasah_hari_libur (right (tanggal, 7));