package madrasah

import (
	"context"
	"fmt"
	"strings"
)

func (s *Service) tahunAjaranAktif(ctx context.Context) map[string]interface{} {
	rec, _ := s.tahunAjaran.Aktif(ctx)
	return map[string]interface{}{
		"id":       rec.ID,
		"kode":     rec.Kode,
		"semester": rec.Semester,
		"nama":     rec.Nama,
	}
}

func (s *Service) GetDaftarTahunAjaran(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	rows, err := s.tahunAjaran.Daftar(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, r := range rows {
		data = append(data, map[string]interface{}{
			"id":             r.ID,
			"kode":           r.Kode,
			"semester":       r.Semester,
			"nama":           r.Nama,
			"tanggalMulai":   r.TanggalMulai,
			"tanggalSelesai": r.TanggalSelesai,
			"aktif":          r.Aktif,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) SimpanTahunAjaran(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id := interfaceToInt(payload["id"])
	kode := strings.TrimSpace(fmt.Sprintf("%v", payload["kode"]))
	semester := strings.TrimSpace(fmt.Sprintf("%v", payload["semester"]))
	nama := strings.TrimSpace(fmt.Sprintf("%v", payload["nama"]))
	tglMulai, errMulai := parseTanggalIndo(fmt.Sprintf("%v", payload["tanggalMulai"]))
	tglSelesai, errSelesai := parseTanggalIndo(fmt.Sprintf("%v", payload["tanggalSelesai"]))
	aktif := false
	aktifDikirim := false
	if b, ok := payload["aktif"].(bool); ok {
		aktif = b
		aktifDikirim = true
	}

	toggleAktif := id > 0 && aktifDikirim && (kode == "" || kode == "<nil>") && (nama == "" || nama == "<nil>" || nama == "0")

	if !toggleAktif && (kode == "" || kode == "<nil>") {
		return map[string]interface{}{"success": false, "message": "Kode tahun ajaran wajib diisi"}, nil
	}
	if nama == "" || nama == "<nil>" {
		nama = kode
	}
	if semester == "" || semester == "<nil>" {
		semester = "Ganjil"
	}

	in := tahunAjaranInput{
		ID:          id,
		Kode:        kode,
		Semester:    semester,
		Nama:        nama,
		Aktif:       aktif,
		ToggleAktif: toggleAktif,
	}
	if errMulai == nil && !tglMulai.IsZero() {
		in.TanggalMulai = &tglMulai
	}
	if errSelesai == nil && !tglSelesai.IsZero() {
		in.TanggalSelesai = &tglSelesai
	}

	if err := s.tahunAjaran.Simpan(ctx, in); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	s.cacheFlushRekap(ctx)
	return map[string]interface{}{"success": true, "message": "Tahun ajaran berhasil disimpan"}, nil
}

func (s *Service) HapusTahunAjaran(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	idInt := interfaceToInt(id)
	ada, _ := s.tahunAjaran.AdaEnrollment(ctx, idInt)
	if ada {
		return map[string]interface{}{"success": false, "message": "Tidak dapat menghapus tahun ajaran yang masih memiliki siswa terdaftar"}, nil
	}
	if err := s.tahunAjaran.Hapus(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Tahun ajaran berhasil dihapus"}, nil
}

