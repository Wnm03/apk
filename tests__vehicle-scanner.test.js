'use strict';
// tests/vehicle-scanner.test.js — cakupan modules/vehicle/vehicle-scanner.js
// Hanya bagian LOGIC MURNI (vehicleScannerErrorMessage, vehicleScannerBuildHints)
// yang dites di sini — bagian kamera/decode fullscreen live-video
// (vehicleScannerScan, vehicleScannerBuildOverlay) butuh DOM/MediaStream/ZXing
// asli browser, sama seperti scanKmOdometer dkk di scan-ocr.js TIDAK dites
// lewat harness node:vm ini (lihat catatan di tests/scan-ocr-wallet.test.js —
// hanya parseWalletScreen() yang murni logic yang dites, bukan scan
// trigger-nya). Konsisten dengan pola existing, bukan lubang baru.
//
// vehicleScannerBuildHints() dites dgn stub ZXing minimal (bukan library asli
// dari CDN) — cukup untuk memverifikasi format yang di-request (Barcode/QR/
// DataMatrix) tanpa butuh browser/network.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/loadSource');

const ZXING_STUB = {
  DecodeHintType: { POSSIBLE_FORMATS: 'POSSIBLE_FORMATS', TRY_HARDER: 'TRY_HARDER' },
  BarcodeFormat: {
    QR_CODE: 'QR_CODE', DATA_MATRIX: 'DATA_MATRIX', CODE_128: 'CODE_128',
    CODE_39: 'CODE_39', EAN_13: 'EAN_13', EAN_8: 'EAN_8', UPC_A: 'UPC_A',
    UPC_E: 'UPC_E', ITF: 'ITF', CODABAR: 'CODABAR',
  },
};

function makeCtx() {
  return loadSource(
    ['modules/vehicle/vehicle-scanner.js'],
    { _loadScriptOnce: () => Promise.resolve(), toast: () => {}, ZXing: ZXING_STUB },
    ['vehicleScannerErrorMessage', 'vehicleScannerBuildHints']
  );
}

test('vehicleScannerBuildHints() — QR Code diaktifkan', () => {
  const ctx = makeCtx();
  const hints = ctx.vehicleScannerBuildHints();
  const formats = hints.get('POSSIBLE_FORMATS');
  assert.ok(formats.includes('QR_CODE'));
});

test('vehicleScannerBuildHints() — DataMatrix diaktifkan eksplisit (tidak default di ZXing)', () => {
  const ctx = makeCtx();
  const hints = ctx.vehicleScannerBuildHints();
  const formats = hints.get('POSSIBLE_FORMATS');
  assert.ok(formats.includes('DATA_MATRIX'));
});

test('vehicleScannerBuildHints() — Barcode 1D umum diaktifkan (mis. CODE_128, EAN_13)', () => {
  const ctx = makeCtx();
  const hints = ctx.vehicleScannerBuildHints();
  const formats = hints.get('POSSIBLE_FORMATS');
  assert.ok(formats.includes('CODE_128'));
  assert.ok(formats.includes('EAN_13'));
});

test('vehicleScannerBuildHints() — TRY_HARDER diaktifkan utk akurasi scan live', () => {
  const ctx = makeCtx();
  const hints = ctx.vehicleScannerBuildHints();
  assert.equal(hints.get('TRY_HARDER'), true);
});

test('vehicleScannerErrorMessage() — error jaringan dikasih pesan jelas', () => {
  const ctx = makeCtx();
  const msg = ctx.vehicleScannerErrorMessage(new Error('failed to fetch'));
  assert.match(msg, /koneksi internet/);
});

test('vehicleScannerErrorMessage() — NotFoundException (kode tidak terdeteksi) dikasih pesan jelas', () => {
  const ctx = makeCtx();
  const msg = ctx.vehicleScannerErrorMessage({ message: 'NotFoundException: No code found' });
  assert.match(msg, /tidak terdeteksi/);
});

test('vehicleScannerErrorMessage() — izin kamera ditolak dikasih pesan jelas', () => {
  const ctx = makeCtx();
  const msg = ctx.vehicleScannerErrorMessage({ message: 'NotAllowedError: Permission denied' });
  assert.match(msg, /izin kamera/);
});

test('vehicleScannerErrorMessage() — error lain apa adanya', () => {
  const ctx = makeCtx();
  const msg = ctx.vehicleScannerErrorMessage(new Error('Something else broke'));
  assert.equal(msg, 'Something else broke');
});

test('vehicleScannerErrorMessage() — tanpa error message sama sekali, fallback generik', () => {
  const ctx = makeCtx();
  const msg = ctx.vehicleScannerErrorMessage(undefined);
  assert.match(msg, /error tidak diketahui/);
});
