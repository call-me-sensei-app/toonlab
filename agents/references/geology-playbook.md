# Geology assembly playbook

Use this reference with `karst-cliff-construction` and `outdoor-world`. It
describes reusable landform craft without depending on project-specific
helpers, asset IDs, or a frozen catalog count.

## 1. Establish the parent mass

Approve an untextured continuous terrain/heightfield silhouette first:
headlands, bays, terraces, tower envelopes, channel, beach, and submerged bed.
Catalog rocks dress and articulate that parent mass; they must not be the only
thing preventing the world from reading as hollow.

Reject before dressing when:

- the hero silhouette is wrong;
- the channel or beach footprint is clogged;
- the cliff is a thin wall with no top/underwater continuation;
- separate towers overlap into one clump from an approved camera.

## 2. Select donors by visible role

Query the connected ToonLab OSS or Pro catalog and shortlist with positive
`dimensionsMeters`, taxonomy, scale class, and immutable preview/asset URLs.
Family names and tags are search hints, not visual proof. Review contact sheets
or finalists under one neutral material and camera azimuth.

Useful morphology:

| Role | Visible requirement |
|---|---|
| Primary face | Broad load-bearing plane, gravity-aligned relief, no prop-like outline |
| Corner/termination | A turn or return face that buries cleanly into the parent mass |
| Bedding ledge | A real horizontal lip with enough depth to cast a recess shadow |
| Buttress/wedge | A seam bridge whose rear and toe can be buried |
| Waterline notch | Rounded or undercut lip that continues below the surface |
| Talus | Small jointed collapse block; free rotation is appropriate only here |

Choose target dimensions in metres from the published native dimensions.
Reject missing or invalid dimensions before download. Avoid solving an entire
wall by stretching one small donor; report mean/max scale and worst axis ratio
per structural role.

## 3. Build courses, not rubble

Primary faces share a near-common up axis and facing. Vary crop, burial,
neighbour overlap, tier, yaw silhouette, and moderate scale; do not tumble
load-bearing panels. Free three-axis tumbling belongs to collapse products.

Starting burial ranges, to be verified in silhouette:

- primary faces: bury roughly 30–60% of module depth;
- bedding ledges: bury the rear majority so only the lip projects;
- tower cores: seat the footing/course overlap, not most of the tower;
- talus: rest in contact and bury enough to remove floating toes.

Build in this order:

1. primary faces at noses, re-entrants, terminations, and terrace breaks;
2. bridging ledges, buttresses, crevice wedges, and recessed corbels;
3. waterline/submerged continuation and restrained talus;
4. vegetation caps and story dressing.

If a placement helper automatically splits an oversized request into a stack,
make that result explicit and refusable. Subdivision must not introduce yaw,
pitch, or roll jitter unless the caller deliberately requests a tumbled role.

## 4. Publish shared formation contracts

Sibling modules must consume the same world-space values rather than derive
private approximations:

- parent height/envelope;
- water level and submerged bed;
- bedding elevation ladder;
- visible face plane/standoff;
- cliff-top and vegetation-cap polygons;
- fall lips, landing pools, and exclusion zones.

One useful bedding ladder is `base + courseIndex * spacing`; derive `base` and
`spacing` from the terrain terracing/style rather than copying the qualifying
scene's numbers. Align visible beds across neighbouring formations.

## 5. Unify the material treatment

Use one intentional parent lithology. The rock shader can replace source
albedo and apply one projected treatment across morphologically compatible
donors, but it cannot change incompatible geometry into the same geology.
Record any cross-taxonomy donor override and judge the result from silhouette,
bedding, and surface response.

Prefer one `applyRockShader(formationRoot, settings)` call. Verify the report's
texture source and shadow defaults. Use `setRockShaderSceneState` for the
current water level so the wet band follows the shoreline.

## 6. Prevent recognizable repetition

Repeated asset ids are normal modular modelling. Repeated camera-facing
silhouettes are the defect. For nearby copies vary at least three of: visible
crop/burial, tier, neighbour overlap, meaningful scale, and camera-facing yaw.
Never use regular spacing or a visible kit row.

Placement metrics are rejection floors. They cannot prove that the rendered
formation reads as one mass.

## 7. Verify before approval

- Wait for application readiness and a stable rendered scene graph.
- Capture hero, wide, close, flyover, and top-down views.
- Isolate terrain, rock formation, water, and lighting when assigning a defect.
- Scan world-space extents for accidental slabs, dams, or oversized caps.
- Report module counts, donor dimensions, transformed dimensions, burial,
  per-role scale statistics, and active LODs.
- Squint at the silhouette: if individual boulders or a sawtooth crest remain
  legible, the cliff is still a pile.

Automated checks may reject gaps, invalid scale, and repeated transforms. Only
rendered multi-view evidence can approve the formation.

## 8. Treat semantic profiles as family-specific

Do not copy the representative hoodoo `base/shaft/neck/cap` height bands onto
basalt, tors, cliffs, talus, arches, bedding, columns, or another family. Each
qualified family needs an evidence-backed semantic profile that names its own
diagnostic regions and forbids drift. A future multi-page binding may carry
more roles, but old channel meanings must never be silently reinterpreted.

Any edit that changes positions, topology, orientation, landmarks, UV
occupancy, or silhouette invalidates derived semantic regions, LODs, collision,
and geometric residuals. Regenerate and rebake those outputs from the accepted
source; manual sculpting and procedural edits follow the same invalidation
rule. Material-only palette changes may keep geometry but still require exact
restore and package audits.
