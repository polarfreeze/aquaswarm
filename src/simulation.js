// Pure simulation: full 3D volume, world units and seconds, no renderer dependency.
export const CONFIG = Object.freeze({ count: 100, seed: 549, halfWidth: 24, halfDepth: 17, height: 18,
  perception: 7, separationRadius: 1.65, cruiseSpeed: 2.8, minSpeed: 1.2,
  maxSpeed: 3.8, maxForce: 2.4, maxAcceleration: 7, step: 1 / 60 });
export const DEFAULT_WEIGHTS = Object.freeze({ separation: 2.4, alignment: 1.1, cohesion: 0.55 });
export const RULES = Object.freeze(Object.keys(DEFAULT_WEIGHTS));

export function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function limit(x, y, z, max) {
  const length = Math.hypot(x, y, z);
  const factor = length > max ? max / length : 1;
  return [x * factor, y * factor, z * factor];
}

function steer(x, y, z, fish) {
  const length = Math.hypot(x, y, z);
  if (length < 1e-9) return [0, 0, 0];
  return limit(x / length * CONFIG.cruiseSpeed - fish.vx,
    y / length * CONFIG.cruiseSpeed - fish.vy,
    z / length * CONFIG.cruiseSpeed - fish.vz, CONFIG.maxForce);
}

export class Simulation {
  constructor(seed = CONFIG.seed, count = CONFIG.count) {
    this.seed = seed;
    this.count = count;
    this.reset();
  }

  reset() {
    const random = randomGenerator(this.seed);
    this.weights = { ...DEFAULT_WEIGHTS };
    this.enabled = Object.fromEntries(RULES.map(rule => [rule, true]));
    this.paused = false;
    this.time = 0;
    this.fish = Array.from({ length: this.count }, (_, id) => {
      const angle = random() * Math.PI * 2;
      const vertical = (random() - 0.5) * 1.2;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      return { id, x: (random() - 0.5) * (CONFIG.halfWidth * 2 - 8),
        z: (random() - 0.5) * (CONFIG.halfDepth * 2 - 8),
        y: 3 + random() * (CONFIG.height - 6),
        vx: Math.cos(angle) * horizontal * CONFIG.cruiseSpeed,
        vy: vertical * CONFIG.cruiseSpeed,
        vz: Math.sin(angle) * horizontal * CONFIG.cruiseSpeed };
    });
  }

  setWeight(rule, value) {
    if (!RULES.includes(rule) || !Number.isFinite(value)) return;
    this.weights[rule] = Math.max(0, Math.min(3, value));
  }

  setEnabled(rule, enabled) {
    if (RULES.includes(rule)) this.enabled[rule] = Boolean(enabled);
  }

  step(dt = CONFIG.step) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, CONFIG.step);
    // All forces read the same immutable old frame. Publish only after all fish update.
    const next = this.fish.map(fish => {
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, neighbors = 0;
      for (const other of this.fish) {
        if (fish.id === other.id) continue;
        const dx = fish.x - other.x, dy = fish.y - other.y, dz = fish.z - other.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < CONFIG.perception ** 2) {
          neighbors++;
          ax += other.vx; ay += other.vy; az += other.vz;
          cx += other.x; cy += other.y; cz += other.z;
          if (d2 < CONFIG.separationRadius ** 2) {
            if (d2 < 1e-12) {
              // Antisymmetric separation for exactly coincident pairs; independent of iteration order.
              const angle = (Math.min(fish.id, other.id) * 17 + Math.max(fish.id, other.id) * 31) * 2.39996;
              const sign = fish.id < other.id ? 1 : -1;
              sx += Math.cos(angle) * sign * 10; sy += Math.sin(angle * 1.7) * sign * 10; sz += Math.sin(angle) * sign * 10;
            } else {
              sx += dx / d2; sy += dy / d2; sz += dz / d2;
            }
          }
        }
      }
      const forces = {
        separation: steer(sx, sy, sz, fish),
        alignment: neighbors ? steer(ax / neighbors, ay / neighbors, az / neighbors, fish) : [0, 0, 0],
        cohesion: neighbors ? steer(cx / neighbors - fish.x, cy / neighbors - fish.y, cz / neighbors - fish.z, fish) : [0, 0, 0],
      };
      let fx = 0, fy = 0, fz = 0;
      for (const rule of RULES) if (this.enabled[rule]) {
        fx += forces[rule][0] * this.weights[rule];
        fy += forces[rule][1] * this.weights[rule];
        fz += forces[rule][2] * this.weights[rule];
      }
      // Predictive steering at all six walls; independent of the Boids toggles.
      const aheadX = fish.x + fish.vx * 0.65;
      const aheadY = fish.y + fish.vy * 0.65 - CONFIG.height / 2;
      const aheadZ = fish.z + fish.vz * 0.65;
      fx -= Math.sign(aheadX) * Math.max(0, Math.abs(aheadX) - (CONFIG.halfWidth - 3)) * 3.5;
      fy -= Math.sign(aheadY) * Math.max(0, Math.abs(aheadY) - (CONFIG.height / 2 - 3)) * 3.5;
      fz -= Math.sign(aheadZ) * Math.max(0, Math.abs(aheadZ) - (CONFIG.halfDepth - 3)) * 3.5;
      [fx, fy, fz] = limit(fx, fy, fz, CONFIG.maxAcceleration);
      let [vx, vy, vz] = limit(fish.vx + fx * dt, fish.vy + fy * dt, fish.vz + fz * dt, CONFIG.maxSpeed);
      const speed = Math.hypot(vx, vy, vz);
      if (speed < CONFIG.minSpeed) {
        if (speed > 1e-9) {
          const scale = CONFIG.minSpeed / speed; vx *= scale; vy *= scale; vz *= scale;
        } else {
          const angle = fish.id * 2.39996;
          vx = Math.cos(angle) * CONFIG.minSpeed; vy = 0; vz = Math.sin(angle) * CONFIG.minSpeed;
        }
      }
      let x = fish.x + vx * dt, y = fish.y + vy * dt, z = fish.z + vz * dt;
      // Fish length is at most one unit from its origin, including a vertically pitched tail.
      const margin = 1.1;
      if (Math.abs(x) > CONFIG.halfWidth - margin) {
        x = Math.sign(x) * (CONFIG.halfWidth - margin); vx = -Math.sign(x) * Math.abs(vx);
      }
      if (y < margin) { y = margin; vy = Math.abs(vy); }
      if (y > CONFIG.height - margin) { y = CONFIG.height - margin; vy = -Math.abs(vy); }
      if (Math.abs(z) > CONFIG.halfDepth - margin) {
        z = Math.sign(z) * (CONFIG.halfDepth - margin); vz = -Math.sign(z) * Math.abs(vz);
      }
      return { ...fish, x, y, z, vx, vy, vz };
    });
    this.fish = next;
    this.time += dt;
  }

  metrics() {
    let speed = 0, hx = 0, hy = 0, hz = 0, nearest = 0;
    for (const fish of this.fish) {
      const s = Math.hypot(fish.vx, fish.vy, fish.vz);
      speed += s; hx += fish.vx / s; hy += fish.vy / s; hz += fish.vz / s;
      let min = Infinity;
      for (const other of this.fish) if (fish.id !== other.id)
        min = Math.min(min, Math.hypot(fish.x - other.x, fish.y - other.y, fish.z - other.z));
      nearest += Number.isFinite(min) ? min : 0;
    }
    return { speed: speed / this.count, alignment: Math.hypot(hx, hy, hz) / this.count,
      spacing: nearest / this.count };
  }
}

export class FixedClock {
  constructor() { this.clear(); }
  clear() { this.previous = null; this.accumulator = 0; }
  advance(now, simulation) {
    if (this.previous === null) { this.previous = now; return; }
    const elapsed = Math.max(0, Math.min((now - this.previous) / 1000, 0.1));
    this.previous = now;
    if (simulation.paused) { this.accumulator = 0; return; }
    this.accumulator += elapsed;
    while (this.accumulator + 1e-12 >= CONFIG.step) {
      simulation.step();
      this.accumulator -= CONFIG.step;
    }
  }
}
