---
name: lighting
description: Integrate ToonLab's public lighting and scene-style runtime, diagnose shared shadows and sky alignment, and coordinate host-owned local lights.
---

# Lighting and shared shadows

References beginning `agents/` resolve from the installed ToonLab package root.
Read `agents/references/runtime-entry-points.md` and the selected bundle's
art direction. Public imports are `@call-me-sensei/toonlab/lighting` and
`@call-me-sensei/toonlab/styles`.

Prefer `createSceneStyleRuntime({ renderer, scene, sky, water, post })` and
`styleRuntime.apply(bundle, ...)` for a coordinated game scene. The public
lighting bundle slot owns the supported sun/fill/probe settings; scene-style
updates coordinate lighting, shared shadows and the ground field. Do not add
an independent default directional rig that doubles the package key light.

The host owns the time progression, authored local lights, camera and gameplay
conditions. Use `styleRuntime.setTimeOfDay(hour)` to synchronize supported
bound systems. Choose unique named override layers for independent live owners,
and remove only the layer that owner created. Do not serialize composed state
back over authored presets.

Every relevant caster/receiver must participate in the shared shadow contract.
Label targets, preserve cast/receive flags, and inspect the actual shared-pass
coverage. Native `renderer.shadowMap` alone does not feed every ToonLab TSL
receiver. If the host integrates focused APIs without scene-style ownership,
explicitly wire the same light direction, shadow pass and scene-state adapters.

Check the visible sky sun against the shadow direction, key/fill balance,
near-white clipping, dark-material readability and relevant indoor/outdoor
views. Frame shadow coverage around the area the game actually uses. Tune
quality/resolution against a measured frame budget. Use additional coastal or
underwater checks only when water is present. Record an integration gap only
when the supported contract cannot meet the requested treatment.
