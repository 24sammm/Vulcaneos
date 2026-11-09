import * as THREE from 'three';

(() => {
  const canvas = document.querySelector('#patrolCanvas');
  const $ = (selector) => document.querySelector(selector);
  const state = { mode: 'ready', score: 0, samples: 0, lives: 3, time: 30, elapsed: 0, checkpoint: 0, quizCorrect: 0, quizTotal: 0, spawn: 0, last: 0, best: 0 };
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

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8caeb1');
  scene.fog = new THREE.FogExp2('#6f979b', 0.0068);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
  camera.position.set(0, 15, 27);

  scene.add(new THREE.HemisphereLight('#dbe9df', '#183d44', 2.0));
  const sun = new THREE.DirectionalLight('#ffe0ae', 3.5);
  sun.position.set(-28, 48, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35; sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  const waterUniforms = { uTime: { value: 0 } };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; uniform float uTime; float wave(vec2 p){return sin(p.x*.17+uTime*.72)*.20+sin(p.y*.12-uTime*.53)*.15+sin((p.x+p.y)*.34-uTime*1.12)*.045+sin(p.x*.48-p.y*.31+uTime*.84)*.018;} void main(){vec3 p=position; float h=wave(p.xy); float e=.08; float dx=(wave(p.xy+vec2(e,0.))-wave(p.xy-vec2(e,0.)))/(2.*e); float dy=(wave(p.xy+vec2(0.,e))-wave(p.xy-vec2(0.,e)))/(2.*e); p.z=h; vNormal=normalize(normalMatrix*vec3(-dx,-dy,1.)); vUv=uv; vec4 world=modelMatrix*vec4(p,1.); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; uniform float uTime; void main(){float d=clamp(vUv.y,0.,1.); vec3 deep=vec3(.012,.09,.14); vec3 mid=vec3(.025,.22,.27); vec3 shallow=vec3(.22,.43,.42); vec3 col=mix(deep,mid,smoothstep(0.,.62,d)); col=mix(col,shallow,smoothstep(.54,1.,d)*.72); float n1=sin(vWorld.x*.67+vWorld.z*.33+uTime*.8); float n2=sin(vWorld.x*.31-vWorld.z*.74-uTime*.48); float n3=sin(vWorld.x*1.1+vWorld.z*.95-uTime*.63); float crest=n1*n2; float foam=smoothstep(.76,.96,crest+n3*.12); vec3 lightDir=normalize(vec3(-.42,.8,.34)); float diffuse=max(dot(normalize(vNormal),lightDir),0.); float fres=pow(1.-max(dot(normalize(cameraPosition-vWorld),normalize(vNormal)),0.),3.); col*=.68+diffuse*.42; col=mix(col,vec3(.58,.76,.72),foam*.22); col+=vec3(.16,.24,.21)*fres; float shimmer=smoothstep(.91,.995,crest)*smoothstep(.1,.85,d); col=mix(col,vec3(.79,.86,.76),shimmer*.34); gl_FragColor=vec4(col,1.);}`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(500, 800, 120, 150), waterMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.45;
  ocean.receiveShadow = false;
  scene.add(ocean);

  function material(color, roughness = 0.6, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
  const islandGroup = new THREE.Group();
  scene.add(islandGroup);
  function createVolcanicTexture() {
    const canvasTextureSource = document.createElement('canvas');
    canvasTextureSource.width = 512; canvasTextureSource.height = 512;
    const ctx = canvasTextureSource.getContext('2d');
    const image = ctx.createImageData(512, 512);
    for (let i = 0; i < image.data.length; i += 4) {
      const grain = Math.random() * 40 - 20;
      const strata = Math.sin(Math.floor(i / 4 / 512) * .24) * 8;
      const value = 166 + grain + strata;
      image.data[i] = value; image.data[i + 1] = value * .98; image.data[i + 2] = value * .91; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    for (let i = 0; i < 120; i += 1) {
      const y = Math.random() * 512;
      ctx.strokeStyle = `rgba(36,31,27,${Math.random() * .13})`;
      ctx.lineWidth = .4 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(Math.random() * 512, y); ctx.lineTo(Math.random() * 512, y + (Math.random() - .5) * 18); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvasTextureSource);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.4, 2.4);
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return texture;
  }
  const volcanicTexture = createVolcanicTexture();
  function createIslandGeometry(main, baseRadius, peakHeight) {
    const radialSegments = 96, rings = 32;
    const vertices = [], colors = [], uvs = [], indices = [];
    const green = new THREE.Color(main ? '#344d3c' : '#536b46');
    const ash = new THREE.Color(main ? '#665449' : '#776955');
    const darkRock = new THREE.Color('#403c37');
    const color = new THREE.Color();
    for (let ring = 0; ring <= rings; ring += 1) {
      const r = ring / rings;
      for (let segment = 0; segment <= radialSegments; segment += 1) {
        const a = segment / radialSegments * Math.PI * 2;
        const edge = 1 + .025 * Math.sin(a * 5 + .4) + .018 * Math.sin(a * 11 - .8) + .012 * Math.cos(a * 17);
        const radial = r * edge;
        const x = Math.cos(a) * baseRadius * radial;
        const z = Math.sin(a) * baseRadius * radial;
        let y = peakHeight * Math.pow(Math.max(0, 1 - radial), main ? .79 : .68);
        if (main && radial < .08) y = 7.15 + .18 * Math.sin(a * 4 + radial * 24);
        else if (main && radial < .145) {
          const t = THREE.MathUtils.smoothstep(radial, .08, .145);
          y = THREE.MathUtils.lerp(7.15, 9.35, t);
        }
        const rough = (.13 * Math.sin(a * 13 + radial * 31) + .08 * Math.sin(a * 27 - radial * 53) + .045 * Math.cos(a * 41 + radial * 75)) * Math.sin(Math.PI * Math.min(1, radial * 1.6));
        y = Math.max(-.28, y + rough);
        vertices.push(x, y, z);
        const vegetation = main ? THREE.MathUtils.smoothstep(radial, .69, .9) * (1 - THREE.MathUtils.smoothstep(y, 1.1, 3.2)) : THREE.MathUtils.smoothstep(radial, .18, .56) * (1 - THREE.MathUtils.smoothstep(y, 2.9, 4.5));
        const exposed = THREE.MathUtils.smoothstep(y, 3.2, 8.8);
        color.copy(ash).lerp(green, vegetation * .86).lerp(darkRock, exposed * .42 + Math.max(0, rough) * .18);
        const fleck = .91 + .09 * Math.sin(a * 39 + radial * 150);
        colors.push(color.r * fleck, color.g * fleck, color.b * fleck);
        uvs.push(segment / radialSegments * 3, r * 3);
      }
    }
    const row = radialSegments + 1;
    for (let ring = 0; ring < rings; ring += 1) for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = ring * row + segment, b = a + row, c = b + 1, d = a + 1;
      indices.push(a, c, b, a, d, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  const islandMaterial = new THREE.MeshStandardMaterial({ map: volcanicTexture, vertexColors: true, roughness: .96, metalness: .015, flatShading: false });
  function makeIsland(x, z, scale, main = false) {
    const island = new THREE.Group();
    island.position.set(x, -0.45, z);
    island.userData.relativeZ = z;
    island.scale.setScalar(scale);
    const terrain = new THREE.Mesh(createIslandGeometry(main, main ? 11.2 : 6.4, main ? 10.6 : 4.9), islandMaterial);
    terrain.castShadow = true; terrain.receiveShadow = true; island.add(terrain);
    if (main) {
      const crater = new THREE.Mesh(new THREE.TorusGeometry(1.48, .28, 12, 56), material('#4b4039', .95));
      crater.rotation.x = Math.PI / 2; crater.position.y = 9.18; crater.castShadow = true; island.add(crater);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(1.18, 48), material('#282d29', .98, { emissive: '#48291d', emissiveIntensity: .24 }));
      inner.rotation.x = -Math.PI / 2; inner.position.set(0, 7.18, 0); island.add(inner);
      const lava = new THREE.Mesh(new THREE.TorusGeometry(1.14, .035, 6, 48), new THREE.MeshBasicMaterial({ color: '#d58a57', transparent: true, opacity: .42 }));
      lava.rotation.x = Math.PI / 2; lava.position.y = 7.2; island.add(lava);
      createLavaFissures(island);
      createSmoke(island);
    }
    islandGroup.add(island);
    return island;
  }
  function createLavaFissures(parent) {
    const fissureMaterial = new THREE.MeshStandardMaterial({ color: '#774b38', roughness: .98, emissive: '#b85732', emissiveIntensity: .16 });
    for (const side of [-1, 1]) {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * .92, 8.5, .15),
        new THREE.Vector3(side * 1.55, 7.4, .3),
        new THREE.Vector3(side * 2.2, 6.2, .62),
        new THREE.Vector3(side * 2.65, 4.9, 1.18),
      ]);
      const fissure = new THREE.Mesh(new THREE.TubeGeometry(path, 18, .045, 5, false), fissureMaterial);
      fissure.castShadow = true; parent.add(fissure);
    }
  }
  function createSmokeTexture() {
    const source = document.createElement('canvas'); source.width = source.height = 128;
    const ctx = source.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(230,232,224,.54)'); gradient.addColorStop(.34, 'rgba(204,210,205,.34)'); gradient.addColorStop(.72, 'rgba(174,185,183,.12)'); gradient.addColorStop(1, 'rgba(150,165,163,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i += 1) { ctx.fillStyle = `rgba(230,234,230,${Math.random() * .025})`; ctx.beginPath(); ctx.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 12, 0, Math.PI * 2); ctx.fill(); }
    return new THREE.CanvasTexture(source);
  }
  const smokeTexture = createSmokeTexture();
  function createSmoke(parent) {
    const smoke = new THREE.Group();
    for (let i = 0; i < 11; i += 1) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, color: '#d5d9d4', transparent: true, opacity: .18, depthWrite: false, blending: THREE.NormalBlending }));
      puff.position.set(Math.sin(i * 1.9) * .55, 10.7 + i * .62, Math.cos(i * 1.2) * .48);
      puff.scale.set(1.1, 1.25, 1); smoke.add(puff);
      puff.userData.seed = i; puff.userData.baseScale = .65 + i * .115;
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
  boatHullShape.moveTo(-1.12, -1.78);
  boatHullShape.quadraticCurveTo(-1.28, -.15, -.82, 1.05);
  boatHullShape.quadraticCurveTo(-.42, 1.76, 0, 2.18);
  boatHullShape.quadraticCurveTo(.42, 1.76, .82, 1.05);
  boatHullShape.quadraticCurveTo(1.28, -.15, 1.12, -1.78);
  boatHullShape.quadraticCurveTo(0, -2.08, -1.12, -1.78);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(boatHullShape, { depth: .7, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: .14, bevelThickness: .13, curveSegments: 12 }), material('#e4e1d3', .27, { metalness: .16, clearcoat: .5 }));
  hull.rotation.x = -Math.PI / 2; hull.position.y = -.02; hull.castShadow = true; hull.receiveShadow = true; boat.add(hull);
  const waterline = hull.clone();
  waterline.scale.set(.995, .62, 1.008); waterline.position.y = .04;
  waterline.material = material('#315d60', .3, { metalness: .2 }); boat.add(waterline);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.68, .12, 2.68), material('#d2b98f', .68));
  deck.position.set(0, .48, -.13); deck.castShadow = true; boat.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.12, .76, 1.02), material('#eee9db', .32, { clearcoat: .35 }));
  cabin.position.set(0, .96, -.12); cabin.castShadow = true; boat.add(cabin);
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#347078', metalness: .18, roughness: .14, clearcoat: 1, transparent: true, opacity: .94, emissive: '#16484d', emissiveIntensity: .2 });
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(.84, .3, .035), glassMaterial);
  frontWindow.position.set(0, 1.09, -.65); boat.add(frontWindow);
  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(.035, .27, .52), glassMaterial);
    sideWindow.position.set(side * .57, 1.09, -.12); boat.add(sideWindow);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.34, .13, 1.25), material('#31594f', .38, { clearcoat: .42 }));
  roof.position.set(0, 1.39, -.12); roof.castShadow = true; boat.add(roof);
  const roofLip = new THREE.Mesh(new THREE.BoxGeometry(1.42, .045, 1.32), material('#d2b98f', .5));
  roofLip.position.set(0, 1.32, -.12); boat.add(roofLip);
  const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(.72, .1, .58), material('#d2b98f', .6));
  bowDeck.position.set(0, .48, 1.22); bowDeck.rotation.x = -.16; boat.add(bowDeck);
  const mast = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 1.12, 8), material('#d5d8c8', .35));
  pole.position.y = .55; mast.add(pole);
  const mastLight = new THREE.Mesh(new THREE.SphereGeometry(.105, 12, 10), new THREE.MeshStandardMaterial({ color: '#e9c17e', emissive: '#ca8a48', emissiveIntensity: 1.2 }));
  mastLight.position.y = 1.15; mast.add(mastLight); mast.position.set(0, 1.45, -.85); boat.add(mast);
  const railMaterial = material('#e2ded0', .28, { metalness: .5 });
  for (const side of [-1, 1]) {
    const railPath = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .85, .66, -1.45), new THREE.Vector3(side * .92, .68, -.55), new THREE.Vector3(side * .83, .67, .38), new THREE.Vector3(side * .54, .62, 1.35)]);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(railPath, 24, .025, 7, false), railMaterial); boat.add(rail);
    for (const [x, z] of [[side * .86, -1.15], [side * .91, -.35], [side * .78, .55], [side * .56, 1.2]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.022, .03, .2, 8), railMaterial);
      post.position.set(x, .57, z); boat.add(post);
    }
    const porthole = new THREE.Mesh(new THREE.TorusGeometry(.105, .025, 8, 20), railMaterial);
    porthole.rotation.y = Math.PI / 2; porthole.position.set(side * .585, .88, -.42); boat.add(porthole);
    const portholeGlass = new THREE.Mesh(new THREE.CircleGeometry(.08, 20), glassMaterial);
    portholeGlass.rotation.y = side * Math.PI / 2; portholeGlass.position.set(side * .59, .88, -.42); boat.add(portholeGlass);
  }
  const lifebuoy = new THREE.Mesh(new THREE.TorusGeometry(.19, .055, 10, 28), material('#c9784f', .5));
  lifebuoy.position.set(.48, .58, -.98); lifebuoy.rotation.x = Math.PI / 2; boat.add(lifebuoy);
  const wake = new THREE.Group();
  const wakeLines = [];
  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#b9ded4', transparent: true, opacity: .4, depthWrite: false }));
    wake.add(line); wakeLines.push({ line, side });
  }
  boat.add(wake);
  boat.scale.setScalar(1.16);
  const boatState = { x: 0, z: 1, vx: 0, vz: 0, invulnerable: 0, bob: 0 };
  function updateWake(time) {
    wakeLines.forEach(({ line, side }, index) => {
      const points = [];
      for (let i = 0; i <= 12; i += 1) {
        const t = i / 12;
        const spread = .68 + t * 1.75;
        const ripple = Math.sin(time * 2.2 - t * 7 + index) * .045;
        points.push(new THREE.Vector3(side * (spread + ripple), -.105, 1.35 + t * 5.4));
      }
      line.geometry.setFromPoints(points);
      line.material.opacity = .34 + .08 * Math.sin(time * 2.7 + index);
    });
  }

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
    state.mode = 'running'; state.score = 0; state.samples = 0; state.lives = 3; state.time = 30; state.elapsed = 0; state.checkpoint = 0; state.quizCorrect = 0; state.quizTotal = 0; state.spawn = 0;
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
    const acceleration = 42;
    boatState.vx = THREE.MathUtils.damp(boatState.vx, xAxis * 12.5, xAxis ? acceleration / 5 : 8, dt);
    boatState.vz = -12;
    boatState.x = THREE.MathUtils.clamp(boatState.x + boatState.vx * dt, -14, 14);
    boatState.z += boatState.vz * dt;
    boatState.bob += dt;
    boatState.invulnerable = Math.max(0, boatState.invulnerable - dt);
    boat.position.set(boatState.x, Math.sin(boatState.bob * 3.1) * .12, boatState.z);
    boat.rotation.y = THREE.MathUtils.damp(boat.rotation.y, -boatState.vx * .014, 4, dt);
    boat.rotation.z = THREE.MathUtils.damp(boat.rotation.z, -boatState.vx * .012, 3, dt);
    updateWake(state.elapsed);
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
      if (smoke) smoke.children.forEach((puff) => {
        const visualTime = now * .001;
        const phase = (visualTime * .22 + puff.userData.seed * .091) % 1;
        puff.position.x = Math.sin(visualTime * .42 + puff.userData.seed * 1.7) * (.28 + phase * .7);
        puff.position.y = 10.2 + phase * 8.5;
        puff.position.z = Math.cos(visualTime * .31 + puff.userData.seed) * (.22 + phase * .45);
        puff.material.opacity = .19 * Math.sin(Math.PI * phase);
        const puffScale = puff.userData.baseScale * (.72 + phase * 1.35);
        puff.scale.set(puffScale * 1.2, puffScale * 1.5, 1);
      });
    });
    ocean.position.x = boatState.x;
    ocean.position.z = boatState.z - 80;
    if (state.mode !== 'running') {
      boat.position.y = Math.sin(now * .0015) * .11;
      updateWake(now * .0015);
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
