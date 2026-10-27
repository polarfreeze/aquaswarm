# Validation

## Assignment 4 alpha (v0.4.0)

Date: 2026-10-26. Same machine as below (Windows 11, Intel Core Ultra 5 125H, Intel Arc graphics, Node 22.19.0).

### Game loop

| A4 requirement | Evidence |
| --- | --- |
| Start state | Start menu with two modes; the school swims live behind it and the lab is locked until a mode starts (browser tests 1, 5) |
| Active state | Explore lab and feeding challenge with HUD (browser tests 2, 3) |
| End state | Challenge win, time-out and give-up screens; explore session summary; Play again / Keep exploring / Main menu (browser tests 2, 3) |
| UI | HUD timer, meal counter and progress bar; best time; shortcuts Space/R/C/P/Esc only during a session |
| Both pillars | Boids state machine drives the challenge; tail beat follows speed in both modes |
| Stability | Unit and browser tests below; 5-minute run with zero page errors |

Screenshots: `evidence/a4-menu.png`, `evidence/a4-challenge.png`, `evidence/a4-win.png`.

### Automated results

- `npm test`: 36/36 pass. New: session counters for flee/feed switches, and a challenge test where good food placement wins and random placement loses. The pellet-cap test now checks three pellets.
- `npm run test:browser`: 5/5 pass in Chromium. Covered:
  - Menu, pause, restart, and the Space-after-click regression.
  - Explore: feeding, pellet cap, scenarios, hunting predator, recovery, session summary, Keep exploring, Esc, Main menu.
  - Challenge: HUD, a scripted player wins, best time saved, Play again, time-out loss.
  - Stress test, and pausing stops it (regression).
  - 390 × 844 mobile menu and lab.
- `npm run build`: passes.

### Challenge balance (`evidence/challenge-balance-a4.json`)

Scripted players drop one pellet every 4 s over 5 seeds. Target: 10 meals in 90 s with the hunting predator.

| Strategy | Wins | Result |
| --- | ---: | --- |
| Near the school, away from the predator | 5/5 | 52.0–81.7 s |
| Random spot | 0/5 | 6.3–9.1 meals |
| No food | 0/5 | 0 meals |

These are bots, not people; playtesting is planned for Week 9.

### Scenario comparison (`evidence/scenario-comparison-a4.json`, seed 549, 60 s, predator removed at 40 s)

Three pellets at (-10, 4), (4, -6), (13, 7); hunting predator (6 s hunt at 4.3 u/s, 5 s rest).

| Scenario | Mean cruise / feed / flee | Peak feed | Peak flee | All food gone | Feed→flee switches | Shortest flee |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Food only | 78.8 / 21.2 / 0 | 100 | 0 | 13.35 s | 0 | — |
| Predator only | 97.64 / 0 / 2.36 | 0 | 16 | — | 0 | 1.02 s |
| Food + predator | 69.97 / 22.18 / 7.85 | 91 | 42 | 20.47 s | 87 | 1.02 s |

Fish recover from flee 0.02 s after the predator is removed, and no flee episode is shorter than the 1 s hold.

### Performance (`evidence/performance-a4.json`)

Production build, Chromium 145 headless with the Intel Arc GPU, 1920 × 1080.

- **5 minutes, 100 fish, hunting predator, food every 20 s:** 17,996 frames, 60.0 FPS mean, p95 16.8 ms, worst 33.4 ms, simulation at real time (1.000×).
- **Stress test:**

| Fish | FPS | Sim ms / step | Real-time |
| ---: | ---: | ---: | ---: |
| 100 | 60.0 | 0.29 | 100% |
| 250 | 60.0 | 0.85 | 100% |
| 500 | 60.0 | 2.35 | 100% |
| 1000 | 57.7 | 8.54 | 100% |
| 1500 | 45.5 | 16.06 | 77% |
| 2000 | 25.5 | 31.33 | 43% |

- **2000 fish crowding one pellet:** 28.3 FPS at 0.48× real time.
- Per-step costs are about twice the A3 run below. The A3 notes already saw this range on this laptop when warm, so the large-population numbers are a range. The 100-fish target is unaffected.

---

## Assignment 3 MVP (v0.3.0)

Date: 2026-10-12. Machine: Windows 11 (10.0.26200), Intel Core Ultra 5 125H with Intel Arc graphics, Node 22.19.0. The checks below follow the MVP proof defined in Assignment 2. The Assignment 2 record (2D/3D Boids prototype) is in git history at commit `d8f03bb`.

### MVP scope

| A2 MVP requirement | Evidence |
| --- | --- |
| One tank, 100 fish of one type | Default scene; `tests/simulation.test.js` |
| Cruise, feed, flee, recover; escape priority | `tests/behaviour.test.js` (10 tests); `evidence/scenario-comparison-a3.json`; demo video sections 3–6 |
| One food point | Click to drop food that sinks, is eaten gradually and expires after 45 s. A new click moves the food point (tested) |
| One stationary predator | Fixed at the tank centre; it never moves and never removes fish (tested) |
| Tail motion follows speed; smooth turning | `tests/animation.test.js` (frequency and amplitude rise with speed, gradual turns, bend into turns, phase offsets, pause freezes the pose); demo video section 2 with animation off/on |
| Controls and behaviour counts | Browser tests; live cruise/feed/flee counts |
| Pause / reset | Unit and browser tests: positions and tail phases are identical while paused; reset restores seed, rules, population, food, predator and camera |
| 10-minute simulation checks | Two 600 s runs: default cruise, and the full loop with food every 20 s and the predator throughout. All values stay finite, fish stay in bounds, and speeds stay within limits |
| ≥ 30 FPS average, 1920×1080, 100 fish | See Performance below |

### Automated results

- `npm test`: 34/34 pass.
  - Simulation (17):
    - Invariants, the two 10-minute runs, and all rule combinations at extreme weights.
    - Reset and determinism.
    - Grid neighbour search equals brute force; traversal order does not change the result.
    - Zero-distance neighbours.
    - Fixed clock: per-frame step cap and 12 ms budget.
    - 2000 fish with food and predator.
  - Behaviour (10) and animation (7).
- `npm run test:browser`: 4/4 pass in Chromium. Covered:
  - Rule sliders and switches by keyboard, pause/resume, reset, camera views, shortcuts.
  - Click-to-feed versus drag-to-orbit; a second click moves the single food point.
  - Food next to the predator shows both feed and flee, then recovery after removing the predator.
  - Display toggles (swim animation, colour by state), population slider, stress test.
  - 390 × 844 mobile layout.
  - Zero page errors.
- `npm run build`: passes. The single JS bundle is about 600 kB (154 kB gzip), mostly Three.js.

### Scenario comparison (seed 549, 60 s, predator removed at 40 s)

| Scenario | Mean cruise / feed / flee | Peak feed | Peak flee | All food gone | Feed→flee switches | Shortest flee | Max speed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Food only | 83.38 / 16.62 / 0 | 81 | 0 | 13.37 s | 0 | — | 4.32 |
| Predator only | 98.89 / 0 / 1.11 | 0 | 16 | — | 0 | 1.07 s | 5.55 |
| Food + predator | 69.15 / 22.07 / 8.78 | 68 | 25 | 27.63 s | 298 | 1.07 s | 5.58 |

Food is dropped at (5, 3), close to the stationary predator at the tank centre.

- Escape has priority: feeding fish switched straight to flee 298 times.
- No flee episode was shorter than the 1 s hold.
- Every fish was out of flee 0.02 s after the predator was removed. The shortest-flee check confirms they had already served their hold.
- Food takes about twice as long to finish when the predator is present (27.6 s versus 13.4 s), because fish keep breaking off to flee.
- These results describe one seed and one layout; they are not a general proof.

### Rule comparison (`evidence/rule-comparison-a3.json`)

| Disabled rule | Mean nearest spacing | Local heading cosine | RMS school radius |
| --- | ---: | ---: | ---: |
| none | 1.648 | 0.960 | 13.31 |
| separation | 0.039 | 0.949 | 13.28 |
| alignment | 2.603 | 0.012 | 11.51 |
| cohesion | 1.772 | 0.910 | 12.76 |

Turning cohesion off did not increase the school radius, the same as in A2. Alignment and the tank walls are enough to keep the fish together at this tank size.

### Performance (`evidence/performance-a3.json`)

Measured on the production build in Chromium 145 (headless, real GPU: Intel Arc via ANGLE/D3D11) at 1920 × 1080. Headless frames are not vsync-capped, so 120 FPS is the browser's frame cap there. A visible tab is capped at the display refresh rate.

- **Steady state, 5 minutes, 100 fish, stationary predator and new food every 20 s:** 36,002 frames, 120.0 FPS mean, p95 frame time 8.4 ms, worst frame 16.8 ms. The simulation kept pace with real time (1.000×). This meets the ≥ 30 FPS target and the 60 FPS goal.
- **In-app stress test** (run right after the 5-minute test):

| Fish | FPS | Sim ms / step | Real-time |
| ---: | ---: | ---: | ---: |
| 100 | 120.0 | 0.19 | 100% |
| 250 | 120.0 | 0.42 | 100% |
| 500 | 120.0 | 1.20 | 100% |
| 1000 | 120.0 | 3.81 | 100% |
| 1500 | 120.0 | 7.75 | 100% |
| 2000 | 60.2 | 13.67 | 97% |

- **Worst case, 2000 fish crowding the one food point:** 34.2 FPS, and simulated time at 0.57× real time.
- **Run-to-run variation.** An earlier run of the same measurement on a warm laptop gave per-step costs about 1.7× higher: 23.5 ms at 2000 fish, with 34 FPS and 57% real time, and 26 FPS at 0.43× in the crowding case. CPU speed on this laptop changes with temperature and power state, so treat the numbers for more than 1000 fish as a range, not a constant.

### Known limits

- **Crowding.** Dense crowding degrades the neighbour search toward O(N²). The 12 ms frame budget keeps the view responsive by slowing simulated time instead of dropping frames. Planned fix: cap the number of neighbours per fish.
- **Collisions.** Fish are point agents, with no body collision. With separation off they overlap. There are no obstacles yet (planned for A5).
- **Measurement setup.** Measured in headless Chromium on the GPU, not in a visible Chrome tab on the presentation laptop. That check is planned for A4.
- **Video FPS.** FPS during the video recording is lower than in the measurement because screen capture costs frames.
