import bpy, sys, os, json, math, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT = argv[0], argv[1]
RES = int(argv[2]) if len(argv) > 2 else 1440
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
mats = set()
tris = 0
prims = 0
verts = 0
loose_stats = []
for o in meshes:
    o.data.calc_loop_triangles()
    t = len(o.data.loop_triangles)
    tris += t
    verts += len(o.data.vertices)
    slots = [s.material for s in o.material_slots if s.material]
    prims += max(1, len(slots))
    for m in slots:
        mats.add(m.name)
    loose_stats.append({"object": o.name, "tris": t, "verts": len(o.data.vertices),
                        "materials": [m.name for m in slots]})

# world bounds
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn[i], w[i]) for i in range(3)))
        mx = Vector((max(mx[i], w[i]) for i in range(3)))
size = mx - mn
centre = (mn + mx) / 2.0

# manifold / degenerate audit
nonmanifold = 0
degenerate = 0
for o in meshes:
    bm = bmesh.new(); bm.from_mesh(o.data)
    nonmanifold += sum(1 for e in bm.edges if not e.is_manifold)
    for f in bm.faces:
        if f.calc_area() < 1e-9:
            degenerate += 1
    bm.free()

# textures
images = [{"name": i.name, "size": list(i.size)} for i in bpy.data.images if i.size[0] > 0]

stats = {
    "file": os.path.basename(GLB),
    "fileBytes": os.path.getsize(GLB),
    "meshObjects": len(meshes),
    "materials": sorted(mats),
    "materialCount": len(mats),
    "primitives": prims,
    "triangles": tris,
    "vertices": verts,
    "boundsMin": [round(v, 4) for v in mn],
    "boundsMax": [round(v, 4) for v in mx],
    "sizeXYZ": [round(v, 4) for v in size],
    "nonManifoldEdges": nonmanifold,
    "degenerateFaces": degenerate,
    "images": images,
    "perObject": loose_stats,
}
with open(os.path.join(OUT, "stats.json"), "w") as f:
    json.dump(stats, f, indent=1)
print(json.dumps(stats, indent=1))

# ---------- render setup ----------
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = RES
scene.render.resolution_y = int(RES * 0.75)
scene.render.film_transparent = False
scene.eevee.taa_render_samples = 32

world = bpy.data.worlds.new("W"); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.55, 0.57, 0.6, 1)
bg.inputs[1].default_value = 1.2

sun_data = bpy.data.lights.new("Sun", 'SUN'); sun_data.energy = 3.0
sun = bpy.data.objects.new("Sun", sun_data); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(35))

cam_data = bpy.data.cameras.new("Cam"); cam_data.lens = 50
cam = bpy.data.objects.new("Cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam

radius = (size.length / 2.0) * 2.6  # bounding-sphere fit: tall or wide props overflowed a max-axis fit

def look_at(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def shot(name, az_deg, el_deg, dist_mul=1.0, target=None, lens=50):
    cam_data.lens = lens
    t = target if target else centre
    az = math.radians(az_deg); el = math.radians(el_deg)
    r = radius * dist_mul
    cam.location = t + Vector((r * math.cos(el) * math.sin(az),
                               -r * math.cos(el) * math.cos(az),
                               r * math.sin(el)))
    look_at(cam, t)
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)

# §8 turntable: front, three-quarter, side, rear, roof, entrance close-up
shot("01-front", 0, 8)
shot("02-three-quarter", 40, 18)
shot("03-side", 90, 8)
shot("04-rear", 180, 8)
shot("05-roof", 25, 70)
entrance = Vector((centre.x, mn.y, mn.z + size.z * 0.38))
shot("06-entrance-close", 0, 4, 0.42, entrance, 60)
shot("07-underside", 15, -25)

# material-ID pass
import random
random.seed(7)
idmats = {}
for o in meshes:
    if not o.material_slots:
        continue
    for s in o.material_slots:
        if not s.material:
            continue
        if s.material.name not in idmats:
            m = bpy.data.materials.new("ID_" + s.material.name)
            m.use_nodes = True
            bsdf = m.node_tree.nodes.get("Principled BSDF")
            col = (random.random(), random.random(), random.random(), 1)
            bsdf.inputs["Base Color"].default_value = col
            bsdf.inputs["Roughness"].default_value = 0.9
            idmats[s.material.name] = m
        s.material = idmats[s.material.name]
shot("08-material-id", 40, 18)

# wireframe pass
for o in meshes:
    mod = o.modifiers.new("wf", 'WIREFRAME')
    mod.thickness = max(size) * 0.0015
shot("09-wireframe", 40, 18)
print("RENDERS DONE")
