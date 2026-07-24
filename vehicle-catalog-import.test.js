'use strict';
// tests/vehicle-catalog-import.test.js — cakupan modules/vehicle/vehicle-catalog-import.js
// (Tahap 5: Import Katalog PDF -> OCR -> Parser -> Preview -> Import).
// Hanya bagian LOGIC MURNI yang dites di sini (parseCatalogRow/
// parseCatalogRows/commitRows) — PDF.js/OCR/kamera sungguhan butuh
// browser nyata, sama pola dengan vehicle-scanner.test.js (lihat catatan
// di file itu). commitRows() dites dgn VehicleCatalog.create() palsu
// (bukan store IndexedDB asli) supaya terisolasi dari vehicle-catalog.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

function makeCtx(vehicleCatalogStub) {
  return loadSource(
    ['modules/vehicle/vehicle-catalog-import.js'],
    {
      _loadScriptOnce: () => Promise.resolve(),
      VehicleCatalog: vehicleCatalogStub || {
        // Stub minimal parseLabelText — regex SAMA dgn vehicle-catalog.js
        // asli, disalin di sini supaya test ini tidak butuh load file itu
        // (isolasi murni), dites terpisah di vehicle-catalog.test.js.
        parseLabelText: (text) => {
          const raw = (text || '').toString();
          const barcodeMatch = raw.match(/\b\d{8,14}\b/);
          const oemMatch = raw.match(/\b(?=[A-Za-z0-9-]{5,30}\b)(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{5,30}\b/);
          return { oemCode: oemMatch ? oemMatch[0] : '', barcode: barcodeMatch ? barcodeMatch[0] : '' };
        },
      },
    },
    ['VehicleCatalogImport']
  );
}

// ------------------------------------------------------------------------
// parseCatalogRow() — 1 baris
// ------------------------------------------------------------------------
test('parseCatalogRow() — nama + harga "Rp" terdeteksi, harga tidak ikut ke nama', () => {
  const ctx = makeCtx();
  const row = ctx.VehicleCatalogImport.parseCatalogRow('Kampas Rem Depan Rp50.000');
  assert.equal(row.partName, 'Kampas Rem Depan');
  assert.equal(row.price, 50000);
});

test('parseCatalogRow() — harga format "35rb" dikonversi ke 35000', () => {
  const ctx = makeCtx();
  const row = ctx.VehicleCatalogImport.parseCatalogRow('Filter Oli 35rb');
  assert.equal(row.price, 35000);
});

test('parseCatalogRow() — OEM code terdeteksi & tidak ikut ke nama part', () => {
  const ctx = makeCtx();
  const row = ctx.VehicleCatalogImport.parseCatalogRow('Busi NGK CPR8EA-9 Rp25.000');
  assert.equal(row.oemCode, 'CPR8EA-9');
  assert.ok(!row.partName.includes('CPR8EA-9'));
});

test('parseCatalogRow() — baris kosong menghasilkan row kosong (tidak error)', () => {
  const ctx = makeCtx();
  const row = ctx.VehicleCatalogImport.parseCatalogRow('');
  assert.equal(row.partName, '');
  assert.equal(row.price, null);
});

test('parseCatalogRow() — baris tanpa harga tetap dapat nama part', () => {
  const ctx = makeCtx();
  const row = ctx.VehicleCatalogImport.parseCatalogRow('Kampas Kopling Manual');
  assert.equal(row.partName, 'Kampas Kopling Manual');
  assert.equal(row.price, null);
});

// ------------------------------------------------------------------------
// parseCatalogRows() — banyak baris
// ------------------------------------------------------------------------
test('parseCatalogRows() — baris kosong/header tanpa nama/kode/harga dibuang', () => {
  const ctx = makeCtx();
  const rows = ctx.VehicleCatalogImport.parseCatalogRows('KATALOG SPAREPART\n\nKampas Rem Rp50.000\n\nFilter Oli Rp35.000');
  // "KATALOG SPAREPART" tetap masuk krn ada partName (huruf biasa, tanpa kode/harga) -- itu valid sbg row (bisa diedit user di preview).
  assert.ok(rows.length >= 2);
  assert.ok(rows.some((r) => r.partName === 'Kampas Rem' && r.price === 50000));
  assert.ok(rows.some((r) => r.partName === 'Filter Oli' && r.price === 35000));
});

test('parseCatalogRows() — jumlah baris valid sesuai baris berisi konten', () => {
  const ctx = makeCtx();
  const rows = ctx.VehicleCatalogImport.parseCatalogRows('A Rp1.000\n\n\nB Rp2.000');
  assert.equal(rows.length, 2);
});

// ------------------------------------------------------------------------
// commitRows() — HANYA baris yang dikirim yang di-commit (preview/konfirmasi
// jadi tanggung jawab pemanggil/UI, sesuai Tahap 5)
// ------------------------------------------------------------------------
test('commitRows() — memanggil VehicleCatalog.create() per baris valid, skip baris tanpa nama', async () => {
  const created = [];
  const stub = {
    create: async (data) => { created.push(data); return { success: true, item: Object.assign({ id: 'x' }, data) }; },
  };
  const ctx = makeCtx(stub);
  const result = await ctx.VehicleCatalogImport.commitRows([
    { partName: 'Kampas Rem', price: 50000, oemCode: '' },
    { partName: '', price: 1000 }, // tanpa nama -> skip, TIDAK panggil create()
  ]);
  assert.equal(created.length, 1);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
});

test('commitRows() — mengumpulkan error dari create() yang gagal, tidak melempar exception', async () => {
  const stub = {
    create: async () => ({ success: false, errors: ['Nama part wajib diisi.'] }),
  };
  const ctx = makeCtx(stub);
  const result = await ctx.VehicleCatalogImport.commitRows([{ partName: 'Item Gagal' }]);
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
  assert.ok(result.errors.length >= 1);
});

test('commitRows() — array kosong menghasilkan ringkasan nol tanpa error', async () => {
  const ctx = makeCtx({ create: async () => ({ success: true, item: {} }) });
  const result = await ctx.VehicleCatalogImport.commitRows([]);
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 0);
});
