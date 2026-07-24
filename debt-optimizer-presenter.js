// modules/finance/debt-optimizer-presenter.js — Debt Optimizer Presenter
// (Sesi 96, Batch 10). Target sesi: Debt Optimizer Foundation — lihat
// catatan lengkap di modules/finance/debt-optimizer-api.js.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `DebtOptimizerAPI.summary()` (modules/finance/debt-optimizer-api.js,
// sesi ini — sendiri 100% reuse `Debt`/`DebtStrategy`) — TIDAK ada
// rumus baru, TIDAK menghitung ulang DSR/simulasi pelunasan apa pun,
// TIDAK membaca D/Debt/DebtStrategy langsung. Pola SAMA PERSIS
// `InvestmentPlannerPresenter.render()` (Sesi 95 — 3 kartu, container
// `findash-grid` generik yang sama).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama
// persis InvestmentPlannerPresenter.render() — lihat komentar di
// dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/.../InvestmentPlannerPresenter/dst).
const DebtOptimizerPresenter = {

  render() {
    const el = document.getElementById('debtOptimizerGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof DebtOptimizerAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data utang belum tersedia</div></div>';
      return;
    }

    const s = DebtOptimizerAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data utang belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._overviewCard(s.debtOverview),
      this._dsrCard(s.dsr),
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

  // _overviewCard(o) — o = DebtOptimizerAPI.summary().debtOverview,
  // dipakai APA ADANYA (activeCount/totalValue/totalCicilanBulanan — 0
  // recompute).
  _overviewCard(o) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!o || !o.ok) {
      return { icon: '📕', label: 'Ringkasan Utang', value: '—', cls: '', sub: o && o.reason };
    }
    if (o.activeCount === 0) {
      return { icon: '📕', label: 'Ringkasan Utang', value: 'Belum ada utang aktif', cls: '', sub: 'Tambahkan catatan pertama di menu 📕 Buku Utang.' };
    }
    return {
      icon: '📕',
      label: 'Ringkasan Utang',
      value: money(o.totalValue),
      cls: 'red',
      sub: `${o.activeCount} utang aktif · Cicilan ${money(o.totalCicilanBulanan)}/bln`,
    };
  },

  // _dsrCard(d) — d = DebtOptimizerAPI.summary().dsr, dipakai APA
  // ADANYA (pct/incAvg/totalCicilan — 0 recompute).
  _dsrCard(d) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!d || !d.ok) {
      return { icon: '💳', label: 'DSR (Rasio Cicilan)', value: '—', cls: '', sub: d && d.reason };
    }
    if (!(d.incAvg > 0) || typeof d.pct !== 'number') {
      return { icon: '💳', label: 'DSR (Rasio Cicilan)', value: 'Belum cukup data', cls: '', sub: 'Butuh rata-rata pemasukan bulanan utk hitung DSR.' };
    }
    const cls = d.pct > 35 ? 'red' : (d.pct > 30 ? '' : 'green');
    return {
      icon: '💳',
      label: 'DSR (Rasio Cicilan)',
      value: `${d.pct.toFixed(0)}%`,
      cls,
      sub: `Cicilan/tagihan ${money(d.totalCicilan)} dari income ${money(d.incAvg)}/bln`,
    };
  },

  // _recommendationCard(r) — r = DebtOptimizerAPI.summary().recommendation
  // (array, dipakai APA ADANYA — 0 recompute). Menampilkan rekomendasi
  // pertama sbg highlight (pola sama InvestmentPlannerPresenter/
  // FinancialGoalPresenter), sisanya dihitung sbg `sub`.
  _recommendationCard(r) {
    if (!Array.isArray(r) || !r.length) {
      return { icon: '💡', label: 'Rekomendasi Utang', value: 'Belum ada rekomendasi', cls: '', sub: '' };
    }
    const main = r[0];
    const clsMap = { warning: 'red', positive: 'green', info: '' };
    return {
      icon: '💡',
      label: 'Rekomendasi Utang',
      value: main.message,
      cls: clsMap[main.type] || '',
      sub: r.length > 1 ? `+${r.length - 1} rekomendasi lain` : '',
    };
  },

};
