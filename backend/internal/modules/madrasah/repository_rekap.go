package madrasah

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type rekapJamRow struct {
	Username     string
	Nama         string
	StatusSergu  string
	JamReguler   int32
	JamPengganti int32
}

type rekapStatusRow struct {
	Hadir int
	Izin  int
	Sakit int
	Cuti  int
	Alpa  int
}

type rincianAbsensiRow struct {
	Tanggal     string
	Jam         string
	Mapel       string
	Kelas       string
	JamKe       string
	StatusWaktu string
	Keterangan  string
}

type guruInfoRow struct {
	NamaLengkap   string
	MataPelajaran string
	StatusSergu   string
}

type riwayatAbsensiFilter struct {
	TglMulai string
	TglAkhir string
	Username string
}

type riwayatAbsensiRow struct {
	ID                        int
	Tanggal                   string
	Jam                       string
	Username                  string
	Nama                      string
	Mapel                     string
	Jenis                     string
	Latitude                  float64
	Longitude                 float64
	Jarak                     int
	StatusLokasi              string
	FotoUrl                   string
	StatusWaktu               string
	Keterangan                string
	Kelas                     string
	JamKe                     string
	LinkMaps                  string
	GuruPengganti             string
	StatusKonfirmasiPengganti string
}

type rentangPenggantiRow struct {
	Username      string
	GuruPengganti string
	Mulai         string
	Selesai       string
}

type jadwalHariCountRow struct {
	Username string
	Hari     string
	Jumlah   int
}

type statistikDashboardRow struct {
	TotalGuru int
	Hadir     int
	Izin      int
}

type RekapRepository interface {
	JamMengajarBulanan(ctx context.Context, bulan, tahun int) ([]rekapJamRow, error)
	HariJadwalSemua(ctx context.Context) (map[string][]string, error)
	StatistikKehadiranRentang(ctx context.Context, dariIndo, sampaiIndo string) (map[string][5]int, error)
	JumlahJamRentang(ctx context.Context, dariIndo, sampaiIndo string) (map[string]int, error)

	StatusKehadiranSatuGuru(ctx context.Context, uname, dariIndo, sampaiIndo string) (rekapStatusRow, error)
	JumlahJamSatuGuru(ctx context.Context, uname, dariIndo, sampaiIndo string) (int, error)
	HariJadwalGuru(ctx context.Context, uname string) ([]string, error)
	RincianAbsensiRentang(ctx context.Context, uname, dariIndo, sampaiIndo string) ([]rincianAbsensiRow, error)
	InfoGuru(ctx context.Context, uname string) (guruInfoRow, bool, error)

	RiwayatAbsensiSemua(ctx context.Context, f riwayatAbsensiFilter) ([]riwayatAbsensiRow, error)

	RentangPenggantiTerkonfirmasi(ctx context.Context, tsAkhir, tsAwal string) ([]rentangPenggantiRow, error)
	JadwalHariJumlah(ctx context.Context, usernamesLower []string) ([]jadwalHariCountRow, error)

	StatistikDashboard(ctx context.Context, tanggal, hari string) (statistikDashboardRow, error)
}

type pgRekapRepository struct {
	db *pgxpool.Pool
}

func NewRekapRepository(db *pgxpool.Pool) RekapRepository {
	return &pgRekapRepository{db: db}
}

func (r *pgRekapRepository) JamMengajarBulanan(ctx context.Context, bulan, tahun int) ([]rekapJamRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.username, u.nama_lengkap, u.status_sergu,
		       COALESCE((
		           SELECT COUNT(*)
		           FROM madrasah_sesi_mengajar s
		           WHERE EXTRACT(MONTH FROM s.tanggal) = $1
		             AND EXTRACT(YEAR FROM s.tanggal) = $2
		             AND s.pengguna = u.username
		             AND s.status_sesi = 'Mengajar'
		             AND LOWER(s.pengajar_utama) = LOWER(u.username)
		       ), 0) AS jam_reguler,
		       COALESCE((
		           SELECT COUNT(*)
		           FROM madrasah_sesi_mengajar s
		           WHERE EXTRACT(MONTH FROM s.tanggal) = $1
		             AND EXTRACT(YEAR FROM s.tanggal) = $2
		             AND s.pengguna = u.username
		             AND s.status_sesi = 'Mengajar'
		             AND LOWER(s.pengajar_utama) <> LOWER(u.username)
		       ), 0) AS jam_pengganti
		FROM madrasah_users u
		WHERE u.role = 'guru' AND u.status = 'Aktif'
		ORDER BY u.nama_lengkap ASC
	`, bulan, tahun)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []rekapJamRow
	for rows.Next() {
		var rec rekapJamRow
		if err := rows.Scan(&rec.Username, &rec.Nama, &rec.StatusSergu, &rec.JamReguler, &rec.JamPengganti); err != nil {
			return nil, fmt.Errorf("scan rekap jam: %w", err)
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) HariJadwalSemua(ctx context.Context) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT j.username, j.hari
		FROM madrasah_jadwal j
		JOIN madrasah_users u ON LOWER(u.username) = LOWER(j.username)
		WHERE u.role = 'guru' AND u.status = 'Aktif'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var u, h string
		if err := rows.Scan(&u, &h); err != nil {
			continue
		}
		out[u] = append(out[u], h)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) StatistikKehadiranRentang(ctx context.Context, dariIndo, sampaiIndo string) (map[string][5]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.username,
			COUNT(DISTINCT a.tanggal) FILTER (WHERE a.status_waktu = 'Hadir'),
			COUNT(DISTINCT a.tanggal) FILTER (WHERE a.status_waktu = 'Izin'),
			COUNT(DISTINCT a.tanggal) FILTER (WHERE a.status_waktu = 'Sakit'),
			COUNT(DISTINCT a.tanggal) FILTER (WHERE a.status_waktu = 'Cuti'),
			COUNT(DISTINCT a.tanggal) FILTER (WHERE a.status_waktu = 'Alpa')
		FROM madrasah_absensi_gabungan a
		JOIN madrasah_users m ON m.username = a.username AND m.role = 'guru' AND m.status = 'Aktif'
		WHERE a.tanggal BETWEEN $1::DATE AND $2::DATE
		GROUP BY a.username
	`, tanggalISO(dariIndo), tanggalISO(sampaiIndo))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][5]int{}
	for rows.Next() {
		var u string
		var hadir, izin, sakit, cuti, alpa int
		if err := rows.Scan(&u, &hadir, &izin, &sakit, &cuti, &alpa); err != nil {
			continue
		}
		out[u] = [5]int{hadir, izin, sakit, cuti, alpa}
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) JumlahJamRentang(ctx context.Context, dariIndo, sampaiIndo string) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.pengguna, ROUND(SUM(s.durasi_menit)::numeric / 60.0)::int
		FROM madrasah_sesi_mengajar s
		WHERE s.pengguna IS NOT NULL AND s.pengguna <> ''
		  AND s.tanggal BETWEEN $1::DATE AND $2::DATE
		GROUP BY s.pengguna
	`, tanggalISO(dariIndo), tanggalISO(sampaiIndo))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]int{}
	for rows.Next() {
		var u string
		var n int
		if err := rows.Scan(&u, &n); err != nil {
			continue
		}
		out[u] = n
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) StatusKehadiranSatuGuru(ctx context.Context, uname, dariIndo, sampaiIndo string) (rekapStatusRow, error) {
	var rec rekapStatusRow
	err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT tanggal) FILTER (WHERE status_waktu = 'Hadir'),
			COUNT(DISTINCT tanggal) FILTER (WHERE status_waktu = 'Izin'),
			COUNT(DISTINCT tanggal) FILTER (WHERE status_waktu = 'Sakit'),
			COUNT(DISTINCT tanggal) FILTER (WHERE status_waktu = 'Cuti'),
			COUNT(DISTINCT tanggal) FILTER (WHERE status_waktu = 'Alpa')
		FROM madrasah_absensi_gabungan
		WHERE username = $1
		  AND tanggal BETWEEN $2::DATE AND $3::DATE
	`, uname, tanggalISO(dariIndo), tanggalISO(sampaiIndo)).Scan(&rec.Hadir, &rec.Izin, &rec.Sakit, &rec.Cuti, &rec.Alpa)
	if err != nil {
		return rekapStatusRow{}, err
	}
	return rec, nil
}

func (r *pgRekapRepository) JumlahJamSatuGuru(ctx context.Context, uname, dariIndo, sampaiIndo string) (int, error) {
	var jumlahJam int
	err := r.db.QueryRow(ctx, `
		SELECT ROUND(COALESCE(SUM(durasi_menit), 0)::numeric / 60.0)::int
		FROM madrasah_sesi_mengajar
		WHERE pengguna = $1
		  AND tanggal BETWEEN $2::DATE AND $3::DATE
	`, uname, tanggalISO(dariIndo), tanggalISO(sampaiIndo)).Scan(&jumlahJam)
	if err != nil {
		return 0, err
	}
	return jumlahJam, nil
}

func (r *pgRekapRepository) HariJadwalGuru(ctx context.Context, uname string) ([]string, error) {
	rows, err := r.db.Query(ctx, "SELECT hari FROM madrasah_jadwal WHERE username = $1", uname)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			continue
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) RincianAbsensiRentang(ctx context.Context, uname, dariIndo, sampaiIndo string) ([]rincianAbsensiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT TO_CHAR(tanggal, 'DD/MM/YYYY'), jam, mapel, kelas, jam_ke, status_waktu, keterangan
		FROM madrasah_absensi_gabungan
		WHERE (
		        LOWER(username) = LOWER($1)
		     OR (COALESCE(substitute_username, '') <> ''
		         AND LOWER(substitute_username) = LOWER($1)
		         AND status_konfirmasi_pengganti = 'Terkonfirmasi')
		      )
		  AND tanggal BETWEEN $2::DATE AND $3::DATE
		ORDER BY tanggal ASC, jam ASC
	`, uname, tanggalISO(dariIndo), tanggalISO(sampaiIndo))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []rincianAbsensiRow
	for rows.Next() {
		var rec rincianAbsensiRow
		if err := rows.Scan(&rec.Tanggal, &rec.Jam, &rec.Mapel, &rec.Kelas, &rec.JamKe, &rec.StatusWaktu, &rec.Keterangan); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) InfoGuru(ctx context.Context, uname string) (guruInfoRow, bool, error) {
	var rec guruInfoRow
	err := r.db.QueryRow(ctx,
		"SELECT nama_lengkap, mata_pelajaran, status_sergu FROM madrasah_users WHERE username = $1", uname,
	).Scan(&rec.NamaLengkap, &rec.MataPelajaran, &rec.StatusSergu)
	if errors.Is(err, pgx.ErrNoRows) {
		return guruInfoRow{}, false, nil
	}
	if err != nil {
		return guruInfoRow{}, false, err
	}
	return rec, true, nil
}

func (r *pgRekapRepository) RiwayatAbsensiSemua(ctx context.Context, f riwayatAbsensiFilter) ([]riwayatAbsensiRow, error) {
	query := `
		SELECT id, TO_CHAR(tanggal, 'DD/MM/YYYY'), jam, username, nama_guru, mapel,
		       jenis_absen, latitude, longitude, jarak_dari_sekolah, status_lokasi,
		       foto_url, status_waktu, keterangan, kelas, jam_ke, link_maps,
		       guru_pengganti, status_konfirmasi_pengganti
		FROM madrasah_absensi_gabungan
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if f.TglMulai != "" && f.TglAkhir != "" {
		if f.TglMulai == f.TglAkhir {
			query += fmt.Sprintf(" AND tanggal = $%d::DATE", argIdx)
			args = append(args, tanggalISO(f.TglMulai))
			argIdx++
		} else {
			query += fmt.Sprintf(" AND tanggal BETWEEN $%d::DATE AND $%d::DATE", argIdx, argIdx+1)
			args = append(args, tanggalISO(f.TglMulai), tanggalISO(f.TglAkhir))
			argIdx += 2
		}
	}
	if f.Username != "" {
		query += fmt.Sprintf(" AND username = $%d", argIdx)
		args = append(args, f.Username)
	}
	query += " ORDER BY tanggal DESC, CASE WHEN status_waktu IN ('Izin','Sakit','Cuti') THEN '00:00:00' ELSE jam END DESC LIMIT 500"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []riwayatAbsensiRow
	for rows.Next() {
		var rec riwayatAbsensiRow
		if err := rows.Scan(&rec.ID, &rec.Tanggal, &rec.Jam, &rec.Username, &rec.Nama, &rec.Mapel,
			&rec.Jenis, &rec.Latitude, &rec.Longitude, &rec.Jarak, &rec.StatusLokasi, &rec.FotoUrl,
			&rec.StatusWaktu, &rec.Keterangan, &rec.Kelas, &rec.JamKe, &rec.LinkMaps,
			&rec.GuruPengganti, &rec.StatusKonfirmasiPengganti); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) RentangPenggantiTerkonfirmasi(ctx context.Context, tsAkhir, tsAwal string) ([]rentangPenggantiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, guru_pengganti_username, tanggal_mulai, tanggal_selesai
		FROM madrasah_pengganti_rentang
		WHERE status_konfirmasi = 'Terkonfirmasi'
		  AND TO_DATE(tanggal_mulai, 'DD/MM/YYYY') <= TO_DATE($1, 'DD/MM/YYYY')
		  AND TO_DATE(tanggal_selesai, 'DD/MM/YYYY') >= TO_DATE($2, 'DD/MM/YYYY')
	`, tsAkhir, tsAwal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []rentangPenggantiRow
	for rows.Next() {
		var rec rentangPenggantiRow
		if err := rows.Scan(&rec.Username, &rec.GuruPengganti, &rec.Mulai, &rec.Selesai); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) JadwalHariJumlah(ctx context.Context, usernamesLower []string) ([]jadwalHariCountRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, hari, COUNT(*)
		FROM madrasah_jadwal
		WHERE LOWER(username) = ANY($1::text[])
		GROUP BY username, hari
	`, usernamesLower)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []jadwalHariCountRow
	for rows.Next() {
		var rec jadwalHariCountRow
		if err := rows.Scan(&rec.Username, &rec.Hari, &rec.Jumlah); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgRekapRepository) StatistikDashboard(ctx context.Context, tanggal, hari string) (statistikDashboardRow, error) {
	var out statistikDashboardRow
	err := r.db.QueryRow(ctx, `
		WITH guru_terjadwal AS (
			SELECT DISTINCT LOWER(j.username) AS username
			FROM madrasah_jadwal j
			JOIN madrasah_users u ON LOWER(u.username) = LOWER(j.username)
			WHERE u.role = 'guru' AND u.status = 'Aktif'
			  AND LOWER(TRIM(j.hari)) = LOWER($2)
		)
		SELECT
			COUNT(DISTINCT g.username),
			COUNT(DISTINCT LOWER(a.username)) FILTER (WHERE a.status_waktu = 'Hadir'),
			COUNT(DISTINCT LOWER(a.username)) FILTER (WHERE a.status_waktu IN ('Izin', 'Sakit', 'Cuti'))
		FROM guru_terjadwal g
		LEFT JOIN madrasah_absensi_gabungan a
		  ON LOWER(a.username) = g.username AND a.tanggal = $1::DATE
	`, tanggalISO(tanggal), hari).Scan(&out.TotalGuru, &out.Hadir, &out.Izin)
	if err != nil {
		return statistikDashboardRow{}, fmt.Errorf("statistik dashboard hari ini: %w", err)
	}
	return out, nil
}
