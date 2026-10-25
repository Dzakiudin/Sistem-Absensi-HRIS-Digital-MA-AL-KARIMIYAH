package madrasah

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Service) AjukanIzin(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	jenis := strings.TrimSpace(fmt.Sprintf("%v", payload["jenis"]))
	alasan := fmt.Sprintf("%v", payload["alasan"])
	tglMulaiStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tglMulai"]))
	tglSelesaiStr := strings.TrimSpace(fmt.Sprintf("%v", payload["tglSelesai"]))
	guruPengganti := strings.TrimSpace(fmt.Sprintf("%v", payload["guruPengganti"]))

	if jenis != "Izin" && jenis != "Sakit" && jenis != "Cuti" {
		return map[string]interface{}{"success": false, "message": "Jenis pengajuan harus Izin, Sakit, atau Cuti."}, nil
	}
	tglMulai, err := parseTanggalIndo(tglMulaiStr)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Tanggal mulai tidak valid (format DD/MM/YYYY)."}, nil
	}
	tglSelesai, err := parseTanggalIndo(tglSelesaiStr)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Tanggal selesai tidak valid (format DD/MM/YYYY)."}, nil
	}
	if tglSelesai.Before(tglMulai) {
		return map[string]interface{}{"success": false, "message": "Tanggal selesai tidak boleh lebih awal dari tanggal mulai."}, nil
	}
	if tglMulai.Before(time.Now().AddDate(0, 0, -30)) {
		return map[string]interface{}{
			"success": false,
			"message": "Pengajuan lebih dari 30 hari ke belakang tidak bisa dibuat lewat form. Hubungi admin.",
		}, nil
	}

	pegawai, errPegawai := s.pengguna.CariBerdasarkanUsername(ctx, username)
	if errPegawai != nil || pegawai.Status != "Aktif" {
		return map[string]interface{}{"success": false, "message": "Data pegawai tidak ditemukan atau akun tidak aktif."}, nil
	}
	nama := pegawai.NamaLengkap

	bentrok, errBentrok := s.izin.AdaBentrok(ctx, s.db, username, tglMulai, tglSelesai)
	if errBentrok == nil && bentrok {
		return map[string]interface{}{"success": false, "message": "Sudah ada pengajuan yang mencakup periode tersebut."}, nil
	}

	var namaPengganti string
	pakaiPengganti := guruPengganti != "" && guruPengganti != "<nil>"
	if pakaiPengganti {
		if strings.EqualFold(guruPengganti, username) {
			return map[string]interface{}{
				"success": false,
				"message": "Guru pengganti tidak boleh sama dengan pemohon.",
			}, nil
		}
		pegawaiPengganti, errPengganti := s.pengguna.CariBerdasarkanUsername(ctx, guruPengganti)
		if errPengganti != nil || pegawaiPengganti.Status != "Aktif" {
			return map[string]interface{}{
				"success": false,
				"message": "Guru pengganti tidak valid atau tidak aktif.",
			}, nil
		}
		if pegawaiPengganti.Role != "guru" && pegawaiPengganti.Role != "staf" {
			return map[string]interface{}{
				"success": false,
				"message": "Guru pengganti tidak valid.",
			}, nil
		}
		namaPengganti = pegawaiPengganti.NamaLengkap
	}

	var pengganti *permintaanPenggantiInput
	if pakaiPengganti {
		pengganti = &permintaanPenggantiInput{
			GuruAsal:      username,
			NamaAsal:      nama,
			GuruPengganti: guruPengganti,
			NamaPengganti: namaPengganti,
		}
	}

	izinID, tersimpan, err := s.izin.Ajukan(ctx, pengajuanIzinInput{
		Username:     username,
		Nama:         nama,
		Jenis:        jenis,
		TglMulai:     tglMulai,
		TglSelesai:   tglSelesai,
		Alasan:       alasan,
		DiajukanOleh: username,
	}, pengganti)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Gagal menyimpan pengajuan: " + err.Error()}, nil
	}
	if pakaiPengganti && !tersimpan {
		return map[string]interface{}{
			"success": false,
			"message": "Sudah ada permintaan pengganti untuk pengajuan ini.",
		}, nil
	}

	return map[string]interface{}{
		"success": true,
		"message": "Pengajuan " + jenis + " berhasil dikirim. Menunggu persetujuan Kepala Madrasah.",
		"izinId":  izinID,
	}, nil
}

func (s *Service) GetIzinSaya(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	bisaSemua := s.CheckAccess(ctx, requestedBy, "adminKepala")

	filter := pengajuanFilter{Limit: 300}
	if !bisaSemua {
		filter.Username = requestedBy
	}

	pengajuan, err := s.izin.DaftarPengajuan(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, p := range pengajuan {
		item := map[string]interface{}{
			"id":               p.ID,
			"username":         p.Username,
			"nama":             p.Nama,
			"jenis":            p.Jenis,
			"tglMulai":         p.TglMulai.Format("02/01/2006"),
			"tglSelesai":       p.TglSelesai.Format("02/01/2006"),
			"alasan":           p.Alasan,
			"status":           p.Status,
			"disetujuiOleh":    p.DisetujuiOleh,
			"catatanKeputusan": p.CatatanKeputusan,
			"waktuKeputusan":   nil,
			"guruPengganti":    p.GuruPengganti,
			"namaPengganti":    p.NamaPengganti,
			"statusPengganti":  p.StatusPengganti,
		}
		if p.WaktuKeputusan != nil {
			item["waktuKeputusan"] = p.WaktuKeputusan.Format("02/01/2006 15:04")
		}
		data = append(data, item)
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) GetIzinUntukApproval(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	pengajuan, err := s.izin.DaftarPengajuan(ctx, pengajuanFilter{Status: "Pending", Menaik: true})
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, p := range pengajuan {
		data = append(data, map[string]interface{}{
			"id":              p.ID,
			"username":        p.Username,
			"nama":            p.Nama,
			"jenis":           p.Jenis,
			"tglMulai":        p.TglMulai.Format("02/01/2006"),
			"tglSelesai":      p.TglSelesai.Format("02/01/2006"),
			"alasan":          p.Alasan,
			"guruPengganti":   p.GuruPengganti,
			"namaPengganti":   p.NamaPengganti,
			"statusPengganti": p.StatusPengganti,
		})
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) ProsesIzin(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "kepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	izinID := interfaceToInt(payload["izinId"])
	aksi := strings.TrimSpace(fmt.Sprintf("%v", payload["aksi"]))
	catatan := fmt.Sprintf("%v", payload["catatan"])
	statusBaru, aksiValid := statusIzinDariAksi(aksi)

	if izinID <= 0 {
		return map[string]interface{}{"success": false, "message": "ID pengajuan tidak valid."}, nil
	}
	if !aksiValid {
		return map[string]interface{}{"success": false, "message": "Aksi harus Setujui atau Tolak."}, nil
	}

	pengajuan, err := s.izin.AmbilPengajuanByID(ctx, izinID)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Pengajuan tidak ditemukan."}, nil
	}
	if pengajuan.Status != "Pending" {
		return map[string]interface{}{
			"success": false,
			"message": "Pengajuan ini sudah diproses dengan status " + pengajuan.Status + ".",
		}, nil
	}
	username := pengajuan.Username
	nama := pengajuan.Nama
	jenis := pengajuan.Jenis
	tglMulai := pengajuan.TglMulai
	tglSelesai := pengajuan.TglSelesai

	var hasil map[string]interface{}
	flushHonor := false
	err = s.db.WithTx(ctx, func(tx pgx.Tx) error {
		rowsAf, err := s.izin.UbahStatusPengajuan(ctx, tx, izinID, statusBaru, requestedBy, catatan)
		if err != nil {
			hasil = map[string]interface{}{"success": false, "message": err.Error()}
			return errRollback
		}

		if rowsAf == 0 {
			hasil = map[string]interface{}{"success": false, "message": "Pengajuan ini sudah diproses."}
			return errRollback
		}

		if aksi == "Tolak" {

			if err := s.izin.BatalkanPermintaanPenggantiPending(ctx, tx, izinID); err != nil {
				hasil = map[string]interface{}{"success": false, "message": err.Error()}
				return errRollback
			}
			hasil = map[string]interface{}{
				"success": true,
				"message": "Pengajuan " + jenis + " " + nama + " ditolak.",
			}
			return nil
		}

		for _, tgl := range daftarTanggal(tglMulai, tglSelesai) {
			if err := s.absensiHarian.SimpanPenandaIzin(ctx, tx, tgl.Format("2006-01-02"), username, nama, jenis, "Disetujui oleh "+requestedBy, izinID); err != nil {
				hasil = map[string]interface{}{"success": false, "message": "Gagal membuat absensi izin: " + err.Error()}
				return errRollback
			}
		}

		if err := s.materialisasiSesiIzin(ctx, tx, izinID, username, nama, tglMulai, tglSelesai); err != nil {
			hasil = map[string]interface{}{"success": false, "message": "Gagal menyiapkan sesi mengajar: " + err.Error()}
			return errRollback
		}

		hasil = map[string]interface{}{
			"success": true,
			"message": "Pengajuan " + jenis + " " + nama + " disetujui.",
		}
		flushHonor = true
		return nil
	})
	if err != nil {
		if errors.Is(err, errRollback) {
			return hasil, nil
		}
		var ce *commitError
		if errors.As(err, &ce) {
			return map[string]interface{}{"success": false, "message": ce.Error()}, nil
		}
		return nil, err
	}

	if flushHonor {
		s.cacheFlushHonor(ctx)
	}
	return hasil, nil
}

func statusIzinDariAksi(aksi string) (string, bool) {
	switch aksi {
	case "Setujui":
		return "Disetujui", true
	case "Tolak":
		return "Ditolak", true
	default:
		return "", false
	}
}

func (s *Service) materialisasiSesiIzin(ctx context.Context, tx pgx.Tx, izinID int, username, nama string, tglMulai, tglSelesai time.Time) error {
	pengganti, err := s.izin.AmbilPenggantiByIzin(ctx, tx, izinID)
	if err != nil {
		return err
	}
	var pengguna, namaPengganti string
	penggantiDipakai := false
	if pengganti != nil {
		pengguna = pengganti.GuruPengganti
		namaPengganti = pengganti.NamaPengganti
		penggantiDipakai = pengganti.Status == "Diterima"
	}

	jadwals, err := s.sesi.JadwalGuru(ctx, tx, username)
	if err != nil {
		return err
	}

	for _, tgl := range daftarTanggal(tglMulai, tglSelesai) {
		tglStr := tgl.Format("02/01/2006")
		if isLibur, _ := s.ApakahHariLibur(ctx, tglStr); isLibur {
			continue
		}
		namaHari := namaHariDariTanggal(tgl)

		for _, b := range jadwals {
			if !strings.EqualFold(strings.TrimSpace(b.Hari), namaHari) {
				continue
			}

			durasi := 40
			if b.JamMulai != nil && b.JamSelesai != nil {
				durasi = int(b.JamSelesai.Sub(*b.JamMulai).Minutes())
				if durasi <= 0 {
					durasi = 40
				}
			}

			penggunaSesi, namaSesi, namaPenggantiSesi := username, nama, ""
			statusSesi := "Digantikan"
			if penggantiDipakai {
				penggunaSesi, namaSesi, namaPenggantiSesi = pengguna, namaPengganti, nama
				statusSesi = "Mengajar"
			}

			if err := s.sesi.SimpanSesiIzin(ctx, tx, sesiIzinInput{
				JadwalID:      b.ID,
				Tanggal:       tgl,
				Hari:          namaHari,
				JamKe:         b.JamKe,
				JamMulai:      b.JamMulai,
				JamSelesai:    b.JamSelesai,
				Mapel:         b.Mapel,
				Kelas:         b.Kelas,
				PengajarUtama: username,
				NamaPengajar:  namaSesi,
				Pengguna:      penggunaSesi,
				NamaPengganti: namaPenggantiSesi,
				StatusSesi:    statusSesi,
				DurasiMenit:   durasi,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) BatalkanIzin(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	izinID := interfaceToInt(payload["izinId"])
	if izinID <= 0 {
		return map[string]interface{}{"success": false, "message": "ID pengajuan tidak valid."}, nil
	}

	pengajuan, err := s.izin.AmbilPengajuanByID(ctx, izinID)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Pengajuan tidak ditemukan."}, nil
	}
	if !strings.EqualFold(pengajuan.Username, username) && !s.CheckAccess(ctx, username, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if pengajuan.Status != "Pending" {
		return map[string]interface{}{
			"success": false,
			"message": "Hanya pengajuan yang belum diproses bisa dibatalkan.",
		}, nil
	}

	if err := s.izin.BatalkanPengajuan(ctx, s.db, izinID); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	_ = s.izin.BatalkanPermintaanPenggantiPending(ctx, s.db, izinID)

	return map[string]interface{}{"success": true, "message": "Pengajuan dibatalkan."}, nil
}

func (s *Service) GetMonitoringIzin(ctx context.Context, requestedBy string, bulan, tahun int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 {
		return map[string]interface{}{"success": false, "message": "Periode tidak valid"}, nil
	}

	rekap, err := s.izin.MonitoringBulanan(ctx, bulan, tahun)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, m := range rekap {
		data = append(data, map[string]interface{}{
			"username":        m.Username,
			"nama":            m.Nama,
			"jenis":           m.Jenis,
			"jumlahPengajuan": m.Jumlah,
			"totalHari":       m.TotalHari,
			"periodeMulai":    m.Mulai.Format("02/01/2006"),
			"periodeSelesai":  m.Selesai.Format("02/01/2006"),
			"namaPengganti":   m.NamaPengganti,
		})
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) GetSesiMengajar(ctx context.Context, requestedBy, tanggal string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	tgl, err := parseTanggalIndo(tanggal)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Tanggal tidak valid (format DD/MM/YYYY)."}, nil
	}

	rows, err := s.sesi.SesiTanggal(ctx, tgl.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, b := range rows {
		item := map[string]interface{}{
			"hari":          b.Hari,
			"jamKe":         b.JamKe,
			"mapel":         b.Mapel,
			"kelas":         b.Kelas,
			"pengajarUtama": b.PengajarUtama,
			"namaPengajar":  b.NamaPengajar,
			"pengguna":      b.Pengguna,
			"namaPengganti": b.NamaPengganti,
			"statusSesi":    b.StatusSesi,
			"durasiMenit":   b.DurasiMenit,
			"jamMulai":      nil,
			"jamSelesai":    nil,
		}
		if b.JamMulai != nil {
			item["jamMulai"] = b.JamMulai.Format("15:04")
		}
		if b.JamSelesai != nil {
			item["jamSelesai"] = b.JamSelesai.Format("15:04")
		}
		data = append(data, item)
	}

	return map[string]interface{}{
		"success": true,
		"tanggal": tgl.Format("02/01/2006"),
		"hari":    namaHariDariTanggal(tgl),
		"data":    data,
	}, nil
}

