package madrasah

import (
	"context"
	"fmt"
	"strings"
)

func (s *Service) GetDaftarKelas(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	rows, err := s.kelas.Daftar(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, k := range rows {
		data = append(data, map[string]interface{}{
			"id":          k.ID,
			"kodeKelas":   k.KodeKelas,
			"namaKelas":   k.NamaKelas,
			"tingkat":     k.Tingkat,
			"waliKelasId": k.WaliKelasID,
			"namaWali":    k.NamaWali,
			"isActive":    k.IsActive,
			"jumlahSiswa": k.JumlahSiswa,
		})
	}
	ta := s.tahunAjaranAktif(ctx)
	return map[string]interface{}{"success": true, "data": data, "tahunAjaran": ta}, nil
}

func (s *Service) SimpanKelas(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id := interfaceToInt(payload["id"])
	kode := strings.TrimSpace(fmt.Sprintf("%v", payload["kodeKelas"]))
	nama := strings.TrimSpace(fmt.Sprintf("%v", payload["namaKelas"]))
	tingkat := strings.TrimSpace(fmt.Sprintf("%v", payload["tingkat"]))
	waliId := interfaceToInt(payload["waliKelasId"])
	isActive := true
	if b, ok := payload["isActive"].(bool); ok {
		isActive = b
	}
	if kode == "" || kode == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Kode kelas wajib diisi"}, nil
	}
	if nama == "" || nama == "<nil>" {
		nama = kode
	}
	if tingkat == "" || tingkat == "<nil>" {
		tingkat = strings.Split(kode, "-")[0]
	}

	var wali *int
	if waliId > 0 {
		wali = &waliId
	}

	in := kelasInput{
		ID:          id,
		KodeKelas:   kode,
		NamaKelas:   nama,
		Tingkat:     tingkat,
		WaliKelasID: wali,
		IsActive:    isActive,
	}
	if err := s.kelas.Simpan(ctx, in); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushRekap(ctx)
	return map[string]interface{}{"success": true, "message": "Kelas berhasil disimpan"}, nil
}

func (s *Service) HapusKelas(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	idInt := interfaceToInt(id)
	ada, _ := s.kelas.AdaEnrollment(ctx, idInt)
	if ada {
		return map[string]interface{}{"success": false, "message": "Tidak dapat menghapus kelas yang masih memiliki siswa terdaftar. Pindahkan siswa terlebih dahulu."}, nil
	}
	if err := s.kelas.Hapus(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Kelas berhasil dihapus"}, nil
}

