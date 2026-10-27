import './style.css';
import { Simulation, FixedClock, CONFIG, CHALLENGE, RULES, STATE_NAMES } from './simulation.js';
import { SwimAnimator } from './animation.js';
import { createScene, STATE_COLORS } from './scene.js';

const RULE_TEXT = {
  separation: ['Separation', 'Steer away from fish closer than 1.65 u. Higher values create more personal space.'],
  alignment: ['Alignment', 'Match the average heading of neighbours within 7 u. Higher values give coordinated travel.'],
  cohesion: ['Cohesion', 'Steer toward the local centre of neighbours. Higher values pull groups tighter.'],
};
const SCENARIOS = {
  cruise: ['Cruise', 'Boids only. No food, no predator.'],
  feeding: ['Feeding', 'Three pellets at mid-depth.'],
  predator: ['Predator', 'One hunting predator.'],
  combined: ['Feed + predator', 'Food and danger together: escape wins.'],
};
const STATE_LABEL = ['Cruising', 'Feeding', 'Fleeing'];
const STRESS_LEVELS = [100, 250, 500, 1000, 1500, 2000];
const BEST_KEY = 'aquaswarm.challengeBest';
const icon = {
  predator: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 11c3-4 9-5 14-2l2-3v8l-2-3c-5 3-11 2-14 0z"/><path d="M9 7.4 10.5 4l1.5 3.6"/></svg>',
  clear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>',
};
const toggle = (id, label, checked = false) =>
  `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} aria-label="${label}"><span aria-hidden="true"></span></label>`;
const statesCard = `<div class="card">
    <h3>Behaviour states</h3>
    <ol class="states">
      <li><b style="--c:${STATE_COLORS[2]}"></b><div><strong>Flee</strong><span>Predator within ${CONFIG.fleeEnter} u. Stays until it is beyond ${CONFIG.fleeExit} u and at least ${CONFIG.fleeHold} s have passed. Top speed ${CONFIG.fleeSpeed} u/s.</span></div></li>
      <li><b style="--c:${STATE_COLORS[1]}"></b><div><strong>Feed</strong><span>Pellet within ${CONFIG.feedEnter} u; gives up beyond ${CONFIG.feedExit} u or when the pellet is eaten or expires.</span></div></li>
      <li><b style="--c:${STATE_COLORS[0]}"></b><div><strong>Cruise</strong><span>Boids rules only, top speed ${CONFIG.maxSpeed} u/s.</span></div></li>
    </ol>
    <p class="note">Priority runs top to bottom: escape always wins over food.</p>
  </div>`;

document.querySelector('#app').innerHTML = `
  <header class="masthead">
    <a class="brand" href="./" aria-label="AquaSwarm home"><span class="brand-mark" aria-hidden="true">≈</span>AquaSwarm<span class="brand-sub">COLLECTIVE BEHAVIOUR LAB</span></a>
    <div class="masthead-right">
      <nav class="masthead-meta" aria-label="Keyboard shortcuts"><kbd>Space</kbd> pause <kbd>R</kbd> restart <kbd>C</kbd> clear food <kbd>Esc</kbd> finish</nav>
      <button id="menu" class="menu-button" hidden>Menu</button>
    </div>
  </header>
  <main>
    <section class="observation" aria-label="Aquarium observation">
      <div class="scene-heading">
        <div><span class="eyebrow" id="eyebrow">BOIDS · STATE MACHINE · PROCEDURAL SWIMMING</span><h1 id="headline">Feed them. Frighten them.</h1><p id="tool-hint">Click the water to drop food. Drag to orbit, scroll to zoom.</p></div>
        <div class="pills"><span class="live-state" id="status" role="status">Running</span><span class="pill" id="fps" title="Rendered frames per second">— FPS</span></div>
      </div>
      <div class="hud" id="hud" hidden aria-label="Challenge progress">
        <div><span>TIME LEFT</span><strong id="hud-time">1:30</strong></div>
        <div class="hud-meals"><span>MEALS EATEN</span><strong id="hud-meals">0.0 <small>/ ${CHALLENGE.meals}</small></strong>
          <div class="meter" role="progressbar" aria-label="Meals eaten" aria-valuemin="0" aria-valuemax="${CHALLENGE.meals}" aria-valuenow="0" id="hud-meter"><i id="hud-fill"></i></div></div>
      </div>
      <div id="aquarium"><div id="loading" role="status">Preparing the aquarium…</div></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div class="scene-bar">
        <div class="toolbar" role="group" aria-label="Interaction">
          <button id="predator" class="tool danger" aria-pressed="false">${icon.predator}<span>Release predator</span></button>
          <button id="clear-food" class="tool" title="Remove all pellets">${icon.clear}Clear food</button>
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
      <div class="tabs" id="tabs" role="tablist" aria-label="Control panels">
        ${[['scenes', 'Scenarios'], ['rules', 'Rules'], ['view', 'Display'], ['perf', 'Stress test']].map(([id, label], i) =>
          `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}
      </div>
      <div class="panels">
        <section class="panel" id="panel-scenes" role="tabpanel" aria-labelledby="tab-scenes">
          <h2>Behaviour scenarios</h2>
          <p class="lede">Each scenario restarts from seed ${CONFIG.seed}, so outcomes are directly comparable.</p>
          <div class="scenarios">${Object.entries(SCENARIOS).map(([id, [name, text]]) =>
            `<button class="scenario" data-scenario="${id}"><strong>${name}</strong><span>${text}</span></button>`).join('')}</div>
          ${statesCard}
        </section>
        <section class="panel" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules" hidden>
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
          <h2>Animation &amp; display</h2>
          <p class="lede">Swimming is a travelling wave in the vertex shader; its frequency and amplitude follow each fish's speed.</p>
          <div class="card options">
            <div class="option"><div><strong>Swim animation</strong><span>Tail beat and turning bend. Off shows the rigid model.</span></div>${toggle('swim', 'Swim animation', true)}</div>
            <div class="option"><div><strong>Colour by state</strong><span>Green feeding, red fleeing.</span></div>${toggle('color-state', 'Colour by state', true)}</div>
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
        <section class="panel" id="panel-challenge" aria-label="Challenge" hidden>
          <h2>Feeding challenge</h2>
          <p class="lede">Get the school to eat ${CHALLENGE.meals} meals in ${CHALLENGE.seconds} seconds. A hunting predator patrols the tank, and fish that flee stop eating.</p>
          <div class="card">
            <h3>Tips</h3>
            <ul class="tips">
              <li>Drop food close to the school. Fish only notice food within ${CONFIG.feedEnter} u.</li>
              <li>Keep food away from the predator: fish within ${CONFIG.fleeEnter} u of it flee and stop eating.</li>
              <li>At most ${CONFIG.maxFood} pellets at once; a new one replaces the oldest, so spamming wastes food.</li>
              <li>The predator hunts for ${CONFIG.predatorHunt} s, then rests for ${CONFIG.predatorRest} s.</li>
            </ul>
          </div>
          <div class="card challenge-stats">
            <div><span>Food dropped</span><strong id="ch-drops">0</strong></div>
            <div><span>Times fish fled</span><strong id="ch-flees">0</strong></div>
            <div><span>Best time</span><strong id="ch-best">—</strong></div>
          </div>
          ${statesCard}
        </section>
      </div>
      <div class="transport"><button id="pause" class="primary">Pause</button><button id="reset" class="secondary">Restart</button><button id="finish" class="secondary">Finish</button></div>
    </aside>
  </main>
  <footer><span>Local rules → collective behaviour</span><span>Seed ${CONFIG.seed} <span class="footer-divider">/</span> <span id="sim-time">00:00</span> simulated</span></footer>
  <div class="screen" id="screen" role="dialog" aria-modal="true" aria-labelledby="screen-title"><div class="screen-card" id="screen-card"></div></div>
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
  $('#screen').hidden = true;
  throw error;
}

const ui = { swim: true, colorByState: true, stress: null, stressResults: [] };
scene.setColorMode('state');
// Game loop: 'menu' (start screen) → 'active' (explore or challenge) → 'ended' (results).
const game = { phase: 'menu', mode: null, scenario: null, result: null, session: null, best: loadBest() };

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || null; } catch { return null; } }
function saveBest(seconds) { try { localStorage.setItem(BEST_KEY, String(seconds)); } catch { /* storage unavailable */ } }

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
  const predator = Boolean(simulation.predator), challenge = game.mode === 'challenge';
  $('#predator').classList.toggle('selected', predator);
  $('#predator').setAttribute('aria-pressed', String(predator));
  $('#predator').disabled = challenge;
  $('#predator span').textContent = challenge ? 'Predator hunting' : predator ? 'Remove predator' : 'Release predator';
  $('#population-input').value = simulation.fish.length;
  $('#population-value').value = simulation.fish.length;
  $('#population-input').disabled = Boolean(ui.stress);
  $('#stress').textContent = ui.stress ? 'Stop stress test' : `Run stress test (${STRESS_LEVELS[0]}–${STRESS_LEVELS.at(-1)} fish)`;
  $('#finish').textContent = challenge ? 'Give up' : 'Finish';
}

function pause() {
  // Pausing mid-stress-test would record frames with no simulation as results, so it stops the test.
  if (!simulation.paused && ui.stress) stopStress();
  simulation.paused = !simulation.paused; clock.clear(); syncControls(); updateReadouts();
}
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
  document.querySelectorAll('.scenario').forEach(b => b.classList.remove('selected'));
}
function setPredator(on) {
  if (game.mode === 'challenge') return;
  simulation.setPredator(on); predatorAnimator.reset();
  syncControls();
  toast(on ? 'Predator released: nearby fish flee' : 'Predator removed: fish recover');
}
function dropFood(x, z, y) {
  const before = simulation.food.length;
  const pellet = simulation.addFood(x, z, y);
  if (!pellet) return;
  if (game.session) game.session.drops++;
  if (y === undefined) scene.ripple(pellet.x, pellet.z);
  toast(before >= CONFIG.maxFood ? `At most ${CONFIG.maxFood} pellets: the oldest was replaced` : 'Food dropped: it sinks slowly');
}
function clearFood() { simulation.clearFood(); toast('Food cleared'); }
function runScenario(name) {
  restart();
  if (name === 'feeding' || name === 'combined') for (const [x, z] of [[-10, 4], [4, -6], [13, 7]]) simulation.addFood(x, z, 11);
  if (name === 'predator' || name === 'combined') simulation.setPredator(true);
  for (const button of document.querySelectorAll('.scenario')) button.classList.toggle('selected', button.dataset.scenario === name);
  game.scenario = name;
  game.session = newSession();
  syncControls(); updateReadouts();
  toast(`${SCENARIOS[name][0]} scenario from seed ${CONFIG.seed}`);
}

// ---- Game states -----------------------------------------------------------------------------
const newSession = () => ({ drops: 0, peakFeed: 0, peakFlee: 0 });
const meals = () => simulation.foodEaten / CONFIG.foodAmount;

function showScreen(html, focus) {
  $('#screen-card').innerHTML = html;
  $('#screen').hidden = false;
  document.body.classList.add('screen-open');
  for (const el of document.querySelectorAll('main, header, footer')) el.inert = true;
  $(focus)?.focus();
}
function hideScreen() {
  $('#screen').hidden = true;
  document.body.classList.remove('screen-open');
  for (const el of document.querySelectorAll('main, header, footer')) el.inert = false;
}

function showMenu() {
  game.phase = 'menu'; game.mode = null; game.result = null; game.session = null;
  restart();
  setView('perspective');
  applyMode();
  const best = game.best ? `Your best: ${game.best.toFixed(1)} s` : 'No best time yet';
  showScreen(`
    <p class="screen-eyebrow">CS 549 · COLLECTIVE BEHAVIOUR LAB</p>
    <h2 id="screen-title" class="screen-title">AquaSwarm</h2>
    <p class="screen-lede">One hundred fish follow three local rules. Feed them, frighten them, and watch a school emerge.</p>
    <div class="modes">
      <button class="mode" id="start-explore"><strong>Explore the lab</strong>
        <span>Switch Boids rules, run behaviour scenarios, release the predator and stress-test up to 2000 fish. No time limit.</span><em>Start exploring →</em></button>
      <button class="mode" id="start-challenge"><strong>Feeding challenge</strong>
        <span>Feed the school ${CHALLENGE.meals} meals in ${CHALLENGE.seconds} s while a predator hunts. Fish that flee stop eating.</span><em>Start challenge → <small>${best}</small></em></button>
    </div>
    <ul class="how"><li><b>Click the water</b> drop food</li><li><b>Drag / scroll</b> orbit and zoom</li><li><kbd>Space</kbd> pause</li><li><kbd>R</kbd> restart</li><li><kbd>Esc</kbd> finish</li></ul>`, '#start-explore');
  $('#start-explore').addEventListener('click', () => startMode('explore'));
  $('#start-challenge').addEventListener('click', () => startMode('challenge'));
}

function startMode(mode) {
  game.phase = 'active'; game.mode = mode; game.result = null; game.scenario = null;
  restart();
  if (mode === 'challenge') simulation.setPredator(true);
  game.session = newSession();
  setView('perspective');
  applyMode();
  hideScreen();
  toast(mode === 'challenge' ? `Feed ${CHALLENGE.meals} meals in ${CHALLENGE.seconds} s. Click the water to drop food` : 'Click the water to drop food');
}

// Switches the panels and headings between the lab and the challenge.
function applyMode() {
  const challenge = game.mode === 'challenge';
  $('#tabs').hidden = challenge;
  $('#hud').hidden = !challenge;
  $('#menu').hidden = game.mode === null;
  $('#eyebrow').textContent = challenge ? 'FEEDING CHALLENGE · BEAT THE CLOCK' : 'BOIDS · STATE MACHINE · PROCEDURAL SWIMMING';
  $('#headline').textContent = challenge ? 'Feed the school. Dodge the hunter.' : 'Feed them. Frighten them.';
  $('#tool-hint').textContent = challenge ? 'Drop food near the school and away from the predator.' : 'Click the water to drop food. Drag to orbit, scroll to zoom.';
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = true;
  if (challenge) $('#panel-challenge').hidden = false;
  else selectTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? tabs[0]);
  $('#ch-best').textContent = game.best ? `${game.best.toFixed(1)} s` : '—';
  syncControls(); updateReadouts(); updateHud();
}

function finish(result) {
  if (game.phase !== 'active') return;
  stopStress();
  game.phase = 'ended'; game.result = result;
  simulation.paused = true; clock.clear(); syncControls(); updateReadouts();
  const s = game.session, time = simulation.time, eaten = meals();
  const stat = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
  const stats = [stat('Meals eaten', eaten.toFixed(1)), stat('Food dropped', s.drops), stat('Times fish fled', simulation.stats.fleeStarts),
    stat('Peak fleeing', `${s.peakFlee} fish`)].join('');
  let title, lede, primary;
  if (game.mode === 'challenge') {
    const newBest = result === 'win' && (!game.best || time < game.best);
    if (newBest) { game.best = time; saveBest(time); }
    title = result === 'win' ? 'School fed!' : result === 'timeout' ? 'Time\'s up' : 'Challenge abandoned';
    lede = result === 'win'
      ? `The school ate ${CHALLENGE.meals} meals in <b>${time.toFixed(1)} s</b>.${newBest ? ' New best time!' : ` Best: ${game.best.toFixed(1)} s.`}`
      : `The school ate ${eaten.toFixed(1)} of ${CHALLENGE.meals} meals. Drop food closer to the school and further from the predator.`;
    primary = 'Play again';
  } else {
    title = 'Session summary';
    lede = `You explored for <b>${formatTime(time)}</b> of simulated time with ${simulation.fish.length} fish.`;
    primary = 'New session';
  }
  showScreen(`
    <p class="screen-eyebrow">${game.mode === 'challenge' ? 'FEEDING CHALLENGE' : 'EXPLORE THE LAB'}</p>
    <h2 id="screen-title" class="screen-title ${result}">${title}</h2>
    <p class="screen-lede">${lede}</p>
    <div class="result-stats">${stats}</div>
    <div class="screen-actions">
      <button class="primary" id="again">${primary}</button>
      ${game.mode === 'explore' ? '<button class="secondary" id="resume">Keep exploring</button>' : ''}
      <button class="secondary" id="to-menu">Main menu</button>
    </div>`, '#again');
  $('#again').addEventListener('click', () => startMode(game.mode));
  $('#resume')?.addEventListener('click', () => { game.phase = 'active'; game.result = null; hideScreen(); pause(); });
  $('#to-menu').addEventListener('click', showMenu);
}

function updateHud() {
  if (game.mode !== 'challenge') return;
  const left = Math.max(0, CHALLENGE.seconds - simulation.time), eaten = Math.min(CHALLENGE.meals, meals());
  const seconds = Math.ceil(left);
  $('#hud-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('#hud-time').classList.toggle('urgent', left < 15);
  $('#hud-meals').innerHTML = `${eaten.toFixed(1)} <small>/ ${CHALLENGE.meals}</small>`;
  $('#hud-fill').style.width = `${eaten / CHALLENGE.meals * 100}%`;
  $('#hud-meter').setAttribute('aria-valuenow', eaten.toFixed(1));
  $('#ch-drops').textContent = game.session.drops;
  $('#ch-flees').textContent = simulation.stats.fleeStarts;
}
function checkGame() {
  if (game.phase !== 'active') return;
  const counts = simulation.stateCounts();
  game.session.peakFeed = Math.max(game.session.peakFeed, counts.feed);
  game.session.peakFlee = Math.max(game.session.peakFlee, counts.flee);
  if (game.mode !== 'challenge') return;
  if (meals() >= CHALLENGE.meals) finish('win');
  else if (simulation.time >= CHALLENGE.seconds) finish('timeout');
}

// ---- Wiring ----------------------------------------------------------------------------------
for (const rule of RULES) {
  $(`#${rule}-weight`).addEventListener('input', event => { simulation.setWeight(rule, Number(event.target.value)); syncControls(); });
  $(`#${rule}-enabled`).addEventListener('change', event => { simulation.setEnabled(rule, event.target.checked); syncControls(); });
}
$('#pause').addEventListener('click', pause);
// Restart repeats what is running: the selected scenario, or a fresh session of the current mode.
function restartSession() { if (game.scenario) runScenario(game.scenario); else startMode(game.mode); }
$('#reset').addEventListener('click', restartSession);
$('#finish').addEventListener('click', () => finish(game.mode === 'challenge' ? 'abandoned' : 'summary'));
$('#menu').addEventListener('click', showMenu);
$('#perspective').addEventListener('click', () => setView('perspective'));
$('#top').addEventListener('click', () => setView('top'));
$('#expand').addEventListener('click', () => {
  const expanded = document.querySelector('main').classList.toggle('expanded');
  $('#expand').textContent = expanded ? 'Show controls' : 'Expand';
  $('#expand').setAttribute('aria-pressed', String(expanded));
});
$('#predator').addEventListener('click', () => setPredator(!simulation.predator));
$('#clear-food').addEventListener('click', clearFood);
document.querySelectorAll('.scenario').forEach(button => button.addEventListener('click', () => runScenario(button.dataset.scenario)));
$('#swim').addEventListener('change', event => { ui.swim = event.target.checked; scene.setSwimEnabled(ui.swim); });
$('#color-state').addEventListener('change', event => { ui.colorByState = event.target.checked; scene.setColorMode(ui.colorByState ? 'state' : 'species'); });
$('#population-input').addEventListener('input', event => { simulation.setCount(Number(event.target.value)); syncControls(); updateReadouts(); });
$('#stress').addEventListener('click', () => (ui.stress ? stopStress() : startStress()));
// A mouse click leaves focus on the button, and the keyboard handler then ignores Space/R/C
// (Space would click that button again). Drop focus after pointer clicks; keyboard focus stays.
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && event.detail > 0 && !button.closest('#screen')) button.blur();
});

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
  if (game.phase !== 'active') return;
  const point = scene.surfacePoint(event.clientX, event.clientY);
  if (point) dropFood(point.x, point.z); else toast('Click inside the tank to drop food');
});

document.addEventListener('keydown', event => {
  if (game.phase !== 'active') return;
  if (event.target.closest('input, button, summary, a, textarea, select, [role="tab"]') || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    Space: pause, KeyR: restartSession, KeyC: clearFood,
    KeyP: () => setPredator(!simulation.predator),
    Escape: () => finish(game.mode === 'challenge' ? 'abandoned' : 'summary'),
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
  const label = game.phase === 'menu' ? 'Menu' : game.phase === 'ended' ? 'Finished' : simulation.paused ? 'Paused' : 'Running';
  $('#status').textContent = `${label} · ${formatTime(simulation.time)}`;
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

showMenu();
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
    checkGame();
    if (game.mode === 'challenge') updateHud();
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
    game: { phase: game.phase, mode: game.mode, result: game.result, meals: meals(), session: game.session, best: game.best },
    stats: simulation.stats, stress: { running: Boolean(ui.stress), results: ui.stressResults },
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
