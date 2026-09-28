# ToonLab 0.5.0 release notes

0.5.0 rebuilds character toon shading around the look of modern anime games
(Genshin Impact, Honkai: Star Rail). The toon settings schema is new, so code
that passes toon settings needs a small update; every other public API is
unchanged.

What changed in character shading:

- **Shadow tones per surface.** The lit side keeps the texture colour; the
  shadow side is the texture multiplied by a tone chosen per surface (cool
  lavender-grey for cloth and hair, warm peach for skin), with a narrow warmer
  band at the terminator.
- **Face maps baked automatically** from each face, plus a painted nose
  shadow, eye-white shade under the lids and a stocking streak derived from
  the model (each skipped when the model's texture already draws it).
- **Environment light**: the sun keeps its hue, the sky light counts as
  ambient, and characters in cast shade take the sky's colour.
- **Shadows**: scenery, the character's own shadow map, and a screen-space
  hair-on-face shadow; a depth rim with an optional silhouette line; ink
  outlines coloured from the surface under them.

Migrating toon settings (`applyToonShader(root, { ... })`,
`createToonSettings({ ... })`): the settings now live in 14 groups —
`light`, `shading`, `ramp`, `face`, `shadows`, `rim`, `highlights`,
`outline`, `maps`, plus the unchanged `baseTexture`, `alpha`, `autoRoles`,
`sticker` and `fur`. `preset`, `shaderMode` and `outline: { enabled }` work as
before. Common mappings:

| 0.4 | 0.5 |
|---|---|
| `outline: { defaultWidth }` / `hairWidth` / `faceWidth` | `outline: { width: { cloth, hair, face, … } }` |
| `rimLight: { defaultIntensity, hairIntensity, defaultTintColor }` | `rim: { intensity: { cloth, hair, … }, tint }` |
| `sceneShadow: { strength }` | `shadows: { scene: { strength } }` |
| `celShade` | `shading` |
| `shadowColor`, `skinTone` | `ramp` (`tone`, `band`) |
| `faceLighting` | `face` |
| `specular`, `hairHighlight`, `eyeHighlight` | `highlights` |
| `materialMaps` | `maps` |
| `lighting` | `light` |

Glitter, face perspective correction, averaged per-character shadow and the
additive legacy lighting model were removed. Unknown groups are ignored and
reported (`retired-settings-group`). Preset documents are schema version 2;
version-1 documents are rejected with an explanatory error.

See [toon shading](toon-shading.md) and the
[settings reference](settings-reference.md).

# Previous release: 0.4.24

This patch updates npm's repository and issue links to
[call-me-sensei-app/toonlab](https://github.com/call-me-sensei-app/toonlab) and
refreshes the OSS starter Gallery. Existing public runtime APIs remain compatible.

- Setup and update install 8,464 published, OSS-eligible assets, including the
  latest 580 rock records and 201 CC0 community tree recipes.
- Gallery supports tree-recipe filtering, live previews, JSON downloads, and
  opening recipes in Tree Lab.
- Catalog updates reuse verified immutable files without changing their
  checksums, license, or delivery scope. Repeated setup is a no-op and
  preserves personal Library data.
- MCP keeps generated asset-gap reports inside its local workspace.
- Release checks exercise the current Rock Lab save lifecycle and validate
  repository contents independently of the npm package boundary.
- The `toonlab` alias targets this same release and links to the new repository.

The npm package includes catalog metadata and setup tooling; models, images,
and other media remain external downloads. See
[local setup and catalog updates](local-database-and-public-assets.md).

# Previous release: 0.4.23

This release updates water dynamics, shoreline foam, cloud rendering, and portable
Rock Lab editing. It also makes the realistic Nature Reference Rock material
generator available through the public `@call-me-sensei/toonlab/rockgen` entry.

- Generate deterministic Base Color, OpenGL Normal, Roughness, AO, packed ORM,
  Smoothness, and micro-height maps with `createNaturalRockMapData`.
- Discover lithology profiles with `NATURAL_ROCK_SURFACE_PROFILES`, resolve
  metre-based projection with `resolveNaturalRockProjection`, and retain a
  geometry-bound recipe with `createNaturalRockSurfaceSpecification`.
- Preserve realistic recipes through MCP creation and editing; save composite
  masks with their geometry bindings and replay them through authored UV0.
- Track the full surface implementation dependency graph in production provenance.
- Existing saved rock material recipes retain their schema and byte output.
  Composite materials still require authored semantic regions. Texture relief
  does not replace a geometry bake, and edited rocks still need rebuilt LODs.
- Improve water dynamics, spectral detail, foam, shore interaction, and
  underwater rendering; refine cloud noise caching and reprojection.
- Preserve sculpt and drill operation order in portable Rock Lab documents.
- Refresh the `toonlab` alias to match all public runtime entry points.
- Keep editor-only mesh processing dependencies out of the public install.
- Refresh Codex, Claude Code and Cursor guidance for new games and integration;
  ship the public lighting skill and a verified playable blockout example.
- Correct MCP launch commands and runtime examples; generate current Sky
  parameter tables from source and keep hosted prompts/reference text in sync.

Consumers using optional vertex ambient occlusion should install
`three-mesh-bvh@0.9.14`; its peer requirement changed from `^0.8.3`. Three.js
remains `^0.185.1`. No Lab UI or texture binaries are bundled in npm.

See [Realistic rock surfaces](natural-rock-surfaces.md) and the
[capability contract](capability-status.md) for supported integration boundaries.

# Previous release: 0.4.22

This release publishes an explicit capability and limitation contract for
developers using ToonLab with or without a coding agent. It records the
supported first-pass Call Me Sensei workflow, the host-owned scene-authoring
boundary, strict fail-closed behavior, measured imported-asset readiness, and
the required verification sequence. See [What ToonLab 0.4.22 can and cannot
do](capability-status.md).

This release exposes fifteen user-facing Labs, matching OSS and Pro editor
navigation, portable creation types, MCP feature descriptions, and focused npm
runtime entry points.

Highlights include:

- first-class npm support for the 100-item **Nature Reference Rocks by
  ToonLab** release: the official catalog accepts both legacy `rock-0001`
  identities and `rock-c8-*` identities, validates the editable gallery recipe,
  and exposes immutable realistic, control, retained-high, LOD0–LOD4,
  collision, material, preview, and nature-provenance artifacts;
- package-owned loading of each Nature Reference Rock's reviewed `material-config.json`, with
  its exact geology maps and asset-specific Call Me Sensei settings applied by
  the one-call official-catalog placement path; the raw acquired GLB remains
  the realistic PBR model;
- an explicit Rock Lab/editor descriptor retaining one-metre units, the
  editable control source, deterministic variation/sculpt/reprojection flags,
  rebake requirements, LOD/collision rebuild requirements, and discardable
  derivative URLs without bundling the media in npm;

- a repository-only hoodoo semantic-annotation experiment that remains outside
  the npm export map and CLI while the browser-safe rock shader keeps its
  general semantic-binding validation; no rock media or one-asset compiler is
  added to the npm package;

- bring-your-own-key OSS generation through local MCP and the Generate page,
  including Meshy 7 image/multi-image-to-3D, selected-image-model concept-to-
  Meshy text workflows, Tripo direct model generation/segmentation, durable
  local polling, and explicit saving into the Library;
- Gallery-style private Library discovery by name, description, type, and
  durable normalized tags across browser UI, local/hosted persistence, and
  OSS/Pro MCP, including tag-aware save and edit flows. Version 0.4.21 makes
  the slug grammar canonical across every save, edit, and exact-tag query,
  migrates existing tags, supports empty-tag clearing, provides complete
  paginated Pro results and uncapped tag facets, and directly instructs coding
  agents to save useful semantic tags;
- a checksum-pinned reconciliation path for the one known pre-release August
  catalog snapshot, allowing early local development databases to update to
  the immutable 480-asset release while every unknown seed mutation still
  fails closed;
- automatic reversible collision discovery for labeled static solids, trunk-
  scoped generated-tree blockers, walkable-character auto-binding, strict
  readiness diagnostics, and lightweight plus Rapier adapter paths;
- one authoritative sun/cloud receiver response across ground, grass, trees,
  flowers, characters, rocks, manufactured props, water, shoreline foam, and
  breaker foam, with direct-sun glints suppressed in shadow;
- visible Sky System clouds publishing their baked volumetric transmittance to
  the same receiver field instead of unrelated per-material procedural noise;
- deterministic generated-tree bark selection that preserves authored maps,
  otherwise applies the registered Call Me Sensei fissured-bark fallback, plus
  exact all-tree caster/receiver coverage gates;
- a corrected tree-asset boundary: npm exports tree construction and shader
  capability but no predefined tree recipes, while the packaged MCP searches
  and retrieves reviewed public Gallery tree recipes with their license,
  attribution, and immutable document;
- consistent Lab home/editor navigation and Help → Documentation access;
- the built-in Call Me Sensei Style Bundle;
- a 480-template Stylized rock catalog whose GLBs are editable starting meshes;
- separate procedural Rock generation with and without a physical template;
- independent rock surface, top finish, texture, weathering, composition, and
  preview-grass controls;
- portable Lab documents and expanded MCP inspection/mutation support;
- current documentation for all fifteen live Labs.

See [The 15 live ToonLab Labs](live-labs.md) for the public product boundary.
