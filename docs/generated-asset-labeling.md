# Generated asset labeling and shader-routing contract

Use this contract when preparing generated, assembled, reconstructed, or
imported assets for ToonLab. Geometry needs durable semantic information so the
correct shader profile can be selected and each intended part can be edited.

This contract is independent from procedural generation. A generator produces
geometry, materials, masks, and labels. A shader runtime consumes those labels.
Neither system owns the other system's settings.

When an asset lacks required labels, ToonLab reports the missing or ambiguous
assignments instead of silently guessing from names or colors.

## The four required label layers

Do not collapse these layers into one material name:

| Layer | Question answered | Example |
| --- | --- | --- |
| Primary rendering domain | Which renderer owns this renderable root? | `vegetation.tree`, `vegetation.grass`, `rock`, `manufacturedEnvironment` |
| Semantic part | What modeled part is this node or geometry region? | `tree.root`, `tree.trunk`, `tree.branch`, `tree.leaf`, `rock.fractureFace` |
| Material role | How should this draw material be shaded? | `woodySurface`, `foliageCard`, `grassBlade`, `flowerPetal` |
| Surface zone | Where may a base-surface layer or condition appear? | `moss`, `snow`, `wetness`, `lichen`, `sand`, `grassCoverage` |

The primary domain routes the asset to a shader family. Semantic parts support
part-specific editing, validation, animation, damage, and future shader
features. Material roles select the material treatment inside that family.
Surface zones provide stable zero-to-one coverage data without turning every
possible overlay into a separate mesh or asset identity.

## Required generator output

Every generated renderable asset must provide:

1. A stable asset and recipe identity.
2. One explicit primary rendering domain for every independently routed root.
3. A stable semantic-part assignment for every generated mesh or geometry
   group.
4. One or more explicit material roles for every material slot.
5. An explicit representation for every generated surface zone.
6. The same assignments at every LOD and in every exported form.
7. A machine-readable validation report containing missing, ambiguous, and
   unsupported assignments.

Generators must assign labels from construction knowledge. They must not
discard that knowledge and ask a later importer, LLM, filename heuristic, or
pixel classifier to reconstruct it.

### Suggested versioned record

The following illustrates the information model. It is not permission to add
ad hoc `userData` properties; generators must use the shared public schema
once its runtime API is published.

```js
{
  type: 'toonlab/renderable-asset-labels',
  version: 1,
  assetId: 'generated/tree/pine/seed-0042',
  recipe: {
    family: 'tree.pine',
    version: 3,
    seed: 42,
  },
  roots: [
    {
      nodeId: 'pine-root',
      domain: 'vegetation.tree',
    },
  ],
  parts: [
    { nodeId: 'roots', role: 'tree.root' },
    { nodeId: 'trunk', role: 'tree.trunk' },
    { nodeId: 'branches', role: 'tree.branch' },
    { nodeId: 'needles', role: 'tree.needle' },
  ],
  materials: [
    { materialId: 'pine-bark', roles: ['woodySurface'] },
    { materialId: 'pine-needles', roles: ['foliageCard'] },
  ],
  surfaceZones: [],
}
```

Stable IDs refer to nodes, geometry groups, or material slots in the exported
asset. Array positions and scene traversal order are not stable IDs.

## Vegetation requirements

Tree and plant generators must preserve modeled-part identity even when
several parts share one shader role.

### Tree and shrub parts

At minimum, identify every part that exists:

- `tree.root`
- `tree.trunk`
- `tree.branch`
- `tree.twig`
- `tree.leaf`
- `tree.needle`
- `tree.flower`
- `tree.fruit`
- `tree.deadwood`

Roots, trunks, branches, and twigs may all route to the `woodySurface`
material role while retaining their more precise semantic-part labels. Leaves
and needles normally route to `foliageCard` or a future explicit foliage-mesh
role. Flowers attached to a tree still require flower-specific material roles
when the Flower Shader must control them independently.

### Grass and groundcover parts

Grass generators must identify:

- blades or cards as `grass.blade`;
- optional seed heads as `grass.seedHead`;
- optional dead or cut blades as distinct parts when they need a different
  material response;
- the material role `grassBlade` on every grass draw material.

Planting density, clump layout, placement, wind field, and interaction-field
position remain asset or scene data. They are not Grass Shader settings.

### Flower and herbaceous-plant parts

Flower generators must distinguish, when present:

- `flower.petal`
- `flower.center`
- `flower.sepal`
- `flower.leaf`
- `flower.stem`
- `flower.bud`
- `flower.root`

The corresponding material roles include `flowerPetal`, `flowerCenter`,
`foliageCard`, and `herbaceousStem`. If petals, center, leaves, and stem share
one draw material, the generator must also provide an ID mask or another
stable per-region discriminator. Merely attaching four role strings to one
indivisible material does not make four independent shader controls possible.

The recipe also owns petal color, center color, attached-leaf palette,
herbaceous stem base color, flower/leaf textures, alpha cutoff, semantic
region masks, petal and center geometry, bloom scale/count, and stable
variation seeds. Flower Shader consumes those inputs; it owns their reusable
lighting, bands, surface, transmission/subsurface, cup, center-response, and
stem-response treatment. Generators must not bake a style-bundle palette into
the recipe or move recipe colors into the shader profile.

A flower asset that uses one material for petals, center, and stem cannot prove
independent controls for those roles. Use a correctly labeled asset with
separate roles or a stable region mask when those controls are required.

## Rock requirements

A generated rock has primary domain `rock`. It should identify modeled parts
that actually exist, such as:

- `rock.core`
- `rock.chunk`
- `rock.fragment`
- `rock.fractureFace`
- `rock.weatheredFace`
- `rock.embeddedMineral`

Rock surface zones are separate from modeled parts and from current weather.
Useful normalized zones include:

- `moss`
- `lichen`
- `snow`
- `wetness`
- `sand`
- `dirt`
- `mineralStripe`
- `grassCoverage`

The generator owns stable potential coverage: for example, crevices that can
hold moss or upward faces that can retain snow. The Rock Shader owns how a zone
looks. The scene owns the current amount caused by rain, season, temperature,
or gameplay.

### Grass on a rock

These cases must not be confused:

| Case | Required route |
| --- | --- |
| Green coloration or a projected grass-like coating on the rock surface | `rock` root plus a `grassCoverage` surface zone consumed by Rock Shader |
| Moss, lichen, snow, dirt, or wet film on the rock | `rock` root plus the corresponding rock surface zone |
| Actual grass blades growing from the rock | A separately labeled `vegetation.grass` child root with `grass.blade` parts and `grassBlade` materials |
| A flower or shrub rooted in a crevice | A separately labeled vegetation child root with its own parts and material roles |

A mixed generated assembly may contain several explicitly routed roots. The
outer scene group is not a substitute for those child-domain assignments.

## Surface-zone encoding

A surface zone must identify:

- a canonical zone ID;
- the target renderable root and geometry;
- its encoding;
- the channel or attribute name;
- value range and inversion;
- UV set or coordinate space when texture-backed;
- resolution and filtering policy when raster-backed;
- generation provenance and version.

Supported encodings may include a dedicated material split, geometry group,
vertex attribute, texture channel, or procedural field that can be baked
deterministically. Whatever the encoding, the consumer must receive a
normalized zero-to-one value with documented meaning.

Do not infer production surface zones from final albedo color. Green paint is
not moss; a bright face is not necessarily snow; a dark scan patch is not
necessarily wetness.

## Material separation and masks

Use this order of preference:

1. Separate draw materials when the regions genuinely require different
   render modes or shader families.
2. Geometry groups or material-ID masks for several semantic regions inside
   one asset.
3. Dedicated surface-zone masks for overlays and conditions.
4. A documented compatibility treatment for an indivisible source.

Transparent, cutout, opaque, emissive, and refractive surfaces must never be
merged solely to reduce the number of labels.

## LOD, instancing, and export

Labels are part of the asset, not editor-only metadata:

- Every LOD must preserve equivalent domain, part, material-role, and
  surface-zone meaning.
- Instanced meshes may share immutable label definitions, but every instance
  must retain stable asset/recipe identity and instance condition data.
- Mesh merging must preserve semantic boundaries through groups, IDs, or
  masks.
- GLB or another exported format must embed the shared contract or ship a
  versioned sidecar with stable references into the asset.
- Collision and navigation proxies must be marked as non-renderable and must
  not be routed through a visual shader.

If an export format cannot preserve the contract, export must fail or produce
an explicit blocking warning. Silent label loss is not acceptable.

## Generator Lab UX

Every procedural or assembly lab must include a **Labels** or **Routing**
inspection mode that shows:

- the primary domain for each renderable root;
- a color-coded semantic-part view;
- a material-role view;
- one selectable debug view per surface zone;
- LOD-to-LOD consistency;
- missing and ambiguous labels;
- the shader profile that each root and material will receive;
- the validation report that will accompany export.

The lab may preview a style bundle and individual shader overrides, but those
choices remain preview state. A generated asset recipe may record compatibility
requirements; it must not serialize a copy of shader settings.

## Validation and failure policy

A generator output is **Contract-ready** only when:

- every renderable root has exactly one valid primary domain;
- every generated node or group that needs independent behavior has a
  semantic-part assignment;
- every material slot has at least one valid material role;
- composite materials provide the masks needed by independent controls;
- every declared surface zone has a valid, inspectable encoding;
- LODs and exports preserve the same meaning;
- the Call Me Sensei comparison scene routes every element without name,
  color, or hierarchy guesses.

Missing labels are errors for accepted generator families. Importers may
propose labels for third-party assets, but inferred values remain visibly
unreviewed until a person or trusted pipeline step accepts them.

## Checklist for users and coding agents

When creating or modifying a generator, record:

1. Primary domain assignments.
2. Every semantic part emitted by the generator.
3. Every material role and which material slot receives it.
4. Every surface zone, its encoding, and its consumer.
5. How actual child assets are separated from surface coverage.
6. LOD, instancing, merge, and export preservation.
7. Validation failures and unsupported cases.
8. The exact comparison scene and style bundle used for review.
Passing geometry tests or producing an attractive screenshot is not enough if
the output cannot be routed deterministically.
