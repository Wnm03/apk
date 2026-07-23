// ui/areas.js — render-only lewat areaAdapterList(D). Ringkasan jumlah
// item per AREA (lihat adapters/area-adapter.js — LIFEOS_AREAS,
// lifeos-registry.js). Sebelum Sesi 39, area-adapter.js sudah ADA & sudah
// dites (Sesi 24) tapi TIDAK PERNAH dikonsumsi UI manapun — bagian dari
// "Executive Dashboard Integration" (target eksplisit user Sesi 39) yang
// melengkapi LifeOSHome supaya SEMUA 6 adapter (area/today/goal/project/
// review/knowledge) benar-benar terpakai sebagai satu pintu masuk.
//
// Beda dari Today/Goals/Projects: 1 Area = gabungan BANYAK dSources
// sekaligus (bukan 1 item -> 1 sumber tunggal), jadi tidak ada
// sourceKind/sourceId per-entri utk lifeOSNavigateToSource() — murni
// ringkasan angka, tanpa aksi/navigasi apa pun (read-only agregat).

const LifeOSAreas = {
  render() {
    const el = document.getElementById('lifeOSAreasGrid');
    if (!el) return;
    const areas = areaAdapterList(D);
    el.innerHTML = areas.length
      ? areas.map((a) => `
        <div class="lifeos-area-card">
          <div class="lifeos-area-icon">${escapeHtml(a.icon || '🗂️')}</div>
          <div class="lifeos-area-name">${escapeHtml(a.label || '')}</div>
          <div class="lifeos-area-count">${a.itemCount} item</div>
        </div>
      `).join('')
      : '<div class="empty"><div class="empty-text">Belum ada data area</div></div>';
  },
};
