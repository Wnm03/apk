// modules/finance/finance-dashboard.js — Finance Dashboard & AI Hook Foundation
// (Sesi 75, Batch 6). Lihat docs/BATCH_PLAN.md § Batch 6.
//
// PRINSIP (RULE #1 sesi ini): UI HANYA presenter. 100% REUSE
// FinanceIntelligence.summary() (modules/finance/finance-intelligence.js,
// Sesi 74) — TIDAK ada rumus baru, TIDAK menghitung ulang cashflow/budget/
// income-vs-expense/health score, TIDAK membaca D langsung utk angka apa
// pun (satu-satunya pembacaan D langsung di file ini murni presentasional:
// totalSaldoAkun()/totalDebtValue() utk Net Worth Card, KEDUANYA fungsi yang
// SUDAH ADA & juga dipakai FinanceIntelligence.healthScore() sendiri — bukan
// duplikasi rumus, cuma dipanggil ulang apa adanya krn FinanceIntelligence
// tidak expose angka net worth mentah sbg field summary()).
//
// Dipanggil dari renderKeuangan() (DIPINDAH dari DashboardHub.render() di Sesi 133; pola "tambahan murni" sama persis
// EIEDashboard.render()/DashboardHubAnalytics.render() — lihat komentar di
// dashboard-hub.js). Live-wiring renderDashboard() DIHAPUS di Sesi 134 (gap fix,
// sudah dobel dgn renderKeuangan(), lihat CHANGELOG.md Sesi 134), TIDAK ada mekanisme render baru.
//
// AI Hook (getAIHook()): satu pintu masuk read-only utk konsumen AI/briefing
// masa depan (ai-chat.js dst) — WRAPPER TIPIS ke FinanceIntelligence.summary(),
// 0 logic tambahan, 0 transformasi data. Nama "hook" di sini murni istilah
// UI (titik akses data), BUKAN React hook / lifecycle hook apa pun.

const FinanceDashboard = {

  // getAIHook() — reuse 100% FinanceIntelligence.summary(). Guard: kalau
  // FinanceIntelligence belum dimuat (urutan load / dipakai headless di
  // test), balikin {ok:false} alih-alih throw (pola sama persis
  // cashflowSummary()/budgetSummary() di finance-intelligence.js sendiri).
  getAIHook() {
    if (typeof FinanceIntelligence === 'undefined') {
      return { ok: false, reason: 'FinanceIntelligence belum dimuat' };
    }
    return { ok: true, ...FinanceIntelligence.summary() };
  },

  render() {
    const el = document.getElementById('findashGrid');
    if (!el) return; // container belum ada di halaman ini, aman diam2.

    const hook = this.getAIHook();
    if (!hook.ok) {
      el.innerHTML = '<div class="empty"><div class="empty-text">Data finance intelligence belum tersedia</div></div>';
      return;
    }

    const cards = [
      this._netWorthCard(),
      this._cashFlowCard(hook.cashflow),
      this._budgetCard(hook.budget),
      this._healthCard(hook.healthScore),
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

  // _netWorthCard() — reuse totalSaldoAkun()/totalDebtValue() apa adanya
  // (SUDAH dipakai FinanceIntelligence.healthScore() dgn guard typeof yang
  // sama persis) — 0 rumus baru, murni saldo - utang.
  _netWorthCard() {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (typeof totalSaldoAkun !== 'function' || typeof totalDebtValue !== 'function') {
      return { icon: '💰', label: 'Kekayaan Bersih', value: '—', cls: '' };
    }
    const saldo = totalSaldoAkun();
    const debt = totalDebtValue();
    const net = saldo - debt;
    return {
      icon: '💰',
      label: 'Kekayaan Bersih',
      value: (net < 0 ? '-' : '') + money(Math.abs(net)),
      cls: net < 0 ? 'red' : 'green',
      sub: `Saldo ${money(saldo)} · Utang ${money(debt)}`,
    };
  },

  // _cashFlowCard(cf) — cf = FinanceIntelligence.summary().cashflow, dipakai
  // APA ADANYA (currentMonth.net dari incomeVsExpense() bulan berjalan,
  // projected dari computeCashflowForecast() — 0 recompute di sini).
  _cashFlowCard(cf) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!cf || !cf.ok) {
      return { icon: '💸', label: 'Arus Kas', value: '—', cls: '', sub: cf && cf.reason };
    }
    const net = cf.currentMonth.net;
    const projected = cf.projected;
    return {
      icon: '💸',
      label: 'Arus Kas Bulan Ini',
      value: (net < 0 ? '-' : '') + money(Math.abs(net)),
      cls: net < 0 ? 'red' : 'green',
      sub: projected != null ? `Proyeksi 30 hari: ${(projected < 0 ? '-' : '') + money(Math.abs(projected))}` : undefined,
    };
  },

  // _budgetCard(bs) — bs = FinanceIntelligence.summary().budget, dipakai APA
  // ADANYA (totalUsed/totalLimit/overallPct/overCount dari Budget.getUsed()/
  // getEffectiveLimit() — 0 recompute di sini).
  _budgetCard(bs) {
    const money = (n) => (typeof fmt === 'function') ? fmt(n) : ('Rp ' + Math.round(n || 0));
    if (!bs || !bs.ok) {
      return { icon: '📊', label: 'Anggaran', value: '—', cls: '', sub: bs && bs.reason };
    }
    const pct = Math.round((bs.overallPct || 0) * 100);
    return {
      icon: '📊',
      label: 'Pemakaian Anggaran',
      value: pct + '%',
      cls: bs.overCount > 0 ? 'red' : (pct >= 80 ? 'orange' : 'green'),
      sub: `${money(bs.totalUsed)} dari ${money(bs.totalLimit)}${bs.overCount > 0 ? ` · ${bs.overCount} lewat batas` : ''}`,
    };
  },

  // _healthCard(hs) — hs = FinanceIntelligence.summary().healthScore, dipakai
  // APA ADANYA (score/label sudah final dari healthScore() — 0 recompute).
  _healthCard(hs) {
    if (!hs) {
      return { icon: '❤️', label: 'Skor Kesehatan Finansial', value: '—', cls: '' };
    }
    const cls = hs.score >= 80 ? 'green' : hs.score >= 60 ? '' : hs.score >= 40 ? 'orange' : 'red';
    return {
      icon: '❤️',
      label: 'Skor Kesehatan Finansial',
      value: `${hs.score}/100`,
      cls,
      sub: hs.label,
    };
  },

};
