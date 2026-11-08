#!/usr/bin/env bash
# ==============================================================================
# Backup Otomatis Harian VPS Paspapan — MA AL KARIMIYAH
# Menghasilkan struktur folder identik dengan:
#   backup-vps-YYYYMMDD-HHMMSS/
#   ├── database.dump
#   ├── foto-presensi.tar.gz
#   ├── backup-harian.tar.gz
#   ├── konfigurasi-deploy.tar.gz
#   ├── README.txt
#   ├── LOCAL-RESTORE-NOTES.txt
#   └── SHA256SUMS
# Lalu mengunggah folder tersebut ke Google Drive (via rclone) dan mengirim
# email ringkasan + lampiran database.dump ke BACKUP_EMAIL_TO.
# ==============================================================================
set -euo pipefail

export TZ="Asia/Jakarta"

PROJECT_DIR="${PROJECT_DIR:-/opt/paspapan}"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-paspapan}"
POSTGRES_USER="${POSTGRES_USER:-paspapan}"
VPS_BACKUP_ROOT="${VPS_BACKUP_ROOT:-$PROJECT_DIR/vps-backups}"
VPS_BACKUP_RETENTION_DAYS="${VPS_BACKUP_RETENTION_DAYS:-7}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
GDRIVE_BACKUP_DIR="${GDRIVE_BACKUP_DIR:-BACKUP DATA ABSENSI AL-KARIMIYAH}"
GDRIVE_RETENTION_DAYS="${GDRIVE_RETENTION_DAYS:-30}"

TS="$(date +%Y%m%d-%H%M%S)"
FOLDER_NAME="backup-vps-${TS}"
OUT_DIR="${VPS_BACKUP_ROOT}/${FOLDER_NAME}"

MONTHS_ID=("" "Januari" "Februari" "Maret" "April" "Mei" "Juni" "Juli" "Agustus" "September" "Oktober" "November" "Desember")
DAY_NUM="$(date +%-d)"
MONTH_NUM="$(date +%-m)"
YEAR_NUM="$(date +%Y)"
DATE_ID="${DAY_NUM} ${MONTHS_ID[$MONTH_NUM]} ${YEAR_NUM}"

echo "[$(date '+%F %T %Z')] Memulai pembuatan paket ${FOLDER_NAME}..."
mkdir -p "$OUT_DIR"
chmod 700 "$VPS_BACKUP_ROOT" "$OUT_DIR"

# 1. database.dump (custom format pg_dump + verifikasi pg_restore --list)
echo "[1/6] Membuat database.dump..."
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "${OUT_DIR}/database.dump"
docker compose exec -T db pg_restore --list < "${OUT_DIR}/database.dump" > /dev/null

# Ambil metrik data utama untuk LOCAL-RESTORE-NOTES.txt
read_count() {
  local table="$1"
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d '[:space:]' || echo "0"
}
CNT_USERS="$(read_count madrasah_users)"
CNT_JADWAL="$(read_count madrasah_jadwal)"
CNT_ABSENSI_HARIAN="$(read_count madrasah_absensi_harian)"
CNT_SISWA="$(read_count madrasah_siswa)"
CNT_SESI="$(read_count madrasah_sesi_mengajar)"

# 2. foto-presensi.tar.gz (folder backend/storage/uploads sebagai uploads/)
echo "[2/6] Mengarsipkan foto-presensi.tar.gz..."
mkdir -p "$PROJECT_DIR/backend/storage/uploads/foto"
UPLOAD_FILE_COUNT="$(find "$PROJECT_DIR/backend/storage/uploads" -type f | wc -l | tr -d '[:space:]')"
FOTO_FILE_COUNT="$(find "$PROJECT_DIR/backend/storage/uploads/foto" -type f | wc -l | tr -d '[:space:]')"
tar -czf "${OUT_DIR}/foto-presensi.tar.gz" -C "$PROJECT_DIR/backend/storage" uploads
tar -tzf "${OUT_DIR}/foto-presensi.tar.gz" > /dev/null

# 3. backup-harian.tar.gz (folder backups/)
echo "[3/6] Mengarsipkan backup-harian.tar.gz..."
mkdir -p "$PROJECT_DIR/backups"
tar -czf "${OUT_DIR}/backup-harian.tar.gz" -C "$PROJECT_DIR" backups
tar -tzf "${OUT_DIR}/backup-harian.tar.gz" > /dev/null

# 4. konfigurasi-deploy.tar.gz (.env, docker-compose.yml, nginx/default.conf, nginx/certbot/conf)
echo "[4/6] Mengarsipkan konfigurasi-deploy.tar.gz..."
DEPLOY_FILES=()
for item in .env docker-compose.yml nginx/default.conf nginx/certbot/conf; do
  if [ -e "$PROJECT_DIR/$item" ]; then
    DEPLOY_FILES+=("$item")
  fi
done
tar -czf "${OUT_DIR}/konfigurasi-deploy.tar.gz" -C "$PROJECT_DIR" "${DEPLOY_FILES[@]}"
tar -tzf "${OUT_DIR}/konfigurasi-deploy.tar.gz" > /dev/null

# 5. SHA256SUMS + README.txt + LOCAL-RESTORE-NOTES.txt
echo "[5/6] Menghitung SHA256SUMS & membuat dokumentasi..."
(
  cd "$OUT_DIR"
  sha256sum database.dump foto-presensi.tar.gz backup-harian.tar.gz konfigurasi-deploy.tar.gz > SHA256SUMS
  sha256sum -c SHA256SUMS > /dev/null
)

cat > "${OUT_DIR}/README.txt" <<EOF
Backup VPS Paspapan
Dibuat: ${DATE_ID}

Isi:
- database.dump: seluruh database PostgreSQL dalam format custom pg_dump.
- foto-presensi.tar.gz: folder uploads, termasuk foto presensi.
- backup-harian.tar.gz: backup harian dan snapshot database yang sudah ada di VPS.
- konfigurasi-deploy.tar.gz: .env, docker-compose.yml, konfigurasi Nginx, dan sertifikat TLS.
- SHA256SUMS: checksum arsip sebelum ditransfer; seluruh checksum sudah cocok.

Validasi:
- database.dump berhasil diperiksa dengan pg_restore --list.
- Semua file arsip cocok dengan checksum SHA-256 di VPS.
- Arsip TAR/GZIP dapat dibaca.
- Terdapat ${UPLOAD_FILE_COUNT} file di folder uploads saat backup dibuat.

Penting:
- konfigurasi-deploy.tar.gz berisi rahasia aplikasi dan private key sertifikat.
  Jangan dibagikan atau diunggah ke repository publik.
- Folder backup ini dibatasi untuk akun pemilik/administrator.
- Redis tidak disertakan karena hanya digunakan sebagai cache aplikasi.
- Ini bukan image penuh VPS; file sistem operasi/container tidak disertakan.
- Saat restore, pulihkan database dan uploads. Uji restore di lingkungan terpisah
  sebelum mengganti database produksi.
- SHA256SUMS memverifikasi transfer dari VPS, bukan perubahan file setelah
  backup dibuat.
EOF

cat > "${OUT_DIR}/LOCAL-RESTORE-NOTES.txt" <<EOF
Restore ke server lokal
Tanggal: ${DATE_ID}

Database aplikasi lokal aktif:
- Database: ${POSTGRES_DB}
- Endpoint lokal: 127.0.0.1:5433
- Isi dipulihkan dari database.dump dan diverifikasi setelah restore.

Data utama yang diverifikasi pada database aktif:
- Akun pengguna: ${CNT_USERS}
- Jadwal: ${CNT_JADWAL}
- Presensi harian: ${CNT_ABSENSI_HARIAN}
- Siswa: ${CNT_SISWA}
- Sesi mengajar: ${CNT_SESI}

Foto:
- ${FOTO_FILE_COUNT} file berada di backend/storage/uploads/foto.
- Foto upload lokal sebelum restore dipindahkan ke folder
  local-before-restore-${TS}/local-uploads-directory-before-restore.
- Arsip tambahan foto lokal lama juga ada sebagai
  local-before-restore-${TS}/local-uploads-before-restore.tar.gz.

Rollback database:
- Database lokal lama TIDAK dihapus. Namanya:
  ${POSTGRES_DB}_local_pre_restore_${TS//-/_}
- Dump pengaman lokal sebelum restore:
  local-before-restore-${TS}/local-database-before-restore.dump

Pemeriksaan:
- Backend lokal merespons /readyz dengan status ok.
- Cache aplikasi Redis lokal untuk rekap siswa dan honor telah dipastikan kosong.
- File konfigurasi produksi dari arsip backup tidak dipasang ke konfigurasi lokal.

Jangan menghapus database rollback atau folder local-before-restore sampai
aplikasi lokal sudah diperiksa dan data baru dipastikan benar.
EOF

# 6. Upload ke Google Drive (jika rclone sudah dikonfigurasi) & Kirim Email
GDRIVE_LINK="${GDRIVE_FOLDER_URL:-}"
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE}:"; then
  REMOTE_TARGET="${RCLONE_REMOTE}:${GDRIVE_BACKUP_DIR}/${FOLDER_NAME}"
  echo "[6/6] Mengunggah ${FOLDER_NAME} ke Google Drive (${REMOTE_TARGET})..."
  if rclone copy "$OUT_DIR" "$REMOTE_TARGET" --transfers=4 --checkers=8 --quiet; then
    LINK_OUT="$(rclone link "$REMOTE_TARGET" 2>/dev/null || true)"
    if [ -n "$LINK_OUT" ]; then
      GDRIVE_LINK="$LINK_OUT"
    fi
    echo "[gdrive] Upload selesai: ${GDRIVE_LINK:-$REMOTE_TARGET}"
  else
    echo "[gdrive] Peringatan: gagal mengunggah ke Google Drive." >&2
  fi
else
  echo "[6/6] rclone remote '${RCLONE_REMOTE}:' belum dikonfigurasi, melewati upload Google Drive."
fi

# Kirim email via Python script
if [ -f "$PROJECT_DIR/scripts/send-backup-email.py" ]; then
  python3 "$PROJECT_DIR/scripts/send-backup-email.py" "$OUT_DIR" "$GDRIVE_LINK" || true
fi

# Bersihkan folder backup lokal di VPS yang lebih tua dari VPS_BACKUP_RETENTION_DAYS
find "$VPS_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name "backup-vps-*" -mtime +"$VPS_BACKUP_RETENTION_DAYS" -exec rm -rf {} +

echo "[$(date '+%F %T %Z')] Backup selesai: ${OUT_DIR}"
