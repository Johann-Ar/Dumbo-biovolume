"""Version légère d'un nuage de gaussiennes : retire les variations de couleur selon l'angle de vue
(harmoniques sphériques f_rest_*, ~3/4 du poids du fichier). Salle surtout mate : différence à peine
visible, chargement environ 4 fois plus rapide. Format PLY standard (lu par Spark).

Usage : python -I lighten_splat.py entree.ply sortie.ply     (ou un dossier : tous les .ply, sur place)
"""
import sys, os, glob
import numpy as np
from plyfile import PlyData, PlyElement

def lighten(src, dst):
    v = PlyData.read(src)['vertex'].data
    keep = [n for n in v.dtype.names if not n.startswith('f_rest_')]
    out = np.empty(len(v), dtype=[(n, v.dtype[n]) for n in keep])
    for n in keep: out[n] = v[n]
    PlyData([PlyElement.describe(out, 'vertex')], text=False).write(dst)
    print(f'{os.path.basename(dst)} : {os.path.getsize(src) // 1024} Ko -> {os.path.getsize(dst) // 1024} Ko')

src = sys.argv[1]
if os.path.isdir(src):
    for f in sorted(glob.glob(src + '/*.ply')): lighten(f, f)
else:
    lighten(src, sys.argv[2])
