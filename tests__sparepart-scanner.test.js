'use strict';
// tests/sparepart-scanner.test.js — cakupan modules/vehicle/sparepart-scanner.js
// (Tahap 7B-1, Fondasi Scanner Sparepart). Hanya bagian LOGIC MURNI yang
// dites di sini (registry adapter, orkestrasi scan()/handleCode(),
// errorMessage()) — bagian pilih-file-dari-galeri & decode ZXing beneran
// (sparepartScannerPickImageFile, sparepartScannerDecodeFromFile) butuh
// DOM/File/ZXing asli browser, TIDAK dites lewat harness node:vm ini, pola
// SAMA PERSIS tests/vehicle-scanner.test.js (vehicleScannerScan/
// buildOverlay juga tidak dites di sana dengan alasan yang sama).
//
// VehicleCatalog.handleScan() DI-STUB (bukan load vehicle-catalog.js asli)
// supaya test ini murni menguji ORKESTRASI sparepart-scanner.js (adapter ->
// handleCode -> VehicleCatalog.handleScan -> toast/UI hook), terpisah dari
// detail implementasi VehicleCatalog itu sendiri (sudah ada test sendiri di
// tests/vehicle-catalog.test.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

function makeCtx(opts) {
  opts = opts || {};
  const toasts = [];
  const handleScanCalls = [];
  const handleScanResult = opts.handleScanResult || (() => ({ found: true, item: { id: 'p1', partName: 'Kampas Rem' } }));
  const vehicleScannerStub = Object.assign({
    ensureZXing: () => Promise.resolve(),
    buildHints: () => ({}),
    errorMessage: (err) => 'VS:' + ((err && err.message) || String(err)),
  }, opts.vehicleScanner || {});
  const ctx = loadSource(
    ['modules/vehicle/sparepart-scanner.js'],
    {
      toast: (msg) => toasts.push(msg),
      VehicleScanner: vehicleScannerStub,
      VehicleCatalog: {
        handleScan: async (code) => {
          handleScanCalls.push(code);
          return handleScanResult(code);
        },
      },
    },
    ['SparepartScanner']
  );
  return { ctx, toasts, handleScanCalls };
}

// ------------------------------------------------------------------------
// Adapter registry
// ------------------------------------------------------------------------
test('registerAdapter()/getAdapter() — adapter "gallery" terdaftar otomatis sesi ini', () => {
  const { ctx } = makeCtx();
  assert.equal(typeof ctx.SparepartScanner.getAdapter('gallery'), 'function');
});

test('listAdapters() — memuat "gallery" (Tahap 7B-1)', () => {
  const { ctx } = makeCtx();
  assert.ok(ctx.SparepartScanner.listAdapters().includes('gallery'));
});

test('listAdapters() — memuat "camera" (Tahap 7B-2, terdaftar otomatis)', () => {
  const { ctx } = makeCtx();
  assert.ok(ctx.SparepartScanner.listAdapters().includes('camera'));
});

test('getAdapter("camera") — mengembalikan fungsi (adapter kamera Tahap 7B-2)', () => {
  const { ctx } = makeCtx();
  assert.equal(typeof ctx.SparepartScanner.getAdapter('camera'), 'function');
});

test('cameraAdapter — diekspos di namespace publik (konsisten dgn pickImageFile/decodeFromFile)', () => {
  const { ctx } = makeCtx();
  assert.equal(typeof ctx.SparepartScanner.cameraAdapter, 'function');
});

test('registerAdapter() — bisa daftar adapter baru (mis. simulasi "camera" utk tahap berikutnya)', () => {
  const { ctx } = makeCtx();
  const ok = ctx.SparepartScanner.registerAdapter('camera', () => Promise.resolve('CAM123'));
  assert.equal(ok, true);
  assert.equal(typeof ctx.SparepartScanner.getAdapter('camera'), 'function');
});

test('registerAdapter() — nama kosong/fn bukan fungsi ditolak (tidak menimpa registry)', () => {
  const { ctx } = makeCtx();
  const ok1 = ctx.SparepartScanner.registerAdapter('', () => {});
  const ok2 = ctx.SparepartScanner.registerAdapter('foo', 'bukan-fungsi');
  assert.equal(ok1, false);
  assert.equal(ok2, false);
  assert.equal(ctx.SparepartScanner.getAdapter('foo'), null);
});

test('getAdapter() — nama tidak terdaftar mengembalikan null', () => {
  const { ctx } = makeCtx();
  assert.equal(ctx.SparepartScanner.getAdapter('tidak-ada'), null);
});

// ------------------------------------------------------------------------
// errorMessage() — reuse VehicleScanner.errorMessage()
// ------------------------------------------------------------------------
test('errorMessage() — reuse penuh VehicleScanner.errorMessage() kalau tersedia', () => {
  const { ctx } = makeCtx();
  const msg = ctx.SparepartScanner.errorMessage(new Error('boom'));
  assert.equal(msg, 'VS:boom');
});

test('errorMessage() — fallback generik kalau VehicleScanner tidak tersedia', () => {
  const ctx = loadSource(
    ['modules/vehicle/sparepart-scanner.js'],
    { toast: () => {}, VehicleCatalog: { handleScan: async () => ({}) } },
    ['SparepartScanner']
  );
  const msg = ctx.SparepartScanner.errorMessage(undefined);
  assert.match(msg, /error tidak diketahui/);
});

// ------------------------------------------------------------------------
// handleCode() — orkestrasi murni: reuse VehicleCatalog.handleScan()
// ------------------------------------------------------------------------
test('handleCode() — kode kosong TIDAK memanggil VehicleCatalog.handleScan(), toast peringatan', async () => {
  const { ctx, toasts, handleScanCalls } = makeCtx();
  const result = await ctx.SparepartScanner.handleCode('   ');
  assert.equal(handleScanCalls.length, 0);
  assert.equal(result.found, false);
  assert.ok(toasts.some((t) => /Tidak ada kode terbaca/.test(t)));
});

test('handleCode() — kode ditemukan (found:true) diteruskan apa adanya dari VehicleCatalog.handleScan()', async () => {
  const { ctx, toasts, handleScanCalls } = makeCtx({
    handleScanResult: () => ({ found: true, item: { id: 'p9', partName: 'Busi NGK' } }),
  });
  const result = await ctx.SparepartScanner.handleCode('BARCODE123');
  assert.deepEqual(handleScanCalls, ['BARCODE123']);
  assert.equal(result.found, true);
  assert.equal(result.item.partName, 'Busi NGK');
  assert.ok(toasts.some((t) => /Part ditemukan/.test(t) && /Busi NGK/.test(t)));
});

test('handleCode() — kode tidak ditemukan (draft:true) diteruskan apa adanya, toast draft', async () => {
  const { ctx, toasts } = makeCtx({
    handleScanResult: () => ({ found: false, item: { id: 'd1', partName: 'Draft — belum diberi nama', barcode: 'XYZ999' }, draft: true }),
  });
  const result = await ctx.SparepartScanner.handleCode('XYZ999');
  assert.equal(result.found, false);
  assert.equal(result.draft, true);
  assert.equal(result.item.barcode, 'XYZ999');
  assert.ok(toasts.some((t) => /draft dibuat/.test(t)));
});

// ------------------------------------------------------------------------
// scan() — orkestrasi penuh lewat adapter registry (adapter di-stub, TIDAK
// menyentuh ZXing/DOM asli)
// ------------------------------------------------------------------------
test('scan() — adapter tidak terdaftar -> toast peringatan, return null, TIDAK memanggil handleScan', async () => {
  const { ctx, toasts, handleScanCalls } = makeCtx();
  const result = await ctx.SparepartScanner.scan('adapter-ngawur');
  assert.equal(result, null);
  assert.equal(handleScanCalls.length, 0);
  assert.ok(toasts.some((t) => /belum tersedia/.test(t)));
});

test('scan() — adapter mengembalikan null (user batal pilih gambar) -> return null, tidak lanjut ke handleScan', async () => {
  const { ctx, handleScanCalls } = makeCtx();
  ctx.SparepartScanner.registerAdapter('stub-empty', () => Promise.resolve(null));
  const result = await ctx.SparepartScanner.scan('stub-empty');
  assert.equal(result, null);
  assert.equal(handleScanCalls.length, 0);
});

test('scan() — adapter sukses mengembalikan kode -> lanjut ke VehicleCatalog.handleScan() via handleCode()', async () => {
  const { ctx, handleScanCalls } = makeCtx({
    handleScanResult: () => ({ found: true, item: { id: 'p1', partName: 'Rantai Motor' } }),
  });
  ctx.SparepartScanner.registerAdapter('stub-ok', () => Promise.resolve('CODE-ABC'));
  const result = await ctx.SparepartScanner.scan('stub-ok');
  assert.deepEqual(handleScanCalls, ['CODE-ABC']);
  assert.equal(result.found, true);
});

test('scan() — default ke adapter "gallery" kalau nama tidak diberikan (dipanggil via registered stub)', async () => {
  const { ctx, handleScanCalls } = makeCtx({
    handleScanResult: () => ({ found: false, item: { id: 'd2' }, draft: true }),
  });
  // Timpa adapter gallery bawaan dengan stub, supaya tidak menyentuh
  // DOM/File input asli — tetap menguji bahwa scan() TANPA argumen
  // memanggil adapter bernama 'gallery'.
  ctx.SparepartScanner.registerAdapter('gallery', () => Promise.resolve('DEFAULT-CODE'));
  const result = await ctx.SparepartScanner.scan();
  assert.deepEqual(handleScanCalls, ['DEFAULT-CODE']);
  assert.equal(result.draft, true);
});

test('scan() — adapter melempar error -> toast pesan gagal (reuse errorMessage()), return null', async () => {
  const { ctx, toasts } = makeCtx();
  ctx.SparepartScanner.registerAdapter('stub-throw', () => Promise.reject(new Error('gagal dekode')));
  const result = await ctx.SparepartScanner.scan('stub-throw');
  assert.equal(result, null);
  assert.ok(toasts.some((t) => /Gagal scan/.test(t) && /gagal dekode/.test(t)));
});
