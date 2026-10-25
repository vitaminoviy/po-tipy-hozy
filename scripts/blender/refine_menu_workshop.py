"""Continue the recovered workshop master; render ONE review frame, never a loop.

blender -b -t 8 --python scripts/blender/refine_menu_workshop.py -- --preview
Omit --preview for the 1920x1080 Cycles review. Original master is preserved.
All geometry, shaders and compositing are authored locally in Blender.
"""
import ast
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/menu/blender'
PRE = ROOT / 'artifacts/menu/blender'
random.seed(641)
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'quiet-home-workshop.blend'))
scene = bpy.context.scene
# Reuse the actual draft's modeling helpers without rebuilding or saving the draft.
tree = ast.parse((ROOT / 'scripts/blender/create_menu_workshop.py').read_text())
helpers = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in
           {'mat', 'assign', 'box', 'sphere', 'cylinder', 'curve', 'aim', 'light', 'periodic'}]
exec(compile(ast.Module(body=helpers, type_ignores=[]), '<draft helpers>', 'exec'))

def material(name):
    return bpy.data.materials[name]

wood = material('Oiled walnut - long grain')
edge = material('End grain honey oak')
trim = material('Painted ivory joinery')
cream = material('Warm lime plaster')
stone = material('Sandstone plinth')
brass = material('Brushed antique brass')
sage = material('Sage painted door')
paper = material('Ivory paper')
black = material('Iron patina')
soil = material('Dark potting soil')
potmat = material('Ceramic celadon')
roof = [material('Weathered slate ' + str(i)) for i in range(4)]
CX = 1.55

def remove_prefix(*prefixes):
    for ob in list(scene.objects):
        if any(ob.name.startswith(p) for p in prefixes):
            bpy.data.objects.remove(ob, do_unlink=True)

def beam(name, a, b, width, depth, m):
    a, b = Vector(a), Vector(b)
    ob = box(name, (a+b)/2, (width, depth, (b-a).length), m, min(width*.2, .025))
    ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return ob

# Correct physically oversized bump: the miniature must have fine plaster and wood.
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BUMP':
            n.inputs['Distance'].default_value = .003 if 'grain' in m.name else .0015
            n.inputs['Strength'].default_value = .16
        if n.type == 'BSDF_PRINCIPLED' and 'Ivy jade' in m.name:
            n.inputs['Subsurface Weight'].default_value = .12
            n.inputs['Roughness'].default_value = .43

# Roof: a single shared geometric slope for substrate, tiles, fascia and gutters.
remove_prefix('Roof underboarding', 'Hand laid slate', 'Roof fascia', 'Terracotta ridge cap')
angle = math.atan2(1.45, 1.625)
ridge = Vector((CX, .15, 4.69))
roof_checks = []
for side in [-1, 1]:
    tangent = Vector((side*math.cos(angle), 0, -math.sin(angle)))
    normal = Vector((side*math.sin(angle), 0, math.cos(angle)))
    length = 2.59
    ob = box('Refined roof deck', ridge+tangent*length/2-normal*.075,
             (length, 3.28, .09), wood, .018)
    ob.rotation_euler[1] = side*angle
    for row in range(12):
        along = .10+row*.216
        # Higher courses sit above lower courses: intentional weatherproof lap.
        lift = .035 + (11-row)*.005
        for col in range(11):
            y = -1.45 + col*.303 + (.15 if row % 2 else 0)
            if y > 1.77:
                continue
            loc = ridge+tangent*along+normal*lift
            loc.y = y
            ob = box('Refined individual slate', loc, (.305, .298, .038),
                     random.choice(roof), .018)
            ob.rotation_euler[1] = side*angle
            roof_checks.append((Vector(ob.location)-ridge).dot(normal))
    for y in [-1.61, 1.89]:
        a = ridge.copy(); a.y = y
        beam('Carved bargeboard', a+normal*.005, a+tangent*2.69+normal*.005, .11, .12, trim)
        beam('Bargeboard shadow bead', a+normal*.065, a+tangent*2.69+normal*.065, .026, .14, edge)
    eave = ridge+tangent*2.65
    beam('Copper rain gutter', (eave.x, -1.65, eave.z), (eave.x, 1.94, eave.z), .085, .085, black)
    if side == 1:
        curve('Bent copper downpipe', [(eave.x,1.6,eave.z),(eave.x,1.6,2.9),
              (CX+1.71,1.6,2.7),(CX+1.71,1.6,.46)], .035, black)
for j in range(12):
    o = cylinder('Overlapping ridge tile', (CX,-1.51+j*.29,4.78), .095,.30,roof[1])
    o.rotation_euler[0] = math.pi/2

# Masonry, joinery, door inset panels, porch brackets and foundation courses.
for row in range(3):
    for j in range(12):
        x = CX-2.15+j*.39
        box('Hand cut foundation stone', (x,-1.88,.28+row*.036), (.376,.10,.032),stone,.01)
for x in [CX-1.60,CX+1.60]:
    for z in [.61,1.0,1.39,2.02,2.43,2.85]:
        box('Limestone corner quoin',(x,-1.20,z),(.20,.19,.16),trim,.014)
for x in [CX-.38,CX+.38]:
    box('Door jamb',(x,-1.31,1.01),(.075,.13,1.49),trim,.014)
box('Door lintel',(CX,-1.33,1.77),(.88,.20,.105),trim,.02)
for z in [.54,.85]:
    box('Recessed sage door panel',(CX,-1.288,z),(.45,.025,.22),edge,.012)
    box('Painted inset door panel',(CX,-1.307,z),(.40,.022,.17),sage,.012)
box('Door brass mail slot',(CX,-1.337,1.0),(.21,.03,.037),brass,.007)
for x in [CX-1,CX+1]:
    for z in [1.05,2.55]:
        for s in [-1,1]:
            sx = x+s*(.51 if z>2 else .42)
            box('Louver shutter backing',(sx,-1.25,z),(.15,.075,.93),sage,.014)
            for k in range(9):
                o=box('Shutter angled louver',(sx,-1.303,z-.38+k*.093),(.135,.035,.052),sage,.008)
                o.rotation_euler[0]=.22
        box('Window drip moulding',(x,-1.28,z+.54),(1.12 if z>2 else .95,.24,.065),trim,.016)
for x in [CX-1.79,CX+1.79]:
    for y in [-1.42,1.0]:
        beam('Porch diagonal joinery',(x,y,.88),(x,y+.24,.64),.045,.045,trim)

# Glazing is layered over the linen emitter, with subtle reflections and curtain folds.
glazing=mat('Thin reflective miniature glazing',(.68,.82,.85),.12)
p=glazing.node_tree.nodes.get('Principled BSDF')
p.inputs['Transmission Weight'].default_value=.94
p.inputs['IOR'].default_value=1.45
linen=material('Warm linen behind glass')
linen.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1.65
for ob in list(scene.objects):
    if ob.name.startswith('Glowing linen window'):
        pane=ob.copy();pane.data=ob.data.copy();scene.collection.objects.link(pane)
        pane.name='Reflective window pane'
        side=abs(ob.rotation_euler.z)>1
        if side: pane.location.x+=.085
        else: pane.location.y-=.085
        pane.data.materials.clear();pane.data.materials.append(glazing)
    if ob.name.startswith('Curtain '):
        for k in range(3):
            loc=ob.location.copy()
            if abs(ob.rotation_euler.z)>1:
                loc.y+=(k-1)*.027;loc.x+=.012
            else:
                loc.x+=(k-1)*.027;loc.y-=.012
            fold=sphere('Soft linen curtain fold',loc,(.016,.018,ob.dimensions.z*.47),paper)

# Replace identical radial plant fans with varied, curved botanical shoots.
roots=[o for o in scene.objects if o.type=='EMPTY' and o.parent is None and o.name!='Animated pendant assembly']
for root in roots:
    descendants=list(root.children_recursive)
    for ob in reversed(descendants):bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.objects.remove(root,do_unlink=True)
remove_prefix('Window box foliage','Small blossom petal')
leafm=[material('Ivy jade '+str(i)) for i in range(4)]
vein=material('Leaf veins')
leafmesh=bpy.data.meshes['Curved botanical leaf master']
blossom=mat('Dusty rose flower',(.48,.19,.17),.7)
terracotta=mat('Hand thrown warm terracotta',(.30,.115,.062),.83,noise=True)

def botanical(name, loc, size=1, hanging=False, pot=True):
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
    root.location=loc;root.scale=(size,)*3
    if pot:
        for z,r,d,m in [(0,.25,.39,terracotta),(.19,.28,.065,terracotta),(.218,.235,.015,soil)]:
            ob=cylinder(name+' ceramic', (0,0,z),r,d,m,r*.78 if z==0 else r);ob.parent=root
    for b in range(9 if hanging else 12):
        rig=bpy.data.objects.new(name+' flexible shoot',None);scene.collection.objects.link(rig);rig.parent=root
        a=random.uniform(0,math.tau);length=random.uniform(.65,1.75)
        points=[]
        for j in range(10):
            t=j/9
            r=(.1+t*.48) if hanging else (.05+t*t*.62)
            points.append((math.cos(a+t*.35)*r,math.sin(a+t*.35)*r,
                           .23 + (.12*math.sin(t*4)-t*length if hanging else math.sin(t*1.8)*length)))
        ob=curve(name+' organic stem',points,.008,vein);ob.parent=rig
        periodic(rig,'rotation_euler',0,0,.018,b*.67)
        periodic(rig,'rotation_euler',1,0,.026,b*.83)
        for j in range(2,10):
            ob=bpy.data.objects.new(name+' veined leaf',leafmesh);scene.collection.objects.link(ob);ob.parent=rig
            ob.location=points[j];s=random.uniform(.65,1.15)*(1-j*.043)
            ob.scale=(s*.95,s,s)
            ob.rotation_euler=(random.uniform(-.9,.7),random.uniform(-.8,.8),a+(-1 if j%2 else 1)*1.2)
            for slot in ob.material_slots:slot.link='OBJECT';slot.material=random.choice(leafm)
            end=Vector(points[j])+ob.rotation_euler.to_matrix()@Vector((0,.37*s,.025*s))
            mid=Vector(points[j])+ob.rotation_euler.to_matrix()@Vector((0,.18*s,.05*s))
            v=curve(name+' leaf midrib',[points[j],mid,end],.002,vein);v.parent=rig
    return root

botanical('Window hanging pothos',(-.30,3.2,5.7),1.12,True)
botanical('Upper right ivy',(5.7,3.2,6.3),1.2,True)
botanical('Shadow fern',(-4.5,2.8,5.35),.85,True)
botanical('Foreground geranium',(-3.2,-2.0,.16),.82)
botanical('House side climbing ivy',(CX+1.85,1.0,1.0),.57,True)
botanical('Desk herb',(5.3,-1.45,.25),.62)
for x in [CX-1,CX+1]:
    botanical('Window box greenery',(x,-1.43,2.08),.25,False,False)
    for j in range(9):
        px=x+random.uniform(-.42,.42);py=-1.46+random.uniform(-.07,.07);pz=2.17+random.uniform(.02,.17)
        curve('Flower stalk',[(px,py,2.05),(px,py,pz)],.006,vein)
        for a in range(5):
            sphere('Geranium soft petal',(px+.025*math.cos(a*math.tau/5),py+.025*math.sin(a*math.tau/5),pz),(.027,.025,.013),blossom)

# Workshop props: measured plan, carpenter's tools, artist's jar and worn books.
ink=mat('Faded blueprint graphite',(.12,.17,.15),.9)
for dx in [-.50,0,.50]:
    curve('Drawing plan wall',[(CX+dx,-2.96,.043),(CX+dx,-2.30,.043)],.004,ink)
for y in [-2.96,-2.62,-2.30]:
    curve('Drawing plan line',[(CX-.50,y,.043),(CX+.50,y,.043)],.004,ink)
for i in range(20):
    box('Ruler engraved tick',(CX-.72+i*.048,-2.93,.056),(.003,.045 if i%5==0 else .025,.003),black,.001)
for i in range(3):
    z=.12+i*.17
    for j in range(5):
        box('Fine book page edges',(4.47+i*.07,-2.77+i*.04,z-.03+j*.019),(1.2,.003,.003),edge,.001)
box('Carpenter mallet head',(4.0,-.95,.16),(.53,.27,.25),edge,.045)
beam('Mallet turned handle',(4.0,-.95,.18),(4.33,-1.62,.10),.085,.085,wood)
for x in [4.4,4.65]:
    beam('Steel chisel',(x,-.22,.075),(x-.13,-.85,.075),.045,.025,brass)
    beam('Chisel walnut grip',(x,-.22,.075),(x+.08,.08,.075),.075,.065,wood)
cylinder('Brush jar',(4.95,.9,.43),.19,.62,potmat,.16)
for i in range(7):
    x=4.95+random.uniform(-.13,.13);y=.9+random.uniform(-.12,.12)
    end=(x+random.uniform(-.18,.18),y+random.uniform(-.12,.12),random.uniform(1.0,1.35))
    beam('Artist brush shaft',(x,y,.38),end,.018,.018,edge)
    sphere('Soft brush bristles',end,(.035,.035,.13),wood)
# Drawers and hardware give the workbench thickness and scale.
for x in [-2,1,4]:
    box('Workbench drawer front',(x,-4.88,-.66),(2.78,.15,.60),wood,.045)
    for sx in [-.23,.23]:sphere('Drawer brass screw',(x+sx,-4.98,-.65),(.025,.018,.025),brass)
    curve('Drawer brass cup pull',[(x-.22,-4.98,-.65),(x,-5.06,-.72),(x+.22,-4.98,-.65)],.023,brass)

# A calmer blue dusk beyond the window. Remove block-like skyline artifacts.
remove_prefix('Distant rooftops')
sky=material('Evening gradient beyond workshop')
for n in sky.node_tree.nodes:
    if n.type=='VALTORGB':
        n.color_ramp.elements[0].color=(.29,.12,.085,1)
        n.color_ramp.elements[1].color=(.018,.035,.095,1)
    if n.type=='EMISSION':n.inputs[1].default_value=.45
for layer in range(3):
    m=mat('Distant dusk hills '+str(layer),(.035+layer*.015,.055+layer*.012,.085+layer*.013),1)
    verts=[(-2.4,4.17-layer*.008,.4),(6.6,4.17-layer*.008,.4)]
    for j in range(41):
        x=6.6-j*9/40;z=.9+layer*.25+.16*math.sin(x*1.1+layer)+.10*math.sin(x*2.1)
        verts.append((x,4.17-layer*.008,z))
    mesh=bpy.data.meshes.new('Distant soft hill mesh');mesh.from_pydata(verts,[],[tuple(range(len(verts)))])
    ob=bpy.data.objects.new('Distant soft evening hills',mesh);scene.collection.objects.link(ob);ob.data.materials.append(m)

# Soft motivated lighting. Window spills remain animated from the recovered master.
for ob in scene.objects:
    if ob.type!='LIGHT':continue
    if ob.name.startswith('Window spill'):
        ob.data.driver_remove('energy');periodic(ob.data,'energy',None,9,.8,ob.location.x)
        ob.data.shadow_soft_size=.22
    if ob.name=='Large warm studio softbox':ob.data.energy=650;ob.data.size=5
    if ob.name=='Cool evening window fill':ob.data.energy=230
    if ob.name=='Low warm bounce':ob.data.energy=35
light('Cottage warm grazing key',(4,-4,6.0),95,(1,.66,.37),2.7,(CX,0,2))
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.10
scene.view_settings.exposure=-.65
camera=scene.camera
camera.location=(10,-17,8.4);aim(camera,(-.75,.35,2.2));camera.data.lens=46
focus=bpy.data.objects.new('Cottage focus target',None);scene.collection.objects.link(focus);focus.location=(CX,-.4,2.1)
camera.data.dof.focus_object=focus;camera.data.dof.aperture_fstop=6.3

# Cycles supplies contact shadows, reflected window glow and translucent foliage.
scene.render.engine='CYCLES';scene.cycles.samples=96
scene.cycles.use_denoising=True;scene.cycles.max_bounces=8
scene.cycles.transparent_max_bounces=8
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type!='CPU'
    if any(d.use for d in prefs.devices):scene.cycles.device='GPU'
except Exception as exc:
    print('GPU fallback:',exc,flush=True)
scene.render.resolution_x=1920;scene.render.resolution_y=1080
preview='--preview' in sys.argv
scene.render.resolution_percentage=50 if preview else 100
if preview:scene.cycles.samples=24
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/('workshop-review-preview.png' if preview else 'workshop-review.png'))
scene.frame_set(1)
assert min(roof_checks)>.03, 'Slate must remain above substrate'
report={'base':'quiet-home-workshop.blend','objects':len(scene.objects),
        'slate_tiles':len(roof_checks),'minimum_slate_normal_offset':min(roof_checks),
        'resolution':[1920,1080], 'engine':'Cycles','rendered_frames':[1],
        'animation_review_pending':True}
(OUT/'review-check.json').write_text(json.dumps(report,indent=2))
# Save full-resolution settings even when generating the quick single-frame study.
scene.render.resolution_percentage=100;scene.cycles.samples=96
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-home-workshop-review.blend'))
if preview:scene.render.resolution_percentage=50;scene.cycles.samples=24
bpy.ops.render.render(write_still=True)
print('REVIEW_FRAME_COMPLETE',scene.render.filepath,flush=True)
