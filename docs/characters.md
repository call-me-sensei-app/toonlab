# Characters and animation

Bring-your-own-model is a first-class feature: supported humanoid models can be loaded, toon-shaded and animated through
the shared runtime. Format support does not guarantee that an arbitrary rig,
material or animation can be resolved without a supplied adapter. The high-level runtime lives in
`@call-me-sensei/toonlab/character`; lower-level loader helpers remain
available from `@call-me-sensei/toonlab/loaders` when an app needs them.

## Recommended high-level runtime

```js
import { createCharacterRuntime } from '@call-me-sensei/toonlab/character';

const character = await createCharacterRuntime({
  parent: scene,
  renderer,
  targetHeight: 1.7,
  toon: { preset: 'call_me_sensei' },
  url: '/models/hero.vrm',
});

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  character.update(delta);
  renderer.render(scene, camera);
});

// character.actions exposes idle/walk/run/jump/swim/tread/dive/sit when the
// model or ToonLab fallback library provides them. Your controller blends
// those actions from movement state; it does not load or retarget clips.
```

The runtime owns model loading, texture readiness, foot-origin fitting, toon
conversion, supported-rig resolution, native clips or the packaged locomotion
fallback, mixer/VRM updates, and deterministic disposal. The host owns input, dynamic physics, movement intent and camera behavior.
The walkable runtime can consume the scene-style runtime's labeled static
collision service and the shared surface runtime's height sampling.
This is the same path used by the Playground and Character Shader Lab.

## Loading models

```js
import { loadModelAsset, SUPPORTED_MODEL_FORMATS } from '@call-me-sensei/toonlab/loaders';

const asset = await loadModelAsset('models/hero.vrm');
// asset: { root, clips, format, url, resourcePath, vrm? }
scene.add(asset.root);
```

Supported formats (`SUPPORTED_MODEL_FORMATS`): `pmx`, `pmd`, `fbx`, `glb`,
`gltf`, `vrm` (0 and 1), `obj` (pass `materialUrl` for the MTL), and
text-based `usdz`. VRM models are detected automatically on glTF load,
rotated to the +Z convention, and returned with the `vrm` instance.

Draco or KTX2-compressed glTF assets need an explicit decoder directory:

```js
await loadModelAsset('models/compressed.glb', {
  decoderBasePath: '/vendor/three-decoders/',
  renderer,
});
```

In the labs, use the HUD **Model URL** input or `?model=` — local paths and
hosted URLs both work (hosted URLs need CORS headers on the server; load
failures surface in a HUD banner). Private test models go in the gitignored
`assets-local/models/` drop-in folder: after `npm run assets:local` they
surface in every model-aware lab's Model select, no code changes. See
[getting-started.md](getting-started.md#loading-your-own-models) for the
folder shapes the scanner recognizes.

## Bone-role adapters (`characterRig`)

Animation is rig-agnostic because bone *names* are resolved to canonical
humanoid *roles* (VRM humanoid naming, `HUMANOID_ROLES`) once, up front:

```js
import { resolveCharacterRig, targetBoneNameForRole } from '@call-me-sensei/toonlab/character';

const rig = resolveCharacterRig(skinnedMesh, { vrm: asset.vrm });
// rig: { type, targetToMixamo, mixamoToTarget, hipCarrierName } — or null
targetBoneNameForRole(rig, 'head'); // the model's actual head bone name
```

`resolveCharacterRig` tries each convention adapter in order:

1. **VRM** — the humanoid bone map from the VRM extension (spec'd, exact).
2. **MMD/PMX** — Japanese bone names (`頭`, `下半身`, ...), including the
   center-bone hip carrier.
3. **Mixamo-named** — skeletons already using `mixamorig` names (normalized
   for the common prefix variants).
4. **Rigify** — Blender Rigify `DEF-` deform bones, matched loosely
   (heuristic name matching handles export renaming).

If no adapter matches, retargeting is impossible and models fall back to
their embedded clips. Everything downstream (retargeting, the procedural
swim clip, head tracking) works through roles, so a new rig convention is
one name table, not a new pipeline.

## Native-clip fast path

Models that ship their own locomotion clips skip retargeting entirely. A
model qualifies when at least idle + walk resolve against these clip-name
conventions (`NATIVE_LOCOMOTION_CLIP_NAMES` in
`labs/playground/animationPipeline.js`; first match per role wins):

| Role | Accepted clip names |
|---|---|
| idle | `Idle_Loop`, `Idle` |
| walk | `Walk_Loop`, `Walking`, `Walk` |
| run | `Sprint_Loop`, `Jog_Fwd_Loop`, `Running`, `Run` |
| jump | `Jump_Start`, `Jump_Loop`, `Jump` |
| swim | `Swim_Fwd_Loop`, `Swimming`, `Swim` |
| tread | `Swim_Idle_Loop`, `Treading_Water`, `TreadingWater` |

The repository's CC0 mannequin fixture (Quaternius Universal Animation
Library, 46 embedded clips) qualifies out of the box — that is why a fresh
source clone animates with zero downloads. It is excluded from the npm
tarball; package consumers can use `TOONLAB_MANNEQUIN_ASSET.url` to download
the immutable public-R2 copy or provide their own model. Author your own GLBs
to these names and they play natively too.

## Mixamo retarget pipeline

For models without native clips, `createCharacterRuntime()` retargets the
packaged CC0 mannequin locomotion clips
onto the resolved rig with a world-space bake: only the role mapping comes
from `characterRig`; rest-pose differences (T-pose vs. A-pose) and hierarchy
mismatches are solved numerically. This is how a PMX character, a VRM avatar,
and a Rigify export share the same reusable locomotion library. Apps can pass
`animation.fallbackSourceUrl` to use another compatible source library.

## Procedural freestyle swim

`createFreestyleSwimClip(targetMesh, rig, options)` generates a freestyle
(front crawl) swim clip with no FBX source: windmilling catch-up arm
strokes, flutter kick, body roll, and a breath every fourth stroke. Motion
is authored as world-space rotation deltas against the bind pose, so the
same code bakes onto any supported skeleton (VRM, MMD, Mixamo-named,
Rigify).

```js
import { createFreestyleSwimClip } from '@call-me-sensei/toonlab/character';

// Skeleton must be in bind pose when you call this.
const clip = createFreestyleSwimClip(targetMesh, rig, {
  clipName: 'FreestyleSwim',
  trackNameStyle: 'skeleton', // 'skeleton' for retarget-style mixers, 'node' for native-clip mixers
});
mixer.clipAction(clip).play();
```

The Playground uses it as the default swim style (`?freestyleAnim=none`
disables it).

## swimVisualLift

Swim physics floats every model at the same capsule depth below the wave
surface — the whole swim backend (vertical control, clamps, ray geometry,
wave exposure) is tuned as a package around one value, and giving models
different physics floats re-exposes tuning bugs. Models that need to *look*
higher or lower in the water get `swimVisualLift`: a visual-only vertical
offset applied to the model group while swimming, which the physics never
sees. The compact mannequin uses `0.18` to read as surface freestyle; a
character with tall hair volume needs none. Per-model values live in the
lab's character options (`labs/shared/sceneHub.js`); override for testing
with `?swimVisualLift=`.
