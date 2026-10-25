package madrasah

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type guruPenggantiRow struct {
	Username string
	Nama     string
}

type slotMenungguPenggantiRow struct {
	ID         int
	Tanggal    string
	Kategori   string
	NamaAsli   string
	Mapel      string
	Kelas      string
	JamKe      string
	Keterangan string
}

type rentangMenungguPenggantiRow struct {
	ID             int
	NamaAsli       string
	Kategori       string
	Keterangan     string
	TanggalMulai   string
	TanggalSelesai string
}

type konfirmasiSlotPenggantiInput struct {
	ID          int
	Username    string
	NamaLengkap string
	Latitude    float64
	Longitude   float64
	Jarak       int
	FotoURL     string
	LinkMaps    string
}

type penggantiRentangRow struct {
	ID             int
	Username       string
	NamaLengkap    string
	Kategori       string
	Keterangan     string
	TanggalMulai   string
	TanggalSelesai string
	Status         string
}

type rentangSesiRow struct {
	Username string
	Mulai    string
	Selesai  string
}

type penggantiRentangInput struct {
	Username          string
	NamaLengkap       string
	GuruPengganti     string
	GuruPenggantiNama string
	Kategori          string
	Keterangan        string
	TanggalMulai      string
	TanggalSelesai    string
}

type rentangSayaRow struct {
	ID                    int
	GuruPenggantiUsername string
	GuruPenggantiNama     string
	Kategori              string
	Keterangan            string
	TanggalMulai          string
	TanggalSelesai        string
	Status                string
}

type konfirmasiRentangInput struct {
	ID        int
	Username  string
	Latitude  float64
	Longitude float64
	Jarak     int
	FotoURL   string
	LinkMaps  string
}

type PenggantiRepository interface {
	DaftarGuruKecuali(ctx context.Context, username string) ([]guruPenggantiRow, error)
	SlotMenungguUntuk(ctx context.Context, namaLengkap, username string) ([]slotMenungguPenggantiRow, error)
	RentangMenungguUntuk(ctx context.Context, username, namaLengkap string) ([]rentangMenungguPenggantiRow, error)
	StatusSlotMenunggu(ctx context.Context, id int, namaLengkap, username string) (string, error)
	KonfirmasiSlot(ctx context.Context, in konfirmasiSlotPenggantiInput) error

	GuruAktifAda(ctx context.Context, username string) (bool, error)
	RentangBentrokAda(ctx context.Context, username, tanggalSelesai, tanggalMulai string) (bool, error)
	InfoPengajuan(ctx context.Context, username string) (namaLengkap string, izinkan bool, err error)
	SimpanPengajuanRentang(ctx context.Context, in penggantiRentangInput) error

	RentangSaya(ctx context.Context, username string) ([]rentangSayaRow, error)
	AmbilPemilikRentang(ctx context.Context, id int) (pemilik, status string, err error)
	BatalkanRentang(ctx context.Context, id int) error
	StatusRentangMenunggu(ctx context.Context, id int, username string) (string, error)
	KonfirmasiRentang(ctx context.Context, in konfirmasiRentangInput) error

	RentangAktifTerkonfirmasi(ctx context.Context, penggantiUsername string) ([]penggantiRentangRow, error)
	RentangTerkonfirmasiMenyentuh(ctx context.Context, penggantiUsername, tsAkhir, tsAwal string) ([]rentangSesiRow, error)
}

type pgPenggantiRepository struct {
	db *pgxpool.Pool
}

func NewPenggantiRepository(db *pgxpool.Pool) PenggantiRepository {
	return &pgPenggantiRepository{db: db}
}

func (r *pgPenggantiRepository) DaftarGuruKecuali(ctx context.Context, username string) ([]guruPenggantiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, nama_lengkap
		FROM madrasah_users
		WHERE role IN ('guru','staf')
		  AND status = 'Aktif'
		  AND izinkan_guru_pengganti = TRUE
		  AND username != $1
		ORDER BY nama_lengkap ASC
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []guruPenggantiRow{}
	for rows.Next() {
		var rec guruPenggantiRow
		if err := rows.Scan(&rec.Username, &rec.Nama); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgPenggantiRepository) SlotMenungguUntuk(ctx context.Context, namaLengkap, username string) ([]slotMenungguPenggantiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, tanggal, status_waktu, nama_guru, mata_pelajaran, kelas, jam_ke, keterangan
		FROM madrasah_absensi
		WHERE (guru_pengganti = $1 OR guru_pengganti = $2) AND status_konfirmasi_pengganti = 'Menunggu'
		ORDER BY id DESC
	`, namaLengkap, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []slotMenungguPenggantiRow{}
	for rows.Next() {
		var rec slotMenungguPenggantiRow
		if err := rows.Scan(&rec.ID, &rec.Tanggal, &rec.Kategori, &rec.NamaAsli, &rec.Mapel, &rec.Kelas, &rec.JamKe, &rec.Keterangan); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgPenggantiRepository) RentangMenungguUntuk(ctx context.Context, username, namaLengkap string) ([]rentangMenungguPenggantiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, nama_lengkap, kategori, keterangan, tanggal_mulai, tanggal_selesai
		FROM madrasah_pengganti_rentang
		WHERE (guru_pengganti_username = $1 OR guru_pengganti_username = $2) AND status_konfirmasi = 'Menunggu'
		ORDER BY id DESC
	`, username, namaLengkap)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []rentangMenungguPenggantiRow{}
	for rows.Next() {
		var rec rentangMenungguPenggantiRow
		if err := rows.Scan(&rec.ID, &rec.NamaAsli, &rec.Kategori, &rec.Keterangan, &rec.TanggalMulai, &rec.TanggalSelesai); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgPenggantiRepository) StatusSlotMenunggu(ctx context.Context, id int, namaLengkap, username string) (string, error) {
	var status string
	_ = r.db.QueryRow(ctx, `
		SELECT status_konfirmasi_pengganti
		FROM madrasah_absensi
		WHERE id = $1 AND (guru_pengganti = $2 OR guru_pengganti = $3) AND status_konfirmasi_pengganti = 'Menunggu'
	`, id, namaLengkap, username).Scan(&status)
	return status, nil
}

func (r *pgPenggantiRepository) KonfirmasiSlot(ctx context.Context, in konfirmasiSlotPenggantiInput) error {
	_, err := r.db.Exec(ctx, `
		UPDATE madrasah_absensi
		SET status_konfirmasi_pengganti = 'Terkonfirmasi',
		    substitute_username = $1,
		    latitude = $2,
		    longitude = $3,
		    jarak_dari_sekolah = $4,
		    foto_url = $5,
		    link_maps = $6
		WHERE id = $7 AND (guru_pengganti = $8 OR guru_pengganti = $9) AND status_konfirmasi_pengganti = 'Menunggu'
	`, in.Username, in.Latitude, in.Longitude, in.Jarak, in.FotoURL, in.LinkMaps, in.ID, in.NamaLengkap, in.Username)
	return err
}

func (r *pgPenggantiRepository) GuruAktifAda(ctx context.Context, username string) (bool, error) {
	var n int
	_ = r.db.QueryRow(ctx, "SELECT COUNT(*) FROM madrasah_users WHERE username = $1 AND role IN ('guru','staf') AND status = 'Aktif'", username).Scan(&n)
	return n > 0, nil
}

func (r *pgPenggantiRepository) RentangBentrokAda(ctx context.Context, username, tanggalSelesai, tanggalMulai string) (bool, error) {
	var n int
	_ = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM madrasah_pengganti_rentang
		WHERE username = $1 AND status_konfirmasi IN ('Menunggu', 'Terkonfirmasi')
		  AND TO_DATE(tanggal_mulai, 'DD/MM/YYYY') <= TO_DATE($2, 'DD/MM/YYYY')
		  AND TO_DATE(tanggal_selesai, 'DD/MM/YYYY') >= TO_DATE($3, 'DD/MM/YYYY')
	`, username, tanggalSelesai, tanggalMulai).Scan(&n)
	return n > 0, nil
}

func (r *pgPenggantiRepository) InfoPengajuan(ctx context.Context, username string) (string, bool, error) {
	var namaLengkap string
	var izinkan bool
	_ = r.db.QueryRow(ctx, "SELECT nama_lengkap, izinkan_guru_pengganti FROM madrasah_users WHERE username = $1", username).Scan(&namaLengkap, &izinkan)
	return namaLengkap, izinkan, nil
}

func (r *pgPenggantiRepository) SimpanPengajuanRentang(ctx context.Context, in penggantiRentangInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_pengganti_rentang
		    (username, nama_lengkap, guru_pengganti_username, guru_pengganti_nama, kategori, keterangan, tanggal_mulai, tanggal_selesai, status_konfirmasi)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Menunggu')
	`, in.Username, in.NamaLengkap, in.GuruPengganti, in.GuruPenggantiNama, in.Kategori, in.Keterangan, in.TanggalMulai, in.TanggalSelesai)
	return err
}

func (r *pgPenggantiRepository) RentangSaya(ctx context.Context, username string) ([]rentangSayaRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, guru_pengganti_username, guru_pengganti_nama, kategori, keterangan, tanggal_mulai, tanggal_selesai, status_konfirmasi
		FROM madrasah_pengganti_rentang
		WHERE username = $1
		ORDER BY id DESC
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []rentangSayaRow{}
	for rows.Next() {
		var rec rentangSayaRow
		if err := rows.Scan(&rec.ID, &rec.GuruPenggantiUsername, &rec.GuruPenggantiNama, &rec.Kategori, &rec.Keterangan, &rec.TanggalMulai, &rec.TanggalSelesai, &rec.Status); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}

func (r *pgPenggantiRepository) AmbilPemilikRentang(ctx context.Context, id int) (string, string, error) {
	var pemilik, status string
	_ = r.db.QueryRow(ctx, "SELECT username, status_konfirmasi FROM madrasah_pengganti_rentang WHERE id = $1", id).Scan(&pemilik, &status)
	return pemilik, status, nil
}

func (r *pgPenggantiRepository) BatalkanRentang(ctx context.Context, id int) error {
	_, err := r.db.Exec(ctx, "UPDATE madrasah_pengganti_rentang SET status_konfirmasi = 'Ditolak' WHERE id = $1", id)
	return err
}

func (r *pgPenggantiRepository) StatusRentangMenunggu(ctx context.Context, id int, username string) (string, error) {
	var status string
	_ = r.db.QueryRow(ctx, `
		SELECT status_konfirmasi
		FROM madrasah_pengganti_rentang
		WHERE id = $1 AND guru_pengganti_username = $2 AND status_konfirmasi = 'Menunggu'
	`, id, username).Scan(&status)
	return status, nil
}

func (r *pgPenggantiRepository) KonfirmasiRentang(ctx context.Context, in konfirmasiRentangInput) error {
	_, err := r.db.Exec(ctx, `
		UPDATE madrasah_pengganti_rentang
		SET status_konfirmasi = 'Terkonfirmasi',
		    latitude = $1, longitude = $2, jarak_dari_sekolah = $3,
		    foto_url = $4, link_maps = $5
		WHERE id = $6 AND guru_pengganti_username = $7 AND status_konfirmasi = 'Menunggu'
	`, in.Latitude, in.Longitude, in.Jarak, in.FotoURL, in.LinkMaps, in.ID, in.Username)
	return err
}

func (r *pgPenggantiRepository) RentangAktifTerkonfirmasi(ctx context.Context, penggantiUsername string) ([]penggantiRentangRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, username, nama_lengkap, kategori, keterangan, tanggal_mulai, tanggal_selesai, status_konfirmasi
		FROM madrasah_pengganti_rentang
		WHERE guru_pengganti_username = $1 AND status_konfirmasi = 'Terkonfirmasi'
		ORDER BY tanggal_mulai ASC
	`, penggantiUsername)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []penggantiRentangRow{}
	for rows.Next() {
		var rec penggantiRentangRow
		if err := rows.Scan(&rec.ID, &rec.Username, &rec.NamaLengkap, &rec.Kategori, &rec.Keterangan, &rec.TanggalMulai, &rec.TanggalSelesai, &rec.Status); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, nil
}

func (r *pgPenggantiRepository) RentangTerkonfirmasiMenyentuh(ctx context.Context, penggantiUsername, tsAkhir, tsAwal string) ([]rentangSesiRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT username, tanggal_mulai, tanggal_selesai
		FROM madrasah_pengganti_rentang
		WHERE guru_pengganti_username = $1 AND status_konfirmasi = 'Terkonfirmasi'
		  AND TO_DATE(tanggal_mulai, 'DD/MM/YYYY') <= TO_DATE($2, 'DD/MM/YYYY')
		  AND TO_DATE(tanggal_selesai, 'DD/MM/YYYY') >= TO_DATE($3, 'DD/MM/YYYY')
	`, penggantiUsername, tsAkhir, tsAwal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []rentangSesiRow{}
	for rows.Next() {
		var rec rentangSesiRow
		if err := rows.Scan(&rec.Username, &rec.Mulai, &rec.Selesai); err == nil {
			out = append(out, rec)
		}
	}
	return out, nil
}
