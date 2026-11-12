"""Vidéo + profondeur avec Depth Anything V2 (petit modèle, image par image, rapide sur puce Apple),
lissée dans le temps pour que le relief ne tremble pas. Même sortie que depth_video.py :
WebM VP9, couleur en haut, profondeur en bas (moitié de hauteur, blanc = au ras de la vitre).

Usage : python -I depth_v2.py <video> <sortie.webm> --ss 52 --t 10 --crop 1080:540:1620:0
"""
import argparse, subprocess, numpy as np, torch, cv2
from PIL import Image
from transformers import pipeline

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--ss', type=float, default=0); ap.add_argument('--t', type=float, default=10)
ap.add_argument('--crop', default=None); ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--smooth', type=float, default=0.75, help='lissage temporel (0 = aucun)')
a = ap.parse_args()

vf = (f'crop={a.crop},' if a.crop else '') + f'fps={a.fps}'
probe = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-ss', str(a.ss), '-i', a.video, '-vf', vf,
                        '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', '-'], capture_output=True).stdout
W, H = map(int, probe.split(b'\n')[1].split())
raw = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-ss', str(a.ss), '-t', str(a.t), '-i', a.video,
                      '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
print(len(frames), 'images', W, 'x', H, flush=True)

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
pipe = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf', device=dev)
depths, prev = [], None
for i, f in enumerate(frames):
    d = pipe(Image.fromarray(f))['predicted_depth'].squeeze().float().cpu().numpy()   # disparité relative
    d = cv2.resize(d, (W, H), interpolation=cv2.INTER_LINEAR)
    prev = d if prev is None else a.smooth * prev + (1 - a.smooth) * d                # lissage dans le temps
    depths.append(prev)
    if i % 50 == 0: print('image', i, flush=True)
depths = np.asarray(depths, np.float32)
lo, hi = np.percentile(depths, [2, 99.5])
d = np.clip((depths - lo) / max(hi - lo, 1e-6), 0, 1)
lum = frames.astype(np.float32).mean(-1) / 255
d *= np.clip((lum - 0.03) / 0.05, 0, 1)              # le noir des abysses part au fond

dh = H // 2 // 2 * 2
out = np.empty((len(frames), H + dh, W, 3), np.uint8); out[:, :H] = frames
for i in range(len(frames)):
    out[i, H:] = (cv2.resize(d[i], (W, dh), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8)[..., None]
enc = subprocess.Popen(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H + dh}',
                        '-r', str(a.fps), '-i', '-', '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1',
                        '-pix_fmt', 'yuv420p', a.out], stdin=subprocess.PIPE)
enc.stdin.write(out.tobytes()); enc.stdin.close(); enc.wait()
print('OK', a.out, flush=True)
