"""Author LOD0/LOD1/LOD2 for a generated prop, and report against the doc 18 section 8 props band.

Every Tripo image_to_model result arrives at ~502k triangles regardless of subject (D19-143),
which is 2.8x-25x over section 8's 20k-180k LOD0 props band. Decimation is therefore mandatory,
not optional, and it is a required deliverable rather than a cleanup step.

Usage:
    blender -b -noaudio --python author-prop-lods.py -- <in.glb> <outdir> [lod0] [lod1] [lod2]

Defaults: lod0=150000 lod1=35000 lod2=9000 triangles.

Writes <outdir>/<stem>-lod{0,1,2}.glb plus lods.json with measured counts and a band verdict.
Planar decimation is deliberately NOT used: it collapses the chisel facets and bamboo node relief
that these assets exist to carry. Collapse decimation preserves silhouette far better at these ratios.
"""
import bpy, sys, os, json
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
TARGETS = [int(argv[2]) if len(argv) > 2 else 150000,
           int(argv[3]) if len(argv) > 3 else 35000,
           int(argv[4]) if len(argv) > 4 else 9000]
# §8 sets two different LOD0 bands. Props are 20k-180k (the default here, unchanged).
# Architecture is 150k-750k, which generated output usually lands inside already, so a
# building normally needs NO LOD0 decimation — only the world-scale UV set below.
# Set PROP_LOD_BAND="150000,750000" for architecture. Defaults preserve prop behaviour.
BAND = tuple(int(v) for v in os.environ.get("PROP_LOD_BAND", "20000,180000").split(","))
# World-scale UV set written alongside the generator's atlas UVs. The atlas set
# is kept (index 0) so the original bake stays inspectable; the tiling §9
# material binds to this one.
PROJECT_UV = os.environ.get("PROP_LOD_PROJECT_UV", "1") != "0"
UV_NAME = "UVWorld"
METRES = float(os.environ.get("PROP_LOD_METRES", "0") or 0)
os.makedirs(OUT, exist_ok=True)
stem = os.path.splitext(os.path.basename(SRC))[0]


def tri_count():
    n = 0
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


report = {"source": os.path.basename(SRC), "band": list(BAND), "lods": []}

for i, target in enumerate(TARGETS):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)

    # The generator returns geometry normalized to a unit long axis. The UV
    # projection below only means "one UV unit per metre" if the geometry is in
    # metres first, so scale to the asset's MEASURED real size before projecting.
    # Per the D19-146 standing rule the caller supplies this from measured
    # bounds, never from the generation prompt.
    if METRES > 0:
        bpy.ops.object.select_all(action='SELECT')
        # World space, not o.bound_box: bound_box is LOCAL, and the glTF importer
        # carries the Y-up -> Z-up conversion as an object rotation. In local space
        # the axes are permuted, so naming one ("width") would select the wrong
        # dimension. max() over local extents happened to be permutation-invariant,
        # which is why the prop path was never affected by this.
        pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects
               if o.type == 'MESH' for c in o.bound_box]
        extent = [max(p[a] for p in pts) - min(p[a] for p in pts) for a in range(3)]
        # Which measured axis METRES refers to. Default "longest" is the prop
        # behaviour and is unchanged. Architecture should solve from WIDTH: the
        # generator's fixed 1.83:1 letterbox biases the DRAWN aspect (D19-141),
        # so a tall building arrives squat. Solving height against a squashed
        # model multiplies that distortion through the whole asset, while the
        # street-facing width is the dimension the scene actually has to fit.
        axis = os.environ.get("PROP_LOD_SCALE_AXIS", "longest").lower()
        ref = {"x": extent[0], "y": extent[1], "z": extent[2],
               "width": extent[0], "height": extent[1], "depth": extent[2],
               "longest": max(extent)}.get(axis, max(extent)) or 1.0
        factor = METRES / ref
        report["measured"] = {
            "scaleAxis": axis,
            "scaleAxisMetres": METRES,
            "normalizedExtent": [round(v, 6) for v in extent],
            # The re-derived real-world size, per the D19-146 standing rule.
            # Placement must use THESE numbers, never the generation prompt's.
            "metresXYZ": [round(v * factor, 4) for v in extent],
        }
        # Scale about the WORLD origin, not about each object's own origin.
        #
        # Setting `o.scale` shrinks each mesh around its own origin and leaves
        # `o.location` untouched, so on a SEGMENTED (multi-object) asset every
        # part shrinks in place and the gaps between parts do not scale — the
        # assembly collapses inward. It is invisible on a single fused mesh,
        # which is why the prop path never showed it, but ARCH-GDN-02's 17 parts
        # came out 2.18x short across the wall run before this was fixed.
        # Composing into matrix_world scales the offsets too.
        scale_matrix = Matrix.Scale(factor, 4)
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.matrix_world = scale_matrix @ o.matrix_world
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    base = tri_count()

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        o.data.calc_loop_triangles()
        t = len(o.data.loop_triangles)
        if t <= 0:
            continue
        # distribute the budget proportionally so a small part is not annihilated
        share = max(1, int(target * (t / base)))
        ratio = min(1.0, share / t)
        if ratio >= 0.999:
            continue
        m = o.modifiers.new("dec", 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = ratio
        m.use_collapse_triangulate = True

    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        o.data = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()

    # World-scale UV re-projection.
    #
    # The generator ships an ATLAS unwrap: UVs packed to address one baked
    # texture, with no relationship to world size. A tiling §9 material mapped
    # over that stretches arbitrarily per island, produces visible seams at
    # island borders, and makes the authored texel density (e.g. MAT-GDN-03 at
    # 25.60 px/cm over a 1.6 m tile) simply untrue — the material is not landing
    # at its authored world tile anywhere.
    #
    # A cube projection scaled so 1 UV unit == 1 metre fixes it: the tiling
    # material then lands at exactly its authored world tile on every face, and
    # the quoted px/cm becomes real. Done AFTER decimation so the projection
    # matches final geometry.
    if PROJECT_UV:
        for o in meshes:
            if not o.data.polygons:
                continue
            uv = o.data.uv_layers.get(UV_NAME) or o.data.uv_layers.new(name=UV_NAME)
            o.data.uv_layers.active = uv
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        # cube_size=1.0 with correct_aspect keeps one UV unit at one metre
        # because the objects are already in metres by this point.
        bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')

    got = tri_count()
    path = os.path.join(OUT, f"{stem}-lod{i}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                              export_apply=False, use_selection=False)
    entry = {
        "lod": i, "targetTriangles": target, "triangles": got,
        "sourceTriangles": base, "file": os.path.basename(path),
        "bytes": os.path.getsize(path),
    }
    if i == 0:
        entry["inSection8PropsBand"] = BAND[0] <= got <= BAND[1]
    report["lods"].append(entry)
    print(f"LOD{i}: {base} -> {got} triangles (target {target})")

with open(os.path.join(OUT, "lods.json"), "w") as f:
    json.dump(report, f, indent=1)
print(json.dumps(report, indent=1))
