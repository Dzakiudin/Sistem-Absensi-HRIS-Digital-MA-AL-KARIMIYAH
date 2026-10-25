package madrasah

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

const cacheRekapHonorPrefix = "rekap:honor:"

func (s *Service) GetRiwayatHonorSaya(ctx context.Context, username string) (map[string]interface{}, error) {
	daftar, err := s.honor.DaftarTerkirim(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	data := []map[string]interface{}{}
	for _, r := range daftar {
		data = append(data, map[string]interface{}{
			"id":           r.ID,
			"bulan":        r.Bulan,
			"tahun":        r.Tahun,
			"tanggalKirim": r.TanggalKirim,
			"sudahDilihat": r.SudahDilihat,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) TandaiHonorDilihat(ctx context.Context, username string, id interface{}) (map[string]interface{}, error) {
	idInt, _ := strconv.Atoi(fmt.Sprintf("%v", id))
	if err := s.honor.TandaiDilihat(ctx, idInt, username); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true}, nil
}

func (s *Service) HitungSlipHonor(ctx context.Context, username string, bulan, tahun int) (map[string]interface{}, error) {
	info, _ := s.GetInfoSekolah(ctx)
	tarif, _ := info["tarifHonorPerJam"].(int64)
	if tarif == 0 {
		tarif = 9000
	}
	if tarif == 0 {
		tarif = 9000
	}

	namaLengkap, mapel, statusSergu, err := s.honor.InfoGuruHonor(ctx, username)
	if err != nil {
		return nil, err
	}

	bulanStr := fmt.Sprintf("%02d", bulan)
	tahunStr := fmt.Sprintf("%d", tahun)

	catatan, err := s.honor.CatatanHonorGuru(ctx, username, bulanStr, tahunStr)
	if err != nil {
		return nil, err
	}

	rincian := []map[string]interface{}{}
	var jamReguler int = 0
	var jamPengganti int = 0
	for _, rec := range catatan {
		keteranganFinal := rec.Keterangan
		if rec.SubstituteUsername == username && rec.StatusKonfirmasiPengganti == "Terkonfirmasi" {
			keteranganFinal = "Guru Pengganti"
			jamPengganti++
		} else {
			jamReguler++
		}
		rincian = append(rincian, map[string]interface{}{
			"tanggal":       rec.Tanggal,
			"mataPelajaran": rec.Mapel,
			"kelas":         rec.Kelas,
			"jamKe":         rec.JamKe,
			"keterangan":    keteranganFinal,
		})
	}

	sesiRentang := s.sesiPenggantiRentangDalamBulan(ctx, username, bulan, tahun)
	if sesiRentang > 0 {
		awalBulan := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
		akhirBulan := time.Date(tahun, time.Month(bulan)+1, 0, 0, 0, 0, 0, time.Local)
		tsAwal := awalBulan.Format("02/01/2006")
		tsAkhir := akhirBulan.Format("02/01/2006")
		rentang, errR := s.honor.RentangPenggantiPeriode(ctx, username, tsAkhir, tsAwal)
		if errR == nil {
			for _, r := range rentang {
				rincian = append(rincian, map[string]interface{}{
					"tanggal":       r.Mulai + " s.d. " + r.Selesai,
					"mataPelajaran": "Pengganti rentang utk " + r.NamaLengkap,
					"kelas":         "-",
					"jamKe":         "rentang",
					"keterangan":    "Honor dihitung otomatis dari sesi jadwal yg diampu",
				})
			}
		}
		jamPengganti += sesiRentang
	}

	jumlahJam := jamReguler + jamPengganti

	var honorMengajar int64 = 0
	if statusSergu == "Non-Sergu" {
		honorMengajar = int64(jamReguler) * tarif
	}

	honorPengganti := int64(jamPengganti) * tarif
	totalHonorMengajar := honorMengajar + honorPengganti

	recTambahan, _ := s.honor.HonorTambahan(ctx, username, bulan, tahun)
	honorStruktural, honorTugasTambahan := recTambahan.HonorStruktural, recTambahan.HonorTugasTambahan

	totalHonor := totalHonorMengajar + honorStruktural + honorTugasTambahan

	return map[string]interface{}{
		"namaSekolah":        info["namaSekolah"],
		"namaKepala":         info["namaKepala"],
		"namaLengkap":        namaLengkap,
		"mataPelajaran":      mapel,
		"statusSergu":        statusSergu,
		"jumlahJam":          jumlahJam,
		"tarif":              tarif,
		"honorMengajar":      totalHonorMengajar,
		"honorStruktural":    honorStruktural,
		"honorTugasTambahan": honorTugasTambahan,
		"totalHonor":         totalHonor,
		"rincian":            rincian,
	}, nil
}

func (s *Service) GetSlipHonorSaya(ctx context.Context, username string, bulan, tahun int) (map[string]interface{}, error) {
	slip, err := s.HitungSlipHonor(ctx, username, bulan, tahun)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "data": slip}, nil
}

func (s *Service) GetSlipHonor(ctx context.Context, requestedBy, username string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	slip, err := s.HitungSlipHonor(ctx, username, bulan, tahun)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "data": slip}, nil
}

func (s *Service) GetSemuaSlipHonor(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	info, _ := s.GetInfoSekolah(ctx)
	tarif, _ := info["tarifHonorPerJam"].(int64)
	if tarif == 0 {
		tarif = 9000
	}
	bulanStr := fmt.Sprintf("%02d", bulan)
	tahunStr := fmt.Sprintf("%d", tahun)
	periode := bulanStr + "/" + tahunStr

	type profilGuru struct{ nama, mapel, sergu string }
	profils := map[string]profilGuru{}
	usernames := []string{}
	order := []string{}
	{
		rows, err := s.honor.ProfilGuruAktifHonor(ctx)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			profils[r.Username] = profilGuru{r.Nama, r.MataPelajaran, r.StatusSergu}
			usernames = append(usernames, r.Username)
			order = append(order, r.Username)
		}
	}
	if len(usernames) == 0 {
		return map[string]interface{}{"success": true, "data": []map[string]interface{}{}}, nil
	}

	type catatan struct {
		tGl, m, k, jk, ket string
	}
	catatanPerGuru := map[string][]catatan{}
	{
		rows, err := s.honor.CatatanHonorBulan(ctx, periode, usernames)
		if err != nil {
			return nil, err
		}
		for _, rec := range rows {

			if _, ok := profils[rec.Username]; ok && rec.StatusKonfirmasiPengganti != "Terkonfirmasi" {
				catatanPerGuru[rec.Username] = append(catatanPerGuru[rec.Username],
					catatan{rec.Tanggal, rec.Mapel, rec.Kelas, rec.JamKe, rec.Keterangan})
			}

			if rec.SubstituteUsername != "" && rec.StatusKonfirmasiPengganti == "Terkonfirmasi" {
				if _, ok := profils[rec.SubstituteUsername]; ok {
					catatanPerGuru[rec.SubstituteUsername] = append(catatanPerGuru[rec.SubstituteUsername],
						catatan{rec.Tanggal, rec.Mapel, rec.Kelas, rec.JamKe, "Guru Pengganti"})
				}
			}
		}
	}

	rentangSubs := map[string]bool{}
	{
		rows, err := s.honor.RentangPenggantiKandidat(ctx, periode)
		if err == nil {
			for _, u := range rows {
				rentangSubs[u] = true
			}
		}
	}

	honorTambahan := map[string]struct{ st, ts int64 }{}
	{
		rowsHT, err := s.honor.HonorTambahanPeriode(ctx, bulan, tahun)
		if err == nil {
			for _, r := range rowsHT {
				honorTambahan[r.Username] = struct{ st, ts int64 }{r.Struktural, r.Tugas}
			}
		}
	}

	list := []map[string]interface{}{}
	for _, u := range order {
		p := profils[u]
		rincian := []map[string]interface{}{}
		var jamReguler, jamPengganti int
		for _, c := range catatanPerGuru[u] {
			if c.ket == "Guru Pengganti" {
				jamPengganti++
			} else {
				jamReguler++
			}
			rincian = append(rincian, map[string]interface{}{
				"tanggal":       c.tGl,
				"mataPelajaran": c.m,
				"kelas":         c.k,
				"jamKe":         c.jk,
				"keterangan":    c.ket,
			})
		}
		if rentangSubs[u] {
			sesi := s.sesiPenggantiRentangDalamBulan(ctx, u, bulan, tahun)
			if sesi > 0 {
				awalBulan := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
				akhirBulan := time.Date(tahun, time.Month(bulan)+1, 0, 0, 0, 0, 0, time.Local)
				tsAwal := awalBulan.Format("02/01/2006")
				tsAkhir := akhirBulan.Format("02/01/2006")
				rentang, errR := s.honor.RentangPenggantiPeriode(ctx, u, tsAkhir, tsAwal)
				if errR == nil {
					for _, r := range rentang {
						rincian = append(rincian, map[string]interface{}{
							"tanggal":       r.Mulai + " s.d. " + r.Selesai,
							"mataPelajaran": "Pengganti rentang utk " + r.NamaLengkap,
							"kelas":         "-",
							"jamKe":         "rentang",
							"keterangan":    "Honor dihitung otomatis dari sesi jadwal yg diampu",
						})
					}
				}
				jamPengganti += sesi
			}
		}

		jumlahJam := jamReguler + jamPengganti
		var honorMengajar int64 = 0
		if p.sergu == "Non-Sergu" {
			honorMengajar = int64(jamReguler) * tarif
		}
		honorPengganti := int64(jamPengganti) * tarif
		totalHonorMengajar := honorMengajar + honorPengganti

		ht := honorTambahan[u]
		totalHonor := totalHonorMengajar + ht.st + ht.ts
		if jumlahJam == 0 && totalHonor == 0 {
			continue
		}
		list = append(list, map[string]interface{}{
			"namaSekolah":        info["namaSekolah"],
			"namaKepala":         info["namaKepala"],
			"namaLengkap":        p.nama,
			"mataPelajaran":      p.mapel,
			"statusSergu":        p.sergu,
			"jumlahJam":          jumlahJam,
			"tarif":              tarif,
			"honorMengajar":      totalHonorMengajar,
			"honorStruktural":    ht.st,
			"honorTugasTambahan": ht.ts,
			"totalHonor":         totalHonor,
			"rincian":            rincian,
		})
	}
	return map[string]interface{}{"success": true, "data": list}, nil
}

func (s *Service) GetRekapHonor(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	key := fmt.Sprintf("%s%d:%d", cacheRekapHonorPrefix, bulan, tahun)
	if s.cache != nil && s.honorCacheTTL > 0 {
		if raw, ok := s.cacheGet(ctx, key); ok {
			var rows []map[string]interface{}
			if json.Unmarshal([]byte(raw), &rows) == nil {
				return map[string]interface{}{"success": true, "data": rows}, nil
			}
		}
	}

	info, _ := s.GetInfoSekolah(ctx)
	tarif, _ := info["tarifHonorPerJam"].(int64)

	type barisRekap struct {
		username, nama string
		statusSergu    string
		jamReguler     int32
		jamPengganti   int32
	}
	nilai := make(map[string]barisRekap)
	order := []string{}
	rowsJam, err := s.rekap.JamMengajarBulanan(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}
	for _, r := range rowsJam {
		nilai[r.Username] = barisRekap{
			username: r.Username, nama: r.Nama, statusSergu: r.StatusSergu,
			jamReguler: r.JamReguler, jamPengganti: r.JamPengganti,
		}
		order = append(order, r.Username)
	}

	{
		sesiRentang := s.rekapPenggantiRentangBulan(ctx, bulan, tahun)
		for username, tambah := range sesiRentang {
			if b, ok2 := nilai[username]; ok2 {
				b.jamPengganti += int32(tambah)
				nilai[username] = b
			}
		}
	}

	honorTambahan := make(map[string]struct {
		struktural, tugas int64
	})
	{
		rowsHT, err := s.honor.HonorTambahanPeriode(ctx, bulan, tahun)
		if err != nil {
			return nil, err
		}
		for _, r := range rowsHT {
			honorTambahan[r.Username] = struct {
				struktural, tugas int64
			}{r.Struktural, r.Tugas}
		}
	}

	data := []map[string]interface{}{}
	for _, u := range order {
		b := nilai[u]
		ht := honorTambahan[u]
		var honorMengajar int64 = 0
		if b.statusSergu == "Non-Sergu" {
			honorMengajar = int64(b.jamReguler) * tarif
		}
		honorPengganti := int64(b.jamPengganti) * tarif
		totalHonorMengajar := honorMengajar + honorPengganti

		jumlahJam := b.jamReguler + b.jamPengganti
		total := totalHonorMengajar + ht.struktural + ht.tugas
		if jumlahJam == 0 && total == 0 {
			continue
		}
		ketSergu := "Non-Sergu"
		switch b.statusSergu {
		case "Sergu":
			ketSergu = "Sergu"
		case "":
			ketSergu = "Belum diatur"
		}
		data = append(data, map[string]interface{}{
			"username":           b.username,
			"namaLengkap":        b.nama,
			"statusSergu":        b.statusSergu,
			"keteranganSergu":    ketSergu,
			"jumlahJam":          int(jumlahJam),
			"honorMengajar":      totalHonorMengajar,
			"honorStruktural":    ht.struktural,
			"honorTugasTambahan": ht.tugas,
			"totalHonor":         total,
		})
	}

	if s.cache != nil && s.honorCacheTTL > 0 {
		if raw, err := json.Marshal(data); err == nil {
			s.cache.Set(ctx, key, string(raw), s.honorCacheTTL)
		}
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) cacheFlushHonor(ctx context.Context) {
	if s.cache == nil {
		return
	}
	s.cache.DeletePrefix(ctx, cacheRekapHonorPrefix)
}

func (s *Service) KirimSlipHonorSatuGuru(ctx context.Context, requestedBy, targetUser string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	namaGuru, _ := s.pengguna.NamaGuru(ctx, targetUser)
	tglKirim := time.Now().Format("02/01/2006 15:04")

	exists, err := s.honor.SlipSudahTerkirim(ctx, targetUser, bulan, tahun)
	if err != nil {
		return nil, err
	}
	if exists {
		return map[string]interface{}{"success": false, "message": "Slip honor untuk periode ini sudah pernah dikirim ke guru tersebut"}, nil
	}

	if err := s.honor.KirimSlip(ctx, honorTerkirimInput{
		Username: targetUser, NamaGuru: namaGuru, Bulan: bulan, Tahun: tahun, TanggalKirim: tglKirim,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Slip honor berhasil dikirim"}, nil
}

func (s *Service) KirimSlipHonorSemua(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	res, err := s.GetRekapHonor(ctx, requestedBy, bulan, tahun)
	if err != nil {
		return nil, err
	}
	list, _ := res["data"].([]map[string]interface{})
	tglKirim := time.Now().Format("02/01/2006 15:04")
	count := 0
	duplicate := 0

	items := []honorTerkirimInput{}
	for _, item := range list {
		u := fmt.Sprintf("%v", item["username"])
		nama := fmt.Sprintf("%v", item["namaLengkap"])
		exists, err := s.honor.SlipSudahTerkirim(ctx, u, bulan, tahun)
		if err != nil {
			return nil, err
		}
		if exists {
			duplicate++
			continue
		}
		items = append(items, honorTerkirimInput{
			Username: u, NamaGuru: nama, Bulan: bulan, Tahun: tahun, TanggalKirim: tglKirim,
		})
		count++
	}

	if err := s.honor.KirimSlipBatch(ctx, items); err != nil {

		return map[string]interface{}{"success": false, "message": "Pengiriman dibatalkan: " + err.Error()}, nil
	}

	return map[string]interface{}{"success": true, "message": fmt.Sprintf("Slip honor berhasil dikirim ke %d guru (%d sudah terkirim sebelumnya)", count, duplicate)}, nil
}

func (s *Service) GetHonorTambahanSatuGuru(ctx context.Context, requestedBy, username string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	rec, err := s.honor.HonorTambahan(ctx, username, bulan, tahun)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"honorStruktural":    rec.HonorStruktural,
			"honorTugasTambahan": rec.HonorTugasTambahan,
			"keterangan":         rec.Keterangan,
		},
	}, nil
}

func (s *Service) SimpanHonorTambahan(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	username := fmt.Sprintf("%v", payload["username"])
	bulan, _ := strconv.Atoi(fmt.Sprintf("%v", payload["bulan"]))
	tahun, _ := strconv.Atoi(fmt.Sprintf("%v", payload["tahun"]))
	struktural, _ := strconv.ParseInt(fmt.Sprintf("%v", payload["honorStruktural"]), 10, 64)
	tugas, _ := strconv.ParseInt(fmt.Sprintf("%v", payload["honorTugasTambahan"]), 10, 64)
	ket := fmt.Sprintf("%v", payload["keterangan"])

	namaGuru, _ := s.pengguna.NamaGuru(ctx, username)

	if err := s.honor.SimpanTambahan(ctx, honorTambahanInput{
		Username: username, NamaGuru: namaGuru, Bulan: bulan, Tahun: tahun,
		HonorStruktural: struktural, HonorTugasTambahan: tugas, Keterangan: ket,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushHonor(ctx)
	return map[string]interface{}{"success": true, "message": "Honor tambahan berhasil disimpan"}, nil
}
