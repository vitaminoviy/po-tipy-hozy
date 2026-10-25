"""Final light/botanical pass over refine_menu_workshop.py output; one still only.
Run after refine_menu_workshop.py -- --preview. Keeps recovered master untouched.
"""
import ast
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/menu/blender'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'quiet-home-workshop-review.blend'))
scene=bpy.context.scene
tree=ast.parse((ROOT/'scripts/blender/create_menu_workshop.py').read_text())
helpers=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in
         {'mat','assign','box','sphere','cylinder','curve','aim','light','periodic'}]
exec(compile(ast.Module(body=helpers,type_ignores=[]),'<workshop helpers>','exec'))
random.seed(903)

def close_roof_edges():
    # Staggered rows need cut slates at BOTH verges, not exposed timber strips.
    angle=math.atan2(1.45,1.625)
    ridge=Vector((1.55,.15,4.69))
    for side in [-1,1]:
        tangent=Vector((side*math.cos(angle),0,-math.sin(angle)))
        normal=Vector((side*math.sin(angle),0,math.cos(angle)))
        for row in range(12):
            along=.10+row*.216
            centers=[-1.45+c*.303+(.15 if row%2 else 0) for c in range(11)]
            centers=[y for y in centers if y<=1.77]
            for a,b in [(-1.61,min(centers)-.149),(max(centers)+.149,1.89)]:
                if b-a<.007:continue
                loc=ridge+tangent*along+normal*(.035+(11-row)*.005)
                loc.y=(a+b)/2
                ob=box('Cut slate at roof verge',loc,(.305,b-a,.038),
                       bpy.data.materials['Weathered slate '+str(row%4)],.007)
                ob.rotation_euler.y=side*angle
close_roof_edges()
# Dense irregular leaf clusters, retaining original parent rigs and periodic sway.
for ob in list(scene.objects):
    if 'veined leaf' not in ob.name or random.random()>.8:continue
    leaf=ob.copy();scene.collection.objects.link(leaf)
    leaf.name='Companion botanical leaf'
    leaf.rotation_euler.z+=random.uniform(1.9,3.8)
    leaf.rotation_euler.x+=random.uniform(-.45,.4)
    leaf.scale*=random.uniform(.75,1.15)
    leaf.location.z-=random.uniform(.015,.08)

# Layered foreground foliage provides a soft frame and depth without filling title space.
leafmesh=bpy.data.meshes['Curved botanical leaf master']
leafmat=bpy.data.materials['Ivy jade 2']
vein=bpy.data.materials['Leaf veins']
for b in range(14):
    root=bpy.data.objects.new('Foreground botanical sway',None);scene.collection.objects.link(root)
    root.location=(6.3,-3.65,-.05)
    a=math.tau*b/14;length=random.uniform(.65,1.4)
    end=Vector((math.cos(a)*length*.65,math.sin(a)*length*.5,length*.7))
    ob=curve('Foreground curved petiole',[(0,0,0),end*.6+Vector((0,0,.15)),end],.012,vein);ob.parent=root
    for j in range(3):
        leaf=bpy.data.objects.new('Broad foreground leaf',leafmesh);scene.collection.objects.link(leaf);leaf.parent=root
        leaf.location=end*(.7+j*.15);leaf.scale=(1.5,1.8,1.5)
        leaf.rotation_euler=(random.uniform(-.5,.3),random.uniform(-.5,.5),a+j*1.8)
        for slot in leaf.material_slots:slot.link='OBJECT';slot.material=leafmat
    periodic(root,'rotation_euler',1,0,.018,b*.6)

for ob in scene.objects:
    if ob.type!='LIGHT':continue
    if ob.name=='Large warm studio softbox':ob.data.energy=340
    if ob.name=='Low warm bounce':ob.data.energy=18
    if ob.name=='Cool evening window fill':
        ob.data.energy=420;ob.data.color=(.31,.46,1.0)
    if ob.name=='Cottage warm grazing key':ob.data.energy=140
    if ob.name=='Pendant warm soft pool':
        ob.data.driver_remove('energy');periodic(ob.data,'energy',None,260,10,1.2)
    if ob.name.startswith('Window spill'):
        ob.data.driver_remove('energy');periodic(ob.data,'energy',None,15,1,ob.location.x)
m=bpy.data.materials['Warm linen behind glass']
p=m.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Strength'].default_value=3.2
p.inputs['Emission Color'].default_value=(1,.48,.15,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.055
scene.view_settings.exposure=-.85
scene.camera.data.dof.aperture_fstop=4.8
light('Cool roof edge rim',(2,3.0,6.9),180,(.4,.58,1),3,(2,0,3.4))

# Restrained optical bloom: scene luminance drives the effect, no painted overlays.
group=bpy.data.node_groups.new('Quiet Home subtle lens bloom','CompositorNodeTree')
group.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
scene.compositing_node_group=group
rl=group.nodes.new('CompositorNodeRLayers')
glare=group.nodes.new('CompositorNodeGlare')
glare.inputs['Type'].default_value='Fog Glow'
glare.inputs['Quality'].default_value='High'
glare.inputs['Threshold'].default_value=1.2
glare.inputs['Strength'].default_value=.18
glare.inputs['Size'].default_value=.35
out=group.nodes.new('NodeGroupOutput')
group.links.new(rl.outputs['Image'],glare.inputs['Image'])
group.links.new(glare.outputs['Image'],out.inputs['Image'])

# Validate the inherited and new periodic object/light drivers without rendering a loop.
def sample(frame):
    scene.frame_set(frame);bpy.context.view_layer.update()
    values=[]
    for ob in scene.objects:
        if ob.animation_data:values.extend(v for row in ob.matrix_world for v in row)
        if ob.type=='LIGHT' and ob.data.animation_data:values.append(ob.data.energy)
    return values
first,last=sample(1),sample(241)
delta=max(abs(a-b) for a,b in zip(first,last))
assert len(first)==len(last) and delta<.0001
scene.frame_set(1)
scene.render.resolution_percentage=100
scene.render.resolution_x=1920;scene.render.resolution_y=1080
scene.cycles.samples=128;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type!='CPU'
    scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
except Exception as exc:
    scene.cycles.device='CPU';print('OptiX unavailable:',exc,flush=True)
scene.render.filepath=str(OUT/'workshop-review.png')
report=json.loads((OUT/'review-check.json').read_text())
report.update({'objects':len(scene.objects),'samples':128,'loop_endpoint_max_delta':delta,
               'loop_animated_values':len(first),'full_loop_rendered':False,
               'cut_verge_slates':sum(o.name.startswith('Cut slate at roof verge') for o in scene.objects),
               'camera':scene.camera.name,'output':scene.render.filepath})
(OUT/'review-check.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-home-workshop-review.blend'))
bpy.ops.render.render(write_still=True)
print('FINAL_REVIEW_COMPLETE',scene.render.filepath,flush=True)
