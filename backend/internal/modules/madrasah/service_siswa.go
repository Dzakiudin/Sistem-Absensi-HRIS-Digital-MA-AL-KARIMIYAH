package madrasah

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const cacheRekapPrefix = "rekap:siswa:"

const cacheRekapTTL = 5 * time.Minute

var statusSiswaValid = map[string]bool{
	"H": true,
	"I": true,
	"S": true,
	"A": true,
	"T": true,
}

func (s *Service) GetDaftarSiswa(ctx context.Context, requestedBy string, kelasId int, cari string, halaman int, perHalaman int) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	cari = strings.TrimSpace(cari)

	paginate := halaman > 0
	if perHalaman <= 0 {
		perHalaman = 50
	}
	if paginate && perHalaman > 200 {
		perHalaman = 200
	}
	filter := siswaFilter{
		KelasID:    kelasId,
		Cari:       cari,
		Paginate:   paginate,
		PerHalaman: perHalaman,
	}
	if paginate {
		filter.Offset = (halaman - 1) * perHalaman
	}

	rows, total, err := s.siswa.Daftar(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, r := range rows {
		data = append(data, map[string]interface{}{
			"id":            r.ID,
			"nis":           r.NIS,
			"nisn":          r.NISN,
			"nim":           r.NIM,
			"nik":           r.NIK,
			"namaLengkap":   r.NamaLengkap,
			"jenisKelamin":  r.JenisKelamin,
			"tempatLahir":   r.TempatLahir,
			"tanggalLahir":  r.TanggalLahir,
			"alamat":        r.Alamat,
			"namaOrtu":      r.NamaOrtu,
			"noHpOrtu":      r.NoHpOrtu,
			"status":        r.Status,
			"namaAyah":      r.NamaAyah,
			"namaIbu":       r.NamaIbu,
			"pekerjaanAyah": r.PekerjaanAyah,
			"pekerjaanIbu":  r.PekerjaanIbu,
			"desa":          r.Desa,
			"kecamatan":     r.Kecamatan,
			"kabupaten":     r.Kabupaten,
			"anakKe":        r.AnakKe,
			"umur":          r.Umur,
			"tahunMasuk":    r.TahunMasuk,
			"rt":            r.RT,
			"mark":          r.Mark,
			"yatim":         r.Yatim,
			"kelas":         r.Kelas,
			"tahunAjaran":   r.TahunAjaran,
			"tahunAjaranId": r.TahunAjaranID,
		})
	}
	return map[string]interface{}{
		"success":    true,
		"data":       data,
		"total":      total,
		"halaman":    halaman,
		"perHalaman": perHalaman,
	}, nil
}

func (s *Service) SimpanSiswa(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id := interfaceToInt(payload["id"])
	niS := strings.TrimSpace(fmt.Sprintf("%v", payload["nis"]))
	nisn := strings.TrimSpace(fmt.Sprintf("%v", payload["nisn"]))
	nim := strings.TrimSpace(fmt.Sprintf("%v", payload["nim"]))
	nik := strings.TrimSpace(fmt.Sprintf("%v", payload["nik"]))
	nama := strings.TrimSpace(fmt.Sprintf("%v", payload["namaLengkap"]))
	jk := strings.TrimSpace(fmt.Sprintf("%v", payload["jenisKelamin"]))
	tLahir := strings.TrimSpace(fmt.Sprintf("%v", payload["tempatLahir"]))
	tglLahir := strings.TrimSpace(fmt.Sprintf("%v", payload["tanggalLahir"]))
	alamat := strings.TrimSpace(fmt.Sprintf("%v", payload["alamat"]))
	ortu := strings.TrimSpace(fmt.Sprintf("%v", payload["namaOrtu"]))
	hpOrtu := strings.TrimSpace(fmt.Sprintf("%v", payload["noHpOrtu"]))
	status := strings.TrimSpace(fmt.Sprintf("%v", payload["status"]))
	namaAyah := strings.TrimSpace(fmt.Sprintf("%v", payload["namaAyah"]))
	namaIbu := strings.TrimSpace(fmt.Sprintf("%v", payload["namaIbu"]))
	pekAyah := strings.TrimSpace(fmt.Sprintf("%v", payload["pekerjaanAyah"]))
	pekIbu := strings.TrimSpace(fmt.Sprintf("%v", payload["pekerjaanIbu"]))
	desa := strings.TrimSpace(fmt.Sprintf("%v", payload["desa"]))
	kecamatan := strings.TrimSpace(fmt.Sprintf("%v", payload["kecamatan"]))
	kabupaten := strings.TrimSpace(fmt.Sprintf("%v", payload["kabupaten"]))
	anakKe := strings.TrimSpace(fmt.Sprintf("%v", payload["anakKe"]))
	umur := strings.TrimSpace(fmt.Sprintf("%v", payload["umur"]))
	tahunMasuk := interfaceToInt(payload["tahunMasuk"])
	rt := strings.TrimSpace(fmt.Sprintf("%v", payload["rt"]))
	mark := strings.TrimSpace(fmt.Sprintf("%v", payload["mark"]))
	yatim := false
	if v, ok := payload["yatim"].(bool); ok {
		yatim = v
	}
	if niS == "" || niS == "<nil>" {
		return map[string]interface{}{"success": false, "message": "NIS wajib diisi"}, nil
	}
	if nama == "" || nama == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Nama lengkap wajib diisi"}, nil
	}
	if jk == "" || jk == "<nil>" {
		jk = "Laki-laki"
	}
	if status == "" || status == "<nil>" {
		status = "Aktif"
	}

	in := siswaInput{
		ID:            id,
		NIS:           niS,
		NISN:          nisn,
		NIM:           nim,
		NIK:           nik,
		NamaLengkap:   nama,
		JenisKelamin:  jk,
		TempatLahir:   tLahir,
		TanggalLahir:  tglLahir,
		Alamat:        alamat,
		NamaOrtu:      ortu,
		NoHpOrtu:      hpOrtu,
		Status:        status,
		NamaAyah:      namaAyah,
		NamaIbu:       namaIbu,
		PekerjaanAyah: pekAyah,
		PekerjaanIbu:  pekIbu,
		Desa:          desa,
		Kecamatan:     kecamatan,
		Kabupaten:     kabupaten,
		AnakKe:        anakKe,
		Umur:          umur,
		TahunMasuk:    tahunMasuk,
		RT:            rt,
		Mark:          mark,
		Yatim:         yatim,
	}
	outID, err := s.siswa.Simpan(ctx, in)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Data siswa berhasil disimpan", "siswaId": outID}, nil
}

func (s *Service) HapusSiswa(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	idInt := interfaceToInt(id)
	if err := s.siswa.Hapus(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Data siswa berhasil dihapus"}, nil
}

func (s *Service) ImporSiswaMassal(ctx context.Context, requestedBy string, daftar []interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	berhasil := []string{}
	gagal := []string{}
	inputs := []siswaInput{}

	for _, raw := range daftar {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		niS := strings.TrimSpace(fmt.Sprintf("%v", item["nis"]))
		nama := strings.TrimSpace(fmt.Sprintf("%v", item["namaLengkap"]))
		if niS == "" || nama == "" || niS == "<nil>" || nama == "<nil>" {
			gagal = append(gagal, "(NIS/Nama kosong)")
			continue
		}
		inputs = append(inputs, siswaInput{
			NIS:           niS,
			NISN:          strings.TrimSpace(fmt.Sprintf("%v", item["nisn"])),
			NIM:           strings.TrimSpace(fmt.Sprintf("%v", item["nim"])),
			NIK:           strings.TrimSpace(fmt.Sprintf("%v", item["nik"])),
			NamaLengkap:   nama,
			JenisKelamin:  strings.TrimSpace(fmt.Sprintf("%v", item["jenisKelamin"])),
			TempatLahir:   strings.TrimSpace(fmt.Sprintf("%v", item["tempatLahir"])),
			TanggalLahir:  strings.TrimSpace(fmt.Sprintf("%v", item["tanggalLahir"])),
			Alamat:        strings.TrimSpace(fmt.Sprintf("%v", item["alamat"])),
			NamaOrtu:      strings.TrimSpace(fmt.Sprintf("%v", item["namaOrtu"])),
			NoHpOrtu:      strings.TrimSpace(fmt.Sprintf("%v", item["noHpOrtu"])),
			Status:        strings.TrimSpace(fmt.Sprintf("%v", item["status"])),
			NamaAyah:      strings.TrimSpace(fmt.Sprintf("%v", item["namaAyah"])),
			NamaIbu:       strings.TrimSpace(fmt.Sprintf("%v", item["namaIbu"])),
			PekerjaanAyah: strings.TrimSpace(fmt.Sprintf("%v", item["pekerjaanAyah"])),
			PekerjaanIbu:  strings.TrimSpace(fmt.Sprintf("%v", item["pekerjaanIbu"])),
			Desa:          strings.TrimSpace(fmt.Sprintf("%v", item["desa"])),
			Kecamatan:     strings.TrimSpace(fmt.Sprintf("%v", item["kecamatan"])),
			Kabupaten:     strings.TrimSpace(fmt.Sprintf("%v", item["kabupaten"])),
			AnakKe:        strings.TrimSpace(fmt.Sprintf("%v", item["anakKe"])),
			Umur:          strings.TrimSpace(fmt.Sprintf("%v", item["umur"])),
			TahunMasuk:    interfaceToInt(item["tahunMasuk"]),
			RT:            strings.TrimSpace(fmt.Sprintf("%v", item["rt"])),
			Mark:          strings.TrimSpace(fmt.Sprintf("%v", item["mark"])),
			Yatim: func() bool {
				if v, ok := item["yatim"].(bool); ok {
					return v
				}
				return false
			}(),
		})
	}

	berhasilRepo, gagalRepo, err := s.siswa.ImporMassal(ctx, inputs)
	if err != nil {
		return nil, err
	}
	berhasil = append(berhasil, berhasilRepo...)
	gagal = append(gagal, gagalRepo...)

	return map[string]interface{}{
		"success":  true,
		"message":  fmt.Sprintf("Impor selesai: %d berhasil, %d gagal", len(berhasil), len(gagal)),
		"berhasil": berhasil,
		"gagal":    gagal,
	}, nil
}

func (s *Service) AturSiswaKelas(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	tahunAjaranId := interfaceToInt(payload["tahunAjaranId"])
	kelasId := interfaceToInt(payload["kelasId"])
	var siswaIds []int
	for _, v := range rawList(payload["siswaIds"]) {
		siswaIds = append(siswaIds, interfaceToInt(v))
	}
	var hapusIds []int
	for _, v := range rawList(payload["hapusSiswaIds"]) {
		hapusIds = append(hapusIds, interfaceToInt(v))
	}
	if tahunAjaranId == 0 {
		return map[string]interface{}{"success": false, "message": "Tahun ajaran harus dipilih"}, nil
	}

	terpasang, terlepas, err := s.siswa.AturKelas(ctx, tahunAjaranId, kelasId, siswaIds, hapusIds)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushRekap(ctx)
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("%d siswa dipasang ke kelas, %d siswa dilepas", terpasang, terlepas),
	}, nil
}
