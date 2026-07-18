/* ============================================================
   WONKA CHARACTER . a REAL 3D model, built in code.
   No images, no sprites, no video. Every part is geometry with
   materials, assembled on a hand-built rig (hips, shoulders,
   neck, hat) and animated procedurally in real time, so the
   character genuinely turns in 3D and his legs actually swing.
   Style: collectible vinyl chibi (Jay picked candidate 4):
   oversized head, tiny body, glossy surfaces, big eyes.
   Rig faces +Z at rotation.y = 0. Feet stand on y = 0.
   Export: buildWonka(THREE) -> { root, update(dt, walking, speed) }
   ============================================================ */

export function buildWonka(THREE) {
  const C = {
    coat:   0x7E2442,   // plum-burgundy tailcoat
    coatHi: 0x94304F,
    gold:   0xD9A441,   // mustard-gold waistcoat
    goldHi: 0xF0C56A,
    hat:    0x1A1119,   // near-black top hat
    copper: 0xB87333,
    skin:   0xF3CFA6,
    hair:   0x5B3418,
    eye:    0x140B09,
    white:  0xF8F2E6,
    shoe:   0x2E1C12,
    trouser:0x4B3222,
  };
  const mat = (color, rough = 0.42, metal = 0.0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const M = {
    coat: mat(C.coat, 0.33), coatHi: mat(C.coatHi, 0.33),
    gold: mat(C.gold, 0.3, 0.2), goldHi: mat(C.goldHi, 0.26, 0.35),
    hat: mat(C.hat, 0.38), copper: mat(C.copper, 0.26, 0.6),
    skin: mat(C.skin, 0.48), hair: mat(C.hair, 0.6),
    eye: mat(C.eye, 0.14), white: mat(C.white, 0.28),
    shoe: mat(C.shoe, 0.38), trouser: mat(C.trouser, 0.6),
  };

  const root = new THREE.Group();      // yaw pivot
  const bob = new THREE.Group();       // whole-body bounce
  root.add(bob);

  /* ---------- legs: hips at 0.62, feet on the ground ---------- */
  const HIP_Y = 0.74;
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.2 * side, HIP_Y, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.34, 6, 14), M.trouser);
    thigh.position.y = -0.28;
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), M.shoe);
    shoe.scale.set(1, 0.66, 1.5);
    shoe.position.set(0, -0.6, 0.08);
    hip.add(thigh, shoe);
    return hip;
  }
  const legL = makeLeg(1), legR = makeLeg(-1);
  bob.add(legL, legR);

  /* ---------- torso: small body, the chibi way ---------- */
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  bob.add(torso);

  // shirt core (what shows between the open coat fronts)
  const shirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.42, 8, 20), M.white);
  shirt.position.y = 0.34;
  shirt.scale.set(1, 1, 0.8);
  torso.add(shirt);

  // gold waistcoat over the shirt
  const vest = new THREE.Mesh(new THREE.SphereGeometry(0.35, 22, 18), M.gold);
  vest.scale.set(0.84, 1.15, 0.62);
  vest.position.set(0, 0.34, 0.14);
  torso.add(vest);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.goldHi);
    b.rotation.x = Math.PI / 2;
    b.position.set(0, 0.44 - i * 0.13, 0.34);
    torso.add(b);
  }

  // the plum tailcoat: two long open fronts + a back panel that flares into tails
  [-1, 1].forEach((sgn) => {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.86, 0.14), M.coat);
    front.geometry.translate(0, -0.43, 0);
    front.position.set(0.28 * sgn, 0.62, 0.19);
    front.rotation.z = 0.06 * sgn;
    front.rotation.y = -0.34 * sgn;
    torso.add(front);
    // wide satin lapel on each front
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.06), M.coatHi);
    lap.position.set(0.21 * sgn, 0.5, 0.29);
    lap.rotation.z = 0.3 * sgn;
    lap.rotation.y = -0.3 * sgn;
    torso.add(lap);
  });
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.4, 8, 20), M.coat);
  back.position.set(0, 0.34, -0.09);
  back.scale.set(1.04, 1, 0.66);
  torso.add(back);
  [-1, 1].forEach((sgn) => {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.09), M.coat);
    tail.geometry.translate(0, -0.33, 0);
    tail.position.set(0.15 * sgn, 0.2, -0.27);
    tail.rotation.x = -0.2;
    tail.rotation.z = 0.05 * sgn;
    torso.add(tail);
  });

  // collar ring where the big head meets the little body
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.33, 0.12, 22), M.white);
  collar.position.y = 0.76;
  torso.add(collar);
  // the bow tie . the single most 'Wonka' accessory after the hat
  const tie = new THREE.Group();
  [-1, 1].forEach((sgn) => {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), M.coatHi);
    wing.scale.set(1.05, 0.72, 0.42);
    wing.position.set(0.12 * sgn, 0, 0);
    wing.rotation.z = 0.34 * sgn;
    tie.add(wing);
  });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), M.coat);
  knot.scale.set(0.8, 1, 0.6);
  tie.add(knot);
  tie.position.set(0, 0.75, 0.3);
  torso.add(tie);

  /* ---------- arms ---------- */
  function makeArm(side) {
    const sh = new THREE.Group();
    sh.position.set(0.44 * side, 0.56, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.28, 6, 12), M.coat);
    upper.position.y = -0.2;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.07, 12), M.goldHi);
    cuff.position.y = -0.36;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), M.skin);
    hand.position.y = -0.44;
    sh.add(upper, cuff, hand);
    return sh;
  }
  const armL = makeArm(1), armR = makeArm(-1);
  torso.add(armL, armR);

  // THE cane . Wonka's signature prop, so it is deliberately oversized:
  // dark shaft, brass collars, and a big golden knob that catches the light
  const cane = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 1.5, 12), M.hat);
  shaft.position.y = -0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), M.goldHi);
  knob.scale.set(1, 1.15, 1);
  knob.position.y = 0.68;
  const collarTop = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.09, 14), M.copper);
  collarTop.position.y = 0.56;
  const collarLow = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.06, 14), M.copper);
  collarLow.position.y = 0.2;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14), M.goldHi);
  ferrule.position.y = -0.8;
  cane.add(shaft, knob, collarTop, collarLow, ferrule);
  // held out from the hand, planted forward like a showman's stick
  cane.position.set(0.03, -0.46, 0.1);
  cane.rotation.set(0.2, 0, -0.1);
  armR.add(cane);

  /* ---------- head: the hero shape, ~40% of total height ---------- */
  const neck = new THREE.Group();
  neck.position.y = 0.86;        // sits high enough to leave the waistcoat visible
  torso.add(neck);

  const HEAD_R = 0.66;
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 30, 24), M.skin);
  head.scale.set(1, 0.98, 0.96);
  head.position.y = HEAD_R;      // head bottom rests on the collar
  neck.add(head);
  const HY = HEAD_R;             // head centre, local

  // hair: a cap over the TOP only, hairline sitting above the brows,
  // dipping lower at the back (thetaStart/Length keeps the face clear)
  // one clean cap, tilted back a touch so the hairline sits high at the front
  // and lower at the back (no hard-edged patches . they read as glitches)
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 1.035, 30, 20, 0, Math.PI * 2, 0, Math.PI * 0.46), M.hair);
  hairCap.position.y = HY;
  hairCap.rotation.x = -0.16;
  neck.add(hairCap);
  // wavy hair flicking out under the hat brim on both sides
  [-1, 1].forEach((sgn) => {
    for (let i = 0; i < 3; i++) {
      const wave = new THREE.Mesh(new THREE.SphereGeometry(0.15 - i * 0.018, 12, 10), M.hair);
      wave.position.set((0.52 + i * 0.045) * sgn, HY + 0.12 - i * 0.11, -0.14 - i * 0.05);
      wave.scale.set(0.6, 0.85, 0.95);
      neck.add(wave);
    }
  });

  // big vinyl eyes, wide apart, on the front of the sphere
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), M.eye);
    e.position.set(0.25 * s, HY + 0.04, 0.50);
    e.scale.set(1, 1.15, 0.42);
    neck.add(e);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), M.white);
    hi.position.set(0.25 * s + 0.05 * s, HY + 0.11, 0.585);
    hi.scale.set(1, 1, 0.4);
    neck.add(hi);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), M.hair);
    brow.position.set(0.25 * s, HY + 0.20, 0.515);
    brow.rotation.z = -0.16 * s;
    neck.add(brow);
  });

  // nose, mustache, smile . all on the lower front of the face
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 14), M.skin);
  nose.position.set(0, HY - 0.12, 0.585);
  neck.add(nose);
  [-1, 1].forEach((s) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.15, 5, 10), M.hair);
    m.position.set(0.095 * s, HY - 0.25, 0.545);
    m.rotation.set(0.22, 0, (Math.PI / 2 - 0.32) * s);
    neck.add(m);
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.026, 8, 20, Math.PI), M.eye);
  smile.position.set(0, HY - 0.33, 0.515);
  smile.rotation.set(0.1, 0, Math.PI);
  neck.add(smile);

  /* ---------- top hat, on its own pivot so it can tip ---------- */
  const hatG = new THREE.Group();
  hatG.position.y = HY + HEAD_R * 0.72;
  neck.add(hatG);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.07, 30), M.hat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.06, 30), M.hat);
  crown.position.y = 0.56;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.615, 0.615, 0.18, 30), M.copper);
  band.position.y = 0.14;
  hatG.add(brim, crown, band);

  /* ---------- procedural walk cycle ---------- */
  let phase = 0, blend = 0, idleT = 0;
  const lerp = (a, b, k) => a + (b - a) * k;

  function update(dt, walking, speed) {
    const sp = speed === undefined ? 1 : speed;
    blend = lerp(blend, walking ? 1 : 0, Math.min(1, dt * 8));
    if (walking) phase += dt * 7.2 * sp;
    idleT += dt;

    const swing = Math.sin(phase) * 0.6 * blend;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    legL.position.y = HIP_Y + Math.max(0, Math.sin(phase)) * 0.045 * blend;
    legR.position.y = HIP_Y + Math.max(0, -Math.sin(phase)) * 0.045 * blend;
    armL.rotation.x = -swing * 0.7;
    armR.rotation.x = swing * 0.7;
    armL.rotation.z = 0.18 - blend * 0.06;
    armR.rotation.z = -0.18 + blend * 0.06;

    const bounce = Math.abs(Math.sin(phase)) * 0.07 * blend;
    const breathe = Math.sin(idleT * 1.7) * 0.016 * (1 - blend);
    bob.position.y = bounce + breathe;
    torso.rotation.y = Math.sin(phase) * 0.1 * blend;
    torso.rotation.z = Math.sin(phase) * 0.03 * blend;
    neck.rotation.y = -Math.sin(phase) * 0.055 * blend;
    neck.rotation.x = 0.03 * blend + Math.sin(idleT * 1.3) * 0.028 * (1 - blend);
    // the heavy hat lags a beat behind the head
    hatG.rotation.z = -Math.sin(phase - 0.5) * 0.05 * blend;
    hatG.rotation.x = Math.cos(phase - 0.5) * 0.028 * blend;
  }

  return { root, update };
}
