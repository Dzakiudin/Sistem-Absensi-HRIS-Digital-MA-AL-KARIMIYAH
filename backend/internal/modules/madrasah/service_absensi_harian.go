package madrasah

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

func (s *Service) GetStatusAbsensiHarian(ctx context.Context, username string) (map[string]interface{}, error) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	todayStr := today.Format("02/01/2006")

	sudahMasuk := false
	sudahPulang := false
	row := map[string]interface{}{
		"tanggal":        todayStr,
		"hariIni":        namaHariDariTanggal(today),
		"jamMasuk":       nil,
		"jamPulang":      nil,
		"statusWaktu":    "",
		"sudahMasuk":     false,
		"sudahPulang":    false,
		"terlambat":      false,
		"menitTerlambat": 0,
		"keterangan":     "",
		"izinDia":        false,
	}

	catatan, err := s.absensiHarian.AmbilSatu(ctx, username, todayStr)
	if err == nil && catatan != nil {
		if catatan.JamMasuk != nil {
			row["jamMasuk"] = catatan.JamMasuk.Format("15:04:05")
			sudahMasuk = true
		}
		if catatan.JamPulang != nil {
			row["jamPulang"] = catatan.JamPulang.Format("15:04:05")
			sudahPulang = true
		}
		row["statusWaktu"] = catatan.StatusWaktu
		row["keterangan"] = catatan.Keterangan
		row["terlambat"] = catatan.Terlambat
		row["menitTerlambat"] = catatan.MenitTerlambat
		row["izinDia"] = catatan.StatusWaktu != "Hadir"
	}
	row["sudahMasuk"] = sudahMasuk
	row["sudahPulang"] = sudahPulang

	isLibur, ketLibur := s.ApakahHariLibur(ctx, todayStr)
	row["isHariLibur"] = isLibur
	row["keteranganLibur"] = ketLibur

	mulaiMenit, batasMenit, pulangMenit, ok := s.jamAbsensi(ctx)
	if !ok {
		return nil, fmt.Errorf("konfigurasi jam absensi tidak valid, periksa Pengaturan Sistem")
	}

	sekarang := now.Hour()*60 + now.Minute()

	row["bisaMasuk"] = !isLibur && !sudahMasuk && sekarang >= mulaiMenit && sekarang <= pulangMenit
	row["bisaPulang"] = !isLibur && sudahMasuk && !sudahPulang && sekarang >= pulangMenit

	if sekarang > batasMenit && !isLibur && !sudahMasuk {
		row["terlambatPotensial"] = true
		row["menitTerlambat"] = sekarang - batasMenit
	} else {
		row["terlambatPotensial"] = false
	}

	if sekarang > batasMenit {
		row["menitTerlambatBatas"] = sekarang - batasMenit
	} else {
		row["menitTerlambatBatas"] = 0
	}

	return row, nil
}

func (s *Service) CatatAbsensiHarian(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	jenis := strings.TrimSpace(fmt.Sprintf("%v", payload["jenisAbsen"]))
	if jenis == "" || jenis == "<nil>" {
		jenis = "Masuk"
	}
	if jenis != "Masuk" && jenis != "Pulang" {
		return map[string]interface{}{"success": false, "message": "Jenis absen harus Masuk atau Pulang."}, nil
	}

	lat, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["latitude"]), 64)
	lng, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["longitude"]), 64)
	fotoB64 := strings.TrimSpace(fmt.Sprintf("%v", payload["fotoBase64"]))

	if lat == 0 && lng == 0 {
		return map[string]interface{}{"success": false, "message": "Lokasi GPS tidak terbaca. Aktasikan lokasi lalu coba lagi."}, nil
	}
	if fotoB64 == "" || fotoB64 == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Foto absen wajib diambil."}, nil
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	todayStr := today.Format("02/01/2006")

	if isLibur, ketLibur := s.ApakahHariLibur(ctx, todayStr); isLibur {
		return map[string]interface{}{"success": false, "message": "Hari ini libur: " + ketLibur}, nil
	}

	pegawai, errPegawai := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if errPegawai != nil || pegawai.Status != "Aktif" {
		return map[string]interface{}{"success": false, "message": "Data pegawai tidak ditemukan atau akun tidak aktif."}, nil
	}
	nama := pegawai.NamaLengkap

	info, errInfo := s.GetInfoSekolah(ctx)
	if errInfo != nil || info == nil {
		return map[string]interface{}{"success": false, "message": "Konfigurasi sekolah belum dapat dimuat. Coba beberapa saat lagi."}, nil
	}
	schoolLat, _ := info["latitudeSekolah"].(float64)
	schoolLng, _ := info["longitudeSekolah"].(float64)
	radius, _ := info["radiusMeter"].(float64)
	jarak := math.Round(HitungJarak(lat, lng, schoolLat, schoolLng))
	if jarak > radius {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda berada di luar radius sekolah (%d m > %d m). Absensi ditolak.", int(jarak), int(radius)),
		}, nil
	}

	mulaiMenit, batasMenit, pulangMenit, ok := s.jamAbsensi(ctx)
	if !ok {
		return nil, fmt.Errorf("konfigurasi jam absensi tidak valid, periksa Pengaturan Sistem")
	}
	mulaiStr := s.pengaturanAmbil(ctx, "JamMasukMulai", "06:30")
	batasStr := s.pengaturanAmbil(ctx, "JamMasukBatasBaru", "")
	if batasStr == "" {
		batasStr = s.pengaturanAmbil(ctx, "JamMasukBatas", "07:15")
	}
	pulangStr := s.pengaturanAmbil(ctx, "JamPulangMinimalBaru", "")
	if pulangStr == "" {
		pulangStr = s.pengaturanAmbil(ctx, "JamPulangMinimal", "13:30")
	}

	var statusWaktu string
	var jamMasuk, jamPulang *time.Time
	if catatan, errStatus := s.absensiHarian.AmbilSatu(ctx, username, todayStr); errStatus == nil && catatan != nil {
		statusWaktu = catatan.StatusWaktu
		jamMasuk = catatan.JamMasuk
		jamPulang = catatan.JamPulang
	}

	if statusWaktu != "" && statusWaktu != "Hadir" {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Hari ini tercatat sebagai %s. Absensi tidak diperlukan.", statusWaktu),
		}, nil
	}

	sekarang := now.Hour()*60 + now.Minute()

	switch jenis {
	case "Masuk":
		if jamMasuk != nil {
			return map[string]interface{}{
				"success": false,
				"message": "Anda sudah absen masuk hari ini pukul " + jamMasuk.Format("15:04") + ".",
			}, nil
		}
		if sekarang < mulaiMenit {
			return map[string]interface{}{"success": false, "message": "Absen masuk dibuka pukul " + mulaiStr + "."}, nil
		}

		if sekarang > pulangMenit {
			return map[string]interface{}{"success": false, "message": "Absen masuk sudah ditutup pukul " + pulangStr + ". Hubungi kepala madrasah."}, nil
		}
	case "Pulang":
		if jamPulang != nil {
			return map[string]interface{}{
				"success": false,
				"message": "Anda sudah absen pulang hari ini pukul " + jamPulang.Format("15:04") + ".",
			}, nil
		}
		if jamMasuk == nil {
			return map[string]interface{}{"success": false, "message": "Absen pulang harus setelah absen masuk."}, nil
		}

	}

	filename, errName := namaFileAcak("absen_harian")
	if errName != nil {
		return nil, errName
	}
	fotoURL, errFoto := s.SimpanFoto(fotoB64, filename)
	if errFoto != nil {
		return nil, errFoto
	}
	linkMaps := fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%f,%f", lat, lng)
	jamStr := now.Format("15:04:05")

	menitTerlambat := 0
	terlambat := false
	if jenis == "Masuk" && sekarang > batasMenit {
		terlambat = true
		menitTerlambat = sekarang - batasMenit
	}

	err := s.absensiHarian.Simpan(ctx, absensiHarianInput{
		Tanggal:        todayStr,
		Username:       username,
		Nama:           nama,
		Jenis:          jenis,
		Jam:            jamStr,
		Terlambat:      terlambat,
		MenitTerlambat: menitTerlambat,
		Lat:            lat,
		Lng:            lng,
		Jarak:          int(jarak),
		FotoURL:        fotoURL,
		MapsURL:        linkMaps,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Gagal menyimpan absensi: " + err.Error()}, nil
	}

	pesan := "Absen " + jenis + " berhasil dicatat pukul " + now.Format("15:04") + "."
	if terlambat {
		pesan += fmt.Sprintf(" Tercatat terlambat %d menit.", menitTerlambat)
	}
	return map[string]interface{}{"success": true, "message": pesan}, nil
}

func (s *Service) GetRiwayatAbsensiHarian(ctx context.Context, requestedBy, username string, bulan, tahun int) (map[string]interface{}, error) {

	if !strings.EqualFold(requestedBy, username) && !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	catatan, err := s.absensiHarian.AmbilRiwayatBulanan(ctx, username, bulan, tahun)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, c := range catatan {
		item := map[string]interface{}{
			"tanggal":         c.Tanggal.Format("02/01/2006"),
			"hari":            namaHariDariTanggal(c.Tanggal),
			"statusWaktu":     c.StatusWaktu,
			"keterangan":      c.Keterangan,
			"statusTerlambat": c.Terlambat,
			"menitTerlambat":  c.MenitTerlambat,
			"jarakMasuk":      c.JarakMasuk,
			"jarakPulang":     c.JarakPulang,
			"fotoMasuk":       c.FotoMasuk,
			"fotoPulang":      c.FotoPulang,
			"jamMasuk":        nil,
			"jamPulang":       nil,
		}
		if c.JamMasuk != nil {
			item["jamMasuk"] = c.JamMasuk.Format("15:04:05")
		}
		if c.JamPulang != nil {
			item["jamPulang"] = c.JamPulang.Format("15:04:05")
		}
		data = append(data, item)
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) CatatAbsensiHarianManual(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	tanggal := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggal"]))
	statusWaktu := strings.TrimSpace(fmt.Sprintf("%v", payload["statusWaktu"]))
	keterangan := fmt.Sprintf("%v", payload["keterangan"])

	if username == "" || username == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Pilih pegawai terlebih dahulu."}, nil
	}
	if !validKategori[statusWaktu] {
		return map[string]interface{}{"success": false, "message": "Status harus Hadir, Izin, Sakit, Cuti, atau Alpa."}, nil
	}
	tgl, err := parseTanggalIndo(tanggal)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Tanggal tidak valid (format DD/MM/YYYY)."}, nil
	}
	if tgl.After(time.Now()) {
		return map[string]interface{}{"success": false, "message": "Tidak bisa mencatat kehadiran untuk tanggal mendatang."}, nil
	}

	recPengguna, err := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Pegawai tidak ditemukan."}, nil
	}

	in := absensiHarianManualInput{
		Tanggal:     tgl.Format("2006-01-02"),
		Username:    username,
		Nama:        recPengguna.NamaLengkap,
		StatusWaktu: statusWaktu,
		Keterangan:  keterangan,
		DicatatOleh: requestedBy,
	}
	if jam, ok := jamOpsiionalPayload(payload, "jamMasuk").(string); ok {
		in.JamMasuk = &jam
	}
	if jam, ok := jamOpsiionalPayload(payload, "jamPulang").(string); ok {
		in.JamPulang = &jam
	}
	if err := s.absensiHarian.SimpanManual(ctx, in); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	s.cacheFlushHonor(ctx)
	return map[string]interface{}{"success": true, "message": "Kehadiran berhasil dicatat"}, nil
}

