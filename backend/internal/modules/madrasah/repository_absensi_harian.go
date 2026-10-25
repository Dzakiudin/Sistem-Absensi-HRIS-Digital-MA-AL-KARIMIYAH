package madrasah

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type absensiHarianRecord struct {
	Tanggal        time.Time
	JamMasuk       *time.Time
	JamPulang      *time.Time
	StatusWaktu    string
	Keterangan     string
	Terlambat      bool
	MenitTerlambat int
	JarakMasuk     int
	JarakPulang    int
	FotoMasuk      string
	FotoPulang     string
}

type absensiHarianInput struct {
	Tanggal        string
	Username       string
	Nama           string
	Jenis          string
	Jam            string
	Terlambat      bool
	MenitTerlambat int
	Lat            float64
	Lng            float64
	Jarak          int
	FotoURL        string
	MapsURL        string
}

type absensiHarianManualInput struct {
	Tanggal     string
	Username    string
	Nama        string
	JamMasuk    *string
	JamPulang   *string
	StatusWaktu string
	Keterangan  string
	DicatatOleh string
}

func tanggalISO(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if t, err := time.Parse("2006-01-02", v); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("02/01/2006", v); err == nil {
		return t.Format("2006-01-02")
	}

	return v
}

type AbsensiHarianRepository interface {

	AmbilSatu(ctx context.Context, username, tanggal string) (*absensiHarianRecord, error)
	AmbilRiwayatBulanan(ctx context.Context, username string, bulan, tahun int) ([]absensiHarianRecord, error)
	Simpan(ctx context.Context, in absensiHarianInput) error
	SimpanManual(ctx context.Context, in absensiHarianManualInput) error
	SimpanPenandaIzin(ctx context.Context, q sqlExecutor, tanggal, username, nama, status, keterangan string, izinID int) error
}

type pgAbsensiHarianRepository struct {
	db *pgxpool.Pool
}

func NewAbsensiHarianRepository(db *pgxpool.Pool) AbsensiHarianRepository {
	return &pgAbsensiHarianRepository{db: db}
}

func (r *pgAbsensiHarianRepository) AmbilSatu(ctx context.Context, username, tanggal string) (*absensiHarianRecord, error) {
	rec := &absensiHarianRecord{}
	err := r.db.QueryRow(ctx, `
		SELECT jam_masuk, jam_pulang, status_waktu, keterangan,
		       status_terlambat, menit_terlambat
		FROM madrasah_absensi_harian
		WHERE LOWER(username) = LOWER($1) AND tanggal = $2::DATE
	`, username, tanggalISO(tanggal)).Scan(
		&rec.JamMasuk, &rec.JamPulang, &rec.StatusWaktu, &rec.Keterangan,
		&rec.Terlambat, &rec.MenitTerlambat,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ambil absensi harian %q %s: %w", username, tanggal, err)
	}
	return rec, nil
}

func (r *pgAbsensiHarianRepository) AmbilRiwayatBulanan(ctx context.Context, username string, bulan, tahun int) ([]absensiHarianRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT tanggal, jam_masuk, jam_pulang, status_waktu, keterangan,
		       status_terlambat, menit_terlambat,
		       COALESCE(jarak_masuk, 0), COALESCE(jarak_pulang, 0),
		       COALESCE(foto_masuk, ''), COALESCE(foto_pulang, '')
		FROM madrasah_absensi_harian
		WHERE LOWER(username) = LOWER($1)
		  AND EXTRACT(MONTH FROM tanggal) = $2
		  AND EXTRACT(YEAR FROM tanggal) = $3
		ORDER BY tanggal DESC
	`, username, bulan, tahun)
	if err != nil {
		return nil, fmt.Errorf("ambil riwayat absensi %q: %w", username, err)
	}
	defer rows.Close()

	list := []absensiHarianRecord{}
	for rows.Next() {
		var rec absensiHarianRecord
		if err := rows.Scan(&rec.Tanggal, &rec.JamMasuk, &rec.JamPulang, &rec.StatusWaktu,
			&rec.Keterangan, &rec.Terlambat, &rec.MenitTerlambat, &rec.JarakMasuk,
			&rec.JarakPulang, &rec.FotoMasuk, &rec.FotoPulang); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, rows.Err()
}

func (r *pgAbsensiHarianRepository) Simpan(ctx context.Context, in absensiHarianInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (
			tanggal, username, nama,
			jam_masuk, jam_pulang, status_terlambat, menit_terlambat,
			lat_masuk, lng_masuk, jarak_masuk, foto_masuk, maps_masuk,
			lat_pulang, lng_pulang, jarak_pulang, foto_pulang, maps_pulang,
			status_waktu, keterangan
		) VALUES (
			$1, $2, $3,
			CASE WHEN $4 = 'Masuk' THEN $5::TIME ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $5::TIME ELSE NULL END,
			$6, $7,
			CASE WHEN $4 = 'Masuk' THEN $8::numeric ELSE NULL END,
			CASE WHEN $4 = 'Masuk' THEN $9::numeric ELSE NULL END,
			CASE WHEN $4 = 'Masuk' THEN $10::integer ELSE NULL END,
			CASE WHEN $4 = 'Masuk' THEN $11 ELSE NULL END,
			CASE WHEN $4 = 'Masuk' THEN $12 ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $8::numeric ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $9::numeric ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $10::integer ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $11 ELSE NULL END,
			CASE WHEN $4 = 'Pulang' THEN $12 ELSE NULL END,
			'Hadir', ''
		)
		ON CONFLICT (username, tanggal) DO UPDATE SET
			jam_masuk      = COALESCE(madrasah_absensi_harian.jam_masuk, EXCLUDED.jam_masuk),
			lat_masuk      = COALESCE(madrasah_absensi_harian.lat_masuk, EXCLUDED.lat_masuk),
			lng_masuk      = COALESCE(madrasah_absensi_harian.lng_masuk, EXCLUDED.lng_masuk),
			jarak_masuk    = COALESCE(NULLIF(madrasah_absensi_harian.jarak_masuk, 0), EXCLUDED.jarak_masuk),
			foto_masuk     = COALESCE(NULLIF(madrasah_absensi_harian.foto_masuk, ''), EXCLUDED.foto_masuk),
			maps_masuk     = COALESCE(NULLIF(madrasah_absensi_harian.maps_masuk, ''), EXCLUDED.maps_masuk),
			jam_pulang     = EXCLUDED.jam_pulang,
			lat_pulang     = EXCLUDED.lat_pulang,
			lng_pulang     = EXCLUDED.lng_pulang,
			jarak_pulang   = EXCLUDED.jarak_pulang,
			foto_pulang    = EXCLUDED.foto_pulang,
			maps_pulang    = EXCLUDED.maps_pulang,
			status_terlambat = madrasah_absensi_harian.status_terlambat OR EXCLUDED.status_terlambat,
			menit_terlambat  = GREATEST(madrasah_absensi_harian.menit_terlambat, EXCLUDED.menit_terlambat),
			updated_at     = CURRENT_TIMESTAMP
	`, tanggalISO(in.Tanggal), in.Username, in.Nama, in.Jenis, in.Jam, in.Terlambat, in.MenitTerlambat,
		in.Lat, in.Lng, in.Jarak, in.FotoURL, in.MapsURL)
	if err != nil {
		return fmt.Errorf("simpan absensi harian %q: %w", in.Username, err)
	}
	return nil
}

func (r *pgAbsensiHarianRepository) SimpanManual(ctx context.Context, in absensiHarianManualInput) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (
			tanggal, username, nama, jam_masuk, jam_pulang,
			status_waktu, keterangan, dicatat_oleh
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (username, tanggal) DO UPDATE SET
			jam_masuk    = EXCLUDED.jam_masuk,
			jam_pulang   = EXCLUDED.jam_pulang,
			status_waktu = EXCLUDED.status_waktu,
			keterangan   = EXCLUDED.keterangan,
			dicatat_oleh = EXCLUDED.dicatat_oleh,
			updated_at   = CURRENT_TIMESTAMP
	`, tanggalISO(in.Tanggal), in.Username, in.Nama, in.JamMasuk, in.JamPulang, in.StatusWaktu, in.Keterangan, in.DicatatOleh)
	if err != nil {
		return fmt.Errorf("simpan absensi manual %q %s: %w", in.Username, in.Tanggal, err)
	}
	return nil
}

func (r *pgAbsensiHarianRepository) SimpanPenandaIzin(ctx context.Context, q sqlExecutor, tanggal, username, nama, status, keterangan string, izinID int) error {
	_, err := q.Exec(ctx, `
		INSERT INTO madrasah_absensi_harian (
			tanggal, username, nama, status_waktu, keterangan, izin_id
		) VALUES ($1::DATE, $2, $3, $4, $5, $6)
		ON CONFLICT (username, tanggal) DO UPDATE SET
			status_waktu = EXCLUDED.status_waktu,
			keterangan   = EXCLUDED.keterangan,
			izin_id      = EXCLUDED.izin_id,
			updated_at   = CURRENT_TIMESTAMP
	`, tanggalISO(tanggal), username, nama, status, keterangan, izinID)
	if err != nil {
		return fmt.Errorf("simpan penanda izin %q %s: %w", username, tanggal, err)
	}
	return nil
}
