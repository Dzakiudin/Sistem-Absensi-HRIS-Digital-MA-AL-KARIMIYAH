/* =============================================================
   ADMIN — KELOLA AKUN
   ============================================================= */
function formatHariAktifSingkat(hariAktifStr) {
  if (!hariAktifStr) return "Setiap hari";
  const singkatan = {
    Senin: "Sen",
    Selasa: "Sel",
    Rabu: "Rab",
    Kamis: "Kam",
    Jumat: "Jum",
    Sabtu: "Sab",
    Minggu: "Min",
  };
  return String(hariAktifStr)
    .split(",")
    .map((h) => singkatan[h.trim()] || h.trim())
    .join(", ");
}

async function muatDaftarUser() {
  const tbody = document.getElementById("usersBody");
  const wrap = document.getElementById("usersBodyWrap");
  const empty = document.getElementById("usersBodyEmpty");
  try {
    const res = await runServer("getSemuaUser", currentUser.username);
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
    usersCache = res.data;
    tbody.innerHTML = res.data.map(barisUser).join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function barisUser(u) {
  return `
      <tr>
        <td data-label="Nama">${esc(u.namaLengkap)}</td>
        <td data-label="Username">${esc(u.username)}</td>
        <td data-label="Peran">${roleLabel(u.role)}</td>
        <td data-label="Hari Aktif">${u.role === "guru" ? esc(formatHariAktifSingkat(u.hariAktif)) : "-"}</td>
        <td data-label="Sergu">${u.role !== "guru" ? "-" : u.statusSergu === "Sergu" ? '<span class="badge muted">Sergu</span>' : u.statusSergu === "Non-Sergu" ? '<span class="badge ok">Non-Sergu</span>' : '<span class="badge warn">Belum diatur</span>'}</td>
        <td data-label="Status">${u.status === "Aktif" ? '<span class="badge ok">Aktif</span>' : '<span class="badge muted">Nonaktif</span>'}</td>
        <td data-label="Aksi">
          ${
            bisaKelolaUser()
              ? `
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button type="button" class="btn btn-icon" onclick="bukaModalUserById('${escJs(u.id)}')" title="Edit">${icon("pencil")}</button>
            <button type="button" class="btn btn-icon text-danger" onclick="konfirmasiHapusUser('${escJs(u.id)}')" title="Hapus">${icon("x")}</button>
          </div>`
              : "-"
          }
        </td>
      </tr>
    `;
}

function filterUserList(q) {
  const tbody = document.getElementById("usersBody");
  const wrap = document.getElementById("usersBodyWrap");
  const empty = document.getElementById("usersBodyEmpty");
  if (!tbody || !wrap || !empty) return;
  const cari = String(q == null ? "" : q)
    .trim()
    .toLowerCase();
  const base = usersCache || [];
  const list = cari
    ? base.filter((u) => {
        const kunci = [
          u.namaLengkap,
          u.username,
          u.mataPelajaran,
          roleLabelPolos(u.role),
          u.statusSergu,
          u.status,
          u.nip,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return kunci.includes(cari);
      })
    : base;
  wrap.classList.toggle("hidden", list.length === 0);
  empty.classList.toggle("hidden", list.length !== 0);
  empty.innerHTML =
    cari && list.length === 0
      ? "Tidak ada hasil untuk kata kunci &quot;" + esc(q) + "&quot;."
      : "Belum ada data guru/staf.";
  tbody.innerHTML = list.map(barisUser).join("");
}

function bukaModalUserById(id) {
  const u = usersCache.find((x) => String(x.id) === String(id));
  if (u) bukaModalUser(u);
}

function roleLabel(r) {
  if (r === "admin") return '<span class="badge muted">Admin</span>';
  if (r === "kepala") return '<span class="badge warn">Kepala</span>';
  if (r === "staf") return '<span class="badge muted">Staf</span>';
  return '<span class="badge ok">Guru</span>';
}
function roleLabelPolos(r) {
  if (r === "admin") return "Admin";
  if (r === "kepala") return "Kepala";
  if (r === "staf") return "Staf";
  return "Guru";
}

function toggleGuruFields() {
  const role = document.getElementById("userRole").value;
  const tampilkan = role === "guru";
  document
    .getElementById("userMapelGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userKelasJamGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userHariAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userStatusSerguGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userMapelAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  document
    .getElementById("userKelasAktifGroup")
    .classList.toggle("hidden", !tampilkan);
  const elPengganti = document.getElementById("userIzinkanPenggantiGroup");
  if (elPengganti)
    elPengganti.classList.toggle("hidden", role !== "guru" && role !== "staf");
}

function isiHariAktifCheckbox(hariAktifStr) {
  const terpilih = String(hariAktifStr || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  document.querySelectorAll(".userHariAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
}

function bacaHariAktifCheckbox() {
  return Array.from(document.querySelectorAll(".userHariAktifCheck:checked"))
    .map((cb) => cb.value)
    .join(",");
}

function isiMapelAktifCheckbox(mapelAktifStr) {
  const terpilih = String(mapelAktifStr || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const daftarStandar = Array.from(
    document.querySelectorAll(".userMapelAktifCheck"),
  ).map((cb) => cb.value);
  document.querySelectorAll(".userMapelAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
  // Nilai yang tidak ada di daftar checkbox standar dianggap mapel custom -> masuk kolom "Lainnya"
  const lainnya = terpilih.filter((m) => daftarStandar.indexOf(m) === -1);
  document.getElementById("userMapelAktifLainnya").value = lainnya.join(", ");
}

function bacaMapelAktifCheckbox() {
  const dariCheckbox = Array.from(
    document.querySelectorAll(".userMapelAktifCheck:checked"),
  ).map((cb) => cb.value);
  const dariLainnya = document
    .getElementById("userMapelAktifLainnya")
    .value.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return dariCheckbox.concat(dariLainnya).join(",");
}

function isiKelasAktifCheckbox(kelasAktifStr) {
  const terpilih = String(kelasAktifStr || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const daftarStandar = Array.from(
    document.querySelectorAll(".userKelasAktifCheck"),
  ).map((cb) => cb.value);
  document.querySelectorAll(".userKelasAktifCheck").forEach((cb) => {
    cb.checked = terpilih.indexOf(cb.value) !== -1;
  });
  const lainnya = terpilih.filter((k) => daftarStandar.indexOf(k) === -1);
  document.getElementById("userKelasAktifLainnya").value = lainnya.join(", ");
}

function bacaKelasAktifCheckbox() {
  const dariCheckbox = Array.from(
    document.querySelectorAll(".userKelasAktifCheck:checked"),
  ).map((cb) => cb.value);
  const dariLainnya = document
    .getElementById("userKelasAktifLainnya")
    .value.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return dariCheckbox.concat(dariLainnya).join(",");
}

// Field Mapel & Kelas berupa <select> dengan opsi "Lainnya" yang membuka input teks manual,
// supaya datanya konsisten (memudahkan filter/rekap) tapi tetap fleksibel untuk kasus khusus.
function toggleManualInput(selectId, manualId) {
  const sel = document.getElementById(selectId);
  const manual = document.getElementById(manualId);
  manual.classList.toggle("hidden", sel.value !== "__lainnya__");
}

function isiSelectAtauLainnya(selectId, manualId, value) {
  const sel = document.getElementById(selectId);
  const manual = document.getElementById(manualId);
  const val = value && value !== "-" ? value : "";
  const cocok = Array.from(sel.options).some((opt) => opt.value === val);
  if (val && cocok) {
    sel.value = val;
    manual.value = "";
    manual.classList.add("hidden");
  } else if (val) {
    sel.value = "__lainnya__";
    manual.value = val;
    manual.classList.remove("hidden");
  } else {
    sel.value = "";
    manual.value = "";
    manual.classList.add("hidden");
  }
}

function bacaSelectAtauLainnya(selectId, manualId) {
  const sel = document.getElementById(selectId);
  if (sel.value === "__lainnya__")
    return document.getElementById(manualId).value.trim();
  return sel.value;
}

let __masterKelasCache = null;
let __masterMapelCache = null;

async function ambilDaftarMasterKelasDanMapel() {
  // 1. Ambil daftar kelas aktif dari database (madrasah_kelas)
  let daftarKelas = [];
  try {
    if (!__masterKelasCache) {
      const res = await runServer(
        "getDaftarKelas",
        currentUser ? currentUser.username : "",
      );
      if (res && res.data) {
        __masterKelasCache = res.data;
      }
    }
    if (__masterKelasCache && __masterKelasCache.length) {
      daftarKelas = __masterKelasCache
        .filter((k) => k.isActive !== false)
        .map((k) => k.kodeKelas || k.namaKelas)
        .filter(Boolean);
    }
  } catch (e) {
    daftarKelas = [];
  }

  // Fallback kelas jika madrasah_kelas belum ada data
  if (!daftarKelas.length) {
    daftarKelas = [
      "VII-A",
      "VII-B",
      "VII-C",
      "VII-D",
      "VII-E",
      "VIII-A",
      "VIII-B",
      "VIII-C",
      "VIII-D",
      "VIII-E",
      "IX-A",
      "IX-B",
      "IX-C",
      "IX-D",
      "IX-E",
    ];
  }

  // Urutkan kelas secara rapi
  daftarKelas = Array.from(new Set(daftarKelas)).sort((a, b) => {
    const keyA = typeof kelasSortKey === "function" ? kelasSortKey(a) : 9999;
    const keyB = typeof kelasSortKey === "function" ? kelasSortKey(b) : 9999;
    if (keyA !== keyB) return keyA - keyB;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  // 2. Ambil daftar mata pelajaran dari Master Data Mapel (madrasah_mapel).
  //    Ini satu-satunya sumber opsi mapel; mapel nonaktif tidak ditampilkan.
  let daftarMapel = [];
  try {
    if (!__masterMapelCache) {
      const res = await runServer(
        "getDaftarMapel",
        currentUser ? currentUser.username : "",
      );
      if (res && res.data) __masterMapelCache = res.data;
    }
    if (__masterMapelCache && __masterMapelCache.length) {
      daftarMapel = __masterMapelCache
        .filter((m) => m.aktif !== false)
        .map((m) => m.nama)
        .filter(Boolean);
      // Deduplikasi pertahankan urutan master
      daftarMapel = Array.from(new Set(daftarMapel));
    }
  } catch (e) {
    daftarMapel = [];
  }

  // Fallback HANYA jika master mapel benar-benar belum ada data
  if (!daftarMapel.length) {
    daftarMapel = [
      "Al-Qur'an Hadits",
      "Akidah Akhlak",
      "Aswaja",
      "Fiqih",
      "Sejarah Kebudayaan Islam (SKI)",
      "Bahasa Arab",
      "Nahwu",
      "PPKn",
      "Bahasa Indonesia",
      "Matematika",
      "IPA",
      "IPS",
      "Bahasa Inggris",
      "Seni Budaya",
      "PJOK",
      "Prakarya",
      "Informatika",
      "Bahasa Daerah",
    ];
  }

  return { daftarKelas, daftarMapel };
}

async function renderOpsiDinamisUserModal(u) {
  const { daftarKelas, daftarMapel } = await ambilDaftarMasterKelasDanMapel();

  // Pastikan kelas dan mapel milik user (meskipun kustom/lama) tetap ada di daftar opsi
  const kelasList = Array.from(daftarKelas);
  if (u && u.kelas && u.kelas !== "-" && !kelasList.includes(u.kelas)) {
    kelasList.push(u.kelas);
  }
  if (u && u.kelasAktif) {
    u.kelasAktif.split(",").forEach((k) => {
      const kTrim = k.trim();
      if (kTrim && !kelasList.includes(kTrim)) kelasList.push(kTrim);
    });
  }

  const mapelList = Array.from(daftarMapel);
  if (
    u &&
    u.mataPelajaran &&
    u.mataPelajaran !== "-" &&
    !mapelList.includes(u.mataPelajaran)
  ) {
    mapelList.push(u.mataPelajaran);
  }
  if (u && u.mapelAktif) {
    u.mapelAktif.split(",").forEach((m) => {
      const mTrim = m.trim();
      if (mTrim && !mapelList.includes(mTrim)) mapelList.push(mTrim);
    });
  }

  // 1. Render Dropdown #userMapel
  const userMapelSel = document.getElementById("userMapel");
  if (userMapelSel) {
    let optHtml = '<option value="">- Pilih Mata Pelajaran -</option>';
    mapelList.forEach((m) => {
      optHtml += `<option value="${esc(m)}">${esc(m)}</option>`;
    });
    optHtml += '<option value="__lainnya__">Lainnya (ketik manual)...</option>';
    userMapelSel.innerHTML = optHtml;
  }

  // 2. Render Dropdown #userKelas
  const userKelasSel = document.getElementById("userKelas");
  if (userKelasSel) {
    let optHtml = '<option value="">- Pilih Kelas -</option>';
    kelasList.forEach((k) => {
      optHtml += `<option value="${esc(k)}">${esc(k)}</option>`;
    });
    optHtml += '<option value="__lainnya__">Lainnya (ketik manual)...</option>';
    userKelasSel.innerHTML = optHtml;
  }

  // 3. Render Checkboxes #userMapelAktifCheckboxes
  const mapelCbContainer = document.getElementById("userMapelAktifCheckboxes");
  if (mapelCbContainer) {
    mapelCbContainer.innerHTML = mapelList
      .map((m) => {
        return `<label><input type="checkbox" class="userMapelAktifCheck" value="${esc(m)}">${esc(m)}</label>`;
      })
      .join("");
  }

  // 4. Render Checkboxes #userKelasAktifCheckboxes
  const kelasCbContainer = document.getElementById("userKelasAktifCheckboxes");
  if (kelasCbContainer) {
    kelasCbContainer.innerHTML = kelasList
      .map((k) => {
        return `<label><input type="checkbox" class="userKelasAktifCheck" value="${esc(k)}">${esc(k)}</label>`;
      })
      .join("");
  }
}

async function bukaModalUser(u) {
  document.getElementById("userForm").reset();
  await renderOpsiDinamisUserModal(u);
  if (u) {
    document.getElementById("userModalTitle").textContent = "Edit Akun";
    document.getElementById("userId").value = u.id;
    document.getElementById("userUsername").value = u.username;
    document.getElementById("userUsername").disabled = false;
    document.getElementById("userPassword").placeholder =
      "Kosongkan jika tidak diubah";
    document.getElementById("userPassword").required = false;
    document.getElementById("userNamaLengkap").value = u.namaLengkap;
    document.getElementById("userRole").value = u.role;
    isiSelectAtauLainnya("userMapel", "userMapelManual", u.mataPelajaran);
    isiSelectAtauLainnya("userKelas", "userKelasManual", u.kelas);
    document.getElementById("userJamKe").value =
      u.jamKe && u.jamKe !== "-" ? u.jamKe : "";
    isiHariAktifCheckbox(u.hariAktif);
    document.getElementById("userStatusSergu").value = u.statusSergu || "";
    isiMapelAktifCheckbox(u.mapelAktif);
    isiKelasAktifCheckbox(u.kelasAktif);
    document.getElementById("userNoHp").value = u.noHp === "-" ? "" : u.noHp;
    document.getElementById("userStatus").value = u.status;
    const elIzinPengganti = document.getElementById("userIzinkanPengganti");
    if (elIzinPengganti) elIzinPengganti.checked = !!u.izinkanGuruPengganti;
  } else {
    document.getElementById("userModalTitle").textContent = "Tambah Akun";
    document.getElementById("userId").value = "";
    document.getElementById("userUsername").disabled = false;
    document.getElementById("userPassword").placeholder = "Minimal 6 karakter";
    document.getElementById("userPassword").required = true;
    document.getElementById("userRole").value = "guru";
    document.getElementById("userStatus").value = "Aktif";
    isiSelectAtauLainnya("userMapel", "userMapelManual", "");
    isiSelectAtauLainnya("userKelas", "userKelasManual", "");
    isiHariAktifCheckbox("");
    document.getElementById("userStatusSergu").value = "";
    isiMapelAktifCheckbox("");
    isiKelasAktifCheckbox("");
    const elIzinPengganti = document.getElementById("userIzinkanPengganti");
    if (elIzinPengganti) elIzinPengganti.checked = false;
  }
  toggleGuruFields();
  document.getElementById("userModal").classList.remove("hidden");
}

async function handleSimpanUser(e) {
  e.preventDefault();
  const id = document.getElementById("userId").value;
  const usernameVal = document.getElementById("userUsername").value.trim();
  const namaLengkapVal = document
    .getElementById("userNamaLengkap")
    .value.trim();
  const passwordVal = document.getElementById("userPassword").value;
  const isEdit = !!id;
  if (!usernameVal) {
    showToast("Username wajib diisi", "error");
    return;
  }
  if (!namaLengkapVal) {
    showToast("Nama lengkap wajib diisi", "error");
    return;
  }
  if (!isEdit && !passwordVal) {
    showToast("Password wajib diisi untuk akun baru", "error");
    return;
  }
  const payload = {
    requestedBy: currentUser.username,
    id: id,
    username: usernameVal,
    password: passwordVal,
    namaLengkap: namaLengkapVal,
    role: document.getElementById("userRole").value,
    mataPelajaran: bacaSelectAtauLainnya("userMapel", "userMapelManual"),
    kelas: bacaSelectAtauLainnya("userKelas", "userKelasManual"),
    jamKe: document.getElementById("userJamKe").value,
    hariAktif: bacaHariAktifCheckbox(),
    statusSergu: document.getElementById("userStatusSergu").value,
    mapelAktif: bacaMapelAktifCheckbox(),
    kelasAktif: bacaKelasAktifCheckbox(),
    noHp: document.getElementById("userNoHp").value.trim(),
    status: document.getElementById("userStatus").value,
    izinkanGuruPengganti: document.getElementById("userIzinkanPengganti")
      ? document.getElementById("userIzinkanPengganti").checked
      : false,
  };
  if (cekAksiBerjalan()) return;
  showLoading("Menyimpan akun...");
  try {
    const res = id
      ? await runServer("updateUser", payload)
      : await runServer("tambahUser", payload);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("userModal").classList.add("hidden");
      daftarGuruCache = [];
      luapkanMuatan("users");
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

function konfirmasiHapusUser(id) {
  const u = usersCache.find((x) => String(x.id) === String(id));
  const nama = u ? u.namaLengkap : "akun ini";
  showConfirmModal(
    "Hapus Akun",
    'Yakin ingin menghapus akun "' +
      nama +
      '" secara permanen? Tindakan ini tidak dapat dibatalkan.',
    "Ya, Hapus",
    function () {
      hapusUserSekarang(id);
    },
  );
}
async function hapusUserSekarang(id) {
  showLoading("Menghapus akun...");
  try {
    const res = await runServer("hapusUser", currentUser.username, id);
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      daftarGuruCache = [];
      luapkanMuatan("users");
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}

/* =============================================================
   ADMIN — IMPOR AKUN GURU MASSAL
   ============================================================= */
function bukaModalImpor() {
  __modalOpen(
    "Impor Akun Guru Massal",
    '<div style="font-size:12px;color:#475569;margin-bottom:10px;line-height:1.7;">' +
      "<b>Langkah:</b><br>" +
      "1. Klik <b>Unduh Template Excel</b> untuk mendapat berkas contoh berwarna.<br>" +
      "2. Isi data guru di Excel (wajib: <b>Nama Lengkap</b> saja, username &amp; password otomatis jika kosong).<br>" +
      "3. Simpan berkas, lalu unggah di sini." +
      "</div>" +
      '<label for="mImporFileGuru" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--brand-emerald-500);border-radius:12px;padding:24px 12px;background:var(--brand-emerald-50);cursor:pointer;text-align:center;">' +
      '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="var(--brand-emerald-800)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
      '<span style="font-size:13px;font-weight:700;color:var(--brand-emerald-800);">Klik untuk pilih berkas Excel</span>' +
      '<span id="mImporNamaGuru" style="font-size:12px;color:#64748b;">Mendukung .xlsx, .xls, dan .csv</span>' +
      "</label>" +
      '<input type="file" id="mImporFileGuru" accept=".xlsx,.xls,.csv" style="display:none;">' +
      '<div id="mImporInfoGuru" style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.6;"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;">' +
      '<button type="button" style="background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;" onclick="unduhTemplateGuru()">Unduh Template Excel</button>' +
      '<span style="font-size:11px;color:#94a3b8;">Baris pertama = judul kolom, dilewati saat impor.</span>' +
      "</div>" +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">' +
      __btnSekunder("Batal", "__modalClose()") +
      __btnUtama("Impor", "handleProsesImpor()") +
      "</div>" +
      '<div id="importHasil" class="hidden" style="margin-top:16px;"></div>',
    520,
  );
  window.__daftarImporGuru = [];
  var fi = document.getElementById("mImporFileGuru");
  fi.onchange = function () {
    pilihFileImporGuru(fi.files && fi.files[0] ? fi.files[0] : null);
  };
}
function pilihFileImporGuru(file) {
  var info = document.getElementById("mImporInfoGuru");
  var nama = document.getElementById("mImporNamaGuru");
  if (!file) {
    window.__daftarImporGuru = [];
    if (info) {
      info.style.display = "none";
      info.innerHTML = "";
    }
    if (nama) {
      nama.textContent = "Mendukung .xlsx, .xls, dan .csv";
    }
    return;
  }
  if (nama) {
    nama.textContent = file.name.concat(
      " (",
      (file.size / 1024).toFixed(1),
      " KB)",
    );
  }
  if (typeof XLSX === "undefined") {
    __pasangXLSX().then(
      function () {
        pilihFileImporGuru(file);
      },
      function () {
        showToast(
          "Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.",
          "error",
        );
      },
    );
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), {
        type: "array",
        cellDates: true,
        raw: true,
      });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        cellDates: true,
        defval: "",
      });
      var daftar = [];
      for (var i = 1; i < rows.length; i++) {
        var k = rows[i] || [];
        var kosong = true;
        for (var c = 0; c < 10; c++) {
          if (String(k[c] == null ? "" : k[c]).trim() !== "") {
            kosong = false;
            break;
          }
        }
        if (kosong) continue;
        var nm = String(k[0] == null ? "" : k[0]).trim();
        if (!nm) continue;
        daftar.push({
          namaLengkap: nm,
          username: String(k[1] == null ? "" : k[1]).trim(),
          password: String(k[2] == null ? "" : k[2]).trim(),
          nipNuptk: String(k[3] == null ? "" : k[3]).trim(),
          mataPelajaran: String(k[4] == null ? "" : k[4]).trim(),
          kelas: String(k[5] == null ? "" : k[5]).trim(),
          jamKe: String(k[6] == null ? "" : k[6]).trim(),
          noHp: String(k[7] == null ? "" : k[7]).trim(),
          gelar: String(k[8] == null ? "" : k[8]).trim(),
          statusKepegawaian: String(k[9] == null ? "" : k[9]).trim(),
        });
      }
      window.__daftarImporGuru = daftar;
      if (info) {
        info.style.display = "block";
        if (daftar.length) {
          info.style.background = "var(--brand-emerald-50)";
          info.style.color = "var(--brand-emerald-800)";
          info.style.border = "1px solid var(--brand-emerald-200)";
          info.innerHTML =
            "<b>" + daftar.length + "</b> data guru siap diimpor.";
        } else {
          info.style.background = "#fff1f2";
          info.style.color = "#9f1239";
          info.style.border = "1px solid #fecdd3";
          info.innerHTML =
            "File tidak berisi data guru yang valid (baris 2 dst. kosong).";
        }
      }
    } catch (err) {
      if (info) {
        info.style.display = "block";
        info.style.background = "#fff1f2";
        info.style.color = "#9f1239";
        info.style.border = "1px solid #fecdd3";
        info.innerHTML = "Gagal membaca berkas: " + esc(err.message);
      }
    }
  };
  reader.readAsArrayBuffer(file);
}
async function handleProsesImpor() {
  var daftarGuru = window.__daftarImporGuru;
  if (!daftarGuru || !daftarGuru.length) {
    showToast("Pilih file Excel berisi data guru terlebih dahulu", "error");
    return;
  }
  showLoading("Memproses impor...");
  try {
    var res = await runServer(
      "imporGuruMassal",
      currentUser.username,
      daftarGuru,
    );
    hideLoading();
    showToast(res.message, res.success ? "success" : "error");
    if (res.success) {
      var hasilEl = document.getElementById("importHasil");
      var html = "";
      if (res.kredensial && res.kredensial.length) {
        var tabel =
          '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">' +
          '<tr style="background:var(--brand-emerald-600);color:#fff;"><th style="padding:6px 10px;text-align:left;">Nama</th><th style="padding:6px 10px;text-align:left;">Username</th><th style="padding:6px 10px;text-align:left;">Password</th></tr>';
        var teksKredensial = [];
        for (var i = 0; i < res.kredensial.length; i++) {
          var kr = res.kredensial[i];
          var bg = i % 2 === 0 ? "#FEF9C3" : "#F0F9FF";
          tabel +=
            '<tr style="background:' +
            bg +
            ';"><td style="padding:5px 10px;">' +
            esc(kr.nama) +
            '</td><td style="padding:5px 10px;font-family:monospace;">' +
            esc(kr.username) +
            '</td><td style="padding:5px 10px;font-family:monospace;">' +
            esc(kr.password) +
            "</td></tr>";
          teksKredensial.push(
            kr.nama + " | " + kr.username + " | " + kr.password,
          );
        }
        tabel += "</table>";
        html +=
          '<p style="font-weight:700;margin-bottom:6px;color:var(--success);">Berhasil ditambahkan (' +
          res.kredensial.length +
          "):</p>";
        html += tabel;
        html +=
          '<button type="button" class="btn btn-outline btn-block" style="margin-top:10px;" onclick="salinKredensialGuru()">Salin Daftar Username &amp; Password</button>';
        window.__teksKredensialGuru = teksKredensial.join("\n");
      }
      if (res.gagal && res.gagal.length) {
        html +=
          '<p style="font-weight:700; margin-bottom:6px; margin-top:14px; color:var(--danger);">Dilewati (' +
          res.gagal.length +
          '):</p><ul style="margin:0 0 0 18px; font-size:13px; line-height:1.6; color:var(--danger);">' +
          res.gagal
            .map(function (g) {
              return "<li>" + esc(g) + "</li>";
            })
            .join("") +
          "</ul>";
      }
      hasilEl.innerHTML = html;
      hasilEl.classList.remove("hidden");
      daftarGuruCache = [];
      muatDaftarUser();
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, "error");
  }
}
function salinKredensialGuru() {
  var teks = window.__teksKredensialGuru || "";
  if (!teks) {
    showToast("Tidak ada data kredensial", "error");
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(teks)
      .then(function () {
        showToast("Daftar kredensial berhasil disalin!", "success");
      })
      .catch(function () {
        fallbackSalin(teks);
      });
  } else {
    fallbackSalin(teks);
  }
}
function fallbackSalin(teks) {
  var ta = document.createElement("textarea");
  ta.value = teks;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Daftar kredensial berhasil disalin!", "success");
  } catch (e) {
    showToast("Gagal menyalin, coba manual", "error");
  }
  document.body.removeChild(ta);
}
