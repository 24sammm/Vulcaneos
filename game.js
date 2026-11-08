import * as THREE from 'three';

(() => {
  const canvas = document.querySelector('#patrolCanvas');
  const $ = (selector) => document.querySelector(selector);
  const state = { mode: 'ready', score: 0, samples: 0, lives: 3, time: 40, elapsed: 0, checkpoint: 0, quizCorrect: 0, quizTotal: 0, spawn: 0, last: 0, best: 0 };
  const keys = new Set();
  const pointer = new Set();
  const objects = [];
  const effects = [];
  const quizzes = [
    { q: 'Pada perbandingan Before-After, citra 2017 mewakili periode apa?', a: ['Pra-erupsi', 'Pasca-erupsi', 'Prediksi'], correct: 0, why: '2017 menjadi kondisi pra-erupsi, sedangkan 2019 menjadi pembanding pasca-erupsi.' },
    { q: 'Nilai EPR negatif pada garis pantai umumnya menunjukkan apa?', a: ['Akresi ke laut', 'Erosi dan garis pantai mundur', 'Tidak ada perubahan'], correct: 1, why: 'EPR negatif menunjukkan garis pantai mundur ke darat atau mengalami erosi.' },
    { q: 'Zona Normal pada simulasi WebGIS berada pada radius berapa?', a: ['0-3 km', '3-5 km', '5-8 km'], correct: 0, why: 'Pada simulasi visual, zona Normal ditampilkan pada radius 0-3 km.' },
    { q: 'Klorofil-a di perairan menjadi indikator yang berkaitan dengan apa?', a: ['Fitoplankton', 'Kedalaman kawah', 'Kecepatan kapal'], correct: 0, why: 'Klorofil-a digunakan sebagai indikator terkait keberadaan fitoplankton.' },
    { q: 'EPR pada analisis transek garis pantai dinyatakan dalam satuan apa?', a: ['Meter', 'Meter per tahun', 'Hektare'], correct: 1, why: 'EPR mengukur laju perubahan garis pantai dalam meter per tahun.' },
    { q: 'TSS adalah singkatan untuk parameter apa?', a: ['Total Suspended Solids', 'Tropical Sea Surface', 'Tidal Shoreline Survey'], correct: 0, why: 'TSS adalah Total Suspended Solids, yaitu material padatan tersuspensi dalam air.' },
    { q: 'Zona Awas pada simulasi jarak ditampilkan pada radius berapa?', a: ['0-3 km', '3-5 km', '5-8 km'], correct: 2, why: 'Zona Awas pada simulasi visual ditampilkan pada radius 5-8 km.' },
    { q: 'Apa arti umum garis pantai bergerak ke arah laut?', a: ['Akresi', 'Erosi', 'Subsiden'], correct: 0, why: 'Garis pantai yang bergerak ke arah laut menunjukkan akresi atau penambahan daratan.' },
  ];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    console.error('WebGL tidak tersedia:', error);
    $('#overlayKicker').textContent = 'GRAFIS 3D TIDAK TERSEDIA';
    $('#overlayTitle').textContent = 'Perangkat belum mendukung 3D.';
    $('#overlayText').textContent = 'Coba buka halaman ini di browser dengan akselerasi grafis aktif.';
    $('#startGame').hidden = true;
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8caeb1');
  scene.fog = new THREE.FogExp2('#6f979b', 0.0095);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 800);
  camera.position.set(0, 15, 27);

  scene.add(new THREE.HemisphereLight('#dbe9df', '#183d44', 2.0));
  const sun = new THREE.DirectionalLight('#ffe0ae', 3.5);
  sun.position.set(-28, 48, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35; sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  const waterUniforms = { uTime: { value: 0 } };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; uniform float uTime; void main(){ vec3 p=position; float a=sin(p.x*0.20+uTime*1.05)*0.13; float b=sin(p.y*0.13-uTime*0.72)*0.18; float c=sin((p.x+p.y)*0.42-uTime*1.7)*0.035; p.z+=a+b+c; vUv=uv; vec4 world=modelMatrix*vec4(p,1.0); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vWorld; uniform float uTime; void main(){ float d=clamp(vUv.y,0.0,1.0); vec3 deep=vec3(0.025,0.16,0.21); vec3 shallow=vec3(0.20,0.43,0.43); vec3 col=mix(deep,shallow,smoothstep(0.0,0.82,d)*0.72); float w1=sin(vWorld.x*0.55+vWorld.z*0.38+uTime*1.4); float w2=sin(vWorld.x*0.27-vWorld.z*0.71-uTime*0.8); float glint=smoothstep(0.90,0.99,w1*w2); col=mix(col,vec3(0.69,0.82,0.75),glint*0.23); float fres=pow(1.0-abs(dot(normalize(cameraPosition-vWorld),vec3(0.0,1.0,0.0))),2.0); col+=vec3(0.09,0.14,0.12)*fres; gl_FragColor=vec4(col,1.0); }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(500, 800, 1, 1), waterMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.45;
  ocean.receiveShadow = true;
  scene.add(ocean);

  function material(color, roughness = 0.6, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
  const islandGroup = new THREE.Group();
  scene.add(islandGroup);
  function makeIsland(x, z, scale, main = false) {
    const island = new THREE.Group();
    island.position.set(x, -0.45, z);
    island.userData.relativeZ = z;
    island.scale.setScalar(scale);
    const shore = new THREE.Mesh(new THREE.CylinderGeometry(main ? 8.7 : 4.2, main ? 11 : 6, 1.5, 16), material('#71846a', 0.95));
    shore.position.y = 0.42; shore.receiveShadow = true; shore.castShadow = true; island.add(shore);
    const slope = new THREE.Mesh(new THREE.ConeGeometry(main ? 6.4 : 2.3, main ? 8.8 : 3.2, 9, 5), material(main ? '#60473c' : '#55644c', 0.93));
    slope.position.y = main ? 5.1 : 2.2; slope.castShadow = true; slope.receiveShadow = true; island.add(slope);
    const greenCap = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), material('#49664b', 0.98));
    greenCap.scale.set(main ? 6.0 : 3.6, .62, main ? 7.6 : 4.5); greenCap.position.y = .98; island.add(greenCap);
    if (main) {
      const crater = new THREE.Mesh(new THREE.TorusGeometry(1.22, .18, 8, 30), material('#9d7154', .85));
      crater.rotation.x = Math.PI / 2; crater.position.y = 9.3; island.add(crater);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(1.13, 24), material('#282d29', .98, { emissive: '#5c301f', emissiveIntensity: .45 }));
      inner.rotation.x = -Math.PI / 2; inner.position.set(0, 9.22, 0); island.add(inner);
      const lava = new THREE.Mesh(new THREE.TorusGeometry(1.38, .055, 5, 32), new THREE.MeshBasicMaterial({ color: '#d28a54', transparent: true, opacity: .7 }));
      lava.rotation.x = Math.PI / 2; lava.position.y = 9.22; island.add(lava);
      createSmoke(island, main);
    }
    islandGroup.add(island);
    return island;
  }
  function createSmoke(parent) {
    const smoke = new THREE.Group();
    for (let i = 0; i < 7; i += 1) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.42 + Math.random() * .38, 1), new THREE.MeshStandardMaterial({ color: '#d3d2c8', transparent: true, opacity: .2, roughness: 1, depthWrite: false }));
      puff.position.set(Math.sin(i * 1.9) * .45, 10.7 + i * .85, Math.cos(i * 1.2) * .38);
      puff.scale.set(1.15, .82, 1.1); smoke.add(puff);
      puff.userData.seed = i;
    }
    parent.add(smoke);
    smoke.userData.smoke = true;
  }
  makeIsland(0, -100, 1.12, true);
  makeIsland(-31, -83, 1.2);
  makeIsland(31, -76, 1.65);
  makeIsland(44, -130, 1.1);

  const boat = new THREE.Group();
  scene.add(boat);
  const boatHullShape = new THREE.Shape();
  boatHullShape.moveTo(-1.08, -1.8); boatHullShape.lineTo(1.08, -1.8); boatHullShape.lineTo(.88, .5); boatHullShape.lineTo(.57, 1.35); boatHullShape.lineTo(0, 2.12); boatHullShape.lineTo(-.57, 1.35); boatHullShape.lineTo(-.88, .5); boatHullShape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(boatHullShape, { depth: .58, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .09, bevelThickness: .11 }), material('#d6a76c', .3, { metalness: .22 }));
  hull.rotation.x = -Math.PI / 2; hull.position.y = -.02; hull.castShadow = true; hull.receiveShadow = true; boat.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.72, .17, 2.25), material('#eee9d9', .48));
  deck.position.set(0, .48, -.18); deck.castShadow = true; boat.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, .8, .95), material('#f0eee2', .35));
  cabin.position.set(0, .94, -.1); cabin.castShadow = true; boat.add(cabin);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(1.12, .36, .06), new THREE.MeshStandardMaterial({ color: '#315c60', metalness: .18, roughness: .2, emissive: '#3c8585', emissiveIntensity: .16 }));
  windows.position.set(0, 1.03, -.59); boat.add(windows);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, .12, 1.12), material('#315c50', .4));
  roof.position.set(0, 1.4, -.1); roof.castShadow = true; boat.add(roof);
  const mast = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 1.12, 8), material('#d5d8c8', .35));
  pole.position.y = .55; mast.add(pole);
  const mastLight = new THREE.Mesh(new THREE.SphereGeometry(.105, 12, 10), new THREE.MeshStandardMaterial({ color: '#e9c17e', emissive: '#ca8a48', emissiveIntensity: 1.2 }));
  mastLight.position.y = 1.15; mast.add(mastLight); mast.position.set(0, 1.45, -.85); boat.add(mast);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2.4, 6), material('#d9d8ca', .4));
    rail.rotation.x = Math.PI / 2; rail.position.set(side * .86, .58, -.18); boat.add(rail);
  }
  const wake = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.72 + i * .28, .025, 5, 40), new THREE.MeshBasicMaterial({ color: '#c3dfd0', transparent: true, opacity: .22 - i * .03 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, -.15 - i * .012, 2.1 + i * .65); ring.scale.set(1, .38, 1); wake.add(ring);
  }
  boat.add(wake);
  const boatState = { x: 0, z: 1, vx: 0, vz: 0, invulnerable: 0, bob: 0 };

  function addBeacon(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const float = new THREE.Group();
    const pontoonMat = material('#d5aa6b', .29, { metalness: .12, clearcoat: .65 });
    for (const side of [-1, 1]) {
      const pontoon = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .92, 5, 12), pontoonMat);
      pontoon.rotation.z = Math.PI / 2; pontoon.position.set(side * .55, .17, 0); pontoon.castShadow = true; float.add(pontoon);
      const trim = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .06, 16), material('#e7e5d7', .24, { metalness: .42 }));
      trim.rotation.x = Math.PI / 2; trim.position.set(side * .55, .17, -.48); float.add(trim);
    }
    const frameMat = material('#dce0d1', .25, { metalness: .62 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.045, .065, 1.6, 10), frameMat);
    mast.position.y = .92; mast.castShadow = true; float.add(mast);
    const canister = new THREE.Mesh(new THREE.CylinderGeometry(.3, .35, .78, 20, 1, false), new THREE.MeshPhysicalMaterial({ color: '#9ed8c9', roughness: .14, metalness: .06, transmission: .35, transparent: true, opacity: .76, clearcoat: .9, thickness: .45 }));
    canister.position.y = .9; canister.castShadow = true; float.add(canister);
    const sampleWater = new THREE.Mesh(new THREE.CylinderGeometry(.245, .27, .48, 18), new THREE.MeshPhysicalMaterial({ color: '#2599a0', roughness: .18, metalness: .08, emissive: '#126369', emissiveIntensity: .3, transparent: true, opacity: .94 }));
    sampleWater.position.y = .77; float.add(sampleWater);
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(.34, .31, .12, 20), material('#f1eee1', .22, { metalness: .3 }));
    topCap.position.y = 1.36; topCap.castShadow = true; float.add(topCap);
    const lowerBand = new THREE.Mesh(new THREE.TorusGeometry(.32, .035, 8, 24), material('#d8b47b', .22, { metalness: .4 }));
    lowerBand.rotation.x = Math.PI / 2; lowerBand.position.y = .56; float.add(lowerBand);
    const solar = new THREE.Mesh(new THREE.BoxGeometry(.82, .08, .48), new THREE.MeshStandardMaterial({ color: '#244e5b', roughness: .22, metalness: .28, emissive: '#1b5960', emissiveIntensity: .15 }));
    solar.position.set(0, 1.58, -.35); solar.rotation.x = -.12; solar.castShadow = true; float.add(solar);
    for (let i = -2; i <= 2; i += 1) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(.012, .083, .44), material('#8baea7', .25, { metalness: .22 }));
      cell.position.set(i * .15, 1.59, -.35); cell.rotation.x = -.12; float.add(cell);
    }
    const beaconLens = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#c5f1d6', emissive: '#62dfa8', emissiveIntensity: 2.2, roughness: .12 }));
    beaconLens.position.set(0, 1.6, .12); float.add(beaconLens);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.018, .026, .62, 7), frameMat);
    antenna.position.set(.38, 1.82, -.1); float.add(antenna);
    const light = new THREE.PointLight('#78e2b1', 1.4, 6); light.position.set(0, 1.8, .12); float.add(light);
    group.add(float);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, .025, 6, 48), new THREE.MeshBasicMaterial({ color: '#a1e1c4', transparent: true, opacity: .54 }));
    halo.rotation.x = Math.PI / 2; halo.position.y = -.02; group.add(halo);
    const ripple = new THREE.Mesh(new THREE.CircleGeometry(.72, 32), new THREE.MeshBasicMaterial({ color: '#91d4c0', transparent: true, opacity: .12, side: THREE.DoubleSide }));
    ripple.rotation.x = -Math.PI / 2; ripple.position.y = -.12; group.add(ripple);
    group.userData = { type: 'sample', halo, float, beaconLens, phase: Math.random() * 6.28, speed: 9.5 + Math.min(state.elapsed * .12, 5) };
    scene.add(group); objects.push(group);
  }

  function addHazard(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const position = geometry.attributes.position;
    const colors = [];
    const colorA = new THREE.Color('#393a35');
    const colorB = new THREE.Color('#886348');
    const colorC = new THREE.Color('#c28458');
    for (let i = 0; i < position.count; i += 1) {
      const x0 = position.getX(i), y0 = position.getY(i), z0 = position.getZ(i);
      const noise = .84 + .11 * Math.sin(i * 12.9898 + x0 * 31.7) + .065 * Math.sin(i * 5.37 + z0 * 19.2);
      position.setXYZ(i, x0 * noise, y0 * noise, z0 * noise);
      const t = THREE.MathUtils.clamp((y0 + .55) * .65 + Math.sin(i * 4.7) * .1, 0, 1);
      const shade = colorA.clone().lerp(colorB, t).lerp(colorC, Math.max(0, y0) * .12);
      colors.push(shade.r, shade.g, shade.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: .02 });
    const rock = new THREE.Mesh(geometry, rockMat);
    rock.scale.set(1.35, .88, 1.48); rock.rotation.set(Math.random() * .5, Math.random() * 6, Math.random() * .4); rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
    for (let i = 0; i < 9; i += 1) {
      const angle = i * 2.4;
      const pit = new THREE.Mesh(new THREE.SphereGeometry(.085 + (i % 3) * .025, 8, 6), new THREE.MeshStandardMaterial({ color: '#252d2c', roughness: 1 }));
      pit.position.set(Math.cos(angle) * (.48 + (i % 2) * .2), .35 + Math.sin(angle * 1.7) * .22, Math.sin(angle) * .54);
      pit.scale.set(1, .62, .7); pit.userData.ignoreCollision = true; group.add(pit);
    }
    const fissureMat = new THREE.MeshStandardMaterial({ color: '#d17a49', emissive: '#a84d2f', emissiveIntensity: .75, roughness: .7 });
    for (let i = 0; i < 3; i += 1) {
      const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-.28 + i * .14, .68, -.15), new THREE.Vector3(-.12 + i * .2, .77, .04), new THREE.Vector3(.03 + i * .16, .62, .23)]);
      const crack = new THREE.Mesh(new THREE.TubeGeometry(path, 7, .022, 4, false), fissureMat);
      group.add(crack);
    }
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.06, .035, 6, 36), new THREE.MeshBasicMaterial({ color: '#d19a68', transparent: true, opacity: .43 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = -.13; group.add(edge);
    const foam = new THREE.Mesh(new THREE.TorusGeometry(1.38, .045, 5, 36), new THREE.MeshBasicMaterial({ color: '#b5cfbf', transparent: true, opacity: .2 }));
    foam.rotation.x = Math.PI / 2; foam.position.y = -.2; foam.scale.set(1.15, .85, 1); group.add(foam);
    group.userData = { type: 'hazard', edge, foam, rock, speed: 12 + Math.min(state.elapsed * .14, 6), phase: Math.random() * 6 };
    scene.add(group); objects.push(group);
  }

  function clearObjects() {
    objects.splice(0).forEach((object) => { scene.remove(object); object.traverse((child) => { if (child.geometry && child.geometry !== boatHullShape) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose()); else child.material.dispose(); } }); });
  }

  function hud() {
    $('#sampleCount').textContent = String(state.samples).padStart(2, '0');
    $('#scoreCount').textContent = String(state.score).padStart(4, '0');
    $('#timeCount').innerHTML = `${Math.ceil(state.time)}<span>s</span>`;
    $('#lifeCount').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="fa-solid fa-heart"${i >= state.lives ? ' style="opacity:.22"' : ''}></i>`).join('');
    $('#bestCount').textContent = String(state.best).padStart(4, '0');
  }

  try { state.best = Number(localStorage.getItem('krakatau-patrol-best') || 0); } catch { state.best = 0; }
  function showOverlay(kicker, title, message, action, icon = 'fa-sailboat', photo = false) {
    $('#overlayKicker').textContent = kicker;
    $('#overlayTitle').textContent = title;
    $('#overlayText').textContent = message;
    $('#startGame').innerHTML = `${action} <i class="fa-solid fa-arrow-right"></i>`;
    $('#photoResultLink').hidden = !photo;
    $('.overlay-mark i').className = `fa-solid ${icon}`;
    $('#stageOverlay').classList.remove('is-hidden');
  }

  function startGame() {
    if (state.mode === 'paused') {
      state.mode = 'running';
      $('#stageOverlay').classList.add('is-hidden');
      $('#pauseGame').innerHTML = '<i class="fa-solid fa-pause"></i>';
      $('#pauseGame').setAttribute('aria-label', 'Jeda permainan');
      state.last = performance.now();
      return;
    }
    clearObjects();
    effects.splice(0).forEach((effect) => { scene.remove(effect); effect.geometry.dispose(); effect.material.dispose(); });
    state.mode = 'running'; state.score = 0; state.samples = 0; state.lives = 3; state.time = 40; state.elapsed = 0; state.checkpoint = 0; state.quizCorrect = 0; state.quizTotal = 0; state.spawn = 0;
    boatState.x = 0; boatState.z = 1; boatState.vx = 0; boatState.vz = 0; boatState.invulnerable = 0;
    keys.clear(); pointer.clear(); hud();
    $('#pauseGame').disabled = false;
    $('#pauseGame').innerHTML = '<i class="fa-solid fa-pause"></i>';
    $('#pauseGame').setAttribute('aria-label', 'Jeda permainan');
    $('#stageOverlay').classList.add('is-hidden');
    $('#checkpointModal').hidden = true;
    state.last = performance.now();
  }

  function pauseGame() {
    if (state.mode !== 'running') return;
    state.mode = 'paused'; keys.clear(); pointer.clear();
    $('#pauseGame').innerHTML = '<i class="fa-solid fa-play"></i>';
    $('#pauseGame').setAttribute('aria-label', 'Lanjutkan permainan');
    showOverlay('PATROLI DIJEDA', 'Ambil jeda sejenak.', `Sampel ${state.samples} - Skor ${state.score}. Lanjutkan saat siap.`, 'Lanjutkan', 'fa-pause');
  }

  function finishGame(reason) {
    if (state.mode !== 'running') return;
    state.mode = 'ended'; keys.clear(); pointer.clear(); $('#pauseGame').disabled = true;
    const fresh = state.score > state.best;
    if (fresh) { state.best = state.score; try { localStorage.setItem('krakatau-patrol-best', String(state.best)); } catch { /* Skor lokal tetap tersedia untuk sesi ini. */ } }
    hud();
    const result = { score: state.score, samples: state.samples, quizCorrect: state.quizCorrect, quizTotal: state.quizTotal, date: new Date().toISOString() };
    try { localStorage.setItem('krakatau-last-patrol', JSON.stringify(result)); } catch { /* Hasil tetap ditampilkan pada layar. */ }
    showOverlay('MISI SELESAI', fresh ? 'Catatan patroli terbaik.' : reason, `${state.samples} sampel terkumpul · Skor ${state.score} · Jawaban checkpoint benar ${state.quizCorrect}/${state.quizTotal}.`, 'Patroli lagi', 'fa-award', true);
    announce(`Patroli selesai. Skor ${state.score}. Foto hasil tersedia.`);
  }

  function announce(message) { $('#gameAnnouncement').textContent = message; }
  function checkpoint() {
    state.mode = 'checkpoint'; keys.clear(); pointer.clear(); state.quizTotal += 1;
    const q = quizzes[state.checkpoint % quizzes.length];
    $('#checkpointNumber').textContent = String(state.checkpoint + 1).padStart(2, '0');
    $('#checkpointQuestion').textContent = q.q;
    $('#checkpointHint').textContent = 'Pilih jawaban yang paling tepat. Waktu patroli berhenti selama checkpoint.';
    $('#checkpointFeedback').hidden = true;
    $('#checkpointOptions').replaceChildren(...q.a.map((answer, index) => {
      const button = document.createElement('button');
      button.className = 'checkpoint-option'; button.type = 'button';
      button.innerHTML = `<span>${String.fromCharCode(65 + index)}</span>${answer}`;
      button.addEventListener('click', () => answerCheckpoint(index, q, button));
      return button;
    }));
    $('#checkpointModal').hidden = false;
  }

  function answerCheckpoint(index, question) {
    if (state.mode !== 'checkpoint') return;
    const buttons = [...document.querySelectorAll('.checkpoint-option')];
    buttons.forEach((button) => { button.disabled = true; });
    const correct = index === question.correct;
    buttons[question.correct].classList.add('is-right');
    if (!correct) buttons[index].classList.add('is-wrong');
    const feedback = $('#checkpointFeedback');
    feedback.hidden = false;
    feedback.classList.toggle('is-wrong', !correct);
    feedback.textContent = correct ? `Tepat. ${question.why}` : `Belum tepat. ${question.why}`;
    if (correct) { state.quizCorrect += 1; state.time = Math.min(90, state.time + 10); state.score += 250; announce('Jawaban benar. Waktu bertambah sepuluh detik dan bonus 250 poin.'); }
    else { state.time = Math.max(0, state.time - 5); announce('Jawaban belum tepat. Waktu patroli berkurang lima detik.'); }
    state.checkpoint += 1;
    hud();
    setTimeout(() => {
      $('#checkpointModal').hidden = true;
      if (state.time <= 0) { state.mode = 'running'; finishGame('Waktu patroli habis.'); return; }
      state.mode = 'running'; state.last = performance.now();
    }, 1250);
  }

  function spawn() {
    const x = (Math.random() * 2 - 1) * 12.5;
    const z = boatState.z - 52 - Math.random() * 13;
    if (Math.random() < .32) addHazard(x, z); else addBeacon(x, z);
  }

  function burst(position, color) {
    const count = 11;
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(.07 + Math.random() * .09, 7, 6), new THREE.MeshBasicMaterial({ color, transparent: true }));
      mesh.position.copy(position);
      mesh.userData = { velocity: new THREE.Vector3((Math.random() - .5) * 5, Math.random() * 3, (Math.random() - .5) * 5), life: .6 + Math.random() * .4 };
      scene.add(mesh); effects.push(mesh);
    }
  }

  function move(dt) {
    if (state.mode !== 'running') return;
    state.elapsed += dt;
    state.time = Math.max(0, state.time - dt);
    state.spawn += dt;
    if (state.spawn > .77) { state.spawn = 0; spawn(); }
    const xAxis = Number(keys.has('ArrowRight') || keys.has('d') || pointer.has('right')) - Number(keys.has('ArrowLeft') || keys.has('a') || pointer.has('left'));
    const acceleration = 35;
    boatState.vx = THREE.MathUtils.damp(boatState.vx, xAxis * 11, xAxis ? acceleration / 5 : 8, dt);
    boatState.vz = -8.5;
    boatState.x = THREE.MathUtils.clamp(boatState.x + boatState.vx * dt, -14, 14);
    boatState.z += boatState.vz * dt;
    boatState.bob += dt;
    boatState.invulnerable = Math.max(0, boatState.invulnerable - dt);
    boat.position.set(boatState.x, Math.sin(boatState.bob * 3.1) * .12, boatState.z);
    boat.rotation.y = THREE.MathUtils.damp(boat.rotation.y, -boatState.vx * .014, 4, dt);
    boat.rotation.z = THREE.MathUtils.damp(boat.rotation.z, -boatState.vx * .012, 3, dt);
    wake.children.forEach((ring, i) => { ring.material.opacity = .1 + .08 * Math.sin(boatState.bob * 3 - i * .7); ring.scale.x = .9 + .18 * Math.sin(boatState.bob * 2 + i); });
    boat.visible = boatState.invulnerable <= 0 || Math.floor(state.elapsed * 12) % 2 === 0;

    for (let i = objects.length - 1; i >= 0; i -= 1) {
      const object = objects[i];
      const data = object.userData;
      object.position.z += data.speed * dt;
      data.phase += dt * 2.4;
      if (data.type === 'sample') {
        data.float.position.y = Math.sin(data.phase) * .15;
        data.float.rotation.z = Math.sin(data.phase * .62) * .045;
        data.beaconLens.material.emissiveIntensity = 1.35 + (Math.sin(data.phase * 2) + 1) * .65;
        data.halo.material.opacity = .35 + .3 * (Math.sin(data.phase * 1.5) + 1) / 2;
        const haloScale = 1 + (Math.sin(data.phase * 1.5) + 1) * .1;
        data.halo.scale.set(haloScale, haloScale, 1);
        object.rotation.y += dt * .45;
      } else {
        object.rotation.y += dt * .35;
        object.position.y = Math.sin(data.phase) * .11;
        data.foam.material.opacity = .12 + (Math.sin(data.phase * 1.6) + 1) * .09;
        data.foam.scale.set(1.08 + Math.sin(data.phase) * .06, .84 + Math.sin(data.phase) * .04, 1);
      }
      const dx = object.position.x - boatState.x;
      const dz = object.position.z - boatState.z;
      if (dx * dx + dz * dz < (data.type === 'sample' ? 2.35 : 2.7) ** 2) {
        scene.remove(object); objects.splice(i, 1);
        if (data.type === 'sample') {
          state.samples += 1; state.score += 100;
          burst(object.position, '#8fd6b8');
          announce('Sampel laut berhasil diamankan.');
          if (state.samples % 5 === 0) { checkpoint(); break; }
        } else if (boatState.invulnerable <= 0) {
          state.lives -= 1; boatState.invulnerable = 1.65;
          burst(boat.position, '#dc9169');
          announce(`Kapal tersenggol material vulkanik. Sisa kondisi kapal ${state.lives}.`);
          if (state.lives <= 0) { hud(); finishGame('Kondisi kapal perlu pemulihan.'); return; }
        }
      } else if (object.position.z > boatState.z + 16) {
        scene.remove(object); objects.splice(i, 1);
      }
    }
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      effect.userData.life -= dt;
      effect.position.addScaledVector(effect.userData.velocity, dt);
      effect.userData.velocity.y -= 4 * dt;
      effect.material.opacity = Math.max(0, effect.userData.life);
      if (effect.userData.life <= 0) { scene.remove(effect); effect.geometry.dispose(); effect.material.dispose(); effects.splice(i, 1); }
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, boatState.x * .36, 2.2, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, boatState.z + 25, 2.2, dt);
    camera.lookAt(boatState.x * .18, 1.6, boatState.z - 13);
    hud();
    if (state.time <= 0) finishGame('Waktu patroli selesai.');
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', resize);

  function animate(now) {
    const dt = Math.min(.04, Math.max(0, (now - state.last) / 1000));
    state.last = now;
    waterUniforms.uTime.value += dt;
    if (state.mode === 'running') move(dt);
    islandGroup.children.forEach((island) => {
      island.position.z = boatState.z + island.userData.relativeZ;
      const smoke = island.children.find((child) => child.userData.smoke);
      if (smoke) smoke.children.forEach((puff) => { puff.position.x = Math.sin(state.elapsed * .7 + puff.userData.seed) * .52; puff.position.y = 10.8 + ((state.elapsed * .85 + puff.userData.seed * .65) % 6); puff.material.opacity = .14 + .09 * Math.sin(state.elapsed + puff.userData.seed); });
    });
    ocean.position.x = boatState.x;
    ocean.position.z = boatState.z - 80;
    if (state.mode !== 'running') {
      boat.position.y = Math.sin(now * .0015) * .11;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 1.4, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, 27, 1.4, dt);
      camera.lookAt(0, 1.6, -13);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  $('#startGame').addEventListener('click', startGame);
  $('#pauseGame').addEventListener('click', pauseGame);
  window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
    if (key === 'Escape' || key === ' ') { if (state.mode === 'running') pauseGame(); else if (state.mode === 'paused') startGame(); return; }
    keys.add(key);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  window.addEventListener('blur', () => { keys.clear(); pointer.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  document.querySelectorAll('[data-move]').forEach((button) => {
    const direction = button.dataset.move;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); pointer.add(direction); button.setPointerCapture?.(event.pointerId); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => button.addEventListener(type, () => pointer.delete(direction)));
  });
  hud(); resize(); state.last = performance.now(); requestAnimationFrame(animate);
})();
