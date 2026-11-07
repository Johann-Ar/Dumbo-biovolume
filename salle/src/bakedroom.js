import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Salle pré-éclairée : géométrie et lumière calculées dans Blender (salle/blender/build_room.py).
// Chaque surface reçoit la lumière de 4 groupes d'écrans, enregistrée séparément :
// room_lm_a.png = gauche / fond / droite (R, V, B), room_lm_b.png = sol (R).
// Sur la page, chaque groupe est multiplié par la couleur moyenne réelle de sa vidéo.

const SURFACES = {
  post: { color: 0x0b0b0c, roughness: 0.55, metalness: 0.0 },
  canopy: { color: 0x3a3d42, roughness: 0.45, metalness: 0.8 },
  projector: { color: 0x1a1b1e, roughness: 0.55, metalness: 0.2 },
  ceiling: { color: 0x3b2a1e, roughness: 0.85, metalness: 0.0 },
  wall: { color: 0x1b1b1d, roughness: 0.95, metalness: 0.0 },
};

export async function loadBakedRoom(scene, base = 'assets/') {
  const tl = new THREE.TextureLoader();
  const tex = (f) => tl.loadAsync(base + f).then((t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; return t; });
  const [gltf, lmA, lmB, meta] = await Promise.all([
    new GLTFLoader().loadAsync(base + 'room.glb'), tex('room_lm_a.png'), tex('room_lm_b.png'),
    fetch(base + 'room_lm.json').then((r) => r.json()),
  ]);

  const uniforms = {
    lmB: { value: lmB },
    uScale: { value: meta.scale * Math.PI }, // valeur calculée = E/π (albédo 1)
    cL: { value: new THREE.Color() }, cB: { value: new THREE.Color() },
    cR: { value: new THREE.Color() }, cF: { value: new THREE.Color() },
  };
  const chunk = THREE.ShaderChunk.lights_fragment_maps.replace(
    'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
    `vec3 a = lightMapTexel.rgb; a *= a;
     float f = texture2D(lmB, vLightMapUv).r; f *= f;
     vec3 lightMapIrradiance = (a.r * cL + a.g * cB + a.b * cR + f * cF) * uScale * lightMapIntensity;`);

  const mats = {};
  for (const [name, p] of Object.entries(SURFACES)) {
    const m = new THREE.MeshStandardMaterial({ ...p, lightMap: lmA, name });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.fragmentShader = 'uniform sampler2D lmB; uniform float uScale; uniform vec3 cL, cB, cR, cF;\n' +
        sh.fragmentShader.replace('#include <lights_fragment_maps>', chunk);
    };
    mats[name] = m;
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = Object.keys(mats).find((k) => o.material.name.startsWith(k));
    o.material = mats[key] || mats.wall;
  });
  scene.add(gltf.scene);

  return {
    root: gltf.scene,
    setColors({ left, back, right, floor }) {
      uniforms.cL.value.copy(left); uniforms.cB.value.copy(back);
      uniforms.cR.value.copy(right); uniforms.cF.value.copy(floor);
    },
  };
}
