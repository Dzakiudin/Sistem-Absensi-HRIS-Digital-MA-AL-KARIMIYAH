/* =============================================================
   STATE
   ============================================================= */
let currentUser = null;
const __pustakaLoading = {};
const __muatanCache = new Map();
const __loaderBusy = new Set();
let capturedPhoto = null;
let currentLocation = null;
let lokasiValidUntukAbsen = false;
let jenisAbsenAktif = null;
let daftarGuruCache = [];
let usersCache = [];
let infoSekolahCache = null;
let modeKamera = "absen"; // 'absen' | 'konfirmasi' — menentukan tujuan submit di modal kamera
let konfirmasiPenggantiAktifId = null;
let konfirmasiPenggantiAktifIsRentang = false;
let daftarKonfirmasiPenggantiCache = [];
let __tabAktif = null;
let __tabGuruAktif = null;
let guruJadwalCache = null;
