// ===================================================================
// BLASTER CITY 3D
// An open-world driving & blaster adventure inspired by open-world
// sandbox games, reskinned kid-friendly: toy blasters instead of guns,
// glitching robots to bust instead of people, coins instead of gore.
// ===================================================================
(function () {
  'use strict';

  // ------------------------------------------------------------
  // Persisted save data
  // ------------------------------------------------------------
  const SAVE_KEY = 'blaster-city-3d-save-v1';

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt save */ }
    return null;
  }

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money,
        ownedWeapons: state.ownedWeapons,
        currentWeaponId: state.currentWeaponId,
        ammo: state.ammo,
        character: state.character,
        hasBaseAccess: state.hasBaseAccess,
        apartmentsOwned: apartments.map((a) => a.owned),
      }));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  // ------------------------------------------------------------
  // Data: weapons, characters options, phone contacts
  // ------------------------------------------------------------
  const WEAPONS = [
    { id: 'fists', name: 'Fists', icon: '✋', price: 0, damage: 8, rate: 2.2, range: 3.5, color: 0xffffff, splash: false },
    { id: 'water', name: 'Water Blaster', icon: '💦', price: 0, damage: 14, rate: 4, range: 24, color: 0x38bdf8, splash: false },
    { id: 'foam', name: 'Foam Dart Blaster', icon: '🧯', price: 150, damage: 22, rate: 5, range: 30, color: 0xfacc15, splash: false },
    { id: 'rapid', name: 'Rapid Soaker', icon: '🌊', price: 500, damage: 6, rate: 13, range: 22, color: 0x0ea5e9, splash: false },
    { id: 'confetti', name: 'Confetti Cannon', icon: '🎉', price: 350, damage: 34, rate: 2.4, range: 26, color: 0xf472b6, splash: 3 },
    { id: 'bubble', name: 'Bubble Bazooka', icon: '🫧', price: 700, damage: 55, rate: 1.3, range: 34, color: 0xa78bfa, splash: 5 },
    { id: 'mega', name: 'Mega Soaker 9000', icon: '🚀', price: 1500, damage: 100, rate: 1.6, range: 40, color: 0xfb923c, splash: 6 },
  ];
  const MAX_AMMO = 20; // fists don't need ammo — everything else has to be refilled at the shop

  const SKIN_TONES = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5a3825];
  const SHIRT_COLORS = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x111827, 0xec4899, 0xffffff];
  const PANTS_COLORS = [0x1f2937, 0x334155, 0x4b5563, 0x0f172a, 0x78350f, 0x164e63];
  const HAIR_COLORS = [0x1c1310, 0x3b2415, 0x6b4226, 0xb8860b, 0xe8c15a, 0xc0c0c0, 0xe11d48, 0x2563eb];
  const HATS = ['none', 'cap', 'helmet', 'crown'];
  const ACCESSORIES = ['none', 'backpack', 'cape', 'wings', 'chain'];
  const HAIR_STYLES = ['none', 'short', 'afro', 'mohawk'];
  const TOPS = ['shirt', 'jacket', 'sweatshirt'];
  const BOTTOMS = ['pants', 'shorts'];

  const CONTACTS = [
    { id: 'pete', name: 'Pizza Pete', icon: '🍕', line: 'Deliver a pizza across town before it gets cold!', mission: 'DELIVERY', reward: [120, 200] },
    { id: 'ace', name: 'Ace the Racer', icon: '🏁', line: 'Race to the checkpoint before time runs out!', mission: 'RACE', reward: [150, 260] },
    { id: 'watch', name: 'Robot Watch', icon: '🤖', line: 'Bust 3 glitching robots causing trouble downtown!', mission: 'BOUNTY', reward: [180, 300] },
  ];

  // ------------------------------------------------------------
  // Global mutable state
  // ------------------------------------------------------------
  const state = {
    money: 300,
    ownedWeapons: ['fists', 'water'],
    currentWeaponId: 'water',
    ammo: { water: MAX_AMMO },
    character: {
      skin: SKIN_TONES[0],
      shirt: SHIRT_COLORS[1],
      pants: PANTS_COLORS[0],
      hat: 'none',
      accessory: 'none',
      hairStyle: 'short',
      hairColor: HAIR_COLORS[1],
      top: 'shirt',
      bottom: 'pants',
    },
    health: 100,
    inVehicle: null,
    waypoint: null, // {x, z}
    mission: null,  // {type, targetId?, marker:{x,z}, reward, progress, needed}
    nearShop: false,
    nearVehicle: null,
    nearBank: null,
    nearPizza: null,
    nearRecruiter: false,
    nearApartment: null,
    nearFoodStall: null,
    aimMarkerOn: false,
    hasBaseAccess: false,
    lastShotTime: 0,
  };

  let pendingApartmentsOwned = null;

  const saved = loadSave();
  if (saved) {
    state.money = typeof saved.money === 'number' ? saved.money : state.money;
    state.hasBaseAccess = !!saved.hasBaseAccess;
    state.ownedWeapons = Array.isArray(saved.ownedWeapons) && saved.ownedWeapons.length ? saved.ownedWeapons : state.ownedWeapons;
    state.currentWeaponId = saved.currentWeaponId || state.currentWeaponId;
    if (saved.ammo && typeof saved.ammo === 'object') Object.assign(state.ammo, saved.ammo);
    state.ownedWeapons.forEach((id) => { if (id !== 'fists' && state.ammo[id] === undefined) state.ammo[id] = MAX_AMMO; });
    if (saved.character) Object.assign(state.character, saved.character);
    if (Array.isArray(saved.apartmentsOwned)) pendingApartmentsOwned = saved.apartmentsOwned;
  }

  function getWeapon(id) { return WEAPONS.find((w) => w.id === id); }

  // ==============================================================
  // DOM references
  // ==============================================================
  const $ = (id) => document.getElementById(id);
  const loadingScreen = $('loading-screen');
  const startOverlay = $('start-overlay');
  const customizeOverlay = $('customize-overlay');
  const hud = $('hud');
  const shopOverlay = $('shop-overlay');
  const phoneOverlay = $('phone-overlay');
  const mapOverlay = $('map-overlay');
  const weaponWheelOverlay = $('weapon-wheel-overlay');
  const toastLayer = $('toast-layer');

  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastLayer.appendChild(el);
    setTimeout(() => el.remove(), ms || 2600);
  }

  function showOverlay(el) { el.classList.remove('hidden'); }
  function hideOverlay(el) { el.classList.add('hidden'); }

  // Three.js loads via a blocking <script> tag before this file runs, so
  // there is no real asset loading to wait for — dismiss immediately.
  hideOverlay(loadingScreen);

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-close');
      if (which === 'shop') hideOverlay(shopOverlay);
      if (which === 'phone') hideOverlay(phoneOverlay);
      if (which === 'map') hideOverlay(mapOverlay);
    });
  });

  // ==============================================================
  // CHARACTER CUSTOMIZATION SCREEN (one-time, before gameplay begins)
  // ==============================================================
  const customizeOptionsEl = $('customize-options');

  function buildSwatchGroup(title, colors, currentKey, onPick) {
    const group = document.createElement('div');
    group.className = 'option-group';
    const h4 = document.createElement('h4');
    h4.textContent = title;
    group.appendChild(h4);
    const row = document.createElement('div');
    row.className = 'swatch-row';
    colors.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = '#' + c.toString(16).padStart(6, '0');
      if (state.character[currentKey] === c) sw.classList.add('selected');
      sw.addEventListener('click', () => {
        state.character[currentKey] = c;
        row.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
        onPick && onPick();
      });
      row.appendChild(sw);
    });
    group.appendChild(row);
    return group;
  }

  function buildPillGroup(title, options, labels, currentKey, onPick) {
    const group = document.createElement('div');
    group.className = 'option-group';
    const h4 = document.createElement('h4');
    h4.textContent = title;
    group.appendChild(h4);
    const row = document.createElement('div');
    row.className = 'pill-row';
    options.forEach((opt, i) => {
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.textContent = labels[i];
      if (state.character[currentKey] === opt) pill.classList.add('selected');
      pill.addEventListener('click', () => {
        state.character[currentKey] = opt;
        row.querySelectorAll('.pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        onPick && onPick();
      });
      row.appendChild(pill);
    });
    group.appendChild(row);
    return group;
  }

  function renderCustomizeOptions() {
    customizeOptionsEl.innerHTML = '';
    customizeOptionsEl.appendChild(buildSwatchGroup('Skin Tone', SKIN_TONES, 'skin', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Hair Style', HAIR_STYLES, ['None', 'Short', 'Afro', 'Mohawk'], 'hairStyle', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildSwatchGroup('Hair Color', HAIR_COLORS, 'hairColor', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Top', TOPS, ['Shirt', 'Jacket', 'Sweatshirt'], 'top', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildSwatchGroup('Top Color', SHIRT_COLORS, 'shirt', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Bottoms', BOTTOMS, ['Pants', 'Shorts'], 'bottom', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildSwatchGroup('Bottom Color', PANTS_COLORS, 'pants', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Hat', HATS, ['None', 'Cap', 'Helmet', 'Crown'], 'hat', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Accessory', ACCESSORIES, ['None', 'Backpack', 'Cape', 'Wings', 'Chain'], 'accessory', refreshCharacterPreview));
  }

  // Small dedicated preview scene for the customizer (independent from main game scene)
  let previewRenderer, previewScene, previewCamera, previewCharGroup, previewAnimId;

  function initCharacterPreview() {
    const canvas = $('char-preview');
    previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    previewRenderer.setSize(canvas.clientWidth || 220, canvas.clientHeight || 260, false);
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(35, (canvas.clientWidth || 220) / (canvas.clientHeight || 260), 0.1, 50);
    previewCamera.position.set(0, 1.15, 4.2);
    previewCamera.lookAt(0, 0.9, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.1);
    previewScene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 3);
    previewScene.add(dir);

    refreshCharacterPreview();
    animatePreview();
  }

  function animatePreview() {
    previewAnimId = requestAnimationFrame(animatePreview);
    if (previewCharGroup) previewCharGroup.rotation.y += 0.012;
    previewRenderer.render(previewScene, previewCamera);
  }

  function refreshCharacterPreview() {
    if (previewCharGroup) {
      previewScene.remove(previewCharGroup);
      disposeObject(previewCharGroup);
    }
    previewCharGroup = buildCharacterMesh(state.character);
    previewCharGroup.position.y = -0.9;
    previewScene.add(previewCharGroup);
  }

  function disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }

  // A simple, generic cartoon face (eyes + brows + mouth) painted once onto
  // a shared, cached canvas texture — every character reuses the same
  // decal rather than rebuilding a canvas on every customizer tweak.
  let faceTextureCache = null;
  function getFaceTexture() {
    if (faceTextureCache) return faceTextureCache;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 96);
    ctx.fillStyle = '#1e293b';
    // eyes
    [40, 88].forEach((ex) => {
      ctx.beginPath();
      ctx.ellipse(ex, 40, 10, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, 41, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
    });
    // eyebrows
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    [[30, 25, 50, 22], [78, 22, 98, 25]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // mouth
    ctx.beginPath();
    ctx.arc(64, 62, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 3.5;
    ctx.stroke();
    faceTextureCache = new THREE.CanvasTexture(canvas);
    return faceTextureCache;
  }

  // Builds a low-poly humanoid mesh from a character config. Reused for
  // both the customizer preview and the actual in-world player model.
  function buildCharacterMesh(cfg) {
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: cfg.shirt, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: cfg.pants, roughness: 0.7 });

    // Legs — rounded capsules read as actual limbs instead of Minecraft-y
    // blocks. Shorts show a bare-skin capsule shin below a short pants cuff;
    // both are grouped with the pivot kept at the same height as a plain
    // pants leg so the walk-swing animation looks the same either way.
    let legL, legR;
    if (cfg.bottom === 'shorts') {
      legL = new THREE.Group(); legL.position.set(-0.16, 0.375, 0);
      legR = new THREE.Group(); legR.position.set(0.16, 0.375, 0);
      [legL, legR].forEach((leg) => {
        const shortPart = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.145, 0.32, 8), pantsMat);
        shortPart.position.set(0, 0.215, 0);
        const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 8), skinMat);
        shin.position.set(0, -0.155, 0);
        leg.add(shortPart, shin);
      });
    } else {
      const legGeo = new THREE.CapsuleGeometry(0.13, 0.49, 4, 8);
      legL = new THREE.Mesh(legGeo, pantsMat);
      legL.position.set(-0.16, 0.375, 0);
      legR = new THREE.Mesh(legGeo, pantsMat);
      legR.position.set(0.16, 0.375, 0);
    }
    group.add(legL, legR);

    // Torso — a tapered cylinder (shoulders wider than waist), squashed
    // front-to-back so it keeps the same flattened silhouette the old box
    // had rather than reading as a tube.
    const torsoGeo = new THREE.CylinderGeometry(0.33, 0.25, 0.68, 10);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.scale.set(1, 1, 0.58);
    torso.position.set(0, 1.09, 0);
    group.add(torso);

    // Top style detailing
    if (cfg.top === 'jacket') {
      const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.6, roughness: 0.3 }));
      zipper.position.set(0, 1.09, 0.185);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.12), shirtMat);
      collar.position.set(0, 1.42, 0.08);
      group.add(zipper, collar);
    } else if (cfg.top === 'sweatshirt') {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: cfg.shirt, roughness: 0.9 }));
      pocket.position.set(0, 0.88, 0.185);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.2), shirtMat);
      hood.position.set(0, 1.48, -0.16);
      hood.rotation.x = 0.3;
      group.add(pocket, hood);
    }

    // Arms — rounded capsules to match the new legs/torso
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.42, 4, 8);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-0.44, 1.08, 0);
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(0.44, 1.08, 0);
    group.add(armL, armR);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.11, 10, 10);
    const handL = new THREE.Mesh(handGeo, skinMat);
    handL.position.set(-0.44, 0.74, 0);
    const handR = new THREE.Mesh(handGeo, skinMat);
    handR.position.set(0.44, 0.74, 0);
    group.add(handL, handR);

    // Head — a slightly oval sphere (taller, a bit flatter front-to-back)
    // reads more like an actual head than a perfect ball.
    const headGeo = new THREE.SphereGeometry(0.26, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(0.92, 1.08, 0.96);
    head.position.set(0, 1.62, 0);
    group.add(head);

    // Simple face — eyes, brows and a mouth painted onto a small decal
    // plane in front of the head, so there's an actual face instead of a
    // blank ball. Deliberately generic/cartoon, not modeled on anyone.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), new THREE.MeshBasicMaterial({
      map: getFaceTexture(), transparent: true, depthWrite: false,
    }));
    face.position.set(0, 1.635, 0.245);
    group.add(face);

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skinMat);
    nose.position.set(0, 1.60, 0.25);
    group.add(nose);

    // Hair (hidden under a hat, since the hat already covers this area)
    if (cfg.hat === 'none' && cfg.hairStyle && cfg.hairStyle !== 'none') {
      const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hairColor || 0x2b1a12, roughness: 0.75 });
      if (cfg.hairStyle === 'short') {
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.265, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
        hair.position.set(0, 1.66, -0.01);
        group.add(hair);
      } else if (cfg.hairStyle === 'afro') {
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), hairMat);
        hair.position.set(0, 1.66, 0);
        group.add(hair);
      } else if (cfg.hairStyle === 'mohawk') {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.5), hairMat);
        strip.position.set(0, 1.94, 0);
        group.add(strip);
      }
    }

    // Hat — dome + a forward bill that actually attaches to the dome's rim
    // (rather than floating separately), and a crown with real points/jewels.
    if (cfg.hat === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), capMat);
      dome.position.set(0, 1.77, 0);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.24), capMat);
      brim.position.set(0, 1.695, 0.24);
      brim.rotation.x = -0.12;
      group.add(dome, brim);
    } else if (cfg.hat === 'helmet') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.4, roughness: 0.3 }));
      helmet.position.set(0, 1.64, 0);
      group.add(helmet);
    } else if (cfg.hat === 'crown') {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.75, roughness: 0.25 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.11, 12), goldMat);
      band.position.set(0, 1.81, 0);
      group.add(band);

      const jewelColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xef4444, 0x3b82f6];
      const spikeCount = 5;
      for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), goldMat);
        spike.position.set(Math.cos(angle) * 0.19, 1.93, Math.sin(angle) * 0.19);
        group.add(spike);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshStandardMaterial({ color: jewelColors[i], roughness: 0.25 }));
        jewel.position.set(Math.cos(angle) * 0.24, 1.81, Math.sin(angle) * 0.24);
        group.add(jewel);
      }
    }

    // Accessory
    if (cfg.accessory === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0x7c2d12 }));
      pack.position.set(0, 1.08, -0.28);
      group.add(pack);
    } else if (cfg.accessory === 'cape') {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), new THREE.MeshStandardMaterial({ color: 0xdc2626, side: THREE.DoubleSide }));
      cape.position.set(0, 0.95, -0.22);
      cape.rotation.x = 0.15;
      group.add(cape);
    } else if (cfg.accessory === 'wings') {
      const wingGeo = new THREE.BoxGeometry(0.5, 0.3, 0.06);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
      const wL = new THREE.Mesh(wingGeo, wingMat);
      wL.position.set(-0.4, 1.15, -0.2);
      wL.rotation.z = 0.4;
      const wR = new THREE.Mesh(wingGeo, wingMat);
      wR.position.set(0.4, 1.15, -0.2);
      wR.rotation.z = -0.4;
      group.add(wL, wR);
    } else if (cfg.accessory === 'chain') {
      // A collar loop at the neck with a thin strand hanging down to a
      // pendant on the chest, instead of a single flat ring that just
      // looked like a straight bar sitting on the collarbone.
      const chainMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 });
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 16), chainMat);
      collar.position.set(0, 1.43, 0.13);
      collar.rotation.x = Math.PI / 2.3;
      group.add(collar);
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), chainMat);
      strand.position.set(0, 1.3, 0.19);
      strand.rotation.x = 0.35;
      group.add(strand);
      const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), chainMat);
      pendant.position.set(0, 1.17, 0.22);
      group.add(pendant);
    }

    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;

    if (cfg.weapon && cfg.weapon !== 'fists') {
      const weaponMesh = makeWeaponMesh(cfg.weapon);
      weaponMesh.position.set(0.1, -0.34, 0.13);
      weaponMesh.rotation.y = Math.PI / 2;
      armR.add(weaponMesh);
      group.userData.heldWeapon = weaponMesh;
    }
    return group;
  }

  // Builds a toy-blaster prop shaped distinctly per weapon so the player is
  // clearly holding *something* in third person — chunky, brightly colored,
  // translucent water tanks etc., deliberately toylike rather than gun-like.
  function makeWeaponMesh(weaponId) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.45 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });

    function tank(color, radius, length) {
      return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), new THREE.MeshPhysicalMaterial({
        color, roughness: 0.15, metalness: 0.05, transmission: 0.35, transparent: true, opacity: 0.85,
      }));
    }

    // grip (common to all)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), gripMat);
    grip.position.set(0, -0.12, -0.05);
    grip.rotation.x = 0.25;
    group.add(grip);

    if (weaponId === 'water') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), bodyMat);
      body.position.set(0, 0, 0.05);
      const t = tank(0x38bdf8, 0.08, 0.22);
      t.rotation.z = Math.PI / 2;
      t.position.set(0, 0.09, -0.02);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.1, 10), bodyMat);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(0, 0, 0.26);
      group.add(body, t, nozzle);
    } else if (weaponId === 'foam') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.36), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 }));
      body.position.set(0, 0, 0.05);
      const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
      dart.rotation.z = Math.PI / 2;
      dart.position.set(0, 0.005, 0.3);
      const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.06), gripMat);
      foregrip.position.set(0, -0.09, 0.16);
      group.add(body, dart, foregrip);
    } else if (weaponId === 'confetti') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xdb2777, roughness: 0.35 }));
      body.rotation.z = Math.PI / 2;
      body.position.set(0, 0, 0.05);
      const flare = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf472b6, side: THREE.DoubleSide }));
      flare.rotation.x = Math.PI / 2;
      flare.position.set(0, 0, 0.26);
      group.add(body, flare);
    } else if (weaponId === 'bubble') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 14), bodyMat);
      body.rotation.z = Math.PI / 2;
      body.position.set(0, 0, 0.08);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16), new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.3 }));
      ring.position.set(0, 0, 0.32);
      const t = tank(0xc4b5fd, 0.1, 0.18);
      t.position.set(0, 0.1, -0.02);
      group.add(body, ring, t);
    } else if (weaponId === 'mega') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35 }));
      body.rotation.z = Math.PI / 2;
      body.position.set(0, 0, 0.1);
      const t = tank(0xfdba74, 0.12, 0.22);
      t.position.set(0, 0.12, -0.02);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.16), gripMat);
      stock.position.set(0, -0.02, -0.22);
      group.add(body, t, stock);
    }

    return group;
  }

  // ------------------------------------------------------------
  // Screen flow: start -> customize -> play
  // ------------------------------------------------------------
  $('btn-to-customize').addEventListener('click', () => {
    hideOverlay(startOverlay);
    showOverlay(customizeOverlay);
    renderCustomizeOptions();
    if (!previewRenderer) initCharacterPreview();
  });

  $('btn-randomize').addEventListener('click', () => {
    state.character.skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    state.character.shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    state.character.pants = PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];
    state.character.hat = HATS[Math.floor(Math.random() * HATS.length)];
    state.character.accessory = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)];
    state.character.hairStyle = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)];
    state.character.hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
    state.character.top = TOPS[Math.floor(Math.random() * TOPS.length)];
    state.character.bottom = BOTTOMS[Math.floor(Math.random() * BOTTOMS.length)];
    renderCustomizeOptions();
    refreshCharacterPreview();
  });

  $('btn-start-game').addEventListener('click', () => {
    if (previewAnimId) cancelAnimationFrame(previewAnimId);
    hideOverlay(customizeOverlay);
    showOverlay(hud);
    writeSave();
    startGameWorld();
  });

  // ==============================================================
  // MAIN 3D WORLD
  // ==============================================================
  const CITY_BLOCKS = 6;          // grid of blocks per axis
  const BLOCK_SIZE = 42;          // block footprint including road
  const ROAD_WIDTH = 12;
  const SIDEWALK_WIDTH = 3;
  const BUILDING_MARGIN = 3;
  const WORLD_HALF = (CITY_BLOCKS * BLOCK_SIZE) / 2;

  let renderer, scene, camera;
  let clock;
  let player, playerMesh, playerAimMarker;
  let buildingBoxes = []; // {minX,maxX,minZ,maxZ}
  let vehicles = [];
  let robots = [];
  let pedestrians = [];
  let coins = [];
  let banks = []; // {x, z, cooldownUntil}
  let pizzaPlaces = []; // {x, z, cooldownUntil}
  let apartments = []; // {x, z, price, owned}
  let foodStalls = []; // {x, z, kind, price, cooldownUntil}
  let rides = []; // {group, axis, speed} — ferris wheel / carousel spin animation
  let beachCenter = null;
  let carnivalCenter = null;
  let oceanMesh = null;
  let oceanBaseZ = null;
  let oceanTime = 0;
  let oceanStartZ = Infinity; // z where sand ends and water begins — keeps jet skis off the sand
  let beachClampR = 0; // lets the world-bounds clamp reach the far edge of the ocean
  let mountainPeaks = [];
  let mountainZ = 0;
  let mountainClampR = 0;
  let shopMarkerPos = null;
  let gameStarted = false;
  let cameraYaw = Math.PI; // starts behind the player's default spawn heading (0)
  let cameraPitch = 0.28;
  let cameraFollowY = 0; // smoothed player.y so jumps don't snap the view — see updateCamera
  const CAMERA_DIST = 7.5;
  let crashShakeTime = 0;
  let crashShakeMag = 0;
  let lastCrashToastAt = 0;

  function startGameWorld() {
    if (gameStarted) return;
    gameStarted = true;
    initThree();
    buildCity();
    buildMilitaryBase();
    buildMountains();
    buildBeachCarnival();
    if (pendingApartmentsOwned) {
      apartments.forEach((a, i) => { if (pendingApartmentsOwned[i]) a.owned = true; });
    }
    createPlayer();
    spawnVehicles();
    spawnRobots();
    spawnPedestrians();
    spawnCoins();
    hideOverlay(loadingScreen);
    updateHUDMoney();
    updateWeaponHUD();
    updateHealthUI();
    setupInput();
    clock = new THREE.Clock();
    requestAnimationFrame(loop);
    toast('Welcome to Blaster City! Explore, drive, and earn cash. 🚗💰');
  }

  function initThree() {
    const canvas = $('scene');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    onResize();
    window.addEventListener('resize', onResize);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd3f4);
    scene.fog = new THREE.Fog(0x8fd3f4, 60, 460);

    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);

    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a5a30, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.05);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -110;
    sun.shadow.camera.far = 260;
    scene.add(sun);

    const groundGeo = new THREE.PlaneGeometry(WORLD_HALF * 6, WORLD_HALF * 6);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4d7c4a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.domElement.width = innerWidth * renderer.getPixelRatio();
    if (camera) {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------
  // City generation: grid of roads + building blocks
  // ------------------------------------------------------------
  // Procedurally draws a building facade (windows on a base wall color) onto
  // a canvas sized to that specific building's proportions, so a flat colored
  // box reads as an actual building instead of a solid-color block.
  function makeFacadeTexture(baseColor, opts) {
    opts = opts || {};
    const cols = opts.cols || 4;
    const rows = opts.rows || 8;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const base = '#' + baseColor.toString(16).padStart(6, '0');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle side-lighting gradient so flat faces don't look perfectly flat
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.16)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    const winW = cellW * (opts.winScale || 0.62);
    const winH = cellH * (opts.winScale || 0.58);
    const litChance = opts.litChance !== undefined ? opts.litChance : 0.32;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + (cellW - winW) / 2;
        const y = r * cellH + (cellH - winH) / 2;
        const lit = Math.random() < litChance;
        ctx.fillStyle = lit ? 'rgba(253,224,71,0.88)' : 'rgba(30,41,59,0.82)';
        ctx.fillRect(x, y, winW, winH);
        ctx.strokeStyle = 'rgba(15,23,42,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, winW, winH);
        if (lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x, y, winW, winH * 0.35);
        }
      }
    }
    // ground floor storefront band
    ctx.fillStyle = 'rgba(15,23,42,0.5)';
    ctx.fillRect(0, canvas.height - cellH * 0.9, canvas.width, cellH * 0.9);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  // Builds the 6-face material array for a building box: textured facade on
  // the four side faces, a flat rooftop material on top/bottom.
  function makeBuildingMaterials(baseColor, w, h, d, opts) {
    const cols = Math.max(2, Math.round(Math.max(w, d) / 3.2));
    const rows = Math.max(3, Math.round(h / 2.6));
    const tex = makeFacadeTexture(baseColor, Object.assign({ cols, rows }, opts));
    const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.05 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x292b30, roughness: 0.92 });
    return [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
  }

  function buildCity() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36 });
    const roadGeo = new THREE.PlaneGeometry(WORLD_HALF * 2 + BLOCK_SIZE, ROAD_WIDTH);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.95 });
    const sidewalkLen = WORLD_HALF * 2 + BLOCK_SIZE;
    const sidewalkGeo = new THREE.PlaneGeometry(sidewalkLen, SIDEWALK_WIDTH);
    const sidewalkOffset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
    for (let i = 0; i <= CITY_BLOCKS; i++) {
      const z = -WORLD_HALF + i * BLOCK_SIZE;
      const roadH = new THREE.Mesh(roadGeo, roadMat);
      roadH.rotation.x = -Math.PI / 2;
      roadH.position.set(0, 0.01, z);
      roadH.receiveShadow = true;
      scene.add(roadH);

      // Sidewalks flank each road on both sides — pedestrians/robots walk
      // here (see isOnRoad()), never in the street itself.
      [-1, 1].forEach((side) => {
        const sw = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(0, 0.008, z + side * sidewalkOffset);
        sw.receiveShadow = true;
        scene.add(sw);
      });

      const roadV = new THREE.Mesh(roadGeo, roadMat);
      roadV.rotation.x = -Math.PI / 2;
      roadV.rotation.z = Math.PI / 2;
      roadV.position.set(z, 0.01, 0);
      roadV.receiveShadow = true;
      scene.add(roadV);

      [-1, 1].forEach((side) => {
        const sw = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.rotation.z = Math.PI / 2;
        sw.position.set(z + side * sidewalkOffset, 0.008, 0);
        sw.receiveShadow = true;
        scene.add(sw);
      });
    }

    const buildingPalette = [0xd6d3d1, 0xfca5a5, 0xfcd34d, 0x93c5fd, 0xc4b5fd, 0xa7f3d0, 0xf9a8d4];
    const mid = Math.floor(CITY_BLOCKS / 2);
    const bankSpots = [
      { bx: mid - 2, bz: mid - 2 },
      { bx: Math.min(CITY_BLOCKS - 1, mid + 1), bz: Math.min(CITY_BLOCKS - 1, mid + 2) },
    ];
    const pizzaSpots = [
      { bx: Math.min(CITY_BLOCKS - 1, mid + 2), bz: Math.max(0, mid - 1) },
    ];
    const apartmentSpots = [
      { bx: Math.max(0, mid - 1), bz: Math.min(CITY_BLOCKS - 1, mid + 1), price: 800 },
      { bx: Math.min(CITY_BLOCKS - 1, mid + 1), bz: Math.max(0, mid - 2), price: 1500 },
    ];
    const isTakenSpot = (bx, bz) => bx === mid && bz === mid
      || bankSpots.some((s) => s.bx === bx && s.bz === bz)
      || pizzaSpots.some((s) => s.bx === bx && s.bz === bz);

    for (let bx = 0; bx < CITY_BLOCKS; bx++) {
      for (let bz = 0; bz < CITY_BLOCKS; bz++) {
        const cx = -WORLD_HALF + BLOCK_SIZE * bx + BLOCK_SIZE / 2;
        const cz = -WORLD_HALF + BLOCK_SIZE * bz + BLOCK_SIZE / 2;
        const footprint = BLOCK_SIZE - ROAD_WIDTH - BUILDING_MARGIN * 2;

        const isShopBlock = !shopMarkerPos && bx === mid && bz === mid;
        const bankSpot = bankSpots.find((b) => b.bx === bx && b.bz === bz && b.bx !== mid);
        const pizzaSpot = pizzaSpots.find((p) => p.bx === bx && p.bz === bz && p.bx !== mid && !bankSpots.some((b) => b.bx === bx && b.bz === bz));
        const apartmentSpot = apartmentSpots.find((a) => a.bx === bx && a.bz === bz && !isTakenSpot(bx, bz));

        if (isShopBlock) {
          const w = footprint * 0.8, d = footprint * 0.8, h = 8;
          const mat = makeBuildingMaterials(0x0ea5e9, w, h, d, { winScale: 0.78, litChance: 0.7 });
          const shop = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          shop.position.set(cx, h / 2, cz);
          shop.castShadow = true;
          shop.receiveShadow = true;
          scene.add(shop);
          addFloatingSign(cx, h + 1.6, cz, '💦 BLASTER SHOP');
          buildingBoxes.push(boxOf(cx, cz, w, d, h));
          shopMarkerPos = { x: cx, z: cz };
          continue;
        }

        if (bankSpot) {
          const w = footprint * 0.75, d = footprint * 0.75, h = 9;
          const mat = makeBuildingMaterials(0x15803d, w, h, d, { winScale: 0.7, litChance: 0.5 });
          const bank = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          bank.position.set(cx, h / 2, cz);
          bank.castShadow = true;
          bank.receiveShadow = true;
          scene.add(bank);
          addFloatingSign(cx, h + 1.6, cz, '🏦 BANK');
          buildingBoxes.push(boxOf(cx, cz, w, d, h));
          banks.push({ x: cx, z: cz, cooldownUntil: 0 });
          continue;
        }

        if (pizzaSpot) {
          const w = footprint * 0.65, d = footprint * 0.65, h = 6.5;
          const mat = makeBuildingMaterials(0xdc2626, w, h, d, { winScale: 0.75, litChance: 0.6 });
          const place = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          place.position.set(cx, h / 2, cz);
          place.castShadow = true;
          place.receiveShadow = true;
          scene.add(place);
          addFloatingSign(cx, h + 1.6, cz, '🍕 PIZZA PLACE');
          buildingBoxes.push(boxOf(cx, cz, w, d, h));
          pizzaPlaces.push({ x: cx, z: cz, cooldownUntil: 0 });
          continue;
        }

        if (apartmentSpot) {
          const w = footprint * 0.72, d = footprint * 0.72, h = 16;
          const mat = makeBuildingMaterials(0xc2884f, w, h, d, { winScale: 0.65, litChance: 0.4 });
          const apt = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          apt.position.set(cx, h / 2, cz);
          apt.castShadow = true;
          apt.receiveShadow = true;
          scene.add(apt);
          addFloatingSign(cx, h + 1.6, cz, '🏠 APARTMENTS');
          buildingBoxes.push(boxOf(cx, cz, w, d, h));
          apartments.push({ x: cx, z: cz, price: apartmentSpot.price, owned: false });
          continue;
        }

        // Leave a few open blocks as parks/plazas for variety (only ordinary
        // blocks — the shop and banks above are always placed)
        if (Math.random() < 0.12) continue;

        // 1-3 smaller buildings per block for a denser city feel
        const count = 1 + Math.floor(Math.random() * 2);
        const sub = footprint / count;
        for (let i = 0; i < count; i++) {
          const w = sub * (0.7 + Math.random() * 0.25);
          const d = footprint * (0.7 + Math.random() * 0.25);
          const h = 6 + Math.random() * 22;
          const offsetX = -footprint / 2 + sub * i + sub / 2;
          const px = cx + offsetX;
          const pz = cz;
          const color = buildingPalette[Math.floor(Math.random() * buildingPalette.length)];
          const mat = makeBuildingMaterials(color, w, h, d);
          const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          building.position.set(px, h / 2, pz);
          building.castShadow = true;
          building.receiveShadow = true;
          scene.add(building);
          buildingBoxes.push(boxOf(px, pz, w, d, h));

          // roof accent
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.6, d * 1.02), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
          roof.position.set(px, h + 0.3, pz);
          scene.add(roof);
        }
      }
    }

    if (!shopMarkerPos) {
      shopMarkerPos = { x: 0, z: 0 };
      const shop = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 18), makeBuildingMaterials(0x0ea5e9, 18, 8, 18, { winScale: 0.78, litChance: 0.7 }));
      shop.position.set(0, 4, 0);
      shop.castShadow = true;
      scene.add(shop);
      addFloatingSign(0, 9.6, 0, '💦 BLASTER SHOP');
      buildingBoxes.push(boxOf(0, 0, 18, 18, 8));
    }
  }

  function boxOf(cx, cz, w, d, h) {
    return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h };
  }

  // Tallest rooftop (tracked via the optional height on boxOf) covering
  // (x,z), or 0 for open ground — the "floor" the player rests on, used by
  // the jump/gravity system so landing on top of a building actually works.
  function getFloorHeightAt(x, z) {
    let best = 0;
    for (const b of buildingBoxes) {
      if (b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.h > best) best = b.h;
    }
    return best;
  }

  // Like collidesWithBuildings, but a building only blocks you if you're
  // below its roof height — once you've jumped up onto a rooftop you can
  // walk across it instead of colliding with your own building's "walls".
  function collidesWithBuildingsAtHeight(x, z, margin, y) {
    for (const b of buildingBoxes) {
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) {
        if (b.h && y >= b.h - 0.35) continue;
        return true;
      }
    }
    return false;
  }

  // The world-bounds clamp has to reach past the city grid to cover the
  // military base out to the east, or nobody could ever drive there.
  function worldClampR() {
    const cityR = WORLD_HALF + BLOCK_SIZE / 2 - 2;
    const militaryR = militaryBaseCenter ? (militaryBaseCenter.clampR || militaryBaseCenter.x + 30) : 0;
    return Math.max(cityR, militaryR, beachClampR, mountainClampR);
  }

  // ------------------------------------------------------------
  // Military Base — a walled, job-gated compound out past the city grid.
  // No guards, no combat, no killing: without the job the gate simply
  // won't let you through; with it, you can walk in and take a tank or
  // jet for a drive. Kept firmly non-violent — see the chat for why.
  // ------------------------------------------------------------
  let militaryGateBox = null;
  let militaryBaseCenter = null;

  function buildMilitaryBase() {
    const cx = WORLD_HALF + 80, cz = 0;
    const halfSize = 45, T = 2, WALL_H = 6, gateHalfWidth = 7;
    militaryBaseCenter = { x: cx, z: cz, clampR: cx + halfSize + 15 };
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b5142, roughness: 0.85 });

    function addWallSegment(wx, wz, w, d) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
      wall.position.set(wx, WALL_H / 2, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
      buildingBoxes.push(boxOf(wx, wz, w, d));
    }

    addWallSegment(cx, cz + halfSize, halfSize * 2 + T, T); // south
    addWallSegment(cx, cz - halfSize, halfSize * 2 + T, T); // north
    addWallSegment(cx + halfSize, cz, T, halfSize * 2 + T); // east
    // west wall, split to leave a gate gap facing the city
    const segLen = halfSize - gateHalfWidth;
    addWallSegment(cx - halfSize, cz - (halfSize + gateHalfWidth) / 2, T, segLen);
    addWallSegment(cx - halfSize, cz + (halfSize + gateHalfWidth) / 2, T, segLen);
    militaryGateBox = { minX: cx - halfSize - 2.5, maxX: cx - halfSize + 2.5, minZ: cz - gateHalfWidth, maxZ: cz + gateHalfWidth };

    addFloatingSign(cx - halfSize, WALL_H + 2, cz, '🪖 MILITARY BASE');

    // Hangars — tucked in the far NE corner, well clear of the open tarmac
    // where the jets sit (they used to overlap; now there's real separation)
    const hangarMat = makeBuildingMaterials(0x5b6350, 20, 10, 15, { winScale: 0.6, litChance: 0.35 });
    [-1, 1].forEach((side) => {
      const hx = cx + side * 13, hz = cz - 32;
      const hangar = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 15), hangarMat);
      hangar.position.set(hx, 5, hz);
      hangar.castShadow = true;
      hangar.receiveShadow = true;
      scene.add(hangar);
      buildingBoxes.push(boxOf(hx, hz, 20, 15, 10));
    });

    // Decorative soldiers (static — not part of any AI system, purely set
    // dressing, never hostile and never a combat target)
    const soldierSpots = [
      [cx - 15, cz + 20], [cx + 15, cz + 20], [cx, cz + 10], [cx - 25, cz - 5],
      [cx + 25, cz + 5], [cx - 5, cz - 20], [cx + 30, cz - 20], [cx - 30, cz + 30],
    ];
    soldierSpots.forEach(([sx, sz]) => {
      const soldier = buildCharacterMesh({
        skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
        shirt: 0x4b5320, pants: 0x3a3f2e, hat: 'helmet', accessory: 'none',
        hairStyle: 'none', top: 'jacket', bottom: 'pants',
      });
      soldier.position.set(sx, 0, sz);
      soldier.rotation.y = Math.random() * Math.PI * 2;
      soldier.traverse((c) => { c.castShadow = true; });
      scene.add(soldier);
    });

    // Tanks — south-west quarter
    [[cx - 20, cz + 15], [cx - 8, cz + 15], [cx - 20, cz + 28]].forEach((pos) => {
      const mesh = makeTankMesh();
      mesh.position.set(pos[0], 0, pos[1]);
      scene.add(mesh);
      vehicles.push({ mesh, x: pos[0], z: pos[1], heading: Math.PI, speed: 0, occupied: false, type: 'tank' });
    });

    // Military jeeps — parked near the gate for a quick grab
    [[cx - 30, cz - 8], [cx - 30, cz + 8]].forEach((pos) => {
      const mesh = makeJeepMesh();
      mesh.position.set(pos[0], 0, pos[1]);
      scene.add(mesh);
      vehicles.push({ mesh, x: pos[0], z: pos[1], heading: Math.PI / 2, speed: 0, occupied: false, type: 'jeep' });
    });

    // Jets — out on the open tarmac (south-east quarter), nowhere near the
    // hangar buildings so they no longer clip into them
    [[cx + 15, cz + 20], [cx + 28, cz + 20], [cx + 15, cz + 32]].forEach((pos) => {
      const mesh = makeJetMesh();
      mesh.position.set(pos[0], 0, pos[1]);
      scene.add(mesh);
      vehicles.push({ mesh, x: pos[0], z: pos[1], heading: Math.PI, speed: 0, occupied: false, type: 'jet' });
    });

    // Recruiter kiosk, just outside the gate on the city side
    const kioskX = cx - halfSize - 9, kioskZ = cz;
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0x78716c }));
    kiosk.position.set(kioskX, 1.2, kioskZ);
    kiosk.castShadow = true;
    scene.add(kiosk);
    addFloatingSign(kioskX, 3.6, kioskZ, '🪖 GET A BASE JOB');
    militaryBaseCenter.recruiter = { x: kioskX, z: kioskZ };
  }

  function makeJeepMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.6), bodyMat);
    body.position.y = 0.55;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.2), bodyMat);
    hood.position.set(0, 0.5, 1.6);
    const rollBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), darkMat);
    rollBar.position.set(0, 1.15, -0.6);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), darkMat);
    spare.rotation.z = Math.PI / 2;
    spare.position.set(0, 0.75, -1.85);
    group.add(body, hood, rollBar, spare);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12);
    [[-0.95, 0.34, 1.2], [0.95, 0.34, 1.2], [-0.95, 0.34, -1.2], [0.95, 0.34, -1.2]].forEach((p) => {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], p[1], p[2]);
      group.add(wheel);
    });
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  // Distant mountain backdrop, unreachable — pure scenery north of the
  // city — with a Hollywood-style sign on the tallest peak, spelled out
  // as individual letter panels rather than one flat text sprite.
  function buildMountains() {
    const mz = -(WORLD_HALF + 165);
    const peaks = [
      { x: -260, h: 95, r: 115 }, { x: -150, h: 120, r: 130 }, { x: -20, h: 145, r: 150 },
      { x: 110, h: 125, r: 135 }, { x: 230, h: 100, r: 120 }, { x: 340, h: 85, r: 105 },
    ];
    mountainPeaks = peaks;
    mountainZ = mz;
    const farthestX = Math.max(...peaks.map((p) => Math.abs(p.x) + p.r));
    mountainClampR = Math.max(farthestX, Math.abs(mz) + Math.max(...peaks.map((p) => p.r))) + 15;
    peaks.forEach((p, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x5b6b4f : 0x4a5a40, roughness: 0.95 });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(p.r, p.h, 9), mat);
      cone.position.set(p.x, p.h / 2 - 3, mz);
      cone.receiveShadow = true;
      scene.add(cone);
    });
    const tallest = peaks.reduce((a, b) => (b.h > a.h ? b : a));
    buildHollywoodSign(tallest.x, tallest.h * 0.42, mz + tallest.r * 0.55);
  }

  // Lets the player actually climb the mountains instead of them being an
  // unreachable backdrop: each peak is a cone, so its surface height falls
  // off linearly from the tip to the base radius — walking toward one
  // raises the floor under your feet the same way a rooftop does.
  function getMountainHeightAt(x, z) {
    let best = 0;
    for (const p of mountainPeaks) {
      const d = Math.hypot(x - p.x, z - mountainZ);
      if (d < p.r) {
        const h = (p.h - 3) - (d / p.r) * p.h;
        if (h > best) best = h;
      }
    }
    return best;
  }

  function buildHollywoodSign(x, y, z) {
    const letters = 'HOLLYWOOD'.split('');
    const letterW = 7, gap = 1.6;
    const totalW = letters.length * letterW + (letters.length - 1) * gap;
    const startX = x - totalW / 2 + letterW / 2;
    letters.forEach((ch, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 128, 160);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 120, 152);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 130px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, 64, 90);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(letterW, letterW * 1.25), mat);
      plane.position.set(startX + i * (letterW + gap), y, z);
      scene.add(plane);
    });
  }

  // ------------------------------------------------------------
  // Beach & Carnival — sand + an animated ocean out past the south edge
  // of the city, jet skis parked at the shoreline, a half-submerged
  // submarine out in open water, and a boardwalk carnival (Ferris wheel,
  // carousel, four food stalls) reachable by a short flight of steps up
  // from the sand. Nothing here needs a new clamp radius — it all sits
  // well inside the radius the Military Base already opened up.
  // ------------------------------------------------------------
  const FOOD_KINDS = {
    hotdog: { emoji: '🌭', name: 'Hot Dog', price: 8, color: 0xdc2626 },
    burrito: { emoji: '🌯', name: 'Burrito', price: 10, color: 0x16a34a },
    burger: { emoji: '🍔', name: 'Burger', price: 12, color: 0xca8a04 },
    drink: { emoji: '🥤', name: 'Drink', price: 5, color: 0x2563eb },
  };

  function buildBeachCarnival() {
    const cx = 0;
    const sandNear = WORLD_HALF + 10;   // 136 — just past the city's outer sidewalk
    const sandFar = sandNear + 54;      // 190 — shoreline
    const waterFar = sandFar + 130;     // 320 — a lot more open water to explore/drive around in
    beachCenter = { x: cx, z: (sandNear + sandFar) / 2 };
    // Carnival sits on dry sand, off to the east side of the beach, well
    // clear of the water — not built out over it on a dock.
    carnivalCenter = { x: 110, z: (sandNear + sandFar) / 2 };
    oceanStartZ = sandFar;
    beachClampR = waterFar + 15; // lets the player/jet skis actually reach the new, bigger ocean

    // Sand and ocean are both wide enough to fully cover the grass ground
    // plane behind them — narrower planes used to leave grass visible
    // flanking the beach at the edges of the view.
    const COAST_WIDTH = 480;

    // Sand
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xe9d5a1, roughness: 1 });
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(COAST_WIDTH, sandFar - sandNear), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(cx, 0.02, (sandNear + sandFar) / 2);
    sand.receiveShadow = true;
    scene.add(sand);

    // Ocean — a coarse grid so per-vertex sine waves stay cheap, animated
    // in updateOcean() every frame via the cached base Z offsets. A small
    // Y offset alone wasn't enough to stop this from z-fighting against
    // the world's grass ground plane at typical camera distances (visible
    // as jagged green patches bleeding through the water), so this also
    // uses a real polygonOffset to robustly win the depth test regardless
    // of distance; opaque and more saturated for a cleaner, bluer look
    // instead of the washed-out translucent teal it had before.
    const oceanGeo = new THREE.PlaneGeometry(COAST_WIDTH, waterFar - sandFar, 26, 12);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1565c0, roughness: 0.25,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.set(cx, 0.05, (sandFar + waterFar) / 2);
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);
    oceanBaseZ = Float32Array.from(oceanGeo.attributes.position.array);

    // Foam line at the shore
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.55 });
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(COAST_WIDTH, 3), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(cx, 0.07, sandFar);
    scene.add(foam);

    addFloatingSign(cx, 3.2, sandNear + 6, '🏖️ BEACH');

    // Decorative palm trees + umbrellas on the sand
    [[-70, sandNear + 14], [-55, sandNear + 30], [66, sandNear + 12], [60, sandNear + 34]].forEach(([x, z]) => {
      scene.add(makePalmTree(x, z));
    });
    [[-30, sandNear + 18], [32, sandNear + 22]].forEach(([x, z]) => {
      scene.add(makeBeachUmbrella(x, z));
    });

    // Jet skis parked right at the shoreline — walk a few steps into the
    // shallow water and they're right there to steal. Each one gets a
    // different hull/accent color so they don't all look identical.
    const jetskiPalette = [
      { hull: 0xfacc15, accent: 0x1c1917 },
      { hull: 0xef4444, accent: 0xf8fafc },
      { hull: 0x3b82f6, accent: 0xfacc15 },
    ];
    [-16, 0, 16].forEach((x, i) => {
      const colors = jetskiPalette[i % jetskiPalette.length];
      const mesh = makeJetSkiMesh(colors.hull, colors.accent);
      const z = sandFar + 4;
      mesh.position.set(x, 0, z);
      // heading 0 = +Z = further out into open water, so driving forward
      // right after boarding heads out to sea instead of back onto the sand.
      scene.add(mesh);
      vehicles.push({ mesh, x, z, heading: 0, speed: 0, occupied: false, type: 'jetski' });
    });

    // Submarine, sticking halfway out of the water far out to sea
    const sub = makeSubmarineMesh();
    sub.position.set(-25, 0, waterFar - 55);
    sub.rotation.y = Math.PI / 5;
    scene.add(sub);
    buildingBoxes.push(boxOf(-25, waterFar - 55, 4, 15, 3.2));

    // Carnival — a small, compact corner of the beach, not spread across
    // it: the rides are scaled down and clustered tightly together.
    addFloatingSign(carnivalCenter.x, 3.2, carnivalCenter.z - 13, '🎡 CARNIVAL');

    // Ferris wheel
    const ferris = makeFerrisWheelGroup();
    ferris.group.scale.set(0.7, 0.7, 0.7);
    ferris.group.position.set(carnivalCenter.x - 9, 0, carnivalCenter.z);
    scene.add(ferris.group);
    rides.push({ group: ferris.wheelGroup, axis: 'z', speed: 0.22 });

    // Carousel
    const carousel = makeCarouselGroup();
    carousel.group.scale.set(0.7, 0.7, 0.7);
    carousel.group.position.set(carnivalCenter.x + 10, 0, carnivalCenter.z);
    scene.add(carousel.group);
    rides.push({ group: carousel.discGroup, axis: 'y', speed: 0.55 });

    // Food stalls
    const stallSpots = [
      { kind: 'hotdog', x: carnivalCenter.x - 13, z: carnivalCenter.z - 7 },
      { kind: 'burrito', x: carnivalCenter.x + 13, z: carnivalCenter.z - 7 },
      { kind: 'burger', x: carnivalCenter.x - 13, z: carnivalCenter.z + 8 },
      { kind: 'drink', x: carnivalCenter.x + 13, z: carnivalCenter.z + 8 },
    ];
    stallSpots.forEach((spot) => {
      const info = FOOD_KINDS[spot.kind];
      scene.add(makeFoodStallMesh(spot.x, spot.z, info));
      buildingBoxes.push(boxOf(spot.x, spot.z, 2, 1.8));
      foodStalls.push({ x: spot.x, z: spot.z, kind: spot.kind, price: info.price, cooldownUntil: 0 });
    });
  }

  function updateOcean(dt) {
    if (!oceanMesh) return;
    oceanTime += dt;
    const pos = oceanMesh.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const vx = oceanBaseZ[i], vy = oceanBaseZ[i + 1];
      arr[i + 2] = Math.sin(oceanTime * 1.3 + vx * 0.16 + vy * 0.12) * 0.16
        + Math.sin(oceanTime * 0.8 - vy * 0.2) * 0.08;
    }
    pos.needsUpdate = true;
  }

  function makePalmTree(x, z) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.8 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4, 6), trunkMat);
    trunk.position.y = 2;
    trunk.rotation.z = 0.12;
    group.add(trunk);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), leafMat);
      frond.position.set(0.2, 4.1, 0);
      frond.rotation.z = Math.PI / 2.3;
      frond.rotation.y = (i / 5) * Math.PI * 2;
      group.add(frond);
    }
    group.position.set(x, 0, z);
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  function makeBeachUmbrella(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
    pole.position.y = 0.9;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    canopy.position.y = 1.9;
    group.add(pole, canopy);
    group.position.set(x, 0, z);
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  // A recognizable personal-watercraft silhouette — flat rear hull, a
  // pointed wedge bow, a raised seat ridge, handlebars and a windshield —
  // instead of the plain rounded capsule it used to be.
  function makeJetSkiMesh(hullColor, accentColor) {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: hullColor !== undefined ? hullColor : 0xfacc15, roughness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: accentColor !== undefined ? accentColor : 0x1c1917, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.15, transparent: true, opacity: 0.55 });

    // Flat-ish rear hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.4, 1.5), hullMat);
    hull.position.set(0, 0.3, -0.25);
    group.add(hull);

    // Pointed bow — a 4-sided cone makes a simple wedge, flattened so it
    // isn't just a spike
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.3, 4), hullMat);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.scale.set(1, 0.55, 1);
    bow.position.set(0, 0.32, 0.9);
    group.add(bow);

    // Raised seat ridge down the centerline
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 1.15), darkMat);
    seat.position.set(0, 0.6, -0.2);
    group.add(seat);

    // Small windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.04), glassMat);
    windshield.rotation.x = -0.4;
    windshield.position.set(0, 0.72, 0.5);
    group.add(windshield);

    // Handlebars
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.44, 6);
    [-0.13, 0.13].forEach((bx) => {
      const bar = new THREE.Mesh(barGeo, darkMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(bx, 0.7, 0.4);
      group.add(bar);
    });

    // Rear water-jet nozzle
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.16, -1.05);
    group.add(nozzle);

    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  function makeSubmarineMesh() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3f4a4f, roughness: 0.55, metalness: 0.3 });
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 9, 6, 12), hullMat);
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 0;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 3.2), hullMat);
    tower.position.set(0, 3.6, 0);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 6), hullMat);
    scope.position.set(0, 5.4, 0);
    group.add(hull, tower, scope);
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  function makeFerrisWheelGroup() {
    const outer = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.4 });
    const legGeo = new THREE.BoxGeometry(0.35, 9.5, 0.35);
    [-1, 1].forEach((side) => {
      [-1, 1].forEach((front) => {
        const leg = new THREE.Mesh(legGeo, steelMat);
        leg.position.set(side * 6.2, 4.75, front * 1.2);
        leg.rotation.z = side * 0.18;
        outer.add(leg);
      });
    });

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 9, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.22, 8, 20), steelMat);
    wheelGroup.add(rim);
    const gondolaColors = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899, 0x14b8a6, 0xf97316];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.5, 6), steelMat);
      spoke.rotation.z = Math.PI / 2 - angle; // point radially outward at this angle in the wheel's XY plane
      spoke.position.set(Math.cos(angle) * 3.25, Math.sin(angle) * 3.25, 0);
      wheelGroup.add(spoke);
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), new THREE.MeshStandardMaterial({ color: gondolaColors[i] }));
      gondola.position.set(Math.cos(angle) * 6.5, Math.sin(angle) * 6.5, 0);
      wheelGroup.add(gondola);
    }
    outer.add(wheelGroup);
    outer.traverse((c) => { c.castShadow = true; });
    return { group: outer, wheelGroup };
  }

  function makeCarouselGroup() {
    const outer = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.4, 16), baseMat);
    base.position.y = 0.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    pole.position.y = 2.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.8, 16), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    roof.position.y = 5;
    outer.add(base, pole, roof);

    const discGroup = new THREE.Group();
    discGroup.position.y = 0.45;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xfde68a }));
    discGroup.add(disc);
    const horseColors = [0xf87171, 0x60a5fa, 0x34d399, 0xfbbf24, 0xc084fc, 0xf472b6];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const horseGroup = new THREE.Group();
      const poleH = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
      poleH.position.y = 0.9;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: horseColors[i] }));
      body.position.y = 1.5;
      horseGroup.add(poleH, body);
      horseGroup.position.set(Math.cos(angle) * 3.2, 0, Math.sin(angle) * 3.2);
      discGroup.add(horseGroup);
    }
    outer.add(discGroup);
    outer.traverse((c) => { c.castShadow = true; });
    return { group: outer, discGroup };
  }

  function makeFoodStallMesh(x, z, info) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.6), bodyMat);
    body.position.y = 0.7;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2), roofMat);
    roof.position.y = 1.5;
    group.add(body, roof);
    group.position.set(x, 0, z);
    group.traverse((c) => { c.castShadow = true; c.receiveShadow = true; });
    addFloatingSign(x, 2.6, z, `${info.emoji} ${info.name} $${info.price}`);
    return group;
  }

  function buyFood(stall) {
    const now = performance.now() / 1000;
    if (now < stall.cooldownUntil) {
      toast('🍽️ Still cooking — try again in a bit.');
      return;
    }
    const info = FOOD_KINDS[stall.kind];
    if (state.money < stall.price) {
      toast(`${info.emoji} You need $${stall.price} for a ${info.name.toLowerCase()}.`);
      return;
    }
    state.money -= stall.price;
    stall.cooldownUntil = now + 8;
    healPlayer(15);
    updateHUDMoney();
    writeSave();
    toast(`${info.emoji} Bought a ${info.name}! +15 health`, 2200);
  }

  function makeTankMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.75 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 4.6), bodyMat);
    hull.position.y = 0.75;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.6, 10), bodyMat);
    turret.position.y = 1.4;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.4, 1.8);
    [-1, 1].forEach((side) => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 4.8), trackMat);
      track.position.set(side * 1.4, 0.45, 0);
      group.add(track);
    });
    group.add(hull, turret, barrel);
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  function makeJetMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 5.2, 10), bodyMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.y = 0.9;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 10), bodyMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.9, 2.9);
    const wingGeo = new THREE.BoxGeometry(4.2, 0.1, 1.1);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(0, 0.85, -0.2);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1), accentMat);
    tailFin.position.set(0, 1.4, -2.3);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 5.3), accentMat);
    stripe.position.y = 0.9;
    stripe.scale.set(0.98, 0.3, 1);
    group.add(fuselage, nose, wing, tailFin, stripe);
    group.traverse((c) => { c.castShadow = true; });
    return group;
  }

  function addFloatingSign(x, y, z, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.roundRect ? ctx.roundRect(0, 0, 256, 64, 12) : ctx.rect(0, 0, 256, 64);
    ctx.fill();
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(8, 2, 1);
    sprite.position.set(x, y, z);
    scene.add(sprite);
  }

  function randomOpenSpot(margin) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
      const z = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
      if (!collidesWithBuildings(x, z, margin || 1.2)) return { x, z };
    }
    return { x: 0, z: 6 };
  }

  // Same, but also avoids the street — for spawning pedestrians/robots so
  // they start on a sidewalk instead of in traffic.
  function randomSidewalkSpot(margin) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
      const z = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
      if (!collidesWithBuildings(x, z, margin || 1.2) && !isOnRoad(x, z)) return { x, z };
    }
    return { x: ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2, z: 18 }; // dead center of a sidewalk strip, well clear of any road line
  }

  // Same idea, but biased to land within `radius` of (cx,cz) — used to
  // guarantee a few cars/pedestrians spawn visibly near the player's start
  // instead of only ever scattered randomly across the whole city.
  function randomOpenSpotNear(cx, cz, radius, margin) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = cx + (Math.random() * 2 - 1) * radius;
      const z = cz + (Math.random() * 2 - 1) * radius;
      if (!collidesWithBuildings(x, z, margin || 1.2)) return { x, z };
    }
    return randomOpenSpot(margin);
  }

  function collidesWithBuildings(x, z, margin) {
    for (const b of buildingBoxes) {
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
    }
    return false;
  }

  // Distance from a single coordinate to the nearest road centerline
  // (roads run along both axes at every BLOCK_SIZE interval).
  function distToNearestRoadLine(coord) {
    const rel = ((coord + WORLD_HALF) % BLOCK_SIZE + BLOCK_SIZE) % BLOCK_SIZE;
    return Math.min(rel, BLOCK_SIZE - rel);
  }

  // True if (x,z) falls inside a road strip (either axis) — used to keep
  // pedestrians and robots walking on the sidewalk instead of the street.
  function isOnRoad(x, z, margin) {
    const half = ROAD_WIDTH / 2 + (margin || 0);
    return distToNearestRoadLine(x) < half || distToNearestRoadLine(z) < half;
  }

  // ------------------------------------------------------------
  // Player
  // ------------------------------------------------------------
  // A small always-camera-facing target reticle that floats above the
  // player's head — toggled on/off with the 🎯 button, replacing the old
  // fixed screen-center crosshair that used to sit right on top of the
  // character in third person.
  function makeAimMarkerSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(48, 48, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, 6); ctx.lineTo(48, 22);
    ctx.moveTo(48, 74); ctx.lineTo(48, 90);
    ctx.moveTo(6, 48); ctx.lineTo(22, 48);
    ctx.moveTo(74, 48); ctx.lineTo(90, 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(48, 48, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(0.5, 0.5, 1);
    sprite.position.set(0, 2.18, 0); // clears every hat style (crown spikes top out around 1.94)
    sprite.visible = false;
    return sprite;
  }

  function createPlayer() {
    playerMesh = buildCharacterMesh(Object.assign({}, state.character, { weapon: state.currentWeaponId }));
    playerMesh.castShadow = true;
    playerMesh.traverse((c) => { c.castShadow = true; });
    scene.add(playerMesh);
    playerAimMarker = makeAimMarkerSprite();
    playerMesh.add(playerAimMarker);

    player = {
      x: 4, z: 10, heading: 0, speed: 0,
      walking: false,
      bobPhase: 0,
      y: 0, vy: 0, grounded: true, jumpsUsed: 0, jumpRequest: false, fallFromY: 0,
    };
    playerMesh.position.set(player.x, 0, player.z);
  }

  // ------------------------------------------------------------
  // Vehicles
  // ------------------------------------------------------------
  const CAR_COLORS = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xf97316, 0xffffff, 0x8b5cf6];

  function makeCarMesh(color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.2), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.75 }));
    cabin.position.set(0, 1.15, -0.2);
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 14);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const positions = [[-1.05, 0.42, 1.4], [1.05, 0.42, 1.4], [-1.05, 0.42, -1.4], [1.05, 0.42, -1.4]];
    positions.forEach((p) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], p[1], p[2]);
      wheel.castShadow = true;
      group.add(wheel);
    });
    const headlightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef9c3, emissiveIntensity: 0.6 });
    [-0.7, 0.7].forEach((x) => {
      const hl = new THREE.Mesh(headlightGeo, headlightMat);
      hl.position.set(x, 0.6, 2.12);
      group.add(hl);
    });
    return group;
  }

  // A random point ON a road, with a heading aligned to that road's axis
  // and offset toward one "lane" — NPC-driven cars only ever spawn (and
  // stay) on the street, never the grass/sidewalks.
  function randomRoadSpot() {
    const axis = Math.random() < 0.5 ? 'h' : 'v';
    const lineIndex = Math.floor(Math.random() * (CITY_BLOCKS + 1));
    const line = -WORLD_HALF + lineIndex * BLOCK_SIZE;
    const along = (Math.random() * 2 - 1) * (WORLD_HALF - 4);
    const laneOffset = (Math.random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 4);
    if (axis === 'h') {
      return { x: along, z: line + laneOffset, heading: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
    }
    return { x: line + laneOffset, z: along, heading: Math.random() < 0.5 ? 0 : Math.PI };
  }

  function spawnVehicles() {
    const count = 26;
    const nearSpawnCount = 4; // guarantees cars are visible right at the start, not just scattered far away
    for (let i = 0; i < count; i++) {
      const occupied = i % 2 === 0;
      // Occupied cars are the ones with an NPC driver actually cruising
      // the streets, so they need to start ON a road; parked cars can sit
      // anywhere open (like curbside parking).
      const spot = occupied
        ? randomRoadSpot()
        : (i < nearSpawnCount ? randomOpenSpotNear(4, 10, 22, 3) : randomOpenSpot(3));
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const mesh = makeCarMesh(color);
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      // Roughly half the cars already have a driver cruising the streets —
      // hop in and that driver bails, handing you the car (see
      // tryEnterExitVehicle). The rest sit parked, free to just take.
      vehicles.push({
        mesh, x: spot.x, z: spot.z, heading: spot.heading !== undefined ? spot.heading : Math.random() * Math.PI * 2, speed: 0,
        occupied, decidedAtIntersection: false,
      });
    }
  }

  // ------------------------------------------------------------
  // Robots (targets) & Pedestrians (decoration, cannot be busted)
  // ------------------------------------------------------------
  function makeRobotMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.4 });
    const glitchMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.4), bodyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bodyMat);
    head.position.y = 1.55;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glitchMat);
    eye.position.set(0, 1.55, 0.21);
    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const legL = new THREE.Mesh(legGeo, bodyMat); legL.position.set(-0.15, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat); legR.position.set(0.15, 0.35, 0);
    group.add(torso, head, eye, legL, legR);
    group.traverse((c) => { c.castShadow = true; });
    group.userData.eye = eye;
    return group;
  }

  function spawnRobots() {
    for (let i = 0; i < 14; i++) {
      const spot = randomSidewalkSpot(2);
      const mesh = makeRobotMesh();
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      const bot = {
        mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2,
        hp: 40 + Math.floor(Math.random() * 40), maxHp: 40,
        alive: true, wanderTimer: Math.random() * 3, fleeing: false,
      };
      mesh.userData.entityRef = bot; // lets a raycast hit on any child part resolve back to this robot
      robots.push(bot);
    }
  }

  function makePedestrianMesh() {
    const cfg = {
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
      pants: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)],
      hat: 'none', accessory: Math.random() < 0.15 ? 'chain' : 'none',
      hairStyle: HAIR_STYLES[1 + Math.floor(Math.random() * (HAIR_STYLES.length - 1))],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      top: TOPS[Math.floor(Math.random() * TOPS.length)],
      bottom: BOTTOMS[Math.floor(Math.random() * BOTTOMS.length)],
    };
    const mesh = buildCharacterMesh(cfg);
    mesh.scale.setScalar(0.95);
    mesh.traverse((c) => { c.castShadow = true; });
    return mesh;
  }

  function spawnPedestrians() {
    for (let i = 0; i < 10; i++) {
      const spot = randomSidewalkSpot(2);
      const mesh = makePedestrianMesh();
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      const ped = { mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3, fleeing: false };
      mesh.userData.entityRef = ped;
      pedestrians.push(ped);
    }
  }

  // Spawns a one-off pedestrian who immediately runs off — used when the
  // player carjacks an occupied vehicle, so "taking" a car has a visible
  // (harmless, comedic) consequence instead of the driver just vanishing.
  function spawnFleeingBystander(x, z, heading) {
    const mesh = makePedestrianMesh();
    const sideStep = (heading || 0) + Math.PI / 2;
    const sx = x + Math.sin(sideStep) * 1.6;
    const sz = z + Math.cos(sideStep) * 1.6;
    mesh.position.set(sx, 0, sz);
    scene.add(mesh);
    const ped = { mesh, x: sx, z: sz, heading: Math.random() * Math.PI * 2, wanderTimer: 999, fleeing: true };
    mesh.userData.entityRef = ped;
    pedestrians.push(ped);
  }

  // ------------------------------------------------------------
  // Coins
  // ------------------------------------------------------------
  function makeCoinMesh() {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x92400e, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }

  function spawnCoins() {
    for (let i = 0; i < 18; i++) {
      const spot = randomOpenSpot(1);
      const mesh = makeCoinMesh();
      mesh.position.set(spot.x, 0.6, spot.z);
      scene.add(mesh);
      coins.push({ mesh, x: spot.x, z: spot.z, active: true, respawnTimer: 0 });
    }
  }

  // ==============================================================
  // INPUT
  // ==============================================================
  const keys = {};
  const input = { moveX: 0, moveY: 0, fire: false, enter: false, jump: false };
  let lookDeltaX = 0, lookDeltaY = 0;

  function setupInput() {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyE') tryEnterExitVehicle();
      if (e.code === 'Space') { e.preventDefault(); fireWeapon(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') player.jumpRequest = true;
      if (e.code >= 'Digit1' && e.code <= 'Digit6') {
        const idx = parseInt(e.code.slice(-1), 10) - 1;
        const owned = WEAPONS.filter((w) => state.ownedWeapons.includes(w.id));
        if (owned[idx]) equipWeapon(owned[idx].id);
      }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) fireWeapon();
    });

    // Right-side drag-to-look (also works with mouse on desktop over the look zone)
    const lookZone = $('look-zone');
    let looking = false, lastX = 0, lastY = 0;
    function lookStart(x, y) { looking = true; lastX = x; lastY = y; }
    function lookMove(x, y) {
      if (!looking) return;
      lookDeltaX += (x - lastX);
      lookDeltaY += (y - lastY);
      lastX = x; lastY = y;
    }
    function lookEnd() { looking = false; }
    lookZone.addEventListener('pointerdown', (e) => lookStart(e.clientX, e.clientY));
    window.addEventListener('pointermove', (e) => lookMove(e.clientX, e.clientY));
    window.addEventListener('pointerup', lookEnd);

    // Joystick
    const joyBase = $('joystick-base');
    const joyKnob = $('joystick-knob');
    let joyActive = false, joyStartX = 0, joyStartY = 0;
    const JOY_RADIUS = 45;

    function joyDown(x, y) { joyActive = true; joyStartX = x; joyStartY = y; }
    function joyMove(x, y) {
      if (!joyActive) return;
      let dx = x - joyStartX, dy = y - joyStartY;
      const dist = Math.min(Math.hypot(dx, dy), JOY_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * dist, ky = Math.sin(angle) * dist;
      joyKnob.style.left = `calc(50% + ${kx}px)`;
      joyKnob.style.top = `calc(50% + ${ky}px)`;
      input.moveX = dx / JOY_RADIUS;
      input.moveY = dy / JOY_RADIUS;
    }
    function joyReset() {
      joyActive = false;
      input.moveX = 0; input.moveY = 0;
      joyKnob.style.left = '50%';
      joyKnob.style.top = '50%';
    }
    joyBase.addEventListener('pointerdown', (e) => { joyDown(e.clientX, e.clientY); joyBase.setPointerCapture(e.pointerId); });
    joyBase.addEventListener('pointermove', (e) => joyMove(e.clientX, e.clientY));
    joyBase.addEventListener('pointerup', joyReset);
    joyBase.addEventListener('pointercancel', joyReset);

    $('btn-fire').addEventListener('pointerdown', () => { input.fire = true; fireWeapon(); });
    $('btn-fire').addEventListener('pointerup', () => { input.fire = false; });
    $('btn-enter').addEventListener('pointerdown', () => tryEnterExitVehicle());
    $('btn-jump').addEventListener('pointerdown', () => { player.jumpRequest = true; });

    // Everything (phone/map/weapons/aim-marker) lives behind one small
    // "Items" button now instead of four separate icons — tap it to open
    // a little dropdown, tap an item to use it (which also closes the menu).
    const itemsMenu = $('items-menu');
    $('btn-items').addEventListener('click', (e) => {
      e.stopPropagation();
      itemsMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!itemsMenu.classList.contains('hidden') && !itemsMenu.contains(e.target) && e.target.id !== 'btn-items') {
        itemsMenu.classList.add('hidden');
      }
    });
    $('btn-phone').addEventListener('click', () => { itemsMenu.classList.add('hidden'); openPhone(); });
    $('btn-map').addEventListener('click', () => { itemsMenu.classList.add('hidden'); openMap(); });
    $('btn-weapons').addEventListener('click', () => { itemsMenu.classList.add('hidden'); openWeaponWheel(); });
    $('btn-aim-marker').addEventListener('click', () => {
      itemsMenu.classList.add('hidden');
      state.aimMarkerOn = !state.aimMarkerOn;
    });
    $('btn-weapon-prev').addEventListener('click', () => cycleWeapon(-1));
    $('btn-weapon-next').addEventListener('click', () => cycleWeapon(1));
    $('btn-clear-waypoint').addEventListener('click', () => {
      state.waypoint = null;
      $('waypoint-info').classList.add('hidden');
      toast('Waypoint cleared.');
    });
    $('btn-map-zoom-in').addEventListener('click', () => { setMapZoom(mapZoom + 0.5); });
    $('btn-map-zoom-out').addEventListener('click', () => { setMapZoom(mapZoom - 0.5); });
  }

  function keyboardMove() {
    let mx = 0, my = 0;
    if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) my += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    return { mx, my };
  }

  // ==============================================================
  // WEAPON / SHOP LOGIC
  // ==============================================================
  function equipWeapon(id) {
    if (!state.ownedWeapons.includes(id)) return;
    state.currentWeaponId = id;
    updateWeaponHUD();
    updateHeldWeaponMesh();
    writeSave();
  }

  // Quick-swap with the arrow buttons on the HUD weapon display, so once
  // you own a bunch of weapons you don't have to open the full wheel just
  // to flip to the next one.
  function cycleWeapon(direction) {
    const owned = WEAPONS.filter((w) => state.ownedWeapons.includes(w.id));
    if (owned.length <= 1) return;
    const idx = owned.findIndex((w) => w.id === state.currentWeaponId);
    const nextIdx = (idx + direction + owned.length) % owned.length;
    equipWeapon(owned[nextIdx].id);
  }

  // Swaps the 3D prop in the player's hand to match the equipped weapon
  // without rebuilding the whole character model.
  function updateHeldWeaponMesh() {
    if (!playerMesh) return;
    const armR = playerMesh.userData.armR;
    if (playerMesh.userData.heldWeapon) {
      armR.remove(playerMesh.userData.heldWeapon);
      disposeObject(playerMesh.userData.heldWeapon);
      playerMesh.userData.heldWeapon = null;
    }
    if (state.currentWeaponId !== 'fists') {
      const weaponMesh = makeWeaponMesh(state.currentWeaponId);
      weaponMesh.position.set(0.1, -0.62, 0.13);
      weaponMesh.rotation.y = Math.PI / 2;
      weaponMesh.traverse((c) => { c.castShadow = true; });
      armR.add(weaponMesh);
      playerMesh.userData.heldWeapon = weaponMesh;
    }
  }

  function updateWeaponHUD() {
    const w = getWeapon(state.currentWeaponId);
    $('weapon-icon').textContent = w.icon;
    $('weapon-name').textContent = w.name;
    const ammoEl = $('weapon-ammo');
    if (w.id === 'fists') {
      ammoEl.textContent = '';
      ammoEl.classList.remove('low');
    } else {
      const ammo = state.ammo[w.id] || 0;
      ammoEl.textContent = `${ammo}/${MAX_AMMO}`;
      ammoEl.classList.toggle('low', ammo === 0);
    }
  }

  function updateHUDMoney() {
    $('money-value').textContent = state.money;
    $('shop-money').textContent = state.money;
  }

  // Reused every shot rather than allocated fresh — a Raycaster is cheap
  // to reset but there's no reason to churn one per shot.
  const fireRaycaster = new THREE.Raycaster();

  // Walks up from whatever mesh part the ray actually hit (an arm, the
  // head, whatever) to the robot/pedestrian object that owns it — every
  // top-level bot/ped mesh is tagged with userData.entityRef at spawn.
  function findEntityFromHit(object) {
    let o = object;
    while (o) {
      if (o.userData && o.userData.entityRef) return o.userData.entityRef;
      o = o.parent;
    }
    return null;
  }

  function fireWeapon() {
    if (state.inVehicle) return; // no shooting while driving
    const w = getWeapon(state.currentWeaponId);
    const now = performance.now() / 1000;
    const cooldown = 1 / w.rate;
    if (now - state.lastShotTime < cooldown) return;

    if (w.id !== 'fists') {
      const ammo = state.ammo[w.id] || 0;
      if (ammo <= 0) {
        toast(`${w.icon} Out of ammo! Refill at the Blaster Shop 💦`, 1800);
        return;
      }
      state.ammo[w.id] = ammo - 1;
      updateWeaponHUD();
      writeSave();
    }
    state.lastShotTime = now;

    const originX = player.x, originZ = player.z;

    // A ray straight through screen-center from the actual camera position
    // dives into the ground a short distance past the player — the camera
    // orbits close and pitched down just to keep a nearby player in frame,
    // and continuing that exact sightline out further only sinks lower.
    // So: aim horizontally by cameraYaw (matches drag-look left/right
    // precisely — no more "anything within ~20°" cone), and aim vertically
    // by how far cameraPitch has been dragged from its resting angle, at a
    // much gentler rate — enough to deliberately aim up at a head or down
    // at the ground, without the ray's height collapsing over distance.
    const aimYaw = cameraYaw + Math.PI; // world-space "into the screen" direction, same convention as player.heading
    const aimDir = new THREE.Vector3(
      Math.sin(aimYaw),
      (0.28 - cameraPitch) * 1.1,
      Math.cos(aimYaw)
    ).normalize();
    fireRaycaster.set(new THREE.Vector3(originX, cameraFollowY + 1.3, originZ), aimDir);
    const targetMeshes = [];
    robots.forEach((bot) => { if (bot.alive) targetMeshes.push(bot.mesh); });
    pedestrians.forEach((ped) => targetMeshes.push(ped.mesh));
    const hits = fireRaycaster.intersectObjects(targetMeshes, true);

    let hitSomething = false;
    if (hits.length && hits[0].distance <= w.range) {
      const entity = findEntityFromHit(hits[0].object);
      if (entity && robots.includes(entity)) {
        applyDamageToRobot(entity, w.damage);
        hitSomething = true;
      } else if (entity && pedestrians.includes(entity)) {
        splashPedestrian(entity);
        hitSomething = true;
      }
    }
    spawnBlasterFX(originX, originZ, player.heading);
    if (!hitSomething) {
      // small chance friendly flavor text if aimed at pedestrian
    }
  }

  // Getting splashed is just a startle, not a "hit" — no damage, no reward,
  // no removal. They yelp, dash off for a bit, then go back to wandering.
  function splashPedestrian(ped) {
    if (!ped.fleeing) toast('💦 Splash! They ran off.', 1400);
    ped.fleeing = true;
  }

  // A small silver pellet with a weapon-colored tip, instead of a glowing
  // orb — reads as a dart/pellet rather than a sci-fi laser bolt.
  function spawnBlasterFX(x, z, heading) {
    const w = getWeapon(state.currentWeaponId);
    const fx = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.7, roughness: 0.25 })
    );
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.4 }));
    tip.position.set(0, 0, 0.12);
    fx.add(body, tip);
    fx.position.set(x + Math.sin(heading) * 1.2, 1.1, z + Math.cos(heading) * 1.2);
    fx.rotation.y = heading;
    scene.add(fx);
    let life = 0;
    const dirX = Math.sin(heading), dirZ = Math.cos(heading);
    function anim() {
      life += 1;
      fx.position.x += dirX * 1.1;
      fx.position.z += dirZ * 1.1;
      if (life < 14) requestAnimationFrame(anim);
      else scene.remove(fx);
    }
    anim();
  }

  function applyDamageToRobot(bot, dmg) {
    bot.hp -= dmg;
    bot.fleeing = true;
    if (bot.hp <= 0 && bot.alive) {
      bot.alive = false;
      bot.mesh.rotation.z = Math.PI / 2;
      bot.mesh.position.y = 0.3;
      const reward = 20 + Math.floor(Math.random() * 40);
      state.money += reward;
      updateHUDMoney();
      writeSave();
      toast(`🤖 Robot busted! +$${reward}`, 1600);
      updateMissionProgressOnBust();
      setTimeout(() => {
        scene.remove(bot.mesh);
        const idx = robots.indexOf(bot);
        if (idx >= 0) robots.splice(idx, 1);
        // respawn a fresh robot elsewhere after a delay
        setTimeout(() => {
          const spot = randomSidewalkSpot(2);
          const mesh = makeRobotMesh();
          mesh.position.set(spot.x, 0, spot.z);
          scene.add(mesh);
          const freshBot = { mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2, hp: 40 + Math.floor(Math.random() * 40), maxHp: 40, alive: true, wanderTimer: Math.random() * 3, fleeing: false };
          mesh.userData.entityRef = freshBot;
          robots.push(freshBot);
        }, 4000);
      }, 900);
    }
  }

  // ------------------------------------------------------------
  // Shop
  // ------------------------------------------------------------
  const REFILL_COST = 10;

  function renderShop() {
    const list = $('shop-list');
    list.innerHTML = '';
    WEAPONS.forEach((w) => {
      const owned = state.ownedWeapons.includes(w.id);
      const equipped = state.currentWeaponId === w.id;
      const ammoText = w.id === 'fists' ? '' : ` &middot; Ammo ${owned ? (state.ammo[w.id] || 0) : MAX_AMMO}/${MAX_AMMO}`;
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-icon">${w.icon}</div>
        <div class="item-info">
          <div class="item-name">${w.name}</div>
          <div class="item-desc">Damage ${w.damage} &middot; Range ${w.range}m ${w.price ? '&middot; $' + w.price : '&middot; Free'}${ammoText}</div>
        </div>
        <div class="item-action"></div>
      `;
      const actionDiv = row.querySelector('.item-action');
      if (equipped) {
        const btn = document.createElement('button');
        btn.textContent = 'Equipped';
        btn.className = 'equipped';
        btn.disabled = true;
        actionDiv.appendChild(btn);
      } else if (owned) {
        const btn = document.createElement('button');
        btn.textContent = 'Equip';
        btn.className = 'equip';
        btn.addEventListener('click', () => { equipWeapon(w.id); renderShop(); });
        actionDiv.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.textContent = `Buy $${w.price}`;
        btn.className = 'buy';
        btn.disabled = state.money < w.price;
        btn.addEventListener('click', () => {
          if (state.money < w.price) return;
          state.money -= w.price;
          state.ownedWeapons.push(w.id);
          state.currentWeaponId = w.id;
          state.ammo[w.id] = MAX_AMMO;
          updateHUDMoney();
          updateWeaponHUD();
          writeSave();
          toast(`Bought ${w.name}!`);
          renderShop();
        });
        actionDiv.appendChild(btn);
      }
      // Refilling is available any time it's owned and not full, whether
      // or not it's the one currently equipped.
      if (owned && w.id !== 'fists' && (state.ammo[w.id] || 0) < MAX_AMMO) {
        const refillBtn = document.createElement('button');
        refillBtn.textContent = `Refill $${REFILL_COST}`;
        refillBtn.className = 'buy';
        refillBtn.disabled = state.money < REFILL_COST;
        refillBtn.addEventListener('click', () => {
          if (state.money < REFILL_COST) return;
          state.money -= REFILL_COST;
          state.ammo[w.id] = MAX_AMMO;
          updateHUDMoney();
          updateWeaponHUD();
          writeSave();
          toast(`${w.icon} Refilled!`, 1400);
          renderShop();
        });
        actionDiv.appendChild(refillBtn);
      }
      list.appendChild(row);
    });
  }

  function openShop() {
    renderShop();
    updateHUDMoney();
    showOverlay(shopOverlay);
  }

  // ------------------------------------------------------------
  // Weapon wheel (quick select of owned weapons)
  // ------------------------------------------------------------
  function openWeaponWheel() {
    const list = $('weapon-wheel-list');
    list.innerHTML = '';
    WEAPONS.filter((w) => state.ownedWeapons.includes(w.id)).forEach((w) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      const equipped = state.currentWeaponId === w.id;
      row.innerHTML = `
        <div class="item-icon">${w.icon}</div>
        <div class="item-info"><div class="item-name">${w.name}</div><div class="item-desc">Damage ${w.damage}</div></div>
        <div class="item-action"></div>
      `;
      const btn = document.createElement('button');
      btn.textContent = equipped ? 'Equipped' : 'Select';
      btn.className = equipped ? 'equipped' : 'equip';
      btn.disabled = equipped;
      btn.addEventListener('click', () => { equipWeapon(w.id); hideOverlay(weaponWheelOverlay); });
      row.querySelector('.item-action').appendChild(btn);
      list.appendChild(row);
    });
    showOverlay(weaponWheelOverlay);
  }

  // ==============================================================
  // PHONE / MISSIONS
  // ==============================================================
  function renderPhone() {
    const list = $('phone-contacts');
    list.innerHTML = '';
    CONTACTS.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-icon">${c.icon}</div>
        <div class="item-info"><div class="item-name">${c.name}</div><div class="item-desc">${c.line}</div></div>
        <div class="item-action"></div>
      `;
      const btn = document.createElement('button');
      btn.textContent = 'Call';
      btn.className = 'equip';
      btn.disabled = !!state.mission;
      btn.addEventListener('click', () => startMission(c));
      row.querySelector('.item-action').appendChild(btn);
      list.appendChild(row);
    });
  }

  function openPhone() {
    renderPhone();
    $('phone-call-status').classList.add('hidden');
    showOverlay(phoneOverlay);
  }

  function startMission(contact) {
    const reward = contact.reward[0] + Math.floor(Math.random() * (contact.reward[1] - contact.reward[0]));
    const spot = randomOpenSpot(2);
    state.mission = {
      type: contact.mission, contactName: contact.name, reward,
      marker: spot, progress: 0, needed: contact.mission === 'BOUNTY' ? 3 : 1,
    };
    state.waypoint = { x: spot.x, z: spot.z };
    $('waypoint-info').classList.remove('hidden');
    const statusEl = $('phone-call-status');
    statusEl.textContent = `📞 ${contact.name}: "${contact.line}" A waypoint has been marked on your map!`;
    statusEl.classList.remove('hidden');
    updateMissionBanner();
    setTimeout(() => hideOverlay(phoneOverlay), 1400);
    toast(`New mission from ${contact.name}!`);
  }

  function updateMissionBanner() {
    const banner = $('mission-banner');
    const textEl = $('mission-text');
    if (!state.mission) { banner.classList.add('hidden'); return; }
    const m = state.mission;
    let label;
    if (m.type === 'DELIVERY') label = `🍕 Delivery: drive to the marker — reward $${m.reward}`;
    else if (m.type === 'RACE') label = `🏁 Race: reach the checkpoint — reward $${m.reward}`;
    else label = `🤖 Bounty: bust ${m.needed - m.progress} more robot(s) — reward $${m.reward}`;
    textEl.textContent = label;
    banner.classList.remove('hidden');
  }

  function updateMissionProgressOnBust() {
    if (state.mission && state.mission.type === 'BOUNTY') {
      state.mission.progress += 1;
      if (state.mission.progress >= state.mission.needed) completeMission();
      else updateMissionBanner();
    }
  }

  function completeMission() {
    if (!state.mission) return;
    state.money += state.mission.reward;
    toast(`✅ Mission complete! +$${state.mission.reward}`, 3000);
    state.mission = null;
    state.waypoint = null;
    $('waypoint-info').classList.add('hidden');
    updateHUDMoney();
    updateMissionBanner();
    writeSave();
  }

  function checkMissionArrival() {
    if (!state.mission || !state.waypoint) return;
    if (state.mission.type === 'BOUNTY') return; // handled on bust
    const dx = state.waypoint.x - player.x, dz = state.waypoint.z - player.z;
    if (Math.hypot(dx, dz) < 4) completeMission();
  }

  // ==============================================================
  // MAP
  // ==============================================================
  const mapCanvas = $('map-canvas');
  const mapCtx = mapCanvas.getContext('2d');

  function openMap() {
    // Re-center on the player and reset zoom every time the map is opened,
    // so it always starts showing where you actually are.
    mapCenterX = player.x;
    mapCenterZ = player.z;
    mapZoom = 1;
    drawMap();
    showOverlay(mapOverlay);
  }

  // Wider than the city grid alone so the military base (out past the
  // east edge) still shows up on the full map instead of being clipped off.
  const MAP_HALF = WORLD_HALF + 220;
  const MAP_ZOOM_MIN = 1, MAP_ZOOM_MAX = 5;
  let mapZoom = 1;
  let mapCenterX = 0, mapCenterZ = 0;

  function setMapZoom(z) {
    mapZoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, z));
    drawMap();
  }

  // The visible half-extent shrinks as you zoom in, and the view is
  // centered on mapCenterX/Z (which panning drags around) instead of
  // always being the whole world — this is what lets you zoom in on
  // whatever part of the map you actually want to see.
  function worldToMapPx(x, z, size) {
    const half = MAP_HALF / mapZoom;
    return {
      px: ((x - mapCenterX + half) / (half * 2)) * size,
      py: ((z - mapCenterZ + half) / (half * 2)) * size,
    };
  }

  function mapPxToWorld(px, py, size) {
    const half = MAP_HALF / mapZoom;
    return {
      x: (px / size) * (half * 2) - half + mapCenterX,
      z: (py / size) * (half * 2) - half + mapCenterZ,
    };
  }

  function drawMap() {
    const size = mapCanvas.width;
    mapCtx.clearRect(0, 0, size, size);
    mapCtx.fillStyle = '#0f1a2e';
    mapCtx.fillRect(0, 0, size, size);

    // roads
    mapCtx.strokeStyle = '#334155';
    mapCtx.lineWidth = 3;
    for (let i = 0; i <= CITY_BLOCKS; i++) {
      const z = -WORLD_HALF + i * BLOCK_SIZE;
      const p = worldToMapPx(0, z, size);
      mapCtx.beginPath(); mapCtx.moveTo(0, p.py); mapCtx.lineTo(size, p.py); mapCtx.stroke();
      const p2 = worldToMapPx(z, 0, size);
      mapCtx.beginPath(); mapCtx.moveTo(p2.px, 0); mapCtx.lineTo(p2.px, size); mapCtx.stroke();
    }

    // buildings
    mapCtx.fillStyle = '#475569';
    buildingBoxes.forEach((b) => {
      const p1 = worldToMapPx(b.minX, b.minZ, size);
      const p2 = worldToMapPx(b.maxX, b.maxZ, size);
      mapCtx.fillRect(p1.px, p1.py, p2.px - p1.px, p2.py - p1.py);
    });

    // shop
    if (shopMarkerPos) {
      const p = worldToMapPx(shopMarkerPos.x, shopMarkerPos.z, size);
      mapCtx.font = '20px sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.fillText('💦', p.px, p.py + 6);
    }

    // banks
    mapCtx.font = '20px sans-serif';
    mapCtx.textAlign = 'center';
    banks.forEach((bank) => {
      const p = worldToMapPx(bank.x, bank.z, size);
      mapCtx.fillText('🏦', p.px, p.py + 6);
    });

    // pizza places
    pizzaPlaces.forEach((place) => {
      const p = worldToMapPx(place.x, place.z, size);
      mapCtx.fillText('🍕', p.px, p.py + 6);
    });

    // military base
    if (militaryBaseCenter) {
      const p = worldToMapPx(militaryBaseCenter.x, militaryBaseCenter.z, size);
      mapCtx.fillText('🪖', p.px, p.py + 6);
    }

    // apartments
    apartments.forEach((apt) => {
      const p = worldToMapPx(apt.x, apt.z, size);
      mapCtx.fillText(apt.owned ? '🏠' : '🔒', p.px, p.py + 6);
    });

    if (beachCenter) {
      const p = worldToMapPx(beachCenter.x, beachCenter.z, size);
      mapCtx.fillText('🏖️', p.px, p.py + 6);
    }
    if (carnivalCenter) {
      const p = worldToMapPx(carnivalCenter.x, carnivalCenter.z, size);
      mapCtx.fillText('🎡', p.px, p.py + 6);
    }

    // robots
    mapCtx.fillStyle = '#ef4444';
    robots.forEach((r) => {
      if (!r.alive) return;
      const p = worldToMapPx(r.x, r.z, size);
      mapCtx.beginPath(); mapCtx.arc(p.px, p.py, 3, 0, Math.PI * 2); mapCtx.fill();
    });

    // coins
    mapCtx.fillStyle = '#facc15';
    coins.forEach((c) => {
      if (!c.active) return;
      const p = worldToMapPx(c.x, c.z, size);
      mapCtx.beginPath(); mapCtx.arc(p.px, p.py, 2, 0, Math.PI * 2); mapCtx.fill();
    });

    // waypoint + route line
    if (state.waypoint) {
      const from = worldToMapPx(player.x, player.z, size);
      const to = worldToMapPx(state.waypoint.x, state.waypoint.z, size);
      mapCtx.strokeStyle = '#22d3ee';
      mapCtx.lineWidth = 2;
      mapCtx.setLineDash([6, 5]);
      mapCtx.beginPath(); mapCtx.moveTo(from.px, from.py); mapCtx.lineTo(to.px, to.py); mapCtx.stroke();
      mapCtx.setLineDash([]);
      mapCtx.font = '18px sans-serif';
      mapCtx.fillText('📍', to.px, to.py + 6);
    }

    // player — built directly from the same (sin,cos) forward vector used
    // for real movement (see updatePlayerWalking) rather than ctx.rotate(),
    // whose CCW-positive convention reads as backwards once mapped through
    // canvas's flipped Y axis; matching the vector avoids that mismatch.
    const pp = worldToMapPx(player.x, player.z, size);
    const fwdX = Math.sin(player.heading), fwdY = Math.cos(player.heading);
    const rightX = fwdY, rightY = -fwdX;
    mapCtx.fillStyle = '#22d3ee';
    mapCtx.beginPath();
    mapCtx.moveTo(pp.px + fwdX * 8, pp.py + fwdY * 8);
    mapCtx.lineTo(pp.px - fwdX * 6 + rightX * 6, pp.py - fwdY * 6 + rightY * 6);
    mapCtx.lineTo(pp.px - fwdX * 6 - rightX * 6, pp.py - fwdY * 6 - rightY * 6);
    mapCtx.closePath(); mapCtx.fill();
  }

  // Drag to pan around (so you can zoom in on whatever part of the map you
  // want to look at), plain tap to drop a waypoint there, and a quick
  // second tap (a real double-tap, not just a drag) clears it again.
  let mapPointerDown = null;
  let mapPanStart = null;
  let mapLastTapTime = 0;
  let mapLastTapScreen = null;

  mapCanvas.addEventListener('pointerdown', (e) => {
    mapPointerDown = { x: e.clientX, y: e.clientY, moved: false };
    mapPanStart = { x: mapCenterX, z: mapCenterZ };
  });

  mapCanvas.addEventListener('pointermove', (e) => {
    if (!mapPointerDown) return;
    const dx = e.clientX - mapPointerDown.x, dy = e.clientY - mapPointerDown.y;
    if (!mapPointerDown.moved && Math.hypot(dx, dy) > 6) mapPointerDown.moved = true;
    if (mapPointerDown.moved) {
      const rect = mapCanvas.getBoundingClientRect();
      const worldPerPx = (MAP_HALF / mapZoom * 2) / rect.width;
      mapCenterX = mapPanStart.x - dx * worldPerPx;
      mapCenterZ = mapPanStart.z - dy * worldPerPx;
      drawMap();
    }
  });

  function mapPointerUp(e) {
    if (!mapPointerDown) return;
    if (!mapPointerDown.moved) {
      const rect = mapCanvas.getBoundingClientRect();
      const scale = mapCanvas.width / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;
      const w = mapPxToWorld(px, py, mapCanvas.width);
      const now = performance.now();
      const screenDist = mapLastTapScreen ? Math.hypot(e.clientX - mapLastTapScreen.x, e.clientY - mapLastTapScreen.y) : Infinity;
      if (now - mapLastTapTime < 550 && screenDist < 40) {
        state.waypoint = null;
        $('waypoint-info').classList.add('hidden');
        toast('📍 Waypoint cleared');
        mapLastTapTime = 0;
      } else {
        state.waypoint = { x: w.x, z: w.z };
        $('waypoint-info').classList.remove('hidden');
        toast('📍 Waypoint set!');
        mapLastTapTime = now;
        mapLastTapScreen = { x: e.clientX, y: e.clientY };
      }
      drawMap();
    }
    mapPointerDown = null;
  }
  mapCanvas.addEventListener('pointerup', mapPointerUp);
  mapCanvas.addEventListener('pointercancel', () => { mapPointerDown = null; });

  // ------------------------------------------------------------
  // Minimap (always-on radar, top-left HUD)
  // ------------------------------------------------------------
  const miniCanvas = $('minimap');
  const miniCtx = miniCanvas.getContext('2d');
  const MINI_RANGE = 60; // world units visible radius

  function drawMinimap() {
    const size = miniCanvas.width;
    const center = size / 2;
    miniCtx.clearRect(0, 0, size, size);
    miniCtx.save();
    miniCtx.beginPath();
    miniCtx.arc(center, center, center, 0, Math.PI * 2);
    miniCtx.clip();
    miniCtx.fillStyle = '#0f1a2e';
    miniCtx.fillRect(0, 0, size, size);

    function toMini(x, z) {
      const dx = x - player.x, dz = z - player.z;
      return { px: center + (dx / MINI_RANGE) * center, py: center + (dz / MINI_RANGE) * center };
    }

    miniCtx.strokeStyle = '#334155';
    miniCtx.lineWidth = 2;
    for (let i = 0; i <= CITY_BLOCKS; i++) {
      const z = -WORLD_HALF + i * BLOCK_SIZE;
      let p1 = toMini(-WORLD_HALF, z), p2 = toMini(WORLD_HALF, z);
      miniCtx.beginPath(); miniCtx.moveTo(p1.px, p1.py); miniCtx.lineTo(p2.px, p2.py); miniCtx.stroke();
      p1 = toMini(z, -WORLD_HALF); p2 = toMini(z, WORLD_HALF);
      miniCtx.beginPath(); miniCtx.moveTo(p1.px, p1.py); miniCtx.lineTo(p2.px, p2.py); miniCtx.stroke();
    }

    miniCtx.fillStyle = '#475569';
    buildingBoxes.forEach((b) => {
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (Math.hypot(cx - player.x, cz - player.z) > MINI_RANGE * 1.2) return;
      const p = toMini(cx, cz);
      miniCtx.fillRect(p.px - 3, p.py - 3, 6, 6);
    });

    miniCtx.fillStyle = '#ef4444';
    robots.forEach((r) => {
      if (!r.alive) return;
      if (Math.hypot(r.x - player.x, r.z - player.z) > MINI_RANGE) return;
      const p = toMini(r.x, r.z);
      miniCtx.beginPath(); miniCtx.arc(p.px, p.py, 3, 0, Math.PI * 2); miniCtx.fill();
    });

    vehicles.forEach((v) => {
      if (state.inVehicle === v) return;
      if (Math.hypot(v.x - player.x, v.z - player.z) > MINI_RANGE) return;
      const p = toMini(v.x, v.z);
      miniCtx.fillStyle = v.occupied ? '#fbbf24' : '#94a3b8';
      miniCtx.fillRect(p.px - 2, p.py - 2, 4, 4);
    });

    if (state.waypoint) {
      const p = toMini(state.waypoint.x, state.waypoint.z);
      miniCtx.fillStyle = '#22d3ee';
      miniCtx.beginPath(); miniCtx.arc(p.px, p.py, 4, 0, Math.PI * 2); miniCtx.fill();
      miniCtx.strokeStyle = 'rgba(34,211,238,0.6)';
      miniCtx.lineWidth = 2;
      miniCtx.beginPath(); miniCtx.moveTo(center, center); miniCtx.lineTo(p.px, p.py); miniCtx.stroke();
    }

    if (shopMarkerPos && Math.hypot(shopMarkerPos.x - player.x, shopMarkerPos.z - player.z) < MINI_RANGE) {
      const p = toMini(shopMarkerPos.x, shopMarkerPos.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('💦', p.px, p.py + 4);
    }
    banks.forEach((bank) => {
      if (Math.hypot(bank.x - player.x, bank.z - player.z) > MINI_RANGE) return;
      const p = toMini(bank.x, bank.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('🏦', p.px, p.py + 4);
    });
    pizzaPlaces.forEach((place) => {
      if (Math.hypot(place.x - player.x, place.z - player.z) > MINI_RANGE) return;
      const p = toMini(place.x, place.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('🍕', p.px, p.py + 4);
    });
    if (militaryBaseCenter && Math.hypot(militaryBaseCenter.x - player.x, militaryBaseCenter.z - player.z) < MINI_RANGE) {
      const p = toMini(militaryBaseCenter.x, militaryBaseCenter.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('🪖', p.px, p.py + 4);
    }
    apartments.forEach((apt) => {
      if (Math.hypot(apt.x - player.x, apt.z - player.z) > MINI_RANGE) return;
      const p = toMini(apt.x, apt.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText(apt.owned ? '🏠' : '🔒', p.px, p.py + 4);
    });
    if (beachCenter && Math.hypot(beachCenter.x - player.x, beachCenter.z - player.z) < MINI_RANGE) {
      const p = toMini(beachCenter.x, beachCenter.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('🏖️', p.px, p.py + 4);
    }
    if (carnivalCenter && Math.hypot(carnivalCenter.x - player.x, carnivalCenter.z - player.z) < MINI_RANGE) {
      const p = toMini(carnivalCenter.x, carnivalCenter.z);
      miniCtx.font = '13px sans-serif';
      miniCtx.textAlign = 'center';
      miniCtx.fillText('🎡', p.px, p.py + 4);
    }

    // player arrow (always centered, points with heading) — same direct
    // forward-vector construction as drawMap(), see the comment there.
    {
      const fwdX = Math.sin(player.heading), fwdY = Math.cos(player.heading);
      const rightX = fwdY, rightY = -fwdX;
      miniCtx.fillStyle = '#facc15';
      miniCtx.beginPath();
      miniCtx.moveTo(center + fwdX * 7, center + fwdY * 7);
      miniCtx.lineTo(center - fwdX * 6 + rightX * 5, center - fwdY * 6 + rightY * 5);
      miniCtx.lineTo(center - fwdX * 6 - rightX * 5, center - fwdY * 6 - rightY * 5);
      miniCtx.closePath(); miniCtx.fill();
    }

    miniCtx.restore();
    miniCtx.strokeStyle = '#22d3ee';
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.arc(center, center, center - 1, 0, Math.PI * 2);
    miniCtx.stroke();
  }

  function updateCompassAndWaypointInfo() {
    const compass = $('compass-arrow');
    const info = $('waypoint-info');
    if (!state.waypoint) { compass.style.opacity = '0'; return; }
    compass.style.opacity = '1';
    const dx = state.waypoint.x - player.x, dz = state.waypoint.z - player.z;
    const angle = Math.atan2(dx, dz) - player.heading;
    // The ➤ glyph points right at rotate(0); CSS rotate() is also
    // clockwise-positive in a way that mismatches our world-heading
    // convention (same root cause as the map-arrow fix above), so the
    // sign is flipped and a -90deg baseline is added to make "target
    // straight ahead" point the glyph up instead of right.
    compass.style.transform = `translate(-50%, -50%) rotate(${-angle - Math.PI / 2}rad)`;
    const dist = Math.round(Math.hypot(dx, dz));
    $('waypoint-distance').textContent = dist;
    info.classList.remove('hidden');
  }

  // ==============================================================
  // VEHICLE ENTER/EXIT + PROXIMITY PROMPTS
  // ==============================================================
  function tryEnterExitVehicle() {
    if (state.inVehicle) {
      // exit
      const v = state.inVehicle;
      const wasMoving = Math.abs(v.speed) > 2;
      player.x = v.x + Math.sin(v.heading + Math.PI / 2) * 2.4;
      player.z = v.z + Math.cos(v.heading + Math.PI / 2) * 2.4;
      player.heading = v.heading;
      playerMesh.visible = true;
      state.inVehicle = null;
      if (wasMoving) {
        // Bailing out while it's still rolling costs health, and the car
        // doesn't just stop dead — it keeps going on its own (picked up by
        // the normal NPC traffic AI) until it hits a building.
        damagePlayer(10);
        v.occupied = true;
        v.decidedAtIntersection = false;
        toast('🚪💥 You jumped out while it was moving! -10 health', 2200);
      } else {
        toast('🚪 You got out of the car.');
      }
    } else if (state.nearVehicle) {
      const v = state.nearVehicle;
      if (v.occupied) {
        v.occupied = false;
        v.speed = 0;
        spawnFleeingBystander(v.x, v.z, v.heading);
        toast('🚗 You hopped in — the driver ran off!', 2200);
      } else {
        toast('🚗 Vroom! GPS route active — check your minimap.', 2200);
      }
      state.inVehicle = v;
      playerMesh.visible = false;
    }
  }

  function updateProximity() {
    // nearest vehicle
    let nearest = null, nearestDist = 3.4;
    for (const v of vehicles) {
      const d = Math.hypot(v.x - player.x, v.z - player.z);
      if (d < nearestDist) { nearest = v; nearestDist = d; }
    }
    state.nearVehicle = state.inVehicle ? null : nearest;

    // near shop?
    let nearShop = false;
    if (shopMarkerPos) {
      nearShop = Math.hypot(shopMarkerPos.x - player.x, shopMarkerPos.z - player.z) < 10 && !state.inVehicle;
    }
    state.nearShop = nearShop;

    // nearest bank
    let nearBank = null, nearBankDist = 10;
    if (!state.inVehicle) {
      for (const bank of banks) {
        const d = Math.hypot(bank.x - player.x, bank.z - player.z);
        if (d < nearBankDist) { nearBank = bank; nearBankDist = d; }
      }
    }
    state.nearBank = nearBank;

    // nearest pizza place
    let nearPizza = null, nearPizzaDist = 10;
    if (!state.inVehicle) {
      for (const p of pizzaPlaces) {
        const d = Math.hypot(p.x - player.x, p.z - player.z);
        if (d < nearPizzaDist) { nearPizza = p; nearPizzaDist = d; }
      }
    }
    state.nearPizza = nearPizza;

    // military base recruiter kiosk
    let nearRecruiter = false;
    if (!state.inVehicle && militaryBaseCenter && militaryBaseCenter.recruiter) {
      const r = militaryBaseCenter.recruiter;
      nearRecruiter = Math.hypot(r.x - player.x, r.z - player.z) < 8;
    }
    state.nearRecruiter = nearRecruiter;

    // nearest apartment
    let nearApartment = null, nearApartmentDist = 9;
    if (!state.inVehicle) {
      for (const apt of apartments) {
        const d = Math.hypot(apt.x - player.x, apt.z - player.z);
        if (d < nearApartmentDist) { nearApartment = apt; nearApartmentDist = d; }
      }
    }
    state.nearApartment = nearApartment;

    // nearest food stall
    let nearFoodStall = null, nearFoodStallDist = 6;
    if (!state.inVehicle) {
      for (const stall of foodStalls) {
        const d = Math.hypot(stall.x - player.x, stall.z - player.z);
        if (d < nearFoodStallDist) { nearFoodStall = stall; nearFoodStallDist = d; }
      }
    }
    state.nearFoodStall = nearFoodStall;

    const promptEl = $('prompt-banner');
    if (state.inVehicle) {
      promptEl.textContent = 'Press 🚪 or E to exit the car';
      promptEl.classList.remove('hidden');
      promptEl.onclick = null;
    } else if (state.nearVehicle) {
      promptEl.textContent = state.nearVehicle.occupied
        ? 'Press 🚪 or E to take this car (driver will run off)'
        : 'Press 🚪 or E to enter the car';
      promptEl.classList.remove('hidden');
      promptEl.onclick = null;
    } else if (state.nearShop) {
      promptEl.textContent = 'Tap here to open the Blaster Shop 💦';
      promptEl.classList.remove('hidden');
      promptEl.onclick = openShop;
    } else if (state.nearBank) {
      const locked = performance.now() / 1000 < state.nearBank.cooldownUntil;
      promptEl.textContent = locked ? '🏦 Vault is locked — check back soon' : 'Tap here to crack the bank vault 🏦';
      promptEl.classList.remove('hidden');
      promptEl.onclick = () => robBank(state.nearBank);
    } else if (state.nearPizza) {
      const locked = performance.now() / 1000 < state.nearPizza.cooldownUntil;
      promptEl.textContent = locked ? '🍕 The oven is still going — check back soon' : 'Tap here to grab a cheese pizza 🍕';
      promptEl.classList.remove('hidden');
      promptEl.onclick = () => grabPizza(state.nearPizza);
    } else if (state.nearRecruiter) {
      promptEl.textContent = state.hasBaseAccess
        ? '🪖 You already work here — the gate is open for you'
        : 'Tap here to get a Military Base job ($1000) 🪖';
      promptEl.classList.remove('hidden');
      promptEl.onclick = state.hasBaseAccess ? null : getMilitaryJob;
    } else if (state.nearApartment) {
      const apt = state.nearApartment;
      if (apt.owned) {
        const locked = performance.now() / 1000 < (apt.restCooldownUntil || 0);
        promptEl.textContent = locked ? '🏠 Just rested — check back soon' : 'Tap here to go rest in your apartment 🏠';
        promptEl.classList.remove('hidden');
        promptEl.onclick = () => restAtApartment(apt);
      } else {
        promptEl.textContent = `Tap here to buy this apartment ($${apt.price}) 🏠`;
        promptEl.classList.remove('hidden');
        promptEl.onclick = () => buyApartment(apt);
      }
    } else if (state.nearFoodStall) {
      const stall = state.nearFoodStall;
      const info = FOOD_KINDS[stall.kind];
      const locked = performance.now() / 1000 < stall.cooldownUntil;
      promptEl.textContent = locked ? `${info.emoji} Still cooking — check back soon` : `Tap here to buy a ${info.name.toLowerCase()} ($${info.price}) ${info.emoji}`;
      promptEl.classList.remove('hidden');
      promptEl.onclick = () => buyFood(stall);
    } else {
      promptEl.classList.add('hidden');
      promptEl.onclick = null;
    }
  }

  function getMilitaryJob() {
    if (state.hasBaseAccess) return;
    const cost = 1000;
    if (state.money < cost) { toast(`🪖 You need $${cost} for this job.`); return; }
    state.money -= cost;
    state.hasBaseAccess = true;
    updateHUDMoney();
    writeSave();
    toast('🪖 You got the job! The gate will let you through now.', 3000);
  }

  function blockedByMilitaryGate(x, z) {
    if (state.hasBaseAccess || !militaryGateBox) return false;
    const g = militaryGateBox;
    return x > g.minX && x < g.maxX && z > g.minZ && z < g.maxZ;
  }

  function buyApartment(apt) {
    if (apt.owned) return;
    if (state.money < apt.price) { toast(`🏠 You need $${apt.price} to buy this apartment.`); return; }
    state.money -= apt.price;
    apt.owned = true;
    updateHUDMoney();
    writeSave();
    toast('🏠 You bought the apartment! Come back anytime to rest.', 3000);
  }

  function restAtApartment(apt) {
    if (!apt.owned) { toast(`🏠 You need to buy this apartment first ($${apt.price}).`); return; }
    const now = performance.now() / 1000;
    if (now < (apt.restCooldownUntil || 0)) {
      toast("🏠 You're not tired yet. Try again in a bit.");
      return;
    }
    apt.restCooldownUntil = now + 30;
    healPlayer(100);
    toast('🏠 You rested up — health fully restored!', 2000);
  }

  function grabPizza(place) {
    const now = performance.now() / 1000;
    if (now < place.cooldownUntil) {
      toast('🍕 The oven is still going. Try again later!');
      return;
    }
    const reward = 20 + Math.floor(Math.random() * 30);
    place.cooldownUntil = now + 20;
    state.money += reward;
    updateHUDMoney();
    writeSave();
    toast(`🍕 Grabbed a cheese pizza! +$${reward}`, 2400);
  }

  function robBank(bank) {
    const now = performance.now() / 1000;
    if (now < bank.cooldownUntil) {
      toast('🏦 The vault is still locked. Try again later!');
      return;
    }
    const reward = 400 + Math.floor(Math.random() * 300);
    bank.cooldownUntil = now + 60;
    state.money += reward;
    updateHUDMoney();
    writeSave();
    toast(`🏦 Vault cracked! +$${reward}`, 3000);
  }

  // ==============================================================
  // UPDATE LOOP
  // ==============================================================
  const GRAVITY = 28;
  const JUMP1_VELOCITY = 11;
  const JUMP2_VELOCITY = 22; // double jump goes much higher — enough to clear shorter rooftops

  function updatePlayerWalking(dt) {
    const kb = keyboardMove();
    let mx = input.moveX + kb.mx;
    let my = input.moveY + kb.my;
    const mag = Math.hypot(mx, my);
    player.walking = mag > 0.05;

    if (player.walking) {
      // Movement is relative to where the camera is currently looking, so
      // pushing "forward" always walks into the screen, and — crucially —
      // pushing left/right turns toward the screen's actual left/right (mx
      // is negated here to match the camera's true world-space right
      // vector; without it, left/right come out mirrored).
      const inputAngle = Math.atan2(-mx, -my);
      player.heading = cameraYaw + Math.PI + inputAngle;
      const speed = 6.2;
      const step = speed * dt * Math.min(mag, 1);
      const nx = player.x + Math.sin(player.heading) * step;
      const nz = player.z + Math.cos(player.heading) * step;
      // Height-aware: a building only blocks you below its roof line, so
      // once a jump has carried you up onto one you can walk across it.
      if (!collidesWithBuildingsAtHeight(nx, player.z, 0.6, player.y) && !blockedByMilitaryGate(nx, player.z)) player.x = nx;
      if (!collidesWithBuildingsAtHeight(player.x, nz, 0.6, player.y) && !blockedByMilitaryGate(player.x, nz)) player.z = nz;
      player.bobPhase += dt * 10;

      // Every ~10 steps (10 units walked) regain a little health.
      player.distanceWalked = (player.distanceWalked || 0) + step;
      while (player.distanceWalked - (player.lastHealAt || 0) >= 10) {
        player.lastHealAt = (player.lastHealAt || 0) + 10;
        healPlayer(5);
      }
    }

    // Jump / gravity — a tap starts the first jump, a second tap while
    // airborne is a much higher double jump, high enough to reach onto
    // shorter rooftops (see getFloorHeightAt / collidesWithBuildingsAtHeight).
    const wasGrounded = player.grounded;
    if (player.jumpRequest) {
      player.jumpRequest = false;
      if (player.jumpsUsed < 2) {
        player.vy = player.jumpsUsed === 0 ? JUMP1_VELOCITY : JUMP2_VELOCITY;
        player.jumpsUsed += 1;
        player.grounded = false;
      }
    }
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    const floorY = Math.max(getFloorHeightAt(player.x, player.z), getMountainHeightAt(player.x, player.z));
    if (player.y <= floorY) {
      player.y = floorY;
      player.vy = 0;
      player.grounded = true;
      player.jumpsUsed = 0;
    } else {
      player.grounded = false;
    }

    // Fall damage: only for a real drop (e.g. walking off a rooftop edge),
    // not for jumping and landing back at the same height — fallFromY is
    // set the moment you leave solid ground, so a jump's up-then-down to
    // the same spot nets to ~0 fall distance and never costs health.
    if (wasGrounded && !player.grounded) {
      player.fallFromY = player.y;
    } else if (!wasGrounded && player.grounded) {
      if ((player.fallFromY || 0) - player.y > 3) damagePlayer(5);
    }

    const clampR = worldClampR();
    player.x = Math.max(-clampR, Math.min(clampR, player.x));
    player.z = Math.max(-clampR, Math.min(clampR, player.z));

    const bob = (player.walking && player.grounded) ? Math.abs(Math.sin(player.bobPhase)) * 0.06 : 0;
    playerMesh.position.set(player.x, player.y + bob, player.z);
    playerMesh.rotation.y = player.heading;
    const armSwing = player.walking ? Math.sin(player.bobPhase) * 0.6 : 0;
    if (playerMesh.userData.armL) playerMesh.userData.armL.rotation.x = armSwing;
    if (playerMesh.userData.armR) playerMesh.userData.armR.rotation.x = -armSwing;
    if (playerMesh.userData.legL) playerMesh.userData.legL.rotation.x = -armSwing;
    if (playerMesh.userData.legR) playerMesh.userData.legR.rotation.x = armSwing;
  }

  function healPlayer(amount) {
    if (state.health >= 100) return;
    state.health = Math.min(100, state.health + amount);
    updateHealthUI();
  }

  function damagePlayer(amount) {
    state.health = Math.max(0, state.health - amount);
    updateHealthUI();
  }

  function updateHealthUI() {
    $('health-fill').style.width = Math.max(0, state.health) + '%';
  }

  function updateVehicle(dt) {
    const v = state.inVehicle;
    const kb = keyboardMove();
    let throttle = -(input.moveY) - kb.my; // forward is negative Y
    // Negated for the same reason as the walking fix: increasing heading
    // turns the car toward world +X, which is screen-LEFT (verified via
    // the camera's actual right vector), so un-negated input.moveX/kb.mx
    // steered backwards — pressing right turned left and vice versa.
    let steer = -(input.moveX + kb.mx);

    // Tanks are slower and heavier-feeling; jets are quick on the ground
    // (no actual flight — see the chat for why that's out of scope).
    const maxSpeed = v.type === 'tank' ? 10 : v.type === 'jet' ? 24 : v.type === 'jetski' ? 20 : 18;
    const accel = v.type === 'tank' ? 8 : v.type === 'jet' ? 16 : v.type === 'jetski' ? 15 : 14;
    if (Math.abs(throttle) > 0.05) {
      v.speed += throttle * accel * dt;
    } else {
      v.speed -= Math.sign(v.speed) * accel * 0.6 * dt;
      if (Math.abs(v.speed) < 0.2) v.speed = 0;
    }
    v.speed = Math.max(-maxSpeed * 0.5, Math.min(maxSpeed, v.speed));

    if (Math.abs(v.speed) > 0.1) {
      const steerFactor = (v.speed > 0 ? 1 : -1) * Math.min(Math.abs(v.speed) / maxSpeed, 1);
      v.heading += steer * 1.8 * dt * steerFactor;
    }

    const preCrashSpeed = v.speed;
    const nx = v.x + Math.sin(v.heading) * v.speed * dt;
    const nz = v.z + Math.cos(v.heading) * v.speed * dt;
    // Jet skis are water-only — treat the shoreline like a wall so they
    // can't be driven up onto the sand or back into the city.
    const onLand = (x, z) => v.type === 'jetski' && z < oceanStartZ;
    let hitWall = false;
    if (!collidesWithBuildings(nx, v.z, 1.4) && !blockedByMilitaryGate(nx, v.z) && !onLand(nx, v.z)) v.x = nx; else { v.speed *= 0.15; hitWall = true; }
    if (!collidesWithBuildings(v.x, nz, 1.4) && !blockedByMilitaryGate(v.x, nz) && !onLand(v.x, nz)) v.z = nz; else { v.speed *= 0.15; hitWall = true; }
    if (hitWall && Math.abs(preCrashSpeed) > 6) triggerCrashFx(Math.abs(preCrashSpeed), v);

    // Cars used to just drive straight through each other — bump into one
    // now and it stops you like any other obstacle (plus the same crash FX).
    for (const other of vehicles) {
      if (other === v) continue;
      const dx = v.x - other.x, dz = v.z - other.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 2.6;
      if (dist > 0.001 && dist < minDist) {
        const push = minDist - dist;
        v.x += (dx / dist) * push;
        v.z += (dz / dist) * push;
        if (Math.abs(preCrashSpeed) > 5) triggerCrashFx(Math.abs(preCrashSpeed), v);
        v.speed *= 0.15;
      }
    }

    const clampR = worldClampR();
    v.x = Math.max(-clampR, Math.min(clampR, v.x));
    v.z = Math.max(-clampR, Math.min(clampR, v.z));

    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;

    player.x = v.x; player.z = v.z; player.heading = v.heading;

    updateVehicleSmoke(v, dt);

    checkVehicleCollisions(v);
  }

  // Hitting a robot with the car takes it down just like a blaster hit
  // (same reward/respawn flow) — a fun vehicular takedown of the
  // mechanical enemies. Hitting a pedestrian only startles them (same
  // non-lethal flee reaction as a blaster splash) — no damage, no death.
  function checkVehicleCollisions(v) {
    if (Math.abs(v.speed) < 2) return;
    for (const bot of robots) {
      if (!bot.alive) continue;
      if (Math.hypot(bot.x - v.x, bot.z - v.z) < 1.8) applyDamageToRobot(bot, 999);
    }
    for (const ped of pedestrians) {
      if (Math.hypot(ped.x - v.x, ped.z - v.z) < 1.6) bumpPedestrian(ped);
    }
  }

  function bumpPedestrian(ped) {
    if (!ped.fleeing) toast('🚗 Beep! They jumped out of the way.', 1400);
    ped.fleeing = true;
  }

  // NPC-driven traffic follows the road grid: drive straight until an
  // intersection, then randomly go straight/turn (always snapped to the
  // grid's axis-aligned directions) — unlike the player, these cars never
  // leave the street for the grass or sidewalks.
  function updateOtherVehicles(dt) {
    const halfRoad = ROAD_WIDTH / 2;
    vehicles.forEach((v) => {
      if (v === state.inVehicle || !v.occupied) return;

      const atIntersection = distToNearestRoadLine(v.x) < halfRoad && distToNearestRoadLine(v.z) < halfRoad;
      if (atIntersection) {
        if (!v.decidedAtIntersection) {
          v.decidedAtIntersection = true;
          const choice = Math.random();
          if (choice < 0.775) v.heading += choice < 0.55 ? 0 : Math.PI / 2;
          else v.heading -= Math.PI / 2;
          v.heading = Math.round(v.heading / (Math.PI / 2)) * (Math.PI / 2); // snap to the grid
        }
      } else {
        v.decidedAtIntersection = false;
      }

      const speed = 5;
      const nx = v.x + Math.sin(v.heading) * speed * dt;
      const nz = v.z + Math.cos(v.heading) * speed * dt;
      // isOnRoad() checks alignment with the road grid using a periodic
      // (modulo) pattern with no edge — without an explicit bounds check
      // here, a car driving straight off the outermost boundary road reads
      // as "still on a road" forever and keeps going, right off the city
      // and onto the beach.
      const inCityBounds = Math.abs(nx) <= WORLD_HALF + ROAD_WIDTH / 2 + 1 && Math.abs(nz) <= WORLD_HALF + ROAD_WIDTH / 2 + 1;
      if (!collidesWithBuildings(nx, nz, 1.4) && isOnRoad(nx, nz, 0.5) && inCityBounds) {
        v.x = nx; v.z = nz;
      } else {
        // Shouldn't normally happen given the grid-snapped turns above, but
        // as a safety net (e.g. right after spawn) just try a new heading
        // rather than drifting onto the grass.
        v.heading += Math.PI / 2;
      }
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
    });
  }

  function updateRobots(dt) {
    robots.forEach((bot) => {
      if (!bot.alive) return;
      if (bot.fleeing) {
        const dx = bot.x - player.x, dz = bot.z - player.z;
        const dist = Math.hypot(dx, dz) || 1;
        const speed = 4.5;
        const nx = bot.x + (dx / dist) * speed * dt;
        const nz = bot.z + (dz / dist) * speed * dt;
        if (!collidesWithBuildings(nx, nz, 1)) { bot.x = nx; bot.z = nz; }
        bot.heading = Math.atan2(dx, dz);
        if (dist > 20) bot.fleeing = false;
      } else {
        bot.wanderTimer -= dt;
        if (bot.wanderTimer <= 0) {
          bot.wanderTimer = 2 + Math.random() * 3;
          bot.heading += (Math.random() - 0.5) * 2;
        }
        const speed = 1.4;
        const nx = bot.x + Math.sin(bot.heading) * speed * dt;
        const nz = bot.z + Math.cos(bot.heading) * speed * dt;
        if (!collidesWithBuildings(nx, nz, 1) && !isOnRoad(nx, nz)) { bot.x = nx; bot.z = nz; }
        else bot.heading += Math.PI * 0.5;
      }
      bot.mesh.position.set(bot.x, 0, bot.z);
      bot.mesh.rotation.y = bot.heading;
      if (bot.mesh.userData.eye) {
        bot.mesh.userData.eye.material.emissiveIntensity = 0.5 + Math.sin(performance.now() / 120 + bot.x) * 0.5;
      }
    });
  }

  function updatePedestrians(dt) {
    pedestrians.forEach((p) => {
      if (p.fleeing) {
        const dx = p.x - player.x, dz = p.z - player.z;
        const dist = Math.hypot(dx, dz) || 1;
        const speed = 3.6;
        const nx = p.x + (dx / dist) * speed * dt;
        const nz = p.z + (dz / dist) * speed * dt;
        if (!collidesWithBuildings(nx, nz, 1)) { p.x = nx; p.z = nz; }
        p.heading = Math.atan2(dx, dz);
        if (dist > 22) { p.fleeing = false; p.wanderTimer = 1; }
      } else {
        p.wanderTimer -= dt;
        if (p.wanderTimer <= 0) {
          p.wanderTimer = 2 + Math.random() * 4;
          p.heading += (Math.random() - 0.5) * 1.6;
        }
        const speed = 1.1;
        const nx = p.x + Math.sin(p.heading) * speed * dt;
        const nz = p.z + Math.cos(p.heading) * speed * dt;
        if (!collidesWithBuildings(nx, nz, 1) && !isOnRoad(nx, nz)) { p.x = nx; p.z = nz; }
        else p.heading += Math.PI * 0.5;
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    });
  }

  function updateCoins() {
    coins.forEach((c) => {
      if (c.active) {
        c.mesh.rotation.z += 0.04;
        const dist = Math.hypot(c.x - player.x, c.z - player.z);
        if (!state.inVehicle && dist < 1.4) {
          c.active = false;
          c.mesh.visible = false;
          c.respawnTimer = 8;
          state.money += 10;
          updateHUDMoney();
          writeSave();
        }
      } else {
        c.respawnTimer -= 1 / 60;
        if (c.respawnTimer <= 0) { c.active = true; c.mesh.visible = true; }
      }
    });
  }

  function updateCamera(dt) {
    cameraYaw -= lookDeltaX * 0.006;
    cameraPitch -= lookDeltaY * 0.004;
    cameraPitch = Math.max(0.08, Math.min(0.75, cameraPitch));
    lookDeltaX = 0; lookDeltaY = 0;

    // While driving, the car's heading is set directly by steering (not by
    // camera angle), so it's safe to auto-swing the camera to stay behind
    // it. While walking, player.heading is itself derived FROM cameraYaw
    // (see updatePlayerWalking) — auto-chasing here too would feed back
    // into a runaway spin whenever a turn/strafe key is held, so on foot
    // the camera only turns from an explicit look-drag.
    if (state.inVehicle) {
      const behind = player.heading + Math.PI;
      let diff = behind - cameraYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      cameraYaw += diff * Math.min(1, dt * 2.2);
    }

    const dist = state.inVehicle ? CAMERA_DIST + 2 : CAMERA_DIST;

    // Smoothly chase the player's height instead of snapping straight to it —
    // a 1:1 follow made a double-jump yank the whole view upward with the
    // character; lerping keeps a jump feeling like a jump instead of a
    // camera lurch, while still catching up quickly enough not to lose them.
    cameraFollowY += (player.y - cameraFollowY) * Math.min(1, dt * 5);

    let camX = player.x + Math.sin(cameraYaw) * dist * Math.cos(cameraPitch);
    let camZ = player.z + Math.cos(cameraYaw) * dist * Math.cos(cameraPitch);
    let camY = cameraFollowY + 2.2 + dist * Math.sin(cameraPitch);

    if (crashShakeTime > 0) {
      crashShakeTime = Math.max(0, crashShakeTime - dt);
      const s = crashShakeMag * (crashShakeTime / 0.35);
      camX += (Math.random() - 0.5) * s;
      camY += (Math.random() - 0.5) * s;
      camZ += (Math.random() - 0.5) * s;
    }

    camera.position.set(camX, camY, camZ);
    camera.lookAt(player.x, cameraFollowY + 1.3, player.z);
  }

  // Ramming a building at speed now actually feels like a crash: a hard
  // speed loss (see updateVehicle) plus a brief camera shake and a toast,
  // instead of the car just silently stopping dead.
  function triggerCrashFx(speed, v) {
    crashShakeTime = 0.35;
    crashShakeMag = Math.min(0.5, speed / 40);
    const now = performance.now() / 1000;
    if (now - lastCrashToastAt > 1) {
      lastCrashToastAt = now;
      toast('💥 Crash!', 1200);
    }
    if (v) {
      v.smokingUntil = now + 6; // engine smokes for a while after a hard hit
      v.lastSmokeAt = 0;
      v.crashCount = (v.crashCount || 0) + 1;
      if (v.crashCount >= 10) explodeVehicle(v);
    }
  }

  // Ten hard crashes totals the car. If you're the one driving it, you get
  // thrown clear (still just as non-violent as everything else — this is
  // about the CAR, not people) and lose a big chunk of health; the car
  // itself respawns fresh elsewhere a moment later.
  function explodeVehicle(v) {
    spawnExplosionFx(v.x, v.z);
    const wasPlayerCar = state.inVehicle === v;
    if (wasPlayerCar) {
      tryEnterExitVehicle(); // eject at the crash site before we move the car
      damagePlayer(70);
      toast('💥💥 Your car exploded! -70% health', 2500);
    } else {
      toast('💥💥 A car exploded!', 2000);
    }
    let spot;
    if (v.type === 'tank' || v.type === 'jet' || v.type === 'jeep') spot = randomOpenSpotNear(militaryBaseCenter.x, militaryBaseCenter.z, 20, 3);
    else if (v.type === 'jetski') spot = { x: (Math.random() * 2 - 1) * 16, z: oceanStartZ + 15 };
    else if (v.occupied) spot = randomRoadSpot();
    else spot = randomOpenSpot(3);
    v.x = spot.x; v.z = spot.z;
    if (spot.heading !== undefined) v.heading = spot.heading;
    v.speed = 0;
    v.crashCount = 0;
    v.smokingUntil = 0;
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;
  }

  function spawnExplosionFx(x, z) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 }));
    flash.position.set(x, 1, z);
    scene.add(flash);
    const flashStart = performance.now();
    function animFlash() {
      const t = (performance.now() - flashStart) / 500;
      if (t >= 1) { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); return; }
      const s = 1 + t * 4;
      flash.scale.set(s, s, s);
      flash.material.opacity = 0.9 * (1 - t);
      requestAnimationFrame(animFlash);
    }
    animFlash();

    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x374151, transparent: true, opacity: 0.7 })
        );
        puff.position.set(x + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1, z + (Math.random() - 0.5) * 2);
        scene.add(puff);
        const start = performance.now();
        function anim() {
          const t = (performance.now() - start) / 1200;
          if (t >= 1) { scene.remove(puff); puff.geometry.dispose(); puff.material.dispose(); return; }
          puff.position.y += 0.01;
          const s = 1 + t * 2.5;
          puff.scale.set(s, s, s);
          puff.material.opacity = 0.7 * (1 - t);
          requestAnimationFrame(anim);
        }
        anim();
      }, i * 60);
    }
  }

  function spawnSmokePuff(v) {
    const frontX = v.x + Math.sin(v.heading) * 2.1;
    const frontZ = v.z + Math.cos(v.heading) * 2.1;
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.55 })
    );
    puff.position.set(frontX + (Math.random() - 0.5) * 0.4, 0.65 + Math.random() * 0.25, frontZ + (Math.random() - 0.5) * 0.4);
    scene.add(puff);
    const start = performance.now();
    function anim() {
      const t = (performance.now() - start) / 900;
      if (t >= 1) { scene.remove(puff); puff.geometry.dispose(); puff.material.dispose(); return; }
      puff.position.y += 0.012;
      const s = 1 + t * 1.8;
      puff.scale.set(s, s, s);
      puff.material.opacity = 0.55 * (1 - t);
      requestAnimationFrame(anim);
    }
    anim();
  }

  function updateVehicleSmoke(v) {
    const now = performance.now() / 1000;
    if (!v.smokingUntil || now > v.smokingUntil) return;
    if (now - (v.lastSmokeAt || 0) > 0.16) {
      v.lastSmokeAt = now;
      spawnSmokePuff(v);
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state.inVehicle) updateVehicle(dt);
    else updatePlayerWalking(dt);

    updateOtherVehicles(dt);
    updateRobots(dt);
    updatePedestrians(dt);
    updateCoins();
    updateOcean(dt);
    rides.forEach((r) => { r.group.rotation[r.axis] += r.speed * dt; });
    updateProximity();
    updateCamera(dt);
    checkMissionArrival();
    drawMinimap();
    updateCompassAndWaypointInfo();
    if (playerAimMarker) playerAimMarker.visible = state.aimMarkerOn && !state.inVehicle;

    renderer.render(scene, camera);
  }

  // Exposed for curious campers to poke at in the browser console —
  // e.g. BlasterCity.state.money += 1000
  window.BlasterCity = {
    get state() { return state; },
    get player() { return player; },
    get playerAimMarker() { return playerAimMarker; },
    get vehicles() { return vehicles; },
    get robots() { return robots; },
    get pedestrians() { return pedestrians; },
    get banks() { return banks; },
    get pizzaPlaces() { return pizzaPlaces; },
    get apartments() { return apartments; },
    get foodStalls() { return foodStalls; },
    get beachCenter() { return beachCenter; },
    get carnivalCenter() { return carnivalCenter; },
    get militaryBaseCenter() { return militaryBaseCenter; },
    get militaryGateBox() { return militaryGateBox; },
    get buildingBoxes() { return buildingBoxes; },
    get mountainPeaks() { return mountainPeaks; },
    get mountainZ() { return mountainZ; },
    get cameraYaw() { return cameraYaw; },
    set cameraYaw(v) { cameraYaw = v; },
    fireWeapon, tryEnterExitVehicle, startMission, openShop, robBank, grabPizza, getMilitaryJob, blockedByMilitaryGate,
    getFloorHeightAt, getMountainHeightAt, triggerCrashFx, explodeVehicle, healPlayer, damagePlayer, buyApartment,
    restAtApartment, buyFood, cycleWeapon,
    CONTACTS, WEAPONS,
  };

})();
