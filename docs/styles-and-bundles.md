# Styles, style bundles, and asset routing

This document is the rendering-style contract for ToonLab projects.

For the versioned end-to-end product boundary, read [What ToonLab 0.5.0 can
and cannot do](capability-status.md). A bundle coordinates supported rendering
systems after a scene satisfies the target/material labeling contract. It does
not design the level or safely classify every arbitrary imported material.

`Call Me Sensei` is ToonLab's protected default Style Bundle. It represents one
coordinated style, with every supported element and domain slot assigned to its
`call_me_sensei` treatment. The main ToonLab repository and hosted Pro product
may open and export this bundle, but they do not overwrite or delete it. Start
from it by forking an editable custom bundle.

ToonLab can accept assets from many sources, but accepting an asset is not the
same as guaranteeing a consistent production look. Consistency comes from
three things working together:

1. A small set of rendering domains with clear responsibilities.
2. Durable labels that describe what every asset and material represents.
3. A style bundle that selects a coordinated treatment for every domain.

One universal shader is not the goal. Character skin, painted metal, foliage,
water, rock, and smoke need different rendering behavior. A style bundle makes
those systems feel like one visual language without forcing them through one
material implementation.

The terms **must**, **should**, and **may** below are intentional:

- **Must** is required for a production-consistent, automatically routed asset.
- **Should** is the default unless the project records a deliberate exception.
- **May** is optional or project-specific behavior.

### First-pass expectation

For a compliant labeled scene, applying Call Me Sensei through
`createSceneStyleRuntime()` with `discovery: 'scene-labels'` and
`mode: 'strict'` is expected to install the approved package defaults without
scene-local shader numbers. That includes coordinated sky/cloud, renderer,
lighting/probe/shadow, character, manufactured, rock, ground/grass, vegetation,
water, post, and conservative static collision for labeled solid domains.

The host still authors geometry, layout, cameras, gameplay, dynamic physics,
navigation, and semantic
labels. Ambiguous imported materials require an explicit override. Never fix a
strict-mode finding by bypassing the audit, deep-importing repository code, or
copying numeric settings out of a showcase scene.

Collision is driven by the same target labels but is not a visual bundle slot.
The high-level scene runtime registers default bounds for manufactured, rock,
prop, and tree targets, honors explicit versioned collision metadata, and
reports readiness independently. See [Collision defaults](collision.md).

## Core concepts

Keep these concepts separate:

| Concept | What it controls | Example |
| --- | --- | --- |
| Asset identity or preset | What the thing is | oak tree, sandstone rock, compact car |
| Style | The IP-wide visual treatment | a project's named signature style |
| Runtime condition | What is happening to the thing now | burned, wet, damaged, autumn |
| Scenario | The surrounding state | golden hour, rain, night |
| Style bundle | Coordinated style choices and settings across systems | toon, environment, vegetation, sky, cloud, water, post |
| Asset labels | Where and how an asset is rendered | equipment, painted body, glass, leaf card |

Do not encode asset identity or the current scene condition into a style name.
A burned car is still the same vehicle asset. Its condition changes; the
project style does not.

Use this composition model:

```text
rendered result =
  asset identity
  + semantic material labels
  + selected style bundle
  + current condition
  + current world scenario
```

Changing the style must not replace the asset. Changing the condition must not
replace the project style. Changing the current scenario must not mutate the
saved bundle.

### Protected first-party system style

`call_me_sensei` is the canonical first-party system style in the ToonLab
repository and public Labs. It must remain present, keep the **Call Me Sensei**
label, and remain read-only. Users may open it or use **Save As** to create an
editable local copy; local save, import, update, and delete operations must not
shadow, rename, overwrite, or remove the system id. Shader Labs switch between
the system style and saved copies through their style browser rather than an
inspector-side Style dropdown.

This is a repository and release-verification policy, not a restriction on the
OSS license. A downstream fork may deliberately change its own source. Changes
to the canonical repository that weaken this invariant are rejected by the
system-style verifier.

## Ownership contract

The asset, bundle, scene, and router own different information:

| Owner | Stores |
| --- | --- |
| Asset | Stable identity, rendering domain, semantic material roles, authored masks, supported conditions |
| Style profile | Portable settings for one rendering system |
| Style bundle | The selected profile or settings for each rendering system |
| Scene or save state | Current weather, time, condition, damage, and other runtime values |
| Router and audit | How labeled assets are assigned to systems, plus warnings for incomplete or ambiguous data |

A style bundle must not become a scene dump or an asset database. It should
remain portable across scenes and projects that follow the same labeling
contract.

The same asset must not change rendering domains merely because a developer
reparents it. A held sword and the same sword lying on a table require an
explicit project decision: persistent `equipment`, persistent
`manufacturedEnvironment`, or two authored variants. Scene hierarchy is not a
durable semantic label.

## Rendering domains

Every renderable root must have one primary rendering domain. Individual
materials may have explicit exceptions for glass, emissive surfaces, effects,
or another specialized treatment.

| Domain | Typical content | Default treatment | Required semantic information |
| --- | --- | --- | --- |
| Character | Skin, hair, eyes, clothing, NPC bodies | Character toon shader | Anatomy and clothing material roles |
| Equipment | Held weapons, worn armor, bags, hero accessories | Character toon shader | Metal, cloth, leather, emissive, overlay, and similar roles |
| Manufactured environment | Vehicles, dumpsters, furniture, buildings, machinery, street props | Environment or manufactured-material shader | Surface, finish, render mode, structure, and object class |
| Vegetation | Trees, shrubs, grass, flowers, foliage cards | Vegetation shader | Foliage, wood, blade, petal, center, and stem roles |
| Rock and debris | Rocks, cliffs, rubble, generated debris | Rock or debris system | Generator identity, surface class, and optional material masks |
| Water and sky | Lakes, rivers, oceans, clouds, atmosphere | Specialized system | System preset plus current scenario |
| VFX | Smoke, fire, particles, trails, decals | VFX-specific system | Effect type, blend/render mode, and quality behavior |
| Custom | Content with a deliberately bespoke renderer | Explicit custom route | Named renderer owner and documented bundle participation |

A domain describes the renderer responsible for the asset. It is not a
category in an art-library search taxonomy. A `vehicle` search category, for
example, normally routes to `manufacturedEnvironment`; it is not a separate
shader domain.

### Vegetation shader family

Vegetation is one implementation family with one shared treatment base and
three independently authored role profiles:

| Profile | Semantic material roles | Does not own |
| --- | --- | --- |
| Tree Shader | Canopy foliage, leaf cards, needles, bark, trunks, branches, roots, and other woody surfaces | Tree species, branching, canopy geometry, scatter, LOD, or season |
| Grass Shader | Grass blades and groundcover thin surfaces | Blade geometry, clump layout, density, placement, interaction-field position, or current wind |
| Flower Shader | Petals, bloom centers, attached leaves, and herbaceous stems | Species, petal count, plant geometry, placement, or current wind |

Lighting, thin-surface transmission, and weather response resolve from one
shared vegetation base by default. The Tree, Grass, and Flower documents own
their role-specific treatment and embed a portable snapshot of the shared
base. Editing a shared group must warn that it affects Tree foliage,
Bark/wood, Grass/groundcover, and Flower petals, centers, leaves, and stems.

Use an explicit override with a visible owner and reset-to-shared operation
when a role needs to differ from the shared vegetation base. A copied value
that silently drifts from the base is not a supported configuration. Applying
one role profile must not replace another role profile, while applying its
shared snapshot intentionally updates the common base.

Ground is not vegetation. Soil, sand, paths, terrain layers, slope/height
blending, triplanar projection, macro variation, and the receiving response
to host-supplied surface conditions route to the Ground Shader domain. Plants
placed on the ground retain their Vegetation profiles. Current wetness and
snow accumulation are scene state; the cross-domain rendered snow appearance
comes from the Snow Surface profile owned by Weather Rendering & Surface.
Desert dirt, sand, and vegetated substrates are landscape material identity
or presets, not additional Ground Shader domains.

Tree, Grass, and Flower generation labs own asset identity and geometry.
Their shader labs own reusable material profiles. A generated or imported
asset connects the two through explicit semantic material roles. Generated
assets must also preserve modeled-part identity and any shader-consumable
surface zones; see
[Generated asset labeling and shader routing](generated-asset-labeling.md).

Tree and plant palettes follow the same boundary. Primary/gradient foliage
colors, bark base color, petal and center colors, herbaceous stem base color,
leaf and flower sprites, alpha cutoffs, semantic region masks, and stable
variation seeds belong to the asset or species recipe. A vegetation shader
may shape a normalized height gradient, apply an explicit style-wide hue
transform, simplify authored detail, and define light/surface response; it
must not silently replace every species with one global plant palette.

Call Me Sensei defines one missing-input policy for package-generated tree
bark: preserve an authored trunk texture; otherwise select the registered
`call-me-sensei-bark-v1` surface. Developers and coding agents may explicitly
choose another registered profile. This is a deterministic asset fallback,
not a replacement for authored species identity, and an explicit
`trunkSurfaceProfile: 'none'` remains an intentional opt-out. Generated trunks
cast and receive through the shared shadow pass without scene-local flag fixes.

The canonical Flower Shader therefore owns petal/center bands, surface and
highlight response, subsurface/transmission, cup darkening, independent center
light/shadow response, attached-foliage rendition, and herbaceous-stem
lighting/surface treatment. It does not own the flower palette or stem base
color. `foliage.mainColor`, `foliage.gradientColor`,
`foliage.styleColorStrength`, `flower.textureTint`, `flower.tintStrength`,
`stem.color`, and `stem.colorStrength` are legacy aggregate compatibility
inputs, not canonical `flowerShader` settings.

Style-bundle values are reusable shader defaults after the asset/species
recipe has supplied its base data. A placed instance may have an explicit
color/season/health/damage overlay, but that is a separate instance or
condition layer. It never mutates the style-bundle slot and never turns an
asset-owned palette into a shader setting.

The immutable reference fixture remains the default preview and fallback.
When a retained material combines roles without a stable mask, the lab must
mark role-specific controls unsupported for that fixture and offer a labeled
procedural, saved/project, or imported fixture that implements the complete
role contract. Attaching multiple role names to one indivisible material is
not evidence that independent controls work.

### Character toon coverage

Use the character toon shader for:

- Character anatomy, hair, eyes, and clothing.
- Worn accessories that should read as part of the character silhouette.
- Held or hero equipment that needs the same graphic light bands and outline
  language.
- Weapons when they are presented as character equipment.

Do not automatically use it for every object shaped like a weapon. A
decorative sword mounted on a wall can be a manufactured environment prop.
The durable domain label, not the object name or current parent, determines
the route.

Equipment still needs semantic material roles. Metal, cloth, leather,
skin-adjacent parts, emissive details, and transparent overlays should not all
receive identical toon parameters.

### Specialized-material exceptions

A primary domain does not require every material below that root to use the
same shader.

Examples:

- A vehicle body routes to the manufactured shader while its windows use the
  domain's transparent/glass path.
- A character routes to the toon shader while a magical aura routes to VFX.
- A tree routes to vegetation while a lantern hanging from it remains a
  manufactured prop.
- Water, sky, particles, decals, and video surfaces retain their specialized
  renderers.

Exceptions must be explicit. A shader incompatibility is not permission to
silently leave a material unstyled.

## Label assets before final styling

Shader parameters cannot recover semantic boundaries that are absent from an
asset.

If paint, rubber, glass, rust, and soot share one texture atlas with no
material split or ID mask, a shader cannot reliably give each region a
different response. It can only transform the pixels it receives. A flattened
or blurred treatment can hide some inconsistency, but it cannot create missing
material meaning.

For production use, label:

- A stable asset identity.
- One primary rendering domain for each renderable root.
- A semantic role for every material.
- Authored ID, condition, or detail masks when one material contains several
  visual substances.
- Transparent, cutout, emissive, and effect surfaces explicitly.
- Supported runtime conditions such as wet, burned, damaged, snowy, or
  overgrown.
- Any deliberate custom-renderer exception.

Use this precedence:

1. Explicit metadata embedded in the asset or its import document.
2. A versioned project-side manifest or sidecar.
3. Name-based or texture-based inference for import assistance only.

Inference is not a production contract. An LLM, importer, or developer may
propose labels, but the result must remain visible, editable, and auditable.

### Existing system-specific labels

Existing ToonLab systems already use system-specific metadata, including:

- Character material roles such as `material.userData.toonRole`.
- Manufactured-surface classifications such as `urbanMaterial` and
  `urbanObjectClass`.
- Vegetation roles for foliage, wood, grass, petals, centers, and stems.
- Generator presets that preserve the identity of rocks, debris, trees,
  grass, and flowers.

The manufactured-material contract is documented in
[Manufactured environment material roles](urban-prop-surface-roles.md).

The target router also requires a versioned root-level rendering-domain label.
Until the shared runtime encoding is finalized, hosts should keep domain
assignments in a durable project asset manifest. Do not invent incompatible
`userData` property names in individual integrations. The normative
information model and generator acceptance rules are defined in
[Generated asset labeling and shader routing](generated-asset-labeling.md).

### Generated assets

Procedural generation, asset assembly, and reconstruction have a stronger
obligation than best-effort imports: they know how the asset was constructed
and must preserve that knowledge.

Every generator must emit:

- one primary rendering domain for every independently routed root;
- semantic modeled parts such as tree root, trunk, branch, leaf, flower
  petal, flower center, rock core, and fracture face;
- shader-facing material roles for every material slot;
- explicit zero-to-one surface zones for generated coverage such as moss,
  snow, wetness, lichen, sand, or grass-like rock coverage;
- equivalent assignments across LOD, instancing, mesh merges, and export;
- a machine-readable validation report.

Modeled parts, material roles, and surface zones are different data. For
example, tree root, trunk, and branch parts can share the `woodySurface`
material role. A rock's `moss` zone remains part of the Rock Shader path,
while actual grass-blade geometry growing on the rock is a separately labeled
Vegetation/Grass child root.

A generator must never depend on a later LLM, material-name heuristic, or
albedo-color classifier to recover semantics that were known during
construction.

### Minimum import record

Until the public root-label schema lands, a host-side import record should
preserve at least this information:

```js
{
  assetId: 'vehicle.compact-car.01',
  source: {
    uri: './assets/compact-car.glb',
    license: 'CC0',
  },
  rendering: {
    domain: 'manufacturedEnvironment',
    materialRolesReviewed: true,
    customRenderer: null,
  },
  conditions: ['clean', 'wet', 'burned'],
}
```

This is an illustrative host manifest, not a currently exported ToonLab
document schema. Keep it outside the bundle. Migrate it to the public
root-label schema when that schema becomes available.

### Mixed materials and atlases

When one draw material contains several substances, use one of these solutions
in descending order of reliability:

1. Split the geometry into semantic materials.
2. Author a stable material-ID mask.
3. Author narrower condition/detail masks for rust, soot, wetness, decals, or
   damage.
4. Use a documented compatibility treatment that deliberately simplifies the
   entire material.

Do not classify pixels from albedo color at runtime and call the result
production-safe. Dirt can be the same color as rubber; burned paint can be the
same value as glass; lighting baked into a scan can look like a semantic edge.

### Import audit

An asset is ready for a first stylized preview when it has clean PBR inputs
and a plausible inferred route. It is ready for production only when:

- Its primary domain is explicit.
- Its material roles are explicit.
- Required masks or material splits exist.
- Unsupported transparency or custom shader dependencies are resolved.
- Its condition overlays do not overwrite its base identity.
- It has been reviewed under the project's reference lighting and post stack.

Unknown or ambiguous assets must produce an audit warning. They must not
silently pass as production-ready.

For manufactured imports, `proposeManufacturedStyleTargetLabel()` reports the
automatically resolved materials and keeps generic, conflicting, or
low-confidence materials blocked. Review those entries through explicit
`materialOverrides`, then use
`applyManufacturedStyleTargetLabelProposal()`. Measure automatic readiness
before overrides and assisted readiness after overrides as separate outcomes.
`applyStyleBundle({ mode: 'strict' })` independently reconciles the declared
contract against the current live material slots, so a stale label cannot
silently authorize mutation.

## Support levels

Use explicit support levels when reporting import quality:

| Level | Meaning | Automation promise |
| --- | --- | --- |
| Contract-ready | Explicit domain, semantic roles, masks, and verified style result | Deterministic production routing |
| Clean PBR first pass | Clean conventional materials with enough structure for a useful initial mapping | Automatic preview followed by review |
| Mixed-atlas compatibility | Several substances or baked photographic detail share insufficient labels | Simplification fallback; limited consistency |
| Bespoke | Asset requires asset-specific authoring or a custom renderer | No generic consistency guarantee |

Flattening realistic textures is a valid compatibility mode. It reduces
high-frequency photographic detail and can unify mixed assets quickly. It
should not be the only path for the signature style because it also removes
useful authored form and still cannot separate unlabeled materials.

The production goal is not “every asset looks identical after one click.” The
goal is:

- Contract-ready assets route deterministically.
- Clean assets receive a useful, auditable first pass.
- Ambiguous assets fail visibly with actionable remediation.
- Bespoke assets have an explicit owner.

## Style bundles in the OSS package

Style bundles are an OSS concept. A database is not required.

The package can create, validate, serialize, parse, and resolve a bundle as
local JSON:

```js
import {
  createStyleBundleDocument,
  parseStyleBundleDocument,
  resolveStyleBundleSettings,
  serializeStyleBundle,
} from '@call-me-sensei/toonlab/styles';

const bundle = createStyleBundleDocument('studio-signature', {
  label: 'Studio Signature',
  slots: {
    toon: { style: 'call_me_sensei' },
    environment: { style: 'call_me_sensei' },
    manufacturedSurface: { style: 'call_me_sensei' },
    treeShader: { style: 'call_me_sensei' },
    grass: { style: 'call_me_sensei' },
    grassShader: { style: 'call_me_sensei' },
    flowerShader: { style: 'call_me_sensei' },
    sky: { style: 'call_me_sensei' },
    cloud: { style: 'call_me_sensei' },
    water: { style: 'call_me_sensei' },
    lighting: { style: 'call_me_sensei' },
    post: { style: 'call_me_sensei' },
  },
});

const json = serializeStyleBundle(bundle);
const parsed = parseStyleBundleDocument(json);
if (!parsed.ok) throw new Error(parsed.errors.join(' '));
const settings = resolveStyleBundleSettings(parsed.value);
```

The JSON can be committed with a project, saved in a `.toonlab` workspace,
generated by a coding agent, or loaded by any host application.

`fetchStyleBundle` is an optional transport for published or self-hosted
bundle documents. Hosted storage, public slugs, collaboration, and cloud
publishing may use a database, but the style model and local authoring workflow
do not.

The current bundle slots include:

- `toon`
- `environment`
- `manufacturedSurface`
- `treeShader`
- `grass`
- `grassShader`
- `flowerShader`
- `groundShader`
- `rock`
- `water`
- `sky`
- `cloud`
- `lighting`
- `post`

Version 1 documents may contain legacy `vegetationShader`, `tree`, `grass`, and
`flowers` asset selections. The parser migrates the aggregate vegetation style
and reports those asset selections separately. Version 2 reuses `grass` for
portable field response—clump parameters, wind response, and ground-color
adoption—not for asset identity or planting data.

Some slots select an IP-wide rendition style while preserving a system's
asset preset or runtime condition. For example:

- Changing water style must not silently turn a lake into an ocean.
- Changing vegetation style must not replace an oak with a palm tree.
- Changing weather style must not replace the current weather condition.
- Changing the character style must not replace a character or equipment
  asset.

## Current application behavior

The package does not guess scene classification. Once targets are explicitly
labeled, built-in adapters and the scene style runtime perform the routing:

```js
import {
  createSceneStyleRuntime,
  createStyleTarget,
} from '@call-me-sensei/toonlab/styles';

// Roots already carry accepted per-material contracts and stable scene labels.
const runtime = createSceneStyleRuntime({ renderer, scene, sky, water, post });
await runtime.apply(bundle, {
  mode: 'strict',
  targets: [
    createStyleTarget('hero', 'character', characterRoot),
    createStyleTarget('ground', 'terrain.ground', groundRoot),
    createStyleTarget('rocks', 'natural.rock', rockRoot),
    createStyleTarget('meadow', 'vegetation.grass', grassRoot),
  ],
});

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  sky?.update(delta);
  runtime.update(delta, camera);
  grassRoot.update(delta, camera);
  // Update the owning character runtime here if one is used.
  water?.update(delta, camera);
  if (post) post.render(delta);
  else renderer.render(scene, camera);
});
```

The runtime owns one stable lighting rig, sky-light probe, bundle sky/cloud/
water/post coordination, the ground-field pass requested by the grass slot,
and the shared scene-shadow pass. Call Me Sensei enables the appropriate
native shadow map where the renderer supports it, uses the package TSL shadow
pass for ToonLab materials, and keeps a calibrated outdoor shadow window
centered ahead of the active camera. Meshes still declare whether they cast or
receive; the focused ToonLab adapters enable those flags by default. The host
continues to own layout, classification, gameplay, and the frame loop.

This manual routing boundary is important:

```text
style bundle selects treatments
asset labels select destinations
scene state selects current conditions
```

### Required behavior when a slot is absent

When a bundle omits a slot, the host must choose and document one policy:

1. Retain the system's current authored settings.
2. Apply a named project default.
3. Disable the optional system.
4. Fail bundle validation because the project requires the slot.

Do not silently substitute an unrelated style. A project can define a
“complete production bundle” profile that requires all of its used domains.

### Required behavior when an asset is unknown

When a root has no domain assignment:

1. Do not infer from its current parent.
2. Do not apply the character shader to all meshes.
3. Do not apply the environment shader to all non-character meshes.
4. Produce an audit item containing the asset identity, scene path, material
   names, proposed domain if one can be inferred, and remediation.
5. Apply only an explicitly configured preview fallback.

## Target OSS routing layer

The next OSS application layer should:

- Read versioned domain labels and semantic material roles.
- Route character and equipment roots to the toon runtime.
- Route manufactured assets, vegetation, rocks, debris, and specialized
  systems independently.
- Apply one resolved style bundle across all populated slots.
- Preserve asset presets and runtime conditions.
- Report missing labels, unsupported materials, unused bundle slots, and
  custom-renderer exceptions.
- Return a machine-readable audit report.
- Operate entirely on local data, with no database dependency.

Conceptually, application follows this order:

```text
parse and validate bundle
  -> resolve each populated slot
  -> enumerate registered renderable roots
  -> read each root's explicit domain
  -> validate material roles and masks
  -> route to the owning runtime
  -> apply condition and scenario layers
  -> return audit and applied-state summary
```

The routing API should not guess silently. Its report must be suitable for a
developer, CI job, lab, or coding agent to inspect.

### Expected audit categories

At minimum, the router should distinguish:

- Missing root domain.
- Unknown domain value.
- Missing or unknown material role.
- Mixed atlas without a required ID mask.
- Unsupported transparent or custom material.
- Missing required bundle slot.
- Populated bundle slot with no consumer in the scene.
- Asset preset accidentally replaced by a style selection.
- Runtime condition accidentally serialized into the bundle.
- Successful explicit route.
- Deliberate, named custom-renderer exemption.

Warnings should identify the asset and material, explain the consequence, and
recommend a concrete fix.

### Public scene audit

`auditSceneStyleContract(scene, options)` implements this routing gate without
mutating the scene, renderer, materials, or bundle. It reads only versioned
`userData.toonlab` root labels and their material contracts; it does not infer
domains from names, colors, hierarchy, or geometry.

```js
import {
  auditSceneStyleContract,
  serializeSceneStyleAudit,
} from '@call-me-sensei/toonlab/styles';

const report = auditSceneStyleContract(scene, {
  bundle,
  mode: 'strict',
  renderer,
  systemDomains: ['sky', 'cloud', 'lighting', 'post', 'water'],
});

if (!report.readyToApply) {
  console.error(serializeSceneStyleAudit(report, { pretty: true }));
}
```

`systemDomains` explicitly accounts for package systems that are not scene
object roots, so a populated bundle slot with no consumer remains visible.
Strict mode blocks unsafe routes. Advisory mode keeps the same findings as
warnings for review, but `readyToApply` remains false. The versioned JSON
report includes the exact ToonLab package version, renderer backend, discovered
targets/materials, explicit routes, exemptions, consequences, and remediation.

## Call Me Sensei reference bundle

`call_me_sensei` is ToonLab's first-party reference style. Its goal is the best
coordinated result the project can produce across all supported rendering
domains. It is not merely a convenient default and it must not become the
lowest common denominator for arbitrary assets.

A complete Call Me Sensei bundle should:

- Select an intentionally authored treatment for every supported domain.
- Share a deliberate value structure, color logic, light direction, shadow
  language, edge treatment, texture-detail policy, atmosphere, and post stack.
- Let each domain use the shader architecture appropriate to its materials.
- Treat character equipment as part of the character presentation unless the
  asset is explicitly authored as a world prop.
- Preserve the identity of trees, rocks, debris, water, weather, and other
  asset or system presets.
- Define compatibility behavior without allowing that fallback to determine
  the reference look.
- Record unsupported or not-yet-refreshed domains honestly.

The bundle is successful when the scene reads as one art direction, not when
every domain has numerically identical parameters.

### Quality before breadth

The reference result must be tuned against contract-ready assets first. Clean
material separation and semantic masks give the shader enough information to
express the intended look. Only after that reference is established should
the compatibility path be tuned for incomplete third-party assets.

This avoids two failure modes:

1. Flattening every asset until difficult inputs no longer stand out, which
   also removes the best qualities of well-authored inputs.
2. Optimizing each shader lab in isolation, which can produce attractive
   characters, props, vegetation, and skies that do not belong in the same
   scene.

The compatibility path should degrade predictably:

```text
full semantic roles and masks
  -> clean conventional PBR mapping
  -> controlled texture simplification
  -> explicit custom-authoring requirement
```

It must never pretend that the last three levels are visually equivalent.

### Cross-domain art-direction contract

The Call Me Sensei bundle should explicitly define and review:

| Concern | Cross-domain expectation |
| --- | --- |
| Value grouping | Characters, equipment, props, foliage, rock, and effects remain readable in the same exposure |
| Direct light | Band count, transition character, and light direction feel related without forcing identical math |
| Shadow color | Domain shadows participate in one palette and do not collapse skin, foliage, or dark props |
| Specular response | Highlights share an authored graphic language while respecting skin, hair, metal, paint, leaf, rock, and water differences |
| Edges and outlines | Silhouette and internal-edge emphasis use compatible weights at gameplay camera distances |
| Texture detail | High-frequency realism is reduced deliberately and by material role, not with one global blur |
| Atmosphere | Fog, sky, weather, water, and distant vegetation agree on depth and color recession |
| Post | Grading, bloom, exposure, and anti-aliasing support the domain shaders rather than repairing them |
| Motion | Wind, water, particles, and animated highlights use compatible rhythm and amplitude |
| Quality tiers | Lower tiers preserve the art-direction hierarchy even when effects or samples are reduced |

These expectations should become explicit settings or documented validation
criteria where practical. A bundle must not depend on undocumented per-demo
overrides to achieve its reference appearance.

### Reference review matrix

The bundle should be reviewed in composed scenes, not only in isolated labs.
At minimum, keep:

- One hero character with skin, hair, clothing, a worn accessory, and a held
  weapon.
- One clean manufactured prop with separated semantic materials.
- One vehicle or large manufactured asset with glass and several finishes.
- One difficult distressed or mixed-atlas imported prop.
- Broadleaf, conifer, shrub/card foliage, grass, and flower examples.
- Generated and imported rocks plus a debris set.
- Water, sky, weather, VFX, lighting, and post active together.

Review that set under:

- Neutral daylight.
- Warm low-angle light.
- Night with local lights.
- Rain or wetness.
- A high-contrast combat/VFX moment.
- Near, gameplay, and distant camera ranges.
- Every supported quality tier.

The difficult imported prop exists to verify honest fallback and audit
behavior. It must not be the asset that defines the reference shader.

### Bundle completion gate

The Call Me Sensei bundle is release-ready only when:

- Every supported domain has a reviewed slot or an explicit unsupported
  declaration.
- Every populated slot resolves through an OSS public runtime.
- No required appearance depends on a lab-only shader fork or hidden demo
  override.
- Character equipment and accessories have verified routing and material
  roles.
- Vegetation, rock, debris, manufactured environment, and other older systems
  have been evaluated against the same art-direction contract.
- The labs expose every portable setting needed to reproduce the result.
- Local JSON round-trips without a database and produces the same resolved
  settings.
- Cross-domain screenshots pass the reference matrix.
- Performance budgets and reduced-quality behavior are recorded.
- Remaining asset-specific limitations appear in the audit rather than being
  hidden by a generic fallback.

Coding agents working on this bundle must optimize the canonical domain
implementation and its public settings. Merely assigning
`style: 'call_me_sensei'` to every slot does not satisfy this gate.

## Shader and lab refresh direction

Existing shader and lab implementations are at different generations. The
standardization work should follow these rules:

1. Maintain one canonical implementation per rendering domain.
2. Fold proven benchmark behavior into the canonical exported shader instead
   of accumulating generic shader forks.
3. Keep the explicit shader/style axis independent from vegetation, rock,
   debris, and other asset-generation presets.
4. Expose every portable public setting in the corresponding lab.
5. Mark camera controls, selected test assets, debug views, and other
   preview-only values as lab state rather than style settings.
6. Support local bundle import, edit, validation, resolution, and export in
   OSS labs without writing to a database.
7. Verify each domain against stable reference assets under multiple lighting
   and condition scenarios.
8. Keep bundle documents forward-migratable and versioned.

These rules define how user-authored bundles remain portable across Labs and
runtime use.

Rock is the reference implementation of the generator/shader split:
`@call-me-sensei/toonlab/rockgen` owns asset generation and baked asset
channels, while `@call-me-sensei/toonlab/rock-shader` owns the reusable
material profile. The `rock` bundle slot resolves the latter's complete
settings. It never resolves a boulder/cliff preset or rewrites a rock project.
Its Call Me Sensei starting profile is ToonLab's editable first-party rock
treatment, not a generic rock approximation. In Rock Shader Lab, the surrounding
ground, grass, tree, flowers, manufactured props, sky, clouds, and lighting
resolve from preview bundle assignments and may be overridden independently;
those comparison assignments are never serialized into the `rock` slot.

Vegetation follows the same separation at a family level:
`@call-me-sensei/toonlab/vegetation` owns tree, grass, and flower assets and
runtime objects, while `@call-me-sensei/toonlab/vegetation-shaders` exposes
the shared implementation plus independent Tree, Grass, and Flower profile
documents. New bundles populate `treeShader`, `grassShader`, `flowerShader`,
and the portable `grass` field-response slot. They do not serialize tree
recipes, grass planting data, or flower species. The former
`vegetationShader` aggregate is a compatibility input, not the canonical new
authoring surface.

The three shader slots resolve against the bundle's shared vegetation treatment;
the `grass` slot additionally owns meadow response and ground-color adoption.
OSS keeps the same resolution and document model in memory or local files
without requiring database persistence. Until explicit split overrides ship,
all three slots use the same shared Lighting, Thin Surface, and Weather
Response values.

### Canonical shader requirements

Each domain shader should provide:

- One exported, documented settings schema.
- Defaults, ranges, options, and portable/runtime classification for every
  public field.
- Versioned preset serialization and migration.
- Material-role mapping and explicit override behavior.
- A documented fallback for unsupported or incomplete assets.
- Deterministic teardown and restoration of source materials.
- A stable reference scene and assets for regression review.
- Tests that the lab and runtime use the same schema and defaults.

A high-quality example shader is evidence for improving the canonical
implementation. It should not remain a second generic production path once
its useful behavior has been understood.

### Lab requirements

Every shader or system lab should:

- Render controls from the public settings schema rather than a private field
  list.
- Expose every portable configuration field.
- Label controls as style, asset preset, runtime condition, scenario, quality,
  or preview-only state.
- Import and export the same versioned document used by the runtime.
- Show the effective resolved settings after bundle and scene-layer
  composition.
- Display asset-routing and material-label audit results.
- Include representative reference assets for both easy and difficult cases.
- Provide a **Preview assets** selector for every supported fixture type,
  including first-party reference, procedural, saved/project, and imported
  assets where applicable.
- Offer reset-to-schema-default and reset-to-selected-style actions.
- Never require a database for local authoring.

Labs may store browser convenience state, but that state must not leak into
portable style documents.

The selected preview asset is never the authored shader. Its identity,
geometry recipe, seed, palette, texture set, LOD, and placement remain
preview-only state. Switching fixtures must reapply the same effective shader
profile through the asset's explicit domain/material-role contract and report
unsupported fields for that fixture. The immutable reference fixture remains
available as a one-click fallback even after procedural or imported fixtures
are added.

### Reference-asset matrix

Review each domain with more than one favorable asset:

| Domain | Minimum comparison set |
| --- | --- |
| Character | Skin/hair/clothing character, hard-surface accessory, held weapon |
| Manufactured environment | Clean separated-material prop, vehicle, mixed-atlas distressed prop, interior surface |
| Vegetation | Broadleaf tree, conifer, shrub/card foliage, grass, flower |
| Rock and debris | Clean generated rock, scanned/textured rock, rubble/debris set |
| Water and sky | At least two presets under day, dusk, night, and adverse weather |
| VFX | Additive, alpha-blended, cutout, and opaque/decal-like effects |

The purpose of the difficult cases is not to force them all through one
algorithm. It is to prove that the support level and remediation are reported
correctly.

## Instructions for developers and coding agents

Before modifying a scene, a developer or coding agent must:

1. Read this document and the relevant domain shader documentation.
2. Inventory the scene's renderable roots.
3. Record one domain for every root.
4. Record one semantic role for every material.
5. Identify mixed atlases, baked lighting, transparency, custom shaders, and
   missing masks.
6. Select or create the local style bundle.
7. Apply each populated slot only through its owning runtime.
8. Preserve asset presets and current conditions.
9. Run the routing audit.
10. Report any fallback or custom exemption instead of hiding it.

Before shipping a generated asset, the agent must additionally run the
generator-label checklist in
[Generated asset labeling and shader routing](generated-asset-labeling.md).

When importing a new asset, an agent must report:

- The asset identity and source.
- The selected rendering domain and why.
- The material-role mapping.
- Any inferred labels that still require review.
- Any mixed-material areas that require splits or masks.
- The selected support level.
- The reference scene or lab used to verify the result.

When updating a shader or lab, an agent must report:

- Which canonical domain implementation changed.
- Which public schema fields were added, removed, renamed, or migrated.
- Whether every portable field is exposed by the lab.
- Whether asset preset, style, condition, scenario, and preview state remain
  separate.
- Which reference assets and scenarios were verified.
- Whether the change altered routing or fallback behavior.

### Definition of done for a consistently styled scene

A scene is not done merely because all meshes render. It is done when:

- A local or fetched bundle validates.
- Every renderable root has an explicit domain or named custom exemption.
- Every material has an explicit semantic role.
- Required material splits and masks exist.
- Every populated bundle slot has an owning runtime and an applied result.
- Asset identity and runtime conditions remain unchanged by style selection.
- The audit has no unexpected warnings or silent fallbacks.
- The reference lighting, weather, and post stack have been reviewed.
- Difficult imported assets have an honest support level and remediation
  record.

Bundle-oriented skills and prompts should enforce this order. They must never
apply a bundle first and leave unlabeled assets to hidden heuristics.

For the complementary content acquisition, procedural base-set, licensing, and
scene-kit coverage contract, see
[Open asset library and scene coverage](open-asset-library.md).
