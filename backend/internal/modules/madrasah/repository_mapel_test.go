package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeMapelRepository adalah implementasi in-memory untuk pengujian unit.
type fakeMapelRepository struct {
	daftar      []mapelRecord
	daftarErr   error
	simpanID    int
	simpanErr   error
	simpanInput []mapelInput
	nonaktifID  int
	nonaktifErr error
}

func (f *fakeMapelRepository) Daftar(context.Context) ([]mapelRecord, error) {
	return f.daftar, f.daftarErr
}

func (f *fakeMapelRepository) Simpan(_ context.Context, in mapelInput) (int, error) {
	if f.simpanErr != nil {
		return 0, f.simpanErr
	}
	f.simpanInput = append(f.simpanInput, in)
	if in.ID > 0 {
		return in.ID, nil
	}
	return f.simpanID, nil
}

func (f *fakeMapelRepository) Nonaktifkan(_ context.Context, id int) error {
	if f.nonaktifErr != nil {
		return f.nonaktifErr
	}
	f.nonaktifID = id
	return nil
}

func mapelTestService(repo *fakeMapelRepository) *Service {
	return &Service{
		mapel:    repo,
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}
}

func TestGetDaftarMapelDariRepository(t *testing.T) {
	repo := &fakeMapelRepository{daftar: []mapelRecord{
		{ID: 1, Kode: "MTK", Nama: "Matematika", Kelompok: "Wajib", Aktif: true},
		{ID: 2, Kode: "FQH", Nama: "Fiqih", Kelompok: "Agama", Aktif: false},
	}}
	svc := mapelTestService(repo)

	res, err := svc.GetDaftarMapel(context.Background(), "admin")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 2)
	assert.Equal(t, "Matematika", data[0]["nama"])
	assert.Equal(t, false, data[1]["aktif"])
}

func TestSimpanMapelTambahMenggunakanDefaultKelompok(t *testing.T) {
	repo := &fakeMapelRepository{simpanID: 7}
	svc := mapelTestService(repo)

	res, err := svc.SimpanMapel(context.Background(), "admin", map[string]interface{}{"nama": "Bahasa Arab"})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 7, res["id"])
	assert.Len(t, repo.simpanInput, 1)
	assert.Equal(t, 0, repo.simpanInput[0].ID)
	assert.Equal(t, "Wajib", repo.simpanInput[0].Kelompok)
	assert.Equal(t, true, repo.simpanInput[0].Aktif)
}

func TestSimpanMapelWajibNama(t *testing.T) {
	svc := mapelTestService(&fakeMapelRepository{simpanID: 7})

	res, err := svc.SimpanMapel(context.Background(), "admin", map[string]interface{}{"nama": "  "})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestSimpanMapelDuplikat(t *testing.T) {
	repo := &fakeMapelRepository{simpanErr: ErrMapelDuplikat}
	svc := mapelTestService(repo)

	res, err := svc.SimpanMapel(context.Background(), "admin", map[string]interface{}{"nama": "Matematika"})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Contains(t, res["message"], "sudah ada")
}

func TestSimpanMapelUpdate(t *testing.T) {
	repo := &fakeMapelRepository{}
	svc := mapelTestService(repo)

	res, err := svc.SimpanMapel(context.Background(), "admin", map[string]interface{}{
		"id": 3, "nama": "Fiqih", "kelompok": "Agama", "aktif": false,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 3, res["id"])
	assert.Contains(t, res["message"], "diperbarui")
	assert.Equal(t, 3, repo.simpanInput[0].ID)
	assert.Equal(t, false, repo.simpanInput[0].Aktif)
}

func TestHapusMapelMenonaktifkan(t *testing.T) {
	repo := &fakeMapelRepository{}
	svc := mapelTestService(repo)

	res, err := svc.HapusMapel(context.Background(), "admin", map[string]interface{}{"id": 5})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 5, repo.nonaktifID)
}

func TestSimpanMapelAksesDitolak(t *testing.T) {
	svc := mapelTestService(&fakeMapelRepository{simpanID: 1})
	svc.pengguna = &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"}

	res, err := svc.SimpanMapel(context.Background(), "guru_a", map[string]interface{}{"nama": "X"})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Equal(t, "Akses ditolak", res["message"])
}
