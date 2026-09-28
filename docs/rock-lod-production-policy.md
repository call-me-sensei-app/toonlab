# Rock LOD production policy

This is the mandatory ToonLab rule for every newly generated, rebuilt, edited,
or imported production rock. Apply it automatically; do not wait for a user to
request an extra far tier.

## Required outputs

Ship five visual meshes and separate collision:

| Tier | Purpose | Required content |
| --- | --- | --- |
| LOD0 | hero/close | approved authored shape and full runtime surface |
| LOD1 | near gameplay | primary and secondary geology |
| LOD2 | mid gameplay | primary geology and important meso silhouette |
| LOD3 | far | simplified primary mass; no tertiary geometry |
| LOD4 | very far | outer silhouette, primary mass, support, and broad base color only |
| collision | queries/physics | independent simple watertight hull |

LOD4 is deliberately a silhouette proxy. It must not retain cracks, strata
relief, cavities, secondary ledges, normal/height/AO sampling, or unique
roughness that is smaller than its projected pixels. It does not cast shadows.
LOD3 and LOD4 may receive broad sky/sun lighting so that they remain integrated
with the scene.

## Triangle ceilings

These are ceilings, not targets that must be filled:

| Asset class | LOD3 ceiling | LOD4 ceiling |
| --- | ---: | ---: |
| ordinary boulder, slab, debris | 1,200 | 350 |
| formation, outcrop, hoodoo | 1,800 | 600 |
| landmark, tor, sea stack | 2,500 | 800 |

Reduce further whenever silhouette and support remain stable. A legacy
2.2k–6k LOD3 is an intermediate far mesh, not the final dense-field tier.

## Runtime selection and culling

Use projected object diameter, not one global world-distance table. The default
minimum screen coverage for LOD0 through LOD4 is 240, 110, 48, 16, and 6 pixels.
Cull the object below 5 pixels, with hysteresis to prevent transition thrashing.
Disable cast shadows after LOD2.

Use `createDenseFieldRockLodRuntime()` for authored catalog roots named LOD0
through LOD4. It fails closed when a tier is missing, applies the shadow rule,
selects by screen coverage, and culls the root. Device-specific projects may
override thresholds only after a recorded profile proves the replacement.

Thousands of placed rocks additionally require instancing, spatially chunked
instance pools, frustum/occlusion culling, and HLOD where formations merge at
distance. LOD4 reduces geometry cost but does not replace those systems.

## Rebuild and verification gate

Any manual sculpt, procedural variation, non-uniform editor scale, or other
shape-changing edit invalidates every visual LOD and collision. Rebuild all
tiers directly from the approved high source; never decimate LOD3 to obtain
LOD4. Compare front, rear, left, right, top, and bottom/support silhouettes.
Record transition pixels, draw calls, visible triangle count, shadow cost,
material slots, texture memory, and target-device frame timing.

Run:

```bash
npm run verify:rock-dense-field-lod
```

The machine-readable budgets are in
`scripts/fixtures/rock-dense-field-lod-policy.json`. Authoring tools should use
these limits and record the policy hash in each output manifest.
