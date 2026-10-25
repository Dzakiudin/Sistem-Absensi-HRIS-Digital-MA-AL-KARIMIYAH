package madrasah

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

func (s *Service) GetSemuaUser(ctx context.Context, requestedBy string) (map[string]interface{}, error) {

	if !s.CheckAccess(ctx, requestedBy, "adminKepala") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	daftar, err := s.pengguna.DaftarLengkap(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, p := range daftar {
		data = append(data, map[string]interface{}{
			"id":                   p.ID,
			"username":             p.Username,
			"role":                 p.Role,
			"namaLengkap":          p.NamaLengkap,
			"mataPelajaran":        p.MataPelajaran,
			"noHp":                 p.NoHp,
			"status":               p.Status,
			"kelas":                p.Kelas,
			"jamKe":                p.JamKe,
			"hariAktif":            p.HariAktif,
			"statusSergu":          p.StatusSergu,
			"mapelAktif":           p.MapelAktif,
			"kelasAktif":           p.KelasAktif,
			"izinkanGuruPengganti": p.IzinkanPengganti,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}

func (s *Service) TambahUser(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	requestedBy := fmt.Sprintf("%v", payload["requestedBy"])
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	username := normalisasiUsername(fmt.Sprintf("%v", payload["username"]))
	password := fmt.Sprintf("%v", payload["password"])
	role := fmt.Sprintf("%v", payload["role"])
	nama := fmt.Sprintf("%v", payload["namaLengkap"])
	mapel := fmt.Sprintf("%v", payload["mataPelajaran"])
	kelas := fmt.Sprintf("%v", payload["kelas"])
	jamKe := fmt.Sprintf("%v", payload["jamKe"])
	hariAktif := fmt.Sprintf("%v", payload["hariAktif"])
	statusSergu := fmt.Sprintf("%v", payload["statusSergu"])
	mapelAktif := fmt.Sprintf("%v", payload["mapelAktif"])
	kelasAktif := fmt.Sprintf("%v", payload["kelasAktif"])
	noHp := fmt.Sprintf("%v", payload["noHp"])
	status := fmt.Sprintf("%v", payload["status"])
	izinkanPengganti, _ := strconv.ParseBool(fmt.Sprintf("%v", payload["izinkanGuruPengganti"]))
	if status == "" {
		status = "Aktif"
	}
	if username == "" || nama == "" {
		return map[string]interface{}{"success": false, "message": "Username dan nama lengkap wajib diisi"}, nil
	}
	if msg := validasiUsernameXC(username); msg != "" {
		return map[string]interface{}{"success": false, "message": msg}, nil
	}
	if len(password) < 6 {
		return map[string]interface{}{"success": false, "message": "Password minimal 6 karakter"}, nil
	}
	if role != "admin" && role != "kepala" && role != "guru" && role != "staf" {
		return map[string]interface{}{"success": false, "message": "Role tidak valid"}, nil
	}

	if err := s.pengguna.Buat(ctx, penggunaInput{
		Username:         username,
		PasswordHash:     HashPassword(password),
		Role:             role,
		NamaLengkap:      nama,
		MataPelajaran:    mapel,
		NoHp:             noHp,
		Status:           status,
		Kelas:            kelas,
		JamKe:            jamKe,
		HariAktif:        hariAktif,
		StatusSergu:      statusSergu,
		MapelAktif:       mapelAktif,
		KelasAktif:       kelasAktif,
		IzinkanPengganti: izinkanPengganti,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": "Gagal menambah user: " + err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Akun berhasil ditambahkan"}, nil
}

func (s *Service) UpdateUser(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	requestedBy := fmt.Sprintf("%v", payload["requestedBy"])
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	id, _ := strconv.Atoi(fmt.Sprintf("%v", payload["id"]))
	usernameBaru := normalisasiUsername(fmt.Sprintf("%v", payload["username"]))
	password := fmt.Sprintf("%v", payload["password"])
	role := fmt.Sprintf("%v", payload["role"])
	nama := fmt.Sprintf("%v", payload["namaLengkap"])
	mapel := fmt.Sprintf("%v", payload["mataPelajaran"])
	kelas := fmt.Sprintf("%v", payload["kelas"])
	jamKe := fmt.Sprintf("%v", payload["jamKe"])
	hariAktif := fmt.Sprintf("%v", payload["hariAktif"])
	statusSergu := fmt.Sprintf("%v", payload["statusSergu"])
	mapelAktif := fmt.Sprintf("%v", payload["mapelAktif"])
	kelasAktif := fmt.Sprintf("%v", payload["kelasAktif"])
	noHp := fmt.Sprintf("%v", payload["noHp"])
	status := fmt.Sprintf("%v", payload["status"])
	izinkanPengganti, _ := strconv.ParseBool(fmt.Sprintf("%v", payload["izinkanGuruPengganti"]))
	if id == 0 {
		return map[string]interface{}{"success": false, "message": "ID user tidak valid"}, nil
	}
	if role != "admin" && role != "kepala" && role != "guru" && role != "staf" {
		return map[string]interface{}{"success": false, "message": "Role tidak valid"}, nil
	}
	if password != "" && password != "<nil>" && len(password) < 6 {
		return map[string]interface{}{"success": false, "message": "Password minimal 6 karakter"}, nil
	}

	usernameLama, err := s.pengguna.UsernameBerdasarkanID(ctx, id)
	if err != nil {
		return map[string]interface{}{"success": false, "message": "Akun tidak ditemukan"}, nil
	}
	usernameLama = normalisasiUsername(usernameLama)
	usernameBerubah := usernameBaru != "" && usernameBaru != usernameLama

	if usernameBerubah {
		if msg := validasiUsernameXC(usernameBaru); msg != "" {
			return map[string]interface{}{"success": false, "message": msg}, nil
		}
		dipakai, err := s.pengguna.UsernameDipakai(ctx, usernameBaru, id)
		if err != nil {
			return nil, err
		}
		if dipakai {
			return map[string]interface{}{"success": false, "message": "Username sudah dipakai akun lain"}, nil
		}
	}

	hash := ""
	if password != "" && password != "<nil>" {
		hash = HashPassword(password)
	}
	usernameBaruEfektif := ""
	if usernameBerubah {
		usernameBaruEfektif = usernameBaru
	}
	if err := s.pengguna.PerbaruiAkun(ctx, penggunaUpdateInput{
		ID:               id,
		UsernameLama:     usernameLama,
		UsernameBaru:     usernameBaruEfektif,
		PasswordHash:     hash,
		Role:             role,
		NamaLengkap:      nama,
		MataPelajaran:    mapel,
		NoHp:             noHp,
		Status:           status,
		Kelas:            kelas,
		JamKe:            jamKe,
		HariAktif:        hariAktif,
		StatusSergu:      statusSergu,
		MapelAktif:       mapelAktif,
		KelasAktif:       kelasAktif,
		IzinkanPengganti: izinkanPengganti,
	}); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}

	pesan := "Akun berhasil diperbarui"
	if usernameBerubah {
		pesan = "Akun berhasil diperbarui. Username diubah dari " + usernameLama + " ke " + usernameBaru
	}
	return map[string]interface{}{"success": true, "message": pesan}, nil
}

func (s *Service) HapusUser(ctx context.Context, requestedBy string, id interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}
	idInt, _ := strconv.Atoi(fmt.Sprintf("%v", id))
	if err := s.pengguna.Hapus(ctx, idInt); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}, nil
	}
	return map[string]interface{}{"success": true, "message": "Akun berhasil dihapus"}, nil
}

var validKategori = map[string]bool{"Hadir": true, "Izin": true, "Sakit": true, "Cuti": true, "Alpa": true}

func (s *Service) ImporGuruMassal(ctx context.Context, requestedBy string, daftarGuru []interface{}) (map[string]interface{}, error) {
	if !s.CheckAccess(ctx, requestedBy, "admin") {
		return map[string]interface{}{"success": false, "message": "Akses ditolak"}, nil
	}

	if err := s.pengguna.SiapkanKolomImpor(ctx); err != nil {
		return nil, err
	}

	existingSet := map[string]bool{}
	if daftar, err := s.pengguna.DaftarUsername(ctx); err == nil {
		for _, u := range daftar {
			existingSet[strings.ToLower(u)] = true
		}
	}

	slugify := func(nama string) string {
		nama = strings.ToLower(strings.TrimSpace(nama))
		var b strings.Builder
		for _, c := range nama {
			if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
				b.WriteRune(c)
			}
		}
		s := b.String()
		if s == "" {
			s = "guru"
		}
		return s
	}

	uniqueUsername := func(base string) string {
		candidate := base
		suffix := 2
		for existingSet[candidate] {
			candidate = base + strconv.Itoa(suffix)
			suffix++
		}
		existingSet[candidate] = true
		return candidate
	}

	type kredensialItem struct {
		Nama     string `json:"nama"`
		Username string `json:"username"`
		Password string `json:"password"`
	}

	berhasil := []string{}
	gagal := []string{}
	kredensial := []kredensialItem{}

	for _, g := range daftarGuru {
		item, ok := g.(map[string]interface{})
		if !ok {
			continue
		}
		nama := strings.TrimSpace(fmt.Sprintf("%v", item["namaLengkap"]))
		username := strings.TrimSpace(fmt.Sprintf("%v", item["username"]))
		password := strings.TrimSpace(fmt.Sprintf("%v", item["password"]))
		nipNuptk := strings.TrimSpace(fmt.Sprintf("%v", item["nipNuptk"]))
		mapel := fmt.Sprintf("%v", item["mataPelajaran"])
		kelas := fmt.Sprintf("%v", item["kelas"])
		jamKe := fmt.Sprintf("%v", item["jamKe"])
		noHp := fmt.Sprintf("%v", item["noHp"])
		gelar := strings.TrimSpace(fmt.Sprintf("%v", item["gelar"]))
		statusKepeg := strings.TrimSpace(fmt.Sprintf("%v", item["statusKepegawaian"]))

		if nama == "" || nama == "<nil>" {
			gagal = append(gagal, "(baris kosong)")
			continue
		}

		if username == "" || username == "<nil>" {
			if nipNuptk != "" && nipNuptk != "<nil>" {
				username = slugify(nipNuptk)
			} else {
				username = slugify(nama)
			}
		}
		username = strings.ToLower(username)
		username = uniqueUsername(username)

		if password == "" || password == "<nil>" {
			password = username + "123"
		}
		if nipNuptk == "<nil>" {
			nipNuptk = ""
		}
		if gelar == "<nil>" {
			gelar = ""
		}
		if statusKepeg == "<nil>" {
			statusKepeg = ""
		}

		err := s.pengguna.Buat(ctx, penggunaInput{
			Username:          username,
			PasswordHash:      HashPassword(password),
			Role:              "guru",
			NamaLengkap:       nama,
			MataPelajaran:     mapel,
			Kelas:             kelas,
			JamKe:             jamKe,
			NoHp:              noHp,
			Status:            "Aktif",
			NIP:               nipNuptk,
			Gelar:             gelar,
			StatusKepegawaian: statusKepeg,
		})

		if err != nil {
			gagal = append(gagal, fmt.Sprintf("%s (%s)", nama, err.Error()))
		} else {
			berhasil = append(berhasil, nama)
			kredensial = append(kredensial, kredensialItem{Nama: nama, Username: username, Password: password})
		}
	}

	kredensialOut := make([]map[string]interface{}, len(kredensial))
	for i, k := range kredensial {
		kredensialOut[i] = map[string]interface{}{"nama": k.Nama, "username": k.Username, "password": k.Password}
	}

	return map[string]interface{}{
		"success":    true,
		"message":    fmt.Sprintf("Impor selesai: %d berhasil, %d dilewati", len(berhasil), len(gagal)),
		"berhasil":   berhasil,
		"gagal":      gagal,
		"kredensial": kredensialOut,
	}, nil
}

func (s *Service) GetDaftarGuru(ctx context.Context, requestedBy string) (map[string]interface{}, error) {
	guru, err := s.pengguna.DaftarGuruAktif(ctx)
	if err != nil {
		return nil, err
	}

	data := []map[string]interface{}{}
	for _, g := range guru {
		data = append(data, map[string]interface{}{
			"username":      g.Username,
			"namaLengkap":   g.NamaLengkap,
			"mataPelajaran": g.MataPelajaran,
			"kelas":         g.Kelas,
			"jamKe":         g.JamKe,
		})
	}
	return map[string]interface{}{"success": true, "data": data}, nil
}
