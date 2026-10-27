// Feeding-challenge balance: three scripted players on several seeds, same rules as the app
// (hunting predator, food dropped every 4 s, at most 3 pellets). Writes evidence/challenge-balance-a4.json.
import { Simulation, CONFIG, CHALLENGE, randomGenerator } from '../src/simulation.js';
import { mkdir, writeFile } from 'node:fs/promises';

const SEEDS = [549, 7, 1234, 2026, 42], EVERY = 4;
const STRATEGIES = {
  'no food': () => {},
  'random spot': (sim, random) => sim.addFood((random() - 0.5) * 44, (random() - 0.5) * 30),
  'near school, away from predator': sim => {
    const n = sim.fish.length, p = sim.predator;
    const cx = sim.fish.reduce((a, f) => a + f.x / n, 0), cz = sim.fish.reduce((a, f) => a + f.z / n, 0);
    const d = Math.hypot(cx - p.x, cz - p.z) || 1;
    sim.addFood(cx + (cx - p.x) / d * 4, cz + (cz - p.z) / d * 4);
  },
};
function play(seed, place) {
  const sim = new Simulation(seed), random = randomGenerator(seed ^ 0xbeef);
  sim.setPredator(true);
  for (let t = 0; t < CHALLENGE.seconds * 60; t++) {
    if (t % (EVERY * 60) === 0) place(sim, random);
    sim.step();
    if (sim.foodEaten >= CHALLENGE.meals * CONFIG.foodAmount) return { won: true, seconds: Math.round(sim.time * 10) / 10, meals: CHALLENGE.meals };
  }
  return { won: false, seconds: CHALLENGE.seconds, meals: Math.round(sim.foodEaten / CONFIG.foodAmount * 10) / 10 };
}
const results = Object.entries(STRATEGIES).map(([strategy, place]) => {
  const runs = SEEDS.map(seed => ({ seed, ...play(seed, place) }));
  return { strategy, wins: runs.filter(r => r.won).length, runs };
});
await mkdir('evidence', { recursive: true });
await writeFile('evidence/challenge-balance-a4.json', JSON.stringify({ challenge: CHALLENGE, dropEverySeconds: EVERY, seeds: SEEDS,
  caveat: 'Scripted players, not people. A person can aim more precisely, so this bounds difficulty rather than measuring it.', results }, null, 2));
for (const r of results) console.log(`${r.strategy.padEnd(34)} wins ${r.wins}/${SEEDS.length}  ` + r.runs.map(x => x.won ? `${x.seconds}s` : `${x.meals}m`).join(' '));
