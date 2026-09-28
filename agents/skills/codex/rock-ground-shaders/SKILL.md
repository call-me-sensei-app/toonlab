---
name: rock-ground-shaders
description: Apply, configure, and verify ToonLab rock and ground shaders in outdoor scenes, including textures, close detail, HDR sun response, cast/receive shadows, ground-field adoption, shoreline wet bands, and Call Me Sensei defaults.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Rock and ground shaders

Use this skill when terrain, cliffs, catalog rocks, beaches, or grass-ground
blending are being built or reviewed. These two systems are separate public
APIs and must share scene state deliberately.

## Rock assets and material application

Find rock geometry through ToonLab asset discovery. Feature-detect the surface:
ToonLab OSS provides local catalog tools such as `search_assets({ source:
'official' })`; ToonLab Pro provides the public gallery equivalent. Inspect
`dimensionsMeters`, taxonomy, geology, structural role, and delivery metadata
before download. Never render an asset merely to discover its size.

Apply the package shader to compatible rock meshes:

```js
import {
  applyRockShader,
  setRockShaderSceneState,
} from '@call-me-sensei/toonlab/rock-shader';

const report = applyRockShader(rockRoot, { preset: 'call_me_sensei' }, {
  textures: authoredRockMaps, // omit deliberately to use first-party generated maps
});
if (report.applied === 0) throw new Error('No rock mesh received the shader');
if (report.usedGeneratedTextures) {
  console.info('Using ToonLab first-party generated rock maps');
}
setRockShaderSceneState(rockRoot, { waterLevel });
```

For an asset with authored semantic regions, use `inspectRockRegionBindings()`
and its matching versioned contract before styling. Do not copy region names
or vertex-count assumptions from a single research fixture onto other rocks.
Preserve authored masks and their geometry binding; topology/UV edits require
updated bindings and any required rebakes. Qualify apply/revert cycles on the
actual asset.

`applyRockShader` sets `castShadow` and `receiveShadow` true by default.
Override them only for an explicit rendering reason. It reports whether
provided textures or first-party generated maps were used; never call the
fallback an authored catalog texture.

The Call Me Sensei preset includes a macro projection plus a metre-scale near
detail octave, HDR exposure, an indirect floor for down-facing overhangs, and
a water-level wet band. Tune `projection.nearDetailScale`,
`projection.nearDetailStrength`, `lighting.exposure`,
`lighting.ambientFloor`, `lighting.skyFillStrength`,
`lighting.skyFillTint`, and `shoreline.*` through the portable preset
instead of adding example-local material overrides. Camera-visible rock must
retain readable detail at close range, a lit/shade split, non-black overhangs,
and wet response where it meets water.

Call Me Sensei uses a controlled imported-map blend by default. Preserve clean
UV-authored rock albedo, normal, and ORM inputs; verify
`report.retainedSourceTextures` and the material's texture-lineage metadata.
Do not set `preserveTextures: false` or switch to Replace merely to silence a
surface audit. Use Replace only when an import audit proves the source maps are
unusable.

## Ground creation and shared scene state

Prefer the safety wrapper:

```js
import {
  createGroundShaderMesh,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';

const ground = createGroundShaderMesh({
  geometry,
  field,
  layers,
  settings: { preset: 'call_me_sensei' },
});
scene.add(ground);
setGroundShaderSceneState(ground, {
  sunColor,
  sunDirection,
  skyColor,
  waterLevel,
  wetness,
  snowCover,
});
```

The wrapper defaults `castShadow`, `receiveShadow`, and
`userData.groundFieldWrite` to true and disables unsafe frustum culling for
custom/displaced bounds. The Call Me Sensei ground preset exposes
`lighting.sunIntensity` for HDR sun-facing headroom and retains triplanar
rock detail when optional maps are absent. Optional authored albedo, normal,
and packed surface maps are still preferred for hero terrain and beaches.

When grass adopts ground color, prefer `createSceneStyleRuntime()` with labeled
`terrain.ground` and `vegetation.grass` targets. The bundle marks writers and
  owns the environment ground-field pass. In a manual subsystem integration,
  create and update the pass after writers exist, assert `pass.writerCount > 0`
  and `pass.ready`, and call `pass.invalidate()` whenever a writer repaints without changing
  transform. The field publishes unlit surface albedo; consumers apply their own
lighting. Do not publish camera-lit ground color into the field.

## Lighting and shadow verification

A material flag is not visual proof. Enable the renderer shadow path, use a
directional light that casts shadows, fit its camera to the visible world, and
run the ToonLab environment sun-shadow pass on the node backend. Inspect:

- sun-facing and away-facing ground and rock;
- cast shadows from trees, rocks, characters, and the cliff mass;
- self-shadow acne and detached/peter-panning shadows;
- close rock detail and distant macro continuity;
- ground-field color adoption without double lighting;
- wet rock, beach, and shoreline continuity at the current water level.

Reject flat untextured walls, black overhangs, missing trunk/cliff shadows,
silent generated-map use, or a grass/ground color jump. Record the package
version, preset, texture source, scene-state wiring, shadow backend, and
inspection cameras in release evidence.
