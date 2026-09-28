---
name: visual-verification
description: Verify ToonLab rendered output and gameplay with settled frames, relevant camera views, subsystem isolation and measurable evidence. Use for visual reviews or diagnosing a suspected rendering defect.
---

# Verify rendered output

References beginning `agents/` resolve from the installed ToonLab package root.
A passing build does not establish visual correctness. Choose checks that match
the requested change, the art direction and the cameras the game actually uses.

## Readiness and capture

Await every readiness promise exposed by the host, render through its real
pipeline, and check required objects/textures have loaded. For static fixtures,
stable drawable counts across frames are a necessary signal, not proof of GPU
compilation or successful rendering. Animated/procedural scenes may legitimately
change counts; use their explicit readiness signals instead.

Inspect pixels from the output (a small `readPixels` grid or the captured image).
Check that intended surfaces are visible, with useful coverage and valid alpha.
Do not hardcode black as the only empty-frame value; an empty scene may match a
sky-colored or transparent background. Check relevant console/network errors
and failed textures. Do not dismiss a failed required resource because the rest
of the scene renders. Record the camera, readiness signals and capture path.

## Diagnose before attributing a defect

Isolate the suspect subsystem while retaining its lighting and required passes.
Compare with and without post-processing when appropriate. Keep camera, pose,
exposure, lighting and source textures fixed for before/after comparisons.
Inspect world-space bounds, scale and material contracts when an object has an
unexpected silhouette, repeated pattern or stretched surface.

For palette-matching tasks, sample corresponding material regions and compare
small patches in a perceptual color space such as CIEDE2000. Confirm the probe
hits the intended surface. For ordinary feature work, clear visual inspection
and targeted telemetry are enough; do not invent numeric color gates without a
reference or require measurement tools unrelated to the requested result.

## View and interaction coverage

Use gameplay cameras first. For 3D assets or formations, choose relevant views
from hero, wide, close, flyover, top-down; include angles that expose seams or
repetition. A fixed-camera UI change does not need a five-camera asset audit.
Check near/far and lit/shadowed behavior when LOD or lighting is affected.

For a game slice, exercise movement, collision, interaction, success/failure and
restart where present. Test resize, focus loss/resume and teardown when changing
lifecycle ownership. Confirm post-processing is the final render path when used.

## Review and report

Take a separate review pass against the requested acceptance criteria. When
active tools and developer authorization permit an independent agent/thread,
that reviewer should capture fresh evidence. Otherwise review locally; do not
spawn agents or create user tasks without authorization.

Describe concrete defects with location, expected result, observed result and
likely owner. Fix them and repeat affected checks. Report evidence and remaining
limitations without treating every host-owned feature as a ToonLab limitation.
Use a standalone fixture to support claims about package defects.
