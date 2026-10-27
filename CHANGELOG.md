# Changelog

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
