"""Visiteurs : écarte les poses mal détectées (deux personnes collées = une forme étrange).

Pour chaque pose (morceau .ply de assets/visitors), trois tests :
1. deux blocs au sol : l'empreinte (grille 7 cm) a un deuxième bloc séparé > 12 % des gaussiennes ;
2. morceaux détachés : plus de 6 % des gaussiennes hors du bloc principal ;
3. torse creux : à hauteur du torse (0,85-1,45 m), un vide au milieu de la largeur (deux colonnes côte à côte).
Les poses retenues reçoivent "double": true dans personnes.json ; visitors.js ne les montre jamais.

Usage : python -I visiteurs_doubles.py assets/visitors
"""
import sys, os, json, numpy as np
from collections import deque
from plyfile import PlyData

C, CREUX = 0.07, 0.25
dos = sys.argv[1]; fj = os.path.join(dos, 'personnes.json'); p = json.load(open(fj))

def blocs(xy):
    g = np.floor((xy - xy.min(0)) / C).astype(int); cnt = {}
    for k in map(tuple, g): cnt[k] = cnt.get(k, 0) + 1
    occ = {k for k, n in cnt.items() if n >= 2}; vu = set(); t = []
    for k in occ:
        if k in vu: continue
        q = deque([k]); vu.add(k); n = 0
        while q:
            a, b = q.popleft(); n += cnt[(a, b)]
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    m = (a + da, b + db)
                    if m in occ and m not in vu: vu.add(m); q.append(m)
        t.append(n)
    return sorted(t, reverse=True)

nb = {'deux': 0, 'bouts': 0, 'creux': 0}
for o in p['morceaux']:
    v = PlyData.read(os.path.join(dos, o['url']))['vertex'].data
    P = np.stack([v['x'], v['y'], v['z']], 1); n = len(P)
    if n < 50: o['double'] = True; continue
    t = blocs(P[:, :2])
    deux = len(t) > 1 and t[1] > 0.12 * n
    bouts = n - t[0] > 0.06 * n
    c = P[:, :2] - P[:, :2].mean(0); a = c @ np.linalg.svd(c, full_matrices=False)[2][0]
    z = P[:, 2] - np.percentile(P[:, 2], 2); lo, hi = np.percentile(a, [3, 97])
    h, _ = np.histogram(a[(z > 0.85) & (z < 1.45)], bins=16, range=(lo, hi)); h = np.convolve(h, [1, 1], 'same')
    creux = h[5:11].min() / max(1, min(h[:7].max(), h[9:].max())) < CREUX
    o['double'] = bool(deux or bouts or creux)
    nb['deux'] += deux; nb['bouts'] += bouts and not deux; nb['creux'] += creux and not (deux or bouts)
json.dump(p, open(fj, 'w'))
print(nb, 'écartées', sum(o.get('double', False) for o in p['morceaux']), '/', len(p['morceaux']))
