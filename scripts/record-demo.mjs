// Records the Assignment 3 demo video (about 2.5 minutes) from the production build in Chromium on
// this machine's GPU. Text captions are overlaid on the page, so the video needs no voiceover.
// Output: evidence/assignment-3-demo.webm, plus .srt captions and a chapter list for YouTube.
// Run `npm run build` first. Screen capture costs frames, so FPS in the video is lower than in
// evidence/performance-a3.json.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const PORT = 4177, URL = `http://127.0.0.1:${PORT}/?test`, SIZE = { width: 1440, height: 900 };
await mkdir('evidence', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'test-results/demo-video', size: SIZE } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.aquaswarmSnapshot?.().game.phase === 'menu');
  await page.getByRole('button', { name: /Explore the lab/ }).click();
  await page.waitForFunction(() => window.aquaswarmSnapshot?.().time > 0.5);
  await page.addStyleTag({ content: `
    #demo-caption { position: absolute; left: 24px; bottom: 132px; z-index: 20; max-width: 560px; pointer-events: none;
      padding: 12px 16px; background: rgba(250, 251, 247, .94); border-left: 4px solid #174c40; border-radius: 4px;
      box-shadow: 0 4px 18px rgba(20, 50, 45, .16); font: 14px/1.45 system-ui, sans-serif; color: #183e38; transition: opacity .3s; }
    #demo-caption b { display: block; font-size: 16px; margin-bottom: 3px; }
    #demo-card { position: fixed; inset: 0; z-index: 50; display: grid; place-content: center; text-align: center; gap: 10px;
      background: rgba(244, 246, 241, .97); color: #183e38; font: 18px/1.5 system-ui, sans-serif; transition: opacity .6s; }
    #demo-card h2 { font-size: 46px; margin: 0; letter-spacing: -.02em; } #demo-card p { margin: 0; }` });
  await page.evaluate(() => {
    const caption = document.createElement('div'); caption.id = 'demo-caption'; caption.style.opacity = 0;
    document.querySelector('.observation').append(caption);
    const card = document.createElement('div'); card.id = 'demo-card'; document.body.append(card);
  });

  const start = Date.now(), cues = [];
  const now = () => (Date.now() - start) / 1000;
  const wait = seconds => page.waitForTimeout(seconds * 1000);
  async function caption(title, text = '') {
    if (cues.length) cues.at(-1).end = now();
    cues.push({ start: now(), end: null, title, text });
    await page.evaluate(([title, text]) => {
      const el = document.querySelector('#demo-caption');
      el.innerHTML = `<b>${title}</b>${text}`; el.style.opacity = 1;
    }, [title, text]);
  }
  async function card(html, seconds) {
    if (cues.length) cues.at(-1).end = now();
    cues.push({ start: now(), end: null, title: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), text: '' });
    await page.evaluate(html => { const el = document.querySelector('#demo-card'); el.innerHTML = html; el.style.opacity = 1; el.style.display = 'grid'; }, html);
    await wait(seconds);
    await page.evaluate(() => { const el = document.querySelector('#demo-card'); el.style.opacity = 0; setTimeout(() => el.style.display = 'none', 600); });
  }
  const surface = (x, z) => page.evaluate(([x, z]) => window.aquaswarmProjectPoint(x, 18, z), [x, z]);
  const tab = name => page.getByRole('tab', { name }).click();
  const blur = () => page.evaluate(() => document.activeElement?.blur());

  // 1. Title
  await card(`<h2>AquaSwarm</h2><p>Assignment 3 · Minimum Viable Product</p>
    <p>Dongquan Yang (dy303) · CS 549 AI for Visual Computing</p>
    <p style="opacity:.75">Real-time capture of the production build · Chromium · WebGL (Three.js)</p>`, 6);

  // 2. Cruise: Boids
  await caption('1 · Boids school, 100 fish',
    'Separation, alignment and cohesion with Reynolds steering. Uniform-grid neighbour search, fixed 60 Hz simulation step, seed 549. The FPS counter is top right.');
  await wait(10);

  // 3. Close-up: procedural animation (scroll zooms toward the pointer)
  await caption('2 · Procedural swimming',
    'Low-poly fish built in code. A vertex-shader travelling wave drives the tail; beat frequency follows each fish\'s speed, and the body bends and banks into turns.');
  const school = await page.evaluate(() => {
    const f = window.aquaswarmSnapshot().fish, n = f.length;
    const c = f.reduce((a, b) => ({ x: a.x + b.x / n, y: a.y + b.y / n, z: a.z + b.z / n }), { x: 0, y: 0, z: 0 });
    return window.aquaswarmProjectPoint(c.x, c.y, c.z);
  });
  await page.mouse.move(school.x, school.y);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -200); await wait(0.15); }
  await wait(7);
  await tab('Display');
  await caption('2 · Procedural swimming', 'Swim animation <u>off</u>: rigid bodies that only rotate to face their velocity.');
  await page.locator('#swim').uncheck({ force: true }); await wait(4);
  await caption('2 · Procedural swimming', 'Swim animation <u>on</u> again: tail beat, body bend and banking.');
  await page.locator('#swim').check({ force: true }); await wait(4);
  await page.locator('#perspective').click(); await blur();

  // 4. Feeding: one food point
  await caption('3 · Click to feed',
    'A click drops food at the water surface; it sinks. Fish within 13 units switch to <span style="color:#3f9e4f">Feed</span> and seek it; the food is eaten gradually.');
  let p = await surface(-9, 3); await page.mouse.click(p.x, p.y);
  await wait(11);
  await caption('3 · More food', 'Up to three pellets at once; a fourth click replaces the oldest.');
  p = await surface(9, -5); await page.mouse.click(p.x, p.y);
  await wait(7);

  // 5. Predator
  await caption('4 · Add the predator',
    'The predator hunts the nearest fish for 6 s, then rests. Fish that come within 8 units <span style="color:#d6404e">Flee</span> and keep fleeing until 12 units away and at least 1 s has passed (hysteresis), so they do not flicker.');
  await page.locator('#predator').click(); await wait(12);

  // 6. Escape priority
  await caption('5 · Escape has priority over food',
    'Food dropped next to the predator. Feeding fish that get too close switch to Flee, then come back to the food once they are safe.');
  p = await surface(5, 3); await page.mouse.click(p.x, p.y);
  await wait(15);

  // 7. Recovery
  await caption('6 · Recovery', 'Predator removed: fleeing fish slow down gradually and return to feeding or cruising.');
  await page.locator('#predator').click(); await wait(8);

  // 8. Rules
  await page.locator('#reset').click();
  await tab('Rules');
  await caption('7 · Live rule controls', 'Alignment switched off: fish stop matching headings and the school loses a common direction.');
  await page.locator('#alignment-enabled').uncheck({ force: true }); await wait(8);
  await caption('7 · Live rule controls', 'Alignment back on, separation weight raised to 3: wider spacing between neighbours.');
  await page.locator('#alignment-enabled').check({ force: true });
  await page.locator('#separation-weight').fill('3'); await wait(7);
  await blur();
  await caption('7 · Pause and resume', 'Space pauses the simulation and the swim animation together; R resets to the seed.');
  await page.keyboard.press('Space'); await wait(2.5); await page.keyboard.press('Space'); await wait(2);
  await page.locator('#reset').click();

  // 9. Stress test
  await tab('Stress test');
  await caption('8 · Stress test: 100 → 2000 fish',
    'The built-in test measures FPS and simulation cost per level. The simulation keeps a 12 ms per-frame budget, so under overload simulated time slows before the frame rate collapses.');
  await page.locator('#stress').click();
  await page.waitForFunction(() => { const s = window.aquaswarmSnapshot().stress; return !s.running && s.results.length > 0; }, null, { timeout: 120000 });
  await wait(3);
  await caption('9 · Worst case: 2000 fish, one food point',
    'All 2000 fish crowd the food, so every grid cell is full and neighbour search approaches O(N²). FPS drops and the simulated clock (top right) falls behind real time: this is the current limit.');
  await page.locator('#population-input').fill('2000');
  await page.locator('#population-input').dispatchEvent('input');
  p = await surface(0, 0); await page.mouse.click(p.x, p.y);
  await wait(14);

  // 10. End
  await page.locator('#reset').click();
  await page.evaluate(() => { document.querySelector('#demo-caption').style.opacity = 0; });
  await card(`<h2>MVP complete</h2><p>One tank · 100 fish · one food point · one predator · cruise / feed / flee / recover · speed-driven tail motion</p>
    <p>Next (A4): a predator that hunts, more food and scenario presets</p>`, 6);
  cues.at(-1).end = now();
  const duration = now();
  await page.close();
  const video = await page.video().path();
  await context.close();
  await rm('evidence/assignment-3-demo.webm', { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(video, 'evidence/assignment-3-demo.webm');

  const stamp = s => { const ms = Math.round(s * 1000); const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0'); const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`; };
  const plain = s => s.replace(/<[^>]+>/g, '');
  await writeFile('evidence/assignment-3-demo.srt', cues.map((cue, i) =>
    `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${plain(cue.title)}${cue.text ? `\n${plain(cue.text)}` : ''}\n`).join('\n'));
  const chapters = cues.filter((cue, i) => i === 0 || cue.title !== cues[i - 1].title)
    .map(cue => `${String(Math.floor(cue.start / 60))}:${String(Math.floor(cue.start % 60)).padStart(2, '0')} ${plain(cue.title).slice(0, 60)}`);
  await writeFile('evidence/assignment-3-demo-chapters.txt', chapters.join('\n') + '\n');
  console.log(`duration ${duration.toFixed(1)} s, errors: ${errors.length ? errors.join('; ') : 'none'}`);
  console.log(chapters.join('\n'));
} finally { if (browser) await browser.close(); server.kill(); }
