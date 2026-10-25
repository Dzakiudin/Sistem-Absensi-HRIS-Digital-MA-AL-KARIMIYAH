package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeHariLiburRepository adalah implementasi in-memory untuk pengujian unit.
type fakeHariLiburRepository struct {
	ket       map[string]string
	daftar    []hariLiburRecord
	simpan    map[string]string
	dihapus   []string
	simpanErr error
}

func newFakeHariLiburRepository(ket map[string]string) *fakeHariLiburRepository {
	if ket == nil {
		ket = map[string]string{}
	}
	return &fakeHariLiburRepository{ket: ket, simpan: map[string]string{}}
}

func (f *fakeHariLiburRepository) KeteranganTanggal(_ context.Context, tanggal string) (string, bool, error) {
	v, ok := f.ket[tanggal]
	if !ok {
		return "", false, nil
	}
	return v, true, nil
}

func (f *fakeHariLiburRepository) Daftar(context.Context) ([]hariLiburRecord, error) {
	return f.daftar, nil
}

func (f *fakeHariLiburRepository) TanggalDalamBulan(context.Context, string, string) ([]string, error) {
	out := []string{}
	for t := range f.ket {
		out = append(out, t)
	}
	return out, nil
}

func (f *fakeHariLiburRepository) Simpan(_ context.Context, tanggal, keterangan string) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.simpan[tanggal] = keterangan
	return nil
}

func (f *fakeHariLiburRepository) Hapus(_ context.Context, tanggal string) error {
	f.dihapus = append(f.dihapus, tanggal)
	return nil
}

func TestApakahHariLiburDariRepository(t *testing.T) {
	svc := &Service{
		pengaturan: newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
		hariLibur:  newFakeHariLiburRepository(map[string]string{"17/08/2026": "HUT RI"}),
	}

	libur, ket := svc.ApakahHariLibur(context.Background(), "17/08/2026")
	assert.True(t, libur)
	assert.Equal(t, "HUT RI", ket)

	libur, ket = svc.ApakahHariLibur(context.Background(), "18/08/2026")
	assert.False(t, libur)
	assert.Empty(t, ket)
}

func TestApakahHariLiburKeteranganKosongDiberiLabel(t *testing.T) {
	svc := &Service{
		pengaturan: newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
		hariLibur:  newFakeHariLiburRepository(map[string]string{"01/01/2027": ""}),
	}

	libur, ket := svc.ApakahHariLibur(context.Background(), "01/01/2027")
	assert.True(t, libur)
	assert.Equal(t, "Hari Libur", ket)
}

func TestGetDaftarLiburDariRepository(t *testing.T) {
	repo := newFakeHariLiburRepository(nil)
	repo.daftar = []hariLiburRecord{{Tanggal: "17/08/2026", Keterangan: "HUT RI"}}
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		hariLibur: repo,
	}

	res, err := svc.GetDaftarLibur(context.Background(), "admin")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, "17/08/2026", data[0]["tanggal"])
	assert.Equal(t, "HUT RI", data[0]["keterangan"])
}

func TestGetDaftarLiburDitolakNonAdmin(t *testing.T) {
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		hariLibur: newFakeHariLiburRepository(nil),
	}

	res, err := svc.GetDaftarLibur(context.Background(), "guru")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestTambahLiburRentangLewatRepository(t *testing.T) {
	repo := newFakeHariLiburRepository(nil)
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		hariLibur: repo,
	}

	res, err := svc.TambahLiburRentang(context.Background(), "admin", "01/09/2026", "03/09/2026", "Cuti Bersama")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpan, 3)
	assert.Equal(t, "Cuti Bersama", repo.simpan["01/09/2026"])
	assert.Equal(t, "Cuti Bersama", repo.simpan["03/09/2026"])
}

func TestHapusLiburLewatRepository(t *testing.T) {
	repo := newFakeHariLiburRepository(nil)
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		hariLibur: repo,
	}

	res, err := svc.HapusLibur(context.Background(), "admin", "17/08/2026")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, []string{"17/08/2026"}, repo.dihapus)
}
