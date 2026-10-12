import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, STATE } from './simulation.js';
import { buildFishGeometry, addSwimDeformation } from './fishGeometry.js';

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
  renderer.domElement.setAttribute('aria-label', '3D aquarium. Drag to orbit, scroll to zoom toward the pointer, click the water to drop food.');
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

  const transform = new THREE.Object3D();
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

  function update(simulation, animator, predatorAnimator, now) {
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

    const age = (now - rippleStart) / 1000;
    ripple.visible = age < 1.1;
    if (ripple.visible) { ripple.scale.setScalar(0.4 + age * 2.4); ripple.material.opacity = 0.55 * (1 - age / 1.1); }
  }

  let view = 'perspective';
  function resetCamera(nextView = 'perspective') {
    view = nextView;
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
    resetCamera(view);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container); resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
  const hit = new THREE.Vector3();
  function rayFrom(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  }

  return {
    domElement: renderer.domElement,
    render(simulation, animator, predatorAnimator) {
      update(simulation, animator, predatorAnimator, performance.now());
      controls.update();
      renderer.render(scene, camera);
    },
    resetCamera,
    setSwimEnabled(on) { swimUniforms.uSwimOn.value = on ? 1 : 0; },
    setColorMode(mode) { colorMode = mode; },
    // Food is dropped where the click ray meets the water surface, inside the tank.
    surfacePoint(clientX, clientY) {
      if (!rayFrom(clientX, clientY).intersectPlane(surfacePlane, hit)) return null;
      if (Math.abs(hit.x) > CONFIG.halfWidth - 1 || Math.abs(hit.z) > CONFIG.halfDepth - 1) return null;
      return { x: hit.x, z: hit.z };
    },
    ripple(x, z) { ripple.position.set(x, height + 0.02, z); rippleStart = performance.now(); },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, visible: v.z < 1 };
    },
    getInfo() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
    dispose() {
      resizeObserver.disconnect(); controls.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
