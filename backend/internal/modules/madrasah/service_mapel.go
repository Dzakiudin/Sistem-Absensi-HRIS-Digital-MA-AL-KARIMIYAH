package madrasah

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func (s *Service) GetDaftarMapel(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	rows, err := s.mapel.Daftar(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, m := range rows {
		data = append(data, map[string]interface{}{
			"id":       m.ID,
			"kode":     m.Kode,
			"nama":     m.Nama,
			"kelompok": m.Kelompok,
			"aktif":    m.Aktif,
		})
	}

	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) SimpanMapel(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	in := mapelInput{
		ID:       interfaceToInt(payload["id"]),
		Kode:     strings.TrimSpace(fmt.Sprintf("%v", payload["kode"])),
		Nama:     strings.TrimSpace(fmt.Sprintf("%v", payload["nama"])),
		Kelompok: strings.TrimSpace(fmt.Sprintf("%v", payload["kelompok"])),
		Aktif:    true,
	}
	if v, ok := payload["aktif"].(bool); ok {
		in.Aktif = v
	}
	if in.Kelompok == "" || in.Kelompok == "<nil>" {
		in.Kelompok = "Wajib"
	}
	if in.Nama == "" || in.Nama == "<nil>" {
		return map[string]interface{}{"success": false, "message": "Nama mapel wajib diisi."}, nil
	}

	id, err := s.mapel.Simpan(ctx, in)
	if err != nil {
		if errors.Is(err, ErrMapelDuplikat) {
			return map[string]interface{}{"success": false, "message": "Mapel dengan nama tersebut sudah ada."}, nil
		}
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	if in.ID > 0 {
		return map[string]interface{}{"success": true, "message": "Mapel berhasil diperbarui", "id": id}, nil
	}
	return map[string]interface{}{"success": true, "message": "Mapel berhasil ditambahkan", "id": id}, nil
}

func (s *Service) HapusMapel(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id := interfaceToInt(payload["id"])
	if id <= 0 {
		return map[string]interface{}{"success": false, "message": "ID mapel tidak valid."}, nil
	}

	if err := s.mapel.Nonaktifkan(ctx, id); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{
		"success": true,
		"message": "Mapel dinonaktifkan. Jadwal lama tetap tersimpan.",
	}, nil
}
