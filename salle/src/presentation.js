import * as THREE from 'three';
import { ROOM } from './config.js';

// Texte de présentation de la salle d'accueil, posé sur le mur bleu (salle/blender/salle_v2.py : 8,9 × 3,8 m,
// centré, face à l'entrée de la salle d'expo). Plus d'écran ni de vidéo : logo et texte blancs, traduction anglaise
// sous chaque paragraphe. ?presentation=0 pour le retirer, ?texte=0.75 pour régler le blanc.
const TEXTE = [
  'Une salle en descente dans les abysses. Ses parois deviennent des hublots',
  'ouverts sur un monde que personne ne peut voir de ses yeux.',
  'Ici se trouvent des espèces rares, parfois filmées une seule fois,',
  'qui surgissent de l\'obscurité, s\'approchent, puis y retournent.',
];
const SANS = '"Helvetica Now Text", "Helvetica Neue", Helvetica, Inter, Arial, sans-serif';

// centré sur le sol de la salle d'accueil (x = 0), et non plus sur la face du sas (x = 2,5)
export const XE = 0;
export const YE = 1.85;   // centre de l'image : marges régulières dans le mur bleu (8,9 × 3,8 m)

// traduction anglaise des paragraphes (le titre reste tel quel), en dessous, plus fine et plus petite
const TEXT_EN = [
  'A room descending into the abyss. Its walls become portholes',
  'opening onto a world no one can see with their own eyes.',
  'Here live rare species, sometimes filmed only once,',
  'emerge from the darkness, draw near, then return to it.',
];

// Plus d'écran : seulement le logo et le texte, blancs, posés sur le mur bleu (fond transparent, pas de vidéo,
// pas de cadre). Dessiné une seule fois.
export function presentationScreen(scene) {
  const w = 8.5, h = 3.5;   // presque tout le mur bleu (8,9 × 3,8 m)
  const cw = 2048, ch = Math.round(cw * h / w);
  const canvas = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = canvas.getContext('2d');
  const logo = Object.assign(new Image(), { src: '../img/presences_rares_logo_lisse.png' });   // contours lissés : lisible de loin
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const clair = Number(new URLSearchParams(location.search).get('texte') ?? 0.54);   // juste sous le seuil du halo (0,55, postfx.js) : blanc (#dbdbdb après ACES), net, sans lueur
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(clair, clair, clair), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(XE, YE, ROOM.ecranZ - 0.25 - 0.012);              // sur la face avant du mur bleu (ecranZ - 0,25)
  m.rotation.y = Math.PI;                                           // tourné vers la salle d'exposition
  scene.add(m);   // le texte ne se reflète pas dans le sol (seuls le panneau et les spots, reflet.js)

  function dessine() {
    g.clearRect(0, 0, cw, ch);
    // mise en page : titre, sous-titre, puis chaque paragraphe en français suivi de sa traduction ; bloc centré en hauteur
    const lignes = [];   // [texte, police, interlettrage, opacité, avance avant la ligne]
    lignes.push(['DUMBO', `700 185px ${SANS}`, 12, 1, 0]);
    lignes.push(['PRÉSENCES ABYSSALES RARES', `700 66px ${SANS}`, 4, 1, 90]);
    for (const [a, b] of [[0, 2], [2, 4]]) {
      TEXTE.slice(a, b).forEach((l, i) => lignes.push([l, `500 38px ${SANS}`, 0, 0.95, i ? 50 : (a ? 72 : 95)]));
      TEXT_EN.slice(a, b).forEach((l, i) => lignes.push([l, `400 29px ${SANS}`, 0.5, 0.62, i ? 38 : 44]));
    }
    const total = lignes.reduce((s, l) => s + l[4], 0) + 133 + 8;      // capitale de DUMBO -> bas de la dernière ligne
    let y = (ch - total) / 2 + 133;
    const larg = Math.max(...lignes.map(([t, police, esp]) => { g.font = police; if ('letterSpacing' in g) g.letterSpacing = esp + 'px'; return g.measureText(t).width; }));
    const L = 290, gap = 70, lx = Math.max(40, (cw - (L + gap + larg)) / 2), x = lx + L + gap;   // logo + texte centrés sur le mur                        // logo à gauche du texte, centré verticalement
    if (logo.complete && logo.naturalWidth) g.drawImage(logo, lx, (ch - L) / 2, L, L);
    g.textBaseline = 'alphabetic';
    for (const [t, police, esp, op, av] of lignes) {
      y += av; g.font = police; if ('letterSpacing' in g) g.letterSpacing = esp + 'px';
      g.fillStyle = `rgba(255,255,255,${op})`;
      // bord gauche de l'ENCRE aligné sur x (le D de 150 px a une marge de lettre plus grande que le P de 54 px)
      g.fillText(t, x + g.measureText(t).actualBoundingBoxLeft, y);
    }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    tex.needsUpdate = true;
  }
  logo.onload = dessine;
  if (document.fonts?.ready) document.fonts.ready.then(dessine);
  dessine();
  return { video: null, update() {} };
}
