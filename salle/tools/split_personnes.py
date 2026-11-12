"""Visiteurs : chaque tranche de temps est découpée par personne (une par trajet), gaussiennes recentrées
sur la personne. La page peut alors réduire une pose autour de son propre centre (traînée « étoile filante »).
Sortie : <dossier>/p<trajet>_<tranche>.ply + personnes.json (centre de chaque morceau, repère Blender).
Usage : python -I split_personnes.py dossier_tranches
"""
import sys, glob, json, os, numpy as np
from plyfile import PlyData, PlyElement
PATHS = [((-2.5, 9.0), (-1.5, -8.0)), ((2.5, -9.0), (1.0, 8.0)), ((-1.0, 10.5), (2.5, -2.0)), ((3.0, 2.0), (-3.0, 6.0)),
         ((0.0, -6.0), (-2.8, -10.0)), ((-5.0, 14.0), (4.0, 12.5)), ((2.0, 15.0), (-2.0, 12.0)), ((0.5, 6.0), (0.5, -4.0))]
d = sys.argv[1]; info = json.load(open(d + '/slices.json')); out = []
for f in sorted(glob.glob(d + '/slice_*.ply')):
    j = int(os.path.basename(f)[6:-4]); v = PlyData.read(f)['vertex'].data
    X, Z = v['x'], -v['y']
    best = np.full(len(v), np.inf); who = np.zeros(len(v), int)
    for k, ((ax, az), (bx, bz)) in enumerate(PATHS):
        dx, dz = bx - ax, bz - az
        u = np.clip(((X - ax) * dx + (Z - az) * dz) / (dx * dx + dz * dz), 0, 1)
        dd = np.hypot(X - (ax + u * dx), Z - (az + u * dz)); m = dd < best; best[m] = dd[m]; who[m] = k
    for k in range(len(PATHS)):
        sel = who == k
        if sel.sum() < 50: continue
        w = v[sel].copy(); a = 1 / (1 + np.exp(-w['opacity'].astype(np.float64)))
        c = [float(np.average(w[n], weights=a)) for n in ('x', 'y', 'z')]
        for n, cc in zip(('x', 'y', 'z'), c): w[n] = w[n] - cc
        name = f'p{k}_{j:03d}.ply' if info['slices'] > 100 else f'p{k}_{j:02d}.ply'
        PlyData([PlyElement.describe(w, 'vertex')], text=False).write(f'{d}/{name}')
        out.append({'url': name, 'tranche': j, 'personne': k, 'centre': c, 'n': int(sel.sum())})
json.dump({'tranches': info['slices'], 'morceaux': out}, open(d + '/personnes.json', 'w'))
print(len(out), 'morceaux', sum(o['n'] for o in out), 'gaussiennes')
