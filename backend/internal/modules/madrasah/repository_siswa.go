package madrasah

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type siswaListRow struct {
	ID            int
	NIS           string
	NISN          string
	NIM           string
	NIK           string
	NamaLengkap   string
	JenisKelamin  string
	TempatLahir   string
	TanggalLahir  string
	Alamat        string
	NamaOrtu      string
	NoHpOrtu      string
	Status        string
	NamaAyah      string
	NamaIbu       string
	PekerjaanAyah string
	PekerjaanIbu  string
	Desa          string
	Kecamatan     string
	Kabupaten     string
	AnakKe        string
	Umur          string
	TahunMasuk    int
	RT            string
	Mark          string
	Yatim         bool
	Kelas         string
	TahunAjaran   string
	TahunAjaranID int
}

type siswaFilter struct {
	KelasID    int
	Cari       string
	Paginate   bool
	PerHalaman int
	Offset     int
}

type siswaInput struct {
	ID            int
	NIS           string
	NISN          string
	NIM           string
	NIK           string
	NamaLengkap   string
	JenisKelamin  string
	TempatLahir   string
	TanggalLahir  string
	Alamat        string
	NamaOrtu      string
	NoHpOrtu      string
	Status        string
	NamaAyah      string
	NamaIbu       string
	PekerjaanAyah string
	PekerjaanIbu  string
	Desa          string
	Kecamatan     string
	Kabupaten     string
	AnakKe        string
	Umur          string
	TahunMasuk    int
	RT            string
	Mark          string
	Yatim         bool
}

type SiswaRepository interface {
	Daftar(ctx context.Context, f siswaFilter) ([]siswaListRow, int64, error)
	Simpan(ctx context.Context, in siswaInput) (int, error)
	Hapus(ctx context.Context, id int) error
	ImporMassal(ctx context.Context, items []siswaInput) (berhasil, gagal []string, err error)
	AturKelas(ctx context.Context, tahunAjaranID, kelasID int, pasang, lepas []int) (int, int, error)
}

type pgSiswaRepository struct {
	db *pgxpool.Pool
}

func NewSiswaRepository(db *pgxpool.Pool) SiswaRepository {
	return &pgSiswaRepository{db: db}
}

const siswaWhereClause = `
	FROM madrasah_siswa s
	LEFT JOIN madrasah_enrollment e
	       ON e.siswa_id = s.id
	      AND e.tahun_ajaran_id = (SELECT id FROM madrasah_tahun_ajaran WHERE aktif = TRUE LIMIT 1)
	LEFT JOIN madrasah_kelas k ON k.id = e.kelas_id
	LEFT JOIN madrasah_tahun_ajaran ta ON ta.id = e.tahun_ajaran_id
	WHERE ($1 = 0 OR e.kelas_id = $1)
	  AND ($2 = '' OR LOWER(s.nama_lengkap) LIKE '%' || LOWER($2) || '%' OR s.nis LIKE '%' || $2 || '%')
`

const siswaSelectClause = `
	SELECT s.id, s.nis, s.nisn, s.nim, s.nik, s.nama_lengkap, s.jenis_kelamin,
	       s.tempat_lahir, s.tanggal_lahir, s.alamat, s.nama_ortu, s.no_hp_ortu, s.status,
	       s.nama_ayah, s.nama_ibu, s.pekerjaan_ayah, s.pekerjaan_ibu,
	       s.desa, s.kecamatan, s.kabupaten, s.anak_ke, s.umur, s.tahun_masuk,
	       s.rt, s.mark, s.yatim,
	       COALESCE(k.kode_kelas, '-'),
	       COALESCE(ta.nama, 'Belum di kelas'),
	       COALESCE(e.tahun_ajaran_id, 0)
`

func (r *pgSiswaRepository) Daftar(ctx context.Context, f siswaFilter) ([]siswaListRow, int64, error) {
	var total int64
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) "+siswaWhereClause, f.KelasID, f.Cari).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("hitung siswa: %w", err)
	}

	query := siswaSelectClause + siswaWhereClause + `
		ORDER BY s.nama_lengkap ASC
	`
	args := []interface{}{f.KelasID, f.Cari}
	if f.Paginate {
		query += " LIMIT $3 OFFSET $4"
		args = append(args, f.PerHalaman, f.Offset)
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("daftar siswa: %w", err)
	}
	defer rows.Close()

	list := []siswaListRow{}
	for rows.Next() {
		var rec siswaListRow
		if err := rows.Scan(&rec.ID, &rec.NIS, &rec.NISN, &rec.NIM, &rec.NIK, &rec.NamaLengkap,
			&rec.JenisKelamin, &rec.TempatLahir, &rec.TanggalLahir, &rec.Alamat, &rec.NamaOrtu,
			&rec.NoHpOrtu, &rec.Status, &rec.NamaAyah, &rec.NamaIbu, &rec.PekerjaanAyah,
			&rec.PekerjaanIbu, &rec.Desa, &rec.Kecamatan, &rec.Kabupaten, &rec.AnakKe, &rec.Umur,
			&rec.TahunMasuk, &rec.RT, &rec.Mark, &rec.Yatim, &rec.Kelas, &rec.TahunAjaran,
			&rec.TahunAjaranID); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, total, rows.Err()
}

func (r *pgSiswaRepository) Simpan(ctx context.Context, in siswaInput) (int, error) {
	if in.ID > 0 {
		_, err := r.db.Exec(ctx, `
			UPDATE madrasah_siswa
			SET nis = $1, nisn = $2, nim = $3, nik = $4, nama_lengkap = $5, jenis_kelamin = $6,
			    tempat_lahir = $7, tanggal_lahir = $8, alamat = $9, nama_ortu = $10, no_hp_ortu = $11,
			    status = $12, nama_ayah = $13, nama_ibu = $14, pekerjaan_ayah = $15, pekerjaan_ibu = $16,
			    desa = $17, kecamatan = $18, kabupaten = $19, anak_ke = $20, umur = $21,
			    tahun_masuk = $22, rt = $23, mark = $24, yatim = $25
			WHERE id = $26
		`, in.NIS, in.NISN, in.NIM, in.NIK, in.NamaLengkap, in.JenisKelamin, in.TempatLahir,
			in.TanggalLahir, in.Alamat, in.NamaOrtu, in.NoHpOrtu, in.Status, in.NamaAyah, in.NamaIbu,
			in.PekerjaanAyah, in.PekerjaanIbu, in.Desa, in.Kecamatan, in.Kabupaten, in.AnakKe,
			in.Umur, in.TahunMasuk, in.RT, in.Mark, in.Yatim, in.ID)
		if err != nil {
			return 0, fmt.Errorf("update siswa: %w", err)
		}
		return in.ID, nil
	}

	var outID int
	err := r.db.QueryRow(ctx, `
		INSERT INTO madrasah_siswa (
			nis, nisn, nim, nik, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir,
			alamat, nama_ortu, no_hp_ortu, status,
			nama_ayah, nama_ibu, pekerjaan_ayah, pekerjaan_ibu,
			desa, kecamatan, kabupaten, anak_ke, umur, tahun_masuk,
			rt, mark, yatim
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16,
			$17, $18, $19, $20, $21, $22,
			$23, $24, $25
		) RETURNING id
	`, in.NIS, in.NISN, in.NIM, in.NIK, in.NamaLengkap, in.JenisKelamin, in.TempatLahir,
		in.TanggalLahir, in.Alamat, in.NamaOrtu, in.NoHpOrtu, in.Status, in.NamaAyah, in.NamaIbu,
		in.PekerjaanAyah, in.PekerjaanIbu, in.Desa, in.Kecamatan, in.Kabupaten, in.AnakKe,
		in.Umur, in.TahunMasuk, in.RT, in.Mark, in.Yatim).Scan(&outID)
	if err != nil {
		return 0, fmt.Errorf("tambah siswa: %w", err)
	}
	return outID, nil
}

func (r *pgSiswaRepository) Hapus(ctx context.Context, id int) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_siswa WHERE id = $1", id); err != nil {
		return fmt.Errorf("hapus siswa %d: %w", id, err)
	}
	return nil
}

func (r *pgSiswaRepository) ImporMassal(ctx context.Context, items []siswaInput) ([]string, []string, error) {
	berhasil := []string{}
	gagal := []string{}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	for _, in := range items {
		_, err := tx.Exec(ctx, `
			INSERT INTO madrasah_siswa (
				nis, nisn, nim, nik, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir,
				alamat, nama_ortu, no_hp_ortu, status,
				nama_ayah, nama_ibu, pekerjaan_ayah, pekerjaan_ibu,
				desa, kecamatan, kabupaten, anak_ke, umur, tahun_masuk,
				rt, mark, yatim
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8,
				$9, $10, $11, $12,
				$13, $14, $15, $16,
				$17, $18, $19, $20, $21, $22,
				$23, $24, $25
			) ON CONFLICT (nis) DO UPDATE SET
				nisn = EXCLUDED.nisn,
				nim = EXCLUDED.nim,
				nik = EXCLUDED.nik,
				nama_lengkap = EXCLUDED.nama_lengkap,
				jenis_kelamin = EXCLUDED.jenis_kelamin,
				tempat_lahir = EXCLUDED.tempat_lahir,
				tanggal_lahir = EXCLUDED.tanggal_lahir,
				alamat = EXCLUDED.alamat,
				nama_ortu = EXCLUDED.nama_ortu,
				no_hp_ortu = EXCLUDED.no_hp_ortu,
				status = EXCLUDED.status,
				nama_ayah = EXCLUDED.nama_ayah,
				nama_ibu = EXCLUDED.nama_ibu,
				pekerjaan_ayah = EXCLUDED.pekerjaan_ayah,
				pekerjaan_ibu = EXCLUDED.pekerjaan_ibu,
				desa = EXCLUDED.desa,
				kecamatan = EXCLUDED.kecamatan,
				kabupaten = EXCLUDED.kabupaten,
				anak_ke = EXCLUDED.anak_ke,
				umur = EXCLUDED.umur,
				tahun_masuk = EXCLUDED.tahun_masuk,
				rt = EXCLUDED.rt,
				mark = EXCLUDED.mark,
				yatim = EXCLUDED.yatim
		`, in.NIS, in.NISN, in.NIM, in.NIK, in.NamaLengkap, in.JenisKelamin, in.TempatLahir,
			in.TanggalLahir, in.Alamat, in.NamaOrtu, in.NoHpOrtu, in.Status, in.NamaAyah, in.NamaIbu,
			in.PekerjaanAyah, in.PekerjaanIbu, in.Desa, in.Kecamatan, in.Kabupaten, in.AnakKe,
			in.Umur, in.TahunMasuk, in.RT, in.Mark, in.Yatim)
		if err != nil {
			gagal = append(gagal, fmt.Sprintf("%s (%s)", in.NamaLengkap, err.Error()))
		} else {
			berhasil = append(berhasil, in.NamaLengkap)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return berhasil, gagal, nil
}

func (r *pgSiswaRepository) AturKelas(ctx context.Context, tahunAjaranID, kelasID int, pasang, lepas []int) (int, int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx)

	terpasang := 0
	for _, sid := range pasang {
		if sid == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO madrasah_enrollment (siswa_id, kelas_id, tahun_ajaran_id)
			VALUES ($1, $2, $3)
			ON CONFLICT (siswa_id, tahun_ajaran_id)
			DO UPDATE SET kelas_id = EXCLUDED.kelas_id, tanggal_keluar = NULL
		`, sid, kelasID, tahunAjaranID); err != nil {
			return 0, 0, fmt.Errorf("pasang siswa %d: %w", sid, err)
		}
		terpasang++
	}

	terlepas := 0
	for _, sid := range lepas {
		if sid == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, "DELETE FROM madrasah_enrollment WHERE siswa_id = $1 AND tahun_ajaran_id = $2", sid, tahunAjaranID); err != nil {
			return 0, 0, fmt.Errorf("lepas siswa %d: %w", sid, err)
		}
		terlepas++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, err
	}
	return terpasang, terlepas, nil
}
