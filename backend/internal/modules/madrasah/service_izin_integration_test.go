//go:build integration

package madrasah

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"

	"github.com/paspapan/backend/internal/cache"
)

// testPool menyambung ke database nyata untuk integration test. Bila
// DATABASE_URL kosong atau database tidak dapat dijangkau, test dilewati
// (skip) supaya `go test` biasa tetap hijau tanpa infrastruktur.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	_ = godotenv.Load("../../../.env")
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL tidak diatur; lewati integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("gagal membuat pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("database tidak dapat dijangkau: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestGetDaftarGuruUntukPenggantiHanyaMenampilkanYangDiizinkan(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	stamp := time.Now().UnixNano()
	pemohon := fmt.Sprintf("it_pemohon_%d", stamp)
	diizinkan := fmt.Sprintf("it_pengganti_ya_%d", stamp)
	tidakDiizinkan := fmt.Sprintf("it_pengganti_tidak_%d", stamp)

	seedUser := func(username, nama string, boleh bool) {
		_, err := pool.Exec(ctx, `
			INSERT INTO madrasah_users
				(username, password, role, nama_lengkap, status, izinkan_guru_pengganti)
			VALUES ($1, 'x', 'guru', $2, 'Aktif', $3)`,
			username, nama, boleh)
		require.NoError(t, err, "seed user %s", username)
	}
	seedUser(pemohon, "Pemohon IT", false)
	seedUser(diizinkan, "Guru Diizinkan IT", true)
	seedUser(tidakDiizinkan, "Guru Tidak Diizinkan IT", false)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_users WHERE username IN ($1, $2, $3)`, pemohon, diizinkan, tidakDiizinkan)
	})

	res, err := NewService(pool).GetDaftarGuruUntukPengganti(ctx, pemohon)
	require.NoError(t, err)
	require.Equal(t, true, res["success"])
	data, ok := res["data"].([]map[string]interface{})
	require.True(t, ok)
	require.Len(t, data, 1)
	require.Equal(t, diizinkan, data[0]["username"])
}

// TestProsesIzinIntegration mengunci perilaku transaksi alur izin terhadap
// database sungguhan: persetujuan membuat baris absensi harian, penolakan
// tidak membuat baris, dan non-kepala ditolak.
func TestProsesIzinIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	kepala := fmt.Sprintf("it_kepala_%d", stamp)
	guru := fmt.Sprintf("it_guru_%d", stamp)

	seedUser := func(username, role, nama string) {
		_, err := pool.Exec(ctx,
			`INSERT INTO madrasah_users (username, password, role, nama_lengkap, status)
			 VALUES ($1, 'x', $2, $3, 'Aktif')`, username, role, nama)
		require.NoError(t, err, "seed user %s", username)
	}
	seedUser(kepala, "kepala", "Kepala IT")
	seedUser(guru, "guru", "Guru IT")

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_absensi_harian WHERE username IN ($1, $2)`, guru, kepala)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_pengajuan_izin WHERE username = $1`, guru)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_users WHERE username IN ($1, $2)`, kepala, guru)
	})

	tgl := time.Now().AddDate(0, 0, 3)
	seedPengajuan := func() int {
		var id int
		err := pool.QueryRow(ctx, `
			INSERT INTO madrasah_pengajuan_izin
				(username, nama, jenis, tgl_mulai, tgl_selesai, alasan, status, diajukan_oleh)
			VALUES ($1, 'Guru IT', 'Izin', $2, $2, 'integration', 'Pending', $1)
			RETURNING id`, guru, tgl).Scan(&id)
		require.NoError(t, err, "seed pengajuan")
		return id
	}

	svc := NewService(pool)
	svc.SetCache(cache.Noop())

	var status string
	var jumlah int

	// --- Setujui: status berubah + baris absensi harian terbentuk ---
	izinSetuju := seedPengajuan()
	res, err := svc.ProsesIzin(ctx, kepala, map[string]interface{}{
		"izinId": float64(izinSetuju), "aksi": "Setujui", "catatan": "ok",
	})
	require.NoError(t, err)
	require.Equal(t, true, res["success"])
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_pengajuan_izin WHERE id = $1`, izinSetuju).Scan(&status))
	require.Equal(t, "Disetujui", status)
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM madrasah_absensi_harian WHERE izin_id = $1`, izinSetuju).Scan(&jumlah))
	require.Equal(t, 1, jumlah)

	// --- Tolak: status berubah tanpa baris absensi ---
	izinTolak := seedPengajuan()
	res, err = svc.ProsesIzin(ctx, kepala, map[string]interface{}{
		"izinId": float64(izinTolak), "aksi": "Tolak", "catatan": "tidak",
	})
	require.NoError(t, err)
	require.Equal(t, true, res["success"])
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_pengajuan_izin WHERE id = $1`, izinTolak).Scan(&status))
	require.Equal(t, "Ditolak", status)
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM madrasah_absensi_harian WHERE izin_id = $1`, izinTolak).Scan(&jumlah))
	require.Equal(t, 0, jumlah)

	// --- Non-kepala ditolak oleh RBAC ---
	izinRbac := seedPengajuan()
	res, err = svc.ProsesIzin(ctx, guru, map[string]interface{}{"izinId": float64(izinRbac), "aksi": "Setujui"})
	require.NoError(t, err)
	require.Equal(t, false, res["success"])
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_pengajuan_izin WHERE id = $1`, izinRbac).Scan(&status))
	require.Equal(t, "Pending", status)
}

// TestJawabPenggantiIntegration mengunci kontrak jawaban pengganti terhadap
// database nyata: nilai non-kanonik "Terima" harus diterima (dinormalkan ke
// "Diterima"), jawaban ganda ditolak, jawaban tak dikenal tidak mengubah
// status, dan permintaan milik orang lain tidak bisa dijawab.
func TestJawabPenggantiIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	svc := NewService(pool)
	svc.SetCache(cache.Noop())

	stamp := time.Now().UnixNano()
	asal := fmt.Sprintf("it_pgasal_%d", stamp)
	ganti := fmt.Sprintf("it_pgganti_%d", stamp)
	namaAsal, namaGanti := "Guru Asal IT", "Guru Pengganti IT"

	for _, u := range [][3]string{{asal, "guru", namaAsal}, {ganti, "guru", namaGanti}} {
		_, err := pool.Exec(ctx,
			`INSERT INTO madrasah_users (username, password, role, nama_lengkap, status)
			 VALUES ($1, 'x', $2, $3, 'Aktif')`, u[0], u[1], u[2])
		require.NoError(t, err, "seed user %s", u[0])
	}

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_guru_pengganti WHERE guru_pengganti = $1`, ganti)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_pengajuan_izin WHERE username = $1`, asal)
		_, _ = pool.Exec(ctx, `DELETE FROM madrasah_users WHERE username IN ($1, $2)`, asal, ganti)
	})

	seed := func() int {
		var izinID int
		err := pool.QueryRow(ctx, `
			INSERT INTO madrasah_pengajuan_izin
				(username, nama, jenis, tgl_mulai, tgl_selesai, alasan, status, diajukan_oleh)
			VALUES ($1, $2, 'Izin', $3, $3, 'integration', 'Disetujui', $1)
			RETURNING id`, asal, namaAsal, time.Now().AddDate(0, 0, 2)).Scan(&izinID)
		require.NoError(t, err, "seed pengajuan")
		var pgID int
		err = pool.QueryRow(ctx, `
			INSERT INTO madrasah_guru_pengganti
				(izin_id, guru_asal, nama_asal, guru_pengganti, nama_pengganti, status)
			VALUES ($1, $2, $3, $4, $5, 'Pending')
			RETURNING id`, izinID, asal, namaAsal, ganti, namaGanti).Scan(&pgID)
		require.NoError(t, err, "seed pengganti")
		return pgID
	}

	var status string

	// 1. "Terima" (non-kanonik) diterima; status menjadi 'Diterima'.
	pg1 := seed()
	res, err := svc.JawabPengganti(ctx, map[string]interface{}{
		"username": ganti, "penggantiId": float64(pg1), "jawab": "Terima",
	})
	require.NoError(t, err)
	require.Equal(t, true, res["success"], "res: %v", res)
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_guru_pengganti WHERE id = $1`, pg1).Scan(&status))
	require.Equal(t, "Diterima", status)

	// 2. Menjawab ulang ditolak.
	res, err = svc.JawabPengganti(ctx, map[string]interface{}{
		"username": ganti, "penggantiId": float64(pg1), "jawab": "Ditolak",
	})
	require.NoError(t, err)
	require.Equal(t, false, res["success"])

	// 3. Jawaban tak dikenal ditolak dan tidak mengubah status.
	pg2 := seed()
	res, err = svc.JawabPengganti(ctx, map[string]interface{}{
		"username": ganti, "penggantiId": float64(pg2), "jawab": "ngawur",
	})
	require.NoError(t, err)
	require.Equal(t, false, res["success"])
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_guru_pengganti WHERE id = $1`, pg2).Scan(&status))
	require.Equal(t, "Pending", status)

	// 4. Bukan untuk pemanggil.
	pg3 := seed()
	res, err = svc.JawabPengganti(ctx, map[string]interface{}{
		"username": asal, "penggantiId": float64(pg3), "jawab": "Diterima",
	})
	require.NoError(t, err)
	require.Equal(t, false, res["success"])
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM madrasah_guru_pengganti WHERE id = $1`, pg3).Scan(&status))
	require.Equal(t, "Pending", status)
}
