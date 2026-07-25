// tx-stok-sparepart.js — logika panel "Tambah ke Stok Sparepart juga?" pada
// Dipindah ke modules/finance/tx-stok-sparepart.js (Sesi 16 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// txModal (Tambah/Edit Transaksi Keuangan). Dipisah dari transaksi.js
// (2026-07-11, lihat CLAUDE.md catatan kerja "split transaksi.js" bagian
// ke-7) murni sebagai pengelompokan ulang file, BUKAN perubahan perilaku.
// Semua fungsi di sini tetap global karena dipanggil dari:
//  - transaksi.js sendiri (updateTxVehiclePanels, _saveTxInner)
//  - HTML lewat atribut onchange di modals.js (mis. txStockItem pakai
//    onchange="onTxStockItemChange()")
//  - scan-ocr.js (auto-centang & isi panel stok saat hasil scan struk
//    terdeteksi sparepart)
// revertStockPurchase(partId,qty) — Tahap 8B: kebalikan applyStockPurchase(),
// dipakai saat transaksi Keuangan yang menambah stok Inventaris DIEDIT
// (checkbox dimatikan/qty diganti) atau DIHAPUS -> qty yg pernah ditambahkan
// dikurangi lagi (single source of truth = D.partsStock, TIDAK menyentuh
// harga/priceHistory yg sudah tercatat, sesuai pola revertStockUsage() di
// car-notes.js utk arah sebaliknya/pemakaian servis).
function revertStockPurchase(partId,qty){
if(!partId||!qty)return;
const p=D.partsStock.find(x=>x.id===partId);
if(p)p.qty=Math.max(0,(p.qty||0)-qty);
}
// applyStockPurchase(p,qty,unitPrice,purchaseDate,txId) — Tahap 8A: satu titik
// tunggal utk update field pembelian di item D.partsStock (dipanggil dari
// applyTxStockFromTx di bawah, integrasi Keuangan -> Inventaris/Vehicle
// Catalog/Car Notes). TIDAK mengubah cara qty ditambah (masih p.qty+=qty,
// perilaku lama persis), cuma MENAMBAH field baru: lastPrice (harga satuan
// pembelian terakhir), avgPrice (rata-rata tertimbang lintas semua pembelian
// — dipakai juga sbg p.price utk perhitungan "Nilai Persediaan" yg sudah ada
// di Dashboard Sparepart 7E-5), lastPurchaseDate, priceHistory[] (riwayat
// harga per transaksi), txRefs[]/lastTxId (referensi transaksi Keuangan).
// unitPrice<=0 (mis. transaksi tanpa jumlah valid) -> qty tetap nambah tapi
// field harga TIDAK disentuh (menghindari harga 0 mengotori rata-rata).
function applyStockPurchase(p,qty,unitPrice,purchaseDate,txId){
const prevQty=p.qty||0;
p.qty=prevQty+qty;
if(unitPrice>0){
p.lastPrice=unitPrice;
const prevAvg=(typeof p.avgPrice==='number'&&p.avgPrice>0)?p.avgPrice:((p.price>0)?p.price:unitPrice);
const totalQtyForAvg=prevQty+qty;
p.avgPrice=totalQtyForAvg>0?(((prevAvg*prevQty)+(unitPrice*qty))/totalQtyForAvg):unitPrice;
p.price=p.avgPrice;
}
p.lastPurchaseDate=purchaseDate;
if(!Array.isArray(p.priceHistory))p.priceHistory=[];
p.priceHistory.push({date:purchaseDate,qty,price:unitPrice||0,txId:txId||null});
if(txId){
if(!Array.isArray(p.txRefs))p.txRefs=[];
if(!p.txRefs.includes(txId))p.txRefs.push(txId);
p.lastTxId=txId;
}
}
function populateTxStockSelect(){
const sel=document.getElementById('txStockItem');
if(!sel)return;
const cur=sel.value;
sel.innerHTML='<option value="__new__">➕ Sparepart Baru</option>'+D.partsStock.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} (stok ${p.qty}${p.unit?' '+p.unit:''})</option>`).join('');
sel.value=cur&&D.partsStock.find(p=>p.id===cur)?cur:'__new__';
onTxStockItemChange();
}
function onTxStockItemChange(){
const sel=document.getElementById('txStockItem');
const wrap=document.getElementById('txStockNewWrap');
if(!sel||!wrap)return;
const isNew=sel.value==='__new__';
wrap.style.display=isNew?'block':'none';
if(isNew){
const noteVal=document.getElementById('txNote').value.trim();
const nameEl=document.getElementById('txStockNewName');
if(nameEl&&!nameEl.value) nameEl.value=noteVal;
}
}
function toggleTxStockFields(){
const chk=document.getElementById('txAddStock');
const fields=document.getElementById('txStockFields');
if(!chk||!fields)return;
fields.style.display=chk.checked?'block':'none';
if(chk.checked) populateTxStockSelect();
}
// applyTxStockFromTx(note,txId,date,priceBasis,existingTx) — txId/date/
// priceBasis/existingTx baru di Tahap 8A/8B (opsional, dipanggil dgn 1
// argumen saja masih tetap berfungsi spt sebelumnya). priceBasis = nilai
// Rupiah transaksi yg jadi dasar hitung harga satuan (dibagi qty).
// existingTx (Tahap 8B, pola sama applyTxShopStockFromTx) -> kalau transaksi
// yg diedit sebelumnya sudah pernah nambah stok (existingTx.partStockId),
// rollback dulu qty lama sebelum apply yg baru, supaya edit TIDAK dobel
// nambah stok (single source of truth D.partsStock tetap akurat).
function applyTxStockFromTx(note,txId,date,priceBasis,existingTx){
const chk=document.getElementById('txAddStock');
if(!chk||!chk.checked)return;
const panel=document.getElementById('txStockPanel');
if(!panel||panel.style.display==='none')return;
const itemSel=document.getElementById('txStockItem').value;
const qty=parseFloat(document.getElementById('txStockQty').value)||0;
const unit=document.getElementById('txStockUnit').value.trim()||'pcs';
if(qty<=0){toast('⚠️ Jumlah stok yang ditambah harus lebih dari 0');return;}
if(existingTx&&existingTx.partStockId){
revertStockPurchase(existingTx.partStockId,existingTx.partStockQty);
}
const unitPrice=(priceBasis>0)?(priceBasis/qty):0;
const purchaseDate=date||new Date().toISOString().split('T')[0];
let targetPart=null;
if(itemSel==='__new__'){
const name=(document.getElementById('txStockNewName').value.trim())||note||'Sparepart Baru';
let cat=D.sparepartCats.find(c=>c.name.toLowerCase()===name.toLowerCase());
if(!cat){
cat={id:'sp_'+Date.now(),name,code:codeFromName(name),intervalKm:0};
D.sparepartCats.push(cat);
}
const prefix=cat.code||codeFromName(name);
const seq=D.partsStock.filter(p=>p.code&&p.code.startsWith(prefix+'-')).length+1;
const code=prefix+'-'+String(seq).padStart(3,'0');
const existing=D.partsStock.find(p=>p.catId===cat.id&&p.name.toLowerCase()===name.toLowerCase());
if(existing){
applyStockPurchase(existing,qty,unitPrice,purchaseDate,txId);
targetPart=existing;
} else {
const np={id:'st_'+Date.now(),name,catId:cat.id,code,qty:0,unit,minStock:1,price:0,note:'Otomatis dari transaksi keuangan'};
D.partsStock.push(np);
applyStockPurchase(np,qty,unitPrice,purchaseDate,txId);
targetPart=np;
}
toast(`📦 Kategori & stok "${name}" otomatis dibuat (+${qty} ${unit})`);
} else {
const p=D.partsStock.find(x=>x.id===itemSel);
if(p){
applyStockPurchase(p,qty,unitPrice,purchaseDate,txId);
targetPart=p;
toast(`📦 Stok "${escapeHtml(p.name)}" bertambah +${qty} ${unit}`);
}
}
if(targetPart&&txId){
const tx=(existingTx&&existingTx.id===txId)?existingTx:(D.transactions||[]).find(t=>t.id===txId);
if(tx){tx.partStockId=targetPart.id;tx.partStockQty=qty;tx.partStockUnit=unit;}
}
renderStockList();
}
