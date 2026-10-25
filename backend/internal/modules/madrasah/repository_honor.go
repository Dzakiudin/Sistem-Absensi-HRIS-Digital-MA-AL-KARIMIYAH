package madrasah

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pegawaiHonorRecord struct {
	Username string
	Nama     string
	Role     string
}

type sesiHonorRecord struct {
	Tanggal       time.Time
	JamMulai      *time.Time
	JamSelesai    *time.Time
	Mapel         string
	Kelas         string
	DurasiMenit   int
	StatusSesi    string
	Pengguna      string
	NamaPengajar  string
	PengajarUtama string
	NamaPengganti string
	PunyaPresensi bool

	Hadir int
	Izin  int
	Sakit int
	Alpa  int
	Telat int
}

type rekapHonorRow struct {
	Username   string
	Nama       string
	Role       string
	TotalHonor float64
	TotalSesi  int
	TotalMenit int
}

type honorDetailInput struct {
	Tanggal     time.Time
	Mapel       string
	Kelas       string
	JamMulai    *time.Time
	JamSelesai  *time.Time
	DurasiMenit int
	Persen      int
	Nominal     int64
	Keterangan  string
	Hadir       int
	Izin        int
	Sakit       int
	Alpa        int
	Telat       int
}

type rekapHonorInput struct {
	Username   string
	Nama       string
	Role       string
	TotalHonor float64
	TotalSesi  int
	TotalMenit int
	Detail     []honorDetailInput
}

type slipHonorRow struct {
	Status       string
	TotalHonor   float64
	TotalSesi    int
	TotalMenit   int
	TanggalCetak *time.Time
}

type detailSlipRow struct {
	Tanggal     time.Time
	Mapel       string
	Kelas       string
	JamMulai    *time.Time
	JamSelesai  *time.Time
	DurasiMenit int
	Persen      float64
	Nominal     float64
	Keterangan  string
	Hadir       int
	Izin        int
	Sakit       int
	Alpa        int
	Telat       int
}

type riwayatHonorRow struct {
	Bulan        int
	Tahun        int
	Status       string
	TotalHonor   float64
	TotalSesi    int
	TanggalCetak *time.Time
}

type honorTerkirimRow struct {
	ID           int
	Bulan        int
	Tahun        int
	TanggalKirim string
	SudahDilihat bool
}

type honorTerkirimInput struct {
	Username     string
	NamaGuru     string
	Bulan        int
	Tahun        int
	TanggalKirim string
}

type honorTambahanRecord struct {
	HonorStruktural    int64
	HonorTugasTambahan int64
	Keterangan         string
}

type honorTambahanInput struct {
	Username           string
	NamaGuru           string
	Bulan              int
	Tahun              int
	HonorStruktural    int64
	HonorTugasTambahan int64
	Keterangan         string
}

type honorTambahanPeriodeRow struct {
	Username   string
	Struktural int64
	Tugas      int64
}

type catatanHonorGuruRow struct {
	Tanggal                   string
	Mapel                     string
	Kelas                     string
	JamKe                     string
	Keterangan                string
	SubstituteUsername        string
	StatusKonfirmasiPengganti string
	Username                  string
}

type profilGuruHonorRow struct {
	Username      string
	Nama          string
	MataPelajaran string
	StatusSergu   string
}

type catatanHonorBulanRow struct {
	Username                  string
	Tanggal                   string
	Mapel                     string
	Kelas                     string
	JamKe                     string
	Keterangan                string
	SubstituteUsername        string
	StatusKonfirmasiPengganti string
}

type rentangPenggantiPeriodeRow struct {
	NamaLengkap string
	Mulai       string
	Selesai     string
}

type HonorRepository interface {
	PegawaiAktifHonor(ctx context.Context) ([]pegawaiHonorRecord, error)
	SesiBulanan(ctx context.Context, bulan, tahun int) ([]sesiHonorRecord, error)
	HonorTambahanBulanan(ctx context.Context, bulan, tahun int) (map[string]float64, error)

	StatusPeriode(ctx context.Context, bulan, tahun int) (string, error)
	RekapTersimpan(ctx context.Context, bulan, tahun int) ([]rekapHonorRow, error)
	GantiRekapDraft(ctx context.Context, bulan, tahun int, rekap []rekapHonorInput) error
	AdaRekap(ctx context.Context, bulan, tahun int) (int, error)
	Finalisasi(ctx context.Context, bulan, tahun int, oleh string) (int64, error)
	BukaFinalisasi(ctx context.Context, bulan, tahun int) (int64, error)

	PegawaiByUsername(ctx context.Context, username string) (pegawaiHonorRecord, bool, error)
	SlipTersimpan(ctx context.Context, bulan, tahun int, username string) (slipHonorRow, bool, error)
	DetailSlip(ctx context.Context, bulan, tahun int, username string) ([]detailSlipRow, error)
	RiwayatHonor(ctx context.Context, username string) ([]riwayatHonorRow, error)

	DaftarTerkirim(ctx context.Context, username string) ([]honorTerkirimRow, error)
	TandaiDilihat(ctx context.Context, id int, username string) error
	SlipSudahTerkirim(ctx context.Context, username string, bulan, tahun int) (bool, error)
	KirimSlip(ctx context.Context, in honorTerkirimInput) error
	KirimSlipBatch(ctx context.Context, items []honorTerkirimInput) error
	HonorTambahan(ctx context.Context, username string, bulan, tahun int) (honorTambahanRecord, error)
	HonorTambahanPeriode(ctx context.Context, bulan, tahun int) ([]honorTambahanPeriodeRow, error)
	SimpanTambahan(ctx context.Context, in honorTambahanInput) error

	InfoGuruHonor(ctx context.Context, username string) (nama, mapel, statusSergu string, err error)
	CatatanHonorGuru(ctx context.Context, username, bulanStr, tahunStr string) ([]catatanHonorGuruRow, error)
	ProfilGuruAktifHonor(ctx context.Context) ([]profilGuruHonorRow, error)
	CatatanHonorBulan(ctx context.Context, periode string, usernames []string) ([]catatanHonorBulanRow, error)
	RentangPenggantiKandidat(ctx context.Context, periode string) ([]string, error)
	RentangPenggantiPeriode(ctx context.Context, username, tsAkhir, tsAwal string) ([]rentangPenggantiPeriodeRow, error)
}

type pgHonorRepository struct {
	db *pgxpool.Pool
}

func NewHonorRepository(db *pgxpool.Pool) HonorRepository {
	return &pgHonorRepository{db: db}
}

func (r *pgHonorRepository) PegawaiAktifHonor(ctx context.Context) ([]pegawaiHonorRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, nama_lengkap, role
		FROM madrasah_users
		WHERE role IN ('guru','staf') AND status = 'Aktif'
		ORDER BY nama_lengkap ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []pegawaiHonorRecord
	for rows.Next() {
		var rec pegawaiHonorRecord
		if err := rows.Scan(&rec.Username, &rec.Nama, &rec.Role); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) SesiBulanan(ctx context.Context, bulan, tahun int) ([]sesiHonorRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.tanggal, s.jam_mulai, s.jam_selesai, s.mapel, s.kelas, s.durasi_menit,
		       s.status_sesi, s.pengguna, s.nama_pengajar, s.pengajar_utama, s.nama_pengganti,
		       COALESCE(p.jumlah, 0) > 0 AS punya_presensi,
		       COALESCE(p.hadir, 0), COALESCE(p.izin, 0), COALESCE(p.sakit, 0),
		       COALESCE(p.alpa, 0), COALESCE(p.telat, 0)
		FROM madrasah_sesi_mengajar s
		LEFT JOIN LATERAL (
		    SELECT COUNT(*) AS jumlah,
		           COUNT(*) FILTER (WHERE a.status = 'H') AS hadir,
		           COUNT(*) FILTER (WHERE a.status = 'I') AS izin,
		           COUNT(*) FILTER (WHERE a.status = 'S') AS sakit,
		           COUNT(*) FILTER (WHERE a.status = 'A') AS alpa,
		           COUNT(*) FILTER (WHERE a.status = 'T') AS telat
		    FROM madrasah_absensi_siswa a
		    WHERE a.tanggal = s.tanggal AND a.jadwal_id = s.jadwal_id
		) p ON TRUE
		WHERE EXTRACT(MONTH FROM s.tanggal) = $1
		  AND EXTRACT(YEAR FROM s.tanggal) = $2
		ORDER BY s.tanggal ASC, s.jam_mulai ASC NULLS LAST
	`, bulan, tahun)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []sesiHonorRecord
	for rows.Next() {
		var rec sesiHonorRecord
		if err := rows.Scan(&rec.Tanggal, &rec.JamMulai, &rec.JamSelesai, &rec.Mapel, &rec.Kelas,
			&rec.DurasiMenit, &rec.StatusSesi, &rec.Pengguna, &rec.NamaPengajar,
			&rec.PengajarUtama, &rec.NamaPengganti, &rec.PunyaPresensi,
			&rec.Hadir, &rec.Izin, &rec.Sakit, &rec.Alpa, &rec.Telat); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) HonorTambahanBulanan(ctx context.Context, bulan, tahun int) (map[string]float64, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, honor_struktural, honor_tugas_tambahan
		FROM madrasah_honor_tambahan
		WHERE bulan = $1 AND tahun = $2
	`, bulan, tahun)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]float64{}
	for rows.Next() {
		var u string
		var struktural, tugas int64
		if err := rows.Scan(&u, &struktural, &tugas); err != nil {
			continue
		}
		out[u] = float64(struktural + tugas)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) StatusPeriode(ctx context.Context, bulan, tahun int) (string, error) {
	var status string
	err := r.db.QueryRow(ctx, `
		SELECT status FROM madrasah_honor
		WHERE bulan = $1 AND tahun = $2
		LIMIT 1
	`, bulan, tahun).Scan(&status)
	if err != nil {
		return "", err
	}
	return status, nil
}

func (r *pgHonorRepository) RekapTersimpan(ctx context.Context, bulan, tahun int) ([]rekapHonorRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, nama_pegawai, role, total_honor, total_sesi, total_menit
		FROM madrasah_honor
		WHERE bulan = $1 AND tahun = $2
		ORDER BY nama_pegawai ASC
	`, bulan, tahun)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []rekapHonorRow
	for rows.Next() {
		var rec rekapHonorRow
		if err := rows.Scan(&rec.Username, &rec.Nama, &rec.Role, &rec.TotalHonor,
			&rec.TotalSesi, &rec.TotalMenit); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) GantiRekapDraft(ctx context.Context, bulan, tahun int, rekap []rekapHonorInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM madrasah_honor WHERE bulan = $1 AND tahun = $2`, bulan, tahun); err != nil {
		return err
	}

	periode := fmt.Sprintf("%02d/%04d", bulan, tahun)
	for _, h := range rekap {
		total := round1(h.TotalHonor)
		var honorID int
		err = tx.QueryRow(ctx, `
			INSERT INTO madrasah_honor (
				bulan, tahun, periode, username, nama, tipe, nama_pegawai, role,
				total_honor, total_nominal, total_sesi, durasi_menit, total_menit, status
			) VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,$10,$11,$11,'Draft')
			RETURNING id
		`, bulan, tahun, periode, h.Username, h.Nama, h.Role, h.Role,
			total, int64(total), h.TotalSesi, h.TotalMenit).Scan(&honorID)
		if err != nil {
			return err
		}

		for _, d := range h.Detail {
			_, err = tx.Exec(ctx, `
				INSERT INTO madrasah_honor_detail (
					honor_id, tanggal, mapel, kelas, jam_mulai, jam_selesai,
					durasi_menit, persen, nominal, keterangan,
					hadir, izin, sakit, alpa, telat
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			`, honorID, d.Tanggal.Format("2006-01-02"), d.Mapel, d.Kelas,
				d.JamMulai, d.JamSelesai, d.DurasiMenit, d.Persen,
				d.Nominal, d.Keterangan, d.Hadir, d.Izin, d.Sakit, d.Alpa, d.Telat)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func (r *pgHonorRepository) AdaRekap(ctx context.Context, bulan, tahun int) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_honor WHERE bulan = $1 AND tahun = $2
	`, bulan, tahun).Scan(&n)
	return n, err
}

func (r *pgHonorRepository) Finalisasi(ctx context.Context, bulan, tahun int, oleh string) (int64, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE madrasah_honor
		SET status = 'Final', tanggal_cetak = CURRENT_DATE,
		    finalisasi_oleh = $3, finalisasi_pada = CURRENT_TIMESTAMP,
		    updated_at = CURRENT_TIMESTAMP
		WHERE bulan = $1 AND tahun = $2
	`, bulan, tahun, oleh)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *pgHonorRepository) BukaFinalisasi(ctx context.Context, bulan, tahun int) (int64, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE madrasah_honor
		SET status = 'Draft', tanggal_cetak = NULL, finalisasi_pada = NULL,
		    updated_at = CURRENT_TIMESTAMP
		WHERE bulan = $1 AND tahun = $2 AND status = 'Final'
	`, bulan, tahun)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *pgHonorRepository) PegawaiByUsername(ctx context.Context, username string) (pegawaiHonorRecord, bool, error) {
	var rec pegawaiHonorRecord
	rec.Username = username
	err := r.db.QueryRow(ctx, `
		SELECT nama_lengkap, role FROM madrasah_users
		WHERE LOWER(username) = LOWER($1)
	`, username).Scan(&rec.Nama, &rec.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return pegawaiHonorRecord{}, false, nil
	}
	if err != nil {
		return pegawaiHonorRecord{}, false, err
	}
	return rec, true, nil
}

func (r *pgHonorRepository) SlipTersimpan(ctx context.Context, bulan, tahun int, username string) (slipHonorRow, bool, error) {
	var rec slipHonorRow
	err := r.db.QueryRow(ctx, `
		SELECT status, total_honor, total_sesi, total_menit, tanggal_cetak
		FROM madrasah_honor
		WHERE bulan = $1 AND tahun = $2 AND LOWER(username) = LOWER($3)
	`, bulan, tahun, username).Scan(&rec.Status, &rec.TotalHonor, &rec.TotalSesi, &rec.TotalMenit, &rec.TanggalCetak)
	if errors.Is(err, pgx.ErrNoRows) {
		return slipHonorRow{}, false, nil
	}
	if err != nil {
		return slipHonorRow{}, false, err
	}
	return rec, true, nil
}

func (r *pgHonorRepository) DetailSlip(ctx context.Context, bulan, tahun int, username string) ([]detailSlipRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT d.tanggal, d.mapel, d.kelas, d.jam_mulai, d.jam_selesai,
		       d.durasi_menit, d.persen, d.nominal, d.keterangan,
		       d.hadir, d.izin, d.sakit, d.alpa, d.telat
		FROM madrasah_honor_detail d
		JOIN madrasah_honor h ON h.id = d.honor_id
		WHERE h.bulan = $1 AND h.tahun = $2 AND LOWER(h.username) = LOWER($3)
		ORDER BY d.tanggal ASC, d.jam_mulai ASC NULLS LAST
	`, bulan, tahun, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []detailSlipRow
	for rows.Next() {
		var rec detailSlipRow
		if err := rows.Scan(&rec.Tanggal, &rec.Mapel, &rec.Kelas, &rec.JamMulai, &rec.JamSelesai,
			&rec.DurasiMenit, &rec.Persen, &rec.Nominal, &rec.Keterangan,
			&rec.Hadir, &rec.Izin, &rec.Sakit, &rec.Alpa, &rec.Telat); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) RiwayatHonor(ctx context.Context, username string) ([]riwayatHonorRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT bulan, tahun, status, total_honor, total_sesi, tanggal_cetak
		FROM madrasah_honor
		WHERE LOWER(username) = LOWER($1)
		ORDER BY tahun DESC, bulan DESC
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []riwayatHonorRow
	for rows.Next() {
		var rec riwayatHonorRow
		if err := rows.Scan(&rec.Bulan, &rec.Tahun, &rec.Status, &rec.TotalHonor,
			&rec.TotalSesi, &rec.TanggalCetak); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) DaftarTerkirim(ctx context.Context, username string) ([]honorTerkirimRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, bulan, tahun, tanggal_kirim, sudah_dilihat
		FROM madrasah_honor_terkirim
		WHERE username = $1
		ORDER BY id DESC
	`, username)
	if err != nil {
		return nil, fmt.Errorf("daftar honor terkirim: %w", err)
	}
	defer rows.Close()

	var out []honorTerkirimRow
	for rows.Next() {
		var rec honorTerkirimRow
		if err := rows.Scan(&rec.ID, &rec.Bulan, &rec.Tahun, &rec.TanggalKirim, &rec.SudahDilihat); err != nil {
			return nil, fmt.Errorf("scan honor terkirim: %w", err)
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) TandaiDilihat(ctx context.Context, id int, username string) error {
	if _, err := r.db.Exec(ctx,
		"UPDATE madrasah_honor_terkirim SET sudah_dilihat = true WHERE id = $1 AND username = $2", id, username,
	); err != nil {
		return fmt.Errorf("tandai honor dilihat: %w", err)
	}
	return nil
}

func (r *pgHonorRepository) SlipSudahTerkirim(ctx context.Context, username string, bulan, tahun int) (bool, error) {
	var exists int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM madrasah_honor_terkirim WHERE username = $1 AND bulan = $2 AND tahun = $3",
		username, bulan, tahun).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("cek slip terkirim: %w", err)
	}
	return exists > 0, nil
}

func (r *pgHonorRepository) KirimSlip(ctx context.Context, in honorTerkirimInput) error {
	if _, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_honor_terkirim (username, nama_guru, bulan, tahun, tanggal_kirim, sudah_dilihat)
		VALUES ($1, $2, $3, $4, $5, false)
	`, in.Username, in.NamaGuru, in.Bulan, in.Tahun, in.TanggalKirim); err != nil {
		return fmt.Errorf("kirim slip honor: %w", err)
	}
	return nil
}

func (r *pgHonorRepository) KirimSlipBatch(ctx context.Context, items []honorTerkirimInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, in := range items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO madrasah_honor_terkirim (username, nama_guru, bulan, tahun, tanggal_kirim, sudah_dilihat)
			VALUES ($1, $2, $3, $4, $5, false)
		`, in.Username, in.NamaGuru, in.Bulan, in.Tahun, in.TanggalKirim); err != nil {
			return fmt.Errorf("kirim slip batch: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *pgHonorRepository) HonorTambahan(ctx context.Context, username string, bulan, tahun int) (honorTambahanRecord, error) {
	var rec honorTambahanRecord
	err := r.db.QueryRow(ctx, `
		SELECT honor_struktural, honor_tugas_tambahan, keterangan
		FROM madrasah_honor_tambahan
		WHERE username = $1 AND bulan = $2 AND tahun = $3
	`, username, bulan, tahun).Scan(&rec.HonorStruktural, &rec.HonorTugasTambahan, &rec.Keterangan)
	if errors.Is(err, pgx.ErrNoRows) {
		return honorTambahanRecord{}, nil
	}
	if err != nil {
		return honorTambahanRecord{}, err
	}
	return rec, nil
}

func (r *pgHonorRepository) HonorTambahanPeriode(ctx context.Context, bulan, tahun int) ([]honorTambahanPeriodeRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, honor_struktural, honor_tugas_tambahan
		FROM madrasah_honor_tambahan
		WHERE bulan = $1 AND tahun = $2
	`, bulan, tahun)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []honorTambahanPeriodeRow
	for rows.Next() {
		var rec honorTambahanPeriodeRow
		if err := rows.Scan(&rec.Username, &rec.Struktural, &rec.Tugas); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) SimpanTambahan(ctx context.Context, in honorTambahanInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		"DELETE FROM madrasah_honor_tambahan WHERE username = $1 AND bulan = $2 AND tahun = $3",
		in.Username, in.Bulan, in.Tahun); err != nil {
		return fmt.Errorf("hapus honor tambahan lama: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO madrasah_honor_tambahan (username, nama_guru, bulan, tahun, honor_struktural, honor_tugas_tambahan, keterangan)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, in.Username, in.NamaGuru, in.Bulan, in.Tahun, in.HonorStruktural, in.HonorTugasTambahan, in.Keterangan); err != nil {
		return fmt.Errorf("simpan honor tambahan: %w", err)
	}
	return tx.Commit(ctx)
}

func (r *pgHonorRepository) InfoGuruHonor(ctx context.Context, username string) (string, string, string, error) {
	var namaLengkap, mapel, statusSergu string
	err := r.db.QueryRow(ctx,
		"SELECT nama_lengkap, mata_pelajaran, status_sergu FROM madrasah_users WHERE username = $1",
		username).Scan(&namaLengkap, &mapel, &statusSergu)
	if err != nil {
		return "", "", "", fmt.Errorf("user %s not found: %w", username, err)
	}
	return namaLengkap, mapel, statusSergu, nil
}

func (r *pgHonorRepository) CatatanHonorGuru(ctx context.Context, username, bulanStr, tahunStr string) ([]catatanHonorGuruRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT TO_CHAR(tanggal, 'DD/MM/YYYY'), mapel, kelas, jam_ke, keterangan,
		       substitute_username, status_konfirmasi_pengganti, username
		FROM madrasah_absensi_gabungan
		WHERE (
			(username = $1 AND status_waktu = 'Hadir' AND (guru_pengganti = '' OR status_konfirmasi_pengganti != 'Terkonfirmasi'))
			OR
			(substitute_username = $1 AND status_konfirmasi_pengganti = 'Terkonfirmasi')
		)
		AND to_char(tanggal, 'MM/YYYY') = $2::text || '/' || $3::text
		ORDER BY tanggal ASC
	`, username, bulanStr, tahunStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []catatanHonorGuruRow{}
	for rows.Next() {
		var rec catatanHonorGuruRow
		if err := rows.Scan(&rec.Tanggal, &rec.Mapel, &rec.Kelas, &rec.JamKe, &rec.Keterangan,
			&rec.SubstituteUsername, &rec.StatusKonfirmasiPengganti, &rec.Username); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) ProfilGuruAktifHonor(ctx context.Context) ([]profilGuruHonorRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, nama_lengkap, mata_pelajaran, status_sergu
		FROM madrasah_users
		WHERE role = 'guru' AND status = 'Aktif'
		ORDER BY nama_lengkap ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []profilGuruHonorRow{}
	for rows.Next() {
		var rec profilGuruHonorRow
		if err := rows.Scan(&rec.Username, &rec.Nama, &rec.MataPelajaran, &rec.StatusSergu); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) CatatanHonorBulan(ctx context.Context, periode string, usernames []string) ([]catatanHonorBulanRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, TO_CHAR(tanggal, 'DD/MM/YYYY'), mapel, kelas, jam_ke, keterangan,
		       substitute_username, status_konfirmasi_pengganti
		FROM madrasah_absensi_gabungan
		WHERE to_char(tanggal, 'MM/YYYY') = $1
		  AND (
		    (status_waktu = 'Hadir' AND (guru_pengganti = '' OR status_konfirmasi_pengganti != 'Terkonfirmasi'))
		    OR (status_konfirmasi_pengganti = 'Terkonfirmasi')
		  )
		  AND (username = ANY($2::text[]) OR substitute_username = ANY($2::text[]))
		ORDER BY tanggal ASC
	`, periode, usernames)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []catatanHonorBulanRow{}
	for rows.Next() {
		var rec catatanHonorBulanRow
		if err := rows.Scan(&rec.Username, &rec.Tanggal, &rec.Mapel, &rec.Kelas, &rec.JamKe,
			&rec.Keterangan, &rec.SubstituteUsername, &rec.StatusKonfirmasiPengganti); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) RentangPenggantiKandidat(ctx context.Context, periode string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT guru_pengganti_username
		FROM madrasah_pengganti_rentang
		WHERE status_konfirmasi = 'Terkonfirmasi'
		  AND right(tanggal_mulai, 7) <= $1
		  AND right(tanggal_selesai, 7) >= $1
	`, periode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			continue
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *pgHonorRepository) RentangPenggantiPeriode(ctx context.Context, username, tsAkhir, tsAwal string) ([]rentangPenggantiPeriodeRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT nama_lengkap, tanggal_mulai, tanggal_selesai
		FROM madrasah_pengganti_rentang
		WHERE guru_pengganti_username = $1 AND status_konfirmasi = 'Terkonfirmasi'
		  AND TO_DATE(tanggal_mulai, 'DD/MM/YYYY') <= TO_DATE($2, 'DD/MM/YYYY')
		  AND TO_DATE(tanggal_selesai, 'DD/MM/YYYY') >= TO_DATE($3, 'DD/MM/YYYY')
		ORDER BY TO_DATE(tanggal_mulai, 'DD/MM/YYYY') ASC
	`, username, tsAkhir, tsAwal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []rentangPenggantiPeriodeRow{}
	for rows.Next() {
		var rec rentangPenggantiPeriodeRow
		if err := rows.Scan(&rec.NamaLengkap, &rec.Mulai, &rec.Selesai); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}
