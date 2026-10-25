/* =============================================================
   GURU — RIWAYAT HONOR
   ============================================================= */
let riwayatHonorCache = [];

async function perbaruiAksesPenggantiStaf() {
  if (!currentUser || currentUser.role !== "staf") return;
  try {
    const res = await runServer("getJadwalSaya", currentUser.username);
    if (!res || !res.success) {
      throw new Error((res && res.message) || "Gagal memuat jadwal pengganti.");
    }
    if (!currentUser || currentUser.role !== "staf") return;
    const sedangMengganti = (res.data || []).some((j) => j.penggantian);
    document
      .querySelectorAll('.guru-bottom-nav button[data-tab="jadwal"], .guru-bottom-nav button[data-tab="presensi"]')
      .forEach((el) => el.classList.toggle("hidden", !sedangMengganti));
    if (
      !sedangMengganti &&
      (__tabGuruAktif === "jadwal" || __tabGuruAktif === "presensi")
    ) {
      gantiTabGuru("absen");
    }
  } catch (err) {
    console.error("Akses jadwal guru pengganti gagal dimuat:", err);
    showToast("Jadwal guru pengganti tidak dapat dimuat.", "error");
  }
}

async function muatBadgeNotifikasiHonor() {
  const badge = document.getElementById("badgeNotifikasiHonor");
  const btn = document.getElementById("btnNotifikasiHonor");
  try {
    const res = await runServer(
      "getRiwayatHonorPegawai",
      "",
      currentUser.username,
    );
    if (!res.success) return;
    riwayatHonorCache = res.data || [];
    const tersedia = riwayatHonorCache.filter(
      (r) => r.status === "Final",
    ).length;
    if (tersedia > 0) {
      if (badge) {
        badge.textContent = tersedia;
        badge.classList.remove("hidden");
      }
      if (btn) btn.classList.remove("hidden");
    } else {
      if (badge) badge.classList.add("hidden");
      if (btn) btn.classList.add("hidden");
    }
  } catch (err) {
    // Diam saja — bukan hal kritikal untuk sekadar badge notifikasi.
    console.warn(
      "Badge notifikasi honor gagal dimuat:",
      err && err.message ? err.message : err,
    );
  }
}

async function muatJadwalSaya() {
  const list = document.getElementById("jadwalSayaList");
  const kosong = document.getElementById("jadwalSayaKosong");
  const summary = document.getElementById("guruJadwalSummary");
  const status = document.getElementById("guruJadwalStatus");
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat jadwal...</div></div>`;
  if (status) status.textContent = "Memuat jadwal...";
  kosong.classList.add("hidden");
  try {
    const res = await runServer("getJadwalSaya", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      list.innerHTML = "";
      if (status) status.textContent = "Jadwal gagal dimuat";
      return;
    }
    const data = res.data || [];
    guruJadwalCache = data;
    if (status) {
      status.textContent = data.length ? "Ada jadwal" : "Belum ada jadwal";
    }
    if (summary) {
      summary.textContent = `${data.length} sesi per minggu`;
    }
    if (!data.length) {
      list.innerHTML = "";
      kosong.classList.remove("hidden");
      return;
    }

    const perHari = {};
    HARI_URUT.forEach((h) => {
      perHari[h] = [];
    });
    data.forEach((j) => {
      if (!perHari[j.hari]) perHari[j.hari] = [];
      perHari[j.hari].push(j);
    });
    list.innerHTML = Object.keys(perHari)
      .filter((h) => perHari[h].length)
      .map((h) => {
            const slot = perHari[h].slice().sort((a, b) => {
              return urutanJamJadwal(a.jamKe) - urutanJamJadwal(b.jamKe);
            });
            const waktuAwal = waktuJamJadwal(slot[0].jamKe).split("–");
            const waktuAkhir = waktuJamJadwal(slot[slot.length - 1].jamKe).split("–");
            const rentangHari =
              waktuAwal[0] && waktuAkhir.length > 1
                ? `${waktuAwal[0]}–${waktuAkhir[waktuAkhir.length - 1]}`
                : `${slot[0].jamKe}–${slot[slot.length - 1].jamKe}`;
            return `
              <section class="guru-day-card">
                <header class="guru-day-heading">
                  <div class="guru-day-name"><span></span><h3>${esc(h)}</h3><span class="guru-day-count">${slot.length} sesi</span></div>
                  <span class="guru-day-hours">${esc(rentangHari)}</span>
                </header>
                <div class="guru-day-sessions">
                  ${slot
                    .map((j) => {
                      const jam = waktuJamJadwal(j.jamKe);
                      const jamMulai = jam.split("–")[0] || "";
                      return `
                        <article class="guru-schedule-slot">
                          <div class="guru-slot-period"><small>JAM KE</small><strong>${esc(j.jamKe)}</strong>${jamMulai ? `<span>${jamMulai}</span>` : ""}</div>
                          <div class="guru-slot-info">
                            <h4>${esc(j.mataPelajaran)}</h4>
                            ${j.penggantian ? `<span class="guru-substitute-tag">Pengganti utk ${esc(j.penggantianUntuk)}${j.tanggal ? ` · ${esc(j.tanggal)}` : ""}</span>` : ""}
                            <span class="guru-slot-class">${esc(j.kelasNama || j.kelas)}</span>
                          </div>
                          ${jam ? `<span class="guru-slot-time">${jam}</span>` : ""}
                        </article>`;
                    })
                    .join("")}
                </div>
              </section>
            `;
          })
          .join("");
  } catch (err) {
    showToast(err.message, "error");
    list.innerHTML = "";
    kosong.classList.remove("hidden");
    if (status) status.textContent = "Jadwal gagal dimuat";
  }
}

function renderRiwayatHonorList() {
  const list = document.getElementById("riwayatHonorList");
  const kosong = document.getElementById("riwayatHonorKosong");
  if (!riwayatHonorCache || !riwayatHonorCache.length) {
    list.innerHTML = "";
    kosong.classList.remove("hidden");
    return;
  }
  kosong.classList.add("hidden");
  list.innerHTML = riwayatHonorCache
    .map((r) => {
      const final = r.status === "Final";
      const pill = final
        ? '<span class="pay-seen-pill">Final</span>'
        : '<span class="pay-new-pill">Draft</span>';
      return `
    <div class="honor-pay-card" ${final ? `onclick="bukaSlipHonorSaya(${r.bulan}, ${r.tahun})"` : 'style="opacity:.75; cursor:default;"'}>
      <div class="pay-card-header">
        <div class="pay-card-period">
          <span class="pay-period-badge">${esc(NAMA_BULAN[r.bulan])} ${r.tahun}</span>
          ${pill}
        </div>
        <div class="pay-status-badge verified">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>${final ? "Diverifikasi Kepala" : "Menunggu Finalisasi"}</span>
        </div>
      </div>
      <div class="pay-card-body">
        <div class="pay-card-date">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${r.totalSesi || 0} sesi \u00b7 ${formatRupiah(r.totalHonor || 0)}</span>
        </div>
        <div class="pay-card-action">
          <span>${final ? "Lihat Slip Honor" : "Belum difinalisasi"}</span>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    </div>`;
    })
    .join("");
}

async function muatRiwayatHonor() {
  const list = document.getElementById("riwayatHonorList");
  const kosong = document.getElementById("riwayatHonorKosong");
  list.innerHTML = `<div class="empty-state">${icon("clock")}<div class="s">Memuat riwayat...</div></div>`;
  kosong.classList.add("hidden");
  try {
    const res = await runServer(
      "getRiwayatHonorPegawai",
      "",
      currentUser.username,
    );
    if (!res.success) {
      showToast(res.message, "error");
      list.innerHTML = "";
      return;
    }
    riwayatHonorCache = res.data || [];
    renderRiwayatHonorList();
  } catch (err) {
    showToast(err.message, "error");
    list.innerHTML = "";
    kosong.classList.remove("hidden");
  }
}

async function bukaSlipHonorSaya(bulan, tahun) {
  document
    .getElementById("slipHonorPrintArea")
    .classList.remove("mode-slip-gaji");
  document.getElementById("ukuranKertasCetak").textContent = "";
  showLoading("Memuat slip...");
  try {
    const res = await runServer(
      "getSlipHonorBaru",
      "",
      currentUser.username,
      bulan,
      tahun,
    );
    hideLoading();
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    const d = res.data || res;
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

    document.getElementById("slipHonorModal").classList.remove("hidden");
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

let konfirmasiPenggantiTolakAktifId = null;

function formatTanggalPermintaanPengganti(tanggal) {
  const [hari, bulan, tahun] = String(tanggal || "").split("/");
  const namaBulan = [
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
  const bulanIndex = Number(bulan) - 1;
  if (!hari || !tahun || !namaBulan[bulanIndex]) return String(tanggal || "-");
  return `${Number(hari)} ${namaBulan[bulanIndex]} ${tahun}`;
}

function bukaModalDaftarKonfirmasiPengganti() {
  const list = document.getElementById("konfirmasiPenggantiList");
  const kosong = document.getElementById("konfirmasiPenggantiKosong");
  if (!list || !kosong) return;

  if (!daftarKonfirmasiPenggantiCache.length) {
    list.innerHTML = "";
    list.classList.add("hidden");
    kosong.classList.remove("hidden");
  } else {
    list.classList.remove("hidden");
    kosong.classList.add("hidden");
    list.innerHTML = daftarKonfirmasiPenggantiCache
      .map((item) => {
        const tanggalMulai = formatTanggalPermintaanPengganti(item.tglMulai);
        const tanggalSelesai = formatTanggalPermintaanPengganti(
          item.tglSelesai,
        );
        const tanggal =
          item.tglMulai === item.tglSelesai
            ? tanggalMulai
            : `${tanggalMulai} – ${tanggalSelesai}`;
        const sedangTolak =
          konfirmasiPenggantiTolakAktifId === String(item.id);
        const namaAsal = item.namaAsal || "Guru asal";
        const inisial = namaAsal
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((bagian) => bagian.charAt(0))
          .join("")
          .toUpperCase();
        return `
          <article class="guru-substitute-request" data-pengganti-id="${esc(item.id)}">
            <div class="guru-substitute-request-heading">
              <span class="guru-substitute-request-kind">${esc(item.jenis || "Penggantian mengajar")}</span>
              <span class="guru-substitute-request-status">Menunggu jawaban</span>
            </div>
            <section class="guru-substitute-profile" aria-label="Guru yang digantikan">
              <span class="guru-substitute-avatar" aria-hidden="true">${esc(inisial || "G")}</span>
              <div>
                <span class="guru-substitute-profile-label">Guru yang digantikan</span>
                <h3>${esc(namaAsal)}</h3>
              </div>
            </section>
            <section class="guru-substitute-period">
              <div class="guru-substitute-period-heading">
                <span>Periode permintaan</span>
                <strong>${esc(tanggal)}</strong>
              </div>
              <p>Periksa ketersediaan Anda pada tanggal tersebut sebelum memberi jawaban.</p>
            </section>
            ${
              item.alasan
                ? `<p class="guru-substitute-request-reason"><span>Alasan izin</span>${esc(item.alasan)}</p>`
                : ""
            }
            <p class="guru-substitute-guidance">Jika diterima, jadwal akan diperbarui dan presensi dilakukan saat mulai mengajar.</p>
            ${
              sedangTolak
                ? `<div class="guru-substitute-reject-confirm" role="group" aria-label="Konfirmasi penolakan">
                    <p>Tolak penugasan ini? Sesi tetap menjadi tanggung jawab guru asal.</p>
                    <div>
                      <button type="button" class="btn btn-outline" onclick="jawabPenggantiKlik('${escJs(item.id)}','Batal')">Kembali</button>
                      <button type="button" class="btn btn-danger" onclick="jawabPenggantiKlik('${escJs(item.id)}','Ditolak',true)">Tolak penugasan</button>
                    </div>
                  </div>`
                : `<div class="guru-substitute-request-actions">
                    <button type="button" class="btn btn-outline" onclick="jawabPenggantiKlik('${escJs(item.id)}','Ditolak')">Tolak</button>
                    <button type="button" class="btn btn-primary" onclick="jawabPenggantiKlik('${escJs(item.id)}','Diterima')">Terima penugasan</button>
                  </div>`
            }
            <p class="guru-substitute-request-feedback" aria-live="polite"></p>
          </article>`;
      })
      .join("");
  }
  document
    .getElementById("konfirmasiPenggantiListModal")
    .classList.remove("hidden");
}

async function jawabPenggantiKlik(penggantiId, jawab, tolakDikonfirmasi = false) {
  const id = String(penggantiId);
  if (jawab === "Batal") {
    konfirmasiPenggantiTolakAktifId = null;
    bukaModalDaftarKonfirmasiPengganti();
    return;
  }
  if (jawab === "Ditolak" && !tolakDikonfirmasi) {
    konfirmasiPenggantiTolakAktifId = id;
    bukaModalDaftarKonfirmasiPengganti();
    return;
  }
  if (cekAksiBerjalan()) return;

  const card = [...document.querySelectorAll(".guru-substitute-request")].find(
    (item) => item.dataset.penggantiId === id,
  );
  const buttons = card ? [...card.querySelectorAll("button")] : [];
  const feedback = card?.querySelector(".guru-substitute-request-feedback");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  if (feedback) feedback.textContent = "Mengirim jawaban...";
  if (card) card.setAttribute("aria-busy", "true");

  showLoading("Mengirim jawaban...");
  try {
    const res = await runServer("jawabPengganti", {
      username: currentUser.username,
      penggantiId: penggantiId,
      jawab: jawab,
    });
    hideLoading();
    if (!res.success) {
      showToast(res.message, "error");
      if (feedback) feedback.textContent = res.message || "Jawaban belum tersimpan.";
      buttons.forEach((button) => {
        button.disabled = false;
      });
      if (card) card.removeAttribute("aria-busy");
      return;
    }

    konfirmasiPenggantiTolakAktifId = null;
    daftarKonfirmasiPenggantiCache = daftarKonfirmasiPenggantiCache.filter(
      (item) => String(item.id) !== id,
    );
    showToast(
      jawab === "Diterima"
        ? "Penugasan diterima. Jadwal diperbarui; lakukan presensi saat mulai mengajar."
        : res.message,
      "success",
    );
    await muatBadgeKonfirmasiPengganti();
    bukaModalDaftarKonfirmasiPengganti();
    if (typeof muatDashboardGuru === "function") muatDashboardGuru();
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
    if (feedback) feedback.textContent = err.message || "Jawaban gagal dikirim.";
    buttons.forEach((button) => {
      button.disabled = false;
    });
    if (card) card.removeAttribute("aria-busy");
  }
}

function bukaKonfirmasiPenggantiById(id) {
  const item = daftarKonfirmasiPenggantiCache.find(
    (x) => String(x.id) === String(id),
  );
  if (item) bukaModalKonfirmasiPengganti(item);
}

function bukaModalKonfirmasiPengganti(item) {
  // Mobile check dilonggarkan agar bisa diuji coba dari Desktop maupun HP
  modeKamera = "konfirmasi";
  konfirmasiPenggantiAktifId = item.id;
  konfirmasiPenggantiAktifIsRentang = !!(item.tipe === "rentang");
  capturedPhoto = null;
  currentLocation = null;
  lokasiValidUntukAbsen = false;
  document.getElementById("modalAbsenTitle").textContent =
    konfirmasiPenggantiAktifIsRentang
      ? "Konfirmasi Penggantian Rentang \u2014 " + item.namaGuruAsli
      : "Konfirmasi \u2014 " +
        item.mataPelajaran +
        " \u00b7 Kelas " +
        item.kelas +
        " \u00b7 Jam ke-" +
        item.jamKe;
  resetTampilanKamera();
  document
    .getElementById("konfirmasiPenggantiListModal")
    .classList.add("hidden");
  document.getElementById("cameraModal").classList.remove("hidden");
  mulaiLiveKamera();

  updateLokasiStatus("mencari");
  ambilLokasi()
    .then((loc) => {
      currentLocation = loc;
      if (
        infoSekolahCache &&
        infoSekolahCache.latitudeSekolah != null &&
        infoSekolahCache.longitudeSekolah != null
      ) {
        const jarak = Math.round(
          hitungJarakClient(
            loc.lat,
            loc.lng,
            infoSekolahCache.latitudeSekolah,
            infoSekolahCache.longitudeSekolah,
          ),
        );
        const radius = infoSekolahCache.radiusMeter || 150;
        if (jarak > radius) {
          lokasiValidUntukAbsen = false;
          updateLokasiStatus(
            "error",
            `Di Luar Radius (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        } else {
          lokasiValidUntukAbsen = true;
          updateLokasiStatus(
            "ok",
            `Radius Aman (${jarak}m dari madrasah · Toleransi ${radius}m)`,
          );
        }
      } else {
        // Tanpa koordinat madrasah yang valid, kehadiran tidak boleh lolos begitu saja
        // (dipastikan dua kali: di klien maupun di server saat menyimpan).
        lokasiValidUntukAbsen = false;
        updateLokasiStatus(
          "error",
          "Koordinat madrasah belum diatur oleh admin.",
        );
      }
    })
    .catch((err) => {
      lokasiValidUntukAbsen = false;
      updateLokasiStatus("error", err.message, err.iframeIssue);
    });
}

async function kirimKonfirmasiPengganti() {
  if (!capturedPhoto) {
    showToast("Silakan ambil foto terlebih dahulu", "error");
    return;
  }
  if (!currentLocation) {
    showToast("Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    return;
  }
  if (!lokasiValidUntukAbsen) {
    showToast(
      "Anda berada di luar radius sekolah. Konfirmasi tidak bisa dikirim dari lokasi ini.",
      "error",
    );
    return;
  }

  showLoading("Mengirim konfirmasi...");
  setSubmitAbsenState(true);
  try {
    const fn = konfirmasiPenggantiAktifIsRentang
      ? "konfirmasiPenggantiRentang"
      : "konfirmasiPengganti";
    const res = await runServer(fn, {
      id: konfirmasiPenggantiAktifId,
      username: currentUser.username,
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      fotoBase64: capturedPhoto,
    });
    setSubmitAbsenState(false);
    hideLoading();
    if (res.success) {
      tutupModalAbsen();
      showToast(res.message, "success");
      muatBadgeKonfirmasiPengganti();
      muatDashboardGuru();
      if (currentUser.role === "staf") {
        await perbaruiAksesPenggantiStaf();
      }
    } else {
      showToast(res.message, "error");
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function setSubmitAbsenState(loading) {
  const btn = document.getElementById("submitAbsenBtn");
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Mengirim...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
  }
}

function handleSubmitKamera() {
  if (modeKamera === "konfirmasi") kirimKonfirmasiPengganti();
  else kirimAbsensi();
}

let liveWebcamStream = null;

async function mulaiLiveKamera() {
  const video = document.getElementById("webcamVideo");
  const snapBtn = document.getElementById("btnSnapPhoto");
  const faceGuide = document.getElementById("faceGuideOval");
  const fallbackBox = document.getElementById("camFallbackBox");
  const capturedImg = document.getElementById("capturedImg");
  const fallbackUploadBtn = document.getElementById("btnFallbackUpload");

  // Reset tampilan
  capturedPhoto = null;
  if (capturedImg) {
    capturedImg.classList.add("hidden");
    capturedImg.src = "";
  }
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
  if (fallbackUploadBtn) fallbackUploadBtn.classList.remove("hidden");

  hentikanLiveKamera();

  // Jika browser tidak mendukung WebRTC getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    tampilkanFallbackUpload("Browser tidak mendukung kamera live.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    liveWebcamStream = stream;
    if (video) {
      video.srcObject = stream;
      video.classList.remove("hidden");
      await video.play();
    }
    if (snapBtn) snapBtn.classList.remove("hidden");
    if (faceGuide) faceGuide.classList.remove("hidden");
    if (fallbackBox) fallbackBox.classList.add("hidden");
  } catch (err) {
    console.warn("Live camera tidak dapat diakses:", err);
    tampilkanFallbackUpload("Izin kamera belum aktif atau diblokir.");
  }
}

function tampilkanFallbackUpload(alasan) {
  hentikanLiveKamera();
  const video = document.getElementById("webcamVideo");
  const snapBtn = document.getElementById("btnSnapPhoto");
  const faceGuide = document.getElementById("faceGuideOval");
  const fallbackBox = document.getElementById("camFallbackBox");

  if (video) video.classList.add("hidden");
  if (snapBtn) snapBtn.classList.add("hidden");
  if (faceGuide) faceGuide.classList.add("hidden");
  if (fallbackBox) fallbackBox.classList.remove("hidden");
}

function hentikanLiveKamera() {
  if (liveWebcamStream) {
    try {
      liveWebcamStream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    liveWebcamStream = null;
  }
  const video = document.getElementById("webcamVideo");
  if (video) {
    video.srcObject = null;
    video.classList.add("hidden");
  }
}

function jepretFotoLive() {
  const video = document.getElementById("webcamVideo");
  const canvas = document.getElementById("cameraCanvas");
  if (!video || !canvas) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Mirror flip horizontal agar sesuai dengan pratinjau cermin selfie
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  capturedPhoto = canvas.toDataURL("image/jpeg", 0.82);

  // Hentikan stream kamera
  hentikanLiveKamera();

  // Tampilkan foto hasil jepretan
  const img = document.getElementById("capturedImg");
  if (img) {
    img.src = capturedPhoto;
    img.classList.remove("hidden");
  }
  const snapBtn = document.getElementById("btnSnapPhoto");
  if (snapBtn) snapBtn.classList.add("hidden");
  const faceGuide = document.getElementById("faceGuideOval");
  if (faceGuide) faceGuide.classList.add("hidden");
  const fallbackUploadBtn = document.getElementById("btnFallbackUpload");
  if (fallbackUploadBtn) fallbackUploadBtn.classList.add("hidden");

  document.getElementById("retakeBtn").classList.remove("hidden");
  document.getElementById("submitAbsenBtn").classList.remove("hidden");
}

function bukaUploadFileFallback() {
  const input = document.getElementById("fotoInput");
  if (input) input.click();
}

function handleFotoInputChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow picking/retaking the same filename twice in a row
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("File yang dipilih bukan gambar", "error");
    return;
  }
  showLoading("Memproses foto...");
  resizeAndEncodeFoto(file, 720, 0.75)
    .then((dataUrl) => {
      hideLoading();
      hentikanLiveKamera();
      capturedPhoto = dataUrl;
      const fallbackBox = document.getElementById("camFallbackBox");
      if (fallbackBox) fallbackBox.classList.add("hidden");
      const snapBtn = document.getElementById("btnSnapPhoto");
      if (snapBtn) snapBtn.classList.add("hidden");
      const faceGuide = document.getElementById("faceGuideOval");
      if (faceGuide) faceGuide.classList.add("hidden");
      const fallbackUploadBtn = document.getElementById("btnFallbackUpload");
      if (fallbackUploadBtn) fallbackUploadBtn.classList.add("hidden");
      const img = document.getElementById("capturedImg");
      img.src = capturedPhoto;
      img.classList.remove("hidden");
      document.getElementById("retakeBtn").classList.remove("hidden");
      document.getElementById("submitAbsenBtn").classList.remove("hidden");
    })
    .catch((err) => {
      hideLoading();
      showToast("Gagal memproses foto: " + err.message, "error");
    });
}

function resizeAndEncodeFoto(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Tidak dapat membaca file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format gambar tidak didukung"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ambilUlangFoto() {
  capturedPhoto = null;
  document.getElementById("capturedImg").classList.add("hidden");
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
  mulaiLiveKamera();
}

function resetTampilanKamera() {
  capturedPhoto = null;
  hentikanLiveKamera();
  const img = document.getElementById("capturedImg");
  if (img) img.classList.add("hidden");
  const snapBtn = document.getElementById("btnSnapPhoto");
  if (snapBtn) snapBtn.classList.add("hidden");
  const faceGuide = document.getElementById("faceGuideOval");
  if (faceGuide) faceGuide.classList.add("hidden");
  const fallbackBox = document.getElementById("camFallbackBox");
  if (fallbackBox) fallbackBox.classList.add("hidden");
  document.getElementById("retakeBtn").classList.add("hidden");
  document.getElementById("submitAbsenBtn").classList.add("hidden");
}

function tutupModalAbsen() {
  hentikanLiveKamera();
  const m = document.getElementById("cameraModal");
  if (m) m.classList.add("hidden");
  modeKamera = "absen";
  konfirmasiPenggantiAktifId = null;
}

function hitungJarakClient(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isDalamIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

function ambilLokasi() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Perangkat tidak mendukung GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        let msg = "Gagal mengambil lokasi";
        let iframeIssue = false;
        if (err.code === 1) {
          if (isDalamIframe()) {
            msg =
              "Lokasi diblokir karena halaman ini dibuka di dalam situs lain (mis. Google Sites), bukan karena pengaturan HP Anda.";
            iframeIssue = true;
          } else {
            msg =
              "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.";
          }
        } else if (err.code === 2)
          msg = "Lokasi tidak tersedia. Pastikan GPS aktif.";
        else if (err.code === 3)
          msg = "Waktu pengambilan lokasi habis. Coba lagi.";
        const errObj = new Error(msg);
        errObj.iframeIssue = iframeIssue;
        reject(errObj);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function segarGPSModal() {
  const btn = document.getElementById("btnRefreshGpsModal");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin-sm"></span> Mencari...`;
  }
  updateLokasiStatus("mencari");
  try {
    const loc = await ambilLokasi();
    currentLocation = loc;
    if (
      infoSekolahCache &&
      infoSekolahCache.latitudeSekolah != null &&
      infoSekolahCache.longitudeSekolah != null
    ) {
      const jarak = Math.round(
        hitungJarakClient(
          loc.lat,
          loc.lng,
          infoSekolahCache.latitudeSekolah,
          infoSekolahCache.longitudeSekolah,
        ),
      );
      const radius = infoSekolahCache.radiusMeter || 150;
      if (jarak > radius) {
        lokasiValidUntukAbsen = false;
        updateLokasiStatus(
          "error",
          `Di Luar Radius (${jarak}m dari madrasah · Toleransi ${radius}m)`,
        );
      } else {
        lokasiValidUntukAbsen = true;
        updateLokasiStatus(
          "ok",
          `Radius Aman (${jarak}m dari madrasah · Toleransi ${radius}m)`,
        );
      }
    } else {
      // Tanpa koordinat madrasah yang valid, kehadiran tidak boleh lolos begitu saja
      // (dipastikan dua kali: di klien maupun di server saat menyimpan).
      lokasiValidUntukAbsen = false;
      updateLokasiStatus(
        "error",
        "Koordinat madrasah belum diatur oleh admin.",
      );
    }
    showToast("Titik koordinat GPS berhasil diperbarui", "info");
  } catch (err) {
    lokasiValidUntukAbsen = false;
    updateLokasiStatus("error", err.message, err.iframeIssue);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg><span>Segarkan GPS</span>`;
    }
  }
}

function updateLokasiStatus(state, msg, tampilkanBukaTab) {
  const el = document.getElementById("locationStatus");
  if (!el) return;
  el.className = "location-status";
  if (state === "mencari") {
    el.classList.add("mencari");
    el.innerHTML = `<span class="spin-sm"></span> <span>Mencari sinyal GPS akurat...</span>`;
  } else if (state === "ok") {
    el.classList.add("ok");
    el.innerHTML = `<span class="gps-radar-chip in-radius"><span class="radar-pulse-dot green"></span> ${esc(msg || "Lokasi Terverifikasi")}</span>`;
  } else {
    el.classList.add("error");
    el.innerHTML =
      `<span class="gps-radar-chip out-radius"><span class="radar-pulse-dot red"></span> ${esc(msg || "Gagal mengambil lokasi")}</span>` +
      (tampilkanBukaTab
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="window.open(window.location.href, '_blank')" style="margin-left:8px;">Buka di Tab Baru</button>`
        : "");
  }
}

async function kirimAbsensi() {
  if (!capturedPhoto) {
    showToast("Silakan ambil foto terlebih dahulu", "error");
    return;
  }
  if (!currentLocation) {
    showToast("Lokasi belum ditemukan. Pastikan GPS aktif.", "error");
    return;
  }
  if (!lokasiValidUntukAbsen) {
    showToast(
      "Anda berada di luar radius sekolah. Absensi tidak bisa dikirim dari lokasi ini.",
      "error",
    );
    return;
  }

  showLoading("Mengirim absensi...");
  setSubmitAbsenState(true);
  try {
    const res = await runServer("catatAbsensiHarian", {
      username: currentUser.username,
      jenisAbsen: jenisAbsenAktif,
      latitude: currentLocation.lat,
      longitude: currentLocation.lng,
      fotoBase64: capturedPhoto,
    });
    setSubmitAbsenState(false);
    hideLoading();
    if (res.success) {
      tutupModalAbsen();
      showToast(res.message, "success");
      muatDashboardGuru();
    } else {
      showToast(res.message, "error");
    }
  } catch (err) {
    setSubmitAbsenState(false);
    hideLoading();
    showToast(err.message, "error");
  }
}
