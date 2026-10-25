package madrasah

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrMapelDuplikat = errors.New("mapel duplikat")

type mapelRecord struct {
	ID       int
	Kode     string
	Nama     string
	Kelompok string
	Aktif    bool
}

type mapelInput struct {
	ID       int
	Kode     string
	Nama     string
	Kelompok string
	Aktif    bool
}

type MapelRepository interface {
	Daftar(ctx context.Context) ([]mapelRecord, error)
	Simpan(ctx context.Context, in mapelInput) (int, error)
	Nonaktifkan(ctx context.Context, id int) error
}

type pgMapelRepository struct {
	db *pgxpool.Pool
}

func NewMapelRepository(db *pgxpool.Pool) MapelRepository {
	return &pgMapelRepository{db: db}
}

func (r *pgMapelRepository) Daftar(ctx context.Context) ([]mapelRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, kode, nama, kelompok, aktif
		FROM madrasah_mapel
		ORDER BY kelompok ASC, nama ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []mapelRecord{}
	for rows.Next() {
		var rec mapelRecord
		if err := rows.Scan(&rec.ID, &rec.Kode, &rec.Nama, &rec.Kelompok, &rec.Aktif); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, rows.Err()
}

func (r *pgMapelRepository) Simpan(ctx context.Context, in mapelInput) (int, error) {
	if in.ID > 0 {
		_, err := r.db.Exec(ctx, `
			UPDATE madrasah_mapel SET kode = $2, nama = $3, kelompok = $4, aktif = $5
			WHERE id = $1
		`, in.ID, in.Kode, in.Nama, in.Kelompok, in.Aktif)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate key") {
				return 0, ErrMapelDuplikat
			}
			return 0, err
		}
		return in.ID, nil
	}

	var newID int
	err := r.db.QueryRow(ctx, `
		INSERT INTO madrasah_mapel (kode, nama, kelompok, aktif)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, in.Kode, in.Nama, in.Kelompok, in.Aktif).Scan(&newID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return 0, ErrMapelDuplikat
		}
		return 0, fmt.Errorf("simpan mapel %q: %w", in.Nama, err)
	}
	return newID, nil
}

func (r *pgMapelRepository) Nonaktifkan(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, "UPDATE madrasah_mapel SET aktif = FALSE WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("nonaktifkan mapel %d: %w", id, err)
	}
	return nil
}
