"""Visiteurs en noir et blanc : chaque tranche de gaussiennes passe en monochrome.
Luminosité = la composante la plus forte (et non la luminance), pour que les parties éclairées en bleu
par les écrans deviennent claires et dessinent les corps ; les zones sombres restent noires.
Les reflets colorés qui dépendent de l'angle (harmoniques f_rest) sont supprimés.

Usage : python -I mono_visitors.py dossier_tranches
"""
import sys, glob, numpy as np
from plyfile import PlyData, PlyElement

C0 = 0.28209479177387814
for f in sorted(glob.glob(sys.argv[1] + '/slice_*.ply')):
    ply = PlyData.read(f); v = ply['vertex'].data.copy()
    rgb = np.stack([v['f_dc_0'], v['f_dc_1'], v['f_dc_2']], 1) * C0 + 0.5
    b = np.clip(rgb.max(1), 0, 1)
    b = np.clip((b - 0.08) / 0.7, 0, 1) ** 1.1          # contraste : noirs francs, éclairages nets
    for k in ('f_dc_0', 'f_dc_1', 'f_dc_2'):
        v[k] = (b - 0.5) / C0
    for k in v.dtype.names:
        if k.startswith('f_rest_'): v[k] = 0
    PlyData([PlyElement.describe(v, 'vertex')], text=False).write(f)
    print('monochrome :', f.split('/')[-1], len(v))
