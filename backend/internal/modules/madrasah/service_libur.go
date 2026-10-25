package madrasah

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func (s *Service) GetDaftarLibur(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	libur, err := s.hariLibur.Daftar(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, l := range libur {
		data = append(data, map[string]interface{}{"tanggal": l.Tanggal, "keterangan": l.Keterangan})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) TambahLiburRentang(ctx context.Context, requestedBy, tglMulai, tglSelesai, ket string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	parseTgl := func(str string) (time.Time, error) {
		parts := strings.Split(str, "/")
		if len(parts) == 3 {
			d, _ := strconv.Atoi(parts[0])
			m, _ := strconv.Atoi(parts[1])
			y, _ := strconv.Atoi(parts[2])
			return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.Local), nil
		}
		return time.Time{}, fmt.Errorf("invalid format")
	}

	start, err := parseTgl(tglMulai)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Format tanggal salah"}, nil
	}
	end, err := parseTgl(tglSelesai)
	if err != nil {
		end = start
	}

	for cur := start; !cur.After(end); cur = cur.AddDate(0, 0, 1) {
		tglStr := cur.Format("02/01/2006")
		if err := s.hariLibur.Simpan(ctx, tglStr, ket); err != nil {
			return nil, err
		}
	}

	return map[string]interface{}{"success": true, "message": "Hari libur berhasil ditambahkan"}, nil
}

func (s *Service) HapusLibur(ctx context.Context, requestedBy, tanggal string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	if err := s.hariLibur.Hapus(ctx, tanggal); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Hari libur berhasil dihapus"}, nil
}
