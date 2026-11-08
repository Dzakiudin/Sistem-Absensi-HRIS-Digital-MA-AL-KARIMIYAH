/* =============================================================
   AUTENTIKASI
   ============================================================= */
async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById("loginSubmitBtn");
  if (btn && btn.disabled) return false;
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errBox = document.getElementById("loginError");
  errBox.classList.add("hidden");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Memeriksa...";
  }
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

function isGuruBK(user) {
  const u = user || currentUser;
  if (!u) return false;
  if (u.isGuruBK === true) return true;
  if (String(u.role || "").toLowerCase() === "bk") return true;
  const mp = String(u.mataPelajaran || "")
    .toLowerCase()
    .trim();
  if (!mp || mp === "-") return false;
  if (
    mp === "bk" ||
    mp === "koord bk" ||
    mp === "koordinator bk" ||
    mp === "guru bk" ||
    mp.includes("bimbingan") ||
    mp.includes("konseling")
  ) {
    return true;
  }
  const tokens = mp.split(/[\s,/\-.()]+/);
  return tokens.includes("bk");
}

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
  if (
    currentUser.role === "guru" ||
    currentUser.role === "staf" ||
    currentUser.role === "bk"
  ) {
    const userIsBK = isGuruBK(currentUser);
    document.getElementById("guruSection").classList.remove("hidden");
    document
      .querySelectorAll('.guru-bottom-nav button[data-tab="honor"]')
      .forEach((el) => {
        el.classList.remove("hidden");
        el.style.removeProperty("display");
      });
    const navBK = document.getElementById("guruNavBtnBK");
    if (navBK) {
      navBK.classList.toggle("hidden", !userIsBK);
      if (userIsBK) navBK.style.removeProperty("display");
    }
    document
      .querySelectorAll("#guruSection .guru-bottom-nav")
      .forEach((nav) => nav.classList.toggle("has-bk-tab", userIsBK));
    const homeBKWidget = document.getElementById("guruHomeBKWidget");
    if (homeBKWidget) {
      homeBKWidget.classList.toggle("hidden", !userIsBK);
    }

    const mpRaw = String(currentUser.mataPelajaran || "").trim();
    const isKoordBK = mpRaw.toLowerCase().includes("koord");
    const labelBK = isKoordBK ? "Koordinator BK" : "Guru BK";
    const labelBKDropdown = isKoordBK
      ? "Koordinator BK · Bimbingan & Konseling"
      : "Guru Bimbingan & Konseling (BK)";
    const rincian = userIsBK
      ? labelBK
      : currentUser.role === "staf"
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
    const roleLabelEl = document.getElementById("guruDropdownRoleLabel");
    if (roleLabelEl) {
      roleLabelEl.textContent = userIsBK
        ? labelBKDropdown
        : currentUser.role === "staf"
          ? "Tenaga Kependidikan / Staf"
          : "Guru Pengajar";
    }
    const cloneName = document.querySelector(".js-user-name-clone");
    if (cloneName) cloneName.textContent = currentUser.namaLengkap;
    updateGuruMarquee();
    if (currentUser.role === "staf") {
      // Sembunyikan elemen khusus mengajar di dashboard absensi (muncul otomatis jika sudah konfirmasi guru pengganti)
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
