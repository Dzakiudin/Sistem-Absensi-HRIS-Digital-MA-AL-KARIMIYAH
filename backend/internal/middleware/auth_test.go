package middleware

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateToken(t *testing.T) {
	token, exp, err := GenerateToken("rahasia", "1h", "7", "admin", "admin")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.WithinDuration(t, time.Now().Add(time.Hour), exp, 2*time.Minute)
}

func setupApp(secret string) *fiber.App {
	app := fiber.New()
	app.Use(OptionalAuth(secret))
	app.Get("/", func(c *fiber.Ctx) error {
		u := ""
		if c.Locals("username") != nil {
			u = c.Locals("username").(string)
		}
		return c.JSON(fiber.Map{"ok": true, "username": u})
	})
	return app
}

func doGet(app *fiber.App, bearer string) *http.Response {
	req, _ := http.NewRequest(http.MethodGet, "/", nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, _ := app.Test(req)
	return resp
}

func decodeBody(t *testing.T, resp *http.Response) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&m))
	return m
}

func TestOptionalAuth_TanpaToken(t *testing.T) {
	resp := doGet(setupApp("rahasia"), "")
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "", decodeBody(t, resp)["username"])
}

func TestOptionalAuth_TokenValid(t *testing.T) {
	token, _, err := GenerateToken("rahasia", "1h", "7", "admin", "admin")
	require.NoError(t, err)
	resp := doGet(setupApp("rahasia"), token)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "admin", decodeBody(t, resp)["username"])
}

func TestOptionalAuth_TokenInvalid(t *testing.T) {
	resp := doGet(setupApp("rahasia"), "abc.def.ghi")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestOptionalAuth_TokenExpired(t *testing.T) {
	claims := &Claims{
		UserID:   "7",
		Username: "admin",
		Role:     "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("rahasia"))
	require.NoError(t, err)
	resp := doGet(setupApp("rahasia"), token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestGenerateToken_DurasiTidakValidAtauNegatif(t *testing.T) {
	for _, d := range []string{"-1h", "bukan-durasi", "0h"} {
		_, exp, err := GenerateToken("rahasia", d, "7", "admin", "admin")
		require.NoError(t, err)
		assert.WithinDuration(t, time.Now().Add(24*time.Hour), exp, 2*time.Minute, d)
	}
}

func TestOptionalAuth_TokenDenganSecretSalah(t *testing.T) {
	token, _, err := GenerateToken("secret-lain", "1h", "7", "admin", "admin")
	require.NoError(t, err)
	resp := doGet(setupApp("rahasia"), token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestOptionalAuth_TokenNonHMAC(t *testing.T) {
	// Token yang ditandatangani bukan HS256 harus ditolak.
	token := "eyJhbGciOiJub25lIn0.eyJ1c2VybmFtZSI6ImFkbWluIn0."
	resp := doGet(setupApp("rahasia"), token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
