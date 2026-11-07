package madrasah

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

func isGuruBKMapel(mapel string) bool {
	m := strings.ToLower(strings.TrimSpace(mapel))
	if m == "" || m == "-" {
		return false
	}
	if m == "bk" || m == "koord bk" || m == "koordinator bk" || m == "guru bk" ||
		strings.Contains(m, "bimbingan") || strings.Contains(m, "konseling") {
		return true
	}
	for _, tok := range strings.FieldsFunc(m, func(r rune) bool {
		return r == ' ' || r == ',' || r == '/' || r == '-' || r == '.' || r == '(' || r == ')'
	}) {
		if tok == "bk" {
			return true
		}
	}
	return false
}

func (s *Service) isGuruBK(ctx context.Context, username string) bool {
	if username == "" || s.pengguna == nil {
		return false
	}
	p, err := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if err != nil || p == nil || p.Status != "Aktif" {
		return false
	}
	if strings.EqualFold(p.Role, "bk") {
		return true
	}
	return isGuruBKMapel(p.MataPelajaran)
}

func (s *Service) bisaAksesBK(ctx context.Context, username string) bool {
	if username == "" {
		return false
	}
	if s.isGuruBK(ctx, username) {
		return true
	}
	return s.CheckAccess(ctx, username, "adminKepala")
}

func isKecamatanKepulauan(kec string) bool {
	k := strings.ToLower(strings.TrimSpace(kec))
	if k == "" {
		return false
	}
	kepulauan := []string{
		"sapeken", "masalembu", "raas", "arjasa", "kangayan",
		"giligenting", "gili genting", "talango", "nonggunong", "gayam",
	}
	for _, p := range kepulauan {
		if strings.Contains(k, p) {
			return true
		}
	}
	return false
}

func formatCatatanBKList(rows []catatanBKRow) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]interface{}{
			"id":             r.ID,
			"siswaId":        r.SiswaID,
			"nis":            r.NIS,
			"namaSiswa":      r.NamaSiswa,
			"jenisKelamin":   r.JenisKelamin,
			"kelas":          r.Kelas,
			"yatim":          r.Yatim,
			"mark":           r.Mark,
			"tanggal":        r.Tanggal.Format("02/01/2006"),
			"tanggalISO":     r.Tanggal.Format("2006-01-02"),
			"kategori":       r.Kategori,
			"tindakLanjut":   r.TindakLanjut,
			"catatan":        r.Catatan,
			"status":         r.Status,
			"guruBkUsername": r.GuruBKUsername,
			"guruBkNama":     r.GuruBKNama,
			"createdAt":      r.CreatedAt.Format("02/01/2006 15:04"),
		})
	}
	return out
}

func (s *Service) GetDashboardBK(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.bisaAksesBK(ctx, requestedBy) {
		return map[string]interface{}{"success": false, "message": "Akses ditolak. Fitur ini khusus Guru BK."}, nil
	}

	tglMulaiStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalMulai"]))
	tglAkhirStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalAkhir"]))
	now := time.Now()
	mulai := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
	selesai := mulai.AddDate(0, 1, -1)

	if tglMulaiStr != "" && tglMulaiStr != "<nil>" && tglAkhirStr != "" && tglAkhirStr != "<nil>" {
		if ml, err1 := parseTanggalIndo(tglMulaiStr); err1 == nil {
			if mk, err2 := parseTanggalIndo(tglAkhirStr); err2 == nil && !mk.Before(ml) {
				mulai, selesai = ml, mk
			}
		}
	}

	var siswaRows []siswaListRow
	if s.siswa != nil {
		rows, _, err := s.siswa.Daftar(ctx, siswaFilter{Paginate: false})
		if err != nil {
			return nil, err
		}
		siswaRows = rows
	}

	var ta map[string]interface{}
	if s.tahunAjaran != nil {
		ta = s.tahunAjaranAktif(ctx)
	}
	taID := interfaceToInt(ta["id"])

	rekapBySiswa := map[int]rekapSiswaRow{}
	if s.presensiSiswa != nil && taID > 0 {
		rekapRows, err := s.presensiSiswa.RekapRentang(ctx, rekapSiswaFilter{
			TahunAjaranID: taID,
			Mulai:         mulai,
			Selesai:       selesai,
		})
		if err == nil {
			for _, r := range rekapRows {
				rekapBySiswa[r.SiswaID] = r
			}
		}
	}

	catatanPerSiswa := map[int]int{}
	totalCatatanBK := 0
	catatanAktif := 0
	if s.bk != nil {
		perSiswa, tot, akt, err := s.bk.HitungCatatanPerSiswa(ctx)
		if err == nil {
			catatanPerSiswa = perSiswa
			totalCatatanBK = tot
			catatanAktif = akt
		}
	}

	totalSiswa := 0
	totalYatim := 0
	totalLuar := 0
	totalKepulauan := 0
	siswaKritis := 0
	siswaWaspada := 0
	siswaPantauan := 0
	var totalAlfaBulanIni int64
	var totalTelatBulanIni int64

	type bkSiswaItem struct {
		skor int
		nama string
		data map[string]interface{}
	}
	items := make([]bkSiswaItem, 0, len(siswaRows))

	for _, sr := range siswaRows {
		if sr.Status != "" && !strings.EqualFold(sr.Status, "Aktif") {
			continue
		}
		totalSiswa++

		isYatim := sr.Yatim || strings.Contains(strings.ToLower(sr.PekerjaanAyah), "meninggal") || strings.Contains(strings.ToLower(sr.PekerjaanIbu), "meninggal")
		isLuar := strings.EqualFold(strings.TrimSpace(sr.Mark), "LUAR")
		isKepulauan := isKecamatanKepulauan(sr.Kecamatan)

		if isYatim {
			totalYatim++
		}
		if isLuar {
			totalLuar++
		}
		if isKepulauan {
			totalKepulauan++
		}

		rk := rekapBySiswa[sr.ID]
		h := rk.H
		i := rk.I
		sk := rk.S
		a := rk.A
		t := rk.T
		tot := rk.Total
		persen := 100.0
		if tot > 0 {
			persen = math.Round(float64(h+t) * 100 / float64(tot))
		}

		totalAlfaBulanIni += a
		totalTelatBulanIni += t

		levelRisiko := "aman"
		alasanParts := []string{}
		skor := int(a)*30 + int(t)*12 + int(sk+i)*4

		if a >= 5 || (tot >= 4 && persen < 70) {
			levelRisiko = "kritis"
			siswaKritis++
			skor += 500
		} else if a >= 3 || t >= 5 || (tot >= 4 && persen < 80) {
			levelRisiko = "waspada"
			siswaWaspada++
			skor += 250
		} else if a >= 1 || t >= 2 || (sk+i) >= 4 {
			levelRisiko = "pantauan"
			siswaPantauan++
			skor += 100
		}

		if a > 0 {
			alasanParts = append(alasanParts, fmt.Sprintf("Alfa %dx", a))
		}
		if t > 0 {
			alasanParts = append(alasanParts, fmt.Sprintf("Telat %dx", t))
		}
		if (sk + i) >= 3 {
			alasanParts = append(alasanParts, fmt.Sprintf("Sakit/Izin %dx", sk+i))
		}
		if tot >= 4 && persen < 80 {
			alasanParts = append(alasanParts, fmt.Sprintf("Kehadiran %.0f%%", persen))
		}
		alasanRisiko := strings.Join(alasanParts, " · ")
		if alasanRisiko == "" {
			alasanRisiko = "Kehadiran baik"
		}

		jmlCatatan := catatanPerSiswa[sr.ID]
		kelasLabel := sr.Kelas
		if rk.KodeKelas != "" && (kelasLabel == "" || kelasLabel == "-") {
			kelasLabel = rk.KodeKelas
		}

		items = append(items, bkSiswaItem{
			skor: skor,
			nama: sr.NamaLengkap,
			data: map[string]interface{}{
				"id":              sr.ID,
				"nis":             sr.NIS,
				"nisn":            sr.NISN,
				"nim":             sr.NIM,
				"nik":             sr.NIK,
				"namaLengkap":     sr.NamaLengkap,
				"jenisKelamin":    sr.JenisKelamin,
				"tempatLahir":     sr.TempatLahir,
				"tanggalLahir":    sr.TanggalLahir,
				"alamat":          sr.Alamat,
				"namaOrtu":        sr.NamaOrtu,
				"noHpOrtu":        sr.NoHpOrtu,
				"namaAyah":        sr.NamaAyah,
				"namaIbu":         sr.NamaIbu,
				"pekerjaanAyah":   sr.PekerjaanAyah,
				"pekerjaanIbu":    sr.PekerjaanIbu,
				"desa":            sr.Desa,
				"kecamatan":       sr.Kecamatan,
				"kabupaten":       sr.Kabupaten,
				"anakKe":          sr.AnakKe,
				"umur":            sr.Umur,
				"tahunMasuk":      sr.TahunMasuk,
				"rt":              sr.RT,
				"mark":            sr.Mark,
				"yatim":           isYatim,
				"luar":            isLuar,
				"kepulauan":       isKepulauan,
				"kelas":           kelasLabel,
				"kelasId":         rk.KelasID,
				"hadir":           h,
				"izin":            i,
				"sakit":           sk,
				"alpa":            a,
				"telat":           t,
				"totalPresensi":   tot,
				"persenKehadiran": persen,
				"levelRisiko":     levelRisiko,
				"alasanRisiko":    alasanRisiko,
				"skorRisiko":      skor,
				"jumlahCatatanBK": jmlCatatan,
			},
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].skor != items[j].skor {
			return items[i].skor > items[j].skor
		}
		return items[i].nama < items[j].nama
	})

	siswaList := make([]map[string]interface{}, 0, len(items))
	for _, it := range items {
		siswaList = append(siswaList, it.data)
	}

	catatanTerbaru := []map[string]interface{}{}
	if s.bk != nil {
		if cRows, err := s.bk.DaftarCatatan(ctx, catatanBKFilter{Limit: 30}); err == nil {
			catatanTerbaru = formatCatatanBKList(cRows)
		}
	}

	return map[string]interface{}{
		"success": true,
		"ringkasan": map[string]interface{}{
			"totalSiswa":         totalSiswa,
			"totalYatim":         totalYatim,
			"totalLuar":          totalLuar,
			"totalKepulauan":     totalKepulauan,
			"siswaKritis":        siswaKritis,
			"siswaWaspada":       siswaWaspada,
			"siswaPantauan":      siswaPantauan,
			"totalAlfaBulanIni":  totalAlfaBulanIni,
			"totalTelatBulanIni": totalTelatBulanIni,
			"totalCatatanBK":     totalCatatanBK,
			"catatanAktif":       catatanAktif,
			"periodeMulai":       mulai.Format("02/01/2006"),
			"periodeSelesai":     selesai.Format("02/01/2006"),
		},
		"siswa":          siswaList,
		"catatanTerbaru": catatanTerbaru,
		"tahunAjaran":    ta,
	}, nil
}

func (s *Service) GetCatatanBK(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.bisaAksesBK(ctx, requestedBy) {
		return map[string]interface{}{"success": false, "message": "Akses ditolak. Fitur ini khusus Guru BK."}, nil
	}
	if s.bk == nil {
		return map[string]interface{}{"success": true, "data": []map[string]interface{}{}}, nil
	}
	siswaID := interfaceToInt(payload["siswaId"])
	kelas := strings.TrimSpace(fmt.Sprintf("%v", payload["kelas"]))
	kategori := strings.TrimSpace(fmt.Sprintf("%v", payload["kategori"]))
	status := strings.TrimSpace(fmt.Sprintf("%v", payload["status"]))
	cari := strings.TrimSpace(fmt.Sprintf("%v", payload["cari"]))
	if kelas == "<nil>" {
		kelas = ""
	}
	if kategori == "<nil>" {
		kategori = ""
	}
	if status == "<nil>" {
		status = ""
	}
	if cari == "<nil>" {
		cari = ""
	}

	rows, err := s.bk.DaftarCatatan(ctx, catatanBKFilter{
		SiswaID:  siswaID,
		Kelas:    kelas,
		Kategori: kategori,
		Status:   status,
		Cari:     cari,
		Limit:    250,
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"success": true,
		"data":    formatCatatanBKList(rows),
	}, nil
}

func (s *Service) SimpanCatatanBK(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	if !s.bisaAksesBK(ctx, username) {
		return map[string]interface{}{"success": false, "message": "Akses ditolak. Hanya Guru BK yang dapat menyimpan catatan bimbingan."}, nil
	}
	if s.bk == nil {
		return map[string]interface{}{"success": false, "message": "Repositori BK belum siap"}, nil
	}

	id := interfaceToInt(payload["id"])
	siswaID := interfaceToInt(payload["siswaId"])
	if siswaID <= 0 {
		return map[string]interface{}{"success": false, "message": "Pilih siswa terlebih dahulu."}, nil
	}

	kelas := strings.TrimSpace(fmt.Sprintf("%v", payload["kelas"]))
	if kelas == "" || kelas == "<nil>" {
		kelas = "-"
	}
	kategori := strings.TrimSpace(fmt.Sprintf("%v", payload["kategori"]))
	if kategori == "" || kategori == "<nil>" {
		kategori = "Kedisiplinan / Presensi"
	}
	catatan := strings.TrimSpace(fmt.Sprintf("%v", payload["catatan"]))
	if catatan == "" || catatan == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Uraian catatan bimbingan / permasalahan wajib diisi."}, nil
	}
	tindakLanjut := strings.TrimSpace(fmt.Sprintf("%v", payload["tindakLanjut"]))
	if tindakLanjut == "<nil>" {
		tindakLanjut = ""
	}
	status := strings.TrimSpace(fmt.Sprintf("%v", payload["status"]))
	if status == "" || status == "<nil>" {
		status = "Dipantau"
	}

	tglStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggal"]))
	tanggal := time.Now()
	if tglStr != "" && tglStr != "<nil>" {
		if tParsed, err := parseTanggalIndo(tglStr); err == nil {
			tanggal = tParsed
		} else if tISO, err2 := time.Parse("2006-01-02", tglStr); err2 == nil {
			tanggal = tISO
		}
	}

	namaGuruBK := username
	if s.pengguna != nil {
		if p, err := s.pengguna.CariBerdasarkanUsername(ctx, username); err == nil && p != nil && p.NamaLengkap != "" {
			namaGuruBK = p.NamaLengkap
		}
	}

	savedID, err := s.bk.SimpanCatatan(ctx, catatanBKInput{
		ID:             id,
		SiswaID:        siswaID,
		Kelas:          kelas,
		Tanggal:        tanggal,
		Kategori:       kategori,
		TindakLanjut:   tindakLanjut,
		Catatan:        catatan,
		Status:         status,
		GuruBKUsername: username,
		GuruBKNama:     namaGuruBK,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	pesan := "Catatan bimbingan BK berhasil disimpan"
	if id > 0 {
		pesan = "Catatan bimbingan BK berhasil diperbarui"
	}
	return map[string]interface{}{
		"success": true,
		"message": pesan,
		"id":      savedID,
	}, nil
}

func (s *Service) HapusCatatanBK(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.bisaAksesBK(ctx, requestedBy) {
		return map[string]interface{}{"success": false, "message": "Akses ditolak. Hanya Guru BK yang dapat menghapus catatan bimbingan."}, nil
	}
	if s.bk == nil {
		return map[string]interface{}{"success": false, "message": "Repositori BK belum siap"}, nil
	}
	idInt := interfaceToInt(id)
	if idInt <= 0 {
		return map[string]interface{}{"success": false, "message": "ID catatan tidak valid."}, nil
	}
	if err := s.bk.HapusCatatan(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{
		"success": true,
		"message": "Catatan bimbingan BK berhasil dihapus",
	}, nil
}
