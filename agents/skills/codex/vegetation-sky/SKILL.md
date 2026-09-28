---
name: vegetation-sky
description: Help users apply ToonLab grass, flowers, trees, Tree/Grass/Flower shader profiles, and the live Sky/Cloud authoring surfaces to an existing scene.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Vegetation, Sky, and Cloud

Use these focused systems on an existing scene with host-supplied placements,
terrain, lighting coordination, and current conditions. The Sky and Cloud Labs
are live authoring tools; they do not replace whole-scene composition.

Public imports:
- `@call-me-sensei/toonlab/vegetation`
- `@call-me-sensei/toonlab/vegetation-shaders`
- `@call-me-sensei/toonlab/grass-palettes`
- `@call-me-sensei/toonlab/sky`
- `@call-me-sensei/toonlab/cloud`
- `@call-me-sensei/toonlab/grass`

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`

User guidance:
- Add vegetation and sky objects to app-owned scenes, terrain, and render loops.
- Produce `placements` with the scatter helpers rather than by hand. Across the
  ground heightfield use `scatterInRect`, `scatterGrassAround` or
  `scatterForest`. For a surface that is **not single-valued in y** — a cliff
  cap, a ledge, a shelf, a rock platform, anything with terrain both above and
  below it — those cannot express the placement at all; use
  `scatterOnSurface({ surfaces, density | count, minSpacing, mask, weightAt,
  normalBlend })`. Surfaces are discs in world space,
  `{ center, radius, normal?, seed? }`, which is the shape a rock or cliff
  module already publishes for its caps. Spacing is measured in 3D so stacked
  caps do not starve each other, each surface has its own deterministic stream
  so adding one does not reshuffle the rest, and the returned placements carry
  `normal`, `forward` and `yaw` so an aligned field does not have to derive
  orientation itself. The `(x, z)` mask factories and `combineMasks` compose
  with it unchanged.
- Pair it with `createCapEdgeWeight({ rimBias: 0.05, falloff, break })`. A cap that
  stays dense all the way to its rim reads as a flat green disc stuck onto the
  rock; real soil caps thin toward a broken, slightly overhanging edge. Keep
  `rimBias` near zero for soil: high values push coverage into an outer annulus
  and work against the edge falloff. Use `falloff` and `break` for the ragged
  transition.
- Use async `createCallMeSenseiGrassField({ placements, variant })` for
  ToonLab's first-party procedural grass. `primary` is the accepted default;
  `secondary` is the denser alternate. Both generate deterministic LOD0/1/2
  geometry and the material directly from package code. They have no GLB,
  image, or package-owned URL dependency. The returned default is a
  `StylizedGrassClumpField`; use `RetainedGrassClumpField` only when the caller
  deliberately supplies custom geometry or material.
- Keep the field's package-default spatial frustum culling enabled for outdoor
  scenes. It chunks placements, rejects offscreen chunks/records, and compacts
  visible records into the existing three LOD buffers. Read `cullingStats` for
  visible/culled counts; tune `chunkSize` or `cullPadding` only for a measured
  world-scale need. Never set `frustumCulling: false` as a meadow default.
- Keep the factory's default `call_me_sensei_clump` preset unless the developer
  explicitly requests another style. It is the accepted meadow preset: 40
  upright overlapping blades per primary clump, full ground-field adoption,
  texture-free watercolor lift, translucent stroke layering, and three LODs
  without an implicit terminal hard cull. Do not replace it with a generic
  single-blade field, a repository asset, or example-local material settings.
  Reject dark or dirty roots, isolated patches, tangled silhouettes,
  bare-ground pinholes at normal density, and straight coverage boundaries.
  Compare both composition and grass-close views against the frozen controlled
  source mode.
- Preserve ground hue in the Call Me Sensei default. Its neutral
  `groundAdoptTint` may lift exposure uniformly, but `tipHueShift` and
  `tipDesaturation` remain zero: green ground produces only shades of green.
  Hue shifts remain public profile parameters for explicitly authored styles.
  LOD0/1/2 reduce 40/14/6 primary blades and widen retained strokes to keep
  integrated coverage within 2% of LOD0. Reject any camera-distance change
  that makes the terrain appear to change color.
- Ground-field sampling is a compile option; the source is the shared
  environment ground-field pass. Prefer `createSceneStyleRuntime()` and label
  terrain `terrain.ground` plus grass `vegetation.grass`; the bundle then marks
  writers and owns the pass automatically. For a manual subsystem integration,
  create the pass after all writer meshes exist, call its `update()` every frame before grass, require
  `writerCount > 0` and `ready`, and call `invalidate()` after repainting a
  writer without a transform change.
- The public package contains tree construction and shader capability, not a
  predefined tree asset collection. For an authored tree, use the connected
  MCP's `search_public_gallery` and `get_public_gallery_asset` tools, then
  instantiate its portable recipe with `StylizedTree`. Use `BranchTree` when
  the developer explicitly wants
  recursive branching and the supported `BRANCH_TREE_LEAF_SHAPES`, leaf color/texture plus a
  portable lit/shadow/crown palette, independent leaf `coverageScale`, bark
  color/texture, authored trunk bend/twist/taper, roots, portable documents,
  and the shared Tree Shader. `branches.children` counts lateral children;
  the generator also continues the leader so the trunk does not end in a stump.
  `BranchTree` is the focused portable wrapper around `StylizedTree` with
  `skeleton.generator: 'branching'`; choose the normal blob-crown tree when a
  solid anime foliage mass matters more than a visible recursive skeleton.
  Its current crown is tip-driven: `canopyWidth`, `canopyDepth`, and
  `leafPlacement` are fixed by the wrapper, while `coverageScale` remains the
  supported density control. Use `StylizedTree` directly when the crown
  geometry itself must be authored; do not pass ignored BranchTree options.
  Preserve an authored `trunkMap`. If it is absent, the Call Me Sensei preset
  and bundle select `call-me-sensei-bark-v1` automatically. Use
  `getTreeSurfaceProfileOptions()` when the developer asks the agent to choose
  another registered bark surface; never leave the trunk bare by accident,
  and use `trunkSurfaceProfile: 'none'` only for a deliberate flat-color art
  direction. Verify every trunk both casts and receives in shared-pass
  coverage telemetry.
  Use supported morphology and texture controls for the requested appearance;
  do not claim botanical fidelity from a named leaf shape alone. The large
  taxonomy/species roster visible in repository labs is experimental and is
  not a package API.
- Author and route the independent `TREE_SHADER_PROFILE`,
  `GRASS_SHADER_PROFILE`, and `FLOWER_SHADER_PROFILE` through the bundle's
  `treeShader`, `grassShader`, and `flowerShader` slots. They share a renderer
  family and semantic material contract, but serialize and apply independently.
  Keep asset albedo and Gallery-recipe/BranchTree geometry/material inputs separate from all
  three shader treatments.
- Grass palettes update base, tip, and shadow tint together; they do not change
  shadow strength, wind, or current weather.
- Use the public versioned Grass, vegetation-shader, BranchTree/flower recipe, and Sky
  preset document APIs for portable data; do not copy lab-local validators.
- Treat Sky as one integrated World System, not a separate Shader Lab. Its
  atmosphere, sun, cloud, night-sky, noise, god-ray and time blocks use the
  current `SKY_PARAMS_FIELD_SCHEMA`; quality is a separate runtime choice.
- Cloud is a raymarched volumetric deck. The painted source/composition/card
  pipeline was replaced outright: `createCloudSourceDocument`,
  `createCloudCompositionDocument`, `createCloudField` and
  `createCloudShaderSettings` no longer exist. Build the sky with
  `SkySystem.create({ renderer, scene, camera })` and author it with
  `applyPreset(skyParams)`, whose `cloud` block is the six groups shape,
  lighting, wind, cirrus, haze and fade. `applyPreset` fully replaces sky
  state; omitted fields fall back to the schema default, not to what is on
  screen.
- `sky.settings` is the authored baseline and `sky.renderedSettings` is the
  current named-layer composition. Give Lighting, Weather, and other scene
  owners unique `setSceneOverrideLayer` ids and clear only their own id.
- For world integration, prefer `createSceneStyleRuntime()` and its public
  lighting slot for the sun, probe and shared shadows. The host still owns
  time progression and authored local lights. Coordinate custom scene inputs
  through the documented adapters.
- The composed-world sun adapter is `setSun({ direction, color, sky })`; it
  keeps the real light/shadows and Grass, Flower, Forest, Ambient FX, Sky, and
  Water scene inputs aligned without changing their portable presets.
- Sky quality is compile-time: low/medium/high compile 2/3/4 cloud octaves,
  custom `{ cloudOctaves: 1..5 }` is supported, and `sky.setQuality()` rebuilds
  the material while preserving authored settings and active layers.
- Keep current wind, wetness, snow, interaction targets, weather, lighting,
  camera, and export destinations owned by the host app.
- **Start from a public package preset or a portable Lab export.** The browser
  Labs author and preview settings, while the package registry and imported
  documents are the runtime sources of truth. Never import Lab UI code into an
  application. Water and Sky keep their controls inside their complete system
  documents rather than requiring hidden companion settings.
- **Always name the preset.** `createVegetationShaderScopeSettings(scope, {...})`
  with no `preset` silently resolves an anonymous `default` — not the studio
  look — and does not warn. Pass `preset: 'call_me_sensei'` explicitly on the
  first call. See the `style-presets` skill; this single omission has taken a
  whole vegetation look onto the wrong base for several revisions.
- Grass presets differ in **shape**, not only colour: `call_me_sensei_clump` is
  the wide dense meadow clump, while `anime_clump` is the shorter narrow six-
  blade tuft with a far smaller clump radius. Choose deliberately when coverage
  and silhouette matter. `createCallMeSenseiGrassField()` defaults to the
  meadow and honors an explicit alternate `preset`; verify the resolved id in
  `field.userData.callMeSenseiGrass.preset`.
- Do not rely on repository sample meshes, textures, or generated manifests.
  A clean npm tarball contains no grass media files; test the generated
  topology, blade attributes, LOD counts, and material in a clean consumer.

Verify:
- Run the consumer app's normal build and inspect near/far vegetation plus sky
  under the target camera.
- For exported trees, reload the generated asset in the consumer app or asset
  pipeline.
