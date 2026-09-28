#!/usr/bin/env python3
"""Apply a silhouette-locked geology palette to neutral rock turnarounds.

This is deliberately not generative.  It preserves every source pixel's
luminance and spatial detail, estimates a soft foreground mask from the clean
studio plate, and changes chroma only inside the rock.  It is suitable for
giving image-to-3D providers color evidence without redrawing approved shape.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


PALETTE = {
    "shadow": (0.24, 0.105, 0.065),
    "darkMid": (0.43, 0.205, 0.115),
    "mid": (0.67, 0.345, 0.205),
    "highlight": (0.86, 0.625, 0.405),
    "limestoneHighlight": (0.93, 0.795, 0.615),
}
PALETTE_STOPS = (0.0, 0.24, 0.49, 0.73, 1.0)
AUTHORITY = {
    "organization": "U.S. Geological Survey",
    "url": "https://www.usgs.gov/geology-and-ecology-of-national-parks/geology-bryce-canyon-national-park",
    "evidence": "Claron Formation hoodoos are fine-grained sedimentary rocks with bright orange and light tan hues; iron-bearing units produce rust-red and orange coloration.",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _largest_component(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            pending = [(y, x)]
            visited[y, x] = True
            component: list[tuple[int, int]] = []
            while pending:
                cy, cx = pending.pop()
                component.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        pending.append((ny, nx))
            if len(component) > len(best):
                best = component
    result = np.zeros_like(mask, dtype=bool)
    if best:
        ys, xs = zip(*best, strict=True)
        result[np.asarray(ys), np.asarray(xs)] = True
    return result


def _soft_subject_mask(rgb: np.ndarray) -> np.ndarray:
    luminance = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    border = np.concatenate((luminance[:20].ravel(), luminance[-20:].ravel(), luminance[:, :20].ravel(), luminance[:, -20:].ravel()))
    background = float(np.median(border))
    candidate = (luminance < background - 0.018) | (chroma > 0.020)
    component = _largest_component(candidate)
    hard = Image.fromarray(component.astype(np.uint8) * 255, mode="L")
    expanded = hard.filter(ImageFilter.MaxFilter(7))
    feathered = expanded.filter(ImageFilter.GaussianBlur(1.35))
    soft = np.asarray(feathered, dtype=np.float32) / 255.0
    # Suppress accidental neutral studio shadow while retaining brown edge pixels.
    confidence = np.clip((background - luminance) / 0.030 + chroma / 0.045, 0.0, 1.0)
    return np.clip(soft * confidence, 0.0, 1.0)


def _palette_color(luminance: np.ndarray) -> np.ndarray:
    values = np.clip(luminance, 0.0, 1.0)
    colors = np.asarray(list(PALETTE.values()), dtype=np.float32)
    result = np.zeros((*values.shape, 3), dtype=np.float32)
    for index in range(len(PALETTE_STOPS) - 1):
        lower = PALETTE_STOPS[index]
        upper = PALETTE_STOPS[index + 1]
        amount = np.clip((values - lower) / (upper - lower), 0.0, 1.0)[..., None]
        segment = colors[index] * (1.0 - amount) + colors[index + 1] * amount
        selector = ((values >= lower) & (values <= upper))[..., None]
        result = np.where(selector, segment, result)
    result[values < PALETTE_STOPS[0]] = colors[0]
    result[values > PALETTE_STOPS[-1]] = colors[-1]
    return result


def _colorize(source: Path, destination: Path) -> dict[str, object]:
    with Image.open(source) as image:
        original = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    luminance = original[..., 0] * 0.2126 + original[..., 1] * 0.7152 + original[..., 2] * 0.0722
    mask = _soft_subject_mask(original)
    palette = _palette_color(luminance)
    # Preserve the exact source luminance so relief and silhouette evidence do not change.
    palette_luminance = palette[..., 0] * 0.2126 + palette[..., 1] * 0.7152 + palette[..., 2] * 0.0722
    palette *= (luminance / np.maximum(palette_luminance, 1.0e-5))[..., None]
    palette = np.clip(palette, 0.0, 1.0)
    blended = original * (1.0 - mask[..., None]) + palette * mask[..., None]
    output = Image.fromarray(np.clip(blended * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, optimize=True)
    output_array = np.asarray(output, dtype=np.float32) / 255.0
    output_luminance = output_array[..., 0] * 0.2126 + output_array[..., 1] * 0.7152 + output_array[..., 2] * 0.0722
    return {
        "source": str(source.resolve()),
        "sourceSha256": _sha256(source),
        "output": str(destination.resolve()),
        "outputSha256": _sha256(destination),
        "size": list(output.size),
        "maskCoverage": float(mask.mean()),
        "maximumLuminanceDelta": float(np.max(np.abs(luminance - output_luminance))),
        "meanLuminanceDelta": float(np.mean(np.abs(luminance - output_luminance))),
    }


def _contact_sheet(files: list[Path], destination: Path) -> None:
    labels = [path.stem for path in files]
    tiles = []
    for label, path in zip(labels, files, strict=True):
        tile = ImageOps.contain(Image.open(path).convert("RGB"), (512, 512))
        tiles.append((label, tile))
    sheet = Image.new("RGB", (512 * 3, 512 * 2), (28, 31, 36))
    for index, (_label, tile) in enumerate(tiles):
        sheet.paste(tile, ((index % 3) * 512, (index // 3) * 512))
    sheet.save(destination, quality=94, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    options = parser.parse_args()
    names = ("front", "rear", "left", "right", "top", "bottom")
    records = []
    outputs = []
    for name in names:
        source = options.input_dir / f"{name}.png"
        destination = options.output_dir / f"{name}.png"
        if not source.is_file():
            raise FileNotFoundError(source)
        records.append({"view": name, **_colorize(source, destination)})
        outputs.append(destination)
    contact_sheet = options.output_dir / "contact-sheet.jpg"
    _contact_sheet(outputs, contact_sheet)
    report = {
        "schema": "toonlab/geology-palette-locked-turnaround",
        "version": 1,
        "operation": "chroma-only color grade; no generative redraw, resampling, crop, rotation, or silhouette edit",
        "palette": {name: list(color) for name, color in PALETTE.items()},
        "paletteStops": list(PALETTE_STOPS),
        "authority": AUTHORITY,
        "natureReference": {
            "file": str(options.reference.resolve()),
            "sha256": _sha256(options.reference),
            "role": "morphology and lithology color anchor; not a seamless PBR texture",
        },
        "records": records,
        "contactSheet": {
            "file": str(contact_sheet.resolve()),
            "sha256": _sha256(contact_sheet),
        },
        "eligibleUse": "color-conditioned reconstruction or texture hypothesis",
        "notEligibleUse": "measured material scan or proof of unseen geometry",
    }
    report_path = options.output_dir / "audit.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(report_path), "contactSheet": str(contact_sheet), "records": len(records)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
