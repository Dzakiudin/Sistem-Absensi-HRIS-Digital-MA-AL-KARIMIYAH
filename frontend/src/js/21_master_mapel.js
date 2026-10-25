/* =============================================================
   ADMIN — MASTER DATA MAPEL (CRUD)
   ============================================================= */
var mapelCache = [];
var mapelEditId = null;

async function muatDaftarMapel() {
  const tbody = document.getElementById("mapelBody");
  if (!tbody) return;
  try {
    const res = await runServer("getDaftarMapel", currentUser.username);
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal memuat mapel",
        "error",
      );
      return;
    }
    mapelCache = res.data || [];
    renderTabelMapel();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderTabelMapel() {
  const tbody = document.getElementById("mapelBody");
  const wrap = document.getElementById("mapelBodyWrap");
  const kosong = document.getElementById("mapelBodyKosong");
  if (!tbody) return;
  if (!mapelCache.length) {
    if (wrap) wrap.classList.add("hidden");
    if (kosong) kosong.classList.remove("hidden");
    return;
  }
  if (wrap) wrap.classList.remove("hidden");
  if (kosong) kosong.classList.add("hidden");
  tbody.innerHTML = mapelCache
    .map(
      (m) => `<tr>
      <td data-label="KODE" style="font-family:monospace;">${esc(m.kode || "-")}</td>
      <td data-label="NAMA MAPEL" style="font-weight:600;">${esc(m.nama)}</td>
      <td data-label="KELOMPOK">${esc(m.kelompok || "-")}</td>
      <td data-label="STATUS">${m.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge muted">Nonaktif</span>'}</td>
      <td data-label="Aksi" style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn-outline btn-sm" onclick="bukaModalMapel(${m.id})">Edit</button>
        <button type="button" class="btn btn-outline btn-sm text-danger" onclick="hapusMapelKlik(${m.id})">Hapus</button>
      </td>
    </tr>`,
    )
    .join("");
}

function bukaModalMapel(id) {
  const modal = document.getElementById("mapelModal");
  if (!modal) return;
  mapelEditId = id || null;
  const title = document.getElementById("mapelModalTitle");
  const fKode = document.getElementById("mapelKode");
  const fNama = document.getElementById("mapelNama");
  const fKel = document.getElementById("mapelKelompok");
  const fAktif = document.getElementById("mapelAktif");
  if (id) {
    const m = mapelCache.find((x) => x.id === id) || {};
    title.textContent = "Ubah Mata Pelajaran";
    fKode.value = m.kode || "";
    fNama.value = m.nama || "";
    fKel.value = m.kelompok || "Wajib";
    fAktif.checked = !!m.aktif;
  } else {
    title.textContent = "Tambah Mata Pelajaran";
    fKode.value = "";
    fNama.value = "";
    fKel.value = "Wajib";
    fAktif.checked = true;
  }
  modal.classList.remove("hidden");
}

function tutupModalMapel() {
  const modal = document.getElementById("mapelModal");
  if (modal) modal.classList.add("hidden");
}

async function simpanMapelSubmit(e) {
  if (e) e.preventDefault();
  if (cekAksiBerjalan()) return;
  const payload = {
    id: mapelEditId || 0,
    kode: (document.getElementById("mapelKode").value || "").trim(),
    nama: (document.getElementById("mapelNama").value || "").trim(),
    kelompok: (document.getElementById("mapelKelompok").value || "").trim(),
    aktif: !!document.getElementById("mapelAktif").checked,
  };
  if (!payload.nama) {
    showToast("Nama mapel wajib diisi.", "error");
    return;
  }
  showLoading("Menyimpan...");
  try {
    const res = await runServer("simpanMapel", currentUser.username, payload);
    if (!res || !res.success) {
      showToast(
        res && res.message ? res.message : "Gagal menyimpan mapel",
        "error",
      );
      return;
    }
    showToast(res.message || "Mapel tersimpan", "success");
    tutupModalMapel();
    __masterMapelCache = null;
    luapkanMuatan("masterMapel");
    muatDaftarMapel();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

function hapusMapelKlik(id) {
  const m = mapelCache.find((x) => x.id === id);
  showConfirmModal(
    "Nonaktifkan Mapel",
    'Mapel "' +
      (m ? m.nama : "") +
      '" akan dinonaktifkan. Jadwal lama tetap tersimpan.',
    "Ya, Nonaktifkan",
    async function () {
      if (cekAksiBerjalan()) return;
      showLoading("Memproses...");
      try {
        const res = await runServer("hapusMapel", currentUser.username, {
          id: id,
        });
        if (!res || !res.success) {
          showToast(
            res && res.message ? res.message : "Gagal menonaktifkan mapel",
            "error",
          );
          return;
        }
        showToast(res.message || "Mapel dinonaktifkan", "success");
        __masterMapelCache = null;
        muatDaftarMapel();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    },
  );
}
