// Obstacle behaviour from the same seeded start: four obstacles (two boulders, two coral columns) in
// five situations, each run with look-ahead avoidance on and off (push-out only). Measures how deep
// fish ever end up inside an obstacle, how often the push-out has to act, how long a fish stays in
// contact, the largest single-step move (flinging) and the cost per step. Writes evidence/obstacles-a5.json.
import { Simulation, CONFIG, STATE } from '../src/simulation.js';
import { mkdir, writeFile } from 'node:fs/promises';

const SECONDS = 60;
const LAYOUT = [['boulder', -10, 3], ['column', 0, -4], ['column', 8, 6], ['boulder', 13, -6]];
const SITUATIONS = {
  cruise: () => {},
  'food on a boulder': sim => sim.addFood(-10, 3, 16),
  'food beside columns': sim => { sim.addFood(0, -4, 16); sim.addFood(8, 6, 16); },
  'food + predator': sim => { sim.setPredator(true); sim.addFood(-10, 3, 16); sim.addFood(8, 6, 16); },
  'separation off, food': sim => { sim.setEnabled('separation', false); sim.addFood(-10, 3, 16); },
};

// Deepest overlap of a fish body capsule (sampled along the heading) with any obstacle.
function deepest(sim) {
  let worst = 0;
  for (const f of sim.fish) {
    const speed = Math.hypot(f.vx, f.vy, f.vz) || 1;
    for (let k = 0; k <= 8; k++) {
      const t = CONFIG.bodyBack + (CONFIG.bodyFront - CONFIG.bodyBack) * k / 8;
      const x = f.x + f.vx / speed * t, y = f.y + f.vy / speed * t, z = f.z + f.vz / speed * t;
      for (const o of sim.obstacles) worst = Math.max(worst, o.r + CONFIG.bodyRadius - Math.hypot(x - o.x, o.kind === 'column' ? 0 : y - o.y, z - o.z));
    }
  }
  return worst;
}

function run(name, setup, avoidance) {
  const sim = new Simulation();
  for (const [kind, x, z] of LAYOUT) sim.addObstacle(kind, x, z);
  sim.setAvoidance(avoidance);
  setup(sim);
  const contact = new Float64Array(sim.fish.length);
  let worst = 0, longestContact = 0, maxStep = 0, touchingSum = 0, stepMs = 0;
  const seen = new Set();
  let previous = sim.fish.map(f => ({ ...f }));
  for (let frame = 0; frame < SECONDS * 60; frame++) {
    const start = performance.now();
    sim.step();
    stepMs += performance.now() - start;
    worst = Math.max(worst, deepest(sim));
    let touching = 0;
    sim.fish.forEach((f, i) => {
      seen.add(f.state);
      maxStep = Math.max(maxStep, Math.hypot(f.x - previous[i].x, f.y - previous[i].y, f.z - previous[i].z));
      const near = sim.obstacles.some(o => Math.hypot(f.x - o.x, o.kind === 'column' ? 0 : f.y - o.y, f.z - o.z) - o.r < CONFIG.bodyRadius + 0.2);
      contact[i] = near ? contact[i] + 1 / 60 : 0;
      longestContact = Math.max(longestContact, contact[i]);
      if (near) touching++;
    });
    touchingSum += touching;
    previous = sim.fish.map(f => ({ ...f }));
  }
  const round = v => Math.round(v * 1000) / 1000;
  return { situation: name, avoidance, deepestOverlapAfterStep: round(Math.max(0, worst)),
    pushOutCorrections: sim.obstacleStats.corrections, deepestCorrected: round(sim.obstacleStats.deepest),
    meanFishTouching: round(touchingSum / (SECONDS * 60)), longestContactSeconds: round(longestContact),
    largestStepMove: round(maxStep), statesSeen: [...seen].sort().map(s => Object.keys(STATE)[s]), msPerStep: round(stepMs / (SECONDS * 60)) };
}

// Step cost with and without obstacles at 100 and 1000 fish (cruise, 10 s after a 2 s warm-up).
function cost(count, withObstacles) {
  const sim = new Simulation(CONFIG.seed, count);
  if (withObstacles) for (const [kind, x, z] of LAYOUT) sim.addObstacle(kind, x, z);
  for (let i = 0; i < 120; i++) sim.step();
  const start = performance.now();
  for (let i = 0; i < 600; i++) sim.step();
  return Math.round((performance.now() - start) / 600 * 1000) / 1000;
}

const results = [];
for (const [name, setup] of Object.entries(SITUATIONS)) for (const avoidance of [true, false]) results.push(run(name, setup, avoidance));
const stepCost = [100, 1000].map(count => ({ fish: count, msPerStepEmpty: cost(count, false), msPerStepFourObstacles: cost(count, true) }));
await mkdir('evidence', { recursive: true });
await writeFile('evidence/obstacles-a5.json', JSON.stringify({ seed: CONFIG.seed, fish: CONFIG.count, seconds: SECONDS,
  layout: LAYOUT.map(([kind, x, z]) => ({ kind, x, z, r: kind === 'boulder' ? CONFIG.boulderRadius : CONFIG.columnRadius })),
  body: { front: CONFIG.bodyFront, back: CONFIG.bodyBack, radius: CONFIG.bodyRadius },
  definitions: { touching: `fish centre within body radius + 0.2 u of an obstacle surface`, largestStepMove: 'largest distance any fish moved in one 1/60 s step' },
  caveat: 'One seed and one layout. Timings are from this laptop in Node, not the browser.',
  results, stepCost }, null, 2));
console.table(results.map(r => ({ situation: r.situation, avoid: r.avoidance, overlap: r.deepestOverlapAfterStep, pushOuts: r.pushOutCorrections,
  touching: r.meanFishTouching, longestContact: r.longestContactSeconds, maxMove: r.largestStepMove, ms: r.msPerStep })));
console.table(stepCost);
