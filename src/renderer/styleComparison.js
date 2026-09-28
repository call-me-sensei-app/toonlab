// Style comparison — a single-load, dual-material A/B render path.
//
// A neutral-versus-styled wipe is a flagship ToonLab demonstration, and the
// only honest way to render one is to draw the SAME geometry buffers twice in
// the same frame with a different material treatment. Loading the subject
// twice (two GLB loads, two skeletons, two AnimationMixers, two scenes) cannot
// guarantee identical animation time or identical geometry, so the claim
// "only the shading differs" is not provable — it is merely plausible.
//
// This module makes the A/B a renderer feature instead of something every
// consumer re-implements incorrectly:
//
//   const ab = createStyleComparison({ renderer, scene, camera });
//   ab.track(character.carrier);
//   ab.capture('neutral');            // before any style is applied
//   applyToonShader(character.modelRoot, { preset: 'call_me_sensei' });
//   ab.capture('toonlab');            // after
//   ab.setVariants({ after: 'toonlab', before: 'neutral' });
//   // per frame, INSTEAD of renderer.render(scene, camera):
//   ab.render();
//
// One load, one skeleton, one animation clock, one camera, one light rig, one
// exposure. The two halves differ by material assignment and nothing else,
// because nothing else is touched between the two `renderer.render` calls.
//
// Why not the style transaction: `setTargetEnabled(id, false)` performs a full
// restoreMaterial traverse plus outline/fur child teardown and rebuild
// (src/styles/styleTransaction.js). That is the correct ONE-TIME primitive for
// building a variant, and far too expensive to run twice per frame at 60 fps.
// `capture()` is that one-time cost; `activate()` is a Map walk that assigns
// material references.
//
// Renderer support: any three.js renderer exposing setScissor/setScissorTest
// (WebGPURenderer on either backend, WebGLRenderer). The pixel-identity proof
// additionally needs `readRenderTargetPixelsAsync`.

import * as THREE from 'three';

/** Split axes. `vertical` is a vertical divider; `horizontal` is a horizontal one. */
export const STYLE_COMPARISON_AXES = Object.freeze(['horizontal', 'vertical']);

/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 *
 * @typedef {object} StyleComparisonRenderer
 * @property {(scene: THREE.Object3D, camera: THREE.Camera) => unknown} render
 * @property {(x: number, y: number, width: number, height: number) => void} setScissor
 * @property {(enabled: boolean) => void} setScissorTest
 * @property {(target: THREE.Vector4) => THREE.Vector4} getScissor
 * @property {() => boolean} getScissorTest
 * @property {(target: THREE.RenderTarget|null) => void} setRenderTarget
 * @property {() => THREE.RenderTarget|null} getRenderTarget
 * @property {(target: THREE.Vector2|THREE.Vector4) => unknown} getSize
 * @property {(color: THREE.Color) => THREE.Color} getClearColor
 * @property {boolean} autoClear
 * @property {boolean} autoClearColor
 * @property {boolean} autoClearDepth
 * @property {boolean} autoClearStencil
 * @property {number} toneMappingExposure
 *
 * @typedef {'horizontal'|'vertical'} StyleComparisonAxis
 *
 * @typedef {THREE.RenderTarget|null} StyleComparisonTarget
 *
 * @typedef {object} StyleComparisonRect
 * @property {number} height
 * @property {number} width
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} StyleComparisonSize
 * @property {number} height
 * @property {number} width
 *
 * @typedef {object} StyleComparisonVariantPair
 * @property {string} after Variant rendered full-frame.
 * @property {string} before Variant rendered into the scissored region.
 *
 * @typedef {object} StyleComparisonRenderOptions
 * @property {number} [split] Fraction of the frame showing `before`, 0..1.
 *   Defaults to the comparison's current split.
 * @property {StyleComparisonTarget} [target] Render into this target instead of
 *   the canvas. Omit for the canvas.
 *
 * @typedef {object} StyleComparisonVariantRenderOptions
 * @property {StyleComparisonTarget} [target]
 *
 * @typedef {object} StyleComparisonRenderResult
 * @property {number} fraction
 * @property {StyleComparisonSize} size
 */

/**
 * Child meshes a style treatment generates on top of the subject. They exist
 * only in the styled variant, so a variant captured before the style was
 * applied does not know them and must hide — never remove — them.
 */
export const STYLE_COMPARISON_GENERATED_NODE_FLAGS = Object.freeze([
  'isToonOutline',
  'isToonFurShell',
]);

function isRenderable(node) {
  return Boolean(node?.isMesh || node?.isSkinnedMesh || node?.isPoints
    || node?.isLine || node?.isSprite || node?.isInstancedMesh);
}

function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function captureNodeState(node) {
  return {
    castShadow: node.castShadow,
    // Geometry, skeleton and morph influences are captured for the identity
    // audit and are NEVER re-applied. A variant that changed them would not be
    // a material treatment.
    geometry: node.geometry ?? null,
    material: Array.isArray(node.material) ? [...node.material] : (node.material ?? null),
    morphTargetInfluences: node.morphTargetInfluences ?? null,
    receiveShadow: node.receiveShadow,
    renderOrder: node.renderOrder,
    skeleton: node.skeleton ?? null,
    visible: node.visible,
  };
}

function applyNodeState(node, state) {
  node.material = Array.isArray(state.material) ? [...state.material] : state.material;
  node.castShadow = state.castShadow;
  node.receiveShadow = state.receiveShadow;
  node.renderOrder = state.renderOrder;
  node.visible = state.visible;
}

function matrixSignature(matrix) {
  return matrix ? matrix.elements.map((value) => value.toFixed(9)).join(',') : '';
}

function collectLightSignature(scene) {
  const lights = [];
  scene.traverse((node) => {
    if (!node?.isLight) return;
    node.updateWorldMatrix(true, false);
    lights.push({
      color: node.color ? node.color.getHex() : null,
      intensity: Number(node.intensity ?? 0),
      matrixWorld: matrixSignature(node.matrixWorld),
      name: node.name || node.type,
      shadowBias: node.shadow ? Number(node.shadow.bias ?? 0) : null,
      type: node.type,
      uuid: node.uuid,
    });
  });
  lights.sort((a, b) => (a.uuid < b.uuid ? -1 : 1));
  return lights;
}

function collectMixerSignature(roots) {
  const mixers = [];
  const seen = new Set();
  for (const root of roots) {
    root.traverse((node) => {
      const mixer = node?.userData?.toonlabAnimationMixer;
      if (mixer && !seen.has(mixer)) {
        seen.add(mixer);
        mixers.push({ time: Number(mixer.time ?? 0) });
      }
    });
  }
  return mixers;
}

/**
 * Snapshot of everything the §11 contract requires to be equal across both
 * halves: camera matrices, light transforms, exposure and render state, plus
 * the animation clock of any registered mixer. Compared before and after a
 * composite render — if the wipe moved any of them, the A/B is not honest.
 */
export function captureComparisonFrameState({ camera, mixers = [], renderer, scene }) {
  camera.updateMatrixWorld();
  return {
    camera: {
      far: Number(camera.far ?? 0),
      fov: Number(camera.fov ?? 0),
      matrixWorld: matrixSignature(camera.matrixWorld),
      matrixWorldInverse: matrixSignature(camera.matrixWorldInverse),
      near: Number(camera.near ?? 0),
      projectionMatrix: matrixSignature(camera.projectionMatrix),
      zoom: Number(camera.zoom ?? 1),
    },
    lights: collectLightSignature(scene),
    mixers: mixers.map((mixer) => ({ time: Number(mixer?.time ?? 0) })),
    renderState: {
      outputColorSpace: renderer.outputColorSpace,
      shadowMapEnabled: Boolean(renderer.shadowMap?.enabled),
      shadowMapType: renderer.shadowMap?.type ?? null,
      toneMapping: renderer.toneMapping,
      toneMappingExposure: Number(renderer.toneMappingExposure ?? 1),
    },
    scene: {
      backgroundIntensity: Number(scene.backgroundIntensity ?? 1),
      environmentIntensity: Number(scene.environmentIntensity ?? 1),
    },
  };
}

function diffFrameState(before, after, path = '', issues = []) {
  if (before === after) return issues;
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    if (a.length !== b.length) issues.push(`${path}.length ${a.length} → ${b.length}`);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      diffFrameState(a[index], b[index], `${path}[${index}]`, issues);
    }
    return issues;
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      diffFrameState(before[key], after[key], path ? `${path}.${key}` : key, issues);
    }
    return issues;
  }
  if (before !== after) issues.push(`${path}: ${String(before)} → ${String(after)}`);
  return issues;
}

/**
 * Creates a single-load A/B comparison over one scene and one camera.
 *
 * @param {object} options
 * @param {StyleComparisonRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.Camera} options.camera
 * @param {'vertical'|'horizontal'} [options.axis='vertical'] Divider orientation.
 *   `vertical` puts the `before` variant on the left; `horizontal` puts it on
 *   the bottom.
 * @param {number} [options.split=0.5] Fraction of the frame showing `before`.
 * @param {{after: string, before: string}} [options.variants]
 * @param {boolean} [options.refreshRenderPasses=true] Call each tracked root's
 *   `userData.toonlabCharacterStyleIntegration.refresh()` after a swap so the
 *   depth prepass / self-shadow target binds the live materials.
 */
export function createStyleComparison({
  axis = 'vertical',
  camera,
  refreshRenderPasses = true,
  renderer,
  scene,
  split = 0.5,
  variants = { after: 'toonlab', before: 'neutral' },
} = {}) {
  if (!renderer || typeof renderer.render !== 'function') {
    throw new TypeError('createStyleComparison requires a three.js renderer.');
  }
  if (!scene?.isScene) throw new TypeError('createStyleComparison requires a THREE.Scene.');
  if (!camera?.isCamera) throw new TypeError('createStyleComparison requires a THREE.Camera.');
  if (!STYLE_COMPARISON_AXES.includes(axis)) {
    throw new TypeError(`Unknown style comparison axis "${axis}".`);
  }

  /** @type {Set<THREE.Object3D>} */
  const roots = new Set();
  const variantRecords = new Map();
  const stateTrackers = new Map();
  /** Union of every renderable node seen by any capture. */
  const knownNodes = new Set();
  const mixers = new Set();

  let currentAxis = axis;
  let currentSplit = clamp01(split);
  let activeVariantId = null;
  let variantPair = { after: variants?.after ?? 'toonlab', before: variants?.before ?? 'neutral' };
  let disposed = false;
  /**
   * §11 requires both halves to share exposure exactly. This module never
   * touches `toneMappingExposure`, but a lighting system that rewrites it can
   * (ToonLab's does — see D19-043), and a mid-frame rewrite would make one half
   * brighter than the other with nothing in the image to explain it. Cheap to
   * check, impossible to spot by eye, so it is checked every frame and reported
   * rather than assumed.
   */
  let exposureDrift = null;
  let exposureDriftWarned = false;

  const scratchVector = new THREE.Vector4();
  const scratchColor = new THREE.Color();

  // THE COMPOSITE — variant A full-frame, variant B scissored over it.
  //
  // Three separate renderer defects had to be fixed to make this exact; each
  // produced a plausible image and failed only under a pixel diff, which is
  // why §11 asks for a proof and not a screenshot. See the deficiency log
  // (D19-001) for the measurements.
  //
  //   1. three keeps TWO scissor rectangles. With a render target bound it
  //      reads the rect off `renderTarget.scissor` and ignores
  //      `renderer.setScissor` entirely, while still gating both on the CANVAS
  //      target's `scissorTest`. Setting one of the two is a silent no-op that
  //      renders a full frame.
  //   2. A colour-attachment clear is ALWAYS attachment-wide — no graphics API
  //      scissors a clear — so the second pass must not clear colour, or it
  //      erases the first pass. Suppressing the clear instead leaves the first
  //      variant's pixels wherever it drew OUTSIDE the second variant's
  //      silhouette (a toon outline shell is exactly that), so the region is
  //      repainted by hand first.
  //   3. `autoClearDepth = false` leaks into three's nested shadow-map passes:
  //      `resetRendererState` forces `autoClear` but not `autoClearDepth`, so
  //      the shadow map accumulates stale depth and shadow pixels drift with
  //      the split. Depth is therefore always cleared; the scissor already
  //      stops out-of-region colour writes, so it costs nothing.
  const clearScene = new THREE.Scene();
  // An NDC-unit orthographic camera, not a bare THREE.Camera — the renderer
  // calls updateProjectionMatrix() on whatever it is handed.
  const clearCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clearMaterial = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const clearQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), clearMaterial);
  clearQuad.frustumCulled = false;
  clearScene.add(clearQuad);

  function paintScissorClear() {
    if (scene.background?.isColor) scratchColor.copy(scene.background);
    else renderer.getClearColor(scratchColor);
    clearMaterial.color.copy(scratchColor);
    clearMaterial.opacity = scene.background?.isColor ? 1 : (renderer.getClearAlpha?.() ?? 1);
    clearMaterial.transparent = clearMaterial.opacity < 1;
    // Runs with the caller's autoClear flags in force (colour off, depth on),
    // so this single draw both repaints the scissored region and is the pass
    // that clears depth for the variant render that follows it.
    renderer.render(clearScene, clearCamera);
  }

  function assertLive() {
    if (disposed) throw new Error('This style comparison has been disposed.');
  }

  function eachRenderable(callback) {
    for (const root of roots) {
      root.traverse((node) => {
        if (isRenderable(node)) callback(node, root);
      });
    }
  }

  /** @param {StyleComparisonTarget} target @returns {StyleComparisonSize} */
  function drawingBufferSize(target) {
    if (target) return { height: target.height, width: target.width };
    renderer.getSize(scratchVector);
    const pixelRatio = renderer.getPixelRatio?.() ?? 1;
    return {
      height: Math.max(1, Math.round(scratchVector.y * pixelRatio)),
      width: Math.max(1, Math.round(scratchVector.x * pixelRatio)),
    };
  }

  /**
   * The scissor rectangle covering the `before` half, in the renderer's
   * bottom-left-origin pixel space. Exposed so a verifier compares exactly the
   * region the wipe writes rather than re-deriving it.
   */
  /**
   * @param {number} fraction
   * @param {StyleComparisonSize} size
   * @returns {StyleComparisonRect}
   */
  function scissorRectFor(fraction, size) {
    const clamped = clamp01(fraction);
    if (currentAxis === 'vertical') {
      return {
        height: size.height,
        width: Math.round(size.width * clamped),
        x: 0,
        y: 0,
      };
    }
    return {
      height: Math.round(size.height * clamped),
      width: size.width,
      x: 0,
      y: 0,
    };
  }

  /**
   * @param {THREE.Object3D} root
   * @param {{mixer?: THREE.AnimationMixer|null}} [options]
   * @returns {() => void} Untrack.
   */
  function track(root, { mixer = null } = {}) {
    assertLive();
    if (!root?.isObject3D) throw new TypeError('track() requires an Object3D.');
    roots.add(root);
    if (mixer) {
      mixers.add(mixer);
      root.userData.toonlabAnimationMixer = mixer;
    }
    return () => { roots.delete(root); };
  }

  /**
   * Registers non-material scene state that legitimately differs between the
   * two treatments — a neutral sky, a neutral fog colour, a neutral background.
   * `capture()` records it per variant and `activate()` restores it. Exposure
   * and tone mapping are deliberately NOT trackable: §11 requires both halves
   * to share them, and `auditIdentity()` enforces that.
   */
  /**
   * @param {string} id
   * @param {{apply: (value: unknown) => void, capture: () => unknown}} handlers
   * @returns {() => void} Untrack.
   */
  function trackState(id, { apply, capture }) {
    assertLive();
    if (typeof apply !== 'function' || typeof capture !== 'function') {
      throw new TypeError(`trackState("${id}") needs both capture() and apply().`);
    }
    stateTrackers.set(id, { apply, capture });
    return () => { stateTrackers.delete(id); };
  }

  /**
   * @param {string} variantId
   * @param {{label?: string}} [options]
   * @returns {{id: string, label: string, materialCount: number, nodeCount: number}}
   */
  function capture(variantId, { label = variantId } = {}) {
    assertLive();
    const id = String(variantId ?? '').trim();
    if (!id) throw new TypeError('capture() requires a variant id.');
    const nodes = new Map();
    eachRenderable((node) => {
      nodes.set(node, captureNodeState(node));
      knownNodes.add(node);
    });
    const states = new Map();
    for (const [stateId, tracker] of stateTrackers) states.set(stateId, tracker.capture());
    variantRecords.set(id, { id, label, nodes, states });
    activeVariantId = id;
    return {
      id,
      label,
      nodeCount: nodes.size,
      materialCount: new Set([...nodes.values()].flatMap(({ material }) => materialList(material))).size,
    };
  }

  /**
   * @param {string} variantId
   * @param {{force?: boolean}} [options]
   * @returns {object} The activated variant record.
   */
  function activate(variantId, { force = false } = {}) {
    assertLive();
    const record = variantRecords.get(variantId);
    if (!record) throw new Error(`Unknown comparison variant "${variantId}".`);
    if (!force && activeVariantId === variantId) return record;
    for (const [node, state] of record.nodes) applyNodeState(node, state);
    // Nodes a later style added (outlines, fur shells) are unknown to an
    // earlier variant. Hide them; never remove them — removal is what makes
    // the style transaction too expensive to run per frame.
    for (const node of knownNodes) {
      if (!record.nodes.has(node)) node.visible = false;
    }
    for (const [stateId, tracker] of stateTrackers) {
      if (record.states.has(stateId)) tracker.apply(record.states.get(stateId));
    }
    if (refreshRenderPasses) {
      for (const root of roots) {
        root.userData?.toonlabCharacterStyleIntegration?.refresh?.();
      }
    }
    activeVariantId = variantId;
    return record;
  }

  /**
   * @template T
   * @param {StyleComparisonTarget|undefined} target
   * @param {() => T} callback
   * @returns {T}
   */
  function withRendererState(target, callback) {
    const previousTarget = renderer.getRenderTarget();
    const previousScissorTest = renderer.getScissorTest();
    const previousScissor = new THREE.Vector4();
    renderer.getScissor(previousScissor);
    const previousAutoClear = {
      autoClear: renderer.autoClear,
      autoClearColor: renderer.autoClearColor,
      autoClearDepth: renderer.autoClearDepth,
      autoClearStencil: renderer.autoClearStencil,
    };
    const previousTargetScissor = target
      ? { rect: target.scissor.clone(), test: target.scissorTest }
      : null;
    try {
      if (target !== undefined) renderer.setRenderTarget(target ?? null);
      return callback();
    } finally {
      renderer.setScissorTest(previousScissorTest);
      renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
      Object.assign(renderer, previousAutoClear);
      if (previousTargetScissor) {
        target.scissor.copy(previousTargetScissor.rect);
        target.scissorTest = previousTargetScissor.test;
      }
      if (target !== undefined) renderer.setRenderTarget(previousTarget);
    }
  }

  /**
   * Installs a scissor rectangle on BOTH surfaces three tracks — see defect (1)
   * above. Setting only `renderer.setScissor` renders a full frame into a
   * render target with no error of any kind.
   *
   * @param {StyleComparisonTarget} target
   * @param {StyleComparisonRect} rect
   * @returns {void}
   */
  function setScissorFor(target, rect) {
    if (target) {
      target.scissor.set(rect.x, rect.y, rect.width, rect.height);
      target.scissorTest = true;
    } else {
      renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    }
    renderer.setScissorTest(true);
  }

  /**
   * Clears any scissor still set, on BOTH surfaces three tracks.
   *
   * three's renderer keeps two scissor rectangles: the canvas target's (set by
   * `renderer.setScissor`) and each RenderTarget's own `target.scissor`. When a
   * render target is bound it reads the rectangle off the TARGET and ignores
   * `renderer.setScissor` entirely — while still gating both on the canvas
   * target's `scissorTest` flag. Touching only one of the two is a silent no-op,
   * so every variant render explicitly clears both before drawing: a stale
   * host scissor would crop one half and nothing would report it.
   */
  /** @param {StyleComparisonTarget} target @returns {void} */
  function clearScissorFor(target) {
    if (target) target.scissorTest = false;
    renderer.setScissorTest(false);
  }

  /**
   * Renders one variant full-frame. The A/B halves in isolation.
   *
   * @param {string} variantId
   * @param {StyleComparisonVariantRenderOptions} [options]
   * @returns {void}
   */
  function renderVariant(variantId, { target } = {}) {
    assertLive();
    activate(variantId);
    return withRendererState(target, () => {
      clearScissorFor(target ?? null);
      renderer.render(scene, camera);
    });
  }

  /**
   * Renders the composite wipe: the `after` variant full-frame, then the
   * `before` variant scissored into the leading region. Nothing between the
   * two `renderer.render` calls touches the camera, the lights, the exposure
   * or any animation clock — which is precisely why the comparison is honest.
   */
  /** @param {StyleComparisonRenderOptions} [options] @returns {StyleComparisonRenderResult} */
  function render({ split: splitOverride, target } = {}) {
    assertLive();
    const fraction = splitOverride === undefined ? currentSplit : clamp01(splitOverride);
    const resolvedTarget = target ?? null;
    const size = drawingBufferSize(resolvedTarget);
    const exposureAtStart = renderer.toneMappingExposure;
    const toneMappingAtStart = renderer.toneMapping;
    const result = withRendererState(target, () => {
      activate(variantPair.after);
      clearScissorFor(resolvedTarget);
      renderer.autoClear = true;
      renderer.autoClearColor = true;
      renderer.autoClearDepth = true;
      renderer.render(scene, camera);
      // NOTHING happens between the two renders: no clock advanced, no camera
      // moved, no light touched, no exposure written. That gap is the whole A/B
      // claim, and it is a scissor call wide.
      if (fraction > 0) {
        activate(variantPair.before);
        setScissorFor(resolvedTarget, scissorRectFor(fraction, size));
        renderer.autoClear = true;
        renderer.autoClearColor = false;
        renderer.autoClearDepth = true;
        paintScissorClear();
        renderer.render(scene, camera);
        clearScissorFor(resolvedTarget);
      }
      return { fraction, size };
    });

    if (renderer.toneMappingExposure !== exposureAtStart
      || renderer.toneMapping !== toneMappingAtStart) {
      exposureDrift = {
        exposure: { after: renderer.toneMappingExposure, before: exposureAtStart },
        toneMapping: { after: renderer.toneMapping, before: toneMappingAtStart },
      };
      if (!exposureDriftWarned) {
        exposureDriftWarned = true;
        console.warn(
          'ToonLab style comparison: exposure or tone mapping changed DURING a composite render. '
          + 'The two halves no longer share exposure, which invalidates the A/B. '
          + 'Something outside this module is writing renderer.toneMappingExposure mid-frame.',
          exposureDrift,
        );
      }
    } else {
      exposureDrift = null;
    }
    return result;
  }

  /**
   * Structural proof that the two variants differ only by material treatment:
   * the same geometry buffer, the same skeleton and the same morph influences
   * on every tracked node, and exactly one shared camera / light rig /
   * exposure. Cheap enough to assert every frame in a lab.
   */
  function auditIdentity() {
    assertLive();
    const issues = [];
    const ids = [...variantRecords.keys()];
    if (ids.length < 2) issues.push(`Only ${ids.length} variant(s) captured; a comparison needs two.`);
    for (const required of [variantPair.before, variantPair.after]) {
      if (!variantRecords.has(required)) issues.push(`Variant "${required}" was never captured.`);
    }

    let sharedNodes = 0;
    let divergentMaterials = 0;
    const [first, ...rest] = ids.map((id) => variantRecords.get(id));
    if (first) {
      for (const [node, state] of first.nodes) {
        let shared = true;
        for (const other of rest) {
          const otherState = other.nodes.get(node);
          if (!otherState) continue;
          if (otherState.geometry !== state.geometry) {
            issues.push(`Node "${node.name || node.uuid}" has a different geometry in "${other.id}".`);
            shared = false;
          }
          if (otherState.skeleton !== state.skeleton) {
            issues.push(`Node "${node.name || node.uuid}" has a different skeleton in "${other.id}".`);
            shared = false;
          }
          if (otherState.morphTargetInfluences !== state.morphTargetInfluences) {
            issues.push(`Node "${node.name || node.uuid}" has different morph influences in "${other.id}".`);
            shared = false;
          }
          const a = materialList(state.material);
          const b = materialList(otherState.material);
          if (a.length !== b.length || a.some((material, index) => material !== b[index])) {
            divergentMaterials += 1;
          }
        }
        if (shared) sharedNodes += 1;
      }
    }
    if (divergentMaterials === 0 && ids.length >= 2) {
      issues.push('No tracked node has a different material between variants — nothing to compare.');
    }
    if (exposureDrift) {
      issues.push(
        `Exposure changed during the composite render (${exposureDrift.exposure.before} → ${exposureDrift.exposure.after}); the halves do not share exposure.`,
      );
    }

    const mixerList = [...mixers];
    const observedMixers = collectMixerSignature(roots);
    return {
      axis: currentAxis,
      exposureDrift,
      frameState: captureComparisonFrameState({
        camera, mixers: mixerList, renderer, scene,
      }),
      issues,
      mixerCount: mixerList.length || observedMixers.length,
      ok: issues.length === 0,
      sharedGeometryNodes: sharedNodes,
      split: currentSplit,
      trackedNodes: knownNodes.size,
      trackedRoots: roots.size,
      variants: ids,
      variantsWithDivergentMaterials: divergentMaterials,
    };
  }

  return {
    activate,
    auditIdentity,
    capture,
    get activeVariant() { return activeVariantId; },
    /** Non-null when exposure or tone mapping moved during the last composite. */
    get exposureDrift() { return exposureDrift; },
    get axis() { return currentAxis; },
    get camera() { return camera; },
    get mixers() { return [...mixers]; },
    get renderer() { return renderer; },
    get roots() { return [...roots]; },
    get scene() { return scene; },
    get split() { return currentSplit; },
    get variantIds() { return [...variantRecords.keys()]; },
    get variants() { return { ...variantPair }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      roots.clear();
      variantRecords.clear();
      stateTrackers.clear();
      knownNodes.clear();
      mixers.clear();
      clearQuad.geometry.dispose();
      clearMaterial.dispose();
    },
    render,
    renderVariant,
    /** @type {(fraction: number, size?: StyleComparisonSize) => StyleComparisonRect} */
    scissorRectFor: (fraction, size) => scissorRectFor(fraction, size ?? drawingBufferSize(null)),
    /** @param {StyleComparisonAxis} next @returns {StyleComparisonAxis} */
    setAxis(next) {
      if (!STYLE_COMPARISON_AXES.includes(next)) throw new TypeError(`Unknown axis "${next}".`);
      currentAxis = next;
      return currentAxis;
    },
    /** @param {number} next @returns {number} */
    setSplit(next) {
      currentSplit = clamp01(next);
      return currentSplit;
    },
    /**
     * @param {Partial<StyleComparisonVariantPair>} [pair]
     * @returns {StyleComparisonVariantPair}
     */
    setVariants({ after, before } = {}) {
      variantPair = {
        after: after ?? variantPair.after,
        before: before ?? variantPair.before,
      };
      return { ...variantPair };
    },
    track,
    trackState,
  };
}

function countDifferences(a, b, { height, region, tolerance = 0, width }) {
  const x0 = region?.x ?? 0;
  const y0 = region?.y ?? 0;
  const x1 = Math.min(width, x0 + (region?.width ?? width));
  const y1 = Math.min(height, y0 + (region?.height ?? height));
  let differing = 0;
  let maxDelta = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4;
      let delta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        delta = Math.max(delta, Math.abs(a[index + channel] - b[index + channel]));
      }
      if (delta > maxDelta) maxDelta = delta;
      if (delta > tolerance) differing += 1;
    }
  }
  const total = Math.max(1, (x1 - x0) * (y1 - y0));
  return { differing, fraction: differing / total, maxDelta, total };
}

function differenceMask(a, b, { height, tolerance, width }) {
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const index = pixel * 4;
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      delta = Math.max(delta, Math.abs(a[index + channel] - b[index + channel]));
    }
    if (delta > tolerance) mask[pixel] = 1;
  }
  return mask;
}

/**
 * Proves that a comparison is a true renderer split of one framing, not two
 * separately framed images — and that everything outside the treated subject
 * is bit-identical between the halves.
 *
 * The five assertions:
 *
 *  1. `split = 0` is bit-identical to a full-frame render of the `after`
 *     variant.
 *  2. `split = 1` is bit-identical to a full-frame render of the `before`
 *     variant.
 *  3. At any intermediate split, the region inside the scissor is bit-identical
 *     to the SAME region of the `before` full frame, and the region outside it
 *     is bit-identical to the same region of the `after` full frame. A pixel at
 *     (x, y) in the wipe therefore equals that pixel in a full-frame render of
 *     its own variant — which is only possible if both halves share one camera.
 *  4. Camera matrices, light transforms, exposure, tone mapping, shadow state
 *     and every registered animation clock are unchanged by the composite
 *     render.
 *  5. Pixels that differ between the two variants lie inside the region the
 *     tracked subject affects (measured by rendering with the subject hidden),
 *     so nothing outside the intended material treatment moved.
 *
 * Deterministic and reusable: it renders into its own render target, so it does
 * not depend on canvas size, page compositing or screenshot timing. This is the
 * routine the filler register's equivalence test calls.
 */
export async function verifyStyleComparisonIdentity(comparison, {
  height = 540,
  onStage = null,
  splits = [0.25, 0.5, 0.75],
  tolerance = 0,
  width = 960,
} = {}) {
  const stage = (name) => { onStage?.(name); };
  if (typeof comparison?.render !== 'function') {
    throw new TypeError('verifyStyleComparisonIdentity requires a style comparison.');
  }
  const { camera, renderer, scene } = comparison;
  if (typeof renderer.readRenderTargetPixelsAsync !== 'function') {
    throw new Error('Pixel-identity verification requires readRenderTargetPixelsAsync.');
  }
  const { after, before } = comparison.variants;
  const target = new THREE.RenderTarget(width, height, {
    depthBuffer: true,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  target.depthTexture = new THREE.DepthTexture(width, height);

  const read = async () => {
    const buffer = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
    return new Uint8Array(buffer.buffer ?? buffer);
  };

  const checks = [];
  const record = (id, description, result, extra = {}) => {
    checks.push({
      description,
      differingPixels: result.differing,
      fraction: result.fraction,
      id,
      maxChannelDelta: result.maxDelta,
      ok: result.differing === 0,
      totalPixels: result.total,
      ...extra,
    });
  };

  try {
    const stateBefore = captureComparisonFrameState({
      camera, mixers: comparison.mixers, renderer, scene,
    });

    stage('render-before');
    comparison.renderVariant(before, { target });
    const beforePixels = await read();
    stage('render-after');
    comparison.renderVariant(after, { target });
    const afterPixels = await read();

    // The subject-free plate: what the frame looks like with nothing tracked
    // in it. Any pixel the subject can possibly influence — including its
    // shadows and its contribution to reflections — differs from this plate.
    stage('render-plate');
    const rootVisibility = comparison.roots.map((root) => [root, root.visible]);
    for (const [root] of rootVisibility) root.visible = false;
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const platePixels = await read();
    for (const [root, visible] of rootVisibility) root.visible = visible;

    stage('wipe-0');
    comparison.render({ split: 0, target });
    record('split-0-equals-after', `split=0 is bit-identical to a full "${after}" frame`,
      countDifferences(await read(), afterPixels, { height, tolerance, width }));

    stage('wipe-1');
    comparison.render({ split: 1, target });
    record('split-1-equals-before', `split=1 is bit-identical to a full "${before}" frame`,
      countDifferences(await read(), beforePixels, { height, tolerance, width }));

    for (const split of splits) {
      stage(`wipe-${split}`);
      comparison.render({ split, target });
      const wipe = await read();
      const rect = comparison.scissorRectFor(split, { height, width });
      const complement = comparison.axis === 'vertical'
        ? { height, width: width - rect.width, x: rect.width, y: 0 }
        : { height: height - rect.height, width, x: 0, y: rect.height };
      record(`split-${split}-inside`,
        `split=${split}: the scissored region equals the same region of "${before}"`,
        countDifferences(wipe, beforePixels, { height, region: rect, tolerance, width }),
        { region: rect, split });
      record(`split-${split}-outside`,
        `split=${split}: the region outside the scissor equals the same region of "${after}"`,
        countDifferences(wipe, afterPixels, { height, region: complement, tolerance, width }),
        { region: complement, split });
    }

    const stateAfter = captureComparisonFrameState({
      camera, mixers: comparison.mixers, renderer, scene,
    });
    const frameStateIssues = diffFrameState(stateBefore, stateAfter);
    checks.push({
      description: 'camera matrices, light transforms, exposure and animation clocks are unchanged by the wipe',
      differences: frameStateIssues,
      id: 'frame-state-stable',
      ok: frameStateIssues.length === 0,
    });

    stage('mask');
    const treated = differenceMask(afterPixels, platePixels, { height, tolerance, width });
    const treatedBefore = differenceMask(beforePixels, platePixels, { height, tolerance, width });
    for (let pixel = 0; pixel < treated.length; pixel += 1) {
      if (treatedBefore[pixel]) treated[pixel] = 1;
    }
    const variantDelta = differenceMask(afterPixels, beforePixels, { height, tolerance, width });
    let outsideTreatment = 0;
    let treatedPixels = 0;
    let changedPixels = 0;
    for (let pixel = 0; pixel < treated.length; pixel += 1) {
      if (treated[pixel]) treatedPixels += 1;
      if (!variantDelta[pixel]) continue;
      changedPixels += 1;
      if (!treated[pixel]) outsideTreatment += 1;
    }
    checks.push({
      changedPixels,
      description: 'every pixel that differs between the halves lies inside the treated subject',
      differingPixels: outsideTreatment,
      id: 'difference-confined-to-treatment',
      ok: outsideTreatment === 0,
      totalPixels: treated.length,
      treatedPixels,
    });

    stage('structural');
    const structural = comparison.auditIdentity();
    checks.push({
      description: 'both variants share geometry buffers, skeletons and morph influences',
      differences: structural.issues,
      id: 'structural-identity',
      ok: structural.ok,
    });

    return {
      checks,
      ok: checks.every((check) => check.ok),
      resolution: { height, width },
      structural,
      variants: { after, before },
    };
  } finally {
    target.depthTexture?.dispose?.();
    target.dispose();
  }
}
