package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakePenggantiRepository adalah implementasi in-memory untuk pengujian unit.
type fakePenggantiRepository struct {
	guruKecuali     []guruPenggantiRow
	slotMenunggu    []slotMenungguPenggantiRow
	rentangMenunggu []rentangMenungguPenggantiRow
	statusSlot      string
	konfirmasiSlot  *konfirmasiSlotPenggantiInput

	guruAktif       bool
	bentrok         bool
	infoNama        string
	infoIzinkan     bool
	simpanPengajuan *penggantiRentangInput

	rentangSaya       []rentangSayaRow
	pemilik           string
	pemilikStatus     string
	batalkanID        int
	statusRentang     string
	konfirmasiRentang *konfirmasiRentangInput

	rentangAktif     []penggantiRentangRow
	rentangMenyentuh []rentangSesiRow
}

func (f *fakePenggantiRepository) DaftarGuruKecuali(context.Context, string) ([]guruPenggantiRow, error) {
	return f.guruKecuali, nil
}

func (f *fakePenggantiRepository) SlotMenungguUntuk(context.Context, string, string) ([]slotMenungguPenggantiRow, error) {
	return f.slotMenunggu, nil
}

func (f *fakePenggantiRepository) RentangMenungguUntuk(context.Context, string, string) ([]rentangMenungguPenggantiRow, error) {
	return f.rentangMenunggu, nil
}

func (f *fakePenggantiRepository) StatusSlotMenunggu(context.Context, int, string, string) (string, error) {
	return f.statusSlot, nil
}

func (f *fakePenggantiRepository) KonfirmasiSlot(_ context.Context, in konfirmasiSlotPenggantiInput) error {
	f.konfirmasiSlot = &in
	return nil
}

func (f *fakePenggantiRepository) GuruAktifAda(context.Context, string) (bool, error) {
	return f.guruAktif, nil
}

func (f *fakePenggantiRepository) RentangBentrokAda(context.Context, string, string, string) (bool, error) {
	return f.bentrok, nil
}

func (f *fakePenggantiRepository) InfoPengajuan(context.Context, string) (string, bool, error) {
	return f.infoNama, f.infoIzinkan, nil
}

func (f *fakePenggantiRepository) SimpanPengajuanRentang(_ context.Context, in penggantiRentangInput) error {
	f.simpanPengajuan = &in
	return nil
}

func (f *fakePenggantiRepository) RentangSaya(context.Context, string) ([]rentangSayaRow, error) {
	return f.rentangSaya, nil
}

func (f *fakePenggantiRepository) AmbilPemilikRentang(context.Context, int) (string, string, error) {
	return f.pemilik, f.pemilikStatus, nil
}

func (f *fakePenggantiRepository) BatalkanRentang(_ context.Context, id int) error {
	f.batalkanID = id
	return nil
}

func (f *fakePenggantiRepository) StatusRentangMenunggu(context.Context, int, string) (string, error) {
	return f.statusRentang, nil
}

func (f *fakePenggantiRepository) KonfirmasiRentang(_ context.Context, in konfirmasiRentangInput) error {
	f.konfirmasiRentang = &in
	return nil
}

func (f *fakePenggantiRepository) RentangAktifTerkonfirmasi(context.Context, string) ([]penggantiRentangRow, error) {
	return f.rentangAktif, nil
}

func (f *fakePenggantiRepository) RentangTerkonfirmasiMenyentuh(context.Context, string, string, string) ([]rentangSesiRow, error) {
	return f.rentangMenyentuh, nil
}

func TestGetDaftarGuruUntukPenggantiLewatRepository(t *testing.T) {
	svc := &Service{pengganti: &fakePenggantiRepository{
		guruKecuali: []guruPenggantiRow{{Username: "budi", Nama: "Budi"}},
	}}

	res, err := svc.GetDaftarGuruUntukPengganti(context.Background(), "ana")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, "budi", data[0]["username"])
	assert.Equal(t, "Budi", data[0]["namaLengkap"])
}

func TestGetDaftarKonfirmasiPenggantiMenggabungkanSlotDanRentang(t *testing.T) {
	svc := &Service{pengganti: &fakePenggantiRepository{
		infoNama:     "Budi",
		slotMenunggu: []slotMenungguPenggantiRow{{ID: 1, Tanggal: "01/10/2026", Kategori: "Izin", NamaAsli: "Ana", Mapel: "Fiqih", Kelas: "X-A", JamKe: "1", Keterangan: "sakit"}},
		rentangMenunggu: []rentangMenungguPenggantiRow{{
			ID: 2, NamaAsli: "Ana", Kategori: "Cuti", Keterangan: "cuti",
			TanggalMulai: "05/10/2026", TanggalSelesai: "07/10/2026",
		}},
	}}

	list, err := svc.GetDaftarKonfirmasiPengganti(context.Background(), "budi")
	assert.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "slot", list[0]["tipe"])
	assert.Equal(t, 1, list[0]["id"])
	assert.Equal(t, "rentang", list[1]["tipe"])
	assert.Equal(t, "05/10/2026 s.d. 07/10/2026", list[1]["tanggal"])
}

func TestGetPenggantiRentangSayaMenandaiSelesai(t *testing.T) {
	svc := &Service{pengganti: &fakePenggantiRepository{
		rentangSaya: []rentangSayaRow{
			{ID: 1, GuruPenggantiUsername: "budi", GuruPenggantiNama: "Budi", Kategori: "Izin", TanggalMulai: "01/01/2020", TanggalSelesai: "02/01/2020", Status: "Terkonfirmasi"},
			{ID: 2, GuruPenggantiUsername: "cici", GuruPenggantiNama: "Cici", Kategori: "Cuti", TanggalMulai: "01/01/2099", TanggalSelesai: "02/01/2099", Status: "Terkonfirmasi"},
		},
	}}

	res, err := svc.GetPenggantiRentangSaya(context.Background(), "ana")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 2)
	assert.Equal(t, "Selesai", data[0]["status"])
	assert.Equal(t, "Terkonfirmasi", data[1]["status"])
}

func TestBatalkanPenggantiRentangTidakDitemukan(t *testing.T) {
	svc := &Service{pengganti: &fakePenggantiRepository{pemilikStatus: ""}}

	res, err := svc.BatalkanPenggantiRentang(context.Background(), map[string]interface{}{"id": 9, "username": "ana"})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestBatalkanPenggantiRentangDitolakBukanPemilik(t *testing.T) {
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengganti: &fakePenggantiRepository{pemilik: "lain", pemilikStatus: "Menunggu"},
	}

	res, err := svc.BatalkanPenggantiRentang(context.Background(), map[string]interface{}{"id": 9, "username": "ana"})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestBatalkanPenggantiRentangSukses(t *testing.T) {
	repo := &fakePenggantiRepository{pemilik: "ana", pemilikStatus: "Menunggu"}
	svc := &Service{pengganti: repo}

	res, err := svc.BatalkanPenggantiRentang(context.Background(), map[string]interface{}{"id": 9, "username": "ana"})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 9, repo.batalkanID)
}

func TestAjukanPenggantiRentangKategoriTidakValid(t *testing.T) {
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengganti: &fakePenggantiRepository{},
	}

	res, err := svc.AjukanPenggantiRentang(context.Background(), map[string]interface{}{
		"username": "ana", "kategori": "Hadir",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestAjukanPenggantiRentangSuksesLewatRepository(t *testing.T) {
	repo := &fakePenggantiRepository{guruAktif: true, infoNama: "Ana", infoIzinkan: true}
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengganti: repo,
	}

	res, err := svc.AjukanPenggantiRentang(context.Background(), map[string]interface{}{
		"username":              "ana",
		"kategori":              "Izin",
		"guruPenggantiUsername": "budi",
		"guruPenggantiNama":     "Budi",
		"tanggalMulai":          "15/12/2099",
		"tanggalSelesai":        "17/12/2099",
		"keterangan":            "keperluan",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.NotNil(t, repo.simpanPengajuan)
	assert.Equal(t, "Ana", repo.simpanPengajuan.NamaLengkap)
	assert.Equal(t, "budi", repo.simpanPengajuan.GuruPengganti)
}

func TestKonfirmasiPenggantiDitolakDiLuarRadius(t *testing.T) {
	repo := &fakePenggantiRepository{statusSlot: "Menunggu"}
	svc := &Service{
		pengaturan: newFakePengaturanRepository(map[string]string{
			"LatitudeSekolah":  "-6.2",
			"LongitudeSekolah": "106.8",
			"RadiusMeter":      "150",
		}),
		pengganti: repo,
	}

	res, err := svc.KonfirmasiPengganti(context.Background(), map[string]interface{}{
		"id": 1, "username": "budi", "latitude": 0.0, "longitude": 0.0,
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repo.konfirmasiSlot)
}

func TestKonfirmasiPenggantiSuksesLewatRepository(t *testing.T) {
	repo := &fakePenggantiRepository{statusSlot: "Menunggu"}
	svc := &Service{
		pengaturan: newFakePengaturanRepository(map[string]string{
			"LatitudeSekolah":  "-6.2",
			"LongitudeSekolah": "106.8",
			"RadiusMeter":      "150",
		}),
		pengganti: repo,
	}

	res, err := svc.KonfirmasiPengganti(context.Background(), map[string]interface{}{
		"id": 7, "username": "budi", "latitude": -6.2, "longitude": 106.8,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.NotNil(t, repo.konfirmasiSlot)
	assert.Equal(t, 7, repo.konfirmasiSlot.ID)
}
