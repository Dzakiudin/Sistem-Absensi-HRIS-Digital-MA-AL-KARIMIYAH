/* =============================================================
   ICON HELPER (untuk konten yang dirender lewat JS)
   ============================================================= */
function icon(name) {
  const common =
    'width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const paths = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert:
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/>',
    pin: '<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera:
      '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="14" r="4"/>',
    clock:
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    inbox:
      '<path d="M4 4h16l3 8v7a1 1 0 01-1 1H2a1 1 0 01-1-1v-7z"/><path d="M1 12h6l2 3h6l2-3h6"/>',
    book:
      '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    users:
      '<path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    pencil:
      '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="m15 5 4 4"/>',
  };
  return `<svg ${common}>${paths[name] || ""}</svg>`;
}

function urutanJamJadwal(jamKe) {
  const periodePertama = String(jamKe || "")
    .trim()
    .split(/\s*[-–]\s*/)[0]
    .toUpperCase();
  if (typeof JAMKE_URUT === "undefined") return 99;
  const index = JAMKE_URUT.indexOf(periodePertama);
  return index < 0 ? 99 : index;
}

function waktuJamJadwal(jamKe) {
  if (typeof JAMKE_WAKTU === "undefined") return "";
  const periode = String(jamKe || "")
    .trim()
    .split(/\s*[-–]\s*/)
    .map((value) => value.toUpperCase())
    .filter(Boolean);
  if (!periode.length) return "";
  const mulai = JAMKE_WAKTU[periode[0]];
  const selesai = JAMKE_WAKTU[periode[periode.length - 1]];
  return mulai && selesai ? `${mulai.mulai}–${selesai.selesai}` : "";
}

/* =============================================================
   UTILITAS UMUM
   ============================================================= */
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}

// Aman untuk disisipkan ke dalam string JS di dalam atribut onclick="...".
// Atribut HTML di-decode entity TERLEBIH DAHULU sebelum JS dijalankan, jadi
// &apos;/&#39; malah jadi kutip literal yang memutus string. Solusinya: kutip
// tunggal/ganda di-escape via \uXXXX dan backslash didobel.
function escJs(val) {
  const s = val === null || val === undefined ? "" : String(val);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\u0027")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const iconSvg =
    type === "success"
      ? icon("check")
      : type === "info"
        ? icon("inbox")
        : icon("alert");
  toast.innerHTML = iconSvg + `<span>${esc(message)}</span>`;
  toast.className = "toast show " + type;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  clearTimeout(window.__toastTimer);
  // Pesan error/toast jadi lebih lama tampil karena biasanya berisi penjelasan.
  const durasi = type === "error" ? 6000 : type === "info" ? 4500 : 3200;
  window.__toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, durasi);
}

function showLoading(text) {
  window.__aksiBerjalan = true;
  const textEl = document.getElementById("loadingText");
  const overlay = document.getElementById("loadingOverlay");
  if (textEl) textEl.textContent = text || "Memuat...";
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
}
function hideLoading() {
  window.__aksiBerjalan = false;
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
}

// Kunci klik ganda pada aksi yang sedang berjalan. Dipakai tombol submit yang
// hanya mengandalkan overlay loading (bukan disable tombol) supaya request tidak
// terkirim berkali-kali. Mengembalikan true kalau aksi sedang berjalan.
function cekAksiBerjalan() {
  if (window.__aksiBerjalan) {
    showToast("Transaksi sedang diproses. Mohon tunggu sebentar.", "info");
    return true;
  }
  return false;
}

function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || "";
  return /android|iphone|ipad|ipod|iemobile|blackberry|opera mini/i.test(ua);
}

function badgeJenis(j) {
  return j === "Masuk"
    ? `<span class="badge ok">Masuk</span>`
    : `<span class="badge muted">Pulang</span>`;
}
function badgeStatus(s) {
  if (s === "Tepat Waktu" || s === "Hadir")
    return `<span class="badge ok">Hadir</span>`;
  if (s === "Izin") return `<span class="badge muted">Izin</span>`;
  if (s === "Sakit") return `<span class="badge warn">Sakit</span>`;
  if (s === "Cuti") return `<span class="badge muted">Cuti</span>`;
  if (s === "Alpa") return `<span class="badge danger">Alpa</span>`;
  if (s === "Terlambat") return `<span class="badge danger">Terlambat</span>`;
  if (s === "Pulang Cepat")
    return `<span class="badge warn">Pulang Cepat</span>`;
  return `<span class="badge muted">-</span>`;
}
function badgeLokasi(s) {
  return s === "Dalam Radius"
    ? `<span class="badge ok">Dalam Radius</span>`
    : `<span class="badge danger">Luar Radius</span>`;
}

// Google kadang memblokir satu format URL Drive tapi tidak yang lain (dan bisa berubah
// lagi kapan saja) — helper ini otomatis mencoba format alternatif kalau format utama
// gagal dimuat, supaya tampilan foto tidak tiba-tiba rusak semua kalau itu terjadi lagi.
function labelKonfirmasiPengganti(status) {
  if (status === "Terkonfirmasi")
    return ' <span class="badge ok">Terkonfirmasi</span>';
  if (status === "Menunggu")
    return ' <span class="badge warn">Menunggu Konfirmasi</span>';
  return "";
}

function extractDriveFileId(url) {
  const m = String(url || "").match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}
function tautanMaps(lat, lng) {
  if (!lat || !lng) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
function fotoThumbTag(url, cssClass) {
  const fid = extractDriveFileId(url);
  const fallback = fid
    ? `https://drive.google.com/uc?export=view&id=${fid}`
    : "";
  const onerrorJs = fallback
    ? `this.onerror=null;this.src='${fallback}';`
    : `this.style.opacity='0.25';`;
  const finalUrl = fotoUrlDenganToken(url);
  return `<img class="${cssClass}" src="${esc(finalUrl)}" onerror="${onerrorJs}" onclick="bukaLightbox('${escJs(finalUrl)}')">`;
}

// ServeFoto kini memerlukan sesi; tempel ?t=<jwt> pada URL foto lokal
// supaya <img> tetap bisa dimuat (img tak bisa set header Authorization).
function fotoUrlDenganToken(url) {
  if (!url || !/^\/uploads\/foto\//.test(url)) return url;
  const token = localStorage.getItem("mtsAbsensiToken");
  if (!token) return url;
  const delimiter = url.indexOf("?") === -1 ? "?" : "&";
  return url + delimiter + "t=" + encodeURIComponent(token);
}

function bukaLightbox(url) {
  document.getElementById("lightboxImg").src = fotoUrlDenganToken(url);
  document.getElementById("photoLightbox").classList.remove("hidden");
}
function tutupLightbox() {
  document.getElementById("photoLightbox").classList.add("hidden");
}

function todayInputValue() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
// Tanggal lokal yyyy-MM-dd (hindari toISOString yang berbasis UTC).
function tanggalLocalISO() {
  return todayInputValue();
}
function firstOfMonthInputValue() {
  const d = new Date();
  return (
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01"
  );
}
