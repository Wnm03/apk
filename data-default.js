// data-default.js — Domain Data Default: kategori shop bawaan (DEFAULT_COBEK_KATEGORI),
// Dipindah ke modules/shared/data-default.js (Sesi 17-18 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// akun keuangan bawaan (DEFAULT_ACCOUNTS), kategori sparepart kendaraan bawaan (DEFAULT_SPAREPARTS).
// PENTING: file ini HARUS dimuat SEBELUM features-helpers-global-security.js (bukan sesudah,
// beda dari file GROUP_B lainnya) — ketiga konstanta di sini dibaca LANGSUNG di dalam deklarasi
// `let D = {...}` pada features-helpers-global-security.js SAAT file itu di-load (bukan di dalam
// function body yang baru jalan belakangan), jadi kalau file ini dimuat SESUDAHNYA, D.cobekKategori/
// D.accounts/D.sparepartCats akan error "not defined" saat app pertama kali dibuka.
// Ditunda sengaja sejak v78 (lihat PEMISAHAN-FILE-ROADMAP.md) karena butuh perubahan urutan load,
// baru dikerjakan di v79 ini.

const DEFAULT_COBEK_KATEGORI = [
{id:'ck_kecil',name:'Shop Kecil'},
{id:'ck_sedang',name:'Shop Sedang'},
{id:'ck_besar',name:'Shop Besar'},
{id:'ck_munthu',name:'Munthu/Ulekan'},
{id:'ck_set',name:'Set Lengkap'},
];
const DEFAULT_ACCOUNTS = [
{id:'acc_cash',name:'Cash',emoji:'💵',balance:0},
{id:'acc_bri',name:'BRI',emoji:'🏦',balance:0},
{id:'acc_gopay',name:'Gopay',emoji:'📱',balance:0},
{id:'acc_seabank',name:'Seabank',emoji:'🏦',balance:0}
];
const DEFAULT_SPAREPARTS = [
{id:'sp_oli_mesin',name:'Oli Mesin',code:'OLI',intervalKm:2000},
{id:'sp_filter_oli',name:'Filter Oli',code:'FOL',intervalKm:8000},
{id:'sp_oli_gardan',name:'Oli Gardan/Transmisi',code:'OGD',intervalKm:8000},
{id:'sp_busi',name:'Busi',code:'BSI',intervalKm:8000},
{id:'sp_filter_udara',name:'Filter Udara',code:'FUD',intervalKm:10000},
{id:'sp_kampas_rem_depan',name:'Kampas Rem Depan',code:'KRD',intervalKm:10000},
{id:'sp_kampas_rem_belakang',name:'Kampas Rem Belakang',code:'KRB',intervalKm:10000},
{id:'sp_vbelt',name:'V-Belt (CVT)',code:'VBL',intervalKm:24000},
{id:'sp_roller_cvt',name:'Roller CVT',code:'RCV',intervalKm:24000},
{id:'sp_aki',name:'Aki (cek/ganti)',code:'AKI',intervalKm:18000}
];
