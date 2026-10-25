package madrasah

import (
	"fmt"
	"testing"
)

func TestOrdJam(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"I", 1}, {"II", 2}, {"III", 3}, {"IV", 4},
		{"V", 5}, {"VI", 6}, {"VII", 7}, {"VIII", 8},
		{"iv", 4}, {"  V  ", 5}, {"X", 99}, {"", 99},
	}
	for _, c := range cases {
		got := ordJam(c.in)
		if got != c.want {
			t.Errorf("ordJam(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestOrdToRoman(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{1, "I"}, {2, "II"}, {3, "III"}, {4, "IV"},
		{5, "V"}, {6, "VI"}, {7, "VII"}, {8, "VIII"},
		{0, "I"}, {9, "I"},
	}
	for _, c := range cases {
		got := ordToRoman(c.in)
		if got != c.want {
			t.Errorf("ordToRoman(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestGabungJamBerurutan_BugCondition membuktikan bug: slot berurutan
// dikembalikan terpisah alih-alih digabung. Test ini HARUS GAGAL pada
// kode unfixed (fungsi gabungJamBerurutan belum ada).
func TestGabungJamBerurutan_BugCondition(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Senin", "mataPelajaran": "Fiqih", "kelas": "7A", "jamKe": "IV"},
		{"hari": "Senin", "mataPelajaran": "Fiqih", "kelas": "7A", "jamKe": "V"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 1 {
		t.Fatalf("BUG CONFIRMED: expected 1 merged entry, got %d — slot berurutan IV+V tidak digabung", len(result))
	}
	if result[0]["jamKe"] != "IV-V" {
		t.Errorf("expected jamKe=IV-V, got %v", result[0]["jamKe"])
	}
}

// TestGabungJamBerurutan_ThreeConsecutive_BugCondition tiga slot berurutan
func TestGabungJamBerurutan_ThreeConsecutive_BugCondition(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Selasa", "mataPelajaran": "Aswaja", "kelas": "8B", "jamKe": "II"},
		{"hari": "Selasa", "mataPelajaran": "Aswaja", "kelas": "8B", "jamKe": "III"},
		{"hari": "Selasa", "mataPelajaran": "Aswaja", "kelas": "8B", "jamKe": "IV"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 1 {
		t.Fatalf("BUG CONFIRMED: expected 1 merged entry, got %d — slot berurutan II+III+IV tidak digabung", len(result))
	}
	if result[0]["jamKe"] != "II-III-IV" {
		t.Errorf("expected jamKe=II-III-IV, got %v", result[0]["jamKe"])
	}
}

// =============================================================================
// Task 2: Preservation Tests — Slot Non-Berurutan Tetap Terpisah
// Requirements: 3.1, 3.2, 3.3, 3.7
// =============================================================================

// TestGabungJamBerurutan_GapTetapTerpisah memverifikasi bahwa slot dengan gap
// pada jam (IV dan VI, gap di V) tetap dikembalikan sebagai dua entri terpisah.
// Validates: Requirement 3.1
func TestGabungJamBerurutan_GapTetapTerpisah(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Rabu", "mataPelajaran": "SKI", "kelas": "9C", "jamKe": "IV"},
		{"hari": "Rabu", "mataPelajaran": "SKI", "kelas": "9C", "jamKe": "VI"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 2 {
		t.Fatalf("PRESERVATION FAILURE: expected 2 separate entries (gap at V), got %d", len(result))
	}
	// Pastikan jamKe tidak berubah
	jamSet := map[string]bool{}
	for _, r := range result {
		jamSet[fmt.Sprintf("%v", r["jamKe"])] = true
	}
	if !jamSet["IV"] || !jamSet["VI"] {
		t.Errorf("expected jamKe IV and VI to be preserved, got %v", jamSet)
	}
	// Pastikan tidak ada field jamKeDaftar pada entri yang tidak digabung
	for _, r := range result {
		if _, ok := r["jamKeDaftar"]; ok {
			t.Errorf("jamKeDaftar should not exist on non-merged entry, jamKe=%v", r["jamKe"])
		}
	}
}

// TestGabungJamBerurutan_KelasBedaTetapTerpisah memverifikasi bahwa slot dengan
// kelas berbeda tidak pernah digabung, meskipun jam berurutan.
// Validates: Requirement 3.2
func TestGabungJamBerurutan_KelasBedaTetapTerpisah(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Senin", "mataPelajaran": "Fiqih", "kelas": "7A", "jamKe": "IV"},
		{"hari": "Senin", "mataPelajaran": "Fiqih", "kelas": "7B", "jamKe": "V"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 2 {
		t.Fatalf("PRESERVATION FAILURE: expected 2 separate entries (different kelas), got %d", len(result))
	}
	// Pastikan kelas masing-masing tidak berubah
	kelasSet := map[string]bool{}
	for _, r := range result {
		kelasSet[fmt.Sprintf("%v", r["kelas"])] = true
	}
	if !kelasSet["7A"] || !kelasSet["7B"] {
		t.Errorf("expected kelas 7A and 7B to be preserved, got %v", kelasSet)
	}
}

// TestGabungJamBerurutan_PenggantianTidakDigabung memverifikasi bahwa slot dengan
// penggantian:true tidak ikut proses merge dan dikembalikan identik dengan input.
// Validates: Requirement 3.3
func TestGabungJamBerurutan_PenggantianTidakDigabung(t *testing.T) {
	input := []map[string]interface{}{
		{
			"hari":          "Kamis",
			"mataPelajaran": "Fiqih",
			"kelas":         "7A",
			"jamKe":         "IV",
			"penggantian":   true,
			"guruPengganti": "Ustadz Ahmad",
		},
		{
			"hari":          "Kamis",
			"mataPelajaran": "Fiqih",
			"kelas":         "7A",
			"jamKe":         "V",
			"penggantian":   true,
			"guruPengganti": "Ustadz Ahmad",
		},
	}
	result := gabungJamBerurutan(input)
	// Slot penggantian tidak boleh digabung — harus tetap 2 entri
	if len(result) != 2 {
		t.Fatalf("PRESERVATION FAILURE: penggantian slots must not be merged, expected 2, got %d", len(result))
	}
	// Setiap slot harus dikembalikan identik (field penggantian tetap true)
	for _, r := range result {
		if v, ok := r["penggantian"].(bool); !ok || !v {
			t.Errorf("penggantian field must be preserved as true, got %v", r["penggantian"])
		}
		if fmt.Sprintf("%v", r["guruPengganti"]) != "Ustadz Ahmad" {
			t.Errorf("guruPengganti field must be preserved, got %v", r["guruPengganti"])
		}
	}
}

// TestGabungJamBerurutan_SingleSlot memverifikasi bahwa satu slot tunggal
// dikembalikan identik tanpa field jamKeDaftar tambahan.
// Validates: Requirement 3.7
func TestGabungJamBerurutan_SingleSlot(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Jumat", "mataPelajaran": "Qurdits", "kelas": "8A", "jamKe": "III"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 1 {
		t.Fatalf("PRESERVATION FAILURE: single slot must return 1 entry, got %d", len(result))
	}
	// jamKe harus tidak berubah
	if result[0]["jamKe"] != "III" {
		t.Errorf("expected jamKe=III, got %v", result[0]["jamKe"])
	}
	// Tidak boleh ada field jamKeDaftar
	if _, ok := result[0]["jamKeDaftar"]; ok {
		t.Errorf("jamKeDaftar must not exist on single-slot entry")
	}
}

// TestGabungJamBerurutan_MapelBedaTetapTerpisah memverifikasi bahwa slot dengan
// mata pelajaran berbeda tidak pernah digabung, meskipun jam berurutan.
// Validates: Requirement 3.1, 3.2
func TestGabungJamBerurutan_MapelBedaTetapTerpisah(t *testing.T) {
	input := []map[string]interface{}{
		{"hari": "Senin", "mataPelajaran": "Fiqih", "kelas": "7A", "jamKe": "IV"},
		{"hari": "Senin", "mataPelajaran": "SKI", "kelas": "7A", "jamKe": "V"},
	}
	result := gabungJamBerurutan(input)
	if len(result) != 2 {
		t.Fatalf("PRESERVATION FAILURE: expected 2 separate entries (different mataPelajaran), got %d", len(result))
	}
	// Pastikan mataPelajaran masing-masing tidak berubah
	mapelSet := map[string]bool{}
	for _, r := range result {
		mapelSet[fmt.Sprintf("%v", r["mataPelajaran"])] = true
	}
	if !mapelSet["Fiqih"] || !mapelSet["SKI"] {
		t.Errorf("expected mataPelajaran Fiqih and SKI to be preserved, got %v", mapelSet)
	}
}
