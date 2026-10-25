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
