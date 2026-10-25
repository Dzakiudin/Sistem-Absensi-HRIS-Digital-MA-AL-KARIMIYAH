/* =============================================================
   ADMIN — CATAT KEHADIRAN MANUAL (Izin/Sakit/Cuti/Alpa/Hadir)
   ============================================================= */
async function bukaModalKehadiranManual() {
  document.getElementById("manualForm").reset();
  const autoBox = document.getElementById("manualJadwalAutoBox");
  if (autoBox) autoBox.classList.add("hidden");
  const chipsEl = document.getElementById("manualJadwalChips");
  if (chipsEl) chipsEl.innerHTML = "";

  isiSelectAtauLainnya("manualMapel", "manualMapelManual", "");
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", "");
  const sel = document.getElementById("manualGuru");
  const selPengganti = document.getElementById("manualGuruPengganti");
  sel.innerHTML = '<option value="">Memuat daftar guru...</option>';
  selPengganti.innerHTML = '<option value="">Memuat daftar guru...</option>';
  document.getElementById("manualModal").classList.remove("hidden");

  // Pasang auto-detect event listener
  if (!sel.dataset.listenerInstalled) {
    sel.addEventListener("change", () => {
      isiDefaultMapelKelasManual();
      deteksiJadwalManualGuru();
    });
    const tglEl = document.getElementById("manualTanggal");
    if (tglEl) tglEl.addEventListener("change", deteksiJadwalManualGuru);
    sel.dataset.listenerInstalled = "true";
  }

  // Set default tanggal hari ini (yyyy-MM-dd) berdasarkan zona lokal,
  // bukan UTC (toISOString bisa salah 1 hari pagi hari di WIB).
  const tglEl = document.getElementById("manualTanggal");
  if (tglEl) {
    const today = tanggalLocalISO();
    tglEl.value = today;
  }

  try {
    if (!daftarGuruCache.length) {
      const res = await runServer("getDaftarGuru", currentUser.username);
      if (res.success) daftarGuruCache = res.data;
    }
    const opsiGuru = daftarGuruCache
      .map(
        (g) =>
          `<option value="${esc(g.username)}">${esc(g.namaLengkap)}</option>`,
      )
      .join("");
    sel.innerHTML = '<option value="">- Pilih Guru -</option>' + opsiGuru;
    selPengganti.innerHTML =
      '<option value="">- Tidak ada -</option>' + opsiGuru;
  } catch (err) {
    sel.innerHTML = '<option value="">Gagal memuat daftar guru</option>';
    selPengganti.innerHTML = '<option value="">- Tidak ada -</option>';
  }
}

async function deteksiJadwalManualGuru() {
  const username = document.getElementById("manualGuru").value;
  const tglInput = document.getElementById("manualTanggal").value; // yyyy-MM-dd
  const autoBox = document.getElementById("manualJadwalAutoBox");
  const chipsEl = document.getElementById("manualJadwalChips");
  const hariLabel = document.getElementById("manualHariLabel");
  if (!autoBox || !chipsEl) return;

  if (!username || !tglInput) {
    autoBox.classList.add("hidden");
    chipsEl.innerHTML = "";
    return;
  }

  // Hitung nama hari kalender
  const parts = tglInput.split("-");
  if (parts.length !== 3) return;
  const dObj = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
  const namaHari = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ][dObj.getDay()];
  if (hariLabel) hariLabel.textContent = namaHari;

  // Pastikan jadwalDataCache terisi
  if (!jadwalDataCache.length) {
    try {
      const res = await runServer("getDaftarJadwal", currentUser.username);
      if (res.success) jadwalDataCache = res.data || [];
    } catch (e) {}
  }

  const JAMKE_INDEX = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
  const jadwalHariIni = jadwalDataCache
    .filter((j) => j.username === username && j.hari === namaHari)
    .sort(
      (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
    );

  if (!jadwalHariIni.length) {
    autoBox.classList.remove("hidden");
    chipsEl.innerHTML = `<span style="font-size: 11px; color: #64748b; font-style: italic;">Tidak ada jadwal mengajar tetap untuk hari ${namaHari}. Anda dapat memilih Mapel &amp; Kelas manual di bawah.</span>`;
    return;
  }

  autoBox.classList.remove("hidden");
  chipsEl.innerHTML = jadwalHariIni
    .map(
      (j) => `
    <button type="button" class="manual-schedule-chip" onclick="pilihJadwalManualAuto(this, '${escJs(j.mataPelajaran)}', '${escJs(j.kelas)}', '${escJs(j.jamKe)}')">
      <strong>Jam ${esc(j.jamKe)}:</strong> ${esc(j.mataPelajaran)} &middot; Kelas ${esc(j.kelas)}
    </button>
  `,
    )
    .join("");
}

function pilihJadwalManualAuto(btnEl, mapel, kelas, jamKe) {
  document
    .querySelectorAll(".manual-schedule-chip")
    .forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  isiSelectAtauLainnya("manualMapel", "manualMapelManual", mapel);
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", kelas);
  const jamKeEl = document.getElementById("manualJamKe");
  if (jamKeEl) jamKeEl.value = jamKe;

  showToast(`Terisi otomatis: Jam ${jamKe} · ${mapel} (${kelas})`, "info");
}

function isiDefaultMapelKelasManual() {
  const username = document.getElementById("manualGuru").value;
  const g = daftarGuruCache.find((x) => x.username === username);
  isiSelectAtauLainnya(
    "manualMapel",
    "manualMapelManual",
    g ? g.mataPelajaran : "",
  );
  isiSelectAtauLainnya("manualKelas", "manualKelasManual", g ? g.kelas : "");
  document.getElementById("manualJamKe").value =
    g && g.jamKe && g.jamKe !== "-" ? g.jamKe : "";
}

async function handleSimpanKehadiranManual(e) {
  e.preventDefault();
  const username = document.getElementById("manualGuru").value;
  const tanggalInput = document.getElementById("manualTanggal").value; // yyyy-MM-dd
  if (!username || !tanggalInput) {
    showToast("Guru dan tanggal wajib diisi", "error");
    return;
  }
  const [y, m, d] = tanggalInput.split("-");
  const tanggalFormatted = `${d}/${m}/${y}`;
  const statusWaktu = document.getElementById("manualKategori").value;
  const keterangan = document.getElementById("manualKeterangan").value.trim();
  const jamMasukEl = document.getElementById("manualJamMasuk");
  const jamPulangEl = document.getElementById("manualJamPulang");
  const jamMasuk = jamMasukEl ? jamMasukEl.value.trim() : "";
  const jamPulang = jamPulangEl ? jamPulangEl.value.trim() : "";
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer(
      "catatAbsensiHarianManual",
      currentUser.username,
      {
        username: username,
        tanggal: tanggalFormatted,
        statusWaktu: statusWaktu,
        keterangan: keterangan,
        jamMasuk: jamMasuk,
        jamPulang: jamPulang,
      },
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("manualModal").classList.add("hidden");
      muatStatistik("admin");
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
