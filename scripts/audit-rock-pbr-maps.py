#!/usr/bin/env python3
"""Fail-closed numerical audit for a baked rock PBR texture set.

The audit does not replace visual review.  It catches malformed dimensions,
flat/empty channels, non-finite values, and selected-to-active tangent normals
that point behind the low-poly surface (a common wrong-surface ray hit).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def _channel_stats(values: np.ndarray) -> dict[str, float]:
    return {
        "minimum": float(values.min()),
        "p01": float(np.quantile(values, 0.01)),
        "median": float(np.quantile(values, 0.50)),
        "p99": float(np.quantile(values, 0.99)),
        "maximum": float(values.max()),
        "standardDeviation": float(values.std()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--basecolor", type=Path, required=True)
    parser.add_argument("--normal", type=Path, required=True)
    parser.add_argument("--roughness", type=Path, required=True)
    parser.add_argument("--ao", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    paths = {
        "baseColor": options.basecolor.resolve(),
        "normal": options.normal.resolve(),
        "roughness": options.roughness.resolve(),
        "ao": options.ao.resolve(),
    }
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    images = {name: _rgb(path) for name, path in paths.items()}
    shapes = {name: list(image.shape) for name, image in images.items()}
    shape_set = {tuple(shape) for shape in shapes.values()}
    dimensions_match = len(shape_set) == 1
    minimum_resolution = min(images["baseColor"].shape[:2])

    base_luminance = (
        images["baseColor"][..., 0] * 0.2126
        + images["baseColor"][..., 1] * 0.7152
        + images["baseColor"][..., 2] * 0.0722
    )
    roughness = images["roughness"][..., 0]
    ao = images["ao"][..., 0]
    # Blender leaves unused atlas texels black in scalar/color bakes.  Those
    # texels are neither runtime surface data nor ray misses, so all material
    # statistics and thresholds are evaluated only over the padded UV
    # coverage carried by the base-color bake.
    coverage = base_luminance > (1.0 / 255.0)
    if not np.any(coverage):
        raise RuntimeError("Base-color bake contains no covered UV texels")

    decoded = images["normal"] * 2.0 - 1.0
    normal_length = np.linalg.norm(decoded, axis=2)
    tangent_z = decoded[..., 2]
    negative_z_fraction = float(np.mean(tangent_z[coverage] < 0.0))
    low_z_fraction = float(np.mean(tangent_z[coverage] < 0.25))
    nonunit_fraction = float(np.mean(np.abs(normal_length[coverage] - 1.0) > 0.08))
    extreme_reversal_fraction = float(
        np.mean(
            (
                (tangent_z < 0.25)
                & (np.maximum(np.abs(decoded[..., 0]), np.abs(decoded[..., 1])) > 0.95)
            )[coverage]
        )
    )

    checks = {
        "dimensionsMatch": dimensions_match,
        "minimumResolutionAtLeast1024": minimum_resolution >= 1024,
        "baseColorHasTonalRange": float(np.quantile(base_luminance[coverage], 0.99) - np.quantile(base_luminance[coverage], 0.01)) >= 0.08,
        "roughnessIsDryStoneRange": float(np.quantile(roughness[coverage], 0.01)) >= 0.50 and float(np.quantile(roughness[coverage], 0.99)) <= 1.0,
        "roughnessIsNotFlat": float(roughness[coverage].std()) >= 0.01,
        "aoIsNotFlat": float(ao[coverage].std()) >= 0.01,
        "normalNegativeZBelow0.05Percent": negative_z_fraction <= 0.0005,
        "normalLowZBelow0.20Percent": low_z_fraction <= 0.002,
        "normalNonunitBelow1Percent": nonunit_fraction <= 0.01,
        "normalExtremeReversalBelow0.02Percent": extreme_reversal_fraction <= 0.0002,
    }
    report = {
        "schema": "toonlab/rock-pbr-map-audit",
        "version": 1,
        "paths": {
            name: {"file": str(path), "bytes": path.stat().st_size, "sha256": _sha(path)}
            for name, path in paths.items()
        },
        "shapes": shapes,
        "statistics": {
            "uvCoverageFraction": float(np.mean(coverage)),
            "baseColorLuminance": _channel_stats(base_luminance[coverage]),
            "roughness": _channel_stats(roughness[coverage]),
            "ao": _channel_stats(ao[coverage]),
            "normalLength": _channel_stats(normal_length[coverage]),
            "normalTangentZ": _channel_stats(tangent_z[coverage]),
            "normalNegativeZFraction": negative_z_fraction,
            "normalLowZFraction": low_z_fraction,
            "normalNonunitFraction": nonunit_fraction,
            "normalExtremeReversalFraction": extreme_reversal_fraction,
        },
        "checks": checks,
        "passed": all(checks.values()),
        "automaticVisualApproval": False,
    }
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "checks": checks, "statistics": report["statistics"]}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
