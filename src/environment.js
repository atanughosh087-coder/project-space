import * as THREE from 'three';

export const EARTH_R = 20000;
// Golden-hour sun low on the left, lighting the rocket side-on; it climbs as the rocket leaves the atmosphere.
export const SUN_LOW = new THREE.Vector3(-0.9, 0.22, 0.12).normalize();
export const SUN_HIGH = new THREE.Vector3(-0.35, 0.7, 0.55).normalize();
export const SUN = SUN_LOW.clone();

const noiseGLSL = /* glsl */ `
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uSun: { value: SUN.clone() }, uSpace: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uSpace; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float sd = max(dot(d, uSun), 0.0);
        float low = 1.0 - smoothstep(0.08, 0.55, uSun.y);       // how "golden" the light is
        float e = clamp(d.y, 0.0, 1.0);
        vec3 zenith = mix(vec3(0.035, 0.1, 0.3), vec3(0.05, 0.19, 0.5), 1.0 - low);
        vec3 horizAway = mix(vec3(0.62, 0.7, 0.9), vec3(0.45, 0.62, 0.95), 1.0 - low);
        vec3 horizSun = mix(vec3(0.7, 0.8, 1.0), vec3(1.7, 0.72, 0.28), low);
        vec3 horiz = mix(horizAway, horizSun, pow(sd, 1.6));
        float haze = pow(1.0 - e, 3.5);
        vec3 col = mix(zenith, horiz, pow(1.0 - e, 2.2) * 0.9 + haze * 0.1);
        col += vec3(1.0, 0.55, 0.22) * pow(sd, 7.0) * 0.55 * low;             // aureole
        col += vec3(1.0, 0.8, 0.55) * pow(sd, 48.0) * 0.9;                     // halo
        col += vec3(3.0, 2.5, 1.9) * smoothstep(0.99955, 0.9999, sd) * 2.0;    // disc
        col = mix(col, horiz * 0.35, smoothstep(0.0, -0.25, d.y));            // below the horizon
        col *= 1.0 - uSpace;
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9995, 0.99985, sd) * uSpace * 3.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50000, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export const CLOUD_H = 1800;
export function createCloudDeck() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uSun: { value: SUN.clone() }, uCamY: { value: 0 }, uTime: { value: 0 }, uAmt: { value: 1 },
      uHaze: { value: new THREE.Color(0.9, 0.6, 0.5) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); float r2 = min(dot(w.xz, w.xz), ${(EARTH_R*0.97)**2}.0); w.y -= ${EARTH_R}.0 - sqrt(${EARTH_R*EARTH_R}.0 - r2); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uHaze; uniform float uCamY, uTime, uAmt; varying vec3 vW;
      ${noiseGLSL.replace(/vec3/g, 'vec3')}
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
      float f2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec2 uv = vW.xz * 0.00042 + vec2(uTime * 0.004, uTime * 0.0015);
        float warp = f2(uv * 0.7 + 4.0);
        uv += (warp - 0.5) * 0.9;
        float d = f2(uv);
        float cover = smoothstep(0.46, 0.72, d);
        vec2 sxz = normalize(uSun.xz + 1e-4);
        float d2 = f2(uv + sxz * 0.018);
        float lit = clamp(0.55 + (d - d2) * 7.0, 0.0, 1.0);
        float low = 1.0 - smoothstep(0.08, 0.55, uSun.y);
        vec3 sunTint = mix(vec3(1.35, 1.3, 1.25), vec3(1.9, 1.0, 0.55), low);
        vec3 shade = mix(vec3(0.36, 0.4, 0.56), vec3(0.5, 0.42, 0.5), low);
        bool below = uCamY < 1800.0;
        vec3 col;
        if (below) {
          col = mix(shade * 0.75, sunTint * 0.85, lit * 0.8) * (1.0 - 0.45 * smoothstep(0.55, 0.9, d));
        } else {
          col = mix(shade * 1.3, sunTint * 1.15, lit);
        }
        float haze = smoothstep(2500.0, 26000.0, dist);
        col = mix(col, uHaze, haze * 0.75);
        float a = cover * (1.0 - smoothstep(16000.0, 38000.0, dist)) * smoothstep(0.0, 140.0, abs(uCamY - 1800.0));
        gl_FragColor = vec4(col, a * uAmt);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.01, 38000, 96, 64), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = CLOUD_H;
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return mesh;
}

export function createStars() {
  const n = 2600;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const tint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(45000);
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = Math.pow(Math.random(), 4) * 2.4 + 0.8;
    tint[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aSize; attribute float aTint; uniform float uPx; varying float vT;
      void main(){ vT = aTint; gl_PointSize = aSize * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpacity; varying float vT;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        vec3 c = mix(vec3(0.7, 0.8, 1.2), vec3(1.3, 1.0, 0.8), vT);
        gl_FragColor = vec4(c, smoothstep(0.5, 0.0, d) * uOpacity); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -9;
  pts.frustumCulled = false;
  return pts;
}

export function createEarth() {
  const group = new THREE.Group();
  group.position.y = -EARTH_R - 3;
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vW;
      ${noiseGLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float cont = fbm(n * 2.4 + vec3(3.1, 1.7, 5.2)) + 0.45 * smoothstep(0.93, 1.0, n.y);
        float land = smoothstep(0.5, 0.54, cont);
        float detail = fbm(n * 14.0);
        vec3 ocean = mix(vec3(0.005, 0.05, 0.22), vec3(0.02, 0.2, 0.42), smoothstep(0.35, 0.5, cont));
        vec3 grass = mix(vec3(0.04, 0.14, 0.05), vec3(0.2, 0.17, 0.08), smoothstep(0.35, 0.7, detail));
        vec3 surf = mix(ocean, grass, land);
        float diff = dot(n, uSun);
        float day = smoothstep(-0.08, 0.3, diff);
        vec3 lit = surf * (0.03 + 1.5 * max(diff, 0.0));
        vec3 H = normalize(uSun + V);
        lit += (1.0 - land) * pow(max(dot(n, H), 0.0), 120.0) * vec3(1.0, 0.9, 0.75) * 1.2 * day;
        float cl = smoothstep(0.52, 0.78, fbm(n * 6.0 + vec3(uTime * 0.004, 0.0, 0.0)));
        lit = mix(lit, vec3(1.05, 1.05, 1.1) * (0.03 + 1.5 * max(diff, 0.0)), cl * 0.9);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        lit += vec3(0.15, 0.4, 1.0) * rim * day * 1.3;
        float term = smoothstep(0.0, 0.12, diff) * (1.0 - smoothstep(0.12, 0.3, diff));
        lit += vec3(1.0, 0.4, 0.15) * term * 0.12;
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 160, 112), earthMat);
  earth.frustumCulled = false;
  group.add(earth);

  const atmoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: SUN.clone() }, uCenter: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float rim = 1.0 - abs(dot(normalize(vN), V));
        float i = pow(rim, 4.0);
        float lit = smoothstep(-0.3, 0.4, dot(normalize(vN), uSun));
        vec3 c = mix(vec3(0.15, 0.45, 1.0), vec3(0.6, 0.8, 1.0), pow(rim, 9.0)) * i * lit * 2.2;
        gl_FragColor = vec4(c, i * lit);
      }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.022, 128, 96), atmoMat);
  atmo.frustumCulled = false;
  atmo.renderOrder = 1;
  group.add(atmo);
  return { group, earthMat, atmoMat };
}

export function createGround() {
  const mk = (size, draw) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  // scrubby coastal grass: layered blotches + fine speckle
  const tex = mk(512, (g, s) => {
    g.fillStyle = '#4a4c30'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const r = rnd(20, 90), x = rnd(0, s), y = rnd(0, s), l = rnd(30, 62);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const hue = rnd(55, 95);
      gr.addColorStop(0, `hsla(${hue},30%,${l}%,0.28)`); gr.addColorStop(1, `hsla(${hue},30%,${l}%,0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 9000; i++) {
      const l = rnd(18, 52);
      g.fillStyle = `hsla(${rnd(50, 100)},30%,${l}%,0.5)`;
      g.fillRect(rnd(0, s), rnd(0, s), rnd(1, 2.5), rnd(1, 4));
    }
  });
  tex.repeat.set(180, 180);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function createConcrete() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#7b7c7c'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 120; i++) { // stains
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 30 + Math.random() * 140;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.7;
    gr.addColorStop(0, dark ? 'rgba(40,38,35,0.22)' : 'rgba(210,205,195,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 26000; i++) {
    const v = 90 + Math.random() * 80;
    g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(25,25,25,0.7)'; g.lineWidth = 3; // expansion joints
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
  g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) { // cracks
    let x = Math.random() * 1024, y = Math.random() * 1024; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); } g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Low rolling hills ringing the horizon so the sunset has something to sit behind. */
export function createHills() {
  const geo = new THREE.RingGeometry(2600, 9000, 160, 6);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const ph = [Math.random() * 9, Math.random() * 9, Math.random() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const k = Math.min(1, (r - 2600) / 2500);
    let h = Math.sin(a * 3 + ph[0]) * 90 + Math.sin(a * 7 + ph[1]) * 55 + Math.sin(a * 17 + ph[2]) * 24 + Math.sin(a * 41) * 8;
    h = (h + 150) * (0.35 + 0.65 * Math.min(1, (r - 2600) / 1800)) * (a > 0 ? 1 : 0.6) * Math.min(1, k * 1.5 + 0.2);
    p.setY(i, Math.max(0, h) * (1 - Math.max(0, (r - 7500) / 1500) * 0.6));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 1 }));
  m.position.y = -2;
  return m;
}
