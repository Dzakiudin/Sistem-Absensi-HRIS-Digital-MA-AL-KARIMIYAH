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
