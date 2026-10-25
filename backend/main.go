package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"

	"github.com/paspapan/backend/internal/cache"
	"github.com/paspapan/backend/internal/config"
	"github.com/paspapan/backend/internal/database"
	"github.com/paspapan/backend/internal/logger"
	"github.com/paspapan/backend/internal/router"
)

func main() {

	if err := godotenv.Load(); err != nil {
		slog.Info("No .env file found, using environment variables")
	}

	cfg := config.Load()

	logger.Init(cfg.AppEnv, cfg.LogLevel)

	db, err := database.ConnectWith(cfg.DatabaseURL, database.Options{
		MaxConns:    cfg.DBMaxConns,
		MinConns:    cfg.DBMinConns,
		LogLevel:    cfg.LogLevel,
		SlowQueryMs: cfg.SlowQueryMs,
	})
	if err != nil {
		slog.Error("Failed to connect to database", "err", err.Error())
		os.Exit(1)
	}
	defer db.Close()

	rdb := database.ConnectRedis(cfg.RedisURL)
	defer rdb.Close()

	addr := ":" + cfg.Port
	if ln, err := net.Listen("tcp", addr); err != nil {
		slog.Error("Port tidak bisa dipakai. Pastikan tidak ada proses lain yang menempel: "+
			"(mis. server lama go run / app.exe) pada port tersebut.",
			"addr", addr, "err", err.Error())
		os.Exit(1)
	} else {
		ln.Close()
	}

	app := fiber.New(fiber.Config{
		AppName:                 "Madrasah Al Karimiyah API",
		ReadTimeout:             time.Duration(cfg.ReadTimeoutSec) * time.Second,
		WriteTimeout:            time.Duration(cfg.WriteTimeoutSec) * time.Second,
		IdleTimeout:             time.Duration(cfg.IdleTimeoutSec) * time.Second,
		BodyLimit:               20 * 1024 * 1024,
		EnableTrustedProxyCheck: true,
		// Nginx overwrites X-Forwarded-For before proxying requests.
		TrustedProxies:    []string{"172.16.0.0/12"},
		ProxyHeader:       fiber.HeaderXForwardedFor,
		EnablePrintRoutes: cfg.AppEnv == "local",
		ErrorHandler:      errorHandler,
	})

	app.Use(recover.New())
	app.Use(helmet.New())
	app.Use(compress.New())
	app.Use(logger.FiberMiddleware())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Request-ID",
		AllowCredentials: true,
		MaxAge:           86400,
	}))
	app.Use(limiter.New(limiter.Config{
		// Keyed by the visitor IP supplied by the trusted Nginx proxy.
		Max:        1200,
		Expiration: time.Minute,
		LimitReached: func(c *fiber.Ctx) error {
			c.Set(fiber.HeaderRetryAfter, "60")
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"message": "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
				"retryIn": 60,
			})
		},
	}))

	router.Register(app, db, cache.NewRedisStore(rdb), cfg)

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"app":     "Madrasah Al Karimiyah API",
			"version": "1.0.0",
			"time":    time.Now().Format(time.RFC3339),
		})
	})
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/readyz", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			slog.Warn("readyz: database tidak siap", "err", err.Error())
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "degraded"})
		}
		return c.JSON(fiber.Map{"status": "ok", "db": "ok"})
	})

	if cfg.PprofEnabled {
		go func() {
			pprofAddr := os.Getenv("PPROF_ADDR")
			if pprofAddr == "" {
				pprofAddr = "127.0.0.1:6060"
			}
			mux := http.NewServeMux()
			mux.HandleFunc("/debug/pprof/", pprof.Index)
			mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
			mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
			mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
			mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
			slog.Info("pprof aktif", "addr", pprofAddr)
			if err := http.ListenAndServe(pprofAddr, mux); err != nil {
				slog.Warn("pprof server berhenti", "err", err.Error())
			}
		}()
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("Madrasah Al Karimiyah API running", "addr", addr)
		if err := app.Listen(addr); err != nil {
			serverErr <- err
		}
	}()

	select {
	case <-ctx.Done():
		slog.Info("Sinyal shutdown diterima, menghentikan server...")
		if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
			slog.Error("Gagal shutdown server", "err", err.Error())
		}
		slog.Info("Server berhenti dengan bersih")
	case err := <-serverErr:
		slog.Error("Server error", "err", err.Error())
		os.Exit(1)
	}
}

func errorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		msg = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"success": false,
		"message": msg,
	})
}
