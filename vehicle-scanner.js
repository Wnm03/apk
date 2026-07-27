// vehicle-scanner.js — Scan Barcode/QR/DataMatrix untuk Vehicle Catalog
// (lanjutan dari ACR-001/Tahap 2 — lihat komentar handleScan() di
// vehicle-catalog.js: "itu butuh keputusan produk terpisah: pilih library,
// izin kamera, dsb — di luar cakupan 'ringkas'" — keputusan itu sudah
// diambil di sesi ini, file ini isinya).
//
// KEPUTUSAN PRODUK SESI INI (Project Decision — dipakai tanpa klarifikasi
// ulang, lihat catatan di kepala file):
// - Library: ZXing-JS (@zxing/library), CDN jsDelivr + lazy-load via
//   _loadScriptOnce() — pola yg SUDAH ADA (sama seperti ensureTesseract()
//   dkk di index.html/app_production.html/keluarga-w-preview.html).
// - Format: Barcode (1D umum: CODE_128/CODE_39/EAN_13/EAN_8/UPC_A/UPC_E/
//   ITF/CODABAR), QR Code, dan DataMatrix — via ZXing.DecodeHintType +
//   BarcodeFormat, bukan default reader (default BrowserMultiFormatReader
//   TIDAK mengaktifkan DATA_MATRIX kecuali di-hint eksplisit).
// - Metode capture: kamera FULLSCREEN, live continuous scan (bukan lagi
//   1 foto/file input seperti versi sebelumnya) — pakai
//   reader.decodeFromConstraints({video:{facingMode:'environment'}}, ...)
//   dgn fallback ke decodeFromVideoDevice(undefined,...) kalau constraints
//   ditolak browser, supaya tetap prioritas kamera belakang di HP.
// - Overlay dibuat dinamis lewat JS (createElement), BUKAN markup statis
//   index.html/app_production.html — konsisten dgn pola elemen dinamis
//   lain di repo (input file dinamis di scan-ocr.js), CSS-nya di
//   styles.css (.vehicle-scanner-fullscreen dkk, token existing saja).
// - Namespace: window.VehicleScanner (bukan class/factory BP-015),
//   ikut ACR-001 Opsi A yang sudah accepted utk fitur Vehicle Catalog ini.
// - File TERPISAH dari vehicle-catalog.js: modul ini HANYA lapisan
//   kamera/decode, tidak menyentuh logic cari-atau-draft (itu sudah ada
//   di VehicleCatalog.handleScan(code), dipanggil dari sini, tidak
//   diduplikasi/diubah).

const VEHICLE_SCANNER_LIB_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

function ensureZXing() {
  return _loadScriptOnce(VEHICLE_SCANNER_LIB_URL);
}

function vehicleScannerErrorMessage(err) {
  // BUGFIX (sesi ini): ZXing melempar kelas exception (NotFoundException,
  // ChecksumException, FormatException, dll) yang seringkali punya
  // `.message` KOSONG ('') — sebelumnya raw jadi '' (falsy) & fungsi ini
  // jatuh ke pesan generik "error tidak diketahui", padahal `err.name`
  // sebenarnya sudah cukup informatif (mis. kamera tidak ketemu/kode tidak
  // terbaca). Sekarang `.name` dipakai sbg fallback sebelum menyerah.
  const raw = (err && err.message) || (err && err.name) || (typeof err === 'string' ? err : '');
  if (raw && /fetch|network|load/i.test(raw)) return 'gagal mengunduh modul scanner, cek koneksi internet & coba lagi';
  if (raw && /notfound/i.test(raw)) return 'kode tidak terdeteksi — coba lebih dekat, lebih jelas, & pencahayaan lebih terang';
  if (raw && /notallowed|permission|security/i.test(raw)) return 'izin kamera ditolak — aktifkan izin kamera di pengaturan browser lalu coba lagi';
  if (raw && /notreadable|overconstrained|constraint/i.test(raw)) return 'kamera tidak bisa diakses (mungkin dipakai app lain) — tutup app lain yg pakai kamera, lalu coba lagi';
  if (raw) return raw;
  return 'error tidak diketahui — cek koneksi internet, lalu coba lagi';
}

function vehicleScannerHandleResult(code) {
  if (!code) return;
  toast('✅ Kode terbaca: ' + code);
  if (typeof VehicleCatalog !== 'undefined' && VehicleCatalog && typeof VehicleCatalog.handleScan === 'function') {
    const p = VehicleCatalog.handleScan(code);
    // Jembatan opsional ke UI (vehicle-catalog-ui.js), kalau sudah dimuat & modalnya lagi
    // dibuka — guard typeof, pola sama adapter tipis existing lain (_aiContext*() dkk).
    // vehicle-scanner.js TETAP tidak tahu apa pun soal DOM/UI modul lain selain guard ini.
    if (p && typeof p.then === 'function') {
      p.then((result) => {
        if (typeof VehicleCatalogUI !== 'undefined' && VehicleCatalogUI && typeof VehicleCatalogUI.onScanResult === 'function') {
          VehicleCatalogUI.onScanResult(result, code);
        }
      });
    }
  }
}

// Hints ZXing: aktifkan Barcode (1D umum) + QR + DataMatrix eksplisit —
// default reader ZXing TIDAK mengaktifkan DATA_MATRIX tanpa hint ini.
function vehicleScannerBuildHints() {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.DATA_MATRIX,
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.ITF,
    ZXing.BarcodeFormat.CODABAR,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return hints;
}

// BUGFIX (lanjutan audit z-index/stacking-context #scrollRoot vs .nav, lihat
// komentar di styles.css ~baris 81): #mainNav (position:fixed, z-index:
// var(--z-chrome)=100) ternyata tetap kepaint DI ATAS overlay scanner
// (z-index:var(--z-scanner)=970) di sebagian browser/mode non-PWA — root
// cause pastinya beda platform-dependent (hardware compositing utk elemen
// <video>), TIDAK bisa dipastikan cuma dari 1 aturan CSS. Fix paling aman &
// portable: sembunyikan #mainNav (dan #mainHeader, biar konsisten) SELAMA
// scanner terbuka, kembalikan persis seperti semula saat teardown — pola
// SAMA seperti showMain() yang sudah toggle elemen² ini manual (bukan
// mengandalkan z-index murni). 0 CSS baru, 0 perubahan ke elemen lain.
function vehicleScannerHideChrome() {
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('mainHeader');
  const prev = { navDisplay: nav ? nav.style.display : null, headerDisplay: header ? header.style.display : null };
  if (nav) nav.style.display = 'none';
  if (header) header.style.display = 'none';
  return prev;
}
function vehicleScannerRestoreChrome(prev) {
  if (!prev) return;
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('mainHeader');
  if (nav) nav.style.display = prev.navDisplay || '';
  if (header) header.style.display = prev.headerDisplay || '';
}

// Bangun overlay fullscreen (video + bingkai target + tombol tutup),
// dilepas total dari DOM saat scan selesai/dibatalkan — tidak ada elemen
// nempel/bocor di belakang.
function vehicleScannerBuildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'vehicle-scanner-fullscreen';
  overlay._prevChrome = vehicleScannerHideChrome();

  const video = document.createElement('video');
  video.className = 'vehicle-scanner-video';
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.muted = true;

  const frame = document.createElement('div');
  frame.className = 'vehicle-scanner-frame';

  const hint = document.createElement('div');
  hint.className = 'vehicle-scanner-hint';
  hint.textContent = 'Arahkan kamera ke barcode / QR / DataMatrix';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'vehicle-scanner-close';
  closeBtn.setAttribute('aria-label', 'Tutup scanner');
  closeBtn.textContent = '✕';

  overlay.appendChild(video);
  overlay.appendChild(frame);
  overlay.appendChild(hint);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  return { overlay, video, closeBtn };
}

function vehicleScannerTeardown(reader, overlay) {
  try { if (reader && typeof reader.reset === 'function') reader.reset(); } catch (e) { /* no-op, sama pola try/catch existing di modul lain */ }
  vehicleScannerRestoreChrome(overlay && overlay._prevChrome);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

async function vehicleScannerScan() {
  toast('🔍 Membuka kamera...', 4000);
  let reader = null;
  let ui = null;
  let stopped = false;
  try {
    await ensureZXing();
    reader = new ZXing.BrowserMultiFormatReader(vehicleScannerBuildHints());
    ui = vehicleScannerBuildOverlay();

    const stop = () => {
      if (stopped) return;
      stopped = true;
      vehicleScannerTeardown(reader, ui.overlay);
    };
    ui.closeBtn.onclick = stop;

    const onDecode = (result, err) => {
      if (stopped) return;
      if (result && typeof result.getText === 'function') {
        const code = result.getText();
        stop();
        vehicleScannerHandleResult(code);
      }
      // NotFoundException dilempar terus-menerus selama belum ada kode di
      // frame — itu normal utk continuous scan, BUKAN error, jadi diabaikan
      // di sini (bukan ditampilkan sebagai toast per-frame).
    };

    try {
      await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, ui.video, onDecode);
    } catch (constraintsErr) {
      // Fallback: browser/ZXing versi tertentu tidak dukung decodeFromConstraints
      // atau facingMode environment ditolak — coba device default.
      if (stopped) return;
      await reader.decodeFromVideoDevice(undefined, ui.video, onDecode);
    }
  } catch (err) {
    console.error('[VehicleScanner] gagal scan:', err);
    toast('❌ Gagal scan: ' + vehicleScannerErrorMessage(err));
    vehicleScannerTeardown(reader, ui && ui.overlay);
  }
}

// ------------------------------------------------------------------------
// Namespace publik — pola sama seperti VehicleCatalog (const object, expose
// eksplisit ke window krn Node vm & browser non-module script TIDAK
// otomatis menempelkan binding const/let ke global object — lihat catatan
// recurring bug di vehicle-catalog.js/AIBus/AIContext).
// ------------------------------------------------------------------------
const VehicleScanner = {
  scan: vehicleScannerScan,
  errorMessage: vehicleScannerErrorMessage,
  ensureZXing,
  buildHints: vehicleScannerBuildHints,
};

if (typeof window !== 'undefined') {
  window.VehicleScanner = VehicleScanner;
}
