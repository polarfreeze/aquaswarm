import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, CONFIG, STATE, RULES, PREDATOR_MODE, lineBlocked } from '../src/simulation.js';

const run = (sim, seconds, each) => { for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(); each?.(sim, i); } };
const fishAt = (id, x, y, z, vx, vy, vz) => ({ id, x, y, z, vx, vy, vz, state: STATE.cruise, stateTime: 0, target: -1 });
const LAYOUT = [['boulder', -10, 3], ['column', 0, -4], ['column', 8, 6], ['boulder', 13, -6]];
const withLayout = (sim = new Simulation()) => { for (const [kind, x, z] of LAYOUT) assert.ok(sim.addObstacle(kind, x, z)); return sim; };

// Deepest overlap of any body capsule (sampled along the heading) with any obstacle; 0 when clear.
function worstPenetration(agents, obstacles, back, front, radius) {
  let worst = 0;
  for (const a of agents) {
    const speed = Math.hypot(a.vx, a.vy, a.vz) || 1;
    for (let k = 0; k <= 8; k++) {
      const t = back + (front - back) * k / 8;
      const x = a.x + a.vx / speed * t, y = a.y + a.vy / speed * t, z = a.z + a.vz / speed * t;
      for (const o of obstacles) {
        const d = Math.hypot(x - o.x, o.kind === 'column' ? 0 : y - o.y, z - o.z);
        worst = Math.max(worst, o.r + radius - d);
      }
    }
  }
  return worst;
}
const fishPenetration = sim => worstPenetration(sim.fish, sim.obstacles, CONFIG.bodyBack, CONFIG.bodyFront, CONFIG.bodyRadius);

test('obstacles keep open water to the glass and to each other, up to a fixed number', () => {
  const sim = new Simulation();
  assert.match(sim.placementProblem('boulder', CONFIG.halfWidth - 2, 0), /glass/);
  assert.match(sim.placementProblem('column', 0, CONFIG.halfDepth - 1), /glass/);
  assert.match(sim.placementProblem('rock', 0, 0), /Unknown/);
  assert.ok(sim.addObstacle('boulder', 0, 0));
  assert.match(sim.placementProblem('column', CONFIG.boulderRadius + CONFIG.columnRadius + 1, 0), /another obstacle/);
  assert.equal(sim.addObstacle('column', 3, 0), null);
  assert.equal(sim.placementProblem('column', CONFIG.boulderRadius + CONFIG.columnRadius + CONFIG.obstacleGap + 0.1, 0), '');
  sim.clearObstacles();
  const spots = [[-16, -9], [0, -9], [16, -9], [-16, 9], [0, 9], [16, 9], [0, 0]];
  spots.forEach(([x, z]) => sim.addObstacle('column', x, z));
  assert.equal(sim.obstacles.length, CONFIG.maxObstacles);
  assert.match(sim.placementProblem('column', 0, 0), /At most/);
  assert.equal(sim.removeObstacleAt(16.5, 9).kind, 'column');
  assert.equal(sim.removeObstacleAt(9, 2), null);
  assert.equal(sim.obstacles.length, CONFIG.maxObstacles - 1);
  sim.reset();
  assert.equal(sim.obstacles.length, 0);
});

test('fish bodies never end a step inside an obstacle while cruising, feeding or fleeing', () => {
  const setups = {
    cruise: () => {},
    'food on a boulder': sim => sim.addFood(-10, 3, 16),
    'food beside columns': sim => { sim.addFood(0, -4, 16); sim.addFood(8, 6, 16); },
    'food + predator': sim => { sim.setPredator(true); sim.addFood(-10, 3, 16); sim.addFood(8, 6, 16); },
    'separation off': sim => { sim.setEnabled('separation', false); sim.addFood(-10, 3, 16); },
  };
  for (const [name, setup] of Object.entries(setups)) {
    const sim = withLayout();
    setup(sim);
    const seen = new Set();
    let worst = 0;
    run(sim, 45, s => { worst = Math.max(worst, fishPenetration(s)); s.fish.forEach(f => seen.add(f.state)); });
    assert.ok(worst < 1e-6, `${name}: deepest overlap ${worst}`);
    if (name === 'food + predator') assert.deepEqual([...seen].sort(), [STATE.cruise, STATE.feed, STATE.flee]);
    for (const f of sim.fish) {
      const speed = Math.hypot(f.vx, f.vy, f.vz);
      assert.ok(Object.values(f).every(Number.isFinite));
      assert.ok(speed >= CONFIG.minSpeed - 1e-9 && speed <= CONFIG.maxSpeed + 1e-9, `${name}: speed ${speed}`);
    }
  }
});

test('look-ahead avoidance steers around obstacles instead of leaning on the push-out', () => {
  const corrections = avoidance => {
    const sim = withLayout();
    sim.setAvoidance(avoidance);
    sim.setPredator(true);
    sim.addFood(-10, 3, 16);
    run(sim, 60);
    return sim.obstacleStats.corrections;
  };
  const on = corrections(true), off = corrections(false);
  assert.ok(on * 5 < off, `push-out corrections with avoidance ${on}, without ${off}`);
});

test('a fish swimming fast straight at a column or boulder turns away without crossing it or stopping', () => {
  for (const [kind, y] of [['column', 9], ['boulder', 2]]) {
    for (const speed of [CONFIG.cruiseSpeed, CONFIG.fleeSpeed]) {
      const sim = new Simulation(549, 1);
      RULES.forEach(rule => sim.setEnabled(rule, false));
      sim.addObstacle(kind, 0, 0);
      sim.fish = [fishAt(0, -12, y, 0, speed, 0, 0)];
      let worst = 0, minSpeed = Infinity;
      run(sim, 4, s => { worst = Math.max(worst, fishPenetration(s)); minSpeed = Math.min(minSpeed, Math.hypot(s.fish[0].vx, s.fish[0].vy, s.fish[0].vz)); });
      const f = sim.fish[0];
      assert.ok(worst < 1e-6, `${kind} at ${speed} u/s: overlap ${worst}`);
      assert.ok(minSpeed >= CONFIG.minSpeed - 1e-9, `${kind} at ${speed} u/s: slowed to ${minSpeed}`);
      // It is clear of the obstacle and still swimming, not pinned against it.
      const gap = Math.hypot(f.x, kind === 'column' ? 0 : f.y - sim.obstacles[0].y, f.z) - sim.obstacles[0].r;
      assert.ok(gap > 1, `${kind} at ${speed} u/s: still ${gap} from the surface after 4 s`);
    }
  }
});

test('a fish turning sharply next to an obstacle slides along it without jitter', () => {
  // Fleeing tangentially past a column and then pushed straight into it by a predator behind.
  const sim = new Simulation(549, 1);
  sim.addObstacle('column', 0, 0);
  const r = CONFIG.columnRadius + CONFIG.bodyRadius + 0.05;
  sim.fish = [fishAt(0, -r, 9, 0, 0, 0, CONFIG.fleeSpeed)];
  sim.setPredator(true);
  sim.predator = { ...sim.predator, x: -r - 8, y: 9, z: 0, vx: 4, vy: 0, vz: 0 };
  let worst = 0, maxStep = 0, previous = { ...sim.fish[0] };
  run(sim, 3, s => {
    const f = s.fish[0];
    worst = Math.max(worst, fishPenetration(s));
    maxStep = Math.max(maxStep, Math.hypot(f.x - previous.x, f.y - previous.y, f.z - previous.z));
    previous = { ...f };
  });
  assert.ok(worst < 1e-6, `overlap ${worst}`);
  assert.ok(maxStep <= CONFIG.maxSpeed / 60 + CONFIG.bodyRadius, `largest single-step move ${maxStep}`);
});

test('no fish stays pinned against an obstacle', () => {
  const sim = withLayout();
  sim.setPredator(true);
  const pinned = new Float64Array(sim.fish.length);
  let longest = 0;
  run(sim, 60, s => s.fish.forEach((f, i) => {
    const touching = s.obstacles.some(o => Math.hypot(f.x - o.x, o.kind === 'column' ? 0 : f.y - o.y, f.z - o.z) - o.r < CONFIG.bodyRadius + 0.2);
    pinned[i] = touching ? pinned[i] + 1 / 60 : 0;
    longest = Math.max(longest, pinned[i]);
  }));
  assert.ok(longest < 2, `longest continuous contact ${longest.toFixed(2)} s`);
});

test('the predator steers around obstacles and never ends a step inside one', () => {
  const sim = withLayout();
  sim.setPredator(true);
  let worst = 0;
  run(sim, 90, s => { worst = Math.max(worst, worstPenetration([s.predator], s.obstacles, CONFIG.predatorBack, CONFIG.predatorFront, CONFIG.predatorRadius)); });
  assert.ok(worst < 1e-6, `predator overlap ${worst}`);
  assert.ok(Object.values(sim.predator).every(v => typeof v !== 'number' || Number.isFinite(v)));
});

test('obstacles placed on top of fish push them out at once; pellets avoid columns and rest on boulders', () => {
  const sim = new Simulation();
  sim.fish = [fishAt(0, 0.3, 9, 0.2, 1.4, 0, 0), fishAt(1, 12, 1.5, 0, 0, 0, 1.4)];
  sim.addObstacle('column', 0, 0);
  assert.ok(sim.addObstacle('boulder', 12, 0));
  assert.ok(fishPenetration(sim) < 1e-9);

  const beside = sim.addFood(0.4, 0, 16);
  assert.ok(Math.hypot(beside.x, beside.z) >= CONFIG.columnRadius + 1, `pellet ${Math.hypot(beside.x, beside.z)} from the column axis`);
  sim.addFood(12, 0, 16);
  run(sim, 30);
  const onRock = sim.food.find(p => Math.hypot(p.x - 12, p.z) < 0.5);
  assert.ok(onRock, 'pellet over the boulder still there');
  const boulder = sim.obstacles[1];
  assert.ok(onRock.y > boulder.y + boulder.r, `pellet rests at ${onRock.y}, boulder top ${boulder.y + boulder.r}`);
});

test('cover: a fish behind a rock does not see the predator and the predator does not target it', () => {
  const column = { kind: 'column', x: 0, y: 9, z: 0, r: CONFIG.columnRadius };
  assert.ok(lineBlocked(-4, 9, 0, 4, 2, 0, [column]));
  assert.ok(!lineBlocked(-4, 9, 3, 4, 9, 3, [column]), 'a line passing beside the column is open');
  const scene = withColumn => {
    const sim = new Simulation(549, 1);
    RULES.forEach(rule => sim.setEnabled(rule, false));
    if (withColumn) sim.addObstacle('column', 0, 0);
    sim.fish = [fishAt(0, 3.5, 9, 0, 0, 0, 0.6)];
    sim.setPredator(true);
    sim.predator = { ...sim.predator, x: -3.5, y: 9, z: 0, vx: 0, vy: 0, vz: 0.5, mode: PREDATOR_MODE.hunt, modeTime: 0 };
    sim.step();
    return sim;
  };
  const open = scene(false), hidden = scene(true);
  assert.equal(open.fish[0].state, STATE.flee);
  assert.equal(open.predator.target, 0);
  assert.equal(hidden.fish[0].state, STATE.cruise, 'hidden fish keeps cruising');
  assert.equal(hidden.predator.target, -1, 'predator has no target behind the column');
  // Within coverSense the fish feels the predator through the rock.
  const close = new Simulation(549, 1);
  close.addObstacle('column', 0, 0);
  close.fish = [fishAt(0, 1.9, 9, 1.3, 0, 0, 0.6)];
  close.setPredator(true);
  close.predator = { ...close.predator, x: -1.9, y: 9, z: 1.3, vx: 0, vy: 0, vz: 0.5 };
  close.step();
  assert.equal(close.fish[0].state, STATE.flee);
});
