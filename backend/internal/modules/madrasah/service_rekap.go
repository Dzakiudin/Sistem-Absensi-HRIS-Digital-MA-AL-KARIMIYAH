package madrasah

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
)

func (s *Service) GetStatistikHariIni(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	today := time.Now()
	todayStr := today.Format("02/01/2006")
	todayName := NamaHariIndo(today.Weekday())
	isLibur, ketLibur := s.ApakahHariLibur(ctx, todayStr)

	stat, err := s.rekap.StatistikDashboard(ctx, todayStr, todayName)
	if err != nil {
		return nil, err
	}
	hariJadwal, err := s.rekap.HariJadwalSemua(ctx)
	if err != nil {
		return nil, err
	}
	jadwalGuru := make(map[string][]string, len(hariJadwal))
	for username, hari := range hariJadwal {
		key := strings.ToLower(username)
		jadwalGuru[key] = append(jadwalGuru[key], hari...)
	}
	totalGuru := stat.TotalGuru
	hadirCount := stat.Hadir
	izinCount := stat.Izin

	belumAbsen := totalGuru - (hadirCount + izinCount)
	if belumAbsen < 0 {
		belumAbsen = 0
	}

	return map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"totalGuru":       totalGuru,
			"jadwalGuru":      jadwalGuru,
			"hadirHariIni":    hadirCount,
			"izinSakitCuti":   izinCount,
			"belumAbsen":      belumAbsen,
			"isHariLibur":     isLibur,
			"keteranganLibur": ketLibur,
		},
	}, nil
}

func (s *Service) GetRiwayatAbsensiSemua(ctx context.Context, requestedBy, mulai, akhir, guru string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	formatTgl := func(str string) string {
		if strings.Contains(str, "-") {
			parts := strings.Split(str, "-")
			if len(parts) == 3 {
				return parts[2] + "/" + parts[1] + "/" + parts[0]
			}
		}
		return str
	}
	tglMulai := formatTgl(mulai)
	tglAkhir := formatTgl(akhir)

	rows, err := s.rekap.RiwayatAbsensiSemua(ctx, riwayatAbsensiFilter{
		TglMulai: tglMulai, TglAkhir: tglAkhir, Username: guru,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	list := []map[string]interface{}{}
	for _, rec := range rows {
		list = append(list, map[string]interface{}{
			"id":                        rec.ID,
			"tanggal":                   rec.Tanggal,
			"jam":                       rec.Jam,
			"username":                  rec.Username,
			"namaGuru":                  rec.Nama,
			"mataPelajaran":             rec.Mapel,
			"jenisAbsen":                rec.Jenis,
			"latitude":                  rec.Latitude,
			"longitude":                 rec.Longitude,
			"jarak":                     rec.Jarak,
			"statusLokasi":              rec.StatusLokasi,
			"fotoUrl":                   rec.FotoUrl,
			"statusWaktu":               rec.StatusWaktu,
			"keterangan":                rec.Keterangan,
			"kelas":                     rec.Kelas,
			"jamKe":                     rec.JamKe,
			"linkMaps":                  rec.LinkMaps,
			"guruPengganti":             rec.GuruPengganti,
			"statusKonfirmasiPengganti": rec.StatusKonfirmasiPengganti,
		})
	}
	return map[string]interface{}{"success": true, "data": list}, nil
}

func (s *Service) GetRekapPerGuru(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 1900 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}
	awal := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
	akhir := awal.AddDate(0, 1, -1)
	return s.rekapSemuaGuru(ctx, requestedBy, awal.Format("02/01/2006"), akhir.Format("02/01/2006"))
}

func (s *Service) GetRekapPerGuruRentang(ctx context.Context, requestedBy, dari, sampai string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	awal, errA := parseTanggalIndo(dari)
	akhir, errB := parseTanggalIndo(sampai)
	if errA != nil || errB != nil || akhir.Before(awal) {
		return map[string]interface{}{"success": false, "message": "Format atau urutan tanggal tidak valid (gunakan dd/MM/yyyy)"}, nil
	}
	if akhir.Sub(awal) > 370*24*time.Hour {
		return map[string]interface{}{"success": false, "message": "Rentang tanggal maksimal 1 tahun"}, nil
	}
	return s.rekapSemuaGuru(ctx, requestedBy, awal.Format("02/01/2006"), akhir.Format("02/01/2006"))
}

func (s *Service) rekapSemuaGuru(ctx context.Context, requestedBy, dariIndo, sampaiIndo string) (map[string]interface{}, error) {
	awal, errA := parseTanggalIndo(dariIndo)
	akhir, errB := parseTanggalIndo(sampaiIndo)
	if errA != nil || errB != nil || akhir.Before(awal) {
		return nil, fmt.Errorf("periode rekap tidak valid")
	}

	type guru struct{ uname, nama string }
	daftar := []guru{}
	guruAktif, err := s.pengguna.DaftarGuruAktif(ctx)
	if err != nil {
		return nil, err
	}
	for _, g := range guruAktif {
		daftar = append(daftar, guru{g.Username, g.NamaLengkap})
	}

	hariJadwal, errH := s.rekap.HariJadwalSemua(ctx)
	if errH != nil {
		return nil, errH
	}

	weekdayCount := map[string]int{}
	for _, h := range []string{"Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"} {
		weekdayCount[h] = hitungHariDalamRentang(awal, akhir, h)
	}

	stats, errStats := s.rekap.StatistikKehadiranRentang(ctx, dariIndo, sampaiIndo)
	if errStats != nil {
		return nil, errStats
	}

	jumlahJam, errJam := s.rekap.JumlahJamRentang(ctx, dariIndo, sampaiIndo)
	if errJam != nil {
		return nil, errJam
	}

	data := []map[string]interface{}{}
	for _, g := range daftar {
		st := stats[g.uname]
		hadir := st[0]
		totalSeharusnya := 0
		for _, h := range hariJadwal[g.uname] {
			totalSeharusnya += weekdayCount[h]
		}
		var persen interface{} = nil
		if totalSeharusnya > 0 {
			p := int(math.Round(float64(hadir) / float64(totalSeharusnya) * 100))
			if p > 100 {
				p = 100
			}
			persen = p
		}
		data = append(data, map[string]interface{}{
			"username":              g.uname,
			"namaLengkap":           g.nama,
			"jumlahJam":             jumlahJam[g.uname],
			"hadir":                 hadir,
			"izin":                  st[1],
			"sakit":                 st[2],
			"cuti":                  st[3],
			"alpa":                  st[4],
			"persenKehadiranJadwal": persen,
			"hadirSesuaiJadwal":     hadir,
			"totalSeharusnyaJadwal": totalSeharusnya,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) hitungRekapSatuGuru(ctx context.Context, uname, dariIndo, sampaiIndo string, withRincian bool) map[string]interface{} {
	awal, errA := parseTanggalIndo(dariIndo)
	akhir, errB := parseTanggalIndo(sampaiIndo)
	if errA != nil || errB != nil || akhir.Before(awal) {
		return nil
	}

	status, errStatus := s.rekap.StatusKehadiranSatuGuru(ctx, uname, dariIndo, sampaiIndo)
	if errStatus != nil {
		return nil
	}
	hadir, izin, sakit, cuti, alpa := status.Hadir, status.Izin, status.Sakit, status.Cuti, status.Alpa

	jumlahJam, errJam := s.rekap.JumlahJamSatuGuru(ctx, uname, dariIndo, sampaiIndo)
	if errJam != nil {
		return nil
	}

	totalSeharusnya := 0
	hariJadwal, errHari := s.rekap.HariJadwalGuru(ctx, uname)
	if errHari == nil {
		for _, h := range hariJadwal {
			totalSeharusnya += hitungHariDalamRentang(awal, akhir, h)
		}
	}

	var persen interface{} = nil
	if totalSeharusnya > 0 {
		p := int(math.Round(float64(hadir) / float64(totalSeharusnya) * 100))
		if p > 100 {
			p = 100
		}
		persen = p
	}

	data := map[string]interface{}{
		"jumlahJam":             jumlahJam,
		"hadir":                 hadir,
		"izin":                  izin,
		"sakit":                 sakit,
		"cuti":                  cuti,
		"alpa":                  alpa,
		"persenKehadiranJadwal": persen,
		"hadirSesuaiJadwal":     hadir,
		"totalSeharusnyaJadwal": totalSeharusnya,
	}

	if withRincian {
		rincian := []map[string]interface{}{}
		rowsR, errR := s.rekap.RincianAbsensiRentang(ctx, uname, dariIndo, sampaiIndo)
		if errR == nil {
			for _, rec := range rowsR {
				rincian = append(rincian, map[string]interface{}{
					"tanggal":       rec.Tanggal,
					"jam":           rec.Jam,
					"mataPelajaran": rec.Mapel,
					"kelas":         rec.Kelas,
					"jamKe":         rec.JamKe,
					"statusWaktu":   rec.StatusWaktu,
					"keterangan":    rec.Keterangan,
				})
			}
		}
		data["rincian"] = rincian
	}

	return data
}

func (s *Service) GetRincianRekapGuru(ctx context.Context, requestedBy, targetUser string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}
	awal := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, time.Local)
	akhir := awal.AddDate(0, 1, -1)
	return s.bangunRincianRekap(ctx, targetUser, awal.Format("02/01/2006"), akhir.Format("02/01/2006"))
}

func (s *Service) GetRincianRekapGuruRentang(ctx context.Context, requestedBy, targetUser, dari, sampai string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	awal, errA := parseTanggalIndo(dari)
	akhir, errB := parseTanggalIndo(sampai)
	if errA != nil || errB != nil || akhir.Before(awal) {
		return map[string]interface{}{"success": false, "message": "Format atau urutan tanggal tidak valid (gunakan dd/MM/yyyy)"}, nil
	}
	return s.bangunRincianRekap(ctx, targetUser, awal.Format("02/01/2006"), akhir.Format("02/01/2006"))
}

func (s *Service) bangunRincianRekap(ctx context.Context, targetUser, dariIndo, sampaiIndo string) (map[string]interface{}, error) {
	infoGuru, ditemukan, err := s.rekap.InfoGuru(ctx, targetUser)
	if err != nil {
		return nil, err
	}
	if !ditemukan {
		return map[string]interface{}{"success": false, "message": "Guru tidak ditemukan"}, nil
	}
	rekap := s.hitungRekapSatuGuru(ctx, targetUser, dariIndo, sampaiIndo, true)
	if rekap == nil {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}
	rekap["namaLengkap"] = infoGuru.NamaLengkap
	rekap["mataPelajaran"] = infoGuru.MataPelajaran
	rekap["statusSergu"] = infoGuru.StatusSergu
	return map[string]interface{}{"success": true, "data": rekap}, nil
}
