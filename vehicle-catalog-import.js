// vehicle-catalog-import.js — Tahap 5: Import Katalog (PDF -> OCR -> Parser
// -> Preview -> Import), logic murni (parsing/orchestration), TIDAK
// menyentuh DOM. Lanjutan dari ACR-001/Vehicle Catalog, mengikuti Project
// Decision sesi ini.
//
// KEPUTUSAN PRODUK SESI INI (dipakai tanpa klarifikasi ulang lagi, sama
// pola dgn keputusan library ZXing di vehicle-scanner.js Tahap 2):
// - Library baca PDF: pdf.js (pdfjs-dist), CDN jsDelivr + lazy-load via
//   _loadScriptOnce() (pola sama existing) — dibutuhkan karena repo ini
//   belum pernah baca file PDF sama sekali sebelumnya (audit: tidak ada
//   pdf.js/PDFLib di manapun), jadi ini keputusan teknis wajib supaya
//   "PDF -> OCR" bisa jalan, bukan keputusan produk baru di luar cakupan
//   yang sudah ditetapkan (TAHAP 5 sudah eksplisit menyebut "PDF").
// - Alur baca per halaman: coba text layer NATIF pdf.js dulu
//   (`page.getTextContent()` — akurat & cepat untuk PDF katalog hasil
//   export/cetak digital). Kalau teks yang didapat suatu halaman kosong/
//   terlalu pendek (indikasi halaman hasil SCAN/gambar, bukan teks asli),
//   BARU fallback render halaman ke <canvas> lalu OCR pakai
//   `ocrRecognize()` yang SUDAH ADA (Tesseract, scan-ocr.js) — TIDAK ada
//   OCR engine baru, reuse penuh, konsisten dgn "Reuse OCR engine yang
//   SUDAH ADA" di Tahap 3 (handleOcrLabel).
// - Parser: 1 baris teks = 1 kandidat part. Regex OEM code & barcode REUSE
//   `VehicleCatalog.parseLabelText()` yang SUDAH ADA (guard typeof, pola
//   adapter tipis sama seperti modul lain) per baris, ditambah 1 regex
//   baru khusus harga (`Rp`/angka ribuan) karena baris katalog biasanya
//   "Nama Part ... Rp50.000" — kebutuhan yang belum ada sebelumnya karena
//   Tahap 3 (label kemasan) fokus ke 1 kode per foto, bukan tabel katalog.
// - Preview WAJIB sebelum import (Tahap 5: "Jangan langsung mengubah
//   database tanpa preview dan konfirmasi pengguna") — file ini hanya
//   menyiapkan array baris hasil parse (bukan langsung create()); commit
//   ke database ada di importCatalogRows(rows), dipanggil UI HANYA
//   setelah user mengonfirmasi baris mana yang dicentang (lihat
//   vehicle-catalog-import-ui.js).

const VEHICLE_IMPORT_PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const VEHICLE_IMPORT_PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

async function ensurePdfJs() {
  await _loadScriptOnce(VEHICLE_IMPORT_PDFJS_URL);
  if (typeof pdfjsLib !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = VEHICLE_IMPORT_PDFJS_WORKER_URL;
  }
}

// Render 1 halaman PDF ke Blob JPEG (via <canvas>), dipakai HANYA sebagai
// fallback OCR utk halaman yang tidak punya text layer (hasil scan/gambar).
function _vehicleImportRenderPageToBlob(page) {
  return new Promise((resolve, reject) => {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    page.render({ canvasContext: ctx, viewport }).promise
      .then(() => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal render halaman PDF'))), 'image/jpeg', 0.9))
      .catch(reject);
  });
}

/** extractPdfText(file) — baca SEMUA halaman PDF, gabung jadi 1 string teks
 * (dipisah newline per baris/item). Text layer natif diutamakan; fallback
 * OCR per halaman kalau text layer kosong/terlalu pendek (<10 karakter). */
async function vehicleImportExtractPdfText(file) {
  await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const nativeText = content.items.map((it) => it.str).join('\n').trim();
    if (nativeText.length >= 10) {
      pageTexts.push(nativeText);
      continue;
    }
    // Fallback OCR — reuse ocrRecognize() (Tesseract) yang SUDAH ADA,
    // guard typeof supaya tetap aman kalau scan-ocr.js belum termuat.
    if (typeof ocrRecognize === 'function') {
      try {
        const blob = await _vehicleImportRenderPageToBlob(page);
        const ocrResult = await ocrRecognize(blob);
        const ocrText = (ocrResult && ocrResult.data && ocrResult.data.text) ? ocrResult.data.text.trim() : '';
        if (ocrText) pageTexts.push(ocrText);
      } catch (err) {
        console.warn('[VehicleCatalogImport] OCR halaman ' + i + ' gagal, dilewati:', err);
      }
    }
  }
  return pageTexts.join('\n');
}

// Harga: "Rp50.000" / "Rp 50000" / "50.000" / "50rb" di ujung baris —
// SATU regex baru (tidak ada di parseLabelText, yang fokus OEM/barcode).
const VEHICLE_IMPORT_PRICE_RE = /Rp\.?\s?([\d.,]{3,})|(\d[\d.,]{1,})\s?(rb|ribu)\b|\b(\d[\d.,]{3,})\b(?!.*\b\d[\d.,]{3,}\b)/i;

function _vehicleImportParsePrice(line) {
  const m = line.match(VEHICLE_IMPORT_PRICE_RE);
  if (!m) return null;
  if (m[3]) { // "50rb"/"50 ribu"
    const num = parseFloat(m[2].replace(/[.,]/g, ''));
    return isNaN(num) ? null : num * 1000;
  }
  const raw = m[1] || m[4];
  if (!raw) return null;
  const num = parseInt(raw.replace(/[.,]/g, ''), 10);
  return isNaN(num) ? null : num;
}

/** parseCatalogRow(line) — 1 baris teks -> 1 kandidat part { partName,
 * oemCode, barcode, price, raw }. Reuse VehicleCatalog.parseLabelText()
 * (guard typeof) utk OEM/barcode, regex baru di atas khusus harga. Nama
 * part = baris asli dikurangi token kode & harga yang sudah ditangkap. */
function vehicleImportParseCatalogRow(line) {
  const raw = (line || '').toString().trim();
  const result = { partName: '', oemCode: '', barcode: '', price: null, raw };
  if (!raw) return result;
  if (typeof VehicleCatalog !== 'undefined' && VehicleCatalog && typeof VehicleCatalog.parseLabelText === 'function') {
    const parsed = VehicleCatalog.parseLabelText(raw);
    result.oemCode = parsed.oemCode || '';
    result.barcode = parsed.barcode || '';
  }
  result.price = _vehicleImportParsePrice(raw);
  let name = raw;
  if (result.oemCode) name = name.replace(result.oemCode, '');
  if (result.barcode && result.barcode !== result.oemCode) name = name.replace(result.barcode, '');
  const priceMatch = raw.match(VEHICLE_IMPORT_PRICE_RE);
  if (priceMatch) name = name.replace(priceMatch[0], '');
  result.partName = name.replace(/[\t|;,-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return result;
}

/** parseCatalogRows(text) — pecah per baris (\n), parse tiap baris,
 * buang baris yang sama sekali tidak menghasilkan apa pun (tidak ada
 * nama/kode/harga) — baris kosong/header murni tidak masuk daftar
 * kandidat. TIDAK menyentuh store — murni logic, sama pola
 * vehicleCatalogParseLabelText(). */
function vehicleImportParseCatalogRows(text) {
  const lines = (text || '').toString().split('\n');
  const rows = [];
  for (const line of lines) {
    const row = vehicleImportParseCatalogRow(line);
    if (row.partName || row.oemCode || row.barcode) rows.push(row);
  }
  return rows;
}

/** importCatalogRows(rows) — commit HANYA baris yang dikirim (pemanggil/UI
 * bertanggung jawab hanya mengirim baris yang sudah dicentang user setelah
 * preview, sesuai Tahap 5: "Jangan langsung mengubah database tanpa
 * preview dan konfirmasi pengguna"). Reuse VehicleCatalog.create() apa
 * adanya per baris (0 validasi/skema baru); baris yang partName-nya kosong
 * dilewati (create() akan menolaknya lewat validate() yang sudah ada).
 * Return ringkasan { imported, skipped, errors } supaya UI bisa kasih
 * toast ringkasan hasil, bukan silent. */
async function vehicleImportCommitRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const row of list) {
    if (!row || !row.partName) { skipped++; continue; }
    const res = await VehicleCatalog.create({
      partName: row.partName,
      oemCode: row.oemCode || '',
      barcode: row.barcode || '',
      price: (typeof row.price === 'number' && !isNaN(row.price)) ? row.price : undefined,
      category: 'Belum Dikategorikan',
    });
    if (res && res.success) imported++;
    else { skipped++; if (res && res.errors) errors.push(...res.errors); }
  }
  return { imported, skipped, errors };
}

// ------------------------------------------------------------------------
// Namespace publik — pola sama seperti VehicleCatalog/VehicleScanner.
// ------------------------------------------------------------------------
const VehicleCatalogImport = {
  ensurePdfJs,
  extractPdfText: vehicleImportExtractPdfText,
  parseCatalogRow: vehicleImportParseCatalogRow,
  parseCatalogRows: vehicleImportParseCatalogRows,
  commitRows: vehicleImportCommitRows,
};

if (typeof window !== 'undefined') {
  window.VehicleCatalogImport = VehicleCatalogImport;
}
