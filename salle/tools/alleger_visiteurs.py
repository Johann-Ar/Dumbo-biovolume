"""Allège les poses des visiteurs SANS changer leur apparence : retire les 45 coefficients « couleur selon l'angle »
(f_rest_*, inutiles pour des silhouettes grises) de chaque morceau p*_*.ply. Fichiers ~4× plus légers.
Usage : python -I alleger_visiteurs.py dossier
"""
import sys, glob, os, numpy as np
from plyfile import PlyData, PlyElement
d = sys.argv[1]; avant = apres = 0
for f in sorted(glob.glob(d + '/p*_*.ply')):
    v = PlyData.read(f)['vertex'].data
    names = [n for n in v.dtype.names if not n.startswith('f_rest_')]
    if len(names) == len(v.dtype.names): continue
    w = np.empty(len(v), dtype=[(n, v.dtype[n]) for n in names])
    for n in names: w[n] = v[n]
    avant += os.path.getsize(f)
    PlyData([PlyElement.describe(w, 'vertex')], text=False).write(f + '.tmp'); os.replace(f + '.tmp', f)
    apres += os.path.getsize(f)
print(f'{avant / 1e6:.0f} Mo -> {apres / 1e6:.0f} Mo')
