# Rock shader

The rock shader is a reusable material system for rocks, boulders, cliffs, and
mountain surfaces. It is intentionally separate from procedural rock asset
generation.

The default profile is `call_me_sensei`. It is an independently
authored first-party anime-rock treatment with macro projection, metre-scale
near detail, HDR headroom, readable shaded faces, and a waterline response.
Rock Shader Lab evaluates the same public preset used by package consumers.

## Architecture decision

Two public domains own two different artifacts:

| Domain | Import | Owns |
| --- | --- | --- |
| Rock asset generation | `@call-me-sensei/toonlab/rockgen` | Shape, pieces, seed, cuts, strata, erosion, sculpt edits, surface zones, topology, LOD, collision, and baked asset channels |
| Rock material treatment | `@call-me-sensei/toonlab/rock-shader` | Projection, color response, distance tint, normals, striping, moss, top layers, and use of imported asset channels |

The dependency direction is one way:

```text
generated or imported rock
  -> geometry + stable asset channels
  -> applyRockShader(...)
  -> current lighting, weather, and post-processing
```

`rockgen` does not import or require the rock shader. The Rock Shader Lab does
not author procedural geometry. It uses fixed preview fixtures to test one
material profile across different rock silhouettes and source-data quality.

The Rock Lab may preview the project-default shader, but its exported rock
project must remain usable without that shader. The shader profile is selected
independently, usually through a style bundle.

## Hoodoo semantic-region binding (representative)

The first release-candidate semantic binding is intentionally narrow. A loaded
hoodoo mesh may carry `_TL_ROCK_REGION`, exposed by `GLTFLoader` as
`_tl_rock_region`, with normalized `UNSIGNED_BYTE VEC4` channels in this exact
order: `base`, `shaft`, `neck`, `cap`. Its node extras must contain
`toonlabRockRegionBinding` version 1, profile
`hoodoo-caprock-normalized-height-v1`, the exact band values, and
`failClosed: true`.

Call `inspectRockRegionBinding()` or `inspectRockRegionBindings()` before using
the palette. Validation rejects missing or renamed attributes, a different
profile/version/channel order, count/type/normalization drift, incomplete
coverage, or bytes that do not match the immutable height-band profile. The
runtime never adds an attribute alias or repairs a partial binding.

Region styling is material-only. `applyRockShader(..., { detail: null })`
retains the imported Base Color, NormalGL, and ORM inputs; `restoreRockShader()`
restores the exact material, texture, geometry, index, attribute, shadow, and
user-data identities. A geometry edit invalidates the semantic accessor and
requires regeneration and rebaking rather than reusing stale masks.

This Three.js contract is not Unreal evidence. `_TL_ROCK_REGION` has not been
qualified through Unreal Static Mesh import; an engine-specific representation
such as vertex color or a mask texture needs a separate C12 qualification.

## Why rock has a separate shader editor

A separate shader editor is appropriate when a material treatment:

- Is reused across many assets.
- Has a stable semantic input contract.
- Needs independent art-direction tuning.
- Produces a versioned portable profile.
- Can be applied after asset creation or import.

Rock meets those conditions. This does not mean every asset category should
receive a shader lab. A debris collection can contain stone, painted metal,
wood, glass, paper, and vegetation. Those materials should normally route to
their existing shader owners. Create a new shader domain only when the
category has a distinct reusable material contract, not simply because it has
its own asset generator.

## Call Me Sensei reference baseline

The default is an editable reference checkpoint. It is not a screenshot, a
baked material, or a special-case material hidden inside the lab. The public
settings schema contains every connected scalar, Boolean, color, and option
used by the live rock graph. Rock Shader Lab renders that same schema and
starts with these values:

| Group | Accepted starting values |
| --- | --- |
| Base Projection | Macro scale `48`; saturation `0.72`; contrast `0.72`; brightness `0.04`; projection contrast `2`; side-only off; near detail scale `1.2`, strength `0.42`, fade `70 m` |
| Material Response | Daylight blue-white tint `[0.97, 0.99, 1]`; metallic `0`; smoothness `0.07`; smoothness texture off; smoothness contrast `1`; emission `0` |
| Shared Lighting | Forward-renderer exposure `0.9`; albedo-relative ambient floor `0.01`; rock sky-fill strength `0.72`; sky-fill tint `[0.72, 0.86, 1]` |
| Imported Surface Detail | Source albedo blend `0.5`; source normal strength `1`; source AO/ORM strength `1`; color and AO vertex channels disabled by default |
| Shoreline Response | Wet-band width `1 m`; darkening `0.28`; wet roughness `0.22` |
| Distance Tint | Start `500`; end `15000`; color `[0.74, 0.78, 0.82]`; strength `0.42` |
| Normal Detail | Fade distance `30000`; near flatten `0`; far flatten `1`; smoothed normal on; normal-Y sign `1` |
| Striping | Off; dormant scale `2500`; contrast `0.25`; color `[1, 0, 1]` |
| Moss Response | Off; dormant size `25`; sharpness `1.92`; offset `-0.15`; gain `1.94`; color power `1.3`; low `[0.24, 0.42, 0.12]`; high `[0.46, 0.68, 0.24]` |
| Top-Layer Mask | Asset-mask behavior on; sharpness `1.77`; offset `0.48`; the accepted source has no mask texture, so the graph uses white |
| Grass Layer | Off; dormant scale `10`; tint `[0.89100975, 1, 0.8066038]`; saturation `1`; emission `0` |
| Snow Layer | Off; dormant scale `11.51`; tint `[1, 1, 1]`; saturation `1`; emission `0.03` |
| Sand Layer | Off; dormant scale `5`; tint `[0.9150943, 0.9150943, 0.9150943]`; saturation `1`; emission `0.1`; normal scale `20`; strength `0.5`; rotation `30°` |
| Asset Integration | Source albedo Blend; source blend `0.5`; vertex color `0`; vertex AO `0` |

Callers may provide projected rock color, crack normal, smoothed normal, moss,
grass, snow, sand, sand-normal, smoothness, stripe, and top-mask textures.
When they omit maps, the runtime creates an explicitly reported first-party
procedural texture set. That generated set is a distributable safety default,
not an authored catalog texture and not proof of hero-asset visual approval.
When an imported rock has UV-authored albedo, normal, and glTF ORM textures,
the default controlled blend consumes those maps in UV space and records their
stable texture lineage on the styled material. It does not re-project the
imported maps through the macro fallback or merely retain unused references.

Changing any field makes a derived profile; Reset returns to this exact
baseline. A coding agent must not replace the baseline with visually similar
numbers, generic procedural textures, uncontrolled retained albedo, or
automatic vertex-color/AO influence.

### Preview scene

Rock Shader Lab previews the live shader on a first-party comparison rock in a
complete outdoor scene. Preview settings can independently override ground,
grass, tree, flowers, manufactured props, sky, clouds, and lighting, with
`call_me_sensei` as the default bundle. Those assignments, the selected rock,
time, and camera remain preview state and never enter a rock-shader document.

The preview bar exposes this through one **Preview styles** button. Its modal
first selects a complete bundle, then lists every registered context
domain—including Objects—for optional individual overrides. “From bundle”
removes an override and follows the selected bundle again. The modal remains
registry-driven so a future context such as water can be added without
inventing another control surface.

The full comparison scene uses WebGPU. Rock Shader Lab disables its WebGL
toggle for this scene instead of presenting a materially different fallback.

## Stable asset input contract

The runtime accepts any `THREE.Mesh` under the supplied root. For the best
result, rock geometry should provide:

| Input | Required | Meaning |
| --- | --- | --- |
| `position` | Yes | Surface geometry |
| `normal` | Yes | Geometric normal used by lighting and slope masks |
| `color` | Optional | Asset-authored large-form color and geological zoning |
| `envVertexAo` | Optional | Asset-authored ambient visibility; `1` is fully open |
| Base-color map | Optional | Imported albedo considered according to Source Albedo mode |
| Normal map | Optional | Imported fine normal detail |
| Top mask | Optional | Authored mask limiting grass, snow, or sand layers |

When a profile gives `color` or `envVertexAo` nonzero influence and the
attribute is absent, `applyRockShader()` installs a neutral attribute so the
material contract remains stable. The accepted Call Me Sensei baseline gives
both zero influence because the source spire graph does not consume them.
Neutral fallbacks make another profile renderable; they do not recreate
missing geological zones or crevice information.

Procedural rock generation should bake large-form identity into geometry,
vertex color, and AO. It should not bake the style profile's distant tint,
moss color, striping, or lighting response into the asset.

## Imported textures and consistency

Photoreal texture packs often differ in capture lighting, frequency content,
color grading, and scale. Applying the same light function does not remove
those differences. The rock shader therefore exposes an explicit Source
Albedo policy:

| Mode | Behavior | Use |
| --- | --- | --- |
| Replace | Uses the style profile's neutral projected rock texture and keeps asset color/AO as controlled inputs | Strongest cross-library consistency when imported maps are unusable |
| Blend | Mixes a bounded amount of UV-authored imported albedo into the style projection and admits matching normal/ORM detail | Default for clean textures with useful geological information |
| Retain | Uses the imported albedo at full influence | Validation, faithful imports, or assets already authored for the project |

`call_me_sensei` defaults to **Blend** with `0.5` imported-albedo influence.
`neutral` defaults to **Retain**.
This makes flattening/simplification a deliberate, reversible setting rather
than an invisible import heuristic.

Replace cannot manufacture semantic detail that the asset lacks. A scanned
rock with baked shadows, extreme noise, weak geometry, or missing material
boundaries may still need cleanup, rebaking, a better normal map, or a
different source asset. Report that limitation in an import audit rather than
hiding it behind a universal-success claim.

## Public settings schema

The Rock Shader Lab renders its inspector directly from
`ROCK_SHADER_SETTING_GROUPS` and `ROCK_SHADER_FIELD_SCHEMA`. Defaults, labels,
descriptions, ranges, options, and serialization behavior live in the public
module; the lab does not keep a private configuration list.

| Group | Portable responsibility |
| --- | --- |
| Base Projection | Macro triplanar scale, saturation, color contrast, brightness, axis blend, side-only projection, and close-detail scale/strength/fade |
| Material Response | Stone tint, metallic, smoothness, smoothness texture behavior, and emission |
| Shared Lighting | HDR exposure, shaded-face ambient floor, and rock-specific indirect sky-fill strength/tint |
| Shoreline Response | Wet-band width, darkening, and roughness; current water level remains scene state |
| Distance Tint | Start/end distance, far color, and blend strength |
| Normal Detail | Fade distance, near/far flattening, smoothed-normal use, and normal-Y convention |
| Striping | Optional side-projected geological/mineral stripe treatment |
| Moss Response | Enablement, scale, slope threshold, mask gain, color curve, and low/high colors |
| Top-Layer Mask | Asset-mask participation plus slope sharpness and offset |
| Grass Layer | Optional projected grass texture, tint, saturation, and emission |
| Snow Layer | Optional projected snow texture, tint, saturation, and emission |
| Sand Layer | Optional projected sand color and normal behavior |
| Asset Integration | Source-albedo policy, bounded blend, vertex-color strength, and vertex-AO strength |

Every current field is portable and serializable. Current scene weather is not
part of this profile. If live snow accumulation, wetness, dust, or moss growth
is added, the scene owns the current amount while this profile owns how the
rock responds to that amount.

Rock generators must emit a `rock` root assignment, semantic modeled parts,
and explicit surface-zone encodings for any generated moss, lichen, snow,
wetness, sand, dirt, mineral, or grass-like coverage. Those potential zones
are asset data; this shader owns their appearance and the scene owns their
current condition amount.

Actual grass blades, flowers, or shrubs growing from a rock are not rock
surface zones. They are separately labeled Vegetation child roots and route to
Grass, Flower, or Tree Shader. See
[Generated asset labeling and shader routing](generated-asset-labeling.md).

## Runtime use

```js
import {
  applyRockShader,
  createRockShaderSettings,
  restoreRockShader,
  setRockShaderSceneState,
} from '@call-me-sensei/toonlab/rock-shader';

const rockSettings = createRockShaderSettings({
  preset: 'call_me_sensei',
});

const report = applyRockShader(rockRoot, rockSettings, { textures });
console.log(report);
// Includes textureSource, usedGeneratedTextures, retainedSourceTextures,
// and shadowDefaultsApplied.

setRockShaderSceneState(rockRoot, { waterLevel });

// Restore the exact material objects that were present before assignment.
restoreRockShader(rockRoot);
```

`applyRockShader()` traverses only the supplied root. Set
`mesh.userData.rockShaderExclude = true` for an explicit exception, or pass an
`include(mesh)` predicate. The runtime marks assigned materials with
`environmentShaderExclude` so a later generic environment traversal does not
silently replace the domain-specific rock material.
It sets matched meshes to cast and receive shadows by default; explicit
`castShadow`/`receiveShadow` options can override that policy. `restoreRockShader()`
restores both the original materials and the original shadow flags.

## Supplying authored texture maps

The runtime includes a deterministic 256×256 first-party generated texture set
so the public graph remains runnable without private or licensed files. The
application report identifies this as `first-party-generated`. Hero assets may
replace individual maps with owned or distributable authored resources:

```js
applyRockShader(rockRoot, settings, {
  textures: {
    rock: rockColorTexture,
    rockNormal: rockNormalTexture,
    stylizedNormal: smoothedNormalTexture,
    smoothness: smoothnessTexture,
    stripe: stripeTexture,
    moss: mossTexture,
    grass: grassTexture,
    snow: snowTexture,
    sand: sandTexture,
    sandNormal: sandNormalTexture,
    topMask: topMaskTexture,
  },
});
```

Texture maps are style resources, not procedural-rock parameters. Keep their
license and provenance with the style resource pack. Do not embed licensed
source files into portable JSON; store stable resource identifiers and resolve
them in the host.

## Portable preset documents

Rock shader presets use:

- Schema: `toonlab/rock-shader-preset`
- Version: `1`
- Default preset: `call_me_sensei`

```js
import {
  createRockShaderPresetDocument,
  parseRockShaderPresetDocument,
  serializeRockShaderPreset,
} from '@call-me-sensei/toonlab/rock-shader';

const document = createRockShaderPresetDocument('studio-rock', {
  label: 'Studio Rock',
  description: 'Project-wide rock material treatment.',
  settings: {
    distanceTint: { strength: 0.34 },
    moss: { enabled: true, multiply: 1.8 },
  },
});

const json = serializeRockShaderPreset(document);
const parsed = parseRockShaderPresetDocument(json);
if (!parsed.ok) throw new Error(parsed.errors.join(' '));
```

The JSON can be committed to source control, kept in a `.toonlab` workspace,
or saved in any host-owned storage. OSS creation, validation, serialization,
parsing, resolution, and runtime use do not require a database.

## Style bundle use

The `rock` style-bundle slot accepts an inline rock-shader document or a
built-in shader style:

```js
import { applyRockShader } from '@call-me-sensei/toonlab/rock-shader';
import {
  createStyleBundleDocument,
  resolveStyleBundleSettings,
} from '@call-me-sensei/toonlab/styles';

const bundle = createStyleBundleDocument('project-style', {
  slots: {
    rock: { style: 'call_me_sensei' },
  },
});

const settings = resolveStyleBundleSettings(bundle);
applyRockShader(labeledRockRoot, settings.rock);
```

The bundle slot resolves detailed shader settings. It does not select
`boulder`, `cliff`, `river-rock`, an erosion recipe, a seed, or an LOD policy.
Those remain asset identity.

## Routing rules

Use the rock shader when the primary material behavior is geological stone:

- Boulders and loose rocks.
- Cliffs and exposed mountain faces.
- Stone rubble when it should share geological projection and moss response.
- Imported rock scans that have been accepted into the rock domain.

Do not route by filename alone:

- A painted concrete barrier normally belongs to manufactured environment.
- A metal ore pickup presented as character equipment may belong to the
  character/equipment domain.
- Moss cards, grass tufts, and roots remain vegetation even when attached to a
  rock.
- Snow particles and dust puffs remain VFX.
- A mixed ruin may contain rock-domain stone plus manufactured wood, metal,
  glass, and decals as explicit material exceptions.

Asset labels select the destination. The style bundle selects the treatment.
Scene state selects current conditions.

## Authoring and review workflow

1. Generate or import a rock without shader-specific settings.
2. Verify normals, scale, topology, and collision.
3. Verify `color` and `envVertexAo`, or accept the neutral fallback
   deliberately.
4. Label the root for the rock domain and record material exceptions.
5. Apply `call_me_sensei`.
6. Start imported assets in Replace mode; compare Blend only when the source
   texture contains useful clean geological information.
7. Tune the shared profile in Rock Shader Lab, not Rock Lab.
8. Export the rock asset and rock shader profile independently.
9. Resolve the selected profile through the project style bundle.
10. Review generated and imported rocks together under the reference lighting,
    distance, weather, and post-processing matrix.

The release target is not that every arbitrary model becomes
production-consistent automatically. The target is deterministic results for
contract-ready assets, a useful visible first pass for clean imports, and
actionable failure for unsuitable sources.
