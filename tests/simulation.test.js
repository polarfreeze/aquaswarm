import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FixedClock, CONFIG, DEFAULT_WEIGHTS, RULES } from '../src/simulation.js';

const run = (sim, seconds) => { for (let i = 0; i < seconds * 60; i++) sim.step(); };
function assertHealthy(sim) {
  for (const fish of sim.fish) {
    for (const value of Object.values(fish)) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(fish.x) <= CONFIG.halfWidth);
    assert.ok(Math.abs(fish.z) <= CONFIG.halfDepth);
    assert.ok(fish.y >= 1.1 && fish.y <= CONFIG.height - 1.1);
    const speed = Math.hypot(fish.vx, fish.vy, fish.vz);
    assert.ok(speed <= CONFIG.maxSpeed + 1e-9);
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
test('all rule combinations and extreme weights remain bounded', () => {
  for (let mask = 0; mask < 8; mask++) {
    const sim = new Simulation();
    RULES.forEach((rule, index) => { sim.setEnabled(rule, Boolean(mask & 1 << index)); sim.setWeight(rule, 3); });
    run(sim, 20); assertHealthy(sim);
  }
});
test('reset restores seed, fish, rules, weights, running state and elapsed time', () => {
  const sim = new Simulation();
  const initial = structuredClone(sim.fish);
  sim.setWeight('separation', 3); sim.setEnabled('alignment', false); run(sim, 3);
  sim.paused = true; sim.reset();
  assert.deepEqual(sim.fish, initial); assert.deepEqual(sim.weights, DEFAULT_WEIGHTS);
  assert.ok(RULES.every(rule => sim.enabled[rule])); assert.equal(sim.time, 0); assert.equal(sim.paused, false);
});
test('two seeded runs and reordered traversal give the same behavior', () => {
  const a = new Simulation(), b = new Simulation();
  run(a, 2); run(b, 2); assert.deepEqual(a.fish, b.fish);
  b.fish.reverse(); a.step(); b.step(); b.fish.reverse();
  a.fish.forEach((f, i) => {
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert.ok(Math.abs(f[key] - b.fish[i][key]) < 1e-10);
  });
});
test('coincident neighbors and zero velocities resolve without NaN', () => {
  const sim = new Simulation();
  sim.fish.forEach(f => { f.x = 0; f.y = CONFIG.height / 2; f.z = 0; f.vx = 0; f.vy = 0; f.vz = 0; });
  run(sim, 2); assertHealthy(sim);
  assert.ok(sim.metrics().spacing > 0);
});
test('each Boids rule has the expected isolated steering direction', () => {
  const fixture = [{id:0,x:0,z:0,y:9,vy:0,vx:2,vz:0},{id:1,x:0,z:1,y:9,vy:0,vx:0,vz:2}];
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
    sim.fish = [{id:0,x:0,y:9,z:0,vx:2,vy:0,vz:0}, {id:1,x:0,y:10,z:0,vx:0,vy:2,vz:0}];
    RULES.forEach(r => sim.setEnabled(r, r === rule));
    sim.step();
    assert.ok(rule === 'separation' ? sim.fish[0].vy < 0 : sim.fish[0].vy > 0);
  }
  const sim = new Simulation(549, 2);
  sim.fish = [{id:0,x:0,y:5,z:0,vx:2,vy:0,vz:0}, {id:1,x:0,y:13,z:0,vx:0,vy:2,vz:0}];
  sim.step(); assert.equal(sim.fish[0].vy, 0);
});

test('top and bottom containment work with all Boids disabled', () => {
  for (const [y, vy] of [[1.1001, -3.8], [CONFIG.height - 1.1001, 3.8]]) {
    const sim = new Simulation(549, 1);
    RULES.forEach(r => sim.setEnabled(r, false));
    Object.assign(sim.fish[0], {x:0,y,z:0,vx:0,vy,vz:0});
    sim.step(); assertHealthy(sim);
    assert.ok(y < 2 ? sim.fish[0].vy > 0 : sim.fish[0].vy < 0);
  }
});
