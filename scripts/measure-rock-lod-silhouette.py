#!/usr/bin/env python3
"""Measure deterministic silhouette retention for the hoodoo mobile LODs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


VIEWS = ("front", "rear", "left", "right", "top", "bottom")
DEFAULT_LODS = ("lod0", "lod1", "lod2")
DEFAULT_THRESHOLDS = (0.985, 0.975, 0.950)


def _mask(path: Path) -> np.ndarray:
    pixels = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    return pixels.mean(axis=2) < 48.0


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--renders", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--lods", default=",".join(DEFAULT_LODS))
    parser.add_argument("--thresholds", default=",".join(str(value) for value in DEFAULT_THRESHOLDS))
    options = parser.parse_args()
    lods = tuple(value.strip() for value in options.lods.split(",") if value.strip())
    thresholds = tuple(float(value) for value in options.thresholds.split(","))
    if not lods or len(lods) != len(thresholds):
        raise ValueError("--lods and --thresholds must contain the same non-zero number of entries")
    rows = []
    for view in VIEWS:
        source_path = options.renders / f"high-silhouette-{view}.png"
        source = _mask(source_path)
        for lod in lods:
            candidate_path = options.renders / f"{lod}-silhouette-{view}.png"
            candidate = _mask(candidate_path)
            intersection = int(np.logical_and(source, candidate).sum())
            union = int(np.logical_or(source, candidate).sum())
            source_area = int(source.sum())
            candidate_area = int(candidate.sum())
            rows.append({
                "view": view,
                "lod": lod,
                "intersectionOverUnion": intersection / max(1, union),
                "sourceAreaPixels": source_area,
                "candidateAreaPixels": candidate_area,
                "signedAreaDeltaPercent": (candidate_area - source_area) / max(1, source_area) * 100.0,
                "sourceSha256": _sha(source_path),
                "candidateSha256": _sha(candidate_path),
            })
    minima = {
        lod: min(row["intersectionOverUnion"] for row in rows if row["lod"] == lod)
        for lod in lods
    }
    report = {
        "schema": "toonlab/rock-lod-silhouette-audit",
        "version": 1,
        "thresholdPolicy": dict(zip(lods, thresholds)),
        "minimumIou": minima,
        "passed": all(minima[lod] >= threshold for lod, threshold in zip(lods, thresholds)),
        "rows": rows,
    }
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"minimumIou": minima, "passed": report["passed"]}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
