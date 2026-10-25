/* =============================================================
   PETA INTERAKTIF GEOFENCE (LEAFLET + OPENSTREETMAP)
   ============================================================= */
let geofenceMap = null;
let geofenceMarker = null;
let geofenceCircle = null;

function initGeofenceMap() {
  const container = document.getElementById("geofenceMap");
  if (!container) return;

  if (typeof L === "undefined") {
    __pasangLeaflet().then(
      function () {
        initGeofenceMap();
      },
      function () {
        showToast(
          "Peta tidak dapat dimuat. Periksa koneksi internet Anda.",
          "error",
        );
      },
    );
    return;
  }

  const latInput = document.getElementById("pgLatitude");
  const lngInput = document.getElementById("pgLongitude");
  const radInput = document.getElementById("pgRadius");

  let lat = parseFloat(latInput ? latInput.value : "") || -7.15;
  let lng = parseFloat(lngInput ? lngInput.value : "") || 112.65;
  let rad = parseFloat(radInput ? radInput.value : "") || 150;

  if (geofenceMap) {
    geofenceMap.setView([lat, lng]);
    if (geofenceMarker) geofenceMarker.setLatLng([lat, lng]);
    if (geofenceCircle) {
      geofenceCircle.setLatLng([lat, lng]);
      geofenceCircle.setRadius(rad);
    }
    setTimeout(() => {
      if (geofenceMap) geofenceMap.invalidateSize();
    }, 200);
    return;
  }

  geofenceMap = L.map("geofenceMap", {
    center: [lat, lng],
    zoom: 17,
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(geofenceMap);

  geofenceCircle = L.circle([lat, lng], {
    color: "#059669",
    fillColor: "#10b981",
    fillOpacity: 0.22,
    weight: 2,
    radius: rad,
  }).addTo(geofenceMap);

  geofenceMarker = L.marker([lat, lng], {
    draggable: true,
  }).addTo(geofenceMap);

  geofenceMarker
    .bindPopup(
      '<b style="font-size:13px; color:#064e3b;">Lokasi Titik Presensi</b><br><span style="font-size:11px; color:#64748b;">Geser pin ini untuk memindahkan titik.</span>',
    )
    .openPopup();

  function updateCoords(newLat, newLng) {
    if (latInput) latInput.value = newLat.toFixed(6);
    if (lngInput) lngInput.value = newLng.toFixed(6);
    if (geofenceCircle) geofenceCircle.setLatLng([newLat, newLng]);
    if (geofenceMarker) geofenceMarker.setLatLng([newLat, newLng]);
  }

  geofenceMarker.on("dragend", function (e) {
    const pos = e.target.getLatLng();
    updateCoords(pos.lat, pos.lng);
  });

  geofenceMap.on("click", function (e) {
    updateCoords(e.latlng.lat, e.latlng.lng);
  });

  if (radInput) {
    radInput.addEventListener("input", function () {
      const newRad = parseFloat(radInput.value) || 100;
      if (geofenceCircle) geofenceCircle.setRadius(newRad);
    });
  }

  if (latInput && lngInput) {
    const handleInputManual = function () {
      const nLat = parseFloat(latInput.value);
      const nLng = parseFloat(lngInput.value);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        geofenceMap.panTo([nLat, nLng]);
        if (geofenceMarker) geofenceMarker.setLatLng([nLat, nLng]);
        if (geofenceCircle) geofenceCircle.setLatLng([nLat, nLng]);
      }
    };
    latInput.addEventListener("change", handleInputManual);
    lngInput.addEventListener("change", handleInputManual);
  }

  setTimeout(() => {
    if (geofenceMap) geofenceMap.invalidateSize();
  }, 300);
}
