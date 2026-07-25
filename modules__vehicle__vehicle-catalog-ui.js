// vehicle-catalog-ui.js — UI dasar Vehicle Catalog (Katalog Suku Cadang), lanjutan ringkas
// Tahap 2 ACR-001. Scan (vehicle-scanner.js) & storage/CRUD (vehicle-catalog.js) SUDAH ADA
// dari sesi sebelumnya — sesi ini isinya HANYA lapisan UI, scope disepakati eksplisit dgn
// user (ringkas & additive):
//
// PERUBAHAN SESI INI (Tahap 7B-1 — Fondasi Scanner Sparepart): tambah field `catBarcode`
// (baca/tulis openForm()/save()) — REUSE MURNI field `barcode` yang SUDAH ADA di skema
// VehicleCatalog (vehicle-catalog.js, dipakai findByCode()/handleScan() sejak Tahap 2),
// sebelumnya cuma belum ada input-nya di form UI ini. Ditambahkan supaya kode hasil scan
// dari sparepart-scanner.js (baru, lihat file itu) kelihatan & bisa diisi/dikoreksi manual
// di form yang sama — TIDAK ada skema/formula baru, presenter-layer saja.
// - 1 modal baru (`catalogModal`) — list part (nama, OEM code, foto thumbnail).
// - Tombol "📷 Scan" -> reuse SparepartScannerUI.scanCamera() (Tahap 7B-2,
//   lihat sparepart-scanner-ui.js/sparepart-scanner.js — adapter 'camera'
//   reuse penuh VehicleScanner.ensureZXing()/buildHints()) — TIDAK ada logic
//   scan baru di sini.
// - Tombol "+ Tambah Manual" -> form pakai field yang SUDAH ADA di VehicleCatalog
//   (partName/oemCode/category/photos) -- TIDAK ada field/skema baru.
// Entry point: tombol "📦 Katalog Suku Cadang" ditambah di page:'carnotes', tepat di bawah
// "+ Kelola Kendaraan" (index.html/app_production.html) -- additive, tidak menyentuh page lain.
//
// Kenapa namespace object (pola sama BillMultiScan/UniversalScan/GoldImport), bukan flat
// function seperti openVehicleModal()/saveVehicle(): modul ini murni presenter baru dgn
// state form sendiri (_catEditId/_catPhotos) yang terpisah dari D global (data part disimpan
// di VehicleCatalog/IDBStore, BUKAN D.vehicles) -- namespace memudahkan pemisahan itu &
// konsisten dgn modul-modul sejenis yang juga bukan bagian D.
//
// Jembatan ke Scan: vehicleScannerHandleResult() (vehicle-scanner.js) dipanggil setelah
// VehicleCatalog.handleScan(code) resolve, lewat guard typeof VehicleCatalogUI==='object' &&
// typeof .onScanResult==='function' (pola adapter tipis yang sama dgn _aiContext*() dkk) --
// supaya list di modal ini auto-refresh kalau modal sedang terbuka saat scan selesai, tanpa
// vehicle-scanner.js perlu tahu apa pun soal DOM/UI modul ini.

let _catEditId = null;
let _catPhotos = [];

// Kompresi ringan sebelum disimpan sbg base64 (IndexedDB) — REUSE penuh
// downscaleImage() yang sudah ada di scan-ocr.js (dipakai jg oleh scanReceipt
// dkk sebelum OCR: resize max-width + re-encode JPEG kualitas 0.85), bukan
// implementasi baru. Guard typeof supaya tetap aman kalau file ini pernah
// dites/dimuat terpisah tanpa scan-ocr.js (pola sama guard adapter lain di
// modul ini) — fallback ke file asli (tanpa kompresi) kalau helper tsb tidak
// ada, bukan gagal total.
function _catPhotoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const useFile = (typeof downscaleImage === 'function') ? downscaleImage(file, 1024) : Promise.resolve(file);
    useFile.then((f) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Gagal membaca foto'));
      reader.readAsDataURL(f);
    }).catch(reject);
  });
}

async function catalogUiOpen() {
  await VehicleCatalog.ensureLoaded();
  catalogUiCloseForm();
  await catalogUiRenderList();
  openModal('catalogModal');
}

async function catalogUiRenderList() {
  const el = document.getElementById('catalogList');
  if (!el) return;
  const items = await VehicleCatalog.getAll();
  if (!items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Belum ada part di katalog</div></div>';
    return;
  }
  el.innerHTML = items.slice().reverse().map((it) => {
    const thumb = (it.photos && it.photos[0])
      ? '<img src="' + it.photos[0] + '" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0" alt="">'
      : '<div class="tx-icon u-bgaccsoft">📦</div>';
    const metaParts = [];
    if (it.oemCode) metaParts.push('OEM: ' + escapeHtml(it.oemCode));
    if (it.category) metaParts.push(escapeHtml(it.category));
    if (it.compatibleVehicleIds && it.compatibleVehicleIds.length) metaParts.push('🏍️ ' + it.compatibleVehicleIds.length + ' kendaraan');
    if (typeof D !== 'undefined' && Array.isArray(D.partsStock) && it.partName) {
      const matchedStock = D.partsStock.find((p) => p.name && p.name.trim().toLowerCase() === it.partName.trim().toLowerCase());
      if (matchedStock) metaParts.push('📦 Stok ' + matchedStock.qty + (matchedStock.unit ? ' ' + matchedStock.unit : ''));
    }
    if (it.isDraft) metaParts.push('⚠️ Draft');
    const idArg = escapeHtml(JSON.stringify([it.id]));
    return '<div class="tx-item">' + thumb
      + '<div class="tx-info"><div class="tx-name">' + escapeHtml(it.partName || '(Tanpa nama)') + '</div><div class="tx-meta">' + (metaParts.join(' · ') || '-') + '</div></div>'
      + '<button class="tx-del u-bgaccsoft u-cacc" style="margin-right:6px" data-action="VehicleCatalogUI.openForm" data-args="' + idArg + '" aria-label="Edit">✏️</button>'
      + '<button class="tx-del" data-action="VehicleCatalogUI.remove" data-args="' + idArg + '" aria-label="Hapus">🗑</button>'
      + '</div>';
  }).join('');
}

async function catalogUiOpenForm(id) {
  _catEditId = id || null;
  _catPhotos = [];
  const wrap = document.getElementById('catalogFormWrap');
  if (!wrap) return;
  wrap.classList.remove('u-dnone');
  const delBtn = document.getElementById('catDelBtn');
  let compatibleVehicleIds = [];
  if (_catEditId) {
    const item = await VehicleCatalog.getById(_catEditId);
    if (!item) _catEditId = null;
    document.getElementById('catFormLabel').textContent = 'Edit Part';
    document.getElementById('catPartName').value = item ? item.partName : '';
    document.getElementById('catOemCode').value = item ? (item.oemCode || '') : '';
    document.getElementById('catBarcode').value = item ? (item.barcode || '') : '';
    document.getElementById('catCategory').value = item ? (item.category || '') : '';
    _catPhotos = (item && Array.isArray(item.photos)) ? item.photos.slice() : [];
    compatibleVehicleIds = (item && Array.isArray(item.compatibleVehicleIds)) ? item.compatibleVehicleIds : [];
    document.getElementById('catSaveBtn').textContent = 'Simpan Perubahan';
    if (delBtn) delBtn.classList.remove('u-dnone');
  } else {
    document.getElementById('catFormLabel').textContent = 'Tambah Part Baru';
    document.getElementById('catPartName').value = '';
    document.getElementById('catOemCode').value = '';
    document.getElementById('catBarcode').value = '';
    document.getElementById('catCategory').value = '';
    document.getElementById('catSaveBtn').textContent = '+ Tambah Part';
    if (delBtn) delBtn.classList.add('u-dnone');
  }
  catalogUiRenderPhotos();
  catalogUiRenderVehicleChecklist(compatibleVehicleIds);
}

// Checklist kendaraan kompatibel — REUSE D.vehicles apa adanya (tidak baca/
// tulis D langsung dari sini kecuali baca id/name/emoji, sesuai batasan
// ACR-001: "validasi id dilakukan di lapisan UI/adapter", bukan di
// vehicle-catalog.js). Kalau D.vehicles belum ada/kosong, tampil hint saja.
function catalogUiRenderVehicleChecklist(selectedIds) {
  const el = document.getElementById('catCompatWrap');
  if (!el) return;
  const sel = new Set((selectedIds || []).map(String));
  const list = (typeof D !== 'undefined' && Array.isArray(D.vehicles)) ? D.vehicles : [];
  if (!list.length) {
    el.innerHTML = '<div class="u-fs11 u-t2">Belum ada kendaraan terdaftar di Kelola Kendaraan.</div>';
    return;
  }
  el.innerHTML = list.map((v) => (
    '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer">'
    + '<input type="checkbox" value="' + escapeHtml(String(v.id)) + '" ' + (sel.has(String(v.id)) ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)">'
    + (v.emoji || '🏍️') + ' ' + escapeHtml(v.name || '')
    + '</label>'
  )).join('');
}

function catalogUiCloseForm() {
  _catEditId = null;
  _catPhotos = [];
  const wrap = document.getElementById('catalogFormWrap');
  if (wrap) wrap.classList.add('u-dnone');
}

function catalogUiPickPhoto() {
  const inp = document.getElementById('catPhotoInput');
  if (inp) inp.click();
}

async function catalogUiAddPhoto(e) {
  const file = (e && e.target && e.target.files) ? e.target.files[0] : null;
  if (!file) return;
  if (_catPhotos.length >= VehicleCatalog.MAX_PHOTOS) {
    toast('⚠️ Maksimal ' + VehicleCatalog.MAX_PHOTOS + ' foto per part');
    if (e && e.target) e.target.value = '';
    return;
  }
  try {
    const dataUrl = await _catPhotoToDataUrl(file);
    _catPhotos.push(dataUrl);
    catalogUiRenderPhotos();
  } catch (err) {
    toast('❌ Gagal memuat foto: ' + (err && err.message ? err.message : 'error tidak diketahui'));
  } finally {
    if (e && e.target) e.target.value = '';
  }
}

function catalogUiRemovePhoto(idx) {
  _catPhotos.splice(idx, 1);
  catalogUiRenderPhotos();
}

function catalogUiRenderPhotos() {
  const el = document.getElementById('catPhotoThumbs');
  if (!el) return;
  el.innerHTML = _catPhotos.map((src, i) => (
    '<div style="position:relative">'
    + '<img src="' + src + '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" alt="">'
    + '<button type="button" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--accent2);color:#fff;font-size:11px;line-height:1;cursor:pointer" data-action="VehicleCatalogUI.removePhoto" data-args="' + escapeHtml(JSON.stringify([i])) + '" aria-label="Hapus foto">✕</button>'
    + '</div>'
  )).join('');
}

async function catalogUiSave() {
  const partName = (document.getElementById('catPartName').value || '').trim();
  const oemCode = (document.getElementById('catOemCode').value || '').trim();
  const barcode = (document.getElementById('catBarcode').value || '').trim();
  const category = (document.getElementById('catCategory').value || '').trim();
  const compatWrap = document.getElementById('catCompatWrap');
  const compatibleVehicleIds = compatWrap
    ? Array.from(compatWrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value)
    : [];
  const data = { partName, oemCode, barcode, category, photos: _catPhotos.slice(), compatibleVehicleIds };
  const res = _catEditId
    ? await VehicleCatalog.update(_catEditId, data)
    : await VehicleCatalog.create(data);
  if (!res.success) {
    toast('⚠️ ' + ((res.errors && res.errors[0]) || 'Gagal menyimpan part'));
    return;
  }
  toast(_catEditId ? '✅ Part diperbarui' : '✅ Part ditambahkan');
  catalogUiCloseForm();
  await catalogUiRenderList();
}

async function catalogUiRemove(id) {
  const target = id || _catEditId;
  if (!target) return;
  const ok = await askConfirm('Hapus part ini dari katalog?');
  if (!ok) return;
  await VehicleCatalog.remove(target);
  toast('🗑 Part dihapus');
  catalogUiCloseForm();
  await catalogUiRenderList();
}

// Dipanggil vehicleScannerHandleResult() (vehicle-scanner.js) setelah scan selesai. Refresh
// list HANYA kalau modal ini sedang terbuka (class 'open', lihat openModal()/closeModal() di
// modal-navigasi.js), supaya tidak mengganggu state form manual yang sedang diisi kalau modal
// ini kebetulan tidak dibuka lewat alur scan.
function catalogUiOnScanResult() {
  const modalEl = document.getElementById('catalogModal');
  if (!modalEl || !modalEl.classList.contains('open')) return;
  catalogUiRenderList();
}

const VehicleCatalogUI = {
  open: catalogUiOpen,
  renderList: catalogUiRenderList,
  openForm: catalogUiOpenForm,
  closeForm: catalogUiCloseForm,
  pickPhoto: catalogUiPickPhoto,
  addPhoto: catalogUiAddPhoto,
  removePhoto: catalogUiRemovePhoto,
  save: catalogUiSave,
  remove: catalogUiRemove,
  onScanResult: catalogUiOnScanResult,
};

if (typeof window !== 'undefined') {
  window.VehicleCatalogUI = VehicleCatalogUI;
}
