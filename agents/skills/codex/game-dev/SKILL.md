---
name: game-dev
description: Build a new playable game or integrate ToonLab into an existing Three.js game using public rendering, character, surface, collision, and asset workflows.
---

# Develop a game with ToonLab

Use this for game development and integration spanning several ToonLab systems.
For a single shader or asset edit, use its focused skill. References beginning
`agents/` are relative to the installed `@call-me-sensei/toonlab` package root.

Read `agents/references/runtime-entry-points.md` for supported APIs. Read
`agents/references/game-lifecycle.md` when wiring the renderer, movement,
update loop, or teardown. Read art-direction/style references when applying a
look, and `asset-sourcing` when asset discovery or generation is needed.

## New game

Implement the requested host game: input, camera, rules, HUD, level layout,
dynamic physics or lightweight movement, and persistence if requested.
Host-owned does not mean forbidden. Use ToonLab for the capabilities it
actually exports; do not promise that a package call generates a finished world.

Start with a playable vertical slice: move, collide, interact with one objective,
and restart. Use simple host-authored geometry until the loop works. Replace
placeholders with accepted assets and the chosen style incrementally. Record
performance and visual checks at the gameplay camera, not just a flyover.
The copyable `agents/examples/game-foundation.mjs` demonstrates a small
host-authored loop with public ToonLab labeling, styling and static collision;
it is an example, not a new package API or a full physics controller.

## Existing game

Inventory the existing renderer, loop, cameras, physics, loading and cleanup
paths. Preserve them unless the task authorizes replacement. Integrate only the
requested targets and avoid starting another animation loop. Use adapters for
the host physics world and existing controllers rather than parallel systems.

## Integrate the supported runtime

1. Resolve the installed package version, export map, and selected style bundle.
   Call Me Sensei's bundle ID is `call-me-sensei`; domain selectors can differ.
2. Create or reuse the host scene and renderer. Use `createCharacterRuntime()`
   for supported loaded characters, and the walkable runtime when its movement
   integration fits. Keep host input, movement intent and camera separate.
3. If terrain placement and shoreline systems share a heightfield, provide its
   world bounds and `heightAt(x, z)` once to `createSceneSurfaceRuntime()`.
   Use its placement, grass and water helpers for that coordinated scene.
   Ordinary rooms or flat arenas do not need a surface runtime.
4. Assign stable target IDs, rendering domains, material IDs and roles. Use
   `proposeManufacturedStyleTargetLabel()` and explicit reviewed corrections
   for ambiguous imported materials; persist the accepted contract.
5. Create one `createSceneStyleRuntime()` for the scene, then call its `apply()`
   with the chosen bundle and labeled targets/discovery in strict mode. This
   coordinates the renderer, lighting, ground field, shadows and static
   collision. Resolve strict failures before application; do not bypass them
   by calling an adapter directly.
6. Use its default labeled static blockers and explicit collision metadata
   where bounds are inappropriate. Prefer `createRapierCollisionAdapter()`
   when integrating with an existing Rapier world. Do not maintain a second
   blocker list for the same assets. Test real movement, not just flags.
7. Assign one update owner per system and one final render owner. See the
   lifecycle reference: style updates do not replace Sky, Water, grass or
   character updates. When post is active, render through its documented path.
8. Run `styleRuntime.collision.assertReady()`. For heightfield scenes, also run
   `surface.assertReady({ camera, styleRuntime, requireShadowDomains })` after
   the shared passes have rendered, scoped to the domains actually present.

## Completion

The requested gameplay loop, controls, camera, UI and restart work. Applicable
build/type checks pass. Targets have complete material contracts; assets retain
provenance and editable recipes. Inspect lit/shadowed and near/far views where
relevant, and exercise startup, resize, pause/resume and disposal. Report
remaining defects honestly. Do not require every optional ToonLab domain in a
scene that does not use it, or treat user-approved host code as a package defect.
