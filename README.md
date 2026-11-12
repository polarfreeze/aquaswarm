# AquaSwarm · Collective Behaviour Lab

An interactive 3D fish-schooling simulation for the browser. One hundred fish follow the Boids rules (separation, alignment, cohesion). A small state machine adds feeding and fleeing. Fish steer around boulders and coral columns, and each fish swims with a procedural tail beat driven by its own speed.

The app opens on a start menu with two modes:

- **Explore the lab:** switch Boids rules, run behaviour scenarios, drop food, place boulders and coral, release a hunting predator, and stress-test up to 2000 fish. **Finish** shows a session summary.
- **Feeding challenge:** get the school to eat 11 meals in 90 seconds while the predator hunts. Fish that flee stop eating, and rocks block the predator's sight, so where you drop food matters. It ends in a win or time-out screen and keeps your best time.

CS 549 AI for Visual Computing · Group AquaSwarm · Dongquan Yang (dy303) · Version 0.5.0 (Assignment 5)

- **Live demo:** https://polarfreeze.github.io/aquaswarm/ (Assignment 5 at https://polarfreeze.github.io/aquaswarm/v0.5/, Assignment 4 at https://polarfreeze.github.io/aquaswarm/v0.4/, Assignment 3 at https://polarfreeze.github.io/aquaswarm/v0.3/)
- **Release notes:** [CHANGELOG.md](CHANGELOG.md)
- **Assignment 3 demo video (2:28):** [Google Drive](https://drive.google.com/file/d/1dXwZbWmqc93Bux9iuLTf61M0L1bciW_A/view?usp=drive_link). The local copy is `evidence/assignment-3-demo.webm`, with captions in `.srt` and a chapter list.

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
| Start | Pick a mode on the start menu. **Menu** (top right) returns to it. |
| Drop food | With the Food tool (F), click the water. Food sinks and is eaten gradually; it comes to rest on top of boulders. At most three pellets: a fourth replaces the oldest. Clear food (C) removes them. |
| Obstacles | Explore mode. Boulder (B) or Coral (O), then click the sand; a green preview means it fits, red means it is too close to the glass or another obstacle (fish need room to pass). Remove (X), then click an obstacle. Up to six; **Clear rocks** removes all. Restart keeps them. |
| Predator | Release predator (P), explore mode only. It hunts the nearest fish for 6 s, then rests and patrols for 5 s. It is slower than a fleeing fish and never eats; fish that come close flee. |
| Environment | Explore opens with two boulders and three coral columns. The **Obstacles** switch saves the layout while off and restores it when on. **Restore default layout** restores the five rocks without changing food or the predator. |
| Scenarios | Cruise, Feeding, Predator, Feed + predator. Each restarts fish from seed 549 while preserving the environment and any custom rocks. |
| Camera | Drag to orbit, scroll to zoom toward the pointer. Perspective and Top view buttons. Expand hides the side panel. |
| Rules | Each Boids rule has its own on/off switch and a 0–3 weight slider. **Body contact** (on by default) keeps fish bodies from overlapping, even with separation off. **Obstacle avoidance** (on by default) can be turned off to compare with push-out only. |
| Display | Swim animation on/off and colour by state. |
| Stress test | Population slider (10–2000), plus an automatic run at 100 → 2000 fish that reports FPS, simulation ms per step, and real-time rate. |
| Transport | Pause/Resume (Space), Restart (R) and Finish (Esc). Restart repeats the current scenario or mode from the seed. Finish ends the session and shows the results screen. |

Fish colours show their state: orange = cruise, green = feed, red = flee.

## How it works

| File | Responsibility |
| --- | --- |
| `src/simulation.js` | Pure simulation, independent of Three.js: seeded RNG, Boids, uniform-grid neighbour search, behaviour state machine, body contact between fish, obstacles (placement rules, avoidance, push-out, cover), food pellets, hunting predator, session counters, challenge rules, fixed-step clock. |
| `src/animation.js` | `SwimAnimator`: smoothed yaw/pitch/bank, tail-beat phase and amplitude, turn bend. Pure JavaScript, so it is unit-tested. |
| `src/fishGeometry.js` | Procedural low-poly fish and predator meshes, plus the vertex-shader swim deformation. |
| `src/obstacleGeometry.js` | Procedural boulders, coral columns and sea grass, plus the vertex-shader sway for the grass. |
| `src/scene.js` | Three.js scene: instanced school and predator, obstacles, sea grass, placement preview, shadows, food, camera. |
| `src/main.js` | UI, game states (menu → explore or challenge → results), input, main loop, stress test, and the test hooks (`?test` only). |

**Boids.** Each fish reads the previous step's state (double-buffered), so the order of updates does not matter.
- Neighbours are found with a uniform grid of 7-unit cells (the perception radius).
- Separation applies within 1.65 units.
- Each rule uses Reynolds steering (desired velocity − current velocity). Each rule's force is capped at 2.4 and the total at 7.
- A cruise-speed term keeps fish near 2.8 u/s, and speed stays between 1.2 and 3.8 u/s.
- Walls use predictive steering, with a hard reflection as a fallback.

**Behaviour.** Priority is flee > feed > cruise.
- Fish **feed** when a pellet is within 13 units and stop beyond 17 units.
- The **predator** hunts the nearest fish within 18 units at 4.3 u/s for 6 s, then rests and patrols at 2.2 u/s for 5 s, so it never chases forever. Fleeing fish reach 6.4 u/s, so they can always escape.
- Fish **flee** when the predator is within 8 units. They keep fleeing until it is beyond 12 units and at least 1 s has passed.
- The gap between the enter and exit distances (hysteresis) stops fish flickering between states.
- Fleeing fish swim away from the predator at up to 6.4 u/s. When the threat is gone, they slow down gradually instead of snapping back.
- Each pellet is eaten gradually. With three or more fish eating, it lasts about 12 s (one "meal"); uneaten food expires after 45 s.

**Obstacles.**
- A boulder is a sphere of radius 4 u whose centre sits 1.4 u above the sand; a coral column is a vertical cylinder of radius 1.6 u through the whole water depth. The drawn meshes stay inside these shapes.
- Placement keeps 3.2 u of open water between an obstacle and the glass or any other obstacle, so no layout can seal a passage.
- *Avoidance (steering).* Each fish projects every obstacle's centre onto its line of travel. If the centre is ahead within 1.1 s of travel and closer to the line than radius + body + 0.9 u, the fish steers sideways, harder the nearer and more head-on the obstacle is. A fish already within 0.9 u of a surface is also pushed straight out. This runs in every state, and the predator uses it too.
- *Push-out (constraint).* After the step and the fish-fish contact pass, a fish whose body capsule overlaps an obstacle is moved back to the surface along the normal and loses only its inward speed (it keeps at least its minimum speed by sliding along the surface).
- *Cover.* If the straight line between a fish and the predator passes through an obstacle (85% of its radius), they cannot see each other: the fish does not flee and the predator does not target it. Within 4 u the fish still senses the predator.

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
npm run balance
npm run compare:obstacles
npm run build && npm run perf
npm run build && npm run record
```

- `npm test`: 47 Node tests covering:
  - Boids invariants and 10-minute runs, one with cruising only and one with the full feed/flee loop.
  - The grid neighbour search matches a brute-force search.
  - Determinism and overload behaviour of the fixed clock.
  - Body contact: no overlapping bodies with separation off (cruising and crowding on food), and two fish swimming head-on do not pass through each other.
  - Feeding, the pellet cap, fleeing, priority, hysteresis, recovery and the predator's hunt/rest cycle.
  - Obstacles: placement rules; no fish body ends a step inside an obstacle while cruising, feeding, fleeing or with separation off; avoidance needs far fewer push-outs than push-out alone; fast swims straight at a column or boulder; a sharp turn next to a column; no fish stays pinned against a rock; the predator never enters one; pellets avoid columns and rest on boulders; cover blocks sight both ways.
  - Session counters, and that the challenge (with its rocks) is winnable with good food placement but not with random placement.
  - Swim-animation properties.
- `npm run test:browser`: 7 Playwright tests on the real app:
  - Start menu, controls, pause/resume, restart, and the Space-after-click shortcut.
  - Explore: feeding, pellet cap, scenarios, hunting predator, recovery, display options and the session summary.
  - Challenge: the rock layout, HUD, a scripted player winning, best time, play again, and the time-out loss.
  - Obstacles: placing with the tool bar and keys, refused spots, fish staying outside, restart keeping rocks, remove, clear, restoring the layout and the avoidance switch.
  - Environment: default rocks, all four behaviours preserving the layout, off/on saving custom rocks, and isolation from the fixed challenge layout.
  - Population slider and stress test (pausing stops it).
  - Mobile layout of the menu and the lab.
- `compare:scenarios` writes `evidence/scenario-comparison-a4.json`; `compare:rules` writes `evidence/rule-comparison-a3.json`.
- `balance` plays the challenge (with its rocks) with four scripted strategies, every 4 s on five seeds and at irregular intervals on twenty, and writes `evidence/challenge-balance-a5.json`.
- `compare:obstacles` runs five situations around four obstacles with avoidance on and off and writes `evidence/obstacles-a5.json`.
- `perf` measures the production build on this machine's GPU at 1920×1080. It runs 5 minutes of the Obstacle course scenario, then the stress test in the same tank, then a crowding worst case, and writes `evidence/performance-a5.json`.
- `record` makes a captioned demo video of the lab.

`VALIDATION.md` summarises the results.

The `?test` query adds read-only hooks (`window.aquaswarmSnapshot()` and projection helpers) for the browser tests. The normal page does not expose them.

## Credits

The fish, rocks, coral and sea grass are generated in code, so there are no third-party art assets. Libraries: [Three.js](https://threejs.org/) and [Vite](https://vite.dev/). Development was assisted by AI coding tools: Codex for Assignment 2, and Claude Code from Assignment 3 on. The Assignment 3 report has the details.
