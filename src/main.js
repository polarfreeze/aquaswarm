import './style.css';
import { Simulation, FixedClock, CONFIG, RULES, STATE_NAMES } from './simulation.js';
import { SwimAnimator } from './animation.js';
import { createScene, STATE_COLORS } from './scene.js';

const RULE_TEXT = {
  separation: ['Separation', 'Steer away from fish closer than 1.65 u. Higher values create more personal space.'],
  alignment: ['Alignment', 'Match the average heading of neighbours within 7 u. Higher values give coordinated travel.'],
  cohesion: ['Cohesion', 'Steer toward the local centre of neighbours. Higher values pull groups tighter.'],
};
const STATE_LABEL = ['Cruising', 'Feeding', 'Fleeing'];
const STRESS_LEVELS = [100, 250, 500, 1000, 1500, 2000];
const icon = {
  predator: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 11c3-4 9-5 14-2l2-3v8l-2-3c-5 3-11 2-14 0z"/><path d="M9 7.4 10.5 4l1.5 3.6"/></svg>',
  clear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>',
};
const toggle = (id, label, checked = false) =>
  `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} aria-label="${label}"><span aria-hidden="true"></span></label>`;

document.querySelector('#app').innerHTML = `
  <header class="masthead">
    <a class="brand" href="./" aria-label="AquaSwarm home"><span class="brand-mark" aria-hidden="true">≈</span>AquaSwarm<span class="brand-sub">COLLECTIVE BEHAVIOUR LAB</span></a>
    <nav class="masthead-meta" aria-label="Keyboard shortcuts"><kbd>Space</kbd> pause <kbd>R</kbd> reset <kbd>P</kbd> predator <kbd>C</kbd> clear food</nav>
  </header>
  <main>
    <section class="observation" aria-label="Aquarium observation">
      <div class="scene-heading">
        <div><span class="eyebrow">BOIDS · STATE MACHINE · PROCEDURAL SWIMMING</span><h1>Feed them. Frighten them.</h1><p id="tool-hint">Click the water to drop food. Drag to orbit, scroll to zoom.</p></div>
        <div class="pills"><span class="live-state" id="status" role="status">Running</span><span class="pill" id="fps" title="Rendered frames per second">— FPS</span></div>
      </div>
      <div id="aquarium"><div id="loading" role="status">Preparing the aquarium…</div></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div class="scene-bar">
        <div class="toolbar" role="group" aria-label="Interaction">
          <button id="predator" class="tool danger" aria-pressed="false">${icon.predator}<span>Add predator</span></button>
          <button id="clear-food" class="tool" title="Remove the food">${icon.clear}Clear food</button>
        </div>
        <div class="view-tools" role="group" aria-label="Camera view"><button id="perspective" class="selected" aria-pressed="true">Perspective</button><button id="top" aria-pressed="false">Top view</button><button id="expand" aria-pressed="false">Expand</button></div>
      </div>
      <div class="readouts" aria-label="Live simulation measurements">
        <div><span>POPULATION</span><strong id="population">100 <small>fish</small></strong></div>
        <div><span>MEAN SPEED</span><strong id="speed">0.00 <small>u/s</small></strong></div>
        <div title="Magnitude of the average unit heading; 100% means all fish face the same way."><span>HEADING AGREEMENT</span><strong id="agreement">0 <small>%</small></strong></div>
        <div class="behaviour"><span>BEHAVIOUR</span>
          <div class="state-bar" aria-hidden="true">${STATE_NAMES.map(name => `<i id="bar-${name}"></i>`).join('')}</div>
          <div class="state-legend">${STATE_NAMES.map((name, i) => `<span><b style="--c:${STATE_COLORS[i]}"></b>${STATE_LABEL[i]} <em id="count-${name}">0</em></span>`).join('')}</div>
        </div>
      </div>
    </section>
    <aside class="controls" aria-label="Simulation controls">
      <div class="tabs" role="tablist" aria-label="Control panels">
        ${[['rules', 'Rules'], ['view', 'Behaviour & display'], ['perf', 'Stress test']].map(([id, label], i) =>
          `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}
      </div>
      <div class="panels">
        <section class="panel" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
          <h2>Boids rules</h2>
          <p class="lede">Change one rule and watch what follows. Walls stay active with every rule off.</p>
          ${RULES.map((rule, index) => `<section class="rule card" data-rule="${rule}">
            <div class="rule-heading"><span class="rule-number">0${index + 1}</span><h3>${RULE_TEXT[rule][0]}</h3>${toggle(`${rule}-enabled`, `Enable ${rule}`, true)}</div>
            <div class="slider-heading"><label for="${rule}-weight">Weight</label><output for="${rule}-weight" id="${rule}-value"></output></div>
            <input type="range" id="${rule}-weight" min="0" max="3" step="0.05" aria-describedby="${rule}-description">
            <p class="rule-detail" id="${rule}-description">${RULE_TEXT[rule][1]}</p>
          </section>`).join('')}
        </section>
        <section class="panel" id="panel-view" role="tabpanel" aria-labelledby="tab-view" hidden>
          <h2>Behaviour &amp; animation</h2>
          <p class="lede">Swimming is a travelling wave in the vertex shader; its frequency and amplitude follow each fish's speed.</p>
          <div class="card options">
            <div class="option"><div><strong>Swim animation</strong><span>Tail beat and turning bend. Off shows the rigid model.</span></div>${toggle('swim', 'Swim animation', true)}</div>
            <div class="option"><div><strong>Colour by state</strong><span>Green feeding, red fleeing.</span></div>${toggle('color-state', 'Colour by state', true)}</div>
          </div>
          <div class="card">
            <h3>Behaviour states</h3>
            <ol class="states">
              <li><b style="--c:${STATE_COLORS[2]}"></b><div><strong>Flee</strong><span>Predator (fixed at the tank centre) within ${CONFIG.fleeEnter} u. Stays until it is beyond ${CONFIG.fleeExit} u and at least ${CONFIG.fleeHold} s have passed. Top speed ${CONFIG.fleeSpeed} u/s.</span></div></li>
              <li><b style="--c:${STATE_COLORS[1]}"></b><div><strong>Feed</strong><span>Food within ${CONFIG.feedEnter} u; gives up beyond ${CONFIG.feedExit} u or when the food is eaten or expires.</span></div></li>
              <li><b style="--c:${STATE_COLORS[0]}"></b><div><strong>Cruise</strong><span>Boids rules only, top speed ${CONFIG.maxSpeed} u/s.</span></div></li>
            </ol>
            <p class="note">Priority runs top to bottom: escape always wins over food.</p>
          </div>
        </section>
        <section class="panel" id="panel-perf" role="tabpanel" aria-labelledby="tab-perf" hidden>
          <h2>Population &amp; stress test</h2>
          <p class="lede">Neighbour search uses a uniform grid with ${CONFIG.perception}-unit cells. Each frame spends at most 12 ms on simulation steps, so an overloaded simulation slows down while the view stays responsive.</p>
          <div class="card">
            <div class="slider-heading"><label for="population-input">Fish</label><output id="population-value"></output></div>
            <input type="range" id="population-input" min="${CONFIG.minCount}" max="${CONFIG.maxCount}" step="10">
            <div class="range-labels"><span>${CONFIG.minCount}</span><span>${CONFIG.maxCount}</span></div>
          </div>
          <button id="stress" class="secondary wide">Run stress test (${STRESS_LEVELS[0]}–${STRESS_LEVELS.at(-1)} fish)</button>
          <table class="stress-table" aria-label="Stress test results"><thead><tr><th>Fish</th><th>FPS</th><th>Sim ms / step</th><th>Real-time</th></tr></thead><tbody id="stress-results"><tr><td colspan="4">No run yet.</td></tr></tbody></table>
          <p class="note" id="stress-summary">Each level runs for about 3 seconds. FPS depends on this device and browser.</p>
        </section>
      </div>
      <div class="transport"><button id="pause" class="primary">Pause</button><button id="reset" class="secondary">Reset</button></div>
    </aside>
  </main>
  <footer><span>Local rules → collective behaviour</span><span>Seed ${CONFIG.seed} <span class="footer-divider">/</span> <span id="sim-time">00:00</span> simulated</span></footer>
`;

const $ = selector => document.querySelector(selector);
const simulation = new Simulation();
const clock = new FixedClock();
const animator = new SwimAnimator(CONFIG.maxCount);
const predatorAnimator = new SwimAnimator(1, { frequencyScale: 0.55, amplitudeScale: 0.85 });
let scene;
try {
  scene = createScene($('#aquarium'));
  $('#loading').remove();
} catch (error) {
  $('#loading').textContent = 'The 3D view could not start. Please use a browser with WebGL 2 and hardware acceleration enabled, then reload.';
  console.error(error);
  document.querySelectorAll('button, input').forEach(input => input.disabled = true);
  $('#status').textContent = 'Unavailable';
  throw error;
}

const ui = { swim: true, colorByState: true, stress: null, stressResults: [] };
scene.setColorMode('state');

let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 1800);
}

function syncControls() {
  for (const rule of RULES) {
    const value = simulation.weights[rule];
    $(`#${rule}-weight`).value = value;
    $(`#${rule}-weight`).disabled = !simulation.enabled[rule];
    $(`#${rule}-value`).value = value.toFixed(2);
    $(`#${rule}-enabled`).checked = simulation.enabled[rule];
    $(`[data-rule="${rule}"]`).classList.toggle('disabled-rule', !simulation.enabled[rule]);
  }
  $('#pause').textContent = simulation.paused ? 'Resume' : 'Pause';
  $('#status').classList.toggle('paused', simulation.paused);
  const predator = Boolean(simulation.predator);
  $('#predator').classList.toggle('selected', predator);
  $('#predator').setAttribute('aria-pressed', String(predator));
  $('#predator span').textContent = predator ? 'Remove predator' : 'Add predator';
  $('#population-input').value = simulation.fish.length;
  $('#population-value').value = simulation.fish.length;
  $('#population-input').disabled = Boolean(ui.stress);
  $('#stress').textContent = ui.stress ? 'Stop stress test' : `Run stress test (${STRESS_LEVELS[0]}–${STRESS_LEVELS.at(-1)} fish)`;
}

function pause() { simulation.paused = !simulation.paused; clock.clear(); syncControls(); updateReadouts(); }
function setView(view) {
  scene.resetCamera(view);
  for (const name of ['perspective', 'top']) {
    $(`#${name}`).classList.toggle('selected', name === view);
    $(`#${name}`).setAttribute('aria-pressed', String(name === view));
  }
}
function restart() {
  stopStress();
  simulation.reset(); clock.clear(); animator.reset(); predatorAnimator.reset();
}
function reset() { restart(); setView('perspective'); syncControls(); updateReadouts(); }
function setPredator(on) {
  simulation.setPredator(on); predatorAnimator.reset();
  syncControls();
  toast(on ? 'Predator added: fish that come close flee' : 'Predator removed: fish recover');
}
function dropFood(x, z, y) {
  const replaced = simulation.food.length >= CONFIG.maxFood;
  const pellet = simulation.addFood(x, z, y);
  if (!pellet) return;
  if (y === undefined) scene.ripple(pellet.x, pellet.z);
  toast(replaced ? 'Food moved: one food point at a time' : 'Food dropped: it sinks slowly');
}

for (const rule of RULES) {
  $(`#${rule}-weight`).addEventListener('input', event => { simulation.setWeight(rule, Number(event.target.value)); syncControls(); });
  $(`#${rule}-enabled`).addEventListener('change', event => { simulation.setEnabled(rule, event.target.checked); syncControls(); });
}
$('#pause').addEventListener('click', pause);
$('#reset').addEventListener('click', reset);
$('#perspective').addEventListener('click', () => setView('perspective'));
$('#top').addEventListener('click', () => setView('top'));
$('#expand').addEventListener('click', () => {
  const expanded = document.querySelector('main').classList.toggle('expanded');
  $('#expand').textContent = expanded ? 'Show controls' : 'Expand';
  $('#expand').setAttribute('aria-pressed', String(expanded));
});
$('#predator').addEventListener('click', () => setPredator(!simulation.predator));
$('#clear-food').addEventListener('click', () => { simulation.clearFood(); toast('Food cleared'); });
$('#swim').addEventListener('change', event => { ui.swim = event.target.checked; scene.setSwimEnabled(ui.swim); });
$('#color-state').addEventListener('change', event => { ui.colorByState = event.target.checked; scene.setColorMode(ui.colorByState ? 'state' : 'species'); });
$('#population-input').addEventListener('input', event => { simulation.setCount(Number(event.target.value)); syncControls(); updateReadouts(); });
$('#stress').addEventListener('click', () => (ui.stress ? stopStress() : startStress()));

// Tabs with arrow-key navigation.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const other of tabs) {
    const active = other === tab;
    other.setAttribute('aria-selected', String(active));
    other.tabIndex = active ? 0 : -1;
    $(`#${other.getAttribute('aria-controls')}`).hidden = !active;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const offset = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!offset) return;
    const next = tabs[(i + offset + tabs.length) % tabs.length];
    selectTab(next); next.focus();
  });
});

// A click (not a drag) on the canvas drops food.
let down = null;
scene.domElement.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, t: performance.now() }; });
scene.domElement.addEventListener('pointerup', event => {
  if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6 || performance.now() - down.t > 500) { down = null; return; }
  down = null;
  const point = scene.surfacePoint(event.clientX, event.clientY);
  if (point) dropFood(point.x, point.z); else toast('Click inside the tank to drop food');
});

document.addEventListener('keydown', event => {
  if (event.target.closest('input, button, summary, a, textarea, select, [role="tab"]') || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    Space: pause, KeyR: reset, KeyP: () => setPredator(!simulation.predator),
    KeyC: () => { simulation.clearFood(); toast('Food cleared'); },
  };
  if (!actions[event.code]) return;
  event.preventDefault(); actions[event.code]();
});
document.addEventListener('visibilitychange', () => clock.clear());

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function updateReadouts() {
  const summary = simulation.summary();
  $('#population').innerHTML = `${summary.count} <small>fish</small>`;
  $('#speed').innerHTML = `${summary.speed.toFixed(2)} <small>u/s</small>`;
  $('#agreement').innerHTML = `${Math.round(summary.alignment * 100)} <small>%</small>`;
  for (const name of STATE_NAMES) {
    $(`#count-${name}`).textContent = summary.states[name];
    $(`#bar-${name}`).style.flexGrow = summary.states[name];
  }
  $('#sim-time').textContent = formatTime(simulation.time);
  $('#status').textContent = `${simulation.paused ? 'Paused' : 'Running'} · ${formatTime(simulation.time)}`;
}
// Stress test: step the population up, measuring rendered FPS and simulation cost at each level.
function startStress() {
  ui.stress = { level: 0, phaseStart: performance.now(), warm: true, frames: 0, stepMs: 0, steps: 0, simStart: 0, previous: simulation.fish.length };
  ui.stressResults = [];
  if (simulation.paused) pause();
  simulation.setCount(STRESS_LEVELS[0]);
  renderStress(); syncControls();
  toast('Stress test started');
}
function stopStress(finished = false) {
  if (!ui.stress) return;
  const previous = ui.stress.previous;
  ui.stress = null;
  simulation.setCount(previous);
  const ok = ui.stressResults.filter(r => r.fps >= 30).at(-1);
  $('#stress-summary').textContent = finished
    ? (ok ? `At least 30 FPS up to ${ok.count} fish on this device. Population restored to ${previous}.` : `Below 30 FPS at every level on this device.`)
    : 'Stress test stopped.';
  syncControls(); updateReadouts();
}
function renderStress() {
  $('#stress-results').innerHTML = ui.stressResults.length
    ? ui.stressResults.map(r => `<tr class="${r.fps < 30 ? 'slow' : ''}"><td>${r.count}</td><td>${r.fps.toFixed(0)}</td><td>${r.stepMs.toFixed(2)}</td><td>${Math.round(r.realtime * 100)}%</td></tr>`).join('')
    : '<tr><td colspan="4">Measuring…</td></tr>';
}
function stressFrame(now, stepMs, steps) {
  const s = ui.stress;
  if (!s) return;
  if (s.warm) {
    if (now - s.phaseStart > 800) Object.assign(s, { warm: false, phaseStart: now, frames: 0, stepMs: 0, steps: 0, simStart: simulation.time });
    return;
  }
  s.frames++; s.stepMs += stepMs; s.steps += steps;
  const elapsed = now - s.phaseStart;
  if (elapsed < 2200) return;
  const result = { count: simulation.fish.length, fps: s.frames * 1000 / elapsed,
    stepMs: s.steps ? s.stepMs / s.steps : 0, realtime: (simulation.time - s.simStart) / (elapsed / 1000) };
  ui.stressResults.push(result); renderStress();
  if (s.level + 1 >= STRESS_LEVELS.length || result.fps < 12) { stopStress(true); return; }
  s.level++;
  simulation.setCount(STRESS_LEVELS[s.level]);
  Object.assign(s, { warm: true, phaseStart: now });
  syncControls();
}

syncControls(); updateReadouts();
let frames = 0, lastMetrics = performance.now(), lastSimTime = 0, animationId;
function frame(now) {
  if (!document.hidden) {
    const start = performance.now();
    const steps = clock.advance(now, simulation);
    const stepMs = performance.now() - start;
    // Animation advances by simulated time only, so pause freezes the tail and resume continues it.
    const simDelta = Math.max(0, simulation.time - lastSimTime);
    if (simulation.time < lastSimTime) { animator.reset(); predatorAnimator.reset(); }
    lastSimTime = simulation.time;
    animator.update(simulation.fish, simDelta);
    if (simulation.predator) predatorAnimator.update([simulation.predator], simDelta);
    scene.render(simulation, animator, predatorAnimator);
    frames++;
    stressFrame(now, stepMs, steps);
    if (now - lastMetrics >= 500) {
      $('#fps').textContent = `${Math.round(frames * 1000 / (now - lastMetrics))} FPS`;
      updateReadouts(); frames = 0; lastMetrics = now;
    }
  } else { clock.clear(); frames = 0; lastMetrics = now; }
  animationId = requestAnimationFrame(frame);
}
animationId = requestAnimationFrame(frame);

// Read-only snapshots are available only with ?test, for end-to-end checks on the actual app.
if (new URLSearchParams(location.search).has('test')) {
  window.aquaswarmSnapshot = () => structuredClone({ fish: simulation.fish, time: simulation.time,
    paused: simulation.paused, weights: simulation.weights, enabled: simulation.enabled,
    food: simulation.food, predator: simulation.predator, summary: simulation.summary(),
    stress: { running: Boolean(ui.stress), results: ui.stressResults },
    swim: { phase: Array.from(animator.phase.slice(0, 8)), amplitude: Array.from(animator.amplitude.slice(0, 8)) },
    rendering: scene.getInfo(), config: CONFIG });
  // Projects a world point (or a fish) to page coordinates so scripted tests can click it.
  window.aquaswarmProjectPoint = (x, y, z) => {
    const point = scene.project(x, y, z);
    const rect = scene.domElement.getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  };
  window.aquaswarmProject = id => {
    const f = simulation.fish.find(fish => fish.id === id);
    return window.aquaswarmProjectPoint(f.x, f.y, f.z);
  };
}
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(animationId); scene.dispose(); });
