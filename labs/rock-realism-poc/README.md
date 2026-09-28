# Realistic Rock Methodology Proof

> Repository-only experiment. This is not a public ToonLab API or a shipped
> generation preset.

This lab tests whether a geology-first procedural field can produce a convincing
realistic rock before ToonLab applies its anime treatment. It deliberately keeps
the four questions separate:

1. Does the authored field read as fractured granite across several seeds?
2. Does the quality survive ToonLab's existing QEF surface-nets extractor?
3. How much of the close-range read comes from detailed normals and surface
   response rather than silhouette geometry?
4. Is the result stable enough to justify a proper high-to-low bake compiler?

The default path uses the Vibe3D granite field and extractor at a modest runtime
resolution. `?mesher=toonlab` evaluates the same field through ToonLab's current
extractor, making it an integration test instead of a subjective comparison
between unrelated presets.

`?pipeline=compiled` loads the source project's checked-in topology,
object-normal/AO/height/curvature bake, shared micro-detail page, and material
for seeds 1–7. It is the control for the complete methodology. Run
`node scripts/prepare-rock-realism-poc.mjs` once before opening that mode; the
large disposable artifacts stay in the gitignored `assets-local/` tree.

Useful URLs while the ToonLab Vite server is running:

```text
/labs/rock-realism-poc/?seed=1&mesher=vibe&material=realistic&view=hero
/labs/rock-realism-poc/?seed=2&mesher=toonlab&material=realistic&view=hero
/labs/rock-realism-poc/?seed=3&mesher=vibe&material=clay&view=ortho
/labs/rock-realism-poc/?seed=1&mesher=vibe&material=wire&view=hero
/labs/rock-realism-poc/?pipeline=compiled&seed=1&material=realistic&view=hero
```

Supported query values:

- `seed=1..9999`
- `pipeline=field|compiled` (`compiled` has the checked-in seeds 1–7)
- `resolution=32..128` (default `64`)
- `mesher=vibe|toonlab`
- `material=realistic|clay|wire`
- `detailNormals=0|1`
- `view=hero|close|ortho|top`
- `hud=0|1`

Run the deterministic structural check with:

```bash
node scripts/verify-rock-realism-poc.mjs
```

Capture the review matrix while `npm run dev -- --port 5178` is running:

```bash
ROCK_REALISM_URL=http://localhost:5178 node scripts/capture-rock-realism-poc.mjs
```

## Acceptance gate

Do not call the methodology proven from one attractive seed. Seeds 1, 2, and 3
must retain a granite read under realistic and neutral clay presentation. The
hero, close, orthographic, and wireframe views must show stable contact,
intentional joint hierarchy, no floating components, no obviously aliased
noise, and no topology defect that controls the silhouette.

This spike does **not** implement a ToonLab-owned high-to-low UV bake. Its
compiled control renders Vibe3D's prebuilt bake so we can isolate the value of
that stage before rebuilding it. Close-range parity with a scanned asset is not
claimed until ToonLab can trace object-normal, height, AO, curvature, and region
pages from a detailed field onto its own reduced mesh.

See [RESULTS.md](./RESULTS.md) for the current verdict and
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for provenance.
