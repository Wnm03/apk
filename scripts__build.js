#!/usr/bin/env node
/**
 * build.js — Build otomatis untuk Keluarga W
 * =============================================================
 * Jalankan skrip ini SETIAP KALI selesai edit file .js sumber
 * (modules-*.js / modals.js), SEBELUM upload ke hosting.
 *
 * Yang dikerjakan otomatis (satu perintah, satu sumber kebenaran):
 *   1. Naikkan APP_BUILD_VERSION & samakan ke SEMUA file source
 *      sekaligus (modules-render.js, modals.js, modules-calc.js,
 *      features-budget-laporan-carnotes-pelanggan.js, features-helpers-global-security.js, dst) — tidak
 *      akan ada lagi versi yang "ketinggalan" di satu file.
 *   2. Gabungkan (bundle) source ke app-bundle-a.min.js &
 *      app-bundle-b.min.js — INI FILE YANG BENERAN DIPAKAI APP,
 *      jadi tidak perlu lagi edit manual dua kali (source + bundle).
 *   3. Naikkan ?v=N di index.html/app_production.html & CACHE_NAME
 *      di sw.js (lewat bump-version.sh yang sudah ada).
 *   4. Cek sintaks kedua bundle hasil build (node --check). Kalau
 *      ada error, build DIHENTIKAN — tidak akan menghasilkan bundle
 *      yang rusak.
 *   5. Lint otomatis untuk bug class "u-dnone (!important) vs
 *      style.display" — dulu ini pernah bikin card Kebebasan
 *      Finansial (dan 26 elemen lain) judulnya tampil tapi isinya
 *      permanen kosong. Build akan DIHENTIKAN kalau ketemu elemen
 *      yang: (a) disembunyikan lewat class "u-dnone" di HTML awal,
 *      DAN (b) ditampilkan di JS cuma lewat `el.style.display=...`
 *      TANPA `el.classList.remove('u-dnone')`/`toggle` di dekatnya.
 *      Lihat fungsi lintDnoneStyleDisplayMismatch() di bawah.
 *   6. app_production.html SELALU ditulis ulang jadi salinan persis
 *      index.html di akhir build — jadi dua file itu tidak akan
 *      pernah lagi diam-diam berbeda isi (dulu ini pure manual,
 *      gampang kelupaan salah satu).
 *   7. Lint otomatis untuk regresi bug "chicken-egg" OCR: pengecekan
 *      `if(typeof Tesseract==='undefined')` sbg guard dini SEBELUM
 *      ocrRecognize()/getOcrWorker() sempat jalan. Tesseract baru
 *      terdaftar sbg global DI DALAM ensureTesseract() (dipanggil dari
 *      getOcrWorker()), jadi guard dini itu selalu true di scan
 *      pertama & OCR tidak akan pernah bisa jalan sama sekali. Bug ini
 *      pernah diperbaiki, lalu sempat ke-revert tanpa sengaja lewat
 *      patch dari branch lama — build akan DIHENTIKAN kalau pola ini
 *      muncul lagi. Lihat fungsi lintOcrPrematureTesseractCheck() di bawah.
 *
 * Pemakaian:
 *   node build.js                  → auto-increment nomor versi (…-31 → …-32)
 *   node build.js nama-versi-baru   → paksa pakai string versi custom
 *
 * Minifikasi:
 *   Kalau paket `esbuild` terpasang (npm install --save-dev esbuild),
 *   skrip ini otomatis makai buat hasil yang benar-benar diminify
 *   (ukuran kecil, mirip build lama). Kalau esbuild TIDAK ada,
 *   skrip tetap jalan & tetap menghasilkan bundle yang 100% valid —
 *   cuma ukurannya lebih besar (source digabung apa adanya, belum
 *   diperkecil). Aman dipakai, tinggal upload; minifikasi tinggal
 *   ditambah belakangan kalau mau.
 * =============================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const GROUP_A = [
  'modules/shared/modules-render.js',
  'modules/shared/modals.js',
  'modules/shared/modules-calc.js',
  'modules/shop/cobek-etalase.js',
  'modules/shop/cobek-pricing.js',
  'modules/shop/cobek-order.js',
  'modules/shop/cobek-tx-cart.js',
  'modules/shop/cobek-io.js',
  'modules/business/kasir.js',
  'modules/finance/piutang-utang.js',
  'modules/finance/pajak-pbb-zakat.js',
  'budget.js',
  'car-notes.js',
  'chat-action-handlers.js',
  'modules/finance/edukasi-dana.js',
  'modules/business/sewakios.js',
  'modules/home/hidup-seimbang.js',
  'modules/finance/linktx.js',
  'modules/home/renovasi.js',
  'modules/asset/aset.js',
  'modules/asset/aset-keluarga.js',
  'modules/ai/feature-insights.js',
  'modules/asset/invest-ai-widget.js',
  'modules/asset/penyusutan-ai-widget.js',
  'modules/asset/aset-emas-impor.js',

  // modules/aset.js (dependency: PropertyManagementAPI._properti() butuh
  // `PajakAset`/`Penyusutan`/`Aset`, ketiganya didefinisikan di
  // modules/asset/aset.js, sudah dimuat lebih dulu di blok ini) — TIDAK
  // perlu forward-reference, pola sama persis penempatan
  // asset-portfolio-api.js (S101) relatif ke dependency-nya.
  'modules/asset/property-management-api.js',

  // Presenter Sesi 132 (audit): ditaruh langsung setelah API-nya, pola
  // sama persis debt-optimizer-api.js -> debt-optimizer-presenter.js.
  'modules/asset/property-management-presenter.js',

  // S103 (Batch 10): Rental Management Foundation — ditaruh SETELAH
  // property-management-api.js (dependency: RentalManagementAPI._properties()
  // butuh `PropertyManagementAPI.propertyList()`, S102, sudah dimuat
  // lebih dulu). `LaporanAset` (dependency lain, modules/asset/aset.js)
  // sudah dimuat lebih dulu juga (awal blok asset di atas) — TIDAK perlu
  // forward-reference sama sekali.
  'modules/asset/rental-management-api.js',

  // Presenter Sesi 132 (audit): ditaruh langsung setelah API-nya.
  'modules/asset/rental-management-presenter.js',

  // S104 (Batch 10): Asset Maintenance Foundation — ditaruh SETELAH
  // rental-management-api.js, bareng grouping per-domain asset.
  // Dependency `Penyusutan`/`Aset` (modules/asset/aset.js) & `todayStr`
  // (modules/shared/features-helpers-global-security.js) semuanya sudah
  // dimuat lebih dulu — TIDAK perlu forward-reference sama sekali.
  'modules/asset/asset-maintenance-api.js',

  // Presenter Sesi 132 (audit): ditaruh langsung setelah API-nya.
  'modules/asset/asset-maintenance-presenter.js',
  'modules/finance/worthit.js',
  'modules/shared/ripple-position.js',
];
const GROUP_B = [
  'modules/shared/data-default.js',
  'modules/shared/features-helpers-global-security.js',
  'diagnostik-versi.js',
  'modules/shared/format-tema.js',
  'modules/shared/error-handler.js',
  'modules/shared/helper-teks.js',
  'modules/shared/keamanan-pin.js',
  'modules/home/refleksi-selfcare.js',
  'modules/shared/modal-navigasi.js',
  'modules/business/reset-gaji-mingguan.js',
  'modules/shared/debug-console.js',
  'modules/shared/pengaturan-search.js',
  'modules/shared/onboarding.js',
  'modules/shared/kalkulator-input.js',
  'modules/shared/scan-ocr.js',
  'modules/finance/filter-laporan.js',
  'modules/finance/akun.js',
  'modules/business/gaji-calc.js',
  'modules/finance/cicilan.js',
  'modules/finance/tx-bbm.js',
  'modules/finance/tx-stok-sparepart.js',
  'modules/finance/tx-transfer.js',
  'modules/finance/tx-cobek.js',
  'modules/finance/tx-target.js',
  'modules/finance/tx-list-cashflow.js',
  'modules/finance/transaksi.js',
  'modules/shared/profil-pengaturan.js',
  'modules/finance/kategori.js',
  'modules/ai/kategorisasi-ai.js',
  'modules/finance/tagihan-kalender.js',
  'modules/shared/backup-restore.js',

  // Data Management Core (Sesi ini): Backup History + Backup Health.
  // Ditaruh SETELAH backup-restore.js (dependency: BackupHistoryAPI.
  // recordEntry() dipanggil dari exportData()/runFullBackup()/runBackup()
  // di backup-restore.js — TAPI pemanggilannya lazy, di dalam function
  // body yg baru jalan saat backup beneran dijalankan user, BUKAN saat
  // file di-parse, jadi urutan load ini sebenarnya tidak wajib — tetap
  // ditaruh setelahnya biar mengelompok scr logis). backup-health-api.js
  // SETELAH backup-history-api.js (dependency: BackupHealthAPI.
  // reliability() memanggil BackupHistoryAPI.summary(), sama alasan
  // lazy di atas). Kedua presenter SETELAH kedua api-nya.
  'modules/shared/backup-history-api.js',
  'modules/shared/backup-health-api.js',
  'modules/shared/backup-history-presenter.js',
  'modules/shared/backup-health-presenter.js',

  'modules/business/payroll-absensi.js',
  'modules/business/tukang-absensi.js',
  'modules/vehicle/vehicle-core.js',
  'modules/ai/chat-action.js',
  'modules/shared/data-archive.js',
  'modules/vehicle/sparepart-servis.js',
  'ai-chat.js',
  'reminder-notif.js',
  'laporan-export.js',
  'gdrive-backup.js',
  'data-health-check.js',
  'global-search.js',
  'sheets-schema.js',
  'sheets-sync.js',
  'pwa-setup.js',
  'self-test.js',
  'pajak-aset-ui-wrappers.js',
  'modules/finance/finance-intelligence.js',
  'modules/finance/finance-dashboard.js',

  // Sesi 91 (Batch 10): Financial Forecast Foundation — ditaruh SETELAH
  // finance-dashboard.js (dependency: FinancialForecastAPI butuh
  // FinanceDashboard.getAIHook() sudah dimuat lebih dulu), sebelum modul
  // vehicle (grouping per-domain finance tetap bersebelahan).
  'modules/finance/financial-forecast-api.js',
  'modules/finance/financial-forecast-presenter.js',

  // Sesi 92 (Batch 10): Budget Recommendation Foundation — ditaruh SETELAH
  // finance-intelligence.js (dependency: BudgetRecommendationAPI butuh
  // FinanceIntelligence.budgetSummary() sudah dimuat lebih dulu), bareng
  // finance-forecast (grouping per-domain finance tetap bersebelahan).
  'modules/finance/budget-recommendation-api.js',
  'modules/finance/budget-recommendation-presenter.js',

  // Sesi 93 (Batch 10): Cash Flow Projection Foundation — ditaruh SETELAH
  // financial-forecast-*.js (dependency: CashFlowProjectionAPI butuh
  // FinancialForecastAPI.summary() sudah dimuat lebih dulu), bareng
  // budget-recommendation (grouping per-domain finance tetap bersebelahan).
  'modules/finance/cashflow-projection-api.js',
  'modules/finance/cashflow-projection-presenter.js',

  // Sesi 94 (Batch 10): Financial Goal Planner Foundation — ditaruh
  // SETELAH cashflow-projection-*.js (dependency: FinancialGoalAPI butuh
  // CashFlowProjectionAPI.summary() sudah dimuat lebih dulu, bareng
  // grouping per-domain finance). `goalAdapterList` (dependency lain,
  // lifeos/adapters/goal-adapter.js) dimuat BELAKANGAN di bundle ini
  // (blok LifeOS di bawah) — TIDAK masalah krn hanya dipanggil di dalam
  // method (runtime, setelah seluruh bundle selesai di-parse), pola sama
  // persis modules/ai/ai-service.js yang juga forward-reference
  // goalAdapterList lebih dulu dari blok LifeOS.
  'modules/finance/financial-goal-api.js',
  'modules/finance/financial-goal-presenter.js',

  // Sesi 95 (Batch 10): Investment Planner Foundation — ditaruh SETELAH
  // financial-goal-*.js (dependency: InvestmentPlannerAPI._surplus()
  // butuh FinancialGoalAPI._surplus() sudah dimuat lebih dulu), bareng
  // grouping per-domain finance. `Investment` (dependency lain,
  // modules/asset/investasi.js) dimuat BELAKANGAN di bundle ini (blok
  // asset di bawah) — TIDAK masalah krn hanya dipanggil di dalam method
  // (runtime, setelah seluruh bundle selesai di-parse), pola sama persis
  // forward-reference `goalAdapterList` di financial-goal-api.js.
  'modules/finance/investment-planner-api.js',
  'modules/finance/investment-planner-presenter.js',

  // Sesi 96 (Batch 10): Debt Optimizer Foundation — ditaruh SETELAH
  // investment-planner-*.js, bareng grouping per-domain finance.
  // `Debt`/`DebtStrategy` (dependency, modules/finance/piutang-utang.js)
  // sudah dimuat lebih dulu (di atas, awal GROUP_A) — TIDAK perlu
  // forward-reference sama sekali (beda dari investment-planner-api.js
  // yang forward-reference `Investment`).
  'modules/finance/debt-optimizer-api.js',
  'modules/finance/debt-optimizer-presenter.js',

  // Sesi 97 (Batch 10): Retirement Planner Foundation — ditaruh SETELAH
  // debt-optimizer-*.js, bareng grouping per-domain finance. `Pensiun`
  // (dependency, modules/shared/modules-calc.js) sudah dimuat lebih
  // dulu (awal GROUP_A, baris kedua) — TIDAK perlu forward-reference
  // sama sekali (beda dari investment-planner-api.js yang
  // forward-reference `Investment`).
  'modules/finance/retirement-planner-api.js',
  'modules/finance/retirement-planner-presenter.js',

  // Sesi 98 (Batch 10): Financial Health Score Foundation — ditaruh
  // SETELAH retirement-planner-*.js, bareng grouping per-domain finance.
  // `FinanceIntelligence` (dependency, modules/finance/
  // finance-intelligence.js) sudah dimuat lebih dulu (awal GROUP_A) —
  // TIDAK perlu forward-reference sama sekali (beda dari
  // investment-planner-api.js yang forward-reference `Investment`).
  'modules/finance/financial-health-score-api.js',
  'modules/finance/financial-health-score-presenter.js',

  // Sesi 99 (Batch 10): Financial Risk Dashboard — ditaruh SETELAH
  // financial-health-score-*.js, bareng grouping per-domain finance.
  // Dependency `DebtOptimizerAPI`/`FinancialHealthScoreAPI`/
  // `FinanceIntelligence` semuanya sudah dimuat lebih dulu (di atas) —
  // TIDAK perlu forward-reference. `TanggaKeuangan` (modules/finance/
  // tangga-keuangan.js) dimuat lewat <script> TERPISAH setelah kedua
  // bundle (lihat index.html/app_production.html) — TIDAK masalah krn
  // hanya dipanggil di dalam method (runtime, setelah seluruh halaman
  // selesai dimuat), pola sama persis forward-reference `Investment` di
  // investment-planner-api.js.
  'modules/finance/financial-risk-dashboard-api.js',
  'modules/finance/financial-risk-dashboard-presenter.js',
  'modules/vehicle/vehicle-intelligence.js',
  'modules/vehicle/vehicle-dashboard.js',
  'modules/vehicle/vehicle-reminder.js',
  'modules/vehicle/vehicle-notif-bridge.js',
  'modules/vehicle/vehicle-ai-hook.js',
  'modules/vehicle/vehicle-insight-presenter.js',
  'modules/vehicle/vehicle-daily-brief.js',
  'modules/vehicle/vehicle-alert-panel.js',
  'modules/vehicle/vehicle-insight-feed.js',
  'modules/vehicle/vehicle-trend-api.js',
  'modules/vehicle/vehicle-cost-summary.js',
  'modules/vehicle/vehicle-fuel-trend.js',
  'modules/vehicle/vehicle-service-trend.js',
  'modules/vehicle/vehicle-analytics-presenter.js',

  // TASK-141: Fuel Intelligence Card — ditaruh SETELAH vehicle-analytics-
  // presenter.js (dependency: VehicleFuelTrendSummary/VehicleReminder/
  // VehicleIntelligence sudah dimuat lebih dulu, di atas). Urutan
  // internal: storage/engine dulu, lalu 2 presenter section (history/
  // analytics) yang konsumsi-nya, baru modal orchestrator, baru card
  // (yang membuka modal itu) — pola sama persis urutan Vehicle Analytics
  // Foundation (Sesi 81) di atas.
  'modules/vehicle/fuel-storage.js',
  // TASK-142: Fuel Tank Profile — ditaruh setelah fuel-storage.js (sama-sama
  // lapisan data domain fuel, 0 dependency satu sama lain) & SEBELUM
  // fuel-intelligence-engine.js (engine baca FuelTankProfile.get() opsional,
  // guard typeof, lihat komentar di file itu).
  'modules/vehicle/fuel-tank-profile.js',
  'modules/vehicle/fuel-intelligence-engine.js',
  // TASK-143: Fuel Gauge Engine — ditaruh setelah fuel-intelligence-engine.js
  // (dependency: FuelTankProfile.get() + fuelEfficiency() global, keduanya
  // sudah dimuat sebelum titik ini) & SEBELUM fuel-history.js (tidak ada
  // dependency ke arah situ, cuma jaga urutan lapisan data domain fuel tetap
  // berdekatan).
  'modules/vehicle/fuel-gauge-engine.js',
  'modules/vehicle/fuel-history.js',
  'modules/vehicle/fuel-analytics.js',
  'modules/vehicle/fuel-modal.js',
  'modules/vehicle/fuel-card.js',
  // Sesi 156d: FuelCard._briefingHtml() (konsolidasi "Fuel Briefing", lihat
  // catatan di fuel-card.js) memanggil FuelInsightEngine.getSummary() lewat
  // guard typeof di DALAM method (runtime, dipanggil dari render() setelah
  // seluruh bundle selesai dimuat) — TIDAK perlu fuel-card.js dipindah ke
  // bawah fuel-insight-engine.js (baris di bawah), pola sama persis forward-
  // reference lain yang sudah dijelaskan di komentar atas (mis. Investment
  // di investment-planner-api.js).
  // TASK-144: Fuel Bar Correction — ditaruh SETELAH fuel-card.js (dependency:
  // FuelGaugeEngine, FuelTankProfile, FuelStorage, FuelCard, FuelModal —
  // semua sudah dimuat sebelum titik ini). Satu file tunggal
  // (fuel-intelligence-ui.js) sesuai TASK-REF-001, bukan dipecah
  // fuel-gauge-ui.js/fuel-bar-correction.js terpisah.
  'modules/vehicle/fuel-intelligence-ui.js',
  // Fuel Tank Profile UI (Atur Tangki) — ditaruh SETELAH fuel-intelligence-ui.js
  // (dependency: FuelBarCorrection.open(), dipanggil balik dari
  // FuelTankProfileUI.save() setelah Simpan sukses kalau modal ini dibuka
  // dari alur Koreksi — lihat komentar di file itu) & SETELAH fuel-card.js
  // (dependency: FuelCard.render(), dipanggil dari save() juga).
  'modules/vehicle/fuel-tank-profile-ui.js',
  // TASK-146: Fuel Consumption Prediction Engine — ditaruh SETELAH
  // fuel-intelligence-ui.js (dependency: FuelGaugeEngine/fuelEfficiency()
  // sudah dimuat di atas, DAN field D.vehicles[i].fuelState yang dibaca
  // engine ini pertama kali DITULIS oleh FuelBarCorrection.save() di file
  // itu — urutan load tidak mengubah runtime behavior krn fuelState cuma
  // dibaca saat method dipanggil, bukan saat file di-load, tapi ditaruh
  // berdekatan biar kelompok modul fuel tetap berurutan sesuai
  // dependency logicalnya). Engine-only, 0 UI, PURE/read-only.
  'modules/vehicle/fuel-prediction-engine.js',
  // TASK-147: Fuel Cost Analytics Engine — ditaruh SETELAH
  // fuel-prediction-engine.js (dependency: FuelStorage/fuelEfficiency()/
  // FuelPredictionEngine semua sudah dimuat sebelum titik ini). Engine-only,
  // 0 UI, PURE/read-only — 0 rumus km/L/Rp-per-km/proyeksi baru, 100% REUSE.
  'modules/vehicle/fuel-cost-analytics.js',
  // TASK-148: Fuel Maintenance Intelligence Engine — ditaruh SETELAH
  // fuel-cost-analytics.js (dependency: FuelCostAnalytics/fuelEfficiency()/
  // predictService()/_vehicleFuelEfficiencyDropCheck()/findVehicleSpec()
  // semua sudah dimuat sebelum titik ini). Engine-only, 0 UI, PURE/
  // read-only — 0 rumus km/L/Rp-per-km/servis/degradasi baru, 100% REUSE.
  'modules/vehicle/fuel-maintenance-engine.js',
  // TASK-149: Fuel Insight Engine — ditaruh SETELAH fuel-maintenance-engine.js
  // (dependency: FuelGaugeEngine/FuelPredictionEngine/FuelCostAnalytics/
  // FuelMaintenanceEngine semua sudah dimuat sebelum titik ini). Engine-only,
  // 0 UI, PURE/read-only — 0 rumus km/L/Rp-per-km/servis/degradasi/proyeksi
  // baru, 100% REUSE seluruh engine fuel yang sudah ada.
  'modules/vehicle/fuel-insight-engine.js',
  // TASK-151A: Fuel Fleet Brief Selector — ditaruh SETELAH
  // fuel-insight-engine.js (dependency: FuelInsightEngine.getSummary()
  // sudah dimuat sebelum titik ini). Presentation helper only, 0 UI, PURE/
  // read-only — 0 kalkulasi bisnis baru, 100% REUSE
  // FuelInsightEngine.getSummary()/highestInsight + curVehicleId (global
  // SUDAH ADA) utk tie-breaker "kendaraan aktif". Menutup gap TASK-151
  // (Fuel AI Daily Briefing Integration, di-STOP sesi sebelumnya).
  'modules/vehicle/fuel-fleet-selector.js',
  // TASK-153: Fuel Notification & Reminder — ditaruh SETELAH
  // fuel-fleet-selector.js (dependency: FuelInsightEngine.getInsights()
  // sudah dimuat sebelum titik ini; FuelModal, dipakai lewat guard typeof
  // di reminder-notif.js checkAndFireReminders() saat notifikasi diklik,
  // sudah dimuat lebih awal di modul fuel-modal.js di atas). Translator
  // murni, 0 UI, PURE/read-only — 0 ambang/rumus reserve/efisiensi/risiko/
  // prediksi baru, 100% REUSE FuelInsightEngine.getInsights(). Pola SAMA
  // PERSIS modules/vehicle/vehicle-notif-bridge.js (Sesi 84).
  'modules/vehicle/fuel-notif-bridge.js',
  // TASK-150: Fuel Dashboard Integration — ditaruh SETELAH
  // fuel-notif-bridge.js (dependency: FuelInsightEngine.getSummary()/
  // FuelModal/FuelBarCorrection semua sudah dimuat sebelum titik ini).
  // UI presenter only, 0 rumus/skoring baru — 100% REUSE
  // FuelInsightEngine.getSummary() + FuelModal.open()/
  // FuelBarCorrection.open() yang sudah ada. Mengelola kendaraan aktifnya
  // sendiri (this.curVehicleId) supaya TIDAK menyentuh FuelFleetSelector
  // ataupun FuelInsightEngine sama sekali (batasan task).
  'modules/vehicle/fuel-dashboard.js',
  // TASK-154: Multi Vehicle Fuel Comparison — ditaruh SETELAH
  // fuel-dashboard.js (dependency: FuelInsightEngine.getSummary()/
  // FuelFleetSelector.selectVehicle()/FuelModal.open() semua sudah dimuat
  // sebelum titik ini). Presentation only, 0 engine/storage baru — 100%
  // REUSE FuelInsightEngine.getSummary() (per kendaraan) +
  // FuelFleetSelector.selectVehicle() (badge prioritas fleet-wide) +
  // FuelModal.open() (buka modal saat kendaraan dipilih).
  'modules/vehicle/fuel-compare.js',
  // TASK-156: Fuel Trend Dashboard — ditaruh SETELAH fuel-compare.js
  // (dependency: FuelInsightEngine.getSummary()/FuelCostAnalytics/
  // FuelPredictionEngine/FuelMaintenanceEngine/FuelModal.open()/
  // FuelBarCorrection.open() semua sudah dimuat sebelum titik ini).
  // Presentation only, 0 engine/helper/storage/rumus baru — 100% REUSE
  // FuelInsightEngine.getSummary() (healthScore/highestInsight) +
  // FuelCostAnalytics (biaya aktual & proyeksi/rata-rata harga/frekuensi
  // isi) + FuelPredictionEngine (jarak tersisa/isi ulang berikutnya/
  // proyeksi pemakaian) + FuelMaintenanceEngine (status efisiensi &
  // dropPct/risiko perawatan/rekomendasi) yang SEMUANYA dipanggil LANGSUNG
  // (bukan hanya lewat FuelInsightEngine.getSummary()) supaya field trend
  // granular yang tidak diekspos getSummary() tetap 100% dibaca apa
  // adanya. Mengelola kendaraan aktifnya sendiri (this.curVehicleId),
  // TIDAK menyentuh FuelFleetSelector maupun engine mana pun.
  'modules/vehicle/fuel-trend-dashboard.js',

  'modules/vehicle/vehicle-decision-api.js',
  'modules/vehicle/vehicle-recommendation-engine.js',
  'modules/vehicle/vehicle-priority-scoring.js',
  'modules/vehicle/vehicle-action-recommendation.js',
  'modules/vehicle/vehicle-decision-presenter.js',
  // Sesi 156b: Vehicle Attention Card — gabungan VehicleAlertPanel/
  // VehicleInsightFeed/VehicleDecisionPresenter jadi satu card ranked.
  // Ditaruh SETELAH vehicle-decision-presenter.js (dependency:
  // VehicleRecommendationEngine/VehiclePriorityScoring/
  // VehicleActionRecommendation di atas + VehicleAIHook, lebih jauh di
  // atas, semua sudah dimuat sebelum titik ini).
  'modules/vehicle/vehicle-attention-presenter.js',
  'modules/vehicle/vehicle-automation-api.js',
  'modules/vehicle/vehicle-reminder-scheduler.js',
  'modules/vehicle/vehicle-maintenance-automation.js',
  'modules/vehicle/vehicle-tax-document-automation.js',
  'modules/vehicle/vehicle-automation-presenter.js',

  // Sesi 87 (Batch 8): Finance & Vehicle Cross Integration Foundation —
  // ditaruh SETELAH seluruh modul finance/vehicle (dependency: butuh
  // FinanceDashboard/FinanceIntelligence & VehicleAIHook/
  // VehicleIntelligence sudah dimuat lebih dulu), sebelum app-bootstrap.js.
  'modules/cross/finance-vehicle-cross-summary.js',
  'modules/cross/cross-ai-hook.js',
  'modules/cross/cross-dashboard-card.js',
  'modules/cross/cross-insight-presenter.js',

  // Sesi 88 (Batch 8): Unified AI Briefing Foundation — ditaruh SETELAH
  // cross-ai-hook.js (dependency: butuh CrossAIHook sudah dimuat lebih
  // dulu), sebelum app-bootstrap.js.
  'modules/cross/unified-summary-api.js',
  'modules/cross/unified-ai-briefing.js',
  'modules/cross/unified-briefing-presenter.js',

  // Sesi 89 (Batch 8): Personal Life Dashboard Foundation — ditaruh
  // SETELAH unified-briefing-presenter.js (dependency: butuh
  // UnifiedSummaryAPI/UnifiedAIBriefing sudah dimuat lebih dulu), sebelum
  // app-bootstrap.js. Urutan internal: summary API dulu, lalu 3 presenter
  // yang konsumsi-nya, baru orchestrator (UnifiedDashboardHome) yang
  // memanggil ketiga presenter itu.
  'modules/cross/life-dashboard-summary-api.js',
  'modules/cross/priority-engine.js',
  'modules/cross/personal-overview-presenter.js',
  'modules/cross/cross-module-widgets.js',
  'modules/cross/life-priority-panel.js',
  'modules/cross/unified-dashboard-home.js',

  // Sesi 90 (Batch 8): Personal Decision Center Foundation — ditaruh
  // SETELAH unified-dashboard-home.js (dependency: DecisionCenterAPI
  // butuh LifeDashboardSummaryAPI/PriorityEngine sudah dimuat lebih
  // dulu, keduanya di atas). Urutan internal: data API dulu, lalu 2
  // presenter yang konsumsi-nya, baru orchestrator (DecisionCenterHome)
  // yang memanggil keduanya.
  'modules/cross/decision-center-api.js',
  'modules/cross/recommendation-panel.js',
  'modules/cross/action-queue.js',
  'modules/cross/decision-center-home.js',
  'app-bootstrap.js',
  'modules/shared/feature-icons.js',
  'modules/dashboard-hub/dashboard-hub-registry.js',
  'modules/dashboard-hub/dashboard-hub.js',
  'modules/dashboard-hub/dashboard-hub-search.js',
  'modules/dashboard-hub/dashboard-hub-favorit.js',
  'modules/dashboard-hub/dashboard-hub-favorit-view.js',

  // S129 (Dashboard Settings): dashboard-hub-settings.js ditaruh SETELAH
  // dashboard-hub-registry.js/dashboard-hub.js/modules-render.js (dependency:
  // DashboardSettings.applyDashCardOrder()/renderDashCardOrderUI() butuh
  // DASH_CARD_BY_KEY/DASH_RENDER_ORDER dari modules-render.js — sudah dimuat
  // lebih dulu, lihat GROUP_A). Tidak ada file lain yang bergantung ke file
  // ini saat load time (cuma dipanggil via typeof-guard dari
  // renderDashboard()/renderSettings()/DashboardHub.render()), jadi aman
  // ditaruh di titik manapun SETELAH dependency-nya.
  'modules/dashboard-hub/dashboard-hub-settings.js',
  'modules/ai/ai-command-center.js',
  'modules/self-reward/self-reward-engine.js',
  'modules/self-reward/self-reward-view.js',
  'modules/self-reward/self-reward-ai-widget.js',
  'modules/asset/investasi.js',

  // S101 (Batch 10): Asset Portfolio Foundation — ditaruh SETELAH
  // investasi.js (dependency: AssetPortfolioAPI._investment() butuh
  // `Investment` sudah dimuat lebih dulu). `Aset` (aset.js)/
  // `totalSaldoAkun` (akun.js)/`Kekayaan` (modules-calc.js) sudah dimuat
  // lebih dulu (GROUP_A) — TIDAK perlu forward-reference utk ketiganya,
  // pola sama persis debt-optimizer-api.js/retirement-planner-api.js
  // yang dependency-nya juga sudah dimuat lebih dulu.
  'modules/asset/asset-portfolio-api.js',

  // Presenter Sesi 132 (audit): ditaruh langsung setelah API-nya, pola
  // sama persis debt-optimizer-api.js -> debt-optimizer-presenter.js.
  'modules/asset/asset-portfolio-presenter.js',

  // --- LifeOS: layer orkestrasi read-only di atas D (lihat
  // lifeos-data-model.md). Urutan WAJIB: store -> registry -> link-registry
  // -> adapters -> services -> ui. Jangan diacak / disisipkan di tempat lain.
  'lifeos/lifeos-store.js',
  'lifeos/lifeos-registry.js',
  'lifeos/lifeos-link-registry.js',
  'lifeos/plugins/lifeos-plugin-manifest.js',
  'lifeos/plugins/lifeos-plugin-validation.js',
  'lifeos/plugins/lifeos-plugin-registry.js',
  'lifeos/plugins/lifeos-plugin-loader.js',
  'lifeos/plugins/lifeos-plugin-runtime.js',
  'lifeos/adapters/area-adapter.js',
  'lifeos/adapters/goal-adapter.js',
  'lifeos/adapters/project-adapter.js',
  'lifeos/adapters/today-adapter.js',
  'lifeos/adapters/review-adapter.js',
  'lifeos/adapters/knowledge-adapter.js',
  'lifeos/lifeos-object-ref.js',
  'lifeos/services/project-service.js',
  'lifeos/services/review-service.js',
  'lifeos/services/knowledge-service.js',
  'lifeos/services/life-object-service.js',
  'lifeos/ui/lifeos-home.js',
  'lifeos/ui/areas.js',
  'lifeos/ui/today.js',
  'lifeos/ui/goals.js',
  'lifeos/ui/projects.js',
  'lifeos/ui/review.js',
  'lifeos/ui/life-objects.js',
  'lifeos/ui/plugins.js',
  'lifeos/ui/knowledge.js',
  'lifeos/lifeos-nav.js',

  // --- Economic Intelligence Engine (EIE): layer orkestrasi read-only di
  // atas D + LifeOS (lihat Economic-Intelligence-Engine-Technical-Design.md).
  // Fase 1 MVP: engine/data saja, TANPA UI/notifikasi aktif ("senyap") —
  // urutan WAJIB: bus -> store -> domain -> adapters -> rules -> engine ->
  // services -> scheduler -> registry (paling akhir, lihat eie-registry.js).
  'economic-intelligence/eie-bus.js',
  'economic-intelligence/eie-store.js',
  'economic-intelligence/domain/entities.js',
  'economic-intelligence/domain/scoring-formulas.js',
  'economic-intelligence/domain/status-classifier.js',
  'economic-intelligence/adapters/user-finance-adapter.js',
  'economic-intelligence/adapters/macro-data-adapter.js',
  'economic-intelligence/rules/rule-schema.js',
  'economic-intelligence/rules/rule-definitions.js',
  'economic-intelligence/engine/rule-engine.js',
  'economic-intelligence/engine/scoring-engine.js',
  'economic-intelligence/engine/insight-generator.js',
  'economic-intelligence/services/macro-sync-service.js',
  'economic-intelligence/services/notification-service.js',
  'economic-intelligence/services/recommendation-service.js',
  'economic-intelligence/scheduler/eie-scheduler.js',
  'economic-intelligence/ui/eie-dashboard.js',
  'economic-intelligence/ui/eie-insight-feed.js',
  'economic-intelligence/ui/eie-notif-settings.js',
  'economic-intelligence/eie-registry.js',

  // --- Smart Delivery Engine: AI decision layer + logistics layer, semua
  // additive (lihat RENCANA-SESI-RINGKAS.md). Sesi 1 MVP: cuma fondasi
  // (bus + storage + context), TANPA fitur, TANPA wiring ke modul lain.
  // Urutan file sesi berikutnya WAJIB ditambah SETELAH ai-core.js (decision
  // engine & service butuh AIBus/AIStore/AIContext sudah ada).
  'modules/ai/ai-core.js',
  'modules/ai/ai-decision-engine.js',
  'modules/ai/ai-service.js',

  // Sesi 3/6: logistics-engine.js/logistics-service.js TIDAK butuh ai-core
  // dkk di atas (murni baca OngkirCalc/PriceReko dari GROUP_A +
  // estimateRpPerKm dari modules/vehicle/vehicle-core.js, keduanya sudah
  // dimuat lebih dulu) — ditaruh sesudah AI cuma supaya semua "Smart
  // Delivery Engine" berurutan di satu tempat, bukan karena ketergantungan.
  'modules/logistics/logistics-engine.js',
  'modules/logistics/logistics-service.js',
];
const ALL_SOURCE = [...GROUP_A, ...GROUP_B];
const HTML_FILES = ['index.html', 'app_production.html'];

function readFile(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8');
}
function writeFile(f, content) {
  fs.writeFileSync(path.join(ROOT, f), content);
}

// 1. Deteksi versi sekarang dari features-helpers-global-security.js (sumber APP_BUILD_VERSION)
function detectCurrentVersion() {
  const src = readFile('modules/shared/features-helpers-global-security.js');
  const m = src.match(/APP_BUILD_VERSION\s*=\s*'([^']+)'/);
  if (!m) {
    throw new Error('Tidak ketemu APP_BUILD_VERSION di features-helpers-global-security.js — cek apakah nama variabelnya berubah.');
  }
  return m[1];
}

function computeNextVersion(current, explicit) {
  if (explicit) return explicit;
  const m = current.match(/^(.*-)(\d+)$/);
  if (!m) {
    throw new Error(
      `Format versi "${current}" tidak dikenali (harus diakhiri -angka, mis. ...-32).\n` +
      `Kasih versi baru manual: node build.js nama-versi-baru`
    );
  }
  const prefix = m[1];
  const num = parseInt(m[2], 10) + 1;
  return prefix + num;
}

// 2. Ganti string versi lama -> baru di SEMUA file source yang memuatnya
function bumpVersionEverywhere(oldV, newV) {
  const changed = [];
  for (const f of ALL_SOURCE) {
    const content = readFile(f);
    if (content.includes(oldV)) {
      writeFile(f, content.split(oldV).join(newV));
      changed.push(f);
    }
  }
  return changed;
}

// 2b. Verifikasi KERAS bahwa setiap konstanta *_VERSION yang dicek runtime lewat
// computeModuleSyncStatus()/_checkModuleVersionSync() (diagnostik-versi.js) BENAR-BENAR
// bernilai versi baru setelah bumpVersionEverywhere(). Ini jaring pengaman utk bug class
// "modals.js MODAL_VERSION diam-diam ketinggalan versi lama yang sudah tidak dipakai file
// lain" (ditemukan 2026-07-12) — bumpVersionEverywhere() cuma cari-ganti STRING oldV, jadi
// kalau satu file punya konstanta versi yang isinya SUDAH menyimpang dari oldV (mis. pernah
// ditulis manual jadi label custom spt 'kw200-import-katalog-harga'), file itu tidak pernah
// match content.includes(oldV) dan SELAMANYA tidak ke-update, TANPA build pernah melapor
// error apa pun — baru ketahuan dari warning runtime di console browser. Fungsi ini menutup
// celah itu: build SEKARANG GAGAL EKSPLISIT kalau ada konstanta yang tidak sinkron, alih-alih
// diam-diam lolos.
const VERSION_CONSTANTS_TO_VERIFY = [
  { file: 'modules/shared/modules-render.js', varName: 'MODULE_RENDER_VERSION' },
  { file: 'modules/shared/modals.js', varName: 'MODAL_VERSION' },
  { file: 'modules/shared/modules-calc.js', varName: 'MODULE_CALC_VERSION' },
  { file: 'chat-action-handlers.js', varName: 'MODULE_FEATURES_VERSION' },
  { file: 'modules/shared/features-helpers-global-security.js', varName: 'APP_BUILD_VERSION' },
  { file: 'modules/shared/features-helpers-global-security.js', varName: 'PRODUCTION_BUILD_SYNCED_VERSION' },
];
function verifyVersionConstantsSynced(newV) {
  const problems = [];
  for (const { file, varName } of VERSION_CONSTANTS_TO_VERIFY) {
    const content = readFile(file);
    const re = new RegExp(varName + "\\s*=\\s*'([^']+)'");
    const m = content.match(re);
    if (!m) {
      problems.push(`${file}: konstanta ${varName} tidak ditemukan sama sekali (nama variabel berubah?)`);
    } else if (m[1] !== newV) {
      problems.push(`${file}: ${varName}='${m[1]}' (seharusnya '${newV}') — kemungkinan nilai lama sudah menyimpang dari versi sebelumnya sehingga tidak ikut ke-replace oleh bumpVersionEverywhere()`);
    }
  }
  return problems;
}

// 3. Minifikasi opsional lewat esbuild (kalau terpasang), fallback ke gabungan mentah
function minify(code) {
  try {
    // eslint-disable-next-line global-require
    const esbuild = require('esbuild');
    const result = esbuild.transformSync(code, { minify: true, loader: 'js', target: 'es2019' });
    return { code: result.code, minified: true };
  } catch (e) {
    return { code, minified: false };
  }
}

// 3b. Backup bundle lama sebelum ditimpa, biar bisa rollback cepat kalau build baru bermasalah
const BACKUP_DIR = path.join(ROOT, 'backups');
const MAX_BACKUPS_PER_FILE = 4; // simpan 4 backup terakhir per bundle, sisanya dihapus otomatis
// (diturunkan dari 10 -> 4 di sesi cleanup 2026-07-10: limit 10 x 2 bundle x ~570KB
// = bisa sampai ~11MB dan ikut kebawa kalau folder project di-zip untuk dikirim/diupload.
// 4 backup/bundle = 4 langkah build terakhir yang bisa di-rollback.sh, cukup buat kejar
// masalah "build baru bermasalah" tanpa numpuk backup yang sudah pasti tidak dipakai lagi.)

function backupBundle(outFile, oldVersion) {
  const src = path.join(ROOT, outFile);
  if (!fs.existsSync(src)) return null; // build pertama kali, belum ada yang perlu dibackup

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-'); // aman dipakai di nama file
  const ext = path.extname(outFile); // .js
  const base = path.basename(outFile, ext); // app-bundle-a.min
  const backupName = `${base}.${oldVersion}.${ts}${ext}`;
  const dest = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(src, dest);
  pruneOldBackups(base, ext);
  return backupName;
}

// Hapus backup terlama kalau sudah melebihi MAX_BACKUPS_PER_FILE, biar folder tidak membengkak terus
function pruneOldBackups(base, ext) {
  const prefix = `${base}.`;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // terbaru dulu

  const toDelete = files.slice(MAX_BACKUPS_PER_FILE);
  for (const f of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
  }
}

function buildBundle(group, outFile, oldVersion) {
  const backupName = backupBundle(outFile, oldVersion);
  const combined = group.map(readFile).join('\n');
  const { code, minified } = minify(combined);
  const header = `// ${outFile} — DIBUAT OTOMATIS oleh build.js dari: ${group.join(', ')}\n` +
                 `// JANGAN diedit manual — edit file source-nya lalu jalankan: node build.js\n`;
  const finalCode = minified ? code : header + code;
  writeFile(outFile, finalCode);
  return { minified, size: Buffer.byteLength(finalCode, 'utf8'), backupName };
}

// 4b. Lint: cegah regresi bug "u-dnone (!important) vs style.display"
// Kronologi: .u-dnone dulu pakai `display:none !important`. Banyak card
// dashboard dirender awal dengan class u-dnone di HTML, lalu JS coba
// menampilkannya cuma lewat `el.style.display='block'` tanpa melepas
// class u-dnone-nya -> karena !important, elemen itu PERMANEN
// tersembunyi walau JS sudah "berhasil" jalan tanpa error. Sekarang
// !important sudah dihapus dari CSS, tapi lint ini tetap dijaga supaya
// pola kode yang sama tidak diam-diam masuk lagi di masa depan (misal
// !important ditambah lagi tanpa sadar, atau file source baru meniru
// pola lama tanpa classList.remove/toggle).
function lintDnoneStyleDisplayMismatch() {
  const htmlSrc = HTML_FILES.map(readFile).join('\n');
  const dnoneIds = new Set();
  const idTagRe = /<[^>]*\bid=["']([a-zA-Z0-9_-]+)["'][^>]*>/g;
  let m;
  while ((m = idTagRe.exec(htmlSrc))) {
    if (m[0].includes('u-dnone')) dnoneIds.add(m[1]);
  }
  const classFirstRe = /<[^>]*class=["'][^"']*u-dnone[^"']*["'][^>]*\bid=["']([a-zA-Z0-9_-]+)["']/g;
  while ((m = classFirstRe.exec(htmlSrc))) dnoneIds.add(m[1]);

  const allSrc = ALL_SOURCE.map((f) => `\n//FILE:${f}\n${readFile(f)}`).join('');

  // id-id yang SUDAH benar (pernah di-classList.remove/toggle('u-dnone'), langsung atau lewat variabel)
  const fixedIds = new Set();
  const declRe = /(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\(["']([a-zA-Z0-9_-]+)["']\)/g;
  const varToId = {};
  while ((m = declRe.exec(allSrc))) {
    (varToId[m[1]] = varToId[m[1]] || new Set()).add(m[2]);
  }
  const directFixRe = /getElementById\(["']([a-zA-Z0-9_-]+)["']\)\.classList\.(remove|toggle)\(["']u-dnone["']/g;
  while ((m = directFixRe.exec(allSrc))) fixedIds.add(m[1]);
  const varFixRe = /(\w+)\.classList\.(remove|toggle)\(["']u-dnone["']/g;
  while ((m = varFixRe.exec(allSrc))) {
    (varToId[m[1]] || []).forEach((id) => fixedIds.add(id));
  }

  // Untuk tiap file source, cek per-kejadian style.display=show, cari deklarasi
  // getElementById terdekat SEBELUM baris itu utk variabel yang sama (scope-aware secara heuristik),
  // lalu pastikan sudah ada classList.remove/toggle('u-dnone') di antara deklarasi & baris itu.
  const showValRe = /(block|flex|grid|inline[a-z-]*)/;
  const problems = [];
  for (const f of ALL_SOURCE) {
    const content = readFile(f);
    const decls = [];
    const dRe = /(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\(["']([a-zA-Z0-9_-]+)["']\)/g;
    let dm;
    while ((dm = dRe.exec(content))) decls.push({ pos: dm.index, v: dm[1], id: dm[2] });
    const disRe = /(\w+)\.style\.display\s*=\s*['"](block|flex|grid|inline[a-z-]*)['"]/g;
    let sm;
    while ((sm = disRe.exec(content))) {
      const varName = sm[1];
      const cands = decls.filter((d) => d.v === varName && d.pos < sm.index);
      if (!cands.length) continue;
      const nearest = cands[cands.length - 1];
      if (!dnoneIds.has(nearest.id) || fixedIds.has(nearest.id)) continue;
      const between = content.slice(nearest.pos, sm.index);
      const fixRe = new RegExp(varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\.classList\\.(remove|toggle)\\(['\"]u-dnone['\"]");
      if (fixRe.test(between)) continue;
      const line = content.slice(0, sm.index).split('\n').length;
      problems.push(`${f}:${line} — #${nearest.id} disembunyikan via class "u-dnone" di HTML, tapi ditampilkan cuma lewat ${varName}.style.display='${sm[2]}' tanpa ${varName}.classList.remove('u-dnone')`);
    }
  }
  return problems;
}

// 4c. Lint: cegah regresi bug "field user di-render tanpa escapeHtml()"
// Kronologi: pernah ketemu (lewat audit manual) beberapa `${xxx.nama}` /
// `${xxx.catatan}` dkk yang dirender langsung ke innerHTML tanpa
// escapeHtml(), jadi celah HTML/script injection kalau isinya diisi user
// (nama pelanggan, catatan transaksi, dst bisa berisi karakter `<`/`>`).
// Lint ini otomatis mengulang cara pengecekan manual tsb tiap build:
//   1. Cari semua interpolasi `${...}` di source (bukan bundle) yang
//      isinya CUMA akses properti polos, misal `${s.nama}`, `${it.note}`,
//      `${a.items[0].name}` — bukan pemanggilan fungsi (jadi `${escapeHtml(x)}`
//      atau `${fmtFull(x)}` otomatis lolos, karena bukan properti polos).
//   2. Properti terakhirnya dicek ke daftar FIELD_NAMES_USER di bawah —
//      nama-nama field yang di app ini historisnya dipakai buat nampung
//      teks bebas ketikan user (nama pelanggan, catatan, alamat, dst).
//   3. Kalau ${...} itu ada di dalam template literal yang mengandung tag
//      HTML (ada pola `<namatag ...>`), berarti kemungkinan besar hasilnya
//      dipakai lewat innerHTML — jadi wajib diescape. Interpolasi yang
//      cuma dipakai buat teks biasa (mis. pesan toast(), bukan innerHTML)
//      TIDAK mengandung tag HTML, jadi otomatis tidak kena lint ini.
//   4. Kalau baris yang sama sudah ditandai manual `// lint-ok-no-escape:
//      <alasan>` (dicek & dipastikan memang bukan data user, misal label
//      status/enum yang fix dari kode, bukan input user), lint ini skip —
//      supaya false-positive yang sudah diverifikasi tidak menghalangi
//      build terus-menerus. TAPI penanda ini harus ditulis manual oleh
//      manusia yang sudah mengecek, bukan ditambah otomatis oleh build.
// Catatan: FIELD_NAMES_USER bukan daftar lengkap selamanya — kalau nanti
// ada field baru yang menampung teks ketikan user (misal fitur baru
// "merkKendaraan" atau "alasanRefund"), TAMBAHKAN nama field itu ke daftar
// di bawah supaya ikut terlindungi lint ini.
const FIELD_NAMES_USER = new Set([
  'nama', 'catatan', 'keterangan', 'deskripsi', 'alamat', 'pesan', 'komentar',
  'judul', 'memo', 'alasan', 'tujuan', 'merk', 'plat', 'notes', 'note',
  'name', 'desc', 'sumber', 'penyewa', 'phone', 'email', 'kota', 'city',
  'address', 'pelanggan', 'customer', 'supplier', 'vendor', 'produsen',
]);
const SUPPRESS_MARKER = 'lint-ok-no-escape';

// Cari semua `${...}` di source (brace-aware, karena isinya bisa mengandung
// kurung kurawal nested, mis. ternary `${a?b:c}`).
function findTemplateInterpolations(content) {
  const results = [];
  const re = /\$\{/g;
  let m;
  while ((m = re.exec(content))) {
    const start = m.index + 2;
    let depth = 1;
    let i = start;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    results.push({ atPos: m.index, endPos: i, inner: content.slice(start, i - 1) });
  }
  return results;
}

// Cari template literal (di antara backtick) yang membungkus posisi tsb,
// buat cek apakah literal itu mengandung tag HTML (indikasi dipakai lewat
// innerHTML) — heuristik, bukan parser JS penuh, tapi cukup buat lint ini.
function enclosingTemplateLiteral(content, pos) {
  const bstart = content.lastIndexOf('`', pos);
  if (bstart === -1) return null;
  const bend = content.indexOf('`', pos);
  if (bend === -1) return null;
  return content.slice(bstart, bend);
}

const BARE_MEMBER_RE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[\d+\])*$/;
const HTML_TAG_RE = /<[a-zA-Z][a-zA-Z0-9-]*[\s>/]/;

// --- Bagian tambahan: lint yang sama tapi buat pola CONCATENATION -----------
// (`el.innerHTML = 'Halo ' + x.nama`), bukan cuma template literal `${...}`.
// Kronologi: lint di atas (findTemplateInterpolations) cuma nangkep pola
// `${obj.field}` di dalam template literal — kalau kode ditulis pakai
// concatenation string biasa (operator `+`) yang dirender ke innerHTML/
// outerHTML/insertAdjacentHTML/document.write, field user di situ LOLOS dari
// lint di atas walau celahnya sama persis (HTML/script injection).
// Cara kerja (heuristik brace/quote-aware, bukan parser JS penuh):
//   1. Cari semua sink HTML yang dikenal: `x.innerHTML=`, `x.innerHTML+=`,
//      `x.outerHTML=`/`+=`, `x.insertAdjacentHTML(pos, ...)`, dan
//      `document.write(...)`/`document.writeln(...)`.
//   2. Dari posisi sink itu, scan ekspresi di sisi kanan (atau argumen HTML-
//      nya utk insertAdjacentHTML) sambil melacak kedalaman kurung/kurawal/
//      kurung-siku & state di dalam string/template literal, supaya operator
//      `+` yang levelnya "top-level" (bukan di dalam nested call/array/object)
//      bisa dipisah jadi operand-operand.
//   3. Tiap operand dicek: kalau berupa member-expression polos (`x.nama`,
//      bukan `escapeHtml(x.nama)` — pemanggilan fungsi otomatis lolos karena
//      bentuknya bukan lagi member-expression polos) DAN nama field
//      terakhirnya ada di FIELD_NAMES_USER yang sama dgn lint di atas →
//      dianggap pelanggaran.
//   4. Suppress manual `// lint-ok-no-escape: <alasan>` di baris yang sama
//      tetap berlaku, sama seperti lint template-literal.
// Batasan (heuristik, bukan parser penuh): kalau HTML dirakit dulu ke variabel
// perantara lalu BARU di-assign ke innerHTML beberapa baris kemudian (mis.
// `let html=...; el.innerHTML=html;`), lint ini tidak menelusuri sampai ke
// assignment `html=...`-nya — cuma sink innerHTML/outerHTML/insertAdjacentHTML/
// document.write yang di-scan langsung ekspresi kanannya.

// Scan dari `startPos` mengikuti kedalaman kurung ()/[]/{} & state string
// ('/"/`), berhenti begitu ketemu `;` atau `,` di level TOP (depth 0), atau
// ketemu penutup kurung yang levelnya "keluar" dari scope pemanggil (depth
// jadi negatif). Selagi jalan, catat posisi absolut tiap operator `+` yang
// levelnya top-level (bukan `++`, bukan di dalam string/nested bracket).
function scanConcatExpr(content, startPos) {
  let i = startPos;
  let depth = 0;
  let quote = null;
  const plusPositions = [];
  while (i < content.length) {
    const c = content[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; i++; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break; // keluar dari scope pemanggil (mis. tutup kurung sink)
      depth--; i++; continue;
    }
    if (depth === 0 && (c === ';' || c === ',')) break;
    if (depth === 0 && c === '+' && content[i - 1] !== '+' && content[i + 1] !== '+' && content[i + 1] !== '=') {
      plusPositions.push(i);
    }
    i++;
  }
  return { endPos: i, plusPositions };
}

// Ambil daftar argumen (posisi start/end) dari sebuah pemanggilan fungsi,
// dimulai TEPAT SETELAH tanda kurung buka `(`.
function scanCallArgs(content, afterOpenParen) {
  const args = [];
  let pos = afterOpenParen;
  while (pos <= content.length) {
    const { endPos, plusPositions } = scanConcatExpr(content, pos);
    args.push({ start: pos, end: endPos, plusPositions });
    if (content[endPos] === ',') { pos = endPos + 1; continue; }
    break;
  }
  return args;
}

// Sink HTML yang dikenal lint ini. `kind:'assign'` -> scan ekspresi setelah
// operator `=`/`+=`. `kind:'call'` -> scan argumen ke-`argIndex` dari
// pemanggilan fungsi (0-based).
const HTML_SINK_PATTERNS = [
  { re: /\.innerHTML\s*(\+=|=(?!=))\s*/g, kind: 'assign' },
  { re: /\.outerHTML\s*(\+=|=(?!=))\s*/g, kind: 'assign' },
  { re: /\.insertAdjacentHTML\s*\(/g, kind: 'call', argIndex: 1 },
  { re: /document\.write(?:ln)?\s*\(/g, kind: 'call', argIndex: null }, // null = cek semua argumen
];

function findConcatOperands(content) {
  // {start,end} tiap operand yg perlu dicek, dikumpulkan dari semua sink.
  const operands = [];
  for (const sink of HTML_SINK_PATTERNS) {
    sink.re.lastIndex = 0;
    let m;
    while ((m = sink.re.exec(content))) {
      if (sink.kind === 'assign') {
        const start = m.index + m[0].length;
        const { endPos, plusPositions } = scanConcatExpr(content, start);
        const bounds = [start, ...plusPositions, endPos];
        for (let k = 0; k < bounds.length - 1; k++) {
          const opStart = k === 0 ? bounds[0] : bounds[k] + 1;
          operands.push({ start: opStart, end: bounds[k + 1] });
        }
      } else {
        const args = scanCallArgs(content, m.index + m[0].length);
        const targetArgs = sink.argIndex === null ? args : (args[sink.argIndex] ? [args[sink.argIndex]] : []);
        for (const arg of targetArgs) {
          const bounds = [arg.start, ...arg.plusPositions, arg.end];
          for (let k = 0; k < bounds.length - 1; k++) {
            const opStart = k === 0 ? bounds[0] : bounds[k] + 1;
            operands.push({ start: opStart, end: bounds[k + 1] });
          }
        }
      }
    }
  }
  return operands;
}

function lintUnescapedUserFieldConcat() {
  const problems = [];
  for (const f of ALL_SOURCE) {
    const content = readFile(f);
    const lines = content.split('\n');
    for (const { start, end } of findConcatOperands(content)) {
      const inner = content.slice(start, end).trim();
      if (!BARE_MEMBER_RE.test(inner)) continue;
      const segs = inner.split(/\.|\[/).map((s) => s.replace(/\]$/, '').replace(/\?$/, ''));
      const lastField = segs[segs.length - 1];
      if (!FIELD_NAMES_USER.has(lastField)) continue;

      const lineNo = content.slice(0, start).split('\n').length;
      if (lines[lineNo - 1] && lines[lineNo - 1].includes(SUPPRESS_MARKER)) continue;

      problems.push(`${f}:${lineNo} — + ${inner} — field "${lastField}" terlihat seperti data ketikan user, dirender ke innerHTML/outerHTML/insertAdjacentHTML/document.write lewat concatenation ("+"), bukan escapeHtml()`);
    }
  }
  return problems;
}

function lintUnescapedUserField() {
  const problems = [];
  for (const f of ALL_SOURCE) {
    const content = readFile(f);
    const lines = content.split('\n');
    for (const occ of findTemplateInterpolations(content)) {
      const inner = occ.inner.trim();
      // Hanya tertarik ke interpolasi properti polos (bukan pemanggilan
      // fungsi) — kalau sudah dibungkus escapeHtml(...)/fmtFull(...)/dst,
      // bentuknya bukan lagi member-expression polos, jadi otomatis lolos.
      if (!BARE_MEMBER_RE.test(inner)) continue;
      const segs = inner.split(/\.|\[/).map((s) => s.replace(/\]$/, '').replace(/\?$/, ''));
      const lastField = segs[segs.length - 1];
      if (!FIELD_NAMES_USER.has(lastField)) continue;

      const tmpl = enclosingTemplateLiteral(content, occ.atPos);
      if (!tmpl || !HTML_TAG_RE.test(tmpl)) continue; // bukan innerHTML-shaped literal

      const lineNo = content.slice(0, occ.atPos).split('\n').length;
      // Penanda suppress tidak bisa ditaruh SATU baris dgn interpolasi kalau baris
      // itu ada di DALAM template literal (`//` akan ikut jadi bagian string, bukan
      // komentar beneran). Jadi selain baris interpolasi itu sendiri (utk kasus
      // literal satu baris), izinkan juga penanda ditaruh persis di baris SEBELUM
      // template literal itu mulai (baris `const x=\`...` di-comment di atasnya).
      const tmplStartPos = content.lastIndexOf('`', occ.atPos);
      const tmplStartLine = content.slice(0, tmplStartPos).split('\n').length;
      const suppressLines = [lineNo, tmplStartLine - 1];
      if (suppressLines.some((ln) => lines[ln - 1] && lines[ln - 1].includes(SUPPRESS_MARKER))) continue;

      problems.push(`${f}:${lineNo} — \${${inner}} — field "${lastField}" terlihat seperti data ketikan user, dirender di dalam markup HTML tanpa escapeHtml()`);
    }
  }
  return problems;
}

// 3b. Lint regresi bug "chicken-egg" OCR (lihat komentar di atas file & di
// scan-ocr.js). Tesseract cuma didaftarkan sbg global DI DALAM
// ensureTesseract(), yang HANYA dipanggil dari getOcrWorker()/ocrRecognize().
// Guard dini `typeof Tesseract==='undefined'` SEBELUM ocrRecognize() sempat
// jalan bikin OCR selalu gagal di percobaan pertama (deadlock). Satu-satunya
// tempat pola string ini boleh muncul di source adalah di DALAM komentar
// (mis. komentar BUGFIX yang menjelaskan sejarah bug ini) — bukan di kode aktif.
function lintOcrPrematureTesseractCheck() {
  const BAD_RE = /typeof\s+Tesseract\s*===?\s*['"]undefined['"]/;
  const problems = [];
  for (const f of ALL_SOURCE) {
    const content = readFile(f);
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.trim().startsWith('//')) return; // baris komentar, aman (mis. komentar BUGFIX historis)
      if (BAD_RE.test(line)) {
        problems.push(`${f}:${idx + 1} — ${line.trim()}`);
      }
    });
  }
  return problems;
}

// 4. Naikkan ?v=N & CACHE_NAME lewat bump-version.sh yang sudah ada
function bumpCacheVersion() {
  const out = execSync('bash scripts/bump-version.sh', { cwd: ROOT }).toString();
  return out;
}

// 5. Cek sintaks hasil build
function syntaxCheck(file) {
  try {
    execSync(`node --check ${JSON.stringify(path.join(ROOT, file))}`, { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.stdout || e.message).toString() };
  }
}

function main() {
  console.log('Mengecek pola bug "u-dnone (!important) vs style.display"...');
  const dnoneProblems = lintDnoneStyleDisplayMismatch();
  if (dnoneProblems.length) {
    console.error(`\n❌ BUILD DIHENTIKAN — ditemukan ${dnoneProblems.length} elemen berpotensi "judul tampil, konten permanen kosong":\n`);
    dnoneProblems.forEach((p) => console.error('  - ' + p));
    console.error(
      '\nPerbaiki dengan menambahkan classList.remove(\'u-dnone\') (atau classList.toggle) ' +
      'sebelum/menyertai baris style.display di atas, lalu jalankan ulang node build.js.\n' +
      'Referensi kasus asli: card Kebebasan Finansial (dashFiBody) yang judulnya tampil tapi isinya kosong.'
    );
    process.exit(1);
  }
  console.log('✓ Tidak ada elemen u-dnone yang berisiko permanen kosong\n');

  console.log('Mengecek pola bug "field user dirender tanpa escapeHtml()"...');
  const escapeProblems = lintUnescapedUserField().concat(lintUnescapedUserFieldConcat());
  if (escapeProblems.length) {
    console.error(`\n❌ BUILD DIHENTIKAN — ditemukan ${escapeProblems.length} interpolasi/concatenation field user yang berpotensi celah HTML/script injection:\n`);
    escapeProblems.forEach((p) => console.error('  - ' + p));
    console.error(
      '\nPerbaiki dengan membungkus pakai escapeHtml(...), misal ${escapeHtml(x.nama)} atau ' +
      "'...'+escapeHtml(x.nama)+'...'.\n" +
      'Kalau setelah dicek field itu TERNYATA bukan data ketikan user (misal label status/enum ' +
      'tetap dari kode), tandai baris itu dgn komentar `// lint-ok-no-escape: <alasan>` supaya ' +
      'lint ini tidak menghalangi build lagi untuk baris tsb.'
    );
    process.exit(1);
  }
  console.log('✓ Tidak ada field user yang dirender tanpa escapeHtml() (template literal maupun concatenation)\n');

  console.log('Mengecek regresi pola bug "chicken-egg" OCR (typeof Tesseract===\'undefined\' sbg guard dini)...');
  const ocrProblems = lintOcrPrematureTesseractCheck();
  if (ocrProblems.length) {
    console.error(`\n❌ BUILD DIHENTIKAN — ditemukan ${ocrProblems.length} baris dengan pola guard dini "typeof Tesseract==='undefined'":\n`);
    ocrProblems.forEach((p) => console.error('  - ' + p));
    console.error(
      '\nPola ini pernah menyebabkan OCR selalu gagal di scan pertama (Tesseract baru terdaftar\n' +
      'sbg global DI DALAM ensureTesseract(), yang dipanggil dari getOcrWorker()/ocrRecognize() —\n' +
      'jadi guard dini ini selalu true & langsung return sebelum sempat jalan). Hapus baris di atas;\n' +
      'biarkan ocrRecognize()/getOcrWorker() yang menangani kegagalan modul lewat scanErrorMessage().\n' +
      'Lihat komentar BUGFIX di scan-ocr.js untuk detail lengkap.'
    );
    process.exit(1);
  }
  console.log('✓ Tidak ada regresi pola guard dini Tesseract\n');

  // Ambil argumen non-flag pertama sbg explicit version (skip --flag spt --require-minify)
  const explicitVersion = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const oldVersion = detectCurrentVersion();
  const newVersion = computeNextVersion(oldVersion, explicitVersion);

  console.log(`Versi lama : ${oldVersion}`);
  console.log(`Versi baru : ${newVersion}`);
  console.log('');

  const changedFiles = bumpVersionEverywhere(oldVersion, newVersion);
  console.log(`✓ Versi disamakan di ${changedFiles.length} file source: ${changedFiles.join(', ')}`);

  const versionSyncProblems = verifyVersionConstantsSynced(newVersion);
  if (versionSyncProblems.length) {
    console.error(`\n❌ BUILD DIHENTIKAN — ${versionSyncProblems.length} konstanta versi TIDAK sinkron setelah bump:\n`);
    versionSyncProblems.forEach((p) => console.error('  - ' + p));
    console.error(
      '\nPerbaiki manual konstanta di atas supaya nilainya persis \'' + newVersion + '\', ' +
      'lalu jalankan ulang node build.js. (Lihat catatan di verifyVersionConstantsSynced() ' +
      'utk kenapa ini bisa terjadi walau bumpVersionEverywhere() sudah jalan.)'
    );
    process.exit(1);
  }
  console.log('✓ Semua konstanta versi (MODULE_RENDER_VERSION/MODAL_VERSION/MODULE_CALC_VERSION/MODULE_FEATURES_VERSION/APP_BUILD_VERSION/PRODUCTION_BUILD_SYNCED_VERSION) terverifikasi sinkron\n');

  const resA = buildBundle(GROUP_A, 'app-bundle-a.min.js', oldVersion);
  const resB = buildBundle(GROUP_B, 'app-bundle-b.min.js', oldVersion);
  console.log(`✓ app-bundle-a.min.js ditulis (${(resA.size / 1024).toFixed(1)} KB${resA.minified ? ', diminify pakai esbuild' : ' — TANPA minifikasi, esbuild tidak ditemukan'})`);
  console.log(`✓ app-bundle-b.min.js ditulis (${(resB.size / 1024).toFixed(1)} KB${resB.minified ? ', diminify pakai esbuild' : ' — TANPA minifikasi, esbuild tidak ditemukan'})`);
  if (resA.backupName || resB.backupName) {
    console.log(`✓ Backup bundle lama disimpan di backups/ (${[resA.backupName, resB.backupName].filter(Boolean).join(', ')})`);
  }

  // Guard: di CI/rilis produksi, esbuild WAJIB ada — `optionalDependencies` di
  // npm bisa gagal terpasang secara DIAM-DIAM (mis. platform mismatch) tanpa
  // bikin `npm install` exit non-zero, jadi CI bisa lolos & menghasilkan bundle
  // TANPA minifikasi tanpa ada yang sadar. Aktifkan dgn flag --require-minify
  // atau env REQUIRE_MINIFY=1 (dipakai oleh ci.yml). Build lokal tanpa flag ini
  // tetap boleh fallback ke non-minified seperti biasa (aman utk dev sehari-hari).
  const requireMinify = process.argv.includes('--require-minify') || process.env.REQUIRE_MINIFY === '1';
  if (requireMinify && (!resA.minified || !resB.minified)) {
    console.error(
      '\n❌ BUILD DIHENTIKAN — --require-minify aktif tapi esbuild tidak terdeteksi/tidak jalan,\n' +
      'jadi bundle di atas TIDAK diminify. Ini biasanya berarti `npm install` di environment ini\n' +
      'gagal memasang esbuild (optionalDependencies) secara diam-diam. Cek log `npm install`,\n' +
      'pastikan esbuild benar-benar terpasang, lalu jalankan ulang.'
    );
    process.exit(1);
  }

  console.log('');
  console.log(bumpCacheVersion().trim());

  console.log('Mengecek sintaks bundle hasil build...');
  const checkA = syntaxCheck('app-bundle-a.min.js');
  const checkB = syntaxCheck('app-bundle-b.min.js');
  if (!checkA.ok || !checkB.ok) {
    console.error('\n❌ BUILD GAGAL — ada syntax error:');
    if (!checkA.ok) console.error('app-bundle-a.min.js:\n' + checkA.error);
    if (!checkB.ok) console.error('app-bundle-b.min.js:\n' + checkB.error);
    console.error('\nBundle di atas TIDAK ditimpa dgn versi rusak akan tetap ada di disk — cek source-nya dulu sebelum upload.');
    process.exit(1);
  }
  console.log('✓ Sintaks kedua bundle valid (node --check lolos)');

  if (readFile('index.html') !== readFile('app_production.html')) {
    writeFile('app_production.html', readFile('index.html'));
    console.log('\n✓ app_production.html ditulis ulang jadi salinan persis index.html (sekarang index.html = satu-satunya sumber kebenaran, app_production.html cuma cermin otomatis).');
  } else {
    console.log('\n✓ index.html & app_production.html sudah identik.');
  }

  console.log(`\n✅ Build "${newVersion}" selesai & lolos cek sintaks. Siap di-upload (jangan lupa upload SEMUA file yang berubah, bukan cuma HTML).`);

  // Regenerate FILE-MAP.md tiap build sukses supaya peta file & fungsi
  // global selalu sinkron dengan source terbaru (lihat catatan di
  // scripts/generate-file-map.js soal kenapa ini dibuat). Dibungkus
  // try/catch: kalau generator ini gagal karena sebab apapun, jangan
  // gagalkan build produksi cuma gara2 dokumentasi bantu gagal digenerate
  // — cukup kasih warning.
  try {
    // eslint-disable-next-line global-require
    const { main: generateFileMap } = require('./generate-file-map');
    generateFileMap();
  } catch (e) {
    console.log(`\n⚠️  FILE-MAP.md gagal digenerate ulang (non-fatal, build tetap lanjut): ${e.message}`);
  }

  if (!resA.minified) {
    console.log(
      '\nCatatan: esbuild belum terpasang di environment ini, jadi bundle di atas belum diminify\n' +
      '(ukurannya lebih besar dari build sebelumnya, tapi 100% valid & aman dipakai).\n' +
      'Kalau mau ukuran sekecil versi lama, jalankan sekali (butuh internet):\n' +
      '  npm install --save-dev esbuild\n' +
      'lalu jalankan ulang "node build.js" — otomatis kepakai kalau terdeteksi ada.'
    );
  }
}

main();
