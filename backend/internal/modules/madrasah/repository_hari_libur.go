package madrasah

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type hariLiburRecord struct {
	Tanggal    string
	Keterangan string
}

type HariLiburRepository interface {

	KeteranganTanggal(ctx context.Context, tanggal string) (keterangan string, ditemukan bool, err error)
	Daftar(ctx context.Context) ([]hariLiburRecord, error)
	TanggalDalamBulan(ctx context.Context, bulan, tahun string) ([]string, error)
	Simpan(ctx context.Context, tanggal, keterangan string) error
	Hapus(ctx context.Context, tanggal string) error
}

type pgHariLiburRepository struct {
	db *pgxpool.Pool
}

func NewHariLiburRepository(db *pgxpool.Pool) HariLiburRepository {
	return &pgHariLiburRepository{db: db}
}

func (r *pgHariLiburRepository) KeteranganTanggal(ctx context.Context, tanggal string) (string, bool, error) {
	var ket string
	err := r.db.QueryRow(ctx,
		"SELECT keterangan FROM madrasah_hari_libur WHERE tanggal = $1", tanggal,
	).Scan(&ket)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("ambil hari libur %q: %w", tanggal, err)
	}
	return ket, true, nil
}

func (r *pgHariLiburRepository) Daftar(ctx context.Context) ([]hariLiburRecord, error) {
	rows, err := r.db.Query(ctx, "SELECT tanggal, keterangan FROM madrasah_hari_libur ORDER BY id DESC")
	if err != nil {
		return nil, fmt.Errorf("ambil daftar hari libur: %w", err)
	}
	defer rows.Close()

	data := []hariLiburRecord{}
	for rows.Next() {
		var rec hariLiburRecord
		if err := rows.Scan(&rec.Tanggal, &rec.Keterangan); err == nil {
			data = append(data, rec)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi hari libur: %w", err)
	}
	return data, nil
}

func (r *pgHariLiburRepository) TanggalDalamBulan(ctx context.Context, bulan, tahun string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT tanggal FROM madrasah_hari_libur WHERE right(tanggal, 7) = $1::text || '/' || $2::text`,
		bulan, tahun)
	if err != nil {
		return nil, fmt.Errorf("ambil hari libur bulan %s/%s: %w", bulan, tahun, err)
	}
	defer rows.Close()

	data := []string{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err == nil {
			data = append(data, t)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi hari libur bulan: %w", err)
	}
	return data, nil
}

func (r *pgHariLiburRepository) Simpan(ctx context.Context, tanggal, keterangan string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("mulai transaksi hari libur: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "DELETE FROM madrasah_hari_libur WHERE tanggal = $1", tanggal); err != nil {
		return fmt.Errorf("hapus hari libur lama %q: %w", tanggal, err)
	}
	if _, err := tx.Exec(ctx,
		"INSERT INTO madrasah_hari_libur (tanggal, keterangan) VALUES ($1, $2)", tanggal, keterangan,
	); err != nil {
		return fmt.Errorf("simpan hari libur %q: %w", tanggal, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit hari libur %q: %w", tanggal, err)
	}
	return nil
}

func (r *pgHariLiburRepository) Hapus(ctx context.Context, tanggal string) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_hari_libur WHERE tanggal = $1", tanggal); err != nil {
		return fmt.Errorf("hapus hari libur %q: %w", tanggal, err)
	}
	return nil
}
