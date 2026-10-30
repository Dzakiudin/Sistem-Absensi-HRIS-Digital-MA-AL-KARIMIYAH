/* =============================================================
   ADMIN + KEPALA — GRAFIK & ANALITIK STATISTIK (IMK OPTIMIZED)
   ============================================================= */
function showChartTooltip(e, title, items) {
  let tip = document.getElementById("chartFloatingTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "chartFloatingTooltip";
    tip.className = "chart-floating-tooltip hidden";
    document.body.appendChild(tip);
  }
  let html = `<div class="tip-header"><span>${esc(title)}</span><button type="button" class="tip-close" aria-label="Tutup detail kehadiran" onclick="hideChartTooltip()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>`;
  items.forEach((it) => {
    html += `<div class="tip-row"><span style="display:flex; align-items:center;"><span class="tip-dot" style="background:${it.color};"></span>${esc(it.label)}</span><strong>${esc(String(it.value))}</strong></div>`;
  });
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  moveChartTooltip(e);
}

function moveChartTooltip(e) {
  const tip = document.getElementById("chartFloatingTooltip");
  if (!tip || tip.classList.contains("hidden")) return;
  const pageX = e.pageX || (e.touches && e.touches[0] ? e.touches[0].pageX : 0);
  const pageY = e.pageY || (e.touches && e.touches[0] ? e.touches[0].pageY : 0);
  const tipRect = tip.getBoundingClientRect();
  const x = Math.max(
    10,
    Math.min(pageX + 14, window.innerWidth - tipRect.width - 20),
  );
  const y = Math.max(10, pageY - tipRect.height - 12);
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

function hideChartTooltip() {
  const tip = document.getElementById("chartFloatingTooltip");
  if (tip) tip.classList.add("hidden");
}

function handleBarHover(e, el) {
  try {
    const raw = el.getAttribute("data-tip");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    showChartTooltip(e, parsed.title, parsed.items);
  } catch (err) {}
}

function renderGrafikTrenMingguan(containerId, dataTren) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(dataTren) || !dataTren.length) {
    el.innerHTML =
      '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:12.5px;">Data tren mingguan belum tersedia</div>';
    return;
  }

  // Simpan data untuk re-render saat resize jendela / perubahan lebar kartu
  el.__trenData = dataTren;
  if (!el.__resizeObserver && typeof ResizeObserver !== "undefined") {
    el.__resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        const newH = Math.round(entry.contentRect.height);
        if (
          newW > 0 &&
          (Math.abs(newW - (el.__lastW || 0)) > 6 ||
            Math.abs(newH - (el.__lastH || 0)) > 6)
        ) {
          el.__lastW = newW;
          el.__lastH = newH;
          if (el.__trenData && el.isConnected) {
            renderGrafikTrenMingguan(containerId, el.__trenData);
          }
        }
      }
    });
    el.__resizeObserver.observe(el);
  }

  const rect = el.getBoundingClientRect();
  const clientW = Math.round(rect.width) || el.clientWidth || 640;
  const svgW = Math.max(380, clientW);
  const svgH = Math.max(220, Math.round(rect.height));
  const padTop = 26;
  const padBottom = 38;
  const chartH = svgH - padTop - padBottom;

  const padLeft = 44;
  const padRight = 16;
  const availW = Math.max(100, svgW - padLeft - padRight);

  // Responsif: hitung berapa bar yang muat berdasarkan rasio/lebar container (tiap kolom ~46px)
  const minColW = 46;
  const maxBars = Math.max(3, Math.floor(availW / minColW));

  // Tampilkan data seadanya yang muat di kartu (potong dari masa lalu jika melebihi kapasitas)
  const visibleData =
    dataTren.length > maxBars ? dataTren.slice(-maxBars) : dataTren;

  let maxVal = 1;
  visibleData.forEach((d) => {
    if (d.totalGuru > maxVal) maxVal = d.totalGuru;
    if (d.hadir > maxVal) maxVal = d.hadir;
  });

  const n = visibleData.length;
  // Distribusikan bar merata memenuhi lebar kartu sehingga tidak ada ruang kosong tersisa
  const colW = availW / Math.max(1, n);
  const barW = Math.min(40, Math.max(18, Math.round(colW * 0.54)));

  let gridLines = "";
  [0, 0.5, 1].forEach((pct) => {
    const yPos = padTop + chartH * (1 - pct);
    const labelVal = Math.round(maxVal * pct);
    gridLines += `
      <line x1="${padLeft - 8}" y1="${yPos}" x2="${svgW - padRight}" y2="${yPos}" stroke="#e2e8f0" stroke-dasharray="4,4" stroke-width="1" />
      <text x="${padLeft - 14}" y="${yPos + 4}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="end">${labelVal}</text>
    `;
  });

  let barsHtml = "";
  visibleData.forEach((d, i) => {
    const cx = padLeft + i * colW + colW / 2;
    const x = Math.round(cx - barW / 2);

    const tepatH = Math.round((d.tepatWaktu / maxVal) * chartH);
    const lambatH = Math.round((d.terlambat / maxVal) * chartH);
    const izinH = Math.round((d.izin / maxVal) * chartH);

    const baseBottom = padTop + chartH;
    const yTepat = baseBottom - tepatH;
    const yLambat = yTepat - lambatH;
    const yIzin = yLambat - izinH;
    const yTop = tepatH + lambatH + izinH > 0 ? yIzin : baseBottom;

    const activeHadir = d.hadir || 0;
    const isToday = i === n - 1;
    const persenBadge = d.persenHadir != null ? d.persenHadir + "%" : "0%";

    const tipData = JSON.stringify({
      title: `${d.hari}, ${d.tanggal}`,
      items: [
        {
          label: "Tepat Waktu",
          value: `${d.tepatWaktu} guru`,
          color: "#10b981",
        },
        { label: "Terlambat", value: `${d.terlambat} guru`, color: "#f59e0b" },
        { label: "Izin / Sakit", value: `${d.izin} guru`, color: "#3b82f6" },
        {
          label: "Belum Presensi",
          value: `${d.belumAbsen} guru`,
          color: "#ef4444",
        },
        {
          label: "Total Kehadiran",
          value: `${persenBadge} (${activeHadir}/${d.totalGuru})`,
          color: "#059669",
        },
      ],
    }).replace(/"/g, "&quot;");

    barsHtml += `
      <g class="tren-bar-group" data-tip="${tipData}" onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)">
        <!-- Stacked Segments -->
        ${tepatH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yTepat}" width="${barW}" height="${tepatH}" rx="${lambatH === 0 && izinH === 0 ? 7 : 3}" fill="#10b981" />` : ""}
        ${lambatH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yLambat}" width="${barW}" height="${lambatH}" rx="${izinH === 0 ? 7 : 3}" fill="#f59e0b" />` : ""}
        ${izinH > 0 ? `<rect class="tren-bar-front" x="${x}" y="${yIzin}" width="${barW}" height="${izinH}" rx="7" fill="#3b82f6" />` : ""}
        <!-- Value Badge Above Bar -->
        <text x="${cx}" y="${yTop - 6}" font-size="11" font-weight="700" fill="${isToday ? "#34d399" : activeHadir > 0 ? "var(--ink)" : "var(--slate-light)"}" text-anchor="middle">${activeHadir > 0 ? persenBadge : "-"}</text>
        <!-- Day & Date Label -->
        <text x="${cx}" y="${svgH - 20}" font-size="11.5" font-weight="${isToday ? "800" : "600"}" fill="${isToday ? "#34d399" : "var(--ink)"}" text-anchor="middle">${esc(d.hari.substring(0, 3))}</text>
        <text x="${cx}" y="${svgH - 6}" font-size="9.5" font-weight="500" fill="#94a3b8" text-anchor="middle">${esc(d.tanggal.substring(0, 5))}</text>
        ${isToday ? `<circle cx="${cx}" cy="${svgH - 1}" r="2" fill="#10b981" />` : ""}
      </g>
    `;
  });

  el.innerHTML = `
    <svg class="tren-chart-svg" viewBox="0 0 ${svgW} ${svgH}" style="width:100%; height:${svgH}px; display:block;">
      ${gridLines}
      ${barsHtml}
    </svg>
  `;
}

function renderGrafikLineKehadiran(containerId, dataTren, avgBadgeId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(dataTren) || !dataTren.length) {
    el.innerHTML =
      '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:12.5px;">Data tren kehadiran belum tersedia</div>';
    return;
  }

  // Simpan referensi data dan badge untuk re-render responsif saat jendela di-resize
  el.__trenData = dataTren;
  el.__avgBadgeId = avgBadgeId;
  if (!el.__resizeObserver && typeof ResizeObserver !== "undefined") {
    el.__resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        if (newW > 0 && Math.abs(newW - (el.__lastW || 0)) > 6) {
          el.__lastW = newW;
          if (el.__trenData && el.isConnected) {
            renderGrafikLineKehadiran(
              containerId,
              el.__trenData,
              el.__avgBadgeId,
            );
          }
        }
      }
    });
    el.__resizeObserver.observe(el);
  }

  const rect = el.getBoundingClientRect();
  const clientW = Math.round(rect.width) || el.clientWidth || 640;
  const svgW = Math.max(340, clientW);
  const svgH = 185;
  const padTop = 24;
  const padBottom = 34;
  const padLeft = 44;
  const padRight = 32;
  const chartW = svgW - padLeft - padRight;
  const chartH = svgH - padTop - padBottom;
  const baseBottom = padTop + chartH;

  // Responsif: tentukan jumlah data point berdasarkan lebar kartu
  const minPtDist = 48;
  const maxPts = Math.max(3, Math.floor(chartW / minPtDist));
  const visibleData =
    dataTren.length > maxPts ? dataTren.slice(-maxPts) : dataTren;
  const n = visibleData.length;

  // Hitung rata-rata persentase kehadiran
  let totalPersen = 0;
  visibleData.forEach((d) => {
    totalPersen += d.persenHadir || 0;
  });
  const avgPersen = n > 0 ? Math.round(totalPersen / n) : 0;
  if (avgBadgeId) {
    const badgeEl = document.getElementById(avgBadgeId);
    if (badgeEl) badgeEl.textContent = `Rata-rata: ${avgPersen}%`;
  }

  // Hitung titik koordinat (X, Y) untuk masing-masing data
  const pts = visibleData.map((d, i) => {
    const x = n === 1 ? padLeft + chartW / 2 : padLeft + (i / (n - 1)) * chartW;
    const pct = Math.max(
      0,
      Math.min(100, d.persenHadir != null ? d.persenHadir : 0),
    );
    const y = baseBottom - (pct / 100) * chartH;
    return {
      x,
      y,
      pct,
      d,
      isToday: i === n - 1,
    };
  });

  // Grid Lines horizontal (0%, 25%, 50%, 75%, 100%)
  let gridHtml = "";
  [0, 0.25, 0.5, 0.75, 1.0].forEach((p) => {
    const y = baseBottom - p * chartH;
    gridHtml += `
      <line class="line-grid-line" x1="${padLeft - 8}" y1="${y}" x2="${svgW - padRight}" y2="${y}" stroke="#f1f5f9" stroke-dasharray="${p === 0 ? "none" : "3,3"}" stroke-width="${p === 0 ? 1.5 : 1}" />
      <text x="${padLeft - 12}" y="${y + 3.5}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">${Math.round(p * 100)}%</text>
    `;
  });

  // Target Line 90% (Standar Kepatuhan Madrasah)
  const targetY = baseBottom - 0.9 * chartH;
  const targetLineHtml = `
    <line class="line-target-line" x1="${padLeft - 6}" y1="${targetY}" x2="${svgW - padRight + 2}" y2="${targetY}" stroke="#f59e0b" stroke-dasharray="4,4" stroke-width="1.5" />
    <rect class="line-target-badge-bg" x="${svgW - padRight - 36}" y="${targetY - 9}" width="38" height="18" rx="4" fill="#fef3c7" stroke="#fde68a" stroke-width="1" />
    <text class="line-target-badge-text" x="${svgW - padRight - 17}" y="${targetY + 4}" fill="#b45309" font-size="10" font-weight="700" text-anchor="middle">90%</text>
  `;

  // Bangun Bezier Spline
  let linePath = "";
  if (pts.length === 1) {
    linePath = `M ${pts[0].x} ${pts[0].y}`;
  } else if (pts.length === 2) {
    linePath = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  } else {
    linePath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      let cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      let cp2y = p2.y - (p3.y - p1.y) / 6;
      cp1y = Math.max(padTop - 2, Math.min(baseBottom + 2, cp1y));
      cp2y = Math.max(padTop - 2, Math.min(baseBottom + 2, cp2y));
      linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }

  // Area Path (Fill di bawah kurva)
  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  const areaPath = `${linePath} L ${lastPt.x.toFixed(1)} ${baseBottom} L ${firstPt.x.toFixed(1)} ${baseBottom} Z`;

  // Render Data Points, Hover Guides, Labels, and Tooltips
  let pointsHtml = "";
  pts.forEach((pt) => {
    const tipData = JSON.stringify({
      title: `${pt.d.hari}, ${pt.d.tanggal}`,
      items: [
        { label: "Tingkat Kehadiran", value: `${pt.pct}%`, color: "#10b981" },
        {
          label: "Hadir",
          value: `${pt.d.hadir} / ${pt.d.totalGuru} guru`,
          color: "#059669",
        },
        {
          label: "Tepat Waktu",
          value: `${pt.d.tepatWaktu} guru`,
          color: "#10b981",
        },
        {
          label: "Terlambat",
          value: `${pt.d.terlambat} guru`,
          color: "#f59e0b",
        },
        { label: "Izin / Sakit", value: `${pt.d.izin} guru`, color: "#3b82f6" },
        {
          label: "Belum Presensi",
          value: `${pt.d.belumAbsen} guru`,
          color: "#ef4444",
        },
      ],
    }).replace(/"/g, "&quot;");

    // Value text offset above circle
    const valY = Math.max(padTop + 8, pt.y - 10);

    pointsHtml += `
      <g class="line-chart-point-group" data-tip="${tipData}" onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)">
        <!-- Vertical guide line on hover -->
        <line class="line-hover-guide" x1="${pt.x}" y1="${padTop}" x2="${pt.x}" y2="${baseBottom}" stroke="#10b981" stroke-dasharray="3,3" stroke-width="1.5" />
        
        <!-- X Axis Labels -->
        <text x="${pt.x}" y="${svgH - 18}" font-size="11" font-weight="${pt.isToday ? "800" : "600"}" fill="${pt.isToday ? "#059669" : "#475569"}" class="${pt.isToday ? "is-today-text" : ""}" text-anchor="middle">${esc(pt.d.hari.substring(0, 3))}</text>
        <text x="${pt.x}" y="${svgH - 6}" font-size="9" font-weight="500" fill="#94a3b8" text-anchor="middle">${esc(pt.d.tanggal.substring(0, 5))}</text>
        
        <!-- Value Pill above point -->
        <text class="line-val-text ${pt.isToday ? "is-today-text" : ""}" x="${pt.x}" y="${valY}" font-size="10.5" font-weight="700" fill="${pt.isToday ? "#059669" : "#334155"}" text-anchor="middle">${pt.pct}%</text>

        <!-- Pulsing halo for today -->
        ${pt.isToday ? `<circle cx="${pt.x}" cy="${pt.y}" r="8" fill="rgba(16,185,129,0.3)" class="line-pulse-ring" />` : ""}
        
        <!-- Point Core Circle -->
        <circle class="line-point-core" cx="${pt.x}" cy="${pt.y}" r="4.5" fill="#ffffff" stroke="${pt.isToday ? "#059669" : "#10b981"}" stroke-width="2.5" />
        
        <!-- Hitbox for easy mouse / touch hover -->
        <circle cx="${pt.x}" cy="${pt.y}" r="18" fill="transparent" style="cursor: pointer;" />
      </g>
    `;
  });

  const gradId = `lineAreaGrad_${containerId}`;
  const filterId = `lineGlow_${containerId}`;

  el.innerHTML = `
    <svg class="line-chart-svg" viewBox="0 0 ${svgW} ${svgH}">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
          <stop offset="80%" stop-color="#10b981" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
        </linearGradient>
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#10b981" flood-opacity="0.32"/>
        </filter>
      </defs>
      ${gridHtml}
      ${targetLineHtml}
      <path d="${areaPath}" fill="url(#${gradId})" />
      <path d="${linePath}" fill="none" stroke="#10b981" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" filter="url(#${filterId})" />
      ${pointsHtml}
    </svg>
  `;
}

function renderGrafikDonutStatus(chartId, legendId, komp, totalGuru) {
  const chartEl = document.getElementById(chartId);
  const legendEl = document.getElementById(legendId);
  if (!chartEl || !legendEl) return;

  const total = totalGuru > 0 ? totalGuru : 1;
  const tepat = (komp && komp.tepatWaktu) || 0;
  const lambat = (komp && komp.terlambat) || 0;
  const izin = (komp && komp.izinSakitCuti) || 0;
  const belum = (komp && komp.belumAbsen) || 0;
  const hadir = tepat + lambat;
  const persenHadir = Math.round((hadir / total) * 100);

  const cx = 82.5;
  const cy = 82.5;
  const r = 56;
  const c = 2 * Math.PI * r;

  const segs = [
    {
      label: "Tepat Waktu",
      count: tepat,
      color: "#10b981",
      pct: Math.round((tepat / total) * 100),
    },
    {
      label: "Terlambat",
      count: lambat,
      color: "#f59e0b",
      pct: Math.round((lambat / total) * 100),
    },
    {
      label: "Izin / Sakit",
      count: izin,
      color: "#3b82f6",
      pct: Math.round((izin / total) * 100),
    },
    {
      label: "Belum Presensi",
      count: belum,
      color: "#ef4444",
      pct: Math.round((belum / total) * 100),
    },
  ];

  let accumulated = 0;
  let circlesHtml = "";

  segs.forEach((s) => {
    if (s.count > 0) {
      const len = (s.count / total) * c;
      const offset = c * 0.25 - accumulated;
      const tipData = JSON.stringify({
        title: s.label,
        items: [
          { label: "Jumlah Guru", value: `${s.count} orang`, color: s.color },
          { label: "Persentase", value: `${s.pct}%`, color: s.color },
        ],
      }).replace(/"/g, "&quot;");

      circlesHtml += `
        <circle class="donut-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="20"
          stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          data-tip="${tipData}"
          onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" ontouchstart="handleBarHover(event, this)" />
      `;
      accumulated += len;
    }
  });

  if (hadir === 0 && izin === 0) {
    circlesHtml = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="20" />`;
  }

  chartEl.innerHTML = `
    <svg viewBox="0 0 165 165" style="width:100%; height:100%; display:block;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="20" />
      ${circlesHtml}
      <text class="donut-center-text" x="${cx}" y="${cy - 7}" font-size="28" font-weight="800" fill="var(--ink)">${persenHadir}%</text>
      <text class="donut-center-text" x="${cx}" y="${cy + 15}" font-size="10" font-weight="700" fill="#64748b" letter-spacing="0.08em">HADIR</text>
    </svg>
  `;

  legendEl.innerHTML = segs
    .map(
      (s) => `
    <div class="legend-chip-item">
      <div style="display:flex; align-items:center; gap:9px;">
        <span style="width:10px; height:10px; border-radius:50%; background:${s.color}; flex-shrink:0; box-shadow:0 0 0 2px ${s.color}33;"></span>
        <span style="color:var(--slate); font-weight:600; font-size:12.5px;">${esc(s.label)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <strong style="font-size:13.5px; color:var(--ink);">${s.count}</strong>
        <span style="background:${s.color}15; color:${s.color}; font-size:11px; font-weight:700; padding:2px 7px; border-radius:6px;">${s.pct}%</span>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderDistribusiJamKedatangan(containerId, dist, batas) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const total = (dist && dist.totalMasuk) || 0;
  const items = [
    {
      label: "Sebelum 06:45 (Awal)",
      count: (dist && dist.sebelum0645) || 0,
      color: "#10b981",
    },
    {
      label: "06:45 – 07:00 (Optimal)",
      count: (dist && dist.jam0645_0700) || 0,
      color: "#059669",
    },
    {
      label: `07:00 – ${batas || "07:15"} (Mendekati Batas)`,
      count: (dist && dist.jam0700_batas) || 0,
      color: "#f59e0b",
    },
    {
      label: `Lewat ${batas || "07:15"} (Terlambat)`,
      count: (dist && dist.lewatBatas) || 0,
      color: "#ef4444",
    },
  ];

  if (total === 0) {
    el.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px;">Belum ada guru yang melakukan presensi hari ini.</div>';
    return;
  }

  el.innerHTML = items
    .map((it) => {
      const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
      return `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; margin-bottom:4px;">
          <span style="font-weight:600; color:var(--ink);">${esc(it.label)}</span>
          <span><strong style="color:var(--ink);">${it.count} guru</strong> <span style="color:var(--slate); font-size:10.5px;">(${pct}%)</span></span>
        </div>
        <div style="width:100%; height:7px; background:var(--line); border-radius:99px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:${it.color}; border-radius:99px; transition:width 0.4s ease;"></div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderKepatuhanLokasi(containerId, badgeId, lokasi) {
  const cEl = document.getElementById(containerId);
  const bEl = document.getElementById(badgeId);
  if (!cEl) return;

  const dalam = (lokasi && lokasi.dalamRadius) || 0;
  const luar = (lokasi && lokasi.luarRadius) || 0;
  const total = dalam + luar;
  const persenDalam =
    lokasi && lokasi.persenDalam != null ? Math.round(lokasi.persenDalam) : 100;

  if (bEl) {
    bEl.textContent = `${persenDalam}% Di Madrasah`;
    bEl.className =
      persenDalam >= 80
        ? "badge ok"
        : persenDalam >= 50
          ? "badge warn"
          : "badge danger";
  }

  if (total === 0) {
    cEl.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px;">Belum ada aktivitas presensi dengan koordinat GPS hari ini.</div>';
    return;
  }

  cEl.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:4px;">
        <span style="font-weight:600; color:var(--ink-green);">Di Lingkungan Madrasah (Radius Aman)</span>
        <strong style="color:var(--ink);">${dalam} guru (${persenDalam}%)</strong>
      </div>
      <div style="width:100%; height:10px; background:rgba(244, 63, 94, 0.18); border-radius:99px; overflow:hidden; display:flex;">
        <div style="width:${persenDalam}%; height:100%; background:#10b981; border-radius:99px 0 0 99px; transition:width 0.4s ease;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--slate); margin-top:6px;">
        <span>Luar Radius: <strong style="color:var(--ink);">${luar} guru</strong></span>
        <span>Total Terverifikasi GPS: <strong style="color:var(--ink);">${total}</strong></span>
      </div>
    </div>
  `;
}

function bangunStatistikDetailLokal(statHariIni, riwayatList, jamMasukBatas) {
  const totalGuru = Math.max(0, Number(statHariIni && statHariIni.totalGuru) || 0);
  const jadwalGuru =
    statHariIni && statHariIni.jadwalGuru && typeof statHariIni.jadwalGuru === "object"
      ? statHariIni.jadwalGuru
      : null;
  const guruPerHari = {};
  if (jadwalGuru) {
    Object.entries(jadwalGuru).forEach(([username, hariList]) => {
      if (!Array.isArray(hariList)) return;
      hariList.forEach((hari) => {
        const key = String(hari).trim().toLowerCase();
        if (!guruPerHari[key]) guruPerHari[key] = new Set();
        guruPerHari[key].add(username.toLowerCase());
      });
    });
  }
  const jumlahGuruTerjadwal = (hari) =>
    jadwalGuru
      ? (guruPerHari[String(hari).trim().toLowerCase()] || new Set()).size
      : totalGuru;
  const guruTerjadwal = (username, hari) =>
    !jadwalGuru ||
    (guruPerHari[String(hari).trim().toLowerCase()] || new Set()).has(
      String(username || "").toLowerCase(),
    );
  const hariNames = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const now = new Date();
  const todayStr =
    String(now.getDate()).padStart(2, "0") +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    now.getFullYear();

  function parseDateDDMMYYYY(str) {
    const p = String(str).split("/");
    if (p.length === 3) {
      return new Date(
        parseInt(p[2], 10),
        parseInt(p[1], 10) - 1,
        parseInt(p[0], 10),
      );
    }
    return new Date();
  }

  // Kumpulkan tanggal-tanggal yang ada data presensinya (seadanya data riwayat yang aktif)
  const dateSet = new Set();
  (riwayatList || []).forEach((r) => {
    if (r.tanggal) dateSet.add(r.tanggal);
  });
  // Hari ini selalu disertakan
  dateSet.add(todayStr);

  // Urutkan secara kronologis (dari terlama ke terbaru)
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    return parseDateDDMMYYYY(a).getTime() - parseDateDDMMYYYY(b).getTime();
  });

  // Tidak dibatasi jumlah hari — renderGrafikTrenMingguan yang akan menyesuaikan
  // berapa banyak hari yang muat berdasarkan lebar kartu/container secara responsif.
  const dates = sortedDates;

  const dateDayMap = {};
  dates.forEach((dStr) => {
    const dt = parseDateDDMMYYYY(dStr);
    dateDayMap[dStr] = hariNames[dt.getDay()];
  });

  const dataPerHari = {};
  dates.forEach((d) => {
    dataPerHari[d] = {};
  });

  (riwayatList || []).forEach((r) => {
    if (r.tanggal && dataPerHari[r.tanggal]) {
      if (!guruTerjadwal(r.username, dateDayMap[r.tanggal])) return;
      if (!dataPerHari[r.tanggal][r.username]) {
        dataPerHari[r.tanggal][r.username] = r;
      }
    }
  });

  const trenMingguan = dates.map((d) => {
    const userMap = dataPerHari[d] || {};
    let hadirCount = 0;
    let tepatCount = 0;
    let lambatCount = 0;
    let izinCount = 0;

    Object.values(userMap).forEach((rec) => {
      const st = String(rec.statusWaktu || "").toLowerCase();
      if (st === "hadir" || st === "tepat waktu") {
        const j = String(rec.jam || "").substring(0, 5);
        if (j && j > jamMasukBatas) lambatCount++;
        else tepatCount++;
        hadirCount++;
      } else if (st === "terlambat") {
        lambatCount++;
        hadirCount++;
      } else if (st === "izin" || st === "sakit" || st === "cuti") {
        izinCount++;
      }
    });

    const totalGuruHari =
      d === todayStr ? totalGuru : jumlahGuruTerjadwal(dateDayMap[d]);

    if (
      d === todayStr &&
      hadirCount === 0 &&
      statHariIni &&
      (statHariIni.hadirHariIni > 0 || statHariIni.izinSakitCuti > 0)
    ) {
      hadirCount = statHariIni.hadirHariIni || 0;
      izinCount = statHariIni.izinSakitCuti || 0;
      tepatCount = hadirCount;
      lambatCount = 0;
    }

    let belumCount = totalGuruHari - (hadirCount + izinCount);
    if (belumCount < 0) belumCount = 0;

    const persenHadir =
      totalGuruHari > 0 ? Math.round((hadirCount / totalGuruHari) * 100) : 0;

    return {
      tanggal: d,
      hari: dateDayMap[d],
      totalGuru: totalGuruHari,
      hadir: hadirCount,
      tepatWaktu: tepatCount,
      terlambat: lambatCount,
      izin: izinCount,
      belumAbsen: belumCount,
      persenHadir: persenHadir,
    };
  });

  const todayEntry =
    trenMingguan.find((t) => t.tanggal === todayStr) ||
    trenMingguan[trenMingguan.length - 1];
  let todayTepat = todayEntry.tepatWaktu;
  let todayLambat = todayEntry.terlambat;
  let todayIzin = todayEntry.izin;
  let todayBelum = todayEntry.belumAbsen;
  let todayHadir = todayEntry.hadir;

  if (
    todayHadir === 0 &&
    statHariIni &&
    (statHariIni.hadirHariIni > 0 || statHariIni.izinSakitCuti > 0)
  ) {
    todayHadir = statHariIni.hadirHariIni || 0;
    todayTepat = statHariIni.hadirHariIni || 0;
    todayIzin = statHariIni.izinSakitCuti || 0;
    todayBelum = statHariIni.belumAbsen || 0;
  }

  const persenHadir =
    totalGuru > 0 ? Math.round((todayHadir / totalGuru) * 100) : 0;

  const todayUserMap = dataPerHari[todayStr] || {};
  let jamAwal = 0;
  let jamOptimal = 0;
  let jamMendekati = 0;
  let jamLewat = 0;
  let lokasiDalam = 0;
  let lokasiLuar = 0;

  Object.values(todayUserMap).forEach((rec) => {
    const st = String(rec.statusWaktu || "").toLowerCase();
    if (st === "hadir" || st === "tepat waktu" || st === "terlambat") {
      const j = String(rec.jam || "").substring(0, 5);
      if (j) {
        if (j < "06:45") jamAwal++;
        else if (j <= "07:00") jamOptimal++;
        else if (j <= jamMasukBatas) jamMendekati++;
        else jamLewat++;
      }
      if (
        String(rec.statusLokasi || "")
          .toLowerCase()
          .includes("dalam")
      ) {
        lokasiDalam++;
      } else {
        lokasiLuar++;
      }
    }
  });

  if (jamAwal + jamOptimal + jamMendekati + jamLewat === 0 && todayHadir > 0) {
    jamOptimal = todayHadir;
  }
  if (lokasiDalam + lokasiLuar === 0 && todayHadir > 0) {
    lokasiDalam = todayHadir;
  }

  const totalLokasi = lokasiDalam + lokasiLuar;
  const persenDalam =
    totalLokasi > 0 ? Math.round((lokasiDalam / totalLokasi) * 100) : 100;

  return {
    totalGuru: totalGuru,
    jamMasukBatas: jamMasukBatas,
    isHariLibur: (statHariIni && statHariIni.isHariLibur) || false,
    keteranganLibur: (statHariIni && statHariIni.keteranganLibur) || "",
    trenMingguan: trenMingguan,
    komposisiHariIni: {
      tepatWaktu: todayTepat,
      terlambat: todayLambat,
      izinSakitCuti: todayIzin,
      belumAbsen: todayBelum,
      totalHadir: todayHadir,
      persenHadir: persenHadir,
      persenTepat:
        totalGuru > 0 ? Math.round((todayTepat / totalGuru) * 100) : 0,
      persenTerlambat:
        totalGuru > 0 ? Math.round((todayLambat / totalGuru) * 100) : 0,
      persenIzin:
        totalGuru > 0 ? Math.round((todayIzin / totalGuru) * 100) : 0,
      persenBelum:
        totalGuru > 0 ? Math.round((todayBelum / totalGuru) * 100) : 0,
    },
    distribusiJam: {
      sebelum0645: jamAwal,
      jam0645_0700: jamOptimal,
      jam0700_batas: jamMendekati,
      lewatBatas: jamLewat,
      totalMasuk: todayHadir,
    },
    kepatuhanLokasi: {
      dalamRadius: lokasiDalam,
      luarRadius: lokasiLuar,
      persenDalam: persenDalam,
    },
  };
}

async function muatStatistik(role) {
  const prefix = role === "admin" ? "admin" : "kepala";
  let detailData = null;
  let riwayatList = [];

  try {
    const resHariIni = await runServer(
      "getStatistikHariIni",
      currentUser.username,
    );
    if (resHariIni && resHariIni.success && resHariIni.data) {
      try {
        const resRiwayat = await runServer(
          "getRiwayatAbsensiSemua",
          currentUser.username,
          "",
          "",
          null,
        );
        if (
          resRiwayat &&
          resRiwayat.success &&
          Array.isArray(resRiwayat.data)
        ) {
          riwayatList = resRiwayat.data;
        }
      } catch (e) {}

      const jamMasukBatas =
        (infoSekolahCache && infoSekolahCache.jamMasukBatas) || "07:15";
      detailData = bangunStatistikDetailLokal(
        resHariIni.data,
        riwayatList,
        jamMasukBatas,
      );
    }
  } catch (err) {
    showToast(err.message, "error");
    return;
  }

  if (!detailData) return;

  const d = detailData;
  const komp = d.komposisiHariIni || {};

  const elTotal = document.getElementById(prefix + "StatTotal");
  if (elTotal) elTotal.textContent = d.totalGuru;

  const elHadir = document.getElementById(prefix + "StatHadir");
  if (elHadir)
    elHadir.textContent = komp.totalHadir != null ? komp.totalHadir : 0;

  const elIzin = document.getElementById(prefix + "StatIzin");
  if (elIzin)
    elIzin.textContent = komp.izinSakitCuti != null ? komp.izinSakitCuti : 0;

  const elBelum = document.getElementById(prefix + "StatBelum");
  if (elBelum)
    elBelum.textContent = komp.belumAbsen != null ? komp.belumAbsen : 0;

  const cardHadir = elHadir ? elHadir.closest(".stat-card") : null;
  if (cardHadir) {
    const sub = cardHadir.querySelector(".stat-card-sub");
    if (sub) sub.textContent = `${komp.persenHadir || 0}% persentase hadir`;
  }

  const liburBanner = document.getElementById(prefix + "LiburBanner");
  if (liburBanner) {
    liburBanner.classList.toggle("hidden", !d.isHariLibur);
    if (d.isHariLibur)
      liburBanner.textContent = "Hari ini libur: " + d.keteranganLibur;
  }

  // Render Visual Analytics (4 Grafik IMK)
  renderGrafikTrenMingguan(prefix + "TrenChart", d.trenMingguan);
  renderGrafikDonutStatus(
    prefix + "DonutChart",
    prefix + "DonutLegend",
    komp,
    d.totalGuru,
  );
  renderDistribusiJamKedatangan(
    prefix + "DistribusiJamBars",
    d.distribusiJam,
    d.jamMasukBatas,
  );
  renderKepatuhanLokasi(
    prefix + "KepatuhanLokasiContent",
    prefix + "LokasiPersenBadge",
    d.kepatuhanLokasi,
  );
  muatStatistikSiswa(prefix);
  renderGrafikLineKehadiran(
    prefix + "KehadiranLineChart",
    d.trenMingguan,
    prefix + "LineRataRataBadge",
  );

  const pillBatas = document.getElementById(prefix + "JamBatasPill");
  if (pillBatas)
    pillBatas.textContent = `Batas Masuk: ${d.jamMasukBatas || "07:15"}`;

  // Update Multi-Progress Bar & Stats (Both Admin & Kepala)
  const badge = document.getElementById(prefix + "KehadiranPersenBadge");
  if (badge) badge.textContent = `${komp.persenHadir || 0}% Terpenuhi`;

  const hariTglEl = document.getElementById(prefix + "KehadiranHariTgl");
  if (hariTglEl) {
    const todayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const nowD = new Date();
    hariTglEl.textContent = `${todayNames[nowD.getDay()]}, ${nowD.getDate()} ${monthNames[nowD.getMonth()]} ${nowD.getFullYear()}`;
  }

  const pHadir =
    d.totalGuru > 0 ? ((komp.totalHadir || 0) / d.totalGuru) * 100 : 0;
  const pIzin =
    d.totalGuru > 0 ? ((komp.izinSakitCuti || 0) / d.totalGuru) * 100 : 0;
  const pBelum = Math.max(0, 100 - pHadir - pIzin);

  const bHadir =
    document.getElementById(prefix + "ProgHadir") ||
    document.getElementById("progHadir");
  if (bHadir) bHadir.style.width = `${pHadir}%`;
  const bIzin =
    document.getElementById(prefix + "ProgIzin") ||
    document.getElementById("progIzin");
  if (bIzin) bIzin.style.width = `${pIzin}%`;
  const bBelum =
    document.getElementById(prefix + "ProgBelum") ||
    document.getElementById("progBelum");
  if (bBelum) bBelum.style.width = `${pBelum}%`;

  const lHadir =
    document.getElementById(prefix + "LblProgHadir") ||
    document.getElementById("lblProgHadir");
  if (lHadir) lHadir.textContent = `${komp.totalHadir || 0} guru`;
  const lIzin =
    document.getElementById(prefix + "LblProgIzin") ||
    document.getElementById("lblProgIzin");
  if (lIzin) lIzin.textContent = `${komp.izinSakitCuti || 0} guru`;
  const lBelum =
    document.getElementById(prefix + "LblProgBelum") ||
    document.getElementById("lblProgBelum");
  if (lBelum) lBelum.textContent = `${komp.belumAbsen || 0} guru`;

  // Update Admin Status Operasional Madrasah
  if (prefix === "admin") {
    const opTgl = document.getElementById("adminOpTanggal");
    if (opTgl) {
      const todayNames = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      const monthFull = [
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
      const nowD = new Date();
      opTgl.textContent = `${todayNames[nowD.getDay()]}, ${nowD.getDate()} ${monthFull[nowD.getMonth()]} ${nowD.getFullYear()}`;
    }

    const opStatus = document.getElementById("adminOpStatus");
    if (opStatus) {
      if (d.isHariLibur) {
        opStatus.textContent = "Hari Libur: " + (d.keteranganLibur || "Libur");
        opStatus.className = "status-ops-val is-red";
      } else {
        opStatus.textContent = "Hari Kerja Efektif";
        opStatus.className = "status-ops-val is-green";
      }
    }

    const opJam = document.getElementById("adminOpJam");
    if (opJam && infoSekolahCache) {
      const jm = infoSekolahCache.jamMasukBatas || "07:15";
      const jp = infoSekolahCache.jamPulangAwal || "16:00";
      opJam.textContent = `${jm}:00 - ${jp}:00`;
    }

    const opRad = document.getElementById("adminOpRadius");
    if (opRad && infoSekolahCache && infoSekolahCache.radiusMeter) {
      opRad.textContent = `${infoSekolahCache.radiusMeter} meter`;
    }
  }

  // Update Kepala dynamic elements (KBM Hari Ini & Tingkat Kehadiran Bulan Ini)
  if (prefix === "kepala") {
    const todayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const nowD = new Date();
    const namaHariIni = todayNames[nowD.getDay()];
    const tanggalLengkap = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(nowD);
    const elTanggalDashboard = document.getElementById("kepalaExecutiveDate");
    if (elTanggalDashboard) elTanggalDashboard.textContent = tanggalLengkap;
    const elTanggalKehadiran = document.getElementById(
      "kepalaKehadiranHariTgl",
    );
    if (elTanggalKehadiran) elTanggalKehadiran.textContent = tanggalLengkap;

    const elHariIniNama = document.getElementById("kepalaHariIniNama");
    if (elHariIniNama) elHariIniNama.textContent = namaHariIni;

    muatTopKehadiranKepala(riwayatList);
    muatKbmHariIniKepala(namaHariIni);
  }

  muatAktivitasHariIni(prefix);
}

function bukaRekapSiswaDashboard(prefix) {
  if (prefix === "admin") {
    gantiTab("admin-siswa");
    setTimeout(() => subAdminSiswa("rekap"), 0);
    return;
  }
  gantiTab("kepala-siswa");
}

function renderGrafikStatistikSiswa(perHari, mulai) {
  const rowsByDate = new Map(
    perHari.map((row) => [row.tanggal, row]),
  );
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(mulai);
    date.setDate(date.getDate() + index);
    const tanggal =
      String(date.getDate()).padStart(2, "0") +
      "/" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "/" +
      date.getFullYear();
    const row = rowsByDate.get(tanggal) || {};
    return {
      date,
      tanggal,
      statuses: [
        { label: "Hadir", key: "hadir", color: "#059669" },
        { label: "Izin", key: "izin", color: "#d97706" },
        { label: "Sakit", key: "sakit", color: "#0284c7" },
        { label: "Alpa", key: "alpa", color: "#e11d48" },
        { label: "Terlambat", key: "telat", color: "#7c3aed" },
      ].map((status) => ({
        ...status,
        value: Math.max(0, Number(row[status.key]) || 0),
      })),
    };
  });
  const maxTotal = Math.max(
    0,
    ...days.map((day) =>
      day.statuses.reduce((total, status) => total + status.value, 0),
    ),
  );
  const step = maxTotal ? Math.ceil(maxTotal / 4) : 1;
  const chartMax = step * 4;
  const ticks = Array.from({ length: 5 }, (_, index) =>
    (chartMax - step * index).toLocaleString("id-ID"),
  );
  const dateLabel = (date) =>
    `${date.getDate()} ${new Intl.DateTimeFormat("id-ID", {
      month: "short",
    }).format(date)}`;
  const dateFullLabel = (date) =>
    `${new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(date)}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  const tickIndexes = [0, 5, 10, 15, 20, 25, 29];
  const bars = days
    .map((day) => {
      const total = day.statuses.reduce(
        (sum, status) => sum + status.value,
        0,
      );
      const hadir = day.statuses.find((status) => status.key === "hadir").value;
      const telat = day.statuses.find((status) => status.key === "telat").value;
      const totalKehadiran = hadir + telat;
      const persenKehadiran = total
        ? Math.round((totalKehadiran / total) * 100)
        : 0;
      const detail = day.statuses
        .map((status) => `${status.label} ${status.value.toLocaleString("id-ID")}`)
        .join(", ");
      const tipData = JSON.stringify({
        title: dateFullLabel(day.date),
        items: [
          ...day.statuses.map((status) => ({
            label: status.label,
            value: `${status.value.toLocaleString("id-ID")} presensi`,
            color: status.color,
          })),
          {
            label: "Total Kehadiran",
            value: `${persenKehadiran}% (${totalKehadiran.toLocaleString("id-ID")}/${total.toLocaleString("id-ID")})`,
            color: "#059669",
          },
        ],
      }).replace(/"/g, "&quot;");
      const segments = day.statuses
        .map(
          (status) =>
            `<span class="kepala-student-chart-segment" style="height:${((status.value / chartMax) * 100).toFixed(2)}%;background:${status.color};"></span>`,
        )
        .join("");
      return `<div class="kepala-student-chart-bar" role="img" tabindex="0" data-tip="${tipData}" onmouseenter="handleBarHover(event, this)" onmousemove="moveChartTooltip(event)" onmouseleave="hideChartTooltip()" onfocus="handleBarHover(event, this)" ontouchstart="handleBarHover(event, this)" aria-label="${dateLabel(day.date)}, total ${total.toLocaleString("id-ID")} presensi: ${esc(detail)}" title="${dateLabel(day.date)} · ${esc(detail)}">
        <div class="kepala-student-chart-stack">${segments}</div>
      </div>`;
    })
    .join("");
  const dateTicks = tickIndexes
    .map(
      (index) =>
        `<span style="left:${((index / (days.length - 1)) * 100).toFixed(2)}%;">${dateLabel(days[index].date)}</span>`,
    )
    .join("");
  const legend = [
    { label: "Hadir", color: "#059669" },
    { label: "Izin", color: "#d97706" },
    { label: "Sakit", color: "#0284c7" },
    { label: "Alpa", color: "#e11d48" },
    { label: "Terlambat", color: "#7c3aed" },
  ]
    .map(
      (item) =>
        `<span><i style="background:${item.color};"></i>${item.label}</span>`,
    )
    .join("");
  const chart =
    maxTotal > 0
      ? `<div class="kepala-student-chart-layout">
          <div class="kepala-student-chart-y-axis" aria-hidden="true">${ticks.map((tick) => `<span>${tick}</span>`).join("")}</div>
          <div class="kepala-student-chart-main">
            <div class="kepala-student-chart-plot" role="group" aria-label="Grafik batang bertumpuk kehadiran siswa per hari">${bars}</div>
            <div class="kepala-student-chart-x-axis" aria-hidden="true">${dateTicks}</div>
          </div>
        </div>
        <div class="kepala-student-chart-legend">${legend}</div>`
      : '<div class="kepala-student-chart-empty">Belum ada data kehadiran pada periode ini.</div>';
  return `<section class="kepala-student-trend" aria-label="Grafik statistik kehadiran siswa 30 hari terakhir">
    <div class="kepala-student-trend-heading">
      <strong>Tren Kehadiran Harian</strong>
      <span>Jumlah presensi per hari</span>
    </div>
    ${chart}
  </section>`;
}

async function muatStatistikSiswa(prefix) {
  const bodyId = prefix + "StatistikSiswaBody";
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML =
    '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:12.5px;">Memuat statistik kehadiran siswa...</div>';
  const d = new Date();
  const mulai = new Date(d.getTime() - 29 * 86400000);
  // Backend parseTanggalIndo expects DD/MM/YYYY format
  const fmtIndo = (x) =>
    String(x.getDate()).padStart(2, "0") +
    "/" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "/" +
    x.getFullYear();
  let res;
  try {
    res = await runServer("getStatistikKehadiranSiswa", currentUser.username, {
      tanggalMulai: fmtIndo(mulai),
      tanggalAkhir: fmtIndo(d),
    });
  } catch (e) {
    body.innerHTML =
      '<div style="text-align:center;padding:24px;color:#b91c1c;font-size:12.5px;">' +
      esc(e.message) +
      "</div>";
    return;
  }
  if (!res || !res.success || !res.data) {
    body.innerHTML =
      '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:12.5px;">' +
      ((res && res.message) || "Data tidak tersedia") +
      "</div>";
    return;
  }
  const data = res.data;
  const ring = data.ringkasan || {};
  const badge = document.getElementById(prefix + "SiswaPersenBadge");
  if (badge) badge.textContent = (ring.persenHadir || 0) + "% Hadir";
  const stat = [
    { l: "Hadir", v: ring.hadir || 0, c: "#047857" },
    { l: "Izin", v: ring.izin || 0, c: "#d97706" },
    { l: "Sakit", v: ring.sakit || 0, c: "#0284c7" },
    { l: "Alpa", v: ring.alpa || 0, c: "#be123c" },
    { l: "Terlambat", v: ring.telat || 0, c: "#7c3aed" },
    { l: "Total", v: ring.total || 0, c: "var(--ink)" },
  ]
    .map(
      (s) =>
        '<div style="flex:1;min-width:88px;background:var(--parchment-alt);border:1px solid var(--line);border-radius:12px;padding:10px 12px;">' +
        '<div style="font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.4px;">' +
        s.l +
        "</div>" +
        '<div style="font-size:20px;font-weight:800;color:' +
        s.c +
        ';margin-top:2px;">' +
        s.v +
        "</div></div>",
    )
    .join("");

  const perKelas = Array.isArray(data.perKelas) ? data.perKelas : [];
  const perHari = Array.isArray(data.perHari) ? data.perHari : [];
  const grafik = renderGrafikStatistikSiswa(perHari, mulai);
  const classCards = perKelas
    .map((kelas) => {
      const hadir = Number(kelas.hadir) || 0;
      const alpa = Number(kelas.alpa) || 0;
      const total = Number(kelas.total) || 0;
      return `<div class="kepala-student-class-row">
        <span class="kepala-student-class-code">${esc(kelas.label || "-")}</span>
        <span class="kepala-student-class-main">
          <strong>${esc(kelas.label || "Kelas")}</strong>
          <span>Total ${total.toLocaleString("id-ID")} presensi</span>
        </span>
        <span class="kepala-student-class-stats">
          <strong>${hadir.toLocaleString("id-ID")} Hadir</strong>
          <span>${alpa.toLocaleString("id-ID")} Alfa</span>
        </span>
        <button type="button" class="kepala-student-class-action" onclick="bukaRekapSiswaDashboard('${prefix}')" aria-label="Buka rekap siswa ${esc(kelas.label || "")}">
          Buka rekap <span aria-hidden="true">&rarr;</span>
        </button>
      </div>`;
    })
    .join("");

  body.innerHTML = `<div class="kepala-student-stat-grid">${stat}</div>
    ${grafik}
    <div class="kepala-student-class-heading">
      <strong>Rincian Per Rombel</strong>
      <span>${perKelas.length} rombel terdata</span>
    </div>
    <div class="kepala-student-class-list">
      ${classCards || '<div class="kepala-student-empty">Belum ada rincian kehadiran per rombel.</div>'}
    </div>`;
}

function muatTopKehadiranKepala(riwayatList) {
  const listEl = document.getElementById("kepalaTopKehadiranList");
  if (!listEl) return;

  const now = new Date();
  const curMonthStr =
    "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();

  // Kumpulkan presensi bulan ini per guru
  const guruMap = {};
  const activeDaysThisMonth = new Set();

  (riwayatList || []).forEach((r) => {
    if (r.tanggal && r.tanggal.endsWith(curMonthStr)) {
      activeDaysThisMonth.add(r.tanggal);
      if (!guruMap[r.username]) {
        guruMap[r.username] = {
          username: r.username,
          namaGuru: r.namaGuru || r.username,
          mapel: r.mataPelajaran || "-",
          hadir: 0,
          tepat: 0,
          terlambat: 0,
          izin: 0,
        };
      }
      if (r.statusWaktu === "Hadir") {
        guruMap[r.username].hadir++;
        guruMap[r.username].tepat++;
      } else if (r.statusWaktu === "Terlambat") {
        guruMap[r.username].hadir++;
        guruMap[r.username].terlambat++;
      } else if (r.statusWaktu === "Izin" || r.statusWaktu === "Sakit") {
        guruMap[r.username].izin++;
      }
    }
  });

  const totalDays = Math.max(1, activeDaysThisMonth.size);
  const teacherList = Object.values(guruMap);

  if (!teacherList.length) {
    listEl.innerHTML =
      '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:12.5px;">Data rekap presensi bulan ini belum tersedia</div>';
    return;
  }

  // Hitung persentase dan urutkan
  teacherList.forEach((t) => {
    t.persen = Math.min(100, Math.round((t.hadir / totalDays) * 100));
  });

  teacherList.sort((a, b) => {
    if (b.persen !== a.persen) return b.persen - a.persen;
    if (b.hadir !== a.hadir) return b.hadir - a.hadir;
    if (b.tepat !== a.tepat) return b.tepat - a.tepat;
    return a.namaGuru.localeCompare(b.namaGuru);
  });

  const top5 = teacherList.slice(0, 5);

  const rankBadges = [
    '<span title="Peringkat 1" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #fef3c7, #fde68a); border:1px solid #fcd34d; flex-shrink:0; box-shadow:0 1px 2px rgba(217,119,6,0.15);">🥇</span>',
    '<span title="Peringkat 2" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #f1f5f9, #e2e8f0); border:1px solid #cbd5e1; flex-shrink:0; box-shadow:0 1px 2px rgba(71,85,105,0.1);">🥈</span>',
    '<span title="Peringkat 3" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-size:14px; line-height:1; background:linear-gradient(135deg, #ffedd5, #fed7aa); border:1px solid #fdba74; flex-shrink:0; box-shadow:0 1px 2px rgba(194,65,12,0.15);">🥉</span>',
    '<span title="Peringkat 4" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">4</span>',
    '<span title="Peringkat 5" style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">5</span>',
  ];

  listEl.innerHTML = top5
    .map(
      (g, idx) => `
    <div style="display:flex; align-items:center; gap:10px; padding:7px 10px; background:var(--parchment); border:1px solid var(--line); border-radius:8px;">
      ${rankBadges[idx] || `<span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font-weight:700; font-size:12px; background:var(--parchment); color:var(--slate); border:1px solid var(--line); flex-shrink:0;">${idx + 1}</span>`}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="font-size:12.5px; color:var(--ink); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.namaGuru)}</strong>
          <span style="font-size:12px; font-weight:800; color:#059669; flex-shrink:0; margin-left:6px;">${g.persen}%</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--slate); margin-bottom:4px;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.mapel)}</span>
          <span style="font-weight:600; flex-shrink:0;">${g.hadir}/${totalDays} Hari</span>
        </div>
        <div style="height:5px; background:var(--line); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${g.persen}%; background:linear-gradient(90deg, #10b981, #059669); border-radius:999px;"></div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

async function muatKbmHariIniKepala(namaHariIni) {
  const listEl = document.getElementById("kepalaKbmHariIniList");
  if (!listEl) return;

  listEl.innerHTML =
    '<div style="text-align:center; padding:18px; color:var(--slate); font-size:12px;"><span class="spin-sm"></span> Memuat jadwal KBM hari ini...</div>';

  try {
    if (!jadwalDataCache || !jadwalDataCache.length) {
      const res = await runServer("getDaftarJadwal", currentUser.username);
      if (res && res.success && Array.isArray(res.data)) {
        jadwalDataCache = res.data;
      }
    }

    const JAMKE_INDEX = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    };
    const jadwalHariIni = (jadwalDataCache || [])
      .filter(
        (j) => j.hari && j.hari.toLowerCase() === namaHariIni.toLowerCase(),
      )
      .sort(
        (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
      );

    if (!jadwalHariIni.length) {
      listEl.className = "kbm-empty-text";
      listEl.style.padding = "20px 0";
      listEl.style.color = "var(--slate)";
      listEl.textContent = `Tidak ada jadwal KBM aktif untuk hari ${namaHariIni}.`;
      return;
    }

    // Ambil data presensi hari ini untuk menentukan status guru mengajar
    const today = todayInputValue();
    let todayAbsenMap = {};
    try {
      const resToday = await runServer(
        "getRiwayatAbsensiSemua",
        currentUser.username,
        today,
        today,
        null,
      );
      if (resToday && resToday.success && Array.isArray(resToday.data)) {
        resToday.data.forEach((r) => {
          if (r.username) todayAbsenMap[r.username] = r;
        });
      }
    } catch (e) {}

    listEl.className = "";
    listEl.style.display = "flex";
    listEl.style.flexDirection = "column";
    listEl.style.gap = "6px";
    listEl.style.padding = "0";
    listEl.style.maxHeight = "270px";
    listEl.style.overflowY = "auto";
    listEl.style.paddingRight = "3px";

    listEl.innerHTML = jadwalHariIni
      .map((j) => {
        const r = todayAbsenMap[j.username];
        let statusHtml = "";
        if (r) {
          if (r.statusWaktu === "Hadir") {
            statusHtml =
              '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#059669; background:#dcfce7; border:1px solid #bbf7d0; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#10b981;"></span>Tepat Waktu</span>';
          } else if (r.statusWaktu === "Terlambat") {
            statusHtml =
              '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#f59e0b;"></span>Terlambat</span>';
          } else {
            statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; color:#1d4ed8; background:#dbeafe; border:1px solid #bfdbfe; padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#3b82f6;"></span>${esc(r.statusWaktu)}</span>`;
          }
        } else {
          statusHtml =
            '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:600; color:var(--slate); background:var(--parchment-alt); border:1px solid var(--line); padding:2px 7px; border-radius:6px; white-space:nowrap;"><span style="width:5px; height:5px; border-radius:50%; background:#94a3b8;"></span>Belum Presensi</span>';
        }

        return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 10px; background:var(--parchment); border:1px solid var(--line); border-radius:8px;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            <span style="font-size:11px; font-weight:800; color:var(--ink); background:var(--parchment-alt); border:1px solid var(--line); padding:3px 6px; border-radius:5px; min-width:48px; text-align:center; flex-shrink:0;">Jam ${esc(j.jamKe)}</span>
            <div style="min-width:0;">
              <div style="font-size:12.5px; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${esc(j.mataPelajaran)} <span style="font-size:11px; font-weight:600; color:var(--slate);">· ${esc(j.kelas)}</span>
              </div>
              <div style="font-size:11px; color:var(--slate); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(j.namaGuru)}</div>
            </div>
          </div>
          <div style="flex-shrink:0;">${statusHtml}</div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    listEl.className = "kbm-empty-text";
    listEl.style.padding = "20px 0";
    listEl.textContent = "Gagal memuat jadwal KBM hari ini.";
  }
}

async function muatJadwalKepala() {
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  days.forEach((d) => {
    const listEl = document.getElementById("listJadwal" + d);
    if (listEl)
      listEl.innerHTML =
        '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:12px;"><span class="spin-sm"></span> Memuat...</div>';
  });

  try {
    const res = await runServer("getDaftarJadwal", currentUser.username);
    if (!res || !res.success || !Array.isArray(res.data)) {
      days.forEach((d) => {
        const listEl = document.getElementById("listJadwal" + d);
        if (listEl)
          listEl.innerHTML =
            '<div class="kbm-empty-text">Gagal memuat jadwal KBM.</div>';
      });
      return;
    }

    const jadwals = res.data;
    jadwalDataCache = jadwals;
    const JAMKE_INDEX = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    };

    days.forEach((hari) => {
      const dayJadwal = jadwals
        .filter((j) => j.hari && j.hari.toLowerCase() === hari.toLowerCase())
        .sort(
          (a, b) => (JAMKE_INDEX[a.jamKe] || 99) - (JAMKE_INDEX[b.jamKe] || 99),
        );

      const badge = document.getElementById("badgeJadwal" + hari);
      if (badge) badge.textContent = `${dayJadwal.length} Jam`;

      const listEl = document.getElementById("listJadwal" + hari);
      if (!listEl) return;

      if (!dayJadwal.length) {
        listEl.className = "kbm-empty-text";
        listEl.textContent = "Tidak ada jadwal KBM.";
        return;
      }

      listEl.className = "kbm-day-list";
      listEl.innerHTML = dayJadwal
        .map(
          (j) => `
        <div class="kbm-item-card" style="padding:10px 12px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="kbm-jam-badge" style="font-size:11px; font-weight:800; color:#059669; background:#dcfce7; padding:2px 6px; border-radius:4px;">Jam ${esc(j.jamKe)}</span>
            <span class="kbm-kelas-badge" style="font-size:11px; font-weight:700; color:var(--slate); background:var(--parchment-alt); border:1px solid var(--line); padding:2px 6px; border-radius:4px;">${esc(j.kelas)}</span>
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--ink);">${esc(j.mataPelajaran)}</div>
          <div style="font-size:11.5px; color:var(--slate); margin-top:2px;">${esc(j.namaGuru)}</div>
        </div>
      `,
        )
        .join("");
    });
    terapkanFilterJadwalKepala();
  } catch (err) {
    days.forEach((d) => {
      const listEl = document.getElementById("listJadwal" + d);
      if (listEl)
        listEl.innerHTML =
          '<div class="kbm-empty-text">Terjadi kesalahan.</div>';
    });
  }
}

function pilihHariJadwalKepala(hari, tab) {
  const tabs = document.getElementById("kepalaJadwalDayTabs");
  if (!tabs || !tab) return;

  tabs.dataset.activeDay = hari;
  tabs.querySelectorAll("button").forEach((dayTab) => {
    const active = dayTab === tab;
    dayTab.classList.toggle("active", active);
    dayTab.setAttribute("aria-pressed", String(active));
  });
  terapkanFilterJadwalKepala();
}

function terapkanFilterJadwalKepala() {
  const grid = document.getElementById("kepalaJadwalWeekGrid");
  const tabs = document.getElementById("kepalaJadwalDayTabs");
  if (!grid || !tabs) return;

  const query = (
    document.getElementById("kepalaJadwalSearch")?.value || ""
  )
    .trim()
    .toLocaleLowerCase("id");
  const activeDay = (tabs.dataset.activeDay || "all").toLocaleLowerCase("id");
  let matchingSchedules = 0;

  grid.querySelectorAll(".kbm-day-card").forEach((card) => {
    const dayMatches =
      activeDay === "all" ||
      (card.dataset.day || "").toLocaleLowerCase("id") === activeDay;
    const scheduleItems = card.querySelectorAll(".kbm-item-card");
    let dayMatchesSearch = 0;

    scheduleItems.forEach((item) => {
      const matches =
        !query || item.textContent.toLocaleLowerCase("id").includes(query);
      item.hidden = !matches;
      if (matches) dayMatchesSearch += 1;
    });

    if (dayMatches) matchingSchedules += dayMatchesSearch;
    const visible = dayMatches && (!query || dayMatchesSearch > 0);
    card.style.display = visible ? "" : "none";
  });

  const emptyMessage = document.getElementById("kepalaJadwalSearchEmpty");
  if (emptyMessage) {
    emptyMessage.classList.toggle("hidden", !query || matchingSchedules > 0);
  }
}

function toggleKepalaJadwalDay(button) {
  const list = document.getElementById(button.getAttribute("aria-controls"));
  if (!list) return;

  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  list.hidden = expanded;
  button.closest(".kbm-day-card")?.classList.toggle("is-collapsed", expanded);
}

async function muatAktivitasHariIni(prefix) {
  const el = document.getElementById(prefix + "AktivitasList");
  if (!el) return;
  el.innerHTML =
    '<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#94a3b8;"><span class="spin-sm"></span> Memuat aktivitas hari ini...</td></tr>';
  try {
    const today = todayInputValue();
    const res = await runServer(
      "getRiwayatAbsensiSemua",
      currentUser.username,
      today,
      today,
      null,
    );
    if (!res.success) {
      el.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#ef4444;">${esc(res.message)}</td></tr>`;
      return;
    }
    if (!res.data.length) {
      el.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:36px 16px; color:#94a3b8;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px; height:32px; color:#cbd5e1;"><path d="M20 7h-7l-2-2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"></path></svg>
          <span style="font-size:13px; font-weight:500;">Belum ada aktivitas presensi hari ini.</span>
        </div>
      </td></tr>`;
      return;
    }
    el.innerHTML = res.data
      .slice(0, 8)
      .map(
        (r) => `
      <tr>
        <td data-label="Waktu" style="font-weight:600; font-family:monospace; font-size:13px;">${r.jam && String(r.jam).trim() ? esc(String(r.jam).substring(0, 5)) : '<span style="color:var(--slate);font-size:11px;">--:--</span>'}</td>
        <td data-label="Nama Guru"><strong>${esc(r.namaGuru)}</strong></td>
        <td data-label="Mapel / Kelas">${esc(r.mataPelajaran)}${r.kelas && r.kelas !== "-" ? " (" + esc(r.kelas) + ")" : ""}</td>
        <td data-label="Status">${badgeStatus(r.statusWaktu)}</td>
        <td data-label="Foto" style="text-align:center;">${r.fotoUrl ? fotoThumbTag(r.fotoUrl, "table-photo") : "-"}</td>
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    el.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:28px 16px; color:#ef4444;">Gagal memuat aktivitas.</td></tr>';
  }
}
