package madrasah

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func (s *Service) GetStatusAbsensiHariIni(ctx context.Context, username string) (map[string]interface{}, error) {
	now := time.Now()
	todayStr := now.Format("02/01/2006")
	hariIniNama := NamaHariIndo(now.Weekday())

	isLibur, ketLibur := s.ApakahHariLibur(ctx, todayStr)

	hariAktif, _ := s.absensi.HariAktif(ctx, username)

	hariAktifList := []string{}
	bukanHariJadwal := false
	if hariAktif != "" {
		for _, h := range strings.Split(hariAktif, ",") {
			hTrim := strings.TrimSpace(h)
			if hTrim != "" {
				hariAktifList = append(hariAktifList, hTrim)
			}
		}
		if len(hariAktifList) > 0 {
			match := false
			for _, h := range hariAktifList {
				if strings.EqualFold(h, hariIniNama) {
					match = true
					break
				}
			}
			if !match {

				if hariIniNama == "Minggu" && !isLibur {
					bukanHariJadwal = false
				} else {
					bukanHariJadwal = true
				}
			}
		}
	}

	rows, err := s.absensi.AbsensiHariIni(ctx, username, todayStr)
	if err != nil {
		return nil, err
	}

	daftarHariIni := []map[string]interface{}{}
	for _, rec := range rows {
		daftarHariIni = append(daftarHariIni, map[string]interface{}{
			"id":            rec.ID,
			"jam":           rec.Jam,
			"mataPelajaran": rec.Mapel,
			"statusWaktu":   rec.StatusWaktu,
			"keterangan":    rec.Keterangan,
			"kelas":         rec.Kelas,
			"jamKe":         rec.JamKe,
		})
	}

	return map[string]interface{}{
		"daftarHariIni":   daftarHariIni,
		"isHariLibur":     isLibur,
		"keteranganLibur": ketLibur,
		"bukanHariJadwal": bukanHariJadwal,
		"hariIniNama":     hariIniNama,
		"hariAktifGuru":   hariAktifList,
	}, nil
}

func namaFileAcak(prefix string) (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b)), nil
}

func (s *Service) SimpanFoto(base64Data, filename string) (string, error) {
	if base64Data == "" {
		return "", nil
	}
	parts := strings.Split(base64Data, ",")
	raw := base64Data
	if len(parts) > 1 {
		raw = parts[1]
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", err
	}

	dir := filepath.Join(".", "storage", "uploads", "foto")
	_ = os.MkdirAll(dir, 0755)

	filePath := filepath.Join(dir, filename+".jpg")
	if err := os.WriteFile(filePath, decoded, 0644); err != nil {
		return "", err
	}
	return "/uploads/foto/" + filename + ".jpg", nil
}

func (s *Service) CatatAbsensi(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := fmt.Sprintf("%v", payload["username"])
	jenisAbsen := fmt.Sprintf("%v", payload["jenisAbsen"])
	if jenisAbsen == "" || jenisAbsen == "<nil>" {
		jenisAbsen = "Masuk"
	}
	mapel := fmt.Sprintf("%v", payload["mataPelajaran"])
	kelas := fmt.Sprintf("%v", payload["kelas"])
	jamKe := fmt.Sprintf("%v", payload["jamKe"])
	lat, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["latitude"]), 64)
	lng, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["longitude"]), 64)
	fotoB64 := fmt.Sprintf("%v", payload["fotoBase64"])

	role := s.roleUser(ctx, username)
	if role == "staf" {
		mapel = "-"
		kelas = "-"
		jamKe = "-"
	}

	now := time.Now()
	todayStr := now.Format("02/01/2006")
	jamStr := now.Format("15:04:05")

	isLibur, ketLibur := s.ApakahHariLibur(ctx, todayStr)
	if isLibur {
		return map[string]interface{}{"success": false, "message": "Hari ini libur: " + ketLibur}, nil
	}

	info, errInfo := s.GetInfoSekolah(ctx)
	if errInfo != nil || info == nil {
		return map[string]interface{}{"success": false, "message": "Data konfigurasi sekolah belum dapat dimuat. Coba beberapa saat lagi."}, nil
	}
	jamMasukBatas := fmt.Sprintf("%v", info["jamMasukBatas"])
	jamPulangMinimal := fmt.Sprintf("%v", info["jamPulangMinimal"])
	currentHM := now.Format("15:04")
	if jamMasukBatas != "" && currentHM < jamMasukBatas {
		return map[string]interface{}{"success": false, "message": "Absensi belum dibuka. Jam masuk awal adalah " + jamMasukBatas}, nil
	}
	if jamPulangMinimal != "" && currentHM > jamPulangMinimal {
		return map[string]interface{}{"success": false, "message": "Absensi sudah ditutup. Jam pulang akhir adalah " + jamPulangMinimal}, nil
	}

	schoolLat, _ := info["latitudeSekolah"].(float64)
	schoolLng, _ := info["longitudeSekolah"].(float64)
	radius, _ := info["radiusMeter"].(float64)
	jarak := math.Round(HitungJarak(lat, lng, schoolLat, schoolLng))
	statusLokasi := "Dalam Radius"
	if jarak > radius {
		statusLokasi = "Luar Radius"
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda berada di luar radius sekolah (%d m > %d m). Absensi ditolak.", int(jarak), int(radius)),
		}, nil
	}

	exists, _ := s.absensi.SlotExists(ctx, username, todayStr, kelas, jamKe)
	if exists {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda sudah memiliki catatan absensi untuk Kelas %s Jam ke-%s hari ini.", kelas, jamKe),
		}, nil
	}

	namaGuru, _ := s.absensi.NamaGuru(ctx, username)

	filename, _ := namaFileAcak("absen")
	fotoURL, _ := s.SimpanFoto(fotoB64, filename)
	linkMaps := fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%f,%f", lat, lng)

	err := s.absensi.Simpan(ctx, absenInput{
		Timestamp:    now,
		Tanggal:      todayStr,
		Jam:          jamStr,
		Username:     username,
		Nama:         namaGuru,
		Mapel:        mapel,
		Jenis:        jenisAbsen,
		Latitude:     lat,
		Longitude:    lng,
		Jarak:        int(jarak),
		StatusLokasi: statusLokasi,
		FotoURL:      fotoURL,
		StatusWaktu:  "Hadir",
		Keterangan:   "",
		Kelas:        kelas,
		JamKe:        jamKe,
		LinkMaps:     linkMaps,
	})

	if err != nil {
		return map[string]interface{}{"success": false, "message": "Gagal menyimpan absensi: " + err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Absensi berhasil disimpan"}, nil
}

func (s *Service) AjukanIzinSakitCuti(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := fmt.Sprintf("%v", payload["username"])
	kategori := fmt.Sprintf("%v", payload["kategori"])
	keterangan := fmt.Sprintf("%v", payload["keterangan"])
	guruPengganti := fmt.Sprintf("%v", payload["guruPengganti"])
	mapel := fmt.Sprintf("%v", payload["mataPelajaran"])
	kelas := fmt.Sprintf("%v", payload["kelas"])
	jamKe := fmt.Sprintf("%v", payload["jamKe"])

	if s.roleUser(ctx, username) == "staf" {
		mapel = "-"
		kelas = "-"
		jamKe = "-"
	}

	now := time.Now()
	todayStr := now.Format("02/01/2006")
	jamStr := now.Format("15:04:05")

	if !validKategori[kategori] {
		return map[string]interface{}{
			"success": false,
			"message": "Kategori izin tidak valid. Pilih Izin, Sakit, atau Cuti.",
		}, nil
	}
	if kategori == "Hadir" || kategori == "Alpa" {
		return map[string]interface{}{
			"success": false,
			"message": "Status " + kategori + " tidak bisa diajukan lewat form izin.",
		}, nil
	}

	namaGuru, izinkanPengganti, _ := s.absensi.NamaDanIzinkanPengganti(ctx, username)

	statusPengganti := ""
	if guruPengganti != "" && guruPengganti != "<nil>" {
		if !izinkanPengganti {
			return map[string]interface{}{
				"success": false,
				"message": "Anda tidak memiliki izin untuk menggunakan fitur guru pengganti. Silakan hubungi Admin.",
			}, nil
		}
		statusPengganti = "Menunggu"
	}

	exists, _ := s.absensi.SlotExists(ctx, username, todayStr, kelas, jamKe)
	if exists {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda sudah memiliki catatan untuk Kelas %s Jam ke-%s hari ini.", kelas, jamKe),
		}, nil
	}

	tersimpan, err := s.absensi.SimpanIzin(ctx, absenIzinInput{
		Timestamp:       now,
		Tanggal:         todayStr,
		Jam:             jamStr,
		Username:        username,
		Nama:            namaGuru,
		Mapel:           mapel,
		Kategori:        kategori,
		Keterangan:      keterangan,
		Kelas:           kelas,
		JamKe:           jamKe,
		GuruPengganti:   guruPengganti,
		StatusPengganti: statusPengganti,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	if !tersimpan {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda sudah memiliki catatan untuk Kelas %s Jam ke-%s hari ini.", kelas, jamKe),
		}, nil
	}
	return map[string]interface{}{"success": true, "message": fmt.Sprintf("Pengajuan %s berhasil disimpan", kategori)}, nil
}

func (s *Service) GetRiwayatAbsensiSaya(ctx context.Context, username string) ([]map[string]interface{}, error) {
	rows, err := s.absensi.RiwayatSaya(ctx, username)
	if err != nil {
		return nil, err
	}

	list := []map[string]interface{}{}
	for _, rec := range rows {
		sebagaiPengganti := rec.SubstituteUsername == username && rec.StatusKonfirmasiPengganti == "Terkonfirmasi"
		list = append(list, map[string]interface{}{
			"id":                        rec.ID,
			"tanggal":                   rec.Tanggal,
			"jam":                       rec.Jam,
			"jenisAbsen":                rec.Jenis,
			"statusWaktu":               rec.StatusWaktu,
			"statusLokasi":              rec.StatusLokasi,
			"latitude":                  rec.Latitude,
			"longitude":                 rec.Longitude,
			"fotoUrl":                   rec.FotoUrl,
			"kelas":                     rec.Kelas,
			"jamKe":                     rec.JamKe,
			"guruPengganti":             rec.GuruPengganti,
			"statusKonfirmasiPengganti": rec.StatusKonfirmasiPengganti,
			"sebagaiPengganti":          sebagaiPengganti,
			"namaGuruAsli":              rec.NamaGuru,
		})
	}
	return list, nil
}

func (s *Service) CatatKehadiranManual(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	username := fmt.Sprintf("%v", payload["username"])
	tanggal := fmt.Sprintf("%v", payload["tanggal"])
	kategori := fmt.Sprintf("%v", payload["kategori"])
	mapel := fmt.Sprintf("%v", payload["mataPelajaran"])
	kelas := fmt.Sprintf("%v", payload["kelas"])
	jamKe := fmt.Sprintf("%v", payload["jamKe"])
	keterangan := fmt.Sprintf("%v", payload["keterangan"])
	guruPengganti := fmt.Sprintf("%v", payload["guruPengganti"])

	namaGuru, _ := s.absensi.NamaGuru(ctx, username)

	statusPengganti := ""
	if guruPengganti != "" && guruPengganti != "<nil>" {
		statusPengganti = "Menunggu"
	}

	normTanggal := tanggal
	if parsed, pErr := parseTanggalIndo(tanggal); pErr == nil {
		normTanggal = parsed.Format("02/01/2006")
	}
	exists, _ := s.absensi.SlotJamKeExists(ctx, username, normTanggal, jamKe)
	if exists {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Sudah ada catatan kehadiran untuk %s pada tanggal %s Jam ke-%s.", username, normTanggal, jamKe),
		}, nil
	}

	err := s.absensi.SimpanManual(ctx, absenManualInput{
		Timestamp:       time.Now(),
		Tanggal:         normTanggal,
		Username:        username,
		Nama:            namaGuru,
		Mapel:           mapel,
		Kategori:        kategori,
		Keterangan:      keterangan,
		Kelas:           kelas,
		JamKe:           jamKe,
		GuruPengganti:   guruPengganti,
		StatusPengganti: statusPengganti,
	})

	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushHonor(ctx)
	return map[string]interface{}{"success": true, "message": "Kehadiran berhasil dicatat secara manual"}, nil
}
