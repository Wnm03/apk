// pengaturan-search.js — Domain Pencarian Pengaturan: buka/tutup grup pengaturan (toggleStgGroup), cari
// Dipindah ke modules/shared/pengaturan-search.js (Sesi 17-18 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// & sorot kartu pengaturan yang cocok teks pencarian (stgSearch), dan dukungan keyboard (Enter/Spasi)
// utk buka grup pengaturan lewat kepala grup yang sedang fokus.
// Dipindah dari features-helpers-global-security.js (v73) — potongan KEENAM stlh kalkulator-input.js
// (v69), keamanan-pin.js (v70), modal-navigasi.js (v71), reset-gaji-mingguan.js (v72),
// debug-console.js (v73, potongan sebelum ini di sesi yang sama). Dipilih krn domain kecil & mandiri:
// cuma pakai document.querySelectorAll/getElementById (DOM murni), TIDAK bergantung ke D atau modul
// lain sama sekali.
// CATATAN: blok ini menyertakan 1 `document.addEventListener('keydown',...)` top-level yang jalan saat
// file dimuat (bukan cuma deklarasi function) — ini AMAN dipindah krn cuma daftarkan event listener
// baru ke window/document, tidak bergantung urutan modul lain siap atau tidak.
// Dipanggil dari: `onclick="toggleStgGroup(...)"` & `oninput="stgSearch(...)"` di halaman Pengaturan
// (index.html/app_production.html).
// PENTING: file ini HARUS dimuat SETELAH features-helpers-global-security.js.
// setSettingsTab: split-tab utk halaman Pengaturan (#page-settings), gantiin accordion 6 grup
// lama (stgGroup1..6) yang sekarang jadi .stg-tabpanel + .cn-tabs. Pola PERSIS SAMA dgn
// setKeuanganTab/setShopTab/setPajakTab/setAsetTab (lihat aset.js) -- toggle 'active' di tombol
// .cn-tab & toggle 'u-dnone' di panel yg cocok data-tab. toggleStgGroup() di bawah TETAP ada &
// TIDAK diubah -- masih dipakai apa adanya utk accordion lain (dashSecondaryGroup di Beranda,
// pzPiutangUtangGroup di Pajak & Zakat), cuma sudah tidak dipakai lagi utk stgGroup1..6.
const SETTINGS_TAB_ORDER=['profil','keuangan','pengingat','notifbackup','keamanan','diagnostik'];
function setSettingsTab(tab,el){
document.querySelectorAll('#page-settings .cn-tabs .cn-tab').forEach(b=>b.classList.remove('active'));
if(el) el.classList.add('active');
else { const idx=SETTINGS_TAB_ORDER.indexOf(tab); const btn=document.querySelectorAll('#page-settings .cn-tabs .cn-tab')[idx>=0?idx:0]; if(btn) btn.classList.add('active'); }
document.querySelectorAll('#page-settings .stg-tabpanel').forEach(p=>{
p.classList.toggle('u-dnone', p.dataset.tab!==tab);
});
}
function toggleStgGroup(id){
var g=document.getElementById(id);
if(!g)return;
const isOpen=g.classList.toggle('open');
const head=g.querySelector('.stg-group-head');
if(head)head.setAttribute('aria-expanded',isOpen?'true':'false');
}
// Collapse per-kartu (beda dari toggleStgGroup yg collapse seluruh grup) — dipakai kartu tunggal
// yg isinya panjang, mis. "Kartu di Beranda". `id` = id elemen .card-collapse pembungkusnya.
// PENTING: nama fungsi ini SENGAJA dibedakan dari toggleCardCollapse(key,ev) di modal-navigasi.js
// (dipakai ~40+ kartu lain lewat data-action="toggleCardCollapse" dengan skema id `key+'-cbody'`/
// `key+'-chev'`). SEBELUMNYA file ini juga mendeklarasikan global bernama `toggleCardCollapse`
// dengan signature & skema DOM yang beda (toggle class 'open' di elemen pembungkus + cari child
// `.card-collapse-head`) — karena file ini dimuat SETELAH modal-navigasi.js, deklarasi function
// di sini MENIMPA punya modal-navigasi.js secara global, jadi SEMUA kartu lain (Beranda, Keuangan,
// Laporan, Car Notes, Pajak/Zakat, dst) yang pakai data-action="toggleCardCollapse" ikut manggil
// fungsi versi sini yang salah skema — akibatnya tombol collapse-nya diam saja / tidak berfungsi.
// Jangan pakai nama `toggleCardCollapse` lagi di file ini.
function toggleSingleCardCollapse(id){
var c=document.getElementById(id);
if(!c)return;
const isOpen=c.classList.toggle('open');
const head=c.querySelector('.card-collapse-head');
if(head)head.setAttribute('aria-expanded',isOpen?'true':'false');
}
let _stgSearchHighlighted=[];
function stgSearch(qRaw){
const q=(qRaw||'').trim().toLowerCase();
const resultEl=document.getElementById('stgSearchResult');
_stgSearchHighlighted.forEach(c=>{c.style.outline='';c.style.outlineOffset='';});
_stgSearchHighlighted=[];
if(!q){ if(resultEl)resultEl.style.display='none'; return; }
const cards=document.querySelectorAll('#page-settings .stg-group-body-inner .card');
let matches=[];
cards.forEach(card=>{
if(card.textContent.toLowerCase().indexOf(q)!==-1) matches.push(card);
});
if(resultEl){
resultEl.classList.remove('u-dnone');resultEl.style.display='block';
resultEl.textContent=matches.length?('✅ '+matches.length+' hasil ditemukan'):'⚠️ Tidak ada pengaturan yang cocok';
}
matches.forEach((card,i)=>{
const panel=card.closest('.stg-tabpanel');
if(i===0 && panel && panel.classList.contains('u-dnone')) setSettingsTab(panel.dataset.tab);
if(card.classList.contains('card-collapse') && !card.classList.contains('open')) toggleSingleCardCollapse(card.id);
card.style.outline='2px solid var(--accent)';
card.style.outlineOffset='3px';
_stgSearchHighlighted.push(card);
if(i===0) setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),120);
});
}
document.addEventListener('keydown',function(e){
if(e.key!=='Enter'&&e.key!==' ')return;
const head=e.target.closest&&e.target.closest('.stg-group-head,.card-collapse-head');
if(!head)return;
e.preventDefault();
head.click();
});
