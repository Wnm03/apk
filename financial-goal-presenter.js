// modules/finance/financial-goal-presenter.js — Financial Goal Presenter
// (Sesi 94, Batch 10). Target sesi: Financial Goal Planner Foundation —
// lihat catatan lengkap di modules/finance/financial-goal-api.js.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `FinancialGoalAPI.summary()` (modules/finance/financial-goal-api.js,
// sesi ini — sendiri 100% reuse `goalAdapterList`/
// `CashFlowProjectionAPI.summary()`) — TIDAK ada rumus baru, TIDAK
// menghitung ulang progress/proyeksi apa pun, TIDAK membaca D/
// goalAdapterList/CashFlowProjectionAPI langsung. Pola SAMA PERSIS
// `BudgetRecommendationPresenter.render()` (Sesi 92 — 3 kartu, container
// `findash-grid` generik yang sama).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama persis
// CashFlowProjectionPresenter.render() — lihat komentar di
// dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/FinancialForecastPresenter/
// BudgetRecommendationPresenter/CashFlowProjectionPresenter/dst).
const FinancialGoalPresenter = {

  render() {
    const el = document.getElementById('financialGoalGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof FinancialGoalAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data goal keuangan belum tersedia</div></div>';
      return;
    }

    const s = FinancialGoalAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data goal keuangan belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._progressCard(s.goalProgress),
      this._projectionCard(s.targetProjection),
      this._recommendationCard(s.recommendation),
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

  // _progressCard(p) — p = FinancialGoalAPI.summary().goalProgress,
  // dipakai APA ADANYA (count/achievedCount/inProgressCount/
  // avgProgressPct — 0 recompute).
  _progressCard(p) {
    if (!p || !p.ok) {
      return { icon: '🎯', label: 'Progres Target Keuangan', value: '—', cls: '', sub: p && p.reason };
    }
    if (p.count === 0) {
      return { icon: '🎯', label: 'Progres Target Keuangan', value: 'Belum ada target', cls: '', sub: 'Buat target tabungan/dana pendidikan/dst utk mulai memantau progres.' };
    }
    return {
      icon: '🎯',
      label: 'Progres Target Keuangan',
      value: `${p.avgProgressPct}% rata-rata`,
      cls: p.avgProgressPct >= 80 ? 'green' : (p.avgProgressPct <= 20 ? 'red' : ''),
      sub: `${p.count} target · ${p.achievedCount} tercapai · ${p.inProgressCount} berjalan · ${p.notStartedCount} belum mulai`,
    };
  },

  // _projectionCard(t) — t = FinancialGoalAPI.summary().targetProjection,
  // dipakai APA ADANYA (monthlySurplus/projections — 0 recompute).
  // Menampilkan goal dengan monthsNeeded tercepat (paling dekat tercapai)
  // sbg highlight, murni Math.min/sort atas field yang sudah final (0
  // rumus baru).
  _projectionCard(t) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!t || !t.ok) {
      return { icon: '📈', label: 'Proyeksi Target', value: '—', cls: '', sub: t && t.reason };
    }
    const withEstimate = t.projections.filter((p) => p.monthsNeeded !== null);
    if (!t.projections.length) {
      return { icon: '📈', label: 'Proyeksi Target', value: 'Semua target tercapai', cls: 'green', sub: `Surplus bulanan ${money(t.monthlySurplus)}` };
    }
    if (!withEstimate.length) {
      return { icon: '📈', label: 'Proyeksi Target', value: 'Belum bisa diproyeksikan', cls: 'red', sub: `Surplus bulanan ${money(t.monthlySurplus)} — arus kas belum surplus` };
    }
    const nearest = withEstimate.reduce((a, b) => (b.monthsNeeded < a.monthsNeeded ? b : a));
    return {
      icon: '📈',
      label: 'Proyeksi Target Terdekat',
      value: `${nearest.name} · ${nearest.monthsNeeded} bln lagi`,
      cls: 'green',
      sub: `Surplus bulanan ${money(t.monthlySurplus)} · sisa ${money(nearest.remaining)}`,
    };
  },

  // _recommendationCard(r) — r = FinancialGoalAPI.summary().recommendation
  // (array, dipakai APA ADANYA — 0 recompute). Menampilkan rekomendasi
  // pertama sbg highlight (pola sama BudgetRecommendationPresenter kalau
  // mau ringkas 1 pesan utama), sisanya dihitung sbg `sub`.
  _recommendationCard(r) {
    if (!Array.isArray(r) || !r.length) {
      return { icon: '💡', label: 'Rekomendasi Goal', value: 'Belum ada rekomendasi', cls: '', sub: '' };
    }
    const main = r[0];
    const clsMap = { warning: 'red', positive: 'green', info: '' };
    return {
      icon: '💡',
      label: 'Rekomendasi Goal',
      value: main.message,
      cls: clsMap[main.type] || '',
      sub: r.length > 1 ? `+${r.length - 1} rekomendasi lain` : '',
    };
  },

};
