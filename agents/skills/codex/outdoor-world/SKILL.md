---
name: outdoor-world
description: Experimentally construct, tune, or visually review a stylized anime outdoor world with ToonLab, using research-derived rejection gates for biomes, vegetation, cliffs, beaches, terrain, water, atmosphere, and regression checks; this skill does not promise reliable one-shot scene generation.
---

# Experimental stylized outdoor-world construction

Use this skill only when a developer explicitly requests an outdoor
construction experiment, controlled package qualification, or failure review.
The recommended ToonLab workflow starts from an already constructed scene and
applies focused shaders, vegetation, water, assets, and post. The formation
rules below are research-derived rejection gates, not evidence that ToonLab or
an LLM can currently produce a polished world from one prompt.

## Experimental assembly boundary in the public package

The complete look emerges from composition: the sky, water, vegetation,
terrain materials, weather, fog, shadows, and post treatment must agree on the
same art direction and runtime conditions. ToonLab intentionally does
not export a one-call full-world builder. Do not invent one or copy a
repository-only composition helper into consumer code.

The host creates the layout, major geometry, renderer, scene, camera, lights,
controls, dynamic physics, navigation, placements, and render loop. Add only the public
systems listed in
`agents/references/runtime-entry-points.md`, keep each returned controller,
and call each controller's documented update method before the host renders.
Use recommended focused water, vegetation/grass, environment, ground-shader,
rock-shader, and post guidance for their exact constructors and adapters.
Sky/Cloud, Weather/Climate, terrain formation, and cross-system composition
remain experimental. Wire shared scene state explicitly; there is no implicit
production coordinator in this release.

Three cross-cutting skills apply to every outdoor build and are worth reading
before you start rather than after a review:

- **`style-presets`** — explicitly name and record the intended selector on
  every style-aware factory. Some domains resolve a neutral/default treatment;
  Rock, Ground, and Cloud already default to Call Me Sensei. The skill lists
  the exact contract instead of applying one warning to every factory.
- **`karst-cliff-construction`** — assembling cliffs, gorges, towers and
  coastlines out of catalog rocks: selecting by silhouette rather than by tag,
  unifying mixed catalog geologies into one parent rock, the transform grammar,
  and the gates that catch a rubble pile.
- **`visual-verification`** — settling a scene before screenshotting, isolating
  a subsystem to attribute a defect, measuring colour against sampled targets,
  scanning the scene graph for outliers, and running an adversarial critic loop.

Inspect the installed preset registry/source before authoring overrides. When
working in a ToonLab repository checkout, also open the lab for each domain you
touch (`labs/…`) and compare the values it boots. Labs are repository-only
reference implementations: they are absent from npm and must never be imported
or treated as runtime dependencies.

For a controlled package qualification or subsystem test, assemble only the
systems named by the test. Reusing a fixed ground base, sky, cloud, or lighting
fixture is valid when the test contract allows it. Record any project-owned
composition or manual override as a package, skill, asset-policy, or harness
deficiency instead of presenting it as package behavior.

### Package-only grass qualification

For a release-candidate grass test, install the packed tarball into a clean
consumer and import only from `@call-me-sensei/toonlab/grass`. Do not import
repository `src/` files or repository-only comparison assets; those are not
proof that the installed package is complete.

`createCallMeSenseiGrassField()` is the default first-party Call Me Sensei
path. It generates either clump plus all three LODs and its material directly
from installed package code; it does not load GLBs or textures. The default
returned type is `StylizedGrassClumpField`. `RetainedGrassClumpField` is only
an instancing/LOD container for caller-supplied geometry and materials; it is
not a separate ToonLab grass asset. In a clean consumer, assert the generated
LOD triangle counts, blade attributes, material, and deterministic seed, and
assert that the tarball contains no grass media files. Never substitute the
comparison scene's retained geometry/material or a repository sample and label
that result as package grass.

The default factory must resolve `preset: 'call_me_sensei_clump'`. Treat its
meadow character as a contract: upright overlapping strokes, continuous
coverage at the grazing camera, a bright watercolor wash, and color derived
from the ground field. Sparse procedural blades, isolated tuft islands, dark
or muddy roots, tangled crossed blades, bare-ground pinholes between ordinary
placements, or an unexplained coverage edge are release failures. Do not repair
them with example-local material overrides; correct the package preset, shader,
geometry, scatter contract, or ground-field integration and add a regression.

The controlled host still owns scatter and scene state. Place one clump record
per package-generated or test-authored placement, include terrain normals for
slope alignment, then wire all runtime inputs before visual approval:

```js
import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/grass';

const grass = await createCallMeSenseiGrassField({
  placements,
  variant: 'primary', // or 'secondary'
});
// per frame, after updating the ground/shadow field passes:
grass.update(delta, camera);
```

When ground adoption is enabled, prefer `createSceneStyleRuntime()` and label
terrain `terrain.ground` plus the meadow `vegetation.grass`; the selected bundle
then marks ground writers and owns the environment ground-field pass. A manual
subsystem integration must mark every terrain mesh, update its pass before
grass, and verify at least one writer. Match the target's clump density, scale range, surface
alignment, and camera before judging silhouette or color. A class/export check
is not visual parity; compare the packaged result in composition and close views
against the frozen controlled source mode and report the installed asset paths,
clump/LOD counts, and any remaining visible mismatch. Never approve by color
values alone. In every inspection
view, reconcile the sum of active LOD instance counts against the placements
that are meant to remain visible. A deficit means the final LOD distance or an
explicit fade/cull contract is clipping the field; never approve an unexplained
hard grass boundary.

Treat ground blending as an LOD invariant. For the default Call Me Sensei
profile, ground hue is authoritative: green terrain yields lighter/darker green
blades, not yellow tips. LOD0/1/2 may simplify topology but must preserve
integrated screen coverage so zooming does not make the underlying terrain
appear to change color. If it does, fix retention, retained-blade width/alpha,
or transition policy in the package; do not tune each camera separately.

### Outdoor-world formation standard

For any rocky coast or cliff, read
[references/coastal-landform-formation.md](references/coastal-landform-formation.md)
before selecting or placing assets. It converts production research and
coastal geomorphology into the required ToonLab pipeline and rejection gates.

ToonLab does not currently expose a stable automatic cliff-formation planner.
Keep landform generation and local rock assembly project-owned, record the gap,
and visually approve every authored coast. Do not claim that instance-count,
spacing, transform, or role metrics prove a cliff is production quality.

Build outdoor worlds from large landform logic down to small dressing. Do not
start by scattering props. Complete and approve each scale before moving to the
next:

1. **Macro landform (20–500 m)** — author the connected terrain silhouette:
   headlands, bays, terraces, ridges, drainage, beaches, and sea floor. A cliff
   is first a continuous eroded mass, not a row of rock meshes. From Flyover
   and Top-down, the coast must read as a coherent landform with irregular but
   intentional rhythm before any catalog rock is added.
2. **Primary structure (5–20 m)** — use large face, wall, arch, shelf, and
   termination assets to reinforce selected turns in the terrain. Keep them
   subordinate to the macro mass and bury 30–60% of their depth into it. Never
   expose a module back, base, bounding edge, or free-standing panel silhouette.
3. **Secondary structure (1–6 m)** — bridge primary assets with ledges,
   buttresses, crevice wedges, and fractured slabs. Use overlaps, shared planes,
   and shadowed recesses so seams cannot be traced from an approved camera.
4. **Tertiary dressing (0.1–2 m)** — add talus, beach stones, debris, plants,
   wet accents, and story detail only after the silhouette and seams pass.

One visually connected formation uses one parent geology. Surface state may
vary with exposure—bare, mineral-stained, mossy, or wet—but limestone,
sandstone, and granite do not alternate between adjacent modules unless the
level explicitly authors a readable fault or geological contact. Sand belongs
to beach, dune, or sediment deposits; never apply a sand-colored cap to random
cliff rocks merely to add color variation.

Every formation must show vertical weathering logic:

- the **lip** has soil/grass overhangs, exposed shelves, roots, and broken edges;
- the **mid-face** carries the dominant parent-rock color, large planes,
  fractures, and readable striation;
- the **base** is darker/wetter, more fractured, and joined to talus or surf;
- the **underwater continuation** uses the same parent geology plus submerged
  boulders, plants, bed color, and depth-driven water transition.

Asset variation is an acceptance gate, not an aesthetic preference. Reusing a
good modular rock is normal environment modeling: rotate it to present another
face, tilt it for the structural role, change non-uniform scale within a
believable range, bury/crop a different portion, and overlap it with different
neighbors. Use authored transform grammar rather than small random jitter:

- **face/wall** — align the load-bearing axis, then vary yaw broadly and keep
  pitch/roll restrained unless the formation explains a tilted stratum;
- **shelf/lip** — rotate a useful plane upward, crop its rear into terrain,
  and support the underside with a face or buttress;
- **buttress/termination** — turn the broad mass toward the coastline change
  and bury enough of the repeated source silhouette to make a new outline;
- **talus/boulder** — allow broad three-axis rotation and 0.7–1.4 non-uniform
  scale, but preserve believable gravity and contact with the receiving bed.

The rejection gate is **recognizable repetition**, not a repeated asset ID.
Copies visible together must not expose the same camera-facing silhouette,
orientation, scale, crop, or neighbor/seam pattern; never place twins beside
each other or at a regular interval. Landmark faces need the strictest screen-
space separation, while well-transformed tertiary rocks can be reused many
times. Search the full catalog for enough role and silhouette families. On
OSS use `search_assets({ source: 'official' })`; on Pro use
`search_public_gallery({ source: 'toonlab', catalog: 'rock' })`; exhaust
`nextOffset` on both surfaces. Shortlist by `dimensionsMeters`, family/profile, scale class,
category/subcategory, parent geology, and surface before downloading or
rendering. Use width/height/depth to match structural roles and estimate burial,
overlap, and transformed scene size; never stretch a prop-scale boulder into a
landmark because its dimensions were unknown. Then extract multiple credible placements from each. Record candidates inspected,
selected IDs, instance count per ID, transform ranges, geology, surface state,
and any recognizable-repeat failures in the test evidence.

Reject the formation when it reads as a fence, repeated panels, mushrooms,
teeth, stepping stones, or a kit row. Rotation and scale jitter cannot repair
an insufficient role set. Return to MCP, search the wider catalog, and select
more structurally appropriate assets.

Model the cliff as a connected modular shape: establish a continuous terrain
core, overlap large rock masses to define each headland and face turn, rotate
useful faces toward the intended planes, scale them non-uniformly to vary
thickness and reach, bury their backs and bases, then bridge every readable
gap with shelves, wedges, buttresses, and talus. The resulting silhouette must
read as one load-bearing landform even when individual source rocks are reused.
This is an artist/modeling workflow that an agent may execute; it is not a
claim that ToonLab currently has an automatic cliff-forming API.

Material coverage is also a gate. Every camera-visible terrain or module
surface must have authored maps or visibly readable triplanar/procedural rock
detail at the intended viewing distance. A flat fallback color, stretched
planar UV, missing texture request, or untextured terrain gap fails even when
rocks hide part of it. Verify the lit side, shadow side, grazing angle, and
close camera separately.

Approve outdoor work in this order: untextured macro silhouette, geology and
material continuity, primary/secondary rock structure, vegetation/ecology,
beach and underwater dressing, then lighting/atmosphere. Small props and post
processing cannot be used to conceal a failed earlier gate.

### Composition and biome continuity gate

Treat scatter as an ecological field, not a rectangle of objects. Build grass
coverage from `createDensityWeightMask()` composed with slope, water, surface,
path, and POI masks. Let coverage taper over several meters at cliff lips,
rock fields, paths, and backshore instead of stopping on a grid row or bounding
box. Full coverage may end only behind an occluder or outside every approved
camera. Reject any straight or unexplained grass boundary in Explore, Flyover,
Top-down, and shore views.

Partition a coast into six connected zones and dress every visible one:

1. **Meadow/topsoil** — grass masses with authored clearings and ground color
   adoption; expose dirt or stone where traffic, slope, or geology explains it.
2. **Cliff lip** — broken rock outcrops, short grass, and irregular erosion;
   never transition from full grass directly to a smooth vertical wall.
3. **Cliff face** — readable strata or overlapping rock masses at several
   scales. Sink rock instances 20–45% into the terrain, vary rotation and
   non-uniform scale, and use face, buttress, and crevice groups rather than a
   row of identical boulders. Search the ToonLab catalog by geological role
   and assemble at least one landmark wall/face family, one slab family, and
   one talus/detail family; do not stretch one prop boulder into every role.
   A large bare untextured wall or camera-visible primitive proxy is a release
   failure. If an authored map is absent, the package ground shader's
   triplanar geological detail must remain visibly readable between assets.
4. **Talus/headland** — clustered rocks bridge the wall to surf and hide the
   procedural terrain/water seam; keep some partially submerged silhouettes.
5. **Beach/backshore** — verify the sand albedo, normal, and packed ARM maps are
   actually sampled at a readable repeat. Add small rock groups, sparse grass
   at the dry back edge, and one or two story accents allowed by the asset
   policy. Do not leave an empty uniformly colored sand patch.
6. **Underwater continuation** — extend the seabed beyond the water tile and
   every camera footprint, then add submerged rock groupings and packaged
   moving water vegetation. Never expose the underside/edge of the terrain or
   leave the coast biologically empty below the surface.

The water surface must extend past the intersection of every approved camera
frustum with the water plane, with an additional safety margin for orbit,
camera shake, and wave displacement. A visible rectangular surface boundary
is always a failure; increase both width and depth rather than hiding the edge
with composition.

Build vegetation as a biome relationship. A lone tree is valid only when the
composition identifies it as a deliberate landmark and gives it an ecological
reason to survive. Otherwise use a small canopy cluster with age/scale
variation, understory or saplings, ground cover, and nearby rock/moisture
signals. Keep sightline clearings intentional and avoid both evenly spaced
confetti and a random isolated specimen.

Before approval, record zone coverage and asset provenance, then inspect the
same coast from gameplay height, below the cliff, along the beach, Flyover,
and Top-down. If any manual placement or shader override was required, classify
it as a package-default, composition-skill, asset-policy, or test-harness
deficiency; do not silently call the tuned fixture a package pass.

Rock placement evidence must include each selected catalog ID, its original
`dimensionsMeters`, authored scale/rotation, transformed scene dimensions,
burial depth, geology, structural role, and reuse count. Missing spatial
metadata is a catalog deficiency, not permission to render every candidate
just to estimate size.


## Terrain in one call (or bring your own)

Select the treatment before tuning individual values. The environment adapter
accepts the named baseline directly:

```js
await applyEnvironmentShader(environmentRoot, {
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
});
```

The numeric values below are validation benchmarks already carried by the
shipped treatment, not a list to retype over it. Override one only when the
scene has a measured reason that the shared preset cannot know.

The first public package does not expose a world or terrain generator. Bring
an existing terrain from the host project, or author ordinary Three.js mesh
geometry in the host application; do not invent a ToonLab generation API.
The terrain integration needs a pure `heightAt(x, z)` in meters and a
displaced mesh under `terrain.root` with `frustumCulled = false`;
everything downstream (masks, scatter, collision, minimap) derives from
`heightAt` + `water.level`.

## Non-negotiable quality rules

1. **1 world unit = 1 meter, everywhere.** Camera `near 0.3 / far 600 / fov
   45` for third-person gameplay. Trees `size 2.5–4` (≈ 8–12 m). Grass
   blades for ordinary short turf are often 0.22–0.48 m; qualified authored
   clumps such as the 0.82 m Call Me Sensei primary must not be rescaled merely
   to satisfy that generic range. Judge human scale instead: dense grass stays
   below the character's knees/hips and does not swallow the silhouette.
2. **Sun alignment**: the sky's visible sun disc and the host light rig MUST
   point the same way. Read the active sky sun direction and apply it to the
   directional light instead of assuming that ToonLab coordinates them. Match
   the fiction's time of day: 2 PM
   summer = `sunDirection y ≈ 0.8`, warm-white `sunColor [1.0, 0.97,
   0.88]`, crisp short shadows; golden hour = `y ≈ 0.4`. Fully vertical
   (`y ≈ 1`) reads flat and hides every cast shadow.
3. **Three-layer atmosphere** — the single biggest "looks like the reference"
   factor:
   - host-owned `scene.fog` so ALL materials — terrain,
     tree far proxies, rocks — fade together into haze silhouettes;
   - the named environment treatment carries `heightFogDensity ≈ 0.00055,
     heightFogFalloff ≈ 400,
     heightFogColor [0.63, 0.8, 0.98]` (sky-blue; WHITE fog is the #1
     "looks wrong" mistake, and falloff < 100 silently kills fog above
     low ground);
   - restrained post `depthCue` (strength ≈ 0.1–0.2, blue) for the far wash.
4. **Cast shadows on**: terrain mesh `castShadow = true` (cliffs shadow
   their own valleys), rocks both flags, forests `lod: { castShadow: true }`.
   Without them the world has no depth anchoring.
5. **Never crush shade**: the named environment treatment should resolve near
   `ambientStrength >= 0.3`, `shadowLift >= 0.35`,
   `sunShadowStrength <= 0.8`, and blue `shadowTintColor [0.68, 0.74, 0.94]`.
   Ground and rock own separate lighting groups; do not apply these numeric
   floors to their unrelated controls. Validate each preset under the shared
   sun and require away-facing surfaces to remain readable.
6. **Grade it**: the treatment resolves near environment `saturation ≈ 1.2`,
   `exposure ≈ 1.06`; use post
   preset `call_me_sensei`, restrained bloom. Vividness comes from material
   palettes and value separation, not exposure or a white veil.
7. **Vegetation has three height layers**: canopy, understory, ground cover.
   Keep the forest spacing <= 7 m, explicitly author a bounded shrub/rosette
   layer, and keep dense follow-window grass.
   Cluster forests with `createNoisePatchMask({ scale: 0.004–0.006,
   threshold: 0.38–0.45 })`, but reject a seed/mask that leaves the hero view
   as one giant empty lawn. Canopies stay green-dominant with at most one
   gold accent.
8. **Default morphology is lush karst**: rolling green hills with localized
   rock outcrops in the playable area, ~20 m terracing mostly gated to the
   mountain field, and dramatic bare karst on the rim. Wall-to-wall rock is
   a failed landform balance. Paint only steep analytic slopes
   (`rise/run > 0.72`) and the upper mountain band warm ochre limestone;
   keep tops meadow
   `0x6ea24b` / golden `0xbfa845` patches, sand `0xdccf96` at the
   waterline. Bake atmospheric blue `0x9fbcd8` into far-rim vertex colors.
   Keep broad horizontal sediment strata and dark crevices in a dedicated
   triplanar cliff map at world scale (the treatment resolves near
   `triplanarDetailScale ≈ 28`). Do not
   project a highly tiled ground map underneath the cliff map.
9. **Terrain never hovers at the waterline**: continuously ramp ground within
   a transition band around the water level into a clear bank and then the
   submerged bed. Never snap or clamp `heightAt()` across a forbidden y-band;
   that creates a terrace or vertical skirt. The mesh must not render broken
   water slivers along any contour.
10. **Tune terrain numerically, not visually**: target ~14–20 % below water,
   peaks to ~175 m, before ever looking at a render. Iterate `heightAt` in
   node with a coverage-stats loop.
11. **Probe the spawn**: pick it programmatically — walkable height, water
    30–110 m away, no wall > 27 m within 150 m, open sightline toward the
    map interior (never toward a world-edge rim).
12. **End the world in a mountain rim** (heights rise beyond the playable
   area) so no camera ever sees a void edge; haze it with rule 8's baked
    blue.
13. **Keep living light active**: use Call Me Sensei Weather, keep broad
    moving cloud-shadow coverage/strength around 0.5, and call every installed
    system's documented update method before rendering so terrain, trees,
    grass, and water remain synchronized.
14. **Keep gameplay VFX host-owned**: the public package has no stable checkpoint-ring or
    motion-trail export. If the project needs them, implement and test them in
    the host and record the missing package surface. Use bounded translucent
    geometry, near-camera fade, short speed-gated trails, and no screen-filling
    discs or rigid white boxes.
15. **Keep water deep and alive**: Call Me Sensei water uses a saturated deep
    blue body, reflection strength <= 0.5, visible detail normals, and low
    lake wave motion. Do not restore the old milky anime tone.
16. **Ground without crushing**: generated terrain must ship its
    `envVertexAo` attribute; rockgen ships SDF AO. The host may add a restrained
    contact-shadow solution for tree/rock bases with cool color and opacity
    <= 0.18. Never use opaque black blobs as AO.
17. **Give the horizon a human scale anchor**: the default lush terrain ships
    one deterministic castle silhouette. Bespoke worlds need an equivalent
    tower, city, ruin, or landmark structure on the rim; noise-only peaks are not
    a landmark.
18. **Far LODs keep real volume**: use the default instanced low-poly crown +
    crown proxy (<= 160 triangles/tree); keep trunks in near LOD only so they
    cannot minify into aerial dirt. Never replace it with a painted
    billboard, ellipse texture, or horizontal aerial cap: those become dirty
    speckles from above and giant color blobs from gameplay cameras.
19. **Moss hero rocks**: keep Call Me Sensei rock moss coverage around
    0.25–0.4 on upward ledges. The terrain remains mostly meadow; moss helps
    the localized outcrops belong to it.
20. **Near-camera particles disappear**: keep the default 0.45–1.35 m cutout
    particle fade. A petal or leaf crossing the camera must collapse before
    it becomes a screen-sized pink/orange blob.

## Budgets (60 fps desktop, < 10 s startup)

| System | Budget | Mechanism |
|---|---|---|
| Trees | 1,500–3,000 placements | `StylizedForest` LOD: 10 instanced volumetric proxy variants (<= 160 tris/tree), near = 140 live clones within 165 m |
| Understory | ≤ 2,400 shrubs + 6,200 rosettes | two instanced draws derived from forest placements |
| Grass | Measure with `field.bladeBudget()` | Budget clump placements over coverage-positive ground in approved camera footprints. The qualifying lab used about 1.78 patches/m² as a scene-specific reference; derive the actual drawn LOD0/1/2 blades instead of calling that a universal package density. Grade placement density against the hero camera and report how much of the field is behind every approved shot. |
| Rocks | ≤ 180 clones | 3–4 rockgen variants at `gameplayHigh`, shared geometry |
| Terrain | ≤ 265k vertices | one displaced plane, vertex colors + shipped `envVertexAo`; no boot-time ray bake |

## Symptom table — check here FIRST when it looks wrong

| Symptom | Cause | Fix |
|---|---|---|
| Terrain smooth, gray-green, unlit-looking | environment/ground shader never applied | classify the terrain explicitly and apply the stable environment or ground-shader API before rendering |
| Distant trees dark/near-black | shadow palette or far proxy colors too dark | use Call Me Sensei tree + vegetation shader and the default lifted volumetric LOD |
| Distant trees look dirty/noisy | near-leaf detail was baked into a billboard | restore the instanced volumetric crown proxy; never use card-by-card far bakes |
| Giant green/orange crown blobs | ellipse billboard or horizontal top cap leaked into gameplay | remove the billboard path; use the camera-independent volumetric proxy |
| Distant trees sharp saturated blobs, no fade | `scene.fog` missing | configure host scene fog and pass matching distance-fog settings to systems that expose an adapter |
| Trees look like confetti from the air | uniform/sparse scatter or no middle layer | preset spacing <= 7 m + patch mask + default instanced understory |
| Aerial frame is one empty lawn | patch threshold/seed removed the whole hero region | lower the threshold toward 0.38 or choose a valid patch seed; preserve forest clearings, not map-sized voids |
| Grass stops on a straight line | scatter was authored as a rectangle, hard surface threshold, or short final LOD | use `createDensityWeightMask()` with slope/water/surface masks, cover every camera footprint, and verify active LOD counts |
| Cliff reads as repeated panels, mushrooms, teeth, or a fence | repeated assets expose the same face/crop or a small prop set became the primary silhouette | restore a continuous macro mass; rotate, tilt, scale, bury, crop, and overlap role-appropriate rocks until no screen-space repetition remains |
| Gaps expose terrain between rock modules | discrete assets were asked to form the landmass or secondary seam coverage was skipped | make terrain the continuous parent mass; bridge faces with recessed shelves, buttresses, and crevice slabs before dressing |
| Tan/sand-colored rocks alternate through a gray cliff | incompatible geology or sediment surface states were mixed for variety | choose one parent geology; reserve sand for the beach unless an explicit geological contact is authored |
| Cliff is a smooth bare wall above the sea | terrain base was treated as final art instead of a support surface | compose cliff lip, overlapping face/buttress rocks, crevices, and talus; retain triplanar rock treatment between instances |
| Beach is a flat empty color patch | texture maps are missing/not sampled or no backshore/swash dressing pass was done | verify albedo/normal/ARM bindings and readable repeat; add clustered rocks plus sparse dry-edge vegetation/story accents |
| One random tree sticks out of a meadow | object-by-object placement replaced biome composition | form a canopy/sapling/understory cluster or explicitly justify and frame it as a landmark tree |
| White/gray blotches pooling in valleys | white height fog | `heightFogColor` sky-blue (rule 3) |
| Fog invisible no matter the density | `heightFogFalloff` too small (fog dies above low ground) | falloff ≈ 400 for distance-led haze |
| Teal shards along cliff contours | water surface spanning steep banks (fixed in the water shader) | update ToonLab; keep terrain off the waterline (rule 9) |
| Flat lighting, no sun side | rig sun near-vertical or misaligned with sky | rule 2 |
| No shadows anywhere | nothing casts | rule 4 |
| Everything washes pale | fog density too high or translucent overlay covers the view | density ≈ 0.00055; inspect large alpha quads/discs before touching atmosphere |
| World edge visible | terrain ends at playable bounds | mountain rim (rule 11) |
| Camera staring into a hillside at spawn | unprobed spawn | rule 10 |
| Startup takes a minute | one unique StylizedTree per placement | use `StylizedForest` with a bounded reusable variant set |
| Mountains/terrain vanish when looked at directly | frustum culling misjudging displaced geometry | `mesh.frustumCulled = false` on terrain and scaled rock clones |
| Distant water bright/sharp band "cutting into" fogged mountains | surface missing the environment height-fog layer | update ToonLab (auto-wired via `setDistanceFog`); custom surfaces must join the layer |
| Giant white "iceberg" wedges at far shorelines | swash film climbing steep banks (fixed: clamped +0.5 m) | update ToonLab |
| Full-detail trees popping out of the haze in aerial views | LOD picked by horizontal distance | update ToonLab (true 3D distance) |
| Gold/orange trees with green shadows or pink crowns | canopy palette derivation broke on warm hues (fixed) | update ToonLab |
| Billboard trees upside down | render-target bakes are written top-down (fixed) | update ToonLab |
| Cliff walls read as flat untextured paint up close | planar terrain UVs stretch to nothing on walls | use warm banded `envTriplanarMap` + `triplanarDetail: 1`, scale ≈ 28, and lip highlights |
| Zigzag triangle pattern on cliff walls | per-vertex paint bands finer than the mesh grid; meadow/gold hue bleeding into stone | keep vertex-paint frequencies above the grid spacing; gate gold/meadow hard by slope |
| Herringbone/moire on close cliffs | ground and cliff maps projected together, scale too small, or contrast too high | let one dedicated cliff map own steep faces; use broad mipmapped bands at ~28 m scale |
| Trees look like broccoli with black bases | sparse crowns plus dark canopy/bark floor | keep signature `leafDensity >= 1`, warm bark, vegetation shadow floors, and the lifted proxy palette |
| Grass hides the character or becomes neon line noise | clump scale/density was increased blindly or the wrong preset was selected | restore the selected package preset and dimensions, inspect `field.bladeBudget()`, then tune coverage-positive clumps against the hero/gameplay cameras rather than applying a universal blades/m² number |
| Ring becomes a giant teal veil | filled plane/circle or no near-camera screen fade | fix the host-owned VFX with bounded geometry and a near-camera fade; do not invent a ToonLab import |
| Pink/orange particle fills the screen | petal/leaf crossed the near plane at full size | restore the ambient cutout near fade; do not disable it for screenshots |
| Flight trails look like rigid white poles | constant-width, long, always-on bespoke geometry | fix the host-owned trail with a speed gate, short lifetime, translucent taper, and near-camera safety |
| Water looks milky light blue | deep band too pale and soft reflection too strong | restore Call Me Sensei water tone; reflection <= 0.5 and detail normals/wave life enabled |
| Valley is uniformly lit | cloud-shadow field missing, weak, or not ticking | keep Call Me Sensei Weather and update the weather/cloud-shadow controllers before rendering |
| Aerial views gray and lifeless | one height-fog density for every camera | lower `heightFogDensity` for flyover/top-down and sync `water.setDistanceFog` + `forest.setDistanceFog` |
| ~20 fps in a big world | full-res meshes redrawn by water grab/depth/reflection passes | instanced volumetric forest proxies (pass `renderer`), hi/lo rock LOD by 3D distance, `userData.waterExclude`/`waterGrabExclude`, `water.settings.passes = { reflectionScale: 0.4, sceneColorScale: 0.6 }`, `?dpr=1` on retina |
| Character floats above / sinks into water when swimming | hand-rolled float height | chest at waterline via `water.getHeightAt`; calm swim default, fast stroke on Shift, `timeScale = clamp(speed/1.7, 0.75, 1.35)` |
| Character walks through rocks/trees | a solid root is unlabeled, explicitly non-solid, or collision readiness was skipped | label every solid root, let `createSceneStyleRuntime()` register it, call `styleRuntime.collision.assertReady()`, and use explicit metadata/custom or Rapier adapters when bounds are inappropriate |

## Verify like the labs do

Run the consumer app's tests/build, then render-test in a WebGPU-capable
browser after a cold reload. Wait for the app's ready flag and inspect fresh
screenshots from **all three** required views: Explore, Flyover, and Top-down.
Do not approve a vegetation/LOD change from only one view. Explicitly reject
screen-sized color shapes, flat crown walls, dirty speckles, black bases,
character-height grass, and visible LOD discontinuities; fix and repeat all
three views. Also inspect close cliff/tree/water, high-speed views, and every
new browser-console error. A passing build is not visual approval. Set
`document.body.dataset.worldReady = 'true'` when the first frame is live.
The complete reference implementation is `examples/outdoor-world/` in the
ToonLab repo — copy it, then swap in your own terrain and character.

For ToonLab itself, run `npm run verify:world-quality`,
`npm run verify:vegetation-shader`, `npm run verify:water`,
`npm run verify:vfxgen`, and `npm run build` before using the result.
