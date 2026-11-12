# Prompt de reprise — projet « Dumbo – Présences abyssales rares »

Copie tout ce qui suit dans une nouvelle discussion Claude Code ouverte sur le dossier
`/Users/johann/Documents/Projet Portfolio/Dumbo-biovolume`.

---

Tu reprends un projet en cours. Lis ce message en entier avant d'agir.

## Règles de travail (obligatoires)
- Réponds toujours en **français**, simplement, avec des commandes prêtes à copier.
- Ne fais **jamais** de commit, de push ni de publication sans mon accord explicite.
- Ne télécharge rien d'externe sans me demander.
- Ne copie pas de fichiers de polices sous licence.
- Le site ne doit pas se faire passer pour le musée : garder la mention « Proposition pour le Musée océanographique de Monaco ».
- Vocabulaire : je dis « **salle d'expo** » (la nef aux écrans) et « **salle d'accueil** » (le hall d'entrée). Ne jamais écrire « Salle de la Baleine ».
- Après chaque modification, synchronise la copie de test (voir plus bas), puis vérifie dans le navigateur.
- Le navigateur garde les anciens fichiers JS en cache : pour tester, recharger avec **Cmd + Maj + R**
  (ou, en JS : `fetch('/salle/src/<fichier>.js', {cache:'reload'})` puis `location.reload()`).

## Le projet
Portfolio : une salle immersive en 3D dans le navigateur (Three.js r180 + Spark pour les « gaussian splats »).
On entre dans une salle d'expo dont les murs sont des écrans-hublots ouverts sur les abysses. Des créatures
abyssales réelles (vidéos détourées) nagent derrière les écrans. Des visiteurs fantômes en noir et blanc
(gaussiennes) traversent la salle comme sur une **photo en pose longue**.

Vision artistique : la salle est un sous-marin au fond de l'océan, les écrans sont des hublots, les
créatures sont à échelle réelle, et la seule lumière vient des projections.

### Fichiers clés (`salle/`)
- `index.html` : page d'accueil (fond vidéo `../videos/background_mobile.webm`, logo poulpe animé au chargement,
  bouton play, mention « Proposition pour… » **centrée** en haut), overlay pause `#pause` (flou) quand on fait Échap.
- `src/main.js` : assemblage. Salle en gaussiennes (`assets/room_splat.compressed.ply`) avec des « gommes »
  (SplatEditSdf) qui effacent certaines zones. Sol de la salle d'accueil = maillage `hallfloor` gris 0x50545b,
  découpé (discard) sous l'emprise de la salle d'expo. Arrivée **immobile** (plus d'avancée automatique) ;
  les créatures commencent après l'arrivée (`creatures.commence`).
- `src/screens.js` : écrans = hublots (pochoir stencil : passes mask/seal). Fentes de 30 cm seulement ENTRE
  deux écrans (plus aux bords, pour que murs et sol soient jointifs). Couleur de l'eau un peu moins bleue.
- `src/edges.js` : géométrie nette. Murs d'écrans pleins (corps sombres) derrière les écrans, dessinés
  APRÈS les hublots et seulement hors d'eux (stencil ≠ 1, renderOrder 55). Séparations entre écrans =
  **enfoncements** (fentes 30 × 25 cm), pas des piliers.
- `src/creatures.js` : créatures (vidéos webm avec alpha dans `assets/creatures_hd/`, sinon repli sur
  `assets/creatures/`). Pas de chevauchement (boîtes de trajet), évitement doux des jonctions d'écrans
  pour les petites créatures lentes, taille minimale relevée, mouvement à vitesse constante (getPointAt),
  fondu vers transparent dans le noir.
- `src/visitors.js` : visiteurs « pose longue ». 80 poses (`assets/visitors/`, 640 morceaux). Une silhouette
  de tête qui glisse en continu, et derrière elle TOUTES les poses passées à la suite (`PAS=1`) plus une
  copie intermédiaire entre deux poses (`INTER=1`), en fondu continu. Réglages d'URL : `&depart=0.2`
  (opacité de la traînée), `&trainee=` (longueur), `&inter=0` (sans copies), `&pres=3` (zone d'effacement
  autour de la caméra), `&saut=0.6`, `&trace=420` (ancienne trace en traits, abandonnée : je ne l'aimais pas).
- `src/son.js` : ambiance sonore. Volume général `VOLUME = 0.5` (baissé de 50 %).


### Mise à jour 11 nov. 2026 (après-midi)
- **Optimisation** : voir `RAPPORT_OPTIMISATION.md`. Créatures en H.264 3 panneaux (`pile: 3`, `.mp4`, repli `.webm`), son à 3 voix + réverb 2,6 s.
- **Hall (salle d'accueil)** : éclairci, couleurs calées sur la vraie vidéo (`capture-salle/salle_immersion_4k_luma.mp4` : pierre beige, plafond chaud) — PAS blanc (refusé « trop blanche »). Boîtes SplatEdit multiply ×2.0 teinte chaude + add léger ; plans de fond beige derrière les gaussiennes (plafond, murs, mur côté expo hors ouverture). `?accueilclair=1` = d'origine.
- **Écran d'accueil** : cadre rectangulaire de largeur ÉGALE sur 4 bords (référence bord droit, 9 cm, gris bleuté clair `0xc3ccd6`), `?cadre=`.
- **Sources 4K retrouvées** (disque T7) : `/Volumes/T7 Shield/projets_personnel/holosene_projets/dumbo-biovolume/VideoMatting/` : `videos-source/01-08` (3840×2160) et `final/<scène>/` = 52 scènes DÉJÀ détourées (PNG RGBA 16 bits, SAM 2). Ce sont les espèces du panorama, en vraie qualité.
  Audit : bords propres en général ; défauts = fondus début/fin (retirés), animal coupé par le bord d'image (bord adouci), halo sombre sur 5 scènes (nettoyage du pack). Exclues : 04-Scene-009, 08-Scene-0005 (vides), 04-Scene-052 (morceaux).
  Lot : `sources-creatures/lot_t7.sh` (liste `lot_t7.txt`, 49 noms ; `prepare_t7.py` → `creature_pack.py --largeur 1440` → recode H.264 → `qualite_creatures.py`). Suivi `lot_t7.fait`, journal `lot_t7.log`. Les 49 sont déjà dans `ESPECES` (ignorées tant que pas prêtes).
- `qualite_creatures.py` mesure maintenant le seul panneau couleur (px = moitié) ; `tailleMax` = min(px/110, utile/55).

### Chaîne des créatures (`/Users/johann/Documents/Projet Portfolio/sources-creatures/`)
- `detourer.py` : détourage, détection des changements de plan (garde le plus long plan), mouvement de caméra
  mesuré sur le DÉCOR (flux optique, écrit `camera.json`), trous intérieurs rebouchés (la détection ne mange
  plus l'intérieur des créatures).
- `creature_pack.py` : stabilisation d'après `camera.json` (jamais d'après l'animal), remplacement des images
  où la détection a « lâché », encodage webm.
- `lot_v2.sh` + `lot_hd.txt` : traitement par lot ; `lot_v2.fait` liste ce qui est fini (24/24 terminé).
- Python : `/Users/johann/Documents/Projet Portfolio/Video-Depth-Anything/.venv/bin/python -I`.

### Tester
Serveur de test (dans la copie de test) :
```bash
cd "/Users/johann/Library/Application Support/Claude/scratch-workspaces/96238fde-69f4-4f69-bf92-b3b62f8ca2d1/41fa9884-4dbc-4490-be1c-b45496119fca/scratch-2026-11-07-c4f47c/site-test" && python3 -m http.server 8766
```
Synchroniser après chaque modification :
```bash
rsync -a --exclude .git --exclude capture "/Users/johann/Documents/Projet Portfolio/Dumbo-biovolume/" "/Users/johann/Library/Application Support/Claude/scratch-workspaces/96238fde-69f4-4f69-bf92-b3b62f8ca2d1/41fa9884-4dbc-4490-be1c-b45496119fca/scratch-2026-11-07-c4f47c/site-test/"
```
(Si ce dossier de test n'existe plus, servir directement `Dumbo-biovolume` avec `python3 -m http.server 8766`.)

URL de test : http://localhost:8766/salle/index.html?fond=c&creatures=c
(`&auto` saute l'accueil, `&visiteurs=0` retire les visiteurs, `&creatures=0` retire les créatures.)

## ÉTAT LE PLUS RÉCENT (11 nov. 2026) — lire en premier
### Fait le 11 nov.
- **Visiteurs refaits** (`src/visitors.js`, ancienne version : scratchpad `visitors_avant_poses_fixes.js`) : plus de glissement ni de traînée.
  Chaque visiteur = UNE pose fixe qui apparaît en fondu (1,4 s), reste ~5 s, s'efface ; la suivante apparaît plus loin
  (une pose sur 30 du trajet de 160 → ~6 poses par personne). Seules ces poses sont chargées (≈ 48 morceaux au lieu de 1 280).
  Brume animée sur la carte graphique (Spark `dyno`, `objectModifier`) : flottement, gonflement, scintillement, montée lente.
  Réglages : `?ecart=30&tenue=5&brume=1&visiteurs=0.7`. Mesuré : ~6,5 ms par image (médiane), aucune erreur.
- **Chargement** : les 41+ vidéos de créatures ne sont plus préchargées (`preload: 'none'`, chargées quand l'animal entre,
  hors écran, en bas). Page prête en ~4 s au lieu de > 1 min.
- **Créatures** : montée renforcée (naissent sous l'écran, sortent par le HAUT, 0,10–0,18 m/s) ; jusqu'à 6 aux murs + 3 au sol ;
  mise en scène : calme au début, puis de plus en plus, puis par VAGUES (toutes les 50 s après 70 s, 14 s où tout arrive coup sur coup),
  jamais vide (≥ 3 murs, ≥ 1 sol après la montée).
- **Taille selon la qualité réelle** : `tools/qualite_creatures.py` → `assets/creatures_hd/qualite.json` (netteté mesurée) ;
  hauteur max = min(px/220, utile/110) m, au moins 2,8 m. Plus de créatures pixelisées de près.
- **Volume** (retour : « effet d'aplatissement » de près) : créatures plus loin derrière la vitre (0,9–1,4 m, grands 1,4–2 m),
  relief proportionnel à la taille (z = h×0,35), et l'animal se tourne doucement vers le visiteur (±35°). À juger sur place.
- **Retirées (texte/graphisme incrusté ou changement de plan)** : nouvelle_01, 05 (« G E ASG »), 07 (« MAPPING »), 12 (lettres), 16 (trait jaune).
  À surveiller aussi : meduse_ambre, meduse_filaments, meduse_couronne ont un changement de plan au milieu (à couper au plus long segment).
- **Créatures de l'ancienne vidéo** : sources d'origine absentes du disque → extraites de `videos/ecran_panorama.webm` (8640×1080) par
  `sources-creatures/pistes_panorama.py` (56 pistes, planche `sources-creatures/panorama/planche.jpg`), 33 retenues dans `lot_pano.txt`
  (requin-lutin, raie, chimère, méduse géante violette, larve de pieuvre, dumbo blanc, méduses verte/lune/lilas…).
  **ABANDONNÉ (refus de Johann : trop basse qualité)** — ne pas utiliser le panorama comme source. Ancien lot : `lot_pano.sh` (SAM 2 + MatAnyone, priorité basse, log `lot_pano.log`, suivi `lot_pano.fait`), recalcule `qualite.json` à la fin.
  Retirées de `ESPECES`. À la place : retrouver ces espèces en 4K dans des sources haute définition.
- **Son** : bouton = icône seule (haut-parleur ; barré quand coupé). Réveil automatique du son au moindre clic/touche,
  correction d'une mise en veille qui pouvait couper le son pour de bon (retour rapide sur l'onglet).
- **« Visite en pause »** : typo agrandie (26 px / 18 px).
### Encore à faire
- Vérifier à l'œil (panneau visible) : brume des visiteurs, volume des créatures, vagues.
- Écrans/salle un peu trop sombres sur un écran bas de gamme (bien sur le Mac) : prévoir un réglage de luminosité.
- Identifier les espèces `nouvelle_XX` restantes ; couper les créatures à changement de plan.

## ÉTAT PRÉCÉDENT (9 nov. 2026, soir)
### Calcul lancé en arrière-plan : nouveau détourage SAM 2 de TOUTES les créatures (+ nouvelles)
- Script : `sources-creatures/lot_sam.sh` (liste `lot_sam.txt`, 41 lignes ; avancement `lot_sam.fait` ; journal `lot_sam.log`).
  Voir l'état : `sh "/Users/johann/Documents/Projet Portfolio/État calculs.command"`.
  Relancer s'il s'est arrêté (reprend où il en était) :
  (voir plus bas, sans taskpolicy)
- `detourer_sam.py` = `detourer.py` + **SAM 2** (modèle `facebook/sam2.1-hiera-small`, déjà en cache sur le Mac, hors ligne).
  SAM voit une copie contrastée (CLAHE + saturation ×1,4) ; il décide quelle zone est l'animal (masque plein, suivi
  d'image en image dans les deux sens depuis l'image où l'animal est le plus grand). L'écart à l'eau ne sert plus qu'à
  la transparence douce des bords. Ensuite `creature_pack.py` (inchangé) → `salle/assets/creatures_hd/`.
- Durée : ~10-15 min par créature (≈ 8-10 h en tout) ; priorité réduite (nice) pour que le Mac reste utilisable (le test SAM au
  premier plan avait fait ramer le Mac). Ancienne version sauvegardée : `Projet Portfolio/creatures_hd_sauvegarde_v2/`.
- Ordre : d'abord les difficiles (meduse_pourpre, calmar_colossal, ctenophore, calmar_geant_pale, meduse_couronne,
  concombre_nageur, meduse_filaments, meduse_rouge), puis les autres, puis **araignee_mer** et **16 nouvelles**
  (`nouvelle_01` … `nouvelle_16` : plans « pélagiques » les mieux notés de nos 41 vidéos, `pelagiques.json`).
  Leur espèce est à identifier sur `creatures_hd/nouvelle_XX_apercu.jpg`, puis à renommer et à régler la taille
  `h` dans `creatures.js` (pour l'instant 4,5 m, ou 5,5 m « grand » une sur trois).
- `A_REPRENDRE` (créatures exclues) a été vidé, puisqu'elles sont refaites en premier.
- **MatAnyone intégré** (dossier `Projet Portfolio/MatAnyone`, modèle `pretrained_models/matanyone.pth`, dépendances
  hydra-core/omegaconf/imageio ajoutées au venv Video-Depth-Anything). Dans `detourer_sam.py` : après SAM 2, MatAnyone
  calcule une transparence fine et stable guidée par le masque SAM de la 1re image ; alpha final = max(MatAnyone dans
  la zone SAM élargie, cœur plein du masque SAM) → transparence douce mais jamais de trou. `--sans_mat` pour le couper ;
  version sans MatAnyone gardée : `detourer_sam_sans_matanyone.py`. Testé : cténophore OK, méduse pourpre (SAM seul) :
  le trou noir au milieu du corps a disparu.
- Le lot tourne avec `nice -n 15` seulement (la priorité « taskpolicy -b » était beaucoup trop lente : >20 min par créature).
  Relancer : `cd "/Users/johann/Documents/Projet Portfolio/sources-creatures" && HF_HUB_OFFLINE=1 nohup sh lot_sam.sh >> lot_sam.log 2>&1 &`
- **À vérifier à la fin** : aperçus, trous, sauts (`sauts.py`). Le mode « additif » (pas de découpe, la créature posée comme
  de la lumière sur le noir) reste une option pour les méduses/cténophores si SAM ne suffit pas.

### Visiteurs : FAIT et LANCÉ (9 nov., 22 h 20)
- **Allègement fait** : `tools/alleger_visiteurs.py` (retire f_rest_*) : morceaux chargés 264 → 63 Mo ; les 80 `slice_*.ply`
  (non chargés) retirés de `assets/visitors` (61 Mo au lieu de 504). Vérifié : la salle les affiche, sans erreur.
  Sauvegarde complète d'avant : `Projet Portfolio/visiteurs_80_sauvegarde_complete/`.
- **Découverte** : chaque visiteur n'a que 6 à 13 images de marche (`assets/ghosts/tracks`, découpées dans la vidéo).
  D'où des sauts de pose. `blender/salle_v2.py` (mode visslices) fait maintenant un **fondu entre deux images de
  marche consécutives** (ancienne version : `salle_v2_avant_fondu.py`). Testé : rendu correct.
- **Calcul lancé automatiquement** : `capture-salle/v9/run_fluide.sh` attend la fin du lot des créatures, puis
  rend **160 poses** (2× plus serrées) dans Blender, Brush pour chacune, noir et blanc, découpage, allègement, puis
  bascule (`assets/visitors_80` = ancienne version ; `assets/visitors` = nouvelle). Journal : `capture-salle/v9/run.log`
  (« FINI » à la fin). Reprend où il en était si on le relance :
  `nohup sh "/Users/johann/Documents/Projet Portfolio/capture-salle/v9/run_fluide.sh" >> "/Users/johann/Documents/Projet Portfolio/capture-salle/v9/nohup.log" 2>&1 &`
  `split_personnes.py` adapté aux noms à 3 chiffres (p0_000.ply). **À vérifier** quand c'est fini : chargement,
  fluidité, réglages de `visitors.js` (trainee = N/7, vitesse) avec N = 160.
- Pour aller encore plus loin : retrouver plus d'images de marche par visiteur (re-découper les personnes de la vidéo
  `capture-salle/salle_immersion_*.mp4` à pleine cadence ; script de découpe d'origine introuvable, `capture-salle/mask_people.py` est une piste).

### Mes demandes encore à traiter
- **Visiteurs — décision prise : garder l'apparence en gaussiennes, mais fluide.**
  1. **Alléger** : chaque pose ≈ 17 000 points seulement, mais 59 nombres par point dont 45 inutiles (f_rest, couleur selon
     l'angle) ; non compressé. Retirer f_rest + compresser (format lu par Spark, ex. .spz) : 504 Mo → ~20-25 Mo, même rendu.
  2. **Calculer les poses intermédiaires** (aujourd'hui ~1 pose sur 5 : il manque ~4 poses entre chaque) : chaîne
     `capture-salle/v8/run2.sh` = rendu Blender (`visslices`, 30 vues par pose dans `data/sNN/images`) puis Brush
     (`--total-steps 3000 --max-resolution 1280`, ~4 min/pose) puis `salle/tools/mono_visitors.py`. ~320 poses en plus ≈ 21 h :
     à lancer la nuit, APRÈS le lot des créatures (sinon le Mac rame). Retrouver le script Blender `visslices` et
     l'adapter pour rendre les images d'animation intermédiaires. Option plus courte : un cycle de pas de 1-2 s à 30 poses/s.
- **Visiteurs — piste recommandée (pas encore faite)** : NE PAS recalculer plus de poses en gaussiennes (80 poses =
  ~5 h 30 de calcul et déjà 504 Mo à charger ; doubler = plus lourd, toujours par à-coups). À la place : exporter les
  personnages animés de la scène Blender (`capture-salle`, rendu `visslices`) en **glTF avec squelette animé**, les jouer
  dans Three.js à 60 i/s (mouvement continu, quelques Mo), rendus en blanc spectral, et faire la traînée « pose longue »
  par **rémanence d'image** (rendu à part, mélange MAX + fondu exponentiel) : une silhouette pleine, une traînée
  transparente qui ne s'additionne jamais en blanc dense.
- **Plus d'espèces, surtout les grandes** que j'avais dans l'ancienne version (panoramas des écrans `videos/panorama_v5/v6`,
  `ecran_06`) et que je ne vois jamais : retrouver lesquelles, les ajouter, et chercher de nouvelles espèces.
- **Créatures** : elles peuvent apparaître depuis hors cadre (fait pour le bas : elles entrent par-dessous l'écran) ;
  des vidéos plus longues sont bienvenues ; elles montent toutes (impression que la salle descend).
- **Son** : musique **remise** par défaut (je la préfère aux bruits) ; `?musique=0` pour couper. Bruits synthétiques
  (eau, grondement, coque, bulles, cliquetis) **coupés** (`?ambiance=1`), foule coupée (`?foule=1`).
  **Pas quand je marche** : ajoutés (un pas tous les 0,75 m, `son.js` dans `update`). À trouver : une vraie ambiance
  qui ne soit ni lassante ni « du bruit pour rien » (ex. nappes sonores sous-marines enregistrées, libres de droits).
- Texte de l'écran d'accueil : « Une salle **en descente dans les abysses**… » (`presentation.js`).
- Visiteurs fluides comme une vidéo, sans blanc qui s'accumule ; jonction écrans côtés/sol ; optimisation parfaite.

## Dernières actions (9 nov. 2026)
- **Musique retirée** de la lecture (fichier `son/Teimo.mp3` gardé ; `?musique=1` pour la remettre).
- **`src/son.js` réécrit** (ancienne version : copie dans le scratchpad `son_avant_ambiance.js`) : grondement qui varie,
  courant d'eau gauche/droite, grincements de coque rares, bulles, cliquetis adoucis, **public de musée**
  (murmure + pas : **coupé ensuite à ma demande**, `?foule=1` pour le remettre), présences des créatures.
  Anti-« poc » : boucles de bruit fondues fin→début, enveloppes douces, positions glissées, 10 mises à jour/s,
  panoramique `equalpower` (moins de calcul que HRTF), fondu avant suspension. Anti-saturation : compresseur + limiteur.
  **Pas encore écouté par moi** : à faire valider à l'oreille.
- **Visiteurs** : zone d'effacement autour de la caméra doublée (`pres` 3 → 6 m).
- **Neige marine** : plus d'amas en forme d'étoile ni de gros flocons ; particules fines, rondes, pâles.
- **Créatures** : 6 retirées (détourage/sauts à reprendre) : calmar_colossal, meduse_pourpre, calmar_geant_pale,
  meduse_couronne, concombre_nageur, meduse_filaments (`?toutes=1` pour les revoir). Plus de vitesse tirée de la
  vidéo : toutes dérivent lentement (v = 0,07) et **montent** toutes dans le même sens (elles entrent plutôt par le bas
  des écrans, à peine de dérive latérale) : impression que la salle descend. Au sol : petite dérive libre.
- Rappel : la salle s'ouvre vide, 3 créatures max sur les murs + 2 au sol, montée en 60 s. C'est voulu
  (il faut attendre/chercher), d'où l'impression qu'il y en a peu.

## Mes derniers retours (non encore traités)
- **Visiteurs** : encore trop saccadés ; je veux un mouvement fluide comme une vidéo, en gardant l'esthétique
  spectrale. Plus fantomatique : la pose de tête en pleine luminosité, mais la traînée ne doit PAS s'additionner
  en blanc dense là où les poses se superposent (aujourd'hui frame1+frame2+… = blanc saturé). Piste : dessiner la
  traînée dans un rendu à part avec un mélange « max » (pas additif), ou normaliser l'opacité totale.
- **Créatures** : garder la HD ; zéro défaut de détourage (pas d'image brûlée, pas de trous) ; ne plus jamais
  interpréter le mouvement de la vidéo (ni nage, ni tentacules) ; statiques ou dérive générique de courant.
  Retravailler plus tard celles retirées.
- **Optimisation impérative** : parfaitement fluide, aucun souci visuel, aucun problème de chargement ;
  « on voit à travers » par endroits. Mesurer les fps pane visible (`__salle.stats.fps`).
- **Jonction écrans** : les écrans des côtés sont encore décalés par rapport à l'écran du sol. Agrandir l'écran
  du sol pour qu'il passe pile sous les écrans latéraux (ou les rapprocher). En géométrie (`screens.js` l.77-80)
  ils se touchent déjà à x = ±W/2, y = 0 : le décalage visible vient sans doute des gaussiennes de la salle
  (bas des murs, gommes `pied`/`bord` dans `main.js` l.87-95) ou des pièces de sol dans `edges.js`. À vérifier
  à l'écran en éclaircissant l'exposition.
- **Son** : ambiance de musée voulue (on sent du monde) mais aucun cri, aucune voix forte, aucun mot compréhensible.

## À faire en premier
1. **Vérifier que les créatures sont de nouveau visibles** dans la salle d'expo. Elles avaient disparu
   après l'ajout des murs pleins derrière les écrans. Correctif posé dans `src/edges.js` (murs dessinés hors pochoir),
   mais pas encore vérifié à l'écran.
2. Vérifier depuis la salle d'accueil que les côtés de l'entrée restent fermés (pas d'eau visible à travers
   les murs) et que le bas des écrans rejoint le sol sans bande.
3. Vérifier les créatures recalculées (v2) : plus de sauts/téléportations, plus de trous dans la détection,
   plus de changement de créature en cours de vidéo. Script de mesure : `sauts.py` (mesure le saut max du
   centre de l'alpha d'une image à l'autre ; < 2 % = bon).
   Mesure faite à la fin du lot (saut max du centre, en % de la largeur) :
   - bonnes (< 2 %) : 16 créatures ;
   - à surveiller : meduse_pourpre 12 %, calmar_geant_pale 7 %, meduse_couronne 7 %, meduse_rouge 7 %,
     concombre_nageur 6 %, meduse_filaments 4,5 % ;
   - **mauvaise : calmar_colossal 43 %**, encore un saut malgré la correction. À examiner image par image ;
     le retirer de la salle si on ne trouve pas.
   Quand le maximum est presque égal au 99e centile, le saut vient peut-être de la boucle (raccord fin → début)
   et non de la détection : à vérifier.
4. Visiteurs : je veux un rendu pose longue fluide, sans saccade et sans effet de duplication du même visiteur.
   À régler selon mes retours.

## Historique utile
- Une correction de « jointure des écrans côté salle d'accueil » a été annulée à ma demande.
- Le sol de la salle d'accueil (dalles de pierre) a été remplacé par un sol gris uniforme, plus proche du vrai.

## Mise à jour 11 nov. 2026 (soir) — ambiance « sous-marin »
- Salle d'expo : ambiance bleue (`?lumiere=0.95`, `?bleu=1`), plafond assombri (`?plafond=0.13`, boîte de 9 m au-dessus).
- **Phares du sous-marin** (`dehors.js`, `PHARES` + `phares()`/`lumiere()` dans `EAU`) : 8 phares sur la coque en haut des murs latéraux + 1 au fond, cônes qui balaient lentement. Bleuté dans les faisceaux, presque noir ailleurs, haut des écrans sombre. Agit sur l'eau des écrans (`screens.js`, `holeMaterial` avec `uOut`), le fond marin, la neige et les créatures (elles s'éteignent en sortant d'un faisceau). `?phares=0` = ancien éclairage uniforme. Temps : `PHARES.uPhT.value = t` dans `main.js`.
- Créatures : couleurs plus vives (`?vif=0.45`), lueurs colorées sur la salle et les visiteurs (`?lueursalle=0` pour couper), fondu sur les bords de la vidéo (plus de coupure droite), disparition par transparence.
- Visiteurs : jamais deux poses à moins de `?espace=1.8` m, `?vide=3` s entre deux poses d'un même visiteur, teinte de la salle + des créatures proches. Bug corrigé : `THREE.Color` n'a pas `addScaledVector` (l'animation plantait).
- Son : musique Teimo par défaut (`?musique=0` pour couper), pas désactivés (`?pas=1`).
- JSON des créatures chargés en `no-cache`.

## Mise à jour 11 nov. 2026 (nuit), rien n'est commité
- **Spots** (`src/dehors.js`, `SPOTS`) : chaque spot = `[origine, direction, c0, c1, gain, étirement, portée f]`.
  - `spot()` : atténuation `4/(3+l²·f)`, avec f = 0,35 par défaut.
  - Spots des murs et du fond : f = 0,12 et gain 0,62. Le faisceau descend jusqu'au sol vitré et y finit en fondu.
  - Spots des murs latéraux : direction `[c·0,08,-1,0]`.
  - Spots du fond : x = ±(W/2−0,9), écartés vers les côtés.
  - Sol : 2 spots elliptiques `[2,1,0.78]`.
  - Variations vivantes avec `vie()`.
  - Le haut des écrans est plus sombre (`haut` dans `lumiereP`).
- **Lumière des créatures** (`src/creatures.js`) :
  - Vraiment sombres hors faisceau : `mix(0.07, 1.3, ph)`, réponse `pow(li, 0.8)`.
  - Leur alpha ne dépend plus de la lumière : elles ne disparaissent plus en haut des murs.
  - Le haut des murs les assombrit moins que l'eau (`hautC`, −45 %).
- **Boucles trop courtes** (< 150 images, soit < 6 s) : exclues dans `charge()`, sauf les requins.
- **Boucles à l'endroit et coupes** :
  - `tools/boucle_avant.py` (palindrome → boucle avant + fondu, détection des changements brusques de créature).
  - Lancé par `tools/lot_boucle_avant.sh` (journal `/tmp/boucle_avant.log`).
  - `creature_pack.py` produit directement des boucles à l'endroit.
  - `meduse_ambre` a été relancée à part (journal `/tmp/ambre.log`).
- **Bords coupés** : `tools/bords_creatures.py` est corrigé et relancé (→ `assets/creatures_hd/bords.json`, journal `/tmp/bords.log`).
  - À faire ensuite : placer les créatures coupées d'un seul côté avec la coupe sur un bord extérieur.
    - Coupe en haut : collée en haut des murs.
    - Coupe à gauche ou à droite : côté entrée.
- **Visiteurs** (`src/visitors.js`) :
  - Nettoyés par `tools/nettoie_visiteurs.py` ; originaux dans `Projet Portfolio/visiteurs_orig`.
  - Pose choisie près de la médiane.
  - Aucun visiteur devant l'écran d'accueil.
  - **Même période pour tous, départs répartis régulièrement** : plus d'apparitions groupées.
- **Salle d'accueil sombre** (`src/main.js`) :
  - `accueilclair` vaut 0,32 par défaut ; avec `?accueilclair=2`, on retrouve l'ancien hall clair.
  - Panneaux de fond `0x1d1c1b`.
- Autres changements :
  - Écran d'accueil : un seul cadre gris sombre (`0x2b2e33`).
  - `REFLET` vaut 0 (le rectangle clair a disparu).
  - `requin_sixbranchies` : `nage` + `rot`, à l'horizontale, tête en avant.
  - `ruban_lumineux` : `hFixe` 1,5.
  - `nouvelle_11` supprimée.
  - Les créatures du sol sont dessinées avant celles des murs (`renderOrder` 1,9).
- **Suite, même nuit :**
  - **Spots des murs** : fixés en haut, sur la paroi de l'écran (x = ±(W/2+0,05)).
    - Orientés vers le bas et vers l'extérieur (`[c·0,36,-1,0]`).
    - Chacun a un « débord » (2e spot, même phase, presque vertical, étroit) : la lumière continue en fondu sur le sol vitré.
    - Largeur du faisceau qui varie très légèrement (`lg${i}` dans `SPOTS_GLSL`).
  - **Sol de la salle d'accueil** : coupé pour tout z < L/2. Il cachait le bas des créatures sous le niveau du sol, vu à travers les écrans des côtés (les « formes » en bas des murs).
  - **Test `?blanc=1`** : créatures en rectangles blancs + aplats blancs derrière tous les écrans. Seules les fentes entre écrans doivent apparaître.
  - **Relief des créatures** coupé par défaut (il les déformait) ; `?relief=1` pour le remettre.
  - **Neige** :
    - Elle MONTE (la salle descend), à 0,16–0,26 m/s.
    - Tailles variées, éclats irréguliers étirés verticalement.
    - Visible seulement dans les spots : `(0.03 + 2.6·ph²)`, `?neige=1`.
    - Plus de clignotement : 2 px minimum, pas de scintillement fort.
  - **Logo** : à la fin du chargement, le poulpe s'efface sur place (plus de glissement vers la gauche).
  - **Vidéos courtes** :
    - La plupart des plans sources durent 3–5 s : coupes de caméra dans les documentaires (`plans.json`).
    - `lot_long.sh` re-détoure le plan entier de dumbo (20 s), cirrate_brun (11,5 s) et calmar_colossal (20 s). Il démarre après `lot_t7_prio`.
    - Anciennes versions dans `Projet Portfolio/creatures_courtes_sauvegarde`.
    - Boucles < 150 images exclues (sauf requins).

## Mise à jour 11 nov. 2026 (après-midi)
- Spots (`dehors.js`) : spots elliptiques du sol supprimés ; le 2e faisceau de chaque spot mural (débord) va vers le centre du sol
  (`[-c*0.13,-1,0]`, 0.89/0.99, gain 0.52, f 0.095 : moitié du réglage le plus long). Faisceaux du fond et des murs élargis.
- Créatures : éclairage en 2D (`lumEcran`/`eauEcran` dans `EAU`) : projeté sur le plan de l'écran, plus de taches sombres ;
  la couleur ne descend jamais sous l'eau de l'écran. Boucles < 150 images (5 s) exclues (`creatures.js`), lecture ralentie variable.
- Salle d'accueil : écran centré sur le sol (`XE = 0` dans `presentation.js`), cadre noir 0,085 m ; bloc du sas `Cube_7` déplacé avec ;
  ses gaussiennes à l'ancienne place effacées (gomme `ecran` dans `main.js`). 5 groupes de visiteurs (2 de plus) ; fondus 2,8 s (`?fondu=`).
- Gaussiennes flottantes : `tools/flottants.py` (îlots < 400 gaussiennes, isolées, air de la nef) : 11 753 retirées sur 158 043.
  Originaux : `assets/room_splat.avant_flottants*.ply`.
- **Salle d'accueil modélisée au propre** (`blender/salle_v2.py`, ancien script : `salle_v2_avant_hall.py`) : pilastres sur 3 murs
  (base + chapiteau), plinthe, corniches 8,6 m et 13,35 m, fenêtres hautes encadrées, plafond à caissons autour de la verrière,
  deux portes noires au fond (matériau `hallporte`), sas centré (XE = 0). Lumière recalculée en 2048 (`bake_hall/`, installée dans
  `assets/` ; anciens fichiers dans `assets/avant_hall/`). Dans la page, les gaussiennes du hall sont toutes effacées et les surfaces
  `hall`, `hallporte`, `annex` du maillage restent affichées. `?hallgauss=1` = ancien hall en gaussiennes.
- Ordre des écrans : page d'accueil d'abord (Play actif tout de suite), chargement (poulpe) seulement après le clic si besoin.
- Verrière : taches sombres retirées (`flottants.py`, critère 4). Texte de l'écran aligné à l'encre. Marche 2 m/s.

## Mise à jour 11 nov. 2026 (soir) — visiteurs
- Animation des visiteurs (visitors.js, bloc `brume`) : fini les à-coups (recalcul 30 Hz + grains qui « sautaient » d'en haut en bas).
  Nouvel effet FUMÉE : corps qui respire lentement + ~45 % des gaussiennes se détachent en volutes qui montent, s'élargissent
  et s'effacent, puis renaissent invisibles (aucun saut). Recalcul à chaque image (seules les poses visibles) : 60 i/s mesuré.
  `?brume=0` fige. Ancienne version : scratchpad visitors.avant_fumee.js.
- Poses mal détectées (deux personnes collées, morceaux détachés, torse creux) : `tools/visiteurs_doubles.py assets/visitors`
  marque `"double": true` dans personnes.json (134 / 1280) ; visitors.js les ignore.
- Vidéo source de la salle (visiteur qui filme) : https://www.youtube.com/watch?v=fGEf-9SS0LQ (copie capture-salle/salle_immersion_4k_luma.mp4).
- URL de test actuelle : http://localhost:8766/salle/index.html?fond=c&creatures=c&musique=0&auto&cam=0,6,180,12&v=4

## Mise à jour 11 nov. 2026 (nuit) — plafond, accueil, créatures
- Plafond GÉNÉRAL (salle d'expo + accueil) : blanc à caissons et moulures, à 9 m (`ROOM.ceiling`), matériau `plafond`,
  sans spots, rails ni verrière (gaussiennes au-dessus des murs et rails gommées ; `?rails=1` remet la technique).
- Fentes noires entre les écrans supprimées (`ROOM.post = 0`) : murs d'images continus ; chants d'entrée nets (edges.js),
  gaussiennes baveuses gommées (chants d'entrée + seuil de l'écran du sol).
- Accueil : 20 × 11 m, minimaliste. Mur-écran bleu 8,9 × 3,8 × 0,5 m centré (x 0), à `ROOM.ecranZ` = L/2 + 5 ;
  image incrustée (YE 1,85). Caméra arrêtée devant le mur (on ne va pas derrière). Lumière blanche un peu jaune
  cachée derrière le mur (canal « lightbox » du bake). Ambiance bleue (`?ambiance=`) sur plafond et murs côté expo.
  Bake : salle/bake_plafond/ (anciens fichiers : assets/avant_plafond/). Script : blender/salle_v2.py.
- Créatures : une apparition dure au plus ~1,35 boucle de sa vidéo (`?duree=`) : plus de geste répété ; vidéos
  d'au moins 70 images réadmises (`?minimages=`) ; attente avant retour 18-50 s ; au sol, animal entier sous le sol vitré.
- Musique : `musique=0` dans l'adresse la coupe.

## Mise à jour 11 nov. 2026 (nuit, suite) — accueil noir, texte, caméra, créatures
- Plafond : poutres en travers coupées en tronçons entre les poutres en long (plus de volumes qui se chevauchent :
  taches sombres aux croisements) ; lightmaps lissées (flou gaussien σ 1,6 px) + bake en 256 échantillons : plus de grain.
- Accueil : 13 m de large, sol et murs noirs ; mur bleu avancé à `ROOM.ecranZ` = L/2 + 4 ; lumière derrière le mur
  divisée par 2 en direct (`?lumiere=`, défaut 0.5). Bake : salle/bake_plafond2/.
- Mur bleu : plus d'écran ni de vidéo ni de cadre noir : logo + texte blancs (presentation.js), traduction anglaise sous
  chaque paragraphe (300, plus petit). `?texte=` règle le blanc.
- Caméra : ne se déplace que sur le sol-écran de la salle d'expo (pov.js collide) ; départ z 11,2.
- Écrans : reflet remis (`?reflet=`, défaut 0.25) maintenant que l'accueil est noir.
- Créatures : arrivées beaucoup plus fréquentes (apparitions courtes ⇒ sinon salle presque vide) : 1,2-3,2 s entre deux,
  présence max atteinte en ~45 s ; retour après 12-35 s. 49 créatures utilisables.
- Attention : un vieux `edges.js` en cache remet les rails noirs ; forcer avec Cmd+Maj+R.
- (suite) Lumière de l'accueil : une seule source au sol juste derrière le mur bleu (bake_plafond3/, installé ; ancien : assets/avant_plafond2/).
- Accueil : sol et murs même noir brillant (roughness 0.16, reflet de la salle par scene.environment).
- Bleu officiel du Musée océanographique (musee.oceano.org, barre de navigation) : #1c97fd ; marine de la charte : #004680.
  Bouton Play : fond #1c97fd. Panneau : bleu marine #004680 (émissif 0x0a4065, ressort exactement #004680 après ACES ; `?panneau=`).
- Panneau : texte et logo agrandis (plan 8,5 × 3,5 m), centrés, sans halo (blanc 0.54 sous le seuil 0.55 du bloom).
- Créatures : lumière hors faisceau 0,4 au lieu de 0,07 (`?ombre=`) : elles étaient actives mais presque noires.
- Bleu des écrans plus pur et intense (dehors.js + screens.js) ; reflet ramené à 0.1 (voile gris = bleu fade).
- Créatures invisibles sur les murs (cause trouvée) : la profondeur faisait partie de la courbe parcourue à vitesse constante ;
  sur une apparition courte, l'animal passait presque tout son temps à 2-3 m derrière la vitre (noir). Maintenant la
  profondeur est séparée (`it.prof`) : sortie du noir en 18 % du temps, puis près de la vitre (murs 0,3-0,7 m, grands 0,7-1,1,
  nageurs 0,4-0,7), retour au noir en 18 %. Départ/arrivée à 3 m.
- Intro refaite : chargement (poulpe) EN PREMIER dès l'ouverture ; salle prête ⇒ elle sort du noir et l'accueil apparaît
  posé sur la salle rendue en direct (caméra fixe au départ, dos au panneau, derrière le voile flou ; plus de vidéo de fond).
  Play : voile et éléments partent vers la gauche (`translate`), on est déjà dans la salle, pas de fondu au noir.
- Cartel : « Salle de la Baleine » remplacé par « Salle d'exposition ».
