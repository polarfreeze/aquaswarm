import { test, expect } from '@playwright/test';
test('render, live controls, pause, resume, deterministic reset and camera', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot?.().time)).toBeGreaterThan(0.3);
  const initial = await page.evaluate(() => window.aquaswarmSnapshot());
  expect(initial.fish).toHaveLength(100); expect(initial.rendering.calls).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause simulation' }).click();
  const paused = await page.evaluate(() => window.aquaswarmSnapshot());
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => window.aquaswarmSnapshot().fish)).toEqual(paused.fish);
  for (const rule of ['separation', 'alignment', 'cohesion']) {
    await page.locator(`#${rule}-weight`).focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 50; step++) await page.keyboard.press('ArrowRight');
    await expect(page.locator(`#${rule}-value`)).toHaveText('2.50');
    await page.getByRole('checkbox', { name: `Enable ${rule}`, exact: true }).uncheck();
    await expect(page.locator(`#${rule}-weight`)).toBeDisabled();
    expect((await page.evaluate(() => window.aquaswarmSnapshot())).enabled[rule]).toBe(false);
  }
  await page.getByRole('button', { name: 'Resume simulation' }).click();
  await expect.poll(() => page.evaluate(() => window.aquaswarmSnapshot().time)).toBeGreaterThan(paused.time);
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await expect(page.locator('#top')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset experiment' }).click();
  const reset = await page.evaluate(() => window.aquaswarmSnapshot());
  expect(reset.weights).toEqual({ separation:2.4, alignment:1.1, cohesion:0.55 });
  expect(Object.values(reset.enabled).every(Boolean)).toBe(true); expect(reset.time).toBeLessThan(0.5);
  await expect(page.locator('#perspective')).toHaveAttribute('aria-pressed', 'true');
  // Blur controls before using shortcuts; shortcuts must not interfere with native input interaction.
  await page.locator('canvas').click(); await page.keyboard.press('Space');
  await expect(page.locator('#status')).toHaveText('Paused');
  await page.keyboard.press('r'); await expect(page.locator('#status')).toHaveText('Running');
  expect(errors).toEqual([]);
});
test('mobile layout fits viewport and all controls are reachable', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 }); await page.goto('/?test');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#pause').scrollIntoViewIfNeeded(); await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume simulation');
  await page.screenshot({ path:'evidence/mobile.png', fullPage:true });
});
