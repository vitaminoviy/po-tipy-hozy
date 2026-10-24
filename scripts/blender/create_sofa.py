"""Original sculpted-grid sofa. Run with Blender --background --python this_file.
No downloaded assets. Blender Z-up, front -Y; glTF exporter converts to Y-up.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sofa'
for folder in ('blender', 'export', 'previews'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1100
scene.render.resolution_y = 850
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6

def material(name, rgb, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Specular IOR Level'].default_value = .25
    return m

fabric = material('Mint woven upholstery', (.30, .48, .28), .88)
wood = material('Warm pale ash', (.42, .25, .105), .67)
ground = material('Studio warm white', (.73, .72, .67), .9)
asset = bpy.data.collections.new('SOFA_ASSET')
scene.collection.children.link(asset)
studio = bpy.data.collections.new('STUDIO_not_exported')
scene.collection.children.link(studio)

def collect(obj, collection):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)

def skin(name, size, location, radius, mode='frame', phase=0, n=12):
    """Welded quad cage: rounded rectangular envelope, crowned/depressed faces.
    Unlike bevelled cubes, the faces themselves carry tailored curvature.
    """
    half = [v/2 for v in size]
    vertices, faces, lookup = [], [], {}
    for axis in range(3):
        for sign in (-1, 1):
            other = [i for i in range(3) if i != axis]
            grid = {}
            for u in range(n+1):
                for v in range(n+1):
                    key = [0,0,0]
                    key[axis] = sign*n
                    key[other[0]] = -n+2*u
                    key[other[1]] = -n+2*v
                    key = tuple(key)
                    if key not in lookup:
                        q = [key[i]/n*half[i] for i in range(3)]
                        core = [max(-half[i]+radius, min(half[i]-radius, q[i])) for i in range(3)]
                        d = Vector(q)-Vector(core)
                        p = Vector(core) + d.normalized()*radius
                        x,y,z = p
                        # Broad, smooth volume, not a flat slab with rounded edges.
                        fx = max(0, 1-(x/half[0])**2)
                        fy = max(0, 1-(y/half[1])**2)
                        fz = max(0, 1-(z/half[2])**2)
                        if mode == 'seat':
                            p.z += .032*fx*fy*max(0,z/half[2])
                            p.z -= .008*math.exp(-((x-.07)/.24)**2-((y+.04)/.25)**2)*max(0,z/half[2])
                            p.y += .006*math.sin(x*8+phase)*fz*fy
                        elif mode == 'back':
                            front = max(0,-y/half[1])
                            p.y -= .035*fx*fz*front
                            # Upholstery tension around a shallow central tuft.
                            dip = .035*math.exp(-((x-.025*phase)/.09)**2-((z+.025)/.08)**2)
                            p.y += dip*front
                            p.x *= 1-.035*(z/half[2])
                            p.z += .006*math.sin(x*7+phase)*fx*fz
                        else:
                            p.x += .008*(1 if x>0 else -1)*fy*fz
                            p.z += .012*fx*fy*max(0,z/half[2])
                        lookup[key] = len(vertices)
                        vertices.append(tuple(p))
                    grid[u,v] = lookup[key]
            for u in range(n):
                for v in range(n):
                    faces.append([grid[u,v],grid[u+1,v],grid[u+1,v+1],grid[u,v+1]])
    mesh = bpy.data.meshes.new(name+' tailored quad cage')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    asset.objects.link(obj)
    obj.location = location
    # Recalculate a consistent outward orientation on the closed cage.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    for face in mesh.polygons:
        face.use_smooth = True
    obj.data.materials.append(fabric)
    return obj

# Unioned, continuous upholstered frame: front rail, broad arms, rear shell.
frame_parts = [
    skin('Front rail', (2.45,1.04,.32), (0,0,.39), .065),
    skin('Left upholstered side', (.30,1.08,.78), (-1.085,0,.65), .055),
    skin('Right upholstered side', (.30,1.08,.78), (1.085,0,.65), .055),
    skin('Rear upholstered shell', (2.42,.20,.94), (0,.43,.83), .055),
]
bpy.ops.object.select_all(action='DESELECT')
for obj in frame_parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = frame_parts[0]
bpy.ops.object.join()
frame = bpy.context.object
frame.name = 'Continuous upholstered frame'
remesh = frame.modifiers.new('Seamless frame union', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = .024
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth = frame.modifiers.new('Relax upholstery junctions', 'SMOOTH')
smooth.factor = 1.0
smooth.iterations = 5
bpy.ops.object.modifier_apply(modifier=smooth.name)
decimate = frame.modifiers.new('Game frame topology', 'DECIMATE')
decimate.ratio = .32
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in frame.data.polygons:
    face.use_smooth = True
frame.select_set(False)

for i,x in enumerate((-.50,.50)):
    seat = skin(f'Seat cushion {i+1}', (.975,.81,.27), (x,-.075,.685), .105, 'seat', i, 12)
    seat.rotation_euler.z = (-1 if i==0 else 1)*.006
    sub = seat.modifiers.new('Soft cushion limit surface', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    back = skin(f'Back cushion {i+1}', (.98,.245,.59), (x,.285,1.02), .105, 'back', i, 12)
    back.rotation_euler.x = -.14
    back.rotation_euler.y = (-1 if i==0 else 1)*.012
    sub = back.modifiers.new('Soft cushion limit surface', 'SUBSURF')
    sub.levels = sub.render_levels = 1

for x in (-1.04,1.04):
    for y in (-.39,.39):
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=.061, radius2=.08, depth=.245, location=(x,y,.1225))
        foot = bpy.context.object
        foot.name = f'Ash foot {x:+.2f} {y:+.2f}'
        collect(foot,asset)
        foot.data.materials.append(wood)
        bevel = foot.modifiers.new('Tiny end rounding', 'BEVEL')
        bevel.width = .008
        bevel.segments = 2
        for face in foot.data.polygons:
            face.use_smooth = len(face.vertices)==4
        foot.select_set(False)

root = bpy.data.objects.new('QuietHome_Sofa_Mint', None)
asset.objects.link(root)
root['front'] = 'Blender -Y; glTF +Z'
root['status'] = 'Standalone art candidate, not integrated'
for obj in list(asset.objects):
    if obj != root:
        obj.parent = root

bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Studio floor'
collect(floor,studio)
floor.data.materials.append(ground)
scene.world.color = (.35,.35,.35)
def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for name, location, energy, size in [
    ('Large soft key',(-3,-4,6),550,4),
    ('Soft fill',(4,-1,3),240,3),
    ('Rear rim',(1,4,4),350,3),
]:
    data = bpy.data.lights.new(name,'AREA')
    data.energy, data.shape, data.size = energy,'DISK',size
    obj = bpy.data.objects.new(name,data)
    studio.objects.link(obj)
    obj.location = location
    aim(obj,(0,0,.6))
data = bpy.data.cameras.new('Review orthographic camera')
camera = bpy.data.objects.new('Review camera',data)
studio.objects.link(camera)
scene.camera = camera
data.type = 'ORTHO'
data.ortho_scale = 3.35
views = {
    'isometric': ((3,-4,2.8),(0,0,.65),3.35),
    'front': ((0,-5,1.65),(0,0,.68),3.1),
    'side': ((5,0,1.8),(0,0,.68),2.7),
    'game-angle': ((3,-4,4.8),(0,0,.6),3.25),
    'cushion-detail': ((1.9,-3,2.25),(0,.02,.92),2.15),
}
def set_view(name):
    location,target,scale = views[name]
    camera.location = location
    aim(camera,target)
    data.ortho_scale = scale
set_view('isometric')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender/quiet-home-sofa.blend'))

bpy.ops.object.select_all(action='DESELECT')
for obj in asset.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'export/quiet-home-sofa.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)

depsgraph = bpy.context.evaluated_depsgraph_get()
triangles = 0
bounds = []
for obj in asset.objects:
    if obj.type != 'MESH': continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    bounds.extend([tuple(obj.matrix_world @ v.co) for v in mesh.vertices])
    evaluated.to_mesh_clear()
report = {'blender':bpy.app.version_string,'triangles':triangles,'materials':2,'textures':0,
          'bounds_blender':[[min(p[i] for p in bounds) for i in range(3)],[max(p[i] for p in bounds) for i in range(3)]],
          'render_engine':scene.render.engine,'resolution':[1100,850]}
(OUT/'export/metrics.json').write_text(json.dumps(report,indent=2))
print('ASSET_METRICS',json.dumps(report),flush=True)
draft = '--draft' in sys.argv
for name in (['isometric'] if draft else views):
    set_view(name)
    scene.render.resolution_percentage = 65 if draft else 100
    scene.render.filepath = str(OUT/'previews'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
print('SOFA_COMPLETE',flush=True)

