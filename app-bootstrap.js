// app-bootstrap.js — Titik bootstrap utama app: expose modul-modul ke window (Object.assign)
// lalu panggil init(). Dipisah dari features-sheets-pwa-selftest.js (Sesi 3 restrukturisasi
// folder, blok 5 — lihat docs/AUDIT-SESI-1-features-sheets-pwa-selftest.js) murni pengelompokan
// ulang file, BUKAN perubahan perilaku. PENTING: file ini HARUS jadi file TERAKHIR yang dimuat
// di urutan build.js (GROUP_B) sebelum lifeos/economic-intelligence (yang memang sudah dimuat
// belakangan & tidak butuh init() ini — lihat catatan di scripts/build.js).

Object.assign(window,{
Etalase,Produsen,Order,FI,DanaDaruratAI,WorthIt,TimelineW,Pensiun,Budget,BudgetTabs,BudgetReko,
Laporan,Payroll,Tukang,BBM,Sparepart,Servis,Torsi,Pelanggan,SiapPulang,RefAI,Zakat,PPh21,PajakUMKM,
Aset,LifeBalance,Piutang,Debt,DebtStrategy,Renov,RenovAI,SewaKios,RenovCalc,Kekayaan,AlokasiAset,PBB,
IDBStore,LinkTx,Bill,AIWidget,EduFund,PriceReko,OngkirCalc,PriceRekoWidget,StockRekoWidget,Refleksi,Kasir,Advisor,FinCoach,GoldImport,GoldZakat,AIRecommendCard,AIDailyBriefingCard,AISimulateWidget,AIScenarioWidget,AIHealthCheckWidget,BillMultiScan,UniversalScan
});
init();
