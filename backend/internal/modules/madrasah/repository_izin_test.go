package madrasah

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

var errPermintaanKosong = errors.New("permintaan pengganti tidak ditemukan")

// fakeIzinRepository adalah implementasi in-memory untuk pengujian unit.
type fakeIzinRepository struct {
	pengajuanByID map[int]*pengajuanIzinRecord
	daftar        []pengajuanIzinRecord
	monitoring    []monitoringIzinRow
	bentrok       bool
	bentrokErr    error

	ajukanID        int
	ajukanTersimpan bool
	ajukanErr       error
	ajukanInput     *pengajuanIzinInput
	ajukanPengganti *permintaanPenggantiInput

	penggantiByID   *guruPenggantiRecord
	penggantiByIzin map[int]*guruPenggantiRecord
	permintaan      []permintaanPenggantiRow

	jumlahUbah  int64
	jumlahJawab int64

	dibatalkan          []int
	penggantiDibatalkan []int
	alihkanID           int
	alihkanNama         string
	alihkanErr          error

	lastFilter   pengajuanFilter
	lastUsername string
	lastBulan    int
	lastTahun    int
}

func (f *fakeIzinRepository) AmbilPengajuanByID(_ context.Context, id int) (*pengajuanIzinRecord, error) {
	if rec, ok := f.pengajuanByID[id]; ok {
		return rec, nil
	}
	return nil, ErrPengajuanIzinTidakDitemukan
}

func (f *fakeIzinRepository) DaftarPengajuan(_ context.Context, filter pengajuanFilter) ([]pengajuanIzinRecord, error) {
	f.lastFilter = filter
	return f.daftar, nil
}

func (f *fakeIzinRepository) MonitoringBulanan(_ context.Context, bulan, tahun int) ([]monitoringIzinRow, error) {
	f.lastBulan, f.lastTahun = bulan, tahun
	return f.monitoring, nil
}

func (f *fakeIzinRepository) AdaBentrok(context.Context, sqlExecutor, string, time.Time, time.Time) (bool, error) {
	return f.bentrok, f.bentrokErr
}

func (f *fakeIzinRepository) Ajukan(_ context.Context, in pengajuanIzinInput, pengganti *permintaanPenggantiInput) (int, bool, error) {
	f.ajukanInput = &in
	f.ajukanPengganti = pengganti
	return f.ajukanID, f.ajukanTersimpan, f.ajukanErr
}

func (f *fakeIzinRepository) SimpanPengajuan(context.Context, sqlExecutor, pengajuanIzinInput) (int, error) {
	return 1, nil
}

func (f *fakeIzinRepository) SimpanPermintaanPengganti(context.Context, sqlExecutor, permintaanPenggantiInput) (bool, error) {
	return true, nil
}

func (f *fakeIzinRepository) UbahStatusPengajuan(context.Context, sqlExecutor, int, string, string, string) (int64, error) {
	return f.jumlahUbah, nil
}

func (f *fakeIzinRepository) BatalkanPengajuan(_ context.Context, _ sqlExecutor, id int) error {
	f.dibatalkan = append(f.dibatalkan, id)
	return nil
}

func (f *fakeIzinRepository) BatalkanPermintaanPenggantiPending(_ context.Context, _ sqlExecutor, izinID int) error {
	f.penggantiDibatalkan = append(f.penggantiDibatalkan, izinID)
	return nil
}

func (f *fakeIzinRepository) AmbilPenggantiByID(context.Context, int) (*guruPenggantiRecord, error) {
	if f.penggantiByID == nil {
		return nil, errPermintaanKosong
	}
	return f.penggantiByID, nil
}

func (f *fakeIzinRepository) AmbilPenggantiByIzin(_ context.Context, _ sqlExecutor, izinID int) (*guruPenggantiRecord, error) {
	return f.penggantiByIzin[izinID], nil
}

func (f *fakeIzinRepository) DaftarPermintaanPengganti(_ context.Context, username string) ([]permintaanPenggantiRow, error) {
	f.lastUsername = username
	return f.permintaan, nil
}

func (f *fakeIzinRepository) JawabPermintaanPengganti(context.Context, sqlExecutor, int, string, string) (int64, error) {
	return f.jumlahJawab, nil
}

func (f *fakeIzinRepository) AlihkanSesiKePengganti(_ context.Context, _ sqlExecutor, penggantiID int, pengguna, namaPengganti string) error {
	f.alihkanID = penggantiID
	f.alihkanNama = namaPengganti
	return f.alihkanErr
}

func TestAjukanIzinLewatRepository(t *testing.T) {
	repoIzin := &fakeIzinRepository{ajukanID: 42, ajukanTersimpan: true}
	svc := &Service{
		pengguna: &fakePenggunaRepository{rec: &penggunaRecord{
			Username: "budi", Role: "guru", NamaLengkap: "Budi", Status: "Aktif",
		}},
		izin: repoIzin,
	}

	res, err := svc.AjukanIzin(context.Background(), map[string]interface{}{
		"username":      "budi",
		"jenis":         "Izin",
		"alasan":        "Acara keluarga",
		"tglMulai":      "15/12/2026",
		"tglSelesai":    "16/12/2026",
		"guruPengganti": "sari",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 42, res["izinId"])
	assert.NotNil(t, repoIzin.ajukanInput)
	assert.Equal(t, "Budi", repoIzin.ajukanInput.Nama)
	assert.Equal(t, "Izin", repoIzin.ajukanInput.Jenis)
	assert.NotNil(t, repoIzin.ajukanPengganti)
	assert.Equal(t, "sari", repoIzin.ajukanPengganti.GuruPengganti)
}

func TestAjukanIzinTanpaPengganti(t *testing.T) {
	repoIzin := &fakeIzinRepository{ajukanID: 7, ajukanTersimpan: true}
	svc := &Service{
		pengguna: &fakePenggunaRepository{rec: &penggunaRecord{
			Username: "budi", Role: "guru", NamaLengkap: "Budi", Status: "Aktif",
		}},
		izin: repoIzin,
	}

	res, err := svc.AjukanIzin(context.Background(), map[string]interface{}{
		"username":   "budi",
		"jenis":      "Sakit",
		"alasan":     "Demam",
		"tglMulai":   "15/12/2026",
		"tglSelesai": "15/12/2026",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Nil(t, repoIzin.ajukanPengganti)
}

func TestAjukanIzinBentrok(t *testing.T) {
	repoIzin := &fakeIzinRepository{bentrok: true}
	svc := &Service{
		pengguna: &fakePenggunaRepository{rec: &penggunaRecord{
			Username: "budi", Role: "guru", NamaLengkap: "Budi", Status: "Aktif",
		}},
		izin: repoIzin,
	}

	res, err := svc.AjukanIzin(context.Background(), map[string]interface{}{
		"username":   "budi",
		"jenis":      "Cuti",
		"tglMulai":   "15/12/2026",
		"tglSelesai": "15/12/2026",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Nil(t, repoIzin.ajukanInput)
}

func TestAjukanIzinPenggantiSamaDenganPemohon(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{rec: &penggunaRecord{
			Username: "budi", Role: "guru", NamaLengkap: "Budi", Status: "Aktif",
		}},
		izin: &fakeIzinRepository{},
	}

	res, err := svc.AjukanIzin(context.Background(), map[string]interface{}{
		"username":      "budi",
		"jenis":         "Izin",
		"tglMulai":      "15/12/2026",
		"tglSelesai":    "15/12/2026",
		"guruPengganti": "budi",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestAjukanIzinPenggantiBukanGuru(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{rec: &penggunaRecord{
			Username: "budi", Role: "kepala", NamaLengkap: "Budi", Status: "Aktif",
		}},
		izin: &fakeIzinRepository{},
	}

	res, err := svc.AjukanIzin(context.Background(), map[string]interface{}{
		"username":      "budi",
		"jenis":         "Izin",
		"tglMulai":      "15/12/2026",
		"tglSelesai":    "15/12/2026",
		"guruPengganti": "sari",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetIzinUntukApprovalDitolakNonKepala(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		izin:     &fakeIzinRepository{},
	}

	res, err := svc.GetIzinUntukApproval(context.Background(), "admin")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetIzinUntukApprovalMengembalikanData(t *testing.T) {
	repoIzin := &fakeIzinRepository{daftar: []pengajuanIzinRecord{{
		ID:              3,
		Username:        "budi",
		Nama:            "Budi",
		Jenis:           "Izin",
		TglMulai:        time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
		TglSelesai:      time.Date(2026, 9, 2, 0, 0, 0, 0, time.Local),
		Alasan:          "Acara keluarga",
		Status:          "Pending",
		GuruPengganti:   "sari",
		NamaPengganti:   "Sari",
		StatusPengganti: "Pending",
	}}}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "kepala", aksesStatus: "Aktif"},
		izin:     repoIzin,
	}

	res, err := svc.GetIzinUntukApproval(context.Background(), "kepala_a")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "Pending", repoIzin.lastFilter.Status)
	assert.True(t, repoIzin.lastFilter.Menaik)
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 3, data[0]["id"])
	assert.Equal(t, "01/09/2026", data[0]["tglMulai"])
	assert.Equal(t, "sari", data[0]["guruPengganti"])
}

func TestGetIzinSayaMemfilterPemohon(t *testing.T) {
	repoIzin := &fakeIzinRepository{}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		izin:     repoIzin,
	}

	res, err := svc.GetIzinSaya(context.Background(), "budi")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "budi", repoIzin.lastFilter.Username)
	assert.Equal(t, 300, repoIzin.lastFilter.Limit)
}

func TestGetMonitoringIzinMengembalikanData(t *testing.T) {
	repoIzin := &fakeIzinRepository{monitoring: []monitoringIzinRow{{
		Username:      "budi",
		Nama:          "Budi",
		Jenis:         "Izin",
		Jumlah:        2,
		TotalHari:     4,
		Mulai:         time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
		Selesai:       time.Date(2026, 9, 4, 0, 0, 0, 0, time.Local),
		NamaPengganti: "Sari",
	}}}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		izin:     repoIzin,
	}

	res, err := svc.GetMonitoringIzin(context.Background(), "admin", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 9, repoIzin.lastBulan)
	assert.Equal(t, 2026, repoIzin.lastTahun)
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 2, data[0]["jumlahPengajuan"])
	assert.Equal(t, 4, data[0]["totalHari"])
	assert.Equal(t, "04/09/2026", data[0]["periodeSelesai"])
}

func TestGetMonitoringIzinPeriodeTidakValid(t *testing.T) {
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"},
		izin:     &fakeIzinRepository{},
	}

	res, err := svc.GetMonitoringIzin(context.Background(), "admin", 13, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetPermintaanPenggantiMengembalikanData(t *testing.T) {
	repoIzin := &fakeIzinRepository{permintaan: []permintaanPenggantiRow{{
		ID:         5,
		IzinID:     3,
		GuruAsal:   "budi",
		NamaAsal:   "Budi",
		Jenis:      "Izin",
		TglMulai:   time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
		TglSelesai: time.Date(2026, 9, 2, 0, 0, 0, 0, time.Local),
		Alasan:     "Acara keluarga",
	}}}
	svc := &Service{izin: repoIzin}

	res, err := svc.GetPermintaanPengganti(context.Background(), "sari")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "sari", repoIzin.lastUsername)
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 5, data[0]["id"])
	assert.Equal(t, 3, data[0]["izinId"])
	assert.Equal(t, "Budi", data[0]["namaAsal"])
}

func TestJawabPenggantiBukanUntukAnda(t *testing.T) {
	repoIzin := &fakeIzinRepository{penggantiByID: &guruPenggantiRecord{
		ID: 5, IzinID: 3, GuruPengganti: "orang_lain", Status: "Pending",
	}}
	svc := &Service{izin: repoIzin}

	res, err := svc.JawabPengganti(context.Background(), map[string]interface{}{
		"username":    "sari",
		"penggantiId": 5,
		"jawab":       "Diterima",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Equal(t, 0, repoIzin.alihkanID)
}

func TestJawabPenggantiDiterimaMengalihkanSesi(t *testing.T) {
	repoIzin := &fakeIzinRepository{
		penggantiByID: &guruPenggantiRecord{
			ID: 5, IzinID: 3, GuruAsal: "budi", NamaAsal: "Budi",
			GuruPengganti: "sari", NamaPengganti: "Sari", Status: "Pending",
		},
		jumlahJawab: 1,
	}
	svc := &Service{izin: repoIzin}

	res, err := svc.JawabPengganti(context.Background(), map[string]interface{}{
		"username":    "sari",
		"penggantiId": 5,
		"jawab":       "Diterima",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 5, repoIzin.alihkanID)
	assert.Equal(t, "Sari", repoIzin.alihkanNama)
}

func TestJawabPenggantiSudahDijawab(t *testing.T) {
	repoIzin := &fakeIzinRepository{
		penggantiByID: &guruPenggantiRecord{
			ID: 5, GuruPengganti: "sari", Status: "Pending",
		},
		jumlahJawab: 0,
	}
	svc := &Service{izin: repoIzin}

	res, err := svc.JawabPengganti(context.Background(), map[string]interface{}{
		"username":    "sari",
		"penggantiId": 5,
		"jawab":       "Diterima",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Equal(t, 0, repoIzin.alihkanID)
}

func TestBatalkanIzinLewatRepository(t *testing.T) {
	repoIzin := &fakeIzinRepository{pengajuanByID: map[int]*pengajuanIzinRecord{
		7: {ID: 7, Username: "budi", Status: "Pending"},
	}}
	svc := &Service{izin: repoIzin}

	res, err := svc.BatalkanIzin(context.Background(), map[string]interface{}{
		"username": "budi",
		"izinId":   7,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, []int{7}, repoIzin.dibatalkan)
	assert.Equal(t, []int{7}, repoIzin.penggantiDibatalkan)
}

func TestBatalkanIzinBukanMilikDanBukanAdmin(t *testing.T) {
	repoIzin := &fakeIzinRepository{pengajuanByID: map[int]*pengajuanIzinRecord{
		7: {ID: 7, Username: "budi", Status: "Pending"},
	}}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		izin:     repoIzin,
	}

	res, err := svc.BatalkanIzin(context.Background(), map[string]interface{}{
		"username": "sari",
		"izinId":   7,
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Empty(t, repoIzin.dibatalkan)
}
