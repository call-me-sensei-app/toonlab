# Asset attribution

Code is MIT-licensed by Hyperbond Studio PTE. LTD. (see LICENSE). The assets bundled in this repository:

## Bundled assets

| Asset | Location | License | Source |
|---|---|---|---|
| Mannequin character (45 embedded animation clips) | `public/characters/mannequin.glb` | CC0 1.0 | [Quaternius — Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), recolored to neutral grays. See `public/characters/LICENSE.md`. |
| Landscape textures (grassy-land, land, mountain, rock, sand, tree-trunk) | `labs/shared/textures/` | CC0 1.0 | First-party (created by the toonlab authors), dedicated to the public domain. |
| Water Lab sea fern model | `public/water-lab/cc0/quaternius/fern-1.glb` | CC0 1.0 | [Quaternius — Fern 1](https://quaternius.com), selected through the ToonLab catalog. |
| Water Lab Coast Sand 01 texture set | `public/water-lab/cc0/polyhaven/` | CC0 1.0 | [Rob Tuytel — Coast Sand 01, Poly Haven](https://polyhaven.com/a/coast_sand_01), selected through the [ToonLab catalog](https://toonlab.io/asset/polyhaven:coast_sand_01). |
| City street models (buildings, roads, cars, street props — 28 models) | `public/props/cc0/kaykit-city/` | CC0 1.0 | [Kay Lousberg — KayKit City Builder Bits](https://kaylousberg.com). Attribution optional under CC0; credited with thanks. See the bundled `LICENSE.txt`. |
| Furniture models (tables, chairs, couch, lamps, shelves — 17 models) | `public/props/cc0/kaykit-furniture/` | CC0 1.0 | [Kay Lousberg — KayKit Furniture Bits](https://kaylousberg.com). Attribution optional under CC0; credited with thanks. See the bundled `LICENSE.txt`. |
| Manufactured Material Lab Wooden Crate 01 sample | `public/manufactured-material-lab/cc0/polyhaven/wooden_crate_01/` | CC0 1.0 | [James Ray Cock — Wooden Crate 01, Poly Haven](https://polyhaven.com/a/wooden_crate_01). See the bundled manifest and `LICENSE.txt`. |
| Environment Lab Wood Floor texture | `public/environments/cc0/polyhaven/wood-floor-diff-1k.jpg` | CC0 1.0 | [Dimitrios Savva — Wood Floor, Poly Haven](https://polyhaven.com/a/wood_floor) |
| Environment Lab Painted Plaster Wall texture | `public/environments/cc0/polyhaven/painted-plaster-wall-diff-1k.jpg` | CC0 1.0 | [Amal Kumar — Painted Plaster Wall, Poly Haven](https://polyhaven.com/a/painted_plaster_wall) |
| Environment Lab photoscanned furniture (Sofa 02, Modern Arm Chair 01, Round Wooden Table 01, Classic Console 01, Steel Frame Shelves 01, Potted Plant 04) | `public/environments/cc0/polyhaven/models/` | CC0 1.0 | [Poly Haven models](https://polyhaven.com/models) (1k glTF), per-asset credits on each asset page |
| Environment Lab museum scans (baluster vase F1980.190-.194; Colonoware pot) | `public/environments/cc0/smithsonian/` | CC0 1.0 | [Smithsonian Open Access 3D](https://3d.si.edu), selected through the [ToonLab catalog](https://toonlab.io/gallery?src=smithsonian) |
| Draco + Basis decoders (model decompression) | `public/draco/`, `public/basis/` | Apache 2.0 | [google/draco](https://github.com/google/draco), [BinomialLLC/basis_universal](https://github.com/BinomialLLC/basis_universal) — bundled three.js decoder builds |

Everything else that renders — water, sky, grass, flowers, trees, foliage,
splashes, post-processing — is procedural code.

## Not bundled (bring your own)

The labs can additionally load content from a gitignored `assets-local/`
folder that is **not** part of this repository:

- **Mixamo animation clips** (`assets-local/animations/*.fbx`) — the retarget
  pipeline plays Adobe Mixamo clips on any humanoid model. Download clips
  with your own Adobe account from [mixamo.com](https://www.mixamo.com) and
  drop them in; Adobe's terms do not permit us to redistribute the files.
  Without them, models fall back to their own embedded clips (the bundled
  mannequin covers idle/walk/run/jump/swim/tread natively).
- **Your models** (`assets-local/models/`) — PMX/VRM/GLB/FBX/OBJ characters
  for testing; or pass any hosted URL via the HUD's Model URL field /
  `?model=`. Make sure you have the rights to any model you load.
- **Scanned props/environments** (`assets-local/environments/`) — licensed
  photoscan packs can be dropped in for the demo scenes;
  the scenes render procedural stand-ins when they're absent.

## Recommended free sources

The machine-readable version of this list (license facts, integration level,
quality tier, enable/disable flags) is `src/assetlib/sources.js`; the Asset
Browser lab surfaces it.

- [Quaternius](https://quaternius.com) — CC0 models + the Universal
  Animation Library (v1 and v2 free tiers); most of the catalog is
  searchable via Poly Pizza.
- [Poly Haven](https://polyhaven.com) — CC0 textures/HDRIs/models.
- [Kenney](https://kenney.nl) — CC0 game assets (no file API; manual import).
- [KayKit](https://kaylousberg.com) — CC0 stylized low-poly packs (city,
  furniture, dungeon, characters …) on GitHub; integrated in the Asset
  Browser (disabled by default — below the platform quality bar).
  Attribution optional; credited with thanks.
- [Open Source 3D Assets](https://opensource3dassets.com) — keyless CC0
  registry (Polygonal Mind collections); integrated, pending quality review.
- [Poly Pizza](https://poly.pizza) — low-poly aggregator, CC0/CC-BY
  (BYO free API key).
- [Smithsonian 3D Open Access](https://3d.si.edu) — museum scans; only
  records explicitly marked CC0.
- [Sketchfab CC0 search](https://sketchfab.com/search?features=downloadable&licenses=cc0&type=models)
  — download manually (their download API is per-user OAuth with branding
  terms; deliberately not automated).
- [The Base Mesh](https://thebasemesh.com) — CC0 base meshes (manual import).
- [3DTextures.me](https://3dtextures.me) — CC0 stylized materials
  (manual import).
- [TextureCan](https://www.texturecan.com) — CC0 textures (manual import).
- [ShareTextures](https://www.sharetextures.com) — CC0 files, but their
  platform terms prohibit automated downloads/hotlinking — browse manually
  only, never wire an adapter.
- [OpenGameArt](https://opengameart.org) — filter by CC0/CC-BY.
- [Openverse](https://openverse.org) — openly licensed images/audio
  (per-record license).
- [Freesound](https://freesound.org) — sounds; free API tier is
  non-commercial.
- [VRoid Hub](https://hub.vroid.com) — VRM avatars (check per-model terms).
