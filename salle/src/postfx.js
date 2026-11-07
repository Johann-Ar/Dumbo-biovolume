import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Rendu « caméra de lunettes » : légère distorsion grand-angle, aberration chromatique
// sur les bords, vignettage, grain de capteur. L'exposition (renderer.toneMappingExposure)
// est réglée par main.js et appliquée avec le tone mapping ACES dans OutputPass.
const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uK: { value: 0.07 },
    uCA: { value: 0.004 },
    uVig: { value: 0.55 },
    uGrain: { value: 0.06 },
    uAspect: { value: 1 },
    uBlur: { value: new THREE.Vector2() }, // flou de mouvement (en unités p) pendant les rotations de tête
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uK, uCA, uVig, uGrain, uAspect; uniform vec2 uRes, uBlur;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec2 warp(vec2 p, float k){
      float r2 = dot(p, p);
      float norm = 1.0 + k * (uAspect * uAspect + 1.0);   // garde les coins dans l'image
      return p * (1.0 + k * r2) / norm;
    }
    vec2 toUv(vec2 p){ return vec2(p.x / uAspect, p.y) * 0.5 + 0.5; }
    void main(){
      vec2 p = (vUv - 0.5) * 2.0; p.x *= uAspect;
      float r2 = dot(p, p);
      float ca = uCA * r2;
      vec3 col = vec3(0.0);
      // obturateur ouvert pendant une demi-image : 8 échantillons le long du déplacement
      for (int i = 0; i < 8; i++) {
        vec2 q = p + uBlur * (float(i) / 7.0 - 0.5);
        col.r += texture2D(tDiffuse, toUv(warp(q, uK + ca))).r;
        col.g += texture2D(tDiffuse, toUv(warp(q, uK))).g;
        col.b += texture2D(tDiffuse, toUv(warp(q, uK - ca))).b;
      }
      col /= 8.0;
      float vig = smoothstep(2.2, 0.3, length(p * vec2(1.0 / uAspect * 0.9, 1.0)) * 1.25);
      col *= mix(1.0, vig, uVig);
      float n = hash(vUv * uRes + fract(uTime * 37.0) * 100.0) - 0.5;
      col += n * uGrain * (sqrt(max(col, 0.0)) * 0.6 + 0.01);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.55);
  composer.addPass(bloom);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  composer.addPass(new OutputPass());

  const resize = () => {
    composer.setSize(innerWidth, innerHeight);
    lens.uniforms.uAspect.value = innerWidth / innerHeight;
    lens.uniforms.uRes.value.set(innerWidth, innerHeight);
  };
  resize();
  return { composer, bloom, lens, resize };
}
