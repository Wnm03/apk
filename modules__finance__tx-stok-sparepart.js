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
function applyTxStockFromTx(note){
const chk=document.getElementById('txAddStock');
if(!chk||!chk.checked)return;
const panel=document.getElementById('txStockPanel');
if(!panel||panel.style.display==='none')return;
const itemSel=document.getElementById('txStockItem').value;
const qty=parseFloat(document.getElementById('txStockQty').value)||0;
const unit=document.getElementById('txStockUnit').value.trim()||'pcs';
if(qty<=0){toast('⚠️ Jumlah stok yang ditambah harus lebih dari 0');return;}
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
existing.qty=(existing.qty||0)+qty;
} else {
D.partsStock.push({id:'st_'+Date.now(),name,catId:cat.id,code,qty,unit,minStock:1,price:0,note:'Otomatis dari transaksi keuangan'});
}
toast(`📦 Kategori & stok "${name}" otomatis dibuat (+${qty} ${unit})`);
} else {
const p=D.partsStock.find(x=>x.id===itemSel);
if(p){
p.qty=(p.qty||0)+qty;
toast(`📦 Stok "${escapeHtml(p.name)}" bertambah +${qty} ${unit}`);
}
}
renderStockList();
}
