package madrasah

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/paspapan/backend/internal/middleware"
)

type rpcArgs []interface{}

func (a rpcArgs) Str(idx int) string {
	if idx < len(a) && a[idx] != nil {
		return fmt.Sprintf("%v", a[idx])
	}
	return ""
}

func (a rpcArgs) Int(idx int) int {
	if idx < len(a) && a[idx] != nil {
		if val, ok := a[idx].(float64); ok {
			return int(val)
		}
		var n int
		fmt.Sscanf(fmt.Sprintf("%v", a[idx]), "%d", &n)
		return n
	}
	return 0
}

func (a rpcArgs) Map(idx int) map[string]interface{} {
	if idx < len(a) && a[idx] != nil {
		if m, ok := a[idx].(map[string]interface{}); ok {
			return m
		}
	}
	return make(map[string]interface{})
}

func (a rpcArgs) List(idx int) []interface{} {
	if idx < len(a) && a[idx] != nil {
		if l, ok := a[idx].([]interface{}); ok {
			return l
		}
	}
	return []interface{}{}
}

func (a rpcArgs) Raw(idx int) interface{} {
	if idx < len(a) {
		return a[idx]
	}
	return nil
}
func (h *Handler) HandleRPC(c *fiber.Ctx) error {
	var req RPCRequest
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Invalid JSON body: %v (body: %s)", err, string(c.Body())),
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(h.requestTimeoutSeconds)*time.Second)
	defer cancel()
	args := rpcArgs(req.Args)
	fnName := req.Fn
	rpcStart := time.Now()

	claims, hasSession := c.Locals("claims").(*middleware.Claims)
	if !publicFns[fnName] && !hasSession {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Sesi tidak ditemukan. Silakan login terlebih dahulu.",
		})
	}

	if hasSession {
		if !publicFns[fnName] {
			if len(args) > 0 {
				if _, isMap := args[0].(map[string]interface{}); isMap {
					if selfServiceMapFns[fnName] {
						args[0].(map[string]interface{})["username"] = claims.Username
					} else if adminMapFns[fnName] {
						args[0].(map[string]interface{})["requestedBy"] = claims.Username
					}
				} else {
					args[0] = claims.Username
				}
			}
		}
	}

	var result interface{}
	var err error

	switch req.Fn {
	case "login":
		result, err = h.svc.Login(ctx, args.Str(0), args.Str(1))
		if err == nil {
			if resMap, ok := result.(map[string]interface{}); ok && resMap["success"] == true {
				if user, ok := resMap["user"].(map[string]interface{}); ok {
					uname := fmt.Sprintf("%v", user["username"])
					role := fmt.Sprintf("%v", user["role"])
					uid := fmt.Sprintf("%v", user["id"])
					token, exp, tErr := middleware.GenerateToken(h.jwtSecret, h.jwtExpiry, uid, uname, role)
					if tErr != nil {
						return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
							"success": false,
							"message": "Gagal membuat sesi login",
						})
					}
					resMap["token"] = token
					resMap["expiresAt"] = exp.Format(time.RFC3339)
					result = resMap
				}
			}
		}
	case "gantiPasswordSendiri":
		result, err = h.svc.GantiPasswordSendiri(ctx, args.Str(0), args.Str(1), args.Str(2))
	case "getInfoSekolah":
		result, err = h.svc.GetInfoSekolah(ctx)
	case "getPengaturanLengkap":
		result, err = h.svc.GetPengaturanLengkap(ctx, args.Str(0))
	case "updatePengaturan":
		result, err = h.svc.UpdatePengaturan(ctx, args.Str(0), args.Map(1))
	case "getStatusAbsensiHariIni":
		result, err = h.svc.GetStatusAbsensiHariIni(ctx, args.Str(0))
	case "catatAbsensi":
		result, err = h.svc.CatatAbsensi(ctx, args.Map(0))
	case "ajukanIzinSakitCuti":
		result, err = h.svc.AjukanIzinSakitCuti(ctx, args.Map(0))
	case "getDaftarGuruUntukPengganti":
		result, err = h.svc.GetDaftarGuruUntukPengganti(ctx, args.Str(0))
	case "getDaftarKonfirmasiPengganti":
		result, err = h.svc.GetDaftarKonfirmasiPengganti(ctx, args.Str(0))
	case "konfirmasiPengganti":
		result, err = h.svc.KonfirmasiPengganti(ctx, args.Map(0))
	case "ajukanPenggantiRentang":
		result, err = h.svc.AjukanPenggantiRentang(ctx, args.Map(0))
	case "getPenggantiRentangSaya":
		result, err = h.svc.GetPenggantiRentangSaya(ctx, args.Str(0))
	case "batalkanPenggantiRentang":
		result, err = h.svc.BatalkanPenggantiRentang(ctx, args.Map(0))
	case "konfirmasiPenggantiRentang":
		result, err = h.svc.KonfirmasiPenggantiRentang(ctx, args.Map(0))
	case "getRiwayatAbsensiSaya":
		result, err = h.svc.GetRiwayatAbsensiSaya(ctx, args.Str(0))
	case "getJadwalSaya":
		result, err = h.svc.GetJadwalSaya(ctx, args.Str(0))
	case "getRiwayatHonorSaya":
		result, err = h.svc.GetRiwayatHonorSaya(ctx, args.Str(0))
	case "getSlipHonorSaya":
		result, err = h.svc.GetSlipHonorSaya(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "tandaiHonorDilihat":
		result, err = h.svc.TandaiHonorDilihat(ctx, args.Str(0), args.Raw(1))
	case "getStatistikHariIni":
		result, err = h.svc.GetStatistikHariIni(ctx, args.Str(0))
	case "getRiwayatAbsensiSemua":
		result, err = h.svc.GetRiwayatAbsensiSemua(ctx, args.Str(0), args.Str(1), args.Str(2), args.Str(3))
	case "getRekapPerGuru":
		result, err = h.svc.GetRekapPerGuru(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "getRekapPerGuruRentang":
		result, err = h.svc.GetRekapPerGuruRentang(ctx, args.Str(0), args.Str(1), args.Str(2))
	case "getRincianRekapGuru":
		result, err = h.svc.GetRincianRekapGuru(ctx, args.Str(0), args.Str(1), args.Int(2), args.Int(3))
	case "getRincianRekapGuruRentang":
		result, err = h.svc.GetRincianRekapGuruRentang(ctx, args.Str(0), args.Str(1), args.Str(2), args.Str(3))
	case "catatKehadiranManual":
		result, err = h.svc.CatatKehadiranManual(ctx, args.Str(0), args.Map(1))
	case "getSemuaUser":
		result, err = h.svc.GetSemuaUser(ctx, args.Str(0))
	case "tambahUser":
		result, err = h.svc.TambahUser(ctx, args.Map(0))
	case "updateUser":
		result, err = h.svc.UpdateUser(ctx, args.Map(0))
	case "hapusUser":
		result, err = h.svc.HapusUser(ctx, args.Str(0), args.Raw(1))
	case "imporGuruMassal":
		result, err = h.svc.ImporGuruMassal(ctx, args.Str(0), args.List(1))
	case "getDaftarLibur":
		result, err = h.svc.GetDaftarLibur(ctx, args.Str(0))
	case "tambahLiburRentang":
		result, err = h.svc.TambahLiburRentang(ctx, args.Str(0), args.Str(1), args.Str(2), args.Str(3))
	case "hapusLibur":
		result, err = h.svc.HapusLibur(ctx, args.Str(0), args.Str(1))
	case "getDaftarJadwal":
		result, err = h.svc.GetDaftarJadwal(ctx, args.Str(0))
	case "tambahJadwal":
		result, err = h.svc.TambahJadwal(ctx, args.Str(0), args.Map(1))
	case "updateJadwal":
		result, err = h.svc.UpdateJadwal(ctx, args.Str(0), args.Map(1))
	case "hapusJadwal":
		result, err = h.svc.HapusJadwal(ctx, args.Str(0), args.Raw(1))
	case "getDaftarGuru":
		result, err = h.svc.GetDaftarGuru(ctx, args.Str(0))
	case "getRekapHonor":
		return c.Status(fiber.StatusGone).JSON(fiber.Map{
			"success": false,
			"message": "getRekapHonor sudah tidak digunakan. Gunakan getRekapHonorBaru.",
		})
	case "getSlipHonor":
		return c.Status(fiber.StatusGone).JSON(fiber.Map{
			"success": false,
			"message": "getSlipHonor sudah tidak digunakan. Gunakan getSlipHonorBaru.",
		})
	case "getSemuaSlipHonor":
		result, err = h.svc.GetSemuaSlipHonor(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "kirimSlipHonorSatuGuru":
		result, err = h.svc.KirimSlipHonorSatuGuru(ctx, args.Str(0), args.Str(1), args.Int(2), args.Int(3))
	case "kirimSlipHonorSemua":
		result, err = h.svc.KirimSlipHonorSemua(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "getHonorTambahanSatuGuru":
		result, err = h.svc.GetHonorTambahanSatuGuru(ctx, args.Str(0), args.Str(1), args.Int(2), args.Int(3))
	case "simpanHonorTambahan":
		result, err = h.svc.SimpanHonorTambahan(ctx, args.Str(0), args.Map(1))
	case "getDaftarTahunAjaran":
		result, err = h.svc.GetDaftarTahunAjaran(ctx, args.Str(0))
	case "simpanTahunAjaran":
		result, err = h.svc.SimpanTahunAjaran(ctx, args.Str(0), args.Map(1))
	case "hapusTahunAjaran":
		result, err = h.svc.HapusTahunAjaran(ctx, args.Str(0), args.Raw(1))
	case "getDaftarKelas":
		result, err = h.svc.GetDaftarKelas(ctx, args.Str(0))
	case "simpanKelas":
		result, err = h.svc.SimpanKelas(ctx, args.Str(0), args.Map(1))
	case "hapusKelas":
		result, err = h.svc.HapusKelas(ctx, args.Str(0), args.Raw(1))
	case "getDaftarSiswa":
		result, err = h.svc.GetDaftarSiswa(ctx, args.Str(0), args.Int(1), args.Str(2), args.Int(3), args.Int(4))
	case "simpanSiswa":
		result, err = h.svc.SimpanSiswa(ctx, args.Str(0), args.Map(1))
	case "hapusSiswa":
		result, err = h.svc.HapusSiswa(ctx, args.Str(0), args.Raw(1))
	case "imporSiswaMassal":
		result, err = h.svc.ImporSiswaMassal(ctx, args.Str(0), args.List(1))
	case "aturSiswaKelas":
		result, err = h.svc.AturSiswaKelas(ctx, args.Str(0), args.Map(1))
	case "getRosterPresensi":
		result, err = h.svc.GetRosterPresensi(ctx, args.Str(0), args.Str(1), args.Str(2), args.Str(3))
	case "catatAbsensiSiswa":
		result, err = h.svc.CatatAbsensiSiswa(ctx, args.Map(0))
	case "getRekapPresensiSiswa":
		result, err = h.svc.GetRekapPresensiSiswa(ctx, args.Str(0), args.Map(1))
	case "getStatistikKehadiranSiswa":
		result, err = h.svc.GetStatistikKehadiranSiswa(ctx, args.Str(0), args.Map(1))
	case "getRiwayatPresensiTanggal":
		result, err = h.svc.GetRiwayatPresensiTanggal(ctx, args.Str(0), args.Str(1))

	case "getStatusAbsensiHarian":
		result, err = h.svc.GetStatusAbsensiHarian(ctx, args.Str(0))
	case "catatAbsensiHarian":
		result, err = h.svc.CatatAbsensiHarian(ctx, args.Map(0))
	case "getRiwayatAbsensiHarian":
		result, err = h.svc.GetRiwayatAbsensiHarian(ctx, args.Str(0), args.Str(1), args.Int(2), args.Int(3))
	case "catatAbsensiHarianManual":
		result, err = h.svc.CatatAbsensiHarianManual(ctx, args.Str(0), args.Map(1))
	case "ajukanIzin":
		result, err = h.svc.AjukanIzin(ctx, args.Map(0))
	case "getIzinSaya":
		result, err = h.svc.GetIzinSaya(ctx, args.Str(0))
	case "getIzinUntukApproval":
		result, err = h.svc.GetIzinUntukApproval(ctx, args.Str(0))
	case "prosesIzin":
		result, err = h.svc.ProsesIzin(ctx, args.Str(0), args.Map(1))
	case "batalkanIzin":
		result, err = h.svc.BatalkanIzin(ctx, args.Map(0))
	case "getPermintaanPengganti":
		result, err = h.svc.GetPermintaanPengganti(ctx, args.Str(0))
	case "jawabPengganti":
		result, err = h.svc.JawabPengganti(ctx, args.Map(0))
	case "getMonitoringIzin":
		result, err = h.svc.GetMonitoringIzin(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "getSesiMengajar":
		result, err = h.svc.GetSesiMengajar(ctx, args.Str(0), args.Str(1))
	case "getDaftarMapel":
		result, err = h.svc.GetDaftarMapel(ctx, args.Str(0))
	case "simpanMapel":
		result, err = h.svc.SimpanMapel(ctx, args.Str(0), args.Map(1))
	case "hapusMapel":
		result, err = h.svc.HapusMapel(ctx, args.Str(0), args.Map(1))

	case "getRekapHonorBaru":
		result, err = h.svc.GetRekapHonorBaru(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "hitungUlangHonorDraft":
		result, err = h.svc.HitungUlangHonorDraft(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "finalisasiHonor":
		result, err = h.svc.FinalisasiHonor(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "bukaFinalisasiHonor":
		result, err = h.svc.BukaFinalisasiHonor(ctx, args.Str(0), args.Int(1), args.Int(2))
	case "getSlipHonorBaru":
		result, err = h.svc.GetSlipHonorBaru(ctx, args.Str(0), args.Str(1), args.Int(2), args.Int(3))
	case "getRiwayatHonorPegawai":
		result, err = h.svc.GetRiwayatHonorPegawai(ctx, args.Str(0), args.Str(1))
	default:
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Unknown RPC method: %s", req.Fn),
		})
	}

	rpcAttrs := []any{
		"fn", fnName,
		"duration", time.Since(rpcStart).String(),
		"err", err == nil,
	}
	if rid := c.Locals("request_id"); rid != nil {
		rpcAttrs = append(rpcAttrs, "id", rid)
	}
	if err != nil {
		slog.Error("rpc", rpcAttrs...)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if slog.Default().Enabled(context.Background(), slog.LevelDebug) {
		slog.Debug("rpc", rpcAttrs...)
	}

	return c.JSON(fiber.Map{
		"result": result,
	})
}
