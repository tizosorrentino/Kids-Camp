(() => {
  'use strict';

  // ============================================================
  // Turbo Hedgehog 3D — an original speedy-hedgehog 3D runner.
  // The character, world and track pieces below are all original
  // designs built from primitive shapes; they are inspired by the
  // classic "fast hedgehog with a loop-the-loop" genre but are not
  // a reproduction of any specific copyrighted character or game.
  // ============================================================

  const DEG = Math.PI / 180;
  const LANE_WIDTH = 3.2;
  const ROAD_HALF_WIDTH = 5;
  const CURB_WIDTH = 0.6;
  const CURB_HEIGHT = 0.22;

  const BASE_SPEED = 15;
  const MAX_SPEED = 27;
  const SPEED_RAMP_TIME = 22;
  const ROLL_SPEED_MULT = 1.55;
  const HIT_SPEED_MULT = 0.55;
  const HIT_SLOW_DURATION = 0.7;
  const LANE_LERP_RATE = 9;

  const JUMP_VELOCITY = 13.5;
  const GRAVITY = 34;
  const OBSTACLE_CLEAR_HEIGHT = 1.1;

  const RING_PICKUP_DIST_R = 0.9;
  const RING_PICKUP_LANE_R = 1.3;
  const OBSTACLE_HIT_DIST_R = 0.9;
  const OBSTACLE_HIT_LANE_R = 1.35;

  const STUMBLE_DURATION = 0.5;
  const STUMBLE_DEPTH = 1.0;
  const GAP_TIME_PENALTY = 2.0;
  const HIT_RING_LOSS = 3;

  const SAMPLE_STEP_STRAIGHT = 1.0;
  const LOOP_SAMPLES = 96;

  const CHASE_DISTANCE = 7.5;
  const CHASE_HEIGHT = 3.4;
  const LOOK_AHEAD = 5;
  const LOOK_UP = 1.3;

  const BEST_TIME_PREFIX = 'turboHedgehog3d.best.';

  // ---------- small math helpers ----------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ============================================================
  // Track construction: a track is built from a small DSL of
  // pieces (straight/curve/hill/gap all share one flexible
  // "straight" piece, plus a dedicated "loop" piece). Pieces are
  // marched one after another by a cursor (position + heading),
  // producing a dense array of sample points. Each sample carries
  // a full orientation frame (tangent / up / right) so the loop
  // can rotate the character's "up" a full 360 degrees, exactly
  // like a classic loop-the-loop.
  // ============================================================

  const P = {
    straight(length, opts) {
      opts = opts || {};
      return { type: 'straight', length, curve: opts.curve || 0, rise: opts.rise || 0, gap: !!opts.gap };
    },
    loop(radius) {
      return { type: 'loop', radius };
    },
  };

  function addStraight(cursor, samples, length, curve, rise, isGap) {
    if (length <= 0) return;
    const turnSteps = Math.max(1, Math.ceil(Math.abs(curve) / (7.5 * DEG)));
    const lenSteps = Math.max(1, Math.ceil(length / SAMPLE_STEP_STRAIGHT));
    const N = Math.max(turnSteps, lenSteps, 2);
    const stepLen = length / N;
    const startY = cursor.pos.y;
    const startYaw = cursor.yaw;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const yawMid = startYaw + curve * ((i - 0.5) / N);
      const fwd = new THREE.Vector3(Math.sin(yawMid), 0, -Math.cos(yawMid));
      const next = cursor.pos.clone().addScaledVector(fwd, stepLen);
      next.y = startY + rise * smoothstep(t);
      cursor.pos = next;
      samples.push({ pos: next, refUp: new THREE.Vector3(0, 1, 0), kind: 'road', gap: isGap });
    }
    cursor.yaw = startYaw + curve;
  }

  function addLoop(cursor, samples, radius) {
    const e1 = new THREE.Vector3(Math.sin(cursor.yaw), 0, -Math.cos(cursor.yaw));
    const e2 = new THREE.Vector3(0, 1, 0);
    const center = cursor.pos.clone().addScaledVector(e2, radius);
    for (let i = 1; i <= LOOP_SAMPLES; i++) {
      const theta = (i / LOOP_SAMPLES) * Math.PI * 2;
      const pos = center.clone()
        .addScaledVector(e2, -radius * Math.cos(theta))
        .addScaledVector(e1, radius * Math.sin(theta));
      const refUp = e2.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e1, -Math.sin(theta));
      cursor.pos = pos;
      samples.push({ pos, refUp, kind: 'loop', gap: false });
    }
  }

  function buildTrack(pieceDefs) {
    const cursor = { pos: new THREE.Vector3(0, 0, 0), yaw: 0 };
    const samples = [{ pos: cursor.pos.clone(), refUp: new THREE.Vector3(0, 1, 0), kind: 'road', gap: false }];

    pieceDefs.forEach((def) => {
      if (def.type === 'straight') addStraight(cursor, samples, def.length, def.curve, def.rise, def.gap);
      else if (def.type === 'loop') addLoop(cursor, samples, def.radius);
    });

    const frames = samples.map((s) => ({ pos: s.pos, refUp: s.refUp, kind: s.kind, gap: s.gap, dist: 0 }));
    let dist = 0;
    for (let i = 1; i < frames.length; i++) {
      dist += samples[i - 1].pos.distanceTo(samples[i].pos);
      frames[i].dist = dist;
    }

    for (let i = 0; i < frames.length; i++) {
      const a = frames[Math.max(0, i - 1)].pos;
      const b = frames[Math.min(frames.length - 1, i + 1)].pos;
      const tangent = b.clone().sub(a);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, -1);
      tangent.normalize();
      const right = new THREE.Vector3().crossVectors(tangent, frames[i].refUp);
      if (right.lengthSq() < 1e-6) right.crossVectors(tangent, new THREE.Vector3(0, 0, 1));
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
      frames[i].tangent = tangent;
      frames[i].right = right;
      frames[i].up = up;
    }

    const gaps = [];
    let cur = null;
    frames.forEach((f) => {
      if (f.gap) {
        if (!cur) cur = { start: f.dist, end: f.dist, triggered: false };
        else cur.end = f.dist;
      } else if (cur) {
        gaps.push(cur);
        cur = null;
      }
    });
    if (cur) gaps.push(cur);

    return { frames, totalLength: frames[frames.length - 1].dist, gaps };
  }

  function getFrameAt(track, dist) {
    const frames = track.frames;
    const d = clamp(dist, 0, track.totalLength);
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].dist < d) lo = mid + 1; else hi = mid;
    }
    if (lo === 0) return frames[0];
    const a = frames[lo - 1], b = frames[lo];
    const span = b.dist - a.dist;
    const t = span > 1e-6 ? (d - a.dist) / span : 0;
    return {
      pos: a.pos.clone().lerp(b.pos, t),
      tangent: a.tangent.clone().lerp(b.tangent, t).normalize(),
      up: a.up.clone().lerp(b.up, t).normalize(),
      right: a.right.clone().lerp(b.right, t).normalize(),
      kind: t < 0.5 ? a.kind : b.kind,
      dist: d,
    };
  }

  function isInGap(track, dist, margin) {
    return track.gaps.some((g) => dist > g.start - margin && dist < g.end + margin);
  }
  function getGapAt(track, dist) {
    return track.gaps.find((g) => dist >= g.start && dist <= g.end) || null;
  }

  // ---------- track ribbon mesh ----------
  function pushTri(positions, colors, a, b, c, color) {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }

  function buildTrackMesh(track, theme) {
    const frames = track.frames;
    const positions = [];
    const colors = [];
    const roadA = new THREE.Color(theme.road);
    const roadB = new THREE.Color(theme.roadAlt);
    const curbA = new THREE.Color(theme.curbA);
    const curbB = new THREE.Color(theme.curbB);

    function crossSection(f) {
      const hw = ROAD_HALF_WIDTH, cw = CURB_WIDTH, ch = CURB_HEIGHT;
      return [
        f.pos.clone().addScaledVector(f.right, -(hw + cw)).addScaledVector(f.up, ch),
        f.pos.clone().addScaledVector(f.right, -hw),
        f.pos.clone().addScaledVector(f.right, hw),
        f.pos.clone().addScaledVector(f.right, hw + cw).addScaledVector(f.up, ch),
      ];
    }

    const checkerSize = 6;
    for (let i = 0; i < frames.length - 1; i++) {
      const f0 = frames[i], f1 = frames[i + 1];
      if (f0.gap || f1.gap) continue;
      const p0 = crossSection(f0);
      const p1 = crossSection(f1);
      const roadChecker = Math.floor(f0.dist / checkerSize) % 2 === 0;
      const curbChecker = Math.floor(f0.dist / 3) % 2 === 0;
      for (let band = 0; band < 3; band++) {
        const a0 = p0[band], a1 = p0[band + 1], b0 = p1[band], b1 = p1[band + 1];
        const isCurb = band !== 1;
        const color = isCurb ? (curbChecker ? curbA : curbB) : (roadChecker ? roadA : roadB);
        pushTri(positions, colors, a0, b0, b1, color);
        pushTri(positions, colors, a0, b1, a1, color);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }

  function buildFinishArch(f) {
    const g = new THREE.Group();
    const basis = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), postMat);
      post.position.copy(f.pos.clone().addScaledVector(f.right, side * (ROAD_HALF_WIDTH + 0.3)).addScaledVector(f.up, 2.5));
      post.quaternion.copy(q);
      g.add(post);
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 1.2, 1, 0.3), new THREE.MeshLambertMaterial({ color: 0x22314a }));
    banner.position.copy(f.pos.clone().addScaledVector(f.up, 5));
    banner.quaternion.copy(q);
    g.add(banner);
    return g;
  }

  function buildDecorations(track, theme) {
    const group = new THREE.Group();
    let geo;
    if (theme.decoType === 'tree') geo = new THREE.ConeGeometry(0.9, 2.6, 7);
    else if (theme.decoType === 'cactus') geo = new THREE.CylinderGeometry(0.32, 0.4, 2.2, 8);
    else geo = new THREE.OctahedronGeometry(0.85, 0);
    const mat = new THREE.MeshLambertMaterial({ color: theme.decoColor });

    const rng = mulberry32(999);
    const placements = [];
    for (let d = 6; d < track.totalLength - 6; d += 9) {
      const f = getFrameAt(track, d);
      if (f.kind === 'loop' || isInGap(track, d, 3)) continue;
      [-1, 1].forEach((side) => {
        if (rng() < 0.15) return;
        const offset = ROAD_HALF_WIDTH + CURB_WIDTH + 2 + rng() * 3;
        const pos = f.pos.clone().addScaledVector(f.right, side * offset);
        pos.y = f.pos.y - 0.2;
        placements.push({ pos, scale: 0.75 + rng() * 0.6, rot: rng() * Math.PI * 2 });
      });
    }

    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, placements.length));
    const m = new THREE.Matrix4();
    if (placements.length === 0) {
      m.makeScale(0.0001, 0.0001, 0.0001);
      inst.setMatrixAt(0, m);
    }
    placements.forEach((p, i) => {
      m.compose(p.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(p.scale, p.scale, p.scale));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
    return group;
  }

  // ---------- item (ring / obstacle) placement ----------
  function populateItems(track, seed) {
    const rng = mulberry32(seed);
    const rings = [];
    const obstacles = [];
    let d = 8;
    let obstacleCooldown = 2;
    while (d < track.totalLength - 12) {
      const f = getFrameAt(track, d);
      if (isInGap(track, d, 2.5) || f.kind === 'loop') { d += 4; continue; }

      const pattern = Math.floor(rng() * 3);
      const spacing = 2.2;
      const patternLen = 5;
      if (pattern === 0) {
        for (let k = 0; k < patternLen; k++) rings.push({ dist: d + k * spacing, lane: 0 });
      } else if (pattern === 1) {
        const lanes = [-1, 0, 1, 0, -1];
        for (let k = 0; k < patternLen; k++) rings.push({ dist: d + k * spacing, lane: lanes[k] });
      } else {
        [-1, 0, 1].forEach((l) => rings.push({ dist: d, lane: l }));
      }
      d += patternLen * spacing + 6 + rng() * 6;

      obstacleCooldown -= 1;
      if (obstacleCooldown <= 0) {
        const of = getFrameAt(track, d + 3);
        if (of.kind !== 'loop' && !isInGap(track, d + 3, 2.5)) {
          const lanes = [-1, 0, 1];
          const primaryLane = lanes[Math.floor(rng() * 3)];
          obstacles.push({ dist: d + 3, lane: primaryLane });
          if (rng() < 0.4) {
            const remaining = lanes.filter((l) => l !== primaryLane);
            const secondLane = remaining[Math.floor(rng() * remaining.length)];
            obstacles.push({ dist: d + 3, lane: secondLane });
          }
          d += 4;
        }
        obstacleCooldown = 1 + Math.floor(rng() * 2);
      }
    }
    rings.forEach((r, i) => { r.id = i; r.collected = false; });
    obstacles.forEach((o, i) => { o.id = i; o.consumed = false; });
    return { rings, obstacles };
  }

  function hideInstance(mesh, id) {
    const m = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    mesh.setMatrixAt(id, m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function buildItemMeshes(items, track) {
    const ringGeo = new THREE.TorusGeometry(0.5, 0.15, 8, 16);
    const ringMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x553300 });
    const ringCount = Math.max(1, items.rings.length);
    const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, ringCount);
    const m = new THREE.Matrix4();
    if (items.rings.length === 0) hideInstance(ringMesh, 0);
    items.rings.forEach((r, i) => {
      const f = getFrameAt(track, r.dist);
      const pos = f.pos.clone().addScaledVector(f.right, r.lane * LANE_WIDTH).addScaledVector(f.up, 1.1);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent));
      m.compose(pos, q, new THREE.Vector3(1, 1, 1));
      ringMesh.setMatrixAt(i, m);
    });
    ringMesh.instanceMatrix.needsUpdate = true;

    const obsGeo = new THREE.ConeGeometry(0.55, 1.3, 6);
    const obsMat = new THREE.MeshLambertMaterial({ color: 0xe8483f });
    const obsCount = Math.max(1, items.obstacles.length);
    const obsMesh = new THREE.InstancedMesh(obsGeo, obsMat, obsCount);
    if (items.obstacles.length === 0) hideInstance(obsMesh, 0);
    items.obstacles.forEach((o, i) => {
      const f = getFrameAt(track, o.dist);
      const pos = f.pos.clone().addScaledVector(f.right, o.lane * LANE_WIDTH).addScaledVector(f.up, 0.65);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent));
      m.compose(pos, q, new THREE.Vector3(1, 1, 1));
      obsMesh.setMatrixAt(i, m);
    });
    obsMesh.instanceMatrix.needsUpdate = true;

    return { ringMesh, obsMesh };
  }

  // ============================================================
  // Original character: a stylized speedy hedgehog built entirely
  // from primitive geometry. Deliberately its own design (simple
  // mohawk-style quill row, round cartoon eyes, visible ears,
  // teal/amber color scheme) rather than a copy of any existing
  // character's likeness.
  // ============================================================
  function buildCharacter() {
    const group = new THREE.Group();
    const runPose = new THREE.Group();
    const ballPose = new THREE.Group();
    group.add(runPose, ballPose);

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1fb6a8 });
    const bellyMat = new THREE.MeshLambertMaterial({ color: 0xf5efe0 });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0xff9a3c });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeBlackMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), bodyMat);
    torso.scale.set(1, 1.08, 0.95);
    torso.position.y = 1.05;
    runPose.add(torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bellyMat);
    belly.scale.set(0.9, 1.05, 0.6);
    belly.position.set(0, 0.95, 0.42);
    runPose.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), bodyMat);
    head.position.set(0, 1.78, 0.08);
    runPose.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), bellyMat);
    muzzle.scale.set(1, 0.8, 0.9);
    muzzle.position.set(0, 1.68, 0.42);
    runPose.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeBlackMat);
    nose.position.set(0, 1.74, 0.62);
    runPose.add(nose);

    [-1, 1].forEach((side) => {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeWhiteMat);
      eyeWhite.position.set(0.2 * side, 1.86, 0.36);
      runPose.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeBlackMat);
      pupil.position.set(0.2 * side, 1.86, 0.44);
      runPose.add(pupil);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 8), bodyMat);
      ear.position.set(0.32 * side, 2.14, -0.02);
      ear.rotation.z = side * 0.3;
      runPose.add(ear);
    });

    const quillDefs = [
      { p: [0, 2.14, -0.22], s: 0.9 },
      { p: [0, 2.02, -0.5], s: 1.05 },
      { p: [0, 1.78, -0.72], s: 1.15 },
      { p: [0, 1.48, -0.86], s: 1.1 },
      { p: [0, 1.18, -0.9], s: 0.95 },
    ];
    quillDefs.forEach((q) => {
      const quill = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7 * q.s, 6), bodyMat);
      quill.position.set(q.p[0], q.p[1], q.p[2]);
      quill.rotation.x = -1.15;
      runPose.add(quill);
    });

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bodyMat);
    tail.position.set(0, 1.0, -0.62);
    runPose.add(tail);

    const arms = {};
    const legs = {};
    [-1, 1].forEach((side) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(0.56 * side, 1.32, 0.05);
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.5, 8), bodyMat);
      upperArm.position.y = -0.24;
      armGroup.add(upperArm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), bodyMat);
      hand.position.y = -0.5;
      armGroup.add(hand);
      runPose.add(armGroup);
      arms[side] = armGroup;

      const legGroup = new THREE.Group();
      legGroup.position.set(0.26 * side, 0.66, 0);
      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.5, 8), bodyMat);
      upperLeg.position.y = -0.22;
      legGroup.add(upperLeg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.46), accentMat);
      shoe.position.set(0, -0.5, 0.08);
      legGroup.add(shoe);
      runPose.add(legGroup);
      legs[side] = legGroup;
    });

    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), bodyMat);
    ball.position.y = 0.62;
    ballPose.add(ball);
    const ballTrim = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 0), new THREE.MeshBasicMaterial({ color: 0xff9a3c, wireframe: true }));
    ballTrim.position.y = 0.62;
    ballPose.add(ballTrim);
    ballPose.visible = false;

    group.userData = { runPose, ballPose, arms, legs, runCycle: 0 };
    return group;
  }

  function animateCharacter(charGroup, dt, moveState) {
    const d = charGroup.userData;
    d.runPose.visible = !moveState.isRolling;
    d.ballPose.visible = moveState.isRolling;
    if (moveState.isRolling) {
      d.ballPose.rotation.x -= moveState.speed * dt * 0.85;
    } else {
      d.runCycle += dt * moveState.speed * 1.7;
      const swing = Math.sin(d.runCycle) * (moveState.grounded ? 0.95 : 0.15);
      d.legs[-1].rotation.x = moveState.grounded ? swing : -0.5;
      d.legs[1].rotation.x = moveState.grounded ? -swing : -0.7;
      d.arms[-1].rotation.x = moveState.grounded ? -swing * 0.8 : -0.3;
      d.arms[1].rotation.x = moveState.grounded ? swing * 0.8 : -0.3;
      d.runPose.position.y = moveState.grounded ? Math.abs(Math.sin(d.runCycle)) * 0.06 : 0.05;
    }
  }

  // ============================================================
  // Map definitions
  // ============================================================
  const THEME_GRASS = { sky: '#8fd3ff', fog: '#8fd3ff', road: '#3a3f52', roadAlt: '#454b62', curbA: '#ffd23f', curbB: '#ffffff', ground: '#4caf6b', decoColor: '#2e7d4f', decoType: 'tree' };
  const THEME_DESERT = { sky: '#ffd59e', fog: '#ffd59e', road: '#6b5847', roadAlt: '#79634f', curbA: '#e8483f', curbB: '#ffffff', ground: '#e0b378', decoColor: '#3f7d43', decoType: 'cactus' };
  const THEME_ICE = { sky: '#cfe9ff', fog: '#cfe9ff', road: '#3d5872', roadAlt: '#456582', curbA: '#24e0c9', curbB: '#ffffff', ground: '#eaf6ff', decoColor: '#8fd8ff', decoType: 'crystal' };

  const MAPS = [
    {
      id: 'loopy-hills', name: 'Loopy Hills', feature: 'The big loop-the-loop!', theme: THEME_GRASS, seed: 1,
      pieces: [
        P.straight(18), P.straight(26, { curve: 45 * DEG }), P.straight(18, { rise: 5 }), P.straight(12, { rise: -5 }),
        P.straight(6, { gap: true }), P.straight(14), P.loop(8), P.straight(10),
        P.straight(24, { curve: -50 * DEG }), P.straight(16, { rise: 4 }), P.straight(16, { rise: -4 }),
        P.straight(6, { gap: true }), P.straight(10), P.straight(30, { curve: 25 * DEG }),
        P.straight(20, { rise: 6 }), P.straight(20, { rise: -6 }), P.straight(26, { curve: -40 * DEG }),
        P.straight(7, { gap: true }), P.straight(16), P.straight(22, { curve: 35 * DEG }),
        P.straight(18, { rise: 5 }), P.straight(18, { rise: -5 }), P.straight(24), P.straight(20),
      ],
    },
    {
      id: 'sandy-dunes', name: 'Sandy Dunes', feature: 'Big ramps, no loop', theme: THEME_DESERT, seed: 2,
      pieces: [
        P.straight(16), P.straight(20, { rise: 6 }), P.straight(14, { rise: -6 }), P.straight(6, { gap: true }),
        P.straight(12), P.straight(22, { curve: -55 * DEG }), P.straight(18, { rise: 7 }), P.straight(5, { gap: true }),
        P.straight(16, { rise: -7 }), P.straight(20, { curve: 55 * DEG }), P.straight(16, { rise: 5 }),
        P.straight(16, { rise: -5 }), P.straight(6, { gap: true }), P.straight(24),
        P.straight(18, { curve: 40 * DEG }), P.straight(16, { rise: 6 }), P.straight(5, { gap: true }),
        P.straight(16, { rise: -6 }), P.straight(20, { curve: -45 * DEG }), P.straight(18, { rise: 8 }),
        P.straight(18, { rise: -8 }), P.straight(6, { gap: true }), P.straight(20),
      ],
    },
    {
      id: 'frost-peak', name: 'Frost Peak', feature: 'Two icy loops!', theme: THEME_ICE, seed: 3,
      pieces: [
        P.straight(16), P.straight(20, { curve: 35 * DEG }), P.loop(7), P.straight(12),
        P.straight(20, { curve: -70 * DEG }), P.straight(14, { rise: 5 }), P.straight(6, { gap: true }),
        P.straight(10, { rise: -5 }), P.loop(6), P.straight(14), P.straight(24, { curve: 30 * DEG }),
        P.straight(18, { curve: -40 * DEG }), P.straight(16, { rise: 5 }), P.straight(6, { gap: true }),
        P.straight(16, { rise: -5 }), P.straight(22, { curve: 50 * DEG }), P.straight(18, { rise: 6 }),
        P.straight(18, { rise: -6 }), P.straight(20),
      ],
    },
  ];

  // ============================================================
  // Scene setup
  // ============================================================
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 300);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(60, 90, 40);
  scene.add(sun);

  const charGroup = buildCharacter();
  scene.add(charGroup);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  function disposeGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  // ============================================================
  // Game state
  // ============================================================
  const STATES = { MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', FINISH: 'FINISH' };
  let uiState = STATES.MENU;
  let worldGroup = null;
  let selectedMapIndex = 0;

  const G = {
    map: null, track: null, items: null, ringMesh: null, obsMesh: null,
    distance: 0, runTime: 0, speed: BASE_SPEED,
    lateralOffset: 0, targetLane: 0,
    jumpHeight: 0, jumpVel: 0, grounded: true,
    rollHeld: false, isRolling: false,
    slowTimer: 0, stumbleTimer: 0,
    rings: 0, score: 0,
  };

  // ---------- DOM ----------
  const hudEl = document.getElementById('hud');
  const hudRingsEl = document.getElementById('hud-rings');
  const hudScoreEl = document.getElementById('hud-score');
  const hudTimeEl = document.getElementById('hud-time');
  const hudMessageEl = document.getElementById('hud-message');
  const pauseButton = document.getElementById('pause-button');

  const menuOverlay = document.getElementById('menu-overlay');
  const mapGridEl = document.getElementById('map-grid');
  const startButton = document.getElementById('start-button');

  const pauseOverlay = document.getElementById('pause-overlay');
  const resumeButton = document.getElementById('resume-button');
  const pauseMenuButton = document.getElementById('pause-menu-button');

  const finishOverlay = document.getElementById('finish-overlay');
  const finishTimeEl = document.getElementById('finish-time');
  const finishRingsValueEl = document.getElementById('finish-rings-value');
  const finishScoreValueEl = document.getElementById('finish-score-value');
  const finishStarsEl = document.getElementById('finish-stars');
  const finishBestEl = document.getElementById('finish-best');
  const finishRetryButton = document.getElementById('finish-retry-button');
  const finishMenuButton = document.getElementById('finish-menu-button');

  const touchControls = document.getElementById('touch-controls');
  const touchLeft = document.getElementById('touch-left');
  const touchRight = document.getElementById('touch-right');
  const touchJump = document.getElementById('touch-jump');
  const touchRoll = document.getElementById('touch-roll');

  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function setUiState(next) {
    uiState = next;
    menuOverlay.classList.toggle('hidden', uiState !== STATES.MENU);
    pauseOverlay.classList.toggle('hidden', uiState !== STATES.PAUSED);
    finishOverlay.classList.toggle('hidden', uiState !== STATES.FINISH);
    hudEl.classList.toggle('hidden', uiState !== STATES.PLAYING && uiState !== STATES.PAUSED);
    touchControls.classList.toggle('hidden', !(isTouchDevice && uiState === STATES.PLAYING));
  }

  function getBestTime(mapId) {
    const v = localStorage.getItem(BEST_TIME_PREFIX + mapId);
    return v ? parseFloat(v) : null;
  }
  function setBestTime(mapId, t) {
    localStorage.setItem(BEST_TIME_PREFIX + mapId, String(t));
  }

  let toastTimer = null;
  function showToast(text) {
    hudMessageEl.textContent = text;
    hudMessageEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hudMessageEl.classList.remove('visible'), 1400);
  }

  // ---------- map loading ----------
  function loadMap(mapDef) {
    if (worldGroup) {
      scene.remove(worldGroup);
      disposeGroup(worldGroup);
    }
    worldGroup = new THREE.Group();
    scene.background = new THREE.Color(mapDef.theme.sky);
    scene.fog = new THREE.Fog(mapDef.theme.fog, 45, 150);

    const track = buildTrack(mapDef.pieces);
    worldGroup.add(buildTrackMesh(track, mapDef.theme));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: mapDef.theme.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    worldGroup.add(ground);

    worldGroup.add(buildDecorations(track, mapDef.theme));

    const items = populateItems(track, mapDef.seed);
    const { ringMesh, obsMesh } = buildItemMeshes(items, track);
    worldGroup.add(ringMesh, obsMesh);

    worldGroup.add(buildFinishArch(getFrameAt(track, track.totalLength)));

    scene.add(worldGroup);

    G.map = mapDef;
    G.track = track;
    G.items = items;
    G.ringMesh = ringMesh;
    G.obsMesh = obsMesh;
  }

  function startRun(mapDef) {
    loadMap(mapDef);
    G.distance = 0;
    G.runTime = 0;
    G.speed = BASE_SPEED;
    G.lateralOffset = 0;
    G.targetLane = 0;
    G.jumpHeight = 0;
    G.jumpVel = 0;
    G.grounded = true;
    G.rollHeld = false;
    G.isRolling = false;
    G.slowTimer = 0;
    G.stumbleTimer = 0;
    G.rings = 0;
    G.score = 0;
    updateHud();
    setUiState(STATES.PLAYING);
  }

  // ---------- HUD ----------
  function updateHud() {
    hudRingsEl.textContent = G.rings;
    hudScoreEl.textContent = G.score;
    hudTimeEl.textContent = G.runTime.toFixed(1);
  }

  function stumbleOffset() {
    if (G.stumbleTimer <= 0) return 0;
    const p = 1 - G.stumbleTimer / STUMBLE_DURATION;
    return -Math.sin(Math.PI * p) * STUMBLE_DEPTH;
  }

  function computeStars(time, track, ringsCollected, totalRings) {
    const par = track.totalLength / (BASE_SPEED + (MAX_SPEED - BASE_SPEED) * 0.4);
    let stars = 1;
    if (time <= par * 1.35) stars = 2;
    if (time <= par * 1.05 && ringsCollected >= Math.ceil(totalRings * 0.5)) stars = 3;
    return stars;
  }

  function finishRun() {
    setUiState(STATES.FINISH);
    const time = G.runTime;
    const totalRings = G.items.rings.length;
    const best = getBestTime(G.map.id);
    const isNewBest = !best || time < best;
    if (isNewBest) setBestTime(G.map.id, time);
    const stars = computeStars(time, G.track, G.rings, totalRings);

    finishTimeEl.textContent = time.toFixed(1);
    finishRingsValueEl.textContent = `${G.rings} / ${totalRings}`;
    finishScoreValueEl.textContent = G.score;
    finishStarsEl.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    finishBestEl.classList.toggle('hidden', !isNewBest);
  }

  // ---------- per-frame update ----------
  function checkRings() {
    G.items.rings.forEach((r) => {
      if (r.collected) return;
      if (Math.abs(r.dist - G.distance) > RING_PICKUP_DIST_R) return;
      const laneOffset = r.lane * LANE_WIDTH;
      if (Math.abs(laneOffset - G.lateralOffset) > RING_PICKUP_LANE_R) return;
      r.collected = true;
      hideInstance(G.ringMesh, r.id);
      G.rings += 1;
      G.score += 10;
    });
  }

  function checkObstacles() {
    G.items.obstacles.forEach((o) => {
      if (o.consumed) return;
      if (Math.abs(o.dist - G.distance) > OBSTACLE_HIT_DIST_R) return;
      const laneOffset = o.lane * LANE_WIDTH;
      if (Math.abs(laneOffset - G.lateralOffset) > OBSTACLE_HIT_LANE_R) return;
      o.consumed = true;
      hideInstance(G.obsMesh, o.id);
      if (G.isRolling) {
        G.score += 25;
        showToast('Smashed it! +25');
      } else if (!G.grounded && G.jumpHeight >= OBSTACLE_CLEAR_HEIGHT) {
        G.score += 5;
      } else {
        G.rings = Math.max(0, G.rings - HIT_RING_LOSS);
        G.slowTimer = HIT_SLOW_DURATION;
        G.stumbleTimer = STUMBLE_DURATION;
        showToast(`Ouch! -${HIT_RING_LOSS} rings`);
      }
    });
  }

  function update(dt) {
    G.lateralOffset += (G.targetLane * LANE_WIDTH - G.lateralOffset) * Math.min(1, LANE_LERP_RATE * dt);

    const rampT = Math.min(1, G.runTime / SPEED_RAMP_TIME);
    let speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * rampT;
    if (G.isRolling) speed *= ROLL_SPEED_MULT;
    if (G.slowTimer > 0) {
      speed *= HIT_SPEED_MULT;
      G.slowTimer -= dt;
    }
    G.speed = speed;

    if (!G.grounded) {
      G.jumpVel -= GRAVITY * dt;
      G.jumpHeight += G.jumpVel * dt;
      if (G.jumpHeight <= 0) {
        G.jumpHeight = 0;
        G.jumpVel = 0;
        G.grounded = true;
      }
    }
    if (G.stumbleTimer > 0) G.stumbleTimer = Math.max(0, G.stumbleTimer - dt);

    G.isRolling = G.rollHeld && G.grounded;

    G.distance += G.speed * dt;
    G.runTime += dt;

    if (G.distance >= G.track.totalLength) {
      G.distance = G.track.totalLength;
      finishRun();
      return;
    }

    const gap = getGapAt(G.track, G.distance);
    if (gap && !gap.triggered && G.grounded) {
      gap.triggered = true;
      G.runTime += GAP_TIME_PENALTY;
      G.stumbleTimer = STUMBLE_DURATION;
      showToast('Whoops! Missed the jump (+2s)');
    }

    checkRings();
    checkObstacles();
    updateHud();

    placeCharacterAndCamera(dt);
  }

  function placeCharacterAndCamera(dt) {
    const frame = getFrameAt(G.track, G.distance);
    const worldPos = frame.pos.clone()
      .addScaledVector(frame.right, G.lateralOffset)
      .addScaledVector(frame.up, G.jumpHeight + stumbleOffset());

    charGroup.position.copy(worldPos);
    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent.clone().negate());
    charGroup.quaternion.setFromRotationMatrix(basis);

    animateCharacter(charGroup, dt, { isRolling: G.isRolling, speed: G.speed, grounded: G.grounded });

    const camPos = worldPos.clone().addScaledVector(frame.tangent, -CHASE_DISTANCE).addScaledVector(frame.up, CHASE_HEIGHT);
    camera.position.copy(camPos);
    camera.up.copy(frame.up);
    const lookTarget = worldPos.clone().addScaledVector(frame.tangent, LOOK_AHEAD).addScaledVector(frame.up, LOOK_UP);
    camera.lookAt(lookTarget);
  }

  function idlePreview(t) {
    if (!G.track) return;
    const frame = getFrameAt(G.track, 0);
    charGroup.position.copy(frame.pos).addScaledVector(frame.up, 0);
    charGroup.quaternion.identity();
    animateCharacter(charGroup, 0.016, { isRolling: false, speed: 4, grounded: true });

    const angle = t * 0.00025;
    const radius = 13;
    camera.position.set(frame.pos.x + Math.sin(angle) * radius, frame.pos.y + 6, frame.pos.z + Math.cos(angle) * radius);
    camera.up.set(0, 1, 0);
    camera.lookAt(frame.pos.x, frame.pos.y + 1.2, frame.pos.z);
  }

  // ---------- controls ----------
  function jump() {
    if (G.grounded && uiState === STATES.PLAYING) {
      G.grounded = false;
      G.jumpVel = JUMP_VELOCITY;
    }
  }
  function stepLane(delta) {
    if (uiState !== STATES.PLAYING) return;
    G.targetLane = clamp(G.targetLane + delta, -1, 1);
  }
  function pauseGame() {
    if (uiState === STATES.PLAYING) setUiState(STATES.PAUSED);
  }
  function resumeGame() {
    if (uiState === STATES.PAUSED) setUiState(STATES.PLAYING);
  }

  window.addEventListener('keydown', (e) => {
    if (uiState === STATES.PLAYING) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { stepLane(-1); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { stepLane(1); }
      else if (e.code === 'Space') { jump(); e.preventDefault(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { G.rollHeld = true; }
      else if (e.code === 'Escape') { pauseGame(); }
    } else if (uiState === STATES.PAUSED && e.code === 'Escape') {
      resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.rollHeld = false;
  });

  touchLeft.addEventListener('click', () => stepLane(-1));
  touchRight.addEventListener('click', () => stepLane(1));
  touchJump.addEventListener('click', jump);
  touchRoll.addEventListener('pointerdown', () => { G.rollHeld = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => touchRoll.addEventListener(ev, () => { G.rollHeld = false; }));

  pauseButton.addEventListener('click', pauseGame);
  resumeButton.addEventListener('click', resumeGame);
  pauseMenuButton.addEventListener('click', () => { setUiState(STATES.MENU); refreshMapGrid(); });
  finishRetryButton.addEventListener('click', () => startRun(G.map));
  finishMenuButton.addEventListener('click', () => { setUiState(STATES.MENU); refreshMapGrid(); });
  startButton.addEventListener('click', () => startRun(MAPS[selectedMapIndex]));

  // ---------- map select UI ----------
  function refreshMapGrid() {
    mapGridEl.innerHTML = '';
    MAPS.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = 'map-card' + (idx === selectedMapIndex ? ' selected' : '');
      card.dataset.index = String(idx);

      const swatch = document.createElement('div');
      swatch.className = 'map-swatch';
      swatch.style.background = `linear-gradient(135deg, ${m.theme.sky}, ${m.theme.road})`;

      const name = document.createElement('div');
      name.className = 'map-name';
      name.textContent = m.name;

      const feature = document.createElement('div');
      feature.className = 'map-feature';
      feature.textContent = m.feature;

      const best = document.createElement('div');
      best.className = 'map-best';
      const bestTime = getBestTime(m.id);
      best.textContent = bestTime ? `Best: ${bestTime.toFixed(1)}s` : 'Not raced yet';

      card.append(swatch, name, feature, best);
      card.addEventListener('click', () => selectMap(idx));
      mapGridEl.appendChild(card);
    });
  }

  function selectMap(idx) {
    selectedMapIndex = idx;
    Array.from(mapGridEl.children).forEach((c, i) => c.classList.toggle('selected', i === idx));
    startButton.disabled = false;
    startButton.textContent = `Race: ${MAPS[idx].name}`;
    loadMap(MAPS[idx]);
  }

  // ---------- boot ----------
  refreshMapGrid();
  selectMap(0);
  setUiState(STATES.MENU);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (uiState === STATES.PLAYING) {
      update(dt);
    } else if (uiState === STATES.MENU) {
      idlePreview(performance.now());
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
