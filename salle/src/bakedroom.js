import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROOM } from './config.js';
import { COUCHE } from './reflet.js';

// Salle pré-éclairée : géométrie et lumière calculées dans Blender (salle/blender/salle_v2.py).
// Lumière enregistrée par source :
//   room_lm_a.png = écrans gauche / fond / droite (R, V, B), teintés en direct par la couleur des vidéos
//   room_lm_b.png = sol (R, teinté en direct), jour de la verrière (V, fixe), passage et sas éclairés (B, fixe)

const SURFACES = {           // l'ordre compte : « hallfloor » avant « hall »
  post: { color: 0x0a0a0b, roughness: 0.55, metalness: 0.0 },
  rock: { color: 0x2a2c31, roughness: 0.9, metalness: 0.0 },
  ceiling: { color: 0x58585c, roughness: 0.85, metalness: 0.0 },
  rig: { color: 0x3a3c40, roughness: 0.5, metalness: 0.6 },
  projector: { color: 0x15161a, roughness: 0.55, metalness: 0.2 },
  frame: { color: 0xc2c4c8, roughness: 0.35, metalness: 0.9 },
  hallfloor: { color: 0x060607, roughness: 0.5, metalness: 0.0 },   // sol de l'accueil : noir mat, reflets diffus (reflet.js, flou large)
  hallporte: { color: 0x050506, roughness: 0.9, metalness: 0.0 },
  hall: { color: 0x0a0a0b, roughness: 0.16, metalness: 0.0 },       // murs de l'accueil : même noir brillant que le sol
  plafond: { color: 0xd8d4cb, roughness: 0.7, metalness: 0.0 },   // plafond général blanc à moulures
  annex: new URLSearchParams(location.search).get('panneau') === 'bleu'
    ? { color: 0x000000, roughness: 0.8, metalness: 0.0, emissive: 0x0a4065, emissiveIntensity: 1 }   // ancien mur-écran bleu marine rétroéclairé (?panneau=bleu)
    : { color: 0x0c2152, roughness: 0.82, metalness: 0.0, emissive: 0x01040c },   // panneau d'accueil : bleu foncé mat, éclairé par trois spots au-dessus (addStaticLights)
  bone: { color: 0x9c907c, roughness: 0.7, metalness: 0.0 },
};
const LIGHTBOX = new THREE.Color(1.0, 0.9, 0.72).multiplyScalar(Number(new URLSearchParams(location.search).get('lumiere') ?? 0.5));   // plus faible ; ?lumiere= pour régler    // lumière blanche un peu jaune, derrière le mur-écran de l'accueil (même couleur que dans Blender)
const DOOR = new THREE.Color(1.0, 0.78, 0.5);

// Surfaces lumineuses fixes visibles (dans Blender elles ne servent qu'au calcul de la lumière)
function addStaticLights(scene) {
  const { length: L, width: W, hall } = ROOM;
  const glow = (color, k) => new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k) });
  const add = (w, h, m, pos, rx = 0, ry = 0) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    o.position.copy(pos); o.rotation.set(rx, ry, 0); scene.add(o); return o;
  };
  // (verrière retirée : plafond général blanc à moulures ; la lumière vient de derrière le mur-écran, sans source visible)
  // Trois spots au-dessus du panneau d'accueil (8,9 × 3,8 m, face avant à z = ecranZ - 0,25, tournée vers la salle d'expo) :
  // potences noires fixées sur le haut du panneau, têtes en avant, lumière blanche chaude rabattue sur le panneau.
  const q = new URLSearchParams(location.search);
  if (q.get('spotspanneau') === '0') return;
  const face = ROOM.ecranZ - 0.25, haut = 3.8, k = Number(q.get('spotspanneau') ?? 1);
  const noir = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.45, metalness: 0.4 });
  for (const x of [-2.9, 0, 2.9]) {
    const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), noir);
    bras.rotation.x = Math.PI / 2; bras.position.set(x, haut + 0.32, face - 0.36); scene.add(bras); bras.layers.enable(COUCHE);
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), noir);
    pied.position.set(x, haut + 0.16, face - 0.02); scene.add(pied); pied.layers.enable(COUCHE);
    const tete = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.16, 16), noir);
    // tête orientée dans l'axe du faisceau (vers le panneau), large ouverture en bas
    tete.position.set(x, haut + 0.30, face - 0.74); tete.rotation.x = -0.36; scene.add(tete); tete.layers.enable(COUCHE);
    // la SOURCE : une lentille allumée au bout de la tête (blanc chaud, non affectée par l'éclairage), plus un léger halo
    const lentille = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(3), toneMapped: false }));
    lentille.rotation.x = Math.PI / 2; lentille.position.y = -0.082; tete.add(lentille); lentille.layers.enable(COUCHE);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
    halo.rotation.x = Math.PI / 2; halo.position.y = -0.084; tete.add(halo); halo.layers.enable(COUCHE);
    const l = new THREE.SpotLight(0xffe7c8, 13 * k, 8, 0.8, 0.85, 1.6);
    l.position.set(x, haut + 0.24, face - 0.8);
    l.target.position.set(x, 1.9, face); scene.add(l, l.target); l.layers.enable(COUCHE);
  }
  // (grand spot derrière le panneau : retiré, demande)
}

export async function loadBakedRoom(scene, base = 'assets/') {
  const tl = new THREE.TextureLoader();
  const tex = (f) => tl.loadAsync(base + f).then((t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; return t; });
  const [gltf, lmA, lmB, meta] = await Promise.all([
    new GLTFLoader().loadAsync(base + 'room.glb'), tex('room_lm_a.png'), tex('room_lm_b.png'),
    fetch(base + 'room_lm.json').then((r) => r.json()),
  ]);

  const uniforms = {
    lmB: { value: lmB },
    uScale: { value: meta.scale * Math.PI }, // valeur calculée = E/π (albédo 1)
    cL: { value: new THREE.Color() }, cB: { value: new THREE.Color() },
    cR: { value: new THREE.Color() }, cF: { value: new THREE.Color() },
    cLB: { value: LIGHTBOX }, cD: { value: DOOR },
    uBleu: { value: new THREE.Color(0.03, 0.075, 0.30).multiplyScalar(Number(new URLSearchParams(location.search).get('ambiance') ?? 1)) },
    uZb: { value: ROOM.length / 2 },
    uPlafK: { value: Number(new URLSearchParams(location.search).get('plafondlum') ?? 1) },   // spots bleus derrière les écrans vers le plafond ; ?plafondlum=0 pour les couper
  };
  const chunk = THREE.ShaderChunk.lights_fragment_maps.replace(
    'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
    `vec3 a = lightMapTexel.rgb; a *= a;
     vec3 b = texture2D(lmB, vLightMapUv).rgb; b *= b;
     vec3 lightMapIrradiance = (a.r * cL + a.g * cB + a.b * cR + b.r * cF + b.g * cLB + b.b * cD) * uScale * lightMapIntensity;
     // ambiance bleue de la salle d'exposition et de son entrée : le plafond blanc (neutre, il n'éclaire pas) et les murs
     // la reçoivent ; elle s'éteint en douceur dans la salle d'accueil (lumière blanche un peu jaune derrière le mur-écran)
     lightMapIrradiance += uBleu * (1.0 - smoothstep(uZb - 1.0, uZb + 3.5, vMondeB.z)) * (0.55 + 0.45 * smoothstep(0.0, 8.0, vMondeB.y));`);

  // sol et murs de la salle d'accueil : noirs, sans l'ambiance bleue de la salle d'expo (elle leur donnait un voile violet
  // uniforme) ; ils ne montrent que des reflets (environnement capturé, spots, panneau)
  const NOIRS = ['hall', 'hallfloor'];
  // Plafond de la salle d'expo : éclairé par la lumière qui s'échappe du HAUT des écrans, par derrière, dirigée vers le
  // plafond (le long des trois murs d'écrans). Calculée ici, sans la lumière pré-calculée (ses ombres de creux faisaient
  // des bordures noires sur les moulures) : chaque face reçoit selon son orientation vers le haut des écrans, jamais noire.
  // Plafond de la salle d'expo : éclairé par PLUSIEURS SPOTS posés en haut des murs d'écrans, dirigés vers le plafond.
  // Chaque spot fait sa propre tache de lumière (ovale, bord doux) ; entre les taches, le plafond reste sombre.
  const SRC_PLAF = [];
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) SRC_PLAF.push([s * (ROOM.width / 2 + 0.3), ROOM.height + 0.05, -ROOM.length / 2 + (k + 0.5) * ROOM.length / 5, -s * 0.45, 0.0]);
  for (const s of [-1, 1]) SRC_PLAF.push([s * ROOM.width / 4, ROOM.height + 0.05, -ROOM.length / 2 - 0.3, 0.0, 0.45]);
  const PLAFOND = `
     {
       vec3 P = vMondeB, N = normalize(vNormB);
       float e = 0.0;
${SRC_PLAF.map(([x, y, z, ax, az]) => `       { vec3 v = vec3(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) - P; float d = length(v); vec3 l = v / max(d, 1e-3);
         float c = dot(-l, normalize(vec3(${ax.toFixed(2)}, 1.0, ${az.toFixed(2)})));
         e += smoothstep(0.80, 0.95, c) * (0.3 + 0.7 * max(dot(N, l), 0.0)) * 3.0 / (1.0 + d * d * 0.35); }`).join('\n')}
       float fondu = 1.0 - smoothstep(uZb + 0.8, uZb + 3.0, P.z);   // dans la salle d'accueil : sa propre lumière (au-delà du bout des écrans)
       vec3 bleuP = vec3(0.0024, 0.023, 0.1) * uPlafK;   // même bleu que les faisceaux des écrans
       lightMapIrradiance = mix(lightMapIrradiance, bleuP * (0.06 + 6.0 * e), fondu);
     }`;
  const mats = {};
  for (const [name, p] of Object.entries(SURFACES)) {
    const m = new THREE.MeshStandardMaterial({ ...p, lightMap: lmA, name });
    // plafond : plus aucune lumière bleue (ni la sienne, ni celle des écrans renvoyée par la capture de l'environnement)
    if (name === 'plafond') m.envMapIntensity = 0;   // pas de bleu parasite renvoyé par l'environnement
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec3 vMondeB; varying vec3 vNormB;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMondeB = (modelMatrix * vec4(transformed, 1.0)).xyz; vNormB = mat3(modelMatrix) * objectNormal;');
      sh.fragmentShader = 'uniform sampler2D lmB; uniform float uScale, uZb; uniform vec3 cL, cB, cR, cF, cLB, cD, uBleu; uniform float uPlafK;\nvarying vec3 vMondeB; varying vec3 vNormB;\n' +
        sh.fragmentShader.replace('#include <lights_fragment_maps>', NOIRS.includes(name) ? chunk.replace('lightMapIrradiance += uBleu', 'lightMapIrradiance += 0.0 * uBleu')
          : name === 'plafond' ? chunk.replace('irradiance += lightMapIrradiance;', PLAFOND + '\n\tirradiance += lightMapIrradiance;') : chunk);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `void main() {
        // bout des murs 3D qui dépassait de 30 cm dans l'accueil : retiré (le mur lisse de main.js fait l'angle)
        if (abs(vMondeB.x) > ${(ROOM.width / 2 + 0.02).toFixed(2)} && abs(vMondeB.x) < ${(ROOM.width / 2 + 0.7).toFixed(2)} && vMondeB.z < ${(ROOM.length / 2 + 0.4).toFixed(2)} && vMondeB.y < ${(ROOM.height + 0.2).toFixed(2)}) discard;`);
    };
    mats[name] = m;
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = Object.keys(mats).find((k) => o.material.name.startsWith(k));
    o.material = mats[key] || mats.hall;
    // La boîte de l'accueil (murs, sol, plafond) court sur toute la longueur, à 2,5 m derrière les écrans latéraux :
    // elle cachait ou coupait net les créatures derrière les vitres. Elle n'est plus dessinée là où l'on voit à travers
    // un écran (pochoir ≠ 1, après les hublots), comme les corps des murs (edges.js).
    // seul le sol (dans le plan de l'écran du sol) attend encore les hublots : les murs et le plafond se dessinent AVANT,
    // le hublot ne pose son pochoir que là où il est vraiment devant (plus de bord du plafond qui clignote)
    if (o.material.name === 'hallfloor') o.renderOrder = 55;
    if (o.material.name === 'annex') o.layers.enable(COUCHE);   // le panneau se reflète dans le sol noir (reflet.js)
  });
  for (const k of ['hallfloor']) if (mats[k]) Object.assign(mats[k], { stencilWrite: true, stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
  scene.add(gltf.scene);
  addStaticLights(scene);

  return {
    root: gltf.scene,
    setColors({ left, back, right, floor }) {
      uniforms.cL.value.copy(left); uniforms.cB.value.copy(back);
      uniforms.cR.value.copy(right); uniforms.cF.value.copy(floor);
    },
  };
}
