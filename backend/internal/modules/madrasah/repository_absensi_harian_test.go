package madrasah

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeAbsensiHarianRepository adalah implementasi in-memory untuk pengujian unit.
type fakeAbsensiHarianRepository struct {
	satu       *absensiHarianRecord
	satuErr    error
	riwayat    []absensiHarianRecord
	riwayatErr error
	tersimpan  []absensiHarianInput
	simpanErr  error
	penanda    []penandaIzinCall
	manual     []absensiHarianManualInput
}

type penandaIzinCall struct {
	tanggal, username, nama, status, keterangan string
	izinID                                      int
}

func (f *fakeAbsensiHarianRepository) AmbilSatu(context.Context, string, string) (*absensiHarianRecord, error) {
	return f.satu, f.satuErr
}

func (f *fakeAbsensiHarianRepository) AmbilRiwayatBulanan(context.Context, string, int, int) ([]absensiHarianRecord, error) {
	return f.riwayat, f.riwayatErr
}

func (f *fakeAbsensiHarianRepository) Simpan(_ context.Context, in absensiHarianInput) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.tersimpan = append(f.tersimpan, in)
	return nil
}

func (f *fakeAbsensiHarianRepository) SimpanManual(_ context.Context, in absensiHarianManualInput) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.manual = append(f.manual, in)
	return nil
}

func (f *fakeAbsensiHarianRepository) SimpanPenandaIzin(_ context.Context, _ sqlExecutor, tanggal, username, nama, status, keterangan string, izinID int) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.penanda = append(f.penanda, penandaIzinCall{tanggal, username, nama, status, keterangan, izinID})
	return nil
}

func TestGetStatusAbsensiHarianDariRepository(t *testing.T) {
	masuk := time.Date(2026, 9, 18, 7, 5, 0, 0, time.Local)
	repo := &fakeAbsensiHarianRepository{satu: &absensiHarianRecord{
		JamMasuk:    &masuk,
		StatusWaktu: "Hadir",
	}}
	svc := &Service{
		pengaturan:    newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
		absensiHarian: repo,
		hariLibur:     newFakeHariLiburRepository(nil),
	}

	res, err := svc.GetStatusAbsensiHarian(context.Background(), "guru_a")
	assert.NoError(t, err)
	assert.Equal(t, true, res["sudahMasuk"])
	assert.Equal(t, false, res["sudahPulang"])
	assert.Equal(t, "07:05:00", res["jamMasuk"])
	assert.Equal(t, nil, res["jamPulang"])
	assert.Equal(t, "Hadir", res["statusWaktu"])
	assert.Equal(t, false, res["izinDia"])
	assert.Equal(t, false, res["isHariLibur"])
}

func TestGetStatusAbsensiHarianTanpaCatatan(t *testing.T) {
	svc := &Service{
		pengaturan:    newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
		absensiHarian: &fakeAbsensiHarianRepository{satu: nil},
		hariLibur:     newFakeHariLiburRepository(nil),
	}

	res, err := svc.GetStatusAbsensiHarian(context.Background(), "guru_a")
	assert.NoError(t, err)
	assert.Equal(t, false, res["sudahMasuk"])
	assert.Equal(t, "", res["statusWaktu"])
	assert.Equal(t, nil, res["jamMasuk"])
}

func TestGetStatusAbsensiHarianIzinTidakBisaMasuk(t *testing.T) {
	repo := &fakeAbsensiHarianRepository{satu: &absensiHarianRecord{
		StatusWaktu: "Izin",
		Keterangan:  "Acara keluarga",
	}}
	svc := &Service{
		pengaturan:    newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
		absensiHarian: repo,
		hariLibur:     newFakeHariLiburRepository(nil),
	}

	res, err := svc.GetStatusAbsensiHarian(context.Background(), "guru_a")
	assert.NoError(t, err)
	assert.Equal(t, true, res["izinDia"])
	assert.Equal(t, "Acara keluarga", res["keterangan"])
	assert.Equal(t, "Izin", res["statusWaktu"])
}

func TestGetRiwayatAbsensiHarianDariRepository(t *testing.T) {
	masuk := time.Date(2026, 9, 18, 7, 5, 0, 0, time.Local)
	pulang := time.Date(2026, 9, 18, 14, 2, 0, 0, time.Local)
	repo := &fakeAbsensiHarianRepository{riwayat: []absensiHarianRecord{
		{
			Tanggal:     time.Date(2026, 9, 18, 0, 0, 0, 0, time.Local),
			JamMasuk:    &masuk,
			JamPulang:   &pulang,
			StatusWaktu: "Hadir",
			JarakMasuk:  12,
			JarakPulang: 15,
		},
		{
			Tanggal:     time.Date(2026, 9, 17, 0, 0, 0, 0, time.Local),
			StatusWaktu: "Izin",
			Keterangan:  "Acara keluarga",
		},
	}}
	svc := &Service{
		pengguna:      &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		absensiHarian: repo,
	}

	res, err := svc.GetRiwayatAbsensiHarian(context.Background(), "admin", "guru_a", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 2)

	assert.Equal(t, "18/09/2026", data[0]["tanggal"])
	assert.Equal(t, "07:05:00", data[0]["jamMasuk"])
	assert.Equal(t, "14:02:00", data[0]["jamPulang"])
	assert.Equal(t, 12, data[0]["jarakMasuk"])

	assert.Equal(t, "17/09/2026", data[1]["tanggal"])
	assert.Equal(t, nil, data[1]["jamMasuk"])
	assert.Equal(t, "Izin", data[1]["statusWaktu"])
}

// TestTanggalISONormalisasi mengunci kontrak normalisasi tanggal yang dipakai
// repository sebelum menyentuh kolom DATE.
func TestTanggalISONormalisasi(t *testing.T) {
	// Kasus ambigu: 5 Oktober 2026. Tanpa normalisasi, Postgres memakai gaya
	// MDY dan menyimpannya sebagai 5 Mei 2026.
	assert.Equal(t, "2026-10-05", tanggalISO("05/10/2026"))
	assert.Equal(t, "2026-10-05", tanggalISO("2026-10-05"))
	assert.Equal(t, "2026-01-02", tanggalISO("02/01/2026"))
	assert.Equal(t, "2026-01-02", tanggalISO(" 02/01/2026 "))
	assert.Equal(t, "", tanggalISO(""))
	assert.Equal(t, "", tanggalISO("   "))
	// Tanggal tidak dikenal diteruskan supaya error datang dari Postgres.
	assert.Equal(t, "bukan-tanggal", tanggalISO("bukan-tanggal"))
}
