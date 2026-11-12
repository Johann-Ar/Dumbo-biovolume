"""Planches de toutes les images des vidéos de créatures + repérage des défauts (coupures, sauts, images figées, raccord de boucle).
Usage : python planches_creatures.py <dossier salle>   -> salle/tableau_creatures/<nom>.jpg + defauts.json"""
import sys, os, json, subprocess, glob
import numpy as np
S = sys.argv[1]; OUT = os.path.join(S, 'tableau_creatures'); os.makedirs(OUT, exist_ok=True)
LW, COLS = 110, 12
noms = {}
for d in ('creatures', 'creatures_hd'):          # la version HD remplace l'ancienne quand elle existe
    for f in sorted(glob.glob(os.path.join(S, 'assets', d, '*.webm'))): noms[os.path.basename(f)[:-5]] = (d, f)
res = {}
for nom, (d, f) in sorted(noms.items()):
    w, h = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip().split(','))
    lh = int(round(LW * (h / 2) / w / 2) * 2)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', f, '-vf', f'crop=iw:ih/2:0:0,scale={LW}:{lh}', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, lh, LW, 4).astype(np.float32)
    n = len(fr)
    if n == 0: continue
    a = fr[..., 3:4] / 255.0; img = fr[..., :3] * a          # couleur sur noir (transparence appliquée)
    g = img.mean(-1)
    diff = np.abs(np.diff(g, axis=0)).mean((1, 2)) if n > 1 else np.zeros(0)
    med = float(np.median(diff)) if len(diff) else 0
    sauts = [int(i + 1) for i, v in enumerate(diff) if v > max(4 * med, med + 3.0)]
    figees = [int(i + 1) for i, v in enumerate(diff) if v < 0.02 * max(med, 1e-3)]
    boucle = float(np.abs(g[-1] - g[0]).mean()) if n > 1 else 0
    # répétitions : une image presque identique à une image bien plus ancienne (le film repasse)
    rep = []
    small = g[:, ::4, ::4].reshape(n, -1)
    for i in range(10, n):
        dd = np.abs(small[:i - 8] - small[i]).mean(1)
        j = int(dd.argmin())
        if dd[j] < 0.25 * max(med, 0.3): rep.append([i, j])
    res[nom] = {'dossier': d, 'images': n, 'diff_mediane': round(med, 2), 'sauts': sauts, 'figees': figees,
                'raccord_boucle': round(boucle, 2), 'raccord_mauvais': bool(boucle > max(4 * med, med + 3.0)), 'repetitions': rep[:40],
                'diff': [round(float(v), 2) for v in diff], 'lw': LW, 'lh': lh, 'cols': COLS}
    rows = (n + COLS - 1) // COLS
    sheet = np.zeros((rows * lh, COLS * LW, 3), np.uint8)
    for i in range(n):
        r, c = divmod(i, COLS); sheet[r * lh:(r + 1) * lh, c * LW:(c + 1) * LW] = np.clip(img[i], 0, 255).astype(np.uint8)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{COLS * LW}x{rows * lh}', '-i', '-', '-q:v', '4', os.path.join(OUT, nom + '.jpg')], input=sheet.tobytes())
    print(nom, n, 'sauts', len(sauts), 'figées', len(figees), 'rép', len(rep), 'boucle', round(boucle, 1), flush=True)
json.dump(res, open(os.path.join(OUT, 'defauts.json'), 'w'), ensure_ascii=False)
print('fini', len(res))
