import { test, expect } from '@playwright/test';

const snapshot = page => page.evaluate(() => window.aquaswarmSnapshot());

test('render, live rule controls, pause, resume, deterministic reset and camera', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot?.().time)).toBeGreaterThan(0.3);
  const initial = await snapshot(page);
  expect(initial.fish).toHaveLength(100); expect(initial.rendering.calls).toBeGreaterThan(0);
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
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const reset = await snapshot(page);
  expect(reset.weights).toEqual({ separation: 2.4, alignment: 1.1, cohesion: 0.55 });
  expect(Object.values(reset.enabled).every(Boolean)).toBe(true); expect(reset.time).toBeLessThan(0.5);
  await expect(page.locator('#perspective')).toHaveAttribute('aria-pressed', 'true');
  // Blur controls before using shortcuts; shortcuts must not interfere with native input interaction.
  await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('Space');
  await expect(page.locator('#status')).toContainText('Paused');
  await page.keyboard.press('r'); await expect(page.locator('#status')).toContainText('Running');
  expect(errors).toEqual([]);
});

test('click to feed, one food point, predator priority, recovery and display options', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test');
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot?.().time)).toBeGreaterThan(0.3);
  // Clicking the water drops a pellet at the surface; fish nearby start feeding.
  const surface = (x, z) => page.evaluate(([x, z]) => window.aquaswarmProjectPoint(x, 18, z), [x, z]);
  let p = await surface(5, 3);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1);
  await expect(page.locator('#toast')).toContainText('Food dropped');
  await expect.poll(async () => (await snapshot(page)).summary.states.feed, { timeout: 10000 }).toBeGreaterThan(0);
  // One food point: a second click moves the food instead of adding more.
  p = await surface(-8, -4);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#toast')).toContainText('one food point');
  const moved = (await snapshot(page)).food;
  expect(moved).toHaveLength(1); expect(moved[0].x).toBeLessThan(0);
  // A drag orbits the camera and must not drop food.
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 240, { steps: 6 }); await page.mouse.up();
  expect((await snapshot(page)).food[0].id).toBe(moved[0].id);
  await page.getByRole('button', { name: 'Clear food' }).click();
  expect((await snapshot(page)).food).toEqual([]);

  // Food next to the stationary predator: both feeding and fleeing appear.
  await page.locator('#predator').click();
  await expect(page.locator('#predator')).toHaveAttribute('aria-pressed', 'true');
  const predator = (await snapshot(page)).predator;
  p = await surface(5, 3); await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await snapshot(page)).summary.states.flee, { timeout: 15000 }).toBeGreaterThan(0);
  const later = await snapshot(page);
  expect(later.predator).toEqual(predator);
  // Removing the predator lets every fish recover.
  await page.locator('#predator').click();
  await expect.poll(async () => (await snapshot(page)).summary.states.flee, { timeout: 5000 }).toBe(0);

  // Display options.
  await page.getByRole('tab', { name: 'Behaviour & display' }).click();
  await page.getByRole('checkbox', { name: 'Swim animation' }).uncheck();
  await page.getByRole('checkbox', { name: 'Colour by state' }).uncheck();
  await page.getByRole('checkbox', { name: 'Swim animation' }).check();
  expect(errors).toEqual([]);
});

test('population slider and stress test', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?test');
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot?.().time)).toBeGreaterThan(0.3);
  await page.getByRole('tab', { name: 'Stress test' }).click();
  await page.locator('#population-input').focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await snapshot(page)).fish.length).toBe(2000);
  await expect(page.locator('#population')).toContainText('2000');
  await page.keyboard.press('Home');
  await expect.poll(async () => (await snapshot(page)).fish.length).toBe(10);
  await page.getByRole('button', { name: /Run stress test/ }).click();
  await expect.poll(async () => (await snapshot(page)).stress.results.length, { timeout: 60000 }).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Stop stress test' }).click();
  const after = await snapshot(page);
  expect(after.stress.running).toBe(false);
  expect(after.fish).toHaveLength(10);
  for (const row of after.stress.results) expect(row.fps).toBeGreaterThan(0);
});

test('mobile layout fits viewport and all controls are reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?test');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#pause').scrollIntoViewIfNeeded(); await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume');
  await page.locator('#predator').click();
  expect((await snapshot(page)).predator).not.toBeNull();
});
