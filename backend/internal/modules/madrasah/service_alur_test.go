package madrasah

import "testing"

func TestStatusIzinDariAksi(t *testing.T) {
	kasus := []struct {
		aksi       string
		wantStatus string
		wantValid  bool
	}{
		{"Setujui", "Disetujui", true},
		{"Tolak", "Ditolak", true},
		{"", "", false},
		{"Ngawur", "", false},
		{"setujui", "", false},
		{"Ditolak", "", false},
	}
	for _, tc := range kasus {
		gotStatus, gotValid := statusIzinDariAksi(tc.aksi)
		if gotStatus != tc.wantStatus || gotValid != tc.wantValid {
			t.Errorf("statusIzinDariAksi(%q) = (%q, %v), mau (%q, %v)",
				tc.aksi, gotStatus, gotValid, tc.wantStatus, tc.wantValid)
		}
	}
}

// Aksi penolakan harus menghasilkan status Ditolak, bukan Disetujui. Ini
// regresi dari bug di mana cabang penolakan tidak pernah dieksekusi sehingga
// pengajuan yang ditolak justru tersimpan sebagai disetujui.
func TestAksiTolakTidakJadiDisetujui(t *testing.T) {
	status, valid := statusIzinDariAksi("Tolak")
	if !valid {
		t.Fatal("Tolak harus dianggap aksi valid")
	}
	if status == "Disetujui" {
		t.Fatal("aksi Tolak tidak boleh menghasilkan status Disetujui")
	}
	if status != "Ditolak" {
		t.Fatalf("aksi Tolak menghasilkan status %q, mau Ditolak", status)
	}
}
