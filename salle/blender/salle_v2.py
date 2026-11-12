"""Salle IMMERSION, reconstruite de zéro d'après la vidéo 4K (marche continue, caméra grand-angle).

Usage :
  blender -b -P salle_v2.py -- render <sortie.png> x,y,z,lacet,tangage   (comparaison avec une image réelle)
  blender -b -P salle_v2.py -- bake <dossier> [taille] [samples]          (lumière calculée + export pour la page)

Repère « page » (three.js) : x latéral, y vers le haut, z vers l'entrée ; mur du fond à z = -L/2,
ouverture sur le hall historique à z = +L/2. Blender : (x, -z, y). lacet 0 = regard vers le fond.
Caméra de comparaison = objectif de la vidéo redressé par COLMAP (PINHOLE f = 220,6 px pour 1920 × 725).
"""
import bpy, bmesh, sys, os, json, math, random
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['render', '/tmp/salle.png', '0,1.5,6,0,0']
MODE = argv[0]

# ---------- Relevé (mètres) ----------
L, W, H = 23.0, 8.0, 8.5          # nef : fond presque carré (vidéo), 650 m² de projection annoncés
BAYS = 4                           # travées par mur long
POST_W, POST_D = 0.30, 0.15        # joints noirs RENFONCÉS entre les écrans (fentes derrière le plan des écrans)
ROCK_W, ROCK_D, ROCK_H = 0.65, 0.45, 1.35   # socles en roche au pied des montants
BACK_H = H                         # écran du fond : toute la hauteur (pas de caisson : c'était le jour du hall vu au-dessus)
BARS = 5                           # barres porte-projecteurs sous le plafond
HALL_W, HALL_H = 13.0, 9.0         # salle d'accueil + volume qui contient la nef ; plafond GÉNÉRAL blanc à moulures, plus bas
HALL_Z0, HALL_Z1 = -L / 2 - 1.0, L / 2 + 11.0
ZE = L / 2 + 4.0                   # mur-écran bleu de l'accueil (centre ; config.js ecranZ), centré en x, proche de la salle d'expo

random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def P(x, y, z): return (x, -z, y)
R90 = math.pi / 2

def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

def stone(name, base, rough, tiles=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.6
    nz.inputs['Detail'].default_value = 8; nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*[c * 0.75 for c in base], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, c * 1.2) for c in base], 1); nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    col = ramp.outputs['Color']
    if tiles:   # dalles : joints sombres
        br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 0.6; br.inputs['Mortar Size'].default_value = 0.004
        br.inputs['Mortar'].default_value = (*[c * 0.4 for c in base], 1); nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        nt.links.new(ramp.outputs['Color'], br.inputs['Color1']); nt.links.new(ramp.outputs['Color'], br.inputs['Color2']); col = br.outputs['Color']
    nt.links.new(col, b.inputs['Base Color']); b.inputs['Roughness'].default_value = rough
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

M = {
    'post': material('post', (0.012, 0.012, 0.014), 0.55),
    'rock': material('rock', (0.035, 0.038, 0.045), 0.9),
    'ceiling': material('ceiling', (0.10, 0.10, 0.11), 0.85),
    'rig': material('rig', (0.08, 0.08, 0.09), 0.5, 0.6),
    'projector': material('projector', (0.03, 0.03, 0.035), 0.55),
    'frame': material('frame', (0.55, 0.56, 0.58), 0.35, 0.9),
    'hall': material('hall', (0.012, 0.012, 0.013), 0.85),            # murs de l'accueil : noirs, lisses
    'hallfloor': material('hallfloor', (0.014, 0.014, 0.015), 0.35),  # sol de l'accueil : noir
    'annex': material('annex', (0.02, 0.04, 0.12), 0.8),
    'hallporte': material('hallporte', (0.01, 0.01, 0.012), 0.9),   # ouvertures des portes du fond (noir profond)
    'bone': material('bone', (0.55, 0.50, 0.42), 0.7),
    'plafond': material('plafond', (0.80, 0.78, 0.74), 0.7),           # plafond général blanc, caissons à moulures
}
structure = []

def add(o, m, store=True):
    o.data.materials.append(M[m] if isinstance(m, str) else m)
    if store: structure.append(o)
    return o

def box(w, h, d, m, x, y, z, store=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(x, y, z))
    o = bpy.context.object; o.scale = (w, d, h); bpy.ops.object.transform_apply(scale=True)
    return add(o, m, store)

def plane(sx, sy, m, loc, rot, store=True):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = (sx, sy, 1); bpy.ops.object.transform_apply(scale=True, rotation=True)
    return add(o, m, store)

def rock(w, h, d, x, y, z, seed):
    """Bloc de roche sculptée : cube subdivisé, déformé par un bruit, sommets réels (exportables)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(x, y, z))
    o = bpy.context.object; o.scale = (w, d, h); bpy.ops.object.transform_apply(scale=True)
    sub = o.modifiers.new('s', 'SUBSURF'); sub.levels = 3
    tex = bpy.data.textures.new(f'r{seed}', 'VORONOI'); tex.noise_scale = 0.18
    dis = o.modifiers.new('d', 'DISPLACE'); dis.texture = tex; dis.strength = 0.12; dis.mid_level = 0.6
    tex2 = bpy.data.textures.new(f'c{seed}', 'CLOUDS'); tex2.noise_scale = 0.35
    dis2 = o.modifiers.new('d2', 'DISPLACE'); dis2.texture = tex2; dis2.strength = 0.08
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return add(o, 'rock')

# ---------- Montants et socles en roche ----------
for k in range(BAYS + 1):
    z = min(max(L / 2 - k * (L / BAYS), -L / 2 + POST_W / 2), L / 2 - POST_W / 2)
    for s in (-1, 1):
        x = s * (W / 2 + POST_D / 2)   # derrière le plan des écrans
        pass   # fentes noires entre les écrans retirées (murs d'images continus)
        if False:  # socles rocheux retirés (demande) — vidéo : seulement vers le fond
            rock(ROCK_D * 2, ROCK_H, ROCK_W, s * W / 2, ROCK_H / 2 - 0.05, z, k * 2 + (s > 0))
for s in (-1, 1):  # angles du fond
    pass
    pass  # socle rocheux d'angle retiré (demande)
# grande colonne rocheuse à l'angle gauche de l'entrée
pass  # colonne rocheuse de l'entrée retirée (masse sombre gênante)
# rock(1.0, 4.2, 1.0, W / 2 - 0.2, 2.05, L / 2 - 0.3, 99)   # à droite quand on regarde le hall (vidéo)

# ---------- Au-dessus de la nef : ouvert. Seulement la technique (barres, projecteurs, suspentes) ----------
for s_ in (-1, 1):   # dos des murs d'écrans, vus depuis la grande salle
    box(0.3, H, L + 0.6, 'hall', s_ * (W / 2 + 0.3), H / 2, 0)
box(W + 0.9, H, 0.3, 'hall', 0, H / 2, -L / 2 - 0.3)
for i in range(0):   # barres, projecteurs, suspentes retirés (plafond blanc à moulures, sans spots)
    z = L / 2 - (i + 0.5) * L / BARS
    for x in (-W / 2 + 0.6, W / 2 - 0.6):
        box(0.03, HALL_H - H - 0.4, 0.03, 'rig', x, (H + 0.4 + HALL_H) / 2, z)   # suspentes jusqu'au plafond du hall
    box(W - 0.6, 0.06, 0.06, 'rig', 0, H - 0.45, z)
    for x in (-W / 4, 0, W / 4):
        box(0.4, 0.2, 0.45, 'projector', x, H - 0.6, z)

# ---------- Hall historique (devant l'entrée ouverte) ----------
hz0 = L / 2; HD = HALL_Z1 - HALL_Z0; hzc = (HALL_Z0 + HALL_Z1) / 2
plane(HALL_W, HD, 'hallfloor', P(0, -0.002, hzc), (0, 0, 0))
plane(HALL_W, HD, 'plafond', P(0, HALL_H, hzc), (math.pi, 0, 0))   # plafond général blanc
plane(HALL_W, HALL_H, 'hall', P(0, HALL_H / 2, HALL_Z1), (R90, 0, 0))
plane(HALL_W, HALL_H, 'hall', P(0, HALL_H / 2, HALL_Z0), (-R90, 0, 0))
for s in (-1, 1):
    plane(HALL_H, HD, 'hall', P(s * HALL_W / 2, HALL_H / 2, hzc), (0, -s * R90, 0))
# ----- Salle d'accueil, minimaliste (on ne fait que la voir : la caméra s'arrête devant le mur-écran) -----
# Murs lisses en pierre claire, plinthe ; plafond GÉNÉRAL (accueil + salle d'expo) blanc à caissons et moulures, sans spots.
win = material('e_window', (0, 0, 0), emit=(1.0, 0.96, 0.88), strength=0.0)   # (inutilisé : plus de fenêtres)
XE = 0.0
for s_ in (-1, 1):
    box(0.12, 0.3, HALL_Z1 - L / 2, 'hall', s_ * (HALL_W / 2 - 0.06), 0.15, (L / 2 + HALL_Z1) / 2)
box(HALL_W, 0.3, 0.12, 'hall', 0, 0.15, HALL_Z1 - 0.06)
# plafond à caissons : poutres croisées à ressauts (moulures), corniche tout autour
PAS = 2.5
def poutre(long_, axe, pos):
    for (w, h, dy) in ((0.62, 0.07, 0.035), (0.44, 0.16, 0.15), (0.30, 0.34, 0.17), (0.40, 0.05, 0.36)):
        if axe == 'x': box(w, h, long_, 'plafond', pos, HALL_H - dy, (HALL_Z0 + HALL_Z1) / 2)
        else: box(long_, h, w, 'plafond', 0, HALL_H - dy, pos)
KX = int((HALL_W / 2 - 1.2) // PAS)
XS = [PAS * k for k in range(-KX, KX + 1)]          # poutres en long symétriques autour de l'axe de la nef
for xx in XS:
    poutre(HALL_Z1 - HALL_Z0, 'x', xx)
# poutres en travers : coupées en tronçons ENTRE les poutres en long (pas de volumes qui se chevauchent :
# leurs faces confondues aux croisements faisaient des taches sombres dans le bake)
for zz in np.arange(HALL_Z0 + PAS, HALL_Z1 - 0.5, PAS):
    for (w, h, dy) in ((0.62, 0.07, 0.035), (0.44, 0.16, 0.15), (0.30, 0.34, 0.17), (0.40, 0.05, 0.36)):
        bornes = [-HALL_W / 2] + [v for x in XS for v in (x - w / 2, x + w / 2)] + [HALL_W / 2]
        for x0, x1 in zip(bornes[::2], bornes[1::2]):
            box(x1 - x0, h, w, 'plafond', (x0 + x1) / 2, HALL_H - dy, zz)
for (w, h, dy) in ((0.7, 0.12, 0.06), (0.5, 0.22, 0.23), (0.3, 0.12, 0.40)):   # corniche à ressauts
    for s_ in (-1, 1):
        box(w, h, HALL_Z1 - HALL_Z0, 'plafond', s_ * (HALL_W / 2 - w / 2), HALL_H - dy, (HALL_Z0 + HALL_Z1) / 2)
    for zz in (HALL_Z0 + w / 2, HALL_Z1 - w / 2):
        box(HALL_W, h, w, 'plafond', 0, HALL_H - dy, zz)
# mur-écran bleu de l'accueil, centré, proche de l'entrée de la salle d'expo (l'image et son cadre noir y sont incrustés)
box(8.9, 3.8, 0.5, 'annex', XE, 1.9, ZE)
door = material('e_door', (0, 0, 0), emit=(1.0, 0.78, 0.5), strength=0.0)
# face du sas d'introduction éclairée en bleu (textes rétroéclairés)
annexlit = material('e_annex', (0, 0, 0), emit=(0.15, 0.3, 1.0), strength=0.0)
plane(8.9, 3.8, annexlit, P(XE, 1.9, ZE - 0.26), (-R90, 0, 0), store=False)   # sa face éclairée (bleu)
# squelette de baleine suspendu au-dessus de l'entrée (simplifié : colonne + côtes + crâne)
for i in range(0):   # squelette retiré (rendu en blocs jugé laid)
    t = i / 39; x = -7 + 14 * t; y = 8.6 - 0.6 * math.sin(math.pi * t)
    box(0.22, 0.22 * (1.2 - 0.6 * abs(t - 0.4)), 0.22, 'bone', x, y, hz0 + 3.0)
    if 0.15 < t < 0.65 and i % 2 == 0:
        r = 1.3 * math.sin(math.pi * (t - 0.15) / 0.5)
        for s in (-1, 1):
            box(0.06, r, 0.06, 'bone', x, y - r / 2, hz0 + 3.0 + s * 0.25)
pass  # crâne du squelette retiré

# ---------- Écrans (émetteurs : lumière des vidéos, pas exportés) ----------
def emitter(name, color=(1, 1, 1)):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0]); em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = 0.0
    return m, em
EMIT = {g: emitter('e_' + g) for g in ('left', 'back', 'right', 'floor')}
lbm, lbe = emitter('e_lightbox', (1.0, 0.9, 0.72))    # lumière blanche un peu jaune, cachée derrière le mur-écran
plane(W, L, EMIT['floor'][0], P(0, 0, 0), (0, 0, 0), store=False)
# écrans découpés par travée : les fentes des joints restent ouvertes sur le noir renfoncé
bay = L / BAYS
for k in range(BAYS):
    z0, z1 = L / 2 - k * bay - POST_W / 2, L / 2 - (k + 1) * bay + POST_W / 2
    for s, g, r in ((-1, 'left', R90), (1, 'right', -R90)):
        plane(H, z0 - z1, EMIT[g][0], P(s * W / 2, H / 2, (z0 + z1) / 2), (0, r, 0), store=False)
plane(W - POST_W, BACK_H, EMIT['back'][0], P(0, BACK_H / 2, -L / 2), (R90, 0, 0), store=False)
plane(8.4, 0.8, lbm, P(XE, 0.03, ZE + 0.75), (0, 0, 0), store=False)          # au sol, juste derrière le mur-écran, tournée vers le haut

# ---------- Cycles ----------
scene.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d in pr.devices: d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('CPU :', e)
scene.world = bpy.data.worlds.new('noir'); scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0

if MODE == 'render':
    out, cam = argv[1], [float(v) for v in argv[2].split(',')]
    # écrans en bleu moyen (comme dans la vidéo) pour juger la géométrie et la lumière
    tint = {'left': (0.06, 0.22, 0.85), 'right': (0.06, 0.22, 0.85), 'back': (0.02, 0.05, 0.16), 'floor': (0.03, 0.14, 0.32)}
    for g, (m, em) in EMIT.items():
        em.inputs['Color'].default_value = (*tint[g], 1); em.inputs['Strength'].default_value = 1.0
    lbe.inputs['Strength'].default_value = 1.6
    door.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.0
    annexlit.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.6
    win.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.2
    annexlit.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.6
    bpy.ops.object.camera_add(location=P(cam[0], cam[1], cam[2]),
                              rotation=(R90 + math.radians(cam[4]), 0, math.radians(cam[3])))
    c = bpy.context.object; scene.camera = c
    c.data.sensor_fit = 'HORIZONTAL'; c.data.sensor_width = 36; c.data.lens = 220.6 / 1920 * 36
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1920, 725, 50
    scene.cycles.samples = 48; scene.cycles.use_denoising = True
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('OK rendu', out, flush=True)
    sys.exit(0)

# ---------- Mode « views » : photos de cinéma pour les gaussiennes (option 3), en DEUX passes ----------
# Passe « salle » : la salle seule, propre (JPEG). Passe « visiteurs » : les visiteurs seuls sur fond
# transparent (PNG), éclairés par la salle et cachés derrière elle (salle en « holdout »).
# On entraîne deux nuages de gaussiennes : la page règle l'intensité des visiteurs en direct.
# Les écrans éclairent la salle mais apparaissent NOIRS à la caméra (vidéos posées par-dessus sur la page).
if MODE in ('views', 'visslices'):
    OUT = os.path.abspath(argv[1]); N = int(argv[2]) if len(argv) > 2 else 500; SPP = int(argv[3]) if len(argv) > 3 else 128
    ROOM_ONLY = len(argv) > 4 and argv[4] == 'room'   # « room » : passe salle seulement (visiteurs inchangés)
    for d in ('room', 'vis'):
        os.makedirs(f'{OUT}/{d}/images', exist_ok=True); os.makedirs(f'{OUT}/{d}/sparse/0', exist_ok=True)
    light = {'left': (0.02, 0.05, 0.14), 'right': (0.02, 0.05, 0.14), 'back': (0.02, 0.05, 0.14), 'floor': (0.30, 0.24, 0.62)}
    for g, (m, em) in EMIT.items():
        em.inputs['Color'].default_value = (*light[g], 1); em.inputs['Strength'].default_value = 1.0
        nt = m.node_tree; out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        lp = nt.nodes.new('ShaderNodeLightPath'); mix = nt.nodes.new('ShaderNodeMixShader'); blk = nt.nodes.new('ShaderNodeEmission')
        blk.inputs['Strength'].default_value = 0.0
        nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0]); nt.links.new(em.outputs[0], mix.inputs[1])
        nt.links.new(blk.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
    lbe.inputs['Strength'].default_value = 1.6
    win.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.2
    annexlit.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.6
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 900, 100
    scene.cycles.use_denoising = True; scene.cycles.max_bounces = 6
    bpy.ops.object.camera_add(); cam = bpy.context.object; scene.camera = cam
    cam.data.sensor_fit = 'HORIZONTAL'; cam.data.sensor_width = 36; cam.data.lens = 18   # 90° horizontal
    fx = 1600 / 2 / math.tan(math.radians(45))
    rnd = random.Random(7); lines = []
    from mathutils import Matrix
    room_objs = [o for o in scene.objects if o.type == 'MESH']
    # Visiteurs : poses successives de vraies personnes suivies dans la vidéo (assets/ghosts/tracks)
    TR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'ghosts', 'tracks')
    counts = json.load(open(f'{TR}/tracks.json'))
    paths = [((-2.5, 9.0), (-1.5, -8.0)), ((2.5, -9.0), (1.0, 8.0)), ((-1.0, 10.5), (2.5, -2.0)), ((3.0, 2.0), (-3.0, 6.0)),
             ((0.0, -6.0), (-2.8, -10.0)), ((-5.0, 14.0), (4.0, 12.5)), ((2.0, 15.0), (-2.0, 12.0)), ((0.5, 6.0), (0.5, -4.0))]
    visitors = []; FONDU = {}
    for k, (a, b) in enumerate(paths):
        t = k % len(counts); imgs = [bpy.data.images.load(f'{TR}/t{t}_{j:02d}.png') for j in range(counts[t])]
        vm = bpy.data.materials.new(f'visitor{k}'); vm.use_nodes = True; nt = vm.node_tree; bs = nt.nodes['Principled BSDF']
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = imgs[0]
        # fondu entre deux images de la marche (poses intermédiaires fluides) : tx -> tx2 selon Fac
        tx2 = nt.nodes.new('ShaderNodeTexImage'); tx2.image = imgs[0]
        mc = nt.nodes.new('ShaderNodeMixRGB'); mc.inputs['Fac'].default_value = 0.0
        ma = nt.nodes.new('ShaderNodeMixRGB'); ma.inputs['Fac'].default_value = 0.0
        nt.links.new(tx.outputs['Color'], mc.inputs['Color1']); nt.links.new(tx2.outputs['Color'], mc.inputs['Color2'])
        nt.links.new(tx.outputs['Alpha'], ma.inputs['Color1']); nt.links.new(tx2.outputs['Alpha'], ma.inputs['Color2'])
        nt.links.new(mc.outputs['Color'], bs.inputs['Base Color']); nt.links.new(ma.outputs['Color'], bs.inputs['Alpha'])
        nt.links.new(mc.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 0.35
        FONDU[f'visitor{k}'] = (tx2, mc, ma)
        bpy.ops.mesh.primitive_plane_add(size=1); o = bpy.context.object; o.name = f'visitor{k}'
        o.data.materials.append(vm); visitors.append((o, tx, imgs, a, b, rnd.random()))
    if MODE == 'visslices':   # 20 moments figés, ~40 vues chacun : chaque moment devient un petit nuage
        T, NV = (int(argv[4]) if len(argv) > 4 else 20), N   # nombre de moments (80 = traînée continue)
        for o in room_objs: o.is_holdout = True
        scene.render.film_transparent = True; scene.cycles.samples = 32
        scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
        for t in range(T):
            d = f'{OUT}/s{t:02d}'; os.makedirs(d + '/images', exist_ok=True); os.makedirs(d + '/sparse/0', exist_ok=True)
            for o, tx, imgs, a, b, ph in visitors:
                f = (ph + t / T) % 1.0
                fi = f * len(imgs); i0 = min(int(fi), len(imgs) - 1); i1 = min(i0 + 1, len(imgs) - 1)
                tx.image = imgs[i0]
                tx2_, mc_, ma_ = FONDU[o.name]; tx2_.image = imgs[i1]
                mc_.inputs['Fac'].default_value = ma_.inputs['Fac'].default_value = (fi - int(fi)) if i1 != i0 else 0.0
                o.scale = (1.72 * tx.image.size[0] / tx.image.size[1], 1.72, 1)
                o.location = P(a[0] + (b[0] - a[0]) * f, 0.86, a[1] + (b[1] - a[1]) * f)
            ls = []; pts = []
            for i in range(NV):
                # caméras autour des visiteurs, à hauteur d'yeux, regard vers l'un d'eux
                o = visitors[i % len(visitors)][0]; ang = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(2.0, 6.0)
                cam.location = (o.location.x + r * math.cos(ang), o.location.y + r * math.sin(ang), rnd.uniform(1.4, 1.9))
                dx, dy = o.location.x - cam.location.x, o.location.y - cam.location.y
                cam.rotation_euler = (R90 + math.atan2(0.9 - cam.location.z, math.hypot(dx, dy)), 0, math.atan2(dy, dx) - R90)
                for v_, *_ in visitors: v_.rotation_euler = (R90, 0, math.atan2(cam.location.x - v_.location.x, -(cam.location.y - v_.location.y)))
                bpy.context.view_layer.update()
                scene.render.filepath = f'{d}/images/v_{i:03d}.png'
                if not os.path.exists(scene.render.filepath): bpy.ops.render.render(write_still=True)
                Rcw = cam.matrix_world.to_3x3() @ Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))
                Rwc = Rcw.transposed(); tt = -(Rwc @ cam.matrix_world.translation); q = Rwc.to_quaternion()
                ls.append(f'{i + 1} {q.w} {q.x} {q.y} {q.z} {tt.x} {tt.y} {tt.z} 1 v_{i:03d}.png\n\n')
            open(d + '/sparse/0/cameras.txt', 'w').write(f'1 PINHOLE 1600 900 {fx} {fx} 800 450\n')
            open(d + '/sparse/0/images.txt', 'w').write(''.join(ls))
            with open(d + '/sparse/0/points3D.txt', 'w') as fp:
                j = 0
                for o, *_ in visitors:
                    for _ in range(1500):
                        j += 1; fp.write(f'{j} {o.location.x + rnd.uniform(-0.4, 0.4)} {o.location.y + rnd.uniform(-0.4, 0.4)} {rnd.uniform(0.0, 1.8)} 60 80 160 0\n')
            print(f'moment {t + 1}/{T}', flush=True)
        print('OK moments', flush=True); sys.exit(0)
    for i in range(N):
        if rnd.random() < 0.7:   # hauteur des yeux : là où l'on marche (moins d'artefacts dans la page)
            y, pitch = rnd.uniform(1.5, 1.8), rnd.uniform(-20, 20)
        else:
            y, pitch = rnd.uniform(1.1, 2.4), rnd.uniform(-35, 40)
        if rnd.random() < 0.65:
            x, z = rnd.uniform(-W / 2 + 0.8, W / 2 - 0.8), rnd.uniform(-L / 2 + 1.0, L / 2)
        else:
            x, z = rnd.uniform(-7, 7), rnd.uniform(L / 2, L / 2 + 6)
        cam.location = P(x, y, z); cam.rotation_euler = (R90 + math.radians(pitch), 0, math.radians(rnd.uniform(0, 360)))
        for o, tx, imgs, a, b, ph in visitors:   # chaque visiteur : position ET pose qui avancent ensemble
            f = (ph + i * 0.173) % 1.0
            tx.image = imgs[min(int(f * len(imgs)), len(imgs) - 1)]
            o.scale = (1.72 * tx.image.size[0] / tx.image.size[1], 1.72, 1)
            o.location = P(a[0] + (b[0] - a[0]) * f, 0.86, a[1] + (b[1] - a[1]) * f)
            o.rotation_euler = (R90, 0, math.atan2(cam.location.x - o.location.x, -(cam.location.y - o.location.y)))
        bpy.context.view_layer.update()
        name = f'v_{i:04d}'
        # passe salle
        for o, *_ in visitors: o.hide_render = True
        scene.render.film_transparent = False; scene.cycles.samples = SPP
        scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 95
        scene.render.filepath = f'{OUT}/room/images/{name}.jpg'
        if not os.path.exists(scene.render.filepath): bpy.ops.render.render(write_still=True)
        # passe visiteurs
        for o, *_ in visitors: o.hide_render = False
        for o in room_objs: o.is_holdout = True
        scene.render.film_transparent = True; scene.cycles.samples = 32
        scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
        scene.render.filepath = f'{OUT}/vis/images/{name}.png'
        if not ROOM_ONLY and not os.path.exists(scene.render.filepath): bpy.ops.render.render(write_still=True)
        for o in room_objs: o.is_holdout = False
        scene.render.image_settings.color_mode = 'RGB'
        Rcw = cam.matrix_world.to_3x3() @ Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))   # Blender -> OpenCV
        Rwc = Rcw.transposed(); t = -(Rwc @ cam.matrix_world.translation); q = Rwc.to_quaternion()
        lines.append((i + 1, q, t, name)); print(f'vue {i + 1}/{N}', flush=True)
    for d, ext in (('room', 'jpg'), ('vis', 'png')):
        open(f'{OUT}/{d}/sparse/0/cameras.txt', 'w').write(f'1 PINHOLE 1600 900 {fx} {fx} 800 450\n')
        open(f'{OUT}/{d}/sparse/0/images.txt', 'w').write(''.join(
            f'{j} {q.w} {q.x} {q.y} {q.z} {t.x} {t.y} {t.z} 1 {n}.{ext}\n\n' for j, q, t, n in lines))
    pts = []   # salle : surfaces échantillonnées
    for o in room_objs:
        mw = o.matrix_world
        for poly in o.data.polygons:
            v = [mw @ o.data.vertices[j].co for j in poly.vertices]
            for _ in range(min(max(1, int(poly.area * 6)), 400)):
                a, b = rnd.random(), rnd.random()
                if a + b > 1: a, b = 1 - a, 1 - b
                pts.append(v[0] + (v[1] - v[0]) * a + (v[-1] - v[0]) * b)
    with open(f'{OUT}/room/sparse/0/points3D.txt', 'w') as f:
        for j, p in enumerate(pts[:200000]): f.write(f'{j + 1} {p.x} {p.y} {p.z} 90 90 100 0\n')
    with open(f'{OUT}/vis/sparse/0/points3D.txt', 'w') as f:   # visiteurs : volumes le long des trajets
        j = 0
        for a, b in paths:
            for _ in range(4000):
                u = rnd.random(); pp = P(a[0] + (b[0] - a[0]) * u + rnd.uniform(-0.3, 0.3), rnd.uniform(0.05, 1.8),
                                         a[1] + (b[1] - a[1]) * u + rnd.uniform(-0.3, 0.3))
                j += 1; f.write(f'{j} {pp[0]} {pp[1]} {pp[2]} 60 80 160 0\n')
    print('OK vues', N, flush=True)
    sys.exit(0)

# ---------- Mode « bake » : lumière par groupe d'écrans + sources fixes ----------
OUT = os.path.abspath(argv[1]); RES = int(argv[2]) if len(argv) > 2 else 1024; SAMPLES = int(argv[3]) if len(argv) > 3 else 128
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for o in structure: o.select_set(True)
bpy.context.view_layer.objects.active = structure[0]
bpy.ops.object.join(); room = bpy.context.object; room.name = 'room'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
scene.cycles.samples = SAMPLES; scene.cycles.max_bounces = 6; scene.render.bake.margin = 8
img = bpy.data.images.new('bake', RES, RES, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
for m in M.values():
    n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n
bpy.ops.object.select_all(action='DESELECT'); room.select_set(True); bpy.context.view_layer.objects.active = room

def set_only(g):
    for k, (_, em) in EMIT.items(): em.inputs['Strength'].default_value = 1.0 if k == g else 0.0
    lbe.inputs['Strength'].default_value = 9.0 if g == 'lightbox' else 0.0
    door.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.0 if g == 'door' else 0.0
    annexlit.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.6 if g == 'door' else 0.0

maps = {}
for g in ('left', 'back', 'right', 'floor', 'lightbox', 'door'):
    set_only(g); print('Lumière :', g, flush=True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True)
    maps[g] = np.array(img.pixels[:], np.float32).reshape(RES, RES, 4)[..., 0].copy()
def lisse(a, sig=1.6):   # flou gaussien séparable : enlève le grain du calcul (les îlots ont 8 px de marge)
    k = np.exp(-0.5 * (np.arange(-4, 5) / sig) ** 2); k /= k.sum()
    for ax in (0, 1):
        p = np.pad(a, [(4, 4) if i == ax else (0, 0) for i in range(2)], mode='edge')
        a = sum(k[i] * np.take(p, range(i, i + a.shape[ax]), axis=ax) for i in range(9))
    return a
maps = {g: lisse(v) for g, v in maps.items()}
scale = float(max(v.max() for v in maps.values())) or 1.0
enc = {g: np.sqrt(np.clip(v / scale, 0, 1)) for g, v in maps.items()}
def save(name, r, g, b):
    im = bpy.data.images.new(name, RES, RES, alpha=False); im.colorspace_settings.name = 'Non-Color'
    im.pixels[:] = np.stack([r, g, b, np.ones_like(r)], -1).astype(np.float32).ravel()
    im.filepath_raw = os.path.join(OUT, name + '.png'); im.file_format = 'PNG'; im.save()
save('room_lm_a', enc['left'], enc['back'], enc['right'])
save('room_lm_b', enc['floor'], enc['lightbox'], enc['door'])
json.dump({'scale': scale, 'encoding': 'sqrt', 'res': RES, 'samples': SAMPLES,
           'room': {'length': L, 'width': W, 'height': H, 'backH': BACK_H, 'bays': BAYS}},
          open(os.path.join(OUT, 'room_lm.json'), 'w'))
for m in M.values():
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']: m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT'); room.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'room.glb'), use_selection=True, export_format='GLB',
                          export_yup=True, export_normals=True, export_texcoords=True, export_materials='EXPORT')
print('OK', OUT, 'scale', scale, flush=True)
