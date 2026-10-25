package madrasah

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type rosterSiswaRow struct {
	ID           int
	NIS          string
	NISN         string
	NamaLengkap  string
	JenisKelamin string
	Status       string
	Keterangan   string
}

type presensiSiswaItem struct {
	SiswaID       int
	KelasID       int
	JadwalID      int
	Tanggal       time.Time
	JamKe         string
	MataPelajaran string
	Guru          string
	Status        string
	Keterangan    string
	Editor        string
}

type presensiSiswaInput struct {
	Items []presensiSiswaItem
}

type rekapSiswaFilter struct {
	TahunAjaranID int
	Mulai         time.Time
	Selesai       time.Time
	KelasID       int
	WaliID        int
	Guru          string
	Mapel         string
}

type rekapSiswaRow struct {
	KelasID   int
	KodeKelas string
	SiswaID   int
	NIS       string
	Nama      string
	JK        string
	Total     int64
	H         int64
	I         int64
	S         int64
	A         int64
	T         int64
}

type riwayatPresensiRow struct {
	KodeKelas     string
	JamKe         string
	MataPelajaran string
	Guru          string
	H             int64
	I             int64
	S             int64
	A             int64
	T             int64
	Total         int64
}

type statistikKehadiranRow struct {
	Tanggal   time.Time
	KelasID   int64
	KodeKelas string
	Mapel     string
	Guru      string
	H         int64
	I         int64
	S         int64
	A         int64
	T         int64
}

type PresensiSiswaRepository interface {
	CariJadwalGuru(ctx context.Context, username, hari, kelas, jamKe string) (jadwalID int, mapel string, err error)
	CariJadwalSesiPengganti(ctx context.Context, username, tanggal, kelas, jamKe string) (jadwalID int, mapel string, err error)
	CariJadwalPenggantiRentang(ctx context.Context, pengganti, hari, kelas, jamKe, tanggal string) (jadwalID int, mapel string, err error)
	RosterSiswa(ctx context.Context, tahunAjaranID, kelasID int, tanggal time.Time, jamKe string) ([]rosterSiswaRow, error)
	HitungSudahDicatat(ctx context.Context, kelasID int, tanggal time.Time, jamKe string) (int64, error)
	SimpanBulk(ctx context.Context, in presensiSiswaInput) error
	RekapRentang(ctx context.Context, in rekapSiswaFilter) ([]rekapSiswaRow, error)
	RiwayatTanggal(ctx context.Context, tanggal time.Time) ([]riwayatPresensiRow, error)
	StatistikKehadiranRentang(ctx context.Context, mulai, selesai time.Time) ([]statistikKehadiranRow, error)
}

type pgPresensiSiswaRepository struct {
	db *pgxpool.Pool
}

func NewPresensiSiswaRepository(db *pgxpool.Pool) PresensiSiswaRepository {
	return &pgPresensiSiswaRepository{db: db}
}

func (r *pgPresensiSiswaRepository) CariJadwalGuru(ctx context.Context, username, hari, kelas, jamKe string) (int, string, error) {
	var jadwalID int
	var mapel string
	err := r.db.QueryRow(ctx, `
		SELECT id, mata_pelajaran FROM madrasah_jadwal
		WHERE username = $1 AND LOWER(hari) = LOWER($2) AND LOWER(kelas) = LOWER($3) AND LOWER(jam_ke) = LOWER($4)
		ORDER BY id ASC LIMIT 1
	`, username, hari, kelas, jamKe).Scan(&jadwalID, &mapel)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", nil
		}
		return 0, "", err
	}
	return jadwalID, mapel, nil
}

func (r *pgPresensiSiswaRepository) CariJadwalSesiPengganti(ctx context.Context, username, tanggal, kelas, jamKe string) (int, string, error) {
	var jadwalID int
	var mapel string
	err := r.db.QueryRow(ctx, `
		SELECT j.id, j.mata_pelajaran
		FROM madrasah_jadwal j
		JOIN madrasah_absensi a
		  ON LOWER(a.username) = LOWER(j.username)
		 AND LOWER(a.kelas) = LOWER(j.kelas)
		 AND LOWER(a.jam_ke) = LOWER(j.jam_ke)
		WHERE LOWER(a.substitute_username) = LOWER($1)
		  AND a.status_konfirmasi_pengganti = 'Terkonfirmasi'
		  AND TO_DATE(a.tanggal, 'DD/MM/YYYY') = $2::DATE
		  AND LOWER(j.kelas) = LOWER($3)
		  AND LOWER(j.jam_ke) = LOWER($4)
		ORDER BY j.id ASC
		LIMIT 1
	`, username, tanggalISO(tanggal), kelas, jamKe).Scan(&jadwalID, &mapel)
	if err == nil {
		return jadwalID, mapel, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, "", fmt.Errorf("cari jadwal slot pengganti: %w", err)
	}
	err = r.db.QueryRow(ctx, `
		SELECT jadwal_id, mapel
		FROM madrasah_sesi_mengajar
		WHERE LOWER(pengguna) = LOWER($1)
		  AND LOWER(pengguna) <> LOWER(pengajar_utama)
		  AND status_sesi = 'Mengajar'
		  AND tanggal = $2::DATE
		  AND LOWER(kelas) = LOWER($3)
		  AND (
		    LOWER(jam_ke) = LOWER($4)
		    OR LOWER(SPLIT_PART(jam_ke, '-', 1)) = LOWER($4)
		  )
		ORDER BY jam_mulai ASC NULLS LAST, jadwal_id ASC
		LIMIT 1
	`, username, tanggalISO(tanggal), kelas, jamKe).Scan(&jadwalID, &mapel)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", nil
		}
		return 0, "", fmt.Errorf("cari sesi pengganti: %w", err)
	}
	return jadwalID, mapel, nil
}

func (r *pgPresensiSiswaRepository) CariJadwalPenggantiRentang(ctx context.Context, pengganti, hari, kelas, jamKe, tanggal string) (int, string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.username, j.id, j.mata_pelajaran
		FROM madrasah_pengganti_rentang p
		JOIN madrasah_jadwal j
		  ON j.username = p.username AND LOWER(j.hari) = LOWER($2)
		 AND LOWER(j.kelas) = LOWER($3) AND LOWER(j.jam_ke) = LOWER($4)
		WHERE p.guru_pengganti_username = $1
		  AND p.status_konfirmasi = 'Terkonfirmasi'
		  AND TO_DATE(p.tanggal_mulai, 'DD/MM/YYYY') <= TO_DATE($5, 'DD/MM/YYYY')
		  AND TO_DATE(p.tanggal_selesai, 'DD/MM/YYYY') >= TO_DATE($5, 'DD/MM/YYYY')
		ORDER BY p.id ASC LIMIT 1
	`, pengganti, hari, kelas, jamKe, tanggal)
	if err != nil {
		return 0, "", err
	}
	defer rows.Close()

	var jadwalID int
	var mapel string
	for rows.Next() {
		var uname string
		var jid int
		var mpl string
		if err := rows.Scan(&uname, &jid, &mpl); err == nil {
			jadwalID = jid
			mapel = mpl
		}
	}
	return jadwalID, mapel, rows.Err()
}

func (r *pgPresensiSiswaRepository) RosterSiswa(ctx context.Context, tahunAjaranID, kelasID int, tanggal time.Time, jamKe string) ([]rosterSiswaRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.id, s.nis, s.nisn, s.nama_lengkap, s.jenis_kelamin,
		       COALESCE(a.status, ''), COALESCE(a.keterangan, '')
		FROM madrasah_siswa s
		JOIN madrasah_enrollment e ON e.siswa_id = s.id AND e.tahun_ajaran_id = $1 AND e.kelas_id = $2
		LEFT JOIN madrasah_absensi_siswa a
		       ON a.siswa_id = s.id AND a.tanggal = $3 AND a.kelas_id = $2 AND a.jam_ke = $4
		WHERE s.status = 'Aktif'
		ORDER BY s.nama_lengkap ASC
	`, tahunAjaranID, kelasID, tanggal, jamKe)
	if err != nil {
		return nil, fmt.Errorf("roster siswa: %w", err)
	}
	defer rows.Close()

	var out []rosterSiswaRow
	for rows.Next() {
		var b rosterSiswaRow
		if err := rows.Scan(&b.ID, &b.NIS, &b.NISN, &b.NamaLengkap, &b.JenisKelamin, &b.Status, &b.Keterangan); err != nil {
			return nil, fmt.Errorf("scan roster: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *pgPresensiSiswaRepository) HitungSudahDicatat(ctx context.Context, kelasID int, tanggal time.Time, jamKe string) (int64, error) {
	var jumlah int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_absensi_siswa
		WHERE kelas_id = $1 AND tanggal = $2 AND jam_ke = $3
	`, kelasID, tanggal, jamKe).Scan(&jumlah)
	if err != nil {
		return 0, fmt.Errorf("hitung tercatat: %w", err)
	}
	return jumlah, nil
}

func (r *pgPresensiSiswaRepository) SimpanBulk(ctx context.Context, in presensiSiswaInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, it := range in.Items {
		var jadwalVal interface{}
		if it.JadwalID > 0 {
			jadwalVal = it.JadwalID
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO madrasah_absensi_siswa
			    (siswa_id, kelas_id, jadwal_id, tanggal, jam_ke, mata_pelajaran, guru_username, status, keterangan, editor_username, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
			ON CONFLICT (siswa_id, kelas_id, jam_ke, tanggal) DO UPDATE SET
			    status = EXCLUDED.status,
			    keterangan = EXCLUDED.keterangan,
			    mata_pelajaran = EXCLUDED.mata_pelajaran,
			    jadwal_id = EXCLUDED.jadwal_id,
			    guru_username = EXCLUDED.guru_username,
			    editor_username = EXCLUDED.editor_username,
			    updated_at = CURRENT_TIMESTAMP
		`, it.SiswaID, it.KelasID, jadwalVal, it.Tanggal, it.JamKe, it.MataPelajaran, it.Guru,
			it.Status, it.Keterangan, it.Editor); err != nil {
			return fmt.Errorf("simpan presensi siswa %d: %w", it.SiswaID, err)
		}
	}
	return tx.Commit(ctx)
}

func (r *pgPresensiSiswaRepository) RekapRentang(ctx context.Context, in rekapSiswaFilter) ([]rekapSiswaRow, error) {
	filterKelas := "TRUE"
	filterGuru := "TRUE"
	filterMapel := "TRUE"
	args := []interface{}{in.TahunAjaranID, in.Mulai, in.Selesai}
	if in.KelasID > 0 {
		filterKelas = "k.id = $4"
		args = append(args, in.KelasID)
	} else if in.WaliID > 0 {
		filterKelas = "k.wali_kelas_id = $4"
		args = append(args, in.WaliID)
	}
	if in.Guru != "" {
		filterGuru = "x.guru_username = $5"
		args = append(args, in.Guru)
	}
	if in.Mapel != "" {
		filterMapel = "x.mata_pelajaran ILIKE '%' || $6 || '%'"
		args = append(args, in.Mapel)
	}

	query := fmt.Sprintf(`
		SELECT k.id AS kelas_id, k.kode_kelas,
		       s.id AS siswa_id, s.nis, s.nama_lengkap, s.jenis_kelamin,
		       COALESCE(COUNT(x.id), 0) AS total,
		       COALESCE(COUNT(x.id) FILTER (WHERE x.status = 'H'), 0) AS h,
		       COALESCE(COUNT(x.id) FILTER (WHERE x.status = 'I'), 0) AS i,
		       COALESCE(COUNT(x.id) FILTER (WHERE x.status = 'S'), 0) AS sk,
		       COALESCE(COUNT(x.id) FILTER (WHERE x.status = 'A'), 0) AS a,
		       COALESCE(COUNT(x.id) FILTER (WHERE x.status = 'T'), 0) AS t
		FROM madrasah_kelas k
		JOIN madrasah_enrollment e ON e.kelas_id = k.id AND e.tahun_ajaran_id = $1
		JOIN madrasah_siswa s ON s.id = e.siswa_id
		LEFT JOIN madrasah_absensi_siswa x
		       ON x.siswa_id = s.id AND x.tanggal BETWEEN $2 AND $3 AND x.kelas_id = k.id
		      AND %s AND %s
		WHERE %s
		GROUP BY k.id, k.kode_kelas, s.id, s.nis, s.nama_lengkap, s.jenis_kelamin
		ORDER BY k.kode_kelas, s.nama_lengkap ASC
	`, filterGuru, filterMapel, filterKelas)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("rekap presensi siswa: %w", err)
	}
	defer rows.Close()

	var out []rekapSiswaRow
	for rows.Next() {
		var b rekapSiswaRow
		if err := rows.Scan(&b.KelasID, &b.KodeKelas, &b.SiswaID, &b.NIS, &b.Nama, &b.JK,
			&b.Total, &b.H, &b.I, &b.S, &b.A, &b.T); err != nil {
			return nil, fmt.Errorf("scan rekap: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *pgPresensiSiswaRepository) RiwayatTanggal(ctx context.Context, tanggal time.Time) ([]riwayatPresensiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT k.kode_kelas, a.jam_ke, a.mata_pelajaran, a.guru_username,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'H'), 0) AS h,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'I'), 0) AS i,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'S'), 0) AS sk,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'A'), 0) AS a,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'T'), 0) AS t,
		       COUNT(*) AS total
		FROM madrasah_absensi_siswa a
		JOIN madrasah_kelas k ON k.id = a.kelas_id
		WHERE a.tanggal = $1
		GROUP BY k.kode_kelas, a.jam_ke, a.mata_pelajaran, a.guru_username
		ORDER BY k.kode_kelas, a.jam_ke
	`, tanggal)
	if err != nil {
		return nil, fmt.Errorf("riwayat presensi tanggal: %w", err)
	}
	defer rows.Close()

	var out []riwayatPresensiRow
	for rows.Next() {
		var b riwayatPresensiRow
		if err := rows.Scan(&b.KodeKelas, &b.JamKe, &b.MataPelajaran, &b.Guru,
			&b.H, &b.I, &b.S, &b.A, &b.T, &b.Total); err != nil {
			return nil, fmt.Errorf("scan riwayat: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *pgPresensiSiswaRepository) StatistikKehadiranRentang(ctx context.Context, mulai, selesai time.Time) ([]statistikKehadiranRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.tanggal, k.id, k.kode_kelas, a.mata_pelajaran, a.guru_username,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'H'), 0) AS h,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'I'), 0) AS i,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'S'), 0) AS sk,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'A'), 0) AS a,
		       COALESCE(COUNT(*) FILTER (WHERE a.status = 'T'), 0) AS t
		FROM madrasah_absensi_siswa a
		JOIN madrasah_kelas k ON k.id = a.kelas_id
		WHERE a.tanggal BETWEEN $1 AND $2
		GROUP BY a.tanggal, k.id, k.kode_kelas, a.mata_pelajaran, a.guru_username
		ORDER BY a.tanggal ASC, k.kode_kelas ASC
	`, mulai, selesai)
	if err != nil {
		return nil, fmt.Errorf("statistik kehadiran siswa: %w", err)
	}
	defer rows.Close()

	var out []statistikKehadiranRow
	for rows.Next() {
		var b statistikKehadiranRow
		if err := rows.Scan(&b.Tanggal, &b.KelasID, &b.KodeKelas, &b.Mapel, &b.Guru,
			&b.H, &b.I, &b.S, &b.A, &b.T); err != nil {
			return nil, fmt.Errorf("scan statistik kehadiran: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
