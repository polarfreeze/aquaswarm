// Procedural swim animation state, independent of Three.js so it can be tested in Node.
// Maps each agent's velocity to a smoothed pose (yaw, pitch, bank) and a tail-beat wave
// (phase, amplitude, body bend). It advances by simulated time, so pausing freezes it.
export const SWIM = Object.freeze({
  turnRate: 7, pitchRate: 5, maxPitch: 1.05, maxBank: 0.55, maxBend: 0.32,
  // Tail-beat frequency grows with speed (Hz = base + perSpeed × u/s).
  baseFrequency: 0.8, frequencyPerSpeed: 0.75,
  baseAmplitude: 0.07, amplitudePerSpeed: 0.022, maxAmplitude: 0.2, turnAmplitude: 0.05,
});

const TAU = Math.PI * 2;
const wrap = angle => angle - TAU * Math.floor((angle + Math.PI) / TAU);

export class SwimAnimator {
  constructor(capacity, { frequencyScale = 1, amplitudeScale = 1 } = {}) {
    this.frequencyScale = frequencyScale;
    this.amplitudeScale = amplitudeScale;
    this.allocate(capacity);
  }

  allocate(capacity) {
    this.capacity = capacity;
    for (const key of ['yaw', 'pitch', 'bank', 'phase', 'amplitude', 'bend', 'frequency', 'yawRate'])
      this[key] = new Float32Array(capacity);
    this.ready = new Uint8Array(capacity);
  }

  reset() { this.ready.fill(0); }

  // Poses an agent directly from its velocity, with a per-index tail phase so neighbours differ.
  #initialise(i, agent) {
    this.yaw[i] = Math.atan2(-agent.vz, agent.vx);
    this.pitch[i] = Math.max(-SWIM.maxPitch, Math.min(SWIM.maxPitch, Math.atan2(agent.vy, Math.hypot(agent.vx, agent.vz))));
    this.bank[i] = 0; this.bend[i] = 0; this.yawRate[i] = 0;
    this.phase[i] = (i * 2.39996) % TAU;
    const speed = Math.hypot(agent.vx, agent.vy, agent.vz);
    this.frequency[i] = (SWIM.baseFrequency + SWIM.frequencyPerSpeed * speed) * this.frequencyScale;
    this.amplitude[i] = Math.min(SWIM.maxAmplitude, SWIM.baseAmplitude + SWIM.amplitudePerSpeed * speed) * this.amplitudeScale;
    this.ready[i] = 1;
  }

  update(agents, dt) {
    if (agents.length > this.capacity) {
      const old = this;
      const copy = {};
      for (const key of ['yaw', 'pitch', 'bank', 'phase', 'amplitude', 'bend', 'frequency', 'yawRate', 'ready']) copy[key] = old[key];
      this.allocate(Math.max(agents.length, this.capacity * 2));
      for (const key in copy) this[key].set(copy[key]);
    }
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (!this.ready[i]) { this.#initialise(i, agent); continue; }
      if (!(dt > 0)) continue;
      const horizontal = Math.hypot(agent.vx, agent.vz);
      const speed = Math.hypot(agent.vx, agent.vy, agent.vz);
      // Exponential smoothing toward the velocity heading. Yaw is unwrapped through the shortest
      // arc; when swimming almost vertically the heading is undefined, so the last yaw is kept.
      const turn = 1 - Math.exp(-SWIM.turnRate * dt);
      const yawDelta = horizontal > 0.15 ? wrap(Math.atan2(-agent.vz, agent.vx) - this.yaw[i]) * turn : 0;
      this.yaw[i] = wrap(this.yaw[i] + yawDelta);
      const targetPitch = Math.max(-SWIM.maxPitch, Math.min(SWIM.maxPitch, Math.atan2(agent.vy, horizontal)));
      this.pitch[i] += (targetPitch - this.pitch[i]) * (1 - Math.exp(-SWIM.pitchRate * dt));
      // Turning bends the body into the turn and banks it slightly; both are smoothed and clamped.
      this.yawRate[i] += (yawDelta / dt - this.yawRate[i]) * turn;
      const settle = 1 - Math.exp(-6 * dt);
      const bendTarget = Math.max(-SWIM.maxBend, Math.min(SWIM.maxBend, -this.yawRate[i] * 0.16));
      this.bend[i] += (bendTarget - this.bend[i]) * settle;
      const bankTarget = Math.max(-SWIM.maxBank, Math.min(SWIM.maxBank, this.yawRate[i] * 0.22));
      this.bank[i] += (bankTarget - this.bank[i]) * settle;
      // Frequency and amplitude follow speed smoothly; the phase is integrated, so a frequency
      // change never makes the tail jump.
      const frequency = (SWIM.baseFrequency + SWIM.frequencyPerSpeed * speed) * this.frequencyScale;
      this.frequency[i] += (frequency - this.frequency[i]) * settle;
      const amplitude = Math.min(SWIM.maxAmplitude, SWIM.baseAmplitude + SWIM.amplitudePerSpeed * speed
        + SWIM.turnAmplitude * Math.min(1, Math.abs(this.yawRate[i]) / 2)) * this.amplitudeScale;
      this.amplitude[i] += (amplitude - this.amplitude[i]) * settle;
      this.phase[i] = (this.phase[i] + TAU * this.frequency[i] * dt) % TAU;
    }
  }
}
