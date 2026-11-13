import * as THREE from 'three';
import { SparkRenderer, SplatMesh, SplatEdit, SplatEditSdf } from '@sparkjsdev/spark';
import { POV, ROOM } from './config.js';
import { loadBakedRoom } from './bakedroom.js';
import { Screens } from './screens.js';
import { FirstPerson } from './pov.js';
import { makeComposer } from './postfx.js';
import { addGhosts } from './ghosts.js';
import { addVisitors } from './visitors.js';
import { crispEdges } from './edges.js';
import { addCreatures } from './creatures.js';
import { seabed, PHARES } from './dehors.js';
import { ambiance } from './son.js';
import { presentationScreen, XE } from './presentation.js';
import { refletSol } from './reflet.js';

const params = new URLSearchParams(location.search);
const intro = document.getElementById('intro');
const hud = document.getElementById('hud');
const btn = intro.querySelector('.enter');
// Ordre : écran de chargement (poulpe) dès l'ouverture ; une fois la salle prête, l'accueil apparaît posé sur la salle
// rendue en direct (caméra fixe au point de départ, derrière le voile flou) ; au clic sur Play, le voile et les textes
// partent vers la gauche et on est déjà dans la salle, sans coupure.
function montreChargement() {
  const c = document.getElementById('chargement'), v = document.getElementById('poulpe-charge');
  c?.classList.remove('fini', 'depart');
  if (!v) return;
  v.classList.remove('fini'); v.style.transition = ''; v.style.opacity = ''; v.play().catch(() => {});
  let avant = -1;   // le poulpe du chargement ne doit jamais se figer : s'il est en pause ou n'avance plus, on le relance
  const garde = setInterval(() => {
    if (v.classList.contains('fini')) { clearInterval(garde); return; }
    if (v.paused || v.currentTime === avant) v.play().catch(() => {});
    avant = v.currentTime;
  }, 500);
}
montreChargement();
document.getElementById('poulpe')?.pause();   // logo de l'accueil figé (le poulpe du chargement vient s'y poser)
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) document.body.classList.add('touch');
// Mouvements réduits : préférence du système, ou ?calme
const calm = params.has('calme') || matchMedia('(prefers-reduced-motion: reduce)').matches;
// Version : salle en gaussiennes par défaut (rendu Blender), ?maillage pour l'ancienne salle en volumes
const useSplat = !params.has('maillage');

// ---------- Rendu (avec message clair si la 3D est impossible) ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2');
} catch (e) {
  btn.style.display = 'none';
  document.getElementById('poulpe-charge')?.classList.add('fini');
  document.getElementById('chargement')?.classList.add('fini');   // pas de chargement possible : l'accueil explique pourquoi
  intro.querySelector('.enter-label')?.remove();
  intro.querySelector('.panel').insertAdjacentHTML('beforeend',
    '<p class="welcome-text notice">Ce navigateur ne peut pas afficher la salle en 3D. Essaie avec une version récente de Chrome, Safari, Firefox ou Edge, avec l\'accélération graphique activée.</p>' +
    '<p class="welcome-note">This browser cannot display the room in 3D. Please try a recent Chrome, Safari, Firefox or Edge.</p>');
  throw e;
}
const MAX_PR = Math.min(devicePixelRatio, coarse ? 1.25 : 1.5);
let pixelRatio = MAX_PR;
const MIN_PR = Math.min(MAX_PR, Number(params.get('netete') ?? 1));   // ?netete=0.7 : ancien comportement (plus fluide, plus flou)
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// En portrait (téléphone, comme une vidéo filmée en vertical), champ horizontal d'au moins 56°.
const fovFor = (aspect) => aspect >= 1 ? POV.fov
  : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(28)) / aspect)));
const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.03, 200);
scene.add(camera);
const spark = new SparkRenderer({ renderer });
spark.renderOrder = 20;   // gaussiennes après les hublots (écrans.js) : rien de la salle n'est effacé
scene.add(spark);

// ---------- Salle ----------
let lueursSalle = null, derniereLueur = -1, ambSalle = new THREE.Color(1, 1, 1);   // lumière des créatures sur la salle ; teinte d'ambiance de la salle d'expo
const room = await loadBakedRoom(scene);
const ghosts = params.has('ghosts') ? addGhosts(scene) : null;
if (useSplat) {
  // fichier compressé s'il existe (chargement plus rapide), sinon fichier complet
  const small = 'assets/room_splat.compressed.ply';
  const url = (await fetch(small, { method: 'HEAD' }).then((r) => r.ok, () => false)) ? small : 'assets/room_splat.ply';
  const splat = new SplatMesh({ url });
  splat.rotation.x = -Math.PI / 2;   // repère Blender (z vers le haut) -> page (y vers le haut)
  // lumières de la salle un peu baissées (ambiance plus sombre) ; ?lumiere=1 : luminosité d'origine
  // Ambiance des photos de la vraie salle : tout baigne dans le bleu des projections (plafond, rails, piliers).
  // ?lumiere=1 : luminosité ; ?bleu=0 : sans teinte bleue.
  const lum = Number(params.get('lumiere') ?? 0.95), BL = Number(params.get('bleu') ?? 1);
  const AMB = new THREE.Color(1 - 0.42 * BL, 1 - 0.1 * BL, 1 + 0.75 * BL).multiplyScalar(lum);
  splat.recolor = AMB.clone();
  // suspentes verticales (rendues dans Blender) effacées : elles semblaient ne reposer sur rien
  const { length: L, width: W, height: H } = ROOM, HH = ROOM.hall.height ?? 14, hs = (HH - H - 0.4) / 2;
  const gommes = [];
  const gomme = (x, y, z, sx, sy, sz) => { const b = new SplatEditSdf({ type: 'box', opacity: 0 }); b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.updateMatrixWorld(true); gommes.push(b); };
  // Plafond général blanc à moulures (modèle Blender) : tout ce qui est au-dessus des murs d'écrans (verrière, plafond
  // reconstruit) est retiré, ainsi que les rails et projecteurs sous le plafond (pas de spots).
  gomme(0, H + 0.15 + 8, 0, ROOM.hall.width / 2 + 3, 8, L / 2 + 6);
  if (params.get('rails') !== '1') gomme(0, H - 0.3, 0, W / 2 - 0.2, 0.75, L / 2 - 0.1);   // rails, projecteurs et leurs attaches
  // fentes noires entre deux écrans (montants) : retirées sur toute la hauteur (murs d'images continus)
  for (const sx of [-1, 1]) {
    if (!ROOM.post) for (let k = 1; k < ROOM.bays; k++) gomme(sx * (W / 2 + 0.15), H / 2, -L / 2 + k * L / ROOM.bays, 0.4, H / 2 + 0.1, 0.32);
    // chant des murs côté entrée : les gaussiennes bavaient en bleu ; remplacé par un chant net (edges.js)
    gomme(sx * (W / 2 + 0.3), H / 2, L / 2 + 0.05, 0.55, H / 2 + 0.3, 0.4);
    // jonction écrans / accueil : toutes les gaussiennes autour du mur lisse retirées (plus d'amas de texture)
    gomme(sx * (W / 2 + 1.35), H / 2 + 0.3, L / 2 + 0.25, 1.45, H / 2 + 0.9, 0.55);
  }
  // limite de l'écran du sol à l'entrée : liseré de gaussiennes bleues baveuses retiré sur toute la largeur du seuil
  gomme(0, 0.05, L / 2 + 0.1, W / 2 + 0.6, 0.3, 0.45);
  if (false) for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    const b = new SplatEditSdf({ type: 'box', opacity: 0 });
    b.position.set(sx * (W / 2 - 0.6), H + 0.4 + hs + 0.05, L / 2 - (i + 0.5) * L / 5);
    b.scale.set(0.09, hs + 0.1, 0.09); b.updateMatrixWorld(true); gommes.push(b);
  }
  // écran de présentation (salle d'accueil) : les gaussiennes de la face bleue qui débordent devant l'image sont retirées
  const ecran = new SplatEditSdf({ type: 'box', opacity: 0 });
  // le sas entier (bloc + face) suit l'écran recentré : ses gaussiennes, restées à l'ancienne place (x 2,5), sont toutes retirées
  ecran.position.set(2.5 - (2.5 - XE) / 2, 1.7, 20.25); ecran.scale.set(4.0 + (2.5 - XE) / 2 + 0.3, 1.62, 1.95); ecran.updateMatrixWorld(true);
  gommes.push(ecran);
  // bas des murs d'écrans : pieds clairs des montants et liseré de sol en gaussiennes retirés (le mur rejoint le sol net,
  // montants et plinthe sombres redessinés dans edges.js)
  for (const sx of [-1, 1]) {
    for (let k = 1; k < ROOM.bays; k++) {
      const pied = new SplatEditSdf({ type: 'box', opacity: 0 });
      pied.position.set(sx * (W / 2 - 0.1), 0.45, -L / 2 + k * L / ROOM.bays); pied.scale.set(0.45, 0.6, 0.45); pied.updateMatrixWorld(true); gommes.push(pied);
    }
    const bord = new SplatEditSdf({ type: 'box', opacity: 0 });
    bord.position.set(sx * (W / 2 - 0.1), 0.04, 0); bord.scale.set(0.3, 0.12, L); bord.updateMatrixWorld(true); gommes.push(bord);
  }
  // entre le haut des écrans et le plafond (modélisé) : plus aucune gaussienne (taches bleu clair flottantes, surtout
  // dans les angles de l'écran du fond)
  const hautEcrans = new SplatEditSdf({ type: 'box', opacity: 0 });
  // de 4 m jusqu'au-dessus du plafond, sur toute la nef et derrière les écrans : les gaussiennes sombres du scan, dessinées
  // PAR-DESSUS les hublots, faisaient une bordure noire en haut des écrans qui coupait les créatures
  { const z0 = -L / 2 - 1.5, z1 = L / 2 + 0.2;
    hautEcrans.position.set(0, 7.8, (z0 + z1) / 2); hautEcrans.scale.set(W / 2 + 1.5, 3.8, (z1 - z0) / 2); hautEcrans.updateMatrixWorld(true); }
  if (params.get('hautgauss') !== '1') gommes.push(hautEcrans);
  // sol de la salle d'accueil : comme le vrai, clair, lisse et uniforme (résine mate, sans dalles ni joints).
  // Les gaussiennes du sol (dalles brunes) sont retirées ; le sol pré-éclairé (même lumière calculée) le remplace.
  const solAccueil = new SplatEditSdf({ type: 'box', opacity: 0 });
  solAccueil.position.set(0, 0, L / 2 + 8.05); solAccueil.scale.set(13, 0.14, 8); solAccueil.updateMatrixWorld(true);
  if (params.get('solaccueil') !== '0') gommes.push(solAccueil);
  // Salle d'accueil : modélisée au propre dans Blender (salle_v2.py) ; ses gaussiennes, illisibles une fois nettoyées
  // des flottants, sont toutes retirées (devant l'ouverture et de part et d'autre de la nef). ?hallgauss=1 : les garder.
  if (params.get('hallgauss') !== '1') {
    const HL = ROOM.hall;
    for (const [x, y, z, sx, sy, sz] of [
      [0, HL.height / 2, L / 2 + 0.35 + (HL.depth + 1) / 2, HL.width / 2 + 1, HL.height / 2 + 2, (HL.depth + 1) / 2],
      [-(W / 2 + 0.65 + HL.width / 2 + 1) / 2, HL.height / 2, 0, (HL.width / 2 + 1 - W / 2 - 0.65) / 2, HL.height / 2 + 2, L / 2 + 5],
      [(W / 2 + 0.65 + HL.width / 2 + 1) / 2, HL.height / 2, 0, (HL.width / 2 + 1 - W / 2 - 0.65) / 2, HL.height / 2 + 2, L / 2 + 5],
    ]) {
      const b = new SplatEditSdf({ type: 'box', opacity: 0 });
      b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.updateMatrixWorld(true); gommes.push(b);
    }
  }
  splat.edits = [new SplatEdit({ rgbaBlendMode: 'multiply', softEdge: 0.02, sdfs: gommes })];
  // Salle d'accueil CLAIRE, couleurs proches du réel (pierre beige, plafond chaud ; pas blanc) (contraste avec la salle d'expo plongée dans le noir) : murs, plafond, piliers du hall
  // éclaircis. Boîte = tout le hall, au-delà de l'ouverture de la salle d'expo ; bord doux. ?accueilclair=1 : d'origine.
  const CLAIR = Number(params.get('accueilclair') ?? 0.32);
  if (CLAIR !== 1) {
    // boîtes : le hall entier + le mur du hall côté salle d'expo (de part et d'autre de l'ouverture et au-dessus),
    // sans jamais toucher la nef sombre
    const boites = [[0, 8, L / 2 + 0.6 + 8.5, 14, 9, 8.5], [-(W / 2 + 0.9 + 14) / 2, 8, L / 2 + 0.2, (14 - W / 2 - 0.9) / 2, 9, 0.9],
      [(W / 2 + 0.9 + 14) / 2, 8, L / 2 + 0.2, (14 - W / 2 - 0.9) / 2, 9, 0.9], [0, (H + 0.6 + 17) / 2, L / 2 + 0.2, W / 2 + 1, (17 - H - 0.6) / 2, 0.9]];
    const sdf = (c, op) => boites.map(([x, y, z, sx, sy, sz]) => {
      const b = new SplatEditSdf({ type: 'box', color: c, ...(op === undefined ? {} : { opacity: op }) });
      b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.updateMatrixWorld(true); return b;
    });
    splat.edits.push(new SplatEdit({ rgbaBlendMode: 'multiply', softEdge: 0.4, sdfs: sdf(new THREE.Color(CLAIR / AMB.r, CLAIR * 0.94 / AMB.g, CLAIR * 0.84 / AMB.b)) }));   // le bleu de la salle d'expo est retiré dans le hall   // pierre beige chaude (vidéo réelle : capture-salle/salle_immersion)
    // les taches très sombres restent sombres en multipliant : on relève aussi le noir (murs blancs, pas gris sale)
    splat.edits.push(new SplatEdit({ rgbaBlendMode: 'add_rgba', softEdge: 0.4, sdfs: sdf(new THREE.Color(0.012, 0.011, 0.01), 0) }));
  }
  // Plafond de la salle d'expo : sombre, juste une lueur bleue des projections (photos de la vraie salle), pas une verrière blanche.
  // ?plafond=1 : d'origine.
  const PL = Number(params.get('plafond') ?? 1);   // plafond reconstruit retiré (plafond blanc modélisé) : plus d'assombrissement
  if (PL !== 1) {
    const pf = new SplatEditSdf({ type: 'box', color: new THREE.Color(PL * 0.8, PL * 0.95, PL * 1.15) });
    pf.position.set(0, H + 4.5, 0); pf.scale.set(W / 2 + 1.5, 4.5, L / 2 + 0.2); pf.updateMatrixWorld(true);
    splat.edits.push(new SplatEdit({ rgbaBlendMode: 'multiply', softEdge: 0.5, sdfs: [pf] }));
  }
  // Lumière des créatures : chaque animal visible éclaire la salle autour de lui de SA couleur (plafond, rails,
  // piliers, bords des écrans), d'autant plus qu'il est près de la vitre. ?lueursalle=0 pour couper.
  const LS = Number(params.get('lueursalle') ?? 1);
  const lueurs = LS > 0 ? Array.from({ length: 6 }, () => new SplatEditSdf({ type: 'sphere', radius: 1, opacity: 0, color: new THREE.Color(0, 0, 0) })) : [];
  if (lueurs.length) splat.edits.push(new SplatEdit({ rgbaBlendMode: 'add_rgba', softEdge: 3.5, sdfs: lueurs }));
  lueursSalle = { lueurs, LS }; ambSalle = AMB;
  // Fond (pierre beige) derrière les gaussiennes du hall (plafond, murs latéraux, mur du fond) : les trous du nuage laissaient voir
  // le noir de la scène (taches sombres au plafond). Pas de paroi côté salle d'expo (l'ouverture reste libre).
  if (CLAIR !== 1) {
    const H = ROOM.hall, z0 = L / 2, z1 = L / 2 + H.depth, mur = new THREE.MeshBasicMaterial({ color: Number(params.get('murfond') ?? 0x0c0c0d), side: THREE.DoubleSide, fog: false });
    for (const [w, h, x, y, z, rx, ry] of [
      [H.width + 1, H.depth + 1, 0, H.height + 0.4, (z0 + z1) / 2, Math.PI / 2, 0],
      [H.width + 1, H.height + 1, 0, H.height / 2, z1 + 0.4, 0, 0],
      [H.depth + 1, H.height + 1, -H.width / 2 - 0.4, H.height / 2, (z0 + z1) / 2, 0, Math.PI / 2],
      [H.depth + 1, H.height + 1, H.width / 2 + 0.4, H.height / 2, (z0 + z1) / 2, 0, Math.PI / 2],
      // murs de l'accueil côté salle d'expo : un seul plan lisse, exactement dans le plan du bout des écrans (z = L/2),
      // qui part du bord des écrans (x = W/2) : l'angle mur / écran est net. (Linteau sombre au-dessus de l'entrée retiré :
      // c'était la barre noire en travers du plafond.)
      [H.width / 2 + 0.4 - W / 2, ROOM.height, -(H.width / 2 + 0.4 + W / 2) / 2, ROOM.height / 2, z0, 0, 0],   // même hauteur que les écrans (demande)
      [H.width / 2 + 0.4 - W / 2, ROOM.height, (H.width / 2 + 0.4 + W / 2) / 2, ROOM.height / 2, z0, 0, 0],   // même hauteur que les écrans (demande)
    ]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mur); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m); }
  }
  scene.add(splat);
  await splat.initialized;
  if (params.get('solaccueil') !== '0') {
    const sol = []; room.root.traverse((o) => { if (o.isMesh && o.material.name === 'hallfloor') sol.push(o); });
    for (const o of sol) scene.attach(o);   // reste affiché quand la salle 3D est masquée
    const m = sol[0]?.material;
    if (m) {
      // sol noir brillant : il ne montre que les reflets (salle, spots, panneau). Avant : gris moyen, et le calcul de lumière
      // d'origine était remplacé, si bien que la carte de lumière brute (couleurs des écrans) lui donnait un voile violet.
      if (params.get('accueilclair') === '1') { m.color.set(0x50545b); m.roughness = 0.6; }
      // il s'arrête à l'entrée de la salle d'exposition, sur toute la largeur : dessous, c'est l'écran du sol ; derrière les murs d'écrans,
      // il cachait le bas des créatures (tout ce qui passait sous le niveau du sol, vu à travers les écrans des côtés)
      const avant = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        avant?.(sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMonde;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMonde;')
          .replace('void main() {', `void main() {\n  if (vMonde.z < ${(L / 2).toFixed(2)}) discard;`);
      };
      m.needsUpdate = true;
    }
  }
  // salle d'accueil modélisée (pierre, caissons, portes, sas) : toujours affichée, à la place de ses gaussiennes
  if (params.get('hallgauss') !== '1') {
    const acc = []; room.root.traverse((o) => { if (o.isMesh && /^(hall$|hallporte|annex|plafond)/.test(o.material.name)) acc.push(o); });
    for (const o of acc) scene.attach(o);
  }
  room.root.visible = false;          // les écrans vidéo et les arêtes nettes restent, par-dessus
  crispEdges(scene);                  // lignes droites redessinées en vraie géométrie
}
window.__visiteurs = () => ({ accueil: visitors?.accueil, expo: visitors?.expo });
const visitors = useSplat && params.get('visiteurs') !== '0' ? await addVisitors(scene, params).catch(() => null) : null;
const screens = new Screens(scene);
const fond = seabed(scene);
const presentation = params.get('presentation') !== '0' ? presentationScreen(scene) : null;
// sol noir de l'accueil : reflet net du panneau, de son texte et de ses spots (?refletaccueil=0 pour couper, =0.5 plus discret)
if (params.get('refletaccueil') !== '0') refletSol(scene, renderer, { x0: -ROOM.hall.width / 2, x1: ROOM.hall.width / 2, z0: ROOM.length / 2, z1: ROOM.ecranZ - 0.25, force: Number(params.get('refletaccueil') ?? 0.22) });   // écran de la salle d'accueil   // fond marin sous le sol vitré, prolongé sous les murs (vidéo verticale de robot)
const creatures = params.get('creatures') !== '0' ? await addCreatures(scene).catch((e) => { console.warn(e); return null; }) : null;

// ---------- Reflets (verre des écrans, surfaces brillantes) : capturés une seule fois ----------
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.05, 80, cubeRT);
cubeCam.position.set(0, 2.0, 0);
scene.add(cubeCam);
const pmrem = new THREE.PMREMGenerator(renderer);
function captureEnv() {
  const hidden = !room.root.visible; room.root.visible = true;   // la salle 3D sert au reflet du verre
  screens.glass.forEach((o) => { o.visible = false; });
  // visiteurs jamais dans le reflet : capturé une seule fois, il les gardait figés dans le verre des écrans
  const vis = []; scene.traverse((o) => { if (o.userData.visiteur && o.visible) vis.push(o); }); vis.forEach((o) => { o.visible = false; });
  cubeCam.update(renderer, scene);
  vis.forEach((o) => { o.visible = true; });
  screens.glass.forEach((o) => { o.visible = true; });
  if (hidden) room.root.visible = false;
  screens.setEnv(cubeRT.texture);
  scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
  scene.environmentIntensity = 0.8;
}

// ---------- Regard ----------
const pov = new FirstPerson(camera, renderer.domElement);
pov.calm = calm;
const cam = params.get('cam'); // ?cam=x,z,lacet,tangage (degrés)
if (cam) {
  const [x, z, yaw, pitch] = cam.split(',').map(Number);
  pov.pos.set(x, z);
  pov.yaw = pov.tYaw = THREE.MathUtils.degToRad(yaw || 0);
  pov.pitch = pov.tPitch = THREE.MathUtils.degToRad(pitch || 0);
}
const fx = makeComposer(renderer, scene, camera);
const useFx = params.get('fx') !== '0';

// ---------- Entrée : bouton actif seulement quand tout est chargé ----------
const son = ambiance({ music: params.get('musique') === '0' ? null : '../son/Teimo.mp3' });   // musique remise (je la préfère) ; ?musique=0 pour couper
const sonBtn = document.getElementById('son');
const showSon = () => { sonBtn.setAttribute('aria-pressed', String(!son.muted)); sonBtn.setAttribute('aria-label', son.muted ? 'Remettre le son' : 'Couper le son'); };
sonBtn.addEventListener('click', () => { son.setMuted(!son.muted); showSon(); });
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && entering) { son.setMuted(!son.muted); showSon(); } });
showSon();
const poulpe = document.getElementById('poulpe');
const chargement = document.getElementById('chargement');
btn.addEventListener('mouseenter', () => document.body.classList.add('hoverPlay'));
btn.addEventListener('mouseleave', () => document.body.classList.remove('hoverPlay'));
let entering = false, arrival = -1;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
// Tout se prépare dès l'ouverture, pendant la page d'accueil (puis l'écran de chargement si le visiteur clique avant la fin) :
// vidéos lancées (sans son, permis sans clic), shaders compilés, reflets capturés.
async function prepare() {
  // Vidéos démarrées par petits groupes (le décodeur n'est jamais saturé : le poulpe du chargement reste fluide).
  // Celles des créatures repartent en pause dès leur première image : elles ne jouent que quand l'animal est là.
  const pretes = (v) => new Promise((r) => { if (v.readyState >= 2) r(); else { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 4000); } });
  const animaux = new Set(creatures?.videos ?? []);
  // créatures : plus préchargées ici (41 vidéos HD = chargement très long et machine saturée) ; chacune se charge
  // quand son animal entre, en bas, hors de l'écran (creatures.js)
  const toutes = [...screens.videos, ...(fond.video ? [fond.video] : []), ...(presentation?.video ? [presentation.video] : [])];
  for (let i = 0; i < toutes.length; i += 3) {
    await Promise.all(toutes.slice(i, i + 3).map((v) => { v.muted = true; return v.play().then(() => pretes(v), () => {}).then(() => { if (animaux.has(v)) v.pause(); }); }));
  }
  await visitors?.pret;   // toutes les photos de visiteurs : aucun visiteur ne s'affiche en retard dans la salle
  await creatures?.premieres;   // les premières vidéos de créatures sont prêtes : elles arrivent tout de suite, entières
  await renderer.compileAsync(scene, camera);
  for (let i = 0; i < 6; i++) await nextFrame();   // les vidéos remplissent leurs textures
  captureEnv();
  await nextFrame();
}
// Fin du chargement : le noir s'efface sur la salle, le texte « Préparation » disparaît et le poulpe du chargement
// GLISSE jusqu'à sa place de logo de l'accueil (à gauche du texte) ; arrivé, il est remplacé par le logo, image pour image.
async function finChargement() {
  const v = document.getElementById('poulpe-charge');
  const logo = document.querySelector('.welcome-logo'), lv = document.getElementById('poulpe');
  if (!chargement || chargement.classList.contains('fini')) return;
  const duree = calm ? 0 : 1100;
  chargement.classList.add('depart');
  if (v && logo) {
    const a = v.getBoundingClientRect(), b = logo.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    v.style.transition = `transform ${duree}ms cubic-bezier(.5,0,1,1)`;   // part doucement, ARRIVE sans ralentir : il se fige d'un coup (demande, 13/11)
    v.style.transform = `translate(calc(-50% + ${dx}px), calc(-60% + ${dy}px)) scale(${b.width / a.width})`;
  }
  await new Promise((r) => setTimeout(r, duree + 30));
  // figé d'un coup sur la pose du LOGO D'ORIGINE (image 0 de l'animation = img/presences_rares_logo_lisse.png),
  // jamais sur l'image où en était l'animation
  if (lv) { lv.pause(); try { if (lv.currentTime !== 0) lv.currentTime = 0; } catch {} }
  if (logo) { logo.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { logo.style.transition = ''; })); }
  chargement.classList.add('fini');   // le logo prend la place du poulpe ; textes et bouton apparaissent en fondu
  v?.classList.add('fini'); v?.pause();
}
const pret = prepare().then(() => { if (arrival < 0) arrival = clock.elapsedTime; return finChargement(); });
async function enter() {
  if (entering) return;
  entering = true;
  btn.disabled = true;
  son.start(creatures?.positions.length ?? 0);   // le son démarre avec le clic (règle des navigateurs)
  await pret;
  document.body.classList.add('clickedPlay');      // voile et textes partent vers la gauche : la salle est déjà là
  setTimeout(() => { intro.classList.add('hidden'); document.body.classList.remove('hoverPlay'); poulpe?.pause(); }, 1100);
  // déjà dans la salle : le regard est libre tout de suite (pas de nouveau fondu au noir)
  pov.auto = 0; pov.enabled = true; try { pov.lock(); } catch {}
  setTimeout(() => creatures?.commence?.(clock.elapsedTime), calm ? 600 : 1300);   // les animaux ne viennent qu'une fois le visiteur entré
  setTimeout(() => { hud.classList.add('visible'); sonBtn.classList.add('visible'); }, calm ? 1000 : 4500);
  setTimeout(() => hud.classList.add('quiet'), 14000);
}
btn.addEventListener('click', enter);
renderer.domElement.addEventListener('click', () => { if (pov.enabled && document.pointerLockElement !== renderer.domElement) pov.lock(); });
// Échap (souris libérée) : la salle passe en arrière-plan, floue, avec « Visite en pause » ; un clic y retourne
const pause = document.getElementById('pause');
let verrouille = false;
document.addEventListener('pointerlockchange', () => {
  const v = document.pointerLockElement === renderer.domElement;
  if (v) verrouille = true;
  montrePause(verrouille && !v && pov.enabled);
});
// pause : flou + « Visite en pause », consignes, retour à l'accueil et bouton du son
function montrePause(on) {
  pause.classList.toggle('visible', on);
  document.body.classList.toggle('enPause', on);
  pause.setAttribute('aria-hidden', String(!on));
}
pause.addEventListener('click', () => { pauseDemandee = 0; montrePause(false); pov.lock(); });
// double-clic dans la salle = Échap
// (le 1er clic demande le verrouillage de la souris, qui arrive parfois APRÈS le double-clic : on le relâche alors aussitôt)
let pauseDemandee = 0;
renderer.domElement.addEventListener('dblclick', () => {
  if (!pov.enabled) return;
  pauseDemandee = performance.now();
  if (document.pointerLockElement) document.exitPointerLock(); else montrePause(true);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement && performance.now() - pauseDemandee < 1500) { document.exitPointerLock(); montrePause(true); }
});
if (params.has('auto')) enter();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx.resize();
});
// Onglet caché : vidéos en pause (économise la machine), reprise au retour
document.addEventListener('visibilitychange', () => {
  if (!entering) return;
  if (document.hidden) creatures?.videos.forEach((v) => v.pause());   // au retour, seules celles des animaux présents repartent (creatures.js)
  for (const v of [...screens.videos, ...(fond.video ? [fond.video] : []), ...(presentation?.video ? [presentation.video] : [])]) document.hidden ? v.pause() : v.play().catch(() => {});
  son.pause(document.hidden);
});

// ---------- Qualité adaptative : rester fluide sur toutes les machines ----------
const perf = { acc: 0, n: 0, good: 0 };
function adapt(dt) {
  perf.acc += dt; perf.n++;
  if (perf.acc < 2) return;
  const fps = perf.n / perf.acc; perf.acc = 0; perf.n = 0;
  stats.fps = fps;
  if (fps < 48 && pixelRatio > MIN_PR) { pixelRatio = Math.max(MIN_PR, pixelRatio - 0.15); perf.good = 0; }   // jamais sous la résolution de l'écran : net
  else if (fps > 58 && pixelRatio < MAX_PR && ++perf.good >= 3) { pixelRatio = Math.min(MAX_PR, pixelRatio + 0.1); perf.good = 0; }
  else return;
  renderer.setPixelRatio(pixelRatio);
  fx.resize();
  fx.bloom.enabled = pixelRatio > MIN_PR + 0.05 || MIN_PR >= 1;              // dernier recours : le halo
}

// ---------- Boucle ----------
const clock = new THREE.Clock();
let frame = 0, exposure = 1.2, prevYaw = 0, prevPitch = 0;
const stats = { fps: 0 };

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  frame++;
  pov.update(dt, t);
  ghosts?.(camera, t);
  // lumières des créatures (≈ 15 fois/s : le moteur recalcule la salle à chaque changement)
  const lums = t - derniereLueur > 1 / 15 ? (derniereLueur = t, creatures?.lumieres?.() ?? []) : null;
  if (lums && lueursSalle) lueursSalle.lueurs.forEach((sd, i) => {
    const l = lums[i];
    if (!l || l.k < 0.02) { if (sd.color.r + sd.color.g + sd.color.b > 0) sd.color.setRGB(0, 0, 0); return; }
    sd.position.copy(l.pos); sd.radius = l.h * 0.45;
    sd.color.copy(l.c).multiplyScalar(0.11 * l.k * lueursSalle.LS * Math.min(1.6, l.h / 3.5));
  });
  visitors?.(t, camera, lums ? { amb: ambSalle, lums } : null);
  fond.update?.(t);
  PHARES.uPhT.value = t;
  presentation?.update(t);
  creatures?.update(t, camera);
  son.update(camera, creatures?.positions);
  screens.update(frame);
  if (screens.groups) room.setColors(screens.groups);

  // Exposition automatique lente (≈ 1 s) ; plage étroite : le noir des abysses reste noir
  const target = THREE.MathUtils.clamp(0.06 / (screens.viewLuminance(camera) + 0.03), 0.9, 1.5);
  exposure += (target - exposure) * (1 - Math.exp(-dt * 1.1));
  renderer.toneMappingExposure = exposure;

  fx.lens.uniforms.uTime.value = t;
  const a = arrival < 0 ? 0 : THREE.MathUtils.clamp((t - arrival) / (calm ? 1.5 : 4.0), 0, 1);
  fx.lens.uniforms.uFade.value = a * a * (3 - 2 * a);              // la salle sort du noir
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));    // flou de mouvement (obturateur 180°)
  const dYaw = camera.rotation.y - prevYaw, dPitch = camera.rotation.x - prevPitch;
  prevYaw = camera.rotation.y; prevPitch = camera.rotation.x;
  fx.lens.uniforms.uBlur.value.set(calm ? 0 : -dYaw / tv * 0.5, calm ? 0 : dPitch / tv * 0.5);
  if (useFx) fx.composer.render(); else renderer.render(scene, camera);
  if (arrival >= 0) adapt(dt);
});

window.__salle = { THREE, scene, camera, renderer, screens, pov, fx, stats, presentation, creatures, get exposure() { return exposure; }, get pixelRatio() { return pixelRatio; } };
