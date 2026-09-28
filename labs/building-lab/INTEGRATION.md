# Building Lab — integration notes

Building Lab is self-contained under `building-lab/` + `labs/building-lab/`
and works on the dev server as-is (`http://localhost:5177/building-lab/`).
This workstream does not edit shared/config files; the touches below belong
to you. NOTE: as of this writing, items 1 and 2 are already present in the
working tree (applied alongside the prop-lab integration) — treat them as
"verify", not "add".

## 1. vite.config.js — production build entry

`rollupOptions.input` needs the page, next to `propLab`:

```js
buildingLab: resolve(__dirname, 'building-lab/index.html'),
```

(`building-lab/thumbs.html` is dev-only, same as `debris-lab/thumbs.html` —
do not add it to the build inputs.)

## 2. labs/shared/sceneHub.js — hub entry

- `SCENE_HUB_OPTIONS` (after the `propLab` entry):

  ```js
  Object.freeze({
    id: 'buildingLab',
    label: 'Building Lab',
    path: '/building-lab/',
    search: '',
  }),
  ```

- `resolveSceneHubId()` (with the other standalone-page checks):

  ```js
  if (pathname.startsWith('/building-lab')) return 'buildingLab';
  ```

Building Lab's scene select (`labs/building-lab/ui/App.jsx`, `TopBar`) only
prepends a local "Building Lab" option while the hub does NOT list
`buildingLab`, so it works — without duplicate entries — whether or not this
step is applied.

## 3. package.json — thumbs script (optional convenience, not yet applied)

```json
"thumbs:building": "node scripts/generate-building-thumbs.mjs"
```

The script expects an already-running dev server (`BASE_URL`, default
`http://localhost:5177`) and writes `labs/building-lab/ui/thumbs/*.webp`
(preset ids with slashes flattened to dashes).

## Upstream finding (src/buildinggen — intentionally not fixed here)

`buildingMesh.js` `slopeQuads` winds the +across roof slope facing DOWN.
At hi detail the up-facing underside slab masks it (you see the underside,
shade 0.72, instead of the top, shade 1.0); at LO detail there is no
underside, so with the single-sided role materials the slope disappears
when viewed from above (gable/pagoda lose one plane, shed loses its whole
roof). `labs/building-lab/engine/buildingEngine.js` carries a preview-side
shim (`fixLoRoofWinding`) that flips downward-facing lo roof triangles so
the LOD preview reads as intended — delete the shim once `slopeQuads` winds
the +across slope upward. World placement (`PropInstances` far pools) shows
the same artifact at distance until the mesher is fixed. The numeric
`verify-buildinggen.mjs` suite does not catch this (it checks budgets and
determinism, not facing).

## Shared-code notes (no changes required)

- `labs/shared/rendererFactory.js`, `labs/shared/ui/*`,
  `labs/shared/download.js`, `labs/shared/labParams.js` are consumed as-is.
- `src/buildinggen/*` and `src/environment/*` are consumed as-is; run
  `node scripts/verify-buildinggen.mjs` after any buildinggen change.
- Building role materials are cache-owned inside `buildingRecipe.js` (five
  shared materials serve every build) — the lab never disposes them, only
  per-build geometry and the converted environment materials.
