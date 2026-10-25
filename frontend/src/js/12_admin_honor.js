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
