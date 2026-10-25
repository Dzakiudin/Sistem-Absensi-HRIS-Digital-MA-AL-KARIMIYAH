-- ============================================================
-- MIGRASI 010 — ALUR KERJA REVISI
--
-- Menyesuaikan skema dengan workflow baru:
--   1. Absensi harian: jam_masuk + jam_pulang (bukan per-slot jam pelajaran)
--   2. Pengajuan izin + approval Kepala Madrasah
--   3. Guru pengganti berdasar izin (terima/tolak)
--   4. Sesi mengajar materialized sebagai dasar hitungan honor
--   5. Honor draft/final dengan honor_detail per sesi
--   6. Master mapel + jam_mulai/jam_selesai pada jadwal
--
-- CATATAN PENTING SOAL DATA LAMA
--   Tabel madrasah_absensi yang lama TIDAK diubah dan TIDAK dihapus. Ia tetap
--   berisi riwayat absensi per jam pelajaran yang sudah dipakai di lapangan,
--   dan dibaca sebagai arsip oleh halaman monitoring lama. Semua penulisan
--   baru goes ke madrasah_absensi_harian.
--
--   Karena itu migrasi ini hanya menambahkan (ADD/INSERT) — tidak ada DROP
--   COLUMN atau DELETE. Aman diulang dan tidak merusak data produksi.
--
-- Semua stmt idempotent (IF NOT EXISTS / ON CONFLICT), aman dijalankan ulang.
-- ============================================================


-- ============================================================
-- 1. MASTER MATA PELAJARAN
-- ============================================================

CREATE TABLE IF NOT EXISTS madrasah_mapel (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(30) DEFAULT '',
    nama VARCHAR(150) UNIQUE NOT NULL,
    kelompok VARCHAR(50) DEFAULT 'Wajib',   -- Wajib / Pilihan / Ekstrakurikuler
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapel_aktif ON madrasah_mapel (aktif);

-- Madrasah memakai lebih dari satu daftar mapel: DaftarMapel bawaan untuk
-- kelas VII-IX, dan mapel kelas XII (Kimia, Biologi, Fisika, Ekonomi,
-- Geografi, KTI) yang ditambahkan lewat UI Jadwal. Keduanya digabung di
-- sini supaya tidak ada jadwal yatim.
INSERT INTO madrasah_mapel (kode, nama, kelompok, aktif)
SELECT 'MPA' || lpad((row_number() OVER (ORDER BY trim(b.nama)))::text, 2, '0'),
       trim(b.nama), 'Wajib', TRUE
FROM (SELECT DISTINCT mata_pelajaran AS nama FROM madrasah_jadwal
      WHERE mata_pelajaran IS NOT NULL AND trim(mata_pelajaran) NOT IN ('', '-')) b
WHERE trim(b.nama) <> ''
ON CONFLICT (nama) DO NOTHING;

-- Backfill dari daftar mapel lama yang masih berupa teks CSV di
-- madrasah_pengaturan.DaftarMapel. Dipisah koma, whitespace dirapikan.
--
-- PENTING: tanda kutip tunggal di dalam nama mapel (mis. Al-Qur'an Hadits)
-- harus dipertahankan. Nilai tersebut sama persis dengan yang diketik admin
-- di madrasah_jadwal.mata_pelajaran, jadi inilah yang membuat mapel bisa
-- tertaut ke jadwal. Menghapus tanda kutip akan mengubahnya menjadi
-- "Al-Quran Hadits" dan link mapel_id selalu gagal.
INSERT INTO madrasah_mapel (kode, nama, kelompok, aktif)
SELECT
    'MP' || lpad((row_number() OVER (ORDER BY trim(b.nama)))::text, 2, '0'),
    trim(b.nama),
    'Wajib',
    TRUE
FROM (
    SELECT DISTINCT unnest(
        string_to_array(value, ',')
    ) AS nama
    FROM madrasah_pengaturan
    WHERE key = 'DaftarMapel'
) b
WHERE trim(b.nama) <> ''
ON CONFLICT (nama) DO NOTHING;


-- ============================================================
-- 2. JADWAL — JAM NYATA + RELASI MAPEL
-- ============================================================
-- Jadwal kini terkait dengan mapel dan jam nyata, bukan
-- sekadar label "jam ke-III". Jam ke tetap disimpan sebagai label tampilan
-- supaya kompatibel dengan data lama.

ALTER TABLE madrasah_jadwal ADD COLUMN IF NOT EXISTS mapel_id INT;
ALTER TABLE madrasah_jadwal ADD COLUMN IF NOT EXISTS jam_mulai TIME;
ALTER TABLE madrasah_jadwal ADD COLUMN IF NOT EXISTS jam_selesai TIME;

CREATE INDEX IF NOT EXISTS idx_jadwal_mapel ON madrasah_jadwal (mapel_id);

-- Jadwal menunjuk master mapel. Kolom dibiarkan NULL supaya jadwal lama
-- yang nama mapelnya tidak ada di master tetap bisa tampil.
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

-- Backfill mapel_id dari kolom teks mata_pelajaran yang sudah ada.
UPDATE madrasah_jadwal j
SET mapel_id = m.id
FROM madrasah_mapel m
WHERE j.mapel_id IS NULL
  AND lower(trim(j.mata_pelajaran)) = lower(m.nama);

-- Backfill jam_mulai/jam_selesai dari label jam ke yang sudah dipakai.
-- Peta ini mengikuti konvensi jam pelajaran yang sebelumnya di-hardcode di
-- frontend (JAMKE_WAKTU). Nilai ini bisa diubah admin lewat UI Master
-- Jadwal tanpa menyentuh kode.
UPDATE madrasah_jadwal SET jam_mulai = '07:00', jam_selesai = '07:40' WHERE jam_ke = 'I'   AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '07:40', jam_selesai = '08:20' WHERE jam_ke = 'II'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '08:20', jam_selesai = '09:00' WHERE jam_ke = 'III' AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '09:20', jam_selesai = '10:00' WHERE jam_ke = 'IV' AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:00', jam_selesai = '10:40' WHERE jam_ke = 'V'  AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '10:40', jam_selesai = '11:20' WHERE jam_ke = 'VI' AND jam_mulai IS NULL;
UPDATE madrasah_jadwal SET jam_mulai = '11:20', jam_selesai = '12:00' WHERE jam_ke = 'VII' AND jam_mulai IS NULL;
-- Jadwal ohne label jam ke (mis. staf) tetap dapat jendela default.
-- Jadwal tanpa label jam ke (mis. staf) tetap dapat jendela default.
UPDATE madrasah_jadwal SET jam_mulai = '07:00', jam_selesai = '07:40' WHERE jam_mulai IS NULL;


-- ============================================================
-- 3. ABSENSI HARIAN (MASUK / PULANG)
-- ============================================================
-- Satu baris per pegawai per hari. Mencerminkan alur "absen masuk lalu
-- absen pulang", terpisah dari catatan mengajar per sesi (lihat tabel
-- madrasah_sesi_mengajar).
--
-- Siklus hidup baris:
--   jam_masuk terisi            -> sudah absen masuk
--   jam_pulang terisi           -> sudah absen pulang (sudah lengkap)
--   status_waktu <> 'Hadir'     -> hari izin/sakit/cuti/alpa, tidak perlu absen
--   izin_id terisi              -> absensi ini lahir dari pengajuan izin yang
--                                  sudah disetujui Kepala Madrasah

CREATE TABLE IF NOT EXISTS madrasah_absensi_harian (
    id SERIAL PRIMARY KEY,
    tanggal DATE NOT NULL,
    username VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL,

    jam_masuk TIME,
    jam_pulang TIME,
    status_terlambat BOOLEAN DEFAULT FALSE,
    menit_terlambat INT DEFAULT 0,

    -- Bukti absen masuk
    lat_masuk NUMERIC(11, 7),
    lng_masuk NUMERIC(11, 7),
    jarak_masuk INT DEFAULT 0,
    foto_masuk TEXT DEFAULT '',
    maps_masuk TEXT DEFAULT '',

    -- Bukti absen pulang
    lat_pulang NUMERIC(11, 7),
    lng_pulang NUMERIC(11, 7),
    jarak_pulang INT DEFAULT 0,
    foto_pulang TEXT DEFAULT '',
    maps_pulang TEXT DEFAULT '',

    -- 'Hadir' | 'Izin' | 'Sakit' | 'Cuti' | 'Alpa'
    status_waktu VARCHAR(20) NOT NULL DEFAULT 'Hadir',
    keterangan TEXT DEFAULT '',
    izin_id INT,

    dicatat_oleh VARCHAR(100) DEFAULT '',   -- kosong = absen sendiri
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_absensi_harian UNIQUE (username, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_abs_harian_tanggal ON madrasah_absensi_harian (tanggal);
CREATE INDEX IF NOT EXISTS idx_abs_harian_status ON madrasah_absensi_harian (tanggal, status_waktu);
CREATE INDEX IF NOT EXISTS idx_abs_harian_izin ON madrasah_absensi_harian (izin_id);


-- ============================================================
-- 4. PENGAJUAN IZIN + APPROVAL KEPALA MADRASAH
-- ============================================================
-- Alur: Guru/Staff mengajukan -> Kepala Madrasah menyetujui atau menolak.
-- Hanya pengajuan berstatus 'Disetujui' yang menghasilkan absensi izin dan
-- (bila ada pengganti) jadwal pengganti.

CREATE TABLE IF NOT EXISTS madrasah_pengajuan_izin (
    id SERIAL PRIMARY KEY,

    username VARCHAR(100) NOT NULL,          -- pemohon (guru atau staff)
    nama VARCHAR(255) NOT NULL,

    jenis VARCHAR(20) NOT NULL,              -- Izin / Sakit / Cuti
    tgl_mulai DATE NOT NULL,
    tgl_selesai DATE NOT NULL,
    alasan TEXT DEFAULT '',

    -- 'Pending' | 'Disetujui' | 'Ditolak' | 'Dibatalkan'
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',

    -- Pemohon yang mengirim, bila pengajuan dibuat admin/HR (opsional)
    diajukan_oleh VARCHAR(100) DEFAULT '',

    disetujui_oleh VARCHAR(100) DEFAULT '',
    waktu_keputusan TIMESTAMP,
    catatan_keputusan TEXT DEFAULT '',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_izin_status ON madrasah_pengajuan_izin (status);
CREATE INDEX IF NOT EXISTS idx_izin_pemohon ON madrasah_pengajuan_izin (username, tgl_mulai, tgl_selesai);
CREATE INDEX IF NOT EXISTS idx_izin_periode ON madrasah_pengajuan_izin (tgl_mulai, tgl_selesai);

-- Absensi hariancreated oleh approval izin menunjuk pengajuan ini.
-- Ditambahkan terpisah karena tabel absensi harian dibuat sebelum izin
-- sehingga FK-nya tidak bisa dideklarasikan inline.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_absensi_harian_izin'
    ) THEN
        ALTER TABLE madrasah_absensi_harian
            ADD CONSTRAINT fk_absensi_harian_izin
            FOREIGN KEY (izin_id) REFERENCES madrasah_pengajuan_izin(id)
            ON DELETE SET NULL;
    END IF;
END $$;


-- ============================================================
-- 5. GURU PENGGANTI (BERBASAR PENGAJUAN IZIN)
-- ============================================================
-- Satu pengajuan izin bisa punya satu pengganti. Pengganti menerima atau
-- menolak. Bila diterima, seluruh sesi jadwal guru asal pada periode itu
-- berpindah ke pengganti (lihat madrasah_sesi_mengajar).

CREATE TABLE IF NOT EXISTS madrasah_guru_pengganti (
    id SERIAL PRIMARY KEY,

    izin_id INT NOT NULL REFERENCES madrasah_pengajuan_izin(id) ON DELETE CASCADE,

    guru_asal VARCHAR(100) NOT NULL,          -- username yang digantikan
    nama_asal VARCHAR(255) NOT NULL,
    guru_pengganti VARCHAR(100) NOT NULL,     -- username pengganti
    nama_pengganti VARCHAR(255) NOT NULL,

    -- 'Pending' | 'Diterima' | 'Ditolak'
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',

    dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Satu pengajuan izin hanya boleh punya satu pengganti
    CONSTRAINT uq_pengganti_per_izin UNIQUE (izin_id)
);

CREATE INDEX IF NOT EXISTS idx_pengganti_pengganti ON madrasah_guru_pengganti (guru_pengganti, status);
CREATE INDEX IF NOT EXISTS idx_pengganti_asal ON madrasah_guru_pengganti (guru_asal, status);

-- Kolom pencatat jawaban pengganti. Nama lama (dibuat_pada/diperbarui_pada)
-- tetap dipertahankan; kolom ini dipakai alur revisi.
ALTER TABLE madrasah_guru_pengganti
    ADD COLUMN IF NOT EXISTS respond VARCHAR(100) DEFAULT '',
    ADD COLUMN IF NOT EXISTS waktu_respond TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;


-- ============================================================
-- 6. SESI MENGAJAR (MATERIALIZED)
-- ============================================================
-- Baris ini adalah sumber kebenaran hitungan honor. Dihasilkan otomatis
-- dari jadwal guru + pengajuan izin yang sudah disetujui, tanpa perlu guru
-- melakukan apa-apa.
--
-- pengajar_utama selalu guru pemilik jadwal. Sesi berada di salah satu dari
-- dua kondisi:
--   a. digantikan -> status_sesi 'Digantikan', pengguna = pengganti_id
--   b. tidak digantikan -> status_sesi 'Mengajar', pengguna = pengajar_utama

CREATE TABLE IF NOT EXISTS madrasah_sesi_mengajar (
    id SERIAL PRIMARY KEY,

    jadwal_id INT REFERENCES madrasah_jadwal(id) ON DELETE CASCADE,

    tanggal DATE NOT NULL,
    hari VARCHAR(15) NOT NULL,               -- Senin..Minggu, hasil konversi
    jam_ke VARCHAR(20) DEFAULT '',
    jam_mulai TIME,
    jam_selesai TIME,

    mapel VARCHAR(255) NOT NULL DEFAULT '',
    kelas VARCHAR(50) NOT NULL DEFAULT '',

    pengajar_utama VARCHAR(100) NOT NULL,    -- pemilik jadwal
    nama_pengajar VARCHAR(255) NOT NULL DEFAULT '',

    -- Pengguna sesi: pengganti bila digantikan, selain itu pengajar_utama
    pengguna VARCHAR(100) NOT NULL,
    nama_pengganti VARCHAR(255) DEFAULT '',
    pengganti_id INT REFERENCES madrasah_guru_pengganti(id) ON DELETE SET NULL,

    -- 'Digantikan' | 'Mengajar'
    status_sesi VARCHAR(20) NOT NULL DEFAULT 'Mengajar',

    -- Attendance marker sesi (bukan absensi harian pegawai)
    sudah_dicatat BOOLEAN DEFAULT FALSE,
    catatan TEXT DEFAULT '',

    durasi_menit INT DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_sesi UNIQUE (tanggal, jadwal_id)
);

CREATE INDEX IF NOT EXISTS idx_sesi_tanggal ON madrasah_sesi_mengajar (tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_pengguna ON madrasah_sesi_mengajar (pengguna, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_utama ON madrasah_sesi_mengajar (pengajar_utama, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_kelas ON madrasah_sesi_mengajar (kelas, tanggal);
CREATE INDEX IF NOT EXISTS idx_sesi_periode ON madrasah_sesi_mengajar (tanggal, status_sesi);


-- Presensi siswa kini menunjuk sesi mengajar, bukan jadwal mentah.
-- Kolom jadwal_id lama tetap dipertahankan dan dibiarkan untuk arsip.
ALTER TABLE madrasah_absensi_siswa ADD COLUMN IF NOT EXISTS sesi_id INT;

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

CREATE INDEX IF NOT EXISTS idx_abs_siswa_sesi ON madrasah_absensi_siswa (sesi_id);


-- ============================================================
-- 7. HONOR DRAFT / FINAL + DETAIL PER SESI
-- ============================================================
-- Kepala Madrasah menyusun honor per periode dari rekap sesi mengajar.
-- Selama status 'Draft', nilai masih boleh diubah. Setelah di-finalisasi,
-- record terkunci supaya angka yang dibayarkan tidak berubah diam-diam.

CREATE TABLE IF NOT EXISTS madrasah_honor (
    id SERIAL PRIMARY KEY,

    username VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    tipe VARCHAR(20) NOT NULL DEFAULT 'guru',   -- guru / staff

    periode VARCHAR(7) NOT NULL,               -- MM/YYYY
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

    -- 'Draft' | 'Final'
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    finalisasi_oleh VARCHAR(100) DEFAULT '',
    finalisasi_pada TIMESTAMP,

    catatan TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_honor_periode UNIQUE (username, tahun, bulan)
);

CREATE INDEX IF NOT EXISTS idx_honor_periode ON madrasah_honor (tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_honor_status ON madrasah_honor (status);
CREATE INDEX IF NOT EXISTS idx_honor_username ON madrasah_honor (username, tahun, bulan);

-- Tabel madrasah_honor sudah ada di instalasi lama dengan kolom versi
-- sebelumnya. Kolom yang dibutuhkan alur revisi ditambahkan secara
-- additive supaya instalasi lama dan fresh install berakhir pada bentuk
-- yang sama. Kolom lama (periode, tipe, honor_reguler, ...) dibiarkan
-- apa adanya supaya data historis tidak hilang.
ALTER TABLE madrasah_honor
    ADD COLUMN IF NOT EXISTS nama_pegawai VARCHAR(255),
    ADD COLUMN IF NOT EXISTS nip VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT '',
    ADD COLUMN IF NOT EXISTS total_honor NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_menit INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tanggal_cetak DATE;

-- Backfill kolom baru dari kolom lama supaya angka historis tidak hilang.
UPDATE madrasah_honor
SET nama_pegawai = nama
WHERE (nama_pegawai IS NULL OR nama_pegawai = '') AND nama IS NOT NULL;

UPDATE madrasah_honor
SET role = tipe
WHERE (role IS NULL OR role = '') AND tipe IS NOT NULL;

UPDATE madrasah_honor
SET total_honor = total_nominal
WHERE total_honor = 0 AND total_nominal > 0;

UPDATE madrasah_honor
SET total_menit = durasi_menit
WHERE total_menit = 0 AND durasi_menit > 0;

-- Rincian per sesi. Honor dihitung dari baris di sini, bukan langsung dari
-- absensi, sehingga nominal yang sudah direview Kepala bisa dibekukan.
CREATE TABLE IF NOT EXISTS madrasah_honor_detail (
    id SERIAL PRIMARY KEY,

    honor_id INT NOT NULL REFERENCES madrasah_honor(id) ON DELETE CASCADE,
    sesi_id INT REFERENCES madrasah_sesi_mengajar(id) ON DELETE SET NULL,

    tanggal DATE NOT NULL,
    mapel VARCHAR(255) NOT NULL DEFAULT '',
    kelas VARCHAR(50) NOT NULL DEFAULT '',
    jam_ke VARCHAR(20) DEFAULT '',
    jam_mulai TIME,
    jam_selesai TIME,

    -- 'Reguler' | 'Pengganti'
    jenis VARCHAR(20) NOT NULL DEFAULT 'Reguler',

    durasi_menit INT DEFAULT 0,
    tarif BIGINT DEFAULT 0,
    -- Persen yang diterima duguna terkait sesi ini (kebijakan izin).
    persen INT DEFAULT 100,
    nominal BIGINT DEFAULT 0,

    keterangan TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_honor_detail_honor ON madrasah_honor_detail (honor_id);
CREATE INDEX IF NOT EXISTS idx_honor_detail_sesi ON madrasah_honor_detail (sesi_id);


-- ============================================================
-- 8. PENGATURAN BARU
-- ============================================================

INSERT INTO madrasah_pengaturan (key, value) VALUES
  -- Jendela absensi harian. JamMasukBatas = absen masuk dibuka,
  -- JamPulangMinimal = absen pulang dibuka. Keduanya terpisah supaya
  -- guru tidak bisa absen masuk larut malam atau pulang sebelum
  -- jam kerja selesai.
  ('JamMasukBatas',           '07:00'),
  ('JamPulangMinimal',        '14:00'),
  ('BatasMasukTerlambat',     '07:15'),

  -- Kebijakan honor guru yang sedang izin. Karena madrasah berdiri sendiri
  -- dan mengikuti kebijakan internal, bukan aturan nasional, ketiganya
  -- disediakan sebagai opsi di Pengaturan Sistem:
  --   'Penuh'        -> guru asal tetap menerima honor penuh
  --   'Proporsional' -> guru asal menerima PersenSaatIzin persen
  --   'TidakDiberi'  -> guru asal tidak menerima honor untuk sesi itu
  ('HonorPolicySaatIzin',     'Proporsional'),
  ('HonorPersenSaatIzin',     '50'),
  ('HonorHitungStaff',        'true'),
  ('HonorSatuanPer',          'Jam')      -- Jam / Sesi
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 9. BACKFILL RIWAYAT ABSENSI LAMA -> SESI MENGAJAR
-- ============================================================
-- Mengubah catatan absensi lama (per jam pelajaran) menjadi sesi mengajar
-- agar rekap honor periode sebelumnya tetap bisa dihitung. Idempotent lewat
-- ON CONFLICT pada (tanggal, jadwal_id).
--
-- Tanggal lama disimpan sebagai teks DD/MM/YYYY; dikonversi ke DATE lewat
-- to_date. Baris yang tanggalnya tidak valid dilewati diam-diam agar
-- migrasi tidak gagal di tengah jalan.
--
-- PENTING: nama hari diambil dari EXTRACT(DOW), bukan to_char(...,'Day').
-- to_char memakai locale Postgres sehingga bisa mengembalikan "Thursday"
-- alih-alih "Kamis" tergantung lc_time — itu membuat perbandingan dengan
-- madrasah_jadwal.hari selalu gagal. EXTRACT(DOW) nilainya tetap 0..6
-- (0=Minggu) di semua locale, jadi aman di VPS maupun lokal.
INSERT INTO madrasah_sesi_mengajar (
    jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai,
    mapel, kelas, pengajar_utama, nama_pengajar,
    pengguna, nama_pengganti, status_sesi, durasi_menit
)
SELECT
    j.id,
    d.tgl,
    CASE EXTRACT(DOW FROM d.tgl)
        WHEN 0 THEN 'Minggu' WHEN 1 THEN 'Senin'  WHEN 2 THEN 'Selasa'
        WHEN 3 THEN 'Rabu'   WHEN 4 THEN 'Kamis'  WHEN 5 THEN 'Jumat'
        WHEN 6 THEN 'Sabtu'
    END,
    a.jam_ke,
    j.jam_mulai,
    j.jam_selesai,
    a.mata_pelajaran,
    a.kelas,
    a.username,
    a.nama_guru,
    a.username,
    NULL,
    'Mengajar',
    CASE
        WHEN j.jam_mulai IS NOT NULL AND j.jam_selesai IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (j.jam_selesai - j.jam_mulai)) / 60)::INT
        ELSE 0
    END
FROM madrasah_absensi a
CROSS JOIN LATERAL (SELECT to_date(a.tanggal, 'DD/MM/YYYY') AS tgl) d
JOIN madrasah_jadwal j
  ON j.username = a.username
 AND lower(trim(j.hari)) = lower(
        CASE EXTRACT(DOW FROM d.tgl)
            WHEN 0 THEN 'Minggu' WHEN 1 THEN 'Senin'  WHEN 2 THEN 'Selasa'
            WHEN 3 THEN 'Rabu'   WHEN 4 THEN 'Kamis'  WHEN 5 THEN 'Jumat'
            WHEN 6 THEN 'Sabtu'
        END)
 AND lower(trim(j.kelas)) = lower(trim(a.kelas))
 AND lower(trim(j.jam_ke)) = lower(trim(a.jam_ke))
WHERE a.tanggal ~ '^\d{2}/\d{2}/\d{4}$'
ON CONFLICT (tanggal, jadwal_id) DO NOTHING;


-- Mengisi durasi_menit untuk sesi yang tertinggal kosong (jadwal tanpa jam).
UPDATE madrasah_sesi_mengajar
SET durasi_menit = 40
WHERE durasi_menit = 0 OR durasi_menit IS NULL;