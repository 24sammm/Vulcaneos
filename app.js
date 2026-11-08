const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const parameterData = {
  sst: {
    label: 'SST',
    colors: ['#2563eb', '#22d3ee', '#fde047', '#f59e0b', '#ef4444', '#d946ef'],
    years: { 2017: 'SST17.json', 2019: 'SST19.json', 2023: 'SST23.json', 2025: 'SST25.json' },
    classRanges: {
      2025: [
        { code: 1, min: 24.131, max: 28.915 },
        { code: 2, min: 28.916, max: 30.965 },
        { code: 3, min: 30.966, max: 35.635 },
        { code: 4, min: 35.636, max: 43.495 },
        { code: 5, min: 43.496, max: 53.177 },
      ],
    },
    physicalRanges: { 2025: { min: 24.130554, max: 53.17688 } },
    classColors: ['#2563eb', '#22d3ee', '#fde047', '#f97316', '#ef4444'],
  },
  chlorophyll: {
    label: 'Klorofil-a', colors: ['#edf4d8', '#c5df9b', '#87bd79', '#4e9674', '#26716a', '#124b52'],
    years: { 2017: 'CHL17.json', 2019: 'CHL19.json', 2023: 'CHL23.json', 2025: 'CHL25.json' },
  },
  tss: {
    label: 'TSS', colors: ['#e6f2ee', '#a9d6c5', '#6eb4a6', '#e2c277', '#cb8850', '#944d3c'],
    years: { 2017: 'TSS17.json', 2019: 'TSS19.json', 2023: 'TSS23.json', 2025: 'TSS25.json' },
  },
};
const selectedYears = { sst: 2017, chlorophyll: 2017, tss: 2017 };
const loadedParameters = {};
const riskBands = { normal: true, siaga: true, awas: true };
const parameterLayerId = (series, year) => `${series}-${year}-fill`;
let viewer = null;
let terrainEnabled = true;
const cesiumLayers = new Map();

function cesiumProperty(entity, name) {
  const property = entity.properties?.[name];
  return property?.getValue ? property.getValue(Cesium.JulianDate.now()) : property;
}

function colorAtValue(colors, value, min, max) {
  if (!Number.isFinite(value) || max <= min) return Cesium.Color.fromCssColorString(colors[Math.floor(colors.length / 2)]);
  const position = Math.max(0, Math.min(1, (value - min) / (max - min))) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(position));
  const mix = position - index;
  return Cesium.Color.lerp(Cesium.Color.fromCssColorString(colors[index]), Cesium.Color.fromCssColorString(colors[index + 1]), mix, new Cesium.Color());
}

async function addCesiumGeoJsonLayer(id, data, styleFeature, visible = true) {
  const dataSource = await Cesium.GeoJsonDataSource.load(data, { clampToGround: true });
  await viewer.dataSources.add(dataSource);
  for (const entity of dataSource.entities.values) {
    entity.__mapLayerId = id;
    const style = styleFeature(entity, entity.properties) || {};
    if (entity.polygon) {
      if (style.fill) entity.polygon.material = style.fill;
      entity.polygon.outline = Boolean(style.outline);
      if (style.outlineColor) entity.polygon.outlineColor = style.outlineColor;
      if (style.outlineWidth) entity.polygon.outlineWidth = style.outlineWidth;
      entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
    }
    if (entity.polyline) {
      if (style.stroke) entity.polyline.material = style.stroke;
      if (style.width) entity.polyline.width = style.width;
      entity.polyline.clampToGround = true;
      entity.polyline.arcType = Cesium.ArcType.GEODESIC;
    }
  }
  dataSource.show = visible;
  cesiumLayers.set(id, { dataSource, visible });
  return dataSource;
}

function setCesiumLayerVisibility(id, visible) {
  const layer = cesiumLayers.get(id);
  if (layer) {
    layer.visible = visible;
    layer.dataSource.show = visible;
  }
  if (id.startsWith('risk-')) {
    const zone = id.slice('risk-'.length);
    const animatedZone = viewer?.entities.getById(`risk-zone-${zone}`);
    if (animatedZone) animatedZone.show = visible;
  }
}

$$('.temporal-layer').forEach((group) => {
  const input = $('input[type="checkbox"]', group);
  const yearOptions = $('.year-options', group);
  yearOptions.hidden = !input.checked;
});
let selectedTheme = 'dark';
try {
  const savedTheme = localStorage.getItem('krakatau-watch-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') selectedTheme = savedTheme;
} catch { /* Storage may be unavailable in restricted browser contexts. */ }
document.documentElement.dataset.theme = selectedTheme;

const toast = (message) => {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
};

$$('[data-logout], #logoutButton').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Logout gagal.');
    window.location.assign('/login.html');
  } catch {
    button.disabled = false;
    toast('Tidak dapat menghubungi server autentikasi.');
  }
}));

const profileButton = $('#profileButton');
const profileMenu = $('#profileMenu');
fetch('/api/me', { credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : null)
  .then((session) => {
    if (!session?.authenticated || !session.profile) return;
    const { name, institution } = session.profile;
    $$('.profile-popover-name, .user b').forEach((element) => { element.textContent = name; });
    $$('.profile-popover small, .user small').forEach((element) => { element.textContent = institution; });
  })
  .catch(() => {});
profileButton?.addEventListener('click', () => {
  const isOpen = profileMenu.hidden;
  profileMenu.hidden = !isOpen;
  profileButton.setAttribute('aria-expanded', String(isOpen));
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.profile-control') && profileMenu && !profileMenu.hidden) {
    profileMenu.hidden = true;
    profileButton?.setAttribute('aria-expanded', 'false');
  }
});

function parameterStats(data) {
  const values = data.features.map((feature) => Number(feature.properties?.gridcode)).filter(Number.isFinite);
  if (!values.length) throw new Error('File tidak memiliki nilai gridcode.');
  return {
    min: values.reduce((min, value) => Math.min(min, value), Infinity),
    max: values.reduce((max, value) => Math.max(max, value), -Infinity),
  };
}

function renderParameterLegend(series, year, stats) {
  const config = parameterData[series];
  const physicalRange = config.physicalRanges?.[year];
  const classRanges = config.classRanges?.[year];
  $('.sst-legend label').textContent = `${config.label} ${year} (${physicalRange ? '°C' : 'gridcode'})`;
  const gradient = $('.sst-gradient');
  const ticksElement = $('.sst-ticks');
  let classLegend = $('.sst-class-legend');
  if (classRanges) {
    gradient.hidden = true;
    ticksElement.hidden = true;
    if (!classLegend) {
      classLegend = document.createElement('div');
      classLegend.className = 'sst-class-legend';
      gradient.after(classLegend);
    }
    classLegend.innerHTML = classRanges.map((range) => `<div><i style="--class-color:${config.classColors[range.code - 1]}"></i><span>Kelas ${range.code}</span><b>${range.min.toFixed(3).replace('.', ',')}–${range.max.toFixed(3).replace('.', ',')} °C</b></div>`).join('');
  } else {
    gradient.hidden = false;
    ticksElement.hidden = false;
    if (classLegend) classLegend.remove();
    const ticks = [stats.min, Number(((stats.min + stats.max) / 2).toPrecision(3)), stats.max];
    $$('.sst-ticks span').forEach((tick, index) => { tick.textContent = ticks[index]; });
    gradient.style.background = `linear-gradient(90deg, ${config.colors.join(', ')})`;
  }

  if (series === 'sst') {
    $('.metric-card.metric-cyan .metric-title').textContent = `SST ${year}`;
    const valueLabel = physicalRange
      ? `${physicalRange.min.toLocaleString('id-ID', { maximumFractionDigits: 2 })}–${physicalRange.max.toLocaleString('id-ID', { maximumFractionDigits: 2 })}<span>°C</span>`
      : `${stats.min}–${stats.max}<span>gridcode</span>`;
    $('.metric-card.metric-cyan .metric-value').innerHTML = valueLabel;
    $('.metric-card.metric-cyan .metric-foot span').textContent = physicalRange ? 'RENTANG SUHU SST' : 'RENTANG GRIDCODE SST';
  }
  if (series === 'chlorophyll') {
    $('.metric-card.metric-green .metric-title').textContent = `Klorofil-a · ${year}`;
    $('.metric-card.metric-green .metric-value').innerHTML = `${stats.min}–${stats.max}<span>gridcode</span>`;
    $('.metric-card.metric-green .metric-foot span').textContent = 'RENTANG GRIDCODE';
  }
}

const parameterLoads = {};
function activateParameterSeries(series) {
  Object.keys(parameterData).forEach((otherSeries) => {
    if (otherSeries === series) return;
    const toggle = $(`[data-layer="${otherSeries}"]`);
    if (toggle) toggle.checked = false;
    const yearOptions = $(`.year-options[data-series="${otherSeries}"]`);
    if (yearOptions) yearOptions.hidden = true;
    Object.keys(parameterData[otherSeries].years).forEach((year) => {
      const id = parameterLayerId(otherSeries, year);
      setCesiumLayerVisibility(id, false);
    });
  });
}

async function ensureParameterLayer(series, year) {
  const id = parameterLayerId(series, year);
  if (loadedParameters[id]) return loadedParameters[id];
  if (parameterLoads[id]) return parameterLoads[id];
  const config = parameterData[series];
  const file = config?.years[year];
  if (!file) throw new Error(`Data ${config?.label || series} ${year} belum terdaftar.`);

  parameterLoads[id] = (async () => {
    let response;
    response = await fetch(`./JSON/${file}`);
    if (!response.ok) throw new Error(`Tidak dapat memuat JSON/${file}.`);
    const data = await response.json();
    const stats = parameterStats(data);
    const span = stats.max - stats.min;
    const colorStops = config.colors.map((color, index) => [
      stats.min + span * index / (config.colors.length - 1), color,
    ]);
    const visible = selectedYears[series] === Number(year) && $(`[data-layer="${series}"]`).checked;
    await addCesiumGeoJsonLayer(id, data, (_entity, properties) => {
      const gridcode = Number(properties?.gridcode?.getValue?.(Cesium.JulianDate.now()) ?? properties?.gridcode);
      const classColors = config.classRanges?.[year] ? config.classColors : null;
      return {
        fill: (classColors
          ? Cesium.Color.fromCssColorString(classColors[gridcode - 1] || classColors[0])
          : colorAtValue(config.colors, gridcode, stats.min, stats.max)).withAlpha(0.78),
      };
    }, visible);
    const result = { ...stats, file };
    loadedParameters[id] = result;
    if (selectedYears[series] === Number(year)) renderParameterLegend(series, year, result);
    return result;
  })().catch((error) => {
    delete parameterLoads[id];
    throw error;
  });
  return parameterLoads[id];
}

$$('.nav-item').forEach((link) => link.addEventListener('click', () => {
  $$('.nav-item').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
  if (link.getAttribute('href') === '#metadataButton') $('#modal').classList.add('open');
  if (link.dataset.action === 'before-after') openBeforeAfterModal();
}));

const periodButton = $('#periodButton');
const periodMenu = $('#periodMenu');
periodButton.addEventListener('click', (event) => {
  if (!event.target.closest('.period-menu')) periodMenu.classList.toggle('open');
});
$$('[data-period]').forEach((option) => option.addEventListener('click', () => {
  $('#periodLabel').innerHTML = option.dataset.period.replace(' (', ' <em>(').replace(')', ')</em>');
  periodMenu.classList.remove('open');
  toast(`Periode ${option.dataset.period.split(' ')[0]} dipilih`);
}));
document.addEventListener('click', (event) => {
  if (!periodButton.contains(event.target)) periodMenu.classList.remove('open');
});

$('#layersToggle').addEventListener('click', () => {
  const list = $('#layerList');
  list.hidden = !list.hidden;
  $('.layer-caret i').className = `fa-solid ${list.hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`;
});

$$('.year-button').forEach((button) => {
  button.setAttribute('aria-pressed', String(button.classList.contains('selected')));
  button.addEventListener('click', () => {
    const { series, year, available } = button.dataset;
    if (available !== 'true' || !parameterData[series]) {
      const label = series === 'waves' ? 'Gelombang' : series === 'chlorophyll' ? 'Klorofil-a' : series.toUpperCase();
      toast(`Data ${label} ${year} belum tersedia`);
      return;
    }

    $$(`.year-button[data-series="${series}"]`).forEach((option) => {
      const selected = option === button;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    selectedYears[series] = Number(year);
    activateParameterSeries(series);
    const layerToggle = $(`[data-layer="${series}"]`);
    if (layerToggle) layerToggle.checked = true;
    Object.keys(parameterData[series].years).forEach((availableYear) => {
      const id = parameterLayerId(series, availableYear);
      setCesiumLayerVisibility(id, Number(availableYear) === Number(year));
    });
    toast(`${parameterData[series].label} ${year} dipilih`);
    ensureParameterLayer(series, Number(year)).then((stats) => {
      if (selectedYears[series] === Number(year)) renderParameterLegend(series, Number(year), stats);
    }).catch((error) => {
      toast(`Data ${parameterData[series].label} ${year} gagal dimuat`);
      console.warn(error);
    });
  });
});

const center = [105.423, -6.102];
viewer = new Cesium.Viewer('mapCanvas', {
  baseLayer: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
  homeButton: false, sceneModePicker: false, navigationHelpButton: false,
  fullscreenButton: false, infoBox: false, selectionIndicator: false,
  shouldAnimate: true, scene3DOnly: true, requestRenderMode: false,
});
window.viewer = viewer;
// Keep Cesium's native wheel and pinch zoom gestures enabled on the main viewport.
viewer.scene.screenSpaceCameraController.enableZoom = true;
viewer.scene.screenSpaceCameraController.enableLook = true;
viewer.scene.screenSpaceCameraController.zoomEventTypes = [
  Cesium.CameraEventType.PINCH,
];
const cesiumCanvas = viewer.scene.canvas;
cesiumCanvas.style.touchAction = 'none';
cesiumCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= cesiumCanvas.clientHeight;
  if (!Number.isFinite(delta) || delta === 0) return;

  const cameraHeight = Math.max(viewer.camera.positionCartographic.height, 100);
  const normalizedDelta = Math.min(Math.abs(delta), 120);
  const zoomAmount = Math.max(8, Math.min(cameraHeight * 0.24, cameraHeight * normalizedDelta / 600));
  if (delta < 0) viewer.camera.zoomIn(zoomAmount);
  else viewer.camera.zoomOut(zoomAmount);
}, { passive: false });
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
viewer.scene.shadowMap.enabled = true;
viewer.clock.shouldAnimate = true;
  viewer.clock.multiplier = 1;
viewer.scene.globe.terrainExaggeration = 1.7;
viewer.scene.globe.maximumScreenSpaceError = 1.5;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#122b38');
viewer.scene.fog.enabled = true;
let baseImageryLayer;
const initialCamera = () => viewer.camera.flyToBoundingSphere(
  new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(center[0], center[1], 280), 1150),
  { duration: 1.1, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-18), Cesium.Math.toRadians(terrainEnabled ? -37 : -85), 14000) },
);
initialCamera();
Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')
  .then((provider) => { baseImageryLayer = viewer.imageryLayers.addImageryProvider(provider); updateMapBrightness(); })
  .catch((error) => { console.warn('Imagery satelit gagal dimuat:', error); toast('Citra satelit tidak dapat dimuat'); });

async function loadCesiumWorldTerrain() {
  try {
    const response = await fetch('/api/cesium-config', { credentials: 'same-origin' });
    const config = response.ok ? await response.json() : {};
    if (!config.ionToken) {
      toast('Terrain World Terrain perlu CESIUM_ION_TOKEN pada environment server');
      console.info('Set CESIUM_ION_TOKEN pada environment lokal/Vercel untuk mengaktifkan Cesium World Terrain.');
      return;
    }
    Cesium.Ion.defaultAccessToken = config.ionToken;
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true });
    viewer.scene.globe.terrainExaggeration = 1.7;
    initialCamera();
  } catch (error) {
    console.warn('Cesium World Terrain tidak tersedia:', error);
    toast('Terrain 3D belum tersedia; peta memakai ellipsoid');
  }
}
loadCesiumWorldTerrain();

const overviewMap = new maplibregl.Map({
  container: 'overviewMap',
  center: [117, -2],
  zoom: 3.2,
  interactive: false,
  attributionControl: false,
  dragRotate: false,
  style: {
    version: 8,
    sources: { overview: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 } },
    layers: [{ id: 'overview-imagery', type: 'raster', source: 'overview', paint: { 'raster-saturation': -0.2 } }],
  },
});

function updateThemeControls() {
  $$('[data-theme-choice]').forEach((button) => {
    const selected = button.dataset.themeChoice === selectedTheme;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
function updateMapBrightness() {
  const brightness = selectedTheme === 'dark' ? 0.76 : 1;
  if (baseImageryLayer) baseImageryLayer.brightness = brightness;
  if (overviewMap.isStyleLoaded() && overviewMap.getLayer('overview-imagery')) overviewMap.setPaintProperty('overview-imagery', 'raster-brightness-max', brightness);
}
updateThemeControls();
$$('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => {
  selectedTheme = button.dataset.themeChoice;
  document.documentElement.dataset.theme = selectedTheme;
  updateThemeControls();
  updateMapBrightness();
  try { localStorage.setItem('krakatau-watch-theme', selectedTheme); } catch { /* Keep the current theme for this page session. */ }
}));
overviewMap.on('load', updateMapBrightness);

function updateOverviewBounds() {
  if (!overviewMap.isStyleLoaded()) return;
  const rectangle = viewer.camera.computeViewRectangle(Cesium.Ellipsoid.WGS84);
  if (!rectangle) return;
  const b = {
    getWest: () => Cesium.Math.toDegrees(rectangle.west), getSouth: () => Cesium.Math.toDegrees(rectangle.south),
    getEast: () => Cesium.Math.toDegrees(rectangle.east), getNorth: () => Cesium.Math.toDegrees(rectangle.north),
  };
  const boundsFeature = {
    type: 'Feature', properties: {}, geometry: {
      type: 'Polygon', coordinates: [[[b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()], [b.getEast(), b.getNorth()], [b.getWest(), b.getNorth()], [b.getWest(), b.getSouth()]]],
    },
  };
  if (overviewMap.getSource('view-extent')) overviewMap.getSource('view-extent').setData(boundsFeature);
  else {
    overviewMap.addSource('view-extent', { type: 'geojson', data: boundsFeature });
    overviewMap.addLayer({ id: 'view-extent', type: 'line', source: 'view-extent', paint: { 'line-color': '#e1c18e', 'line-width': 1.5 } });
  }
}
viewer.camera.changed.addEventListener(updateOverviewBounds);
overviewMap.on('load', updateOverviewBounds);
$('#miniMapButton').addEventListener('click', () => initialCamera());

function circleFeature(radiusKm, zone, steps = 72) {
  const [lng, lat] = center;
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = -(i / steps) * Math.PI * 2;
    const north = (radiusKm / 111.32) * Math.cos(angle);
    const east = (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    ring.push([lng + east, lat + north]);
  }
  return { type: 'Feature', properties: { zone }, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function circleBandFeature(innerRadiusKm, outerRadiusKm, zone, steps = 72) {
  const [lng, lat] = center;
  const ringFor = (radiusKm, direction) => {
    const ring = [];
    for (let i = 0; i <= steps; i += 1) {
      const angle = direction * (i / steps) * Math.PI * 2;
      const north = (radiusKm / 111.32) * Math.cos(angle);
      const east = (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
      ring.push([lng + east, lat + north]);
    }
    return ring;
  };
  return {
    type: 'Feature',
    properties: { zone },
    geometry: { type: 'Polygon', coordinates: [ringFor(outerRadiusKm, -1), ringFor(innerRadiusKm, 1)] },
  };
}

function updateShorelineSummary(data) {
  const rates = data.features.map((feature) => Number(feature.properties?.epr)).filter(Number.isFinite);
  const movements = data.features.map((feature) => Number(feature.properties?.nsm)).filter(Number.isFinite);
  if (!rates.length || !movements.length) throw new Error('GeoJSON garis pantai tidak memiliki nilai EPR/NSM.');
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const format = (value) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
  const meanEpr = average(rates);
  const meanNsm = average(movements);
  $('#coastMeanEpr').innerHTML = `${format(meanEpr)} <span>m/tahun</span>`;
  $('#coastMeanNsm').innerHTML = `${format(meanNsm)} <span>m</span>`;
  const changeValue = $('#coastChangeValue');
  changeValue.innerHTML = `${meanNsm > 0 ? '+' : meanNsm < 0 ? '-' : ''}${format(Math.abs(meanNsm))}<span>m</span>`;
  changeValue.classList.toggle('negative', meanNsm < 0);
  changeValue.classList.toggle('positive', meanNsm > 0);
  const dates = data.features.flatMap(({ properties = {} }) => [properties.start_date, properties.end_date]).filter(Boolean).sort();
  const formatDate = (value) => {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 8) return String(value);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`));
  };
  window.shorelineDateLabel = formatDate;
  const dateSpan = dates.length ? `${formatDate(dates[0])}–${formatDate(dates[dates.length - 1])}` : 'periode tidak tersedia';
  const years = dates.map((date) => String(date).replace(/\D/g, '').slice(0, 4)).filter(Boolean).sort();
  $('#coastChangePeriod').textContent = years.length ? `RATA-RATA NSM · ${years[0]}–${years[years.length - 1]}` : 'RATA-RATA NSM TRANSEK';
  $('#coastDataCaption').textContent = `${data.features.length} transek · ${dateSpan}`;

  const coordinates = data.features.flatMap((feature) => feature.geometry.coordinates);
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const padX = 12, padY = 12, width = 340, height = 170;
  const x = (lng) => padX + ((lng - minLng) / (maxLng - minLng || 1)) * (width - padX * 2);
  const y = (lat) => height - padY - ((lat - minLat) / (maxLat - minLat || 1)) * (height - padY * 2);
  $('#coastTransects').innerHTML = data.features.map((feature) => {
    const path = feature.geometry.coordinates.map((coordinate, index) => `${index ? 'L' : 'M'}${x(coordinate[0]).toFixed(1)},${y(coordinate[1]).toFixed(1)}`).join(' ');
    const sign = Number(feature.properties.epr) >= 0 ? 'positive' : 'negative';
    return `<path class="coast-transect ${sign}" d="${path}" />`;
  }).join('');
}

async function loadShorelineRates() {
  const response = await fetch('./JSON/GarisPantaifix_WGS84.geojson');
  if (!response.ok) throw new Error('File transek garis pantai tidak dapat dimuat.');
  const data = await response.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Format GeoJSON garis pantai tidak valid.');
  updateShorelineSummary(data);
  await addCesiumGeoJsonLayer('shoreline-epr', data, (_entity, properties) => {
    const epr = Number(properties?.epr?.getValue?.(Cesium.JulianDate.now()) ?? properties?.epr);
    return { stroke: (epr >= 0 ? Cesium.Color.fromCssColorString('#56c4c7') : Cesium.Color.fromCssColorString('#d58b69')).withAlpha(0.95), width: 3.5 };
  }, $('[data-layer="shoreline-rates"]').checked);
}

function makeSmokeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(224,230,226,.58)');
  gradient.addColorStop(.35, 'rgba(196,207,204,.36)');
  gradient.addColorStop(1, 'rgba(180,195,195,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return canvas;
}

function showCesiumPopup(position, title, lines) {
  const popup = $('#cesiumPopup');
  popup.innerHTML = `<div class="cesium-popup-head"><b>${title}</b><button class="cesium-popup-close" type="button" aria-label="Tutup informasi titik"><i class="fa-solid fa-xmark"></i></button></div><div class="cesium-popup-details">${lines.map((line) => `<span>${line}</span>`).join('')}</div>`;
  popup.hidden = false;
  const rect = $('#mapCanvas').getBoundingClientRect();
  popup.style.left = `${Math.max(12, Math.min(position.x + 14, rect.width - 260))}px`;
  popup.style.top = `${Math.max(12, Math.min(position.y + 14, rect.height - 120))}px`;
}
$('#cesiumPopup').addEventListener('click', (event) => {
  if (event.target.closest('.cesium-popup-close')) $('#cesiumPopup').hidden = true;
});

async function initializeMapData() {
  if ($('[data-layer="sst"]').checked) {
    ensureParameterLayer('sst', 2017).catch((error) => { toast('Layer SST 2017 gagal dimuat'); console.warn(error); });
  }
  loadShorelineRates().catch((error) => {
    $('[data-layer="shoreline-rates"]').checked = false;
    toast('Data transek garis pantai gagal dimuat');
    console.warn(error);
  });

  const riskStyles = {
    awas: { fill: '#b65f54', edge: '#dc907e', innerRadius: 5, outerRadius: 8, phase: 0.66 },
    siaga: { fill: '#d2a254', edge: '#e5c27e', innerRadius: 3, outerRadius: 5, phase: 0.33 },
    normal: { fill: '#579176', edge: '#9bc9ad', innerRadius: 0, outerRadius: 3, phase: 0 },
  };
  for (const zone of ['normal', 'siaga', 'awas']) {
    const colors = riskStyles[zone];
    const pulseProgress = () => {
      const elapsed = performance.now() / 1000;
      return ((elapsed / 13 + colors.phase) % 1 + 1) % 1;
    };
    const radiusAtTime = () => {
      const progress = pulseProgress();
      return colors.innerRadius + (colors.outerRadius - colors.innerRadius) * progress;
    };
    const ringPositions = (radiusKm) => {
      const points = [];
      const latitudeScale = 111.32;
      const longitudeScale = latitudeScale * Math.cos(Cesium.Math.toRadians(center[1]));
      for (let step = 0; step <= 96; step += 1) {
        const angle = (step / 96) * Math.PI * 2;
        points.push(Cesium.Cartesian3.fromDegrees(
          center[0] + (radiusKm / longitudeScale) * Math.cos(angle),
          center[1] + (radiusKm / latitudeScale) * Math.sin(angle),
          2,
        ));
      }
      return points;
    };
    const currentRing = new Cesium.CallbackProperty(() => ringPositions(Math.max(0.025, radiusAtTime())), false);
    const alertPulse = () => 0.5 + 0.5 * Math.sin((performance.now() / 1000 / 3.8) * Math.PI * 2);
    const alertEdgeColor = new Cesium.CallbackProperty((_time, result) => {
      return Cesium.Color.fromCssColorString(colors.edge).withAlpha(0.58 + alertPulse() * 0.4, result);
    }, false);
    const alertEdgeWidth = new Cesium.CallbackProperty(() => 2.4 + alertPulse() * 2.2, false);
    const hierarchy = new Cesium.CallbackProperty(() => {
      const outer = ringPositions(Math.max(colors.innerRadius + 0.025, radiusAtTime()));
      const holes = colors.innerRadius > 0
        ? [new Cesium.PolygonHierarchy(ringPositions(colors.innerRadius))]
        : [];
      return new Cesium.PolygonHierarchy(outer, holes);
    }, false);
    const color = Cesium.Color.fromCssColorString(colors.fill);
    const entity = viewer.entities.add({
      id: `risk-zone-${zone}`,
      name: `Zona ${zone}`,
      show: $('[data-layer="risk"]').checked && riskBands[zone],
      properties: { zone },
      polygon: {
        hierarchy,
        material: color.withAlpha(0.5),
        outline: false,
        perPositionHeight: false,
        height: 2,
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
      polyline: {
        positions: currentRing,
        clampToGround: true,
        width: alertEdgeWidth,
        material: new Cesium.ColorMaterialProperty(alertEdgeColor),
      },
    });
    entity.__mapLayerId = `risk-${zone}`;
  }

  viewer.entities.add({
    id: 'anak-krakatau-marker', position: Cesium.Cartesian3.fromDegrees(center[0], center[1], 340),
    point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#e2b77c'), outlineColor: Cesium.Color.fromCssColorString('#15252a'), outlineWidth: 2, disableDepthTestDistance: 10000 },
    label: { text: 'Anak Krakatau', font: '600 13px DM Sans', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20), disableDepthTestDistance: 10000 },
  });
  viewer.scene.primitives.add(new Cesium.ParticleSystem({
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(center[0], center[1], 430)),
    emitter: new Cesium.CircleEmitter(22), image: makeSmokeCanvas(), emissionRate: 3.2,
    startColor: Cesium.Color.fromCssColorString('#d2dad8').withAlpha(0.42), endColor: Cesium.Color.fromCssColorString('#d2dad8').withAlpha(0),
    startScale: 0.55, endScale: 3.2, minimumParticleLife: 5, maximumParticleLife: 8,
    minimumSpeed: 12, maximumSpeed: 24, imageSize: new Cesium.Cartesian2(38, 38), lifetime: 1e9, loop: true,
  }));
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((event) => {
    const picked = viewer.scene.drillPick(event.position, 12) || [];
    const pickedEntities = picked.map((item) => item.id).filter((item) => item && typeof item === 'object');
    const entity = pickedEntities.find((item) => item.id === 'anak-krakatau-marker')
      || pickedEntities.find((item) => /^(sst|chlorophyll|tss)-\d+-fill$/.test(item.__mapLayerId || ''))
      || pickedEntities.find((item) => item.__mapLayerId === 'shoreline-epr')
      || pickedEntities.find((item) => item.__mapLayerId?.startsWith('risk-'));
    if (!entity || !entity.__mapLayerId) {
      $('#cesiumPopup').hidden = true;
      if (entity?.id === 'anak-krakatau-marker') showCesiumPopup(event.position, 'Anak Krakatau', ['Kawah aktif · 6.102° S, 105.423° E', 'Kepulan asap adalah ilustrasi, bukan telemetri real-time']);
      return;
    }
    const layerId = entity.__mapLayerId;
    const propertyNames = entity.properties?.propertyNames || Object.keys(entity.properties || {});
    const props = Object.fromEntries(propertyNames.map((key) => [key, cesiumProperty(entity, key)]));
    const lines = [];
    const match = layerId.match(/^(sst|chlorophyll|tss)-(\d+)-fill$/);
    if (match) {
      const [, series, year] = match;
      const classRange = parameterData[series].classRanges?.[year]?.find((range) => range.code === Number(props.gridcode));
      lines.push(classRange
        ? `SST ${year} · Kelas ${classRange.code}: ${classRange.min.toFixed(3).replace('.', ',')}–${classRange.max.toFixed(3).replace('.', ',')} °C`
        : `${parameterData[series].label} ${year}: ${props.gridcode} (gridcode)`);
    }
    if (layerId === 'shoreline-epr') {
      const dateLabel = window.shorelineDateLabel || ((value) => value);
      lines.push(`Transek ${dateLabel(props.start_date)}–${dateLabel(props.end_date)}`, `EPR: ${Number(props.epr).toFixed(2)} m/tahun`, `NSM: ${Number(props.nsm).toFixed(2)} m`);
    }
    if (layerId.startsWith('risk-')) lines.push(`Zona ${props.zone} · radius simulasi ${props.zone === 'normal' ? '0–3' : props.zone === 'siaga' ? '3–5' : '5–8'} km`);
    showCesiumPopup(event.position, layerId === 'shoreline-epr' ? 'Transek garis pantai' : 'Informasi titik', lines);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
initializeMapData().catch((error) => { console.warn('Layer peta Cesium:', error); toast('Sebagian layer peta gagal dimuat'); });
viewer.scene.renderError.addEventListener((_scene, error) => console.warn('Cesium render:', error));
$$('.layer-list input').forEach((input) => input.addEventListener('change', () => {
  const yearOptions = input.closest('.temporal-layer')?.querySelector('.year-options');
  if (yearOptions) yearOptions.hidden = !input.checked;
  const series = input.dataset.layer;

  if (series === 'shoreline-rates') {
    setCesiumLayerVisibility('shoreline-epr', input.checked);
    toast(input.checked ? 'Transek garis pantai ditampilkan' : 'Transek garis pantai disembunyikan');
    return;
  }

  if (parameterData[series]) {
    const year = selectedYears[series];
    if (!input.checked) {
      Object.keys(parameterData[series].years).forEach((availableYear) => {
        const id = parameterLayerId(series, availableYear);
        setCesiumLayerVisibility(id, false);
      });
      toast(`${parameterData[series].label} disembunyikan`);
      return;
    }
    activateParameterSeries(series);
    ensureParameterLayer(series, year).then((stats) => {
      if (selectedYears[series] !== year) return;
      const id = parameterLayerId(series, year);
      setCesiumLayerVisibility(id, true);
      renderParameterLegend(series, year, stats);
    }).catch((error) => {
      input.checked = false;
      if (yearOptions) yearOptions.hidden = true;
      toast(`Layer ${parameterData[series].label} ${year} gagal dimuat`);
      console.warn(error);
    });
    return;
  }

  if (series === 'waves') {
    toast(input.checked ? 'Data gelombang menyusul' : 'Layer gelombang disembunyikan');
    if (input.checked) {
      input.checked = false;
      if (yearOptions) yearOptions.hidden = true;
    }
    return;
  }

  if (series === 'risk') {
    Object.entries(riskBands).forEach(([band, selected]) => {
      const id = `risk-${band}`;
      setCesiumLayerVisibility(id, input.checked && selected);
    });
    if (!input.checked) {
      activeMapZone = null;
      $('#mapZoneCallout').hidden = true;
    }
    toast(`Zona risiko ${input.checked ? 'ditampilkan' : 'disembunyikan'}`);
    return;
  }

  toast(`${input.closest('label').textContent.trim()}: layer demo belum tersedia`);
  input.checked = false;
}));

const riskNoticeDetails = {
  normal: { name: 'Normal', range: '0–3 km', innerRadius: 0, outerRadius: 3, color: '#7ca68d', text: 'Zona simulasi terdekat yang mencakup radius hingga 3 km dari Anak Krakatau.' },
  siaga: { name: 'Siaga', range: '3–5 km', innerRadius: 3, outerRadius: 5, color: '#c8a268', text: 'Zona simulasi kewaspadaan menengah pada jarak 3 sampai 5 km dari Anak Krakatau.' },
  awas: { name: 'Awas', range: '5–8 km', innerRadius: 5, outerRadius: 8, color: '#b86f6e', text: 'Zona simulasi kewaspadaan tinggi pada jarak 5 sampai 8 km dari Anak Krakatau.' },
};
let activeMapZone = null;
function updateMapZoneCallout() {
  if (!activeMapZone) return;
  const details = riskNoticeDetails[activeMapZone];
  const targetRadiusKm = details.innerRadius + (details.outerRadius - details.innerRadius) * 0.72;
  const angle = Cesium.Math.toRadians(38);
  const latitudeScale = 111.32;
  const longitudeScale = latitudeScale * Math.cos(Cesium.Math.toRadians(center[1]));
  const target = Cesium.Cartesian3.fromDegrees(
    center[0] + (targetRadiusKm / longitudeScale) * Math.cos(angle),
    center[1] + (targetRadiusKm / latitudeScale) * Math.sin(angle),
    4,
  );
  const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, target);
  const callout = $('#mapZoneCallout');
  if (!screen) { callout.hidden = true; return; }
  callout.hidden = false;
  const frame = $('#mapFrame').getBoundingClientRect();
  const canvas = viewer.scene.canvas.getBoundingClientRect();
  const anchorX = canvas.left - frame.left + screen.x;
  const anchorY = canvas.top - frame.top + screen.y;
  const width = callout.offsetWidth || 190;
  const height = callout.offsetHeight || 48;
  const placeRight = anchorX + width + 28 < frame.width;
  const left = placeRight ? anchorX + 20 : anchorX - width - 20;
  const top = Math.max(10, Math.min(anchorY - height / 2, frame.height - height - 10));
  callout.dataset.side = placeRight ? 'left' : 'right';
  callout.style.left = `${Math.max(10, Math.min(left, frame.width - width - 10))}px`;
  callout.style.top = `${top}px`;
  callout.style.setProperty('--zone-callout-color', details.color);
}
viewer.scene.postRender.addEventListener(updateMapZoneCallout);
$$('.risk-notice-trigger').forEach((button) => button.addEventListener('click', () => {
  const details = riskNoticeDetails[button.dataset.zone];
  if (!details) return;
  activeMapZone = button.dataset.zone;
  const riskToggle = $('[data-layer="risk"]');
  if (!riskToggle.checked) riskToggle.checked = true;
  Object.keys(riskBands).forEach((zone) => setCesiumLayerVisibility(`risk-${zone}`, true));
  const notice = $('#riskNotice');
  notice.className = `risk-notice risk-notice-${button.dataset.zone}`;
  notice.innerHTML = `<div class="risk-notice-head"><span class="risk-notice-dot"></span><div class="risk-notice-copy"><small class="risk-notice-kicker">KETERANGAN ZONA</small><strong>${details.name}<span>${details.range}</span></strong></div><button type="button" class="risk-notice-close" aria-label="Tutup keterangan zona"><i class="fa-solid fa-xmark"></i></button></div><p>${details.text}</p><small class="risk-notice-foot">Batas zona pada peta adalah radius simulasi.</small>`;
  notice.hidden = false;
  const mapCallout = $('#mapZoneCallout');
  mapCallout.className = `map-zone-callout map-zone-callout-${button.dataset.zone}`;
  mapCallout.innerHTML = `<span class="map-zone-callout-dot"></span><div class="map-zone-callout-copy"><small class="map-zone-callout-kicker">AREA RISIKO</small><strong>Zona ${details.name}</strong><span>${details.range}</span></div><button type="button" class="map-zone-callout-close" aria-label="Tutup penanda zona"><i class="fa-solid fa-xmark"></i></button>`;
  $$('.risk-notice-trigger').forEach((item) => item.setAttribute('aria-expanded', String(item === button)));
  updateMapZoneCallout();
}));
$('#riskNotice').addEventListener('click', (event) => {
  if (!event.target.closest('.risk-notice-close')) return;
  $('#riskNotice').hidden = true;
  activeMapZone = null;
  $('#mapZoneCallout').hidden = true;
  $$('.risk-notice-trigger').forEach((item) => item.setAttribute('aria-expanded', 'false'));
});
$('#mapZoneCallout').addEventListener('click', (event) => {
  if (!event.target.closest('.map-zone-callout-close')) return;
  activeMapZone = null;
  $('#mapZoneCallout').hidden = true;
  $('#riskNotice').hidden = true;
  $$('.risk-notice-trigger').forEach((item) => item.setAttribute('aria-expanded', 'false'));
});
$('#terrainButton').addEventListener('click', () => {
  terrainEnabled = !terrainEnabled;
  viewer.scene.globe.terrainExaggeration = terrainEnabled ? 1.7 : 1;
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(center[0], center[1], 280), 1150), {
    duration: 0.6, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-18), Cesium.Math.toRadians(terrainEnabled ? -37 : -85), 14000),
  });
  $('#terrainButton span').textContent = terrainEnabled ? 'Relief 3D' : 'Peta datar';
});
$('#zoomIn').addEventListener('click', () => viewer.camera.zoomIn(900));
$('#zoomOut').addEventListener('click', () => viewer.camera.zoomOut(900));
$('#locate').addEventListener('click', () => initialCamera());

function setInfoPanelVisible(visible) {
  const panel = $('.info-panel');
  panel.hidden = !visible;
  $('.map-section').classList.toggle('info-hidden', !visible);
  viewer.resize();
}
$('#infoClose').addEventListener('click', () => setInfoPanelVisible(false));
$('#infoOpen').addEventListener('click', () => setInfoPanelVisible(true));

const series = {
  SPL: ['M12 61 116 54 220 58 324 48 428 49 520 46', 'M12 81 116 73 220 99 324 69 428 67 520 59'],
  Gelombang: ['M12 93 116 79 220 84 324 67 428 57 520 50', 'M12 104 116 88 220 96 324 76 428 68 520 62'],
  'Klorofil-a': ['M12 72 116 65 220 61 324 68 428 54 520 48', 'M12 58 116 71 220 84 324 77 428 88 520 94'],
};
$('#chartTabs').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-key]');
  if (!button) return;
  $$('#chartTabs button').forEach((tab) => tab.classList.toggle('selected', tab === button));
  const [before, after] = series[button.dataset.key];
  $('.line-before').setAttribute('d', before);
  $('.line-after').setAttribute('d', after);
});

$('#metadataButton').addEventListener('click', () => $('#modal').classList.add('open'));
$('#modalClose').addEventListener('click', () => $('#modal').classList.remove('open'));
$('#modalDone').addEventListener('click', () => $('#modal').classList.remove('open'));
$('#modal').addEventListener('click', (event) => {
  if (event.target.id === 'modal') $('#modal').classList.remove('open');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#modal').classList.remove('open');
    $('#downloadModal').classList.remove('open');
    periodMenu.classList.remove('open');
    if (!timeline.hidden) closeDeformationTimeline();
  }
});
$$('.footer-links a').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  if (link.id === 'downloadDataButton') {
    $('#downloadModal').classList.add('open');
    return;
  }
  $('#modal').classList.add('open');
}));

const downloadGroups = [
  ...Object.entries(parameterData).map(([series, config]) => ({
    label: config.label,
    files: Object.entries(config.years).map(([year, filename]) => ({ label: year, filename })),
  })),
  { label: 'Transek garis pantai', files: [{ label: '2017–2025 · EPR / NSM', filename: 'GarisPantaifix_WGS84.geojson' }] },
];
$('#downloadLinks').innerHTML = downloadGroups.map((group) => `<section class="download-group"><b>${group.label}</b><div>${group.files.map(({ label, filename }) => `<a href="./JSON/${filename}" download="${filename}"><span>${label}</span><i class="fa-solid fa-download" aria-hidden="true"></i></a>`).join('')}</div></section>`).join('');
$('#downloadClose').addEventListener('click', () => $('#downloadModal').classList.remove('open'));
$('#downloadDone').addEventListener('click', () => $('#downloadModal').classList.remove('open'));
$('#downloadModal').addEventListener('click', (event) => {
  if (event.target.id === 'downloadModal') $('#downloadModal').classList.remove('open');
});

let waybackItemsPromise;
let deformationMode = false;
let deformationLayerState = null;
let selectedTimelineYear = 2017;
let timelinePlayTimer = null;
let timelineRequest = 0;
const timeline = $('#deformationTimeline');

async function getWaybackItemsByYear() {
  if (!waybackItemsPromise) {
    waybackItemsPromise = fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json')
      .then((response) => {
        if (!response.ok) throw new Error('Arsip Wayback tidak merespons.');
        return response.json();
      })
      .then((config) => {
        const itemsByYear = new Map();
        Object.values(config).forEach((item) => {
          if (!item?.itemTitle || !item?.itemURL) return;
          const dateParts = item.itemTitle.match(/(20\d{2})-(\d{2})-(\d{2})/);
          if (!dateParts) return;
          const year = Number(dateParts[1]);
          if (year < 2017 || year > 2023) return;
          const releaseDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
          if (!itemsByYear.has(year) || releaseDate > itemsByYear.get(year).releaseDate) {
            itemsByYear.set(year, { ...item, year, releaseDate });
          }
        });
        return itemsByYear;
      })
      .catch((error) => { waybackItemsPromise = null; throw error; });
  }
  return waybackItemsPromise;
}

function setTimelineYear(year) {
  selectedTimelineYear = year;
  $('#timelineSlider').value = String(year);
  $$('#timelineYears button').forEach((button) => {
    const selected = Number(button.dataset.year) === year;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

let compareBeforeMap = null;
let compareAfterMap = null;
let compareMapsLoading = false;
let beforeAfterTransectsPromise = null;
function loadBeforeAfterTransects() {
  if (!beforeAfterTransectsPromise) {
    beforeAfterTransectsPromise = fetch('./JSON/GarisPantaifix_WGS84.geojson')
      .then((response) => {
        if (!response.ok) throw new Error('GeoJSON transek garis pantai tidak dapat dimuat.');
        return response.json();
      })
      .then((data) => {
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Format GeoJSON transek tidak valid.');
        return data;
      })
      .catch((error) => { beforeAfterTransectsPromise = null; throw error; });
  }
  return beforeAfterTransectsPromise;
}
async function addBeforeAfterTransects(compareMap) {
  try {
    const data = await loadBeforeAfterTransects();
    if (compareMap.getSource('shoreline-transects')) return;
    compareMap.addSource('shoreline-transects', { type: 'geojson', data });
    compareMap.addLayer({
      id: 'shoreline-transects',
      type: 'line',
      source: 'shoreline-transects',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['>=', ['to-number', ['get', 'epr']], 0], '#49c2ce', '#e68d68'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 13, 2.2, 17, 3.2],
        'line-opacity': 0.94,
      },
    });
  } catch (error) {
    console.warn('Transek pada peta Before–After:', error);
  }
}
async function initBeforeAfterCompare() {
  if ((compareBeforeMap && compareAfterMap) || compareMapsLoading) return;
  compareMapsLoading = true;
  const status = $('#compareStatus');
  try {
    const items = await getWaybackItemsByYear();
    const beforeItem = items.get(2017);
    const afterItem = items.get(2019);
    if (!beforeItem || !afterItem) throw new Error('Arsip citra 2017 atau 2019 tidak tersedia.');
    const tileUrl = (item) => item.itemURL.replaceAll('{level}', '{z}').replaceAll('{row}', '{y}').replaceAll('{col}', '{x}');
    const mapOptions = (container, sourceId, tiles) => ({
      container,
      center: [105.423, -6.102],
      zoom: 12.8,
      bearing: -18,
      pitch: 56,
      interactive: sourceId === 'compare-after',
      attributionControl: false,
      fadeDuration: 0,
      style: {
        version: 8,
        sources: {
          [sourceId]: { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: 19 },
          terrain: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' },
        },
        layers: [
          { id: `${sourceId}-imagery`, type: 'raster', source: sourceId, paint: { 'raster-saturation': -0.18, 'raster-contrast': 0.06 } },
          { id: `${sourceId}-shade`, type: 'hillshade', source: 'terrain', paint: { 'hillshade-exaggeration': 0.18, 'hillshade-illumination-direction': 320 } },
        ],
      },
    });
    compareBeforeMap = new maplibregl.Map(mapOptions('compareBeforeMap', 'compare-before', tileUrl(beforeItem)));
    compareAfterMap = new maplibregl.Map(mapOptions('compareAfterMap', 'compare-after', tileUrl(afterItem)));
    [compareBeforeMap, compareAfterMap].forEach((compareMap) => {
      compareMap.on('load', () => {
        compareMap.setTerrain({ source: 'terrain', exaggeration: 1.2 });
        addBeforeAfterTransects(compareMap);
        compareMap.resize();
      });
    });
    compareAfterMap.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    compareAfterMap.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
    compareAfterMap.on('move', syncCompareBeforeMap);
    $('#compareBeforeLabel').textContent = `PRA-ERUPSI | ${beforeItem.releaseDate.slice(0, 4)}`;
    $('.compare-label-after').textContent = `PASCA-ERUPSI | ${afterItem.releaseDate.slice(0, 4)}`;
    status.hidden = true;
    compareMapsLoading = false;
  } catch (error) {
    status.textContent = 'Arsip citra tidak tersedia';
    console.warn('Before-After preview:', error);
    compareMapsLoading = false;
  }
}

function syncCompareBeforeMap() {
  if (!compareBeforeMap || !compareAfterMap || $('#beforeAfterModal').hidden) return;
  const camera = { center: compareAfterMap.getCenter(), zoom: compareAfterMap.getZoom(), bearing: compareAfterMap.getBearing(), pitch: compareAfterMap.getPitch() };
  compareBeforeMap.jumpTo(camera);
}

const compareSlider = $('#compareSlider');
function updateCompareSplit() {
  const split = Number(compareSlider.value);
  $('#comparePreview').style.setProperty('--compare-split', `${split}%`);
  compareSlider.setAttribute('aria-valuetext', `Posisi ${split} persen`);
}
compareSlider.addEventListener('input', updateCompareSplit);
updateCompareSplit();
function resizeBeforeAfterPreview() {
  const preview = $('#comparePreview');
  if (preview.clientWidth) preview.style.setProperty('--compare-map-width', `${preview.clientWidth}px`);
  [compareBeforeMap, compareAfterMap].forEach((compareMap) => compareMap?.resize());
}
new ResizeObserver(resizeBeforeAfterPreview).observe($('#comparePreview'));
function openBeforeAfterModal() {
  if (!$('#deformationTimeline').hidden) closeDeformationTimeline();
  const modal = $('#beforeAfterModal');
  modal.hidden = false;
  document.body.classList.add('before-after-open');
  requestAnimationFrame(async () => {
    await initBeforeAfterCompare();
    resizeBeforeAfterPreview();
    syncCompareBeforeMap();
  });
  $('#beforeAfterClose').focus();
}
function closeBeforeAfterModal() {
  $('#beforeAfterModal').hidden = true;
  document.body.classList.remove('before-after-open');
}
$('#beforeAfterClose').addEventListener('click', closeBeforeAfterModal);
$('#beforeAfterModal').addEventListener('click', (event) => {
  if (event.target === $('#beforeAfterModal')) closeBeforeAfterModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#beforeAfterModal').hidden) closeBeforeAfterModal();
});
function setDeformationMode(enabled) {
  const parameterLayerIds = Object.entries(parameterData).flatMap(([series, config]) => Object.keys(config.years).map((year) => parameterLayerId(series, year)));
  const layerIds = ['satellite', 'terrain-shading', ...parameterLayerIds, 'risk-awas', 'risk-siaga', 'risk-normal'];
  if (enabled && !deformationMode) {
    if (timeline.hidden) return;
    if (!map.isStyleLoaded()) { map.once('load', () => setDeformationMode(true)); return; }
    deformationMode = true;
    deformationLayerState = {};
    layerIds.forEach((id) => {
      if (!map.getLayer(id)) return;
      deformationLayerState[id] = map.getLayoutProperty(id, 'visibility') || 'visible';
      if (id !== 'satellite') map.setLayoutProperty(id, 'visibility', 'none');
    });
    $$('.layer-list input, .year-button').forEach((control) => { control.disabled = true; });
    map.easeTo({ center: [105.423, -6.102], zoom: 12.1, pitch: 42, bearing: -18, duration: 450 });
    showTimelineYear(selectedTimelineYear);
  } else if (!enabled && deformationMode) {
    if (map.getLayer('satellite')) {
      map.getStyle().layers.forEach((layer) => {
        if (layer.id.startsWith('wayback-')) map.setLayoutProperty(layer.id, 'visibility', 'none');
      });
      Object.entries(deformationLayerState || {}).forEach(([id, visibility]) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
      });
      map.easeTo({ center, zoom: 12.1, pitch: terrainEnabled ? 57 : 0, bearing: -18, duration: 400 });
    }
    deformationMode = false;
    deformationLayerState = null;
    $$('.layer-list input, .year-button').forEach((control) => { control.disabled = false; });
  }
}

function openDeformationTimeline() {
  timeline.hidden = false;
  timeline.classList.add('open');
  $('#timelineStatus').textContent = 'Memuat arsip citra…';
  setDeformationMode(true);
}

function closeDeformationTimeline() {
  clearInterval(timelinePlayTimer);
  timelinePlayTimer = null;
  $('#timelinePlay').classList.remove('playing');
  $('#timelinePlay span').textContent = 'Putar';
  setDeformationMode(false);
  timeline.hidden = true;
  timeline.classList.remove('open');
}

async function showTimelineYear(year) {
  setTimelineYear(year);
  const requestId = ++timelineRequest;
  $('#timelineStatus').textContent = `Memuat citra Wayback ${year}…`;
  try {
    const itemsByYear = await getWaybackItemsByYear();
    if (requestId !== timelineRequest || !deformationMode) return;
    const item = itemsByYear.get(year);
    if (!item) { $('#timelineStatus').textContent = `Arsip citra ${year} tidak tersedia`; return; }
    const layerId = `wayback-${year}`;
    if (!map.getSource(layerId)) {
      const tileTemplate = item.itemURL.replaceAll('{level}', '{z}').replaceAll('{row}', '{y}').replaceAll('{col}', '{x}');
      map.addSource(layerId, { type: 'raster', tiles: [tileTemplate], tileSize: 256, attribution: `World Imagery Wayback © Esri · snapshot ${item.releaseDate}` });
      map.addLayer({ id: layerId, type: 'raster', source: layerId, layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.12, 'raster-brightness-max': selectedTheme === 'dark' ? 0.76 : 1 } });
    }
    if (requestId !== timelineRequest || !deformationMode) return;
    map.getStyle().layers.forEach((layer) => {
      if (layer.id.startsWith('wayback-')) map.setLayoutProperty(layer.id, 'visibility', layer.id === layerId ? 'visible' : 'none');
    });
    map.setLayoutProperty('satellite', 'visibility', 'none');
    $('#timelineStatus').textContent = `${year} · arsip ${item.releaseDate}`;
  } catch (error) {
    if (requestId !== timelineRequest) return;
    $('#timelineStatus').textContent = 'Arsip Wayback gagal dimuat · periksa koneksi';
    console.warn('World Imagery Wayback:', error);
    if (deformationMode && map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', 'visible');
  }
}

$$('#timelineYears button').forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('selected'))));
$('#closeTimeline').addEventListener('click', closeDeformationTimeline);
$('#timelineYears').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-year]');
  if (button) showTimelineYear(Number(button.dataset.year));
});
$('#timelineSlider').addEventListener('input', (event) => showTimelineYear(Number(event.target.value)));
$('#timelinePrevious').addEventListener('click', () => showTimelineYear(Math.max(2017, selectedTimelineYear - 1)));
$('#timelineNext').addEventListener('click', () => showTimelineYear(Math.min(2023, selectedTimelineYear + 1)));
$('#timelinePlay').addEventListener('click', () => {
  if (timelinePlayTimer) {
    clearInterval(timelinePlayTimer);
    timelinePlayTimer = null;
    $('#timelinePlay').classList.remove('playing');
    $('#timelinePlay span').textContent = 'Putar';
    return;
  }
  $('#timelinePlay').classList.add('playing');
  $('#timelinePlay span').textContent = 'Jeda';
  timelinePlayTimer = setInterval(() => showTimelineYear(selectedTimelineYear >= 2023 ? 2017 : selectedTimelineYear + 1), 1800);
});


