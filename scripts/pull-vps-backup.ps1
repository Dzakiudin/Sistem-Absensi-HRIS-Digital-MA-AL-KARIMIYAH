# Tarik paket backup terbaru (atau jalankan backup baru) dari VPS langsung ke:
# D:\#My Project\BACKUP DATA ABSENSI AL-KARIMIYAH\backup-vps-YYYYMMDD-HHMMSS

param(
    [string]$VpsHost = "root@76.13.17.167",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_ed25519_paspapan",
    [string]$LocalBackupRoot = "D:\#My Project\BACKUP DATA ABSENSI AL-KARIMIYAH",
    [switch]$RunNewBackupOnVps
)

$ErrorActionPreference = "Stop"

if ($RunNewBackupOnVps) {
    Write-Host "Menjalankan pembuatan backup baru di VPS..."
    ssh -i $SshKey -o StrictHostKeyChecking=no $VpsHost "/opt/paspapan/scripts/vps-daily-backup.sh"
}

$LatestFolder = (ssh -i $SshKey -o StrictHostKeyChecking=no $VpsHost "ls -1dt /opt/paspapan/vps-backups/backup-vps-* 2>/dev/null | head -n 1").Trim()
if (-not $LatestFolder) {
    throw "Belum ada folder backup di /opt/paspapan/vps-backups/. Jalankan dengan -RunNewBackupOnVps."
}

$FolderName = Split-Path $LatestFolder -Leaf
$DestDir = Join-Path $LocalBackupRoot $FolderName
New-Item -ItemType Directory -Force -Path $LocalBackupRoot | Out-Null

Write-Host "Mengunduh $FolderName ke $DestDir ..."
scp -i $SshKey -o StrictHostKeyChecking=no -r "${VpsHost}:${LatestFolder}" "$LocalBackupRoot\"

Write-Host "Memverifikasi SHA256SUMS di lokal..."
$SumsFile = Join-Path $DestDir "SHA256SUMS"
Get-Content $SumsFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^([a-f0-9]{64})\s+(.+)$") {
        $expected = $Matches[1].ToLower()
        $fileName = $Matches[2].Trim()
        $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $DestDir $fileName)).Hash.ToLower()
        if ($actual -ne $expected) {
            throw "Checksum TIDAK COCOK untuk $fileName! Expected $expected, got $actual"
        }
        Write-Host "  [OK] $fileName ($actual)"
    }
}

Write-Host "Backup berhasil disinkronkan dan terverifikasi di: $DestDir"
