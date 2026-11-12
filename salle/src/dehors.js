import * as THREE from 'three';
import { ROOM, MEDIA } from './config.js';

// Le monde extérieur, vu à travers les écrans comme à travers les hublots d'un sous-marin posé au fond.
// - Visible UNIQUEMENT dans les écrans (pochoir) : on ne voit jamais le hall ni le plafond à travers.
// - Aucune lumière n'est ajoutée dans la salle. L'impression d'une lumière centrale vient seulement
//   de l'éclairage calculé sur ce qui est dehors : proche des hublots = éclairé, loin = absorbé par
//   l'eau (le rouge disparaît d'abord, puis le vert, puis le bleu) jusqu'au noir.

const { length: L, width: W } = ROOM;

// Projecteurs du sous-marin : la salle est un sous-marin posé au fond, les écrans sont ses hublots.
// Des spots FIXES, invisibles (on ne voit que leur lumière), éclairent l'eau derrière les écrans :
// - murs longs : un spot au-dessus du milieu de CHAQUE écran, dirigé vers le bas ;
// - écran du fond : deux spots, chacun tourné vers l'intérieur ;
// - sol : deux grands spots, au centre de chaque moitié (deux carrés).
// Ils ne bougent pas, mais leur intensité vit (respiration lente, légères baisses, ondulation de l'eau).
// Dans un faisceau l'eau est bleutée et les animaux éclairés ; hors faisceau, presque noir ; le haut
// des écrans reste sombre. Un animal qui sort d'un faisceau s'éteint : ça justifie ses disparitions.
//   ?phares=1   force des contrastes de lumière (0 = éclairage uniforme comme avant)
const Q = new URLSearchParams(location.search);
export const PHARES = { uPhT: { value: 0 }, uPhK: { value: Number(Q.get('phares') ?? 1) } };
const { height: H, bays: NB } = ROOM;
const f2 = (x) => x.toFixed(3);
const v3 = (a) => `vec3(${a.map(f2).join(', ')})`;
// [origine, direction, cos bord extérieur, cos cœur, gain, étirement (x, y, z) : >1 = faisceau plus étroit dans cet axe]
const SPOTS = [];
for (let k = 0; k < NB; k++) {
  const z = -L / 2 + (k + 0.5) * (L / NB);
  for (const c of [-1, 1]) {
    const ph = SPOTS.length;
    SPOTS.push([[c * (W / 2 + 0.05), H - 0.35, z], [c * 0.36, -1, 0], 0.82, 0.98, 0.7, [1, 1, 1.2], 0.16, ph]);
    // débord du même spot (même respiration) : la lumière continue en fondu sur le sol vitré au pied de l'écran
    // portée allongée vers le centre : remplace en partie les anciens spots du sol
    SPOTS.push([[c * (W / 2 + 0.05), H - 0.35, z], [-c * 0.3, -1, 0], 0.87, 0.985, 0.4, [1, 1, 1.2], 0.22, ph]);   // portée un peu réduite (demande 12/11 : 0,14 → 0,22) : le centre du sol un peu moins éclairé
  }   // fixé en haut sur la paroi de l'écran, éclaire vers le bas et vers l'extérieur ; portée longue : le bord du faisceau déborde en fondu sur le sol vitré
}
for (const c of [-1, 1]) SPOTS.push([[c * (W / 2 - 1.1), H - 0.35, -L / 2 - 0.05], [-c * 0.42, -1, -0.36], 0.80, 0.98, 0.7, [1.1, 1, 1], 0.12]);   // sur la paroi de l'écran du fond, vers le bas et vers l'extérieur
// source de chaque spot vue sur l'écran : cœur net et lumineux, halo qui se fond (origines distinctes seulement)
const ORIGINES = [...new Map(SPOTS.map((sp) => [sp[0].join(','), sp])).values()];
const SOURCES_GLSL = ORIGINES.map(([o, , , , , , , ph], i) => `    d = p - ${v3(o)}; d2 = dot(d, d); s += (0.65 * exp(-d2 / 0.06) + 0.35 * exp(-d2 / 0.9)) * vie(${f2((ph ?? (SPOTS.length - ORIGINES.length + i)) * 2.399)});`).join('\n');
const SPOTS_GLSL = SPOTS.map(([o, d, c0, c1, g, e, f = 0.35, ph], i) =>
  `    float lg${i} = 0.009 * sin(uPhT * 0.13 + ${f2((ph ?? i) * 1.7)});   // largeur du faisceau : variation très légère et lente\n    s += spot(p, ${v3(o)}, normalize(${v3(d)}), ${f2(c0)} - lg${i}, ${f2(c1)} - lg${i} * 0.3, ${v3(e)}, ${f2(f)}) * ${f2(g)} * vie(${f2((ph ?? i) * 2.399)});`).join('\n');

// Éclairage de l'eau, partagé par le fond marin, les créatures, la neige et l'eau des écrans (coordonnées monde).
// Source imaginaire : une ligne au centre de la nef. Au-delà de 4 m (la surface des écrans), l'eau absorbe.
export const EAU = /* glsl */`
  uniform float uPhT, uPhK;
  // un spot : cône doux qui s'affaiblit avec la distance
  // e : étirement (faisceau elliptique) ; le centre est nettement plus lumineux que les bords (pénombre douce)
  float spot(vec3 p, vec3 o, vec3 d, float c0, float c1, vec3 e, float f){
    vec3 v = p - o; float l = max(length(v), 1e-3);
    vec3 ve = v * e; float c = dot(ve / max(length(ve), 1e-3), d);
    float k = smoothstep(c0, c1, c);
    return (0.55 * k + 0.45 * k * k * k) * 4.0 / (3.0 + l * l * f);
  }
  // intensité vivante d'un spot (phase propre) : respiration lente, petites variations, rares baisses
  float vie(float ph){
    float t = uPhT;
    float g = 0.82 + 0.12 * sin(t * 0.21 + ph) + 0.06 * sin(t * 0.67 + ph * 1.7);
    return g - 0.3 * smoothstep(0.97, 1.0, sin(t * 0.11 + ph * 3.1));
  }
  // somme des faisceaux en p (0 = ombre, ~1 = plein faisceau), avec l'ondulation de l'eau dans la lumière
  float phares(vec3 p){
    float s = 0.0;
${SPOTS_GLSL}
    float onde = 0.9 + 0.1 * sin(p.x * 1.3 + p.y * 0.9 + uPhT * 0.4) * sin(p.z * 1.1 - p.y * 0.7 - uPhT * 0.3);
    return 1.0 - exp(-1.6 * s * onde);
  }
  // éclat de la source des spots en p (0 loin, ~1 sur la source) : pour l'écran, là où le spot est fixé
  float sources(vec3 p){
    float s = 0.0; vec3 d; float d2;
${SOURCES_GLSL}
    return min(s, 1.5);
  }
  // lumière en p : bleutée dans les faisceaux, presque noire ailleurs, haut toujours plus sombre (ph = phares(p))
  float lumiereP(vec3 p, float ph){
    float haut = 1.0 - 0.8 * smoothstep(${(H * 0.35).toFixed(2)}, ${(H + 0.3).toFixed(2)}, p.y);
    return mix(1.0, mix(0.22, 1.35, ph) * haut, uPhK);
  }
  float lumiere(vec3 p){ return lumiereP(p, phares(p)); }
  // Éclairage « 2D » : la lumière de l'eau telle qu'elle est dessinée sur l'écran à travers lequel on voit le point p
  // (même calcul que l'eau des écrans, au même endroit de la vitre), quelle que soit la profondeur de p.
  // q : point sur la vitre ; renvoie la lumière b (0 = ombre, ~1 = plein faisceau).
  float lumEcran(vec3 p, out vec3 q){
    // q = là où le regard du visiteur traverse la vitre pour voir p (et non la projection perpendiculaire) : l'animal
    // reçoit exactement la lumière de la tache visible sur l'écran à cet endroit, quelle que soit sa profondeur
    vec3 o; vec3 c = cameraPosition, r = p - c; float t = 1.0;
    if (p.y < 0.0 && abs(p.x) < ${(W / 2).toFixed(2)} && p.z > ${(-L / 2).toFixed(2)}) { o = vec3(0.0, -1.0, 0.0); t = -c.y / min(r.y, -1e-4); }
    else if (abs(p.x) >= ${(W / 2).toFixed(2)}) { o = vec3(sign(p.x), 0.0, 0.0); t = (sign(p.x) * ${(W / 2).toFixed(2)} - c.x) / (abs(r.x) < 1e-4 ? sign(p.x) * 1e-4 : r.x); }
    else if (p.z <= ${(-L / 2).toFixed(2)}) { o = vec3(0.0, 0.0, -1.0); t = (${(-L / 2).toFixed(2)} - c.z) / min(r.z, -1e-4); }
    else { o = vec3(0.0, -1.0, 0.0); t = -c.y / min(r.y, -1e-4); }
    q = c + r * clamp(t, 0.0, 1.0);
    if (o.y < -0.5) q.y = 0.0; else if (abs(o.x) > 0.5) q.x = o.x * ${(W / 2).toFixed(2)}; else q.z = ${(-L / 2).toFixed(2)};
    q.y = clamp(q.y, 0.0, ${H.toFixed(2)});
    q.x = clamp(q.x, ${(-W / 2).toFixed(2)}, ${(W / 2).toFixed(2)}); q.z = clamp(q.z, ${(-L / 2).toFixed(2)}, ${(L / 2).toFixed(2)});   // reste sur l'écran (sinon, vu par l'angle, un animal prenait la lumière à la source d'un spot)
    return 0.3 * phares(q + o * 0.8) + 0.4 * phares(q + o * 2.0) + 0.3 * phares(q + o * 3.5);
  }
  // même chose, l'écran étant imposé (plan : normale o vers l'extérieur, à la distance d du centre) : toute la créature
  // prend la lumière de SON écran, sans basculer sur un écran voisin au milieu du corps (coupure droite dans les angles)
  float lumPlan(vec3 p, vec3 o, float d, out vec3 q){
    vec3 c = cameraPosition, r = p - c;
    float dn = dot(r, o), t = (d - dot(c, o)) / (abs(dn) < 1e-4 ? 1e-4 : dn);
    q = c + r * clamp(t, 0.0, 1.0);
    q -= o * (dot(q, o) - d);
    q.y = clamp(q.y, 0.0, ${H.toFixed(2)});
    return mix(0.3 * phares(q + o * 0.8) + 0.4 * phares(q + o * 2.0) + 0.3 * phares(q + o * 3.5), phares(q + o * 0.2), smoothstep(${(H * 0.45).toFixed(2)}, ${(H * 0.85).toFixed(2)}, q.y));
  }
  // couleur de l'eau de l'écran en q pour la lumière b (identique à screens.js)
  vec3 eauEcran(vec3 q, float b){
    float haut = 1.0;
    float v = mix(0.8, (0.06 + 4.5 * b * b + 1.2 * b) * haut, uPhK);
    return mix(vec3(0.0012, 0.0095, 0.052), vec3(0.0020, 0.019, 0.082), b) * v;
  }
  // absorption par l'eau seule (distance derrière l'écran). Distance mesurée à l'horizontale (la hauteur ne compte
  // pas : un animal haut de 8 m est éclairé partout), plus la profondeur sous le sol vitré.
  vec3 absorbe(vec3 p){
    vec2 a = vec2(0.0, ${(-L / 2 + 4).toFixed(2)}), b = vec2(0.0, ${(L / 2 - 4).toFixed(2)});
    vec2 ab = b - a; float h = clamp(dot(p.xz - a, ab) / dot(ab, ab), 0.0, 1.0);
    float horiz = max(length(p.xz - a - ab * h) - 4.0, 0.0);        // 4 m : les surfaces des écrans, toutes égales
    float k = length(vec2(horiz, max(-p.y, 0.0) * 0.8));
    return exp(-k * vec3(0.8, 0.5, 0.4)) * (1.0 - smoothstep(2.0, 3.6, k));   // noir complet vers 3,5 m derrière l'écran
  }
  vec3 eau(vec3 p){ return absorbe(p) * lumiere(p); }`;

// Matériau visible seulement dans les écrans (pochoir posé par les écrans).
export function fenetre(m) {
  m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc;
  m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
  return m;
}

// ---------- Fond marin : sous le sol vitré, et qui continue sous les murs ----------
// Vrai fond filmé par un robot sous-marin, remis « vu de dessus » (sources-creatures/redresse_fond.py) :
// une tuile raccordable, en haut la couleur, en bas le relief (blanc = plus haut).
// Le sol défile lentement sous la salle, comme sous un robot qui avance au ras du fond.
// La répétition de la tuile est cassée : deux couches de la même image, tournées et à des échelles
// différentes, mêlées selon un motif irrégulier. L'eau éteint le fond dans le noir loin des hublots.
// Choix dans l'adresse : ?fond=a (défaut) ou ?fond=b ; ?fond=0 pour aucun.
export function seabed(scene, { y = -0.9, size = [W + 14, L + 10], relief = 0.12 } = {}) {
  const choix = new URLSearchParams(location.search).get('fond') ?? 'c';   // version actuelle par défaut (a, b : anciennes)
  const f = MEDIA.fonds[choix];
  if (!f) return { mesh: null, video: null };
  if (f.video) return fondFilme(scene, f, y);
  const tex = new THREE.TextureLoader().load(f.src);
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  const mat = fenetre(new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTile: { value: new THREE.Vector2(...f.tuile) }, uRelief: { value: relief }, uScroll: { value: 0 }, ...PHARES },
    vertexShader: /* glsl */`
      uniform sampler2D map; uniform vec2 uTile; uniform float uRelief, uScroll; varying vec3 vW; varying vec2 vP;
      ${FOND}
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xz + vec2(0.0, uScroll);                                   // le sol avance vers l'entrée
        w.y += (sol(map, vP, uTile, true).r - 0.5) * uRelief;              // relief (nodules, cailloux)
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec2 uTile; varying vec3 vW; varying vec2 vP;
      ${EAU}
      ${FOND}
      vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main(){
        vec3 c = toLinear(sol(map, vP, uTile, false).rgb);
        gl_FragColor = vec4(c * eau(vW), 1.0);
      }`,
  }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1], 260, 340), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, -2);
  m.renderOrder = 51;
  m.frustumCulled = false;
  scene.add(m);
  const vitesse = f.vitesse ?? 0.12;                                     // m/s : allure d'un robot en transect
  return { mesh: m, video: null, update: (t) => { mat.uniforms.uScroll.value = t * vitesse; } };
}
// Vrai fond filmé (vidéo d'un robot, presque à la verticale) : une seule prise, jamais répétée.
// Posé sous le centre de la salle, il s'éteint en douceur dans le noir sur ses bords (l'eau, puis le noir).
function fondFilme(scene, f, y) {
  const video = Object.assign(document.createElement('video'), { src: f.video, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false;
  const [tx, tz] = f.taille;
  const mat = fenetre(new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, ...PHARES },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec3 vW; varying vec2 vUv;
      ${EAU}
      vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main(){
        vec2 q = vec2(vUv.y, vUv.x);                                   // l'image est couchée dans la longueur de la salle
        vec2 e = min(vUv, 1.0 - vUv);
        float bord = smoothstep(0.0, 0.22, e.x) * smoothstep(0.0, 0.14, e.y);   // bords fondus dans le noir
        gl_FragColor = vec4(toLinear(texture2D(map, q).rgb) * eau(vW) * bord, 1.0);
      }`,
  }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(tx, tz), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, f.centre ?? -2);
  m.renderOrder = 51; m.frustumCulled = false;
  scene.add(m);
  return { mesh: m, video, update: null };
}
// Lecture du sol : tuile répétée (couleur en haut, relief en bas), répétition cassée par deux couches.
const FOND = /* glsl */`
  float bruit(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
  vec4 lit(sampler2D map, vec2 q, bool haut){ q.y = fract(q.y); return texture2D(map, vec2(q.x, haut ? q.y * 0.5 : 0.5 + q.y * 0.5)); }
  vec4 sol(sampler2D map, vec2 p, vec2 tile, bool relief){
    vec2 q1 = p / tile;
    vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.79 + vec2(3.7, 1.3);      // deuxième couche : tournée, autre échelle
    vec2 q2 = r / tile;
    float k = smoothstep(0.35, 0.65, bruit(p * 0.45));                    // motif de mélange irrégulier (~2 m)
    return mix(lit(map, q1, relief), lit(map, q2, relief), k);
  }`;

// ---------- Neige marine ----------
// Référence : images de ROV (Schmidt Ocean Institute, MBARI). La neige n'est visible que là où la
// lumière l'atteint : dans les faisceaux des spots elle scintille doucement, hors faisceau elle disparaît.
// Particules surtout fines (1 à 6 mm), quelques amas plus gros ; les plus proches de la vitre sont de
// grosses taches pâles hors mise au point. Jamais de points nets et brillants (sinon : un ciel étoilé).
// Elles ne sont placées que là où on peut les voir (jusqu'à 3,5 m derrière chaque écran).
// Tout se calcule sur la carte graphique.   ?neige=1  intensité
export function marineSnow(scene, n = 10000) {
  const H = ROOM.height, P = 3.5;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n), plage = new Float32Array(n * 2);
  // volumes : murs longs, fond, sous le sol (au prorata de leur taille)
  const vols = [[2 * L * P * (H + 1.2), 'cote'], [W * P * (H + 1.2), 'fond'], [W * L * 1.2, 'sol']];
  const tot = vols.reduce((a, v) => a + v[0], 0);
  for (let i = 0; i < n; i++) {
    let r = Math.random() * tot, v = vols[0][1];
    for (const [w, nom] of vols) { if (r < w) { v = nom; break; } r -= w; }
    let x, y, z, y0 = -1.2, yh = H + 1.2;
    if (v === 'cote') { x = (Math.random() < 0.5 ? -1 : 1) * (W / 2 + Math.random() * P); z = (Math.random() - 0.5) * L; y = y0 + Math.random() * yh; }
    else if (v === 'fond') { x = (Math.random() - 0.5) * W; z = -L / 2 - Math.random() * P; y = y0 + Math.random() * yh; }
    else { x = (Math.random() - 0.5) * W; z = (Math.random() - 0.5) * L; yh = 1.2; y = y0 + Math.random() * yh; }   // sous le sol : y reste sous le sol
    pos.set([x, y, z], i * 3); plage.set([y0, yh], i * 2); seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('plage', new THREE.BufferAttribute(plage, 2));
  const NEIGE = Number(Q.get('neige') ?? 1.0);
  const mat = fenetre(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uNeige: { value: NEIGE }, ...PHARES },
    vertexShader: /* glsl */`
      attribute float seed; attribute vec2 plage; uniform float uTime, uScale, uNeige; varying vec3 vC; varying float vA, vRot, vEl, vFlou, vForme;
      ${EAU}
      void main(){
        vec3 p = position;
        // la salle DESCEND : la neige MONTE devant les écrans (vitesse relative de la descente, un peu différente pour chacune)
        float sol = step(plage.y, 2.0);                                         // particules sous le sol vitré
        p.y = mix(mod(p.y - plage.x + uTime * (0.42 + 0.3 * seed), plage.y) + plage.x, p.y, sol);
        // sous le sol : presque immobiles, elles se renouvellent (fondu d'apparition / disparition, puis ailleurs)
        float vie = uTime * (0.035 + 0.03 * seed) + seed * 11.0, cyc = floor(vie), age = vie - cyc;
        vec2 saut = fract(sin(vec2(cyc * 12.9898 + seed * 78.233, cyc * 39.346 + seed * 11.135)) * 43758.5453) - 0.5;
        p.xz += sol * saut * vec2(3.0, 6.0);
        p.xz = mix(p.xz, clamp(p.xz, vec2(${(-W / 2).toFixed(2)}, ${(-L / 2).toFixed(2)}), vec2(${(W / 2).toFixed(2)}, ${(L / 2).toFixed(2)})), sol);
        p.y += sol * 0.04 * sin(uTime * 0.2 + seed * 30.0);
        p.x += 0.22 * sin(uTime * (0.7 + 0.8 * seed) + seed * 40.0);          // petite dérive dans le courant
        p.z += 0.22 * cos(uTime * (0.55 + 0.6 * seed) + seed * 17.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float z = -mv.z;
        // tailles très variées (référence : photo de ROV) : beaucoup de fines particules, quelques flocons, rares gros morceaux
        float r1 = fract(seed * 13.7), r2 = fract(seed * 7.13);
        float taille = r1 < 0.03 ? 0.025 + 0.02 * r2 : r1 < 0.2 ? 0.010 + 0.008 * r2 : 0.004 + 0.005 * r2 * r2;
        float size = taille * uScale / z;
        float flou = smoothstep(2.5, 0.7, z);                                  // tout près de l'œil : flou, pâle
        size *= 1.0 + 2.0 * flou;
        // filé vertical : la particule bouge pendant la pose (traînée), d'autant plus qu'elle est petite et proche
        float file = 1.0 + (1.0 - sol) * clamp((0.42 + 0.3 * seed) * 0.05 * uScale / z / max(size, 1.0), 0.0, 4.0);
        float px = max(size, 2.0);
        vEl = file;                                                           // rapport hauteur / largeur
        vA = (size / px) * (size / px) * (0.5 + 0.5 * r2) * (1.0 - 0.6 * flou) / sqrt(file);
        vA *= 0.93 + 0.07 * sin(uTime * (0.25 + 0.3 * seed) + seed * 60.0);
        vA *= mix(1.0, smoothstep(0.0, 0.25, age) * smoothstep(1.0, 0.75, age), sol);    // éclat qui varie très lentement (pas de clignotement)
        // visible SEULEMENT dans la lumière des spots (blanc légèrement bleuté)
        float ph = phares(p);
        vC = mix(vec3(0.72, 0.84, 0.92), vec3(0.95, 0.95, 0.9), ph) * eau(p) * (0.03 + 2.6 * ph * ph) * uNeige;   // quasi invisible hors des faisceaux
        vRot = (r2 - 0.5) * 0.6; vFlou = flou; vForme = fract(seed * 29.3);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = px * file;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA, vRot, vEl, vFlou, vForme;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        q.x *= vEl;                                                           // sprite carré, particule étirée en hauteur
        q = mat2(cos(vRot), -sin(vRot), sin(vRot), cos(vRot)) * q;
        // forme : petit éclat irrégulier (rectangle arrondi), pas un point rond lumineux
        vec2 d = abs(q) / vec2(0.32 + 0.12 * vForme, 0.5);
        float boite = 1.0 - smoothstep(0.55, 1.0, max(d.x, d.y * (1.0 + 0.0 * vForme)) * 0.8 + length(d) * 0.25);
        float a = mix(boite, exp(-dot(q, q) * 10.0) * 0.7, vFlou);            // flou : tache douce
        gl_FragColor = vec4(vC * a * vA, 1.0);
      }`,
  }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  scene.add(pts);
  return pts;
}
