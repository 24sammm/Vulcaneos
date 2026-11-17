/* =========================================================
   simulasi.js · Model ilustratif erupsi Anak Krakatau
   ---------------------------------------------------------
   Model ini menyederhanakan hubungan antara skala letusan,
   tinggi kolom, durasi, angin, dan kedalaman perairan menjadi
   estimasi sebaran abu serta dampak lingkungan/perairan.
   Hasil bersifat edukatif, bukan prakiraan operasional.
   ========================================================= */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const el = {
    form: $('simForm'),
    vei: $('vei'),
    column: $('column'),
    duration: $('duration'),
    wind: $('wind'),
    windDir: $('windDir'),
    depth: $('depth'),
    sst: $('sst'),
    collapse: $('collapse'),
    veiValue: $('veiValue'),
    columnValue: $('columnValue'),
    durationValue: $('durationValue'),
    windValue: $('windValue'),
    windDirValue: $('windDirValue'),
    dirArrow: $('dirArrow'),
    dirButtons: Array.from(document.querySelectorAll('.sim-dir')),
    depthValue: $('depthValue'),
    sstValue: $('sstValue'),
    statusBadge: $('statusBadge'),
    statusLabel: $('statusLabel'),
    statusNote: $('statusNote'),
    windFoot: $('windFoot'),
    depthFoot: $('depthFoot'),
    metricColumn: $('metricColumn'),
    metricColumnNote: $('metricColumnNote'),
    metricAsh: $('metricAsh'),
    metricAshNote: $('metricAshNote'),
    metricHazard: $('metricHazard'),
    metricHazardNote: $('metricHazardNote'),
    metricPyro: $('metricPyro'),
    metricPyroNote: $('metricPyroNote'),
    metricTsunami: $('metricTsunami'),
    metricTsunamiNote: $('metricTsunamiNote'),
    metricEjecta: $('metricEjecta'),
    metricEjectaNote: $('metricEjectaNote'),
    map: $('impactMap'),
    mapGrid: $('mapGrid'),
    mapTurbidity: $('mapTurbidity'),
    mapAsh: $('mapAsh'),
    mapRings: $('mapRings'),
    mapIslands: $('mapIslands'),
    mapWind: $('mapWind'),
    mapLabels: $('mapLabels'),
    mapDirection: $('mapDirection'),
    mapScaleBadge: $('mapScaleBadge'),
    marineBadge: $('marineBadge'),
    barSst: $('barSst'),
    barTss: $('barTss'),
    barChl: $('barChl'),
    barTurb: $('barTurb'),
    valSst: $('valSst'),
    valTss: $('valTss'),
    valChl: $('valChl'),
    valTurb: $('valTurb'),
    marineNote: $('marineNote').querySelector('p'),
    envVeg: $('envVeg'),
    envWater: $('envWater'),
    envCoast: $('envCoast'),
    envReef: $('envReef'),
    randomButton: $('randomButton'),
    resetButton: $('resetButton'),
    replayButton: $('replayButton'),
  };

  const DEFAULTS = {
    vei: 4, column: 12, duration: 6, wind: 20,
    windDir: 135, depth: 50, sst: 29, collapse: true,
  };

  const DIRS = ['Utara', 'Timur laut', 'Timur', 'Tenggara', 'Selatan', 'Barat daya', 'Barat', 'Barat laut'];
  const compass = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  const fmt = (value, digits = 1) =>
    Number(value).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /* ── 1. MODEL ─────────────────────────────────────────── */

  function simulate(p) {
    const vei = p.vei;
    const column = p.column;
    const duration = p.duration;
    const wind = p.wind;
    const collapse = p.collapse;

    // Sebaran abu: kolom menentukan lebar, angin × durasi menentukan jangkauan.
    const plumeRadius = 2 + column * 0.7 + vei * 1.1;
    const drift = wind * duration * 0.3;
    const ashLength = plumeRadius + drift;
    const ashArea = Math.PI * ashLength * plumeRadius * 0.85;

    // Zonasi bahaya mengikuti kelas 0–8 km pada WebGIS.
    const hazardRadius = 1.5 + vei * 0.85 + column * 0.1;
    const pyroclastic = 0.8 + vei * 0.7 + duration * 0.1;
    const ejecta = Math.pow(vei, 2.4) * duration * 0.55;

    // Tsunami: hanya aktif bila longsoran tubuh gunung diaktifkan.
    const tsunamiHeight = collapse ? 0.35 + vei * 0.3 + p.depth / 220 : 0;
    const waveSpeed = Math.sqrt(9.81 * p.depth) * 3.6;
    const arrivalMinutes = collapse ? (15 / waveSpeed) * 60 : 0;

    // Dampak perairan relatif terhadap kondisi pra-erupsi.
    const cooling = Math.min(1.6, 0.12 * vei + 0.03 * column + (collapse ? 0.15 : 0));
    const dTss = Math.min(0.95, 0.07 * vei * Math.pow(duration, 0.55) + (collapse ? 0.18 : 0));
    const dChl = Math.min(0.9, 0.05 * vei * Math.pow(duration, 0.4) + (collapse ? 0.1 : 0));
    const turbidity = dTss * 145;
    const waterImpactArea = ashArea * 0.45 + pyroclastic * 12 + (collapse ? 60 : 0);

    const vegArea = Math.PI * pyroclastic * pyroclastic * 0.4;
    const coastChange = pyroclastic * 0.6 + (collapse ? 3 : 0);

    let level = 'normal';
    let status = 'Normal';
    if (hazardRadius >= 8) { level = 'ekstrem'; status = 'Awas ekstrem'; }
    else if (hazardRadius >= 5) { level = 'awas'; status = 'Awas'; }
    else if (hazardRadius >= 3) { level = 'siaga'; status = 'Siaga'; }

    const reef =
      dTss > 0.6 || p.sst >= 30.5 ? 'Tinggi'
        : dTss > 0.3 ? 'Sedang'
          : 'Rendah';

    return {
      ...p, plumeRadius, drift, ashLength, ashArea, hazardRadius,
      pyroclastic, ejecta, tsunamiHeight, arrivalMinutes,
      cooling, dTss, dChl, turbidity, waterImpactArea,
      vegArea, coastChange, level, status, reef,
    };
  }

  /* ── 2. PANEL NILAI ───────────────────────────────────── */

  function renderControls(r) {
    el.veiValue.textContent = r.vei;
    el.columnValue.textContent = `${fmt(r.column, r.column % 1 ? 1 : 0)} km`;
    el.durationValue.textContent = `${fmt(r.duration, 0)} jam`;
    el.windValue.textContent = `${fmt(r.wind, 0)} km/jam`;
    const dir = (((Math.round(r.windDir / 45) * 45) % 360) + 360) % 360;
    el.windDirValue.textContent = compass(dir);
    if (el.dirArrow) el.dirArrow.style.transform = `rotate(${dir}deg)`;
    el.dirButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.dir) === dir));
    });
    el.depthValue.textContent = `${fmt(r.depth, 0)} m`;
    el.sstValue.textContent = `${fmt(r.sst, 1)} °C`;
  }

  /* ── 3. PANGGUNG ANIMASI ─────────────────────────────── */

  // Panggung digambar oleh simulasi-scene.js (Canvas 2D).
  // Setiap perubahan parameter memicu pemutaran ulang urutan letusan
  // setelah jeda singkat agar tidak berkedip saat slider digeser.
  let sceneTimer = 0;

  function renderScene(r) {
    if (!window.SimScene) return;
    window.SimScene.setParams(r);
    window.clearTimeout(sceneTimer);
    sceneTimer = window.setTimeout(() => window.SimScene.restart(), 260);
  }

  /* ── 4. KARTU HASIL ───────────────────────────────────── */

  function renderReadout(r) {
    el.metricColumn.innerHTML = `${fmt(r.column, 1)} <small>km</small>`;
    el.metricColumnNote.textContent = `VEI ${r.vei} · durasi ${fmt(r.duration, 0)} jam`;

    el.metricAsh.innerHTML = `${fmt(r.ashArea, 0)} <small>km²</small>`;
    el.metricAshNote.textContent = `Memanjang ${fmt(r.ashLength, 0)} km ke arah ${compass(r.windDir)}`;

    el.metricHazard.innerHTML = `${fmt(r.hazardRadius, 1)} <small>km</small>`;
    el.metricHazardNote.textContent = `${r.status} · kelas ${r.hazardRadius < 3 ? '0–3' : r.hazardRadius < 5 ? '3–5' : r.hazardRadius < 8 ? '5–8' : '> 8'} km`;

    el.metricPyro.innerHTML = `${fmt(r.pyroclastic, 1)} <small>km</small>`;
    el.metricPyroNote.textContent = r.pyroclastic >= 3
      ? 'Aliran mencapai garis pantai'
      : 'Terbatas di tubuh gunung';

    if (r.collapse) {
      el.metricTsunami.innerHTML = `${fmt(r.tsunamiHeight, 1)} <small>m</small>`;
      el.metricTsunamiNote.textContent = `Tiba ± ${fmt(r.arrivalMinutes, 0)} menit di pantai 15 km`;
    } else {
      el.metricTsunami.innerHTML = 'Tidak aktif';
      el.metricTsunamiNote.textContent = 'Longsoran tubuh gunung tidak diaktifkan';
    }

    el.metricEjecta.innerHTML = `${fmt(r.ejecta, 0)} <small>juta m³</small>`;
    el.metricEjectaNote.textContent = `Intensitas VEI ${r.vei} selama ${fmt(r.duration, 0)} jam`;

    el.statusBadge.dataset.level = r.level;
    el.statusLabel.textContent = r.status;
    el.statusNote.textContent = `Radius bahaya ${fmt(r.hazardRadius, 1)} km`;

    el.windFoot.textContent = `${fmt(r.wind, 0)} km/jam · ${compass(r.windDir)}`;
    el.depthFoot.textContent = `${fmt(r.depth, 0)} m`;
  }

  /* ── 5. PETA DAMPAK ───────────────────────────────────── */

  function renderMap(r) {
    const center = 240;
    const edge = 194;
    const maxExtent = Math.max(r.ashLength + r.plumeRadius, r.hazardRadius, r.pyroclastic, 30);
    const scale = edge / maxExtent;
    const angle = r.windDir - 90;
    const rad = (r.windDir * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);

    // Grid latar
    let grid = '';
    for (let i = 1; i < 6; i += 1) {
      const pos = (480 / 6) * i;
      grid += `<line x1="${pos}" y1="0" x2="${pos}" y2="480"></line>`;
      grid += `<line x1="0" y1="${pos}" x2="480" y2="${pos}"></line>`;
    }
    el.mapGrid.innerHTML = grid;

    // Perairan keruh di sekitar pulau
    const turbidR = clamp((r.pyroclastic * 2.4 + r.plumeRadius * 0.6) * scale, 14, edge);
    el.mapTurbidity.innerHTML = `
      <circle cx="${center}" cy="${center}" r="${turbidR.toFixed(1)}" fill="#7f9d92" opacity="${clamp(0.12 + r.dTss * 0.4, 0.1, 0.5).toFixed(2)}"></circle>`;

    // Sebaran abu: elips memanjang searah angin
    const ashCx = center + dx * (r.drift / 2) * scale;
    const ashCy = center + dy * (r.drift / 2) * scale;
    const ashRx = (r.drift / 2 + r.plumeRadius) * scale;
    const ashRy = r.plumeRadius * scale;
    el.mapAsh.innerHTML = `
      <ellipse cx="${ashCx.toFixed(1)}" cy="${ashCy.toFixed(1)}" rx="${ashRx.toFixed(1)}" ry="${ashRy.toFixed(1)}"
        transform="rotate(${angle.toFixed(1)} ${ashCx.toFixed(1)} ${ashCy.toFixed(1)})"
        fill="#8f8b82" fill-opacity="${clamp(0.16 + r.vei * 0.05, 0.16, 0.5).toFixed(2)}"
        stroke="#6d6a63" stroke-opacity="0.35" stroke-dasharray="4 4" stroke-width="1"></ellipse>
      <ellipse cx="${ashCx.toFixed(1)}" cy="${ashCy.toFixed(1)}" rx="${(ashRx * 0.55).toFixed(1)}" ry="${(ashRy * 0.55).toFixed(1)}"
        transform="rotate(${angle.toFixed(1)} ${ashCx.toFixed(1)} ${ashCy.toFixed(1)})"
        fill="#6f6b64" fill-opacity="${clamp(0.1 + r.vei * 0.04, 0.1, 0.4).toFixed(2)}"></ellipse>`;

    // Zonasi bahaya
    const zones = [
      { km: 3, color: '#5aa287', label: 'Normal' },
      { km: 5, color: '#d3a23f', label: 'Siaga' },
      { km: 8, color: '#cc6a45', label: 'Awas' },
    ];
    let rings = '';
    zones.forEach((zone) => {
      const radius = zone.km * scale;
      if (radius < 4) return;
      rings += `<circle cx="${center}" cy="${center}" r="${radius.toFixed(1)}" stroke="${zone.color}" stroke-width="1.1" stroke-opacity="0.85" stroke-dasharray="5 4" fill="none"></circle>`;
      if (radius > 26) {
        rings += `<text x="${center + radius * 0.72}" y="${center - radius * 0.72}" fill="${zone.color}" font-size="7.5" font-weight="700">${zone.km} km</text>`;
      }
    });
    rings += `<circle cx="${center}" cy="${center}" r="${(r.hazardRadius * scale).toFixed(1)}" fill="#c0563c" fill-opacity="0.07" stroke="#b4553e" stroke-width="1.4"></circle>`;
    el.mapRings.innerHTML = rings;

    // Kepulauan (skematik)
    const islandScale = clamp(7 + r.pyroclastic * 0.9, 8, 20);
    el.mapIslands.innerHTML = `
      <circle class="map-island-shadow" cx="${center}" cy="${center}" r="${(islandScale * 1.7).toFixed(1)}"></circle>
      <circle class="map-island" cx="${center - 30}" cy="${center + 44}" r="${(islandScale * 0.62).toFixed(1)}"></circle>
      <circle class="map-island" cx="${center + 42}" cy="${center + 50}" r="${(islandScale * 0.5).toFixed(1)}"></circle>
      <circle class="map-island" cx="${center - 52}" cy="${center - 26}" r="${(islandScale * 0.7).toFixed(1)}"></circle>
      <path class="map-island-core" d="M${center} ${center - islandScale} L${center + islandScale * 0.86} ${center + islandScale * 0.72} L${center - islandScale * 0.86} ${center + islandScale * 0.72} Z"></path>
      <circle cx="${center}" cy="${center - islandScale * 0.34}" r="${(islandScale * 0.18).toFixed(1)}" fill="#c96b3f"></circle>`;

    // Arah angin
    const arrowLen = 54 + (r.wind / 80) * 56;
    const startX = center + dx * (islandScale + 16);
    const startY = center + dy * (islandScale + 16);
    const endX = startX + dx * arrowLen;
    const endY = startY + dy * arrowLen;
    const perpX = -dy;
    const perpY = dx;
    const head = 7;
    el.mapWind.innerHTML = `
      <line x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}"
        stroke="#34505c" stroke-width="1.6" stroke-linecap="round" opacity="0.8"></line>
      <path d="M${endX.toFixed(1)} ${endY.toFixed(1)}
        L${(endX - dx * head + perpX * head * 0.6).toFixed(1)} ${(endY - dy * head + perpY * head * 0.6).toFixed(1)}
        L${(endX - dx * head - perpX * head * 0.6).toFixed(1)} ${(endY - dy * head - perpY * head * 0.6).toFixed(1)} Z"
        fill="#34505c" opacity="0.85"></path>
      <text x="${(endX + dx * 8).toFixed(1)}" y="${(endY + dy * 8 + 3).toFixed(1)}" text-anchor="middle">${fmt(r.wind, 0)} km/jam</text>`;

    // Label, skala, kompas
    const steps = [2, 5, 10, 20, 50, 100, 200];
    const barKm = steps.find((step) => step * scale >= 46 && step * scale <= 150) || 100;
    const barPx = barKm * scale;
    const barX = 26;
    const barY = 452;
    el.mapLabels.innerHTML = `
      <text class="map-label" x="${center}" y="${center - islandScale - 12}" text-anchor="middle">Anak Krakatau</text>
      <text class="map-label" x="${center + 10}" y="${center + 78}" text-anchor="middle" opacity="0.75">Selat Sunda</text>
      <text class="map-compass" x="456" y="34" text-anchor="middle">N</text>
      <path d="M456 40 L451 56 L456 52 L461 56 Z" fill="#37545f" opacity="0.8"></path>
      <line class="map-scale-bar" x1="${barX}" y1="${barY}" x2="${barX + barPx}" y2="${barY}"></line>
      <line class="map-scale-bar" x1="${barX}" y1="${barY - 4}" x2="${barX}" y2="${barY + 4}"></line>
      <line class="map-scale-bar" x1="${barX + barPx}" y1="${barY - 4}" x2="${barX + barPx}" y2="${barY + 4}"></line>
      <text x="${barX}" y="${barY - 9}" fill="#3e5a64" font-size="7.5" font-weight="600">${barKm} km</text>`;

    el.mapDirection.textContent = `Angin ke ${compass(r.windDir)} · abu terbawa ke arah tersebut`;
    el.mapScaleBadge.textContent = `Cakupan ± ${fmt(maxExtent, 0)} km`;
    el.map.setAttribute(
      'aria-label',
      `Peta skematik: zona bahaya radius ${fmt(r.hazardRadius, 1)} kilometer, sebaran abu ${fmt(r.ashArea, 0)} kilometer persegi ke arah ${compass(r.windDir)}.`,
    );
  }

  /* ── 6. DAMPAK PERAIRAN & LINGKUNGAN ──────────────────── */

  function renderMarine(r) {
    el.barSst.style.width = `${clamp((r.cooling / 1.6) * 100, 4, 100).toFixed(0)}%`;
    el.barTss.style.width = `${clamp((r.dTss / 0.95) * 100, 4, 100).toFixed(0)}%`;
    el.barChl.style.width = `${clamp((r.dChl / 0.9) * 100, 4, 100).toFixed(0)}%`;
    el.barTurb.style.width = `${clamp((r.turbidity / 140) * 100, 4, 100).toFixed(0)}%`;

    el.valSst.textContent = `−${fmt(r.cooling, 2)} °C`;
    el.valSst.className = 'down';
    el.valTss.textContent = `+${fmt(r.dTss, 2)} mg/L`;
    el.valTss.className = 'up';
    el.valChl.textContent = `+${fmt(r.dChl, 2)} mg/m³`;
    el.valChl.className = 'up';
    el.valTurb.textContent = `${fmt(r.turbidity, 0)} NTU`;
    el.valTurb.className = 'up';

    el.marineBadge.textContent = r.dTss > 0.6 ? 'Tekanan tinggi' : r.dTss > 0.3 ? 'Tekanan sedang' : 'Tekanan rendah';
    el.marineNote.textContent =
      `Estimasi relatif terhadap kondisi pra-erupsi: SST awal ${fmt(r.sst, 1)} °C, perairan keruh meluas ± ${fmt(r.waterImpactArea, 0)} km². Nilai bersifat ilustratif, bukan hasil pengukuran lapangan.`;
  }

  function renderEnv(r) {
    el.envVeg.textContent = `${fmt(r.vegArea, 0)} km²`;
    el.envWater.textContent = `${fmt(r.waterImpactArea, 0)} km²`;
    el.envCoast.textContent = `${r.collapse ? '−' : '+'}${fmt(r.coastChange, 1)} m`;
    el.envReef.textContent = r.reef;
  }

  /* ── 7. SIKLUS UPDATE ─────────────────────────────────── */

  function readInputs() {
    return {
      vei: Number(el.vei.value),
      column: Number(el.column.value),
      duration: Number(el.duration.value),
      wind: Number(el.wind.value),
      windDir: Number(el.windDir.value),
      depth: Number(el.depth.value),
      sst: Number(el.sst.value),
      collapse: el.collapse.checked,
    };
  }

  let frame = 0;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const result = simulate(readInputs());
      renderControls(result);
      renderScene(result);
      renderReadout(result);
      renderMap(result);
      renderMarine(result);
      renderEnv(result);
    });
  }

  function applyValues(values) {
    Object.entries(values).forEach(([key, value]) => {
      const input = el[key];
      if (!input) return;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value;
    });
    update();
  }

  el.form.addEventListener('input', update);

  el.dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.windDir.value = btn.dataset.dir;
      update();
    });
  });

  el.resetButton.addEventListener('click', () => applyValues(DEFAULTS));

  el.randomButton.addEventListener('click', () => {
    applyValues({
      vei: 1 + Math.round(Math.random() * 5),
      column: Number((4 + Math.random() * 16).toFixed(1)),
      duration: 1 + Math.round(Math.random() * 23),
      wind: Math.round(Math.random() * 80),
      windDir: Math.round(Math.random() * 7) * 45,
      depth: 10 + Math.round(Math.random() * 18) * 5,
      sst: Number((26 + Math.random() * 6).toFixed(1)),
      collapse: Math.random() > 0.35,
    });
  });

  el.replayButton.addEventListener('click', () => {
    window.clearTimeout(sceneTimer);
    if (window.SimScene) window.SimScene.restart();
  });

  if (window.SimScene && window.SimScene.init()) window.SimScene.start();

  applyValues(DEFAULTS);
})();
