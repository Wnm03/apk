// sparepart-scanner.js — Scanner Sparepart (Tahap 7B-1 Fondasi + Tahap 7B-2
// Kamera Real-Time)
//
// CAKUPAN TAHAP 7B-1 (fondasi, disepakati eksplisit — RULE #1: 100% reuse,
// TIDAK ada formula/skema baru, UI presenter layer saja):
// - Adapter "gallery": pilih 1 foto dari galeri (input file), decode
//   barcode/QR/DataMatrix dari foto statis itu lewat ZXing — REUSE PENUH
//   library/hints/error-message yang SUDAH ADA di VehicleScanner
//   (vehicle-scanner.js, Tahap 2 ACR-001): ensureZXing() (lazy-load CDN),
//   buildHints() (format Barcode/QR/DataMatrix + TRY_HARDER), errorMessage()
//   (pesan error jelas). File ini TIDAK mendefinisikan ulang URL CDN/format
//   list-nya sendiri.
// - Hasil decode (STRING kode) diteruskan ke VehicleCatalog.handleScan(code)
//   — REUSE PENUH logic "cari atau draft" yang SUDAH ADA sejak Tahap 2
//   vehicle-catalog.js (kode ketemu -> { found:true, item }, tidak ketemu ->
//   otomatis draft { found:false, item, draft:true }). TIDAK ada logic
//   pencarian/draft baru di sini.
// - Registry adapter (`registerAdapter()`/`getAdapter()`): dibuat di tahap
//   ini supaya adapter kamera bisa ditambah tanpa mengubah orkestrasi
//   scan()/handleCode() — terbukti dipakai di bawah utk adapter 'camera'.
//
// CAKUPAN TAHAP 7B-2 (kamera real-time, SESI INI):
// - Adapter "camera": live continuous scan via kamera fullscreen — pola
//   SAMA PERSIS vehicleScannerScan() (vehicle-scanner.js, Tahap 2 ACR-001):
//   reader.decodeFromConstraints({video:{facingMode:'environment'}}, ...)
//   dgn fallback ke decodeFromVideoDevice(undefined,...), overlay dibuat
//   dinamis lewat JS (createElement) pakai CSS class YANG SUDAH ADA
//   (.vehicle-scanner-fullscreen dkk di styles.css, Tahap 2) — TIDAK ada
//   class/style baru. REUSE PENUH VehicleScanner.ensureZXing()/buildHints()
//   (library/format Barcode 1D/QR/DataMatrix sama seperti adapter gallery,
//   TIDAK didefinisikan ulang). Bedanya dari vehicleScannerScan(): adapter
//   ini me-resolve Promise dgn STRING kode (bukan langsung memanggil
//   VehicleCatalog.handleScan()), supaya tetap lewat orkestrasi
//   scan()->handleCode() yang sama dgn adapter gallery (toast/UI hook
//   SparepartScannerUI.onScanResult() konsisten utk kedua adapter).
// - SENGAJA TIDAK dikerjakan (di luar cakupan): OCR, import PDF — itu sudah
//   ada di modul lain (vehicle-catalog-import.js utk PDF), TIDAK
//   diduplikasi/disentuh di sini.
//
// Dependency: VehicleScanner (vehicle-scanner.js, utk ensureZXing/buildHints/
// errorMessage) & VehicleCatalog (vehicle-catalog.js, utk handleScan) HARUS
// sudah dimuat lebih dulu (lihat urutan di scripts/build.js).

// ------------------------------------------------------------------------
// Adapter registry — murni Map nama->fungsi, supaya sumber kode scan (galeri
// foto sekarang, kamera nanti) bisa ditambah tanpa mengubah orkestrasi
// scan()/handleCode() di bawah.
// ------------------------------------------------------------------------
const _sparepartScannerAdapters = {};

function sparepartScannerRegisterAdapter(name, fn) {
  if (!name || typeof fn !== 'function') return false;
  _sparepartScannerAdapters[name] = fn;
  return true;
}

function sparepartScannerGetAdapter(name) {
  return _sparepartScannerAdapters[name] || null;
}

function sparepartScannerListAdapters() {
  return Object.keys(_sparepartScannerAdapters);
}

// ------------------------------------------------------------------------
// Adapter "gallery" — upload gambar dari galeri, decode 1x (bukan continuous
// live scan seperti vehicle-scanner.js). Reuse penuh ZXing lib/hints milik
// VehicleScanner supaya tidak ada 2 sumber kebenaran format/keputusan
// library scan di app ini.
// ------------------------------------------------------------------------
function sparepartScannerPickImageFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = (e) => {
      const file = (e && e.target && e.target.files) ? e.target.files[0] : null;
      resolve(file || null);
    };
    inp.click();
  });
}

async function sparepartScannerDecodeFromFile(file) {
  if (!file) return null;
  await VehicleScanner.ensureZXing();
  const reader = new ZXing.BrowserMultiFormatReader(VehicleScanner.buildHints());
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return (result && typeof result.getText === 'function') ? result.getText() : null;
  } finally {
    URL.revokeObjectURL(url);
    // no-op kalau reset() tidak ada/gagal, pola sama vehicleScannerTeardown()
    try { if (reader && typeof reader.reset === 'function') reader.reset(); } catch (e) { /* no-op */ }
  }
}

async function sparepartScannerGalleryAdapter() {
  const file = await sparepartScannerPickImageFile();
  if (!file) return null;
  return sparepartScannerDecodeFromFile(file);
}

// ------------------------------------------------------------------------
// Adapter "camera" — live continuous scan lewat kamera fullscreen. Pola SAMA
// PERSIS vehicleScannerBuildOverlay()/vehicleScannerScan() (vehicle-scanner.js)
// — overlay dibuat dinamis (createElement), CSS class REUSE apa adanya
// (.vehicle-scanner-fullscreen dkk, styles.css, TIDAK ada class baru), &
// dilepas total dari DOM saat scan selesai/dibatalkan. Bedanya: fungsi ini
// me-resolve Promise dgn STRING kode (bukan langsung panggil
// VehicleCatalog.handleScan() seperti vehicleScannerHandleResult()), supaya
// tetap lewat orkestrasi sparepartScannerScan()->sparepartScannerHandleCode()
// yang sama dgn adapter gallery di atas (satu jalur toast/UI hook utk kedua
// adapter, bukan 2 jalur berbeda).
// ------------------------------------------------------------------------
function sparepartScannerBuildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'vehicle-scanner-fullscreen';
  // BUGFIX (sama seperti vehicle-scanner.js — lihat komentar
  // vehicleScannerHideChrome()): #mainNav tetap kepaint di atas overlay
  // scanner di sebagian browser/mode non-PWA walau z-index-nya lebih
  // rendah. Reuse penuh helper yang sudah ada, TIDAK didefinisikan ulang.
  overlay._prevChrome = (typeof vehicleScannerHideChrome === 'function') ? vehicleScannerHideChrome() : null;

  const video = document.createElement('video');
  video.className = 'vehicle-scanner-video';
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.muted = true;

  const frame = document.createElement('div');
  frame.className = 'vehicle-scanner-frame';

  const hint = document.createElement('div');
  hint.className = 'vehicle-scanner-hint';
  hint.textContent = 'Arahkan kamera ke barcode / QR / DataMatrix sparepart';

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

function sparepartScannerTeardownOverlay(reader, overlay) {
  try { if (reader && typeof reader.reset === 'function') reader.reset(); } catch (e) { /* no-op, sama pola try/catch existing di modul lain */ }
  if (typeof vehicleScannerRestoreChrome === 'function') vehicleScannerRestoreChrome(overlay && overlay._prevChrome);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

function sparepartScannerCameraAdapter() {
  return new Promise((resolve, reject) => {
    let reader = null;
    let ui = null;
    let stopped = false;

    const stop = (code) => {
      if (stopped) return;
      stopped = true;
      sparepartScannerTeardownOverlay(reader, ui && ui.overlay);
      resolve(code || null);
    };

    (async () => {
      try {
        await VehicleScanner.ensureZXing();
        if (stopped) return;
        reader = new ZXing.BrowserMultiFormatReader(VehicleScanner.buildHints());
        ui = sparepartScannerBuildOverlay();
        ui.closeBtn.onclick = () => stop(null);

        const onDecode = (result, err) => {
          if (stopped) return;
          if (result && typeof result.getText === 'function') {
            stop(result.getText());
          }
          // NotFoundException dilempar terus-menerus selama belum ada kode di
          // frame — normal utk continuous scan, BUKAN error, diabaikan sama
          // seperti vehicleScannerScan().
        };

        try {
          await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, ui.video, onDecode);
        } catch (constraintsErr) {
          // Fallback: browser/ZXing versi tertentu tidak dukung
          // decodeFromConstraints atau facingMode environment ditolak —
          // coba device default, sama seperti vehicleScannerScan().
          if (stopped) return;
          await reader.decodeFromVideoDevice(undefined, ui.video, onDecode);
        }
      } catch (err) {
        // TIDAK di-resolve(null) — dilempar (reject) supaya
        // sparepartScannerScan() (catch block yang SUDAH ADA) menampilkan
        // errorMessage() yang benar (izin kamera/jaringan), bukan toast
        // generik "kode tidak terbaca".
        if (stopped) return;
        stopped = true;
        sparepartScannerTeardownOverlay(reader, ui && ui.overlay);
        reject(err);
      }
    })();
  });
}

// ------------------------------------------------------------------------
// Error message — reuse penuh VehicleScanner.errorMessage() (pesan jaringan/
// izin/"kode tidak terdeteksi" yang SUDAH ADA), fallback minimal kalau
// dipanggil dari konteks VehicleScanner belum ter-load (mis. test terisolasi).
// ------------------------------------------------------------------------
function sparepartScannerErrorMessage(err) {
  if (typeof VehicleScanner !== 'undefined' && VehicleScanner && typeof VehicleScanner.errorMessage === 'function') {
    return VehicleScanner.errorMessage(err);
  }
  const raw = (err && err.message) || (err && err.name) || (typeof err === 'string' ? err : '');
  if (raw) return raw;
  return 'error tidak diketahui — cek koneksi internet, lalu coba lagi';
}

// ------------------------------------------------------------------------
// Orkestrasi utama — terima STRING kode dari adapter mana pun (gallery
// sekarang, camera nanti), reuse VehicleCatalog.handleScan(code) apa adanya
// (pola SAMA PERSIS vehicleScannerHandleResult() di vehicle-scanner.js).
// ------------------------------------------------------------------------
async function sparepartScannerHandleCode(code) {
  const trimmed = (code || '').toString().trim();
  if (!trimmed) {
    toast('⚠️ Tidak ada kode terbaca dari gambar — coba foto lebih dekat/jelas');
    return { found: false, item: null, error: 'Kode tidak terdeteksi.' };
  }
  const result = await VehicleCatalog.handleScan(trimmed);
  if (result && result.found) {
    toast('✅ Part ditemukan: ' + (result.item && result.item.partName ? result.item.partName : trimmed));
  } else if (result && result.draft) {
    toast('📦 Part belum ada di katalog — draft dibuat, lengkapi datanya');
  }
  // Jembatan opsional ke UI (sparepart-scanner-ui.js), guard typeof sama
  // persis pola vehicleScannerHandleResult() -> VehicleCatalogUI.onScanResult().
  if (typeof SparepartScannerUI !== 'undefined' && SparepartScannerUI && typeof SparepartScannerUI.onScanResult === 'function') {
    SparepartScannerUI.onScanResult(result, trimmed);
  }
  return result;
}

async function sparepartScannerScan(adapterName) {
  const name = adapterName || 'gallery';
  const adapter = sparepartScannerGetAdapter(name);
  if (!adapter) {
    toast('⚠️ Metode scan "' + name + '" belum tersedia');
    return null;
  }
  toast(name === 'camera' ? '🔍 Membuka kamera...' : '🔍 Memindai gambar...', 4000);
  try {
    const code = await adapter();
    if (!code) {
      toast(name === 'camera' ? '⚠️ Scan dibatalkan/kode tidak terbaca' : '⚠️ Tidak ada gambar dipilih/kode tidak terbaca');
      return null;
    }
    return await sparepartScannerHandleCode(code);
  } catch (err) {
    console.error('[SparepartScanner] gagal scan:', err);
    toast('❌ Gagal scan: ' + sparepartScannerErrorMessage(err));
    return null;
  }
}

// Daftarkan adapter 'gallery' (Tahap 7B-1) & 'camera' (Tahap 7B-2) — dua-
// duanya lewat registry yang sama, tanpa mengubah orkestrasi scan()/
// handleCode() di atas.
sparepartScannerRegisterAdapter('gallery', sparepartScannerGalleryAdapter);
sparepartScannerRegisterAdapter('camera', sparepartScannerCameraAdapter);

// ------------------------------------------------------------------------
// Namespace publik — pola sama persis VehicleScanner/VehicleCatalog (const
// object, expose eksplisit ke window krn Node vm & browser non-module script
// TIDAK otomatis menempelkan binding const/let ke global object).
// ------------------------------------------------------------------------
const SparepartScanner = {
  scan: sparepartScannerScan,
  handleCode: sparepartScannerHandleCode,
  registerAdapter: sparepartScannerRegisterAdapter,
  getAdapter: sparepartScannerGetAdapter,
  listAdapters: sparepartScannerListAdapters,
  errorMessage: sparepartScannerErrorMessage,
  pickImageFile: sparepartScannerPickImageFile,
  decodeFromFile: sparepartScannerDecodeFromFile,
  cameraAdapter: sparepartScannerCameraAdapter,
};

if (typeof window !== 'undefined') {
  window.SparepartScanner = SparepartScanner;
}
