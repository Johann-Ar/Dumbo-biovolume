// Ambiance sonore de la salle : un musée posé au fond de l'océan. Tout est synthétisé (aucun fichier en plus).
// - Musique son/Teimo.mp3 par défaut (?musique=0 pour la couper). Mes pas : coupés (?pas=1).
// - Grondement grave des profondeurs, qui monte et descend lentement (jamais constant).
// - Courant d'eau : souffle filtré qui va et vient, d'un côté puis de l'autre.
// - Coque du sous-marin : grincements graves et rares, dans la réverbération de la salle.
// - Bulles : quelques chapelets de temps en temps.
// - Public du musée : murmure lointain et indistinct (aucun mot compréhensible), pas feutrés qui passent.
// - Présences des créatures : souffle qui monte quand une créature s'approche.
// Propreté : boucles sans raccord audible, enveloppes douces (pas de « poc »), limiteur final (pas de saturation),
// panoramique léger (equalpower) pour ne pas surcharger le processeur audio (craquements).
// Démarre au clic d'entrée (règle des navigateurs). Bouton « Son » et touche M pour couper.

const VOLUME = 0.5;   // volume général
// Public du musée (murmure + pas) : coupé à ma demande ; ?foule=1 pour le remettre.
const FOULE = new URLSearchParams(location.search).get('foule') === '1';
// Bruits d'ambiance synthétiques (eau, grondement, coque, bulles, cliquetis) : jugés sans intérêt, coupés ; ?ambiance=1 pour les remettre.
const AMBIANCE = new URLSearchParams(location.search).get('ambiance') === '1';

export function ambiance({ music, listenerHeight = 1.65 } = {}) {
  let ctx = null, master, wet, dry, sources = [], muted = false, el = null, lastUpd = 0, pasBuf = null, marche = 0, px0 = null, pz0 = null, pied = 0;
  // le son n'est plus mémorisé d'une visite à l'autre : un « couper » oublié (bouton visible seulement en pause) coupait la musique
  try { localStorage.removeItem('salle-son'); } catch (e) { /* stockage indisponible */ }
  const R = (a, b) => a + Math.random() * (b - a);

  // bruit en boucle SANS raccord : la fin se fond dans le début (sinon un « poc » à chaque tour)
  function noiseBuffer(seconds, brown) {
    const n = Math.floor(ctx.sampleRate * seconds), M = Math.floor(ctx.sampleRate * 0.25);
    const x = new Float32Array(n + M); let last = 0;
    for (let i = 0; i < n + M; i++) {
      const w = Math.random() * 2 - 1;
      x[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
    }
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < M ? x[i] * (i / M) + x[n + i] * (1 - i / M) : x[i];
    return b;
  }
  function impulse(seconds) {                       // réverbération d'une grande salle
    const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.42 * t);
        d[i] = lp * Math.pow(1 - t, 2.6) * Math.min(1, i / 200);          // début adouci
      }
    }
    return b;
  }
  function loop(buffer, offset = 0) { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(ctx.currentTime, offset); return s; }
  function panner(x, y, z) {
    const p = ctx.createPanner();
    Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 2, maxDistance: 60, rolloffFactor: 1.2 });
    setPos(p, x, y, z, true); return p;
  }
  function setPos(p, x, y, z, now) {               // déplacement glissé (pas de saut de position = pas de clic)
    if (p.positionX) {
      if (now) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
      else { const t = ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.08); p.positionY.setTargetAtTime(y, t, 0.08); p.positionZ.setTargetAtTime(z, t, 0.08); }
    } else p.setPosition(x, y, z);
  }
  // enveloppe douce d'un événement ponctuel : part de 0, monte, redescend vers 0
  function env(g, t, peak, attack, release) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, release / 4);
    return t + attack + release * 1.6;                // fin sûre (silence)
  }
  // planifie un événement aléatoire tant que le son tourne
  function every(min, max, fn) {
    setTimeout(() => { if (ctx && ctx.state === 'running' && !muted) fn(); every(min, max, fn); }, R(min, max) * 1000);
  }
  // une valeur qui « dérive » lentement vers des cibles au hasard (rien de constant)
  function drift(param, lo, hi, tmin, tmax, tc) {
    param.setTargetAtTime(R(lo, hi), ctx.currentTime, tc);
    setTimeout(() => ctx && drift(param, lo, hi, tmin, tmax, tc), R(tmin, tmax) * 1000);
  }

  function start(creatureCount = 0) {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'playback' });       // tampon plus large : pas de craquements quand l'image calcule beaucoup
    ctx.resume?.();
    // chaîne finale : compresseur doux -> limiteur -> sortie (jamais de saturation)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.ratio.value = 2.5; comp.attack.value = 0.05; comp.release.value = 0.6; comp.knee.value = 12;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25; lim.knee.value = 0;
    master = ctx.createGain(); master.gain.value = 0;
    dry = ctx.createGain(); dry.gain.value = 1.4;
    dry.connect(master); master.connect(comp).connect(lim).connect(ctx.destination);
    const rev = ctx.createConvolver(); rev.buffer = impulse(2.6);   // réverbération plus courte : beaucoup moins de calcul audio
    wet = ctx.createGain(); wet.gain.value = 0.3; wet.connect(rev).connect(master);

    if (music) {                                       // musique seulement si demandée (?musique=1)
      el = Object.assign(new Audio(music), { loop: true, preload: 'auto', crossOrigin: 'anonymous' });
      const g = ctx.createGain(); g.gain.value = 0.85;
      ctx.createMediaElementSource(el).connect(g); g.connect(dry); g.connect(wet);
      el.play().catch(() => {});
    }

    const brown = noiseBuffer(8, true), white = noiseBuffer(4, false);

    // grondement des profondeurs
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
    const rg = ctx.createGain(); rg.gain.value = 0.1;
    if (AMBIANCE) loop(brown).connect(lp).connect(rg).connect(dry);
    drift(rg.gain, 0.05, 0.16, 7, 16, 3.5);

    // courant d'eau : deux souffles filtrés qui vont et viennent, chacun d'un côté
    for (const side of AMBIANCE ? [-0.7, 0.7] : []) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = side;
      loop(brown, R(0, 7)).connect(f).connect(g).connect(pan).connect(dry);
      drift(g.gain, 0.15, 0.6, 6, 14, 3);
      drift(f.frequency, 300, 900, 5, 12, 2.5);
    }

    // public du musée : murmure de plusieurs voix lointaines, jamais intelligible
    // (souffle passé dans des « formants » de voix, modulé au rythme des syllabes, puis très filtré et réverbéré)
    if (FOULE) {
    const foule = ctx.createGain(); foule.gain.value = 0;
    const flp = ctx.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 900; flp.Q.value = 0.3;
    foule.connect(flp); flp.connect(dry); flp.connect(wet);
    drift(foule.gain, 1.2, 2.4, 10, 25, 5);         // la salle se remplit et se vide doucement
    for (let v = 0; v < 6; v++) {
      const src = loop(white, R(0, 4));
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = R(350, 700); f1.Q.value = 3;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = R(1000, 1800); f2.Q.value = 4;
      const syl = ctx.createGain(); syl.gain.value = 0;
      const voix = ctx.createGain(); voix.gain.value = 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = R(-0.8, 0.8);
      src.connect(f1).connect(syl); src.connect(f2).connect(syl);
      syl.connect(voix).connect(pan).connect(foule);
      // syllabes : petites bouffées de 120–300 ms, par phrases, avec des silences
      const phrase = () => {
        if (!ctx) return;
        let t = ctx.currentTime + 0.05; const n = 3 + Math.floor(Math.random() * 10);
        for (let k = 0; k < n; k++) {
          const d = R(0.12, 0.3);
          syl.gain.setTargetAtTime(R(0.5, 1), t, d * 0.25);
          syl.gain.setTargetAtTime(0.05, t + d * 0.6, d * 0.25);
          f1.frequency.setTargetAtTime(R(350, 750), t, 0.05);
          t += d;
        }
        setTimeout(phrase, (t - ctx.currentTime + R(0.8, 6)) * 1000);
      };
      setTimeout(phrase, R(0, 4000));
      drift(voix.gain, 0.2, 1, 8, 30, 2);              // chaque voix va et vient (des gens passent)
      drift(pan.pan, -0.8, 0.8, 10, 25, 4);
    }

    }

    // présences des créatures
    // 3 voix seulement, données aux 3 créatures les plus proches (avant : une voix par espèce, ~50 en permanence,
    // le moteur audio saturait et faisait craquer TOUT le son de l'ordinateur)
    for (let i = 0; i < (AMBIANCE ? Math.min(3, creatureCount) : 0); i++) {   // coupées : seule la musique reste (?ambiance=1 pour les remettre)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 160 + 40 * (i % 8); bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0; const p = panner(0, 3, -12);
      loop(brown, R(0, 7)).connect(bp).connect(g).connect(p); p.connect(dry); p.connect(wet);
      sources.push({ g, p });
    }

    // pas feutrés d'un visiteur qui traverse (sol dur, loin)
    if (FOULE) every(9, 26, () => {
      const p = panner(R(-6, 6), 0, R(-10, 10)), t0 = ctx.currentTime;
      const n = 4 + Math.floor(Math.random() * 8), pas = R(0.5, 0.65), amp = R(0.8, 1.4);
      for (let k = 0; k < n; k++) {
        const s = ctx.createBufferSource(); s.buffer = brown;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(140, 260); f.Q.value = 1.2;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(f).connect(g).connect(p);
        const t = t0 + 0.05 + k * pas * R(0.95, 1.05);
        const fin = env(g, t, amp * Math.sin(Math.PI * (k + 0.5) / n), 0.012, 0.12);
        s.start(t, R(0, 7), fin - t + 0.05);
      }
      p.connect(dry); p.connect(wet);
      setTimeout(() => p.disconnect(), (n * pas + 2) * 1000);
    });

    // grincement de la coque (rare, grave, dans la réverbération)
    if (AMBIANCE) every(25, 60, () => {
      const t = ctx.currentTime + 0.05, d = R(1.2, 3);
      const s = ctx.createBufferSource(); s.buffer = white;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 18;
      f.frequency.setValueAtTime(R(160, 260), t); f.frequency.linearRampToValueAtTime(R(90, 140), t + d);
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = R(-0.9, 0.9);
      s.connect(f).connect(g).connect(pan); pan.connect(wet); pan.connect(dry);
      env(g, t, R(2.5, 4), d * 0.4, d);
      s.start(t, R(0, 3), d * 2.2);
      s.onended = () => pan.disconnect();
    });

    // chapelets de bulles
    if (AMBIANCE) every(14, 40, () => {
      const pan = ctx.createStereoPanner(); pan.pan.value = R(-0.9, 0.9);
      pan.connect(dry); pan.connect(wet);
      const t0 = ctx.currentTime + 0.05, n = 4 + Math.floor(Math.random() * 12);
      let t = t0;
      for (let k = 0; k < n; k++) {
        const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
        const f0 = R(250, 700);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * R(1.6, 2.4), t + 0.05);
        o.connect(g).connect(pan);
        const fin = env(g, t, R(0.06, 0.12), 0.006, 0.06);
        o.start(t); o.stop(fin);
        t += R(0.04, 0.22);
      }
      setTimeout(() => pan.disconnect(), (t - t0 + 1) * 1000);
    });

    // cliquetis lointains (rares, adoucis)
    if (AMBIANCE) every(12, 30, () => {
      const p = panner(R(-1, 1) * 18, R(-1, 5), R(-1, 1) * 18);
      p.connect(wet); p.connect(dry);
      let t = ctx.currentTime + 0.05; const n = 2 + Math.floor(Math.random() * 5), freq = R(900, 2500);
      for (let k = 0; k < n; k++) {
        const s = ctx.createBufferSource(); s.buffer = white;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * R(0.9, 1.1); bp.Q.value = 6;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(bp).connect(g).connect(p);
        const fin = env(g, t, 0.35, 0.005, 0.07);
        s.start(t, R(0, 3), fin - t + 0.05);
        t += R(0.08, 0.3);
      }
      setTimeout(() => p.disconnect(), 3000);
    });

    if (new URLSearchParams(location.search).get('pas') === '1') pasBuf = brown;   // mes pas : coupés (pas assez beaux) ; ?pas=1 pour les remettre
    master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime + 0.3, 1.6);   // entrée en fondu
  }

  const fwd = { x: 0, y: 0, z: -1 };
  function update(camera, positions = []) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastUpd < 0.1) return;                 // 10 mises à jour/s suffisent (moins de travail, pas de clics)
    lastUpd = now;
    const L = ctx.listener, e = camera.matrixWorld.elements;
    const px = camera.position.x, py = camera.position.y || listenerHeight, pz = camera.position.z;
    // mes pas : un pas tous les ~0,75 m parcourus (sol dur, un peu de réverbération), gauche/droite alternés
    if (px0 !== null && pasBuf) {
      const dd = Math.hypot(px - px0, pz - pz0);
      if (dd < 2) marche += dd;
      if (marche > 0.75) {
        marche = 0; pied = 1 - pied;
        const s = ctx.createBufferSource(); s.buffer = pasBuf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(150, 230); f.Q.value = 1.1;
        const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 60;
        const g = ctx.createGain(); g.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = pied ? 0.12 : -0.12;
        s.connect(f).connect(h).connect(g).connect(pan); pan.connect(dry); pan.connect(wet);
        const t = now + 0.01, fin = env(g, t, R(1.6, 2.2), 0.01, 0.14);
        s.start(t, R(0, 7), fin - t + 0.05); s.onended = () => pan.disconnect();
      }
    }
    px0 = px; pz0 = pz;
    fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10];
    if (L.positionX) {
      L.positionX.setTargetAtTime(px, now, 0.05); L.positionY.setTargetAtTime(py, now, 0.05); L.positionZ.setTargetAtTime(pz, now, 0.05);
      L.forwardX.setTargetAtTime(fwd.x, now, 0.05); L.forwardY.setTargetAtTime(fwd.y, now, 0.05); L.forwardZ.setTargetAtTime(fwd.z, now, 0.05);
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
    } else { L.setPosition(px, py, pz); L.setOrientation(fwd.x, fwd.y, fwd.z, e[4], e[5], e[6]); }
    const proches = positions.filter((q) => (q.dist ?? 3) < 3).sort((a, b) => a.dist - b.dist);
    sources.forEach((s, i) => {
      const q = proches[i];
      if (!q) { if (s.on) { s.g.gain.setTargetAtTime(0, now, 0.8); s.on = false; } return; }
      if (s.q !== q) { s.q = q; }
      setPos(s.p, q.x, q.y, q.z);
      const near = Math.max(0, 1 - q.dist / 3);
      s.g.gain.setTargetAtTime(0.5 * near * near, now, 0.8); s.on = true;
    });
  }

  function setMuted(m) {
    muted = m;
    if (ctx) { if (!m) { ctx.resume(); el?.play().catch(() => {}); } master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.4); }
  }
  // filet de sécurité : au moindre clic ou touche, un son « endormi » par le navigateur repart
  const reveil = () => {
    if (!ctx || document.hidden) return;
    if (ctx.state !== 'running') ctx.resume();
    if (el?.paused && !muted) el.play().catch(() => {});      // musique bloquée par le navigateur : relancée au clic suivant
  };
  addEventListener('pointerdown', reveil); addEventListener('keydown', reveil);
  let dodo = 0;
  function pause(p) {                                // fondu avant de suspendre : pas de coupure sèche
    if (!ctx) return;
    clearTimeout(dodo);                              // retour rapide sur l'onglet : la mise en veille prévue est annulée
    if (p) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); el?.pause(); dodo = setTimeout(() => ctx.suspend(), 300); }
    else { ctx.resume(); el?.play().catch(() => {}); master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime + 0.05, 0.6); }
  }

  return { start, update, setMuted, pause, get muted() { return muted; } };
}
