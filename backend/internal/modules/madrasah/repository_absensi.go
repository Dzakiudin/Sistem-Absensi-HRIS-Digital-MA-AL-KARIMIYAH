package madrasah

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type absenHariIniRow struct {
	ID          int
	Jam         string
	Mapel       string
	StatusWaktu string
	Keterangan  string
	Kelas       string
	JamKe       string
}

type riwayatAbsenSayaRow struct {
	ID                        int
	Tanggal                   string
	Jam                       string
	Jenis                     string
	StatusWaktu               string
	StatusLokasi              string
	Latitude                  float64
	Longitude                 float64
	FotoUrl                   string
	Kelas                     string
	JamKe                     string
	GuruPengganti             string
	StatusKonfirmasiPengganti string
	SubstituteUsername        string
	NamaGuru                  string
}

type absenInput struct {
	Timestamp    time.Time
	Tanggal      string
	Jam          string
	Username     string
	Nama         string
	Mapel        string
	Jenis        string
	Latitude     float64
	Longitude    float64
	Jarak        int
	StatusLokasi string
	FotoURL      string
	StatusWaktu  string
	Keterangan   string
	Kelas        string
	JamKe        string
	LinkMaps     string
}

type absenIzinInput struct {
	Timestamp       time.Time
	Tanggal         string
	Jam             string
	Username        string
	Nama            string
	Mapel           string
	Kategori        string
	Keterangan      string
	Kelas           string
	JamKe           string
	GuruPengganti   string
	StatusPengganti string
}

type absenManualInput struct {
	Timestamp       time.Time
	Tanggal         string
	Username        string
	Nama            string
	Mapel           string
	Kategori        string
	Keterangan      string
	Kelas           string
	JamKe           string
	GuruPengganti   string
	StatusPengganti string
}

type AbsensiRepository interface {
	HariAktif(ctx context.Context, username string) (string, error)
	AbsensiHariIni(ctx context.Context, username, tanggal string) ([]absenHariIniRow, error)

	SlotExists(ctx context.Context, username, tanggal, kelas, jamKe string) (bool, error)
	SlotJamKeExists(ctx context.Context, username, tanggal, jamKe string) (bool, error)

	NamaGuru(ctx context.Context, username string) (string, error)
	NamaDanIzinkanPengganti(ctx context.Context, username string) (string, bool, error)

	Simpan(ctx context.Context, in absenInput) error
	SimpanIzin(ctx context.Context, in absenIzinInput) (bool, error)
	SimpanManual(ctx context.Context, in absenManualInput) error

	RiwayatSaya(ctx context.Context, username string) ([]riwayatAbsenSayaRow, error)
}

type pgAbsensiRepository struct {
	db *pgxpool.Pool
}

func NewAbsensiRepository(db *pgxpool.Pool) AbsensiRepository {
	return &pgAbsensiRepository{db: db}
}

func (r *pgAbsensiRepository) HariAktif(ctx context.Context, username string) (string, error) {
	var hariAktif string
	_ = r.db.QueryRow(ctx, "SELECT hari_aktif FROM madrasah_users WHERE username = $1", username).Scan(&hariAktif)
	return hariAktif, nil
}

func (r *pgAbsensiRepository) AbsensiHariIni(ctx context.Context, username, tanggal string) ([]absenHariIniRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, jam, mata_pelajaran, status_waktu, keterangan, kelas, jam_ke
		FROM madrasah_absensi
		WHERE username = $1 AND tanggal = $2
		ORDER BY id ASC
	`, username, tanggal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []absenHariIniRow{}
	for rows.Next() {
		var rec absenHariIniRow
		if err := rows.Scan(&rec.ID, &rec.Jam, &rec.Mapel, &rec.StatusWaktu, &rec.Keterangan, &rec.Kelas, &rec.JamKe); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgAbsensiRepository) SlotExists(ctx context.Context, username, tanggal, kelas, jamKe string) (bool, error) {
	var n int
	_ = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_absensi
		WHERE username = $1 AND tanggal = $2 AND kelas = $3 AND jam_ke = $4
	`, username, tanggal, kelas, jamKe).Scan(&n)
	return n > 0, nil
}

func (r *pgAbsensiRepository) SlotJamKeExists(ctx context.Context, username, tanggal, jamKe string) (bool, error) {
	var n int
	_ = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_absensi
		WHERE username = $1 AND tanggal = $2 AND jam_ke = $3
	`, username, tanggal, jamKe).Scan(&n)
	return n > 0, nil
}

func (r *pgAbsensiRepository) NamaGuru(ctx context.Context, username string) (string, error) {
	var nama string
	_ = r.db.QueryRow(ctx, "SELECT nama_lengkap FROM madrasah_users WHERE username = $1", username).Scan(&nama)
	return nama, nil
}

func (r *pgAbsensiRepository) NamaDanIzinkanPengganti(ctx context.Context, username string) (string, bool, error) {
	var nama string
	var izinkan bool
	_ = r.db.QueryRow(ctx, "SELECT nama_lengkap, izinkan_guru_pengganti FROM madrasah_users WHERE username = $1", username).Scan(&nama, &izinkan)
	return nama, izinkan, nil
}

func (r *pgAbsensiRepository) Simpan(ctx context.Context, in absenInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_absensi (
			timestamp, tanggal, jam, username, nama_guru, mata_pelajaran,
			jenis_absen, latitude, longitude, jarak_dari_sekolah, status_lokasi,
			foto_url, status_waktu, keterangan, kelas, jam_ke, link_maps
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`, in.Timestamp, in.Tanggal, in.Jam, in.Username, in.Nama, in.Mapel, in.Jenis, in.Latitude,
		in.Longitude, in.Jarak, in.StatusLokasi, in.FotoURL, in.StatusWaktu, in.Keterangan,
		in.Kelas, in.JamKe, in.LinkMaps)
	return err
}

func (r *pgAbsensiRepository) SimpanIzin(ctx context.Context, in absenIzinInput) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_absensi (
			timestamp, tanggal, jam, username, nama_guru, mata_pelajaran,
			jenis_absen, latitude, longitude, jarak_dari_sekolah, status_lokasi,
			foto_url, status_waktu, keterangan, kelas, jam_ke, link_maps,
			guru_pengganti, status_konfirmasi_pengganti
		) VALUES ($1, $2, $3, $4, $5, $6, 'Masuk', 0, 0, 0, 'Dalam Radius', '', $7, $8, $9, $10, '', $11, $12)
		ON CONFLICT (username, tanggal, kelas, jam_ke) DO NOTHING
	`, in.Timestamp, in.Tanggal, in.Jam, in.Username, in.Nama, in.Mapel, in.Kategori, in.Keterangan,
		in.Kelas, in.JamKe, in.GuruPengganti, in.StatusPengganti)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *pgAbsensiRepository) SimpanManual(ctx context.Context, in absenManualInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_absensi (
			timestamp, tanggal, jam, username, nama_guru, mata_pelajaran,
			jenis_absen, latitude, longitude, jarak_dari_sekolah, status_lokasi,
			foto_url, status_waktu, keterangan, kelas, jam_ke, link_maps,
			guru_pengganti, status_konfirmasi_pengganti
		) VALUES ($1, $2, '07:00:00', $3, $4, $5, 'Masuk', 0, 0, 0, 'Dalam Radius', '', $6, $7, $8, $9, '', $10, $11)
	`, in.Timestamp, in.Tanggal, in.Username, in.Nama, in.Mapel, in.Kategori, in.Keterangan,
		in.Kelas, in.JamKe, in.GuruPengganti, in.StatusPengganti)
	return err
}

func (r *pgAbsensiRepository) RiwayatSaya(ctx context.Context, username string) ([]riwayatAbsenSayaRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, tanggal, jam, jenis_absen, status_waktu, status_lokasi, latitude, longitude,
		       foto_url, kelas, jam_ke, guru_pengganti, status_konfirmasi_pengganti,
		       substitute_username, nama_guru
		FROM madrasah_absensi
		WHERE username = $1 OR (substitute_username = $1 AND status_konfirmasi_pengganti = 'Terkonfirmasi')
		ORDER BY id DESC
		LIMIT 100
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []riwayatAbsenSayaRow{}
	for rows.Next() {
		var rec riwayatAbsenSayaRow
		if err := rows.Scan(&rec.ID, &rec.Tanggal, &rec.Jam, &rec.Jenis, &rec.StatusWaktu, &rec.StatusLokasi,
			&rec.Latitude, &rec.Longitude, &rec.FotoUrl, &rec.Kelas, &rec.JamKe, &rec.GuruPengganti,
			&rec.StatusKonfirmasiPengganti, &rec.SubstituteUsername, &rec.NamaGuru); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}
