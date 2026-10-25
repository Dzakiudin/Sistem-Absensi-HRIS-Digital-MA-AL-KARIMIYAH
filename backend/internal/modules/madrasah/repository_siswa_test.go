package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakeSiswaRepository adalah implementasi in-memory untuk pengujian unit.
type fakeSiswaRepository struct {
	daftar    []siswaListRow
	total     int64
	daftarErr error
	filter    siswaFilter

	simpanID    int
	simpanErr   error
	simpanInput []siswaInput

	hapusID  int
	hapusErr error

	imporInput    []siswaInput
	imporBerhasil []string
	imporGagal    []string
	imporErr      error

	aturTahunAjaran int
	aturKelas       int
	aturPasang      []int
	aturLepas       []int
	aturTerpasang   int
	aturTerlepas    int
	aturErr         error
}

func (f *fakeSiswaRepository) Daftar(_ context.Context, filter siswaFilter) ([]siswaListRow, int64, error) {
	f.filter = filter
	return f.daftar, f.total, f.daftarErr
}

func (f *fakeSiswaRepository) Simpan(_ context.Context, in siswaInput) (int, error) {
	if f.simpanErr != nil {
		return 0, f.simpanErr
	}
	f.simpanInput = append(f.simpanInput, in)
	if in.ID > 0 {
		return in.ID, nil
	}
	return f.simpanID, nil
}

func (f *fakeSiswaRepository) Hapus(_ context.Context, id int) error {
	if f.hapusErr != nil {
		return f.hapusErr
	}
	f.hapusID = id
	return nil
}

func (f *fakeSiswaRepository) ImporMassal(_ context.Context, items []siswaInput) ([]string, []string, error) {
	f.imporInput = items
	if f.imporErr != nil {
		return nil, nil, f.imporErr
	}
	return f.imporBerhasil, f.imporGagal, nil
}

func (f *fakeSiswaRepository) AturKelas(_ context.Context, tahunAjaranID, kelasID int, pasang, lepas []int) (int, int, error) {
	if f.aturErr != nil {
		return 0, 0, f.aturErr
	}
	f.aturTahunAjaran = tahunAjaranID
	f.aturKelas = kelasID
	f.aturPasang = pasang
	f.aturLepas = lepas
	return f.aturTerpasang, f.aturTerlepas, nil
}

func siswaTestService(s *fakeSiswaRepository) *Service {
	return &Service{
		siswa:    s,
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}
}

func TestGetDaftarSiswaDariRepository(t *testing.T) {
	repo := &fakeSiswaRepository{total: 1, daftar: []siswaListRow{
		{ID: 5, NIS: "1001", NamaLengkap: "Ahmad", Kelas: "VII-A", TahunAjaran: "TA 2025", Yatim: true},
	}}
	svc := siswaTestService(repo)

	res, err := svc.GetDaftarSiswa(context.Background(), "admin", 0, "", 0, 0)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), res["total"])
	assert.Equal(t, 50, res["perHalaman"])
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "VII-A", data[0]["kelas"])
	assert.Equal(t, true, data[0]["yatim"])
	assert.Equal(t, false, repo.filter.Paginate)
}

func TestGetDaftarSiswaPaginasi(t *testing.T) {
	repo := &fakeSiswaRepository{}
	svc := siswaTestService(repo)

	_, err := svc.GetDaftarSiswa(context.Background(), "admin", 2, "ahmad", 3, 10)
	assert.NoError(t, err)
	assert.Equal(t, true, repo.filter.Paginate)
	assert.Equal(t, 10, repo.filter.PerHalaman)
	assert.Equal(t, 20, repo.filter.Offset)
	assert.Equal(t, 2, repo.filter.KelasID)
	assert.Equal(t, "ahmad", repo.filter.Cari)
}

func TestSimpanSiswaMengirimInputDenganDefault(t *testing.T) {
	repo := &fakeSiswaRepository{simpanID: 11}
	svc := siswaTestService(repo)

	res, err := svc.SimpanSiswa(context.Background(), "admin", map[string]interface{}{
		"nis": "2002", "namaLengkap": "Siti",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 11, res["siswaId"])
	in := repo.simpanInput[0]
	assert.Equal(t, "Laki-laki", in.JenisKelamin)
	assert.Equal(t, "Aktif", in.Status)
	assert.Equal(t, "2002", in.NIS)
}

func TestSimpanSiswaWajibNisNama(t *testing.T) {
	svc := siswaTestService(&fakeSiswaRepository{})

	res, err := svc.SimpanSiswa(context.Background(), "admin", map[string]interface{}{"nis": ""})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestImporSiswaMassalMenggabungkanHasil(t *testing.T) {
	repo := &fakeSiswaRepository{imporBerhasil: []string{"Ahmad"}, imporGagal: []string{"Budi (duplikat)"}}
	svc := siswaTestService(repo)

	res, err := svc.ImporSiswaMassal(context.Background(), "admin", []interface{}{
		map[string]interface{}{"nis": "", "namaLengkap": "Kosong"},
		map[string]interface{}{"nis": "1", "namaLengkap": "Ahmad"},
		map[string]interface{}{"nis": "2", "namaLengkap": "Budi"},
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.imporInput, 2)
	berhasil := res["berhasil"].([]string)
	gagal := res["gagal"].([]string)
	assert.Equal(t, []string{"Ahmad"}, berhasil)
	assert.Equal(t, []string{"(NIS/Nama kosong)", "Budi (duplikat)"}, gagal)
}

func TestAturSiswaKelasMeneruskanDaftar(t *testing.T) {
	repo := &fakeSiswaRepository{aturTerpasang: 2, aturTerlepas: 1}
	svc := siswaTestService(repo)

	res, err := svc.AturSiswaKelas(context.Background(), "admin", map[string]interface{}{
		"tahunAjaranId": 3,
		"kelasId":       7,
		"siswaIds":      []interface{}{float64(10), float64(11)},
		"hapusSiswaIds": []interface{}{float64(12)},
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 3, repo.aturTahunAjaran)
	assert.Equal(t, 7, repo.aturKelas)
	assert.Equal(t, []int{10, 11}, repo.aturPasang)
	assert.Equal(t, []int{12}, repo.aturLepas)
}

func TestAturSiswaKelasWajibTahunAjaran(t *testing.T) {
	svc := siswaTestService(&fakeSiswaRepository{})

	res, err := svc.AturSiswaKelas(context.Background(), "admin", map[string]interface{}{"kelasId": 7})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}
