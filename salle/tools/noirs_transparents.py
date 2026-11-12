"""Visiteurs : les parties sombres deviennent plus transparentes (le blanc reste tel quel).
Sans ça, le noir des silhouettes fait par moments une masse opaque.
Opacité multipliée par (garde + (1 - garde) * luminosité) : noir pur -> « garde », blanc -> inchangé.
Un fichier témoin « noirs_ok » empêche de l'appliquer deux fois.
Usage : python -I noirs_transparents.py dossier_tranches [--garde 0.5]
"""
import sys, glob, os, numpy as np
from plyfile import PlyData, PlyElement
d = sys.argv[1]; garde = float(sys.argv[sys.argv.index('--garde') + 1]) if '--garde' in sys.argv else 0.5
if os.path.exists(d + '/noirs_ok'): sys.exit('déjà appliqué : ' + d)
C0 = 0.28209479177387814
for f in sorted(glob.glob(d + '/slice_*.ply')):
    ply = PlyData.read(f); v = ply['vertex'].data.copy()
    b = np.clip(np.stack([v['f_dc_0'], v['f_dc_1'], v['f_dc_2']], 1) * C0 + 0.5, 0, 1).max(1)
    a = 1 / (1 + np.exp(-v['opacity'].astype(np.float64)))
    a = np.clip(a * (garde + (1 - garde) * b ** 0.7), 1e-4, 1 - 1e-4)
    v['opacity'] = np.log(a / (1 - a)).astype(v['opacity'].dtype)
    PlyData([PlyElement.describe(v, 'vertex')], text=False).write(f)
    print('noirs allégés :', os.path.basename(f), len(v))
open(d + '/noirs_ok', 'w').write(f'garde {garde}\n')
