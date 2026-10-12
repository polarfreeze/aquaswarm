# AquaSwarm · Collective Behaviour Lab

An interactive 3D fish-schooling simulation for the browser. One hundred fish follow the Boids rules (separation, alignment, cohesion). A small state machine adds feeding and fleeing. Each fish swims with a procedural tail beat driven by its own speed. You can drop food, add a predator, switch rules on and off, and stress-test the simulation up to 2000 fish.

This is the Assignment 3 MVP. Its scope is the MVP defined in Assignment 2: one tank, 100 fish of one type, one food point and one stationary predator.

CS 549 AI for Visual Computing · Group AquaSwarm · Dongquan Yang (dy303) · Version 0.3.0 (Assignment 3 MVP)

- **Live demo:** https://polarfreeze.github.io/aquaswarm/
- **Demo video (2:28):** [Google Drive](https://drive.google.com/file/d/1dXwZbWmqc93Bux9iuLTf61M0L1bciW_A/view?usp=drive_link). The local copy is `evidence/assignment-3-demo.webm`, with captions in `.srt` and a chapter list.

## Build and run

You need Node.js 20.19+ or 22.12+ (tested with 22.19.0) and a browser with WebGL 2 and hardware acceleration enabled.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Do not open `index.html` directly from disk.

Production build:

```bash
npm run build
npm run preview
```

The output goes to `dist/`. It uses relative asset paths (`base: './'`), so the folder works from any static host, including a GitHub Pages project subpath. `.github/workflows/deploy-pages.yml` tests, builds and deploys the app on every push to `main`. To turn it on, set the repository's **Settings → Pages → Source** to "GitHub Actions".

After `npm ci` the app needs no network: there are no external models, fonts, images, APIs or backend.

## Using it

| Action | How |
| --- | --- |
| Drop food | Click the water. Food sinks and is eaten gradually. There is one food point: a new click moves it. Clear food (C) removes it. |
| Predator | Add predator (P). It stays at the centre of the tank and never eats fish; fish that swim close flee. |
| Camera | Drag to orbit, scroll to zoom toward the pointer. Perspective and Top view buttons. Expand hides the side panel. |
| Rules | Each Boids rule has its own on/off switch and a 0–3 weight slider. |
| Behaviour & display | Swim animation on/off, colour by state, and a legend of the behaviour states. |
| Stress test | Population slider (10–2000), plus an automatic run at 100 → 2000 fish that reports FPS, simulation ms per step, and real-time rate. |
| Transport | Pause/Resume (Space) and Reset (R). Reset restores the seed, rules, population, food, predator and camera. |

Fish colours show their state: orange = cruise, green = feed, red = flee.

## How it works

| File | Responsibility |
| --- | --- |
| `src/simulation.js` | Pure simulation, independent of Three.js: seeded RNG, Boids, uniform-grid neighbour search, behaviour state machine, food point, predator, fixed-step clock. |
| `src/animation.js` | `SwimAnimator`: smoothed yaw/pitch/bank, tail-beat phase and amplitude, turn bend. Pure JavaScript, so it is unit-tested. |
| `src/fishGeometry.js` | Procedural low-poly fish and predator meshes, plus the vertex-shader swim deformation. |
| `src/scene.js` | Three.js scene: instanced school and predator, shadows, food, camera. |
| `src/main.js` | UI, input, main loop, stress test, and the test hooks (`?test` only). |

**Boids.** Each fish reads the previous step's state (double-buffered), so the order of updates does not matter.
- Neighbours are found with a uniform grid of 7-unit cells (the perception radius).
- Separation applies within 1.65 units.
- Each rule uses Reynolds steering (desired velocity − current velocity). Each rule's force is capped at 2.4 and the total at 7.
- A cruise-speed term keeps fish near 2.8 u/s, and speed stays between 1.2 and 3.8 u/s.
- Walls use predictive steering, with a hard reflection as a fallback.

**Behaviour.** Priority is flee > feed > cruise.
- Fish **feed** when a pellet is within 13 units and stop beyond 17 units.
- Fish **flee** when the predator is within 8 units. They keep fleeing until it is beyond 12 units and at least 1 s has passed.
- The gap between the enter and exit distances (hysteresis) stops fish flickering between states.
- Fleeing fish swim away from the predator at up to 6.4 u/s. When the threat is gone, they slow down gradually instead of snapping back.
- The food is eaten gradually. With three or more fish eating, it lasts about 12 s; uneaten food expires after 45 s.

**Animation.**
- Tail-beat frequency is (0.8 + 0.75 × speed) Hz, and amplitude also grows with speed.
- The tail-beat phase is integrated over time, so a change in speed never makes the tail jump.
- The body bends into turns and banks with the yaw rate.
- The vertex shader applies a travelling wave whose strength grows toward the tail, using per-instance attributes. The whole school is one draw call.
- Animation advances on simulated time only, so pausing freezes it too.

**Timing.**
- The simulation runs fixed 1/60 s steps.
- Each frame runs at most 4 steps, and at most 12 ms of simulation work.
- When the load is too high, simulated time slows below real time while rendering stays responsive. The stress test reports this as the "real-time" percentage.

## Tests and evidence

```bash
npm test
npx playwright install chromium
npm run test:browser
npm run compare:scenarios
npm run compare:rules
npm run build && npm run perf
npm run build && npm run record
```

- `npm test`: 34 Node tests covering:
  - Boids invariants and 10-minute runs, one with cruising only and one with the full feed/flee loop.
  - The grid neighbour search matches a brute-force search.
  - Determinism and overload behaviour of the fixed clock.
  - Feeding, fleeing, priority, hysteresis and recovery.
  - Swim-animation properties.
- `npm run test:browser`: 4 Playwright tests on the real app:
  - Controls, pause/resume and reset.
  - Click to feed (one food point), predator, escape priority, recovery and display options.
  - Population slider and stress test.
  - Mobile layout.
- `compare:scenarios` and `compare:rules` write seeded comparisons to `evidence/*-a3.json`.
- `perf` measures the production build on this machine's GPU at 1920×1080. It runs 5 minutes steady state, then the stress test, then a crowding worst case, and writes `evidence/performance-a3.json`.
- `record` makes the demo video.

`VALIDATION.md` summarises the results.

The `?test` query adds read-only hooks (`window.aquaswarmSnapshot()` and projection helpers) for the browser tests. The normal page does not expose them.

## Credits

The fish models are generated in code, so there are no third-party art assets. Libraries: [Three.js](https://threejs.org/) and [Vite](https://vite.dev/). Development was assisted by AI coding tools: Codex for Assignment 2, and Claude Code for Assignment 3. The Assignment 3 report has the details.
