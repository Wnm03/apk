// modules/asset/asset-portfolio-presenter.js — Asset Portfolio Presenter
// (Sesi 132, Batch 10 lanjutan). Target sesi: audit menemukan
// `AssetPortfolioAPI` (S101) sudah lengkap + ada test, tapi TIDAK PERNAH
// dipanggil dari file render/presenter manapun — belum ada UI sama
// sekali. Pola SAMA PERSIS `PropertyManagementPresenter.render()`
// (sesi ini — 3 kartu, container `findash-grid` generik yang sama).
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `AssetPortfolioAPI.summary()` (modules/asset/asset-portfolio-api.js,
// S101) — TIDAK ada rumus baru, TIDAK menghitung ulang komposisi/alokasi
// apa pun, TIDAK membaca D/Aset/Investment/Kekayaan langsung.
//
// Dipanggil dari DashboardHub.render() & dari live-wiring renderDashboard()
// (modules/shared/modules-render.js), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card.
const AssetPortfolioPresenter = {

  render() {
    const el = document.getElementById('assetPortfolioGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof AssetPortfolioAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data portofolio belum tersedia</div></div>';
      return;
    }

    const s = AssetPortfolioAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data portofolio belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._compositionCard(s.composition),
      this._allocationCard(s.allocation),
      this._netWorthCard(s.netWorth),
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

  // _compositionCard(c) — c = AssetPortfolioAPI.summary().composition,
  // dipakai APA ADANYA (totalValue/cashValue/assetValue/investmentValue
  // — 0 recompute).
  _compositionCard(c) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!c || !c.ok) {
      return { icon: '💼', label: 'Total Portofolio', value: '—', cls: '', sub: c && c.reason };
    }
    if (c.totalValue === 0) {
      return { icon: '💼', label: 'Total Portofolio', value: 'Belum ada data', cls: '', sub: '' };
    }
    return {
      icon: '💼',
      label: 'Total Portofolio',
      value: money(c.totalValue),
      cls: '',
      sub: `Kas ${money(c.cashValue)} · Aset ${money(c.assetValue)} · Investasi ${money(c.investmentValue)}`,
    };
  },

  // _allocationCard(a) — a = AssetPortfolioAPI.summary().allocation,
  // dipakai APA ADANYA (breakdown[].category/value/pct — 0 recompute,
  // sudah diurutkan terbesar dulu oleh API).
  _allocationCard(a) {
    if (!a || !a.ok || !a.breakdown || !a.breakdown.length) {
      return { icon: '📊', label: 'Alokasi Portofolio', value: 'Belum cukup data', cls: '', sub: '' };
    }
    const top = a.breakdown[0];
    const rest = a.breakdown.slice(1).map((r) => `${r.category} ${r.pct.toFixed(0)}%`).join(' · ');
    return {
      icon: '📊',
      label: 'Alokasi Portofolio',
      value: `${top.category} ${top.pct.toFixed(0)}%`,
      cls: '',
      sub: rest || '',
    };
  },

  // _netWorthCard(n) — n = AssetPortfolioAPI.summary().netWorth, dipakai
  // APA ADANYA (netWorth/portfolioValue — 0 recompute).
  _netWorthCard(n) {
    const money = (v) => (typeof fmt === 'function') ? fmt(v) : ('Rp ' + Math.round(v || 0));
    if (!n || !n.ok) {
      return { icon: '📈', label: 'Kekayaan Bersih', value: '—', cls: '', sub: n && n.reason };
    }
    return {
      icon: '📈',
      label: 'Kekayaan Bersih',
      value: money(n.netWorth),
      cls: n.netWorth >= 0 ? 'green' : 'red',
      sub: n.portfolioValue != null ? `Portofolio (kas+aset+investasi): ${money(n.portfolioValue)}` : '',
    };
  },

};
