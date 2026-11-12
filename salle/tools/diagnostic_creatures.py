# Diagnostic image par image des créatures TELLES QUE LA SALLE LES LIT (assets/creatures_hd/<nom>.mp4 :
# panneaux empilés [couleur | alpha | relief], 30 i/s), dans leur plage bonne (assets/plages_creatures.json).
# Mesures par vidéo :
#   duree   : secondes de plage bonne
#   sauts   : images où l'animal change brusquement (écart couleur dans l'animal > 3,5 × la médiane, hors images doublées 24→30)
#   alpha   : sauts du détourage (surface de l'animal qui varie de plus de 12 % d'une image à l'autre)
#   morceaux: nombre moyen de morceaux détachés du détourage (> 0,3 % de la surface) : 1 = propre
#   trous   : part de trous à l'intérieur de la silhouette (détourage percé)
#   bord    : part des images où l'animal touche le cadre (coupé net)
#   relief  : sauts du panneau de relief (l'animal « respire » en profondeur d'un coup)
# Usage : python -I tools/diagnostic_creatures.py assets  > sortie.json
import cv2, json, glob, os, sys, subprocess, numpy as np

base = sys.argv[1]
P = json.load(open(f'{base}/plages_creatures.json'))
res = {}
for f in sorted(glob.glob(f'{base}/creatures_hd/*.mp4')):
    n = os.path.basename(f)[:-4]
    info = json.load(open(f[:-4] + '.json'))
    pl = P.get(n, 'absent')
    if pl is None:
        continue
    w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                             '-of', 'csv=p=0', f]).decode().strip().split(','))
    sw = 160; sh = int(round(h * sw / w / 2)) * 2
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', f, '-vf', f'scale={sw}:{sh}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True).stdout
    V = np.frombuffer(raw, np.uint8).reshape(-1, sh, sw, 3)
    a0, a1 = (pl if isinstance(pl, list) else [0, len(V) - 1])
    V = V[a0:a1 + 1]
    p3 = sh // 3
    col = V[:, :p3].astype(np.float32); alp = V[:, p3:2 * p3, :, 0].astype(np.float32) / 255; rel = V[:, 2 * p3:3 * p3, :, 0].astype(np.float32)
    m = alp > 0.5
    area = m.reshape(len(m), -1).sum(1).astype(np.float32) + 1
    # écart couleur pondéré par l'alpha
    d = np.array([(np.abs(col[i + 1] - col[i]).mean(-1) * np.maximum(alp[i], alp[i + 1])).sum() / max(1, np.maximum(alp[i], alp[i + 1]).sum())
                  for i in range(len(col) - 1)])
    dr = np.array([(np.abs(rel[i + 1] - rel[i]) * np.maximum(alp[i], alp[i + 1])).sum() / max(1, np.maximum(alp[i], alp[i + 1]).sum())
                   for i in range(len(rel) - 1)])
    vivant = d[d > 0.15]
    med = float(np.median(vivant)) if len(vivant) else 1.0
    medr = float(np.median(dr[dr > 0.05])) if (dr > 0.05).any() else 1.0
    sauts = [int(i + a0) for i in np.where(d > max(3.5 * med, med + 3))[0]]
    sautsr = [int(i + a0) for i in np.where(dr > max(4 * medr, medr + 4))[0]]
    da = np.abs(np.diff(area)) / area[:-1]
    sautsa = [int(i + a0) for i in np.where(da > 0.12)[0]]
    morce, trous, bord = [], [], 0
    for i in range(0, len(m), 3):
        mm = m[i].astype(np.uint8)
        k, lab, st, _ = cv2.connectedComponentsWithStats(mm, 8)
        tot = mm.sum() + 1
        morce.append(int((st[1:, cv2.CC_STAT_AREA] > 0.003 * tot).sum()) if k > 1 else 0)
        fl = mm.copy(); cv2.floodFill(fl, np.zeros((mm.shape[0] + 2, mm.shape[1] + 2), np.uint8), (0, 0), 1)
        trous.append(float((fl == 0).sum()) / tot)
        if mm[0].any() or mm[-1].any() or mm[:, 0].any() or mm[:, -1].any():
            bord += 1
    res[n] = dict(duree=round(len(V) / 30, 2), images=len(V), sauts=sauts, sauts_alpha=sautsa, sauts_relief=sautsr,
                  morceaux=round(float(np.mean(morce)), 2), trous=round(float(np.mean(trous)), 3),
                  bord=round(bord / max(1, len(range(0, len(m), 3))), 2), diff_med=round(med, 2))
    print(n, res[n], file=sys.stderr, flush=True)
json.dump(res, sys.stdout, indent=1)
