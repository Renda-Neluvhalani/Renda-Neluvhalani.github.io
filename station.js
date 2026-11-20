// Planet Masase Space Station: Renda Neluvhalani, COS3712 (Unisa).
// The scene is the original project's main.js, adapted to run inside a section of
// this page: it sizes to its container, keyboard input only works once the scene
// is clicked, scroll-zoom only works while it's focused, and on-screen buttons
// mirror the L / B / V / P / O keys.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = document.getElementById('scene');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

//  scene / camera / renderer
const world = new THREE.Scene();
world.background = new THREE.Color(0x110515);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const HOME = new THREE.Vector3(20, 11, 38);
camera.position.copy(HOME);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the Planet Masase space station. Drag to rotate.');
box.prepend(renderer.domElement);
box.classList.add('live');

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;            // turned on once the scene is clicked, so the page still scrolls

//  TEXTURES + procedural ENV MAP + NORMAL MAP
const loader = new THREE.TextureLoader();
function tex(path, rx = 1, ry = 1) {
  const t = loader.load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
const planetTex   = tex('assets/textures/planet-snowy.jpg');
const panelTex    = tex('assets/textures/panel-metal.jpg', 2, 2);
const wallTex     = tex('assets/textures/wall-metal-pink.jpg');
const platformTex = tex('assets/textures/platform-metal-purple.jpg');

function makeEnvCube() {
  const faces = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#3a1c66'); grad.addColorStop(1, '#0a0414');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c39cff';
    for (let s = 0; s < 50; s++) g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    if (i === 2) {
      const rg = g.createRadialGradient(64, 40, 2, 64, 40, 55);
      rg.addColorStop(0, '#fff7e0'); rg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    }
    faces.push(c);
  }
  const cube = new THREE.CubeTexture(faces);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}
const envCube = makeEnvCube();

function makeNormalMap(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#303030'; g.lineWidth = size / 48;
  const n = 8, step = size / n;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size), o = out.data;
  const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const strength = 3.0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz);
    const idx = (y * size + x) * 4;
    o[idx] = (nx / l * 0.5 + 0.5) * 255;
    o[idx + 1] = (ny / l * 0.5 + 0.5) * 255;
    o[idx + 2] = (nz / l * 0.5 + 0.5) * 255;
    o[idx + 3] = 255;
  }
  const nc = document.createElement('canvas'); nc.width = nc.height = size;
  nc.getContext('2d').putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(nc);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}
const panelNormal = makeNormalMap();

//  SHADING SYSTEM (Flat / Gouraud / Phong)
let shadeMode = 'default';
const registry = [];
function surface({ color = 0xffffff, map = null, normalMap = null, envMap = null,
                   reflectivity = 0.5, shininess = 40, specular = 0x333333, role = 'gouraud' }) {
  const base = { color, map, normalMap, envMap };
  const flat    = new THREE.MeshPhongMaterial({ ...base, flatShading: true, shininess, specular });
  const gouraud = new THREE.MeshLambertMaterial({ ...base });
  const phong   = new THREE.MeshPhongMaterial({ ...base, shininess, specular });
  if (envMap) for (const m of [flat, gouraud, phong]) { m.reflectivity = reflectivity; m.combine = THREE.MixOperation; }
  return { flat, gouraud, phong, role };
}
const matFor = (s) => (shadeMode === 'default' ? s[s.role] : s[shadeMode]);
function mesh(geo, surf, parent) {
  const m = new THREE.Mesh(geo, matFor(surf));
  registry.push({ mesh: m, surf });
  if (parent) parent.add(m);
  return m;
}
function applyShading() { for (const e of registry) e.mesh.material = matFor(e.surf); }

const S = {
  structure: surface({ color: 0x6f5a8c, role: 'gouraud', shininess: 30 }),
  wall:      surface({ color: 0xb99, map: wallTex, role: 'gouraud' }),
  cargo:     surface({ color: 0xffffff, map: wallTex, role: 'flat', shininess: 8 }),
  platform:  surface({ color: 0xbba, map: platformTex, role: 'gouraud' }),
  core:      surface({ color: 0x9a86c0, envMap: envCube, reflectivity: 0.9, shininess: 100, specular: 0x888888, role: 'phong' }),
  accent:    surface({ color: 0xd96cff, envMap: envCube, reflectivity: 0.7, shininess: 90, specular: 0x555555, role: 'phong' }),
  panel:     surface({ color: 0xffffff, map: panelTex, normalMap: panelNormal, role: 'phong', shininess: 60, specular: 0x222222 }),
};

//  STARFIELD (one instanced mesh instead of 1,500 separate meshes, same look)
const starGeometry = new THREE.SphereGeometry(0.2, 4, 4);
const starMaterial = new THREE.MeshBasicMaterial({ color: 0xB26FCB });
const stars = new THREE.InstancedMesh(starGeometry, starMaterial, 1500);
const _m = new THREE.Matrix4();
for (let i = 0; i < 1500; i++) {
  _m.makeTranslation((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
  stars.setMatrixAt(i, _m);
}
world.add(stars);

//  PLANET
const planet = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 64), new THREE.MeshPhongMaterial({ map: planetTex, shininess: 6 }));
world.add(planet);

//  SPACE STATION
const station = new THREE.Group();
world.add(station);
const CLUSTER_X = [-2.5, 2.5];

const spine = mesh(new THREE.CylinderGeometry(0.3, 0.3, 5.2, 24), S.structure, station);
spine.rotation.z = Math.PI / 2;
const coreHub = new THREE.Group();
mesh(new THREE.SphereGeometry(0.6, 24, 24), S.core, coreHub);
station.add(coreHub);

const MODULES_PER_CLUSTER = 6;
for (const cx of CLUSTER_X) {
  const cluster = new THREE.Group();
  cluster.position.x = cx;
  const capsule = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 24), S.wall, cluster);
  capsule.rotation.z = Math.PI / 2;
  for (let i = 0; i < MODULES_PER_CLUSTER; i++) {
    const a = (i / MODULES_PER_CLUSTER) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.rotation.x = a;
    const strut = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 12), S.structure, arm);
    strut.position.y = 0.78;
    const mod = mesh(new THREE.SphereGeometry(0.42, 20, 20), S.cargo, arm);
    mod.position.y = 1.25;
    const collar = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16), S.platform, arm);
    collar.position.y = 1.63;
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.06, 12, 24), S.accent, arm);
    ring.position.y = 1.70;
    ring.rotation.x = Math.PI / 2;
    cluster.add(arm);
  }
  station.add(cluster);
}

function makeSolarWing() {
  const g = new THREE.Group();
  const reach = 2.4;
  const boom = mesh(new THREE.CylinderGeometry(0.05, 0.05, reach, 8), S.structure, g);
  boom.position.y = reach / 2;
  const pivot = new THREE.Group();
  pivot.position.y = reach;
  const panel = mesh(new THREE.BoxGeometry(1.7, 1.9, 0.04), S.panel, pivot);
  panel.position.y = 0.95;
  g.add(pivot);
  return { group: g, pivot };
}
const panelPivots = [];
for (const phi of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
  const assembly = new THREE.Group();
  assembly.rotation.x = phi;
  const wing = makeSolarWing();
  assembly.add(wing.group);
  coreHub.add(assembly);
  panelPivots.push(wing.pivot);
}

for (const endX of [-1, 1]) {
  const tower = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.35, 14), S.structure, tower);
  base.rotation.z = Math.PI / 2;
  const mast = mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.0, 14), S.structure, tower);
  mast.rotation.z = Math.PI / 2;
  mast.position.x = endX * 1.1;
  const dish = mesh(new THREE.SphereGeometry(0.8, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2), S.accent, tower);
  dish.position.x = endX * 2.3;
  dish.rotation.z = endX === 1 ? Math.PI / 2 : -Math.PI / 2;
  tower.position.x = endX * 2.7;
  station.add(tower);
}

//  LIGHTING
const ambient = new THREE.AmbientLight(0x33224d, 0.45);
world.add(ambient);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(30, 20, 15);
world.add(sun);
let isDay = true;

const beaconA = new THREE.PointLight(0xff5ea8, 14, 10, 1); beaconA.position.set(2.5, 2.1, 0); station.add(beaconA);
const beaconB = new THREE.PointLight(0x66ccff, 14, 10, 1); beaconB.position.set(-2.5, -2.1, 0); station.add(beaconB);
const hubGlow = new THREE.PointLight(0xffd9a0, 9, 8, 1); coreHub.add(hubGlow);

const dockSpot = new THREE.SpotLight(0x9fe8ff, 70, 16, Math.PI / 7, 0.45, 1);
dockSpot.position.set(2.5, 0, 0); station.add(dockSpot);
dockSpot.target.position.set(2.5, 3.6, 0); station.add(dockSpot.target);

const searchGroup = new THREE.Group(); coreHub.add(searchGroup);
const searchlight = new THREE.SpotLight(0xfff0cc, 90, 26, Math.PI / 10, 0.3, 1);
searchlight.position.set(0, 0.4, 0); searchGroup.add(searchlight);
searchlight.target.position.set(0, 5, 3); searchGroup.add(searchlight.target);

//  SPACECRAFT (5 rockets)
function createShip(color) {
  const ship = new THREE.Group();
  const r = new THREE.Group();
  r.rotation.x = -Math.PI / 2;
  const skin    = surface({ color, role: 'phong', shininess: 70, specular: 0x555555, envMap: envCube, reflectivity: 0.4 });
  const glassS  = surface({ color: 0x8fd4ff, role: 'phong', shininess: 120, specular: 0x99e0ff });
  const nozzleS = surface({ color: 0x3a4150, role: 'gouraud' });
  mesh(new THREE.CapsuleGeometry(0.35, 1.1, 12, 24), skin, r);
  for (const wy of [0.45, 0.15, -0.15]) {
    const win = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), glassS, r);
    win.rotation.x = Math.PI / 2; win.position.set(0, wy, 0.33);
  }
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.55, -0.55); finShape.lineTo(0, -0.55); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false });
  for (const side of [1, -1]) {
    const fin = mesh(finGeo, skin, r);
    fin.position.set(side * 0.33, -0.35, -0.025); fin.scale.x = side;
  }
  const nozzle = mesh(new THREE.CylinderGeometry(0.18, 0.34, 0.3, 20), nozzleS, r);
  nozzle.position.y = -0.95;
  ship.add(r);
  return ship;
}
const shipOrbits = [
  { radius:  8.0, inclX: 0.0,  inclZ: 0.0,  speed:  0.60, color: 0xb388ff },
  { radius:  9.5, inclX: 0.5,  inclZ: 0.2,  speed: -0.45, color: 0xd96cff },
  { radius: 12.5, inclX: -0.9, inclZ: 0.4,  speed:  0.32, color: 0x8f5cff },
  { radius: 11.0, inclX: 1.2,  inclZ: -0.3, speed:  0.80, color: 0x6fd3ff },
  { radius: 18.0, inclX: 0.3,  inclZ: -0.5, speed:  0.20, color: 0xff7eb6 },
];
const ships = [];
for (const o of shipOrbits) {
  const orbit = new THREE.Group();
  orbit.rotation.x = o.inclX; orbit.rotation.z = o.inclZ;
  world.add(orbit);
  const carrier = new THREE.Group();
  orbit.add(carrier);
  const ship = createShip(o.color);
  ship.position.x = o.radius;
  carrier.add(ship);
  ships.push({ carrier, speed: o.speed, angle: Math.random() * Math.PI * 2 });
}

//  INPUT: buttons always work; keys work once the scene has focus
let shipsPaused = reduceMotion, stationPaused = reduceMotion, viewMode = 'orbit';
const keys = {};
const SHADE_CYCLE = ['default', 'flat', 'gouraud', 'phong'];
const SHADE_LABEL = { default: 'Default', flat: 'Flat', gouraud: 'Gouraud', phong: 'Phong' };
const ui = {
  light: document.querySelector('[data-act="light"]'),
  shade: document.querySelector('[data-act="shade"]'),
  view:  document.querySelector('[data-act="view"]'),
  pause: document.querySelector('[data-act="pause"]'),
};
function sync() {
  ui.light.textContent = isDay ? 'Day' : 'Eclipse';
  ui.shade.textContent = 'Shading: ' + SHADE_LABEL[shadeMode];
  ui.view.textContent = viewMode === 'orbit' ? 'Docking view' : 'Orbit view';
  const paused = shipsPaused && stationPaused;
  ui.pause.textContent = paused ? 'Play' : 'Pause';
  ui.pause.setAttribute('aria-pressed', paused);
}
const act = {
  light() { isDay = !isDay; sun.intensity = isDay ? 2.6 : 0.0; ambient.intensity = isDay ? 0.45 : 0.08; },
  shade() { shadeMode = SHADE_CYCLE[(SHADE_CYCLE.indexOf(shadeMode) + 1) % SHADE_CYCLE.length]; applyShading(); },
  view() {
    viewMode = viewMode === 'orbit' ? 'dock' : 'orbit';
    if (viewMode === 'dock') controls.enabled = false;
    else { controls.enabled = true; camera.position.copy(homePos()); controls.target.set(0, 0, 0); }
  },
  pause() { const both = shipsPaused && stationPaused; shipsPaused = stationPaused = !both; },
};
for (const [name, el] of Object.entries(ui)) el.addEventListener('click', () => { act[name](); sync(); });

box.tabIndex = 0;
box.addEventListener('pointerdown', () => box.focus({ preventScroll: true }));
box.addEventListener('focus', () => { controls.enableZoom = true; box.classList.add('focused'); });
box.addEventListener('blur', () => { controls.enableZoom = false; box.classList.remove('focused'); for (const k in keys) keys[k] = false; });
box.addEventListener('keydown', (e) => {
  if (e.target.closest('button')) return;
  const k = e.key.toLowerCase();
  if ('wasd12'.includes(k) && k.length === 1) e.preventDefault();
  keys[k] = true;
  if (k === 'p') shipsPaused = !shipsPaused;
  if (k === 'o') stationPaused = !stationPaused;
  if (k === 'l') act.light();
  if (k === 'b') act.shade();
  if (k === 'v') act.view();
  sync();
});
box.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

const dockAnchor = new THREE.Object3D(); dockAnchor.position.set(2.5, 3.4, 0); station.add(dockAnchor);
const dockTarget = new THREE.Object3D(); dockTarget.position.set(2.5, 1.6, 0); station.add(dockTarget);

const _move = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _look = new THREE.Vector3();
function updateCamera(dt) {
  if (viewMode === 'dock') {
    dockAnchor.getWorldPosition(camera.position);
    dockTarget.getWorldPosition(_look);
    camera.lookAt(_look);
    return;
  }
  const speed = 16 * dt;
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();
  _move.set(0, 0, 0);
  if (keys['w']) _move.add(_fwd);
  if (keys['s']) _move.addScaledVector(_fwd, -1);
  if (keys['d']) _move.add(_right);
  if (keys['a']) _move.addScaledVector(_right, -1);
  if (keys['1']) _move.y += 1;
  if (keys['2']) _move.y -= 1;
  if (_move.lengthSq() > 0) {
    _move.normalize().multiplyScalar(speed);
    camera.position.add(_move); controls.target.add(_move);
  }
  controls.update();
}

// Narrow frames start the camera further back so the whole orbit fits.
function homePos() {
  const a = camera.aspect;
  return HOME.clone().multiplyScalar(a >= 1.3 ? 0.62 : a >= 1 ? 0.8 : Math.min(1.3, 0.8 / a));
}
function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(box);
resize();
camera.position.copy(homePos());
sync();

//  ANIMATION LOOP (pauses while the scene is off-screen)
let onScreen = true;
new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }).observe(box);
const clock = new THREE.Clock();
let stationT = 0, animT = 0;
const ORBIT_RADIUS = 14;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!onScreen) return;
  animT += dt;
  if (!stationPaused) stationT += dt;
  if (!stationPaused) planet.rotation.y += 0.18 * dt;
  station.position.x = Math.cos(stationT * 0.15) * ORBIT_RADIUS;
  station.position.z = Math.sin(stationT * 0.15) * ORBIT_RADIUS;
  station.rotation.y = stationT * 0.1;
  for (const pivot of panelPivots) pivot.rotation.y = stationT * 0.4;
  const pulse = 0.6 + 0.4 * Math.sin(animT * 4);
  beaconA.intensity = 14 * pulse;
  beaconB.intensity = 14 * (1.4 - pulse);
  if (!stationPaused) searchGroup.rotation.y += dt * 0.7;
  if (!shipsPaused) for (const s of ships) { s.angle += s.speed * dt; s.carrier.rotation.y = s.angle; }
  updateCamera(dt);
  renderer.render(world, camera);
});
