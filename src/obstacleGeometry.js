import * as THREE from 'three';
import { randomGenerator } from './simulation.js';

// Procedural low-poly obstacles and plants. Rocks and coral are only ever displaced inward from
// the collider radius, so what the player sees is never larger than what the fish avoid.
// Geometry is built for a unit radius and scaled by the obstacle radius when placed.

// Smooth value noise on the unit sphere from a few seeded random waves (cheap, no texture).
function waves(seed, count) {
  const random = randomGenerator(seed);
  return Array.from({ length: count }, () => {
    const theta = random() * Math.PI * 2, z = random() * 2 - 1, s = Math.sqrt(1 - z * z);
    return { x: Math.cos(theta) * s, y: z, z: Math.sin(theta) * s, f: 1.5 + random() * 2.5, p: random() * Math.PI * 2 };
  });
}
const noise = (list, x, y, z) => list.reduce((sum, w) => sum + Math.sin((w.x * x + w.y * y + w.z * z) * w.f + w.p), 0) / list.length;

function paint(geometry, colorAt) {
  const position = geometry.attributes.position, colors = [], color = new THREE.Color();
  for (let i = 0; i < position.count; i++) { colorAt(position.getX(i), position.getY(i), position.getZ(i), color); colors.push(color.r, color.g, color.b); }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// A weathered boulder: a squashed icosphere pressed in by noise, darker towards the sand.
export function buildBoulderGeometry(seed) {
  const list = waves(seed, 6);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    // Rough sides, but a smoother top close to the collider, where sinking pellets come to rest.
    const rough = 0.84 + 0.12 * (0.5 + 0.5 * noise(list, v.x, v.y, v.z));
    const top = THREE.MathUtils.smoothstep(v.y, 0.4, 0.8);
    v.multiplyScalar(THREE.MathUtils.lerp(rough, 0.95 + 0.02 * noise(list, v.x * 3, v.y, v.z * 3), top));
    position.setXYZ(i, v.x, v.y, v.z);
  }
  const low = new THREE.Color('#5d6b66'), high = new THREE.Color('#a9b1a2'), moss = new THREE.Color('#7c9468');
  // Icosahedra are already non-indexed, so every face has its own vertices for flat colours.
  paint(geometry, (x, y, z, color) => {
    color.copy(low).lerp(high, THREE.MathUtils.clamp((y + 0.3) / 1.2, 0, 1));
    if (noise(list, x * 2, y * 2, z * 2) > 0.25 && y > 0) color.lerp(moss, 0.45);
  });
  geometry.computeVertexNormals();
  return geometry;
}

// A coral column: a stack of rounded, lumpy coral heads spanning y = 0..1 (scaled to the water
// depth) with radius 1 in plan view. The mesh is scaled non-uniformly, so each head is built
// flattened in y to come out roughly round in the tank. Everything stays inside radius 1.
export function buildColumnGeometry(seed) {
  const random = randomGenerator(seed);
  const list = waves(seed ^ 0x77, 6);
  const heads = 16, parts = [];
  for (let k = 0; k < heads; k++) {
    const y = (k + 0.5) / heads, width = 0.8 - 0.14 * y - random() * 0.16;
    const ox = (random() - 0.5) * 0.2, oz = (random() - 0.5) * 0.2;
    const head = new THREE.IcosahedronGeometry(1, 2);
    const position = head.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const inset = 0.72 + 0.28 * (0.5 + 0.5 * noise(list, v.x * 2.5 + k * 1.7, v.y * 2.5, v.z * 2.5));
      position.setXYZ(i, ox + v.x * width * inset, y + v.y * 0.085 * inset, oz + v.z * width * inset);
    }
    parts.push(head);
  }
  const merged = mergeNonIndexed(parts);
  const palettes = [['#b65a55', '#f0a184'], ['#a65a78', '#e6a1b8'], ['#c27443', '#f2c08a']];
  const [low, high] = palettes[seed % palettes.length].map(c => new THREE.Color(c));
  const polyps = new THREE.Color('#fbe6d0');
  paint(merged, (x, y, z, color) => {
    color.copy(low).lerp(high, THREE.MathUtils.clamp(y * 1.1, 0, 1));
    if (noise(list, x * 9, y * 40, z * 9) > 0.3) color.lerp(polyps, 0.45);
  });
  merged.computeVertexNormals();
  return merged;
}

function mergeNonIndexed(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const array = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) { array.set(g.attributes.position.array, offset); offset += g.attributes.position.array.length; g.dispose(); }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(array, 3));
}

// Sea grass blade: a thin tapered strip along +y (height 1). The shader bends it with height.
export function buildBladeGeometry() {
  const segments = 5, positions = [], colors = [];
  const root = new THREE.Color('#3f6f4e'), tip = new THREE.Color('#8fb86a');
  const c = new THREE.Color();
  for (let s = 0; s < segments; s++) {
    const y0 = s / segments, y1 = (s + 1) / segments, w0 = 0.09 * (1 - y0 * 0.85), w1 = 0.09 * (1 - y1 * 0.85);
    const quad = [[-w0, y0], [w0, y0], [w1, y1], [-w0, y0], [w1, y1], [-w1, y1]];
    for (const [x, y] of quad) { positions.push(x, y, 0); c.copy(root).lerp(tip, y); colors.push(c.r, c.g, c.b); }
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// Sway: blades bend sideways with the square of their height, each with its own phase.
export function addSwayDeformation(material, uniforms) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
        float bend = position.y * position.y;
        transformed.x += sin(uTime * 1.1 + phase) * 0.35 * bend;
        transformed.z += cos(uTime * 0.8 + phase * 1.3) * 0.2 * bend;`);
  };
}
