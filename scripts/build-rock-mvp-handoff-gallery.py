#!/usr/bin/env python3
"""Build a hash-bound visual handoff for the rock-geology MVP.

The four roster pages pair the current raw/aligned front clay with the exact
admitted six-view reference.  Cliff-bedded has no provider donor, so its left
panel is the current v11 diagnostic board.  Two supplemental pages summarize
advanced/rejected branches that are intentionally not visible in the raw roster.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WORKSPACE = Path(__file__).resolve().parents[2]
TOONLAB = WORKSPACE / "toonlab"
OUT = TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/handoff-2026-08-18"
ROSTER = TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/roster.json"
TRIAGE = TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-triage/manifest.json"
CLIFF_V11_SOURCE = Path("/private/tmp/c8-v11-cliff-joints/captures/v11-joint-diagnostic-board.png")
CLIFF_V11 = OUT / "cliff-bedded-v11-joint-diagnostic.png"


STATUS = {
    "hoodoo-caprock": (
        "B RAW DONOR · APPROVED VISUAL BENCHMARK · R02 HIGH READY",
        "Raw: 117 components / 42,506 boundary edges; 0 self-X. R02 repaired high is technical-pass. Standalone Stage A is preflight-pass but production-unexecuted.",
    ),
    "tor-block-pile": (
        "B RAW DONOR · R16 SCAFFOLD PASS · R17 BLOCKED ON MAC UNLOCK",
        "Raw: 3 components / 7 boundary-nonmanifold / 20 self-X. R16 exact R13 scaffold passes. R17 must be a real one-pass manual UI sculpt; no R17 geometry exists.",
    ),
    "boulder-rounded": (
        "B RAW DONOR · C2 REJECTED/PARKED",
        "Raw topology is clean, but ripples, pinholes, shallow fused cracks and planar underside miss Hoodoo. Sole smoothing candidate made no visible improvement and was rejected.",
    ),
    "block-jointed": (
        "B RAW DONOR · C2 REJECTED/PARKED",
        "Raw topology is clean, but reconstruction ripple, melted seams and flat underside remain. Sole semantic rebuild became a generic rounded monolith and failed silhouette/topology.",
    ),
    "boulder-river-worn": (
        "B RAW DONOR · C2 REJECTED/PARKED",
        "C2 repaired proportions/support but retained melted planes, synthetic seams, soft top and planar underside. Checkpoint-1 B is preserved; no retry.",
    ),
    "slab-bedded": (
        "B RAW DONOR · NO C2 AUTHORIZED",
        "Technical fail: 6 boundary / 7 nonmanifold / 1 self-X; width -21.17%. Recognizable bedding/support, but melted edges, underside overlap and orientation conflict remain.",
    ),
    "outcrop-jointed": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 4 boundary / 5 nonmanifold / 13 self-X. Every yaw is too deep (+38.75–44.13%); nature evidence is lower/broader than the generated sheet.",
    ),
    "outcrop-bedded": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 5 boundary / 5 nonmanifold / 2 self-X. No authoritative physical dimensions; 3.0 m is display normalization only. Visible morphology decision still required.",
    ),
    "ledge-resistant": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 6 boundary / 4 nonmanifold / 7 self-X. 2.4 m is display normalization only. A is disabled; visible B-versus-C decision still required.",
    ),
    "pillar-residual": (
        "B RAW DONOR · C2 REJECTED/PARKED",
        "Raw has severe width/depth mismatch and cabbage/rosette crown, repeated shelves and radial underside. Sole semantic authority branch failed geological visual gate.",
    ),
    "sea-stack": (
        "B RAW DONOR · C2 TECH PASS / VISUAL REJECTED",
        "Raw has 2 self-X and over-rectangular massing. C2 was watertight/0 self-X but read as a smooth architectural obelisk; rejected and parked.",
    ),
    "volcanic-neck": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 16 boundary / 9 nonmanifold / 6 self-X. All yaws exceed horizontal dimensions by +33.6–60.7%; prompt proportion conflict is unresolved.",
    ),
    "arch-sandstone": (
        "B RAW DONOR · R02 STRUCTURAL REPAIR PASS",
        "Raw: 10 components / 24 boundary-nonmanifold; 0 self-X. R02 is watertight, exact self-X 0, worst six-view IoU 0.999046. No UV/bake/LOD/package.",
    ),
    "boulder-angular": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 0 boundary / 1 nonmanifold / 7 self-X. Every yaw is 28.7–29.3% too deep. Orientation-only review is prepared; scale is blocked.",
    ),
    "sea-stump": (
        "B RAW DONOR · NO C2 AUTHORIZED",
        "Technical fail: 1 nonmanifold edge, 0 self-X. Too narrow/stack-like with fused rosette top, shelf bands, pinched seams and near-planar underside.",
    ),
    "erratic-glacial": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 51 boundary / 39 nonmanifold / 40 self-X. Yaw ±90 passes dimension hypothesis; 0/180 fails width by 29.83%. Provenance cannot come from geometry alone.",
    ),
    "fin-sandstone": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 4 boundary / 3 nonmanifold / 25 self-X. Length-match makes height -40.15%; height-match makes length +67.09% and thickness +46.98%.",
    ),
    "monolith-jointed": (
        "PENDING VISIBLE B/C TRIAGE",
        "Technical fail: 4 boundary / 3 nonmanifold / 4 self-X. All yaws are +85–132% too wide/deep against the prompt. Orientation-only review is prepared.",
    ),
    "overhang-supported": (
        "B RAW DONOR · NO C2 AUTHORIZED",
        "Technical fail: 18 boundary / 10 nonmanifold / 1 self-X. Host/roof/buttress/toe are recognizable, but doorway-like slit, fusion bands and smoothed surfaces miss Hoodoo.",
    ),
    "cliff-bedded": (
        "PROVIDER N/A · V11 FIELD TECH PASS · ADMISSION NOT PASSED",
        "Current v11 joint field verifier 599/599. Gap audit: 1 proven / 5 partial / 4 missing / 5 contradicted; 0/15 admission gates. Freeze current saved mesh before board/bake.",
    ),
}


ADVANCED = [
    (
        "Hoodoo visual floor (approved benchmark only)",
        TOONLAB / "artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/production-scene/hoodoo-production-neutral-vs-stylized-six-view.png",
        "Approved as MVP visual benchmark; does not imply release eligibility, Megascans parity, device approval or Unreal approval.",
    ),
    (
        "Hoodoo R02 repaired high",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/assets/hoodoo-caprock/topology-repair-r02/clay-comparison-r02.png",
        "Technical pass and explicitly visually accepted for downstream rebuild. Standalone Stage A remains unexecuted.",
    ),
    (
        "Tor R16 pre-sculpt scaffold",
        TOONLAB / "artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/mvp-v01-joint-first-authority-r16-r01/visible-evidence-wire-correction-v02/tor-block-pile-r16-pre-sculpt-clay-actual-triangle-wire-board-v02.png",
        "Exact R13 geometry, 8 curves, 16 paired groups, crown/retreat sets and 27 landmarks. R17 manual UI sculpt has not begun.",
    ),
    (
        "Arch R02 structural repair",
        TOONLAB / "artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/arch-sandstone/structural-repair-r02/final/reference-vs-r02-repaired-high-board.png",
        "Watertight, exact self-X 0, worst six-view IoU 0.999046. Technical reserve stress test; no downstream production assets.",
    ),
    (
        "Cliff-bedded v11 diagnostic",
        CLIFF_V11,
        "599/599 structural checks, exact contact endpoints and macro parity. Current admission gap audit still fails closed.",
    ),
]


C2 = [
    (
        "Boulder-rounded C2 — rejected",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-batch/candidates/boulder-rounded/attempt-01/checkpoint-2/boards/checkpoint-2-source-bound-raw-vs-repair.png",
        "Protected smoothing was visually indistinguishable and left artifacts; candidate C. Raw C1 remains B donor.",
    ),
    (
        "Block-jointed C2 — rejected",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-batch/candidates/block-jointed/attempt-01/checkpoint-2/boards/checkpoint-2-source-bound-raw-vs-semantic-high.png",
        "Semantic rebuild became a generic monolith and failed both exact topology and silhouette; candidate C.",
    ),
    (
        "River-worn C2 — rejected",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-batch/candidates/boulder-river-worn/attempt-01/checkpoint-2/candidate-r01/checkpoint-2-source-bound-before-after-board.png",
        "Technically clean but melted planes, seams, soft crown and planar underside remain; candidate C.",
    ),
    (
        "Pillar-residual C2 — rejected",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-batch/candidates/pillar-residual/attempt-01/checkpoint-2/checkpoint-2-source-bound-rejection-board.png",
        "Sole semantic authority branch failed geological visual gate; C1 B remains donor-only.",
    ),
    (
        "Sea-stack C2 — technical pass, visual reject",
        TOONLAB / "artifacts/research/rock-geology-v2/mvp-v0.1/provider-batch/candidates/sea-stack/attempt-01/checkpoint-2/checkpoint-2-source-bound-authority-board.png",
        "Watertight/0 self-X/stable support, but reads as a smooth architectural obelisk; candidate C and parked.",
    ),
]


BG = "#11161d"
PANEL = "#19222c"
PANEL_2 = "#101820"
TEXT = "#edf4fa"
MUTED = "#aebdca"
ACCENT = "#7ed6ff"
GREEN = "#68d391"
AMBER = "#f6c85f"
RED = "#ff7b7b"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F_TITLE = font(44, True)
F_SUB = font(23)
F_ROW = font(29, True)
F_STATUS = font(21, True)
F_BODY = font(20)
F_LABEL = font(18, True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def open_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def paste_contain(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int], bg: str = "#0b1016") -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    canvas.paste(bg, box)
    copy = source.copy()
    copy.thumbnail((w, h), Image.Resampling.LANCZOS)
    x = x0 + (w - copy.width) // 2
    y = y0 + (h - copy.height) // 2
    canvas.paste(copy, (x, y))


def wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], width_chars: int, fnt: ImageFont.ImageFont, fill: str, spacing: int = 6) -> int:
    lines = textwrap.wrap(text, width=width_chars, break_long_words=False)
    draw.multiline_text(xy, "\n".join(lines), font=fnt, fill=fill, spacing=spacing)
    bbox = draw.multiline_textbbox(xy, "\n".join(lines), font=fnt, spacing=spacing)
    return bbox[3] - bbox[1]


def status_color(status: str) -> str:
    if status.startswith("PENDING") or "BLOCKED" in status or "NOT PASSED" in status:
        return AMBER
    if "REJECTED" in status or "TECH PASS / VISUAL REJECTED" in status:
        return RED
    return GREEN


def resolve_packet_entry(entry: dict) -> tuple[Path, dict]:
    packet_path = TOONLAB / entry["packet"]["path"]
    packet = json.loads(packet_path.read_text())
    front = next(v for v in packet["rawClay"]["views"] if v["view"] == "front")
    return TOONLAB / front["path"], packet


def build_roster_pages() -> list[dict]:
    roster = json.loads(ROSTER.read_text())
    triage = json.loads(TRIAGE.read_text())
    by_id = {e["candidateId"]: e for e in triage["entries"]}
    records = []
    for candidate in roster["candidates"]:
        cid = candidate["id"]
        six = next(f for f in candidate["reference"]["files"] if f["role"] == "admitted-six-view")
        reference = TOONLAB / six["path"]
        if cid == "cliff-bedded":
            current = CLIFF_V11
            current_role = "CURRENT V11 DIAGNOSTIC"
            raw_sha = None
            task_id = None
        else:
            entry = by_id[cid]
            current, packet = resolve_packet_entry(entry)
            current_role = "CURRENT RAW / ALIGNED FRONT CLAY"
            raw_sha = entry["rawModelSha256"]
            task_id = entry["taskId"]
        records.append({
            "ordinal": candidate["mvpOrdinal"],
            "id": cid,
            "label": candidate["label"],
            "family": candidate["familyLabel"],
            "cohort": candidate["cohort"],
            "current": current,
            "currentRole": current_role,
            "reference": reference,
            "referenceSha256": six["sha256"],
            "rawModelSha256": raw_sha,
            "taskId": task_id,
            "status": STATUS[cid][0],
            "notes": STATUS[cid][1],
        })

    pages = []
    width, header_h, row_h, footer_h = 2800, 170, 650, 80
    for page_index in range(4):
        subset = records[page_index * 5:(page_index + 1) * 5]
        canvas = Image.new("RGB", (width, header_h + row_h * 5 + footer_h), BG)
        draw = ImageDraw.Draw(canvas)
        draw.text((60, 38), f"ToonLab Rock Geology MVP — Roster Status {page_index + 1}/4", font=F_TITLE, fill=TEXT)
        draw.text((62, 100), "Left: current raw/aligned front clay (or cliff v11 diagnostic)  ·  Right: exact admitted six-view reference  ·  Snapshot: 2026-08-18", font=F_SUB, fill=MUTED)
        page_inputs = []
        for row_index, rec in enumerate(subset):
            y = header_h + row_index * row_h
            draw.rounded_rectangle((35, y + 12, width - 35, y + row_h - 12), radius=18, fill=PANEL if row_index % 2 == 0 else PANEL_2, outline="#314252", width=2)
            draw.text((65, y + 35), f"{rec['ordinal']:02d}. {rec['label']}", font=F_ROW, fill=TEXT)
            draw.text((65, y + 80), f"{rec['id']}  ·  {rec['family']}  ·  {rec['cohort']}", font=F_BODY, fill=MUTED)
            wrapped(draw, rec["status"], (65, y + 124), 40, F_STATUS, status_color(rec["status"]), spacing=4)
            wrapped(draw, rec["notes"], (65, y + 198), 46, F_BODY, TEXT)
            draw.text((65, y + 365), "RAW SHA" if rec["rawModelSha256"] else "FIELD", font=F_LABEL, fill=ACCENT)
            raw_text = (rec["rawModelSha256"] or "v11 procedural field").replace("sha256:", "")
            if len(raw_text) > 32:
                raw_text = f"{raw_text[:20]}…{raw_text[-10:]}"
            draw.text((65, y + 394), raw_text, font=F_BODY, fill=MUTED)
            if rec["taskId"]:
                draw.text((65, y + 490), "TASK ID", font=F_LABEL, fill=ACCENT)
                wrapped(draw, rec["taskId"], (65, y + 520), 24, F_BODY, MUTED)

            left_box = (690, y + 78, 1360, y + 608)
            right_box = (1395, y + 78, 2735, y + 608)
            paste_contain(canvas, open_rgb(rec["current"]), left_box)
            paste_contain(canvas, open_rgb(rec["reference"]), right_box)
            draw.rectangle(left_box, outline="#4a6175", width=2)
            draw.rectangle(right_box, outline="#4a6175", width=2)
            draw.text((690, y + 42), rec["currentRole"], font=F_LABEL, fill=ACCENT)
            draw.text((1395, y + 42), "EXACT ADMITTED SIX-VIEW REFERENCE", font=F_LABEL, fill=ACCENT)
            page_inputs.extend([rec["current"], rec["reference"]])

        draw.text((60, header_h + row_h * 5 + 23), "A = advance raw unchanged  ·  B = recognizable/repairable donor  ·  C = reject/park  ·  No raw provider mesh is a release asset.", font=F_BODY, fill=MUTED)
        out = OUT / f"gallery-roster-page-{page_index + 1:02d}.png"
        canvas.save(out, optimize=True)
        pages.append({
            "path": str(out.relative_to(TOONLAB)),
            "sha256": sha256(out),
            "bytes": out.stat().st_size,
            "inputs": [{"path": str(p), "sha256": sha256(p)} for p in page_inputs],
        })
    return pages


def build_board_page(title: str, subtitle: str, items: list[tuple[str, Path, str]], filename: str) -> dict:
    width, header_h, item_h, footer_h = 2800, 170, 760, 70
    canvas = Image.new("RGB", (width, header_h + len(items) * item_h + footer_h), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((60, 38), title, font=F_TITLE, fill=TEXT)
    draw.text((62, 100), subtitle, font=F_SUB, fill=MUTED)
    input_records = []
    for i, (label, path, note) in enumerate(items):
        y = header_h + i * item_h
        draw.rounded_rectangle((35, y + 12, width - 35, y + item_h - 12), radius=18, fill=PANEL if i % 2 == 0 else PANEL_2, outline="#314252", width=2)
        draw.text((65, y + 38), label, font=F_ROW, fill=TEXT)
        wrapped(draw, note, (65, y + 92), 43, F_BODY, MUTED)
        box = (800, y + 38, 2735, y + item_h - 38)
        paste_contain(canvas, open_rgb(path), box)
        draw.rectangle(box, outline="#4a6175", width=2)
        input_records.append({"path": str(path), "sha256": sha256(path)})
    out = OUT / filename
    canvas.save(out, optimize=True)
    return {
        "path": str(out.relative_to(TOONLAB)),
        "sha256": sha256(out),
        "bytes": out.stat().st_size,
        "inputs": input_records,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if not CLIFF_V11_SOURCE.is_file():
        raise FileNotFoundError(f"Missing authoritative cliff v11 diagnostic: {CLIFF_V11_SOURCE}")
    shutil.copyfile(CLIFF_V11_SOURCE, CLIFF_V11)
    pages = build_roster_pages()
    pages.append(build_board_page(
        "ToonLab Rock Geology MVP — Advanced Workstreams",
        "These branches sit beyond the raw roster state. They are technical/visual evidence, not automatic release approvals.",
        ADVANCED,
        "gallery-advanced-workstreams.png",
    ))
    pages.append(build_board_page(
        "ToonLab Rock Geology MVP — Rejected C2 Experiments",
        "All five sole-candidate repair/rebuild branches are frozen and parked. Their checkpoint-1 B donor classifications remain intact.",
        C2,
        "gallery-rejected-c2-branches.png",
    ))
    manifest = {
        "schema": "toonlab/rock-mvp-handoff-gallery",
        "version": 1,
        "snapshotDate": "2026-08-18",
        "rosterManifest": {"path": str(ROSTER.relative_to(TOONLAB)), "sha256": sha256(ROSTER)},
        "triageManifest": {"path": str(TRIAGE.relative_to(TOONLAB)), "sha256": sha256(TRIAGE)},
        "pages": pages,
        "claims": {
            "rosterEntries": 20,
            "rootRecordedB": 11,
            "pendingHumanABC": 8,
            "providerNotApplicable": 1,
            "releaseEligibleAssets": 0,
            "galleryCurrentImagePolicy": "19 hash-bound raw/aligned front clay images plus current procedural cliff v11 diagnostic",
            "galleryReferencePolicy": "exact admitted six-view from the machine-readable MVP roster",
        },
    }
    manifest_path = OUT / "gallery-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output": str(OUT), "pages": pages, "manifestSha256": sha256(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()
