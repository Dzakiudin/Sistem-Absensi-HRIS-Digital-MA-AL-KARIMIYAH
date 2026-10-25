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
