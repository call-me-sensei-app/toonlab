---
name: scene-style-application
description: Inspect, plan, apply, and verify ToonLab style bundles on labeled scenes without copying Lab or showcase code.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Scene style application

Ask the developer whether application should be **strict** or **advisory** before
changing the scene. Strict mode stops on unlabeled, invalid, or unsupported
targets. Advisory mode applies valid labeled targets and reports every gap.

Use the package contract in this order:

1. Label host-owned objects with `createStyleTargetLabel()` and
   `labelStyleTarget()` from `@call-me-sensei/toonlab/styles`.
   For every newly modeled, generated, or imported renderable, assign a stable
   material ID and at least one valid semantic material role to **every material
   slot** in the label's versioned `materials` contract. A root domain label by
   itself is incomplete for a multi-material object. Split incompatible surface
   regions or provide an explicit material-ID mask; never guess a production
   role from names or RGB values.
   For an imported manufactured asset, call
   `proposeManufacturedStyleTargetLabel()` first. Review every generic,
   conflicting, or low-confidence entry, supply explicit `materialOverrides`,
   then call `applyManufacturedStyleTargetLabelProposal()`. Never lower the
   confidence threshold merely to make strict application pass.
2. Run `toonlab inspect`, `toonlab audit`, then `toonlab plan` against a portable
   `toonlab/scene-style-manifest` document. The OSS MCP tools with the same names
   are equivalent when MCP is available.
3. Show the plan, including unsupported domains and custom-material exemptions.
4. Run `toonlab apply` only after the strict/advisory choice is known.
5. Run `toonlab verify`, the consumer build, and visual checks for every camera,
   renderer, quality profile, and scenario affected.

When the scene combines ground-bound content with shoreline water, use one
`createSceneSurfaceRuntime()` from `@call-me-sensei/toonlab/runtime` before
creating grass, water, or derived object Y positions. Its `createGrassField()`,
`createWaterSurface()`, and `place()` methods are the default integration path.
After rendering the shared shadow pass, its strict readiness audit must pass;
do not hand off a page that merely built or set shadow flags.

For a package-generated `StylizedTree`, preserve an authored `trunkMap`; when
it is absent, let Call Me Sensei select `call-me-sensei-bark-v1` or choose an
explicit registered ID from `getTreeSurfaceProfileOptions()`. Never leave bark
flat because no one chose a texture. Verify every trunk is both a shared-pass
caster and receiver. `trunkSurfaceProfile: 'none'` is a deliberate opt-out,
not a fallback.

Do not hand off an authored 3D object while any render material is absent from
the contract. In strict mode, missing material IDs/roles or a mixed atlas
without a split/mask is a blocking failure; fix the asset metadata before
applying the bundle. In advisory mode, report the same gap explicitly and do
not describe the object as style-bundle-ready.

`applyStyleBundle({ mode: 'strict' })` reconciles the declared material
contract against the live material slots before mutation. Keep the broader
scene audit as the reporting gate, but do not bypass a direct strict rejection
by calling a lower-level shader adapter.

Never import from a ToonLab `labs/` directory, copy a showcase scene, or depend
on a retained reference-scene implementation. Labs are authoring/test clients;
public package exports are the runtime authority. If a needed behavior is not a
public export, record the package gap rather than copying private code.

The host owns authored XZ layout, terrain shape/sampler, gameplay, dynamic
physics, navigation, and content identity. The shared surface runtime owns
derived ground heights and terrain/water coordination. The scene style runtime
owns conservative static collision for labeled manufactured, rock, prop, and
tree targets unless the label declares another policy. Call
`styleRuntime.collision.assertReady()` before handoff and report its per-target
plan. Do not add scene-local tree/rock/bench blocker lists. Use explicit
`none`, `blockers`, `convex`, or `trimesh` metadata when bounds are wrong; use
`createRapierCollisionAdapter()` for an existing Rapier world. A style bundle
owns visual treatment and package-managed systems.
