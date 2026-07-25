// vehicle-catalog-import-ui.js — UI Tahap 5 "Import Katalog" (PDF -> OCR ->
// Parser -> Preview -> Import). Lapisan DOM/presenter SAJA, seluruh
// logic parsing/commit ada di vehicle-catalog-import.js (TIDAK
// diduplikasi/diubah di sini) — pola sama persis vehicle-catalog-ui.js
// vs vehicle-catalog.js.
//
// Entry point: tombol "📋 Import Katalog" ditambah di dalam `catalogModal`
// (index.html/app_production.html), di baris tombol Scan/Tambah Manual.
// Modal baru `vehCatalogImportModal` — WAJIB preview + konfirmasi sebelum
// commitRows() dipanggil (Tahap 5: "Jangan langsung mengubah database
// tanpa preview dan konfirmasi pengguna") — checkbox per baris, default
// TERCENTANG (baris valid), tapi commit hanya jalan lewat tombol
// "Import yang Dicentang" setelah user melihat preview-nya.

let _vehImportRows = []; // state hasil parse, per baris: {partName, oemCode, barcode, price, raw, included}

function _vehImportSetStatus(msg) {
  const el = document.getElementById('vehCatImportStatus');
  if (el) el.textContent = msg || '';
}

async function catalogImportUiOpen() {
  _vehImportRows = [];
  const preview = document.getElementById('vehCatImportPreview');
  if (preview) preview.innerHTML = '';
  const commitBtn = document.getElementById('vehCatImportCommitBtn');
  if (commitBtn) commitBtn.disabled = true;
  _vehImportSetStatus('');
  const fileInput = document.getElementById('vehCatImportPdfFile');
  if (fileInput) fileInput.value = '';
  openModal('vehCatalogImportModal');
}

function catalogImportUiPickFile() {
  const inp = document.getElementById('vehCatImportPdfFile');
  if (inp) inp.click();
}

async function catalogImportUiOnFileChange(e) {
  const file = e && e.target && e.target.files && e.target.files[0];
  if (!file) return;
  _vehImportSetStatus('🔍 Membaca PDF (OCR otomatis kalau perlu, bisa beberapa detik)...');
  const commitBtn = document.getElementById('vehCatImportCommitBtn');
  if (commitBtn) commitBtn.disabled = true;
  const pickBtn = document.querySelector('[data-action="VehicleCatalogImportUI.pickFile"]');
  if (pickBtn) pickBtn.disabled = true;
  try {
    const text = await VehicleCatalogImport.extractPdfText(file);
    const rows = VehicleCatalogImport.parseCatalogRows(text);
    // Hanya tampilkan baris yang sudah punya kode part DAN harga lengkap —
    // baris lain (header tabel, teks tanpa kode/harga) disembunyikan dari
    // preview supaya user tidak perlu menyaring manual.
    const completeRows = VehicleCatalogImport.filterCompleteRows(rows);
    const skippedIncomplete = rows.length - completeRows.length;
    _vehImportRows = completeRows.map((r) => Object.assign({}, r, { included: true }));
    if (!_vehImportRows.length) {
      _vehImportSetStatus('⚠️ Tidak ada part dgn kode part + harga lengkap dari PDF ini' + (rows.length ? ' (' + rows.length + ' baris terbaca, tapi tidak ada yang lengkap kode+harga)' : '') + ' — coba file lain atau pastikan halaman cukup jelas.');
    } else {
      _vehImportSetStatus('✅ ' + _vehImportRows.length + ' part dgn kode+harga lengkap' + (skippedIncomplete ? ', ' + skippedIncomplete + ' baris dilewati (kode/harga tidak lengkap)' : '') + ' — cek & sesuaikan dulu di bawah sebelum import.');
    }
    catalogImportUiRenderPreview();
  } catch (err) {
    console.error('[VehicleCatalogImportUI] gagal baca PDF:', err);
    const msg = (typeof VehicleScanner !== 'undefined' && VehicleScanner && typeof VehicleScanner.errorMessage === 'function')
      ? VehicleScanner.errorMessage(err)
      : ((err && err.message) || 'gagal membaca PDF, coba lagi');
    _vehImportSetStatus('❌ Gagal baca PDF: ' + msg);
  } finally {
    if (pickBtn) pickBtn.disabled = false;
  }
}

function catalogImportUiToggleRow(idx) {
  if (_vehImportRows[idx]) _vehImportRows[idx].included = !_vehImportRows[idx].included;
  catalogImportUiRenderPreview();
}

function catalogImportUiEditField(idx, field, value) {
  if (!_vehImportRows[idx]) return;
  if (field === 'price') {
    const num = parseInt(String(value).replace(/[^\d]/g, ''), 10);
    _vehImportRows[idx].price = isNaN(num) ? null : num;
  } else {
    _vehImportRows[idx][field] = value;
  }
}

function catalogImportUiRenderPreview() {
  const el = document.getElementById('vehCatImportPreview');
  const commitBtn = document.getElementById('vehCatImportCommitBtn');
  if (!el) return;
  if (!_vehImportRows.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Belum ada baris terbaca. Pilih file PDF katalog dulu.</div></div>';
    if (commitBtn) commitBtn.disabled = true;
    return;
  }
  const includedCount = _vehImportRows.filter((r) => r.included).length;
  const countLabel = '<div style="font-size:11px;color:var(--text2);margin-bottom:8px;font-weight:600">' + includedCount + ' dari ' + _vehImportRows.length + ' dicentang</div>';
  el.innerHTML = countLabel + _vehImportRows.map((row, idx) => {
    const checkedAttr = row.included ? 'checked' : '';
    const priceVal = (typeof row.price === 'number' && !isNaN(row.price)) ? row.price : '';
    return '<div class="tx-item" style="align-items:flex-start">'
      + '<input type="checkbox" ' + checkedAttr + ' style="width:18px;height:18px;margin-top:8px;flex-shrink:0" onchange="VehicleCatalogImportUI.toggleRow(' + idx + ')">'
      + '<div class="tx-info" style="flex:1">'
      + '<input type="text" class="fi" style="margin-bottom:6px" value="' + escapeHtml(row.partName || '') + '" placeholder="Nama part" oninput="VehicleCatalogImportUI.editField(' + idx + ',\'partName\',this.value)">'
      + '<div class="u-flex u-gap8">'
      + '<input type="text" class="fi" style="flex:1" value="' + escapeHtml(row.oemCode || '') + '" placeholder="OEM code (opsional)" oninput="VehicleCatalogImportUI.editField(' + idx + ',\'oemCode\',this.value)">'
      + '<input type="number" class="fi" style="flex:1" value="' + priceVal + '" placeholder="Harga (opsional)" inputmode="numeric" oninput="VehicleCatalogImportUI.editField(' + idx + ',\'price\',this.value)">'
      + '</div></div></div>';
  }).join('');
  if (commitBtn) commitBtn.disabled = !includedCount;
}

async function catalogImportUiCommit() {
  const rowsToImport = _vehImportRows.filter((r) => r.included);
  if (!rowsToImport.length) return;
  const ok = await askConfirm('Import ' + rowsToImport.length + ' part yang dicentang ke katalog?');
  if (!ok) return;
  const commitBtn = document.getElementById('vehCatImportCommitBtn');
  if (commitBtn) commitBtn.disabled = true;
  _vehImportSetStatus('⏳ Mengimpor...');
  try {
    const summary = await VehicleCatalogImport.commitRows(rowsToImport);
    const dupNote = summary.duplicates ? ' (' + summary.duplicates + ' duplikat)' : '';
    toast('✅ ' + summary.imported + ' part diimpor' + (summary.skipped ? ', ' + summary.skipped + ' dilewati' + dupNote : ''));
    _vehImportRows = [];
    catalogImportUiRenderPreview();
    closeModal('vehCatalogImportModal');
    if (typeof VehicleCatalogUI !== 'undefined' && VehicleCatalogUI && typeof VehicleCatalogUI.renderList === 'function') {
      await VehicleCatalogUI.renderList();
    }
  } finally {
    if (commitBtn) commitBtn.disabled = !_vehImportRows.some((r) => r.included);
  }
}

const VehicleCatalogImportUI = {
  open: catalogImportUiOpen,
  pickFile: catalogImportUiPickFile,
  onFileChange: catalogImportUiOnFileChange,
  toggleRow: catalogImportUiToggleRow,
  editField: catalogImportUiEditField,
  commit: catalogImportUiCommit,
};

if (typeof window !== 'undefined') {
  window.VehicleCatalogImportUI = VehicleCatalogImportUI;
}
