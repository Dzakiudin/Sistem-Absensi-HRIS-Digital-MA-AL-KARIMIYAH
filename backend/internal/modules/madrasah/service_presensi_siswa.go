package madrasah

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

func (s *Service) GetRosterPresensi(ctx context.Context, username, tanggal, kelas, jamKe string) (map[string]interface{}, error) {
	role := s.roleUser(ctx, username)
	if role != "guru" && role != "staf" && role != "admin" && role != "kepala" {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	kelas = strings.TrimSpace(kelas)
	jamKe = strings.TrimSpace(jamKe)

	jamKeLookup := jamKe
	if idx := strings.Index(jamKe, "-"); idx > 0 {
		jamKeLookup = jamKe[:idx]
	}
	tanggalT, err := parseTanggalIndo(tanggal)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Format tanggal harus dd/MM/yyyy"}, nil
	}

	kelasId, _ := s.kelas.CariIDByLabel(ctx, kelas)
	if kelasId == 0 {
		return map[string]interface{}{"success": false, "message": "Kelas tidak ditemukan di master data"}, nil
	}

	hariNama := NamaHariIndo(tanggalT.Weekday())
	var jadwalId int
	var mapel string
	if role != "staf" {
		jadwalId, mapel, err = s.presensiSiswa.CariJadwalGuru(ctx, username, hariNama, kelas, jamKeLookup)
		if err != nil {
			return nil, err
		}
	}

	if jadwalId == 0 {
		jadwalId, mapel, err = s.presensiSiswa.CariJadwalSesiPengganti(
			ctx, username, tanggalT.Format("02/01/2006"), kelas, jamKeLookup,
		)
		if err != nil {
			return nil, err
		}
	}

	if jadwalId == 0 {
		tanggalStr := tanggalT.Format("02/01/2006")
		jadwalId, mapel, err = s.presensiSiswa.CariJadwalPenggantiRentang(ctx, username, hariNama, kelas, jamKeLookup, tanggalStr)
		if err != nil {
			return nil, err
		}
	}
	if role == "staf" && jadwalId == 0 {
		return map[string]interface{}{"success": false, "message": "Jadwal presensi hanya tersedia saat Anda ditugaskan sebagai guru pengganti."}, nil
	}

	ta := s.tahunAjaranAktif(ctx)
	taId := interfaceToInt(ta["id"])
	if taId == 0 {
		return map[string]interface{}{"success": false, "message": "Belum ada tahun ajaran aktif. Hubungi admin."}, nil
	}

	roster, err := s.presensiSiswa.RosterSiswa(ctx, taId, kelasId, tanggalT, jamKeLookup)
	if err != nil {
		return nil, err
	}

	daftar := []map[string]interface{}{}
	for _, b := range roster {
		daftar = append(daftar, map[string]interface{}{
			"id":           b.ID,
			"nis":          b.NIS,
			"nisn":         b.NISN,
			"namaLengkap":  b.NamaLengkap,
			"jenisKelamin": b.JenisKelamin,
			"status":       b.Status,
			"keterangan":   b.Keterangan,
		})
	}

	sudahDicatat, err := s.presensiSiswa.HitungSudahDicatat(ctx, kelasId, tanggalT, jamKeLookup)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":       true,
		"tanggal":       tanggalT.Format("02/01/2006"),
		"hari":          hariNama,
		"kelas":         kelas,
		"kelasId":       kelasId,
		"jamKe":         jamKe,
		"mataPelajaran": mapel,
		"jadwalId":      jadwalId,
		"guru":          username,
		"siswa":         daftar,
		"sudahDicatat":  sudahDicatat,
	}, nil
}

func (s *Service) CatatAbsensiSiswa(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	editor := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	role := s.roleUser(ctx, editor)
	if editor == "" || (role != "guru" && role != "staf" && role != "admin" && role != "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	tanggal := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggal"]))
	jamKe := strings.TrimSpace(fmt.Sprintf("%v", payload["jamKe"]))
	jamKeLookup := jamKe
	if idx := strings.Index(jamKe, "-"); idx > 0 {
		jamKeLookup = jamKe[:idx]
	}
	kelas := strings.TrimSpace(fmt.Sprintf("%v", payload["kelas"]))
	mapel := strings.TrimSpace(fmt.Sprintf("%v", payload["mataPelajaran"]))
	jadwalId := interfaceToInt(payload["jadwalId"])

	tanggalT, err := parseTanggalIndo(tanggal)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Format tanggal harus dd/MM/yyyy"}, nil
	}
	if jamKe == "" {
		return map[string]interface{}{"success": false, "message": "Jam ke harus diisi"}, nil
	}

	kelasId, _ := s.kelas.CariIDByLabel(ctx, kelas)
	if kelasId == 0 {
		return map[string]interface{}{"success": false, "message": "Kelas tidak ditemukan di master data"}, nil
	}

	if role == "staf" {
		hari := NamaHariIndo(tanggalT.Weekday())
		jadwalId, _, err := s.presensiSiswa.CariJadwalSesiPengganti(
			ctx, editor, tanggalT.Format("02/01/2006"), kelas, jamKeLookup,
		)
		if err != nil {
			return nil, err
		}
		if jadwalId == 0 {
			jadwalId, _, err = s.presensiSiswa.CariJadwalPenggantiRentang(
				ctx, editor, hari, kelas, jamKeLookup, tanggalT.Format("02/01/2006"),
			)
			if err != nil {
				return nil, err
			}
		}
		if jadwalId == 0 || jadwalId != interfaceToInt(payload["jadwalId"]) {
			return map[string]interface{}{"success": false, "message": "Anda tidak ditugaskan sebagai pengganti pada jadwal ini."}, nil
		}
	}

	items, ok := payload["items"].([]interface{})
	if !ok {
		return map[string]interface{}{"success": false, "message": "Data presensi (items) wajib dikirim"}, nil
	}

	hitung := map[string]int{"H": 0, "I": 0, "S": 0, "A": 0, "T": 0}
	tersimpan := 0
	baris := []presensiSiswaItem{}
	for _, raw := range items {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		siswaId := interfaceToInt(item["siswaId"])
		if siswaId == 0 {
			continue
		}
		st := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", item["status"])))
		if st == "" || st == "<nil>" || !statusSiswaValid[st] {
			st = "H"
		}
		ket := strings.TrimSpace(fmt.Sprintf("%v", item["keterangan"]))
		if ket == "<nil>" {
			ket = ""
		}

		baris = append(baris, presensiSiswaItem{
			SiswaID:       siswaId,
			KelasID:       kelasId,
			JadwalID:      jadwalId,
			Tanggal:       tanggalT,
			JamKe:         jamKe,
			MataPelajaran: mapel,
			Guru:          editor,
			Status:        st,
			Keterangan:    ket,
			Editor:        editor,
		})
		hitung[st]++
		tersimpan++
	}

	if err := s.presensiSiswa.SimpanBulk(ctx, presensiSiswaInput{Items: baris}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushRekap(ctx)

	return map[string]interface{}{
		"success":  true,
		"message":  fmt.Sprintf("Presensi kelas %s jam ke-%s tersimpan (%d siswa)", kelas, jamKe, tersimpan),
		"tercatat": tersimpan,
		"hadir":    hitung["H"],
		"izin":     hitung["I"],
		"sakit":    hitung["S"],
		"alpa":     hitung["A"],
		"telat":    hitung["T"],
	}, nil
}

func (s *Service) GetRekapPresensiSiswa(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	role := s.roleUser(ctx, requestedBy)
	if requestedBy == "" || (role != "admin" && role != "kepala" && role != "guru") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	kelasId := interfaceToInt(payload["kelasId"])
	bulan := interfaceToInt(payload["bulan"])
	tahun := interfaceToInt(payload["tahun"])
	tglMulaiStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalMulai"]))
	tglAkhirStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalAkhir"]))
	filterGuru := strings.TrimSpace(fmt.Sprintf("%v", payload["guru"]))
	filterMapel := strings.TrimSpace(fmt.Sprintf("%v", payload["mapel"]))
	if filterGuru == "<nil>" {
		filterGuru = ""
	}
	if filterMapel == "<nil>" {
		filterMapel = ""
	}

	now := time.Now()
	if tahun == 0 {
		tahun = now.Year()
	}
	if bulan == 0 {
		bulan = int(now.Month())
	}

	var mulai, selesai time.Time
	if tglMulaiStr != "" && tglMulaiStr != "<nil>" && tglAkhirStr != "" && tglAkhirStr != "<nil>" {
		ml, err1 := parseTanggalIndo(tglMulaiStr)
		mk, err2 := parseTanggalIndo(tglAkhirStr)
		if err1 != nil || err2 != nil {
			return map[string]interface{}{"success": false, "message": "Format rentang tanggal salah"}, nil
		}
		mulai, selesai = ml, mk
	} else {
		mulai = time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
		selesai = mulai.AddDate(0, 1, -1)
	}

	kelasTerlarang := false
	waliID := 0
	if role == "guru" {
		uid, err := s.pengguna.IDByUsername(ctx, requestedBy)
		if err != nil {
			return nil, err
		}
		waliID = uid
		cek, err := s.kelas.HitungWaliKelas(ctx, uid)
		if err != nil {
			return nil, err
		}
		if cek == 0 {
			return map[string]interface{}{"success": false, "message": "Anda bukan wali kelas, hanya kepala/admin yang dapat membuka rekap"}, nil
		}
		if kelasId > 0 {
			ada, err := s.kelas.ApakahWaliKelasID(ctx, kelasId, uid)
			if err != nil {
				return nil, err
			}
			if !ada {
				return map[string]interface{}{"success": false, "message": "Anda hanya dapat melihat rekap kelas wali kelas Anda"}, nil
			}
		}
		kelasTerlarang = true
	}

	ta := s.tahunAjaranAktif(ctx)
	taId := interfaceToInt(ta["id"])

	baris, err := s.presensiSiswa.RekapRentang(ctx, rekapSiswaFilter{
		TahunAjaranID: taId,
		Mulai:         mulai,
		Selesai:       selesai,
		KelasID:       kelasId,
		WaliID:        waliID,
		Guru:          filterGuru,
		Mapel:         filterMapel,
	})
	if err != nil {
		return nil, err
	}

	cacheKey := fmt.Sprintf("%s%s:k%d:%s:%s:g%s:m%s",
		cacheRekapPrefix, role, kelasId, mulai.Format("20060102"), selesai.Format("20060102"),
		filterGuru, filterMapel)
	if kelasTerlarang && kelasId == 0 {
		cacheKey += fmt.Sprintf(":u%d", waliID)
	}
	if raw, ok := s.cacheGet(ctx, cacheKey); ok {
		var cached map[string]interface{}
		if json.Unmarshal([]byte(raw), &cached) == nil {
			return cached, nil
		}
	}

	perKelas := map[int]*map[string]interface{}{}
	for _, b := range baris {
		ket, ok := perKelas[b.KelasID]
		if !ok {
			ket = &map[string]interface{}{
				"kelasId":   b.KelasID,
				"kodeKelas": b.KodeKelas,
				"siswa":     []map[string]interface{}{},
				"totalH":    int64(0), "totalI": int64(0), "totalS": int64(0), "totalA": int64(0), "totalT": int64(0), "totalSS": int64(0),
			}
			perKelas[b.KelasID] = ket
		}
		(*ket)["totalH"] = (*ket)["totalH"].(int64) + b.H
		(*ket)["totalI"] = (*ket)["totalI"].(int64) + b.I
		(*ket)["totalS"] = (*ket)["totalS"].(int64) + b.S
		(*ket)["totalA"] = (*ket)["totalA"].(int64) + b.A
		(*ket)["totalT"] = (*ket)["totalT"].(int64) + b.T
		(*ket)["totalSS"] = (*ket)["totalSS"].(int64) + 1

		persen := 0.0
		if b.Total > 0 {
			persen = math.Round(float64(b.H) * 100 / float64(b.Total))
		}
		daftar := (*ket)["siswa"].([]map[string]interface{})
		daftar = append(daftar, map[string]interface{}{
			"siswaId": b.SiswaID,
			"nis":     b.NIS,
			"nama":    b.Nama,
			"jk":      b.JK,
			"hadir":   b.H,
			"izin":    b.I,
			"sakit":   b.S,
			"alpa":    b.A,
			"telat":   b.T,
			"total":   b.Total,
			"persen":  persen,
		})
		(*ket)["siswa"] = daftar
	}

	hasil := []map[string]interface{}{}
	for _, v := range perKelas {
		hasil = append(hasil, *v)
	}

	sortByKelasId(hasil)

	res := map[string]interface{}{"success": true, "data": hasil, "tahunAjaran": ta}
	if b, err := json.Marshal(res); err == nil {
		s.cacheSet(ctx, cacheKey, string(b))
	}
	return res, nil
}

func (s *Service) GetRiwayatPresensiTanggal(ctx context.Context, requestedBy, tanggal string) (map[string]interface{}, error) {
	role := s.roleUser(ctx, requestedBy)
	if requestedBy == "" || (role != "admin" && role != "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	tanggalT, err := parseTanggalIndo(tanggal)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Format tanggal harus dd/MM/yyyy"}, nil
	}

	riwayat, err := s.presensiSiswa.RiwayatTanggal(ctx, tanggalT)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, b := range riwayat {
		data = append(data, map[string]interface{}{
			"kelas":         b.KodeKelas,
			"jamKe":         b.JamKe,
			"mataPelajaran": b.MataPelajaran,
			"guru":          b.Guru,
			"hadir":         b.H,
			"izin":          b.I,
			"sakit":         b.S,
			"alpa":          b.A,
			"telat":         b.T,
			"total":         b.Total,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) GetStatistikKehadiranSiswa(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	role := s.roleUser(ctx, requestedBy)
	if requestedBy == "" || (role != "admin" && role != "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	bulan := interfaceToInt(payload["bulan"])
	tahun := interfaceToInt(payload["tahun"])
	kelasId := interfaceToInt(payload["kelasId"])
	tglMulaiStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalMulai"]))
	tglAkhirStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalAkhir"]))
	filterGuru := strings.TrimSpace(fmt.Sprintf("%v", payload["guru"]))
	filterMapel := strings.TrimSpace(fmt.Sprintf("%v", payload["mapel"]))
	if filterGuru == "<nil>" {
		filterGuru = ""
	}
	if filterMapel == "<nil>" {
		filterMapel = ""
	}

	now := time.Now()
	if tahun == 0 {
		tahun = now.Year()
	}
	if bulan == 0 {
		bulan = int(now.Month())
	}

	var mulai, selesai time.Time
	if tglMulaiStr != "" && tglMulaiStr != "<nil>" && tglAkhirStr != "" && tglAkhirStr != "<nil>" {
		ml, err1 := parseTanggalIndo(tglMulaiStr)
		mk, err2 := parseTanggalIndo(tglAkhirStr)
		if err1 != nil || err2 != nil {
			return map[string]interface{}{"success": false, "message": "Format rentang tanggal salah"}, nil
		}
		mulai, selesai = ml, mk
	} else {
		mulai = time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
		selesai = mulai.AddDate(0, 1, -1)
	}

	rows, err := s.presensiSiswa.StatistikKehadiranRentang(ctx, mulai, selesai)
	if err != nil {
		return nil, err
	}

	var (
		totalH, totalI, totalS, totalA, totalT, totalAll int64
	)
	perHari := map[string]*[6]int64{}
	perKelas := map[string]*[6]int64{}
	perMapel := map[string]*[6]int64{}
	perGuru := map[string]*[6]int64{}

	tambah := func(dst map[string]*[6]int64, key string, h, i, s, a, t int64) {
		v, ok := dst[key]
		if !ok {
			v = &[6]int64{}
			dst[key] = v
		}
		v[0] += h
		v[1] += i
		v[2] += s
		v[3] += a
		v[4] += t
		v[5] += h + i + s + a + t
	}

	for _, b := range rows {
		if kelasId > 0 && int64(kelasId) != b.KelasID {
			continue
		}
		if filterGuru != "" && !strings.EqualFold(b.Guru, filterGuru) {
			continue
		}
		if filterMapel != "" && !strings.Contains(strings.ToLower(b.Mapel), strings.ToLower(filterMapel)) {
			continue
		}
		totalH += b.H
		totalI += b.I
		totalS += b.S
		totalA += b.A
		totalT += b.T
		totalAll += b.H + b.I + b.S + b.A + b.T

		tambah(perHari, b.Tanggal.Format("02/01/2006"), b.H, b.I, b.S, b.A, b.T)
		tambah(perKelas, b.KodeKelas, b.H, b.I, b.S, b.A, b.T)
		tambah(perMapel, b.Mapel, b.H, b.I, b.S, b.A, b.T)
		tambah(perGuru, b.Guru, b.H, b.I, b.S, b.A, b.T)
	}

	hariman := map[string]interface{}{}
	for k, v := range perHari {
		hariman[k] = map[string]interface{}{
			"tanggal": k, "hadir": v[0], "izin": v[1], "sakit": v[2],
			"alpa": v[3], "telat": v[4], "total": v[5],
		}
	}
	ormap := func(dst map[string]*[6]int64) []map[string]interface{} {
		out := []map[string]interface{}{}
		keys := make([]string, 0, len(dst))
		for k := range dst {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			v := dst[k]
			out = append(out, map[string]interface{}{
				"label":   k,
				"tanggal": k,
				"nama":    k,
				"hadir":   v[0], "izin": v[1], "sakit": v[2], "alpa": v[3], "telat": v[4], "total": v[5],
			})
		}
		return out
	}

	persenHadir := 0.0
	if totalAll > 0 {
		persenHadir = math.Round(float64(totalH) * 100 / float64(totalAll))
	}

	return map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"mulai":   mulai.Format("02/01/2006"),
			"selesai": selesai.Format("02/01/2006"),
			"ringkasan": map[string]interface{}{
				"hadir": totalH, "izin": totalI, "sakit": totalS,
				"alpa": totalA, "telat": totalT, "total": totalAll,
				"persenHadir": persenHadir,
			},
			"perHari":  ormap(perHari),
			"perKelas": ormap(perKelas),
			"perMapel": ormap(perMapel),
			"perGuru":  ormap(perGuru),
		},
	}, nil
}
