# Manufactured Material Lab fixtures

The active lab uses the shared ToonLab `LabChrome` workspace. The previous
one-off page is retained at `/manufactured-material-lab/legacy/`.

## Private local test cases

Keep non-redistributable fixtures under:

```text
assets-local/labs/manufactured-material/test-cases/<id>/model.glb
```

The retained local grid contains exactly these nine ids:

```text
apartment
beach
bicycle-collection
burned-out-cars
bus-station
dumpster
ground-floor-kit
living-room
streetcar
```

Optional fixture-specific references belong under:

```text
assets-local/labs/manufactured-material/references/<id>/
```

`assets-local/` is gitignored and served only by the Vite development bridge,
so these files cannot enter a production build.

## Other preview sources

- **Upload GLB** loads a self-contained model for the current browser session.
- **Your library** lists model imports previously saved from the Asset Browser.
- **Browse gallery** opens the open-asset browser; save a reviewed asset to
  the library, return to this lab, then choose **Refresh library**.
- **Redistributable samples** are committed under
  `public/manufactured-material-lab/cc0/` with provenance and license records.

The bundled `wooden_crate_01` fixture is CC0 from Poly Haven. Its single atlas
spans wood and metal, so it deliberately remains a mixed-atlas compatibility
case until the zones are split or receive a stable material-ID mask.

