package madrasah

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type jadwalGuruRow struct {
	ID         int
	Hari       string
	Mapel      string
	Kelas      string
	JamKe      string
	JamMulai   *time.Time
	JamSelesai *time.Time
}

type sesiIzinInput struct {
	JadwalID      int
	Tanggal       time.Time
	Hari          string
	JamKe         string
	JamMulai      *time.Time
	JamSelesai    *time.Time
	Mapel         string
	Kelas         string
	PengajarUtama string
	NamaPengajar  string
	Pengguna      string
	NamaPengganti string
	StatusSesi    string
	DurasiMenit   int
}

type sesiMengajarRow struct {
	Hari          string
	JamKe         string
	JamMulai      *time.Time
	JamSelesai    *time.Time
	Mapel         string
	Kelas         string
	PengajarUtama string
	NamaPengajar  string
	Pengguna      string
	NamaPengganti string
	StatusSesi    string
	DurasiMenit   int
}

type SesiRepository interface {
	JadwalGuru(ctx context.Context, q sqlExecutor, username string) ([]jadwalGuruRow, error)
	SimpanSesiIzin(ctx context.Context, q sqlExecutor, in sesiIzinInput) error
	SesiTanggal(ctx context.Context, tanggal string) ([]sesiMengajarRow, error)
	MaterialisasiSesiPeriode(ctx context.Context, dari, sampai time.Time) error
}

type pgSesiRepository struct {
	db *pgxpool.Pool
}

func NewSesiRepository(db *pgxpool.Pool) SesiRepository {
	return &pgSesiRepository{db: db}
}

func (r *pgSesiRepository) JadwalGuru(ctx context.Context, q sqlExecutor, username string) ([]jadwalGuruRow, error) {
	rows, err := q.Query(ctx, `
		SELECT id, hari, mata_pelajaran, kelas, jam_ke, jam_mulai, jam_selesai
		FROM madrasah_jadwal
		WHERE LOWER(username) = LOWER($1)
	`, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []jadwalGuruRow{}
	for rows.Next() {
		var b jadwalGuruRow
		if err := rows.Scan(&b.ID, &b.Hari, &b.Mapel, &b.Kelas, &b.JamKe, &b.JamMulai, &b.JamSelesai); err != nil {
			continue
		}
		list = append(list, b)
	}
	return list, rows.Err()
}

func (r *pgSesiRepository) SimpanSesiIzin(ctx context.Context, q sqlExecutor, in sesiIzinInput) error {

	_, err := q.Exec(ctx, `
		INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai,
			mapel, kelas, pengajar_utama, nama_pengajar,
			pengguna, nama_pengganti, status_sesi, durasi_menit, sumber
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (tanggal, jadwal_id) DO UPDATE SET
			pengguna       = EXCLUDED.pengguna,
			nama_pengganti = EXCLUDED.nama_pengganti,
			status_sesi    = EXCLUDED.status_sesi,
			durasi_menit   = EXCLUDED.durasi_menit,
			sumber         = 'Izin',
			updated_at     = CURRENT_TIMESTAMP
	`, in.JadwalID, in.Tanggal.Format("2006-01-02"), in.Hari, in.JamKe, in.JamMulai, in.JamSelesai,
		in.Mapel, in.Kelas, in.PengajarUtama, in.NamaPengajar,
		in.Pengguna, in.NamaPengganti, in.StatusSesi, in.DurasiMenit, "Izin")
	return err
}

func (r *pgSesiRepository) SesiTanggal(ctx context.Context, tanggal string) ([]sesiMengajarRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT hari, jam_ke, jam_mulai, jam_selesai, mapel, kelas,
		       pengajar_utama, nama_pengajar, pengguna, nama_pengganti,
		       status_sesi, durasi_menit
		FROM madrasah_sesi_mengajar
		WHERE tanggal = $1
		ORDER BY jam_mulai ASC NULLS LAST, kelas ASC
	`, tanggal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []sesiMengajarRow{}
	for rows.Next() {
		var rec sesiMengajarRow
		if err := rows.Scan(&rec.Hari, &rec.JamKe, &rec.JamMulai, &rec.JamSelesai, &rec.Mapel,
			&rec.Kelas, &rec.PengajarUtama, &rec.NamaPengajar, &rec.Pengguna, &rec.NamaPengganti,
			&rec.StatusSesi, &rec.DurasiMenit); err != nil {
			continue
		}
		list = append(list, rec)
	}
	return list, rows.Err()
}

func (r *pgSesiRepository) MaterialisasiSesiPeriode(ctx context.Context, dari, sampai time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("mulai transaksi materialisasi sesi: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		DELETE FROM madrasah_sesi_mengajar s
		WHERE s.tanggal BETWEEN $1::DATE AND $2::DATE
		  AND s.sumber = 'Jadwal'
		  AND s.status_sesi = 'Mengajar'
		  AND lower(s.pengguna) = lower(s.pengajar_utama)
		  AND (
		      EXISTS (
		          SELECT 1
		          FROM madrasah_absensi_harian h
		          WHERE h.tanggal = s.tanggal
		            AND lower(h.username) = lower(s.pengajar_utama)
		            AND h.status_waktu = 'Hadir'
		      )
		      OR NOT EXISTS (
		          SELECT 1
		          FROM madrasah_absensi a
		          WHERE a.tanggal = to_char(s.tanggal, 'DD/MM/YYYY')
		            AND lower(a.username) = lower(s.pengajar_utama)
		      )
		  )
	`, dari.Format("2006-01-02"), sampai.Format("2006-01-02")); err != nil {
		return fmt.Errorf("hapus sesi tanpa kehadiran %s s/d %s: %w",
			dari.Format("2006-01-02"), sampai.Format("2006-01-02"), err)
	}

	if _, err = tx.Exec(ctx, `
				INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai,
			mapel, kelas, pengajar_utama, nama_pengajar,
			pengguna, nama_pengganti, status_sesi, durasi_menit, sumber
		)
		WITH slot AS (
			SELECT
				d.tanggal AS tgl,
				j.id AS jadwal_id,
				j.jam_ke,
				j.jam_mulai,
				j.jam_selesai,
				j.mata_pelajaran,
				j.kelas,
				j.username AS pengajar_utama,
				j.nama_guru AS nama_pengajar,
				j.username AS pengguna,
				CASE
					WHEN j.jam_mulai IS NOT NULL AND j.jam_selesai IS NOT NULL AND j.jam_selesai > j.jam_mulai
						THEN GREATEST(0, (EXTRACT(EPOCH FROM (j.jam_selesai - j.jam_mulai)) / 60)::int)
					ELSE 40
				END AS durasi_slot,
				CASE EXTRACT(ISODOW FROM d.tanggal)
					WHEN 1 THEN 'Senin' WHEN 2 THEN 'Selasa' WHEN 3 THEN 'Rabu' WHEN 4 THEN 'Kamis' WHEN 5 THEN 'Jumat' WHEN 6 THEN 'Sabtu' WHEN 7 THEN 'Minggu'
				END AS hari_tgl,
				CASE j.jam_ke
					WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4 WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8 ELSE 99
				END AS ord_jam
			FROM madrasah_jadwal j
			CROSS JOIN LATERAL generate_series($1::DATE, $2::DATE, '1 day'::interval) AS d(tanggal)
			JOIN madrasah_absensi_harian h ON h.tanggal = d.tanggal::DATE AND lower(h.username)=lower(j.username) AND h.status_waktu='Hadir'
			WHERE lower(CASE EXTRACT(ISODOW FROM d.tanggal) WHEN 1 THEN 'Senin' WHEN 2 THEN 'Selasa' WHEN 3 THEN 'Rabu' WHEN 4 THEN 'Kamis' WHEN 5 THEN 'Jumat' WHEN 6 THEN 'Sabtu' WHEN 7 THEN 'Minggu' END)=lower(trim(j.hari)) AND d.tanggal::DATE<=CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM madrasah_hari_libur l WHERE l.tanggal=TO_CHAR(d.tanggal,'DD/MM/YYYY')) AND NOT EXISTS (SELECT 1 FROM madrasah_sesi_mengajar si WHERE si.tanggal=d.tanggal::DATE AND si.jadwal_id=j.id AND si.sumber='Izin')
		),
		sebelumnya AS (
			SELECT
				tgl,jadwal_id,jam_ke,jam_mulai,jam_selesai,mata_pelajaran,kelas,pengajar_utama,nama_pengajar,pengguna,durasi_slot,hari_tgl,ord_jam,
				LAG(jam_selesai) OVER (PARTITION BY tgl,lower(pengajar_utama),lower(mata_pelajaran),lower(kelas),pengguna ORDER BY jam_mulai,jadwal_id) AS prev_selesai
			FROM slot
		),
		grup AS (
			SELECT
				*,
				CASE WHEN jam_mulai IS NOT NULL AND prev_selesai = jam_mulai THEN 0 ELSE 1 END AS gap
			FROM sebelumnya
		),
		run AS (
			SELECT
				*,
				SUM(gap) OVER (PARTITION BY tgl,lower(pengajar_utama),lower(mata_pelajaran),lower(kelas),pengguna ORDER BY jam_mulai,jadwal_id ROWS UNBOUNDED PRECEDING) AS run_id
			FROM grup
		),
gabung AS (
			SELECT tgl, MIN(jadwal_id) AS jadwal_id_grup, MIN(ord_jam) AS ord_min, MAX(ord_jam) AS ord_max, MIN(jam_mulai) AS jam_mulai, MAX(jam_selesai) AS jam_selesai, MAX(hari_tgl) AS hari, mata_pelajaran AS mapel, kelas, pengajar_utama, MAX(nama_pengajar) AS nama_pengajar, pengguna, SUM(durasi_slot) AS durasi_menit, 'Jadwal' AS sumber, 'Mengajar' AS status_sesi FROM run GROUP BY tgl,run_id,lower(pengajar_utama),lower(mata_pelajaran),lower(kelas),pengguna,mata_pelajaran,kelas,pengajar_utama
		)
		SELECT jadwal_id_grup,tgl,hari,CASE WHEN ord_min=ord_max THEN (CASE ord_min WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV' WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII' ELSE 'I' END) ELSE (CASE ord_min WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV' WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII' ELSE 'I' END)||'-'||(CASE ord_max WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV' WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII' ELSE 'I' END) END,jam_mulai,jam_selesai,mapel,kelas,pengajar_utama,nama_pengajar,pengguna,'',status_sesi,durasi_menit,sumber
		FROM gabung
		ON CONFLICT (tanggal,jadwal_id) DO UPDATE SET hari=EXCLUDED.hari,jam_ke=EXCLUDED.jam_ke,jam_mulai=EXCLUDED.jam_mulai,jam_selesai=EXCLUDED.jam_selesai,mapel=EXCLUDED.mapel,kelas=EXCLUDED.kelas,pengajar_utama=EXCLUDED.pengajar_utama,nama_pengajar=EXCLUDED.nama_pengajar,durasi_menit=EXCLUDED.durasi_menit,updated_at=CURRENT_TIMESTAMP WHERE madrasah_sesi_mengajar.sumber='Jadwal' AND (madrasah_sesi_mengajar.pengguna IS DISTINCT FROM EXCLUDED.pengguna OR madrasah_sesi_mengajar.status_sesi IS DISTINCT FROM EXCLUDED.status_sesi OR madrasah_sesi_mengajar.durasi_menit IS DISTINCT FROM EXCLUDED.durasi_menit)
	`, dari.Format("2006-01-02"), sampai.Format("2006-01-02")); err != nil {
		return fmt.Errorf("materialisasi sesi %s s/d %s: %w",
			dari.Format("2006-01-02"), sampai.Format("2006-01-02"), err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO madrasah_sesi_mengajar (
			jadwal_id, tanggal, hari, jam_ke, jam_mulai, jam_selesai,
			mapel, kelas, pengajar_utama, nama_pengajar,
			pengguna, nama_pengganti, status_sesi, durasi_menit, sumber
		)
		SELECT j.id, TO_DATE(a.tanggal, 'DD/MM/YYYY'),
		       CASE EXTRACT(ISODOW FROM TO_DATE(a.tanggal, 'DD/MM/YYYY'))
		         WHEN 1 THEN 'Senin' WHEN 2 THEN 'Selasa' WHEN 3 THEN 'Rabu'
		         WHEN 4 THEN 'Kamis' WHEN 5 THEN 'Jumat' WHEN 6 THEN 'Sabtu'
		         WHEN 7 THEN 'Minggu'
		       END,
		       j.jam_ke, j.jam_mulai, j.jam_selesai, j.mata_pelajaran, j.kelas,
		       a.username, COALESCE(asli.nama_lengkap, a.nama_guru),
		       a.substitute_username, pengganti.nama_lengkap, 'Mengajar',
		       CASE
		         WHEN j.jam_mulai IS NOT NULL AND j.jam_selesai IS NOT NULL
		           AND j.jam_selesai > j.jam_mulai
		         THEN (EXTRACT(EPOCH FROM (j.jam_selesai - j.jam_mulai)) / 60)::int
		         ELSE 40
		       END,
		       'Izin'
		FROM madrasah_absensi a
		JOIN madrasah_jadwal j
		  ON LOWER(j.username) = LOWER(a.username)
		 AND LOWER(j.kelas) = LOWER(a.kelas)
		 AND LOWER(j.jam_ke) = LOWER(a.jam_ke)
		JOIN madrasah_users pengganti
		  ON LOWER(pengganti.username) = LOWER(a.substitute_username)
		 AND pengganti.role IN ('guru', 'staf') AND pengganti.status = 'Aktif'
		LEFT JOIN madrasah_users asli ON LOWER(asli.username) = LOWER(a.username)
		WHERE a.status_konfirmasi_pengganti = 'Terkonfirmasi'
		  AND COALESCE(a.substitute_username, '') <> ''
		  AND TO_DATE(a.tanggal, 'DD/MM/YYYY') BETWEEN $1::DATE AND $2::DATE
		ON CONFLICT (tanggal, jadwal_id) DO UPDATE SET
		  hari = EXCLUDED.hari,
		  jam_ke = EXCLUDED.jam_ke,
		  jam_mulai = EXCLUDED.jam_mulai,
		  jam_selesai = EXCLUDED.jam_selesai,
		  mapel = EXCLUDED.mapel,
		  kelas = EXCLUDED.kelas,
		  nama_pengajar = EXCLUDED.nama_pengajar,
		  pengguna = EXCLUDED.pengguna,
		  nama_pengganti = EXCLUDED.nama_pengganti,
		  status_sesi = EXCLUDED.status_sesi,
		  durasi_menit = EXCLUDED.durasi_menit,
		  sumber = EXCLUDED.sumber,
		  updated_at = CURRENT_TIMESTAMP
		WHERE madrasah_sesi_mengajar.sumber = 'Jadwal'
		   OR (madrasah_sesi_mengajar.sumber = 'Izin'
		       AND LOWER(madrasah_sesi_mengajar.pengguna) = LOWER(EXCLUDED.pengguna))
	`, dari.Format("2006-01-02"), sampai.Format("2006-01-02")); err != nil {
		return fmt.Errorf("materialisasi sesi pengganti %s s/d %s: %w",
			dari.Format("2006-01-02"), sampai.Format("2006-01-02"), err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit materialisasi sesi: %w", err)
	}
	return nil
}
