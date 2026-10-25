package middleware

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

type loginLimiter struct {
	mu       sync.Mutex
	max      int
	window   time.Duration
	accounts map[string]*loginSlot
	ips      map[string]*loginSlot
	cleaned  time.Time
}

type loginSlot struct {
	count int
	reset time.Time
}

func LoginRateLimit(max int, window time.Duration) fiber.Handler {
	if max < 1 {
		max = 10
	}
	if window <= 0 {
		window = time.Minute
	}
	ll := &loginLimiter{
		max:      max,
		window:   window,
		accounts: map[string]*loginSlot{},
		ips:      map[string]*loginSlot{},
	}
	return func(c *fiber.Ctx) error {
		body := c.Body()
		var payload struct {
			Fn   string            `json:"fn"`
			Args []json.RawMessage `json:"args"`
		}
		if len(body) == 0 || json.Unmarshal(body, &payload) != nil || payload.Fn != "login" {
			return c.Next()
		}

		var username string
		if len(payload.Args) > 0 {
			_ = json.Unmarshal(payload.Args[0], &username)
		}
		accountKey := strings.ToLower(strings.TrimSpace(username))
		if accountKey == "" {
			accountKey = "<kosong>"
		}
		ip := c.IP()
		now := time.Now()
		ll.mu.Lock()
		if now.Sub(ll.cleaned) >= window {
			for key, slot := range ll.accounts {
				if !now.Before(slot.reset) {
					delete(ll.accounts, key)
				}
			}
			for key, slot := range ll.ips {
				if !now.Before(slot.reset) {
					delete(ll.ips, key)
				}
			}
			ll.cleaned = now
		}
		accountSlot := loginSlotFor(ll.accounts, accountKey, now, window)
		ipSlot := loginSlotFor(ll.ips, ip, now, window)
		accountSlot.count++
		ipSlot.count++
		if accountSlot.count > ll.max || ipSlot.count > ll.max*10 {
			limitSlot := accountSlot
			message := "Terlalu banyak percobaan login untuk akun ini. Tunggu sebentar lalu coba lagi."
			if ipSlot.count > ll.max*10 {
				limitSlot = ipSlot
				message = "Terlalu banyak percobaan login dari jaringan ini. Tunggu sebentar lalu coba lagi."
			}
			sisa := int(time.Until(limitSlot.reset).Seconds()) + 1
			ll.mu.Unlock()
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"message": message,
				"retryIn": sisa,
			})
		}
		ll.mu.Unlock()
		return c.Next()
	}
}

func loginSlotFor(entries map[string]*loginSlot, key string, now time.Time, window time.Duration) *loginSlot {
	slot := entries[key]
	if slot == nil || !now.Before(slot.reset) {
		slot = &loginSlot{reset: now.Add(window)}
		entries[key] = slot
	}
	return slot
}
