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
