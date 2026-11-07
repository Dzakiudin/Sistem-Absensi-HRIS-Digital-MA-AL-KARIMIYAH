package madrasah

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsGuruBKMapel(t *testing.T) {
	assert.True(t, isGuruBKMapel("Bk"))
	assert.True(t, isGuruBKMapel("Koord bk"))
	assert.True(t, isGuruBKMapel("Koordinator BK"))
	assert.True(t, isGuruBKMapel("Guru BK"))
	assert.True(t, isGuruBKMapel("Bimbingan dan Konseling"))

	assert.False(t, isGuruBKMapel("Matematika"))
	assert.False(t, isGuruBKMapel("Baca Kitab"))
	assert.False(t, isGuruBKMapel("Tu"))
	assert.False(t, isGuruBKMapel("-"))
	assert.False(t, isGuruBKMapel(""))
}

func TestIsKecamatanKepulauan(t *testing.T) {
	assert.True(t, isKecamatanKepulauan("Sapeken"))
	assert.True(t, isKecamatanKepulauan("Masalembu"))
	assert.True(t, isKecamatanKepulauan("Raas"))
	assert.True(t, isKecamatanKepulauan("Arjasa"))
	assert.True(t, isKecamatanKepulauan("Kangayan"))
	assert.False(t, isKecamatanKepulauan("Gapura"))
	assert.False(t, isKecamatanKepulauan("Batang-Batang"))
}

func TestGetDashboardBKDitolakUntukGuruNonBK(t *testing.T) {
	repo := &fakePenggunaRepository{
		aksesRole:   "guru",
		aksesStatus: "Aktif",
		rec: &penggunaRecord{
			ID:            10,
			Username:      "gurumtk",
			Role:          "guru",
			NamaLengkap:   "Guru Matematika",
			MataPelajaran: "Matematika",
			Status:        "Aktif",
		},
	}
	svc := &Service{pengguna: repo}

	res, err := svc.GetDashboardBK(context.Background(), "gurumtk", map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, false, res["success"])
}

func TestGetDashboardBKDibukaUntukGuruBK(t *testing.T) {
	repo := &fakePenggunaRepository{
		aksesRole:   "guru",
		aksesStatus: "Aktif",
		rec: &penggunaRecord{
			ID:            22,
			Username:      "aguspranoto",
			Role:          "guru",
			NamaLengkap:   "Agus Pranoto, S.Pd",
			MataPelajaran: "Koord bk",
			Status:        "Aktif",
		},
	}
	svc := &Service{pengguna: repo}

	res, err := svc.GetDashboardBK(context.Background(), "aguspranoto", map[string]interface{}{})
	assert.NoError(t, err)
	assert.Equal(t, true, res["success"])
	assert.NotNil(t, res["ringkasan"])
}
