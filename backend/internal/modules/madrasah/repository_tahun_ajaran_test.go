package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeTahunAjaranRepository adalah implementasi in-memory untuk pengujian unit.
type fakeTahunAjaranRepository struct {
	aktifRec      tahunAjaranAktifRecord
	daftar        []tahunAjaranRecord
	daftarErr     error
	simpanInput   []tahunAjaranInput
	simpanErr     error
	adaEnrollment bool
	hapusID       int
	hapusErr      error
}

func (f *fakeTahunAjaranRepository) Aktif(context.Context) (tahunAjaranAktifRecord, error) {
	return f.aktifRec, nil
}

func (f *fakeTahunAjaranRepository) Daftar(context.Context) ([]tahunAjaranRecord, error) {
	return f.daftar, f.daftarErr
}

func (f *fakeTahunAjaranRepository) Simpan(_ context.Context, in tahunAjaranInput) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.simpanInput = append(f.simpanInput, in)
	return nil
}

func (f *fakeTahunAjaranRepository) AdaEnrollment(context.Context, int) (bool, error) {
	return f.adaEnrollment, nil
}

func (f *fakeTahunAjaranRepository) Hapus(_ context.Context, id int) error {
	if f.hapusErr != nil {
		return f.hapusErr
	}
	f.hapusID = id
	return nil
}

func taTestService(ta *fakeTahunAjaranRepository) *Service {
	return &Service{
		tahunAjaran: ta,
		pengguna:    &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}
}

func TestTahunAjaranAktifDariRepository(t *testing.T) {
	repo := &fakeTahunAjaranRepository{aktifRec: tahunAjaranAktifRecord{ID: 4, Kode: "2025/2026", Semester: "Ganjil", Nama: "TA 2025/2026"}}
	svc := taTestService(repo)

	ta := svc.tahunAjaranAktif(context.Background())
	assert.Equal(t, 4, ta["id"])
	assert.Equal(t, "2025/2026", ta["kode"])
	assert.Equal(t, "Ganjil", ta["semester"])
}

func TestGetDaftarTahunAjaranDariRepository(t *testing.T) {
	repo := &fakeTahunAjaranRepository{daftar: []tahunAjaranRecord{
		{ID: 2, Kode: "2025/2026", Semester: "Ganjil", Nama: "TA 2025", TanggalMulai: "01/07/2025", Aktif: true},
	}}
	svc := taTestService(repo)

	res, err := svc.GetDaftarTahunAjaran(context.Background(), "admin")
	assert.NoError(t, err)
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "01/07/2025", data[0]["tanggalMulai"])
	assert.Equal(t, true, data[0]["aktif"])
}

func TestSimpanTahunAjaranMengirimInput(t *testing.T) {
	repo := &fakeTahunAjaranRepository{}
	svc := taTestService(repo)

	res, err := svc.SimpanTahunAjaran(context.Background(), "admin", map[string]interface{}{
		"kode": "2026/2027", "aktif": true,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpanInput, 1)
	in := repo.simpanInput[0]
	assert.Equal(t, "2026/2027", in.Kode)
	assert.Equal(t, "2026/2027", in.Nama)
	assert.Equal(t, "Ganjil", in.Semester)
	assert.Equal(t, true, in.Aktif)
	assert.Equal(t, false, in.ToggleAktif)
}

func TestSimpanTahunAjaranToggleAktif(t *testing.T) {
	repo := &fakeTahunAjaranRepository{}
	svc := taTestService(repo)

	res, err := svc.SimpanTahunAjaran(context.Background(), "admin", map[string]interface{}{
		"id": 9, "aktif": true,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpanInput, 1)
	assert.Equal(t, true, repo.simpanInput[0].ToggleAktif)
	assert.Equal(t, 9, repo.simpanInput[0].ID)
}

func TestHapusTahunAjaranDitolakSaatAdaEnrollment(t *testing.T) {
	repo := &fakeTahunAjaranRepository{adaEnrollment: true}
	svc := taTestService(repo)

	res, err := svc.HapusTahunAjaran(context.Background(), "admin", 3)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Equal(t, 0, repo.hapusID)
}
