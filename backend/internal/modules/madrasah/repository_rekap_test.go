package madrasah

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeRekapRepository adalah implementasi in-memory untuk pengujian unit.
type fakeRekapRepository struct {
	jamBulanan []rekapJamRow
	hariJadwal map[string][]string
	statistik  map[string][5]int
	jumlahJam  map[string]int

	statusSatu rekapStatusRow
	jamSatu    int
	hariGuru   []string
	rincian    []rincianAbsensiRow
	infoGuru   *guruInfoRow

	riwayat    []riwayatAbsensiRow
	rentang    []rentangPenggantiRow
	jadwalHari []jadwalHariCountRow

	statistikDashboard statistikDashboardRow
	statistikTanggal   string
	statistikHari      string
}

func (f *fakeRekapRepository) JamMengajarBulanan(context.Context, int, int) ([]rekapJamRow, error) {
	return f.jamBulanan, nil
}

func (f *fakeRekapRepository) HariJadwalSemua(context.Context) (map[string][]string, error) {
	return f.hariJadwal, nil
}

func (f *fakeRekapRepository) StatistikKehadiranRentang(context.Context, string, string) (map[string][5]int, error) {
	return f.statistik, nil
}

func (f *fakeRekapRepository) JumlahJamRentang(context.Context, string, string) (map[string]int, error) {
	return f.jumlahJam, nil
}

func (f *fakeRekapRepository) StatusKehadiranSatuGuru(context.Context, string, string, string) (rekapStatusRow, error) {
	return f.statusSatu, nil
}

func (f *fakeRekapRepository) JumlahJamSatuGuru(context.Context, string, string, string) (int, error) {
	return f.jamSatu, nil
}

func (f *fakeRekapRepository) HariJadwalGuru(context.Context, string) ([]string, error) {
	return f.hariGuru, nil
}

func (f *fakeRekapRepository) RincianAbsensiRentang(context.Context, string, string, string) ([]rincianAbsensiRow, error) {
	return f.rincian, nil
}

func (f *fakeRekapRepository) InfoGuru(context.Context, string) (guruInfoRow, bool, error) {
	if f.infoGuru == nil {
		return guruInfoRow{}, false, nil
	}
	return *f.infoGuru, true, nil
}

func (f *fakeRekapRepository) RiwayatAbsensiSemua(context.Context, riwayatAbsensiFilter) ([]riwayatAbsensiRow, error) {
	return f.riwayat, nil
}

func (f *fakeRekapRepository) RentangPenggantiTerkonfirmasi(context.Context, string, string) ([]rentangPenggantiRow, error) {
	return f.rentang, nil
}

func (f *fakeRekapRepository) JadwalHariJumlah(context.Context, []string) ([]jadwalHariCountRow, error) {
	return f.jadwalHari, nil
}

func (f *fakeRekapRepository) StatistikDashboard(_ context.Context, tanggal, hari string) (statistikDashboardRow, error) {
	f.statistikTanggal = tanggal
	f.statistikHari = hari
	return f.statistikDashboard, nil
}

func TestGetRekapHonorLewatRepository(t *testing.T) {
	repo := &fakeRekapRepository{jamBulanan: []rekapJamRow{
		{Username: "budi", Nama: "Budi", StatusSergu: "Non-Sergu", JamReguler: 2, JamPengganti: 1},
	}}
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "kepala", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"TarifHonorPerJam": "9000"}),
		rekap:      repo,
		honor:      &fakeHonorRepository{},
	}

	res, err := svc.GetRekapHonor(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 3, data[0]["jumlahJam"])
	assert.Equal(t, int64(27000), data[0]["honorMengajar"])
	assert.Equal(t, int64(27000), data[0]["totalHonor"])
}

func TestGetRekapHonorMenyertakanHonorTambahan(t *testing.T) {
	honorRepo := &fakeHonorRepository{tambahanPeriode: []honorTambahanPeriodeRow{
		{Username: "budi", Struktural: 500000, Tugas: 250000},
	}}
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "kepala", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"TarifHonorPerJam": "9000"}),
		rekap: &fakeRekapRepository{jamBulanan: []rekapJamRow{
			{Username: "budi", Nama: "Budi", StatusSergu: "Sergu"},
		}},
		honor: honorRepo,
	}

	res, err := svc.GetRekapHonor(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, int64(500000), data[0]["honorStruktural"])
	assert.Equal(t, int64(250000), data[0]["honorTugasTambahan"])
	assert.Equal(t, int64(750000), data[0]["totalHonor"])
}

func TestGetRekapPerGuruLewatRepository(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{
			aksesRole: "admin", aksesStatus: "Aktif",
			daftarGuru: []guruRingkasRow{{Username: "budi", NamaLengkap: "Budi"}},
		},
		rekap: &fakeRekapRepository{
			hariJadwal: map[string][]string{"budi": {"Senin"}},
			statistik:  map[string][5]int{"budi": {5, 1, 0, 0, 0}},
			jumlahJam:  map[string]int{"budi": 6},
		},
	}

	res, err := svc.GetRekapPerGuru(context.Background(), "admin", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 5, data[0]["hadir"])
	assert.Equal(t, 1, data[0]["izin"])
	assert.Equal(t, 6, data[0]["jumlahJam"])
}

func TestGetRincianRekapGuruLewatRepository(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		rekap: &fakeRekapRepository{
			infoGuru:   &guruInfoRow{NamaLengkap: "Budi", MataPelajaran: "Fiqih", StatusSergu: "Sergu"},
			statusSatu: rekapStatusRow{Hadir: 4, Izin: 1},
			jamSatu:    5,
			hariGuru:   []string{"Senin"},
			rincian: []rincianAbsensiRow{{
				Tanggal: "01/09/2026", Jam: "07:00", Mapel: "Fiqih",
				Kelas: "VII-A", JamKe: "1", StatusWaktu: "Hadir",
			}},
		},
	}

	res, err := svc.GetRincianRekapGuru(context.Background(), "admin", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, "Budi", data["namaLengkap"])
	assert.Equal(t, "Fiqih", data["mataPelajaran"])
	assert.Equal(t, 4, data["hadir"])
	assert.Equal(t, 5, data["jumlahJam"])
	rincian, ok := data["rincian"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, rincian, 1)
	assert.Equal(t, "Fiqih", rincian[0]["mataPelajaran"])
}

func TestGetRincianRekapGuruTidakDitemukan(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		rekap:    &fakeRekapRepository{},
	}

	res, err := svc.GetRincianRekapGuru(context.Background(), "admin", "tidak_ada", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetRiwayatAbsensiSemuaLewatRepository(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		rekap: &fakeRekapRepository{riwayat: []riwayatAbsensiRow{{
			ID: 1, Tanggal: "01/09/2026", Jam: "07:00", Username: "budi",
			Nama: "Budi", Mapel: "Fiqih", StatusWaktu: "Hadir",
		}}},
	}

	res, err := svc.GetRiwayatAbsensiSemua(context.Background(), "admin", "01/09/2026", "30/09/2026", "")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	list, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, list, 1)
	assert.Equal(t, "Budi", list[0]["namaGuru"])
	assert.Equal(t, "Hadir", list[0]["statusWaktu"])
}

func TestGetRiwayatAbsensiSemuaAksesDitolak(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		rekap:    &fakeRekapRepository{},
	}

	res, err := svc.GetRiwayatAbsensiSemua(context.Background(), "guru", "01/09/2026", "30/09/2026", "")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetStatistikHariIniLewatRepository(t *testing.T) {
	today := time.Now()
	tanggal := today.Format("02/01/2006")
	hari := NamaHariIndo(today.Weekday())
	repo := &fakeRekapRepository{
		hariJadwal:         map[string][]string{"Budi": {hari}},
		statistikDashboard: statistikDashboardRow{TotalGuru: 1, Hadir: 1},
	}
	svc := &Service{
		pengguna:  &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		hariLibur: &fakeHariLiburRepository{},
		rekap:     repo,
	}

	res, err := svc.GetStatistikHariIni(context.Background(), "admin")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, 1, data["totalGuru"])
	assert.Equal(t, 1, data["hadirHariIni"])
	assert.Equal(t, 0, data["izinSakitCuti"])
	assert.Equal(t, 0, data["belumAbsen"])
	assert.Equal(t, tanggal, repo.statistikTanggal)
	assert.Equal(t, hari, repo.statistikHari)
	assert.Equal(t, map[string][]string{"budi": {hari}}, data["jadwalGuru"])
}
