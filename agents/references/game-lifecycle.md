# Game lifecycle and update ownership

The application owns the frame loop. Adding ToonLab should not create competing
loops, duplicate physics steps or double animation updates. For a new game,
author the host systems as part of the requested work. For integration, reuse
the existing owners.

## One owner per system

| System | Owner and update |
| --- | --- |
| Input, game rules and dynamic physics | Host; use a fixed physics timestep where the physics engine requires it |
| Character mixer/VRM | `character.update(delta)`; if a walkable runtime owns that character, let it perform the update instead |
| Camera | Host; update after movement and before camera-dependent scene passes |
| SkySystem | Host calls `sky.update(delta)` once; binding it to scene-style does not animate it |
| Lighting, shared shadows, ground field | `styleRuntime.update(delta, camera)` |
| Grass and other focused objects | Call their documented updates once, after the ground field they sample is current |
| WaterSurface | Host calls `water.update(delta, camera)` once |
| Final scene render | `post.render(delta)` when a post pipeline owns rendering; otherwise `renderer.render(scene, camera)` |

Check ownership in the actual runtime you instantiate. Do not call a lower
level character, physics or material update again when an owning controller
already does it. Update independent transient conditions through uniquely
named layers; clear only the owner's layer when it ends.

For a scene using these systems, a typical order is host movement/physics,
camera, sky, scene-style passes, grass/other animated content, water, then the
final render. Clamp the resumed frame delta and reset held keys on focus loss.
Make pause and restart explicit gameplay states rather than spawning new loops.

## Renderer and readiness

Create Three's `WebGPURenderer`, await `renderer.init()`, and use TSL-compatible
materials. Its WebGL2 fallback is not the classic `WebGLRenderer` material path.
Use `configureToonLabRenderer()` only when the scene-style runtime does not
already own that configuration. Pick a device-appropriate pixel ratio and
quality profile; measure before increasing shadow, cloud or water quality.

Await model/texture and scene application promises. Render the required passes
before calling the surface readiness audit. Validate collision registration and
probe movement against real blockers. A flag such as `castShadow` or a stable
triangle count is useful evidence, but neither proves the final image is valid.

## Resize and shutdown

On resize, update the camera projection, renderer size and any explicitly sized
post/target resources. Use the renderer's actual drawing-buffer size for pixel
budgets. On shutdown stop the animation loop and listeners, then await
`styleRuntime.dispose()` before disposing the host objects it styled. Dispose
each character, grass field, water, sky and post pipeline through its owner;
scene-style does not transfer ownership of supplied systems. Release acquired
asset handles and caller-owned textures only after their final consumer ends.

The copyable `agents/examples/game-foundation.mjs` demonstrates a flat blockout
with movement, labeled static collision, a collectible and restart. It makes no
claim to provide dynamic physics, navigation or finished art. Add those host
systems when the game requires them, and qualify them through real gameplay.
