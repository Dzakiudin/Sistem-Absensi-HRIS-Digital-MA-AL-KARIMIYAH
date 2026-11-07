/* =============================================================
   MODUL KHUSUS GURU BK (BIMBINGAN & KONSELING)
   Portal Presensi (#guruSection) — Radar Presensi, Diagram Kelas,
   Direktori Data Asuh (Yatim/Luar/Kepulauan), & Jurnal Bimbingan BK
   ============================================================= */

var __bkDashboardCache = null;
var __bkCatatanListCache = [];
var __bkSubTabAktif = "radar";
var __bkRadarFilter = {
  risiko: "rawan",
  kelas: "",
  cari: "",
  awal: "",
  akhir: "",
};
var __bkDirektoriFilter = {
  atensi: "semua",
  kelas: "",
  cari: "",
};
var __bkJurnalFilter = {
  status: "",
  kategori: "",
  cari: "",
};

var BK_KATEGORI_LIST = [
  "Kedisiplinan / Alfa",
  "Keterlambatan",
  "Sakit / Izin Berkepanjangan",
  "Konseling Pribadi & Sosial",
  "Akademik & Motivasi Belajar",
  "Pendampingan Siswa Yatim / Atensi",
  "Panggilan Orang Tua / Wali",
  "Home Visit (Kunjungan Rumah)",
];

var BK_STATUS_LIST = ["Dipantau", "Panggilan Ortu", "Home Visit", "Selesai"];

function __bkRiskMeta(level) {
  if (level === "kritis") {
    return {
      label: "Kritis · Panggilan Ortu",
      short: "Kritis",
      cls: "is-kritis",
      color: "#e11d48",
    };
  }
  if (level === "waspada") {
    return {
      label: "Waspada · Pembinaan BK",
      short: "Waspada",
      cls: "is-waspada",
      color: "#d97706",
    };
  }
  if (level === "pantauan") {
    return {
      label: "Pantauan Presensi",
      short: "Pantauan",
      cls: "is-pantauan",
      color: "#0284c7",
    };
  }
  return {
    label: "Kehadiran Baik",
    short: "Aman",
    cls: "is-aman",
    color: "#059669",
  };
}

function __bkStatusMeta(status) {
  var st = String(status || "Dipantau").toLowerCase();
  if (st.includes("selesai")) {
    return { label: status || "Selesai", cls: "is-selesai" };
  }
  if (st.includes("ortu") || st.includes("panggilan")) {
    return { label: status || "Panggilan Ortu", cls: "is-ortu" };
  }
  if (st.includes("visit") || st.includes("kunjungan")) {
    return { label: status || "Home Visit", cls: "is-visit" };
  }
  return { label: status || "Dipantau", cls: "is-dipantau" };
}

function __bkKelasUnik() {
  var d = (__bkDashboardCache && __bkDashboardCache.siswa) || [];
  var set = {};
  d.forEach(function (s) {
    if (s.kelas && s.kelas !== "-") set[s.kelas] = true;
  });
  return Object.keys(set).sort(function (a, b) {
    var pa = a.split("-");
    var pb = b.split("-");
    var rom = { X: 10, XI: 11, XII: 12, VII: 7, VIII: 8, IX: 9 };
    var ra = rom[pa[0]] || 99;
    var rb = rom[pb[0]] || 99;
    if (ra !== rb) return ra - rb;
    return (parseInt(pa[1], 10) || 0) - (parseInt(pb[1], 10) || 0);
  });
}

function __bkCariSiswaById(id) {
  var list = (__bkDashboardCache && __bkDashboardCache.siswa) || [];
  var target = Number(id) || 0;
  for (var i = 0; i < list.length; i++) {
    if (Number(list[i].id) === target) return list[i];
  }
  return null;
}

/* =============================================================
   WIDGET RINGKASAN BK DI BERANDA (#guruPanelAbsen)
   ============================================================= */
async function muatRingkasanBerandaBK() {
  var widget = document.getElementById("guruHomeBKWidget");
  var card = document.getElementById("guruHomeBKCard");
  if (!widget || !card || !currentUser) return;
  if (typeof isGuruBK === "function" && !isGuruBK(currentUser)) {
    widget.classList.add("hidden");
    return;
  }
  widget.classList.remove("hidden");

  try {
    var res = await runServer("getDashboardBK", currentUser.username, {
      tanggalMulai: __tglIndo(__bulanAwalISO()),
      tanggalAkhir: __tglIndo(__bulanAkhirISO()),
    });
    if (!res || !res.success) {
      throw new Error((res && res.message) || "Gagal memuat ringkasan BK.");
    }
    __bkDashboardCache = res;
    __bkCatatanListCache = res.catatanTerbaru || [];

    var rk = res.ringkasan || {};
    var jmlRawan =
      (Number(rk.siswaKritis) || 0) + (Number(rk.siswaWaspada) || 0);
    var topRawan = (res.siswa || [])
      .filter(function (s) {
        return s.levelRisiko === "kritis" || s.levelRisiko === "waspada";
      })
      .slice(0, 3);

    var topHtml = "";
    if (topRawan.length > 0) {
      topHtml =
        '<div class="guru-bk-home-top-list">' +
        '<div class="guru-bk-home-top-label">Perlu Tindak Lanjut Segera:</div>' +
        topRawan
          .map(function (s) {
            var rm = __bkRiskMeta(s.levelRisiko);
            return (
              '<div class="guru-bk-home-top-item">' +
              '<div class="guru-bk-home-top-main" onclick="bukaProfilSiswaBK(' +
              s.id +
              ')">' +
              '<span class="guru-bk-risk-dot ' +
              rm.cls +
              '"></span>' +
              '<div class="guru-bk-home-top-text">' +
              "<strong>" +
              escH(s.namaLengkap) +
              "</strong>" +
              "<span>Kelas " +
              escH(s.kelas) +
              " &bull; " +
              escH(s.alasanRisiko) +
              "</span>" +
              "</div>" +
              "</div>" +
              '<button type="button" class="guru-bk-mini-btn" onclick="bukaModalCatatanBK(0, ' +
              s.id +
              ')">+ Pembinaan</button>' +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    } else {
      topHtml =
        '<div class="guru-bk-home-safe-banner">' +
        "<span>Belum ada siswa berstatus Kritis/Waspada pada periode ini. Pantau terus kehadiran harian dan data asuh siswa.</span>" +
        "</div>";
    }

    card.innerHTML =
      '<div class="guru-bk-home-summary">' +
      '<div class="guru-bk-home-metrics">' +
      '<button type="button" class="guru-bk-home-metric is-danger" onclick="bukaSubTabBKDariBeranda(\'radar\', \'rawan\')">' +
      "<strong>" +
      jmlRawan +
      "</strong>" +
      "<span>Rawan Presensi</span>" +
      "</button>" +
      '<button type="button" class="guru-bk-home-metric is-violet" onclick="bukaSubTabBKDariBeranda(\'direktori\', \'yatim\')">' +
      "<strong>" +
      (rk.totalYatim || 0) +
      "</strong>" +
      "<span>Anak Yatim</span>" +
      "</button>" +
      '<button type="button" class="guru-bk-home-metric is-sky" onclick="bukaSubTabBKDariBeranda(\'direktori\', \'luar\')">' +
      "<strong>" +
      (rk.totalLuar || 0) +
      "</strong>" +
      "<span>Domisili Luar</span>" +
      "</button>" +
      '<button type="button" class="guru-bk-home-metric is-emerald" onclick="bukaSubTabBKDariBeranda(\'jurnal\')">' +
      "<strong>" +
      (rk.totalCatatanBK || 0) +
      "</strong>" +
      "<span>Jurnal BK</span>" +
      "</button>" +
      "</div>" +
      topHtml +
      '<div class="guru-bk-home-QuickActions">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="gantiTabGuru(\'bk\')">Buka Pusat Pantauan BK</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="bukaModalCatatanBK(0, 0)">+ Catat Konseling</button>' +
      "</div>" +
      "</div>";
  } catch (err) {
    card.innerHTML =
      '<div class="guru-home-empty">' +
      "<div><strong>Ringkasan BK belum termuat</strong><p>" +
      escH(err && err.message ? err.message : "Buka tab Pantauan BK untuk menyinkronkan.") +
      "</p></div></div>";
  }
}

function bukaSubTabBKDariBeranda(subTab, filterVal) {
  if (subTab === "radar" && filterVal) {
    __bkRadarFilter.risiko = filterVal;
  }
  if (subTab === "direktori" && filterVal) {
    __bkDirektoriFilter.atensi = filterVal;
  }
  __bkSubTabAktif = subTab || "radar";
  gantiTabGuru("bk");
}

/* =============================================================
   PANEL UTAMA PANTAUAN BK (#guruPanelBK)
   ============================================================= */
async function muatPanelGuruBK(forceRefresh) {
  if (!currentUser) return;
  var area = document.getElementById("guruBKContentArea");
  var kpiGrid = document.getElementById("guruBKKpiGrid");
  var liveEl = document.getElementById("guruBKLiveStatus");
  if (!area) return;

  if (!__bkRadarFilter.awal) __bkRadarFilter.awal = __bulanAwalISO();
  if (!__bkRadarFilter.akhir) __bkRadarFilter.akhir = __bulanAkhirISO();

  if (forceRefresh || !__bkDashboardCache) {
    area.innerHTML = __spinner();
    if (liveEl) liveEl.textContent = "Menyinkronkan data siswa...";
    try {
      var res = await runServer("getDashboardBK", currentUser.username, {
        tanggalMulai: __tglIndo(__bkRadarFilter.awal),
        tanggalAkhir: __tglIndo(__bkRadarFilter.akhir),
      });
      if (!res || !res.success) {
        area.innerHTML = __errBox((res && res.message) || "Gagal memuat data BK");
        return;
      }
      __bkDashboardCache = res;
      __bkCatatanListCache = res.catatanTerbaru || [];
    } catch (e) {
      area.innerHTML = __errBox(e.message || "Gagal memuat data BK");
      return;
    }
  }

  var rk = (__bkDashboardCache && __bkDashboardCache.ringkasan) || {};
  if (liveEl) {
    liveEl.textContent =
      (rk.totalSiswa || 0) + " siswa aktif · 15 rombel";
  }

  if (kpiGrid) {
    var rawanCount =
      (Number(rk.siswaKritis) || 0) + (Number(rk.siswaWaspada) || 0);
    kpiGrid.innerHTML =
      '<button type="button" class="guru-bk-kpi-card is-rose" onclick="gantiSubTabBK(\'radar\')">' +
      '<span class="guru-bk-kpi-val">' +
      rawanCount +
      "</span>" +
      '<span class="guru-bk-kpi-lbl">Kritis &amp; Waspada</span>' +
      '<small class="guru-bk-kpi-sub">' +
      (rk.siswaKritis || 0) +
      " kritis · " +
      (rk.siswaWaspada || 0) +
      " waspada</small>" +
      "</button>" +
      '<button type="button" class="guru-bk-kpi-card is-violet" onclick="pilihFilterAtensiBK(\'yatim\')">' +
      '<span class="guru-bk-kpi-val">' +
      (rk.totalYatim || 0) +
      "</span>" +
      '<span class="guru-bk-kpi-lbl">Siswa Yatim</span>' +
      '<small class="guru-bk-kpi-sub">Atensi pendampingan</small>' +
      "</button>" +
      '<button type="button" class="guru-bk-kpi-card is-sky" onclick="pilihFilterAtensiBK(\'luar\')">' +
      '<span class="guru-bk-kpi-val">' +
      (rk.totalLuar || 0) +
      "</span>" +
      '<span class="guru-bk-kpi-lbl">Domisili Luar</span>' +
      '<small class="guru-bk-kpi-sub">' +
      (rk.totalKepulauan || 0) +
      " asal kepulauan</small>" +
      "</button>" +
      '<button type="button" class="guru-bk-kpi-card is-emerald" onclick="gantiSubTabBK(\'jurnal\')">' +
      '<span class="guru-bk-kpi-val">' +
      (rk.totalCatatanBK || 0) +
      "</span>" +
      '<span class="guru-bk-kpi-lbl">Jurnal Bimbingan</span>' +
      '<small class="guru-bk-kpi-sub">' +
      (rk.catatanAktif || 0) +
      " dalam pantauan</small>" +
      "</button>";
  }

  gantiSubTabBK(__bkSubTabAktif || "radar");
}

function pilihFilterAtensiBK(atensi) {
  __bkDirektoriFilter.atensi = atensi || "semua";
  gantiSubTabBK("direktori");
}

function gantiSubTabBK(subTab) {
  __bkSubTabAktif = subTab || "radar";
  document
    .querySelectorAll("#guruPanelBK .guru-bk-tab-btn")
    .forEach(function (btn) {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-bk-tab") === __bkSubTabAktif,
      );
    });

  if (__bkSubTabAktif === "radar") {
    renderSubTabRadarBK();
  } else if (__bkSubTabAktif === "kelas") {
    renderSubTabKelasBK();
  } else if (__bkSubTabAktif === "direktori") {
    renderSubTabDirektoriBK();
  } else if (__bkSubTabAktif === "jurnal") {
    renderSubTabJurnalBK();
  }
}

/* =============================================================
   SUB-TAB 1: RADAR SISWA RAWAN PRESENSI (EARLY WARNING SYSTEM)
   ============================================================= */
function renderSubTabRadarBK() {
  var area = document.getElementById("guruBKContentArea");
  if (!area) return;

  var rk = (__bkDashboardCache && __bkDashboardCache.ringkasan) || {};
  var kelasList = __bkKelasUnik();
  var kelasOpts =
    '<option value="">Semua Kelas</option>' +
    kelasList
      .map(function (k) {
        return (
          '<option value="' +
          escH(k) +
          '"' +
          (__bkRadarFilter.kelas === k ? " selected" : "") +
          ">Kelas " +
          escH(k) +
          "</option>"
        );
      })
      .join("");

  var jmlRawan =
    (Number(rk.siswaKritis) || 0) +
    (Number(rk.siswaWaspada) || 0) +
    (Number(rk.siswaPantauan) || 0);

  var chips = [
    { id: "rawan", label: "Semua Rawan (" + jmlRawan + ")" },
    { id: "kritis", label: "Kritis (" + (rk.siswaKritis || 0) + ")" },
    { id: "waspada", label: "Waspada (" + (rk.siswaWaspada || 0) + ")" },
    { id: "pantauan", label: "Pantauan (" + (rk.siswaPantauan || 0) + ")" },
    { id: "semua", label: "Semua Siswa (" + (rk.totalSiswa || 0) + ")" },
  ];

  area.innerHTML =
    '<div class="card guru-bk-filter-card">' +
    '<div class="guru-bk-card-head">' +
    "<div>" +
    "<h3>Radar Deteksi Dini Presensi Siswa</h3>" +
    "<p>Mendeteksi siswa dengan frekuensi Alfa, Terlambat, atau Sakit/Izin tinggi lintas rombel.</p>" +
    "</div>" +
    '<button type="button" class="btn btn-outline btn-sm" onclick="muatPanelGuruBK(true)">↻ Sinkron</button>' +
    "</div>" +
    '<div class="guru-bk-date-bar">' +
    '<div class="guru-bk-date-field">' +
    "<label>Dari Tanggal</label>" +
    '<input type="date" id="bkRadarAwalInp" class="input input-sm" value="' +
    escH(__bkRadarFilter.awal) +
    '" />' +
    "</div>" +
    '<div class="guru-bk-date-field">' +
    "<label>Sampai Tanggal</label>" +
    '<input type="date" id="bkRadarAkhirInp" class="input input-sm" value="' +
    escH(__bkRadarFilter.akhir) +
    '" />' +
    "</div>" +
    '<button type="button" class="btn btn-primary btn-sm" onclick="terapkanPeriodeRadarBK()">Terapkan Periode</button>' +
    "</div>" +
    '<div class="guru-bk-chip-scroll">' +
    chips
      .map(function (c) {
        return (
          '<button type="button" class="guru-bk-chip ' +
          (__bkRadarFilter.risiko === c.id ? "active" : "") +
          '" onclick="setFilterRadarRisikoBK(\'' +
          c.id +
          "')\">" +
          escH(c.label) +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="guru-bk-search-row">' +
    '<select id="bkRadarKelasSel" class="input input-sm" onchange="setFilterRadarKelasBK(this.value)">' +
    kelasOpts +
    "</select>" +
    '<input type="search" id="bkRadarCariInp" class="input input-sm" placeholder="Cari nama siswa atau NIS..." value="' +
    escH(__bkRadarFilter.cari) +
    '" oninput="setFilterRadarCariBK(this.value)" />' +
    "</div>" +
    "</div>" +
    '<div id="bkRadarListContainer"></div>';

  renderDaftarRadarBK();
}

function terapkanPeriodeRadarBK() {
  var a = document.getElementById("bkRadarAwalInp");
  var b = document.getElementById("bkRadarAkhirInp");
  if (a && a.value) __bkRadarFilter.awal = a.value;
  if (b && b.value) __bkRadarFilter.akhir = b.value;
  muatPanelGuruBK(true);
}

function setFilterRadarRisikoBK(risiko) {
  __bkRadarFilter.risiko = risiko || "rawan";
  renderSubTabRadarBK();
}

function setFilterRadarKelasBK(kelas) {
  __bkRadarFilter.kelas = kelas || "";
  renderDaftarRadarBK();
}

function setFilterRadarCariBK(cari) {
  __bkRadarFilter.cari = cari || "";
  renderDaftarRadarBK();
}

function renderDaftarRadarBK() {
  var box = document.getElementById("bkRadarListContainer");
  if (!box) return;
  var all = (__bkDashboardCache && __bkDashboardCache.siswa) || [];
  var risiko = __bkRadarFilter.risiko || "rawan";
  var kelas = (__bkRadarFilter.kelas || "").trim();
  var q = (__bkRadarFilter.cari || "").trim().toLowerCase();

  var filtered = all.filter(function (s) {
    if (risiko === "rawan") {
      if (s.levelRisiko === "aman") return false;
    } else if (risiko !== "semua") {
      if (s.levelRisiko !== risiko) return false;
    }
    if (kelas && s.kelas !== kelas) return false;
    if (q) {
      var hay =
        (s.namaLengkap || "").toLowerCase() +
        " " +
        (s.nis || "").toLowerCase() +
        " " +
        (s.kelas || "").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  if (!filtered.length) {
    box.innerHTML =
      '<div class="card" style="padding:28px 18px;text-align:center;">' +
      '<strong style="display:block;font-size:14.5px;color:var(--ink);margin-bottom:4px;">Tidak Ada Siswa pada Kategori Ini</strong>' +
      '<p style="font-size:12.5px;color:var(--slate);margin:0;">Semua siswa pada filter yang dipilih memiliki tingkat kehadiran yang terkendali.</p>' +
      "</div>";
    return;
  }

  var shown = filtered.slice(0, 80);
  box.innerHTML =
    '<div class="guru-bk-result-meta">' +
    "<span>Menampilkan <strong>" +
    shown.length +
    "</strong> dari <strong>" +
    filtered.length +
    "</strong> siswa</span>" +
    "</div>" +
    '<div class="guru-bk-student-list">' +
    shown
      .map(function (s) {
        var rm = __bkRiskMeta(s.levelRisiko);
        var tags = [];
        if (s.yatim) {
          tags.push('<span class="guru-bk-tag is-yatim">Yatim</span>');
        }
        if (s.luar) {
          tags.push('<span class="guru-bk-tag is-luar">Domisili Luar</span>');
        }
        if (s.kepulauan) {
          tags.push(
            '<span class="guru-bk-tag is-pulau">Kepulauan (' +
              escH(s.kecamatan) +
              ")</span>",
          );
        }
        if (s.jumlahCatatanBK > 0) {
          tags.push(
            '<span class="guru-bk-tag is-note">' +
              s.jumlahCatatanBK +
              " Catatan BK</span>",
          );
        }

        return (
          '<article class="card guru-bk-student-card ' +
          rm.cls +
          '">' +
          '<div class="guru-bk-student-top">' +
          '<div class="guru-bk-student-ident">' +
          '<div class="guru-bk-student-badges">' +
          '<span class="guru-bk-kelas-pill">Kelas ' +
          escH(s.kelas || "-") +
          "</span>" +
          '<span class="guru-bk-risk-pill ' +
          rm.cls +
          '">' +
          escH(rm.label) +
          "</span>" +
          "</div>" +
          "<h4>" +
          escH(s.namaLengkap) +
          "</h4>" +
          '<p class="guru-bk-student-sub">NIS: ' +
          escH(s.nis || "-") +
          " &bull; " +
          escH(s.jenisKelamin || "-") +
          (s.desa || s.kecamatan
            ? " &bull; " +
              escH([s.desa, s.kecamatan].filter(Boolean).join(", "))
            : "") +
          "</p>" +
          (tags.length
            ? '<div class="guru-bk-tag-row">' + tags.join("") + "</div>"
            : "") +
          "</div>" +
          "</div>" +
          '<div class="guru-bk-stat-strip">' +
          '<div class="guru-bk-stat-cell is-h"><small>Hadir</small><strong>' +
          (s.hadir || 0) +
          "</strong></div>" +
          '<div class="guru-bk-stat-cell is-t"><small>Telat</small><strong>' +
          (s.telat || 0) +
          "</strong></div>" +
          '<div class="guru-bk-stat-cell is-i"><small>Izin</small><strong>' +
          (s.izin || 0) +
          "</strong></div>" +
          '<div class="guru-bk-stat-cell is-s"><small>Sakit</small><strong>' +
          (s.sakit || 0) +
          "</strong></div>" +
          '<div class="guru-bk-stat-cell is-a"><small>Alfa</small><strong>' +
          (s.alpa || 0) +
          "</strong></div>" +
          '<div class="guru-bk-stat-cell is-pct"><small>Efektif</small><strong>' +
          (s.persenKehadiran != null ? s.persenKehadiran : 100) +
          "%</strong></div>" +
          "</div>" +
          '<div class="guru-bk-student-foot">' +
          '<span class="guru-bk-reason-text">' +
          escH(s.alasanRisiko || "Kehadiran baik") +
          "</span>" +
          '<div class="guru-bk-student-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="bukaProfilSiswaBK(' +
          s.id +
          ')">Profil &amp; Ortu</button>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="bukaModalCatatanBK(0, ' +
          s.id +
          ')">+ Pembinaan</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("") +
    "</div>";
}

/* =============================================================
   SUB-TAB 2: DIAGRAM & AGREGASI KEHADIRAN SELURUH KELAS
   ============================================================= */
async function renderSubTabKelasBK() {
  var area = document.getElementById("guruBKContentArea");
  if (!area) return;

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

  area.innerHTML =
    '<div class="card guru-bk-filter-card" style="margin-bottom:14px;">' +
    '<div class="guru-bk-card-head">' +
    "<div>" +
    "<h3>Monitoring &amp; Diagram Kehadiran Kelas</h3>" +
    "<p>Pantau komposisi Hadir, Telat, Izin, Sakit, dan Alfa setiap rombel beserta rincian per siswa.</p>" +
    "</div>" +
    "</div>" +
    '<div class="guru-bk-date-bar">' +
    '<div class="guru-bk-date-field">' +
    "<label>Kelas</label>" +
    '<select id="bkRekapKelasSelect" class="input input-sm">' +
    klOpts +
    "</select>" +
    "</div>" +
    '<div class="guru-bk-date-field">' +
    "<label>Tanggal Awal</label>" +
    '<input type="date" id="bkRekapAwal" class="input input-sm" value="' +
    __bulanAwalISO() +
    '" />' +
    "</div>" +
    '<div class="guru-bk-date-field">' +
    "<label>Tanggal Akhir</label>" +
    '<input type="date" id="bkRekapAkhir" class="input input-sm" value="' +
    __bulanAkhirISO() +
    '" />' +
    "</div>" +
    "</div>" +
    '<div class="guru-bk-action-bar" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
    __btnUtama(
      "Tampilkan Diagram",
      "tampilRekapSiswa('#bkRekapKelasHasil','bkRekapKelasSelect','bkRekapAwal','bkRekapAkhir')",
    ) +
    __btnSekunder(
      "Riwayat Harian",
      "tampilRiwayatHarian('#bkRekapKelasHasil','bkRekapAwal')",
    ) +
    __btnSekunder("Ekspor Excel", "eksporExcelSiswa()") +
    "</div>" +
    "</div>" +
    '<div id="bkRekapKelasHasil"></div>';

  tampilRekapSiswa(
    "#bkRekapKelasHasil",
    "bkRekapKelasSelect",
    "bkRekapAwal",
    "bkRekapAkhir",
  );
}

/* =============================================================
   SUB-TAB 3: DIREKTORI DATA ASUH & ATENSI KHUSUS SISWA
   ============================================================= */
function renderSubTabDirektoriBK() {
  var area = document.getElementById("guruBKContentArea");
  if (!area) return;

  var rk = (__bkDashboardCache && __bkDashboardCache.ringkasan) || {};
  var kelasList = __bkKelasUnik();
  var kelasOpts =
    '<option value="">Semua Kelas</option>' +
    kelasList
      .map(function (k) {
        return (
          '<option value="' +
          escH(k) +
          '"' +
          (__bkDirektoriFilter.kelas === k ? " selected" : "") +
          ">Kelas " +
          escH(k) +
          "</option>"
        );
      })
      .join("");

  var chips = [
    { id: "semua", label: "Semua Siswa (" + (rk.totalSiswa || 0) + ")" },
    { id: "yatim", label: "Anak Yatim (" + (rk.totalYatim || 0) + ")" },
    { id: "luar", label: "Domisili Luar (" + (rk.totalLuar || 0) + ")" },
    {
      id: "kepulauan",
      label: "Asal Kepulauan (" + (rk.totalKepulauan || 0) + ")",
    },
  ];

  area.innerHTML =
    '<div class="card guru-bk-filter-card">' +
    '<div class="guru-bk-card-head">' +
    "<div>" +
    "<h3>Direktori Data Asuh &amp; Atensi Khusus Siswa</h3>" +
    "<p>Data latar belakang keluarga, anak yatim, domisili luar/pondok, dan siswa asal kepulauan.</p>" +
    "</div>" +
    '<button type="button" class="btn btn-outline btn-sm" onclick="eksporExcelDataAsuhBK()">Ekspor Excel</button>' +
    "</div>" +
    '<div class="guru-bk-chip-scroll">' +
    chips
      .map(function (c) {
        return (
          '<button type="button" class="guru-bk-chip ' +
          (__bkDirektoriFilter.atensi === c.id ? "active" : "") +
          '" onclick="setFilterDirektoriAtensiBK(\'' +
          c.id +
          "')\">" +
          escH(c.label) +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="guru-bk-search-row">' +
    '<select id="bkDirektoriKelasSel" class="input input-sm" onchange="setFilterDirektoriKelasBK(this.value)">' +
    kelasOpts +
    "</select>" +
    '<input type="search" id="bkDirektoriCariInp" class="input input-sm" placeholder="Cari nama, NIS, ayah/ibu, desa, kecamatan..." value="' +
    escH(__bkDirektoriFilter.cari) +
    '" oninput="setFilterDirektoriCariBK(this.value)" />' +
    "</div>" +
    "</div>" +
    '<div id="bkDirektoriListContainer"></div>';

  renderDaftarDirektoriBK();
}

function setFilterDirektoriAtensiBK(atensi) {
  __bkDirektoriFilter.atensi = atensi || "semua";
  renderSubTabDirektoriBK();
}

function setFilterDirektoriKelasBK(kelas) {
  __bkDirektoriFilter.kelas = kelas || "";
  renderDaftarDirektoriBK();
}

function setFilterDirektoriCariBK(cari) {
  __bkDirektoriFilter.cari = cari || "";
  renderDaftarDirektoriBK();
}

function __filterSiswaDirektoriBK() {
  var all = (__bkDashboardCache && __bkDashboardCache.siswa) || [];
  var atensi = __bkDirektoriFilter.atensi || "semua";
  var kelas = (__bkDirektoriFilter.kelas || "").trim();
  var q = (__bkDirektoriFilter.cari || "").trim().toLowerCase();

  return all
    .filter(function (s) {
      if (atensi === "yatim" && !s.yatim) return false;
      if (atensi === "luar" && !s.luar) return false;
      if (atensi === "kepulauan" && !s.kepulauan) return false;
      if (kelas && s.kelas !== kelas) return false;
      if (q) {
        var hay = [
          s.namaLengkap,
          s.nis,
          s.nisn,
          s.kelas,
          s.namaAyah,
          s.namaIbu,
          s.pekerjaanAyah,
          s.pekerjaanIbu,
          s.desa,
          s.kecamatan,
          s.kabupaten,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    })
    .slice()
    .sort(function (a, b) {
      return String(a.namaLengkap || "").localeCompare(
        String(b.namaLengkap || ""),
        "id",
      );
    });
}

function renderDaftarDirektoriBK() {
  var box = document.getElementById("bkDirektoriListContainer");
  if (!box) return;
  var filtered = __filterSiswaDirektoriBK();

  if (!filtered.length) {
    box.innerHTML =
      '<div class="card" style="padding:28px 18px;text-align:center;">' +
      '<strong style="display:block;font-size:14.5px;color:var(--ink);margin-bottom:4px;">Data Siswa Tidak Ditemukan</strong>' +
      '<p style="font-size:12.5px;color:var(--slate);margin:0;">Coba ubah filter kategori atensi, kelas, atau kata kunci pencarian.</p>' +
      "</div>";
    return;
  }

  var shown = filtered.slice(0, 80);
  box.innerHTML =
    '<div class="guru-bk-result-meta">' +
    "<span>Menampilkan <strong>" +
    shown.length +
    "</strong> dari <strong>" +
    filtered.length +
    "</strong> siswa</span>" +
    "</div>" +
    '<div class="guru-bk-student-list">' +
    shown
      .map(function (s) {
        var tags = [];
        if (s.yatim) {
          tags.push('<span class="guru-bk-tag is-yatim">Yatim</span>');
        }
        if (s.luar) {
          tags.push('<span class="guru-bk-tag is-luar">Domisili Luar</span>');
        }
        if (s.kepulauan) {
          tags.push(
            '<span class="guru-bk-tag is-pulau">Kepulauan (' +
              escH(s.kecamatan) +
              ")</span>",
          );
        }
        if (s.jumlahCatatanBK > 0) {
          tags.push(
            '<span class="guru-bk-tag is-note">' +
              s.jumlahCatatanBK +
              " Catatan BK</span>",
          );
        }

        var ttl = [s.tempatLahir, s.tanggalLahir].filter(Boolean).join(", ");
        var domisili = [s.desa, s.kecamatan, s.kabupaten]
          .filter(Boolean)
          .join(", ");

        return (
          '<article class="card guru-bk-student-card">' +
          '<div class="guru-bk-student-top">' +
          '<div class="guru-bk-student-ident">' +
          '<div class="guru-bk-student-badges">' +
          '<span class="guru-bk-kelas-pill">Kelas ' +
          escH(s.kelas || "-") +
          "</span>" +
          '<span class="guru-bk-nis-pill">NIS ' +
          escH(s.nis || "-") +
          "</span>" +
          (s.umur
            ? '<span class="guru-bk-nis-pill">' + escH(s.umur) + " thn</span>"
            : "") +
          "</div>" +
          "<h4>" +
          escH(s.namaLengkap) +
          "</h4>" +
          '<p class="guru-bk-student-sub">' +
          escH(s.jenisKelamin || "-") +
          (ttl ? " &bull; TTL: " + escH(ttl) : "") +
          (s.anakKe ? " &bull; Anak ke-" + escH(s.anakKe) : "") +
          "</p>" +
          (tags.length
            ? '<div class="guru-bk-tag-row">' + tags.join("") + "</div>"
            : "") +
          "</div>" +
          "</div>" +
          '<div class="guru-bk-family-box">' +
          '<div class="guru-bk-family-row">' +
          "<span>Ayah:</span>" +
          "<strong>" +
          escH(s.namaAyah || "-") +
          (s.pekerjaanAyah ? " (" + escH(s.pekerjaanAyah) + ")" : "") +
          "</strong>" +
          "</div>" +
          '<div class="guru-bk-family-row">' +
          "<span>Ibu:</span>" +
          "<strong>" +
          escH(s.namaIbu || "-") +
          (s.pekerjaanIbu ? " (" + escH(s.pekerjaanIbu) + ")" : "") +
          "</strong>" +
          "</div>" +
          '<div class="guru-bk-family-row">' +
          "<span>Domisili:</span>" +
          "<strong>" +
          escH(domisili || s.alamat || "-") +
          (s.rt ? " · " + escH(s.rt) : "") +
          "</strong>" +
          "</div>" +
          "</div>" +
          '<div class="guru-bk-student-foot">' +
          '<span class="guru-bk-reason-text">Hadir: <strong>' +
          (s.hadir || 0) +
          "</strong> · Alfa: <strong>" +
          (s.alpa || 0) +
          "</strong> · Telat: <strong>" +
          (s.telat || 0) +
          "</strong></span>" +
          '<div class="guru-bk-student-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="bukaProfilSiswaBK(' +
          s.id +
          ')">Detail Lengkap</button>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="bukaModalCatatanBK(0, ' +
          s.id +
          ')">+ Bimbingan</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("") +
    "</div>";
}

function eksporExcelDataAsuhBK() {
  var rowsData = __filterSiswaDirektoriBK();
  if (!rowsData.length) {
    showToast("Tidak ada data siswa untuk diekspor", "error");
    return;
  }
  var kolom = [
    "No",
    "Kelas",
    "NIS",
    "NISN",
    "Nama Lengkap",
    "L/P",
    "Tempat, Tgl Lahir",
    "Umur",
    "Anak Ke",
    "Status Yatim",
    "Domisili Luar",
    "Nama Ayah",
    "Pekerjaan Ayah",
    "Nama Ibu",
    "Pekerjaan Ibu",
    "Desa",
    "Kecamatan",
    "Hadir",
    "Alfa",
    "Telat",
  ];
  var baris = rowsData.map(function (s, idx) {
    return [
      idx + 1,
      s.kelas || "-",
      s.nis || "",
      s.nisn || "",
      s.namaLengkap || "",
      s.jenisKelamin === "Perempuan" ? "P" : "L",
      [s.tempatLahir, s.tanggalLahir].filter(Boolean).join(", "),
      s.umur || "",
      s.anakKe || "",
      s.yatim ? "YATIM" : "Tidak",
      s.luar ? "LUAR" : "Reguler",
      s.namaAyah || "",
      s.pekerjaanAyah || "",
      s.namaIbu || "",
      s.pekerjaanIbu || "",
      s.desa || "",
      s.kecamatan || "",
      s.hadir || 0,
      s.alpa || 0,
      s.telat || 0,
    ];
  });
  __eksLapXLS(
    "Data Asuh & Pemetaan Kerawanan Siswa (BK)",
    "Kategori Filter: " + (__bkDirektoriFilter.atensi || "Semua").toUpperCase(),
    kolom,
    baris,
    "data-asuh-bk-siswa.xlsx",
    [5, 8, 10, 13, 26, 6, 20, 6, 8, 12, 12, 20, 16, 20, 16, 16, 16, 8, 8, 8],
  );
}

/* =============================================================
   SUB-TAB 4: JURNAL LAYANAN BIMBINGAN & KONSELING (CATATAN BK)
   ============================================================= */
async function renderSubTabJurnalBK() {
  var area = document.getElementById("guruBKContentArea");
  if (!area) return;

  var katOpts =
    '<option value="">Semua Kategori</option>' +
    BK_KATEGORI_LIST.map(function (k) {
      return (
        '<option value="' +
        escH(k) +
        '"' +
        (__bkJurnalFilter.kategori === k ? " selected" : "") +
        ">" +
        escH(k) +
        "</option>"
      );
    }).join("");

  var stOpts =
    '<option value="">Semua Status</option>' +
    BK_STATUS_LIST.map(function (st) {
      return (
        '<option value="' +
        escH(st) +
        '"' +
        (__bkJurnalFilter.status === st ? " selected" : "") +
        ">" +
        escH(st) +
        "</option>"
      );
    }).join("");

  area.innerHTML =
    '<div class="card guru-bk-filter-card">' +
    '<div class="guru-bk-card-head">' +
    "<div>" +
    "<h3>Jurnal Layanan Bimbingan &amp; Konseling</h3>" +
    "<p>Rekam jejak pembinaan kedisiplinan, konseling siswa, panggilan orang tua, dan home visit.</p>" +
    "</div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<button type="button" class="btn btn-outline btn-sm" onclick="eksporExcelJurnalBK()">Ekspor Excel</button>' +
    '<button type="button" class="btn btn-primary btn-sm" onclick="bukaModalCatatanBK(0, 0)">+ Catat Bimbingan</button>' +
    "</div>" +
    "</div>" +
    '<div class="guru-bk-search-row">' +
    '<select id="bkJurnalStatusSel" class="input input-sm" onchange="setFilterJurnalBK()">' +
    stOpts +
    "</select>" +
    '<select id="bkJurnalKategoriSel" class="input input-sm" onchange="setFilterJurnalBK()">' +
    katOpts +
    "</select>" +
    '<input type="search" id="bkJurnalCariInp" class="input input-sm" placeholder="Cari siswa / isi catatan..." value="' +
    escH(__bkJurnalFilter.cari) +
    '" oninput="setFilterJurnalBK()" />' +
    "</div>" +
    "</div>" +
    '<div id="bkJurnalListContainer">' +
    __spinner() +
    "</div>";

  await muatDaftarJurnalBK();
}

function setFilterJurnalBK() {
  var st = document.getElementById("bkJurnalStatusSel");
  var kt = document.getElementById("bkJurnalKategoriSel");
  var cr = document.getElementById("bkJurnalCariInp");
  __bkJurnalFilter.status = (st && st.value) || "";
  __bkJurnalFilter.kategori = (kt && kt.value) || "";
  __bkJurnalFilter.cari = (cr && cr.value) || "";
  renderDaftarJurnalBK();
}

async function muatDaftarJurnalBK() {
  try {
    var res = await runServer("getCatatanBK", currentUser.username, {});
    if (res && res.success) {
      __bkCatatanListCache = res.data || [];
    }
  } catch (e) {}
  renderDaftarJurnalBK();
}

function __filterCatatanJurnalBK() {
  var all = __bkCatatanListCache || [];
  var st = (__bkJurnalFilter.status || "").toLowerCase();
  var kt = (__bkJurnalFilter.kategori || "").toLowerCase();
  var q = (__bkJurnalFilter.cari || "").trim().toLowerCase();

  return all.filter(function (c) {
    if (st && String(c.status || "").toLowerCase() !== st) return false;
    if (kt && String(c.kategori || "").toLowerCase() !== kt) return false;
    if (q) {
      var hay = [
        c.namaSiswa,
        c.nis,
        c.kelas,
        c.kategori,
        c.catatan,
        c.tindakLanjut,
        c.guruBkNama,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function renderDaftarJurnalBK() {
  var box = document.getElementById("bkJurnalListContainer");
  if (!box) return;
  var list = __filterCatatanJurnalBK();

  if (!list.length) {
    box.innerHTML =
      '<div class="card" style="padding:32px 18px;text-align:center;">' +
      '<strong style="display:block;font-size:14.5px;color:var(--ink);margin-bottom:6px;">Belum Ada Catatan Bimbingan BK</strong>' +
      '<p style="font-size:12.5px;color:var(--slate);margin:0 0 14px;">Catat layanan konseling, pembinaan siswa rawan presensi, panggilan orang tua, atau home visit.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="bukaModalCatatanBK(0, 0)">+ Buat Catatan Pertama</button>' +
      "</div>";
    return;
  }

  box.innerHTML =
    '<div class="guru-bk-result-meta">' +
    "<span>Total <strong>" +
    list.length +
    "</strong> catatan layanan bimbingan</span>" +
    "</div>" +
    '<div class="guru-bk-journal-list">' +
    list
      .map(function (c) {
        var sm = __bkStatusMeta(c.status);
        return (
          '<article class="card guru-bk-journal-card">' +
          '<div class="guru-bk-journal-top">' +
          '<div class="guru-bk-journal-badges">' +
          '<span class="guru-bk-kelas-pill">Kelas ' +
          escH(c.kelas || "-") +
          "</span>" +
          '<span class="guru-bk-kat-pill">' +
          escH(c.kategori || "Bimbingan") +
          "</span>" +
          '<span class="guru-bk-status-pill ' +
          sm.cls +
          '">' +
          escH(sm.label) +
          "</span>" +
          "</div>" +
          '<time class="guru-bk-journal-date">' +
          escH(c.tanggal || "-") +
          "</time>" +
          "</div>" +
          '<div class="guru-bk-journal-student" onclick="bukaProfilSiswaBK(' +
          c.siswaId +
          ')">' +
          "<h4>" +
          escH(c.namaSiswa) +
          "</h4>" +
          "<span>NIS: " +
          escH(c.nis || "-") +
          (c.yatim ? " · Yatim" : "") +
          (c.mark === "LUAR" ? " · Domisili Luar" : "") +
          "</span>" +
          "</div>" +
          '<div class="guru-bk-journal-body">' +
          '<div class="guru-bk-journal-field">' +
          "<small>Permasalahan / Uraian Konseling:</small>" +
          "<p>" +
          escH(c.catatan || "-") +
          "</p>" +
          "</div>" +
          (c.tindakLanjut
            ? '<div class="guru-bk-journal-field is-followup">' +
              "<small>Tindak Lanjut / Kesepakatan:</small>" +
              "<p>" +
              escH(c.tindakLanjut) +
              "</p>" +
              "</div>"
            : "") +
          "</div>" +
          '<div class="guru-bk-journal-foot">' +
          '<span class="guru-bk-journal-author">Oleh: <strong>' +
          escH(c.guruBkNama || c.guruBkUsername || "Guru BK") +
          "</strong></span>" +
          '<div class="guru-bk-journal-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="bukaModalCatatanBK(' +
          c.id +
          ')">Edit</button>' +
          '<button type="button" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#e11d48;border:1px solid rgba(239,68,68,0.25);" onclick="hapusCatatanBKKlik(' +
          c.id +
          ')">Hapus</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("") +
    "</div>";
}

function eksporExcelJurnalBK() {
  var list = __filterCatatanJurnalBK();
  if (!list.length) {
    showToast("Belum ada catatan jurnal BK untuk diekspor", "error");
    return;
  }
  var kolom = [
    "No",
    "Tanggal",
    "Kelas",
    "NIS",
    "Nama Siswa",
    "Kategori Layanan",
    "Uraian Konseling / Permasalahan",
    "Tindak Lanjut",
    "Status",
    "Guru BK",
  ];
  var baris = list.map(function (c, i) {
    return [
      i + 1,
      c.tanggal || "",
      c.kelas || "",
      c.nis || "",
      c.namaSiswa || "",
      c.kategori || "",
      c.catatan || "",
      c.tindakLanjut || "",
      c.status || "",
      c.guruBkNama || "",
    ];
  });
  __eksLapXLS(
    "Jurnal Layanan Bimbingan & Konseling (BK)",
    "MA AL KARIMIYAH",
    kolom,
    baris,
    "jurnal-bimbingan-bk.xlsx",
    [5, 13, 9, 12, 24, 24, 38, 32, 15, 22],
  );
}

/* =============================================================
   MODAL PROFIL LENGKAP SISWA & RIWAYAT KONSELING BK
   ============================================================= */
async function bukaProfilSiswaBK(siswaId) {
  var s = __bkCariSiswaById(siswaId);
  if (!s) {
    showToast("Data siswa belum termuat", "error");
    return;
  }
  var rm = __bkRiskMeta(s.levelRisiko);
  var ttl = [s.tempatLahir, s.tanggalLahir].filter(Boolean).join(", ");
  var domisili = [s.desa, s.kecamatan, s.kabupaten].filter(Boolean).join(", ");

  var catatanSiswa = (__bkCatatanListCache || []).filter(function (c) {
    return Number(c.siswaId) === Number(s.id);
  });

  var badges = [];
  badges.push(
    '<span class="guru-bk-kelas-pill">Kelas ' + escH(s.kelas || "-") + "</span>",
  );
  badges.push(
    '<span class="guru-bk-risk-pill ' + rm.cls + '">' + escH(rm.label) + "</span>",
  );
  if (s.yatim) badges.push('<span class="guru-bk-tag is-yatim">Anak Yatim</span>');
  if (s.luar)
    badges.push('<span class="guru-bk-tag is-luar">Domisili Luar</span>');
  if (s.kepulauan)
    badges.push('<span class="guru-bk-tag is-pulau">Asal Kepulauan</span>');

  var pctEfektif = s.persenKehadiran != null ? Number(s.persenKehadiran) : 100;
  if (isNaN(pctEfektif)) pctEfektif = 100;
  var totalCatat =
    (Number(s.hadir) || 0) +
    (Number(s.telat) || 0) +
    (Number(s.izin) || 0) +
    (Number(s.sakit) || 0) +
    (Number(s.alpa) || 0);
  var barCls =
    pctEfektif >= 85 ? "is-good" : pctEfektif >= 70 ? "is-warn" : "is-danger";

  var html =
    '<div class="guru-bk-modal-profile">' +
    '<div class="guru-bk-modal-head-box">' +
    '<div class="guru-bk-tag-row" style="margin-bottom:6px;">' +
    badges.join("") +
    "</div>" +
    '<h3 style="margin:0 0 4px;font-size:17px;color:var(--ink);">' +
    escH(s.namaLengkap) +
    "</h3>" +
    '<p style="margin:0;font-size:12.5px;color:var(--slate);">NIS: <strong>' +
    escH(s.nis || "-") +
    "</strong> &bull; NISN: <strong>" +
    escH(s.nisn || "-") +
    "</strong> &bull; " +
    escH(s.jenisKelamin || "-") +
    "</p>" +
    "</div>" +
    '<div class="guru-bk-modal-att-card">' +
    '<div class="guru-bk-modal-att-head">' +
    '<div class="guru-bk-modal-att-title">' +
    "<span>Ringkasan Presensi Siswa</span>" +
    "<small>" +
    totalCatat +
    " hari tercatat pada periode pantauan</small>" +
    "</div>" +
    '<div class="guru-bk-modal-att-badge ' +
    barCls +
    '">' +
    "<small>Efektif</small><strong>" +
    pctEfektif +
    "%</strong>" +
    "</div>" +
    "</div>" +
    '<div class="guru-bk-modal-att-bar-track">' +
    '<div class="guru-bk-modal-att-bar-fill ' +
    barCls +
    '" style="width:' +
    Math.max(0, Math.min(100, pctEfektif)) +
    '%"></div>' +
    "</div>" +
    '<div class="guru-bk-stat-strip is-enhanced">' +
    '<div class="guru-bk-stat-cell is-h"><span class="guru-bk-stat-dot"></span><small>Hadir</small><strong>' +
    (s.hadir || 0) +
    "</strong></div>" +
    '<div class="guru-bk-stat-cell is-t"><span class="guru-bk-stat-dot"></span><small>Telat</small><strong>' +
    (s.telat || 0) +
    "</strong></div>" +
    '<div class="guru-bk-stat-cell is-i"><span class="guru-bk-stat-dot"></span><small>Izin</small><strong>' +
    (s.izin || 0) +
    "</strong></div>" +
    '<div class="guru-bk-stat-cell is-s"><span class="guru-bk-stat-dot"></span><small>Sakit</small><strong>' +
    (s.sakit || 0) +
    "</strong></div>" +
    '<div class="guru-bk-stat-cell is-a"><span class="guru-bk-stat-dot"></span><small>Alfa</small><strong>' +
    (s.alpa || 0) +
    "</strong></div>" +
    '<div class="guru-bk-stat-cell is-pct"><span class="guru-bk-stat-dot"></span><small>Efektif</small><strong>' +
    pctEfektif +
    "%</strong></div>" +
    "</div>" +
    "</div>" +
    '<div class="guru-bk-profile-grid">' +
    '<div class="guru-bk-profile-item"><span>Tempat, Tgl Lahir</span><strong>' +
    escH(ttl || "-") +
    "</strong></div>" +
    '<div class="guru-bk-profile-item"><span>Umur / Anak Ke</span><strong>' +
    escH((s.umur ? s.umur + " Tahun" : "-") + (s.anakKe ? " · Anak ke-" + s.anakKe : "")) +
    "</strong></div>" +
    '<div class="guru-bk-profile-item"><span>Nama Ayah</span><strong>' +
    escH(s.namaAyah || "-") +
    "</strong></div>" +
    '<div class="guru-bk-profile-item"><span>Pekerjaan Ayah</span><strong>' +
    escH(s.pekerjaanAyah || "-") +
    "</strong></div>" +
    '<div class="guru-bk-profile-item"><span>Nama Ibu</span><strong>' +
    escH(s.namaIbu || "-") +
    "</strong></div>" +
    '<div class="guru-bk-profile-item"><span>Pekerjaan Ibu</span><strong>' +
    escH(s.pekerjaanIbu || "-") +
    "</strong></div>" +
    '<div class="guru-bk-profile-item is-full"><span>Alamat &amp; Domisili</span><strong>' +
    escH(domisili || s.alamat || "-") +
    (s.rt ? " (" + escH(s.rt) + ")" : "") +
    "</strong></div>" +
    (s.noHpOrtu
      ? '<div class="guru-bk-profile-item is-full"><span>No. HP Orang Tua / Wali</span><strong>' +
        escH(s.noHpOrtu) +
        "</strong></div>"
      : "") +
    "</div>" +
    '<div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
    '<h4 style="margin:0;font-size:14px;color:var(--ink);">Riwayat Bimbingan BK (' +
    catatanSiswa.length +
    ")</h4>" +
    '<button type="button" class="btn btn-primary btn-sm" onclick="__modalClose();bukaModalCatatanBK(0, ' +
    s.id +
    ')">+ Tambah Catatan BK</button>' +
    "</div>" +
    '<div style="margin-top:8px;">' +
    (catatanSiswa.length
      ? catatanSiswa
          .map(function (c) {
            var sm = __bkStatusMeta(c.status);
            return (
              '<div class="guru-bk-mini-note">' +
              '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">' +
              "<strong>" +
              escH(c.kategori) +
              "</strong>" +
              '<span class="guru-bk-status-pill ' +
              sm.cls +
              '">' +
              escH(sm.label) +
              " · " +
              escH(c.tanggal) +
              "</span>" +
              "</div>" +
              '<p style="margin:0 0 4px;font-size:12.5px;color:var(--ink);">' +
              escH(c.catatan) +
              "</p>" +
              (c.tindakLanjut
                ? '<p style="margin:0;font-size:12px;color:var(--slate);">Tindak lanjut: ' +
                  escH(c.tindakLanjut) +
                  "</p>"
                : "") +
              "</div>"
            );
          })
          .join("")
      : '<p style="font-size:12.5px;color:var(--slate);margin:6px 0 0;">Belum ada riwayat catatan bimbingan untuk siswa ini.</p>') +
    "</div>" +
    "</div>";

  __modalOpen("Profil & Data Asuh Siswa", html);
}

/* =============================================================
   MODAL TAMBAH / EDIT CATATAN BIMBINGAN BK
   ============================================================= */
function bukaModalCatatanBK(catatanId, presetSiswaId) {
  var existing = null;
  if (catatanId && Number(catatanId) > 0) {
    existing = (__bkCatatanListCache || []).find(function (c) {
      return Number(c.id) === Number(catatanId);
    });
  }

  var selectedSiswaId = existing
    ? Number(existing.siswaId)
    : Number(presetSiswaId) || 0;
  var selectedSiswa = selectedSiswaId
    ? __bkCariSiswaById(selectedSiswaId)
    : null;

  var allSiswa = ((__bkDashboardCache && __bkDashboardCache.siswa) || [])
    .slice()
    .sort(function (a, b) {
      if ((a.kelas || "") !== (b.kelas || "")) {
        return String(a.kelas || "").localeCompare(String(b.kelas || ""));
      }
      return String(a.namaLengkap || "").localeCompare(
        String(b.namaLengkap || ""),
      );
    });

  var siswaOpts =
    '<option value="">-- Pilih Siswa --</option>' +
    allSiswa
      .map(function (s) {
        var sel = Number(s.id) === selectedSiswaId ? " selected" : "";
        return (
          '<option value="' +
          s.id +
          '" data-kelas="' +
          escH(s.kelas || "-") +
          '"' +
          sel +
          ">[" +
          escH(s.kelas || "-") +
          "] " +
          escH(s.namaLengkap) +
          " (" +
          escH(s.nis) +
          ")</option>"
        );
      })
      .join("");

  var tglVal =
    existing && existing.tanggalISO ? existing.tanggalISO : __tglTodayISO();
  var katVal =
    (existing && existing.kategori) ||
    (selectedSiswa && (selectedSiswa.alpa || 0) >= 3
      ? "Kedisiplinan / Alfa"
      : selectedSiswa && selectedSiswa.yatim
        ? "Pendampingan Siswa Yatim / Atensi"
        : BK_KATEGORI_LIST[0]);
  var stVal = (existing && existing.status) || "Dipantau";
  var catatanVal = (existing && existing.catatan) || "";
  var tindakVal = (existing && existing.tindakLanjut) || "";

  var katOpts = BK_KATEGORI_LIST.map(function (k) {
    return (
      '<option value="' +
      escH(k) +
      '"' +
      (k === katVal ? " selected" : "") +
      ">" +
      escH(k) +
      "</option>"
    );
  }).join("");

  var stOpts = BK_STATUS_LIST.map(function (st) {
    return (
      '<option value="' +
      escH(st) +
      '"' +
      (st === stVal ? " selected" : "") +
      ">" +
      escH(st) +
      "</option>"
    );
  }).join("");

  var html =
    '<form id="formCatatanBK" onsubmit="simpanFormCatatanBK(event)" style="display:flex;flex-direction:column;gap:12px;">' +
    '<input type="hidden" id="bkFormId" value="' +
    (existing ? existing.id : 0) +
    '" />' +
    "<div>" +
    __label("Cari & Pilih Siswa") +
    '<input type="search" id="bkFormFilterSiswa" class="input input-sm" placeholder="Ketik nama atau kelas untuk menyaring daftar siswa..." oninput="filterDropdownSiswaBK(this.value)" style="margin-bottom:6px;" />' +
    '<select id="bkFormSiswaId" class="input" required>' +
    siswaOpts +
    "</select>" +
    "</div>" +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
    "<div>" +
    __label("Tanggal Layanan") +
    '<input type="date" id="bkFormTanggal" class="input" value="' +
    escH(tglVal) +
    '" required />' +
    "</div>" +
    "<div>" +
    __label("Status Penanganan") +
    '<select id="bkFormStatus" class="input">' +
    stOpts +
    "</select>" +
    "</div>" +
    "</div>" +
    "<div>" +
    __label("Kategori Layanan BK") +
    '<select id="bkFormKategori" class="input">' +
    katOpts +
    "</select>" +
    "</div>" +
    "<div>" +
    __label("Uraian Permasalahan / Hasil Konseling") +
    '<textarea id="bkFormCatatan" class="input" rows="3" placeholder="Tuliskan temuan presensi, hasil wawancara konseling, atau kondisi siswa..." required>' +
    escH(catatanVal) +
    "</textarea>" +
    "</div>" +
    "<div>" +
    __label("Tindak Lanjut / Kesepakatan (Opsional)") +
    '<textarea id="bkFormTindakLanjut" class="input" rows="2" placeholder="Contoh: Teguran lisan, pemanggilan wali murid, kunjungan rumah (home visit)...">' +
    escH(tindakVal) +
    "</textarea>" +
    "</div>" +
    '<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:6px;border-top:1px solid var(--line);">' +
    '<button type="button" class="btn btn-outline" onclick="__modalClose()">Batal</button>' +
    '<button type="submit" class="btn btn-primary">Simpan Catatan BK</button>' +
    "</div>" +
    "</form>";

  __modalOpen(
    existing ? "Edit Catatan Bimbingan BK" : "Catat Layanan Bimbingan BK",
    html,
  );
}

function filterDropdownSiswaBK(q) {
  var sel = document.getElementById("bkFormSiswaId");
  if (!sel) return;
  var currentVal = Number(sel.value) || 0;
  var kw = String(q || "")
    .trim()
    .toLowerCase();
  var allSiswa = ((__bkDashboardCache && __bkDashboardCache.siswa) || [])
    .filter(function (s) {
      if (!kw) return true;
      var hay =
        (s.namaLengkap || "").toLowerCase() +
        " " +
        (s.kelas || "").toLowerCase() +
        " " +
        (s.nis || "").toLowerCase();
      return hay.indexOf(kw) !== -1 || Number(s.id) === currentVal;
    })
    .slice(0, 150);

  sel.innerHTML =
    '<option value="">-- Pilih Siswa (' +
    allSiswa.length +
    " cocok) --</option>" +
    allSiswa
      .map(function (s) {
        var isSel = Number(s.id) === currentVal ? " selected" : "";
        return (
          '<option value="' +
          s.id +
          '" data-kelas="' +
          escH(s.kelas || "-") +
          '"' +
          isSel +
          ">[" +
          escH(s.kelas || "-") +
          "] " +
          escH(s.namaLengkap) +
          " (" +
          escH(s.nis) +
          ")</option>"
        );
      })
      .join("");
}

async function simpanFormCatatanBK(e) {
  if (e && e.preventDefault) e.preventDefault();
  var id = Number((document.getElementById("bkFormId") || {}).value) || 0;
  var siswaSel = document.getElementById("bkFormSiswaId");
  var siswaId = Number(siswaSel && siswaSel.value) || 0;
  if (!siswaId) {
    showToast("Pilih siswa terlebih dahulu", "error");
    return;
  }
  var siswaObj = __bkCariSiswaById(siswaId);
  var kelas = (siswaObj && siswaObj.kelas) || "-";
  var tglISO = (document.getElementById("bkFormTanggal") || {}).value || "";
  var kategori = (document.getElementById("bkFormKategori") || {}).value || "";
  var status = (document.getElementById("bkFormStatus") || {}).value || "Dipantau";
  var catatan = (
    (document.getElementById("bkFormCatatan") || {}).value || ""
  ).trim();
  var tindakLanjut = (
    (document.getElementById("bkFormTindakLanjut") || {}).value || ""
  ).trim();

  if (!catatan) {
    showToast("Uraian konseling wajib diisi", "error");
    return;
  }

  showLoading("Menyimpan catatan BK...");
  try {
    var res = await runServer("simpanCatatanBK", {
      id: id,
      siswaId: siswaId,
      kelas: kelas,
      tanggal: __tglIndo(tglISO),
      kategori: kategori,
      status: status,
      catatan: catatan,
      tindakLanjut: tindakLanjut,
    });
    hideLoading();
    if (!res || !res.success) {
      showToast((res && res.message) || "Gagal menyimpan catatan BK", "error");
      return;
    }
    showToast(res.message || "Catatan BK tersimpan", "success");
    __modalClose();
    luapkanMuatan("g-bk");
    await muatPanelGuruBK(true);
    void muatRingkasanBerandaBK();
  } catch (err) {
    hideLoading();
    showToast(err.message || "Gagal menyimpan catatan BK", "error");
  }
}

function hapusCatatanBKKlik(id) {
  showConfirmModal(
    "Hapus Catatan BK",
    "Yakin ingin menghapus catatan layanan bimbingan ini?",
    "Hapus",
    async function () {
      showLoading("Menghapus catatan...");
      try {
        var res = await runServer("hapusCatatanBK", currentUser.username, id);
        hideLoading();
        if (!res || !res.success) {
          showToast((res && res.message) || "Gagal menghapus catatan", "error");
          return;
        }
        showToast(res.message || "Catatan dihapus", "success");
        luapkanMuatan("g-bk");
        await muatPanelGuruBK(true);
        void muatRingkasanBerandaBK();
      } catch (err) {
        hideLoading();
        showToast(err.message || "Gagal menghapus catatan", "error");
      }
    },
    "danger",
  );
}
