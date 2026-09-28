"""Hash-bound MeshLib 3.1.3 precise self-collision audit for one rock GLB.

Geometry is loaded without material authority, then attribute-split vertices
are welded only when their XYZ values are exactly equal.  The authoritative
gate is MeshLib ``findSelfCollidingEdgeTrisPrecise`` using its integer-space
converter.  Triangle-pair and PyMeshLab results are useful diagnostics but are
not substitutes for this precise hit count.
"""

from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import version as package_version
import json
import os
from pathlib import Path
import sys
import traceback


REQUIRED_VERSION_PREFIX = "3.1.3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_runtime() -> tuple[object, object, object, object, dict[str, object]]:
    try:
        import numpy as np  # type: ignore
        import pymeshlab  # type: ignore
        import meshlib  # type: ignore
        from meshlib import mrmeshnumpy, mrmeshpy  # type: ignore
    except ModuleNotFoundError as error:
        raise RuntimeError("MeshLib audit runtime requires numpy, pymeshlab, and meshlib") from error
    version = package_version("meshlib")
    native = Path(mrmeshpy.__file__).resolve()
    module = Path(meshlib.__file__).resolve()
    runtime = {
        "pythonExecutable": str(Path(sys.executable).resolve()),
        "pythonPathEnvironment": os.environ.get("PYTHONPATH", ""),
        "meshlibPackageVersion": version,
        "requiredVersionPrefix": REQUIRED_VERSION_PREFIX,
        "versionRequirementPass": version.startswith(REQUIRED_VERSION_PREFIX),
        "meshlibModule": {"path": str(module), "sha256": sha256(module)},
        "meshlibNativeModule": {"path": str(native), "sha256": sha256(native)},
        "preciseApi": "meshlib.mrmeshpy.findSelfCollidingEdgeTrisPrecise",
        "converterApi": "meshlib.mrmeshpy.getToIntConverter",
    }
    return np, pymeshlab, mrmeshnumpy, mrmeshpy, runtime


def probe() -> dict[str, object]:
    *_modules, runtime = _load_runtime()
    if not runtime["versionRequirementPass"]:
        raise RuntimeError(f"MeshLib {runtime['meshlibPackageVersion']} does not satisfy {REQUIRED_VERSION_PREFIX}.x")
    return {
        "schema": "toonlab/meshlib-precise-audit-runtime-probe",
        "version": 1,
        "runtime": runtime,
        "pass": True,
    }


def audit(input_path: str, expected_sha256: str) -> dict[str, object]:
    np, pymeshlab, mrmeshnumpy, mrmeshpy, runtime = _load_runtime()
    if not runtime["versionRequirementPass"]:
        raise RuntimeError(f"MeshLib {runtime['meshlibPackageVersion']} does not satisfy {REQUIRED_VERSION_PREFIX}.x")
    source = Path(input_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    actual = sha256(source)
    if actual != expected_sha256.lower().removeprefix("sha256:"):
        raise RuntimeError(f"Fail-closed input hash mismatch: {actual}")

    mesh_set = pymeshlab.MeshSet()
    mesh_set.load_new_mesh(str(source))
    mesh_count = mesh_set.mesh_number() if hasattr(mesh_set, "mesh_number") else mesh_set.number_meshes()
    if mesh_count != 1:
        raise RuntimeError(f"Expected one GLB mesh, loader returned {mesh_count}")
    source_mesh = mesh_set.current_mesh()
    raw_vertices = np.asarray(source_mesh.vertex_matrix(), dtype=np.float64)
    raw_faces = np.asarray(source_mesh.face_matrix(), dtype=np.int64)
    if raw_vertices.ndim != 2 or raw_vertices.shape[1] != 3 or raw_faces.ndim != 2 or raw_faces.shape[1] != 3:
        raise RuntimeError("MeshLib precise audit requires finite triangle geometry")
    if not np.isfinite(raw_vertices).all():
        raise RuntimeError("Non-finite GLB vertex position")

    # np.unique compares the exact loaded float64 XYZ tuple.  No tolerance or
    # spatial epsilon is admitted by this weld.
    vertices, inverse = np.unique(raw_vertices, axis=0, return_inverse=True)
    faces = inverse[raw_faces]
    repeated = np.any(
        np.stack((faces[:, 0] == faces[:, 1], faces[:, 1] == faces[:, 2], faces[:, 2] == faces[:, 0]), axis=1),
        axis=1,
    )
    if bool(repeated.any()):
        raise RuntimeError(f"Exact-position welding exposed {int(repeated.sum())} repeated-index triangles")

    vertices32 = np.ascontiguousarray(vertices, dtype=np.float32)
    faces32 = np.ascontiguousarray(faces, dtype=np.int32)
    mesh = mrmeshnumpy.meshFromFacesVerts(faces32, vertices32, duplicateNonManifoldVertices=False)
    mesh_part = mrmeshpy.MeshPart(mesh)
    minimum = vertices32.min(axis=0).astype(float)
    maximum = vertices32.max(axis=0).astype(float)
    converter = mrmeshpy.getToIntConverter(
        mrmeshpy.Box3d(mrmeshpy.Vector3d(*minimum), mrmeshpy.Vector3d(*maximum))
    )
    precise = mrmeshpy.findSelfCollidingEdgeTrisPrecise(mesh_part, converter)
    values = [(int(hit.edge), int(hit.tri)) for hit in precise]
    pairs = mrmeshpy.findSelfCollidingTriangles(mesh_part, touchIsIntersection=False)
    pair_values = [(int(pair.aFace), int(pair.bFace)) for pair in pairs]
    return {
        "schema": "toonlab/rock-glb-meshlib-precise-self-intersection-audit",
        "version": 1,
        "runtime": runtime,
        "method": {
            "loader": "PyMeshLab GLB geometry loader; materials ignored",
            "weld": "numpy exact-equality unique XYZ tuples; no tolerance",
            "authority": "MeshLib findSelfCollidingEdgeTrisPrecise integer edge/triangle hits",
            "trianglePairsSupplemental": True,
            "touchIsIntersectionForSupplementalPairs": False,
        },
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": actual},
        "exactPositionWeld": {
            "rawVertices": int(len(raw_vertices)),
            "weldedVertices": int(len(vertices)),
            "duplicatesWelded": int(len(raw_vertices) - len(vertices)),
            "faces": int(len(faces)),
            "repeatedIndexFacesAfterWeld": 0,
        },
        "meshlib": {
            "preciseIntegerEdgeTriangleHits": len(values),
            "samplePreciseEdgeTriangleHits": [list(value) for value in values[:24]],
            "triangleIntersectionPairs": len(pair_values),
            "sampleTriangleIntersectionPairs": [list(value) for value in pair_values[:24]],
        },
        "pass": len(values) == 0,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--expected-sha256")
    arguments = parser.parse_args(argv)
    try:
        if arguments.probe:
            result = probe()
        else:
            if not arguments.input or not arguments.output or not arguments.expected_sha256:
                raise RuntimeError("Audit mode requires --input, --output, and --expected-sha256")
            result = audit(arguments.input, arguments.expected_sha256)
            output = Path(arguments.output).expanduser().resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 0 if result["pass"] else 1
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error), "traceback": traceback.format_exc()}, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
