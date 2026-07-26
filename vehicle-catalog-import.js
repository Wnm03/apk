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
  if (!file || !file.size) {
    throw new Error('File PDF kosong atau tidak terbaca.');
  }
  const buf = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  } catch (err) {
    throw new Error('File PDF rusak atau tidak valid, coba file lain.');
  }
  if (!pdf || !pdf.numPages) {
    return '';
  }
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

// Harga: "Rp50.000" / "Rp 50000" / "50rb" / "50 ribu" — WAJIB ada penanda
// eksplisit (Rp/rb/ribu). Versi sebelumnya punya fallback "angka berdiri
// sendiri terakhir di baris" tanpa penanda apa pun — di data katalog PDF
// sungguhan ini terbukti SALAH TANGKAP fragmen kode part (mis. "12310"
// dari "12310-KZR-600" ikut kebaca sebagai harga, karena "-" dianggap
// batas kata oleh regex). Fallback itu dibuang; tanpa "Rp"/"rb"/"ribu"
// eksplisit, baris dianggap TIDAK punya harga (price: null) — lebih baik
// kosong daripada harga palsu.
const VEHICLE_IMPORT_PRICE_RE = /Rp\.?\s?([\d.,]{3,})|(\d[\d.,]{1,})\s?(rb|ribu)\b/i;

function _vehicleImportParsePrice(line) {
  const m = line.match(VEHICLE_IMPORT_PRICE_RE);
  if (!m) return null;
  if (m[3]) { // "50rb"/"50 ribu"
    const num = parseFloat(m[2].replace(/[.,]/g, ''));
    return isNaN(num) ? null : num * 1000;
  }
  const raw = m[1];
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
  let duplicates = 0;
  const errors = [];
  for (const row of list) {
    if (!row || !row.partName) { skipped++; continue; }
    const code = row.oemCode || row.barcode;
    if (code && typeof VehicleCatalog !== 'undefined' && VehicleCatalog && typeof VehicleCatalog.findByCode === 'function') {
      const existing = await VehicleCatalog.findByCode(code);
      if (existing) { duplicates++; skipped++; continue; }
    }
    const data = {
      partName: row.partName,
      oemCode: row.oemCode || '',
      barcode: row.barcode || '',
      price: (typeof row.price === 'number' && !isNaN(row.price)) ? row.price : undefined,
      category: 'Belum Dikategorikan',
    };
    if (typeof VehicleCatalog !== 'undefined' && VehicleCatalog && typeof VehicleCatalog.validate === 'function') {
      const check = VehicleCatalog.validate(data);
      if (check && check.valid === false) { skipped++; if (check.errors) errors.push(...check.errors); continue; }
    }
    const res = await VehicleCatalog.create(data);
    if (res && res.success) imported++;
    else { skipped++; if (res && res.errors) errors.push(...res.errors); }
  }
  return { imported, skipped, duplicates, errors };
}

/** filterCompleteRows(rows, opts) — HANYA baris yang punya kode part (OEM
 * code ATAU barcode — baris katalog dgn 1 kode angka murni bisa kedeteksi
 * sbg barcode oleh parseLabelText(), bukan cuma oemCode, jadi tetap
 * dihitung "ada kodepart"). Kode part WAJIB, harga TIDAK — banyak PDF
 * katalog dealer nyata menampilkan harga sbg angka polos tanpa penanda
 * "Rp"/"rb" (lihat komentar VEHICLE_IMPORT_PRICE_RE di atas kenapa
 * fallback angka polos sengaja tidak dipakai lagi, supaya tidak salah
 * tangkap fragmen kode part), jadi mensyaratkan harga valid bikin baris
 * yang kode-nya sudah benar ikut terbuang — harga tetap bisa diisi
 * manual di layar preview (field-nya sudah editable). `opts.requirePrice`
 * (default true, demi backward-compat pemanggil lain mis. web-import)
 * bisa di-set `false` supaya harga jadi opsional — dipakai PDF import
 * (vehicle-catalog-import-ui.js & honda-pdf-import-ui.js) sesuai
 * permintaan user. Fungsi murni, TIDAK mengubah rows asli. */
function vehicleImportFilterCompleteRows(rows, opts) {
  const requirePrice = !opts || opts.requirePrice !== false;
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => {
    if (!r || !(r.oemCode || r.barcode)) return false;
    if (!requirePrice) return true;
    return typeof r.price === 'number' && !isNaN(r.price) && r.price > 0;
  });
}

// ------------------------------------------------------------------------
// Namespace publik — pola sama seperti VehicleCatalog/VehicleScanner.
// ------------------------------------------------------------------------
const VehicleCatalogImport = {
  ensurePdfJs,
  extractPdfText: vehicleImportExtractPdfText,
  parseCatalogRow: vehicleImportParseCatalogRow,
  parseCatalogRows: vehicleImportParseCatalogRows,
  filterCompleteRows: vehicleImportFilterCompleteRows,
  commitRows: vehicleImportCommitRows,
};

if (typeof window !== 'undefined') {
  window.VehicleCatalogImport = VehicleCatalogImport;
}
