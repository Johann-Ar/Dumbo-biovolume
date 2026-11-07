import * as THREE from 'three';

// Une vidéo = un seul <video> + une seule texture partagée par toutes les vitres
// (chaque vitre lit sa tranche via des uniforms : un seul envoi au GPU par image).
export function makeVideo(src) {
  const video = document.createElement('video');
  video.src = src;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { video, tex };
}

// Couleur moyenne de chaque tranche d'une vidéo (pour la lumière que les vitres jettent dans la salle).
export class SliceColors {
  constructor(video, slices) {
    this.video = video;
    this.n = slices;
    this.canvas = document.createElement('canvas');
    this.canvas.width = slices;
    this.canvas.height = 2;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.colors = Array.from({ length: slices }, () => new THREE.Color(0, 0, 0));
  }
  update() {
    const v = this.video;
    if (v.readyState < 2) return;
    this.ctx.drawImage(v, 0, 0, this.n, 2);
    const d = this.ctx.getImageData(0, 0, this.n, 2).data;
    for (let i = 0; i < this.n; i++) {
      const a = i * 4, b = (this.n + i) * 4;
      this.colors[i].setRGB((d[a] + d[b]) / 510, (d[a + 1] + d[b + 1]) / 510, (d[a + 2] + d[b + 2]) / 510, THREE.SRGBColorSpace);
    }
  }
}
