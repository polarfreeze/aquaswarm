import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './simulation.js';

export function createScene(container, simulation) {
  const width = CONFIG.halfWidth * 2, depth = CONFIG.halfDepth * 2, height = CONFIG.height;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e3ede8');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor('#e3ede8');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', '3D aquarium with 100 fish. Drag to orbit and scroll to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = 27;
  controls.maxDistance = 100;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2.2;
  scene.add(new THREE.HemisphereLight('#effff8', '#52726c', 2.4));
  const sunlight = new THREE.DirectionalLight('#fff1d3', 3);
  sunlight.position.set(-12, 28, 18);
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight('#a3e2dc', 1.4);
  fill.position.set(20, 12, -16);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.7, depth + 1),
    new THREE.MeshStandardMaterial({ color: '#759e95', roughness: 0.95 }));
  floor.position.y = -0.55;
  scene.add(floor);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: '#b9cec4', roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.19;
  scene.add(sand);

  const gridPoints = [];
  for (let x = -CONFIG.halfWidth; x <= CONFIG.halfWidth; x += 2) gridPoints.push(x, -0.17, -CONFIG.halfDepth, x, -0.17, CONFIG.halfDepth);
  for (let z = -CONFIG.halfDepth; z <= CONFIG.halfDepth; z += 2) gridPoints.push(-CONFIG.halfWidth, -0.17, z, CONFIG.halfWidth, -0.17, z);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(gridPoints, 3)),
  new THREE.LineBasicMaterial({ color: '#6b9484', transparent: true, opacity: 0.2 }));
  scene.add(grid);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: '#407f77', transparent: true, opacity: 0.42 }));
  outline.position.y = height / 2;
  scene.add(outline);
  // Subtle aquarium walls, with no refraction or fluid simulation.
  const glassMaterial = new THREE.MeshBasicMaterial({ color: '#67bdb0', transparent: true,
    opacity: 0.065, side: THREE.DoubleSide, depthWrite: false });
  for (const z of [-CONFIG.halfDepth, CONFIG.halfDepth]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMaterial);
    wall.position.set(0, height / 2, z); scene.add(wall);
  }
  for (const x of [-CONFIG.halfWidth, CONFIG.halfWidth]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), glassMaterial);
    wall.rotation.y = Math.PI / 2; wall.position.set(x, height / 2, 0); scene.add(wall);
  }

  const bodyGeometry = new THREE.SphereGeometry(1, 8, 5);
  bodyGeometry.scale(0.62, 0.23, 0.2);
  const tailGeometry = new THREE.BufferGeometry();
  tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.47, 0, 0, -1.0, 0.03, 0.32, -0.91, 0.03, -0.32,
  ], 3));
  tailGeometry.computeVertexNormals();
  const finGeometry = new THREE.BufferGeometry();
  finGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.12, 0.16, 0, -0.31, 0.5, 0, -0.38, 0.12, 0,
  ], 3));
  finGeometry.computeVertexNormals();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#f4b968', roughness: 0.68, flatShading: true });
  const finMaterial = new THREE.MeshStandardMaterial({ color: '#c06b30', roughness: 0.8,
    side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, CONFIG.count);
  const tail = new THREE.InstancedMesh(tailGeometry, finMaterial, CONFIG.count);
  const fin = new THREE.InstancedMesh(finGeometry, finMaterial, CONFIG.count);
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.049, 6, 4),
    new THREE.MeshBasicMaterial({ color: '#183d38' }), CONFIG.count * 2);
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 14),
    new THREE.MeshBasicMaterial({ color: '#326963', transparent: true, opacity: 0.13, depthWrite: false }), CONFIG.count);
  for (const mesh of [body, tail, fin, eyes, shadows]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const transform = new THREE.Object3D();
  const eyePosition = new THREE.Vector3();
  for (let i = 0; i < CONFIG.count; i++) {
    body.setColorAt(i, new THREE.Color().setHSL(0.09 + (i % 7) * 0.007, 0.65, 0.58 + (i % 3) * 0.04));
  }
  function syncFish() {
    simulation.fish.forEach((fish, i) => {
      const angle = -Math.atan2(fish.vz, fish.vx);
      transform.position.set(fish.x, fish.y, fish.z);
      const pitch = Math.atan2(fish.vy, Math.hypot(fish.vx, fish.vz));
      transform.rotation.set(0, angle, pitch, 'YXZ'); transform.scale.set(1, 1, 1); transform.updateMatrix();
      body.setMatrixAt(i, transform.matrix); tail.setMatrixAt(i, transform.matrix); fin.setMatrixAt(i, transform.matrix);
      for (let side = 0; side < 2; side++) {
        eyePosition.set(0.37, 0.08, side ? 0.16 : -0.16).applyQuaternion(transform.quaternion);
        transform.position.set(fish.x + eyePosition.x, fish.y + eyePosition.y, fish.z + eyePosition.z);
        transform.updateMatrix(); eyes.setMatrixAt(i * 2 + side, transform.matrix);
      }
      transform.position.set(fish.x, -0.14, fish.z);
      transform.rotation.set(-Math.PI / 2, 0, angle, 'XYZ'); transform.scale.set(1.4, 0.43, 1);
      transform.updateMatrix(); shadows.setMatrixAt(i, transform.matrix);
    });
    for (const mesh of [body, tail, fin, eyes, shadows]) mesh.instanceMatrix.needsUpdate = true;
  }
  let view = 'perspective';
  function resetCamera(nextView = 'perspective') {
    view = nextView;
    const aspect = Math.max(0.3, container.clientWidth / container.clientHeight);
    // Fit every tank corner in perspective, including its depth, for a larger uncropped view.
    const direction = (view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.12, Math.max(0.32, Math.min(0.68, 1 / aspect)), 1)).normalize();
    const right = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const target = new THREE.Vector3(0, height / 2, 0);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [-CONFIG.halfWidth - 0.5, CONFIG.halfWidth + 0.5]) for (const y of [-0.9, height]) for (const z of [-CONFIG.halfDepth - 0.5, CONFIG.halfDepth + 0.5]) {
      const corner = new THREE.Vector3(x, y, z).sub(target);
      distance = Math.max(distance, corner.dot(direction) + 1.08 * Math.max(Math.abs(corner.dot(right)) / (tangent * aspect), Math.abs(corner.dot(up)) / tangent));
    }
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.maxDistance = Math.max(100, distance * 1.5);
    controls.target.copy(target); controls.update();
  }
  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
    resetCamera(view);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container); resize();
  return {
    render() { syncFish(); renderer.render(scene, camera); },
    resetCamera,
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

