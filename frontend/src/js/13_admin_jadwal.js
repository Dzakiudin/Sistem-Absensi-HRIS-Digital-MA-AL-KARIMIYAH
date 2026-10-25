/* =============================================================
   ADMIN — JADWAL PELAJARAN
   ============================================================= */
let jadwalDataCache = [];

async function muatDaftarJadwal() {
  const guruSelect = document.getElementById("jadwalGuru");
  if (!daftarGuruCache.length) {
    try {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    } catch (err) {
      /* biarkan kosong, tombol tambah akan gagal dengan pesan jelas kalau tetap kosong */
    }
  }
  guruSelect.innerHTML =
    '<option value="">- Pilih Guru -</option>' +
    daftarGuruCache
      .map(
        (g) =>
          `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
      )
      .join("");

  try {
    const res = await runServer("getDaftarJadwal", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    jadwalDataCache = res.data;
    renderTabelJadwal();
  } catch (err) {
    showToast(err.message, "error");
  }

  try {
    const { daftarKelas, daftarMapel } = await ambilDaftarMasterKelasDanMapel();
    const jkSel = document.getElementById("jadwalKelas");
    if (jkSel) {
      const curK = jkSel.value;
      jkSel.innerHTML =
        '<option value="">- Pilih Kelas -</option>' +
        daftarKelas
          .map((k) => `<option value="${esc(k)}">${esc(k)}</option>`)
          .join("");
      if (curK && daftarKelas.includes(curK)) jkSel.value = curK;
    }
    const jmSel = document.getElementById("jadwalMapel");
    if (jmSel) {
      const curM = jmSel.value;
      jmSel.innerHTML =
        '<option value="">- Pilih Mapel -</option>' +
        daftarMapel
          .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
          .join("");
      if (curM && daftarMapel.includes(curM)) jmSel.value = curM;
    }
    const fkSel = document.getElementById("jadwalFilterKelas");
    if (fkSel) {
      const curVal = fkSel.value;
      fkSel.innerHTML =
        '<option value="">Semua Kelas</option>' +
        daftarKelas
          .map((k) => `<option value="${esc(k)}">${esc(k)}</option>`)
          .join("");
      if (curVal && daftarKelas.includes(curVal)) fkSel.value = curVal;
      else fkSel.value = "";
    }
    const fmSel = document.getElementById("jadwalFilterMapel");
    if (fmSel) {
      const curVal = fmSel.value;
      fmSel.innerHTML =
        '<option value="">Semua Mapel</option>' +
        daftarMapel
          .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
          .join("");
      if (curVal && daftarMapel.includes(curVal)) fmSel.value = curVal;
      else fmSel.value = "";
    }
  } catch (err) {}
}

let jadwalSortState = buatSortState();
const jadwalSortExtractors = {
  namaGuru: (j) => j.namaGuru.toLowerCase(),
  hari: (j) => {
    const idx = HARI_URUT.indexOf(j.hari);
    return idx === -1 ? 99 : idx;
  },
  mataPelajaran: (j) => j.mataPelajaran.toLowerCase(),
  kelas: (j) => kelasSortKey(j.kelas),
  jamKe: (j) => {
    const idx = JAMKE_URUT.indexOf(j.jamKe);
    return idx === -1 ? 99 : idx;
  },
};

function getFilterJadwalAktif() {
  return {
    term: document.getElementById("jadwalCari").value.trim().toLowerCase(),
    fHari: document.getElementById("jadwalFilterHari").value,
    fKelas: document.getElementById("jadwalFilterKelas").value,
    fMapel: document.getElementById("jadwalFilterMapel").value,
    fJamKe: document.getElementById("jadwalFilterJamKe").value,
  };
}

function getJadwalTersaring(usernameKhusus) {
  const f = getFilterJadwalAktif();
  let tersaring = jadwalDataCache.filter((j) => {
    if (usernameKhusus && j.username !== usernameKhusus) return false;
    if (f.term && String(j.namaGuru).toLowerCase().indexOf(f.term) === -1)
      return false;
    if (f.fHari && j.hari !== f.fHari) return false;
    if (f.fKelas && j.kelas !== f.fKelas) return false;
    if (f.fMapel && j.mataPelajaran !== f.fMapel) return false;
    if (f.fJamKe && j.jamKe !== f.fJamKe) return false;
    return true;
  });
  return terapkanSort(tersaring, jadwalSortState, jadwalSortExtractors);
}

let jadwalEditId = null;

function renderTabelJadwal() {
  const tbody = document.getElementById("jadwalBody");
  const wrap = document.getElementById("jadwalBodyWrap");
  const empty = document.getElementById("jadwalBodyEmpty");
  const tersaring = getJadwalTersaring();

  if (!tersaring.length) {
    wrap.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  empty.classList.add("hidden");

  // Kelompokkan per kelas agar mudah dibaca, tiap kelompok diurutkan hari -> jam ke.
  const perKelas = {};
  tersaring.forEach((j) => {
    const k = j.kelas || "-";
    (perKelas[k] = perKelas[k] || []).push(j);
  });
  const kunciKelas = Object.keys(perKelas).sort((a, b) => {
    const ka = kelasSortKey(a),
      kb = kelasSortKey(b);
    if (ka !== kb) return ka - kb;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });
  const HARI_IDX = {};
  HARI_URUT.forEach((h, i) => {
    HARI_IDX[h] = i;
  });

  tbody.innerHTML = kunciKelas
    .map((k) => {
      const list = perKelas[k].slice().sort((a, b) => {
        const ha = HARI_IDX[a.hari] !== undefined ? HARI_IDX[a.hari] : 99;
        const hb = HARI_IDX[b.hari] !== undefined ? HARI_IDX[b.hari] : 99;
        const _ordRom = {
          I: 1,
          II: 2,
          III: 3,
          IV: 4,
          V: 5,
          VI: 6,
          VII: 7,
          VIII: 8,
        };
        const ja =
          _ordRom[String(a.jamKe).toUpperCase()] || parseInt(a.jamKe, 10) || 99;
        const jb =
          _ordRom[String(b.jamKe).toUpperCase()] || parseInt(b.jamKe, 10) || 99;
        return ja - jb;
      });
      const labelKelas = k;
      const subNama =
        list[0] && list[0].kelasNama && list[0].kelasNama !== k
          ? list[0].kelasNama
          : "";
      return `
      <tr class="jadwal-group-row">
        <td colspan="6">
          <span class="jdw-group-label">Kelas ${esc(labelKelas)}</span>
          ${subNama ? `<span class="jdw-group-nama">${esc(subNama)}</span>` : ""}
          <span class="jdw-group-meta">${list.length} jadwal</span>
        </td>
      </tr>
      ${list
        .map(
          (j) => `
        <tr class="jadwal-card-row">
          <td data-label="Nama Guru" class="jdw-desktop-only"><strong>${esc(j.namaGuru)}</strong></td>
          <td data-label="Hari" class="jdw-desktop-only"><span class="badge ok">${esc(j.hari)}</span></td>
          <td data-label="Mapel" class="jdw-desktop-only">${esc(j.mataPelajaran)}</td>
          <td data-label="Kelas" class="jdw-desktop-only">${esc(j.kelas)}</td>
          <td data-label="Jam Ke" class="jdw-desktop-only"><span class="badge muted">Ke-${esc(j.jamKe)}</span></td>
          <td data-label="Aksi" class="jdw-desktop-only" style="text-align:right;">
            <div class="action-btn-group" style="justify-content:flex-end;">
              <button type="button" class="btn btn-icon" onclick="bukaEditJadwal('${escJs(j.id)}')" title="Edit jadwal" aria-label="Edit jadwal ${esc(j.namaGuru)}">${icon("pencil")}</button>
              <button type="button" class="btn btn-icon text-danger" onclick="hapusJadwalSekarang('${escJs(j.id)}', '${escJs(j.namaGuru)}', '${escJs(j.hari)}')" title="Hapus" aria-label="Hapus jadwal">${icon("x")}</button>
            </div>
          </td>
          <td colspan="6" class="jdw-mobile-only jadwal-card-td">
            <div class="jdw-card">
              <div class="jdw-card-top">
                <div class="jdw-card-badges">
                  <span class="jdw-badge-hari jdw-badge-hari--${(j.hari||'').toLowerCase()}">${esc(j.hari)}</span>
                  <span class="jdw-badge-jam">Jam Ke-${esc(j.jamKe)}</span>
                </div>
                <span class="jdw-badge-kelas">${esc(j.kelasNama || j.kelas)}</span>
              </div>
              <div class="jdw-card-mapel">${esc(j.mataPelajaran)}</div>
              <div class="jdw-card-guru">
                <span class="jdw-avatar">${esc((j.namaGuru||' ').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase().slice(0,2))}</span>
                <span class="jdw-guru-nama">${esc(j.namaGuru)}</span>
              </div>
              <div class="jdw-card-actions">
                <button type="button" class="btn btn-icon" onclick="bukaEditJadwal('${escJs(j.id)}')" title="Edit" aria-label="Edit jadwal">${icon("pencil")}</button>
                <button type="button" class="btn btn-icon text-danger" onclick="hapusJadwalSekarang('${escJs(j.id)}', '${escJs(j.namaGuru)}', '${escJs(j.hari)}')" title="Hapus" aria-label="Hapus jadwal">${icon("x")}</button>
              </div>
            </div>
          </td>
        </tr>
      `,
        )
        .join("")}
    `;
    })
    .join("");
  perbaruiIndikatorSort("jadwalBodyWrap", jadwalSortState);
}

async function handleTambahJadwal(e) {
  e.preventDefault();
  const username = document.getElementById("jadwalGuru").value;
  if (!username) {
    showToast("Pilih guru terlebih dahulu", "error");
    return;
  }
  const mataPelajaran = document.getElementById("jadwalMapel").value.trim();
  const kelas = document.getElementById("jadwalKelas").value.trim();
  if (!mataPelajaran || !kelas) {
    showToast("Mapel dan Kelas wajib diisi", "error");
    return;
  }
  if (cekAksiBerjalan()) return;

  const payload = {
    username: username,
    hari: document.getElementById("jadwalHari").value,
    mataPelajaran: mataPelajaran,
    kelas: kelas,
    jamKe: document.getElementById("jadwalJamKe").value,
  };
  const sedangEdit = !!jadwalEditId;
  if (sedangEdit) payload.id = jadwalEditId;

  showLoading(sedangEdit ? "Menyimpan perubahan..." : "Menyimpan...");
  try {
    const res = await runServer(
      sedangEdit ? "updateJadwal" : "tambahJadwal",
      currentUser.username,
      payload,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      const jf = document.getElementById("jadwalForm");
      if (jf) jf.reset();
      aturJadwalEditMode(false);
      tutupModalJadwal();
      luapkanMuatan("jadwal");
      muatDaftarJadwal();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function aturJadwalEditMode(sedangEdit) {
  jadwalEditId = sedangEdit ? jadwalEditId : null;
  const judul = document.getElementById("jadwalModalTitle");
  if (judul)
    judul.textContent = sedangEdit
      ? "Edit Jadwal Pelajaran"
      : "Tambah Jadwal Pelajaran";
  const btn = document.getElementById("jadwalSubmitBtn");
  if (btn) btn.textContent = sedangEdit ? "Simpan Perubahan" : "Simpan Jadwal";
}

function bukaEditJadwal(id) {
  const item = Array.isArray(jadwalDataCache)
    ? jadwalDataCache.find((j) => String(j.id) === String(id))
    : null;
  if (!item) {
    showToast("Jadwal tidak ditemukan", "error");
    return;
  }
  const m = document.getElementById("jadwalModal");
  if (!m) return;
  jadwalEditId = item.id;
  aturJadwalEditMode(true);
  const jf = document.getElementById("jadwalForm");
  if (jf) jf.reset();

  const setVal = (selId, val) => {
    const sel = document.getElementById(selId);
    if (sel && val !== undefined && val !== null) sel.value = String(val);
  };

  // Normalisasi jam ke: pastikan selalu Romawi (dropdown sekarang pakai Romawi).
  const jamKeArab = (v) => {
    // Konversi angka Arab ke Romawi (untuk data lama yang tersimpan sebagai angka)
    const arab = {
      1: "I",
      2: "II",
      3: "III",
      4: "IV",
      5: "V",
      6: "VI",
      7: "VII",
      8: "VIII",
    };
    const s = String(v || "").trim();
    return arab[s] !== undefined ? arab[s] : s.toUpperCase();
  };

  // Isi jadwalGuru dari daftarGuruCache (sudah dimuat saat muatDaftarJadwal).
  {
    const gSel = document.getElementById("jadwalGuru");
    if (gSel && Array.isArray(daftarGuruCache)) {
      gSel.innerHTML =
        '<option value="">- Pilih Guru -</option>' +
        daftarGuruCache
          .map(
            (g) =>
              `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
          )
          .join("");
      setVal("jadwalGuru", item.username);
    }
  }

  (async () => {
    try {
      const { daftarKelas, daftarMapel } =
        await ambilDaftarMasterKelasDanMapel();
      isiSelect(
        "jadwalKelas",
        daftarKelas,
        item.kelas || "",
        "- Pilih Kelas -",
      );
      isiSelect(
        "jadwalMapel",
        daftarMapel,
        item.mataPelajaran || "",
        "- Pilih Mapel -",
      );
      setVal("jadwalHari", item.hari);
      setVal("jadwalJamKe", jamKeArab(item.jamKe));
    } catch (err) {}
  })();

  m.classList.remove("hidden");
}

function hapusJadwalSekarang(id, namaGuru, hari) {
  showConfirmModal(
    "Hapus Jadwal",
    "Hapus jadwal " + namaGuru + " hari " + hari + "?",
    "Ya, Hapus",
    function () {
      hapusJadwalDenganLoading(id);
    },
  );
}
async function hapusJadwalDenganLoading(id) {
  if (cekAksiBerjalan()) return;
  showLoading("Menghapus...");
  try {
    const res = await runServer("hapusJadwal", currentUser.username, id);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      luapkanMuatan("jadwal");
      muatDaftarJadwal();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

/* =============================================================
   CETAK JADWAL PELAJARAN (mengikuti hasil yang sedang ditampilkan)
   ============================================================= */
let cetakJadwalDataSaatIni = [];

function bukaCetakJadwal(usernameKhusus, namaGuruKhusus) {
  cetakJadwalDataSaatIni = getJadwalTersaring(usernameKhusus);
  if (!cetakJadwalDataSaatIni.length) {
    showToast(
      "Tidak ada jadwal untuk dicetak" +
        (usernameKhusus
          ? " (" + namaGuruKhusus + ")"
          : " pada hasil yang ditampilkan") +
        ".",
      "error",
    );
    return;
  }
  document.getElementById("cetakJadwalSubjudul").textContent = usernameKhusus
    ? "Jadwal: " + namaGuruKhusus
    : "Semua Guru";

  // Ringkasan filter yang sedang aktif, supaya dokumen tercetak jelas cakupannya.
  const f = getFilterJadwalAktif();
  const bagianFilter = [];
  if (f.term) bagianFilter.push('Cari "' + f.term + '"');
  if (f.fHari) bagianFilter.push("Hari " + f.fHari);
  if (f.fKelas) bagianFilter.push("Kelas " + f.fKelas);
  if (f.fMapel) bagianFilter.push("Mapel " + f.fMapel);
  if (f.fJamKe) bagianFilter.push("Jam ke-" + f.fJamKe);
  document.getElementById("cetakJadwalFilterInfo").textContent =
    bagianFilter.length ? "Filter aktif: " + bagianFilter.join(", ") : "";

  document.getElementById("cetakJadwalIsi").innerHTML = renderJadwalPerHari(
    cetakJadwalDataSaatIni,
  );
  document.getElementById("cetakJadwalModal").classList.remove("hidden");
}

function renderJadwalPerHari(data) {
  const perHari = {};
  HARI_URUT.forEach((h) => {
    perHari[h] = [];
  });
  data.forEach((j) => {
    if (!perHari[j.hari]) perHari[j.hari] = []; // jaga-jaga kalau ada nilai Hari di luar 7 standar
    perHari[j.hari].push(j);
  });
  const JAMKE_INDEX = {};
  JAMKE_URUT.forEach((jk, i) => {
    JAMKE_INDEX[jk] = i;
  });

  const ambilUrutJam = (j) => {
    if (JAMKE_INDEX[j.jamKe] !== undefined) return JAMKE_INDEX[j.jamKe];
    const num = parseInt(j.jamKe, 10);
    return isNaN(num) ? 99 : num - 1;
  };

  return Object.keys(perHari)
    .filter((h) => perHari[h].length)
    .map((h) => {
      const baris = perHari[h]
        .slice()
        .sort((a, b) => ambilUrutJam(a) - ambilUrutJam(b));
      return `
        <div style="margin-bottom:18px; page-break-inside:avoid;">
          <h3 style="margin:0; color:var(--ink-green); border-bottom:1px solid var(--line); padding-bottom:4px; margin-bottom:8px;">${esc(h)}</h3>
          <table class="data-table" style="font-size:11.5px;">
            <thead><tr><th>Jam Ke</th><th>Nama Guru</th><th>Mapel</th><th>Kelas</th></tr></thead>
            <tbody>
              ${baris
                .map(
                  (j) => `
                <tr>
                  <td data-label="Jam Ke">${esc(j.jamKe)}</td>
                  <td data-label="Nama Guru">${esc(j.namaGuru)}</td>
                  <td data-label="Mapel">${esc(j.mataPelajaran)}</td>
                  <td data-label="Kelas">${esc(j.kelas)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");
}
