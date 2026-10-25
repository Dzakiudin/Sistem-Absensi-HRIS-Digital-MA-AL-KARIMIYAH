package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeKelasRepository adalah implementasi in-memory untuk pengujian unit.
type fakeKelasRepository struct {
	daftar        []kelasRecord
	daftarErr     error
	simpanInput   []kelasInput
	simpanErr     error
	adaEnrollment bool
	hapusID       int
	hapusErr      error
	cariID        int
	cariByLabel   map[string]kelasLabel
	waliKelas     int64
	adaWali       bool
}

func (f *fakeKelasRepository) Daftar(context.Context) ([]kelasRecord, error) {
	return f.daftar, f.daftarErr
}

func (f *fakeKelasRepository) Simpan(_ context.Context, in kelasInput) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.simpanInput = append(f.simpanInput, in)
	return nil
}

func (f *fakeKelasRepository) AdaEnrollment(context.Context, int) (bool, error) {
	return f.adaEnrollment, nil
}

func (f *fakeKelasRepository) Hapus(_ context.Context, id int) error {
	if f.hapusErr != nil {
		return f.hapusErr
	}
	f.hapusID = id
	return nil
}

func (f *fakeKelasRepository) CariIDByLabel(context.Context, string) (int, error) {
	return f.cariID, nil
}

func (f *fakeKelasRepository) CariByLabel(context.Context, []string) (map[string]kelasLabel, error) {
	return f.cariByLabel, nil
}

func (f *fakeKelasRepository) HitungWaliKelas(context.Context, int) (int64, error) {
	return f.waliKelas, nil
}

func (f *fakeKelasRepository) ApakahWaliKelasID(context.Context, int, int) (bool, error) {
	return f.adaWali, nil
}

func kelasTestService(k *fakeKelasRepository) *Service {
	return &Service{
		kelas:       k,
		tahunAjaran: &fakeTahunAjaranRepository{aktifRec: tahunAjaranAktifRecord{ID: 1, Kode: "2025/2026"}},
		pengguna:    &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}
}

func TestGetDaftarKelasDariRepository(t *testing.T) {
	repo := &fakeKelasRepository{daftar: []kelasRecord{
		{ID: 1, KodeKelas: "VII-A", NamaKelas: "VII A", Tingkat: "VII", WaliKelasID: 3, NamaWali: "Ustadz A", IsActive: true, JumlahSiswa: 25},
	}}
	svc := kelasTestService(repo)

	res, err := svc.GetDaftarKelas(context.Background(), "admin")
	assert.NoError(t, err)
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "VII-A", data[0]["kodeKelas"])
	assert.Equal(t, "Ustadz A", data[0]["namaWali"])
	assert.Equal(t, int64(25), data[0]["jumlahSiswa"])
	assert.NotNil(t, res["tahunAjaran"])
}

func TestSimpanKelasMengirimInput(t *testing.T) {
	repo := &fakeKelasRepository{}
	svc := kelasTestService(repo)

	res, err := svc.SimpanKelas(context.Background(), "admin", map[string]interface{}{
		"kodeKelas": "VIII-B", "waliKelasId": 7,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpanInput, 1)
	in := repo.simpanInput[0]
	assert.Equal(t, "VIII-B", in.KodeKelas)
	assert.Equal(t, "VIII-B", in.NamaKelas)
	assert.Equal(t, "VIII", in.Tingkat)
	assert.NotNil(t, in.WaliKelasID)
	assert.Equal(t, 7, *in.WaliKelasID)
	assert.Equal(t, true, in.IsActive)
}

func TestSimpanKelasWajibKode(t *testing.T) {
	svc := kelasTestService(&fakeKelasRepository{})

	res, err := svc.SimpanKelas(context.Background(), "admin", map[string]interface{}{"kodeKelas": " "})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestHapusKelasDitolakSaatAdaSiswa(t *testing.T) {
	repo := &fakeKelasRepository{adaEnrollment: true}
	svc := kelasTestService(repo)

	res, err := svc.HapusKelas(context.Background(), "admin", 2)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Equal(t, 0, repo.hapusID)
}

func TestHapusKelasBerhasil(t *testing.T) {
	repo := &fakeKelasRepository{}
	svc := kelasTestService(repo)

	res, err := svc.HapusKelas(context.Background(), "admin", 2)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 2, repo.hapusID)
}
