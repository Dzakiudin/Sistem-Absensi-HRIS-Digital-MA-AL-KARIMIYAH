package madrasah

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeJadwalRepository adalah implementasi in-memory untuk pengujian unit.
type fakeJadwalRepository struct {
	daftar    []jadwalRow
	daftarErr error

	buatInput []jadwalInput
	buatErr   error

	updateInput []jadwalUpdateInput
	updateErr   error

	hapusID  int
	hapusErr error

	jadwalGuru     []jadwalSayaRow
	jadwalGuruHari []jadwalSayaRow
}

func (f *fakeJadwalRepository) Daftar(context.Context) ([]jadwalRow, error) {
	return f.daftar, f.daftarErr
}

func (f *fakeJadwalRepository) Buat(_ context.Context, in jadwalInput) error {
	if f.buatErr != nil {
		return f.buatErr
	}
	f.buatInput = append(f.buatInput, in)
	return nil
}

func (f *fakeJadwalRepository) Perbarui(_ context.Context, in jadwalUpdateInput) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	f.updateInput = append(f.updateInput, in)
	return nil
}

func (f *fakeJadwalRepository) Hapus(_ context.Context, id int) error {
	if f.hapusErr != nil {
		return f.hapusErr
	}
	f.hapusID = id
	return nil
}

func (f *fakeJadwalRepository) JadwalGuru(context.Context, string) ([]jadwalSayaRow, error) {
	return f.jadwalGuru, nil
}

func (f *fakeJadwalRepository) JadwalGuruPadaHari(context.Context, string, []string) ([]jadwalSayaRow, error) {
	return f.jadwalGuruHari, nil
}

func jadwalTestService(j *fakeJadwalRepository) *Service {
	return &Service{
		jadwal:    j,
		kelas:     &fakeKelasRepository{cariByLabel: map[string]kelasLabel{}},
		pengguna:  &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif", rec: &penggunaRecord{NamaLengkap: "Guru"}},
		pengganti: &fakePenggantiRepository{},
	}
}

func TestGetJadwalSayaDariRepository(t *testing.T) {
	repo := &fakeJadwalRepository{
		jadwalGuru: []jadwalSayaRow{
			{Hari: "Senin", JamKe: "1-2", MataPelajaran: "Fiqih", Kelas: "VII-A"},
			{Hari: "Selasa", JamKe: "III", MataPelajaran: "Akidah", Kelas: "VIII-A", Tanggal: "20/10/2026", Penggantian: true, PenggantianUntuk: "Guru A"},
		},
		jadwalGuruHari: []jadwalSayaRow{{Hari: "Senin", JamKe: "3-4", MataPelajaran: "Akidah", Kelas: "VIII-B"}},
	}
	svc := jadwalTestService(repo)

	res, err := svc.GetJadwalSaya(context.Background(), "guru")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 2)
	assert.Equal(t, "Fiqih", data[0]["mataPelajaran"])
	assert.Equal(t, true, data[1]["penggantian"])
	assert.Equal(t, "20/10/2026", data[1]["tanggal"])
	assert.Equal(t, "Guru A", data[1]["penggantianUntuk"])
}

func TestGetDaftarJadwalDariRepository(t *testing.T) {
	jamMulai := time.Date(2026, 1, 1, 7, 0, 0, 0, time.UTC)
	repo := &fakeJadwalRepository{daftar: []jadwalRow{
		{ID: 1, Username: "guru", NamaGuru: "Guru", Hari: "Senin", MataPelajaran: "Fiqih", Kelas: "VII-A", JamKe: "1-2", MapelID: intPtr(3), JamMulai: &jamMulai},
	}}
	svc := jadwalTestService(repo)

	res, err := svc.GetDaftarJadwal(context.Background(), "admin")
	assert.NoError(t, err)
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, 3, data[0]["mapelId"])
	assert.Equal(t, "07:00", data[0]["jamMulai"])
	assert.Nil(t, data[0]["jamSelesai"])
}

func TestTambahJadwalMengirimInput(t *testing.T) {
	repo := &fakeJadwalRepository{}
	svc := jadwalTestService(repo)

	res, err := svc.TambahJadwal(context.Background(), "admin", map[string]interface{}{
		"username": "guru", "hari": "Senin", "mataPelajaran": "Fiqih",
		"kelas": "VII-A", "jamKe": "1-2", "mapelId": float64(3),
		"jamMulai": "07:00", "jamSelesai": "07:40",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.buatInput, 1)
	in := repo.buatInput[0]
	assert.Equal(t, "Guru", in.NamaGuru)
	assert.Equal(t, 3, in.MapelID)
	assert.Equal(t, "07:00:00", in.JamMulai)
}

func TestTambahJadwalTolakFieldKosong(t *testing.T) {
	svc := jadwalTestService(&fakeJadwalRepository{})

	res, err := svc.TambahJadwal(context.Background(), "admin", map[string]interface{}{
		"username": "guru", "hari": "", "mataPelajaran": "Fiqih", "kelas": "VII-A", "jamKe": "1-2",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestUpdateJadwalMengirimInput(t *testing.T) {
	repo := &fakeJadwalRepository{}
	svc := jadwalTestService(repo)

	res, err := svc.UpdateJadwal(context.Background(), "admin", map[string]interface{}{
		"id": float64(5), "username": "guru", "hari": "Senin", "mataPelajaran": "Fiqih",
		"kelas": "VII-A", "jamKe": "1-2", "mapelId": float64(3),
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.updateInput, 1)
	assert.Equal(t, 5, repo.updateInput[0].ID)
}

func TestHapusJadwalMengirimID(t *testing.T) {
	repo := &fakeJadwalRepository{}
	svc := jadwalTestService(repo)

	res, err := svc.HapusJadwal(context.Background(), "admin", float64(8))
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 8, repo.hapusID)
}

func intPtr(v int) *int { return &v }
