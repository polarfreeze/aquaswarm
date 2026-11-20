import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, CONFIG, STATE } from '../src/simulation.js';

const fishAt = (id, x, y, z, vx = 1, vy = 0, vz = 0) => ({ id, x, y, z, vx, vy, vz, state: STATE.cruise, stateTime: 0, target: -1 });

test('the inspector reports what the selected fish senses', () => {
  const sim = new Simulation();
  sim.fish = [fishAt(0, 0, 8, 0, 3, 0, 4), fishAt(1, 3, 8, 0), fishAt(2, 0, 8, 6.9), fishAt(3, 0, 8, 7.1), fishAt(4, -10, 8, 0)];
  sim.addFood(0, -5, 8);
  const info = sim.inspect(0);
  assert.equal(info.id, 0);
  assert.equal(info.speed, 5);
  assert.equal(info.neighbors, 2, 'only fish within the perception radius count');
  assert.ok(Math.abs(info.foodDistance - 5) < 0.6);
  assert.equal(info.predatorDistance, null);
  assert.equal(info.obstacleDistance, null);
  assert.equal(sim.inspect(99), null, 'a fish that no longer exists has no details');

  // Distances to a column are measured to its surface in plan view, to a boulder in 3D.
  sim.addObstacle('column', 6, -10);
  assert.ok(Math.abs(sim.inspect(0).obstacleDistance - (Math.hypot(6, 10) - CONFIG.columnRadius)) < 1e-9);
});

test('the inspector shows when a rock hides the fish from the predator', () => {
  const sim = new Simulation();
  sim.addObstacle('column', 0, 0);
  sim.fish = [fishAt(0, -5, 8, 0)];
  sim.setPredator(true);
  sim.predator = { ...sim.predator, x: 5, y: 8, z: 0 };
  let info = sim.inspect(0);
  assert.ok(info.predatorDistance < CONFIG.fleeExit);
  assert.equal(info.hidden, true);
  // In the open, or too close for cover, the fish is not hidden.
  sim.predator = { ...sim.predator, x: -5, y: 8, z: 6 };
  assert.equal(sim.inspect(0).hidden, false);
  sim.fish = [fishAt(0, -2.5, 8, 1.5)];
  sim.predator = { ...sim.predator, x: 0.5, y: 8, z: 1.9 };
  info = sim.inspect(0);
  assert.ok(info.predatorDistance <= CONFIG.coverSense);
  assert.equal(info.hidden, false);
});
