

package logger

import (
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func Init(appEnv, level string) {
	opts := &slog.HandlerOptions{
		Level: parseLevel(level),
	}
	var handler slog.Handler
	if appEnv == "local" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(handler))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func FiberMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		reqID := c.Get("X-Request-ID")
		if reqID == "" {
			reqID = c.Get(fiber.HeaderXRequestID)
		}
		if reqID == "" {
			reqID = uuid.NewString()
		}
		c.Set(fiber.HeaderXRequestID, reqID)
		c.Locals("request_id", reqID)

		err := c.Next()

		status := c.Response().StatusCode()
		attrs := []any{
			"id", reqID,
			"method", c.Method(),
			"path", c.Path(),
			"status", status,
			"duration", time.Since(start).String(),
		}
		if u := c.Locals("username"); u != nil {
			attrs = append(attrs, "user", u)
		}
		if r := c.Locals("role"); r != nil {
			attrs = append(attrs, "role", r)
		}
		if err != nil {
			attrs = append(attrs, "err", err.Error())
			slog.Error("request", attrs...)
			return err
		}
		if status >= 500 {
			slog.Warn("request", attrs...)
		} else {
			slog.Info("request", attrs...)
		}
		return nil
	}
}
