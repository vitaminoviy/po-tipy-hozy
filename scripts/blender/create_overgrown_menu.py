"""Quiet Home: nature reclaiming a quiet room, continuing the saved workshop.

Input: quiet-home-workshop-review.blend (never overwritten).
Output: one editable overgrown-room blend and ONE review frame.
Run with Blender --python this_file -- --preview for a 960x540 lighting study.
No external artwork or scene assets; all additions are Blender geometry/shaders.
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/menu/blender'
PRE=ROOT/'artifacts/menu/blender'
random.seed(251026)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'quiet-home-workshop-review.blend'))
scene=bpy.context.scene
scene.frame_set(1)

def empty(name,loc=(0,0,0),parent=None):
    ob=bpy.data.objects.new(name,None);scene.collection.objects.link(ob)
    ob.location=loc;ob.parent=parent
    return ob

def mesh_object(name,verts,faces,material):
    mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);scene.collection.objects.link(ob)
    if material:mesh.materials.append(material)
    return ob

def box(name,loc,dim,m,bevel=.02,parent=None):
    x,y,z=[v/2 for v in dim]
    verts=[(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)]
    ob=mesh_object(name,verts,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],m)
    ob.location=loc;ob.parent=parent
    if bevel:
        mod=ob.modifiers.new('Time softened edges','BEVEL');mod.width=bevel;mod.segments=2
        ob.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    return ob

def curve(name,pts,r,m,parent=None):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=8
    data.bevel_depth=r;data.bevel_resolution=2
    sp=data.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);data.materials.append(m);ob.parent=parent
    return ob

def beam(name,a,b,w,d,m,parent=None):
    a,b=Vector(a),Vector(b)
    ob=box(name,(a+b)/2,(w,d,(b-a).length),m,min(w*.15,.035),parent)
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return ob

def cylinder(name,loc,r,depth,m,parent=None):
    count=20
    verts=[(r*math.cos(i*math.tau/count),r*math.sin(i*math.tau/count),z) for z in [-depth/2,depth/2] for i in range(count)]
    faces=[tuple(reversed(range(count))),tuple(range(count,2*count))]
    faces +=[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    ob=mesh_object(name,verts,faces,m);ob.location=loc;ob.parent=parent
    for p in ob.data.polygons:p.use_smooth=len(p.vertices)==4
    mod=ob.modifiers.new('Worn rim','BEVEL');mod.width=min(r*.08,.015);mod.segments=2
    return ob

def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

def light(name,loc,power,color,size,target,kind='AREA'):
    data=bpy.data.lights.new(name,kind);data.energy=power;data.color=color
    if kind=='AREA':data.shape='DISK';data.size=size
    if kind=='SPOT':data.spot_size=size;data.spot_blend=.38;data.shadow_soft_size=.10
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;aim(ob,target)
    return ob

def simple(name,color,rough=.7,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m

def weathered(name,dark,light_color,scale=2,wood=False):
    m=simple(name,dark,.87);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY'
    mapping.inputs[1].default_value=(8,.28,4) if wood else (1,1,1)
    l.new(coord.outputs['Object'],mapping.inputs[0])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=5
    noise.inputs['Roughness'].default_value=.75;l.new(mapping.outputs[0],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.24;ramp.color_ramp.elements[0].color=(*dark,1)
    ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(*light_color,1)
    l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=85;fine.inputs['Detail'].default_value=2
    l.new(mapping.outputs[0],fine.inputs['Vector'])
    b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=.025 if wood else .045
    l.new(noise.outputs['Fac'],b.inputs['Height'])
    bf=n.new('ShaderNodeBump');bf.inputs['Strength'].default_value=.18;bf.inputs['Distance'].default_value=.008
    l.new(fine.outputs['Fac'],bf.inputs['Height']);l.new(b.outputs['Normal'],bf.inputs['Normal']);l.new(bf.outputs['Normal'],p.inputs['Normal'])
    return m

# Preserve the actual completed cottage, its plants, all joinery and table props.
# Only the old room, giant bench, studio lights and non-miniature plant roots change.
discard=('Animated pendant assembly','Bench front apron','Book spine gold rule','Bookcase shelf',
         'Bookcase upright','Broad window sill','Cool evening window fill','Cool roof edge rim',
         'Cottage warm grazing key','Distant soft evening hills','Drawer brass cup pull','Drawer brass screw',
         'Foreground botanical sway','Foreground geranium','Large warm studio softbox','Left wall',
         'Linen bound book','Low warm bounce','Rear wall','Shadow fern','Sunset view','Upper right ivy',
         'Walnut workbench plank','Window hanging pothos','Window horizontal rail','Window oak mullion','Workbench drawer front')
for ob in [o for o in scene.objects if o.parent is None]:
    if ob.name.startswith(discard):
        for child in reversed(list(ob.children_recursive)):bpy.data.objects.remove(child,do_unlink=True)
        bpy.data.objects.remove(ob,do_unlink=True)
table=empty('Old table and preserved miniature',(2.0,.55,2.30))
table.rotation_euler=(.012,-.019,-.045)
preserved=[]
for ob in list(scene.objects):
    if ob is table or ob.type=='CAMERA' or ob.name=='Cottage focus target' or ob.parent is not None:continue
    preserved.append(ob.name)
    ob.location=(ob.location-Vector((1.55,0,0)))*.58
    ob.scale*=.58;ob.parent=table
    if ob.type=='LIGHT':
        ob.data.animation_data_clear();ob.data.energy=5.3;ob.data.shadow_soft_size=.10

print('PRESERVED_COTTAGE',len(preserved),'root objects',flush=True)
wall=weathered('Abandoned blue grey lime plaster',(.035,.054,.055),(.18,.22,.205),1.8)
leftwall=weathered('Quiet shaded wall',(.018,.028,.030),(.060,.077,.074),1.4)
wood=weathered('Aged silvered oak',(.038,.031,.023),(.17,.145,.10),2.6,True)
for node in wood.node_tree.nodes:
    if node.type=='VECT_MATH':node.inputs[1].default_value=(.28,8,4)
floorwood=weathered('Dusty washed floorboards',(.026,.032,.030),(.13,.12,.09),2.7,True)
paint=weathered('Peeling muted teal paint',(.034,.061,.058),(.17,.23,.20),5)
chalk=weathered('Exposed chalk and old mortar',(.15,.16,.14),(.37,.38,.32),5)
brick=weathered('Damp exposed brick',(.08,.056,.037),(.23,.16,.095),8)
iron=simple('Oxidized iron',(.025,.032,.03),.64,.5)
moss=weathered('Soft moss cushions',(.018,.038,.014),(.095,.16,.045),22)
earth=weathered('Dark earth under broken boards',(.011,.018,.012),(.042,.046,.024),8)

# Room shell with a REAL opening. Light enters between remaining window muntins.
box('Shadow left plaster wall',(-7.8,-1.6,4),(.30,16.0,8.0),leftwall,.04)
box('Back quiet plaster field',(-4.12,4.65,4),(7.45,.32,8),leftwall,.025)
box('Crumbled wall below window',(2.72,4.65,.89),(6.25,.42,1.78),wall,.05)
box('Window right masonry pier',(7.0,4.65,4),(2.5,.42,8),wall,.05)
box('Upper wall over opening',(2.72,4.65,7.62),(6.25,.42,.76),wall,.03)
box('Right return wall',(8.1,.4,4),(.35,8.6,8),wall,.04)
box('Earth beneath flooring',(0,-2.6,-.12),(16,16,.20),earth,.0)
for row in range(35):
    x=-7.65+row*.45
    for j in range(-2,5):
        y=-5.1+j*2.25+(row%3)*.25
        if x>5.3 and y>2.1 and random.random()<.4:continue
        ob=box('Uneven old floorboard',(x,y,.005+random.uniform(-.012,.012)),(.438,2.23,.11),floorwood,.012)
        ob.rotation_euler.z=random.uniform(-.002,.002)
        if x>-.8:
            for end in [-1,1]:
                for dx in [-.13,.13]:
                    cylinder('Old floor nail',(x+dx,y+end*1.02,.065),.012,.005,iron)
# Wall base and lath edges: quiet on left, damage concentrated around the window.
for z in [.15,.30]:box('Old left skirting',(-4.15,4.43,z),(7.2,.10,.11),wood,.014)
for x in [-.42,5.86]:
    box('Aged window jamb',(x,4.36,4.54),(.22,.37,5.64),paint,.035)
box('Deep mossy window sill',(2.72,4.15,1.87),(6.65,.92,.22),chalk,.05)
box('Old window lintel',(2.72,4.34,7.25),(6.65,.38,.20),paint,.025)
for x in [1.1,2.68,4.26]:
    ob=box('Window slender vertical frame',(x,4.36,4.55),(.095,.18,5.35),paint,.014)
    ob.rotation_euler.y=random.uniform(-.006,.006)
for z in [3.7,5.50]:box('Window interrupted cross rail',(2.72,4.34,z),(6.25,.17,.085),paint,.01)
for x in [-6.9,-2.0,3.6,7.4]:box('Exposed overhead rafter',(x,.05,7.65),(.24,9.0,.32),wood,.05)
box('Old cross beam under ceiling',(.1,3.6,7.2),(15.4,.28,.35),wood,.04)

# An irregular patch of exposed brick and broken plaster beside the sill.
for row in range(7):
    for col in range(12):
        x=.0+col*.40+(row%2)*.20;z=.27+row*.20
        if ((x-3.8)/2.0)**2+((z-.70)/.7)**2>1 or random.random()<.08:continue
        box('Exposed weathered masonry',(x,4.405,z),(.375,.09,.175),brick,.022)
for i in range(25):
    x=random.uniform(.2,5.4);z=random.uniform(.2,1.55)
    verts=[(x,4.34,z)]
    for j in range(8):
        a=j*math.tau/8;r=random.uniform(.08,.24)
        verts.append((x+math.cos(a)*r,4.335,z+math.sin(a)*r*.7))
    mesh_object('Flaking plaster edge',verts,[(0,j+1,(j+1)%8+1) for j in range(8)],chalk)
# Thin, branched cracks following stress points, mostly below/right of the window.
for i in range(11):
    x=random.choice([-.65,6.1])+random.uniform(-.1,.1);z=random.uniform(2.0,6.6)
    pts=[(x,4.425,z)]
    for j in range(4):pts.append((x+random.uniform(-.15,.15),4.425,z-.2*(j+1)))
    curve('Hairline plaster fissure',pts,.006,earth)

glass=simple('Remaining dusty window glass',(.42,.56,.55),.24)
gp=glass.node_tree.nodes.get('Principled BSDF');gp.inputs['Transmission Weight'].default_value=.92;gp.inputs['IOR'].default_value=1.45
for col in range(4):
    for row in range(3):
        if (col,row) in [(0,0),(1,1),(1,2),(2,0),(3,1)]:continue
        x=-.31+col*1.56;z=2.02+row*1.78
        verts=[(x,4.39,z),(x+1.40,4.39,z),(x+1.40,4.39,z+1.55),
               (x+1.03,4.39,z+1.38),(x+.8,4.39,z+1.65),(x+.45,4.39,z+1.4),(x,4.39,z+1.65)]
        ob=mesh_object('Jagged remaining window pane',verts,[tuple(range(7))],glass)
        sol=ob.modifiers.new('Thin old glass','SOLIDIFY');sol.thickness=.008

# Cool, fog-soft garden behind the window; entirely local shader and geometry.
outside=simple('Pale overcast garden',(.18,.27,.28))
nodes=outside.node_tree.nodes;links=outside.node_tree.links;nodes.clear()
out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');em.inputs[1].default_value=.32
co=nodes.new('ShaderNodeTexCoord');sep=nodes.new('ShaderNodeSeparateXYZ');ramp=nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=(.045,.10,.09,1);ramp.color_ramp.elements[1].color=(.34,.44,.48,1)
links.new(co.outputs['Generated'],sep.inputs[0]);links.new(sep.outputs['Z'],ramp.inputs[0]);links.new(ramp.outputs[0],em.inputs[0]);links.new(em.outputs[0],out.inputs[0])
box('Distant garden atmosphere',(2.8,8.5,5),(15,.06,11),outside,0)
farwood=simple('Soft distant tree bark',(.035,.067,.063),1)
for i in range(9):
    x=-1+i*1.0+random.uniform(-.3,.3)
    curve('Distant slender tree',[(x,7.9,0),(x+.3,7.9,3),(x-.1,7.9,6),(x+.25,7.9,9)],random.uniform(.035,.08),farwood)
    for z in [3,5,7]:curve('Distant fine branch',[(x,7.9,z),(x-.5,7.9,z+.5),(x-1.1,7.9,z+.75)],.022,farwood)

# Old table, tilted as a single assembly so the miniature and props stay in contact.
for j in range(7):
    ob=box('Worn tabletop plank',(0,-1.63+j*.54,-.12),(5.65,.525,.24),wood,.045,table)
    ob.rotation_euler.z=random.uniform(-.002,.002)
    for x in [-2.5,2.5]:cylinder('Table top dark nail',(x,-1.63+j*.54,.006),.018,.008,iron,table)
for y in [-1.55,1.55]:box('Old table apron',(0,y,-.42),(5.25,.16,.44),wood,.045,table)
for x in [-2.48,2.48]:box('Table end apron',(x,0,-.42),(.18,3.1,.44),wood,.04,table)
bpy.context.view_layer.update()
for x in [-2.42,2.42]:
    for y in [-1.45,1.45]:
        top=table.matrix_world@Vector((x,y,-.28));bottom=Vector((top.x+( .10 if x>0 else -.05),top.y+.07,.08))
        beam('Uneven old table leg',bottom,top,.22,.24,wood)
        if x>0:box('Table foot old repair block',(bottom.x,bottom.y,.07),(.36,.36,.13),wood,.02)
beam('Table lower stretcher',(-.34,1.95,.45),(4.52,1.75,.43),.13,.15,wood)
box('Part open drawer front',(.9,-1.94,-.44),(1.35,.14,.39),wood,.035,table)
box('Open drawer bottom',(.9,-1.70,-.58),(1.25,.8,.06),wood,.015,table)
for x in [.27,1.53]:box('Drawer thin side',(x,-1.70,-.45),(.06,.8,.3),wood,.015,table)
curve('Rusty drawer pull',[(.68,-2.03,-.43),(.9,-2.10,-.48),(1.12,-2.03,-.43)],.022,iron,table)

# A chair has been left away from the table. Original silhouette, no reference props.
chair=empty('Abandoned chair',(-.65,-.85,0));chair.rotation_euler.z=-.26
for i in range(4):box('Chair worn seat slat',(-.46+i*.30,0,1.03),(.285,1.10,.11),wood,.035,chair)
for x in [-.47,.47]:
    for y in [-.45,.45]:beam('Chair leg',(x*1.13,y*1.16,.05),(x,y,1.0),.095,.095,wood,chair)
    beam('Chair back upright',(x,.45,.92),(x,.62,2.25),.095,.095,wood,chair)
for z in [1.5,1.84,2.17]:box('Chair weathered back slat',(0,.54+(z-1.5)*.10,z),(1.02,.085,.18),wood,.045,chair)
beam('Chair front lower rung',(-.5,-.5,.35),(.5,-.5,.35),.06,.06,wood,chair)

# Botanical materials: restrained specular, translucent leaves, subtle central vein.
leafm=[]
for i in range(5):
    m=simple('Wild ivy shade '+str(i),(.025+i*.010,.065+i*.019,.024+i*.007),.57)
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Subsurface Weight'].default_value=.08;p.inputs['Specular IOR Level'].default_value=.25
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=15;tex.inputs['Detail'].default_value=3
    ramp=n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.012+i*.006,.035+i*.012,.010+i*.004,1)
    ramp.color_ramp.elements[1].color=(.06+i*.013,.13+i*.024,.035+i*.009,1)
    l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=.003;b.inputs['Strength'].default_value=.14
    l.new(tex.outputs['Fac'],b.inputs['Height']);l.new(b.outputs['Normal'],p.inputs['Normal'])
    leafm.append(m)
stemmat=simple('Living brown green stems',(.045,.067,.023),.82)
# Gently lobed, cupped ivy blade. Grid gives actual curvature instead of flat planes.
verts=[];faces=[]
for j in range(13):
    t=j/12;w=(math.sin(math.pi*t)**.75)*(.16+.033*math.cos(t*math.pi*5))
    for k in range(7):
        q=k/3-1
        verts.append((q*w,t*.42,.045*math.sin(t*math.pi)*(1-abs(q))-.032*q*q*math.sin(t*math.pi)+.025*t*t))
for j in range(12):
    for k in range(6):
        a=j*7+k;faces.append((a,a+1,a+8,a+7))
master=mesh_object('Wild ivy blade master',verts,faces,leafm[0]);leafmesh=master.data
for p in leafmesh.polygons:p.use_smooth=True
bpy.data.objects.remove(master,do_unlink=True)

def leaf(name,loc,rot,size,parent):
    ob=bpy.data.objects.new(name,leafmesh);scene.collection.objects.link(ob)
    ob.location=loc;ob.rotation_euler=rot;ob.scale=(size,size,size);ob.parent=parent
    ob.material_slots[0].link='OBJECT';ob.material_slots[0].material=random.choice(leafm)
    return ob

def ivy(name,points,density=7,size=1):
    root=empty(name+' future sway root')
    curve(name+' woody vine',points,.012*size,stemmat,root)
    # Staggered alternating leaves and occasional side shoots, never radial fans.
    for a,b in zip(points,points[1:]):
        a,b=Vector(a),Vector(b);delta=b-a
        count=max(2,int(delta.length*density))
        for j in range(count):
            t=(j+.35)/count;pos=a.lerp(b,t)
            pos+=Vector((random.uniform(-.05,.05),random.uniform(-.055,.055),random.uniform(-.025,.025)))
            s=size*random.uniform(.65,1.20)
            rot=(random.uniform(.7,1.9),random.uniform(-.5,.5),random.uniform(-math.pi,math.pi))
            ob=leaf(name+' individual leaf',pos,rot,s,root)
            if j%3==0:
                off=Vector((random.uniform(-.22,.22),random.uniform(-.13,.13),-.12))
                curve(name+' petiole',[pos,pos+off*.6,pos+off],.005,stemmat,root)
                leaf(name+' side leaf',pos+off,(rot[0]+.3,rot[1]-.2,rot[2]+2.1),s*.86,root)
    root['animation_note']='Root prepared for low-amplitude wind; still review only.'
    return root

# Vines originate in open wall/ceiling joints, outlining the window and upper right.
for i in range(15):
    x=-.55+i*.45;length=random.uniform(1.0,3.1)
    ivy('Window hanging vine',[(x,4.05,7.3),(x+.18,3.85,6.8),(x-.08,3.78,7.0-length*.55),
                              (x+.16,3.73,7.0-length)],8,random.uniform(.7,1.1))
for i in range(10):
    x=random.uniform(5.7,7.8)
    ivy('Right wall climbing vine',[(x,4.15,.3),(x-.25,4.08,1.6),(x+.1,4.0,3.2),(x-.3,4.08,4.8),(x-.05,4.0,6.8)],9,1.0)
for i in range(8):
    x=random.uniform(-.4,5.5)
    ivy('Sill trailing ivy',[(x,4.0,2.12),(x+.20,3.75,1.9),(x+.35,3.64,1.25),(x+.15,3.56,.65)],8,.85)
for i in range(5):
    y=random.uniform(1.5,3.8)
    ivy('Ceiling greenery',[(7.7,y,7.3),(5.4,y-.1,7.2),(3.1,y-.25,7.30),(.8,y-.25,7.1)],8,1.0)
# Soft leafy garden masses behind the glass break up the thin tree silhouettes.
for i in range(720):
    cluster=i%12
    cx=-1.0+(cluster%6)*1.6;cz=3.6+(cluster//6)*3.0
    loc=(cx+random.uniform(-.8,.8),7.35+random.uniform(-.25,.35),cz+random.uniform(-1.0,1.2))
    ob=leaf('Distant garden foliage',loc,(random.uniform(.5,2),random.uniform(-1,1),random.uniform(-math.pi,math.pi)),random.uniform(.7,1.6),None)
# The left title region stays clear; only a small lower-corner plant silhouettes it.

def fern(name,loc,size=1):
    root=empty(name,loc)
    for b in range(9):
        a=b*math.tau/9+random.uniform(-.2,.2);length=random.uniform(.75,1.4)*size
        pts=[]
        for j in range(12):
            t=j/11;r=t*.8*length
            pts.append(Vector((math.cos(a)*r,math.sin(a)*r,math.sin(t*2.2)*length)))
        curve(name+' bending frond',pts,.009*size,stemmat,root)
        for j in range(2,12):
            t=j/11
            for side in [-1,1]:
                ob=leaf(name+' slender leaflet',pts[j],(.4,-.3,a+side*1.05),(.65*(1-t)+.16)*size,root)
                ob.scale.x*=.40;ob.scale.y*=1.4
    return root
for loc,size in [((6.3,2.2,.1),1.25),((7.0,.4,.1),1.15),((5.6,3.5,.1),1.0),
                 ((-.8,3.9,.1),.7),((5.1,-1.2,.1),.85),((-5.1,-3.1,.06),.65)]:
    fern('Reclaimed floor fern',loc,size)

# Nature is beginning to reclaim the table itself, while leaving the cottage intact.
ivy('Ivy curling around table leg',[(4.6,1.9,.1),(4.55,1.85,.7),(4.7,1.8,1.4),
                                  (4.55,1.9,2.2),(4.3,1.9,2.4),(3.8,1.95,2.4)],9,.58)
for i in range(5):
    pts=[(6.3,2.8-i*.42,.12),(5.1,1.9-i*.6,.12),(4.1,.7-i*.63,.12),(3.2,-.1-i*.65,.12)]
    curve('Floor seeking woody creeper',pts,.015,stemmat)
    for a,b in zip(pts,pts[1:]):
        for j in range(9):
            pos=Vector(a).lerp(Vector(b),(j+.3)/9)
            pos.y+=random.uniform(-.12,.12)
            leaf('Low floor creeper leaf',pos,(random.uniform(-.2,.2),random.uniform(-.2,.2),random.uniform(-math.pi,math.pi)),random.uniform(.4,.7),None)

# Low moss clusters use linked, irregular stones with tiny clumps rather than spheres.
verts=[(-.8,-.6,0),(.6,-.7,0),(1,.2,0),(.3,.8,0),(-.7,.5,0),(-.5,-.4,.4),(.4,-.3,.55),(.5,.3,.45),(-.3,.4,.6)]
faces=[(0,1,6,5),(1,2,7,6),(2,3,8,7),(3,4,8),(4,0,5,8),(5,6,7,8)]
ob=mesh_object('Moss mesh master',verts,faces,moss);mossmesh=ob.data
for p in mossmesh.polygons:p.use_smooth=True
bpy.data.objects.remove(ob,do_unlink=True)
for i in range(230):
    ob=bpy.data.objects.new('Moss on damp sill' if i<130 else 'Moss in floor cracks',mossmesh);scene.collection.objects.link(ob)
    if i<130:ob.location=(random.uniform(-.4,5.8),random.uniform(3.85,4.35),2.0)
    else:ob.location=(random.uniform(5.1,7.8),random.uniform(-.5,4.2),.07)
    s=random.uniform(.04,.15);ob.scale=(s*1.5,s,s*.7);ob.rotation_euler.z=random.uniform(0,math.tau)

# Scattered fallen leaves and modest debris on the right; no noise behind UI.
dryleaf=simple('Fallen ochre leaves',(.12,.085,.032),.94)
for i in range(75):
    x=random.uniform(-.2,7.5);y=random.uniform(-2.8,4.0)
    ob=leaf('Fallen leaf',(x,y,.071),(0,0,random.uniform(0,math.tau)),random.uniform(.18,.40),None)
    ob.material_slots[0].material=dryleaf
for i in range(38):
    x=random.uniform(5.1,7.8);y=random.uniform(2.4,4.4)
    ob=box('Small fallen plaster fragment',(x,y,.08),(random.uniform(.05,.18),random.uniform(.06,.20),random.uniform(.03,.08)),chalk,.008)
    ob.rotation_euler=(random.uniform(-.1,.1),random.uniform(-.1,.1),random.uniform(0,math.tau))

# A folded, frayed curtain at the opening, left clear of the cottage silhouette.
cloth=simple('Abandoned flax curtain',(.22,.24,.20),.94)
cp=cloth.node_tree.nodes.get('Principled BSDF');cp.inputs['Sheen Weight'].default_value=.22
vs=[];fs=[]
for j in range(22):
    t=j/21
    for k in range(16):
        u=k/15;x=-.35+u*.70+.15*math.sin(t*2.5)
        z=7.12-t*(3.3+.15*math.sin(k*2.7))
        vs.append((x,3.99+.07*math.sin(u*math.pi*8)+.05*math.sin(t*6),z))
for j in range(21):
    for k in range(15):
        if j>17 and k in [3,9,13]:continue
        a=j*16+k;fs.append((a,a+1,a+17,a+16))
ob=mesh_object('Frayed hanging linen curtain',vs,fs,cloth)
for p in ob.data.polygons:p.use_smooth=True

# Light and thin air. No dark horror grade: cool natural fill, warm living miniature.
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.33,.39,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
light('Soft overcast window',(2.9,5.0,6.1),1750,(.63,.79,1),4.1,(1,-1,1.8))
light('Diagonal afternoon shaft',(5.15,5.35,7.35),1500,(.78,.88,1),.78,(-.8,-3.4,.0),'SPOT')
light('Light through missing pane',(4.8,4.02,6.0),1200,(.72,.85,1),.43,(.0,-2.1,.15),'SPOT')
light('Narrow light through upper opening',(1.8,4.02,6.7),1450,(.76,.87,1),.28,(-1.0,-1.1,.10),'SPOT')
light('Soft room reflected light',(1,-4.0,5.5),85,(.50,.68,.77),5,(2,.5,2.5))
light('Miniature warm bounce',(2.3,-1.5,3.8),12,(1,.52,.22),2,(2,.5,3.0))
volume=bpy.data.materials.new('Quiet room thin dusty air');volume.use_nodes=True
n=volume.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');scatter=n.new('ShaderNodeVolumePrincipled')
scatter.inputs['Density'].default_value=.017;scatter.inputs['Color'].default_value=(.63,.72,.74,1)
scatter.inputs['Anisotropy'].default_value=.42;volume.node_tree.links.new(scatter.outputs['Volume'],out.inputs['Volume'])
box('Atmosphere volume',(0,-.5,4),(15.4,11,8),volume,0)
linen=bpy.data.materials['Warm linen behind glass'];p=linen.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Strength'].default_value=4.5;p.inputs['Emission Color'].default_value=(1,.30,.055,1)

camera=scene.camera;camera.location=(9,-18,7.8);aim(camera,(-1.0,.6,2.65));camera.data.lens=45
focus=bpy.data.objects['Cottage focus target'];focus.location=(2,.5,3.55)
camera.data.dof.focus_object=focus;camera.data.dof.use_dof=True;camera.data.dof.aperture_fstop=7.1
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.15
scene.render.engine='CYCLES';scene.cycles.samples=160;scene.cycles.use_denoising=True
scene.cycles.max_bounces=9;scene.cycles.transmission_bounces=6;scene.cycles.volume_bounces=2
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(OUT/'quiet-home-overgrown-review.png')
scene.frame_set(1)
scene['art_direction']='Original Quiet Home: reclaimed quiet room, warm miniature, left menu space.'
scene['source_blend']='quiet-home-workshop-review.blend'
scene['review_stage']='ONE STILL ONLY; wait for artistic approval before animation.'
bpy.context.view_layer.update()
projected=[world_to_camera_view(scene,camera,ob.matrix_world@Vector(v))
           for ob in scene.objects if ob.name.startswith(('Cottage plaster body','Refined roof deck','Miniature oak base'))
           for v in ob.bound_box]
house_bounds=[min(v.x for v in projected),max(v.x for v in projected),
              min(v.y for v in projected),max(v.y for v in projected)]
assert house_bounds[0]>.40, 'Keep the cottage clear of the left menu region'
report={'source_blend':scene['source_blend'],'preserved_root_objects':len(preserved),'objects':len(scene.objects),
        'resolution':[1920,1080],'frames_rendered':[1],'engine':'Cycles','samples':160,
        'animation_rendered':False,'menu_zone':'left ~35%, no baked text','seed':251026,
        'cottage_screen_bounds':house_bounds}
(OUT/'overgrown-review-check.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-home-overgrown-review.blend'))
print('OVERGROWN_SCENE_SAVED',len(scene.objects),flush=True)
if '--preview' in sys.argv:
    scene.render.resolution_percentage=50;scene.cycles.samples=32
    scene.render.filepath=str(PRE/'overgrown-preview.png')
bpy.ops.render.render(write_still=True)
print('OVERGROWN_STILL_COMPLETE',scene.render.filepath,flush=True)
