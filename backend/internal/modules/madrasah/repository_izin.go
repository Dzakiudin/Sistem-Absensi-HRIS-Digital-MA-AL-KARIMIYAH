package madrasah

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type sqlExecutor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var ErrPengajuanIzinTidakDitemukan = errors.New("pengajuan izin tidak ditemukan")

type pengajuanIzinRecord struct {
	ID               int
	Username         string
	Nama             string
	Jenis            string
	TglMulai         time.Time
	TglSelesai       time.Time
	Alasan           string
	Status           string
	DisetujuiOleh    string
	WaktuKeputusan   *time.Time
	CatatanKeputusan string
	GuruPengganti    string
	NamaPengganti    string
	StatusPengganti  string
}

type guruPenggantiRecord struct {
	ID            int
	IzinID        int
	GuruAsal      string
	NamaAsal      string
	GuruPengganti string
	NamaPengganti string
	Status        string
}

type permintaanPenggantiRow struct {
	ID         int
	IzinID     int
	GuruAsal   string
	NamaAsal   string
	Jenis      string
	TglMulai   time.Time
	TglSelesai time.Time
	Alasan     string
}

type monitoringIzinRow struct {
	Username      string
	Nama          string
	Jenis         string
	Jumlah        int
	TotalHari     int
	Mulai         time.Time
	Selesai       time.Time
	NamaPengganti string
}

type pengajuanIzinInput struct {
	Username     string
	Nama         string
	Jenis        string
	TglMulai     time.Time
	TglSelesai   time.Time
	Alasan       string
	DiajukanOleh string
}

type permintaanPenggantiInput struct {
	IzinID        int
	GuruAsal      string
	NamaAsal      string
	GuruPengganti string
	NamaPengganti string
}

type pengajuanFilter struct {
	Username string
	Status   string
	Menaik   bool
	Limit    int
}

type IzinRepository interface {
	AmbilPengajuanByID(ctx context.Context, id int) (*pengajuanIzinRecord, error)
	DaftarPengajuan(ctx context.Context, filter pengajuanFilter) ([]pengajuanIzinRecord, error)
	MonitoringBulanan(ctx context.Context, bulan, tahun int) ([]monitoringIzinRow, error)

	AdaBentrok(ctx context.Context, q sqlExecutor, username string, mulai, selesai time.Time) (bool, error)
	Ajukan(ctx context.Context, in pengajuanIzinInput, pengganti *permintaanPenggantiInput) (izinID int, tersimpanPengganti bool, err error)
	SimpanPengajuan(ctx context.Context, q sqlExecutor, in pengajuanIzinInput) (int, error)
	SimpanPermintaanPengganti(ctx context.Context, q sqlExecutor, in permintaanPenggantiInput) (bool, error)
	UbahStatusPengajuan(ctx context.Context, q sqlExecutor, id int, status, oleh, catatan string) (int64, error)
	BatalkanPengajuan(ctx context.Context, q sqlExecutor, id int) error
	BatalkanPermintaanPenggantiPending(ctx context.Context, q sqlExecutor, izinID int) error

	AmbilPenggantiByID(ctx context.Context, id int) (*guruPenggantiRecord, error)
	AmbilPenggantiByIzin(ctx context.Context, q sqlExecutor, izinID int) (*guruPenggantiRecord, error)
	DaftarPermintaanPengganti(ctx context.Context, username string) ([]permintaanPenggantiRow, error)
	JawabPermintaanPengganti(ctx context.Context, q sqlExecutor, id int, jawab, respondBy string) (int64, error)
	AlihkanSesiKePengganti(ctx context.Context, q sqlExecutor, penggantiID int, pengguna, namaPengganti string) error
}

type pgIzinRepository struct {
	db *pgxpool.Pool
}

func NewIzinRepository(db *pgxpool.Pool) IzinRepository {
	return &pgIzinRepository{db: db}
}

func (r *pgIzinRepository) Ajukan(ctx context.Context, in pengajuanIzinInput, pengganti *permintaanPenggantiInput) (int, bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("mulai transaksi pengajuan izin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	izinID, err := r.SimpanPengajuan(ctx, tx, in)
	if err != nil {
		return 0, false, err
	}

	if pengganti != nil {
		p := *pengganti
		p.IzinID = izinID
		tersimpan, err := r.SimpanPermintaanPengganti(ctx, tx, p)
		if err != nil {
			return 0, false, err
		}
		if !tersimpan {
			return 0, false, nil
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, false, fmt.Errorf("commit pengajuan izin: %w", err)
	}
	return izinID, true, nil
}

func (r *pgIzinRepository) AmbilPengajuanByID(ctx context.Context, id int) (*pengajuanIzinRecord, error) {
	var rec pengajuanIzinRecord
	err := r.db.QueryRow(ctx, `
		SELECT id, username, nama, jenis, tgl_mulai, tgl_selesai, alasan, status,
		       COALESCE(disetujui_oleh, ''), waktu_keputusan, COALESCE(catatan_keputusan, '')
		FROM madrasah_pengajuan_izin WHERE id = $1
	`, id).Scan(&rec.ID, &rec.Username, &rec.Nama, &rec.Jenis, &rec.TglMulai, &rec.TglSelesai,
		&rec.Alasan, &rec.Status, &rec.DisetujuiOleh, &rec.WaktuKeputusan, &rec.CatatanKeputusan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPengajuanIzinTidakDitemukan
	}
	if err != nil {
		return nil, fmt.Errorf("ambil pengajuan izin %d: %w", id, err)
	}
	return &rec, nil
}

func (r *pgIzinRepository) DaftarPengajuan(ctx context.Context, filter pengajuanFilter) ([]pengajuanIzinRecord, error) {
	q := `
		SELECT p.id, p.username, p.nama, p.jenis, p.tgl_mulai, p.tgl_selesai, p.alasan,
		       p.status, COALESCE(p.disetujui_oleh, ''), p.waktu_keputusan, COALESCE(p.catatan_keputusan, ''),
		       COALESCE(g.guru_pengganti, ''), COALESCE(g.nama_pengganti, ''), COALESCE(g.status, '')
		FROM madrasah_pengajuan_izin p
		LEFT JOIN madrasah_guru_pengganti g ON g.izin_id = p.id
	`
	args := []any{}
	where := []string{}
	if filter.Username != "" {
		args = append(args, filter.Username)
		where = append(where, fmt.Sprintf("LOWER(p.username) = LOWER($%d)", len(args)))
	}
	if filter.Status != "" {
		args = append(args, filter.Status)
		where = append(where, fmt.Sprintf("p.status = $%d", len(args)))
	}
	if len(where) > 0 {
		q += " WHERE " + where[0]
		for _, w := range where[1:] {
			q += " AND " + w
		}
	}
	if filter.Menaik {
		q += " ORDER BY p.tgl_mulai ASC, p.id ASC"
	} else {
		q += " ORDER BY p.tgl_mulai DESC, p.id DESC"
	}
	if filter.Limit > 0 {
		q += fmt.Sprintf(" LIMIT %d", filter.Limit)
	}

	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("daftar pengajuan izin: %w", err)
	}
	defer rows.Close()

	data := []pengajuanIzinRecord{}
	for rows.Next() {
		var rec pengajuanIzinRecord
		if err := rows.Scan(&rec.ID, &rec.Username, &rec.Nama, &rec.Jenis, &rec.TglMulai, &rec.TglSelesai,
			&rec.Alasan, &rec.Status, &rec.DisetujuiOleh, &rec.WaktuKeputusan, &rec.CatatanKeputusan,
			&rec.GuruPengganti, &rec.NamaPengganti, &rec.StatusPengganti); err != nil {
			continue
		}
		data = append(data, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi pengajuan izin: %w", err)
	}
	return data, nil
}

func (r *pgIzinRepository) MonitoringBulanan(ctx context.Context, bulan, tahun int) ([]monitoringIzinRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.username, p.nama, p.jenis,
		       COUNT(DISTINCT p.id) AS jumlah,
		       COALESCE(SUM(p.tgl_selesai - p.tgl_mulai + 1), 0) AS totalHari,
		       MIN(p.tgl_mulai), MAX(p.tgl_selesai),
		       COALESCE(MAX(g.nama_pengganti), '')
		FROM madrasah_pengajuan_izin p
		LEFT JOIN madrasah_guru_pengganti g ON g.izin_id = p.id
		WHERE p.status = 'Disetujui'
		  AND p.tgl_mulai <= make_date($2, $1, 1) + interval '1 month - 1 day'
		  AND p.tgl_selesai >= make_date($2, $1, 1)
		GROUP BY p.username, p.nama, p.jenis
		ORDER BY p.nama ASC
	`, bulan, tahun)
	if err != nil {
		return nil, fmt.Errorf("monitoring izin %02d/%d: %w", bulan, tahun, err)
	}
	defer rows.Close()

	data := []monitoringIzinRow{}
	for rows.Next() {
		var rec monitoringIzinRow
		if err := rows.Scan(&rec.Username, &rec.Nama, &rec.Jenis, &rec.Jumlah, &rec.TotalHari,
			&rec.Mulai, &rec.Selesai, &rec.NamaPengganti); err != nil {
			continue
		}
		data = append(data, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi monitoring izin: %w", err)
	}
	return data, nil
}

func (r *pgIzinRepository) AdaBentrok(ctx context.Context, q sqlExecutor, username string, mulai, selesai time.Time) (bool, error) {
	var n int
	err := q.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_pengajuan_izin
		WHERE LOWER(username) = LOWER($1)
		  AND status IN ('Pending','Disetujui')
		  AND tgl_mulai <= $3
		  AND tgl_selesai >= $2
	`, username, mulai.Format("2006-01-02"), selesai.Format("2006-01-02")).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("cek bentrok izin: %w", err)
	}
	return n > 0, nil
}

func (r *pgIzinRepository) SimpanPengajuan(ctx context.Context, q sqlExecutor, in pengajuanIzinInput) (int, error) {
	var id int
	err := q.QueryRow(ctx, `
		INSERT INTO madrasah_pengajuan_izin (
			username, nama, jenis, tgl_mulai, tgl_selesai, alasan, diajukan_oleh
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, in.Username, in.Nama, in.Jenis, in.TglMulai.Format("2006-01-02"), in.TglSelesai.Format("2006-01-02"),
		in.Alasan, in.DiajukanOleh).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("simpan pengajuan izin: %w", err)
	}
	return id, nil
}

func (r *pgIzinRepository) SimpanPermintaanPengganti(ctx context.Context, q sqlExecutor, in permintaanPenggantiInput) (bool, error) {
	tag, err := q.Exec(ctx, `
		INSERT INTO madrasah_guru_pengganti (
			izin_id, guru_asal, nama_asal, guru_pengganti, nama_pengganti, status
		) VALUES ($1, $2, $3, $4, $5, 'Pending')
		ON CONFLICT (izin_id) DO NOTHING
	`, in.IzinID, in.GuruAsal, in.NamaAsal, in.GuruPengganti, in.NamaPengganti)
	if err != nil {
		return false, fmt.Errorf("simpan permintaan pengganti: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *pgIzinRepository) UbahStatusPengajuan(ctx context.Context, q sqlExecutor, id int, status, oleh, catatan string) (int64, error) {
	tag, err := q.Exec(ctx, `
		UPDATE madrasah_pengajuan_izin SET
			status = $2, disetujui_oleh = $3, waktu_keputusan = CURRENT_TIMESTAMP,
			catatan_keputusan = $4, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = 'Pending'
	`, id, status, oleh, catatan)
	if err != nil {
		return 0, fmt.Errorf("ubah status pengajuan %d: %w", id, err)
	}
	return tag.RowsAffected(), nil
}

func (r *pgIzinRepository) BatalkanPengajuan(ctx context.Context, q sqlExecutor, id int) error {
	if _, err := q.Exec(ctx, `
		UPDATE madrasah_pengajuan_izin
		SET status = 'Dibatalkan', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id); err != nil {
		return fmt.Errorf("batalkan pengajuan %d: %w", id, err)
	}
	return nil
}

func (r *pgIzinRepository) BatalkanPermintaanPenggantiPending(ctx context.Context, q sqlExecutor, izinID int) error {
	if _, err := q.Exec(ctx,
		"UPDATE madrasah_guru_pengganti SET status = 'Dibatalkan' WHERE izin_id = $1 AND status = 'Pending'",
		izinID); err != nil {
		return fmt.Errorf("batalkan permintaan pengganti izin %d: %w", izinID, err)
	}
	return nil
}

func (r *pgIzinRepository) AmbilPenggantiByID(ctx context.Context, id int) (*guruPenggantiRecord, error) {
	rec, err := r.scanPengganti(ctx, r.db, "WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return nil, fmt.Errorf("permintaan pengganti %d tidak ditemukan", id)
	}
	return rec, nil
}

func (r *pgIzinRepository) AmbilPenggantiByIzin(ctx context.Context, q sqlExecutor, izinID int) (*guruPenggantiRecord, error) {
	return r.scanPengganti(ctx, q, "WHERE izin_id = $1", izinID)
}

func (r *pgIzinRepository) scanPengganti(ctx context.Context, q sqlExecutor, where string, arg int) (*guruPenggantiRecord, error) {
	var rec guruPenggantiRecord
	err := q.QueryRow(ctx, `
		SELECT id, izin_id, COALESCE(guru_asal, ''), COALESCE(nama_asal, ''),
		       COALESCE(guru_pengganti, ''), COALESCE(nama_pengganti, ''), COALESCE(status, '')
		FROM madrasah_guru_pengganti `+where, arg,
	).Scan(&rec.ID, &rec.IzinID, &rec.GuruAsal, &rec.NamaAsal,
		&rec.GuruPengganti, &rec.NamaPengganti, &rec.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ambil permintaan pengganti: %w", err)
	}
	return &rec, nil
}

func (r *pgIzinRepository) DaftarPermintaanPengganti(ctx context.Context, username string) ([]permintaanPenggantiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT g.id, g.izin_id, g.guru_asal, g.nama_asal,
		       p.jenis, p.tgl_mulai, p.tgl_selesai, p.alasan
		FROM madrasah_guru_pengganti g
		JOIN madrasah_pengajuan_izin p ON p.id = g.izin_id
		WHERE LOWER(g.guru_pengganti) = LOWER($1)
		  AND g.status = 'Pending'
		  AND p.status = 'Disetujui'
		ORDER BY p.tgl_mulai ASC
	`, username)
	if err != nil {
		return nil, fmt.Errorf("daftar permintaan pengganti: %w", err)
	}
	defer rows.Close()

	data := []permintaanPenggantiRow{}
	for rows.Next() {
		var rec permintaanPenggantiRow
		if err := rows.Scan(&rec.ID, &rec.IzinID, &rec.GuruAsal, &rec.NamaAsal,
			&rec.Jenis, &rec.TglMulai, &rec.TglSelesai, &rec.Alasan); err != nil {
			continue
		}
		data = append(data, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi permintaan pengganti: %w", err)
	}
	return data, nil
}

func (r *pgIzinRepository) JawabPermintaanPengganti(ctx context.Context, q sqlExecutor, id int, jawab, respondBy string) (int64, error) {
	tag, err := q.Exec(ctx, `
		UPDATE madrasah_guru_pengganti SET
			status = $2, respond = $3, waktu_respond = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = 'Pending'
	`, id, jawab, respondBy)
	if err != nil {
		return 0, fmt.Errorf("jawab permintaan pengganti %d: %w", id, err)
	}
	return tag.RowsAffected(), nil
}

func (r *pgIzinRepository) AlihkanSesiKePengganti(ctx context.Context, q sqlExecutor, penggantiID int, pengguna, namaPengganti string) error {
	if _, err := q.Exec(ctx, `
		UPDATE madrasah_sesi_mengajar s
		SET pengguna       = $2,
		    nama_pengajar  = $3,
		    nama_pengganti = g.nama_asal,
		    status_sesi    = 'Mengajar',
		    updated_at     = CURRENT_TIMESTAMP
		FROM madrasah_jadwal j, madrasah_guru_pengganti g
		WHERE s.jadwal_id = j.id
		  AND g.id = $1
		  AND s.pengajar_utama = g.guru_asal
		  AND s.status_sesi = 'Digantikan'
		  AND s.tanggal BETWEEN
		    (SELECT tgl_mulai FROM madrasah_pengajuan_izin WHERE id = g.izin_id)
		    AND (SELECT tgl_selesai FROM madrasah_pengajuan_izin WHERE id = g.izin_id)
	`, penggantiID, pengguna, namaPengganti); err != nil {
		return fmt.Errorf("alihkan sesi ke pengganti %d: %w", penggantiID, err)
	}
	return nil
}
