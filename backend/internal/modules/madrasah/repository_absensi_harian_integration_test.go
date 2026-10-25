//go:build integration

package madrasah

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// TestSimpanAbsensiHarianFormatIndonesiaIntegration mengunci regresi format
// tanggal. Nilai "02/01/2026" yang dikirim ke kolom DATE akan dibaca Postgres
// sebagai 2 Januari (gaya MDY). Tanggal yang ambigu seperti "05/10/2026" akan
// salah bulannya. Repository harus menormalkan ke ISO sebelum query.
func TestSimpanAbsensiHarianFormatIndonesiaIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := NewAbsensiHarianRepository(pool)

	username := fmt.Sprintf("it_tglindo_%d", time.Now().UnixNano())
	// 5 Oktober 2026, format Indonesia. Dengan gaya MDY akan tersimpan
	// sebagai 5 Mei 2026.
	tgl := time.Date(2026, 10, 5, 0, 0, 0, 0, time.Local)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
	})

	require.NoError(t, repo.Simpan(ctx, absensiHarianInput{
		Tanggal: tgl.Format("02/01/2006"), Username: username, Nama: "IT Tanggal",
		Jenis: "Masuk", Jam: "07:00", Lat: -6.1, Lng: 106.8, Jarak: 20,
	}), "tanggal format Indonesia harus tersimpan")

	var tersimpan time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT tanggal FROM madrasah_absensi_harian WHERE username = $1`, username,
	).Scan(&tersimpan))
	require.Equal(t, 2026, tersimpan.Year())
	require.Equal(t, time.October, tersimpan.Month())
	require.Equal(t, 5, tersimpan.Day())
}

// TestViewAbsensiGabunganIntegration mengunci aturan view gabungan: data harian
// menang, arsip lama tetap terbaca, dan tanggal yang sama tidak terhitung dua
// kali untuk guru yang sama.
func TestViewAbsensiGabunganIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_view_%d", stamp)

	// Tanggal dihitung dari tanggal lokal, bukan Truncate(24h) yang memakai
	// batas UTC. Tanpa ini, antara pukul 00.00-07.00 WIB tanggal "hari ini"
	// mundur satu hari sehingga tabrakan harian vs arsip tidak terbentuk.
	sekarang := time.Now()
	hariIni := time.Date(sekarang.Year(), sekarang.Month(), sekarang.Day(), 0, 0, 0, 0, time.Local)
	kemarin := hariIni.AddDate(0, 0, -1)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi WHERE username = $1`, username)
	})

	// kemarin: hanya ada di arsip, dua baris per jam pelajaran.
	_, err := pool.Exec(ctx, `
		INSERT INTO madrasah_absensi (tanggal, jam, username, nama_guru, mata_pelajaran, kelas, jam_ke)
		VALUES
			($1, '07:00:00', $2, 'IT View', 'Fiqih', 'VII-A', '1'),
			($1, '07:40:00', $2, 'IT View', 'Fiqih', 'VII-A', '2')`,
		kemarin.Format("02/01/2006"), username)
	require.NoError(t, err, "seed arsip lama")

	// Hari ini: sudah ada di tabel harian pada tanggal yang sama, arsip lama
	// untuk hari ini ikut disisipkan supaya tabrakan terbaca.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi (tanggal, jam, username, nama_guru, mata_pelajaran, kelas, jam_ke)
		VALUES ($1, '07:00:00', $2, 'IT View', 'Fiqih', 'VII-A', '1')`,
		hariIni.Format("02/01/2006"), username)
	require.NoError(t, err, "seed arsip bentrok dengan harian")

	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, status_waktu)
		VALUES ($1, $2, 'IT View', '07:05', 'Hadir')`, hariIni.Format("2006-01-02"), username)
	require.NoError(t, err, "seed harian")

	// kemarin tetap terbaca dari arsip, dua baris sesuai data jam pelajaran.
	var jumlahkemarin int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_absensi_gabungan WHERE username = $1 AND tanggal = $2`,
		username, kemarin.Format("2006-01-02")).Scan(&jumlahkemarin))
	require.Equal(t, 2, jumlahkemarin, "tanggal tanpa data harian harus terbaca dari arsip")

	// Hari ini hanya satu baris dari tabel harian; baris arsip di tanggal yang
	// sama dikecualikan supaya tidak dobel.
	var jumlahHariIni int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_absensi_gabungan WHERE username = $1 AND tanggal = $2`,
		username, hariIni.Format("2006-01-02")).Scan(&jumlahHariIni))
	require.Equal(t, 1, jumlahHariIni, "tanggal dengan data harian tidak boleh dobel dengan arsip")

	var sumber string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT sumber FROM madrasah_absensi_gabungan WHERE username = $1 AND tanggal = $2`,
		username, hariIni.Format("2006-01-02")).Scan(&sumber))
	require.Equal(t, "Harian", sumber)
}

// TestMaterialisasiSesiPeriodeIntegration mengunci aturan generator sesi:
// hanya guru yang statusnya Hadir yang dapat sesi, sesi izin tidak ditimpa,
// hari libur dilewati, dan tanggal masa depan tidak diproses.
func TestMaterialisasiSesiPeriodeIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_sesi_%d", stamp)
	// Senin supaya ada jadwal yang cocok.
	dari := time.Now()
	for dari.Weekday() != time.Monday {
		dari = dari.AddDate(0, 0, -1)
	}

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_jadwal WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_hari_libur WHERE tanggal = $1`, dari.Format("02/01/2006"))
	})

	_, err := pool.Exec(ctx, `
		INSERT INTO madrasah_jadwal (username, nama_guru, hari, mata_pelajaran, kelas, jam_ke, jam_mulai, jam_selesai)
		VALUES
			($1, 'IT Sesi', 'Senin', 'Fiqih', 'VII-A', 'I', '07:00', '07:40'),
			($1, 'IT Sesi', 'Senin', 'Fiqih', 'VII-A', 'II', '07:40', '08:20')`, username)
	require.NoError(t, err, "seed jadwal")

	// Tidak ada baris absensi harian: tidak boleh ada sesi yang dibuat.
	repo := NewSesiRepository(pool)
	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))

	var jumlah int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 0, jumlah, "guru tanpa absensi Hadir tidak boleh punya sesi")

	// Absensi Hadir pada hari yang sama: sesi terbentuk.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, status_waktu)
		VALUES ($1, $2, 'IT Sesi', '07:00', 'Hadir')`, dari.Format("2006-01-02"), username)
	require.NoError(t, err, "seed absensi hadir")

	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 1, jumlah, "guru yang hadir pada hari jadwal harus punya satu sesi")

	var sumber, jamKe string
	var durasi int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT sumber, durasi_menit, jam_ke FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username,
	).Scan(&sumber, &durasi, &jamKe))
	require.Equal(t, "Jadwal", sumber)
	require.Equal(t, 80, durasi)
	require.Equal(t, "I-II", jamKe, "slot yang berurutan harus menjadi satu sesi")

	// Sesi hasil approval izin tidak boleh ditimpa generator.
	_, err = pool.Exec(ctx, `
		UPDATE madrasah_sesi_mengajar
		SET pengguna = 'guru_pengganti', nama_pengganti = 'Guru Pengganti',
		    status_sesi = 'Mengajar', sumber = 'Izin'
		WHERE pengajar_utama = $1`, username)
	require.NoError(t, err, "simulasikan sesi izin")

	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))
	var pengguna string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT pengguna FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&pengguna))
	require.Equal(t, "guru_pengganti", pengguna, "sesi izin tidak boleh ditimpa generator")

	// Hari libur: sesi harian tidak boleh dibuat meski guru hadir.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_jadwal (username, nama_guru, hari, mata_pelajaran, kelas, jam_ke, jam_mulai, jam_selesai)
		VALUES ($1, 'IT Sesi', 'Selasa', 'IPA', 'VII-A', '1', '07:00', '07:40')`, username)
	require.NoError(t, err, "seed jadwal hari libur")
	selasa := dari.AddDate(0, 0, 1)
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, status_waktu)
		VALUES ($1, $2, 'IT Sesi', '07:00', 'Hadir')`, selasa.Format("2006-01-02"), username)
	require.NoError(t, err, "seed absensi hari libur")
	_, err = pool.Exec(ctx,
		`INSERT INTO madrasah_hari_libur (tanggal, keterangan) VALUES ($1, 'Libur test')`,
		selasa.Format("02/01/2006"))
	require.NoError(t, err, "seed hari libur")

	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, selasa))
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1 AND tanggal = $2`,
		username, selasa.Format("2006-01-02")).Scan(&jumlah))
	require.Equal(t, 0, jumlah, "hari libur tidak boleh menghasilkan sesi")
}

func TestJadwalGuruQueryDoesNotHaveAmbiguousColumnsIntegration(t *testing.T) {
	pool := testPool(t)
	username := fmt.Sprintf("it_jadwal_query_%d", time.Now().UnixNano())

	rows, err := NewJadwalRepository(pool).JadwalGuru(context.Background(), username)
	require.NoError(t, err, "jadwal guru harus dapat dimuat walau tidak ada jadwal")
	require.Empty(t, rows)
}

// TestMaterialisasiSesiMembuangSesiYatimIntegration mengunci aturan bahwa sesi
// harus punya bukti kehadiran.
//
// Generator sebelumnya hanya INSERT dan ON CONFLICT, tidak pernah menghapus.
// Akibatnya begitu absensi seorang guru dibatalkan atau dioreksi, sesinya tetap
// ada di madrasah_sesi_mengajar sehingga honor terus dibayar untuk slot yang
// sudah tidak sah.
//
// Cakupannya sengaja sempit. Sesi pengganti dan sesi izin bukan keluaran
// generator sehingga harus tetap utuh, termasuk sesi Digantikan yang masih
// bersumber 'Jadwal' dari era sebelum kolom sumber ada.
func TestMaterialisasiSesiMembuangSesiYatimIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_yatim_%d", stamp)
	dari := time.Now()
	for dari.Weekday() != time.Monday {
		dari = dari.AddDate(0, 0, -1)
	}
	tanggal := dari.Format("2006-01-02")

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_jadwal WHERE username = $1`, username)
	})

	_, err := pool.Exec(ctx, `
		INSERT INTO madrasah_jadwal (username, nama_guru, hari, mata_pelajaran, kelas, jam_ke, jam_mulai, jam_selesai)
		VALUES
			($1, 'IT Yatim', 'Senin', 'Fiqih', 'VII-A', 'I', '07:00', '07:40'),
			($1, 'IT Yatim', 'Senin', 'Fiqih', 'VII-A', 'II', '07:40', '08:20')`, username)
	require.NoError(t, err, "seed jadwal")

	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, status_waktu)
		VALUES ($1, $2, 'IT Yatim', '07:00', 'Hadir')`, tanggal, username)
	require.NoError(t, err, "seed absensi hadir")

	repo := NewSesiRepository(pool)
	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))

	var jumlah int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 1, jumlah, "slot berurutan guru yang hadir harus digabung menjadi satu sesi")

	// Absensi dibatalkan: sesi sebelumnya tidak boleh masih dibayar.
	_, err = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
	require.NoError(t, err, "batalkan absensi")

	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 0, jumlah, "sesi tanpa bukti kehadiran harus dihapus")

	// Absensi dioreksi jadi Izin, bukan dihapus: sesi juga harus hilang.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, status_waktu)
		VALUES ($1, $2, 'IT Yatim', '07:00', 'Izin')`, tanggal, username)
	require.NoError(t, err, "seed absensi izin")
	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 0, jumlah, "guru izin tanpa pengganti tidak boleh punya sesi")

	// Sesi pengganti hasil approval izin harus kebal, walau absensinya tidak ada.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai, mapel, kelas,
			pengajar_utama, nama_pengajar, pengguna, nama_pengganti,
			status_sesi, durasi_menit, sumber
		)
		SELECT j.id, $1, 'Senin', 'I', '07:00', '07:40', 'Fiqih', 'VII-A',
		       $2::varchar, 'IT Yatim', 'guru_pengganti', 'Guru Pengganti',
		       'Mengajar', 40, 'Izin'
		FROM madrasah_jadwal j
		WHERE j.username = $2::varchar AND j.jam_ke = 'I'`, tanggal, username)
	require.NoError(t, err, "seed sesi pengganti")

	// Sesi Digantikan yang masih bersumber 'Jadwal' berasal dari era sebelum
	// kolom sumber ada. Ia bukan keluaran generator dan tidak boleh hilang.
	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai, mapel, kelas,
			pengajar_utama, nama_pengajar, pengguna, nama_pengganti,
			status_sesi, durasi_menit, sumber
		)
		SELECT j.id, $1, 'Senin', 'II', '07:40', '08:20', 'Fiqih', 'VII-A',
		       $2::varchar, 'IT Yatim', $2::varchar, '',
		       'Digantikan', 40, 'Jadwal'
		FROM madrasah_jadwal j
		WHERE j.username = $2::varchar AND j.jam_ke = 'II'`, tanggal, username)
	require.NoError(t, err, "seed sesi Digantikan warisan")

	require.NoError(t, repo.MaterialisasiSesiPeriode(ctx, dari, dari))

	var pengguna, sumber, status string
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT pengguna, sumber, status_sesi
		  FROM madrasah_sesi_mengajar
		 WHERE pengajar_utama = $1
		 ORDER BY jam_ke`, username).Scan(&pengguna, &sumber, &status))
	require.Equal(t, "guru_pengganti", pengguna, "sesi pengganti tidak boleh terhapus")
	require.Equal(t, "Izin", sumber)

	require.NoError(t, pool.QueryRow(ctx, `
		SELECT pengguna, sumber, status_sesi
		  FROM madrasah_sesi_mengajar
		 WHERE pengajar_utama = $1
		 ORDER BY jam_ke OFFSET 1`, username).Scan(&pengguna, &sumber, &status))
	require.Equal(t, "Digantikan", status, "sesi Digantikan warisan tidak boleh terhapus")
}

// TestMaterialisasiSesiJagaPeriodeArsipIntegration mengunci bahwa sesi periode
// lama tidak ikut terhapus.
//
// Sesi hasil backfill migration 010 dibangun dari madrasah_absensi, bukan dari
// madrasah_absensi_harian. Kalau penghapusan hanya mengecek tabel harian, setiap
// sesi September dan awal Oktober dianggap tanpa bukti kehadiran dan dihapus
// padahal di situ masih ada honor historis yang belum dibayar.
func TestMaterialisasiSesiJagaPeriodeArsipIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_arsip_%d", stamp)
	dari := time.Now()
	for dari.Weekday() != time.Monday {
		dari = dari.AddDate(0, 0, -1)
	}
	tanggal := dari.Format("2006-01-02")

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_jadwal WHERE username = $1`, username)
	})

	// Periode lama: guru tidak punya baris di absensi harian, hanya di arsip.
	_, err := pool.Exec(ctx, `
		INSERT INTO madrasah_absensi
			(tanggal, jam, username, nama_guru, mata_pelajaran, kelas, jam_ke)
		VALUES ($1, '07:00:00', $2, 'IT Arsip', 'Fiqih', 'VII-A', '1')`,
		dari.Format("02/01/2006"), username)
	require.NoError(t, err, "seed arsip lama")

	var jadwalID int
	err = pool.QueryRow(ctx, `
		INSERT INTO madrasah_jadwal
			(username, nama_guru, hari, mata_pelajaran, kelas, jam_ke, jam_mulai, jam_selesai)
		VALUES ($1, 'IT Arsip', 'Senin', 'Fiqih', 'VII-A', 'I', '07:00', '07:40')
		RETURNING id`, username).Scan(&jadwalID)
	require.NoError(t, err, "seed jadwal arsip")

	_, err = pool.Exec(ctx, `
		INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai, mapel, kelas,
			pengajar_utama, nama_pengajar, pengguna, nama_pengganti,
			status_sesi, durasi_menit, sumber
		)
		VALUES ($1, $2, 'Senin', 'I', '07:00', '07:40', 'Fiqih', 'VII-A',
			$3, 'IT Arsip', $3, '', 'Mengajar', 40, 'Jadwal')`, jadwalID, tanggal, username)
	require.NoError(t, err, "seed sesi dari backfill 010")

	require.NoError(t, NewSesiRepository(pool).MaterialisasiSesiPeriode(ctx, dari, dari))

	var jumlah int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 1, jumlah, "sesi yang masih punya bukti di arsip tidak boleh terhapus")

	// Arsipnya dihapus total: sekarang tidak ada bukti mengajar sama sekali.
	_, err = pool.Exec(ctx, `DELETE FROM madrasah_absensi WHERE username = $1`, username)
	require.NoError(t, err, "hapus arsip")

	require.NoError(t, NewSesiRepository(pool).MaterialisasiSesiPeriode(ctx, dari, dari))
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM madrasah_sesi_mengajar WHERE pengajar_utama = $1`, username).Scan(&jumlah))
	require.Equal(t, 0, jumlah, "tanpa arsip maupun absensi harian, sesi harus dihapus")
}

// TestSimpanAbsensiHarianIntegration mengunci regresi tipe parameter pada
// Simpan: nilai lat/lng/jarak dikirim lewat CASE sehingga Postgres bisa
// salah menyimpulkan tipenya sebagai text dan gagal masuk ke kolom
// numeric/int (SQLSTATE 42804). Cast eksplisit harus mencegahnya.
func TestSimpanAbsensiHarianIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := NewAbsensiHarianRepository(pool)

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_absen_%d", stamp)
	tanggal := time.Now().Format("2006-01-02")

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
	})

	// Absen masuk: mengisi lat/lng/jarak.
	err := repo.Simpan(ctx, absensiHarianInput{
		Tanggal: tanggal, Username: username, Nama: "IT Absen",
		Jenis: "Masuk", Jam: "07:15",
		Lat: -6.1234567, Lng: 106.7654321, Jarak: 42,
		FotoURL: "foto.jpg", MapsURL: "https://maps",
	})
	require.NoError(t, err, "absen masuk seharusnya tersimpan")

	var lat float64
	var jarak int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT lat_masuk, jarak_masuk FROM madrasah_absensi_harian WHERE username = $1 AND tanggal = $2`,
		username, tanggal).Scan(&lat, &jarak))
	require.InDelta(t, -6.1234567, lat, 1e-6)
	require.Equal(t, 42, jarak)

	// Absen pulang: kolom pulang terisi, kolom masuk tetap utuh.
	err = repo.Simpan(ctx, absensiHarianInput{
		Tanggal: tanggal, Username: username, Nama: "IT Absen",
		Jenis: "Pulang", Jam: "14:30",
		Lat: -6.2, Lng: 106.8, Jarak: 10,
		FotoURL: "f2.jpg", MapsURL: "https://maps2",
	})
	require.NoError(t, err, "absen pulang seharusnya tersimpan")

	var latMasuk, latPulang float64
	var jamPulang time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT lat_masuk, lat_pulang, jam_pulang FROM madrasah_absensi_harian WHERE username = $1 AND tanggal = $2`,
		username, tanggal).Scan(&latMasuk, &latPulang, &jamPulang))
	require.InDelta(t, -6.1234567, latMasuk, 1e-6)
	require.InDelta(t, -6.2, latPulang, 1e-6)
	require.Equal(t, "14:30", jamPulang.Format("15:04"))
}

// TestAmbilRiwayatBulananNullJarakIntegration mengunci regresi scan: baris
// yang hanya berisi absen masuk menyimpan jarak_masuk/jarak_pulang = NULL
// (di-set eksplisit lewat CASE), sehingga riwayat harus mentolerir NULL tanpa
// error "cannot scan NULL into *int".
func TestAmbilRiwayatBulananNullJarakIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := NewAbsensiHarianRepository(pool)

	stamp := time.Now().UnixNano()
	username := fmt.Sprintf("it_riwayat_%d", stamp)
	tanggal := time.Now()

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username = $1`, username)
	})

	_, err := pool.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (tanggal, username, nama, jam_masuk, jarak_masuk, jarak_pulang)
		VALUES ($1, $2, $3, '07:00', NULL, NULL)`,
		tanggal.Format("2006-01-02"), username, "IT Riwayat")
	require.NoError(t, err, "seed baris dengan jarak NULL")

	riwayat, err := repo.AmbilRiwayatBulanan(ctx, username, int(tanggal.Month()), tanggal.Year())
	require.NoError(t, err, "riwayat seharusnya terbaca tanpa error scan NULL")
	require.Len(t, riwayat, 1)
	require.Equal(t, 0, riwayat[0].JarakMasuk)
	require.Equal(t, 0, riwayat[0].JarakPulang)
}
