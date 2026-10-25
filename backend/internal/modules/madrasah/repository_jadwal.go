package madrasah

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type jadwalRow struct {
	ID            int
	Username      string
	NamaGuru      string
	Hari          string
	MataPelajaran string
	Kelas         string
	JamKe         string
	MapelID       *int
	JamMulai      *time.Time
	JamSelesai    *time.Time
}

type jadwalInput struct {
	Username      string
	NamaGuru      string
	Hari          string
	MataPelajaran string
	Kelas         string
	JamKe         string
	MapelID       int
	JamMulai      string
	JamSelesai    string
}

type jadwalUpdateInput struct {
	ID            int
	Username      string
	NamaGuru      string
	Hari          string
	MataPelajaran string
	Kelas         string
	JamKe         string
	MapelID       int
	JamMulai      string
	JamSelesai    string
}

type jadwalSayaRow struct {
	Hari             string
	JamKe            string
	MataPelajaran    string
	Kelas            string
	Tanggal          string
	Penggantian      bool
	PenggantianUntuk string
}

type JadwalRepository interface {
	Daftar(ctx context.Context) ([]jadwalRow, error)
	Buat(ctx context.Context, in jadwalInput) error
	Perbarui(ctx context.Context, in jadwalUpdateInput) error
	Hapus(ctx context.Context, id int) error

	JadwalGuru(ctx context.Context, username string) ([]jadwalSayaRow, error)
	JadwalGuruPadaHari(ctx context.Context, username string, hariLower []string) ([]jadwalSayaRow, error)
}

type pgJadwalRepository struct {
	db *pgxpool.Pool
}

func NewJadwalRepository(db *pgxpool.Pool) JadwalRepository {
	return &pgJadwalRepository{db: db}
}

func (r *pgJadwalRepository) Daftar(ctx context.Context) ([]jadwalRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, username, nama_guru, hari, mata_pelajaran, kelas, jam_ke,
		       mapel_id, jam_mulai, jam_selesai
		FROM madrasah_jadwal ORDER BY id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("daftar jadwal: %w", err)
	}
	defer rows.Close()

	var out []jadwalRow
	for rows.Next() {
		var j jadwalRow
		if err := rows.Scan(&j.ID, &j.Username, &j.NamaGuru, &j.Hari, &j.MataPelajaran, &j.Kelas,
			&j.JamKe, &j.MapelID, &j.JamMulai, &j.JamSelesai); err != nil {
			return nil, fmt.Errorf("scan jadwal: %w", err)
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func (r *pgJadwalRepository) Buat(ctx context.Context, in jadwalInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_jadwal (
			username, nama_guru, hari, mata_pelajaran, kelas, jam_ke,
			mapel_id, jam_mulai, jam_selesai
		) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, 0), NULLIF($8, '')::TIME, NULLIF($9, '')::TIME)
	`, in.Username, in.NamaGuru, in.Hari, in.MataPelajaran, in.Kelas, in.JamKe,
		in.MapelID, in.JamMulai, in.JamSelesai)
	if err != nil {
		return fmt.Errorf("buat jadwal: %w", err)
	}
	return nil
}

func (r *pgJadwalRepository) Perbarui(ctx context.Context, in jadwalUpdateInput) error {
	_, err := r.db.Exec(ctx, `
		UPDATE madrasah_jadwal SET
			username = $1, nama_guru = $2, hari = $3, mata_pelajaran = $4,
			kelas = $5, jam_ke = $6, mapel_id = NULLIF($7, 0),
			jam_mulai = NULLIF($8, '')::TIME, jam_selesai = NULLIF($9, '')::TIME
		WHERE id = $10
	`, in.Username, in.NamaGuru, in.Hari, in.MataPelajaran, in.Kelas, in.JamKe,
		in.MapelID, in.JamMulai, in.JamSelesai, in.ID)
	if err != nil {
		return fmt.Errorf("perbarui jadwal: %w", err)
	}
	return nil
}

func (r *pgJadwalRepository) Hapus(ctx context.Context, id int) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_jadwal WHERE id = $1", id); err != nil {
		return fmt.Errorf("hapus jadwal %d: %w", id, err)
	}
	return nil
}

func (r *pgJadwalRepository) JadwalGuru(ctx context.Context, username string) ([]jadwalSayaRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT hari, jam_ke, mata_pelajaran, kelas, '', FALSE, ''
		FROM madrasah_jadwal
		WHERE username = $1

		UNION

		SELECT s.hari, s.jam_ke, s.mapel, s.kelas, TO_CHAR(s.tanggal, 'DD/MM/YYYY'),
		       TRUE, COALESCE(asli.nama_lengkap, s.pengajar_utama)
		FROM madrasah_sesi_mengajar s
		LEFT JOIN madrasah_users asli ON LOWER(asli.username) = LOWER(s.pengajar_utama)
		WHERE LOWER(s.pengguna) = LOWER($1) AND s.tanggal >= CURRENT_DATE
		  AND LOWER(s.pengguna) <> LOWER(s.pengajar_utama)
		  AND s.status_sesi = 'Mengajar'

		UNION

		SELECT CASE EXTRACT(ISODOW FROM TO_DATE(a.tanggal, 'DD/MM/YYYY'))
		         WHEN 1 THEN 'Senin' WHEN 2 THEN 'Selasa' WHEN 3 THEN 'Rabu'
		         WHEN 4 THEN 'Kamis' WHEN 5 THEN 'Jumat' WHEN 6 THEN 'Sabtu'
		         WHEN 7 THEN 'Minggu'
		       END,
		       a.jam_ke, a.mata_pelajaran, a.kelas, a.tanggal, TRUE, a.nama_guru
		FROM madrasah_absensi a
		WHERE LOWER(a.substitute_username) = LOWER($1)
		  AND a.status_konfirmasi_pengganti = 'Terkonfirmasi'
		  AND TO_DATE(a.tanggal, 'DD/MM/YYYY') >= CURRENT_DATE

		ORDER BY 1, 2 ASC, 5 ASC
	`, username)
	if err != nil {
		return nil, fmt.Errorf("jadwal guru %q: %w", username, err)
	}
	defer rows.Close()

	out := []jadwalSayaRow{}
	for rows.Next() {
		var rec jadwalSayaRow
		if err := rows.Scan(&rec.Hari, &rec.JamKe, &rec.MataPelajaran, &rec.Kelas,
			&rec.Tanggal, &rec.Penggantian, &rec.PenggantianUntuk); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgJadwalRepository) JadwalGuruPadaHari(ctx context.Context, username string, hariLower []string) ([]jadwalSayaRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT hari, jam_ke, mata_pelajaran, kelas
		FROM madrasah_jadwal
		WHERE username = $1 AND LOWER(hari) = ANY($2::text[])
		ORDER BY id ASC
	`, username, hariLower)
	if err != nil {
		return nil, fmt.Errorf("jadwal guru %q per hari: %w", username, err)
	}
	defer rows.Close()

	out := []jadwalSayaRow{}
	for rows.Next() {
		var rec jadwalSayaRow
		if err := rows.Scan(&rec.Hari, &rec.JamKe, &rec.MataPelajaran, &rec.Kelas); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}
