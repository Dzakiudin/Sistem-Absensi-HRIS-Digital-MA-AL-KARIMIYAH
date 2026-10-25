package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/paspapan/backend/internal/config"
	"github.com/paspapan/backend/internal/database"
	"github.com/paspapan/backend/internal/modules/madrasah"
)

type GuruJSON struct {
	No           int    `json:"no"`
	Nama         string `json:"nama"`
	Jabatanked   string `json:"jabatanked"`
	Tempat       string `json:"tempat"`
	TL           string `json:"tl"`
	BL           string `json:"bl"`
	TH           string `json:"th"`
	NIK          string `json:"nik"`
	JK           string `json:"jk"`
	Alamat       string `json:"alamat"`
	Pendidikan   string `json:"pendidikan"`
	TahunLulus   string `json:"tahunLulus"`
	Jabatan      string `json:"jabatan"`
	TahunMasuk   string `json:"tahunMasuk"`
	MasaKerja    string `json:"masaKerja"`
	Status       string `json:"status"`
	TanggalLahir string `json:"tanggalLahir"`
}

type SiswaJSON struct {
	File       string `json:"file"`
	Sheet      string `json:"sheet"`
	Kelas      string `json:"kelas"`
	Nama       string `json:"nama"`
	JK         string `json:"jk"`
	Tempat     string `json:"tempat"`
	TglLahir   string `json:"tglLahir"`
	NIM        string `json:"nim"`
	NISN       string `json:"nisn"`
	NIK        string `json:"nik"`
	Ayah       string `json:"ayah"`
	Ibu        string `json:"ibu"`
	Desa       string `json:"desa"`
	Kecamatan  string `json:"kecamatan"`
	Kabupaten  string `json:"kabupaten"`
	PekAyah    string `json:"pekAyah"`
	PekIbu     string `json:"pekIbu"`
	AnakKe     string `json:"anakKe"`
	Umur       string `json:"umur"`
	TahunMasuk int    `json:"tahunMasuk"`
	RT         string `json:"rt"`
	Mark       string `json:"mark"`
	Yatim      bool   `json:"yatim"`
}

func main() {
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../../.env")
	cfg := config.Load()
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("DB connect error: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	for _, tbl := range []string{
		"madrasah_absensi_siswa", "madrasah_enrollment", "madrasah_absensi",
		"madrasah_honor_terkirim", "madrasah_honor_tambahan", "madrasah_jadwal",
		"madrasah_pengganti_rentang", "madrasah_siswa", "madrasah_kelas",
		"madrasah_tahun_ajaran", "madrasah_users",
	} {
		if _, err := db.Exec(ctx, "DELETE FROM "+tbl); err != nil {
			log.Printf("Warning clearing %s: %v", tbl, err)
		}
	}
	fmt.Println("🧹 Data lama dibersihkan")

	dirData := "data"
	if _, err := os.Stat(dirData); err != nil {
		dirData = filepath.Join("cmd", "seed", "data")
	}

	pengaturan := map[string]string{
		"NamaSekolah":      "MA AL KARIMIYAH",
		"NamaKepala":       "Bayuda Luqman Al Farisi, M.Pd.",
		"LatitudeSekolah":  "-7.1500",
		"LongitudeSekolah": "112.6500",
		"RadiusMeter":      "150",
		"JamMasukBatas":    "07:00",
		"JamPulangMinimal": "14:00",
		"TarifHonorPerJam": "9000",
		"MingguLibur":      "true",
		"DaftarMapel":      "Al-Qur'an Hadits, Akidah Akhlak, Aswaja, Fiqih, Sejarah Kebudayaan Islam (SKI), Bahasa Arab, Nahwu, PPKn, Bahasa Indonesia, Matematika, IPA, IPS, Bahasa Inggris, Seni Budaya, PJOK, Prakarya, Informatika, Bahasa Daerah",
	}
	for k, v := range pengaturan {
		_, _ = db.Exec(ctx, `
			INSERT INTO madrasah_pengaturan (key, value) VALUES ($1, $2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
		`, k, v)
	}
	fmt.Println("✅ Pengaturan sekolah disinkronkan")

	_, err = db.Exec(ctx, `
		INSERT INTO madrasah_users (
			username, password, role, nama_lengkap, mata_pelajaran, no_hp, status,
			kelas, jam_ke, hari_aktif, status_sergu, mapel_aktif, kelas_aktif,
			nip, gelar, status_kepegawaian
		) VALUES (
			'admin', $1, 'admin', 'Administrator', '-', '-', 'Aktif',
			'-', '-', '', '', '', '', '', '', ''
		)
	`, madrasah.HashPassword("KARIMAN01"))
	if err != nil {
		log.Fatalf("Insert admin: %v", err)
	}
	fmt.Println("✅ Akun admin dibuat")

	guruList := readJSON[GuruJSON](ctx, filepath.Join(dirData, "guru-final.json"))
	existingSet := map[string]bool{"admin": true}
	slugify := func(nama string) string {
		var b strings.Builder
		for _, c := range strings.ToLower(nama) {
			if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
				b.WriteRune(c)
			}
		}
		s := b.String()
		if s == "" {
			s = "guru"
		}
		return s
	}
	uniqueUsername := func(base string) string {
		c := base
		for i := 2; existingSet[c]; i++ {
			c = base + strconv.Itoa(i)
		}
		existingSet[c] = true
		return c
	}
	jmlGuru := 0
	jmlKepala := 0
	for _, g := range guruList {
		nama := strings.TrimSpace(g.Nama)
		if nama == "" {
			continue
		}

		base := nama
		if idx := strings.Index(base, ","); idx >= 0 {
			base = base[:idx]
		}
		username := uniqueUsername(slugify(base))

		jabatanKed := strings.ToUpper(strings.TrimSpace(g.Jabatanked))
		role := "guru"
		if strings.Contains(jabatanKed, "KEPALA") {
			role = "kepala"
			jmlKepala++
		} else if jabatanKed == "TU" || strings.Contains(jabatanKed, "SCURITY") || strings.Contains(jabatanKed, "SECURITY") || strings.Contains(jabatanKed, "OPERATOR") || strings.Contains(jabatanKed, "KEBERSIHAN") || strings.Contains(jabatanKed, "LABORAN") {
			role = "staf"
		}

		gelar := ""
		if idx := strings.Index(nama, ","); idx >= 0 {
			gelar = strings.TrimSpace(nama[idx+1:])
		}

		mapel := normalizeMapel(g.Jabatan)

		thnMasuk := 0
		if g.TahunMasuk != "" {
			thnMasuk, _ = strconv.Atoi(g.TahunMasuk)
		}

		_, err := db.Exec(ctx, `
			INSERT INTO madrasah_users (
				username, password, role, nama_lengkap, mata_pelajaran, no_hp, status,
				kelas, jam_ke, hari_aktif, status_sergu, mapel_aktif, kelas_aktif,
				nip, gelar, status_kepegawaian, nik, tempat_lahir, tanggal_lahir,
				jenis_kelamin, alamat, pendidikan, tahun_lulus, tahun_masuk, masa_kerja
			) VALUES (
				$1, $2, $3, $4, $5, '-', 'Aktif',
				'-', '-', 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu', '', $6, '-',
				'', $7, 'GTY', $8, $9, $10,
				$11, $12, $13, $14, $15, $16
			)
		`, username, madrasah.HashPassword("KARIMAN01"), role, nama, mapel, mapel, gelar,
			strings.TrimSpace(g.NIK), strings.TrimSpace(g.Tempat), g.TanggalLahir,
			g.JK, g.Alamat, g.Pendidikan, g.TahunLulus, thnMasuk, g.MasaKerja)
		if err != nil {
			log.Printf("Warning inserting guru %s: %v", nama, err)
			continue
		}
		jmlGuru++
	}
	fmt.Printf("✅ %d guru asli dibuat (termasuk %d kepala madrasah)\n", jmlGuru, jmlKepala)

	kelasKode := []string{"X-1", "X-2", "X-3", "X-4", "X-5", "XI-1", "XI-2", "XI-3", "XI-4", "XI-5", "XII-1", "XII-2", "XII-3", "XII-4", "XII-5"}
	kelasID := map[string]int{}
	for _, k := range kelasKode {
		tingkat := strings.Split(k, "-")[0]
		var id int
		err := db.QueryRow(ctx, `
			INSERT INTO madrasah_kelas (kode_kelas, nama_kelas, tingkat, wali_kelas_id, is_active)
			VALUES ($1, $2, $3, NULL, TRUE) RETURNING id
		`, k, "Kelas "+k, tingkat).Scan(&id)
		if err != nil {
			log.Fatalf("Insert kelas %s: %v", k, err)
		}
		kelasID[k] = id
	}
	fmt.Printf("✅ %d kelas dibuat\n", len(kelasKode))

	ta := []struct {
		Kode  string
		Aktif bool
	}{
		{"2024/2025", false},
		{"2025/2026", false},
		{"2026/2027", true},
	}
	var taAktifID int
	for _, t := range ta {
		var id int
		err := db.QueryRow(ctx, `
			INSERT INTO madrasah_tahun_ajaran (kode, semester, nama, aktif)
			VALUES ($1, 'Ganjil', $2, $3) RETURNING id
		`, t.Kode, "Tahun Ajaran "+t.Kode+" Ganjil", t.Aktif).Scan(&id)
		if err != nil {
			log.Printf("Warning insert tahun ajaran %s: %v", t.Kode, err)
			continue
		}
		if t.Aktif {
			taAktifID = id
		}
	}
	if taAktifID == 0 {
		log.Fatalf("Tidak ada tahun ajaran aktif dibuat")
	}
	fmt.Printf("✅ Tahun ajaran dibuat (aktif id=%d)\n", taAktifID)

	siswaList := readJSON[SiswaJSON](ctx, filepath.Join(dirData, "siswa-final.json"))
	existingNIS := map[string]bool{}
	uniqueNIS := func(base string) string {
		cand := base
		for i := 2; existingNIS[cand]; i++ {
			cand = fmt.Sprintf("%s-%d", base, i)
		}
		existingNIS[cand] = true
		return cand
	}

	jmlSiswa := 0
	jmlGagal := 0
	for i, s := range siswaList {
		nama := strings.TrimSpace(s.Nama)
		if nama == "" {
			jmlGagal++
			continue
		}

		baseNIS := strings.TrimSpace(s.NIM)
		if baseNIS == "" {
			baseNIS = strings.TrimSpace(s.NISN)
		}
		if baseNIS == "" {
			baseNIS = fmt.Sprintf("S%04d", i+1)
		}
		nis := uniqueNIS(baseNIS)

		kelas := strings.TrimSpace(s.Kelas)
		kID, ok := kelasID[kelas]
		if !ok {
			kID = 0
		}
		namaOrtu := strings.TrimSpace(s.Ayah)
		if s.Ibu != "" {
			if namaOrtu != "" {
				namaOrtu += " / " + s.Ibu
			} else {
				namaOrtu = s.Ibu
			}
		}

		var id int
		err := db.QueryRow(ctx, `
			INSERT INTO madrasah_siswa (
				nis, nisn, nim, nik, nama_lengkap, jenis_kelamin, tempat_lahir,
				tanggal_lahir, alamat, nama_ortu, no_hp_ortu, status,
				nama_ayah, nama_ibu, pekerjaan_ayah, pekerjaan_ibu,
				desa, kecamatan, kabupaten, anak_ke, umur, tahun_masuk, rt,
				mark, yatim
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7,
				$8, $9, $10, '', 'Aktif',
				$11, $12, $13, $14,
				$15, $16, $17, $18, $19, $20, $21,
				$22, $23
			) RETURNING id
		`, nis, s.NISN, s.NIM, s.NIK, nama, s.JK, s.Tempat,
			s.TglLahir, s.RT, namaOrtu,
			s.Ayah, s.Ibu, s.PekAyah, s.PekIbu,
			s.Desa, s.Kecamatan, s.Kabupaten, s.AnakKe, s.Umur, s.TahunMasuk, s.RT,
			s.Mark, s.Yatim).Scan(&id)
		if err != nil {
			log.Printf("Warning insert siswa %s: %v", nama, err)
			jmlGagal++
			continue
		}
		jmlSiswa++

		if kID > 0 {
			_, _ = db.Exec(ctx, `
				INSERT INTO madrasah_enrollment (siswa_id, kelas_id, tahun_ajaran_id)
				VALUES ($1, $2, $3)
				ON CONFLICT (siswa_id, tahun_ajaran_id) DO UPDATE SET kelas_id = EXCLUDED.kelas_id
			`, id, kID, taAktifID)
		}
	}
	fmt.Printf("✅ %d siswa asli diimpor (gagal %d)\n", jmlSiswa, jmlGagal)

	if err := verifySeed(ctx, db); err != nil {
		log.Fatalf("Verifikasi seed gagal: %v", err)
	}
	fmt.Println("🎉 Seed data asli selesai & terverifikasi")
}

func verifySeed(ctx context.Context, db *pgxpool.Pool) error {
	counts := []struct {
		tbl  string
		memo string
	}{
		{"madrasah_users", "user (48 guru + admin + 1 kepala)"},
		{"madrasah_siswa", "siswa"},
		{"madrasah_kelas", "kelas"},
		{"madrasah_tahun_ajaran", "tahun ajaran"},
		{"madrasah_enrollment", "enrollment"},
	}
	for _, c := range counts {
		var n int
		if err := db.QueryRow(ctx, "SELECT COUNT(*) FROM "+c.tbl).Scan(&n); err != nil {
			return err
		}
		fmt.Printf("   %-24s = %d  (%s)\n", c.tbl, n, c.memo)
	}
	return nil
}

func normalizeMapel(jabatan string) string {
	j := strings.ToUpper(strings.TrimSpace(jabatan))
	j = strings.TrimSpace(strings.TrimPrefix(j, "GURU"))

	words := strings.Fields(strings.TrimSpace(j))
	if len(words) == 0 {
		return strings.TrimSpace(jabatan)
	}
	lower := map[string]bool{"AL": true, "DAN": true, "KE": true, "DARI": true, "OR": true}
	title := []string{}
	for i, w := range words {
		lw := strings.ToLower(w)
		if lw == "QUR'AN" {
			title = append(title, "Qur'an")
			continue
		}
		if lower[lw] && i != 0 {
			title = append(title, lw)
			continue
		}
		if len(w) <= 3 && i != 0 {
			title = append(title, lw)
			continue
		}
		title = append(title, lw[:1]+strings.ToLower(lw[1:]))
	}
	return strings.Join(title, " ")
}

func readJSON[T any](ctx context.Context, path string) []T {
	raw, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Baca %s: %v (jalankan dari folder backend/)", path, err)
	}
	var out []T
	if err := json.Unmarshal(raw, &out); err != nil {
		log.Fatalf("Parse %s: %v", path, err)
	}
	return out
}
