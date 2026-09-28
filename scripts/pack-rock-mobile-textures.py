#!/usr/bin/env python3
"""Pack hoodoo AO/roughness into ORM and build renormalized mobile maps."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        size = list(image.size)
        mode = image.mode
    return {
        "file": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": _sha(path),
        "size": size,
        "mode": mode,
    }


def _normal_resize(source: Image.Image, size: int) -> Image.Image:
    resized = source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    values = np.asarray(resized, dtype=np.float32) / 255.0 * 2.0 - 1.0
    lengths = np.linalg.norm(values, axis=2, keepdims=True)
    values = values / np.maximum(lengths, 1.0e-8)
    encoded = np.clip((values * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(encoded)


def _orm(ao: Image.Image, roughness: Image.Image, size: int) -> Image.Image:
    ao_channel = ao.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    rough_channel = roughness.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    zero = Image.new("L", (size, size), color=0)
    return Image.merge("RGB", (ao_channel, rough_channel, zero))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--master-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--mobile-size",
        type=int,
        action="append",
        dest="mobile_sizes",
        help="Runtime texture size; repeat to build more than one tier (default: 2048)",
    )
    options = parser.parse_args()
    mobile_sizes = sorted(set(options.mobile_sizes or [2048]), reverse=True)
    if any(size not in {1024, 2048} for size in mobile_sizes):
        raise ValueError("Every mobile size must be 1024 or 2048")
    options.output_dir.mkdir(parents=True, exist_ok=True)
    base_path = options.master_dir / "hoodoo-caprock-basecolor-4096.png"
    normal_path = options.master_dir / "hoodoo-caprock-normal-4096.png"
    rough_path = options.master_dir / "hoodoo-caprock-roughness-4096.png"
    ao_path = options.master_dir / "hoodoo-caprock-ao-4096.png"
    for path in (base_path, normal_path, rough_path, ao_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    with Image.open(base_path) as base, Image.open(normal_path) as normal, Image.open(rough_path) as rough, Image.open(ao_path) as ao:
        master_orm = _orm(ao, rough, 4096)
        master_orm_path = options.output_dir / "hoodoo-caprock-orm-4096.png"
        master_orm.save(master_orm_path, optimize=True)

        mobile_paths: list[Path] = []
        for mobile_size in mobile_sizes:
            mobile_base_path = options.output_dir / f"hoodoo-caprock-basecolor-{mobile_size}.png"
            base.convert("RGB").resize(
                (mobile_size, mobile_size),
                Image.Resampling.LANCZOS,
            ).save(mobile_base_path, optimize=True)

            mobile_normal_path = options.output_dir / f"hoodoo-caprock-normal-{mobile_size}.png"
            _normal_resize(normal, mobile_size).save(mobile_normal_path, optimize=True)

            mobile_orm_path = options.output_dir / f"hoodoo-caprock-orm-{mobile_size}.png"
            _orm(ao, rough, mobile_size).save(mobile_orm_path, optimize=True)
            mobile_paths.extend((mobile_base_path, mobile_normal_path, mobile_orm_path))

    report = {
        "schema": "toonlab/rock-mobile-texture-pack",
        "version": 1,
        "mobileSizes": mobile_sizes,
        "channelContract": {
            "ormR": "ambient occlusion",
            "ormG": "roughness",
            "ormB": "metallic=0",
            "normal": "OpenGL tangent-space; renormalized after downsampling",
            "baseColor": "AO-free sRGB",
        },
        "masters": [_record(path) for path in (base_path, normal_path, rough_path, ao_path, master_orm_path)],
        "mobile": [_record(path) for path in mobile_paths],
    }
    report_path = options.output_dir / "texture-pack-audit.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(report_path), "mobile": report["mobile"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
