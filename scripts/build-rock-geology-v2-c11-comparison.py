#!/usr/bin/env python3
"""Build the fixed-camera neutral/stylized six-view C11 A/B board."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


VIEWS = ("front", "rear", "left", "right", "top", "bottom")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--neutral-template", required=True)
    parser.add_argument("--styled-template", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", default="C11 hoodoo · neutral vs stylized")
    parser.add_argument(
        "--subtitle",
        default="Same 180k mesh · same 4K source PBR · same orthographic cameras and lighting · material branch only",
    )
    args = parser.parse_args()

    for template in (args.neutral_template, args.styled_template):
        if "{view}" not in template:
            raise SystemExit("both templates must contain {view}")

    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    inputs = []
    width, header, pair_width, row_height = 2400, 170, 800, 590
    height = header + row_height * 2
    canvas = Image.new("RGB", (width, height), "#11171e")
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 46)
    view_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 29)
    state_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
    note_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    draw.text((48, 28), args.title, fill="#f2f6fa", font=title_font)
    draw.text(
        (50, 96),
        args.subtitle,
        fill="#a5b0bd",
        font=note_font,
    )

    for index, view in enumerate(VIEWS):
        column, row = index % 3, index // 3
        left, top = column * pair_width, header + row * row_height
        draw.rectangle((left + 8, top + 8, left + pair_width - 8, top + row_height - 8), fill="#1b232c", outline="#44515f", width=2)
        view_label = view.upper() if view != "bottom" else "BOTTOM / SUPPORT"
        draw.text((left + 26, top + 22), view_label, fill="#f2f6fa", font=view_font)

        for state_index, (state, template) in enumerate((
            ("NEUTRAL", args.neutral_template),
            ("STYLIZED", args.styled_template),
        )):
            source_path = Path(template.format(view=view)).expanduser().resolve()
            if not source_path.is_file():
                raise SystemExit(f"missing {state.lower()} input: {source_path}")
            box_left = left + 22 + state_index * 388
            box_top = top + 84
            box_size = (366, 440)
            with Image.open(source_path) as source:
                fitted = ImageOps.contain(source.convert("RGB"), box_size, Image.Resampling.LANCZOS)
            paste_x = box_left + (box_size[0] - fitted.width) // 2
            paste_y = box_top + 34 + (box_size[1] - 34 - fitted.height) // 2
            canvas.paste(fitted, (paste_x, paste_y))
            label_color = "#b7c1cc" if state == "NEUTRAL" else "#f2a06f"
            draw.text((box_left, box_top), state, fill=label_color, font=state_font)
            inputs.append({
                "view": view,
                "state": state.lower(),
                "file": str(source_path),
                "sha256": sha256(source_path),
            })

    canvas.save(output, "PNG", optimize=True)
    audit = {
        "schema": "toonlab/rock-geology-v2-c11-neutral-styled-board",
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "cameraOrder": list(VIEWS),
        "comparisonContract": "same mesh, source PBR, cameras, framing, and lighting",
        "inputs": inputs,
        "output": {"file": str(output), "sha256": sha256(output), "width": width, "height": height},
    }
    audit_path = output.with_suffix(".json")
    audit_path.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"board": str(output), "audit": str(audit_path), "sha256": audit["output"]["sha256"]}, indent=2))


if __name__ == "__main__":
    main()
