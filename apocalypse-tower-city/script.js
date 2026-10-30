(() => {
  'use strict';

  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND = 470;
  const CAR_W = 116;
  const CAR_H = 46;
  const BOX_W = 66;
  const BOX_H = 44;
  const MAX_CRATES = 7;
  const PLAYER_MAX_HP = 100;
  const TURTLE_SPEED = 30; // the car crawls on its own once a zombie passes the first cone
  const BEST_KEY = 'apocalypseTowerCityBestLevel';
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Crates go from weakest to strongest.
  const CRATES = [
    { name: 'Wooden Crate', icon: '🪵', hp: 70, cost: 20, fill: '#b07a3a', edge: '#7a4f20', shine: '#d19a55' },
    { name: 'Metal Crate', icon: '🔩', hp: 130, cost: 50, fill: '#8a9099', edge: '#555b63', shine: '#b8bec7' },
    { name: 'Titanium Crate', icon: '🛡️', hp: 210, cost: 110, fill: '#7fa6c9', edge: '#4a6f91', shine: '#c4e0f5' },
    { name: 'Gold Crate', icon: '👑', hp: 330, cost: 220, fill: '#e8b923', edge: '#a87f0c', shine: '#fff09a' }
  ];

  // Cars from worst to best. Index 0 means "no car".
  const CARS = [
    null,
    { name: 'Old Jeep', hp: 90, cost: 40, color: '#6b8e4e', wheels: 2 },
    { name: 'Pickup Truck', hp: 150, cost: 100, color: '#c0392b', wheels: 2 },
    { name: 'Monster Truck', hp: 230, cost: 220, color: '#e67e22', wheels: 2, big: true },
    { name: 'Armored Truck', hp: 340, cost: 380, color: '#4b5563', wheels: 3, spikes: true },
    { name: 'Battle Tank', hp: 480, cost: 600, color: '#3f6212', tank: true, spikes: true },
    { name: 'Hover Tank', hp: 650, cost: 900, color: '#6d28d9', hover: true, spikes: true }
  ];

  // Guns come in five kinds. In each kind, the more a gun costs, the more damage it does.
  const GUNS = [
    { cat: 'Pistols', name: 'Pistol', dmg: 8, rate: 0.35, spread: 0.02, shots: 1, cost: 0, len: 14, color: '#555' },
    { cat: 'Pistols', name: 'Revolver', dmg: 16, rate: 0.45, spread: 0.02, shots: 1, cost: 40, len: 16, color: '#8a8f99' },
    { cat: 'Pistols', name: 'Golden Hand Cannon', dmg: 32, rate: 0.45, spread: 0.02, shots: 1, cost: 140, len: 18, color: '#e8b923' },
    { cat: 'MGs', name: 'SMG', dmg: 10, rate: 0.14, spread: 0.06, shots: 1, cost: 60, len: 20, color: '#333', mag: true },
    { cat: 'MGs', name: 'Assault MG', dmg: 16, rate: 0.1, spread: 0.05, shots: 1, cost: 220, len: 28, color: '#222', mag: true },
    { cat: 'MGs', name: 'Heavy MG', dmg: 28, rate: 0.09, spread: 0.05, shots: 1, cost: 480, len: 32, color: '#3f4a3a', mag: true },
    { cat: 'Shotguns', name: 'Pump Shotgun', dmg: 12, rate: 0.55, spread: 0.16, shots: 5, cost: 150, len: 28, color: '#6b4423', stock: true },
    { cat: 'Shotguns', name: 'Double Barrel', dmg: 18, rate: 0.6, spread: 0.18, shots: 7, cost: 320, len: 30, color: '#5a3a1a', stock: true },
    { cat: 'Shotguns', name: 'Auto Shotgun', dmg: 24, rate: 0.35, spread: 0.16, shots: 6, cost: 600, len: 30, color: '#2b2b2b', stock: true },
    { cat: 'Spamming Guns', name: 'Spam Blaster', dmg: 6, rate: 0.045, spread: 0.09, shots: 1, cost: 180, len: 24, color: '#d946ef', spam: true },
    { cat: 'Spamming Guns', name: 'Minigun', dmg: 12, rate: 0.035, spread: 0.08, shots: 1, cost: 520, len: 32, color: '#444', spam: true },
    { cat: 'Spamming Guns', name: 'Mega Spammer', dmg: 22, rate: 0.03, spread: 0.08, shots: 1, cost: 950, len: 34, color: '#f43f5e', spam: true },
    { cat: 'Snipers', name: 'Hunting Rifle', dmg: 45, rate: 0.9, spread: 0, shots: 1, cost: 100, len: 34, color: '#6b4423', sniper: true, pierce: 2 },
    { cat: 'Snipers', name: 'Sniper Rifle', dmg: 120, rate: 1.0, spread: 0, shots: 1, cost: 380, len: 40, color: '#1f2937', sniper: true, pierce: 3 },
    { cat: 'Snipers', name: 'Laser Sniper', dmg: 280, rate: 0.9, spread: 0, shots: 1, cost: 850, len: 40, color: '#0ea5e9', sniper: true, pierce: 5, laser: true },
    { cat: 'Special', name: 'Plasma Cannon', dmg: 120, rate: 0.14, spread: 0.01, shots: 1, cost: 1200, len: 34, color: '#a3e635', plasma: true }
  ];

  // Blasters sit on your crates and shoot zombies by themselves. One per crate.
  const BLASTERS = [
    { name: 'Mini Blaster', icon: '🔫', dmg: 6, rate: 0.6, cost: 70, color: '#22d3ee', len: 18, thick: 7, about: 'Shoots little blue bolts.' },
    { name: 'Rapid Blaster', icon: '⚡', dmg: 6, rate: 0.18, cost: 160, color: '#facc15', len: 20, thick: 6, about: 'Fires super fast.' },
    { name: 'Freeze Ray', icon: '❄️', dmg: 8, rate: 0.35, cost: 260, color: '#93c5fd', len: 20, thick: 8, freeze: true, about: 'Freezes zombies so they walk slower.' },
    { name: 'Laser Turret', icon: '🔦', dmg: 30, rate: 0.5, cost: 380, color: '#38bdf8', len: 24, thick: 6, pierce: 3, kind: 'laser', about: 'Lasers zap through 3 zombies.' },
    { name: 'Flame Thrower', icon: '🔥', dmg: 5, rate: 0.05, cost: 450, color: '#fb923c', len: 16, thick: 10, range: 240, pierce: 3, kind: 'flame', about: 'Burns zombies that get close.' },
    { name: 'Rocket Launcher', icon: '🚀', dmg: 70, rate: 1.3, cost: 550, color: '#f97316', len: 24, thick: 11, splash: 90, kind: 'rocket', about: 'Rockets blow up whole groups.' },
    { name: 'Mega Cannon', icon: '💣', dmg: 160, rate: 1.0, cost: 800, color: '#a855f7', len: 30, thick: 12, pierce: 4, about: 'Giant shots that smash through 4 zombies.' }
  ];

  const TYPES = {
    walker: { hp: 20, speed: 40, w: 26, h: 54, dps: 4, coins: 3, skin: '#6fbf4f', shirt: '#7a5a3a' },
    runner: { hp: 14, speed: 90, w: 24, h: 48, dps: 5, coins: 4, skin: '#9be36b', shirt: '#2f5d8a' },
    brute: { hp: 90, speed: 26, w: 42, h: 74, dps: 16, coins: 10, skin: '#3f8a3a', shirt: '#5b2a2a' },
    climber: { hp: 26, speed: 55, w: 24, h: 46, dps: 12, coins: 6, skin: '#79c96a', shirt: '#6b2fa0' },
    flyer: { hp: 16, speed: 75, w: 30, h: 22, dps: 8, coins: 6, skin: '#8fd16a', shirt: '#2a2a2a' },
    spitter: { hp: 30, speed: 42, w: 28, h: 54, dps: 0, coins: 7, skin: '#b5e655', shirt: '#7f8c1d' },
    boss: { hp: 600, speed: 22, w: 84, h: 136, dps: 30, coins: 80, skin: '#4c8a3a', shirt: '#7a1f1f' }
  };

  const NEW_ZOMBIE_TIPS = {
    1: 'Level 1: Walkers. Slow and hungry. Shoot them to earn coins!',
    2: 'NEW: Runners! Fast little zombies.',
    3: 'NEW: Brutes! Big, tough zombies. A BOSS comes out of the porta potty this level!',
    4: 'NEW: Climbers! They climb your crates and attack YOU directly!',
    5: 'NEW: Flying zombies! Look up!',
    6: 'NEW: Spitters! They throw slime at your tower from far away.'
  };

  // ---------- Elements ----------
  const startOverlay = document.getElementById('start-overlay');
  const buildOverlay = document.getElementById('build-overlay');
  const resultOverlay = document.getElementById('result-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const shopEl = document.getElementById('shop');
  const buildLevelEl = document.getElementById('build-level');
  const buildCoinsEl = document.getElementById('build-coins');
  const buildTipEl = document.getElementById('build-tip');
  const resultTitle = document.getElementById('result-title');
  const resultText = document.getElementById('result-text');
  const nextButton = document.getElementById('next-button');
  const restartButton = document.getElementById('restart-button');
  const bestLine = document.getElementById('best-line');

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) { /* storage unavailable */ }
  }

  function block(x, y, w, h, fill, outline) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = outline || 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // ---------- Game state ----------
  let best = loadBest();
  let mode = 'start'; // start | build | play | paused | ending | won | lost
  let level = 1;
  let coins = 0;
  let build = null;
  let g = null;
  let shopTab = 'crates';
  const keys = { fire: false };
  const mouse = { x: W * 0.75, y: H * 0.45, down: false };

  function freshBuild() {
    return { crates: [{ m: 0, blaster: null }], car: 1, gun: 0 };
  }

  // The porta potty gets more health every level.
  function pottyHp(L) {
    return 150 + 160 * (L - 1);
  }

  function newLevel() {
    const L = level;
    const sourceX = 3200 + L * 250;
    const r = mulberry32(L * 9973 + 7);
    const far = [];
    const near = [];
    const props = [];
    for (let x = -200; x < sourceX + W; ) {
      const w = 70 + r() * 90;
      far.push({ x, w, h: 120 + r() * 200, seed: Math.floor(r() * 1000) });
      x += w + 10 + r() * 40;
    }
    for (let x = -200; x < sourceX + W; ) {
      const w = 90 + r() * 120;
      near.push({ x, w, h: 80 + r() * 150, cut: r() });
      x += w + 40 + r() * 120;
    }
    // Traffic cones are tripwires: a zombie walking past the cone closest to you
    // makes your car drive out to meet it.
    const cones = [];
    for (let x = 520; x < sourceX - 300; x += 340 + r() * 160) {
      cones.push(x);
      if (r() < 0.5) props.push({ x: x + 120 + r() * 80, kind: 1, c: r() });
    }
    const car = CARS[build.car];
    g = {
      towerX: 120,
      camX: 0,
      sourceX,
      sourceMax: pottyHp(L),
      sourceHp: pottyHp(L),
      doorT: 0,
      crates: build.crates.map(c => ({ m: c.m, blaster: c.blaster, hp: CRATES[c.m].hp, max: CRATES[c.m].hp, ang: Math.PI, t: rand(0, 0.5), splats: [] })),
      hasCar: !!car,
      carHp: car ? car.hp : 0,
      carMax: car ? car.hp : 1,
      playerHp: PLAYER_MAX_HP,
      drop: 0,
      zombies: [],
      bullets: [],
      goo: [],
      parts: [],
      texts: [],
      stains: [],
      carSplats: [],
      playerSplats: [],
      gunSplats: [],
      spawnT: 1.5,
      fireT: 0,
      recoil: 0,
      wheel: 0,
      time: 0,
      bossSpawned: false,
      shake: 0,
      hurtT: 0,
      kills: 0,
      earned: 0,
      endT: 0,
      far, near, props, cones,
      rolling: false
    };
    // A first wave that already crawled out of the porta potty.
    const startWave = 8 + 3 * L;
    for (let i = 0; i < startWave; i++) {
      const x = 750 + (sourceX - 900) * (i / startWave) + rand(-40, 40);
      spawnZombie(pickType(L), x, 0);
    }
  }

  // ---------- Tower geometry ----------
  function towerCX() { return g.towerX + CAR_W / 2; }
  function carTopY() { return g.hasCar ? GROUND - CAR_H : GROUND; }
  function crateY(i) { return carTopY() - (i + 1) * BOX_H - g.drop; }
  function towerTopY() { return carTopY() - g.crates.length * BOX_H - g.drop; }
  function towerLeft() { return g.hasCar ? g.towerX : towerCX() - 12; }
  function towerRight() { return g.hasCar ? g.towerX + CAR_W : towerCX() + 12; }
  function shoulder() { return { x: towerCX(), y: towerTopY() - 38 }; }
  function aimAngle() {
    const s = shoulder();
    return Math.atan2(mouse.y - s.y, mouse.x + g.camX - s.x);
  }

  // ---------- Spawning ----------
  function pickType(L) {
    const pool = [['walker', 5]];
    if (L >= 2) pool.push(['runner', 3]);
    if (L >= 3) pool.push(['brute', 1.3]);
    if (L >= 4) pool.push(['climber', 2.2]);
    if (L >= 5) pool.push(['flyer', 2]);
    if (L >= 6) pool.push(['spitter', 1.6]);
    const total = pool.reduce((s, p) => s + p[1], 0);
    let roll = Math.random() * total;
    for (const [t, w] of pool) {
      roll -= w;
      if (roll < 0) return t;
    }
    return 'walker';
  }

  function spawnZombie(type, x, emerge) {
    const T = TYPES[type];
    const L = level;
    const hpM = 1 + 0.3 * (L - 1);
    const spM = Math.min(1.9, 1 + 0.07 * (L - 1));
    const dM = 1 + 0.3 * (L - 1); // zombies hit harder every level
    const z = {
      type, x,
      y: type === 'flyer' ? rand(150, 260) : GROUND,
      w: T.w, h: T.h,
      hp: T.hp * hpM, maxHp: T.hp * hpM,
      speed: T.speed * spM * rand(0.85, 1.15),
      dps: T.dps * dM,
      coins: Math.round(T.coins * (1 + 0.2 * (L - 1))),
      state: 'walk',
      hitT: 0,
      phase: Math.random() * 6,
      jitter: rand(0, 14),
      shootT: rand(1, 2.5),
      emerge,
      splats: []
    };
    g.zombies.push(z);
    return z;
  }

  function spawnFromPotty() {
    const L = level;
    if (g.zombies.length >= 16 + 3 * L) return;
    spawnZombie(pickType(L), g.sourceX - 30, 0.5);
    g.doorT = 0.6;
  }

  // ---------- Damage ----------
  function addText(x, y, text, color) {
    g.texts.push({ x, y, text, color: color || '#fff', life: 1 });
  }

  function burst(x, y, color, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.3, speed);
      g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life: rand(0.4, 0.9), max: 0.9, color, size: rand(2, size || 5), grav: 700 });
    }
  }

  function bleed(x, y, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(speed * 0.3, speed);
      g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.5, max: 1.5, color: Math.random() < 0.5 ? '#c1121f' : '#8b0000', size: rand(3, 7), grav: 900, blood: true });
    }
  }

  // Sticks red spots onto something. Spots are stored relative to that thing.
  function splatOn(list, n, x0, x1, y0, y1) {
    for (let i = 0; i < n && list.length < 40; i++) {
      list.push({ x: rand(x0, x1), y: rand(y0, y1), r: rand(1.5, 4) });
    }
  }

  function drawSplats(list, ox, oy) {
    ctx.fillStyle = '#b5121b';
    for (const s of list) {
      ctx.beginPath();
      ctx.arc(ox + s.x, oy + s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function shake(amount) {
    if (!reduceMotion) g.shake = Math.max(g.shake, amount);
  }

  // Zombies break crates first, then the car, then you.
  function damageTower(amount) {
    if (mode !== 'play') return;
    g.hurtT = 0.12;
    if (g.crates.length) {
      const c = g.crates[0];
      c.hp -= amount;
      if (c.hp <= 0) {
        const y = crateY(0) + BOX_H / 2;
        burst(towerCX(), y, CRATES[c.m].fill, 22, 260, 7);
        addText(towerCX(), y, CRATES[c.m].name + ' smashed!', '#ffb347');
        g.crates.shift();
        g.drop += BOX_H;
        shake(8);
      }
      return;
    }
    if (g.hasCar) {
      g.carHp -= amount;
      if (g.carHp <= 0) {
        g.hasCar = false;
        burst(towerCX(), GROUND - 30, '#ff9f1c', 40, 380, 8);
        burst(towerCX(), GROUND - 30, '#333', 25, 260, 9);
        addText(towerCX(), GROUND - 90, 'Your car got wrecked!', '#ff5a5a');
        g.drop += CAR_H;
        shake(14);
      }
      return;
    }
    damagePlayer(amount);
  }

  function damagePlayer(amount) {
    if (mode !== 'play') return;
    g.hurtT = 0.12;
    g.playerHp -= amount;
    if (g.playerHp <= 0) {
      g.playerHp = 0;
      const s = shoulder();
      burst(s.x, s.y, '#ff5a5a', 30, 300, 6);
      loseGame();
    }
  }

  function hitZombie(z, dmg) {
    z.hp -= dmg;
    z.hitT = 0.08;
    bleed(z.x, z.y - z.h * 0.6, 2, 160);
    if (z.hp <= 0 && !z.dead) killZombie(z, true);
  }

  function killZombie(z, pay) {
    z.dead = true;
    bleed(z.x, z.y - z.h / 2, 22, 320);
    g.stains.push({ x: z.x + rand(-10, 10), y: rand(2, 10), r: z.w * 0.6 });
    // Close-up kills splash blood onto the zombie behind and onto your tower.
    const gap = z.x - z.w / 2 - towerRight();
    if (gap < 140) {
      const n = gap < 50 ? 6 : 3;
      let behind = null;
      for (const o of g.zombies) {
        if (o !== z && !o.dead && o.x > z.x && o.x - z.x < 90 && (!behind || o.x < behind.x)) behind = o;
      }
      if (behind) splatOn(behind.splats, n, -behind.w / 2, behind.w / 2, -behind.h, 0);
      g.crates.slice(0, 3).forEach(c => splatOn(c.splats, n, 2, BOX_W - 2, 2, BOX_H - 2));
      if (g.hasCar) splatOn(g.carSplats, n, CAR_W * 0.4, CAR_W - 4, 8, CAR_H - 22);
      splatOn(g.playerSplats, n - 1, -10, 10, -60, -4);
      splatOn(g.gunSplats, n - 1, 14, 14 + GUNS[build.gun].len, -4, 3);
    }
    burst(z.x, z.y - z.h / 2, TYPES[z.type].shirt, 6, 200, 5);
    if (pay) {
      coins += z.coins;
      g.earned += z.coins;
      g.kills++;
      addText(z.x, z.y - z.h - 10, '+' + z.coins + ' 🪙', '#ffd23f');
    }
  }

  function hitSource(dmg, x, y) {
    if (g.sourceHp <= 0) return;
    g.sourceHp -= dmg;
    burst(x, y, '#3aa0ff', 3, 180, 4);
    if (level % 3 === 0 && !g.bossSpawned && g.sourceHp < g.sourceMax * 0.6) {
      g.bossSpawned = true;
      spawnZombie('boss', g.sourceX - 40, 0.8);
      g.doorT = 1;
      addText(g.sourceX, GROUND - 230, 'BOSS ZOMBIE!', '#ff5a5a');
      shake(10);
    }
    if (g.sourceHp <= 0) winLevel();
  }

  // ---------- Level end ----------
  function winLevel() {
    g.sourceHp = 0;
    mode = 'ending';
    g.endT = 1.8;
    burst(g.sourceX, GROUND - 90, '#3aa0ff', 60, 500, 9);
    burst(g.sourceX, GROUND - 90, '#8b5a2b', 40, 420, 8);
    burst(g.sourceX, GROUND - 90, '#ffd23f', 30, 420, 6);
    shake(18);
    for (const z of g.zombies) if (!z.dead) killZombie(z, true);
  }

  function finishWin() {
    const bonus = 40 + 20 * level;
    coins += bonus;
    best = Math.max(best, level);
    saveBest(best);
    // Whatever survived comes with you. Smashed stuff is gone for good.
    build.crates = g.crates.map(c => ({ m: c.m, blaster: c.blaster }));
    if (!g.hasCar) build.car = 0;
    mode = 'won';
    resultTitle.textContent = `Level ${level} Cleared! 🚽💥`;
    let text = `You blew up the porta potty and blasted ${g.kills} zombies. ` +
      `You earned ${g.earned} coins plus a ${bonus} coin bonus!`;
    if (!g.hasCar) text += ' Your car was wrecked, so you need to buy a new one.';
    resultText.textContent = text;
    nextButton.classList.remove('hidden');
    restartButton.classList.add('hidden');
    resultOverlay.classList.remove('hidden');
  }

  function loseGame() {
    mode = 'lost';
    shake(16);
    best = Math.max(best, level - 1);
    saveBest(best);
    setTimeout(() => {
      resultTitle.textContent = 'You Got Zombified! 🧟';
      resultText.textContent = `The zombies smashed your crates, wrecked your car, and got you on level ${level}. ` +
        'Back to level 1 you go — but you keep all the stuff you bought and all your coins!';
      nextButton.classList.add('hidden');
        restartButton.classList.remove('hidden');
      resultOverlay.classList.remove('hidden');
    }, 900);
  }

  // ---------- Update ----------
  function update(dt) {
    g.time += dt;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 30);
    if (g.hurtT > 0) g.hurtT -= dt;
    if (g.doorT > 0) g.doorT -= dt;
    if (g.recoil > 0) g.recoil = Math.max(0, g.recoil - dt * 10);
    if (g.drop > 0) g.drop = Math.max(0, g.drop - dt * 320);

    if (mode === 'play') {
      updateTower(dt);
      updateSpawning(dt);
      updatePlayerGun(dt);
      updateBlasters(dt);
    }
    updateZombies(dt);
    updateBullets(dt);
    updateGoo(dt);
    updateParticles(dt);
    updateCamera(dt);

    g.zombies = g.zombies.filter(z => !z.dead);

    if (mode === 'ending') {
      g.endT -= dt;
      if (g.endT <= 0) finishWin();
    }
  }

  function blockingZombies() {
    const right = towerRight();
    return g.zombies.filter(z => !z.dead && z.emerge <= 0 && z.type !== 'flyer' &&
      (z.state === 'attack' || z.type === 'spitter') && z.x - z.w / 2 <= right + z.jitter + 2);
  }

  // Once a zombie walks past the first cone, the car starts crawling forward
  // by itself and never stops, except when a zombie is in the way.
  function updateTower(dt) {
    if (!g.rolling && g.zombies.some(z => !z.dead && z.emerge <= 0 && z.type !== 'flyer' && z.x - z.w / 2 < g.cones[0])) {
      g.rolling = true;
      addText(towerCX(), towerTopY() - 80, 'Zombie passed the cone! Rolling out 🐢', '#ff9f1c');
    }
    // If your blasters stop every zombie before the cone, roll out anyway.
    if (!g.rolling && g.time > 10) {
      g.rolling = true;
      addText(towerCX(), towerTopY() - 80, 'Road is clear! Rolling out 🐢', '#ff9f1c');
    }
    if (!g.rolling || blockingZombies().length) return;
    g.towerX = clamp(g.towerX + TURTLE_SPEED * dt, 20, g.sourceX - 230 - CAR_W);
    g.wheel += TURTLE_SPEED * dt / 16;
  }

  function updateSpawning(dt) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      const base = Math.max(0.35, 2.6 * Math.pow(0.86, level - 1));
      g.spawnT = base * rand(0.7, 1.3);
      spawnFromPotty();
    }
  }

  function updatePlayerGun(dt) {
    g.fireT -= dt;
    if (!(mouse.down || keys.fire) || g.fireT > 0) return;
    const gun = GUNS[build.gun];
    g.fireT = gun.rate;
    g.recoil = 1;
    const s = shoulder();
    const ang = aimAngle();
    const mx = s.x + Math.cos(ang) * (22 + gun.len);
    const my = s.y + Math.sin(ang) * (22 + gun.len);
    for (let i = 0; i < gun.shots; i++) {
      const a = ang + rand(-gun.spread, gun.spread);
      const speed = gun.sniper ? 1700 : 1000;
      g.bullets.push({
        x: mx, y: my, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        dmg: gun.dmg, life: gun.sniper ? 0.7 : 0.9,
        pierce: gun.pierce || 1, hits: [],
        kind: gun.laser ? 'laser' : gun.plasma ? 'plasma' : 'bullet',
        splash: gun.plasma ? 70 : 0
      });
    }
    g.parts.push({ x: mx, y: my, vx: 0, vy: 0, life: 0.06, max: 0.06, color: '#fff3a0', size: 9, grav: 0 });
  }

  function updateBlasters(dt) {
    g.crates.forEach((c, i) => {
      if (c.blaster === null) return;
      const B = BLASTERS[c.blaster];
      const range = B.range || 560;
      const px = towerCX() + BOX_W / 2 + 4;
      const py = crateY(i) + BOX_H / 2;
      let target = null;
      let bestD = range;
      for (const z of g.zombies) {
        if (z.dead || z.emerge > 0) continue;
        const d = Math.hypot(z.x - px, z.y - z.h / 2 - py);
        if (d < bestD) { bestD = d; target = { x: z.x, y: z.y - z.h / 2 }; }
      }
      if (!target && Math.abs(g.sourceX - px) < range && g.sourceHp > 0) {
        target = { x: g.sourceX, y: GROUND - 90 };
      }
      c.t -= dt;
      if (!target) return;
      c.ang = Math.atan2(target.y - py, target.x - px);
      if (c.t <= 0) {
        c.t = B.rate;
        const a = c.ang + (B.kind === 'flame' ? rand(-0.15, 0.15) : 0);
        const speed = B.kind === 'flame' ? 420 : B.kind === 'rocket' ? 600 : 850;
        g.bullets.push({
          x: px + Math.cos(a) * (B.len + 4), y: py + Math.sin(a) * (B.len + 4),
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          dmg: B.dmg, life: B.kind === 'flame' ? 0.55 : 0.8,
          pierce: B.pierce || 1, hits: [], kind: B.kind || 'bolt', color: B.color,
          splash: B.splash || 0, freeze: !!B.freeze
        });
      }
    });
  }

  function updateZombies(dt) {
    const right = towerRight();
    const cx = towerCX();
    const top = towerTopY();
    const active = mode === 'play';
    for (const z of g.zombies) {
      if (z.dead) continue;
      z.lastX = z.x;
      z.phase += dt * (z.speed / 10);
      if (z.hitT > 0) z.hitT -= dt;
      if (z.slowT > 0) z.slowT -= dt;
      const mdt = z.slowT > 0 ? dt * 0.4 : dt; // frozen zombies move slower
      if (z.emerge > 0) { z.emerge -= dt; continue; }
      if (!active) continue;

      if (z.type === 'flyer') {
        const dx = cx - z.x;
        const dy = top - 30 + Math.sin(z.phase * 0.5) * 25 - z.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 30) {
          z.x += dx / d * z.speed * mdt;
          z.y += dy / d * z.speed * mdt;
          z.state = 'walk';
        } else {
          z.state = 'attack';
          damageTower(z.dps * dt);
        }
        continue;
      }

      if (z.state === 'climb' || z.state === 'top') {
        if (!g.crates.length && !g.hasCar) { z.state = 'walk'; z.y = GROUND; continue; }
        z.x = cx + BOX_W / 2 + z.w / 2 - 4;
        if (z.state === 'climb') {
          z.y -= z.speed * 0.55 * mdt;
          if (z.y <= top) z.state = 'top';
        }
        if (z.state === 'top') {
          z.y = top;
          z.x = cx + 24;
          damagePlayer(z.dps * dt);
        }
        continue;
      }

      if (z.type === 'spitter') {
        const dist = z.x - z.w / 2 - right;
        z.x = Math.max(z.x, right + z.w / 2);
        if (dist > 250) {
          z.x -= z.speed * mdt;
          z.state = 'walk';
        } else {
          z.state = 'spit';
          z.shootT -= dt;
          if (z.shootT <= 0) {
            z.shootT = 2.4;
            throwGoo(z);
          }
        }
        continue;
      }

      const stopX = right + z.w / 2 + z.jitter;
      if (z.x > stopX) {
        z.x = Math.max(stopX, z.x - z.speed * mdt);
        z.state = 'walk';
      } else {
        z.x = stopX;
        if (z.type === 'climber' && (g.crates.length || g.hasCar)) {
          z.state = 'climb';
          z.y = carTopY();
        } else {
          z.state = 'attack';
          damageTower(z.dps * dt);
        }
      }
    }
  }

  function throwGoo(z) {
    const t = 1.0;
    const x0 = z.x - z.w / 2;
    const y0 = z.y - z.h + 12;
    const tx = towerCX();
    const ty = rand(towerTopY() - 30, GROUND - 20);
    g.goo.push({ x: x0, y: y0, vx: (tx - x0) / t, vy: (ty - y0 - 0.5 * 600 * t * t) / t, dmg: 7 * (1 + 0.3 * (level - 1)) });
  }

  function updateGoo(dt) {
    for (const s of g.goo) {
      s.vy += 600 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x > towerLeft() && s.x < towerRight() && s.y > towerTopY() - 60 && s.y < GROUND) {
        s.dead = true;
        burst(s.x, s.y, '#b5e655', 10, 180, 5);
        damageTower(s.dmg);
      } else if (s.y > GROUND) {
        s.dead = true;
        burst(s.x, GROUND, '#b5e655', 6, 120, 4);
      }
    }
    g.goo = g.goo.filter(s => !s.dead);
  }

  function updateBullets(dt) {
    for (const b of g.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      for (const z of g.zombies) {
        if (z.dead || z.emerge > 0 || b.hits.includes(z)) continue;
        if (b.x > z.x - z.w / 2 && b.x < z.x + z.w / 2 && b.y > z.y - z.h && b.y < z.y) {
          if (b.splash) {
            for (const o of g.zombies) {
              if (o !== z && !o.dead && Math.hypot(o.x - b.x, o.y - o.h / 2 - b.y) < b.splash) hitZombie(o, b.dmg * 0.5);
            }
            burst(b.x, b.y, b.kind === 'rocket' ? '#f97316' : '#a3e635', 18, 260, 6);
            shake(3);
          }
          if (b.freeze) z.slowT = 1.5;
          hitZombie(z, b.dmg);
          b.hits.push(z);
          if (b.hits.length >= b.pierce) {
            b.dead = true;
            break;
          }
        }
      }
      if (b.dead) continue;
      if (g.sourceHp > 0 && b.x > g.sourceX - 50 && b.x < g.sourceX + 50 && b.y > GROUND - 175 && b.y < GROUND) {
        hitSource(b.dmg, b.x, b.y);
        b.dead = true;
        continue;
      }
      if (b.y > GROUND) {
        b.dead = true;
        burst(b.x, GROUND, '#777', 3, 100, 3);
      }
    }
    g.bullets = g.bullets.filter(b => !b.dead);
  }

  function updateParticles(dt) {
    for (const p of g.parts) {
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.blood && p.y > GROUND) {
        p.life = 0;
        if (g.stains.length > 400) g.stains.shift();
        g.stains.push({ x: p.x, y: rand(1, 12), r: p.size * 0.9 });
      } else if (p.grav && p.y > GROUND + 4) { p.y = GROUND + 4; p.vy *= -0.3; p.vx *= 0.6; }
      p.life -= dt;
    }
    g.parts = g.parts.filter(p => p.life > 0);
    for (const t of g.texts) {
      t.y -= 40 * dt;
      t.life -= dt * 0.8;
    }
    g.texts = g.texts.filter(t => t.life > 0);
  }

  function updateCamera(dt) {
    const target = clamp(g.towerX - 180, 0, g.sourceX + 220 - W);
    g.camX += (target - g.camX) * Math.min(1, dt * 5);
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const camX = g.camX;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#1b1030');
    sky.addColorStop(0.6, '#4a1f3d');
    sky.addColorStop(1, '#a8452f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    ctx.fillStyle = '#d9f7b0';
    ctx.beginPath();
    ctx.arc(W - 140, 90, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,200,120,0.4)';
    ctx.beginPath();
    ctx.arc(W - 152, 82, 8, 0, Math.PI * 2);
    ctx.arc(W - 128, 102, 6, 0, Math.PI * 2);
    ctx.fill();

    for (const b of g.far) {
      const x = b.x - camX * 0.25;
      if (x + b.w < 0 || x > W) continue;
      ctx.fillStyle = '#2a1f3d';
      ctx.fillRect(x, GROUND - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(255,220,120,0.25)';
      for (let wy = GROUND - b.h + 12; wy < GROUND - 20; wy += 22) {
        for (let wx = x + 8; wx < x + b.w - 12; wx += 18) {
          if ((wx * 7 + wy * 3 + b.seed) % 5 < 1) ctx.fillRect(wx, wy, 8, 10);
        }
      }
    }
    for (const b of g.near) {
      const x = b.x - camX * 0.55;
      if (x + b.w < 0 || x > W) continue;
      ctx.fillStyle = '#1a1326';
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x, GROUND - b.h);
      ctx.lineTo(x + b.w * 0.3, GROUND - b.h + 20 * b.cut);
      ctx.lineTo(x + b.w * 0.55, GROUND - b.h - 15);
      ctx.lineTo(x + b.w * 0.8, GROUND - b.h + 30 * b.cut);
      ctx.lineTo(x + b.w, GROUND - b.h + 10);
      ctx.lineTo(x + b.w, GROUND);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(140,255,90,0.07)';
    ctx.fillRect(0, GROUND - 60, W, 60);

    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#3d3d44';
    ctx.fillRect(0, GROUND, W, 5);
    ctx.fillStyle = '#b8a447';
    for (let x = -(camX % 80); x < W; x += 80) ctx.fillRect(x, GROUND + 32, 40, 5);
    ctx.fillStyle = '#7a0a10';
    for (const s of g.stains) {
      const x = s.x - camX;
      if (x < -40 || x > W + 40) continue;
      ctx.beginPath();
      ctx.ellipse(x, GROUND + s.y, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of g.props) {
      const x = p.x - camX;
      if (x < -120 || x > W + 120) continue;
      block(x - 12, GROUND - 32, 24, 32, '#4a5a6a');
      ctx.fillStyle = '#8a9aa8';
      ctx.fillRect(x - 12, GROUND - 22, 24, 4);
    }
    for (const c of g.cones) {
      const x = c - camX;
      if (x < -40 || x > W + 40) continue;
      if (c === g.cones[0] && mode === 'play') {
        ctx.fillStyle = g.rolling ? 'rgba(255,90,90,0.35)' : 'rgba(255,159,28,0.25)';
        ctx.beginPath();
        ctx.ellipse(x, GROUND - 2, 26, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(x - 13, GROUND);
      ctx.lineTo(x - 3, GROUND - 32);
      ctx.lineTo(x + 3, GROUND - 32);
      ctx.lineTo(x + 13, GROUND);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 7, GROUND - 18, 14, 5);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(x - 16, GROUND - 3, 32, 3);
    }
  }

  function drawPotty() {
    const x = g.sourceX - g.camX;
    if (x < -150 || x > W + 150) return;
    const w = 100;
    const h = 170;
    const left = x - w / 2;
    const top = GROUND - h;
    if (g.sourceHp <= 0) {
      block(left - 10, GROUND - 26, 50, 26, '#2f6fb5');
      block(left + 50, GROUND - 18, 60, 18, '#245a96');
      block(left + 20, GROUND - 40, 30, 14, '#ddd');
      return;
    }
    // Green glow
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 4);
    ctx.fillStyle = `rgba(140,255,90,${0.12 + 0.12 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(x, GROUND - h / 2, w * 0.95, h * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Booth
    block(left, top + 14, w, h - 14, '#2f6fb5');
    ctx.fillStyle = '#245a96';
    ctx.beginPath();
    ctx.moveTo(left - 6, top + 16);
    ctx.lineTo(x, top - 4);
    ctx.lineTo(left + w + 6, top + 16);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Door, swings open when zombies come out
    const open = g.doorT > 0 ? 1 : 0;
    ctx.fillStyle = '#0d1a0a';
    ctx.fillRect(left + 12, top + 28, w - 24, h - 34);
    if (open) {
      ctx.fillStyle = 'rgba(140,255,90,0.6)';
      ctx.fillRect(left + 12, top + 28, w - 24, h - 34);
      block(left - 22, top + 28, 34, h - 34, '#3a80c9');
    } else {
      block(left + 12, top + 28, w - 24, h - 34, '#3a80c9');
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.arc(x, top + 48, 9, 0.6, Math.PI * 2 - 0.6);
      ctx.fill();
      block(left + w - 26, top + 90, 8, 18, '#ccc');
    }
    // Stink lines
    ctx.strokeStyle = 'rgba(160,255,110,0.7)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const sx = left + 20 + i * 30;
      const off = (g.time * 30 + i * 20) % 40;
      ctx.beginPath();
      ctx.moveTo(sx, top - 6 - off);
      ctx.quadraticCurveTo(sx + 8, top - 16 - off, sx, top - 26 - off);
      ctx.stroke();
    }
    // Health bar
    const bw = 120;
    block(x - bw / 2, top - 58, bw, 12, '#330');
    ctx.fillStyle = '#8cff5a';
    ctx.fillRect(x - bw / 2 + 2, top - 56, (bw - 4) * Math.max(0, g.sourceHp / g.sourceMax), 8);
  }

  function drawCar() {
    if (!g.hasCar) return;
    const car = CARS[build.car];
    const x = g.towerX - g.camX;
    const y = GROUND - CAR_H;
    const flash = g.hurtT > 0 && !g.crates.length;
    const body = flash ? '#fff' : car.color;
    if (car.tank) {
      block(x + 4, GROUND - 22, CAR_W - 8, 22, '#222');
      ctx.fillStyle = '#555';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + 18 + i * (CAR_W - 36) / 4, GROUND - 11, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      block(x, y, CAR_W, CAR_H - 20, body);
    } else if (car.hover) {
      const bob = Math.sin(g.time * 6) * 3;
      ctx.fillStyle = 'rgba(160,120,255,0.5)';
      ctx.fillRect(x + 14, GROUND - 14, CAR_W - 28, 10);
      block(x, y + bob, CAR_W, CAR_H - 16, body);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(x + 10, y + 16 + bob, CAR_W - 20, 4);
    } else {
      const wheelR = car.big ? 16 : 12;
      block(x, y + 4, CAR_W, CAR_H - wheelR - 6, body);
      block(x + CAR_W - 10, y + 10, 10, 10, '#ffe680');
      const wheels = car.wheels === 3 ? [20, CAR_W / 2, CAR_W - 20] : [22, CAR_W - 22];
      for (const wx of wheels) {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + wx, GROUND - wheelR, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 2; k++) {
          const a = g.wheel + k * Math.PI / 2;
          ctx.moveTo(x + wx - Math.cos(a) * wheelR * 0.6, GROUND - wheelR - Math.sin(a) * wheelR * 0.6);
          ctx.lineTo(x + wx + Math.cos(a) * wheelR * 0.6, GROUND - wheelR + Math.sin(a) * wheelR * 0.6);
        }
        ctx.stroke();
      }
    }
    drawSplats(g.carSplats, x, y);
    if (car.spikes) {
      ctx.fillStyle = '#ccc';
      for (let i = 0; i < 3; i++) {
        const sy = y + 10 + i * 10;
        ctx.beginPath();
        ctx.moveTo(x + CAR_W, sy);
        ctx.lineTo(x + CAR_W + 14, sy + 4);
        ctx.lineTo(x + CAR_W, sy + 8);
        ctx.fill();
      }
    }
  }

  function drawCrates() {
    const cx = towerCX() - g.camX;
    g.crates.forEach((c, i) => {
      const M = CRATES[c.m];
      const x = cx - BOX_W / 2;
      const y = crateY(i);
      const flash = i === 0 && g.hurtT > 0;
      block(x, y, BOX_W, BOX_H, flash ? '#fff' : M.fill, M.edge);
      ctx.strokeStyle = M.edge;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 5, y + 5, BOX_W - 10, BOX_H - 10);
      if (c.m === 0) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6);
        ctx.lineTo(x + BOX_W - 6, y + BOX_H - 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = M.edge;
        for (const [rx, ry] of [[9, 9], [BOX_W - 9, 9], [9, BOX_H - 9], [BOX_W - 9, BOX_H - 9]]) {
          ctx.beginPath();
          ctx.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = M.shine;
        ctx.fillRect(x + 10, y + 12, 6, BOX_H - 24);
      }
      if (c.hp < c.max * 0.6) {
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 2);
        ctx.lineTo(x + 26, y + 16);
        ctx.lineTo(x + 20, y + 26);
        if (c.hp < c.max * 0.3) {
          ctx.moveTo(x + BOX_W - 8, y + BOX_H - 2);
          ctx.lineTo(x + BOX_W - 20, y + 24);
          ctx.lineTo(x + BOX_W - 14, y + 14);
        }
        ctx.stroke();
      }
      drawSplats(c.splats, x, y);
      if (c.blaster !== null) {
        const B = BLASTERS[c.blaster];
        const px = x + BOX_W + 4;
        const py = y + BOX_H / 2;
        block(x + BOX_W - 8, py - 9, 16, 18, '#374151');
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(c.ang);
        block(0, -B.thick / 2, B.len, B.thick, '#6b7280');
        ctx.fillStyle = B.color;
        ctx.fillRect(B.len - 5, -B.thick / 2 + 1, 5, B.thick - 2);
        ctx.restore();
      }
    });
  }

  function drawGun(gun) {
    const r = -g.recoil * 3;
    const end = 14 + gun.len + r;
    if (gun.stock) block(4 + r, -4, 12, 8, '#7a4f20');
    block(14 + r, -5, gun.len, 9, gun.color);
    block(16 + r, 2, 6, 8, '#222');
    if (gun.mag) block(24 + r, 3, 6, 10, '#111');
    if (gun.spam) {
      ctx.fillStyle = '#999';
      ctx.fillRect(end, -5, 8, 2);
      ctx.fillRect(end, -1, 8, 2);
      ctx.fillRect(end, 3, 8, 2);
    }
    if (gun.sniper) {
      block(22 + r, -11, 14, 6, '#111');
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(34 + r, -10, 2, 4);
      ctx.fillStyle = '#333';
      ctx.fillRect(end, -2, 8, 3);
    }
    if (gun.laser || gun.plasma) {
      ctx.fillStyle = gun.plasma ? '#ecfccb' : '#bae6fd';
      ctx.fillRect(end - 6, -3, 6, 5);
    }
  }

  function drawPlayer() {
    const cx = towerCX() - g.camX;
    const feet = towerTopY();
    const ang = aimAngle();
    const face = Math.cos(ang) >= 0 ? 1 : -1;
    const dead = g.playerHp <= 0;
    const skin = g.hurtT > 0 && !g.crates.length && !g.hasCar ? '#fff' : '#f1c27d';
    ctx.save();
    if (dead) {
      ctx.translate(cx, feet);
      ctx.rotate(-Math.PI / 2 * face);
      ctx.translate(-cx, -feet);
    }
    block(cx - 10, feet - 20, 9, 20, '#2d3a6b');
    block(cx + 1, feet - 20, 9, 20, '#2d3a6b');
    block(cx - 11, feet - 42, 22, 23, '#2f8fd8');
    block(cx - 10, feet - 62, 20, 20, skin);
    block(cx - 10, feet - 62, 20, 6, '#5a3820');
    ctx.fillStyle = '#111';
    ctx.fillRect(cx + face * 4 - 1, feet - 52, 3, 4);
    ctx.fillRect(cx + face * -2 - 1, feet - 52, 3, 4);
    drawSplats(g.playerSplats, cx, feet);
    if (!dead) {
      ctx.save();
      ctx.translate(cx, feet - 38);
      ctx.rotate(ang);
      if (face < 0) ctx.scale(1, -1);
      drawGun(GUNS[build.gun]);
      drawSplats(g.gunSplats, -g.recoil * 3, 0);
      block(-3, -4, 20, 8, '#2f8fd8');
      block(14, -4, 7, 8, '#f1c27d');
      ctx.restore();
    }
    ctx.restore();
  }

  function drawZombie(z) {
    const sx = z.x - g.camX;
    if (sx < -120 || sx > W + 120) return;
    const T = TYPES[z.type];
    const skin = z.hitT > 0 ? '#ffffff' : z.slowT > 0 ? '#9fd8ff' : T.skin;
    const y = z.y;
    ctx.save();
    if (z.emerge > 0) ctx.globalAlpha = clamp(1 - z.emerge / 0.5, 0.15, 1);

    if (z.type === 'flyer') {
      const flap = Math.sin(z.phase * 2) * 10;
      ctx.fillStyle = '#3b2d4a';
      ctx.beginPath();
      ctx.moveTo(sx - 4, y - 14);
      ctx.lineTo(sx - 30, y - 22 - flap);
      ctx.lineTo(sx - 18, y - 8);
      ctx.moveTo(sx + 4, y - 14);
      ctx.lineTo(sx + 30, y - 22 - flap);
      ctx.lineTo(sx + 18, y - 8);
      ctx.fill();
      block(sx - 12, y - 22, 24, 22, skin);
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(sx - 8, y - 16, 4, 4);
      ctx.fillRect(sx + 1, y - 16, 4, 4);
      ctx.fillStyle = '#300';
      ctx.fillRect(sx - 6, y - 8, 12, 3);
    } else {
      const w = z.w;
      const h = z.h;
      const legH = h * 0.32;
      const bodyH = h * 0.36;
      const hs = Math.min(w, h * 0.32);
      const walking = z.state === 'walk';
      const swing = walking ? Math.sin(z.phase) * 4 : 0;
      block(sx - w / 2 + 2, y - legH - swing * 0.3, w / 2 - 3, legH + swing * 0.3, '#3a3a4a');
      block(sx + 1, y - legH + swing * 0.3, w / 2 - 3, legH - swing * 0.3, '#3a3a4a');
      const bodyTop = y - legH - bodyH;
      block(sx - w / 2, bodyTop, w, bodyH, T.shirt);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(sx - w / 2 + 4, bodyTop + bodyH - 8, w * 0.4, 5);
      const headTop = bodyTop - hs;
      block(sx - hs / 2, headTop, hs, hs, skin);
      ctx.fillStyle = '#ff2a2a';
      const e = Math.max(3, hs * 0.16);
      ctx.fillRect(sx - hs / 2 + hs * 0.15, headTop + hs * 0.3, e, e);
      ctx.fillRect(sx - hs / 2 + hs * 0.5, headTop + hs * 0.3, e, e);
      ctx.fillStyle = z.type === 'spitter' ? '#b5e655' : '#300';
      ctx.fillRect(sx - hs / 2 + hs * 0.15, headTop + hs * 0.68, hs * 0.5, z.type === 'spitter' ? e * 1.5 : e * 0.8);
      if (z.type === 'boss') {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(sx - hs / 2, headTop);
        ctx.lineTo(sx - hs / 2, headTop - 14);
        ctx.lineTo(sx - hs / 4, headTop - 6);
        ctx.lineTo(sx, headTop - 16);
        ctx.lineTo(sx + hs / 4, headTop - 6);
        ctx.lineTo(sx + hs / 2, headTop - 14);
        ctx.lineTo(sx + hs / 2, headTop);
        ctx.fill();
      }
      const armLen = w * 0.75;
      const armH = Math.max(6, w * 0.24);
      if (z.state === 'climb' || z.state === 'top') {
        block(sx - w / 2 - 2, bodyTop - armLen + 4, armH, armLen, skin);
        block(sx + w / 2 - armH + 2, bodyTop - armLen + 8 + swing, armH, armLen, skin);
      } else {
        const reach = z.state === 'attack' ? Math.sin(z.phase * 1.5) * 4 : swing * 0.5;
        block(sx - w / 2 - armLen + reach, bodyTop + 4, armLen, armH, skin);
        block(sx - w / 2 - armLen + 6 - reach, bodyTop + 4 + armH + 2, armLen - 6, armH, skin);
      }
    }
    if (z.type !== 'flyer') drawSplats(z.splats, sx, y);
    ctx.restore();
    if (z.hp < z.maxHp && z.emerge <= 0) {
      const bw = Math.max(26, z.w);
      ctx.fillStyle = '#300';
      ctx.fillRect(sx - bw / 2, y - z.h - 12, bw, 4);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(sx - bw / 2, y - z.h - 12, bw * Math.max(0, z.hp / z.maxHp), 4);
    }
  }

  function drawShots() {
    for (const b of g.bullets) {
      const x = b.x - g.camX;
      if (b.kind === 'laser') {
        ctx.strokeStyle = b.color || '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, b.y);
        ctx.lineTo(x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.stroke();
      } else if (b.kind === 'flame') {
        const grow = 1 - b.life / 0.55;
        ctx.globalAlpha = clamp(b.life / 0.55, 0, 1);
        ctx.fillStyle = grow < 0.4 ? '#fde047' : '#fb923c';
        ctx.beginPath();
        ctx.arc(x, b.y, 4 + grow * 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (b.kind === 'rocket') {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(x, b.y);
        ctx.rotate(a);
        block(-12, -4, 16, 8, '#e5e7eb');
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(4, -4, 5, 8);
        ctx.fillStyle = '#fb923c';
        ctx.fillRect(-18, -2, 6, 4);
        ctx.restore();
      } else if (b.kind === 'plasma') {
        ctx.fillStyle = '#a3e635';
        ctx.beginPath();
        ctx.arc(x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ecfccb';
        ctx.beginPath();
        ctx.arc(x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = b.color || '#ffe680';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, b.y);
        ctx.lineTo(x - b.vx * 0.012, b.y - b.vy * 0.012);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#b5e655';
    for (const s of g.goo) {
      ctx.beginPath();
      ctx.arc(s.x - g.camX, s.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of g.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - g.camX - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    for (const t of g.texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, t.x - g.camX + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x - g.camX, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function hudBar(x, y, w, label, value, max, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(value / max, 0, 1), 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${label} ${Math.ceil(Math.max(0, value))}/${Math.ceil(max)}`, x + 6, y + 15);
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, 64);
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8cff5a';
    ctx.fillText(`Level ${level}`, 14, 26);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`🪙 ${coins}`, 14, 52);

    const c = g.crates[0];
    if (c) hudBar(130, 8, 210, `Bottom ${CRATES[c.m].name} (${g.crates.length})`, c.hp, c.max, '#d19a55');
    else hudBar(130, 8, 210, 'Crates: none left!', 0, 1, '#d19a55');
    if (g.hasCar) hudBar(130, 34, 210, CARS[build.car].name, g.carHp, g.carMax, '#60a5fa');
    else hudBar(130, 34, 210, 'Car: wrecked!', 0, 1, '#60a5fa');
    hudBar(350, 8, 190, 'You', g.playerHp, PLAYER_MAX_HP, '#ff5a5a');
    ctx.fillStyle = '#ddd';
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.fillText(`🔫 ${GUNS[build.gun].name}`, 352, 50);

    hudBar(W - 250, 8, 236, '🚽 Porta Potty', g.sourceHp, g.sourceMax, '#8cff5a');
    const start = 120;
    const prog = clamp((g.towerX - start) / (g.sourceX - 230 - CAR_W - start), 0, 1);
    const tx = W - 250;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(tx, 42, 236, 4);
    ctx.font = '14px sans-serif';
    ctx.fillText('🚗', tx - 6 + prog * 220, 52);
    ctx.fillText('🚽', tx + 222, 52);
  }

  function render() {
    ctx.save();
    if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
    drawBackground();
    drawPotty();
    drawCar();
    drawCrates();
    drawPlayer();
    for (const z of g.zombies) drawZombie(z);
    drawShots();
    ctx.restore();
    if (mode !== 'start') drawHud();
    if (g.hurtT > 0 && !g.crates.length && !g.hasCar) {
      ctx.fillStyle = 'rgba(255,0,0,0.15)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- Shop ----------
  function shopItems(tab) {
    const items = [];
    const n = build.crates.length;
    if (tab === 'crates') {
      CRATES.forEach((M, m) => {
        let note = `+${M.hp} health. Stacks your tower higher.`;
        let can = true;
        if (!build.car) { note = 'Buy a car first — crates sit on your car.'; can = false; }
        else if (n >= MAX_CRATES) {
          const weakest = Math.min(...build.crates.map(c => c.m));
          if (weakest >= m) { note = 'Tower is full!'; can = false; }
          else note = `Tower full: swaps out a ${CRATES[weakest].name}.`;
        }
        items.push({
          icon: M.icon, name: M.name, desc: note, cost: M.cost, can,
          buy() {
            if (build.crates.length >= MAX_CRATES) {
              const weakest = Math.min(...build.crates.map(c => c.m));
              const slot = build.crates.find(c => c.m === weakest);
              slot.m = m;
            } else {
              build.crates.push({ m, blaster: null });
            }
          }
        });
      });
    } else if (tab === 'blasters') {
      BLASTERS.forEach((B, b) => {
        const have = build.crates.filter(c => c.blaster === b).length;
        const free = build.crates.find(c => c.blaster === null);
        const weaker = build.crates.some(c => c.blaster !== null && c.blaster < b);
        let note = `${B.about} ${B.dmg} damage.` + (have ? ` You have ${have}.` : '');
        if (!build.crates.length) note = 'Buy a crate first — blasters sit on crates.';
        else if (!free && !weaker) note = 'Every crate already has a blaster this good. Buy more crates!';
        else if (!free) note = `${B.about} Swaps out a weaker blaster.`;
        items.push({
          icon: B.icon, name: B.name, desc: note, cost: B.cost,
          can: !!free || weaker,
          buy() {
            // Use the strongest empty crate, or swap out the weakest blaster.
            let pick = null;
            for (const c of build.crates) if (c.blaster === null && (!pick || c.m > pick.m)) pick = c;
            if (!pick) {
              for (const c of build.crates) if (c.blaster < b && (!pick || c.blaster < pick.blaster)) pick = c;
            }
            pick.blaster = b;
          }
        });
      });
    } else if (tab === 'cars') {
      CARS.forEach((car, i) => {
        if (!car) return;
        const owned = build.car === i;
        items.push({
          icon: car.tank ? '🪖' : car.hover ? '🛸' : '🚗', name: car.name,
          desc: owned ? '✔ This is your car.' : `${car.hp} health. Tougher for zombies to wreck.`,
          cost: car.cost, can: !owned,
          buy() { build.car = i; }
        });
      });
    } else {
      let lastCat = '';
      GUNS.forEach((gun, i) => {
        if (gun.cat !== lastCat) {
          lastCat = gun.cat;
          items.push({ header: gun.cat });
        }
        const owned = build.gun === i;
        const dps = Math.round(gun.dmg * gun.shots / gun.rate);
        items.push({
          icon: { Pistols: '🔫', MGs: '💥', Shotguns: '🧨', 'Spamming Guns': '🌀', Snipers: '🎯', Special: '☢️' }[gun.cat], name: gun.name,
          desc: owned ? '✔ In your hands.' : `${gun.dmg} damage${gun.shots > 1 ? ' x' + gun.shots : ''} per shot (${dps} per second).`,
          cost: gun.cost, can: !owned,
          buy() { build.gun = i; }
        });
      });
    }
    return items;
  }

  function renderShop() {
    buildLevelEl.textContent = `Next up: Level ${level}  •  Porta potty health: ${pottyHp(level)}`;
    buildCoinsEl.textContent = `🪙 ${coins} coins`;
    buildTipEl.textContent = NEW_ZOMBIE_TIPS[level] ||
      (level % 3 === 0 ? 'A BOSS zombie comes out this level!' : 'The zombies are tougher and hit harder now!');
    shopEl.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'shop-tabs';
    for (const [id, label] of [['crates', '📦 Crates'], ['blasters', '🔫 Blasters'], ['cars', '🚗 Cars'], ['guns', '💥 Guns']]) {
      const t = document.createElement('button');
      t.type = 'button';
      // A tab lights up when it has something you can afford.
      const deal = shopItems(id).some(item => !item.header && item.can && coins >= item.cost);
      t.className = 'shop-tab' + (shopTab === id ? ' selected' : '') + (deal ? ' has-deal' : '');
      t.textContent = label;
      t.addEventListener('click', () => { shopTab = id; renderShop(); });
      tabs.appendChild(t);
    }
    shopEl.appendChild(tabs);
    for (const item of shopItems(shopTab)) {
      if (item.header) {
        const h = document.createElement('div');
        h.className = 'shop-header';
        h.textContent = item.header;
        shopEl.appendChild(h);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-item';
      btn.disabled = !item.can || coins < item.cost;
      btn.classList.toggle('affordable', !btn.disabled);
      btn.innerHTML = `<span class="shop-icon"></span><span class="shop-text"><span class="shop-name"></span><span class="shop-desc"></span></span><span class="shop-cost"></span>`;
      btn.querySelector('.shop-icon').textContent = item.icon;
      btn.querySelector('.shop-name').textContent = item.name;
      btn.querySelector('.shop-desc').textContent = item.desc;
      btn.querySelector('.shop-cost').textContent = item.cost ? `🪙 ${item.cost}` : 'Free';
      btn.addEventListener('click', () => {
        if (coins < item.cost || !item.can) return;
        coins -= item.cost;
        item.buy();
        newLevel();
        g.zombies = [];
        renderShop();
      });
      shopEl.appendChild(btn);
    }
  }

  // ---------- Flow ----------
  function showBuild() {
    mode = 'build';
    newLevel();
    g.zombies = [];
    resultOverlay.classList.add('hidden');
    startOverlay.classList.add('hidden');
    buildOverlay.classList.remove('hidden');
    renderShop();
  }

  function startRun() {
    level = 1;
    coins = 0;
    build = freshBuild();
    shopTab = 'crates';
    showBuild();
  }

  function driveOut() {
    buildOverlay.classList.add('hidden');
    newLevel();
    mode = 'play';
    mouse.down = false;
  }

  function setPaused(p) {
    if (p && mode === 'play') {
      mode = 'paused';
      pauseOverlay.classList.remove('hidden');
    } else if (!p && mode === 'paused') {
      mode = 'play';
      pauseOverlay.classList.add('hidden');
    }
  }

  document.getElementById('start-button').addEventListener('click', startRun);
  document.getElementById('go-button').addEventListener('click', driveOut);
  document.getElementById('resume-button').addEventListener('click', () => setPaused(false));
  nextButton.addEventListener('click', () => { level++; showBuild(); });
  // Dying sends you back to level 1, but you keep everything you bought.
  restartButton.addEventListener('click', () => { level = 1; showBuild(); });

  // ---------- Input ----------
  function setKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === ' ') keys.fire = down;
    else return false;
    return true;
  }

  window.addEventListener('keydown', e => {
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && !e.repeat) {
      setPaused(mode === 'play');
      return;
    }
    if (setKey(e, true) && mode === 'play') e.preventDefault();
  });
  window.addEventListener('keyup', e => setKey(e, false));
  window.addEventListener('blur', () => {
    keys.fire = false;
    mouse.down = false;
    setPaused(true);
  });

  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * W / r.width;
    mouse.y = (e.clientY - r.top) * H / r.height;
  }
  canvas.addEventListener('pointermove', setMouse);
  canvas.addEventListener('pointerdown', e => {
    setMouse(e);
    mouse.down = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => { mouse.down = false; });
  canvas.addEventListener('pointercancel', () => { mouse.down = false; });

  // ---------- Loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === 'play' || mode === 'ending' || mode === 'lost') update(dt);
    else if (mode === 'build' || mode === 'start') g.time += dt;
    render();
    requestAnimationFrame(loop);
  }

  bestLine.textContent = best ? `Your best: cleared level ${best}` : '';
  build = freshBuild();
  newLevel();
  requestAnimationFrame(loop);
})();
