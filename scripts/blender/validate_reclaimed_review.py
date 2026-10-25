"""Read-only geometric checks for the two Quiet Home still reviews.
Open the reclaimed review blend before running. Writes a JSON report, not a blend.
"""
import bpy
import bmesh
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/menu/blender'
scene=bpy.context.scene
assert scene.get('source_blend')=='quiet-home-overgrown-review.blend'
assert scene.frame_current==1
assert (scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage)==(1920,1080,100)
deps=bpy.context.evaluated_depsgraph_get()

def surface_hits(objects,origin,direction):
    hits=[]
    for ob in objects:
        evaluated=ob.evaluated_get(deps);inv=ob.matrix_world.inverted()
        p=inv@origin;d=inv.to_3x3()@direction
        ok,point,normal,index=evaluated.ray_cast(p,d,distance=4)
        if ok:hits.append((ob.name,ob.matrix_world@point))
    return hits

floor=[o for o in scene.objects if o.name.startswith(('Uneven old floorboard','Splintered floor edge'))]
hole_probes=[Vector((1.95,-3.10,.35)),Vector((6.35,2.8,.35)),Vector((-5.45,2.2,.35))]
for point in hole_probes:
    assert not surface_hits(floor,point,Vector((0,0,-1))),('Floor opening obstructed',point[:])
assert surface_hits(floor,Vector((0,-3.10,.35)),Vector((0,0,-1))), 'Control floor surface missing'

table=bpy.data.objects['Old table and preserved miniature']
top=[o for o in scene.objects if o.name.startswith(('Worn tabletop plank','Broken tabletop with exposed end grain'))]
supports=[]
for x,y in [(-1.28,-1.04),(1.28,-1.04),(-1.28,1.04),(1.28,1.04),(0,0)]:
    hits=surface_hits(top,table.matrix_world@Vector((x,y,.5)),table.matrix_world.to_3x3()@Vector((0,0,-1)))
    assert hits,('Miniature support absent',x,y)
    z=max((table.matrix_world.inverted()@point).z for name,point in hits)
    assert abs(z)<.035,(x,y,z)
    supports.append([x,y,z])

negative=[];checked=0;seen=set()
for ob in scene.objects:
    if ob.type!='MESH' or ob.data in seen:continue
    seen.add(ob.data);bm=bmesh.new();bm.from_mesh(ob.data)
    if bm.faces and all(e.is_manifold for e in bm.edges):
        checked+=1
        if bm.calc_volume(signed=True)<-1e-7:negative.append(ob.name)
    bm.free()
assert not negative,negative
bm=bmesh.new();bm.from_mesh(bpy.data.objects['Atmosphere volume'].data)
volume=bm.calc_volume(signed=True);bm.free();assert volume>0

cameras={}
for name in ['Quiet Home review A - room and warmth','Quiet Home review B - floor and history']:
    camera=bpy.data.objects[name]
    points=[world_to_camera_view(scene,camera,ob.matrix_world@Vector(v)) for ob in scene.objects
            if ob.name.startswith(('Cottage plaster body','Refined roof deck','Miniature oak base')) for v in ob.bound_box]
    bounds=[min(p.x for p in points),max(p.x for p in points),min(p.y for p in points),max(p.y for p in points)]
    assert bounds[0]>.4 and bounds[1]<1 and bounds[2]>0 and bounds[3]<1,bounds
    cameras[name]=bounds

report={'blender':bpy.app.version_string,'frame':1,'floor_opening_probes_clear':3,
        'intact_floor_control':True,'miniature_table_support_probes':supports,
        'closed_meshes_checked':checked,'inward_closed_meshes':negative,
        'atmosphere_signed_volume':volume,'camera_bounds':cameras,
        'limits':'One frame, selected support probes and camera bounds; not a collision or animation sweep.'}
(OUT/'reclaimed-validation.json').write_text(json.dumps(report,indent=2))
print('RECLAIMED_VALIDATION_OK',json.dumps(report),flush=True)
