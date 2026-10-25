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
