import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, CONFIG, CHALLENGE, STATE, PREDATOR_MODE, randomGenerator } from '../src/simulation.js';

const run = (sim, seconds, each) => { for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(); each?.(sim); } };
const fishAt = (id, x, y, z, vx = 2, vy = 0, vz = 0, state = STATE.cruise, stateTime = 0) =>
  ({ id, x, y, z, vx, vy, vz, state, stateTime, target: -1 });
// A predator that barely moves for one step: zero velocity, resting at its own waypoint.
const parkedPredator = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, mode: PREDATOR_MODE.rest, modeTime: 0, target: -1, wx: x, wy: y, wz: z });

test('nearby fish switch to feeding, eat the pellet, and return to cruising once it is gone', () => {
  const sim = new Simulation();
  const pellet = sim.addFood(0, 0, 9);
  const near = sim.fish.filter(f => Math.hypot(f.x, f.y - 9, f.z) < CONFIG.feedEnter).map(f => f.id);
  const far = sim.fish.filter(f => Math.hypot(f.x, f.y - 9, f.z) > CONFIG.feedEnter + 0.5).map(f => f.id);
  sim.step();
  assert.ok(near.length > 5 && near.every(id => sim.fish[id].state === STATE.feed && sim.fish[id].target === pellet.id));
  assert.ok(far.length > 0 && far.every(id => sim.fish[id].state === STATE.cruise));
  let gone = null;
  run(sim, 40, s => { if (gone === null && s.food.length === 0) gone = s.time; });
  assert.ok(gone !== null && gone < CONFIG.foodLifetime, `pellet eaten at ${gone}`);
  assert.ok(gone >= CONFIG.foodAmount - 0.1, 'consumption is rate-limited');
  assert.ok(sim.fish.every(f => f.state === STATE.cruise && f.target === -1));
  assert.ok(sim.foodEaten > CONFIG.foodAmount - 1e-6);
});

test('pellets sink to the floor and expire, so nobody chases a stale target', () => {
  const sim = new Simulation(549, 1);
  sim.fish = [fishAt(0, -20, 9, -14)];
  sim.addFood(20, 14);
  run(sim, CONFIG.foodLifetime - 1);
  assert.equal(sim.food.length, 1);
  assert.ok(Math.abs(sim.food[0].y - CONFIG.foodFloor) < 1e-9);
  run(sim, 1.5);
  assert.equal(sim.food.length, 0);
  assert.equal(sim.fish[0].state, STATE.cruise);
});

test('the pellet count is capped and the oldest pellet is replaced', () => {
  const sim = new Simulation();
  for (let i = 0; i < CONFIG.maxFood + 2; i++) sim.addFood(i - 4, 0);
  assert.equal(sim.food.length, CONFIG.maxFood);
  assert.deepEqual(sim.food.map(f => f.id), Array.from({ length: CONFIG.maxFood }, (_, i) => i + 2));
  assert.equal(sim.addFood(NaN, 0), null);
  sim.clearFood(); assert.equal(sim.food.length, 0);
});

test('escape has priority over food', () => {
  // Food just ahead, predator just behind: the fish flees (and so keeps going forward, faster).
  const sim = new Simulation(549, 1);
  sim.fish = [fishAt(0, 0, 9, 0)];
  sim.addFood(1, 0, 9);
  sim.predator = parkedPredator(-4, 9, 0);
  sim.step();
  assert.equal(sim.fish[0].state, STATE.flee);
  assert.ok(sim.fish[0].vx > 2);
  // Food and predator both ahead: feeding would accelerate forward, fleeing turns back.
  sim.fish = [fishAt(0, 0, 9, 0)];
  sim.predator = parkedPredator(4, 9, 0);
  sim.step();
  assert.equal(sim.fish[0].state, STATE.flee);
  assert.ok(sim.fish[0].vx < 2);
});

test('flee uses hysteresis: enter radius, exit radius and a minimum hold time', () => {
  const between = (CONFIG.fleeEnter + CONFIG.fleeExit) / 2;
  const sim = new Simulation(549, 1);
  // Between the radii a cruising fish stays calm and a fleeing fish keeps fleeing.
  sim.fish = [fishAt(0, 0, 9, 0)]; sim.predator = parkedPredator(between, 9, 0); sim.step();
  assert.equal(sim.fish[0].state, STATE.cruise);
  sim.fish = [fishAt(0, 0, 9, 0, 2, 0, 0, STATE.flee, 5)]; sim.predator = parkedPredator(between, 9, 0); sim.step();
  assert.equal(sim.fish[0].state, STATE.flee);
  // Beyond the exit radius it recovers, but only after the hold time.
  sim.fish = [fishAt(0, 0, 9, 0, 2, 0, 0, STATE.flee, 0.2)]; sim.predator = parkedPredator(CONFIG.fleeExit + 3, 9, 0); sim.step();
  assert.equal(sim.fish[0].state, STATE.flee);
  sim.fish = [fishAt(0, 0, 9, 0, 2, 0, 0, STATE.flee, CONFIG.fleeHold)]; sim.predator = parkedPredator(CONFIG.fleeExit + 3, 9, 0); sim.step();
  assert.equal(sim.fish[0].state, STATE.cruise);
});

test('every flee episode lasts at least the hold time (no flicker) during a 60 s hunt', () => {
  const sim = new Simulation();
  sim.addFood(-8, 4, 10); sim.addFood(8, -4, 10);
  sim.setPredator(true);
  const started = new Map(), episodes = [];
  let previous = sim.fish.map(f => f.state);
  run(sim, 60, s => {
    s.fish.forEach((f, i) => {
      if (f.state === STATE.flee && previous[i] !== STATE.flee) started.set(i, s.time);
      if (f.state !== STATE.flee && previous[i] === STATE.flee) episodes.push(s.time - started.get(i));
    });
    previous = s.fish.map(f => f.state);
  });
  assert.ok(episodes.length > 20, `episodes: ${episodes.length}`);
  assert.ok(Math.min(...episodes) >= CONFIG.fleeHold - 1e-9, `shortest flee: ${Math.min(...episodes)}`);
});

test('fleeing is faster than cruising, bounded, and decays smoothly after the predator leaves', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  let fastest = 0;
  run(sim, 30, s => { for (const f of s.fish) fastest = Math.max(fastest, Math.hypot(f.vx, f.vy, f.vz)); });
  assert.ok(fastest > CONFIG.maxSpeed + 1 && fastest <= CONFIG.fleeSpeed + 1e-9, `fastest ${fastest}`);
  sim.setPredator(false);
  let maxDrop = 0;
  const last = sim.fish.map(f => Math.hypot(f.vx, f.vy, f.vz));
  run(sim, 3, s => {
    s.fish.forEach((f, i) => { const v = Math.hypot(f.vx, f.vy, f.vz); maxDrop = Math.max(maxDrop, last[i] - v); last[i] = v; });
  });
  assert.ok(sim.fish.every(f => f.state === STATE.cruise));
  assert.ok(sim.fish.every(f => Math.hypot(f.vx, f.vy, f.vz) <= CONFIG.maxSpeed + 1e-9));
  // No sudden braking: the per-step speed loss stays within deceleration plus steering.
  assert.ok(maxDrop < (CONFIG.deceleration + CONFIG.fleeAcceleration) / 60 + 1e-9, `max drop per step ${maxDrop}`);
});

test('the predator alternates hunting and resting and never chases one fish forever', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  let longestHunt = 0, rests = 0, previous = PREDATOR_MODE.hunt;
  run(sim, 60, s => {
    const p = s.predator;
    if (p.mode === PREDATOR_MODE.hunt) longestHunt = Math.max(longestHunt, p.modeTime);
    if (p.mode === PREDATOR_MODE.rest && previous === PREDATOR_MODE.hunt) rests++;
    previous = p.mode;
    assert.ok(Math.hypot(p.vx, p.vy, p.vz) <= CONFIG.predatorHuntSpeed + 1e-9);
    assert.ok(Math.abs(p.x) <= CONFIG.halfWidth - CONFIG.predatorMargin + 1e-9 && p.y >= CONFIG.predatorMargin - 1e-9);
  });
  assert.ok(rests >= 4, `rests: ${rests}`);
  assert.ok(longestHunt <= CONFIG.predatorHunt + 1 / 60 + 1e-9);
  // Slower than a fleeing fish, faster than a cruising one: escapes are possible but not trivial.
  assert.ok(CONFIG.predatorHuntSpeed < CONFIG.fleeSpeed && CONFIG.predatorHuntSpeed > CONFIG.maxSpeed);
});

test('food-only, predator-only and combined scenarios from the same start differ as expected', () => {
  const scenario = (food, predator) => {
    const sim = new Simulation();
    if (food) for (const [x, z] of [[-10, 4], [4, -6], [13, 7]]) sim.addFood(x, z, 11);
    if (predator) sim.setPredator(true);
    const peak = { feed: 0, flee: 0 };
    run(sim, 10, s => { const c = s.stateCounts(); peak.feed = Math.max(peak.feed, c.feed); peak.flee = Math.max(peak.flee, c.flee); });
    return peak;
  };
  const food = scenario(true, false), predator = scenario(false, true), both = scenario(true, true);
  assert.equal(food.flee, 0); assert.ok(food.feed > 50);
  assert.equal(predator.feed, 0); assert.ok(predator.flee > 0);
  assert.ok(both.feed > 0 && both.flee > 0);
});

test('removing the predator mid-chase lets every fish recover within the hold time', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  run(sim, 15);
  sim.setPredator(false);
  run(sim, CONFIG.fleeHold + 0.05);
  assert.ok(sim.fish.every(f => f.state !== STATE.flee));
});

test('session counters record each switch into flee and feed', () => {
  const sim = new Simulation();
  sim.addFood(-8, 4, 10);
  sim.setPredator(true);
  let flees = 0, feeds = 0, previous = sim.fish.map(f => f.state);
  run(sim, 20, s => {
    s.fish.forEach((f, i) => {
      if (f.state !== previous[i] && f.state === STATE.flee) flees++;
      if (f.state !== previous[i] && f.state === STATE.feed) feeds++;
    });
    previous = s.fish.map(f => f.state);
  });
  assert.ok(flees > 0 && feeds > 0);
  assert.deepEqual(sim.stats, { fleeStarts: flees, feedStarts: feeds });
  sim.reset();
  assert.deepEqual(sim.stats, { fleeStarts: 0, feedStarts: 0 });
});

test('the feeding challenge is winnable with good food placement and lost without it', () => {
  // Same rules as the in-app challenge: hunting predator, food dropped every 4 s, fixed seed.
  const play = place => {
    const sim = new Simulation();
    sim.setPredator(true);
    for (let t = 0; t < CHALLENGE.seconds * 60; t++) {
      if (t % 240 === 0) place(sim, t);
      sim.step();
      if (sim.foodEaten >= CHALLENGE.meals * CONFIG.foodAmount) return sim.time;
    }
    return null;
  };
  // Good: near the school's centre, pushed away from the predator.
  const good = play(sim => {
    const n = sim.fish.length, p = sim.predator;
    const cx = sim.fish.reduce((a, f) => a + f.x / n, 0), cz = sim.fish.reduce((a, f) => a + f.z / n, 0);
    const d = Math.hypot(cx - p.x, cz - p.z) || 1;
    sim.addFood(cx + (cx - p.x) / d * 4, cz + (cz - p.z) / d * 4);
  });
  // Poor: anywhere in the tank, ignoring where the school and the predator are (seeded).
  const random = randomGenerator(11);
  const poor = play(sim => sim.addFood((random() - 0.5) * 44, (random() - 0.5) * 30));
  assert.ok(good !== null && good < CHALLENGE.seconds, `good placement finished at ${good}`);
  assert.equal(poor, null);
});
