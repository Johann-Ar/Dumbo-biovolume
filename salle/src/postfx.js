import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Rendu « caméra de lunettes » : légère distorsion grand-angle, vignettage, grain de capteur,
// flou de mouvement des rotations de tête. L'exposition (renderer.toneMappingExposure)
// est réglée par main.js et appliquée avec le tone mapping ACES dans OutputPass.
const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uK: { value: 0.0 },   // pas de courbure des bords
    uVig: { value: 0.0 }, // pas de bords assombris
    uGrain: { value: 0.06 },
    uAspect: { value: 1 },
    uFade: { value: 0 },   // apparition de la salle (0 = noir, 1 = pleine lumière)
    uBlur: { value: new THREE.Vector2() }, // flou de mouvement (en unités p) pendant les rotations de tête
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uK, uVig, uGrain, uAspect; uniform vec2 uRes, uBlur; uniform float uFade;
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
      vec3 col = vec3(0.0);
      // obturateur ouvert pendant une demi-image : 8 échantillons le long du déplacement
      for (int i = 0; i < 8; i++) {
        float jit = hash(vUv * uRes + float(i) * 7.13) - 0.5;          // tirage aléatoire par pixel : flou lisse, sans bandes
        vec2 q = p + uBlur * ((float(i) + jit) / 7.0 - 0.5);
        col += texture2D(tDiffuse, toUv(warp(q, uK))).rgb;
      }
      col /= 8.0;
      float vig = smoothstep(2.2, 0.3, length(p * vec2(1.0 / uAspect * 0.9, 1.0)) * 1.25);
      col *= mix(1.0, vig, uVig);
      col *= uFade;
      float n = hash(vUv * uRes + fract(uTime * 37.0) * 100.0) - 0.5;
      col += n * uGrain * (sqrt(max(col, 0.0)) * 0.6 + 0.01);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera) {
  // anticrénelage matériel (4 échantillons) : arêtes nettes, pas d'escaliers
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });   // pochoir : les écrans-hublots
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // halo réaliste : faible, serré, seulement sur ce qui est vraiment très lumineux (comme l'œil ou une caméra)
  // ?halo=0.45,0.6,0.55 : ancien réglage (force, rayon, seuil)
  const [hf, hr, hs] = (new URLSearchParams(location.search).get('halo') ?? '0.32,0.45,0.55').split(',').map(Number);   // plus présent : les lumières colorées des animaux rayonnent
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), hf, hr, hs);
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
