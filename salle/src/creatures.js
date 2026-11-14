import * as THREE from 'three';
import { ROOM } from './config.js';
import { EAU, PHARES, fenetre, marineSnow } from './dehors.js';

// Créatures dehors, vues à travers les écrans-hublots. Elles n'« apparaissent » jamais :
// elles montent de l'obscurité, entrent dans la lumière près des hublots, puis y retournent.
// - Relief propre (Depth Anything sur l'animal) : la forme change quand on se déplace.
// - Toujours opaques : seule l'eau les éteint avec la distance (eau() dans dehors.js).
// - Taille : les grands animaux à taille réelle ; les petits agrandis jusqu'à une taille lisible.
// Vidéo préparée par sources-creatures/creature_pack.py : en haut couleur + transparence, en bas relief.
// ?creatures=0 pour les retirer.

const L = ROOM.length;
// Mur : 'fond' | 'gauche' | 'droite'. Chemin : [position le long du mur (m), hauteur (m), distance derrière l'écran (m)].
// À plus de 2,5 m derrière l'écran, c'est le noir complet : l'animal y naît et y retourne (jamais d'apparition).
// Gauche/droite : position de -11,5 (fond) à +11,5 (entrée). Fond : de -4 à +4.
// passage(a, b) : monte de l'obscurité en a, frôle le hublot, repart dans le noir en b.
const passage = ([u0, y0], [u1, y1], near = 0.45, houle = 1) => {
  const m = (t) => [u0 + (u1 - u0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 0.6 * houle];
  return [[...m(0), 3.4], [...m(0.22), near + 0.9], [...m(0.45), near], [...m(0.62), near + 0.25], [...m(0.82), near + 0.9], [...m(1), 3.4]];
};
// Grands animaux : passage rapide le long du mur, à taille réelle, un peu plus loin (furtifs, impressionnants).
const traversee = (u0, u1, y, near = 1.0) => [[u0, y, 3.2], [u0 + (u1 - u0) * 0.25, y + 0.2, near + 0.6], [u0 + (u1 - u0) * 0.5, y + 0.3, near],
  [u0 + (u1 - u0) * 0.75, y + 0.1, near + 0.6], [u1, y - 0.2, 3.2]];

// Espèces : h = hauteur (m) sur l'écran. Affichage GRAND : le réalisme porte sur les rapports de taille entre espèces
// (le plus petit reste nettement plus petit que le plus grand), pas sur la taille absolue (au moins ~3 m). Les écrans font 8,5 m de haut : les plus grands animaux en prennent presque
// toute la hauteur. Les petits sont agrandis jusqu'à une taille lisible, mais restent nettement plus petits.
// grand : animal rare (au moins un toutes les ~80 s). dir : sens de nage dans la vidéo (1 = vers la droite).
// nage : vrai nageur, traverse le mur à la vitesse v. rot : rotation (radians) de l'image pour remettre le corps à l'horizontale.
// v : vitesse de déplacement (m/s), réglée sur la nage RÉELLE de l'animal dans sa vidéo (sources-creatures/mesure_nage.py :
// déplacement dans l'image + caméra qui le suit, en longueurs de corps par seconde). Celles qui bougent à peine
// dans la vidéo (méduses, cirrates, larvacien…) dérivent lentement ; seuls les vrais nageurs (requin, calmars) traversent.
// Une créature dont la vidéo n'est pas encore prête est simplement ignorée.
const MURS = ['gauche', 'droite', 'fond'];
const ESPECES = [
  // ---- très grands : presque toute la hauteur des écrans
  { name: 'siphonophore_bleu', h: 8.3, v: 0.1, relief: 0.2, murs: MURS, grand: true },
  { name: 'calmar_geant_pale', h: 7.9, v: 0.06, relief: 0.35, murs: MURS, grand: true },
  // Requin griset (Hexanchus griseus, jusqu'à ~5 m), filmé par le ROV SuBastian à 900 m.
  // Filmé en diagonale (tête en bas à gauche, ~33°) : redressé à l'horizontale (rot), plus grand, et il TRAVERSE
  // le mur à sa vitesse de nage, tête la première (nage : vrai nageur ; dir -1 : sa tête est à gauche dans la vidéo).
  { name: 'requin_sixbranchies', h: 8.0, v: 0.45, relief: 0.4, murs: ['gauche', 'droite'], grand: true, dir: -1, nage: true, rot: -0.57 },
  // Calmar colossal : première observation vivante (SOI, 2025). Un jeune (~30 cm), montré à l'échelle d'un adulte.
  { name: 'calmar_colossal', h: 5.8, v: 0.15, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'meduse_criniere', h: 6.2, k: 0.5, v: 0.05, relief: 0.25, murs: MURS, grand: true },   // k : taille divisée par deux (demande)
  { name: 'larvacien_geant', h: 5.3, v: 0.06, relief: 0.3, murs: MURS, grand: true },
  { name: 'calmar_bras', h: 4.9, v: 0.35, relief: 0.25, murs: ['gauche', 'droite'], grand: true },
  // ---- moyens
  { name: 'meduse_filaments', h: 5.3, v: 0.08, relief: 0.2, murs: MURS },
  { name: 'calmar_rouge_nageur', h: 4.5, v: 0.04, relief: 0.3, murs: MURS },
  // taille divisée par 3 (demande) : hFixe = hauteur exacte, sans l'agrandissement des petits
  { name: 'ruban_lumineux', h: 4.0, hFixe: 1.5, v: 0.04, relief: 0.15, murs: MURS },
  { name: 'dumbo', h: 3.7, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'cirrate_ombrelle', h: 3.8, v: 0.08, relief: 0.3, murs: MURS },
  { name: 'cirrate_rouge', h: 3.8, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'cirrate_blanc', h: 3.8, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'cirrate_brun', h: 3.6, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'calmar_verre', h: 3.8, v: 0.12, relief: 0.25, murs: MURS },
  { name: 'meduse_ambre', h: 3.6, v: 0.04, relief: 0.25, murs: MURS },
  // ---- petits
  { name: 'concombre_nageur', h: 3.5, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_couronne', h: 3.5, v: 0.06, relief: 0.25, murs: MURS },
  { name: 'calmar_transparent', h: 3.5, v: 0.15, relief: 0.2, murs: MURS },
  { name: 'meduse_pourpre', h: 3.4, v: 0.04, relief: 0.2, murs: MURS },
  { name: 'ctenophore', h: 3.2, v: 0.2, relief: 0.2, murs: MURS },
  { name: 'meduse_rouge', h: 3.6, v: 0.05, relief: 0.25, murs: MURS },
  // Méduse rouge en dérive (plan long de 37 s pris dans la plongée complète, pleine eau)
  { name: 'meduse_rouge_derive', h: 3.4, v: 0.05, relief: 0.25, murs: MURS },
  // Plans longs (14/11) retrouvés dans les plongées complètes par DINOv2, incrustations du direct effacées lettre par lettre
  // (l'animal passe dessous sans être coupé) ; les anciens clips de ces 4 espèces avaient moins de 3 s propres
  { name: 'cirrate_blanc_long_a', h: 3.8, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'cirrate_blanc_long_b', h: 3.8, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'calmar_bras_long_a', h: 4.9, v: 0.35, relief: 0.25, murs: ['gauche', 'droite'], grand: true },
  { name: 'calmar_bras_long_b', h: 4.9, v: 0.35, relief: 0.25, murs: ['gauche', 'droite'], grand: true },
  { name: 'cirrate_rouge_long', h: 3.8, v: 0.06, relief: 0.3, murs: MURS },
  { name: 'calmar_transparent_long_a', h: 3.5, v: 0.15, relief: 0.2, murs: MURS },
  { name: 'calmar_transparent_long_b', h: 3.5, v: 0.15, relief: 0.2, murs: MURS },
  { name: 'araignee_mer', h: 4.5, v: 0.05, relief: 0.3, murs: MURS },
  // nouvelles (lot SAM 2, plans « pélagiques » de nos vidéos ; espèce à identifier sur l'aperçu) : ignorées tant que pas prêtes
  { name: 'nouvelle_01', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_02', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_03', h: 5.5, v: 0.07, relief: 0.25, murs: MURS, grand: true },
  { name: 'nouvelle_04', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_05', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_06', h: 5.5, v: 0.07, relief: 0.25, murs: MURS, grand: true },
  { name: 'nouvelle_07', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_08', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_09', h: 5.5, v: 0.07, relief: 0.25, murs: MURS, grand: true },
  { name: 'nouvelle_10', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  // nouvelle_11 retirée : détourage raté sur ses tentacules très fins (traits blancs), pas réparable
  { name: 'nouvelle_12', h: 5.5, v: 0.07, relief: 0.25, murs: MURS, grand: true },
  { name: 'nouvelle_13', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_14', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  { name: 'nouvelle_15', h: 5.5, v: 0.07, relief: 0.25, murs: MURS, grand: true },
  { name: 'nouvelle_16', h: 4.5, v: 0.07, relief: 0.25, murs: MURS },
  // 4K de l'ancien projet (disque T7, VideoMatting/final, déjà détourées) : lot sources-creatures/lot_t7.sh ; ignorées tant que pas prêtes
  { name: 'meduse_globe_rouge', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'pieuvre_verre', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'calmar_lance', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'raie_profonde', h: 5.0, v: 0.2, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'meduse_conique', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'poisson_noir', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'dumbo_blanc', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'salpe_rouge', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'calmar_violet', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'poisson_rose_bossu', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'siphonophore_epineux', h: 6.0, v: 0.08, relief: 0.3, murs: MURS, grand: true },
  { name: 'poisson_rose_long', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'crevette_fil', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_geante_violette', h: 5.2, v: 0.05, relief: 0.3, murs: MURS, grand: true },
  { name: 'anemone_blanche', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_cube', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'ver_spirale', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_rose', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_traine', h: 5.5, v: 0.05, relief: 0.3, murs: MURS, grand: true },
  { name: 'meduse_traine_b', h: 5.5, v: 0.05, relief: 0.3, murs: MURS, grand: true },
  { name: 'meduse_rouge_ronde', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_lilas', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'ctenophore_irise', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_trompe', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'cydippe_bleue', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'poisson_blanc', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'pieuvre_tachetee', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'poisson_beige', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'siphonophore_orange', h: 6.5, v: 0.08, relief: 0.3, murs: MURS, grand: true },
  { name: 'calmar_verre_orange', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'calmar_sombre', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'meduse_tentacules_jaunes', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_lune', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'siphonophore_noir', h: 5.5, v: 0.06, relief: 0.3, murs: MURS, grand: true },
  { name: 'poisson_noir_tache', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'pieuvre_rouge', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'meduse_noire', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'poisson_lance', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'salpe_bleue', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_ombrelle_lilas', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'meduse_bleue', h: 3.8, v: 0.05, relief: 0.25, murs: MURS },
  { name: 'requin_gris', h: 5.5, v: 0.35, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'calmar_cyan', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'calmar_ailes', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'chimere_face', h: 4.6, v: 0.2, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'requin_lutin', h: 5.8, v: 0.35, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'chabot_bleu', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
  { name: 'requin_gris_b', h: 5.5, v: 0.35, relief: 0.3, murs: ['gauche', 'droite'], grand: true },
  { name: 'calmar_beige', h: 4.0, v: 0.15, relief: 0.3, murs: MURS },
];
// Fond « en suspens » (?fond=c) : de l'eau sous nos pieds. Des animaux passent SOUS la salle, vus de dessus à travers
// le sol vitré. Seulement ceux qui se lisent vus d'en haut (formes rondes, sans dos ni ventre) ; aucun animal à dos
// (requin…) n'a été filmé de dessus dans nos sources : ils restent sur les murs.
const SOL = [
  { name: 'siphonophore_bleu', h: 6.6, v: 0.1, relief: 0.2, murs: ['sol'], grand: true },
  { name: 'meduse_criniere', h: 5.3, k: 0.5, v: 0.05, relief: 0.25, murs: ['sol'], grand: true },
  { name: 'meduse_filaments', h: 4.5, v: 0.08, relief: 0.2, murs: ['sol'] },
  { name: 'cirrate_ombrelle', h: 3.8, v: 0.08, relief: 0.3, murs: ['sol'] },
  { name: 'meduse_couronne', h: 3.5, v: 0.06, relief: 0.25, murs: ['sol'] },
  { name: 'meduse_pourpre', h: 3.4, v: 0.04, relief: 0.2, murs: ['sol'] },
  { name: 'ctenophore', h: 3.2, v: 0.2, relief: 0.2, murs: ['sol'] },
];
// Peuplement : la salle s'ouvre VIDE ; le premier animal arrive après quelques secondes, puis de plus en plus vite
// (courbe exponentielle) jusqu'à quelques animaux à la fois, jamais plus : il faut chercher, attendre, apercevoir.
// à plein : à peu près un animal par écran des murs (9) et 3 au sol ; ?murs=… &sol=… pour régler
const MAX_MURS = Number(new URLSearchParams(location.search).get('murs') ?? 6), MAX_SOL = Number(new URLSearchParams(location.search).get('sol') ?? 2), MONTEE = 60;     // MONTEE : secondes avant la présence maximale
// Étendue de chaque surface : position le long (u) et hauteur (y), en m. Sol : u = longueur, y = travers.
const ETENDUE = { gauche: [-11, 11, 0, 8.5], droite: [-11, 11, 0, 8.5], fond: [-3.7, 3.7, 0, 8.5], sol: [-11, 11, -3.4, 3.4] };
const DROITE_VIDEO = { gauche: -1, droite: 1, fond: 1, sol: 1 };   // sens du « vers la droite » de la vidéo, en u
const hasard = (a, b) => a + Math.random() * (b - a);
// taille minimale relevée : les plus petits passent de 3,2 m à 4 m, l'ordre des tailles entre espèces est gardé
const agrandi = (h) => (h < 5.3 ? 4.0 + (h - 3.2) * (1.3 / 2.1) : h);

// Mur -> position et orientation dans la salle (l'animal fait toujours face à la salle)
function place(mesh, mur, [u, y, d]) {
  const { width: W } = ROOM;
  if (mur === 'gauche') { mesh.position.set(-W / 2 - d, y, u); mesh.rotation.set(0, Math.PI / 2, 0); }
  else if (mur === 'droite') { mesh.position.set(W / 2 + d, y, u); mesh.rotation.set(0, -Math.PI / 2, 0); }
  else if (mur === 'sol') { mesh.position.set(y, -d, u); mesh.rotation.set(-Math.PI / 2, 0, mesh.rotation.z); }   // couché, face au plafond
  else { mesh.position.set(u, y, -L / 2 - d); mesh.rotation.set(0, 0, 0); }
}

function material(tex) {
  return fenetre(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uPlan: { value: new THREE.Vector4(0, -1, 0, 0) }, map: { value: tex }, uRelief: { value: 0.4 }, uTexel: { value: new THREE.Vector2(1 / 720, 1 / 2332) }, uSoft: { value: 0 }, uFondu: { value: 1 }, uPile: { value: 2 }, uLueur: { value: LUEUR }, uVif: { value: VIF }, ...PHARES },
    vertexShader: /* glsl */`
      uniform sampler2D map; uniform float uRelief, uPile; varying vec2 vUv; varying vec3 vW;
      void main(){
        vUv = uv;
        float d = texture2D(map, vec2(uv.x, uv.y / uPile)).r;          // relief (panneau du bas), 1 = le plus proche
        vec3 p = position; p.z += (d - 0.5) * uRelief;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      #define BLANC ${BLANC}
      uniform sampler2D map; uniform vec2 uTexel; uniform float uSoft, uFondu, uPile, uLueur, uVif; uniform vec4 uPlan; varying vec2 vUv;
      const bool VOIRPH = ${VOIRPH}; varying vec3 vW;
      ${EAU}
      vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      // vidéo empilée : [couleur | alpha | relief] (H.264, pile = 3) ou [couleur+alpha | relief] (VP9, pile = 2)
      vec4 tap(vec2 o){
        vec2 q = vec2(vUv.x, 1.0 - 1.0 / uPile + vUv.y / uPile) + o * uTexel;
        vec4 t = texture2D(map, q);
        float a = uPile > 2.5 ? texture2D(map, q - vec2(0.0, 1.0 / 3.0)).r : t.a;
        return vec4(t.rgb * a, a);                                       // prémultiplié
      }
      void main(){
        float r = uSoft;                                                  // un peu plus doux au loin (particules)
        vec4 s = tap(vec2(0.0)) * 0.4 + (tap(vec2(r, 0.0)) + tap(vec2(-r, 0.0)) + tap(vec2(0.0, r)) + tap(vec2(0.0, -r))) * 0.15;
        if (s.a < 0.01 && !BLANC) discard;
        // Lumière : l'eau absorbe avec la distance (ab), et l'animal n'est éclairé que là où passe un faisceau (li).
        // Une seule évaluation des spots par pixel. La lumière glisse sur le corps (pixel par pixel), sans seuil.
        vec3 ab = absorbe(vW);
        // éclairage en 2D : celui de l'eau de l'écran à l'endroit où l'animal apparaît (pas selon sa profondeur)
        vec3 q; float ph = lumPlan(vW, uPlan.xyz, uPlan.w, q);   // écran de la créature (fixé à son lancement)
        // en montant vers le haut de l'écran l'animal reste éclairé jusqu'à sa sortie (plus de bande noire qui le coupait)
        // (plus de lumière forcée en haut : les écrans montent jusqu'au plafond, la créature y reste dans l'ombre hors faisceau)
        ph = min(ph, 1.0);   // jamais plus que le cœur d'un faisceau (près de la source d'un spot, ph explosait)
        vec3 fondEau = eauEcran(q, ph);
        // éclairage de l'animal : vraiment sombre hors faisceau ; le haut des murs l'assombrit moins que l'eau
        // (il reste lisible jusqu'au bord de l'écran, il n'est coupé qu'en sortant de l'écran)
        float hautC = 1.0;   // éclairé jusqu'en haut des écrans (plus de bande sombre qui le coupait en haut)
        float li = mix(1.0, mix(0.025, 2.2, ph) * hautC, uPhK);   // dans le faisceau : vraiment éclairé (il ne doit pas se fondre dans l'eau claire)
        vec3 e = pow(ab, vec3(0.45));                                   // eau plus claire pour les animaux : bien visibles
        vec3 src = toLinear(s.rgb / s.a);
        float lum = max(src.r, max(src.g, src.b));
        // couleurs plus vives : saturation douce (les teintes déjà vives bougent peu, pas de couleur criarde)
        float gris = dot(src, vec3(0.2126, 0.7152, 0.0722)), sat = lum - min(src.r, min(src.g, src.b));
        src = max(mix(vec3(gris), src, 1.0 + uVif * (1.0 - sat)), 0.0);
        // éclairage reçu : réponse douce (racine), la pénombre garde un peu de modelé au lieu de tomber au noir
        float recu = pow(max(li, 0.0), 0.8);
        vec3 c = src * mix(vec3(1.0), e, 0.35) * 1.3 * recu;
        // ses propres lumières (bioluminescence, reflets) restent visibles même hors faisceau, un peu atténuées
        c += src * smoothstep(0.25, 0.85, lum) * uLueur * (0.35 + 0.65 * e.g) * mix(0.05, 1.0, min(li, 1.0));   // hors faisceau : presque éteintes aussi (toutes les créatures dans l'ombre)
        // Disparition : TRANSPARENTE (pas une silhouette noire) avec la distance, et en partie dans l'ombre :
        // l'animal se fond dans la couleur du fond, quelle qu'elle soit. Fondu long et doux, jamais une coupure.
        float a = s.a * smoothstep(0.0, 0.55, max(ab.r, max(ab.g, ab.b))) * uFondu;   // uFondu : apparition / disparition sur place
        // bords de la vidéo : si l'animal touchait le cadre de la source, pas de trait droit, un fondu
        float bx = min(vUv.x, 1.0 - vUv.x), by = min(vUv.y, 1.0 - vUv.y);
        a *= smoothstep(0.0, 0.06, bx) * smoothstep(0.0, 0.05, by);
        // l'eau éclairée devant l'animal (diffusion dans le faisceau) : léger voile bleuté, réaliste
        c += vec3(0.004, 0.014, 0.04) * ph * uPhK;
        // jamais plus sombre que l'eau derrière : pas de tache sombre qui masque le bleu de l'écran
        // l'eau derrière le relève un peu dans l'ombre (pas de tache noire), mais ne le remplace jamais : avant, dans un
        // faisceau, l'eau éclairée était plus claire que l'animal et il disparaissait sous le spot
        c = max(c, fondEau * uPhK * 0.2 * (1.0 - ph));   // hors faisceau : nettement plus sombre
        #ifdef PROF
        if (a < 0.5) discard;   // passe de profondeur : seul le corps opaque cache la neige qui passe DERRIÈRE l'animal
        #endif
        gl_FragColor = BLANC ? vec4(1.0) : VOIRPH ? vec4(vec3(ph, 0.0, 1.0 - ph) * a, a) : vec4(c * a, a);   // ?blanc=1 : test, chaque créature = rectangle blanc plein (voir ce qui les cache)
      }`,
  }));
}

const HD = new URLSearchParams(location.search).get('hd') !== '0';
const Q_PROF = new URLSearchParams(location.search).get('neigecache') !== '0';   // ?neigecache=0 : la neige passe devant tout
const RELIEF = new URLSearchParams(location.search).get('relief') === '1';
const VOIRPH = new URLSearchParams(location.search).get('voirph') === '1';   // test : rouge = dans un faisceau, bleu = dans l'ombre
const BLANC = new URLSearchParams(location.search).get('blanc') === '1';   // test : créatures et aplats blancs pour voir ce qui les cache
const LUEUR = Number(new URLSearchParams(location.search).get('lueur') ?? 1.6);
const VIF = Number(new URLSearchParams(location.search).get('vif') ?? 0.45);     // ?vif=0 : couleurs d'origine   // ?lueur=0 : lumières des animaux sans renfort
// Détourage pas encore propre (sauts, trous, image brûlée) : retirées de la salle en attendant d'être retravaillées.
// ?toutes=1 pour les revoir quand même.
// Retirées (vérifiées image par image le 11/11) : texte ou graphisme incrusté dans la source (nouvelle_05 « G E ASG »,
// nouvelle_07 « MAPPING », nouvelle_12 grosses lettres, nouvelle_16 trait jaune), ou changement de plan au milieu
// (nouvelle_01 : l'animal change d'un coup).
// nouvelle_15 (méduse transparente à tentacules ondulés et long bâton blanc) : retirée (demande, 12/11).
// plages d'images bonnes (assets/plages_creatures.json, relevées à l'œil) : null = créature désactivée
const TOUTES = new URLSearchParams(location.search).get('toutes') === '1';
// SANS MOUVEMENT (demande, 12/11) : chaque animal apparaît en fondu à un endroit, y reste immobile (seule sa vidéo
// bouge), puis disparaît en fondu. Plus de trajet, de montée, d'approche ni de rotation vers le visiteur.
// ?mouvement=1 pour revenir aux trajets.
const FIXE = new URLSearchParams(location.search).get('mouvement') !== '1', FONDU = 1.6, FONDU_SORTIE = 3;
export async function addCreatures(scene) {
  if (!document.createElement('video').canPlayType('video/webm; codecs="vp9"')) return null;   // Safari : version HEVC à venir
  const suspens = (new URLSearchParams(location.search).get('fond') ?? 'c') === 'c';   // version actuelle par défaut
  const PLAGES = await fetch('assets/plages_creatures.json', { cache: 'no-cache' }).then((r) => r.ok ? r.json() : {}, () => ({}));
  // images PAS BONNES marquées dans le tableau des créatures (vos clics + défauts détectés) : elles priment sur les
  // plages ; la salle lit la plus longue suite d'images bonnes (même règle que le tableau)
  const MAUVAISES = await fetch('assets/creatures_mauvaises.json', { cache: 'no-cache' }).then((r) => r.ok ? r.json() : null, () => null);
  // (calculée au chargement de chaque vidéo, avec son VRAI nombre d'images : avant, on comptait 2000 images fictives
  // après la dernière image marquée, ce morceau inexistant gagnait toujours et presque toutes les créatures étaient retirées)
  const plageBonne = (m, N) => {
    const mal = new Set([...(m.vous ?? []), ...(m.auto ?? [])]);
    let best = null, d0 = null;
    for (let i = 0; i <= N; i++) {
      if (i < N && !mal.has(i)) { if (d0 === null) d0 = i; }
      else if (d0 !== null) { if (!best || i - d0 > best[1] - best[0] + 1) best = [d0, i - 1]; d0 = null; }
    }
    return best;
  };
  const cache = {};                                        // une même vidéo sert au mur et au sol
  // qualité réelle de chaque vidéo (tools/qualite_creatures.py) : une créature floue ou peu définie est montrée
  // plus petite, pour ne jamais paraître pixelisée de près
  const qualite = HD ? await fetch('assets/creatures_hd/qualite.json', { cache: 'no-cache' }).then((r) => r.ok ? r.json() : {}, () => ({})) : {};
  // « utile » = hauteur RÉELLEMENT définie (tools/resolution_creatures.py, 13/11 : beaucoup de sources sont agrandies) :
  // au plus 1 m d'écran pour 60 px de vrai détail (« certaines créatures sont trop grandes pour leur résolution »)
  const tailleMax = (name) => { const q = qualite[name]; return q ? Math.max(2.0, Math.min(q.px / 110, q.utile / 60)) : 99; };
  const charge = (name) => cache[name] ??= (async () => {
    // version haute définition si elle existe (assets/creatures_hd), sinon l'ancienne (720 px) ; ?hd=0 : toujours l'ancienne
    // no-cache : toujours la fiche à jour (sinon l'ancien format reste en cache et l'ancienne vidéo est chargée)
    const lire = (dossier) => fetch(`assets/${dossier}/${name}.json`, { cache: 'no-cache' }).then((r) => r.ok ? r.json().then((info) => ({ info, base: `assets/${dossier}/${name}` })) : null, () => null);
    const trouve = (HD && await lire('creatures_hd')) || await lire('creatures');
    if (!trouve) throw new Error(name);
    const { info, base } = trouve;
    if (info.coupe) throw new Error(`${name} : coupée par le cadre`);   // jamais d'animal à moitié coupé
    // boucle très courte : exclue, sauf les requins (ils traversent).
    // seule la plage bonne est lue (la fin des vidéos était la boucle fondue sur elle-même : image dédoublée)
    const N = info.images ?? 300;
    const pl = MAUVAISES?.[name] ? plageBonne(MAUVAISES[name], N) : PLAGES[name];
    if (pl === null) throw new Error(`${name} : désactivée`);
    info.debut = pl ? pl[0] : 0; info.fin = Math.min(pl ? pl[1] + 1 : N, N);   // fin exclue
    info.images = info.fin - info.debut;
    if (info.images < 90) throw new Error(`${name} : plage trop courte`);   // < 3 s : l'animal n'avait pas le temps d'apparaître qu'il repartait (retiré le 13/11, à remplacer par des passages plus longs)
    const video = Object.assign(document.createElement('video'), { src: `${base}.${info.pile === 3 ? 'mp4' : 'webm'}`, muted: true, loop: false, playsInline: true, preload: 'none', crossOrigin: 'anonymous' });
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false;
    // les plans filmés ne durent souvent que 3 à 5 s : lecture ralentie (animaux des abysses, lents) d'autant plus que la
    // boucle est courte, et vitesse qui varie doucement : la répétition du même geste ne se remarque pas
    const n = info.images ?? 300;
    video._lent = n < 120 ? 0.55 : n < 200 ? 0.65 : n < 300 ? 0.75 : 0.85; video._ph = Math.random() * 6.28;
    return { info, video, tex };
  })();
  // Couleur de la lumière d'un animal : moyenne de ses parties claires (aperçu), normalisée (sert à éclairer la salle)
  const teinte = (name, out) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const k = document.createElement('canvas'); k.width = k.height = 24;
      const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data; let r = 0, v = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { const w = Math.pow(Math.max(d[i], d[i + 1], d[i + 2]) / 255, 3); r += d[i] * w; v += d[i + 1] * w; b += d[i + 2] * w; }
      const m = Math.max(r, v, b); if (m > 0) out.setRGB(r / m, v / m, b / m);
    };
    img.src = `assets/${HD ? 'creatures_hd' : 'creatures'}/${name}_apercu.jpg`;
  };
  const loaded = await Promise.allSettled([...ESPECES, ...(suspens ? SOL : [])].filter((c) => TOUTES || PLAGES[c.name] !== null || MAUVAISES?.[c.name]).map(async (c) => {
    const { info, video, tex } = await charge(c.name);
    const segY = 150, segX = Math.max(8, Math.round(segY * info.aspect));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(info.aspect, 1, segX, segY), material(tex));   // 1 m de haut, mis à l'échelle
    // relief (profondeur estimée) coupé par défaut : il bosselait le plan et déformait les animaux. ?relief=1 pour le remettre
    mesh.material.uniforms.uRelief.value = RELIEF ? c.relief : 0;
    mesh.material.uniforms.uTexel.value.set(1 / (info.largeur ?? 720), 1 / (info.hauteur ?? 2332));   // flou au loin : en pixels réels
    mesh.material.uniforms.uPile.value = info.pile ?? 2;
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
    // neige : les flocons devant l'animal restent visibles, ceux derrière son corps sont cachés (profondeur écrite par le corps seul)
    if (Q_PROF) {
      const prof = mesh.material.clone(); prof.uniforms = mesh.material.uniforms; prof.defines = { PROF: 1 };
      Object.assign(prof, { colorWrite: false, depthWrite: true, transparent: false, blending: THREE.NoBlending });
      const ombre = new THREE.Mesh(mesh.geometry, fenetre(prof)); ombre.renderOrder = 52;   // après le pochoir et la remise à zéro de la profondeur (screens.js)
      ombre.frustumCulled = false; mesh.add(ombre);
    }
    scene.add(mesh);
    const it = { c, info, video, mesh, sol: c.murs[0] === 'sol', actif: false, libre: 0, p: new THREE.Vector3(), teinte: new THREE.Color(0.5, 0.6, 0.8) };
    teinte(c.name, it.teinte);
    // animaux du sol dessinés AVANT ceux des murs : quand un animal du sol glisse dans le bas d'un écran voisin
    // (passage fluide d'un écran à l'autre, voulu), il ne fait plus une masse devant l'animal du mur
    if (it.sol) mesh.renderOrder = 1.9;
    return it;
  }));
  const items = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value);   // créature pas encore prête : ignorée
  const videos = [...new Set(items.map((i) => i.video))];
  const snow = marineSnow(scene);
  snow.renderOrder = 2.5;
  if (BLANC) {   // aplats blancs derrière tous les écrans, là où nagent les créatures : tout ce qui les masque apparaît en sombre
    const { width: W, length: L } = ROOM, blanc = fenetre(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false }));
    const plan = (w, h, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), blanc); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 2; scene.add(m); };
    for (const c of [-1, 1]) plan(L + 6, 80, c * (W / 2 + 2), 35, 0, 0, Math.PI / 2);   // très hauts : on ne voit jamais leur bord du haut depuis le pied des écrans
    plan(W + 6, 80, 0, 35, -L / 2 - 2, 0, 0);
    plan(W + 4, L + 4, 0, -2, 0, -Math.PI / 2, 0);
  }

  // Un passage : l'animal choisit une surface, une hauteur, un sens et une taille ; il monte de l'obscurité,
  // approche du hublot, puis repart dans le noir, ailleurs. Il ne revient qu'après un long moment.
  function lance(it, t) {
    const occupe = (m) => items.filter((o) => o.actif && o.mur === m).length;
    // Jamais deux animaux l'un sur l'autre : chaque passage occupe une zone du mur (étendue du trajet + taille de l'animal).
    // On essaie plusieurs tirages ; si aucun ne tombe dans une zone libre, l'animal attend son tour.
    const boite = (path, h, mur) => {
      const w = (mur === 'sol' ? h * Math.max(1, it.info.aspect) : h * it.info.aspect) / 2 + 0.3, hh = (mur === 'sol' ? w : h / 2) + 0.3;
      const us = path.filter((q) => q[2] < 2.5).map((q) => q[0]), ys = path.filter((q) => q[2] < 2.5).map((q) => q[1]);
      return [Math.min(...us) - w, Math.max(...us) + w, Math.min(...ys) - hh, Math.max(...ys) + hh];
    };
    const libre = (mur, bx) => items.every((o) => !o.actif || o.mur !== mur || !o.boite ||
      bx[1] < o.boite[0] || bx[0] > o.boite[1] || bx[3] < o.boite[2] || bx[2] > o.boite[3]);
    for (let essai = 0; essai < 16; essai++) {
      const murs = [...it.c.murs].sort((a, b) => occupe(a) - occupe(b) + Math.random() - 0.5);
      const mur = murs[0], [u0m, u1m, y0m, y1m] = ETENDUE[mur];
      let h = (it.c.hFixe ?? Math.min(agrandi(it.c.h), tailleMax(it.c.name))) * hasard(0.9, 1.12) * (it.c.k ?? 1);
      if (mur === 'fond') h = Math.min(h, 7.4 / it.info.aspect);              // tient dans la largeur du fond
      if (mur !== 'sol') h = Math.min(h, 8.3);
      const marge = mur === 'sol' ? h * it.info.aspect * 0.3 : h / 2 + 0.15;
      const yy = () => (y1m - y0m > 2 * marge ? hasard(y0m + marge, y1m - marge) : (y0m + y1m) / 2);
      let path, dur;
      const v = it.c.nage ? it.c.v : 0.07;                                // nageur : sa vitesse ; les autres : dérive générique (courant)
      if (v >= 0.3 && mur !== 'fond' && mur !== 'sol') {                    // vrai nageur : traverse le mur à sa vitesse
        const sens = Math.random() < 0.5 ? 1 : -1, y = yy(), u0 = -13 * sens, u1 = hasard(-2, 13) * sens;
        path = traversee(u0, u1, y, hasard(0.5, 0.9));
        dur = Math.abs(u1 - u0) / v;
      } else {                                                                // dérive : se déplace à peine, surtout en approchant du hublot
        dur = v < 0.1 ? hasard(55, 80) : hasard(35, 55);
        const d = v * dur * 0.6;                                              // distance parcourue le long du mur
        // Même sens pour toutes : elles montent doucement (on a l'impression que la salle descend dans les abysses).
        // Elles entrent plutôt par le bas des écrans ; à peine de dérive sur le côté. Au sol : petite dérive libre.
        let ua, ub, ya, yb;
        if (mur === 'sol') {
          ua = hasard(u0m + 1, u1m - 1); ub = THREE.MathUtils.clamp(ua + d * 0.5 * (Math.random() < 0.5 ? -1 : 1), u0m + 0.5, u1m - 0.5);
          ya = yy(); yb = THREE.MathUtils.clamp(ya + hasard(-1, 1) * d * 0.3, y0m + marge, y1m - marge);
        } else {
          // l'animal se tient SOUS UN SPOT (dans son faisceau), et y reste : il n'en dérive presque pas
          const spots = mur === 'fond' ? [-2.9, 2.9] : [0, 1, 2, 3].map((k) => -ROOM.length / 2 + (k + 0.5) * ROOM.length / ROOM.bays);
          ua = THREE.MathUtils.clamp(spots[Math.floor(Math.random() * spots.length)] + hasard(-0.6, 0.6), u0m + 0.5, u1m - 0.5);
          ub = THREE.MathUtils.clamp(ua + hasard(-0.3, 0.3), u0m + 0.5, u1m - 0.5);
          // Effet « la salle descend » renforcé : l'animal naît en bas (souvent sous l'écran), monte franchement
          // et ressort par le HAUT de l'écran. Vitesse de montée tirée au hasard, lente (0,10 à 0,18 m/s).
          const bas = y0m + marge, haut = y1m - marge;
          // montée FORTEMENT réduite (demande) : l'animal n'est plus emporté du bas jusqu'en haut de l'écran ;
          // il apparaît à une hauteur au hasard et ne s'élève que de 0,3 à 1 m pendant tout son passage
          const montee = hasard(0.3, 1.0);
          ya = haut - montee > bas ? hasard(bas, haut - montee) : (y0m + y1m) / 2;
          yb = ya + montee;
        }
        path = passage([ua, ya], [ub, yb], mur === 'sol' ? hasard(0.4, 0.7) : it.c.grand ? hasard(1.4, 2.0) : hasard(0.9, 1.4), Math.min(1, v / 0.2));   // vraiment DERRIÈRE la vitre
        // sol : l'eau y absorbe moins vite (profondeur comptée ×0,8) ; à 3,4 m l'animal restait visible à ~35 % et
        // disparaissait d'un coup en fin de passage : il naît et repart assez loin pour être dans le noir complet
        if (mur === 'sol') { path[0][2] = 5.2; path[path.length - 1][2] = 5.2; }
      }
      if (FIXE) {   // immobile : un seul point, à la profondeur la plus proche du trajet tiré
        const pr = path.reduce((m, q) => (q[2] < m[2] ? q : m));
        const pt = [pr[0], pr[1], Math.max(pr[2], mur === 'sol' ? 0.5 : 0.9)];
        // l'animal tient ENTIER dans son mur (avant : un grand requin de 12 m, placé à 7 m du bout du mur, dépassait
        // dans l'angle et paraissait coupé). Encombrement compté avec sa rotation (requin redressé).
        if (mur !== 'sol') {
          const r = it.c.rot ?? 0, cx = it.info.aspect * Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)), cy = it.info.aspect * Math.abs(Math.sin(r)) + Math.abs(Math.cos(r));
          h = Math.min(h, (u1m - u0m - 0.4) / cx, (y1m - y0m - 0.3) / cy);
          const dx = h * cx / 2 + 0.2, dy = h * cy / 2 + 0.15;
          pt[0] = THREE.MathUtils.clamp(pt[0], u0m + dx, u1m - dx);
          pt[1] = THREE.MathUtils.clamp(pt[1], y0m + dy, y1m - dy);
        }
        path = [pt, [...pt], [...pt]];
      }
            const bx = boite(path, h, mur);
      if (!libre(mur, bx)) continue;
      // un petit animal qui bouge peu ne s'arrête pas sur un montant entre deux écrans (règle souple : levée après 10 essais)
      if (essai < 10 && (mur === 'gauche' || mur === 'droite') && !it.c.grand && v < 0.3) {
        const larg = h * it.info.aspect, milieu = path[2][0], baie = ROOM.length / ROOM.bays;
        const surMontant = [1, 2, 3].some((k) => Math.abs(milieu - (-ROOM.length / 2 + k * baie)) < larg / 2 + 0.2);
        if (surMontant && larg < baie * 0.7) continue;
      }
      it.boite = bx;
      it.curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
      it.curve.arcLengthDivisions = 400;                                       // vitesse régulière le long du trajet (pas d'à-coups)
      // UNE seule lecture de la vidéo par passage (plus de boucle : le raccord se voyait, coupures et répétitions) :
      // lecture ralentie pour couvrir le passage, et le passage raccourci si la vidéo, même ralentie, est plus courte
      // une seule lecture, très lente (jusqu'à 4 fois plus lente) ; le passage dure au moins 14 s : l'animal reste sous
      // son spot, presque immobile ; si la vidéo finit avant, il garde sa dernière bonne image en retournant dans le noir
      // clips longs (plongées, 15 à 50 s) : un passage en montre au plus JEU_MAX s, pris à un endroit au hasard,
      // toujours vers l'avant et à vitesse normale (jamais de boucle) ; d0/d1 = images de début et de fin (exclue) du passage
      const JEU_MAX = 22 * 30, nI = it.info.images ?? 300;
      it.d0 = (it.info.debut ?? 0) + (nI > JEU_MAX ? Math.floor(Math.random() * (nI - JEU_MAX)) : 0);
      it.d1 = Math.min(it.info.fin ?? it.d0 + nI, it.d0 + JEU_MAX);
      const T = (it.d1 - it.d0) / 30;
      // AUCUN ralenti (demande) : toujours lue à vitesse normale ; le passage dure au plus la vidéo
      const rate = 1;
      dur = FIXE ? T : Math.min(dur, T);   // immobile : visible exactement le temps de sa vidéo (jamais d'image figée)
      it.rate = Math.round(rate * 100) / 100;
      // le passage ne commence qu'une fois la vidéo calée sur la 1re image de sa plage (voir update) : plus d'apparition
      // au milieu du fondu, ni de l'image du passage précédent
      it.pret = false; it.video.__vue = false; it.video.preload = 'auto'; it.video.__cale = false;
      it.video.addEventListener('seeked', () => { it.video.__cale = true; }, { once: true });
      try { it.video.currentTime = it.d0 / 30; } catch (e) {}   // départ au début du passage choisi
      it.mur = mur; it.h = h; it.t0 = t; it.lance = t; it.dur = dur; it.actif = true; it.fixe = FIXE ? path[0] : null;
      const PL = { gauche: [-1, 0, 0, ROOM.width / 2], droite: [1, 0, 0, ROOM.width / 2], fond: [0, 0, -1, ROOM.length / 2], sol: [0, -1, 0, 0] };
      it.mesh.material.uniforms.uPlan.value.set(...PL[mur]);
      const versDroite = Math.sign(path[path.length - 1][0] - path[0][0]) * DROITE_VIDEO[mur];
      it.flip = it.c.dir ? versDroite !== it.c.dir : Math.random() < 0.5 && !it.c.dir;   // nage dans le bon sens
      it.angle = mur === 'sol' ? hasard(-Math.PI, Math.PI) : 0;
      it.mesh.visible = true;
      return true;
    }
    return false;
  }

  const compte = { lances: 0, echecs: 0, vides: 0 };   // contrôle (window.__salle.creatures.compte)
  const champ = new THREE.Frustum(), matChamp = new THREE.Matrix4(), boule = new THREE.Sphere();   // champ de la caméra
  let debut = null, dernierGrand = -1e9, dernierT = 0; const prochain = { false: 0, true: 0 };   // murs / sol : chacun son rythme
  // Requins : jamais au tout début de la visite (demande, 12/11), seulement après REQUINS secondes   ?requins=0 : dès le début
  const REQUINS = Number(new URLSearchParams(location.search).get('requins') ?? 45);
  const permis = (i, age) => !i.c.name.startsWith('requin') || age > REQUINS;
  // Vidéo ENTIÈRE en mémoire (téléchargée d'un bloc, lue depuis la mémoire) : l'animal peut venir, il ira jusqu'au bout
  // sans jamais attendre le réseau. (Le préchargement du navigateur s'arrête à mi-vidéo : 0-4,8 s sur 13 s, mesuré.)
  // Au plus MEMOIRE vidéos gardées : les plus anciennes inutilisées sont libérées (rechargées du cache si elles reviennent).
  const MEMOIRE = 40, enMemoire = [];
  const telecharge = (v) => {
    if (v.__blob || v.__fetch || v.__echec) return;
    const src = v.__src ??= v.src;
    v.__fetch = fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => {
      v.__blob = URL.createObjectURL(b); v.preload = 'auto'; v.src = v.__blob; v.load(); enMemoire.push(v);
    }).catch(() => { v.__echec = true; v.preload = 'auto'; }).finally(() => { v.__fetch = null; });
  };
  const libere = () => {
    while (enMemoire.length > MEMOIRE) {
      const k = enMemoire.findIndex((v) => !items.some((i) => i.video === v && (i.actif || i.chaud)));
      if (k < 0) return;
      const [v] = enMemoire.splice(k, 1);
      URL.revokeObjectURL(v.__blob); v.__blob = null; v.preload = 'none'; v.src = v.__src;
    }
  };
  const pretVideo = (i) => {
    const v = i.video;
    if (v.__echec) return v.readyState >= 4;   // téléchargement impossible : préchargement ordinaire du navigateur
    return !!v.__blob && v.src === v.__blob && v.readyState >= 2;
  };
  // PRÉCHARGEMENT : une dizaine d'animaux à venir ont toujours leur vidéo en cours de chargement (dont 2 grands).
  // Démarré dès l'ouverture de la page (pendant l'accueil) : à l'entrée, les premiers sont prêts.
  // par catégorie (sinon le hasard ne chargeait presque jamais les animaux du sol) : petits/moyens des murs, grands, sol
  const AVANCE = Number(new URLSearchParams(location.search).get('avance') ?? 10);
  // pendant l'accueil, moitié moins (la salle elle-même se charge encore) ; plein régime une fois entré
  const CATS = [[(i) => !i.sol && !i.c.grand, AVANCE, 5], [(i) => !i.sol && i.c.grand, 3, 1], [(i) => i.sol, 4, 2]];
  const chauffe = () => {
    const age = debut === null ? 0 : dernierT - debut;
    for (const [de, plein, accueil] of CATS) {
      const quota = debut === null ? accueil : plein;
      let n = items.filter((i) => de(i) && i.chaud && !i.actif).length;
      const cand = items.filter((i) => de(i) && !i.chaud && !i.actif && dernierT >= i.libre && permis(i, age));
      while (n < quota && cand.length) {
        const i = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
        i.chaud = true; n++;
      }
    }
    for (const i of items) if (i.chaud) telecharge(i.video);
    libere();
  };
  const vers = new THREE.Vector3();
  const update = (t, camera) => {
    dernierT = t;
    if (debut !== null) {
      const age = t - debut;
      // présence voulue : 0 au début, puis montée exponentielle jusqu'au maximum
      const k = age < 3 ? 0 : Math.min(1, (Math.exp(age / (MONTEE / 4)) - 1) / (Math.exp(4) - 1));
      for (const [groupe, max] of [[false, MAX_MURS], [true, MAX_SOL]]) {
        // Mise en scène : un premier animal tout de suite, puis montée rapide jusqu'au maximum (~35 s), et on s'y tient.
        // Chaque animal ne reste que le temps de sa vidéo (souvent 3 à 8 s) : avant, le suivant arrivait 6 à 13 s plus
        // tard, il n'y en avait presque jamais plus d'un (« 3 créatures en une minute », mesuré en ligne le 12/11).
        const cible = Math.min(max, (groupe ? [5, 14] : [2, 5, 9, 14, 19, 25]).filter((s) => age > s).length);
        const actifs = items.filter((i) => i.actif && i.sol === groupe).length;
        if (actifs < cible && t > prochain[groupe]) {
          // seulement des animaux dont la vidéo est DÉJÀ entièrement chargée (préchargées à l'avance, voir chauffe) :
          // jamais d'animal qui attend sa vidéo, apparaît en retard ou s'interrompt en route
          let libres = items.filter((i) => !i.actif && i.sol === groupe && t > i.libre && permis(i, age) && pretVideo(i) && !items.some((o) => o.actif && o.c.name === i.c.name));
          // un grand animal au moins toutes les ~80 s (le premier arrive tôt) ; sinon, au hasard
          const grands = libres.filter((i) => i.c.grand);
          if (!groupe && grands.length && t - dernierGrand > 50 && age > 12) libres = grands;   // boucle resserrée (13/11) : 80 → 50 s
          else if (!groupe) libres = libres.filter((i) => !i.c.grand || Math.random() < 0.35);
          if (!libres.length) compte.vides++;
          if (libres.length) {
            const it = libres[Math.floor(Math.random() * libres.length)];
            if (lance(it, t)) {
              it.chaud = false; compte.lances++;
              if (it.c.grand && !groupe) dernierGrand = t;
              // jamais deux d'un coup ; très rapprochées tant qu'il en manque beaucoup
              prochain[groupe] = t + (cible - actifs > 2 ? hasard(1.2, 2.5) : hasard(2.5, 5));   // rythme calmé (demande du 13/11) : les clips longs restent plus longtemps
            } else { prochain[groupe] = t + 0.5; compte.echecs++; }                                // pas de place libre : on réessaie un peu plus tard
          }
        }
      }
    }
    if (camera) { camera.updateMatrixWorld(); matChamp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); champ.setFromProjectionMatrix(matChamp); }
    for (const it of items) {
      if (!it.actif) continue;
      if (!it.pret) {   // vidéo pas encore positionnée au début de sa plage : invisible, l'horloge du passage attend
        const v = it.video;
        if (!v.seeking && v.readyState >= 2 && (v.__cale || Math.abs(v.currentTime - it.d0 / 30) < 0.05)) { it.pret = true; it.t0 = t; v.__vue = true; }
        else { it.t0 = t; it.mesh.visible = false; if (t - it.lance > 8) { it.actif = false; it.boite = null; it.libre = t + 20; } continue; }
      }
      const u = (t - it.t0) / it.dur;
      // jamais au-delà de la plage bonne : la vidéo s'arrête sur sa dernière bonne image (le passage se termine avec elle)
      if (it.pret && it.video.currentTime > it.d1 / 30 - 0.04 && !it.video.paused) it.video.pause();
      if (u >= 1) { it.actif = false; it.boite = null; it.mesh.visible = false; it.libre = t + hasard(12, 25); it.p.set(0, 0, 3); continue; }   // repart ; boucle resserrée (13/11, moins de créatures) : revient plus tôt
      // vitesse constante le long du chemin, adoucie seulement au départ et à l'arrivée (dans le noir) :
      // getPointAt suit la longueur réelle du trajet, sans accélérations d'un tronçon à l'autre
      const e = u < 0.15 ? 0.15 * Math.pow(u / 0.15, 2) / 2 / 0.85 : u > 0.85 ? 1 - 0.15 * Math.pow((1 - u) / 0.15, 2) / 2 / 0.85 : (u - 0.075) / 0.85;
      if (it.fixe) {
        it.p.set(...it.fixe);
        // disparitions adoucies (demande du 13/11 : « trop brusques ») : sortie plus longue que l'entrée (3 s, au plus 45 %
        // du passage), et courbe douce (smoothstep) : l'animal s'efface lentement jusqu'au noir, sans chute finale
        const fe = Math.min(FONDU, it.dur * 0.3), fs = Math.min(FONDU_SORTIE, it.dur * 0.45);
        const x = THREE.MathUtils.clamp(Math.min((t - it.t0) / fe, (it.t0 + it.dur - t) / fs), 0, 1);
        it.mesh.material.uniforms.uFondu.value = x * x * (3 - 2 * x);
      } else { it.curve.getPointAt(THREE.MathUtils.clamp(e, 0, 1), it.p); it.mesh.material.uniforms.uFondu.value = 1; }
      place(it.mesh, it.mur, [it.p.x, it.p.y, it.p.z]);
      // vidéo chargée à la demande : rien tant qu'elle n'a pas eu sa première image ; ensuite TOUJOURS visible
      // (un retour en boucle fait brièvement baisser readyState : l'animal clignotait, « petits sauts »)
      if (!it.video.__vue && it.video.readyState >= 2) it.video.__vue = true;
      // OPTIMISATION (13/11) : un animal hors du champ de la caméra n'est ni dessiné ni décodé (vidéo en pause, voir plus bas) ;
      // son passage continue quand même : en revenant dans le champ, la vidéo est recalée là où elle en serait
      boule.center.copy(it.mesh.position); boule.radius = it.h * 0.6 * Math.max(1, it.info.aspect) + 0.6;
      it.vu = !camera || champ.intersectsSphere(boule);
      it.mesh.visible = !!it.video.__vue && it.vu;
      // Volume : relief proportionné à la taille de l'animal (≈ ±0,3 m pour 4 m), et l'animal se tourne un peu
      // vers le visiteur (±35° au plus, en douceur) : de biais, il ne s'aplatit plus comme une image collée sur la vitre.
      it.mesh.scale.set(it.h * (it.flip ? -1 : 1), it.h, it.h * 0.35);
      if (it.mur === 'sol') it.mesh.rotation.z = it.angle;
      else if (camera && !it.fixe) {
        vers.subVectors(camera.position, it.mesh.position);
        const base = it.mesh.rotation.y, voulu = Math.atan2(vers.x, vers.z);
        let dl = voulu - base; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
        it.yaw = (it.yaw ?? 0) + (THREE.MathUtils.clamp(dl, -0.6, 0.6) - (it.yaw ?? 0)) * 0.03;
        it.mesh.rotation.y = base + it.yaw;
      }
      if (it.mur !== 'sol') it.mesh.rotation.z = (it.c.rot ?? 0) * (it.flip ? -1 : 1);   // corps remis à l'horizontale (image miroir : angle inversé)
      it.mesh.material.uniforms.uSoft.value = THREE.MathUtils.clamp((it.p.z - 0.5) / 2, 0, 1) * 0.8;   // à peine adouci au loin : reste net
    }
    // seules les vidéos des animaux présents ET dans le champ sont décodées (les autres en pause : la page reste fluide)
    if (debut !== null) for (const v of videos) {
      const actif = items.find((i) => i.actif && i.video === v);
      const utile = !!actif && actif.pret && actif.vu !== false && v.currentTime < actif.d1 / 30 - 0.04;   // fin de la plage bonne : reste en pause
      if (utile && v.paused) {
        // de retour dans le champ : recalée sur l'horloge du passage (jamais au-delà de la plage bonne)
        const voulu = Math.min(actif.d0 / 30 + (t - actif.t0), actif.d1 / 30 - 0.05);
        if (Math.abs(v.currentTime - voulu) > 0.2) { try { v.currentTime = voulu; } catch (e) {} }
        v.play().catch(() => {});
      }
      if (utile) {
        const r = 1;   // vitesse fixée au lancement (une seule lecture)
        if (v.playbackRate !== r) v.playbackRate = r;
      }
      else if (!utile && !v.paused) v.pause();
    }
    snow.material.uniforms.uTime.value = t;
  };
  update(0);
  setInterval(chauffe, 500);
  // l'accueil attend que quelques premières vidéos soient prêtes (au plus 12 s) : les premiers animaux arrivent à l'heure
  const premieres = new Promise((ok) => {
    const t0 = performance.now();
    const f = () => { chauffe(); if (items.filter((i) => i.chaud && pretVideo(i)).length >= 5 || performance.now() - t0 > 12000) ok(); else setTimeout(f, 300); };
    f();
  });
  // pour le son : position de chaque créature et sa distance dans l'obscurité
  const positions = items.map(() => ({ x: 0, y: 0, z: 0, dist: 3 }));
  const update2 = (t, camera) => { update(t, camera); items.forEach((it, i) => Object.assign(positions[i], { x: it.mesh.position.x, y: it.mesh.position.y, z: it.mesh.position.z, dist: it.actif ? it.p.z : 3 })); };
  // commence(t) : appelé à l'entrée dans la salle (avant, aucune créature)
  // lumière que chaque animal visible jette dans la salle : position, taille, couleur, force (proche de la vitre = fort)
  // hors champ aussi : la lueur d'un animal dans le dos peut tomber dans le champ
  const lumieres = () => items.filter((i) => i.actif && i.pret && i.video.__vue).map((i) => ({ pos: i.mesh.position, h: i.h, c: i.teinte,
    k: THREE.MathUtils.clamp(1 - (i.p.z - 0.4) / 2.6, 0, 1) * i.mesh.material.uniforms.uFondu.value })).sort((a, b) => b.k * b.h - a.k * a.h);
  return { update: update2, commence: (t) => { if (debut === null) debut = t; }, positions, videos, lumieres, items, premieres, compte };
}
