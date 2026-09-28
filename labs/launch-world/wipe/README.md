# §11 shader wipe — the signature product moment

Owner: camera choreography and the neutral↔ToonLab comparison.
Review rig: `/labs/launch-world/wipe/?shot=S02` and `?shot=S07`.
Evidence: `launch-plan/review/captures/wipe/` (+ `manifest.json`).
Proof: `node scripts/verify-style-comparison.mjs`.

## What this is

§11 requires a comparison in which *"both halves share the same geometry buffers,
animation time, camera matrices, light transforms, and exposure"*, and that the wipe be
*"a renderer scissor/mask comparison, never two separately framed screenshots."*

Both pre-existing in-repo wipes loaded the model twice, which cannot support that claim.
The comparison primitive now lives in the package:

```js
import { createStyleComparison, verifyStyleComparisonIdentity }
  from '@call-me-sensei/toonlab/renderer';
```

`labs/launch-world/wipe/` is the launch-world binding on top of it — the §11 shot rig,
the draggable boundary, and the subject list. Registered as **FILL-001**.

## Mounting it in the garden scene

The scene owns its content; the wipe owns nothing but the comparison. Hand it subjects
that are already in your scene:

```js
import { createLaunchStyleWipe, mountWipeDivider, createLaunchShotRig, resolveLaunchShot }
  from '../wipe/index.js';

const shot = resolveLaunchShot('S07');
const rig = createLaunchShotRig({ camera, post });   // post is optional
rig.setShot(shot.id);                                 // sets the lens AND the render policy

const wipe = await createLaunchStyleWipe({
  axis: shot.ab,            // 'vertical' for S02 and S07
  camera, renderer, scene,
  subjects: [
    { id: 'yua',    root: yua.carrier, mixer: yua.runtime.mixer,
      applyStyle: () => yua.setMaterialMode('toon') },
    { id: 'ground', root: garden.ground, applyStyle: () => garden.applyGroundStyle() },
    { id: 'stones', root: garden.setStones, applyStyle: () => garden.applyRockStyle() },
  ],
});
mountWipeDivider(stageElement, wipe);

// per frame, INSTEAD of renderer.render(scene, camera):
wipe.render();
```

`createLaunchStyleWipe` captures the neutral state, calls every `applyStyle()`, captures
the styled state, and from then on flips between them by assigning material references.

### The one rule for `applyStyle()`

**Install a pre-built styled material. Do not mutate the neutral one.**

Domains that style by mutating settings in place — the ground shader, the rock shader,
water — leave both variants holding the *same* material object, and the wipe silently
becomes a no-op. Build both materials over the same geometry up front and have
`applyStyle()` install the styled one. `groundSubject.js` is the worked example, and
`wipe.report().identity` surfaces the mistake as *"No tracked node has a different
material between variants"* rather than letting it ship.

Yua is the reference for the character case: `createYuaCharacter` loads once, builds both
material sets over the same meshes, and `setMaterialMode` is the lever.

### Scene state that is not a material

A neutral sky or a neutral fog colour is legitimate and goes through `sceneState`:

```js
sceneState: [{ id: 'fog', capture: () => scene.fog.color.clone(),
               apply: (c) => scene.fog.color.copy(c) }]
```

**Exposure is deliberately not trackable.** §11 requires both halves to share it, and
`render()` asserts it every frame — see `comparison.exposureDrift` and D19-111.

## Shots and lenses

`shots.js` holds §11's ten shots verbatim, re-sited to the garden. Lenses are real focal
lengths, not fields of view: the rig pins `filmGauge = 36` and calls three's own
`setFocalLength`, so the fov is **re-derived on every resize**. A fixed fov would silently
change the lens with the window.

Framing in a 40 × 40 m garden has to be *solved*, not guessed — at a fixed focal length
the only way to fit more in frame is to move back, and the garden runs out of room:

```js
assertShotFitsFootprint('S07', 12, 16 / 9);
// -> fits: false, "50 mm needs 29.6 m for a 12 m band but only 28.3 m exists"
```

S07 is framed at an 8 m band (19.8 m) for that reason. **Do not widen S07 off 50 mm** —
S02 and S07 sharing a lens is the point of the pairing. See D19-110.

## Render policy during a wipe

`shotRenderPolicy(shot)` returns `{ motionBlur, exposureLocked }`, and `rig.setShot()`
applies it to the post pipeline. Motion blur is **off** during an A/B: it is a temporal
accumulation, so the two renders of one frame would carry different histories and the
wipe would compare shading against shading-plus-smear.

## Proving it

```
node scripts/verify-style-comparison.mjs
```

Eleven assertions per shot. The five load-bearing ones are exact: `split=0` and `split=1`
are **bit-identical** to standalone full-frame renders of their variant, camera/lights/
exposure/animation clocks are unchanged by the wipe, all differences are confined to the
treated subject, and both variants share geometry buffers, skeletons and morph influences.

Intermediate splits currently carry a ~0.6% residual (S02) — **D19-113**, cause not yet
isolated, deliberately left failing rather than absorbed into a tolerance.

`verifyStyleComparisonIdentity` is exported from the package and is what the filler
register's equivalence test calls; it renders into its own target, so it does not depend
on canvas size or screenshot timing.

## Automation contract

Do not rename these — capture scripts assert them.

| Key | Meaning |
| --- | --- |
| `document.body.dataset.wipeReady` | `'true'` once both variants are captured |
| `document.body.dataset.wipeReport` | subjects, variants, structural audit |
| `document.body.dataset.shotReport` | lens, fov, motion-blur policy |
| `document.body.dataset.wipeVerify` | pixel-identity proof result |
| `globalThis.__TOONLAB_LAUNCH_WIPE` | `{ verify(), wipe, comparison, rig, … }` |

Query flags: `?shot=`, `?split=` (percent), `?hud=0`, `?verify=1`, `?aa=0`, `?shadows=0`.
The last two exist for isolating renderer defects, not for production framing.
