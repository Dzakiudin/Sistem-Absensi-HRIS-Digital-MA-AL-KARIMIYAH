package madrasah

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

func (s *Service) GetDaftarGuruUntukPengganti(ctx context.Context, username string) (map[string]interface{}, error) {
	guru, err := s.pengganti.DaftarGuruKecuali(ctx, username)
	if err != nil {
		return nil, err
	}
	data := []map[string]interface{}{}
	for _, g := range guru {
		data = append(data, map[string]interface{}{"username": g.Username, "namaLengkap": g.Nama})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) GetDaftarKonfirmasiPengganti(ctx context.Context, username string) ([]map[string]interface{}, error) {
	var namaLengkap string
	namaLengkap, _, _ = s.pengganti.InfoPengajuan(ctx, username)

	list := []map[string]interface{}{}

	slot, err := s.pengganti.SlotMenungguUntuk(ctx, namaLengkap, username)
	if err != nil {
		return nil, err
	}
	for _, rec := range slot {
		list = append(list, map[string]interface{}{
			"tipe":          "slot",
			"id":            rec.ID,
			"tanggal":       rec.Tanggal,
			"kategori":      rec.Kategori,
			"namaGuruAsli":  rec.NamaAsli,
			"mataPelajaran": rec.Mapel,
			"kelas":         rec.Kelas,
			"jamKe":         rec.JamKe,
			"keterangan":    rec.Keterangan,
		})
	}

	rentang, err := s.pengganti.RentangMenungguUntuk(ctx, username, namaLengkap)
	if err == nil {
		for _, rec := range rentang {
			list = append(list, map[string]interface{}{
				"tipe":           "rentang",
				"id":             rec.ID,
				"tanggal":        rec.TanggalMulai + " s.d. " + rec.TanggalSelesai,
				"kategori":       rec.Kategori,
				"namaGuruAsli":   rec.NamaAsli,
				"tanggalMulai":   rec.TanggalMulai,
				"tanggalSelesai": rec.TanggalSelesai,
				"keterangan":     rec.Keterangan,
			})
		}
	}

	return list, nil
}

func (s *Service) KonfirmasiPengganti(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	id, _ := strconv.Atoi(fmt.Sprintf("%v", payload["id"]))
	username := fmt.Sprintf("%v", payload["username"])
	lat, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["latitude"]), 64)
	lng, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["longitude"]), 64)
	fotoB64 := fmt.Sprintf("%v", payload["fotoBase64"])

	info, errInfo := s.GetInfoSekolah(ctx)
	if errInfo != nil || info == nil {
		return map[string]interface{}{"success": false, "message": "Data konfigurasi sekolah belum dapat dimuat. Coba beberapa saat lagi."}, nil
	}
	schoolLat, _ := info["latitudeSekolah"].(float64)
	schoolLng, _ := info["longitudeSekolah"].(float64)
	radius, _ := info["radiusMeter"].(float64)
	jarak := math.Round(HitungJarak(lat, lng, schoolLat, schoolLng))
	if jarak > radius {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda berada di luar radius sekolah (%d m > %d m). Konfirmasi ditolak.", int(jarak), int(radius)),
		}, nil
	}

	namaLengkap, _, _ := s.pengganti.InfoPengajuan(ctx, username)
	statusSekarang, _ := s.pengganti.StatusSlotMenunggu(ctx, id, namaLengkap, username)
	if statusSekarang != "Menunggu" {
		return map[string]interface{}{
			"success": false,
			"message": "Penggantian tidak ditemukan atau sudah diproses.",
		}, nil
	}

	filename, _ := namaFileAcak("pengganti")
	fotoURL, _ := s.SimpanFoto(fotoB64, filename)
	linkMaps := fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%f,%f", lat, lng)

	err := s.pengganti.KonfirmasiSlot(ctx, konfirmasiSlotPenggantiInput{
		ID:          id,
		Username:    username,
		NamaLengkap: namaLengkap,
		Latitude:    lat,
		Longitude:   lng,
		Jarak:       int(jarak),
		FotoURL:     fotoURL,
		LinkMaps:    linkMaps,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Konfirmasi kehadiran guru pengganti berhasil disimpan"}, nil
}

type penggantiRentang struct {
	id             int
	username       string
	namaLengkap    string
	kategori       string
	keterangan     string
	tanggalMulai   string
	tanggalSelesai string
	status         string
}

func (s *Service) rentangAktifUntuk(ctx context.Context, penggantiUsername string) []penggantiRentang {
	rows, err := s.pengganti.RentangAktifTerkonfirmasi(ctx, penggantiUsername)
	if err != nil {
		return nil
	}

	now := time.Now()
	list := []penggantiRentang{}
	for _, rec := range rows {
		tSelesai, err := parseTanggalIndo(rec.TanggalSelesai)
		if err != nil || tSelesai.Before(now.Truncate(24*time.Hour)) {
			continue
		}
		list = append(list, penggantiRentang{
			id:             rec.ID,
			username:       rec.Username,
			namaLengkap:    rec.NamaLengkap,
			kategori:       rec.Kategori,
			keterangan:     rec.Keterangan,
			tanggalMulai:   rec.TanggalMulai,
			tanggalSelesai: rec.TanggalSelesai,
			status:         rec.Status,
		})
	}
	return list
}

func daftarHariDalamRentang(mulai, selesai string) []string {
	t1, err1 := parseTanggalIndo(mulai)
	t2, err2 := parseTanggalIndo(selesai)
	if err1 != nil || err2 != nil {
		return nil
	}
	if t2.Before(t1) {
		return nil
	}
	seen := map[string]bool{}
	hari := []string{}
	for cur := t1; !cur.After(t2); cur = cur.AddDate(0, 0, 1) {
		nama := NamaHariIndo(cur.Weekday())
		if !seen[nama] {
			seen[nama] = true
			hari = append(hari, nama)
		}
	}
	return hari
}

func (s *Service) sesiPenggantiRentangDalamBulan(ctx context.Context, penggantiUsername string, bulan, tahun int) int {
	total := 0

	awalBulan := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
	akhirBulan := time.Date(tahun, time.Month(bulan)+1, 0, 0, 0, 0, 0, time.Local)
	tsAwal := awalBulan.Format("02/01/2006")
	tsAkhir := akhirBulan.Format("02/01/2006")

	rentangRows, err := s.pengganti.RentangTerkonfirmasiMenyentuh(ctx, penggantiUsername, tsAkhir, tsAwal)
	if err != nil {
		return 0
	}
	if len(rentangRows) == 0 {
		return 0
	}

	jmhPerHari := map[string]map[string]int{}
	{
		guruSet := map[string]bool{}
		for _, r := range rentangRows {
			guruSet[r.Username] = true
		}
		keys := []string{}
		for k := range guruSet {
			keys = append(keys, k)
		}
		jadwal, err := s.rekap.JadwalHariJumlah(ctx, lowercaseSlice(keys))
		if err == nil {
			for _, j := range jadwal {
				if jmhPerHari[j.Username] == nil {
					jmhPerHari[j.Username] = map[string]int{}
				}
				jmhPerHari[j.Username][strings.ToLower(j.Hari)] = j.Jumlah
			}
		}
	}

	liburSet := map[string]bool{}
	{
		yyyy := fmt.Sprintf("%d", tahun)
		mm := fmt.Sprintf("%02d", bulan)
		tanggals, err := s.hariLibur.TanggalDalamBulan(ctx, mm, yyyy)
		if err == nil {
			for _, t := range tanggals {
				liburSet[t] = true
			}
		}
	}

	mingguLibur, _ := s.pengaturan.AmbilNilai(ctx, "MingguLibur")

	for _, r := range rentangRows {
		mulai, errM := parseTanggalIndo(r.Mulai)
		selesai, errS := parseTanggalIndo(r.Selesai)
		if errM != nil || errS != nil {
			continue
		}
		from := mulai
		if awalBulan.After(from) {
			from = awalBulan
		}
		to := selesai
		if akhirBulan.Before(to) {
			to = akhirBulan
		}
		m := jmhPerHari[r.Username]
		for cur := from; !cur.After(to); cur = cur.AddDate(0, 0, 1) {
			ts := cur.Format("02/01/2006")
			if liburSet[ts] {
				continue
			}
			if cur.Weekday() == time.Sunday && IsMingguLibur(mingguLibur) {
				continue
			}
			if m != nil {
				total += m[strings.ToLower(NamaHariIndo(cur.Weekday()))]
			}
		}
	}
	return total
}

func (s *Service) rekapPenggantiRentangBulan(ctx context.Context, bulan, tahun int) map[string]int {
	hasil := map[string]int{}

	awalBulan := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
	akhirBulan := time.Date(tahun, time.Month(bulan)+1, 0, 0, 0, 0, 0, time.Local)
	tsAwal := awalBulan.Format("02/01/2006")
	tsAkhir := akhirBulan.Format("02/01/2006")

	rows, err := s.rekap.RentangPenggantiTerkonfirmasi(ctx, tsAkhir, tsAwal)
	if err != nil {
		return hasil
	}

	type r struct {
		aUser, bUser, mulai, selesai string
	}
	rentangs := []r{}
	guruSet := map[string]bool{}
	for _, rec := range rows {
		rentangs = append(rentangs, r{rec.Username, rec.GuruPengganti, rec.Mulai, rec.Selesai})
		guruSet[rec.Username] = true
	}

	if len(rentangs) == 0 {
		return hasil
	}

	jmh := map[string]map[string]int{}
	{
		keys := []string{}
		for k := range guruSet {
			keys = append(keys, k)
		}
		rowsJadwal, err := s.rekap.JadwalHariJumlah(ctx, lowercaseSlice(keys))
		if err == nil {
			for _, rec := range rowsJadwal {
				if jmh[rec.Username] == nil {
					jmh[rec.Username] = map[string]int{}
				}
				jmh[rec.Username][strings.ToLower(rec.Hari)] = rec.Jumlah
			}
		}
	}

	liburSet := map[string]bool{}
	{
		yyyy := fmt.Sprintf("%d", tahun)
		mm := fmt.Sprintf("%02d", bulan)
		tanggals, err := s.hariLibur.TanggalDalamBulan(ctx, mm, yyyy)
		if err == nil {
			for _, t := range tanggals {
				liburSet[t] = true
			}
		}
	}

	mingguLibur, _ := s.pengaturan.AmbilNilai(ctx, "MingguLibur")

	for _, x := range rentangs {
		mulai, errM := parseTanggalIndo(x.mulai)
		selesai, errS := parseTanggalIndo(x.selesai)
		if errM != nil || errS != nil {
			continue
		}
		from := mulai
		if awalBulan.After(from) {
			from = awalBulan
		}
		to := selesai
		if akhirBulan.Before(to) {
			to = akhirBulan
		}
		total := 0
		for cur := from; !cur.After(to); cur = cur.AddDate(0, 0, 1) {
			ts := cur.Format("02/01/2006")
			if liburSet[ts] {
				continue
			}
			if cur.Weekday() == time.Sunday && IsMingguLibur(mingguLibur) {
				continue
			}
			if m := jmh[x.aUser]; m != nil {
				total += m[strings.ToLower(NamaHariIndo(cur.Weekday()))]
			}
		}
		if total > 0 {
			hasil[x.bUser] += total
		}
	}
	return hasil
}

func lowercaseSlice(items []string) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, strings.ToLower(strings.TrimSpace(it)))
	}
	return out
}

func (s *Service) AjukanPenggantiRentang(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	role := s.roleUser(ctx, username)
	if username == "" || (role != "guru" && role != "admin" && role != "kepala" && role != "staf") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	kategori := strings.TrimSpace(fmt.Sprintf("%v", payload["kategori"]))
	if !validKategori[kategori] || kategori == "Hadir" || kategori == "Alpa" {
		return map[string]interface{}{
			"success": false,
			"message": "Kategori izin tidak valid. Pilih Izin, Sakit, atau Cuti.",
		}, nil
	}

	guruPenggantiUsername := strings.TrimSpace(fmt.Sprintf("%v", payload["guruPenggantiUsername"]))
	guruPenggantiNama := strings.TrimSpace(fmt.Sprintf("%v", payload["guruPenggantiNama"]))
	if guruPenggantiUsername == "" {
		return map[string]interface{}{"success": false, "message": "Guru pengganti wajib dipilih"}, nil
	}
	if guruPenggantiUsername == username {
		return map[string]interface{}{"success": false, "message": "Guru pengganti tidak boleh diri sendiri"}, nil
	}

	tanggalMulai := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalMulai"]))
	tanggalSelesai := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalSelesai"]))
	t1, err1 := parseTanggalIndo(tanggalMulai)
	t2, err2 := parseTanggalIndo(tanggalSelesai)
	if err1 != nil || err2 != nil {
		return map[string]interface{}{"success": false, "message": "Format rentang tanggal harus dd/MM/yyyy"}, nil
	}
	if t2.Before(t1) {
		return map[string]interface{}{"success": false, "message": "Tanggal selesai tidak boleh sebelum tanggal mulai"}, nil
	}
	if t1.Before(time.Now().Truncate(24 * time.Hour)) {
		return map[string]interface{}{"success": false, "message": "Tanggal mulai tidak boleh di masa lalu"}, nil
	}

	okPengganti, _ := s.pengganti.GuruAktifAda(ctx, guruPenggantiUsername)
	if !okPengganti {
		return map[string]interface{}{"success": false, "message": "Guru pengganti tidak ditemukan atau tidak aktif"}, nil
	}

	bentrok, _ := s.pengganti.RentangBentrokAda(ctx, username, tanggalSelesai, tanggalMulai)
	if bentrok {
		return map[string]interface{}{"success": false, "message": "Anda sudah memiliki permintaan penggantian pada rentang yang sama"}, nil
	}

	namaLengkap, izinkanPengganti, _ := s.pengganti.InfoPengajuan(ctx, username)
	if !izinkanPengganti {
		return map[string]interface{}{"success": false, "message": "Anda tidak memiliki izin untuk menggunakan fitur guru pengganti. Silakan hubungi Admin."}, nil
	}
	keterangan := strings.TrimSpace(fmt.Sprintf("%v", payload["keterangan"]))

	err := s.pengganti.SimpanPengajuanRentang(ctx, penggantiRentangInput{
		Username:          username,
		NamaLengkap:       namaLengkap,
		GuruPengganti:     guruPenggantiUsername,
		GuruPenggantiNama: guruPenggantiNama,
		Kategori:          kategori,
		Keterangan:        keterangan,
		TanggalMulai:      tanggalMulai,
		TanggalSelesai:    tanggalSelesai,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{
		"success": true,
		"message": "Permintaan guru pengganti utk rentang tanggal berhasil diajukan. Menunggu konfirmasi guru pengganti.",
	}, nil
}

func (s *Service) GetPenggantiRentangSaya(ctx context.Context, username string) (map[string]interface{}, error) {
	rows, err := s.pengganti.RentangSaya(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	now := time.Now()
	hariIni := now.Truncate(24 * time.Hour)
	list := []map[string]interface{}{}
	for _, rec := range rows {
		statusTampil := rec.Status
		if rec.Status == "Terkonfirmasi" {
			if tSelesai, err := parseTanggalIndo(rec.TanggalSelesai); err == nil && tSelesai.Before(hariIni) {
				statusTampil = "Selesai"
			}
		}
		list = append(list, map[string]interface{}{
			"id":                    rec.ID,
			"guruPenggantiUsername": rec.GuruPenggantiUsername,
			"guruPenggantiNama":     rec.GuruPenggantiNama,
			"kategori":              rec.Kategori,
			"keterangan":            rec.Keterangan,
			"tanggalMulai":          rec.TanggalMulai,
			"tanggalSelesai":        rec.TanggalSelesai,
			"status":                statusTampil,
		})
	}
	return map[string]interface{}{"success": true, "data": list}, nil
}

func (s *Service) BatalkanPenggantiRentang(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	id, _ := strconv.Atoi(fmt.Sprintf("%v", payload["id"]))
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	if username == "" {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	pemilik, status, _ := s.pengganti.AmbilPemilikRentang(ctx, id)
	if status == "" {
		return map[string]interface{}{"success": false, "message": "Permintaan tidak ditemukan"}, nil
	}
	if pemilik != username && !s.CheckAccess(ctx, username, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if status == "Terkonfirmasi" || status == "Menunggu" {
		err := s.pengganti.BatalkanRentang(ctx, id)
		if err != nil {
			return map[string]interface{}{"success": false, "message": err.Error()}, nil
		}
		return map[string]interface{}{"success": true, "message": "Permintaan penggantian dibatalkan"}, nil
	}
	return map[string]interface{}{"success": false, "message": "Permintaan sudah diproses dan tidak dapat dibatalkan"}, nil
}

func (s *Service) KonfirmasiPenggantiRentang(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	id, _ := strconv.Atoi(fmt.Sprintf("%v", payload["id"]))
	username := fmt.Sprintf("%v", payload["username"])
	lat, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["latitude"]), 64)
	lng, _ := strconv.ParseFloat(fmt.Sprintf("%v", payload["longitude"]), 64)
	fotoB64 := fmt.Sprintf("%v", payload["fotoBase64"])

	info, errInfo := s.GetInfoSekolah(ctx)
	if errInfo != nil || info == nil {
		return map[string]interface{}{"success": false, "message": "Data konfigurasi sekolah belum dapat dimuat. Coba beberapa saat lagi."}, nil
	}
	schoolLat, _ := info["latitudeSekolah"].(float64)
	schoolLng, _ := info["longitudeSekolah"].(float64)
	radius, _ := info["radiusMeter"].(float64)
	jarak := math.Round(HitungJarak(lat, lng, schoolLat, schoolLng))
	if jarak > radius {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Anda berada di luar radius sekolah (%d m > %d m). Konfirmasi ditolak.", int(jarak), int(radius)),
		}, nil
	}

	statusSekarang, _ := s.pengganti.StatusRentangMenunggu(ctx, id, username)
	if statusSekarang != "Menunggu" {
		return map[string]interface{}{
			"success": false,
			"message": "Penggantian tidak ditemukan atau sudah diproses.",
		}, nil
	}

	filename, _ := namaFileAcak("pengganti_rentang")
	fotoURL, _ := s.SimpanFoto(fotoB64, filename)
	linkMaps := fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%f,%f", lat, lng)

	err := s.pengganti.KonfirmasiRentang(ctx, konfirmasiRentangInput{
		ID:        id,
		Username:  username,
		Latitude:  lat,
		Longitude: lng,
		Jarak:     int(jarak),
		FotoURL:   fotoURL,
		LinkMaps:  linkMaps,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Konfirmasi guru pengganti rentang berhasil disimpan. Jadwal & honor akan dihitung otomatis."}, nil
}
