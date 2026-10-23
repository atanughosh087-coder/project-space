import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aSeed;
  uniform float uScale;
  varying float vLife;
  varying float vSeed;
  void main() {
    vLife = aLife;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
  }
`;

const fireFrag = /* glsl */ `
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vec3(1.5, 1.3, 1.0), vec3(1.4, 0.6, 0.15), smoothstep(0.0, 0.45, vLife));
    col = mix(col, vec3(0.7, 0.14, 0.03), smoothstep(0.45, 1.0, vLife));
    gl_FragColor = vec4(col, a * 0.45 * pow(1.0 - vLife, 1.4));
  }
`;

const smokeFrag = /* glsl */ `
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    vec3 col = mix(vec3(1.0, 0.88, 0.76), vec3(0.62, 0.65, 0.72), smoothstep(0.0, 0.5, vLife));
    col *= 0.88 + 0.12 * vSeed;
    gl_FragColor = vec4(col, a * a * 0.28 * pow(1.0 - vLife, 1.1) * smoothstep(0.0, 0.04, vLife + 0.04));
  }
`;

/** Pooled point-sprite emitter. kind: 'fire' (additive) | 'smoke' (alpha). */
export class Particles {
  constructor(kind, count) {
    this.count = count;
    this.cursor = 0;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1e3);
    this.life = new Float32Array(count).fill(1);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.aSize = new Float32Array(count);
    this.aLife = new Float32Array(count);
    this.aSeed = new Float32Array(count).map(() => Math.random());
    this.kind = kind;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.aLife, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    this.uniforms = { uScale: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: kind === 'fire' ? fireFrag : smokeFrag,
      transparent: true,
      depthWrite: false,
      blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === 'fire' ? 3 : 2;
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = size0; this.s1[i] = size1;
  }

  update(dt) {
    const drag = Math.exp(-dt * (this.kind === 'smoke' ? 0.9 : 0.4));
    const rise = this.kind === 'smoke' ? 3 * dt : 0;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) { this.aSize[i] = 0; continue; }
      this.age[i] += dt;
      const f = Math.min(this.age[i] / this.life[i], 1);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + rise; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.aLife[i] = f;
      this.aSize[i] = f >= 1 ? 0 : this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(f);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
  }
}
