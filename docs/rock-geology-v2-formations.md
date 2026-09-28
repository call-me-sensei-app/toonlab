# Rock geology v2 — continuous formation compiler (C9)

Status: repository-only experimental implementation. This is not a deep-package
API and does not widen the shipping `rockgen` contract.

## Why this exists

A mountain is not an enlarged boulder and a cliff is not a row of unrelated
props. C9 represents an outcrop, cliff, ridge, or massif as one parent scalar
and structural field. Render/streaming modules are deterministic crops of that
field. Structural coordinates, contacts, material identifiers, material phase,
and source lineage are evaluated in parent world space and never restart at a
module origin.

## Frozen formation contract

- The parent `RockRecipe` remains the source for strike, dip, chronology,
  lithology, fabrics, fracture history, and material properties.
- `compileFormationProgram()` creates an integer streaming grid and 10–200 m
  module records with core bounds, overlapping crop bounds, buried bases/backs,
  four deterministic sockets, neighbor identifiers, and stable streaming keys.
- Every module is one of slab, wedge, ledge, crown, pillar, buttress, or talus.
  Roles describe assembly intent; they do not select unrelated shape generators.
- `createFormationField()` creates the parent terrain mass. Module fields use an
  intersection crop around that same evaluator. The overlap exists to hide the
  closed crop wall below/behind its neighbor; it never changes the parent field.
- Talus modules retain source formation, lithology, and source-module lineage.
- Crowns remain attached to the continuous buried parent mass. Unsupported
  overhangs are not silently accepted; future authored overhangs must pass a
  support graph or record an explicit reviewed art override.

## Current proof targets

The verifier covers a steeply dipping stratified ridge, folded ridge, finite
fault scarp, shattered alpine ridge, exfoliation massif, volcanic massif, and
karst tower field. Every target is bound to the exact source packages accepted
at C8. The source packages defend geological category and silhouette; generated
hidden views remain hypotheses.

## Verification

Run:

```sh
node scripts/verify-rock-geology-v2-formations.mjs
```

The check recompiles every target, compares program/report identities, samples
all shared seams, checks exact material and phase identity, rejects repeated crop
signatures, validates all seven module roles, checks talus lineage and crown
support, measures compile/field budgets, and extracts a closed one-component
audit mesh. It writes programs, reports, meshes, parent-field slices, module
graphs, and a fail-closed visual gate under
`artifacts/research/rock-geology-v2/checkpoint-09-formations`.

The technical pass does not approve the visual gate or claim UE performance.
Top-down, flyover, base-of-cliff, silhouette, and gameplay captures require
human review. UE 5.8 streaming and frame/memory budgets remain C12 evidence.
