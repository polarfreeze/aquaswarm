import { test, expect } from '@playwright/test';

const snapshot = page => page.evaluate(() => window.aquaswarmSnapshot());
const surface = (page, x, z) => page.evaluate(([x, z]) => window.aquaswarmProjectPoint(x, 18, z), [x, z]);
async function open(page, mode) {
  await page.goto('/?test');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot?.().game.phase)).toBe('menu');
  if (!mode) return;
  await page.getByRole('button', { name: mode === 'explore' ? /Explore the lab/ : /Feeding challenge/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(0.3);
}

test('start menu, live rule controls, pause, resume, restart and camera', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  // The menu runs the school live behind it and blocks clicks on the tank.
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(0.3);
  expect((await snapshot(page)).game).toMatchObject({ phase: 'menu', mode: null });
  await page.getByRole('button', { name: /Explore the lab/ }).click();
  const initial = await snapshot(page);
  expect(initial.game).toMatchObject({ phase: 'active', mode: 'explore' });
  expect(initial.fish).toHaveLength(100); expect(initial.rendering.calls).toBeGreaterThan(0);
  expect(initial.time).toBeLessThan(0.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await snapshot(page);
  await page.waitForTimeout(450);
  const still = await snapshot(page);
  expect(still.fish).toEqual(paused.fish);
  expect(still.swim.phase).toEqual(paused.swim.phase);
  await page.getByRole('tab', { name: 'Rules' }).click();
  for (const rule of ['separation', 'alignment', 'cohesion']) {
    await page.locator(`#${rule}-weight`).focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 50; step++) await page.keyboard.press('ArrowRight');
    await expect(page.locator(`#${rule}-value`)).toHaveText('2.50');
    await page.getByRole('checkbox', { name: `Enable ${rule}`, exact: true }).uncheck();
    await expect(page.locator(`#${rule}-weight`)).toBeDisabled();
    expect((await snapshot(page)).enabled[rule]).toBe(false);
  }
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(paused.time);
  await expect.poll(async () => (await snapshot(page)).swim.phase).not.toEqual(paused.swim.phase);
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await expect(page.locator('#top')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  const reset = await snapshot(page);
  expect(reset.weights).toEqual({ separation: 2.4, alignment: 1.1, cohesion: 0.55 });
  expect(Object.values(reset.enabled).every(Boolean)).toBe(true); expect(reset.time).toBeLessThan(0.5);
  await expect(page.locator('#perspective')).toHaveAttribute('aria-pressed', 'true');
  // Regression: after a mouse click on a button, Space must pause instead of clicking that button again.
  await page.locator('#predator').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#status')).toContainText('Paused');
  expect((await snapshot(page)).predator).not.toBeNull();
  await page.keyboard.press('r'); await expect(page.locator('#status')).toContainText('Running');
  expect((await snapshot(page)).predator).toBeNull();
  expect(errors).toEqual([]);
});

test('explore: feeding, pellet cap, scenarios, hunting predator, recovery and session summary', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, 'explore');
  // Clicking the water drops a pellet at the surface; fish nearby start feeding.
  let p = await surface(page, 5, 3);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1);
  await expect(page.locator('#toast')).toContainText('Food dropped');
  await expect.poll(async () => (await snapshot(page)).summary.states.feed, { timeout: 10000 }).toBeGreaterThan(0);
  // At most three pellets: the fourth replaces the oldest.
  for (const [x, z] of [[-8, -4], [10, -8], [-14, 8]]) { p = await surface(page, x, z); await page.mouse.click(p.x, p.y); }
  await expect(page.locator('#toast')).toContainText('oldest was replaced');
  const food = (await snapshot(page)).food;
  expect(food).toHaveLength(3); expect(food.map(f => f.id)).toEqual([1, 2, 3]);
  // A drag orbits the camera and must not drop food.
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 240, { steps: 6 }); await page.mouse.up();
  expect((await snapshot(page)).food.map(f => f.id)).toEqual([1, 2, 3]);
  await page.getByRole('button', { name: 'Clear food' }).click();
  expect((await snapshot(page)).food).toEqual([]);

  // Scenario presets restart from the seed and leave nothing behind when switching.
  await page.getByRole('button', { name: /Feed \+ predator/ }).click();
  let s = await snapshot(page);
  expect(s.food).toHaveLength(3); expect(s.predator).not.toBeNull(); expect(s.time).toBeLessThan(0.5);
  await expect.poll(async () => (await snapshot(page)).summary.states.flee, { timeout: 15000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await snapshot(page)).summary.states.feed, { timeout: 15000 }).toBeGreaterThan(0);
  // The predator hunts: it moves.
  const start = (await snapshot(page)).predator;
  await expect.poll(async () => {
    const now = (await snapshot(page)).predator;
    return Math.hypot(now.x - start.x, now.z - start.z);
  }).toBeGreaterThan(1);
  // Restart repeats the selected scenario.
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  s = await snapshot(page);
  expect(s.food).toHaveLength(3); expect(s.predator).not.toBeNull(); expect(s.time).toBeLessThan(0.5);
  await page.getByRole('button', { name: /^Cruise/ }).click();
  s = await snapshot(page);
  expect(s.food).toEqual([]); expect(s.predator).toBeNull();
  // Removing the predator lets every fish recover.
  await page.getByRole('button', { name: /^Predator/ }).click();
  await expect.poll(async () => (await snapshot(page)).summary.states.flee, { timeout: 15000 }).toBeGreaterThan(0);
  await page.locator('#predator').click();
  await expect.poll(async () => (await snapshot(page)).summary.states.flee, { timeout: 5000 }).toBe(0);

  // Display options.
  await page.getByRole('tab', { name: 'Display' }).click();
  await page.getByRole('checkbox', { name: 'Swim animation' }).uncheck();
  await page.getByRole('checkbox', { name: 'Colour by state' }).uncheck();
  await page.getByRole('checkbox', { name: 'Swim animation' }).check();

  // End state: Finish shows a summary; Keep exploring resumes; Esc finishes too.
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Session summary');
  const ended = await snapshot(page);
  expect(ended.game).toMatchObject({ phase: 'ended', result: 'summary' }); expect(ended.paused).toBe(true);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(ended.time);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toContainText('Session summary');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByRole('dialog')).toContainText('Feeding challenge');
  expect((await snapshot(page)).game.phase).toBe('menu');
  expect(errors).toEqual([]);
});

test('feeding challenge: HUD, win screen, best time, play again and time-out loss', async ({ page }) => {
  test.setTimeout(400000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, 'challenge');
  let s = await snapshot(page);
  expect(s.game).toMatchObject({ phase: 'active', mode: 'challenge' });
  expect(s.predator).not.toBeNull();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#tabs')).toBeHidden();
  await expect(page.locator('#predator')).toBeDisabled();
  // Play like a person: every 3 simulated seconds, drop food just in front of the school, away from the predator.
  let lastDrop = -3;
  while ((await snapshot(page)).game.phase === 'active') {
    s = await snapshot(page);
    if (s.time - lastDrop >= 3) {
      lastDrop = s.time;
      const n = s.fish.length, cx = s.fish.reduce((a, f) => a + f.x / n, 0), cz = s.fish.reduce((a, f) => a + f.z / n, 0);
      const d = Math.hypot(cx - s.predator.x, cz - s.predator.z) || 1;
      const p = await surface(page, cx + (cx - s.predator.x) / d * 4, cz + (cz - s.predator.z) / d * 4);
      await page.mouse.click(p.x, p.y);
    }
    await page.waitForTimeout(250);
  }
  s = await snapshot(page);
  expect(s.game.result).toBe('win');
  expect(s.game.meals).toBeGreaterThanOrEqual(10);
  expect(s.time).toBeLessThan(90);
  expect(s.game.best).toBeCloseTo(s.time, 5);
  await expect(page.getByRole('dialog')).toContainText('School fed!');
  // Play again starts a fresh attempt; without food the clock runs out.
  await page.getByRole('button', { name: 'Play again' }).click();
  s = await snapshot(page);
  expect(s.game).toMatchObject({ phase: 'active', mode: 'challenge' }); expect(s.time).toBeLessThan(0.5); expect(s.game.meals).toBe(0);
  await expect(page.locator('#ch-best')).not.toHaveText('—');
  await expect.poll(async () => (await snapshot(page)).game.phase, { timeout: 300000, intervals: [2000] }).toBe('ended');
  s = await snapshot(page);
  expect(s.game.result).toBe('timeout'); expect(s.time).toBeGreaterThanOrEqual(90);
  await expect(page.getByRole('dialog')).toContainText('Time\'s up');
  await expect(page.locator('#hud-time')).toHaveText('0:00');
  expect(errors).toEqual([]);
});

test('population slider and stress test', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'explore');
  await page.getByRole('tab', { name: 'Stress test' }).click();
  await page.locator('#population-input').focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await snapshot(page)).fish.length).toBe(2000);
  await expect(page.locator('#population')).toContainText('2000');
  await page.keyboard.press('Home');
  await expect.poll(async () => (await snapshot(page)).fish.length).toBe(10);
  await page.getByRole('button', { name: /Run stress test/ }).click();
  await expect.poll(async () => (await snapshot(page)).stress.results.length, { timeout: 60000 }).toBeGreaterThan(1);
  // Regression: pausing stops the test instead of recording paused frames as results.
  const recorded = (await snapshot(page)).stress.results.length;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const after = await snapshot(page);
  expect(after.stress.running).toBe(false);
  expect(after.stress.results).toHaveLength(recorded);
  expect(after.fish).toHaveLength(10);
  for (const row of after.stress.results) expect(row.fps).toBeGreaterThan(0);
});

test('mobile layout: menu and lab fit the viewport and controls are reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Explore the lab/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#pause').scrollIntoViewIfNeeded(); await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume');
  await page.locator('#predator').click();
  expect((await snapshot(page)).predator).not.toBeNull();
});
