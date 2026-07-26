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

// BUGFIX (laporan user, PDF katalog Honda Cengkareng): baris tepat di
// batas ganti-halaman PDF suka kebelah dua (atau lebih) oleh pdf.js text
// layer -- kode part nyangkut sendirian di 1 "baris" (item teks), nama
// dan/atau harga part yang SAMA malah nongol di baris-baris SESUDAHNYA
// (bukan baris yang salah, cuma kepisah). Karena parseCatalogRow() lama
// cuma baca 1 baris berdiri sendiri, baris kode yatim begini selalu
// berakhir partName='' & price null walau datanya lengkap beberapa baris
// di bawahnya. _isOrphanCodeRow() + _stitchOrphanCodeRows() di bawah
// menambal ini dengan cara MURNI tekstual (gabung baris yatim + baris-
// baris sesudahnya, lalu parse ulang gabungannya) -- TIDAK mengubah
// parseCatalogRow()/regex kode-harga yang sudah ada, dan TIDAK menyentuh
// baris yang bukan kasus ini.
//
// BUGFIX LANJUTAN (ditemukan lewat pengecekan ulang, sesi ini): fix
// sebelumnya cuma lookahead 1 baris (kode + SATU baris berikutnya). Di
// sebagian PDF, tabelnya kepisah lebih jauh lagi -- kode, nama, DAN harga
// masing-masing jadi baris sendiri-sendiri (3 baris terpisah, bukan 2).
// Lookahead 1 baris cuma berhasil menangkap "kode+nama" (baris nama ikut
// tergabung), tapi baris harga yang menyusul SETELAHNYA sudah kepakai
// jadi baris-berdiri-sendiri berikutnya (tidak ikut tergabung) --
// hasilnya partName ketemu tapi price tetap null/hilang. Diganti jadi
// lookahead BERTAHAP sampai `VEHICLE_IMPORT_STITCH_MAX_LOOKAHEAD` baris
// ke depan: tiap baris ditambahkan satu-satu ke gabungan, berhenti lebih
// awal begitu gabungan sudah lengkap (ada partName DAN price), supaya
// tidak menelan baris lebih banyak dari yang perlu. Guard "baris
// berikutnya part lain (py kode sendiri di awal baris)" dari fix lama
// tetap dipakai apa adanya di SETIAP langkah lookahead, jadi begitu
// ketemu baris yang ternyata kode part baru, lookahead langsung berhenti
// (tidak ikut menelan part berikutnya) -- itulah "batas aman"-nya.
const VEHICLE_IMPORT_STITCH_MAX_LOOKAHEAD = 3;

/** _isOrphanCodeRow(row) — true kalau row HANYA berhasil menangkap kode
 * (oemCode/barcode), tapi partName kosong DAN price tidak ketemu —
 * indikasi baris ini cuma pecahan kode part, bukan part utuh. */
function _vehicleImportIsOrphanCodeRow(row) {
  return !!row && !!(row.oemCode || row.barcode) && !row.partName && row.price == null;
}

/** _stitchOrphanCodeRows(lines) — pass tambahan SEBELUM parse-per-baris
 * biasa: jalan maju per baris mentah (bukan hasil parse), kalau baris ke-i
 * ternyata baris kode yatim (lihat _isOrphanCodeRow di atas), coba gabung
 * dgn baris-baris SESUDAHNYA satu per satu (maksimal
 * `VEHICLE_IMPORT_STITCH_MAX_LOOKAHEAD` baris ke depan — batas aman
 * supaya tidak diam-diam menelan baris part lain yang tidak berhubungan).
 * Berhenti lookahead lebih awal begitu gabungan sudah LENGKAP (partName
 * DAN price sudah ketemu) — menangani baik kasus 2 baris (kode+nama&harga
 * jadi satu baris) MAUPUN kasus 3 baris (kode, nama, harga masing-masing
 * baris sendiri). Baris berikutnya yang ternyata kode part BARU (kode
 * persis di awal baris situ) langsung menghentikan lookahead (guard sama
 * seperti fix sebelumnya, supaya token kode yg nyempil di tengah nama —
 * mis. "10X16" dari "DOWEL,PIN,10X16" — tetap dianggap lanjutan nama,
 * bukan part baru). Kalau sampai batas lookahead gabungan tetap TIDAK ada
 * peningkatan sama sekali (partName tetap kosong & price tetap null),
 * batalkan penggabungan (fallback ke baris asli apa adanya). Return array
 * baris teks baru (baris yatim sudah tergabung, baris yg dipakai utk
 * menggabung dihapus dari daftar) — murni transformasi teks, TIDAK
 * memanggil parseCatalogRow() di luar keperluan pengecekan ini sendiri. */
function _vehicleImportStitchOrphanCodeRows(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const stitched = [];
  let i = 0;
  while (i < list.length) {
    const line = list[i];
    const row = vehicleImportParseCatalogRow(line);
    if (_vehicleImportIsOrphanCodeRow(row)) {
      let merged = (line || '').toString().trim();
      let bestMerged = null; // gabungan terbaik yg TERBUKTI ada peningkatan (partName atau price), fallback kalau tidak sampai lengkap penuh
      let bestConsumed = 0;
      const maxLook = Math.min(VEHICLE_IMPORT_STITCH_MAX_LOOKAHEAD, list.length - i - 1);
      for (let look = 1; look <= maxLook; look++) {
        const nextLine = list[i + look];
        const nextTrimmed = (nextLine || '').toString().trim();
        const nextRow = vehicleImportParseCatalogRow(nextLine);
        // Guard sama persis dgn fix lama: kode yg BENERAN menandai part
        // baru selalu ada di AWAL baris (posisi kolom Kode Part) -- kode
        // yg nyempil di tengah/akhir (salah-tangkap token ukuran/model
        // oleh regex) tetap dianggap lanjutan nama & boleh digabung.
        const nextCode = nextRow.oemCode || nextRow.barcode;
        const nextHasOwnCode = !!nextCode && nextTrimmed.indexOf(nextCode) === 0;
        if (nextHasOwnCode) break; // baris berikutnya part lain -> stop, jangan ditelan
        merged = merged + ' ' + nextTrimmed;
        const mergedRow = vehicleImportParseCatalogRow(merged);
        if (mergedRow.partName || mergedRow.price != null) {
          bestMerged = merged;
          bestConsumed = look;
        }
        if (mergedRow.partName && mergedRow.price != null) break; // sudah lengkap, tidak perlu nambah baris lagi
      }
      if (bestMerged) {
        stitched.push(bestMerged);
        i += bestConsumed + 1; // semua baris yg ikut tergabung dilewati, jangan diproses lagi sendirian
        continue;
      }
    }
    stitched.push(line);
    i++;
  }
  return stitched;
}

/** parseCatalogRows(text) — pecah per baris (\n), STITCH DULU baris kode
 * yatim akibat page-break (lihat catatan BUGFIX di atas), baru parse tiap
 * baris, buang baris yang sama sekali tidak menghasilkan apa pun (tidak
 * ada nama/kode/harga) — baris kosong/header murni tidak masuk daftar
 * kandidat. TIDAK menyentuh store — murni logic, sama pola
 * vehicleCatalogParseLabelText(). */
function vehicleImportParseCatalogRows(text) {
  const rawLines = (text || '').toString().split('\n');
  const lines = _vehicleImportStitchOrphanCodeRows(rawLines);
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
