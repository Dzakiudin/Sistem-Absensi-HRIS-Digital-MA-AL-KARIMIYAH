package madrasah

import (
	"context"
	"fmt"
	"strings"
)

func (s *Service) GetPermintaanPengganti(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	permintaan, err := s.izin.DaftarPermintaanPengganti(ctx, requestedBy)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, p := range permintaan {
		data = append(data, map[string]interface{}{
			"id":         p.ID,
			"izinId":     p.IzinID,
			"guruAsal":   p.GuruAsal,
			"namaAsal":   p.NamaAsal,
			"jenis":      p.Jenis,
			"tglMulai":   p.TglMulai.Format("02/01/2006"),
			"tglSelesai": p.TglSelesai.Format("02/01/2006"),
			"alasan":     p.Alasan,
		})
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) JawabPengganti(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	requestedBy := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	penggantiID := interfaceToInt(payload["penggantiId"])
	jawab := strings.TrimSpace(fmt.Sprintf("%v", payload["jawab"]))

	if penggantiID <= 0 {
		return map[string]interface{}{"success": false, "message": "ID permintaan tidak valid."}, nil
	}
	jawab = normalisasiJawabanPengganti(jawab)
	if jawab == "" {
		return map[string]interface{}{"success": false, "message": "Jawaban harus Diterima atau Ditolak."}, nil
	}

	permintaan, err := s.izin.AmbilPenggantiByID(ctx, penggantiID)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Permintaan tidak ditemukan."}, nil
	}
	if !strings.EqualFold(permintaan.GuruPengganti, requestedBy) {
		return map[string]interface{}{"success": false, "message": "Permintaan ini bukan untuk Anda."}, nil
	}
	if permintaan.Status != "Pending" {
		return map[string]interface{}{"success": false, "message": "Permintaan ini sudah dijawab."}, nil
	}

	rowsAf, err := s.izin.JawabPermintaanPengganti(ctx, s.db, penggantiID, jawab, requestedBy)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	if rowsAf == 0 {
		return map[string]interface{}{"success": false, "message": "Permintaan ini sudah dijawab."}, nil
	}

	if jawab == "Diterima" {

		if err := s.izin.AlihkanSesiKePengganti(ctx, s.db, penggantiID, permintaan.GuruPengganti, permintaan.NamaPengganti); err != nil {
			return map[string]interface{}{"success": false, "message": err.Error()}, nil
		}
	}

	pesan := "Permintaan penggantian diterima."
	if jawab == "Ditolak" {
		pesan = "Permintaan penggantian ditolak. Sesi tetap menjadi tanggung jawab guru asal."
	}
	return map[string]interface{}{"success": true, "message": pesan}, nil
}

func normalisasiJawabanPengganti(jawab string) string {
	switch strings.ToLower(strings.TrimSpace(jawab)) {
	case "terima", "diterima":
		return "Diterima"
	case "tolak", "ditolak":
		return "Ditolak"
	default:
		return ""
	}
}

