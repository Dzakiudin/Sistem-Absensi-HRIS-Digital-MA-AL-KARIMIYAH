package madrasah

import (
	"testing"
)

// kreditUntuk mengambil kredit untuk satu username.
func kreditUntuk(kredits []kreditHonor, pengguna string) (kreditHonor, bool) {
	for _, k := range kredits {
		if k.Pengguna == pengguna {
			return k, true
		}
	}
	return kreditHonor{}, false
}

func TestKreditSesiMengajarBiasa(t *testing.T) {
	k := kreditSesi("guru_a", "guru_a", "Mengajar", "Proporsional", 50)
	if len(k) != 1 {
		t.Fatalf("harus 1 baris honor, dapat %d: %+v", len(k), k)
	}
	if k[0].Persen != 100 {
		t.Errorf("mengajar biasa harus 100 persen, dapat %v", k[0].Persen)
	}
	if k[0].Alasan != "Mengajar" {
		t.Errorf("alasan tidak sesuai, dapat %q", k[0].Alasan)
	}
	// Kebijakan izin tidak boleh bocor ke sesi mengajar biasa.
	if _, ada := kreditUntuk(k, "guru_lain"); ada {
		t.Error("tidak boleh ada kredit untuk guru lain pada sesi mengajar biasa")
	}
}

func TestKreditSesiDigantikanDiterimaPengganti(t *testing.T) {
	// Guru B yang teach: B dapat penuh, A tidak dapat honor apa pun karena
	// slotnya sudah dialihkan ke B. Kebijakan izin tidak berlaku di sini.
	for _, tc := range []struct {
		kebijakan string
	}{
		{"Proporsional"},
		{"Penuh"},
		{"TidakDiberi"},
		{"TidakDikenal"},
	} {
		k := kreditSesi("guru_b", "guru_a", "Mengajar", tc.kebijakan, 50)
		if len(k) != 2 {
			t.Fatalf("%s: harus 2 baris honor, dapat %d: %+v", tc.kebijakan, len(k), k)
		}

		b, ok := kreditUntuk(k, "guru_b")
		if !ok {
			t.Fatalf("%s: pengganti harus dapat honor", tc.kebijakan)
		}
		if b.Persen != 100 {
			t.Errorf("%s: pengganti harus 100 persen, dapat %v", tc.kebijakan, b.Persen)
		}

		a, ok := kreditUntuk(k, "guru_a")
		if !ok {
			t.Fatalf("%s: guru asal harus tetap punya baris supaya slip-nya lengkap", tc.kebijakan)
		}
		if a.Persen != 0 {
			t.Errorf("%s: guru asal harus 0 persen saat ada pengganti, dapat %v", tc.kebijakan, a.Persen)
		}
	}
}

func TestKreditSesiDigantikanTanpaPengganti(t *testing.T) {
	// Tidak ada yang benar-benar teach: hanya guru asal yang dapat baris
	// sesuai kebijakan, tanpa kredit mengajar penuh.
	for _, tc := range []struct {
		kebijakan string
		harapan   float64
	}{
		{"Penuh", 100},
		{"Proporsional", 50},
		{"TidakDiberi", 0},
		{"TidakDikenal", 50}, // nilai tak dikenal jatuh ke default 50
	} {
		k := kreditSesi("guru_a", "guru_a", "Digantikan", tc.kebijakan, 50)
		if len(k) != 1 {
			t.Fatalf("%s: harus 1 baris, dapat %d: %+v", tc.kebijakan, len(k), k)
		}
		if k[0].Persen != tc.harapan {
			t.Errorf("%s: persen=%v, harapan %v", tc.kebijakan, k[0].Persen, tc.harapan)
		}
		if k[0].Pengguna != "guru_a" {
			t.Errorf("%s: kredit harus untuk guru asal, dapat %q", tc.kebijakan, k[0].Pengguna)
		}
	}
}

func TestKreditSesiTidakDigandakanUntukOrangYangSama(t *testing.T) {
	k := kreditSesi("guru_a", "guru_a", "Mengajar", "Penuh", 100)
	hitung := 0
	for _, x := range k {
		if x.Pengguna == "guru_a" {
			hitung++
		}
	}
	if hitung != 1 {
		t.Errorf("guru_a mendapat %d kredit, harus tepat 1", hitung)
	}
}

func TestKreditSesiDataKosong(t *testing.T) {
	if k := kreditSesi("", "guru_a", "Mengajar", "Penuh", 100); k != nil {
		t.Errorf("pengguna kosong harus menghasilkan nol kredit, dapat %+v", k)
	}
	if k := kreditSesi("guru_b", "", "Mengajar", "Penuh", 100); k != nil {
		t.Errorf("pengajar utama kosong harus menghasilkan nol kredit, dapat %+v", k)
	}
}

func TestHitungHonorSesi(t *testing.T) {
	// 40 menit @ 9000/jam penuh = 6000.
	if got := hitungHonorSesi(40, 9000, 100); got != 6000 {
		t.Errorf("40 menit penuh: got %v, want 6000", got)
	}
	// 50% dari 6000 = 3000.
	if got := hitungHonorSesi(40, 9000, 50); got != 3000 {
		t.Errorf("40 menit 50 persen: got %v, want 3000", got)
	}
	// 0% harus benar-benar nol, bukan sisa pembulatan.
	if got := hitungHonorSesi(40, 9000, 0); got != 0 {
		t.Errorf("0 persen: got %v, want 0", got)
	}
}

func TestPersenSaatIzinTidakMelebihiPenuh(t *testing.T) {
	penuh := hitungHonorSesi(60, 9000, 100)
	for _, pct := range []float64{0, 33.3, 50, 100} {
		proporsional := hitungHonorSesi(60, 9000, pct)
		if proporsional > penuh {
			t.Errorf("persen %v menghasilkan %v, melebihi honor penuh %v", pct, proporsional, penuh)
		}
	}
}

// TestKreditSesiPenggantiNominal mengunci aturan nominal: honor sesi yang
// dialihkan seluruhnya milik pengganti, guru asal nol rupiah.
func TestKreditSesiPenggantiNominal(t *testing.T) {
	const tarif = int64(10000)

	// Sesi 40 menit milik guru A, dialingihkan ke B.
	total := map[string]float64{}
	for _, k := range kreditSesi("guru_b", "guru_a", "Mengajar", "Proporsional", 50) {
		total[k.Pengguna] += hitungHonorSesi(40, tarif, k.Persen)
	}

	// 40 menit = 2/3 jam, 2/3 * 10000 = 6666.666...
	if got := total["guru_b"]; got < 6666 || got > 6667 {
		t.Errorf("pengganti harus dapat ~6666.67, dapat %v", got)
	}
	if got := total["guru_a"]; got != 0 {
		t.Errorf("guru asal harus nol rupiah, dapat %v", got)
	}
}

// TestKreditSesiIzinTanpaPengganti mengunci cabang 'Digantikan' yang penggunanya
// masih guru sendiri.
//
// Itu berarti izin sudah disetujui tetapi tidak ada yang menggantikannya, jadi
// tidak ada yang benar-benar teach. Honornya mengikuti HonorGuruSaatIzin, dan
// nilai bawaan kebijakan itu adalah TidakDiberi.
func TestKreditSesiIzinTanpaPengganti(t *testing.T) {
	for _, tc := range []struct {
		kebijakan string
		wantPct   float64
	}{
		{"TidakDiberi", 0},
		{"Proporsional", 50},
		{"Penuh", 100},
	} {
		t.Run(tc.kebijakan, func(t *testing.T) {
			kredit := kreditSesi("guru_a", "guru_a", "Digantikan", tc.kebijakan, 50)
			if len(kredit) != 1 {
				t.Fatalf("harus ada satu kredit, dapat %d", len(kredit))
			}
			if kredit[0].Persen != tc.wantPct {
				t.Errorf("kebijakan %s: persen %.0f, want %.0f",
					tc.kebijakan, kredit[0].Persen, tc.wantPct)
			}
		})
	}
}

// TestNormalisasiHonorSaatIzin mengunci nilai bawaan kebijakan izin.
//
// Nilai yang tidak dikenal tidak boleh jatuh ke Proporsional seperti
// sebelumnya, karena itu membuat sesi yang tidak ada yang teach dibayar
// setengah tanpa disadari. Pengaturan yang kosong atau salah ketik harus
// berakhir di TidakDiberi.
func TestNormalisasiHonorSaatIzin(t *testing.T) {
	for _, tc := range []struct {
		masuk string
		want  string
	}{
		{"Penuh", "Penuh"},
		{"Proporsional", "Proporsional"},
		{"TidakDiberi", "TidakDiberi"},
		{"  TidakDiberi  ", "TidakDiberi"},
		{"", "TidakDiberi"},
		{"   ", "TidakDiberi"},
		{"ngawur", "TidakDiberi"},
		{"proporsional", "TidakDiberi"},
	} {
		if got := normalisasiHonorSaatIzin(tc.masuk); got != tc.want {
			t.Errorf("normalisasiHonorSaatIzin(%q) = %q, want %q", tc.masuk, got, tc.want)
		}
	}
}
