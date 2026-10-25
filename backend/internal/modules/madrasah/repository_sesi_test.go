package madrasah

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeSesiRepository adalah implementasi in-memory untuk pengujian unit.
type fakeSesiRepository struct {
	jadwal     []jadwalGuruRow
	saved      []sesiIzinInput
	saveErr    error
	tanggal    []sesiMengajarRow
	tanggalErr error

	materialisasiErr     error
	materialisasiPanggil int
	materialisasiDari    time.Time
	materialisasiSampai  time.Time
}

func (f *fakeSesiRepository) JadwalGuru(context.Context, sqlExecutor, string) ([]jadwalGuruRow, error) {
	return f.jadwal, nil
}

func (f *fakeSesiRepository) SimpanSesiIzin(_ context.Context, _ sqlExecutor, in sesiIzinInput) error {
	if f.saveErr != nil {
		return f.saveErr
	}
	f.saved = append(f.saved, in)
	return nil
}

func (f *fakeSesiRepository) SesiTanggal(context.Context, string) ([]sesiMengajarRow, error) {
	return f.tanggal, f.tanggalErr
}

func (f *fakeSesiRepository) MaterialisasiSesiPeriode(_ context.Context, dari, sampai time.Time) error {
	if f.materialisasiErr != nil {
		return f.materialisasiErr
	}
	f.materialisasiPanggil++
	f.materialisasiDari = dari
	f.materialisasiSampai = sampai
	return nil
}

func sesiTestService(repoSesi *fakeSesiRepository, repoIzin *fakeIzinRepository, libur map[string]string) *Service {
	return &Service{
		sesi:       repoSesi,
		izin:       repoIzin,
		hariLibur:  newFakeHariLiburRepository(libur),
		pengaturan: newFakePengaturanRepository(map[string]string{"MingguLibur": "false"}),
	}
}

func TestMaterialisasiSesiIzinTanpaPengganti(t *testing.T) {
	tgl := time.Date(2026, 9, 7, 0, 0, 0, 0, time.Local)
	hari := namaHariDariTanggal(tgl)
	jamMulai := time.Date(2026, 9, 7, 7, 0, 0, 0, time.Local)
	jamSelesai := time.Date(2026, 9, 7, 8, 0, 0, 0, time.Local)

	repoSesi := &fakeSesiRepository{jadwal: []jadwalGuruRow{{
		ID: 11, Hari: hari, Mapel: "Fiqih", Kelas: "VII-A", JamKe: "1",
		JamMulai: &jamMulai, JamSelesai: &jamSelesai,
	}}}
	svc := sesiTestService(repoSesi, &fakeIzinRepository{}, nil)

	err := svc.materialisasiSesiIzin(context.Background(), nil, 1, "budi", "Budi", tgl, tgl)
	assert.NoError(t, err)
	assert.Len(t, repoSesi.saved, 1)
	in := repoSesi.saved[0]
	assert.Equal(t, 11, in.JadwalID)
	assert.Equal(t, "Digantikan", in.StatusSesi)
	assert.Equal(t, "budi", in.Pengguna)
	assert.Equal(t, "budi", in.PengajarUtama)
	assert.Equal(t, 60, in.DurasiMenit)
	assert.Equal(t, "", in.NamaPengganti)
}

func TestMaterialisasiSesiIzinDenganPenggantiDiterima(t *testing.T) {
	tgl := time.Date(2026, 9, 7, 0, 0, 0, 0, time.Local)
	hari := namaHariDariTanggal(tgl)
	jamMulai := time.Date(2026, 9, 7, 10, 0, 0, 0, time.Local)
	jamSelesai := time.Date(2026, 9, 7, 10, 40, 0, 0, time.Local)

	repoSesi := &fakeSesiRepository{jadwal: []jadwalGuruRow{{
		ID: 12, Hari: hari, Mapel: "Matematika", Kelas: "VIII-B", JamKe: "3",
		JamMulai: &jamMulai, JamSelesai: &jamSelesai,
	}}}

	repoIzin := &fakeIzinRepository{penggantiByIzin: map[int]*guruPenggantiRecord{
		1: {ID: 5, IzinID: 1, GuruAsal: "budi", NamaAsal: "Budi",
			GuruPengganti: "sari", NamaPengganti: "Sari", Status: "Diterima"},
	}}
	svc := sesiTestService(repoSesi, repoIzin, nil)

	err := svc.materialisasiSesiIzin(context.Background(), nil, 1, "budi", "Budi", tgl, tgl)
	assert.NoError(t, err)
	assert.Len(t, repoSesi.saved, 1)
	in := repoSesi.saved[0]
	assert.Equal(t, "Mengajar", in.StatusSesi)
	assert.Equal(t, "sari", in.Pengguna)
	assert.Equal(t, "Sari", in.NamaPengajar)
	assert.Equal(t, "Budi", in.NamaPengganti)
	assert.Equal(t, "budi", in.PengajarUtama)
	assert.Equal(t, 40, in.DurasiMenit)
}

func TestMaterialisasiSesiIzinMelewatiHariLibur(t *testing.T) {
	tgl := time.Date(2026, 9, 7, 0, 0, 0, 0, time.Local)
	hari := namaHariDariTanggal(tgl)
	repoSesi := &fakeSesiRepository{jadwal: []jadwalGuruRow{{
		ID: 13, Hari: hari, Mapel: "IPA", Kelas: "IX-A", JamKe: "2",
	}}}
	svc := sesiTestService(repoSesi, &fakeIzinRepository{}, map[string]string{
		tgl.Format("02/01/2006"): "Libur semester",
	})

	err := svc.materialisasiSesiIzin(context.Background(), nil, 1, "budi", "Budi", tgl, tgl)
	assert.NoError(t, err)
	assert.Empty(t, repoSesi.saved)
}
