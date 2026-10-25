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
