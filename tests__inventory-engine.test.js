'use strict';
// tests/inventory-engine.test.js — cakupan modules/shop/inventory-engine.js
// (S198, Business Engine untuk Shop). InventoryEngine delegasi ke
// Etalase.*/StockRekoWidget.* (cobek-etalase.js/cobek-pricing.js) — harness
// perlu memuat kedua file itu, pola sama tests/cobek-vehicle-capacity.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

function makeCtx(D) {
  return loadSource(
    ['modules/shop/cobek-etalase.js', 'modules/shop/cobek-pricing.js', 'modules/shop/inventory-engine.js'],
    { D: D || { products: [], cobekKategori: [] } },
    ['InventoryEngine'],
  );
}

// --- stockStatus ------------------------------------------------------

test('stockStatus() — stock<=2 -> low/Menipis', () => {
  const ctx = makeCtx();
  const r = ctx.InventoryEngine.stockStatus({ stock: 2 });
  assert.equal(r.cls, 'low');
  assert.equal(r.label, 'Menipis');
});

test('stockStatus() — stock 3-5 -> mid/Terbatas', () => {
  const ctx = makeCtx();
  const r = ctx.InventoryEngine.stockStatus({ stock: 5 });
  assert.equal(r.cls, 'mid');
  assert.equal(r.label, 'Terbatas');
});

test('stockStatus() — stock>5 -> ok/Aman', () => {
  const ctx = makeCtx();
  const r = ctx.InventoryEngine.stockStatus({ stock: 6 });
  assert.equal(r.cls, 'ok');
  assert.equal(r.label, 'Aman');
});

test('stockStatus() — produk kosong/stock undefined dianggap 0 (low)', () => {
  const ctx = makeCtx();
  assert.equal(ctx.InventoryEngine.stockStatus(null).cls, 'low');
});

// --- totalModalStok / totalNilaiJualStok -------------------------------

test('totalModalStok()/totalNilaiJualStok() — parameter eksplisit tidak baca D', () => {
  const ctx = makeCtx();
  const products = [{ stock: 2, hargaBeli: 1000, hargaJual: 3000 }, { stock: 3, hargaBeli: 500, hargaJual: 1500 }];
  assert.equal(ctx.InventoryEngine.totalModalStok(products), 3500);
  assert.equal(ctx.InventoryEngine.totalNilaiJualStok(products), 10500);
});

test('totalModalStok() — tanpa parameter, fallback ke Etalase.totalModalStok() (D.products)', () => {
  const D = { products: [{ stock: 4, hargaBeli: 1000, hargaJual: 2000 }], cobekKategori: [] };
  const ctx = makeCtx(D);
  assert.equal(ctx.InventoryEngine.totalModalStok(), 4000);
  assert.equal(ctx.InventoryEngine.totalNilaiJualStok(), 8000);
});

// --- pairKey / bracketRange / linkedSiblings — delegasi ke Etalase --------

test('pairKey() — produk ukuran ganjil-genap sebracket punya pairKey sama', () => {
  const D = {
    products: [
      { id: 'a', name: 'Lumpang 19cm' },
      { id: 'b', name: 'Lumpang 20cm' },
    ],
    cobekKategori: [],
  };
  const ctx = makeCtx(D);
  const keyA = ctx.InventoryEngine.pairKey(D.products[0]);
  const keyB = ctx.InventoryEngine.pairKey(D.products[1]);
  assert.equal(keyA, keyB);
});

test('bracketRange() — null utk shape yang dikecualikan (alu/muntu)', () => {
  const D = { products: [{ id: 'a', name: 'Alu 15cm' }], cobekKategori: [] };
  const ctx = makeCtx(D);
  assert.equal(ctx.InventoryEngine.bracketRange(D.products[0]), null);
});

test('linkedSiblings() — balikin produk pasangan ukuran (bukan diri sendiri)', () => {
  const D = {
    products: [
      { id: 'a', name: 'Cobek 19cm' },
      { id: 'b', name: 'Cobek 20cm' },
      { id: 'c', name: 'Alu 15cm' },
    ],
    cobekKategori: [],
  };
  const ctx = makeCtx(D);
  const siblings = ctx.InventoryEngine.linkedSiblings(D.products[0]);
  assert.equal(siblings.length, 1);
  assert.equal(siblings[0].id, 'b');
});

// --- restockScan ---------------------------------------------------------

test('restockScan() — delegasi ke StockRekoWidget.scan(), balikin ok:true & items array', () => {
  const D = { products: [], cobekKategori: [], cobek: [] };
  const ctx = makeCtx(D);
  const r = ctx.InventoryEngine.restockScan();
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.items));
});
