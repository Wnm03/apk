# FONT-SIZE TOKEN MIGRATION

**Sprint 2 Tahap 14 — `ROADMAP-v1.1.md` Item 9 (Low Priority, 🟢
CSS-only)**

Baseline: Tahap 13 selesai, `node --test` 1379/1379 PASS.

## Audit

Medium Priority tersisa (#5 shadow token, #8 ripple 🔴 butuh JS) sudah
dinilai tidak valid dieksekusi berisiko-rendah di tahap sebelumnya.
Low Priority #9 (font-size literal → token) siap: token `--fs-caption:
11px`, `--fs-label:12px`, `--fs-body:13px` sudah ada di `:root`.

| Literal | Token | Jumlah |
|---|---|---|
| `11px` | `var(--fs-caption)` | 10 |
| `12px` | `var(--fs-label)` | 22 |
| `13px` | `var(--fs-body)` | 19 |
| **Total** | | **51** |

`8.5px` (`.nav-item`) tidak dimigrasi — tidak ada token yang match
persis nilainya.

## Perubahan

`styles.css`: 51 deklarasi `font-size` literal diganti `var(--fs-*)`,
value-preserving, regex hanya menyasar properti `font-size` (tidak
menyentuh `--fs-*` di `:root` sendiri, `line-height`, atau properti
lain).

## File berubah

| File | Perubahan |
|---|---|
| `styles.css` | 51 literal `font-size` → `var(--fs-*)` |
| `tests/touch-target-padding.test.js` | 1 guard diupdate (nilai `.chip-btn` font-size tetap 12px, representasi mengikuti token) |
| `CHANGELOG.md` | +section Tahap 14 |
| `FONT-SIZE-TOKEN-MIGRATION.md` | Dokumen ini |

## Tidak diubah

FEATURE_REGISTRY, Dashboard V2, Hero Dashboard, business logic, build
system, package.json, service worker, `index.html`/`app_production.html`.

## Hasil test

```
node --test
# tests 1379
# pass 1379
# fail 0
```

## Status

Item #9 selesai. Sisa: #5 (shadow, ditahan), #8 (🔴 JS), #10 (max-width
container), #11 (hover elevation tap-target sekunder).
