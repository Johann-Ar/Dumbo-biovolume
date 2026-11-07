import * as THREE from 'three';
import { ROOM, POV } from './config.js';

// Regard à la première personne, façon lunettes-caméra : tête qui a du poids (inertie),
// pas qui font légèrement monter/descendre la vue, micro-tremblements, respiration.
// Clavier : ZQSD (AZERTY) = WASD (QWERTY) = flèches, via la position physique des touches.

const KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

// bruit lisse 1D (somme de sinus incommensurables)
const wobble = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.7) * 0.3 + Math.sin(t * c + 4.1) * 0.2;

export class FirstPerson {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector2(POV.start.x, POV.start.z);
    this.vel = new THREE.Vector2();
    this.yaw = this.tYaw = POV.start.yaw;
    this.pitch = this.tPitch = POV.start.pitch;
    this.phase = 0;
    this.keys = new Set();
    this.enabled = false;
    this.slow = false;
    this.touchMove = null;
    this.auto = 0; // marche automatique (démo / tests)
    this.bind();
  }

  bind() {
    addEventListener('keydown', (e) => { if (KEYS[e.code]) { this.keys.add(e.code); e.preventDefault(); } if (e.key === 'Shift') this.slow = true; });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.key === 'Shift') this.slow = false; });
    addEventListener('blur', () => this.keys.clear());

    const look = (dx, dy, k = 0.0022) => {
      this.tYaw -= dx * k;
      this.tPitch = THREE.MathUtils.clamp(this.tPitch - dy * k, -1.2, 1.2);
    };
    let drag = null;
    this.dom.addEventListener('mousedown', (e) => { if (this.enabled && document.pointerLockElement !== this.dom) drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { drag = null; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === this.dom) look(e.movementX, e.movementY);
      else if (drag) { look(e.clientX - drag.x, e.clientY - drag.y, 0.004); drag = { x: e.clientX, y: e.clientY }; }
    });

    // Tactile : moitié gauche = marcher, moitié droite = regarder
    const touches = new Map();
    this.dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, move: t.clientX < innerWidth / 2 });
    }, { passive: true });
    this.dom.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const s = touches.get(t.identifier);
        if (!s) continue;
        if (s.move) this.touchMove = [THREE.MathUtils.clamp((t.clientX - s.x0) / 60, -1, 1), THREE.MathUtils.clamp(-(t.clientY - s.y0) / 60, -1, 1)];
        else look(t.clientX - s.x, t.clientY - s.y, 0.005);
        s.x = t.clientX; s.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) { if (touches.get(t.identifier)?.move) this.touchMove = null; touches.delete(t.identifier); } };
    this.dom.addEventListener('touchend', end);
    this.dom.addEventListener('touchcancel', end);
  }

  // Verrouillage de la souris si le navigateur l'accepte ; sinon on regarde en cliquant-glissant.
  lock() {
    try { Promise.resolve(this.dom.requestPointerLock?.()).catch(() => {}); } catch { /* glisser pour regarder */ }
  }

  collide(x, z, ox, oz) {
    const W = ROOM.width / 2 - POV.margin, Lb = -ROOM.length / 2 + POV.margin, front = ROOM.length / 2 - 0.35;
    const doorX = ROOM.door.w / 2 - 0.4, end = ROOM.length / 2 + ROOM.corridorLen - 0.4;
    if (z > front) {
      if (Math.abs(x) > doorX) { if (oz <= front) z = front; else x = THREE.MathUtils.clamp(x, -doorX, doorX); }
      z = Math.min(z, end);
    }
    if (z <= front) x = THREE.MathUtils.clamp(x, -W, W);
    z = Math.max(z, Lb);
    return [x, z];
  }

  update(dt, t) {
    // Entrée de direction
    let ix = 0, iz = 0;
    if (this.enabled) {
      for (const k of this.keys) { ix += KEYS[k][0]; iz += KEYS[k][1]; }
      if (this.touchMove) { ix += this.touchMove[0]; iz += this.touchMove[1]; }
    }
    if (this.auto) iz = Math.max(iz, this.auto);
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    const speed = this.slow ? POV.slow : POV.walk;
    const fwd = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const target = fwd.multiplyScalar(iz * speed).add(right.multiplyScalar(ix * speed));
    const k = 1 - Math.exp(-dt * (target.lengthSq() > 0 ? 3.2 : 4.5)); // départ progressif, arrêt un peu plus franc
    this.vel.lerp(target, k);

    const [nx, nz] = this.collide(this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt, this.pos.x, this.pos.y);
    this.vel.set((nx - this.pos.x) / Math.max(dt, 1e-4), (nz - this.pos.y) / Math.max(dt, 1e-4));
    this.pos.set(nx, nz);

    // Tête : inertie du regard
    const kl = 1 - Math.exp(-dt * 11);
    this.yaw += (this.tYaw - this.yaw) * kl;
    this.pitch += (this.tPitch - this.pitch) * kl;

    // Pas : ~1,8 pas/s à 1,3 m/s
    const v = this.vel.length();
    const a = Math.min(1, v / POV.walk);
    this.phase += dt * v / 0.72 * Math.PI;
    this.stepAmp = THREE.MathUtils.lerp(this.stepAmp ?? 0, a, 1 - Math.exp(-dt * 5));
    const s = this.stepAmp;
    const bobY = (Math.abs(Math.sin(this.phase)) - 0.63) * 0.045 * s;
    const bobX = Math.sin(this.phase) * 0.018 * s;
    const roll = Math.sin(this.phase) * 0.006 * s;

    // Tenue « à la main/à la tête » : petits mouvements lents, plus respiration
    const jy = wobble(t, 0.9, 1.7, 2.9) * 0.0035, jp = wobble(t + 10, 1.1, 2.3, 3.7) * 0.003, jr = wobble(t + 20, 0.7, 1.9, 3.1) * 0.003;
    const breath = Math.sin(t * Math.PI * 2 * 0.22) * 0.0025;

    const cam = this.camera;
    const sideX = Math.cos(this.yaw), sideZ = -Math.sin(this.yaw);
    cam.position.set(this.pos.x + sideX * bobX, POV.eye + bobY + breath * 0.4, this.pos.y + sideZ * bobX);
    cam.rotation.set(this.pitch + jp + breath + bobY * 0.15, this.yaw + jy, roll + jr, 'YXZ');
  }
}
