(() => {
  if (!window.Cesium || !document.getElementById('publicMapCanvas')) return;

  const center = [105.423, -6.102];
  const params = {
    sst: {
      label: 'SST', unit: '°C',
      files: { 2017: 'SST17.json', 2019: 'SST19.json', 2023: 'SST23.json', 2025: 'SST25.json' },
      colors: ['#2563eb', '#22d3ee', '#fde047', '#f97316', '#ef4444'],
      ranges: {
        2017: [[15.285, 23.422], [23.423, 26.893], [26.894, 29.172], [29.173, 31.667], [31.668, 42.95]],
        2019: [[28.441, 29.475], [29.476, 30.571], [30.572, 33.98], [33.981, 38.91], [38.911, 43.962]],
        2023: [[20.111, 28.245], [28.246, 29.505], [29.506, 33.63], [33.631, 41.191], [41.192, 49.325]],
        2025: [[24.131, 28.915], [28.916, 30.965], [30.966, 35.635], [35.636, 43.495], [43.496, 53.177]],
      },
    },
    chlorophyll: {
      label: 'Klorofil-a', unit: 'mg/m³',
      files: { 2017: 'CHL17.json', 2019: 'CHL19.json', 2023: 'CHL23.json', 2025: 'CHL25.json' },
      colors: ['#edf4d8', '#c5df9b', '#87bd79', '#4e9674', '#26716a'],
      ranges: {
        2017: [[.068, .157], [.158, .222], [.223, .3], [.301, 1.166], [1.167, 3.365]],
        2019: [[1.785, 1.839], [1.84, 2.005], [2.006, 2.67], [2.671, 5.05], [5.051, 8.841]],
        2023: [[1.748, 1.917], [1.918, 2.087], [2.088, 2.573], [2.574, 4.371], [4.372, 7.942]],
        2025: [[.224, .245], [.246, .313], [.314, .567], [.568, 1.263], [1.264, 2.13]],
      },
    },
    tss: {
      label: 'TSS', unit: 'mg/L',
      files: { 2017: 'TSS17.json', 2019: 'TSS19.json', 2023: 'TSS23.json', 2025: 'TSS25.json' },
      colors: ['#e6f2ee', '#a9d6c5', '#6eb4a6', '#cb8850', '#944d3c'],
      ranges: {
        2017: [[.935, .954], [.955, .959], [.96, .962], [.963, .965], [.966, .975]],
        2019: [[.718, .844], [.845, .945], [.946, .956], [.957, .962], [.963, .968]],
        2023: [[.063, .858], [.859, 1.033], [1.034, 1.118], [1.119, 1.171], [1.172, 1.27]],
        2025: [[.851, .996], [.997, 1.103], [1.104, 1.136], [1.137, 1.145], [1.146, 1.156]],
      },
    },
  };
  const selectedYears = { sst: 2017, chlorophyll: 2017, tss: 2017 };
  const dataSources = new Map();
  const loadingLayers = new Map();
  let activeLegend = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const loading = $('#publicMapLoading');
  const viewer = new Cesium.Viewer('publicMapCanvas', {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    shouldAnimate: true, scene3DOnly: true, requestRenderMode: false,
  });
  window.vulcaneosPublicMap = viewer;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
  viewer.scene.shadowMap.enabled = true;
  viewer.scene.globe.terrainExaggeration = 1.65;
  viewer.scene.globe.maximumScreenSpaceError = 1.6;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#12303b');
  viewer.scene.fog.enabled = true;
  viewer.clock.shouldAnimate = true;
  viewer.scene.screenSpaceCameraController.enableZoom = true;
  viewer.scene.screenSpaceCameraController.enableLook = true;
  viewer.scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.PINCH];
  viewer.scene.canvas.style.touchAction = 'none';

  let reliefView = true;
  let worldTerrainProvider = null;
  let terrainAvailable = false;
  let selectedRiskZone = null;
  const flyToArea = (duration = 1.1) => viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(center[0], center[1], 240), 1000),
    { duration, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-18), Cesium.Math.toRadians(reliefView ? -38 : -85), 13500) },
  );
  // Some touchpads emit very small, high-frequency wheel deltas that Cesium's default
  // zoom handler can effectively swallow. Normalize them and zoom from the canvas.
  viewer.scene.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewer.scene.canvas.clientHeight : 1;
    const delta = (event.deltaY || event.deltaX) * unit;
    if (!delta) return;
    const height = viewer.camera.positionCartographic.height;
    const amount = Math.max(10, Math.min(height * .22, height * Math.min(Math.abs(delta), 120) / 560));
    if (delta > 0) viewer.camera.zoomOut(amount);
    else viewer.camera.zoomIn(amount);
  }, { passive: false });
  Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')
    .then((provider) => viewer.imageryLayers.addImageryProvider(provider))
    .catch((error) => console.warn('Imagery peta publik gagal dimuat', error));
  flyToArea(0);

  fetch('/api/cesium-config').then((response) => response.ok ? response.json() : {}).then(async ({ ionToken }) => {
    if (!ionToken) return;
    Cesium.Ion.defaultAccessToken = ionToken;
    worldTerrainProvider = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true });
    terrainAvailable = true;
    if (reliefView) viewer.terrainProvider = worldTerrainProvider;
    viewer.scene.globe.terrainExaggeration = reliefView ? 1.65 : 1;
    flyToArea(0.8);
  }).catch((error) => console.info('Terrain 3D menggunakan elevasi bawaan:', error));

  function valueOf(properties, key) {
    const property = properties?.[key];
    return property?.getValue ? property.getValue(Cesium.JulianDate.now()) : property;
  }

  async function loadGeoJson(id, filename, styleFeature, visible = true) {
    if (dataSources.has(id)) {
      const entry = dataSources.get(id);
      entry.source.show = visible;
      return entry.source;
    }
    if (loadingLayers.has(id)) return loadingLayers.get(id);
    const task = (async () => {
      const response = await fetch(`./JSON/${filename}`);
      if (!response.ok) throw new Error(`Gagal memuat ${filename}`);
      const data = await response.json();
      const source = await Cesium.GeoJsonDataSource.load(data, { clampToGround: true });
      await viewer.dataSources.add(source);
      source.entities.values.forEach((entity) => {
        entity.__publicLayerId = id;
        const style = styleFeature(entity, entity.properties) || {};
        if (entity.polyline) {
          entity.polyline.material = style.stroke || Cesium.Color.fromCssColorString('#52c3c4');
          entity.polyline.width = style.width || 3;
          entity.polyline.clampToGround = true;
          entity.polyline.arcType = Cesium.ArcType.GEODESIC;
        }
        if (entity.polygon && style.fill) {
          entity.polygon.material = style.fill;
          entity.polygon.outline = false;
          entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
        }
        if (entity.point && style.point) entity.point = style.point;
      });
      source.show = visible;
      dataSources.set(id, { source, data });
      return source;
    })().finally(() => loadingLayers.delete(id));
    loadingLayers.set(id, task);
    return task;
  }

  const shorelineInput = $('[data-public-layer="shoreline"]');
  loadGeoJson('shoreline', 'GarisPantaifix_WGS84.geojson', (_entity, properties) => {
    const epr = Number(valueOf(properties, 'epr'));
    return { stroke: Cesium.Color.fromCssColorString(epr >= 0 ? '#59c8c5' : '#db916f').withAlpha(.96), width: 3.5 };
  }, shorelineInput.checked).catch((error) => { shorelineInput.checked = false; console.warn('Transek peta publik:', error); });

  const morphologyInput = $('[data-public-layer="morphology"]');
  const morphologyYearSelect = $('#publicMorphologyYear');
  const morphologyColors = { 0: '#4e9ca0', 1: '#d8a46f' };
  let selectedMorphologyYear = Number(morphologyYearSelect.value);

  function setMorphologyYear(year) {
    selectedMorphologyYear = Number(year);
    dataSources.forEach((entry, layerId) => {
      if (layerId.startsWith('morphology-')) entry.source.show = false;
    });
    if (activeLegend?.startsWith('morphology-')) $('#publicParameterLegend').hidden = true;
    if (!morphologyInput.checked) return;
    const id = `morphology-${selectedMorphologyYear}`;
    const filename = `Morfologi_Kelas_AnakKrakatau_${selectedMorphologyYear}.geojson`;
    loadGeoJson(id, filename, (_entity, properties) => {
      const code = Number(valueOf(properties, 'kelas'));
      return { fill: Cesium.Color.fromCssColorString(morphologyColors[code] || '#8e9a91').withAlpha(code === 1 ? .72 : .24) };
    }, false).then(() => {
      if (!morphologyInput.checked || selectedMorphologyYear !== Number(year)) return;
      dataSources.forEach((entry, layerId) => {
        if (layerId.startsWith('morphology-')) entry.source.show = layerId === id;
      });
      renderMorphologyLegend(dataSources.get(id).data, Number(year));
    }).catch((error) => {
      if (selectedMorphologyYear === Number(year)) {
        morphologyInput.checked = false;
        morphologyYearSelect.hidden = true;
      }
      console.warn(`Morfologi Anak Krakatau ${year}:`, error);
    });
  }

  const toRing = (radiusKm, altitude = 8) => {
    const positions = [];
    const latScale = 111.32;
    const lonScale = latScale * Math.cos(Cesium.Math.toRadians(center[1]));
    for (let i = 0; i <= 96; i += 1) {
      const angle = i / 96 * Math.PI * 2;
      positions.push(Cesium.Cartesian3.fromDegrees(
        center[0] + radiusKm / lonScale * Math.cos(angle),
        center[1] + radiusKm / latScale * Math.sin(angle),
        altitude,
      ));
    }
    return positions;
  };
  const zones = [
    { name: 'Normal', from: .03, to: 3, color: '#48a77a', edge: '#8bd5ad', phase: 0 },
    { name: 'Siaga', from: 3, to: 5, color: '#e1a641', edge: '#f2ca76', phase: .33 },
    { name: 'Awas', from: 5, to: 8, color: '#dc6259', edge: '#f29b85', phase: .66 },
  ];
  const riskEntities = [];
  zones.forEach((zone) => {
    const progress = () => ((performance.now() / 1000 / 15 + zone.phase) % 1 + 1) % 1;
    const radius = () => zone.from + (zone.to - zone.from) * progress();
    const positions = new Cesium.CallbackProperty(() => toRing(Math.max(zone.from + .02, radius())), false);
    const outlineColor = new Cesium.CallbackProperty((_time, result) => Cesium.Color.fromCssColorString(zone.edge).withAlpha(.68 + .3 * (0.5 + .5 * Math.sin(performance.now() / 2600)), result), false);
    const outlineWidth = new Cesium.CallbackProperty(() => (selectedRiskZone === zone.name ? 3.5 : 1.8) + (selectedRiskZone === zone.name ? 1.8 : 1.1) * (0.5 + 0.5 * Math.sin(performance.now() / 2600)), false);
    const hierarchy = new Cesium.CallbackProperty(() => {
      const outer = toRing(Math.max(zone.from + .02, radius()));
      const holes = zone.from > .1 ? [new Cesium.PolygonHierarchy(toRing(zone.from))] : [];
      return new Cesium.PolygonHierarchy(outer, holes);
    }, false);
    const entity = viewer.entities.add({
      id: `public-risk-${zone.name.toLowerCase()}`,
      properties: { zone: zone.name, range: `${zone.from === .03 ? '0' : zone.from}–${zone.to} km` },
      polygon: { hierarchy, material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(() => Cesium.Color.fromCssColorString(zone.color).withAlpha(selectedRiskZone === zone.name ? .5 : .34), false)), outline: false, height: 4, classificationType: Cesium.ClassificationType.TERRAIN },
      polyline: { positions, clampToGround: true, width: outlineWidth, material: new Cesium.ColorMaterialProperty(outlineColor) },
    });
    entity.__publicLayerId = 'risk';
    riskEntities.push(entity);
  });
  const marker = viewer.entities.add({
    id: 'public-anak-krakatau',
    position: Cesium.Cartesian3.fromDegrees(center[0], center[1], 340),
    point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#e4b581'), outlineColor: Cesium.Color.fromCssColorString('#183532'), outlineWidth: 2, disableDepthTestDistance: 9000 },
    label: { text: 'Anak Krakatau', font: '600 13px DM Sans', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -21), disableDepthTestDistance: 9000 },
  });
  marker.__publicLayerId = 'marker';

  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = smokeCanvas.height = 64;
  const smokeContext = smokeCanvas.getContext('2d');
  const smokeGradient = smokeContext.createRadialGradient(32, 32, 2, 32, 32, 31);
  smokeGradient.addColorStop(0, 'rgba(224,230,226,.58)');
  smokeGradient.addColorStop(.36, 'rgba(196,207,204,.32)');
  smokeGradient.addColorStop(1, 'rgba(180,195,195,0)');
  smokeContext.fillStyle = smokeGradient;
  smokeContext.fillRect(0, 0, 64, 64);
  viewer.scene.primitives.add(new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(center[0], center[1], 425)),
    emitter: new Cesium.CircleEmitter(20), image: smokeCanvas, emissionRate: 2.6,
    startColor: Cesium.Color.fromCssColorString('#d2dad8').withAlpha(.4), endColor: Cesium.Color.fromCssColorString('#d2dad8').withAlpha(0),
    startScale: .55, endScale: 3, minimumParticleLife: 5, maximumParticleLife: 8,
    minimumSpeed: 11, maximumSpeed: 20, imageSize: new Cesium.Cartesian2(36, 36), lifetime: 1e9, loop: true,
  }));

  function colorForParameter(series, year, code) {
    const config = params[series];
    if (config.valueProperty) {
      const position = Math.max(0, Math.min(1, (code - config.valueRange[0]) / (config.valueRange[1] - config.valueRange[0]))) * (config.colors.length - 1);
      const index = Math.min(config.colors.length - 2, Math.floor(position));
      return Cesium.Color.lerp(
        Cesium.Color.fromCssColorString(config.colors[index]),
        Cesium.Color.fromCssColorString(config.colors[index + 1]),
        position - index,
        new Cesium.Color(),
      );
    }
    const palette = config.ranges?.[year] ? config.colors : config.colors;
    return Cesium.Color.fromCssColorString(palette[Math.max(0, Math.min(palette.length - 1, Math.round(code) - 1))]);
  }
  async function setParameter(series, year, visible) {
    const id = `${series}-${year}`;
    if (!visible) {
      const existing = dataSources.get(id);
      if (existing) existing.source.show = false;
      return;
    }
    const filename = params[series].files[year];
    try {
      await loadGeoJson(id, filename, (_entity, properties) => {
        const code = Number(valueOf(properties, params[series].valueProperty || 'gridcode'));
        const color = colorForParameter(series, year, code).withAlpha(.82);
        return {
          fill: color.withAlpha(.76),
          point: params[series].valueRange ? {
            pixelSize: 5,
            color,
            outlineColor: Cesium.Color.fromCssColorString('#102b3b').withAlpha(.55),
            outlineWidth: 0.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: 5000,
          } : null,
        };
      }, true);
      dataSources.forEach((entry, layerId) => {
        if (layerId.startsWith(`${series}-`)) entry.source.show = layerId === id;
      });
      renderParameterLegend(series, year);
    } catch (error) {
      console.warn(`Layer ${series} ${year} gagal dimuat:`, error);
    }
  }

  function renderParameterLegend(series, year) {
    const config = params[series];
    const ranges = config.ranges?.[year];
    const labels = config.colors.map((color, index) => {
      const range = ranges?.[index];
      const value = range ? Number(((range[0] + range[1]) / 2).toFixed(4)).toString() : null;
      const name = ranges ? `Kelas ${index + 1}` : `Gridcode ${index + 1}`;
      const unit = config.unit ? ` ${config.unit}` : '';
      return `<div class="parameter-class"><i style="--sample-color:${color}"></i><span>${name}</span><b>${value ? `${value}${unit}` : 'kelas visual'}</b></div>`;
    }).join('');
    $('#publicParameterTitle').textContent = `${config.label}${config.showYear === false ? '' : ` · ${year}`}`;
    $('#publicParameterLegendRows').innerHTML = `<div class="parameter-colorbar" aria-hidden="true">${config.colors.map((color) => `<i style="--sample-color:${color}"></i>`).join('')}</div><div class="parameter-class-list">${labels}</div>`;
    activeLegend = `${series}-${year}`;
    $('#publicParameterLegend').hidden = false;
  }

  function renderMorphologyLegend(data, year) {
    const totals = { 0: 0, 1: 0 };
    data.features.forEach((feature) => {
      const code = Number(feature.properties?.kelas);
      if (code in totals) totals[code] += Number(feature.properties?.luas_ha || 0);
    });
    $('#publicParameterTitle').textContent = `Morfologi Anak Krakatau · ${year}`;
    $('#publicParameterLegendRows').innerHTML = `<div class="parameter-class-list morphology-class-list">${[[0, 'Perairan'], [1, 'Daratan']].map(([code, label]) => `<div class="parameter-class"><i style="--sample-color:${morphologyColors[code]}"></i><span>${label} · kelas ${code}</span><b>${totals[code].toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha</b></div>`).join('')}</div>`;
    activeLegend = `morphology-${year}`;
    $('#publicParameterLegend').hidden = false;
  }

  $$('[data-public-layer]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.publicLayer;
    const yearList = $(`[data-public-years="${key}"]`);
    if (yearList) yearList.hidden = !input.checked;
    if (key === 'shoreline') {
      const entry = dataSources.get('shoreline');
      if (entry) entry.source.show = input.checked;
      else if (input.checked) loadGeoJson('shoreline', 'GarisPantaifix_WGS84.geojson', (_entity, properties) => ({ stroke: Cesium.Color.fromCssColorString(Number(valueOf(properties, 'epr')) >= 0 ? '#59c8c5' : '#db916f').withAlpha(.96), width: 3.5 }), true).catch(console.warn);
    }
    if (key === 'morphology') {
      if (input.checked) {
        morphologyYearSelect.hidden = false;
        setMorphologyYear(morphologyYearSelect.value);
      } else {
        morphologyYearSelect.hidden = true;
        dataSources.forEach((entry, layerId) => {
          if (layerId.startsWith('morphology-')) entry.source.show = false;
        });
        if (activeLegend?.startsWith('morphology-')) $('#publicParameterLegend').hidden = true;
      }
    }
    if (key === 'risk') riskEntities.forEach((entity) => { entity.show = input.checked; });
    if (params[key]) setParameter(key, selectedYears[key], input.checked);
  }));
  morphologyYearSelect.addEventListener('change', () => setMorphologyYear(morphologyYearSelect.value));
  $$('[data-public-year]').forEach((button) => button.addEventListener('click', () => {
    const series = button.dataset.publicYear;
    const year = Number(button.dataset.year);
    selectedYears[series] = year;
    $$(`[data-public-year="${series}"]`).forEach((item) => item.classList.toggle('selected', item === button));
    if ($(`[data-public-layer="${series}"]`).checked) setParameter(series, year, true);
  }));
  $('#publicLayersToggle').addEventListener('click', () => {
    const list = $('#publicLayerList');
    list.hidden = !list.hidden;
    $('#publicLayersToggle').setAttribute('aria-expanded', String(!list.hidden));
    $('#publicLayersCaret').className = `fa-solid ${list.hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`;
  });
  $('#publicLegendClose').addEventListener('click', () => { $('#publicParameterLegend').hidden = true; });
  $('#publicZoomIn').addEventListener('click', () => viewer.camera.zoomIn(Math.max(120, viewer.camera.positionCartographic.height * .23)));
  $('#publicZoomOut').addEventListener('click', () => viewer.camera.zoomOut(Math.max(120, viewer.camera.positionCartographic.height * .23)));
  $('#publicLocate').addEventListener('click', () => flyToArea(.75));

  const reliefButton = $('#publicTerrainToggle');
  reliefButton.addEventListener('click', () => {
    reliefView = !reliefView;
    if (terrainAvailable) viewer.terrainProvider = reliefView ? worldTerrainProvider : new Cesium.EllipsoidTerrainProvider();
    viewer.scene.globe.terrainExaggeration = reliefView ? 1.65 : 1;
    reliefButton.classList.toggle('is-active', reliefView);
    reliefButton.setAttribute('aria-pressed', String(reliefView));
    reliefButton.innerHTML = `<i class="fa-solid ${reliefView ? 'fa-mountain-sun' : 'fa-earth-americas'}"></i> ${reliefView ? 'RELIEF 3D' : 'TAMPAK DATAR'}`;
    flyToArea(.75);
  });

  const zoneDescriptions = {
    normal: { name: 'Normal', range: '0–3 km', message: 'Indikator simulasi untuk radius 0–3 km dari Anak Krakatau. Bukan peringatan resmi.' },
    siaga: { name: 'Siaga', range: '3–5 km', message: 'Indikator simulasi untuk radius 3–5 km dari Anak Krakatau. Bukan peringatan resmi.' },
    awas: { name: 'Awas', range: '5–8 km', message: 'Indikator simulasi untuk radius 5–8 km dari Anak Krakatau. Bukan peringatan resmi.' },
  };
  const zoneNotice = $('#publicZoneNotice');
  const clearZoneSelection = () => {
    selectedRiskZone = null;
    $$('[data-public-zone]').forEach((button) => button.classList.remove('is-selected'));
  };
  $$('[data-public-zone]').forEach((button) => button.addEventListener('click', () => {
    const zone = zoneDescriptions[button.dataset.publicZone];
    if (!zone) return;
    selectedRiskZone = zone.name;
    $$('[data-public-zone]').forEach((item) => item.classList.toggle('is-selected', item === button));
    const riskInput = $('[data-public-layer="risk"]');
    if (riskInput && !riskInput.checked) {
      riskInput.checked = true;
      riskEntities.forEach((entity) => { entity.show = true; });
    }
    $('#publicZoneNoticeTitle').textContent = `Zona ${zone.name} · ${zone.range}`;
    $('#publicZoneNoticeText').textContent = zone.message;
    zoneNotice.hidden = false;
    requestAnimationFrame(() => zoneNotice.classList.add('is-visible'));
  }));
  $('#publicZoneNoticeClose').addEventListener('click', () => {
    zoneNotice.classList.remove('is-visible');
    window.setTimeout(() => { zoneNotice.hidden = true; }, 180);
    clearZoneSelection();
  });

  const popup = $('#publicMapPopup');
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((event) => {
    const picked = viewer.scene.drillPick(event.position, 10) || [];
    const entity = picked.map((item) => item.id).find((item) => item?.__publicLayerId);
    if (!entity) { popup.hidden = true; return; }
    const props = Object.fromEntries((entity.properties?.propertyNames || []).map((key) => [key, valueOf(entity.properties, key)]));
    const layerId = entity.__publicLayerId;
    const lines = [];
    if (layerId === 'marker') lines.push('Pulau vulkanik aktif di Selat Sunda', 'Simbol asap hanya ilustrasi, bukan telemetri langsung');
    else if (layerId === 'shoreline') lines.push(`EPR: ${Number(props.epr).toFixed(2)} m/tahun`, `NSM: ${Number(props.nsm).toFixed(2)} m`);
    else if (layerId === 'risk') lines.push(`Radius ${props.range}`, 'Zona simulasi, bukan peringatan resmi');
    else if (layerId.startsWith('morphology-')) lines.push(`Kelas ${props.kelas}: ${props.nama_kelas}`, `Luas poligon: ${Number(props.luas_ha).toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha`, `Tahun data: ${props.tahun}`);
    else if (params[layerId.split('-')[0]]?.valueProperty) {
      const [series, year] = layerId.split('-');
      const value = Number(props[params[series].valueProperty]);
      if (params[series].showYear === false) {
        lines.push(
          `Rata-rata SWH lokasi: ${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
          `Rentang record: ${Number(props.swh_min_m).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}–${Number(props.swh_max_m).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
          `Jumlah record: ${Number(props.sample_count).toLocaleString('id-ID')}`,
        );
      } else lines.push(`${params[series].label} ${year}: ${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${params[series].unit}`);
    } else {
      const [series, year] = layerId.split('-');
      const code = Number(props.gridcode);
      const range = params[series].ranges?.[year]?.[code - 1];
      const median = range ? Number(((range[0] + range[1]) / 2).toFixed(4)) : null;
      const unit = params[series].unit ? ` ${params[series].unit}` : '';
      lines.push(range ? `${params[series].label} kelas ${code}: ${median}${unit}` : `Gridcode ${code}`);
    }
    const popupTitle = layerId === 'shoreline' ? 'Transek garis pantai' : layerId === 'risk' ? `Zona ${props.zone}` : layerId === 'marker' ? 'Anak Krakatau' : layerId.startsWith('morphology-') ? 'Morfologi Anak Krakatau' : `${params[layerId.split('-')[0]].label} ${layerId.split('-')[1]}`;
    popup.innerHTML = `<button type="button" aria-label="Tutup">&times;</button><b>${popupTitle}</b>${lines.map((line) => `<span>${line}</span>`).join('')}`;
    const close = $('button', popup);
    close.addEventListener('click', () => { popup.hidden = true; });
    const frameRect = $('#publicMapFrame').getBoundingClientRect();
    const hitPosition = entity.position?.getValue(Cesium.JulianDate.now()) || viewer.scene.pickPosition(event.position) || viewer.camera.pickEllipsoid(event.position);
    const position = hitPosition ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, hitPosition) : null;
    if (position) {
      popup.style.left = `${Math.max(12, Math.min(frameRect.width - 250, position.x))}px`;
      popup.style.top = `${Math.max(58, Math.min(frameRect.height - 120, position.y - 18))}px`;
    } else {
      popup.style.left = `${event.position.x + 16}px`;
      popup.style.top = `${event.position.y + 16}px`;
    }
    popup.hidden = false;
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  viewer.scene.postRender.addEventListener(() => {
    if (loading && !viewer.scene.globe.tilesLoaded) return;
    if (loading && !loading.hidden) loading.hidden = true;
  });
  window.setTimeout(() => { if (loading) loading.hidden = true; }, 12000);
})();
