package madrasah

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type tahunAjaranRecord struct {
	ID             int
	Kode           string
	Semester       string
	Nama           string
	TanggalMulai   string
	TanggalSelesai string
	Aktif          bool
}

type tahunAjaranAktifRecord struct {
	ID       int
	Kode     string
	Semester string
	Nama     string
}

type tahunAjaranInput struct {
	ID             int
	Kode           string
	Semester       string
	Nama           string
	TanggalMulai   *time.Time
	TanggalSelesai *time.Time
	Aktif          bool
	ToggleAktif    bool
}

type TahunAjaranRepository interface {
	Aktif(ctx context.Context) (tahunAjaranAktifRecord, error)
	Daftar(ctx context.Context) ([]tahunAjaranRecord, error)
	Simpan(ctx context.Context, in tahunAjaranInput) error
	AdaEnrollment(ctx context.Context, id int) (bool, error)
	Hapus(ctx context.Context, id int) error
}

type pgTahunAjaranRepository struct {
	db *pgxpool.Pool
}

func NewTahunAjaranRepository(db *pgxpool.Pool) TahunAjaranRepository {
	return &pgTahunAjaranRepository{db: db}
}

func (r *pgTahunAjaranRepository) Aktif(ctx context.Context) (tahunAjaranAktifRecord, error) {
	var rec tahunAjaranAktifRecord
	err := r.db.QueryRow(ctx, "SELECT id, kode, semester, nama FROM madrasah_tahun_ajaran WHERE aktif = TRUE ORDER BY id DESC LIMIT 1").
		Scan(&rec.ID, &rec.Kode, &rec.Semester, &rec.Nama)
	if err != nil {
		err = r.db.QueryRow(ctx, "SELECT id, kode, semester, nama FROM madrasah_tahun_ajaran ORDER BY id DESC LIMIT 1").
			Scan(&rec.ID, &rec.Kode, &rec.Semester, &rec.Nama)
		if err != nil {
			return tahunAjaranAktifRecord{}, nil
		}
	}
	return rec, nil
}

func (r *pgTahunAjaranRepository) Daftar(ctx context.Context) ([]tahunAjaranRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, kode, semester, nama,
		       COALESCE(to_char(tanggal_mulai, 'DD/MM/YYYY'), ''),
		       COALESCE(to_char(tanggal_selesai, 'DD/MM/YYYY'), ''),
		       aktif
		FROM madrasah_tahun_ajaran
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("daftar tahun ajaran: %w", err)
	}
	defer rows.Close()

	list := []tahunAjaranRecord{}
	for rows.Next() {
		var rec tahunAjaranRecord
		if err := rows.Scan(&rec.ID, &rec.Kode, &rec.Semester, &rec.Nama,
			&rec.TanggalMulai, &rec.TanggalSelesai, &rec.Aktif); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, rows.Err()
}

func (r *pgTahunAjaranRepository) Simpan(ctx context.Context, in tahunAjaranInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if in.Aktif {
		if _, err := tx.Exec(ctx, "UPDATE madrasah_tahun_ajaran SET aktif = FALSE"); err != nil {
			return err
		}
	}

	switch {
	case in.ToggleAktif:
		_, err = tx.Exec(ctx, "UPDATE madrasah_tahun_ajaran SET aktif = $1 WHERE id = $2", in.Aktif, in.ID)
	case in.ID > 0:
		_, err = tx.Exec(ctx, `
			UPDATE madrasah_tahun_ajaran
			SET kode = $1, semester = $2, nama = $3, tanggal_mulai = $4, tanggal_selesai = $5, aktif = $6
			WHERE id = $7
		`, in.Kode, in.Semester, in.Nama, in.TanggalMulai, in.TanggalSelesai, in.Aktif, in.ID)
	default:
		_, err = tx.Exec(ctx, `
			INSERT INTO madrasah_tahun_ajaran (kode, semester, nama, tanggal_mulai, tanggal_selesai, aktif)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, in.Kode, in.Semester, in.Nama, in.TanggalMulai, in.TanggalSelesai, in.Aktif)
	}
	if err != nil {
		return fmt.Errorf("simpan tahun ajaran: %w", err)
	}
	return tx.Commit(ctx)
}

func (r *pgTahunAjaranRepository) AdaEnrollment(ctx context.Context, id int) (bool, error) {
	var jml int64
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM madrasah_enrollment WHERE tahun_ajaran_id = $1", id).Scan(&jml); err != nil {
		return false, err
	}
	return jml > 0, nil
}

func (r *pgTahunAjaranRepository) Hapus(ctx context.Context, id int) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_tahun_ajaran WHERE id = $1", id); err != nil {
		return fmt.Errorf("hapus tahun ajaran %d: %w", id, err)
	}
	return nil
}
