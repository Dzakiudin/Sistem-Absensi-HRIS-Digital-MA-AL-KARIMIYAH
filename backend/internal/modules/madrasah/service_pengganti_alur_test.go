package madrasah

import "testing"

// TestNormalisasiJawabanPengganti memastikan variasi penulisan jawaban dari
// klien dipetakan ke bentuk kanonik. Regresi sebelumnya: klien mengirim
// "Terima"/"Tolak" sementara service menuntut "Diterima"/"Ditolak" sehingga
// jawaban guru selalu ditolak.
func TestNormalisasiJawabanPengganti(t *testing.T) {
	cases := map[string]string{
		"Diterima":  "Diterima",
		"Ditolak":   "Ditolak",
		"Terima":    "Diterima",
		"Tolak":     "Ditolak",
		"terima":    "Diterima",
		"  tolak  ": "Ditolak",
		"DITERIMA":  "Diterima",
		"":          "",
		"ngawur":    "",
		"setuju":    "",
	}
	for in, want := range cases {
		if got := normalisasiJawabanPengganti(in); got != want {
			t.Errorf("normalisasiJawabanPengganti(%q) = %q, ingin %q", in, got, want)
		}
	}
}
