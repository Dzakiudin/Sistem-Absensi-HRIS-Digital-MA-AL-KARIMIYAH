package madrasah

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PengaturanRepository interface {
	AmbilSemua(ctx context.Context) (map[string]string, error)
	AmbilNilai(ctx context.Context, key string) (string, error)
	Simpan(ctx context.Context, key, value string) error
}

type pgPengaturanRepository struct {
	db *pgxpool.Pool
}

func NewPengaturanRepository(db *pgxpool.Pool) PengaturanRepository {
	return &pgPengaturanRepository{db: db}
}

func (r *pgPengaturanRepository) AmbilSemua(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.Query(ctx, "SELECT key, value FROM madrasah_pengaturan")
	if err != nil {
		return nil, fmt.Errorf("ambil pengaturan: %w", err)
	}
	defer rows.Close()

	data := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			data[k] = v
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterasi pengaturan: %w", err)
	}
	return data, nil
}

func (r *pgPengaturanRepository) AmbilNilai(ctx context.Context, key string) (string, error) {
	var v string
	if err := r.db.QueryRow(ctx,
		"SELECT value FROM madrasah_pengaturan WHERE key = $1", key,
	).Scan(&v); err != nil {
		return "", fmt.Errorf("ambil pengaturan %q: %w", key, err)
	}
	return v, nil
}

func (r *pgPengaturanRepository) Simpan(ctx context.Context, key, value string) error {
	if _, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_pengaturan (key, value)
		VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
	`, key, value); err != nil {
		return fmt.Errorf("simpan pengaturan %q: %w", key, err)
	}
	return nil
}
