// modules/finance/budget-recommendation-presenter.js — Budget
// Recommendation Presenter (Sesi 92, Batch 10). Target sesi: Budget
// Recommendation Foundation — lihat docs/BATCH_PLAN.md § Batch 10.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// BudgetRecommendationAPI.summary() (modules/finance/
// budget-recommendation-api.js, sesi ini — sendiri 100% reuse
// FinanceIntelligence.budgetSummary(), Sesi 74) — TIDAK ada rumus baru,
// TIDAK menghitung ulang pemakaian/limit/kategori, TIDAK membaca D
// langsung sama sekali. Pola SAMA PERSIS FinancialForecastPresenter.render()
// (Sesi 91 — 3 kartu, container `findash-grid` generik yang sama).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama persis
// FinancialForecastPresenter.render()/VehicleDashboard.render() — lihat
// komentar di dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/FinancialForecastPresenter/
// VehicleDashboard/dst).
const BudgetRecommendationPresenter = {

  render() {
    const el = document.getElementById('budgetRecoGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof BudgetRecommendationAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data rekomendasi anggaran belum tersedia</div></div>';
      return;
    }

    const s = BudgetRecommendationAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data rekomendasi anggaran belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._overCard(s.spendingAnalysis),
      this._underusedCard(s.spendingAnalysis),
      this._topSuggestionCard(s.budgetSuggestion),
    ];

    el.innerHTML = cards.map((c) => `
      <div class="findash-card">
        <div class="findash-card-icon">${c.icon}</div>
        <div class="findash-card-body">
          <div class="findash-card-label">${escapeHtml(c.label)}</div>
          <div class="findash-card-val${c.cls ? ' ' + c.cls : ''}">${escapeHtml(c.value)}</div>
          ${c.sub ? `<div class="findash-card-sub">${escapeHtml(c.sub)}</div>` : ''}
        </div>
      </div>
    `).join('');
  },

  // _overCard(sa) — sa = BudgetRecommendationAPI.summary().spendingAnalysis,
  // dipakai APA ADANYA (overCount/items — 0 recompute). Nama kategori
  // over pertama (kalau ada) dipakai sbg sub-teks, murni .find() atas
  // array yang sudah ada.
  _overCard(sa) {
    if (!sa || !sa.ok) {
      return { icon: '🚨', label: 'Anggaran Over Limit', value: '—', cls: '', sub: sa && sa.reason };
    }
    const first = sa.items.find((it) => it.category === 'over');
    return {
      icon: '🚨',
      label: 'Anggaran Over Limit',
      value: `${sa.overCount} kategori`,
      cls: sa.overCount > 0 ? 'red' : 'green',
      sub: first ? `Terbesar: ${first.name}` : 'Tidak ada anggaran yang over bulan ini',
    };
  },

  // _underusedCard(sa) — pola SAMA PERSIS _overCard() di atas, sisi
  // underusedCount/kategori 'underused' (0 recompute).
  _underusedCard(sa) {
    if (!sa || !sa.ok) {
      return { icon: '🧊', label: 'Anggaran Kurang Terpakai', value: '—', cls: '', sub: sa && sa.reason };
    }
    const first = sa.items.find((it) => it.category === 'underused');
    return {
      icon: '🧊',
      label: 'Anggaran Kurang Terpakai',
      value: `${sa.underusedCount} kategori`,
      cls: '',
      sub: first ? `Contoh: ${first.name} (${Math.round(first.pct * 100)}%)` : 'Semua anggaran terpakai wajar',
    };
  },

  // _topSuggestionCard(bsg) — bsg = BudgetRecommendationAPI.summary().
  // budgetSuggestion, dipakai APA ADANYA (suggestions[0].message — 0
  // recompute, teks sudah final dari BudgetRecommendationAPI).
  _topSuggestionCard(bsg) {
    if (!bsg || !bsg.ok) {
      return { icon: '💡', label: 'Rekomendasi Utama', value: '—', cls: '', sub: bsg && bsg.reason };
    }
    const top = bsg.suggestions[0];
    if (!top) {
      return { icon: '💡', label: 'Rekomendasi Utama', value: 'Tidak ada saran', cls: 'green', sub: 'Semua anggaran dalam batas aman' };
    }
    return {
      icon: '💡',
      label: 'Rekomendasi Utama',
      value: top.name,
      cls: top.category === 'over' ? 'red' : '',
      sub: top.message,
    };
  },

};
