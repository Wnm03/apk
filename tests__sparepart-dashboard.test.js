'use strict';
// tests/sparepart-dashboard.test.js — cakupan Sparepart.calcDashboardStats()
// di modules/vehicle/sparepart-servis.js (Tahap 8C, Dashboard Inventaris).
// Fungsi ini MURNI (cuma array in -> object out, tidak sentuh DOM), jadi
// dites langsung lewat loadSource() tanpa stub DOM, sama pola dgn
// tests/sparepart-ocr-parser.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

function makeCtx() {
  // MY_WRENCH biasanya didefinisikan di car-notes.js (fitur Torsi Sparepart,
  // tidak terkait Dashboard Inventaris) tapi dipakai top-level di file ini
  // utk hitung MY_WRENCH_SCALE saat file di-load -- disuntik minimal di sini
  // supaya sparepart-servis.js bisa di-load sendirian tanpa car-notes.js.
  return loadSource(
    ['modules/vehicle/sparepart-servis.js'],
    { MY_WRENCH: { brand: 'MOLLAR', sku: 'MLR-B11950', minNm: 13.56, maxNm: 108.48, minLbft: 10, maxLbft: 80, panjang: 280 } },
    ['Sparepart']
  );
}

test('calcDashboardStats() — kosong: semua field default aman', () => {
  const ctx = makeCtx();
  const stats = ctx.Sparepart.calcDashboardStats([], []);
  assert.deepEqual(stats.low, []);
  assert.deepEqual(stats.habis, []);
  assert.equal(stats.topPart, null);
  assert.equal(stats.topCount, 0);
  assert.equal(stats.nilaiPersediaan, 0);
  assert.equal(stats.avgPrice, 0);
  assert.equal(stats.lastPurchase, null);
  assert.deepEqual(stats.chartData, []);
});

test('calcDashboardStats() — nilaiPersediaan, low & habis tidak berubah (perilaku lama, Tahap 7E-5)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'Oli Mesin', qty: 1, minStock: 2, price: 50000 }, // low
    { id: 'p2', name: 'Kampas Rem', qty: 0, minStock: 1, price: 30000 }, // habis
    { id: 'p3', name: 'Busi', qty: 10, minStock: 2, price: 15000 }, // aman
  ];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, []);
  assert.equal(stats.low.length, 1);
  assert.equal(stats.low[0].id, 'p1');
  assert.equal(stats.habis.length, 1);
  assert.equal(stats.habis[0].id, 'p2');
  // nilaiPersediaan = sum(qty*price) utk qty>0 saja
  assert.equal(stats.nilaiPersediaan, 1 * 50000 + 10 * 15000);
});

test('calcDashboardStats() — topPart & topCount dari usageCount servisLogs (perilaku lama)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'Oli Mesin', qty: 5, minStock: 1, price: 50000 },
    { id: 'p2', name: 'Kampas Rem', qty: 5, minStock: 1, price: 30000 },
  ];
  const servisLogs = [
    { usedPartId: 'p1' },
    { usedPartId: 'p1' },
    { catalogPartLinkedStockId: 'p2' },
  ];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, servisLogs);
  assert.equal(stats.topPart.id, 'p1');
  assert.equal(stats.topCount, 2);
});

test('calcDashboardStats() — avgPrice cuma dari item yg price > 0 (baru, Tahap 8C)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'A', qty: 1, price: 10000 },
    { id: 'p2', name: 'B', qty: 1, price: 30000 },
    { id: 'p3', name: 'C (belum ada harga)', qty: 1, price: 0 },
  ];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, []);
  assert.equal(stats.avgPrice, (10000 + 30000) / 2);
});

test('calcDashboardStats() — lastPurchase ambil lastPurchaseDate paling baru (baru, Tahap 8C)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'Oli Mesin', qty: 1, price: 50000, lastPurchaseDate: '2026-05-01' },
    { id: 'p2', name: 'Kampas Rem', qty: 1, price: 30000, lastPurchaseDate: '2026-07-20' },
    { id: 'p3', name: 'Belum pernah dibeli via tx', qty: 1, price: 20000 },
  ];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, []);
  assert.equal(stats.lastPurchase.id, 'p2');
});

test('calcDashboardStats() — lastPurchase null kalau tidak ada item dengan lastPurchaseDate', () => {
  const ctx = makeCtx();
  const partsStock = [{ id: 'p1', name: 'A', qty: 1, price: 10000 }];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, []);
  assert.equal(stats.lastPurchase, null);
});

test('calcDashboardStats() — chartData maks 5 item, diurutkan nilai stok terbesar, item qty<=0/price<=0 dibuang (baru, Tahap 8C)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'A', qty: 2, price: 10000 }, // 20000
    { id: 'p2', name: 'B', qty: 1, price: 100000 }, // 100000
    { id: 'p3', name: 'C', qty: 0, price: 50000 }, // dibuang (qty 0)
    { id: 'p4', name: 'D', qty: 5, price: 0 }, // dibuang (price 0)
    { id: 'p5', name: 'E', qty: 3, price: 3000 }, // 9000
    { id: 'p6', name: 'F', qty: 1, price: 1000 }, // 1000
    { id: 'p7', name: 'G', qty: 1, price: 2000 }, // 2000
  ];
  const stats = ctx.Sparepart.calcDashboardStats(partsStock, []);
  assert.equal(stats.chartData.length, 5);
  assert.equal(stats.chartData[0].name, 'B');
  assert.equal(stats.chartData[0].value, 100000);
  assert.ok(stats.chartData.every((c) => c.value > 0));
});

// calcFinanceStats() — Tahap 8D, dipakai FinanceDashboard._sparepartCards()
// (modules/finance/finance-dashboard.js).

test('calcFinanceStats() — kosong: semua field default aman', () => {
  const ctx = makeCtx();
  const stats = ctx.Sparepart.calcFinanceStats([], []);
  assert.equal(stats.totalPembelian, 0);
  assert.equal(stats.totalNilaiStok, 0);
  assert.equal(stats.totalNilaiTerpakai, 0);
  assert.equal(stats.biayaServisSparepart, 0);
  assert.deepEqual(stats.trenPembelianBulanan, []);
  assert.deepEqual(stats.trenPemakaianBulanan, []);
});

test('calcFinanceStats() — totalPembelian dari priceHistory lintas semua part', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'Oli Mesin', qty: 3, price: 50000, priceHistory: [
      { date: '2026-06-01', qty: 2, price: 48000 },
      { date: '2026-07-01', qty: 1, price: 52000 },
    ] },
    { id: 'p2', name: 'Kampas Rem', qty: 1, price: 30000, priceHistory: [
      { date: '2026-07-10', qty: 1, price: 30000 },
    ] },
  ];
  const stats = ctx.Sparepart.calcFinanceStats(partsStock, []);
  assert.equal(stats.totalPembelian, 2 * 48000 + 1 * 52000 + 1 * 30000);
});

test('calcFinanceStats() — totalNilaiStok sama persis rumus nilaiPersediaan (qty>0 saja)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'A', qty: 2, price: 10000 },
    { id: 'p2', name: 'B', qty: 0, price: 99999 },
    { id: 'p3', name: 'C', qty: 5, price: 3000 },
  ];
  const stats = ctx.Sparepart.calcFinanceStats(partsStock, []);
  assert.equal(stats.totalNilaiStok, 2 * 10000 + 5 * 3000);
});

test('calcFinanceStats() — totalNilaiTerpakai dari usedPartId & catalogPartLinkedStockId (harga part saat ini)', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'Oli Mesin', qty: 5, price: 50000 },
    { id: 'p2', name: 'Kampas Rem', qty: 5, price: 30000 },
  ];
  const servisLogs = [
    { date: '2026-07-01', usedPartId: 'p1', usedPartQty: 2, cost: 150000 },
    { date: '2026-07-15', catalogPartLinkedStockId: 'p2', catalogPartQty: 1, cost: 80000 },
    { date: '2026-07-20', cost: 50000 }, // servis jasa, tidak pakai sparepart dari stok
  ];
  const stats = ctx.Sparepart.calcFinanceStats(partsStock, servisLogs);
  assert.equal(stats.totalNilaiTerpakai, 2 * 50000 + 1 * 30000);
});

test('calcFinanceStats() — biayaServisSparepart cuma dari servis yang pakai part dari stok', () => {
  const ctx = makeCtx();
  const partsStock = [{ id: 'p1', name: 'Oli Mesin', qty: 5, price: 50000 }];
  const servisLogs = [
    { date: '2026-07-01', usedPartId: 'p1', usedPartQty: 1, cost: 150000 },
    { date: '2026-07-05', cost: 75000 }, // servis jasa tanpa part
  ];
  const stats = ctx.Sparepart.calcFinanceStats(partsStock, servisLogs);
  assert.equal(stats.biayaServisSparepart, 150000);
});

test('calcFinanceStats() — trenPembelianBulanan & trenPemakaianBulanan dikelompokkan per bulan, urut kronologis, maks 6 bulan terakhir', () => {
  const ctx = makeCtx();
  const partsStock = [
    { id: 'p1', name: 'A', qty: 5, price: 10000, priceHistory: [
      { date: '2026-05-01', qty: 1, price: 10000 },
      { date: '2026-07-01', qty: 2, price: 10000 },
      { date: '2026-07-15', qty: 1, price: 10000 },
    ] },
  ];
  const servisLogs = [
    { date: '2026-06-01', usedPartId: 'p1', usedPartQty: 1, cost: 20000 },
    { date: '2026-07-01', usedPartId: 'p1', usedPartQty: 2, cost: 40000 },
  ];
  const stats = ctx.Sparepart.calcFinanceStats(partsStock, servisLogs);
  assert.deepEqual(stats.trenPembelianBulanan.map((t) => t.month), ['2026-05', '2026-07']);
  assert.equal(stats.trenPembelianBulanan[1].total, 2 * 10000 + 1 * 10000);
  assert.deepEqual(stats.trenPemakaianBulanan.map((t) => t.month), ['2026-06', '2026-07']);
  assert.equal(stats.trenPemakaianBulanan[1].total, 2 * 10000);
});
