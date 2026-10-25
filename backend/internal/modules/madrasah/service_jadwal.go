package madrasah

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

func (s *Service) GetJadwalSaya(ctx context.Context, username string) (map[string]interface{}, error) {
	jadwal, err := s.jadwal.JadwalGuru(ctx, username)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	data := []map[string]interface{}{}
	for _, j := range jadwal {
		data = append(data, map[string]interface{}{
			"hari":             j.Hari,
			"jamKe":            j.JamKe,
			"mataPelajaran":    j.MataPelajaran,
			"kelas":            j.Kelas,
			"tanggal":          j.Tanggal,
			"penggantian":      j.Penggantian,
			"penggantianUntuk": j.PenggantianUntuk,
		})
	}

	for _, p := range s.rentangAktifUntuk(ctx, username) {
		hariList := daftarHariDalamRentang(p.tanggalMulai, p.tanggalSelesai)
		if len(hariList) == 0 {
			continue
		}
		place := ""
		for i, h := range hariList {
			if i > 0 {
				place += ", "
			}
			place += h
		}
		rows, err := s.jadwal.JadwalGuruPadaHari(ctx, p.username, pgxArrayLower(hariList))
		if err != nil {
			continue
		}
		for _, j := range rows {
			data = append(data, map[string]interface{}{
				"hari":             j.Hari,
				"jamKe":            j.JamKe,
				"mataPelajaran":    j.MataPelajaran,
				"kelas":            j.Kelas,
				"tanggal":          "",
				"penggantian":      true,
				"penggantianUntuk": p.namaLengkap,
				"rentangTanggal":   place,
			})
		}
	}

	data = gabungJamBerurutan(data)

	s.updateKelasTerbaruData(ctx, data)
	return map[string]interface{}{"success": true, "data": data}, nil
}

func ordJam(s string) int {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "I":
		return 1
	case "II":
		return 2
	case "III":
		return 3
	case "IV":
		return 4
	case "V":
		return 5
	case "VI":
		return 6
	case "VII":
		return 7
	case "VIII":
		return 8
	default:
		return 99
	}
}

func ordToRoman(n int) string {
	switch n {
	case 1:
		return "I"
	case 2:
		return "II"
	case 3:
		return "III"
	case 4:
		return "IV"
	case 5:
		return "V"
	case 6:
		return "VI"
	case 7:
		return "VII"
	case 8:
		return "VIII"
	default:
		return "I"
	}
}

func gabungJamBerurutan(data []map[string]interface{}) []map[string]interface{} {
	var normal, penggantian []map[string]interface{}
	for _, d := range data {
		if v, ok := d["penggantian"].(bool); ok && v {
			penggantian = append(penggantian, d)
		} else {
			normal = append(normal, d)
		}
	}

	type groupKey struct{ hari, mapel, kelas string }
	order := []groupKey{}
	groups := map[groupKey][]map[string]interface{}{}

	for _, d := range normal {
		key := groupKey{
			hari:  strings.ToLower(fmt.Sprintf("%v", d["hari"])),
			mapel: strings.ToLower(fmt.Sprintf("%v", d["mataPelajaran"])),
			kelas: strings.ToLower(fmt.Sprintf("%v", d["kelas"])),
		}
		if _, exists := groups[key]; !exists {
			order = append(order, key)
		}
		groups[key] = append(groups[key], d)
	}

	var hasil []map[string]interface{}

	for _, key := range order {
		slots := groups[key]
		sort.Slice(slots, func(i, j int) bool {
			return ordJam(fmt.Sprintf("%v", slots[i]["jamKe"])) <
				ordJam(fmt.Sprintf("%v", slots[j]["jamKe"]))
		})

		i := 0
		for i < len(slots) {
			run := []map[string]interface{}{slots[i]}
			for i+1 < len(slots) &&
				ordJam(fmt.Sprintf("%v", slots[i+1]["jamKe"])) ==
					ordJam(fmt.Sprintf("%v", slots[i]["jamKe"]))+1 {
				i++
				run = append(run, slots[i])
			}
			i++

			first := run[0]
			last := run[len(run)-1]
			entry := map[string]interface{}{}
			for k, v := range first {
				entry[k] = v
			}
			if len(run) > 1 {
				labels := make([]string, len(run))
				for idx, s := range run {
					labels[idx] = fmt.Sprintf("%v", s["jamKe"])
				}
				entry["jamKe"] = strings.Join(labels, "-")
				entry["jamKeDaftar"] = labels
				if v, ok := last["jamSelesai"]; ok {
					entry["jamSelesai"] = v
				}
			}
			hasil = append(hasil, entry)
		}
	}

	return append(hasil, penggantian...)
}

func pgxArrayLower(items []string) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, strings.ToLower(it))
	}
	return out
}

func (s *Service) kelasTerbaruMap(ctx context.Context, labels []string) map[string]map[string]string {
	hasil := map[string]map[string]string{}
	if len(labels) == 0 {
		return hasil
	}
	seen := map[string]bool{}
	keys := []string{}
	for _, l := range labels {
		l = strings.TrimSpace(l)
		if l == "" || l == "<nil>" {
			continue
		}
		lk := strings.ToLower(l)
		if !seen[lk] {
			seen[lk] = true
			keys = append(keys, l)
		}
	}
	if len(keys) == 0 {
		return hasil
	}
	byLabel, err := s.kelas.CariByLabel(ctx, keys)
	if err != nil {
		return hasil
	}
	for key, l := range byLabel {
		hasil[key] = map[string]string{"kode": l.Kode, "nama": l.Nama}
	}
	return hasil
}

func (s *Service) updateKelasTerbaruData(ctx context.Context, data []map[string]interface{}) {
	if len(data) == 0 {
		return
	}
	labels := make([]string, 0, len(data))
	for _, d := range data {
		if l, ok := d["kelas"].(string); ok {
			labels = append(labels, l)
		}
	}
	if len(labels) == 0 {
		return
	}
	m := s.kelasTerbaruMap(ctx, labels)
	for _, d := range data {
		k, ok := d["kelas"].(string)
		if !ok {
			continue
		}
		if v, found := m[strings.ToLower(strings.TrimSpace(k))]; found {
			d["kelas"] = v["kode"]
			d["kelasNama"] = v["nama"]
		} else {
			d["kelasNama"] = k
		}
	}
}

func (s *Service) GetDaftarJadwal(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	daftar, err := s.jadwal.Daftar(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, j := range daftar {
		item := map[string]interface{}{
			"id":            j.ID,
			"username":      j.Username,
			"namaGuru":      j.NamaGuru,
			"hari":          j.Hari,
			"mataPelajaran": j.MataPelajaran,
			"kelas":         j.Kelas,
			"jamKe":         j.JamKe,
			"jamMulai":      nil,
			"jamSelesai":    nil,
		}
		if j.MapelID != nil {
			item["mapelId"] = *j.MapelID
		} else {
			item["mapelId"] = nil
		}
		if j.JamMulai != nil {
			item["jamMulai"] = j.JamMulai.Format("15:04")
		}
		if j.JamSelesai != nil {
			item["jamSelesai"] = j.JamSelesai.Format("15:04")
		}
		data = append(data, item)
	}

	s.updateKelasTerbaruData(ctx, data)
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) TambahJadwal(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	hari := strings.TrimSpace(fmt.Sprintf("%v", payload["hari"]))
	mapel := strings.TrimSpace(fmt.Sprintf("%v", payload["mataPelajaran"]))
	kelas := strings.TrimSpace(fmt.Sprintf("%v", payload["kelas"]))
	jamKe := strings.TrimSpace(fmt.Sprintf("%v", payload["jamKe"]))
	mapelID := interfaceToInt(payload["mapelId"])
	if username == "" || hari == "" || mapel == "" || kelas == "" || jamKe == "" {
		return map[string]interface{}{"success": false, "message": "Semua field wajib diisi"}, nil
	}

	jamMulai, jamSelesai := strings.TrimSpace(fmt.Sprintf("%v", payload["jamMulai"])), ""
	jamSelesai = strings.TrimSpace(fmt.Sprintf("%v", payload["jamSelesai"]))

	if jamMulai == "<nil>" || jamMulai == "nil" || jamMulai == "-" || jamMulai == "null" {
		jamMulai = ""
	}
	if jamSelesai == "<nil>" || jamSelesai == "nil" || jamSelesai == "-" || jamSelesai == "null" {
		jamSelesai = ""
	}
	if jamMulai != "" {
		if _, ok := parseJamHHMM(jamMulai); !ok {
			return map[string]interface{}{"success": false, "message": "Jam mulai tidak valid (format HH:MM)."}, nil
		}
		jamMulai += ":00"
	}
	if jamSelesai != "" {
		if _, ok := parseJamHHMM(jamSelesai); !ok {
			return map[string]interface{}{"success": false, "message": "Jam selesai tidak valid (format HH:MM)."}, nil
		}
		jamSelesai += ":00"
	}

	namaGuru, _ := s.pengguna.NamaGuru(ctx, username)

	if err := s.jadwal.Buat(ctx, jadwalInput{
		Username:      username,
		NamaGuru:      namaGuru,
		Hari:          hari,
		MataPelajaran: mapel,
		Kelas:         kelas,
		JamKe:         jamKe,
		MapelID:       mapelID,
		JamMulai:      jamMulai,
		JamSelesai:    jamSelesai,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Jadwal berhasil ditambahkan"}, nil
}

func (s *Service) HapusJadwal(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	idInt, _ := strconv.Atoi(fmt.Sprintf("%v", id))
	if err := s.jadwal.Hapus(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Jadwal berhasil dihapus"}, nil
}

func (s *Service) UpdateJadwal(ctx context.Context, requestedBy string, payload map[string]interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id := interfaceToInt(payload["id"])
	if id == 0 {
		return map[string]interface{}{"success": false, "message": "ID jadwal wajib diisi"}, nil
	}
	username := strings.TrimSpace(fmt.Sprintf("%v", payload["username"]))
	hari := strings.TrimSpace(fmt.Sprintf("%v", payload["hari"]))
	mapel := strings.TrimSpace(fmt.Sprintf("%v", payload["mataPelajaran"]))
	kelas := strings.TrimSpace(fmt.Sprintf("%v", payload["kelas"]))
	jamKe := strings.TrimSpace(fmt.Sprintf("%v", payload["jamKe"]))
	mapelID := interfaceToInt(payload["mapelId"])
	if username == "" || hari == "" || mapel == "" || kelas == "" || jamKe == "" {
		return map[string]interface{}{"success": false, "message": "Semua field wajib diisi"}, nil
	}

	jamMulai := strings.TrimSpace(fmt.Sprintf("%v", payload["jamMulai"]))
	jamSelesai := strings.TrimSpace(fmt.Sprintf("%v", payload["jamSelesai"]))
	if jamMulai == "<nil>" || jamMulai == "nil" || jamMulai == "-" || jamMulai == "null" {
		jamMulai = ""
	}
	if jamSelesai == "<nil>" || jamSelesai == "nil" || jamSelesai == "-" || jamSelesai == "null" {
		jamSelesai = ""
	}
	if jamMulai != "" {
		if _, ok := parseJamHHMM(jamMulai); !ok {
			return map[string]interface{}{"success": false, "message": "Jam mulai tidak valid (format HH:MM)."}, nil
		}
		jamMulai += ":00"
	}
	if jamSelesai != "" {
		if _, ok := parseJamHHMM(jamSelesai); !ok {
			return map[string]interface{}{"success": false, "message": "Jam selesai tidak valid (format HH:MM)."}, nil
		}
		jamSelesai += ":00"
	}

	namaGuru, _ := s.pengguna.NamaGuru(ctx, username)
	if err := s.jadwal.Perbarui(ctx, jadwalUpdateInput{
		ID:            id,
		Username:      username,
		NamaGuru:      namaGuru,
		Hari:          hari,
		MataPelajaran: mapel,
		Kelas:         kelas,
		JamKe:         jamKe,
		MapelID:       mapelID,
		JamMulai:      jamMulai,
		JamSelesai:    jamSelesai,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Jadwal berhasil diperbarui"}, nil
}
