import * as THREE from 'three';
import { ROOM } from './config.js';

// Arêtes nettes : les gaussiennes sont floues par nature sur les lignes droites. Tout ce qui doit être
// « net comme un vrai objet » est redessiné ici en vraie géométrie, par-dessus la salle en gaussiennes :
// haut et extrémités des murs d'écrans, barres et projecteurs de la technique, suspentes.
// Les gaussiennes de ces zones sont retirées au nettoyage (tools/clean_splat.py), pour ne pas faire doublon.
// Mêmes positions que salle/blender/salle_v2.py.
export function crispEdges(scene) {
  const { length: L, width: W, height: H } = ROOM;
  const HALL_H = ROOM.hall.height ?? 14;
  const g = new THREE.Group(); g.name = 'aretes'; scene.add(g);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.2 });
  const rig = new THREE.MeshStandardMaterial({ color: 0x34363b, roughness: 0.45, metalness: 0.7 });
  const proj = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.5, metalness: 0.3 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); if (m.userData.horsEcran) o.renderOrder = 55; return o; };

  // épaisseur des murs d'écrans : chant supérieur et chants d'extrémité, bien nets
  const T = 0.3;
  for (const s of [-1, 1]) {
    box(T, 0.04, L + T, dark, s * (W / 2 + T / 2), H + 0.02, -T / 2);   // dessus des murs latéraux
    // (chant côté entrée retiré : à l'entrée, le mur lisse de l'accueil (main.js) fait l'angle avec le bord des écrans)
  }
  box(W + 2 * T, 0.04, T, dark, 0, H + 0.02, -L / 2 - T / 2);          // dessus du mur du fond

  // corps des murs d'écrans : pleins et opaques, posés sur le sol. Les écrans sont des hublots (on voit le dehors à
  // travers) : sans ce volume, depuis la salle d'accueil on voyait l'eau par l'arrière des murs et sous leur bas.
  // Entre deux écrans, la séparation est un ENFONCEMENT (fente de 30 cm, profonde de 25 cm), pas un pilier.
  const corps = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.8, metalness: 0.05 });
  const fond = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, metalness: 0.0 });
  // dessinés APRÈS les hublots et seulement hors d'eux (pochoir ≠ 1) : vus de la salle, ils ne cachent jamais
  // le monde extérieur ni les créatures qui nagent derrière les écrans ; vus de dehors, ils ferment le mur.
  for (const m of [corps, fond]) Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp, userData: { horsEcran: true } });
  const e = T - 0.02, P = ROOM.post, PR = 0.25, bay = L / ROOM.bays;   // retrait de 2 cm derrière l'écran ; profondeur de la fente
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 + 0.02 + e / 2), y = (H + 0.06) / 2 - 0.04;
    for (let k = 0; k < ROOM.bays; k++) {                               // un bloc par écran (jointifs si P = 0)
      const z0 = -L / 2 + k * bay + (k > 0 ? P / 2 : -T), z1 = -L / 2 + (k + 1) * bay - (k < ROOM.bays - 1 ? P / 2 : 0);
      box(e, H + 0.06, z1 - z0, corps, cx, y, (z0 + z1) / 2);
    }
    if (P > 0) for (let k = 1; k < ROOM.bays; k++) {                    // fond et sol de chaque fente
      const z = -L / 2 + k * bay;
      box(0.06, H + 0.06, P + 0.02, fond, s * (W / 2 + PR + 0.03), y, z);
      box(PR + 0.02, 0.02, P, fond, s * (W / 2 + PR / 2), 0.01, z);
    }
  }
  box(W + 2 * T, H + 0.06, e, corps, 0, (H + 0.06) / 2 - 0.04, -L / 2 - 0.02 - e / 2);

  // technique au-dessus de la nef retirée (plafond blanc à moulures, sans spots ni rails)
  if (new URLSearchParams(location.search).get('rails') === '1') for (let i = 0; i < 5; i++) {
    const z = L / 2 - (i + 0.5) * L / 5;
    box(W - 0.6, 0.06, 0.06, rig, 0, H - 0.5, z);
    for (const x of [-W / 4, 0, W / 4]) box(0.4, 0.2, 0.45, proj, x, H - 0.64, z);
    // (suspentes verticales retirées : elles semblaient ne reposer sur rien)
  }
  return g;
}
