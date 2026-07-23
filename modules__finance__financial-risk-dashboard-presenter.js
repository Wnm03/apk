// modules/finance/financial-risk-dashboard-presenter.js — Financial Risk
// Dashboard Presenter (Sesi 99, Batch 10). Target sesi: Financial Risk
// Dashboard — lihat catatan lengkap di modules/finance/
// financial-risk-dashboard-api.js.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `FinancialRiskDashboardAPI.summary()` (modules/finance/
// financial-risk-dashboard-api.js, sesi ini — sendiri 100% reuse
// DebtOptimizerAPI/FinancialHealthScoreAPI/FinanceIntelligence/
// TanggaKeuangan) — TIDAK ada rumus baru, TIDAK menghitung ulang faktor
// risiko/level apa pun, TIDAK membaca D/modul sumber langsung. Pola SAMA
// PERSIS `FinancialHealthScorePresenter.render()` (Sesi 98 — 3 kartu,
// container `findash-grid` generik yang sama).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama
// persis FinancialHealthScorePresenter.render() — lihat komentar di
// dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/.../FinancialHealthScorePresenter/dst).
const FinancialRiskDashboardPresenter = {

  // DOMAIN_LABELS — pemetaan label tampilan (Bahasa Indonesia) per
  // `domain` (murni presentasi, sama pola dgn LABELS di
  // FinancialHealthScoreAPI.componentBreakdown() — bukan logic baru).
  DOMAIN_LABELS: {
    debt: 'Utang',
    health: 'Kesehatan Finansial',
    cashflow_budget: 'Arus Kas & Anggaran',
    emergency_fund: 'Dana Darurat',
  },

  render() {
    const el = document.getElementById('financialRiskDashboardGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof FinancialRiskDashboardAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data risiko finansial belum tersedia</div></div>';
      return;
    }

    const s = FinancialRiskDashboardAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data risiko finansial belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._levelCard(s.riskLevel),
      this._topFactorCard(s.riskFactors),
      this._breakdownCard(s.riskFactors),
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

  // _levelCard(rl) — rl = FinancialRiskDashboardAPI.summary().riskLevel,
  // dipakai APA ADANYA (count/level/label — 0 recompute).
  _levelCard(rl) {
    if (!rl) {
      return { icon: '🛡️', label: 'Tingkat Risiko Finansial', value: '—', cls: '' };
    }
    const cls = rl.level === 'low' ? 'green' : rl.level === 'medium' ? 'orange' : 'red';
    return {
      icon: '🛡️',
      label: 'Tingkat Risiko Finansial',
      value: rl.label,
      cls,
      sub: `${rl.count} faktor risiko terdeteksi`,
    };
  },

  // _topFactorCard(rf) — rf = FinancialRiskDashboardAPI.summary().riskFactors
  // (array, dipakai APA ADANYA — 0 recompute). Menampilkan faktor
  // pertama sbg highlight (pola sama RetirementPlannerPresenter/
  // FinancialHealthScorePresenter), sisanya dihitung sbg `sub`.
  _topFactorCard(rf) {
    if (!Array.isArray(rf) || !rf.length) {
      return { icon: '⚠️', label: 'Faktor Risiko Utama', value: 'Tidak ada faktor risiko terdeteksi', cls: 'green', sub: '' };
    }
    const main = rf[0];
    return {
      icon: '⚠️',
      label: 'Faktor Risiko Utama',
      value: main.message,
      cls: 'red',
      sub: rf.length > 1 ? `+${rf.length - 1} faktor lain` : '',
    };
  },

  // _breakdownCard(rf) — rf = FinancialRiskDashboardAPI.summary().riskFactors
  // (array, dipakai APA ADANYA — 0 recompute). Menghitung jumlah faktor
  // per `domain` murni presentasional (count sederhana, bukan rumus
  // baru), pola sama RetirementPlannerPresenter menampilkan sub-count.
  _breakdownCard(rf) {
    if (!Array.isArray(rf) || !rf.length) {
      return { icon: '🗂️', label: 'Sebaran Risiko', value: 'Belum ada data', cls: '', sub: '' };
    }
    const counts = {};
    rf.forEach((f) => {
      counts[f.domain] = (counts[f.domain] || 0) + 1;
    });
    const parts = Object.keys(counts).map((k) => `${this.DOMAIN_LABELS[k] || k} ${counts[k]}`);
    return {
      icon: '🗂️',
      label: 'Sebaran Risiko',
      value: parts.join(' · '),
      cls: '',
      sub: `${rf.length} total faktor`,
    };
  },

};
