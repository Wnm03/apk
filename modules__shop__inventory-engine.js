// inventory-engine.js — Shop Business Engine, S198 (Business Engine untuk
// Shop).
//
// InventoryEngine = lapisan stok/katalog (nilai stok tertanam, status
// stok per produk, grup harga ukuran/gabungan, & rekomendasi restock).
// SAMA POLA dgn PurchaseEngine/TripEngine (file sebelah): pure wrapper,
// TIDAK ADA rumus baru — semuanya delegasi ke fungsi Shop existing (Etalase.*
// & StockRekoWidget.* di modules/shop/cobek-etalase.js & cobek-pricing.js).
//
// TIDAK PERNAH menyentuh D sendiri, TIDAK PERNAH panggil save(). Method di
// bawah memanggil Etalase/StockRekoWidget yang MEMANG membaca D.products
// read-only — perilaku ASLI fungsi tsb, bukan tambahan baru di sini.
//
// Belum digunakan UI. Belum dihubungkan ke Shop (tidak dipanggil dari
// cobek-*.js mana pun sesi ini).
const InventoryEngine = {

  // stockStatus(product) — label status stok per produk, PERSIS ambang di
  // Etalase.renderList() (cobek-etalase.js): `p.stock<=2` -> 'low'
  // ("Menipis"), `p.stock<=5` -> 'mid' ("Terbatas"), selain itu -> 'ok'
  // ("Aman"). Dibungkus jadi fungsi murni (parameter angka, bukan baca DOM)
  // supaya bisa dites/dipanggil tanpa render tab Etalase.
  stockStatus(product) {
    const stock = (product && parseFloat(product.stock)) || 0;
    const cls = stock <= 2 ? 'low' : (stock <= 5 ? 'mid' : 'ok');
    const label = stock <= 2 ? 'Menipis' : (stock <= 5 ? 'Terbatas' : 'Aman');
    return { stock, cls, label };
  },

  // totalModalStok(products) / totalNilaiJualStok(products) — delegasi
  // PERSIS ke Etalase.totalModalStok()/Etalase.totalNilaiJualStok(), dibuat
  // menerima `products` sbg parameter opsional supaya bisa dites tanpa objek
  // D global (fallback ke D.products lewat Etalase kalau tidak dikasih).
  totalModalStok(products) {
    if (products) {
      return (products || []).reduce((s, p) => s + ((p.stock || 0) * (p.hargaBeli || 0)), 0);
    }
    if (typeof Etalase === 'undefined') return 0;
    return Etalase.totalModalStok();
  },

  totalNilaiJualStok(products) {
    if (products) {
      return (products || []).reduce((s, p) => s + ((p.stock || 0) * (p.hargaJual || 0)), 0);
    }
    if (typeof Etalase === 'undefined') return 0;
    return Etalase.totalNilaiJualStok();
  },

  // pairKey/bracketRange/linkedSiblings — delegasi PERSIS ke Etalase (size
  // pairing kw206 & manual merge kw209), supaya InventoryEngine bisa jadi
  // satu pintu baca "kelompok harga" produk tanpa duplikat regex/logic
  // parsing nama produk.
  pairKey(product) {
    if (typeof Etalase === 'undefined') return null;
    return Etalase.pairKey(product);
  },

  bracketRange(product) {
    if (typeof Etalase === 'undefined') return null;
    return Etalase.bracketRange(product);
  },

  linkedSiblings(product) {
    if (typeof Etalase === 'undefined') return [];
    return Etalase.linkedSiblings(product);
  },

  // restockScan() — delegasi PERSIS ke StockRekoWidget.scan() (cobek-pricing.js):
  // daftar produk/grup ukuran yang direkomendasikan direstock, berikut
  // status ada/tidaknya histori penjualan & estimasi hari stok tersisa.
  restockScan() {
    if (typeof StockRekoWidget === 'undefined') {
      return { ok: false, reason: 'StockRekoWidget belum dimuat', items: [] };
    }
    return { ok: true, items: StockRekoWidget.scan() };
  },
};
