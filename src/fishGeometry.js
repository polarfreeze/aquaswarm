import * as THREE from 'three';

// Procedural low-poly fish. The body is lofted along +x (nose) to −x (tail) from elliptical
// cross-sections; fins, tail and eyes are added as flat triangles with vertex colours.
// One merged, non-indexed geometry per species keeps the school to a single draw call.
// Local x range is roughly [−0.95, 0.62] so the swim shader can use x as the body coordinate.
export const FISH_SHAPE = Object.freeze({
  nose: 0.62, peduncle: -0.46, tailTip: -0.95,
  height: 0.25, width: 0.15, peak: 0.37,
});

const SHAPES = {
  fish: {
    ...FISH_SHAPE,
    palette: { back: '#a3abae', belly: '#ffffff', fin: '#c9a99c', eye: '#101a1c', iris: '#f2efe2' },
    dorsal: [[0.18, 0], [-0.16, 0.2], [-0.28, 0]],
    tail: { spread: 0.27, notch: 0.13 },
  },
  predator: {
    nose: 0.62, peduncle: -0.48, tailTip: -0.95,
    height: 0.17, width: 0.12, peak: 0.42,
    palette: { back: '#3f5560', belly: '#e9eef0', fin: '#34474f', eye: '#050909', iris: '#c5d0d3' },
    dorsal: [[0.12, 0], [-0.04, 0.3], [-0.18, 0]],
    tail: { spread: 0.36, notch: 0.06, upperBias: 0.1 },
  },
};

export function buildFishGeometry(kind = 'fish') {
  const shape = SHAPES[kind];
  const positions = [], colors = [];
  const back = new THREE.Color(shape.palette.back), belly = new THREE.Color(shape.palette.belly);
  const finColor = new THREE.Color(shape.palette.fin);
  const tmp = new THREE.Color();
  const push = (point, color) => { positions.push(...point); colors.push(color.r, color.g, color.b); };
  const triangle = (a, b, c, ca, cb = ca, cc = ca) => { push(a, ca); push(b, cb); push(c, cc); };

  // Body profile, u = 0 at the nose and 1 at the peduncle.
  const length = shape.nose - shape.peduncle;
  // sin(π·u^p) peaks where u^p = 0.5, i.e. at u = shape.peak.
  const exponent = Math.log(0.5) / Math.log(shape.peak);
  const profile = u => {
    const s = Math.sin(Math.PI * Math.min(1, Math.pow(u, exponent)));
    return { h: 0.045 + shape.height * Math.pow(s, 0.85), w: 0.03 + shape.width * Math.pow(s, 0.9),
      c: -0.015 * Math.sin(Math.PI * u) };
  };
  const stations = [0.05, 0.13, 0.24, 0.37, 0.5, 0.63, 0.76, 0.88, 1];
  const segments = 10;
  const rings = stations.map(u => {
    const { h, w, c } = profile(u);
    const x = shape.nose - u * length;
    return Array.from({ length: segments }, (_, k) => {
      const a = k / segments * Math.PI * 2;
      return [x, c + Math.sin(a) * h, Math.cos(a) * w];
    });
  });
  // Countershading: darker back, light belly, by height on the cross-section.
  const shade = point => tmp.copy(belly).lerp(back, THREE.MathUtils.smoothstep(point[1], -0.06, 0.12)).clone();
  const nose = [shape.nose + 0.03, -0.01, 0];
  for (let k = 0; k < segments; k++) {
    const a = rings[0][k], b = rings[0][(k + 1) % segments];
    triangle(nose, b, a, shade(nose), shade(b), shade(a));
  }
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < segments; k++) {
    const a = rings[r][k], b = rings[r][(k + 1) % segments], c = rings[r + 1][k], d = rings[r + 1][(k + 1) % segments];
    triangle(a, b, d, shade(a), shade(b), shade(d));
    triangle(a, d, c, shade(a), shade(d), shade(c));
  }
  const last = rings[rings.length - 1], tailCenter = [shape.peduncle - 0.02, 0, 0];
  for (let k = 0; k < segments; k++) triangle(last[k], last[(k + 1) % segments], tailCenter, shade(last[k]));

  // Forked caudal fin, attached at the peduncle so it follows the same swim wave as the body.
  const { spread, notch, upperBias = 0 } = shape.tail;
  const root = shape.peduncle + 0.03, tip = shape.tailTip;
  triangle([root, 0.05, 0], [tip, spread + upperBias, 0], [tip + 0.17, notch * 0.4, 0], finColor);
  triangle([root, 0.05, 0], [tip + 0.17, notch * 0.4, 0], [root - 0.05, 0, 0], finColor);
  triangle([root, -0.05, 0], [tip + 0.17, -notch * 0.4, 0], [tip + upperBias * 0.6, -spread, 0], finColor);
  triangle([root, -0.05, 0], [root - 0.05, 0, 0], [tip + 0.17, -notch * 0.4, 0], finColor);

  // Dorsal fin on the top surface, a small anal fin underneath.
  const top = x => { const u = (shape.nose - x) / length; const p = profile(u); return p.c + p.h * 0.97; };
  const [d0, d1, d2] = shape.dorsal;
  triangle([d0[0], top(d0[0]), 0], [d1[0], top(d1[0]) + d1[1], 0], [d2[0], top(d2[0]), 0], finColor);
  const bottom = x => { const u = (shape.nose - x) / length; const p = profile(u); return p.c - p.h * 0.95; };
  triangle([-0.14, bottom(-0.14), 0], [-0.34, bottom(-0.34), 0], [-0.32, bottom(-0.3) - 0.11, 0], finColor);

  // Pectoral fins, angled back and down from the flanks.
  for (const side of [-1, 1]) {
    const x = shape.nose - 0.3 * length, w = profile(0.3).w;
    triangle([x, -0.05, side * w * 0.9], [x - 0.24, -0.15, side * (w + 0.13)], [x - 0.13, -0.03, side * w * 0.95], finColor);
  }

  // Eyes: a light iris disc with a dark pupil, sitting just outside the body surface.
  const eyeU = 0.14, eye = profile(eyeU), eyeX = shape.nose - eyeU * length;
  const iris = new THREE.Color(shape.palette.iris), pupil = new THREE.Color(shape.palette.eye);
  for (const side of [-1, 1]) {
    const z = side * (eye.w * 0.92 + 0.012), y = eye.c + eye.h * 0.25;
    for (const [radius, color, offset] of [[0.052, iris, 0], [0.03, pupil, 0.004]]) {
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, b = (k + 1) / 8 * Math.PI * 2;
        const zz = z + side * offset;
        const p0 = [eyeX, y, zz], p1 = [eyeX + Math.cos(a) * radius, y + Math.sin(a) * radius, zz], p2 = [eyeX + Math.cos(b) * radius, y + Math.sin(b) * radius, zz];
        if (side > 0) triangle(p0, p1, p2, color); else triangle(p0, p2, p1, color);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Injects the travelling-wave deformation into a standard material. Per instance, aSwim holds
// (phase, amplitude, bend). The lateral offset grows from head to tail, so the tail stays attached
// to the body: it is the same continuous wave, not a separately rotated part.
export function addSwimDeformation(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aSwim;
        uniform float uSwimOn;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bodyT = clamp((${FISH_SHAPE.nose.toFixed(2)} - position.x) / ${(FISH_SHAPE.nose - FISH_SHAPE.tailTip).toFixed(2)}, 0.0, 1.0);
        float envelope = 0.1 + 0.9 * bodyT * bodyT;
        transformed.z += uSwimOn * (aSwim.y * envelope * sin(aSwim.x - 5.4 * bodyT) + aSwim.z * bodyT * bodyT);
        transformed.x -= uSwimOn * abs(aSwim.z) * bodyT * bodyT * 0.25;`);
  };
  material.customProgramCacheKey = () => 'aquaswarm-swim';
}
