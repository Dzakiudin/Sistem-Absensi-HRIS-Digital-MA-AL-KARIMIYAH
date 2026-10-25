/* =============================================================
   ADMIN + KEPALA — DATA ABSENSI (tabel + filter + export)
   ============================================================= */
function renderTabelAbsensi(rows, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const wrap = document.getElementById(tbodyId + "Wrap");
  const empty = document.getElementById(tbodyId + "Empty");
  if (!rows.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td data-label="Foto">${r.fotoUrl ? fotoThumbTag(r.fotoUrl, "table-photo") : "-"}</td>
      <td data-label="Tanggal">${esc(r.tanggal)}</td>
      <td data-label="Jam">${esc(String(r.jam).substring(0, 5))}</td>
      <td data-label="Nama Guru">${esc(r.namaGuru)}</td>
      <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
      <td data-label="Kelas">${r.kelas && r.kelas !== "-" ? esc(r.kelas) : "-"}</td>
      <td data-label="Jam Ke">${r.jamKe && r.jamKe !== "-" ? esc(r.jamKe) : "-"}</td>
      <td data-label="Jenis">${badgeJenis(r.jenisAbsen)}</td>
      <td data-label="Status">
        <div class="status-mini">
          <div class="status-mini-row">
            <span class="status-mini-label">Kehadiran</span>
            <span class="status-mini-value">
              ${badgeStatus(r.statusWaktu)}
            </span>
          </div>

          ${r.guruPengganti ? `
            <div class="status-mini-row">
              <span class="status-mini-label">Digantikan</span>
              <span class="status-mini-value">
                ${esc(r.guruPengganti)}
              </span>
            </div>

            ${labelKonfirmasiPengganti(r.statusKonfirmasiPengganti) ? `
              <div class="status-mini-row">
                <span class="status-mini-label">Konfirmasi</span>
                <span class="status-mini-value">
                  ${labelKonfirmasiPengganti(r.statusKonfirmasiPengganti)}
                </span>
              </div>
            ` : ""}
          ` : ""}
        </div>
      </td>
      <td data-label="Lokasi">${badgeLokasi(r.statusLokasi)}<br><span class="muted-text">${r.jarak} m</span>${r.latitude && r.longitude ? `<a href="${tautanMaps(r.latitude, r.longitude)}" target="_blank" rel="noopener" class="maps-link">${icon("pin")}Peta</a>` : ""}</td>
    </tr>
  `,
    )
    .join("");
}

async function isiFilterGuruDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.loaded) return;
  try {
    if (!daftarGuruCache.length) {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    }
    sel.innerHTML =
      '<option value="">Semua Guru</option>' +
      daftarGuruCache
        .map(
          (g) =>
            `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
        )
        .join("");
    sel.dataset.loaded = "1";
  } catch (err) {
    /* biarkan default */
  }
}

async function muatDataAbsensiAdmin() {
  const mulai = document.getElementById("adminFilterMulai").value;
  const akhir = document.getElementById("adminFilterAkhir").value;
  const guru = document.getElementById("adminFilterGuru").value;
  const status =
    (document.getElementById("adminFilterStatus") || {}).value || "";
  await isiFilterGuruDropdown("adminFilterGuru");
  try {
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      mulai,
      akhir,
      guru || null,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    window.__adminAbsensiCache = res.data || [];
    filterStatusAdmin(status);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatDataAbsensiKepala() {
  const mulai = document.getElementById("kepalaFilterMulai").value;
  const akhir = document.getElementById("kepalaFilterAkhir").value;
  const guru = document.getElementById("kepalaFilterGuru").value;
  const status =
    (document.getElementById("kepalaFilterStatus") || {}).value || "";
  await isiFilterGuruDropdown("kepalaFilterGuru");
  try {
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      mulai,
      akhir,
      guru || null,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    window.__kepalaAbsensiCache = res.data || [];
    filterStatusKepala(status);
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* =============================================================
   ADMIN + KEPALA — REKAP PER GURU
   ============================================================= */
let adminRekapDataCache = [];
let adminRekapModeAktif = null; // {tipe:'bulan', bulan, tahun} atau {tipe:'rentang', dari, sampai}

function renderTabelRekapGuru(prefix, data, cariTerm) {
  const tbody = document.getElementById(prefix + "RekapBody");
  const wrap = document.getElementById(prefix + "RekapBodyWrap");
  const empty = document.getElementById(prefix + "RekapBodyEmpty");
  const kosongCari = document.getElementById(prefix + "RekapCariKosong"); // hanya ada di admin

  if (!data.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    if (kosongCari) kosongCari.classList.add("hidden");
    return;
  }

  const term = (cariTerm || "").trim().toLowerCase();
  const tersaring = term
    ? data.filter((g) => g.namaLengkap.toLowerCase().indexOf(term) !== -1)
    : data;

  if (!tersaring.length) {
    wrap.classList.add("hidden");
    empty.classList.add("hidden");
    if (kosongCari) kosongCari.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");
  if (kosongCari) kosongCari.classList.add("hidden");

  tbody.innerHTML = tersaring
    .map(
      (g) => `
    <tr>
      <td data-label="Nama Guru"><strong>${esc(g.namaLengkap)}</strong></td>
      <td data-label="Jumlah Jam">${g.jumlahJam}</td>
      <td data-label="Hadir">${g.hadir} hari</td>
      <td data-label="Izin">${g.izin}</td>
      <td data-label="Sakit">${g.sakit}</td>
      <td data-label="Cuti">${g.cuti}</td>
      <td data-label="Alpa">${g.alpa > 0 ? `<span class="badge danger">${g.alpa}</span>` : `<span class="badge ok">0</span>`}</td>
      <td data-label="% Kehadiran (Jadwal)">${
        g.persenKehadiranJadwal === null ||
        g.persenKehadiranJadwal === undefined
          ? '<span class="muted-text">Belum ada jadwal</span>'
          : `<span class="badge ${g.persenKehadiranJadwal >= 90 ? "ok" : g.persenKehadiranJadwal >= 75 ? "warn" : "danger"}">${g.persenKehadiranJadwal}%</span> <span class="muted-text" style="font-size:11px;">(${g.hadirSesuaiJadwal}/${g.totalSeharusnyaJadwal})</span>`
      }</td>
      <td data-label="Rincian">${g._aksiHtml}</td>
    </tr>
  `,
    )
    .join("");
}

async function muatRekapGuru(role) {
  const prefix = role === "admin" ? "admin" : "kepala";
  inisialisasiDefaultBulanTahun();
  const bEl = document.getElementById(prefix + "RekapBulan");
  const tEl = document.getElementById(prefix + "RekapTahun");
  const now = new Date();
  const bulan = parseInt(bEl && bEl.value ? bEl.value : now.getMonth() + 1, 10);
  const tahun = parseInt(tEl && tEl.value ? tEl.value : now.getFullYear(), 10);
  try {
    const res = await runServer(
      "getRekapPerGuru",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const data = res.data.map((g) =>
      Object.assign({}, g, {
        _aksiHtml: `<button class="btn btn-outline btn-sm" onclick="bukaRincianRekapGuru('${escJs(g.username)}', ${bulan}, ${tahun})">Rincian</button>`,
      }),
    );
    if (prefix === "admin") {
      adminRekapDataCache = data;
      adminRekapModeAktif = { tipe: "bulan", bulan: bulan, tahun: tahun };
      const periodeEl = document.getElementById("adminRekapPeriodeAktif");
      if (periodeEl)
        periodeEl.textContent =
          "Menampilkan: " + NAMA_BULAN[bulan] + " " + tahun;
      renderTabelRekapGuru(
        "admin",
        data,
        document.getElementById("adminRekapCari").value,
      );
    } else {
      window.__kepalaRekapDataCache = data;
      renderTabelRekapGuru("kepala", data, "");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatRekapGuruRentang() {
  const dariInput = document.getElementById("adminRekapDari").value; // yyyy-MM-dd
  const sampaiInput = document.getElementById("adminRekapSampai").value;
  if (!dariInput || !sampaiInput) {
    showToast("Isi tanggal Dari dan Sampai terlebih dahulu", "error");
    return;
  }
  if (sampaiInput < dariInput) {
    showToast("Tanggal Sampai tidak boleh sebelum tanggal Dari", "error");
    return;
  }
  const formatTgl = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const dari = formatTgl(dariInput);
  const sampai = formatTgl(sampaiInput);
  try {
    const res = await runServer(
      "getRekapPerGuruRentang",
      currentUser.username,
      dari,
      sampai,
    );
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const data = res.data.map((g) =>
      Object.assign({}, g, {
        _aksiHtml: `<button class="btn btn-outline btn-sm" onclick="bukaRincianRekapGuruRentang('${escJs(g.username)}', '${escJs(dari)}', '${escJs(sampai)}')">Rincian</button>`,
      }),
    );
    adminRekapDataCache = data;
    adminRekapModeAktif = { tipe: "rentang", dari: dari, sampai: sampai };
    document.getElementById("adminRekapPeriodeAktif").textContent =
      "Menampilkan: " + dari + " s/d " + sampai;
    renderTabelRekapGuru(
      "admin",
      data,
      document.getElementById("adminRekapCari").value,
    );
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleCariRekapGuru() {
  if (!adminRekapModeAktif) return;
  renderTabelRekapGuru(
    "admin",
    adminRekapDataCache,
    document.getElementById("adminRekapCari").value,
  );
}

function bukaCetakRekapGuru() {
  if (!adminRekapDataCache.length) {
    showToast(
      "Belum ada data untuk dicetak. Tampilkan rekap terlebih dahulu.",
      "error",
    );
    return;
  }
  let periodeLabel = "";
  if (adminRekapModeAktif && adminRekapModeAktif.tipe === "bulan") {
    periodeLabel =
      NAMA_BULAN[adminRekapModeAktif.bulan] + " " + adminRekapModeAktif.tahun;
  } else if (adminRekapModeAktif && adminRekapModeAktif.tipe === "rentang") {
    periodeLabel =
      adminRekapModeAktif.dari + " s/d " + adminRekapModeAktif.sampai;
  }
  document.getElementById("cetakRekapGuruPeriode").textContent =
    "Periode: " + periodeLabel;
  document.getElementById("cetakRekapGuruTtdKepala").textContent =
    (infoSekolahCache && infoSekolahCache.namaKepala) || "";

  // Sengaja pakai adminRekapDataCache (bukan hasil tersaring pencarian nama) supaya
  // laporan resmi ke Kepala Madrasah selalu menampilkan SEMUA guru periode ini.
  document.getElementById("cetakRekapGuruBody").innerHTML = adminRekapDataCache
    .map(
      (g) => `
    <tr>
      <td data-label="Nama Guru"><strong>${esc(g.namaLengkap)}</strong></td>
      <td data-label="Jam">${g.jumlahJam}</td>
      <td data-label="Hadir">${g.hadir}</td>
      <td data-label="Izin">${g.izin}</td>
      <td data-label="Sakit">${g.sakit}</td>
      <td data-label="Cuti">${g.cuti}</td>
      <td data-label="Alpa">${g.alpa}</td>
      <td data-label="% Jadwal">${g.persenKehadiranJadwal === null || g.persenKehadiranJadwal === undefined ? "-" : g.persenKehadiranJadwal + "%"}</td>
    </tr>
  `,
    )
    .join("");

  document.getElementById("cetakRekapGuruModal").classList.remove("hidden");
}

function formatPersenKehadiranJadwal(d) {
  if (
    d.persenKehadiranJadwal === null ||
    d.persenKehadiranJadwal === undefined
  ) {
    return '<span class="muted-text">Belum ada jadwal</span>';
  }
  const badge =
    d.persenKehadiranJadwal >= 90
      ? "ok"
      : d.persenKehadiranJadwal >= 75
        ? "warn"
        : "danger";
  return `<span class="badge ${badge}">${d.persenKehadiranJadwal}%</span> <span class="muted-text" style="font-size:11px;">(${d.hadirSesuaiJadwal}/${d.totalSeharusnyaJadwal})</span>`;
}

async function bukaRincianRekapGuru(username, bulan, tahun) {
  const tbody = document.getElementById("rincianRekapBody");
  const wrap = document.getElementById("rincianRekapWrap");
  const kosong = document.getElementById("rincianRekapKosong");
  document.getElementById("rincianRekapPeriode").textContent = "Memuat...";
  document.getElementById("rincianRekapNamaGuru").textContent = "";
  document.getElementById("rincianRekapMapel").textContent = "";
  document.getElementById("rincianRekapStatus").textContent = "";
  document.getElementById("rincianRekapPersen").innerHTML = "";
  tbody.innerHTML = "";
  wrap.classList.remove("hidden");
  kosong.classList.add("hidden");
  document.getElementById("rincianRekapModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getRincianRekapGuru",
      currentUser.username,
      username,
      bulan,
      tahun,
    );
    if (!res.success) {
      showToast(res.message, "error");
      document.getElementById("rincianRekapPeriode").textContent = res.message;
      return;
    }
    const d = res.data;
    document.getElementById("rincianRekapPeriode").textContent =
      "Periode: " + NAMA_BULAN[bulan] + " " + tahun;
    document.getElementById("rincianRekapNamaGuru").textContent = d.namaLengkap;
    document.getElementById("rincianRekapMapel").textContent = d.mataPelajaran;
    document.getElementById("rincianRekapStatus").textContent =
      d.statusSergu || "Belum diatur";
    document.getElementById("rincianRekapPersen").innerHTML =
      formatPersenKehadiranJadwal(d);
    if (d.rincian.length) {
      wrap.classList.remove("hidden");
      kosong.classList.add("hidden");
      tbody.innerHTML = d.rincian
        .map(
          (r) => `
        <tr>
          <td data-label="Tanggal">${esc(r.tanggal)}</td>
          <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
          <td data-label="Kelas">${esc(r.kelas)}</td>
          <td data-label="Jam Ke">${esc(r.jamKe)}</td>
          <td data-label="Status">${badgeStatus(r.statusWaktu || "")}</td>
          <td data-label="Ket.">${esc(r.keterangan)}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      wrap.classList.add("hidden");
      kosong.classList.remove("hidden");
    }
  } catch (err) {
    showToast(err.message, "error");
    document.getElementById("rincianRekapNamaGuru").textContent =
      "Gagal memuat data.";
  }
}

async function bukaRincianRekapGuruRentang(
  username,
  tanggalMulai,
  tanggalAkhir,
) {
  const tbody = document.getElementById("rincianRekapBody");
  const wrap = document.getElementById("rincianRekapWrap");
  const kosong = document.getElementById("rincianRekapKosong");
  document.getElementById("rincianRekapPeriode").textContent = "Memuat...";
  document.getElementById("rincianRekapNamaGuru").textContent = "";
  document.getElementById("rincianRekapMapel").textContent = "";
  document.getElementById("rincianRekapStatus").textContent = "";
  document.getElementById("rincianRekapPersen").innerHTML = "";
  tbody.innerHTML = "";
  wrap.classList.remove("hidden");
  kosong.classList.add("hidden");
  document.getElementById("rincianRekapModal").classList.remove("hidden");
  try {
    const res = await runServer(
      "getRincianRekapGuruRentang",
      currentUser.username,
      username,
      tanggalMulai,
      tanggalAkhir,
    );
    if (!res.success) {
      showToast(res.message, "error");
      document.getElementById("rincianRekapPeriode").textContent = res.message;
      return;
    }
    const d = res.data;
    document.getElementById("rincianRekapPeriode").textContent =
      "Periode: " + tanggalMulai + " s/d " + tanggalAkhir;
    document.getElementById("rincianRekapNamaGuru").textContent = d.namaLengkap;
    document.getElementById("rincianRekapMapel").textContent = d.mataPelajaran;
    document.getElementById("rincianRekapStatus").textContent =
      d.statusSergu || "Belum diatur";
    document.getElementById("rincianRekapPersen").innerHTML =
      formatPersenKehadiranJadwal(d);
    if (d.rincian.length) {
      wrap.classList.remove("hidden");
      kosong.classList.add("hidden");
      tbody.innerHTML = d.rincian
        .map(
          (r) => `
        <tr>
          <td data-label="Tanggal">${esc(r.tanggal)}</td>
          <td data-label="Mapel">${esc(r.mataPelajaran)}</td>
          <td data-label="Kelas">${esc(r.kelas)}</td>
          <td data-label="Jam Ke">${esc(r.jamKe)}</td>
          <td data-label="Status">${badgeStatus(r.statusWaktu || "")}</td>
          <td data-label="Ket.">${esc(r.keterangan)}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      wrap.classList.add("hidden");
      kosong.classList.remove("hidden");
    }
  } catch (err) {
    showToast(err.message, "error");
    document.getElementById("rincianRekapNamaGuru").textContent =
      "Gagal memuat data.";
  }
}
