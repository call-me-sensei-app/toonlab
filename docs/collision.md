# Collision defaults

ToonLab's high-level scene runtime gives labeled solid objects collision by
default. This is deliberately part of scene readiness: a styled tree, rock, or
bench that the player can walk through is not a successful first-pass result.

## Default behavior

`createSceneStyleRuntime()` creates a scene collision runtime unless
`collision: false` is explicit. During strict scene-label discovery it uses the
same target inventory as style application.

The following domains receive conservative bounds collision when their label
does not specify another policy:

- `manufactured.environment`
- `manufactured.surface`
- `natural.rock`
- `prop`
- `vegetation.tree`

Generated trees use trunk geometry rather than canopy bounds. Ground, grass,
flowers, sky, and water remain non-solid by default. Bridges, doors, walkable
decks, or decorative props that need a different policy must declare it.

```js
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createWalkableCharacterRuntime,
} from '@call-me-sensei/toonlab';

const runtime = createSceneStyleRuntime({
  collisionHeightAt: terrainHeight,
  renderer,
  scene,
});

const character = await createWalkableCharacterRuntime({
  camera,
  ground: terrainHeight,
  renderer,
  scene,
  character: { parent: scene, renderer, url: characterUrl },
});

await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'scene-labels',
  mode: 'strict',
});

runtime.collision.assertReady();
```

No collision object is passed to the walkable character. It consumes the
runtime bound to the scene automatically.

## Explicit policies

Use versioned collision metadata on a style target when bounds are not the
right shape.

```js
import { createCollisionMetadata, createStyleTargetLabel } from '@call-me-sensei/toonlab';

createStyleTargetLabel('manufactured.surface', {
  collision: createCollisionMetadata('none'),
  targetId: 'level/bridge-deck',
});

createStyleTargetLabel('vegetation.tree', {
  collision: createCollisionMetadata('blockers', {
    circles: [{ x: 0, y: 0, z: 0, radius: 0.55 }],
  }),
  targetId: 'level/oak-17',
});
```

Supported metadata kinds are `none`, `bounds`, `blockers`, `convex`, and
`trimesh`. Strict mode fails before readiness if a solid target produces no
geometry or the selected adapter does not support its kind. Registrations are
removed when targets disappear, replaced when targets change, and fully
disposed with the scene runtime.

## Lightweight and Rapier worlds

The default lightweight world uses spatially indexed XZ circles. It is intended
for static walkable scenes and is what the shared walkable character resolves
against automatically.

For an existing Rapier world, install the public fixed-collider adapter:

```js
import {
  createRapierCollisionAdapter,
  createSceneStyleRuntime,
} from '@call-me-sensei/toonlab';

const collisionAdapter = createRapierCollisionAdapter({
  rapier: RAPIER,
  world: rapierWorld,
});

const runtime = createSceneStyleRuntime({
  collision: rapierWorld,
  collisionAdapter,
  renderer,
  scene,
});
```

ToonLab creates and removes fixed colliders. The host still creates and steps
the Rapier world, owns dynamic rigid bodies, chooses collision groups, and owns
navigation/pathfinding.

## What this does not solve

Automatic collision is conservative, not scene design. It cannot decide that
a door should open, infer a walkable stair mesh, build navigation, repair bad
geometry, or choose an artistically correct compound collider for an arbitrary
asset. Use explicit `blockers`, `convex`, `trimesh`, `none`, or a custom adapter
where conservative bounds are inappropriate. The collision report makes those
decisions auditable instead of silently leaving objects non-solid.
