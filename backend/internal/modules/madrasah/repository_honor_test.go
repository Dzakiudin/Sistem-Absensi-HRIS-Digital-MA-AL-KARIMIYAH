package madrasah

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeHonorRepository adalah implementasi in-memory untuk pengujian unit.
type fakeHonorRepository struct {
	pegawai  []pegawaiHonorRecord
	sesi     []sesiHonorRecord
	tambahan map[string]float64

	status    string
	statusErr error
	rekap     []rekapHonorRow

	adaRekap    int
	adaRekapErr error
	finalisasiN int64
	bukaN       int64

	pegawaiRec *pegawaiHonorRecord
	slipRec    *slipHonorRow
	detail     []detailSlipRow
	riwayat    []riwayatHonorRow

	terkirim        []honorTerkirimRow
	slipTerkirim    bool
	kirimInput      []honorTerkirimInput
	kirimBatch      []honorTerkirimInput
	tandaiID        int
	tandaiUser      string
	tambahanRec     honorTambahanRecord
	tambahanErr     error
	tambahanPeriode []honorTambahanPeriodeRow
	simpanTambahan  []honorTambahanInput

	gantiCalled bool
	gantiRekap  []rekapHonorInput
	gantiErr    error

	infoNama        string
	infoMapel       string
	infoSergu       string
	infoErr         error
	catatanGuru     []catatanHonorGuruRow
	profilGuru      []profilGuruHonorRow
	catatanBulan    []catatanHonorBulanRow
	rentangKandidat []string
	rentangPeriode  map[string][]rentangPenggantiPeriodeRow
}

func (f *fakeHonorRepository) PegawaiAktifHonor(context.Context) ([]pegawaiHonorRecord, error) {
	return f.pegawai, nil
}

func (f *fakeHonorRepository) SesiBulanan(context.Context, int, int) ([]sesiHonorRecord, error) {
	return f.sesi, nil
}

func (f *fakeHonorRepository) HonorTambahanBulanan(context.Context, int, int) (map[string]float64, error) {
	return f.tambahan, nil
}

func (f *fakeHonorRepository) StatusPeriode(context.Context, int, int) (string, error) {
	return f.status, f.statusErr
}

func (f *fakeHonorRepository) RekapTersimpan(context.Context, int, int) ([]rekapHonorRow, error) {
	return f.rekap, nil
}

func (f *fakeHonorRepository) GantiRekapDraft(_ context.Context, _ int, _ int, rekap []rekapHonorInput) error {
	f.gantiCalled = true
	f.gantiRekap = rekap
	return f.gantiErr
}

func (f *fakeHonorRepository) AdaRekap(context.Context, int, int) (int, error) {
	return f.adaRekap, f.adaRekapErr
}

func (f *fakeHonorRepository) Finalisasi(context.Context, int, int, string) (int64, error) {
	return f.finalisasiN, nil
}

func (f *fakeHonorRepository) BukaFinalisasi(context.Context, int, int) (int64, error) {
	return f.bukaN, nil
}

func (f *fakeHonorRepository) PegawaiByUsername(context.Context, string) (pegawaiHonorRecord, bool, error) {
	if f.pegawaiRec == nil {
		return pegawaiHonorRecord{}, false, nil
	}
	return *f.pegawaiRec, true, nil
}

func (f *fakeHonorRepository) SlipTersimpan(context.Context, int, int, string) (slipHonorRow, bool, error) {
	if f.slipRec == nil {
		return slipHonorRow{}, false, nil
	}
	return *f.slipRec, true, nil
}

func (f *fakeHonorRepository) DetailSlip(context.Context, int, int, string) ([]detailSlipRow, error) {
	return f.detail, nil
}

func (f *fakeHonorRepository) RiwayatHonor(context.Context, string) ([]riwayatHonorRow, error) {
	return f.riwayat, nil
}

func (f *fakeHonorRepository) DaftarTerkirim(context.Context, string) ([]honorTerkirimRow, error) {
	return f.terkirim, nil
}

func (f *fakeHonorRepository) TandaiDilihat(_ context.Context, id int, username string) error {
	f.tandaiID = id
	f.tandaiUser = username
	return nil
}

func (f *fakeHonorRepository) SlipSudahTerkirim(context.Context, string, int, int) (bool, error) {
	return f.slipTerkirim, nil
}

func (f *fakeHonorRepository) KirimSlip(_ context.Context, in honorTerkirimInput) error {
	f.kirimInput = append(f.kirimInput, in)
	return nil
}

func (f *fakeHonorRepository) KirimSlipBatch(_ context.Context, items []honorTerkirimInput) error {
	f.kirimBatch = append(f.kirimBatch, items...)
	return nil
}

func (f *fakeHonorRepository) HonorTambahan(context.Context, string, int, int) (honorTambahanRecord, error) {
	return f.tambahanRec, f.tambahanErr
}

func (f *fakeHonorRepository) HonorTambahanPeriode(context.Context, int, int) ([]honorTambahanPeriodeRow, error) {
	return f.tambahanPeriode, nil
}

func (f *fakeHonorRepository) SimpanTambahan(_ context.Context, in honorTambahanInput) error {
	f.simpanTambahan = append(f.simpanTambahan, in)
	return nil
}

func (f *fakeHonorRepository) InfoGuruHonor(context.Context, string) (string, string, string, error) {
	return f.infoNama, f.infoMapel, f.infoSergu, f.infoErr
}

func (f *fakeHonorRepository) CatatanHonorGuru(context.Context, string, string, string) ([]catatanHonorGuruRow, error) {
	return f.catatanGuru, nil
}

func (f *fakeHonorRepository) ProfilGuruAktifHonor(context.Context) ([]profilGuruHonorRow, error) {
	return f.profilGuru, nil
}

func (f *fakeHonorRepository) CatatanHonorBulan(context.Context, string, []string) ([]catatanHonorBulanRow, error) {
	return f.catatanBulan, nil
}

func (f *fakeHonorRepository) RentangPenggantiKandidat(context.Context, string) ([]string, error) {
	return f.rentangKandidat, nil
}

func (f *fakeHonorRepository) RentangPenggantiPeriode(_ context.Context, username, _, _ string) ([]rentangPenggantiPeriodeRow, error) {
	return f.rentangPeriode[username], nil
}

func honorTestService(repo *fakeHonorRepository, tarif string) *Service {
	return &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "kepala", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"TarifHonorPerJam": tarif}),
		honor:      repo,
		sesi:       &fakeSesiRepository{},
	}
}

func TestHitungHonorPeriodeLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "guru_a",
			PengajarUtama: "guru_a",
		}},
	}
	svc := honorTestService(repo, "9000")

	hasil, tarif, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, int64(9000), tarif)
	assert.Equal(t, 9000.0, hasil["guru_a"].TotalHonor)
	assert.Equal(t, 1, hasil["guru_a"].TotalSesi)
}

// TestHitungHonorPeriodeSesiTanpaPresensiSiswaNol mengunci aturan honor dari
// presensi siswa: sesi yang tidak punya bukti presensi siswa sama sekali tidak
// dihitung, berapa pun durasinya, dan tidak menambah total sesi/menit.
func TestHitungHonorPeriodeSesiTanpaPresensiSiswaNol(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		sesi: []sesiHonorRecord{
			{
				Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
				DurasiMenit:   60,
				PunyaPresensi: true,
				StatusSesi:    "Mengajar",
				Pengguna:      "guru_a",
				PengajarUtama: "guru_a",
			},
			{
				Tanggal:       time.Date(2026, 9, 2, 0, 0, 0, 0, time.Local),
				DurasiMenit:   60,
				PunyaPresensi: false,
				StatusSesi:    "Mengajar",
				Pengguna:      "guru_a",
				PengajarUtama: "guru_a",
			},
		},
	}
	svc := honorTestService(repo, "9000")

	hasil, _, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err)
	// Hanya sesi ber-presensi yang dihitung: 1 sesi x Rp9000.
	assert.Equal(t, 9000.0, hasil["guru_a"].TotalHonor)
	assert.Equal(t, 1, hasil["guru_a"].TotalSesi)
	assert.Equal(t, 60, hasil["guru_a"].TotalMenit)
	// Baris tanpa presensi tetap muncul di detail sebagai 0 dengan alasan jelas.
	assert.Len(t, hasil["guru_a"].Detail, 2)
	tanggal2 := hasil["guru_a"].Detail[1]
	assert.Equal(t, time.Date(2026, 9, 2, 0, 0, 0, 0, time.Local), tanggal2.Tanggal)
	assert.Equal(t, 0.0, tanggal2.Persen)
	assert.Equal(t, 0.0, tanggal2.Nominal)
	assert.Equal(t, "Tidak ada presensi siswa", tanggal2.Alasan)
}

// TestHitungHonorPeriodeMembawaPresensiSiswaPerSesi mengunci bahwa counts
// kehadiran siswa (H/I/S/A/T) ikut dihitung dan dibawa ke rincian slip & rekap.
func TestHitungHonorPeriodeMembawaPresensiSiswaPerSesi(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "guru_a",
			PengajarUtama: "guru_a",
			Hadir:         20, Izin: 1, Sakit: 2, Alpa: 0, Telat: 1,
		}},
	}
	svc := honorTestService(repo, "9000")

	hasil, _, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err)
	assert.Len(t, hasil["guru_a"].Detail, 1)
	det := hasil["guru_a"].Detail[0]
	assert.Equal(t, 20, det.Hadir)
	assert.Equal(t, 1, det.Izin)
	assert.Equal(t, 2, det.Sakit)
	assert.Equal(t, 0, det.Alpa)
	assert.Equal(t, 1, det.Telat)
}

// TestHitungHonorPeriodeMaterialisasiSesiDipanggil mengunci urutan: sesi hari
// biasa harus dimaterialkan sebelum SesiBulanan dibaca, kalau tidak honor bulan
// berjalan selalu nol untuk hari biasa.
func TestHitungHonorPeriodeMaterialisasiSesiDipanggil(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
	}
	sesi := &fakeSesiRepository{}
	svc := honorTestService(repo, "9000")
	svc.sesi = sesi

	_, _, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, 1, sesi.materialisasiPanggil)
	assert.Equal(t, time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local), sesi.materialisasiDari)
	assert.Equal(t, time.Date(2026, 9, 30, 0, 0, 0, 0, time.Local), sesi.materialisasiSampai)
}

// TestHitungHonorPeriodeLanjutKalauMaterialisasiGagal mengunci degradasi aman:
// rekap honor tetap dihitung dari sesi yang sudah ada ketika generator sesi
// gagal, supaya halaman rekap tidak ikut kosong.
func TestHitungHonorPeriodeLanjutKalauMaterialisasiGagal(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "guru_a",
			PengajarUtama: "guru_a",
		}},
	}
	sesi := &fakeSesiRepository{materialisasiErr: errors.New("jadwal bermasalah")}
	svc := honorTestService(repo, "9000")
	svc.sesi = sesi

	hasil, _, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err, "kegagalan materialisasi tidak boleh menggagalkan rekap")
	assert.Equal(t, 9000.0, hasil["guru_a"].TotalHonor)
}

func TestHitungHonorPenggantiStafDialihkanDariGuruAsal(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{
			{Username: "guru_a", Nama: "Guru A", Role: "guru"},
			{Username: "staf_b", Nama: "Staf B", Role: "staf"},
		},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "staf_b",
			PengajarUtama: "guru_a",
		}},
	}
	svc := honorTestService(repo, "10000")

	hasil, tarif, err := svc.hitungHonorPeriode(context.Background(), 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, int64(10000), tarif)
	assert.Equal(t, 10000.0, hasil["staf_b"].TotalHonor)
	assert.Equal(t, 1, hasil["staf_b"].TotalSesi)
	assert.Equal(t, 0.0, hasil["guru_a"].TotalHonor)
	assert.Equal(t, 0, hasil["guru_a"].TotalSesi)
}

func TestGetRekapHonorBaruDraftLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai: []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "guru_a",
			PengajarUtama: "guru_a",
		}},
	}
	svc := honorTestService(repo, "9000")

	res, err := svc.GetRekapHonorBaru(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "Draft", res["status"])
	assert.Equal(t, 9000.0, res["totalSeluruh"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, "Guru A", data[0]["nama"])
	assert.Equal(t, 9000.0, data[0]["totalHonor"])
}

func TestGetRekapHonorBaruFinalMemakaiRekapTersimpan(t *testing.T) {
	repo := &fakeHonorRepository{
		status: "Final",
		rekap: []rekapHonorRow{{
			Username: "guru_a", Nama: "Guru A", Role: "guru",
			TotalHonor: 12345, TotalSesi: 3, TotalMenit: 180,
		}},
	}
	svc := honorTestService(repo, "9000")

	res, err := svc.GetRekapHonorBaru(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, "Final", res["status"])
	assert.Equal(t, 12345.0, res["totalSeluruh"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, 3.0, data[0]["totalJam"])
}

func TestHitungUlangHonorDraftLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawai:  []pegawaiHonorRecord{{Username: "guru_a", Nama: "Guru A", Role: "guru"}},
		tambahan: map[string]float64{"guru_a": 1000},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "guru_a",
			PengajarUtama: "guru_a",
		}},
	}
	svc := honorTestService(repo, "9000")

	res, err := svc.HitungUlangHonorDraft(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.True(t, repo.gantiCalled)
	assert.Len(t, repo.gantiRekap, 1)
	assert.Equal(t, 10000.0, repo.gantiRekap[0].TotalHonor)
	assert.Len(t, repo.gantiRekap[0].Detail, 1)
	assert.Equal(t, 100, repo.gantiRekap[0].Detail[0].Persen)
}

func TestFinalisasiHonorTanpaRekapDitolak(t *testing.T) {
	repo := &fakeHonorRepository{adaRekap: 0}
	svc := honorTestService(repo, "9000")

	res, err := svc.FinalisasiHonor(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestFinalisasiHonorLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{adaRekap: 1, finalisasiN: 1}
	svc := honorTestService(repo, "9000")

	res, err := svc.FinalisasiHonor(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
}

func TestBukaFinalisasiHonorBelumFinalDitolak(t *testing.T) {
	repo := &fakeHonorRepository{bukaN: 0}
	svc := honorTestService(repo, "9000")

	res, err := svc.BukaFinalisasiHonor(context.Background(), "kepala", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetSlipHonorBaruDraftUntukKepala(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawaiRec: &pegawaiHonorRecord{Username: "budi", Nama: "Budi", Role: "guru"},
		pegawai:    []pegawaiHonorRecord{{Username: "budi", Nama: "Budi", Role: "guru"}},
		sesi: []sesiHonorRecord{{
			Tanggal:       time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			DurasiMenit:   60,
			PunyaPresensi: true,
			StatusSesi:    "Mengajar",
			Pengguna:      "budi",
			PengajarUtama: "budi",
		}},
	}
	svc := honorTestService(repo, "9000")

	res, err := svc.GetSlipHonorBaru(context.Background(), "kepala", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "Draft", res["status"])
	assert.Equal(t, 9000.0, res["totalHonor"])
	rincian, ok := res["rincian"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, rincian, 1)
}

func TestGetSlipHonorBaruTersimpanFinal(t *testing.T) {
	tgl := time.Date(2026, 9, 5, 0, 0, 0, 0, time.Local)
	repo := &fakeHonorRepository{
		pegawaiRec: &pegawaiHonorRecord{Username: "budi", Nama: "Budi", Role: "guru"},
		slipRec:    &slipHonorRow{Status: "Final", TotalHonor: 12345, TotalSesi: 3, TotalMenit: 180, TanggalCetak: &tgl},
		detail: []detailSlipRow{{
			Tanggal: time.Date(2026, 9, 1, 0, 0, 0, 0, time.Local),
			Mapel:   "Fiqih", Kelas: "VII-A", DurasiMenit: 60,
			Persen: 100, Nominal: 9000, Keterangan: "Mengajar",
			Hadir: 18, Izin: 1, Sakit: 1, Alpa: 0, Telat: 0,
		}},
	}
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"TarifHonorPerJam": "9000"}),
		honor:      repo,
	}

	res, err := svc.GetSlipHonorBaru(context.Background(), "budi", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, "Final", res["status"])
	assert.Equal(t, 12345.0, res["totalHonor"])
	assert.Equal(t, "05/09/2026", res["tanggalCetak"])
	rincian, ok := res["rincian"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, rincian, 1)
	assert.Equal(t, 100.0, rincian[0]["persen"])
	assert.Equal(t, 18, rincian[0]["hadir"])
	assert.Equal(t, 1, rincian[0]["izin"])
	assert.Equal(t, 1, rincian[0]["sakit"])
	assert.Equal(t, 0, rincian[0]["alpa"])
	assert.Equal(t, 0, rincian[0]["telat"])
}

func TestGetSlipHonorBaruBelumFinalDitolakUntukPegawai(t *testing.T) {
	repo := &fakeHonorRepository{
		pegawaiRec: &pegawaiHonorRecord{Username: "budi", Nama: "Budi", Role: "guru"},
		slipRec:    &slipHonorRow{Status: "Draft", TotalHonor: 12345},
	}
	svc := &Service{
		pengguna:   &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		pengaturan: newFakePengaturanRepository(map[string]string{"TarifHonorPerJam": "9000"}),
		honor:      repo,
	}

	res, err := svc.GetSlipHonorBaru(context.Background(), "budi", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetSlipHonorBaruPegawaiTidakDitemukan(t *testing.T) {
	svc := honorTestService(&fakeHonorRepository{}, "9000")

	res, err := svc.GetSlipHonorBaru(context.Background(), "kepala", "tidak_ada", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetRiwayatHonorPegawaiLewatRepository(t *testing.T) {
	tgl := time.Date(2026, 10, 1, 0, 0, 0, 0, time.Local)
	repo := &fakeHonorRepository{riwayat: []riwayatHonorRow{{
		Bulan: 9, Tahun: 2026, Status: "Final", TotalHonor: 12345, TotalSesi: 3, TanggalCetak: &tgl,
	}}}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		honor:    repo,
	}

	res, err := svc.GetRiwayatHonorPegawai(context.Background(), "budi", "budi")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 1)
	assert.Equal(t, 9, data[0]["bulan"])
	assert.Equal(t, "01/10/2026", data[0]["tanggalCetak"])
}

func TestGetRiwayatHonorSayaLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{terkirim: []honorTerkirimRow{
		{ID: 2, Bulan: 9, Tahun: 2026, TanggalKirim: "01/10/2026 08:00", SudahDilihat: false},
		{ID: 1, Bulan: 8, Tahun: 2026, TanggalKirim: "01/09/2026 08:00", SudahDilihat: true},
	}}
	svc := &Service{honor: repo}

	res, err := svc.GetRiwayatHonorSaya(context.Background(), "budi")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 2)
	assert.Equal(t, 2, data[0]["id"])
	assert.Equal(t, "01/10/2026 08:00", data[0]["tanggalKirim"])
	assert.Equal(t, true, data[1]["sudahDilihat"])
}

func TestTandaiHonorDilihatLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{}
	svc := &Service{honor: repo}

	res, err := svc.TandaiHonorDilihat(context.Background(), "budi", float64(7))
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 7, repo.tandaiID)
	assert.Equal(t, "budi", repo.tandaiUser)
}

func TestKirimSlipHonorSatuGuruSukses(t *testing.T) {
	repo := &fakeHonorRepository{slipTerkirim: false}
	svc := &Service{
		pengguna: &fakePenggunaRepository{
			aksesRole: "kepala", aksesStatus: "Aktif",
			rec: &penggunaRecord{ID: 3, Username: "budi", NamaLengkap: "Budi Santoso"},
		},
		honor: repo,
	}

	res, err := svc.KirimSlipHonorSatuGuru(context.Background(), "kepala", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.kirimInput, 1)
	assert.Equal(t, "budi", repo.kirimInput[0].Username)
	assert.Equal(t, "Budi Santoso", repo.kirimInput[0].NamaGuru)
	assert.Equal(t, 9, repo.kirimInput[0].Bulan)
	assert.Equal(t, 2026, repo.kirimInput[0].Tahun)
}

func TestKirimSlipHonorSatuGuruDuplikatDitolak(t *testing.T) {
	repo := &fakeHonorRepository{slipTerkirim: true}
	svc := honorTestService(repo, "9000")

	res, err := svc.KirimSlipHonorSatuGuru(context.Background(), "kepala", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
	assert.Empty(t, repo.kirimInput)
}

func TestKirimSlipHonorSatuGuruAksesDitolak(t *testing.T) {
	repo := &fakeHonorRepository{}
	svc := &Service{
		pengguna: &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"},
		honor:    repo,
	}

	res, err := svc.KirimSlipHonorSatuGuru(context.Background(), "guru", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetHonorTambahanSatuGuruLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{tambahanRec: honorTambahanRecord{
		HonorStruktural: 500000, HonorTugasTambahan: 250000, Keterangan: "Wali kelas",
	}}
	svc := honorTestService(repo, "9000")

	res, err := svc.GetHonorTambahanSatuGuru(context.Background(), "kepala", "budi", 9, 2026)
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	data, ok := res["data"].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, int64(500000), data["honorStruktural"])
	assert.Equal(t, int64(250000), data["honorTugasTambahan"])
	assert.Equal(t, "Wali kelas", data["keterangan"])
}

func TestSimpanHonorTambahanLewatRepository(t *testing.T) {
	repo := &fakeHonorRepository{}
	svc := &Service{
		pengguna: &fakePenggunaRepository{
			aksesRole: "kepala", aksesStatus: "Aktif",
			rec: &penggunaRecord{ID: 3, Username: "budi", NamaLengkap: "Budi Santoso"},
		},
		honor: repo,
	}

	res, err := svc.SimpanHonorTambahan(context.Background(), "kepala", map[string]interface{}{
		"username":           "budi",
		"bulan":              9,
		"tahun":              2026,
		"honorStruktural":    500000,
		"honorTugasTambahan": 250000,
		"keterangan":         "Wali kelas",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.simpanTambahan, 1)
	assert.Equal(t, "budi", repo.simpanTambahan[0].Username)
	assert.Equal(t, "Budi Santoso", repo.simpanTambahan[0].NamaGuru)
	assert.Equal(t, int64(500000), repo.simpanTambahan[0].HonorStruktural)
	assert.Equal(t, int64(250000), repo.simpanTambahan[0].HonorTugasTambahan)
	assert.Equal(t, "Wali kelas", repo.simpanTambahan[0].Keterangan)
}
