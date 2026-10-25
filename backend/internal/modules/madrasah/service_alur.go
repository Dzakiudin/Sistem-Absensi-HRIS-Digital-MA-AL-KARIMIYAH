package madrasah

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func (s *Service) pengaturanAmbil(ctx context.Context, key, fallback string) string {
	v, err := s.pengaturan.AmbilNilai(ctx, key)
	if err != nil || strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func parseJamHHMM(s string) (int, bool) {
	s = strings.TrimSpace(s)
	parts := strings.Split(s, ":")
	if len(parts) < 2 {
		return 0, false
	}
	jam, err1 := strconv.Atoi(parts[0])
	menit, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || jam < 0 || jam > 23 || menit < 0 || menit > 59 {
		return 0, false
	}
	return jam*60 + menit, true
}

func (s *Service) jamAbsensi(ctx context.Context) (mulai, batas, pulang int, ok bool) {
	batasStr := s.pengaturanAmbil(ctx, "JamMasukBatasBaru", "")
	if batasStr == "" {
		batasStr = s.pengaturanAmbil(ctx, "JamMasukBatas", "07:15")
	}
	mulaiStr := s.pengaturanAmbil(ctx, "JamMasukMulai", "06:30")
	pulangStr := s.pengaturanAmbil(ctx, "JamPulangMinimalBaru", "")
	if pulangStr == "" {
		pulangStr = s.pengaturanAmbil(ctx, "JamPulangMinimal", "13:30")
	}

	mulai, ok1 := parseJamHHMM(mulaiStr)
	batas, ok2 := parseJamHHMM(batasStr)
	pulang, ok3 := parseJamHHMM(pulangStr)
	return mulai, batas, pulang, ok1 && ok2 && ok3
}

func namaHariDariTanggal(t time.Time) string {
	return NamaHariIndo(t.Weekday())
}

func daftarTanggal(awal, akhir time.Time) []time.Time {
	out := []time.Time{}
	for cur := awal; !cur.After(akhir); cur = cur.AddDate(0, 0, 1) {
		out = append(out, cur)
	}
	return out
}

func jamOpsiionalPayload(payload map[string]interface{}, key string) interface{} {
	v := strings.TrimSpace(fmt.Sprintf("%v", payload[key]))
	if v == "" || v == "<nil>" {
		return nil
	}
	if menit, ok := parseJamHHMM(v); ok {
		return fmt.Sprintf("%02d:%02d:00", menit/60, menit%60)
	}
	return nil
}

