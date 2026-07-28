'use strict';
// tests/scanner-session.test.js — cakupan modules/shared/scanner-session.js
// (Tahap 6 — Migrasi Scanner, lanjutan Tahap 5 ScannerSession, docs/
// PRODUCT_DECISIONS.md § "Scanner — Exclusive Scanner Mode via
// ScannerSession (FINAL — Sesi 316, PD-007)").
//
// Menggantikan tests/scanner-lifecycle-baseline-s317.test.js (characterization
// test kode ASLI SEBELUM refactor, sengaja DIHAPUS sesi ini — persis seperti
// yang diprediksi di komentar file itu sendiri: "kalau nanti dipindah ke
// ScannerSession, test 'reuse hideChrome/restoreChrome milik dirinya sendiri'
// SEHARUSNYA gagal/hilang, sinyal migrasi sudah terjadi"). Behavior EKSTERNAL
// yang diamati user (nav/header + modal/toast hilang saat scanner buka,
// kembali saat scanner tutup) sekarang dites di sini lewat ScannerSession,
// BUKAN lagi lewat vehicleScannerHideChrome()/RestoreChrome() (fungsi itu
// sendiri sudah dihapus dari vehicle-scanner.js — lihat tests/vehicle-
// scanner.test.js, yang sekarang HANYA mencakup errorMessage()/buildHints(),
// 0 referensi hideChrome tersisa).
//
// Fake DOM manual (bukan loadSource.js) — pola SAMA PERSIS
// tests/scanner-lifecycle-baseline-s317.test.js (sekarang dihapus) &
// tests/dash-card-show-hide.test.js, karena scanner-session.js baca/tulis
// document.getElementById/classList/style langsung.
//
// HOTFIX Scanner Session/FAB (lanjutan Tahap 6): + cakupan hide/restore
// seluruh `.keu-fab` via `document.querySelectorAll('.keu-fab')` di
// pauseUI()/resumeUI() — fake DOM di bawah diperluas dgn `querySelectorAll()`
// (selector class sederhana, cukup utk kebutuhan source) & opsi daftar FAB
// dinamis (`fabs`), TANPA mengubah satu pun test lama di atas garis ini.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function makeClassList(el) {
  return {
    add(c) { if (!el._classes.includes(c)) el._classes.push(c); },
    remove(c) { el._classes = el._classes.filter((x) => x !== c); },
    contains(c) { return el._classes.includes(c); },
  };
}

function makeEl(id, classes) {
  const el = {
    id,
    tagName: '',
    textContent: '',
    style: { display: '' },
    _classes: classes ? classes.slice() : [],
    _attrs: {},
    parentNode: null,
    children: [],
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
  };
  el.classList = makeClassList(el);
  return el;
}

// makeFab(id) — helper elemen `.keu-fab` (pola nyata: `<div class="keu-fab"
// id="...">`, position:fixed, lihat styles.css). display awal '' (kosong,
// dikontrol CSS), sama seperti elemen FAB asli sebelum JS menyentuhnya.
function makeFab(id) {
  return makeEl(id, ['keu-fab']);
}

// makeDocument(byId, fabs, opts) — `fabs`: array elemen `.keu-fab` yang
// dikembalikan `querySelectorAll('.keu-fab')`. `opts.noQuerySelectorAll`:
// simulasikan lingkungan/browser lama yang TIDAK punya
// `document.querySelectorAll` sama sekali (properti dihapus total, bukan
// cuma dikosongkan) — utk menguji guard `typeof document.querySelectorAll
// !== 'function'` di source.
function makeDocument(byId, fabs, opts) {
  const body = makeEl('body');
  const head = makeEl('head');
  const options = opts || {};
  const doc = {
    body,
    head,
    // getElementById juga mencari elemen yg dibuat dinamis (createElement +
    // appendChild ke head/body dgn .id di-set, mis. style injection
    // _scannerSessionStyle) — supaya guard `if(document.getElementById(id))
    // return;` di source (idempotency) benar2 teruji, bukan cuma lookup
    // static byId map.
    getElementById(id) {
      if (id in byId && byId[id]) return byId[id];
      const found = head.children.find((c) => c.id === id) || body.children.find((c) => c.id === id);
      return found || null;
    },
    createElement: (tag) => { const el = makeEl(null); el.tagName = tag; return el; },
  };
  if (!options.noQuerySelectorAll) {
    // Implementasi minimal — cukup utk kebutuhan source (satu selector class
    // sederhana, `.keu-fab`). Return array biasa (punya .forEach, sama
    // seperti NodeList asli di browser).
    doc.querySelectorAll = (selector) => {
      const cls = String(selector).replace(/^\./, '');
      return (fabs || []).filter((el) => el._classes.includes(cls));
    };
  }
  return doc;
}

function makeCtx(byIdOverrides, extraGlobals, fabs, docOpts) {
  const byId = Object.assign(
    { mainNav: makeEl('mainNav'), mainHeader: makeEl('mainHeader') },
    byIdOverrides || {},
  );
  const document = makeDocument(byId, fabs, docOpts);
  const sandbox = Object.assign({ console, document, window: {} }, extraGlobals || {});
  const context = vm.createContext(sandbox);
  new vm.Script(readSrc('modules/shared/scanner-session.js'), { filename: 'scanner-session.js' }).runInContext(context);
  return { ctx: context, byId, document };
}

// ============================================================
// scannerSessionPauseUI() / scannerSessionResumeUI()
// ============================================================

test('scannerSessionPauseUI() — #mainNav & #mainHeader disembunyikan (style.display="none")', () => {
  const { ctx, byId } = makeCtx();
  byId.mainNav.style.display = 'flex';
  byId.mainHeader.style.display = 'grid';
  ctx.scannerSessionPauseUI();
  assert.equal(byId.mainNav.style.display, 'none');
  assert.equal(byId.mainHeader.style.display, 'none');
});

test('scannerSessionPauseUI() — body diberi class scanner-session-active', () => {
  const { ctx, document } = makeCtx();
  ctx.scannerSessionPauseUI();
  assert.ok(document.body.classList.contains('scanner-session-active'));
});

test('scannerSessionPauseUI() — style suspend modal/toast disuntik sekali (idempotent, guard by id)', () => {
  const { ctx, document } = makeCtx();
  ctx.scannerSessionPauseUI();
  ctx.scannerSessionPauseUI();
  const styleEls = document.head.children.filter((c) => c.id === '_scannerSessionStyle');
  assert.equal(styleEls.length, 1);
  assert.match(styleEls[0].textContent, /scanner-session-active/);
});

test('scannerSessionResumeUI() — mengembalikan display persis ke nilai SEBELUM pause (round-trip)', () => {
  const { ctx, byId } = makeCtx();
  byId.mainNav.style.display = 'flex';
  byId.mainHeader.style.display = 'grid';
  ctx.scannerSessionPauseUI();
  ctx.scannerSessionResumeUI();
  assert.equal(byId.mainNav.style.display, 'flex');
  assert.equal(byId.mainHeader.style.display, 'grid');
});

test('scannerSessionResumeUI() — body class scanner-session-active dilepas', () => {
  const { ctx, document } = makeCtx();
  ctx.scannerSessionPauseUI();
  ctx.scannerSessionResumeUI();
  assert.ok(!document.body.classList.contains('scanner-session-active'));
});

test('scannerSessionPauseUI()/ResumeUI() — guard: #mainNav/#mainHeader tidak ada di DOM -> tidak throw', () => {
  const { ctx } = makeCtx({ mainNav: null, mainHeader: null });
  assert.doesNotThrow(() => ctx.scannerSessionPauseUI());
  assert.doesNotThrow(() => ctx.scannerSessionResumeUI());
});

// ============================================================
// scannerSessionEnter() / scannerSessionExit() — state eksplisit, guard anti-dobel
// ============================================================

test('scannerSessionEnter() — mem-pause UI global & return true', () => {
  const { ctx, byId } = makeCtx();
  byId.mainNav.style.display = 'flex';
  const result = ctx.scannerSessionEnter();
  assert.equal(result, true);
  assert.equal(byId.mainNav.style.display, 'none');
  assert.equal(ctx.scannerSessionIsActive(), true);
});

test('scannerSessionEnter() — guard anti-dobel: enter() ke-2 sebelum exit() -> no-op, return false', () => {
  const { ctx, byId } = makeCtx();
  byId.mainNav.style.display = 'flex';
  ctx.scannerSessionEnter();
  byId.mainNav.style.display = 'CUSTOM'; // simulasikan scanner engine lain menimpa manual
  const result2 = ctx.scannerSessionEnter();
  assert.equal(result2, false, 'enter() ke-2 harus no-op, tidak menimpa _scannerSessionPrevChrome asli');
});

test('scannerSessionExit() — resume UI global & return true, state jadi tidak aktif', () => {
  const { ctx, byId } = makeCtx();
  byId.mainNav.style.display = 'flex';
  ctx.scannerSessionEnter();
  const result = ctx.scannerSessionExit();
  assert.equal(result, true);
  assert.equal(byId.mainNav.style.display, 'flex');
  assert.equal(ctx.scannerSessionIsActive(), false);
});

test('scannerSessionExit() — aman dipanggil walau enter() belum pernah -> no-op, return false, tidak throw', () => {
  const { ctx } = makeCtx();
  let result;
  assert.doesNotThrow(() => { result = ctx.scannerSessionExit(); });
  assert.equal(result, false);
});

test('enter() -> exit() round-trip penuh: nav/header + body class kembali seperti semula', () => {
  const { ctx, byId, document } = makeCtx();
  byId.mainNav.style.display = 'flex';
  byId.mainHeader.style.display = 'grid';
  ctx.scannerSessionEnter();
  assert.equal(byId.mainNav.style.display, 'none');
  assert.ok(document.body.classList.contains('scanner-session-active'));
  ctx.scannerSessionExit();
  assert.equal(byId.mainNav.style.display, 'flex');
  assert.equal(byId.mainHeader.style.display, 'grid');
  assert.ok(!document.body.classList.contains('scanner-session-active'));
});

test('scannerSessionIsActive() — false sebelum enter(), true setelah enter(), false lagi setelah exit()', () => {
  const { ctx } = makeCtx();
  assert.equal(ctx.scannerSessionIsActive(), false);
  ctx.scannerSessionEnter();
  assert.equal(ctx.scannerSessionIsActive(), true);
  ctx.scannerSessionExit();
  assert.equal(ctx.scannerSessionIsActive(), false);
});

// ============================================================
// AIBus.emit('Scanner:opened'/'Scanner:closed') — guarded (typeof), opsional
// ============================================================

test('enter()/exit() — AIBus.emit dipanggil dgn event Scanner:opened/closed kalau AIBus tersedia', () => {
  const emitted = [];
  const { ctx } = makeCtx({}, { AIBus: { emit: (name, payload) => emitted.push([name, payload]) } });
  ctx.scannerSessionEnter();
  ctx.scannerSessionExit();
  assert.deepEqual(emitted.map((e) => e[0]), ['Scanner:opened', 'Scanner:closed']);
});

test('enter()/exit() — guard: AIBus TIDAK tersedia -> tidak throw', () => {
  const { ctx } = makeCtx();
  assert.doesNotThrow(() => ctx.scannerSessionEnter());
  assert.doesNotThrow(() => ctx.scannerSessionExit());
});

// ============================================================
// Namespace publik ScannerSession — expose ke window
// ============================================================

test('window.ScannerSession expose semua method publik', () => {
  const { ctx } = makeCtx();
  assert.equal(typeof ctx.window.ScannerSession.enter, 'function');
  assert.equal(typeof ctx.window.ScannerSession.exit, 'function');
  assert.equal(typeof ctx.window.ScannerSession.pauseUI, 'function');
  assert.equal(typeof ctx.window.ScannerSession.resumeUI, 'function');
  assert.equal(typeof ctx.window.ScannerSession.isActive, 'function');
});

// ============================================================
// HOTFIX Scanner Session/FAB — hide/restore seluruh `.keu-fab` (dinamis via
// querySelectorAll, TIDAK hardcode ID), pola & guard sama persis
// #mainNav/#mainHeader.
// ============================================================

test('scannerSessionEnter() — semua .keu-fab disembunyikan (style.display="none")', () => {
  const keuFab = makeFab('keuFab');
  const shopFab = makeFab('shopFab');
  keuFab.style.display = 'flex';
  shopFab.style.display = 'flex';
  const { ctx } = makeCtx({}, {}, [keuFab, shopFab]);
  ctx.scannerSessionEnter();
  assert.equal(keuFab.style.display, 'none');
  assert.equal(shopFab.style.display, 'none');
});

test('scannerSessionExit() — semua .keu-fab dikembalikan ke display asli masing-masing (round-trip)', () => {
  const keuFab = makeFab('keuFab');
  const shopFab = makeFab('shopFab');
  keuFab.style.display = 'flex';
  shopFab.style.display = 'grid'; // sengaja beda, supaya tidak lolos kalau kode nge-hardcode 1 nilai untuk semua
  const { ctx } = makeCtx({}, {}, [keuFab, shopFab]);
  ctx.scannerSessionEnter();
  ctx.scannerSessionExit();
  assert.equal(keuFab.style.display, 'flex');
  assert.equal(shopFab.style.display, 'grid');
});

test('multiple enter()/exit() berturut-turut — display FAB tidak drift (tetap sama persis nilai awal tiap putaran)', () => {
  const keuFab = makeFab('keuFab');
  keuFab.style.display = 'flex';
  const { ctx } = makeCtx({}, {}, [keuFab]);
  for (let i = 0; i < 5; i += 1) {
    ctx.scannerSessionEnter();
    assert.equal(keuFab.style.display, 'none', `putaran ke-${i + 1}: harus none saat aktif`);
    ctx.scannerSessionExit();
    assert.equal(keuFab.style.display, 'flex', `putaran ke-${i + 1}: harus kembali 'flex', tidak drift`);
  }
});

test('scannerSessionEnter() — guard anti-dobel juga melindungi FAB: enter() ke-2 tidak menimpa display asli yang tersimpan', () => {
  const keuFab = makeFab('keuFab');
  keuFab.style.display = 'flex';
  const { ctx } = makeCtx({}, {}, [keuFab]);
  ctx.scannerSessionEnter();
  keuFab.style.display = 'CUSTOM'; // simulasikan sesuatu menimpa manual selagi aktif
  const result2 = ctx.scannerSessionEnter();
  assert.equal(result2, false);
  ctx.scannerSessionExit();
  assert.equal(keuFab.style.display, 'flex', 'harus tetap restore ke nilai ASLI sebelum enter() pertama, bukan CUSTOM');
});

test('scannerSessionExit() dipanggil dua kali berturut-turut (double exit) — ke-2 no-op, FAB tidak berubah lagi', () => {
  const keuFab = makeFab('keuFab');
  keuFab.style.display = 'flex';
  const { ctx } = makeCtx({}, {}, [keuFab]);
  ctx.scannerSessionEnter();
  const result1 = ctx.scannerSessionExit();
  assert.equal(result1, true);
  assert.equal(keuFab.style.display, 'flex');
  const result2 = ctx.scannerSessionExit();
  assert.equal(result2, false, 'exit() ke-2 harus no-op');
  assert.equal(keuFab.style.display, 'flex', 'tidak berubah lagi setelah double exit');
});

test('enter()/exit() — tidak ada .keu-fab sama sekali di DOM -> tidak throw, nav/header tetap normal', () => {
  const { ctx, byId } = makeCtx({}, {}, []);
  byId.mainNav.style.display = 'flex';
  assert.doesNotThrow(() => ctx.scannerSessionEnter());
  assert.equal(byId.mainNav.style.display, 'none');
  assert.doesNotThrow(() => ctx.scannerSessionExit());
  assert.equal(byId.mainNav.style.display, 'flex');
});

test('enter()/exit() — document.querySelectorAll tidak tersedia (browser lama) -> tidak throw, nav/header tetap berfungsi', () => {
  const { ctx, byId, document } = makeCtx({}, {}, [], { noQuerySelectorAll: true });
  assert.equal(typeof document.querySelectorAll, 'undefined');
  byId.mainNav.style.display = 'flex';
  assert.doesNotThrow(() => ctx.scannerSessionEnter());
  assert.equal(byId.mainNav.style.display, 'none');
  assert.doesNotThrow(() => ctx.scannerSessionExit());
  assert.equal(byId.mainNav.style.display, 'flex');
});
