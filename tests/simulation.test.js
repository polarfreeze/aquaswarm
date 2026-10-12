import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FixedClock, NeighborGrid, CONFIG, DEFAULT_WEIGHTS, RULES } from '../src/simulation.js';

const run = (sim, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(); };
function assertHealthy(sim, maxSpeed = CONFIG.maxSpeed) {
  for (const fish of sim.fish) {
    for (const value of Object.values(fish)) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(fish.x) <= CONFIG.halfWidth);
    assert.ok(Math.abs(fish.z) <= CONFIG.halfDepth);
    assert.ok(fish.y >= CONFIG.fishMargin && fish.y <= CONFIG.height - CONFIG.fishMargin);
    const speed = Math.hypot(fish.vx, fish.vy, fish.vz);
    assert.ok(speed <= maxSpeed + 1e-9, `speed ${speed}`);
    assert.ok(speed >= CONFIG.minSpeed - 1e-9);
  }
}
test('default school remains finite, bounded and dispersed for 10 simulated minutes', () => {
  const sim = new Simulation();
  let minSpacing = Infinity;
  for (let second = 0; second < 600; second++) {
    run(sim, 1); assertHealthy(sim);
    if (second > 30) minSpacing = Math.min(minSpacing, sim.metrics().spacing);
  }
  assert.ok(minSpacing > 0.65, `minimum mean nearest-neighbor spacing: ${minSpacing}`);
});
test('full behaviour loop (food every 20 s, predator throughout) stays healthy for 10 simulated minutes', () => {
  const sim = new Simulation();
  sim.setPredator(true);
  const seen = { cruise: 0, feed: 0, flee: 0 };
  for (let second = 0; second < 600; second++) {
    if (second % 20 === 0) sim.addFood(((second * 7) % 40) - 20, ((second * 3) % 28) - 14);
    run(sim, 1); assertHealthy(sim, CONFIG.fleeSpeed);
    for (const [state, count] of Object.entries(sim.stateCounts())) seen[state] += count;
    const p = sim.predator;
    assert.ok([p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite));
    assert.ok(sim.food.length <= CONFIG.maxFood);
  }
  assert.ok(seen.cruise > 0 && seen.feed > 0 && seen.flee > 0, JSON.stringify(seen));
});
test('all rule combinations and extreme weights remain bounded', () => {
  for (let mask = 0; mask < 8; mask++) {
    const sim = new Simulation();
    RULES.forEach((rule, index) => { sim.setEnabled(rule, Boolean(mask & 1 << index)); sim.setWeight(rule, 3); });
    run(sim, 20); assertHealthy(sim);
  }
});
test('reset restores seed, fish, rules, weights, population, food, predator, running state and time', () => {
  const sim = new Simulation();
  const initial = structuredClone(sim.fish);
  sim.setWeight('separation', 3); sim.setEnabled('alignment', false); sim.setCount(400);
  sim.addFood(0, 0); sim.setPredator(true); run(sim, 3);
  sim.paused = true; sim.reset();
  assert.deepEqual(sim.fish, initial); assert.deepEqual(sim.weights, DEFAULT_WEIGHTS);
  assert.ok(RULES.every(rule => sim.enabled[rule])); assert.equal(sim.time, 0); assert.equal(sim.paused, false);
  assert.equal(sim.food.length, 0); assert.equal(sim.predator, null); assert.equal(sim.fish.length, CONFIG.count);
});
test('two seeded runs and reordered traversal give the same behavior', () => {
  const a = new Simulation(), b = new Simulation();
  run(a, 2); run(b, 2); assert.deepEqual(a.fish, b.fish);
  b.fish.reverse(); a.step(); b.step(); b.fish.reverse();
  a.fish.forEach((f, i) => {
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert.ok(Math.abs(f[key] - b.fish[i][key]) < 1e-10);
  });
});
test('grid neighbour search matches a brute-force single-cell search', () => {
  const grid = new Simulation(), brute = new Simulation();
  brute.grid = new NeighborGrid(1e6);
  grid.addFood(5, 3, 9); brute.addFood(5, 3, 9);
  for (let i = 0; i < 60; i++) {
    grid.step(); brute.step();
    grid.fish.forEach((f, k) => {
      for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert.ok(Math.abs(f[key] - brute.fish[k][key]) < 1e-9, `${key} step ${i}`);
    });
  }
});
test('coincident neighbors and zero velocities resolve without NaN', () => {
  const sim = new Simulation();
  sim.fish.forEach(f => { f.x = 0; f.y = CONFIG.height / 2; f.z = 0; f.vx = 0; f.vy = 0; f.vz = 0; });
  run(sim, 2); assertHealthy(sim);
  assert.ok(sim.metrics().spacing > 0);
});
const fishAt = (id, x, y, z, vx, vy, vz) => ({ id, x, y, z, vx, vy, vz, state: 0, stateTime: 0, target: -1 });
test('each Boids rule has the expected isolated steering direction', () => {
  const fixture = [fishAt(0, 0, 9, 0, 2, 0, 0), fishAt(1, 0, 9, 1, 0, 0, 2)];
  for (const rule of RULES) {
    const sim = new Simulation(549, 2); sim.fish = structuredClone(fixture);
    RULES.forEach(r => sim.setEnabled(r, r === rule)); sim.step();
    if (rule === 'separation') assert.ok(sim.fish[0].vz < 0);
    else assert.ok(sim.fish[0].vz > 0);
  }
});
test('disabling a rule and setting its weight to zero are equivalent', () => {
  for (const rule of RULES) {
    const off = new Simulation(), zero = new Simulation();
    off.setEnabled(rule, false); zero.setWeight(rule, 0);
    run(off, 1); run(zero, 1); assert.deepEqual(off.fish, zero.fish);
  }
});
test('pause freezes state; fixed clock handles long frames and visibility reset without jumps', () => {
  const sim = new Simulation(), clock = new FixedClock();
  clock.advance(0, sim); clock.advance(1000, sim);
  assert.ok(sim.time <= 0.1 + 1e-9);
  sim.paused = true; const fish = structuredClone(sim.fish), time = sim.time;
  clock.advance(2000, sim); sim.step(); assert.deepEqual(sim.fish, fish); assert.equal(sim.time, time);
  sim.paused = false; clock.clear(); clock.advance(60000, sim);
  assert.equal(sim.time, time); clock.advance(60017, sim); assert.ok(sim.time - time < 0.02);
});
test('fixed clock caps steps per frame and per time budget, so overload slows time instead of piling up work', () => {
  const sim = new Simulation(), clock = new FixedClock(4, 12, () => 0);
  clock.advance(0, sim);
  assert.equal(clock.advance(100, sim), 4);
  assert.ok(clock.accumulator <= CONFIG.step + 1e-12);
  // A clock that reports 20 ms per step: only one step fits the 12 ms budget, the backlog is dropped.
  let fake = 0;
  const slow = new FixedClock(4, 12, () => (fake += 20));
  slow.advance(0, sim);
  assert.equal(slow.advance(100, sim), 1);
  assert.ok(slow.accumulator <= CONFIG.step + 1e-12);
});
test('30 and 60 rendering frames produce the same fixed-step result', () => {
  const a = new Simulation(), b = new Simulation(), ca = new FixedClock(), cb = new FixedClock();
  for (let i = 0; i <= 60; i++) ca.advance(i * 1000 / 60, a);
  for (let i = 0; i <= 30; i++) cb.advance(i * 1000 / 30, b);
  assert.deepEqual(a.fish, b.fish);
});
test('fish change height and occupy a volume rather than a fixed horizontal plane', () => {
  const sim = new Simulation();
  const initial = sim.fish.map(f => f.y);
  run(sim, 10);
  assert.ok(sim.fish.filter((f, i) => Math.abs(f.y - initial[i]) > 0.5).length > 70);
  assert.ok(Math.max(...sim.fish.map(f => f.y)) - Math.min(...sim.fish.map(f => f.y)) > 5);
  assertHealthy(sim);
});
test('all rules sense and steer vertically, and distant vertical neighbors are excluded', () => {
  for (const rule of RULES) {
    const sim = new Simulation(549, 2);
    sim.fish = [fishAt(0, 0, 9, 0, 2, 0, 0), fishAt(1, 0, 10, 0, 0, 2, 0)];
    RULES.forEach(r => sim.setEnabled(r, r === rule));
    sim.step();
    assert.ok(rule === 'separation' ? sim.fish[0].vy < 0 : sim.fish[0].vy > 0);
  }
  const sim = new Simulation(549, 2);
  sim.fish = [fishAt(0, 0, 5, 0, 2, 0, 0), fishAt(1, 0, 13, 0, 0, 2, 0)];
  sim.step(); assert.equal(sim.fish[0].vy, 0);
});
test('top and bottom containment work with all Boids disabled', () => {
  for (const [y, vy] of [[CONFIG.fishMargin + 1e-4, -3.8], [CONFIG.height - CONFIG.fishMargin - 1e-4, 3.8]]) {
    const sim = new Simulation(549, 1);
    RULES.forEach(r => sim.setEnabled(r, false));
    Object.assign(sim.fish[0], { x: 0, y, z: 0, vx: 0, vy, vz: 0 });
    sim.step(); assertHealthy(sim);
    assert.ok(y < 2 ? sim.fish[0].vy > 0 : sim.fish[0].vy < 0);
  }
});
test('population changes keep existing fish and add the same seeded fish as a fresh run', () => {
  const sim = new Simulation();
  run(sim, 1);
  const before = structuredClone(sim.fish);
  sim.setCount(300);
  assert.equal(sim.fish.length, 300);
  assert.deepEqual(sim.fish.slice(0, 100), before);
  assert.deepEqual(sim.fish.slice(100), new Simulation(549, 300).fish.slice(100));
  sim.setCount(50); assert.deepEqual(sim.fish, before.slice(0, 50));
  sim.setCount(1e9); assert.equal(sim.fish.length, CONFIG.maxCount);
  sim.setCount(0); assert.equal(sim.fish.length, CONFIG.minCount);
});
test('2000 fish with food and a predator stay finite and bounded', () => {
  const sim = new Simulation(549, CONFIG.maxCount);
  sim.addFood(0, 0, 9); sim.setPredator(true);
  run(sim, 2); assertHealthy(sim, CONFIG.fleeSpeed);
});
