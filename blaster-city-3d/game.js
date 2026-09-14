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
        character: state.character,
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
    { id: 'confetti', name: 'Confetti Cannon', icon: '🎉', price: 350, damage: 34, rate: 2.4, range: 26, color: 0xf472b6, splash: 3 },
    { id: 'bubble', name: 'Bubble Bazooka', icon: '🫧', price: 700, damage: 55, rate: 1.3, range: 34, color: 0xa78bfa, splash: 5 },
    { id: 'mega', name: 'Mega Soaker 9000', icon: '🚀', price: 1500, damage: 100, rate: 1.6, range: 40, color: 0xfb923c, splash: 6 },
  ];

  const SKIN_TONES = [0xffdbb4, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5a3825];
  const SHIRT_COLORS = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x111827, 0xec4899, 0xffffff];
  const PANTS_COLORS = [0x1f2937, 0x334155, 0x4b5563, 0x0f172a, 0x78350f, 0x164e63];
  const HATS = ['none', 'cap', 'helmet', 'crown'];
  const ACCESSORIES = ['none', 'backpack', 'cape', 'wings'];

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
    character: {
      skin: SKIN_TONES[0],
      shirt: SHIRT_COLORS[1],
      pants: PANTS_COLORS[0],
      hat: 'none',
      accessory: 'none',
    },
    health: 100,
    inVehicle: null,
    waypoint: null, // {x, z}
    mission: null,  // {type, targetId?, marker:{x,z}, reward, progress, needed}
    nearShop: false,
    nearVehicle: null,
    lastShotTime: 0,
  };

  const saved = loadSave();
  if (saved) {
    state.money = typeof saved.money === 'number' ? saved.money : state.money;
    state.ownedWeapons = Array.isArray(saved.ownedWeapons) && saved.ownedWeapons.length ? saved.ownedWeapons : state.ownedWeapons;
    state.currentWeaponId = saved.currentWeaponId || state.currentWeaponId;
    if (saved.character) Object.assign(state.character, saved.character);
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
    customizeOptionsEl.appendChild(buildSwatchGroup('Shirt Color', SHIRT_COLORS, 'shirt', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildSwatchGroup('Pants Color', PANTS_COLORS, 'pants', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Hat', HATS, ['None', 'Cap', 'Helmet', 'Crown'], 'hat', refreshCharacterPreview));
    customizeOptionsEl.appendChild(buildPillGroup('Accessory', ACCESSORIES, ['None', 'Backpack', 'Cape', 'Wings'], 'accessory', refreshCharacterPreview));
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

  // Builds a low-poly humanoid mesh from a character config. Reused for
  // both the customizer preview and the actual in-world player model.
  function buildCharacterMesh(cfg) {
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: cfg.shirt, roughness: 0.62 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: cfg.pants, roughness: 0.68 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.5 });

    // Legs — rounded capsules read as actual limbs instead of plank-shaped boxes
    const legGeo = new THREE.CapsuleGeometry(0.13, 0.62, 4, 10);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.15, 0.44, 0);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.15, 0.44, 0);
    group.add(legL, legR);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.18, 0.12, 0.32);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-0.15, 0.07, 0.05);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0.15, 0.07, 0.05);
    group.add(shoeL, shoeR);

    // Hips (smooths the leg-to-torso joint)
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.1, 4, 10), pantsMat);
    hips.position.set(0, 0.86, 0);
    group.add(hips);

    // Torso — tapered capsule reads far more like a human ribcage than a box
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), shirtMat);
    torso.position.set(0, 1.18, 0);
    torso.scale.set(1.15, 1, 0.72);
    group.add(torso);

    // Shoulders (rounds off the arm sockets)
    const shoulderGeo = new THREE.SphereGeometry(0.13, 12, 12);
    const shoulderL = new THREE.Mesh(shoulderGeo, shirtMat);
    shoulderL.position.set(-0.34, 1.42, 0);
    const shoulderR = new THREE.Mesh(shoulderGeo, shirtMat);
    shoulderR.position.set(0.34, 1.42, 0);
    group.add(shoulderL, shoulderR);

    // Arms — upper arm (sleeve) + forearm (skin) for a two-segment silhouette.
    // Each arm is a Group pivoted AT THE SHOULDER (not the world origin) so
    // that rotating it for the walk-swing animation pivots naturally instead
    // of sweeping the whole limb around the character's feet.
    const upperArmGeo = new THREE.CapsuleGeometry(0.095, 0.28, 4, 8);
    const foreArmGeo = new THREE.CapsuleGeometry(0.08, 0.26, 4, 8);
    const handGeo = new THREE.SphereGeometry(0.095, 10, 10);

    const armL = new THREE.Group();
    armL.position.set(-0.34, 1.42, 0);
    const upperArmL = new THREE.Mesh(upperArmGeo, shirtMat);
    upperArmL.position.set(0, -0.18, 0);
    const foreArmL = new THREE.Mesh(foreArmGeo, skinMat);
    foreArmL.position.set(0, -0.47, 0);
    const handL = new THREE.Mesh(handGeo, skinMat);
    handL.position.set(0, -0.64, 0);
    armL.add(upperArmL, foreArmL, handL);

    const armR = new THREE.Group();
    armR.position.set(0.34, 1.42, 0);
    const upperArmR = new THREE.Mesh(upperArmGeo, shirtMat);
    upperArmR.position.set(0, -0.18, 0);
    const foreArmR = new THREE.Mesh(foreArmGeo, skinMat);
    foreArmR.position.set(0, -0.47, 0);
    const handR = new THREE.Mesh(handGeo, skinMat);
    handR.position.set(0, -0.64, 0);
    armR.add(upperArmR, foreArmR, handR);

    group.add(armL, armR);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10), skinMat);
    neck.position.set(0, 1.5, 0);
    group.add(neck);

    // Head — slightly egg-shaped rather than a perfect sphere
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 20), skinMat);
    head.position.set(0, 1.68, 0);
    head.scale.set(0.92, 1.08, 0.96);
    group.add(head);

    // Simple friendly face: eyes + a soft mouth line, subtle enough to stay stylized
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.3 });
    const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.09, 1.71, 0.215);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.09, 1.71, 0.215);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 }));
    mouth.position.set(0, 1.615, 0.225);
    group.add(eyeL, eyeR, mouth);

    // Hair (simple scalp cap so the head doesn't read as a bare sphere)
    if (cfg.hat === 'none') {
      const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hair !== undefined ? cfg.hair : 0x2b1a12, roughness: 0.75 });
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
      hair.position.set(0, 1.705, -0.01);
      hair.scale.set(0.96, 1, 1);
      group.add(hair);
    }

    // Hat
    if (cfg.hat === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
      // Dome extends a bit past its equator (thetaLength > PI/2) so it hugs
      // down over the sides of the head instead of floating above it — the
      // rim then lands right where the brim attaches, with no bald gap.
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), capMat);
      dome.position.set(0, 1.79, 0);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.24), capMat);
      brim.position.set(0, 1.685, 0.235);
      brim.rotation.x = -0.1;
      group.add(dome, brim);
    } else if (cfg.hat === 'helmet') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.4, roughness: 0.3 }));
      helmet.position.set(0, 1.70, 0);
      group.add(helmet);
    } else if (cfg.hat === 'crown') {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.75, roughness: 0.25 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.11, 12), goldMat);
      band.position.set(0, 1.87, 0);
      group.add(band);

      const jewelColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xef4444, 0x3b82f6];
      const spikeCount = 5;
      for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), goldMat);
        spike.position.set(Math.cos(angle) * 0.19, 1.99, Math.sin(angle) * 0.19);
        group.add(spike);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshStandardMaterial({ color: jewelColors[i], roughness: 0.25 }));
        jewel.position.set(Math.cos(angle) * 0.24, 1.87, Math.sin(angle) * 0.24);
        group.add(jewel);
      }
    }

    // Accessory
    if (cfg.accessory === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0x7c2d12 }));
      pack.position.set(0, 1.16, -0.28);
      group.add(pack);
    } else if (cfg.accessory === 'cape') {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), new THREE.MeshStandardMaterial({ color: 0xdc2626, side: THREE.DoubleSide }));
      cape.position.set(0, 1.05, -0.22);
      cape.rotation.x = 0.15;
      group.add(cape);
    } else if (cfg.accessory === 'wings') {
      const wingGeo = new THREE.BoxGeometry(0.5, 0.3, 0.06);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
      const wL = new THREE.Mesh(wingGeo, wingMat);
      wL.position.set(-0.4, 1.32, -0.2);
      wL.rotation.z = 0.4;
      const wR = new THREE.Mesh(wingGeo, wingMat);
      wR.position.set(0.4, 1.32, -0.2);
      wR.rotation.z = -0.4;
      group.add(wL, wR);
    }

    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;

    if (cfg.weapon && cfg.weapon !== 'fists') {
      const weaponMesh = makeWeaponMesh(cfg.weapon);
      weaponMesh.position.set(0.1, -0.62, 0.13);
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
  const BUILDING_MARGIN = 3;
  const WORLD_HALF = (CITY_BLOCKS * BLOCK_SIZE) / 2;

  let renderer, scene, camera;
  let clock;
  let player, playerMesh;
  let buildingBoxes = []; // {minX,maxX,minZ,maxZ}
  let vehicles = [];
  let robots = [];
  let pedestrians = [];
  let coins = [];
  let shopMarkerPos = null;
  let gameStarted = false;
  let cameraYaw = 0;
  let cameraPitch = 0.28;
  const CAMERA_DIST = 7.5;

  function startGameWorld() {
    if (gameStarted) return;
    gameStarted = true;
    initThree();
    buildCity();
    createPlayer();
    spawnVehicles();
    spawnRobots();
    spawnPedestrians();
    spawnCoins();
    hideOverlay(loadingScreen);
    updateHUDMoney();
    updateWeaponHUD();
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
    scene.fog = new THREE.Fog(0x8fd3f4, 60, 190);

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

    const groundGeo = new THREE.PlaneGeometry(WORLD_HALF * 2.6, WORLD_HALF * 2.6);
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
    for (let i = 0; i <= CITY_BLOCKS; i++) {
      const z = -WORLD_HALF + i * BLOCK_SIZE;
      const roadH = new THREE.Mesh(roadGeo, roadMat);
      roadH.rotation.x = -Math.PI / 2;
      roadH.position.set(0, 0.01, z);
      roadH.receiveShadow = true;
      scene.add(roadH);

      const roadV = new THREE.Mesh(roadGeo, roadMat);
      roadV.rotation.x = -Math.PI / 2;
      roadV.rotation.z = Math.PI / 2;
      roadV.position.set(z, 0.01, 0);
      roadV.receiveShadow = true;
      scene.add(roadV);
    }

    const buildingPalette = [0xd6d3d1, 0xfca5a5, 0xfcd34d, 0x93c5fd, 0xc4b5fd, 0xa7f3d0, 0xf9a8d4];
    let shopPlaced = false;

    for (let bx = 0; bx < CITY_BLOCKS; bx++) {
      for (let bz = 0; bz < CITY_BLOCKS; bz++) {
        const cx = -WORLD_HALF + BLOCK_SIZE * bx + BLOCK_SIZE / 2;
        const cz = -WORLD_HALF + BLOCK_SIZE * bz + BLOCK_SIZE / 2;
        const footprint = BLOCK_SIZE - ROAD_WIDTH - BUILDING_MARGIN * 2;

        // Leave a few open blocks as parks/plazas for variety
        if (Math.random() < 0.12) continue;

        const isShopBlock = !shopPlaced && bx === Math.floor(CITY_BLOCKS / 2) && bz === Math.floor(CITY_BLOCKS / 2);

        if (isShopBlock) {
          shopPlaced = true;
          const w = footprint * 0.8, d = footprint * 0.8, h = 8;
          const mat = makeBuildingMaterials(0x0ea5e9, w, h, d, { winScale: 0.78, litChance: 0.7 });
          const shop = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          shop.position.set(cx, h / 2, cz);
          shop.castShadow = true;
          shop.receiveShadow = true;
          scene.add(shop);
          addFloatingSign(cx, h + 1.6, cz, '💦 BLASTER SHOP');
          buildingBoxes.push(boxOf(cx, cz, w, d));
          shopMarkerPos = { x: cx, z: cz };
          continue;
        }

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
          buildingBoxes.push(boxOf(px, pz, w, d));

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
      buildingBoxes.push(boxOf(0, 0, 18, 18));
    }
  }

  function boxOf(cx, cz, w, d) {
    return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
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

  function collidesWithBuildings(x, z, margin) {
    for (const b of buildingBoxes) {
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
    }
    return false;
  }

  // ------------------------------------------------------------
  // Player
  // ------------------------------------------------------------
  function createPlayer() {
    playerMesh = buildCharacterMesh(Object.assign({}, state.character, { weapon: state.currentWeaponId }));
    playerMesh.castShadow = true;
    playerMesh.traverse((c) => { c.castShadow = true; });
    scene.add(playerMesh);

    player = {
      x: 4, z: 10, heading: 0, speed: 0,
      walking: false,
      bobPhase: 0,
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

  function spawnVehicles() {
    const count = 9;
    for (let i = 0; i < count; i++) {
      const spot = randomOpenSpot(3);
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const mesh = makeCarMesh(color);
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      vehicles.push({
        mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2, speed: 0,
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
      const spot = randomOpenSpot(2);
      const mesh = makeRobotMesh();
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      robots.push({
        mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2,
        hp: 40 + Math.floor(Math.random() * 40), maxHp: 40,
        alive: true, wanderTimer: Math.random() * 3, fleeing: false,
      });
    }
  }

  function makePedestrianMesh() {
    const cfg = {
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
      pants: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)],
      hat: 'none', accessory: 'none',
    };
    const mesh = buildCharacterMesh(cfg);
    mesh.scale.setScalar(0.95);
    mesh.traverse((c) => { c.castShadow = true; });
    return mesh;
  }

  function spawnPedestrians() {
    for (let i = 0; i < 10; i++) {
      const spot = randomOpenSpot(2);
      const mesh = makePedestrianMesh();
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      pedestrians.push({ mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3 });
    }
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

    $('btn-phone').addEventListener('click', openPhone);
    $('btn-map').addEventListener('click', openMap);
    $('btn-weapons').addEventListener('click', openWeaponWheel);
    $('btn-clear-waypoint').addEventListener('click', () => {
      state.waypoint = null;
      $('waypoint-info').classList.add('hidden');
      toast('Waypoint cleared.');
    });
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
  }

  function updateHUDMoney() {
    $('money-value').textContent = state.money;
    $('shop-money').textContent = state.money;
  }

  function fireWeapon() {
    if (state.inVehicle) return; // no shooting while driving
    const w = getWeapon(state.currentWeaponId);
    const now = performance.now() / 1000;
    const cooldown = 1 / w.rate;
    if (now - state.lastShotTime < cooldown) return;
    state.lastShotTime = now;

    // Muzzle flash-ish quick blast effect + hit detection along player facing direction
    const originX = player.x, originZ = player.z;
    const dirX = Math.sin(player.heading), dirZ = Math.cos(player.heading);

    let hitSomething = false;
    for (const bot of robots) {
      if (!bot.alive) continue;
      const dx = bot.x - originX, dz = bot.z - originZ;
      const dist = Math.hypot(dx, dz);
      if (dist > w.range) continue;
      const angleTo = Math.atan2(dx, dz);
      let diff = angleTo - player.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.35) {
        applyDamageToRobot(bot, w.damage);
        hitSomething = true;
      }
    }
    spawnBlasterFX(originX, originZ, player.heading);
    if (!hitSomething) {
      // small chance friendly flavor text if aimed at pedestrian
    }
  }

  function spawnBlasterFX(x, z, heading) {
    const geo = new THREE.SphereGeometry(0.12, 8, 8);
    const w = getWeapon(state.currentWeaponId);
    const mat = new THREE.MeshBasicMaterial({ color: w.color });
    const fx = new THREE.Mesh(geo, mat);
    fx.position.set(x + Math.sin(heading) * 1.2, 1.1, z + Math.cos(heading) * 1.2);
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
          const spot = randomOpenSpot(2);
          const mesh = makeRobotMesh();
          mesh.position.set(spot.x, 0, spot.z);
          scene.add(mesh);
          robots.push({ mesh, x: spot.x, z: spot.z, heading: Math.random() * Math.PI * 2, hp: 40 + Math.floor(Math.random() * 40), maxHp: 40, alive: true, wanderTimer: Math.random() * 3, fleeing: false });
        }, 4000);
      }, 900);
    }
  }

  // ------------------------------------------------------------
  // Shop
  // ------------------------------------------------------------
  function renderShop() {
    const list = $('shop-list');
    list.innerHTML = '';
    WEAPONS.forEach((w) => {
      const owned = state.ownedWeapons.includes(w.id);
      const equipped = state.currentWeaponId === w.id;
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-icon">${w.icon}</div>
        <div class="item-info">
          <div class="item-name">${w.name}</div>
          <div class="item-desc">Damage ${w.damage} &middot; Range ${w.range}m ${w.price ? '&middot; $' + w.price : '&middot; Free'}</div>
        </div>
        <div class="item-action"></div>
      `;
      const actionDiv = row.querySelector('.item-action');
      const btn = document.createElement('button');
      if (equipped) {
        btn.textContent = 'Equipped';
        btn.className = 'equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
        btn.className = 'equip';
        btn.addEventListener('click', () => { equipWeapon(w.id); renderShop(); });
      } else {
        btn.textContent = `Buy $${w.price}`;
        btn.className = 'buy';
        btn.disabled = state.money < w.price;
        btn.addEventListener('click', () => {
          if (state.money < w.price) return;
          state.money -= w.price;
          state.ownedWeapons.push(w.id);
          state.currentWeaponId = w.id;
          updateHUDMoney();
          updateWeaponHUD();
          writeSave();
          toast(`Bought ${w.name}!`);
          renderShop();
        });
      }
      actionDiv.appendChild(btn);
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
    drawMap();
    showOverlay(mapOverlay);
  }

  function worldToMapPx(x, z, size) {
    const half = WORLD_HALF;
    return {
      px: ((x + half) / (half * 2)) * size,
      py: ((z + half) / (half * 2)) * size,
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

    // player
    const pp = worldToMapPx(player.x, player.z, size);
    mapCtx.save();
    mapCtx.translate(pp.px, pp.py);
    mapCtx.rotate(player.heading);
    mapCtx.fillStyle = '#22d3ee';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8); mapCtx.lineTo(6, 7); mapCtx.lineTo(-6, 7);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
  }

  mapCanvas.addEventListener('pointerdown', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const scale = mapCanvas.width / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const half = WORLD_HALF;
    const wx = (px / mapCanvas.width) * (half * 2) - half;
    const wz = (py / mapCanvas.height) * (half * 2) - half;
    state.waypoint = { x: wx, z: wz };
    $('waypoint-info').classList.remove('hidden');
    drawMap();
    toast('📍 Waypoint set!');
  });

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

    miniCtx.fillStyle = '#94a3b8';
    vehicles.forEach((v) => {
      if (state.inVehicle === v) return;
      if (Math.hypot(v.x - player.x, v.z - player.z) > MINI_RANGE) return;
      const p = toMini(v.x, v.z);
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

    // player arrow (always centered, points with heading)
    miniCtx.save();
    miniCtx.translate(center, center);
    miniCtx.rotate(player.heading);
    miniCtx.fillStyle = '#facc15';
    miniCtx.beginPath();
    miniCtx.moveTo(0, -7); miniCtx.lineTo(5, 6); miniCtx.lineTo(-5, 6);
    miniCtx.closePath(); miniCtx.fill();
    miniCtx.restore();

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
    compass.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
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
      player.x = v.x + Math.sin(v.heading + Math.PI / 2) * 2.4;
      player.z = v.z + Math.cos(v.heading + Math.PI / 2) * 2.4;
      player.heading = v.heading;
      playerMesh.visible = true;
      state.inVehicle = null;
      toast('🚪 You got out of the car.');
    } else if (state.nearVehicle) {
      state.inVehicle = state.nearVehicle;
      playerMesh.visible = false;
      toast('🚗 Vroom! GPS route active — check your minimap.', 2200);
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

    const promptEl = $('prompt-banner');
    if (state.inVehicle) {
      promptEl.textContent = 'Press 🚪 or E to exit the car';
      promptEl.classList.remove('hidden');
    } else if (state.nearVehicle) {
      promptEl.textContent = 'Press 🚪 or E to enter the car';
      promptEl.classList.remove('hidden');
    } else if (state.nearShop) {
      promptEl.textContent = 'Tap here to open the Blaster Shop 💦';
      promptEl.classList.remove('hidden');
      promptEl.onclick = openShop;
    } else {
      promptEl.classList.add('hidden');
      promptEl.onclick = null;
    }
  }

  // ==============================================================
  // UPDATE LOOP
  // ==============================================================
  function updatePlayerWalking(dt) {
    const kb = keyboardMove();
    let mx = input.moveX + kb.mx;
    let my = input.moveY + kb.my;
    const mag = Math.hypot(mx, my);
    player.walking = mag > 0.05;

    if (player.walking) {
      const targetHeading = Math.atan2(mx, -my);
      player.heading = targetHeading;
      const speed = 6.2;
      const nx = player.x + Math.sin(player.heading) * speed * dt * Math.min(mag, 1);
      const nz = player.z + Math.cos(player.heading) * speed * dt * Math.min(mag, 1);
      if (!collidesWithBuildings(nx, player.z, 0.6)) player.x = nx;
      if (!collidesWithBuildings(player.x, nz, 0.6)) player.z = nz;
      player.bobPhase += dt * 10;
    }

    const clampR = WORLD_HALF + BLOCK_SIZE / 2 - 2;
    player.x = Math.max(-clampR, Math.min(clampR, player.x));
    player.z = Math.max(-clampR, Math.min(clampR, player.z));

    playerMesh.position.set(player.x, player.walking ? Math.abs(Math.sin(player.bobPhase)) * 0.06 : 0, player.z);
    playerMesh.rotation.y = player.heading;
    const armSwing = player.walking ? Math.sin(player.bobPhase) * 0.6 : 0;
    if (playerMesh.userData.armL) playerMesh.userData.armL.rotation.x = armSwing;
    if (playerMesh.userData.armR) playerMesh.userData.armR.rotation.x = -armSwing;
    if (playerMesh.userData.legL) playerMesh.userData.legL.rotation.x = -armSwing;
    if (playerMesh.userData.legR) playerMesh.userData.legR.rotation.x = armSwing;
  }

  function updateVehicle(dt) {
    const v = state.inVehicle;
    const kb = keyboardMove();
    let throttle = -(input.moveY) - kb.my; // forward is negative Y
    let steer = input.moveX + kb.mx;

    const maxSpeed = 18;
    const accel = 14;
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

    const nx = v.x + Math.sin(v.heading) * v.speed * dt;
    const nz = v.z + Math.cos(v.heading) * v.speed * dt;
    if (!collidesWithBuildings(nx, v.z, 1.4)) v.x = nx; else v.speed *= 0.4;
    if (!collidesWithBuildings(v.x, nz, 1.4)) v.z = nz; else v.speed *= 0.4;

    const clampR = WORLD_HALF + BLOCK_SIZE / 2 - 2;
    v.x = Math.max(-clampR, Math.min(clampR, v.x));
    v.z = Math.max(-clampR, Math.min(clampR, v.z));

    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;

    player.x = v.x; player.z = v.z; player.heading = v.heading;

    // wheel spin flavor omitted for simplicity
  }

  function updateOtherVehicles(dt) {
    vehicles.forEach((v) => {
      if (v === state.inVehicle) return;
      // gentle idle sway animation only (parked cars); keeps scene lively without complex traffic AI
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
        if (!collidesWithBuildings(nx, nz, 1)) { bot.x = nx; bot.z = nz; }
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
      p.wanderTimer -= dt;
      if (p.wanderTimer <= 0) {
        p.wanderTimer = 2 + Math.random() * 4;
        p.heading += (Math.random() - 0.5) * 1.6;
      }
      const speed = 1.1;
      const nx = p.x + Math.sin(p.heading) * speed * dt;
      const nz = p.z + Math.cos(p.heading) * speed * dt;
      if (!collidesWithBuildings(nx, nz, 1)) { p.x = nx; p.z = nz; }
      else p.heading += Math.PI * 0.5;
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

    // If not actively looking, slowly settle camera behind player heading
    const behind = player.heading + Math.PI;
    let diff = behind - cameraYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    cameraYaw += diff * Math.min(1, dt * 2.2);

    const dist = state.inVehicle ? CAMERA_DIST + 2 : CAMERA_DIST;
    const camX = player.x + Math.sin(cameraYaw) * dist * Math.cos(cameraPitch);
    const camZ = player.z + Math.cos(cameraYaw) * dist * Math.cos(cameraPitch);
    const camY = 2.2 + dist * Math.sin(cameraPitch);
    camera.position.set(camX, camY, camZ);
    camera.lookAt(player.x, 1.3, player.z);
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
    updateProximity();
    updateCamera(dt);
    checkMissionArrival();
    drawMinimap();
    updateCompassAndWaypointInfo();

    renderer.render(scene, camera);
  }

  // Exposed for curious campers to poke at in the browser console —
  // e.g. BlasterCity.state.money += 1000
  window.BlasterCity = {
    get state() { return state; },
    get player() { return player; },
    get vehicles() { return vehicles; },
    get robots() { return robots; },
    fireWeapon, tryEnterExitVehicle, startMission, openShop, CONTACTS, WEAPONS,
  };

})();
