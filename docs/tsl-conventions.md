# TSL Porting Conventions (three r185+)

House rules for porting the GLSL shader library to TSL/NodeMaterial during
the WebGPU migration. Everything here was
verified against `three@0.185.1` on both node backends — the WGSL
builder (WebGPU) and the GLSL builder (`forceWebGL: true`). Re-validate the
"r185 quirk" items on any version bump.

## File layout

- `src/shaders-tsl/` is the canonical shader library: one module per material
  (`sky.js`, `character/characterMaterial.js`, …), one module per reusable
  chunk under `src/shaders-tsl/chunks/` (`water-common.js`,
  `environment-lighting.js`, …).
  The retired raw GLSL tree (`src/shaders/`) and `shaderSource.js` registry
  were removed in Phase 11.
- Leaf helpers that map nodes→nodes are `Fn()` exports. Helpers with
  compile-time-constant parameters (loop counts, feature flags) are plain JS
  functions that unroll at graph-build time.
- Chunks that need material uniforms export a factory
  (`createXxxChunk({ u, tex, v, flags })`) returning the chunk's functions;
  the shader module assembles them. `u` = uniform nodes under GLSL names,
  `tex` = texture nodes, `v` = varyings, `flags` = compile-time booleans.

## The `.uniforms` compatibility surface

TSL material factories attach `material.uniforms` — a map of UniformNodes
(and TextureNodes) keyed by uniform name. UniformNode and TextureNode both
expose `.value`, so write-throughs (`mat.uniforms.debugMode.value = x`, HUD
panels, the character render passes) work identically on both backends.

## Feature gating

- Former GLSL `#ifdef USE_X` sampler-presence gates are now JS
  `if (flags.hasX)` graph-build gates. Absent maps never enter the graph, so
  no texture/bind slots are wasted. Keep these gates: both native WebGPU (with
  default requested limits) and the forced WebGL2 fallback currently have a
  16-sampled-texture ceiling.
- GLSL `uniform bool useX` runtime toggles → keep as uniform-driven
  `If()`/`select()`, exactly like the GLSL branch.
- Debug views are always compiled into TSL materials when available; the
  selector is a pure uniform write.

## r185 gotchas (each cost real debugging time)

1. **`matN()` scalar constructors are three.js ROW-major** (`Matrix2`
   constructor docs), the transpose of GLSL's column-major `matN()`.
   Transpose the scalar order when porting, or write the multiply
   component-wise. Constructors from column *vectors* (`mat4(v0,v1,v2,v3)`)
   match GLSL. Symptom: fbm/rotation patterns differ subtly.
2. **`select()` operands must be pure expressions.** A branch that creates a
   var (`.toVar()`) or calls an `Fn()` crashes the GLSL builder with
   `Cannot read properties of undefined (reading 'addToStack')` — the
   ConditionalNode type-resolution fallback builds the operand subtree in a
   detached (stack-less) flow. Referencing vars created *outside* the select
   is fine. Hoist calls into `If()`-assigned vars instead.
3. **Deep nested `select()` chains** (the 24-entry debug table) hit the same
   fallback. Use masked arithmetic sums
   (`Σ value.mul(select(cond, 1, 0))`) for big tables, and never leave a
   ConditionalNode as the `fragmentNode` root (wrap with `mix()` or `vec4()`).
4. **All mutating node code needs an active stack** — build vertex work
   inside one `Fn()` assigned to `vertexNode`, declare varyings up front
   (`varying(vec3(), 'vName')`) and `.assign()` them inside; the declarative
   `varying(Fn(...)())` form breaks the GLSL builder.
5. **Depth-texture sampling types differently per builder** (WGSL: `float`,
   GLSL: `vec4` snippet under a `float` node type → compile error). Passes
   that feed shaders write linear window depth into **float COLOR targets**
   instead; `[0,1]` window depth is numerically identical on both coordinate
   systems (perspective *and* orthographic), so `perspectiveDepthToViewZ`
   works unchanged.
6. **Render targets are written top-down on BOTH node backends.** Manual
   shadow/projective sampling (matrix-composed uv) needs a y-flip that the
   classic pipeline didn't; WebGPU additionally has clip z in [0,1] (the GLSL
   `*0.5+0.5` contract needs a `z' = 2z − 1` pre-stretch). Compose both into
   the CPU-side matrix (see characterRenderPasses `shadowClipAdjust*`).
   three's own `screenUV` node already handles orientation — prefer it over
   `gl_FragCoord`-style math.
7. **SkinningNode stores bone matrices in a uniform buffer** —
   `GL_MAX_UNIFORM_BLOCK_SIZE` (16KB ≈ 256 bones) breaks MMD-scale skeletons
   on the WebGL2 backend. `withToonStorageSkinning()`
   (chunks/character-skinning.js) reroutes skinned meshes to a
   `storage(...).setPBO(true)` bone buffer (emitted as a DataTexture +
   texelFetch on GLSL). Note: the GLSL builder **replaces the attribute
   array** with a padded copy at PBO setup — per-frame updates must copy
   `skeleton.boneMatrices` into `attribute.array` and flag
   `attribute.pbo.needsUpdate`.
8. **Guard uniform-dependent divisions.** GLSL branches skipped
   `direction.xz / (up + 0.28)` below the horizon; a masked straight-line
   port produces NaN·0 = NaN. Keep the `If()` structure (uniform conditions
   are fine in WGSL uniformity analysis) or clamp the divisor.
9. **RT-fed textures sample at `.level(0)`** — no mips exist and WGSL forbids
   implicit-derivative sampling in non-uniform control flow.
10. **`MeshDepthMaterial` (and other non-node classics) don't auto-convert**
    on the node renderer (`NodeBuilder: Material "MeshDepthMaterial" is not
    compatible`). Standard lit materials do. Pass materials are node-built.
11. **`renderer.capabilities` doesn't exist on WebGPURenderer** — use
    `renderer.getMaxAnisotropy()` etc. with optional chaining at seams shared
    by both renderers.
12. **KTX2 `detectSupport(renderer)` needs an initialized backend** — gate
    loader configuration (and anything else probing capabilities) on
    `await renderer.init()` / `whenRendererReady()`.
13. **`UniformArrayNode.value` is the packed GPU buffer** (null until first
    setup); the authoring array is `.array`. Expose array uniforms on the
    `.uniforms` surface as `{ value: node.array, node }` wrappers so
    `uniforms.uWavesA.value[i].set()` write-throughs keep working (water).
14. **Depth-as-color passes get fogged by `NodeMaterial.setupOutput`** in
    fogged scenes — distant depth blends toward the fog color. Null
    `scene.fog` for the pass render and force `fog: false` on the variant
    materials (water depth pass; the environment sun-shadow pass has the
    same latent hazard in any future fogged scene).
15. **The node renderer force-rebuilds a camera's projection on
    `coordinateSystem` mismatch** (and on its first reversed-depth pass) —
    copy `camera.coordinateSystem` onto any manual virtual/pass camera or a
    hand-mutated projection matrix (oblique clip) gets wiped on first render
    (planar reflection, water reflection).
16. **`geometry.setDrawRange` doesn't limit instanced draws** on the node
    renderer — set `geometry.instanceCount` instead (rain intensity).
17. **Shared uniform NODES must be adopted at graph build time** — swapping
    entries in a material's `.uniforms` map after build changes nothing (the
    map is a compatibility view, not the graph). Rebuild the material (or
    build it with the shared nodes from the start) when wiring cross-material
    shared uniforms (`attachWaveUniforms`).
18. **The classic pipeline's baked `colorspace_fragment` is per-render-target**
    — `linearToOutputTexel` compiles against the BOUND target's
    `texture.colorSpace`, so an offscreen NoColorSpace target holds LINEAR
    color on classic despite the include. When porting a pass that reads such
    a target, do NOT add a compensating transfer (post composite: a drafted
    OETF-at-read washed the frame +191/255). The single encode happens at the
    canvas draw on both pipelines.

## Scene lights

Custom lighting models that need raw light data (main-light direction, toon
banding per light, shadow mask separate from color) don't fit the node
LightingModel shape. `chunks/character-scene-lights.js` mirrors the scene's
lights into shared uniforms once per frame (from `Object3D.onBeforeRender`,
which both renderers call) replicating three's WebGLLights view-space
conventions and attenuation math. Materials share the module-level uniform
nodes, so one sync updates every toon material.

## Renderer/backends

- `?renderer=` flag: absent / `webgpu` = native WebGPU; `webgl` = TSL through
  `WebGPURenderer({ forceWebGL: true })`; `webgpu-forced-gl` = compatibility
  alias for `webgl`.
  `labs/shared/rendererKind.js` resolves it; `labs/shared/rendererFactory.js`
  creates the renderer (sync create, async `init()` gate via
  `whenRendererReady`), sets the `src/core/shaderBackend.js` marker, and
  reports `document.body.dataset.rendererKind` / `.rendererBackend`
  (`webgpu` | `webgl2-fallback` — capture scripts assert this).
- Material factories in `src/` are TSL-first. Some helpers still branch on
  `isTslBackend()` for shared WebGPU/forced-WebGL2 code, but the classic
  `WebGLRenderer`/GLSL material path is gone.
- Headless WebGPU (Playwright): launch with
  `--enable-unsafe-webgpu --enable-gpu` → hardware Metal adapter on macOS.
  Captures: `TOON_BASELINE_RENDERER=webgpu|webgl|webgpu-forced-gl
  TOON_BASELINE_SCOPE=ganyu npm run baseline:capture` (backend mismatch fails
  the capture).

## Verification

WebGL headless captures are byte-deterministic (noise floor zero) — any
classic-path diff is a real regression. TSL-vs-WebGL diffs bottom out at
fp-level noise around toon band/fbm thresholds (mean ≈ 1/1020 per pixel);
structural differences always traced to a real porting bug, so do not accept
"looks close" while a debug view disagrees.
