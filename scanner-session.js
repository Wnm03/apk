// modules/shared/scanner-session.js — ScannerSession (Tahap 5, docs/
// PRODUCT_DECISIONS.md § "Scanner — Exclusive Scanner Mode via ScannerSession
// (FINAL — Sesi 316, PD-007)").
//
// PD-007 — Scanner WAJIB berjalan lewat ScannerSession.enter()/exit():
// - Ini SATU-SATUNYA titik masuk/keluar utk membuka scanner apa pun
//   (VehicleScanner, SparepartScanner, & scanner masa depan) — tidak ada
//   jalur lain yang boleh suspend/resume UI global (modal/toast/dashboard)
//   di luar file ini.
// - Scanner Engine (lapisan ZXing/decode di vehicle-scanner.js/
//   sparepart-scanner.js) TIDAK BOLEH menyentuh modal/toast/dashboard sama
//   sekali lagi — tanggung jawab itu 100% pindah ke sini. Alur wajib:
//     ScannerSession.enter()  ->  Scanner.start() (mis. VehicleScanner.scan())
//     ->  ScannerSession.exit()
// - State "scanner aktif" adalah state EKSPLISIT (_active di bawah), di-set
//   sendiri oleh enter()/exit() — BUKAN disimpulkan dari keberadaan elemen
//   <video> di DOM (itu cara lama yang diganti, lihat catatan di
//   modules/shared/modal-navigasi.js soal blok camera-scan-active yang
//   dihapus sesi ini).
// - Urutan enter(): suspend UI global (pauseUI()) dulu, BARU scanner engine
//   boleh membangun overlay & mulai decode. Urutan exit(): scanner engine
//   teardown dulu (overlay sudah dilepas SEBELUM exit() dipanggil), baru UI
//   global di-resume (resumeUI()) — kebalikan dari enter(), supaya tidak ada
//   jendela waktu di mana keduanya aktif bersamaan.
//
// pauseUI()/resumeUI() REUSE PENUH teknik yang sudah ada sebelum sesi ini
// (vehicleScannerHideChrome()/vehicleScannerRestoreChrome() di
// vehicle-scanner.js, & style injection ala _camScanFixStyle di
// modal-navigasi.js) — 0 CSS/selector baru, cuma dipindah ke sini & dipanggil
// EKSPLISIT (bukan lewat MutationObserver/setInterval/querySelector('video')
// lagi).
//
// HOTFIX Scanner Session/FAB (lanjutan Tahap 6): FAB (`.keu-fab`,
// position:fixed — keuFab/shopFab/laporanFab/shopLaporanFab/carNotesFab, dst)
// ikut disembunyikan pauseUI() & dikembalikan resumeUI(), pola & guard SAMA
// PERSIS #mainNav/#mainHeader (simpan style.display asli, restore persis,
// idempotent). TIDAK ada ID FAB yang di-hardcode — pakai
// `document.querySelectorAll('.keu-fab')` supaya FAB apa pun (termasuk yang
// ditambah di masa depan) otomatis tercakup. 0 perubahan API publik
// ScannerSession, 0 perubahan ke enter()/exit()/isActive(), 0 sentuhan ke
// Scanner Engine (vehicle-scanner.js/sparepart-scanner.js) atau modals.js.

let _scannerSessionActive = false;
let _scannerSessionPrevChrome = null;
let _scannerSessionPrevFabDisplay = null;

// Hotfix Scanner Session/FAB — FAB (`.keu-fab`, dipakai Finance/Shop/Laporan/
// Car Notes, lihat styles.css) posisinya `position:fixed` sehingga TETAP
// kepaint di atas overlay scanner (masalah yang sama persis dengan
// #mainNav/#mainHeader yang sudah ditangani pauseUI() sejak Tahap 5/6) — FAB
// harus ikut disembunyikan selama Exclusive Scanner Mode aktif. TIDAK
// hardcode ID krn ada banyak instance FAB per halaman (keuFab/shopFab/
// laporanFab/shopLaporanFab/carNotesFab, dst, & FAB baru masa depan) — pakai
// `document.querySelectorAll('.keu-fab')` supaya otomatis mencakup semuanya,
// termasuk FAB yang ditambah nanti tanpa perlu update file ini lagi.
function _scannerSessionQueryFabs() {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return [];
  try {
    return Array.prototype.slice.call(document.querySelectorAll('.keu-fab'));
  } catch (e) {
    return [];
  }
}

// Style suspend modal/toast SELAMA scanner aktif — SAMA PERSIS aturan CSS
// yang dulu dipasang blok camera-scan-active (modal-navigasi.js), cuma
// selector class-nya diganti 'scanner-session-active' (di-toggle eksplisit
// oleh pauseUI()/resumeUI() di bawah, bukan MutationObserver lagi) &
// disuntik sekali di sini (idempotent, guard by id, pola sama persis
// _camScanFixStyle yang digantikannya).
function _scannerSessionEnsureStyle() {
  if (document.getElementById('_scannerSessionStyle')) return;
  const style = document.createElement('style');
  style.id = '_scannerSessionStyle';
  style.textContent = 'body.scanner-session-active > .overlay.open, body.scanner-session-active #toast{display:none !important;}';
  document.head.appendChild(style);
}

// pauseUI() — suspend UI global (modal/toast/dashboard chrome) SEBELUM
// scanner engine membangun overlay-nya sendiri. "Dashboard" di sini = chrome
// #mainNav/#mainHeader (REUSE penuh vehicleScannerHideChrome() lama — z-index
// #mainNav ternyata tetap kepaint di atas overlay scanner di sebagian
// browser/mode non-PWA, lihat catatan asli di vehicle-scanner.js), "modal/
// toast" = .overlay.open manapun & #toast (REUSE penuh aturan CSS
// camera-scan-active lama).
function scannerSessionPauseUI() {
  _scannerSessionEnsureStyle();
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('mainHeader');
  _scannerSessionPrevChrome = {
    navDisplay: nav ? nav.style.display : null,
    headerDisplay: header ? header.style.display : null,
  };
  if (nav) nav.style.display = 'none';
  if (header) header.style.display = 'none';
  const fabs = _scannerSessionQueryFabs();
  _scannerSessionPrevFabDisplay = fabs.map((el) => ({ el, display: el.style.display }));
  fabs.forEach((el) => { el.style.display = 'none'; });
  document.body.classList.add('scanner-session-active');
}

// resumeUI() — kebalikan pauseUI(), dipanggil SESUDAH scanner engine teardown
// (overlay-nya sendiri sudah dilepas dari DOM) supaya tidak ada jendela waktu
// scanner & UI global aktif bersamaan.
function scannerSessionResumeUI() {
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('mainHeader');
  if (_scannerSessionPrevChrome) {
    if (nav) nav.style.display = _scannerSessionPrevChrome.navDisplay || '';
    if (header) header.style.display = _scannerSessionPrevChrome.headerDisplay || '';
  }
  _scannerSessionPrevChrome = null;
  if (_scannerSessionPrevFabDisplay) {
    _scannerSessionPrevFabDisplay.forEach((entry) => {
      entry.el.style.display = entry.display || '';
    });
  }
  _scannerSessionPrevFabDisplay = null;
  document.body.classList.remove('scanner-session-active');
}

// enter() — satu-satunya titik masuk Exclusive Scanner Mode. Guard anti-
// dobel (mis. Scanner.start() ke-trigger 2x sebelum exit() pertama sempat
// jalan) — no-op kalau sudah aktif, supaya _scannerSessionPrevChrome asli
// tidak ketiban nilai 'none' dari sesi scanner sebelumnya.
function scannerSessionEnter() {
  if (_scannerSessionActive) return false;
  _scannerSessionActive = true;
  scannerSessionPauseUI();
  if (typeof AIBus !== 'undefined' && AIBus && typeof AIBus.emit === 'function') {
    AIBus.emit('Scanner:opened', {});
  }
  return true;
}

// exit() — satu-satunya titik keluar Exclusive Scanner Mode. Aman dipanggil
// walau enter() belum pernah/gagal (mis. Scanner Engine error sebelum sempat
// enter()) — no-op kalau memang belum aktif.
function scannerSessionExit() {
  if (!_scannerSessionActive) return false;
  _scannerSessionActive = false;
  scannerSessionResumeUI();
  if (typeof AIBus !== 'undefined' && AIBus && typeof AIBus.emit === 'function') {
    AIBus.emit('Scanner:closed', {});
  }
  return true;
}

function scannerSessionIsActive() {
  return _scannerSessionActive;
}

// ------------------------------------------------------------------------
// Namespace publik — pola sama persis VehicleScanner/SparepartScanner (const
// object, expose eksplisit ke window krn Node vm & browser non-module script
// TIDAK otomatis menempelkan binding const/let ke global object).
// ------------------------------------------------------------------------
const ScannerSession = {
  enter: scannerSessionEnter,
  exit: scannerSessionExit,
  pauseUI: scannerSessionPauseUI,
  resumeUI: scannerSessionResumeUI,
  isActive: scannerSessionIsActive,
};

if (typeof window !== 'undefined') {
  window.ScannerSession = ScannerSession;
}
