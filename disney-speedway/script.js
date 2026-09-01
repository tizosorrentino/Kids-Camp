'use strict';

/* =========================================================================
   DISNEY SPEEDWAY
   A pseudo-3D (SNES "Mode 7"-style) racer in the spirit of F-Zero, starring
   a roster of original Disney/Pixar-inspired go-kart racers.

   The road is built from a long strip of straight "segments". Each frame we
   project the upcoming segments from 3D world space onto the 2D screen with
   a simple perspective divide, then paint them as trapezoids from farthest
   to nearest (a classic "pseudo-3D racer" technique). Curves are simulated
   by shifting each segment's horizontal screen offset by an accumulating
   amount, without needing any real 3D engine.
   ========================================================================= */

/* ---------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------- */

const SEGMENT_LENGTH = 200;      // world length of one road segment
const RUMBLE_LENGTH = 3;         // segments per rumble-strip stripe
const ROAD_WIDTH = 2000;         // world half-width of the road
const LANES = 3;

const FIELD_OF_VIEW = 100;       // degrees
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
const DRAW_DISTANCE = 180;       // segments rendered ahead of the camera

const TOTAL_LAPS = 3;
const BASE_MAX_SPEED = 9200;         // world units / second
const CENTRIFUGAL_BASE = 0.32;
const OFFROAD_MAX_SPEED_FACTOR = 0.55;
const BRAKE_RATE = 9200;
const COAST_DECEL = 2100;
const OFFROAD_DECEL = 6200;
const BOOST_COST = 26;               // energy
const BOOST_COOLDOWN = 1.3;          // seconds
const BOOST_DURATION = 0.9;          // seconds the boosted cap lasts
const ENERGY_MAX = 100;
const ENERGY_REGEN = 8.5;            // per second
const RAIL_HIT_DAMAGE = 16;
const RAIL_X = 1.9;                  // |x| beyond this hits the guard rail
const CAR_COLLIDE_Z = 260;
const CAR_COLLIDE_X = 0.55;

const DRIFT_MIN_SPEED_FACTOR = 0.35; // must be going at least this fast (% of max) to drift
const DRIFT_STEER_MULT = 1.6;        // turn tighter while drifting
const DRIFT_CENTRIFUGAL_MULT = 0.5;  // and slide out less
const DRIFT_TIERS = [
  { time: 0.6, boost: 1800, color: '#4da6ff', label: 'Mini Boost!' },
  { time: 1.3, boost: 3200, color: '#ff9a3c', label: 'Super Boost!' },
  { time: 2.0, boost: 4800, color: '#ff5ad1', label: 'Mega Boost!' }
];

const COLORS = {
  sky1: '#1a1350',
  sky2: '#3a2472',
  roadLight: '#4a4066',
  roadDark: '#443c5e',
  rumbleLight: '#f4f4f4',
  rumbleDark: '#c94f6d',
  grassLight: '#2c8f4f',
  grassDark: '#267b44',
  laneMarker: '#f4f4f4'
};

/* ---------------------------------------------------------------------
   Racer roster
   --------------------------------------------------------------------- */

const CHARACTERS = [
  { id: 'mickey', name: 'Mickey', subtitle: 'Magic Kingdom', emoji: '🐭',
    body: '#e0393e', accent: '#1a1a1a', stats: { speed: 3, accel: 4, handling: 4, boost: 3 } },
  { id: 'racer95', name: 'Speedy 95', subtitle: 'Radiator Springs', emoji: '🏎️',
    body: '#d61f26', accent: '#ffd23f', stats: { speed: 5, accel: 3, handling: 2, boost: 4 } },
  { id: 'elsa', name: 'Elsa', subtitle: 'Arendelle', emoji: '❄️',
    body: '#a7e8ff', accent: '#ffffff', stats: { speed: 3, accel: 3, handling: 5, boost: 3 } },
  { id: 'stitch', name: 'Stitch', subtitle: 'Hawaii', emoji: '👽',
    body: '#3b6fd6', accent: '#0a2a6b', stats: { speed: 3, accel: 5, handling: 2, boost: 4 } },
  { id: 'simba', name: 'Simba', subtitle: 'Pride Lands', emoji: '🦁',
    body: '#f2a53c', accent: '#8a4b12', stats: { speed: 4, accel: 4, handling: 3, boost: 3 } },
  { id: 'buzz', name: 'Star Ranger', subtitle: 'Space Command', emoji: '🚀',
    body: '#3a4a9f', accent: '#5fe07a', stats: { speed: 4, accel: 2, handling: 3, boost: 5 } },
  { id: 'ariel', name: 'Ariel', subtitle: 'Under the Sea', emoji: '🧜‍♀️',
    body: '#3fc6c1', accent: '#7a2b8f', stats: { speed: 2, accel: 4, handling: 5, boost: 3 } },
  { id: 'genie', name: 'Genie', subtitle: 'Agrabah', emoji: '🧞',
    body: '#4fc3f7', accent: '#ffd23f', stats: { speed: 4, accel: 3, handling: 4, boost: 4 } }
];

const RECORDS_KEY = 'disneySpeedway.records';

/* ---------------------------------------------------------------------
   DOM references
   --------------------------------------------------------------------- */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const hud = document.getElementById('hud');
const speedValue = document.getElementById('speed-value');
const lapValue = document.getElementById('lap-value');
const placeValue = document.getElementById('place-value');
const timeValue = document.getElementById('time-value');
const energyFill = document.getElementById('energy-bar-fill');
const pauseButton = document.getElementById('pause-button');

const menuOverlay = document.getElementById('menu-overlay');
const characterGrid = document.getElementById('character-grid');
const startRaceButton = document.getElementById('start-race-button');

const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');

const pauseOverlay = document.getElementById('pause-overlay');
const resumeButton = document.getElementById('resume-button');
const quitButton = document.getElementById('quit-button');

const resultsOverlay = document.getElementById('results-overlay');
const resultsTitle = document.getElementById('results-title');
const resultsList = document.getElementById('results-list');
const resultsBestLap = document.getElementById('results-best-lap');
const raceAgainButton = document.getElementById('race-again-button');
const changeRacerButton = document.getElementById('change-racer-button');

const fxLayer = document.getElementById('fx-layer');

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnAccel = document.getElementById('btn-accel');
const btnBrake = document.getElementById('btn-brake');
const btnBoost = document.getElementById('btn-boost');
const btnDrift = document.getElementById('btn-drift');

/* ---------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------- */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, pct) {
  return a + (b - a) * pct;
}

function easeIn(a, b, pct) {
  return a + (b - a) * Math.pow(pct, 2);
}

function easeInOut(a, b, pct) {
  return a + (b - a) * ((1 - Math.cos(pct * Math.PI)) / 2);
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    /* storage unavailable, ignore */
  }
}

function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.-';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes + ':' + seconds.toFixed(1).padStart(4, '0');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------------------------------------------------------------------
   Track construction
   --------------------------------------------------------------------- */

let segments = [];
let trackLength = 0;

function addSegment(curve) {
  const n = segments.length;
  segments.push({
    index: n,
    p1: { world: { z: n * SEGMENT_LENGTH }, screen: {} },
    p2: { world: { z: (n + 1) * SEGMENT_LENGTH }, screen: {} },
    curve: curve,
    color: Math.floor(n / RUMBLE_LENGTH) % 2 === 0 ? 'light' : 'dark'
  });
}

function addRoad(enterLen, holdLen, leaveLen, curve) {
  for (let i = 0; i < enterLen; i++) addSegment(easeIn(0, curve, i / enterLen));
  for (let i = 0; i < holdLen; i++) addSegment(curve);
  for (let i = 0; i < leaveLen; i++) addSegment(easeInOut(curve, 0, i / leaveLen));
}

function addStraight(num) {
  for (let i = 0; i < num; i++) addSegment(0);
}

function addCurve(num, curve) {
  // addRoad eases in/holds/eases out over three legs, so split the
  // requested total length into thirds rather than tripling it.
  const third = Math.round(num / 3);
  addRoad(third, num - third * 2, third, curve);
}

function buildTrack() {
  segments = [];
  addStraight(180);       // Main Street start/finish straight
  addCurve(180, 3);        // Fantasyland sweep
  addStraight(60);
  addCurve(120, -5);       // Adventureland esses
  addCurve(120, 5);
  addStraight(90);
  addCurve(200, -7);       // Frontierland hairpin
  addStraight(120);
  addCurve(90, 4);         // Tomorrowland esses
  addCurve(90, -4);
  addStraight(60);
  addCurve(150, 6);        // final sweeping hairpin back home
  addStraight(240);        // long back straight with boost pads

  trackLength = segments.length * SEGMENT_LENGTH;

  // Boost pads: a few chevrons placed at fun spots on the track.
  const boostAt = [40, 200 + 30, 950 + 40, 1460 + 100];
  segments.forEach((s) => { s.boostPad = false; });
  boostAt.forEach((idx) => {
    if (segments[idx]) segments[idx].boostPad = true;
  });

  // Roadside scenery, themed by section, purely decorative.
  const themeZones = [
    { start: 0, end: 180, props: ['🏰', '🎈'] },
    { start: 180, end: 360, props: ['🌸', '🎠'] },
    { start: 360, end: 600, props: ['🌴', '🗿'] },
    { start: 600, end: 950, props: ['🌵', '🪵'] },
    { start: 950, end: 1160, props: ['🚀', '⭐'] },
    { start: 1160, end: 1310, props: ['❄️', '💎'] },
    { start: 1310, end: segments.length, props: ['🎉', '🏁'] }
  ];
  segments.forEach((s, i) => {
    s.prop = null;
    if (i % 14 !== 0) return;
    const zone = themeZones.find((z) => i >= z.start && i < z.end) || themeZones[0];
    const side = (Math.floor(i / 14) % 2 === 0) ? -1 : 1;
    s.prop = { emoji: zone.props[Math.floor(i / 14) % zone.props.length], side };
  });
}

function findSegment(z) {
  const wrapped = ((z % trackLength) + trackLength) % trackLength;
  return segments[Math.floor(wrapped / SEGMENT_LENGTH) % segments.length];
}

/* ---------------------------------------------------------------------
   Projection
   --------------------------------------------------------------------- */

function project(p, cameraX, cameraZ, width, height, roadWidth) {
  const camX = (p.world.x || 0) - cameraX;
  const camZ = p.world.z - cameraZ;
  const scale = CAMERA_DEPTH / Math.max(camZ, 1);
  p.camZ = camZ;
  p.screen.scale = scale;
  p.screen.x = Math.round((width / 2) + (scale * camX * width / 2));
  p.screen.y = Math.round((height / 2) - (scale * -CAMERA_HEIGHT * height / 2));
  p.screen.w = Math.round(scale * roadWidth * width / 2);
}

/* ---------------------------------------------------------------------
   Race state
   --------------------------------------------------------------------- */

const keys = { left: false, right: false, accel: false, brake: false, boost: false, drift: false };

const state = {
  screen: 'menu',          // menu | countdown | racing | paused | results
  selectedId: CHARACTERS[0].id,
  cars: [],
  player: null,
  raceTime: 0,
  countdown: 3,
  bgOffset: 0,
  records: loadRecords()
};

function statFactor(stat, min, max) {
  // stat is 1..5
  return min + (max - min) * ((stat - 1) / 4);
}

function makeCar(character, isPlayer, laneIndex, totalCars) {
  const stats = character.stats;
  const maxSpeed = BASE_MAX_SPEED * statFactor(stats.speed, 0.82, 1.16);
  const accelRate = 3600 + stats.accel * 950;
  const steerResponsiveness = statFactor(stats.handling, 0.72, 1.12);
  const centrifugal = CENTRIFUGAL_BASE / steerResponsiveness;
  const boostKick = 2500 + stats.boost * 520;

  // Spread starting lane positions across the road, staggered in z so no
  // two racers start stacked on top of each other.
  const spread = (laneIndex - (totalCars - 1) / 2) / totalCars;

  return {
    character,
    isPlayer,
    x: spread * 1.4,
    z: -laneIndex * 320,
    lap: 1,
    speed: 0,
    maxSpeed,
    accelRate,
    steerResponsiveness,
    centrifugal,
    boostKick,
    energy: ENERGY_MAX,
    boostCooldown: 0,
    boostTimer: 0,
    spinTimer: 0,
    finished: false,
    finishTime: null,
    laneOffset: spread * 1.3,
    aiWeave: Math.random() * Math.PI * 2,
    lapStart: 0,
    bestLapMs: null,
    consumedPads: new Set(),
    isDrifting: false,
    driftDir: 0,
    driftCharge: 0
  };
}

function setupRace() {
  const selected = CHARACTERS.find((c) => c.id === state.selectedId) || CHARACTERS[0];
  const order = CHARACTERS.filter((c) => c.id !== selected.id);
  const roster = [selected, ...order];
  state.cars = roster.map((c, i) => makeCar(c, c.id === selected.id, i, roster.length));
  state.player = state.cars.find((c) => c.isPlayer);
  state.raceTime = 0;
  state.bgOffset = 0;
  state.cars.forEach((c) => { c.lapStart = 0; });
}

/* ---------------------------------------------------------------------
   Standings
   --------------------------------------------------------------------- */

function progressOf(car) {
  if (car.finished) return TOTAL_LAPS * trackLength + 1e-6;
  return (car.lap - 1) * trackLength + car.z;
}

function computeStandings() {
  return [...state.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return progressOf(b) - progressOf(a);
  });
}

/* ---------------------------------------------------------------------
   Input
   --------------------------------------------------------------------- */

function setKey(name, value, evt) {
  if (keys[name] === value) return;
  keys[name] = value;
  if (evt) evt.preventDefault();
}

window.addEventListener('keydown', (evt) => {
  switch (evt.key) {
    case 'ArrowLeft': case 'a': case 'A': setKey('left', true, evt); break;
    case 'ArrowRight': setKey('right', true, evt); break;
    case 'ArrowUp': case 'w': case 'W': setKey('accel', true, evt); break;
    case 'ArrowDown': case 's': case 'S': setKey('brake', true, evt); break;
    case ' ': setKey('boost', true, evt); break;
    case 'd': case 'D': setKey('drift', true, evt); break;
    case 'p': case 'P': togglePause(); break;
    default: return;
  }
});

window.addEventListener('keyup', (evt) => {
  switch (evt.key) {
    case 'ArrowLeft': case 'a': case 'A': setKey('left', false); break;
    case 'ArrowRight': setKey('right', false); break;
    case 'ArrowUp': case 'w': case 'W': setKey('accel', false); break;
    case 'ArrowDown': case 's': case 'S': setKey('brake', false); break;
    case ' ': setKey('boost', false); break;
    case 'd': case 'D': setKey('drift', false); break;
    default: return;
  }
});

function bindTouchButton(el, name) {
  const down = (evt) => { setKey(name, true, evt); el.classList.add('active'); };
  const up = (evt) => { setKey(name, false, evt); el.classList.remove('active'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (evt) => evt.preventDefault());
}

bindTouchButton(btnLeft, 'left');
bindTouchButton(btnRight, 'right');
bindTouchButton(btnAccel, 'accel');
bindTouchButton(btnBrake, 'brake');
bindTouchButton(btnBoost, 'boost');
bindTouchButton(btnDrift, 'drift');

/* ---------------------------------------------------------------------
   Physics update
   --------------------------------------------------------------------- */

function driftTierFor(charge) {
  let tier = 0;
  for (let i = 0; i < DRIFT_TIERS.length; i++) {
    if (charge >= DRIFT_TIERS[i].time) tier = i + 1;
  }
  return tier;
}

function releaseDrift(car) {
  const tier = driftTierFor(car.driftCharge);
  if (tier > 0) {
    const info = DRIFT_TIERS[tier - 1];
    car.speed = Math.min(car.speed + info.boost, car.maxSpeed * 1.28);
    car.boostTimer = Math.max(car.boostTimer, BOOST_DURATION);
    spawnFx('💨', info.label);
  }
  car.isDrifting = false;
  car.driftCharge = 0;
}

function updatePlayer(car, dt) {
  if (car.spinTimer > 0) {
    car.spinTimer -= dt;
    car.speed = Math.max(0, car.speed - COAST_DECEL * 2 * dt);
    car.z += car.speed * dt;
    car.isDrifting = false;
    car.driftCharge = 0;
    return;
  }

  const segment = findSegment(car.z);
  const speedPercent = car.speed / car.maxSpeed;
  const steer = dt * 2.2 * speedPercent;

  // Hold Drift while steering into a turn to carve a tighter line; release
  // it to cash in the charge you built up as a burst of speed.
  const steerDir = keys.left ? -1 : (keys.right ? 1 : 0);
  const drifting = keys.drift && steerDir !== 0 && speedPercent > DRIFT_MIN_SPEED_FACTOR;

  if (drifting) {
    car.isDrifting = true;
    car.driftDir = steerDir;
    const maxCharge = DRIFT_TIERS[DRIFT_TIERS.length - 1].time + 0.5;
    car.driftCharge = Math.min(car.driftCharge + dt, maxCharge);
  } else if (car.isDrifting) {
    releaseDrift(car);
  }

  const steerMult = drifting ? DRIFT_STEER_MULT : 1;
  const centrifugalMult = drifting ? DRIFT_CENTRIFUGAL_MULT : 1;

  if (keys.left) car.x -= steer * car.steerResponsiveness * steerMult;
  if (keys.right) car.x += steer * car.steerResponsiveness * steerMult;
  car.x -= steer * speedPercent * segment.curve * car.centrifugal * centrifugalMult;

  const offRoad = Math.abs(car.x) > 1;

  // Guard rail collision.
  if (Math.abs(car.x) > RAIL_X) {
    car.x = clamp(car.x, -RAIL_X, RAIL_X);
    car.speed *= 0.55;
    damageEnergy(car, RAIL_HIT_DAMAGE);
    spawnFx('💥', 'Ouch!');
  }

  // Acceleration / braking / coasting.
  if (keys.accel) {
    car.speed += car.accelRate * dt;
  } else if (keys.brake) {
    car.speed -= BRAKE_RATE * dt;
  } else {
    car.speed -= COAST_DECEL * dt;
  }
  if (offRoad) car.speed -= OFFROAD_DECEL * dt;

  let cap = car.maxSpeed;
  if (offRoad) cap = Math.min(cap, car.maxSpeed * OFFROAD_MAX_SPEED_FACTOR);
  if (car.boostTimer > 0) cap = car.maxSpeed * 1.28;

  car.speed = clamp(car.speed, 0, cap);

  // Boost pad pickup.
  if (segment.boostPad && !car.consumedPads.has(segment.index)) {
    car.consumedPads.add(segment.index);
    car.speed = Math.min(car.speed + 2400, car.maxSpeed * 1.28);
    car.boostTimer = Math.max(car.boostTimer, 0.5);
    spawnFx('✨', 'Boost Pad!');
  }

  // Manual boost.
  if (car.boostCooldown > 0) car.boostCooldown -= dt;
  if (keys.boost && car.boostCooldown <= 0 && car.energy >= BOOST_COST) {
    car.energy -= BOOST_COST;
    car.speed = Math.min(car.speed + car.boostKick, car.maxSpeed * 1.28);
    car.boostTimer = BOOST_DURATION;
    car.boostCooldown = BOOST_COOLDOWN;
    spawnFx('⚡', 'Boost!');
  }
  if (car.boostTimer > 0) car.boostTimer -= dt;

  // Energy regen, unless empty (spun out) or currently boosting.
  if (car.energy < ENERGY_MAX && car.boostCooldown <= 0) {
    car.energy = Math.min(ENERGY_MAX, car.energy + ENERGY_REGEN * dt);
  }

  car.z += car.speed * dt;
  advanceLap(car);
}

function damageEnergy(car, amount) {
  car.energy = Math.max(0, car.energy - amount);
  if (car.energy <= 0 && car.spinTimer <= 0) {
    car.spinTimer = 1.1;
    car.energy = 0;
    spawnFx('😵', 'Spin Out!');
    setTimeout(() => { if (car.energy <= 0) car.energy = 32; }, 1100);
  }
}

function advanceLap(car) {
  if (car.z >= trackLength) {
    car.z -= trackLength;
    const lapMs = state.raceTime - car.lapStart;
    car.lapStart = state.raceTime;
    if (car.bestLapMs == null || lapMs < car.bestLapMs) car.bestLapMs = lapMs;
    car.lap += 1;
    car.consumedPads.clear();
    if (car.lap > TOTAL_LAPS && !car.finished) {
      car.finished = true;
      car.finishTime = state.raceTime;
      car.lap = TOTAL_LAPS;
      if (car.isPlayer) finishRace();
    }
  }
}

function updateAI(car, dt) {
  if (car.finished) return;

  const segment = findSegment(car.z);
  const playerProgress = progressOf(state.player);
  const myProgress = progressOf(car);
  const diff = playerProgress - myProgress;

  // Mild rubber-banding: nudge the target speed if an AI has drifted very
  // far ahead of or behind the player, to keep the race close and fun.
  let rubber = 1;
  if (diff > 4000) rubber = 1.12;
  else if (diff < -4000) rubber = 0.92;

  const curveSlow = 1 - Math.min(Math.abs(segment.curve) / 8, 1) * 0.32 * (1 - (car.steerResponsiveness - 0.7));
  const weaveOffset = Math.sin(state.raceTime / 900 + car.aiWeave) * 0.12;
  const targetSpeed = car.maxSpeed * rubber * Math.max(0.5, curveSlow);

  // Use the same accel/brake rates as the player so a car's Accel stat
  // matters the same way whether a human or the AI is driving it.
  if (car.speed < targetSpeed) {
    car.speed = Math.min(targetSpeed, car.speed + car.accelRate * dt);
  } else {
    car.speed = Math.max(targetSpeed, car.speed - 3200 * dt);
  }
  car.speed = clamp(car.speed, 0, car.maxSpeed * 1.05);

  const targetX = car.laneOffset + weaveOffset;
  car.x += (targetX - car.x) * Math.min(1, 2.2 * dt);

  car.z += car.speed * dt;
  advanceLap(car);
}

function handleCarCollisions() {
  const player = state.player;
  for (const car of state.cars) {
    if (car === player) continue;
    const dz = Math.abs(car.z - player.z);
    const dzWrapped = Math.min(dz, trackLength - dz);
    if (dzWrapped < CAR_COLLIDE_Z && Math.abs(car.x - player.x) < CAR_COLLIDE_X) {
      const push = car.x >= player.x ? -1 : 1;
      player.x += push * 0.04;
      car.x -= push * 0.02;
      player.speed *= 0.96;
      car.speed *= 0.98;
    }
  }
}

function update(dt) {
  state.raceTime += dt * 1000;
  updatePlayer(state.player, dt);
  for (const car of state.cars) {
    if (!car.isPlayer) updateAI(car, dt);
  }
  handleCarCollisions();
  state.bgOffset += (findSegment(state.player.z).curve * (state.player.speed / state.player.maxSpeed)) * dt * 0.6;
}

/* ---------------------------------------------------------------------
   FX helper (reuses the DOM fx-layer pattern)
   --------------------------------------------------------------------- */

let lastFxTime = 0;
function spawnFx(emoji, text) {
  const now = performance.now();
  if (now - lastFxTime < 350) return; // throttle so the layer doesn't spam
  lastFxTime = now;
  const burst = document.createElement('div');
  burst.className = 'fx-burst';
  burst.innerHTML = `<div class="fx-emoji">${emoji}</div><div class="fx-text">${text}</div>`;
  fxLayer.appendChild(burst);
  setTimeout(() => burst.remove(), 950);
}

/* ---------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------- */

function fillTrapezoid(x1, y1, w1, x2, y2, w2, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x1 + w1, y1);
  ctx.closePath();
  ctx.fill();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.55);
  grad.addColorStop(0, COLORS.sky1);
  grad.addColorStop(1, COLORS.sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.55);

  // A soft "castle skyline" silhouette that parallax-scrolls with steering,
  // purely decorative and stylised (not any specific artwork).
  const offset = ((state.bgOffset * 40) % WIDTH + WIDTH) % WIDTH;
  ctx.fillStyle = 'rgba(10, 8, 40, 0.55)';
  for (let pass = -1; pass <= 1; pass++) {
    const baseX = pass * WIDTH - offset;
    ctx.beginPath();
    ctx.moveTo(baseX, HEIGHT * 0.42);
    const spires = [0.08, 0.22, 0.38, 0.5, 0.64, 0.8, 0.94];
    spires.forEach((f, i) => {
      const x = baseX + f * WIDTH;
      const towerH = (i % 2 === 0) ? 70 : 46;
      ctx.lineTo(x, HEIGHT * 0.42 - towerH * 0.4);
      ctx.lineTo(x + 10, HEIGHT * 0.42 - towerH);
      ctx.lineTo(x + 20, HEIGHT * 0.42 - towerH * 0.4);
    });
    ctx.lineTo(baseX + WIDTH, HEIGHT * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137.5) % WIDTH;
    const sy = (i * 71.3) % (HEIGHT * 0.35);
    ctx.fillRect(sx, sy, 2, 2);
  }
}

function drawSegments() {
  const baseSegment = findSegment(state.player.z);
  const baseIndex = baseSegment.index;
  const basePercent = ((state.player.z % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH / SEGMENT_LENGTH;
  const playerXWorld = state.player.x * ROAD_WIDTH;

  let x = 0;
  let dx = -(baseSegment.curve * basePercent);

  const visible = [];

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const segment = segments[(baseIndex + n) % segments.length];
    const looped = (baseIndex + n) >= segments.length;
    const zOffset = looped ? trackLength : 0;

    project(segment.p1, playerXWorld - x, state.player.z - zOffset, WIDTH, HEIGHT, ROAD_WIDTH);
    project(segment.p2, playerXWorld - x, state.player.z - zOffset, WIDTH, HEIGHT, ROAD_WIDTH);

    segment.curveOffsetX = x;

    x += dx;
    dx += segment.curve;

    if (segment.p1.camZ > 0) visible.push(segment);
  }

  // Paint far to near so nearer segments correctly overpaint farther ones.
  for (let i = visible.length - 1; i >= 0; i--) {
    const segment = visible[i];
    const p1 = segment.p1.screen;
    const p2 = segment.p2.screen;
    if (p1.y <= p2.y) continue;

    const grass = segment.color === 'light' ? COLORS.grassLight : COLORS.grassDark;
    const rumble = segment.color === 'light' ? COLORS.rumbleLight : COLORS.rumbleDark;
    const road = segment.color === 'light' ? COLORS.roadLight : COLORS.roadDark;

    fillTrapezoid(WIDTH / 2, p1.y, WIDTH, WIDTH / 2, p2.y, WIDTH, grass);
    fillTrapezoid(p1.x, p1.y, p1.w * 1.14, p2.x, p2.y, p2.w * 1.14, rumble);
    fillTrapezoid(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, road);

    if (segment.color === 'light') {
      const laneW1 = p1.w / 20;
      const laneW2 = p2.w / 20;
      for (let lane = 1; lane < LANES; lane++) {
        const laneX1 = p1.x - p1.w + (2 * p1.w * lane) / LANES;
        const laneX2 = p2.x - p2.w + (2 * p2.w * lane) / LANES;
        fillTrapezoid(laneX1, p1.y, laneW1, laneX2, p2.y, laneW2, COLORS.laneMarker);
      }
    }

    if (segment.boostPad) {
      ctx.fillStyle = 'rgba(255, 210, 63, 0.85)';
      const midY = (p1.y + p2.y) / 2;
      const midX = (p1.x + p2.x) / 2;
      const w = Math.max(4, (p1.w + p2.w) / 6);
      ctx.beginPath();
      ctx.moveTo(midX - w, p1.y);
      ctx.lineTo(midX, midY);
      ctx.lineTo(midX - w, p2.y);
      ctx.lineTo(midX - w * 0.4, midY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(midX + w, p1.y);
      ctx.lineTo(midX, midY);
      ctx.lineTo(midX + w, p2.y);
      ctx.lineTo(midX + w * 0.4, midY);
      ctx.closePath();
      ctx.fill();
    }

    if (segment.prop && p1.scale > 0.02) {
      const propX = p1.x + segment.prop.side * (p1.w * 1.35 + 16);
      const size = clamp(p1.scale * 900, 10, 46);
      ctx.font = size + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(segment.prop.emoji, propX, p1.y);
    }
  }

  drawCars(baseSegment, visible);
}

function carScreenPosition(car) {
  const segment = findSegment(car.z);
  const percent = ((car.z % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH / SEGMENT_LENGTH;
  const p1 = segment.p1.screen;
  const p2 = segment.p2.screen;
  if (p1.scale === undefined || p2.scale === undefined) return null;
  const screenX = lerp(p1.x, p2.x, percent) + car.x * lerp(p1.w, p2.w, percent);
  const screenY = lerp(p1.y, p2.y, percent);
  const scale = lerp(p1.scale, p2.scale, percent);
  return { x: screenX, y: screenY, scale, z: car.z, segIndex: segment.index };
}

function drawCarSprite(car, pos) {
  const size = clamp(pos.scale * 3600, 14, 130);
  const bob = car.spinTimer > 0 ? Math.sin(performance.now() / 40) * 4 : 0;
  const x = pos.x + bob;
  const y = pos.y;

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.06, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Kart body
  const bodyW = size * 0.62;
  const bodyH = size * 0.34;
  ctx.fillStyle = car.character.body;
  ctx.strokeStyle = car.character.accent;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, 0);
  ctx.quadraticCurveTo(-bodyW / 2, -bodyH, 0, -bodyH * 1.1);
  ctx.quadraticCurveTo(bodyW / 2, -bodyH, bodyW / 2, 0);
  ctx.quadraticCurveTo(bodyW / 2, bodyH * 0.4, 0, bodyH * 0.55);
  ctx.quadraticCurveTo(-bodyW / 2, bodyH * 0.4, -bodyW / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wheels
  ctx.fillStyle = '#1a1a1a';
  const wheelR = size * 0.09;
  ctx.beginPath(); ctx.arc(-bodyW / 2, bodyH * 0.35, wheelR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bodyW / 2, bodyH * 0.35, wheelR, 0, Math.PI * 2); ctx.fill();

  // Drift sparks, colored by charge tier (blue -> orange -> pink)
  if (car.isDrifting) {
    const tier = driftTierFor(car.driftCharge);
    const sparkColor = tier >= 3 ? DRIFT_TIERS[2].color : tier >= 2 ? DRIFT_TIERS[1].color : tier >= 1 ? DRIFT_TIERS[0].color : '#cfd6ff';
    const pulse = 0.8 + Math.sin(performance.now() / 55) * 0.2;
    ctx.fillStyle = sparkColor;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(side * bodyW * 0.42, bodyH * 0.55, size * 0.06 * pulse, size * 0.1 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Boost flame
  if (car.boostTimer > 0) {
    ctx.fillStyle = 'rgba(255,150,30,0.85)';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.22, bodyH * 0.2);
    ctx.lineTo(0, bodyH * 0.2 + size * 0.32);
    ctx.lineTo(bodyW * 0.22, bodyH * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // Character face
  ctx.font = (size * 0.62) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(car.character.emoji, 0, -bodyH * 0.95);

  if (car.spinTimer > 0) {
    ctx.font = (size * 0.3) + 'px sans-serif';
    ctx.fillText('😵💫', 0, -bodyH * 1.9);
  }

  ctx.restore();
}

function drawCars(baseSegment, visibleSegments) {
  const visibleIndices = new Set(visibleSegments.map((s) => s.index));
  const positioned = [];

  for (const car of state.cars) {
    const segment = findSegment(car.z);
    if (!visibleIndices.has(segment.index) && car !== state.player) continue;
    const pos = carScreenPosition(car);
    if (!pos) continue;
    positioned.push({ car, pos });
  }

  // Farther cars first so nearer ones draw on top.
  positioned.sort((a, b) => b.pos.scale - a.pos.scale ? -1 : 1);
  positioned.sort((a, b) => a.pos.scale - b.pos.scale);

  for (const { car, pos } of positioned) {
    if (car.isPlayer) continue; // player kart is drawn fixed at the bottom
    drawCarSprite(car, pos);
  }

  // Player kart, drawn last, anchored near the bottom-center of the screen.
  const player = state.player;
  const wobble = player.spinTimer > 0 ? Math.sin(performance.now() / 30) * 10 : 0;
  const playerScreenX = WIDTH / 2 + wobble;
  const playerScreenY = HEIGHT - 58;
  drawCarSprite(player, { x: playerScreenX, y: playerScreenY, scale: 0.11 });
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawSegments();
}

/* ---------------------------------------------------------------------
   HUD updates
   --------------------------------------------------------------------- */

function updateHud() {
  const player = state.player;
  const kmh = Math.round((player.speed / BASE_MAX_SPEED) * 260);
  speedValue.textContent = kmh;
  lapValue.textContent = Math.min(player.lap, TOTAL_LAPS) + ' / ' + TOTAL_LAPS;

  const standings = computeStandings();
  const place = standings.findIndex((c) => c.isPlayer) + 1;
  placeValue.textContent = ordinal(place);

  timeValue.textContent = formatTime(state.raceTime);

  const pct = clamp(player.energy / ENERGY_MAX, 0, 1);
  energyFill.style.width = (pct * 100) + '%';
  energyFill.classList.toggle('low', pct <= 0.5 && pct > 0.22);
  energyFill.classList.toggle('critical', pct <= 0.22);
}

/* ---------------------------------------------------------------------
   Screen management
   --------------------------------------------------------------------- */

function showOverlay(el) {
  el.classList.remove('hidden');
}
function hideOverlay(el) {
  el.classList.add('hidden');
}

function renderCharacterGrid() {
  characterGrid.innerHTML = '';
  CHARACTERS.forEach((c) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'character-card' + (c.id === state.selectedId ? ' selected' : '');
    const record = state.records[c.id];
    const bestText = record && record.bestLapMs
      ? 'Best lap ' + formatTime(record.bestLapMs)
      : '';

    card.innerHTML = `
      <div class="character-emoji">${c.emoji}</div>
      <div class="character-name">${c.name}</div>
      <div class="character-subtitle">${c.subtitle}</div>
      <div class="character-stats">
        ${statLine('Speed', c.stats.speed)}
        ${statLine('Accel', c.stats.accel)}
        ${statLine('Handle', c.stats.handling)}
        ${statLine('Boost', c.stats.boost)}
      </div>
      <div class="character-best">${bestText}</div>
    `;
    card.addEventListener('click', () => {
      state.selectedId = c.id;
      renderCharacterGrid();
    });
    characterGrid.appendChild(card);
  });
}

function statLine(label, value) {
  let pips = '';
  for (let i = 1; i <= 5; i++) {
    pips += `<span class="pip${i <= value ? ' filled' : ''}"></span>`;
  }
  return `<div class="stat-line"><span class="stat-name">${label}</span><div class="pip-row">${pips}</div></div>`;
}

function goToMenu() {
  state.screen = 'menu';
  hideOverlay(pauseOverlay);
  hideOverlay(resultsOverlay);
  hideOverlay(countdownOverlay);
  hud.classList.add('hidden');
  renderCharacterGrid();
  showOverlay(menuOverlay);
}

function startCountdown() {
  state.screen = 'countdown';
  hideOverlay(menuOverlay);
  hud.classList.remove('hidden');
  setupRace();
  state.countdown = 3;
  countdownNumber.textContent = String(state.countdown);
  showOverlay(countdownOverlay);
  const tick = () => {
    state.countdown -= 1;
    if (state.countdown > 0) {
      countdownNumber.textContent = String(state.countdown);
      setTimeout(tick, 800);
    } else {
      countdownNumber.textContent = 'GO!';
      setTimeout(() => {
        hideOverlay(countdownOverlay);
        state.screen = 'racing';
      }, 500);
    }
  };
  setTimeout(tick, 800);
}

function togglePause() {
  if (state.screen === 'racing') {
    state.screen = 'paused';
    showOverlay(pauseOverlay);
  } else if (state.screen === 'paused') {
    state.screen = 'racing';
    hideOverlay(pauseOverlay);
  }
}

function finishRace() {
  state.screen = 'results';
  const standings = computeStandings();
  const player = state.player;
  const place = standings.findIndex((c) => c.isPlayer) + 1;

  const records = state.records;
  const prev = records[player.character.id] || {};
  const improvedLap = !prev.bestLapMs || (player.bestLapMs && player.bestLapMs < prev.bestLapMs);
  const improvedPlace = !prev.bestPlace || place < prev.bestPlace;
  records[player.character.id] = {
    bestLapMs: improvedLap ? player.bestLapMs : prev.bestLapMs,
    bestPlace: improvedPlace ? place : prev.bestPlace
  };
  state.records = records;
  saveRecords(records);

  resultsTitle.textContent = place === 1 ? '🏆 You Won the Race!' : 'Race Results';
  resultsList.innerHTML = '';
  standings.forEach((car, i) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (car.isPlayer ? ' is-player' : '');
    row.innerHTML = `
      <span class="result-rank">${ordinal(i + 1)}</span>
      <span class="result-emoji">${car.character.emoji}</span>
      <span class="result-name">${car.character.name}${car.isPlayer ? ' (You)' : ''}</span>
    `;
    resultsList.appendChild(row);
  });
  resultsBestLap.textContent = player.bestLapMs
    ? 'Your best lap: ' + formatTime(player.bestLapMs)
    : '';

  const medalEmoji = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🏁';
  const medalText = place === 1 ? 'You Win!' : place <= 3 ? 'Great Race!' : 'Nice Try!';
  spawnFx(medalEmoji, medalText);

  showOverlay(resultsOverlay);
}

/* ---------------------------------------------------------------------
   Wiring
   --------------------------------------------------------------------- */

startRaceButton.addEventListener('click', startCountdown);
resumeButton.addEventListener('click', togglePause);
quitButton.addEventListener('click', () => {
  hideOverlay(pauseOverlay);
  goToMenu();
});
pauseButton.addEventListener('click', togglePause);
raceAgainButton.addEventListener('click', () => {
  hideOverlay(resultsOverlay);
  startCountdown();
});
changeRacerButton.addEventListener('click', () => {
  hideOverlay(resultsOverlay);
  goToMenu();
});

/* ---------------------------------------------------------------------
   Main loop
   --------------------------------------------------------------------- */

let lastTime = null;

function frame(now) {
  if (lastTime == null) lastTime = now;
  const dt = clamp((now - lastTime) / 1000, 0, 1 / 20);
  lastTime = now;

  if (state.screen === 'racing') {
    update(dt);
    render();
    updateHud();
  } else if (state.screen === 'paused' || state.screen === 'countdown') {
    render();
  }

  requestAnimationFrame(frame);
}

buildTrack();
goToMenu();
requestAnimationFrame(frame);
