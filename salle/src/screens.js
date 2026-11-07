import * as THREE from 'three';
import { ROOM, MEDIA } from './config.js';
import { makeVideo, SliceColors } from './media.js';

// Écrans plats : murs longs, fond et sol, du sol jusqu'en haut.
// Les trois murs forment une seule bande continue (gauche -> fond -> droite) sur laquelle
// le panorama est posé sans déformation, centré en hauteur ; le reste est noir (abysses).
const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function stripMaterial(tex, s0, len, total, H, band0, bandH) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uS0: { value: s0 }, uLen: { value: len }, uTotal: { value: total }, uH: { value: H }, uB0: { value: band0 }, uBH: { value: bandH } },
    vertexShader: vert,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uS0, uLen, uTotal, uH, uB0, uBH; varying vec2 vUv;
      void main(){
        float u = (uS0 + vUv.x * uLen) / uTotal;
        float v = (vUv.y * uH - uB0) / uBH;
        vec3 c = (v < 0.0 || v > 1.0) ? vec3(0.0) : texture2D(map, vec2(u, v)).rgb;
        c = max(c - 0.02, 0.0) / 0.98; // noir pur : retire le voile gris de compression autour des créatures
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function floorMaterial(tex, crop) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uCrop: { value: crop } },
    vertexShader: vert,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uCrop; varying vec2 vUv;
      void main(){ gl_FragColor = vec4(texture2D(map, vec2(0.5 + (vUv.y - 0.5) * uCrop, vUv.x)).rgb, 1.0); }`,
  });
}

export class Screens {
  constructor(scene) {
    const { length: L, width: W, height: H, bays, backH } = ROOM;
    this.pano = makeVideo(MEDIA.panorama);
    this.floorVid = makeVideo(MEDIA.floor);
    const total = 2 * L + W;                    // 50 m de bande
    const bandH = total / 8;                    // panorama 8:1 sans déformation
    const band0 = (H - bandH) / 2;

    const add = (w, h, m, pos, ry, rx = 0) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.copy(pos); o.rotation.set(rx, ry, 0, 'YXZ'); scene.add(o); return o; };
    add(L, H, stripMaterial(this.pano.tex, 0, L, total, H, band0, bandH), new THREE.Vector3(-W / 2, H / 2, 0), Math.PI / 2);
    add(W, backH, stripMaterial(this.pano.tex, L, W, total, backH, band0, bandH), new THREE.Vector3(0, backH / 2, -L / 2), 0);
    add(L, H, stripMaterial(this.pano.tex, L + W, L, total, H, band0, bandH), new THREE.Vector3(W / 2, H / 2, 0), -Math.PI / 2);
    add(W, L, floorMaterial(this.floorVid.tex, (L / W) / (960 / 274)), new THREE.Vector3(0, 0, 0), 0, -Math.PI / 2);

    // Lumière émise par les écrans (mesurée, appliquée à la salle pré-éclairée) : une source par travée, une pour le fond, une pour le sol.
    // Couleur = moyenne de la portion d'image correspondante (1 colonne d'échantillon par mètre).
    this.sampler = new SliceColors(this.pano.video, total);
    this.floorSampler = new SliceColors(this.floorVid.video, 1);
    this.lights = [];
    const bay = L / bays;
    const light = (w, h, pos, normal, s0, len) => {
      this.lights.push({ color: new THREE.Color(), s0, len, center: pos.clone(), normal, area: w * h });
    };
    for (let k = 0; k < bays; k++) light(bay, H, new THREE.Vector3(-W / 2, H / 2, L / 2 - (k + 0.5) * bay), new THREE.Vector3(1, 0, 0), k * bay, bay);
    light(W, backH, new THREE.Vector3(0, backH / 2, -L / 2), new THREE.Vector3(0, 0, 1), L, W);
    for (let k = 0; k < bays; k++) light(bay, H, new THREE.Vector3(W / 2, H / 2, -L / 2 + (k + 0.5) * bay), new THREE.Vector3(-1, 0, 0), L + W + k * bay, bay);
    light(W, L, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), -1, 0);
    this.bandFrac = bandH / H;
  }

  get videos() { return [this.pano.video, this.floorVid.video]; }

  update(frame) {
    if (frame % 6) return;
    this.sampler.update();
    this.floorSampler.update();
    const tmp = new THREE.Color();
    for (const o of this.lights) {
      if (o.s0 < 0) { o.color.copy(this.floorSampler.colors[0]); continue; }
      tmp.setRGB(0, 0, 0);
      const a = Math.floor(o.s0), b = Math.ceil(o.s0 + o.len);
      for (let i = a; i < b; i++) tmp.add(this.sampler.colors[i]);
      o.color.copy(tmp.multiplyScalar(this.bandFrac / (b - a))); // seule la bande centrale émet
    }
    // moyennes par groupe pour la salle pré-éclairée : gauche, fond, droite, sol
    const avg = (list) => list.reduce((c, o) => c.add(o.color), new THREE.Color(0, 0, 0)).multiplyScalar(1 / list.length);
    const n = ROOM.bays;
    this.groups = { left: avg(this.lights.slice(0, n)), back: this.lights[n].color, right: avg(this.lights.slice(n + 1, 2 * n + 1)), floor: this.lights[2 * n + 1].color };
  }

  // Luminance des écrans dans la direction du regard (exposition automatique)
  viewLuminance(camera) {
    const f = new THREE.Vector3(), to = new THREE.Vector3();
    camera.getWorldDirection(f);
    let sum = 0, wsum = 0;
    for (const o of this.lights) {
      to.copy(o.center).sub(camera.position);
      const d2 = to.lengthSq();
      const w = Math.pow(Math.max(0, f.dot(to.normalize())), 4) * o.area / (1 + d2 * 0.05) + 1e-4;
      const c = o.color;
      sum += (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * w;
      wsum += w;
    }
    return sum / wsum;
  }
}
