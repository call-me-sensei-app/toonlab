# ToonLab — guide for AI coding agents

You are helping a developer use `@call-me-sensei/toonlab` 0.4.24, a
WebGPU-first Three.js toolkit for anime-style characters and environments.
Treat one world unit as one meter.

## Source of truth

Before proposing an import or a scene-construction plan, read:

- `docs/capability-status.md` for the current recommended-versus-experimental
  product boundary;
- `agents/references/runtime-entry-points.md` for the stable 0.4.24 package
  boundary;
- `agents/skills/codex/game-dev/SKILL.md` for new games and existing-scene integration;
- `agents/skills/codex/outdoor-world/SKILL.md` only for explicitly requested
  outdoor experiments and QA;
- `agents/skills/codex/asset-sourcing/SKILL.md` for OSS/Pro MCP routing;
- `docs/styles-and-bundles.md` for treatment routing.
- `docs/rock-lod-production-policy.md` for every generated or imported rock LOD ladder.

The recommended workflow starts from a host-constructed scene. The host creates
the renderer, authored XZ layout, geometry, cameras, controls, dynamic physics,
navigation, storage, and frame loop. For a heightfield scene, use
`createSceneSurfaceRuntime()` so terrain-bound Y placement, meadow scatter,
shoreline water wiring, and composition readiness are package-owned rather
than independently reimplemented. `createCharacterRuntime()` owns reusable character
loading, rig resolution, locomotion fallback, toon conversion, updates, and
disposal; the host maps its actions to input and physics. ToonLab styles labeled
targets, and `createSceneStyleRuntime()` can install the selected bundle's
coordinated lighting, sky probe, ground field, sky/cloud/water, and post
defaults. It also discovers labeled static solids and creates reversible
collision by default; `createWalkableCharacterRuntime()` consumes that bound
service automatically. Always call `styleRuntime.collision.assertReady()` and
report unresolved targets. Do not hand-wire blocker lists around a missing
label. Use explicit collision metadata when bounds are inappropriate. ToonLab
does not create dynamic physics or navigation and does not reliably turn a
one-shot prompt into a polished world.

Do not advertise repository-only modules as npm APIs. In 0.4.24, camera
behavior, game-feel behavior, gameplay VFX, path/village/prop/building assembly,
and world layout remain host-owned or pre-release experiments even when source
or a lab exists in this checkout.

## Public package areas and maturity

Use only the exports in `package.json`. The recommended production areas are:

- `./toon`, `./toon-settings`, `./character`
- `./environment`, `./ground-shader`, `./rock-shader`
- `./vegetation`, `./vegetation-shaders`, `./grass`, `./grass-palettes`
- `./water`, `./water-settings` for a host-authored footprint, shore, and bed
- `./sky`, `./cloud`
- `./lighting`
- `./post`, `./post-processing`
- `./rockgen`, `./texgen`, `./assetlib`
- `./styles`, `./asset-policy`, `./loaders`

Weather, climate, terrain/world helpers, ambient effects, fauna, and
gameplay VFX may appear in repository examples but are not public package entry
points. The host still owns scene classification, gameplay, and composition;
the public style runtime owns bundle application once targets are labeled.

The package verifier is authoritative. If documentation and exports disagree,
fix the documentation or deliberately add and qualify an export; never work
around the mismatch with a deep `src/` import in consumer code.

## Game development and integration

Read the concise shared guide in `agents/codex/AGENTS.md`; it is also the
consumer-facing authority for Codex, Claude Code and Cursor. Follow
`agents/references/game-lifecycle.md` for update ownership and teardown.
The copyable `agents/examples/game-foundation.mjs` provides a verified playable
blockout with movement, static collision, an objective and restart.

Build the requested host gameplay, camera, UI and level layout. Preserve an
existing level unless the task authorizes changing it. Label every styled root
and material slot before strict application; `createStyleTarget()` alone is not
a durable label. Use one scene-style runtime and one final render owner. Update
Sky, Water, grass and character systems through their owners exactly once;
style-runtime updates do not animate those systems. Use `post.render(delta)`
when post owns rendering, otherwise `renderer.render(scene, camera)`.

## Rendering and scene responsibilities

- Align the visible sky sun direction with the host directional light.
- `createSceneStyleRuntime()` installs the bundle's shared shadow pass and
  renderer defaults. Focused ToonLab adapters enable `castShadow` and
  `receiveShadow` for their supported meshes; custom host meshes must still
  opt in deliberately. Terrain and cliff masses must cast onto beaches, water
  receivers where supported, vegetation, characters, and each other.
- Treat the Sky System's baked volumetric transmittance as the authoritative
  cloud-shadow field. Ground, grass, trees, flowers, characters, rocks,
  manufactured props, water, shoreline foam, and breakers must sample that
  same field; never add an unrelated scene-local procedural cloud shadow.
- Keep indirect light high enough that cel shadows retain material identity.
- Configure host scene fog and pass matching distance-fog settings to systems
  that expose adapters.
- Use named transient layers for current weather/time state. Do not persist
  composed runtime state as authored style data.
- Apply style bundles only after labeling roots by rendering domain. Bundles
  select treatments; labels select destinations; scene state supplies current
  conditions.
- Preserve imported PBR maps and semantic material roles. Never infer a
  production-safe material class from RGB alone.
- For package-generated trees, preserve an explicit authored `trunkMap` first.
  When no map exists, Call Me Sensei must select the registered
  `call-me-sensei-bark-v1` surface instead of leaving a flat brown trunk.
  Agents may choose another ID from `getTreeSurfaceProfileOptions()` through
  `trunkSurfaceProfile`; use `'none'` only for a deliberate, reviewed flat-color
  art decision. Every trunk must keep `castShadow` and `receiveShadow` enabled
  and remain covered by the shared shadow pass.

## Experimental outdoor formation gate

The following is a research and evaluation order, not a supported one-shot
construction recipe. Use it only when the developer explicitly requests a
world-building experiment. Record every manual composition step and product
gap; never market a partially successful result as package behavior.

Build in this order:

1. macro terrain silhouette and water body;
2. parent geology and continuous material coverage;
3. connected primary and secondary rock structure;
4. biome relationships and tapered vegetation fields;
5. beach, shoreline, and underwater continuation;
6. lighting, atmosphere, and restrained post;
7. tertiary story dressing.

A cliff is a continuous terrain mass reinforced by overlapping modular rocks,
not a row of props. Rotate, tilt, non-uniformly scale, bury, crop, and overlap
reused rocks so visible copies do not expose the same silhouette, interval,
crop, or seam. Use one parent geology unless the level explicitly authors a
fault/contact. Hide every module back, base, terrain gap, and water-plane edge.

Grass and vegetation are ecological fields, not rectangles. Taper density at
paths, lips, rock fields, wetlands, and backshore. A lone tree must read as an
intentional landmark; otherwise form a canopy/sapling/understory relationship.

Continue the coast below water with a closed seabed, the same parent geology,
submerged rocks, moving aquatic vegetation, depth color/attenuation, and an
underwater camera treatment. Reject a hollow water plane or visible terrain
underside.

Inspect gameplay, shore, below-cliff, underwater, flyover, and top-down views.
Record unsupported package assumptions and observed defects. Ordinary
host-authored composition and user-requested overrides are not deficiencies.

## Assets and MCP

Feature-detect the connected ToonLab MCP surface.

- OSS: inspect workspace/library, search the official local catalog, then use
  `search_cc0_assets` and `import_cc0_asset` when policy allows.
  When local provider keys are configured, `generate_ai_asset` also exposes
  image generation, Fal Patina grouped PBR materials, Meshy 7 image/multiview-to-3D,
  and the selected-image-model text-to-Meshy pipeline; poll and save through the
  matching generation tools. A Patina preview, its variants, typed maps, and
  manifest are one material asset, never independent library entries.
- Pro: inspect project/ToonLab libraries, use `search_public_gallery`, then
  retrieve an approved asset with `get_toonlab_asset`.

Do not prescribe an OSS-only tool to Pro or a Pro-only tool to OSS. Official
downloads must be immutable `https://assets.toonlab.io/official/...` URLs;
reject private CDN, signed, `creation-files`, or expiring URLs. Store stable
ID, source class, provenance, license, review status, checksum, and policy
decision for every used asset.

The npm package contains no third-party media packs. Optional assets such as
the CC0 mannequin are downloaded from immutable R2 or supplied by the host;
they do not increase the package tarball.

## Repository-only work

Files under `src/` can exist before their public contract is approved. For a
repository-only prototype:

- label its documentation “repository-only” or “planned” at the top;
- use relative internal imports in its examples, not package specifiers;
- do not add it to `agents/references/runtime-entry-points.md`;
- do not direct consumers to it from shipped skills;
- add export, package-boundary, clean-consumer, and visual qualification before
  describing it as stable.

## Verification

Every production rock must follow `docs/rock-lod-production-policy.md` without
waiting for a user reminder: generate LOD0 through LOD4 plus collision, make
LOD4 a silhouette-only non-shadow-casting tier, select by projected screen
coverage, and cull below the declared pixel threshold. A 2.2k–6k mesh is not a
valid final dense-field tier merely because its silhouette passes.

For package documentation and skills:

```bash
npm run verify:skills
npm run verify:docs
npm run verify:package
```

For a release candidate:

```bash
npm run verify:release
npm pack --dry-run
```

Install the resulting tarball in a clean consumer and test only its public
imports. A successful build is not visual approval. Capture fresh screenshots,
inspect console output, and compare views affected by the task: gameplay,
near/far, lit/shadowed, shoreline or LOD states where those systems are used.

Database migrations and official catalog seed batches are append-only after
release. New official catalog metadata must use the next numbered seed and
immutable public R2 URLs. Never edit an applied migration or seed.
