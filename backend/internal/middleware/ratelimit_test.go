package middleware

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func postRPC(app *fiber.App, body string) *http.Response {
	return postRPCFromIP(app, body, "")
}

func postRPCFromIP(app *fiber.App, body, ip string) *http.Response {
	req, _ := http.NewRequest(http.MethodPost, "/rpc", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if ip != "" {
		req.Header.Set(fiber.HeaderXForwardedFor, ip)
	}
	resp, _ := app.Test(req)
	return resp
}

func TestLoginRateLimit(t *testing.T) {
	app := fiber.New()
	app.Use(LoginRateLimit(3, time.Minute))
	app.Post("/rpc", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	// Non-login tidak dibatasi.
	assert.Equal(t, http.StatusOK, postRPC(app, `{"fn":"getInfoSekolah","args":[]}`).StatusCode)

	// 3x login diizinkan, yang ke-4 ditolak 429.
	assert.Equal(t, http.StatusOK, postRPC(app, `{"fn":"login","args":["a","b"]}`).StatusCode)
	assert.Equal(t, http.StatusOK, postRPC(app, `{"fn":"login","args":["a","b"]}`).StatusCode)
	assert.Equal(t, http.StatusOK, postRPC(app, `{"fn":"login","args":["a","b"]}`).StatusCode)
	assert.Equal(t, http.StatusTooManyRequests, postRPC(app, `{"fn":"login","args":["a","b"]}`).StatusCode)

	// Hitungan login tidak tercampur dengan fungsi lain.
	assert.Equal(t, http.StatusOK, postRPC(app, `{"fn":"getInfoSekolah","args":[]}`).StatusCode)
}

func TestLoginRateLimitIsPerAccountBehindTrustedProxy(t *testing.T) {
	app := fiber.New(fiber.Config{
		EnableTrustedProxyCheck: true,
		TrustedProxies:          []string{"0.0.0.0"},
		ProxyHeader:             fiber.HeaderXForwardedFor,
	})
	app.Use(LoginRateLimit(2, time.Minute))
	app.Post("/rpc", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	assert.Equal(t, http.StatusOK, postRPCFromIP(app, `{"fn":"login","args":["guru-a","x"]}`, "203.0.113.10").StatusCode)
	assert.Equal(t, http.StatusOK, postRPCFromIP(app, `{"fn":"login","args":["guru-a","x"]}`, "203.0.113.10").StatusCode)
	assert.Equal(t, http.StatusTooManyRequests, postRPCFromIP(app, `{"fn":"login","args":["guru-a","x"]}`, "203.0.113.10").StatusCode)

	// Other users sharing the same public IP keep their own account allowance.
	assert.Equal(t, http.StatusOK, postRPCFromIP(app, `{"fn":"login","args":["guru-b","x"]}`, "203.0.113.10").StatusCode)

	// The account limit also applies across source IPs.
	assert.Equal(t, http.StatusTooManyRequests, postRPCFromIP(app, `{"fn":"login","args":["guru-a","x"]}`, "203.0.113.11").StatusCode)
}

func TestLoginRateLimitKeepsNetworkWideAbuseBound(t *testing.T) {
	app := fiber.New(fiber.Config{
		EnableTrustedProxyCheck: true,
		TrustedProxies:          []string{"0.0.0.0"},
		ProxyHeader:             fiber.HeaderXForwardedFor,
	})
	app.Use(LoginRateLimit(1, time.Minute))
	app.Post("/rpc", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	for i := 0; i < 10; i++ {
		body := `{"fn":"login","args":["guru-` + string(rune('a'+i)) + `","x"]}`
		assert.Equal(t, http.StatusOK, postRPCFromIP(app, body, "203.0.113.20").StatusCode)
	}
	assert.Equal(t, http.StatusTooManyRequests, postRPCFromIP(app, `{"fn":"login","args":["guru-k","x"]}`, "203.0.113.20").StatusCode)
}

func TestLoginRateLimitSeparatesTrustedClientIPs(t *testing.T) {
	app := fiber.New(fiber.Config{
		EnableTrustedProxyCheck: true,
		TrustedProxies:          []string{"0.0.0.0"},
		ProxyHeader:             fiber.HeaderXForwardedFor,
	})
	app.Use(LoginRateLimit(10, time.Minute))
	app.Post("/rpc", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	for i := 0; i < 100; i++ {
		body := `{"fn":"login","args":["guru-` + string(rune(i/26+'a')) + string(rune(i%26+'a')) + `","x"]}`
		assert.Equal(t, http.StatusOK, postRPCFromIP(app, body, "203.0.113.30").StatusCode)
	}

	// The proxy must be able to distinguish another visitor, not treat every
	// forwarded request as coming from the same Docker bridge address.
	assert.Equal(t, http.StatusOK, postRPCFromIP(app, `{"fn":"login","args":["guru-other","x"]}`, "203.0.113.31").StatusCode)
}
