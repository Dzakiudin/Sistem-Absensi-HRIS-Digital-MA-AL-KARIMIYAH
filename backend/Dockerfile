# syntax=docker/dockerfile:1

# ---------- build ----------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies lebih dulu supaya layer cache tidak busted tiap edit kode.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO dimatikan supaya binary statis bisa jalan di Alpine (musl) tanpa libc.
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -trimpath -ldflags="-s -w" -o /out/server . \
 && go build -trimpath -ldflags="-s -w" -o /out/seed  ./cmd/seed

# ---------- runtime ----------
FROM alpine:3.21

# ca-certificates: outbound TLS (mis. IMAGE remotePatterns).
# tzdata: aplikasi memakai Asia/Jakarta untuk tanggal absensi.
RUN apk add --no-cache ca-certificates tzdata wget \
 && adduser -D -u 10001 -h /app app

ENV TZ=Asia/Jakarta \
    PORT=8080 \
    APP_ENV=production

WORKDIR /app

COPY --from=build /out/server /app/server
COPY --from=build /out/seed   /app/seed
# Disalin agar `docker compose exec backend ./seed` tetap bisa jalan.
COPY db/ /app/db/
COPY cmd/seed/data/ /app/cmd/seed/data/

# Foto absensi ditulis ke ./storage/uploads/foto (lihat madrasah/service.go).
# Penting: /app/storage di-bind mount dari host, jadi ownership di dalam image
# TIDAK berlaku saat runtime. Yang menentukan adalah owner folder di host --
# lihat blok `user:` di docker-compose.yml.
RUN mkdir -p /app/storage/uploads/foto \
 && chown -R app:app /app

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/readyz || exit 1

ENTRYPOINT ["/app/server"]
