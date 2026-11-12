// Feeding-challenge balance: scripted players on several seeds, same rules as the app (rock layout,
// hunting predator, at most 3 pellets). Food goes in every 4 s on 5 seeds, then at irregular
// 2.5-6.5 s intervals on 20 seeds. Writes evidence/challenge-balance-a5.json.
import { Simulation, CONFIG, CHALLENGE, CHALLENGE_LAYOUT, randomGenerator } from '../src/simulation.js';
import { mkdir, writeFile } from 'node:fs/promises';

const SEEDS = [549, 7, 1234, 2026, 42], EVERY = 4;
const JITTER_SEEDS = [...SEEDS, ...Array.from({ length: 15 }, (_, i) => 1000 + i * 37)];
const schoolCentre = sim => {
  const n = sim.fish.length;
  return [sim.fish.reduce((a, f) => a + f.x / n, 0), sim.fish.reduce((a, f) => a + f.z / n, 0)];
};
const STRATEGIES = {
  'no food': () => {},
  'random spot': (sim, random) => sim.addFood((random() - 0.5) * 44, (random() - 0.5) * 30),
  'near school, away from predator': sim => {
    const [cx, cz] = schoolCentre(sim), p = sim.predator;
    const d = Math.hypot(cx - p.x, cz - p.z) || 1;
    sim.addFood(cx + (cx - p.x) / d * 4, cz + (cz - p.z) / d * 4);
  },
  'behind the rock nearest the school': sim => {
    const [cx, cz] = schoolCentre(sim), p = sim.predator;
    const o = sim.obstacles.reduce((a, b) => Math.hypot(a.x - cx, a.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? a : b);
    const d = Math.hypot(o.x - p.x, o.z - p.z) || 1;
    sim.addFood(o.x + (o.x - p.x) / d * (o.r + 2.5), o.z + (o.z - p.z) / d * (o.r + 2.5));
  },
};
function play(seed, place, irregular = false) {
  const sim = new Simulation(seed), random = randomGenerator(seed ^ 0xbeef), timing = randomGenerator(seed ^ 0x1717);
  for (const [kind, x, z] of CHALLENGE_LAYOUT) sim.addObstacle(kind, x, z);
  sim.setPredator(true);
  let next = 0;
  for (let t = 0; t < CHALLENGE.seconds * 60; t++) {
    if (t >= next) { place(sim, random); next = t + (irregular ? Math.round((2.5 + timing() * 4) * 60) : EVERY * 60); }
    sim.step();
    if (sim.foodEaten >= CHALLENGE.meals * CONFIG.foodAmount) return { won: true, seconds: Math.round(sim.time * 10) / 10, meals: CHALLENGE.meals };
  }
  return { won: false, seconds: CHALLENGE.seconds, meals: Math.round(sim.foodEaten / CONFIG.foodAmount * 10) / 10 };
}
const results = Object.entries(STRATEGIES).map(([strategy, place]) => {
  const runs = SEEDS.map(seed => ({ seed, ...play(seed, place) }));
  const irregular = JITTER_SEEDS.map(seed => ({ seed, ...play(seed, place, true) }));
  return { strategy, wins: runs.filter(r => r.won).length, runs, irregularWins: irregular.filter(r => r.won).length, irregular };
});
await mkdir('evidence', { recursive: true });
await writeFile('evidence/challenge-balance-a5.json', JSON.stringify({ challenge: CHALLENGE, layout: CHALLENGE_LAYOUT, dropEverySeconds: EVERY, seeds: SEEDS,
  irregularDropSeconds: [2.5, 6.5], irregularSeeds: JITTER_SEEDS,
  caveat: 'Scripted players, not people. A person can aim more precisely, so this bounds difficulty rather than measuring it.', results }, null, 2));
for (const r of results) console.log(`${r.strategy.padEnd(36)} every 4 s ${r.wins}/${SEEDS.length}  irregular ${r.irregularWins}/${JITTER_SEEDS.length}  ` + r.runs.map(x => x.won ? `${x.seconds}s` : `${x.meals}m`).join(' '));
