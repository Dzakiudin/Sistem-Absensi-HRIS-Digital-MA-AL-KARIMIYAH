package madrasah

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestHashPassword(t *testing.T) {
	hash := HashPassword("admin123")
	assert.NotEqual(t, "admin123", hash)
	assert.True(t, strings.HasPrefix(hash, "$2"))
	cocok, upgrade := PasswordCocok(hash, "admin123")
	assert.True(t, cocok)
	assert.False(t, upgrade)
	cocok, _ = PasswordCocok(hash, "admin124")
	assert.False(t, cocok)
	assert.NotEqual(t, HashPassword("admin123"), HashPassword("admin123"))

	cocok, upgrade = PasswordCocok("240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", "admin123")
	assert.True(t, cocok)
	assert.True(t, upgrade)

	cocok, upgrade = PasswordCocok("admin123", "admin123")
	assert.True(t, cocok)
	assert.True(t, upgrade)

	cocok, _ = PasswordCocok("", "x")
	assert.False(t, cocok)
}

func TestParseTanggalIndo(t *testing.T) {
	got, err := parseTanggalIndo("19/09/2026")
	assert.NoError(t, err)
	assert.Equal(t, 2026, got.Year())
	assert.Equal(t, time.September, got.Month())
	assert.Equal(t, 19, got.Day())

	_, err = parseTanggalIndo("2026-09-19")
	assert.Error(t, err)

	_, err = parseTanggalIndo("19/13/2026")
	assert.Error(t, err)

	_, err = parseTanggalIndo("32/01/2026")
	assert.Error(t, err)

	_, err = parseTanggalIndo("19/09/26")
	assert.Error(t, err)

	_, err = parseTanggalIndo("19/09")
	assert.Error(t, err)
}

func TestHitungHariDalamRentang(t *testing.T) {
	awal := time.Date(2026, time.September, 1, 0, 0, 0, 0, time.Local)
	akhir := time.Date(2026, time.September, 30, 0, 0, 0, 0, time.Local)

	assert.Equal(t, 5, hitungHariDalamRentang(awal, akhir, "Selasa"))
	assert.Equal(t, 5, hitungHariDalamRentang(awal, akhir, "Rabu"))
	assert.Equal(t, 4, hitungHariDalamRentang(awal, akhir, "Senin"))
	assert.Equal(t, 4, hitungHariDalamRentang(awal, akhir, "Minggu"))
	assert.Equal(t, 0, hitungHariDalamRentang(awal, akhir, "HariRaya"))

	seminggu := time.Date(2026, time.September, 7, 0, 0, 0, 0, time.Local)
	for _, hari := range []string{"Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"} {
		assert.Equal(t, 1, hitungHariDalamRentang(awal, seminggu, hari), hari)
	}

	// Rentang yang berbalik arah harus dihitung 0.
	assert.Equal(t, 0, hitungHariDalamRentang(akhir, awal, "Senin"))
}

func TestInterfaceToInt(t *testing.T) {
	assert.Equal(t, 5, interfaceToInt(5.0))
	assert.Equal(t, 5, interfaceToInt(5))
	assert.Equal(t, 5, interfaceToInt("5"))
	assert.Equal(t, 0, interfaceToInt("abc"))
	assert.Equal(t, 0, interfaceToInt(nil))
}

func TestStatusSiswaValid(t *testing.T) {
	assert.True(t, statusSiswaValid["H"])
	assert.True(t, statusSiswaValid["I"])
	assert.True(t, statusSiswaValid["S"])
	assert.True(t, statusSiswaValid["A"])
	assert.True(t, statusSiswaValid["T"])
	assert.False(t, statusSiswaValid["X"])
}

func TestDateOrNil(t *testing.T) {
	zero := time.Time{}
	assert.Nil(t, dateOrNil(zero))
	got := dateOrNil(time.Date(2026, time.September, 19, 0, 0, 0, 0, time.Local))
	assert.NotNil(t, got)
}

func TestSortByKelasId(t *testing.T) {
	list := []map[string]interface{}{
		{"kelasId": 3, "kodeKelas": "IX-A"},
		{"kelasId": 1, "kodeKelas": "VII-A"},
		{"kelasId": 2, "kodeKelas": "VIII-A"},
	}
	sortByKelasId(list)
	assert.Equal(t, "VII-A", list[0]["kodeKelas"])
	assert.Equal(t, "VIII-A", list[1]["kodeKelas"])
	assert.Equal(t, "IX-A", list[2]["kodeKelas"])
}

func TestNormalisasiUsername(t *testing.T) {
	assert.Equal(t, "haeriyah", normalisasiUsername("  Haeriyah "))
	assert.Equal(t, "siti.nur", normalisasiUsername("SITI.NUR"))
	assert.Equal(t, "ahmad-01", normalisasiUsername("ahmad-01"))
	assert.Equal(t, "", normalisasiUsername("   "))
}

func TestValidasiUsernameXC(t *testing.T) {
	for _, ok := range []string{"abc", "haeriyah", "siti.nur", "ahmad-01", "guru_01", "a1b"} {
		assert.Equal(t, "", validasiUsernameXC(ok), ok)
	}
	assert.NotEqual(t, "", validasiUsernameXC(""))
	assert.NotEqual(t, "", validasiUsernameXC("ab"))
	assert.NotEqual(t, "", validasiUsernameXC("ab"))
	assert.NotEqual(t, "", validasiUsernameXC("siti nur"))
	assert.NotEqual(t, "", validasiUsernameXC("SitiNur"))
	assert.NotEqual(t, "", validasiUsernameXC("siti@nur"))
	assert.NotEqual(t, "", validasiUsernameXC("siti/nur"))
	assert.NotEqual(t, "", validasiUsernameXC("-siti"))
	assert.NotEqual(t, "", validasiUsernameXC(strings.Repeat("a", 33)))
}

func TestIsMingguLibur(t *testing.T) {
	// Bawaan (kosong atau "true") harus true (libur)
	assert.True(t, IsMingguLibur(""))
	assert.True(t, IsMingguLibur("true"))
	assert.True(t, IsMingguLibur("True"))
	assert.True(t, IsMingguLibur("1"))

	// Saat dinonaktifkan (false atau 0) harus false (tidak libur)
	assert.False(t, IsMingguLibur("false"))
	assert.False(t, IsMingguLibur("False"))
	assert.False(t, IsMingguLibur("FALSE"))
	assert.False(t, IsMingguLibur("0"))
}
