#!/usr/bin/env python3
"""
Pengirim email laporan & lampiran backup harian VPS Paspapan (MA AL KARIMIYAH).
Menggunakan pustaka standar Python 3 (smtplib, ssl, email) sehingga tidak
memerlukan instalasi paket tambahan di VPS.
"""

import os
import sys
import ssl
import smtplib
from pathlib import Path
from email.message import EmailMessage


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024.0 or unit == "GB":
            return f"{size:.2f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024.0
    return f"{num_bytes} B"


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: send-backup-email.py <path-to-backup-folder> [gdrive-link]", file=sys.stderr)
        return 1

    backup_dir = Path(sys.argv[1]).resolve()
    gdrive_link = sys.argv[2].strip() if len(sys.argv) > 2 else ""

    if not backup_dir.is_dir():
        print(f"[email] Folder backup tidak ditemukan: {backup_dir}", file=sys.stderr)
        return 1

    smtp_host = os.environ.get("BACKUP_SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port = int(os.environ.get("BACKUP_SMTP_PORT", "465").strip())
    smtp_user = os.environ.get("BACKUP_SMTP_USER", "").strip()
    smtp_pass = os.environ.get("BACKUP_SMTP_PASS", "").strip()
    email_to = os.environ.get("BACKUP_EMAIL_TO", "dhaifiiphone11@gmail.com").strip()
    email_from = os.environ.get("BACKUP_EMAIL_FROM", smtp_user or "noreply@absensimakarimiyah.tech").strip()

    if not smtp_user or not smtp_pass:
        print(
            "[email] BACKUP_SMTP_USER / BACKUP_SMTP_PASS belum diisi di .env. "
            "Lewati pengiriman email.",
            file=sys.stderr,
        )
        return 2

    folder_name = backup_dir.name
    readme_text = (backup_dir / "README.txt").read_text(encoding="utf-8", errors="replace") if (backup_dir / "README.txt").is_file() else ""
    restore_text = (backup_dir / "LOCAL-RESTORE-NOTES.txt").read_text(encoding="utf-8", errors="replace") if (backup_dir / "LOCAL-RESTORE-NOTES.txt").is_file() else ""
    sha256_text = (backup_dir / "SHA256SUMS").read_text(encoding="utf-8", errors="replace") if (backup_dir / "SHA256SUMS").is_file() else ""

    files_info = []
    for fname in (
        "database.dump",
        "foto-presensi.tar.gz",
        "backup-harian.tar.gz",
        "konfigurasi-deploy.tar.gz",
        "README.txt",
        "LOCAL-RESTORE-NOTES.txt",
        "SHA256SUMS",
    ):
        fpath = backup_dir / fname
        if fpath.is_file():
            files_info.append((fname, human_size(fpath.stat().st_size)))

    files_summary_plain = "\n".join(f"  - {name}: {sz}" for name, sz in files_info)
    files_summary_html = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #e4e2da;font-family:monospace;'>{name}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #e4e2da;text-align:right;'>{sz}</td></tr>"
        for name, sz in files_info
    )

    gdrive_section_plain = (
        f"\nLink Google Drive (Paket Lengkap + Foto Presensi):\n  {gdrive_link}\n"
        if gdrive_link
        else "\nCatatan: Paket lengkap tersimpan di VPS (/opt/paspapan/vps-backups/" + folder_name + ").\n"
    )

    gdrive_section_html = (
        f"""
        <div style="margin:18px 0;padding:14px 16px;background:#e6efe9;border:1px solid #c2d6ca;border-radius:10px;">
          <div style="font-weight:700;color:#2b4738;margin-bottom:6px;">Folder Google Drive (Paket Lengkap)</div>
          <a href="{gdrive_link}" style="display:inline-block;padding:9px 16px;background:#466b57;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">
            Buka {folder_name} di Google Drive &rarr;
          </a>
          <div style="margin-top:6px;font-size:12px;color:#4a4740;word-break:break-all;">{gdrive_link}</div>
        </div>
        """
        if gdrive_link
        else f"""
        <div style="margin:18px 0;padding:12px 14px;background:#efede7;border:1px solid #d5d2c8;border-radius:10px;font-size:12.5px;color:#4a4740;">
          Lokasi di VPS: <code>/opt/paspapan/vps-backups/{folder_name}</code>
        </div>
        """
    )

    plain_body = f"""Backup Otomatis Harian VPS Paspapan — MA AL KARIMIYAH
Folder Backup : {folder_name}
{gdrive_section_plain}
Daftar File dalam Paket Backup:
{files_summary_plain}

------------------------------------------------------------------------
SHA256SUMS:
{sha256_text.strip()}

------------------------------------------------------------------------
README.txt:
{readme_text.strip()}

------------------------------------------------------------------------
LOCAL-RESTORE-NOTES.txt:
{restore_text.strip()}
"""

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1e1c;">
  <div style="max-width:640px;margin:0 auto;background:#fcfbf9;border:1px solid #e4e2da;border-radius:14px;padding:24px;">
    <h2 style="margin:0 0 4px;color:#2b4738;font-size:18px;">Backup Harian VPS — MA AL KARIMIYAH</h2>
    <p style="margin:0 0 16px;color:#6e6a61;font-size:13px;">Paket: <strong>{folder_name}</strong></p>

    {gdrive_section_html}

    <h3 style="font-size:14px;color:#2b4738;margin:18px 0 8px;">Rincian File Backup</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#ffffff;border:1px solid #e4e2da;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#efede7;color:#4a4740;text-align:left;">
          <th style="padding:8px 12px;">Nama File</th>
          <th style="padding:8px 12px;text-align:right;">Ukuran</th>
        </tr>
      </thead>
      <tbody>
        {files_summary_html}
      </tbody>
    </table>

    <h3 style="font-size:14px;color:#2b4738;margin:18px 0 6px;">Ringkasan Data &amp; Restore</h3>
    <pre style="background:#efede7;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;color:#292724;">{restore_text.strip()}</pre>

    <h3 style="font-size:14px;color:#2b4738;margin:18px 0 6px;">SHA-256 Checksums</h3>
    <pre style="background:#efede7;padding:12px;border-radius:8px;font-size:11.5px;overflow-x:auto;color:#292724;">{sha256_text.strip()}</pre>

    <p style="margin:18px 0 0;font-size:12px;color:#6e6a61;">
      File <code>database.dump</code>, <code>README.txt</code>, <code>LOCAL-RESTORE-NOTES.txt</code>, dan <code>SHA256SUMS</code> dilampirkan langsung pada email ini.
    </p>
  </div>
</body>
</html>
"""

    msg = EmailMessage()
    msg["Subject"] = f"[Backup VPS MA AL KARIMIYAH] {folder_name}"
    msg["From"] = email_from
    msg["To"] = email_to
    msg.set_content(plain_body)
    msg.add_alternative(html_body, subtype="html")

    # Lampirkan database.dump (jika <= 20 MB), README.txt, LOCAL-RESTORE-NOTES.txt, dan SHA256SUMS
    attachments = [
        ("database.dump", "application", "octet-stream"),
        ("README.txt", "text", "plain"),
        ("LOCAL-RESTORE-NOTES.txt", "text", "plain"),
        ("SHA256SUMS", "text", "plain"),
    ]
    for fname, maintype, subtype in attachments:
        fpath = backup_dir / fname
        if not fpath.is_file():
            continue
        if fpath.stat().st_size > 20 * 1024 * 1024:
            continue
        msg.add_attachment(
            fpath.read_bytes(),
            maintype=maintype,
            subtype=subtype,
            filename=fname,
        )

    context = ssl.create_default_context()
    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=60) as server:
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=60) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)

    print(f"[email] Berhasil dikirim ke {email_to} untuk {folder_name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
