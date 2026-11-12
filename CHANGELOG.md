# Changelog

## v0.5.0 · Assignment 5 obstacles (2026-11-10)

Live: https://polarfreeze.github.io/aquaswarm/ · previous releases: https://polarfreeze.github.io/aquaswarm/v0.4/ and https://polarfreeze.github.io/aquaswarm/v0.3/

### New features

- **Obstacles.** Boulders (spheres half-buried in the sand, radius 4 u) and coral columns (vertical cylinders through the whole water depth, radius 1.6 u). Up to six at once. Each keeps at least 3.2 u of open water to the glass and to every other obstacle, so no layout can close a passage.
- **Obstacle avoidance in every state.** Fish look 1.1 s ahead along their path and steer sideways around any obstacle in the way, while cruising, feeding and fleeing. The predator uses the same steering and never picks a patrol point inside a rock.
- **Push-out as a safety net.** If a fish body (the same capsule used for body contact) still ends a step inside an obstacle, it is moved back to the surface and loses only the speed pointing into it, so it slides along instead of stopping or bouncing. The predator gets the same treatment with a larger body.
- **Cover.** Rocks and coral block sight: a fish behind one does not see the predator, and the predator cannot target it. Closer than 4 u the fish still feels the predator through the rock.
- **Lab tools.** A click tool bar: Food (F), Boulder (B), Coral (O) and Remove (X). A green or red preview shows where an obstacle fits; blocked spots give a reason. **Clear rocks** removes all. Restart keeps the obstacles you placed.
- **Obstacle course scenario.** Two boulders, three coral columns, three pellets and the predator.
- **Obstacle avoidance switch** on the Rules tab, to compare steering with push-out only.
- **Challenge tank.** The feeding challenge now has two boulders and two coral columns. Food dropped behind a rock, away from the predator, is the safest meal. Target unchanged: 11 meals in 90 s.
- **Pellets and rocks.** Pellets sink onto the top of a boulder instead of into it, and a pellet dropped over a column lands just beside it.
- **New assets, all generated in code.** Low-poly boulders, lumpy coral columns in three colour schemes, and swaying sea grass along the glass (decoration only).
- **A4 build kept online** at `/v0.4/`.
- **Evidence.** `npm run compare:obstacles` writes `evidence/obstacles-a5.json`; the balance and performance runs now use the obstacle layouts (`evidence/challenge-balance-a5.json`, `evidence/performance-a5.json`).

### Known issues

- Avoidance is local steering, not path planning. It handles open layouts like the ones the placement rules allow, not mazes.
- The meshes are drawn slightly inside their colliders (rocks are rough, coral is lumpy), so fish turn a little before they visibly reach a rock.
- In a dense crowd on food, body contact between fish can move a fish up to about 0.4 u in one step. This also happens without obstacles (0.35 u).
- Cover is a straight sight line to the predator's centre; fish do not reason about where the predator will go.
- Large crowds are slower in a tank with rocks, because feeding crowds press against them: the stress test gives 49 FPS at 1000 fish (57 in A4) and 18 FPS at 2000. The neighbour cap is planned for A6.
- Challenge difficulty is still tuned with scripted players only.

## v0.4.0 · Assignment 4 alpha (2026-10-27)

Live: https://polarfreeze.github.io/aquaswarm/ · previous release: https://polarfreeze.github.io/aquaswarm/v0.3/

### New features

- **Game loop.** Start menu → active session → results screen. **Menu** returns to the start screen from anywhere; the lab is locked behind the overlay while it is open.
- **Feeding challenge.** Get the school to eat 11 meals in 90 s while the predator hunts. HUD with timer, meal count and progress bar. Ends in a win, time-out or give-up screen with meals eaten, food dropped, times fish fled, peak fleeing and the best time (kept in this browser).
- **Explore mode.** The A3 lab, now with **Finish** (Esc): a session summary with the same statistics, plus **Keep exploring**, **New session** and **Main menu**.
- **Hunting predator.** Hunts the nearest fish for 6 s at 4.3 u/s, then rests and patrols for 5 s. Fleeing fish reach about 6 u/s, so it chases but never catches. Replaces the stationary A3 predator.
- **Body contact between fish.** Each fish has a capsule body matching the model (radius 0.22 u). After every step, overlapping pairs are pushed apart along the line between their closest points and lose their closing speed, so fish no longer pass through each other, even with separation off. A **Body contact** switch on the Rules tab turns it off for comparison.
- **Several food points.** Up to three pellets; a fourth replaces the oldest.
- **Scenario presets.** Cruise, Feeding, Predator, Feed + predator, each from seed 549. **Restart** (R) repeats the current scenario or mode.
- **A3 build kept online** at `/v0.3/`, built from the `v0.3.0` tag by the Pages workflow.
- **Evidence.** `npm run balance` plays the challenge with scripted players; new scenario comparison and performance runs (`evidence/*-a4.json`).

### Bug fixes

- Keyboard shortcuts stopped working after clicking a button: Space re-pressed the focused button (for example toggling the predator instead of pausing). Buttons now drop focus after a mouse click; keyboard focus is unchanged. Regression test added.
- Pausing during the stress test recorded paused frames as results. Pause now stops the stress test. Regression test added.
- Fish overlapped and merged into one blob when separation was off, because they had no body. Fixed by body contact (above). With separation off over 60 s, sampled once per second, overlapping pairs dropped from 101,499 to 1 while cruising and from 215,687 to 18 in a crowd on food; the deepest overlap fell from 0.44 u to under 0.1 u. Two unit tests added, including two fish swimming head-on.

### Known issues

- 2000 fish run at about 21 FPS, and crowding one food point slows the simulation to 0.39× real time. Body contact adds about 15% per step. Neighbour cap planned for A6.
- Challenge difficulty is tuned with scripted players only (near-school strategy wins 5/5 seeds in 55–90 s; random placement 0/5). It needs playtesting with people. Body contact made feeding slightly easier, so the target went from 10 to 11 meals.
- The challenge timer runs on simulated time, so on a very slow device the 90 s last longer in real time.
- No obstacles yet (A5). Body contact covers fish against fish only; the predator has no body contact.
- Performance is measured headless on my development laptop, not yet in a visible tab on the presentation laptop.
- `scripts/record-demo.mjs` still ends with the A3 end card.

## v0.3.0 · Assignment 3 MVP (2026-10-12)

One tank, 100 fish, one food point and one stationary predator. Boids schooling, cruise/feed/flee/recover state machine with hysteresis, speed-driven tail animation, rule controls, pause/reset, stress test.
