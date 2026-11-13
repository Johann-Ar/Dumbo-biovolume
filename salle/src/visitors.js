import * as THREE from 'three';
import { XE } from './presentation.js';
import { ROOM } from './config.js';
import { SplatMesh, SplatEdit, SplatEditSdf, dyno } from '@sparkjsdev/spark';

// Visiteurs « apparitions » : chaque visiteur n'est montré que par des POSES FIXES, une à la fois.
// Une pose apparaît en fondu, reste quelques secondes, s'efface ; puis la même personne réapparaît un peu plus loin
// (une pose sur ~30 de son trajet). Aucun glissement, aucune traînée. La pose n'est jamais une image figée :
// ses gaussiennes respirent doucement et une partie s'en détache en fumée (volutes qui montent et s'effacent).
// Seules les poses utilisées sont chargées (≈ 48 morceaux au lieu de 1 280) : la salle reste fluide.
//   ?visiteurs=0.7   intensité (0 = invisibles)      touches [ et ]
//   &ecart=30        une pose sur N du trajet
//   &tenue=5         secondes de présence d'une pose (hors fondus)
//   &brume=1         force de l'animation de brume (0 = figée)
//   &teinte=0.9      assombrit les silhouettes
//   &pres=6          rayon (m) autour du visiteur réel où les visiteurs deviennent transparents
//   touche V : afficher / masquer
export async function addVisitors(scene, params, base = 'assets/visitors/') {
  const info = await fetch(base + 'slices.json').then((r) => r.json());
  const pers = await fetch(base + 'personnes.json').then((r) => r.ok ? r.json() : null, () => null);
  if (!pers) return () => {};
  const N = info.slices;
  const ECART = Number(params.get('ecart') ?? 8);   // une pose sur 8 (avant 30 : quatre fois plus de poses)
  const TENUE = Number(params.get('tenue') ?? 5);
  const FONDU = Number(params.get('fondu') ?? 2.8);   // fondus d'entrée / de sortie (s) : lents, doublés
  const VIDE = Number(params.get('vide') ?? 1.5);      // temps sans rien entre deux poses d'un même visiteur (s) : divisé par deux (demande, 12/11)
  const ESPACE = Number(params.get('espace') ?? 3.2);  // deux poses visibles jamais plus proches que ça (m) : pas de silhouettes qui se superposent
  const s = {
    intensity: Number(params.get('visiteurs') ?? 0.8),
    tint: Number(params.get('teinte') ?? 0.9),
    visible: true,
  };
  const BRUME = Number(params.get('brume') ?? 1);

  // Rayon autour de nous où un visiteur s'efface en entier (il ne gêne jamais la vue, jamais en fragments)
  const R = Number(params.get('pres') ?? 6.0);

  // ---------- Brume animée (calculée sur la carte graphique, gaussienne par gaussienne) ----------
  // Repère du morceau : z = vers le haut (rotation -90° en x). Chaque gaussienne a sa phase (son index) :
  // elles flottent de quelques centimètres, scintillent un peu, et la brume « monte » très lentement.
  const temps = dyno.dynoFloat(0);
  const force = dyno.dynoFloat(BRUME);
  const brume = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: 'float', k: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs, outputs }) => [
        `${outputs.gsplat} = ${inputs.gsplat};`,
        `{`,
        `  vec3 c = ${inputs.gsplat}.center; float t = ${inputs.t}; float k = ${inputs.k};`,
        `  float h1 = fract(float(${inputs.gsplat}.index) * 0.6180339);`,
        `  float h2 = fract(float(${inputs.gsplat}.index) * 0.7548777 + 0.31);`,
        `  float ph = h1 * 6.2831853;`,
        // corps : respiration lente et continue (aucun saut), la silhouette reste lisible
        `  vec3 w = vec3(sin(t * 0.45 + c.z * 2.3 + ph), sin(t * 0.38 + c.x * 2.1 + ph * 1.7), 0.4 * sin(t * 0.31 + c.y * 1.9 + ph * 2.3));`,
        `  vec3 off = w * 0.015;`,
        `  float big = max(${inputs.gsplat}.scales.x, max(${inputs.gsplat}.scales.y, ${inputs.gsplat}.scales.z));`,
        `  float sc = min(1.0, 0.055 / max(big, 1e-4)) * (1.0 + 0.06 * sin(t * 0.5 + ph * 2.0));`,
        `  float a = smoothstep(0.08, 0.22, ${inputs.gsplat}.rgba.a);`,
        // fumée : une partie des grains se détache en volutes SUR PLACE (elle ne monte pas), s'élargit et s'efface ; elle renaît invisible
        `  float fume = step(0.55, h2) * k;`,
        `  float vie = fract(t * (0.06 + 0.05 * h1) + h2 * 7.0);`,
        `  float v2 = vie * vie;`,
        `  vec3 tour = vec3(sin(t * 0.7 + ph + vie * 5.0 + c.z * 3.0), cos(t * 0.6 + ph * 1.3 + vie * 4.0 + c.x * 3.0), 0.0);`,
        `  off += fume * (vec3(0.0, 0.0, 0.05 * sin(t * 0.5 + ph * 3.0) * vie) + tour * (0.10 * vie));`,   // fumeux autour du corps, sans monter
        `  sc *= 1.0 + fume * 2.2 * vie;`,
        `  a *= mix(1.0, smoothstep(0.0, 0.12, vie) * (1.0 - smoothstep(0.35, 1.0, vie)) * 0.85, fume);`,
        `  ${outputs.gsplat}.center = c + off;`,
        `  ${outputs.gsplat}.scales *= sc;`,
        `  ${outputs.gsplat}.rgba.a *= clamp(a, 0.0, 1.0);`,
        `}`,
      ],
    });
    return { gsplat: d.apply({ gsplat, t: temps, k: force }).gsplat };
  });

  // Salle d'accueil : gaussiennes BRUTES, telles que capturées (ni fumée, ni teinte, ni taille retouchée).
  // Seul effet : un léger balancement du corps, sans ajouter ni retirer de matière ; les pieds restent au sol.
  const brut = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs, outputs }) => [
        `${outputs.gsplat} = ${inputs.gsplat};`,
        `{`,
        `  vec3 c = ${inputs.gsplat}.center; float t = ${inputs.t};`,
        `  float haut = smoothstep(0.0, 1.8, c.z);`,   // 0 aux pieds, 1 à la tête
        `  vec3 off = vec3(0.025 * sin(t * 0.55 + c.z * 0.8), 0.018 * sin(t * 0.43 + c.z * 0.6 + 1.3), 0.004 * sin(t * 0.9)) * haut;`,
        `  ${outputs.gsplat}.center = c + off;`,
        `}`,
      ],
    });
    return { gsplat: d.apply({ gsplat, t: temps }).gsplat };
  });

  // ---------- Poses retenues : une sur ECART, décalées d'une personne à l'autre ----------
  const parPersonne = {};
  // poses mal détectées (deux personnes collées, morceaux détachés : tools/visiteurs_doubles.py) : jamais montrées
  // poses ratées (de profil et floues, traînées, trop pâles : voir tableau_visiteurs.html) : jamais montrées
  const exclues = await fetch(base + 'exclues.json').then((r) => r.ok ? r.json() : {}, () => ({}));
  for (const o of pers.morceaux) if (!o.double && !exclues[o.url]) (parPersonne[o.personne ?? 0] ??= [])[o.tranche] = o;
  // visiteurs en FRAGMENTS (morceaux de corps, poses trouées) : jamais montrés. Une personne dont la pose habituelle
  // est bien plus maigre que celle des autres n'est qu'un fragment ; d'une pose à l'autre, les poses trop maigres sont sautées.
  const mediane = (l) => { l = [...l].sort((a, b) => a - b); return l[l.length >> 1] ?? 0; };
  const medPers = Object.fromEntries(Object.entries(parPersonne).map(([p, l]) => [p, mediane(l.filter(Boolean).map((o) => o.n))]));
  const medTous = mediane(Object.values(medPers));
  for (const p of Object.keys(parPersonne)) if (medPers[p] < 0.7 * medTous) delete parPersonne[p];   // retire les personnes 2 et 6 (≈ 870 gaussiennes contre ≈ 1 400)
  const personnes = Object.keys(parPersonne).map(Number);
  const choix = personnes.map((p, i) => {
    const dec = Math.round((i * ECART) / personnes.length * 0.7) % ECART;
    const l = [];
    // autour de chaque pas, la pose la plus « normale » (nombre de gaussiennes proche de la médiane de la personne) :
    // ni trouée, ni trop dense (les poses très pleines faisaient des silhouettes trop blanches)
    const ns = parPersonne[p].filter(Boolean).map((o) => o.n).sort((a, b) => a - b), med = ns[ns.length >> 1] ?? 0;
    for (let j = dec; j < N; j += ECART) {
      let best = null;
      const R = Math.min(4, Math.floor((ECART - 1) / 2));   // fenêtre de recherche plus petite que le pas : jamais deux fois la même pose
      for (let d = -R; d <= R; d++) { const o = parPersonne[p][(j + d + N) % N]; if (o && o.n > 0.8 * med && (!best || Math.abs(o.n - med) < Math.abs(best.n - med))) best = o; }
      if (best) l.push(best);
    }
    return l;
  });

  // BRUT (demande, 12/11) : les poses telles qu'elles sont (noir et blanc d'origine), sans fumée, sans balancement,
  // sans teinte : aucune déformation. ?brut=0 : ancienne fumée ; ?balance=1 : léger balancement
  const BALANCE = params.get('balance') === '1';
  // FRAMES BRUTES (demande, 12/11) : les visiteurs sont des images 2D de vraies personnes suivies dans la vidéo
  // (assets/ghosts/tracks, les mêmes qui ont servi à fabriquer les gaussiennes). Elles sont montrées telles quelles :
  // une image plate, en noir et blanc (même conversion que tools/mono_visitors.py), sans déformation ni miroir,
  // tournée face à la caméra au moment où elle apparaît, puis immobile. ?gaussiennes=1 : anciennes gaussiennes.
  const FRAMES = params.get('gaussiennes') !== '1';
  const TR = 'assets/ghosts/tracks/';
  const nbTr = FRAMES ? await fetch(TR + 'tracks.json').then((r) => r.json()) : [];
  const chargeur = new THREE.TextureLoader();
  const tex = nbTr.map((n, t) => Array.from({ length: n }, (_, j) => { const x = chargeur.load(`${TR}t${t}_${String(j).padStart(2, '0')}.png`); x.premultiplyAlpha = true; return x; }));   // prémultipliée : pas de liseré blanc au bord
  // STOCK de visiteurs (tools/extrait_visiteurs.py : des centaines de personnes découpées dans la vidéo de la vraie
  // salle) : chaque pose a SA photo, jamais la même partout. Chargées seulement quand elles apparaissent.
  // Sans stock (ou ?stock=0) : les 35 anciennes images (tracks).
  const PL = 'assets/ghosts/pool/';
  const infoPool = FRAMES && params.get('stock') !== '0' ? await fetch(PL + 'pool.json').then((r) => r.ok ? r.json() : { n: 0 }, () => ({ n: 0 })) : { n: 0 };
  // exclues : pas de vraies silhouettes (taches, bras seul, drap, forme couchée, trop floues), vues sur la planche du 12/11
  const horsPool = new Set(infoPool.exclues ?? []);
  const texPool = [];
  const ordreP = Array.from({ length: infoPool.n }, (_, i) => i).filter((i) => !horsPool.has(i));   // ordre mélangé (fixe) : deux poses voisines ont des photos éloignées dans la vidéo
  const nPool = ordreP.length;
  for (let i = nPool - 1, r = 12345; i > 0; i--) { r = (r * 1103515245 + 12345) % 2147483648; const j = r % (i + 1); [ordreP[i], ordreP[j]] = [ordreP[j], ordreP[i]]; }
  // TOUTES chargées dès l'ouverture, pendant la page d'accueil (WebP : 2,7 Mo au lieu de 28 Mo en PNG) : avant, chacune
  // se chargeait quand sa pose apparaissait, et en ligne les visiteurs arrivaient en retard, vides ou mal proportionnés
  const chargesPool = [];
  for (const i of ordreP) {
    chargesPool.push(new Promise((ok) => {
      const x = chargeur.load(`${PL}v_${String(i).padStart(4, '0')}.webp`, ok, undefined, ok);   // erreur : on n'attend pas plus
      x.premultiplyAlpha = true; texPool[i] = x;
    }));
  }
  const photo = (graine) => texPool[ordreP[graine % nPool]];
  let graines = 0;
  const plan = new THREE.PlaneGeometry(1, 1);
  const TRANSP = Number(params.get('vtransp') ?? 0.38);   // opacité des visiteurs (demande, 12/11 : « blanc transparent », fondus dans la salle)
  const creeFrame = (o) => {
    const t = (o.personne ?? 0) % tex.length, l = tex[t], img = nPool ? photo(graines++) : l[Math.floor((o.tranche / N) * l.length) % l.length];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      // fondus dans la salle : éclairés par sa lumière (uCol : bleu des écrans + lueur des animaux proches, mise à jour
      // chaque image) et semi-transparents (les parties sombres plus encore) : la salle se voit à travers
      uniforms: { map: { value: img }, uOp: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) }, uTr: { value: TRANSP } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float uOp, uTr; uniform vec3 uCol; varying vec2 vUv;
        void main(){ vec4 c = texture2D(map, vUv); vec3 rgb = c.rgb / max(c.a, 0.001); float b = max(rgb.r, max(rgb.g, rgb.b));
          b = pow(clamp((b - 0.08) / 0.7, 0.0, 1.0), 1.1); float a = c.a * uOp * uTr * mix(0.45, 1.0, b); if (a < 0.004) discard;
          gl_FragColor = vec4(b * uCol, a); }`,
    });
    const m = new THREE.Mesh(plan, mat);
    m.userData.visiteur = true;   // exclu du reflet des écrans (main.js, captureEnv)
    const H = 1.72, asp = img.image ? img.image.width / img.image.height : 0.5;
    m.scale.set(H * asp, H, 1);
    if (!img.image) img.onUpdate = () => m.scale.set(H * img.image.width / img.image.height, H, 1);
    m.position.set(o.centre[0], o.centre[2], -o.centre[1]);   // repère Blender (x, y, z) -> page (x, z, -y)
    Object.defineProperty(m, 'opacity', { get: () => mat.uniforms.uOp.value, set: (v) => { mat.uniforms.uOp.value = v; } });
    m.renderOrder = 3;
    return m;
  };
  const cree = (o, packed, estBrut = false) => {
    if (FRAMES) return creeFrame(o);
    const mod = estBrut ? (BALANCE ? brut : undefined) : brume;
    const opt = mod ? { objectModifier: mod } : {};
    const m = packed ? new SplatMesh({ packedSplats: packed, ...opt }) : new SplatMesh({ url: base + o.url, ...opt });
    m.userData.visiteur = true;
    m.rotation.x = -Math.PI / 2;
    m.position.set(o.centre[0], o.centre[2], -o.centre[1]);   // repère Blender (x, y, z) -> page (x, z, -y)
    m.opacity = 0;   // plus de sphère d'effacement : un visiteur trop proche disparaît EN ENTIER (jamais en fragments)
    if (!estBrut) m.recolor = new THREE.Color(s.tint, s.tint, s.tint);
    return m;
  };
  // salle d'expo : un « fantôme » par personne, avec sa liste de poses
  const BRUT = params.get('brut') !== '0';
  const fantomes = choix.map((l, i) => ({ poses: l.map((o) => ({ o, m: cree(o, null, BRUT), brut: BRUT, pers: personnes[i], parent: scene })) }));
  if (!FRAMES) await Promise.all(fantomes.flatMap((f) => f.poses.map((p) => p.m.initialized)));

  // salle d'expo : un 2e groupe (mêmes données), tourné d'un demi-tour : plus de monde, sans charger plus
  // salle d'accueil, plus fréquentée : cinq groupes (mêmes données, partagées), tournés et décalés
  const GROUPES = [[Math.PI, 0, 0]];
  // salle d'expo un peu plus fréquentée (demande, 12/11) : groupes en plus, décalés le long de la nef, sans tourner
  // de côté (tournés d'un quart de tour, ils sortaient de la salle)   ?expoplus=0 pour les retirer
  const NB_EXPO = Number(params.get('expoplus') ?? 3);
  for (let i = 0; i < NB_EXPO; i++) GROUPES.push([i % 2 ? Math.PI : 0, ((i * 0.618) % 1 - 0.5) * 1.2, (i % 2 ? -1 : 1) * (2.5 + 2 * Math.floor(i / 2)), 1, 'expo']);
    // salle d'accueil : seulement DEVANT le mur-écran (derrière, la salle n'est pas accessible)
  if (params.get('accueil') !== '0') GROUPES.push([Math.PI / 2, -2.6, 12.8], [-Math.PI / 2, -2.6, 13.8], [Math.PI / 2, 1.5, 13.6],
    [-Math.PI / 2, 1.0, 12.5]);
  // petits visiteurs et enfants : groupes EN PLUS (les visiteurs existants ne changent pas), mêmes poses à taille réduite
  // [rotation, x, z, échelle] ; les pieds restent au sol (le groupe est réduit depuis le sol)   ?enfants=0 pour les retirer
  if (params.get('enfants') !== '0') {
    GROUPES.push([Math.PI / 2, 0.6, -2.5, 0.62], [-Math.PI / 2, -0.6, 2.5, 0.72]);
    if (params.get('accueil') !== '0') GROUPES.push([0, -0.8, 13.0, 0.6], [Math.PI, 1.2, 13.4, 0.7]);
  }
  // salle d'accueil bien plus fréquentée (une dizaine à la fois) : groupes en plus, gardés seulement DANS l'accueil
  const NB_ACC = Number(params.get('accueilplus') ?? 16);
  if (params.get('accueil') !== '0') for (let i = 0; i < NB_ACC; i++)
    GROUPES.push([i * 2.399, ((i * 0.618) % 1 - 0.5) * 7, 15.2 + ((i * 0.381) % 1 - 0.5) * 4, i % 3 === 2 ? 0.68 : 1, 'acc']);
  {
    for (const [ry, gx, gz, ech = 1, zone] of GROUPES) {
      const g = new THREE.Group();
      g.rotation.y = ry; g.position.set(gx, 0, gz); g.scale.setScalar(ech); scene.add(g); g.updateMatrixWorld(true);
      // poses des groupes créées SEULEMENT quand elles apparaissent (des milliers d'objets d'un coup : chargement de 70 s)
      for (const f of choix.map((l, i) => ({ zone, poses: l.map((o, k) => ({ o, m: null, base: fantomes[i].poses[k].m, brut: BRUT, pers: personnes[i], parent: g })) })))
        fantomes.push(f);
    }
  }
  // position réelle (monde) de chaque pose : pour l'espacement et l'éclairage
  for (const f of fantomes) for (const p of f.poses) { const v = new THREE.Vector3(p.o.centre[0], p.o.centre[2], -p.o.centre[1]); p.w = p.parent === scene ? v : p.parent.localToWorld(v); }
  // jamais de visiteur juste devant l'écran de présentation de la salle d'accueil (x = XE, z ≈ 18,9, tourné vers la salle) :
  // l'écran reste net, sans brume blanche devant, même vu de biais
  // ni collé au mur-écran, ni derrière lui, ni dans les murs de l'accueil
  const devantEcran = (w) => (Math.abs(w.x - XE) < 5.0 && w.z > ROOM.ecranZ - 1.3) || w.z > ROOM.ecranZ - 0.6
    || (w.z > ROOM.length / 2 + 0.3 && Math.abs(w.x) > ROOM.hall.width / 2 - 0.6);
  // à la jonction salle d'expo / accueil, contre le bout des murs d'écrans : le visiteur y était coupé par le mur (fragments)
  const contreMur = (w) => Math.abs(w.z - ROOM.length / 2) < 1.6 && Math.abs(w.x) > ROOM.width / 2 - 1.0;
  const horsZone = (f, w) => (f.zone === 'acc' && w.z < ROOM.length / 2 + 0.8) || (f.zone === 'expo' && w.z > ROOM.length / 2 - 0.5);
  // salle d'expo : jamais derrière les murs d'écrans ni derrière le mur du fond (les groupes tournés en plaçaient
  // dehors : on les voyait « dans » les écrans, à travers les hublots)
  const dansMur = (w) => w.z < ROOM.length / 2 + 0.3 && (Math.abs(w.x) > ROOM.width / 2 - 0.7 || w.z < -ROOM.length / 2 + 0.7);
  let nMur = 0;
  for (const f of fantomes) f.poses = f.poses.filter((p) => { const m = dansMur(p.w); nMur += m; return !m && !devantEcran(p.w) && !contreMur(p.w) && !horsZone(f, p.w); });
  console.info(`visiteurs : ${nMur} poses hors de la salle retirées`);
  for (let i = fantomes.length - 1; i >= 0; i--) if (!fantomes[i].poses.length) fantomes.splice(i, 1);
  // rythme : même période pour tous, départs répartis régulièrement (ordre mélangé) : une apparition toutes les
  // période/n secondes, jamais plusieurs en même temps (des périodes différentes dérivaient et se regroupaient)
  const PERIODE = TENUE + 2 * FONDU + VIDE + 0.75;
  const ordre = fantomes.map((_, i) => i).sort(() => Math.random() - 0.5);
  fantomes.forEach((f, i) => { f.periode = PERIODE; f.phase = (ordre[i] + 0.5) / fantomes.length * PERIODE; f.cycle = -1; f.saute = false; });
  // accueil : présence longue (tenue x 2, presque pas de vide) pour qu'il y ait une dizaine de visiteurs à la fois
  for (const f of fantomes) if (f.zone === 'acc') { f.periode = 2 * TENUE + 2 * FONDU + 0.5; f.tenue = 2 * TENUE; f.phase = Math.random() * f.periode; }
  const LONG = 23 / 2;                                  // au-delà (z) : salle d'accueil (pas de bleu des écrans)
  const col = new THREE.Color();
  let eclair = null;

  addEventListener('keydown', (e) => {
    if (e.key === '[') s.intensity = Math.max(0, s.intensity - 0.1);
    if (e.key === ']') s.intensity = Math.min(1, s.intensity + 0.1);
    if (e.code === 'KeyV') s.visible = !s.visible;
  });

  // DE FACE (demande, 12/11) : chaque pose a un sens (le corps regarde dans le sens de sa marche, PATHS de
  // tools/slice_visitors.py, repère page x, z ; personne n = trajet n). Au moment où elle apparaît, la pose est tournée
  // sur elle-même (axe vertical) pour faire face à la caméra, puis ne bouge plus.
  const PATHS = [[[-2.5, 9.0], [-1.5, -8.0]], [[2.5, -9.0], [1.0, 8.0]], [[-1.0, 10.5], [2.5, -2.0]], [[3.0, 2.0], [-3.0, 6.0]],
    [[0.0, -6.0], [-2.8, -10.0]], [[-5.0, 14.0], [4.0, 12.5]], [[2.0, 15.0], [-2.0, 12.0]], [[0.5, 6.0], [0.5, -4.0]]];
  const AVANT = Number(params.get('avant') ?? 0);   // correction (rad) si le devant des poses n'est pas le sens de marche
  const tourne = (p, camera) => {
    if (!camera) return;
    const pr = p.parent === scene ? 0 : p.parent.rotation.y;
    if (FRAMES) { p.m.rotation.set(0, Math.atan2(camera.position.x - p.w.x, camera.position.z - p.w.z) - pr, 0); return; }
    if (!PATHS[p.pers]) return;
    const [[ax, az], [bx, bz]] = PATHS[p.pers];
    const devant = Math.atan2(bx - ax, bz - az) + AVANT + (p.parent === scene ? 0 : p.parent.rotation.y);
    p.m.rotation.z = Math.atan2(camera.position.x - p.w.x, camera.position.z - p.w.z) - devant;
  };
  const lisse = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  update.pret = Promise.all(chargesPool);   // main.js l'attend avant d'ouvrir la salle
  return update;
  function update(t, camera, e) {
    if (e) eclair = e;
    const dt = Math.min(0.1, Math.max(0, t - (update.t ?? t))); update.t = t;
    temps.value = t;
    // fumée : recalculée à chaque image (fluide, sans à-coups) ; seules les poses visibles sont concernées
    const bouge = BRUME > 0;
    let nAcc = 0, nExpo = 0;
    for (const f of fantomes) {
      const x = (t + f.phase) / f.periode, cycle = Math.floor(x), u = (x - cycle) * f.periode;
      const k = cycle % f.poses.length;
      // nouvelle pose : si une autre pose visible est trop près (même endroit, ou presque), celle-ci est sautée
      if (cycle !== f.cycle) {
        f.cycle = cycle; const w = f.poses[k].w;
        f.saute = fantomes.some((g) => g !== f && g.occupe && g.poses[g.cycle % g.poses.length].w.distanceTo(w) < (w.z > ROOM.length / 2 ? 1.5 : ESPACE));   // jamais deux visiteurs côte à côte (accueil : plus serré, il est petit et doit être fréquenté)
      }
      // trop près de nous : la silhouette entière s'efface (fondu court, uniforme), sinon elle est entière
      const wk = f.poses[k].w, loin = !camera || Math.hypot(wk.x - camera.position.x, wk.z - camera.position.z) > (wk.z > ROOM.length / 2 ? 2.5 : R);   // accueil, plus petite : rayon réduit
      f.pres = Math.min(1, Math.max(0, (f.pres ?? 1) + (loin ? 1 : -1) * dt / 0.35));
      const o = !s.visible || f.saute ? 0 : f.pres * (u < FONDU ? lisse(u / FONDU) : u < FONDU + (f.tenue ?? TENUE) ? 1 : lisse(1 - (u - FONDU - (f.tenue ?? TENUE)) / FONDU));
      f.occupe = !f.saute && u < 2 * FONDU + (f.tenue ?? TENUE);      // sa pose occupe la place (fondus compris)
      f.poses.forEach((p, i) => {
        const op = i === k ? o * s.intensity : 0;
        // poses éteintes : sorties de la scène (le moteur traite toutes les gaussiennes présentes, même masquées)
        const on = op > 0.004;
        if (!p.m) { if (!on) return; p.m = cree(p.o, p.base.packedSplats, p.brut); }
        p.m.opacity = op;
        if (op > 0.3) { if (p.w.z > LONG) nAcc++; else nExpo++; }
        if (!on && p.m.parent) p.m.removeFromParent();
        else if (on && !p.m.parent) { tourne(p, camera); p.parent.add(p.m); }
        if (on) {
          // la silhouette prend un peu la couleur de la salle : bleu des écrans (salle d'expo) et lumière des animaux proches
          col.setScalar(1);
          if (FRAMES) {
            // images brutes : entièrement éclairées par la salle ; accueil : lumière plus neutre et douce
            if (eclair && p.w.z < LONG) col.copy(eclair.amb).multiplyScalar(0.7); else col.setRGB(0.62, 0.68, 0.82);
            if (eclair) for (const l of eclair.lums) { const d = l.pos.distanceTo(p.w); if (d < l.h * 2.5) { const f = 0.9 * l.k * (1 - d / (l.h * 2.5)); col.r += l.c.r * f; col.g += l.c.g * f; col.b += l.c.b * f; } }
            p.m.material.uniforms.uCol.value.copy(col);
            return;
          }
          if (eclair && p.w.z < LONG) {
            col.lerp(eclair.amb, 0.3);                       // un peu de bleu seulement : ils restent bien lisibles
            for (const l of eclair.lums) { const d = l.pos.distanceTo(p.w); if (d < l.h * 2.5) { const f = 0.45 * l.k * (1 - d / (l.h * 2.5)); col.r += l.c.r * f; col.g += l.c.g * f; col.b += l.c.b * f; } }
          }
          if (!p.brut) { p.m.recolor.copy(col).multiplyScalar(s.tint); if (bouge) p.m.updateVersion(); }
          else if (BALANCE) p.m.updateVersion();
        }
      });
    }
    update.accueil = nAcc; update.expo = nExpo;   // visiteurs bien visibles dans l'accueil (contrôle)
  }
}
