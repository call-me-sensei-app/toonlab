---
name: karst-cliff-construction
description: Experimental research guidance for assembling a stylized cliff, gorge, karst tower, or sea stack from catalog rocks, including silhouette selection, parent geology, transform grammar, and measurable rubble-pile rejection gates; not a supported automatic cliff builder.
---

# Experimental cliff construction from catalog rocks

This is retained as research and review guidance. ToonLab can find rocks,
report their dimensions/taxonomy, and shade supplied geometry, but neither the
package nor an LLM is currently qualified to turn those assets into a polished
cliff automatically. Use it only for an explicit experiment, record every
manual placement/transform decision, and do not present success as a stable
one-shot feature.

This is the assembly craft that sits between `rockgen` (which makes a rock) and
the `outdoor-world` skill (which owns the whole scene). Read
`../outdoor-world/SKILL.md` first for the landform-before-props ordering and the
rejection gates; this skill is how you actually execute the rock layer. Read
the agent-neutral
[geology playbook](../../../references/geology-playbook.md) for the compact
morphology, course, burial, and verification reference.

Everything here was derived by building a reference-driven karst gorge from the
full catalog available during qualification and having it rejected
several times. Catalog contents change; query the connected OSS or Pro MCP
surface instead of assuming a fixed asset count or frozen family membership.
The failure modes are listed as prominently as the method, because they are
what cost the time.

## The single most important rule

**A cliff is one mass. Individual rocks must not be legible as individual
rocks.**

Squint at the frame from the hero camera. If you can pick out separate boulders
in the wall face, the formation has failed, no matter how good the rocks are or
how correct the metrics look. Every rule below exists to serve that one read.

The characteristic failure is an **angular rubble pile**: many modules at many
orientations, each individually readable, with a sawtooth crest. It looks like
quarry spoil. It happens because tumbling every rock feels like variety, and
because an anti-repetition gate seems to demand it. It does not.

## Selection: look, do not read tags

**Family names do not guarantee silhouette.** In the tested catalog snapshot,
`column-field` contains no columnar geometry at all; `broad-wall` is mostly
hourglass pedestals; the only assets that genuinely read as vertical fluting
live in `vertical-face`. Selecting by `familyId` or by tag produces the wrong
formation when the current previews disagree with the label.

So: **render contact sheets and choose visually.** Download the catalog
thumbnails, lay them out in a labelled grid per family, and look at every one
before choosing. Better still, render the actual GLBs under a single flat
material at the intended camera azimuth — thumbnails show baked material colour,
which is discarded at runtime (see below), so silhouette is the only thing that
matters and the thumbnail can mislead you about it.

Budget an hour for this. It is the highest-leverage hour in the whole job.

**Use the published donor dimensions.** Current OSS and Pro rock search results
include positive `dimensionsMeters.width`, `.height`, and `.depth`. Reject a
record with missing, zero, negative, or axis-ambiguous dimensions before
download. Load a finalist only to verify silhouette/material compatibility,
not to discover its size. Drive placement from **target metres**, never from a
raw scale multiplier. A project helper such as `place({ height: 40 })` is
reviewable; `scale: 6.3` is not a ToonLab contract or an art-direction decision.

## Geology: one parent rock, many catalog families

A formation must read as **one lithology**. Limestone, sandstone and granite do
not alternate between adjacent modules unless the level authors a readable fault.

This can conflict with selecting by silhouette, because useful shapes may span
families with different `taxonomy.geology`. Treat geology as meaningful search
metadata, but allow an intentional stylized donor override when the visible
morphology is compatible and one material treatment makes the formation read
as a deliberate parent rock. Record that override; never imply that replacing
albedo changes the source mesh's physical morphology.

So the working method is:

1. Select every rock by **role and silhouette**, ignoring its geology tag.
2. Apply the rock shader to the whole formation root with one settings object.
3. Verify that every included part reports the same intended texture source and
   material profile. One root call is the safest way to prevent call-site drift;
   repeated calls with byte-identical settings are visually equivalent.

Two consequences worth knowing before you are surprised by them:

- Baked green grass caps on some catalog rocks **disappear** under `replace`.
  Re-create caps deliberately, via the shader's grass layer or via vegetation.
- Per-part calls invite accidental settings drift. Prefer the formation root
  unless a deliberately distinct lithology needs its own documented pass.

For a genuinely different stone in the same frame — a quarried quay against a
natural cliff — mark those meshes `userData.rockShaderExclude = true`, run the
main pass, then clear the flag and run a second pass over just that group.
Order matters: setting the flag before your own pass silently disables it.

### Matching geology to real morphology

Choose donors by what the landform actually does, not by name:

| Landform feature | What to look for |
|---|---|
| Rillenkarren (vertical dissolution runnels on karst) | Parallel vertical prism relief — columnar-basalt donors read as this almost exactly |
| Broad fluted wall envelope | Barrel-curved faces with wide vertical creases |
| Bedding partings | Donors with true horizontal lips and shelf stacks |
| Undercut karst tower | Inverted flares — wider at mid-height than at the base |
| Solution notch at the waterline | River-worn blocks with a rounded overhanging lip |
| Collapse product below a wall | Jointed angular blocks, tumbled freely — the one place tumbling is correct |

## The transform grammar

Per role, and these ranges are the difference between a landform and a pile:

**Primary wall faces.** Share a near-common up axis and a near-common facing.
Yaw varies the silhouette *edge*, not the rock's orientation. Pitch and roll
near zero — fluting is gravity-parallel, and a tilted flute reads as a mistake.
Bury 30–60 % of module depth. Present the face, not the corners.

**Corners and terminations.** Yaw is set by the turn, not jittered. Turn the
broad mass toward the coastline change and bury the return face into its
neighbour so it never shows a free edge.

**Shelves and bedding ledges.** Rotate a useful plane upward, crop the rear into
the parent mass, and support the underside with a face or buttress so the
overhang is a shadowed recess rather than a lit floating slab.

**Crevice wedges.** The one primary role where roll is large — 8–15° — because a
wedge is *supposed* to be jammed at an angle.

**Talus and waterline blocks.** Free three-axis rotation, 0.7–1.4 non-uniform
scale, always resting in contact with the surface below.

### Scale discipline

**Cap the uniform scale, and audit it.** Blowing a 6 m donor up 22× is what makes
a wall read as stretched rather than stacked: the projected texture smears, the
silhouette loses its authored detail, and one module tries to do the work of a
course. Prefer more modules near native size over fewer giant ones.

Instrument it. Report per-role mean and max uniform scale and the worst axis
ratio, and warn loudly when a role exceeds its ceiling, so a wall module cannot
silently stretch a donor. A run that measured `mean 6.35, max 22.3, worst axis
ratio 4.08` was visibly stretched and nobody noticed until an art director said
"why is it stretched".

### Placement helpers must not reinterpret intent

An oversized authored wall module must never silently become a jittered stack.
Make any over-ceiling substitution **explicit and refusable**: accept an option
such as `onOverCeiling: 'reject' | 'shrink' | 'stack'`, default load-bearing wall
roles to `reject`, and return/report the actual strategy and placement count.
Reserve `stack` for an intentional course plan; reserve tumbling for talus.

Keep course variation separate from scatter variation. Load-bearing faces use
`courseJitter: 0` unless the author requests a measured, small range; they must
not inherit free yaw/roll jitter from a rubble scatter helper. Likewise, label
Euler rotations by their local-axis order. A field named `pitch` is not a
world-space lean after yaw. Prefer a world-space contract such as
`leanInto: { direction, angle }`, or document and test the exact local axis.

## Anti-repetition, correctly understood

The gate is **recognizable repetition**, not a repeated asset id. Reusing a good
modular rock is normal environment modelling.

Two copies of one id must not present the same camera-facing silhouette. Satisfy
at least three of: yaw differs ≥ 25° against the camera-facing normal; different
tier; uniform scale differs ≥ 25 %; burial fraction differs ≥ 8 points so a
different portion of the outline survives; different overlapping neighbour.

Absolute prohibitions: no twins within ~35 m at the same tier; no regular
spacing interval; no kit rows.

**Audit it, but do not trust the audit.** A placement-based audit scores
positions and transforms — it cannot see the rendered silhouette. Zero offences
and a rubble pile are entirely compatible. The audit is a floor, not approval.

## Structural coherence

**Bedding must be continuous across formations.** Beds are the same beds. Derive
one elevation ladder for the whole scene — ideally from the terrain's own
terracing, so rock and parent mass agree — and place every bedding ledge on it.
Bands that line up across neighbouring towers at equal elevation is the single
detail that sells a karst formation.

**Publish it.** The wall that computes the ladder should expose it, and every
other formation should read it rather than re-deriving. Be aware of build order:
if a composer builds parts in sequence, a later part cannot read an earlier
part's published values through a context object that is only assigned after the
whole composer returns. Pass shared values through the composer explicitly, or
have each part fall back to a documented constant and log which path ran.

Publish a shared **face plane** as well as the terrain/height envelope. Shelves,
bridges, falls, vegetation lips, and sibling wall modules must read the same
world-space surface contract instead of hard-coding a standoff against a wall
revision that can move later.

**Bridge every seam.** After the primary masses, rasterise their footprints,
find pairs with a traceable boundary, and wedge shelves, buttresses and crevice
slabs across them, each with a corbel tucked beneath so the overhang is a
shadowed recess. Terrain must never show through a gap between rocks.

**Do not let painted detail do geometry's job.** Horizontal stratification drawn
into a projected texture becomes a stretched line on a scaled rock, and thin
crack layers alias into dashed "stitched" lines at any realistic tile
resolution. Deliver bedding as **stacked silhouettes** — real courses with real
overhangs — and reserve the texture for surface grain.

## Build order

Do not start by scattering rocks.

1. **Macro landform.** A continuous heightfield with the full silhouette:
   headlands, bays, terraces, the channel, the bed. Approve it untextured. If
   the macro silhouette is wrong, no rock dressing saves it.
2. **Primary structure.** Large faces at structural events only — noses,
   re-entrants, terminations, terrace breaks. Subordinate to the macro mass.
3. **Secondary structure.** Bridging shelves, buttresses, crevice wedges.
4. **Tertiary dressing.** Waterline notch, submerged continuation, minimal
   talus, story detail.

Talus quantity is a geology decision, not a dressing preference. A dissolution
gorge has almost none; a frost-shattered alpine face has fans. An evenly spread
scree carpet is always wrong.

## Verification

Numeric checks reject obvious failure; only looking can approve.

- **Isolate before blaming.** Render subsystems alone — with their light rig, or
  you get black — to attribute a defect. A "flowing water" texture on the cliffs
  turned out to be the terrain's ground shader, not the waterfalls, and only an
  isolation capture settled it.
- **Scan for outliers.** Traverse the scene for meshes above a size threshold and
  print path, world extent and position. This catches the 104 m slab damming a
  72 m channel that nobody sees because it reads as "background".
- **Squint at the silhouette first**, before texture, before colour. One mass or
  a pile.
- **Judge from every approved camera**: hero, wide, close, flyover, top-down. A
  formation can read as one mass from the hero and as a kit row from above.
- **Settle the scene before screenshotting.** Modules resolve async work — GLB
  loads, render passes — after their factory returns. Wait for a stable scene
  graph, not a fixed frame count, or you will review a frame with subsystems
  missing while the manifest claims they are present.

## Performance notes that shape the art

- The rock shader creates a **material per mesh**, so instancing is unavailable
  and every tertiary rock costs a draw call. Budget the tertiary layer.
- Catalog GLBs carry baked LODs; use the higher indices for distant modules.
- Catalog GLBs can require KTX2/Draco decoders. Create one shared transcoder set
  with `createModelAssetTranscoders({ decoderBasePath, renderer })`, pass it to
  every `loadModelAsset(url, { transcoders })` call, and dispose it once after
  all model loads. Do not construct decoder/transcoder resources per rock.
