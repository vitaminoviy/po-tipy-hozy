"""Original Quiet Home menu workshop. Blender 5.2; deterministic, local assets only.
Run: blender -b -t 8 --python scripts/blender/create_menu_workshop.py -- --draft
Animation: open saved .blend and render frames 1..240 (frame 241 equals frame 1).
"""
import bpy, math, random, sys, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/menu/blender'; PRE=ROOT/'artifacts/menu/blender'
OUT.mkdir(parents=True,exist_ok=True); PRE.mkdir(parents=True,exist_ok=True)
random.seed(214)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.eevee.taa_render_samples=32
scene.eevee.use_raytracing=True
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.fps=24;scene.frame_start=1;scene.frame_end=240
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=-.5
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.23,.32,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.12

def mat(name,color,rough=.6,metal=0,wood=False,noise=False,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes; l=m.node_tree.links;p=n.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emit: p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 if wood or noise:
  tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3 if wood else 90;tex.inputs['Detail'].default_value=3
  co=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1,35,5) if wood else (1,1,1)
  l.new(co.outputs['Generated'],mapping.inputs[0]);l.new(mapping.outputs[0],tex.inputs['Vector'])
  ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[1].position=.8
  ramp.color_ramp.elements[0].color=(*(v*.62 for v in color),1);ramp.color_ramp.elements[1].color=(*(min(v*1.16,1) for v in color),1)
  l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
  bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22 if wood else .13;bump.inputs['Distance'].default_value=.035 if wood else .018
  l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
 return m
wood=mat('Oiled walnut - long grain',(.21,.105,.048),.38,wood=True)
edge=mat('End grain honey oak',(.36,.21,.105),.5,wood=True)
cream=mat('Warm lime plaster',(.58,.49,.35),.92,noise=True)
trim=mat('Painted ivory joinery',(.69,.61,.44),.55,noise=True)
sage=mat('Sage painted door',(.12,.23,.19),.65,noise=True)
roof=[mat('Weathered slate '+str(i),(.065+i*.012,.105+i*.013,.12+i*.014),.75,noise=True) for i in range(4)]
brick=mat('Terracotta chimney',(.24,.105,.055),.9,noise=True)
stone=mat('Sandstone plinth',(.35,.32,.25),.85,noise=True)
brass=mat('Brushed antique brass',(.49,.3,.105),.35,.7)
soil=mat('Dark potting soil',(.04,.025,.014),1,noise=True)
potmat=mat('Ceramic celadon',(.2,.29,.23),.25)
leafm=[mat('Ivy jade '+str(i),(.035+i*.019,.10+i*.022,.045+i*.012),.48,noise=True) for i in range(4)]
vein=mat('Leaf veins',(.15,.21,.075),.7)
flower=mat('Dried blush petals',(.45,.22,.24),.9)
paper=mat('Ivory paper',(.65,.57,.40),.95,noise=True)
glass=mat('Warm linen behind glass',(1,.42,.075),.55,emit=4)
black=mat('Iron patina',(.035,.045,.044),.5,.65)

def assign(o,name,material):
 o.name=name;o.data.materials.append(material);return o

def box(name,loc,dim,material,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 assign(o,name,material)
 if bevel:
  b=o.modifiers.new('Soft crafted edges','BEVEL');b.width=bevel;b.segments=3
  o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def sphere(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=loc);o=bpy.context.object;o.scale=scale
 assign(o,name,material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def cylinder(name,loc,r,depth,material,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r if r2 is None else r2,radius2=r,depth=depth,location=loc)
 o=assign(bpy.context.object,name,material)
 b=o.modifiers.new('Rounded lip','BEVEL');b.width=.015;b.segments=3
 for p in o.data.polygons:p.use_smooth=True
 return o

def curve(name,points,r,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=r;c.bevel_resolution=2
 sp=c.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(material);return o

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def light(name,loc,energy,color,size,target=None,kind='AREA'):
 d=bpy.data.lights.new(name,kind);d.energy=energy;d.color=color
 if kind=='AREA':d.shape='DISK';d.size=size
 else:d.shadow_soft_size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
 if target:aim(o,target)
 return o

def periodic(obj,path,index,base,amp,phase=0):
 f=obj.driver_add(path,index) if index is not None else obj.driver_add(path)
 f.driver.expression=f'{base}+{amp}*sin(2*pi*(frame-1)/240+{phase})'

# Workshop table: each broad plank has its own roughened grain.
for i in range(16):box('Walnut workbench plank',(-7.5+i,0,-.22),(.986,14,.4),wood,.045)
box('Bench front apron',(0,-4.7,-.65),(16,.25,.8),edge,.06)
# Rear walls and massive window recess.
wall=mat('Deep petrol workshop walls',(.055,.09,.095),.93,noise=True)
box('Rear wall',(0,4.5,4.2),(22,.35,9),wall)
box('Left wall',(-7.5,0,4.2),(.3,10,9),wall)
# Sunset sky is a proper shader surface behind architectural mullions.
sky=bpy.data.materials.new('Evening gradient beyond workshop');sky.use_nodes=True
n=sky.node_tree.nodes;l=sky.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');co=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');ramp=n.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=(.58,.23,.13,1);ramp.color_ramp.elements[1].color=(.07,.10,.22,1)
l.new(co.outputs['Generated'],sep.inputs[0]);l.new(sep.outputs['Z'],ramp.inputs[0]);l.new(ramp.outputs[0],em.inputs[0]);em.inputs[1].default_value=.65;l.new(em.outputs[0],out.inputs[0])
box('Sunset view',(2.1,4.27,4.3),(9,.04,7.5),sky,0)
for x in [-2.4,.6,3.6,6.6]:box('Window oak mullion',(x,4.04,4.3),(.17,.32,7.8),edge)
for z in [.5,3.7,8.1]:box('Window horizontal rail',(2.1,4.02,z),(9.3,.32,.17),edge)
box('Broad window sill',(2.1,3.8,.55),(9.6,1,.22),edge,.05)
# Distant small roof silhouettes, partially obscured by frosted sunset.
distant=mat('Distant blue town',(.12,.13,.18),1)
for i in range(18):
 x=-2.1+i*.49;h=random.uniform(.7,1.5)
 box('Distant rooftops',(x,4.19,.6+h/2),(.43,.025,h),distant,0)
# Bookcase in the deliberately dim left zone.
for x in [-7,-3.5]:box('Bookcase upright',(x,3,3.4),(.18,1,6.6),wood)
for z in [.2,1.8,3.4,5,6.6]:
 box('Bookcase shelf',(-5.25,3,z),(3.7,1,.16),edge)
 for i in range(9):
  h=random.uniform(.7,1.25);x=-6.75+i*.34
  m=mat('Old book binding',random.choice([(.12,.17,.16),(.22,.12,.08),(.17,.13,.18)]),.85,noise=True)
  box('Linen bound book',(x,2.98,z+.1+h/2),(.26,.72,h),m,.015)
  for dz in [-h*.3,h*.3]:box('Book spine gold rule',(x,2.607,z+.1+h/2+dz),(.22,.01,.018),brass,.002)

# Miniature cottage on an oak presentation tray.
CX=1.55
box('Miniature oak base',(CX,0,.10),(4.8,4,.24),edge,.12)
box('Garden sandstone paving',(CX,0,.24),(4.55,3.75,.12),stone,.07)
box('Cottage plaster body',(CX,.15,1.75),(3.25,2.55,2.9),cream,.045)
# Front and rear gables.
for y in [-1.13,1.43]:
 verts=[(CX-1.625,y,3.2),(CX+1.625,y,3.2),(CX,y,4.65)]
 mesh=bpy.data.meshes.new('Gable mesh');mesh.from_pydata(verts,[],[(0,1,2)]);mesh.update();o=bpy.data.objects.new('Limewashed gable',mesh);scene.collection.objects.link(o);assign(o,o.name,cream)
# Exposed timber edging and horizontal plaster course.
for x in [CX-1.59,CX+1.59]:box('Corner timber',(x,-1.16,1.8),(.12,.14,2.85),edge,.02)
for z in [.4,1.85,3.18]:box('Front timber course',(CX,-1.17,z),(3.35,.15,.12),edge)
# Soft, overlapping slate tiles: each has a curved nose and restrained variation.
angle=math.atan2(1.45,1.625)
for side in [-1,1]:
 o=box('Roof underboarding',(CX+side*.86,.15,3.80),(2.6,3.1,.1),wood);o.rotation_euler[1]=side*angle
 for row in range(10):
  along=.12+row*.245
  for col in range(8):
   x=CX+side*along*math.cos(angle);z=4.69-along*math.sin(angle)
   o=box('Hand laid slate',(x,-1.22+col*.395+(row%2)*.04,z),(.32,.39,.055),roof[(row+col)%4],.035);o.rotation_euler[1]=side*angle
 for y in [-1.44,1.72]:
  o=box('Roof fascia',(CX+side*.87,y,3.94),(2.64,.12,.15),trim);o.rotation_euler[1]=side*angle
for j in range(10):cylinder('Terracotta ridge cap',(CX,-1.36+j*.32,4.68),.10,.31,roof[1]).rotation_euler[0]=math.pi/2
# Chimney with individual brick courses.
for row in range(9):
 for col in range(2):box('Chimney brick',(CX+.84+(col-.5)*.245,.76,4.02+row*.12),(.235,.45,.105),brick,.012)
box('Chimney cap',(CX+.84,.76,5.13),(.66,.65,.13),stone)

def window(x,y,z,w=.82,h=1.05,side=False):
 # Build in local coordinates: front faces toward -Y; side windows rotate as a group.
 objs=[]
 def b(name,p,d,m):
  o=box(name,p,d,m,.014);objs.append(o);return o
 b('Glowing linen window',(0,0,0),(w,.04,h),glass)
 for a in [-1,1]:b('Window frame',(a*w/2,-.055,0),(.065,.11,h+.1),trim)
 for a in [-1,0,1]:b('Window transom',(0,-.062,a*h/2),(w+.08,.12,.055),trim)
 b('Window central mullion',(0,-.075,0),(.045,.13,h),edge)
 b('Projecting stone sill',(0,-.13,-h/2-.07),(w+.23,.35,.09),trim)
 # Small interior shadow shapes behind translucent curtains, visible from menu distance.
 b('Curtain left',(w*-.34,-.04,0),(w*.16,.016,h*.92),paper)
 b('Curtain right',(w*.34,-.04,0),(w*.16,.016,h*.92),paper)
 for o in objs:
  if side:o.location=Vector((x,y,z))+Vector((-o.location.y,o.location.x,o.location.z));o.rotation_euler[2]=math.pi/2
  else:o.location+=Vector((x,y,z))
 L=light('Window spill',(x+.15 if side else x,y if side else y-.20,z),28,(1,.51,.18),.55,kind='POINT');periodic(L.data,'energy',None,28,2.5,x)
for x in [CX-1,CX+1]:
 window(x,-1.19,1.05,.72,.95);window(x,-1.19,2.55,.9,.9)
window(CX+1.65,.12,1.3,1.4,1.55,True)
window(CX+1.65,.12,2.65,.85,.8,True)
box('Sage front door',(CX,-1.21,1),(.65,.13,1.4),sage,.035)
window(CX,-1.3,1.35,.37,.48)
sphere('Brass door handle',(CX+.23,-1.32,.87),(.04,.04,.04),brass)
for i in range(3):box('Front steps',(CX,-1.45-i*.23,.34-i*.075),(.98,.38,.14),stone,.03)
# Round attic window with radial frame.
bpy.ops.mesh.primitive_torus_add(major_radius=.27,minor_radius=.04,major_segments=32,minor_segments=8,location=(CX,-1.17,3.65),rotation=(math.pi/2,0,0));assign(bpy.context.object,'Round attic frame',trim)
cylinder('Round attic glowing glass',(CX,-1.145,3.65),.25,.025,glass).rotation_euler[0]=math.pi/2
box('Attic cross bar',(CX,-1.20,3.65),(.49,.06,.035),trim)
box('Attic upright bar',(CX,-1.20,3.65),(.035,.06,.49),trim)
# Window boxes and delicate blossoms.
for x in [CX-1,CX+1]:
 box('Window flower box',(x,-1.45,1.94),(1.03,.32,.19),wood,.025)
 for j in range(15):
  px=x+random.uniform(-.45,.45);py=-1.45+random.uniform(-.1,.1);pz=2.1+random.uniform(0,.12)
  sphere('Window box foliage',(px,py,pz),(.09,.075,.065),leafm[j%4])
  if j%2==0:
   for a in range(5):sphere('Small blossom petal',(px+.035*math.cos(a*1.256),py+.035*math.sin(a*1.256),pz+.06),(.035,.025,.018),flower)
# Porch pergola: graceful timber curves and railings.
for x in [CX-1.8,CX+1.8]:
 box('Porch post',(x,-1.6,.81),(.07,.08,1.1),trim,.015)
 for z in [.4,.92]:box('Porch handrail',(x,-.2,z),(.06,2.8,.06),trim,.015)
 for y in [-1.4,-1,-.6,-.2,.2,.6,1]:box('Porch spindle',(x,y,.67),(.035,.035,.5),trim,.008)

# Botanical leaf meshes: shaped curvature, pointed ends and a central raised vein.
leafmesh=bpy.data.meshes.new('Curved botanical leaf master')
vs=[];faces=[]
for j in range(11):
 t=j/10
 for k in range(5):
  v=k/2-1;vs.append((v*math.sin(math.pi*t)*.16,t*.44,.06*math.sin(math.pi*t)*(1-v*v)+.04*t*t))
for j in range(10):
 for k in range(4):a=j*5+k;faces.append((a,a+1,a+6,a+5))
leafmesh.from_pydata(vs,[],faces);leafmesh.update()
for p in leafmesh.polygons:p.use_smooth=True
for m in leafm:leafmesh.materials.append(m)

def plant(name,loc,scale=1,hanging=False):
 root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);root.location=loc;root.scale=(scale,)*3
 pot=cylinder(name+' glazed pot',(0,0,0),.29,.4,potmat,.21);pot.parent=root
 lip=cylinder(name+' rim',(0,0,.2),.31,.06,potmat);lip.parent=root
 dirt=cylinder('Soil',(0,0,.215),.27,.02,soil);dirt.parent=root
 for b in range(6):
  rig=bpy.data.objects.new(name+' living stem '+str(b),None);scene.collection.objects.link(rig);rig.parent=root;rig.location=(0,0,.22)
  a=b*math.tau/6;length=random.uniform(1.1,2.0) if hanging else random.uniform(.65,1.1)
  points=[]
  for j in range(8):
   t=j/7;r=.08+math.sin(t*1.5)*.5;points.append((math.cos(a)*r,math.sin(a)*r,(-t*length if hanging else math.sin(t*1.6)*length)))
  stem=curve('Natural trailing stem',points,.009,vein);stem.parent=rig
  periodic(rig,'rotation_euler',0,0,.035,b*.8);periodic(rig,'rotation_euler',1,0,.045,b*.9+1)
  for j in range(1,8):
   for side in [-1,1]:
    ob=bpy.data.objects.new('Individual curved ivy leaf',leafmesh);scene.collection.objects.link(ob);ob.parent=rig;ob.location=points[j]
    ob.rotation_euler=(random.uniform(.2,.65) if hanging else -.3,side*.5,a+side*.9+random.uniform(-.4,.4))
    ss=random.uniform(.45,.95);ob.scale=(ss,ss,ss)
    periodic(ob,'rotation_euler',1,side*.5,.055,b+j*.5)
    # Linked leaf mesh with per-object material override keeps memory low.
    for slot in ob.material_slots:slot.link='OBJECT';slot.material=leafm[(j+b)%4]
 if hanging:
  for a in [0,math.tau/3,math.tau*2/3]:
   rope=curve('Macrame hanging cord',[(.24*math.cos(a),.24*math.sin(a),.12),(.18*math.cos(a),.18*math.sin(a),.7),(0,0,1.35)],.009,paper);rope.parent=root
 return root
plant('Left window hanging pothos',(-.3,3.2,5.7),1.2,True)
plant('Right hanging ivy',(5.7,3.2,6.3),1.2,True)
plant('Foreground trailing fern',(-3.8,-2.3,.4),1.15,False)
plant('Small garden jade',(CX+1.9,.9,.53),.45,False)
plant('House side climber',(CX-1.8,-.6,2.6),.55,True)
plant('Bookcase fern',(-4.5,2.8,5.35),.85,True)

# Brass pendant and a practical pool of warm light.
lamp=bpy.data.objects.new('Animated pendant assembly',None);scene.collection.objects.link(lamp);lamp.location=(5.7,.2,6.4)
cord=curve('Lamp braided cable',[(0,0,1.6),(0,0,0)],.025,black);cord.parent=lamp
shade=cylinder('Brass spun lampshade',(0,0,-.25),.16,.6,brass,.85);shade.parent=lamp
inside=cylinder('Luminous shade interior',(0,0,-.54),.76,.02,glass);inside.parent=lamp
bulb=sphere('Milk glass lamp bulb',(0,0,-.55),(.18,.18,.17),glass);bulb.parent=lamp
lampLight=light('Pendant warm soft pool',(0,0,-.7),360,(1,.61,.28),1.1,(0,0,-3));lampLight.parent=lamp
periodic(lamp,'rotation_euler',1,0,.018,.4);periodic(lampLight.data,'energy',None,360,18,1.2)
# Desk still life: rounded books, mug and paper plans.
bookcovers=[sage,brick,edge]
for i in range(3):
 x=4.4+i*.07;y=-2.3+i*.04;z=.12+i*.17
 o=box('Stacked cloth book',(x,y,z),(1.4,.95,.16),bookcovers[i],.04);o.rotation_euler[2]=-.18+i*.11
 o=box('Ivory page block',(x,y-.012,z+.01),(1.32,.90,.11),paper,.018);o.rotation_euler[2]=-.18+i*.11
for i in range(2):
 o=box('Architect paper plan',(CX-.1,-2.6,.015+i*.008),(1.6,1.05,.009),paper,.005);o.rotation_euler[2]=.12-i*.1
# Pencil and little ruler.
o=cylinder('Graphite pencil',(CX+.25,-2.6,.065),.027,1.1,edge);o.rotation_euler=(0,math.pi/2,.35)
box('Small brass ruler',(CX-.25,-2.9,.04),(1.1,.11,.025),brass,.01)
# Ceramic mug modeled as hollow cylinder with solidify.
bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.30,depth=.52,end_fill_type='NOTHING',location=(-.2,-2.2,.27));mug=assign(bpy.context.object,'Hand thrown ceramic mug',potmat)
sol=mug.modifiers.new('Real ceramic wall','SOLIDIFY');sol.thickness=.035
bev=mug.modifiers.new('Soft mug lip','BEVEL');bev.width=.015;bev.segments=3
for p in mug.data.polygons:p.use_smooth=True
coffee=mat('Tea surface',(.065,.025,.008),.22)
cylinder('Tea in cup',(-.2,-2.2,.48),.265,.015,coffee)
bpy.ops.mesh.primitive_torus_add(major_radius=.18,minor_radius=.045,major_segments=32,minor_segments=8,location=(-.52,-2.2,.28),rotation=(math.pi/2,0,0));assign(bpy.context.object,'Ceramic mug handle',potmat)
# A small tray of spools and brushes.
box('Tools tray',(4.8,.65,.12),(1.2,.75,.15),wood,.07)
for i in range(4):
 cylinder('Wooden thread spool',(4.4+i*.23,.65,.29),.09,.22,edge)
 cylinder('Spool thread',(4.4+i*.23,.65,.29),.095,.14,paper)
# Lighting: large area sources give soft physically situated transitions.
light('Large warm studio softbox',(0,-4.5,7.8),470,(1,.72,.43),5,(1,0,1.5))
light('Cool evening window fill',(3.5,3.3,6.2),300,(.47,.62,1),4,(1,-1,1.2))
light('Low warm bounce',(-2,-1,2.8),90,(1,.52,.26),3,(1,0,1.6))
# Camera places the entire detailed cottage right of the quiet title space.
bpy.ops.object.camera_add(location=(10,-17,8.7));camera=bpy.context.object;camera.name='Menu master camera';scene.camera=camera
camera.data.type='PERSP';camera.data.lens=48;aim(camera,(-.65,.4,2.1))
camera.data.dof.use_dof=True;camera.data.dof.focus_distance=(Vector((CX,0,2))-camera.location).length;camera.data.dof.aperture_fstop=3.8
scene.render.filepath=str(PRE/'draft.png')
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-home-workshop.blend'))
print('MENU_SAVED',len(scene.objects),'objects',flush=True)
if '--draft' in sys.argv:
 scene.eevee.taa_render_samples=32
 bpy.ops.render.render(write_still=True)
print('MENU_COMPLETE',flush=True)
