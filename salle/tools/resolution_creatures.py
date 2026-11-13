# Résolution RÉELLE de chaque créature (13/11) : beaucoup de sources ont été agrandies, leur taille en pixels ment, et
# l'ancienne mesure de netteté (qualite_creatures.py) les jugeait toutes nettes. Ici : chaque image est réduite d'un facteur s
# puis réagrandie ; tant que l'animal n'y perd rien, ces détails n'existaient pas. La plus petite réduction sans perte
# (écart < SEUIL du contraste, dans l'animal) donne la hauteur réellement définie : utile = px × s.
# Sortie : <dossier>/qualite.json  {nom: {"px": hauteur du panneau couleur, "utile": hauteur réellement définie, "s": s}}
# Usage : python -I tools/resolution_creatures.py assets/creatures_hd <dossier_temporaire>
import cv2, json, glob, os, subprocess, sys, numpy as np
d, tmp = sys.argv[1], sys.argv[2]; SEUIL = float(os.environ.get('SEUIL', 0.06))
ECH = [1, .85, .72, .6, .5, .42, .35, .3, .25, .2]
out = {}
for f in sorted(glob.glob(d + '/*.webm')):
    n = os.path.basename(f)[:-5]
    dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout or 4)
    E = []; H = None
    for k, fr in enumerate([0.3, 0.5, 0.7]):
        p = f'{tmp}/{n}_{k}.png'
        if not os.path.exists(p):
            subprocess.run(['ffmpeg','-v','error','-y','-c:v','libvpx-vp9','-ss',str(dur*fr),'-i',f,'-frames:v','1',p])
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None or im.shape[2] < 4: continue
        im = im[: im.shape[0] // 2]; H = im.shape[0]
        g = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
        m = cv2.erode((im[..., 3] > 128).astype(np.uint8), np.ones((7, 7))) > 0
        if m.sum() < 500: continue
        c = g[m].std() + 2
        E.append([np.abs(cv2.resize(cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), g.shape[::-1], interpolation=cv2.INTER_CUBIC) - g)[m].mean() / c for s in ECH])
    if not E: continue
    e = np.median(np.array(E), 0)
    s = next((ECH[i - 1] for i in range(1, len(ECH)) if e[i] > SEUIL), ECH[-1])
    out[n] = {'px': H, 'utile': int(H * s), 's': s, 'ecarts': [round(float(x), 3) for x in e]}
    print(n, H, s, out[n]['ecarts'], flush=True)
json.dump(out, open(d + '/qualite.json', 'w'), indent=1)
