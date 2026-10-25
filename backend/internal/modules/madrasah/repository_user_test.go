package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// fakePenggunaRepository adalah implementasi in-memory untuk pengujian unit.
type fakePenggunaRepository struct {
	rec *penggunaRecord

	aksesRole   string
	aksesStatus string
	aksesErr    error

	updatedUsername string
	updatedHash     string
	updateCalls     int

	daftarLengkap []penggunaListRow
	daftarGuru    []guruRingkasRow
	usernames     []string

	buatInput      []penggunaInput
	buatErr        error
	updateAkun     []penggunaUpdateInput
	hapusID        int
	usernameDipake bool
}

func (f *fakePenggunaRepository) CariBerdasarkanUsername(context.Context, string) (*penggunaRecord, error) {
	if f.rec == nil {
		return nil, ErrPenggunaTidakDitemukan
	}
	return f.rec, nil
}

func (f *fakePenggunaRepository) CariAkses(context.Context, string) (string, string, error) {
	return f.aksesRole, f.aksesStatus, f.aksesErr
}

func (f *fakePenggunaRepository) PerbaruiPassword(_ context.Context, username, passwordHash string) error {
	f.updatedUsername = username
	f.updatedHash = passwordHash
	f.updateCalls++
	return nil
}

func (f *fakePenggunaRepository) DaftarLengkap(context.Context) ([]penggunaListRow, error) {
	return f.daftarLengkap, nil
}

func (f *fakePenggunaRepository) DaftarUsername(context.Context) ([]string, error) {
	return f.usernames, nil
}

func (f *fakePenggunaRepository) DaftarGuruAktif(context.Context) ([]guruRingkasRow, error) {
	return f.daftarGuru, nil
}

func (f *fakePenggunaRepository) Buat(_ context.Context, in penggunaInput) error {
	if f.buatErr != nil {
		return f.buatErr
	}
	f.buatInput = append(f.buatInput, in)
	return nil
}

func (f *fakePenggunaRepository) UsernameDipakai(context.Context, string, int) (bool, error) {
	return f.usernameDipake, nil
}

func (f *fakePenggunaRepository) UsernameBerdasarkanID(context.Context, int) (string, error) {
	if f.rec == nil {
		return "", ErrPenggunaTidakDitemukan
	}
	return f.rec.Username, nil
}

func (f *fakePenggunaRepository) PerbaruiAkun(_ context.Context, in penggunaUpdateInput) error {
	f.updateAkun = append(f.updateAkun, in)
	return nil
}

func (f *fakePenggunaRepository) Hapus(_ context.Context, id int) error {
	f.hapusID = id
	return nil
}

func (f *fakePenggunaRepository) SiapkanKolomImpor(context.Context) error {
	return nil
}

func (f *fakePenggunaRepository) NamaGuru(context.Context, string) (string, error) {
	if f.rec == nil {
		return "", ErrPenggunaTidakDitemukan
	}
	return f.rec.NamaLengkap, nil
}

func (f *fakePenggunaRepository) IDByUsername(context.Context, string) (int, error) {
	if f.rec == nil {
		return 0, ErrPenggunaTidakDitemukan
	}
	return f.rec.ID, nil
}

func TestLoginBerdasarkanRepository(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{
		ID:               7,
		Username:         "haeriyah",
		Role:             "guru",
		NamaLengkap:      "Haeriyah",
		MataPelajaran:    "Fiqih",
		Kelas:            "VII-A",
		JamKe:            "1-2",
		Status:           "Aktif",
		Password:         HashPassword("rahasia"),
		IzinkanPengganti: true,
	}}
	svc := &Service{pengguna: repo}

	res, err := svc.Login(context.Background(), "haeriyah", "rahasia")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])

	user, ok := res["user"].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, 7, user["id"])
	assert.Equal(t, "guru", user["role"])
	assert.Equal(t, true, user["izinkanGuruPengganti"])
	assert.Equal(t, 0, repo.updateCalls, "password bcrypt tidak perlu di-upgrade")
}

func TestLoginMenolakPasswordSalah(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{
		Username: "haeriyah",
		Status:   "Aktif",
		Password: HashPassword("rahasia"),
	}}
	svc := &Service{pengguna: repo}

	res, err := svc.Login(context.Background(), "haeriyah", "salah")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestLoginMenolakAkunTidakAktif(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{
		Username: "haeriyah",
		Status:   "Nonaktif",
		Password: HashPassword("rahasia"),
	}}
	svc := &Service{pengguna: repo}

	res, err := svc.Login(context.Background(), "haeriyah", "rahasia")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestLoginUpgradePasswordLegacy(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{
		Username: "haeriyah",
		Status:   "Aktif",
		Password: "rahasia", // plaintext legacy
	}}
	svc := &Service{pengguna: repo}

	res, err := svc.Login(context.Background(), "haeriyah", "rahasia")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])

	assert.Equal(t, 1, repo.updateCalls, "password legacy harus di-upgrade ke bcrypt")
	assert.Equal(t, "haeriyah", repo.updatedUsername)
	cocok, upgrade := PasswordCocok(repo.updatedHash, "rahasia")
	assert.True(t, cocok)
	assert.False(t, upgrade)
}

func TestCheckAccessDenganRepository(t *testing.T) {
	cases := []struct {
		role     string
		status   string
		required string
		want     bool
	}{
		{"admin", "Aktif", "admin", true},
		{"admin", "Aktif", "kepala", false},
		{"kepala", "Aktif", "kepala", true},
		{"guru", "Aktif", "adminKepala", false},
		{"kepala", "Aktif", "adminKepala", true},
		{"admin", "Aktif", "adminKepala", true},
		{"guru", "Aktif", "guru", true},
		{"kepala", "Aktif", "guru", true},
		{"admin", "Aktif", "guru", false},
		{"guru", "Nonaktif", "guru", false},
	}
	for _, tc := range cases {
		svc := &Service{pengguna: &fakePenggunaRepository{aksesRole: tc.role, aksesStatus: tc.status}}
		assert.Equal(t, tc.want, svc.CheckAccess(context.Background(), "siapa", tc.required),
			"role=%s status=%s required=%s", tc.role, tc.status, tc.required)
	}
}

func TestCheckAccessUsernameKosong(t *testing.T) {
	svc := &Service{pengguna: &fakePenggunaRepository{aksesRole: "admin", aksesStatus: "Aktif"}}
	assert.False(t, svc.CheckAccess(context.Background(), "", "admin"))
}

func TestGantiPasswordSendiriBerdasarkanRepository(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{
		Username: "haeriyah",
		Password: HashPassword("lama123"),
	}}
	svc := &Service{pengguna: repo}

	res, err := svc.GantiPasswordSendiri(context.Background(), "haeriyah", "lama123", "baru123")
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 1, repo.updateCalls)
	cocok, _ := PasswordCocok(repo.updatedHash, "baru123")
	assert.True(t, cocok)

	res, _ = svc.GantiPasswordSendiri(context.Background(), "haeriyah", "salah", "baru123")
	assert.Equal(t, false, res["success"])

	res, _ = svc.GantiPasswordSendiri(context.Background(), "haeriyah", "baru123", "123")
	assert.Equal(t, false, res["success"])
}
