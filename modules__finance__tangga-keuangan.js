// tangga-keuangan.js — Kartu "Tangga Ternak Uang": 7 anak tangga membangun
// Dipindah ke modules/finance/tangga-keuangan.js (Sesi 16 restrukturisasi folder — lihat docs/FILE-MAP.md & RENCANA-SESI.md; isi & nama file TIDAK berubah, cuma lokasi folder).
// kekayaan (Nabung Cash → Lunasi Hutang Kecil → Dana Darurat → Investasi 20% →
// Dana Pendidikan Anak → Lunasi KPR → Kekayaan Abadi & Berbagi), dihitung
// OTOMATIS dari data yang SUDAH ADA di app (D.accounts, D.bills, D.targets,
// D.assets, D.eduFunds, D.pajakZakat, WorthIt.incomeAvg(), AsetKeluarga.build()).
//
// PENTING (baca sebelum ubah): file TERPISAH dari app-bundle-a/b.min.js,
// di-load lewat <script src="tangga-keuangan.js"> SETELAH kedua bundle di
// index.html/app_production.html — jadi semua fungsi/modul global yang
// dipakai di sini (D, totalSaldoAkun, WorthIt, AsetKeluarga, showPage, dst)
// dijamin sudah ada saat file ini jalan. Tidak menyentuh/mengubah 1 baris
// pun kode yang sudah ada di bundle — murni tambahan, pola sama seperti
// LifeBalance (hidup-seimbang.js): compute() murni logic (bisa dites tanpa
// DOM), render() yang isi DOM.
//
// Definisi tiap anak tangga (ladder = berurutan, harus tuntas satu-satu,
// BUKAN skor gabungan seperti Skor Hidup Seimbang):
//   1. Nabung Cash 10 juta        -> totalSaldoAkun() >= 10jt
//   2. Lunasi Hutang Kecil (≠KPR) -> tidak ada D.bills kind=cicilan (sisaTenor>0)
//                                     yang namanya BUKAN kpr/rumah/properti
//   3. Dana Darurat 3-6 bulan     -> D.targets (isDanaDarurat): saved>=amount
//   4. Investasi >=20% income     -> nilai aset kategori investasi vs estimasi
//                                     akumulasi 20% income setahun (heuristik,
//                                     lihat catatan di HTML kartu)
//   5. Bikin Dana Pendidikan Anak -> minimal 1 D.eduFunds sudah dibuat
//   6. Lunasi KPR secepat mungkin -> tidak ada D.bills kind=cicilan yang
//                                     namanya match kpr/rumah/properti & sisaTenor>0
//   7. Kekayaan Abadi & Berbagi   -> AsetKeluarga total kekayaan bersih besar
//                                     & ada histori zakat/sedekah tercatat
//
// Semua threshold di atas adalah ESTIMASI/adaptasi umum, bukan nasihat
// keuangan personal — ditulis jelas juga di catatan kartu (assumsi transparan,
// selaras gaya dokumentasi KNOWN-ISSUES.md).

const TanggaKeuangan = {
  LABELS: [
    { n: 1, title: 'Nabung Cash 10 Juta', icon: '💵' },
    { n: 2, title: 'Lunasi Hutang Kecil (kecuali KPR)', icon: '✅' },
    { n: 3, title: 'Dana Darurat 3-6 Bulan', icon: '🚨' },
    { n: 4, title: 'Investasi Minimal 20% dari Income', icon: '📈' },
    { n: 5, title: 'Bikin Dana Pendidikan Anak', icon: '🎓' },
    { n: 6, title: 'Lunasi KPR Secepat Mungkin', icon: '🏠' },
    { n: 7, title: 'Kekayaan Abadi & Berbagi', icon: '🌳' },
  ],

  ASET_INVESTASI: ['Emas/Logam Mulia', 'Deposito/Investasi', 'Saham', 'Reksadana', 'Kripto'],

  // BUGFIX (lihat KELUARGA-W checklist): dulu KPR dideteksi dari nama cicilan
  // (regex "kpr|rumah|..."), gampang salah (mis. "Cicilan Renovasi Rumah" ikut
  // ke-tandai KPR padahal bukan). Sekarang pakai flag eksplisit `isKpr` yang
  // diisi user via checkbox "Ini KPR" di form Cicilan (transaksi.js/cicilan.js).
  // Fallback ke deteksi kata kunci LAMA hanya utk cicilan lama yang dibuat
  // SEBELUM checkbox ini ada (isKpr === undefined), supaya data lama tidak
  // tiba-tiba "hilang" dari anak tangga #6 sampai user buka & simpan ulang.
  _isKprLike(bill) {
    if (bill.isKpr !== undefined) return !!bill.isKpr;
    return /kpr|rumah|properti|apartemen|ruko/i.test(bill.name || '');
  },

  compute() {
    const steps = [];
    const incAvg = (typeof WorthIt !== 'undefined') ? WorthIt.incomeAvg() : 0;
    const bills = D.bills || [];

    // 1. Cash 10 juta
    const saldo = (typeof totalSaldoAkun === 'function') ? totalSaldoAkun() : 0;
    steps.push({ done: saldo >= 10000000, note: fmtFull(saldo) + ' / Rp 10.000.000' });

    // 2. Hutang kecil (bukan KPR) lunas
    const hutangKecil = bills.filter(b => b.kind === 'cicilan' && b.sisaTenor != null && b.sisaTenor > 0 && !TanggaKeuangan._isKprLike(b));
    steps.push({ done: hutangKecil.length === 0, note: hutangKecil.length ? hutangKecil.length + ' cicilan kecil masih berjalan' : 'Tidak ada hutang kecil aktif' });

    // 3. Dana darurat 3-6 bulan
    const dd = (D.targets || []).find(t => t.isDanaDarurat);
    const ddDone = !!(dd && dd.amount && dd.saved >= dd.amount);
    steps.push({ done: ddDone, note: dd ? (Math.min(100, Math.round((dd.saved / (dd.amount || 1)) * 100)) + '% dari target') : 'Belum ada Target Dana Darurat' });

    // 4. Investasi >= 20% income (heuristik: akumulasi nilai aset investasi
    //    dibandingkan 20% x income bulanan x 12 -- proxy kasar utk "sudah
    //    rutin invest 20% setahun", BUKAN pelacakan kontribusi bulanan asli)
    const nilaiInvestasi = (D.assets || []).filter(a => TanggaKeuangan.ASET_INVESTASI.includes(a.jenis)).reduce((s, a) => s + (a.nilai || 0), 0);
    const targetInvestasiTahunan = incAvg > 0 ? incAvg * 0.2 * 12 : 0;
    const investDone = targetInvestasiTahunan > 0 && nilaiInvestasi >= targetInvestasiTahunan;
    steps.push({ done: investDone, note: incAvg > 0 ? (fmtFull(nilaiInvestasi) + ' / estimasi ' + fmtFull(targetInvestasiTahunan)) : 'Data income belum cukup' });

    // 5. Dana Pendidikan Anak sudah dibuat
    const eduDone = !!(D.eduFunds && D.eduFunds.length);
    steps.push({ done: eduDone, note: eduDone ? D.eduFunds.length + ' Dana Pendidikan tercatat' : 'Belum ada Dana Pendidikan Anak' });

    // 6. KPR lunas
    const kprAktif = bills.filter(b => b.kind === 'cicilan' && b.sisaTenor != null && b.sisaTenor > 0 && TanggaKeuangan._isKprLike(b));
    steps.push({ done: kprAktif.length === 0, note: kprAktif.length ? kprAktif.length + ' KPR/cicilan properti masih berjalan' : 'Tidak ada KPR aktif' });

    // 7. Kekayaan abadi & berbagi (threshold ilustratif + histori zakat/sedekah)
    let totalKekayaan = 0;
    try { totalKekayaan = (typeof AsetKeluarga !== 'undefined') ? AsetKeluarga.build().total : 0; } catch (e) { totalKekayaan = 0; }
    const zakatLog = (D.pajakZakat && D.pajakZakat.zakatLog) || [];
    const wealthDone = totalKekayaan >= 1000000000 && zakatLog.length > 0;
    steps.push({ done: wealthDone, note: fmtFull(totalKekayaan) + ' kekayaan bersih' + (zakatLog.length ? ', ' + zakatLog.length + 'x tercatat zakat/sedekah' : ', belum ada catatan zakat/sedekah') });

    // Tangga berurutan: posisi user = anak tangga pertama yang BELUM tuntas.
    let currentStep = steps.findIndex(s => !s.done) + 1;
    if (currentStep === 0) currentStep = 7; // semua tuntas -> di puncak

    return { steps, currentStep };
  },

  render() {
    const wrap = document.getElementById('tanggaKeuanganCard');
    if (!wrap) return;
    const { steps, currentStep } = TanggaKeuangan.compute();
    const stepEl = document.getElementById('tanggaKeuanganStepNum');
    const titleEl = document.getElementById('tanggaKeuanganStepTitle');
    const listEl = document.getElementById('tanggaKeuanganList');
    if (stepEl) stepEl.textContent = currentStep;
    if (titleEl) titleEl.textContent = TanggaKeuangan.LABELS[currentStep - 1].icon + ' ' + TanggaKeuangan.LABELS[currentStep - 1].title;
    if (listEl) {
      listEl.innerHTML = steps.map((s, i) => {
        const label = TanggaKeuangan.LABELS[i];
        const isCurrent = (i + 1) === currentStep;
        const cls = s.done ? 'tk-done' : (isCurrent ? 'tk-current' : 'tk-pending');
        const mark = s.done ? '✅' : (isCurrent ? '👉' : '⬜');
        return '<div class="tk-row ' + cls + '"><span class="tk-mark">' + mark + '</span>'
          + '<span class="tk-num">' + label.n + '</span>'
          + '<div class="tk-body"><div class="tk-title">' + label.icon + ' ' + escapeHtml(label.title) + '</div>'
          + '<div class="tk-note">' + escapeHtml(s.note) + '</div></div></div>';
      }).join('');
    }
  }
};

if (typeof window !== 'undefined') {
  window.TanggaKeuangan = TanggaKeuangan;

  // S121 (bugfix -- lihat CHECKPOINT.md/RELEASE-NOTES.md): render() TIDAK lagi
  // di-trigger dari sini. Sebelumnya file ini membungkus window.showPage sendiri
  // + fallback setTimeout(450ms) di window 'load' -- keduanya gagal di boot
  // pertama krn page-dashboard-hub adalah landing page DEFAULT (showMain() lewat
  // refreshCurrentPage(), bukan showPage()), dan setTimeout-nya race melawan
  // await load() (async, bisa lebih lambat dari 450ms) tanpa retry -- kartu bisa
  // macet permanen di "Menghitung...". Sekarang TanggaKeuangan.render() dipanggil
  // dari renderDashboard() (modules/shared/modules-render.js, blok "DASHBOARD HUB
  // — LIVE WIRING"), titik yang sama dipakai 20+ presenter Dashboard Hub lain:
  // dipanggil LANGSUNG-sinkron dari showMain() setelah data siap (boot beres,
  // tanpa tebak-tebak delay) DAN dari tiap save() di seluruh app (live-update
  // kalau user tetap di Beranda sambil simpan data dari halaman lain). compute()/
  // render() di atas TIDAK berubah sama sekali -- murni titik pemanggilnya yang
  // dipindah ke mekanisme yang sudah teruji.
}
