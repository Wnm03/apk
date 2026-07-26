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

test('commitRows() — baris dengan oemCode/barcode yang sudah ada di katalog dilewati sebagai duplikat, TIDAK panggil create()', async () => {
  const created = [];
  const stub = {
    findByCode: async (code) => (code === 'CPR8EA-9' ? { id: 'existing' } : null),
    create: async (data) => { created.push(data); return { success: true, item: Object.assign({ id: 'x' }, data) }; },
  };
  const ctx = makeCtx(stub);
  const result = await ctx.VehicleCatalogImport.commitRows([
    { partName: 'Busi NGK', oemCode: 'CPR8EA-9' },
    { partName: 'Kampas Rem', oemCode: '' },
  ]);
  assert.equal(created.length, 1);
  assert.equal(result.imported, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.skipped, 1);
});

// ------------------------------------------------------------------------
// extractPdfText() — edge case PDF kosong/rusak
// ------------------------------------------------------------------------
function makeCtxWithPdfjs(pdfjsStub) {
  return loadSource(
    ['modules/vehicle/vehicle-catalog-import.js'],
    {
      _loadScriptOnce: () => Promise.resolve(),
      pdfjsLib: pdfjsStub,
      VehicleCatalog: { parseLabelText: () => ({ oemCode: '', barcode: '' }) },
    },
    ['VehicleCatalogImport']
  );
}

test('extractPdfText() — file kosong (size 0) langsung ditolak tanpa panggil pdf.js', async () => {
  const ctx = makeCtxWithPdfjs({ getDocument: () => { throw new Error('tidak boleh dipanggil'); } });
  await assert.rejects(
    () => ctx.VehicleCatalogImport.extractPdfText({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) }),
    /kosong/i
  );
});

test('extractPdfText() — file PDF rusak (pdf.js gagal parse) menghasilkan error pesan jelas', async () => {
  const ctx = makeCtxWithPdfjs({
    getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure')) }),
  });
  await assert.rejects(
    () => ctx.VehicleCatalogImport.extractPdfText({ size: 10, arrayBuffer: async () => new ArrayBuffer(10) }),
    /rusak|tidak valid/i
  );
});

test('extractPdfText() — PDF valid tanpa halaman (numPages 0) menghasilkan string kosong, tidak error', async () => {
  const ctx = makeCtxWithPdfjs({
    getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) }),
  });
  const text = await ctx.VehicleCatalogImport.extractPdfText({ size: 10, arrayBuffer: async () => new ArrayBuffer(10) });
  assert.equal(text, '');
});

test('filterCompleteRows() — default (requirePrice tidak diisi) tetap wajibkan kode+harga, sama perilaku lama', () => {
  const ctx = makeCtx();
  const rows = [
    { partName: 'Kampas Rem', oemCode: '12310-KZR-701', price: 50000 }, // lengkap
    { partName: 'Filter Oli', oemCode: '15410-KFF-701', price: null }, // kode ada, harga kosong -> buang
    { partName: 'Tanpa Kode', oemCode: '', barcode: '', price: 50000 }, // harga ada, kode kosong -> buang
  ];
  const result = ctx.VehicleCatalogImport.filterCompleteRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].partName, 'Kampas Rem');
});

test('filterCompleteRows() — requirePrice:false, cukup kode part (oemCode ATAU barcode), harga boleh kosong/null/0', () => {
  const ctx = makeCtx();
  const rows = [
    { partName: 'Kampas Rem', oemCode: '12310-KZR-701', price: 50000 }, // kode+harga
    { partName: 'Filter Oli', oemCode: '15410-KFF-701', price: null }, // kode saja, harga null -> tetap lolos
    { partName: 'Busi', oemCode: '', barcode: '31916847740', price: 0 }, // barcode + harga 0 -> tetap lolos (barcode ada)
    { partName: 'Tanpa Kode', oemCode: '', barcode: '', price: 50000 }, // tidak ada kode sama sekali -> tetap dibuang
  ];
  const result = ctx.VehicleCatalogImport.filterCompleteRows(rows, { requirePrice: false });
  assert.equal(result.length, 3);
  assert.ok(result.some((r) => r.partName === 'Filter Oli'));
  assert.ok(result.some((r) => r.partName === 'Busi'));
  assert.ok(!result.some((r) => r.partName === 'Tanpa Kode'));
});

// ------------------------------------------------------------------------
// parseCatalogRows() — BUGFIX baris kode yatim akibat page-break PDF
// (laporan user: PDF katalog Honda Cengkareng Vario Techno 125, kode
// 17111KZR650 / 17533KZR650 / 12209GB4681 kebaca kode-nya doang, nama+
// harga kosong). Reproduksi pakai kode ASLI dari PDF tsb yang kebelah
// persis di sekitar page-break (header "Kategori Kode Part Nama Part
// Harga" berulang tiap ganti halaman di PDF sumbernya).
// ------------------------------------------------------------------------
test('parseCatalogRows() — baris kode yatim (page-break) tergabung dgn baris nama+harga sesudahnya', () => {
  const ctx = makeCtx();
  const text = [
    '957010609500 BOLT FLANGE 6X95 Rp 5.000',
    '17111KZR650',
    'PIPE INLET Rp 135.500',
    '17533KZR650',
    'STAY COMP., FUEL HOSE CLAMPER Rp 9.500',
  ].join('\n');
  const rows = ctx.VehicleCatalogImport.parseCatalogRows(text);
  const inlet = rows.find((r) => r.oemCode === '17111KZR650');
  const stay = rows.find((r) => r.oemCode === '17533KZR650');
  assert.ok(inlet, 'baris 17111KZR650 harus ketemu');
  assert.equal(inlet.partName, 'PIPE INLET');
  assert.equal(inlet.price, 135500);
  assert.ok(stay, 'baris 17533KZR650 harus ketemu');
  assert.equal(stay.partName, 'STAY COMP., FUEL HOSE CLAMPER');
  assert.equal(stay.price, 9500);
  assert.ok(!rows.some((r) => !r.oemCode && !r.barcode && r.partName === 'PIPE INLET'));
});

test('parseCatalogRows() — baris kode yatim di awal kategori baru (12209GB4681) juga tertangani', () => {
  const ctx = makeCtx();
  const text = [
    '90206001000 NUT,TAPPET ADJUST Rp 25.500',
    '12209GB4681',
    'SEAL,VALVE STEM Rp 6.000',
    '12209GB4682 SEAL,VALVE STEM Rp 6.000',
  ].join('\n');
  const rows = ctx.VehicleCatalogImport.parseCatalogRows(text);
  const seal1 = rows.find((r) => r.oemCode === '12209GB4681');
  const seal2 = rows.find((r) => r.oemCode === '12209GB4682');
  assert.ok(seal1);
  assert.equal(seal1.partName, 'SEAL,VALVE STEM');
  assert.equal(seal1.price, 6000);
  assert.ok(seal2);
  assert.equal(seal2.partName, 'SEAL,VALVE STEM');
  assert.equal(seal2.price, 6000);
});

test('parseCatalogRows() — baris kode yatim TIDAK digabung kalau baris sesudahnya ternyata part lain (punya kode sendiri)', () => {
  const ctx = makeCtx();
  const text = ['17111KZR650', '12209GB4681 SEAL,VALVE STEM Rp 6.000'].join('\n');
  const rows = ctx.VehicleCatalogImport.parseCatalogRows(text);
  const seal = rows.find((r) => r.oemCode === '12209GB4681');
  assert.ok(seal, 'part kedua yg valid tidak boleh ikut rusak/hilang');
  assert.equal(seal.partName, 'SEAL,VALVE STEM');
  assert.equal(seal.price, 6000);
});

// ------------------------------------------------------------------------
// parseCatalogRows() — BUGFIX LANJUTAN: kode, nama, DAN harga masing-
// masing kepisah jadi 3 baris sendiri-sendiri (bukan cuma 2 baris seperti
// kasus di atas) -- lookahead 1 baris (fix lama) cuma nyambung kode+nama,
// harganya tetap hilang. Sekarang harus tersambung sampai 3 baris.
// ------------------------------------------------------------------------
test('parseCatalogRows() — kode, nama, dan harga di 3 baris terpisah sendiri-sendiri tetap tergabung lengkap', () => {
  const ctx = makeCtx();
  const text = [
    '957010609500 BOLT FLANGE 6X95 Rp 5.000',
    '17111KZR650',
    'PIPE INLET',
    'Rp 135.500',
    '17533KZR650',
    'STAY COMP., FUEL HOSE CLAMPER Rp 9.500',
  ].join('\n');
  const rows = ctx.VehicleCatalogImport.parseCatalogRows(text);
  const inlet = rows.find((r) => r.oemCode === '17111KZR650');
  assert.ok(inlet, 'baris 17111KZR650 harus ketemu');
  assert.equal(inlet.partName, 'PIPE INLET');
  assert.equal(inlet.price, 135500, 'harga TIDAK boleh hilang walau ada di baris ke-3 terpisah');
  // Part sesudahnya (kasus 2-baris biasa) tidak boleh ikut rusak/tertelan.
  const stay = rows.find((r) => r.oemCode === '17533KZR650');
  assert.ok(stay);
  assert.equal(stay.partName, 'STAY COMP., FUEL HOSE CLAMPER');
  assert.equal(stay.price, 9500);
});

test('parseCatalogRows() — kode+nama+harga 3 baris terpisah, TETAP berhenti kalau baris ke-3 ternyata sudah part lain (batas aman, tidak menelan part berikutnya)', () => {
  const ctx = makeCtx();
  const text = [
    '17111KZR650',
    'PIPE INLET',
    '12209GB4681 SEAL,VALVE STEM Rp 6.000',
  ].join('\n');
  const rows = ctx.VehicleCatalogImport.parseCatalogRows(text);
  const seal = rows.find((r) => r.oemCode === '12209GB4681');
  assert.ok(seal, 'part berikutnya yg valid tidak boleh ikut tertelan');
  assert.equal(seal.partName, 'SEAL,VALVE STEM');
  assert.equal(seal.price, 6000);
  // 17111KZR650 hanya sempat gabung dgn "PIPE INLET" (partName ada, harga
  // masih kosong krn baris berikutnya sudah dianggap part lain) -- itu
  // masih lebih baik drpd kode yatim kosong total, dan part lain TIDAK
  // ikut rusak.
  const inlet = rows.find((r) => r.oemCode === '17111KZR650');
  assert.ok(inlet);
  assert.equal(inlet.partName, 'PIPE INLET');
  assert.equal(inlet.price, null);
});
