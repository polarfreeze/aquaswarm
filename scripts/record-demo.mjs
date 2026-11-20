// Records the backup demo video (about 3 minutes) from the production build in Chromium on this
// machine's GPU, following the final demo route. Text captions are overlaid on the page, so the
// video needs no voiceover. Output: evidence/assignment-6-demo.webm, plus .srt captions and a
// chapter list. Run `npm run build` first. Screen capture costs frames, so FPS in the video is
// lower than in evidence/performance-a6.json.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const NAME = 'assignment-6-demo', PORT = 4177, URL = `http://127.0.0.1:${PORT}/?test`, SIZE = { width: 1440, height: 900 };
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
  const snap = () => page.evaluate(() => window.aquaswarmSnapshot());
  const zoomTo = async (x, y, z, ticks) => {
    const q = await page.evaluate(([x, y, z]) => window.aquaswarmProjectPoint(x, y, z), [x, y, z]);
    await page.mouse.move(q.x, q.y);
    for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, -200); await wait(0.15); }
  };
  const centre = fish => { const n = fish.length; return fish.reduce((a, b) => ({ x: a.x + b.x / n, y: a.y + b.y / n, z: a.z + b.z / n }), { x: 0, y: 0, z: 0 }); };

  // 1. Title
  await card(`<h2>AquaSwarm</h2><p>Assignment 6 · Release candidate</p>
    <p>Dongquan Yang (dy303) · CS 549 AI for Visual Computing</p>
    <p style="opacity:.75">Real-time capture of the production build · Chromium · WebGL (Three.js)</p>`, 5);

  // 2. Cruise and swimming
  await caption('1 · Boids school, 100 fish',
    'Separation, alignment and cohesion, a fixed 60 Hz step and seed 549. Each fish is coloured by its state: amber cruising, green feeding, red fleeing.');
  await wait(7);
  let c = centre((await snap()).fish);
  await zoomTo(c.x, c.y, c.z, 7);
  await caption('2 · Procedural swimming',
    'A travelling wave in the vertex shader drives the tail. Its frequency follows each fish\'s speed, and the body bends into turns.');
  await wait(8);
  await page.locator('#perspective').click(); await blur();

  // 3. Rule comparison
  await tab('Rules');
  await caption('3 · Compare rules',
    'Presets restart the same seeded scenario with a selected rule configuration. <u>No alignment</u>: the fish lose their shared heading.');
  await page.getByRole('button', { name: 'No alignment' }).click(); await wait(9);
  await caption('3 · Compare rules', '<u>Default school</u> again: headings line up within a few seconds.');
  await page.getByRole('button', { name: 'Default school' }).click(); await wait(7);

  // 4. Feeding and the predator
  await caption('4 · Click to feed',
    'Food sinks from the surface. Fish within 13 u switch to <span style="color:#3f9e4f">Feed</span>; up to three pellets at once.');
  let p = await surface(-9, 3); await page.mouse.click(p.x, p.y); await wait(4);
  p = await surface(8, -4); await page.mouse.click(p.x, p.y); await wait(7);
  await caption('5 · The predator',
    'It hunts the nearest visible fish, then rests. Fish within 8 u <span style="color:#d6404e">Flee</span> faster, with a faster tail beat, and escape always wins over food.');
  await page.locator('#predator').click(); await wait(13);

  // 5. Obstacles
  await tab('Scenarios');
  await page.getByRole('button', { name: 'Restore default layout' }).click();
  await page.getByRole('button', { name: /^Feed \+ predator/ }).click();
  await caption('6 · Obstacles',
    'Boulders and coral columns. Fish look ahead and steer around them while cruising, feeding and fleeing; a push-out step keeps bodies from ever entering a rock.');
  await wait(10);
  await caption('6 · Obstacles', 'Rocks also block sight: a fish behind one does not see the predator, and the predator cannot target it.');
  await wait(7);

  // 6. Observation tools
  await page.keyboard.press('KeyI');
  let s = await snap();
  const fish = s.fish.filter(f => f.state !== 2).reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
  p = await page.evaluate(id => window.aquaswarmProject(id), fish.id);
  await page.mouse.click(p.x, p.y);
  await tab('Display');
  await page.locator('#ranges').check({ force: true }); await blur();
  await caption('7 · Inspect a fish',
    'The selected fish shows its perception sphere (7 u), personal space and velocity arrow, with a state tag. The panel lists what it senses. Rings: food attraction and the predator\'s flee range.');
  await wait(11);
  await page.keyboard.press('KeyV');
  await caption('7 · Follow camera', 'V follows the fish. Rocks between the camera and the fish turn see-through.');
  await wait(12);
  await page.keyboard.press('Escape');
  await page.locator('#ranges').uncheck({ force: true }); await blur();
  await caption('8 · Restart', 'R restarts the scenario from the seed and clears the selection.');
  await page.keyboard.press('KeyR'); await wait(4);

  // 7. Challenge
  await page.locator('#menu').click();
  await page.getByRole('button', { name: /Feeding challenge/ }).click();
  await caption('9 · Feeding challenge',
    'Eleven meals in 90 s while the predator hunts. Here I drop food behind the rock nearest the school, away from the predator.');
  const until = Date.now() + 26000;
  let last = 0;
  while (Date.now() < until) {
    if (Date.now() - last > 4000) {
      last = Date.now();
      s = await snap();
      if (s.game.phase !== 'active') break;
      c = centre(s.fish);
      const o = s.obstacles.reduce((a, b) => (Math.hypot(a.x - c.x, a.z - c.z) < Math.hypot(b.x - c.x, b.z - c.z) ? a : b));
      const d = Math.hypot(o.x - s.predator.x, o.z - s.predator.z) || 1;
      p = await surface(o.x + (o.x - s.predator.x) / d * (o.r + 2.5), o.z + (o.z - s.predator.z) / d * (o.r + 2.5));
      await page.mouse.click(p.x, p.y);
    }
    await wait(0.25);
  }

  // 8. End
  await page.evaluate(() => { document.querySelector('#demo-caption').style.opacity = 0; });
  await card(`<h2>Release candidate</h2><p>Boids · cruise / feed / flee · procedural swimming · obstacles · feeding challenge · fish inspector</p>
    <p>Feature freeze from here: fixes, measurements and the final report only</p>`, 6);
  cues.at(-1).end = now();
  const duration = now();
  await page.close();
  const video = await page.video().path();
  await context.close();
  await rm(`evidence/${NAME}.webm`, { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(video, `evidence/${NAME}.webm`);

  const stamp = s => { const ms = Math.round(s * 1000); const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0'); const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`; };
  const plain = s => s.replace(/<[^>]+>/g, '');
  await writeFile(`evidence/${NAME}.srt`, cues.map((cue, i) =>
    `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${plain(cue.title)}${cue.text ? `\n${plain(cue.text)}` : ''}\n`).join('\n'));
  const chapters = cues.filter((cue, i) => i === 0 || cue.title !== cues[i - 1].title)
    .map(cue => `${String(Math.floor(cue.start / 60))}:${String(Math.floor(cue.start % 60)).padStart(2, '0')} ${plain(cue.title).slice(0, 60)}`);
  await writeFile(`evidence/${NAME}-chapters.txt`, chapters.join('\n') + '\n');
  console.log(`duration ${duration.toFixed(1)} s, errors: ${errors.length ? errors.join('; ') : 'none'}`);
  console.log(chapters.join('\n'));
} finally { if (browser) await browser.close(); server.kill(); }
