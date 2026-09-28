#!/usr/bin/env python3
"""Build a hash-bound six-view C11 rock review snapshot.

The script deliberately treats the six rendered inputs as immutable evidence. It
only composites them into a labeled 3x2 sheet and writes a sibling JSON audit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


VIEW_ORDER = ("front", "rear", "left", "right", "top", "bottom")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input-template",
        required=True,
        help="Absolute or cwd-relative template containing {view}.",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--subtitle", default="")
    return parser.parse_args()


def main() -> None:
    options = parse_args()
    if "{view}" not in options.input_template:
        raise SystemExit("--input-template must contain {view}")

    inputs = {
        view: Path(options.input_template.format(view=view)).expanduser().resolve()
        for view in VIEW_ORDER
    }
    missing = [str(path) for path in inputs.values() if not path.is_file()]
    if missing:
        raise SystemExit(f"missing input renders: {missing}")

    output = Path(options.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    sheet_width = 1800
    header_height = 150
    cell_width = sheet_width // 3
    cell_height = 500
    sheet_height = header_height + cell_height * 2
    background = (17, 22, 29, 255)
    panel = (28, 35, 44, 255)
    primary = (242, 246, 250, 255)
    secondary = (165, 176, 189, 255)
    border = (67, 78, 91, 255)

    canvas = Image.new("RGBA", (sheet_width, sheet_height), background)
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 44)
    subtitle_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)

    draw.text((48, 30), options.title, fill=primary, font=title_font)
    if options.subtitle:
        draw.text((50, 94), options.subtitle, fill=secondary, font=subtitle_font)

    records = []
    for index, view in enumerate(VIEW_ORDER):
        column = index % 3
        row = index // 3
        left = column * cell_width
        top = header_height + row * cell_height
        right = left + cell_width
        bottom = top + cell_height
        draw.rectangle((left + 8, top + 8, right - 8, bottom - 8), fill=panel, outline=border, width=2)

        label = view.upper() if view != "bottom" else "BOTTOM / SUPPORT"
        draw.text((left + 26, top + 22), label, fill=primary, font=label_font)
        image_box = (left + 20, top + 68, right - 20, bottom - 18)
        max_size = (image_box[2] - image_box[0], image_box[3] - image_box[1])
        with Image.open(inputs[view]) as source:
            source = source.convert("RGBA")
            fitted = ImageOps.contain(source, max_size, Image.Resampling.LANCZOS)
        image_left = image_box[0] + (max_size[0] - fitted.width) // 2
        image_top = image_box[1] + (max_size[1] - fitted.height) // 2
        canvas.alpha_composite(fitted, (image_left, image_top))
        records.append(
            {
                "view": view,
                "file": str(inputs[view]),
                "width": fitted.width,
                "height": fitted.height,
                "sourceSha256": sha256(inputs[view]),
            }
        )

    canvas.convert("RGB").save(output, "PNG", optimize=True)
    audit_path = output.with_suffix(".json")
    audit = {
        "schema": "toonlab/rock-geology-v2-c11-six-view-snapshot",
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "title": options.title,
        "subtitle": options.subtitle,
        "cameraOrder": list(VIEW_ORDER),
        "fixedLayout": "3 columns x 2 rows",
        "inputs": records,
        "output": {
            "file": str(output),
            "width": sheet_width,
            "height": sheet_height,
            "sha256": sha256(output),
        },
    }
    audit_path.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"snapshot": str(output), "audit": str(audit_path), "sha256": audit["output"]["sha256"]}, indent=2))


if __name__ == "__main__":
    main()
