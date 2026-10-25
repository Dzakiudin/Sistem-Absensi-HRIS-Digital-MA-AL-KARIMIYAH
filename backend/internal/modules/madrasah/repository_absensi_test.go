package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeAbsensiRepository adalah implementasi in-memory untuk pengujian unit.
type fakeAbsensiRepository struct {
	hariAktif   string
	hariIni     []absenHariIniRow
	slotExists  bool
	slotJamKe   bool
	namaGuru    string
	infoNama    string
	infoIzinkan bool

	simpan       *absenInput
	simpanIzin   *absenIzinInput
	simpanIzinOK bool
	simpanManual *absenManualInput

	riwayat []riwayatAbsenSayaRow
}

func (f *fakeAbsensiRepository) HariAktif(context.Context, string) (string, error) {
	return f.hariAktif, nil
}

func (f *fakeAbsensiRepository) AbsensiHariIni(context.Context, string, string) ([]absenHariIniRow, error) {
	return f.hariIni, nil
}

func (f *fakeAbsensiRepository) SlotExists(context.Context, string, string, string, string) (bool, error) {
	return f.slotExists, nil
}

func (f *fakeAbsensiRepository) SlotJamKeExists(context.Context, string, string, string) (bool, error) {
	return f.slotJamKe, nil
}

func (f *fakeAbsensiRepository) NamaGuru(context.Context, string) (string, error) {
	return f.namaGuru, nil
}

func (f *fakeAbsensiRepository) NamaDanIzinkanPengganti(context.Context, string) (string, bool, error) {
	return f.infoNama, f.infoIzinkan, nil
}

func (f *fakeAbsensiRepository) Simpan(_ context.Context, in absenInput) error {
	f.simpan = &in
	return nil
}

func (f *fakeAbsensiRepository) SimpanIzin(_ context.Context, in absenIzinInput) (bool, error) {
	f.simpanIzin = &in
	return f.simpanIzinOK, nil
}

func (f *fakeAbsensiRepository) SimpanManual(_ context.Context, in absenManualInput) error {
	f.simpanManual = &in
	return nil
}

func (f *fakeAbsensiRepository) RiwayatSaya(context.Context, string) ([]riwayatAbsenSayaRow, error) {
	return f.riwayat, nil
}

func absensiService(repo AbsensiRepository) *Service {
	return &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{
			"LatitudeSekolah":  "-6.2",
			"LongitudeSekolah": "106.8",
			"RadiusMeter":      "150",
			"MingguLibur":      "false",
		}),
		hariLibur: newFakeHariLiburRepository(nil),
		absensi:   repo,
	}
}

func TestGetStatusAbsensiHariIniLewatRepository(t *testing.T) {
	svc := absensiService(&fakeAbsensiRepository{
		hariIni: []absenHariIniRow{{ID: 1, Jam: "07:00:00", Mapel: "Fiqih", StatusWaktu: "Hadir", Kelas: "X-A", JamKe: "1"}},
	})

	res, err := svc.GetStatusAbsensiHariIni(context.Background(), "budi")
	assert.NoError(t, err)
	daftar, ok := res["daftarHariIni"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, daftar, 1)
	assert.Equal(t, "Fiqih", daftar[0]["mataPelajaran"])
}

func TestCatatAbsensiDitolakDiLuarRadius(t *testing.T) {
	repo := &fakeAbsensiRepository{}
	svc := absensiService(repo)

	res, err := svc.CatatAbsensi(context.Background(), map[string]interface{}{
		"username": "budi", "mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
		"latitude": 0.0, "longitude": 0.0,
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repo.simpan)
}

func TestCatatAbsensiSuksesLewatRepository(t *testing.T) {
	repo := &fakeAbsensiRepository{namaGuru: "Budi"}
	svc := absensiService(repo)

	res, err := svc.CatatAbsensi(context.Background(), map[string]interface{}{
		"username": "budi", "mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
		"latitude": -6.2, "longitude": 106.8,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.NotNil(t, repo.simpan)
	assert.Equal(t, "Budi", repo.simpan.Nama)
	assert.Equal(t, "Hadir", repo.simpan.StatusWaktu)
}

func TestCatatAbsensiDuplikatSlot(t *testing.T) {
	repo := &fakeAbsensiRepository{slotExists: true}
	svc := absensiService(repo)

	res, err := svc.CatatAbsensi(context.Background(), map[string]interface{}{
		"username": "budi", "mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
		"latitude": -6.2, "longitude": 106.8,
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repo.simpan)
}

func TestAjukanIzinSakitCutiSuksesLewatRepository(t *testing.T) {
	repo := &fakeAbsensiRepository{infoNama: "Budi", infoIzinkan: true, simpanIzinOK: true}
	svc := absensiService(repo)

	res, err := svc.AjukanIzinSakitCuti(context.Background(), map[string]interface{}{
		"username": "budi", "kategori": "Izin", "keterangan": "keperluan",
		"mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.NotNil(t, repo.simpanIzin)
	assert.Equal(t, "Izin", repo.simpanIzin.Kategori)
}

func TestAjukanIzinSakitCutiDuplikatSlot(t *testing.T) {
	repo := &fakeAbsensiRepository{infoNama: "Budi", infoIzinkan: true, slotExists: true}
	svc := absensiService(repo)

	res, err := svc.AjukanIzinSakitCuti(context.Background(), map[string]interface{}{
		"username": "budi", "kategori": "Izin", "keterangan": "keperluan",
		"mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repo.simpanIzin)
}

func TestGetRiwayatAbsensiSayaLewatRepository(t *testing.T) {
	svc := &Service{absensi: &fakeAbsensiRepository{
		riwayat: []riwayatAbsenSayaRow{{
			ID: 1, Tanggal: "01/10/2026", Jam: "07:00:00", Jenis: "Masuk", StatusWaktu: "Hadir",
			SubstituteUsername: "budi", StatusKonfirmasiPengganti: "Terkonfirmasi", NamaGuru: "Ana",
		}},
	}}

	list, err := svc.GetRiwayatAbsensiSaya(context.Background(), "budi")
	assert.NoError(t, err)
	assert.Len(t, list, 1)
	assert.Equal(t, true, list[0]["sebagaiPengganti"])
	assert.Equal(t, "Ana", list[0]["namaGuruAsli"])
}

func TestCatatKehadiranManualDuplikat(t *testing.T) {
	repo := &fakeAbsensiRepository{slotJamKe: true}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		absensi:  repo,
	}

	res, err := svc.CatatKehadiranManual(context.Background(), "admin", map[string]interface{}{
		"username": "budi", "tanggal": "01/10/2026", "kategori": "Hadir",
		"mataPelajaran": "Fiqih", "kelas": "X-A", "jamKe": "1",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repo.simpanManual)
}
