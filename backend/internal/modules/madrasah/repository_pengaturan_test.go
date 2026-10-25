package madrasah

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

var errPengaturanKosong = errors.New("pengaturan tidak ditemukan")

type fakePengaturanRepository struct {
	data      map[string]string
	simpan    map[string]string
	simpanErr error
}

func newFakePengaturanRepository(data map[string]string) *fakePengaturanRepository {
	if data == nil {
		data = map[string]string{}
	}
	return &fakePengaturanRepository{data: data, simpan: map[string]string{}}
}

func (f *fakePengaturanRepository) AmbilSemua(context.Context) (map[string]string, error) {
	out := make(map[string]string, len(f.data))
	for k, v := range f.data {
		out[k] = v
	}
	return out, nil
}

func (f *fakePengaturanRepository) AmbilNilai(_ context.Context, key string) (string, error) {
	if v, ok := f.data[key]; ok {
		return v, nil
	}
	return "", errPengaturanKosong
}

func (f *fakePengaturanRepository) Simpan(_ context.Context, key, value string) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.simpan[key] = value
	f.data[key] = value
	return nil
}

func TestGetInfoSekolahMemakaiNilaiDefault(t *testing.T) {
	svc := &Service{pengaturan: newFakePengaturanRepository(nil)}

	res, err := svc.GetInfoSekolah(context.Background())
	assert.NoError(t, err)
	assert.Equal(t, "MA AL KARIMIYAH", res["namaSekolah"])
	assert.Equal(t, 150.0, res["radiusMeter"])
	assert.Equal(t, int64(9000), res["tarifHonorPerJam"])
	assert.Equal(t, "true", res["mingguLibur"])
	assert.NotEmpty(t, res["daftarMapel"])
}

func TestGetInfoSekolahMembacaRepository(t *testing.T) {
	svc := &Service{pengaturan: newFakePengaturanRepository(map[string]string{
		"NamaSekolah":      "MA Negeri 1",
		"RadiusMeter":      "250",
		"TarifHonorPerJam": "12000",
		"MingguLibur":      "false",
		"LatitudeSekolah":  "-6.2",
		"LongitudeSekolah": "106.8",
	})}

	res, err := svc.GetInfoSekolah(context.Background())
	assert.NoError(t, err)
	assert.Equal(t, "MA Negeri 1", res["namaSekolah"])
	assert.Equal(t, 250.0, res["radiusMeter"])
	assert.Equal(t, int64(12000), res["tarifHonorPerJam"])
	assert.Equal(t, "false", res["mingguLibur"])
	assert.Equal(t, -6.2, res["latitudeSekolah"])
}

func TestGetPengaturanLengkapMembacaRepository(t *testing.T) {
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"NamaSekolah": "MA AL KARIMIYAH"}),
	}

	res, err := svc.GetPengaturanLengkap(context.Background(), "admin")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].(map[string]string)
	assert.True(t, ok)
	assert.Equal(t, "MA AL KARIMIYAH", data["NamaSekolah"])
}

func TestUpdatePengaturanDitolakNonAdmin(t *testing.T) {
	repo := newFakePengaturanRepository(nil)
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengaturan: repo,
	}

	res, err := svc.UpdatePengaturan(context.Background(), "guru", map[string]interface{}{"NamaSekolah": "X"})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Empty(t, repo.simpan)
}

func TestUpdatePengaturanMenyimpanLewatRepository(t *testing.T) {
	repo := newFakePengaturanRepository(nil)
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		pengaturan: repo,
	}

	res, err := svc.UpdatePengaturan(context.Background(), "admin", map[string]interface{}{
		"NamaSekolah":      "MA AL KARIMIYAH",
		"TarifHonorPerJam": 10000,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "MA AL KARIMIYAH", repo.simpan["NamaSekolah"])
	assert.Equal(t, "10000", repo.simpan["TarifHonorPerJam"])
}
