/* =============================================================
   KEPALA — PERSETUJUAN IZIN & MONITORING (alur revisi)
   ============================================================= */
async function muatIzinApproval() {
  const list = document.getElementById("izinApprovalList");
  const kosong = document.getElementById("izinApprovalKosong");
  if (!list) return;
  list.innerHTML = '<p class="kbm-empty-text">Memuat pengajuan izin...</p>';
  if (kosong) kosong.classList.add("hidden");
  izinApprovalData = [];
  izinApprovalFilter = "Semua";
  renderIzinApprovalFilters();
  try {
    const res = await runServer("getIzinUntukApproval", currentUser.username);
    if (!res || !res.success) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      showToast(
        res && res.message ? res.message : "Gagal memuat pengajuan",
        "error",
      );
      return;
    }
    const data = res.data || [];
    izinApprovalData = data;
    renderIzinApprovalFilters();
    if (!data.length) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    renderIzinApprovalList();
  } catch (err) {
    list.innerHTML = "";
    if (kosong) kosong.classList.remove("hidden");
    showToast(err.message, "error");
  }
}

function renderIzinApprovalFilters() {
  const filters = document.getElementById("izinApprovalFilters");
  const count = document.getElementById("izinApprovalPendingCount");
  if (count) {
    count.textContent = `${izinApprovalData.length} Tertunda`;
    count.classList.toggle("hidden", !izinApprovalData.length);
  }
  if (!filters) return;
  filters.classList.toggle("hidden", !izinApprovalData.length);
  if (!izinApprovalData.length) {
    filters.innerHTML = "";
    return;
  }

  const counts = new Map();
  izinApprovalData.forEach((item) => {
    const jenis = String(item.jenis || "Lainnya");
    counts.set(jenis, (counts.get(jenis) || 0) + 1);
  });
  const options = [
    ["Semua", izinApprovalData.length],
    ...counts.entries(),
  ];
  filters.innerHTML = options
    .map(
      ([jenis, total]) => `
        <button type="button" class="kepala-approval-filter${jenis === izinApprovalFilter ? " active" : ""}" data-izin-filter="${esc(jenis)}" onclick="filterPengajuanIzin(this.dataset.izinFilter)">
          ${esc(jenis)} <span>${total}</span>
        </button>`,
    )
    .join("");
}

function renderIzinApprovalList() {
  const list = document.getElementById("izinApprovalList");
  const kosong = document.getElementById("izinApprovalKosong");
  const count = document.getElementById("izinApprovalListCount");
  if (!list) return;
  const data =
    izinApprovalFilter === "Semua"
      ? izinApprovalData
      : izinApprovalData.filter(
          (item) => String(item.jenis || "Lainnya") === izinApprovalFilter,
        );
  if (count) {
    count.textContent = `${data.length} pengajuan`;
    count.classList.toggle("hidden", !izinApprovalData.length);
  }
  list.innerHTML = data.map(izinApprovalCard).join("");
  if (kosong) kosong.classList.toggle("hidden", data.length > 0);
}

function filterPengajuanIzin(jenis) {
  izinApprovalFilter = jenis;
  renderIzinApprovalFilters();
  renderIzinApprovalList();
}

function izinApprovalCard(it) {
  const nama = String(it.nama || "?").trim();
  const jenis = String(it.jenis || "Lainnya");
  const periode =
    it.tglMulai === it.tglSelesai
      ? it.tglMulai
      : it.tglMulai + " s/d " + it.tglSelesai;
  const tanggalMulai = parseTanggalIzin(it.tglMulai);
  const tanggalSelesai = parseTanggalIzin(it.tglSelesai);
  const jumlahHari =
    tanggalMulai && tanggalSelesai
      ? Math.round((tanggalSelesai - tanggalMulai) / 86400000) + 1
      : 0;
  const durasi = jumlahHari > 0 ? `${jumlahHari} hari` : "";
  const pengganti = it.namaPengganti
    ? `<div class="kepala-approval-detail-line"><span>Guru pengganti</span><strong>${esc(it.namaPengganti)}</strong>${it.statusPengganti ? `<span class="kepala-approval-substatus">${esc(it.statusPengganti)}</span>` : ""}</div>`
    : "";
  return `<article class="card kepala-approval-card">
      <div class="kepala-approval-card-layout">
        <div class="kepala-approval-card-main">
          <div class="kepala-approval-card-title">
            <span class="kepala-approval-avatar" aria-hidden="true">${esc(nama.slice(0, 2).toUpperCase())}</span>
            <span class="kepala-approval-person"><strong>${esc(nama)}</strong><span class="badge muted kepala-approval-type">${esc(jenis)}</span></span>
          </div>
          <div class="kepala-approval-card-details">
            <div class="kepala-approval-detail-line"><span>Alasan</span><strong>${esc(it.alasan || "Tidak ada keterangan")}</strong></div>
            <div class="kepala-approval-detail-line"><span>Periode</span><strong>${esc(periode)}${durasi ? ` · ${durasi}` : ""}</strong></div>
            ${pengganti}
          </div>
        </div>
        <div class="kepala-approval-actions">
          <button type="button" class="btn btn-outline btn-sm text-danger" onclick="prosesIzinKlik(${it.id},'Tolak')">Tolak</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="prosesIzinKlik(${it.id},'Setujui')">Setujui Izin</button>
        </div>
      </div>
    </article>`;
}

function parseTanggalIzin(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

function prosesIzinKlik(izinId, aksi) {
  const label = aksi === "Setujui" ? "menyetujui" : "menolak";
  showConfirmModal(
    "Konfirmasi",
    "Anda yakin ingin " + label + " pengajuan izin ini?",
    "Ya, Lanjutkan",
    async function () {
      if (cekAksiBerjalan()) return;
      showLoading("Memproses...");
      try {
        const res = await runServer("prosesIzin", currentUser.username, {
          izinId: izinId,
          aksi: aksi,
          catatan: "",
        });
        if (!res || !res.success) {
          showToast(
            res && res.message ? res.message : "Gagal memproses",
            "error",
          );
          return;
        }
        showToast(res.message || "Berhasil", "success");
        muatIzinApproval();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    },
    "primary",
  );
}

async function muatMonitoringIzin() {
  const now = new Date();
  const bEl = document.getElementById("monitoringBulan");
  const tEl = document.getElementById("monitoringTahun");
  if (bEl && !bEl.value) bEl.value = String(now.getMonth() + 1);
  if (tEl && (!tEl.value || tEl.value === ""))
    tEl.value = String(now.getFullYear());
  const tbody = document.getElementById("monitoringIzinTbody");
  const wrap = document.getElementById("monitoringIzinBody");
  const kosong = document.getElementById("monitoringIzinKosong");
  if (!tbody) return;
  const bulan = parseInt(bEl.value, 10) || now.getMonth() + 1;
  const tahun = parseInt(tEl.value, 10) || now.getFullYear();
  try {
    const res = await runServer(
      "getMonitoringIzin",
      currentUser.username,
      bulan,
      tahun,
    );
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal memuat monitoring",
        "error",
      );
      return;
    }
    const data = res.data || [];
    if (!data.length) {
      tbody.innerHTML = "";
      if (wrap) wrap.classList.add("hidden");
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    if (wrap) wrap.classList.remove("hidden");
    if (kosong) kosong.classList.add("hidden");
    tbody.innerHTML = data
      .map(
        (d) => `<tr class="monitoring-izin-row">
        <td data-label="Nama">${esc(d.nama)}</td>
        <td data-label="Jenis"><span class="badge muted">${esc(d.jenis)}</span></td>
        <td data-label="Pengajuan">${esc(d.jumlahPengajuan)}</td>
        <td data-label="Hari">${esc(d.totalHari)} hari</td>
        <td data-label="Periode">${esc(d.periodeMulai)} s/d ${esc(d.periodeSelesai)}</td>
        <td data-label="Pengganti">${esc(d.namaPengganti || "-")}</td>
      </tr>`,
      )
      .join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function muatSesiMengajar() {
  const list = document.getElementById("sesiMengajarList");
  const kosong = document.getElementById("sesiMengajarKosong");
  const input = document.getElementById("sesiTanggal");
  if (!list) return;
  if (input && !input.value)
    input.value = new Date().toISOString().slice(0, 10);
  const iso = input ? input.value : "";
  if (!iso) {
    showToast("Pilih tanggal terlebih dahulu.", "info");
    return;
  }
  const tglIndo = formatTanggalISOtoIndo(iso);
  list.innerHTML = '<p class="kbm-empty-text">Memuat sesi mengajar...</p>';
  if (kosong) kosong.classList.add("hidden");
  try {
    const res = await runServer(
      "getSesiMengajar",
      currentUser.username,
      tglIndo,
    );
    if (!res || !res.success) {
      list.innerHTML = "";
      showToast(
        res && res.message ? res.message : "Gagal memuat sesi",
        "error",
      );
      return;
    }
    const data = res.data || [];
    if (!data.length) {
      list.innerHTML = "";
      if (kosong) kosong.classList.remove("hidden");
      return;
    }
    list.innerHTML = data
      .map((s) => {
        const jam =
          s.jamMulai && s.jamSelesai ? s.jamMulai + " - " + s.jamSelesai : "-";
        const pengajar = s.namaPengganti
          ? esc(s.namaPengajar) +
            " \u2192 <strong>" +
            esc(s.namaPengganti) +
            "</strong>"
          : esc(s.namaPengajar);
        return `<article class="kepala-monitoring-session">
        <div class="kepala-monitoring-session-main">
          <strong>${esc(s.mapel)} \u00b7 Kelas ${esc(s.kelas)}</strong>
          <span>${pengajar}</span>
        </div>
        <div class="kepala-monitoring-session-info">
          <span>Jam ke ${esc(s.jamKe)} \u00b7 ${esc(jam)}</span>
          <span class="kepala-monitoring-session-status"><span class="badge muted">${esc(s.statusSesi || "-")}</span><span>${esc(s.durasiMenit || 0)} menit</span></span>
        </div>
      </article>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}
