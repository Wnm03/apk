// modules/finance/financial-forecast-presenter.js — Financial Forecast
// Presenter (Sesi 91, Batch 10). Target sesi: Financial Forecast
// Foundation — lihat docs/BATCH_PLAN.md § Batch 10.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// FinancialForecastAPI.summary() (modules/finance/financial-forecast-api.js,
// sesi ini — sendiri 100% reuse FinanceDashboard.getAIHook()/
// FinanceIntelligence, Sesi 74/75) — TIDAK ada rumus baru, TIDAK
// menghitung ulang rata-rata income/expense atau proyeksi saldo, TIDAK
// membaca D langsung sama sekali. Pola SAMA PERSIS FinanceDashboard.render()
// (3 kartu, bukan 4 — Net Worth Card sengaja TIDAK diulang di sini, sudah
// ada di #findashGrid).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama persis
// FinanceDashboard.render()/VehicleDashboard.render() — lihat komentar di
// dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/VehicleDashboard/dst).
const FinancialForecastPresenter = {

  render() {
    const el = document.getElementById('forecastGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof FinancialForecastAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data forecast keuangan belum tersedia</div></div>';
      return;
    }

    const s = FinancialForecastAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data forecast keuangan belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._incomeCard(s.income),
      this._expenseCard(s.expense),
      this._cashflowCard(s.cashflowProjection),
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

  // _incomeCard(f) — f = FinancialForecastAPI.summary().income, dipakai
  // APA ADANYA (avgMonthly/months/currentMonthIncome — 0 recompute).
  _incomeCard(f) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!f || !f.ok) {
      return { icon: '📈', label: 'Perkiraan Pemasukan', value: '—', cls: '', sub: f && f.reason };
    }
    return {
      icon: '📈',
      label: 'Perkiraan Pemasukan',
      value: money(f.avgMonthly) + '/bln',
      cls: 'green',
      sub: `Rata-rata ${f.months} bulan terakhir · bulan ini ${money(f.currentMonthIncome)}`,
    };
  },

  // _expenseCard(f) — f = FinancialForecastAPI.summary().expense, dipakai
  // APA ADANYA (avgMonthly/months/currentMonthExpense — 0 recompute).
  _expenseCard(f) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!f || !f.ok) {
      return { icon: '📉', label: 'Perkiraan Pengeluaran', value: '—', cls: '', sub: f && f.reason };
    }
    return {
      icon: '📉',
      label: 'Perkiraan Pengeluaran',
      value: money(f.avgMonthly) + '/bln',
      cls: 'red',
      sub: `Rata-rata ${f.months} bulan terakhir · bulan ini ${money(f.currentMonthExpense)}`,
    };
  },

  // _cashflowCard(f) — f = FinancialForecastAPI.summary().cashflowProjection,
  // dipakai APA ADANYA (saldoNow/projected/billsDue/upcomingCount — 0
  // recompute, `projected` sudah final dari computeCashflowForecast()).
  _cashflowCard(f) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!f || !f.ok) {
      return { icon: '🔮', label: 'Proyeksi Saldo 30 Hari', value: '—', cls: '', sub: f && f.reason };
    }
    const projected = f.projected;
    return {
      icon: '🔮',
      label: 'Proyeksi Saldo 30 Hari',
      value: (projected < 0 ? '-' : '') + money(Math.abs(projected)),
      cls: projected < 0 ? 'red' : 'green',
      sub: `Saldo sekarang ${money(f.saldoNow)} · ${f.upcomingCount} tagihan jatuh tempo (${money(f.billsDue)})`,
    };
  },

};
