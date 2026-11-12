"""Vidéos de créatures : boucle À L'ENDROIT, sans changement brusque d'animal.

1. Aller-retour -> aller seul : les anciens paquets jouaient la séquence à l'aller puis au retour (l'animal
   nageait à reculons). On le détecte (image i ≈ image M-i) et on ne garde que l'aller ; si le ralenti en
   cosinus de creature_pack.py est reconnu (M = int(2 (N-1) 1.25)), on retrouve exactement les images d'origine.
2. Coupes : dans certaines vidéos l'animal change d'un coup (autre plan, autre animal, même endroit). On mesure
   l'écart entre images voisines (petite version en gris + transparence) ; un pic très au-dessus du reste = coupe.
   On garde le plus long morceau sans coupe.
3. (retiré le 12/11) : plus aucun fondu de boucle, il dédoublait l'animal sur lui-même.
Sortie : <nom>.webm remplacé, <nom>.mp4 supprimé (à refaire : recode_creatures.sh), "boucle": "avant",
"coupes_ok": true dans <nom>.json. Lecture en flux : jamais toute la vidéo en pleine taille en mémoire.

Usage : python -I boucle_avant.py dossier [noms...]
"""
import sys, os, json, math, subprocess, numpy as np

def probe(f):
    w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                              '-of', 'csv=p=0', f]).decode().strip().split(','))
    return w, h

def petit(f, w, h):
    pw = 96; ph = int(round(h * pw / w / 2)) * 2
    p = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', f, '-vf', f'scale={pw}:{ph}', '-f', 'rawvideo',
                        '-pix_fmt', 'rgba', '-'], capture_output=True).stdout
    a = np.frombuffer(p, np.uint8).reshape(-1, ph, pw, 4).astype(np.float32)
    a = a[:, : ph // 2]                                                   # moitié haute : couleur + transparence
    return np.concatenate([a[..., :3].mean(-1, keepdims=True) * a[..., 3:] / 255, a[..., 3:]], -1)

def traite(dossier, n):
    base = os.path.join(dossier, n); js = base + '.json'
    if not os.path.exists(js) or not os.path.exists(base + '.webm'): return
    info = json.load(open(js))
    if info.get('coupes_ok'): return
    w, h = probe(base + '.webm'); f = petit(base + '.webm', w, h); M = len(f)
    if M < 20: return
    # 1. aller-retour ?
    idx = list(range(M))
    if info.get('boucle') != 'avant':
        miroir = np.mean([np.abs(f[i] - f[M - 1 - i]).mean() for i in range(0, M // 3, 3)])
        voisin = np.mean([np.abs(f[i] - f[min(i + 6, M - 1)]).mean() for i in range(0, M // 3, 3)])
        miroir2 = np.mean([np.abs(f[i] - f[M - i]).mean() for i in range(1, M // 3, 3)])
        if min(miroir, miroir2) < 0.5 * voisin + 0.3:
            Ne = M / 2.5 + 1
            if abs(Ne - round(Ne)) < 0.45 and int(2 * (round(Ne) - 1) * 1.25) == M:
                N = int(round(Ne)); idx = [min(M - 1, round(M / (2 * math.pi) * math.acos(1 - 2 * k / (N - 1)))) for k in range(N)]
            else:
                idx = list(range(M // 2 + 1))
    # 2. coupes (sur la séquence à l'endroit)
    d = np.array([np.abs(f[idx[i + 1]] - f[idx[i]]).mean() for i in range(len(idx) - 1)])
    # coupe = vrai changement de plan : saut très fort ET les images d'après restent différentes de celles d'avant
    # (un mouvement rapide de l'animal fait aussi un gros écart d'une image à l'autre, mais pas durable : pas une coupe)
    seuil = max(6.0, 8 * np.median(d) + 1.5)
    ref = np.median([np.abs(f[idx[j]] - f[idx[j + 3]]).mean() for j in range(len(idx) - 3)]) if len(idx) > 4 else 1.0
    def vraie(i):
        if i < 2 or i + 4 > len(idx): return d[i] > 2 * seuil
        avant = np.mean([f[idx[j]] for j in range(i - 2, i + 1)], axis=0)
        apres = np.mean([f[idx[j]] for j in range(i + 1, i + 4)], axis=0)
        return np.abs(avant - apres).mean() > 4 * ref + 2.0
    coupes = [i + 1 for i in range(len(d)) if d[i] > seuil and vraie(i)]
    bornes = [0] + coupes + [len(idx)]
    segs = [(bornes[j], bornes[j + 1]) for j in range(len(bornes) - 1)]
    a, b = max(segs, key=lambda s: s[1] - s[0])
    # éviter de commencer/finir sur l'image d'un fondu de coupe (2 images de marge)
    if a > 0: a = min(a + 2, b - 1)
    if b < len(idx): b = max(b - 2, a + 1)
    idx = idx[a:b]; N = len(idx)
    if N < 30: print('TROP COURT', n, N, flush=True); return
    # 3. PLUS JAMAIS de raccord fondu (demande 12/11) : il dédoublait l'animal sur lui-même. Les images sont écrites telles quelles.
    K = 0
    dec = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', base + '.webm', '-f', 'rawvideo',
                            '-pix_fmt', 'rgba', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}',
                            '-r', '30', '-i', '-', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '32', '-b:v', '0',
                            '-row-mt', '1', '-auto-alt-ref', '0', '-f', 'webm', base + '.encours'], stdin=subprocess.PIPE)
    taille = w * h * 4; voulu = {}
    for k, i in enumerate(idx): voulu.setdefault(i, []).append(k)
    debut = {}; sortie = 0; dernier = max(idx)
    for i in range(M):
        buf = dec.stdout.read(taille)
        if len(buf) < taille: break
        if i in voulu:
            fr = np.frombuffer(buf, np.uint8).reshape(h, w, 4)
            for k in voulu[i]:
                enc.stdin.write(fr.tobytes()); sortie += 1
        if i >= dernier: break
    dec.stdout.close(); dec.kill(); enc.stdin.close(); enc.wait()
    if enc.returncode != 0 or sortie < N - K: print('ECHEC', n, flush=True); return
    os.replace(base + '.encours', base + '.webm')
    if os.path.exists(base + '.mp4'): os.remove(base + '.mp4')
    info.update(images=sortie, boucle='avant', coupes_ok=True, coupes=len(coupes)); info.pop('pile', None)
    json.dump(info, open(js, 'w'))
    print('FAIT', n, M, '->', sortie, 'coupes', len(coupes), flush=True)

dossier = sys.argv[1]; noms = sys.argv[2:]
if not noms: noms = sorted(f[:-5] for f in os.listdir(dossier) if f.endswith('.webm'))
for n in noms:
    try: traite(dossier, n)
    except Exception as e: print('ERREUR', n, e, flush=True)
