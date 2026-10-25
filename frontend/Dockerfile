# syntax=docker/dockerfile:1

# ---------- dependencies ----------
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# npm ci = install persis sesuai lockfile, reproducible.
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Mengaktifkan `output: "standalone"` di next.config.ts.
ENV BUILD_STANDALONE=1

# Regenerate public/app.js dari sumber modular (src/js + manifest.mjs) supaya
# hasil build selalu sinkron dengan sumber, bukan bergantung pada artefak commit.
RUN npm run build:app

# Catatan: rewrites `/api` & `/uploads` di-next.config.ts di-resolve saat build.
# Di produksi keduanya ditangani Nginx, jadi nilai NEXT_PUBLIC_API_URL di sini
# tidak dipakai. Jangan diisi URL backend publik �?" biarkan kosong.
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Jakarta

WORKDIR /app

# Dipakai user `node` bawaan image (uid 1000).
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# server.js tidak menyertakan public/ dan .next/static — wajib disalin manual.
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# next.config.ts sudah memaksa `output: standalone` lewat BUILD_STANDALONE=1.
# Guard ini supaya build gagal keras (bukan crash aneh saat runtime) kalau
# flag-nya lupa di-set sehingga `.next/standalone` tidak terbentuk.
RUN test -f /app/server.js

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
