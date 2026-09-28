---
name: toon-shading
description: Help developers use ToonLab character toon shading, toon settings, presets, material roles, outlines, shadows, highlights, fur, or stickers.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Toon Shading

Use this skill when a developer wants ToonLab character toon materials, toon
settings, preset documents, material-role handling, outlines, hair highlights,
rim light, shadows, shadow tones, face maps, stickers, fur, or debug views in their app.

Public imports:
- `@call-me-sensei/toonlab/toon`
- `@call-me-sensei/toonlab/toon-settings`

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`

Developer guidance:
- Apply toon shading to app-owned Three.js character roots and meshes.
- The host app owns character loading, animation, input, camera, persistence,
  and asset URLs.
- The optional CC0 qualification mannequin is not bundled in npm. Load the
  immutable public-R2 URL and provenance from `TOONLAB_MANNEQUIN_ASSET` in
  `@call-me-sensei/toonlab/character`, or use the host project's own mannequin.
  Never substitute a repository `public/characters/mannequin.glb` path when
  testing an installed package. After downloading, verify its byte count,
  SHA-256, and 46 clips before applying the toon shader.
- Use settings and preset documents for portable looks instead of lab HUD
  state.
- Use ToonLab's TSL/NodeMaterial path; do not advise raw GLSL or
  `ShaderMaterial` forks for ToonLab toon features.
- Do not rely on `assets-local/` or lab-only model discovery.

Verify:
- Run the consumer app's normal build and inspect the character under at least
  one lit and one shadowed view.
- Record `applyToonShader()`'s converted mesh count, material-role summary,
  shader mode, and selected preset. A loaded GLB is not proof that cel shading
  was applied.
- Toggle the relevant setting or preset to confirm the app is not hard-coded to
  lab defaults.
