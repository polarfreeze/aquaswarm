import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwimAnimator, SWIM } from '../src/animation.js';
import { Simulation } from '../src/simulation.js';

const agent = (vx, vy, vz) => ({ vx, vy, vz });
const dt = 1 / 60;
const POSE = ['yaw', 'pitch', 'bank', 'phase', 'amplitude', 'bend'];

test('neighbouring fish start with different tail phases', () => {
  const anim = new SwimAnimator(10);
  anim.update(Array.from({ length: 10 }, () => agent(2, 0, 0)), dt);
  assert.equal(new Set(Array.from(anim.phase, p => p.toFixed(4))).size, 10);
});

test('tail-beat frequency and amplitude increase with speed', () => {
  const anim = new SwimAnimator(2);
  const agents = [agent(1.5, 0, 0), agent(6, 0, 0)];
  for (let i = 0; i < 120; i++) anim.update(agents, dt);
  assert.ok(anim.frequency[1] > anim.frequency[0] * 1.8, `${anim.frequency[0]} vs ${anim.frequency[1]}`);
  assert.ok(anim.amplitude[1] > anim.amplitude[0]);
  assert.ok(anim.amplitude[1] <= SWIM.maxAmplitude + 1e-6);
});

test('a zero time step (pause) freezes the pose and the tail', () => {
  const anim = new SwimAnimator(3);
  const agents = [agent(2, 0.3, 1), agent(-1, 0, 2), agent(0, 0, -3)];
  for (let i = 0; i < 30; i++) anim.update(agents, dt);
  const before = POSE.map(k => Array.from(anim[k]));
  anim.update([agent(-2, 1, 0), agent(3, 0, 0), agent(0, 2, 0)], 0);
  assert.deepEqual(POSE.map(k => Array.from(anim[k])), before);
});

test('heading follows the velocity smoothly and takes the short way across ±π', () => {
  const anim = new SwimAnimator(1);
  const heading = a => agent(Math.cos(a) * 2, 0, -Math.sin(a) * 2);
  anim.update([heading(Math.PI - 0.05)], dt);
  let maxStep = 0, previous = anim.yaw[0];
  for (let i = 0; i < 60; i++) {
    anim.update([heading(-Math.PI + 0.05)], dt);
    maxStep = Math.max(maxStep, Math.abs(Math.atan2(Math.sin(anim.yaw[0] - previous), Math.cos(anim.yaw[0] - previous))));
    previous = anim.yaw[0];
  }
  assert.ok(maxStep < 0.02, `largest per-frame yaw change ${maxStep}`);
  assert.ok(Math.abs(Math.cos(anim.yaw[0]) + 1) < 2e-3, "settles on the new heading");
});

test('a fast turn rotates the model gradually and bends the tail into the turn', () => {
  const anim = new SwimAnimator(1);
  for (let i = 0; i < 30; i++) anim.update([agent(3, 0, 0)], dt);
  let maxStep = 0, maxBend = 0, previous = anim.yaw[0];
  // Velocity swings left (toward −z, positive yaw) at about 4.8 rad/s.
  for (let i = 0; i < 60; i++) {
    const a = Math.min(Math.PI * 0.9, i * 0.08);
    anim.update([agent(Math.cos(a) * 3, 0, -Math.sin(a) * 3)], dt);
    maxStep = Math.max(maxStep, Math.abs(anim.yaw[0] - previous)); previous = anim.yaw[0];
    maxBend = Math.max(maxBend, Math.abs(anim.bend[0]));
    assert.ok(anim.bend[0] <= 1e-9, 'tail bends toward the inside of a left turn');
  }
  assert.ok(maxStep < 0.1, `per-frame yaw change ${maxStep}`);
  assert.ok(maxBend > 0.05 && maxBend <= SWIM.maxBend + 1e-6);
});

test('vertical swimming clamps pitch and keeps the last heading without NaN', () => {
  const anim = new SwimAnimator(2);
  anim.update([agent(2, 0, 1), agent(0, 0, 0)], dt);
  for (let i = 0; i < 120; i++) anim.update([agent(0, 3, 0), agent(0, 0, 0)], dt);
  for (const key of [...POSE, 'frequency']) for (const v of anim[key]) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(anim.pitch[0]) <= SWIM.maxPitch + 1e-6);
  assert.ok(Math.abs(anim.yaw[0] - Math.atan2(-1, 2)) < 1e-6);
});

test('the animator grows with the population and stays finite for a 2000-fish school', () => {
  const sim = new Simulation(549, 100);
  const anim = new SwimAnimator(100);
  sim.setPredator(true); sim.addFood(0, 0, 9);
  for (let i = 0; i < 30; i++) { sim.step(); anim.update(sim.fish, dt); }
  const phases = Array.from(anim.phase.slice(0, 100));
  sim.setCount(2000);
  for (let i = 0; i < 5; i++) { sim.step(); anim.update(sim.fish, dt); }
  assert.ok(anim.capacity >= 2000);
  assert.ok(phases.every((p, i) => Math.abs(p - anim.phase[i]) < Math.PI * 2), 'existing poses are kept when growing');
  for (const key of POSE) assert.ok(anim[key].slice(0, 2000).every(Number.isFinite));
});
