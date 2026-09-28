"""Independent PyMeshLab hook for a hash-bound exported rock GLB.

PyMeshLab is intentionally imported lazily so this helper can be syntax-tested
without installing it into Blender's Python.  Use a dedicated interpreter that
has PyMeshLab installed; the repair manifest records that exact command.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import traceback


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def audit(input_path: str, expected_sha256: str) -> dict[str, object]:
    source = Path(input_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    actual = sha256(source)
    if actual != expected_sha256.lower().removeprefix("sha256:"):
        raise RuntimeError(f"Fail-closed input hash mismatch: {actual}")
    try:
        import pymeshlab  # type: ignore
    except ModuleNotFoundError as error:
        raise RuntimeError("PyMeshLab is not installed in this interpreter") from error

    meshes = pymeshlab.MeshSet()
    meshes.load_new_mesh(str(source))
    mesh_count = meshes.mesh_number() if hasattr(meshes, "mesh_number") else meshes.number_meshes()
    if mesh_count != 1:
        raise RuntimeError(f"Expected one GLB mesh, PyMeshLab loaded {mesh_count}")
    # Supplemental parity only: perform the same exact-position duplicate
    # removal used by the cohort audit before asking MeshLab's face selector.
    if hasattr(meshes, "meshing_remove_duplicate_vertices"):
        meshes.meshing_remove_duplicate_vertices()
    mesh = meshes.current_mesh()
    before_faces = int(mesh.face_number())
    meshes.apply_filter("compute_selection_by_self_intersections_per_face")
    selection = meshes.current_mesh().face_selection_array()
    selected_faces = int(selection.sum())
    return {
        "schema": "toonlab/rock-glb-pymeshlab-self-intersection-audit",
        "version": 1,
        "method": {
            "library": "PyMeshLab",
            "filter": "compute_selection_by_self_intersections_per_face",
            "measurement": "count of faces selected by MeshLab self-intersection filter",
            "independentFromBlenderRepair": True,
        },
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": actual},
        "meshCount": mesh_count,
        "faces": before_faces,
        "selfIntersectingFaceCount": selected_faces,
        "supplementalOnly": True,
        "pass": selected_faces == 0,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-sha256", required=True)
    arguments = parser.parse_args(argv)
    try:
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
