"""Découpe la couche « visiteurs » en tranches de temps, pour l'animation de la page.

Dans les rendus, chaque visiteur avance le long de son trajet en même temps que sa pose change :
la position d'une gaussienne sur son trajet correspond donc à un moment de la marche.
Sortie : assets/visitors/slice_00.ply … slice_NN.ply + slices.json.

Usage : python -I slice_visitors.py visitors_splat.ply dossier_sortie [nombre_de_tranches]
"""
import sys, os, json, numpy as np
from plyfile import PlyData, PlyElement

# mêmes trajets que salle_v2.py (repère page : x, z)
PATHS = [((-2.5, 9.0), (-1.5, -8.0)), ((2.5, -9.0), (1.0, 8.0)), ((-1.0, 10.5), (2.5, -2.0)), ((3.0, 2.0), (-3.0, 6.0)),
         ((0.0, -6.0), (-2.8, -10.0)), ((-5.0, 14.0), (4.0, 12.5)), ((2.0, 15.0), (-2.0, 12.0)), ((0.5, 6.0), (0.5, -4.0))]
src, out = sys.argv[1], sys.argv[2]; K = int(sys.argv[3]) if len(sys.argv) > 3 else 20
os.makedirs(out, exist_ok=True)
v = PlyData.read(src)['vertex'].data
X, Z = v['x'], -v['y']                                # Blender (x, y, z) -> page (x, z = -y)
op = 1 / (1 + np.exp(-v['opacity']))
best_d = np.full(len(v), np.inf); best_u = np.zeros(len(v))
for (ax, az), (bx, bz) in PATHS:
    dx, dz = bx - ax, bz - az; n2 = dx * dx + dz * dz
    u = np.clip(((X - ax) * dx + (Z - az) * dz) / n2, 0, 1)
    d = np.hypot(X - (ax + u * dx), Z - (az + u * dz))
    m = d < best_d; best_d[m] = d[m]; best_u[m] = u[m]
keep = (best_d < 0.9) & (op > 0.01)                   # hors trajets ou presque invisibles : parasites
sl = np.minimum((best_u * K).astype(int), K - 1)
counts = []
for j in range(K):
    sel = keep & (sl == j); counts.append(int(sel.sum()))
    PlyData([PlyElement.describe(v[sel], 'vertex')], text=False).write(f'{out}/slice_{j:02d}.ply')
json.dump({'slices': K, 'counts': counts}, open(f'{out}/slices.json', 'w'))
print(f'{len(v)} gaussiennes, {int(keep.sum())} gardées en {K} tranches : {counts}')
