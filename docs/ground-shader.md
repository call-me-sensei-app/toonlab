# Ground shader

The Ground Shader is a first-party terrain material for splat-weighted
grass, dirt, rock, and sand. It provides slope rock takeover, triplanar cliff
detail, shoreline sand and wetness, weather response, HDR sun/shade treatment,
distance recession, transient footprints/tracks, and a flat-albedo variant for
grass ground adoption.

## Safe construction

```js
import {
  createGroundShaderMesh,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';

const ground = createGroundShaderMesh({
  geometry,
  field, // { splat: Uint8Array RGBA, splatW, splatD }
  layers,
  settings: { preset: 'call_me_sensei' },
});
scene.add(ground);

setGroundShaderSceneState(ground, {
  sunColor,
  sunDirection,
  skyColor,
  waterLevel,
  wetness,
  snowCover,
});
```

## Footprints, tracks, and general prints

Create one bounded Ground Print Layer for terrain whose UVs align with its
splat field, then pass it into the Ground Shader material. Stamp history is
transient runtime state; `printResponse` in the portable Ground profile stores
only how dirt, sand, and snow receive those stamps.

```js
import {
  createGroundPrintLayer,
  createGroundShaderMesh,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';

const prints = createGroundPrintLayer({
  bounds: geometry.boundingBox, // X/Z extent represented by terrain UV 0..1
  resolution: 1024,
  recoverySeconds: 30, // 0 keeps prints until clear()
});

const ground = createGroundShaderMesh({
  geometry,
  field,
  layers,
  printLayer: prints,
  settings: { preset: 'call_me_sensei' },
});

prints.stamp({
  shape: 'boot-left',
  position: footWorldPosition,
  forward: characterForward,
  size: [0.12, 0.28],
  pressure: 0.9,
});

setGroundShaderSceneState(ground, {
  snowCover: 1,
  snowDepth: 0.12,
});

// Only needed when recoverySeconds is greater than zero.
prints.update(deltaSeconds);
```

Built-in shapes cover left/right boots, bare feet, paws, hooves, tires, drags,
impacts, and a generic ellipse. The shader automatically masks a stamp against
painted dirt/sand weights and printable snow depth, so the same event does not
mark rock or grass by default. `clear()` removes all history and `dispose()`
releases the owned texture.

Ground prints are a bounded visual material response: they affect albedo,
roughness, and normal relief, not terrain geometry, collision, or navigation.
The host remains responsible for emitting contact events and for invalidating
any separately cached ground-field pass after stamp changes when its consumers
must see the updated albedo.

`createGroundShaderMesh()` defaults to casting and receiving shadows, writing
the shared environment ground field, and disabling frustum culling that would
be unsafe with displaced/custom bounds. Use `createGroundShaderMaterial()` only
when the host deliberately owns those mesh policies.

The Call Me Sensei preset exposes `lighting.sunIntensity` (`1.18`) so sunlit
terrain retains HDR headroom before tone mapping. It also keeps a strong
away-facing cliff shadow, cool shadow tint, and procedural triplanar rock
detail when optional authored maps are absent.

## Ground-field adoption

Create the environment ground-field pass only after ground writers exist.
After its first update, require `pass.writerCount > 0` and `pass.ready`. Call
`pass.invalidate()` when splat data, vertex colors, or textures repaint without a
transform change.

The ground-field color target contains the same splat/detail/weather albedo as
the visible ground but deliberately excludes view-dependent sun, sky, rim, and
specular response. Grass and rock-cap consumers light that color themselves;
publishing the already-lit ground color would double-light them.

## Release checks

Inspect gameplay, grazing, cliff-face, shoreline, and flyover cameras. Reject
missing cast shadows, self-shadow acne, flat untextured cliff gaps, a grass-to-
ground color jump, or a visible water/ground seam. Optional maps improve hero
terrain, but the package fallback must remain visibly detailed and never be a
flat color.
