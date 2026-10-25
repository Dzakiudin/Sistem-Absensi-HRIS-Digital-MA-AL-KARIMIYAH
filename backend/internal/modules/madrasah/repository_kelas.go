package madrasah

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type kelasRecord struct {
	ID          int
	KodeKelas   string
	NamaKelas   string
	Tingkat     string
	WaliKelasID int
	NamaWali    string
	IsActive    bool
	JumlahSiswa int64
}

type kelasInput struct {
	ID          int
	KodeKelas   string
	NamaKelas   string
	Tingkat     string
	WaliKelasID *int
	IsActive    bool
}

type KelasRepository interface {
	Daftar(ctx context.Context) ([]kelasRecord, error)
	Simpan(ctx context.Context, in kelasInput) error
	AdaEnrollment(ctx context.Context, id int) (bool, error)
	Hapus(ctx context.Context, id int) error

	CariIDByLabel(ctx context.Context, label string) (int, error)

	CariByLabel(ctx context.Context, labels []string) (map[string]kelasLabel, error)

	HitungWaliKelas(ctx context.Context, waliID int) (int64, error)

	ApakahWaliKelasID(ctx context.Context, kelasID, waliID int) (bool, error)
}

type kelasLabel struct {
	Kode string
	Nama string
}

type pgKelasRepository struct {
	db *pgxpool.Pool
}

func NewKelasRepository(db *pgxpool.Pool) KelasRepository {
	return &pgKelasRepository{db: db}
}

func (r *pgKelasRepository) Daftar(ctx context.Context) ([]kelasRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT k.id, k.kode_kelas, k.nama_kelas, k.tingkat,
		       COALESCE(k.wali_kelas_id, 0),
		       COALESCE(u.nama_lengkap, ''),
		       k.is_active,
		       COALESCE((SELECT COUNT(*) FROM madrasah_enrollment e
		                 JOIN madrasah_tahun_ajaran ta ON ta.id = e.tahun_ajaran_id AND ta.aktif = TRUE
		                 WHERE e.kelas_id = k.id), 0)
		FROM madrasah_kelas k
		LEFT JOIN madrasah_users u ON u.id = k.wali_kelas_id
		ORDER BY k.id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("daftar kelas: %w", err)
	}
	defer rows.Close()

	list := []kelasRecord{}
	for rows.Next() {
		var rec kelasRecord
		if err := rows.Scan(&rec.ID, &rec.KodeKelas, &rec.NamaKelas, &rec.Tingkat,
			&rec.WaliKelasID, &rec.NamaWali, &rec.IsActive, &rec.JumlahSiswa); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, rows.Err()
}

func (r *pgKelasRepository) Simpan(ctx context.Context, in kelasInput) error {
	if in.ID <= 0 {
		if _, err := r.db.Exec(ctx, `
			INSERT INTO madrasah_kelas (kode_kelas, nama_kelas, tingkat, wali_kelas_id, is_active)
			VALUES ($1, $2, $3, $4, $5)
		`, in.KodeKelas, in.NamaKelas, in.Tingkat, in.WaliKelasID, in.IsActive); err != nil {
			return fmt.Errorf("simpan kelas: %w", err)
		}
		return nil
	}

	var kodeLama, namaLama string
	_ = r.db.QueryRow(ctx, "SELECT kode_kelas, COALESCE(nama_kelas, '') FROM madrasah_kelas WHERE id = $1", in.ID).
		Scan(&kodeLama, &namaLama)

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE madrasah_kelas
		SET kode_kelas = $1, nama_kelas = $2, tingkat = $3, wali_kelas_id = $4, is_active = $5
		WHERE id = $6
	`, in.KodeKelas, in.NamaKelas, in.Tingkat, in.WaliKelasID, in.IsActive, in.ID); err != nil {
		return fmt.Errorf("simpan kelas: %w", err)
	}

	if (kodeLama != "" && kodeLama != in.KodeKelas) || (namaLama != "" && namaLama != in.KodeKelas) {
		if _, err := tx.Exec(ctx, `
			UPDATE madrasah_jadwal SET kelas = $1
			WHERE LOWER(kelas) = LOWER($2) OR LOWER(kelas) = LOWER($3)
		`, in.KodeKelas, kodeLama, namaLama); err != nil {
			return fmt.Errorf("sinkron jadwal kelas: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *pgKelasRepository) AdaEnrollment(ctx context.Context, id int) (bool, error) {
	var jml int64
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM madrasah_enrollment WHERE kelas_id = $1", id).Scan(&jml); err != nil {
		return false, err
	}
	return jml > 0, nil
}

func (r *pgKelasRepository) Hapus(ctx context.Context, id int) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_kelas WHERE id = $1", id); err != nil {
		return fmt.Errorf("hapus kelas %d: %w", id, err)
	}
	return nil
}

func (r *pgKelasRepository) CariIDByLabel(ctx context.Context, label string) (int, error) {
	var id int
	_ = r.db.QueryRow(ctx, "SELECT id FROM madrasah_kelas WHERE kode_kelas = $1", label).Scan(&id)
	if id == 0 {
		_ = r.db.QueryRow(ctx, "SELECT id FROM madrasah_kelas WHERE nama_kelas = $1", label).Scan(&id)
	}
	return id, nil
}

func (r *pgKelasRepository) CariByLabel(ctx context.Context, labels []string) (map[string]kelasLabel, error) {
	hasil := map[string]kelasLabel{}
	if len(labels) == 0 {
		return hasil, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT kode_kelas, nama_kelas
		FROM madrasah_kelas
		WHERE is_active = TRUE
		  AND (LOWER(kode_kelas) = ANY($1::text[]) OR LOWER(COALESCE(nama_kelas, '')) = ANY($1::text[]))
	`, lowercaseSlice(labels))
	if err != nil {
		return hasil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kode, nama string
		if err := rows.Scan(&kode, &nama); err != nil {
			continue
		}
		for _, key := range []string{kode, nama} {
			key = strings.ToLower(strings.TrimSpace(key))
			if key == "" {
				continue
			}
			if _, ok := hasil[key]; !ok {
				hasil[key] = kelasLabel{Kode: kode, Nama: nama}
			}
		}
	}
	return hasil, rows.Err()
}

func (r *pgKelasRepository) HitungWaliKelas(ctx context.Context, waliID int) (int64, error) {
	var jumlah int64
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM madrasah_kelas WHERE wali_kelas_id = $1", waliID).Scan(&jumlah); err != nil {
		return 0, fmt.Errorf("hitung wali kelas: %w", err)
	}
	return jumlah, nil
}

func (r *pgKelasRepository) ApakahWaliKelasID(ctx context.Context, kelasID, waliID int) (bool, error) {
	var jumlah int64
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM madrasah_kelas WHERE id = $1 AND wali_kelas_id = $2", kelasID, waliID).Scan(&jumlah); err != nil {
		return false, fmt.Errorf("cek wali kelas: %w", err)
	}
	return jumlah > 0, nil
}
