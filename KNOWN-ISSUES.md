# KNOWN-ISSUES.md — Keluarga W (Final Release Candidate)

Daftar seluruh isu yang **sengaja belum diperbaiki** di Release
Candidate ini, terkumpul dari audit Tahap 1–8 (terutama `FINAL-QA.md`
Tahap 8). Dokumen ini murni **dokumentasi** — tidak ada perbaikan
dilakukan di sini. Untuk rencana perbaikan, lihat `ROADMAP-v1.1.md`.

Setiap isu ditandai kategori risiko perbaikannya:
- 🟢 **CSS-only, risiko rendah** — value-preserving, aman dikerjakan kapan saja.
- 🟡 **CSS/token warna, risiko sedang** — perlu review visual lintas tema sebelum dieksekusi.
- 🔴 **Butuh perubahan JavaScript** — di luar batas seluruh program modernisasi UI Tahap 1–8 (yang eksplisit "tanpa mengubah JS").

---

## 1. Accessibility

### 1.1 Kontras warna `--text3` di bawah standar WCAG AA 🟡
Diukur pada 4 tema sampel (dark, light, ocean, mono) memakai formula
relative luminance resmi WCAG: rasio kontras `--text3` terhadap
`--bg`/`--surface2` berkisar **2.45–3.8:1**, di bawah ambang AA untuk
teks normal (4.5:1). Masih di atas 3:1 (ambang teks besar) di sebagian
tema, tapi `--text3` sering dipakai untuk teks kecil (caption, label
sekunder pada `.nav-item`, dll.), sehingga berisiko sulit dibaca bagi
pengguna low-vision.

**Kenapa belum diperbaiki**: menaikkan luminance `--text3` berarti
mengubah nilai warna di 10 blok tema sekaligus — butuh review visual
per tema untuk memastikan tetap harmonis dengan palet masing-masing,
di luar scope "tanpa redesign" Tahap 8.

### 1.2 Touch target sekunder di bawah rekomendasi 44×44px 🟢
`.chip-btn` (≈24–26px tinggi efektif) dan `.qs-btn` (≈28–30px) masih
lulus batas minimum WCAG 2.2 AA (24×24px, kriteria 2.5.8) tapi di
bawah rekomendasi best-practice 44×44px untuk kenyamanan sentuh.

**Kenapa belum diperbaiki**: perlu penambahan padding vertikal yang
value-preserving terhadap ukuran font/ikon di dalamnya — dicatat
sebagai rekomendasi Tahap 9, tidak dieksekusi Tahap 8 demi menjaga
Release Candidate tetap stabil tanpa perubahan CSS tambahan.

---

## 2. Consistency (CSS)

### 2.1 Literal `border-radius` yang tumpang tindih dengan token 🟢
Ditemukan literal `border-radius: 16px` (5×), `10px` (20×), `20px`
(8×), `12px` (7×) yang nilainya identik dengan token yang sudah ada
(`--r-2xl`, `--r-md`, `--r-pill`, `--r-lg`) tapi belum direferensikan
lewat `var(--token)`.

### 2.2 `box-shadow` tidak memakai token 🟢
17 nilai `box-shadow` berbeda, semua literal `rgba(0,0,0,...)`. Skala
token `--shadow-xs…xl` sempat disiapkan sebagai referensi sejak
Tahap 1 tapi belum pernah diaplikasikan ke komponen manapun.

### 2.3 Durasi `transition` tidak konsisten 🟢
≥15 variasi durasi/easing transition (`all 0.2s`, `.2s`, `transform
.2s ease`, `width .4s/.5s/.6s`, dll.) yang tidak memakai token motion
Tahap 7 (`--dur-*`/`--ease-*`).

### 2.4 Literal `font-size` kecil belum ditoken-kan 🟢
Beberapa ukuran font kecil (11px, 12px, 13px, 8.5px pada `.nav-item`)
ditulis literal, meski nilainya konsisten dengan skala `--fs-*` yang
sudah ada.

**Kenapa 2.1–2.4 belum diperbaiki**: seluruhnya *value-preserving*
(migrasi literal→token tanpa mengubah tampilan) sehingga secara
teknis rendah risiko, tapi Tahap 8 secara eksplisit membatasi diri
hanya pada audit + dokumentasi ("jangan mengubah jika berisiko" —
818 baris CSS lintas 10 tema tanpa alat rendering visual di sandbox
audit berisiko menimbulkan regresi visual yang tidak terverifikasi).

---

## 3. Responsive / Layout

### 3.1 Container `max-width` belum konsisten di layar besar 🟢
Hanya `#page-dashboard-hub` yang dibatasi `max-width:1080px` di layar
≥1024px. Halaman lain (Transaksi, Laporan, dll.) tidak punya container
max-width, sehingga kartu/list bisa melebar penuh di layar desktop
lebar. Ini **bukan bug baru** — sudah tercatat di komentar kode sejak
Tahap 5 ("belum pernah ada container/max-width di project ini sama
sekali").

**Kenapa belum diperbaiki**: perbaikan lintas-semua-halaman berpotensi
menyentuh banyak selector sekaligus — di luar prinsip "perubahan
minimal per tahap" yang dipegang sepanjang program ini.

---

## 4. Icon

### 4.1 Emoji sebagai data `icon:` di JavaScript 🔴
`dashboard-hub-registry.js` (FEATURE_REGISTRY) dan beberapa file lain
menyimpan ikon fitur sebagai emoji literal di field data `icon:`,
bukan SVG konsisten seperti ikon lain di aplikasi.

**Kenapa belum diperbaiki**: field ini ada di JavaScript (data), dan
mengubahnya berarti mengubah JavaScript — dilarang eksplisit sejak
Tahap 6.

---

## 5. Motion

### 5.1 ✅ SELESAI (Tahap 10) — Exit/closing animation untuk overlay & bottom sheet
`.overlay` sebelumnya disembunyikan lewat `display:none` instan
setelah class `.open` dilepas — animasi keluar sekarang ada, lewat
class `.closing` (`styles.css`: `overlayOut`/`slideDown`) yang
ditambah `closeModal()` di `modal-navigasi.js` sebelum melepas `.open`,
ditunda pakai `animationend`+fallback `setTimeout`. Lihat
`MODAL-EXIT-ANIMATION.md`.

### 5.2 ✅ SELESAI — Ripple berbasis koordinat sentuh asli
Sebelumnya ripple Tahap 7 selalu berupa pulsa dari tengah elemen
(CSS-only). Sekarang posisi ripple mengikuti titik sentuh/klik asli
lewat `modules/shared/ripple-position.js` yang men-set custom property
`--ripple-x`/`--ripple-y` sebelum `:active` menyalakan animasi. Lihat
`ROADMAP-v1.1.md` item #8.

### 5.3 Hover/elevation belum menyentuh tap-target sekunder lain 🟢
`.stat-box.clickable`, `.budget-item.clickable`, dan sejenisnya belum
mendapat hover elevation seperti komponen utama di Tahap 7.

**Kenapa belum diperbaiki**: komponen-komponen ini sudah punya
feedback `:active` yang memadai; ditahan supaya perubahan Tahap 7
tetap minimal.

---

## Ringkasan Jumlah Isu

| Kategori risiko | Jumlah | Selesai |
|---|---|---|
| 🟢 CSS-only, risiko rendah | 6 | 4 (1.2, 2.1, 2.2, 3.1) |
| 🟡 Token warna, risiko sedang | 1 | 0 |
| 🔴 Butuh JavaScript | 3 | 2 (4.1, 5.2) |

Status terkini & rencana sisa item: lihat `ROADMAP-v1.1.md`.

Semua item di atas dipetakan ke prioritas backlog di `ROADMAP-v1.1.md`.
