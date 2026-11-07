package madrasah

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type catatanBKRow struct {
	ID             int
	SiswaID        int
	NIS            string
	NamaSiswa      string
	JenisKelamin   string
	Kelas          string
	Yatim          bool
	Mark           string
	Tanggal        time.Time
	Kategori       string
	TindakLanjut   string
	Catatan        string
	Status         string
	GuruBKUsername string
	GuruBKNama     string
	CreatedAt      time.Time
}

type catatanBKFilter struct {
	SiswaID  int
	Kelas    string
	Kategori string
	Status   string
	Cari     string
	Limit    int
}

type catatanBKInput struct {
	ID             int
	SiswaID        int
	Kelas          string
	Tanggal        time.Time
	Kategori       string
	TindakLanjut   string
	Catatan        string
	Status         string
	GuruBKUsername string
	GuruBKNama     string
}

type BKRepository interface {
	EnsureSchema(ctx context.Context) error
	DaftarCatatan(ctx context.Context, f catatanBKFilter) ([]catatanBKRow, error)
	SimpanCatatan(ctx context.Context, in catatanBKInput) (int, error)
	HapusCatatan(ctx context.Context, id int) error
	HitungCatatanPerSiswa(ctx context.Context) (perSiswa map[int]int, total int, aktif int, err error)
}

type pgBKRepository struct {
	db *pgxpool.Pool
}

func NewBKRepository(db *pgxpool.Pool) BKRepository {
	return &pgBKRepository{db: db}
}

func (r *pgBKRepository) EnsureSchema(ctx context.Context) error {
	if r == nil || r.db == nil {
		return nil
	}
	_, err := r.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS madrasah_catatan_bk (
			id SERIAL PRIMARY KEY,
			siswa_id INT NOT NULL REFERENCES madrasah_siswa(id) ON DELETE CASCADE,
			kelas VARCHAR(30) DEFAULT '-',
			tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
			kategori VARCHAR(80) NOT NULL DEFAULT 'Kedisiplinan / Presensi',
			tindak_lanjut TEXT DEFAULT '',
			catatan TEXT NOT NULL DEFAULT '',
			status VARCHAR(40) NOT NULL DEFAULT 'Dipantau',
			guru_bk_username VARCHAR(100) NOT NULL,
			guru_bk_nama VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_catatan_bk_siswa ON madrasah_catatan_bk (siswa_id);
		CREATE INDEX IF NOT EXISTS idx_catatan_bk_tanggal ON madrasah_catatan_bk (tanggal DESC);
		CREATE INDEX IF NOT EXISTS idx_catatan_bk_status ON madrasah_catatan_bk (status);
		UPDATE madrasah_users
		SET izinkan_guru_pengganti = TRUE
		WHERE LOWER(TRIM(mata_pelajaran)) IN ('bk', 'koord bk', 'koordinator bk', 'guru bk', 'bimbingan konseling');
	`)
	return err
}

func (r *pgBKRepository) DaftarCatatan(ctx context.Context, f catatanBKFilter) ([]catatanBKRow, error) {
	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	kelas := strings.TrimSpace(f.Kelas)
	kategori := strings.TrimSpace(f.Kategori)
	status := strings.TrimSpace(f.Status)
	cari := strings.TrimSpace(f.Cari)

	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.siswa_id, COALESCE(s.nis, ''), COALESCE(s.nama_lengkap, ''),
		       COALESCE(s.jenis_kelamin, 'Laki-laki'),
		       COALESCE(NULLIF(k.kode_kelas, ''), NULLIF(c.kelas, ''), '-'),
		       COALESCE(s.yatim, FALSE), COALESCE(s.mark, ''),
		       c.tanggal, COALESCE(c.kategori, ''), COALESCE(c.tindak_lanjut, ''),
		       COALESCE(c.catatan, ''), COALESCE(c.status, 'Dipantau'),
		       COALESCE(c.guru_bk_username, ''), COALESCE(c.guru_bk_nama, ''),
		       COALESCE(c.created_at, CURRENT_TIMESTAMP)
		FROM madrasah_catatan_bk c
		JOIN madrasah_siswa s ON s.id = c.siswa_id
		LEFT JOIN madrasah_enrollment e
		       ON e.siswa_id = s.id
		      AND e.tahun_ajaran_id = (SELECT id FROM madrasah_tahun_ajaran WHERE aktif = TRUE LIMIT 1)
		LEFT JOIN madrasah_kelas k ON k.id = e.kelas_id
		WHERE ($1 = 0 OR c.siswa_id = $1)
		  AND ($2 = '' OR COALESCE(NULLIF(k.kode_kelas, ''), c.kelas) = $2)
		  AND ($3 = '' OR LOWER(c.kategori) = LOWER($3))
		  AND ($4 = '' OR LOWER(c.status) = LOWER($4))
		  AND ($5 = '' OR LOWER(s.nama_lengkap) LIKE '%' || LOWER($5) || '%'
		               OR s.nis LIKE '%' || $5 || '%'
		               OR LOWER(c.catatan) LIKE '%' || LOWER($5) || '%'
		               OR LOWER(c.tindak_lanjut) LIKE '%' || LOWER($5) || '%')
		ORDER BY c.tanggal DESC, c.id DESC
		LIMIT $6
	`, f.SiswaID, kelas, kategori, status, cari, limit)
	if err != nil {
		return nil, fmt.Errorf("daftar catatan bk: %w", err)
	}
	defer rows.Close()

	out := []catatanBKRow{}
	for rows.Next() {
		var rec catatanBKRow
		if err := rows.Scan(
			&rec.ID, &rec.SiswaID, &rec.NIS, &rec.NamaSiswa, &rec.JenisKelamin,
			&rec.Kelas, &rec.Yatim, &rec.Mark, &rec.Tanggal, &rec.Kategori,
			&rec.TindakLanjut, &rec.Catatan, &rec.Status,
			&rec.GuruBKUsername, &rec.GuruBKNama, &rec.CreatedAt,
		); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *pgBKRepository) SimpanCatatan(ctx context.Context, in catatanBKInput) (int, error) {
	if in.ID > 0 {
		_, err := r.db.Exec(ctx, `
			UPDATE madrasah_catatan_bk
			SET siswa_id = $1, kelas = $2, tanggal = $3, kategori = $4,
			    tindak_lanjut = $5, catatan = $6, status = $7,
			    guru_bk_username = $8, guru_bk_nama = $9,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $10
		`, in.SiswaID, in.Kelas, in.Tanggal, in.Kategori, in.TindakLanjut,
			in.Catatan, in.Status, in.GuruBKUsername, in.GuruBKNama, in.ID)
		if err != nil {
			return 0, fmt.Errorf("update catatan bk: %w", err)
		}
		return in.ID, nil
	}

	var id int
	err := r.db.QueryRow(ctx, `
		INSERT INTO madrasah_catatan_bk (
			siswa_id, kelas, tanggal, kategori, tindak_lanjut, catatan,
			status, guru_bk_username, guru_bk_nama
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, in.SiswaID, in.Kelas, in.Tanggal, in.Kategori, in.TindakLanjut,
		in.Catatan, in.Status, in.GuruBKUsername, in.GuruBKNama).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("tambah catatan bk: %w", err)
	}
	return id, nil
}

func (r *pgBKRepository) HapusCatatan(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, "DELETE FROM madrasah_catatan_bk WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("hapus catatan bk %d: %w", id, err)
	}
	return nil
}

func (r *pgBKRepository) HitungCatatanPerSiswa(ctx context.Context) (map[int]int, int, int, error) {
	perSiswa := map[int]int{}
	total := 0
	aktif := 0
	if r == nil || r.db == nil {
		return perSiswa, 0, 0, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT siswa_id,
		       COUNT(*)::int AS jml,
		       COUNT(*) FILTER (WHERE LOWER(status) <> 'selesai')::int AS jml_aktif
		FROM madrasah_catatan_bk
		GROUP BY siswa_id
	`)
	if err != nil {
		return perSiswa, 0, 0, nil
	}
	defer rows.Close()
	for rows.Next() {
		var sid, jml, jmlAktif int
		if err := rows.Scan(&sid, &jml, &jmlAktif); err == nil {
			perSiswa[sid] = jml
			total += jml
			aktif += jmlAktif
		}
	}
	return perSiswa, total, aktif, nil
}
