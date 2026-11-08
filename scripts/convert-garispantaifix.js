// Convert the supplied Krakatau transects to WGS84 for MapLibre.
// The source declares EPSG:32648, but its negative northings use the
// southern UTM 48 grid with the 10,000,000 m false northing omitted.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'JSON/GarisPantaifix.geojson');
const outputPath = path.join(root, 'JSON/GarisPantaifix_WGS84.geojson');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function utm48sToLonLat([x, rawY]) {
  const a = 6378137;
  const eccSquared = 0.0066943799901413165;
  const k0 = 0.9996;
  const y = rawY + 10_000_000;
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const m = (y - 10_000_000) / k0;
  const mu = m / (a * (1 - eccSquared / 4 - 3 * eccSquared ** 2 / 64 - 5 * eccSquared ** 3 / 256));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const ep2 = eccSquared / (1 - eccSquared);
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1) ** 2);
  const r1 = a * (1 - eccSquared) / (1 - eccSquared * Math.sin(phi1) ** 2) ** 1.5;
  const d = (x - 500000) / (n1 * k0);
  const latitude = phi1 - (n1 * Math.tan(phi1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720);
  const longitude = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1);
  return [longitude * 180 / Math.PI + 105, latitude * 180 / Math.PI];
}

if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
  throw new Error('GarisPantaifix.geojson must be a GeoJSON FeatureCollection.');
}
const output = {
  type: 'FeatureCollection',
  name: 'GarisPantaifix_WGS84',
  features: source.features.map((feature) => ({
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map(utm48sToLonLat),
    },
  })),
};
fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(`Converted ${output.features.length} features to ${path.relative(root, outputPath)}.`);
