// modules/asset/rental-management-presenter.js — Rental Management
// Presenter (Sesi 132, Batch 10 lanjutan). Target sesi: audit menemukan
// `RentalManagementAPI` (S103) sudah lengkap + ada test, tapi TIDAK
// PERNAH dipanggil dari file render/presenter manapun — belum ada UI sama
// sekali. Pola SAMA PERSIS `PropertyManagementPresenter.render()` (sesi
// ini — 3 kartu, container `findash-grid` generik yang sama).
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// `RentalManagementAPI.summary()` (modules/asset/
// rental-management-api.js, S103) — TIDAK ada rumus baru, TIDAK
// menghitung ulang income/expense apa pun, TIDAK membaca D/LaporanAset
// langsung.
//
// Dipanggil dari DashboardHub.render() & dari live-wiring renderDashboard()
// (modules/shared/modules-render.js), TIDAK ada mekanisme render baru.
// CSS TIDAK baru — reuse penuh class findash-grid/findash-card.
const RentalManagementPresenter = {

  render() {
    const el = document.getElementById('rentalManagementGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    if (typeof RentalManagementAPI === 'undefined') {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data unit sewa belum tersedia</div></div>';
      return;
    }

    const s = RentalManagementAPI.summary();
    if (!s.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data unit sewa belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._incomeCard(s.income),
      this._unitsCard(s.units),
      this._unmanagedCard(s.unmanaged),
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

  // _incomeCard(i) — i = RentalManagementAPI.summary().income, dipakai
  // APA ADANYA (unitCount/totalIncome/totalExpense/netIncome — 0
  // recompute).
  _incomeCard(i) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!i || !i.ok) {
      return { icon: '🏘️', label: 'Pendapatan Sewa Bersih', value: '—', cls: '', sub: i && i.reason };
    }
    if (i.unitCount === 0) {
      return { icon: '🏘️', label: 'Pendapatan Sewa Bersih', value: 'Belum ada unit sewa', cls: '', sub: 'Tautkan properti ke Akun Transaksi lewat menu 📦 Aset.' };
    }
    return {
      icon: '🏘️',
      label: 'Pendapatan Sewa Bersih',
      value: money(i.netIncome),
      cls: i.netIncome >= 0 ? 'green' : 'red',
      sub: `${i.unitCount} unit · Masuk ${money(i.totalIncome)} · Keluar ${money(i.totalExpense)}`,
    };
  },

  // _unitsCard(u) — u = RentalManagementAPI.summary().units, dipakai APA
  // ADANYA (count/units — 0 recompute). Highlight unit dgn net income
  // tertinggi (pola sama _recommendationCard di DebtOptimizerPresenter).
  _unitsCard(u) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!u || !u.ok || !u.count) {
      return { icon: '🔑', label: 'Unit Sewa', value: 'Belum ada unit', cls: '', sub: '' };
    }
    const sorted = [...u.units].sort((a, b) => b.netIncome - a.netIncome);
    const top = sorted[0];
    return {
      icon: '🔑',
      label: 'Unit Sewa',
      value: `${u.count} unit dilacak`,
      cls: '',
      sub: top ? `Tertinggi: ${top.name} (${money(top.netIncome)})` : '',
    };
  },

  // _unmanagedCard(m) — m = RentalManagementAPI.summary().unmanaged,
  // dipakai APA ADANYA (count/properties — 0 recompute).
  _unmanagedCard(m) {
    if (!m || !m.ok) {
      return { icon: '⚠️', label: 'Properti Belum Ditautkan', value: '—', cls: '', sub: m && m.reason };
    }
    if (m.count === 0) {
      return { icon: '✅', label: 'Properti Belum Ditautkan', value: 'Semua sudah ditautkan', cls: 'green', sub: '' };
    }
    const names = m.properties.slice(0, 2).map((p) => p.name).join(', ');
    return {
      icon: '⚠️',
      label: 'Properti Belum Ditautkan',
      value: `${m.count} properti`,
      cls: '',
      sub: `${names}${m.count > 2 ? ', +' + (m.count - 2) + ' lainnya' : ''} · belum tertaut Akun Transaksi`,
    };
  },

};
