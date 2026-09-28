"""Render one frame per separated prop, for a geometry sanity check on a group split.

NOT a substitute for the styled-scene check (D-018b): this is a neutral Workbench render that
answers one question only — did the partition cut the group into the right objects, and is each
one a whole object rather than a fragment. The look question is answered in labs/prop-verify/
under the garden rig, which is the only place it can be answered honestly.

Usage:
    blender -b -noaudio --python render-prop-contact-sheet.py -- <groupdir> <outdir> [lod]
"""
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GROUP, OUT = argv[0], argv[1]
LOD = argv[2] if len(argv) > 2 else "0"
os.makedirs(OUT, exist_ok=True)

report = json.load(open(os.path.join(GROUP, "group.json")))

for part in report["parts"]:
    src = os.path.join(GROUP, part["id"], f"{part['id']}-lod{LOD}.glb")
    if not os.path.exists(src):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        continue

    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for o in meshes:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            for a in range(3):
                lo[a] = min(lo[a], p[a])
                hi[a] = max(hi[a], p[a])
    centre = Vector([(lo[a] + hi[a]) / 2 for a in range(3)])
    radius = max(hi[a] - lo[a] for a in range(3)) or 1.0

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    # Three-quarter view at a shallow eye-level angle — the angle a fragment shows up at.
    cam.location = centre + Vector((radius * 1.5, -radius * 1.7, radius * 0.85))
    direction = (centre - cam.location).normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 420
    scene.render.resolution_y = 420
    scene.render.film_transparent = False
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'SINGLE'
    scene.display.shading.single_color = (0.62, 0.63, 0.65)
    scene.display.shading.show_cavity = True
    scene.render.filepath = os.path.join(OUT, f"{part['id']}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[sheet] {part['id']} -> {scene.render.filepath}")
