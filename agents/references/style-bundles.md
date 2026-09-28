# Style Bundles and Shader Routing

A style bundle selects coordinated visual treatments and supported system
behavior. It never selects model identity, species, placements, current
weather, or current time.

Use `CALL_ME_SENSEI_STYLE_BUNDLE` as the first-party anime-game reference.
Use `auditStyleBundleApplication()` before `applyStyleBundle()`. Production
targets need a stable `id` and an explicit `domain`. Supported domains use
package adapters automatically; custom renderers need an explicit adapter. Do
not classify from object names, texture colors, or scene parenting.

| Target domain | Bundle slot |
| --- | --- |
| `character`, `equipment`, `prop` | `toon` |
| `manufactured.environment` | `environment` |
| `vegetation.tree` | `treeShader` |
| `vegetation.grass` | `grassShader` + `grass` field response |
| `vegetation.flower` | `flowerShader` |
| `terrain.ground` | `groundShader` |
| `natural.rock` | `rock` |
| `natural.debris` | `debris` |
| `water` | `water` |
| `sky` | `sky` |
| `cloud` | `cloud` |
| `lighting` | `lighting` |
| `post` | `post` |

Prefer `createSceneStyleRuntime({ renderer, scene, sky, water })` for a complete
bundle application. It owns one stable lighting rig and automatically enables
the environment ground-field pass when the grass slot requests ground-color
adoption. Call `runtime.update(delta, camera)` before the scene render. Never
recreate those passes in each playground or scene. Sky, Water, grass and
character animation retain their own update owners; see
`agents/references/game-lifecycle.md`. When post is bound, use its final
`render(delta)` path rather than bypassing it.

Strict application preflights every target before the first mutation. Missing
slots, unknown domains, mixed material roles without an ID mask, unsupported
renderers, and undocumented custom adapters are failures. Advisory mode may
apply valid targets, but it must return every skipped target and gap.

## Mandatory authored-asset labeling

Agents that model, generate, convert, or import a 3D object must finish its
style metadata before handoff. Every renderable root needs a stable target ID
and explicit domain. Every material slot beneath it needs a stable material ID
and at least one semantic role in the versioned `materials` contract. A root
domain label does not substitute for per-material classification.

If one atlas crosses incompatible physical or shader roles, split the draw
materials or author a material-ID mask. Strict mode must fail incomplete
material coverage. Advisory mode may continue only while recording the gap;
the agent must not call the asset style-bundle-ready.

The minimum public-API shape is:

```js
material.userData.toonlabMaterialId = 'BenchWood';
labelStyleTarget(root, createStyleTargetLabel('manufactured.surface', {
  targetId: 'scene/bench-1',
  materials: createStyleMaterialContract('manufactured.surface', {
    assignments: { BenchWood: { roles: ['primaryMass'] } },
  }),
}));
```

Repeat the assignment for every distinct render material. The IDs belong in
the asset/export manifest as well as the runtime object so reimport does not
silently erase routing.

Style bundle v2 is visual-only and includes anime art-direction metadata.
Parsing a v1 document returns migration warnings for old asset selections;
move those decisions to scene configuration or an asset-sourcing policy.
