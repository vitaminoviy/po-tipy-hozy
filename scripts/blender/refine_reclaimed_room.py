"""Quiet Home: material/structural refinement of the EXISTING overgrown room.

Blender 5.2.3 LTS. No external assets or generators. Two still cameras, frame 1.
-- --preview makes two 960x540 studies; default renders two 1920x1080 reviews.
Original overgrown blend is opened, refined and saved under a new versioned name.
"""
import ast
import bpy
import bmesh
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
random.seed(41829)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'quiet-home-overgrown-review.blend'))
scene=bpy.context.scene
scene.frame_set(1)
assert bpy.app.version[:3]==(5,2,3), 'Review authored for Blender 5.2.3 LTS'
tree=ast.parse((ROOT/'scripts/blender/create_overgrown_menu.py').read_text(encoding='utf-8'))
names={'empty','mesh_object','box','curve','beam','cylinder','aim','light','simple','weathered'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'<existing workshop helpers>','exec'))

def remove(ob):bpy.data.objects.remove(ob,do_unlink=True)
def prefix(name):return [o for o in scene.objects if o.name.startswith(name)]
def setmat(ob,m):
    ob.data.materials.clear();ob.data.materials.append(m)

table=bpy.data.objects['Old table and preserved miniature']
wood=bpy.data.materials['Aged silvered oak']
floorwood=bpy.data.materials['Dusty washed floorboards']
iron=bpy.data.materials['Oxidized iron']
chalk=bpy.data.materials['Exposed chalk and old mortar']
earth=bpy.data.materials['Dark earth under broken boards']
brick=bpy.data.materials['Damp exposed brick']

# Multi-scale wood: cross-cut splits, raised fibres and damp desaturated grain.
def age_surface(m,base,dark,scale=5,amount=.6):
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    old=p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
    co=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale
    noise.inputs['Detail'].default_value=5;noise.inputs['Roughness'].default_value=.8
    l.new(co.outputs['Object'],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.28;ramp.color_ramp.elements[0].color=(*dark,1)
    ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(*base,1)
    l.new(noise.outputs['Fac'],ramp.inputs[0])
    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=amount
    if old:l.new(old,mix.inputs[1])
    else:mix.inputs[1].default_value=(*base,1)
    l.new(ramp.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color'])
    rough=n.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.63;rough.inputs['To Max'].default_value=.98
    l.new(noise.outputs['Fac'],rough.inputs[0]);l.new(rough.outputs[0],p.inputs['Roughness'])

age_surface(wood,(.75,.71,.59),(.13,.17,.13),7,.55)
age_surface(floorwood,(.88,.83,.68),(.12,.17,.14),3,.45)

# REAL floor openings: boards are cut away, their end grain has an irregular outline.
# All four table support positions and the chair remain outside the large opening.
holes=[(1.95,-3.48,1.35,1.00),(6.35,2.55,1.35,1.10),(-5.45,2.20,.72,.84)]
def inside_hole(x,y,margin=1):
    return any(((x-cx)/rx)**2+((y-cy)/ry)**2<margin for cx,cy,rx,ry in holes)

def broken_plank(name,x,y0,y1,width,depth,m,parent=None,broken_low=False,broken_high=False,z=.015):
    # End profiles cross the whole plank width; these are true open spaces, not dark decals.
    count=8;verts=[]
    for level in [-depth/2,depth/2]:
        for end,y in enumerate([y0,y1]):
            for i in range(count):
                xx=x-width/2+width*i/(count-1)
                jag=random.uniform(-.12,.12) if ((end==0 and broken_low) or (end==1 and broken_high)) else 0
                verts.append((xx,y+jag,z+level))
    faces=[]
    for i in range(count-1):
        faces.append((i,i+1,count+i+1,count+i))
        faces.append((2*count+i,3*count+i,3*count+i+1,2*count+i+1))
        faces.append((i,2*count+i,2*count+i+1,i+1))
        faces.append((count+i,count+i+1,3*count+i+1,3*count+i))
    faces.extend([(0,count,3*count,2*count),(count-1,2*count-1,4*count-1,3*count-1)])
    ob=mesh_object(name,verts,faces,m);ob.parent=parent
    mod=ob.modifiers.new('Worn splinter edges','BEVEL');mod.width=.009;mod.segments=2
    ob.modifiers.new('Splinter normals','WEIGHTED_NORMAL')
    return ob

cut_boards=0
for ob in prefix('Uneven old floorboard'):
    x,y,z=ob.location;length=2.23;width=.438
    intervals=[(y-length/2,y+length/2,False,False)]
    touched=False
    for cx,cy,rx,ry in holes:
        if abs(x-cx)>=rx:continue
        dy=ry*math.sqrt(1-((x-cx)/rx)**2)
        lo,hi=cy-dy,cy+dy
        remain=[]
        for a,b,bl,bh in intervals:
            if b<=lo or a>=hi:remain.append((a,b,bl,bh));continue
            touched=True
            if lo-a>.18:remain.append((a,lo,bl,True))
            if b-hi>.18:remain.append((hi,b,True,bh))
        intervals=remain
    if touched:
        remove(ob);cut_boards+=1
        for a,b,bl,bh in intervals:
            broken_plank('Splintered floor edge',x,a,b,width,.11,floorwood,broken_low=bl,broken_high=bh,z=z)
for ob in prefix('Old floor nail')+prefix('Fallen leaf')+prefix('Low floor creeper leaf')+prefix('Moss in floor cracks'):
    if inside_hole(ob.location.x,ob.location.y):remove(ob)
bpy.data.objects['Earth beneath flooring'].location.z=-1.12
for y in [-5.7,-3.55,-1.15,1.2,3.6]:
    box('Exposed structural floor joist',(0,y,-.36),(15.4,.19,.40),wood,.025)
for cx,cy,rx,ry in holes:
    for i in range(8):
        x=cx+random.uniform(-rx*.75,rx*.75);y=cy+random.uniform(-ry*.7,ry*.7)
        ob=box('Timber debris below floor',(x,y,-.92),(random.uniform(.10,.25),random.uniform(.35,.8),.07),wood,.015)
        ob.rotation_euler.z=random.uniform(-.8,.8)
for i in range(28):
    x=random.uniform(.6,3.2);y=-3.48+random.choice([-1,1])*random.uniform(.85,1.07)
    curve('Exposed floor wood fibre',[(x,y,.06),(x+.02,y+random.uniform(-.22,.22),.075)],.004,wood)
print('FLOOR_OPENINGS',cut_boards,flush=True)

# Part of the tabletop and apron is genuinely absent. The central cradle is sound.
table_cuts=[(-1.63,-1.22),(-1.09,-1.62),(-.55,-1.92)]
for ob in prefix('Worn tabletop plank'):
    if ob.location.y>-.5:continue
    y=ob.location.y;cut=next(c for row,c in table_cuts if abs(y-row)<.04)
    # Construct in the existing table's local coordinates, with a jagged left end.
    xhi=2.825;verts=[];N=8
    for z in [-.24,0]:
        for end,x in enumerate([cut,xhi]):
            for i in range(N):
                yy=y-.2625+i*.525/(N-1)
                xx=x+(random.uniform(-.12,.10) if end==0 else 0)
                verts.append((xx,yy,z))
    faces=[]
    for i in range(N-1):
        faces.extend([(i,N+i,N+i+1,i+1),(2*N+i,2*N+i+1,3*N+i+1,3*N+i),
                      (i,i+1,2*N+i+1,2*N+i),(N+i,3*N+i,3*N+i+1,N+i+1)])
    faces.extend([(0,2*N,3*N,N),(N-1,2*N-1,4*N-1,3*N-1)])
    remove(ob);p=mesh_object('Broken tabletop with exposed end grain',verts,faces,wood);p.parent=table
    b=p.modifiers.new('Blunted broken edge','BEVEL');b.width=.012;b.segments=2
for ob in prefix('Table top dark nail'):
    if ob.location.x<-1.9 and ob.location.y<-.5:remove(ob)
for ob in prefix('Old table apron'):
    if ob.location.y<0:
        remove(ob);beam('Broken front apron',(-1.20,-1.55,-.42),(2.62,-1.55,-.42),.44,.16,wood,table)
for ob in prefix('Table end apron'):
    if ob.location.x<0:
        remove(ob);box('Remaining left end apron',(-2.48,.58,-.42),(.18,1.94,.44),wood,.035,table)
for ob in prefix('Uneven old table leg'):
    if ob.location.x<0 and ob.location.y<0:
        remove(ob)
        fallen=box('Fallen broken table leg',(-.25,-2.25,.15),(.21,1.43,.22),wood,.025)
        fallen.rotation_euler.z=.35
bpy.context.view_layer.update()
support_top=table.matrix_world@Vector((-1.35,-1.14,-.24))
support_bottom=Vector((support_top.x-.15,support_top.y+.12,.06))
beam('Solid old timber support below miniature',support_bottom,support_top,.19,.19,wood)
for x in [-1.36,1.42]:box('Sound miniature support bearer',(x,0,-.33),(.17,2.85,.18),wood,.025,table)
beam('Old diagonal table brace',(-1.35,-1.14,-.45),(.05,-1.14,-1.65),.10,.12,wood,table)
for i in range(22):
    y=random.uniform(-1.85,-.4);cut=-1.22 if y<-1.36 else -1.62 if y<-.82 else -1.92
    curve('Table exposed pale wood fibre',[(cut,y,-.05),(cut-random.uniform(.05,.20),y+.015,-.08)],.005,chalk,table)

# A very restrained material patina on the original miniature. Its geometry survives.
def chipped_paint(m,amount=.45):
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    old=p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
    base=p.inputs['Base Color'].default_value[:]
    geo=n.new('ShaderNodeNewGeometry');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=42;tex.inputs['Detail'].default_value=3
    l.new(geo.outputs['Position'],tex.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.66;ramp.color_ramp.elements[0].color=(0,0,0,1)
    ramp.color_ramp.elements[1].position=.77;ramp.color_ramp.elements[1].color=(amount,amount,amount,1)
    l.new(tex.outputs['Fac'],ramp.inputs[0]);mix=n.new('ShaderNodeMixRGB')
    l.new(ramp.outputs[0],mix.inputs[0]);mix.inputs[2].default_value=(.16,.105,.055,1)
    if old:l.new(old,mix.inputs[1])
    else:mix.inputs[1].default_value=base
    l.new(mix.outputs[0],p.inputs['Base Color'])
    p.inputs['Roughness'].default_value=.76
for name in ['Painted ivory joinery','Sage painted door','Warm lime plaster']:
    chipped_paint(bpy.data.materials[name],.42 if name!='Warm lime plaster' else .27)
slates=sorted([o for o in prefix('Refined individual slate') if o.location.x>.6 and o.location.y<-.5],key=lambda o:o.location.x,reverse=True)
for i,ob in enumerate(slates[:4]):
    ob.rotation_euler.z+=(-1 if i%2 else 1)*.022;ob.location.z-=.004
    if i<2:
        for v in ob.data.vertices:
            if v.co.x>0 and v.co.y<0:v.co.x-=.065
louvers=prefix('Shutter angled louver')
for ob in random.sample(louvers,5):ob.rotation_euler.x+=random.uniform(-.07,.07)
for ob in prefix('Porch spindle'):
    if ob.location.x<0 and ob.location.y<-.55:
        ob.rotation_euler.y+=.035;break
print('COTTAGE_LIGHT_PATINA_COMPLETE',flush=True)

# Left side gains readable plaster and a shadowed adjoining room, not a black void.
wall=weathered('Layered damp blue grey plaster',(.042,.058,.053),(.17,.195,.16),1.15)
plaster_inner=weathered('Exposed old plaster undercoat',(.09,.105,.095),(.23,.23,.19),6)
peel=weathered('Faded paint flakes',(.12,.145,.13),(.31,.33,.27),5)
paint=bpy.data.materials['Peeling muted teal paint']
for ob in prefix('Shadow left plaster wall'):setmat(ob,wall)
for ob in prefix('Back quiet plaster field'):remove(ob)
box('Quiet rear wall left of doorway',(-5.375,4.65,4),(4.95,.32,8),wall,.02)
box('Narrow wall right of doorway',(-.85,4.65,4),(.9,.32,8),wall,.025)
box('Wall over dark adjoining doorway',(-2.1,4.65,6.4),(1.6,.32,3.2),wall,.02)
for x in [-2.95,-1.25]:box('Worn doorway upright',(x,4.40,2.42),(.15,.24,4.84),paint,.03)
box('Worn doorway header',(-2.1,4.40,4.87),(1.88,.24,.17),paint,.03)
box('Adjoining room far wall',(-2.0,10,3),(5,.25,6),wall,.02)
box('Adjoining room shadow side',(-4.3,7.4,3),(.25,5,6),wall,.02)
box('Adjoining room dusty floor',(-2.1,7.4,-.04),(4.4,5.5,.10),floorwood,.02)
for z in [1.0,3.6]:box('Old door hinge remains',(-2.85,4.23,z),(.08,.05,.22),iron,.008)
light('Quiet adjoining room fill',(-2.1,8.8,4.4),35,(.58,.73,.77),2.5,(-2.1,4.0,1.1))
light('Soft bounced light on left wall',(-3.0,-1.8,4.4),90,(.60,.72,.73),4.5,(-7.5,2.0,3.4))
for y in [5.4,6.6,7.8,9.0]:box('Adjoining room floor seam',(-2.1,y,.016),(4.3,.015,.005),wood,0)

def wall_patch(name,cx,cz,rx,rz,m,side=False):
    count=22;vs=[]
    # Real thin flake, raised irregular lip over the older plaster beneath it.
    for level in [0,.006]:
        for i in range(count):
            a=i*math.tau/count;r=random.uniform(.78,1.15)
            u=cx+math.cos(a)*rx*r;v=cz+math.sin(a)*rz*r
            vs.append((-7.635+level,u,v) if side else (u,4.474-level,v))
    fs=[tuple(reversed(range(count))),tuple(range(count,2*count))]
    fs +=[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    return mesh_object(name,vs,fs,m)
for cx,cz,rx,rz in [(-5.6,.80,1.3,.6),(-4.2,1.35,.95,.65),(-3.4,5.7,.56,.70),(-6.8,4.2,.38,1.2)]:
    wall_patch('Irregular exposed plaster layer',cx,cz,rx,rz,plaster_inner)
    for j in range(5):
        a=random.uniform(0,math.tau)
        wall_patch('Curling broken paint edge',cx+math.cos(a)*rx*.9,cz+math.sin(a)*rz*.9,.10,.12,peel)
for y,z in [(2.2,1.4),(-.2,.65),(3.4,4.4)]:wall_patch('Left wall worn paint island',y,z,.9,.65,plaster_inner,True)
for i in range(8):
    x=random.uniform(-7.0,-3.3);z=random.uniform(.5,4.2)
    pts=[(x,4.467,z)]
    for j in range(1,7):
        x+=random.uniform(-.06,.09);pts.append((x,4.467,z-j*.16))
    curve('Fine branching plaster crack',pts,.0018,earth)
    p=Vector(pts[3]);curve('Secondary plaster crack',[p,p+Vector((.17,0,-.12)),p+Vector((.28,0,-.15))],.0012,earth)
for ob in scene.objects:
    if ob.type=='CURVE' and ('crack' in ob.name.lower() or 'fissure' in ob.name.lower()):
        for spline in ob.data.splines:
            for point in spline.bezier_points:point.handle_left_type=point.handle_right_type='VECTOR'
# Dampness shader anchored to the real height above the floor, broken up by noise.
n=wall.node_tree.nodes;l=wall.node_tree.links;p=n.get('Principled BSDF');old=p.inputs['Base Color'].links[0].from_socket
geo=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');l.new(geo.outputs['Position'],sep.inputs[0])
height=n.new('ShaderNodeMapRange');height.clamp=True;height.inputs['From Min'].default_value=.1;height.inputs['From Max'].default_value=2.3
height.inputs['To Min'].default_value=.75;height.inputs['To Max'].default_value=0;l.new(sep.outputs['Z'],height.inputs[0])
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.1;noise.inputs['Detail'].default_value=5;l.new(geo.outputs['Position'],noise.inputs['Vector'])
mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';l.new(height.outputs[0],mult.inputs[0]);l.new(noise.outputs['Fac'],mult.inputs[1])
mix=n.new('ShaderNodeMixRGB');l.new(mult.outputs[0],mix.inputs[0]);l.new(old,mix.inputs[1]);mix.inputs[2].default_value=(.025,.05,.029,1);l.new(mix.outputs[0],p.inputs['Base Color'])

# New smooth leaf blades with UV midrib and side veins, varied size and translucency.
def blade_mesh(name,kind):
    vs=[];fs=[];uv=[];rows=25;cols=9
    for j in range(rows):
        t=j/(rows-1)
        if kind=='ivy':w=.15*math.sin(math.pi*t)**.75*(1+.16*math.cos(t*math.pi*5))
        elif kind=='seedling':w=.13*math.sin(math.pi*t)**.8
        else:w=.060*math.sin(math.pi*t)**.65
        for k in range(cols):
            u=k/(cols-1);q=2*u-1
            vs.append((q*w,t*(.42 if kind!='fern' else .30),.028*math.sin(math.pi*t)*(1-abs(q))-.012*q*q+.024*t*t))
            uv.append((u,t))
    for j in range(rows-1):
        for k in range(cols-1):
            a=j*cols+k;fs.append((a,a+1,a+cols+1,a+cols))
    ob=mesh_object(name,vs,fs,None);mesh=ob.data;layer=mesh.uv_layers.new(name='Botanical UV')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:layer.data[li].uv=uv[mesh.loops[li].vertex_index]
    remove(ob);return mesh

leafm=[]
for i in range(5):
    m=simple('Living translucent leaf '+str(i),(.027+i*.008,.068+i*.016,.019+i*.005),.50)
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');p.inputs['Specular IOR Level'].default_value=.25
    p.inputs['Subsurface Weight'].default_value=.045
    co=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(co.outputs['UV'],sep.inputs[0])
    sub=n.new('ShaderNodeMath');sub.operation='SUBTRACT';sub.inputs[1].default_value=.5;l.new(sep.outputs['X'],sub.inputs[0])
    ab=n.new('ShaderNodeMath');ab.operation='ABSOLUTE';l.new(sub.outputs[0],ab.inputs[0])
    center=n.new('ShaderNodeMath');center.operation='LESS_THAN';center.inputs[1].default_value=.018;l.new(ab.outputs[0],center.inputs[0])
    slope=n.new('ShaderNodeMath');slope.operation='MULTIPLY';slope.inputs[1].default_value=2.6;l.new(ab.outputs[0],slope.inputs[0])
    freq=n.new('ShaderNodeMath');freq.operation='MULTIPLY';freq.inputs[1].default_value=7;l.new(sep.outputs['Y'],freq.inputs[0])
    add=n.new('ShaderNodeMath');add.operation='ADD';l.new(slope.outputs[0],add.inputs[0]);l.new(freq.outputs[0],add.inputs[1])
    fract=n.new('ShaderNodeMath');fract.operation='FRACT';l.new(add.outputs[0],fract.inputs[0])
    side=n.new('ShaderNodeMath');side.operation='LESS_THAN';side.inputs[1].default_value=.032;l.new(fract.outputs[0],side.inputs[0])
    mx=n.new('ShaderNodeMath');mx.operation='MAXIMUM';l.new(center.outputs[0],mx.inputs[0]);l.new(side.outputs[0],mx.inputs[1])
    color=n.new('ShaderNodeMixRGB');color.inputs[1].default_value=(.027+i*.008,.068+i*.016,.019+i*.005,1)
    color.inputs[2].default_value=(.085+i*.008,.13+i*.016,.034+i*.005,1);l.new(mx.outputs[0],color.inputs[0]);l.new(color.outputs[0],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.001
    l.new(mx.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    trans=n.new('ShaderNodeBsdfTranslucent');l.new(color.outputs[0],trans.inputs['Color'])
    sh=n.new('ShaderNodeMixShader');sh.inputs[0].default_value=.16;l.new(p.outputs[0],sh.inputs[1]);l.new(trans.outputs[0],sh.inputs[2])
    l.new(sh.outputs[0],n.get('Material Output').inputs['Surface'])
    leafm.append(m)
ivy_mesh=blade_mesh('Refined ivy blade','ivy');seed_mesh=blade_mesh('Broad understory blade','seedling');fern_mesh=blade_mesh('Fine fern pinna','fern')
for mesh in [ivy_mesh,seed_mesh,fern_mesh]:mesh.materials.append(leafm[0])
replaced_leaves=0
for ob in list(scene.objects):
    if ob.type=='MESH' and ob.data.name=='Wild ivy blade master mesh':
        ob.data=fern_mesh if 'slender leaflet' in ob.name else ivy_mesh
        ob.material_slots[0].link='OBJECT';ob.material_slots[0].material=random.choice(leafm)
        ob.scale*=random.uniform(.70,1.02);ob.rotation_euler.y+=random.uniform(-.18,.18);replaced_leaves+=1

stem=bpy.data.materials['Living brown green stems']
def newleaf(name,loc,rot,size,parent,mesh=ivy_mesh):
    ob=bpy.data.objects.new(name,mesh);scene.collection.objects.link(ob);ob.parent=parent;ob.location=loc;ob.rotation_euler=rot;ob.scale=(size,)*3
    ob.material_slots[0].link='OBJECT';ob.material_slots[0].material=random.choice(leafm)
    return ob

def root_plant(name,loc,size=1,fern=False):
    root=empty(name,loc);root['future_motion']='Gentle stem motion after still approval'
    for b in range(12 if fern else 8):
        a=random.uniform(0,math.tau);length=random.uniform(.55,1.20)*size
        pts=[]
        for j in range(13):
            t=j/12;r=t*length*.8
            pts.append(Vector((math.cos(a)*r,math.sin(a)*r,math.sin(t*2.1)*length)))
        curve(name+' rooted stem',pts,.007*size,stem,root)
        for j in range(2,13):
            t=j/12
            if fern:
                for s in [-1,1]:
                    o=newleaf(name+' fine pinna',pts[j],(.15,-.18,a+s*1.15),(.72*(1-t)+.14)*size,root,fern_mesh)
                    o.scale.y*=1.35
            elif j%2==0:
                newleaf(name+' broad leaf',pts[j],(random.uniform(-.4,.3),-.3,a+(1 if j%4 else -1)*1.2),random.uniform(.55,1)*size,root,seed_mesh)
    return root

for loc,size,fern in [((5.3,1.15,.09),1.0,True),((6.5,-1.5,.08),1.25,True),
                      ((4.8,-2.4,.09),.95,False),((3.1,-4.18,-.15),.65,True),
                      ((.8,-3.65,-.2),.45,False),((-4.9,2.1,-.1),.6,True),
                      ((-2.8,4.10,.08),.8,False),((-6.6,3.7,.08),.75,True),
                      ((5.8,3.5,.09),1.25,False),((6.4,3.9,.08),1.3,True)]:
    root_plant('Naturally rooted understory',loc,size,fern)
# Roots follow joints, emerge at broken floor edges, and grip the wall base.
for i in range(17):
    x=random.uniform(4.6,7.4);y=random.uniform(.6,4.0)
    pts=[(x,y,.075),(x-.6,y-.2,.07),(x-1.05,y-.5,.072),(x-1.5,y-.65,.06)]
    curve('Exposed searching root',pts,random.uniform(.009,.022),stem)
for i in range(8):
    y=3.0+i*.19
    curve('Roots in damp wall joint',[(-7.5,y,.12),(-7.4,y-.5,.10),(-7.2,y-.8,.07),(-6.8,y-1.1,.07)],.017,stem)
for i in range(6):
    root=empty('Ivy reclaiming doorway joint')
    x=-3.02+random.uniform(-.10,.10);length=random.uniform(1.5,3.7)
    pts=[(x+.10*math.sin(j*.8+i),4.24,.10+j*length/10) for j in range(11)]
    curve('Doorway rooted vine',pts,.009,stem,root)
    for a,b in zip(pts,pts[1:]):
        for j in range(3):
            pos=Vector(a).lerp(Vector(b),(j+.3)/3)
            newleaf('Doorway small climbing leaf',pos,(1.25,random.uniform(-.5,.5),random.uniform(-math.pi,math.pi)),random.uniform(.35,.65),root)

# Replace polygonal moss lumps with instanced filament cushions, then extend wet colonies.
mossm=[simple('Moss filament '+str(i),(.024+i*.013,.050+i*.025,.009+i*.005),.96) for i in range(3)]
verts=[];faces=[];indices=[]
for j in range(65):
    a=random.uniform(0,math.tau);r=math.sqrt(random.random())*.85;x=math.cos(a)*r;y=math.sin(a)*r
    h=random.uniform(.18,.48)*(1-r*.4);w=random.uniform(.025,.05);idx=len(verts)
    verts.extend([(x-w,y,0),(x+w,y,0),(x+.025,y,h),(x,y-w,0),(x,y+w,0),(x+.025,y,h)])
    faces.extend([(idx,idx+1,idx+2),(idx+3,idx+4,idx+5)]);indices.extend([j%3,j%3])
ob=mesh_object('Filament moss cushion master',verts,faces,mossm[0]);mossmesh=ob.data
for m in mossm[1:]:mossmesh.materials.append(m)
for p,idx in zip(mossmesh.polygons,indices):p.material_index=idx
remove(ob)
for ob in list(scene.objects):
    if ob.name.startswith(('Moss on damp sill','Moss in floor cracks')):ob.data=mossmesh;ob.scale.z*=2.0
for i in range(510):
    if i<240:
        x=random.uniform(4.6,7.7);y=random.uniform(-2.2,4.2);z=.075
        if inside_hole(x,y):continue
    elif i<400:
        x=random.uniform(-7.6,-3.4);y=random.uniform(4.0,4.43);z=.075
    else:
        a=random.uniform(0,math.tau);x=1.95+math.cos(a)*random.uniform(1.32,1.53);y=-3.48+math.sin(a)*random.uniform(.96,1.15);z=.07
        if inside_hole(x,y,.95):continue
    ob=bpy.data.objects.new('Natural moss colony',mossmesh);scene.collection.objects.link(ob);ob.location=(x,y,z)
    s=random.uniform(.045,.15);ob.scale=(s*1.3,s,s);ob.rotation_euler.z=random.uniform(0,math.tau)

# Small plaster rubble around actual damage; quiet central walking space is retained.
for i in range(52):
    x=random.uniform(-6.9,-3.3);y=random.uniform(3.8,4.4)
    ob=box('Fallen wall plaster chip',(x,y,.08),(random.uniform(.04,.20),random.uniform(.05,.22),random.uniform(.02,.055)),plaster_inner,.005)
    ob.rotation_euler=(random.uniform(-.15,.15),random.uniform(-.15,.15),random.uniform(0,math.tau))

# Motivated cool side light with a warmer miniature. Left retains texture and depth.
bpy.data.objects['Soft overcast window'].data.energy=1250
bpy.data.objects['Soft room reflected light'].data.energy=130
bpy.data.objects['Miniature warm bounce'].data.energy=9
for name in ['Narrow light through upper opening','Light through missing pane','Diagonal afternoon shaft']:
    bpy.data.objects[name].data.energy=0
light('Soft diagonal window beam',(.85,3.88,5.25),2100,(.80,.89,1),.38,(-2.1,-2.2,.15),'SPOT')
light('Window beam along floor',(4.9,3.95,5.9),1550,(.70,.83,1),.45,(2.5,-3.7,-.2),'SPOT')
air=bpy.data.materials['Quiet room thin dusty air'].node_tree.nodes.get('Principled Volume')
air.inputs['Density'].default_value=.011;air.inputs['Anisotropy'].default_value=.22
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.22
scene.view_settings.exposure=.35
scene.view_settings.view_transform='AgX'
scene.cycles.samples=192;scene.cycles.use_denoising=True;scene.cycles.max_bounces=10;scene.cycles.volume_bounces=2
scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.025;scene.cycles.adaptive_min_samples=16
scene.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'

# The inherited fast-box helper used inward winding. Repair closed solid meshes,
# including the volume boundary; do not touch open leaves, cloth or glazing sheets.
seen=set();repaired_normals=0
for ob in scene.objects:
    if ob.type!='MESH' or ob.data in seen:continue
    seen.add(ob.data);bm=bmesh.new();bm.from_mesh(ob.data)
    if bm.faces and all(e.is_manifold for e in bm.edges) and bm.calc_volume(signed=True)<-.0000001:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);ob.data.update();repaired_normals+=1
    bm.free()
print('CLOSED_MESH_WINDING_REPAIRED',repaired_normals,flush=True)

# Two nearby authored cameras. Neither is a full animation or a change to the game UI.
cameraA=scene.camera;cameraA.name='Quiet Home review A - room and warmth'
cameraA.location=(8.6,-17.6,7.15);aim(cameraA,(-.95,.35,2.00));cameraA.data.lens=44
cameraA.data.dof.aperture_fstop=7.1
cameraB=cameraA.copy();cameraB.data=cameraA.data.copy();scene.collection.objects.link(cameraB)
cameraB.name='Quiet Home review B - floor and history';cameraB.location=(6.1,-18.7,8.45);aim(cameraB,(-.65,.25,1.95));cameraB.data.lens=45
cameraB.data.dof.aperture_fstop=7.1
scene.frame_set(1);bpy.context.view_layer.update()
def screen_bounds(camera):
    pts=[world_to_camera_view(scene,camera,o.matrix_world@Vector(v)) for o in scene.objects
         if o.name.startswith(('Cottage plaster body','Refined roof deck','Miniature oak base')) for v in o.bound_box]
    return [min(v.x for v in pts),max(v.x for v in pts),min(v.y for v in pts),max(v.y for v in pts)]
bounds={c.name:screen_bounds(c) for c in [cameraA,cameraB]}
assert all(b[0]>.4 for b in bounds.values()),bounds
report={'source_blend':'quiet-home-overgrown-review.blend','blender':bpy.app.version_string,'objects':len(scene.objects),
        'frame':1,'animation_rendered':False,'resolution':[1920,1080],'max_samples':192,'adaptive_threshold':.025,
        'floor_openings':holes,'cut_original_boards':cut_boards,'replaced_leaf_meshes':replaced_leaves,
        'closed_mesh_winding_repairs':repaired_normals,
        'cameras':bounds,'table_support':'Sound central bearers and replacement timber support; left corner absent.'}
(OUT/'reclaimed-review-check.json').write_text(json.dumps(report,indent=2))
scene['source_blend']='quiet-home-overgrown-review.blend'
scene['art_direction']='Quiet Home: realistic reclaimed room, structural damage, living warmth.'
scene['review_stage']='Two static camera reviews only. Await artistic approval.'
scene.camera=cameraA;scene.render.filepath=str(OUT/'quiet-home-reclaimed-A.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-home-reclaimed-review.blend'))
print('RECLAIMED_SCENE_SAVED',report,flush=True)
preview='--preview' in sys.argv
if preview:scene.render.resolution_percentage=50;scene.cycles.samples=32
for label,camera in [('A',cameraA),('B',cameraB)]:
    scene.camera=camera
    scene.render.filepath=str((PRE if preview else OUT)/('reclaimed-preview-'+label+'.png' if preview else 'quiet-home-reclaimed-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
    print('RECLAIMED_STILL_COMPLETE',label,flush=True)
