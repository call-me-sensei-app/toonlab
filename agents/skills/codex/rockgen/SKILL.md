---
name: rockgen
description: Create or edit ToonLab procedural rocks and portable rock recipes, including deterministic realistic surface maps, semantic masks, LOD, collision and export.
---

# Procedural rocks and realistic surfaces

Use public `@call-me-sensei/toonlab/rockgen` for geometry and deterministic
surface data, and `@call-me-sensei/toonlab/rock-shader` for reusable appearance.
References beginning `agents/` resolve from the installed package root, even
when this skill is copied. Read `agents/references/runtime-entry-points.md` and
`rock-ground-shaders` for material application and shared shadow integration.

## Geometry and sourcing

Use the project's accepted sourcing policy. Strict anime sourcing admits
library/gallery rocks; a newly generated procedural rock needs an explicitly
permitted workflow. An explicit rock-authoring request is not a request for a
complete terrain or automatic world builder. Keep the host's layout and game
logic separate from the asset recipe.

Use a fixed seed and stable asset ID. Preserve the geometry recipe, transforms,
units, surface specification, LODs, collision and provenance in the host asset
pipeline. Use MCP `get_lab_features` for the current portable document contract
before `create_lab_document`; read the result's `document` field. Save to the
Library when persistence is requested. Do not import Labs, repository compilers
or fixture data into the consumer app.

## Realistic material support

The npm generator supports realistic rock surfaces without generative AI
credits. Use `NATURAL_ROCK_SURFACE_PROFILES` to discover IDs and display labels,
`createNaturalRockMapData` to produce deterministic channel data, and
`createNaturalRockSurfaceSpecification` to persist its reproducible recipe.
Display “Nature Reference Rocks” or the profile label, never internal production
names. Do not replace a requested realistic finish with a stylized one.

`result.maps` contains RGBA byte arrays for `baseColor`, `normalGL`, `roughness`,
`ao`, `orm`, `smoothness` and `heightMicro`. The host constructs textures and
assigns the projection: Base Color is sRGB, other maps are linear data. ORM is
AO/roughness/metallic in R/G/B; metallic is zero. Preserve source UV mapping
when applying baked maps. A shader profile alone does not load or bind maps.

Homogeneous profiles need an explicit profile and seed. Mixed-material profiles
also require authored semantic masks bound to the current geometry SHA-256.
Persist the specification's encoded masks and hashes unchanged. Do not fabricate
regions or discard masks on save, clone or MCP edits. Topology/UV changes need
new bindings. Use 64–4096 maps for previews; production surface specifications
require 1024–4096. Budget memory for all channels before choosing resolution.

Micro-height describes material detail, not a signed high-to-low geometry bake.
Geometry edits can invalidate LOD, collision, projection and bake provenance;
regenerate affected outputs before declaring the variation ready.

## Verify the asset

Regenerate with the same recipe and compare shape/map hashes; save and reopen
when persistence is part of the task. Inspect the requested finish, seams,
silhouette, near/far transitions and shadows at relevant views. Check physical
scale and collision by moving against the object. Use targeted runtime tests
and rendered evidence; metadata alone is insufficient.
