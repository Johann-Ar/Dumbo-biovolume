"""Visiteurs : beaucoup plus de photos de vraies personnes, tirées de la vidéo de la vraie salle (capture-salle).
Avant : 35 images de 4 personnes (assets/ghosts/tracks), répétées partout dans la salle.
Mask R-CNN (COCO, classe personne) sur la vidéo, quelques images par seconde. Chaque personne entière (assez grande,
ne touchant pas le bord de l'image) est découpée avec son masque (bord adouci), mise à 512 px de haut, en RGBA.
Une même personne presque immobile d'une image à l'autre n'est gardée qu'une fois.
Sortie : <dossier>/v_0000.png …  + <dossier>/pool.json (nombre d'images)
Usage : python -I extrait_visiteurs.py video.mp4 dossier [--fps 4] [--hmin 300]
"""
import argparse, json, os, subprocess, numpy as np, cv2, torch
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2, MaskRCNN_ResNet50_FPN_V2_Weights

ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--fps', type=float, default=4); ap.add_argument('--hmin', type=int, default=300)
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
W, H = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                         '-of', 'csv=p=0', a.video]).decode().split(','))
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
m = maskrcnn_resnet50_fpn_v2(weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT, box_score_thresh=0.6).eval().to(dev)
p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', a.video, '-vf', f'fps={a.fps}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
                     stdout=subprocess.PIPE)
n = 0; prec = []; i = 0; S = 2   # détection à mi-résolution, découpe en pleine résolution
while True:
    raw = p.stdout.read(W * H * 3)
    if len(raw) < W * H * 3: break
    img = np.frombuffer(raw, np.uint8).reshape(H, W, 3); i += 1
    small = cv2.resize(img, (W // S, H // S), interpolation=cv2.INTER_AREA)
    x = torch.from_numpy(cv2.cvtColor(small, cv2.COLOR_BGR2RGB)).permute(2, 0, 1).float().div(255).to(dev)
    with torch.no_grad(): o = m([x])[0]
    cur = []
    for k in range(len(o['labels'])):
        if o['labels'][k] != 1 or o['scores'][k] < 0.85: continue
        x0, y0, x1, y1 = (o['boxes'][k].cpu().numpy() * S).astype(int)
        if y1 - y0 < a.hmin or x0 < 10 or y0 < 10 or x1 > W - 10 or y1 > H - 10: continue   # entière, assez grande
        if (y1 - y0) < 1.6 * (x1 - x0): continue                                                 # debout (pas un buste coupé)
        b = np.array([x0, y0, x1, y1], float); cur.append(b)
        # déjà gardée à l'image précédente, presque au même endroit : sautée
        if any(np.abs(b - q).max() < 0.06 * (y1 - y0) for q in prec): continue
        mk = cv2.resize(o['masks'][k, 0].cpu().numpy(), (W, H), interpolation=cv2.INTER_LINEAR)
        g = int(0.06 * (y1 - y0)); X0, Y0, X1, Y1 = max(0, x0 - g), max(0, y0 - g), min(W, x1 + g), min(H, y1 + g)
        al = cv2.GaussianBlur(np.clip((mk[Y0:Y1, X0:X1] - 0.35) / 0.3, 0, 1), (0, 0), max(1.0, (y1 - y0) / 250))
        rgba = np.dstack([img[Y0:Y1, X0:X1], (al * 255).astype(np.uint8)])
        s = 512 / rgba.shape[0]
        rgba = cv2.resize(rgba, (max(2, int(rgba.shape[1] * s)), 512), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(a.out, f'v_{n:04d}.png'), rgba); n += 1
    prec = cur
    if i % 40 == 0: print(f'{i} images lues, {n} visiteurs', flush=True)
p.wait()
json.dump({'n': n}, open(os.path.join(a.out, 'pool.json'), 'w'))
print(f'OK {n} visiteurs', flush=True)
