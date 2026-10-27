// Pure simulation: full 3D volume, world units and seconds, no renderer dependency.
// Boids + a three-state behaviour machine (cruise / feed / flee), food pellets and one hunting predator.
export const CONFIG = Object.freeze({
  count: 100, minCount: 10, maxCount: 2000, seed: 549,
  halfWidth: 24, halfDepth: 17, height: 18,
  perception: 7, separationRadius: 1.65, cruiseSpeed: 2.8, minSpeed: 1.2,
  maxSpeed: 3.8, maxForce: 2.4, maxAcceleration: 7, step: 1 / 60, speedControl: 1.5,
  // Speed above the current state's limit decays at this rate instead of being cut, so a fish
  // that stops fleeing slows down smoothly rather than snapping to cruise speed.
  deceleration: 4,
  // Hard containment margin: a fish (scaled model) reaches at most this far from its origin.
  fishMargin: 1.2,
  // Feeding: up to `maxFood` pellets. A pellet sinks from the surface and lasts `foodAmount` seconds
  // while at least `fullRateEaters` fish are eating it (fewer fish eat it proportionally slower).
  maxFood: 3, foodAmount: 12, fullRateEaters: 3, foodSinkSpeed: 0.45, foodLifetime: 45, foodFloor: 0.6,
  feedEnter: 13, feedExit: 17, eatRadius: 1.1, feedSpeed: 4.4, feedWeight: 2.6, feedAcceleration: 9,
  // Escape. Separate enter/exit radii plus a minimum hold time stop state flicker at the edge.
  fleeEnter: 8, fleeExit: 12, fleeHold: 1, fleeSpeed: 6.4, fleeWeight: 3.2, fleeAcceleration: 18,
  // Predator: hunts the nearest fish for a while, then rests and patrols, so it never chases forever.
  // It is slower than a fleeing fish and never eats; its job is to scatter the school.
  predatorSense: 18, predatorHuntSpeed: 4.3, predatorPatrolSpeed: 2.2, predatorAcceleration: 4.5,
  predatorHunt: 6, predatorRest: 5, predatorMargin: 2.4,
});
// Feeding challenge: the school must eat this many meals (one meal = one full pellet) before time
// runs out. Tuned with seeded bot runs: food dropped at random gives 7–9 meals in 90 s; food dropped
// near the school and away from the predator wins in about 55–80 s.
export const CHALLENGE = Object.freeze({ meals: 10, seconds: 90 });
export const DEFAULT_WEIGHTS = Object.freeze({ separation: 2.4, alignment: 1.1, cohesion: 0.55 });
export const RULES = Object.freeze(Object.keys(DEFAULT_WEIGHTS));
export const STATE = Object.freeze({ cruise: 0, feed: 1, flee: 2 });
export const STATE_NAMES = Object.freeze(['cruise', 'feed', 'flee']);
export const PREDATOR_MODE = Object.freeze({ hunt: 0, rest: 1 });
// Boids weights are rescaled per state: feeding fish follow the food more than the school,
// fleeing fish keep alignment (a coordinated escape) but loosen cohesion.
const STATE_RULE_SCALE = [
  { separation: 1, alignment: 1, cohesion: 1 },
  { separation: 1, alignment: 0.35, cohesion: 0.35 },
  { separation: 1, alignment: 1, cohesion: 0.5 },
];

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

// Math.hypot is several times slower than sqrt in V8 and this runs in the inner loops.
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// Shared scratch vector; every caller copies the values out before the next call.
const out = [0, 0, 0];
function limit(x, y, z, max) {
  const length = len(x, y, z);
  const factor = length > max ? max / length : 1;
  out[0] = x * factor; out[1] = y * factor; out[2] = z * factor;
  return out;
}

// Reynolds steering: desired velocity (direction × speed) minus current velocity, force-limited.
function steer(x, y, z, vx, vy, vz, speed = CONFIG.cruiseSpeed, maxForce = CONFIG.maxForce) {
  const length = len(x, y, z);
  if (length < 1e-9) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
  return limit(x / length * speed - vx, y / length * speed - vy, z / length * speed - vz, maxForce);
}

// Predictive containment for all six walls; independent of the Boids toggles.
function wallForce(x, y, z, vx, vy, vz, inset) {
  const aheadX = x + vx * 0.65, aheadY = y + vy * 0.65 - CONFIG.height / 2, aheadZ = z + vz * 0.65;
  out[0] = -Math.sign(aheadX) * Math.max(0, Math.abs(aheadX) - (CONFIG.halfWidth - inset)) * 3.5;
  out[1] = -Math.sign(aheadY) * Math.max(0, Math.abs(aheadY) - (CONFIG.height / 2 - inset)) * 3.5;
  out[2] = -Math.sign(aheadZ) * Math.max(0, Math.abs(aheadZ) - (CONFIG.halfDepth - inset)) * 3.5;
  return out;
}

// Speed limit that decays excess speed gradually and keeps a minimum cruising speed.
function clampSpeed(vx, vy, vz, previousSpeed, maxSpeed, minSpeed, dt, fallbackAngle) {
  const speed = len(vx, vy, vz);
  const cap = Math.max(maxSpeed, Math.min(previousSpeed, CONFIG.maxSpeed * 2) - CONFIG.deceleration * dt);
  if (speed > cap) {
    const scale = cap / speed; out[0] = vx * scale; out[1] = vy * scale; out[2] = vz * scale;
  } else if (speed < minSpeed) {
    if (speed > 1e-9) {
      const scale = minSpeed / speed; out[0] = vx * scale; out[1] = vy * scale; out[2] = vz * scale;
    } else {
      out[0] = Math.cos(fallbackAngle) * minSpeed; out[1] = 0; out[2] = Math.sin(fallbackAngle) * minSpeed;
    }
  } else { out[0] = vx; out[1] = vy; out[2] = vz; }
  return out;
}

// Initial fish i always uses the same five draws of one seeded stream, so fish 0–99 start
// identically whether the population is 100 or 2000.
function spawnFish(seed, from, to) {
  const random = randomGenerator(seed);
  for (let skip = 0; skip < from * 5; skip++) random();
  const fish = [];
  for (let id = from; id < to; id++) {
    const angle = random() * Math.PI * 2;
    const vertical = (random() - 0.5) * 1.2;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    fish.push({ id, x: (random() - 0.5) * (CONFIG.halfWidth * 2 - 8),
      z: (random() - 0.5) * (CONFIG.halfDepth * 2 - 8),
      y: 3 + random() * (CONFIG.height - 6),
      vx: Math.cos(angle) * horizontal * CONFIG.cruiseSpeed,
      vy: vertical * CONFIG.cruiseSpeed,
      vz: Math.sin(angle) * horizontal * CONFIG.cruiseSpeed,
      state: STATE.cruise, stateTime: 0, target: -1 });
  }
  return fish;
}

// Uniform grid with cell size = perception radius, rebuilt every step from the old state.
// A cell at least as large as the perception radius means the 3×3×3 block holds every neighbour.
export class NeighborGrid {
  constructor(cell = CONFIG.perception) {
    this.cell = Math.max(cell, CONFIG.perception);
    this.nx = Math.ceil(CONFIG.halfWidth * 2 / this.cell);
    this.ny = Math.ceil(CONFIG.height / this.cell);
    this.nz = Math.ceil(CONFIG.halfDepth * 2 / this.cell);
    this.starts = new Int32Array(this.nx * this.ny * this.nz + 1);
    this.order = new Int32Array(0);
    this.cells = new Int32Array(0);
  }
  axis(offset, cells) { return Math.min(cells - 1, Math.max(0, Math.floor(offset / this.cell))); }
  index(x, y, z) {
    return (this.axis(x + CONFIG.halfWidth, this.nx) * this.ny + this.axis(y, this.ny)) * this.nz + this.axis(z + CONFIG.halfDepth, this.nz);
  }
  build(fish) {
    const n = fish.length;
    if (this.order.length < n) { this.order = new Int32Array(n); this.cells = new Int32Array(n); }
    this.starts.fill(0);
    for (let i = 0; i < n; i++) { const c = this.index(fish[i].x, fish[i].y, fish[i].z); this.cells[i] = c; this.starts[c + 1]++; }
    for (let c = 1; c < this.starts.length; c++) this.starts[c] += this.starts[c - 1];
    const fill = this.starts.slice(0, -1);
    for (let i = 0; i < n; i++) this.order[fill[this.cells[i]]++] = i;
  }
}

export class Simulation {
  constructor(seed = CONFIG.seed, count = CONFIG.count) {
    this.seed = seed;
    this.initialCount = count;
    this.grid = new NeighborGrid();
    this.reset();
  }

  reset() {
    this.weights = { ...DEFAULT_WEIGHTS };
    this.enabled = Object.fromEntries(RULES.map(rule => [rule, true]));
    this.paused = false;
    this.time = 0;
    this.count = this.initialCount;
    this.fish = spawnFish(this.seed, 0, this.count);
    this.food = [];
    this.nextFoodId = 0;
    this.foodEaten = 0;
    this.predator = null;
    this.predatorRandom = randomGenerator(this.seed ^ 0x5eed);
    // Session counters for the end-of-session summary.
    this.stats = { fleeStarts: 0, feedStarts: 0 };
  }

  setWeight(rule, value) {
    if (!RULES.includes(rule) || !Number.isFinite(value)) return;
    this.weights[rule] = Math.max(0, Math.min(3, value));
  }

  setEnabled(rule, enabled) {
    if (RULES.includes(rule)) this.enabled[rule] = Boolean(enabled);
  }

  // Grows by appending seeded fish (existing fish keep their state) or shrinks from the end.
  setCount(count) {
    if (!Number.isFinite(count)) return;
    count = Math.round(Math.max(CONFIG.minCount, Math.min(CONFIG.maxCount, count)));
    if (count > this.fish.length) this.fish = this.fish.concat(spawnFish(this.seed, this.fish.length, count));
    else this.fish = this.fish.slice(0, count);
    this.count = count;
  }

  // Drops a pellet at the water surface (or a given height). The oldest pellet is replaced when full.
  addFood(x, z, y = CONFIG.height - 0.6) {
    if (![x, y, z].every(Number.isFinite)) return null;
    const pellet = { id: this.nextFoodId++,
      x: Math.max(-CONFIG.halfWidth + 1, Math.min(CONFIG.halfWidth - 1, x)),
      y: Math.max(CONFIG.foodFloor, Math.min(CONFIG.height - 0.6, y)),
      z: Math.max(-CONFIG.halfDepth + 1, Math.min(CONFIG.halfDepth - 1, z)),
      amount: CONFIG.foodAmount, age: 0 };
    if (this.food.length >= CONFIG.maxFood) this.food = this.food.slice(1);
    this.food = [...this.food, pellet];
    return pellet;
  }

  clearFood() { this.food = []; }

  setPredator(enabled) {
    if (!enabled) { this.predator = null; return; }
    if (this.predator) return;
    this.predatorRandom = randomGenerator(this.seed ^ 0x5eed);
    this.predator = { x: -CONFIG.halfWidth + 5, y: CONFIG.height / 2, z: 0, vx: CONFIG.predatorPatrolSpeed, vy: 0, vz: 0,
      mode: PREDATOR_MODE.hunt, modeTime: 0, target: -1, wx: 0, wy: CONFIG.height / 2, wz: 0 };
  }

  step(dt = CONFIG.step) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, CONFIG.step);
    const fish = this.fish, food = this.food, predator = this.predator;
    const perception2 = CONFIG.perception ** 2, separation2 = CONFIG.separationRadius ** 2;
    const eaters = new Int32Array(food.length);
    const grid = this.grid;
    grid.build(fish);
    // All forces read the same immutable old frame. Publish only after all fish update.
    const next = new Array(fish.length);
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, neighbors = 0;
      // Inlined 3×3×3 grid walk (hot loop): avoids a closure call per candidate neighbour.
      const { nx, ny, nz, starts, order } = grid;
      const gx = grid.axis(f.x + CONFIG.halfWidth, nx), gy = grid.axis(f.y, ny), gz = grid.axis(f.z + CONFIG.halfDepth, nz);
      for (let ix = Math.max(0, gx - 1); ix <= Math.min(nx - 1, gx + 1); ix++)
        for (let iy = Math.max(0, gy - 1); iy <= Math.min(ny - 1, gy + 1); iy++)
          for (let iz = Math.max(0, gz - 1); iz <= Math.min(nz - 1, gz + 1); iz++) {
            const c = (ix * ny + iy) * nz + iz;
            for (let k = starts[c], end = starts[c + 1]; k < end; k++) {
              const j = order[k];
              if (j === i) continue;
              const other = fish[j];
              const dx = f.x - other.x, dy = f.y - other.y, dz = f.z - other.z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= perception2) continue;
              neighbors++;
              ax += other.vx; ay += other.vy; az += other.vz;
              cx += other.x; cy += other.y; cz += other.z;
              if (d2 >= separation2) continue;
              if (d2 < 1e-12) {
                // Antisymmetric separation for exactly coincident pairs; independent of iteration order.
                const angle = (Math.min(f.id, other.id) * 17 + Math.max(f.id, other.id) * 31) * 2.39996;
                const sign = f.id < other.id ? 1 : -1;
                sx += Math.cos(angle) * sign * 10; sy += Math.sin(angle * 1.7) * sign * 10; sz += Math.sin(angle) * sign * 10;
              } else {
                sx += dx / d2; sy += dy / d2; sz += dz / d2;
              }
            }
          }

      // Behaviour state: flee > feed > cruise, each with hysteresis.
      const predatorDistance = predator ? len(f.x - predator.x, f.y - predator.y, f.z - predator.z) : Infinity;
      let foodIndex = -1, foodDistance = Infinity;
      for (let k = 0; k < food.length; k++) {
        const d = len(f.x - food[k].x, f.y - food[k].y, f.z - food[k].z);
        if (d < foodDistance) { foodDistance = d; foodIndex = k; }
      }
      let state;
      if (predatorDistance < CONFIG.fleeEnter
        || (f.state === STATE.flee && (predatorDistance < CONFIG.fleeExit || f.stateTime < CONFIG.fleeHold))) state = STATE.flee;
      else if (foodDistance < CONFIG.feedEnter || (f.state === STATE.feed && foodDistance < CONFIG.feedExit)) state = STATE.feed;
      else state = STATE.cruise;
      const stateTime = state === f.state ? f.stateTime + dt : 0;
      if (state !== f.state) { if (state === STATE.flee) this.stats.fleeStarts++; else if (state === STATE.feed) this.stats.feedStarts++; }

      let fx = 0, fy = 0, fz = 0;
      const scale = STATE_RULE_SCALE[state];
      const add = (force, weight) => { fx += force[0] * weight; fy += force[1] * weight; fz += force[2] * weight; };
      if (this.enabled.separation) add(steer(sx, sy, sz, f.vx, f.vy, f.vz), this.weights.separation * scale.separation);
      if (neighbors && this.enabled.alignment)
        add(steer(ax / neighbors, ay / neighbors, az / neighbors, f.vx, f.vy, f.vz), this.weights.alignment * scale.alignment);
      if (neighbors && this.enabled.cohesion)
        add(steer(cx / neighbors - f.x, cy / neighbors - f.y, cz / neighbors - f.z, f.vx, f.vy, f.vz), this.weights.cohesion * scale.cohesion);

      let maxSpeed = CONFIG.maxSpeed, maxAcceleration = CONFIG.maxAcceleration, target = -1;
      if (state === STATE.feed && foodIndex >= 0) {
        // Seek with arrival: slow down near the pellet so fish mill around it instead of overshooting.
        const pellet = food[foodIndex];
        const speed = CONFIG.feedSpeed * Math.max(0.35, Math.min(1, foodDistance / 3));
        add(steer(pellet.x - f.x, pellet.y - f.y, pellet.z - f.z, f.vx, f.vy, f.vz, speed, CONFIG.maxForce * 1.5), CONFIG.feedWeight);
        maxSpeed = CONFIG.feedSpeed; maxAcceleration = CONFIG.feedAcceleration; target = pellet.id;
        if (foodDistance < CONFIG.eatRadius) eaters[foodIndex]++;
      } else if (state === STATE.flee && predator) {
        // Evade: run from where the predator will be, harder the closer it is.
        const lead = Math.min(1, predatorDistance / CONFIG.fleeSpeed);
        const px = predator.x + predator.vx * lead, py = predator.y + predator.vy * lead, pz = predator.z + predator.vz * lead;
        const urgency = 1 + Math.max(0, CONFIG.fleeEnter - predatorDistance) / CONFIG.fleeEnter;
        add(steer(f.x - px, f.y - py, f.z - pz, f.vx, f.vy, f.vz, CONFIG.fleeSpeed, CONFIG.maxForce * 2.5), CONFIG.fleeWeight * urgency);
        maxSpeed = CONFIG.fleeSpeed; maxAcceleration = CONFIG.fleeAcceleration;
      } else if (state === STATE.flee) {
        // Predator removed during the hold time: keep the escape speed budget, no new escape force.
        maxSpeed = CONFIG.fleeSpeed;
      }
      if (state === STATE.cruise) {
        // Gentle thrust toward cruise speed along the current heading. Without it, opposing
        // Boids forces cancel inside a dense school and fish drift near the minimum speed.
        const speed = len(f.vx, f.vy, f.vz);
        const thrust = (CONFIG.cruiseSpeed - speed) * CONFIG.speedControl / Math.max(speed, 1e-9);
        fx += f.vx * thrust; fy += f.vy * thrust; fz += f.vz * thrust;
      }
      add(wallForce(f.x, f.y, f.z, f.vx, f.vy, f.vz, 3), 1);
      const [lx, ly, lz] = limit(fx, fy, fz, maxAcceleration);
      let [vx, vy, vz] = clampSpeed(f.vx + lx * dt, f.vy + ly * dt, f.vz + lz * dt,
        len(f.vx, f.vy, f.vz), maxSpeed, CONFIG.minSpeed, dt, f.id * 2.39996);
      let x = f.x + vx * dt, y = f.y + vy * dt, z = f.z + vz * dt;
      if (Math.abs(x) > CONFIG.halfWidth - CONFIG.fishMargin) { x = Math.sign(x) * (CONFIG.halfWidth - CONFIG.fishMargin); vx = -Math.sign(x) * Math.abs(vx); }
      if (y < CONFIG.fishMargin) { y = CONFIG.fishMargin; vy = Math.abs(vy); }
      if (y > CONFIG.height - CONFIG.fishMargin) { y = CONFIG.height - CONFIG.fishMargin; vy = -Math.abs(vy); }
      if (Math.abs(z) > CONFIG.halfDepth - CONFIG.fishMargin) { z = Math.sign(z) * (CONFIG.halfDepth - CONFIG.fishMargin); vz = -Math.sign(z) * Math.abs(vz); }
      next[i] = { id: f.id, x, y, z, vx, vy, vz, state, stateTime, target };
    }

    // The predator also reads the old frame, so update order does not matter.
    const nextPredator = predator ? this.#stepPredator(predator, fish, dt) : null;
    this.fish = next;
    this.predator = nextPredator;
    // Pellets sink, are eaten and expire, so no fish chases a target that no longer exists.
    const remaining = [];
    food.forEach((pellet, k) => {
      const bite = Math.min(1, eaters[k] / CONFIG.fullRateEaters) * dt;
      const amount = pellet.amount - bite;
      this.foodEaten += Math.min(pellet.amount, bite);
      const age = pellet.age + dt;
      if (amount > 0 && age < CONFIG.foodLifetime)
        remaining.push({ ...pellet, amount, age, y: Math.max(CONFIG.foodFloor, pellet.y - CONFIG.foodSinkSpeed * dt) });
    });
    this.food = remaining;
    this.time += dt;
  }

  #stepPredator(p, fish, dt) {
    let mode = p.mode, modeTime = p.modeTime + dt, { wx, wy, wz } = p;
    const pickWaypoint = () => {
      const r = this.predatorRandom;
      wx = (r() - 0.5) * (CONFIG.halfWidth * 2 - 10); wy = 4 + r() * (CONFIG.height - 8); wz = (r() - 0.5) * (CONFIG.halfDepth * 2 - 10);
    };
    if (mode === PREDATOR_MODE.hunt && modeTime > CONFIG.predatorHunt) { mode = PREDATOR_MODE.rest; modeTime = 0; pickWaypoint(); }
    else if (mode === PREDATOR_MODE.rest && modeTime > CONFIG.predatorRest) { mode = PREDATOR_MODE.hunt; modeTime = 0; }
    let target = -1, best = CONFIG.predatorSense;
    if (mode === PREDATOR_MODE.hunt) for (const f of fish) {
      const d = len(f.x - p.x, f.y - p.y, f.z - p.z);
      if (d < best) { best = d; target = f.id; }
    }
    let fx = 0, fy = 0, fz = 0, speed = CONFIG.predatorPatrolSpeed;
    const prey = target >= 0 ? fish.find(f => f.id === target) : null;
    if (prey) {
      speed = CONFIG.predatorHuntSpeed;
      [fx, fy, fz] = steer(prey.x + prey.vx * 0.4 - p.x, prey.y + prey.vy * 0.4 - p.y, prey.z + prey.vz * 0.4 - p.z,
        p.vx, p.vy, p.vz, speed, CONFIG.predatorAcceleration);
    } else {
      if (len(wx - p.x, wy - p.y, wz - p.z) < 3) pickWaypoint();
      [fx, fy, fz] = steer(wx - p.x, wy - p.y, wz - p.z, p.vx, p.vy, p.vz, speed, CONFIG.predatorAcceleration);
    }
    const [bx, by, bz] = wallForce(p.x, p.y, p.z, p.vx, p.vy, p.vz, CONFIG.predatorMargin + 2);
    fx += bx; fy += by; fz += bz;
    const [lx, ly, lz] = limit(fx, fy, fz, CONFIG.predatorAcceleration * 1.5);
    let [vx, vy, vz] = clampSpeed(p.vx + lx * dt, p.vy + ly * dt, p.vz + lz * dt,
      len(p.vx, p.vy, p.vz), speed, 1, dt, 0);
    let x = p.x + vx * dt, y = p.y + vy * dt, z = p.z + vz * dt;
    const m = CONFIG.predatorMargin;
    if (Math.abs(x) > CONFIG.halfWidth - m) { x = Math.sign(x) * (CONFIG.halfWidth - m); vx = -Math.sign(x) * Math.abs(vx); }
    if (y < m) { y = m; vy = Math.abs(vy); }
    if (y > CONFIG.height - m) { y = CONFIG.height - m; vy = -Math.abs(vy); }
    if (Math.abs(z) > CONFIG.halfDepth - m) { z = Math.sign(z) * (CONFIG.halfDepth - m); vz = -Math.sign(z) * Math.abs(vz); }
    return { x, y, z, vx, vy, vz, mode, modeTime, target, wx, wy, wz };
  }

  stateCounts() {
    const counts = [0, 0, 0];
    for (const f of this.fish) counts[f.state]++;
    return { cruise: counts[0], feed: counts[1], flee: counts[2] };
  }

  // Cheap O(N) readouts for the live UI.
  summary() {
    let speed = 0, hx = 0, hy = 0, hz = 0;
    for (const f of this.fish) {
      const s = len(f.vx, f.vy, f.vz);
      speed += s; hx += f.vx / s; hy += f.vy / s; hz += f.vz / s;
    }
    const n = this.fish.length;
    return { count: n, speed: speed / n, alignment: len(hx, hy, hz) / n, states: this.stateCounts() };
  }

  // Includes O(N²) nearest-neighbour spacing; for tests and offline comparisons.
  metrics() {
    let nearest = 0;
    for (const f of this.fish) {
      let min = Infinity;
      for (const other of this.fish) if (f.id !== other.id)
        min = Math.min(min, len(f.x - other.x, f.y - other.y, f.z - other.z));
      nearest += Number.isFinite(min) ? min : 0;
    }
    const { speed, alignment } = this.summary();
    return { speed, alignment, spacing: nearest / this.fish.length };
  }
}

export class FixedClock {
  // Fixed 60 Hz steps with two overload guards: at most `maxSteps` per rendered frame, and no new
  // step once `budgetMs` of this frame is spent (at least one step always runs). An overloaded
  // simulation (stress test) then slows down while rendering stays responsive, instead of each
  // frame trying to catch up and the frame rate collapsing.
  constructor(maxSteps = 4, budgetMs = 12, clock = () => performance.now()) {
    this.maxSteps = maxSteps; this.budgetMs = budgetMs; this.clock = clock;
    this.clear();
  }
  clear() { this.previous = null; this.accumulator = 0; }
  advance(now, simulation) {
    if (this.previous === null) { this.previous = now; return 0; }
    const elapsed = Math.max(0, Math.min((now - this.previous) / 1000, 0.1));
    this.previous = now;
    if (simulation.paused) { this.accumulator = 0; return 0; }
    this.accumulator += elapsed;
    const start = this.clock();
    let steps = 0;
    while (this.accumulator + 1e-12 >= CONFIG.step && steps < this.maxSteps
      && (steps === 0 || this.clock() - start < this.budgetMs)) {
      simulation.step();
      this.accumulator -= CONFIG.step;
      steps++;
    }
    // Drop any backlog we could not afford, so it never snowballs into later frames.
    this.accumulator = Math.min(this.accumulator, CONFIG.step);
    return steps;
  }
}
