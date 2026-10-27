// Measures the production build in Chromium on this machine's GPU (D3D11 via ANGLE when available):
// 5-minute steady state at 100 fish, the in-app stress test, and a 2000-fish crowding worst case.
// Writes evidence/performance-a4.json. Headless frames are not vsync-capped, so FPS can exceed 60.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const PORT = 4176, URL = `http://127.0.0.1:${PORT}/?test`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.aquaswarmSnapshot?.().game.phase === 'menu');
  await page.getByRole('button', { name: /Explore the lab/ }).click();
  await page.waitForFunction(() => window.aquaswarmSnapshot?.().time > 1);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const measure = seconds => page.evaluate(async ms => {
    const intervals = [], start = performance.now();
    const t0 = window.aquaswarmSnapshot().time;
    let previous = start;
    await new Promise(resolve => {
      const frame = now => { intervals.push(now - previous); previous = now; now - start < ms ? requestAnimationFrame(frame) : resolve(); };
      requestAnimationFrame(frame);
    });
    intervals.shift();
    const total = intervals.reduce((a, b) => a + b, 0), sorted = [...intervals].sort((a, b) => a - b);
    const s = window.aquaswarmSnapshot();
    return { seconds: total / 1000, frames: intervals.length, meanFps: 1000 * intervals.length / total,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], worstFrameMs: sorted.at(-1),
      simulatedPerRealSecond: (s.time - t0) / (total / 1000), fish: s.fish.length, states: s.summary.states };
  }, seconds * 1000);

  // Steady state: the Feed + predator scenario (three pellets, hunting predator) is the busiest
  // 100-fish case. Pellets last about 15 s, so a new one is dropped every 20 s during the measurement.
  const dropFood = async () => { const p = await page.evaluate(() => window.aquaswarmProjectPoint(5, 18, 3)); await page.mouse.click(p.x, p.y); };
  await page.getByRole('button', { name: /Feed \+ predator/ }).click();
  const feeder = setInterval(() => dropFood().catch(() => {}), 20000);
  const steady = await measure(300);
  clearInterval(feeder);
  console.log('steady', steady);

  // In-app stress test: 100 → 2000 fish, about 3 s per level.
  await page.getByRole('tab', { name: 'Stress test' }).click();
  await page.locator('#reset').click();
  await page.getByRole('button', { name: /Run stress test/ }).click();
  await page.waitForFunction(() => { const s = window.aquaswarmSnapshot().stress; return !s.running && s.results.length > 0; }, null, { timeout: 120000 });
  const stress = (await page.evaluate(() => window.aquaswarmSnapshot().stress.results));
  const summary = await page.locator('#stress-summary').textContent();
  console.table(stress);

  // Worst case: 2000 fish crowding a single pellet; the grid degenerates toward O(N²) locally.
  await page.locator('#population-input').evaluate(el => { el.value = 2000; el.dispatchEvent(new Event('input')); });
  const center = await page.evaluate(() => window.aquaswarmProjectPoint(0, 18, 0));
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(4000);
  const crowding = await measure(5);
  console.log('crowding', crowding);

  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/performance-a4.json', JSON.stringify({ date: new Date().toISOString(),
    browser: `Chromium ${browser.version()} (headless, GPU via ANGLE)`, renderer, os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0].model, viewport: '1920 × 1080', build: 'vite production build (npm run build)',
    note: 'Headless rAF is not vsync-capped; a visible browser tab is limited to the display refresh rate. Simulation is fixed-step 60 Hz with at most 4 steps and a 12 ms step budget per frame; when overloaded, simulated time slows (see simulatedPerRealSecond).',
    steadyState100FishFoodAndPredator: steady, stressTest: stress, stressSummary: summary, crowding2000FishOnePellet: crowding, errors }, null, 2));
} finally { if (browser) await browser.close(); server.kill(); }
