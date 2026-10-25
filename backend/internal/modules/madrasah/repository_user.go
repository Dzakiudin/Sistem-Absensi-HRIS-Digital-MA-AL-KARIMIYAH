package madrasah

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPenggunaTidakDitemukan = errors.New("pengguna tidak ditemukan")

type penggunaRecord struct {
	ID               int
	Username         string
	Role             string
	NamaLengkap      string
	MataPelajaran    string
	Kelas            string
	JamKe            string
	Status           string
	Password         string
	IzinkanPengganti bool
}

type penggunaListRow struct {
	ID               int
	Username         string
	Role             string
	NamaLengkap      string
	MataPelajaran    string
	NoHp             string
	Status           string
	Kelas            string
	JamKe            string
	HariAktif        string
	StatusSergu      string
	MapelAktif       string
	KelasAktif       string
	IzinkanPengganti bool
}

type guruRingkasRow struct {
	Username      string
	NamaLengkap   string
	MataPelajaran string
	Kelas         string
	JamKe         string
}

type penggunaInput struct {
	Username          string
	PasswordHash      string
	Role              string
	NamaLengkap       string
	MataPelajaran     string
	NoHp              string
	Status            string
	Kelas             string
	JamKe             string
	HariAktif         string
	StatusSergu       string
	MapelAktif        string
	KelasAktif        string
	IzinkanPengganti  bool
	NIP               string
	Gelar             string
	StatusKepegawaian string
}

type penggunaUpdateInput struct {
	ID               int
	UsernameLama     string
	UsernameBaru     string
	PasswordHash     string
	Role             string
	NamaLengkap      string
	MataPelajaran    string
	NoHp             string
	Status           string
	Kelas            string
	JamKe            string
	HariAktif        string
	StatusSergu      string
	MapelAktif       string
	KelasAktif       string
	IzinkanPengganti bool
}

type PenggunaRepository interface {
	CariBerdasarkanUsername(ctx context.Context, username string) (*penggunaRecord, error)
	CariAkses(ctx context.Context, username string) (role, status string, err error)
	PerbaruiPassword(ctx context.Context, username, passwordHash string) error
	DaftarLengkap(ctx context.Context) ([]penggunaListRow, error)
	DaftarUsername(ctx context.Context) ([]string, error)
	DaftarGuruAktif(ctx context.Context) ([]guruRingkasRow, error)
	Buat(ctx context.Context, in penggunaInput) error
	UsernameDipakai(ctx context.Context, username string, kecualiID int) (bool, error)
	UsernameBerdasarkanID(ctx context.Context, id int) (string, error)
	PerbaruiAkun(ctx context.Context, in penggunaUpdateInput) error
	Hapus(ctx context.Context, id int) error
	SiapkanKolomImpor(ctx context.Context) error
	NamaGuru(ctx context.Context, username string) (string, error)
	IDByUsername(ctx context.Context, username string) (int, error)
}

type pgPenggunaRepository struct {
	db *pgxpool.Pool
}

func NewPenggunaRepository(db *pgxpool.Pool) PenggunaRepository {
	return &pgPenggunaRepository{db: db}
}

func (r *pgPenggunaRepository) CariBerdasarkanUsername(ctx context.Context, username string) (*penggunaRecord, error) {
	rec := &penggunaRecord{}
	err := r.db.QueryRow(ctx, `
		SELECT id, username, role, nama_lengkap, mata_pelajaran, kelas, jam_ke, status, password, izinkan_guru_pengganti
		FROM madrasah_users
		WHERE LOWER(username) = LOWER($1)
	`, username).Scan(
		&rec.ID, &rec.Username, &rec.Role, &rec.NamaLengkap, &rec.MataPelajaran,
		&rec.Kelas, &rec.JamKe, &rec.Status, &rec.Password, &rec.IzinkanPengganti,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPenggunaTidakDitemukan
	}
	if err != nil {
		return nil, fmt.Errorf("cari pengguna %q: %w", username, err)
	}
	return rec, nil
}

func (r *pgPenggunaRepository) CariAkses(ctx context.Context, username string) (string, string, error) {
	var role, status string
	err := r.db.QueryRow(ctx,
		"SELECT role, status FROM madrasah_users WHERE LOWER(username) = LOWER($1)", username,
	).Scan(&role, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrPenggunaTidakDitemukan
	}
	if err != nil {
		return "", "", fmt.Errorf("cari akses %q: %w", username, err)
	}
	return role, status, nil
}

func (r *pgPenggunaRepository) PerbaruiPassword(ctx context.Context, username, passwordHash string) error {
	if _, err := r.db.Exec(ctx,
		"UPDATE madrasah_users SET password = $1 WHERE username = $2", passwordHash, username,
	); err != nil {
		return fmt.Errorf("perbarui password %q: %w", username, err)
	}
	return nil
}

func (r *pgPenggunaRepository) DaftarLengkap(ctx context.Context) ([]penggunaListRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, username, role, nama_lengkap, mata_pelajaran, no_hp, status,
		       kelas, jam_ke, hari_aktif, status_sergu, mapel_aktif, kelas_aktif,
		       izinkan_guru_pengganti
		FROM madrasah_users
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("daftar pengguna: %w", err)
	}
	defer rows.Close()

	var out []penggunaListRow
	for rows.Next() {
		var p penggunaListRow
		if err := rows.Scan(&p.ID, &p.Username, &p.Role, &p.NamaLengkap, &p.MataPelajaran, &p.NoHp,
			&p.Status, &p.Kelas, &p.JamKe, &p.HariAktif, &p.StatusSergu, &p.MapelAktif, &p.KelasAktif,
			&p.IzinkanPengganti); err != nil {
			return nil, fmt.Errorf("scan pengguna: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *pgPenggunaRepository) DaftarUsername(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT username FROM madrasah_users`)
	if err != nil {
		return nil, fmt.Errorf("daftar username: %w", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, fmt.Errorf("scan username: %w", err)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *pgPenggunaRepository) DaftarGuruAktif(ctx context.Context) ([]guruRingkasRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, nama_lengkap, mata_pelajaran, kelas, jam_ke
		FROM madrasah_users
		WHERE role = 'guru' AND status = 'Aktif'
		ORDER BY nama_lengkap ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("daftar guru: %w", err)
	}
	defer rows.Close()

	var out []guruRingkasRow
	for rows.Next() {
		var g guruRingkasRow
		if err := rows.Scan(&g.Username, &g.NamaLengkap, &g.MataPelajaran, &g.Kelas, &g.JamKe); err != nil {
			return nil, fmt.Errorf("scan guru: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *pgPenggunaRepository) Buat(ctx context.Context, in penggunaInput) error {
	status := in.Status
	if status == "" {
		status = "Aktif"
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_users (
			username, password, role, nama_lengkap, mata_pelajaran, no_hp,
			status, kelas, jam_ke, hari_aktif, status_sergu, mapel_aktif, kelas_aktif,
			izinkan_guru_pengganti, nip, gelar, status_kepegawaian
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`, in.Username, in.PasswordHash, in.Role, in.NamaLengkap, in.MataPelajaran, in.NoHp,
		status, in.Kelas, in.JamKe, in.HariAktif, in.StatusSergu, in.MapelAktif, in.KelasAktif,
		in.IzinkanPengganti, in.NIP, in.Gelar, in.StatusKepegawaian)
	if err != nil {
		return fmt.Errorf("buat pengguna %q: %w", in.Username, err)
	}
	return nil
}

func (r *pgPenggunaRepository) UsernameDipakai(ctx context.Context, username string, kecualiID int) (bool, error) {
	var jumlah int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM madrasah_users WHERE LOWER(username) = LOWER($1) AND id <> $2", username, kecualiID,
	).Scan(&jumlah)
	if err != nil {
		return false, fmt.Errorf("cek username %q: %w", username, err)
	}
	return jumlah > 0, nil
}

func (r *pgPenggunaRepository) UsernameBerdasarkanID(ctx context.Context, id int) (string, error) {
	var username string
	err := r.db.QueryRow(ctx, "SELECT username FROM madrasah_users WHERE id = $1", id).Scan(&username)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrPenggunaTidakDitemukan
	}
	if err != nil {
		return "", fmt.Errorf("cari username id %d: %w", id, err)
	}
	return username, nil
}

var kolomUsername = []struct {
	tabel string
	kolom string
}{
	{"madrasah_users", "username"},
	{"madrasah_jadwal", "username"},
	{"madrasah_absensi", "username"},
	{"madrasah_absensi", "substitute_username"},
	{"madrasah_absensi_siswa", "guru_username"},
	{"madrasah_absensi_siswa", "editor_username"},
	{"madrasah_honor_tambahan", "username"},
	{"madrasah_honor_terkirim", "username"},
	{"madrasah_pengganti_rentang", "username"},
	{"madrasah_pengganti_rentang", "guru_pengganti_username"},
}

func (r *pgPenggunaRepository) PerbaruiAkun(ctx context.Context, in penggunaUpdateInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("mulai transaksi: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if in.UsernameBaru != "" && in.UsernameBaru != in.UsernameLama {
		for _, k := range kolomUsername {
			if _, err := tx.Exec(ctx,
				"UPDATE "+k.tabel+" SET "+k.kolom+" = $1 WHERE "+k.kolom+" = $2",
				in.UsernameBaru, in.UsernameLama); err != nil {
				return fmt.Errorf("ubah username pada %s: %w", k.tabel, err)
			}
		}
	}

	query := `
		UPDATE madrasah_users
		SET role = $1, nama_lengkap = $2, mata_pelajaran = $3, no_hp = $4,
		    status = $5, kelas = $6, jam_ke = $7, hari_aktif = $8, status_sergu = $9,
		    mapel_aktif = $10, kelas_aktif = $11, izinkan_guru_pengganti = $12
	`
	args := []interface{}{in.Role, in.NamaLengkap, in.MataPelajaran, in.NoHp, in.Status,
		in.Kelas, in.JamKe, in.HariAktif, in.StatusSergu, in.MapelAktif, in.KelasAktif, in.IzinkanPengganti}
	if in.PasswordHash != "" {
		query += ", password = $13 WHERE id = $14"
		args = append(args, in.PasswordHash, in.ID)
	} else {
		query += " WHERE id = $13"
		args = append(args, in.ID)
	}

	if _, err := tx.Exec(ctx, query, args...); err != nil {
		return fmt.Errorf("perbarui akun: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit akun: %w", err)
	}
	return nil
}

func (r *pgPenggunaRepository) Hapus(ctx context.Context, id int) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM madrasah_users WHERE id = $1", id); err != nil {
		return fmt.Errorf("hapus pengguna %d: %w", id, err)
	}
	return nil
}

func (r *pgPenggunaRepository) SiapkanKolomImpor(ctx context.Context) error {
	for _, ddl := range []string{
		`ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS nip VARCHAR(50) DEFAULT ''`,
		`ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS gelar VARCHAR(100) DEFAULT ''`,
		`ALTER TABLE madrasah_users ADD COLUMN IF NOT EXISTS status_kepegawaian VARCHAR(50) DEFAULT ''`,
	} {
		if _, err := r.db.Exec(ctx, ddl); err != nil {
			return fmt.Errorf("siapkan kolom impor: %w", err)
		}
	}
	return nil
}

func (r *pgPenggunaRepository) NamaGuru(ctx context.Context, username string) (string, error) {
	var nama string
	err := r.db.QueryRow(ctx, "SELECT nama_lengkap FROM madrasah_users WHERE username = $1", username).Scan(&nama)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrPenggunaTidakDitemukan
	}
	if err != nil {
		return "", fmt.Errorf("cari nama guru %q: %w", username, err)
	}
	return nama, nil
}

func (r *pgPenggunaRepository) IDByUsername(ctx context.Context, username string) (int, error) {
	var id int
	err := r.db.QueryRow(ctx, "SELECT id FROM madrasah_users WHERE LOWER(username) = LOWER($1)", username).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrPenggunaTidakDitemukan
	}
	if err != nil {
		return 0, fmt.Errorf("cari id pengguna %q: %w", username, err)
	}
	return id, nil
}
