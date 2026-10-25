package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func userMgmtService(repo *fakePenggunaRepository) *Service {
	if repo.aksesRole == "" {
		repo.aksesRole = "admin"
		repo.aksesStatus = "Aktif"
	}
	return &Service{pengguna: repo}
}

func TestGetSemuaUserDariRepository(t *testing.T) {
	repo := &fakePenggunaRepository{daftarLengkap: []penggunaListRow{
		{ID: 1, Username: "admin", Role: "admin", NamaLengkap: "Admin", Status: "Aktif", IzinkanPengganti: true},
	}}
	svc := userMgmtService(repo)

	res, err := svc.GetSemuaUser(context.Background(), "admin")
	assert.NoError(t, err)
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "admin", data[0]["username"])
	assert.Equal(t, true, data[0]["izinkanGuruPengganti"])
}

func TestGetSemuaUserDitolakUntukGuru(t *testing.T) {
	repo := &fakePenggunaRepository{aksesRole: "guru", aksesStatus: "Aktif"}
	svc := &Service{pengguna: repo}

	res, err := svc.GetSemuaUser(context.Background(), "guru")
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestTambahUserMengirimInput(t *testing.T) {
	repo := &fakePenggunaRepository{}
	svc := userMgmtService(repo)

	res, err := svc.TambahUser(context.Background(), map[string]interface{}{
		"requestedBy": "admin",
		"username":    "budiguru",
		"password":    "rahasia",
		"role":        "guru",
		"namaLengkap": "Budi",
		"noHp":        "0812",
		"status":      "Aktif",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.buatInput, 1)
	in := repo.buatInput[0]
	assert.Equal(t, "budiguru", in.Username)
	assert.Equal(t, "guru", in.Role)
	assert.Equal(t, "Aktif", in.Status)
	cocok, _ := PasswordCocok(in.PasswordHash, "rahasia")
	assert.True(t, cocok)
}

func TestTambahUserTolakPasswordPendek(t *testing.T) {
	svc := userMgmtService(&fakePenggunaRepository{})

	res, err := svc.TambahUser(context.Background(), map[string]interface{}{
		"requestedBy": "admin", "username": "x", "password": "123", "role": "guru", "namaLengkap": "X",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestUpdateUserRenameMengirimInput(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{ID: 9, Username: "lama"}}
	svc := userMgmtService(repo)

	res, err := svc.UpdateUser(context.Background(), map[string]interface{}{
		"requestedBy": "admin",
		"id":          float64(9),
		"username":    "baru",
		"role":        "guru",
		"namaLengkap": "Nama Baru",
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.updateAkun, 1)
	in := repo.updateAkun[0]
	assert.Equal(t, "lama", in.UsernameLama)
	assert.Equal(t, "baru", in.UsernameBaru)
	assert.Equal(t, "", in.PasswordHash, "password kosong tidak diubah")
}

func TestUpdateUserStafMengizinkanGuruPengganti(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{ID: 9, Username: "staf"}}
	svc := userMgmtService(repo)

	res, err := svc.UpdateUser(context.Background(), map[string]interface{}{
		"requestedBy":          "admin",
		"id":                   float64(9),
		"username":             "staf",
		"role":                 "staf",
		"namaLengkap":          "Staf",
		"izinkanGuruPengganti": true,
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.updateAkun, 1)
	assert.Equal(t, "staf", repo.updateAkun[0].Role)
	assert.True(t, repo.updateAkun[0].IzinkanPengganti)
}

func TestUpdateUserTolakUsernameDipakai(t *testing.T) {
	repo := &fakePenggunaRepository{rec: &penggunaRecord{ID: 9, Username: "lama"}, usernameDipake: true}
	svc := userMgmtService(repo)

	res, err := svc.UpdateUser(context.Background(), map[string]interface{}{
		"requestedBy": "admin", "id": float64(9), "username": "baru", "role": "guru", "namaLengkap": "N",
	})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestHapusUserMengirimID(t *testing.T) {
	repo := &fakePenggunaRepository{}
	svc := userMgmtService(repo)

	res, err := svc.HapusUser(context.Background(), "admin", float64(4))
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Equal(t, 4, repo.hapusID)
}

func TestImporGuruMassalDariRepository(t *testing.T) {
	repo := &fakePenggunaRepository{usernames: []string{"ahmad"}}
	svc := userMgmtService(repo)

	res, err := svc.ImporGuruMassal(context.Background(), "admin", []interface{}{
		map[string]interface{}{"namaLengkap": ""},
		map[string]interface{}{"namaLengkap": "Ahmad", "nipNuptk": ""},
	})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.Len(t, repo.buatInput, 1)
	assert.Equal(t, "ahmad2", repo.buatInput[0].Username)
	cocok, _ := PasswordCocok(repo.buatInput[0].PasswordHash, "ahmad2123")
	assert.True(t, cocok)
	gagal := res["gagal"].([]string)
	assert.Contains(t, gagal, "(baris kosong)")
}

func TestGetDaftarGuruDariRepository(t *testing.T) {
	repo := &fakePenggunaRepository{daftarGuru: []guruRingkasRow{
		{Username: "haeriyah", NamaLengkap: "Haeriyah", MataPelajaran: "Fiqih", Kelas: "VII-A", JamKe: "1-2"},
	}}
	svc := userMgmtService(repo)

	res, err := svc.GetDaftarGuru(context.Background(), "admin")
	assert.NoError(t, err)
	data := res["data"].([]map[string]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "haeriyah", data[0]["username"])
}
