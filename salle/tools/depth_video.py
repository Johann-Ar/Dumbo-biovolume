"""Vidéo + profondeur (Video Depth Anything) -> une vidéo RGBD empilée pour la page.

Sortie : WebM VP9, couleur en haut (W×H), profondeur en bas (W×H/2, niveaux de gris,
blanc = proche de la surface de l'écran, noir = loin derrière). Couleur et profondeur sont
dans la même image : elles restent synchronisées sans effort.

Usage (avec l'environnement de Video-Depth-Anything) :
  python -I depth_video.py <video> <sortie.webm> --ss 52 --t 10 --crop 1080:540:1620:0
"""
import argparse, os, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--ss', type=float, default=0); ap.add_argument('--t', type=float, default=10)
ap.add_argument('--crop', default=None, help='w:h:x:y (filtre crop de ffmpeg)')
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--vda', default=os.path.expanduser('~/Documents/Projet Portfolio/Video-Depth-Anything'))
ap.add_argument('--encoder', default='vits')
a = ap.parse_args()

sys.path.insert(0, a.vda)
import torch
from video_depth_anything.video_depth import VideoDepthAnything

# 1. Lecture des images (ffmpeg -> RGB brut)
vf = (f'crop={a.crop},' if a.crop else '') + f'fps={a.fps}'
probe = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-ss', str(a.ss), '-t', str(a.t), '-i', a.video,
                        '-vf', vf, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', '-'], capture_output=True).stdout
W, H = map(int, probe.split(b'\n')[1].split())
raw = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-ss', str(a.ss), '-t', str(a.t), '-i', a.video,
                      '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
print(f'{len(frames)} images {W}x{H}', flush=True)

# 2. Profondeur (disparité relative, stable dans le temps)
cfg = {'vits': dict(encoder='vits', features=64, out_channels=[48, 96, 192, 384]),
       'vitb': dict(encoder='vitb', features=128, out_channels=[96, 192, 384, 768]),
       'vitl': dict(encoder='vitl', features=256, out_channels=[256, 512, 1024, 1024])}[a.encoder]
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
m = VideoDepthAnything(**cfg)
m.load_state_dict(torch.load(os.path.join(a.vda, f'checkpoints/video_depth_anything_{a.encoder}.pth'), map_location='cpu'))
m = m.to(dev).eval()
depths, _ = m.infer_video_depth(frames, a.fps, input_size=518, device=dev, fp32=True)
depths = np.asarray(depths, np.float32)

# 3. Normalisation sur tout l'extrait (pas image par image : sinon le relief « respire »)
lo, hi = np.percentile(depths, [2, 99.5])
d = np.clip((depths - lo) / max(hi - lo, 1e-6), 0, 1)
# Le noir des abysses n'a pas de relief : poussé au fond
lum = frames.astype(np.float32).mean(-1) / 255
d = d * np.clip((lum - 0.03) / 0.05, 0, 1)
print(f'disparité {lo:.3f}..{hi:.3f}', flush=True)

# 4. Empilement couleur + profondeur (moitié de hauteur) et encodage
import cv2
dh = H // 2 // 2 * 2
out = np.empty((len(frames), H + dh, W, 3), np.uint8)
out[:, :H] = frames
for i in range(len(frames)):
    g = (cv2.resize(d[i], (W, dh), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8)
    out[i, H:] = g[..., None]
enc = subprocess.Popen(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                        '-s', f'{W}x{H + dh}', '-r', str(a.fps), '-i', '-', '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0',
                        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p', a.out], stdin=subprocess.PIPE)
enc.stdin.write(out.tobytes()); enc.stdin.close(); enc.wait()
print('OK', a.out, os.path.getsize(a.out), 'octets', flush=True)
