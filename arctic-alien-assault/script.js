/* ============================================================
   ARCTIC ALIEN ASSAULT
   First-person 3D shooter built on three.js (no build step).
   ============================================================ */

const CONFIG = {
  playerHitDamage: 3,      // % health lost per alien attack
  alienMaxHealth: 5,       // % health pool of a single regular alien
  armoredAlienMaxHealth: 10, // % health pool of an armored alien (double a regular one)
  armoredChance: 0.35,     // fraction of each squad that spawns armored
  totalLevels: 20,
  bossHealthPerLevel: 10,  // level N boss health = N * 10% (10%, 20%, ... 200%)
  maxAmmoPerGun: 160,
  potionHeal: 50,          // % health restored per potion
  interactRange: 4.5,
  alienAttackRange: 17,
  alienAttackCooldown: 1.8,
  moveSpeed: 7,
  sprintMultiplier: 1.6,
  jumpSpeed: 7,
  gravity: -18,
  eyeHeight: 2.05,          // "very tall" soldier
  mapHalf: 95,              // radius of the core battlefield (spawns, chests)
  worldHalf: 180,           // radius of the walkable world, reaching out to the mountains
};

const WEAPON_TYPES = [
  { name: 'Shotgun', color: 0x2c3b2c, fireCooldown: 0.65, pellets: 3, damage: 2 },
  { name: 'Pulse Rifle', color: 0x3a5a6b, fireCooldown: 0.16, pellets: 1, damage: 3 },
  { name: 'Plasma Blaster', color: 0x5a3a6b, fireCooldown: 0.35, pellets: 1, damage: 4 },
  { name: 'Auto Cannon', color: 0x6b5a3a, fireCooldown: 0.10, pellets: 1, damage: 5 },
];

/* ---------------- Sound (synthesized, no asset files) ---------------- */

const SFX = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep({ freq = 440, duration = 0.08, type = 'square', gain = 0.15, slide = 0 }) {
    try {
      const c = ac();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + duration);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.connect(g).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + duration);
    } catch (e) { /* audio unavailable, ignore */ }
  }
  function crunch() {
    try {
      const c = ac();
      const duration = 0.09;
      const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = c.createBufferSource();
      noise.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100 + Math.random() * 900;
      filter.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      noise.connect(filter).connect(g).connect(c.destination);
      noise.start();
    } catch (e) { /* audio unavailable, ignore */ }
  }
  return {
    footstep: crunch,
    shoot: () => beep({ freq: 180, duration: 0.09, type: 'square', gain: 0.18, slide: -60 }),
    empty: () => beep({ freq: 120, duration: 0.05, type: 'square', gain: 0.08 }),
    alienHit: () => beep({ freq: 500, duration: 0.06, type: 'triangle', gain: 0.12, slide: 200 }),
    alienDie: () => beep({ freq: 300, duration: 0.25, type: 'sawtooth', gain: 0.15, slide: -250 }),
    playerHurt: () => beep({ freq: 140, duration: 0.18, type: 'sawtooth', gain: 0.2, slide: -80 }),
    chestOpen: () => beep({ freq: 220, duration: 0.2, type: 'triangle', gain: 0.15, slide: 100 }),
    pickup: () => beep({ freq: 500, duration: 0.15, type: 'sine', gain: 0.15, slide: 300 }),
    drink: () => beep({ freq: 350, duration: 0.25, type: 'sine', gain: 0.15, slide: 150 }),
    death: () => beep({ freq: 220, duration: 0.9, type: 'sawtooth', gain: 0.2, slide: -180 }),
    denied: () => beep({ freq: 150, duration: 0.1, type: 'square', gain: 0.1 }),
  };
})();

/* ---------------- Renderer / Scene / Camera ---------------- */

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x151f2b, 25, 240);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const playerRig = new THREE.Object3D();
playerRig.position.set(0, CONFIG.eyeHeight, 10);
playerRig.add(camera);
scene.add(playerRig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Sky ---------------- */

function buildSky() {
  const skyGeo = new THREE.SphereGeometry(400, 24, 16);
  const colors = [];
  const pos = skyGeo.attributes.position;
  const top = new THREE.Color(0x040914);
  const horizon = new THREE.Color(0x2c4258);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 400;
    const t = THREE.MathUtils.clamp((y + 0.15) / 0.9, 0, 1);
    const c = top.clone().lerp(horizon, 1 - t);
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}
buildSky();

function auroraTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx2d = c.getContext('2d');
  const grad = ctx2d.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(60,255,150,0)');
  grad.addColorStop(0.5, 'rgba(60,255,150,0.35)');
  grad.addColorStop(0.75, 'rgba(140,80,255,0.25)');
  grad.addColorStop(1, 'rgba(60,255,150,0)');
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const auroraStrips = [];
for (let i = 0; i < 3; i++) {
  const tex = auroraTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), mat);
  mesh.position.set((i - 1) * 70, 90 + i * 8, -180 - i * 20);
  mesh.rotation.x = Math.PI / 2.4;
  mesh.rotation.z = (i - 1) * 0.2;
  scene.add(mesh);
  auroraStrips.push(mesh);
}

/* ---------------- Lighting ---------------- */

scene.add(new THREE.HemisphereLight(0x8fb3ff, 0xdfe9f0, 0.65));
const sun = new THREE.DirectionalLight(0xcfe0ff, 0.7);
sun.position.set(-60, 50, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x445566, 0.3));

/* ---------------- Ground & Environment ---------------- */

function buildGround() {
  const size = (CONFIG.worldHalf + 20) * 2;
  const geo = new THREE.PlaneGeometry(size, size, 90, 90);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const bump = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.6 + Math.sin(x * 0.15 + y * 0.1) * 0.25;
    pos.setZ(i, bump);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe7eef2, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
buildGround();

const obstacles = []; // {position, radius} for simple collision

/* ---------------- Wood Textures (bark lines, end-grain rings) ---------------- */

function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const ctx2d = c.getContext('2d');
  ctx2d.fillStyle = '#3b2a20';
  ctx2d.fillRect(0, 0, 32, 64);
  ctx2d.strokeStyle = '#241a13';
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * 32 + Math.random() * 2;
    ctx2d.lineWidth = 1 + Math.random();
    ctx2d.beginPath();
    ctx2d.moveTo(x, 0);
    for (let y = 0; y <= 64; y += 8) ctx2d.lineTo(x + (Math.random() - 0.5) * 4, y);
    ctx2d.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function woodRingTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx2d = c.getContext('2d');
  ctx2d.fillStyle = '#c9a26b';
  ctx2d.fillRect(0, 0, 64, 64);
  const cx = 32, cy = 32;
  ctx2d.strokeStyle = '#8a6234';
  for (let r = 4; r < 30; r += 3.2) {
    ctx2d.lineWidth = 1 + Math.random() * 0.8;
    ctx2d.beginPath();
    // slightly irregular, spiral-leaning rings for a hand-cut look
    ctx2d.arc(cx + Math.sin(r) * 1.5, cy + Math.cos(r) * 1.5, r, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  ctx2d.fillStyle = '#6b4423';
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, 2.2, 0, Math.PI * 2);
  ctx2d.fill();
  return new THREE.CanvasTexture(c);
}

function logWallTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx2d = c.getContext('2d');
  const courseH = 128 / 6;
  for (let row = 0; row < 6; row++) {
    const y = row * courseH;
    ctx2d.fillStyle = row % 2 === 0 ? '#75512f' : '#6b4a30';
    ctx2d.fillRect(0, y, 128, courseH);
    ctx2d.strokeStyle = '#3f2a19';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, y + courseH - 1);
    ctx2d.lineTo(128, y + courseH - 1);
    ctx2d.stroke();
    ctx2d.strokeStyle = 'rgba(40,25,15,0.35)';
    ctx2d.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const gy = y + 2 + Math.random() * (courseH - 4);
      ctx2d.beginPath();
      ctx2d.moveTo(0, gy);
      for (let x = 0; x <= 128; x += 16) ctx2d.lineTo(x, gy + (Math.random() - 0.5) * 3);
      ctx2d.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });
const woodRingMat = new THREE.MeshStandardMaterial({ map: woodRingTexture(), roughness: 0.9 });
const logWallMat = new THREE.MeshStandardMaterial({ map: logWallTexture(), roughness: 0.95 });

function addTree(x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6),
    [barkMat, woodRingMat, woodRingMat]
  );
  trunk.position.y = 0.8;
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1c3b2e, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const radius = 1.4 - i * 0.35;
    const y = 1.6 + i * 1.1;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.6, 7), foliageMat);
    cone.position.y = y;
    cone.castShadow = true;
    group.add(cone);

    // snow cap: a smaller white cone sharing the same apex, covering the upper slopes
    const snowCap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.78, 0.85, 7), snowMat);
    snowCap.position.y = y + 0.35;
    snowCap.castShadow = true;
    group.add(snowCap);
  }
  trunk.castShadow = true;
  group.add(trunk);
  group.position.set(x, 0, z);
  scene.add(group);
  obstacles.push({ x, z, radius: 0.9 });
}

const rockSnowMat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 0.85, flatShading: true });

function addRock(x, z, scale) {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x8b95a0, roughness: 1, flatShading: true })
  );
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);

  // snow drift on top -- kept unrotated so it always sits facing world-up
  const snowCap = new THREE.Mesh(new THREE.IcosahedronGeometry(scale * 0.65, 0), rockSnowMat);
  snowCap.position.y = scale * 0.5;
  snowCap.scale.set(1, 0.55, 1);
  snowCap.castShadow = true;
  group.add(snowCap);

  group.position.set(x, scale * 0.4, z);
  scene.add(group);
  obstacles.push({ x, z, radius: scale * 0.9 });
}

function addFirewoodPile(x, z, rotY) {
  const group = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8);
  const rows = [[0, 0.16], [-0.17, 0.48], [0.17, 0.48], [0, 0.8]];
  for (const [ox, oy] of rows) {
    const log = new THREE.Mesh(logGeo, [barkMat, woodRingMat, woodRingMat]);
    log.rotation.z = Math.PI / 2;
    log.position.set(ox, oy, 0);
    log.castShadow = true;
    group.add(log);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
}

function addCabin(x, z, rotY) {
  const group = new THREE.Group();
  const width = 4.2, depth = 3.6, wallHeight = 2.4;
  const wallThickness = 0.25;
  const doorWidth = 1.8, doorHeight = 1.9, doorHalfWidth = doorWidth / 2;

  const addWallBox = (w, h, d, px, py, pz) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), logWallMat);
    box.position.set(px, py, pz);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  };

  // back + side walls, solid
  addWallBox(width, wallHeight, wallThickness, 0, wallHeight / 2, -depth / 2 + wallThickness / 2);
  addWallBox(wallThickness, wallHeight, depth, -width / 2 + wallThickness / 2, wallHeight / 2, 0);
  addWallBox(wallThickness, wallHeight, depth, width / 2 - wallThickness / 2, wallHeight / 2, 0);

  // front wall: two segments flanking a real doorway, plus a lintel above it
  const frontSegW = (width - doorWidth) / 2;
  addWallBox(frontSegW, wallHeight, wallThickness, -(doorHalfWidth + frontSegW / 2), wallHeight / 2, depth / 2 - wallThickness / 2);
  addWallBox(frontSegW, wallHeight, wallThickness, doorHalfWidth + frontSegW / 2, wallHeight / 2, depth / 2 - wallThickness / 2);
  const lintelH = wallHeight - doorHeight;
  if (lintelH > 0.05) {
    addWallBox(doorWidth, lintelH, wallThickness, 0, doorHeight + lintelH / 2, depth / 2 - wallThickness / 2);
  }

  // stacked log-ends poking out at the corners, the classic log-cabin joint look
  const logEndGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.55, 8);
  for (const xSign of [-1, 1]) {
    for (const zSide of [-depth / 2, depth / 2]) {
      for (let level = 0; level < 4; level++) {
        const logEnd = new THREE.Mesh(logEndGeo, [barkMat, woodRingMat, woodRingMat]);
        logEnd.rotation.z = Math.PI / 2;
        logEnd.position.set(xSign * (width / 2 + 0.05), 0.35 + level * 0.5, zSide);
        group.add(logEnd);
      }
    }
  }

  // pitched, snow-capped roof
  const rise = 1.2;
  const halfDepth = depth / 2 + 0.35;
  const slopeLen = Math.sqrt(halfDepth * halfDepth + rise * rise);
  const roofAngle = Math.atan2(rise, halfDepth);
  const roofGeo = new THREE.BoxGeometry(width + 0.6, 0.15, slopeLen);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xeef4fa, roughness: 0.85 });

  const roofA = new THREE.Mesh(roofGeo, roofMat);
  roofA.rotation.x = roofAngle;
  roofA.position.set(0, wallHeight + rise / 2, halfDepth / 2);
  roofA.castShadow = true;
  group.add(roofA);

  const roofB = new THREE.Mesh(roofGeo, roofMat);
  roofB.rotation.x = -roofAngle;
  roofB.position.set(0, wallHeight + rise / 2, -halfDepth / 2);
  roofB.castShadow = true;
  group.add(roofB);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.9, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x5a5450, roughness: 1 })
  );
  chimney.position.set(width / 4, wallHeight + rise + 0.2, -halfDepth / 4);
  chimney.castShadow = true;
  group.add(chimney);

  const windowMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffaa33, emissiveIntensity: 1.2, roughness: 0.4 })
  );
  windowMesh.position.set(width / 2 + 0.03, 1.5, 0);
  windowMesh.rotation.y = Math.PI / 2;
  group.add(windowMesh);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  addCabinWalls(x, z, rotY, width, depth, doorHalfWidth);

  const woodX = x + Math.sin(rotY) * (depth / 2 + 1.2);
  const woodZ = z + Math.cos(rotY) * (depth / 2 + 1.2);
  addFirewoodPile(woodX, woodZ, rotY);
}

// Blocks the walls with a chain of small circles, leaving the door gap clear
// so the player collides with the cabin but can walk in the doorway. Circles
// use a small radius so their reach (radius + the player's 0.6 buffer) can't
// overreach back into the gap, matching the real opening in the wall mesh.
function addCabinWalls(x, z, rotY, width, depth, doorHalfWidth) {
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const r = 0.15;
  const push = (lx, lz) => {
    obstacles.push({ x: x + lx * cos + lz * sin, z: z + (-lx * sin + lz * cos), radius: r });
  };
  const step = 0.5;
  for (let lx = -width / 2 + r; lx <= width / 2 - r; lx += step) push(lx, -depth / 2);
  for (let lx = doorHalfWidth; lx <= width / 2 - r; lx += step) push(lx, depth / 2);
  for (let lx = -doorHalfWidth; lx >= -(width / 2 - r); lx -= step) push(lx, depth / 2);
  for (let lz = -depth / 2 + r; lz <= depth / 2 - r; lz += step) {
    push(-width / 2, lz);
    push(width / 2, lz);
  }
}

const CABIN_POSITIONS = [
  [58, 52, 0.3], [-62, 38, -0.5], [48, -58, 1.1], [-52, -48, 2.4], [4, 72, 0.8],
];

const mountains = []; // {x, z, radius, height, centerY} -- also used as climbable terrain

function scatterEnvironment() {
  const half = CONFIG.mapHalf;
  for (let i = 0; i < 55; i++) {
    const x = (Math.random() - 0.5) * half * 2;
    const z = (Math.random() - 0.5) * half * 2;
    if (Math.hypot(x, z) < 12) continue;
    addTree(x, z);
  }
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * half * 2;
    const z = (Math.random() - 0.5) * half * 2;
    if (Math.hypot(x, z) < 8) continue;
    addRock(x, z, 0.6 + Math.random() * 1.1);
  }
  for (const [cx, cz, rotY] of CABIN_POSITIONS) addCabin(cx, cz, rotY);
  // climbable mountains ringing the battlefield
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x3d4f63, roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const r = half + 30 + Math.random() * 20;
    const radius = 18 + Math.random() * 12;
    const height = 40 + Math.random() * 30;
    const centerY = 15;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), mountainMat);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    mesh.position.set(x, centerY, z);
    scene.add(mesh);
    mountains.push({ x, z, radius, height, centerY });
  }
}
scatterEnvironment();

// Ground height at any (x, z): the gentle snow bumps, or a mountain's slope
// when standing on one -- lets the player walk up and climb the mountains.
function terrainHeightAt(x, z) {
  let h = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.6 + Math.sin(x * 0.15 + z * 0.1) * 0.25;
  for (const m of mountains) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.radius) {
      const slopeY = m.centerY + m.height / 2 - d * (m.height / m.radius);
      if (slopeY > h) h = slopeY;
    }
  }
  return h;
}

/* ---------------- Falling Snow ---------------- */

function snowflakeTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx2d = c.getContext('2d');
  const grad = ctx2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.arc(16, 16, 16, 0, Math.PI * 2);
  ctx2d.fill();
  return new THREE.CanvasTexture(c);
}

function buildSnowfall() {
  const count = 1000;
  const range = CONFIG.mapHalf * 1.3;
  const ceiling = 55;
  const positions = new Float32Array(count * 3);
  const fallSpeed = new Float32Array(count);
  const swayPhase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * range * 2;
    positions[i * 3 + 1] = Math.random() * ceiling;
    positions[i * 3 + 2] = (Math.random() - 0.5) * range * 2;
    fallSpeed[i] = 2 + Math.random() * 3;
    swayPhase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.22,
    map: snowflakeTexture(),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, positions, fallSpeed, swayPhase, count, range, ceiling };
}

const snowfall = buildSnowfall();

function updateSnowfall(dt) {
  const pos = snowfall.positions;
  for (let i = 0; i < snowfall.count; i++) {
    pos[i * 3 + 1] -= snowfall.fallSpeed[i] * dt;
    snowfall.swayPhase[i] += dt * 0.6;
    pos[i * 3] += Math.sin(snowfall.swayPhase[i]) * 0.15 * dt;
    if (pos[i * 3 + 1] < -2) {
      pos[i * 3 + 1] = snowfall.ceiling;
      pos[i * 3] = (Math.random() - 0.5) * snowfall.range * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * snowfall.range * 2;
    }
  }
  snowfall.points.geometry.attributes.position.needsUpdate = true;
}

/* ---------------- Shared Geometry Helpers ---------------- */
// three.js r128 (loaded via CDN) predates CapsuleGeometry, so build capsules
// from a cylinder + two sphere caps instead.
function makeCapsule(radius, length, material, castShadow = false) {
  const group = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
  capTop.position.y = length / 2;
  const capBottom = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
  capBottom.position.y = -length / 2;
  if (castShadow) { cyl.castShadow = true; capTop.castShadow = true; capBottom.castShadow = true; }
  group.add(cyl, capTop, capBottom);
  return group;
}

/* ---------------- Player Weapon Viewmodel ---------------- */

const weaponGroup = new THREE.Group();
weaponGroup.position.set(0.32, -0.32, -0.6);
camera.add(weaponGroup);

function buildGunMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.12, 0.55),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 })
  );
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.4, metalness: 0.6 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.45);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.2, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
  );
  grip.position.set(0, -0.14, 0.15);
  g.add(body, barrel, grip);
  return g;
}

const muzzleFlash = new THREE.PointLight(0xfff2b0, 0, 4);
muzzleFlash.position.set(0, 0.05, -0.9);
weaponGroup.add(muzzleFlash);

let currentGunMesh = null;
function setGunVisual(color) {
  if (currentGunMesh) weaponGroup.remove(currentGunMesh);
  currentGunMesh = buildGunMesh(color);
  weaponGroup.add(currentGunMesh);
}

/* ---------------- Soldier Preview (start screen) ---------------- */

function buildSoldierPreview() {
  const pc = document.getElementById('preview-canvas');
  const pRenderer = new THREE.WebGLRenderer({ canvas: pc, antialias: true, alpha: true });
  pRenderer.setSize(160, 200);
  pRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const pScene = new THREE.Scene();
  const pCam = new THREE.PerspectiveCamera(35, 160 / 200, 0.1, 20);
  pCam.position.set(0, 1.1, 4.2);
  pCam.lookAt(0, 0.9, 0);

  pScene.add(new THREE.HemisphereLight(0xbcd8ff, 0x203020, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(2, 3, 3);
  pScene.add(key);

  const armorMat = new THREE.MeshStandardMaterial({ color: 0x203c26, roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.6 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x2ea6ff, emissive: 0x0d3a55, roughness: 0.2, metalness: 0.6 });

  const soldier = new THREE.Group();
  const torso = makeCapsule(0.42, 0.9, armorMat);
  torso.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), armorMat);
  head.position.y = 1.55;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.06), visorMat);
  visor.position.set(0, 1.57, 0.3);
  const legL = makeCapsule(0.16, 0.7, darkMat);
  legL.position.set(-0.2, 0.05, 0);
  const legR = legL.clone();
  legR.position.x = 0.2;
  const armL = makeCapsule(0.13, 0.75, armorMat);
  armL.position.set(-0.56, 0.75, 0);
  const armR = armL.clone();
  armR.position.x = 0.56;

  soldier.add(torso, head, visor, legL, legR, armL, armR);
  pScene.add(soldier);

  function animatePreview() {
    requestAnimationFrame(animatePreview);
    soldier.rotation.y += 0.012;
    pRenderer.render(pScene, pCam);
  }
  animatePreview();
}
buildSoldierPreview();

/* ---------------- Chests ---------------- */

const CHEST_POSITIONS = [
  [18, -14], [-24, 10], [28, 26], [-30, -22], [2, 40],
  [40, -6], [-40, 18], [10, -38], [-14, 34], [46, 30],
];

class Chest {
  constructor(x, z) {
    this.state = 'closed'; // closed -> open -> looted
    this.loot = Math.random() < 0.45 ? 'potion' : 'weapon';
    this.weaponType = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];

    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a7043, roughness: 0.5, metalness: 0.4 });

    this.base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), baseMat);
    this.base.position.y = 0.3;
    this.base.castShadow = true;

    this.lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 0.75), trimMat);
    this.lid.geometry.translate(0, 0, 0.35); // pivot at the hinge edge, not the center
    this.lid.position.set(0, 0.6, -0.35);
    this.lid.castShadow = true;

    this.group.add(this.base, this.lid);

    this.glow = new THREE.PointLight(0x7dffb3, 0.8, 3);
    this.glow.position.set(0, 1, 0);
    this.group.add(this.glow);

    scene.add(this.group);
  }

  distanceTo(pos) {
    return Math.hypot(this.group.position.x - pos.x, this.group.position.z - pos.z);
  }

  open() {
    this.state = 'open';
    this._lidT = 0;
    SFX.chestOpen();
  }

  update(dt) {
    if (this.state === 'open' && this._lidT < 1) {
      this._lidT = Math.min(1, this._lidT + dt * 2.2);
      this.lid.rotation.x = -this._lidT * (Math.PI / 1.6);
    }
    this.glow.intensity = this.state === 'open' ? 0 : 0.6 + Math.sin(performance.now() * 0.003) * 0.3;
  }
}

const chests = CHEST_POSITIONS.map(([x, z]) => new Chest(x, z));

/* ---------------- Aliens ---------------- */

class Alien {
  constructor(opts = {}) {
    const isBoss = !!opts.isBoss;
    const isArmored = !isBoss && !!opts.isArmored;
    this.isBoss = isBoss;
    this.isArmored = isArmored;
    const maxHealth = isBoss
      ? opts.level * CONFIG.bossHealthPerLevel
      : (isArmored ? CONFIG.armoredAlienMaxHealth : CONFIG.alienMaxHealth);
    this.health = maxHealth;
    this.maxHealth = maxHealth;
    this.attackCooldownScale = isBoss ? 0.65 : 1;
    this.attackTimer = Math.random() * CONFIG.alienAttackCooldown * this.attackCooldownScale;
    this.dead = false;
    this.speed = ((isBoss ? 3.2 : 2.6) + Math.random() * 1.2) * (isArmored ? 0.85 : 1);
    this.preferredRange = isBoss ? 8 + Math.random() * 4 : 10 + Math.random() * 6;

    const bodyColor = isBoss ? 0x6b2d8b : 0x3d8b5c;
    const emissiveColor = isBoss ? 0x2d0e3d : 0x0e3d22;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, emissive: emissiveColor, roughness: 0.4, metalness: 0.3 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15, metalness: 0.1 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.4, metalness: 0.5 });
    const coreColor = isBoss ? 0xffaa22 : 0x7dffb3;
    const coreMat = new THREE.MeshStandardMaterial({ color: coreColor, emissive: coreColor, emissiveIntensity: 2 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x5a6473, roughness: 0.35, metalness: 0.8 });

    this.group = new THREE.Group();
    const torso = makeCapsule(0.45, 1.0, bodyMat, true);
    torso.position.y = 1.1;

    // long visible neck connecting the torso to a large bulbous head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 8), bodyMat);
    neck.position.y = 2.25;
    neck.castShadow = true;

    const headY = 2.78;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), bodyMat);
    head.position.y = headY;
    head.scale.set(1.2, 1.05, 1.0); // large bulbous cranium
    head.castShadow = true;

    // large solid-black almond eyes
    const eyeGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, headY - 0.03, 0.33);
    eyeL.scale.set(1.5, 0.85, 0.7);
    eyeL.rotation.y = 0.35;
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.18;
    eyeR.rotation.y = -0.35;

    // visible outer ears
    const earGeo = new THREE.ConeGeometry(0.1, 0.24, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(-0.44, headY, 0.02);
    earL.scale.set(0.35, 1, 0.7);
    earL.rotation.z = -0.45;
    earL.rotation.x = 0.15;
    earL.castShadow = true;
    const earR = earL.clone();
    earR.position.x = 0.44;
    earR.rotation.z = 0.45;

    const antennaGeo = new THREE.CylinderGeometry(0.02, 0.008, 0.35, 5);
    const antennaL = new THREE.Mesh(antennaGeo, bodyMat);
    antennaL.position.set(-0.13, headY + 0.34, -0.05);
    antennaL.rotation.set(-0.5, 0, 0.3);
    const antennaR = antennaL.clone();
    antennaR.position.x = 0.13;
    antennaR.rotation.z = -0.3;

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), bodyMat);
    armL.position.set(-0.55, 1.15, 0);
    armL.rotation.z = 0.3;
    const armR = armL.clone();
    armR.position.x = 0.55;
    armR.rotation.z = -0.3;

    const clawL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), clawMat);
    clawL.position.set(-0.45, 0.72, 0);
    clawL.rotation.z = Math.PI;
    const clawR = clawL.clone();
    clawR.position.x = 0.45;

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), coreMat);
    core.position.set(0, 1.15, 0.42);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 })
    );
    gun.position.set(0.75, 1.05, 0.15);
    this.gunMesh = gun;

    this.group.add(torso, neck, head, eyeL, eyeR, earL, earR, antennaL, antennaR, armL, armR, clawL, clawR, core, gun);

    if (isArmored) {
      const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.26), armorMat);
      chestPlate.position.set(0, 1.25, 0.26);
      chestPlate.castShadow = true;
      const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.32), armorMat);
      shoulderL.position.set(-0.56, 1.55, 0);
      shoulderL.castShadow = true;
      const shoulderR = shoulderL.clone();
      shoulderR.position.x = 0.56;
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
        armorMat
      );
      helmet.position.y = headY;
      helmet.castShadow = true;
      this.group.add(chestPlate, shoulderL, shoulderR, helmet);
    }

    if (isBoss) this.group.scale.setScalar(1.7);
    else if (isArmored) this.group.scale.setScalar(1.15);

    this.hpBarBg = makeBillboardBar(0x222222);
    this.hpBarFill = makeBillboardBar(isBoss ? 0xd23dff : (isArmored ? 0xffa33d : 0xff3d3d));
    this.hpBarBg.position.y = 3.6;
    this.hpBarFill.position.y = 3.6;
    this.hpBarFill.position.z = 0.001;
    this.group.add(this.hpBarBg, this.hpBarFill);

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnRadius = isBoss ? 26 + Math.random() * 10 : 55 + Math.random() * 25;
    this.group.position.set(Math.cos(spawnAngle) * spawnRadius, 0, Math.sin(spawnAngle) * spawnRadius);

    scene.add(this.group);
  }

  updateHpBar() {
    const pct = Math.max(0, this.health / this.maxHealth);
    this.hpBarFill.scale.x = Math.max(0.001, pct);
    this.hpBarFill.position.x = -(1 - pct) * 0.3;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.updateHpBar();
    SFX.alienHit();
    if (this.health <= 0) this.die();
  }

  die() {
    this.dead = true;
    SFX.alienDie();
    scene.remove(this.group);
    state.kills++;
    updateHUD();
    if (this.isBoss) {
      hideBossBar();
      onBossDefeated();
    }
  }

  update(dt, playerPos) {
    if (this.dead) return;
    this.group.lookAt(playerPos.x, this.group.position.y, playerPos.z);
    const dist = this.group.position.distanceTo(new THREE.Vector3(playerPos.x, this.group.position.y, playerPos.z));

    if (dist > this.preferredRange + 1) {
      const dir = new THREE.Vector3(playerPos.x - this.group.position.x, 0, playerPos.z - this.group.position.z).normalize();
      this.group.position.addScaledVector(dir, this.speed * dt);
    }

    this.attackTimer -= dt;
    if (dist <= CONFIG.alienAttackRange && this.attackTimer <= 0) {
      this.attackTimer = CONFIG.alienAttackCooldown * this.attackCooldownScale + Math.random() * 0.6;
      this.fireAt(playerPos);
    }

    this.hpBarBg.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    this.hpBarFill.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  fireAt(playerPos) {
    const muzzle = new THREE.Vector3();
    this.gunMesh.getWorldPosition(muzzle);
    spawnAlienProjectile(muzzle, playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)));
  }
}

function makeBillboardBar(color) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.08),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  mesh.renderOrder = 10;
  return mesh;
}

const aliens = [];
const alienProjectiles = [];

function spawnAlienProjectile(from, to) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5544 })
  );
  mesh.position.copy(from);
  const light = new THREE.PointLight(0xff5544, 1, 3);
  mesh.add(light);
  scene.add(mesh);
  const dir = to.clone().sub(from).normalize();
  alienProjectiles.push({ mesh, dir, speed: 26, life: 2.5, target: to });
}

/* ---------------- Game State ---------------- */

const state = {
  health: 100,
  potions: 0,
  kills: 0,
  level: 1,
  levelPhase: 'squad', // 'squad' (clearing regular aliens) -> 'boss' (checkpoint fight)
  boss: null,
  alienIsAlive: () => aliens.some(a => !a.dead),
  running: false,
  paused: true,
  gameOver: false,
  velocityY: 0,
  onGround: true,
  activeChest: null,
  quizActive: false,
};

const quizStats = { correct: 0, asked: 0 };

const inventory = {
  weapons: [
    { type: WEAPON_TYPES[0], ammo: CONFIG.maxAmmoPerGun },
  ],
  activeIndex: 0,
};

function activeWeapon() {
  return inventory.weapons[inventory.activeIndex];
}

setGunVisual(activeWeapon().type.color);

/* ---------------- Input ---------------- */

const keys = {};
let fireCooldownLeft = 0;
let footstepTimer = 0;
let yaw = 0, pitch = 0;

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && !e.repeat) { togglePause(); return; }
  if (!state.running || state.paused) return;

  if (e.code === 'KeyE' && !e.repeat) tryOpenChest();
  if (e.code === 'KeyD' && !e.repeat) drinkPotion();
  if (e.code === 'Space' && !e.repeat) handleAction();
  if (e.code === 'KeyF' && !e.repeat) {
    inventory.activeIndex = (inventory.activeIndex + 1) % inventory.weapons.length;
    setGunVisual(activeWeapon().type.color);
    updateHUD();
  }
  if (e.code === 'KeyJ' && state.onGround) {
    state.velocityY = CONFIG.jumpSpeed;
    state.onGround = false;
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2.3, Math.PI / 2.3);
  playerRig.rotation.y = yaw;
  camera.rotation.x = pitch;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    hide('pause-screen');
    state.paused = false;
  } else if (state.running && !state.gameOver && !state.quizActive) {
    show('pause-screen');
    state.paused = true;
  }
});

document.addEventListener('pointerlockerror', () => {
  if (state.running && !state.gameOver && !state.quizActive) {
    show('pause-screen');
    state.paused = true;
  }
});

function togglePause() {
  if (!state.running || state.gameOver || state.quizActive) return;
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock(); // pointerlockchange shows the pause screen and sets state.paused
  } else if (state.paused) {
    canvas.requestPointerLock(); // pointerlockchange hides the pause screen and clears state.paused
  }
}

/* ---------------- Shooting ---------------- */

const raycaster = new THREE.Raycaster();

function shoot() {
  if (state.gameOver) return;
  const wpn = activeWeapon();
  if (fireCooldownLeft > 0) return;
  if (wpn.ammo <= 0) { SFX.empty(); flashToast('OUT OF AMMO'); return; }

  fireCooldownLeft = wpn.type.fireCooldown;
  wpn.ammo--;
  SFX.shoot();
  muzzleFlash.intensity = 3.5;

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);

  const pellets = wpn.type.pellets || 1;
  const hitAliens = new Set();
  for (let p = 0; p < pellets; p++) {
    const spread = wpn.type.pellets > 1 ? 0.06 : 0.01;
    const dir = camDir.clone();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    raycaster.set(camPos, dir);
    raycaster.far = 80;

    const meshes = aliens.filter(a => !a.dead).map(a => a.group);
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      const alien = aliens.find(a => a.group === hits[0].object || a.group.getObjectById(hits[0].object.id));
      if (alien) hitAliens.add(alien);
    }
  }
  hitAliens.forEach(a => a.takeDamage(wpn.type.damage));

  updateHUD();
}

/* ---------------- Interaction: chests & potions ---------------- */

function findNearestChest() {
  let nearest = null, best = Infinity;
  for (const c of chests) {
    const d = c.distanceTo(playerRig.position);
    if (d < best) { best = d; nearest = c; }
  }
  return best <= CONFIG.interactRange ? nearest : null;
}

function tryOpenChest() {
  const chest = findNearestChest();
  if (chest && chest.state === 'closed') chest.open();
}

function tryPickUpChest() {
  const chest = findNearestChest();
  if (!chest || chest.state !== 'open') return;

  if (chest.loot === 'potion') {
    state.potions++;
    flashToast('+1 HEALING BOTTLE');
  } else {
    const existing = inventory.weapons.find(w => w.type.name === chest.weaponType.name);
    if (existing) {
      existing.ammo = Math.min(CONFIG.maxAmmoPerGun, existing.ammo + CONFIG.maxAmmoPerGun);
      flashToast(`${chest.weaponType.name} AMMO REFILLED`);
    } else {
      inventory.weapons.push({ type: chest.weaponType, ammo: CONFIG.maxAmmoPerGun });
      flashToast(`PICKED UP ${chest.weaponType.name.toUpperCase()}`);
    }
  }
  SFX.pickup();
  chest.state = 'looted';
  chest.glow.intensity = 0;
  updateHUD();
}

function drinkPotion() {
  if (state.potions <= 0) { SFX.denied(); flashToast('NO POTIONS LEFT'); return; }
  if (state.health >= 100) { flashToast('HEALTH ALREADY FULL'); return; }
  state.potions--;
  state.health = Math.min(100, state.health + CONFIG.potionHeal);
  SFX.drink();
  flashToast(`+${CONFIG.potionHeal}% HEALTH`);
  updateHUD();
}

/* ---------------- Space bar: the one action button ---------------- */
// E opens a chest, A drinks a potion. Space grabs a chest's loot if
// you're standing next to one, otherwise it shoots.

function handleAction() {
  const chest = findNearestChest();
  if (chest && chest.state === 'open') { tryPickUpChest(); return; }

  if (activeWeapon().ammo > 0) { shoot(); return; }

  SFX.empty();
  flashToast('OUT OF AMMO');
}

/* ---------------- Damage / Death ---------------- */

function damagePlayer(amount) {
  if (state.gameOver) return;
  state.health = Math.max(0, state.health - amount);
  SFX.playerHurt();
  flashDamage();
  updateHUD();
  if (state.health <= 0) killPlayer();
}

function killPlayer() {
  state.gameOver = true;
  state.paused = true;
  SFX.death();
  document.exitPointerLock();
  showQuiz({
    title: 'YOU DIED',
    subtitle: 'Answer correctly before you can redeploy',
    onComplete: () => {
      document.getElementById('death-stats').textContent =
        `You made it to Level ${state.level} of ${CONFIG.totalLevels} with ${state.kills} confirmed kills. ` +
        `Brainpower: ${quizStats.correct}/${quizStats.asked}.`;
      show('death-screen');
    },
  });
}

/* ---------------- HUD helpers ---------------- */

const healthFill = document.getElementById('health-bar-fill');
const healthText = document.getElementById('health-text');
const weaponName = document.getElementById('weapon-name');
const ammoText = document.getElementById('ammo-text');
const potionCount = document.getElementById('potion-count');
const levelNumEl = document.getElementById('level-num');
const killNum = document.getElementById('kill-num');
const quizScoreEl = document.getElementById('quiz-score');
const promptEl = document.getElementById('prompt');
const toastEl = document.getElementById('toast');
const damageFlashEl = document.getElementById('damage-flash');
const bossLabelEl = document.getElementById('boss-label');
const bossBarFillEl = document.getElementById('boss-bar-fill');

function updateHUD() {
  healthFill.style.width = `${state.health}%`;
  healthText.textContent = `${Math.round(state.health)}%`;
  const wpn = activeWeapon();
  weaponName.textContent = wpn.type.name;
  ammoText.textContent = `${wpn.ammo} / ${CONFIG.maxAmmoPerGun}`;
  potionCount.textContent = state.potions;
  levelNumEl.textContent = state.level;
  killNum.textContent = state.kills;
  quizScoreEl.textContent = `${quizStats.correct}/${quizStats.asked}`;
}

let toastTimer = null;
function flashToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1400);
}

let dmgFlashTimer = null;
function flashDamage() {
  damageFlashEl.classList.add('visible');
  clearTimeout(dmgFlashTimer);
  dmgFlashTimer = setTimeout(() => damageFlashEl.classList.remove('visible'), 200);
}

function updatePrompt() {
  const chest = findNearestChest();
  if (!chest) { promptEl.classList.remove('visible'); return; }
  if (chest.state === 'closed') {
    promptEl.textContent = 'Press [E] to open chest';
  } else if (chest.state === 'open') {
    const label = chest.loot === 'potion' ? 'Healing Bottle' : chest.weaponType.name;
    promptEl.textContent = `Press [SPACE] to pick up ${label}`;
  } else {
    promptEl.classList.remove('visible');
    return;
  }
  promptEl.classList.add('visible');
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

/* ---------------- Quiz (math + ELA checkpoints) ---------------- */

const QUIZ_ELA = [
  { q: "Which word means the same as 'happy'?", options: ['Joyful', 'Angry', 'Tired', 'Slow'], answer: 'Joyful' },
  { q: "Which word means the opposite of 'big'?", options: ['Large', 'Huge', 'Small', 'Tall'], answer: 'Small' },
  { q: 'Choose the correctly spelled word.', options: ['Recieve', 'Receive', 'Receeve', 'Receve'], answer: 'Receive' },
  { q: "Which word is a noun in this sentence: 'The dog ran fast.'", options: ['dog', 'ran', 'fast', 'the'], answer: 'dog' },
  { q: "Which word is a verb in this sentence: 'She sings a song.'", options: ['She', 'sings', 'a', 'song'], answer: 'sings' },
  { q: "What is the plural of 'child'?", options: ['childs', 'childes', 'children', 'childrens'], answer: 'children' },
  { q: "Which word rhymes with 'cat'?", options: ['dog', 'hat', 'cup', 'run'], answer: 'hat' },
  { q: "Choose the correct word: 'They ___ going to the park.'", options: ['is', 'am', 'are', 'be'], answer: 'are' },
  { q: "Which word means the opposite of 'fast'?", options: ['quick', 'slow', 'speedy', 'rapid'], answer: 'slow' },
  { q: 'Which sentence is punctuated correctly?', options: ['I like dogs cats and birds.', 'I like dogs, cats, and birds.', 'I like, dogs cats and birds.', 'I like dogs cats, and birds'], answer: 'I like dogs, cats, and birds.' },
  { q: "Which word means 'a place where you borrow books'?", options: ['Library', 'Labyrinth', 'Liberty', 'Literacy'], answer: 'Library' },
  { q: "What is a synonym for 'smart'?", options: ['intelligent', 'silly', 'lazy', 'slow'], answer: 'intelligent' },
  { q: "Which word finishes the sentence: 'I can ___ the ocean from here.'", options: ['see', 'sea', 'si', 'cee'], answer: 'see' },
  { q: "Which word is an adjective in this sentence: 'The bright sun is shining.'", options: ['bright', 'sun', 'is', 'shining'], answer: 'bright' },
  { q: "What is the past tense of 'run'?", options: ['runned', 'ran', 'running', 'runs'], answer: 'ran' },
  { q: "Which word means 'very large'?", options: ['tiny', 'huge', 'small', 'little'], answer: 'huge' },
];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateMathQuestion() {
  const a = randInt(2, 12);
  const b = randInt(2, 12);
  const correct = a * b;
  const wrongSet = new Set();
  while (wrongSet.size < 3) {
    const wrong = correct + randInt(1, 10) * (Math.random() < 0.5 ? -1 : 1);
    if (wrong > 0 && wrong !== correct) wrongSet.add(wrong);
  }
  const options = shuffle([correct, ...wrongSet]);
  return { q: `${a} × ${b} = ?`, choices: options.map(String), correct: options.indexOf(correct) };
}

function pickElaQuestion() {
  const raw = QUIZ_ELA[randInt(0, QUIZ_ELA.length - 1)];
  const options = shuffle(raw.options);
  return { q: raw.q, choices: options, correct: options.indexOf(raw.answer) };
}

const quizTitleEl = document.getElementById('quiz-title');
const quizSubtitleEl = document.getElementById('quiz-subtitle');
const quizQuestionEl = document.getElementById('quiz-question');
const quizChoicesEl = document.getElementById('quiz-choices');
const quizFeedbackEl = document.getElementById('quiz-feedback');
const quizContinueBtn = document.getElementById('quiz-continue-btn');

let quizCompleteCallback = null;

function showQuiz({ title, subtitle, onComplete }) {
  state.quizActive = true;
  state.paused = true;
  if (document.pointerLockElement === canvas) document.exitPointerLock();

  quizCompleteCallback = onComplete;
  const question = Math.random() < 0.5 ? generateMathQuestion() : pickElaQuestion();

  quizTitleEl.textContent = title;
  quizSubtitleEl.textContent = subtitle;
  quizQuestionEl.textContent = question.q;
  quizFeedbackEl.textContent = '';
  quizFeedbackEl.className = '';
  quizContinueBtn.classList.add('hidden');
  quizChoicesEl.innerHTML = '';

  question.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-choice';
    btn.textContent = choice;
    btn.addEventListener('click', () => handleQuizAnswer(i === question.correct, btn));
    quizChoicesEl.appendChild(btn);
  });

  show('quiz-screen');
}

function handleQuizAnswer(isCorrect, btn) {
  if (isCorrect) {
    quizStats.correct++;
    quizStats.asked++;
    btn.classList.add('quiz-correct');
    quizFeedbackEl.textContent = 'Correct! Click continue to keep fighting.';
    quizFeedbackEl.className = 'quiz-feedback-good';
    Array.from(quizChoicesEl.children).forEach((b) => { b.disabled = true; });
    quizContinueBtn.classList.remove('hidden');
    SFX.pickup();
  } else {
    quizStats.asked++;
    btn.classList.add('quiz-wrong');
    btn.disabled = true;
    quizFeedbackEl.textContent = 'Not quite — try another answer!';
    quizFeedbackEl.className = 'quiz-feedback-bad';
    SFX.denied();
  }
  updateHUD();
}

quizContinueBtn.addEventListener('click', () => {
  hide('quiz-screen');
  state.quizActive = false;
  const cb = quizCompleteCallback;
  quizCompleteCallback = null;
  if (cb) cb();
});

/* ---------------- Levels & Boss Checkpoints ---------------- */
// 20 levels. Each level is a squad of regular aliens followed by a boss
// checkpoint. Boss health scales 10% per level: 10%, 20%, ... 200%.

let squadTimer = 0;

function startSquad() {
  const count = Math.min(3 + state.level, 12);
  for (let i = 0; i < count; i++) {
    const isArmored = Math.random() < CONFIG.armoredChance;
    aliens.push(new Alien({ isArmored }));
  }
  updateHUD();
}

function checkLevelProgress(dt) {
  if (state.levelPhase !== 'squad') return;
  squadTimer -= dt;
  if (squadTimer > 0) return;
  const remaining = aliens.filter(a => !a.dead).length;
  if (remaining === 0) {
    state.levelPhase = 'boss';
    spawnBoss();
  }
}

function spawnBoss() {
  const boss = new Alien({ isBoss: true, level: state.level });
  aliens.push(boss);
  state.boss = boss;
  bossLabelEl.textContent = `LEVEL ${state.level} BOSS`;
  bossBarFillEl.style.width = '100%';
  show('boss-panel');
  flashToast(`CHECKPOINT! LEVEL ${state.level} BOSS INCOMING`);
}

function updateBossBar() {
  if (!state.boss || state.boss.dead) return;
  const pct = Math.max(0, (state.boss.health / state.boss.maxHealth) * 100);
  bossBarFillEl.style.width = `${pct}%`;
}

function hideBossBar() {
  bossBarFillEl.style.width = '0%';
  hide('boss-panel');
  state.boss = null;
}

function resetChests() {
  for (const chest of chests) {
    chest.state = 'closed';
    chest.loot = Math.random() < 0.45 ? 'potion' : 'weapon';
    chest.weaponType = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
    chest.lid.rotation.x = 0;
    chest._lidT = 0;
  }
}

function onBossDefeated() {
  if (state.level >= CONFIG.totalLevels) {
    showVictory();
    return;
  }
  const clearedLevel = state.level;
  const nextLevel = clearedLevel + 1;
  showQuiz({
    title: `LEVEL ${clearedLevel} COMPLETE!`,
    subtitle: `Answer correctly to deploy for Level ${nextLevel}`,
    onComplete: () => {
      state.level = nextLevel;
      state.levelPhase = 'squad';
      squadTimer = 2.5;
      resetChests();
      startSquad();
      flashToast(`LEVEL ${state.level} — CHECKPOINT ${state.level}/${CONFIG.totalLevels}`);
      canvas.requestPointerLock();
    },
  });
}

function showVictory() {
  state.gameOver = true;
  state.paused = true;
  document.exitPointerLock();
  document.getElementById('victory-stats').textContent =
    `You defended the frozen north through all ${CONFIG.totalLevels} checkpoints with ${state.kills} kills ` +
    `and a brainpower score of ${quizStats.correct}/${quizStats.asked}!`;
  show('victory-screen');
}

/* ---------------- Movement ---------------- */

function updateMovement(dt) {
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = CONFIG.moveSpeed * (sprint ? CONFIG.sprintMultiplier : 1);

  const forward = new THREE.Vector3(Math.sin(playerRig.rotation.y), 0, Math.cos(playerRig.rotation.y)).multiplyScalar(-1);
  const right = new THREE.Vector3(-forward.z, 0, forward.x);

  const move = new THREE.Vector3();
  if (keys['ArrowUp']) move.add(forward);
  if (keys['ArrowDown']) move.sub(forward);
  if (keys['ArrowLeft']) move.sub(right);
  if (keys['ArrowRight']) move.add(right);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

  const nextX = playerRig.position.x + move.x;
  const nextZ = playerRig.position.z + move.z;

  let blocked = false;
  for (const o of obstacles) {
    if (Math.hypot(nextX - o.x, nextZ - o.z) < o.radius + 0.6) { blocked = true; break; }
  }
  if (!blocked) {
    playerRig.position.x = THREE.MathUtils.clamp(nextX, -CONFIG.worldHalf, CONFIG.worldHalf);
    playerRig.position.z = THREE.MathUtils.clamp(nextZ, -CONFIG.worldHalf, CONFIG.worldHalf);
  }

  // gravity / jump, following the ground height so mountains can be climbed
  const groundY = terrainHeightAt(playerRig.position.x, playerRig.position.z) + CONFIG.eyeHeight;
  state.velocityY += CONFIG.gravity * dt;
  playerRig.position.y += state.velocityY * dt;
  if (playerRig.position.y <= groundY) {
    playerRig.position.y = groundY;
    state.velocityY = 0;
    state.onGround = true;
  } else {
    state.onGround = false;
  }

  // weapon bob
  const moving = move.lengthSq() > 0 && state.onGround;
  const t = performance.now() * 0.012;
  weaponGroup.position.y = -0.32 + (moving ? Math.sin(t) * 0.015 : 0);
  weaponGroup.position.x = 0.32 + (moving ? Math.cos(t * 0.5) * 0.01 : 0);

  // crunching snow footsteps
  if (moving) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      SFX.footstep();
      footstepTimer = sprint ? 0.28 : 0.42;
    }
  } else {
    footstepTimer = 0;
  }
}

/* ---------------- Main Loop ---------------- */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (muzzleFlash.intensity > 0) muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 20);
  if (fireCooldownLeft > 0) fireCooldownLeft -= dt;

  auroraStrips.forEach((m, i) => {
    m.material.opacity = 0.55 + Math.sin(performance.now() * 0.0003 + i) * 0.35;
  });
  updateSnowfall(dt);

  if (state.running && !state.paused && !state.gameOver) {
    updateMovement(dt);

    for (const chest of chests) chest.update(dt);
    updatePrompt();

    const playerPos = playerRig.position;
    for (const alien of aliens) alien.update(dt, playerPos);
    updateBossBar();

    for (let i = alienProjectiles.length - 1; i >= 0; i--) {
      const proj = alienProjectiles[i];
      proj.mesh.position.addScaledVector(proj.dir, proj.speed * dt);
      proj.life -= dt;
      const dist = proj.mesh.position.distanceTo(playerPos);
      if (dist < 1.2) {
        damagePlayer(CONFIG.playerHitDamage);
        scene.remove(proj.mesh);
        alienProjectiles.splice(i, 1);
        continue;
      }
      if (proj.life <= 0) {
        scene.remove(proj.mesh);
        alienProjectiles.splice(i, 1);
      }
    }

    checkLevelProgress(dt);
  }

  renderer.render(scene, camera);
}
animate();

/* ---------------- Start / Restart Flow ---------------- */

document.getElementById('start-btn').addEventListener('click', () => {
  hide('start-screen');
  state.running = true;
  canvas.requestPointerLock();
  if (aliens.length === 0) startSquad();
  updateHUD();
});

document.getElementById('pause-screen').addEventListener('click', () => {
  if (state.running && !state.gameOver) canvas.requestPointerLock();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  window.location.reload();
});

document.getElementById('victory-restart-btn').addEventListener('click', () => {
  window.location.reload();
});
