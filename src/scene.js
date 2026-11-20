import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, STATE } from './simulation.js';
import { buildFishGeometry, addSwimDeformation } from './fishGeometry.js';
import { buildBoulderGeometry, buildColumnGeometry, buildBladeGeometry, addSwayDeformation } from './obstacleGeometry.js';

export const STATE_COLORS = Object.freeze(['#e8914a', '#3f9e4f', '#d6404e']);
const FISH_SCALE = 1.2, PREDATOR_SCALE = 3.2;

export function createScene(container) {
  const width = CONFIG.halfWidth * 2, depth = CONFIG.halfDepth * 2, height = CONFIG.height;
  const scene = new THREE.Scene();
  const background = new THREE.Color('#e3ede8');
  scene.background = background;
  scene.fog = new THREE.Fog('#e3ede8', 90, 190);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', '3D aquarium. Drag to orbit, scroll to zoom toward the pointer, click the water to drop food or click a fish to inspect it.');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  controls.minDistance = 6;
  controls.maxDistance = 100;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2.1;
  scene.add(new THREE.HemisphereLight('#f2fffb', '#5d7c74', 2.3));
  const sunlight = new THREE.DirectionalLight('#fff1d3', 2.8);
  sunlight.position.set(-12, 28, 18);
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight('#a3e2dc', 1.2);
  fill.position.set(20, 12, -16);
  scene.add(fill);

  // Tank: base, sand, floor grid, edges, faint glass and water surface (no refraction or fluid).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.7, depth + 1),
    new THREE.MeshStandardMaterial({ color: '#759e95', roughness: 0.95 }));
  floor.position.y = -0.55;
  scene.add(floor);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: '#b7c5b4', roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.19;
  scene.add(sand);
  const gridPoints = [];
  for (let x = -CONFIG.halfWidth; x <= CONFIG.halfWidth; x += 2) gridPoints.push(x, -0.17, -CONFIG.halfDepth, x, -0.17, CONFIG.halfDepth);
  for (let z = -CONFIG.halfDepth; z <= CONFIG.halfDepth; z += 2) gridPoints.push(-CONFIG.halfWidth, -0.17, z, CONFIG.halfWidth, -0.17, z);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)),
    new THREE.LineBasicMaterial({ color: '#6b9484', transparent: true, opacity: 0.18 })));
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: '#407f77', transparent: true, opacity: 0.42 }));
  outline.position.y = height / 2;
  scene.add(outline);
  const glassMaterial = new THREE.MeshBasicMaterial({ color: '#67bdb0', transparent: true,
    opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  for (const z of [-CONFIG.halfDepth, CONFIG.halfDepth]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMaterial);
    wall.position.set(0, height / 2, z); scene.add(wall);
  }
  for (const x of [-CONFIG.halfWidth, CONFIG.halfWidth]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), glassMaterial);
    wall.rotation.y = Math.PI / 2; wall.position.set(x, height / 2, 0); scene.add(wall);
  }
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
    color: '#4fb3c8', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  surface.rotation.x = -Math.PI / 2; surface.position.y = height;
  scene.add(surface);

  const transform = new THREE.Object3D();
  // Sea grass: decoration only (fish swim through it), clumps along the back glass and in corners.
  const swayUniforms = { uTime: { value: 0 } };
  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  addSwayDeformation(grassMaterial, swayUniforms);
  const clumps = [[-20, -14], [-13, -15], [-4, -15.2], [6, -14.8], [15, -15], [21, -12], [-21, 12], [21, 13], [-21, -2], [21.5, 3]];
  const grass = new THREE.InstancedMesh(buildBladeGeometry(), grassMaterial, clumps.length * 9);
  {
    let k = 0;
    clumps.forEach(([cx, cz], c) => {
      for (let b = 0; b < 9; b++) {
        const angle = (c * 9 + b) * 2.399, spread = 0.25 + (b % 3) * 0.35;
        transform.position.set(cx + Math.cos(angle) * spread, -0.2, cz + Math.sin(angle) * spread);
        transform.rotation.set(0, angle, 0);
        transform.scale.set(1 + (b % 2) * 0.4, 2.2 + ((c * 7 + b * 3) % 10) * 0.32, 1);
        transform.updateMatrix();
        grass.setMatrixAt(k++, transform.matrix);
      }
    });
  }
  scene.add(grass);

  // Obstacles: one mesh per boulder or coral column, built from the obstacle id as seed.
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  // Rocks between the follow camera and its fish are drawn see-through so the fish stays visible.
  const rockFadeMaterial = rockMaterial.clone();
  Object.assign(rockFadeMaterial, { transparent: true, opacity: 0.2, depthWrite: false });
  const obstacleMeshes = new Map();
  function syncObstacles(obstacles) {
    const live = new Set(obstacles.map(o => o.id));
    for (const [id, mesh] of obstacleMeshes) if (!live.has(id)) { scene.remove(mesh); mesh.geometry.dispose(); obstacleMeshes.delete(id); }
    for (const o of obstacles) {
      if (obstacleMeshes.has(o.id)) continue;
      const column = o.kind === 'column';
      const mesh = new THREE.Mesh(column ? buildColumnGeometry(549 + o.id * 31) : buildBoulderGeometry(549 + o.id * 31), rockMaterial);
      if (column) { mesh.position.set(o.x, -0.2, o.z); mesh.scale.set(o.r, height + 0.25, o.r); mesh.rotation.y = o.id * 1.7; }
      else { mesh.position.set(o.x, o.y, o.z); mesh.scale.setScalar(o.r); mesh.rotation.y = o.id * 2.3; }
      mesh.userData.obstacleId = o.id;
      scene.add(mesh);
      obstacleMeshes.set(o.id, mesh);
    }
  }
  // Placement preview: the obstacle's real collider shape, green where it fits and red where not.
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#2f9e6a', transparent: true, opacity: 0.22, depthWrite: false });
  const ghosts = {
    boulder: new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), ghostMaterial),
    column: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), ghostMaterial),
    remove: new THREE.Mesh(new THREE.RingGeometry(1.05, 1.25, 40).rotateX(-Math.PI / 2), ghostMaterial),
  };
  Object.values(ghosts).forEach(g => { g.visible = false; g.renderOrder = 2; scene.add(g); });

  // School: one instanced, vertex-coloured mesh with the swim wave in the vertex shader.
  const swimUniforms = { uSwimOn: { value: 1 } };
  const makeSwimMesh = (kind, capacity) => {
    const geometry = buildFishGeometry(kind);
    const swim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    swim.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aSwim', swim);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02,
      flatShading: true, side: THREE.DoubleSide });
    addSwimDeformation(material, swimUniforms);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, swim };
  };
  const school = makeSwimMesh('fish', CONFIG.maxCount);
  const predatorMesh = makeSwimMesh('predator', 1);
  const baseColors = Array.from({ length: CONFIG.maxCount }, (_, i) =>
    new THREE.Color().setHSL(0.06 + (i * 0.618 % 1) * 0.05, 0.85, 0.55 + (i % 5) * 0.025));
  const stateColors = STATE_COLORS.map(color => new THREE.Color(color));
  for (let i = 0; i < CONFIG.maxCount; i++) school.mesh.setColorAt(i, baseColors[i]);
  predatorMesh.mesh.setColorAt(0, new THREE.Color('#ffffff'));
  school.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#326963', transparent: true, opacity: 0.12, depthWrite: false });
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 14), shadowMaterial, CONFIG.maxCount + 1 + CONFIG.maxFood);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false;
  scene.add(shadows);

  // Food pellets and a ripple at the drop point.
  const pellets = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0),
    new THREE.MeshStandardMaterial({ color: '#c8862f', emissive: '#6b3a0a', emissiveIntensity: 0.35, roughness: 0.7, flatShading: true }), CONFIG.maxFood);
  pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pellets.frustumCulled = false;
  scene.add(pellets);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({
    color: '#2f8d9b', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2; ripple.visible = false;
  scene.add(ripple);
  let rippleStart = -Infinity;

  // Sensing ranges, drawn when "Show sensing ranges" is on: flee enter/exit rings around the predator
  // and the food-attraction ring around each pellet, at the agent's height.
  const circle = (radius, color, opacity, dashed = false) => {
    const points = [];
    for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.6, gapSize: 0.5 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    if (dashed) line.computeLineDistances();
    line.visible = false;
    scene.add(line);
    return line;
  };
  const fleeEnterRing = circle(CONFIG.fleeEnter, STATE_COLORS[STATE.flee], 0.75);
  const fleeExitRing = circle(CONFIG.fleeExit, STATE_COLORS[STATE.flee], 0.55, true);
  const foodRings = Array.from({ length: CONFIG.maxFood }, () => circle(CONFIG.feedEnter, STATE_COLORS[STATE.feed], 0.5));

  // Selected fish: perception sphere, separation sphere, heading arrow and a marker ring.
  const selection = new THREE.Group();
  const perception = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CONFIG.perception, 1)),
    new THREE.LineBasicMaterial({ color: '#1d6f8a', transparent: true, opacity: 0.22, depthWrite: false }));
  const personal = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.separationRadius, 20, 12),
    new THREE.MeshBasicMaterial({ color: '#1d6f8a', transparent: true, opacity: 0.08, depthWrite: false }));
  const marker = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: '#1d6f8a' }));
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3, '#1d6f8a', 0.6, 0.35);
  selection.add(perception, personal, marker, arrow);
  selection.visible = false;
  scene.add(selection);
  const direction = new THREE.Vector3();
  let showRanges = false;

  let colorMode = 'species';

  function poseAgent(mesh, swim, index, agent, animator, i, scale) {
    transform.position.set(agent.x, agent.y, agent.z);
    transform.rotation.set(-animator.bank[i], animator.yaw[i], animator.pitch[i], 'YZX');
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    swim.setXYZ(index, animator.phase[i], animator.amplitude[i], animator.bend[i]);
  }
  function placeShadow(index, x, z, yaw, sx, sz, y = -0.14) {
    transform.position.set(x, y, z);
    transform.rotation.set(-Math.PI / 2, 0, yaw, 'XYZ');
    transform.scale.set(sx, sz, 1);
    transform.updateMatrix();
    shadows.setMatrixAt(index, transform.matrix);
  }

  function update(simulation, animator, predatorAnimator, selectedId, now) {
    swayUniforms.uTime.value = now / 1000;
    syncObstacles(simulation.obstacles);
    const fish = simulation.fish;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      poseAgent(school.mesh, school.swim, i, f, animator, i, FISH_SCALE);
      placeShadow(i, f.x, f.z, animator.yaw[i], 1.4 * FISH_SCALE, 0.43 * FISH_SCALE);
      if (colorMode === 'state') school.mesh.setColorAt(i, f.state === STATE.cruise ? baseColors[i] : stateColors[f.state]);
      else school.mesh.setColorAt(i, baseColors[i]);
    }
    school.mesh.count = fish.length;
    let shadowCount = fish.length;
    const predator = simulation.predator;
    predatorMesh.mesh.visible = Boolean(predator);
    if (predator) {
      poseAgent(predatorMesh.mesh, predatorMesh.swim, 0, predator, predatorAnimator, 0, PREDATOR_SCALE);
      placeShadow(shadowCount++, predator.x, predator.z, predatorAnimator.yaw[0], 1.4 * PREDATOR_SCALE, 0.4 * PREDATOR_SCALE);
    }
    const food = simulation.food;
    food.forEach((pellet, k) => {
      transform.position.set(pellet.x, pellet.y, pellet.z);
      transform.rotation.set(pellet.age * 0.9, pellet.age * 1.3, 0);
      transform.scale.setScalar(0.45 + 0.55 * pellet.amount / CONFIG.foodAmount);
      transform.updateMatrix();
      pellets.setMatrixAt(k, transform.matrix);
      placeShadow(shadowCount++, pellet.x, pellet.z, 0, 0.5, 0.5);
    });
    pellets.count = food.length;
    shadows.count = shadowCount;
    for (const mesh of [school.mesh, predatorMesh.mesh, pellets, shadows]) mesh.instanceMatrix.needsUpdate = true;
    school.mesh.instanceColor.needsUpdate = true;
    school.swim.needsUpdate = true; predatorMesh.swim.needsUpdate = true;
    school.swim.clearUpdateRanges(); school.swim.addUpdateRange(0, fish.length * 3);

    const selected = selectedId === null ? null : fish.find(f => f.id === selectedId);
    selection.visible = Boolean(selected);
    if (selected) {
      const i = fish.indexOf(selected);
      selection.position.set(selected.x, selected.y, selected.z);
      marker.rotation.set(Math.PI / 2, 0, -animator.yaw[i]);
      const speed = Math.hypot(selected.vx, selected.vy, selected.vz);
      arrow.setDirection(direction.set(selected.vx, selected.vy, selected.vz).normalize());
      arrow.setLength(0.9 + speed * 0.7, 0.55, 0.32);
      arrow.setColor(stateColors[selected.state]);
    }
    fleeEnterRing.visible = fleeExitRing.visible = showRanges && Boolean(predator);
    if (predator) { fleeEnterRing.position.set(predator.x, predator.y, predator.z); fleeExitRing.position.copy(fleeEnterRing.position); }
    foodRings.forEach((ring, k) => {
      ring.visible = showRanges && k < food.length;
      if (ring.visible) ring.position.set(food[k].x, food[k].y, food[k].z);
    });

    const age = (now - rippleStart) / 1000;
    ripple.visible = age < 1.1;
    if (ripple.visible) { ripple.scale.setScalar(0.4 + age * 2.4); ripple.material.opacity = 0.55 * (1 - age / 1.1); }
  }

  // Follow camera: the orbit target glides onto the selected fish and carries the camera along,
  // so orbit and zoom still work around the moving fish.
  let following = false, flyIn = false, lastFollow = 0;
  const followShift = new THREE.Vector3();
  function follow(fish, now) {
    const k = 1 - Math.exp(-Math.min(0.1, (now - lastFollow) / 1000) * 5);
    lastFollow = now;
    followShift.set(fish.x, fish.y, fish.z).sub(controls.target).multiplyScalar(k);
    controls.target.add(followShift); camera.position.add(followShift);
    if (flyIn) {
      const distance = camera.position.distanceTo(controls.target), goal = 7.5;
      camera.position.sub(controls.target).setLength(distance + (goal - distance) * k).add(controls.target);
      flyIn = Math.abs(distance - goal) > 0.3;
    }
  }

  let view = 'perspective';
  function resetCamera(nextView = 'perspective') {
    view = nextView;
    following = false; controls.minDistance = 6;
    const aspect = Math.max(0.3, container.clientWidth / Math.max(1, container.clientHeight));
    // Fit every tank corner, including its depth, for a large uncropped view.
    const direction = (view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.12, Math.max(0.32, Math.min(0.68, 1 / aspect)), 1)).normalize();
    const right = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const target = new THREE.Vector3(0, height / 2, 0);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [-CONFIG.halfWidth - 0.5, CONFIG.halfWidth + 0.5]) for (const y of [-0.9, height]) for (const z of [-CONFIG.halfDepth - 0.5, CONFIG.halfDepth + 0.5]) {
      const corner = new THREE.Vector3(x, y, z).sub(target);
      distance = Math.max(distance, corner.dot(direction) + 1.06 * Math.max(Math.abs(corner.dot(right)) / (tangent * aspect), Math.abs(corner.dot(up)) / tangent));
    }
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.maxDistance = Math.max(100, distance * 1.5);
    controls.target.copy(target); controls.update();
  }
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
    if (!following) resetCamera(view);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container); resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function rayFrom(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  }


  return {
    domElement: renderer.domElement,
    render(simulation, animator, predatorAnimator, selectedId = null) {
      const now = performance.now();
      update(simulation, animator, predatorAnimator, selectedId, now);
      const target = following && selectedId !== null ? simulation.fish.find(f => f.id === selectedId) : null;
      if (target) follow(target, now);
      controls.update();
      const sight = target ? controls.target.distanceTo(camera.position) : 0;
      if (target) raycaster.set(camera.position, direction.subVectors(controls.target, camera.position).normalize());
      for (const mesh of obstacleMeshes.values())
        mesh.material = target && raycaster.intersectObject(mesh, false).some(hit => hit.distance < sight - 0.3) ? rockFadeMaterial : rockMaterial;
      renderer.render(scene, camera);
    },
    resetCamera,
    setSwimEnabled(on) { swimUniforms.uSwimOn.value = on ? 1 : 0; },
    setColorMode(mode) { colorMode = mode; },
    setShowRanges(on) { showRanges = on; },
    // Follow on: glide to the selected fish and stay with it. Off: back to the overview.
    setFollow(on) {
      if (!on) { if (following) resetCamera(view); return; }
      following = true; flyIn = true; lastFollow = performance.now(); controls.minDistance = 3.5;
    },
    // The fish closest to the click ray, if the ray passes within about a body length of it.
    pickFish(clientX, clientY, fish) {
      const ray = rayFrom(clientX, clientY);
      let best = null, bestScore = Infinity;
      const point = new THREE.Vector3();
      for (const f of fish) {
        point.set(f.x, f.y, f.z);
        const along = point.clone().sub(ray.origin).dot(ray.direction);
        if (along < 0) continue;
        const tolerance = 0.9 + along * 0.012, score = ray.distanceToPoint(point) / tolerance + along * 0.002;
        if (score < 1 + along * 0.002 && score < bestScore) { bestScore = score; best = f.id; }
      }
      return best;
    },
    // Food is dropped where the click ray meets the water surface, inside the tank.
    surfacePoint(clientX, clientY) {
      if (!rayFrom(clientX, clientY).intersectPlane(surfacePlane, hit)) return null;
      if (Math.abs(hit.x) > CONFIG.halfWidth - 1 || Math.abs(hit.z) > CONFIG.halfDepth - 1) return null;
      return { x: hit.x, z: hit.z };
    },
    // Obstacles are placed where the click ray meets the sand.
    floorPoint(clientX, clientY) {
      if (!rayFrom(clientX, clientY).intersectPlane(floorPlane, hit)) return null;
      if (Math.abs(hit.x) > CONFIG.halfWidth || Math.abs(hit.z) > CONFIG.halfDepth) return null;
      return { x: hit.x, z: hit.z };
    },
    // The obstacle under the pointer (its id), or null.
    obstacleAt(clientX, clientY) {
      const hits = rayFrom(clientX, clientY) && raycaster.intersectObjects([...obstacleMeshes.values()], false);
      return hits.length ? hits[0].object.userData.obstacleId : null;
    },
    // Shows the placement preview (kind 'boulder', 'column' or 'remove'); null hides it.
    setGhost(ghost) {
      Object.values(ghosts).forEach(g => { g.visible = false; });
      if (!ghost) return;
      const mesh = ghosts[ghost.kind];
      ghostMaterial.color.set(ghost.ok ? '#2f9e6a' : '#d6404e');
      if (ghost.kind === 'column') { mesh.position.set(ghost.x, 0, ghost.z); mesh.scale.set(ghost.r, height, ghost.r); }
      else if (ghost.kind === 'boulder') { mesh.position.set(ghost.x, ghost.r * CONFIG.boulderLift, ghost.z); mesh.scale.setScalar(ghost.r); }
      else { mesh.position.set(ghost.x, 0.05, ghost.z); mesh.scale.setScalar(ghost.r); }
      mesh.visible = true;
    },
    ripple(x, z) { ripple.position.set(x, height + 0.02, z); rippleStart = performance.now(); },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, visible: v.z < 1 };
    },
    getInfo() {
      const { x, y, z } = controls.target;
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, target: { x, y, z } };
    },
    dispose() {
      resizeObserver.disconnect(); controls.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
