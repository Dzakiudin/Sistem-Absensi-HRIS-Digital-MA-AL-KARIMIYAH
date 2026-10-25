package madrasah

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/paspapan/backend/internal/cache"
	"github.com/paspapan/backend/internal/middleware"
)

type Handler struct {
	svc                   *Service
	jwtSecret             string
	jwtExpiry             string
	requestTimeoutSeconds int
}

func NewHandler(db *pgxpool.Pool, jwtSecret, jwtExpiry string) *Handler {
	return &Handler{
		svc:                   NewService(db),
		jwtSecret:             jwtSecret,
		jwtExpiry:             jwtExpiry,
		requestTimeoutSeconds: 15,
	}
}

func (h *Handler) SetRequestTimeoutSeconds(seconds int) {
	if seconds > 0 {
		h.requestTimeoutSeconds = seconds
	}
}

func (h *Handler) SetCache(c cache.Store) {
	h.svc.SetCache(c)
}

func (h *Handler) SetHonorCacheTTL(seconds int) {
	h.svc.SetHonorCacheTTL(seconds)
}

type RPCRequest struct {
	Fn   string        `json:"fn"`
	Args []interface{} `json:"args"`
}

var publicFns = map[string]bool{
	"login":          true,
	"getInfoSekolah": true,
}

var selfServiceMapFns = map[string]bool{
	"catatAbsensi":               true,
	"catatAbsensiSiswa":          true,
	"ajukanIzinSakitCuti":        true,
	"konfirmasiPengganti":        true,
	"ajukanPenggantiRentang":     true,
	"konfirmasiPenggantiRentang": true,
	"batalkanPenggantiRentang":   true,

	"catatAbsensiHarian": true,
	"ajukanIzin":         true,
	"batalkanIzin":       true,
	"jawabPengganti":     true,
}

var adminMapFns = map[string]bool{
	"tambahUser": true,
	"updateUser": true,
}

func (h *Handler) ServeFoto(c *fiber.Ctx) error {
	tokenStr := c.Query("t")
	if tokenStr == "" {
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	if tokenStr == "" {
		tokenStr = c.Cookies("pp_token")
	}
	if tokenStr != "" {
		claims := &middleware.Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(h.jwtSecret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Sesi tidak valid atau sudah kedaluwarsa.",
			})
		}
	} else {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Akses file memerlukan sesi login.",
		})
	}

	filename := c.Params("file")
	if filename == "" || strings.ContainsAny(filename, `/\`) || strings.HasPrefix(filename, ".") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Nama file tidak valid.",
		})
	}
	path := filepath.Join(".", "storage", "uploads", "foto", filename)
	if _, err := os.Stat(path); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "File tidak ditemukan.",
		})
	}
	return c.SendFile(path)
}
