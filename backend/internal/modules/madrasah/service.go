package madrasah

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/paspapan/backend/internal/cache"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	db    *Transactor
	cache cache.Store

	pengguna      PenggunaRepository
	pengaturan    PengaturanRepository
	absensiHarian AbsensiHarianRepository
	hariLibur     HariLiburRepository
	izin          IzinRepository
	honor         HonorRepository
	sesi          SesiRepository
	mapel         MapelRepository
	tahunAjaran   TahunAjaranRepository
	kelas         KelasRepository
	siswa         SiswaRepository
	jadwal        JadwalRepository
	presensiSiswa PresensiSiswaRepository
	rekap         RekapRepository
	pengganti     PenggantiRepository
	absensi       AbsensiRepository

	honorCacheTTL time.Duration

	sekolahCacheMu sync.Mutex
	sekolahCache   map[string]interface{}
	sekolahCacheAt time.Time
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{
		db:            NewTransactor(db),
		pengguna:      NewPenggunaRepository(db),
		pengaturan:    NewPengaturanRepository(db),
		absensiHarian: NewAbsensiHarianRepository(db),
		hariLibur:     NewHariLiburRepository(db),
		izin:          NewIzinRepository(db),
		honor:         NewHonorRepository(db),
		sesi:          NewSesiRepository(db),
		mapel:         NewMapelRepository(db),
		tahunAjaran:   NewTahunAjaranRepository(db),
		kelas:         NewKelasRepository(db),
		siswa:         NewSiswaRepository(db),
		jadwal:        NewJadwalRepository(db),
		presensiSiswa: NewPresensiSiswaRepository(db),
		rekap:         NewRekapRepository(db),
		pengganti:     NewPenggantiRepository(db),
		absensi:       NewAbsensiRepository(db),
	}
}

func (s *Service) SetCache(c cache.Store) {
	s.cache = c
}

func (s *Service) SetHonorCacheTTL(seconds int) {
	if seconds > 0 {
		s.honorCacheTTL = time.Duration(seconds) * time.Second
	}
}

func HashPassword(password string) string {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return ""
	}
	return string(hash)
}

func PasswordCocok(storedPassword, password string) (cocok bool, perluUpgrade bool) {
	if storedPassword == "" {
		return false, false
	}
	if strings.HasPrefix(storedPassword, "$2a$") || strings.HasPrefix(storedPassword, "$2b$") ||
		strings.HasPrefix(storedPassword, "$2y$") {
		err := bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(password))
		return err == nil, false
	}
	hashed := HashPasswordOld(password)
	if storedPassword == hashed {
		return true, true
	}
	if storedPassword == password {
		return true, true
	}
	return false, false
}

func HashPasswordOld(password string) string {
	sum := sha256.Sum256([]byte(password))
	return hex.EncodeToString(sum[:])
}

var polaUsername = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

func normalisasiUsername(kasar string) string {
	return strings.ToLower(strings.TrimSpace(kasar))
}

func validasiUsernameXC(u string) string {
	switch {
	case u == "":
		return "Username wajib diisi"
	case len(u) < 3:
		return "Username minimal 3 karakter"
	case len(u) > 32:
		return "Username maksimal 32 karakter"
	case !polaUsername.MatchString(u):
		return "Username hanya boleh huruf kecil, angka, titik, underscore, atau tanda hubung"
	}
	return ""
}

func (s *Service) CheckAccess(ctx context.Context, username, requiredRole string) bool {
	if username == "" {
		return false
	}
	role, status, err := s.pengguna.CariAkses(ctx, username)
	if err != nil || status != "Aktif" {
		return false
	}
	switch requiredRole {
	case "admin":
		return role == "admin"
	case "kepala":
		return role == "kepala"
	case "adminKepala":
		return role == "admin" || role == "kepala"
	case "guru":
		return role == "guru" || role == "kepala"
	}
	return true
}

func (s *Service) Login(ctx context.Context, username, password string) (map[string]interface{}, error) {
	if username == "" || password == "" {
		return map[string]interface{}{"success": false, "message": "Username dan password harus diisi"}, nil
	}

	p, err := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Username atau password salah"}, nil
	}

	if p.Status != "Aktif" {
		return map[string]interface{}{"success": false, "message": "Akun Anda tidak aktif. Silakan hubungi admin."}, nil
	}

	cocok, perluUpgrade := PasswordCocok(p.Password, password)
	if !cocok {
		return map[string]interface{}{"success": false, "message": "Username atau password salah"}, nil
	}
	if perluUpgrade {
		_ = s.pengguna.PerbaruiPassword(ctx, p.Username, HashPassword(password))
	}

	return map[string]interface{}{
		"success": true,
		"user": map[string]interface{}{
			"id":                   p.ID,
			"username":             p.Username,
			"role":                 p.Role,
			"namaLengkap":          p.NamaLengkap,
			"mataPelajaran":        p.MataPelajaran,
			"kelas":                p.Kelas,
			"jamKe":                p.JamKe,
			"izinkanGuruPengganti": p.IzinkanPengganti,
		},
	}, nil
}

func (s *Service) GantiPasswordSendiri(ctx context.Context, username, lama, baru string) (map[string]interface{}, error) {
	if len(baru) < 6 {
		return map[string]interface{}{"success": false, "message": "Password baru minimal 6 karakter"}, nil
	}
	p, err := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "User tidak ditemukan"}, nil
	}
	cocok, _ := PasswordCocok(p.Password, lama)
	if !cocok {
		return map[string]interface{}{"success": false, "message": "Password lama salah"}, nil
	}
	if err := s.pengguna.PerbaruiPassword(ctx, p.Username, HashPassword(baru)); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Password berhasil diubah"}, nil
}

func (s *Service) GetInfoSekolah(ctx context.Context) (map[string]interface{}, error) {

	s.sekolahCacheMu.Lock()
	defer s.sekolahCacheMu.Unlock()
	if s.sekolahCache != nil && time.Since(s.sekolahCacheAt) < 30*time.Second {
		return s.sekolahCache, nil
	}

	settings, err := s.pengaturan.AmbilSemua(ctx)
	if err != nil {
		return nil, err
	}

	lat, _ := strconv.ParseFloat(settings["LatitudeSekolah"], 64)
	lng, _ := strconv.ParseFloat(settings["LongitudeSekolah"], 64)
	radius, _ := strconv.ParseFloat(settings["RadiusMeter"], 64)
	if radius == 0 {
		radius = 150
	}

	tarif, _ := strconv.ParseInt(settings["TarifHonorPerJam"], 10, 64)
	if tarif == 0 {
		tarif = 9000
	}

	namaSekolah := settings["NamaSekolah"]
	if namaSekolah == "" {
		namaSekolah = "MA AL KARIMIYAH"
	}

	mingguLibur := settings["MingguLibur"]
	if mingguLibur == "" {
		mingguLibur = "true"
	}

	daftarMapel := settings["DaftarMapel"]
	if daftarMapel == "" {
		daftarMapel = "Al-Qur'an Hadits, Akidah Akhlak, Aswaja, Fiqih, Sejarah Kebudayaan Islam (SKI), Bahasa Arab, Nahwu, PPKn, Bahasa Indonesia, Matematika, IPA, IPS, Bahasa Inggris, Seni Budaya, PJOK, Prakarya, Informatika, Bahasa Daerah"
	}

	result := map[string]interface{}{
		"namaSekolah":      namaSekolah,
		"namaKepala":       settings["NamaKepala"],
		"latitudeSekolah":  lat,
		"longitudeSekolah": lng,
		"radiusMeter":      radius,
		"jamMasukBatas":    settings["JamMasukBatas"],
		"jamPulangMinimal": settings["JamPulangMinimal"],
		"tarifHonorPerJam": tarif,
		"mingguLibur":      mingguLibur,
		"daftarMapel":      daftarMapel,
	}
	s.sekolahCache = result
	s.sekolahCacheAt = time.Now()
	return result, nil
}

func (s *Service) GetPengaturanLengkap(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	data, err := s.pengaturan.AmbilSemua(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) UpdatePengaturan(ctx context.Context, requestedBy string, dataBaru map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	for k, v := range dataBaru {
		if err := s.pengaturan.Simpan(ctx, k, fmt.Sprintf("%v", v)); err != nil {
			return map[string]interface{}{"success": false, "message": err.Error()}, nil
		}
	}
	s.sekolahCacheMu.Lock()
	s.sekolahCache = nil
	s.sekolahCacheAt = time.Time{}
	s.sekolahCacheMu.Unlock()
	s.cacheFlushHonor(ctx)
	return map[string]interface{}{"success": true, "message": "Pengaturan berhasil disimpan"}, nil
}

func HitungJarak(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func IsMingguLibur(val string) bool {
	val = strings.TrimSpace(strings.ToLower(val))
	if val == "false" || val == "0" {
		return false
	}
	return true
}

func (s *Service) ApakahHariLibur(ctx context.Context, tanggalStr string) (bool, string) {

	parts := strings.Split(tanggalStr, "/")
	if len(parts) == 3 {
		d, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		y, _ := strconv.Atoi(parts[2])
		t := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.Local)
		if t.Weekday() == time.Sunday {
			mingguLibur, _ := s.pengaturan.AmbilNilai(ctx, "MingguLibur")
			if IsMingguLibur(mingguLibur) {
				return true, "Hari Minggu"
			}
		}
	}

	ket, ditemukan, err := s.hariLibur.KeteranganTanggal(ctx, tanggalStr)
	if err == nil && ditemukan {
		if ket == "" {
			ket = "Hari Libur"
		}
		return true, ket
	}
	return false, ""
}

func NamaHariIndo(w time.Weekday) string {
	names := map[time.Weekday]string{
		time.Sunday:    "Minggu",
		time.Monday:    "Senin",
		time.Tuesday:   "Selasa",
		time.Wednesday: "Rabu",
		time.Thursday:  "Kamis",
		time.Friday:    "Jumat",
		time.Saturday:  "Sabtu",
	}
	return names[w]
}

func parseTanggalIndo(str string) (time.Time, error) {
	str = strings.TrimSpace(str)
	parts := strings.Split(str, "/")
	if len(parts) != 3 {
		return time.Time{}, fmt.Errorf("format tanggal harus dd/MM/yyyy")
	}
	d, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	y, _ := strconv.Atoi(parts[2])
	if d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 {
		return time.Time{}, fmt.Errorf("tanggal tidak valid")
	}
	return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.Local), nil
}

func hitungHariDalamRentang(awal, akhir time.Time, hari string) int {
	weekdays := map[string]time.Weekday{
		"Minggu": time.Sunday, "Senin": time.Monday, "Selasa": time.Tuesday,
		"Rabu": time.Wednesday, "Kamis": time.Thursday, "Jumat": time.Friday, "Sabtu": time.Saturday,
	}
	target, ok := weekdays[hari]
	if !ok {
		return 0
	}
	n := 0
	for cur := awal; !cur.After(akhir); cur = cur.AddDate(0, 0, 1) {
		if cur.Weekday() == target {
			n++
		}
	}
	return n
}
