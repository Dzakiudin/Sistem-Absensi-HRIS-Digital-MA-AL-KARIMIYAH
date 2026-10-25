/* ================================================================
   MODUL SISWA & PRESENSI SISWA
   ================================================================ */
function escH(v) {
  return String(v == null || v === "<nil>" ? "" : v).replace(
    /[&<>"']/g,
    function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    },
  );
}
function __pad2(n) {
  return String(n).padStart(2, "0");
}
function __tglIndo(v) {
  var r = String(v || "").split("-");
  return r.length === 3 ? r[2] + "/" + r[1] + "/" + r[0] : "";
}
function __tglISO(indo) {
  var r = String(indo || "").split("/");
  return r.length === 3 ? r[2] + "-" + r[1] + "-" + r[0] : String(indo || "");
}
function __tglTodayISO() {
  var d = new Date();
  return (
    d.getFullYear() + "-" + __pad2(d.getMonth() + 1) + "-" + __pad2(d.getDate())
  );
}
function __bulanAwalISO() {
  var d = new Date();
  return d.getFullYear() + "-" + __pad2(d.getMonth() + 1) + "-01";
}
function __bulanAkhirISO() {
  var d = new Date();
  return (
    d.getFullYear() +
    "-" +
    __pad2(d.getMonth() + 1) +
    "-" +
    __pad2(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  );
}
function __hariIndo(iso) {
  var d = iso ? new Date(iso + "T00:00:00") : new Date();
  return d.toLocaleDateString("id-ID", { weekday: "long" }).toUpperCase();
}
function __badge(txt, kind) {
  var bg = "rgba(99, 102, 241, 0.15)",
    fg = "#818cf8",
    bd = "rgba(99, 102, 241, 0.3)";
  if (kind === "green") {
    bg = "rgba(16, 185, 129, 0.15)";
    fg = "#34d399";
    bd = "rgba(52, 211, 153, 0.3)";
  }
  if (kind === "muted") {
    bg = "rgba(148, 163, 184, 0.15)";
    fg = "var(--slate)";
    bd = "rgba(148, 163, 184, 0.3)";
  }
  if (kind === "red") {
    bg = "rgba(244, 63, 94, 0.15)";
    fg = "#fb7185";
    bd = "rgba(251, 113, 133, 0.3)";
  }
  return (
    '<span style="background:' +
    bg +
    ";color:" +
    fg +
    ";border:1px solid " +
    bd +
    ';padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;display:inline-block;">' +
    txt +
    "</span>"
  );
}
function __btnUtama(l, o, x) {
  return (
    '<button type="button" style="background:var(--brand-emerald-600);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;' +
    (x || "") +
    '" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnSekunder(l, o, x) {
  return (
    '<button type="button" style="background:var(--parchment-alt);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px;' +
    (x || "") +
    '" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnBahaya(l, o) {
  return (
    '<button type="button" style="background:rgba(239,68,68,0.12);color:#fb7185;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:12px;" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __btnPending(l, o) {
  return (
    '<button type="button" style="background:#f59e0b;color:#fff;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:12px;" onclick="' +
    o +
    '">' +
    l +
    "</button>"
  );
}
function __inp(id, v) {
  return (
    '<input id="' +
    id +
    '" value="' +
    escH(v == null ? "" : v) +
    '" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:var(--parchment-alt);color:var(--ink);box-sizing:border-box;">'
  );
}
function __label(t) {
  return (
    '<div style="font-size:12px;color:var(--slate);margin-bottom:4px;font-weight:600;">' +
    t +
    "</div>"
  );
}
function __spinner() {
  return '<div style="padding:26px;text-align:center;color:var(--slate-light);font-size:13px;">Memuat...</div>';
}
function __kosong(msg) {
  return (
    '<div style="padding:26px;text-align:center;color:var(--slate-light);font-size:13px;">' +
    (msg || "Tidak ada data.") +
    "</div>"
  );
}
function __errBox(msg) {
  return (
    '<div class="card" style="padding:20px;"><div style="padding:12px;text-align:center;color:#fb7185;font-size:13px;">' +
    escH(msg || "Gagal memuat data") +
    "</div></div>"
  );
}
function __modalOpen(titel, body, dialogClass) {
  var isRosterModal = dialogClass === "presensi-roster";
  var ov = document.createElement("div");
  ov.setAttribute("data-ov", "1");
  if (isRosterModal) ov.className = "presensi-roster-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", titel || "Dialog");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;z-index:3000;padding:max(8px, 1.5vw);backdrop-filter:blur(4px);";
  var modalHeader = isRosterModal
    ? '<div class="presensi-roster-modal-header">' +
      '<h2 id="__modalTtl" class="presensi-roster-modal-title">' +
      titel +
      "</h2>" +
      '<button type="button" class="js-modal-x presensi-roster-modal-close" aria-label="Tutup">&times;</button>' +
      "</div>"
    : '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2;">' +
      '<h2 id="__modalTtl" style="margin:0;font-size:16px;font-weight:700;color:var(--ink);">' +
      titel +
      "</h2>" +
      '<button type="button" class="js-modal-x" aria-label="Tutup" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--slate);line-height:1;">&times;</button>' +
      "</div>";
  var modalBodyClass = isRosterModal ? "presensi-roster-body" : "";
  var modalBodyStyle = isRosterModal
    ? ""
    : ' style="padding:14px 16px;color:var(--ink);overflow-y:auto;flex:1;min-height:0;"';
  var modalBoxClass =
    "modal-box no-scrollbar" +
    (isRosterModal ? " presensi-roster-box" : "");
  ov.innerHTML =
    '<div class="' +
    modalBoxClass +
    '" style="background:var(--surface);border:1px solid var(--line);border-radius:16px;max-width:620px;width:100%;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-xl);">' +
    modalHeader +
    '<div class="' +
    modalBodyClass +
    '" data-modal-body role="region" aria-labelledby="__modalTtl"' +
    modalBodyStyle +
    ">" +
    body +
    "</div></div>";
  document.body.appendChild(ov);
  // Simpan titik fokus lama utk dipulihkan saat modal ditutup.
  var fokusSebelum = document.activeElement;
  ov.querySelector(".js-modal-x").addEventListener("click", function () {
    __modalClose();
    if (fokusSebelum && fokusSebelum.focus) fokusSebelum.focus();
  });
  window.__modalOv = ov;
  window.__modalPrevFocus = fokusSebelum;
  // Pindahkan fokus ke dalam modal.
  var fSelektor =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  var fTarget = ov.querySelector(fSelektor);
  if (fTarget) fTarget.focus();
  return ov;
}
function __modalBody() {
  var ov = window.__modalOv;
  return ov ? ov.querySelector("[data-modal-body]") : null;
}
function __modalClose() {
  var ov = window.__modalOv;
  if (ov) {
    var prev = window.__modalPrevFocus;
    ov.remove();
    window.__modalOv = null;
    window.__modalPrevFocus = null;
    if (prev && prev.focus && document.contains(prev)) prev.focus();
  }
}

// Konfirmasi aksi bergaya internal (menggantikan confirm() native yang tampil
// tidak konsisten dengan design system & memblokir interaksi). onYa dipanggil
// hanya jika pengguna menekan tombol ya. gayaYa: 'danger' | 'primary'.
function showConfirmModal(titel, pesan, labelYa, onYa, gayaYa) {
  if (window.__confirmOv) return;
  var ov = document.createElement("div");
  ov.setAttribute("data-ov", "1");
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", titel || "Konfirmasi");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;z-index:3100;padding:12px;backdrop-filter:blur(4px);";
  ov.innerHTML =
    '<div class="modal-box no-scrollbar" style="background:var(--surface);border:1px solid var(--line);border-radius:16px;max-width:430px;width:100%;box-shadow:var(--shadow-xl);">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);">' +
    '<h2 id="__confirmTtl" style="margin:0;font-size:15px;font-weight:700;color:var(--ink);">' +
    esc(titel || "Konfirmasi") +
    "</h2>" +
    '<button type="button" class="js-confirm-x" aria-label="Tutup" style="border:none;background:none;font-size:22px;cursor:pointer;color:var(--slate);line-height:1;">&times;</button>' +
    "</div>" +
    '<div role="region" aria-labelledby="__confirmTtl" style="padding:18px;color:var(--ink);font-size:13.5px;line-height:1.6;white-space:pre-line;">' +
    esc(pesan) +
    "</div>" +
    '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);">' +
    '<button type="button" class="btn btn-outline js-confirm-no">Batal</button>' +
    '<button type="button" class="btn ' +
    (gayaYa === "primary" ? "btn-primary" : "btn-danger") +
    ' js-confirm-yes">' +
    esc(labelYa || "Ya") +
    "</button>" +
    "</div></div>";
  document.body.appendChild(ov);
  window.__confirmOv = ov;
  function tutup(hasil) {
    ov.remove();
    window.__confirmOv = null;
    if (hasil && typeof onYa === "function") onYa();
  }
  ov.querySelector(".js-confirm-x").addEventListener("click", function () {
    tutup(false);
  });
  ov.querySelector(".js-confirm-no").addEventListener("click", function () {
    tutup(false);
  });
  ov.querySelector(".js-confirm-yes").addEventListener("click", function () {
    tutup(true);
  });
  ov.addEventListener("click", function (e) {
    if (e.target === ov) tutup(false);
  });
  var noBtn = ov.querySelector(".js-confirm-no");
  if (noBtn) noBtn.focus();
}
