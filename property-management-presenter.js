// modules/asset/property-management-presenter.js — Property Management
// Presenter (Sesi 132, Batch 10 lanjutan). Target sesi: audit menemukan
// `PropertyManagementAPI` (S102) sudah lengkap + ada test, tapi TIDAK
// PERNAH dipanggil dari file render/presenter manapun — belum ada UI sama
// sekali (beda dari "kurang tombol edit/hapus"). File ini menutup gap
// itu, pola SAMA PERSIS `DebtOptimizerPresenter.render()` (Sesi 96 — 3
// kartu, container `findash-grid` generik yang sama).
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `PropertyManagementAPI.summary()` (modules/asset/
// property-management-api.js, S102) — TIDAK ada rumus baru, TIDAK
// menghitung ulang nilai/PBB/penyusutan apa pun, TIDAK membaca
// D/Aset/PajakAset/Penyusutan langsung.
//
// Dipanggil dari DashboardHub.render() (pola "tambahan murni" sama
// persis DebtOptimizerPresenter.render() — lihat komentar di
// dashboard-hub.js) & dari live-wiring renderDashboard()
// (modules/shared/modules-render.js), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card (grid
// generik, sudah dipakai FinanceDashboard/DebtOptimizerPresenter/dst).
const PropertyManagementPresenter = {

  render() {
    const el = document.getElementById('propertyManagementGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof PropertyManagementAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data properti belum tersedia</div></div>';
      return;
    }

    const s = PropertyManagementAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data properti belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._portfolioCard(s.portfolio),
      this._taxCard(s.tax),
      this._depreciationCard(s.depreciation),
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

  // _portfolioCard(p) — p = PropertyManagementAPI.summary().portfolio,
  // dipakai APA ADANYA (count/totalValue/breakdown — 0 recompute).
  _portfolioCard(p) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!p || !p.ok) {
      return { icon: '🏠', label: 'Portofolio Properti', value: '—', cls: '', sub: p && p.reason };
    }
    if (p.count === 0) {
      return { icon: '🏠', label: 'Portofolio Properti', value: 'Belum ada properti tercatat', cls: '', sub: 'Tambahkan lewat menu 📦 Aset (jenis Tanah/Rumah).' };
    }
    const top = (p.breakdown || [])[0];
    return {
      icon: '🏠',
      label: 'Portofolio Properti',
      value: money(p.totalValue),
      cls: '',
      sub: `${p.count} properti${top ? ' · Terbesar ' + top.jenis + ' (' + top.pct.toFixed(0) + '%)' : ''}`,
    };
  },

  // _taxCard(t) — t = PropertyManagementAPI.summary().tax, dipakai APA
  // ADANYA (count/totalPBB — 0 recompute, PBB per item dari
  // `PajakAset.hitungPBB()`).
  _taxCard(t) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!t || !t.ok) {
      return { icon: '🧾', label: 'Estimasi PBB', value: '—', cls: '', sub: t && t.reason };
    }
    if (t.count === 0) {
      return { icon: '🧾', label: 'Estimasi PBB', value: 'Belum ada properti', cls: '', sub: '' };
    }
    return {
      icon: '🧾',
      label: 'Estimasi PBB',
      value: money(t.totalPBB),
      cls: t.totalPBB > 0 ? 'red' : '',
      sub: `Dari ${t.count} properti · lihat rincian di menu 🧾 Pajak Aset`,
    };
  },

  // _depreciationCard(d) — d = PropertyManagementAPI.summary()
  // .depreciation, dipakai APA ADANYA (jumlahAktif/totalAkumulasi/
  // totalNilaiBuku/belumLengkap — 0 recompute, dari `Penyusutan.hitung()`).
  _depreciationCard(d) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!d || !d.ok) {
      return { icon: '📉', label: 'Penyusutan Properti', value: '—', cls: '', sub: d && d.reason };
    }
    if (d.jumlahAktif === 0) {
      return { icon: '📉', label: 'Penyusutan Properti', value: 'Belum ada yang dilacak', cls: '', sub: 'Aktifkan penyusutan lewat menu 📦 Aset.' };
    }
    return {
      icon: '📉',
      label: 'Penyusutan Properti',
      value: money(d.totalNilaiBuku),
      cls: '',
      sub: `${d.jumlahAktif} properti dilacak · Akumulasi ${money(d.totalAkumulasi)}${d.belumLengkap ? ' · ' + d.belumLengkap + ' data belum lengkap' : ''}`,
    };
  },

};
