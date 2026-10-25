package madrasah

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"
)

func normalisasiHonorSaatIzin(v string) string {
	switch strings.TrimSpace(v) {
	case "Penuh", "Proporsional", "TidakDiberi":
		return strings.TrimSpace(v)
	default:
		return "TidakDiberi"
	}
}

func (s *Service) honorSaatIzin(ctx context.Context) string {
	return normalisasiHonorSaatIzin(s.pengaturanAmbil(ctx, "HonorGuruSaatIzin", "TidakDiberi"))
}

func (s *Service) persenSaatIzin(ctx context.Context) float64 {
	v := strings.TrimSpace(s.pengaturanAmbil(ctx, "PersenSaatIzin", "50"))
	p, err := strconv.ParseFloat(v, 64)
	if err != nil || p < 0 || p > 100 {
		return 50
	}
	return p
}

func hitungHonorSesi(durasiMenit int, tarif int64, persen float64) float64 {
	jam := float64(durasiMenit) / 60.0
	return jam * float64(tarif) * persen / 100.0
}

type kreditHonor struct {
	Pengguna string
	Persen   float64
	Alasan   string
}

func kreditSesi(pengguna, pengajarUtama, statusSesi, kebijakan string, pctIzin float64) []kreditHonor {
	if pengguna == "" || pengajarUtama == "" {
		return nil
	}

	if !strings.EqualFold(pengguna, pengajarUtama) {
		return []kreditHonor{
			{Pengguna: pengguna, Persen: 100, Alasan: "Menggantikan " + pengajarUtama},
			{Pengguna: pengajarUtama, Persen: 0, Alasan: "Digantikan oleh " + pengguna},
		}
	}

	if statusSesi != "Digantikan" {
		return []kreditHonor{{Pengguna: pengguna, Persen: 100, Alasan: "Mengajar"}}
	}

	pct := 0.0
	alasan := "Izin, tidak ada pengganti yang teach"
	switch kebijakan {
	case "Penuh":
		pct = 100
		alasan = "Izin, kebijakan: honor penuh"
	case "TidakDiberi":
		pct = 0
		alasan = "Izin, kebijakan: tidak diberi honor"
	default:
		pct = pctIzin
		alasan = fmt.Sprintf("Izin, kebijakan: %g%% dari sesi", pct)
	}
	return []kreditHonor{{Pengguna: pengguna, Persen: pct, Alasan: alasan}}
}

type hasilHonorPerPegawai struct {
	Username   string
	Nama       string
	Role       string
	TotalHonor float64
	TotalSesi  int
	TotalMenit int
	Detail     []detailHonor
}

type detailHonor struct {
	Tanggal     time.Time
	Mapel       string
	Kelas       string
	JamMulai    *time.Time
	JamSelesai  *time.Time
	DurasiMenit int
	Persen      float64
	Nominal     float64
	Alasan      string
	Hadir       int
	Izin        int
	Sakit       int
	Alpa        int
	Telat       int
}

func (s *Service) hitungHonorPeriode(ctx context.Context, bulan, tahun int) (map[string]*hasilHonorPerPegawai, int64, error) {
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return nil, 0, fmt.Errorf("periode tidak valid")
	}

	awalBulan := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
	akhirBulan := awalBulan.AddDate(0, 1, -1)

	if err := s.sesi.MaterialisasiSesiPeriode(ctx, awalBulan, akhirBulan); err != nil {
		log.Printf("materialisasi sesi %02d/%d gagal, rekap honor dihitung dari sesi yang ada: %v", bulan, tahun, err)
	}

	info, err := s.GetInfoSekolah(ctx)
	if err != nil || info == nil {
		return nil, 0, fmt.Errorf("konfigurasi sekolah belum dapat dimuat")
	}
	tarif, _ := info["tarifHonorPerJam"].(int64)
	if tarif <= 0 {
		tarif = 9000
	}
	kebijakan := s.honorSaatIzin(ctx)
	pctIzin := s.persenSaatIzin(ctx)

	hasil := map[string]*hasilHonorPerPegawai{}

	pegawai, err := s.honor.PegawaiAktifHonor(ctx)
	if err != nil {
		return nil, 0, err
	}
	for _, p := range pegawai {
		hasil[p.Username] = &hasilHonorPerPegawai{
			Username: p.Username, Nama: p.Nama, Role: p.Role, Detail: []detailHonor{},
		}
	}

	sesi, err := s.honor.SesiBulanan(ctx, bulan, tahun)
	if err != nil {
		return nil, 0, err
	}

	for _, sn := range sesi {

		if !sn.PunyaPresensi {
			h, ok := hasil[sn.Pengguna]
			if ok {
				h.Detail = append(h.Detail, detailHonor{
					Tanggal: sn.Tanggal, Mapel: sn.Mapel, Kelas: sn.Kelas,
					JamMulai: sn.JamMulai, JamSelesai: sn.JamSelesai,
					DurasiMenit: sn.DurasiMenit, Persen: 0, Nominal: 0,
					Alasan: "Tidak ada presensi siswa",
					Hadir:  sn.Hadir,
					Izin:   sn.Izin,
					Sakit:  sn.Sakit,
					Alpa:   sn.Alpa,
					Telat:  sn.Telat,
				})
			}
			continue
		}

		for _, k := range kreditSesi(sn.Pengguna, sn.PengajarUtama, sn.StatusSesi, kebijakan, pctIzin) {
			h, ok := hasil[k.Pengguna]
			if !ok {
				continue
			}
			nominal := hitungHonorSesi(sn.DurasiMenit, tarif, k.Persen)
			if k.Persen > 0 {
				h.TotalHonor += nominal
				h.TotalSesi++
				h.TotalMenit += sn.DurasiMenit
			}
			h.Detail = append(h.Detail, detailHonor{
				Tanggal: sn.Tanggal, Mapel: sn.Mapel, Kelas: sn.Kelas,
				JamMulai: sn.JamMulai, JamSelesai: sn.JamSelesai,
				DurasiMenit: sn.DurasiMenit, Persen: k.Persen, Nominal: nominal, Alasan: k.Alasan,
				Hadir: sn.Hadir,
				Izin:  sn.Izin,
				Sakit: sn.Sakit,
				Alpa:  sn.Alpa,
				Telat: sn.Telat,
			})
		}
	}

	return hasil, tarif, nil
}

func (s *Service) GetRekapHonorBaru(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	if final, _ := s.statusHonor(ctx, bulan, tahun); final == "Final" {
		return s.rekapHonorTersimpan(ctx, bulan, tahun)
	}

	hasil, tarif, err := s.hitungHonorPeriode(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}

	info, _ := s.GetInfoSekolah(ctx)

	daftar := make([]*hasilHonorPerPegawai, 0, len(hasil))
	for _, u := range hasil {
		daftar = append(daftar, u)
	}
	sort.Slice(daftar, func(i, j int) bool {
		if daftar[i].TotalHonor != daftar[j].TotalHonor {
			return daftar[i].TotalHonor > daftar[j].TotalHonor
		}
		return daftar[i].Nama < daftar[j].Nama
	})

	data := []map[string]interface{}{}
	totalSeluruh := 0.0
	for _, u := range daftar {
		detail := []map[string]interface{}{}
		for _, d := range u.Detail {
			item := map[string]interface{}{
				"tanggal":     d.Tanggal.Format("02/01/2006"),
				"mapel":       d.Mapel,
				"kelas":       d.Kelas,
				"durasiMenit": d.DurasiMenit,
				"persen":      d.Persen,
				"nominal":     round1(d.Nominal),
				"alasan":      d.Alasan,
				"hadir":       d.Hadir,
				"izin":        d.Izin,
				"sakit":       d.Sakit,
				"alpa":        d.Alpa,
				"telat":       d.Telat,
			}
			if d.JamMulai != nil {
				item["jamMulai"] = d.JamMulai.Format("15:04")
			} else {
				item["jamMulai"] = nil
			}
			if d.JamSelesai != nil {
				item["jamSelesai"] = d.JamSelesai.Format("15:04")
			} else {
				item["jamSelesai"] = nil
			}
			detail = append(detail, item)
		}
		baris := map[string]interface{}{
			"username":   u.Username,
			"nama":       u.Nama,
			"role":       u.Role,
			"totalHonor": round1(u.TotalHonor),
			"totalSesi":  u.TotalSesi,
			"totalMenit": u.TotalMenit,
			"totalJam":   round1(float64(u.TotalMenit) / 60.0),
			"detail":     detail,
		}
		data = append(data, baris)
		totalSeluruh += u.TotalHonor
	}

	tambahan, err := s.honor.HonorTambahanBulanan(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}
	for _, extra := range tambahan {
		totalSeluruh += extra
	}

	for _, baris := range data {
		u := baris["username"].(string)
		extra := tambahan[u]
		baris["honorTambahan"] = extra
		baris["totalHonor"] = baris["totalHonor"].(float64) + extra
	}

	return map[string]interface{}{
		"success":           true,
		"bulan":             bulan,
		"tahun":             tahun,
		"status":            "Draft",
		"tarifPerJam":       tarif,
		"kebijakanSaatIzin": s.honorSaatIzin(ctx),
		"persenSaatIzin":    s.persenSaatIzin(ctx),
		"namaSekolah":       info["namaSekolah"],
		"totalSeluruh":      round1(totalSeluruh),
		"data":              data,
	}, nil
}

func round1(v float64) float64 {
	return float64(int64(v*10+0.5)) / 10
}

func (s *Service) statusHonor(ctx context.Context, bulan, tahun int) (string, error) {
	return s.honor.StatusPeriode(ctx, bulan, tahun)
}

func (s *Service) rekapHonorTersimpan(ctx context.Context, bulan, tahun int) (map[string]interface{}, error) {
	rekap, err := s.honor.RekapTersimpan(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	total := 0.0
	for _, r := range rekap {
		item := map[string]interface{}{
			"username":   r.Username,
			"nama":       r.Nama,
			"role":       r.Role,
			"totalHonor": r.TotalHonor,
			"totalSesi":  r.TotalSesi,
			"totalMenit": r.TotalMenit,
			"totalJam":   round1(float64(r.TotalMenit) / 60.0),
		}
		rows, errDetail := s.honor.DetailSlip(ctx, bulan, tahun, r.Username)
		if errDetail == nil {
			detail := []map[string]interface{}{}
			for _, d := range rows {
				di := map[string]interface{}{
					"tanggal":     d.Tanggal.Format("02/01/2006"),
					"mapel":       d.Mapel,
					"kelas":       d.Kelas,
					"durasiMenit": d.DurasiMenit,
					"persen":      d.Persen,
					"nominal":     d.Nominal,
					"alasan":      d.Keterangan,
					"hadir":       d.Hadir,
					"izin":        d.Izin,
					"sakit":       d.Sakit,
					"alpa":        d.Alpa,
					"telat":       d.Telat,
					"jamMulai":    nil,
					"jamSelesai":  nil,
				}
				if d.JamMulai != nil {
					di["jamMulai"] = d.JamMulai.Format("15:04")
				}
				if d.JamSelesai != nil {
					di["jamSelesai"] = d.JamSelesai.Format("15:04")
				}
				detail = append(detail, di)
			}
			item["detail"] = detail
		}
		data = append(data, item)
		total += r.TotalHonor
	}

	info, _ := s.GetInfoSekolah(ctx)
	return map[string]interface{}{
		"success":           true,
		"bulan":             bulan,
		"tahun":             tahun,
		"status":            "Final",
		"kebijakanSaatIzin": s.honorSaatIzin(ctx),
		"namaSekolah":       info["namaSekolah"],
		"totalSeluruh":      round1(total),
		"data":              data,
	}, nil
}

func (s *Service) HitungUlangHonorDraft(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	if status, _ := s.statusHonor(ctx, bulan, tahun); status == "Final" {
		return map[string]interface{}{
			"success": false,
			"message": "Rekap honor bulan ini sudah Final. Buka kembali finalisasi sebelum menghitung ulang.",
		}, nil
	}

	hasil, _, err := s.hitungHonorPeriode(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}

	tambahan, err := s.honorTambahanPeriode(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}

	totalSeluruh := 0.0
	rekap := make([]rekapHonorInput, 0, len(hasil))
	for username, h := range hasil {
		extra := tambahan[username]
		total := round1(h.TotalHonor + extra)
		totalSeluruh += total

		item := rekapHonorInput{
			Username: username, Nama: h.Nama, Role: h.Role,
			TotalHonor: total, TotalSesi: h.TotalSesi, TotalMenit: h.TotalMenit,
		}
		for _, d := range h.Detail {

			item.Detail = append(item.Detail, honorDetailInput{
				Tanggal: d.Tanggal, Mapel: d.Mapel, Kelas: d.Kelas,
				JamMulai: d.JamMulai, JamSelesai: d.JamSelesai,
				DurasiMenit: d.DurasiMenit, Persen: int(d.Persen + 0.5),
				Nominal: int64(round1(d.Nominal)), Keterangan: d.Alasan,
				Hadir: d.Hadir, Izin: d.Izin, Sakit: d.Sakit, Alpa: d.Alpa, Telat: d.Telat,
			})
		}
		rekap = append(rekap, item)
	}

	if err := s.honor.GantiRekapDraft(ctx, bulan, tahun, rekap); err != nil {
		return nil, err
	}

	s.cacheFlushHonor(ctx)
	return map[string]interface{}{
		"success":       true,
		"message":       fmt.Sprintf("Rekap honor %02d/%d berhasil dihitung ulang sebagai Draft.", bulan, tahun),
		"totalSeluruh":  round1(totalSeluruh),
		"jumlahPegawai": len(hasil),
	}, nil
}

func (s *Service) honorTambahanPeriode(ctx context.Context, bulan, tahun int) (map[string]float64, error) {
	return s.honor.HonorTambahanBulanan(ctx, bulan, tahun)
}

func (s *Service) FinalisasiHonor(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	ada, err := s.honor.AdaRekap(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}
	if ada == 0 {
		return map[string]interface{}{
			"success": false,
			"message": "Hitung dulu rekap honor bulan ini sebelum difinalisasi.",
		}, nil
	}

	diubah, err := s.honor.Finalisasi(ctx, bulan, tahun, requestedBy)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	if diubah == 0 {
		return map[string]interface{}{"success": false, "message": "Tidak ada rekap untuk difinalisasi."}, nil
	}

	s.cacheFlushHonor(ctx)
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Rekap honor %02d/%d difinalisasi.", bulan, tahun),
	}, nil
}

func (s *Service) BukaFinalisasiHonor(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	diubah, err := s.honor.BukaFinalisasi(ctx, bulan, tahun)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	if diubah == 0 {
		return map[string]interface{}{"success": false, "message": "Rekap bulan ini belum berstatus Final."}, nil
	}

	s.cacheFlushHonor(ctx)
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Finalisasi %02d/%d dibuka. Hitung ulang sebelum difinalisasi kembali.", bulan, tahun),
	}, nil
}

func (s *Service) GetSlipHonorBaru(ctx context.Context, requestedBy, username string, bulan, tahun int) (map[string]interface{}, error) {
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	bisaKepala := s.CheckAccess(ctx, requestedBy, "kepala")
	if !bisaKepala && !strings.EqualFold(requestedBy, username) {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	pegawai, adaPegawai, err := s.honor.PegawaiByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if !adaPegawai {
		return map[string]interface{}{"success": false, "message": "Pegawai tidak ditemukan."}, nil
	}
	nama, role := pegawai.Nama, pegawai.Role

	recSlip, adaSlip, err := s.honor.SlipTersimpan(ctx, bulan, tahun, username)
	if err != nil {
		return nil, err
	}
	status := recSlip.Status
	totalHonor := recSlip.TotalHonor
	totalSesi := recSlip.TotalSesi
	totalMenit := recSlip.TotalMenit
	tanggalCetak := recSlip.TanggalCetak
	if !adaSlip {
		if !bisaKepala {
			return map[string]interface{}{
				"success": false,
				"message": "Slip honor bulan ini belum tersedia.",
			}, nil
		}

		hasil, tarif, errHitung := s.hitungHonorPeriode(ctx, bulan, tahun)
		if errHitung != nil {
			return nil, errHitung
		}
		h, ok := hasil[username]
		if !ok {
			return map[string]interface{}{"success": false, "message": "Pegawai tidak memiliki data pada periode ini."}, nil
		}
		tambahan, _ := s.honorTambahanPeriode(ctx, bulan, tahun)
		totalHonor = round1(h.TotalHonor + tambahan[username])
		totalSesi, totalMenit = h.TotalSesi, h.TotalMenit

		rows, errDetail := s.detailLangsung(ctx, h.Detail, tarif)
		if errDetail != nil {
			return nil, errDetail
		}
		info, _ := s.GetInfoSekolah(ctx)
		return map[string]interface{}{
			"success":           true,
			"status":            "Draft",
			"namaSekolah":       info["namaSekolah"],
			"namaKepala":        info["namaKepala"],
			"namaLengkap":       nama,
			"role":              role,
			"bulan":             bulan,
			"tahun":             tahun,
			"tarif":             tarif,
			"kebijakanSaatIzin": s.honorSaatIzin(ctx),
			"jumlahSesi":        totalSesi,
			"jumlahMenit":       totalMenit,
			"jumlahJam":         round1(float64(totalMenit) / 60.0),
			"totalHonor":        totalHonor,
			"rincian":           rows,
		}, nil
	}

	detail, err := s.honor.DetailSlip(ctx, bulan, tahun, username)
	if err != nil {
		return nil, err
	}

	rincian := []map[string]interface{}{}
	for _, r := range detail {
		item := map[string]interface{}{
			"tanggal":     r.Tanggal.Format("02/01/2006"),
			"hari":        namaHariDariTanggal(r.Tanggal),
			"mapel":       r.Mapel,
			"kelas":       r.Kelas,
			"durasiMenit": r.DurasiMenit,
			"persen":      r.Persen,
			"nominal":     r.Nominal,
			"keterangan":  r.Keterangan,
			"hadir":       r.Hadir,
			"izin":        r.Izin,
			"sakit":       r.Sakit,
			"alpa":        r.Alpa,
			"telat":       r.Telat,
			"jamMulai":    nil,
			"jamSelesai":  nil,
		}
		if r.JamMulai != nil {
			item["jamMulai"] = r.JamMulai.Format("15:04")
		}
		if r.JamSelesai != nil {
			item["jamSelesai"] = r.JamSelesai.Format("15:04")
		}
		rincian = append(rincian, item)
	}

	if !bisaKepala && status != "Final" {
		return map[string]interface{}{
			"success": false,
			"message": "Slip honor bulan ini belum difinalisasi Kepala Madrasah.",
		}, nil
	}

	info, _ := s.GetInfoSekolah(ctx)
	slip := map[string]interface{}{
		"success":           true,
		"status":            status,
		"namaSekolah":       info["namaSekolah"],
		"namaKepala":        info["namaKepala"],
		"namaLengkap":       nama,
		"role":              role,
		"bulan":             bulan,
		"tahun":             tahun,
		"kebijakanSaatIzin": s.honorSaatIzin(ctx),
		"jumlahSesi":        totalSesi,
		"jumlahMenit":       totalMenit,
		"jumlahJam":         round1(float64(totalMenit) / 60.0),
		"totalHonor":        totalHonor,
		"rincian":           rincian,
	}
	if tanggalCetak != nil {
		slip["tanggalCetak"] = tanggalCetak.Format("02/01/2006")
	}
	return slip, nil
}

func (s *Service) detailLangsung(ctx context.Context, detail []detailHonor, tarif int64) ([]map[string]interface{}, error) {
	out := []map[string]interface{}{}
	for _, d := range detail {
		item := map[string]interface{}{
			"tanggal":     d.Tanggal.Format("02/01/2006"),
			"hari":        namaHariDariTanggal(d.Tanggal),
			"mapel":       d.Mapel,
			"kelas":       d.Kelas,
			"durasiMenit": d.DurasiMenit,
			"persen":      d.Persen,
			"nominal":     round1(d.Nominal),
			"keterangan":  d.Alasan,
			"hadir":       d.Hadir,
			"izin":        d.Izin,
			"sakit":       d.Sakit,
			"alpa":        d.Alpa,
			"telat":       d.Telat,
			"jamMulai":    nil,
			"jamSelesai":  nil,
		}
		if d.JamMulai != nil {
			item["jamMulai"] = d.JamMulai.Format("15:04")
		}
		if d.JamSelesai != nil {
			item["jamSelesai"] = d.JamSelesai.Format("15:04")
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Service) GetRiwayatHonorPegawai(ctx context.Context, requestedBy, username string) (map[string]interface{}, error) {
	if !strings.EqualFold(requestedBy, username) && !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	riwayat, err := s.honor.RiwayatHonor(ctx, username)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, r := range riwayat {
		item := map[string]interface{}{
			"bulan":      r.Bulan,
			"tahun":      r.Tahun,
			"status":     r.Status,
			"totalHonor": r.TotalHonor,
			"totalSesi":  r.TotalSesi,
		}
		if r.TanggalCetak != nil {
			item["tanggalCetak"] = r.TanggalCetak.Format("02/01/2006")
		}
		data = append(data, item)
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}
