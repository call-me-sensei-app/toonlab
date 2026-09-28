# ToonLab Runtime Boundary

ToonLab is recommended for stylizing and populating supplied anime-game
scene content. Prefer focused imports from these production-oriented areas:

- `toon`, `toon-settings`, `character`
- `environment`, `ground-shader`, `rock-shader`
- `vegetation`, `vegetation-shaders`, `grass`, `grass-palettes`
- `water`, `water-settings`
- `lighting`
- `post`, `post-processing`
- `rockgen`, `texgen`, `assetlib`
- `styles`, `asset-policy`, `loaders`
- `renderer`, `runtime`, `world-collision`, `official-catalog`, `scene-operations`
- `react` when using the optional React/React Three Fiber peers

`sky` and `cloud` are public because they are owned by the live Sky, Cloud, and
Sky & Cloud Labs. Weather, climate, debris, ambient-effects, fauna, debug, and
root terrain/world helpers are not package entry points in this release.
Repository examples may exercise them locally, but package users must not
import them.

For characters, prefer `createCharacterRuntime()` from `./character`. It owns
format loading, texture readiness, foot-origin fitting, toon conversion,
humanoid rig resolution, native clips or packaged locomotion fallback, mixer
updates, VRM updates, and disposal. The host still owns movement intent,
dynamic physics, ground contact, and camera behavior. The walkable runtime
automatically consumes the static collision service bound by
`createSceneStyleRuntime()`. Do not recreate this pipeline inside individual
scenes or Labs.

The selected style bundle coordinates visual settings and supported scene-look
systems; it does not construct or classify a scene. Lighting is a supported
bundle domain through `createSceneStyleRuntime()`. VFX, camera behavior,
game-feel behavior, and renderer configuration remain unsupported bundle
domains owned by the host game.
When a project-local implementation changes the selected anime treatment,
treat it as a custom adapter and record it in the custom-gap report.

The `grass` entry owns two deterministic first-party Call Me Sensei clump
recipes, three generated LODs per variant, the procedural material, and the
async-compatible `createCallMeSenseiGrassField()` default factory. It ships no
mesh or texture files. `RetainedGrassClumpField` remains the generic container
for caller-supplied, properly licensed geometry and materials.

The default factory resolves the `call_me_sensei_clump` meadow preset: 40
upright overlapping primary blades, full ground-field adoption, watercolor
lift and translucent stroke layering, and a final LOD without an implicit hard
cull. Sparse generic blades and repository comparison media are not equivalent
fallbacks.

Applying the Call Me Sensei bundle resolves the same grass field response. The
scene style runtime creates and updates the ground-field pass automatically, so
grass roots sample the actual labeled Ground Shader output without host-side
color duplication.

The `environment` entry accepts the same explicit style/scenario routing used
by the preset registry:

```js
await applyEnvironmentShader(root, {
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
});
```

This is equivalent to spreading
`resolveEnvironmentPreset('call_me_sensei', 'exteriorDay')` into the adapter.
Named preset values establish the baseline; explicit `settings`, `features`,
`parameters`, and `materialLook` overrides take precedence. Select the preset
before authoring overrides instead of retyping its numeric fields.

The `vegetation` entry's scatter helpers place across the ground heightfield —
`scatterInRect`, `scatterGrassAround`, `scatterForest` — taking `(x, z)` and
sampling `y` from a host `heightAt`. That contract cannot express a surface
which is not single-valued in `y`, such as a cliff cap or a ledge with terrain
both above and below it.

For those, use `scatterOnSurface({ surfaces, density | count, minSpacing,
mask, weightAt, normalBlend })`. Each surface is a disc in world space —
`{ center, radius, normal?, seed? }`, the shape a rock or cliff module already
publishes for its caps and ledges. Spacing is measured in 3D, so stacked caps
do not reject each other's points. Each surface draws from its own
deterministic stream, so adding or removing one does not reshuffle the others.
Returned placements carry `normal`, `forward` and `yaw` alongside `x/y/z`, so
an aligned field no longer has to derive orientation per placement. The
existing `(x, z)` mask factories and `combineMasks` compose unchanged.

The `ground-shader` entry also owns bounded transient print fields for sand,
dirt, and sufficiently deep snow. Create a `GroundPrintLayer`, pass it as the
material's `printLayer`, and emit contact events with `stamp()`. The portable
Ground Shader document saves only `printResponse`; stamp history, snow depth,
visibility, and recovery remain runtime state:

```js
const prints = createGroundPrintLayer({
  bounds: geometry.boundingBox,
  resolution: 1024,
  recoverySeconds: 30,
});

const ground = createGroundShaderMesh({ geometry, field, layers, printLayer: prints });
prints.stamp({
  shape: 'boot-left',
  position: footWorldPosition,
  forward: characterForward,
  size: [0.12, 0.28],
});
setGroundShaderSceneState(ground, { snowCover: 1, snowDepth: 0.12 });
```

This is a visual albedo, roughness, and normal response. Terrain geometry,
precise/dynamic collision, navigation, character contact detection, and large-world print
streaming remain host-owned.

Pair it with `createCapEdgeWeight({ rimBias: 0.05, falloff, break })` for a
radial weight that thins coverage toward a broken rim. `falloff` and `break`
create the thinning; `rimBias` deliberately pushes coverage outward, so keep
it near zero for a soil cap. A cap that stays dense to its edge reads as a flat
disc stuck onto the rock rather than as soil.

## Shared scene surface runtime

Use `createSceneSurfaceRuntime()` from `@call-me-sensei/toonlab/runtime` when a
scene combines an authored terrain heightfield with grounded props, meadow
grass, characters, or shoreline water. The host supplies world bounds,
`heightAt(x, z)`, and a water level once. The runtime then owns derived Y
placements, bounds grounding, water masking, the shoaling/nearshore/shore-state
connection, source-texture continuity checks, and fail-closed composition
readiness.

```js
const surface = createSceneSurfaceRuntime({ bounds, heightAt, waterLevel: 0 });
const grass = await surface.createGrassField({ count: 12000, min, max });
const water = surface.createWaterSurface({ width: 80, depth: 50, position: { z: -25 } });
surface.place(tree, { x: 4, z: 8 });
surface.place(bench, { anchor: 'bounds', x: 2, z: 5 });

// After the package shadow pass has updated:
surface.assertReady({
  camera,
  styleRuntime,
  requireShadowDomains: ['character', 'manufactured.surface', 'vegetation.tree'],
});
```

Do not hand-author grass Y values, independently offset a shoreline water
plane, or infer readiness from `castShadow` flags when this contract applies.

The live `cloud` entry is a raymarched volumetric deck, not painted sources
placed by a composition. The
painted pipeline (`createCloudSourceDocument`, `createCloudCompositionDocument`,
`createCloudField`, `createCloudShaderSettings`) was replaced outright and no
longer exists. Parameters are six groups on a `toonlab/sky-params` document, and
the whole sky is one system:

```js
const sky = await SkySystem.create({ renderer, scene, camera, quality: 'high' });
await sky.applyPreset({
  cloud: {
    shape: { altitude: 1400, coverage: 0.55, thickness: 2800 },
    lighting: { powderStrength: 0.7, scatteringAlbedo: 0.82 },
    wind: { heading: 135, speed: 8 },
  },
});
sky.update(delta);  // once per frame, before the scene pass
```

`applyPreset` fully replaces sky state: anything the object omits falls back to
the schema default rather than to what is on screen. `sky.toParams()` is its
inverse and round-trips. This is a focused sky/cloud authoring and runtime
contract; final scene composition and art direction remain host
responsibilities.

Use the package README and exported functions/settings as the runtime source
of truth. Labs, internal comparison fixtures, local asset paths, and repository
documentation outside `agents/references/` are not installed public APIs.

## Realistic rock materials

The `rockgen` entry exposes `NATURAL_ROCK_SURFACE_PROFILES`,
`NATURAL_ROCK_MAP_ROLES`, `createNaturalRockMapData`,
`resolveNaturalRockProjection`, and `createNaturalRockSurfaceSpecification`.
Use these for deterministic realistic surface maps on procedural or edited
rocks. The host owns texture creation and material assignment. Preserve saved
surface recipes and geometry identities. Composite profiles require authored
semantic regions; do not substitute a homogeneous map or invent a residual bake.

## Host game and lifecycle

Building gameplay, cameras, level layout and UI is ordinary host work when the
user requests a new game. “Host-owned” does not prohibit the agent from doing
that work. Read `agents/references/game-lifecycle.md` for exact update owners.
The style runtime coordinates lighting, shadow and ground-field passes; it
does not advance bound sky, water, grass or character objects automatically.

Discover current sky fields through `SKY_PARAMS_FIELD_SCHEMA` and
`SKY_PARAMS_SCHEMA_VERSION`; modern `SkySystem` uses `toonlab/sky-params`.
`createSkySettings` and `StylizedSky` refer to the compatibility renderer and
its distinct settings contract. Do not mix those schemas or hardcode a field
count from older guides.
