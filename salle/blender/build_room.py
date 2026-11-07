"""Construit la salle (relevé validé) dans Blender, calcule son éclairage avec Cycles et l'exporte.

Usage : blender -b -P salle/blender/build_room.py -- <dossier_sortie> [taille_lightmap] [samples]

Sorties :
  room.glb      structure hors écrans (joints, plafond, barres et projecteurs, retombée, entrée, couloir),
                une seule carte UV (celle de la lightmap), un matériau par type de surface
  room_lm_a.png lumière reçue des écrans : R = mur gauche, V = fond, B = mur droit
  room_lm_b.png lumière reçue du sol (canal R)
  room_lm.json  facteur d'échelle (encodage racine carrée : E = v² × scale)

La lumière est calculée pour des écrans blancs de luminance 1 : sur la page, chaque groupe est
multiplié par la couleur réelle de sa vidéo. Mêmes dimensions que salle/src/config.js.
Repère : three (x, y haut, z vers l'entrée) -> Blender (x, -z, y).
"""
import bpy, bmesh, sys, os, json, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else '.')
RES = int(argv[1]) if len(argv) > 1 else 2048
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
os.makedirs(OUT, exist_ok=True)

# --- Dimensions (identiques à config.js) ---
L, W, H, BAYS, POST = 21.0, 8.0, 9.0, 4, 0.28
BARS = 5
SOFFIT_H, SOFFIT_D = 1.6, 0.8
BACK_H = H - SOFFIT_H   # écran du fond, sous la retombée
CEIL = H
DOOR_W, DOOR_H, CORR = 2.0, 2.6, 4.0

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def P(x, y, z):  # three -> Blender
    return (x, -z, y)

def mat(name, color=(0.8, 0.8, 0.8)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    return m

MATS = {n: mat(n) for n in ('post', 'rig', 'projector', 'ceiling', 'seam', 'soffit', 'wall')}
structure = []

def box(w, h, d, m, x, y, z):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(x, y, z))
    o = bpy.context.object
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(MATS[m])
    structure.append(o)
    return o

def plane(sx, sy, m, loc, rot, store=True):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if m:
        o.data.materials.append(MATS[m] if isinstance(m, str) else m)
    if store:
        structure.append(o)
    return o

R90 = math.pi / 2

# Joints noirs à plat (1 cm) dans le plan des écrans
FL = 0.01
for k in range(BAYS + 1):
    z = min(max(L / 2 - k * (L / BAYS), -L / 2 + POST / 2), L / 2 - POST / 2)
    for s in (-1, 1):
        box(FL, H, POST, 'post', s * (W / 2 - FL / 2), H / 2, z)
for s in (-1, 1):
    box(POST, H, FL, 'post', s * (W / 2 - POST / 2), H / 2, -L / 2 + FL / 2)

# Plafond réel (photos) : plat, gris clair, sur toute la largeur au niveau du haut des écrans,
# joints de panneaux dans la longueur ; barres transversales fines portant les projecteurs ;
# deux rails fins le long des côtés ; retombée brun foncé au-dessus du mur du fond.
plane(W, L, 'ceiling', P(0, H, 0), (math.pi, 0, 0))
for i in range(1, 13):
    box(0.025, 0.012, L, 'seam', -W / 2 + i * W / 13, H - 0.006, 0)
for s_ in (-1, 1):
    box(0.06, 0.06, L - SOFFIT_D, 'rig', s_ * (W / 2 - 0.45), H - 0.35, SOFFIT_D / 2)
for i in range(BARS):
    z = L / 2 - (i + 0.5) * (L - SOFFIT_D) / BARS
    box(W - 0.6, 0.06, 0.06, 'rig', 0, H - 0.5, z)
    for s_ in (-1, 1):
        box(0.03, 0.5, 0.03, 'rig', s_ * (W / 2 - 1.2), H - 0.25, z)
    for x in (-W / 4, 0, W / 4):
        box(0.4, 0.2, 0.45, 'projector', x, H - 0.64, z)
box(W, SOFFIT_H, SOFFIT_D, 'soffit', 0, H - SOFFIT_H / 2, -L / 2 + SOFFIT_D / 2)

# Côté entrée : mur avec porte, couloir (faces vers l'intérieur, sans la face côté salle)
sw = (W - DOOR_W) / 2
plane(sw, CEIL, 'wall', P(-(DOOR_W / 2 + sw / 2), CEIL / 2, L / 2), (-R90, 0, 0))
plane(sw, CEIL, 'wall', P(DOOR_W / 2 + sw / 2, CEIL / 2, L / 2), (-R90, 0, 0))
plane(DOOR_W, CEIL - DOOR_H, 'wall', P(0, DOOR_H + (CEIL - DOOR_H) / 2, L / 2), (-R90, 0, 0))
cz = L / 2 + CORR / 2
plane(DOOR_W, CORR, 'wall', P(0, 0, cz), (0, 0, 0))                    # sol
plane(DOOR_W, CORR, 'wall', P(0, DOOR_H, cz), (math.pi, 0, 0))          # plafond
plane(DOOR_H, CORR, 'wall', P(-DOOR_W / 2, DOOR_H / 2, cz), (0, R90, 0))
plane(DOOR_H, CORR, 'wall', P(DOOR_W / 2, DOOR_H / 2, cz), (0, -R90, 0))
plane(DOOR_W, DOOR_H, 'wall', P(0, DOOR_H / 2, L / 2 + CORR), (R90, 0, 0))  # fond du couloir

# --- Écrans émetteurs (servent au calcul, pas exportés) ---
def emitter(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0])
    em.inputs['Strength'].default_value = 0.0
    return m, em

EMIT = {g: emitter('e_' + g) for g in ('left', 'back', 'right', 'floor')}
plane(H, L, EMIT['left'][0], P(-W / 2, H / 2, 0), (0, R90, 0), store=False)
plane(H, L, EMIT['right'][0], P(W / 2, H / 2, 0), (0, -R90, 0), store=False)
plane(W, BACK_H, EMIT['back'][0], P(0, BACK_H / 2, -L / 2), (R90, 0, 0), store=False)
plane(W, L, EMIT['floor'][0], P(0, 0, 0), (0, 0, 0), store=False)

# --- Fusion de la structure + UV de lightmap ---
bpy.ops.object.select_all(action='DESELECT')
for o in structure:
    o.select_set(True)
bpy.context.view_layer.objects.active = structure[0]
bpy.ops.object.join()
room = bpy.context.object
room.name = 'room'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False) if False else None
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=1.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')

# --- Cycles ---
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('GPU indisponible, calcul sur CPU :', e)
scene.cycles.samples = SAMPLES
scene.cycles.max_bounces = 6
scene.world = bpy.data.worlds.new('noir')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0

img = bpy.data.images.new('bake', RES, RES, float_buffer=True)
img.colorspace_settings.name = 'Non-Color'
for m in MATS.values():
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image = img
    m.node_tree.nodes.active = n

bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
bpy.context.view_layer.objects.active = room
scene.render.bake.margin = 8

maps = {}
for g in ('left', 'back', 'right', 'floor'):
    for k, (_, em) in EMIT.items():
        em.inputs['Strength'].default_value = 1.0 if k == g else 0.0
    print('Calcul de la lumière :', g, flush=True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    maps[g] = px[..., 0].copy()

scale = float(max(m.max() for m in maps.values())) or 1.0
enc = {g: np.sqrt(np.clip(v / scale, 0, 1)) for g, v in maps.items()}

def save(name, r, g, b):
    im = bpy.data.images.new(name, RES, RES, alpha=False)
    im.colorspace_settings.name = 'Non-Color'
    rgba = np.stack([r, g, b, np.ones_like(r)], -1).astype(np.float32)
    im.pixels[:] = rgba.ravel()
    im.filepath_raw = os.path.join(OUT, name + '.png')
    im.file_format = 'PNG'
    im.save()

zero = np.zeros_like(enc['left'])
save('room_lm_a', enc['left'], enc['back'], enc['right'])
save('room_lm_b', enc['floor'], zero, zero)
json.dump({'scale': scale, 'encoding': 'sqrt', 'res': RES, 'samples': SAMPLES}, open(os.path.join(OUT, 'room_lm.json'), 'w'))

# --- Export de la structure seule ---
for m in MATS.values():  # retire le nœud de calcul avant export
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']:
        m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'room.glb'), use_selection=True, export_format='GLB',
                          export_yup=True, export_normals=True, export_texcoords=True, export_materials='EXPORT')
print('OK', OUT, 'scale', scale, flush=True)
