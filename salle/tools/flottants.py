"""Gaussiennes FLOTTANTES de la salle (expo + accueil) : détection puis nettoyage.

Les « flottants » sont des nuages de gaussiennes suspendus dans le vide (erreurs de la reconstruction :
écrans qui changent, visiteurs qui bougent). Deux critères :
1. Îlots : on range les gaussiennes dans une grille de cubes (CELL m). Les cubes occupés qui se touchent
   (26 voisins) forment des îlots. Murs, plafond, piliers, sas = un ou quelques grands îlots ;
   un flottant = un petit îlot détaché de tout (moins de MIN_ILOT gaussiennes).
2. Isolées : une gaussienne presque seule dans son voisinage (3 x 3 x 3 cubes) est retirée aussi.
3. Air de la nef : tout ce qui flotte au milieu de la salle d'expo (loin des écrans, du sol et du plafond).

Usage : python -I flottants.py entree.ply sortie.ply [--analyse] [--aussi entree2.ply sortie2.ply]
(--aussi : applique le même tri à une version allégée du même fichier, mêmes gaussiennes dans le même ordre)
"""
import sys, numpy as np
from collections import deque
from plyfile import PlyData, PlyElement

L, W, H = 23.0, 8.0, 8.5
CELL = 0.2
MIN_ILOT = 400        # gaussiennes : en dessous, îlot détaché = flottant
MIN_VOISINS = 4       # gaussiennes dans les 27 cubes autour : en dessous, isolée

src, dst = sys.argv[1], sys.argv[2]; analyse = '--analyse' in sys.argv
ply = PlyData.read(src); v = ply['vertex'].data
X, Y, Z = v['x'], v['z'], -v['y']                     # repère page
P = np.stack([X, Y, Z], 1)
cel = np.floor((P - P.min(0)) / CELL).astype(np.int64)
dims = cel.max(0) + 2
cle = (cel[:, 0] * dims[1] + cel[:, 1]) * dims[2] + cel[:, 2]
uc, inv, cnt = np.unique(cle, return_inverse=True, return_counts=True)
compte = dict(zip(uc.tolist(), cnt.tolist()))
dec = [(dx * dims[1] + dy) * dims[2] + dz for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)]

# 1. îlots (composantes connexes des cubes occupés)
ilot = {}; tailles = []
for c in uc.tolist():
    if c in ilot: continue
    k = len(tailles); ilot[c] = k; n = 0; q = deque([c])
    while q:
        a = q.popleft(); n += compte[a]
        for d in dec:
            b = a + d
            if b in compte and b not in ilot: ilot[b] = k; q.append(b)
    tailles.append(n)
tailles = np.array(tailles)
id_ilot = np.array([ilot[c] for c in uc.tolist()])[inv]
petit = tailles[id_ilot] < MIN_ILOT

# 2. isolées
voisins_c = np.array([sum(compte.get(c + d, 0) for d in dec) for c in uc.tolist()])
isolee = voisins_c[inv] < MIN_VOISINS

# 3. air de la nef (salle d'expo) : rien ne doit flotter là
air = (np.abs(X) < W / 2 - 0.4) & (Y > 0.3) & (Y < H - 1.0) & (np.abs(Z) < L / 2 - 0.4)

drop = (petit | isolee | air) & (Z < L / 2)   # salle d'expo seulement : à l'accueil, le nettoyage effaçait murs et plafond
# 4. verrière du hall (vue depuis la nef et l'accueil) : taches sombres sur le jour blanc
lum = 0.5 + 0.282 * (v['f_dc_0'] + v['f_dc_1'] + v['f_dc_2']) / 3
verriere = (Y > 12.5) & (np.abs(X) < 8.6) & (np.abs(Z) < 13.6) & (lum < 0.45)
print(f'verrière : taches sombres {int(verriere.sum())}')
drop |= verriere
ordre = np.argsort(-tailles)
print(f'{len(v)} gaussiennes, {len(tailles)} îlots ; plus grands : {tailles[ordre[:8]].tolist()}')
print(f'flottants : petits îlots {int(petit.sum())}, isolées {int(isolee.sum())}, air de la nef {int(air.sum())} '
      f'-> retirées {int(drop.sum())}, gardées {int((~drop).sum())}')
for nom, m in (('expo', Z < L / 2), ('accueil', Z >= L / 2)):
    print(f'  {nom} : retirées {int((drop & m).sum())} / {int(m.sum())}')
if not analyse:
    PlyData([PlyElement.describe(v[~drop], 'vertex')], text=False).write(dst)
    print('écrit', dst)
    if '--aussi' in sys.argv:
        i = sys.argv.index('--aussi'); s2, d2 = sys.argv[i + 1], sys.argv[i + 2]
        v2 = PlyData.read(s2)['vertex'].data
        assert len(v2) == len(v) and np.allclose(v2['x'], v['x'], atol=1e-3) and np.allclose(v2['z'], v['z'], atol=1e-3), 'pas les mêmes gaussiennes'
        PlyData([PlyElement.describe(v2[~drop], 'vertex')], text=False).write(d2)
        print('écrit', d2)
