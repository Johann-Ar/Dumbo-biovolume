import * as THREE from 'three';
import { ROOM } from './config.js';
import { fenetre, EAU, PHARES } from './dehors.js';

// Écrans plats : murs longs, fond et sol, du sol jusqu'en haut.
// Ce sont des hublots : on voit au travers le monde extérieur (dehors.js, creatures.js).
const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// Hublot, avec les fentes des montants tous les uBay mètres (comme avant), qui restent hors du hublot.
// L'eau derrière la vitre n'est pas uniforme : éclairée par les phares du sous-marin (dehors.js), elle est
// bleutée dans les faisceaux et retombe presque au noir entre eux ; le haut des écrans reste sombre.
// out = direction vers l'extérieur (on regarde la lumière dans l'eau, 1 à 3 m derrière la vitre).
const vertW = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
function holeMaterial(len, bay, out) {
  return new THREE.ShaderMaterial({
    uniforms: { uLen: { value: len }, uBay: { value: bay }, uPost: { value: ROOM.post / 2 }, uEau: { value: EAU_FOND }, uOut: { value: out }, ...PHARES },
    vertexShader: vertW,
    fragmentShader: /* glsl */`
      uniform float uLen, uBay, uPost, uEau; uniform vec3 uOut; varying vec2 vUv; varying vec3 vW;
      ${EAU}
      void main(){
        float m = vUv.x * uLen;
        float k = floor(m / uBay + 0.5);                 // fentes seulement ENTRE deux écrans (jamais aux bords : écrans jointifs avec le sol)
        if (k > 0.5 && k < uLen / uBay - 0.5 && abs(m - uBay * k) < uPost) discard;
        // lumière diffusée dans l'eau, le long du regard derrière la vitre
        float b = 0.3 * phares(vW + uOut * 0.8) + 0.4 * phares(vW + uOut * 2.0) + 0.3 * phares(vW + uOut * 3.5);
        // vers le haut (sommet des cônes) : la lumière juste derrière la vitre, non moyennée en profondeur -> sommet net
        b = mix(b, phares(vW + uOut * 0.2), smoothstep(${(ROOM.height * 0.45).toFixed(2)}, ${(ROOM.height * 0.85).toFixed(2)}, vW.y));
        float haut = 1.0;   // ni bande sombre ni dégradé bleu en haut des écrans
        float v = mix(0.8, (0.06 + 4.5 * b * b + 1.2 * b) * haut, uPhK);
        vec3 bleu = mix(vec3(0.0012, 0.0095, 0.052), vec3(0.0020, 0.019, 0.082), b);   // le faisceau tire un peu vers le cyan
        gl_FragColor = vec4(bleu * v * uEau, 1.0);
      }`,
  });
}
// ?eau=1 : lueur bleutée de l'eau derrière les écrans (0 = noir complet, 2 = plus visible)
const EAU_FOND = Number(new URLSearchParams(location.search).get('eau') ?? 1.0)   // entre-deux : écrans distincts sans perdre l'obscurité;

// Chaque écran est un hublot, en deux passes sur la même surface :
// 'mask' : pose le pochoir (là où l'écran est vraiment visible) et le remplit de noir (l'eau) ;
// puis le monde extérieur se dessine dans le pochoir (dehors.js) ;
// 'seal' : écrit la profondeur de la surface : rien de la salle ou du hall ne se voit à travers.
function asWindow(m, mode) {
  if (mode === 'mask') {
    Object.assign(m, { depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp });
  } else if (mode === 'add') {
    fenetre(Object.assign(m, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  } else {
    fenetre(Object.assign(m, { transparent: true, colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth }));
  }
  return m;
}
const ORDER = { mask: 50, vide: 50.5, add: 3, seal: 4 };
// 'vide' : juste après le pochoir, la profondeur est remise au plus loin DANS le hublot. Ce qu'on voit à travers les écrans
// est ainsi dans une autre dimension : aucun élément de la maquette (murs, plafond, poutres derrière les écrans) ne peut
// plus le couper ni le masquer (c'était l'origine des barres noires qui rognaient les créatures).
function videMaterial(len, bay) {
  return new THREE.ShaderMaterial({
    uniforms: { uLen: { value: len }, uBay: { value: bay }, uPost: { value: ROOM.post / 2 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }`,
    fragmentShader: `uniform float uLen, uBay, uPost; varying vec2 vUv;
      void main(){ float m = vUv.x * uLen; float k = floor(m / uBay + 0.5);
        if (k > 0.5 && k < uLen / uBay - 0.5 && abs(m - uBay * k) < uPost) discard;
        gl_FragColor = vec4(0.0); }`,
    colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  });
}

// Surface des écrans : mate comme un vrai écran de musée. Le reflet n'est qu'un léger voile, sans couleur,
// qui s'ajoute à l'image sans jamais la masquer (pas d'effet miroir). Réglable : ?reflet=0..1 (défaut 0.25).
const REFLET = Number(new URLSearchParams(location.search).get('reflet') ?? 0.1);   // l'accueil est noir désormais : plus de grand rectangle clair   // 0 par défaut : le reflet de la salle d'accueil (très claire) faisait un grand rectangle clair sur les écrans
function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { envMap: { value: null }, uK: { value: REFLET } },
    vertexShader: `varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform samplerCube envMap; uniform float uK; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(vW - cameraPosition), N = normalize(vN);
        float c = clamp(abs(dot(V, N)), 0.0, 1.0);
        float F = 0.01 + 0.25 * pow(1.0 - c, 5.0);                 // surface mate : reflet faible même en biais
        vec3 refl = textureCube(envMap, reflect(V, N)).rgb;
        float l = dot(refl, vec3(0.2126, 0.7152, 0.0722));          // sans couleur : pas de lumière multicolore sur l'image
        gl_FragColor = vec4(vec3(min(l, 1.0) * F * uK), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export class Screens {
  constructor(scene) {
    const { length: L, width: W, height: H, bays, backH } = ROOM;
    // Les anciennes vidéos (panorama, sol) sont retirées : les écrans sont de simples hublots noirs
    // (pochoir), à travers lesquels on voit le monde extérieur de dehors.js et creatures.js.
    const add = (w, h, m, pos, ry, rx = 0) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.copy(pos); o.rotation.set(rx, ry, 0, 'YXZ'); scene.add(o); return o; };
    const win = (w, h, pos, ry, rx = 0, bay = 1e3, out = new THREE.Vector3()) => {
      ['mask', 'seal'].forEach((md) => { add(w, h, asWindow(holeMaterial(w, bay, out), md), pos, ry, rx).renderOrder = ORDER[md]; });
      add(w, h, videMaterial(w, bay), pos, ry, rx).renderOrder = ORDER.vide;
    };
    // hublots jusqu'au plafond (et pas 50 cm plus bas) : plus de bande de mur sombre qui coupait les créatures en haut
    const HC = H;   // hauteur normale des écrans (8,5 m) : la barre noire est réglée par la remise à zéro de la profondeur, pas par leur taille
    win(L, HC, new THREE.Vector3(-W / 2, HC / 2, 0), Math.PI / 2, 0, L / bays, new THREE.Vector3(-1, 0, 0));
    win(W, HC, new THREE.Vector3(0, HC / 2, -L / 2), 0, 0, W, new THREE.Vector3(0, 0, -1));
    win(L, HC, new THREE.Vector3(W / 2, HC / 2, 0), -Math.PI / 2, 0, L / bays, new THREE.Vector3(1, 0, 0));
    win(W, L, new THREE.Vector3(0, 0, 0), 0, -Math.PI / 2, 1e3, new THREE.Vector3(0, -1, 0));   // sol : hublot sur le fond marin

    // Épaisseur des écrans : au bout des murs d'écrans, côté salle d'accueil, la tranche de l'écran (8 cm) se voit
    // en biais, comme un vrai écran posé (et plus un plan d'un pixel). Noir mat, comme le cadre d'un écran.
    const EP = 0.08, tranche = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.8, metalness: 0.0 });
    // (tranche au bout des murs d'écrans retirée : elle créait un amas à la jonction avec l'accueil)
    // joints entre deux écrans d'un même mur : les écrans ont une vraie épaisseur (15 cm), on voit leurs tranches
    // dans le joint, et le fond du joint en retrait (avant : deux plans d'un pixel, comme des calques)
    const PROF = 0.15, J = ROOM.post, baie = L / bays;
    for (const c of [-1, 1]) for (let k = 1; k < bays; k++) {
      const z = -L / 2 + k * baie;
      for (const sz of [-1, 1]) {   // les deux tranches qui bordent le joint
        const tr = new THREE.Mesh(new THREE.BoxGeometry(PROF, HC, 0.02), tranche);
        tr.position.set(c * (W / 2 + PROF / 2), HC / 2, z + sz * (J / 2 + 0.01)); scene.add(tr);
      }
      const fond = new THREE.Mesh(new THREE.BoxGeometry(0.02, HC, J + 0.04), tranche);   // fond du joint, en retrait
      fond.position.set(c * (W / 2 + PROF + 0.01), HC / 2, z); scene.add(fond);
    }

    // Vrais écrans : une surface de verre plate devant chaque image (reflet de la salle selon l'angle,
    // presque invisible de face). L'image reste derrière : plate aujourd'hui, en relief plus tard.
    this.glass = [];
    const g = (w, h, pos, ry, rx = 0) => { const o = add(w, h, glassMaterial(), pos, ry, rx); o.renderOrder = 6; this.glass.push(o); };
    g(L, H, new THREE.Vector3(-W / 2 + 0.005, H / 2, 0), Math.PI / 2);
    g(L, H, new THREE.Vector3(W / 2 - 0.005, H / 2, 0), -Math.PI / 2);
    g(W, backH, new THREE.Vector3(0, backH / 2, -L / 2 + 0.005), 0);
    g(W, L, new THREE.Vector3(0, 0.005, 0), 0, -Math.PI / 2);

    // Lumière que les écrans renvoient dans la salle : couleurs FIXES, mesurées sur les anciennes vidéos
    // (moyenne sur toute leur durée, en linéaire), pour garder exactement la même luminosité de salle.
    const C = (r, g, b) => new THREE.Color(r, g, b);
    const bay = L / bays;
    this.lights = [];
    const light = (w, h, pos, color) => this.lights.push({ color, center: pos, area: w * h });
    for (let k = 0; k < bays; k++) light(bay, H, new THREE.Vector3(-W / 2, H / 2, L / 2 - (k + 0.5) * bay), C(0.0039, 0.0043, 0.0049));
    light(W, backH, new THREE.Vector3(0, backH / 2, -L / 2), C(0.0016, 0.0012, 0.0017));
    for (let k = 0; k < bays; k++) light(bay, H, new THREE.Vector3(W / 2, H / 2, -L / 2 + (k + 0.5) * bay), C(0.0032, 0.0031, 0.0037));
    light(W, L, new THREE.Vector3(0, 0, 0), C(0.024, 0.022, 0.07));   // sol : même luminance, bleu moins saturé
    const n = bays;
    this.groups = { left: this.lights[0].color, back: this.lights[n].color, right: this.lights[n + 1].color, floor: this.lights[2 * n + 1].color };
  }


  setEnv(cube) { for (const o of this.glass) o.material.uniforms.envMap.value = cube; }

  get videos() { return []; }

  update() {}

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
