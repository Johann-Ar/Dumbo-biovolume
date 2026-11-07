import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import { POV } from './config.js';
import { loadBakedRoom } from './bakedroom.js';
import { Screens } from './screens.js';
import { FirstPerson } from './pov.js';
import { makeComposer } from './postfx.js';

const params = new URLSearchParams(location.search);

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(POV.fov, innerWidth / innerHeight, 0.03, 200);
scene.add(camera);

const spark = new SparkRenderer({ renderer });
scene.add(spark);


// ---------- Salle ----------
const room = await loadBakedRoom(scene);
const screens = new Screens(scene);

// ---------- Reflets des écrans sur les montants et le caisson métalliques ----------
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.05, 80, cubeRT);
cubeCam.position.set(0, 2.0, 0);
scene.add(cubeCam);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function captureEnv() {
  cubeCam.update(renderer, scene);
  const next = pmrem.fromCubemap(cubeRT.texture);
  scene.environment = next.texture;
  scene.environmentIntensity = 0.8;
  envRT?.dispose();
  envRT = next;
}

// ---------- Regard ----------
const pov = new FirstPerson(camera, renderer.domElement);
const cam = params.get('cam'); // ?cam=x,z,yawDeg,pitchDeg (repères de comparaison avec les photos)
if (cam) {
  const [x, z, yaw, pitch] = cam.split(',').map(Number);
  pov.pos.set(x, z);
  pov.yaw = pov.tYaw = THREE.MathUtils.degToRad(yaw || 0);
  pov.pitch = pov.tPitch = THREE.MathUtils.degToRad(pitch || 0);
}
if (params.has('walk')) pov.auto = Number(params.get('walk')) || 1;

const fx = makeComposer(renderer, scene, camera);
const useFx = params.get('fx') !== '0';

// ---------- Entrée ----------
const intro = document.getElementById('intro');
const hud = document.getElementById('hud');
function enter() {
  screens.videos.forEach((v) => v.play().catch(() => {}));
  intro.classList.add('hidden');
  hud.classList.add('visible');
  pov.enabled = true;
  pov.lock();
}
intro.addEventListener('click', enter);
renderer.domElement.addEventListener('click', () => { if (pov.enabled && document.pointerLockElement !== renderer.domElement) pov.lock(); });
if (params.has('auto')) enter();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx.resize();
});

// ---------- Boucle ----------
const clock = new THREE.Clock();
let frame = 0, exposure = 1.2, nextCapture = 0.5, prevYaw = 0, prevPitch = 0;
const stats = { fps: 0, acc: 0, n: 0 };

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  frame++;

  pov.update(dt, t);
  screens.update(frame);
  if (screens.groups) room.setColors(screens.groups);

  // Exposition automatique, lente comme celle d'un petit capteur (≈ 1 s)
  const L = screens.viewLuminance(camera);
  // plage étroite : le noir des abysses doit rester noir, l'œil s'habitue juste un peu
  const target = THREE.MathUtils.clamp(0.06 / (L + 0.03), 0.9, 1.5);
  exposure += (target - exposure) * (1 - Math.exp(-dt * 1.1));
  renderer.toneMappingExposure = exposure;

  if (t > nextCapture) { captureEnv(); nextCapture = t + (t < 10 ? 2 : 6); }

  fx.lens.uniforms.uTime.value = t;
  // Flou de mouvement : décalage de l'image pendant la moitié d'une image (obturateur à 180°)
  const tv = Math.tan(THREE.MathUtils.degToRad(POV.fov / 2));
  const dYaw = camera.rotation.y - prevYaw, dPitch = camera.rotation.x - prevPitch;
  prevYaw = camera.rotation.y; prevPitch = camera.rotation.x;
  fx.lens.uniforms.uBlur.value.set(-dYaw / tv * 0.5, dPitch / tv * 0.5);
  if (useFx) fx.composer.render(); else renderer.render(scene, camera);

  stats.acc += dt; stats.n++;
  if (stats.acc > 1) { stats.fps = stats.n / stats.acc; stats.acc = 0; stats.n = 0; }
});

// Accès pour le débogage depuis la console
window.__salle = { THREE, scene, camera, renderer, screens, pov, fx, stats, get exposure() { return exposure; } };
