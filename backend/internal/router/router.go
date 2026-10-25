package router

import (
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/paspapan/backend/internal/cache"
	"github.com/paspapan/backend/internal/config"
	"github.com/paspapan/backend/internal/middleware"
	"github.com/paspapan/backend/internal/modules/madrasah"
)

func Register(app *fiber.App, db *pgxpool.Pool, store cache.Store, cfg *config.Config) {
	madrasahHandler := madrasah.NewHandler(db, cfg.JWTSecret, cfg.JWTExpiry)
	madrasahHandler.SetCache(store)
	madrasahHandler.SetHonorCacheTTL(cfg.HonorCacheSec)
	madrasahHandler.SetRequestTimeoutSeconds(cfg.RequestTimeoutSec)
	loginGuard := middleware.LoginRateLimit(10, time.Minute)
	rpc := app.Group("/api/rpc", loginGuard, middleware.OptionalAuth(cfg.JWTSecret))
	rpc.Post("/", madrasahHandler.HandleRPC)
	app.Post("/rpc", loginGuard, middleware.OptionalAuth(cfg.JWTSecret), madrasahHandler.HandleRPC)
	app.Get("/uploads/foto/:file", madrasahHandler.ServeFoto)

	app.Post("/api/log", func(c *fiber.Ctx) error {
		var body struct {
			Fn        string `json:"fn"`
			Message   string `json:"message"`
			Stack     string `json:"stack"`
			URL       string `json:"url"`
			UserAgent string `json:"userAgent"`
		}
		_ = json.Unmarshal(c.Body(), &body)
		msg := strings.TrimSpace(body.Message)
		if msg == "" {
			return c.SendStatus(fiber.StatusOK)
		}
		attrs := []any{
			"fn", body.Fn,
			"message", msg,
			"url", body.URL,
			"ua", body.UserAgent,
		}
		if strings.TrimSpace(body.Stack) != "" {
			attrs = append(attrs, "stack", strings.TrimSpace(body.Stack))
		}
		slog.Warn("client error", attrs...)
		return c.SendStatus(fiber.StatusOK)
	})
}
