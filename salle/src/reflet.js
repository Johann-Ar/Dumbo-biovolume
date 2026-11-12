import * as THREE from 'three';

// Reflet net d'un sol noir brillant (miroir plan) : seuls les objets du calque COUCHE s'y reflètent (panneau d'accueil,
// texte, spots et leurs potences). Peu coûteux : quelques maillages, rendus à demi-résolution, ajoutés en douceur
// (fondu additif, léger flou) par-dessus le sol noir. Le reflet est pris depuis l'œil du visiteur symétrisé sous le sol.
export const COUCHE = 2;

export function refletSol(scene, renderer, { x0, x1, z0, z1, y = 0.004, force = 0.3 }) {
  const taille = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const vcam = new THREE.PerspectiveCamera(); vcam.layers.set(COUCHE);
  const texMat = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    uniforms: { tRefl: { value: rt.texture }, texMat: { value: texMat }, force: { value: force }, pas: { value: new THREE.Vector2() } },
    vertexShader: `uniform mat4 texMat; varying vec4 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = texMat * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tRefl; uniform float force; uniform vec2 pas; varying vec4 vP;
      void main() {
        vec2 uv = vP.xy / vP.w; vec3 c = vec3(0.0);
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) c += texture2D(tRefl, uv + vec2(float(i), float(j)) * pas).rgb;
        gl_FragColor = vec4(c / 25.0 * force, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    // comme la boîte de l'accueil : jamais dessiné à travers un écran (pochoir, screens.js)
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  });
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  sol.rotation.x = -Math.PI / 2; sol.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); sol.renderOrder = 56;
  const pos = new THREE.Vector3(), cible = new THREE.Vector3(), haut = new THREE.Vector3(), dir = new THREE.Vector3();
  const sym = (v) => { v.y = 2 * y - v.y; return v; };
  let enCours = false;
  sol.onBeforeRender = (r, s, cam) => {
    if (enCours) return;
    pos.setFromMatrixPosition(cam.matrixWorld);
    if (pos.y <= y) return;
    cam.getWorldDirection(dir);
    cible.copy(pos).add(dir); haut.set(0, 1, 0).applyQuaternion(cam.quaternion);
    vcam.position.copy(sym(pos)); sym(cible); haut.y = -haut.y;
    vcam.up.copy(haut); vcam.lookAt(cible); vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(cam.projectionMatrix); vcam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    r.getDrawingBufferSize(taille); const w = Math.max(16, taille.x >> 1), h = Math.max(16, taille.y >> 1);
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    mat.uniforms.pas.value.set(5.0 / w, 7.0 / h);   // flou large : reflet mat
    enCours = true; const avant = r.getRenderTarget(), bg = s.background, ac = r.autoClear;
    s.background = null; r.autoClear = true;
    r.setRenderTarget(rt); r.render(s, vcam);
    r.setRenderTarget(avant); s.background = bg; r.autoClear = ac; enCours = false;
  };
  scene.add(sol);
  return sol;
}
