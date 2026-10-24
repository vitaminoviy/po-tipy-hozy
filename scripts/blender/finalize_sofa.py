"""Render the existing editable sofa, export and verify a GLB round trip.

Does not regenerate the model. Run with Blender --background --python.
"""
import json
import math
from pathlib import Path
import bpy
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
views = {
    'isometric': ((3, -4, 2.8), (0, 0, .65), 3.35),
    'front': ((0, -5, 1.65), (0, 0, .68), 3.1),
    'side': ((5, 0, 1.8), (0, 0, .68), 2.7),
    'game-angle': ((3, -4, 4.8), (0, 0, .6), 3.25),
    'cushion-detail': ((1.9, -3, 2.25), (0, .02, .92), 2.15),
}

def view(name):
    location, target, scale = views[name]
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale

view('isometric')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'blender/quiet-home-sofa.blend'))
asset = bpy.data.collections['SOFA_ASSET']
bpy.ops.object.select_all(action='DESELECT')
for obj in asset.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'export/quiet-home-sofa.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)
for name in views:
    view(name)
    scene.render.filepath = str(OUT / 'previews' / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    print('RENDER_COMPLETE', name, flush=True)

# Remove only the original asset in memory; keep the studio for visual comparison.
# Never save this imported verification scene over the editable source.
for obj in list(asset.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT / 'export/quiet-home-sofa.glb'))
meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
points = []
triangles = 0
materials = set()
for obj in meshes:
    assert not obj.data.validate(), 'Invalid imported mesh: ' + obj.name
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
    materials.update(m.name for m in obj.data.materials if m)
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        assert all(math.isfinite(v) for v in point)
        points.append(tuple(point))
bounds = [[fn(p[i] for p in points) for i in range(3)] for fn in (min, max)]
expected = json.loads((OUT / 'export/metrics.json').read_text())
assert triangles == expected['triangles'], (triangles, expected['triangles'])
assert len(materials) == 2
assert len(meshes) == 9
assert max(abs(bounds[j][i] - expected['bounds_blender'][j][i]) for j in range(2) for i in range(3)) < .0001
report = {'passed': True, 'meshes': len(meshes), 'triangles': triangles, 'materials': len(materials), 'bounds_blender': bounds, 'blender': bpy.app.version_string}
(OUT / 'export/roundtrip-check.json').write_text(json.dumps(report, indent=2))
view('isometric')
scene.render.filepath = str(OUT / 'previews/glb-roundtrip.png')
bpy.ops.render.render(write_still=True)
print('ROUNDTRIP_PASSED', json.dumps(report), flush=True)
