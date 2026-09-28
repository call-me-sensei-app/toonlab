#!/usr/bin/env python3
"""Build the private, shader-neutral Yua character used by ToonLab captures.

Run with Blender, not the system Python:

  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --factory-startup --python scripts/prepare-yua-character.py -- \
    --package /path/to/Yua_Facial.unitypackage \
    --output assets-local/models/yua

The Unity package and its source FBX remain read-only.  The generated GLB uses
ordinary glTF PBR materials, embeds every runtime texture, retains the facial
morphs and secondary skeleton, and renames only the humanoid/finger bones that
ToonLab's Mixamo adapter needs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

import bpy
from mathutils import Vector


RETAINED_MESHES = (
    "Body",
    "Buckles_low",
    "Fc_Body",
    "Hair",
    "HairBand_low",
    "Outer_low",
    "OuterHood_low",
    "Pants2_low",
    "Pants_low",
    "Shoes_low",
    "Top_low",
)

SOURCE_ASSETS = {
    "fbx": "Assets/Saakuru_Labs/Saakuru_Labs.fbx",
    "body_albedo": "Assets/Saakuru_Labs/Maps/Albedo/Body_Albedo.png",
    "cloth_albedo": "Assets/Saakuru_Labs/Maps/Albedo/Cloth_Albedo.png",
    "eye_albedo_psd": "Assets/Saakuru_Labs/Maps/Albedo/Eye_Albedo.psd",
    "skin_albedo": "Assets/Saakuru_Labs/Maps/Albedo/FCBody_Albedo.png",
    "hair_albedo": "Assets/Saakuru_Labs/Maps/Albedo/Hair_Albedo.png",
    "outer_albedo": "Assets/Saakuru_Labs/Maps/Albedo/Outer_Albedo.png",
    "cloth_normal": "Assets/Saakuru_Labs/Maps/Nomal/Cloth_Normal.png",
    "skin_normal": "Assets/Saakuru_Labs/Maps/Nomal/Fc_Body_Normal.png",
    "outer_normal": "Assets/Saakuru_Labs/Maps/Nomal/Outer_Normal.png",
    "cloth_channels": "Assets/Saakuru_Labs/Maps/etc/Cloth_Channel Packing.png",
    "eye_channels": "Assets/Saakuru_Labs/Maps/etc/Eye_Channel Packing.png",
    "skin_channels": "Assets/Saakuru_Labs/Maps/etc/FCBody_Channel Packing 1.png",
    "hairband_channels": "Assets/Saakuru_Labs/Maps/etc/RGBA_Channel Packing 1.png",
    "hair_highlight": "Assets/Saakuru_Labs/Maps/etc/Hair_highLight_Mask.png",
    "face_mask": "Assets/Saakuru_Labs/Maps/etc/Mat_Color_1.png",
    "outer_channels": "Assets/Saakuru_Labs/Maps/etc/Outer_Channel Packing 2.png",
    "specular": "Assets/Saakuru_Labs/Maps/etc/specular.png",
}

AUXILIARY_TEXTURES = {
    "cloth_channels": "cloth-channel-pack.png",
    "eye_channels": "eye-channel-pack.png",
    "skin_channels": "skin-channel-pack.png",
    "hairband_channels": "headband-channel-pack.png",
    "hair_highlight": "hair-highlight-mask.png",
    "face_mask": "face-mask.png",
    "outer_channels": "outer-channel-pack.png",
    "specular": "specular-mask.png",
}

# The target names are the package's public animation-retarget contract.  All
# unlisted hair, cloth, twist, breast, helper, and eye bones remain unchanged.
BONE_RENAMES = {
    "Hips": "mixamorigHips",
    "Spine": "mixamorigSpine",
    "Chest": "mixamorigSpine1",
    "Neck": "mixamorigNeck",
    "Head": "mixamorigHead",
    "Shoulder_L": "mixamorigLeftShoulder",
    "Upper Arm_L": "mixamorigLeftArm",
    "Lower Arm_L": "mixamorigLeftForeArm",
    "Hand_L": "mixamorigLeftHand",
    "Shoulder_R": "mixamorigRightShoulder",
    "Upper Arm_R": "mixamorigRightArm",
    "Lower Arm_R": "mixamorigRightForeArm",
    "Hand_R": "mixamorigRightHand",
    "Upper Leg_L": "mixamorigLeftUpLeg",
    "Lower Leg_L": "mixamorigLeftLeg",
    "Foot_L": "mixamorigLeftFoot",
    "Toes_L": "mixamorigLeftToeBase",
    "Upper Leg_R": "mixamorigRightUpLeg",
    "Lower Leg_R": "mixamorigRightLeg",
    "Foot_R": "mixamorigRightFoot",
    "Toes_R": "mixamorigRightToeBase",
}

FINGER_NAMES = {
    "Index": "Index",
    "Middle": "Middle",
    "Ring": "Ring",
    "little": "Pinky",
    "Thumb": "Thumb",
}
FINGER_SEGMENTS = {
    "proximal": "1",
    "intermediate": "2",
    "distal": "3",
}
for source_finger, mixamo_finger in FINGER_NAMES.items():
    for source_segment, mixamo_segment in FINGER_SEGMENTS.items():
        for source_side, mixamo_side in (("L", "Left"), ("R", "Right")):
            BONE_RENAMES[
                f"{source_finger}_{source_segment}.{source_side}"
            ] = f"mixamorig{mixamo_side}Hand{mixamo_finger}{mixamo_segment}"


MATERIAL_SPECS = {
    "Body": {
        "name": "face_skin",
        "role": "face",
        "base": "body_albedo",
        "roughness": 0.72,
    },
    "Lash": {
        "name": "face_lash",
        "role": "face",
        "base": "body_albedo",
        "roughness": 0.78,
    },
    "Eye": {
        "name": "eye_base",
        "role": "eye",
        "base": "eye_albedo",
        "roughness": 0.32,
    },
    "Fc_Body": {
        "name": "skin_body",
        "role": "skin",
        "base": "skin_albedo",
        "normal": "skin_normal",
        "roughness": 0.72,
        "double_sided": True,
    },
    "Hair": {
        "name": "hair_primary",
        "role": "hair",
        "base": "hair_albedo",
        "roughness": 0.62,
    },
    "Cloth": {
        "name": "costume_cloth",
        "role": "costume",
        "base": "cloth_albedo",
        "normal": "cloth_normal",
        "roughness": 0.82,
    },
    "Outer_Shoes": {
        "name": "costume_outerwear",
        "role": "costume",
        "base": "outer_albedo",
        "normal": "outer_normal",
        "alpha_mask": "outer_channels",
        "roughness": 0.72,
        "double_sided": True,
    },
    "Material.001": {
        "name": "costume_shoes",
        "role": "costume",
        "base": "outer_albedo",
        "normal": "outer_normal",
        "base_factor": (0.8207547, 0.8207547, 0.8207547, 1.0),
        "roughness": 0.55,
        "double_sided": True,
    },
    "Material": {
        "name": "costume_headband",
        "role": "costume",
        "base_factor": (0.03071345, 0.21952623, 0.30498737, 1.0),
        "roughness": 0.58,
    },
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_unity_assets(package: Path, work_dir: Path) -> dict[str, Path]:
    wanted_by_path = {value: key for key, value in SOURCE_ASSETS.items()}
    extracted: dict[str, Path] = {}
    with tarfile.open(package, "r:*") as archive:
        members = {member.name: member for member in archive.getmembers()}
        for name, member in members.items():
            if not name.endswith("/pathname"):
                continue
            source = archive.extractfile(member)
            if source is None:
                continue
            pathname = source.read().decode("utf-8").strip()
            key = wanted_by_path.get(pathname)
            if key is None:
                continue
            asset_name = f"{name.rsplit('/', 1)[0]}/asset"
            asset_member = members.get(asset_name)
            asset = archive.extractfile(asset_member) if asset_member else None
            if asset is None:
                raise RuntimeError(f"Unity package entry has no asset payload: {pathname}")
            extension = Path(pathname).suffix.lower()
            destination = work_dir / f"{key}{extension}"
            destination.write_bytes(asset.read())
            extracted[key] = destination

    missing = sorted(set(SOURCE_ASSETS) - set(extracted))
    if missing:
        raise RuntimeError(f"Unity package is missing required assets: {', '.join(missing)}")
    return extracted


def convert_eye_psd(source: Path, destination: Path) -> None:
    result = subprocess.run(
        ["/usr/bin/sips", "-s", "format", "png", str(source), "--out", str(destination)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not destination.exists():
        raise RuntimeError(f"Could not convert eye texture to PNG: {result.stderr.strip()}")


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.images:
        if block.name != "Render Result":
            bpy.data.images.remove(block)


def import_source_fbx(path: Path) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    # Yua's FBX contains meaningful leaf joints (distal fingers and toes), not
    # exporter-generated end bones. Preserve them all.
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, ignore_leaf_bones=False)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature in Yua FBX, found {len(armatures)}")
    armature = armatures[0]
    armature.name = "YuaArmature"
    armature.data.name = "YuaSkeleton"

    retained = []
    for name in RETAINED_MESHES:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"Expected skinned source mesh is missing: {name}")
        retained.append(obj)

    keep = {armature, *retained}
    for obj in list(bpy.context.scene.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in retained:
        if obj.parent != armature:
            raise RuntimeError(f"Retained mesh is not parented to Yua's armature: {obj.name}")
        obj.data.name = f"{obj.name}Mesh"
    return armature, retained


def remove_separator_shape_keys(meshes: list[bpy.types.Object]) -> list[str]:
    removed = []
    for obj in meshes:
        keys = obj.data.shape_keys
        if not keys:
            continue
        for key in list(keys.key_blocks)[1:]:
            if key.name and set(key.name) == {"="}:
                removed.append(f"{obj.name}:{key.name}")
                obj.shape_key_remove(key)
    return removed


def rename_humanoid_bones(
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
) -> dict[str, str]:
    applied = {}
    for source, target in BONE_RENAMES.items():
        bone = armature.data.bones.get(source)
        if bone is None:
            continue
        if armature.data.bones.get(target):
            raise RuntimeError(f"Target humanoid bone already exists: {target}")
        bone.name = target
        applied[source] = target
        for obj in meshes:
            group = obj.vertex_groups.get(source)
            if group is not None:
                group.name = target
    return applied


def load_image(path: Path, name: str, *, data: bool = False) -> bpy.types.Image:
    image = bpy.data.images.load(str(path), check_existing=False)
    image.name = name
    image.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return image


def build_material(
    source_name: str,
    spec: dict,
    images: dict[str, bpy.types.Image],
) -> bpy.types.Material:
    material = bpy.data.materials.new(spec["name"])
    material.use_nodes = True
    material.use_backface_culling = not spec.get("double_sided", False)
    material.diffuse_color = spec.get("base_factor", (1.0, 1.0, 1.0, 1.0))
    material["toonRole"] = spec["role"]
    material["sourceMaterial"] = source_name
    material["surfaceModel"] = "neutral-pbr"

    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (720, 0)
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (420, 0)
    bsdf.inputs["Base Color"].default_value = spec.get(
        "base_factor", (1.0, 1.0, 1.0, 1.0)
    )
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = spec["roughness"]
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    base_key = spec.get("base")
    if base_key:
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.name = "BaseColorTexture"
        texture.label = base_key
        texture.location = (-480, 120)
        texture.image = images[base_key]
        tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])

    normal_key = spec.get("normal")
    if normal_key:
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.name = "NormalTexture"
        texture.label = normal_key
        texture.location = (-480, -160)
        texture.image = images[normal_key]
        normal = tree.nodes.new("ShaderNodeNormalMap")
        normal.location = (160, -160)
        normal.inputs["Strength"].default_value = 1.0
        tree.links.new(texture.outputs["Color"], normal.inputs["Color"])
        tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])

    mask_key = spec.get("alpha_mask")
    if mask_key:
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.name = "AlphaMaskTexture"
        texture.label = mask_key
        texture.location = (-480, -420)
        texture.image = images[mask_key]
        clip = tree.nodes.new("ShaderNodeMath")
        clip.name = "AlphaClip"
        clip.operation = "GREATER_THAN"
        clip.inputs[1].default_value = 0.5
        clip.location = (160, -420)
        tree.links.new(texture.outputs["Alpha"], clip.inputs[0])
        tree.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"

    return material


def rebuild_materials(
    meshes: list[bpy.types.Object],
    extracted: dict[str, Path],
) -> list[bpy.types.Material]:
    images: dict[str, bpy.types.Image] = {}
    color_keys = {
        spec.get("base")
        for spec in MATERIAL_SPECS.values()
        if spec.get("base")
    }
    data_keys = {
        value
        for spec in MATERIAL_SPECS.values()
        for value in (spec.get("normal"), spec.get("alpha_mask"))
        if value
    }
    for key in sorted(color_keys):
        images[key] = load_image(extracted[key], key, data=False)
    for key in sorted(data_keys):
        images[key] = load_image(extracted[key], key, data=True)

    replacements = {
        source: build_material(source, spec, images)
        for source, spec in MATERIAL_SPECS.items()
    }
    used = set()
    for obj in meshes:
        for slot in obj.material_slots:
            source = slot.material.name if slot.material else ""
            replacement = replacements.get(source)
            if replacement is None:
                raise RuntimeError(f"No neutral material mapping for {obj.name}:{source}")
            slot.material = replacement
            used.add(replacement)

    expected = set(replacements.values())
    unused = sorted(material.name for material in expected - used)
    if unused:
        raise RuntimeError(f"Neutral material mappings were not used: {', '.join(unused)}")

    for material in list(bpy.data.materials):
        if material not in used:
            bpy.data.materials.remove(material)
    return sorted(used, key=lambda entry: entry.name)


def world_bounds(meshes: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = [min(point[index] for point in points) for index in range(3)]
    high = [max(point[index] for point in points) for index in range(3)]
    return low, high


def export_glb(path: Path) -> None:
    candidate_options = {
        "filepath": str(path),
        "export_format": "GLB",
        "export_materials": "EXPORT",
        "export_animations": True,
        "export_skins": True,
        "export_morph": True,
        "export_morph_normal": True,
        "export_morph_tangent": False,
        "export_yup": True,
        "export_extras": True,
        "export_all_influences": True,
        "export_all_vertex_colors": True,
        "export_def_bones": False,
        "export_lights": False,
        "export_cameras": False,
        "export_unused_images": False,
    }
    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    options = {key: value for key, value in candidate_options.items() if key in supported}
    result = bpy.ops.export_scene.gltf(**options)
    if "FINISHED" not in result or not path.exists():
        raise RuntimeError(f"Blender did not produce the expected GLB: {path}")


def main() -> None:
    args = parse_args()
    package = args.package.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not package.is_file():
        raise FileNotFoundError(package)
    output.mkdir(parents=True, exist_ok=True)
    texture_output = output / "textures"
    source_output = output / "source"
    texture_output.mkdir(parents=True, exist_ok=True)
    source_output.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="toonlab-yua-") as temp_name:
        work_dir = Path(temp_name)
        extracted = extract_unity_assets(package, work_dir)
        eye_png = work_dir / "eye_albedo.png"
        convert_eye_psd(extracted["eye_albedo_psd"], eye_png)
        extracted["eye_albedo"] = eye_png

        for key, filename in AUXILIARY_TEXTURES.items():
            shutil.copy2(extracted[key], texture_output / filename)

        clear_scene()
        armature, meshes = import_source_fbx(extracted["fbx"])
        removed_shape_keys = remove_separator_shape_keys(meshes)
        applied_bone_renames = rename_humanoid_bones(armature, meshes)
        materials = rebuild_materials(meshes, extracted)
        # FBX import records every source image path even after its original
        # materials are replaced.  Remove those orphan datablocks so the clean
        # Blend never tries to pack the author's unavailable Windows paths.
        for image in list(bpy.data.images):
            if image.name != "Render Result" and image.users == 0:
                bpy.data.images.remove(image)

        bpy.context.scene.unit_settings.system = "METRIC"
        bpy.context.scene.unit_settings.scale_length = 1.0
        bpy.context.scene["toonlabCharacter"] = "Yua"
        bpy.context.scene["surfaceModel"] = "neutral-pbr"

        low, high = world_bounds(meshes)
        size = [high[index] - low[index] for index in range(3)]
        morph_targets = {
            obj.name: [
                key.name
                for key in obj.data.shape_keys.key_blocks[1:]
            ] if obj.data.shape_keys else []
            for obj in meshes
        }

        bpy.ops.file.pack_all()
        clean_blend = source_output / "yua-clean.blend"
        # The derived source is reproducible; do not leave Blender's numbered
        # backup copies beside the single canonical clean file.
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(clean_blend), copy=True)

        glb_path = output / "yua.glb"
        export_glb(glb_path)

    manifest = {
        "schema": "toonlab/private-character-build@1",
        "character": "Yua",
        "source": {
            "package": package.name,
            "packageSha256": sha256(package),
            "fbxPath": SOURCE_ASSETS["fbx"],
        },
        "output": {
            "glb": glb_path.name,
            "glbSha256": sha256(glb_path),
            "cleanBlend": str(clean_blend.relative_to(output)),
        },
        "meshes": [obj.name for obj in meshes],
        "materials": [
            {
                "name": material.name,
                "role": material.get("toonRole"),
                "surfaceModel": material.get("surfaceModel"),
            }
            for material in materials
        ],
        "morphTargets": morph_targets,
        "removedNonfunctionalShapeKeys": removed_shape_keys,
        "boneRenames": applied_bone_renames,
        "preservedBoneCount": len(armature.data.bones),
        "sourceBoundsZUpMeters": {
            "min": low,
            "max": high,
            "size": size,
        },
        "auxiliaryTextures": sorted(AUXILIARY_TEXTURES.values()),
        "shaderNeutral": True,
    }
    manifest_path = output / "yua-build.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps({
        "glb": str(glb_path),
        "glbBytes": glb_path.stat().st_size,
        "manifest": str(manifest_path),
        "meshCount": len(meshes),
        "materialCount": len(materials),
        "morphTargetCount": sum(len(values) for values in morph_targets.values()),
        "boneCount": len(armature.data.bones),
        "dimensionsMeters": size,
    }, indent=2))


if __name__ == "__main__":
    main()
