import * as THREE from 'three';

export const PAD_TOP = 2.2; // y of the launch mount surface

const flameVert = /* glsl */ `
  varying float vT;
  void main() {
    vT = -position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const flameFrag = /* glsl */ `
  uniform float uTime; uniform float uCore; uniform float uAmt;
  varying float vT;
  void main() {
    float t = clamp(vT, 0.0, 1.0);
    float diamonds = 1.0 + 0.35 * sin(t * 38.0 - uTime * 28.0) * (1.0 - t);
    vec3 hot = mix(vec3(0.55, 0.7, 1.2), vec3(1.5, 1.3, 1.1), uCore);
    vec3 col = mix(hot, vec3(1.5, 0.55, 0.14), smoothstep(0.0, 0.5, t));
    col = mix(col, vec3(0.9, 0.12, 0.02), smoothstep(0.5, 1.0, t));
    float a = (1.0 - t) * (1.0 - t) * diamonds * uAmt * mix(0.7, 0.9, uCore);
    gl_FragColor = vec4(col * diamonds, a);
  }
`;

function flameMesh(radius, core) {
  const geo = new THREE.ConeGeometry(radius, 1, 28, 1, true);
  geo.rotateX(Math.PI);
  geo.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    uniforms: { uTime: { value: 0 }, uCore: { value: core }, uAmt: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}


function paintTexture(w, h, draw, repeatX = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.offset.x = 0.5; // canvas centre faces the camera (+z)
  t.repeat.x = repeatX;
  return t;
}

function stageTexture({ soot = 0, label = false, tall = 2048 }) {
  return paintTexture(512, tall, (g, w, h) => {
    g.fillStyle = '#eef0f3'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { // paint grain
      const v = 215 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 2},0.18)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
    g.strokeStyle = 'rgba(70,75,85,0.35)'; g.lineWidth = 1.4; // panel seams
    const seg = h / (tall > 1000 ? 8 : 3);
    for (let y = seg; y < h; y += seg) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(70,75,85,0.18)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += w / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let i = 0; i < 70; i++) { // rivets / small scuffs
      g.fillStyle = 'rgba(90,95,105,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    for (let i = 0; i < 40; i++) { // water / dirt streaks
      const x = Math.random() * w, y = Math.random() * h * 0.85, l = 40 + Math.random() * 260;
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(110,100,90,0.0)'); gr.addColorStop(0.3, 'rgba(110,100,90,0.10)'); gr.addColorStop(1, 'rgba(110,100,90,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2 + Math.random() * 4, l);
    }
    if (soot) { // engine soot, heaviest at the base
      const gr = g.createLinearGradient(0, h, 0, h * (1 - soot));
      gr.addColorStop(0, 'rgba(18,16,15,0.92)'); gr.addColorStop(0.55, 'rgba(40,36,33,0.35)'); gr.addColorStop(1, 'rgba(40,36,33,0)');
      g.fillStyle = gr; g.fillRect(0, h * (1 - soot), w, h * soot);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w, l = h * soot * (0.2 + Math.random() * 0.8);
        const sg = g.createLinearGradient(0, h, 0, h - l);
        sg.addColorStop(0, 'rgba(15,13,12,0.5)'); sg.addColorStop(1, 'rgba(15,13,12,0)');
        g.fillStyle = sg; g.fillRect(x, h - l, 1 + Math.random() * 5, l);
      }
    }
    if (label) {
      g.save(); g.translate(w / 2, h * 0.52); g.rotate(-Math.PI / 2);
      g.fillStyle = '#15171b'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 64px "Space Grotesk", Arial, sans-serif';
      g.fillText('P R O J E C T   S P A C E', 0, 0);
      g.restore();
      g.fillStyle = '#d8261b'; g.fillRect(w / 2 - 30, h * 0.52 - 700, 60, 8);
    }
  });
}

export function buildRocket() {
  const root = new THREE.Group(); // origin = engine base
  const paint = (map) => new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, metalness: 0.05, roughness: 0.46, clearcoat: 0.5, clearcoatRoughness: 0.28 });
  const white = paint(stageTexture({ tall: 512 }));
  const stage1 = paint(stageTexture({ soot: 0.2, label: true }));
  const stage2 = paint(stageTexture({ tall: 1024 }));
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.5, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9099, metalness: 0.6, roughness: 0.5 });
  const red = new THREE.MeshPhysicalMaterial({ color: 0xc9211a, metalness: 0.1, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const r = 1.85;

  const cyl = (rt, rb, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 48), mat);
    m.position.y = y;
    root.add(m);
    return m;
  };
  cyl(1.6, 1.8, 3, 1.5, black); // engine skirt
  cyl(r, r, 40, 23, stage1); // first stage
  cyl(r + 0.02, r + 0.02, 1.2, 14, black); // stripe
  cyl(r + 0.02, r + 0.02, 0.5, 33, black);
  cyl(r, r, 4, 45, black); // interstage
  cyl(r, r, 14, 54, stage2); // second stage

  // fairing: ogive with red nose + white band, like the reference
  const pts = [];
  const h0 = 61, H = 12;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(new THREE.Vector2(Math.max(0.001, r * Math.sqrt(1 - Math.pow(t, 1.9))), h0 + t * H));
  }
  const fairing = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), red);
  root.add(fairing);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 1.4, 48), white);
  band.position.y = h0 + 0.7;
  root.add(band);

  // grid fins & landing legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 2.6), steel);
    fin.position.set(Math.cos(a) * (r + 1.2), 43, Math.sin(a) * (r + 1.2));
    fin.rotation.y = -a;
    root.add(fin);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, 0.7), black);
    leg.position.set(Math.cos(a) * (r + 0.7), 7, Math.sin(a) * (r + 0.7));
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    root.add(leg);
  }
  // engine bells
  const bellGeo = new THREE.CylinderGeometry(0.35, 0.6, 1.2, 16, 1, true);
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rad = i === 8 ? 0 : 1.05;
    const b = new THREE.Mesh(bellGeo, steel);
    b.position.set(Math.cos(a) * rad, -0.2, Math.sin(a) * rad);
    root.add(b);
  }

  // plume
  const outer = flameMesh(1.9, 0);
  const inner = flameMesh(0.95, 1);
  const flame = new THREE.Group();
  flame.add(outer, inner);
  flame.position.y = -0.4;
  root.add(flame);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const light = new THREE.PointLight(0xff8a3c, 0, 320, 2);
  light.position.y = -3;
  root.add(light);

  return {
    root, flame, light,
    setThrust(t, time) {
      const flick = 0.92 + 0.08 * Math.sin(time * 60) + 0.05 * Math.sin(time * 37.3);
      flame.visible = t > 0.01;
      outer.scale.set(0.55 + 0.45 * t, (8 + 50 * t * t) * flick, 0.55 + 0.45 * t);
      inner.scale.set(0.5 + 0.5 * t, (5 + 26 * t * t) * flick, 0.5 + 0.5 * t);
      for (const m of [outer, inner]) {
        m.material.uniforms.uTime.value = time;
        m.material.uniforms.uAmt.value = Math.min(1, t * 1.4);
      }
      light.intensity = t * 90000 * flick;
    },
  };
}

export function buildPad(concreteTex) {
  const g = new THREE.Group();
  concreteTex.repeat.set(10, 10);
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.92, bumpMap: concreteTex, bumpScale: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.55, metalness: 0.55 });

  const slab = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, 0.4, 64), concrete);
  slab.position.y = 0.2;
  g.add(slab);
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, PAD_TOP, 48), dark);
  mount.position.y = PAD_TOP / 2;
  g.add(mount);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 60), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  trench.position.set(0, 0.45, 32);
  g.add(trench);

  // blast glow thrown on the pad by the plume
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d'); const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.35, 'rgba(255,120,40,0.45)'); gr.addColorStop(1, 'rgba(255,80,10,0)');
  gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: new THREE.Color(1.6, 1.2, 0.9) }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.7; g.add(glow);

  // service tower
  const tower = new THREE.Group();
  tower.position.set(13, 0, -2);
  const W = 2.6, TH = 96;
  const col = new THREE.BoxGeometry(0.45, TH, 0.45);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(col, steel);
    c.position.set(sx * W, TH / 2, sz * W);
    tower.add(c);
  }
  const rungs = Math.floor(TH / 4);
  const rungGeo = new THREE.BoxGeometry(W * 2, 0.22, 0.22);
  const inst = new THREE.InstancedMesh(rungGeo, steel, rungs * 4);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 1; i <= rungs; i++) for (let s = 0; s < 4; s++) {
    dummy.position.set(0, i * 4, 0);
    dummy.rotation.set(0, (s * Math.PI) / 2, 0);
    dummy.translateZ(W);
    dummy.updateMatrix();
    inst.setMatrixAt(k++, dummy.matrix);
  }
  tower.add(inst);
  const diag = new THREE.BoxGeometry(0.14, Math.hypot(4, W * 2), 0.14);
  const dInst = new THREE.InstancedMesh(diag, steel, rungs * 2);
  k = 0;
  for (let i = 0; i < rungs; i++) for (let s = 0; s < 2; s++) {
    dummy.position.set(0, i * 4 + 2, 0);
    dummy.rotation.set(0, s * Math.PI, 0);
    dummy.translateZ(W);
    dummy.rotateZ(Math.atan2(W * 2, 4) * (i % 2 ? 1 : -1));
    dummy.updateMatrix();
    dInst.setMatrixAt(k++, dummy.matrix);
  }
  tower.add(dInst);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 16, 8), steel);
  mast.position.y = TH + 8;
  tower.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.1) }));
  beacon.position.y = TH + 16;
  tower.add(beacon);
  // work platforms
  for (const y of [24, 46, 68, 88]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3, 0.35, W * 2 + 3), steel);
    deck.position.y = y; tower.add(deck);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3, 1.0, 0.1), steel);
    for (const sz of [-1, 1]) { const r2 = rail.clone(); r2.position.set(0, y + 0.7, sz * (W + 1.5)); tower.add(r2); }
  }
  g.add(tower);

  // crew-access arm that swings clear at liftoff
  const arm = new THREE.Group();
  arm.position.set(13 - W, 52, -2);
  const armBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 2.2), steel);
  armBox.scale.x = 7;
  armBox.position.x = -3.5;
  arm.add(armBox);
  g.add(arm);

  // flood-lights
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2) });
  for (const [x, z] of [[40, 20], [-40, 30], [35, -45], [-30, -45]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 24, 8), steel);
    pole.position.set(x, 12, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.2), lampMat);
    lamp.position.set(x, 24.4, z);
    lamp.lookAt(0, 24, 0);
    g.add(pole, lamp);
  }
  // fuel spheres in the distance for scale
  const tank = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.4, metalness: 0.5 });
  for (const [x, z, s] of [[-70, -80, 9], [-52, -92, 7], [90, -70, 8]]) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 16), tank);
    t.position.set(x, s, z);
    g.add(t);
  }
  g.traverse((o) => { if (o.isMesh && o !== glow) { o.castShadow = true; o.receiveShadow = true; } });
  slab.castShadow = false;
  return { group: g, arm, glow };
}

export function buildDebris() {
  const geo = new THREE.BufferGeometry();
  const n = 420;
  const dir = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(0.35 + Math.random() * 0.65);
    dir.set([v.x, v.y, v.z], i * 3);
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uScale: { value: 800 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uT; uniform float uScale; varying float vS;
      void main() {
        vS = aSeed;
        float e = 1.0 - pow(1.0 - uT, 2.5);
        vec3 p = position * (60.0 + 420.0 * aSeed) * e;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.6 + 1.6 * aSeed) * uScale / max(-mv.z, 0.001);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT; uniform float uFade; varying float vS;
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        vec3 c = mix(vec3(2.6, 1.8, 0.9), vec3(1.4, 0.35, 0.08), vS);
        gl_FragColor = vec4(c, uFade * (1.0 - uT));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
