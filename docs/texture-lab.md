# Texture Lab and texgen

Texture Lab (`/texture-lab/`) generates **seamless procedural PBR textures
for anything** — stone, ground, wood, metal, fabric, ceramics, creatures,
liquids, sci-fi panels, stylized prints — entirely on the CPU, deterministic
per seed, with zero image assets. The generator ships as the
`@call-me-sensei/toonlab/texgen` cluster so you can bake the same maps in
your own app or in Node.

## The lab

- **Gallery** — 60+ built-in material presets across ten categories, each
  thumbnail baked live by the real generator. Your saved textures appear in
  *Your library*.
- **Pattern stage** — the base generator (25 tileable patterns: fbm, ridged,
  billow, turbulence, worley/voronoi variants, cracks, caustics, speckle,
  bricks, tiles, hex, checker, grid, stripes, chevron, weave, basket weave,
  scales, dots, marble, wood grain, …) plus two blendable detail layers.
  Sliders irrelevant to the selected pattern hide automatically.
- **Color stage** — a five-stop height ramp (set *Band smoothness* to 0 for
  hard cel bands), painterly hue/value jitter (optionally per pattern cell —
  per-brick tint shifts), cavity darkening and ridge sheen for the
  hand-painted read, and a final grade (hue/saturation/brightness/contrast/
  gamma).
- **Overlays stage** — one-knob **wear macros** (*Damage* carves seeded
  scratches and chips and roughens them; *Dirt* pools grime into crevices)
  plus two masked colored overlays for moss, rust, grime, snow, patina,
  stains. *Crevice bias* pools an overlay into recesses (+1) or caps ridges
  (−1); each overlay can also shift roughness, height, and metalness (rust
  strips metal).
- **Surface stage** — relief depth, derived normal strength, baked AO,
  roughness base + height-correlated contrast, metalness, and an optional
  emissive source (crevices / peaks / band / overlay) for lava, circuits,
  force fields.
- **Preview** — lit 3D meshes (sphere, cube, cylinder, torus, knot, plane)
  with live displacement, or a flat 2D sheet with a per-map view
  (albedo/height/normal/roughness/metalness/AO/emissive) and 1–4× tiling to
  eyeball the seams. `R` re-rolls the seed; keys 1–5 switch stages;
  backtick opens the all-controls drawer.

## Image base (bring your own image)

“Use an image as the base” (Pattern stage, or *From an image* in the
gallery) turns **a picture of one surface into a tiling toon material** —
a wall photo, a bark close-up, a fabric scan, a crop from concept art.
There is **no AI in this path**: it converts, it does not interpret, so a
whole scene or screenshot just becomes repeating wallpaper (the lab warns
when an upload looks like a scene — crop the material you want first;
scene → material-list breakdown is the planned pro tool). Mechanically:
the bitmap is seamless-ized (torus blend), relief is derived from
band-split luminance (*Relief detail* / *Relief base*), and an optional
*Cel bands* control quantizes it toward the toon look. The image replaces
only the **base layer** — detail layers, wear, overlays (moss a
photographed wall!), glow, cavity/sheen, and the color grade all still
apply, and every map derives as usual. The base pattern and height-ramp
controls disable with a hint while an image is active. Images are stored
in the browser only; share URLs strip them (Recipe JSON keeps them).
Library callers: `imageToTextureMaps(imagePixels, { params, settings,
size })` — decoding stays outside so texgen remains headless.

## AI assist (bring your own key)

The **AI** stage maps plain language — *“old leather jacket”*, *“mossy
castle bricks”*, *“molten lava with glowing cracks”* — onto generator
parameters:

- **Built-in (no key)** — a deterministic offline mapper scores your words
  against the preset library and applies wear/color modifiers (old, wet,
  mossy, rusty, cracked, glowing, chunky, fine, color words…).
- **Gemini / OpenAI (your key)** — the lab sends a compact schema catalog
  (generated from the live field schema, ~3k tokens) plus your description
  to the model you name, and expects a small JSON recipe back: a base
  preset, a 2–5 color palette, and a parameter patch. Cheap “mini” tiers
  are plenty: the defaults are `gemini-2.5-flash-lite` and `gpt-5-mini`,
  and the model id field is free text so any model you have access to
  works. Every returned value is validated and clamped against the schema
  before it touches your document.

Keys are stored in this browser's `localStorage` only and are sent solely
to `generativelanguage.googleapis.com` / `api.openai.com` — there is no
ToonLab server in the path. *Refine current* mode patches the texture you
are editing instead of starting fresh.

## Export

The Export dialog bakes at 256–2048 px (independent of the preview) and
downloads:

- individual PNGs per map,
- one ZIP with the selected maps plus `recipe.json` (re-importable) and
  `material.json` (usage hints),
- the recipe JSON on its own, or a **share URL** with the whole recipe
  inlined (`?textureRecipe=`).

Maps: `albedo` + `emissive` are sRGB; `normal` (OpenGL +Y), `roughness`,
`metalness`, `ao`, `height`, and the glTF-style `orm` pack
(R=occlusion, G=roughness, B=metalness) are linear. Everything tiles
seamlessly — noise wraps its lattice periodically rather than blending
mirrored copies.

## Library usage

```js
import {
  createTextureSettings,
  evaluateTextureMaps,
  syncTextureMapTextures,
  findTexturePreset,
} from '@call-me-sensei/toonlab/texgen';

const settings = createTextureSettings(findTexturePreset('rusted-iron').settings);
const maps = await evaluateTextureMaps(settings, { size: 512 });

const { textures } = syncTextureMapTextures(maps); // THREE.DataTexture set
const material = new THREE.MeshStandardMaterial({
  aoMap: textures.ao,
  map: textures.albedo,          // SRGBColorSpace, RepeatWrapping — pre-tagged
  metalnessMap: textures.metalness,
  metalness: 1,
  normalMap: textures.normal,
  roughnessMap: textures.roughness,
  roughness: 1,
});
```

`evaluateTextureMaps` is async and chunked (pass `onProgress` /
`shouldCancel`), headless-safe (no DOM), and deterministic: the same
settings always produce byte-identical maps. To map language to settings
yourself, use `keywordTextureRecipe(prompt)` (offline) or
`buildTextureAiPrompt` + `parseTextureAiResponse` +
`compileTextureAiRecipe` around any LLM call.

Settings documents are versioned (`kind: "toonlab.textureRecipe"`,
`version: 1`) and validated/clamped by `createTextureSettings` — unknown
keys are ignored, colors accept hex strings or `[r, g, b]` triplets.

The generated color ramp is authored in display space. When a consuming
material multiplies it by an HDR tint above `1.0`, upper stops can clip together
and erase cel banding or vertex shading after tone mapping. Keep the material
tint at or below `1.0` when the ramp must remain legible, or author the desired
headroom into the ramp and verify under the application's actual tone mapper.
