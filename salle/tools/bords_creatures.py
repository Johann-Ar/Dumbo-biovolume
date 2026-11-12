"""Quels bords de l'image coupent l'animal ? (haut, bas, gauche, droite)

creature_pack.py recadre avec une marge : un animal entier ne touche jamais le cadre. S'il le touche (bande
extérieure de 2 % avec de la matière opaque, sur une part notable des images), il est coupé de ce côté.
La salle place ces animaux pour que leur coupe tombe sur un bord EXTÉRIEUR des écrans (haut des murs, bout des
murs côté entrée), jamais entre deux écrans. Sortie : assets/creatures_hd/bords.json  { nom: ["bas", ...] }.

Usage : python -I tools/bords_creatures.py [dossier]
"""
import sys, os, json, subprocess, numpy as np
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'assets', 'creatures_hd')
out = {}
for f in sorted(os.listdir(D)):
    if not f.endswith('.webm'): continue
    n = f[:-5]
    w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                              '-of', 'csv=p=0', os.path.join(D, f)]).decode().strip().split(','))
    pw = 160; ph = int(round(h * pw / w / 2)) * 2
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', os.path.join(D, f), '-vf',
                          f"select=not(mod(n\\,10)),scale={pw}:{ph}", '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
                         capture_output=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, ph, pw, 4)[:, : ph // 2, :, 3].astype(np.float32) / 255
    H, W = a.shape[1:]; bh = max(2, int(H * 0.02)); bw = max(2, int(W * 0.02))
    bandes = {'haut': a[:, :bh], 'bas': a[:, -bh:], 'gauche': a[:, :, :bw], 'droite': a[:, :, -bw:]}
    res = []
    for k, b in bandes.items():
        touche = (b > 0.5).mean(axis=(1, 2))                 # part opaque de la bande, image par image
        if (touche > 0.04).mean() > 0.25: res.append(k)
    out[n] = res
    print(n, res, flush=True)
json.dump(out, open(os.path.join(D, 'bords.json'), 'w'), indent=0)
