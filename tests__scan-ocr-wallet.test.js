'use strict';
// tests/scan-ocr-wallet.test.js — cakupan parseWalletScreen() di
// modules/shared/scan-ocr.js (BUGFIX laporan user: scan GoPay ke-baca
// angka pengeluaran bulanan "Rp937.000 sudah terpakai di Juli", bukan
// saldo utama "Rp154.834").

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

function makeCtx() {
  // normalizeOcrNumber() dipakai parseWalletScreen() tapi didefinisikan di
  // pajak-aset-ui-wrappers.js (global, sama seperti di app asli) — dimuat
  // bareng supaya tidak ReferenceError.
  return loadSource(['pajak-aset-ui-wrappers.js', 'modules/shared/scan-ocr.js'], {}, ['parseWalletScreen']);
}

test('parseWalletScreen() — saldo utama diambil, BUKAN angka "sudah terpakai" di bawahnya', () => {
  const ctx = makeCtx();
  // Perkiraan teks OCR layar GoPay dari laporan user: saldo utama duluan,
  // lalu baris rekap pengeluaran bulan ini.
  const text = 'GoPay\nRp154.834\n500 Coins\nRp937.000 sudah terpakai di Juli\n';
  const result = ctx.parseWalletScreen(text);
  assert.equal(result.nama, 'GoPay');
  assert.equal(result.nominal, 154834);
});

test('parseWalletScreen() — angka "sudah terpakai" tetap disaring walau saldo utama tidak diakhiri newline', () => {
  const ctx = makeCtx();
  const text = 'GoPay\nRp 154.834 \n500 Coins\nRp937.000 sudah terpakai di Juli\n';
  const result = ctx.parseWalletScreen(text);
  assert.equal(result.nominal, 154834);
});

test('parseWalletScreen() — DANA tanpa anotasi pengeluaran tetap terbaca seperti biasa', () => {
  const ctx = makeCtx();
  const text = 'DANA\nSaldo\nRp250.000\n';
  const result = ctx.parseWalletScreen(text);
  assert.equal(result.nama, 'DANA');
  assert.equal(result.nominal, 250000);
});

test('parseWalletScreen() — kalau SEMUA kandidat kebetulan ke-flag "terpakai", tetap fallback ke kandidat pertama (bukan null)', () => {
  const ctx = makeCtx();
  const text = 'GoPay\nRp937.000 sudah terpakai di Juli\n';
  const result = ctx.parseWalletScreen(text);
  assert.equal(result.nominal, 937000);
});

test('parseWalletScreen() — teks kosong/tidak ada Rp -> nominal null, confidence 0', () => {
  const ctx = makeCtx();
  const result = ctx.parseWalletScreen('GoPay\nTidak ada saldo terbaca\n');
  assert.equal(result.nominal, null);
  assert.equal(result.confidence, 0);
});
