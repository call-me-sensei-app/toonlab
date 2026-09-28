# Rock geology v2 — provider-assisted template bridge

> **Status:** one technically qualified hoodoo process candidate; visual mass-production approval still requires the developer checkpoint  
> **Pilot:** `hoodoo-caprock-claron-v31`  
> **Provider adapters tested:** Tripo H3.1 `v3.1-20260211` and Meshy 7  
> **Canonical authority:** ToonLab control cage, semantic landmarks, admitted nature evidence, and deterministic recipe

This bridge adds optional image-to-3D and scan-derived donors to the ToonLab rock
compiler without turning either donor into the source of truth. A provider result
may accelerate broad form or contribute recoverable detail, but it is always
audited, repaired, converted into an editable ToonLab template, and regenerated
through ToonLab-owned bake and runtime packaging stages.

## What happened to Checkpoints 0–7

None of C0–C7 is discarded.

| Checkpoint | Continuing responsibility | Provider relationship |
| --- | --- | --- |
| C0 | product contract, scale/rebuild behavior, determinism | provider output cannot weaken the contract |
| C1 | geology research, evidence, licensing, method boundaries | provider has no geology authority |
| C2 | schemas, dimensions, compatibility rules, provenance | provider request/result becomes a versioned adapter record |
| C3 | deterministic physical fields and formation coordinates | fields remain the procedural variation source |
| C4–C5 | family shape, fractures, weathering, topology | provider may suggest form; ToonLab reconstructs and validates it |
| C6 | canonical identity, landmarks, semantic edit regions | control cage and landmarks govern every variant |
| C7 | dense-to-low derivation, UVs, maps, residuals, packing | provider-derived geometry enters C7 only after repair/admission |

The provider bridge is an optional C8 input adapter. The offline compiler still
works when no provider is available. Provider bytes are never the only record
from which an approved asset can be understood, edited, or regenerated.

## Frozen process candidate

1. Admit an exact nature source, rights record, geology authority, morphology
   rationale, scale evidence, and a fixed front/rear/left/right/top/bottom sheet.
2. Write the family identity contract and forbidden drift. Build a ToonLab
   control cage with named landmarks and semantic edit weights.
3. Optionally request H3.1 or Meshy 7 as an anchor/detail donor. Persist exact inputs,
   provider/model version, task ID, request settings, output hashes, and timing.
4. Audit the raw output. Never accept provider topology automatically. The
   hoodoo raw output had 1,990,102 triangles, 117 components, and 42,506 boundary
   edges, so it was trace/detail material rather than production topology.
5. Fuse/remesh into one watertight high source, then reassert the ToonLab control
   cage, subtype landmarks, footprint, dimensions, and orientation. Preserve a
   numbered editable `.blend` checkpoint.
6. Apply procedural or manual sculpt changes through the same semantic template.
   Geometry-changing edits invalidate downstream LODs and bakes and trigger a
   deterministic rebuild. Color-only changes may keep topology but still require
   re-export and package audit.
7. Optionally admit a provenance-bound CC0 surface donor. Recolor it to the
   formation palette; it may supply micro-height/normal/roughness variation but
   may not change geological identity.
8. Bake independent AO-free Base Color, tangent NormalGL, Roughness, AO, and
   `HeightMicro`. Keep signed high-to-LOD geometric residual in a separate map.
9. Derive each visual LOD from the approved high source, preserve landmarks,
   generate separate collision, pack runtime maps, export GLBs, and inspect the
   actual bytes.
10. Present nature, six-view, before/after, top/bottom, close-up, signed-residual,
    and mobile-near/far evidence. Technical and visual decisions remain separate.

## Pilot measurements

| Stage | Measured result |
| --- | --- |
| H3.1 request | 2,000,000-face request; 1,990,102-triangle output; 12m 43s |
| Meshy 7 comparison | 1,991,204 triangles; 229 components; 58,038 boundary edges; about 3m 35s; 35 credits |
| watertight high repair | 2,444,950 triangles; one component; zero boundary edges; 2.673s |
| editable-template proof | two seeded 2K variants in 63.55s, about 31.8s each |
| portable surface bake | 4K Base/Normal/Roughness/HeightMicro in 17.17s total; numerical PBR audit pass |
| signed residual bake | 2K four-pass bake in 5.63s; 0 clipped; 0.0503% misses |
| runtime ladder | 180k / 60k / 20k / 6k triangles; collision 500 |
| provider-free runtime work | map packing about 10s; package/render/export about 12.6s |

These are calibration measurements for one 3.2 m hoodoo on the tested M4 Pro,
not universal service-level guarantees. Human morphology and close-up review is
the dominant cost.

H3.1 was retained as the default donor for this candidate because its raw result
had fewer disconnected components and boundary edges (117/42,506 versus Meshy
7's 229/58,038). Meshy 7 was substantially faster and delivered 8K/4K PBR maps,
but its raw topology still failed production gates and its texture showed the
same non-geological repetition problem. This is a one-object comparison, not a
universal provider ranking; the representative family calibration may select
Meshy where it clearly wins after identical repair and ToonLab rebaking.

## Scale, editing, and rebaking

- Changing requested physical dimensions inside ToonLab recompiles geometry,
  geological frequencies, UV density, LODs, collision, and bakes.
- Manual Blender sculpting starts from the saved high/template checkpoint. After
  the sculpt is accepted, the same downstream compiler runs again.
- Seeded procedural variants modify semantic regions and remain reproducible.
- Scaling an exported asset in an external scene does not rebake. A modest
  uniform runtime scale envelope may be qualified per asset; strong non-uniform
  scaling or large size changes must return to ToonLab or a future engine plugin.

## Mobile and SPOM boundary

Real geometry owns family identity, major ledges, fractures, arches, undercuts,
caprocks, support, and the recognizable silhouette. Normal maps own microstructure.
`HeightMicro` owns bounded surface relief. The signed residual preserves the
recoverable high-to-LOD displacement difference.

Silhouette/prism POM may later consume approved height data as an optional mobile
LOD representation. It is not a source-generation technique and cannot replace
real topology for caves, deep undercuts, detached blocks, contact, collision, or
reliable depth/shadow behavior. It must win a four-way target-device comparison
against low+normal, conventional POM, and higher-triangle ground truth before use.

## Production strategy for 892 baselines

The 100 source-bound subtype references define 892 separately reviewed baseline
slots. Seeds may generate variants after a baseline is approved; they do not turn
one reviewed object into several independently approved baseline shapes.

Using H3.1 for all 892 is neither necessary nor efficient. At the measured 763s
per provider job, the theoretical provider time is about 189 hours sequential or
63 hours at three concurrent jobs, before retries and review. A hybrid plan uses
provider anchors only where they materially improve a difficult family. One
hundred anchors would take about 7.1 theoretical provider-hours at concurrency
three and more realistically 8–12 hours with overhead and retries.

After this process candidate receives visual approval, production workers should
own disjoint subtype/slot output directories and immutable inputs. Start visible
Blender production at two concurrent isolated jobs; the existing smoke test
proved overlap for two small jobs, not high-resolution production scalability.
Use one heavy voxel/bake job at a time until representative memory/thermal
benchmarks justify more. Root continues later checkpoints while workers generate
drafts, but no draft advances without independent topology, identity, bake,
mobile, hash, and visual gates.

The 100 artifact reference packages currently pass source/rights and visual
audits. Before release, every package used by the compiler must also be promoted
into the versioned runtime inspiration registry or carried through an immutable
artifact-to-recipe admission record. Missing promotion is fail-closed; workers
may not silently invent evidence.

## Current decision

- Technical process: **pass** for this pilot.
- Visual improvement over the earlier procedural bake: **pass**.
- Automatic Megascans-equivalence claim: **not proven**.
- Mass production: **blocked on the developer visual checkpoint and a small
  representative multi-family calibration**, not on the mechanics of Blender,
  rebaking, LOD generation, or GLB packaging.

Primary evidence lives under
`artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/`.
