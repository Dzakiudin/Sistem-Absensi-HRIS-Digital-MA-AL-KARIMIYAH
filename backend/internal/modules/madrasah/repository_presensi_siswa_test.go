package madrasah

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakePresensiSiswaRepository adalah implementasi in-memory untuk pengujian unit.
type fakePresensiSiswaRepository struct {
	jadwalID       int
	jadwalMapel    string
	jadwalErr      error
	sesiID         int
	sesiMapel      string
	penggantiID    int
	penggantiMapel string

	roster       []rosterSiswaRow
	rosterErr    error
	sudahDicatat int64

	simpanInput []presensiSiswaInput
	simpanErr   error

	rekap    []rekapSiswaRow
	rekapErr error

	riwayat    []riwayatPresensiRow
	riwayatErr error

	statistik    []statistikKehadiranRow
	statistikErr error
}

func (f *fakePresensiSiswaRepository) CariJadwalGuru(context.Context, string, string, string, string) (int, string, error) {
	return f.jadwalID, f.jadwalMapel, f.jadwalErr
}

func (f *fakePresensiSiswaRepository) CariJadwalSesiPengganti(context.Context, string, string, string, string) (int, string, error) {
	return f.sesiID, f.sesiMapel, nil
}

func (f *fakePresensiSiswaRepository) CariJadwalPenggantiRentang(context.Context, string, string, string, string, string) (int, string, error) {
	return f.penggantiID, f.penggantiMapel, nil
}

func (f *fakePresensiSiswaRepository) RosterSiswa(context.Context, int, int, time.Time, string) ([]rosterSiswaRow, error) {
	return f.roster, f.rosterErr
}

func (f *fakePresensiSiswaRepository) HitungSudahDicatat(context.Context, int, time.Time, string) (int64, error) {
	return f.sudahDicatat, nil
}

func (f *fakePresensiSiswaRepository) SimpanBulk(_ context.Context, in presensiSiswaInput) error {
	if f.simpanErr != nil {
		return f.simpanErr
	}
	f.simpanInput = append(f.simpanInput, in)
	return nil
}

func (f *fakePresensiSiswaRepository) RekapRentang(context.Context, rekapSiswaFilter) ([]rekapSiswaRow, error) {
	return f.rekap, f.rekapErr
}

func (f *fakePresensiSiswaRepository) RiwayatTanggal(context.Context, time.Time) ([]riwayatPresensiRow, error) {
	return f.riwayat, f.riwayatErr
}

func (f *fakePresensiSiswaRepository) StatistikKehadiranRentang(context.Context, time.Time, time.Time) ([]statistikKehadiranRow, error) {
	return f.statistik, f.statistikErr
}

func presensiTestService(p *fakePresensiSiswaRepository) *Service {
	return &Service{
		presensiSiswa: p,
		kelas:         &fakeKelasRepository{cariID: 7},
		tahunAjaran:   &fakeTahunAjaranRepository{aktifRec: tahunAjaranAktifRecord{ID: 1, Kode: "2025/2026"}},
		pengguna:      &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif", rec: &penggunaRecord{ID: 3, Username: "guru"}},
	}
}

func TestGetRosterPresensiUntukStafPengganti(t *testing.T) {
	repo := &fakePresensiSiswaRepository{
		sesiID: 21, sesiMapel: "Fiqih",
		roster: []rosterSiswaRow{{ID: 1, NamaLengkap: "Ahmad"}},
	}
	svc := presensiTestService(repo)
	svc.pengguna = &fakePenggunaRepository{
		aksesRole: "staf", aksesStatus: "Aktif",
		rec: &penggunaRecord{ID: 5, Username: "staf-b"},
	}

	res, err := svc.GetRosterPresensi(context.Background(), "staf-b", "15/12/2026", "VII-A", "I")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 21, res["jadwalId"])
	assert.Equal(t, "Fiqih", res["mataPelajaran"])
}

func TestGetRosterPresensiStafTanpaPenugasanDitolak(t *testing.T) {
	svc := presensiTestService(&fakePresensiSiswaRepository{})
	svc.pengguna = &fakePenggunaRepository{
		aksesRole: "staf", aksesStatus: "Aktif",
		rec: &penggunaRecord{ID: 5, Username: "staf-b"},
	}

	res, err := svc.GetRosterPresensi(context.Background(), "staf-b", "15/12/2026", "VII-A", "I")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Contains(t, res["message"], "guru pengganti")
}

func TestCatatAbsensiSiswaStafHanyaPadaSesiPengganti(t *testing.T) {
	repo := &fakePresensiSiswaRepository{sesiID: 21}
	svc := presensiTestService(repo)
	svc.pengguna = &fakePenggunaRepository{
		aksesRole: "staf", aksesStatus: "Aktif",
		rec: &penggunaRecord{ID: 5, Username: "staf-b"},
	}

	res, err := svc.CatatAbsensiSiswa(context.Background(), map[string]interface{}{
		"username": "staf-b", "tanggal": "15/12/2026", "kelas": "VII-A",
		"jamKe": "I-II", "jadwalId": 21,
		"items": []interface{}{map[string]interface{}{"siswaId": float64(1), "status": "H"}},
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpanInput, 1)
	assert.Equal(t, 21, repo.simpanInput[0].Items[0].JadwalID)
}

func TestCatatAbsensiSiswaStafTolakSesiBukanPengganti(t *testing.T) {
	svc := presensiTestService(&fakePresensiSiswaRepository{})
	svc.pengguna = &fakePenggunaRepository{
		aksesRole: "staf", aksesStatus: "Aktif",
		rec: &penggunaRecord{ID: 5, Username: "staf-b"},
	}

	res, err := svc.CatatAbsensiSiswa(context.Background(), map[string]interface{}{
		"username": "staf-b", "tanggal": "15/12/2026", "kelas": "VII-A",
		"jamKe": "I-II", "jadwalId": 21,
		"items": []interface{}{map[string]interface{}{"siswaId": float64(1), "status": "H"}},
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetRosterPresensiDariRepository(t *testing.T) {
	repo := &fakePresensiSiswaRepository{
		jadwalID: 12, jadwalMapel: "Fiqih", sudahDicatat: 2,
		roster: []rosterSiswaRow{
			{ID: 1, NIS: "1001", NamaLengkap: "Ahmad", JenisKelamin: "Laki-laki", Status: "H"},
		},
	}
	svc := presensiTestService(repo)

	res, err := svc.GetRosterPresensi(context.Background(), "guru", "15/12/2026", "VII-A", "1-2")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 12, res["jadwalId"])
	assert.Equal(t, "Fiqih", res["mataPelajaran"])
	assert.Equal(t, int64(2), res["sudahDicatat"])
	siswa := res["siswa"].([]map[string]interface{})
	assert.Len(t, siswa, 1)
	assert.Equal(t, "Ahmad", siswa[0]["namaLengkap"])
}

func TestGetRosterPresensiTolakKelasTidakDikenal(t *testing.T) {
	svc := &Service{
		presensiSiswa: &fakePresensiSiswaRepository{},
		kelas:         &fakeKelasRepository{cariID: 0},
		pengguna:      &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
	}

	res, err := svc.GetRosterPresensi(context.Background(), "guru", "15/12/2026", "VII-A", "1-2")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestCatatAbsensiSiswaMengirimItem(t *testing.T) {
	repo := &fakePresensiSiswaRepository{}
	svc := presensiTestService(repo)

	res, err := svc.CatatAbsensiSiswa(context.Background(), map[string]interface{}{
		"username": "guru", "tanggal": "15/12/2026", "kelas": "VII-A", "jamKe": "1-2",
		"items": []interface{}{
			map[string]interface{}{"siswaId": float64(1), "status": "h", "keterangan": ""},
			map[string]interface{}{"siswaId": float64(2), "status": "I"},
		},
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 2, res["tercatat"])
	assert.Equal(t, 1, res["hadir"])
	assert.Equal(t, 1, res["izin"])
	assert.Len(t, repo.simpanInput, 1)
	assert.Len(t, repo.simpanInput[0].Items, 2)
	assert.Equal(t, "H", repo.simpanInput[0].Items[0].Status)
	assert.Equal(t, "I", repo.simpanInput[0].Items[1].Status)
}

func TestCatatAbsensiSiswaTolakJamKosong(t *testing.T) {
	svc := presensiTestService(&fakePresensiSiswaRepository{})

	res, err := svc.CatatAbsensiSiswa(context.Background(), map[string]interface{}{
		"username": "guru", "tanggal": "15/12/2026", "kelas": "VII-A", "jamKe": "",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetRekapPresensiSiswaDariRepository(t *testing.T) {
	repo := &fakePresensiSiswaRepository{rekap: []rekapSiswaRow{
		{KelasID: 7, KodeKelas: "VII-A", SiswaID: 1, NIS: "1001", Nama: "Ahmad", JK: "L", Total: 10, H: 8, I: 1, S: 1},
		{KelasID: 7, KodeKelas: "VII-A", SiswaID: 2, NIS: "1002", Nama: "Siti", JK: "P", Total: 10, H: 10},
	}}
	svc := &Service{
		presensiSiswa: repo,
		tahunAjaran:   &fakeTahunAjaranRepository{aktifRec: tahunAjaranAktifRecord{ID: 1, Kode: "2025/2026"}},
		pengguna:      &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}

	res, err := svc.GetRekapPresensiSiswa(context.Background(), "admin", map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, int64(18), data[0]["totalH"])
	assert.Equal(t, int64(2), data[0]["totalSS"])
	siswa := data[0]["siswa"].([]map[string]interface{})
	assert.Len(t, siswa, 2)
	assert.Equal(t, 80.0, siswa[0]["persen"])
}

func TestGetRekapPresensiSiswaTolakBukanWaliKelas(t *testing.T) {
	svc := &Service{
		presensiSiswa: &fakePresensiSiswaRepository{},
		kelas:         &fakeKelasRepository{waliKelas: 0},
		pengguna:      &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif", rec: &penggunaRecord{ID: 3}},
	}

	res, err := svc.GetRekapPresensiSiswa(context.Background(), "guru", map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetRiwayatPresensiTanggalDariRepository(t *testing.T) {
	repo := &fakePresensiSiswaRepository{riwayat: []riwayatPresensiRow{
		{KodeKelas: "VII-A", JamKe: "1-2", MataPelajaran: "Fiqih", Guru: "guru", H: 20, I: 1, Total: 21},
	}}
	svc := &Service{
		presensiSiswa: repo,
		pengguna:      &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}

	res, err := svc.GetRiwayatPresensiTanggal(context.Background(), "admin", "15/12/2026")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, int64(20), data[0]["hadir"])
	assert.Equal(t, int64(21), data[0]["total"])
}

func TestGetStatistikKehadiranSiswaDariRepository(t *testing.T) {
	repo := &fakePresensiSiswaRepository{statistik: []statistikKehadiranRow{
		{Tanggal: time.Date(2026, 12, 15, 0, 0, 0, 0, time.Local), KodeKelas: "VII-A", Mapel: "Fiqih", Guru: "guru", H: 20, I: 1, A: 0},
		{Tanggal: time.Date(2026, 12, 15, 0, 0, 0, 0, time.Local), KodeKelas: "VII-B", Mapel: "Fiqih", Guru: "guru", H: 15, S: 2, T: 1},
		{Tanggal: time.Date(2026, 12, 16, 0, 0, 0, 0, time.Local), KodeKelas: "VII-A", Mapel: "Fiqih", Guru: "guru", H: 19, I: 2},
	}}
	svc := &Service{
		presensiSiswa: repo,
		pengguna:      &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
	}

	res, err := svc.GetStatistikKehadiranSiswa(context.Background(), "admin", map[string]interface{}{"bulan": 12, "tahun": 2026})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data := res["data"].(map[string]interface{})
	ring := data["ringkasan"].(map[string]interface{})
	assert.Equal(t, int64(54), ring["hadir"])
	assert.Equal(t, int64(3), ring["izin"])
	assert.Equal(t, int64(2), ring["sakit"])
	assert.Equal(t, int64(0), ring["alpa"])
	assert.Equal(t, int64(1), ring["telat"])
	assert.Equal(t, int64(60), ring["total"])
	// perKelas dan perHari dihitung dari data yang sesuai filter
	// (test tidak memaksakan jumlah fix agar implementasi fleksibel)
}

func TestGetStatistikKehadiranSiswaAksesDitolak(t *testing.T) {
	svc := &Service{
		presensiSiswa: &fakePresensiSiswaRepository{},
		pengguna:      &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
	}

	res, err := svc.GetStatistikKehadiranSiswa(context.Background(), "guru", map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}
