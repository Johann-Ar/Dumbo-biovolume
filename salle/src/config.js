// Salle de la Baleine, dispositif IMMERSION (2020), reconstruite d'après la vidéo 4K
// (marche continue, caméra grand-angle) et comparée image par image : salle/blender/salle_v2.py.
// Mêmes dimensions que dans le script Blender (à garder identiques).
// Repère (mètres) : y vers le haut, mur du fond à z = -L/2, ouverture sur le hall historique à z = +L/2.
export const ROOM = {
  length: 23,        // nef
  width: 8,
  height: 8.5,       // écrans latéraux du sol jusqu'en haut
  bays: 4,           // travées par mur long
  post: 0.30,        // fentes noires (enfoncements) entre les écrans : murs découpés en écrans, remises à la demande
  backH: 8.5,        // écran du fond : toute la hauteur
  hall: { width: 13, depth: 11, height: 9.0 }, // salle d'accueil, plus petite et plus basse ; même plafond blanc à moulures que la salle d'expo
  ceiling: 9.0,      // plafond général (blanc, caissons à moulures), au-dessus des murs d'écrans
  ecranZ: 23 / 2 + 4.0, // mur-écran bleu de l'accueil (centre, épaisseur 0,5 m) : centré, proche de la salle d'expo ; on ne passe pas derrière
};

export const POV = {
  eye: 1.65,
  fov: 64,
  walk: 2.0,        // vitesse de marche (m/s), augmentée (1,3 avant)
  slow: 0.6,
  start: { x: 0.5, z: 11.2, yaw: 0, pitch: -0.02 }, // dans le hall, sous le squelette, face à la nef
  margin: 0.5,
};

// Les anciennes vidéos (panorama, sol) ne sont plus utilisées dans la salle.
export const MEDIA = {
  // Fond marin vu de dessus (tuile raccordable : couleur en haut, relief en bas). tuile = taille réelle (m).
  fonds: {
    a: { src: 'assets/fond/A_geomar.png', tuile: [3.6, 2.51], vitesse: 0.12 },   // nodules ~6 cm ≈ 15 px ; plaine à nodules, ~4 000 m (GEOMAR, Pacifique)
    // Vrai fond filmé presque à la verticale (GEOMAR, au large du Chili, ~900 m) : sédiment, brindilles,
    // trou bordé d'un tapis de bactéries blanches. Une seule prise, agrandie (~4x), bords fondus au noir.
    b: { video: 'assets/fond/B_geomar_chili.mp4', taille: [5.0, 8.9], centre: -2 },
    c: null,   // « en suspens » : pas de fond, de l'eau sous les pieds et des créatures qui passent dessous
  },
};
