// dana-kelolaan-presenter.js — Dana Kelolaan / Managed Funds Presenter
// (Sesi 195). Pola SAMA PERSIS PropertyManagementPresenter.render()
// (modules/asset/property-management-presenter.js, S102/Sesi 132):
// UI HANYA presenter, 100% reuse DanaKelolaan.summary() (dana-kelolaan.js,
// sesi ini, sendiri 100% reuse OwnershipEngine + nilai per-entity yang
// sudah ada) — TIDAK ada rumus baru, TIDAK membaca D langsung. CSS TIDAK
// baru — reuse penuh class findash-grid/findash-card (grid generik, sudah
// dipakai FinanceDashboard/PropertyManagementPresenter/dst).
//
// SYNC (spesifikasi sesi ini):
//   - Dashboard : render()         -> #danaKelolaanGrid (Dashboard Hub,
//                                      dipanggil dari DashboardHub.render())
//   - Laporan   : renderLaporan()  -> #danaKelolaanLapCard (tab Laporan
//                                      Keuangan, dipanggil dari
//                                      renderLaporan(), modules-render.js —
//                                      pola sama AsetKeluarga.render())
//   - Statistik : renderStatistik()-> #lapDanaKelolaan (tab Laporan/
//                                      Statistik Shop, dipanggil dari
//                                      Laporan.renderTab(), cobek-order.js)
// AI Insight ada di file terpisah (lihat DanaKelolaanInsight di bawah,
// pola FeatureInsightUI SAMA PERSIS ShopInsight/MobilInsight dkk,
// feature-insights.js) — SENGAJA tidak dicampur ke KeuanganInsight
// ("Insight Keuangan") karena Dana Kelolaan WAJIB DIKECUALIKAN dari
// Insight Keuangan sesuai spesifikasi sesi ini (exclude list).
const DanaKelolaanPresenter = {

  _money(n) {
    return (typeof fmtFull === 'function') ? fmtFull(n) : ((typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0)));
  },

  // render() — grid 5 kartu (findash-card) di Dashboard Hub:
  // Dana Investor / Dana Titipan / DP Customer / Dana Keluarga / Total.
  render() {
    const el = document.getElementById('danaKelolaanGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof DanaKelolaan === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data dana kelolaan belum tersedia</div></div>';
      return;
    }

    const s = DanaKelolaan.summary();
    const cards = [
      { icon: '💼', label: 'Dana Investor', value: this._money(s.investor) },
      { icon: '🤝', label: 'Dana Titipan', value: this._money(s.titipan) },
      { icon: '🧾', label: 'DP Customer', value: this._money(s.dpCustomer) },
      { icon: '👨‍👩‍👧', label: 'Dana Keluarga', value: this._money(s.keluarga) },
      { icon: '💰', label: 'Total Dana Kelolaan', value: this._money(s.total), cls: 'u-fw700' },
    ];

    el.innerHTML = cards.map((c) => `
      <div class="findash-card">
        <div class="findash-card-icon">${c.icon}</div>
        <div class="findash-card-body">
          <div class="findash-card-label">${escapeHtml(c.label)}</div>
          <div class="findash-card-val${c.cls ? ' ' + c.cls : ''}">${escapeHtml(c.value)}</div>
        </div>
      </div>
    `).join('');
  },

  // renderLaporan() — kartu ringkas di tab Laporan (Keuangan), pola sama
  // AsetKeluarga.render() (aset-keluarga.js): 4 baris + 1 total, murni
  // baca DanaKelolaan.summary() apa adanya.
  renderLaporan() {
    const card = document.getElementById('danaKelolaanLapCard');
    if (!card) return;
    if (typeof DanaKelolaan === 'undefined') return;
    const s = DanaKelolaan.summary();
    const body = document.getElementById('danaKelolaanLapBody');
    if (body) {
      body.innerHTML = `
        <div class="u-flex u-jcb u-fs12 u-mb4"><span>💼 Dana Investor</span><span class="u-fw700">${this._money(s.investor)}</span></div>
        <div class="u-flex u-jcb u-fs12 u-mb4"><span>🤝 Dana Titipan</span><span class="u-fw700">${this._money(s.titipan)}</span></div>
        <div class="u-flex u-jcb u-fs12 u-mb4"><span>🧾 DP Customer</span><span class="u-fw700">${this._money(s.dpCustomer)}</span></div>
        <div class="u-flex u-jcb u-fs12"><span>👨‍👩‍👧 Dana Keluarga</span><span class="u-fw700">${this._money(s.keluarga)}</span></div>
      `;
    }
    const totalEl = document.getElementById('danaKelolaanLapTotal');
    if (totalEl) totalEl.textContent = this._money(s.total);
  },

  // renderStatistik() — 1 baris ringkas di tab Laporan/Statistik Shop
  // (#lapDanaKelolaan), murni tampilkan DP Customer (sub bagian Dana
  // Kelolaan yang paling relevan dgn konteks Shop) — TIDAK menghitung
  // ulang apa pun, reuse DanaKelolaan.summary().dpCustomer apa adanya.
  renderStatistik() {
    const el = document.getElementById('lapDanaKelolaan');
    if (!el) return;
    if (typeof DanaKelolaan === 'undefined') return;
    const s = DanaKelolaan.summary();
    el.textContent = this._money(s.dpCustomer);
  },

};

// DanaKelolaanInsight — kartu "AI Insight" khusus Dana Kelolaan, pola
// FeatureInsightUI SAMA PERSIS ShopInsight/MobilInsight/dkk
// (feature-insights.js): read-only, tidak nyimpen state, compute() balikin
// array {id,icon,text}. SENGAJA modul TERPISAH dari KeuanganInsight supaya
// tidak pernah tercampur ke "Insight Keuangan" (exclude list sesi ini).
const DanaKelolaanInsight = {
  compute() {
    if (typeof DanaKelolaan === 'undefined') return [];
    const s = DanaKelolaan.summary();
    if (s.total <= 0) return [];
    const money = (typeof fmtFull === 'function') ? fmtFull : (n) => ('Rp ' + Math.round(n || 0));
    const out = [{
      id: 'dana-kelolaan-total',
      icon: '💰',
      text: `Total Dana Kelolaan (di luar milik sendiri): ${money(s.total)} — Investor ${money(s.investor)}, Titipan ${money(s.titipan)}, DP Customer ${money(s.dpCustomer)}, Keluarga ${money(s.keluarga)}.`,
    }];
    return out;
  },
  render() {
    if (typeof DanaKelolaan === 'undefined') return;
    const hasData = DanaKelolaan.summary().total > 0;
    if (typeof FeatureInsightUI === 'undefined') return;
    FeatureInsightUI.renderInto('danaKelolaanInsightCard', 'danaKelolaanInsightBody', hasData, this.compute(), 'Belum ada dana kelolaan pihak lain tercatat.');
  },
};
