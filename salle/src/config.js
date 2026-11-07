// Salle de la Baleine, dispositif IMMERSION (2020), d'après le relevé validé sur photos.
// Repère (mètres) : y vers le haut, mur du fond à z = -L/2, côté entrée à z = +L/2.
export const ROOM = {
  length: 21,        // nef
  width: 8,
  height: 9,         // écrans du sol jusqu'en haut
  bays: 4,           // travées par mur long
  post: 0.28,        // montants noirs (section carrée)
  soffit: { h: 1.6, d: 0.8 }, // retombée brun foncé au-dessus du mur du fond
  backH: 7.4,        // écran du fond, sous la retombée (height - soffit.h)
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
  // Test d'écran volumétrique (mur du fond) : salle/tools/depth_video.py, panorama 52–62 s,
  // recadré sur 1080 px à partir de x = 1620 (la zone du mur du fond). ?relief=0 pour le désactiver.
  // En pause : la vidéo de test n'est pas encore calculée (trop lent sur Mac, à reprendre).
  relief: null, // { src: 'assets/test_rgbd.webm', panoPx: 4320, x: 1620, w: 1080, depth: 2.0 },
};
