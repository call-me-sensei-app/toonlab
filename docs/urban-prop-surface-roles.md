# Manufactured environment material contract

ToonLab assets and reusable environment shaders share one portable contract:
**classify once, shade many times**.

This contract covers non-character, non-vegetation manufactured environments:
props, vehicles, buildings, streets, furniture, rooms, appliances, signs, and
indoor clutter. An asset records what each surface physically is. A shader
decides how those facts look in its own style. Changing the shader must not
require reclassifying the asset.

The older `urbanSurface` role is supported as a compatibility input. New
assets should author the layered `urbanMaterial` object described below.

## The ownership boundary

| Owner | Stores | Must not store |
|---|---|---|
| Asset / GLB | Stable material classification, source color and PBR maps, optional material-ID and condition masks | Pastel amount, cel thresholds, palette overrides, reflection strength, time-of-day values |
| Shader definition | Global look settings and sparse profiles for material, finish, rendering, and structural axes | Asset-specific mesh names or one-off color corrections |
| Scene | Lights, reflection environment, exposure, weather, and interior/exterior context | Permanent material classification |
| Import audit | Confidence, warnings, and a documented correction for genuinely ambiguous source material | A replacement look preset |

The classification describes facts, not a screenshot-matching instruction. A
black solar panel remains a display-like glass/composite surface in every
style. One shader may give it broad anime reflections and another narrow ink
highlights, but neither should relabel it.

## The five axes

Do not create a flat role for every object part. `lid`, `roof`, `trim`,
`furniture`, and `carPaint` are not physical materials. Describe a material
with independent axes so the same small vocabulary composes across asset
categories.

### Base material

`baseMaterial` accepts:

| ID | Includes |
|---|---|
| `metal` | Steel, aluminum, iron, copper, brass, and other conductive surfaces |
| `mineral` | Brick, concrete, plaster, stucco, stone, marble, asphalt, drywall, and roofing minerals |
| `wood` | Timber, boards, veneer, plywood, and manufactured wood |
| `polymer` | Rigid plastic, acrylic, vinyl, resin, and foam |
| `rubber` | Tires, seals, flexible bumpers, and rubberized parts |
| `glass` | Windows, mirrors, lenses, and transparent glazing |
| `ceramic` | Porcelain, pottery, tile, sinks, and glazed ceramic |
| `textile` | Fabric, upholstery, curtains, canvas, carpet, and rugs |
| `leather` | Leather and suede |
| `paper` | Paper, cardboard, cartons, and printed sheets |
| `composite` | Carbon fiber, fiberglass, laminates, and mixed engineered sheets |
| `fluid` | Liquids represented by an asset material rather than a scene water system |
| `genericDielectric` | Safe fallback when the source cannot be identified confidently |

### Finish

`finish` accepts:

`raw`, `painted`, `varnished`, `clearCoated`, `polished`, `brushed`,
`glazed`, `anodized`, `mirror`, or `matte`.

Finish describes the top optical layer. A clear-coated car body is
`metal + clearCoated`; a dumpster body is `metal + painted`; a chrome faucet
is `metal + polished`; a wooden table may be
`wood + varnished`.

Source roughness, metalness, normal, and clearcoat data remain authoritative
inside the classification. The finish supplies shader priors and stylization
policy when maps are incomplete.

### Render mode

`renderMode` accepts:

`opaque`, `alphaCutout`, `translucent`, `transmissive`, or `unlit`.

Emission is not a render mode because an opaque or transmissive material may
also emit light.

### Structural role

`structuralRole` accepts:

| ID | Meaning |
|---|---|
| `primaryMass` | Main readable body or architectural mass |
| `secondaryStructure` | Covers, roofs, braces, secondary panels, and attachments |
| `trim` | Frames, molding, borders, and deliberately subordinate detail |
| `fastener` | Handles, hinges, rails, pipes, bolts, and small hardware |
| `cavity` | Recesses, interiors, voids, and deliberately dark inset regions |
| `window` | Architectural or vehicle glazing aperture |
| `graphic` | Readable sign, poster, printed panel, or decal-dominated zone |
| `lightEmitter` | Visible lamp, light strip, bulb, or luminous fixture surface |

Structural role controls line weight, detail hierarchy, and a small number of
response multipliers. It never replaces the base material. A metal roof and a
slate roof can share `secondaryStructure` while retaining different material
responses.

### Content and condition masks

`contentFlags` may contain `graphic`, `display`, and `emissive`.

Continuous condition maps should carry wear, dirt, rust/oxidation, chipped
coating, wetness, burn/soot, snow/frost, and other coverage. These are masks,
not new material classes. Rust over painted steel does not turn the entire
surface into `metal + raw`.

When an imported material is explicitly named `rusty`, `oxidized`,
`corroded`, or `patinated` and has no painted/coated identity, the conservative
fallback is `metal + raw`; oxidation is then reconstructed as condition
coverage over that substrate. If the source explicitly says painted or coated,
the finish remains `painted` and rust stays an overlay. This prevents warm
oxidation pixels from being mistaken for the authoritative paint hue.

## Authoring metadata

Put a versioned `urbanMaterial` object in glTF `extras` on the material:

```json
{
  "name": "MAT_car_body",
  "extras": {
    "urbanMaterial": {
      "version": 1,
      "baseMaterial": "metal",
      "finish": "clearCoated",
      "renderMode": "opaque",
      "structuralRole": "primaryMass",
      "contentFlags": []
    }
  }
}
```

Three.js exposes extras through `userData`:

```js
material.userData.urbanMaterial = {
  version: 1,
  baseMaterial: 'glass',
  finish: 'polished',
  renderMode: 'transmissive',
  structuralRole: 'window',
  contentFlags: [],
};
```

A node-level value is a default for every material below it. Material metadata
wins when a multi-material mesh needs different classifications. Reopen every
exported GLB and inspect `userData`; do not assume the DCC exporter preserved
custom properties.

Individual compatibility fields are also accepted:
`urbanBaseMaterial`, `urbanFinish`, `urbanRenderMode`,
`urbanStructuralRole`, and `urbanContentFlags`. Prefer the nested object for
new assets.

## Mixed atlases and material-ID masks

One classification cannot describe an atlas containing incompatible surfaces.
For example, a facade atlas may contain brick, timber, painted metal, and
window glass. Either:

1. split those zones into separate materials, or
2. provide a material-ID mask and a channel-to-classification table.

A practical packed mask might use R for masonry, G for wood, B for metal, and
A for glass. The assignment is authored once and remains stable across every
shader. Do not pick the one class that happens to make the current beauty
render look least wrong.

This is why some meshes require a split or ID mask before glass, wood, and
masonry can react independently. A draw call has one material classification.
If brick and window pixels share that draw call and there is no pixel mask,
the shader has no information that distinguishes them. Polygon count is not
the issue; missing semantic boundaries are. Split materials are mandatory when
render modes differ (for example opaque masonry beside transmissive glass).
An ID mask is appropriate when multiple opaque classes can remain in one
atlas.

## Resolution and fallbacks

The reference classifier resolves classification in this order:

1. Material `userData.urbanMaterial`
2. Mesh/node `userData.urbanMaterial`
3. Individual `urbanBaseMaterial` and companion compatibility fields
4. Legacy `urbanSurface`
5. Canonical tokens and conservative semantic name inference
6. PBR cues such as transparency, emission, and strong metalness
7. `genericDielectric`

Inference exists to make unprepared third-party GLBs inspectable. It is not a
production authoring substitute. The benchmark exposes fallback counts so
low-confidence atlases remain visible instead of silently masquerading as
painted metal.

### Automatic detection versus visual analysis

`classifyManufacturedMaterial(object, material)` and
`analyzeManufacturedAsset(root)` provide the automatic code path. They use:

- explicit `urbanMaterial`/legacy metadata;
- material, object, and short ancestry names;
- alpha test, opacity, transparency, transmission, and unlit state;
- emissive maps/colors and strong metalness; and
- stable source metadata preserved by the loader.

This is intended to cover the normal 80%+ import path when assets have clean
PBR separation and useful names. It will not guess a semantic material from
base-color pixels alone. A visual model can propose regions for an anonymous
mixed atlas, but should run as an offline import assistant with confidence and
review. Its output is not a secret runtime shader branch: approve it into
material splits, an ID-mask channel table, or a sidecar assignment.

```js
const audit = analyzeManufacturedAsset(root);
if (audit.summary.fallbackCount || audit.summary.lowConfidenceCount) {
  showImportReview(audit);
}
```

## Object class

Object class is a profile selector, not another material axis. Put
`urbanObjectClass` on the asset root. Supported values are:

`generic`, `prop`, `vehicle`, `buildingExterior`, `buildingInterior`,
`furniture`, `fixture`, `appliance`, `infrastructure`, `signage`,
`industrialMachine`, and `clutter`.

For example, `buildingExterior` can reduce close-up normal emphasis or tune
line hierarchy across a facade while brick remains `mineral`, window remains
`glass`, and metal flashing remains `metal`. Do not assign one
`buildingExterior` material to the whole building.

## Runtime overlay and durable persistence

The runtime attaches classification to the loaded Three.js graph. It does not
rewrite geometry, UVs, or texture pixels. Choose one durable representation:

1. embed `urbanMaterial` in glTF material/node `extras` (preferred for owned
   GLB assets), or
2. keep an adjacent `*.toonlab-materials.json` sidecar (preferred for
   third-party, FBX, OBJ, USDZ, VRM, PMX/PMD, or read-only sources).

```json
{
  "type": "toonlab/manufactured-material-manifest",
  "version": 1,
  "assetId": "city-bus-stop-a",
  "objectClass": "infrastructure",
  "assignments": [
    {
      "selector": { "materialName": "M_Glass" },
      "classification": {
        "version": 1,
        "baseMaterial": "glass",
        "finish": "polished",
        "renderMode": "transmissive",
        "structuralRole": "window",
        "contentFlags": []
      }
    }
  ]
}
```

Call `applyManufacturedMaterialManifest(root, manifest)` after any supported
loader returns its `Object3D`. Use stable material names, object names/paths,
and `assetId`; do not persist Three.js UUIDs.

The [Manufactured Material Lab](/manufactured-material-lab/) is the official
review surface. Its tag switches are a temporary overlay. “Export sidecar
JSON” creates the durable data; it does not silently modify the source model.

## Current lab migration

The Manufactured Material Lab uses an import annotation table for third-party
GLBs that do not yet contain `urbanMaterial` extras. This table represents the
one-time asset classification step; it is not a shader override. When an asset
is published into the ToonLab library, move the same facts into the GLB or its
asset manifest.

| Benchmark asset | Current contract state |
|---|---|
| Dumpster | Mesh-level metal, rubber, painted coating, trim, and fastener assignments |
| Bus station | Material-level metal, composite/display, light-emitter, graphic, glass, and mineral assignments |
| Apartment building | Material-level mineral assignments with distinct trim, roof/gable, asphalt, and polished marble finishes |
| Living room | Material-level glass, mirror, textile, metal, polymer, mineral, composite, and wood assignments; ambiguous foliage and generic surfaces remain audited |
| Bicycle collection | Painted-metal bicycles and mineral planter surfaces use explicit manufactured assignments; `Arch-Leaf` and `Arch-Twig` route to the vegetation shader as `foliageCard` and `woodySurface`; the clean mixed-atlas bicycle is the true-black regression case |
| Streetcar | Mixed reprojected atlases; uses `genericDielectric` and remains flagged for an ID-mask or material-split audit |
| Burned-out cars | Distressed mixed atlas; uses `genericDielectric` and remains flagged for an ID-mask or material-split audit |
| Beach props | One atlas spans several physical materials; uses `genericDielectric` and remains flagged for an ID-mask or material-split audit |
| Ground-floor kit | One atlas mixes masonry, wood, metal, and recesses; uses `genericDielectric` and remains flagged for an ID-mask or material-split audit |
| Wooden Crate 01 (redistributable sample) | Poly Haven CC0 sample; one atlas spans wood and metal hardware, so it uses `genericDielectric` and remains flagged for a split or material-ID mask |

The nine private benchmark GLBs live under
`assets-local/labs/manufactured-material/test-cases/<id>/model.glb`. They are
gitignored and development-only. The lab also supports session GLB uploads,
saved Asset Browser library entries, and the open gallery without mixing any
of those preview identities into the authored look.

Do not clear an audit by labeling a mixed atlas with whichever base material
occupies the most pixels. Split the zones or add a stable material-ID mask.

### Mixed shader-domain scenes

A scene can contain multiple shader domains. Do not force vegetation through
the manufactured catch-all just because leaves are packaged in the same GLB as
a bicycle, bench, or building.

Route each material before manufactured classification:

```js
import {
  createImportedVegetationMaterial,
} from '@call-me-sensei/toonlab/vegetation';

leafMesh.material = createImportedVegetationMaterial(sourceLeafMaterial, {
  role: 'foliageCard',
});
twigMesh.material = createImportedVegetationMaterial(sourceTwigMaterial, {
  role: 'woodySurface',
});
```

The procedural nature materials are TSL/WebGPU materials. The imported
vegetation adapter is the WebGL compatibility path: it consumes the same
VegetationShaderProfile and semantic roles while retaining the source mesh's
albedo, alpha cutout, UVs, and normal detail. This routing is runtime metadata
and can live beside the manufactured sidecar. It does not require merging the
two classification vocabularies or rewriting the GLB.

## Legacy `urbanSurface` migration

The following compatibility roles still load:

| Legacy role | Layered interpretation |
|---|---|
| `paintedMetal` | `metal + painted + opaque + primaryMass` |
| `paintedTrim` | `metal + painted + opaque + trim` |
| `bareMetal` | `metal + raw + opaque + secondaryStructure` |
| `rubber` | `rubber + matte + opaque + secondaryStructure` |
| `lid` | `metal + painted + opaque + secondaryStructure` |
| `graphicPanel` | `genericDielectric + matte + opaque + graphic`, with `graphic` content |
| `technicalSurface` | `genericDielectric + matte + opaque + secondaryStructure`, with `display` content |

`lid` is intentionally not present in the new base-material list. A dumpster
cover, vehicle hood, building roof, and storage-box lid may all use different
materials even though they are similarly shaped parts.

## Shader profiles

A reusable shader should compose four layers:

1. **Global look** — cel bands, shadow treatment, exposure response, palette
   policy, line work, global reflection scale, and time-of-day behavior.
2. **Material and finish profiles** — sparse priors for pastel eligibility,
   texture authority, roughness breakup, reflection, Fresnel, wear, and value
   limits.
3. **Structural/content modifiers** — line hierarchy, cavity retention,
   graphic legibility, display behavior, emission, and window response.
4. **Scene context** — exterior day/night or interior day/night lighting,
   reflection environment, ambient fill, and portal/local-light behavior.

These layers are data, not independent shader forks. A custom shader tunes
global settings and profile tables; it does not reassign asset classification.
ToonLab only forks shader implementation for incompatible render behavior,
not for every physical base material.

Source-color authority must also be evaluated locally inside a mixed atlas.
Neutral black and gray texels remain neutral even when another atlas region
contains saturated paint or rust. The material-wide color anchor may guide
colored paint reconstruction, but it must not recolor neutral rims, spokes,
fasteners, bars, or cavities. Stylized Fresnel, rim, and reflection layers
should likewise derive a neutral response for neutral source texels unless the
actual scene light supplies a colored reflection.

### Mirror reflection providers

`glass + mirror` classifies a surface; it does not hard-code how a scene
produces reflections. The scene must supply a reflection provider:

- **Scene probe** is the general default. Capture one cubemap near the mirror
  group when the room, lighting, or material assignments change. It is
  view-dependent and responds to the actual scene, but is not a geometrically
  exact planar reflection.
- **Planar reflection** is the high-quality option for large hero mirrors and
  glossy floors. It renders from a reflected camera and must update when the
  view or reflected scene changes.
- **Glossy fallback** keeps Fresnel and authored roughness response when a
  provider is unavailable. It must never pretend to be a true mirror.

Provider choice belongs to scene/IP render policy, not the asset manifest.
Developers tag the material once as `finish: mirror`; shader settings control
stylization and strength, while the scene chooses probe, planar, or fallback.
Mirror meshes are hidden during probe capture so they do not recursively
reflect themselves.

```js
const lockedEnvironmentLook = {
  version: 1,
  default: {
    parameters: {
      specularStrength: 0.12,
    },
  },
  baseMaterials: {
    mineral: {
      parameters: { specularStrength: 0.04 },
    },
    glass: {
      parameters: { specularStrength: 0.42 },
    },
  },
  objectClasses: {
    buildingExterior: {
      parameters: { normalMapStrength: 0.72 },
    },
  },
};
```

The exact resolution order is:

1. global environment catch-all;
2. `materialLook.default`;
3. `baseMaterials[classification.baseMaterial]`;
4. `finishes[classification.finish]`;
5. `renderModes[classification.renderMode]`;
6. `structuralRoles[classification.structuralRole]`;
7. each matching `contentFlags` profile in canonical order;
8. `objectClasses[root.userData.urbanObjectClass]`; and
9. `assets[stableAssetId]`.

The final asset layer is for rare hero-object response, not a substitute for
correct classification. Environment preset documents store `materialLook`
alongside `features`, `parameters`, `rig`, and scenario variants; style
bundles preserve it.

## Classification examples

| Surface | Classification |
|---|---|
| Dumpster body | `metal + painted + opaque + primaryMass` |
| Dumpster cover | `metal/polymer + painted/matte + opaque + secondaryStructure` |
| Bare handle | `metal + raw + opaque + fastener` |
| Car body | `metal + clearCoated + opaque + primaryMass` |
| Windshield | `glass + polished + transmissive + window` |
| Tire | `rubber + matte + opaque + secondaryStructure` |
| Brick facade | `mineral + raw + opaque + primaryMass` |
| Painted interior wall | `mineral + painted + opaque + primaryMass` |
| Wooden table | `wood + varnished + opaque + primaryMass` |
| Sofa upholstery | `textile + matte + opaque + primaryMass` |
| Ceramic sink | `ceramic + glazed + opaque + primaryMass` |
| Television screen | `glass/polymer + polished + opaque + secondaryStructure`, with `display` and `emissive` as appropriate |
| Poster | `paper + matte + opaque + graphic`, with `graphic` content |

## Adding schema values

Schema evolution is not shader customization. Add a base material, finish,
render mode, structural role, or content flag only when:

- multiple unrelated assets need it;
- the existing axes cannot represent it without recurring hacks;
- at least two styles need to treat it differently; and
- it describes what the source is, not how one reference image looks.

Update the enum, classifier, validators, documentation, compatibility mapping,
and official shader fallback tables together. Unknown values must warn and
fall back safely.

## Model-generation and import checklist

1. Inventory every distinct material zone.
2. Preserve source albedo/color, normal, roughness, metalness, AO, emissive,
   opacity, clearcoat, transmission, and UV data.
3. Assign the five classification axes per material.
4. Split incompatible zones or add a material-ID mask.
5. Keep condition coverage in masks rather than class names.
6. Export `urbanMaterial` in glTF extras.
7. Reload the GLB and inspect classifications and warnings.
8. Test at multiple times of day and camera angles.
9. Test graphics for legibility, black materials for value retention, and
   reflective surfaces for view-dependent variation.
10. Test the same asset with more than one shader without changing metadata.

The asset passes when its identity survives multiple styles without
classification edits. A shader passes when one profile works across unrelated
assets without model-name conditionals.
