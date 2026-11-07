import * as THREE from 'three';

// Écran volumétrique : la surface de l'écran reste plate et intouchable, l'image est un relief
// continu DERRIÈRE elle. Chaque point est reculé selon la profondeur calculée par Video Depth
// Anything (vidéo RGBD : couleur en haut, profondeur en bas). Rien ne sort jamais de l'écran :
// le plus proche affleure la surface, le noir des abysses part au fond.
// En se décalant, on voit le relief changer de forme (parallaxe), comme derrière une vitre.

export function reliefMaterial(tex, { u0, u1, v1, depth = 2.0, colorFrac = 2 / 3 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, uU0: { value: u0 }, uU1: { value: u1 }, uV1: { value: v1 },
      uDepth: { value: depth }, uCF: { value: colorFrac },
    },
    vertexShader: /* glsl */`
      uniform sampler2D map; uniform float uU0, uU1, uV1, uDepth, uCF;
      varying vec2 vC; varying float vBack;
      void main(){
        vec2 s = vec2(mix(uU0, uU1, uv.x), uv.y * uV1);   // position dans l'extrait
        vec2 dUv = vec2(s.x, s.y * (1.0 - uCF));          // profondeur : bas de l'image
        vC = vec2(s.x, (1.0 - uCF) + s.y * uCF);          // couleur : haut de l'image
        float d = texture2D(map, dUv).r;                  // 1 = au ras de l'écran, 0 = au fond
        vBack = uDepth * (1.0 - d);
        vec3 p = position; p.z -= 0.01 + vBack;           // toujours derrière la surface
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec2 vC; varying float vBack;
      vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main(){
        vec3 c = toLinear(texture2D(map, vC).rgb);
        c = max(c - 0.02, 0.0) / 0.98;
        // bords de silhouette : là où le relief plonge brutalement, on éteint la « toile » étirée
        float slope = fwidth(vBack) / max(fwidth(vC.x) * 400.0, 1e-4);
        c *= 1.0 - smoothstep(0.15, 0.6, slope);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// Remplace un écran plat par un écran en relief de même taille et même position.
export function reliefScreen(scene, { w, h, position, rotationY = 0, tex, segX = 400, segY = 370, ...opts }) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, segX, segY), reliefMaterial(tex, opts));
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  mesh.frustumCulled = false; // les sommets sont déplacés dans le shader
  scene.add(mesh);
  return mesh;
}
