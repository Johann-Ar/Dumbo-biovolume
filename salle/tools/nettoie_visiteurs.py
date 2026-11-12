"""Visiteurs réguliers : une seule silhouette par pose, même densité et même luminosité pour tous.

1. Doubles : certaines poses contiennent, à côté de la personne, un morceau d'une autre personne.
   Vue de dessus, on garde seulement l'amas principal (grille de 10 cm, voisinage de 25 cm).
2. Densité : la « matière » d'une pose (somme des opacités) est ramenée à la médiane de toutes les poses
   (gaussiennes en trop retirées au hasard, de façon uniforme) : plus de silhouettes très blanches et pleines.
3. Luminosité : la couleur moyenne (pondérée par l'opacité) est ramenée vers la médiane (jamais éclaircie de plus de 15 %).
Originaux gardés dans « Projet Portfolio/visiteurs_orig » (hors du site) (le script repart toujours d'eux). personnes.json : champ n mis à jour.

Usage : python -I tools/nettoie_visiteurs.py
"""
import os, json, shutil, numpy as np, cv2
D = os.path.join(os.path.dirname(__file__), '..', 'assets', 'visitors'); O = '/Users/johann/Documents/Projet Portfolio/visiteurs_orig'   # hors du site (pas publié)
if not os.path.isdir(O):
    os.makedirs(O)
    for f in os.listdir(D):
        if f.endswith('.ply') or f == 'personnes.json': shutil.copy2(os.path.join(D, f), O)
info = json.load(open(os.path.join(O, 'personnes.json')))
sig = lambda x: 1 / (1 + np.exp(-x))
C0 = 0.28209479

def lire(f):
    b = open(f, 'rb').read(); i = b.index(b'end_header\n') + 11
    return b[:i], np.frombuffer(b[i:], np.float32).reshape(-1, 14).copy()

def principal(a):
    xy = a[:, 11:13]; m = xy.min(0); g = ((xy - m) / 0.1).astype(int)
    im = np.zeros(g.max(0)[::-1] + 1, np.uint8); np.add.at(im, (g[:, 1], g[:, 0]), 1)
    occ = (im > 0).astype(np.uint8)
    occ = cv2.dilate(occ, np.ones((5, 5), np.uint8))                    # 25 cm : les bras et jambes restent attachés
    n, lab = cv2.connectedComponents(occ)
    if n <= 2: return a
    w = np.bincount(lab[g[:, 1], g[:, 0]], weights=sig(a[:, 3]), minlength=n); w[0] = 0
    return a[lab[g[:, 1], g[:, 0]] == w.argmax()]

poses = {}
for o in info['morceaux']:
    h, a = lire(os.path.join(O, o['url'])); poses[o['url']] = (h, principal(a))
masse = {u: sig(a[:, 3]).sum() for u, (h, a) in poses.items()}
def lum(a):
    c = 0.5 + C0 * a[:, :3]; w = sig(a[:, 3]); return float((c @ [0.2126, 0.7152, 0.0722] * w).sum() / w.sum())
lums = {u: lum(a) for u, (h, a) in poses.items()}
M = np.median(list(masse.values())); Lm = np.median(list(lums.values()))
rng = np.random.default_rng(1)
for o in info['morceaux']:
    h, a = poses[o['url']]
    if masse[o['url']] > M:
        a = a[rng.random(len(a)) < M / masse[o['url']]]
    k = min(1.15, Lm / max(lums[o['url']], 1e-3))
    a[:, :3] = ((0.5 + C0 * a[:, :3]) * k - 0.5) / C0
    h = h.replace(b'element vertex %d' % int(h.split(b'element vertex ')[1].split(b'\n')[0]), b'element vertex %d' % len(a))
    open(os.path.join(D, o['url']), 'wb').write(h + a.astype(np.float32).tobytes())
    o['n'] = int(len(a))
json.dump(info, open(os.path.join(D, 'personnes.json'), 'w'))
print('poses', len(poses), 'masse médiane', round(float(M), 1), 'lum médiane', round(Lm, 3))
