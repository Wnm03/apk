// chat-action.js — Parsing & UI blok [[ACTION]] dari balasan AI Chat (RefAI), murni ekstraksi/format teks,
// Dipindah ke modules/ai/chat-action.js (Sesi 14 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// TIDAK terkait domain kendaraan/sparepart/storage sama sekali.
// Dipisah dari tukang-absensi.js (2026-07-12, roadmap split file besar bagian ke-1)
// murni pengelompokan ulang file, BUKAN perubahan perilaku. Alasan pisah: satu-satunya kaitan file
// ini dengan sisa isi tukang-absensi.js hanyalah "sama-sama numpuk di file yang sama",
// tidak ada dependensi domain (tidak menyentuh D.vehicles/D.tukangAbsensi/D.sparepartCats dll).
// PENTING urutan load (lihat build.js GROUP_B): file ini HARUS tetap dimuat SETELAH
// features-helpers-global-security.js (yang melakukan `chatInited=false;` sebagai reset, assignment
// biasa BUKAN deklarasi — aman dimuat sebelum `let chatInited` di sini) dan SEBELUM
// features-aiwidget-reminder-gdrive-search.js (yang baca/tulis chatInited, _pendingChatActions,
// memanggil chatActionInnerHTML/extractChatAction) serta SEBELUM chat-action-handlers.js
// jika perlu CHAT_ACTION_LABELS/CHAT_ACTION_HANDLERS (didefinisikan di sana, dipakai lewat referensi lazy
// saat fungsi di bawah ini dipanggil runtime, bukan saat parse, jadi urutan file itu vs file ini tidak masalah).
let chatInited=false;
let _pendingChatActions={};
function chatActionSummary(type,data){
switch(type){
case 'add_transaksi':return `${data.type==='income'?'Pemasukan':'Pengeluaran'} ${fmtFull(Number(data.amount)||0)} — ${data.category||'Lainnya'}${data.note?' ('+data.note+')':''}`;
case 'add_tagihan':return `${data.name||'Tagihan'} — ${fmtFull(Number(data.amount)||0)}, jatuh tempo ${data.nextDue||'-'}`;
case 'add_servis':return `${data.item||'Servis'} — ${data.vehicleName||'kendaraan'} — ${fmtFull(Number(data.cost)||0)}`;
case 'add_target':return `${data.name||'Target'} — target ${fmtFull(Number(data.amount)||0)}`;
case 'add_catatan_anak':return `"${data.text||''}"`;
case 'add_wishlist':return `${data.name||'Barang'} — ${fmtFull(Number(data.price)||0)}${data.cat==='kebutuhan'?' · 🛠️ Kebutuhan':' · ✨ Keinginan'}`;
default:return JSON.stringify(data);
}
}
function _repairLooseJson(raw){
let s=raw.trim();
s=s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"');
s=s.replace(/,(\s*[}\]])/g,'$1');
s=s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,'$1"$2"$3');
s=s.replace(/'([^'"\\]*)'/g,'"$1"');
return s;
}
function extractChatAction(reply){
const m=reply.match(/\[\[ACTION\]\]([\s\S]*?)\[\[\/ACTION\]\]/);
if(!m)return{text:reply,action:null,actionError:false};
const text=(reply.slice(0,m.index)+reply.slice(m.index+m[0].length)).trim();
let parsed=null,actionError=false;
let obj=null;
try{
obj=JSON.parse(m[1]);
}catch(e1){
try{ obj=JSON.parse(_repairLooseJson(m[1])); console.warn('Blok ACTION dari AI awalnya rusak tapi berhasil diperbaiki otomatis:',e1); }
catch(e2){ console.warn('Gagal parsing blok ACTION dari AI:',e2); actionError=true; }
}
if(obj){
if(typeof obj.type==='string'&&CHAT_ACTION_HANDLERS[obj.type]&&obj.data&&typeof obj.data==='object')parsed=obj;
else actionError=true;
}
return{text,action:parsed,actionError};
}
function chatActionInnerHTML(actionId,type,data){
return `<div class="u-fw700 u-mb4">${CHAT_ACTION_LABELS[type]||'Usul Aksi'}</div>
    <div class="u-fs13 u-t2 u-mb8">${escapeHtml(chatActionSummary(type,data))}</div>
    <div class="u-flex u-gap8 u-fwrap">
      <button class="btn btn-primary btn-sm" data-action="confirmChatAction" data-args="${escapeHtml(JSON.stringify([actionId]))}">✅ Konfirmasi</button>
      <button class="btn btn-ghost btn-sm" data-action="editChatAction" data-args="${escapeHtml(JSON.stringify([actionId]))}">✏️ Edit</button>
      <button class="btn btn-ghost btn-sm" data-action="cancelChatAction" data-args="${escapeHtml(JSON.stringify([actionId]))}">❌ Batal</button>
    </div>`;
}
