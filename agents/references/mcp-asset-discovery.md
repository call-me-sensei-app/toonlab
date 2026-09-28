# MCP Asset Discovery

Use MCP for discovery, provenance, shared workspace state, and policy-aware
imports. Use runtime package APIs for shader application and deterministic
runtime construction.

## Detect the available ToonLab surface

Inspect the connected server's tool names before calling anything. Do not
assume the developer has ToonLab Pro, and do not assume a local OSS checkout.

- **ToonLab OSS local MCP** exposes `get_workspace_info`,
  `search_public_gallery`, `get_public_gallery_asset`, `search_cc0_assets`,
  `get_cc0_asset`, and `import_cc0_asset`. Its `search_assets` searches
  approved built-in generator/settings entries, the local released official
  catalog, and the disk-backed project/library/workspace. Authored assets such
  as reviewed tree recipes are searched through `search_public_gallery` rather
  than copied into npm.
- **ToonLab Pro remote MCP** exposes `get_runtime_guide`,
  `search_public_gallery`, and `get_toonlab_asset`. Its `search_assets`
  searches indexed external open assets; first-party rocks/trees and community
  work are searched through `search_public_gallery`.
- **Both connected** is valid. Qualify calls by MCP server name because common
  names such as `search_assets`, `get_asset`, `list_my_creations`, and
  `validate_asset_candidate` have surface-specific schemas. Search the local
  project/library first, then the Pro gallery and cloud library.

The absence of a surface-specific tool is not an asset failure. Continue with
the surface the developer actually has and report which surface was used.

## Shared start

1. Call the available server's `get_anime_game_profile` and load the selected
   style bundle.
2. Locate the project's asset-sourcing policy. If it is absent, ask the
   developer. Until answered, continue library-first in advisory mode and
   record that the decision is unresolved.
3. Reuse accepted project/library content before public or generated content.

## ToonLab OSS local sequence

1. Call `list_my_creations` with the task's text and exact tag filters, then
   `search_assets` with `source: 'library'`,
   `'workspace'`, `'workspace-storage'`, or `'builtin'` as appropriate. If no
   accepted local entry closes the role, call `search_public_gallery` for
   authored public assets and follow `nextOffset` until null. Use
   `type: 'tree-recipe'` for reviewed trees. Use `search_assets` with
   `source: 'official'` only for the installed released catalog.
2. Call local `get_public_gallery_asset` for a selected Gallery document or
   `get_asset` for a local/released-catalog record.
3. When policy permits external CC0, call `search_cc0_assets`, then
   `get_cc0_asset`; call `import_cc0_asset` only after selection to download
   bytes plus their provenance manifest into `.toonlab/imports/`.
4. Validate with local schema:
   `validate_asset_candidate({ policy, candidate: { domain, sourceClass } })`.
5. Local `generate_asset` creates deterministic procedural recipes. With local
   provider keys configured, `generate_ai_asset` exposes image generation,
   Meshy 7 image/multiview-to-3D, and Text → selected image model → Meshy 7.
   Call `get_generation_capabilities` first, then poll with
   `get_generation_job(s)` and persist a succeeded model with
   `save_generated_asset`. This uses the developer's keys and no ToonLab credits.

## ToonLab Pro remote sequence

1. Call Pro `list_my_creations` with `query`, `tags`, and/or `types` for the
   signed-in cloud library, following `nextOffset` until null.
2. Call `search_public_gallery` with its unified default. For first-party
   rocks/trees, use `source: 'toonlab'`, `catalog: 'rock' | 'tree'`, and keep
   following `nextOffset`.
3. Use Pro `search_assets` only for indexed external open assets, followed by
   Pro `get_asset`. Pro has no `search_cc0_assets` or `import_cc0_asset`; the
   selected download URL and provenance are returned by `get_asset`.
4. Validate with Pro schema:
   `validate_asset_candidate({ stable_id, source_class, asset_kind, domain,
   license, provenance, policy })`.
5. Managed generation requires an approved policy, exhausted discovery,
   `record_asset_gap`, and `get_generation_capabilities` before any
   consequential credit-spending call.

Follow `nextOffset` until null on both OSS and Pro catalog searches; never
interpret one response page as the complete candidate set.

## Common completion rules

- Treat a saved Library object as a reusable asset, not an invisible draft.
  When saving, assign up to ten stable lowercase slug tags covering semantic
  role, material/asset family, location or biome, project, and lifecycle state.
  Do not stuff prose into tags, and do not rely on a filename as the only
  discovery key.

- For first-party rocks on either surface, shortlist from search metadata
  before loading binaries. Require positive `dimensionsMeters.width`,
  `.height`, and `.depth`, then compare family/profile, scale class, category,
  subcategory, geology, and surface. Call `get_asset` (OSS) or
  `get_toonlab_asset` (Pro) only for finalists that need the full recipe,
  lineage, and immutable file list. Never render a GLB merely to discover its
  catalog size.
- Inspect provenance, license, semantic suitability, `animeStyleSupport`, and
  the policy decision before selection. A strict denial means the candidate
  must not be selected, imported, or generated.
- Search results may show denied candidates so the user can see what was
  considered; visibility is not approval.
- Use generation only when the policy permits it and discovery did not close
  the named gap.
- Record a custom integration note before introducing custom models, textures, shaders, or
  adapters. The OSS and Pro `record_asset_gap` argument names differ, so use
  the schema advertised by the connected server.
