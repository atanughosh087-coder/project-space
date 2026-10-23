import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Particles } from './particles.js';
import { buildRocket, buildPad, buildDebris, PAD_TOP } from './rocket.js';
import { createSky, createStars, createEarth, createGround, createCloudDeck, createConcrete, createHills, SUN, SUN_LOW, SUN_HIGH, CLOUD_H } from './environment.js';

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* ---------- timeline (all in scroll progress p: 0..1) ---------- */
const T = { ignite: 0.02, liftoff: 0.07, coastEnd: 0.8, blast: 0.86, blastEnd: 0.96, card: 0.915 };
const S_MAX = 4200;
const climb = (p) => {
  const u = clamp01((p - T.liftoff) / (T.coastEnd - T.liftoff));
  return S_MAX * Math.pow(u, 2.2) + Math.max(0, p - T.coastEnd) * ((S_MAX * 2.2) / (T.coastEnd - T.liftoff));
};
const tilt = (p) => smooth(0.18, 0.85, p) * 0.5;

// precomputed flight path so scrolling back and forth is deterministic
const N = 800;
const path = [];
{
  let x = 0, y = 0, prev = 0;
  for (let i = 0; i <= N; i++) {
    const p = i / N, s = climb(p), th = tilt(p), ds = s - prev;
    prev = s; x -= Math.sin(th) * ds; y += Math.cos(th) * ds;
    path.push([x, y, th]);
  }
}
const samplePath = (p) => {
  const f = clamp01(p) * N, i = Math.min(N - 1, Math.floor(f)), t = f - i;
  const a = path[i], b = path[i + 1];
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
};

/* ---------- renderer ---------- */
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
scene.fog = new THREE.FogExp2(0xffb48a, 0.0009);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      vec2 off = c * r2 * 0.006;                       // lens fringing
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - smoothstep(0.15, 0.85, r2) * 0.4;   // vignette
      col += (rnd(vUv * 900.0) - 0.5) * 0.035;          // film grain
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(film);

/* ---------- world ---------- */
const sky = createSky(); scene.add(sky);
const stars = createStars(); scene.add(stars);
const { group: earthGroup, earthMat, atmoMat } = createEarth(); scene.add(earthGroup);
const ground = createGround(); scene.add(ground);
const hills = createHills(); hills.material.transparent = true; scene.add(hills);
const deck = createCloudDeck(); scene.add(deck);
const { group: padGroup, arm, glow } = buildPad(createConcrete()); scene.add(padGroup);
const sunLight = new THREE.DirectionalLight(0xffb070, 3);
sunLight.target.position.set(0, 40, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
Object.assign(sunLight.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, near: 1, far: 1200 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.15;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a3226, 0.25);
scene.add(hemi);

const rocket = buildRocket();
scene.add(rocket.root);

const fire = new Particles('fire', 1400); scene.add(fire.points);
const smoke = new Particles('smoke', 1800); scene.add(smoke.points);

// blast
const blast = new THREE.Group(); blast.visible = false; scene.add(blast);
const puff = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const fbMats = [new THREE.Color(5, 4.2, 3), new THREE.Color(3.2, 1.2, 0.3), new THREE.Color(1.1, 0.2, 0.05)].map((color) =>
  new THREE.SpriteMaterial({ map: puff, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
const fireballs = [];
for (let i = 0; i < 28; i++) {
  const layer = i < 6 ? 0 : i < 16 ? 1 : 2;
  const sp = new THREE.Sprite(fbMats[layer]);
  sp.userData = { dir: new THREE.Vector3().randomDirection(), k: 0.3 + Math.random() * 0.7, layer };
  fireballs.push(sp); blast.add(sp);
}
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
blast.add(ring);
const debris = buildDebris(); blast.add(debris);

// image-based light from the golden-hour sky so metal/clearcoat have something real to reflect
{
  const envScene = new THREE.Scene();
  const envSky = createSky();
  envScene.add(envSky);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  envSky.geometry.dispose(); envSky.material.dispose();
}

/* ---------- sizing ---------- */
let baseFov = 38, stageH = 720;
const pointUniforms = [fire.uniforms, smoke.uniforms, debris.material.uniforms];
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h;
  // on portrait screens widen the vertical FOV so the rocket + tower still fit
  baseFov = w / h < 1 ? mix(38, 62, clamp01((1 - w / h) / 0.6)) : 38;
  stageH = h;
  stars.material.uniforms.uPx.value = DPR;
  film.uniforms.uAspect.value = w / h;
}
window.addEventListener('resize', resize);
resize();

/* ---------- colour ramps for haze vs altitude ---------- */
const C = (h) => new THREE.Color(h);
const hazeGold = C(0xe8a98c), hazeDay = C(0x9cc2ee), cloudGrey = C(0xc9ccd6);
const tmp = new THREE.Color();
const goldLight = C(0xffb070), whiteLight = C(0xfff4e6);

/* ---------- scroll state ---------- */
let target = 0, p = 0, started = false;
const readScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = max > 0 ? clamp01(window.scrollY / max) : 0;
};
window.addEventListener('scroll', readScroll, { passive: true });

if (params.has('p')) { // debug hook: ?p=0.5 renders that moment directly
  target = p = parseFloat(params.get('p'));
}

/* ---------- HUD ---------- */
const hud = { t: $('hud-t'), alt: $('hud-alt'), vel: $('hud-vel'), phase: $('phase'), flash: $('flash'), project: $('project'), bar: $('progress').firstElementChild };
const phases = [
  [0, 'Pre-launch', 'On the pad'],
  [T.ignite, 'Ignition', 'Engines at full thrust'],
  [T.liftoff, 'Liftoff', 'Clearing the tower'],
  [0.3, 'Max-Q', 'Punching through the clouds'],
  [0.5, 'Atmosphere', 'The sky falls away'],
  [0.7, 'Orbit', 'Above the Earth'],
  [T.blast - 0.004, 'Detonation', 'Mission event'],
];
let lastPhase = -1;
function updateHud(alt, vel) {
  hud.t.textContent = (() => { const s = Math.max(0, Math.round((p - T.ignite) * 620)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); })();
  hud.alt.textContent = Math.round(alt * 0.05).toLocaleString() + ' km';
  hud.vel.textContent = Math.round(vel).toLocaleString() + ' m/s';
  let idx = 0; phases.forEach((ph, i) => { if (p >= ph[0]) idx = i; });
  if (idx !== lastPhase) {
    lastPhase = idx;
    hud.phase.innerHTML = `${phases[idx][1]}<b>${phases[idx][2]}</b>`;
  }
  hud.phase.style.opacity = p > T.card - 0.01 ? 0 : 1;
  hud.bar.style.transform = `scaleY(${p})`;
  document.body.classList.toggle('scrolled', p > 0.01);
}

/* ---------- frame ---------- */
let last = performance.now();
let time = 0, hudTick = 0;
const prevNozzle = new THREE.Vector3(), nozzle = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
let havePrev = false;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  p += (target - p) * (1 - Math.exp(-dt * (params.has('p') ? 100 : 5)));
  if (Math.abs(target - p) < 1e-5) p = target;

  /* rocket kinematics */
  const pr = Math.min(p, T.blast + 0.004);
  const [rx, ry, th] = samplePath(pr);
  const alt = ry;
  const liftT = smooth(T.liftoff - 0.01, T.liftoff + 0.04, p);
  const thrust = smooth(T.ignite, T.liftoff, p) * (p > T.blast ? 0 : 1);
  const hold = 1 - smooth(T.ignite, T.liftoff, p); // vibration while clamped
  rocket.root.position.set(rx, PAD_TOP + ry, 0);
  rocket.root.rotation.set(0, 0, th);
  const shake = (thrust * (1 - liftT * 0.85) * 0.07) + 0.002;
  rocket.root.position.x += (Math.random() - 0.5) * shake;
  rocket.root.position.z += (Math.random() - 0.5) * shake;
  rocket.root.visible = p < T.blast + 0.003;
  rocket.setThrust(thrust, time);
  arm.rotation.y = -smooth(T.liftoff - 0.015, T.liftoff + 0.02, p) * 1.25;
  arm.scale.setScalar(1);

  nozzle.set(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), th).add(rocket.root.position);
  if (!havePrev) { prevNozzle.copy(nozzle); havePrev = true; }

  /* sky / atmosphere state */
  const a = clamp01(ry / 3800);
  const spaceF = smooth(0.2, 0.65, a);
  SUN.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0.04, 0.6, a)).normalize();
  for (const u of [sky.material.uniforms, deck.material.uniforms, earthMat.uniforms, atmoMat.uniforms]) u.uSun.value.copy(SUN);
  sky.material.uniforms.uSpace.value = spaceF;
  sunLight.position.copy(SUN).multiplyScalar(600).add(sunLight.target.position);
  sunLight.color.copy(goldLight).lerp(whiteLight, smooth(0.02, 0.4, a));
  sunLight.intensity = mix(3.4, 4.6, spaceF);
  sunLight.castShadow = ry < 260;
  hemi.intensity = mix(0.25, 0.08, spaceF);
  scene.environmentIntensity = mix(1.6, 0.12, spaceF);
  renderer.toneMappingExposure = mix(0.95, 1.05, spaceF);
  tmp.copy(hazeGold).lerp(hazeDay, smooth(0.0, 0.2, a)).lerp(C(0x000000), smooth(0.25, 0.6, a));
  const inCloud = Math.exp(-Math.pow((camera.position.y - CLOUD_H) / 160, 2));
  scene.fog.color.copy(tmp).lerp(cloudGrey, inCloud * 0.85);
  scene.fog.density = 0.0006 * (1 - smooth(0.0, 0.25, a)) + 0.0042 * inCloud;
  deck.position.x = camera.position.x; deck.position.z = camera.position.z;
  deck.material.uniforms.uCamY.value = camera.position.y;
  deck.material.uniforms.uTime.value = time;
  deck.material.uniforms.uAmt.value = 1 - smooth(2900, 4100, camera.position.y);
  deck.material.uniforms.uHaze.value.copy(tmp).multiplyScalar(0.9);
  deck.visible = deck.material.uniforms.uAmt.value > 0.01;
  stars.material.uniforms.uOpacity.value = smooth(0.3, 0.75, a);
  ground.material.opacity = 1 - smooth(0.1, 0.24, a);
  ground.visible = ground.material.opacity > 0.01;
  hills.material.opacity = ground.material.opacity; hills.visible = ground.visible;
  earthMat.uniforms.uTime.value = time;
  padGroup.visible = ground.visible;
  glow.material.opacity = thrust * (1 - smooth(20, 140, ry)) * 0.45;
  film.uniforms.uTime.value = time % 10;

  /* camera rig */
  const kFollow = smooth(0.1, 0.24, p);
  const kSpace = smooth(0.55, 0.84, p);
  const kAsc = smooth(0.02, 0.35, p);
  const off = new THREE.Vector3(
    mix(mix(62, 46, kAsc), 80, kSpace),
    mix(mix(16, -2, kAsc), 85, kSpace),
    mix(mix(128, 92, kAsc), 210, kSpace),
  );
  const pull = 1 + smooth(T.blast, T.blast + 0.08, p) * 0.45;
  off.multiplyScalar(pull);
  const baseY = (PAD_TOP + ry) * kFollow;
  camPos.set(rx + off.x, baseY + off.y, off.z);
  const lookY = mix(mix(38, PAD_TOP + ry + 20, smooth(0.09, 0.24, p)), PAD_TOP + ry + 6, kSpace);
  camLook.set(rx, lookY, 0);
  // engine rumble felt in the camera
  const rumble = (thrust * (1 - liftT * 0.6) + smooth(0.5, 0.7, p) * 0.15) * 0.1 * (1 - kSpace * 0.7);
  const bShake = Math.exp(-Math.pow((p - (T.blast + 0.008)) / 0.012, 2)) * 1.6;
  camPos.x += (Math.random() - 0.5) * (rumble + bShake);
  camPos.y += (Math.random() - 0.5) * (rumble + bShake);
  camera.fov = baseFov - 4 * (1 - kAsc) + 14 * kSpace;
  camera.updateProjectionMatrix();
  const pxScale = (stageH * DPR) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  pointUniforms.forEach((u) => (u.uScale.value = pxScale));
  // slow handheld-style drift so the frame feels operated, not rendered
  const sway = 1 - kSpace * 0.6;
  camPos.x += Math.sin(time * 0.37) * 0.35 * sway;
  camPos.y += Math.sin(time * 0.53 + 1.3) * 0.25 * sway;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);

  /* exhaust & smoke */
  const spawnN = thrust * dt * 420;
  const nSpawn = Math.floor(spawnN + Math.random());
  const ascending = p < T.blast;
  const down = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), th);
  if (ascending) {
    for (let i = 0; i < nSpawn; i++) {
      const f = Math.random();
      const s = Math.random() * 6 + 2;
      fire.spawn(
        mix(prevNozzle.x, nozzle.x, f) + (Math.random() - 0.5) * 2.2, mix(prevNozzle.y, nozzle.y, f), mix(prevNozzle.z, nozzle.z, f) + (Math.random() - 0.5) * 2.2,
        down.x * (50 + Math.random() * 60) + (Math.random() - 0.5) * 14, down.y * (50 + Math.random() * 60) + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14,
        0.35 + Math.random() * 0.45, 1.4 + s * 0.2, 3 + s,
      );
    }
    // pad smoke while still low
    const low = 1 - smooth(60, 260, ry);
    const nPad = Math.floor(thrust * low * dt * 120 + Math.random());
    for (let i = 0; i < nPad; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 44;
      smoke.spawn(Math.cos(ang) * 6, 1.5 + Math.random() * 3, Math.sin(ang) * 6,
        Math.cos(ang) * sp, 2 + Math.random() * 9, Math.sin(ang) * sp, 3.5 + Math.random() * 3, 6 + Math.random() * 6, 22 + Math.random() * 26);
    }
    // vapour trail in the lower atmosphere
    const trailK = 1 - smooth(0.25, 0.5, a);
    const nTrail = Math.floor(thrust * trailK * liftT * dt * 70 + Math.random());
    for (let i = 0; i < nTrail; i++) {
      const f = Math.random();
      smoke.spawn(mix(prevNozzle.x, nozzle.x, f) + (Math.random() - 0.5) * 3, mix(prevNozzle.y, nozzle.y, f) - 4, (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, 5 + Math.random() * 4, 3 + Math.random() * 3, 10 + Math.random() * 12);
    }
  }
  prevNozzle.copy(nozzle);
  fire.update(dt);
  smoke.update(dt);

  /* blast */
  const bt = clamp01((p - T.blast) / (T.blastEnd - T.blast));
  blast.visible = p > T.blast - 0.002 && bt < 1;
  if (blast.visible) {
    const origin = rocket.root.position.clone().add(up.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), th).multiplyScalar(34));
    blast.position.copy(origin);
    const e = 1 - Math.pow(1 - clamp01(bt * 1.4), 3);
    const R = 110 * e + 8;
    fireballs.forEach((s) => {
      const { dir, k, layer } = s.userData;
      s.position.copy(dir).multiplyScalar(R * k * 0.75);
      const sz = R * (layer === 0 ? 0.9 : layer === 1 ? 1.15 : 1.5) * (0.6 + k * 0.5);
      s.scale.set(sz, sz, 1);
    });
    fbMats[0].opacity = clamp01(1 - bt * 3.2);
    fbMats[1].opacity = clamp01(1 - bt * 1.7);
    fbMats[2].opacity = Math.pow(clamp01(1 - bt), 1.6) * 0.8;
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(10 + bt * 620);
    ring.material.opacity = Math.pow(1 - bt, 2) * 0.55;
    debris.material.uniforms.uT.value = bt;
  }
  // rocket fades into the blast
  const flashV = Math.exp(-Math.pow((p - (T.blast + 0.006)) / 0.011, 2)) * 0.9;
  hud.flash.style.opacity = flashV.toFixed(3);

  /* project card */
  const k = smooth(T.card, T.card + 0.045, p);
  hud.project.style.opacity = k.toFixed(3);
  hud.project.firstElementChild.style.transform = `translateY(${(1 - k) * 36}px) scale(${0.9 + 0.1 * k})`;
  hud.project.classList.toggle('on', k > 0.02);
  hud.project.setAttribute('aria-hidden', k > 0.5 ? 'false' : 'true');

  /* HUD (throttled) */
  hudTick += dt;
  if (hudTick > 0.06) {
    hudTick = 0;
    const u = clamp01((p - T.liftoff) / (T.coastEnd - T.liftoff));
    updateHud(alt, 7800 * Math.pow(u, 1.15));
  }

  bloom.strength = mix(0.35, 0.3, spaceF);
  composer.render();
}

renderer.setAnimationLoop(frame);

/* ---------- countdown loader ---------- */
const loader = $('loader'), count = $('count'), ringFg = document.querySelector('.ring-fg'), label = $('loader-label');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function countdown() {
  document.body.classList.add('locked');
  if (!params.has('skip') && !params.has('p')) {
    for (const n of [3, 2, 1]) {
      count.textContent = n;
      count.classList.remove('tick'); ringFg.classList.remove('run');
      void count.offsetWidth;
      count.classList.add('tick'); ringFg.classList.add('run');
      await sleep(1000);
    }
    label.textContent = 'LIFTOFF · SCROLL TO IGNITE';
    count.textContent = '0';
    await sleep(250);
  }
  loader.classList.add('done');
  document.body.classList.remove('locked');
  document.body.classList.add('live');
  started = true;
  if (!params.has('p')) readScroll();
}
countdown();
