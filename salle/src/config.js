// Salle de la Baleine, dispositif IMMERSION (2020), d'après le relevé validé sur photos.
// Repère (mètres) : y vers le haut, mur du fond à z = -L/2, côté entrée à z = +L/2.
export const ROOM = {
  length: 21,        // nef
  width: 8,
  height: 9,         // écrans du sol jusqu'en haut
  bays: 4,           // travées par mur long
  post: 0.28,        // montants noirs (section carrée)
  canopy: { width: 4.8, depth: 0.6, inset: 0.5 }, // caisson suspendu ≈ 60 % de la largeur
  ceilH: 10.5,       // plafond d'origine, au-dessus du caisson
  door: { w: 2.0, h: 2.6 },
  corridorLen: 4.0,
};

export const POV = {
  eye: 1.65,
  fov: 64,
  walk: 1.3,
  slow: 0.6,
  start: { x: 0, z: 12.5, yaw: 0, pitch: -0.02 },
  margin: 0.5,
};

export const MEDIA = {
  panorama: '../videos/panorama_v5.webm', // bande continue : mur gauche -> fond -> mur droit
  floor: '../videos/ecran_06.webm',
};
