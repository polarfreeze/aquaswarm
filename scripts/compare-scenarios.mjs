// Food-only, predator-only and combined scenarios from the same seeded start, using the same three
// pellets as the in-app scenarios and the hunting predator.
// Writes evidence/scenario-comparison-a4.json (the A3 file is kept as the MVP record). No browser.
import { Simulation, CONFIG, STATE } from '../src/simulation.js';
import { mkdir, writeFile } from 'node:fs/promises';

const SECONDS = 60, PREDATOR_OFF_AT = 40;
const PELLETS = [[-10, 4], [4, -6], [13, 7]];

function runScenario(name, { food, predator }) {
  const sim = new Simulation();
  if (food) for (const [x, z] of PELLETS) sim.addFood(x, z, 11);
  if (predator) sim.setPredator(true);
  const sums = { cruise: 0, feed: 0, flee: 0 }, peak = { feed: 0, flee: 0 };
  let samples = 0, maxSpeed = 0, firstFeed = null, firstFlee = null, foodGone = null, recovered = null;
  let fleeEpisodes = 0, shortestFlee = Infinity, feedToFlee = 0;
  const fleeStart = new Map();
  let previous = sim.fish.map(f => f.state);
  for (let frame = 0; frame < SECONDS * 60; frame++) {
    if (predator && frame === PREDATOR_OFF_AT * 60) sim.setPredator(false);
    sim.step();
    const counts = sim.stateCounts();
    for (const key in sums) sums[key] += counts[key];
    samples++;
    peak.feed = Math.max(peak.feed, counts.feed); peak.flee = Math.max(peak.flee, counts.flee);
    if (firstFeed === null && counts.feed) firstFeed = sim.time;
    if (firstFlee === null && counts.flee) firstFlee = sim.time;
    if (food && foodGone === null && sim.food.length === 0) foodGone = sim.time;
    if (predator && frame >= PREDATOR_OFF_AT * 60 && recovered === null && counts.flee === 0) recovered = sim.time - PREDATOR_OFF_AT;
    sim.fish.forEach((f, i) => {
      maxSpeed = Math.max(maxSpeed, Math.hypot(f.vx, f.vy, f.vz));
      if (f.state === STATE.flee && previous[i] !== STATE.flee) {
        fleeStart.set(i, sim.time);
        if (previous[i] === STATE.feed) feedToFlee++;
      }
      if (f.state !== STATE.flee && previous[i] === STATE.flee) {
        fleeEpisodes++; shortestFlee = Math.min(shortestFlee, sim.time - fleeStart.get(i));
      }
    });
    previous = sim.fish.map(f => f.state);
  }
  const round = value => value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
  return { scenario: name,
    meanFishPerState: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, round(v / samples)])),
    peakFeeding: peak.feed, peakFleeing: peak.flee,
    firstFeedingSeconds: round(firstFeed), firstFleeingSeconds: round(firstFlee),
    allFoodGoneSeconds: round(foodGone), feedToFleeSwitches: feedToFlee,
    fleeEpisodes, shortestFleeSeconds: round(shortestFlee),
    recoverySecondsAfterPredatorRemoved: round(recovered), maxSpeed: round(maxSpeed) };
}

const results = [
  runScenario('food only', { food: true }),
  runScenario('predator only', { predator: true }),
  runScenario('food + predator', { food: true, predator: true }),
];
await mkdir('evidence', { recursive: true });
await writeFile('evidence/scenario-comparison-a4.json', JSON.stringify({
  seed: CONFIG.seed, fish: CONFIG.count, seconds: SECONDS, predatorRemovedAt: PREDATOR_OFF_AT,
  pellets: PELLETS.map(([x, z]) => ({ x, y: 11, z })),
  predator: { huntSeconds: CONFIG.predatorHunt, restSeconds: CONFIG.predatorRest, huntSpeed: CONFIG.predatorHuntSpeed },
  thresholds: { feedEnter: CONFIG.feedEnter, feedExit: CONFIG.feedExit, fleeEnter: CONFIG.fleeEnter, fleeExit: CONFIG.fleeExit, fleeHold: CONFIG.fleeHold },
  caveat: 'One seed and one tank layout. Descriptive evidence for the behaviour loop, not a general result.',
  results }, null, 2));
console.table(results.map(r => ({ scenario: r.scenario, ...r.meanFishPerState, peakFeed: r.peakFeeding, peakFlee: r.peakFleeing,
  foodGone: r.allFoodGoneSeconds, feedToFlee: r.feedToFleeSwitches, shortestFlee: r.shortestFleeSeconds,
  recovery: r.recoverySecondsAfterPredatorRemoved, maxSpeed: r.maxSpeed })));
