"""Retire la neige marine incrustée dans une vidéo de créatures sur fond noir (panorama).
Agrandie sur 9 m de haut, elle devient floue et pixelisée : la neige est désormais générée en direct (dehors.js).
On efface : les petits points isolés, et les taches pâles et rondes (flocons flous). Les créatures (grandes
structures, ou proches d'une grande structure) sont gardées intactes.
Usage : python -I sans_neige.py entree sortie.webm"""
import sys, subprocess, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
w, h = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src],
                               capture_output=True, text=True).stdout.strip().split(','))
dec = subprocess.Popen(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '30', '-i', '-',
                        '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
n = 0
while True:
    buf = dec.stdout.read(w * h * 3)
    if len(buf) < w * h * 3: break
    f = np.frombuffer(buf, np.uint8).reshape(h, w, 3).copy()
    g = f.max(axis=2)
    m = (g > 10).astype(np.uint8)
    k, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    big = np.zeros(k, bool); big[1:] = st[1:, cv2.CC_STAT_AREA] >= 900          # créatures
    near = cv2.dilate(big[lab].astype(np.uint8), np.ones((25, 25), np.uint8)) > 0   # ce qui touche une créature (tentacules)
    peak = np.zeros(k); np.maximum.at(peak, lab.ravel(), g.ravel())
    area = st[:, cv2.CC_STAT_AREA]
    snow = (area < 60) | ((area < 900) & (peak < 70))                            # points, et taches pâles
    snow[0] = False
    kill = snow[lab] & ~near
    kill = cv2.dilate(kill.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    soft = cv2.GaussianBlur(kill.astype(np.float32), (0, 0), 1.5)
    f = (f * (1 - np.clip(soft * 1.5, 0, 1))[..., None]).astype(np.uint8)
    enc.stdin.write(f.tobytes()); n += 1
    if n % 300 == 0: print(n, flush=True)
enc.stdin.close(); enc.wait(); print('OK', n, out, flush=True)
