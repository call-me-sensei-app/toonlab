"""Split a GENERATED GROUP model into individually placeable props, scale it, and author LODs.

Companion to author-prop-lods.py, for the D-018a group recipe: N similar objects are drawn side
by side in ONE concept image, generated as ONE model, then separated into N placeable assets.
That recipe turns one 42-credit generation into N props and gives them coherent size
relationships and one shared weathering pass, which N separate generations cannot.

D-018a did the separation with `model_segment`. This script does the part D-018a left manual:
reading the partition back out, scaling the group to real metres, and authoring per-object LODs.

Two partitioners, in preference order:

  `material` (default) — the segmenter's own answer. `model_segment` returns one material slot
  per object; reading that partition back is exact, and it is what the 55-credit spend buys.

  `centroid` — free fallback for an UNSEGMENTED group. Splits into connected components, then
  cuts the row axis at the (N-1) largest centroid gaps. MEASURED on PROP-LANE-01 before the
  segmenter was paid for, and NOT adopted as the primary path: Tripo welds the objects' ground
  contact into flat shells whose bounding intervals chain straight across the row, so interval
  clustering collapsed 8 objects into 2, and centroid clustering gave a partition that could not
  be trusted without a visual check (one cluster held 29% of the model's triangles for what
  should have been a wall lamp). It is kept because it costs nothing and is exact when the
  objects share no ground contact — but the material partition is the one to rely on.

Axes are BLENDER axes throughout. The glTF importer converts Y-up to Z-up, so a row laid out
along glTF Z is Blender Y, and an object's height is Blender Z.

Usage:
    blender -b -noaudio --python author-prop-group.py -- <in.glb> <outdir> <manifest.json>

Manifest:
{
  "partitionBy": "material",
  "rowAxis": "y",
  "anchor": {"index": 0, "axis": "z", "metres": 5.2},
  "expect": 8,
  "parts": [{"id": "signal-pole", "label": "...", "slot": "cityMetal", "lod0": 26000}, ...]
}

Writes <outdir>/<part id>/<id>-lod{0,1,2}.glb, a lods.json per part, and group.json carrying
every MEASURED dimension for the scene owner to place against.
"""
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT, MANIFEST = argv[0], argv[1], argv[2]
BAND = (20000, 180000)
UV_NAME = "UVWorld"
AXES = {"x": 0, "y": 1, "z": 2}

with open(MANIFEST) as fh:
    man = json.load(fh)

MODE = man.get("partitionBy", "material").lower()
ROW_AXIS = AXES[man.get("rowAxis", "y").lower()]
PARTS = man.get("parts", [])
EXPECT = int(man.get("expect", len(PARTS) or 1))
os.makedirs(OUT, exist_ok=True)


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == 'MESH']


def tri_count(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


def world_bounds(objs):
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for o in objs:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            for a in range(3):
                lo[a] = min(lo[a], p[a])
                hi[a] = max(hi[a], p[a])
    return lo, hi


def separate(kind):
    objs = mesh_objects()
    if not objs:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type=kind)
    bpy.ops.object.mode_set(mode='OBJECT')


def regroup(groups):
    """Merge fine-grained partitions into the `expect` row objects.

    `model_segment` partitions by object PART, not by instance. On PROP-LANE-01 eight street
    fixtures came back as 17 material slots — the signal head separate from its pole, the
    cabinet's plinth separate from its body. D-018a's stepping stones happened to be 1:1 only
    because a plain slab has exactly one part.

    Clustering the SLOT centroids, rather than the 126 raw connected components, is what makes
    this reliable: a slot centroid sits squarely inside its own object, so the (N-1) largest
    gaps fall between objects. The failure mode that sank raw-shell clustering — flat welded
    ground pads whose intervals chain across the row — cannot occur here, because a pad is
    inside its object's slot and contributes one centroid, not a chain of them.
    """
    if len(groups) <= EXPECT:
        return groups
    centred = sorted(
        ((sum(world_bounds(g)[i][ROW_AXIS] for i in (0, 1)) / 2, g) for g in groups),
        key=lambda e: e[0],
    )
    gaps = sorted(((centred[i + 1][0] - centred[i][0], i) for i in range(len(centred) - 1)), reverse=True)
    cuts = sorted(i for _, i in gaps[:max(EXPECT - 1, 0)])
    merged, start = [], 0
    for cut in cuts + [len(centred) - 1]:
        block = [o for _, g in centred[start:cut + 1] for o in g]
        start = cut + 1
        if block:
            merged.append(block)
    print(f"[group] regrouped {len(groups)} material slots -> {len(merged)} objects")
    return merged


def partition():
    """Returns groups of objects, ordered along the row axis. Deterministic — the LOD
    passes re-import and re-partition, and must land on the same grouping every time."""
    if MODE == "material":
        separate('MATERIAL')
        buckets = {}
        for o in mesh_objects():
            key = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else o.name
            buckets.setdefault(key, []).append(o)
        slots = sorted(
            buckets.values(),
            key=lambda g: sum(world_bounds(g)[i][ROW_AXIS] for i in (0, 1)) / 2,
        )
        explicit = [p.get("slotIndices") for p in PARTS]
        if PARTS and all(isinstance(s, list) and s for s in explicit):
            # Explicit slot assignment. Automatic regrouping gets the easy cases right and the
            # ambiguous ones wrong in a way that is invisible without a render: on PROP-LANE-01
            # the traffic signal's mast arm reaches sideways toward the next object, so its slot
            # centroid sat nearer that object's than its own pole's, and the largest-gap cut
            # handed the signal head to the wall lamp. The pole came out bare and the lamp came
            # out wearing a traffic signal. Both objects were individually plausible, which is
            # exactly why this is declared rather than inferred once the contact sheet has been
            # looked at.
            # Already in manifest order — the row sort below must not reshuffle it.
            return [[o for i in idx for o in slots[i]] for idx in explicit]
        else:
            groups = regroup(slots) if man.get("regroup", True) else slots
    else:
        separate('LOOSE')
        shells = []
        for o in mesh_objects():
            lo, hi = world_bounds([o])
            shells.append(((lo[ROW_AXIS] + hi[ROW_AXIS]) / 2, o))
        shells.sort(key=lambda s: s[0])
        gaps = sorted(((shells[i + 1][0] - shells[i][0], i) for i in range(len(shells) - 1)), reverse=True)
        cuts = sorted(i for _, i in gaps[:max(EXPECT - 1, 0)])
        groups, start = [], 0
        for cut in cuts + [len(shells) - 1]:
            groups.append([o for _, o in shells[start:cut + 1]])
            start = cut + 1
        groups = [g for g in groups if g]

    def key(group):
        lo, hi = world_bounds(group)
        return (lo[ROW_AXIS] + hi[ROW_AXIS]) / 2
    groups.sort(key=key)
    return groups


# --- partition + measure ----------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
groups = partition()
print(f"[group] partitionBy={MODE} -> {len(groups)} objects (expected {EXPECT})")

anchor = man.get("anchor") or {}
anchor_index = int(anchor.get("index", 0))
anchor_axis = anchor.get("axis", "z").lower()
anchor_metres = float(anchor.get("metres", 0) or 0)

factor = 1.0
if anchor_metres > 0 and 0 <= anchor_index < len(groups):
    lo, hi = world_bounds(groups[anchor_index])
    ref = (max(hi[a] - lo[a] for a in range(3)) if anchor_axis == "longest"
           else hi[AXES[anchor_axis]] - lo[AXES[anchor_axis]])
    if ref > 0:
        factor = anchor_metres / ref
print(f"[group] anchor index {anchor_index} -> uniform scale {factor:.6f}")

report = {
    "source": os.path.basename(SRC),
    "band": list(BAND),
    "partitionBy": MODE,
    "rowAxis": man.get("rowAxis", "y"),
    "objects": len(groups),
    "expected": EXPECT,
    "anchor": anchor,
    "groupScale": round(factor, 8),
    "parts": [],
}

# Per-object scale overrides.
#
# D19-146 says never trust generated proportions. D-018a's group recipe additionally CLAIMED
# that objects drawn together arrive with coherent size relationships, so one group anchor would
# scale all of them correctly. MEASURED on PROP-LANE-01, that claim does not hold: anchoring the
# traffic signal pole at its real 5.0 m left the manhole cover at 2.5 m across, the bollard at
# 1.56 m and the standpipe at 2.25 m — every small object 1.5-4x oversize. The cause is
# compositional rather than technical. An illustrator drawing a product row gives each object
# similar VISUAL weight so the row reads evenly, which is the opposite of drawing them to a
# shared scale, and no amount of prompt wording changes that instinct.
#
# So the group recipe's real yield is the shared weathering, the shared material family and the
# per-item cost — NOT the size hierarchy. Any part may therefore declare its own
# `metres` + `axis`, and where it does, that object is solved independently from its own
# measured bounds. Parts without an override fall back to the group anchor.
scales = []
for i, group in enumerate(groups):
    spec = PARTS[i] if i < len(PARTS) else {}
    lo, hi = world_bounds(group)
    part_factor = factor
    if spec.get("metres"):
        name = spec.get("axis", "z").lower()
        # "longest" for objects the generator drew ROTATED, where no world axis is the object's
        # own long axis — a kerb bar laid on the diagonal has its 0.9 m length split across x
        # and y, so solving either one is wrong by the cosine.
        ref = max(hi[a] - lo[a] for a in range(3)) if name == "longest" else hi[AXES[name]] - lo[AXES[name]]
        if ref > 0:
            part_factor = float(spec["metres"]) / ref
    scales.append(part_factor)

measured_all = []
for i, group in enumerate(groups):
    lo, hi = world_bounds(group)
    measured_all.append([round((hi[a] - lo[a]) * scales[i], 4) for a in range(3)])

# --- per-object export + LODs ----------------------------------------------
for i, group in enumerate(groups):
    spec = PARTS[i] if i < len(PARTS) else {}
    part_id = spec.get("id", f"part-{i:02d}")
    # lod0: 0 means "do not decimate". A supporting street fixture can arrive UNDER section 8's
    # 20k props floor once a group's triangles are divided across its objects, and decimating to
    # chase a floor written for hero props throws away silhouette for nothing.
    targets = [int(spec.get("lod0", 40000)) or 10 ** 9,
               int(spec.get("lod1", 12000)),
               int(spec.get("lod2", 3000))]
    part_dir = os.path.join(OUT, part_id)
    os.makedirs(part_dir, exist_ok=True)

    part_report = {
        "id": part_id,
        "label": spec.get("label", part_id),
        "slot": spec.get("slot"),
        # The re-derived real-world size, per the D19-146 standing rule. Placement
        # uses THESE numbers and never the generation prompt's.
        "metresXYZ": measured_all[i],
        "scale": round(scales[i], 8),
        "scaledFrom": spec.get("axis") if spec.get("metres") else "group anchor",
        "band": list(BAND),
        "lods": [],
    }

    for level, target in enumerate(targets):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=SRC)
        keep = partition()[i]
        for o in mesh_objects():
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        keep = mesh_objects()
        if not keep:
            continue

        # Scale to metres BEFORE the UV projection, so "one UV unit per metre" is true.
        bpy.ops.object.select_all(action='DESELECT')
        for o in keep:
            o.select_set(True)
            o.scale = [scales[i]] * 3
        bpy.context.view_layer.objects.active = keep[0]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        # Re-origin to the object's own footprint centre at ground level, so the
        # scene owner places at a sane pivot instead of the group's shared origin.
        lo2, hi2 = world_bounds(keep)
        for o in keep:
            o.location[0] -= (lo2[0] + hi2[0]) / 2
            o.location[1] -= (lo2[1] + hi2[1]) / 2
            o.location[2] -= lo2[2]
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        for o in keep:
            o.select_set(True)
        bpy.context.view_layer.objects.active = keep[0]
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

        if level == 0:
            part_report["sourceTriangles"] = tri_count(keep)

        base = tri_count(keep)
        for o in keep:
            o.data.calc_loop_triangles()
            t = len(o.data.loop_triangles)
            if t <= 0:
                continue
            # Budget distributed proportionally so small parts are not annihilated.
            share = max(1, int(target * (t / base)))
            ratio = min(1.0, share / t)
            if ratio >= 0.999:
                continue
            m = o.modifiers.new("dec", 'DECIMATE')
            m.decimate_type = 'COLLAPSE'
            m.ratio = ratio
            m.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        for o in keep:
            o.data = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            o.modifiers.clear()

        # World-scale UV set (TEXCOORD_1). The generator's atlas unwrap stays at index 0
        # so the original bake remains inspectable; the tiling section 9 material binds to
        # THIS one at repeat = 1 / tile, which is what makes the quoted px/cm the density
        # actually on the surface (D-018b cause 1).
        for o in keep:
            if o.data.polygons:
                uv = o.data.uv_layers.get(UV_NAME) or o.data.uv_layers.new(name=UV_NAME)
                o.data.uv_layers.active = uv
        bpy.ops.object.select_all(action='DESELECT')
        for o in keep:
            o.select_set(True)
        bpy.context.view_layer.objects.active = keep[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=False, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')

        out_file = os.path.join(part_dir, f"{part_id}-lod{level}.glb")
        bpy.ops.object.select_all(action='DESELECT')
        for o in keep:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=out_file, export_format='GLB',
                                  use_selection=True, export_apply=True)
        tris = tri_count(keep)
        entry = {
            "lod": level,
            "targetTriangles": target,
            "triangles": tris,
            "file": os.path.basename(out_file),
            "bytes": os.path.getsize(out_file),
        }
        if level == 0:
            entry["inSection8PropsBand"] = BAND[0] <= tris <= BAND[1]
        part_report["lods"].append(entry)

    with open(os.path.join(part_dir, "lods.json"), "w") as fh:
        json.dump(part_report, fh, indent=1)
    report["parts"].append(part_report)
    print(f"[group] {part_id}: {measured_all[i]} m, "
          f"{part_report.get('sourceTriangles')} src tris")

with open(os.path.join(OUT, "group.json"), "w") as fh:
    json.dump(report, fh, indent=1)
print(json.dumps({"objects": len(groups), "out": OUT}, indent=1))
