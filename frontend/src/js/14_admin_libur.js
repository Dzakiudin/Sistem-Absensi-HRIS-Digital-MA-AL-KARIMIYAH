/* =============================================================
   ADMIN — KALENDER LIBUR
   ============================================================= */
async function muatDaftarLibur() {
  const tbody = document.getElementById("liburBody");
  const wrap = document.getElementById("liburBodyWrap");
  const empty = document.getElementById("liburBodyEmpty");
  try {
    const res = await runServer("getDaftarLibur", currentUser.username);
    if (!res.success) {
      showToast(res.message, "error");
      return;
    }
    if (!res.data.length) {
      wrap.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    empty.classList.add("hidden");
    tbody.innerHTML = res.data
      .map(
        (l) => `
      <tr>
        <td data-label="Tanggal Libur"><strong>${esc(l.tanggal)}</strong></td>
        <td data-label="Keterangan Libur">${esc(l.keterangan)}</td>
        <td data-label="Aksi" style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button type="button" class="btn btn-icon text-danger" onclick="hapusLiburSekarang('${escJs(l.tanggal)}')" title="Hapus">${icon("x")}</button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleTambahLibur(e) {
  e.preventDefault();
  const mulaiInput = document.getElementById("liburTanggalMulai").value; // yyyy-MM-dd
  const selesaiInput =
    document.getElementById("liburTanggalSelesai").value || mulaiInput; // kosong = sama dengan tanggal mulai (1 hari)
  if (!mulaiInput) {
    showToast("Tanggal mulai wajib diisi", "error");
    return;
  }
  const formatTgl = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const tanggalMulai = formatTgl(mulaiInput);
  const tanggalSelesai = formatTgl(selesaiInput);
  const keterangan = document.getElementById("liburKeterangan").value.trim();
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan...");
  try {
    const res = await runServer(
      "tambahLiburRentang",
      currentUser.username,
      tanggalMulai,
      tanggalSelesai,
      keterangan,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("liburForm").reset();
      tutupModalLibur();
      luapkanMuatan("libur");
      muatDaftarLibur();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function hapusLiburSekarang(tanggal) {
  showConfirmModal(
    "Hapus Hari Libur",
    "Hapus hari libur tanggal " + tanggal + "?",
    "Ya, Hapus",
    function () {
      hapusLiburDenganLoading(tanggal);
    },
  );
}
async function hapusLiburDenganLoading(tanggal) {
  if (cekAksiBerjalan()) return;
  showLoading("Menghapus...");
  try {
    const res = await runServer("hapusLibur", currentUser.username, tanggal);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      luapkanMuatan("libur");
      muatDaftarLibur();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
