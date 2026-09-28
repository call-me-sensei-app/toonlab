# Hoodoo rock-region GLB compiler

Status: **repository-only experiment**. This is not an npm API, a general
geology compiler, or a full rock-family release.

## Purpose and boundary

The compiler appends one semantic accessor to an existing, admitted GLB. It
does not create a rock, repair topology, infer geology, alter PBR maps, generate
LODs, or bake surface detail. The only implemented repository profile is
`hoodoo-caprock-normalized-height-v1`, bound to the exact LOD0 input SHA-256
`d8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e`.

The browser-safe root and `rockgen` entry do not import the compiler. Repository
tools use a relative internal import:

```js
import {
  HOODOO_CAPROCK_INPUT_SHA256,
  compileRockRegionGlb,
  compileRockRegionGlbFile,
} from '../src/rockgen/node.js';
```

`compileRockRegionGlb()` accepts and returns `Uint8Array`. Its output includes
a path-independent audit. `compileRockRegionGlbFile()` additionally writes the
GLB and audit, refusing existing targets unless `overwrite: true` is explicit.

## CLI

```bash
node cli/rockRegions.mjs compile \
  --input ./hoodoo-neutral.glb \
  --input-sha256 d8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e \
  --profile hoodoo-caprock-normalized-height-v1 \
  --output ./hoodoo-regions.glb \
  --audit ./hoodoo-regions.audit.json
```

Pass `--overwrite` only when replacing both targets is intentional. Paths are
not incorporated into output bytes or the portable audit.

## Admitted GLB subset

The compiler requires GLB 2.0 with one JSON chunk, one embedded binary buffer,
one default scene, one root mesh node, one mesh, and one triangle primitive.
The node must have applied transforms. `POSITION` must be a finite,
non-normalized `FLOAT VEC3` accessor. Sparse or quantized positions, helpers,
collision meshes, cameras, lights, skins, animations, morph targets, Draco,
multiple primitives, and an existing `_TL_ROCK_REGION` binding fail closed.

The output preserves every declared source-binary byte as an exact prefix and
appends normalized `UNSIGNED_BYTE VEC4` data. glTF accessor `min`/`max` values
remain raw stored UINT8 component bounds (`0`–`255`), as required by glTF; they
are not divided by 255. Compilation is byte deterministic for identical input
and version.

## Binding

The fixed channel order is `base`, `shaft`, `neck`, `cap`. Base, shaft, and cap
form an exact quantized partition; neck is an overlay. All four channels must
reach full coverage and all must have nonzero samples. The binding lives on
the mesh node because `GLTFLoader` exposes node extras to the resulting mesh.

The fixed four-channel vocabulary is suitable only for this hoodoo. Basalt
columns, tors, cliff walls, talus, arches, bedding, joints, foliation, ledges,
and detached blocks need separately admitted profiles.

## Stable failures

`RockRegionCompilerError` exposes `code` and `details`. Important codes include
`INPUT_SHA256_REQUIRED`, `PROFILE_HASH_MISMATCH`, `INPUT_HASH_MISMATCH`,
`UNSUPPORTED_PROFILE`, `UNSUPPORTED_MESH_COUNT`,
`UNSUPPORTED_PRIMITIVE_COUNT`, `UNSUPPORTED_TRANSFORM`,
`UNSUPPORTED_HELPER`, `EXISTING_BINDING`, `UNSUPPORTED_SPARSE_POSITION`,
`UNSUPPORTED_QUANTIZED_POSITION`, and `OUTPUT_EXISTS`.

No compiler success is geological or visual approval. The admitted neutral
source, bakes, six-view review, exact restoration, Unreal qualification, and
family rollout remain separate gates.
