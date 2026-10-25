/* =============================================================
   GURU — KONFIRMASI SEBAGAI GURU PENGGANTI
   ============================================================= */
async function muatBadgeKonfirmasiPengganti() {
  const badge = document.getElementById("badgeNotifikasiPengganti");
  const banner = document.getElementById("guruPenggantiAlertBanner");
  try {
    const res = await runServer("getPermintaanPengganti", "");
    daftarKonfirmasiPenggantiCache = (res && res.data) || [];
    const count = daftarKonfirmasiPenggantiCache.length;
    if (count > 0) {
      const ringkasan = document.getElementById("guruPenggantiBannerText");
      const pertama = daftarKonfirmasiPenggantiCache[0];
      if (ringkasan) {
        const tanggalMulai = formatTanggalPermintaanPengganti(
          pertama.tglMulai,
        );
        const tanggalSelesai = formatTanggalPermintaanPengganti(
          pertama.tglSelesai,
        );
        const periode =
          pertama.tglMulai === pertama.tglSelesai
            ? tanggalMulai
            : `${tanggalMulai} – ${tanggalSelesai}`;
        ringkasan.textContent =
          count === 1
            ? `Permintaan dari ${pertama.namaAsal || "guru asal"} untuk periode ${periode}.`
            : `Ada ${count} permintaan yang menunggu jawaban. Permintaan terdekat dari ${pertama.namaAsal || "guru asal"} untuk ${periode}.`;
      }
      if (badge) {
        badge.textContent = count;
        badge.classList.remove("hidden");
      }
      if (banner) {
        banner.classList.remove("hidden");
      }
    } else {
      if (badge) badge.classList.add("hidden");
      if (banner) banner.classList.add("hidden");
    }
  } catch (err) {
    console.error("Notifikasi guru pengganti gagal dimuat:", err);
  }
}
