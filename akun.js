// akun.js — Kelola Akun (Cash/Bank/Ewallet dll): saldo, filter dropdown akun di seluruh app, CRUD akun
// Dipindah ke modules/finance/akun.js (Sesi 16 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// PENTING: file ini HARUS dimuat sesuai urutan build.js (GROUP_A/GROUP_B) karena beberapa modul saling referensi. Urutan grup ini: data-default.js, features-helpers-global-security.js, diagnostik-versi.js, format-tema.js, error-handler.js, helper-teks.js, keamanan-pin.js, modal-navigasi.js, reset-gaji-mingguan.js, debug-console.js, pengaturan-search.js, onboarding.js, kalkulator-input.js, scan-ocr.js, filter-laporan.js, akun.js, gaji-calc.js, transaksi.js, profil-pengaturan.js, kategori.js, tagihan-kalender.js, backup-restore.js, payroll-absensi.js, tukang-absensi.js

function recalcAccBalance(accId){
const acc=D.accounts.find(a=>a.id===accId);
if(!acc)return 0;
let bal=acc.baseBalance!==undefined?acc.baseBalance:(acc.balance||0);
D.transactions.forEach(t=>{
if(t.accountId===accId){
if(t.type==='income')bal+=t.amount;
else if(t.type==='expense')bal-=t.amount;
else if(t.type==='transfer_out')bal-=t.amount;
else if(t.type==='transfer_in')bal+=t.amount;
}
});
return bal;
}
function populateAccFilters(){
const opts=D.accounts.map(a=>`<option value="${a.id}">${a.emoji} ${escapeHtml(a.name)}</option>`).join('');
const fAcc=document.getElementById('fAcc');
if(fAcc) fAcc.innerHTML='<option value="semua">Semua Akun</option>'+opts;
const txAcc=document.getElementById('txAcc');
if(txAcc) txAcc.innerHTML=opts;
const trFrom=document.getElementById('trFrom');
const trTo=document.getElementById('trTo');
if(trFrom) trFrom.innerHTML=opts;
if(trTo) trTo.innerHTML=opts;
const wrAcc=document.getElementById('wrAcc');
if(wrAcc) wrAcc.innerHTML=opts;
const tAcc=document.getElementById('tAcc');
if(tAcc){const cur=tAcc.value;tAcc.innerHTML='<option value="">— Tidak terkait akun, isi manual —</option>'+opts;if(cur)tAcc.value=cur;}
const assetAccId=document.getElementById('assetAccId');
if(assetAccId){const cur=assetAccId.value;assetAccId.innerHTML='<option value="">— Tidak ditautkan —</option><option value="__new__">➕ Buat Akun Baru dari Aset Ini</option>'+opts;if(cur)assetAccId.value=cur;}
populateKeuFilters();
}
/* moved to modules-render.js: renderAccGrid */
function linkedAssetAccountIds(){
return new Set((D.assets||[]).filter(a=>a.accountId).map(a=>String(a.accountId)));
}
function isAccLinkedToAsset(accId){
return linkedAssetAccountIds().has(String(accId));
}
function totalSaldoAkun(){
const linked=linkedAssetAccountIds();
return D.accounts.filter(a=>a.includeInBalance!==false&&!linked.has(String(a.id))).reduce((s,a)=>s+recalcAccBalance(a.id),0);
}
/* moved to modules-render.js: renderDashAccList */
/* moved to modules-render.js: renderLapAccList */
function quickToggleInclude(id){
if(isAccLinkedToAsset(id)&&D.accounts.find(x=>x.id===id)?.includeInBalance!==false){
toast('🔗 Akun ini dikecualikan otomatis karena ditautkan dari 📋 Buku Aset — lepas tautannya dulu di modal Aset kalau mau atur manual di sini');
return;
}
const a=D.accounts.find(x=>x.id===id);
if(!a)return;
a.includeInBalance=a.includeInBalance===false?true:false;
save();renderLapAccList();renderDashAccList();renderAccGrid();
}
let editAccIdx=-1,accIncludeState=true;
// Field tambahan per Jenis Akun (KW-164, permintaan sesi ini) — Investasi butuh nama Platform
// (mis. Bibit/Ajaib), Dikunci butuh perkiraan Target Tanggal Buka (mis. dana darurat baru boleh
// dibuka saat tanggal tertentu). Kas Bebas tidak butuh field tambahan apa-apa.
function onAccJenisChange(){
const jenis=document.getElementById('accJenis')?.value||'kas_bebas';
const wrap=document.getElementById('accJenisFieldsWrap');
if(!wrap)return;
if(jenis==='investasi'){
wrap.innerHTML='<div class="fg"><label class="fl">Platform (opsional)</label><input type="text" class="fi" id="accPlatform" placeholder="Bibit, Ajaib, Pluang, dll"></div>';
} else if(jenis==='dikunci'){
wrap.innerHTML='<div class="fg"><label class="fl">Target Tanggal Buka (opsional)</label><input type="date" class="fi" id="accTargetTanggal"><div style="font-size:11px;color:var(--text2);margin-top:4px">Perkiraan kapan dana ini rencananya boleh dipakai/dicairkan, mis. dana darurat atau tabungan tujuan.</div></div>';
} else {
wrap.innerHTML='';
}
}
function openAccModal(idx){
editAccIdx=(typeof idx==='number')?idx:-1;
const a=editAccIdx>=0?D.accounts[editAccIdx]:null;
document.getElementById('accModalTitle').textContent=a?'Edit Akun':'Tambah Akun';
document.getElementById('accName').value=a?a.name:'';
document.getElementById('accEmoji').value=a?a.emoji:'💰';
document.getElementById('accBalance').value=a?recalcAccBalance(a.id):'';
document.getElementById('accBalanceLabel').textContent=a?'Saldo Sekarang (Rp)':'Saldo Awal (Rp)';
document.getElementById('accBalanceHint').style.display=a?'block':'none';
document.getElementById('accLinkedAssetHint').style.display=(a&&isAccLinkedToAsset(a.id))?'block':'none';
const accJenisEl=document.getElementById('accJenis');
if(accJenisEl)accJenisEl.value=a?(a.jenis||'kas_bebas'):'kas_bebas';
onAccJenisChange();
const platformEl=document.getElementById('accPlatform');
if(platformEl)platformEl.value=a?(a.platform||''):'';
const targetEl=document.getElementById('accTargetTanggal');
if(targetEl)targetEl.value=a?(a.targetTanggalBuka||''):'';
accIncludeState=a?(a.includeInBalance!==false):true;
updateAccIncludeBtn();
openModal('accModal');
}
function toggleAccInclude(){accIncludeState=!accIncludeState;updateAccIncludeBtn();}
function updateAccIncludeBtn(){
const btn=document.getElementById('accIncludeBtn');
if(!btn)return;
btn.classList.toggle('active',accIncludeState);
btn.textContent=accIncludeState?'✓ Aktif':'✕ Nonaktif';
}
function saveAcc(){return withSaveGuard('acc','accModal',_saveAccInner);}
function _saveAccInner(){
const name=document.getElementById('accName').value.trim();
const emoji=document.getElementById('accEmoji').value||'💰';
const nominal=parseFloat(document.getElementById('accBalance').value)||0;
const jenisEl=document.getElementById('accJenis');
const jenis=jenisEl?jenisEl.value:'kas_bebas';
// Field tambahan per jenis (KW-164) — hanya relevan salah satu tergantung jenis yang dipilih,
// yang tidak relevan disimpan kosong (undefined) supaya tidak nyimpen data basi kalau jenis diganti.
const platform=jenis==='investasi'?(document.getElementById('accPlatform')?.value.trim()||''):'';
const targetTanggalBuka=jenis==='dikunci'?(document.getElementById('accTargetTanggal')?.value||''):'';
if(!name){toast('⚠️ Isi nama akun');return;}
if(editAccIdx>=0){
const a=D.accounts[editAccIdx];
a.name=name;a.emoji=emoji;a.includeInBalance=accIncludeState;a.jenis=jenis;a.platform=platform;a.targetTanggalBuka=targetTanggalBuka;
const txDelta=recalcAccBalance(a.id)-(a.baseBalance!==undefined?a.baseBalance:(a.balance||0));
a.baseBalance=nominal-txDelta;
a.balance=nominal;
save();closeModal('accModal');renderAccGrid();populateAccFilters();renderDashAccList();renderLapAccList();toast('✅ Akun diperbarui');
} else {
D.accounts.push({id:'acc_'+Date.now(),name,emoji,baseBalance:nominal,balance:nominal,includeInBalance:accIncludeState,jenis,platform,targetTanggalBuka});
save();closeModal('accModal');renderAccGrid();populateAccFilters();renderDashAccList();renderLapAccList();toast('✅ Akun ditambahkan');
}
}
async function delAcc(i){
if(D.accounts.length<=1){toast('⚠️ Minimal 1 akun harus ada');return;}
const acc=D.accounts[i];
if(!await askConfirm(`Hapus akun "${acc.name}"? Transaksi, tagihan, catatan BBM/servis, dan transaksi Shop yang terkait akan dipindahkan ke akun lain.`))return;
D.accounts.splice(i,1);
const fallback=D.accounts[0];
D.transactions.forEach(t=>{if(t.accountId===acc.id)t.accountId=fallback.id;});
(D.bills||[]).forEach(b=>{if(b.accountId===acc.id)b.accountId=fallback.id;});
(D.bbmLogs||[]).forEach(b=>{if(b.accountId===acc.id)b.accountId=fallback.id;});
(D.servisLogs||[]).forEach(s=>{if(s.accountId===acc.id)s.accountId=fallback.id;});
(D.cobek||[]).forEach(c=>{if(c.accountId===acc.id)c.accountId=fallback.id;});
save();renderAccGrid();populateAccFilters();renderDashAccList();renderLapAccList();renderDashboard();renderKeuangan();refreshBillEverywhere();renderCnTab();toast(`🗑 Akun dihapus, semua data terkait dipindah ke "${fallback.name}"`);
}
