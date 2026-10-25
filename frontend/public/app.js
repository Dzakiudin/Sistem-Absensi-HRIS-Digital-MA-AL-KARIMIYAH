/* =============================================================
   STATE
   ============================================================= */
let currentUser = null;
const __pustakaLoading = {};
const __muatanCache = new Map();
const __loaderBusy = new Set();
let capturedPhoto = null;
let currentLocation = null;
let lokasiValidUntukAbsen = false;
let jenisAbsenAktif = null;
let daftarGuruCache = [];
let usersCache = [];
let infoSekolahCache = null;
let modeKamera = "absen"; // 'absen' | 'konfirmasi' — menentukan tujuan submit di modal kamera
let konfirmasiPenggantiAktifId = null;
let konfirmasiPenggantiAktifIsRentang = false;
let daftarKonfirmasiPenggantiCache = [];
let __tabAktif = null;
let __tabGuruAktif = null;
let guruJadwalCache = null;
/* =============================================================
   PROMISE WRAPPER UNTUK google.script.run
   ============================================================= */
function pesanRamah(err) {
  const m = String((err && err.message) || err || "");
  const lower = m.toLowerCase();
  console.error("[API]", m);
  if (/timeout|timed ?out|deadline|time\s*out/i.test(m))
    return "Waktu permintaan habis. Periksa koneksi lalu coba lagi.";
  if (
    /networkerror|failed to fetch|load failed|connection refused|econnrefused|network/i.test(
      lower,
    )
  )
    return "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";
  if (/401|unauthorized|token/i.test(lower))
    return "Sesi Anda berakhir. Silakan masuk kembali.";
  if (/403|forbidden|ditolak/i.test(lower))
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (/terlalu banyak percobaan/i.test(lower))
    return m;
  if (/429|rate limit/i.test(lower))
    return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  if (/502|503|504|server sementara sibuk|gateway/i.test(lower))
    return "Server sedang sibuk atau sementara tidak tersedia. Coba lagi sebentar.";
  if (/500|internal|panic|nil pointer|sql:/i.test(lower))
    return "Terjadi kendala di server. Silakan coba lagi beberapa saat.";
  if (/bukan json|respons server rusak|respons server tidak valid/i.test(lower))
    return "Respons server tidak valid. Muat ulang halaman, lalu coba lagi.";
  if (/fetch/i.test(lower))
    return "Gagal mengambil data. Periksa koneksi lalu coba lagi.";
  return m || "Terjadi kesalahan. Coba lagi.";
}

function pesanHTTPTidakSukses(status, pesan) {
  if (status === 401) return pesan || "Sesi Anda berakhir. Silakan masuk kembali.";
  if (status === 403) return pesan || "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (status === 429)
    return pesan || "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  if (status === 502 || status === 503 || status === 504)
    return "Server sedang sibuk atau sementara tidak tersedia (HTTP " +
      status +
      "). Coba lagi sebentar.";
  if (status >= 500)
    return "Server mengalami kendala (HTTP " + status + "). Silakan coba lagi.";
  return pesan || "Permintaan gagal (HTTP " + status + ").";
}

function runServer(fnName, ...args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("mtsAbsensiToken");
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch("/api/rpc", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ fn: fnName, args: args }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const contentType = res.headers.get("content-type") || "";
      if (!/application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
        throw new Error(
          res.ok
            ? "Respons server bukan JSON (HTTP " + res.status + ")."
            : pesanHTTPTidakSukses(res.status),
        );
      }
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(
          !res.ok
            ? pesanHTTPTidakSukses(res.status)
            : "Respons server rusak (HTTP " + res.status + ").",
        );
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Respons server tidak valid (format RPC tidak dikenal).");
      }
      if (!res.ok || data.error) {
        let message = pesanHTTPTidakSukses(
          res.status,
          data.error || data.message,
        );
        const retryIn = Number(data.retryIn || res.headers.get("Retry-After"));
        if (res.status === 429 && retryIn > 0) {
          message += " Coba lagi dalam " + Math.ceil(retryIn) + " detik.";
        }
        const err = new Error(
          message,
        );
        if (res.status === 401) err.forceLogout = true;
        throw err;
      }
      if (!Object.prototype.hasOwnProperty.call(data, "result")) {
        throw new Error("Respons server tidak valid (format RPC tidak dikenal).");
      }
      return data.result;
    })
    .catch((err) => {
      err.__fn = fnName;
      __kirimLog(fnName, err);
      if (err.name === "AbortError" || controller.signal.aborted) {
        throw new Error("Waktu permintaan habis.");
      }
      if (err && err.forceLogout) {
        let msg = pesanRamah(err);
        localStorage.removeItem("mtsAbsensiUser");
        localStorage.removeItem("mtsAbsensiToken");
        showToast(msg, "error");
        setTimeout(() => location.reload(), 1200);
        throw new Error(msg);
      }
      throw new Error(pesanRamah(err));
    })
    .finally(() => clearTimeout(timer));
}

/* =============================================================
   PEMUAT DINAMIS PUSTAKA (LAZY-LOAD) + PELAPORAN ERROR KLIENT
   ============================================================= */
// dipindahkan ke STATE di atas

function __muatPustaka(src, integrity) {
  if (__pustakaLoading[src]) return __pustakaLoading[src];
  const p = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => res(true);
    s.onerror = () => {
      delete __pustakaLoading[src];
      rej(new Error("Gagal memuat " + src));
    };
    document.head.appendChild(s);
  });
  __pustakaLoading[src] = p;
  return p;
}

function __muatCSS(href, integrity) {
  return new Promise((res, rej) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    if (integrity) {
      l.integrity = integrity;
      l.crossOrigin = "anonymous";
    }
    l.onload = () => res(true);
    l.onerror = () => rej(new Error("Gagal memuat style " + href));
    document.head.appendChild(l);
  });
}

// Pastikan pustaka Excel tersedia, baru jalankan lanjutan. Dijalankan sekali;
// pemanggilan kedua langsung resolve karena XLSX sudah terpasang.
function __pasangXLSX() {
  if (typeof XLSX !== "undefined") return Promise.resolve(true);
  return __muatPustaka("/xlsx.full.min.js").then(() =>
    typeof XLSX !== "undefined"
      ? true
      : Promise.reject(new Error("xlsx tidak terbaca")),
  );
}

// Sama untuk Leaflet (peta geofence) — dimuat hanya saat halaman pengaturan dibuka.
function __pasangLeaflet() {
  if (typeof L !== "undefined") return Promise.resolve(true);
  return Promise.all([
    __muatCSS(
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
    ),
    __muatPustaka(
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
    ),
  ]).then(() =>
    typeof L !== "undefined"
      ? true
      : Promise.reject(new Error("leaflet tidak terbaca")),
  );
}

// Lapor error klien ke server secara diam-diam (sendBeacon bila ada) agar bug
// bisa di-debug dari log backend. Otomatis dibatasi 1 kiriman/detik.
let __logWaktuTerakhir = 0;
function __kirimLog(fn, err, tambahan) {
  try {
    const now = Date.now();
    if (now - __logWaktuTerakhir < 1000) return;
    __logWaktuTerakhir = now;
    const body = JSON.stringify({
      fn: fn || "",
      message: String((err && err.message) || err || ""),
      stack: err && err.stack ? String(err.stack).slice(0, 1000) : "",
      url: location.href.slice(0, 300),
      userAgent: navigator.userAgent.slice(0, 300),
      ...(tambahan || {}),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/log",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (e) {
    /* error logging tidak boleh merusak UI */
  }
}

window.addEventListener("error", function (ev) {
  __kirimLog("window.onerror", ev && ev.error ? ev.error : ev && ev.message);
});
window.addEventListener("unhandledrejection", function (ev) {
  __kirimLog("unhandledrejection", ev && ev.reason);
});
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
/* =============================================================
   INISIALISASI
   ============================================================= */
function initApp() {
  if (window.__appInitialized) return;
  window.__appInitialized = true;

  runServer("getInfoSekolah")
    .then((info) => {
      infoSekolahCache = info;
      document
        .querySelectorAll(".js-nama-sekolah")
        .forEach((el) => (el.textContent = info.namaSekolah));
      const jendelaEl = document.getElementById("guruJendelaAbsen");
      if (jendelaEl) {
        jendelaEl.textContent =
          info.jamMasukBatas && info.jamPulangMinimal
            ? "Absensi dibuka pukul " +
              info.jamMasukBatas +
              "\u2013" +
              info.jamPulangMinimal
            : "Waktu operasional presensi belum diatur.";
      }
    })
    .catch(() => {
      const jendelaEl = document.getElementById("guruJendelaAbsen");
      if (jendelaEl) {
        jendelaEl.textContent = "Waktu operasional presensi tidak dapat dimuat.";
      }
    });

  attachStaticListeners();

  // Refresh data saat tab kembali aktif, tetapi jangan memutus sesi hanya
  // karena pengguna sedang tidak beraktivitas.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") panggilUlangTabAktif();
  });

  pulihkanSesi();
}

function pulihkanSesi() {
  try {
    const savedUser = localStorage.getItem("mtsAbsensiUser");
    const savedToken = localStorage.getItem("mtsAbsensiToken");
    if (!savedUser || !savedToken) return;

    const parsedUser = JSON.parse(savedUser);
    if (!parsedUser || !parsedUser.role || !parsedUser.namaLengkap)
      throw new Error("Sesi tidak lengkap");
    currentUser = parsedUser;
    masukKeDashboard();
  } catch (e) {
    console.warn("[AUTH] Gagal memulihkan sesi:", e);
    currentUser = null;
    try {
      localStorage.removeItem("mtsAbsensiUser");
      localStorage.removeItem("mtsAbsensiToken");
    } catch (_) {}
    tampilkanLogin();
  }
}

function tampilkanLogin() {
  ["guruSection", "adminSection", "kepalaSection"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  const loginSection = document.getElementById("loginSection");
  if (loginSection) loginSection.classList.remove("hidden");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function attachStaticListeners() {
  const on = (id, evt, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, handler);
  };

  on("loginForm", "submit", handleLogin);
  on("togglePassword", "click", () => {
    const inp = document.getElementById("loginPassword");
    if (!inp) return;
    const showing = inp.type === "text";
    inp.type = showing ? "password" : "text";
    const btn = document.getElementById("togglePassword");
    if (btn) btn.innerHTML = showing ? eyeIconSVG(false) : eyeIconSVG(true);
  });

  document
    .querySelectorAll("[data-logout]")
    .forEach((btn) => btn.addEventListener("click", logout));
  document
    .querySelectorAll("[data-nav]")
    .forEach((btn) =>
      btn.addEventListener("click", () => gantiTab(btn.dataset.nav)),
    );
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".user-chip-btn") &&
      !e.target.closest(".user-dropdown-menu")
    ) {
      document
        .querySelectorAll(".user-dropdown-menu")
        .forEach((m) => m.classList.add("hidden"));
    }
  });

  // ESC menutup modal dinamis (__modalOpen / showConfirmModal) & lightbox.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (window.__confirmOv) {
        window.__confirmOv.querySelector(".js-confirm-no").click();
        return;
      }
      if (window.__modalOv) {
        __modalClose();
        return;
      }
      const lb = document.getElementById("photoLightbox");
      if (lb && !lb.classList.contains("hidden")) {
        tutupLightbox();
        return;
      }
    }
  });

  // Focus trap sederhana untuk modal __modalOpen (fokus awal + Tab terkurung).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && window.__modalOv) {
      const ov = window.__modalOv;
      const fokus = ov.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!fokus.length) return;
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === pertama || document.activeElement === ov)
      ) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    }
  });

  on("camPlaceholder", "click", () => {
    const fi = document.getElementById("fotoInput");
    if (fi) fi.click();
  });
  on("fotoInput", "change", handleFotoInputChange);
  on("retakeBtn", "click", ambilUlangFoto);
  on("submitAbsenBtn", "click", handleSubmitKamera);
  on("closeCameraModal", "click", tutupModalAbsen);
  on("btnNotifikasiHonor", "click", () => gantiTabGuru("honor"));
  on("closeKonfirmasiPenggantiListModal", "click", () => {
    const m = document.getElementById("konfirmasiPenggantiListModal");
    if (m) m.classList.add("hidden");
  });
  on("btnAbsenMasuk", "click", (e) =>
    bukaModalAbsen(
      (e.currentTarget && e.currentTarget.dataset.jenis) || "Masuk",
    ),
  );
  on("btnAjukanIzin", "click", bukaModalIzin);
  on("closeIzinModal", "click", () => {
    const m = document.getElementById("izinModal");
    if (m) m.classList.add("hidden");
  });
  on("izinForm", "submit", handleAjukanIzin);

  on("closeLightbox", "click", tutupLightbox);
  on("photoLightbox", "click", (e) => {
    if (e.target.id === "photoLightbox") tutupLightbox();
  });

  document
    .querySelectorAll("[data-open-change-password]")
    .forEach((btn) => btn.addEventListener("click", bukaModalGantiPassword));
  on("closeChangePasswordModal", "click", () => {
    const m = document.getElementById("changePasswordModal");
    if (m) m.classList.add("hidden");
  });
  on("changePasswordForm", "submit", handleGantiPassword);

  on("btnTambahUser", "click", () => bukaModalUser(null));
  on("closeUserModal", "click", () => {
    const m = document.getElementById("userModal");
    if (m) m.classList.add("hidden");
  });
  on("userForm", "submit", handleSimpanUser);
  on("userRole", "change", toggleGuruFields);
  on("userMapel", "change", () =>
    toggleManualInput("userMapel", "userMapelManual"),
  );
  on("userKelas", "change", () =>
    toggleManualInput("userKelas", "userKelasManual"),
  );
  on("guruMapelSelect", "change", () =>
    toggleManualInput("guruMapelSelect", "guruMapelManual"),
  );
  on("guruKelasSelect", "change", () =>
    toggleManualInput("guruKelasSelect", "guruKelasManual"),
  );

  on("btnImporMassal", "click", bukaModalImpor);
  on("jadwalForm", "submit", handleTambahJadwal);
  on("jadwalCari", "input", () => __debounce(renderTabelJadwal, 250));
  [
    "jadwalFilterHari",
    "jadwalFilterKelas",
    "jadwalFilterMapel",
    "jadwalFilterJamKe",
  ].forEach((id) => {
    on(id, "change", renderTabelJadwal);
  });
  on("btnCetakSemuaJadwal", "click", () => bukaCetakJadwal(null, null));
  on("closeCetakJadwalModal", "click", () => {
    const m = document.getElementById("cetakJadwalModal");
    if (m) m.classList.add("hidden");
  });
  on("btnCetakJadwalSekarang", "click", () => window.print());
  on("liburForm", "submit", handleTambahLibur);
  on("honorTampilkan", "click", muatRekapHonor);
  on("closeSlipHonorModal", "click", () => {
    const m = document.getElementById("slipHonorModal");
    if (m) m.classList.add("hidden");
  });
  on("btnCetakSlipHonor", "click", () => {
    const el = document.getElementById("ukuranKertasCetak");
    if (el) el.textContent = "";
    window.print();
  });
  on("btnCetakSlipGaji", "click", () => {
    const area = document.getElementById("slipHonorPrintArea");
    if (area) area.classList.add("mode-slip-gaji");
    const el = document.getElementById("ukuranKertasCetak");
    if (el) el.textContent = "@page { size: A5; margin: 10mm; }";
    window.print();
  });
  window.addEventListener("afterprint", () => {
    const a1 = document.getElementById("slipHonorPrintArea");
    if (a1) a1.classList.remove("mode-slip-gaji");
    const a2 = document.getElementById("slipHonorSemuaPrintArea");
    if (a2) a2.classList.remove("mode-slip-gaji");
    const el = document.getElementById("ukuranKertasCetak");
    if (el) el.textContent = "";
  });
  on("closeHonorTambahanModal", "click", () => {
    const m = document.getElementById("honorTambahanModal");
    if (m) m.classList.add("hidden");
  });
  on("honorTambahanForm", "submit", handleSimpanHonorTambahan);
  on("btnCetakSemuaHonor", "click", bukaSlipHonorSemua);
  on("btnKirimSemuaHonor", "click", finalisasiHonorKlik);
  on("btnBukaFinalisasiHonor", "click", bukaFinalisasiHonorKlik);
  on("honorCari", "input", () =>
    __debounce(() => {
      const el = document.getElementById("honorCari");
      renderTabelHonor(el ? el.value : "");
    }, 250),
  );
  document.querySelectorAll("#honorBodyWrap th.sortable").forEach((th) => {
    th.addEventListener("click", () =>
      klikHeaderSort(honorSortState, th.dataset.sort, () => {
        const el = document.getElementById("honorCari");
        renderTabelHonor(el ? el.value : "");
      }),
    );
  });
  document.querySelectorAll("#jadwalBodyWrap th.sortable").forEach((th) => {
    th.addEventListener("click", () =>
      klikHeaderSort(jadwalSortState, th.dataset.sort, renderTabelJadwal),
    );
  });
  on("closeSlipHonorSemuaModal", "click", () => {
    const m = document.getElementById("slipHonorSemuaModal");
    if (m) m.classList.add("hidden");
  });
  on("closeRincianRekapModal", "click", () => {
    const m = document.getElementById("rincianRekapModal");
    if (m) m.classList.add("hidden");
  });
  on("btnCetakRincianRekap", "click", () => window.print());
  on("btnCetakSlipHonorSemua", "click", () => {
    const area = document.getElementById("slipHonorSemuaPrintArea");
    if (area) area.classList.remove("mode-slip-gaji");
    const el = document.getElementById("ukuranKertasCetak");
    if (el) el.textContent = "";
    window.print();
  });
  on("btnCetakSlipGajiSemua", "click", () => {
    const area = document.getElementById("slipHonorSemuaPrintArea");
    if (area) area.classList.add("mode-slip-gaji");
    const el = document.getElementById("ukuranKertasCetak");
    if (el) el.textContent = "@page { size: A5; margin: 10mm; }";
    window.print();
  });
  on("btnCatatManual", "click", bukaModalKehadiranManual);
  on("closeManualModal", "click", () => {
    const m = document.getElementById("manualModal");
    if (m) m.classList.add("hidden");
  });
  on("manualForm", "submit", handleSimpanKehadiranManual);
  on("manualGuru", "change", isiDefaultMapelKelasManual);

  on("pengaturanForm", "submit", handleSimpanPengaturan);
  on("btnGunakanLokasiSaatIni", "click", gunakanLokasiSaatIni);

  on("adminFilterApply", "click", () => muatDataAbsensiAdmin());
  on("adminExportCSV", "click", () => {
    const status =
      (document.getElementById("adminFilterStatus") || {}).value || "";
    const data = saringStatusAbsensi(window.__adminAbsensiCache || [], status);
    unduhAbsensiExcel(data, "Rekap Absensi Guru", "admin");
  });
  on("kepalaFilterApply", "click", () => muatDataAbsensiKepala());
  on("kepalaExportCSV", "click", () => {
    const status =
      (document.getElementById("kepalaFilterStatus") || {}).value || "";
    const data = saringStatusAbsensi(window.__kepalaAbsensiCache || [], status);
    unduhAbsensiExcel(data, "Rekap Absensi Guru", "kepala");
  });

  on("adminRekapTampilkan", "click", () => muatRekapGuru("admin"));
  on("adminRekapTampilkanRentang", "click", muatRekapGuruRentang);
  on("adminRekapCari", "input", () => __debounce(handleCariRekapGuru, 250));
  on("btnCetakRekapGuru", "click", bukaCetakRekapGuru);
  on("closeCetakRekapGuruModal", "click", () => {
    const m = document.getElementById("cetakRekapGuruModal");
    if (m) m.classList.add("hidden");
  });
  on("btnCetakRekapGuruSemua", "click", () => window.print());
  on("kepalaRekapTampilkan", "click", () => muatRekapGuru("kepala"));

  document
    .querySelectorAll(".guru-bottom-nav button")
    .forEach((btn) =>
      btn.addEventListener("click", () => gantiTabGuru(btn.dataset.tab)),
    );
}

function eyeIconSVG(off) {
  if (off)
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
  return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
/* =============================================================
   AUTENTIKASI
   ============================================================= */
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errBox = document.getElementById("loginError");
  errBox.classList.add("hidden");

  const btn = document.getElementById("loginSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Memeriksa...";
  try {
    const res = await runServer("login", username, password);
    if (res.success) {
      currentUser = res.user;
      localStorage.setItem("mtsAbsensiUser", JSON.stringify(currentUser));
      if (res.token) localStorage.setItem("mtsAbsensiToken", res.token);
      document.getElementById("loginForm").reset();
      masukKeDashboard();
    } else {
      errBox.innerHTML = icon("alert") + `<span>${esc(res.message)}</span>`;
      errBox.classList.remove("hidden");
    }
  } catch (err) {
    errBox.innerHTML = icon("alert") + `<span>${esc(err.message)}</span>`;
    errBox.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Masuk";
  }
}

function logout() {
  if (window.__clockInterval) {
    clearInterval(window.__clockInterval);
    window.__clockInterval = null;
  }
  currentUser = null;
  localStorage.removeItem("mtsAbsensiUser");
  localStorage.removeItem("mtsAbsensiToken");
  ["guruSection", "adminSection", "kepalaSection"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  const loginSection = document.getElementById("loginSection");
  if (loginSection) loginSection.classList.remove("hidden");
}

function updateGuruMarquee() {
  const wrapper = document.getElementById("guruMarqueeWrapper");
  const track = document.getElementById("guruMarqueeTrack");
  const primary = document.getElementById("guruSubtitlePrimary");
  const clone = document.getElementById("guruSubtitleClone");
  if (!wrapper || !track || !primary) return;

  if (clone) {
    const origMapel = document.getElementById("guruUserMapel");
    const cloneMapel = document.getElementById("guruUserMapelClone");
    if (origMapel && cloneMapel) cloneMapel.textContent = origMapel.textContent;
    const origName = primary.querySelector(".js-user-name");
    const cloneName = clone.querySelector(".js-user-name-clone");
    if (origName && cloneName) cloneName.textContent = origName.textContent;
  }

  requestAnimationFrame(() => {
    const isOverflowing = primary.scrollWidth > wrapper.clientWidth + 4;
    if (isOverflowing) {
      wrapper.classList.add("is-running");
      const speed = 28;
      const animDuration = Math.max(
        12,
        Math.round(primary.scrollWidth / speed),
      );
      track.style.animationDuration = animDuration + "s";
    } else {
      wrapper.classList.remove("is-running");
      track.style.animationDuration = "";
    }
  });
}

window.addEventListener("resize", updateGuruMarquee);
window.addEventListener("orientationchange", updateGuruMarquee);

function masukKeDashboard() {
  if (!currentUser) return;
  document
    .querySelectorAll(".js-user-name")
    .forEach((el) => (el.textContent = currentUser.namaLengkap));
  document
    .querySelectorAll(".js-user-avatar")
    .forEach(
      (el) =>
        (el.textContent = (currentUser.namaLengkap || "?")
          .trim()
          .charAt(0)
          .toUpperCase()),
    );
  if (currentUser.role === "guru" || currentUser.role === "staf") {
    document.getElementById("guruSection").classList.remove("hidden");
    document
      .querySelectorAll('.guru-bottom-nav button[data-tab="honor"]')
      .forEach((el) => {
        el.classList.remove("hidden");
        el.style.removeProperty("display");
      });
    const rincian =
      currentUser.role === "staf"
        ? "Tenaga Kependidikan / Staf"
        : [
            currentUser.mataPelajaran,
            currentUser.kelas && currentUser.kelas !== "-"
              ? "Kelas " + currentUser.kelas
              : "",
            currentUser.jamKe && currentUser.jamKe !== "-"
              ? "Jam ke-" + currentUser.jamKe
              : "",
          ]
            .filter(Boolean)
            .join(" \u00b7 ");
    document.getElementById("guruUserMapel").textContent =
      rincian || currentUser.mataPelajaran || "";
    const cloneMapel = document.getElementById("guruUserMapelClone");
    if (cloneMapel)
      cloneMapel.textContent = rincian || currentUser.mataPelajaran || "";
    const cloneName = document.querySelector(".js-user-name-clone");
    if (cloneName) cloneName.textContent = currentUser.namaLengkap;
    updateGuruMarquee();
    if (currentUser.role === "staf") {
      // Sembunyikan elemen khusus mengajar di dashboard absensi
      document
        .querySelectorAll(".guru-target-box")
        .forEach((el) => el.classList.add("hidden"));
      document
        .querySelectorAll('.guru-bottom-nav button[data-tab="jadwal"], .guru-bottom-nav button[data-tab="presensi"]')
        .forEach((el) => el.classList.add("hidden"));
      void perbaruiAksesPenggantiStaf();
    } else if (currentUser.role === "guru") {
      document
        .querySelectorAll('.guru-bottom-nav button[data-tab="jadwal"], .guru-bottom-nav button[data-tab="presensi"]')
        .forEach((el) => {
          el.classList.remove("hidden");
          el.style.removeProperty("display");
        });
      inisialisasiTargetJadwalGuru();
    }
    startClock();
    muatBadgeKonfirmasiPengganti();
    muatBadgeNotifikasiHonor();

    gantiTabGuru("absen");
  } else if (currentUser.role === "admin") {
    document.getElementById("adminSection").classList.remove("hidden");
    document.querySelectorAll(".js-user-role").forEach((el) => {
      if (el.closest("#adminSection")) el.textContent = "Administrator";
    });
    gantiTab("admin-dashboard");
  } else if (currentUser.role === "kepala") {
    document.getElementById("kepalaSection").classList.remove("hidden");
    document.querySelectorAll(".js-user-role").forEach((el) => {
      if (el.closest("#kepalaSection")) el.textContent = "Kepala Madrasah";
    });
    gantiTab("kepala-dashboard");
  }
  terapkanHakDirektoriUser();
  document.getElementById("loginSection").classList.add("hidden");
}

/* Direktori Guru hanya untuk admin dan kepala. Admin boleh mengelola (CRUD),
   kepala hanya monitoring sehingga tombol tambah/edit/hapus disembunyikan. */
function bisaKelolaUser() {
  return !!currentUser && currentUser.role === "admin";
}

function bisaLihatDirektoriUser() {
  return (
    !!currentUser &&
    (currentUser.role === "admin" || currentUser.role === "kepala")
  );
}

function terapkanHakDirektoriUser() {
  const nav = document.querySelector('[data-nav="admin-users"]');
  if (nav) nav.classList.toggle("hidden", !bisaLihatDirektoriUser());

  if (!bisaKelolaUser()) {
    const tambah = document.querySelector('button[onclick="bukaModalUser()"]');
    if (tambah) tambah.classList.add("hidden");
    const impor = document.getElementById("btnImporMassal");
    if (impor) impor.classList.add("hidden");
  }
}

/* =============================================================
   GANTI PASSWORD (SEMUA ROLE)
   ============================================================= */
function bukaModalGantiPassword() {
  document.getElementById("changePasswordForm").reset();
  document.getElementById("changePasswordModal").classList.remove("hidden");
}
async function handleGantiPassword(e) {
  e.preventDefault();
  const lama = document.getElementById("cpOldPassword").value;
  const baru = document.getElementById("cpNewPassword").value;
  const baru2 = document.getElementById("cpNewPassword2").value;
  if (baru !== baru2) {
    showToast("Konfirmasi password baru tidak cocok", "error");
    return;
  }
  showLoading("Menyimpan password baru...");
  try {
    const res = await runServer(
      "gantiPasswordSendiri",
      currentUser.username,
      lama,
      baru,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success)
      document.getElementById("changePasswordModal").classList.add("hidden");
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
/* =============================================================
   SUB-TAB PRESENSI GURU (LOG HARIAN & REKAP BULANAN)
   ============================================================= */
function subAdminPresensi(tab) {
  const tabLog = document.getElementById("adminPresensiTabLog");
  const tabRekap = document.getElementById("adminPresensiTabRekap");
  const btnLog = document.getElementById("navSubAdminPresensiLog");
  const btnRekap = document.getElementById("navSubAdminPresensiRekap");

  if (tabLog) tabLog.classList.toggle("hidden", tab !== "log");
  if (tabRekap) tabRekap.classList.toggle("hidden", tab !== "rekap");

  document
    .querySelectorAll("#adminWorkspaceNav .nav-sub-item")
    .forEach((el) => el.classList.remove("active"));

  if (btnLog) {
    btnLog.classList.toggle("active", tab === "log");
  }
  if (btnRekap) {
    btnRekap.classList.toggle("active", tab === "rekap");
  }

  if (tab === "log") muatDataAbsensiAdmin();
  if (tab === "rekap") {
    inisialisasiDefaultBulanTahun();
    muatRekapGuru("admin");
  }
}

function subKepalaPresensi(tab) {
  const tabLog = document.getElementById("kepalaPresensiTabLog");
  const tabRekap = document.getElementById("kepalaPresensiTabRekap");
  const btnLog = document.getElementById("navSubKepalaPresensiLog");
  const btnRekap = document.getElementById("navSubKepalaPresensiRekap");

  if (tabLog) tabLog.classList.toggle("hidden", tab !== "log");
  if (tabRekap) tabRekap.classList.toggle("hidden", tab !== "rekap");

  document
    .querySelectorAll("#kepalaWorkspaceNav .nav-sub-item")
    .forEach((el) => el.classList.remove("active"));

  if (btnLog) {
    btnLog.classList.toggle("active", tab === "log");
  }
  if (btnRekap) {
    btnRekap.classList.toggle("active", tab === "rekap");
  }

  if (tab === "log") muatDataAbsensiKepala();
  if (tab === "rekap") {
    inisialisasiDefaultBulanTahun();
    muatRekapGuru("kepala");
  }
}

/* =============================================================
   NAVIGASI TAB — ADMIN & KEPALA (sidebar/bottom-nav)
   ============================================================= */
// dipindahkan ke STATE di atas

// Cegah pemanggilan loader yang sama bertumpuk secara paralel (race saat tab
// diklik cepat berulang kali). Loader yang sama yang masih berjalan akan diabaikan.
// Opsi {cache:true} membuat loader hanya dijalankan SEKALI — saat tab dibuka lagi
// hasil sudah ada sehingga tidak fetch ulang (bukan data basi: panggil
// luapkanMuatan(kunci) setiap kali data berubah lewat aksi tulis).
function amankanMuatan(kunci, fn, opsi) {
  if (opsi && opsi.cache && __muatanCache.has(kunci)) return;
  if (__loaderBusy.has(kunci)) return;
  __loaderBusy.add(kunci);
  Promise.resolve()
    .then(fn)
    .then(() => {
      if (opsi && opsi.cache) __muatanCache.set(kunci, true);
    })
    .catch((err) => {
      if (window.__aksiBerjalan)
        showToast(
          err && err.message ? err.message : "Terjadi kesalahan",
          "error",
        );
    })
    .finally(() => __loaderBusy.delete(kunci));
}

// Tandai data daftar tertentu berubah; panggilan amankanMuatan berikutnya akan
// memuat ulang dari server.
function luapkanMuatan(kunci) {
  __muatanCache.delete(kunci);
}

function toggleWorkspaceCollapse(sectionId, button) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const collapsed = section.classList.toggle("workspace-collapsed");
  button?.setAttribute(
    "aria-label",
    collapsed ? "Perluas sidebar" : "Ciutkan sidebar",
  );
  button?.setAttribute(
    "title",
    collapsed ? "Perluas sidebar" : "Ciutkan sidebar",
  );
  if (button)
    button.innerHTML = collapsed
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
}

function toggleWorkspaceNav(sectionId, button) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const open = section.classList.toggle("workspace-nav-open");
  button?.setAttribute("aria-expanded", String(open));
}

function closeWorkspaceNav(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.classList.remove("workspace-nav-open");
  section
    .querySelectorAll(".workspace-menu-toggle, [data-role-menu]")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function gantiTab(tabId) {
  __tabAktif = tabId;
  if (tabId === "admin-rekap") {
    gantiTab("admin-absensi");
    subAdminPresensi("rekap");
    return;
  }
  if (tabId === "kepala-rekap") {
    gantiTab("kepala-absensi");
    subKepalaPresensi("rekap");
    return;
  }

  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => b.classList.toggle("active", b.dataset.nav === tabId));
  document
    .querySelectorAll("[data-panel]")
    .forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tabId));
  document
    .querySelectorAll(".nav-sub-item")
    .forEach((el) => el.classList.remove("active"));

  const roleSection = document.getElementById(
    tabId.startsWith("admin-") ? "adminSection" : "kepalaSection",
  );
  roleSection
    ?.querySelectorAll(".admin-bottom-nav [data-role-tab]")
    .forEach((button) => {
      const tabs = button.dataset.roleTab?.split(/\s+/) ?? [];
      button.classList.toggle("active", tabs.includes(tabId));
    });

  if (tabId.startsWith("admin-")) closeWorkspaceNav("adminSection");
  if (tabId.startsWith("kepala-")) closeWorkspaceNav("kepalaSection");

  if (tabId === "admin-dashboard")
    amankanMuatan("stat-admin", () => muatStatistik("admin"));
  if (tabId === "admin-absensi") subAdminPresensi("log");
  if (tabId === "admin-users")
    amankanMuatan("users", () => muatDaftarUser(), { cache: true });
  if (tabId === "admin-libur")
    amankanMuatan("libur", () => muatDaftarLibur(), { cache: true });
  if (tabId === "kepala-honor") amankanMuatan("honor", () => muatRekapHonor());
  if (tabId === "admin-jadwal") {
    amankanMuatan("jadwal", () => muatDaftarJadwal(), { cache: true });
    const j1 = document.getElementById("navAdminJadwal1");
    if (j1) j1.classList.add("active");
    const m1 = document.getElementById("navAdminMapel1");
    if (m1) m1.classList.remove("active");
  }
  if (tabId === "admin-pengaturan") {
    amankanMuatan("pengaturan", () => muatPengaturan());
    setTimeout(() => {
      if (typeof initGeofenceMap === "function") initGeofenceMap();
    }, 250);
  }
  if (tabId === "admin-siswa")
    amankanMuatan("siswa", () => muatAdminSiswa(), { cache: true });

  if (tabId === "kepala-dashboard")
    amankanMuatan("stat-kepala", () => muatStatistik("kepala"));
  if (tabId === "kepala-absensi") subKepalaPresensi("log");
  if (tabId === "kepala-jadwal")
    amankanMuatan("kJadwal", () => muatJadwalKepala(), { cache: true });
  if (tabId === "kepala-siswa")
    amankanMuatan("kSiswa", () => muatKepalaSiswa(), { cache: true });
  if (tabId === "kepala-izin")
    amankanMuatan("kepalaIzin", () => muatIzinApproval());
  if (tabId === "kepala-monitoring")
    amankanMuatan("kepalaMonitoring", () => muatMonitoringIzin());
  if (tabId === "admin-mapel") {
    amankanMuatan("masterMapel", () => muatDaftarMapel(), { cache: true });
    const m1 = document.getElementById("navAdminMapel1");
    if (m1) m1.classList.add("active");
    const j1 = document.getElementById("navAdminJadwal1");
    if (j1) j1.classList.remove("active");
  }
}

function gantiTabGuru(tabId) {
  __tabGuruAktif = tabId;
  document
    .querySelectorAll(".guru-bottom-nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document
    .getElementById("guruPanelAbsen")
    .classList.toggle("hidden", tabId !== "absen");
  document
    .getElementById("guruPanelJadwal")
    .classList.toggle("hidden", tabId !== "jadwal");
  document
    .getElementById("guruPanelRiwayat")
    .classList.toggle("hidden", tabId !== "riwayat");
  document
    .getElementById("guruPanelHonor")
    .classList.toggle("hidden", tabId !== "honor");
  document
    .getElementById("guruPanelPresensi")
    .classList.toggle("hidden", tabId !== "presensi");
  if (tabId === "absen") amankanMuatan("g-dash", () => muatDashboardGuru());
  if (tabId === "jadwal") amankanMuatan("g-jadwal", () => muatJadwalSaya());
  if (tabId === "riwayat") amankanMuatan("g-riwayat", () => muatRiwayatSaya());
  if (tabId === "honor") amankanMuatan("g-honor", () => muatRiwayatHonor());
  if (tabId === "presensi")
    amankanMuatan("g-presensi", () => muatPresensiGuru());
}

// Auto-refresh tab yang sedang aktif saat halaman kembali terlihat (me-refresh
// data yang mungkin basi saat tab browser lama tidak aktif).
function panggilUlangTabAktif() {
  if (!currentUser) return;
  if (currentUser.role === "guru" || currentUser.role === "staf") {
    if (currentUser.role === "staf") void perbaruiAksesPenggantiStaf();
    if (__tabGuruAktif) gantiTabGuru(__tabGuruAktif);
  } else if (__tabAktif) {
    gantiTab(__tabAktif);
  }
}
/* =============================================================
   JAM REAL-TIME (GURU)
   ============================================================= */
function startClock() {
  updateClock();
  clearInterval(window.__clockInterval);
  window.__clockInterval = setInterval(updateClock, 1000);
}
function updateClock() {
  const now = new Date();
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const tgl = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const elJam = document.getElementById("clockTime");
  const elTgl = document.getElementById("clockDate");
  if (elJam) elJam.textContent = jam;
  if (elTgl) elTgl.textContent = tgl;
}

/* =============================================================
   DASHBOARD GURU — STATUS & TOMBOL ABSEN
   ============================================================= */
/* =============================================================
   TARGET JAM MENGAJAR GURU (Sinkronisasi Otomatis dengan Jadwal)
   ============================================================= */
// Pemetaan Rentang Waktu Nyata Jam Pelajaran Madrasah (Prinsip IMK: Match Between System and Real World)
const JAMKE_WAKTU = {
  I: { label: "Jam Ke-I (07:00 - 07:40)", mulai: "07:00", selesai: "07:40" },
  II: { label: "Jam Ke-II (07:40 - 08:20)", mulai: "07:40", selesai: "08:20" },
  III: {
    label: "Jam Ke-III (08:20 - 09:00)",
    mulai: "08:20",
    selesai: "09:00",
  },
  IV: { label: "Jam Ke-IV (09:20 - 10:00)", mulai: "09:20", selesai: "10:00" },
  V: { label: "Jam Ke-V (10:00 - 10:40)", mulai: "10:00", selesai: "10:40" },
  VI: { label: "Jam Ke-VI (10:40 - 11:20)", mulai: "10:40", selesai: "11:20" },
  VII: {
    label: "Jam Ke-VII (11:20 - 12:00)",
    mulai: "11:20",
    selesai: "12:00",
  },
};

async function inisialisasiTargetJadwalGuru() {
  if (!currentUser || currentUser.role !== "guru") return;

  const mapelSel = document.getElementById("guruMapelSelect");
  const kelasSel = document.getElementById("guruKelasSelect");
  const jamKeSel = document.getElementById("guruJamKeSelect");
  const mapelManual = document.getElementById("guruMapelManual");
  const kelasManual = document.getElementById("guruKelasManual");
  const pillsEl = document.getElementById("guruJadwalHariIniPills");
  if (!mapelSel || !kelasSel || !jamKeSel) return;

  // 1. Ambil jadwal guru dari database
  let jadwalList = guruJadwalCache;
  if (!jadwalList) {
    try {
      const res = await runServer("getJadwalSaya", currentUser.username);
      jadwalList = (res && res.data) || [];
      guruJadwalCache = jadwalList;
    } catch (e) {
      jadwalList = [];
    }
  }

  // Sesi bisa saja berakhir saat request di atas masih berjalan.
  if (!currentUser) return;

  // 2. Identifikasi jadwal khusus hari ini
  const hariIni = __hariIndo(__tglTodayISO());
  const jadwalHariIni = (jadwalList || []).filter(
    (j) => String(j.hari || "").toUpperCase() === hariIni,
  );

  // 3. Kumpulkan semua Mata Pelajaran yang diajar guru
  const mapelSet = new Set();
  jadwalHariIni.forEach((j) => {
    if (j.mataPelajaran) mapelSet.add(j.mataPelajaran);
  });
  (jadwalList || []).forEach((j) => {
    if (j.mataPelajaran) mapelSet.add(j.mataPelajaran);
  });
  if (currentUser.mataPelajaran && currentUser.mataPelajaran !== "-")
    mapelSet.add(currentUser.mataPelajaran);
  if (currentUser.mapelDiizinkan) {
    currentUser.mapelDiizinkan
      .split(",")
      .map((m) => m.trim())
      .forEach((m) => {
        if (m) mapelSet.add(m);
      });
  }

  // Master mapel fallback jika jadwal belum disetting sama sekali
  const MASTER_MAPEL = [
    "Al-Qur'an Hadits",
    "Akidah Akhlak",
    "Aswaja",
    "Fiqih",
    "Sejarah Kebudayaan Islam (SKI)",
    "Bahasa Arab",
    "Nahwu",
    "PPKn",
    "Bahasa Indonesia",
    "Matematika",
    "IPA",
    "IPS",
    "Bahasa Inggris",
    "Seni Budaya",
    "PJOK",
    "Prakarya",
    "Informatika",
    "Bahasa Daerah",
  ];
  if (mapelSet.size === 0) {
    MASTER_MAPEL.forEach((m) => mapelSet.add(m));
  }

  // 4. Kumpulkan semua Kelas yang diajar guru
  const kelasSet = new Set();
  jadwalHariIni.forEach((j) => {
    if (j.kelas) kelasSet.add(j.kelas);
  });
  (jadwalList || []).forEach((j) => {
    if (j.kelas) kelasSet.add(j.kelas);
  });
  if (currentUser.kelas && currentUser.kelas !== "-")
    kelasSet.add(currentUser.kelas);

  const MASTER_KELAS = [
    "VII-A",
    "VII-B",
    "VII-C",
    "VII-D",
    "VII-E",
    "VIII-A",
    "VIII-B",
    "VIII-C",
    "VIII-D",
    "VIII-E",
    "IX-A",
    "IX-B",
    "IX-C",
    "IX-D",
    "IX-E",
  ];
  if (kelasSet.size === 0) {
    MASTER_KELAS.forEach((k) => kelasSet.add(k));
  }

  // 5. Isi opsi guruMapelSelect
  const mapelArr = Array.from(mapelSet);
  let mapelHtml =
    '<option value="" style="color:#000;">-- Pilih Mata Pelajaran --</option>';
  mapelArr.forEach((m) => {
    mapelHtml += `<option value="${esc(m)}" style="color:#000;">${esc(m)}</option>`;
  });
  mapelHtml +=
    '<option value="__lainnya__" style="color:#000;">Lainnya (ketik manual)...</option>';
  mapelSel.innerHTML = mapelHtml;

  // 6. Isi opsi guruKelasSelect
  const kelasArr = Array.from(kelasSet).sort();
  let kelasHtml = '<option value="" style="color:#000;">-- Kelas --</option>';
  kelasArr.forEach((k) => {
    kelasHtml += `<option value="${esc(k)}" style="color:#000;">${esc(k)}</option>`;
  });
  kelasHtml +=
    '<option value="__lainnya__" style="color:#000;">Lainnya (ketik manual)...</option>';
  kelasSel.innerHTML = kelasHtml;

  // 7. Isi opsi guruJamKeSelect (I s/d VII) dengan label rentang jam dinding nyata
  let jamKeHtml = "";
  const daftarJam =
    typeof JAMKE_URUT !== "undefined"
      ? JAMKE_URUT
      : ["I", "II", "III", "IV", "V", "VI", "VII"];
  daftarJam.forEach((jk) => {
    const info = JAMKE_WAKTU[jk];
    const label = info ? info.label : "Jam Ke-" + jk;
    jamKeHtml += `<option value="${esc(jk)}" style="color:#000;">${esc(label)}</option>`;
  });
  jamKeSel.innerHTML = jamKeHtml;

  function pilihSlotJadwal(slot) {
    if (
      slot.mataPelajaran &&
      Array.from(mapelSel.options).some((o) => o.value === slot.mataPelajaran)
    ) {
      mapelSel.value = slot.mataPelajaran;
      if (mapelManual) {
        mapelManual.value = "";
        mapelManual.classList.add("hidden");
      }
    } else if (slot.mataPelajaran) {
      mapelSel.value = "__lainnya__";
      if (mapelManual) {
        mapelManual.value = slot.mataPelajaran;
        mapelManual.classList.remove("hidden");
      }
    }

    if (
      slot.kelas &&
      Array.from(kelasSel.options).some((o) => o.value === slot.kelas)
    ) {
      kelasSel.value = slot.kelas;
      if (kelasManual) {
        kelasManual.value = "";
        kelasManual.classList.add("hidden");
      }
    } else if (slot.kelas) {
      kelasSel.value = "__lainnya__";
      if (kelasManual) {
        kelasManual.value = slot.kelas;
        kelasManual.classList.remove("hidden");
      }
    }

    if (
      slot.jamKe &&
      Array.from(jamKeSel.options).some((o) => o.value === slot.jamKe)
    ) {
      jamKeSel.value = slot.jamKe;
    }
  }

  // 8. Tampilkan Dropdown "Jadwal Hari Ini" jika ada jadwal
  let slotSelect = null;
  if (pillsEl) {
    if (jadwalHariIni.length > 0) {
      pillsEl.innerHTML =
        '<label style="font-size:12px; color:rgba(255,255,255,0.85); display:block; margin-bottom:4px; font-weight:600;" for="guruSlotHariIni">Jadwal Mengajar Hari Ini (' +
        jadwalHariIni.length +
        "):</label>" +
        '<select id="guruSlotHariIni" class="input" style="background:rgba(255,255,255,0.25); color:#fff; border-color:rgba(255,255,255,0.35); font-weight:500; margin-bottom:10px;">' +
        '<option value="" style="color:#000;">-- Pilih dari jadwal hari ini --</option>' +
        jadwalHariIni
          .map(
            (j, idx) =>
              '<option value="' +
              idx +
              '" style="color:#000;">Jam ' +
              esc(j.jamKe) +
              " &bull; " +
              esc(j.kelas) +
              " &bull; " +
              esc(j.mataPelajaran) +
              "</option>",
          )
          .join("") +
        "</select>";
      slotSelect = document.getElementById("guruSlotHariIni");
      slotSelect.addEventListener("change", () => {
        const idx = parseInt(slotSelect.value, 10);
        const slot = jadwalHariIni[idx];
        if (!isNaN(idx) && slot) pilihSlotJadwal(slot);
      });
    } else {
      pillsEl.innerHTML = "";
    }
  }

  // 9. Smart Auto-detect: Otomatis pilih slot jadwal yang aktif saat jam sekarang (IMK: Recognition over Recall)
  if (jadwalHariIni.length > 0) {
    const sekarang = new Date();
    const jamSekarangStr =
      String(sekarang.getHours()).padStart(2, "0") +
      ":" +
      String(sekarang.getMinutes()).padStart(2, "0");

    // Cari slot yang mencakup jam saat ini
    let slotCocok = jadwalHariIni.find((j) => {
      const w = JAMKE_WAKTU[j.jamKe];
      return w && jamSekarangStr >= w.mulai && jamSekarangStr <= w.selesai;
    });

    // Jika sedang jeda antar jam pelajaran, cari slot berikutnya yang terdekat
    if (!slotCocok) {
      slotCocok = jadwalHariIni.find((j) => {
        const w = JAMKE_WAKTU[j.jamKe];
        return w && jamSekarangStr < w.selesai;
      });
    }

    const slotTerpilih = slotCocok || jadwalHariIni[0];
    const idxTerpilih = jadwalHariIni.indexOf(slotTerpilih);

    if (slotSelect) slotSelect.value = String(idxTerpilih);
    pilihSlotJadwal(slotTerpilih);
  } else {
    // Jika hari ini tidak ada jadwal, gunakan profil user
    if (
      currentUser.mataPelajaran &&
      mapelArr.includes(currentUser.mataPelajaran)
    ) {
      mapelSel.value = currentUser.mataPelajaran;
      if (mapelManual) {
        mapelManual.value = "";
        mapelManual.classList.add("hidden");
      }
    }
    if (currentUser.kelas && kelasArr.includes(currentUser.kelas)) {
      kelasSel.value = currentUser.kelas;
      if (kelasManual) {
        kelasManual.value = "";
        kelasManual.classList.add("hidden");
      }
    }
    if (currentUser.jamKe && currentUser.jamKe !== "-") {
      jamKeSel.value = currentUser.jamKe;
    }
  }

  // 10. Handler perubahan dropdown Mapel: otomatis sesuaikan kelas & jam ke jika ada di jadwal
  mapelSel.onchange = function () {
    toggleManualInput("guruMapelSelect", "guruMapelManual");
    const selectedMapel = mapelSel.value;
    if (selectedMapel && selectedMapel !== "__lainnya__") {
      const matchHariIni = jadwalHariIni.find(
        (j) => j.mataPelajaran === selectedMapel,
      );
      const matchUmum = (jadwalList || []).find(
        (j) => j.mataPelajaran === selectedMapel,
      );
      const match = matchHariIni || matchUmum;
      if (match) {
        if (
          match.kelas &&
          Array.from(kelasSel.options).some((o) => o.value === match.kelas)
        ) {
          kelasSel.value = match.kelas;
          if (kelasManual) {
            kelasManual.value = "";
            kelasManual.classList.add("hidden");
          }
        }
        if (
          match.jamKe &&
          Array.from(jamKeSel.options).some((o) => o.value === match.jamKe)
        ) {
          jamKeSel.value = match.jamKe;
        }
      }
    }
  };

  kelasSel.onchange = function () {
    toggleManualInput("guruKelasSelect", "guruKelasManual");
  };
}

async function muatDashboardGuru() {
  const isStaf = currentUser && currentUser.role === "staf";
  if (!isStaf) {
    inisialisasiTargetJadwalGuru();
  }
  void muatJadwalBerandaGuru();
  const area = document.getElementById("guruStatusArea");
  const liburBanner = document.getElementById("guruLiburBanner");
  const jadwalBanner = document.getElementById("guruJadwalBanner");
  area.innerHTML = `<span class="status-pill muted">${icon("clock")} Memuat status...</span>`;
  const statusDate = document.getElementById("guruStatusDate");
  if (statusDate) {
    statusDate.textContent = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  try {
    const status = await runServer(
      "getStatusAbsensiHarian",
      currentUser.username,
    );
    window.__statusAbsensiHarian = status || {};

    const st = status.statusWaktu || "";
    const statusClass =
      {
        Hadir: "success",
        Izin: "neutral",
        Sakit: "warning",
        Cuti: "neutral",
        Alpa: "danger",
      }[st] || "neutral";
    const statusLabel = st || "Belum Presensi";
    const jamMasuk = status.jamMasuk
      ? String(status.jamMasuk).substring(0, 8)
      : "--:--:--";
    const jamPulang = status.jamPulang
      ? String(status.jamPulang).substring(0, 8)
      : "--:--:--";
    const keterlambatan =
      st === "Hadir" && status.terlambat
        ? `Terlambat ${Number(status.menitTerlambat) || 0} menit`
        : st === "Hadir"
          ? "Tepat waktu"
          : status.keterangan || "Belum ada catatan kehadiran";
    area.className = "guru-attendance-status";
    area.innerHTML = `
      <div class="guru-attendance-banner guru-attendance-${statusClass}">
        <span class="guru-attendance-status-icon" aria-hidden="true">${icon(st === "Hadir" ? "check" : "clock")}</span>
        <strong>${esc(statusLabel)}</strong>
        <span>${esc(keterlambatan)}</span>
      </div>
      <div class="guru-attendance-metrics">
        <div class="guru-attendance-metric">
          <span>Jam Masuk</span>
          <strong>${esc(jamMasuk)}</strong>
        </div>
        <div class="guru-attendance-metric">
          <span>Jam Pulang</span>
          <strong>${esc(jamPulang)}</strong>
        </div>
      </div>
      ${st && st !== "Hadir" && status.keterangan ? `<p class="guru-attendance-note">${esc(status.keterangan)}</p>` : ""}
    `;

    const libur = !!status.isHariLibur;
    if (liburBanner) {
      liburBanner.classList.toggle("hidden", !libur);
      if (libur)
        liburBanner.textContent =
          "Hari ini libur: " + (status.keteranganLibur || "");
    }
    if (jadwalBanner) jadwalBanner.classList.add("hidden");

    const btnMasuk = document.getElementById("btnAbsenMasuk");
    const bisaMasuk = !!status.bisaMasuk && !libur;
    const bisaPulang = !!status.bisaPulang && !libur;
    if (bisaPulang) {
      btnMasuk.dataset.jenis = "Pulang";
      btnMasuk.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 22px; height: 22px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg><span>Absen Pulang</span>`;
    } else {
      btnMasuk.dataset.jenis = "Masuk";
      btnMasuk.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 22px; height: 22px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><span>Buka Kamera &amp; Absen</span>`;
    }
    btnMasuk.disabled = !(bisaMasuk || bisaPulang);
    document.getElementById("btnAjukanIzin").disabled = libur;
    document.getElementById("guruKunciNote").classList.add("hidden");
  } catch (err) {
    area.className = "pill-row";
    area.innerHTML = `<span class="status-pill danger">Gagal memuat status</span>`;
    showToast(
      err && err.message ? err.message : "Gagal memuat status",
      "error",
    );
  }

  const noteEl = document.getElementById("guruMobileNote");
  noteEl.classList.toggle("hidden", isMobileDevice());
}

async function muatJadwalBerandaGuru() {
  const card = document.getElementById("guruHomeScheduleCard");
  if (!card || !currentUser) return;
  try {
    const res = await runServer("getJadwalSaya", currentUser.username);
    if (!res || res.success === false) {
      throw new Error((res && res.message) || "Gagal memuat jadwal mengajar.");
    }
    guruJadwalCache = res.data || [];
    const hariIni = __hariIndo(__tglTodayISO());
    const sesiHariIni = guruJadwalCache
      .filter((j) => String(j.hari || "").toUpperCase() === hariIni)
      .sort((a, b) => {
        return urutanJamJadwal(a.jamKe) - urutanJamJadwal(b.jamKe);
      });
    const menitSekarang = new Date().getHours() * 60 + new Date().getMinutes();
    const berikutnya = sesiHariIni.find((j) => {
      const periodeAwal = String(j.jamKe || "")
        .trim()
        .split(/\s*[-–]\s*/)[0]
        .toUpperCase();
      const mulai =
        JAMKE_WAKTU[periodeAwal] && JAMKE_WAKTU[periodeAwal].mulai;
      if (!mulai) return true;
      const [jam, menit] = mulai.split(":").map(Number);
      return jam * 60 + menit >= menitSekarang;
    });

    if (!sesiHariIni.length) {
      card.innerHTML = `
        <div class="guru-home-empty">
          <span class="guru-home-empty-icon" aria-hidden="true">${icon("calendar")}</span>
          <div><strong>Tidak ada jadwal hari ini</strong><p>Jadwal mengajar mingguan Anda dapat dilihat di tab Jadwal.</p></div>
        </div>`;
      return;
    }
    if (!berikutnya) {
      card.innerHTML = `
        <div class="guru-home-empty">
          <span class="guru-home-empty-icon" aria-hidden="true">${icon("check")}</span>
          <div><strong>Jadwal mengajar hari ini selesai</strong><p>Anda memiliki ${sesiHariIni.length} sesi mengajar hari ini.</p></div>
        </div>`;
      return;
    }

    const rentang = waktuJamJadwal(berikutnya.jamKe);
    const waktu = rentang
      ? rentang
      : `Jam ke-${esc(berikutnya.jamKe)}`;
    card.innerHTML = `
      <article class="guru-home-next-card">
        <div class="guru-home-period"><small>JAM KE</small><strong>${esc(berikutnya.jamKe)}</strong></div>
        <div class="guru-home-next-info">
          <div class="guru-home-class-time"><span>${esc(berikutnya.kelasNama || berikutnya.kelas || "Kelas")}</span><time>${waktu}</time></div>
          <h3>${esc(berikutnya.mataPelajaran || "Mata pelajaran")}</h3>
          ${berikutnya.penggantian ? `<p>Jadwal pengganti untuk ${esc(berikutnya.penggantianUntuk || "guru")}</p>` : ""}
          <div class="guru-home-next-actions">
            <span>${sesiHariIni.length} sesi hari ini</span>
            <button type="button" onclick="gantiTabGuru('presensi')">Buka presensi</button>
          </div>
        </div>
      </article>`;
  } catch (err) {
    console.error("Jadwal berikutnya guru gagal dimuat:", err);
    card.innerHTML = `
      <div class="guru-home-empty guru-home-error">
        <span class="guru-home-empty-icon" aria-hidden="true">${icon("alert")}</span>
        <div><strong>Jadwal tidak dapat dimuat</strong><p>Coba buka kembali tab ini untuk menyinkronkan jadwal.</p></div>
      </div>`;
  }
}

let riwayatSayaCache = [];

async function muatRiwayatSaya() {
  const list = document.getElementById("riwayatSayaList");
  if (!list) return;
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat riwayat...</div></div>`;

  // Default periode ke bulan dan tahun saat ini jika belum dipilih
  const now = new Date();
  const blnSel = document.getElementById("riwayatBulanSelect");
  const thnSel = document.getElementById("riwayatTahunSelect");
  if (blnSel && (!blnSel.value || blnSel.value === "all")) {
    blnSel.value = String(now.getMonth() + 1);
  }
  if (thnSel && (!thnSel.value || !/^\d{4}$/.test(thnSel.value))) {
    thnSel.value = String(now.getFullYear());
  }
  await muatRiwayatSayaPeriode();
}

async function muatRiwayatSayaPeriode() {
  const list = document.getElementById("riwayatSayaList");
  if (!list) return;
  const blnSel = document.getElementById("riwayatBulanSelect");
  const thnSel = document.getElementById("riwayatTahunSelect");
  const bulan =
    parseInt(blnSel && blnSel.value, 10) || new Date().getMonth() + 1;
  const tahun =
    parseInt(thnSel && thnSel.value, 10) || new Date().getFullYear();
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat riwayat...</div></div>`;
  try {
    const res = await runServer(
      "getRiwayatAbsensiHarian",
      "",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res || res.success === false) {
      riwayatSayaCache = [];
      showToast((res && res.message) || "Gagal memuat riwayat", "error");
    } else {
      riwayatSayaCache = res.data || [];
    }
    renderRiwayatSayaDenganFilter(bulan, tahun);
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${icon("alert")}<div class="t">Gagal memuat riwayat</div></div>`;
    showToast(
      err && err.message ? err.message : "Gagal memuat riwayat",
      "error",
    );
  }
}

function setRiwayatBulanIni() {
  const now = new Date();
  const blnSel = document.getElementById("riwayatBulanSelect");
  const thnSel = document.getElementById("riwayatTahunSelect");
  if (blnSel) blnSel.value = String(now.getMonth() + 1);
  if (thnSel) thnSel.value = String(now.getFullYear());
  muatRiwayatSayaPeriode();
}

function filterRiwayatSaya() {
  muatRiwayatSayaPeriode();
}

function renderRiwayatSayaDenganFilter(bulan, tahun) {
  const list = document.getElementById("riwayatSayaList");
  const statGrid = document.getElementById("riwayatStatGrid");
  if (!list) return;

  const blnSel = document.getElementById("riwayatBulanSelect");
  const thnSel = document.getElementById("riwayatTahunSelect");
  const selBulan =
    bulan || parseInt(blnSel && blnSel.value, 10) || new Date().getMonth() + 1;
  const selTahun =
    tahun || parseInt(thnSel && thnSel.value, 10) || new Date().getFullYear();
  const filtered = riwayatSayaCache || [];

  // Hitung akumulasi statistik (Prinsip IMK: Visibility of System Status)
  let totalHadir = 0;
  let tepatWaktu = 0;
  let terlambat = 0;
  let totalMenitTerlambat = 0;

  filtered.forEach((r) => {
    const st = (r.statusWaktu || "").toLowerCase();
    if (st === "hadir") {
      totalHadir++;
      if (r.statusTerlambat) {
        terlambat++;
        totalMenitTerlambat += r.menitTerlambat || 0;
      } else tepatWaktu++;
    }
  });

  if (statGrid) {
    statGrid.innerHTML = `
      <div class="riwayat-stat-card">
        <span class="stat-card-val stat-val-green">${totalHadir}</span>
        <span class="stat-card-lbl">Total Hadir</span>
      </div>
      <div class="riwayat-stat-card">
        <span class="stat-card-val stat-val-blue">${tepatWaktu}</span>
        <span class="stat-card-lbl">Tepat Waktu</span>
      </div>
      <div class="riwayat-stat-card">
        <span class="stat-card-val stat-val-amber">${terlambat}</span>
        <span class="stat-card-lbl">Terlambat</span>
      </div>
      <div class="riwayat-stat-card">
        <span class="stat-card-val stat-val-purple">${totalMenitTerlambat}</span>
        <span class="stat-card-lbl">Menit Terlambat</span>
      </div>
    `;
  }

  if (!filtered.length) {
    const namaBln = NAMA_BULAN[selBulan] || "";
    list.innerHTML = `<div class="empty-state">${icon("inbox")}<div class="t">Belum ada riwayat</div><div class="s">${namaBln ? "Tidak ada catatan presensi pada " + namaBln + " " + selTahun + "." : "Riwayat presensi Anda akan tampil di sini."}</div></div>`;
    return;
  }

  list.innerHTML = filtered
    .map((r) => {
      const st = r.statusWaktu || "";
      const pill =
        {
          Hadir: "ok",
          Izin: "muted",
          Sakit: "warn",
          Cuti: "muted",
          Alpa: "danger",
        }[st] || "muted";
      const jamMasuk = r.jamMasuk ? String(r.jamMasuk).substring(0, 5) : "-";
      const jamPulang = r.jamPulang ? String(r.jamPulang).substring(0, 5) : "-";
      const ketTambahan =
        st === "Hadir"
          ? r.statusTerlambat
            ? ` \u00b7 Terlambat ${r.menitTerlambat || 0} menit`
            : " \u00b7 Tepat waktu"
          : r.keterangan
            ? " \u00b7 " + esc(r.keterangan)
            : "";
      const foto = r.fotoMasuk || r.fotoPulang;
      return `
    <div class="riwayat-item">
      ${foto ? fotoThumbTag(foto, "thumb") : `<div class="thumb"></div>`}
      <div class="info">
        <div class="top">${esc(r.tanggal)} &middot; <span class="badge ${pill}">${esc(st || "Hadir")}</span></div>
        <div class="bottom">Masuk <strong>${esc(jamMasuk)}</strong> &middot; Pulang <strong>${esc(jamPulang)}</strong>${ketTambahan}</div>
        ${st === "Hadir" ? `<div class="bottom">Jarak: ${r.jarakMasuk != null ? r.jarakMasuk + "m" : "-"} masuk \u00b7 ${r.jarakPulang != null ? r.jarakPulang + "m" : "-"} pulang</div>` : ""}
      </div>
    </div>`;
    })
    .join("");
}

/* =============================================================
   ABSEN — KAMERA & GPS
   ============================================================= */
function bukaModalAbsen(jenis) {
  // Mobile check dilonggarkan agar bisa diuji coba dari Desktop maupun HP.
  // Jendela waktu ditentukan server lewat flag bisaMasuk/bisaPulang.
  const stAbsen = window.__statusAbsensiHarian || {};
  if (jenis === "Masuk" && stAbsen.bisaMasuk === false) {
    showToast("Absen masuk belum tersedia saat ini.", "error");
    return;
  }
  if (jenis === "Pulang" && stAbsen.bisaPulang === false) {
    showToast("Absen pulang belum tersedia saat ini.", "error");
    return;
  }
  jenisAbsenAktif = jenis;
  modeKamera = "absen";
  capturedPhoto = null;
  currentLocation = null;
  lokasiValidUntukAbsen = false;
  document.getElementById("modalAbsenTitle").textContent = "Absensi Kehadiran";
  resetTampilanKamera();
  document.getElementById("cameraModal").classList.remove("hidden");
  mulaiLiveKamera();

  const isStaf = currentUser && currentUser.role === "staf";

  updateLokasiStatus("mencari");
  ambilLokasi()
    .then((loc) => {
      currentLocation = loc;
      if (
        infoSekolahCache &&
        infoSekolahCache.latitudeSekolah != null &&
        infoSekolahCache.longitudeSekolah != null
      ) {
        const jarak = Math.round(
          hitungJarakClient(
            loc.lat,
            loc.lng,
            infoSekolahCache.latitudeSekolah,
            infoSekolahCache.longitudeSekolah,
          ),
        );
        const radius = infoSekolahCache.radiusMeter || 150;
        if (jarak > radius) {
          lokasiValidUntukAbsen = false;
          updateLokasiStatus(
            "error",
            `Di Luar Radius (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        } else {
          lokasiValidUntukAbsen = true;
          updateLokasiStatus(
            "ok",
            `Radius Aman (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        }
      } else {
        // Tanpa koordinat madrasah yang valid, kehadiran tidak boleh lolos begitu saja
        // (dipastikan dua kali: di klien maupun di server saat menyimpan).
        lokasiValidUntukAbsen = false;
        updateLokasiStatus(
          "error",
          "Koordinat madrasah belum diatur oleh admin.",
        );
      }
    })
    .catch((err) => {
      lokasiValidUntukAbsen = false;
      updateLokasiStatus("error", err.message, err.iframeIssue);
    });
}
/* =============================================================
   GURU — KONFIRMASI SEBAGAI GURU PENGGANTI
   ============================================================= */
async function muatBadgeKonfirmasiPengganti() {
  const badge = document.getElementById("badgeNotifikasiPengganti");
  const banner = document.getElementById("guruPenggantiAlertBanner");
  try {
    const res = await runServer("getPermintaanPengganti", "");
    daftarKonfirmasiPenggantiCache = (res && res.data) || [];
    const count = daftarKonfirmasiPenggantiCache.length;
    if (count > 0) {
      const ringkasan = document.getElementById("guruPenggantiBannerText");
      const pertama = daftarKonfirmasiPenggantiCache[0];
      if (ringkasan) {
        const tanggalMulai = formatTanggalPermintaanPengganti(
          pertama.tglMulai,
        );
        const tanggalSelesai = formatTanggalPermintaanPengganti(
          pertama.tglSelesai,
        );
        const periode =
          pertama.tglMulai === pertama.tglSelesai
            ? tanggalMulai
            : `${tanggalMulai} – ${tanggalSelesai}`;
        ringkasan.textContent =
          count === 1
            ? `Permintaan dari ${pertama.namaAsal || "guru asal"} untuk periode ${periode}.`
            : `Ada ${count} permintaan yang menunggu jawaban. Permintaan terdekat dari ${pertama.namaAsal || "guru asal"} untuk ${periode}.`;
      }
      if (badge) {
        badge.textContent = count;
        badge.classList.remove("hidden");
      }
      if (banner) {
        banner.classList.remove("hidden");
      }
    } else {
      if (badge) badge.classList.add("hidden");
      if (banner) banner.classList.add("hidden");
    }
  } catch (err) {
    console.error("Notifikasi guru pengganti gagal dimuat:", err);
  }
}
/* =============================================================
   GURU — RIWAYAT HONOR
   ============================================================= */
let riwayatHonorCache = [];

async function perbaruiAksesPenggantiStaf() {
  if (!currentUser || currentUser.role !== "staf") return;
  try {
    const res = await runServer("getJadwalSaya", currentUser.username);
    if (!res || !res.success) {
      throw new Error((res && res.message) || "Gagal memuat jadwal pengganti.");
    }
    if (!currentUser || currentUser.role !== "staf") return;
    const sedangMengganti = (res.data || []).some((j) => j.penggantian);
    document
      .querySelectorAll('.guru-bottom-nav button[data-tab="jadwal"], .guru-bottom-nav button[data-tab="presensi"]')
      .forEach((el) => el.classList.toggle("hidden", !sedangMengganti));
    if (
      !sedangMengganti &&
      (__tabGuruAktif === "jadwal" || __tabGuruAktif === "presensi")
    ) {
      gantiTabGuru("absen");
    }
  } catch (err) {
    console.error("Akses jadwal guru pengganti gagal dimuat:", err);
    showToast("Jadwal guru pengganti tidak dapat dimuat.", "error");
  }
}

async function muatBadgeNotifikasiHonor() {
  const badge = document.getElementById("badgeNotifikasiHonor");
  const btn = document.getElementById("btnNotifikasiHonor");
  try {
    const res = await runServer(
      "getRiwayatHonorPegawai",
      "",
      currentUser.username,
    );
    if (!res.success) return;
    riwayatHonorCache = res.data || [];
    const tersedia = riwayatHonorCache.filter(
      (r) => r.status === "Final",
    ).length;
    if (tersedia > 0) {
      if (badge) {
        badge.textContent = tersedia;
        badge.classList.remove("hidden");
      }
      if (btn) btn.classList.remove("hidden");
    } else {
      if (badge) badge.classList.add("hidden");
      if (btn) btn.classList.add("hidden");
    }
  } catch (err) {
    // Diam saja — bukan hal kritikal untuk sekadar badge notifikasi.
    console.warn(
      "Badge notifikasi honor gagal dimuat:",
      err && err.message ? err.message : err,
    );
  }
}

async function muatJadwalSaya() {
  const list = document.getElementById("jadwalSayaList");
  const kosong = document.getElementById("jadwalSayaKosong");
  const summary = document.getElementById("guruJadwalSummary");
  const status = document.getElementById("guruJadwalStatus");
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat jadwal...</div></div>`;
  if (status) status.textContent = "Memuat jadwal...";
  kosong.classList.add("hidden");
  try {
    const res = await runServer("getJadwalSaya", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      list.innerHTML = "";
      if (status) status.textContent = "Jadwal gagal dimuat";
      return;
    }
    const data = res.data || [];
    guruJadwalCache = data;
    if (status) {
      status.textContent = data.length ? "Ada jadwal" : "Belum ada jadwal";
    }
    if (summary) {
      summary.textContent = `${data.length} sesi per minggu`;
    }
    if (!data.length) {
      list.innerHTML = "";
      kosong.classList.remove("hidden");
      return;
    }

    const perHari = {};
    HARI_URUT.forEach((h) => {
      perHari[h] = [];
    });
    data.forEach((j) => {
      if (!perHari[j.hari]) perHari[j.hari] = [];
      perHari[j.hari].push(j);
    });
    list.innerHTML = Object.keys(perHari)
      .filter((h) => perHari[h].length)
      .map((h) => {
            const slot = perHari[h].slice().sort((a, b) => {
              return urutanJamJadwal(a.jamKe) - urutanJamJadwal(b.jamKe);
            });
            const waktuAwal = waktuJamJadwal(slot[0].jamKe).split("–");
            const waktuAkhir = waktuJamJadwal(slot[slot.length - 1].jamKe).split("–");
            const rentangHari =
              waktuAwal[0] && waktuAkhir.length > 1
                ? `${waktuAwal[0]}–${waktuAkhir[waktuAkhir.length - 1]}`
                : `${slot[0].jamKe}–${slot[slot.length - 1].jamKe}`;
            return `
              <section class="guru-day-card">
                <header class="guru-day-heading">
                  <div class="guru-day-name"><span></span><h3>${esc(h)}</h3><span class="guru-day-count">${slot.length} sesi</span></div>
                  <span class="guru-day-hours">${esc(rentangHari)}</span>
                </header>
                <div class="guru-day-sessions">
                  ${slot
                    .map((j) => {
                      const jam = waktuJamJadwal(j.jamKe);
                      const jamMulai = jam.split("–")[0] || "";
                      return `
                        <article class="guru-schedule-slot">
                          <div class="guru-slot-period"><small>JAM KE</small><strong>${esc(j.jamKe)}</strong>${jamMulai ? `<span>${jamMulai}</span>` : ""}</div>
                          <div class="guru-slot-info">
                            <h4>${esc(j.mataPelajaran)}</h4>
                            ${j.penggantian ? `<span class="guru-substitute-tag">Pengganti utk ${esc(j.penggantianUntuk)}${j.tanggal ? ` · ${esc(j.tanggal)}` : ""}</span>` : ""}
                            <span class="guru-slot-class">${esc(j.kelasNama || j.kelas)}</span>
                          </div>
                          ${jam ? `<span class="guru-slot-time">${jam}</span>` : ""}
                        </article>`;
                    })
                    .join("")}
                </div>
              </section>
            `;
          })
          .join("");
  } catch (err) {
    showToast(err.message, "error");
    list.innerHTML = "";
    kosong.classList.remove("hidden");
    if (status) status.textContent = "Jadwal gagal dimuat";
  }
}

function renderRiwayatHonorList() {
  const list = document.getElementById("riwayatHonorList");
  const kosong = document.getElementById("riwayatHonorKosong");
  if (!riwayatHonorCache || !riwayatHonorCache.length) {
    list.innerHTML = "";
    kosong.classList.remove("hidden");
    return;
  }
  kosong.classList.add("hidden");
  list.innerHTML = riwayatHonorCache
    .map((r) => {
      const final = r.status === "Final";
      const pill = final
        ? '<span class="pay-seen-pill">Final</span>'
        : '<span class="pay-new-pill">Draft</span>';
      return `
    <div class="honor-pay-card" ${final ? `onclick="bukaSlipHonorSaya(${r.bulan}, ${r.tahun})"` : 'style="opacity:.75; cursor:default;"'}>
      <div class="pay-card-header">
        <div class="pay-card-period">
          <span class="pay-period-badge">${esc(NAMA_BULAN[r.bulan])} ${r.tahun}</span>
          ${pill}
        </div>
        <div class="pay-status-badge verified">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>${final ? "Diverifikasi Kepala" : "Menunggu Finalisasi"}</span>
        </div>
      </div>
      <div class="pay-card-body">
        <div class="pay-card-date">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${r.totalSesi || 0} sesi \u00b7 ${formatRupiah(r.totalHonor || 0)}</span>
        </div>
        <div class="pay-card-action">
          <span>${final ? "Lihat Slip Honor" : "Belum difinalisasi"}</span>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    </div>`;
    })
    .join("");
}

async function muatRiwayatHonor() {
  const list = document.getElementById("riwayatHonorList");
  const kosong = document.getElementById("riwayatHonorKosong");
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat riwayat...</div></div>`;
  kosong.classList.add("hidden");
  try {
    const res = await runServer(
      "getRiwayatHonorPegawai",
      "",
      currentUser.username,
    );
    if (!res.success) {
      showToast(res.message, "error");
      list.innerHTML = "";
      return;
    }
    riwayatHonorCache = res.data || [];
    renderRiwayatHonorList();
  } catch (err) {
    showToast(err.message, "error");
    list.innerHTML = "";
    kosong.classList.remove("hidden");
  }
}

async function bukaSlipHonorSaya(bulan, tahun) {
  document
    .getElementById("slipHonorPrintArea")
    .classList.remove("mode-slip-gaji");
  document.getElementById("ukuranKertasCetak").textContent = "";
  showLoading("Memuat slip...");
  try {
    const res = await runServer(
      "getSlipHonorBaru",
      "",
      currentUser.username,
      bulan,
      tahun,
    );
    hideLoading();
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const d = res.data || res;
    document.getElementById("slipHonorPeriode").textContent =
      "Periode: " + NAMA_BULAN[bulan] + " " + tahun;
    document.getElementById("slipHonorNama").textContent = d.namaLengkap;
    document.getElementById("slipHonorMapel").textContent = d.role || "-";
    document.getElementById("slipHonorStatus").textContent = d.status || "-";
    document.getElementById("slipHonorJumlahJam").textContent =
      (d.jumlahJam != null ? d.jumlahJam : 0) + " jam";
    document.getElementById("slipHonorTarif").textContent =
      (d.jumlahSesi != null ? d.jumlahSesi : 0) + " sesi";
    document.getElementById("slipHonorMengajar").textContent = formatRupiah(
      d.totalHonor || 0,
    );
    document.getElementById("slipHonorTotal").textContent = formatRupiah(
      d.totalHonor || 0,
    );
    document.getElementById("slipHonorTtdGuru").textContent = d.namaLengkap;
    document.getElementById("slipHonorTtdKepala").textContent =
      d.namaKepala || "";

    const tbody = document.getElementById("slipHonorRincian");
    const kosong = document.getElementById("slipHonorKosong");
    const rincian = d.rincian || [];
    if (rincian.length) {
      tbody.parentElement.parentElement.classList.remove("hidden");
      kosong.classList.add("hidden");
      tbody.innerHTML = rincian
        .map((r) => {
          const jam = r.jamMulai
            ? r.jamMulai + (r.jamSelesai ? "-" + r.jamSelesai : "")
            : (r.durasiMenit || 0) + "m";
          const pres = [
            r.hadir != null ? "H:" + r.hadir : "",
            r.izin != null ? "I:" + r.izin : "",
            r.sakit != null ? "S:" + r.sakit : "",
            r.alpa != null ? "A:" + r.alpa : "",
            r.telat != null ? "T:" + r.telat : "",
          ]
            .filter((x) => x)
            .join(" ");
          const alasan =
            r.keterangan && r.persen <= 0
              ? ' <span class="muted-text">· ' + esc(r.keterangan) + "</span>"
              : "";
          return `
        <tr>
          <td data-label="Tanggal">${esc(r.tanggal)}</td>
          <td data-label="Mapel">${esc(r.mapel)}</td>
          <td data-label="Kelas">${esc(r.kelas)}</td>
          <td data-label="Jam">${esc(jam)}</td>
          <td data-label="Presensi">${esc(pres || "-")}</td>
          <td data-label="Nominal">${formatRupiah(r.nominal || 0)}${r.persen && r.persen < 100 ? ' <span class="muted-text">(' + r.persen + "%)</span>" : ""}${alasan}</td>
        </tr>`;
        })
        .join("");
    } else {
      tbody.parentElement.parentElement.classList.add("hidden");
      kosong.classList.remove("hidden");
      tbody.innerHTML = "";
    }

    document.getElementById("slipHonorModal").classList.remove("hidden");
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

let konfirmasiPenggantiTolakAktifId = null;

function formatTanggalPermintaanPengganti(tanggal) {
  const [hari, bulan, tahun] = String(tanggal || "").split("/");
  const namaBulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const bulanIndex = Number(bulan) - 1;
  if (!hari || !tahun || !namaBulan[bulanIndex]) return String(tanggal || "-");
  return `${Number(hari)} ${namaBulan[bulanIndex]} ${tahun}`;
}

function bukaModalDaftarKonfirmasiPengganti() {
  const list = document.getElementById("konfirmasiPenggantiList");
  const kosong = document.getElementById("konfirmasiPenggantiKosong");
  if (!list || !kosong) return;

  if (!daftarKonfirmasiPenggantiCache.length) {
    list.innerHTML = "";
    list.classList.add("hidden");
    kosong.classList.remove("hidden");
  } else {
    list.classList.remove("hidden");
    kosong.classList.add("hidden");
    list.innerHTML = daftarKonfirmasiPenggantiCache
      .map((item) => {
        const tanggalMulai = formatTanggalPermintaanPengganti(item.tglMulai);
        const tanggalSelesai = formatTanggalPermintaanPengganti(
          item.tglSelesai,
        );
        const tanggal =
          item.tglMulai === item.tglSelesai
            ? tanggalMulai
            : `${tanggalMulai} – ${tanggalSelesai}`;
        const sedangTolak =
          konfirmasiPenggantiTolakAktifId === String(item.id);
        const namaAsal = item.namaAsal || "Guru asal";
        const inisial = namaAsal
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((bagian) => bagian.charAt(0))
          .join("")
          .toUpperCase();
        return `
          <article class="guru-substitute-request" data-pengganti-id="${esc(item.id)}">
            <div class="guru-substitute-request-heading">
              <span class="guru-substitute-request-kind">${esc(item.jenis || "Penggantian mengajar")}</span>
              <span class="guru-substitute-request-status">Menunggu jawaban</span>
            </div>
            <section class="guru-substitute-profile" aria-label="Guru yang digantikan">
              <span class="guru-substitute-avatar" aria-hidden="true">${esc(inisial || "G")}</span>
              <div>
                <span class="guru-substitute-profile-label">Guru yang digantikan</span>
                <h3>${esc(namaAsal)}</h3>
              </div>
            </section>
            <section class="guru-substitute-period">
              <div class="guru-substitute-period-heading">
                <span>Periode permintaan</span>
                <strong>${esc(tanggal)}</strong>
              </div>
              <p>Periksa ketersediaan Anda pada tanggal tersebut sebelum memberi jawaban.</p>
            </section>
            ${
              item.alasan
                ? `<p class="guru-substitute-request-reason"><span>Alasan izin</span>${esc(item.alasan)}</p>`
                : ""
            }
            <p class="guru-substitute-guidance">Jika diterima, jadwal akan diperbarui dan presensi dilakukan saat mulai mengajar.</p>
            ${
              sedangTolak
                ? `<div class="guru-substitute-reject-confirm" role="group" aria-label="Konfirmasi penolakan">
                    <p>Tolak penugasan ini? Sesi tetap menjadi tanggung jawab guru asal.</p>
                    <div>
                      <button type="button" class="btn btn-outline" onclick="jawabPenggantiKlik('${escJs(item.id)}','Batal')">Kembali</button>
                      <button type="button" class="btn btn-danger" onclick="jawabPenggantiKlik('${escJs(item.id)}','Ditolak',true)">Tolak penugasan</button>
                    </div>
                  </div>`
                : `<div class="guru-substitute-request-actions">
                    <button type="button" class="btn btn-outline" onclick="jawabPenggantiKlik('${escJs(item.id)}','Ditolak')">Tolak</button>
                    <button type="button" class="btn btn-primary" onclick="jawabPenggantiKlik('${escJs(item.id)}','Diterima')">Terima penugasan</button>
                  </div>`
            }
            <p class="guru-substitute-request-feedback" aria-live="polite"></p>
          </article>`;
      })
      .join("");
  }
  document
    .getElementById("konfirmasiPenggantiListModal")
    .classList.remove("hidden");
}

async function jawabPenggantiKlik(penggantiId, jawab, tolakDikonfirmasi = false) {
  const id = String(penggantiId);
  if (jawab === "Batal") {
    konfirmasiPenggantiTolakAktifId = null;
    bukaModalDaftarKonfirmasiPengganti();
    return;
  }
  if (jawab === "Ditolak" && !tolakDikonfirmasi) {
    konfirmasiPenggantiTolakAktifId = id;
    bukaModalDaftarKonfirmasiPengganti();
    return;
  }
  if (cekAksiBerjalan()) return;

  const card = [...document.querySelectorAll(".guru-substitute-request")].find(
    (item) => item.dataset.penggantiId === id,
  );
  const buttons = card ? [...card.querySelectorAll("button")] : [];
  const feedback = card?.querySelector(".guru-substitute-request-feedback");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  if (feedback) feedback.textContent = "Mengirim jawaban...";
  if (card) card.setAttribute("aria-busy", "true");

  showLoading("Mengirim jawaban...");
  try {
    const res = await runServer("jawabPengganti", {
      username: currentUser.username,
      penggantiId: penggantiId,
      jawab: jawab,
    });
    hideLoading();
    if (!res.success) {
      showToast(res.message, "error");
      if (feedback) feedback.textContent = res.message || "Jawaban belum tersimpan.";
      buttons.forEach((button) => {
        button.disabled = false;
      });
      if (card) card.removeAttribute("aria-busy");
      return;
    }

    konfirmasiPenggantiTolakAktifId = null;
    daftarKonfirmasiPenggantiCache = daftarKonfirmasiPenggantiCache.filter(
      (item) => String(item.id) !== id,
    );
    showToast(
      jawab === "Diterima"
        ? "Penugasan diterima. Jadwal diperbarui; lakukan presensi saat mulai mengajar."
        : res.message,
      "success",
    );
    await muatBadgeKonfirmasiPengganti();
    bukaModalDaftarKonfirmasiPengganti();
    if (typeof muatDashboardGuru === "function") muatDashboardGuru();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
    if (feedback) feedback.textContent = err.message || "Jawaban gagal dikirim.";
    buttons.forEach((button) => {
      button.disabled = false;
    });
    if (card) card.removeAttribute("aria-busy");
  }
}

function bukaKonfirmasiPenggantiById(id) {
  const item = daftarKonfirmasiPenggantiCache.find(
    (x) => String(x.id) === String(id),
  );
  if (item) bukaModalKonfirmasiPengganti(item);
}

function bukaModalKonfirmasiPengganti(item) {
  // Mobile check dilonggarkan agar bisa diuji coba dari Desktop maupun HP
  modeKamera = "konfirmasi";
  konfirmasiPenggantiAktifId = item.id;
  konfirmasiPenggantiAktifIsRentang = !!(item.tipe === "rentang");
  capturedPhoto = null;
  currentLocation = null;
  lokasiValidUntukAbsen = false;
  document.getElementById("modalAbsenTitle").textContent =
    konfirmasiPenggantiAktifIsRentang
      ? "Konfirmasi Penggantian Rentang \u2014 " + item.namaGuruAsli
      : "Konfirmasi \u2014 " +
        item.mataPelajaran +
        " \u00b7 Kelas " +
        item.kelas +
        " \u00b7 Jam ke-" +
        item.jamKe;
  resetTampilanKamera();
  document
    .getElementById("konfirmasiPenggantiListModal")
    .classList.add("hidden");
  document.getElementById("cameraModal").classList.remove("hidden");
  mulaiLiveKamera();

  updateLokasiStatus("mencari");
  ambilLokasi()
    .then((loc) => {
      currentLocation = loc;
      if (
        infoSekolahCache &&
        infoSekolahCache.latitudeSekolah != null &&
        infoSekolahCache.longitudeSekolah != null
      ) {
        const jarak = Math.round(
          hitungJarakClient(
            loc.lat,
            loc.lng,
            infoSekolahCache.latitudeSekolah,
            infoSekolahCache.longitudeSekolah,
          ),
        );
        const radius = infoSekolahCache.radiusMeter || 150;
        if (jarak > radius) {
          lokasiValidUntukAbsen = false;
          updateLokasiStatus(
            "error",
            `Di Luar Radius (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        } else {
          lokasiValidUntukAbsen = true;
          updateLokasiStatus(
            "ok",
            `Radius Aman (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        }
      } else {
        // Tanpa koordinat madrasah yang valid, kehadiran tidak boleh lolos begitu saja
        // (dipastikan dua kali: di klien maupun di server saat menyimpan).
        lokasiValidUntukAbsen = false;
        updateLokasiStatus(
          "error",
          "Koordinat madrasah belum diatur oleh admin.",
        );
      }
    })
    .catch((err) => {
      lokasiValidUntukAbsen = false;
      updateLokasiStatus("error", err.message, err.iframeIssue);
    });
}

async function kirimKonfirmasiPengganti() {
  if (!capturedPhoto) {
    showToast("Silakan ambil foto terlebih dahulu", "error");
    return;
  }
  if (!currentLocation) {
    showToast("Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    return;
  }
  if (!lokasiValidUntukAbsen) {
    showToast(
      "Anda berada di luar radius sekolah. Konfirmasi tidak bisa dikirim dari lokasi ini.",
      "error",
    );
    return;
  }

  showLoading("Mengirim konfirmasi...");
  setSubmitAbsenState(true);
  try {
    const fn = konfirmasiPenggantiAktifIsRentang
      ? "konfirmasiPenggantiRentang"
      : "konfirmasiPengganti";
    const res = await runServer(fn, {
      id: konfirmasiPenggantiAktifId,
      username: currentUser.username,
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      fotoBase64: capturedPhoto,
    });
    setSubmitAbsenState(false);
    hideLoading();
    if (res.success) {
      tutupModalAbsen();
      showToast(res.message, "success");
      muatBadgeKonfirmasiPengganti();
      muatDashboardGuru();
      if (currentUser.role === "staf") {
        await perbaruiAksesPenggantiStaf();
      }
    } else {
      showToast(res.message, "error");
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function setSubmitAbsenState(loading) {
  const btn = document.getElementById("submitAbsenBtn");
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Mengirim...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
  }
}

function handleSubmitKamera() {
  if (modeKamera === "konfirmasi") kirimKonfirmasiPengganti();
  else kirimAbsensi();
}

let liveWebcamStream = null;

async function mulaiLiveKamera() {
  const video = document.getElementById("webcamVideo");
  const snapBtn = document.getElementById("btnSnapPhoto");
  const faceGuide = document.getElementById("faceGuideOval");
  const fallbackBox = document.getElementById("camFallbackBox");
  const capturedImg = document.getElementById("capturedImg");
  const fallbackUploadBtn = document.getElementById("btnFallbackUpload");

  // Reset tampilan
  capturedPhoto = null;
  if (capturedImg) {
    capturedImg.classList.add("hidden");
    capturedImg.src = "";
  }
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
  if (fallbackUploadBtn) fallbackUploadBtn.classList.remove("hidden");

  hentikanLiveKamera();

  // Jika browser tidak mendukung WebRTC getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    tampilkanFallbackUpload("Browser tidak mendukung kamera live.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    liveWebcamStream = stream;
    if (video) {
      video.srcObject = stream;
      video.classList.remove("hidden");
      await video.play();
    }
    if (snapBtn) snapBtn.classList.remove("hidden");
    if (faceGuide) faceGuide.classList.remove("hidden");
    if (fallbackBox) fallbackBox.classList.add("hidden");
  } catch (err) {
    console.warn("Live camera tidak dapat diakses:", err);
    tampilkanFallbackUpload("Izin kamera belum aktif atau diblokir.");
  }
}

function tampilkanFallbackUpload(alasan) {
  hentikanLiveKamera();
  const video = document.getElementById("webcamVideo");
  const snapBtn = document.getElementById("btnSnapPhoto");
  const faceGuide = document.getElementById("faceGuideOval");
  const fallbackBox = document.getElementById("camFallbackBox");

  if (video) video.classList.add("hidden");
  if (snapBtn) snapBtn.classList.add("hidden");
  if (faceGuide) faceGuide.classList.add("hidden");
  if (fallbackBox) fallbackBox.classList.remove("hidden");
}

function hentikanLiveKamera() {
  if (liveWebcamStream) {
    try {
      liveWebcamStream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    liveWebcamStream = null;
  }
  const video = document.getElementById("webcamVideo");
  if (video) {
    video.srcObject = null;
    video.classList.add("hidden");
  }
}

function jepretFotoLive() {
  const video = document.getElementById("webcamVideo");
  const canvas = document.getElementById("cameraCanvas");
  if (!video || !canvas) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Mirror flip horizontal agar sesuai dengan pratinjau cermin selfie
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  capturedPhoto = canvas.toDataURL("image/jpeg", 0.82);

  // Hentikan stream kamera
  hentikanLiveKamera();

  // Tampilkan foto hasil jepretan
  const img = document.getElementById("capturedImg");
  if (img) {
    img.src = capturedPhoto;
    img.classList.remove("hidden");
  }
  const snapBtn = document.getElementById("btnSnapPhoto");
  if (snapBtn) snapBtn.classList.add("hidden");
  const faceGuide = document.getElementById("faceGuideOval");
  if (faceGuide) faceGuide.classList.add("hidden");
  const fallbackUploadBtn = document.getElementById("btnFallbackUpload");
  if (fallbackUploadBtn) fallbackUploadBtn.classList.add("hidden");

  document.getElementById("retakeBtn").classList.remove("hidden");
  document.getElementById("submitAbsenBtn").classList.remove("hidden");
}

function bukaUploadFileFallback() {
  const input = document.getElementById("fotoInput");
  if (input) input.click();
}

function handleFotoInputChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow picking/retaking the same filename twice in a row
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("File yang dipilih bukan gambar", "error");
    return;
  }
  showLoading("Memproses foto...");
  resizeAndEncodeFoto(file, 720, 0.75)
    .then((dataUrl) => {
      hideLoading();
      hentikanLiveKamera();
      capturedPhoto = dataUrl;
      const fallbackBox = document.getElementById("camFallbackBox");
      if (fallbackBox) fallbackBox.classList.add("hidden");
      const snapBtn = document.getElementById("btnSnapPhoto");
      if (snapBtn) snapBtn.classList.add("hidden");
      const faceGuide = document.getElementById("faceGuideOval");
      if (faceGuide) faceGuide.classList.add("hidden");
      const fallbackUploadBtn = document.getElementById("btnFallbackUpload");
      if (fallbackUploadBtn) fallbackUploadBtn.classList.add("hidden");
      const img = document.getElementById("capturedImg");
      img.src = capturedPhoto;
      img.classList.remove("hidden");
      document.getElementById("retakeBtn").classList.remove("hidden");
      document.getElementById("submitAbsenBtn").classList.remove("hidden");
    })
    .catch((err) => {
      hideLoading();
      showToast("Gagal memproses foto: " + err.message, "error");
    });
}

function resizeAndEncodeFoto(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Tidak dapat membaca file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format gambar tidak didukung"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ambilUlangFoto() {
  capturedPhoto = null;
  document.getElementById("capturedImg").classList.add("hidden");
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
  mulaiLiveKamera();
}

function resetTampilanKamera() {
  capturedPhoto = null;
  hentikanLiveKamera();
  const img = document.getElementById("capturedImg");
  if (img) img.classList.add("hidden");
  const snapBtn = document.getElementById("btnSnapPhoto");
  if (snapBtn) snapBtn.classList.add("hidden");
  const faceGuide = document.getElementById("faceGuideOval");
  if (faceGuide) faceGuide.classList.add("hidden");
  const fallbackBox = document.getElementById("camFallbackBox");
  if (fallbackBox) fallbackBox.classList.add("hidden");
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
}

function tutupModalAbsen() {
  hentikanLiveKamera();
  const m = document.getElementById("cameraModal");
  if (m) m.classList.add("hidden");
  modeKamera = "absen";
  konfirmasiPenggantiAktifId = null;
}

function hitungJarakClient(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isDalamIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

function ambilLokasi() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Perangkat tidak mendukung GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        let msg = "Gagal mengambil lokasi";
        let iframeIssue = false;
        if (err.code === 1) {
          if (isDalamIframe()) {
            msg =
              "Lokasi diblokir karena halaman ini dibuka di dalam situs lain (mis. Google Sites), bukan karena pengaturan HP Anda.";
            iframeIssue = true;
          } else {
            msg =
              "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.";
          }
        } else if (err.code === 2)
          msg = "Lokasi tidak tersedia. Pastikan GPS aktif.";
        else if (err.code === 3)
          msg = "Waktu pengambilan lokasi habis. Coba lagi.";
        const errObj = new Error(msg);
        errObj.iframeIssue = iframeIssue;
        reject(errObj);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function segarGPSModal() {
  const btn = document.getElementById("btnRefreshGpsModal");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin-sm"></span> Mencari...`;
  }
  updateLokasiStatus("mencari");
  try {
    const loc = await ambilLokasi();
    currentLocation = loc;
    if (
      infoSekolahCache &&
      infoSekolahCache.latitudeSekolah != null &&
      infoSekolahCache.longitudeSekolah != null
    ) {
      const jarak = Math.round(
        hitungJarakClient(
          loc.lat,
          loc.lng,
          infoSekolahCache.latitudeSekolah,
          infoSekolahCache.longitudeSekolah,
        ),
      );
      const radius = infoSekolahCache.radiusMeter || 150;
      if (jarak > radius) {
        lokasiValidUntukAbsen = false;
        updateLokasiStatus(
          "error",
          `Di Luar Radius (${jarak}m dari madrasah · Toleransi ${radius}m)`,
        );
      } else {
        lokasiValidUntukAbsen = true;
        updateLokasiStatus(
          "ok",
          `Radius Aman (${jarak}m dari madrasah · Toleransi ${radius}m)`,
        );
      }
    } else {
      // Tanpa koordinat madrasah yang valid, kehadiran tidak boleh lolos begitu saja
      // (dipastikan dua kali: di klien maupun di server saat menyimpan).
      lokasiValidUntukAbsen = false;
      updateLokasiStatus(
        "error",
        "Koordinat madrasah belum diatur oleh admin.",
      );
    }
    showToast("Titik koordinat GPS berhasil diperbarui", "info");
  } catch (err) {
    lokasiValidUntukAbsen = false;
    updateLokasiStatus("error", err.message, err.iframeIssue);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg><span>Segarkan GPS</span>`;
    }
  }
}

function updateLokasiStatus(state, msg, tampilkanBukaTab) {
  const el = document.getElementById("locationStatus");
  if (!el) return;
  el.className = "location-status";
  if (state === "mencari") {
    el.classList.add("mencari");
    el.innerHTML = `<span class="spin-sm"></span> <span>Mencari sinyal GPS akurat...</span>`;
  } else if (state === "ok") {
    el.classList.add("ok");
    el.innerHTML = `<span class="gps-radar-chip in-radius"><span class="radar-pulse-dot green"></span> ${esc(msg || "Lokasi Terverifikasi")}</span>`;
  } else {
    el.classList.add("error");
    el.innerHTML =
      `<span class="gps-radar-chip out-radius"><span class="radar-pulse-dot red"></span> ${esc(msg || "Gagal mengambil lokasi")}</span>` +
      (tampilkanBukaTab
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="window.open(window.location.href, '_blank')" style="margin-left:8px;">Buka di Tab Baru</button>`
        : "");
  }
}

async function kirimAbsensi() {
  if (!capturedPhoto) {
    showToast("Silakan ambil foto terlebih dahulu", "error");
    return;
  }
  if (!currentLocation) {
    showToast("Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    return;
  }
  if (!lokasiValidUntukAbsen) {
    showToast(
      "Anda berada di luar radius sekolah. Absensi tidak bisa dikirim dari lokasi ini.",
      "error",
    );
    return;
  }

  showLoading("Mengirim absensi...");
  setSubmitAbsenState(true);
  try {
    const res = await runServer("catatAbsensiHarian", {
      username: currentUser.username,
      jenisAbsen: jenisAbsenAktif,
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      fotoBase64: capturedPhoto,
    });
    setSubmitAbsenState(false);
    hideLoading();
    if (res.success) {
      tutupModalAbsen();
      showToast(res.message, "success");
      muatDashboardGuru();
    } else {
      showToast(res.message, "error");
    }
  } catch (err) {
    setSubmitAbsenState(false);
    hideLoading();
    showToast(err.message, "error");
  }
}
/* =============================================================
   GURU — AJUKAN IZIN / SAKIT / CUTI
   ============================================================= */
async function bukaModalIzin() {
  document.getElementById("izinForm").reset();

  const isStaf = currentUser && currentUser.role === "staf";
  const targetEl = document.getElementById("izinTargetRincian");
  if (targetEl) {
    targetEl.textContent = isStaf
      ? "Izin Tenaga Kependidikan (tanpa jadwal mengajar), berlaku untuk seluruh hari pada rentang."
      : "Izin berlaku untuk seluruh sesi mengajar pada rentang tanggal yang dipilih.";
  }

  const sel = document.getElementById("izinGuruPengganti");
  const group = document.getElementById("izinGuruPenggantiGroup");
  const isBolehPengganti = currentUser && currentUser.izinkanGuruPengganti;

  if (isBolehPengganti) {
    if (group) group.classList.remove("hidden");
    sel.innerHTML = '<option value="">Memuat daftar guru...</option>';
  } else {
    if (group) group.classList.add("hidden");
    sel.innerHTML = '<option value="">- Tidak diizinkan -</option>';
  }

  document.getElementById("izinModal").classList.remove("hidden");
  if (isBolehPengganti) {
    try {
      const res = await runServer(
        "getDaftarGuruUntukPengganti",
        currentUser.username,
      );
      if (!res || !res.success || !Array.isArray(res.data)) {
        throw new Error(
          (res && res.message) || "Gagal memuat daftar guru pengganti",
        );
      }
      sel.innerHTML =
        (res.data.length
          ? '<option value="">- Tidak ada -</option>'
          : '<option value="">- Belum ada guru yang diizinkan -</option>') +
        res.data
          .map(
            (g) =>
              `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
          )
          .join("");
    } catch (err) {
      sel.innerHTML = '<option value="">- Gagal memuat daftar guru -</option>';
      showToast(err.message, "error");
    }
  }
}

async function handleAjukanIzin(e) {
  e.preventDefault();
  const jenis = document.getElementById("izinKategori").value;
  const alasan = document.getElementById("izinKeterangan").value.trim();
  if (!jenis) {
    showToast("Pilih kategori izin terlebih dahulu", "error");
    return;
  }
  const tMulai = document.getElementById("izinTanggalMulai").value;
  const tSelesai = document.getElementById("izinTanggalSelesai").value;
  if (!tMulai || !tSelesai) {
    showToast("Tanggal mulai dan selesai wajib diisi", "error");
    return;
  }
  if (tSelesai < tMulai) {
    showToast("Tanggal selesai tidak boleh sebelum tanggal mulai", "error");
    return;
  }
  const usernamePengganti = document.getElementById("izinGuruPengganti").value;
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer("ajukanIzin", {
      username: currentUser.username,
      jenis: jenis,
      alasan: alasan,
      tglMulai: formatTanggalISOtoIndo(tMulai),
      tglSelesai: formatTanggalISOtoIndo(tSelesai),
      guruPengganti: usernamePengganti || "",
    });
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("izinModal").classList.add("hidden");
      document.getElementById("izinTanggalMulai").value = "";
      document.getElementById("izinTanggalSelesai").value = "";
      if (typeof muatDashboardGuru === "function") muatDashboardGuru();
      if (typeof muatPermintaanPenggantiSaya === "function")
        muatPermintaanPenggantiSaya();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

// Konversi tanggal <input type="date"> (YYYY-MM-DD) ke format DD/MM/YYYY.
function formatTanggalISOtoIndo(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

let permintaanPenggantiCache = [];

async function muatPermintaanPenggantiSaya() {
  const listEl = document.getElementById("permintaanPenggantiSayaList");
  if (!listEl) return;
  try {
    listEl.innerHTML =
      '<p class="muted-text" style="margin:4px 0;">Memuat...</p>';
    const res = await runServer("getIzinSaya", "");
    if (!res.success) {
      listEl.innerHTML = `<p class="muted-text" style="margin:4px 0;">${esc(res.message || "Gagal memuat")}</p>`;
      return;
    }
    permintaanPenggantiCache = res.data || [];
    if (!permintaanPenggantiCache.length) {
      listEl.innerHTML =
        '<p class="muted-text" style="margin:4px 0;">Belum ada pengajuan izin.</p>';
      return;
    }
    let html = "";
    permintaanPenggantiCache.forEach((pr) => {
      const bg =
        pr.status === "Pending"
          ? "#fffbeb"
          : pr.status === "Disetujui"
            ? "#f0fdf4"
            : "#f1f5f9";
      html += `<div style="background:${bg}; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; margin-bottom:6px;">
        <div style="font-weight:600;">${esc(pr.jenis)} · ${esc(pr.tglMulai)} s.d. ${esc(pr.tglSelesai)}</div>
        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Status: <span style="color:#064e3b; font-weight:600;">${esc(pr.status)}</span>${pr.namaPengganti ? " \u00b7 Pengganti: " + esc(pr.namaPengganti) + " (" + esc(pr.statusPengganti || "-") + ")" : ""}</div>
        ${pr.alasan ? `<div style="font-size:11.5px; color:#475569; margin-top:2px;">${esc(pr.alasan)}</div>` : ""}
        ${pr.status === "Pending" ? `<button class="btn btn-outline" style="padding:3px 10px; font-size:11.5px; margin-top:6px;" onclick="batalkanIzinKlik(${pr.id})">Batalkan</button>` : ""}
      </div>`;
    });
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<p class="muted-text" style="margin:4px 0;">${esc(err.message)}</p>`;
  }
}

async function batalkanIzinKlik(izinId) {
  if (!confirm("Batalkan pengajuan izin ini?")) return;
  if (cekAksiBerjalan()) return;
  showLoading("Membatalkan...");
  try {
    const res = await runServer("batalkanIzin", {
      username: currentUser.username,
      izinId: izinId,
    });
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatPermintaanPenggantiSaya();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
/* =============================================================
   ADMIN + KEPALA — GRAFIK & ANALITIK STATISTIK (IMK OPTIMIZED)
   ============================================================= */
function showChartTooltip(e, title, items) {
  let tip = document.getElementById("chartFloatingTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "chartFloatingTooltip";
    tip.className = "chart-floating-tooltip hidden";
    document.body.appendChild(tip);
  }
  let html = `<div class="tip-header"><span>${esc(title)}</span><button type="button" class="tip-close" aria-label="Tutup detail kehadiran" onclick="hideChartTooltip()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>`;
  items.forEach((it) => {
    html += `<div class="tip-row"><span style="display:flex; align-items:center;"><span class="tip-dot" style="background:${it.color};"></span>${esc(it.label)}</span><strong>${esc(String(it.value))}</strong></div>`;
  });
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  moveChartTooltip(e);
}

function moveChartTooltip(e) {
  const tip = document.getElementById("chartFloatingTooltip");
  if (!tip || tip.classList.contains("hidden")) return;
  const pageX = e.pageX || (e.touches && e.touches[0] ? e.touches[0].pageX : 0);
  const pageY = e.pageY || (e.touches && e.touches[0] ? e.touches[0].pageY : 0);
  const tipRect = tip.getBoundingClientRect();
  const x = Math.max(
    10,
    Math.min(pageX + 14, window.innerWidth - tipRect.width - 20),
  );
  const y = Math.max(10, pageY - tipRect.height - 12);
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

function hideChartTooltip() {
  const tip = document.getElementById("chartFloatingTooltip");
  if (tip) tip.classList.add("hidden");
}

function handleBarHover(e, el) {
  try {
    const raw = el.getAttribute("data-tip");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    showChartTooltip(e, parsed.title, parsed.items);
  } catch (err) {}
}

function renderGrafikTrenMingguan(containerId, dataTren) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(dataTren) || !dataTren.length) {
    el.innerHTML =
      '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:12.5px;">Data tren mingguan belum tersedia</div>';
    return;
  }

  // Simpan data untuk re-render saat resize jendela / perubahan lebar kartu
  el.__trenData = dataTren;
  if (!el.__resizeObserver && typeof ResizeObserver !== "undefined") {
    el.__resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        const newH = Math.round(entry.contentRect.height);
        if (
          newW > 0 &&
          (Math.abs(newW - (el.__lastW || 0)) > 6 ||
            Math.abs(newH - (el.__lastH || 0)) > 6)
        ) {
          el.__lastW = newW;
          el.__lastH = newH;
          if (el.__trenData && el.isConnected) {
            renderGrafikTrenMingguan(containerId, el.__trenData);
          }
        }
      }
    });
    el.__resizeObserver.observe(el);
  }

  const rect = el.getBoundingClientRect();
  const clientW = Math.round(rect.width) || el.clientWidth || 640;
  const svgW = Math.max(380, clientW);
  const svgH = Math.max(220, Math.round(rect.height));
  const padTop = 26;
  const padBottom = 38;
  const chartH = svgH - padTop - padBottom;

  const padLeft = 44;
  const padRight = 16;
  const availW = Math.max(100, svgW - padLeft - padRight);

  // Responsif: hitung berapa bar yang muat berdasarkan rasio/lebar container (tiap kolom ~46px)
  const minColW = 46;
  const maxBars = Math.max(3, Math.floor(availW / minColW));

  // Tampilkan data seadanya yang muat di kartu (potong dari masa lalu jika melebihi kapasitas)
  const visibleData =
    dataTren.length > maxBars ? dataTren.slice(-maxBars) : dataTren;

  let maxVal = 1;
  visibleData.forEach((d) => {
    if (d.totalGuru > maxVal) maxVal = d.totalGuru;
    if (d.hadir > maxVal) maxVal = d.hadir;
  });

  const n = visibleData.length;
  // Distribusikan bar merata memenuhi lebar kartu sehingga tidak ada ruang kosong tersisa
  const colW = availW / Math.max(1, n);
  const barW = Math.min(40, Math.max(18, Math.round(colW * 0.54)));

  let gridLines = "";
  [0, 0.5, 1].forEach((pct) => {
    const yPos = padTop + chartH * (1 - pct);
    const labelVal = Math.round(maxVal * pct);
    gridLines += `
      <line x1="${padLeft - 8}" y1="${yPos}" x2="${svgW - padRight}" y2="${yPos}" stroke="#e2e8f0" stroke-dasharray="4,4" stroke-width="1" />
      <text x="${padLeft - 14}" y="${yPos + 4}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="end">${labelVal}</text>
    `;
  });

  let barsHtml = "";
  visibleData.forEach((d, i) => {
    const cx = padLeft + i * colW + colW / 2;
    const x = Math.round(cx - barW / 2);

    const tepatH = Math.round((d.tepatWaktu / maxVal) * chartH);
    const lambatH = Math.round((d.terlambat / maxVal) * chartH);
    const izinH = Math.round((d.izin / maxVal) * chartH);

    const baseBottom = padTop + chartH;
    const yTepat = baseBottom - tepatH;
    const yLambat = yTepat - lambatH;
    const yIzin = yLambat - izinH;
    const yTop = tepatH + lambatH + izinH > 0 ? yIzin : baseBottom;

    const activeHadir = d.hadir || 0;
    const isToday = i === n - 1;
    const persenBadge = d.persenHadir != null ? d.persenHadir + "%" : "0%";

    const tipData = JSON.stringify({
      title: `${d.hari}, ${d.tanggal}`,
      items: [
        {
          label: "Tepat Waktu",
          value: `${d.tepatWaktu} guru`,
          color: "#10b981",
        },
        { label: "Terlambat", value: `${d.terlambat} guru`, color: "#f59e0b" },
        { label: "Izin / Sakit", value: `${d.izin} guru`, color: "#3b82f6" },
        {
          label: "Belum Presensi",
          value: `${d.belumAbsen} guru`,
          color: "#ef4444",
        },
        {
          label: "Total Kehadiran",
          value: `${persenBadge} (${activeHadir}/${d.totalGuru})`,
          color: "#059669",
        },
      ],
    }).replace(/"/g, "&quot;");

    barsHtml += `
      <g class="tren-bar-group" data-tip="${tipData}" onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)">
        <!-- Stacked Segments -->
        ${tepatH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yTepat}" width="${barW}" height="${tepatH}" rx="${lambatH === 0 && izinH === 0 ? 7 : 3}" fill="#10b981" />` : ""}
        ${lambatH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yLambat}" width="${barW}" height="${lambatH}" rx="${izinH === 0 ? 7 : 3}" fill="#f59e0b" />` : ""}
        ${izinH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yIzin}" width="${barW}" height="${izinH}" rx="7" fill="#3b82f6" />` : ""}
        <!-- Value Badge Above Bar -->
        <text x="${cx}" y="${yTop - 6}" font-size="11" font-weight="700" fill="${isToday ? "#34d399" : activeHadir > 0 ? "var(--ink)" : "var(--slate-light)"}" text-anchor="middle">${activeHadir > 0 ? persenBadge : "-"}</text>
        <!-- Day & Date Label -->
        <text x="${cx}" y="${svgH - 20}" font-size="11.5" font-weight="${isToday ? "800" : "600"}" fill="${isToday ? "#34d399" : "var(--ink)"}" text-anchor="middle">${esc(d.hari.substring(0, 3))}</text>
        <text x="${cx}" y="${svgH - 6}" font-size="9.5" font-weight="500" fill="#94a3b8" text-anchor="middle">${esc(d.tanggal.substring(0, 5))}</text>
        ${isToday ? `<circle cx="${cx}" cy="${svgH - 1}" r="2" fill="#10b981" />` : ""}
      </g>
    `;
  });

  el.innerHTML = `
    <svg class="tren-chart-svg" viewBox="0 0 ${svgW} ${svgH}" style="width:100%; height:${svgH}px; display:block;">
      ${gridLines}
      ${barsHtml}
    </svg>
  `;
}

function renderGrafikLineKehadiran(containerId, dataTren, avgBadgeId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(dataTren) || !dataTren.length) {
    el.innerHTML =
      '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:12.5px;">Data tren kehadiran belum tersedia</div>';
    return;
  }

  // Simpan referensi data dan badge untuk re-render responsif saat jendela di-resize
  el.__trenData = dataTren;
  el.__avgBadgeId = avgBadgeId;
  if (!el.__resizeObserver && typeof ResizeObserver !== "undefined") {
    el.__resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        if (newW > 0 && Math.abs(newW - (el.__lastW || 0)) > 6) {
          el.__lastW = newW;
          if (el.__trenData && el.isConnected) {
            renderGrafikLineKehadiran(
              containerId,
              el.__trenData,
              el.__avgBadgeId,
            );
          }
        }
      }
    });
    el.__resizeObserver.observe(el);
  }

  const rect = el.getBoundingClientRect();
  const clientW = Math.round(rect.width) || el.clientWidth || 640;
  const svgW = Math.max(340, clientW);
  const svgH = 185;
  const padTop = 24;
  const padBottom = 34;
  const padLeft = 44;
  const padRight = 32;
  const chartW = svgW - padLeft - padRight;
  const chartH = svgH - padTop - padBottom;
  const baseBottom = padTop + chartH;

  // Responsif: tentukan jumlah data point berdasarkan lebar kartu
  const minPtDist = 48;
  const maxPts = Math.max(3, Math.floor(chartW / minPtDist));
  const visibleData =
    dataTren.length > maxPts ? dataTren.slice(-maxPts) : dataTren;
  const n = visibleData.length;

  // Hitung rata-rata persentase kehadiran
  let totalPersen = 0;
  visibleData.forEach((d) => {
    totalPersen += d.persenHadir || 0;
  });
  const avgPersen = n > 0 ? Math.round(totalPersen / n) : 0;
  if (avgBadgeId) {
    const badgeEl = document.getElementById(avgBadgeId);
    if (badgeEl) badgeEl.textContent = `Rata-rata: ${avgPersen}%`;
  }

  // Hitung titik koordinat (X, Y) untuk masing-masing data
  const pts = visibleData.map((d, i) => {
    const x = n === 1 ? padLeft + chartW / 2 : padLeft + (i / (n - 1)) * chartW;
    const pct = Math.max(
      0,
      Math.min(100, d.persenHadir != null ? d.persenHadir : 0),
    );
    const y = baseBottom - (pct / 100) * chartH;
    return {
      x,
      y,
      pct,
      d,
      isToday: i === n - 1,
    };
  });

  // Grid Lines horizontal (0%, 25%, 50%, 75%, 100%)
  let gridHtml = "";
  [0, 0.25, 0.5, 0.75, 1.0].forEach((p) => {
    const y = baseBottom - p * chartH;
    gridHtml += `
      <line class="line-grid-line" x1="${padLeft - 8}" y1="${y}" x2="${svgW - padRight}" y2="${y}" stroke="#f1f5f9" stroke-dasharray="${p === 0 ? "none" : "3,3"}" stroke-width="${p === 0 ? 1.5 : 1}" />
      <text x="${padLeft - 12}" y="${y + 3.5}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">${Math.round(p * 100)}%</text>
    `;
  });

  // Target Line 90% (Standar Kepatuhan Madrasah)
  const targetY = baseBottom - 0.9 * chartH;
  const targetLineHtml = `
    <line class="line-target-line" x1="${padLeft - 6}" y1="${targetY}" x2="${svgW - padRight + 2}" y2="${targetY}" stroke="#f59e0b" stroke-dasharray="4,4" stroke-width="1.5" />
    <rect class="line-target-badge-bg" x="${svgW - padRight - 36}" y="${targetY - 9}" width="38" height="18" rx="4" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
    <text class="line-target-badge-text" x="${svgW - padRight - 17}" y="${targetY + 4}" fill="#b45309" font-size="10" font-weight="700" text-anchor="middle">90%</text>
  `;

  // Bangun Bezier Spline
  let linePath = "";
  if (pts.length === 1) {
    linePath = `M ${pts[0].x} ${pts[0].y}`;
  } else if (pts.length === 2) {
    linePath = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  } else {
    linePath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      let cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      let cp2y = p2.y - (p3.y - p1.y) / 6;
      cp1y = Math.max(padTop - 2, Math.min(baseBottom + 2, cp1y));
      cp2y = Math.max(padTop - 2, Math.min(baseBottom + 2, cp2y));
      linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }

  // Area Path (Fill di bawah kurva)
  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  const areaPath = `${linePath} L ${lastPt.x.toFixed(1)} ${baseBottom} L ${firstPt.x.toFixed(1)} ${baseBottom} Z`;

  // Render Data Points, Hover Guides, Labels, and Tooltips
  let pointsHtml = "";
  pts.forEach((pt) => {
    const tipData = JSON.stringify({
      title: `${pt.d.hari}, ${pt.d.tanggal}`,
      items: [
        { label: "Tingkat Kehadiran", value: `${pt.pct}%`, color: "#10b981" },
        {
          label: "Hadir",
          value: `${pt.d.hadir} / ${pt.d.totalGuru} guru`,
          color: "#059669",
        },
        {
          label: "Tepat Waktu",
          value: `${pt.d.tepatWaktu} guru`,
          color: "#10b981",
        },
        {
          label: "Terlambat",
          value: `${pt.d.terlambat} guru`,
          color: "#f59e0b",
        },
        { label: "Izin / Sakit", value: `${pt.d.izin} guru`, color: "#3b82f6" },
        {
          label: "Belum Presensi",
          value: `${pt.d.belumAbsen} guru`,
          color: "#ef4444",
        },
      ],
    }).replace(/"/g, "&quot;");

    // Value text offset above circle
    const valY = Math.max(padTop + 8, pt.y - 10);

    pointsHtml += `
      <g class="line-chart-point-group" data-tip="${tipData}" onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)">
        <!-- Vertical guide line on hover -->
        <line class="line-hover-guide" x1="${pt.x}" y1="${padTop}" x2="${pt.x}" y2="${baseBottom}" stroke="#10b981" stroke-dasharray="3,3" stroke-width="1.5" />
        
        <!-- X Axis Labels -->
        <text x="${pt.x}" y="${svgH - 18}" font-size="11" font-weight="${pt.isToday ? "800" : "600"}" fill="${pt.isToday ? "#059669" : "#475569"}" class="${pt.isToday ? "is-today-text" : ""}" text-anchor="middle">${esc(pt.d.hari.substring(0, 3))}</text>
        <text x="${pt.x}" y="${svgH - 6}" font-size="9" font-weight="500" fill="#94a3b8" text-anchor="middle">${esc(pt.d.tanggal.substring(0, 5))}</text>
        
        <!-- Value Pill above point -->
        <text class="line-val-text ${pt.isToday ? "is-today-text" : ""}" x="${pt.x}" y="${valY}" font-size="10.5" font-weight="700" fill="${pt.isToday ? "#059669" : "#334155"}" text-anchor="middle">${pt.pct}%</text>

        <!-- Pulsing halo for today -->
        ${pt.isToday ? `<circle cx="${pt.x}" cy="${pt.y}" r="8" fill="rgba(16,185,129,0.3)" class="line-pulse-ring" />` : ""}
        
        <!-- Point Core Circle -->
        <circle class="line-point-core" cx="${pt.x}" cy="${pt.y}" r="4.5" fill="#ffffff" stroke="${pt.isToday ? "#059669" : "#10b981"}" stroke-width="2.5" />
        
        <!-- Hitbox for easy mouse / touch hover -->
        <circle cx="${pt.x}" cy="${pt.y}" r="18" fill="transparent" style="cursor: pointer;" />
      </g>
    `;
  });

  const gradId = `lineAreaGrad_${containerId}`;
  const filterId = `lineGlow_${containerId}`;

  el.innerHTML = `
    <svg class="line-chart-svg" viewBox="0 0 ${svgW} ${svgH}">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
          <stop offset="80%" stop-color="#10b981" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
        </linearGradient>
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#10b981" flood-opacity="0.32"/>
        </filter>
      </defs>
      ${gridHtml}
      ${targetLineHtml}
      <path d="${areaPath}" fill="url(#${gradId})" />
      <path d="${linePath}" fill="none" stroke="#10b981" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" filter="url(#${filterId})" />
      ${pointsHtml}
    </svg>
  `;
}

function renderGrafikDonutStatus(chartId, legendId, komp, totalGuru) {
  const chartEl = document.getElementById(chartId);
  const legendEl = document.getElementById(legendId);
  if (!chartEl || !legendEl) return;

  const total = totalGuru > 0 ? totalGuru : 1;
  const tepat = (komp && komp.tepatWaktu) || 0;
  const lambat = (komp && komp.terlambat) || 0;
  const izin = (komp && komp.izinSakitCuti) || 0;
  const belum = (komp && komp.belumAbsen) || 0;
  const hadir = tepat + lambat;
  const persenHadir = Math.round((hadir / total) * 100);

  const cx = 82.5;
  const cy = 82.5;
  const r = 56;
  const c = 2 * Math.PI * r;

  const segs = [
    {
      label: "Tepat Waktu",
      count: tepat,
      color: "#10b981",
      pct: Math.round((tepat / total) * 100),
    },
    {
      label: "Terlambat",
      count: lambat,
      color: "#f59e0b",
      pct: Math.round((lambat / total) * 100),
    },
    {
      label: "Izin / Sakit",
      count: izin,
      color: "#3b82f6",
      pct: Math.round((izin / total) * 100),
    },
    {
      label: "Belum Presensi",
      count: belum,
      color: "#ef4444",
      pct: Math.round((belum / total) * 100),
    },
  ];

  let accumulated = 0;
  let circlesHtml = "";

  segs.forEach((s) => {
    if (s.count > 0) {
      const len = (s.count / total) * c;
      const offset = c * 0.25 - accumulated;
      const tipData = JSON.stringify({
        title: s.label,
        items: [
          { label: "Jumlah Guru", value: `${s.count} orang`, color: s.color },
          { label: "Persentase", value: `${s.pct}%`, color: s.color },
        ],
      }).replace(/"/g, "&quot;");

      circlesHtml += `
        <circle class="donut-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="20"
          stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          data-tip="${tipData}"
          onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)" />
      `;
      accumulated += len;
    }
  });

  if (hadir === 0 && izin === 0) {
    circlesHtml = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="20" />`;
  }

  chartEl.innerHTML = `
    <svg viewBox="0 0 165 165" style="width:100%; height:100%; display:block;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="20" />
      ${circlesHtml}
      <text class="donut-center-text" x="${cx}" y="${cy - 7}" font-size="28" font-weight="800" fill="var(--ink)">${persenHadir}%</text>
      <text class="donut-center-text" x="${cx}" y="${cy + 15}" font-size="10" font-weight="700" fill="#64748b" letter-spacing="0.08em">HADIR</text>
    </svg>
  `;

  legendEl.innerHTML = segs
    .map(
      (s) => `
    <div class="legend-chip-item">
      <div style="display:flex; align-items:center; gap:9px;">
        <span style="width:10px; height:10px; border-radius:50%; background:${s.color}; flex-shrink:0; box-shadow:0 0 0 2px ${s.color}33;"></span>
        <span style="color:var(--slate); font-weight:600; font-size:12.5px;">${esc(s.label)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <strong style="font-size:13.5px; color:var(--ink);">${s.count}</strong>
        <span style="background:${s.color}15; color:${s.color}; font-size:11px; font-weight:700; padding:2px 7px; border-radius:6px;">${s.pct}%</span>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderDistribusiJamKedatangan(containerId, dist, batas) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const total = (dist && dist.totalMasuk) || 0;
  const items = [
    {
      label: "Sebelum 06:45 (Awal)",
      count: (dist && dist.sebelum0645) || 0,
      color: "#10b981",
    },
    {
      label: "06:45 – 07:00 (Optimal)",
      count: (dist && dist.jam0645_0700) || 0,
      color: "#059669",
    },
    {
      label: `07:00 – ${batas || "07:15"} (Mendekati Batas)`,
      count: (dist && dist.jam0700_batas) || 0,
      color: "#f59e0b",
    },
    {
      label: `Lewat ${batas || "07:15"} (Terlambat)`,
      count: (dist && dist.lewatBatas) || 0,
      color: "#ef4444",
    },
  ];

  if (total === 0) {
    el.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px;">Belum ada guru yang melakukan presensi hari ini.</div>';
    return;
  }

  el.innerHTML = items
    .map((it) => {
      const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
      return `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; margin-bottom:4px;">
          <span style="font-weight:600; color:var(--ink);">${esc(it.label)}</span>
          <span><strong style="color:var(--ink);">${it.count} guru</strong> <span style="color:var(--slate); font-size:10.5px;">(${pct}%)</span></span>
        </div>
        <div style="width:100%; height:7px; background:var(--line); border-radius:99px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:${it.color}; border-radius:99px; transition:width 0.4s ease;"></div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderKepatuhanLokasi(containerId, badgeId, lokasi) {
  const cEl = document.getElementById(containerId);
  const bEl = document.getElementById(badgeId);
  if (!cEl) return;

  const dalam = (lokasi && lokasi.dalamRadius) || 0;
  const luar = (lokasi && lokasi.luarRadius) || 0;
  const total = dalam + luar;
  const persenDalam =
    lokasi && lokasi.persenDalam != null ? Math.round(lokasi.persenDalam) : 100;

  if (bEl) {
    bEl.textContent = `${persenDalam}% Di Madrasah`;
    bEl.className =
      persenDalam >= 80
        ? "badge ok"
        : persenDalam >= 50
          ? "badge warn"
          : "badge danger";
  }

  if (total === 0) {
    cEl.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px;">Belum ada aktivitas presensi dengan koordinat GPS hari ini.</div>';
    return;
  }

  cEl.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:4px;">
        <span style="font-weight:600; color:var(--ink-green);">Di Lingkungan Madrasah (Radius Aman)</span>
        <strong style="color:var(--ink);">${dalam} guru (${persenDalam}%)</strong>
      </div>
      <div style="width:100%; height:10px; background:rgba(244, 63, 94, 0.18); border-radius:99px; overflow:hidden; display:flex;">
        <div style="width:${persenDalam}%; height:100%; background:#10b981; border-radius:99px 0 0 99px; transition:width 0.4s ease;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--slate); margin-top:6px;">
        <span>Luar Radius: <strong style="color:var(--ink);">${luar} guru</strong></span>
        <span>Total Terverifikasi GPS: <strong style="color:var(--ink);">${total}</strong></span>
      </div>
    </div>
  `;
}

function bangunStatistikDetailLokal(statHariIni, riwayatList, jamMasukBatas) {
  const totalGuru = Math.max(0, Number(statHariIni && statHariIni.totalGuru) || 0);
  const jadwalGuru =
    statHariIni && statHariIni.jadwalGuru && typeof statHariIni.jadwalGuru === "object"
      ? statHariIni.jadwalGuru
      : null;
  const guruPerHari = {};
  if (jadwalGuru) {
    Object.entries(jadwalGuru).forEach(([username, hariList]) => {
      if (!Array.isArray(hariList)) return;
      hariList.forEach((hari) => {
        const key = String(hari).trim().toLowerCase();
        if (!guruPerHari[key]) guruPerHari[key] = new Set();
        guruPerHari[key].add(username.toLowerCase());
      });
    });
  }
  const jumlahGuruTerjadwal = (hari) =>
    jadwalGuru
      ? (guruPerHari[String(hari).trim().toLowerCase()] || new Set()).size
      : totalGuru;
  const guruTerjadwal = (username, hari) =>
    !jadwalGuru ||
    (guruPerHari[String(hari).trim().toLowerCase()] || new Set()).has(
      String(username || "").toLowerCase(),
    );
  const hariNames = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const now = new Date();
  const todayStr =
    String(now.getDate()).padStart(2, "0") +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    now.getFullYear();

  function parseDateDDMMYYYY(str) {
    const p = String(str).split("/");
    if (p.length === 3) {
      return new Date(
        parseInt(p[2], 10),
        parseInt(p[1], 10) - 1,
        parseInt(p[0], 10),
      );
    }
    return new Date();
  }

  // Kumpulkan tanggal-tanggal yang ada data presensinya (seadanya data riwayat yang aktif)
  const dateSet = new Set();
  (riwayatList || []).forEach((r) => {
    if (r.tanggal) dateSet.add(r.tanggal);
  });
  // Hari ini selalu disertakan
  dateSet.add(todayStr);

  // Urutkan secara kronologis (dari terlama ke terbaru)
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    return parseDateDDMMYYYY(a).getTime() - parseDateDDMMYYYY(b).getTime();
  });

  // Tidak dibatasi jumlah hari — renderGrafikTrenMingguan yang akan menyesuaikan
  // berapa banyak hari yang muat berdasarkan lebar kartu/container secara responsif.
  const dates = sortedDates;

  const dateDayMap = {};
  dates.forEach((dStr) => {
    const dt = parseDateDDMMYYYY(dStr);
    dateDayMap[dStr] = hariNames[dt.getDay()];
  });

  const dataPerHari = {};
  dates.forEach((d) => {
    dataPerHari[d] = {};
  });

  (riwayatList || []).forEach((r) => {
    if (r.tanggal && dataPerHari[r.tanggal]) {
      if (!guruTerjadwal(r.username, dateDayMap[r.tanggal])) return;
      if (!dataPerHari[r.tanggal][r.username]) {
        dataPerHari[r.tanggal][r.username] = r;
      }
    }
  });

  const trenMingguan = dates.map((d) => {
    const userMap = dataPerHari[d] || {};
    let hadirCount = 0;
    let tepatCount = 0;
    let lambatCount = 0;
    let izinCount = 0;

    Object.values(userMap).forEach((rec) => {
      const st = String(rec.statusWaktu || "").toLowerCase();
      if (st === "hadir" || st === "tepat waktu") {
        const j = String(rec.jam || "").substring(0, 5);
        if (j && j > jamMasukBatas) lambatCount++;
        else tepatCount++;
        hadirCount++;
      } else if (st === "terlambat") {
        lambatCount++;
        hadirCount++;
      } else if (st === "izin" || st === "sakit" || st === "cuti") {
        izinCount++;
      }
    });

    const totalGuruHari =
      d === todayStr ? totalGuru : jumlahGuruTerjadwal(dateDayMap[d]);

    if (
      d === todayStr &&
      hadirCount === 0 &&
      statHariIni &&
      (statHariIni.hadirHariIni > 0 || statHariIni.izinSakitCuti > 0)
    ) {
      hadirCount = statHariIni.hadirHariIni || 0;
      izinCount = statHariIni.izinSakitCuti || 0;
      tepatCount = hadirCount;
      lambatCount = 0;
    }

    let belumCount = totalGuruHari - (hadirCount + izinCount);
    if (belumCount < 0) belumCount = 0;

    const persenHadir =
      totalGuruHari > 0 ? Math.round((hadirCount / totalGuruHari) * 100) : 0;

    return {
      tanggal: d,
      hari: dateDayMap[d],
      totalGuru: totalGuruHari,
      hadir: hadirCount,
      tepatWaktu: tepatCount,
      terlambat: lambatCount,
      izin: izinCount,
      belumAbsen: belumCount,
      persenHadir: persenHadir,
    };
  });

  const todayEntry =
    trenMingguan.find((t) => t.tanggal === todayStr) ||
    trenMingguan[trenMingguan.length - 1];
  let todayTepat = todayEntry.tepatWaktu;
  let todayLambat = todayEntry.terlambat;
  let todayIzin = todayEntry.izin;
  let todayBelum = todayEntry.belumAbsen;
  let todayHadir = todayEntry.hadir;

  if (
    todayHadir === 0 &&
    statHariIni &&
    (statHariIni.hadirHariIni > 0 || statHariIni.izinSakitCuti > 0)
  ) {
    todayHadir = statHariIni.hadirHariIni || 0;
    todayTepat = statHariIni.hadirHariIni || 0;
    todayIzin = statHariIni.izinSakitCuti || 0;
    todayBelum = statHariIni.belumAbsen || 0;
  }

  const persenHadir =
    totalGuru > 0 ? Math.round((todayHadir / totalGuru) * 100) : 0;

  const todayUserMap = dataPerHari[todayStr] || {};
  let jamAwal = 0;
  let jamOptimal = 0;
  let jamMendekati = 0;
  let jamLewat = 0;
  let lokasiDalam = 0;
  let lokasiLuar = 0;

  Object.values(todayUserMap).forEach((rec) => {
    const st = String(rec.statusWaktu || "").toLowerCase();
    if (st === "hadir" || st === "tepat waktu" || st === "terlambat") {
      const j = String(rec.jam || "").substring(0, 5);
      if (j) {
        if (j < "06:45") jamAwal++;
        else if (j <= "07:00") jamOptimal++;
        else if (j <= jamMasukBatas) jamMendekati++;
        else jamLewat++;
      }
      if (
        String(rec.statusLokasi || "")
          .toLowerCase()
          .includes("dalam")
      ) {
        lokasiDalam++;
      } else {
        lokasiLuar++;
      }
    }
  });

  if (jamAwal + jamOptimal + jamMendekati + jamLewat === 0 && todayHadir > 0) {
    jamOptimal = todayHadir;
  }
  if (lokasiDalam + lokasiLuar === 0 && todayHadir > 0) {
    lokasiDalam = todayHadir;
  }

  const totalLokasi = lokasiDalam + lokasiLuar;
  const persenDalam =
    totalLokasi > 0 ? Math.round((lokasiDalam / totalLokasi) * 100) : 100;

  return {
    totalGuru: totalGuru,
    jamMasukBatas: jamMasukBatas,
    isHariLibur: (statHariIni && statHariIni.isHariLibur) || false,
    keteranganLibur: (statHariIni && statHariIni.keteranganLibur) || "",
    trenMingguan: trenMingguan,
    komposisiHariIni: {
      tepatWaktu: todayTepat,
      terlambat: todayLambat,
      izinSakitCuti: todayIzin,
      belumAbsen: todayBelum,
      totalHadir: todayHadir,
      persenHadir: persenHadir,
      persenTepat:
        totalGuru > 0 ? Math.round((todayTepat / totalGuru) * 100) : 0,
      persenTerlambat:
        totalGuru > 0 ? Math.round((todayLambat / totalGuru) * 100) : 0,
      persenIzin:
        totalGuru > 0 ? Math.round((todayIzin / totalGuru) * 100) : 0,
      persenBelum:
        totalGuru > 0 ? Math.round((todayBelum / totalGuru) * 100) : 0,
    },
    distribusiJam: {
      sebelum0645: jamAwal,
      jam0645_0700: jamOptimal,
      jam0700_batas: jamMendekati,
      lewatBatas: jamLewat,
      totalMasuk: todayHadir,
    },
    kepatuhanLokasi: {
      dalamRadius: lokasiDalam,
      luarRadius: lokasiLuar,
      persenDalam: persenDalam,
    },
  };
}

async function muatStatistik(role) {
  const prefix = role === "admin" ? "admin" : "kepala";
  let detailData = null;
  let riwayatList = [];

  try {
    const resHariIni = await runServer(
      "getStatistikHariIni",
      currentUser.username,
    );
    if (resHariIni && resHariIni.success && resHariIni.data) {
      try {
        const resRiwayat = await runServer(
          "getRiwayatAbsensiSemua",
          currentUser.username,
          "",
          "",
          null,
        );
        if (
          resRiwayat &&
          resRiwayat.success &&
          Array.isArray(resRiwayat.data)
        ) {
          riwayatList = resRiwayat.data;
        }
      } catch (e) {}

      const jamMasukBatas =
        (infoSekolahCache && infoSekolahCache.jamMasukBatas) || "07:15";
      detailData = bangunStatistikDetailLokal(
        resHariIni.data,
        riwayatList,
        jamMasukBatas,
      );
    }
  } catch (err) {
    showToast(err.message, "error");
    return;
  }

  if (!detailData) return;

  const d = detailData;
  const komp = d.komposisiHariIni || {};

  const elTotal = document.getElementById(prefix + "StatTotal");
  if (elTotal) elTotal.textContent = d.totalGuru;

  const elHadir = document.getElementById(prefix + "StatHadir");
  if (elHadir)
    elHadir.textContent = komp.totalHadir != null ? komp.totalHadir : 0;

  const elIzin = document.getElementById(prefix + "StatIzin");
  if (elIzin)
    elIzin.textContent = komp.izinSakitCuti != null ? komp.izinSakitCuti : 0;

  const elBelum = document.getElementById(prefix + "StatBelum");
  if (elBelum)
    elBelum.textContent = komp.belumAbsen != null ? komp.belumAbsen : 0;

  const cardHadir = elHadir ? elHadir.closest(".stat-card") : null;
  if (cardHadir) {
    const sub = cardHadir.querySelector(".stat-card-sub");
    if (sub) sub.textContent = `${komp.persenHadir || 0}% persentase hadir`;
  }

  const liburBanner = document.getElementById(prefix + "LiburBanner");
  if (liburBanner) {
    liburBanner.classList.toggle("hidden", !d.isHariLibur);
    if (d.isHariLibur)
      liburBanner.textContent = "Hari ini libur: " + d.keteranganLibur;
  }

  // Render Visual Analytics (4 Grafik IMK)
  renderGrafikTrenMingguan(prefix + "TrenChart", d.trenMingguan);
  renderGrafikDonutStatus(
    prefix + "DonutChart",
    prefix + "DonutLegend",
    komp,
    d.totalGuru,
  );
  renderDistribusiJamKedatangan(
    prefix + "DistribusiJamBars",
    d.distribusiJam,
    d.jamMasukBatas,
  );
  renderKepatuhanLokasi(
    prefix + "KepatuhanLokasiContent",
    prefix + "LokasiPersenBadge",
    d.kepatuhanLokasi,
  );
  muatStatistikSiswa(prefix);
  renderGrafikLineKehadiran(
    prefix + "KehadiranLineChart",
    d.trenMingguan,
    prefix + "LineRataRataBadge",
  );

  const pillBatas = document.getElementById(prefix + "JamBatasPill");
  if (pillBatas)
    pillBatas.textContent = `Batas Masuk: ${d.jamMasukBatas || "07:15"}`;

  // Update Multi-Progress Bar & Stats (Both Admin & Kepala)
  const badge = document.getElementById(prefix + "KehadiranPersenBadge");
  if (badge) badge.textContent = `${komp.persenHadir || 0}% Terpenuhi`;

  const hariTglEl = document.getElementById(prefix + "KehadiranHariTgl");
  if (hariTglEl) {
    const todayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const nowD = new Date();
    hariTglEl.textContent = `${todayNames[nowD.getDay()]}, ${nowD.getDate()} ${monthNames[nowD.getMonth()]} ${nowD.getFullYear()}`;
  }

  const pHadir =
    d.totalGuru > 0 ? ((komp.totalHadir || 0) / d.totalGuru) * 100 : 0;
  const pIzin =
    d.totalGuru > 0 ? ((komp.izinSakitCuti || 0) / d.totalGuru) * 100 : 0;
  const pBelum = Math.max(0, 100 - pHadir - pIzin);

  const bHadir =
    document.getElementById(prefix + "ProgHadir") ||
    document.getElementById("progHadir");
  if (bHadir) bHadir.style.width = `${pHadir}%`;
  const bIzin =
    document.getElementById(prefix + "ProgIzin") ||
    document.getElementById("progIzin");
  if (bIzin) bIzin.style.width = `${pIzin}%`;
  const bBelum =
    document.getElementById(prefix + "ProgBelum") ||
    document.getElementById("progBelum");
  if (bBelum) bBelum.style.width = `${pBelum}%`;

  const lHadir =
    document.getElementById(prefix + "LblProgHadir") ||
    document.getElementById("lblProgHadir");
  if (lHadir) lHadir.textContent = `${komp.totalHadir || 0} guru`;
  const lIzin =
    document.getElementById(prefix + "LblProgIzin") ||
    document.getElementById("lblProgIzin");
  if (lIzin) lIzin.textContent = `${komp.izinSakitCuti || 0} guru`;
  const lBelum =
    document.getElementById(prefix + "LblProgBelum") ||
    document.getElementById("lblProgBelum");
  if (lBelum) lBelum.textContent = `${komp.belumAbsen || 0} guru`;

  // Update Admin Status Operasional Madrasah
  if (prefix === "admin") {
    const opTgl = document.getElementById("adminOpTanggal");
    if (opTgl) {
      const todayNames = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      const monthFull = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
      ];
      const nowD = new Date();
      opTgl.textContent = `${todayNames[nowD.getDay()]}, ${nowD.getDate()} ${monthFull[nowD.getMonth()]} ${nowD.getFullYear()}`;
    }

    const opStatus = document.getElementById("adminOpStatus");
    if (opStatus) {
      if (d.isHariLibur) {
        opStatus.textContent = "Hari Libur: " + (d.keteranganLibur || "Libur");
        opStatus.className = "status-ops-val is-red";
      } else {
        opStatus.textContent = "Hari Kerja Efektif";
        opStatus.className = "status-ops-val is-green";
      }
    }

    const opJam = document.getElementById("adminOpJam");
    if (opJam && infoSekolahCache) {
      const jm = infoSekolahCache.jamMasukBatas || "07:15";
      const jp = infoSekolahCache.jamPulangAwal || "16:00";
      opJam.textContent = `${jm}:00 - ${jp}:00`;
    }

    const opRad = document.getElementById("adminOpRadius");
    if (opRad && infoSekolahCache && infoSekolahCache.radiusMeter) {
      opRad.textContent = `${infoSekolahCache.radiusMeter} meter`;
    }
  }

  // Update Kepala dynamic elements (KBM Hari Ini & Tingkat Kehadiran Bulan Ini)
  if (prefix === "kepala") {
    const todayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const nowD = new Date();
    const namaHariIni = todayNames[nowD.getDay()];
    const tanggalLengkap = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(nowD);
    const elTanggalDashboard = document.getElementById("kepalaExecutiveDate");
    if (elTanggalDashboard) elTanggalDashboard.textContent = tanggalLengkap;
    const elTanggalKehadiran = document.getElementById(
      "kepalaKehadiranHariTgl",
    );
    if (elTanggalKehadiran) elTanggalKehadiran.textContent = tanggalLengkap;

    const elHariIniNama = document.getElementById("kepalaHariIniNama");
    if (elHariIniNama) elHariIniNama.textContent = namaHariIni;

    muatTopKehadiranKepala(riwayatList);
    muatKbmHariIniKepala(namaHariIni);
  }

  muatAktivitasHariIni(prefix);
}

function bukaRekapSiswaDashboard(prefix) {
  if (prefix === "admin") {
    gantiTab("admin-siswa");
    setTimeout(() => subAdminSiswa("rekap"), 0);
    return;
  }
  gantiTab("kepala-siswa");
}

async function muatStatistikSiswa(prefix) {
  const bodyId = prefix + "StatistikSiswaBody";
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML =
    '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:12.5px;">Memuat statistik kehadiran siswa...</div>';
  const d = new Date();
  const mulai = new Date(d.getTime() - 29 * 86400000);
  // Backend parseTanggalIndo expects DD/MM/YYYY format
  const fmtIndo = (x) =>
    String(x.getDate()).padStart(2, "0") +
    "/" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "/" +
    x.getFullYear();
  let res;
  try {
    res = await runServer("getStatistikKehadiranSiswa", currentUser.username, {
      tanggalMulai: fmtIndo(mulai),
      tanggalAkhir: fmtIndo(d),
    });
  } catch (e) {
    body.innerHTML =
      '<div style="text-align:center;padding:24px;color:#b91c1c;font-size:12.5px;">' +
      esc(e.message) +
      "</div>";
    return;
  }
  if (!res || !res.success || !res.data) {
    body.innerHTML =
      '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:12.5px;">' +
      ((res && res.message) || "Data tidak tersedia") +
      "</div>";
    return;
  }
  const data = res.data;
  const ring = data.ringkasan || {};
  const badge = document.getElementById(prefix + "SiswaPersenBadge");
  if (badge) badge.textContent = (ring.persenHadir || 0) + "% Hadir";
  const stat = [
    { l: "Hadir", v: ring.hadir || 0, c: "#047857" },
    { l: "Izin", v: ring.izin || 0, c: "#d97706" },
    { l: "Sakit", v: ring.sakit || 0, c: "#0284c7" },
    { l: "Alpa", v: ring.alpa || 0, c: "#be123c" },
    { l: "Terlambat", v: ring.telat || 0, c: "#7c3aed" },
    { l: "Total", v: ring.total || 0, c: "var(--ink)" },
  ]
    .map(
      (s) =>
        '<div style="flex:1;min-width:88px;background:var(--parchment-alt);border:1px solid var(--line);border-radius:12px;padding:10px 12px;">' +
        '<div style="font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.4px;">' +
        s.l +
        "</div>" +
        '<div style="font-size:20px;font-weight:800;color:' +
        s.c +
        ';margin-top:2px;">' +
        s.v +
        "</div></div>",
    )
    .join("");

  const perKelas = Array.isArray(data.perKelas) ? data.perKelas : [];
  const classCards = perKelas
    .map((kelas) => {
      const hadir = Number(kelas.hadir) || 0;
      const alpa = Number(kelas.alpa) || 0;
      const total = Number(kelas.total) || 0;
      return `<div class="kepala-student-class-row">
        <span class="kepala-student-class-code">${esc(kelas.label || "-")}</span>
        <span class="kepala-student-class-main">
          <strong>${esc(kelas.label || "Kelas")}</strong>
          <span>Total ${total.toLocaleString("id-ID")} presensi</span>
        </span>
        <span class="kepala-student-class-stats">
          <strong>${hadir.toLocaleString("id-ID")} Hadir</strong>
          <span>${alpa.toLocaleString("id-ID")} Alfa</span>
        </span>
        <button type="button" class="kepala-student-class-action" onclick="bukaRekapSiswaDashboard('${prefix}')" aria-label="Buka rekap siswa ${esc(kelas.label || "")}">
          Buka rekap <span aria-hidden="true">&rarr;</span>
        </button>
      </div>`;
    })
    .join("");

  body.innerHTML = `<div class="kepala-student-stat-grid">${stat}</div>
    <div class="kepala-student-class-heading">
      <strong>Rincian Per Rombel</strong>
      <span>${perKelas.length} rombel terdata</span>
    </div>
    <div class="kepala-student-class-list">
      ${classCards || '<div class="kepala-student-empty">Belum ada rincian kehadiran per rombel.</div>'}
    </div>`;
}

function muatTopKehadiranKepala(riwayatList) {
  const listEl = document.getElementById("kepalaTopKehadiranList");
  if (!listEl) return;

  const now = new Date();
  const curMonthStr =
    "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  // Kumpulkan presensi bulan ini per guru
  const guruMap = {};
  const activeDaysThisMonth = new Set();

  (riwayatList || []).forEach((r) => {
    if (r.tanggal && r.tanggal.endsWith(curMonthStr)) {
      activeDaysThisMonth.add(r.tanggal);
      if (!guruMap[r.username]) {
        guruMap[r.username] = {
          username: r.username,
          namaGuru: r.namaGuru || r.username,
          mapel: r.mataPelajaran || "-",
          hadir: 0,
          tepat: 0,
          terlambat: 0,
          izin: 0,
        };
      }
      if (r.statusWaktu === "Hadir") {
        guruMap[r.username].hadir++;
        guruMap[r.username].tepat++;
      } else if (r.statusWaktu === "Terlambat") {
        guruMap[r.username].hadir++;
        guruMap[r.username].terlambat++;
      } else if (r.statusWaktu === "Izin" || r.statusWaktu === "Sakit") {
        guruMap[r.username].izin++;
      }
    }
  });

  const totalDays = Math.max(1, activeDaysThisMonth.size);
  const teacherList = Object.values(guruMap);

  if (!teacherList.length) {
    listEl.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12.5px;">Data rekap presensi bulan ini belum tersedia</div>';
    return;
  }

  // Hitung persentase dan urutkan
  teacherList.forEach((t) => {
    t.persen = Math.min(100, Math.round((t.hadir / totalDays) * 100));
  });

  teacherList.sort((a, b) => {
    if (b.persen !== a.persen) return b.persen - a.persen;
    if (b.hadir !== a.hadir) return b.hadir - a.hadir;
    if (b.tepat !== a.tepat) return b.tepat - a.tepat;
    return a.namaGuru.localeCompare(b.namaGuru);
  });

  const top5 = teacherList.slice(0, 5);

  const rankBadges = [
    '<span title="Peringkat 1" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #fef3c7, #fde68a); border:1px solid #fcd34d; flex-shrink:0; box-shadow:0 1px 2px rgba(217,119,6,0.15);">🥇</span>',
    '<span title="Peringkat 2" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #f1f5f9, #e2e8f0); border:1px solid #cbd5e1; flex-shrink:0; box-shadow:0 1px 2px rgba(71,85,105,0.1);">🥈</span>',
    '<span title="Peringkat 3" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #ffedd5, #fed7aa); border:1px solid #fdba74; flex-shrink:0; box-shadow:0 1px 2px rgba(194,65,12,0.15);">🥉</span>',
    '<span title="Peringkat 4" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">4</span>',
    '<span title="Peringkat 5" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">5</span>',
  ];

  listEl.innerHTML = top5
    .map(
      (g, idx) => `
    <div style="display:flex; align-items:center; gap:10px; padding:7px 10px; background:var(--parchment); border:1px solid var(--line); border-radius:8px;">
      ${rankBadges[idx] || `<span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">${idx + 1}</span>`}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="font-size:12.5px; color:var(--ink); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.namaGuru)}</strong>
          <span style="font-size:12px; font-weight:800; color:#059669; flex-shrink:0; margin-left:6px;">${g.persen}%</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--slate); margin-bottom:4px;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.mapel)}</span>
          <span style="font-weight:600; flex-shrink:0;">${g.hadir}/${totalDays} Hari</span>
        </div>
        <div style="height:5px; background:var(--line); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${g.persen}%; background:linear-gradient(90deg, #10b981, #059669); border-radius:999px;"></div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

async function muatKbmHariIniKepala(namaHariIni) {
  const listEl = document.getElementById("kepalaKbmHariIniList");
  if (!listEl) return;

  listEl.innerHTML =
    '<div style="text-align:center; padding:18px; color:var(--slate); font-size:12px;"><span class="spin-sm"></span> Memuat jadwal KBM hari ini...</div>';

  try {
    if (!jadwalDataCache || !jadwalDataCache.length) {
      const res = await runServer("getDaftarJadwal", currentUser.username);
      if (res && res.success && Array.isArray(res.data)) {
        jadwalDataCache = res.data;
      }
    }

    const JAMKE_INDEX = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    };
    const jadwalHariIni = (jadwalDataCache || [])
      .filter(
        (j) => j.hari && j.hari.toLowerCase() === namaHariIni.toLowerCase(),
      )
      .sort(
        (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
      );

    if (!jadwalHariIni.length) {
      listEl.className = "kbm-empty-text";
      listEl.style.padding = "20px 0";
      listEl.style.color = "var(--slate)";
      listEl.textContent = `Tidak ada jadwal KBM aktif untuk hari ${namaHariIni}.`;
      return;
    }

    // Ambil data presensi hari ini untuk menentukan status guru mengajar
    const today = todayInputValue();
    let todayAbsenMap = {};
    try {
      const resToday = await runServer(
        "getRiwayatAbsensiSemua",
        currentUser.username,
        today,
        today,
        null,
      );
      if (resToday && resToday.success && Array.isArray(resToday.data)) {
        resToday.data.forEach((r) => {
          if (r.username) todayAbsenMap[r.username] = r;
        });
      }
    } catch (e) {}

    listEl.className = "";
    listEl.style.display = "flex";
    listEl.style.flexDirection = "column";
    listEl.style.gap = "6px";
    listEl.style.padding = "0";
    listEl.style.maxHeight = "270px";
    listEl.style.overflowY = "auto";
    listEl.style.paddingRight = "3px";

    listEl.innerHTML = jadwalHariIni
      .map((j) => {
        const r = todayAbsenMap[j.username];
        let statusHtml = "";
        if (r) {
          if (r.statusWaktu === "Hadir") {
            statusHtml =
              '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#059669; background:#dcfce7; border:1px solid #bbf7d0; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#10b981;"></span>Tepat Waktu</span>';
          } else if (r.statusWaktu === "Terlambat") {
            statusHtml =
              '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#f59e0b;"></span>Terlambat</span>';
          } else {
            statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#1d4ed8; background:#dbeafe; border:1px solid #bfdbfe; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#3b82f6;"></span>${esc(r.statusWaktu)}</span>`;
          }
        } else {
          statusHtml =
            '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:600; color:var(--slate); background:var(--parchment-alt); border:1px solid var(--line); padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#94a3b8;"></span>Belum Presensi</span>';
        }

        return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 10px; background:var(--parchment); border:1px solid var(--line); border-radius:8px;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            <span style="font-size:11px; font-weight:800; color:var(--ink); background:var(--parchment-alt); border:1px solid var(--line); padding:3px 6px; border-radius:5px; min-width:48px; text-align:center; flex-shrink:0;">Jam ${esc(j.jamKe)}</span>
            <div style="min-width:0;">
              <div style="font-size:12.5px; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${esc(j.mataPelajaran)} <span style="font-size:11px; font-weight:600; color:var(--slate);">· ${esc(j.kelas)}</span>
              </div>
              <div style="font-size:11px; color:var(--slate); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(j.namaGuru)}</div>
            </div>
          </div>
          <div style="flex-shrink:0;">${statusHtml}</div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    listEl.className = "kbm-empty-text";
    listEl.style.padding = "20px 0";
    listEl.textContent = "Gagal memuat jadwal KBM hari ini.";
  }
}

async function muatJadwalKepala() {
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  days.forEach((d) => {
    const listEl = document.getElementById("listJadwal" + d);
    if (listEl)
      listEl.innerHTML =
        '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:12px;"><span class="spin-sm"></span> Memuat...</div>';
  });

  try {
    const res = await runServer("getDaftarJadwal", currentUser.username);
    if (!res || !res.success || !Array.isArray(res.data)) {
      days.forEach((d) => {
        const listEl = document.getElementById("listJadwal" + d);
        if (listEl)
          listEl.innerHTML =
            '<div class="kbm-empty-text">Gagal memuat jadwal KBM.</div>';
      });
      return;
    }

    const jadwals = res.data;
    jadwalDataCache = jadwals;
    const JAMKE_INDEX = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    };

    days.forEach((hari) => {
      const dayJadwal = jadwals
        .filter((j) => j.hari && j.hari.toLowerCase() === hari.toLowerCase())
        .sort(
          (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
        );

      const badge = document.getElementById("badgeJadwal" + hari);
      if (badge) badge.textContent = `${dayJadwal.length} Jam`;

      const listEl = document.getElementById("listJadwal" + hari);
      if (!listEl) return;

      if (!dayJadwal.length) {
        listEl.className = "kbm-empty-text";
        listEl.textContent = "Tidak ada jadwal KBM.";
        return;
      }

      listEl.className = "kbm-day-list";
      listEl.innerHTML = dayJadwal
        .map(
          (j) => `
        <div class="kbm-item-card" style="padding:10px 12px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="kbm-jam-badge" style="font-size:11px; font-weight:800; color:#059669; background:#dcfce7; padding:2px 6px; border-radius:4px;">Jam ${esc(j.jamKe)}</span>
            <span class="kbm-kelas-badge" style="font-size:11px; font-weight:700; color:var(--slate); background:var(--parchment-alt); border:1px solid var(--line); padding:2px 6px; border-radius:4px;">${esc(j.kelas)}</span>
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--ink);">${esc(j.mataPelajaran)}</div>
          <div style="font-size:11.5px; color:var(--slate); margin-top:2px;">${esc(j.namaGuru)}</div>
        </div>
      `,
        )
        .join("");
    });
    terapkanFilterJadwalKepala();
  } catch (err) {
    days.forEach((d) => {
      const listEl = document.getElementById("listJadwal" + d);
      if (listEl)
        listEl.innerHTML =
          '<div class="kbm-empty-text">Terjadi kesalahan.</div>';
    });
  }
}

function pilihHariJadwalKepala(hari, tab) {
  const tabs = document.getElementById("kepalaJadwalDayTabs");
  if (!tabs || !tab) return;

  tabs.dataset.activeDay = hari;
  tabs.querySelectorAll("button").forEach((dayTab) => {
    const active = dayTab === tab;
    dayTab.classList.toggle("active", active);
    dayTab.setAttribute("aria-pressed", String(active));
  });
  terapkanFilterJadwalKepala();
}

function terapkanFilterJadwalKepala() {
  const grid = document.getElementById("kepalaJadwalWeekGrid");
  const tabs = document.getElementById("kepalaJadwalDayTabs");
  if (!grid || !tabs) return;

  const query = (
    document.getElementById("kepalaJadwalSearch")?.value || ""
  )
    .trim()
    .toLocaleLowerCase("id");
  const activeDay = (tabs.dataset.activeDay || "all").toLocaleLowerCase("id");
  let matchingSchedules = 0;

  grid.querySelectorAll(".kbm-day-card").forEach((card) => {
    const dayMatches =
      activeDay === "all" ||
      (card.dataset.day || "").toLocaleLowerCase("id") === activeDay;
    const scheduleItems = card.querySelectorAll(".kbm-item-card");
    let dayMatchesSearch = 0;

    scheduleItems.forEach((item) => {
      const matches =
        !query || item.textContent.toLocaleLowerCase("id").includes(query);
      item.hidden = !matches;
      if (matches) dayMatchesSearch += 1;
    });

    if (dayMatches) matchingSchedules += dayMatchesSearch;
    const visible = dayMatches && (!query || dayMatchesSearch > 0);
    card.style.display = visible ? "" : "none";
  });

  const emptyMessage = document.getElementById("kepalaJadwalSearchEmpty");
  if (emptyMessage) {
    emptyMessage.classList.toggle("hidden", !query || matchingSchedules > 0);
  }
}

function toggleKepalaJadwalDay(button) {
  const list = document.getElementById(button.getAttribute("aria-controls"));
  if (!list) return;

  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  list.hidden = expanded;
  button.closest(".kbm-day-card")?.classList.toggle("is-collapsed", expanded);
}

async function muatAktivitasHariIni(prefix) {
  const el = document.getElementById(prefix + "AktivitasList");
  if (!el) return;
  el.innerHTML =
    '<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#94a3b8;"><span class="spin-sm"></span> Memuat aktivitas hari ini...</td></tr>';
  try {
    const today = todayInputValue();
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      today,
      today,
      null,
    );
    if (!res.success) {
      el.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#ef4444;">${esc(res.message)}</td></tr>`;
      return;
    }
    if (!res.data.length) {
      el.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:36px 16px; color:#94a3b8;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px; height:32px; color:#cbd5e1;"><path d="M20 7h-7l-2-2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"></path></svg>
          <span style="font-size:13px; font-weight:500;">Belum ada aktivitas presensi hari ini.</span>
        </div>
      </td></tr>`;
      return;
    }
    el.innerHTML = res.data
      .slice(0, 8)
      .map(
        (r) => `
      <tr>
        <td data-label="Waktu" style="font-weight:600; font-family:monospace; font-size:13px;">${r.jam && String(r.jam).trim() ? esc(String(r.jam).substring(0, 5)) : '<span style="color:var(--slate);font-size:11px;">--:--</span>'}</td>
        <td data-label="Nama Guru"><strong>${esc(r.namaGuru)}</strong></td>
        <td data-label="Mapel / Kelas">${esc(r.mataPelajaran)}${r.kelas && r.kelas !== "-" ? " (" + esc(r.kelas) + ")" : ""}</td>
        <td data-label="Status">${badgeStatus(r.statusWaktu)}</td>
        <td data-label="Foto" style="text-align:center;">${r.fotoUrl ? fotoThumbTag(r.fotoUrl, "table-photo") : "-"}</td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    el.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#ef4444;">Gagal memuat aktivitas.</td></tr>';
  }
}
/* =============================================================
   ADMIN + KEPALA — DATA ABSENSI (tabel + filter + export)
   ============================================================= */
function renderTabelAbsensi(rows, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const wrap = document.getElementById(tbodyId + "Wrap");
  const empty = document.getElementById(tbodyId + "Empty");
  if (!rows.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td data-label="Foto">${r.fotoUrl ? fotoThumbTag(r.fotoUrl, "table-photo") : "-"}</td>
      <td data-label="Tanggal">${esc(r.tanggal)}</td>
      <td data-label="Jam">${esc(String(r.jam).substring(0, 5))}</td>
      <td data-label="Nama Guru">${esc(r.namaGuru)}</td>
      <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
      <td data-label="Kelas">${r.kelas && r.kelas !== "-" ? esc(r.kelas) : "-"}</td>
      <td data-label="Jam Ke">${r.jamKe && r.jamKe !== "-" ? esc(r.jamKe) : "-"}</td>
      <td data-label="Jenis">${badgeJenis(r.jenisAbsen)}</td>
      <td data-label="Status">
        <div class="status-mini">
          <div class="status-mini-row">
            <span class="status-mini-label">Kehadiran</span>
            <span class="status-mini-value">
              ${badgeStatus(r.statusWaktu)}
            </span>
          </div>

          ${r.guruPengganti ? `
            <div class="status-mini-row">
              <span class="status-mini-label">Digantikan</span>
              <span class="status-mini-value">
                ${esc(r.guruPengganti)}
              </span>
            </div>

            ${labelKonfirmasiPengganti(r.statusKonfirmasiPengganti) ? `
              <div class="status-mini-row">
                <span class="status-mini-label">Konfirmasi</span>
                <span class="status-mini-value">
                  ${labelKonfirmasiPengganti(r.statusKonfirmasiPengganti)}
                </span>
              </div>
            ` : ""}
          ` : ""}
        </div>
      </td>
      <td data-label="Lokasi">${badgeLokasi(r.statusLokasi)}<br><span class="muted-text">${r.jarak} m</span>${r.latitude && r.longitude ? `<a href="${tautanMaps(r.latitude, r.longitude)}" target="_blank" rel="noopener" class="maps-link">${icon("pin")}Peta</a>` : ""}</td>
    </tr>
  `,
    )
    .join("");
}

async function isiFilterGuruDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.loaded) return;
  try {
    if (!daftarGuruCache.length) {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    }
    sel.innerHTML =
      '<option value="">Semua Guru</option>' +
      daftarGuruCache
        .map(
          (g) =>
            `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
        )
        .join("");
    sel.dataset.loaded = "1";
  } catch (err) {
    /* biarkan default */
  }
}

async function muatDataAbsensiAdmin() {
  const mulai = document.getElementById("adminFilterMulai").value;
  const akhir = document.getElementById("adminFilterAkhir").value;
  const guru = document.getElementById("adminFilterGuru").value;
  const status =
    (document.getElementById("adminFilterStatus") || {}).value || "";
  await isiFilterGuruDropdown("adminFilterGuru");
  try {
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      mulai,
      akhir,
      guru || null,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    window.__adminAbsensiCache = res.data || [];
    filterStatusAdmin(status);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatDataAbsensiKepala() {
  const mulai = document.getElementById("kepalaFilterMulai").value;
  const akhir = document.getElementById("kepalaFilterAkhir").value;
  const guru = document.getElementById("kepalaFilterGuru").value;
  const status =
    (document.getElementById("kepalaFilterStatus") || {}).value || "";
  await isiFilterGuruDropdown("kepalaFilterGuru");
  try {
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      mulai,
      akhir,
      guru || null,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    window.__kepalaAbsensiCache = res.data || [];
    filterStatusKepala(status);
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* =============================================================
   ADMIN + KEPALA — REKAP PER GURU
   ============================================================= */
let adminRekapDataCache = [];
let adminRekapModeAktif = null; // {tipe:'bulan', bulan, tahun} atau {tipe:'rentang', dari, sampai}

function renderTabelRekapGuru(prefix, data, cariTerm) {
  const tbody = document.getElementById(prefix + "RekapBody");
  const wrap = document.getElementById(prefix + "RekapBodyWrap");
  const empty = document.getElementById(prefix + "RekapBodyEmpty");
  const kosongCari = document.getElementById(prefix + "RekapCariKosong"); // hanya ada di admin

  if (!data.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    if (kosongCari) kosongCari.classList.add("hidden");
    return;
  }

  const term = (cariTerm || "").trim().toLowerCase();
  const tersaring = term
    ? data.filter((g) => g.namaLengkap.toLowerCase().indexOf(term) !== -1)
    : data;

  if (!tersaring.length) {
    wrap.classList.add("hidden");
    empty.classList.add("hidden");
    if (kosongCari) kosongCari.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  if (kosongCari) kosongCari.classList.add("hidden");

  tbody.innerHTML = tersaring
    .map(
      (g) => `
    <tr>
      <td data-label="Nama Guru"><strong>${esc(g.namaLengkap)}</strong></td>
      <td data-label="Jumlah Jam">${g.jumlahJam}</td>
      <td data-label="Hadir">${g.hadir} hari</td>
      <td data-label="Izin">${g.izin}</td>
      <td data-label="Sakit">${g.sakit}</td>
      <td data-label="Cuti">${g.cuti}</td>
      <td data-label="Alpa">${g.alpa > 0 ? `<span class="badge danger">${g.alpa}</span>` : `<span class="badge ok">0</span>`}</td>
      <td data-label="% Kehadiran (Jadwal)">${
        g.persenKehadiranJadwal === null ||
        g.persenKehadiranJadwal === undefined
          ? '<span class="muted-text">Belum ada jadwal</span>'
          : `<span class="badge ${g.persenKehadiranJadwal >= 90 ? "ok" : g.persenKehadiranJadwal >= 75 ? "warn" : "danger"}">${g.persenKehadiranJadwal}%</span> <span class="muted-text" style="font-size:11px;">(${g.hadirSesuaiJadwal}/${g.totalSeharusnyaJadwal})</span>`
      }</td>
      <td data-label="Rincian">${g._aksiHtml}</td>
    </tr>
  `,
    )
    .join("");
}

async function muatRekapGuru(role) {
  const prefix = role === "admin" ? "admin" : "kepala";
  inisialisasiDefaultBulanTahun();
  const bEl = document.getElementById(prefix + "RekapBulan");
  const tEl = document.getElementById(prefix + "RekapTahun");
  const now = new Date();
  const bulan = parseInt(bEl && bEl.value ? bEl.value : now.getMonth() + 1, 10);
  const tahun = parseInt(tEl && tEl.value ? tEl.value : now.getFullYear(), 10);
  try {
    const res = await runServer(
      "getRekapPerGuru",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const data = res.data.map((g) =>
      Object.assign({}, g, {
        _aksiHtml: `<button class="btn btn-outline btn-sm" onclick="bukaRincianRekapGuru('${escJs(g.username)}', ${bulan}, ${tahun})">Rincian</button>`,
      }),
    );
    if (prefix === "admin") {
      adminRekapDataCache = data;
      adminRekapModeAktif = { tipe: "bulan", bulan: bulan, tahun: tahun };
      const periodeEl = document.getElementById("adminRekapPeriodeAktif");
      if (periodeEl)
        periodeEl.textContent =
          "Menampilkan: " + NAMA_BULAN[bulan] + " " + tahun;
      renderTabelRekapGuru(
        "admin",
        data,
        document.getElementById("adminRekapCari").value,
      );
    } else {
      window.__kepalaRekapDataCache = data;
      renderTabelRekapGuru("kepala", data, "");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatRekapGuruRentang() {
  const dariInput = document.getElementById("adminRekapDari").value; // yyyy-MM-dd
  const sampaiInput = document.getElementById("adminRekapSampai").value;
  if (!dariInput || !sampaiInput) {
    showToast("Isi tanggal Dari dan Sampai terlebih dahulu", "error");
    return;
  }
  if (sampaiInput < dariInput) {
    showToast("Tanggal Sampai tidak boleh sebelum tanggal Dari", "error");
    return;
  }
  const formatTgl = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const dari = formatTgl(dariInput);
  const sampai = formatTgl(sampaiInput);
  try {
    const res = await runServer(
      "getRekapPerGuruRentang",
      currentUser.username,
      dari,
      sampai,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const data = res.data.map((g) =>
      Object.assign({}, g, {
        _aksiHtml: `<button class="btn btn-outline btn-sm" onclick="bukaRincianRekapGuruRentang('${escJs(g.username)}', '${escJs(dari)}', '${escJs(sampai)}')">Rincian</button>`,
      }),
    );
    adminRekapDataCache = data;
    adminRekapModeAktif = { tipe: "rentang", dari: dari, sampai: sampai };
    document.getElementById("adminRekapPeriodeAktif").textContent =
      "Menampilkan: " + dari + " s/d " + sampai;
    renderTabelRekapGuru(
      "admin",
      data,
      document.getElementById("adminRekapCari").value,
    );
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleCariRekapGuru() {
  if (!adminRekapModeAktif) return;
  renderTabelRekapGuru(
    "admin",
    adminRekapDataCache,
    document.getElementById("adminRekapCari").value,
  );
}

function bukaCetakRekapGuru() {
  if (!adminRekapDataCache.length) {
    showToast(
      "Belum ada data untuk dicetak. Tampilkan rekap terlebih dahulu.",
      "error",
    );
    return;
  }
  let periodeLabel = "";
  if (adminRekapModeAktif && adminRekapModeAktif.tipe === "bulan") {
    periodeLabel =
      NAMA_BULAN[adminRekapModeAktif.bulan] + " " + adminRekapModeAktif.tahun;
  } else if (adminRekapModeAktif && adminRekapModeAktif.tipe === "rentang") {
    periodeLabel =
      adminRekapModeAktif.dari + " s/d " + adminRekapModeAktif.sampai;
  }
  document.getElementById("cetakRekapGuruPeriode").textContent =
    "Periode: " + periodeLabel;
  document.getElementById("cetakRekapGuruTtdKepala").textContent =
    (infoSekolahCache && infoSekolahCache.namaKepala) || "";

  // Sengaja pakai adminRekapDataCache (bukan hasil tersaring pencarian nama) supaya
  // laporan resmi ke Kepala Madrasah selalu menampilkan SEMUA guru periode ini.
  document.getElementById("cetakRekapGuruBody").innerHTML = adminRekapDataCache
    .map(
      (g) => `
    <tr>
      <td data-label="Nama Guru"><strong>${esc(g.namaLengkap)}</strong></td>
      <td data-label="Jam">${g.jumlahJam}</td>
      <td data-label="Hadir">${g.hadir}</td>
      <td data-label="Izin">${g.izin}</td>
      <td data-label="Sakit">${g.sakit}</td>
      <td data-label="Cuti">${g.cuti}</td>
      <td data-label="Alpa">${g.alpa}</td>
      <td data-label="% Jadwal">${g.persenKehadiranJadwal === null || g.persenKehadiranJadwal === undefined ? "-" : g.persenKehadiranJadwal + "%"}</td>
    </tr>
  `,
    )
    .join("");

  document.getElementById("cetakRekapGuruModal").classList.remove("hidden");
}

function formatPersenKehadiranJadwal(d) {
  if (
    d.persenKehadiranJadwal === null ||
    d.persenKehadiranJadwal === undefined
  ) {
    return '<span class="muted-text">Belum ada jadwal</span>';
  }
  const badge =
    d.persenKehadiranJadwal >= 90
      ? "ok"
      : d.persenKehadiranJadwal >= 75
        ? "warn"
        : "danger";
  return `<span class="badge ${badge}">${d.persenKehadiranJadwal}%</span> <span class="muted-text" style="font-size:11px;">(${d.hadirSesuaiJadwal}/${d.totalSeharusnyaJadwal})</span>`;
}

async function bukaRincianRekapGuru(username, bulan, tahun) {
  const tbody = document.getElementById("rincianRekapBody");
  const wrap = document.getElementById("rincianRekapWrap");
  const kosong = document.getElementById("rincianRekapKosong");
  document.getElementById("rincianRekapPeriode").textContent = "Memuat...";
  document.getElementById("rincianRekapNamaGuru").textContent = "";
  document.getElementById("rincianRekapMapel").textContent = "";
  document.getElementById("rincianRekapStatus").textContent = "";
  document.getElementById("rincianRekapPersen").innerHTML = "";
  tbody.innerHTML = "";
  wrap.classList.remove("hidden");
  kosong.classList.add("hidden");
  document.getElementById("rincianRekapModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getRincianRekapGuru",
      currentUser.username,
      username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      document.getElementById("rincianRekapPeriode").textContent = res.message;
      return;
    }
    const d = res.data;
    document.getElementById("rincianRekapPeriode").textContent =
      "Periode: " + NAMA_BULAN[bulan] + " " + tahun;
    document.getElementById("rincianRekapNamaGuru").textContent = d.namaLengkap;
    document.getElementById("rincianRekapMapel").textContent = d.mataPelajaran;
    document.getElementById("rincianRekapStatus").textContent =
      d.statusSergu || "Belum diatur";
    document.getElementById("rincianRekapPersen").innerHTML =
      formatPersenKehadiranJadwal(d);
    if (d.rincian.length) {
      wrap.classList.remove("hidden");
      kosong.classList.add("hidden");
      tbody.innerHTML = d.rincian
        .map(
          (r) => `
        <tr>
          <td data-label="Tanggal">${esc(r.tanggal)}</td>
          <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
          <td data-label="Kelas">${esc(r.kelas)}</td>
          <td data-label="Jam Ke">${esc(r.jamKe)}</td>
          <td data-label="Status">${badgeStatus(r.statusWaktu || "")}</td>
          <td data-label="Ket.">${esc(r.keterangan)}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      wrap.classList.add("hidden");
      kosong.classList.remove("hidden");
    }
  } catch (err) {
    showToast(err.message, "error");
    document.getElementById("rincianRekapNamaGuru").textContent =
      "Gagal memuat data.";
  }
}

async function bukaRincianRekapGuruRentang(
  username,
  tanggalMulai,
  tanggalAkhir,
) {
  const tbody = document.getElementById("rincianRekapBody");
  const wrap = document.getElementById("rincianRekapWrap");
  const kosong = document.getElementById("rincianRekapKosong");
  document.getElementById("rincianRekapPeriode").textContent = "Memuat...";
  document.getElementById("rincianRekapNamaGuru").textContent = "";
  document.getElementById("rincianRekapMapel").textContent = "";
  document.getElementById("rincianRekapStatus").textContent = "";
  document.getElementById("rincianRekapPersen").innerHTML = "";
  tbody.innerHTML = "";
  wrap.classList.remove("hidden");
  kosong.classList.add("hidden");
  document.getElementById("rincianRekapModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getRincianRekapGuruRentang",
      currentUser.username,
      username,
      tanggalMulai,
      tanggalAkhir,
    );
    if (!res.success) {
      showToast(res.message, "error");
      document.getElementById("rincianRekapPeriode").textContent = res.message;
      return;
    }
    const d = res.data;
    document.getElementById("rincianRekapPeriode").textContent =
      "Periode: " + tanggalMulai + " s/d " + tanggalAkhir;
    document.getElementById("rincianRekapNamaGuru").textContent = d.namaLengkap;
    document.getElementById("rincianRekapMapel").textContent = d.mataPelajaran;
    document.getElementById("rincianRekapStatus").textContent =
      d.statusSergu || "Belum diatur";
    document.getElementById("rincianRekapPersen").innerHTML =
      formatPersenKehadiranJadwal(d);
    if (d.rincian.length) {
      wrap.classList.remove("hidden");
      kosong.classList.add("hidden");
      tbody.innerHTML = d.rincian
        .map(
          (r) => `
        <tr>
          <td data-label="Tanggal">${esc(r.tanggal)}</td>
          <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
          <td data-label="Kelas">${esc(r.kelas)}</td>
          <td data-label="Jam Ke">${esc(r.jamKe)}</td>
          <td data-label="Status">${badgeStatus(r.statusWaktu || "")}</td>
          <td data-label="Ket.">${esc(r.keterangan)}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      wrap.classList.add("hidden");
      kosong.classList.remove("hidden");
    }
  } catch (err) {
    showToast(err.message, "error");
    document.getElementById("rincianRekapNamaGuru").textContent =
      "Gagal memuat data.";
  }
}
/* =============================================================
   ADMIN — HONOR GURU
   ============================================================= */
function formatRupiah(angka) {
  return "Rp " + Math.round(angka || 0).toLocaleString("id-ID");
}

const NAMA_BULAN = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

let honorDataCache = [];

/* =============================================================
   SORT KOLOM TABEL (klik header) — dipakai bersama oleh Honor Guru & Jadwal Pelajaran
   ============================================================= */
function buatSortState() {
  return { key: null, dir: 1 };
} // dir: 1=kecil->besar, -1=besar->kecil

function terapkanSort(data, sortState, extractors) {
  if (!sortState.key || !extractors[sortState.key]) return data;
  const ambil = extractors[sortState.key];
  return data.slice().sort((a, b) => {
    const va = ambil(a),
      vb = ambil(b);
    if (va < vb) return -1 * sortState.dir;
    if (va > vb) return 1 * sortState.dir;
    return 0;
  });
}

function klikHeaderSort(sortState, key, rerenderFn) {
  if (sortState.key === key) {
    sortState.dir *= -1;
  } else {
    sortState.key = key;
    sortState.dir = 1;
  }
  rerenderFn();
}

function perbaruiIndikatorSort(tableWrapId, sortState) {
  document
    .querySelectorAll("#" + tableWrapId + " th.sortable")
    .forEach((th) => {
      const arrow = th.querySelector(".sort-arrow");
      if (th.dataset.sort === sortState.key) {
        th.classList.add("sort-active");
        arrow.textContent = sortState.dir === 1 ? "\u25B2" : "\u25BC";
      } else {
        th.classList.remove("sort-active");
        arrow.textContent = "";
      }
    });
}

const HARI_URUT = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];
const JAMKE_URUT = ["I", "II", "III", "IV", "V", "VI", "VII"];
const KELAS_TINGKAT = { VII: 7, VIII: 8, IX: 9 };
function kelasSortKey(kelas) {
  // "VIII-C" -> urut berdasar tingkat (7/8/9) dulu, baru hurufnya — bukan alfabetis
  // biasa (yang akan salah urut: IX-A duluan karena huruf I < V).
  const m = String(kelas).match(/^(VII|VIII|IX)-(.+)$/);
  if (m) return KELAS_TINGKAT[m[1]] * 1000 + (m[2].charCodeAt(0) || 0);
  return 9999; // kelas custom/"Lainnya" -> selalu di akhir
}

let honorSortState = buatSortState();
const honorSortExtractors = {
  nama: (g) => (g.nama || "").toLowerCase(),
  role: (g) => (g.role || "").toLowerCase(),
  totalSesi: (g) => g.totalSesi || 0,
  honorTambahan: (g) => g.honorTambahan || 0,
  totalHonor: (g) => g.totalHonor || 0,
};

function renderTabelHonor(cariTerm) {
  const tbody = document.getElementById("honorBody");
  const wrap = document.getElementById("honorBodyWrap");
  const empty = document.getElementById("honorBodyEmpty");
  const kosongCari = document.getElementById("honorCariKosong");

  if (!honorDataCache.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    kosongCari.classList.add("hidden");
    return;
  }
  const term = (cariTerm || "").trim().toLowerCase();
  let tersaring = term
    ? honorDataCache.filter(
        (g) => (g.nama || "").toLowerCase().indexOf(term) !== -1,
      )
    : honorDataCache;
  tersaring = terapkanSort(tersaring, honorSortState, honorSortExtractors);

  if (!tersaring.length) {
    wrap.classList.add("hidden");
    empty.classList.add("hidden");
    kosongCari.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  kosongCari.classList.add("hidden");
  tbody.innerHTML = tersaring
    .map((g) => {
      const detail = Array.isArray(g.detail) ? g.detail : [];
      const rid = "honorDetail_" + escJs(g.username);
      const inisial = (g.nama || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((bagian) => bagian.charAt(0).toUpperCase())
        .join("");
      const rincianRow = detail.length
        ? `
    <tr id="${rid}" class="honor-detail-row hidden" style="background:var(--parchment-alt);">
      <td colspan="7" style="padding:10px 12px;">
        <div class="honor-detail-scroll" style="overflow-x:auto;"><table class="honor-detail-table" style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="text-align:left;color:var(--slate);border-bottom:1px solid var(--line);">
            <th style="padding:6px 8px;">Tanggal</th><th style="padding:6px 8px;">Mapel</th>
            <th style="padding:6px 8px;">Kelas</th><th style="padding:6px 8px;">Jam</th>
            <th style="padding:6px 8px;">Presensi</th><th style="padding:6px 8px;">Nominal</th>
          </tr></thead>
          <tbody>
          ${detail
            .map((r) => {
              const pres = [
                r.hadir != null ? "H:" + r.hadir : "",
                r.izin != null ? "I:" + r.izin : "",
                r.sakit != null ? "S:" + r.sakit : "",
                r.alpa != null ? "A:" + r.alpa : "",
                r.telat != null ? "T:" + r.telat : "",
              ]
                .filter((x) => x)
                .join(" ");
              const alasan =
                r.keterangan && r.persen <= 0
                  ? ' <span class="muted-text">· ' +
                    esc(r.keterangan) +
                    "</span>"
                  : "";
              return `<tr style="border-bottom:1px solid var(--line);color:var(--ink);">
              <td style="padding:6px 8px;">${esc(r.tanggal)}</td>
              <td style="padding:6px 8px;">${esc(r.mapel)}</td>
              <td style="padding:6px 8px;">${esc(r.kelas)}</td>
              <td style="padding:6px 8px;">${esc(r.jamMulai ? r.jamMulai + (r.jamSelesai ? "-" + r.jamSelesai : "") : (r.durasiMenit || 0) + "m")}</td>
              <td style="padding:6px 8px;">${esc(pres || "-")}</td>
              <td style="padding:6px 8px;">${formatRupiah(r.nominal || 0)}${r.persen && r.persen < 100 ? ' <span class="muted-text">(' + r.persen + "%)</span>" : ""}${alasan}</td>
            </tr>`;
            })
            .join("")}
          </tbody>
        </table></div>
      </td>
    </tr>`
        : "";
      return `
    <tr class="kepala-honor-row">
      <td data-label="Nama Guru"><div class="kepala-honor-person"><span class="kepala-honor-avatar">${esc(inisial)}</span><span class="kepala-honor-person-info"><strong>${esc(g.nama)}</strong><span>@${esc(g.username)} · ${esc(g.role || "Guru")}</span></span><span class="kepala-honor-status">${esc(window.__honorCache?.status || "Draft")}</span></div></td>
      <td data-label="Peran">${esc(g.role || "-")}</td>
      <td data-label="Sesi">${g.totalSesi || 0}</td>
      <td data-label="Jam">${g.totalJam || 0}</td>
      <td data-label="Honor Tambahan">${formatRupiah(g.honorTambahan || 0)}</td>
      <td data-label="Total Honor"><strong>${formatRupiah(g.totalHonor || 0)}</strong></td>
      <td data-label="Aksi" style="text-align: right;">
        <div class="action-btn-group" style="justify-content: flex-end;">
          ${detail.length ? `<button type="button" class="btn btn-outline btn-sm" onclick="toggleRincianHonor('${escJs(g.username)}')">Rincian</button>` : ""}
          <button type="button" class="btn btn-outline btn-sm" onclick="bukaModalHonorTambahan('${escJs(g.username)}', '${escJs(g.nama)}')">Atur</button>
          ${g.totalSesi > 0 || g.totalHonor > 0 ? `<button type="button" class="btn btn-outline btn-sm" onclick="bukaSlipHonor('${escJs(g.username)}')">Slip</button>` : ""}
        </div>
      </td>
    </tr>
    ${rincianRow}`;
    })
    .join("");
  perbaruiIndikatorSort("honorBodyWrap", honorSortState);
}

function toggleRincianHonor(username) {
  const el = document.getElementById("honorDetail_" + username);
  if (el) el.classList.toggle("hidden");
}

function perbaruiInfoHonor(rekap) {
  const info = document.getElementById("honorStatusInfo");
  if (!info || !rekap) return;
  const status = rekap.status || "Draft";
  const total = formatRupiah(rekap.totalSeluruh || 0);
  const summary = document.getElementById("honorSummary");
  const summaryTotal = document.getElementById("honorTotalSummary");
  const staffCount = document.getElementById("honorStaffCount");
  if (summary) summary.classList.remove("hidden");
  if (summaryTotal) summaryTotal.textContent = total;
  if (staffCount)
    staffCount.textContent = `${honorDataCache.length} Tenaga Pendidik`;
  info.innerHTML =
    "Status: <strong>" +
    esc(status) +
    "</strong> \u00b7 Total seluruh: <strong>" +
    total +
    "</strong>";
}

async function muatRekapHonor() {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  try {
    const res = await runServer(
      "getRekapHonorBaru",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    window.__honorCache = { bulan: bulan, tahun: tahun, status: res.status };
    honorDataCache = res.data || [];
    perbaruiInfoHonor(res);
    renderTabelHonor(document.getElementById("honorCari").value);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function hitungHonorOtomatis() {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  showConfirmModal(
    "Hitung Ulang Draft Honor",
    "Hitung ulang draf honor " +
      NAMA_BULAN[bulan] +
      " " +
      tahun +
      "? Angka draf bisa berubah.",
    "Hitung",
    function () {
      hitungUlangHonorSekarang(bulan, tahun);
    },
    "primary",
  );
}

async function hitungUlangHonorSekarang(bulan, tahun) {
  if (cekAksiBerjalan()) return;
  showLoading("Menghitung...");
  try {
    const res = await runServer(
      "hitungUlangHonorDraft",
      currentUser.username,
      bulan,
      tahun,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatRekapHonor();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function finalisasiHonorKlik() {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  showConfirmModal(
    "Finalisasi Honor",
    "Finalisasi honor " +
      NAMA_BULAN[bulan] +
      " " +
      tahun +
      "? Setelah difinalisasi angka tidak bisa dihitung ulang sampai dibuka kembali.",
    "Finalisasi",
    function () {
      finalisasiHonorSekarang(bulan, tahun);
    },
    "primary",
  );
}

async function finalisasiHonorSekarang(bulan, tahun) {
  if (cekAksiBerjalan()) return;
  showLoading("Memfinalisasi...");
  try {
    const res = await runServer(
      "finalisasiHonor",
      currentUser.username,
      bulan,
      tahun,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatRekapHonor();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function bukaFinalisasiHonorKlik() {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  showConfirmModal(
    "Buka Finalisasi Honor",
    "Buka kembali finalisasi honor " +
      NAMA_BULAN[bulan] +
      " " +
      tahun +
      "? Slip guru akan ditarik sementara sampai difinalisasi lagi.",
    "Buka",
    function () {
      bukaFinalisasiHonorSekarang(bulan, tahun);
    },
    "primary",
  );
}

async function bukaFinalisasiHonorSekarang(bulan, tahun) {
  if (cekAksiBerjalan()) return;
  showLoading("Membuka...");
  try {
    const res = await runServer(
      "bukaFinalisasiHonor",
      currentUser.username,
      bulan,
      tahun,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatRekapHonor();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function isiSlipHonor(d, bulan, tahun) {
  document
    .getElementById("slipHonorPrintArea")
    .classList.remove("mode-slip-gaji");
  document.getElementById("ukuranKertasCetak").textContent = "";
  document.getElementById("slipHonorPeriode").textContent =
    "Periode: " + NAMA_BULAN[bulan] + " " + tahun;
  document.getElementById("slipHonorNama").textContent = d.namaLengkap;
  document.getElementById("slipHonorMapel").textContent = d.role || "-";
  document.getElementById("slipHonorStatus").textContent = d.status || "-";
  document.getElementById("slipHonorJumlahJam").textContent =
    (d.jumlahJam != null ? d.jumlahJam : 0) + " jam";
  document.getElementById("slipHonorTarif").textContent =
    (d.jumlahSesi != null ? d.jumlahSesi : 0) + " sesi";
  document.getElementById("slipHonorMengajar").textContent = formatRupiah(
    d.totalHonor || 0,
  );
  document.getElementById("slipHonorTotal").textContent = formatRupiah(
    d.totalHonor || 0,
  );
  document.getElementById("slipHonorTtdGuru").textContent = d.namaLengkap;
  document.getElementById("slipHonorTtdKepala").textContent =
    d.namaKepala || "";

  const tbody = document.getElementById("slipHonorRincian");
  const kosong = document.getElementById("slipHonorKosong");
  const rincian = d.rincian || [];
  if (rincian.length) {
    tbody.parentElement.parentElement.classList.remove("hidden");
    kosong.classList.add("hidden");
    tbody.innerHTML = rincian
      .map((r) => {
        const jam = r.jamMulai
          ? r.jamMulai + (r.jamSelesai ? "-" + r.jamSelesai : "")
          : (r.durasiMenit || 0) + "m";
        const pres = [
          r.hadir != null ? "H:" + r.hadir : "",
          r.izin != null ? "I:" + r.izin : "",
          r.sakit != null ? "S:" + r.sakit : "",
          r.alpa != null ? "A:" + r.alpa : "",
          r.telat != null ? "T:" + r.telat : "",
        ]
          .filter((x) => x)
          .join(" ");
        const alasan =
          r.keterangan && r.persen <= 0
            ? ' <span class="muted-text">· ' + esc(r.keterangan) + "</span>"
            : "";
        return `
      <tr>
        <td data-label="Tanggal">${esc(r.tanggal)}</td>
        <td data-label="Mapel">${esc(r.mapel)}</td>
        <td data-label="Kelas">${esc(r.kelas)}</td>
        <td data-label="Jam">${esc(jam)}</td>
        <td data-label="Presensi">${esc(pres || "-")}</td>
        <td data-label="Nominal">${formatRupiah(r.nominal || 0)}${r.persen && r.persen < 100 ? ' <span class="muted-text">(' + r.persen + "%)</span>" : ""}${alasan}</td>
      </tr>`;
      })
      .join("");
  } else {
    tbody.parentElement.parentElement.classList.add("hidden");
    kosong.classList.remove("hidden");
    tbody.innerHTML = "";
  }
}

async function bukaSlipHonor(username) {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  showLoading("Memuat slip...");
  try {
    const res = await runServer("getSlipHonorBaru", "", username, bulan, tahun);
    hideLoading();
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    isiSlipHonor(res.data || res, bulan, tahun);
    document.getElementById("slipHonorModal").classList.remove("hidden");
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

async function bukaModalHonorTambahan(username, namaLengkap) {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  document.getElementById("honorTambahanUsername").value = username;
  document.getElementById("honorTambahanNamaGuru").textContent =
    namaLengkap + " \u2014 " + NAMA_BULAN[bulan] + " " + tahun;
  document.getElementById("honorTambahanStruktural").value = "";
  document.getElementById("honorTambahanTugas").value = "";
  document.getElementById("honorTambahanKeterangan").value = "";
  document.getElementById("honorTambahanModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getHonorTambahanSatuGuru",
      currentUser.username,
      username,
      bulan,
      tahun,
    );
    if (res.success) {
      document.getElementById("honorTambahanStruktural").value =
        res.data.honorStruktural || "";
      document.getElementById("honorTambahanTugas").value =
        res.data.honorTugasTambahan || "";
      document.getElementById("honorTambahanKeterangan").value =
        res.data.keterangan || "";
    }
  } catch (err) {
    /* biarkan kosong kalau gagal memuat, admin masih bisa isi ulang manual */
  }
}

async function handleSimpanHonorTambahan(e) {
  e.preventDefault();
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer("simpanHonorTambahan", currentUser.username, {
      username: document.getElementById("honorTambahanUsername").value,
      bulan: bulan,
      tahun: tahun,
      honorStruktural: document.getElementById("honorTambahanStruktural").value,
      honorTugasTambahan: document.getElementById("honorTambahanTugas").value,
      keterangan: document.getElementById("honorTambahanKeterangan").value,
    });
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("honorTambahanModal").classList.add("hidden");
      muatRekapHonor();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function renderSlipHonorHtml(rekap, row, periodeLabel) {
  const rincian = row.detail || [];
  const rincianHtml = rincian
    .map((r) => {
      const jam = r.jamMulai
        ? r.jamMulai + (r.jamSelesai ? "-" + r.jamSelesai : "")
        : (r.durasiMenit || 0) + "m";
      const pres = [
        r.hadir != null ? "H:" + r.hadir : "",
        r.izin != null ? "I:" + r.izin : "",
        r.sakit != null ? "S:" + r.sakit : "",
        r.alpa != null ? "A:" + r.alpa : "",
        r.telat != null ? "T:" + r.telat : "",
      ]
        .filter((x) => x)
        .join(" ");
      const alasan =
        r.keterangan && r.persen <= 0
          ? " · " + esc(r.keterangan)
          : r.alasan
            ? " · " + esc(r.alasan)
            : "";
      return `
    <tr>
      <td data-label="Tanggal">${esc(r.tanggal)}</td>
      <td data-label="Mapel">${esc(r.mapel)}</td>
      <td data-label="Kelas">${esc(r.kelas)}</td>
      <td data-label="Jam">${esc(jam)}</td>
      <td data-label="Presensi">${esc(pres || "-")}</td>
      <td data-label="Nominal">${formatRupiah(r.nominal || 0)}${r.persen && r.persen < 100 ? " (" + r.persen + "%)" : ""}${alasan}</td>
    </tr>`;
    })
    .join("");
  return `
    <div class="slip-satu-guru" style="padding-bottom:24px; margin-bottom:24px; border-bottom:1px dashed var(--line);">
      <div style="text-align:center; margin-bottom:18px;">
        <div class="register-rule" style="justify-content:center;"><span class="diamond"></span></div>
        <h2 class="print-h2" style="margin-bottom:2px;">${esc(rekap.namaSekolah || "")}</h2>
        <p style="font-weight:700; letter-spacing:0.04em; margin-top:4px;">SLIP HONOR GURU</p>
        <p class="muted-text">Periode: ${esc(periodeLabel)}</p>
      </div>
      <div style="margin-bottom:14px; font-size:14px;">
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Nama Guru</span><strong>${esc(row.nama)}</strong></div>
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Peran</span><span>${esc(row.role || "-")}</span></div>
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Status</span><span>${esc(rekap.status || "-")}</span></div>
      </div>
      <div class="rincian-slip-gaji">
        ${
          rincian.length
            ? `
        <div class="table-wrap scroll-x" style="margin-bottom:12px;">
          <table class="data-table" style="font-size:12.5px;">
            <thead><tr><th>Tanggal</th><th>Mapel</th><th>Kelas</th><th>Jam</th><th>Nominal</th></tr></thead>
            <tbody>${rincianHtml}</tbody>
          </table>
        </div>`
            : `<div class="empty-state"><div class="s">Tidak ada catatan honor mengajar pada periode ini.</div></div>`
        }
      </div>
      <div style="border-top:1px solid var(--line); padding-top:10px; font-size:14px;">
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Jumlah Jam</span><span>${row.totalJam || 0} jam</span></div>
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Jumlah Sesi</span><span>${row.totalSesi || 0} sesi</span></div>
        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span class="muted-text">Honor Tambahan</span><span>${formatRupiah(row.honorTambahan || 0)}</span></div>
        <div style="display:flex; justify-content:space-between; padding:8px 0; margin-top:4px; border-top:1px solid var(--line); font-size:17px; font-weight:800; color:var(--ink-green);"><span>Total Honor</span><span>${formatRupiah(row.totalHonor || 0)}</span></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:40px; font-size:13px; text-align:center;">
        <div>
          <p class="muted-text">Guru Ybs.</p>
          <div style="height:60px;"></div>
          <p style="border-top:1px solid var(--ink); padding-top:4px; display:inline-block; min-width:140px;">${esc(row.nama)}</p>
        </div>
        <div>
          <p class="muted-text">Mengetahui, Kepala Madrasah</p>
          <div style="height:60px;"></div>
          <p style="border-top:1px solid var(--ink); padding-top:4px; display:inline-block; min-width:140px;">${esc(rekap.namaKepala || "")}</p>
        </div>
      </div>
    </div>
  `;
}

async function bukaSlipHonorSemua() {
  const bulan = parseInt(document.getElementById("honorBulan").value, 10);
  const tahun = parseInt(document.getElementById("honorTahun").value, 10);
  const area = document.getElementById("slipHonorSemuaPrintArea");
  const ket = document.getElementById("slipHonorSemuaKeterangan");
  area.classList.remove("mode-slip-gaji");
  document.getElementById("ukuranKertasCetak").textContent = "";
  area.innerHTML = "";
  ket.textContent = "Memuat...";
  document.getElementById("slipHonorSemuaModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getRekapHonorBaru",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      ket.textContent = res.message;
      return;
    }
    const periodeLabel = NAMA_BULAN[bulan] + " " + tahun;
    const data = res.data || [];
    if (!data.length) {
      ket.textContent =
        "Tidak ada guru dengan honor/aktivitas pada " + periodeLabel + ".";
      return;
    }
    ket.textContent =
      data.length +
      " guru \u2014 " +
      periodeLabel +
      ". Setiap guru tercetak di halaman terpisah.";
    area.innerHTML = data
      .map((d) => renderSlipHonorHtml(res, d, periodeLabel))
      .join("");
  } catch (err) {
    showToast(err.message, "error");
    ket.textContent = "Gagal memuat data.";
  }
}
/* =============================================================
   ADMIN — JADWAL PELAJARAN
   ============================================================= */
let jadwalDataCache = [];

async function muatDaftarJadwal() {
  const guruSelect = document.getElementById("jadwalGuru");
  if (!daftarGuruCache.length) {
    try {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    } catch (err) {
      /* biarkan kosong, tombol tambah akan gagal dengan pesan jelas kalau tetap kosong */
    }
  }
  guruSelect.innerHTML =
    '<option value="">- Pilih Guru -</option>' +
    daftarGuruCache
      .map(
        (g) =>
          `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
      )
      .join("");

  try {
    const res = await runServer("getDaftarJadwal", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    jadwalDataCache = res.data;
    renderTabelJadwal();
  } catch (err) {
    showToast(err.message, "error");
  }

  try {
    const { daftarKelas, daftarMapel } = await ambilDaftarMasterKelasDanMapel();
    const jkSel = document.getElementById("jadwalKelas");
    if (jkSel) {
      const curK = jkSel.value;
      jkSel.innerHTML =
        '<option value="">- Pilih Kelas -</option>' +
        daftarKelas
          .map((k) => `<option value="${esc(k)}">${esc(k)}</option>`)
          .join("");
      if (curK && daftarKelas.includes(curK)) jkSel.value = curK;
    }
    const jmSel = document.getElementById("jadwalMapel");
    if (jmSel) {
      const curM = jmSel.value;
      jmSel.innerHTML =
        '<option value="">- Pilih Mapel -</option>' +
        daftarMapel
          .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
          .join("");
      if (curM && daftarMapel.includes(curM)) jmSel.value = curM;
    }
    const fkSel = document.getElementById("jadwalFilterKelas");
    if (fkSel) {
      const curVal = fkSel.value;
      fkSel.innerHTML =
        '<option value="">Semua Kelas</option>' +
        daftarKelas
          .map((k) => `<option value="${esc(k)}">${esc(k)}</option>`)
          .join("");
      if (curVal && daftarKelas.includes(curVal)) fkSel.value = curVal;
      else fkSel.value = "";
    }
    const fmSel = document.getElementById("jadwalFilterMapel");
    if (fmSel) {
      const curVal = fmSel.value;
      fmSel.innerHTML =
        '<option value="">Semua Mapel</option>' +
        daftarMapel
          .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
          .join("");
      if (curVal && daftarMapel.includes(curVal)) fmSel.value = curVal;
      else fmSel.value = "";
    }
  } catch (err) {}
}

let jadwalSortState = buatSortState();
const jadwalSortExtractors = {
  namaGuru: (j) => j.namaGuru.toLowerCase(),
  hari: (j) => {
    const idx = HARI_URUT.indexOf(j.hari);
    return idx === -1 ? 99 : idx;
  },
  mataPelajaran: (j) => j.mataPelajaran.toLowerCase(),
  kelas: (j) => kelasSortKey(j.kelas),
  jamKe: (j) => {
    const idx = JAMKE_URUT.indexOf(j.jamKe);
    return idx === -1 ? 99 : idx;
  },
};

function getFilterJadwalAktif() {
  return {
    term: document.getElementById("jadwalCari").value.trim().toLowerCase(),
    fHari: document.getElementById("jadwalFilterHari").value,
    fKelas: document.getElementById("jadwalFilterKelas").value,
    fMapel: document.getElementById("jadwalFilterMapel").value,
    fJamKe: document.getElementById("jadwalFilterJamKe").value,
  };
}

function getJadwalTersaring(usernameKhusus) {
  const f = getFilterJadwalAktif();
  let tersaring = jadwalDataCache.filter((j) => {
    if (usernameKhusus && j.username !== usernameKhusus) return false;
    if (f.term && String(j.namaGuru).toLowerCase().indexOf(f.term) === -1)
      return false;
    if (f.fHari && j.hari !== f.fHari) return false;
    if (f.fKelas && j.kelas !== f.fKelas) return false;
    if (f.fMapel && j.mataPelajaran !== f.fMapel) return false;
    if (f.fJamKe && j.jamKe !== f.fJamKe) return false;
    return true;
  });
  return terapkanSort(tersaring, jadwalSortState, jadwalSortExtractors);
}

let jadwalEditId = null;

function renderTabelJadwal() {
  const tbody = document.getElementById("jadwalBody");
  const wrap = document.getElementById("jadwalBodyWrap");
  const empty = document.getElementById("jadwalBodyEmpty");
  const tersaring = getJadwalTersaring();

  if (!tersaring.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");

  // Kelompokkan per kelas agar mudah dibaca, tiap kelompok diurutkan hari -> jam ke.
  const perKelas = {};
  tersaring.forEach((j) => {
    const k = j.kelas || "-";
    (perKelas[k] = perKelas[k] || []).push(j);
  });
  const kunciKelas = Object.keys(perKelas).sort((a, b) => {
    const ka = kelasSortKey(a),
      kb = kelasSortKey(b);
    if (ka !== kb) return ka - kb;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });
  const HARI_IDX = {};
  HARI_URUT.forEach((h, i) => {
    HARI_IDX[h] = i;
  });

  tbody.innerHTML = kunciKelas
    .map((k) => {
      const list = perKelas[k].slice().sort((a, b) => {
        const ha = HARI_IDX[a.hari] !== undefined ? HARI_IDX[a.hari] : 99;
        const hb = HARI_IDX[b.hari] !== undefined ? HARI_IDX[b.hari] : 99;
        const _ordRom = {
          I: 1,
          II: 2,
          III: 3,
          IV: 4,
          V: 5,
          VI: 6,
          VII: 7,
          VIII: 8,
        };
        const ja =
          _ordRom[String(a.jamKe).toUpperCase()] || parseInt(a.jamKe, 10) || 99;
        const jb =
          _ordRom[String(b.jamKe).toUpperCase()] || parseInt(b.jamKe, 10) || 99;
        return ja - jb;
      });
      const labelKelas = k;
      const subNama =
        list[0] && list[0].kelasNama && list[0].kelasNama !== k
          ? list[0].kelasNama
          : "";
      return `
      <tr class="jadwal-group-row">
        <td colspan="6">
          <span class="jdw-group-label">Kelas ${esc(labelKelas)}</span>
          ${subNama ? `<span class="jdw-group-nama">${esc(subNama)}</span>` : ""}
          <span class="jdw-group-meta">${list.length} jadwal</span>
        </td>
      </tr>
      ${list
        .map(
          (j) => `
        <tr class="jadwal-card-row">
          <td data-label="Nama Guru" class="jdw-desktop-only"><strong>${esc(j.namaGuru)}</strong></td>
          <td data-label="Hari" class="jdw-desktop-only"><span class="badge ok">${esc(j.hari)}</span></td>
          <td data-label="Mapel" class="jdw-desktop-only">${esc(j.mataPelajaran)}</td>
          <td data-label="Kelas" class="jdw-desktop-only">${esc(j.kelas)}</td>
          <td data-label="Jam Ke" class="jdw-desktop-only"><span class="badge muted">Ke-${esc(j.jamKe)}</span></td>
          <td data-label="Aksi" class="jdw-desktop-only" style="text-align:right;">
            <div class="action-btn-group" style="justify-content:flex-end;">
              <button type="button" class="btn btn-icon" onclick="bukaEditJadwal('${escJs(j.id)}')" title="Edit jadwal" aria-label="Edit jadwal ${esc(j.namaGuru)}">${icon("pencil")}</button>
              <button type="button" class="btn btn-icon text-danger" onclick="hapusJadwalSekarang('${escJs(j.id)}', '${escJs(j.namaGuru)}', '${escJs(j.hari)}')" title="Hapus" aria-label="Hapus jadwal">${icon("x")}</button>
            </div>
          </td>
          <td colspan="6" class="jdw-mobile-only jadwal-card-td">
            <div class="jdw-card">
              <div class="jdw-card-top">
                <div class="jdw-card-badges">
                  <span class="jdw-badge-hari jdw-badge-hari--${(j.hari||'').toLowerCase()}">${esc(j.hari)}</span>
                  <span class="jdw-badge-jam">Jam Ke-${esc(j.jamKe)}</span>
                </div>
                <span class="jdw-badge-kelas">${esc(j.kelasNama || j.kelas)}</span>
              </div>
              <div class="jdw-card-mapel">${esc(j.mataPelajaran)}</div>
              <div class="jdw-card-guru">
                <span class="jdw-avatar">${esc((j.namaGuru||' ').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase().slice(0,2))}</span>
                <span class="jdw-guru-nama">${esc(j.namaGuru)}</span>
              </div>
              <div class="jdw-card-actions">
                <button type="button" class="btn btn-icon" onclick="bukaEditJadwal('${escJs(j.id)}')" title="Edit" aria-label="Edit jadwal">${icon("pencil")}</button>
                <button type="button" class="btn btn-icon text-danger" onclick="hapusJadwalSekarang('${escJs(j.id)}', '${escJs(j.namaGuru)}', '${escJs(j.hari)}')" title="Hapus" aria-label="Hapus jadwal">${icon("x")}</button>
              </div>
            </div>
          </td>
        </tr>
      `,
        )
        .join("")}
    `;
    })
    .join("");
  perbaruiIndikatorSort("jadwalBodyWrap", jadwalSortState);
}

async function handleTambahJadwal(e) {
  e.preventDefault();
  const username = document.getElementById("jadwalGuru").value;
  if (!username) {
    showToast("Pilih guru terlebih dahulu", "error");
    return;
  }
  const mataPelajaran = document.getElementById("jadwalMapel").value.trim();
  const kelas = document.getElementById("jadwalKelas").value.trim();
  if (!mataPelajaran || !kelas) {
    showToast("Mapel dan Kelas wajib diisi", "error");
    return;
  }
  if (cekAksiBerjalan()) return;

  const payload = {
    username: username,
    hari: document.getElementById("jadwalHari").value,
    mataPelajaran: mataPelajaran,
    kelas: kelas,
    jamKe: document.getElementById("jadwalJamKe").value,
  };
  const sedangEdit = !!jadwalEditId;
  if (sedangEdit) payload.id = jadwalEditId;

  showLoading(sedangEdit ? "Menyimpan perubahan..." : "Menyimpan...");
  try {
    const res = await runServer(
      sedangEdit ? "updateJadwal" : "tambahJadwal",
      currentUser.username,
      payload,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      const jf = document.getElementById("jadwalForm");
      if (jf) jf.reset();
      aturJadwalEditMode(false);
      tutupModalJadwal();
      luapkanMuatan("jadwal");
      muatDaftarJadwal();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function aturJadwalEditMode(sedangEdit) {
  jadwalEditId = sedangEdit ? jadwalEditId : null;
  const judul = document.getElementById("jadwalModalTitle");
  if (judul)
    judul.textContent = sedangEdit
      ? "Edit Jadwal Pelajaran"
      : "Tambah Jadwal Pelajaran";
  const btn = document.getElementById("jadwalSubmitBtn");
  if (btn) btn.textContent = sedangEdit ? "Simpan Perubahan" : "Simpan Jadwal";
}

function bukaEditJadwal(id) {
  const item = Array.isArray(jadwalDataCache)
    ? jadwalDataCache.find((j) => String(j.id) === String(id))
    : null;
  if (!item) {
    showToast("Jadwal tidak ditemukan", "error");
    return;
  }
  const m = document.getElementById("jadwalModal");
  if (!m) return;
  jadwalEditId = item.id;
  aturJadwalEditMode(true);
  const jf = document.getElementById("jadwalForm");
  if (jf) jf.reset();

  const setVal = (selId, val) => {
    const sel = document.getElementById(selId);
    if (sel && val !== undefined && val !== null) sel.value = String(val);
  };

  // Normalisasi jam ke: pastikan selalu Romawi (dropdown sekarang pakai Romawi).
  const jamKeArab = (v) => {
    // Konversi angka Arab ke Romawi (untuk data lama yang tersimpan sebagai angka)
    const arab = {
      1: "I",
      2: "II",
      3: "III",
      4: "IV",
      5: "V",
      6: "VI",
      7: "VII",
      8: "VIII",
    };
    const s = String(v || "").trim();
    return arab[s] !== undefined ? arab[s] : s.toUpperCase();
  };

  // Isi jadwalGuru dari daftarGuruCache (sudah dimuat saat muatDaftarJadwal).
  {
    const gSel = document.getElementById("jadwalGuru");
    if (gSel && Array.isArray(daftarGuruCache)) {
      gSel.innerHTML =
        '<option value="">- Pilih Guru -</option>' +
        daftarGuruCache
          .map(
            (g) =>
              `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
          )
          .join("");
      setVal("jadwalGuru", item.username);
    }
  }

  (async () => {
    try {
      const { daftarKelas, daftarMapel } =
        await ambilDaftarMasterKelasDanMapel();
      isiSelect(
        "jadwalKelas",
        daftarKelas,
        item.kelas || "",
        "- Pilih Kelas -",
      );
      isiSelect(
        "jadwalMapel",
        daftarMapel,
        item.mataPelajaran || "",
        "- Pilih Mapel -",
      );
      setVal("jadwalHari", item.hari);
      setVal("jadwalJamKe", jamKeArab(item.jamKe));
    } catch (err) {}
  })();

  m.classList.remove("hidden");
}

function hapusJadwalSekarang(id, namaGuru, hari) {
  showConfirmModal(
    "Hapus Jadwal",
    "Hapus jadwal " + namaGuru + " hari " + hari + "?",
    "Ya, Hapus",
    function () {
      hapusJadwalDenganLoading(id);
    },
  );
}
async function hapusJadwalDenganLoading(id) {
  if (cekAksiBerjalan()) return;
  showLoading("Menghapus...");
  try {
    const res = await runServer("hapusJadwal", currentUser.username, id);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      luapkanMuatan("jadwal");
      muatDaftarJadwal();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

/* =============================================================
   CETAK JADWAL PELAJARAN (mengikuti hasil yang sedang ditampilkan)
   ============================================================= */
let cetakJadwalDataSaatIni = [];

function bukaCetakJadwal(usernameKhusus, namaGuruKhusus) {
  cetakJadwalDataSaatIni = getJadwalTersaring(usernameKhusus);
  if (!cetakJadwalDataSaatIni.length) {
    showToast(
      "Tidak ada jadwal untuk dicetak" +
        (usernameKhusus
          ? " (" + namaGuruKhusus + ")"
          : " pada hasil yang ditampilkan") +
        ".",
      "error",
    );
    return;
  }
  document.getElementById("cetakJadwalSubjudul").textContent = usernameKhusus
    ? "Jadwal: " + namaGuruKhusus
    : "Semua Guru";

  // Ringkasan filter yang sedang aktif, supaya dokumen tercetak jelas cakupannya.
  const f = getFilterJadwalAktif();
  const bagianFilter = [];
  if (f.term) bagianFilter.push('Cari "' + f.term + '"');
  if (f.fHari) bagianFilter.push("Hari " + f.fHari);
  if (f.fKelas) bagianFilter.push("Kelas " + f.fKelas);
  if (f.fMapel) bagianFilter.push("Mapel " + f.fMapel);
  if (f.fJamKe) bagianFilter.push("Jam ke-" + f.fJamKe);
  document.getElementById("cetakJadwalFilterInfo").textContent =
    bagianFilter.length ? "Filter aktif: " + bagianFilter.join(", ") : "";

  document.getElementById("cetakJadwalIsi").innerHTML = renderJadwalPerHari(
    cetakJadwalDataSaatIni,
  );
  document.getElementById("cetakJadwalModal").classList.remove("hidden");
}

function renderJadwalPerHari(data) {
  const perHari = {};
  HARI_URUT.forEach((h) => {
    perHari[h] = [];
  });
  data.forEach((j) => {
    if (!perHari[j.hari]) perHari[j.hari] = []; // jaga-jaga kalau ada nilai Hari di luar 7 standar
    perHari[j.hari].push(j);
  });
  const JAMKE_INDEX = {};
  JAMKE_URUT.forEach((jk, i) => {
    JAMKE_INDEX[jk] = i;
  });

  const ambilUrutJam = (j) => {
    if (JAMKE_INDEX[j.jamKe] !== undefined) return JAMKE_INDEX[j.jamKe];
    const num = parseInt(j.jamKe, 10);
    return isNaN(num) ? 99 : num - 1;
  };

  return Object.keys(perHari)
    .filter((h) => perHari[h].length)
    .map((h) => {
      const baris = perHari[h]
        .slice()
        .sort((a, b) => ambilUrutJam(a) - ambilUrutJam(b));
      return `
        <div style="margin-bottom:18px; page-break-inside:avoid;">
          <h3 style="margin:0; color:var(--ink-green); border-bottom:1px solid var(--line); padding-bottom:4px; margin-bottom:8px;">${esc(h)}</h3>
          <table class="data-table" style="font-size:11.5px;">
            <thead><tr><th>Jam Ke</th><th>Nama Guru</th><th>Mapel</th><th>Kelas</th></tr></thead>
            <tbody>
              ${baris
                .map(
                  (j) => `
                <tr>
                  <td data-label="Jam Ke">${esc(j.jamKe)}</td>
                  <td data-label="Nama Guru">${esc(j.namaGuru)}</td>
                  <td data-label="Mapel">${esc(j.mataPelajaran)}</td>
                  <td data-label="Kelas">${esc(j.kelas)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");
}
/* =============================================================
   ADMIN — KALENDER LIBUR
   ============================================================= */
async function muatDaftarLibur() {
  const tbody = document.getElementById("liburBody");
  const wrap = document.getElementById("liburBodyWrap");
  const empty = document.getElementById("liburBodyEmpty");
  try {
    const res = await runServer("getDaftarLibur", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    if (!res.data.length) {
      wrap.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    empty.classList.add("hidden");
    tbody.innerHTML = res.data
      .map(
        (l) => `
      <tr>
        <td data-label="Tanggal Libur"><strong>${esc(l.tanggal)}</strong></td>
        <td data-label="Keterangan Libur">${esc(l.keterangan)}</td>
        <td data-label="Aksi" style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button type="button" class="btn btn-icon text-danger" onclick="hapusLiburSekarang('${escJs(l.tanggal)}')" title="Hapus">${icon("x")}</button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleTambahLibur(e) {
  e.preventDefault();
  const mulaiInput = document.getElementById("liburTanggalMulai").value; // yyyy-MM-dd
  const selesaiInput =
    document.getElementById("liburTanggalSelesai").value || mulaiInput; // kosong = sama dengan tanggal mulai (1 hari)
  if (!mulaiInput) {
    showToast("Tanggal mulai wajib diisi", "error");
    return;
  }
  const formatTgl = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const tanggalMulai = formatTgl(mulaiInput);
  const tanggalSelesai = formatTgl(selesaiInput);
  const keterangan = document.getElementById("liburKeterangan").value.trim();
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer(
      "tambahLiburRentang",
      currentUser.username,
      tanggalMulai,
      tanggalSelesai,
      keterangan,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("liburForm").reset();
      tutupModalLibur();
      luapkanMuatan("libur");
      muatDaftarLibur();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function hapusLiburSekarang(tanggal) {
  showConfirmModal(
    "Hapus Hari Libur",
    "Hapus hari libur tanggal " + tanggal + "?",
    "Ya, Hapus",
    function () {
      hapusLiburDenganLoading(tanggal);
    },
  );
}
async function hapusLiburDenganLoading(tanggal) {
  if (cekAksiBerjalan()) return;
  showLoading("Menghapus...");
  try {
    const res = await runServer("hapusLibur", currentUser.username, tanggal);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      luapkanMuatan("libur");
      muatDaftarLibur();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
/* =============================================================
   ADMIN — CATAT KEHADIRAN MANUAL (Izin/Sakit/Cuti/Alpa/Hadir)
   ============================================================= */
async function bukaModalKehadiranManual() {
  document.getElementById("manualForm").reset();
  const autoBox = document.getElementById("manualJadwalAutoBox");
  if (autoBox) autoBox.classList.add("hidden");
  const chipsEl = document.getElementById("manualJadwalChips");
  if (chipsEl) chipsEl.innerHTML = "";

  isiSelectAtauLainnya("manualMapel", "manualMapelManual", "");
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", "");
  const sel = document.getElementById("manualGuru");
  const selPengganti = document.getElementById("manualGuruPengganti");
  sel.innerHTML = '<option value="">Memuat daftar guru...</option>';
  selPengganti.innerHTML = '<option value="">Memuat daftar guru...</option>';
  document.getElementById("manualModal").classList.remove("hidden");

  // Pasang auto-detect event listener
  if (!sel.dataset.listenerInstalled) {
    sel.addEventListener("change", () => {
      isiDefaultMapelKelasManual();
      deteksiJadwalManualGuru();
    });
    const tglEl = document.getElementById("manualTanggal");
    if (tglEl) tglEl.addEventListener("change", deteksiJadwalManualGuru);
    sel.dataset.listenerInstalled = "true";
  }

  // Set default tanggal hari ini (yyyy-MM-dd) berdasarkan zona lokal,
  // bukan UTC (toISOString bisa salah 1 hari pagi hari di WIB).
  const tglEl = document.getElementById("manualTanggal");
  if (tglEl) {
    const today = tanggalLocalISO();
    tglEl.value = today;
  }

  try {
    if (!daftarGuruCache.length) {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    }
    const opsiGuru = daftarGuruCache
      .map(
        (g) =>
          `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
      )
      .join("");
    sel.innerHTML = '<option value="">- Pilih Guru -</option>' + opsiGuru;
    selPengganti.innerHTML =
      '<option value="">- Tidak ada -</option>' + opsiGuru;
  } catch (err) {
    sel.innerHTML = '<option value="">Gagal memuat daftar guru</option>';
    selPengganti.innerHTML = '<option value="">- Tidak ada -</option>';
  }
}

async function deteksiJadwalManualGuru() {
  const username = document.getElementById("manualGuru").value;
  const tglInput = document.getElementById("manualTanggal").value; // yyyy-MM-dd
  const autoBox = document.getElementById("manualJadwalAutoBox");
  const chipsEl = document.getElementById("manualJadwalChips");
  const hariLabel = document.getElementById("manualHariLabel");
  if (!autoBox || !chipsEl) return;

  if (!username || !tglInput) {
    autoBox.classList.add("hidden");
    chipsEl.innerHTML = "";
    return;
  }

  // Hitung nama hari kalender
  const parts = tglInput.split("-");
  if (parts.length !== 3) return;
  const dObj = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
  const namaHari = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ][dObj.getDay()];
  if (hariLabel) hariLabel.textContent = namaHari;

  // Pastikan jadwalDataCache terisi
  if (!jadwalDataCache.length) {
    try {
      const res = await runServer("getDaftarJadwal", currentUser.username);
      if (res.success) jadwalDataCache = res.data || [];
    } catch (e) {}
  }

  const JAMKE_INDEX = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
  const jadwalHariIni = jadwalDataCache
    .filter((j) => j.username === username && j.hari === namaHari)
    .sort(
      (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
    );

  if (!jadwalHariIni.length) {
    autoBox.classList.remove("hidden");
    chipsEl.innerHTML = `<span style="font-size: 11px; color: #64748b; font-style: italic;">Tidak ada jadwal mengajar tetap untuk hari ${namaHari}. Anda dapat memilih Mapel &amp; Kelas manual di bawah.</span>`;
    return;
  }

  autoBox.classList.remove("hidden");
  chipsEl.innerHTML = jadwalHariIni
    .map(
      (j) => `
    <button type="button" class="manual-schedule-chip" onclick="pilihJadwalManualAuto(this, '${escJs(j.mataPelajaran)}', '${escJs(j.kelas)}', '${escJs(j.jamKe)}')">
      <strong>Jam ${esc(j.jamKe)}:</strong> ${esc(j.mataPelajaran)} &middot; Kelas ${esc(j.kelas)}
    </button>
  `,
    )
    .join("");
}

function pilihJadwalManualAuto(btnEl, mapel, kelas, jamKe) {
  document
    .querySelectorAll(".manual-schedule-chip")
    .forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  isiSelectAtauLainnya("manualMapel", "manualMapelManual", mapel);
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", kelas);
  const jamKeEl = document.getElementById("manualJamKe");
  if (jamKeEl) jamKeEl.value = jamKe;

  showToast(`Terisi otomatis: Jam ${jamKe} · ${mapel} (${kelas})`, "info");
}

function isiDefaultMapelKelasManual() {
  const username = document.getElementById("manualGuru").value;
  const g = daftarGuruCache.find((x) => x.username === username);
  isiSelectAtauLainnya(
    "manualMapel",
    "manualMapelManual",
    g ? g.mataPelajaran : "",
  );
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", g ? g.kelas : "");
  document.getElementById("manualJamKe").value =
    g && g.jamKe && g.jamKe !== "-" ? g.jamKe : "";
}

async function handleSimpanKehadiranManual(e) {
  e.preventDefault();
  const username = document.getElementById("manualGuru").value;
  const tanggalInput = document.getElementById("manualTanggal").value; // yyyy-MM-dd
  if (!username || !tanggalInput) {
    showToast("Guru dan tanggal wajib diisi", "error");
    return;
  }
  const [y, m, d] = tanggalInput.split("-");
  const tanggalFormatted = `${d}/${m}/${y}`;
  const statusWaktu = document.getElementById("manualKategori").value;
  const keterangan = document.getElementById("manualKeterangan").value.trim();
  const jamMasukEl = document.getElementById("manualJamMasuk");
  const jamPulangEl = document.getElementById("manualJamPulang");
  const jamMasuk = jamMasukEl ? jamMasukEl.value.trim() : "";
  const jamPulang = jamPulangEl ? jamPulangEl.value.trim() : "";
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer(
      "catatAbsensiHarianManual",
      currentUser.username,
      {
        username: username,
        tanggal: tanggalFormatted,
        statusWaktu: statusWaktu,
        keterangan: keterangan,
        jamMasuk: jamMasuk,
        jamPulang: jamPulang,
      },
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("manualModal").classList.add("hidden");
      muatStatistik("admin");
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
/* =============================================================
   ADMIN — KELOLA AKUN
   ============================================================= */
function formatHariAktifSingkat(hariAktifStr) {
  if (!hariAktifStr) return "Setiap hari";
  const singkatan = {
    Senin: "Sen",
    Selasa: "Sel",
    Rabu: "Rab",
    Kamis: "Kam",
    Jumat: "Jum",
    Sabtu: "Sab",
    Minggu: "Min",
  };
  return String(hariAktifStr)
    .split(",")
    .map((h) => singkatan[h.trim()] || h.trim())
    .join(", ");
}

async function muatDaftarUser() {
  const tbody = document.getElementById("usersBody");
  const wrap = document.getElementById("usersBodyWrap");
  const empty = document.getElementById("usersBodyEmpty");
  try {
    const res = await runServer("getSemuaUser", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    if (!res.data.length) {
      wrap.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    empty.classList.add("hidden");
    usersCache = res.data;
    tbody.innerHTML = res.data.map(barisUser).join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function barisUser(u) {
  return `
      <tr>
        <td data-label="Nama">${esc(u.namaLengkap)}</td>
        <td data-label="Username">${esc(u.username)}</td>
        <td data-label="Peran">${roleLabel(u.role)}</td>
        <td data-label="Hari Aktif">${u.role === "guru" ? esc(formatHariAktifSingkat(u.hariAktif)) : "-"}</td>
        <td data-label="Sergu">${u.role !== "guru" ? "-" : u.statusSergu === "Sergu" ? '<span class="badge muted">Sergu</span>' : u.statusSergu === "Non-Sergu" ? '<span class="badge ok">Non-Sergu</span>' : '<span class="badge warn">Belum diatur</span>'}</td>
        <td data-label="Status">${u.status === "Aktif" ? '<span class="badge ok">Aktif</span>' : '<span class="badge muted">Nonaktif</span>'}</td>
        <td data-label="Aksi">
          ${
            bisaKelolaUser()
              ? `
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button type="button" class="btn btn-icon" onclick="bukaModalUserById('${escJs(u.id)}')" title="Edit">${icon("pencil")}</button>
            <button type="button" class="btn btn-icon text-danger" onclick="konfirmasiHapusUser('${escJs(u.id)}')" title="Hapus">${icon("x")}</button>
          </div>`
              : "-"
          }
        </td>
      </tr>
    `;
}

function filterUserList(q) {
  const tbody = document.getElementById("usersBody");
  const wrap = document.getElementById("usersBodyWrap");
  const empty = document.getElementById("usersBodyEmpty");
  if (!tbody || !wrap || !empty) return;
  const cari = String(q == null ? "" : q)
    .trim()
    .toLowerCase();
  const base = usersCache || [];
  const list = cari
    ? base.filter((u) => {
        const kunci = [
          u.namaLengkap,
          u.username,
          u.mataPelajaran,
          roleLabelPolos(u.role),
          u.statusSergu,
          u.status,
          u.nip,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return kunci.includes(cari);
      })
    : base;
  wrap.classList.toggle("hidden", list.length === 0);
  empty.classList.toggle("hidden", list.length !== 0);
  empty.innerHTML =
    cari && list.length === 0
      ? "Tidak ada hasil untuk kata kunci &quot;" + esc(q) + "&quot;."
      : "Belum ada data guru/staf.";
  tbody.innerHTML = list.map(barisUser).join("");
}

function bukaModalUserById(id) {
  const u = usersCache.find((x) => String(x.id) === String(id));
  if (u) bukaModalUser(u);
}

function roleLabel(r) {
  if (r === "admin") return '<span class="badge muted">Admin</span>';
  if (r === "kepala") return '<span class="badge warn">Kepala</span>';
  if (r === "staf") return '<span class="badge muted">Staf</span>';
  return '<span class="badge ok">Guru</span>';
}
function roleLabelPolos(r) {
  if (r === "admin") return "Admin";
  if (r === "kepala") return "Kepala";
  if (r === "staf") return "Staf";
  return "Guru";
}

function toggleGuruFields() {
  const role = document.getElementById("userRole").value;
  const tampilkan = role === "guru";
  document
    .getElementById("userMapelGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userKelasJamGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userHariAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userStatusSerguGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userMapelAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userKelasAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  const elPengganti = document.getElementById("userIzinkanPenggantiGroup");
  if (elPengganti)
    elPengganti.classList.toggle("hidden", role !== "guru" && role !== "staf");
}

function isiHariAktifCheckbox(hariAktifStr) {
  const terpilih = String(hariAktifStr || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  document.querySelectorAll(".userHariAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
}

function bacaHariAktifCheckbox() {
  return Array.from(document.querySelectorAll(".userHariAktifCheck:checked"))
    .map((cb) => cb.value)
    .join(",");
}

function isiMapelAktifCheckbox(mapelAktifStr) {
  const terpilih = String(mapelAktifStr || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const daftarStandar = Array.from(
    document.querySelectorAll(".userMapelAktifCheck"),
  ).map((cb) => cb.value);
  document.querySelectorAll(".userMapelAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
  // Nilai yang tidak ada di daftar checkbox standar dianggap mapel custom -> masuk kolom "Lainnya"
  const lainnya = terpilih.filter((m) => daftarStandar.indexOf(m) === -1);
  document.getElementById("userMapelAktifLainnya").value = lainnya.join(", ");
}

function bacaMapelAktifCheckbox() {
  const dariCheckbox = Array.from(
    document.querySelectorAll(".userMapelAktifCheck:checked"),
  ).map((cb) => cb.value);
  const dariLainnya = document
    .getElementById("userMapelAktifLainnya")
    .value.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return dariCheckbox.concat(dariLainnya).join(",");
}

function isiKelasAktifCheckbox(kelasAktifStr) {
  const terpilih = String(kelasAktifStr || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const daftarStandar = Array.from(
    document.querySelectorAll(".userKelasAktifCheck"),
  ).map((cb) => cb.value);
  document.querySelectorAll(".userKelasAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
  const lainnya = terpilih.filter((k) => daftarStandar.indexOf(k) === -1);
  document.getElementById("userKelasAktifLainnya").value = lainnya.join(", ");
}

function bacaKelasAktifCheckbox() {
  const dariCheckbox = Array.from(
    document.querySelectorAll(".userKelasAktifCheck:checked"),
  ).map((cb) => cb.value);
  const dariLainnya = document
    .getElementById("userKelasAktifLainnya")
    .value.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return dariCheckbox.concat(dariLainnya).join(",");
}

// Field Mapel & Kelas berupa <select> dengan opsi "Lainnya" yang membuka input teks manual,
// supaya datanya konsisten (memudahkan filter/rekap) tapi tetap fleksibel untuk kasus khusus.
function toggleManualInput(selectId, manualId) {
  const sel = document.getElementById(selectId);
  const manual = document.getElementById(manualId);
  manual.classList.toggle("hidden", sel.value !== "__lainnya__");
}

function isiSelectAtauLainnya(selectId, manualId, value) {
  const sel = document.getElementById(selectId);
  const manual = document.getElementById(manualId);
  const val = value && value !== "-" ? value : "";
  const cocok = Array.from(sel.options).some((opt) => opt.value === val);
  if (val && cocok) {
    sel.value = val;
    manual.value = "";
    manual.classList.add("hidden");
  } else if (val) {
    sel.value = "__lainnya__";
    manual.value = val;
    manual.classList.remove("hidden");
  } else {
    sel.value = "";
    manual.value = "";
    manual.classList.add("hidden");
  }
}

function bacaSelectAtauLainnya(selectId, manualId) {
  const sel = document.getElementById(selectId);
  if (sel.value === "__lainnya__")
    return document.getElementById(manualId).value.trim();
  return sel.value;
}

let __masterKelasCache = null;
let __masterMapelCache = null;

async function ambilDaftarMasterKelasDanMapel() {
  // 1. Ambil daftar kelas aktif dari database (madrasah_kelas)
  let daftarKelas = [];
  try {
    if (!__masterKelasCache) {
      const res = await runServer(
        "getDaftarKelas",
        currentUser ? currentUser.username : "",
      );
      if (res && res.data) {
        __masterKelasCache = res.data;
      }
    }
    if (__masterKelasCache && __masterKelasCache.length) {
      daftarKelas = __masterKelasCache
        .filter((k) => k.isActive !== false)
        .map((k) => k.kodeKelas || k.namaKelas)
        .filter(Boolean);
    }
  } catch (e) {
    daftarKelas = [];
  }

  // Fallback kelas jika madrasah_kelas belum ada data
  if (!daftarKelas.length) {
    daftarKelas = [
      "VII-A",
      "VII-B",
      "VII-C",
      "VII-D",
      "VII-E",
      "VIII-A",
      "VIII-B",
      "VIII-C",
      "VIII-D",
      "VIII-E",
      "IX-A",
      "IX-B",
      "IX-C",
      "IX-D",
      "IX-E",
    ];
  }

  // Urutkan kelas secara rapi
  daftarKelas = Array.from(new Set(daftarKelas)).sort((a, b) => {
    const keyA = typeof kelasSortKey === "function" ? kelasSortKey(a) : 9999;
    const keyB = typeof kelasSortKey === "function" ? kelasSortKey(b) : 9999;
    if (keyA !== keyB) return keyA - keyB;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  // 2. Ambil daftar mata pelajaran dari Master Data Mapel (madrasah_mapel).
  //    Ini satu-satunya sumber opsi mapel; mapel nonaktif tidak ditampilkan.
  let daftarMapel = [];
  try {
    if (!__masterMapelCache) {
      const res = await runServer(
        "getDaftarMapel",
        currentUser ? currentUser.username : "",
      );
      if (res && res.data) __masterMapelCache = res.data;
    }
    if (__masterMapelCache && __masterMapelCache.length) {
      daftarMapel = __masterMapelCache
        .filter((m) => m.aktif !== false)
        .map((m) => m.nama)
        .filter(Boolean);
      // Deduplikasi pertahankan urutan master
      daftarMapel = Array.from(new Set(daftarMapel));
    }
  } catch (e) {
    daftarMapel = [];
  }

  // Fallback HANYA jika master mapel benar-benar belum ada data
  if (!daftarMapel.length) {
    daftarMapel = [
      "Al-Qur'an Hadits",
      "Akidah Akhlak",
      "Aswaja",
      "Fiqih",
      "Sejarah Kebudayaan Islam (SKI)",
      "Bahasa Arab",
      "Nahwu",
      "PPKn",
      "Bahasa Indonesia",
      "Matematika",
      "IPA",
      "IPS",
      "Bahasa Inggris",
      "Seni Budaya",
      "PJOK",
      "Prakarya",
      "Informatika",
      "Bahasa Daerah",
    ];
  }

  return { daftarKelas, daftarMapel };
}

async function renderOpsiDinamisUserModal(u) {
  const { daftarKelas, daftarMapel } = await ambilDaftarMasterKelasDanMapel();

  // Pastikan kelas dan mapel milik user (meskipun kustom/lama) tetap ada di daftar opsi
  const kelasList = Array.from(daftarKelas);
  if (u && u.kelas && u.kelas !== "-" && !kelasList.includes(u.kelas)) {
    kelasList.push(u.kelas);
  }
  if (u && u.kelasAktif) {
    u.kelasAktif.split(",").forEach((k) => {
      const kTrim = k.trim();
      if (kTrim && !kelasList.includes(kTrim)) kelasList.push(kTrim);
    });
  }

  const mapelList = Array.from(daftarMapel);
  if (
    u &&
    u.mataPelajaran &&
    u.mataPelajaran !== "-" &&
    !mapelList.includes(u.mataPelajaran)
  ) {
    mapelList.push(u.mataPelajaran);
  }
  if (u && u.mapelAktif) {
    u.mapelAktif.split(",").forEach((m) => {
      const mTrim = m.trim();
      if (mTrim && !mapelList.includes(mTrim)) mapelList.push(mTrim);
    });
  }

  // 1. Render Dropdown #userMapel
  const userMapelSel = document.getElementById("userMapel");
  if (userMapelSel) {
    let optHtml = '<option value="">- Pilih Mata Pelajaran -</option>';
    mapelList.forEach((m) => {
      optHtml += `<option value="${esc(m)}">${esc(m)}</option>`;
    });
    optHtml += '<option value="__lainnya__">Lainnya (ketik manual)...</option>';
    userMapelSel.innerHTML = optHtml;
  }

  // 2. Render Dropdown #userKelas
  const userKelasSel = document.getElementById("userKelas");
  if (userKelasSel) {
    let optHtml = '<option value="">- Pilih Kelas -</option>';
    kelasList.forEach((k) => {
      optHtml += `<option value="${esc(k)}">${esc(k)}</option>`;
    });
    optHtml += '<option value="__lainnya__">Lainnya (ketik manual)...</option>';
    userKelasSel.innerHTML = optHtml;
  }

  // 3. Render Checkboxes #userMapelAktifCheckboxes
  const mapelCbContainer = document.getElementById("userMapelAktifCheckboxes");
  if (mapelCbContainer) {
    mapelCbContainer.innerHTML = mapelList
      .map((m) => {
        return `<label><input type="checkbox" class="userMapelAktifCheck" value="${esc(m)}">${esc(m)}</label>`;
      })
      .join("");
  }

  // 4. Render Checkboxes #userKelasAktifCheckboxes
  const kelasCbContainer = document.getElementById("userKelasAktifCheckboxes");
  if (kelasCbContainer) {
    kelasCbContainer.innerHTML = kelasList
      .map((k) => {
        return `<label><input type="checkbox" class="userKelasAktifCheck" value="${esc(k)}">${esc(k)}</label>`;
      })
      .join("");
  }
}

async function bukaModalUser(u) {
  document.getElementById("userForm").reset();
  await renderOpsiDinamisUserModal(u);
  if (u) {
    document.getElementById("userModalTitle").textContent = "Edit Akun";
    document.getElementById("userId").value = u.id;
    document.getElementById("userUsername").value = u.username;
    document.getElementById("userUsername").disabled = false;
    document.getElementById("userPassword").placeholder =
      "Kosongkan jika tidak diubah";
    document.getElementById("userPassword").required = false;
    document.getElementById("userNamaLengkap").value = u.namaLengkap;
    document.getElementById("userRole").value = u.role;
    isiSelectAtauLainnya("userMapel", "userMapelManual", u.mataPelajaran);
    isiSelectAtauLainnya("userKelas", "userKelasManual", u.kelas);
    document.getElementById("userJamKe").value =
      u.jamKe && u.jamKe !== "-" ? u.jamKe : "";
    isiHariAktifCheckbox(u.hariAktif);
    document.getElementById("userStatusSergu").value = u.statusSergu || "";
    isiMapelAktifCheckbox(u.mapelAktif);
    isiKelasAktifCheckbox(u.kelasAktif);
    document.getElementById("userNoHp").value = u.noHp === "-" ? "" : u.noHp;
    document.getElementById("userStatus").value = u.status;
    const elIzinPengganti = document.getElementById("userIzinkanPengganti");
    if (elIzinPengganti) elIzinPengganti.checked = !!u.izinkanGuruPengganti;
  } else {
    document.getElementById("userModalTitle").textContent = "Tambah Akun";
    document.getElementById("userId").value = "";
    document.getElementById("userUsername").disabled = false;
    document.getElementById("userPassword").placeholder = "Minimal 6 karakter";
    document.getElementById("userPassword").required = true;
    document.getElementById("userRole").value = "guru";
    document.getElementById("userStatus").value = "Aktif";
    isiSelectAtauLainnya("userMapel", "userMapelManual", "");
    isiSelectAtauLainnya("userKelas", "userKelasManual", "");
    isiHariAktifCheckbox("");
    document.getElementById("userStatusSergu").value = "";
    isiMapelAktifCheckbox("");
    isiKelasAktifCheckbox("");
    const elIzinPengganti = document.getElementById("userIzinkanPengganti");
    if (elIzinPengganti) elIzinPengganti.checked = false;
  }
  toggleGuruFields();
  document.getElementById("userModal").classList.remove("hidden");
}

async function handleSimpanUser(e) {
  e.preventDefault();
  const id = document.getElementById("userId").value;
  const usernameVal = document.getElementById("userUsername").value.trim();
  const namaLengkapVal = document
    .getElementById("userNamaLengkap")
    .value.trim();
  const passwordVal = document.getElementById("userPassword").value;
  const isEdit = !!id;
  if (!usernameVal) {
    showToast("Username wajib diisi", "error");
    return;
  }
  if (!namaLengkapVal) {
    showToast("Nama lengkap wajib diisi", "error");
    return;
  }
  if (!isEdit && !passwordVal) {
    showToast("Password wajib diisi untuk akun baru", "error");
    return;
  }
  const payload = {
    requestedBy: currentUser.username,
    id: id,
    username: usernameVal,
    password: passwordVal,
    namaLengkap: namaLengkapVal,
    role: document.getElementById("userRole").value,
    mataPelajaran: bacaSelectAtauLainnya("userMapel", "userMapelManual"),
    kelas: bacaSelectAtauLainnya("userKelas", "userKelasManual"),
    jamKe: document.getElementById("userJamKe").value,
    hariAktif: bacaHariAktifCheckbox(),
    statusSergu: document.getElementById("userStatusSergu").value,
    mapelAktif: bacaMapelAktifCheckbox(),
    kelasAktif: bacaKelasAktifCheckbox(),
    noHp: document.getElementById("userNoHp").value.trim(),
    status: document.getElementById("userStatus").value,
    izinkanGuruPengganti: document.getElementById("userIzinkanPengganti")
      ? document.getElementById("userIzinkanPengganti").checked
      : false,
  };
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan akun...");
  try {
    const res = id
      ? await runServer("updateUser", payload)
      : await runServer("tambahUser", payload);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("userModal").classList.add("hidden");
      daftarGuruCache = [];
      luapkanMuatan("users");
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function konfirmasiHapusUser(id) {
  const u = usersCache.find((x) => String(x.id) === String(id));
  const nama = u ? u.namaLengkap : "akun ini";
  showConfirmModal(
    "Hapus Akun",
    'Yakin ingin menghapus akun "' +
      nama +
      '" secara permanen? Tindakan ini tidak dapat dibatalkan.',
    "Ya, Hapus",
    function () {
      hapusUserSekarang(id);
    },
  );
}
async function hapusUserSekarang(id) {
  showLoading("Menghapus akun...");
  try {
    const res = await runServer("hapusUser", currentUser.username, id);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      daftarGuruCache = [];
      luapkanMuatan("users");
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

/* =============================================================
   ADMIN — IMPOR AKUN GURU MASSAL
   ============================================================= */
function bukaModalImpor() {
  __modalOpen(
    "Impor Akun Guru Massal",
    '<div style="font-size:12px;color:#475569;margin-bottom:10px;line-height:1.7;">' +
      "<b>Langkah:</b><br>" +
      "1. Klik <b>Unduh Template Excel</b> untuk mendapat berkas contoh berwarna.<br>" +
      "2. Isi data guru di Excel (wajib: <b>Nama Lengkap</b> saja, username &amp; password otomatis jika kosong).<br>" +
      "3. Simpan berkas, lalu unggah di sini." +
      "</div>" +
      '<label for="mImporFileGuru" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--brand-emerald-500);border-radius:12px;padding:24px 12px;background:var(--brand-emerald-50);cursor:pointer;text-align:center;">' +
      '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="var(--brand-emerald-800)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
      '<span style="font-size:13px;font-weight:700;color:var(--brand-emerald-800);">Klik untuk pilih berkas Excel</span>' +
      '<span id="mImporNamaGuru" style="font-size:12px;color:#64748b;">Mendukung .xlsx, .xls, dan .csv</span>' +
      "</label>" +
      '<input type="file" id="mImporFileGuru" accept=".xlsx,.xls,.csv" style="display:none;">' +
      '<div id="mImporInfoGuru" style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.6;"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;">' +
      '<button type="button" style="background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;" onclick="unduhTemplateGuru()">Unduh Template Excel</button>' +
      '<span style="font-size:11px;color:#94a3b8;">Baris pertama = judul kolom, dilewati saat impor.</span>' +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Impor", "handleProsesImpor()") +
      "</div>" +
      '<div id="importHasil" class="hidden" style="margin-top:16px;"></div>',
    520,
  );
  window.__daftarImporGuru = [];
  var fi = document.getElementById("mImporFileGuru");
  fi.onchange = function () {
    pilihFileImporGuru(fi.files && fi.files[0] ? fi.files[0] : null);
  };
}
function pilihFileImporGuru(file) {
  var info = document.getElementById("mImporInfoGuru");
  var nama = document.getElementById("mImporNamaGuru");
  if (!file) {
    window.__daftarImporGuru = [];
    if (info) {
      info.style.display = "none";
      info.innerHTML = "";
    }
    if (nama) {
      nama.textContent = "Mendukung .xlsx, .xls, dan .csv";
    }
    return;
  }
  if (nama) {
    nama.textContent = file.name.concat(
      " (",
      (file.size / 1024).toFixed(1),
      " KB)",
    );
  }
  if (typeof XLSX === "undefined") {
    __pasangXLSX().then(
      function () {
        pilihFileImporGuru(file);
      },
      function () {
        showToast(
          "Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.",
          "error",
        );
      },
    );
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), {
        type: "array",
        cellDates: true,
        raw: true,
      });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        cellDates: true,
        defval: "",
      });
      var daftar = [];
      for (var i = 1; i < rows.length; i++) {
        var k = rows[i] || [];
        var kosong = true;
        for (var c = 0; c < 10; c++) {
          if (String(k[c] == null ? "" : k[c]).trim() !== "") {
            kosong = false;
            break;
          }
        }
        if (kosong) continue;
        var nm = String(k[0] == null ? "" : k[0]).trim();
        if (!nm) continue;
        daftar.push({
          namaLengkap: nm,
          username: String(k[1] == null ? "" : k[1]).trim(),
          password: String(k[2] == null ? "" : k[2]).trim(),
          nipNuptk: String(k[3] == null ? "" : k[3]).trim(),
          mataPelajaran: String(k[4] == null ? "" : k[4]).trim(),
          kelas: String(k[5] == null ? "" : k[5]).trim(),
          jamKe: String(k[6] == null ? "" : k[6]).trim(),
          noHp: String(k[7] == null ? "" : k[7]).trim(),
          gelar: String(k[8] == null ? "" : k[8]).trim(),
          statusKepegawaian: String(k[9] == null ? "" : k[9]).trim(),
        });
      }
      window.__daftarImporGuru = daftar;
      if (info) {
        info.style.display = "block";
        if (daftar.length) {
          info.style.background = "var(--brand-emerald-50)";
          info.style.color = "var(--brand-emerald-800)";
          info.style.border = "1px solid var(--brand-emerald-200)";
          info.innerHTML =
            "<b>" + daftar.length + "</b> data guru siap diimpor.";
        } else {
          info.style.background = "#fff1f2";
          info.style.color = "#9f1239";
          info.style.border = "1px solid #fecdd3";
          info.innerHTML =
            "File tidak berisi data guru yang valid (baris 2 dst. kosong).";
        }
      }
    } catch (err) {
      if (info) {
        info.style.display = "block";
        info.style.background = "#fff1f2";
        info.style.color = "#9f1239";
        info.style.border = "1px solid #fecdd3";
        info.innerHTML = "Gagal membaca berkas: " + esc(err.message);
      }
    }
  };
  reader.readAsArrayBuffer(file);
}
async function handleProsesImpor() {
  var daftarGuru = window.__daftarImporGuru;
  if (!daftarGuru || !daftarGuru.length) {
    showToast("Pilih file Excel berisi data guru terlebih dahulu", "error");
    return;
  }
  showLoading("Memproses impor...");
  try {
    var res = await runServer(
      "imporGuruMassal",
      currentUser.username,
      daftarGuru,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      var hasilEl = document.getElementById("importHasil");
      var html = "";
      if (res.kredensial && res.kredensial.length) {
        var tabel =
          '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">' +
          '<tr style="background:var(--brand-emerald-600);color:#fff;"><th style="padding:6px 10px;text-align:left;">Nama</th><th style="padding:6px 10px;text-align:left;">Username</th><th style="padding:6px 10px;text-align:left;">Password</th></tr>';
        var teksKredensial = [];
        for (var i = 0; i < res.kredensial.length; i++) {
          var kr = res.kredensial[i];
          var bg = i % 2 === 0 ? "#FEF9C3" : "#F0F9FF";
          tabel +=
            '<tr style="background:' +
            bg +
            ';"><td style="padding:5px 10px;">' +
            esc(kr.nama) +
            '</td><td style="padding:5px 10px;font-family:monospace;">' +
            esc(kr.username) +
            '</td><td style="padding:5px 10px;font-family:monospace;">' +
            esc(kr.password) +
            "</td></tr>";
          teksKredensial.push(
            kr.nama + " | " + kr.username + " | " + kr.password,
          );
        }
        tabel += "</table>";
        html +=
          '<p style="font-weight:700;margin-bottom:6px;color:var(--success);">Berhasil ditambahkan (' +
          res.kredensial.length +
          "):</p>";
        html += tabel;
        html +=
          '<button type="button" class="btn btn-outline btn-block" style="margin-top:10px;" onclick="salinKredensialGuru()">Salin Daftar Username &amp; Password</button>';
        window.__teksKredensialGuru = teksKredensial.join("\n");
      }
      if (res.gagal && res.gagal.length) {
        html +=
          '<p style="font-weight:700; margin-bottom:6px; margin-top:14px; color:var(--danger);">Dilewati (' +
          res.gagal.length +
          '):</p><ul style="margin:0 0 0 18px; font-size:13px; line-height:1.6; color:var(--danger);">' +
          res.gagal
            .map(function (g) {
              return "<li>" + esc(g) + "</li>";
            })
            .join("") +
          "</ul>";
      }
      hasilEl.innerHTML = html;
      hasilEl.classList.remove("hidden");
      daftarGuruCache = [];
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
function salinKredensialGuru() {
  var teks = window.__teksKredensialGuru || "";
  if (!teks) {
    showToast("Tidak ada data kredensial", "error");
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(teks)
      .then(function () {
        showToast("Daftar kredensial berhasil disalin!", "success");
      })
      .catch(function () {
        fallbackSalin(teks);
      });
  } else {
    fallbackSalin(teks);
  }
}
function fallbackSalin(teks) {
  var ta = document.createElement("textarea");
  ta.value = teks;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Daftar kredensial berhasil disalin!", "success");
  } catch (e) {
    showToast("Gagal menyalin, coba manual", "error");
  }
  document.body.removeChild(ta);
}
/* =============================================================
   ADMIN — PENGATURAN SEKOLAH
   ============================================================= */
async function muatPengaturan() {
  try {
    const res = await runServer("getPengaturanLengkap", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const p = res.data;
    document.getElementById("pgNamaSekolah").value = p.NamaSekolah || "";
    document.getElementById("pgNamaKepala").value = p.NamaKepala || "";
    document.getElementById("pgLatitude").value = p.LatitudeSekolah || "";
    document.getElementById("pgLongitude").value = p.LongitudeSekolah || "";
    document.getElementById("pgRadius").value = p.RadiusMeter || "";
    document.getElementById("pgJamMasuk").value = p.JamMasukBatas || "";
    document.getElementById("pgJamPulang").value = p.JamPulangMinimal || "";
    document.getElementById("pgTarifHonor").value =
      p.TarifHonorPerJam || "9000";
    const pgMingguLiburEl = document.getElementById("pgMingguLibur");
    if (pgMingguLiburEl) {
      pgMingguLiburEl.value = p.MingguLibur === "false" ? "false" : "true";
    }
    initGeofenceMap();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleSimpanPengaturan(e) {
  e.preventDefault();
  const latRaw = document.getElementById("pgLatitude").value.trim();
  const lngRaw = document.getElementById("pgLongitude").value.trim();
  const radiusRaw = document.getElementById("pgRadius").value.trim();
  const tarifRaw = document.getElementById("pgTarifHonor").value.trim();
  if (
    latRaw &&
    (isNaN(parseFloat(latRaw)) ||
      parseFloat(latRaw) < -90 ||
      parseFloat(latRaw) > 90)
  ) {
    showToast("Latitude harus berupa angka antara -90 dan 90", "error");
    return;
  }
  if (
    lngRaw &&
    (isNaN(parseFloat(lngRaw)) ||
      parseFloat(lngRaw) < -180 ||
      parseFloat(lngRaw) > 180)
  ) {
    showToast("Longitude harus berupa angka antara -180 dan 180", "error");
    return;
  }
  if (
    radiusRaw &&
    (isNaN(parseFloat(radiusRaw)) || parseFloat(radiusRaw) < 0)
  ) {
    showToast("Radius harus berupa angka tidak negatif", "error");
    return;
  }
  if (tarifRaw && (isNaN(parseFloat(tarifRaw)) || parseFloat(tarifRaw) < 0)) {
    showToast("Tarif honor harus berupa angka tidak negatif", "error");
    return;
  }
  const pgMingguLiburEl = document.getElementById("pgMingguLibur");
  const dataBaru = {
    NamaSekolah: document.getElementById("pgNamaSekolah").value.trim(),
    NamaKepala: document.getElementById("pgNamaKepala").value.trim(),
    LatitudeSekolah: latRaw,
    LongitudeSekolah: lngRaw,
    RadiusMeter: radiusRaw,
    JamMasukBatas: document.getElementById("pgJamMasuk").value.trim(),
    JamPulangMinimal: document.getElementById("pgJamPulang").value.trim(),
    TarifHonorPerJam: tarifRaw,
    MingguLibur: pgMingguLiburEl ? pgMingguLiburEl.value : "true",
  };
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan pengaturan...");
  try {
    const res = await runServer(
      "updatePengaturan",
      currentUser.username,
      dataBaru,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      infoSekolahCache = null;
      __masterMapelCache = null;
      __masterKelasCache = null;
      luapkanMuatan("jadwal");
      try {
        const info = await runServer("getInfoSekolah");
        infoSekolahCache = info;
        document
          .querySelectorAll(".js-nama-sekolah")
          .forEach((el) => (el.textContent = info.namaSekolah));
        await muatDaftarJadwal();
      } catch (e) {}
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function gunakanLokasiSaatIni() {
  if (!navigator.geolocation) {
    showToast("Perangkat tidak mendukung GPS", "error");
    return;
  }
  showLoading("Mengambil lokasi saat ini...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      hideLoading();
      const nLat = pos.coords.latitude;
      const nLng = pos.coords.longitude;
      document.getElementById("pgLatitude").value = nLat.toFixed(6);
      document.getElementById("pgLongitude").value = nLng.toFixed(6);
      if (geofenceMap) {
        geofenceMap.setView([nLat, nLng], 17);
        if (geofenceMarker) geofenceMarker.setLatLng([nLat, nLng]);
        if (geofenceCircle) geofenceCircle.setLatLng([nLat, nLng]);
      }
      showToast(
        "Koordinat GPS berhasil disesuaikan di peta. Jangan lupa klik Simpan.",
        "success",
      );
    },
    (err) => {
      hideLoading();
      if (err.code === 1 && isDalamIframe()) {
        showToast(
          "Lokasi diblokir karena halaman ini dibuka di dalam situs lain (mis. Google Sites). Buka aplikasi ini langsung di tab baru lalu coba lagi.",
          "error",
        );
      } else {
        showToast("Gagal mengambil lokasi: " + err.message, "error");
      }
    },
    { enableHighAccuracy: true, timeout: 15000 },
  );
}

/* =============================================================
   DEFAULT NILAI FILTER SAAT SECTION DIBUKA
   ============================================================= */
function inisialisasiDefaultBulanTahun() {
  const now = new Date();
  ["adminRekapBulan", "kepalaRekapBulan"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && (!el.value || el.value === ""))
      el.value = String(now.getMonth() + 1);
  });
  ["adminRekapTahun", "kepalaRekapTahun"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && (!el.value || el.value === ""))
      el.value = String(now.getFullYear());
  });
  const honorBulanEl = document.getElementById("honorBulan");
  if (honorBulanEl && (!honorBulanEl.value || honorBulanEl.value === ""))
    honorBulanEl.value = String(now.getMonth() + 1);
  const honorTahunEl = document.getElementById("honorTahun");
  if (honorTahunEl && (!honorTahunEl.value || honorTahunEl.value === ""))
    honorTahunEl.value = String(now.getFullYear());
}

(function setDefaultFilterDates() {
  function applyDefaults() {
    ["adminFilterMulai", "kepalaFilterMulai"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = firstOfMonthInputValue();
    });
    ["adminFilterAkhir", "kepalaFilterAkhir"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = todayInputValue();
    });
    inisialisasiDefaultBulanTahun();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyDefaults);
  } else {
    applyDefaults();
  }
  window.addEventListener("load", applyDefaults);
  setTimeout(applyDefaults, 300);
})();

// ============================================================
// FUNGSI INTERAKTIF LAYOUT & FITUR LENGKAP
// ============================================================

// 1. Dark / Light Mode Toggle & State Persistence
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  } catch (e) {}
}

(function restoreTheme() {
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {}
})();

// 2. Generic Unduh Excel
function unduhAbsensiExcel(rows, judul, role) {
  if (!rows || !rows.length) {
    showToast("Tidak ada data untuk diekspor", "error");
    return;
  }
  const kolom = [
    "No",
    "Tanggal",
    "Jam",
    "Username",
    "Nama Guru",
    "Mata Pelajaran",
    "Kelas",
    "Jam Ke",
    "Jenis",
    "Status Waktu",
    "Status Lokasi",
    "Jarak (m)",
  ];
  const baris = rows.map((r, i) => [
    i + 1,
    r.tanggal || "",
    r.jam || "",
    r.username || "",
    r.namaGuru || "",
    r.mataPelajaran || "",
    r.kelas || "-",
    r.jamKe || "-",
    r.jenisAbsen || "",
    r.statusWaktu || "",
    r.statusLokasi || "",
    r.jarak || 0,
  ]);
  const pre = role === "admin" ? "adminRekap" : "kepalaRekap";
  const bulan = (document.getElementById(pre + "Bulan") || {}).value || "";
  const tahun = (document.getElementById(pre + "Tahun") || {}).value || "";
  const meta = bulan && tahun ? "Periode: " + bulan + " " + tahun : "";
  __eksLapXLS(
    judul,
    meta,
    kolom,
    baris,
    "rekap-absensi-guru.xls",
    [6, 13, 9, 16, 28, 28, 11, 9, 11, 15, 15, 11],
  );
}

// 3. Modal Jadwal & Libur
async function bukaModalJadwal() {
  const m = document.getElementById("jadwalModal");
  if (m) {
    jadwalEditId = null;
    aturJadwalEditMode(false);
    const jf = document.getElementById("jadwalForm");
    if (jf) jf.reset();
    try {
      const { daftarKelas, daftarMapel } =
        await ambilDaftarMasterKelasDanMapel();
      const jkSel = document.getElementById("jadwalKelas");
      if (jkSel) {
        const curK = jkSel.value;
        jkSel.innerHTML =
          '<option value="">- Pilih Kelas -</option>' +
          daftarKelas
            .map((k) => `<option value="${esc(k)}">${esc(k)}</option>`)
            .join("");
        if (curK && daftarKelas.includes(curK)) jkSel.value = curK;
      }
      const jmSel = document.getElementById("jadwalMapel");
      if (jmSel) {
        const curM = jmSel.value;
        jmSel.innerHTML =
          '<option value="">- Pilih Mapel -</option>' +
          daftarMapel
            .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
            .join("");
        if (curM && daftarMapel.includes(curM)) jmSel.value = curM;
      }
    } catch (e) {}
    m.classList.remove("hidden");
  }
}
function tutupModalJadwal() {
  const m = document.getElementById("jadwalModal");
  if (m) m.classList.add("hidden");
}

function bukaModalLibur() {
  const m = document.getElementById("liburModal");
  if (m) m.classList.remove("hidden");
}
function tutupModalLibur() {
  const m = document.getElementById("liburModal");
  if (m) m.classList.add("hidden");
}

function bukaModalManual() {
  if (typeof bukaModalKehadiranManual === "function") {
    bukaModalKehadiranManual();
  }
}

// 4. Quick Date Filter (Admin)
function setQuickDateAdmin(type) {
  const mulaiEl = document.getElementById("adminFilterMulai");
  const akhirEl = document.getElementById("adminFilterAkhir");
  if (!mulaiEl || !akhirEl) return;

  const now = new Date();
  const formatIso = (d) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const todayStr = formatIso(now);

  if (type === "today") {
    mulaiEl.value = todayStr;
    akhirEl.value = todayStr;
  } else if (type === "yesterday") {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = formatIso(yest);
    mulaiEl.value = yestStr;
    akhirEl.value = yestStr;
  } else if (type === "week") {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    mulaiEl.value = formatIso(weekAgo);
    akhirEl.value = todayStr;
  } else if (type === "month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    mulaiEl.value = formatIso(firstDay);
    akhirEl.value = todayStr;
  }
  muatDataAbsensiAdmin();
}

function resetFilterAdmin() {
  const mulaiEl = document.getElementById("adminFilterMulai");
  const akhirEl = document.getElementById("adminFilterAkhir");
  const guruEl = document.getElementById("adminFilterGuru");
  const statusEl = document.getElementById("adminFilterStatus");
  if (mulaiEl) mulaiEl.value = firstOfMonthInputValue();
  if (akhirEl) akhirEl.value = todayInputValue();
  if (guruEl) guruEl.value = "";
  if (statusEl) statusEl.value = "";
  muatDataAbsensiAdmin();
  showToast("Filter presensi telah di-reset", "info");
}

function resetFilterKepala() {
  const mulaiEl = document.getElementById("kepalaFilterMulai");
  const akhirEl = document.getElementById("kepalaFilterAkhir");
  const guruEl = document.getElementById("kepalaFilterGuru");
  const statusEl = document.getElementById("kepalaFilterStatus");
  if (mulaiEl) mulaiEl.value = firstOfMonthInputValue();
  if (akhirEl) akhirEl.value = todayInputValue();
  if (guruEl) guruEl.value = "";
  if (statusEl) statusEl.value = "";
  muatDataAbsensiKepala();
  showToast("Filter presensi telah di-reset", "info");
}

// 5. Status Dropdown Filter (Admin & Kepala)
function saringStatusAbsensi(cache, status) {
  if (!status || status === "Semua" || status === "") return cache || [];
  const s = status.toLowerCase();
  return (cache || []).filter((r) => {
    const w = (r.statusWaktu || "").toLowerCase();
    const j = (r.jenisAbsen || "").toLowerCase();
    const kat = (r.kategori || "").toLowerCase();
    if (s === "hadir") {
      return (
        w === "hadir" ||
        w === "tepat waktu" ||
        w === "terlambat" ||
        w.includes("hadir") ||
        w.includes("tepat") ||
        w.includes("terlambat")
      );
    }
    return w.includes(s) || j.includes(s) || kat.includes(s);
  });
}

function filterStatusAdmin(status) {
  const sel = document.getElementById("adminFilterStatus");
  const val = status !== undefined ? status : sel ? sel.value : "";
  if (sel && status !== undefined && sel.value !== status) {
    sel.value = status === "Semua" ? "" : status;
  }
  const cache = window.__adminAbsensiCache || [];
  renderTabelAbsensi(saringStatusAbsensi(cache, val), "adminAbsensiBody");
}

function filterStatusKepala(status) {
  const sel = document.getElementById("kepalaFilterStatus");
  const val = status !== undefined ? status : sel ? sel.value : "";
  if (sel && status !== undefined && sel.value !== status) {
    sel.value = status === "Semua" ? "" : status;
  }
  const cache = window.__kepalaAbsensiCache || [];
  renderTabelAbsensi(saringStatusAbsensi(cache, val), "kepalaAbsensiBody");
}

// 6. Export Rekap CSV
// 7. Export Users CSV
// 7. Export Users Excel
function exportUsersExcel() {
  const data = usersCache || [];
  if (!data.length) {
    showToast("Data pengguna belum dimuat.", "error");
    return;
  }
  const kolom = [
    "No",
    "Nama Lengkap",
    "Username",
    "Peran",
    "Hari Aktif",
    "Status Sergu",
    "Status Akun",
  ];
  const rows = data.map((u, i) => [
    i + 1,
    u.namaLengkap || "",
    u.username || "",
    roleLabelPolos(u.role) || u.role,
    u.hariAktif || "Setiap hari",
    u.statusSergu || "Belum diatur",
    u.status || "Aktif",
  ]);
  __eksLapXLS(
    "Daftar Guru & Staf",
    "Data per " + __tglIndo(todayInputValue()),
    kolom,
    rows,
    "daftar-guru-dan-staf.xls",
    [6, 34, 18, 16, 14, 20, 14],
  );
}

// 8. Export Jadwal Excel
function exportJadwalExcel() {
  const data =
    (typeof getJadwalTersaring === "function"
      ? getJadwalTersaring()
      : jadwalDataCache) || [];
  if (!data.length) {
    showToast("Tidak ada data jadwal untuk diekspor.", "error");
    return;
  }
  const kolom = [
    "No",
    "Hari",
    "Jam Ke",
    "Mata Pelajaran",
    "Kelas",
    "Guru Pengampu",
    "Username",
  ];
  const rows = data.map((j, i) => [
    i + 1,
    j.hari || "",
    j.jamKe || "",
    j.mataPelajaran || "",
    j.kelas || "",
    j.namaGuru || "",
    j.username || "",
  ]);
  __eksLapXLS(
    "Jadwal Pelajaran",
    "Data per " + __tglIndo(todayInputValue()),
    kolom,
    rows,
    "jadwal-pelajaran.xls",
    [6, 16, 12, 34, 16, 26, 18],
  );
}

function exportJadwalKepalaExcel() {
  exportJadwalExcel();
}

// 9. Honor Functions
function exportHonorExcel() {
  if (typeof XLSX === "undefined") {
    __pasangXLSX().then(
      function () {
        exportHonorExcel();
      },
      function () {
        showToast(
          "Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.",
          "error",
        );
      },
    );
    return;
  }
  const data = honorDataCache || [];
  if (!data.length) {
    showToast(
      "Data honor belum dimuat. Klik Tampilkan terlebih dahulu.",
      "error",
    );
    return;
  }
  const kolom = [
    "No",
    "Nama",
    "Username",
    "Peran",
    "Sesi",
    "Jam",
    "Honor Tambahan",
    "Total Honor",
  ];
  const rows = data.map((g, i) => [
    i + 1,
    g.nama || "",
    g.username || "",
    g.role || "",
    g.totalSesi || 0,
    g.totalJam || 0,
    g.honorTambahan || 0,
    g.totalHonor || 0,
  ]);
  const bulan = (document.getElementById("honorBulan") || {}).value || "";
  const tahun = (document.getElementById("honorTahun") || {}).value || "";
  __eksLapXLS(
    "Rekap Honor Guru",
    bulan && tahun ? "Periode: " + bulan + " " + tahun : "",
    kolom,
    rows,
    "rekap-honor-guru.xls",
    [6, 28, 16, 14, 10, 10, 16, 16],
  );
}

// 10. Cetak Rekap & Cetak Jadwal (Kepala)
function cetakRekapResmiKepala() {
  if (typeof bukaCetakRekapGuru === "function") {
    bukaCetakRekapGuru();
  } else {
    window.print();
  }
}

function cetakJadwalKepala() {
  if (typeof bukaCetakJadwal === "function") {
    bukaCetakJadwal();
  } else {
    window.print();
  }
}
/* =============================================================
   PETA INTERAKTIF GEOFENCE (LEAFLET + OPENSTREETMAP)
   ============================================================= */
let geofenceMap = null;
let geofenceMarker = null;
let geofenceCircle = null;

function initGeofenceMap() {
  const container = document.getElementById("geofenceMap");
  if (!container) return;

  if (typeof L === "undefined") {
    __pasangLeaflet().then(
      function () {
        initGeofenceMap();
      },
      function () {
        showToast(
          "Peta tidak dapat dimuat. Periksa koneksi internet Anda.",
          "error",
        );
      },
    );
    return;
  }

  const latInput = document.getElementById("pgLatitude");
  const lngInput = document.getElementById("pgLongitude");
  const radInput = document.getElementById("pgRadius");

  let lat = parseFloat(latInput ? latInput.value : "") || -7.15;
  let lng = parseFloat(lngInput ? lngInput.value : "") || 112.65;
  let rad = parseFloat(radInput ? radInput.value : "") || 150;

  if (geofenceMap) {
    geofenceMap.setView([lat, lng]);
    if (geofenceMarker) geofenceMarker.setLatLng([lat, lng]);
    if (geofenceCircle) {
      geofenceCircle.setLatLng([lat, lng]);
      geofenceCircle.setRadius(rad);
    }
    setTimeout(() => {
      if (geofenceMap) geofenceMap.invalidateSize();
    }, 200);
    return;
  }

  geofenceMap = L.map("geofenceMap", {
    center: [lat, lng],
    zoom: 17,
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(geofenceMap);

  geofenceCircle = L.circle([lat, lng], {
    color: "#059669",
    fillColor: "#10b981",
    fillOpacity: 0.22,
    weight: 2,
    radius: rad,
  }).addTo(geofenceMap);

  geofenceMarker = L.marker([lat, lng], {
    draggable: true,
  }).addTo(geofenceMap);

  geofenceMarker
    .bindPopup(
      '<b style="font-size:13px; color:#064e3b;">Lokasi Titik Presensi</b><br><span style="font-size:11px; color:#64748b;">Geser pin ini untuk memindahkan titik.</span>',
    )
    .openPopup();

  function updateCoords(newLat, newLng) {
    if (latInput) latInput.value = newLat.toFixed(6);
    if (lngInput) lngInput.value = newLng.toFixed(6);
    if (geofenceCircle) geofenceCircle.setLatLng([newLat, newLng]);
    if (geofenceMarker) geofenceMarker.setLatLng([newLat, newLng]);
  }

  geofenceMarker.on("dragend", function (e) {
    const pos = e.target.getLatLng();
    updateCoords(pos.lat, pos.lng);
  });

  geofenceMap.on("click", function (e) {
    updateCoords(e.latlng.lat, e.latlng.lng);
  });

  if (radInput) {
    radInput.addEventListener("input", function () {
      const newRad = parseFloat(radInput.value) || 100;
      if (geofenceCircle) geofenceCircle.setRadius(newRad);
    });
  }

  if (latInput && lngInput) {
    const handleInputManual = function () {
      const nLat = parseFloat(latInput.value);
      const nLng = parseFloat(lngInput.value);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        geofenceMap.panTo([nLat, nLng]);
        if (geofenceMarker) geofenceMarker.setLatLng([nLat, nLng]);
        if (geofenceCircle) geofenceCircle.setLatLng([nLat, nLng]);
      }
    };
    latInput.addEventListener("change", handleInputManual);
    lngInput.addEventListener("change", handleInputManual);
  }

  setTimeout(() => {
    if (geofenceMap) geofenceMap.invalidateSize();
  }, 300);
}
/* ================================================================
   MODUL SISWA & PRESENSI SISWA
   ================================================================ */
function escH(v) {
  return String(v == null || v === "<nil>" ? "" : v).replace(
    /[&<>"']/g,
    function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    },
  );
}
function __pad2(n) {
  return String(n).padStart(2, "0");
}
function __tglIndo(v) {
  var r = String(v || "").split("-");
  return r.length === 3 ? r[2] + "/" + r[1] + "/" + r[0] : "";
}
function __tglISO(indo) {
  var r = String(indo || "").split("/");
  return r.length === 3 ? r[2] + "-" + r[1] + "-" + r[0] : String(indo || "");
}
function __tglTodayISO() {
  var d = new Date();
  return (
    d.getFullYear() + "-" + __pad2(d.getMonth() + 1) + "-" + __pad2(d.getDate())
  );
}
function __bulanAwalISO() {
  var d = new Date();
  return d.getFullYear() + "-" + __pad2(d.getMonth() + 1) + "-01";
}
function __bulanAkhirISO() {
  var d = new Date();
  return (
    d.getFullYear() +
    "-" +
    __pad2(d.getMonth() + 1) +
    "-" +
    __pad2(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  );
}
function __hariIndo(iso) {
  var d = iso ? new Date(iso + "T00:00:00") : new Date();
  return d.toLocaleDateString("id-ID", { weekday: "long" }).toUpperCase();
}
function __badge(txt, kind) {
  var bg = "rgba(99, 102, 241, 0.15)",
    fg = "#818cf8",
    bd = "rgba(99, 102, 241, 0.3)";
  if (kind === "green") {
    bg = "rgba(16, 185, 129, 0.15)";
    fg = "#34d399";
    bd = "rgba(52, 211, 153, 0.3)";
  }
  if (kind === "muted") {
    bg = "rgba(148, 163, 184, 0.15)";
    fg = "var(--slate)";
    bd = "rgba(148, 163, 184, 0.3)";
  }
  if (kind === "red") {
    bg = "rgba(244, 63, 94, 0.15)";
    fg = "#fb7185";
    bd = "rgba(251, 113, 133, 0.3)";
  }
  return (
    '<span style="background:' +
    bg +
    ";color:" +
    fg +
    ";border:1px solid " +
    bd +
    ';padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;display:inline-block;">' +
    txt +
    "</span>"
  );
}
function __btnUtama(l, o, x) {
  return (
    '<button type="button" style="background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;' +
    (x || "") +
    '" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnSekunder(l, o, x) {
  return (
    '<button type="button" style="background:var(--parchment-alt);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;' +
    (x || "") +
    '" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnBahaya(l, o) {
  return (
    '<button type="button" style="background:rgba(239,68,68,0.12);color:#fb7185;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:12px;" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnPending(l, o) {
  return (
    '<button type="button" style="background:#f59e0b;color:#fff;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:12px;" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __inp(id, v) {
  return (
    '<input id="' +
    id +
    '" value="' +
    escH(v == null ? "" : v) +
    '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);box-sizing:border-box;">'
  );
}
function __label(t) {
  return (
    '<div style="font-size:12px;color:var(--slate);margin-bottom:4px;font-weight:600;">' +
    t +
    "</div>"
  );
}
function __spinner() {
  return '<div style="padding:26px;text-align:center;color:var(--slate-light);font-size:13px;">Memuat...</div>';
}
function __kosong(msg) {
  return (
    '<div style="padding:26px;text-align:center;color:var(--slate-light);font-size:13px;">' +
    (msg || "Tidak ada data.") +
    "</div>"
  );
}
function __errBox(msg) {
  return (
    '<div class="card" style="padding:20px;"><div style="padding:12px;text-align:center;color:#fb7185;font-size:13px;">' +
    escH(msg || "Gagal memuat data") +
    "</div></div>"
  );
}
function __modalOpen(titel, body, dialogClass) {
  var isRosterModal = dialogClass === "presensi-roster";
  var ov = document.createElement("div");
  ov.setAttribute("data-ov", "1");
  if (isRosterModal) ov.className = "presensi-roster-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", titel || "Dialog");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;z-index:3000;padding:max(8px, 1.5vw);backdrop-filter:blur(4px);";
  var modalHeader = isRosterModal
    ? '<div class="presensi-roster-modal-header">' +
      '<h2 id="__modalTtl" class="presensi-roster-modal-title">' +
      titel +
      "</h2>" +
      '<button type="button" class="js-modal-x presensi-roster-modal-close" aria-label="Tutup">&times;</button>' +
      "</div>"
    : '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2;">' +
      '<h2 id="__modalTtl" style="margin:0;font-size:16px;font-weight:700;color:var(--ink);">' +
      titel +
      "</h2>" +
      '<button type="button" class="js-modal-x" aria-label="Tutup" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--slate);line-height:1;">&times;</button>' +
      "</div>";
  var modalBodyClass = isRosterModal ? "presensi-roster-body" : "";
  var modalBodyStyle = isRosterModal
    ? ""
    : ' style="padding:14px 16px;color:var(--ink);overflow-y:auto;flex:1;min-height:0;"';
  var modalBoxClass =
    "modal-box no-scrollbar" +
    (isRosterModal ? " presensi-roster-box" : "");
  ov.innerHTML =
    '<div class="' +
    modalBoxClass +
    '" style="background:var(--surface);border:1px solid var(--line);border-radius:16px;max-width:620px;width:100%;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-xl);">' +
    modalHeader +
    '<div class="' +
    modalBodyClass +
    '" data-modal-body role="region" aria-labelledby="__modalTtl"' +
    modalBodyStyle +
    ">" +
    body +
    "</div></div>";
  document.body.appendChild(ov);
  // Simpan titik fokus lama utk dipulihkan saat modal ditutup.
  var fokusSebelum = document.activeElement;
  ov.querySelector(".js-modal-x").addEventListener("click", function () {
    __modalClose();
    if (fokusSebelum && fokusSebelum.focus) fokusSebelum.focus();
  });
  window.__modalOv = ov;
  window.__modalPrevFocus = fokusSebelum;
  // Pindahkan fokus ke dalam modal.
  var fSelektor =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  var fTarget = ov.querySelector(fSelektor);
  if (fTarget) fTarget.focus();
  return ov;
}
function __modalBody() {
  var ov = window.__modalOv;
  return ov ? ov.querySelector("[data-modal-body]") : null;
}
function __modalClose() {
  var ov = window.__modalOv;
  if (ov) {
    var prev = window.__modalPrevFocus;
    ov.remove();
    window.__modalOv = null;
    window.__modalPrevFocus = null;
    if (prev && prev.focus && document.contains(prev)) prev.focus();
  }
}

// Konfirmasi aksi bergaya internal (menggantikan confirm() native yang tampil
// tidak konsisten dengan design system & memblokir interaksi). onYa dipanggil
// hanya jika pengguna menekan tombol ya. gayaYa: 'danger' | 'primary'.
function showConfirmModal(titel, pesan, labelYa, onYa, gayaYa) {
  if (window.__confirmOv) return;
  var ov = document.createElement("div");
  ov.setAttribute("data-ov", "1");
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", titel || "Konfirmasi");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;z-index:3100;padding:12px;backdrop-filter:blur(4px);";
  ov.innerHTML =
    '<div class="modal-box no-scrollbar" style="background:var(--surface);border:1px solid var(--line);border-radius:16px;max-width:430px;width:100%;box-shadow:var(--shadow-xl);">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);">' +
    '<h2 id="__confirmTtl" style="margin:0;font-size:15px;font-weight:700;color:var(--ink);">' +
    esc(titel || "Konfirmasi") +
    "</h2>" +
    '<button type="button" class="js-confirm-x" aria-label="Tutup" style="border:none;background:none;font-size:22px;cursor:pointer;color:var(--slate);line-height:1;">&times;</button>' +
    "</div>" +
    '<div role="region" aria-labelledby="__confirmTtl" style="padding:18px;color:var(--ink);font-size:13.5px;line-height:1.6;white-space:pre-line;">' +
    esc(pesan) +
    "</div>" +
    '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);">' +
    '<button type="button" class="btn btn-outline js-confirm-no">Batal</button>' +
    '<button type="button" class="btn ' +
    (gayaYa === "primary" ? "btn-primary" : "btn-danger") +
    ' js-confirm-yes">' +
    esc(labelYa || "Ya") +
    "</button>" +
    "</div></div>";
  document.body.appendChild(ov);
  window.__confirmOv = ov;
  function tutup(hasil) {
    ov.remove();
    window.__confirmOv = null;
    if (hasil && typeof onYa === "function") onYa();
  }
  ov.querySelector(".js-confirm-x").addEventListener("click", function () {
    tutup(false);
  });
  ov.querySelector(".js-confirm-no").addEventListener("click", function () {
    tutup(false);
  });
  ov.querySelector(".js-confirm-yes").addEventListener("click", function () {
    tutup(true);
  });
  ov.addEventListener("click", function (e) {
    if (e.target === ov) tutup(false);
  });
  var noBtn = ov.querySelector(".js-confirm-no");
  if (noBtn) noBtn.focus();
}
/* ---------- ADMIN: SUB-NAV DATA SISWA ---------- */
var __sSubMap = { siswa: "1", kelas: "2", tahun: "3", assign: "4", rekap: "5" };
function subAdminSiswa(tab) {
  document
    .querySelectorAll("#adminWorkspaceNav .nav-sub-item")
    .forEach((el) => el.classList.remove("active"));
  Object.keys(__sSubMap).forEach(function (k) {
    var el = document.getElementById(
      "adminSiswaTab" + k.charAt(0).toUpperCase() + k.slice(1),
    );
    if (el) el.classList.toggle("hidden", k !== tab);
    var b = document.getElementById("navAdminSiswa" + __sSubMap[k]);
    if (b) b.classList.toggle("active", k === tab);
  });
  if (tab === "siswa") muatTabelSiswa();
  if (tab === "kelas") muatTabelKelas();
  if (tab === "tahun") muatTabelTahun();
  if (tab === "assign") muatAssignSiswa();
  if (tab === "rekap") muatRekapSiswa();
}
function muatAdminSiswa() {
  subAdminSiswa("siswa");
}

/* ---------- ADMIN: DATA SISWA ---------- */
var __siswaCache = [];
var __siswaPage = 1,
  __siswaTotal = 0,
  __siswaPer = 20;
function __debounce(fn, ms) {
  clearTimeout(__debounce._t);
  __debounce._t = setTimeout(fn, ms || 300);
}
function __siswaPindah(d) {
  __siswaPage = Math.max(
    1,
    Math.min(
      __siswaPage + d,
      Math.max(1, Math.ceil(__siswaTotal / __siswaPer)),
    ),
  );
  muatTabelSiswa();
}
function __pagingHalaman() {
  var totalHalaman = Math.max(1, Math.ceil(__siswaTotal / __siswaPer));
  if (totalHalaman <= 1) return "";
  return (
    '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:12px;font-size:12px;color:#475569;">' +
    "<span>Total " +
    __siswaTotal +
    " siswa</span>" +
    '<button type="button" onclick="__siswaPindah(-1)" style="padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-alt);color:var(--ink);cursor:pointer;' +
    (__siswaPage <= 1 ? "opacity:.4;" : "") +
    '">&larr; Sebelumnya</button>' +
    "<span>Hal " +
    __siswaPage +
    " / " +
    totalHalaman +
    "</span>" +
    '<button type="button" onclick="__siswaPindah(1)" style="padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-alt);color:var(--ink);cursor:pointer;' +
    (__siswaPage >= totalHalaman ? "opacity:.4;" : "") +
    '">Berikutnya &rarr;</button>' +
    "</div>"
  );
}
async function muatTabelSiswa() {
  var el = document.getElementById("adminSiswaTabSiswa");
  if (!el) return;
  // Catat fokus kotak cari supaya bisa dipulihkan setelah innerHTML terganti
  // (el.innerHTML menghapus elemen input yang sedang difokuskan).
  var focusCari =
    document.activeElement && document.activeElement.id === "adminSiswaCari";
  var cari = "",
    kelasId = 0;
  var kf = document.getElementById("adminSiswaKelasFilter");
  if (kf) kelasId = parseInt(kf.value || "0", 10) || 0;
  var ci = document.getElementById("adminSiswaCari");
  if (ci) cari = ci.value.trim();
  el.innerHTML = __spinner();
  var rows = [],
    optKelas = '<option value="0">Semua Kelas</option>',
    total = 0;
  try {
    var kelas = await runServer("getDaftarKelas", currentUser.username);
    optKelas =
      '<option value="0">Semua Kelas</option>' +
      (kelas.data || [])
        .map(function (k) {
          return (
            '<option value="' +
            k.id +
            '"' +
            (k.id === kelasId ? " selected" : "") +
            ">" +
            escH(k.kodeKelas) +
            "</option>"
          );
        })
        .join("");
    var res = await runServer(
      "getDaftarSiswa",
      currentUser.username,
      kelasId,
      cari,
      __siswaPage,
      __siswaPer,
    );
    rows = res.data || [];
    total = res.total != null ? res.total : rows.length;
  } catch (e) {
    el.innerHTML = __errBox(e.message);
    return;
  }
  __siswaCache = rows;
  __siswaTotal = total;
  el.innerHTML =
    '<div class="card" style="padding:18px 20px;">' +
    '<div class="admin-siswa-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
    '<div class="admin-siswa-filters" style="display:flex;flex-wrap:wrap;gap:8px;">' +
    '<select id="adminSiswaKelasFilter" style="padding:9px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);" onchange="__siswaPage=1;muatTabelSiswa()">' +
    optKelas +
    "</select>" +
    '<input id="adminSiswaCari" placeholder="Cari nama / NIS" value="' +
    escH(cari) +
    '" style="padding:9px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;min-width:180px;background:var(--parchment-alt);color:var(--ink);" onkeyup="__debounce(function(){__siswaPage=1;muatTabelSiswa();},300)">' +
    "</div>" +
    '<div class="admin-siswa-actions" style="display:flex;gap:8px;">' +
    __btnSekunder("Export Excel", "exportDataSiswa()") +
    __btnSekunder("Impor Massal", "bukaModalImporSiswa()") +
    __btnUtama("+ Tambah Siswa", "bukaModalSiswa()") +
    "</div>" +
    "</div>" +
    __tabelSiswa(rows, (__siswaPage - 1) * __siswaPer) +
    __pagingHalaman() +
    "</div>";
  // Pulihkan fokus + caret pada kotak cari setelah ulang render.
  if (focusCari) {
    var ni = document.getElementById("adminSiswaCari");
    if (ni) {
      ni.focus();
      try {
        ni.setSelectionRange(ni.value.length, ni.value.length);
      } catch (e) {}
    }
  }
}
async function exportDataSiswa() {
  if (typeof XLSX === "undefined") {
    if (
      !(await __pasangXLSX().catch(function () {
        return false;
      }))
    ) {
      showToast(
        "Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.",
        "error",
      );
      return;
    }
  }
  try {
    showLoading("Menyiapkan ekspor siswa...");
    var kelasId = 0,
      cari = "";
    var kf = document.getElementById("adminSiswaKelasFilter");
    if (kf) kelasId = parseInt(kf.value || "0", 10) || 0;
    var ci = document.getElementById("adminSiswaCari");
    if (ci) cari = ci.value.trim();
    var semua = [],
      total = 0,
      page = 1;
    while (true) {
      var res = await runServer(
        "getDaftarSiswa",
        currentUser.username,
        kelasId,
        cari,
        page,
        200,
      );
      if (!res || !res.success) {
        showToast(
          (res && res.message) || "Gagal mengambil data siswa",
          "error",
        );
        break;
      }
      total = res.total != null ? res.total : res.data.length;
      semua = semua.concat(res.data || []);
      if (semua.length >= total || !res.data || !res.data.length) break;
      page++;
    }
    hideLoading();
    if (!semua.length) {
      showToast("Tidak ada data siswa untuk diekspor", "error");
      return;
    }
    var meta = "Total " + total + " siswa";
    if (
      kelasId > 0 &&
      kf &&
      kf.selectedIndex >= 0 &&
      kf.options[kf.selectedIndex]
    ) {
      meta += " | Kelas: " + kf.options[kf.selectedIndex].text;
    }
    if (cari) {
      meta += ' | Cari: "' + cari + '"';
    }
    var kolom = [
      "No",
      "NIS",
      "NISN",
      "Nama Lengkap",
      "Jenis Kelamin",
      "Tempat Lahir",
      "Tanggal Lahir",
      "Alamat",
      "Nama Ortu",
      "No HP Ortu",
      "Kelas",
      "Tahun Ajaran",
      "Status",
    ];
    var baris = semua.map(function (s, i) {
      return [
        i + 1,
        s.nis || "",
        s.nisn || "",
        s.namaLengkap || "",
        s.jenisKelamin || "",
        s.tempatLahir || "",
        (s.tanggalLahir || "").replace(/-/g, "/"),
        s.alamat || "",
        s.namaOrtu || "",
        s.noHpOrtu || "",
        s.kelas || "-",
        s.tahunAjaran || "-",
        s.status || "",
      ];
    });
    __eksLapXLS(
      "Data Siswa",
      meta,
      kolom,
      baris,
      "data-siswa.xlsx",
      [5, 10, 14, 24, 12, 16, 15, 30, 20, 14, 12, 16, 10],
    );
  } catch (e) {
    if (typeof hideLoading === "function") hideLoading();
    showToast(e.message || "Gagal mengekspor data siswa", "error");
  }
}
function __tabelSiswa(rows, offset) {
  offset = offset || 0;
  if (!rows.length)
    return __kosong("Belum ada data siswa. Tambahkan lewat tombol di atas.");
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:9px 10px;">No</th><th style="padding:9px 10px;">NIS</th><th style="padding:9px 10px;">Nama Lengkap</th><th style="padding:9px 10px;">Kelas</th><th style="padding:9px 10px;">Status</th><th style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;">Aksi</th></tr></thead>';
  var tr = rows
    .map(function (s, i) {
      var nm =
        '<span style="font-weight:600;color:var(--ink);">' +
        escH(s.namaLengkap) +
        '</span><div style="font-size:11px;color:var(--slate-light);">' +
        escH(s.tahunAjaran || "") +
        "</div>";
      var st =
        s.status === "Aktif"
          ? __badge("Aktif", "green")
          : __badge(escH(s.status || "-"), "muted");
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:9px 10px;color:var(--slate-light);">' +
        (offset + i + 1) +
        '</td><td style="padding:9px 10px;color:var(--ink);">' +
        escH(s.nis) +
        '</td><td style="padding:9px 10px;">' +
        nm +
        '</td><td style="padding:9px 10px;">' +
        __badge(escH(s.kelas || "-"), "muted") +
        '</td><td style="padding:9px 10px;">' +
        st +
        '</td><td style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;"><span style="display:inline-flex;align-items:center;gap:6px;">' +
        __btnSekunder(
          "Edit",
          "bukaModalSiswa(" + s.id + ")",
          "padding:6px 10px;font-size:12px;",
        ) +
        __btnPending("Kelas", "bukaModalPindahSiswa(" + s.id + ")") +
        __btnBahaya("Hapus", "hapusSiswa(" + s.id + ")") +
        "</span></td></tr>"
      );
    })
    .join("");
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}
function bukaModalSiswa(id) {
  var s = id
    ? window.__siswaCache.find(function (x) {
        return x.id === id;
      }) || {}
    : {};
  var jkOpts =
    '<option value="Laki-laki"' +
    (String(s.jenisKelamin || "").toLowerCase() !== "perempuan"
      ? " selected"
      : "") +
    '>Laki-laki</option><option value="Perempuan"' +
    (String(s.jenisKelamin || "").toLowerCase() === "perempuan"
      ? " selected"
      : "") +
    ">Perempuan</option>";
  var stOpts =
    '<option value="Aktif"' +
    (String(s.status || "Aktif") !== "Nonaktif" ? " selected" : "") +
    '>Aktif</option><option value="Nonaktif"' +
    (String(s.status || "") === "Nonaktif" ? " selected" : "") +
    ">Nonaktif</option>";
  var v = function (k, d) {
    return s[k] == null ? d || "" : String(s[k]);
  };
  window.__siswaEditId = id || 0;
  __modalOpen(
    "Data Siswa" + (id ? " (edit)" : ""),
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      "<div>" +
      __label("NIS *") +
      __inp("mSiswaNis", v("nis")) +
      "</div>" +
      "<div>" +
      __label("NISN") +
      __inp("mSiswaNisn", v("nisn")) +
      "</div>" +
      "<div>" +
      __label("NIM / Nomor Induk") +
      __inp("mSiswaNim", v("nim")) +
      "</div>" +
      "<div>" +
      __label("NIK") +
      __inp("mSiswaNik", v("nik")) +
      "</div>" +
      '<div style="grid-column:1 / -1;">' +
      __label("Nama Lengkap *") +
      __inp("mSiswaNama", v("namaLengkap")) +
      "</div>" +
      "<div>" +
      __label("Jenis Kelamin") +
      '<select id="mSiswaJk" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      jkOpts +
      "</select></div>" +
      "<div>" +
      __label("Status") +
      '<select id="mSiswaStatus" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      stOpts +
      "</select></div>" +
      "<div>" +
      __label("Tempat Lahir") +
      __inp("mSiswaTempat", v("tempatLahir")) +
      "</div>" +
      "<div>" +
      __label("Tanggal Lahir") +
      '<input type="date" id="mSiswaTgl" value="' +
      escH(__tglISO(v("tanggalLahir"))) +
      '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
      '<div style="grid-column:1 / -1;">' +
      __label("Alamat (Jalan/RT-RW)") +
      __inp("mSiswaAlamat", v("alamat")) +
      "</div>" +
      "<div>" +
      __label("Desa / Kelurahan") +
      __inp("mSiswaDesa", v("desa")) +
      "</div>" +
      "<div>" +
      __label("Kecamatan") +
      __inp("mSiswaKec", v("kecamatan")) +
      "</div>" +
      "<div>" +
      __label("Kabupaten / Kota") +
      __inp("mSiswaKab", v("kabupaten")) +
      "</div>" +
      "<div>" +
      __label("Tahun Masuk") +
      '<input type="number" id="mSiswaThnMasuk" value="' +
      escH(v("tahunMasuk", "0")) +
      '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
      "<div>" +
      __label("Nama Orang Tua (Ayah/Ibu)") +
      __inp("mSiswaOrtu", v("namaOrtu")) +
      "</div>" +
      "<div>" +
      __label("No. HP Orang Tua") +
      __inp("mSiswaHpOrtu", v("noHpOrtu")) +
      "</div>" +
      "<div>" +
      __label("Nama Ayah") +
      __inp("mSiswaAyah", v("namaAyah")) +
      "</div>" +
      "<div>" +
      __label("Nama Ibu") +
      __inp("mSiswaIbu", v("namaIbu")) +
      "</div>" +
      "<div>" +
      __label("Pekerjaan Ayah") +
      __inp("mSiswaPekAyah", v("pekerjaanAyah")) +
      "</div>" +
      "<div>" +
      __label("Pekerjaan Ibu") +
      __inp("mSiswaPekIbu", v("pekerjaanIbu")) +
      "</div>" +
      "<div>" +
      __label("Anak Ke") +
      __inp("mSiswaAnakKe", v("anakKe")) +
      "</div>" +
      "<div>" +
      __label("Umur") +
      __inp("mSiswaUmur", v("umur")) +
      "</div>" +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Simpan", "simpanSiswa()") +
      "</div>",
  );
}
async function simpanSiswa() {
  var g = function (id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : "";
  };
  var payload = {
    id: window.__siswaEditId || 0,
    nis: g("mSiswaNis"),
    nisn: g("mSiswaNisn"),
    nim: g("mSiswaNim"),
    nik: g("mSiswaNik"),
    namaLengkap: g("mSiswaNama"),
    jenisKelamin: g("mSiswaJk"),
    tempatLahir: g("mSiswaTempat"),
    tanggalLahir: __tglIndo(g("mSiswaTgl")),
    alamat: g("mSiswaAlamat"),
    namaOrtu: g("mSiswaOrtu"),
    noHpOrtu: g("mSiswaHpOrtu"),
    status: g("mSiswaStatus"),
    namaAyah: g("mSiswaAyah"),
    namaIbu: g("mSiswaIbu"),
    pekerjaanAyah: g("mSiswaPekAyah"),
    pekerjaanIbu: g("mSiswaPekIbu"),
    desa: g("mSiswaDesa"),
    kecamatan: g("mSiswaKec"),
    kabupaten: g("mSiswaKab"),
    anakKe: g("mSiswaAnakKe"),
    umur: g("mSiswaUmur"),
    tahunMasuk:
      parseInt(document.getElementById("mSiswaThnMasuk").value || "0", 10) || 0,
  };
  if (!payload.nis) {
    showToast("NIS wajib diisi", "error");
    return;
  }
  if (!payload.namaLengkap) {
    showToast("Nama lengkap wajib diisi", "error");
    return;
  }
  if (cekAksiBerjalan()) return;
  window.__aksiBerjalan = true;
  try {
    var res = await runServer("simpanSiswa", currentUser.username, payload);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __modalClose();
      luapkanMuatan("siswa");
      muatTabelSiswa();
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    window.__aksiBerjalan = false;
  }
}
async function hapusSiswa(id) {
  var s = window.__siswaCache.find(function (x) {
    return x.id === id;
  });
  showConfirmModal(
    "Hapus Siswa",
    'Hapus siswa "' +
      ((s && s.namaLengkap) || id) +
      '"? Data presensi terkait ikut terhapus.',
    "Ya, Hapus",
    function () {
      hapusSiswaSekarang(id);
    },
  );
}
async function hapusSiswaSekarang(id) {
  if (cekAksiBerjalan()) return;
  try {
    var res = await runServer("hapusSiswa", currentUser.username, id);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      luapkanMuatan("siswa");
      muatTabelSiswa();
    }
  } catch (e) {
    showToast(e.message, "error");
  }
}
function bukaModalImporSiswa() {
  __modalOpen(
    "Impor Massal Siswa",
    '<div style="font-size:12px;color:#475569;margin-bottom:10px;line-height:1.7;">' +
      "<b>Langkah:</b><br>" +
      "1. Klik <b>Unduh Template Excel</b> untuk mendapat berkas contoh berwarna.<br>" +
      "2. Isi data siswa di Excel sesuai kolom template.<br>" +
      "3. Simpan berkas, lalu unggah di sini." +
      "</div>" +
      '<label for="mImporFile" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--brand-emerald-500);border-radius:12px;padding:24px 12px;background:var(--brand-emerald-50);cursor:pointer;text-align:center;">' +
      '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="var(--brand-emerald-800)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
      '<span style="font-size:13px;font-weight:700;color:var(--brand-emerald-800);">Klik untuk pilih berkas Excel</span>' +
      '<span id="mImporNama" style="font-size:12px;color:#64748b;">Mendukung .xlsx, .xls, dan .csv</span>' +
      "</label>" +
      '<input type="file" id="mImporFile" accept=".xlsx,.xls,.csv" style="display:none;">' +
      '<div id="mImporInfo" style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.6;"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;">' +
      '<button type="button" style="background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;" onclick="unduhTemplateSiswa()">Unduh Template Excel</button>' +
      '<span style="font-size:11px;color:#94a3b8;">Baris pertama = judul kolom, dilewati saat impor.</span>' +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Impor", "prosesImporSiswa()") +
      "</div>",
    520,
  );
  window.__daftarImporSiswa = [];
  var fi = document.getElementById("mImporFile");
  fi.onchange = function () {
    pilihFileImporSiswa(fi.files && fi.files[0] ? fi.files[0] : null);
  };
}
function __pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
function __fmtTanggalImpor(v) {
  if (v instanceof Date && !isNaN(v.getTime()))
    return (
      __pad2(v.getDate()) +
      "/" +
      __pad2(v.getMonth() + 1) +
      "/" +
      v.getFullYear()
    );
  if (typeof v === "number" && v >= 1 && v <= 2958465) {
    var d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return (
      __pad2(d.getUTCDate()) +
      "/" +
      __pad2(d.getUTCMonth() + 1) +
      "/" +
      d.getUTCFullYear()
    );
  }
  var s = String(v == null ? "" : v).trim();
  if (!s) return "";
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return m[3] + "/" + m[2] + "/" + m[1];
  return s.replace(/-/g, "/");
}
function pilihFileImporSiswa(file) {
  var info = document.getElementById("mImporInfo");
  var nama = document.getElementById("mImporNama");
  if (!file) {
    window.__daftarImporSiswa = [];
    if (info) {
      info.style.display = "none";
      info.innerHTML = "";
    }
    if (nama) {
      nama.textContent = "Mendukung .xlsx, .xls, dan .csv";
    }
    return;
  }
  if (nama) {
    nama.textContent = file.name.concat(
      " (",
      (file.size / 1024).toFixed(1),
      " KB)",
    );
  }
  if (typeof XLSX === "undefined") {
    __pasangXLSX().then(
      function () {
        pilihFileImporSiswa(file);
      },
      function () {
        showToast(
          "Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.",
          "error",
        );
      },
    );
    return;
  }
  var rd = new FileReader();
  rd.onload = function (ev) {
    try {
      var wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        cellDates: true,
        defval: "",
      });
      var head = (aoa[0] || []).map(function (h) {
        return String(h || "")
          .trim()
          .toLowerCase();
      });
      var idxOf = function (keys) {
        for (var i = 0; i < keys.length; i++) {
          var pos = head.indexOf(keys[i].toLowerCase());
          if (pos !== -1) return pos;
        }
        return -1;
      };
      var cNis = idxOf(["nis"]),
        cNisn = idxOf(["nisn"]),
        cNim = idxOf(["nim"]),
        cNik = idxOf(["nik"]);
      var cNama = idxOf(["nama lengkap", "nama"]),
        cJk = idxOf(["jenis kelamin", "jk"]);
      var cTempat = idxOf(["tempat lahir", "tempat"]),
        cTgl = idxOf(["tanggal lahir", "tgl lahir", "tgl_lahir"]);
      var cAlamat = idxOf(["alamat"]),
        cOrtu = idxOf(["nama ortu", "orang tua", "ortu"]),
        cHpOrtu = idxOf(["no hp ortu", "no hp", "hp"]);
      var cAyah = idxOf(["nama ayah", "ayah"]),
        cIbu = idxOf(["nama ibu", "ibu"]);
      var cPekAyah = idxOf(["pekerjaan ayah", "pek ayah", "pek. ayah"]),
        cPekIbu = idxOf(["pekerjaan ibu", "pek ibu", "pek. ibu"]);
      var cDesa = idxOf(["desa", "kelurahan"]),
        cKec = idxOf(["kecamatan", "kec"]),
        cKab = idxOf(["kabupaten", "kab"]);
      var cAnak = idxOf(["anak ke", "anak_ke"]),
        cUmur = idxOf(["umur", "usia"]);
      var cThn = idxOf(["tahun masuk", "tahun_masuk", "angkatan"]),
        cRt = idxOf(["rt", "rt/rw"]);
      var cMark = idxOf(["keterangan", "mark"]),
        cYatim = idxOf(["yatim"]);

      var is24 = (aoa[0] || []).length >= 15 || cNim !== -1 || cNik !== -1;
      var getV = function (row, colIdx, fallbackIdx) {
        var idx = colIdx >= 0 ? colIdx : fallbackIdx;
        return idx >= 0 && row[idx] != null ? String(row[idx]).trim() : "";
      };

      var daftar = [];
      for (var r = 1; r < aoa.length; r++) {
        var o = aoa[r] || [];
        var kosong = true;
        for (var c = 0; c < o.length; c++) {
          if (String(o[c] == null ? "" : o[c]).trim() !== "") {
            kosong = false;
            break;
          }
        }
        if (kosong) continue;

        var nis = is24 ? getV(o, cNis, 0) : getV(o, cNis, 0);
        var nisn = is24 ? getV(o, cNisn, 1) : getV(o, cNisn, 1);
        var nim = is24 ? getV(o, cNim, 2) : "";
        var nik = is24 ? getV(o, cNik, 3) : "";
        var namaLengkap = is24 ? getV(o, cNama, 4) : getV(o, cNama, 2);
        var jk = is24 ? getV(o, cJk, 5) : getV(o, cJk, 3);
        var tLahir = is24 ? getV(o, cTempat, 6) : getV(o, cTempat, 4);
        var tglRaw = is24
          ? cTgl >= 0
            ? o[cTgl]
            : o[7]
          : cTgl >= 0
            ? o[cTgl]
            : o[5];
        var alamat = is24 ? getV(o, cAlamat, 8) : getV(o, cAlamat, 6);
        var ortu = is24 ? getV(o, cOrtu, 9) : getV(o, cOrtu, 7);
        var hpOrtu = is24 ? getV(o, cHpOrtu, 10) : getV(o, cHpOrtu, 8);
        var ayah = is24 ? getV(o, cAyah, 11) : "";
        var ibu = is24 ? getV(o, cIbu, 12) : "";
        var pekAyah = is24 ? getV(o, cPekAyah, 13) : "";
        var pekIbu = is24 ? getV(o, cPekIbu, 14) : "";
        var desa = is24 ? getV(o, cDesa, 15) : "";
        var kec = is24 ? getV(o, cKec, 16) : "";
        var kab = is24 ? getV(o, cKab, 17) : "";
        var anakKe = is24 ? getV(o, cAnak, 18) : "";
        var umur = is24 ? getV(o, cUmur, 19) : "";
        var thnMasuk = parseInt(is24 ? getV(o, cThn, 20) : "0", 10) || 0;
        var rt = is24 ? getV(o, cRt, 21) : "";
        var mark = is24 ? getV(o, cMark, 22) : "";
        var yatimRaw = is24 ? getV(o, cYatim, 23).toLowerCase() : "false";
        var yatim =
          yatimRaw === "true" || yatimRaw === "ya" || yatimRaw === "1";

        daftar.push({
          nis: nis,
          nisn: nisn,
          nim: nim,
          nik: nik,
          namaLengkap: namaLengkap,
          jenisKelamin: jk || "Laki-laki",
          tempatLahir: tLahir,
          tanggalLahir: __fmtTanggalImpor(tglRaw),
          alamat: alamat,
          namaOrtu: ortu || (ayah ? (ibu ? ayah + " / " + ibu : ayah) : ibu),
          noHpOrtu: hpOrtu,
          namaAyah: ayah,
          namaIbu: ibu,
          pekerjaanAyah: pekAyah,
          pekerjaanIbu: pekIbu,
          desa: desa,
          kecamatan: kec,
          kabupaten: kab,
          anakKe: anakKe,
          umur: umur,
          tahunMasuk: thnMasuk,
          rt: rt,
          mark: mark,
          yatim: yatim,
          status: "Aktif",
        });
      }
      window.__daftarImporSiswa = daftar;
      if (info) {
        info.style.display = "block";
        if (daftar.length) {
          info.style.background = "var(--brand-emerald-50)";
          info.style.border = "1px solid var(--brand-emerald-200)";
          info.style.color = "var(--brand-emerald-800)";
          info.innerHTML =
            "Berkas <b>" +
            esc(file.name) +
            "</b> terbaca: <b>" +
            daftar.length +
            " baris</b> siap diimpor.";
        } else {
          info.style.background = "#fef2f2";
          info.style.border = "1px solid #fecaca";
          info.style.color = "#b91c1c";
          info.innerHTML =
            "Tidak ada baris data valid pada berkas <b>" +
            esc(file.name) +
            "</b>. Periksa kembali isinya.";
        }
      }
    } catch (err) {
      window.__daftarImporSiswa = [];
      if (info) {
        info.style.display = "block";
        info.style.background = "#fef2f2";
        info.style.border = "1px solid #fecaca";
        info.style.color = "#b91c1c";
        info.innerHTML =
          "Gagal membaca berkas <b>" +
          esc(file.name) +
          "</b>. Pastikan formatnya .xlsx, .xls, atau .csv.";
      }
    }
  };
  rd.onerror = function () {
    showToast("Gagal membaca berkas.", "error");
  };
  rd.readAsArrayBuffer(file);
}
async function prosesImporSiswa() {
  var daftar = window.__daftarImporSiswa || [];
  if (!daftar.length) {
    showToast("Pilih berkas Excel terlebih dahulu", "error");
    return;
  }
  try {
    var res = await runServer("imporSiswaMassal", currentUser.username, daftar);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __modalClose();
      muatTabelSiswa();
    }
  } catch (e) {
    showToast(e.message, "error");
  }
}
async function bukaModalPindahSiswa(id) {
  var s = window.__siswaCache.find(function (x) {
    return x.id === id;
  });
  if (!s) return;
  var taOpts = "",
    klOpts = "";
  try {
    var thn = await runServer("getDaftarTahunAjaran", currentUser.username);
    var kls = await runServer("getDaftarKelas", currentUser.username);
    var ta = thn.data || [],
      aktif = ta.findIndex(function (t) {
        return t.aktif;
      });
    taOpts = ta
      .map(function (t, i) {
        return (
          '<option value="' +
          t.id +
          '"' +
          (i === aktif ? " selected" : "") +
          ">" +
          escH(t.nama || t.kode) +
          " (" +
          escH(t.semester) +
          ")</option>"
        );
      })
      .join("");
    klOpts = (kls.data || [])
      .map(function (k) {
        return (
          '<option value="' +
          k.id +
          '">' +
          escH(k.kodeKelas) +
          " (wali: " +
          escH(k.namaWali || "-") +
          ")</option>"
        );
      })
      .join("");
  } catch (e) {
    showToast(e.message, "error");
    return;
  }
  __modalOpen(
    "Pindah Kelas - " + escH(s.namaLengkap),
    '<div style="font-size:13px;color:#475569;margin-bottom:12px;">NIS ' +
      escH(s.nis) +
      " - Kelas saat ini: " +
      escH(s.kelas || "-") +
      " (" +
      escH(s.tahunAjaran || "belum terdaftar") +
      ")</div>" +
      "<div>" +
      __label("Tahun Ajaran") +
      '<select id="mPindahTahun" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      taOpts +
      "</select></div>" +
      '<div style="margin-top:10px;">' +
      __label("Kelas Tujuan") +
      '<select id="mPindahKelas" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      klOpts +
      "</select></div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Pindahkan", "pindahSiswa(" + id + ")") +
      "</div>",
    560,
  );
}
async function pindahSiswa(id) {
  var thn = parseInt(document.getElementById("mPindahTahun").value || "0", 10);
  var kl = parseInt(document.getElementById("mPindahKelas").value || "0", 10);
  if (!thn || !kl) {
    showToast("Pilih tahun ajaran dan kelas tujuan", "error");
    return;
  }
  try {
    var res = await runServer("aturSiswaKelas", currentUser.username, {
      tahunAjaranId: thn,
      kelasId: kl,
      siswaIds: [id],
      hapusSiswaIds: [],
    });
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __modalClose();
      muatTabelSiswa();
    }
  } catch (e) {
    showToast(e.message, "error");
  }
}

/* ---------- ADMIN: KELAS ---------- */
async function muatTabelKelas() {
  var el = document.getElementById("adminSiswaTabKelas");
  if (!el) return;
  el.innerHTML = __spinner();
  var rows = [];
  try {
    var res = await runServer("getDaftarKelas", currentUser.username);
    rows = res.data || [];
  } catch (e) {
    el.innerHTML = __errBox(e.message);
    return;
  }
  window.__kelasCache = rows;
  el.innerHTML =
    '<div class="card" style="padding:18px 20px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--ink);">Data Kelas</h3>' +
    __btnUtama("+ Tambah Kelas", "bukaModalKelas()") +
    "</div>" +
    __tabelKelas(rows) +
    "</div>";
}
function __tabelKelas(rows) {
  if (!rows.length) return __kosong("Belum ada kelas.");
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:9px 10px;">Kode</th><th style="padding:9px 10px;">Nama</th><th style="padding:9px 10px;">Wali Kelas</th><th style="padding:9px 10px;">Siswa</th><th style="padding:9px 10px;">Status</th><th style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;">Aksi</th></tr></thead>';
  var tr = rows
    .map(function (k) {
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:9px 10px;font-weight:600;color:var(--ink);">' +
        escH(k.kodeKelas) +
        '</td><td style="padding:9px 10px;">' +
        escH(k.namaKelas) +
        '</td><td style="padding:9px 10px;">' +
        escH(k.namaWali || "-") +
        '</td><td style="padding:9px 10px;color:var(--slate);">' +
        (k.jumlahSiswa || 0) +
        ' siswa</td><td style="padding:9px 10px;">' +
        (k.isActive
          ? __badge("Aktif", "green")
          : __badge("Nonaktif", "muted")) +
        '</td><td style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;"><span style="display:inline-flex;align-items:center;gap:6px;">' +
        __btnSekunder(
          "Edit",
          "bukaModalKelas(" + k.id + ")",
          "padding:6px 10px;font-size:12px;",
        ) +
        __btnBahaya("Hapus", "hapusKelas(" + k.id + ")") +
        "</span></td></tr>"
      );
    })
    .join("");
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}
async function bukaModalKelas(id) {
  var k = id
    ? window.__kelasCache.find(function (x) {
        return x.id === id;
      }) || {}
    : {};
  var guruOpts = '<option value="0">- belum ada wali -</option>';
  try {
    var g = await runServer("getSemuaUser", currentUser.username);
    guruOpts =
      '<option value="0">- belum ada wali -</option>' +
      (g.data || [])
        .filter(function (u) {
          return u.role === "guru";
        })
        .map(function (u) {
          return (
            '<option value="' +
            u.id +
            '"' +
            (String(k.waliKelasId) === String(u.id) ? " selected" : "") +
            ">" +
            escH(u.namaLengkap) +
            "</option>"
          );
        })
        .join("");
  } catch (e) {}
  window.__kelasEditId = id || 0;
  __modalOpen(
    "Kelas" + (id ? " (edit)" : ""),
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      "<div>" +
      __label("Kode Kelas *") +
      __inp("mKelasKode", k.kodeKelas) +
      "</div>" +
      "<div>" +
      __label("Nama Kelas") +
      __inp("mKelasNama", k.namaKelas) +
      "</div>" +
      "<div>" +
      __label("Tingkat") +
      __inp("mKelasTingkat", k.tingkat) +
      "</div>" +
      "<div>" +
      __label("Wali Kelas") +
      '<select id="mKelasWali" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      guruOpts +
      "</select></div>" +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Simpan", "simpanKelas()") +
      "</div>",
    560,
  );
}
async function simpanKelas() {
  var g = function (id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : "";
  };
  var payload = {
    id: window.__kelasEditId || 0,
    kodeKelas: g("mKelasKode") || g("mKelasNama"),
    namaKelas: g("mKelasNama"),
    tingkat: g("mKelasTingkat"),
    waliKelasId: parseInt(
      document.getElementById("mKelasWali").value || "0",
      10,
    ),
    isActive: true,
  };
  if (!payload.kodeKelas) {
    showToast("Kode kelas wajib diisi", "error");
    return;
  }
  if (cekAksiBerjalan()) return;
  window.__aksiBerjalan = true;
  try {
    var res = await runServer("simpanKelas", currentUser.username, payload);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __masterKelasCache = null;
      window.__kelasCache = null;
      __modalClose();
      muatTabelKelas();
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    window.__aksiBerjalan = false;
  }
}
async function hapusKelas(id) {
  showConfirmModal(
    "Hapus Kelas",
    "Hapus kelas ini? (hanya bisa jika tidak ada siswa terdaftar)",
    "Ya, Hapus",
    function () {
      hapusKelasSekarang(id);
    },
  );
}
async function hapusKelasSekarang(id) {
  if (cekAksiBerjalan()) return;
  try {
    var res = await runServer("hapusKelas", currentUser.username, id);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __masterKelasCache = null;
      window.__kelasCache = null;
      muatTabelKelas();
    }
  } catch (e) {
    showToast(e.message, "error");
  }
}

/* ---------- ADMIN: TAHUN AJARAN ---------- */
async function muatTabelTahun() {
  var el = document.getElementById("adminSiswaTabTahun");
  if (!el) return;
  el.innerHTML = __spinner();
  var rows = [];
  try {
    var res = await runServer("getDaftarTahunAjaran", currentUser.username);
    rows = res.data || [];
  } catch (e) {
    el.innerHTML = __errBox(e.message);
    return;
  }
  window.__tahunCache = rows;
  el.innerHTML =
    '<div class="card" style="padding:18px 20px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--ink);">Data Tahun Ajaran</h3>' +
    __btnUtama("+ Tambah Tahun Ajaran", "bukaModalTahun()") +
    "</div>" +
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">Tahun ajaran yang <b>aktif</b> dipakai untuk pembagian kelas & presensi pada operasional berjalan.</div>' +
    __tabelTahun(rows) +
    "</div>";
}
function __tabelTahun(rows) {
  if (!rows.length) return __kosong("Belum ada tahun ajaran.");
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:9px 10px;">Kode</th><th style="padding:9px 10px;">Semester</th><th style="padding:9px 10px;">Rentang</th><th style="padding:9px 10px;">Status</th><th style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;">Aksi</th></tr></thead>';
  var tr = rows
    .map(function (t) {
      var st = t.aktif
        ? __badge("AKTIF", "green")
        : __badge("Nonaktif", "muted");
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:9px 10px;font-weight:600;color:var(--ink);">' +
        escH(t.kode) +
        '</td><td style="padding:9px 10px;">' +
        escH(t.semester) +
        '</td><td style="padding:9px 10px;color:var(--slate);">' +
        escH(t.tanggalMulai || "-") +
        " s/d " +
        escH(t.tanggalSelesai || "-") +
        '</td><td style="padding:9px 10px;">' +
        st +
        '</td><td style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;"><span style="display:inline-flex;align-items:center;gap:6px;">' +
        __btnSekunder(
          "Edit",
          "bukaModalTahun(" + t.id + ")",
          "padding:6px 12px;font-size:12px;",
        ) +
        __btnBahaya("Hapus", "hapusTahun(" + t.id + ")") +
        "</span></td></tr>"
      );
    })
    .join("");
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}
function bukaModalTahun(id) {
  var t = id
    ? window.__tahunCache.find(function (x) {
        return x.id === id;
      }) || {}
    : {};
  window.__tahunEditId = id || 0;
  var v = function (k, d) {
    return t[k] == null ? d || "" : String(t[k]);
  };
  __modalOpen(
    "Tahun Ajaran" + (id ? " (edit)" : ""),
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      "<div>" +
      __label("Kode *") +
      __inp("mTahunKode", v("kode")) +
      "</div>" +
      "<div>" +
      __label("Semester") +
      '<select id="mTahunSemester" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"><option value="Ganjil"' +
      (v("semester") === "Ganjil" ? " selected" : "") +
      '>Ganjil</option><option value="Genap"' +
      (v("semester") !== "Ganjil" ? " selected" : "") +
      ">Genap</option></select></div>" +
      "<div>" +
      __label("Nama") +
      __inp("mTahunNama", v("nama")) +
      "</div>" +
      "<div>" +
      __label("Mulai") +
      '<input type="date" id="mTahunMulai" value="' +
      escH(__tglISO(v("tanggalMulai"))) +
      '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
      "<div>" +
      __label("Selesai") +
      '<input type="date" id="mTahunSelesai" value="' +
      escH(__tglISO(v("tanggalSelesai"))) +
      '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
      "<div>" +
      __label("Status") +
      '<select id="mTahunStatus" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"><option value="aktif"' +
      (t.aktif ? " selected" : "") +
      '>Aktif</option><option value="nonaktif"' +
      (!t.aktif ? " selected" : "") +
      ">Nonaktif</option></select></div>" +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Simpan", "simpanTahun()") +
      "</div>",
    560,
  );
}
async function simpanTahun() {
  var g = function (id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : "";
  };
  var payload = {
    id: window.__tahunEditId || 0,
    kode: g("mTahunKode"),
    semester: g("mTahunSemester"),
    nama: g("mTahunNama") || g("mTahunKode"),
    tanggalMulai: __tglIndo(g("mTahunMulai")),
    tanggalSelesai: __tglIndo(g("mTahunSelesai")),
    aktif: document.getElementById("mTahunStatus").value === "aktif",
  };
  if (!payload.kode) {
    showToast("Kode tahun ajaran wajib diisi", "error");
    return;
  }
  if (cekAksiBerjalan()) return;
  window.__aksiBerjalan = true;
  try {
    var res = await runServer(
      "simpanTahunAjaran",
      currentUser.username,
      payload,
    );
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      __modalClose();
      muatTabelTahun();
    }
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    window.__aksiBerjalan = false;
  }
}
async function hapusTahun(id) {
  showConfirmModal(
    "Hapus Tahun Ajaran",
    "Hapus tahun ajaran ini?",
    "Ya, Hapus",
    function () {
      hapusTahunSekarang(id);
    },
  );
}
async function hapusTahunSekarang(id) {
  if (cekAksiBerjalan()) return;
  try {
    var res = await runServer("hapusTahunAjaran", currentUser.username, id);
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatTabelTahun();
  } catch (e) {
    showToast(e.message, "error");
  }
}

/* ---------- ADMIN: PEMBAGIAN KELAS (ENROLLMENT) ---------- */
async function muatAssignSiswa() {
  var el = document.getElementById("adminSiswaTabAssign");
  if (!el) return;
  el.innerHTML = __spinner();
  var ta = [],
    kls = [],
    rows = [];
  try {
    var p = await Promise.all([
      runServer("getDaftarTahunAjaran", currentUser.username),
      runServer("getDaftarKelas", currentUser.username),
      runServer("getDaftarSiswa", currentUser.username, 0, ""),
    ]);
    ta = p[0].data || [];
    kls = p[1].data || [];
    rows = p[2].data || [];
  } catch (e) {
    el.innerHTML = __errBox(e.message);
    return;
  }
  var aktif = ta.findIndex(function (t) {
    return t.aktif;
  });
  var taOpts = ta
    .map(function (t, i) {
      return (
        '<option value="' +
        t.id +
        '"' +
        (i === aktif ? " selected" : "") +
        ">" +
        escH(t.nama || t.kode) +
        " (" +
        escH(t.semester) +
        ")</option>"
      );
    })
    .join("");
  var klOpts = (kls || [])
    .map(function (k) {
      return (
        '<option value="' +
        k.id +
        '">' +
        escH(k.kodeKelas) +
        " - wali: " +
        escH(k.namaWali || "-") +
        "</option>"
      );
    })
    .join("");
  el.innerHTML =
    '<div class="card" style="padding:18px 20px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--ink);">Pembagian Kelas (Enrollment)</h3>' +
    "</div>" +
    '<div class="admin-enrollment-controls" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:6px;">' +
    '<div class="admin-enrollment-field">' +
    __label("Tahun Ajaran") +
    '<select id="assignTahun" style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);min-width:180px;">' +
    taOpts +
    "</select></div>" +
    '<div class="admin-enrollment-field">' +
    __label("Pasang ke Kelas") +
    '<select id="assignKelas" style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);min-width:180px;"><option value="0">- pilih kelas -</option>' +
    klOpts +
    "</select></div>" +
    '<div class="admin-enrollment-actions">' +
    __btnUtama("Pasang Terpilih", "assignPasang()") +
    __btnBahaya("Lepas Terpilih", "assignLepas()") +
    "</div>" +
    "</div>" +
    '<div style="font-size:12px;color:#64748b;margin:6px 0 10px;">Centang siswa, lalu pilih kelas tujuan (Pasang), atau pilih tahun ajaran lalu lepas dari kelas (Lepas).</div>' +
    __tabelAssign(rows) +
    "</div>";
}
function __tabelAssign(rows) {
  if (!rows.length) return __kosong("Belum ada siswa.");
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:9px 10px;width:32px;"><input type="checkbox" id="assignCekSemua" style="cursor:pointer;"></th><th style="padding:9px 10px;">NIS</th><th style="padding:9px 10px;">Nama</th><th style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;">Kelas Sekarang</th></tr></thead>';
  var tr = rows
    .map(function (s) {
      var selK =
        '<span style="display:inline-flex;align-items:center;gap:6px;">' +
        __badge(escH(s.kelas || "-"), "muted") +
        __badge(escH(s.tahunAjaran || "belum"), "plain") +
        "</span>";
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:9px 10px;"><input type="checkbox" class="js-cb-siswa" value="' +
        s.id +
        '"></td><td style="padding:9px 10px;color:var(--ink);white-space:nowrap;">' +
        escH(s.nis) +
        '</td><td style="padding:9px 10px;font-weight:600;color:var(--ink);">' +
        escH(s.namaLengkap) +
        '</td><td style="padding:9px 10px;width:1%;white-space:nowrap;text-align:right;">' +
        selK +
        "</td></tr>"
      );
    })
    .join("");
  setTimeout(function () {
    var all = document.getElementById("assignCekSemua");
    if (all)
      all.addEventListener("change", function () {
        document.querySelectorAll(".js-cb-siswa").forEach(function (c) {
          c.checked = all.checked;
        });
      });
  }, 0);
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}
function __cbSiswaIds() {
  return Array.from(document.querySelectorAll(".js-cb-siswa:checked"))
    .map(function (c) {
      return parseInt(c.value, 10);
    })
    .filter(function (v) {
      return v > 0;
    });
}
async function assignPasang() {
  var ids = __cbSiswaIds();
  var thn = parseInt(document.getElementById("assignTahun").value || "0", 10);
  var kl = parseInt(document.getElementById("assignKelas").value || "0", 10);
  if (!ids.length) {
    showToast("Centang siswa terlebih dahulu", "error");
    return;
  }
  if (!thn || !kl) {
    showToast("Pilih tahun ajaran dan kelas tujuan", "error");
    return;
  }
  try {
    var res = await runServer("aturSiswaKelas", currentUser.username, {
      tahunAjaranId: thn,
      kelasId: kl,
      siswaIds: ids,
      hapusSiswaIds: [],
    });
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatAssignSiswa();
  } catch (e) {
    showToast(e.message, "error");
  }
}
async function assignLepas() {
  var ids = __cbSiswaIds();
  var thn = parseInt(document.getElementById("assignTahun").value || "0", 10);
  if (!ids.length) {
    showToast("Centang siswa terlebih dahulu", "error");
    return;
  }
  if (!thn) {
    showToast("Pilih tahun ajaran", "error");
    return;
  }
  try {
    var res = await runServer("aturSiswaKelas", currentUser.username, {
      tahunAjaranId: thn,
      kelasId: 0,
      siswaIds: [],
      hapusSiswaIds: ids,
    });
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatAssignSiswa();
  } catch (e) {
    showToast(e.message, "error");
  }
}
/* ---------- REKAP PRESENSI SISWA (admin & kepala) ---------- */
async function muatRekapSiswa() {
  var el = document.getElementById("adminSiswaTabRekap");
  if (!el) return;
  var klOpts = '<option value="0">Semua Kelas</option>';
  try {
    var k = await runServer("getDaftarKelas", currentUser.username);
    klOpts =
      '<option value="0">Semua Kelas</option>' +
      (k.data || [])
        .map(function (x) {
          return (
            '<option value="' + x.id + '">' + escH(x.kodeKelas) + "</option>"
          );
        })
        .join("");
  } catch (e) {}
  el.innerHTML =
    '<div class="card" style="padding:18px 20px;">' +
    '<h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:var(--ink);">Rekap Presensi Siswa</h3>' +
    '<div class="admin-rekap-fields" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
    '<div class="admin-rekap-field">' +
    __label("Kelas") +
    '<select id="adminRekapKelas" style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);min-width:160px;">' +
    klOpts +
    "</select></div>" +
    '<div class="admin-rekap-field">' +
    __label("Tanggal Awal") +
    '<input type="date" id="adminRekapAwal" value="' +
    __bulanAwalISO() +
    '" style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
    '<div class="admin-rekap-field">' +
    __label("Tanggal Akhir") +
    '<input type="date" id="adminRekapAkhir" value="' +
    __bulanAkhirISO() +
    '" style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);"></div>' +
    '<div class="admin-rekap-actions">' +
    __btnUtama(
      "Tampilkan",
      "tampilRekapSiswa('#adminRekapHasil','adminRekapKelas','adminRekapAwal','adminRekapAkhir')",
    ) +
    __btnSekunder("Ekspor Excel", "eksporExcelSiswa()") +
    "</div>" +
    "</div>" +
    '<div id="adminRekapHasil" style="margin-top:14px;"></div>' +
    "</div>";
  tampilRekapSiswa(
    "#adminRekapHasil",
    "adminRekapKelas",
    "adminRekapAwal",
    "adminRekapAkhir",
  );
}
async function tampilRekapSiswa(
  containerSel,
  kelasSelId,
  awalSelId,
  akhirSelId,
) {
  var el = document.querySelector(containerSel);
  if (!el) return;
  var kelasId = 0,
    awal = "",
    akhir = "";
  var kSel = document.getElementById(kelasSelId);
  if (kSel) kelasId = parseInt(kSel.value || "0", 10) || 0;
  var aSel = document.getElementById(awalSelId);
  if (aSel) awal = __tglIndo(aSel.value);
  var bSel = document.getElementById(akhirSelId);
  if (bSel) akhir = __tglIndo(bSel.value);
  el.innerHTML = __spinner();
  var groups = [];
  try {
    var res = await runServer("getRekapPresensiSiswa", currentUser.username, {
      kelasId: kelasId,
      tanggalMulai: awal,
      tanggalAkhir: akhir,
    });
    if (!res.success) {
      el.innerHTML =
        '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
        escH(res.message || "Gagal") +
        "</div>";
      return;
    }
    groups = res.data || [];
  } catch (e) {
    el.innerHTML =
      '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
      escH(e.message) +
      "</div>";
    return;
  }
  if (!groups.length) {
    el.innerHTML = __kosong("Tidak ada siswa terdaftar pada rentang ini.");
    window.__rekapCache = [];
    return;
  }
  window.__rekapCache = groups;
  el.innerHTML =
    '<section class="kepala-rekap-aggregation">' +
    '<div class="kepala-rekap-aggregation-heading"><div><h3>Agregasi Kehadiran Kelas</h3><p>Ringkasan status kehadiran berdasarkan filter yang dipilih.</p></div><span>' +
    groups.length +
    " rombel" +
    "</span></div>" +
    '<div class="kepala-rekap-aggregation-grid">' +
    groups
      .map(function (g) {
        return __rekapKelasCard(g);
      })
      .join("") +
    "</div></section>";
}
function toggleRekapDetail(id) {
  var el = document.getElementById("rekapDetail" + id);
  if (el) el.classList.toggle("hidden");
}
function __rekapKelasCard(g) {
  var n = (g.siswa || []).length;
  return (
    '<div class="kepala-class-summary" style="border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px;background:var(--surface);">' +
    '<div class="kepala-class-summary-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
    '<h3 style="margin:0;font-size:15px;color:var(--ink);font-weight:700;">Kelas ' +
    escH(g.kodeKelas) +
    ' <span style="font-size:12px;color:var(--slate-light);">(' +
    n +
    " siswa)</span></h3>" +
    __btnSekunder(
      "Detail Siswa +",
      "toggleRekapDetail(" + g.kelasId + ")",
      "padding:7px 12px;font-size:12px;",
    ) +
    "</div>" +
    '<div class="kepala-class-summary-stats">' +
    '<div class="kepala-summary-stat is-present"><span>Hadir</span><strong>' +
    (g.totalH || 0) +
    "</strong></div>" +
    '<div class="kepala-summary-stat is-permission"><span>Izin</span><strong>' +
    (g.totalI || 0) +
    "</strong></div>" +
    '<div class="kepala-summary-stat is-sick"><span>Sakit</span><strong>' +
    (g.totalS || 0) +
    "</strong></div>" +
    '<div class="kepala-summary-stat is-absent"><span>Alfa</span><strong>' +
    (g.totalA || 0) +
    "</strong></div>" +
    '<div class="kepala-summary-stat is-late"><span>Telat</span><strong>' +
    (g.totalT || 0) +
    "</strong></div>" +
    "</div>" +
    '<div id="rekapDetail' +
    g.kelasId +
    '" class="hidden" style="margin-top:12px;">' +
    __rekapSiswaTable(g.siswa || []) +
    "</div>" +
    "</div>"
  );
}
function __rekapSiswaTable(siswa) {
  if (!siswa.length) return __kosong("Tidak ada siswa.");
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:8px;">No</th><th style="padding:8px;">NIS</th><th style="padding:8px;">Nama</th><th style="padding:8px;">H</th><th style="padding:8px;">I</th><th style="padding:8px;">S</th><th style="padding:8px;">A</th><th style="padding:8px;">T</th><th style="padding:8px;">Jumlah</th><th style="padding:8px;">% Hadir</th></tr></thead>';
  var tr = siswa
    .map(function (x, i) {
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:8px;color:var(--slate-light);">' +
        (i + 1) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        escH(x.nis) +
        '</td><td style="padding:8px;font-weight:600;color:var(--ink);">' +
        escH(x.nama) +
        "</td>" +
        '<td style="padding:8px;color:#047857;font-weight:700;">' +
        (x.hadir || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.izin || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.sakit || 0) +
        "</td>" +
        '<td style="padding:8px;color:#be123c;font-weight:700;">' +
        (x.alpa || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.telat || 0) +
        "</td>" +
        '<td style="padding:8px;color:var(--ink);">' +
        (x.total || 0) +
        '</td><td style="padding:8px;"><strong style="color:var(--ink);">' +
        (x.persen || 0) +
        "%</strong></td></tr>"
      );
    })
    .join("");
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}
function __xlsEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function __eksLapXLS(judul, meta, kolom, baris, namaFile, lebar) {
  if (typeof XLSX === "undefined") {
    // Coba muat XLSX dulu (lazy). Bila gagal (offline), lanjut ke ekspor HTML.
    __pasangXLSX().then(
      function () {
        __eksLapXLS(judul, meta, kolom, baris, namaFile, lebar);
      },
      function () {
        __xlsHTML(judul, meta, kolom, baris, namaFile, lebar);
      },
    );
    return;
  }
  var nCol = Math.max(1, kolom.length);
  var aoa = [];
  aoa.push([judul]);
  if (meta) {
    aoa.push([meta]);
  }
  aoa.push(kolom.slice());
  for (var i = 0; i < baris.length; i++) {
    var row = [],
      src = baris[i] || [];
    for (var c = 0; c < nCol; c++) {
      row.push(src[c] == null ? "" : src[c]);
    }
    aoa.push(row);
  }
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  var rHead = meta ? 2 : 1;
  var merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCol - 1 } }];
  if (meta) {
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: nCol - 1 } });
  }
  if (nCol > 1) ws["!merges"] = merges;
  ws["!cols"] = [];
  for (var w = 0; w < nCol; w++) {
    ws["!cols"].push({ wch: lebar && lebar[w] ? lebar[w] : 10 });
  }
  ws["!rows"] = [{ hpt: 26 }];
  if (meta) {
    ws["!rows"].push({ hpt: 17 });
  }
  ws["!rows"].push({ hpt: 24 });
  for (var ih = 0; ih < baris.length; ih++) {
    ws["!rows"].push({ hpt: 20 });
  }
  var tipis = { style: "thin", color: { rgb: "A7F3D0" } };
  var stJudul = {
    font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "065F46" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stMeta = {
    font: { italic: true, sz: 10, color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "ECFDF5" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stHead = {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0F766E" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stZ = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "FEF9C3" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stZ2 = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "F0F9FF" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var ref = XLSX.utils.decode_range(ws["!ref"]);
  for (var R = ref.s.r; R <= ref.e.r; R++) {
    for (var Cx = ref.s.c; Cx <= ref.e.c; Cx++) {
      var adr = XLSX.utils.encode_cell({ r: R, c: Cx });
      var cell = ws[adr];
      if (!cell) continue;
      var st;
      if (R === 0) {
        st = stJudul;
      } else if (meta && R === 1) {
        st = stMeta;
      } else if (R === rHead) {
        st = stHead;
      } else if (R >= rHead + 1) {
        var isOdd = (R - (rHead + 1)) % 2 === 1;
        if (typeof cell.v === "number") {
          st = {
            font: { color: { rgb: "334155" } },
            fill: { fgColor: { rgb: isOdd ? "F0F9FF" : "FEF9C3" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
          };
        } else {
          st = isOdd ? stZ2 : stZ;
        }
      } else {
        st = stZ;
      }
      cell.s = st;
    }
  }
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap");
  XLSX.writeFile(wb, String(namaFile).replace(/\.xls$/i, ".xlsx"));
}
function __rekapSiswaBaris() {
  var out = [];
  (window.__rekapCache || []).forEach(function (g) {
    (g.siswa || []).forEach(function (x) {
      out.push({
        kode: g.kodeKelas || g.kelas || "-",
        nis: x.nis || "",
        nama: x.nama || "",
        jk: String(x.jk || "") === "Perempuan" ? "P" : "L",
        hadir: x.hadir || 0,
        izin: x.izin || 0,
        sakit: x.sakit || 0,
        alpa: x.alpa || 0,
        telat: x.telat || 0,
        total: x.total || 0,
        persen: x.persen || 0,
      });
    });
  });
  return out;
}
function __periodeRekapSiswa() {
  var a =
    (document.getElementById("kepalaSiswaAwal") || { value: "" }).value ||
    (document.getElementById("adminRekapAwal") || { value: "" }).value;
  var b =
    (document.getElementById("kepalaSiswaAkhir") || { value: "" }).value ||
    (document.getElementById("adminRekapAkhir") || { value: "" }).value;
  var k =
    document.getElementById("kepalaSiswaKelas") ||
    document.getElementById("adminRekapKelas");
  var kelas =
    k && k.value && k.value !== "0" && k.selectedIndex >= 0
      ? k.options[k.selectedIndex].text
      : "";
  return { a: a, b: b, kelas: kelas };
}
function eksporExcelSiswa() {
  var baris = __rekapSiswaBaris();
  if (!baris.length) {
    showToast("Tampilkan rekap terlebih dahulu", "error");
    return;
  }
  var kolom = [
    "No",
    "Kelas",
    "NIS",
    "Nama",
    "L/P",
    "Hadir",
    "Izin",
    "Sakit",
    "Alpa",
    "Terlambat",
    "Total",
    "% Hadir",
  ];
  var rows = baris.map(function (x, i) {
    return [
      i + 1,
      x.kode,
      x.nis,
      x.nama,
      x.jk,
      x.hadir,
      x.izin,
      x.sakit,
      x.alpa,
      x.telat,
      x.total,
      String(x.persen) + "%",
    ];
  });
  var pr = __periodeRekapSiswa();
  var meta = "";
  if (pr.a && pr.b)
    meta = "Periode: " + __tglIndo(pr.a) + " s/d " + __tglIndo(pr.b);
  if (pr.kelas) meta = (meta ? meta + ". " : "") + "Kelas: " + pr.kelas;
  __eksLapXLS(
    "Rekap Presensi Siswa",
    meta,
    kolom,
    rows,
    "rekap-presensi-siswa.xls",
    [6, 9, 12, 26, 6, 9, 9, 9, 9, 12, 9, 9],
  );
}
function cetakRekapSiswa() {
  var baris = __rekapSiswaBaris();
  if (!baris.length) {
    showToast("Tampilkan rekap terlebih dahulu", "error");
    return;
  }
  var pr = __periodeRekapSiswa();
  var periode =
    pr.a && pr.b
      ? "Periode " + __tglIndo(pr.a) + " s/d " + __tglIndo(pr.b)
      : "";
  var namaSekolah = esc(
    (infoSekolahCache && infoSekolahCache.namaSekolah) || "MA AL KARIMIYAH",
  );
  var namaKepala = esc((infoSekolahCache && infoSekolahCache.namaKepala) || "");
  var tr = baris
    .map(function (x, i) {
      return (
        '<tr><td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center;">' +
        (i + 1) +
        "</td>" +
        '<td style="padding:5px 8px;border:1px solid #cbd5e1;">' +
        esc(x.kode) +
        "</td>" +
        '<td style="padding:5px 8px;border:1px solid #cbd5e1;">' +
        esc(x.nis) +
        "</td>" +
        '<td style="padding:5px 8px;border:1px solid #cbd5e1;">' +
        esc(x.nama) +
        "</td>" +
        '<td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center;">' +
        x.jk +
        "</td>" +
        ["hadir", "izin", "sakit", "alpa", "telat", "total"]
          .map(function (f) {
            return (
              '<td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center;">' +
              x[f] +
              "</td>"
            );
          })
          .join("") +
        '<td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center;">' +
        x.persen +
        "%</td></tr>"
      );
    })
    .join("");
  var head = [
    "No",
    "Kelas",
    "NIS",
    "Nama",
    "L/P",
    "Hadir",
    "Izin",
    "Sakit",
    "Alpa",
    "Terlambat",
    "Total",
    "% Hadir",
  ]
    .map(function (h) {
      return (
        '<th style="padding:6px 8px;border:1px solid #94a3b8;background:#f1f5f9;text-align:left;font-weight:700;">' +
        h +
        "</th>"
      );
    })
    .join("");
  var w = window.open("", "_blank");
  if (!w) {
    showToast("Popup diblokir browser", "error");
    return;
  }
  w.document.write(
    '<!doctype html><html><head><meta charset="UTF-8"><title>Rekap Presensi Siswa</title><style>' +
      "body{font-family:Calibri,Arial,sans-serif;color:#0f172a;margin:24px;}" +
      ".kop{text-align:center;margin-bottom:14px;} .kop h2{margin:0;font-size:20px;} .kop p{margin:2px 0;font-size:12px;color:#475569;}" +
      "table{width:100%;border-collapse:collapse;font-size:12px;} th,td{font-size:12px;}" +
      "@media print{ .ttd{margin-top:48px;} body{margin:12mm;} }" +
      "</style></head><body>" +
      '<div class="kop"><h2>' +
      namaSekolah +
      "</h2><p>Rekap Presensi Siswa</p><p>" +
      (periode ? esc(periode) : "") +
      "</p></div>" +
      "<table><thead><tr>" +
      head +
      "</tr></thead><tbody>" +
      tr +
      "</tbody></table>" +
      (namaKepala
        ? '<div class="ttd" style="margin-top:44px;text-align:center;font-size:12px;">Kepala Madrasah</div><div style="margin-top:60px;text-align:center;font-weight:700;">' +
          namaKepala +
          "</div>"
        : "") +
      "<script>window.print();<\/script></body></html>",
  );
  w.document.close();
}
function eksporExcelRekapGuru(role) {
  var data =
    role === "admin"
      ? adminRekapDataCache || []
      : window.__kepalaRekapDataCache || [];
  if (!data.length) {
    showToast("Tampilkan rekap guru terlebih dahulu", "error");
    return;
  }
  var kolom = [
    "No",
    "Nama Guru",
    "Username",
    "Jumlah Jam",
    "Hadir",
    "Izin",
    "Sakit",
    "Cuti",
    "Alpa",
    "% Kehadiran",
  ];
  var rows = data.map(function (g, i) {
    var p =
      g.persenKehadiranJadwal === null || g.persenKehadiranJadwal === undefined
        ? "-"
        : String(g.persenKehadiranJadwal) + "%";
    return [
      i + 1,
      g.namaLengkap || "",
      g.username || "",
      g.jumlahJam || 0,
      g.hadir || 0,
      g.izin || 0,
      g.sakit || 0,
      g.cuti || 0,
      g.alpa || 0,
      p,
    ];
  });
  var meta = "";
  if (role === "admin" && adminRekapModeAktif) {
    if (adminRekapModeAktif.tipe === "bulan")
      meta =
        "Periode: " +
        NAMA_BULAN[adminRekapModeAktif.bulan] +
        " " +
        adminRekapModeAktif.tahun;
    else if (adminRekapModeAktif.tipe === "rentang")
      meta =
        "Periode: " +
        adminRekapModeAktif.dari +
        " s/d " +
        adminRekapModeAktif.sampai;
  } else {
    var b = document.getElementById("kepalaRekapBulan"),
      t = document.getElementById("kepalaRekapTahun");
    var bl = parseInt(b && b.value, 10) || new Date().getMonth() + 1,
      th = (t && t.value) || new Date().getFullYear();
    meta = "Periode: " + NAMA_BULAN[bl] + " " + th;
  }
  __eksLapXLS(
    "Rekap Kehadiran Guru",
    meta,
    kolom,
    rows,
    "rekap-kehadiran-guru.xls",
    [6, 26, 16, 18, 16, 16, 15, 15, 15],
  );
}
function unduhTemplateGuru() {
  if (typeof XLSX === "undefined") {
    showToast("Pustaka Excel belum dimuat. Coba muat ulang halaman.", "error");
    return;
  }
  var kepala = [
    "Nama Lengkap",
    "Username",
    "Password",
    "NIP/NUPTK",
    "Mata Pelajaran",
    "Kelas",
    "Jam Ke",
    "No HP",
    "Gelar",
    "Status Kepegawaian",
  ];
  var contoh = [
    [
      "Ahmad Fauzi",
      "",
      "",
      "196501011990031001",
      "Matematika",
      "VII-A",
      "I",
      "08123456789",
      "S.Pd.",
      "PNS",
    ],
    [
      "Siti Aminah",
      "",
      "",
      "",
      "IPA",
      "VIII-B",
      "III",
      "08129876543",
      "M.Pd.",
      "GTY",
    ],
  ];
  var ws = XLSX.utils.aoa_to_sheet([kepala].concat(contoh));
  ws["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 9 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
  ];
  ws["!rows"] = [{ hpt: 26 }].concat(
    contoh.map(function () {
      return { hpt: 20 };
    }),
  );
  var tipis = { style: "thin", color: { rgb: "A7F3D0" } };
  var stKepala = {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0F766E" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stKuning = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "FEF9C3" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stBiru = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "F0F9FF" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var batas = XLSX.utils.decode_range(ws["!ref"]);
  for (var R = batas.s.r; R <= batas.e.r; R++) {
    for (var C = batas.s.c; C <= batas.e.c; C++) {
      var sel = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[sel]) continue;
      ws[sel].s = R === batas.s.r ? stKepala : R % 2 ? stKuning : stBiru;
    }
  }
  ws["!autofilter"] = { ref: "A1:J" + String(batas.e.r + 1) };
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Guru");
  var petunjuk = [
    ["PETUNJUK PENGISIAN TEMPLATE IMPOR GURU"],
    [""],
    [
      "1. Isi SATU guru per baris, mulai baris ke-2 (baris 1 = judul kolom, otomatis dilewati saat impor).",
    ],
    [
      "2. Kolom WAJIB diisi: Nama Lengkap saja. Semua kolom lainnya boleh dikosongkan.",
    ],
    [
      "3. Username: jika dikosongkan, otomatis dibuat dari NIP/NUPTK (bila diisi) atau dari nama lengkap.",
    ],
    ['4. Password: jika dikosongkan, otomatis dibuat dari username + "123".'],
    [
      "5. NIP/NUPTK: opsional, dipakai sebagai username jika kolom Username kosong.",
    ],
    [
      "6. Gelar dan Status Kepegawaian: opsional, data tambahan identitas guru.",
    ],
    ["7. Jam Ke contoh: I, II, III (angka Romawi), diisi sesuai jadwal."],
    ["8. Baris contoh tinggal diganti datanya, atau boleh dihapus."],
    ["9. Simpan berkas, lalu unggah lewat menu Impor Akun Guru Massal."],
    [""],
    [
      "Setelah impor berhasil, daftar username & password akan ditampilkan untuk dibagikan ke guru.",
    ],
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(petunjuk);
  ws2["!cols"] = [{ wch: 95 }];
  ws2["!rows"] = petunjuk.map(function (x, i) {
    return { hpt: i === 0 ? 26 : 20 };
  });
  for (var k2 = 0; k2 < petunjuk.length; k2++) {
    var sel2 = XLSX.utils.encode_cell({ r: k2, c: 0 });
    if (!ws2[sel2]) continue;
    ws2[sel2].s =
      k2 === 0
        ? {
            font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "065F46" } },
            alignment: { vertical: "center" },
          }
        : {
            font: { color: { rgb: "334155" } },
            alignment: { vertical: "top", wrapText: true },
          };
  }
  XLSX.utils.book_append_sheet(wb, ws2, "Petunjuk");
  XLSX.writeFile(wb, "template-impor-guru.xlsx");
}
function unduhTemplateSiswa() {
  if (typeof XLSX === "undefined") {
    showToast("Pustaka Excel belum dimuat. Coba muat ulang halaman.", "error");
    return;
  }
  var kepala = [
    "NIS",
    "NISN",
    "NIM",
    "NIK",
    "Nama Lengkap",
    "Jenis Kelamin",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Alamat",
    "Nama Ortu",
    "No HP Ortu",
    "Nama Ayah",
    "Nama Ibu",
    "Pekerjaan Ayah",
    "Pekerjaan Ibu",
    "Desa",
    "Kecamatan",
    "Kabupaten",
    "Anak Ke",
    "Umur",
    "Tahun Masuk",
    "RT",
    "Keterangan",
    "Yatim",
  ];
  var contoh = [
    [
      "24101",
      "0253679101",
      "3010",
      "35100000",
      "Contoh Siswa Satu",
      "Laki-laki",
      "Surabaya",
      "12/03/2011",
      "Karang Menur 12",
      "Bpk. Contoh",
      "08123400011",
      "Bpk. Contoh",
      "Ibu Contoh",
      "PNS",
      "Ibu RT",
      "Sukatani",
      "Sukamaju",
      "Sukabumi",
      "1",
      "15",
      "2024",
      "RT 01 RW 02",
      "",
      "false",
    ],
    [
      "24102",
      "0253679102",
      "3011",
      "35100001",
      "Contoh Siswa Dua",
      "Perempuan",
      "Gresik",
      "25/07/2011",
      "Bunder 8",
      "Ibu Contoh",
      "08123400022",
      "Bpk. Contoh 2",
      "Ibu Contoh 2",
      "Wiraswasta",
      "Guru",
      "Sukadamai",
      "Sukamaju",
      "Sukabumi",
      "2",
      "15",
      "2024",
      "RT 03 RW 04",
      "",
      "true",
    ],
  ];
  var ws = XLSX.utils.aoa_to_sheet([kepala].concat(contoh));
  ws["!cols"] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 24 },
    { wch: 13 },
    { wch: 16 },
    { wch: 15 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 8 },
  ];
  ws["!rows"] = [{ hpt: 26 }].concat(
    contoh.map(function () {
      return { hpt: 20 };
    }),
  );
  var tipis = { style: "thin", color: { rgb: "A7F3D0" } };
  var stKepala = {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0F766E" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stKuning = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "FEF9C3" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var stBiru = {
    font: { color: { rgb: "334155" } },
    fill: { fgColor: { rgb: "F0F9FF" } },
    alignment: { vertical: "center" },
    border: { top: tipis, bottom: tipis, left: tipis, right: tipis },
  };
  var batas = XLSX.utils.decode_range(ws["!ref"]);
  for (var R = batas.s.r; R <= batas.e.r; R++) {
    for (var C = batas.s.c; C <= batas.e.c; C++) {
      var sel = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[sel]) continue;
      ws[sel].s = R === batas.s.r ? stKepala : R % 2 ? stKuning : stBiru;
    }
  }
  ws["!autofilter"] = { ref: "A1:X" + String(batas.e.r + 1) };
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Siswa");
  var petunjuk = [
    ["PETUNJUK PENGISIAN TEMPLATE IMPOR SISWA"],
    [""],
    [
      "1. Isi SATU siswa per baris, mulai baris ke-2 (baris 1 = judul kolom, otomatis dilewati saat impor).",
    ],
    [
      "2. Kolom wajib diisi: NIS dan Nama Lengkap. Kolom lainnya boleh dikosongkan.",
    ],
    [
      '3. Jenis Kelamin boleh "Laki-laki" / "Perempuan". Jika kosong, otomatis menjadi Laki-laki.',
    ],
    ["4. Tanggal Lahir gunakan format dd/MM/yyyy, contoh: 12/03/2011."],
    [
      '5. Kolom Yatim isi "true" atau "false". Kolom Tahun Masuk isi angka tahun, contoh: 2024.',
    ],
    [
      '6. Baris contoh (nama "Contoh ...") tinggal diganti datanya, atau boleh dihapus.',
    ],
    [
      "7. Simpan berkas, lalu unggah lewat menu Impor Massal Siswa. Mendukung .xlsx, .xls, dan .csv.",
    ],
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(petunjuk);
  ws2["!cols"] = [{ wch: 95 }];
  ws2["!rows"] = petunjuk.map(function (x, i) {
    return { hpt: i === 0 ? 26 : 20 };
  });
  for (var k2 = 0; k2 < petunjuk.length; k2++) {
    var sel2 = XLSX.utils.encode_cell({ r: k2, c: 0 });
    if (!ws2[sel2]) continue;
    ws2[sel2].s =
      k2 === 0
        ? {
            font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "065F46" } },
            alignment: { vertical: "center" },
          }
        : {
            font: { color: { rgb: "334155" } },
            alignment: { vertical: "top", wrapText: true },
          };
  }
  XLSX.utils.book_append_sheet(wb, ws2, "Petunjuk");
  XLSX.writeFile(wb, "template-impor-siswa.xlsx");
}
/* ---------- DASHBOARD STATISTIK KEHADIRAN GURU (KEPALA/ADMIN) ---------- */
function __fmtISO(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
function __isoKeIndo(iso) {
  var p = String(iso).split("-");
  return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
}
function __mulaiMingguISO() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return __fmtISO(d);
}
function __akhirMingguISO() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));
  return __fmtISO(d);
}
function bukaStatistikGuru() {
  __modalOpen(
    "Dashboard Statistik Kehadiran Guru",
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:14px;">' +
      '<select id="stRentang" style="padding:9px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);" onchange="var d=document.getElementById(\'stKustom\');d.style.display=(this.value===\'kustom\')?\'flex\':\'none\';"><option value="minggu">Minggu Ini</option><option value="bulan" selected>Bulan Ini</option><option value="bulanlalu">Bulan Lalu</option><option value="kustom">Rentang Kustom</option></select>' +
      '<span id="stKustom" style="display:none;gap:8px;flex-wrap:wrap;">' +
      '<input type="date" id="stDari" style="padding:8px 10px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      '<input type="date" id="stSampai" style="padding:8px 10px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);">' +
      "</span>" +
      '<button type="button" onclick="tampilStatistikGuru()" style="padding:9px 16px;background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Tampilkan</button>' +
      "</div>" +
      '<div id="stHasil" style="min-height:20px;"></div>',
  );
}
async function tampilStatistikGuru() {
  var el = document.getElementById("stHasil");
  if (!el) return;
  var r = document.getElementById("stRentang").value;
  var dariISO = "",
    sampaiISO = "",
    label = "";
  if (r === "minggu") {
    dariISO = __mulaiMingguISO();
    sampaiISO = __akhirMingguISO();
    label =
      "Minggu ini (" +
      __tglIndo(dariISO) +
      " s/d " +
      __tglIndo(sampaiISO) +
      ")";
  } else if (r === "bulan") {
    dariISO = __bulanAwalISO();
    sampaiISO = __bulanAkhirISO();
    label =
      "Bulan ini (" + __tglIndo(dariISO) + " s/d " + __tglIndo(sampaiISO) + ")";
  } else if (r === "bulanlalu") {
    var d = new Date();
    var d0 = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    var d1 = new Date(d.getFullYear(), d.getMonth(), 0);
    dariISO = __fmtISO(d0);
    sampaiISO = __fmtISO(d1);
    label =
      "Bulan lalu (" +
      __tglIndo(dariISO) +
      " s/d " +
      __tglIndo(sampaiISO) +
      ")";
  } else {
    dariISO = (document.getElementById("stDari").value || "").trim();
    sampaiISO = (document.getElementById("stSampai").value || "").trim();
    if (!dariISO || !sampaiISO) {
      showToast("Isi tanggal Dari dan Sampai", "error");
      return;
    }
    label = "Periode " + __tglIndo(dariISO) + " s/d " + __tglIndo(sampaiISO);
  }
  el.innerHTML = __spinner();
  try {
    var res = await runServer(
      "getRekapPerGuruRentang",
      currentUser.username,
      __isoKeIndo(dariISO),
      __isoKeIndo(sampaiISO),
    );
    if (!res.success) {
      el.innerHTML = __errBox(res.message);
      return;
    }
    var data = res.data || [];
    if (!data.length) {
      el.innerHTML = __kosong("Tidak ada data guru pada periode tersebut.");
      return;
    }
    var total = data.length;
    var hadirTotal = 0,
      alpaTotal = 0,
      punyaPersen = 0,
      bawah75 = 0,
      bawah90 = 0;
    data.forEach(function (g) {
      hadirTotal += g.hadir || 0;
      alpaTotal += g.alpa || 0;
      if (
        g.persenKehadiranJadwal !== null &&
        g.persenKehadiranJadwal !== undefined
      ) {
        punyaPersen++;
        if (g.persenKehadiranJadwal < 75) bawah75++;
        if (g.persenKehadiranJadwal < 90) bawah90++;
      }
    });
    var rata = punyaPersen
      ? Math.round(
          data.reduce(function (s, g) {
            return (
              s +
              (g.persenKehadiranJadwal === null ||
              g.persenKehadiranJadwal === undefined
                ? 0
                : g.persenKehadiranJadwal)
            );
          }, 0) / punyaPersen,
        )
      : null;
    function warnaBerlabel(w) {
      var map = {
        "#34d399": "#047857",
        "#fb7185": "#be123c",
        "#fbbf24": "#b45309",
        "#4ade80": "#059669",
        "#f87171": "#dc2626",
      };
      return map[w] || w || "var(--ink)";
    }
    function card(txt, val, warna) {
      var w = warnaBerlabel(warna);
      return (
        '<div style="flex:1;min-width:130px;background:var(--parchment-alt);border:1px solid var(--line);border-radius:12px;padding:12px 14px;">' +
        '<div style="font-size:11px;color:var(--slate);font-weight:600;">' +
        esc(txt) +
        "</div>" +
        '<div style="font-size:22px;font-weight:800;color:' +
        w +
        ';">' +
        val +
        "</div></div>"
      );
    }
    var sorted = data.slice().sort(function (a, b) {
      return (b.persenKehadiranJadwal || 0) - (a.persenKehadiranJadwal || 0);
    });
    var top3 = sorted
      .slice(0, 3)
      .map(function (g) {
        return esc(g.namaLengkap);
      })
      .join(", ");
    var charts = data
      .map(function (g) {
        var p = g.persenKehadiranJadwal;
        var bar = "",
          ket = "";
        if (p === null || p === undefined) {
          bar =
            '<div style="height:12px;border-radius:6px;background:var(--line);width:100%;"></div>';
          ket =
            '<span style="font-size:11px;color:var(--slate-light);">belum ada jadwal</span>';
        } else {
          var warna = p >= 90 ? "#34d399" : p >= 75 ? "#fbbf24" : "#fb7185";
          var wTeks = warnaBerlabel(warna);
          var w = Math.max(3, Math.min(p, 100));
          bar =
            '<div style="height:12px;border-radius:6px;background:var(--line);position:relative;overflow:hidden;"><div style="width:' +
            w +
            "%;height:12px;background:" +
            warna +
            ';border-radius:6px;"></div></div>';
          ket =
            '<span style="font-size:11px;font-weight:700;color:' +
            wTeks +
            ';">' +
            p +
            "%</span>";
        }
        return (
          '<div style="margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap;">' +
          '<span style="font-size:12px;color:var(--ink);font-weight:600;">' +
          esc(g.namaLengkap) +
          "</span>" +
          '<span style="font-size:11px;color:var(--slate);">Hadir ' +
          esc(g.hadir || 0) +
          " | Izin " +
          esc(g.izin || 0) +
          " | Sakit " +
          esc(g.sakit || 0) +
          " | Cuti " +
          esc(g.cuti || 0) +
          " | Alpa " +
          esc(g.alpa || 0) +
          "</span>" +
          "</div>" +
          bar +
          '<div style="margin-top:3px;">' +
          ket +
          "</div></div>"
        );
      })
      .join("");
    el.innerHTML =
      '<div style="font-size:12px;color:var(--slate);margin-bottom:10px;">' +
      esc(label) +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">' +
      card("Guru Aktif", total) +
      card("Rata-rata Kehadiran", rata === null ? "-" : rata + "%", "#34d399") +
      card("Alpa Total", alpaTotal, alpaTotal > 0 ? "#fb7185" : "#34d399") +
      card("Guru <90%", bawah90, bawah90 > 0 ? "#fbbf24" : "#34d399") +
      card("Guru <75%", bawah75, bawah75 > 0 ? "#fb7185" : "#34d399") +
      "</div>" +
      (top3
        ? '<div style="font-size:12px;color:var(--slate);margin-bottom:12px;">Kehadiran terbaik: <b style="color:var(--ink);">' +
          top3 +
          "</b></div>"
        : "") +
      '<div style="background:var(--parchment-alt);border:1px solid var(--line);border-radius:12px;padding:14px;">' +
      charts +
      "</div>";
  } catch (e) {
    el.innerHTML = __errBox(e.message);
  }
}

/* ---------- KEPALA: REKAP SISWA ---------- */
async function muatKepalaSiswa() {
  var kf = document.getElementById("kepalaSiswaKelas");
  if (kf && !kf.options.length) {
    try {
      var k = await runServer("getDaftarKelas", currentUser.username);
      kf.innerHTML =
        '<option value="0">Semua Kelas</option>' +
        (k.data || [])
          .map(function (x) {
            return (
              '<option value="' + x.id + '">' + escH(x.kodeKelas) + "</option>"
            );
          })
          .join("");
    } catch (e) {}
  }
  var a = document.getElementById("kepalaSiswaAwal");
  if (a && !a.value) a.value = __bulanAwalISO();
  var b = document.getElementById("kepalaSiswaAkhir");
  if (b && !b.value) b.value = __bulanAkhirISO();
  tampilRekapSiswa(
    "#kepalaSiswaHasil",
    "kepalaSiswaKelas",
    "kepalaSiswaAwal",
    "kepalaSiswaAkhir",
  );
}
async function tampilRiwayatHarian() {
  var el = document.getElementById("kepalaSiswaHasil");
  if (!el) return;
  var tglSel =
    document.getElementById("kepalaSiswaAwal") ||
    document.getElementById("kepalaSiswaTgl");
  var tgl = tglSel ? __tglIndo(tglSel.value) : "";
  if (!tgl) {
    showToast("Pilih tanggal terlebih dahulu", "error");
    return;
  }
  el.innerHTML = __spinner();
  try {
    var res = await runServer(
      "getRiwayatPresensiTanggal",
      currentUser.username,
      tgl,
    );
    if (!res.success) {
      el.innerHTML =
        '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
        escH(res.message || "Gagal") +
        "</div>";
      return;
    }
    var rows = res.data || [];
    if (!rows.length) {
      el.innerHTML = __kosong(
        "Tidak ada presensi siswa tercatat pada " + escH(tgl) + ".",
      );
      return;
    }
    el.innerHTML =
      '<div class="card" style="padding:18px 20px;"><h3 style="margin:0 0 12px;font-size:15px;color:var(--ink);">Ringkasan Harian ' +
      escH(tgl) +
      "</h3>" +
      __tabelRiwayatHarian(rows) +
      "</div>";
  } catch (e) {
    el.innerHTML =
      '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
      escH(e.message) +
      "</div>";
  }
}
function __tabelRiwayatHarian(rows) {
  var head =
    '<thead><tr style="background:var(--parchment-alt);color:var(--slate);border-bottom:1px solid var(--line);text-align:left;"><th style="padding:8px;">Kelas</th><th style="padding:8px;">Jam</th><th style="padding:8px;">Mata Pelajaran</th><th style="padding:8px;">Guru</th><th style="padding:8px;">H</th><th style="padding:8px;">I</th><th style="padding:8px;">S</th><th style="padding:8px;">A</th><th style="padding:8px;">T</th><th style="padding:8px;">Jumlah</th></tr></thead>';
  var tr = rows
    .map(function (x) {
      return (
        '<tr style="border-bottom:1px solid var(--line);color:var(--ink);"><td style="padding:8px;font-weight:600;color:var(--ink);">' +
        escH(x.kelas) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        escH(x.jamKe) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        escH(x.mataPelajaran || "-") +
        '</td><td style="padding:8px;color:var(--ink);">' +
        escH(x.guru || "-") +
        "</td>" +
        '<td style="padding:8px;color:#047857;font-weight:700;">' +
        (x.hadir || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.izin || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.sakit || 0) +
        "</td>" +
        '<td style="padding:8px;color:#be123c;font-weight:700;">' +
        (x.alpa || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.telat || 0) +
        '</td><td style="padding:8px;color:var(--ink);">' +
        (x.total || 0) +
        "</td></tr>"
      );
    })
    .join("");
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
    head +
    "<tbody>" +
    tr +
    "</tbody></table></div>"
  );
}

/* ---------- GURU: LAYAR PRESENSI ---------- */
function __statusSesiJadwalGuru(jamKe, tanggal, sesi, index) {
  var today = __tglTodayISO();
  if (tanggal < today) return "Jadwal lampau";
  if (tanggal > today) return "Terjadwal";

  var waktu = waktuJamJadwal(jamKe).split(/[–-]/);
  if (waktu.length < 2) return "Terjadwal";
  var sekarang = new Date();
  var menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes();
  var mulai = waktu[0].split(":").map(Number);
  var selesai = waktu[1].split(":").map(Number);
  var menitMulai = mulai[0] * 60 + mulai[1];
  var menitSelesai = selesai[0] * 60 + selesai[1];

  if (menitSekarang >= menitMulai && menitSekarang < menitSelesai) {
    return "Berlangsung";
  }
  if (menitSekarang >= menitSelesai) return "Selesai";

  var sesiBerikutnya = sesi.findIndex(function (item) {
    var rentang = waktuJamJadwal(item.jamKe).split(/[–-]/);
    if (rentang.length < 2) return false;
    var jamMulai = rentang[0].split(":").map(Number);
    return jamMulai[0] * 60 + jamMulai[1] > menitSekarang;
  });
  return index === sesiBerikutnya ? "Berikutnya" : "Akan datang";
}

async function __statusPresensiSesiGuru(username, tanggal, sesi) {
  var res = await runServer(
    "getRosterPresensi",
    username,
    tanggal,
    String(sesi.kelas || ""),
    String(sesi.jamKe || ""),
  );
  if (!res || res.success !== true) {
    throw new Error(
      (res && res.message) || "Gagal memuat status presensi kelas.",
    );
  }
  return Number(res.sudahDicatat) > 0 ? "Sudah diisi" : "Belum diisi";
}

var __guruPresensiRequestId = 0;
async function muatPresensiGuru() {
  var requestId = ++__guruPresensiRequestId;
  var tglInp = document.getElementById("guruPresensiTgl");
  if (!tglInp) return;
  if (!tglInp.value) tglInp.value = __tglTodayISO();
  var tgl = tglInp.value;
  var list = document.getElementById("guruPresensiSesiList");
  var dateLabel = document.getElementById("guruPresensiSelectedDate");
  var sessionCount = document.getElementById("guruPresensiSessionCount");
  if (!list) return;
  var tglIndo = __tglIndo(tgl),
    hari = __hariIndo(tgl);
  if (dateLabel) {
    dateLabel.textContent =
      tglIndo + " · " + hari.charAt(0) + hari.slice(1).toLowerCase();
  }
  if (sessionCount) sessionCount.textContent = "Memuat jadwal...";
  list.innerHTML = __spinner();
  try {
    var res = await runServer("getJadwalSaya", currentUser.username);
    if (!res || res.success === false) {
      throw new Error((res && res.message) || "Gagal memuat jadwal mengajar.");
    }
    if (requestId !== __guruPresensiRequestId || tglInp.value !== tgl) return;
    var sesi = (res.data || []).filter(function (j) {
      return (
        String(j.hari || "").toUpperCase() === hari &&
        (!j.tanggal || j.tanggal === tglIndo)
      );
    });
    if (sessionCount) {
      sessionCount.textContent = sesi.length
        ? sesi.length + " sesi tersedia"
        : "Tidak ada jadwal";
    }
    if (!sesi.length) {
      list.innerHTML =
        '<div class="card guru-presensi-empty">' +
        '<span class="guru-presensi-empty-icon" aria-hidden="true">' +
        icon("calendar") +
        "</span>" +
        "<strong>Tidak Ada Jadwal Mengajar</strong>" +
        "<p>Tidak ada jadwal mengajar pada " +
        escH(tglIndo) +
        " (" +
        escH(hari.charAt(0) + hari.slice(1).toLowerCase()) +
        ").</p>" +
        "</div>";
      return;
    }
    sesi.sort(function (a, b) {
      return urutanJamJadwal(a.jamKe) - urutanJamJadwal(b.jamKe);
    });
    var tanggalHariIni = __tglTodayISO();
    var sesiDenganStatus = await Promise.all(
      sesi.map(async function (j, index) {
        if (tgl > tanggalHariIni) {
          return { jadwal: j, index: index, status: "Belum berlangsung" };
        }
        try {
          return {
            jadwal: j,
            index: index,
            status: await __statusPresensiSesiGuru(
              currentUser.username,
              tglIndo,
              j,
            ),
          };
        } catch (error) {
          return { jadwal: j, index: index, status: "Tidak diketahui", error: error };
        }
      }),
    );
    if (requestId !== __guruPresensiRequestId || tglInp.value !== tgl) return;
    var jumlahStatusGagal = sesiDenganStatus.filter(function (item) {
      return Boolean(item.error);
    }).length;
    if (jumlahStatusGagal) {
      showToast(
        "Status presensi " +
          jumlahStatusGagal +
          " sesi tidak dapat dimuat.",
        "error",
      );
    }
    list.innerHTML = sesi
        .map(function (j, index) {
          var statusPresensi = sesiDenganStatus[index].status;
          var statusClass =
            statusPresensi === "Sudah diisi"
              ? "is-recorded"
              : statusPresensi === "Belum diisi"
                ? "is-pending"
                : statusPresensi === "Tidak diketahui"
                  ? "is-unknown"
                  : "is-future";
          var kelasLabel = String(j.kelasNama || j.kelas || "Kelas");
          if (!/^kelas(?:\s|$)/i.test(kelasLabel)) {
            kelasLabel = "Kelas " + kelasLabel;
          }
          return (
            '<article class="card guru-class-session">' +
            '<div class="guru-class-session-top">' +
            '<div class="guru-class-session-icon" aria-hidden="true">' +
            icon("book") +
            "</div>" +
            '<div class="guru-class-session-title">' +
            "<h3>" +
            escH(j.mataPelajaran) +
            "</h3>" +
            "<p>" +
            (function () {
              var waktu = waktuJamJadwal(j.jamKe);
              return waktu
                ? "Jam ke-" +
                    escH(j.jamKe) +
                    " · " +
                    waktu
                : "Jam ke-" + escH(j.jamKe);
            })() +
            (j.penggantian
              ? ' <span class="guru-substitute-tag">Pengganti utk ' +
                escH(j.penggantianUntuk) +
                "</span>"
              : "") +
            "</p>" +
            "</div>" +
            '<span class="guru-session-ready ' +
            statusClass +
            '">' +
            escH(statusPresensi) +
            "</span>" +
            "</div>" +
            '<div class="guru-class-session-meta">' +
            '<span class="guru-session-chip">' +
            icon("users") +
            " " +
            escH(kelasLabel) +
            "</span>" +
            '<span class="guru-session-chip">' +
            icon("clock") +
            " Jam ke-" +
            escH(j.jamKe) +
            "</span>" +
            '<span class="guru-session-time-status">' +
            escH(__statusSesiJadwalGuru(j.jamKe, tgl, sesi, index)) +
            "</span>" +
            "</div>" +
            '<div class="guru-class-session-action">' +
            '<span>' +
            (statusPresensi === "Sudah diisi"
              ? "Presensi tersimpan · dapat diperbarui"
              : "Presensi kelas") +
            "</span>" +
            (function () {
              var jdfAttr = j.jamKeDaftar
                ? escH(JSON.stringify(j.jamKeDaftar))
                : "";
              return (
                '<button type="button" class="btn btn-primary btn-sm"' +
                ' data-tgl="' +
                escH(tglIndo) +
                '"' +
                ' data-kelas="' +
                escH(String(j.kelas)) +
                '"' +
                ' data-jam="' +
                escH(String(j.jamKe)) +
                '"' +
                ' data-jam-daftar="' +
                jdfAttr +
                '"' +
                ' onclick="__bukaPresensiBtn(this)"' +
                '><span aria-hidden="true">' +
                icon("pencil") +
                "</span>" +
                (statusPresensi === "Sudah diisi"
                  ? "Lihat / Ubah Presensi"
                  : "Isi Presensi") +
                "</button>"
              );
            })() +
            "</div></article>"
          );
        })
        .join("");
  } catch (e) {
    if (requestId !== __guruPresensiRequestId || tglInp.value !== tgl) return;
    if (sessionCount) sessionCount.textContent = "Jadwal gagal dimuat";
    list.innerHTML =
      '<div class="card" style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
      escH(e.message) +
      "</div>";
  }
}

function aturTanggalPresensiGuru(hariRelatif) {
  var input = document.getElementById("guruPresensiTgl");
  if (!input) return;
  var tanggal = new Date();
  tanggal.setDate(tanggal.getDate() + Number(hariRelatif || 0));
  input.value = [
    tanggal.getFullYear(),
    String(tanggal.getMonth() + 1).padStart(2, "0"),
    String(tanggal.getDate()).padStart(2, "0"),
  ].join("-");
  muatPresensiGuru();
}
// Helper: baca data-* attribute dari tombol lalu panggil bukaRosterPresensi
function __bukaPresensiBtn(btn) {
  var tgl = btn.getAttribute("data-tgl") || "";
  var kelas = btn.getAttribute("data-kelas") || "";
  var jam = btn.getAttribute("data-jam") || "";
  var jdfRaw = btn.getAttribute("data-jam-daftar") || "";
  var jdf = null;
  if (jdfRaw) {
    try {
      jdf = JSON.parse(jdfRaw);
    } catch (e) {
      jdf = null;
    }
  }
  bukaRosterPresensi(tgl, kelas, jam, jdf);
}
var __rosterMeta = null,
  __roster = [];
async function bukaRosterPresensi(tanggal, kelas, jamKe, jamKeDaftar) {
  __modalOpen(
    "Presensi Kelas " + kelas + " - Jam ke-" + jamKe,
    __spinner(),
    "presensi-roster",
  );
  try {
    var res = await runServer(
      "getRosterPresensi",
      currentUser.username,
      tanggal,
      kelas,
      jamKe,
    );
    if (!res.success) {
      __modalBody().innerHTML =
        '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
        escH(res.message) +
        "</div>";
      return;
    }
    __rosterMeta = {
      tanggal: tanggal,
      kelas: kelas,
      jamKe: String(jamKe),
      jamKeDaftar: jamKeDaftar || null,
      mapel: res.mataPelajaran || "",
      jadwalId: res.jadwalId || 0,
      hari: res.hari || "",
    };
    __roster = (res.siswa || []).map(function (s) {
      var st = String(s.status || "");
      if (st === "<nil>") st = "";
      var ket = String(s.keterangan || "");
      if (ket === "<nil>") ket = "";
      return {
        id: s.id,
        nis: s.nis,
        nama: s.namaLengkap,
        jk: s.jenisKelamin,
        status: st || "H",
        ket: ket,
      };
    });
    renderRoster();
  } catch (e) {
    var b = __modalBody();
    if (b)
      b.innerHTML =
        '<div style="padding:20px;text-align:center;color:#b91c1c;font-size:13px;">' +
        escH(e.message) +
        "</div>";
  }
}

function renderRoster() {
  var body = __modalBody();
  if (!body) return;
  if (!__roster.length) {
    body.innerHTML = __kosong("Kelas ini kosong / belum ada siswa terdaftar.");
    return;
  }
  var m = __rosterMeta || {};

  // 1. Header Informasi & Petunjuk Ringkas Sesuai Tampilan Asli
  var headerHtml =
    '<div class="presensi-roster-meta">' +
    escH(m.hari || "") +
    " &bull; " +
    escH(m.tanggal) +
    " &bull; <strong>" +
    escH(m.mapel || "") +
    "</strong> (Kelas " +
    escH(m.kelas) +
    ", Jam ke-" +
    escH(m.jamKe) +
    ")" +
    "</div>" +
    '<div class="presensi-roster-hint">' +
    "H=Hadir, I=Izin, S=Sakit, A=Alpa, T=Terlambat. Status default semua Hadir." +
    "</div>";

  // 2. Daftar Siswa Luas & Responsif (Baris 1: Nama Penuh 100%, Baris 2: 5 Tombol H I S A T Membentang di Bawah Nama)
  var listHtml =
    '<div class="no-scrollbar presensi-roster-list">' +
    __roster
      .map(function (s, i) {
        var isNonHadir = s.status !== "H";
        return (
          '<div class="roster-card-row" id="rosterRow' +
          i +
          '">' +
          '<div class="roster-nama-row">' +
          '<span class="roster-siswa-nama">' +
          (i + 1) +
          ". " +
          escH(s.nama) +
          "</span>" +
          '<span class="roster-siswa-meta">NIS: ' +
          escH(s.nis) +
          " &bull; " +
          (s.jk === "P" || s.jk === "Perempuan" ? "P" : "L") +
          "</span>" +
          "</div>" +
          '<div class="roster-btn-grid" id="stCell' +
          i +
          '">' +
          ["H", "I", "S", "A", "T"]
            .map(function (st) {
              var on = s.status === st;
              var statusLabel = {
                H: "Hadir",
                I: "Izin",
                S: "Sakit",
                A: "Alpa",
                T: "Terlambat",
              }[st];
              return (
                '<button type="button" class="roster-btn-st ' +
                (on ? "active" : "") +
                '" data-idx="' +
                i +
                '" data-st="' +
                st +
                '" aria-pressed="' +
                on +
                '" aria-label="' +
                statusLabel +
                '" title="' +
                st +
                '">' +
                st +
                "</button>"
              );
            })
            .join("") +
          "</div>" +
          '<div class="roster-note-box ' +
          (isNonHadir || s.ket ? "" : "hidden") +
          '" id="noteRow' +
          i +
          '" style="margin-top:8px;padding:0;">' +
          '<input class="roster-note-input js-ket" data-idx="' +
          i +
          '" value="' +
          escH(s.ket) +
          '" placeholder="Tulis alasan/keterangan (opsional)...">' +
          "</div>" +
          "</div>"
        );
      })
      .join("") +
    "</div>";

  // 3. Footer Lengkap: Ringkasan Teks + Tombol [Semua Hadir] + Tombol [Simpan Presensi]
  var footerHtml =
    '<div class="presensi-roster-footer">' +
    '<span id="rosterSummary" class="presensi-roster-summary"></span>' +
    '<div class="presensi-roster-actions">' +
    '<button type="button" class="btn btn-outline" onclick="semuaHadir()">Semua Hadir</button>' +
    '<button type="button" class="btn btn-primary" onclick="simpanAbsensiSiswa()">Simpan Presensi</button>' +
    "</div>" +
    "</div>";

  body.innerHTML = headerHtml + listHtml + footerHtml;

  body.querySelectorAll("button[data-idx]").forEach(function (b) {
    b.addEventListener("click", function () {
      var idx = parseInt(b.getAttribute("data-idx"), 10);
      var st = b.getAttribute("data-st");
      if (window.__roster[idx]) {
        window.__roster[idx].status = st;
        renderStatusButtons(idx);
      }
    });
  });

  body.querySelectorAll(".js-ket").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var idx = parseInt(inp.getAttribute("data-idx"), 10);
      if (window.__roster[idx]) window.__roster[idx].ket = inp.value;
    });
  });

  renderSummary();
}

function renderStatusButtons(idx) {
  if (!window.__roster[idx]) return;
  var currentSt = window.__roster[idx].status;
  var cell = document.getElementById("stCell" + idx);
  if (cell) {
    cell.querySelectorAll(".roster-btn-st").forEach(function (b) {
      var on = b.getAttribute("data-st") === currentSt;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  var noteRow = document.getElementById("noteRow" + idx);
  if (noteRow) {
    var shouldShow =
      currentSt !== "H" ||
      (window.__roster[idx].ket && window.__roster[idx].ket.trim().length > 0);
    noteRow.classList.toggle("hidden", !shouldShow);
    if (shouldShow && currentSt !== "H") {
      var inp = noteRow.querySelector(".js-ket");
      if (inp && !inp.value) {
        var pl =
          currentSt === "S"
            ? "Alasan sakit (cth. Demam, flu)..."
            : currentSt === "I"
              ? "Alasan izin (cth. Acara keluarga, lomba)..."
              : currentSt === "T"
                ? "Alasan terlambat (cth. Ban bocor, macet)..."
                : "Keterangan tambahan...";
        inp.setAttribute("placeholder", pl);
      }
    }
  }

  renderSummary();
}

function renderSummary() {
  var el = document.getElementById("rosterSummary");
  if (!el) return;
  var h = { H: 0, I: 0, S: 0, A: 0, T: 0 };
  window.__roster.forEach(function (s) {
    if (h[s.status] !== undefined) h[s.status]++;
  });
  el.textContent =
    "H:" +
    h.H +
    " I:" +
    h.I +
    " S:" +
    h.S +
    " A:" +
    h.A +
    " T:" +
    h.T +
    " (total " +
    window.__roster.length +
    ")";
}

function semuaHadir() {
  showConfirmModal(
    "Semua Hadir",
    "Setel semua siswa di kelas ini menjadi Hadir? Anda masih bisa mengubahnya sebelum disimpan.",
    "Setel Semua",
    function () {
      window.__roster.forEach(function (s) {
        s.status = "H";
        s.ket = "";
      });
      window.__roster.forEach(function (s, i) {
        renderStatusButtons(i);
      });
      document.querySelectorAll(".js-ket").forEach(function (inp) {
        inp.value = "";
      });
      showToast("Semua siswa disetel Hadir", "info");
    },
    "primary",
  );
}

async function simpanAbsensiSiswa() {
  if (!window.__rosterMeta || !window.__roster) {
    showToast("Data presensi belum dimuat", "error");
    return;
  }
  var meta = window.__rosterMeta;
  // Jika sesi gabungan (jamKeDaftar), kirim satu request per jam secara paralel
  var jamList =
    meta.jamKeDaftar && meta.jamKeDaftar.length > 0
      ? meta.jamKeDaftar
      : [meta.jamKe];
  var items = window.__roster.map(function (s) {
    return {
      siswaId: s.id,
      status: s.status,
      keterangan: (s.ket || "").trim(),
    };
  });
  var requests = jamList.map(function (jamKe) {
    return {
      username: (currentUser && currentUser.username) || "",
      tanggal: meta.tanggal,
      kelas: meta.kelas,
      jamKe: jamKe,
      mataPelajaran: meta.mapel,
      jadwalId: meta.jadwalId,
      items: items,
    };
  });
  showLoading("Menyimpan presensi...");
  try {
    var results = await Promise.all(
      requests.map(function (payload) {
        return runServer("catatAbsensiSiswa", payload);
      }),
    );
    hideLoading();
    var gagal = results.filter(function (r) {
      return !r || !r.success;
    });
    if (gagal.length > 0) {
      showToast(
        (gagal[0] && gagal[0].message) || "Gagal menyimpan presensi",
        "error",
      );
      return;
    }
    showToast(
      "Presensi " + meta.kelas + " jam " + meta.jamKe + " tersimpan",
      "success",
    );
    __modalClose();
    muatPresensiGuru();
  } catch (e) {
    hideLoading();
    showToast(e.message, "error");
  }
}

// Fallback ekspor saat XLSX tidak bisa dimuat (mis. offline): hasilkan .xls
// bergaya HTML agar pengguna tetap bisa mendownload laporan.
function __xlsHTML(judul, meta, kolom, baris, namaFile, lebar) {
  var thf = "";
  for (var kf = 0; kf < kolom.length; kf++) {
    thf +=
      '<th style="border:1px solid #94a3b8;background:#1e293b;color:#ffffff;padding:6px 9px;font-weight:700;text-align:left;">' +
      __xlsEsc(kolom[kf]) +
      "</th>";
  }
  function selF(c) {
    if (typeof c === "number")
      return (
        '<td style="border:1px solid #cbd5e1;padding:5px 9px;text-align:center;">' +
        c +
        "</td>"
      );
    return (
      '<td style="border:1px solid #cbd5e1;padding:5px 9px;">' +
      __xlsEsc(c) +
      "</td>"
    );
  }
  var trf = "";
  for (var ifa = 0; ifa < baris.length; ifa++) {
    trf +=
      "<tr" +
      (ifa % 2 === 1 ? ' style="background:#f9fafb;"' : "") +
      ">" +
      baris[ifa].map(selF).join("") +
      "</tr>";
  }
  var colgf = "";
  if (lebar && lebar.length) {
    colgf = "<colgroup>";
    for (var wf = 0; wf < lebar.length; wf++) {
      colgf += '<col style="width:' + (lebar[wf] || 80) + 'pt;">';
    }
    colgf += "</colgroup>";
  }
  var xlsf =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Rekap</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px;}h3{font-family:Calibri,Arial,sans-serif;margin:6px 0 2px;font-size:16px;}p.meta{font-family:Calibri,Arial,sans-serif;font-size:11px;color:#475569;margin:0 0 10px;}</style></head><body><h3>' +
    __xlsEsc(judul) +
    "</h3>" +
    (meta ? '<p class="meta">' + __xlsEsc(meta) + "</p>" : "") +
    '<table style="border-collapse:collapse;">' +
    colgf +
    "<tr>" +
    thf +
    "</tr>" +
    trf +
    "</table></body></html>";
  var blobb = new Blob(["\uFEFF" + xlsf], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  var aa = document.createElement("a");
  aa.href = URL.createObjectURL(blobb);
  aa.download = namaFile;
  aa.click();
  setTimeout(function () {
    URL.revokeObjectURL(aa.href);
  }, 2000);
}
/* =============================================================
   KEPALA — PERSETUJUAN IZIN & MONITORING (alur revisi)
   ============================================================= */
async function muatIzinApproval() {
  const list = document.getElementById("izinApprovalList");
  const kosong = document.getElementById("izinApprovalKosong");
  if (!list) return;
  list.innerHTML = '<p class="kbm-empty-text">Memuat pengajuan izin...</p>';
  if (kosong) kosong.classList.add("hidden");
  izinApprovalData = [];
  izinApprovalFilter = "Semua";
  renderIzinApprovalFilters();
  try {
    const res = await runServer("getIzinUntukApproval", currentUser.username);
    if (!res || !res.success) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      showToast(
        res && res.message ? res.message : "Gagal memuat pengajuan",
        "error",
      );
      return;
    }
    const data = res.data || [];
    izinApprovalData = data;
    renderIzinApprovalFilters();
    if (!data.length) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    renderIzinApprovalList();
  } catch (err) {
    list.innerHTML = "";
    if (kosong) kosong.classList.remove("hidden");
    showToast(err.message, "error");
  }
}

function renderIzinApprovalFilters() {
  const filters = document.getElementById("izinApprovalFilters");
  const count = document.getElementById("izinApprovalPendingCount");
  if (count) {
    count.textContent = `${izinApprovalData.length} Tertunda`;
    count.classList.toggle("hidden", !izinApprovalData.length);
  }
  if (!filters) return;
  filters.classList.toggle("hidden", !izinApprovalData.length);
  if (!izinApprovalData.length) {
    filters.innerHTML = "";
    return;
  }

  const counts = new Map();
  izinApprovalData.forEach((item) => {
    const jenis = String(item.jenis || "Lainnya");
    counts.set(jenis, (counts.get(jenis) || 0) + 1);
  });
  const options = [
    ["Semua", izinApprovalData.length],
    ...counts.entries(),
  ];
  filters.innerHTML = options
    .map(
      ([jenis, total]) => `
        <button type="button" class="kepala-approval-filter${jenis === izinApprovalFilter ? " active" : ""}" data-izin-filter="${esc(jenis)}" onclick="filterPengajuanIzin(this.dataset.izinFilter)">
          ${esc(jenis)} <span>${total}</span>
        </button>`,
    )
    .join("");
}

function renderIzinApprovalList() {
  const list = document.getElementById("izinApprovalList");
  const kosong = document.getElementById("izinApprovalKosong");
  const count = document.getElementById("izinApprovalListCount");
  if (!list) return;
  const data =
    izinApprovalFilter === "Semua"
      ? izinApprovalData
      : izinApprovalData.filter(
          (item) => String(item.jenis || "Lainnya") === izinApprovalFilter,
        );
  if (count) {
    count.textContent = `${data.length} pengajuan`;
    count.classList.toggle("hidden", !izinApprovalData.length);
  }
  list.innerHTML = data.map(izinApprovalCard).join("");
  if (kosong) kosong.classList.toggle("hidden", data.length > 0);
}

function filterPengajuanIzin(jenis) {
  izinApprovalFilter = jenis;
  renderIzinApprovalFilters();
  renderIzinApprovalList();
}

function izinApprovalCard(it) {
  const nama = String(it.nama || "?").trim();
  const jenis = String(it.jenis || "Lainnya");
  const periode =
    it.tglMulai === it.tglSelesai
      ? it.tglMulai
      : it.tglMulai + " s/d " + it.tglSelesai;
  const tanggalMulai = parseTanggalIzin(it.tglMulai);
  const tanggalSelesai = parseTanggalIzin(it.tglSelesai);
  const jumlahHari =
    tanggalMulai && tanggalSelesai
      ? Math.round((tanggalSelesai - tanggalMulai) / 86400000) + 1
      : 0;
  const durasi = jumlahHari > 0 ? `${jumlahHari} hari` : "";
  const pengganti = it.namaPengganti
    ? `<div class="kepala-approval-detail-line"><span>Guru pengganti</span><strong>${esc(it.namaPengganti)}</strong>${it.statusPengganti ? `<span class="kepala-approval-substatus">${esc(it.statusPengganti)}</span>` : ""}</div>`
    : "";
  return `<article class="card kepala-approval-card">
      <div class="kepala-approval-card-layout">
        <div class="kepala-approval-card-main">
          <div class="kepala-approval-card-title">
            <span class="kepala-approval-avatar" aria-hidden="true">${esc(nama.slice(0, 2).toUpperCase())}</span>
            <span class="kepala-approval-person"><strong>${esc(nama)}</strong><span class="badge muted kepala-approval-type">${esc(jenis)}</span></span>
          </div>
          <div class="kepala-approval-card-details">
            <div class="kepala-approval-detail-line"><span>Alasan</span><strong>${esc(it.alasan || "Tidak ada keterangan")}</strong></div>
            <div class="kepala-approval-detail-line"><span>Periode</span><strong>${esc(periode)}${durasi ? ` · ${durasi}` : ""}</strong></div>
            ${pengganti}
          </div>
        </div>
        <div class="kepala-approval-actions">
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="prosesIzinKlik(${it.id},'Tolak')">Tolak</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="prosesIzinKlik(${it.id},'Setujui')">Setujui Izin</button>
        </div>
      </div>
    </article>`;
}

function parseTanggalIzin(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

function prosesIzinKlik(izinId, aksi) {
  const label = aksi === "Setujui" ? "menyetujui" : "menolak";
  showConfirmModal(
    "Konfirmasi",
    "Anda yakin ingin " + label + " pengajuan izin ini?",
    "Ya, Lanjutkan",
    async function () {
      if (cekAksiBerjalan()) return;
      showLoading("Memproses...");
      try {
        const res = await runServer("prosesIzin", currentUser.username, {
          izinId: izinId,
          aksi: aksi,
          catatan: "",
        });
        if (!res || !res.success) {
          showToast(
            res && res.message ? res.message : "Gagal memproses",
            "error",
          );
          return;
        }
        showToast(res.message || "Berhasil", "success");
        muatIzinApproval();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    },
    "primary",
  );
}

async function muatMonitoringIzin() {
  const now = new Date();
  const bEl = document.getElementById("monitoringBulan");
  const tEl = document.getElementById("monitoringTahun");
  if (bEl && !bEl.value) bEl.value = String(now.getMonth() + 1);
  if (tEl && (!tEl.value || tEl.value === ""))
    tEl.value = String(now.getFullYear());
  const tbody = document.getElementById("monitoringIzinTbody");
  const wrap = document.getElementById("monitoringIzinBody");
  const kosong = document.getElementById("monitoringIzinKosong");
  if (!tbody) return;
  const bulan = parseInt(bEl.value, 10) || now.getMonth() + 1;
  const tahun = parseInt(tEl.value, 10) || now.getFullYear();
  try {
    const res = await runServer(
      "getMonitoringIzin",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal memuat monitoring",
        "error",
      );
      return;
    }
    const data = res.data || [];
    if (!data.length) {
      tbody.innerHTML = "";
      if (wrap) wrap.classList.add("hidden");
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    if (wrap) wrap.classList.remove("hidden");
    if (kosong) kosong.classList.add("hidden");
    tbody.innerHTML = data
      .map(
        (d) => `<tr class="monitoring-izin-row">
        <td data-label="Nama">${esc(d.nama)}</td>
        <td data-label="Jenis"><span class="badge muted">${esc(d.jenis)}</span></td>
        <td data-label="Pengajuan">${esc(d.jumlahPengajuan)}</td>
        <td data-label="Hari">${esc(d.totalHari)} hari</td>
        <td data-label="Periode">${esc(d.periodeMulai)} s/d ${esc(d.periodeSelesai)}</td>
        <td data-label="Pengganti">${esc(d.namaPengganti || "-")}</td>
      </tr>`,
      )
      .join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatSesiMengajar() {
  const list = document.getElementById("sesiMengajarList");
  const kosong = document.getElementById("sesiMengajarKosong");
  const input = document.getElementById("sesiTanggal");
  if (!list) return;
  if (input && !input.value)
    input.value = new Date().toISOString().slice(0, 10);
  const iso = input ? input.value : "";
  if (!iso) {
    showToast("Pilih tanggal terlebih dahulu.", "info");
    return;
  }
  const tglIndo = formatTanggalISOtoIndo(iso);
  list.innerHTML = '<p class="kbm-empty-text">Memuat sesi mengajar...</p>';
  if (kosong) kosong.classList.add("hidden");
  try {
    const res = await runServer(
      "getSesiMengajar",
      currentUser.username,
      tglIndo,
    );
    if (!res || !res.success) {
      list.innerHTML = "";
      showToast(
        res && res.message ? res.message : "Gagal memuat sesi",
        "error",
      );
      return;
    }
    const data = res.data || [];
    if (!data.length) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    list.innerHTML = data
      .map((s) => {
        const jam =
          s.jamMulai && s.jamSelesai ? s.jamMulai + " - " + s.jamSelesai : "-";
        const pengajar = s.namaPengganti
          ? esc(s.namaPengajar) +
            " \u2192 <strong>" +
            esc(s.namaPengganti) +
            "</strong>"
          : esc(s.namaPengajar);
        return `<article class="kepala-monitoring-session">
        <div class="kepala-monitoring-session-main">
          <strong>${esc(s.mapel)} \u00b7 Kelas ${esc(s.kelas)}</strong>
          <span>${pengajar}</span>
        </div>
        <div class="kepala-monitoring-session-info">
          <span>Jam ke ${esc(s.jamKe)} \u00b7 ${esc(jam)}</span>
          <span class="kepala-monitoring-session-status"><span class="badge muted">${esc(s.statusSesi || "-")}</span><span>${esc(s.durasiMenit || 0)} menit</span></span>
        </div>
      </article>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}
/* =============================================================
   ADMIN — MASTER DATA MAPEL (CRUD)
   ============================================================= */
var mapelCache = [];
var mapelEditId = null;

async function muatDaftarMapel() {
  const tbody = document.getElementById("mapelBody");
  if (!tbody) return;
  try {
    const res = await runServer("getDaftarMapel", currentUser.username);
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal memuat mapel",
        "error",
      );
      return;
    }
    mapelCache = res.data || [];
    renderTabelMapel();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderTabelMapel() {
  const tbody = document.getElementById("mapelBody");
  const wrap = document.getElementById("mapelBodyWrap");
  const kosong = document.getElementById("mapelBodyKosong");
  if (!tbody) return;
  if (!mapelCache.length) {
    if (wrap) wrap.classList.add("hidden");
    if (kosong) kosong.classList.remove("hidden");
    return;
  }
  if (wrap) wrap.classList.remove("hidden");
  if (kosong) kosong.classList.add("hidden");
  tbody.innerHTML = mapelCache
    .map(
      (m) => `<tr>
      <td data-label="KODE" style="font-family:monospace;">${esc(m.kode || "-")}</td>
      <td data-label="NAMA MAPEL" style="font-weight:600;">${esc(m.nama)}</td>
      <td data-label="KELOMPOK">${esc(m.kelompok || "-")}</td>
      <td data-label="STATUS">${m.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge muted">Nonaktif</span>'}</td>
      <td data-label="Aksi" style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn-outline btn-sm" onclick="bukaModalMapel(${m.id})">Edit</button>
        <button type="button" class="btn btn-outline btn-sm text-danger" onclick="hapusMapelKlik(${m.id})">Hapus</button>
      </td>
    </tr>`,
    )
    .join("");
}

function bukaModalMapel(id) {
  const modal = document.getElementById("mapelModal");
  if (!modal) return;
  mapelEditId = id || null;
  const title = document.getElementById("mapelModalTitle");
  const fKode = document.getElementById("mapelKode");
  const fNama = document.getElementById("mapelNama");
  const fKel = document.getElementById("mapelKelompok");
  const fAktif = document.getElementById("mapelAktif");
  if (id) {
    const m = mapelCache.find((x) => x.id === id) || {};
    title.textContent = "Ubah Mata Pelajaran";
    fKode.value = m.kode || "";
    fNama.value = m.nama || "";
    fKel.value = m.kelompok || "Wajib";
    fAktif.checked = !!m.aktif;
  } else {
    title.textContent = "Tambah Mata Pelajaran";
    fKode.value = "";
    fNama.value = "";
    fKel.value = "Wajib";
    fAktif.checked = true;
  }
  modal.classList.remove("hidden");
}

function tutupModalMapel() {
  const modal = document.getElementById("mapelModal");
  if (modal) modal.classList.add("hidden");
}

async function simpanMapelSubmit(e) {
  if (e) e.preventDefault();
  if (cekAksiBerjalan()) return;
  const payload = {
    id: mapelEditId || 0,
    kode: (document.getElementById("mapelKode").value || "").trim(),
    nama: (document.getElementById("mapelNama").value || "").trim(),
    kelompok: (document.getElementById("mapelKelompok").value || "").trim(),
    aktif: !!document.getElementById("mapelAktif").checked,
  };
  if (!payload.nama) {
    showToast("Nama mapel wajib diisi.", "error");
    return;
  }
  showLoading("Menyimpan...");
  try {
    const res = await runServer("simpanMapel", currentUser.username, payload);
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal menyimpan mapel",
        "error",
      );
      return;
    }
    showToast(res.message || "Mapel tersimpan", "success");
    tutupModalMapel();
    __masterMapelCache = null;
    luapkanMuatan("masterMapel");
    muatDaftarMapel();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

function hapusMapelKlik(id) {
  const m = mapelCache.find((x) => x.id === id);
  showConfirmModal(
    "Nonaktifkan Mapel",
    'Mapel "' +
      (m ? m.nama : "") +
      '" akan dinonaktifkan. Jadwal lama tetap tersimpan.',
    "Ya, Nonaktifkan",
    async function () {
      if (cekAksiBerjalan()) return;
      showLoading("Memproses...");
      try {
        const res = await runServer("hapusMapel", currentUser.username, {
          id: id,
        });
        if (!res || !res.success) {
          showToast(
            res && res.message ? res.message : "Gagal menonaktifkan mapel",
            "error",
          );
          return;
        }
        showToast(res.message || "Mapel dinonaktifkan", "success");
        __masterMapelCache = null;
        muatDaftarMapel();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    },
  );
}
