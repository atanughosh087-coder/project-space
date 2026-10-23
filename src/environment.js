import * as THREE from 'three';

export const EARTH_R = 20000;
export const SUN = new THREE.Vector3(0.55, 0.32, 0.77).normalize(); // key light, from the camera side
export const BACKLIGHT = new THREE.Vector3(-0.55, 0.14, -0.82).normalize(); // low sun glowing behind the rocket

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
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSun: { value: BACKLIGHT.clone() }, uSpace: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uSun; uniform float uSpace; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.55, 0.25) * pow(s, 5.0) * 0.5 * (1.0 - uSpace);
        col += vec3(1.0, 0.85, 0.6) * pow(s, 90.0) * 0.5 * (1.0 - uSpace);
        col += vec3(2.5, 2.2, 1.8) * pow(s, 1500.0) * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50000, 32, 16), mat);
  mesh.renderOrder = -10;
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
  return { group, earthMat };
}

export function createGround() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#474c3b';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 50 + Math.random() * 50;
    g.fillStyle = `rgba(${v + 10},${v + 14},${v - 6},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(400, 400);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function puffTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s * 0.2;
    const x = s / 2 + Math.cos(a) * r * 1.3;
    const y = s / 2 + Math.sin(a) * r * 0.8 + 6;
    const rad = s * (0.1 + Math.random() * 0.12);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createClouds(xAtY) {
  const group = new THREE.Group();
  const tex = puffTexture();
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xfff0e4, transparent: true, depthWrite: false, fog: false, opacity: 1 });
  const shade = new THREE.SpriteMaterial({ map: tex, color: 0x9fb0d4, transparent: true, depthWrite: false, fog: false, opacity: 1 });
  const add = (x, y, z, s, m) => {
    const sp = new THREE.Sprite(m);
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.62, 1);
    sp.material.rotation = 0;
    group.add(sp);
  };
  // sea of clouds below the climb
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = 900 + Math.sqrt(Math.random()) * 5500;
    const s = 500 + Math.random() * 900;
    add(Math.cos(a) * r, 160 + Math.random() * 120, Math.sin(a) * r, s, i % 3 ? shade : mat);
    add(Math.cos(a) * r, 220 + Math.random() * 140, Math.sin(a) * r, s * 0.8, mat);
  }
  // banks the rocket flies past; kept clear of the rocket and camera lanes so they never white-out the view
  for (let i = 0; i < 170; i++) {
    const y = 260 + Math.random() * 1100;
    const a = Math.random() * Math.PI * 2, r = 90 + Math.pow(Math.random(), 1.4) * 800;
    const px = xAtY(y);
    const x = px + Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - (px + 50), z - 90) < 150) continue; // camera lane
    const s = 90 + Math.random() * 300;
    add(x, y, z, s, Math.random() < 0.3 ? shade : mat);
  }
  return { group, materials: [mat, shade] };
}
