import './style.css';
import { Simulation, FixedClock, CONFIG, RULES } from './simulation.js';
import { createScene } from './scene.js';

const descriptions = {
  separation: ['Separation', 'Make a little room.', 'Steer away from nearby fish. Higher values create more personal space.'],
  alignment: ['Alignment', 'Find a shared direction.', 'Match the heading of nearby fish. Higher values encourage coordinated travel.'],
  cohesion: ['Cohesion', 'Stay with the school.', 'Steer toward the local group center. Higher values pull neighbors closer together.'],
};
document.querySelector('#app').innerHTML = `
  <header class="masthead">
    <a class="brand" href="./" aria-label="AquaSwarm home"><span class="brand-mark" aria-hidden="true">≈</span>AquaSwarm<span class="brand-sub">COLLECTIVE MOTION LAB</span></a>
  </header>
  <main>
    <section class="observation" aria-label="Aquarium observation">
      <div class="scene-heading"><div><span class="eyebrow">THE BOIDS EXPERIMENT</span><h1>A world in motion.</h1><p>One hundred fish. Three local instincts.</p></div>
        <span class="live-state" id="status" role="status">Running</span></div>
      <div id="aquarium"><div id="loading" role="status">Preparing the aquarium…</div></div>
      <div class="view-tools" role="group" aria-label="Camera view"><button id="perspective" class="selected" aria-pressed="true">Perspective</button><button id="top" aria-pressed="false">Top view</button><button id="expand" aria-pressed="false">Expand aquarium</button></div>
      <p class="camera-hint">Drag to orbit <span>·</span> Scroll to zoom</p>
      <div class="readouts" aria-label="Live simulation measurements">
        <div><span>POPULATION</span><strong>100 <small>fish</small></strong></div>
        <div><span>MEAN SPEED</span><strong id="speed">0.00 <small>u/s</small></strong></div>
        <div title="Magnitude of the average unit heading; 100% means all fish face the same way."><span>HEADING AGREEMENT</span><strong id="agreement">0 <small>%</small></strong></div>
        <div><span>SIMULATION TIME</span><strong id="time">00:00</strong></div>
      </div>
    </section>
    <aside class="controls" aria-label="Simulation controls">
      <div class="panel-heading"><span class="eyebrow">BEHAVIOR CONTROLS</span><h2>Tune the school.</h2><p>Change one rule. Watch what follows.</p></div>
      <div class="rules">${RULES.map((rule, index) => `<section class="rule" data-rule="${rule}">
        <div class="rule-heading"><span class="rule-number">0${index + 1}</span><h3>${descriptions[rule][0]}</h3><label class="switch"><input type="checkbox" id="${rule}-enabled" checked aria-label="Enable ${rule}"><span aria-hidden="true"></span></label></div>
        <p>${descriptions[rule][1]}</p><div class="slider-heading"><label for="${rule}-weight">Influence</label><output for="${rule}-weight" id="${rule}-value"></output></div>
        <input type="range" id="${rule}-weight" min="0" max="3" step="0.05" aria-describedby="${rule}-description">
        <div class="range-labels"><span>0 · none</span><span>3 · strong</span></div><p class="rule-detail" id="${rule}-description">${descriptions[rule][2]}</p>
      </section>`).join('')}</div>
      <div class="transport"><button id="pause" class="primary">Pause simulation</button><button id="reset" class="secondary">Reset experiment</button></div>
      <p class="reset-note">Reset restores all rules, the camera and the same starting school.</p>
      <details><summary>How to observe</summary><p>Try disabling one rule for 10–15 seconds, then reset. Separation controls spacing; alignment controls headings; cohesion holds local groups together.</p><p>Tank boundaries remain active with every rule off. Fish swim freely in three dimensions inside a 48 × 34 × 18 tank. All six boundaries remain active.</p><p>Space: pause / resume. R: reset. Shortcuts are inactive while a control has focus.</p></details>
    </aside>
  </main>
  <footer><span>Local interactions → collective behavior</span><span>Seed 549 <span class="footer-divider">/</span> <span id="fps">Measuring FPS</span></span></footer>
`;

const simulation = new Simulation();
const clock = new FixedClock();
const $ = selector => document.querySelector(selector);
let scene;
try {
  scene = createScene($('#aquarium'), simulation);
  $('#loading').remove();
} catch (error) {
  $('#loading').textContent = 'The 3D view could not start. Please use a browser with WebGL 2 and hardware acceleration enabled, then reload.';
  console.error(error);
  document.querySelectorAll('button, input').forEach(input => input.disabled = true);
  $('#status').textContent = 'Unavailable';
  throw error;
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
  $('#pause').textContent = simulation.paused ? 'Resume simulation' : 'Pause simulation';
  $('#status').textContent = simulation.paused ? 'Paused' : 'Running';
  $('#status').classList.toggle('paused', simulation.paused);
}
function pause() { simulation.paused = !simulation.paused; clock.clear(); syncControls(); }
function setView(view) {
  scene.resetCamera(view);
  for (const name of ['perspective', 'top']) {
    $(`#${name}`).classList.toggle('selected', name === view);
    $(`#${name}`).setAttribute('aria-pressed', String(name === view));
  }
}
function reset() { simulation.reset(); clock.clear(); setView('perspective'); syncControls(); updateMetrics(); }
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
  $('#expand').textContent = expanded ? 'Show controls' : 'Expand aquarium';
  $('#expand').setAttribute('aria-pressed', String(expanded));
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, button, summary, a, textarea, select') || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); pause(); }
  if (event.code === 'KeyR') reset();
});
document.addEventListener('visibilitychange', () => clock.clear());

function updateMetrics() {
  const metrics = simulation.metrics();
  $('#speed').innerHTML = `${metrics.speed.toFixed(2)} <small>u/s</small>`;
  $('#agreement').innerHTML = `${Math.round(metrics.alignment * 100)} <small>%</small>`;
  const seconds = Math.floor(simulation.time);
  $('#time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
syncControls(); updateMetrics();
let frames = 0, lastMetrics = performance.now(), animationId;
function frame(now) {
  if (!document.hidden) {
    clock.advance(now, simulation);
    scene.render(); frames++;
    if (now - lastMetrics >= 500) {
      $('#fps').textContent = `${Math.round(frames * 1000 / (now - lastMetrics))} FPS`;
      updateMetrics(); frames = 0; lastMetrics = now;
    }
  } else { clock.clear(); frames = 0; lastMetrics = now; }
  animationId = requestAnimationFrame(frame);
}
animationId = requestAnimationFrame(frame);
// Read-only snapshots are available only with ?test, for end-to-end checks on the actual app.
if (new URLSearchParams(location.search).has('test')) {
  window.aquaswarmSnapshot = () => structuredClone({ fish: simulation.fish, time: simulation.time,
    paused: simulation.paused, weights: simulation.weights, enabled: simulation.enabled,
    metrics: simulation.metrics(), rendering: scene.getInfo(), config: CONFIG });
}
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(animationId); scene.dispose(); });
