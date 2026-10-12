import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, CONFIG, STATE } from '../src/simulation.js';

const run = (sim, seconds, each) => { for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(); each?.(sim); } };
const fishAt = (id, x, y, z, vx = 2, vy = 0, vz = 0, state = STATE.cruise, stateTime = 0) =>
  ({ id, x, y, z, vx, vy, vz, state, stateTime, target: -1 });
// The MVP predator is stationary; tests place it where they need it.
const parkedPredator = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0 });
// Same food point for the food-only and combined runs, a few units from the predator.
const PELLET = [5, 3];

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

test('there is one food point: a new pellet replaces the current one', () => {
  const sim = new Simulation();
  assert.equal(CONFIG.maxFood, 1);
  sim.addFood(-4, 0); const second = sim.addFood(6, 2);
  assert.equal(sim.food.length, 1);
  assert.equal(sim.food[0].id, second.id);
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

test('every flee episode lasts at least the hold time (no flicker) over 60 s near the predator', () => {
  const sim = new Simulation();
  sim.addFood(...PELLET, 11);
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

test('the predator stays where it was placed and never removes fish', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  run(sim, 30);
  assert.deepEqual(sim.predator, { x: CONFIG.predatorX, y: CONFIG.predatorY, z: CONFIG.predatorZ, vx: 0, vy: 0, vz: 0 });
  assert.equal(sim.fish.length, CONFIG.count);
});

test('food-only, predator-only and combined scenarios from the same start differ as expected', () => {
  const scenario = (food, predator) => {
    const sim = new Simulation();
    if (food) sim.addFood(...PELLET, 11);
    if (predator) sim.setPredator(true);
    const peak = { feed: 0, flee: 0 };
    run(sim, 30, s => { const c = s.stateCounts(); peak.feed = Math.max(peak.feed, c.feed); peak.flee = Math.max(peak.flee, c.flee); });
    return peak;
  };
  const food = scenario(true, false), predator = scenario(false, true), both = scenario(true, true);
  assert.equal(food.flee, 0); assert.ok(food.feed > 30);
  assert.equal(predator.feed, 0); assert.ok(predator.flee > 0);
  assert.ok(both.feed > 0 && both.flee > 0);
});

test('removing the predator lets every fish recover within the hold time', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  run(sim, 15);
  sim.setPredator(false);
  run(sim, CONFIG.fleeHold + 0.05);
  assert.ok(sim.fish.every(f => f.state !== STATE.flee));
});
