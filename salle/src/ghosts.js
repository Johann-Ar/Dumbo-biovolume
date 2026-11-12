import * as THREE from 'three';
import { ROOM } from './config.js';

// Visiteurs fantômes : de vrais visiteurs de l'exposition, découpés dans la vidéo 4K
// (masques de la capture), posés dans la salle en silhouettes translucides.
// Ils s'effacent quand on s'approche : ils donnent de la vie sans jamais boucher la vue.
const SPOTS = [ // x, z (m), image
  [-2.2, 4.0, 0], [1.8, -1.5, 1], [-0.6, -6.5, 2], [2.6, -9.0, 3],
  [-2.8, 9.0, 4], [3.0, 13.5, 5], [-4.5, 15.0, 0], [0.4, 2.0, 3],
];

export function addGhosts(scene, base = 'assets/ghosts/') {
  const tl = new THREE.TextureLoader();
  const ghosts = SPOTS.filter(([, z]) => z < ROOM.length / 2 + 6).map(([x, z, k], i) => {
    const tex = tl.load(`${base}g${k}.png`, (t) => {
      s.scale.set(1.72 * t.image.width / t.image.height, 1.72, 1);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xc8dcff });
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0);                 // les pieds au sol
    s.position.set(x, 0.02, z);
    s.userData.phase = i * 1.7;
    scene.add(s);
    return s;
  });

  return function update(camera, t) {
    for (const s of ghosts) {
      const d = s.position.distanceTo(camera.position);
      const near = THREE.MathUtils.smoothstep(d, 1.6, 4.5);          // s'efface de près
      const breath = 0.85 + 0.15 * Math.sin(t * 0.6 + s.userData.phase);
      s.material.opacity = 0.32 * near * breath;
      s.position.y = 0.02 + 0.015 * Math.sin(t * 0.4 + s.userData.phase);
    }
  };
}
