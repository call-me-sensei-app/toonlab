# Realistic rock surfaces

Nature Reference Rocks and their edited library variations retain realistic PBR
materials. Raw official-catalog acquisition loads the realistic GLB; styled
placement applies the selected ToonLab shader and material settings.

The npm library also exposes the same deterministic surface generator used by
the Rock Lab. It can generate maps for a procedural rock with an explicit
lithology profile, without downloading a rock model or spending AI credits.

```js
import {
  NATURAL_ROCK_SURFACE_PROFILES,
  createNaturalRockMapData,
  createNaturalRockSurfaceSpecification,
} from '@call-me-sensei/toonlab/rockgen';

const profileId = 'coarse-granite-jointed';
const material = createNaturalRockMapData({
  assetId: 'my-procedural-rock', profileId, seed: 1234, size: 1024,
});
const label = NATURAL_ROCK_SURFACE_PROFILES[profileId].label;
```

`material.maps` contains RGBA byte arrays for `baseColor`, `normalGL`,
`roughness`, `ao`, `orm`, `smoothness`, and `heightMicro`. The host constructs
textures, uses sRGB for Base Color and linear data for the other channels, and
assigns an appropriate material and projection. ORM stores AO in red,
roughness in green, and metallic (zero) in blue. The result includes physical
micro-height decoding and projection information.

For a saved library variation, retain a surface specification made with
`createNaturalRockSurfaceSpecification`, passing the stable asset ID, profile,
seed, edited bounds in metres, and current geometry SHA-256. Rock documents
preserve this recipe through serialization. Production specifications require
1024–4096 map resolution. The generator accepts 64–4096 for previews.

Profiles that mix distinct materials require authored, geometry-bound semantic
regions. The surface-specification constructor stores their masks as compact
JSON runs with geometry and mask hashes. Pass the returned specification
unchanged when saving a library recipe or creating a rock through MCP. The
Lab restores these masks and samples all material channels in authored UV0.
After topology or UV changes, author masks for the new geometry binding; stale
bindings are rejected. Requests without the required regions are rejected. Micro-height is material
detail; it does not replace a signed high-to-low geometry bake. Changes to the
shape still require the appropriate LOD, collision, and bake updates.

Existing schema identifiers and catalog IDs remain compatible with saved
assets. Display profile labels and the name “Nature Reference Rocks” in product
UI rather than internal production identifiers.
