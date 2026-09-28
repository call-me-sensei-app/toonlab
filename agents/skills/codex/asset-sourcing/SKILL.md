---
name: asset-sourcing
description: Help agents source anime-game-ready models, textures, and presets through policy-aware ToonLab MCP discovery, provenance, supported shaders, and explicit custom-gap reporting.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Asset Sourcing

Use this skill when a developer needs an asset — a model, texture, HDRI,
prop, tree, rock, building, material, or a saved look/behavior preset.

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/mcp-asset-discovery.md`
- `agents/references/asset-sourcing-policy.md`
- `agents/references/custom-gap-report.md`

**The boundary:** ToonLab targets anime-style games and environments. The npm package is the worker for approved procedural
families, style presets, and texture baking. The gallery is optional. Route
through MCP only where it adds something beyond the package: external
discovery, curation/moderation policy, download provenance, shared workspace
state, or explicitly requested managed generation. Do not use MCP tools as a
proxy for package functions. ToonLab Pro may author and review stylized base
sets; their approved documents, recipes, labels, seeds, and provenance must
remain portable so OSS runtimes can use them without a database.

## Select the connected MCP surface

Feature-detect tools before making a call. ToonLab OSS local MCP is identified
by `get_workspace_info`, `search_cc0_assets`, `get_cc0_asset`, and
`import_cc0_asset`. ToonLab Pro remote MCP is identified by
`get_runtime_guide`, `search_public_gallery`, and `get_toonlab_asset`. Either
surface is sufficient and both may be connected. Shared names such as
`search_assets`, `get_asset`, `list_my_creations`,
`validate_asset_candidate`, and `record_asset_gap` have surface-specific
schemas; qualify them by MCP server when both are present and use the schema
advertised by that server. Read `agents/references/mcp-asset-discovery.md` for
the exact OSS and Pro sequences.

## Decision order

Choose the first route that is both available and accepted for the requested
scene-kit role.

1. **Load policy and ask when missing.** Call the available server's
   `get_anime_game_profile`, load
   the selected bundle, and locate the project's sourcing policy. If no policy
   exists, ask the developer; until answered, use library-first advisory mode
   and report the unresolved decision. Validate every candidate before use.
2. **Reuse what exists.** In OSS, earlier imports, saved presets, and exports
   live in `.toonlab/`; call local `list_my_creations` and `search_assets` with
   `source: 'workspace'`, `'workspace-storage'`, `'library'`, or `'builtin'`.
   If those do not close the role, use local `search_public_gallery` and follow
   `nextOffset` until null; use `type: 'tree-recipe'` for authored trees and
   retrieve a finalist with `get_public_gallery_asset`. Use local
   `search_assets({ source: 'official' })` only for the installed released
   catalog.
   In Pro, call cloud `list_my_creations`, then `search_public_gallery`; use
   `source: 'toonlab'` plus the appropriate catalog for first-party assets and
   follow `nextOffset`. For rocks on either surface, shortlist from positive
   `dimensionsMeters` width/height/depth plus family/profile, scale class,
   category/subcategory, geology, and surface; never render a GLB merely to
   discover its size. Call `get_asset` (OSS) or `get_toonlab_asset` (Pro) only
   for finalists that need full recipe, lineage, and file metadata. When both are connected,
   search the local project/library before the Pro cloud library and gallery.
   Never regenerate or re-download something already available.
3. **Use an approved procedural family only when policy permits it.** Discover
   approved families through MCP, then use their focused runtime such as
   `@call-me-sensei/toonlab/vegetation`, `rockgen` or `texgen`.
   This is the direct route only when the requested family has an approved,
   versioned stylized base set and passes the policy/review gate described in
   `agents/references/asset-sourcing-policy.md`. Preserve base-set version, generator version,
   recipe, seed, domain/material labels, and golden-seed verification. Do not
   treat every legacy catalog entry as approved merely because it can spawn.
4. **Search curated open sources when policy permits and generation is not
   approved or is not the best fit.** In OSS, use
   `search_cc0_assets({ query, kind, provider })`, `get_cc0_asset`, then
   `import_cc0_asset` to download selected files into `.toonlab/imports/` with
   a provenance manifest. In Pro, use Pro `search_assets` and `get_asset`;
   Pro does not expose `search_cc0_assets` or `import_cc0_asset`. This route
   stays on MCP because it carries the network fetch, the owner curation
   policy, and licensing provenance —
   selection is by name/tags only, so always preview imports in-scene before
   committing to them. Prefer CC0. Accept CC-BY only through a source path that
   exposes the exact creator, asset URL, license/version/URL, provider credit,
   and modification notice; do not assume a tool named `search_cc0_assets`
   returns CC-BY.
5. **Use managed generation for a named remaining gap through the connected surface.**
   First record why accepted
   assets, approved procedural families, and curated open candidates were
   inadequate. Check generation capabilities and rights for the input image.
   Treat output as a candidate that still needs topology, UV, texture, scale,
   collision, LOD, semantic-label, and Call Me Sensei review. OSS keeps
   `generate_asset` for deterministic recipes and exposes provider-backed work
   separately as `generate_ai_asset` when local keys are configured. Pro uses
   credit-spending `generate_asset` with hosted workers. Both surfaces expose
   generation capability, polling, and save tools; follow the advertised schema.
6. **Author stable visual profiles in code.** Post profiles can be generated
   deterministically through `@call-me-sensei/toonlab/post`; other stable
   shader profiles resolve through the selected style bundle. Lighting is a supported public runtime and bundle slot. VFX, camera and
   game-feel implementations remain host-owned; do not invent package APIs.

Persist anything worth keeping with `save_creation` (or write the JSON into
the repo); `.toonlab/creations/` is the shared surface labs and later
sessions read. Every reusable saved object must include up to ten concise
lowercase slug tags. Cover its semantic role, material or asset family,
location or biome when relevant, project, and lifecycle state; never save an
object with only a filename or generic `asset` tag. Follow `nextOffset` until
null when checking for an existing saved object before creating a duplicate.

For every completed asset request, update or report the scene family, kit
role, selected route, license/provenance, rendering domain, material roles,
support level, collision/LOD status, Call Me Sensei verification, and coverage
gap that was closed. State explicitly when gallery search was skipped because
an approved generator owned the role.

## Manufactured environment material contract

For generated or imported props, vehicles, buildings, furniture, and interior
assets, classify each material once with glTF extras / Three.js
`userData.urbanMaterial`. Author the versioned object with these axes:

- `baseMaterial`: `metal`, `mineral`, `wood`, `polymer`, `rubber`, `glass`,
  `ceramic`, `textile`, `leather`, `paper`, `composite`, `fluid`, or
  `genericDielectric`.
- `finish`: `raw`, `painted`, `varnished`, `clearCoated`, `polished`,
  `brushed`, `glazed`, `anodized`, `mirror`, or `matte`.
- `renderMode`: `opaque`, `alphaCutout`, `translucent`, `transmissive`, or
  `unlit`.
- `structuralRole`: `primaryMass`, `secondaryStructure`, `trim`, `fastener`,
  `cavity`, `window`, `graphic`, or `lightEmitter`.
- `contentFlags`: any of `graphic`, `display`, and `emissive`.

Preserve source color and every available PBR map. Classification supplies
stable meaning and fallback priors; it never replaces albedo, roughness,
metalness, normal, AO, emissive, clearcoat, transmission, opacity, or UV data.

- Put classification on the material when a mesh has multiple materials. A
  node classification is a default for every material below it.
- Split materials or provide a material-ID mask when one atlas spans
  incompatible classes such as masonry, wood, metal, and window glass.
- Keep wear, dirt, rust, chipped coating, wetness, burn, snow, and similar
  conditions in continuous masks rather than inventing material classes.
- Never encode pastel amount, palette overrides, cel thresholds, reflection
  strength, or time-of-day values in the model.
- Never reclassify a model to suit a shader. Custom shaders consume the stable
  axes and define global settings plus sparse per-axis profiles.
- Accept the old `urbanSurface` IDs only through the documented compatibility
  map; do not author `lid`, `roof`, or `trim` as physical material classes.
- Reload the exported GLB and inspect classifications, fallback warnings, and
  mixed-atlas boundaries before judging only a beauty render.
- Run `analyzeManufacturedAsset(root)` as the code-first audit. Names, PBR
  slots, alpha/transmission, emission, and metalness can cover clean assets;
  never guess material identity from RGB alone. Use visual analysis only as
  offline assistance for mixed/anonymous atlases and approve its proposal into
  a material split, ID mask, or explicit assignment.
- Use `proposeManufacturedStyleTargetLabel(root)` to turn safe classifications
  into stable material IDs and a versioned `manufactured.surface` label.
  Generic fallback, low-confidence, and shared-role-conflict issues block the
  proposal. Supply reviewed `materialOverrides`, then call
  `applyManufacturedStyleTargetLabelProposal(root, proposal)`. Report automatic
  and assisted results separately; an explicit repair is not an automatic hit.
- For FBX, OBJ/MTL, USDZ, VRM, PMX/PMD, third-party GLB, and other sources
  that cannot safely carry custom properties, write a versioned
  `*.toonlab-materials.json` sidecar and apply it after loading. The runtime
  classification layer never edits geometry, UVs, or texture pixels.
- Review and temporarily switch tags in the Manufactured Material Lab; export
  its sidecar to make the result durable.

## Sample and compare (vision-capable agents)

For surfaces that dominate the look (terrain, floors, walls, hero props),
don't take the first hit — produce 2–3 candidates across routes and look at
them before choosing:

- **Generated**: texgen is part of the npm package, not an MCP tool — bake
  candidates headlessly with a short node script:
  `evaluateTextureMaps(createTextureSettings(findTexturePreset(id).settings),
  { size: 256 })` (async, ~50 ms) returns raw RGBA maps; encode the albedo
  to PNG and write it next to the imports.
- **Discovered in OSS**: when the connected surface exposes
  `import_cc0_asset`, it leaves real image files in `.toonlab/imports/`.
  ToonLab Pro instead returns approved immutable download URLs and provenance;
  do not prescribe the OSS import tool on that surface.

View the swatches side by side, judge fit against the game's stylized look,
then confirm the winner in-scene (toon shading changes how a texture reads).
If you cannot view images, fall back to the routing heuristics and rely on
the in-scene verify step. This costs extra tokens — reserve it for hero
surfaces and take the first good match for incidental materials.

## Which source for which asset

Stable routing (the source list itself grows — treat the registry, not this
table, as the source of truth):

- Seamless PBR material sets (brick, wood, ground …) → ambientCG.
- Photoscanned props, HDRIs, high-end texture sets → Poly Haven.
- Authored stylized/toon-ready models and vegetation → the public Gallery
  first; retrieve their portable document and provenance through MCP. Use a
  built-in procedural family only when it passed the base-set reliability gate
  and the task calls for new generation rather than an existing asset.
- Stylized *seamless textures* → `@call-me-sensei/toonlab/texgen` in code
  (60+ presets); the catalog has no texture entries, so this route is a
  package import, not an MCP call.
- Audio, fonts, adjacent media → not automated; link the developer to the
  source and import the downloaded file.

Sources carry their own metadata (`kinds`, `goodFor`, `qualityTier`,
`enabled`) in the registry (`src/assetlib/sources.js`, surfaced through the
asset tools). New sources appear over time; query rather than assume.

## Loading first-party catalog models

Some first-party catalog GLBs declare `KHR_texture_basisu` in
**`extensionsRequired`**, so a KTX2 transcoder is mandatory for those assets.
Supply `decoderBasePath` and `renderer`, and stage the Basis and Draco decoder
files where that path resolves.

**Share one transcoder set across the whole catalog.** A transcoder is expensive
and is not automatically pooled. Use the public loader contract:

```js
import {
  createModelAssetTranscoders,
  loadModelAsset,
} from '@call-me-sensei/toonlab/loaders';

const transcoders = createModelAssetTranscoders({ decoderBasePath, renderer });
const asset = await loadModelAsset(url, { transcoders });
// Reuse transcoders for every model, then dispose once after loading finishes.
transcoders.dispose();
```

Constructing decoder resources per asset can spin up a WASM instance per asset,
and a catalog-scale scene can fail with

```
RuntimeError: Aborted(RangeError: WebAssembly.instantiate():
Out of memory: Cannot allocate Wasm memory for new instance)
```

long before it finishes loading. Cache each parsed asset/geometry by immutable
asset URL as well, so a repeated id is one decode and upload rather than two.

Note also that a catalog rock's `material-config.json` may name textures with
paths that do not resolve from the delivery origin. Do not block on them: the
rock shader's own projection is the safe fallback. Call Me Sensei normally
blends clean UV-authored albedo/normal/ORM detail and reports retained texture
lineage; use `assetIntegration.sourceAlbedoMode: 'replace'` only when an import
audit proves those source maps unusable.

## Licensing and curation rules

- Enabled sources are owner-curated to the project quality bar; disabled
  ones are pending review. Do not bypass the tools with ad-hoc downloads
  from other sites — moderation and provenance exist for a reason.
- CC0 clears copyright, not trademarks, logos, or personality rights
  visible in scans. If an asset shows a brand or a person, flag it instead
  of importing.
- Every imported ref keeps `source` + attribution provenance. Preserve it;
  some sources (e.g. Poly Haven's API terms) want credit even though the
  assets are CC0. Surface attribution in the app's credits.
- CC-BY additionally requires appropriate creator credit, the license link,
  the source link when supplied, and an indication of modifications. Preserve
  those fields through conversions, bundles, scenes, and exports.

## Verify

- For every selected first-party rock, record the catalog ID and original
  `dimensionsMeters`; after authored scaling, record the resulting scene size.
  Reject missing, zero, negative, or axis-ambiguous dimensions before download.
- Preview imported GLBs/textures in the consumer app's actual scene and
  toon/environment shading — reference-realistic assets can clash with a
  stylized look.
- For procedural assets, pin the `seed` and confirm the app regenerates the
  identical asset.
