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
