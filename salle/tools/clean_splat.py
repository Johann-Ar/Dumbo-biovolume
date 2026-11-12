"""Nettoyage de la salle en gaussiennes (sortie de Brush, repère Blender : x, y, z vers le haut).

1. Écrans propres : supprime les gaussiennes dans une fine couche devant les écrans (murs, fond, sol
   de la nef). Les vidéos, affichées par-dessus dans la page, restent parfaitement planes.
   Les socles en roche et les joints renfoncés (derrière le plan des écrans) sont conservés.
2. Parasites : supprime les gaussiennes presque transparentes ou démesurées (voile, traînées).

Usage : python -I clean_splat.py entree.ply sortie.ply
"""
import sys, numpy as np
from plyfile import PlyData, PlyElement

L, W, H = 23.0, 8.0, 8.5          # mêmes cotes que salle_v2.py
BAND = 0.18                       # épaisseur nettoyée devant les écrans (m)

src, dst = sys.argv[1], sys.argv[2]
ply = PlyData.read(src); v = ply['vertex'].data
x, yb, zb = v['x'], v['y'], v['z']
X, Y, Z = x, zb, -yb                                  # repère page : y vers le haut, z vers l'entrée
op = 1 / (1 + np.exp(-v['opacity']))
smax = np.exp(np.max(np.stack([v['scale_0'], v['scale_1'], v['scale_2']], 1), 1))

inside_z = (Z > -L / 2 - 0.05) & (Z < L / 2)
rock = (Y < 1.6) & (np.abs(X) > W / 2 - 0.85) & ((Z < -L / 2 + 0.9) | (np.abs(Z - (-L / 2 + L / 4)) < 0.6))   # socles du fond : seulement leur emprise
# Une gaussienne gêne dès que son étendue (≈ 2,5 × sa plus grande taille) touche le plan d'un écran,
# même si son centre est plus loin : c'est ce qui faisait les « strass » noirs sur les vidéos.
reach = np.maximum(BAND, 2.5 * smax)
wall = inside_z & (W / 2 - np.abs(X) < reach) & (np.abs(X) < W / 2 + 0.01) & (Y < H) & ~rock
back = (Z + L / 2 < reach) & (Z > -L / 2 - 0.01) & (np.abs(X) < W / 2) & (Y < H) & ~rock
floor = inside_z & (np.abs(X) < W / 2) & (Y > -0.05) & (Y < reach) & ~rock
parasite = (op < 0.008) | (smax > 1.2)   # seuils vérifiés : la matière normale descend à ~1,5 %

# ancienne colonne rocheuse de l'entrée (à droite en entrant, contre le premier écran) : supprimée du modèle,
# retirée ici aussi des captures plus anciennes
column = (np.abs(X - (W / 2 - 0.2)) < 1.1) & (np.abs(Z - (L / 2 - 0.3)) < 1.1) & (Y < 4.6)
door = (np.abs(X - (W / 2 + 1.4)) < 1.3) & (np.abs(Z - (L / 2 + 2.5)) < 0.6) & (Y < 3.0)   # ancien passage éclairé
# Tout ce qui est DERRIÈRE les écrans (derrière les murs, le fond, sous le sol de la nef) : invisible
# en principe, mais des gaussiennes débordent et apparaissent à travers (lueurs bleues, matière noire).
in_nave_z = Z < L / 2
behind = ((np.abs(X) > W / 2 + 0.01) & in_nave_z & (Y < H)) | ((Z < -L / 2 - 0.01) & (np.abs(X) < W / 2 + 1) & (Y < H)) \
         | ((Y < -0.01) & (np.abs(X) < W / 2) & in_nave_z)
rocks = (Y < 1.7) & (np.abs(X) > W / 2 - 1.0) & ((Z < -L / 2 + 1.1) | (np.abs(Z - (-L / 2 + L / 4)) < 0.8))   # socles en roche : retirés
skeleton = (np.abs(X) < 8.5) & (Y > 6.2) & (Y < 9.6) & (np.abs(Z - (L / 2 + 3.0)) < 1.0)   # squelette (retiré)
# zones redessinées en géométrie nette dans la page (salle/src/edges.js) : on retire leurs gaussiennes floues
walltop = (Y > H - 0.06) & (Y < H + 0.25) & (((np.abs(X) > W / 2 - 0.1) & (np.abs(X) < W / 2 + 0.45) & (Z < L / 2 + 0.3)) | ((Z < -L / 2 + 0.1) & (Z > -L / 2 - 0.45)))
rig = (Y > H - 0.8) & (Y < H - 0.4) & (np.abs(X) < W / 2 - 0.2) & (np.abs(Z) < L / 2)
rods = (Y > H + 0.3) & (np.abs(np.abs(X) - (W / 2 - 0.6)) < 0.12) & (np.abs(Z) < L / 2)
drop = wall | back | floor | parasite | column | door | behind | rocks | skeleton | walltop | rig | rods
print(f'{len(v)} gaussiennes : écrans {int((wall | back | floor).sum())}, parasites {int(parasite.sum())}, '
      f'gardées {int((~drop).sum())}')
PlyData([PlyElement.describe(v[~drop], 'vertex')], text=False).write(dst)
