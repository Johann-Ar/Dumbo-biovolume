# Mesure la qualité RÉELLE de chaque créature (beaucoup de sources sont agrandies : leur taille en pixels ment).
# Netteté = gradient moyen / contraste, dans la créature (alpha), sur 3 images. Une image nette vaut ~0,2 ;
# une image floue agrandie vaut moins, à proportion de son agrandissement.
# Sortie : assets/creatures_hd/qualite.json  {nom: {"px": hauteur en pixels du panneau couleur, "utile": hauteur réellement nette}}
# Usage : python -I tools/qualite_creatures.py assets/creatures_hd <dossier_temporaire>
import cv2, json, glob, os, subprocess, sys, numpy as np
d, tmp = sys.argv[1], sys.argv[2]
out = {}
for f in sorted(glob.glob(d + '/*.webm')):
    n = os.path.basename(f)[:-5]
    dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout or 4)
    S = []
    for k, fr in enumerate([0.3, 0.5, 0.7]):
        p = f'{tmp}/{n}_{k}.png'
        if not os.path.exists(p):
            subprocess.run(['ffmpeg','-v','error','-y','-c:v','libvpx-vp9','-ss',str(dur*fr),'-i',f,'-frames:v','1',p])
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None or im.shape[2] < 4: continue
        im = im[: im.shape[0] // 2]                    # moitié haute = couleur + transparence (le bas = relief)
        H = im.shape[0]
        g = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
        m = cv2.erode((im[..., 3] > 128).astype(np.uint8), np.ones((5, 5))) > 0
        if m.sum() < 500: continue
        gx = cv2.Sobel(g, cv2.CV_32F, 1, 0); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
        S.append(np.hypot(gx, gy)[m].mean() / (g[m].std() + 1))
    if S:
        s = float(np.median(S)); out[n] = {'px': H, 'utile': int(min(H, H * s / 0.2)), 'nettete': round(s, 3)}
        print(n, out[n], flush=True)
json.dump(out, open(d + '/qualite.json', 'w'), indent=1)
