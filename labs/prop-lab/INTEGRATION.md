# Prop Lab — integration notes

Prop Lab is self-contained under `prop-lab/` + `labs/prop-lab/` and works on
the dev server as-is (`http://localhost:5177/prop-lab/`). The following
touches to EXISTING files were intentionally left to you (this workstream
does not edit shared/config files):

## 1. vite.config.js — production build entry

Add the page to `rollupOptions.input`, next to `debrisLab`:

```js
propLab: resolve(__dirname, 'prop-lab/index.html'),
```

(`prop-lab/thumbs.html` is dev-only, same as `debris-lab/thumbs.html` — do
not add it to the build inputs.)

## 2. labs/shared/sceneHub.js — hub entry

Prop Lab's scene select renders a local "Prop Lab" option ahead of
`SCENE_HUB_OPTIONS` so the current page is representable; other labs won't
list Prop Lab until the hub knows about it:

- Add to `SCENE_HUB_OPTIONS` (after the `debrisLab` entry):

  ```js
  Object.freeze({
    id: 'propLab',
    label: 'Prop Lab',
    path: '/prop-lab/',
    search: '',
  }),
  ```

- Add to `resolveSceneHubId()` (with the other standalone-page checks):

  ```js
  if (pathname.startsWith('/prop-lab')) return 'propLab';
  ```

Once both are in, the local option in `labs/prop-lab/ui/App.jsx` (`TopBar`)
can be dropped in favor of the hub list, exactly like debris-lab.

## 3. package.json — thumbs script (optional convenience)

```json
"thumbs:prop": "node scripts/generate-prop-thumbs.mjs"
```

The script expects an already-running dev server (`BASE_URL`, default
`http://localhost:5177`) and writes `labs/prop-lab/ui/thumbs/*.webp`
(preset ids with slashes flattened to dashes).

## Shared-code notes (no changes required)

- `labs/shared/rendererFactory.js`, `labs/shared/ui/*`,
  `labs/shared/download.js`, `labs/shared/labParams.js` are consumed as-is.
- `src/propgen/*` and `src/environment/*` are consumed as-is; run
  `node scripts/verify-propgen.mjs` after any propgen change.
