package madrasah

import (
	"context"
	"strconv"
	"strings"
	"time"
)

func (s *Service) cacheGet(ctx context.Context, key string) (string, bool) {
	if s.cache == nil {
		return "", false
	}
	return s.cache.Get(ctx, key)
}

func (s *Service) cacheSet(ctx context.Context, key, val string) {
	if s.cache == nil {
		return
	}
	s.cache.Set(ctx, key, val, cacheRekapTTL)
}

func (s *Service) cacheFlushRekap(ctx context.Context) {
	if s.cache == nil {
		return
	}
	s.cache.DeletePrefix(ctx, cacheRekapPrefix)
}

func interfaceToInt(v interface{}) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	}
	return 0
}

func (s *Service) roleUser(ctx context.Context, username string) string {
	role, _, _ := s.pengguna.CariAkses(ctx, username)
	return role
}

func rawList(v interface{}) []interface{} {
	if l, ok := v.([]interface{}); ok {
		return l
	}
	return []interface{}{}
}

func sortByKelasId(list []map[string]interface{}) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0; j-- {
			a := interfaceToInt(list[j-1]["kelasId"])
			b := interfaceToInt(list[j]["kelasId"])
			if a > b {
				list[j-1], list[j] = list[j], list[j-1]
			}
		}
	}
}

func dateOrNil(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t
}
