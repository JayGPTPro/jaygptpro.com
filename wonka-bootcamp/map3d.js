/* ============================================================
   WONKA FACTORY MAP 3D . map3d.js (v2, compact diorama)
   One bright isometric game-board: the WHOLE factory reads in a
   single view, rooms sit close together, Wonka walks between
   them on click (or arrow keys). No scroll-walking.
   Contract: export mount(container, api, opts) -> controller.
   This module never touches CONFIG, DAYS, Supabase, or any DOM
   outside its container. Everything flows through `api`.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------- palette: a lit night set, not a dark night ---------- */
const C = {
  bgTop: 0x4FA9E8, bgBot: 0xC9EBFF,
  fogCol: 0xCDE9FB,
  grass: 0x67B944, grassDark: 0x4E9A33,
  groundTop: 0x67B944, groundEdge: 0xC9A26B, cliff: 0x7A4A28, cliffDeep: 0x4E2D14,
  wall: 0xFBF1DC, wallShade: 0xEFE0C2,
  choc: 0x2A1A12, chocDark: 0x1C110B, caramel: 0xB07A3F, doorWood: 0x5a3418,
  brass: 0xB87333, brassLight: 0xD99A5B, brassDark: 0x8A5424,
  gold: 0xF5B841, cream: 0xF3E9D2,
  tungsten: 0xFFD9A8, rim: 0x8FCBE8,
  raspberry: 0xE0356B, mint: 0x3ECFA3, sky: 0x6EC6E6,
  ink: 0x170D20, inkCoat: 0x241430, skin: 0xE4D5B8,
};

const DOOR_ENTER = 2.2;
const DOOR_EXIT = 3.4;
const WALK_SPEED = 7.5;          // world units per second (click-to-walk)

/* ============================================================
   REAL MODELED ASSETS (Track B) . CC0 packs under assets3d/
   Each day gets a distinct building silhouette; the colorway is
   picked to match the day's accent. Any load failure falls back
   to the procedural primitive building for that day only.
   ============================================================ */
const AST = 'assets3d/';
const HEX = AST + 'kaykit-medieval-hexagon/gltf/';
const BUILDING_DEFS = {
  1: 'home_A', 2: 'market', 3: 'home_B', 4: 'blacksmith', 5: 'windmill',
  6: 'watermill', 7: 'tavern', 8: 'lumbermill', 9: 'mine', 10: 'castle',
};
function colorwayFor(hex) {
  const c = new THREE.Color(hex || '#F5B841');
  const h = { r: 0xE0356B, g: 0x3ECFA3, b: 0x6EC6E6, y: 0xF5B841 };
  let best = 'neutral', bestD = 0.42;
  Object.entries({ red: h.r, green: h.g, blue: h.b, yellow: h.y }).forEach(([name, v]) => {
    const cc = new THREE.Color(v);
    const d = Math.pow(c.r - cc.r, 2) + Math.pow(c.g - cc.g, 2) + Math.pow(c.b - cc.b, 2);
    if (d < bestD) { bestD = d; best = name; }
  });
  return best;
}
const PROP_FILES = {
  mushroomRed: AST + 'kenney-nature-kit/Models/GLTF format/mushroom_red.glb',
  mushroomTall: AST + 'kenney-nature-kit/Models/GLTF format/mushroom_redTall.glb',
  mushroomGroup: AST + 'kenney-nature-kit/Models/GLTF format/mushroom_redGroup.glb',
  fountain: AST + 'kenney-fantasy-town/Models/GLB format/fountain-round-detail.glb',
  lantern: AST + 'kenney-fantasy-town/Models/GLB format/lantern.glb',
  cloudBig: HEX + 'decoration/nature/cloud_big.gltf',
  cloudSmall: HEX + 'decoration/nature/cloud_small.gltf',
  barrel: AST + 'quaternius-medieval-village/glb/Barrel.glb',
  crate: AST + 'quaternius-medieval-village/glb/Crate.glb',
};
async function loadRealAssets(themes) {
  const loader = new GLTFLoader();
  const jobs = [];
  const out = { buildings: {}, props: {} };
  const load = (url) => new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));
  for (let d = 1; d <= 10; d++) {
    const cw = colorwayFor((themes[d] || {}).accent);
    const url = HEX + 'buildings/' + cw + '/building_' + BUILDING_DEFS[d] + '_' + cw + '.gltf';
    jobs.push(load(url).then((s) => { out.buildings[d] = s; }, () => {}));
  }
  Object.entries(PROP_FILES).forEach(([k, url]) => {
    jobs.push(load(url).then((s) => { out.props[k] = s; }, () => {}));
  });
  await Promise.all(jobs);
  return out;
}
function prepClone(srcScene, targetW, shadows) {
  const c = srcScene.clone(true);
  const box = new THREE.Box3().setFromObject(c);
  const size = box.getSize(new THREE.Vector3());
  const s = targetW / Math.max(size.x, size.z, 0.001);
  c.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(c);
  c.position.y -= box2.min.y;
  const center = box2.getCenter(new THREE.Vector3());
  c.position.x -= center.x;
  c.position.z -= center.z;
  c.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadows;
      o.receiveShadow = shadows;
      if (o.material) o.material = o.material.clone();
    }
  });
  return c;
}

/* ============================================================
   CANVAS TEXTURE HELPERS (no external files, ever)
   ============================================================ */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner, outer) {
  return canvasTex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

function skyTexture() {
  return canvasTex(4, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#3D9BE0');
    grad.addColorStop(0.55, '#7CC3F0');
    grad.addColorStop(1, '#D6F0FF');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 512);
  });
}

function cobbleTexture() {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#D9AE6E';
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0);
        const y = row * 32;
        const shade = 0.92 + ((row * 7 + col * 13) % 10) / 40;
        g.fillStyle = 'rgb(' + Math.round(250 * shade) + ',' + Math.round(216 * shade) + ',' + Math.round(158 * shade) + ')';
        g.beginPath();
        if (g.roundRect) g.roundRect(x + 2, y + 2, 28, 28, 8); else g.rect(x + 2, y + 2, 28, 28);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(122,74,40,.8)';
    g.fillRect(0, 0, 128, 3);
    g.fillRect(0, 125, 128, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function checkerTexture() {
  const t = canvasTex(128, 128, (g) => {
    for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 4; c2++) {
      g.fillStyle = (r + c2) % 2 ? '#F0A8C4' : '#FFF6E4';
      g.fillRect(c2 * 32, r * 32, 32, 32);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function islandTopTexture() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#72C74C';
    g.fillRect(0, 0, 512, 512);
    // soft grass mottling so the lawn never reads flat
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 14 + Math.random() * 42;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() > 0.5;
      grad.addColorStop(0, light ? 'rgba(140,220,100,.16)' : 'rgba(58,122,40,.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // candy sprinkles in the grass (it IS the edible garden)
    const sprinkleCols = ['#FFD7E6', '#FFF3B0', '#CFF2FF', '#FFFFFF'];
    for (let i = 0; i < 90; i++) {
      g.fillStyle = sprinkleCols[i % 4];
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 512, 1.4 + Math.random() * 1.2, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    // gentle darker rim toward the cliff edges
    const v = g.createRadialGradient(256, 256, 150, 256, 256, 340);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(30,80,20,.28)');
    g.fillStyle = v;
    g.fillRect(0, 0, 512, 512);
  });
}

function plaqueTexture(dayNum, accentCss) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#FFF8E8';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = accentCss || '#B87333';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#2A1A12';
    g.font = '900 46px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('DAY ' + dayNum, 128, 66);
  });
}

function sealTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#F5B841';
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(138,84,36,.9)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8A5424';
    g.font = '900 64px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('W', 64, 70);
  });
}

/* ============================================================
   SMALL HELPERS
   ============================================================ */
function stdMat(color, o) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.04, flatShading: true }, o || {}));
}
function brassMat(o) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: C.brass, roughness: 0.32, metalness: 0.85, flatShading: true }, o || {}));
}
function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  if (x !== undefined) m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

/* ============================================================
   MOUNT
   ============================================================ */
export async function mount(container, api, opts) {
  if (!container || !api) throw new Error('map3d: missing container or api');
  const tier = opts.tier || 'high';
  const REDUCED = !!opts.reduced;
  const TOUCH = !!opts.touch;
  const MOBILE = tier === 'mobile';
  const gsap = window.gsap || null;

  const days = api.getDays();
  let states = api.getDayStates();
  const themes = {};
  days.forEach((d) => { themes[d.day] = api.getTheme(d.day) || {}; });
  // real modeled assets (Track B); missing files degrade to primitives
  const realAssets = await loadRealAssets(themes).catch(() => ({ buildings: {}, props: {} }));

  /* ---------- DOM scaffold ---------- */
  container.innerHTML = '';
  container.style.height = '';
  const pin = document.createElement('div');
  pin.className = 'm3d-pin';
  container.appendChild(pin);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  pin.appendChild(canvas);
  const platesLayer = document.createElement('div');
  platesLayer.className = 'm3d-plates';
  pin.appendChild(platesLayer);
  const hint = document.createElement('div');
  hint.className = 'm3d-hint';
  hint.textContent = TOUCH ? 'Tap a room . Wonka walks you in' : 'Click a room . Wonka walks you in';
  // (kept for potential reuse; the golden CTA teaches the interaction now)
  // title block floating in the scene sky (replaces the DOM tour-hero)
  const titleBox = document.createElement('div');
  titleBox.className = 'm3d-title';
  titleBox.innerHTML = '<div class="t-eyebrow">Now Showing . Night Shoot, Ten Sets</div>' +
    '<h2>Welcome to the Factory</h2><div class="t-line"></div>';
  pin.appendChild(titleBox);
  const titleLine = titleBox.querySelector('.t-line');
  // one golden call to action: continue where you left off
  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'm3d-cta';
  pin.appendChild(cta);
  cta.addEventListener('click', () => {
    const cur = states.find((s) => s.isCurrent && s.unlocked) || states.find((s) => s.unlocked && !s.done);
    if (cur) activateRoom(cur.day);
  });
  function refreshCta() {
    const doneCount = states.filter((s) => s.done).length;
    const cur = states.find((s) => s.isCurrent && s.unlocked) || states.find((s) => s.unlocked && !s.done);
    if (doneCount >= days.length) {
      cta.innerHTML = 'All ten rooms toured<span class="c-sub">Up and out . you did it</span>';
    } else if (cur) {
      const d = days[cur.day - 1];
      cta.innerHTML = (doneCount ? 'Continue the tour' : 'Begin the tour') +
        '<span class="c-sub">Day ' + d.day + ' . ' + d.room + '</span>';
    } else {
      cta.innerHTML = 'The floor is warming up<span class="c-sub">Your first room opens soon</span>';
    }
    const wl = (days[(cur ? cur.day : 1) - 1] || days[0]).wonkaLine;
    if (wl) titleLine.textContent = wl;
  }
  const a11y = document.createElement('div');
  a11y.className = 'm3d-a11y';
  days.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Day ' + d.day + ': ' + d.room;
    b.addEventListener('click', () => api.openDay(d.day));
    a11y.appendChild(b);
  });
  pin.appendChild(a11y);

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const DPR_CAP = MOBILE ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(opts.dpr || 1, DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const SHADOWS = !MOBILE;
  if (SHADOWS) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(C.fogCol, 210, 420);

  /* ---------- lights: a lit movie set at night ---------- */
  scene.add(new THREE.HemisphereLight(0xCFE8FF, 0x6FBF4A, 1.05));
  const keyLight = new THREE.DirectionalLight(0xFFF2DC, 2.0);
  keyLight.position.set(34, 46, 36);
  if (SHADOWS && !/[?&]noshadow\b/.test(location.search)) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.setScalar(tier === 'high' ? 2048 : 1024);
    const S = 42;
    keyLight.shadow.camera.left = -S; keyLight.shadow.camera.right = S;
    keyLight.shadow.camera.top = S; keyLight.shadow.camera.bottom = -S;
    keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 130;
    keyLight.shadow.bias = -0.0016;
  }
  keyLight.target.position.set(0, 0, -6);
  scene.add(keyLight);
  scene.add(keyLight.target);
  const rimLight = new THREE.DirectionalLight(0x9EC9FF, 0.35);
  rimLight.position.set(-30, 26, -24);
  scene.add(rimLight);
  // no follow spotlight in daylight . the sun does the work
  const followSpot = null;

  /* ---------- camera: whole-board isometric ---------- */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const CAM_YAW = Math.PI / 4;
  const CAM_PITCH = 0.575; // ~33deg
  const camDir = new THREE.Vector3(
    Math.sin(CAM_YAW) * Math.cos(CAM_PITCH),
    Math.sin(CAM_PITCH),
    Math.cos(CAM_YAW) * Math.cos(CAM_PITCH)
  ).normalize();
  const camTarget = new THREE.Vector3();
  let viewHeight = 40, viewHeightTarget = 40;
  let driftX = 0, driftY = 0, driftTX = 0, driftTY = 0;
  // the stage may still be display:none while the engine mounts (the host
  // adds body.map-3d only after mount succeeds), so 0-size must never
  // reach the projection math . fall back to the window box.
  function stageW() { return pin.clientWidth || window.innerWidth; }
  function stageH() { return pin.clientHeight || Math.max(1, window.innerHeight - 110); }
  function applyCamera() {
    const aspect = stageW() / Math.max(1, stageH());
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    camera.position.copy(camTarget).addScaledVector(camDir, 160);
    camera.position.x += driftX; camera.position.y += driftY * 0.4; camera.position.z -= driftX * 0.4;
    camera.lookAt(camTarget.x + driftX * 0.5, camTarget.y, camTarget.z);
  }

  /* ============================================================
     PATH . compact serpentine, three lanes, whole board ~46x40
     ============================================================ */
  const ctrl = [
    [-3.5, 0, 15.5],  // approach from the south edge
    [-4, 0, 12.5],    // entrance gate
    [-9, 0, 11.3],
    [-12.7, 0, 10.2], // day 1 threshold
    [-16.5, 0, 6],
    [-14.7, 0, 0.2],  // day 2
    [-13.5, 0, -4.5],
    [-9.7, 0, -8.8],  // day 3
    [-13.5, 0, -13],
    [-14.7, 0, -16.3],// day 4
    [-10, 0, -18.5],
    [-2.7, 0, -16.8], // day 5 . west river bank
    [2.8, 0, -17.4],  // bridge over the chocolate river
    [8.3, 0, -17.8],  // day 6 . east bank
    [13, 0, -15.5],
    [15.3, 0, -10.8], // day 7
    [13.5, 0, -6.5],
    [8.3, 0, -2.8],   // day 8
    [12.5, 0, 0.5],
    [17.3, 0, 2.2],   // day 9
    [14, 0, 6],
    [9.3, 0, 9.2],    // day 10
    [12, 0, 10.5],
    [14.5, 0, 10.8],  // glass elevator terrace
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const pathLen = curve.getLength();
  const doorCtrlIdx = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13, 7: 15, 8: 17, 9: 19, 10: 21 };
  // hand-placed room centers: every door faces the camera diagonal (SE)
  const ROOM_POS = {
    1: [-16, 7], 2: [-18, -3], 3: [-13, -12], 4: [-18, -19.5], 5: [-6, -20],
    6: [5, -21], 7: [12, -14], 8: [5, -6], 9: [14, -1], 10: [6, 6],
  };
  const lens = curve.getLengths(600);
  function lenAtCtrl(idx) {
    const u = idx / (ctrl.length - 1);
    return lens[Math.round(u * 600)] || 0;
  }
  const doorLen = {};
  days.forEach((d) => { doorLen[d.day] = lenAtCtrl(doorCtrlIdx[d.day]); });

  const posAt = (l, target) => curve.getPointAt(Math.min(1, Math.max(0, l / pathLen)), target || new THREE.Vector3());
  const tanAt = (l, target) => curve.getTangentAt(Math.min(1, Math.max(0, l / pathLen)), target || new THREE.Vector3());

  const world = new THREE.Group();
  scene.add(world);

  /* ============================================================
     ISLAND . one rounded floating slab under the whole board
     ============================================================ */
  const ISLAND = { minX: -23, maxX: 23, minZ: -28, maxZ: 15 };
  (function buildIsland() {
    const shape = new THREE.Shape();
    const cx = (ISLAND.minX + ISLAND.maxX) / 2, cz = (ISLAND.minZ + ISLAND.maxZ) / 2;
    const rx = (ISLAND.maxX - ISLAND.minX) / 2, rz = (ISLAND.maxZ - ISLAND.minZ) / 2;
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // organic wobble on a rounded-rect-ish super-ellipse
      const sx = Math.cos(a), sz = Math.sin(a);
      const superR = 1 / Math.pow(Math.pow(Math.abs(sx), 3.2) + Math.pow(Math.abs(sz), 3.2), 1 / 3.2);
      const wob = 1 + 0.05 * Math.sin(a * 3.3 + 1.2) + 0.04 * Math.sin(a * 5.1);
      const x = cx + sx * superR * rx * wob;
      const z = cz + sz * superR * rz * wob;
      if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false });
    // extrude runs along +Z; rotate so the top faces +Y and sides drop down
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.0, 0);
    const topTex = islandTopTexture();
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.9, metalness: 0 });
    // shape UVs come in world XY; normalize to the island bounds
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        (uv.getX(i) - ISLAND.minX) / (ISLAND.maxX - ISLAND.minX),
        (uv.getY(i) - ISLAND.minZ) / (ISLAND.maxZ - ISLAND.minZ));
    }
    const sideMat = new THREE.MeshStandardMaterial({ color: C.cliff, roughness: 1, metalness: 0, flatShading: true });
    const island = new THREE.Mesh(geo, [topMat, sideMat]);
    island.receiveShadow = SHADOWS;
    world.add(island);
    // a darker slab under the cliff for depth
    const under = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: C.cliffDeep }));
    under.scale.set(0.94, 1, 0.94);
    under.position.y = -3.5;
    world.add(under);
  })();

  /* ---------- walkway ribbon ---------- */
  (function buildRibbon() {
    const steps = Math.round(pathLen / 0.5);
    const pos = [], uvA = [], idx = [];
    const p = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3();
    const HALF_W = 1.9;
    for (let i = 0; i <= steps; i++) {
      const l = pathLen * (i / steps);
      posAt(l, p); tanAt(l, t);
      n.set(-t.z, 0, t.x).normalize();
      pos.push(p.x - n.x * HALF_W, 0.06, p.z - n.z * HALF_W);
      pos.push(p.x + n.x * HALF_W, 0.06, p.z + n.z * HALF_W);
      uvA.push(l / 2.7, 0, l / 2.7, 1);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // flat ground strip: force every normal straight up so lighting is
    // uniform no matter which way each serpentine segment winds
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const tex = cobbleTexture();
    // unlit on purpose: DoubleSide strips flip normals wherever the
    // serpentine winding inverts, and lit materials then pick up the
    // hemisphere ground color. A basic material is winding-proof.
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide, color: 0xE6D6BC,
    }));
    world.add(m);
  })();

  /* ============================================================
     CHOCOLATE RIVER . a curved band across the east half + bridge
     ============================================================ */
  let riverMat = null;
  (function buildRiver() {
    // river control curve: enters from the east cliff, bends past day 5,
    // exits south. Drawn as a flat band slightly above the island top.
    const riverPts = [
      new THREE.Vector3(0.4, 0, -30),
      new THREE.Vector3(0.8, 0, -17),
      new THREE.Vector3(0.6, 0, -6),
      new THREE.Vector3(1.2, 0, 6),
      new THREE.Vector3(1.8, 0, 17),
    ];
    const rCurve = new THREE.CatmullRomCurve3(riverPts, false, 'centripetal');
    const rLen = rCurve.getLength();
    const steps = 60, HALF_W = 3.0;
    const pos = [], uvA = [], idx = [];
    const p = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3();
    const bankPosL = [], bankPosR = [];
    for (let i = 0; i <= steps; i++) {
      rCurve.getPointAt(i / steps, p);
      rCurve.getTangentAt(i / steps, t);
      n.set(-t.z, 0, t.x).normalize();
      pos.push(p.x - n.x * HALF_W, 0.09, p.z - n.z * HALF_W);
      pos.push(p.x + n.x * HALF_W, 0.09, p.z + n.z * HALF_W);
      uvA.push((i / steps) * (rLen / 6), 0, (i / steps) * (rLen / 6), 1);
      bankPosL.push([p.x - n.x * (HALF_W + 0.45), p.z - n.z * (HALF_W + 0.45)]);
      bankPosR.push([p.x + n.x * (HALF_W + 0.45), p.z + n.z * (HALF_W + 0.45)]);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    riverMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDark: { value: new THREE.Color(0x7A4520) },
        uBase: { value: new THREE.Color(0xAA6A34) },
        uHi: { value: new THREE.Color(0xF2CE9C) },
      },
      vertexShader:
        'varying vec2 vUv;\n' +
        'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform float uTime; uniform vec3 uDark, uBase, uHi; varying vec2 vUv;\n' +
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }\n' +
        'float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n' +
        '  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }\n' +
        'void main(){\n' +
        '  vec2 q = vUv * vec2(6.0, 2.6);\n' +
        '  float flow = uTime * 0.28;\n' +
        '  float a = n2(q + vec2(flow, 0.0));\n' +
        '  float b = n2(q * 2.2 + vec2(flow * 1.6, 3.3));\n' +
        '  float swirl = a * 0.62 + b * 0.38;\n' +
        '  vec3 col = mix(uDark, uBase, smoothstep(0.22, 0.72, swirl));\n' +
        '  col = mix(col, uHi, smoothstep(0.76, 0.97, swirl) * 0.85);\n' +
        '  float edge = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y);\n' +
        '  col *= 0.82 + edge * 0.18;\n' +
        '  gl_FragColor = vec4(col, 1.0);\n' +
        '}',
    });
    world.add(new THREE.Mesh(g, riverMat));

    // banks: thin dark strips so the river reads sunken
    function bank(edge) {
      const bp = [], bi = [];
      edge.forEach((e, i) => {
        bp.push(e[0], 0.14, e[1], e[0], 0.02, e[1]);
        if (i > 0) {
          const a = (i - 1) * 2, b = i * 2;
          bi.push(a, b, a + 1, a + 1, b, b + 1);
        }
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      bg.setIndex(bi);
      bg.computeVertexNormals();
      world.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x3A2110, side: THREE.DoubleSide })));
    }
    bank(bankPosL); bank(bankPosR);

    // floating candies
    const candyGeo = new THREE.SphereGeometry(0.4, 7, 5);
    const candyMats = [stdMat(C.raspberry), stdMat(C.mint), stdMat(C.gold)];
    world.userData.candies = [];
    const candyCount = MOBILE ? 4 : 7;
    for (let i = 0; i < candyCount; i++) {
      const u = (i + 0.5) / candyCount;
      const cp = rCurve.getPointAt(u);
      const cm = mesh(candyGeo, candyMats[i % 3], cp.x, 0.22, cp.z, world);
      cm.scale.y = 0.5;
      cm.userData.u = u;
      world.userData.candies.push(cm);
    }
    world.userData.riverCurve = rCurve;
  })();

  /* ---------- bridge where the path crosses the river ---------- */
  (function buildBridge() {
    const from = doorLen[5] + (doorLen[6] - doorLen[5]) * 0.32;
    const to = doorLen[5] + (doorLen[6] - doorLen[5]) * 0.68;
    const g = new THREE.Group();
    const planks = 7;
    const plankGeo = new THREE.BoxGeometry(3.4, 0.22, (to - from) / planks * 0.95);
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < planks; i++) {
      const l = from + (to - from) * ((i + 0.5) / planks);
      posAt(l, p); tanAt(l, t);
      const arc = Math.sin(((i + 0.5) / planks) * Math.PI) * 0.5;
      const plank = mesh(plankGeo, stdMat(0x8a5a30, { roughness: 0.55 }), p.x, 0.12 + arc, p.z);
      plank.rotation.y = Math.atan2(t.x, t.z);
      plank.castShadow = plank.receiveShadow = SHADOWS;
      g.add(plank);
    }
    [-1, 1].forEach((side) => {
      const railPts = [];
      for (let i = 0; i <= 8; i++) {
        const l = from + (to - from) * (i / 8);
        posAt(l, p); tanAt(l, t);
        const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
        const arc = Math.sin((i / 8) * Math.PI) * 0.5;
        railPts.push(new THREE.Vector3(p.x + n.x * side * 1.85, 0.95 + arc, p.z + n.z * side * 1.85));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 16, 0.09, 6), brassMat()));
    });
    world.add(g);
  })();

  /* ============================================================
     ROOMS . bright toy buildings, one archetype per station
     ============================================================ */
  const sealTex = sealTexture();
  const checkerTex = checkerTexture();
  const glowGold = glowTexture('rgba(255,233,176,.95)', 'rgba(245,184,65,.4)');
  const glowSpots = [];      // lamp glow positions, drawn as one Points
  const poolPositions = [];  // warm ground light pools
  const rooms = [];

  function buildRoom(dayIdx) {
    const d = days[dayIdx];
    const theme = themes[d.day];
    const accent = new THREE.Color(theme.accent || '#F5B841');
    const accentRoof = accent.clone();
    const station = theme.station || 'invent';
    const l = doorLen[d.day];
    const p = posAt(l); // the authored threshold on the path
    const rp = ROOM_POS[d.day];
    const pos = new THREE.Vector3(rp[0], 0, rp[1]);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(p.x, 0, p.z); // door faces its threshold (camera side)
    world.add(g);

    const wallMat = stdMat(C.wall, { roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: accentRoof, roughness: 0.55, metalness: 0.12, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.25, flatShading: true });
    const W = 4.6, H = 3.4, D2 = 4.0;

    // Track B: a real modeled building replaces the whole primitive body
    const model = realAssets.buildings[d.day];
    if (model) {
      const clone = prepClone(model, 7.0, SHADOWS);
      g.add(clone);
      const mats = [];
      clone.traverse((o) => { if (o.isMesh && o.material) mats.push(o.material); });
      const bbox = new THREE.Box3().setFromObject(clone);
      const topY = bbox.max.y - g.position.y;

      // plaque + threshold plaza + state gear, adapted to the model's size
      const wzM = (bbox.max.z - g.position.z) * 0 + Math.max(2.2, (bbox.max.z - bbox.min.z) / 2 + 0.15);
      const plqM = mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: plaqueTexture(d.day, theme.accent), transparent: false }), 0, Math.min(topY + 0.55, 4.4), wzM, g);
      plqM.material.toneMapped = false;

      const threshM = p.clone().lerp(pos, 0.28);
      const plazaM = new THREE.Mesh(new THREE.CircleGeometry(2.1, 18), new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.85 }));
      plazaM.rotation.x = -Math.PI / 2;
      plazaM.position.set(threshM.x, 0.075, threshM.z);
      plazaM.receiveShadow = SHADOWS;
      world.add(plazaM);

      const footRM = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) * 0.62 + 0.5;
      const aoM = new THREE.Mesh(new THREE.CircleGeometry(footRM, 18), new THREE.MeshBasicMaterial({
        map: glowTexture('rgba(0,0,0,.62)', 'rgba(0,0,0,.28)'), transparent: true, opacity: 0.45,
        depthWrite: false, color: 0x000000,
      }));
      aoM.rotation.x = -Math.PI / 2;
      aoM.position.set(pos.x, 0.045, pos.z);
      world.add(aoM);

      const chainGrpM = new THREE.Group();
      chainGrpM.position.set(0, 0, wzM - 0.35);
      g.add(chainGrpM);
      const linkGeoM = new THREE.TorusGeometry(0.14, 0.045, 5, 8);
      const steelM = new THREE.MeshStandardMaterial({ color: 0x99a0ab, roughness: 0.4, metalness: 0.9, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const x = -0.95 + i * 0.235;
        const sag = Math.sin((i / 8) * Math.PI) * 0.24;
        const link = mesh(linkGeoM, steelM, x, 1.42 - sag, 0.12, chainGrpM);
        link.rotation.set(0.4, i % 2 ? Math.PI / 2 : 0, 0);
      }
      mesh(new THREE.BoxGeometry(0.44, 0.52, 0.18), new THREE.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.9, roughness: 0.3 }), 0, 1.06, 0.16, chainGrpM);
      mesh(new THREE.TorusGeometry(0.16, 0.045, 5, 10, Math.PI), steelM, 0, 1.4, 0.16, chainGrpM);

      const sealGrpM = new THREE.Group();
      g.add(sealGrpM);
      const sealM = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 16), new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.28, metalness: 0.6 }), 0, Math.min(topY + 0.55, 4.4) - 1.0, wzM + 0.05, sealGrpM);
      sealM.rotation.x = Math.PI / 2;
      const embM = mesh(new THREE.CircleGeometry(0.46, 16), new THREE.MeshBasicMaterial({ map: sealTex }), 0, Math.min(topY + 0.55, 4.4) - 1.0, wzM + 0.12, sealGrpM);
      embM.material.toneMapped = false;

      const beaconGrpM = new THREE.Group();
      world.add(beaconGrpM);
      beaconGrpM.position.set(threshM.x, 0, threshM.z);
      const shaftMatM = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const shaftM = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.3, 11, 12, 1, true), shaftMatM);
      shaftM.position.y = 5.5;
      beaconGrpM.add(shaftM);
      const ringMatM = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.08, 6, 28), ringMatM);
      ringM.rotation.x = -Math.PI / 2;
      ringM.position.y = 0.1;
      beaconGrpM.add(ringM);
      beaconGrpM.userData = { shaftMat: shaftMatM, ringMat: ringMatM, ring: ringM };

      const hitM = mesh(new THREE.BoxGeometry(6.4, Math.max(6, topY + 2), 6.4), new THREE.MeshBasicMaterial({ visible: false }), 0, 3, 0, g);
      hitM.userData.day = d.day;

      rooms.push({
        day: d.day, group: g, leafL: null, leafR: null, seamMat: null,
        winMat: { emissiveIntensity: 0 }, trimMat, roofMat, wallMat,
        modelMats: mats, clone,
        chainGrp: chainGrpM, sealGrp: sealGrpM, beaconGrp: beaconGrpM, accent, accentRoof, hit: hitM,
        anchor: p.clone(), threshold: threshM, doorsOpen: false, len: l,
        plateAnchorY: Math.min(topY + 2.6, 7.4),
      });
      return;
    }

    let body;
    if (station === 'research') {
      body = mesh(new THREE.CylinderGeometry(W * 0.5, W * 0.56, H, 12), wallMat, 0, H / 2, 0, g);
      const dome = mesh(new THREE.SphereGeometry(W * 0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofMat, 0, H, 0, g);
      dome.castShadow = SHADOWS;
      const scope = mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6), brassMat(), W * 0.2, H + W * 0.4, 0, g);
      scope.rotation.z = -0.55;
      mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 8), brassMat({ color: C.brassLight }), 0, H / 2, 0, g).position.set(0, H * 0.72, 0);
    } else if (station === 'brief') {
      body = mesh(new THREE.BoxGeometry(W * 0.92, H * 1.35, D2 * 0.92), wallMat, 0, H * 1.35 / 2, 0, g);
      mesh(new THREE.BoxGeometry(W * 1.04, 0.42, D2 * 1.04), roofMat, 0, H * 1.35 + 0.21, 0, g);
      const cap = mesh(new THREE.ConeGeometry(W * 0.52, 1.3, 4), roofMat, 0, H * 1.35 + 1.05, 0, g);
      cap.rotation.y = Math.PI / 4;
      cap.castShadow = SHADOWS;
      mesh(new THREE.SphereGeometry(0.16, 6, 5), brassMat({ color: C.gold }), 0, H * 1.35 + 1.8, 0, g);
    } else if (station === 'prove') {
      body = mesh(new THREE.BoxGeometry(W * 1.12, H * 0.85, D2 * 1.05), wallMat, 0, H * 0.425, 0, g);
      const lid = mesh(new THREE.BoxGeometry(W * 1.26, 0.5, D2 * 1.2), roofMat, 0, H * 0.85 + 0.25, 0, g);
      lid.castShadow = SHADOWS;
      mesh(new THREE.BoxGeometry(W * 0.5, 0.62, D2 * 0.5), wallMat, 0, H * 0.85 + 0.81, 0, g);
      mesh(new THREE.BoxGeometry(W * 0.62, 0.3, D2 * 0.62), roofMat, 0, H * 0.85 + 1.27, 0, g);
    } else { // invent + inspect: workshop, sawtooth roof + chimney + gear
      body = mesh(new THREE.BoxGeometry(W, H, D2), wallMat, 0, H / 2, 0, g);
      for (let i = 0; i < 3; i++) {
        const tooth = new THREE.Mesh(new THREE.CylinderGeometry(0.01, W / 3 * 0.7, 1.25, 4), roofMat);
        tooth.position.set(-W / 3 + i * (W / 3), H + 0.62, 0);
        tooth.rotation.y = Math.PI / 4;
        tooth.scale.z = D2 / (W / 3);
        tooth.castShadow = SHADOWS;
        g.add(tooth);
      }
      const chimney = mesh(new THREE.CylinderGeometry(0.36, 0.44, 1.9, 7), brassMat({ color: C.brassDark }), W * 0.3, H + 1.5, -D2 * 0.2, g);
      chimney.castShadow = SHADOWS;
      const gear = mesh(new THREE.TorusGeometry(0.62, 0.2, 6, 9), brassMat(), -W / 2 - 0.12, H * 0.6, 0.3, g);
      gear.rotation.y = Math.PI / 2;
      gear.userData.spin = 0.5;
      (world.userData.gears = world.userData.gears || []).push(gear);
      if (station === 'inspect') {
        const ring = mesh(new THREE.TorusGeometry(0.44, 0.08, 6, 12), brassMat(), 0, H + 0.55, D2 * 0.28, g);
        ring.rotation.x = 0.4;
      }
    }
    body.castShadow = body.receiveShadow = SHADOWS;

    // accent base skirt: ties every building to its day color
    mesh(new THREE.BoxGeometry(
      station === 'research' ? W * 1.16 : W * (station === 'prove' ? 1.22 : 1.06),
      0.3,
      station === 'research' ? W * 1.16 : D2 * (station === 'prove' ? 1.3 : 1.06)
    ), trimMat, 0, 0.15, 0, g);

    // door front position
    const wz = station === 'research' ? W * 0.6 : D2 / 2 * (station === 'prove' ? 1.05 : 1) + 0.04;

    // arched double door
    const doorGrp = new THREE.Group();
    doorGrp.position.set(0, 0.3, wz + 0.05);
    g.add(doorGrp);
    const doorMat = new THREE.MeshStandardMaterial({ color: C.doorWood, roughness: 0.55, metalness: 0.12, flatShading: true });
    const leafGeo = new THREE.BoxGeometry(0.72, 2.1, 0.1);
    const leafL = new THREE.Group(); leafL.position.set(-0.74, 0, 0); doorGrp.add(leafL);
    const leafR = new THREE.Group(); leafR.position.set(0.74, 0, 0); doorGrp.add(leafR);
    mesh(leafGeo, doorMat, 0.37, 1.05, 0, leafL);
    mesh(leafGeo, doorMat, -0.37, 1.05, 0, leafR);
    mesh(new THREE.TorusGeometry(0.78, 0.09, 6, 14, Math.PI), brassMat(), 0, 2.1, 0, doorGrp);
    mesh(new THREE.BoxGeometry(0.13, 2.1, 0.13), brassMat(), -0.86, 1.05, 0, doorGrp);
    mesh(new THREE.BoxGeometry(0.13, 2.1, 0.13), brassMat(), 0.86, 1.05, 0, doorGrp);
    // warm interior glow revealed when the doors open
    const seamMat = new THREE.MeshBasicMaterial({ color: 0xFFE0A0, transparent: true, opacity: 0 });
    mesh(new THREE.PlaneGeometry(1.5, 2.1), seamMat, 0, 1.05, -0.06, doorGrp);

    // windows: warm and lit (the whole board should glow with life)
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a1a35, emissive: 0xFFC97E, emissiveIntensity: 0, roughness: 0.4 });
    const winGeo = new THREE.CircleGeometry(0.5, 12);
    [-1.35, 1.35].forEach((x) => {
      mesh(winGeo, winMat, x, 2.2, wz + 0.03, g);
      mesh(new THREE.TorusGeometry(0.48, 0.055, 5, 14), brassMat(), x, 2.2, wz + 0.04, g);
    });

    // DAY plaque above the door
    const plq = mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: plaqueTexture(d.day, theme.accent) }), 0, 3.1, wz + 0.04, g);
    plq.material.toneMapped = false;

    // striped shop awning over the door (the reference look)
    const awnTex = canvasTex(128, 64, (gg) => {
      for (let i = 0; i < 8; i++) {
        gg.fillStyle = i % 2 ? '#FFF8EC' : (theme.accent || '#E0356B');
        gg.fillRect(i * 16, 0, 16, 64);
      }
      gg.fillStyle = 'rgba(0,0,0,.08)';
      gg.fillRect(0, 52, 128, 12);
    });
    const awning = mesh(new THREE.PlaneGeometry(2.6, 1.15), new THREE.MeshStandardMaterial({
      map: awnTex, roughness: 0.8, side: THREE.DoubleSide,
    }), 0, 2.62, wz + 0.62, g);
    awning.rotation.x = -0.62;
    awning.castShadow = SHADOWS;

    // checker plaza at the threshold
    const thresh = p.clone().lerp(pos, 0.28);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(2.1, 18), new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.85 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(thresh.x, 0.075, thresh.z);
    plaza.receiveShadow = SHADOWS;
    world.add(plaza);

    // chains + padlock (locked)
    const chainGrp = new THREE.Group();
    chainGrp.position.copy(doorGrp.position);
    g.add(chainGrp);
    const linkGeo = new THREE.TorusGeometry(0.14, 0.045, 5, 8);
    const steel = new THREE.MeshStandardMaterial({ color: 0x99a0ab, roughness: 0.4, metalness: 0.9, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const x = -0.95 + i * 0.235;
      const sag = Math.sin((i / 8) * Math.PI) * 0.24;
      const link = mesh(linkGeo, steel, x, 1.42 - sag, 0.12, chainGrp);
      link.rotation.set(0.4, i % 2 ? Math.PI / 2 : 0, 0);
    }
    mesh(new THREE.BoxGeometry(0.44, 0.52, 0.18), new THREE.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.9, roughness: 0.3 }), 0, 1.06, 0.16, chainGrp);
    mesh(new THREE.TorusGeometry(0.16, 0.045, 5, 10, Math.PI), steel, 0, 1.4, 0.16, chainGrp);

    // gold seal + flag (completed)
    const sealGrp = new THREE.Group();
    g.add(sealGrp);
    const seal = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 16), new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.28, metalness: 0.6 }), 0, 3.05, wz + 0.1, sealGrp);
    seal.rotation.x = Math.PI / 2;
    const emb = mesh(new THREE.CircleGeometry(0.46, 16), new THREE.MeshBasicMaterial({ map: sealTex }), 0, 3.05, wz + 0.17, sealGrp);
    emb.material.toneMapped = false;

    // current-day beacon at the threshold
    const beaconGrp = new THREE.Group();
    beaconGrp.position.set(0, 0, 0);
    world.add(beaconGrp);
    beaconGrp.position.set(thresh.x, 0, thresh.z);
    const shaftMat = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.3, 11, 12, 1, true), shaftMat);
    shaft.position.y = 5.5;
    beaconGrp.add(shaft);
    const ringMat = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.08, 6, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    beaconGrp.add(ring);
    beaconGrp.userData = { shaftMat, ringMat, ring };

    // soft contact shadow under the building (fake AO)
    const footR = (station === 'research' ? W * 0.62 : Math.max(W, D2) * 0.72) + 0.6;
    const ao = new THREE.Mesh(new THREE.CircleGeometry(footR, 18), new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(0,0,0,.62)', 'rgba(0,0,0,.28)'), transparent: true, opacity: 0.5,
      depthWrite: false, color: 0x000000,
    }));
    ao.rotation.x = -Math.PI / 2;
    ao.position.set(pos.x, 0.045, pos.z);
    world.add(ao);

    // invisible fat hitbox
    const hit = mesh(new THREE.BoxGeometry(W + 2.2, H + 4, D2 + 2.2), new THREE.MeshBasicMaterial({ visible: false }), 0, H / 2, 0, g);
    hit.userData.day = d.day;

    rooms.push({
      day: d.day, group: g, leafL, leafR, seamMat, winMat, trimMat, roofMat, wallMat,
      chainGrp, sealGrp, beaconGrp, accent, accentRoof, hit,
      anchor: p.clone(), threshold: thresh, doorsOpen: false, len: l,
      plateAnchorY: station === 'brief' ? H * 1.35 + 3.2 : H + 3.4,
    });
  }
  days.forEach((_, i) => buildRoom(i));

  /* ============================================================
     ENTRANCE GATE + GLASS ELEVATOR
     ============================================================ */
  (function buildEntrance() {
    const l = lenAtCtrl(1);
    const p = posAt(l), t = tanAt(l);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(t.x, t.z);
    world.add(g);
    [-1, 1].forEach((s) => {
      const post = mesh(new THREE.BoxGeometry(0.7, 5.4, 0.7), brassMat({ color: C.brassDark }), s * 2.9, 2.7, 0, g);
      post.castShadow = SHADOWS;
      mesh(new THREE.SphereGeometry(0.48, 8, 6), brassMat({ color: C.gold }), s * 2.9, 5.65, 0, g);
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.26, 6, 22, Math.PI), brassMat());
    arch.position.y = 5.4;
    g.add(arch);
    const sign = mesh(new THREE.PlaneGeometry(4.0, 0.95), new THREE.MeshBasicMaterial({
      map: canvasTex(512, 128, (gg) => {
        gg.fillStyle = '#FFF8E8';
        if (gg.roundRect) { gg.beginPath(); gg.roundRect(4, 8, 504, 112, 24); gg.fill(); } else gg.fillRect(4, 8, 504, 112);
        gg.strokeStyle = '#B87333';
        gg.lineWidth = 10;
        if (gg.roundRect) { gg.beginPath(); gg.roundRect(10, 14, 492, 100, 20); gg.stroke(); } else gg.strokeRect(10, 14, 492, 100);
        gg.fillStyle = '#2A1A12';
        gg.font = '900 52px Georgia, serif';
        gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillText('THE FACTORY', 256, 66);
      }), transparent: true, side: THREE.DoubleSide,
    }), 0, 4.55, 0, g);
    sign.material.toneMapped = false;
    sign.rotation.y = Math.PI;
  })();

  (function buildElevator() {
    const g = new THREE.Group();
    g.position.set(17, 0, 12);
    world.add(g);
    mesh(new THREE.CylinderGeometry(3.4, 3.9, 0.6, 14), stdMat(C.groundEdge), 0, 0.3, 0, g);
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfeaf7, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 });
    mesh(new THREE.BoxGeometry(2.1, 2.9, 2.1), glass, 0, 2.15, 0, g);
    const frame = brassMat();
    [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]].forEach((xz) => {
      mesh(new THREE.BoxGeometry(0.11, 2.9, 0.11), frame, xz[0], 2.15, xz[1], g);
    });
    mesh(new THREE.BoxGeometry(2.3, 0.16, 2.3), frame, 0, 3.68, 0, g);
    mesh(new THREE.BoxGeometry(2.3, 0.16, 2.3), frame, 0, 0.68, 0, g);
    mesh(new THREE.SphereGeometry(0.3, 8, 6), brassMat({ color: C.gold }), 0, 4.0, 0, g);
    glowSpots.push([17, 4.2, 12]);
    poolPositions.push([17, 12]);
    // little UP AND OUT arrow sign
    const s = mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 64, (gg) => {
        gg.clearRect(0, 0, 256, 64);
        gg.fillStyle = '#8FCBE8';
        gg.font = '700 30px "JetBrains Mono", monospace';
        gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillText('UP AND OUT', 128, 34);
      }), transparent: true, side: THREE.DoubleSide,
    }), 0, 4.3, 0, g);
    s.material.toneMapped = false;
    s.rotation.y = Math.PI / 4;
  })();

  /* ============================================================
     SET DRESSING . restrained: lamps, a few candy trees, 1 stack
     ============================================================ */
  function lampPost(l, sideMult) {
    const p = posAt(l), t = tanAt(l);
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    const x = p.x + n.x * sideMult * 2.1;
    const z = p.z + n.z * sideMult * 2.1;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    world.add(g);
    const pole = mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.3, 6), brassMat({ color: C.brassDark }), 0, 1.15, 0, g);
    pole.castShadow = SHADOWS;
    mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFE9B0 }), 0, 2.4, 0, g);
    glowSpots.push([x, 2.4, z]);
    poolPositions.push([x, z]);
  }
  [0.09, 0.22, 0.36, 0.5, 0.63, 0.77, 0.9].forEach((f, i) => lampPost(pathLen * f, i % 2 ? 1 : -1));

  function candyTree(x, z, kind) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    world.add(g);
    mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.0, 5), stdMat(C.doorWood), 0, 0.5, 0, g);
    const col = kind === 0 ? C.mint : (kind === 1 ? C.raspberry : C.sky);
    if (kind === 1) {
      const lolli = mesh(new THREE.SphereGeometry(0.68, 10, 8), stdMat(col, { roughness: 0.45 }), 0, 1.62, 0, g);
      lolli.scale.z = 0.32;
      lolli.castShadow = SHADOWS;
    } else {
      const cone = mesh(new THREE.ConeGeometry(0.72, 1.5, 8), stdMat(col, { roughness: 0.6 }), 0, 1.6, 0, g);
      cone.castShadow = SHADOWS;
      mesh(new THREE.SphereGeometry(0.28, 6, 5), stdMat(C.cream), 0, 2.5, 0, g);
    }
  }
  [[-21, 12, 0], [-14, -25, 1], [-21, -26, 2], [20, -22, 0], [21, -5, 1], [-3, 3, 2], [2.5, -9, 0], [4, 11.5, 1], [-7, -13.5, 2], [19, 7, 0]].forEach((s3) => candyTree(s3[0], s3[1], s3[2]));

  /* ---------- the candy garden: dense, edible, reference-style ---------- */
  (function candyGarden() {
    const caneTex = canvasTex(64, 64, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#FFF6EC' : '#E03A4E';
        g.fillRect(0, i * 8, 64, 8);
      }
    });
    caneTex.wrapS = caneTex.wrapT = THREE.RepeatWrapping;
    const caneMat = new THREE.MeshStandardMaterial({ map: caneTex, roughness: 0.5 });
    const crateMat = stdMat(0xC98A4B, { roughness: 0.8 });
    const crateEdge = stdMat(0xA06A34, { roughness: 0.8 });
    const stemMat = stdMat(0xF5EBD8, { roughness: 0.85 });
    const capMat = stdMat(0xE0455B, { roughness: 0.6 });
    const dotMat = stdMat(0xFFF6EC, { roughness: 0.8 });
    const sugarMat = stdMat(0xFFFFFF, { roughness: 0.55 });
    const barrelMat = stdMat(0x8a5424, { roughness: 0.7 });

    function crate(x, z, yaw) {
      const g = new THREE.Group();
      g.position.set(x, 0.45, z);
      g.rotation.y = yaw || 0;
      world.add(g);
      const b = mesh(new THREE.BoxGeometry(1.05, 0.9, 1.05), crateMat, 0, 0, 0, g);
      mesh(new THREE.BoxGeometry(1.13, 0.16, 1.13), crateEdge, 0, 0.38, 0, g);
      mesh(new THREE.BoxGeometry(1.13, 0.16, 1.13), crateEdge, 0, -0.38, 0, g);
      b.castShadow = SHADOWS;
    }
    function barrel(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      world.add(g);
      const b = mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 9), barrelMat, 0, 0.5, 0, g);
      mesh(new THREE.TorusGeometry(0.47, 0.035, 5, 12), brassMat(), 0, 0.75, 0, g).rotation.x = Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 12), brassMat(), 0, 0.3, 0, g).rotation.x = Math.PI / 2;
      b.castShadow = SHADOWS;
    }
    function shroom(x, z, s) {
      s = s || 1;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      world.add(g);
      mesh(new THREE.CylinderGeometry(0.2 * s, 0.28 * s, 0.7 * s, 7), stemMat, 0, 0.35 * s, 0, g);
      const cap = mesh(new THREE.SphereGeometry(0.62 * s, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, 0, 0.62 * s, 0, g);
      cap.castShadow = SHADOWS;
      [[0.3, 0.25], [-0.25, 0.1], [0.05, -0.32]].forEach((d) => {
        mesh(new THREE.SphereGeometry(0.09 * s, 5, 4), dotMat, d[0] * s, 0.95 * s, d[1] * s, g);
      });
    }
    function cane(x, z, yaw) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = yaw || 0;
      world.add(g);
      const pole = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 7), caneMat, 0, 0.8, 0, g);
      const hook = mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 10, Math.PI), caneMat, 0.3, 1.6, 0, g);
      pole.castShadow = SHADOWS;
    }
    function gumball(x, z, color) {
      const b = mesh(new THREE.SphereGeometry(0.48, 9, 7), stdMat(color, { roughness: 0.35 }), x, 0.48, z, world);
      b.castShadow = SHADOWS;
    }
    function gumdrop(x, z, color) {
      const b = mesh(new THREE.SphereGeometry(0.4, 8, 6), stdMat(color, { roughness: 0.5 }), x, 0.3, z, world);
      b.scale.y = 0.75;
      b.castShadow = SHADOWS;
    }
    function sugarStack(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      world.add(g);
      mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), sugarMat, 0, 0.25, 0, g);
      mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), sugarMat, 0.55, 0.25, 0.1, g).rotation.y = 0.4;
      mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), sugarMat, 0.22, 0.75, 0.05, g).rotation.y = 0.2;
      g.children.forEach((m) => { m.castShadow = SHADOWS; });
    }

    // modeled props take over where they loaded; primitives otherwise
    function place(kind, x, z, s, yaw) {
      const m = realAssets.props[kind];
      if (!m) return false;
      const c = prepClone(m, s || 1.2, SHADOWS);
      const holder = new THREE.Group();
      holder.position.set(x, 0, z);
      holder.rotation.y = yaw || 0;
      holder.add(c);
      world.add(holder);
      return true;
    }
    place('fountain', 11, 5, 3.2) ;
    crate(-12.3, 3, 0.3); crate(-11.4, 3.9, 0.9); barrel(-13.6, 2.2);
    if (!place('mushroomGroup', -19.5, 9.8, 1.6)) shroom(-19.5, 9.8, 1.1);
    if (!place('mushroomRed', -18.5, 10.6, 0.9)) shroom(-18.5, 10.6, 0.7);
    if (!place('mushroomTall', 12, -25, 1.1)) shroom(12, -25, 1.2);
    if (!place('mushroomRed', 21, -9, 0.9)) shroom(21, -9, 0.8);
    cane(-8.6, 12.6, 0.5); cane(18.5, 4.5, 1.2); cane(-11, -26.5, 2.1);
    gumball(-5.8, 13.2, C.raspberry); gumball(6.5, 12.5, C.sky);
    gumball(-20, -15, C.gold); gumball(9.5, -25.5, C.mint);
    gumdrop(-4.5, -3.6, C.mint); gumdrop(-3.8, -2.8, C.raspberry); gumdrop(-4.9, -2.7, C.gold);
    gumdrop(16, -16.5, C.sky); gumdrop(16.8, -15.7, C.raspberry);
    barrel(21.2, -12); barrel(20.4, -11.2);
    crate(13.8, 13.2, 0.2); crate(14.7, 12.5, 1.1);
    sugarStack(-9.8, -24.6); sugarStack(0.5, 10.2);
  })();

  // one smokestack near day 4's headland
  const steamSources = [];
  (function stack() {
    const x = -21.5, z = -11.5;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    world.add(g);
    const st = mesh(new THREE.CylinderGeometry(0.5, 0.72, 4.0, 8), stdMat(C.groundEdge), 0, 2, 0, g);
    st.castShadow = SHADOWS;
    mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.44, 8), brassMat({ color: C.brassDark }), 0, 4.2, 0, g);
    steamSources.push([x, 4.5, z]);
  })();

  (function gearGarden() {
    const g = new THREE.Group();
    g.position.set(18.5, 0, -20);
    world.add(g);
    const big = mesh(new THREE.TorusGeometry(1.5, 0.4, 6, 12), brassMat({ color: C.brassDark }), 0, 0.4, 0, g);
    big.rotation.x = Math.PI / 2 - 0.25;
    big.userData.spin = 0.15;
    const small = mesh(new THREE.TorusGeometry(0.85, 0.26, 6, 10), brassMat(), 2.1, 0.3, 1.2, g);
    small.rotation.x = Math.PI / 2 - 0.4;
    small.userData.spin = -0.3;
    (world.userData.gears = world.userData.gears || []).push(big, small);
  })();

  /* ---------- puffy low-poly clouds drifting over the garden ---------- */
  (function clouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1, flatShading: true, emissive: 0xFFFFFF, emissiveIntensity: 0.18 });
    const defs = [
      [-34, 24, -34, 1.7, 0.28], [12, 29, -46, 2.3, 0.2], [40, 22, -18, 1.4, 0.34],
      [-46, 27, -2, 1.9, 0.24], [28, 31, 10, 1.5, 0.3], [-10, 26, 22, 1.3, 0.26],
    ];
    world.userData.clouds = [];
    defs.forEach((d, di) => {
      const c = new THREE.Group();
      c.position.set(d[0], d[1], d[2]);
      const src2 = di % 2 ? realAssets.props.cloudSmall : realAssets.props.cloudBig;
      if (src2) {
        c.add(prepClone(src2, d[3] * 4.2, false));
      } else {
        const s = d[3];
        [[0, 0, 0, 1.6], [1.5, 0.25, 0.3, 1.15], [-1.4, 0.15, -0.2, 1.0], [0.4, 0.55, -0.5, 0.85]].forEach((b) => {
          const m = mesh(new THREE.SphereGeometry(b[3] * s, 7, 5), mat, b[0] * s, b[1] * s, b[2] * s, c);
          m.scale.y = 0.62;
        });
      }
      c.userData.v = d[4];
      world.add(c);
      world.userData.clouds.push(c);
    });
  })();

  /* ---------- particles: stars + embers + steam ---------- */
  const particleSystems = [];
  function makeParticles(count, size, color, opacity, spawn, tickFn) {
    if (count <= 0) return;
    const pos = new Float32Array(count * 3);
    const meta = [];
    for (let i = 0; i < count; i++) meta.push(spawn(i, pos));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size, color, transparent: true, opacity,
      map: glowGold, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    m.fog = false;
    const points = new THREE.Points(g, m);
    scene.add(points);
    particleSystems.push({ points, meta, tick: tickFn, count });
  }
  makeParticles(REDUCED ? 0 : (MOBILE ? 10 : 26), 0.8, 0xFFFFFF, 0.35,
    (i, pos) => {
      pos[i * 3] = ISLAND.minX + Math.random() * (ISLAND.maxX - ISLAND.minX);
      pos[i * 3 + 1] = 1 + Math.random() * 6;
      pos[i * 3 + 2] = ISLAND.minZ + Math.random() * (ISLAND.maxZ - ISLAND.minZ);
      return { vy: 0.12 + Math.random() * 0.25, wob: Math.random() * Math.PI * 2 };
    },
    (i, pos, meta, dt, time) => {
      pos[i * 3 + 1] += meta.vy * dt;
      pos[i * 3] += Math.sin(time * 0.8 + meta.wob) * dt * 0.35;
      if (pos[i * 3 + 1] > 8) pos[i * 3 + 1] = 0.6;
    });
  makeParticles(REDUCED ? 0 : (MOBILE ? 12 : 30), 1.6, 0xFFFFFF, 0.3,
    (i, pos) => {
      const s = steamSources[0] || [0, 4, 0];
      pos[i * 3] = s[0] + (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = s[1] + Math.random() * 3.5;
      pos[i * 3 + 2] = s[2] + (Math.random() - 0.5) * 0.5;
      return { src: s, vy: 0.5 + Math.random() * 0.5 };
    },
    (i, pos, meta, dt, time) => {
      pos[i * 3 + 1] += meta.vy * dt;
      pos[i * 3] += Math.sin(time + i) * dt * 0.2;
      if (pos[i * 3 + 1] > meta.src[1] + 4.5) {
        pos[i * 3] = meta.src[0]; pos[i * 3 + 1] = meta.src[1]; pos[i * 3 + 2] = meta.src[2];
      }
    });

  /* ============================================================
     WONKA . chibi proportions so he reads at board scale
     ============================================================ */
  const wonka = new THREE.Group();
  wonka.scale.setScalar(1.6);
  world.add(wonka);
  const wBody = new THREE.Group();
  wonka.add(wBody);
  const matCoat = stdMat(0x6A3593, { roughness: 0.55 });
  const matSkin = stdMat(C.skin, { roughness: 0.8 });
  const matInk = stdMat(C.ink, { roughness: 0.6 });

  function makeLeg(x) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.82, 0);
    mesh(new THREE.CapsuleGeometry(0.085, 0.55, 3, 6), matInk, 0, -0.32, 0, leg);
    mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), matInk, 0, -0.72, 0.07, leg);
    wBody.add(leg);
    return leg;
  }
  const legL = makeLeg(-0.14);
  const legR = makeLeg(0.14);

  const coat = new THREE.Group();
  coat.position.y = 0.82;
  wBody.add(coat);
  const coatMesh = mesh(new THREE.CylinderGeometry(0.24, 0.37, 0.85, 8), matCoat, 0, 0.42, 0, coat);
  coatMesh.castShadow = SHADOWS;
  const tailGeo = new THREE.BoxGeometry(0.17, 0.5, 0.05);
  const tailL = new THREE.Group(); tailL.position.set(-0.12, 0.06, -0.17); coat.add(tailL);
  const tailR = new THREE.Group(); tailR.position.set(0.12, 0.06, -0.17); coat.add(tailR);
  mesh(tailGeo, matCoat, 0, -0.24, 0, tailL).rotation.x = 0.25;
  mesh(tailGeo, matCoat, 0, -0.24, 0, tailR).rotation.x = 0.25;
  mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.5, 5), stdMat(C.cream), 0, 0.45, 0.14, coat);
  [0.32, 0.45, 0.58].forEach((y) => {
    mesh(new THREE.SphereGeometry(0.035, 5, 4), brassMat({ color: C.gold }), 0, y, 0.26, coat);
  });

  function makeArm(x) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.56, 0);
    mesh(new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), matCoat, 0, -0.3, 0, arm);
    mesh(new THREE.SphereGeometry(0.08, 6, 5), matSkin, 0, -0.62, 0, arm);
    wBody.add(arm);
    return arm;
  }
  const armL = makeArm(-0.36);
  const armR = makeArm(0.36);
  const cane = new THREE.Group();
  cane.position.set(0, -0.62, 0);
  armR.add(cane);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 5), brassMat(), 0, -0.42, 0, cane);
  mesh(new THREE.SphereGeometry(0.065, 6, 5), brassMat({ color: C.brassLight }), 0, 0.05, 0, cane);

  const headGrp = new THREE.Group();
  headGrp.position.y = 1.8;
  wBody.add(headGrp);
  // chibi: big head
  const head = mesh(new THREE.SphereGeometry(0.3, 12, 9), matSkin, 0, 0.12, 0, headGrp);
  head.castShadow = SHADOWS;
  mesh(new THREE.SphereGeometry(0.05, 5, 4), matSkin, 0, 0.09, 0.29, headGrp);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241322 });
  mesh(new THREE.SphereGeometry(0.032, 4, 4), eyeMat, -0.11, 0.16, 0.25, headGrp);
  mesh(new THREE.SphereGeometry(0.032, 4, 4), eyeMat, 0.11, 0.16, 0.25, headGrp);
  const hat = new THREE.Group();
  hat.position.y = 0.38;
  headGrp.add(hat);
  mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 14), matInk, 0, 0, 0, hat);
  const crown = mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.62, 12), matInk, 0, 0.34, 0, hat);
  crown.castShadow = SHADOWS;
  mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.11, 12), brassMat({ color: C.gold }), 0, 0.11, 0, hat);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(0,0,0,.65)', 'rgba(0,0,0,.2)'), transparent: true, opacity: 0.5,
    depthWrite: false, color: 0x000000,
  }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  wonka.add(blob);
  if (SHADOWS) wonka.traverse((o) => { if (o.isMesh && o !== blob) o.castShadow = true; });

  /* ============================================================
     DOM PLATES: compact chips, full card when near/hover
     ============================================================ */
  const plates = [];
  days.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'm3d-plate';
    el.innerHTML = '<div class="p-day">Day ' + d.day + '</div>' +
      '<div class="p-name"></div><div class="p-note"></div>';
    el.addEventListener('click', () => activateRoom(d.day));
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    platesLayer.appendChild(el);
    plates.push({ el, name: el.querySelector('.p-name'), note: el.querySelector('.p-note') });
  });
  function refreshPlateCopy() {
    days.forEach((d, i) => {
      const st = states[i] || {};
      const pl = plates[i];
      pl.name.textContent = d.room;
      pl.el.classList.toggle('locked', !st.unlocked);
      if (st.done) pl.note.textContent = 'Toured . lights on';
      else if (!st.unlocked) pl.note.textContent = 'Opens ' + api.unlockLabel(d.day);
      else if (st.isCurrent) pl.note.textContent = 'Now filming . step inside';
      else pl.note.textContent = 'Open . walk in';
    });
  }

  /* ============================================================
     STATES
     ============================================================ */
  let firstStates = true;
  function applyStates(list) {
    const prev = states;
    states = list;
    list.forEach((st, i) => {
      const r = rooms[i];
      if (!r) return;
      const was = prev && prev[i];
      const locked = !st.unlocked;
      r.chainGrp.visible = locked;
      r.sealGrp.visible = !!st.done;
      r.beaconGrp.visible = !!st.isCurrent && !locked;
      r.winMat.emissiveIntensity = locked ? 0.0 : (st.done ? 0.9 : 0.45);
      r.trimMat.color.copy(locked ? new THREE.Color(0x6a5a80) : r.accent);
      r.roofMat.color.copy(locked ? new THREE.Color(0x585070) : r.accentRoof);
      r.wallMat.color.set(locked ? 0xB9AC94 : C.wall);
      if (r.modelMats) {
        const gray = new THREE.Color(0x9a938a);
        r.modelMats.forEach((m) => {
          if (!m.userData.origColor) m.userData.origColor = m.color.clone();
          if (locked) m.color.copy(m.userData.origColor).lerp(gray, 0.55);
          else m.color.copy(m.userData.origColor);
        });
      }
      if (!firstStates && was && !was.done && st.done) celebrate();
    });
    refreshPlateCopy();
    refreshCta();
    firstStates = false;
  }

  function celebrate() {
    if (REDUCED || !gsap) return;
    const tl = gsap.timeline();
    tl.to(wBody.position, { y: 0.55, duration: 0.28, ease: 'power2.out' })
      .to(wBody.position, { y: 0, duration: 0.45, ease: 'bounce.out' })
      .to(hat.position, { y: 0.85, duration: 0.28, ease: 'power2.out' }, 0)
      .to(hat.rotation, { z: 0.5, duration: 0.28 }, 0)
      .to(hat.position, { y: 0.38, duration: 0.35, ease: 'power2.in' }, 0.32)
      .to(hat.rotation, { z: 0, duration: 0.35 }, 0.32);
  }

  function openDoors(room) {
    if (room.doorsOpen) return;
    room.doorsOpen = true;
    if (!room.leafL) {
      // modeled building: greet with a soft pop instead of door leaves
      if (gsap && !REDUCED && room.clone) {
        gsap.fromTo(room.clone.scale,
          { x: room.clone.scale.x, y: room.clone.scale.y, z: room.clone.scale.z },
          { y: room.clone.scale.y * 1.06, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' });
      }
      return;
    }
    room.seamMat.opacity = 0.9;
    if (gsap && !REDUCED) {
      gsap.to(room.leafL.rotation, { y: -1.6, duration: 0.45, ease: 'power2.out' });
      gsap.to(room.leafR.rotation, { y: 1.6, duration: 0.45, ease: 'power2.out' });
    } else {
      room.leafL.rotation.y = -1.6;
      room.leafR.rotation.y = 1.6;
    }
  }
  function closeDoors(room) {
    if (!room.doorsOpen) return;
    room.doorsOpen = false;
    if (!room.leafL) return;
    room.seamMat.opacity = 0;
    if (gsap && !REDUCED) {
      gsap.to(room.leafL.rotation, { y: 0, duration: 0.35, ease: 'power2.in' });
      gsap.to(room.leafR.rotation, { y: 0, duration: 0.35, ease: 'power2.in' });
    } else {
      room.leafL.rotation.y = 0;
      room.leafR.rotation.y = 0;
    }
  }
  function rattle(room) {
    if (!gsap || REDUCED) return;
    gsap.fromTo(room.group.rotation, { z: 0 }, { z: 0.02, duration: 0.06, repeat: 5, yoyo: true, onComplete: () => { room.group.rotation.z = 0; } });
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /* ============================================================
     MOVEMENT . click-to-walk along the curve (+ arrow keys)
     ============================================================ */
  let charLen = 0, charVel = 0;
  let walkTween = null;      // {from, to, t, dur, day}
  let nearRoomIdx = -1;
  let userMoved = false;
  let lastCharLen = 0;
  let facingBack = false;
  let hintDismissed = false;
  let camMode = 'board';     // 'board' frames everything; walking biases toward Wonka

  function fitBoardView() {
    // frame the island bbox in the camera plane, with margin
    const corners = [
      [ISLAND.minX, 0, ISLAND.minZ], [ISLAND.maxX, 0, ISLAND.minZ],
      [ISLAND.minX, 0, ISLAND.maxZ], [ISLAND.maxX, 0, ISLAND.maxZ],
      [ISLAND.minX, 8, ISLAND.minZ], [ISLAND.maxX, 8, ISLAND.maxZ],
    ];
    const center = new THREE.Vector3((ISLAND.minX + ISLAND.maxX) / 2, 0, (ISLAND.minZ + ISLAND.maxZ) / 2 + 1);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
    const up = new THREE.Vector3().crossVectors(camDir, right).normalize();
    let maxU = 0, maxV = 0;
    const v = new THREE.Vector3();
    corners.forEach((c2) => {
      v.set(c2[0], c2[1], c2[2]).sub(center);
      maxU = Math.max(maxU, Math.abs(v.dot(right)));
      maxV = Math.max(maxV, Math.abs(v.dot(up)));
    });
    const aspect = stageW() / Math.max(1, stageH());
    const needH = Math.max(maxV * 2 * 1.08, (maxU * 2 * 1.02) / aspect);
    return { center, needH };
  }

  function activateRoom(day) {
    userMoved = true;
    const st = states[day - 1];
    const room = rooms[day - 1];
    if (!st || !st.unlocked) {
      rattle(room);
      api.lockedToast(day);
      return;
    }
    if (REDUCED) { openDoors(room); api.openDay(day); return; }
    // walk there, then step in
    const dist = Math.abs(charLen - room.len);
    if (dist < DOOR_ENTER) {
      openDoors(room);
      setTimeout(() => api.openDay(day), 300);
      return;
    }
    walkTween = {
      from: charLen, to: room.len, t: 0,
      dur: Math.max(0.35, Math.min(3.2, dist / WALK_SPEED)),
      day,
    };
    plates[day - 1].el.classList.add('on'); // destination feedback while walking
    if (!hintDismissed) { hintDismissed = true; hint.classList.add('gone'); }
  }

  function onKeyDown(e) {
    if (REDUCED) return;
    if (document.body.classList.contains('viewing-day')) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    const rect = container.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'd' || k === 's' || k === 'D' || k === 'S') {
      keys.fwd = true; walkTween = null; userMoved = true; e.preventDefault();
    } else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'a' || k === 'w' || k === 'A' || k === 'W') {
      keys.back = true; walkTween = null; e.preventDefault();
    } else if (k === 'Enter' && nearRoomIdx >= 0) {
      activateRoom(rooms[nearRoomIdx].day);
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'd' || k === 's' || k === 'D' || k === 'S') keys.fwd = false;
    if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'a' || k === 'w' || k === 'A' || k === 'W') keys.back = false;
  }
  const keys = { fwd: false, back: false };
  if (!REDUCED) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  // pointer: raycast click + gentle parallax drift
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY, performance.now()]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
    const held = performance.now() - downAt[2];
    downAt = null;
    if (dx * dx + dy * dy > 64 || held > 600) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(rooms.map((r) => r.hit), false);
    if (hits.length) { activateRoom(hits[0].object.userData.day); return; }
    // no room hit: stroll to the nearest point on the path (ground click)
    if (REDUCED) return;
    const gy = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const gp = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(gy, gp)) {
      let bestL = -1, bestD = 20; // ignore clicks far from the path
      for (let i = 0; i <= 200; i++) {
        const l = pathLen * (i / 200);
        const sp = posAt(l);
        const dx = sp.x - gp.x, dz = sp.z - gp.z;
        const dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; bestL = l; }
      }
      if (bestL >= 0) {
        userMoved = true;
        walkTween = { from: charLen, to: bestL, t: 0, dur: Math.max(0.3, Math.min(3.2, Math.abs(charLen - bestL) / WALK_SPEED)), day: null };
        if (!hintDismissed) { hintDismissed = true; hint.classList.add('gone'); }
      }
    }
  });
  let hoverIdx = -1;
  let hoverT = 0;
  function setHover(idx) {
    if (idx === hoverIdx) return;
    if (hoverIdx >= 0 && hoverIdx !== nearRoomIdx) plates[hoverIdx].el.classList.remove('on');
    hoverIdx = idx;
    if (idx >= 0) plates[idx].el.classList.add('on');
    canvas.style.cursor = idx >= 0 ? 'pointer' : '';
  }
  if (!TOUCH && !REDUCED) {
    pin.addEventListener('pointermove', (e) => {
      const rect = pin.getBoundingClientRect();
      driftTX = ((e.clientX - rect.left) / rect.width - 0.5) * 1.6;
      driftTY = ((e.clientY - rect.top) / rect.height - 0.5) * 1.0;
      const now = performance.now();
      if (now - hoverT > 90) {
        hoverT = now;
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(rooms.map((r) => r.hit), false);
        setHover(hits.length ? hits[0].object.userData.day - 1 : -1);
      }
    });
    pin.addEventListener('pointerleave', () => { driftTX = 0; driftTY = 0; setHover(-1); });
  }

  /* ---------- proximity ---------- */
  function updateProximity() {
    let best = -1, bestDist = Infinity;
    rooms.forEach((r, i) => {
      const d = Math.abs(charLen - r.len);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (nearRoomIdx === -1) {
      if (bestDist <= DOOR_ENTER) setNear(best);
    } else {
      const curDist = Math.abs(charLen - rooms[nearRoomIdx].len);
      if (curDist > DOOR_EXIT) setNear(-1);
      else if (best !== nearRoomIdx && bestDist <= DOOR_ENTER && bestDist < curDist) setNear(best);
    }
  }
  function setNear(idx) {
    if (idx === nearRoomIdx) return;
    if (nearRoomIdx >= 0) {
      const old = rooms[nearRoomIdx];
      if (!walkTween) closeDoors(old);
      plates[nearRoomIdx].el.classList.remove('on');
    }
    nearRoomIdx = idx;
    if (idx >= 0) {
      const st = states[idx];
      if (st && st.unlocked) openDoors(rooms[idx]);
      if (userMoved) plates[idx].el.classList.add('on');
    }
  }

  /* ============================================================
     RENDER LOOP
     ============================================================ */
  const clock = new THREE.Clock();
  let paused = false;
  let disposed = false;
  let fatalCb = null;
  let fpsEMA = 60;
  let screenshotFixed = false;
  const projV = new THREE.Vector3();

  function projectPlates() {
    const wpx = stageW(), hpx = stageH();
    rooms.forEach((r, i) => {
      projV.set(r.group.position.x, r.plateAnchorY, r.group.position.z).project(camera);
      const x = (projV.x * 0.5 + 0.5) * wpx;
      const y = (-projV.y * 0.5 + 0.5) * hpx;
      const el = plates[i].el;
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    });
  }

  function tick() {
    if (disposed || paused) return;
    try {
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;

      /* movement */
      if (!REDUCED && !screenshotFixed) {
        if (walkTween) {
          walkTween.t += dt;
          const k = Math.min(1, walkTween.t / walkTween.dur);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
          charLen = walkTween.from + (walkTween.to - walkTween.from) * e;
          if (k >= 1) {
            const day = walkTween.day;
            walkTween = null;
            if (day) {
              const room = rooms[day - 1];
              openDoors(room);
              setTimeout(() => api.openDay(day), 320);
            }
          }
        } else if (keys.fwd || keys.back || Math.abs(charVel) > 0.004) {
          const accel = 0.55 * dt * 60 / 10;
          if (keys.fwd) charVel = Math.min(0.24, charVel + accel * 0.02);
          else if (keys.back) charVel = Math.max(-0.24, charVel - accel * 0.02);
          else charVel *= 0.85;
          charLen = Math.min(pathLen - 0.3, Math.max(0, charLen + charVel * dt * 60));
          if (!hintDismissed && Math.abs(charVel) > 0.05) { hintDismissed = true; hint.classList.add('gone'); }
        }
      }

      const speed = (charLen - lastCharLen) / Math.max(dt, 0.001);
      lastCharLen = charLen;
      const walking = Math.abs(speed) > 0.25;

      /* wonka on the curve */
      const wp = posAt(charLen);
      const wt = tanAt(charLen);
      wonka.position.set(wp.x, 0, wp.z);
      if (walking) facingBack = speed < 0;
      const targetYaw = Math.atan2(wt.x, wt.z) + (facingBack ? Math.PI : 0);
      let dy = targetYaw - wonka.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      wonka.rotation.y += dy * Math.min(1, dt * 9);

      const phi = charLen * (Math.PI * 2 / 1.05);
      const amp = Math.min(1, Math.abs(speed) / 4.5);
      legL.rotation.x = Math.sin(phi) * 0.7 * amp;
      legR.rotation.x = -Math.sin(phi) * 0.7 * amp;
      armL.rotation.x = -Math.sin(phi) * 0.5 * amp;
      armR.rotation.x = Math.sin(phi) * 0.5 * amp + 0.14;
      wBody.position.y = Math.abs(Math.cos(phi)) * 0.06 * amp;
      wBody.rotation.z = Math.sin(phi) * 0.04 * amp;
      wBody.rotation.x = amp * 0.1 * (facingBack ? -1 : 1);
      tailL.rotation.x = 0.25 + Math.sin(phi * 2) * 0.14 * amp + amp * 0.3;
      tailR.rotation.x = 0.25 + Math.cos(phi * 2) * 0.14 * amp + amp * 0.3;
      hat.rotation.z = Math.sin(phi) * 0.03 * amp;
      if (!walking) {
        coat.scale.y = 1 + Math.sin(time * 1.8) * 0.012;
        headGrp.rotation.y = Math.sin(time * 0.4) * 0.35;
      } else {
        coat.scale.y = 1;
        headGrp.rotation.y *= 0.9;
      }

      /* camera: board view with a gentle bias toward Wonka */
      const fit = fitBoardView();
      const bias = walking || walkTween ? 0.22 : 0.12;
      const desired = fit.center.clone().lerp(new THREE.Vector3(wp.x, 0.5, wp.z), bias);
      camTarget.lerp(desired, Math.min(1, dt * 2.2));
      if (introT < 1) introT = Math.min(1, introT + dt / 2.2);
      viewHeightTarget = fit.needH * (walking || walkTween ? 0.9 : 1) * (1 + (1 - introT) * 0.3);
      viewHeight += (viewHeightTarget - viewHeight) * Math.min(1, dt * 2);
      driftX += (driftTX - driftX) * Math.min(1, dt * 3);
      driftY += (driftTY - driftY) * Math.min(1, dt * 3);
      applyCamera();

      if (followSpot) {
        followSpot.position.set(wp.x + 1, 13, wp.z + 1);
        followSpot.target.position.set(wp.x, 0, wp.z);
      }

      updateProximity();

      /* world life */
      if (riverMat) riverMat.uniforms.uTime.value = time;
      const rc = world.userData.riverCurve;
      if (rc && world.userData.candies) {
        world.userData.candies.forEach((cm, i) => {
          cm.userData.u = (cm.userData.u + dt * 0.014) % 1;
          const cp = rc.getPointAt(cm.userData.u);
          cm.position.set(cp.x, 0.22 + Math.sin(time * 2 + i) * 0.04, cp.z);
        });
      }
      (world.userData.gears || []).forEach((gear) => { gear.rotation.z += dt * (gear.userData.spin || 0.3); });
      (world.userData.clouds || []).forEach((c) => {
        c.position.x += dt * c.userData.v;
        if (c.position.x > 68) c.position.x = -68;
      });
      rooms.forEach((r) => {
        if (r.beaconGrp.visible) {
          const s = 1 + Math.sin(time * 2.4) * 0.16;
          r.beaconGrp.userData.ring.scale.setScalar(s);
          r.beaconGrp.userData.ringMat.opacity = 0.5 + Math.sin(time * 2.4) * 0.3;
        }
      });
      particleSystems.forEach((ps) => {
        if (!ps.tick) return;
        const pos = ps.points.geometry.attributes.position;
        for (let i = 0; i < ps.count; i++) ps.tick(i, pos.array, ps.meta[i], dt, time);
        pos.needsUpdate = true;
      });

      projectPlates();
      renderer.render(scene, camera);
      const fps = 1 / Math.max(dt, 0.001);
      fpsEMA += (fps - fpsEMA) * 0.05;
    } catch (err) {
      try { renderer.setAnimationLoop(null); } catch (e2) {}
      if (fatalCb) fatalCb(err);
    }
  }

  function renderOnce() {
    applyCamera();
    projectPlates();
    renderer.render(scene, camera);
  }

  function poseStatic() {
    const cur = states.find((s) => s.isCurrent) || states[0];
    charLen = doorLen[cur.day] || 0;
    const wp = posAt(charLen), wt = tanAt(charLen);
    wonka.position.set(wp.x, 0, wp.z);
    wonka.rotation.y = Math.atan2(wt.x, wt.z);
    const fit = fitBoardView();
    camTarget.copy(fit.center);
    viewHeight = fit.needH;
    updateProximity();
    plates.forEach((p) => { p.el.classList.add('on'); p.el.classList.remove('dim'); });
    renderOnce();
  }

  /* ---------- resize ---------- */
  let resizeT = null;
  function doResize() {
    const headerH = Math.max(0, container.offsetTop);
    pin.style.height = Math.max(320, window.innerHeight - headerH) + 'px';
    renderer.setSize(stageW(), stageH(), false);
    const fit = fitBoardView();
    if (REDUCED || firstFrame) { camTarget.copy(fit.center); viewHeight = fit.needH; }
    applyCamera();
    if (REDUCED) renderOnce();
  }
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(doResize, 160);
  }
  window.addEventListener('resize', onResize);
  // catches the display:none -> visible flip when the host adds body.map-3d
  const ro = new ResizeObserver(() => onResize());
  ro.observe(pin);

  /* ---------- context loss ---------- */
  let ctxLostTimer = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ctxLostTimer = setTimeout(() => { if (fatalCb) fatalCb(new Error('webgl context lost')); }, 3000);
  });
  canvas.addEventListener('webglcontextrestored', () => { clearTimeout(ctxLostTimer); });

  /* ---------- render only while the stage is on screen ---------- */
  let inView = true;
  const io = new IntersectionObserver((entries) => {
    inView = entries[0] ? entries[0].isIntersecting : true;
    if (!REDUCED) {
      if (!inView) renderer.setAnimationLoop(null);
      else if (!paused && !disposed) renderer.setAnimationLoop(tick);
    }
  });
  io.observe(container);

  /* ---------- start ---------- */
  let firstFrame = true;
  doResize();
  applyStates(states);
  {
    // start at the current day, doors in sight
    const cur = states.find((s) => s.isCurrent) || states[0];
    charLen = Math.max(0, (doorLen[cur.day] || 0) - 1.2);
    lastCharLen = charLen;
    const wp0 = posAt(charLen);
    wonka.position.set(wp0.x, 0, wp0.z);
    wonka.rotation.y = Math.atan2(camDir.x, camDir.z); // greet the visitor
    const fit = fitBoardView();
    camTarget.copy(fit.center);
    viewHeight = fit.needH;
  }
  if (followSpot) {
    const wp0 = posAt(charLen);
    followSpot.position.set(wp0.x + 1, 13, wp0.z + 1);
    followSpot.target.position.set(wp0.x, 0, wp0.z);
  }
  // the host adds body.map-3d right after mount resolves . re-measure then
  setTimeout(doResize, 60);
  setTimeout(doResize, 700);
  // cinematic reveal: start a touch wider and glide in while fading up
  let introT = REDUCED ? 1 : 0;
  if (!REDUCED) viewHeight *= 1.3;
  requestAnimationFrame(() => {
    canvas.classList.add('m3d-in');
    titleBox.classList.add('m3d-in');
    cta.classList.add('m3d-in');
  });
  // rAF can be frozen in background tabs . make sure the overlay still shows
  setTimeout(() => {
    canvas.classList.add('m3d-in');
    titleBox.classList.add('m3d-in');
    cta.classList.add('m3d-in');
  }, 400);
  firstFrame = false;
  if (REDUCED) {
    poseStatic();
  } else {
    renderer.setAnimationLoop(tick);
    // paint one frame synchronously: rAF may be frozen (hidden/backgrounded
    // tab) and the page should still show the board, not a blank canvas
    renderOnce();
  }

  /* ============================================================
     CONTROLLER
     ============================================================ */
  const controller = {
    pause() {
      paused = true;
      renderer.setAnimationLoop(null);
    },
    resume() {
      if (disposed) return;
      paused = false;
      doResize();
      clock.getDelta();
      if (REDUCED) { renderOnce(); return; }
      if (inView) renderer.setAnimationLoop(tick);
    },
    setStates(list) {
      applyStates(list);
      if (REDUCED) poseStatic();
    },
    focusDay(day, instant) {
      const l = doorLen[day];
      if (l === undefined) return;
      if (REDUCED) { poseStatic(); return; }
      if (instant) {
        charLen = Math.max(0, l - 1.2);
        walkTween = null;
        const wp = posAt(charLen), wt = tanAt(charLen);
        wonka.position.set(wp.x, 0, wp.z);
        wonka.rotation.y = Math.atan2(wt.x, wt.z);
      } else {
        walkTween = { from: charLen, to: l, t: 0, dur: Math.max(0.35, Math.min(3.2, Math.abs(charLen - l) / WALK_SPEED)), day: null };
      }
    },
    resize() { onResize(); },
    setQuality() {},
    onFatal(cb) { fatalCb = cb; },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (!REDUCED) {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            Object.keys(m).forEach((k) => { if (m[k] && m[k].isTexture) m[k].dispose(); });
            m.dispose();
          });
        }
      });
      renderer.dispose();
      container.innerHTML = '';
    },
    qa: {
      teleport(n) {
        const l = doorLen[n];
        if (l === undefined) return false;
        walkTween = null;
        charLen = Math.max(0, l - 1.2);
        const wp = posAt(charLen);
        wonka.position.set(wp.x, 0, wp.z);
        renderOnce();
        return true;
      },
      forceStates(list) { applyStates(list); return states; },
      screenshotMode(on) {
        screenshotFixed = !!on;
        if (on) {
          const fit = fitBoardView();
          camTarget.copy(fit.center);
          viewHeight = fit.needH;
          driftX = driftY = 0;
          applyCamera();
          renderOnce();
        }
        return screenshotFixed;
      },
      frame(cx, cz, h) {
        screenshotFixed = true;
        camTarget.set(cx, 0.5, cz);
        viewHeight = h || 18;
        driftX = driftY = 0;
        applyCamera();
        renderOnce();
        return true;
      },
      stats() {
        return {
          fps: Math.round(fpsEMA),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          tier, dpr: renderer.getPixelRatio(),
          charLen: Math.round(charLen * 10) / 10,
          nearRoom: nearRoomIdx >= 0 ? rooms[nearRoomIdx].day : null,
          pathLen: Math.round(pathLen),
        };
      },
    },
  };
  return controller;
}
