package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv            string
	DatabaseURL       string
	RedisURL          string
	JWTSecret         string
	JWTExpiry         string
	AllowedOrigins    string
	Port              string
	LogLevel          string
	PprofEnabled      bool
	RequestTimeoutSec int
	ReadTimeoutSec    int
	WriteTimeoutSec   int
	IdleTimeoutSec    int
	DBMaxConns        int
	DBMinConns        int
	HonorCacheSec     int
	SlowQueryMs       int
}

func Load() *Config {
	cfg := &Config{
		AppEnv:            getEnv("APP_ENV", "local"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:password@localhost:5432/paspapan?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTExpiry:         getEnv("JWT_EXPIRY", "24h"),
		AllowedOrigins:    getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080"),
		Port:              getEnv("PORT", "8080"),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		PprofEnabled:      getEnv("APP_PPROF", "false") == "true",
		RequestTimeoutSec: getEnvInt("RPC_TIMEOUT_SEC", 15),
		ReadTimeoutSec:    getEnvInt("HTTP_READ_TIMEOUT_SEC", 30),
		WriteTimeoutSec:   getEnvInt("HTTP_WRITE_TIMEOUT_SEC", 30),
		IdleTimeoutSec:    getEnvInt("HTTP_IDLE_TIMEOUT_SEC", 60),
		DBMaxConns:        getEnvInt("DB_MAX_CONNS", 25),
		DBMinConns:        getEnvInt("DB_MIN_CONNS", 5),
		HonorCacheSec:     getEnvInt("HONOR_CACHE_SEC", 60),
		SlowQueryMs:       getEnvInt("SLOW_QUERY_MS", 500),
	}
	cfg.AllowedOrigins = sanitizeOrigins(cfg.AllowedOrigins)

	secret := os.Getenv("JWT_SECRET")
	if secret == "" || strings.TrimSpace(secret) == "change-me-in-production" {
		panic("JWT_SECRET wajib diatur di .env dengan nilai acak panjang minimal 32 karakter")
	}
	if len(strings.TrimSpace(secret)) < 32 {
		panic("JWT_SECRET terlalu pendek: minimal 32 karakter acak")
	}
	cfg.JWTSecret = strings.TrimSpace(secret)

	if cfg.AppEnv == "production" {
		if cfg.DatabaseURL == "" {
			panic("DATABASE_URL wajib diatur di production")
		}
		if cfg.PprofEnabled {
			panic("APP_PPROF tidak boleh diaktifkan di production (risiko keamanan)")
		}
	}
	if cfg.RequestTimeoutSec <= 0 {
		cfg.RequestTimeoutSec = 15
	}
	if cfg.HonorCacheSec < 0 {
		cfg.HonorCacheSec = 0
	}
	return cfg
}

func sanitizeOrigins(val string) string {
	parts := strings.Split(val, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, ",")
}

func getEnvInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return strings.TrimSpace(val)
	}
	return fallback
}
