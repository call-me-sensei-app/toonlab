---
name: environment
description: Help developers use ToonLab environment shading, lighting rigs, ambient probes, reflections, fog, cloud shadows, or vertex AO in an app.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Environment

Use this skill when a developer wants stylized scene materials, material-role
classification, sun/lamp rigs, time-of-day, ambient probes, planar reflections,
BVH vertex AO, fog, cloud shadows, or environment presets.

Public imports:
- `@call-me-sensei/toonlab/environment`

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`
- the exported `environment` material-role schema and guidance below.

Developer guidance:
- Apply environment materials to app-owned meshes and scenes.
- Keep asset loading, texture hosting, renderer setup, and scene routing in the
  host app.
- Use documented settings and presets for material roles, lighting, fog, cloud
  shadows, probes, and reflections.
- Consume the versioned `urbanMaterial` classification: base material,
  finish, render mode, structural role, and content flags. Put style choices
  in global shader settings and sparse per-axis profiles; do not relabel assets
  when the shader changes. Accept legacy `urbanSurface` only through the
  documented migration map.
- Use `analyzeManufacturedAsset` for the automatic code-first import audit.
  Apply durable corrections with `applyManufacturedMaterialManifest`; do not
  infer semantic material from base-color pixels alone. A visual model is an
  optional offline assistant for mixed atlases, never a runtime dependency.
- For an imported hero vehicle or ship, preserve the complete pre-conversion
  audit and the `applyEnvironmentShader()` classification report. Report every
  generic fallback, low-confidence assignment, transparent surface, and mixed
  atlas; do not call the result contract-ready until a reviewed sidecar or
  embedded material contract removes those warnings.
- Treat global environment settings as the catch-all, then resolve sparse
  `materialLook` profiles by base material, finish, render mode, structural
  role, content flags, object class, and stable asset id. Do not implement a
  shader fork per base material; only incompatible render modes need distinct
  shader families.
- Use the same post-load classification for GLB, FBX, OBJ/MTL, USDZ, VRM,
  PMX/PMD, and procedural `Object3D`s. Prefer glTF extras for owned GLBs and a
  `*.toonlab-materials.json` sidecar for formats that do not preserve custom
  metadata reliably.
- Treat BVH vertex AO as optional; apps that do not use it should not need
  `three-mesh-bvh`.
- Do not rely on ToonLab sample app URLs, sample asset paths, or generated local
  manifests.

Verify:
- Run the consumer app's normal build and visual smoke check.
- For a vessel, inspect above-water, shoreline, and reflected/refracted views;
  verify sails/windows keep their intended render mode and the hull crosses the
  waterline without being excluded from required water scene passes.
