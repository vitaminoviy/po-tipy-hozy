"""Derive integration GLB from the approved game mesh; keep the art master intact.

Blender Z-up, front -Y. Legacy Three.js seat anchors are y=.855,
x=+/- .53, z=.03; back occupies z=-.55..-.31. No game logic changes.
"""
import bpy
from pathlib import Path
from mathutils import Matrix
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/sofa/export/quiet-home-sofa.glb'))
objects = [o for o in bpy.context.selected_objects if o.type == 'MESH']

def interp(value, knots):
    for (a,b),(c,d) in zip(knots, knots[1:]):
        if value <= c:
            return b+(value-a)/(c-a)*(d-b)
    return knots[-1][1]

for obj in objects:
    # Work in Blender world coordinates, including the imported glTF axis root.
    matrix = obj.matrix_world.copy()
    for vertex in obj.data.vertices:
        vertex.co = matrix @ vertex.co
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    points = obj.data.vertices
    low = [min(v.co[i] for v in points) for i in range(3)]
    high = [max(v.co[i] for v in points) for i in range(3)]
    if obj.name.startswith('Seat cushion'):
        center = -.53 if (low[0]+high[0])/2 < 0 else .53
        for v in points:
            v.co.x = center + ((v.co.x-low[0])/(high[0]-low[0])-.5)*.97
            v.co.y = -.03 + ((v.co.y-low[1])/(high[1]-low[1])-.5)*.79
            # Keep edge roll, flatten the broad contact face to the saved anchor.
            v.co.z = min(.855, .575+(v.co.z-low[2])/(high[2]-low[2]-.025)*.28)
    elif obj.name.startswith('Back cushion'):
        center = -.53 if (low[0]+high[0])/2 < 0 else .53
        for v in points:
            v.co.x = center + ((v.co.x-low[0])/(high[0]-low[0])-.5)*1.03
            v.co.y = .31 + (v.co.y-low[1])/(high[1]-low[1])*.235
            v.co.z = .78 + (v.co.z-low[2])/(high[2]-low[2])*.555
    elif 'foot' not in obj.name:
        for v in points:
            # Recess the rear shell behind the cushions, rather than burying
            # their visible fronts in the original thick Blender shell.
            if v.co.y > .25:
                weight = max(0,min(1,(1.1-abs(v.co.x))/.18))
                ramp = max(0,min(1,(v.co.y-.25)/.06))
                target = .49+(v.co.y-.31)/(.54-.31)*.05
                v.co.y += (target-v.co.y)*weight*ramp
            v.co.z = interp(v.co.z, [(0,0),(.175,.25),(.46,.60),(.88,1.03),(1.08,1.34)])
            # Rounded arm interiors/back junction stay inside legacy collision union.
            if v.co.z > .725 and v.co.y < .31:
                v.co.x = (1 if v.co.x>0 else -1)*max(.96,abs(v.co.x))
            if v.co.y >= .31:
                v.co.z = min(v.co.z,1.35)
            else:
                v.co.z = min(v.co.z,1.03)
            limit = 1.23 if v.co.z < .53 else 1.24
            v.co.x = max(-limit,min(limit,v.co.x))
    else:
        for v in points:
            v.co.z *= .25/.175
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for face in obj.data.polygons:
        face.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/sofa/mint-sofa-v1.glb'),export_format='GLB',use_selection=True,export_apply=True)
print('INTEGRATION_EXPORT_COMPLETE',flush=True)
