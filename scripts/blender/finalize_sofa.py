"""Finalize the existing master; create and verify a separate game derivative."""
import json
import math
import struct
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

OUT = Path(__file__).resolve().parents[2] / 'assets/sofa'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'blender/quiet-home-sofa.blend'))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 128
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
camera = scene.camera
asset = bpy.data.collections['SOFA_ASSET']
views = {
    'isometric': ((3, -4, 2.8), (0, 0, .55), 3.35),
    'front': ((0, -5, 1.55), (0, 0, .56), 3.1),
    'side': ((5, 0, 1.65), (0, 0, .56), 2.7),
    'cushion-detail': ((1.9, -3, 2.1), (0, .02, .73), 2.15),
    'game-angle': ((3, -4, 4.8), (0, 0, .55), 3.25),
}

def view(name):
    location, target, scale = views[name]
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale

def render(name, prefix=''):
    view(name)
    scene.render.filepath = str(OUT / 'previews' / (prefix + name + '.png'))
    bpy.ops.render.render(write_still=True)
    print('RENDER_COMPLETE', prefix + name, flush=True)

def measure(objects):
    points, triangles, materials = [], 0, set()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        materials.update(m.name for m in mesh.materials if m)
        for vertex in mesh.vertices:
            point = evaluated.matrix_world @ vertex.co
            assert all(math.isfinite(v) for v in point)
            points.append(tuple(point))
        evaluated.to_mesh_clear()
    bounds = [[fn(p[i] for p in points) for i in range(3)] for fn in (min, max)]
    return {'triangles': triangles, 'materials': len(materials), 'bounds_blender': bounds}

view('isometric')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'blender/quiet-home-sofa.blend'))
master = measure(asset.objects)
for name in views:
    render(name)

# Apply subdivision only on the derivative. The saved master remains editable.
for obj in list(asset.objects):
    if obj.type != 'MESH':
        continue
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if 'foot' not in obj.name:
        decimate = obj.modifiers.new('Game derivative reduction', 'DECIMATE')
        decimate.ratio = .42
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    assert not obj.data.validate(), obj.name

game = measure(asset.objects)
assert game['triangles'] < 21000
bounds_delta = max(abs(game['bounds_blender'][j][i] - master['bounds_blender'][j][i]) for j in range(2) for i in range(3))
assert bounds_delta < .003, bounds_delta
bpy.ops.object.select_all(action='DESELECT')
for obj in asset.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'export/quiet-home-sofa.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)
for name in ('isometric', 'front', 'side'):
    render(name, 'game-')

# Compare actual rendered pixels at identical camera/light settings; no generated art.
rows = []
for name in ('isometric', 'front', 'side'):
    pair = []
    for prefix in ('', 'game-'):
        img = bpy.data.images.load(str(OUT / 'previews' / (prefix + name + '.png')), check_existing=False)
        width, height = img.size
        values = np.empty(width * height * 4, dtype=np.float32)
        img.pixels.foreach_get(values)
        pair.append(values.reshape(height, width, 4))
        bpy.data.images.remove(img)
    rows.append(np.concatenate(pair, axis=1))
# Blender pixels start at bottom; reverse row order for iso/front/side top to bottom.
pixels = np.concatenate(rows[::-1], axis=0)
comparison = bpy.data.images.new('Master LEFT - game RIGHT', width=pixels.shape[1], height=pixels.shape[0], alpha=True)
comparison.pixels.foreach_set(pixels.ravel())
comparison.filepath_raw = str(OUT / 'previews/master-vs-game.png')
comparison.file_format = 'PNG'
comparison.save()

# Inspect the actual GLB material contract, including its embedded normal texture.
blob = (OUT / 'export/quiet-home-sofa.glb').read_bytes()
assert struct.unpack_from('<4sII', blob, 0) == (b'glTF', 2, len(blob))
length, kind = struct.unpack_from('<II', blob, 12)
assert kind == 0x4E4F534A
payload = json.loads(blob[20:20+length])
assert len(payload['materials']) == 2
assert len(payload['images']) == 1
assert 'bufferView' in payload['images'][0]
assert any('normalTexture' in m for m in payload['materials'])
assert all('NORMAL' in p['attributes'] and 'TEXCOORD_0' in p['attributes'] for m in payload['meshes'] for p in m['primitives'] if 'normalTexture' in payload['materials'][p['material']])

for obj in list(asset.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT / 'export/quiet-home-sofa.glb'))
meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
for obj in meshes:
    assert not obj.data.validate(), obj.name
roundtrip = measure(meshes)
assert roundtrip['triangles'] == game['triangles']
assert roundtrip['materials'] == 2 and len(meshes) == 9
assert max(abs(roundtrip['bounds_blender'][j][i] - game['bounds_blender'][j][i]) for j in range(2) for i in range(3)) < .0001
render('isometric', 'glb-')
report = {'passed': True, 'blender': bpy.app.version_string, 'master': master, 'game': game, 'roundtrip': roundtrip, 'bounds_delta_m': bounds_delta, 'meshes': len(meshes), 'embedded_normal_images': 1, 'glb_bytes': len(blob)}
(OUT / 'export/roundtrip-check.json').write_text(json.dumps(report, indent=2))
print('ROUNDTRIP_PASSED', json.dumps(report), flush=True)
