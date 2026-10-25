/* =============================================================
   GURU — AJUKAN IZIN / SAKIT / CUTI
   ============================================================= */
async function bukaModalIzin() {
  document.getElementById("izinForm").reset();

  const isStaf = currentUser && currentUser.role === "staf";
  const targetEl = document.getElementById("izinTargetRincian");
  if (targetEl) {
    targetEl.textContent = isStaf
      ? "Izin Tenaga Kependidikan (tanpa jadwal mengajar), berlaku untuk seluruh hari pada rentang."
      : "Izin berlaku untuk seluruh sesi mengajar pada rentang tanggal yang dipilih.";
  }

  const sel = document.getElementById("izinGuruPengganti");
  const group = document.getElementById("izinGuruPenggantiGroup");
  const isBolehPengganti = currentUser && currentUser.izinkanGuruPengganti;

  if (isBolehPengganti) {
    if (group) group.classList.remove("hidden");
    sel.innerHTML = '<option value="">Memuat daftar guru...</option>';
  } else {
    if (group) group.classList.add("hidden");
    sel.innerHTML = '<option value="">- Tidak diizinkan -</option>';
  }

  document.getElementById("izinModal").classList.remove("hidden");
  if (isBolehPengganti) {
    try {
      const res = await runServer(
        "getDaftarGuruUntukPengganti",
        currentUser.username,
      );
      if (!res || !res.success || !Array.isArray(res.data)) {
        throw new Error(
          (res && res.message) || "Gagal memuat daftar guru pengganti",
        );
      }
      sel.innerHTML =
        (res.data.length
          ? '<option value="">- Tidak ada -</option>'
          : '<option value="">- Belum ada guru yang diizinkan -</option>') +
        res.data
          .map(
            (g) =>
              `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
          )
          .join("");
    } catch (err) {
      sel.innerHTML = '<option value="">- Gagal memuat daftar guru -</option>';
      showToast(err.message, "error");
    }
  }
}

async function handleAjukanIzin(e) {
  e.preventDefault();
  const jenis = document.getElementById("izinKategori").value;
  const alasan = document.getElementById("izinKeterangan").value.trim();
  if (!jenis) {
    showToast("Pilih kategori izin terlebih dahulu", "error");
    return;
  }
  const tMulai = document.getElementById("izinTanggalMulai").value;
  const tSelesai = document.getElementById("izinTanggalSelesai").value;
  if (!tMulai || !tSelesai) {
    showToast("Tanggal mulai dan selesai wajib diisi", "error");
    return;
  }
  if (tSelesai < tMulai) {
    showToast("Tanggal selesai tidak boleh sebelum tanggal mulai", "error");
    return;
  }
  const usernamePengganti = document.getElementById("izinGuruPengganti").value;
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer("ajukanIzin", {
      username: currentUser.username,
      jenis: jenis,
      alasan: alasan,
      tglMulai: formatTanggalISOtoIndo(tMulai),
      tglSelesai: formatTanggalISOtoIndo(tSelesai),
      guruPengganti: usernamePengganti || "",
    });
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("izinModal").classList.add("hidden");
      document.getElementById("izinTanggalMulai").value = "";
      document.getElementById("izinTanggalSelesai").value = "";
      if (typeof muatDashboardGuru === "function") muatDashboardGuru();
      if (typeof muatPermintaanPenggantiSaya === "function")
        muatPermintaanPenggantiSaya();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

// Konversi tanggal <input type="date"> (YYYY-MM-DD) ke format DD/MM/YYYY.
function formatTanggalISOtoIndo(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

let permintaanPenggantiCache = [];

async function muatPermintaanPenggantiSaya() {
  const listEl = document.getElementById("permintaanPenggantiSayaList");
  if (!listEl) return;
  try {
    listEl.innerHTML =
      '<p class="muted-text" style="margin:4px 0;">Memuat...</p>';
    const res = await runServer("getIzinSaya", "");
    if (!res.success) {
      listEl.innerHTML = `<p class="muted-text" style="margin:4px 0;">${esc(res.message || "Gagal memuat")}</p>`;
      return;
    }
    permintaanPenggantiCache = res.data || [];
    if (!permintaanPenggantiCache.length) {
      listEl.innerHTML =
        '<p class="muted-text" style="margin:4px 0;">Belum ada pengajuan izin.</p>';
      return;
    }
    let html = "";
    permintaanPenggantiCache.forEach((pr) => {
      const bg =
        pr.status === "Pending"
          ? "#fffbeb"
          : pr.status === "Disetujui"
            ? "#f0fdf4"
            : "#f1f5f9";
      html += `<div style="background:${bg}; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; margin-bottom:6px;">
        <div style="font-weight:600;">${esc(pr.jenis)} · ${esc(pr.tglMulai)} s.d. ${esc(pr.tglSelesai)}</div>
        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Status: <span style="color:#064e3b; font-weight:600;">${esc(pr.status)}</span>${pr.namaPengganti ? " \u00b7 Pengganti: " + esc(pr.namaPengganti) + " (" + esc(pr.statusPengganti || "-") + ")" : ""}</div>
        ${pr.alasan ? `<div style="font-size:11.5px; color:#475569; margin-top:2px;">${esc(pr.alasan)}</div>` : ""}
        ${pr.status === "Pending" ? `<button class="btn btn-outline" style="padding:3px 10px; font-size:11.5px; margin-top:6px;" onclick="batalkanIzinKlik(${pr.id})">Batalkan</button>` : ""}
      </div>`;
    });
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<p class="muted-text" style="margin:4px 0;">${esc(err.message)}</p>`;
  }
}

async function batalkanIzinKlik(izinId) {
  if (!confirm("Batalkan pengajuan izin ini?")) return;
  if (cekAksiBerjalan()) return;
  showLoading("Membatalkan...");
  try {
    const res = await runServer("batalkanIzin", {
      username: currentUser.username,
      izinId: izinId,
    });
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) muatPermintaanPenggantiSaya();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
