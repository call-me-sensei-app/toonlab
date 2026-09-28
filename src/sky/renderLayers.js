// Named draw-stack slots for the sky and for host content that has to sit in
// the middle of it. Placing by role instead of by raw renderOrder keeps the
// stack legible: `placeInLayer(panel, RenderLayer.sceneTransparent)` states the
// intent, where `panel.renderOrder = 3` states only the outcome.

/**
 * The named layers, in draw order — each layer draws over the ones above it.
 *
 * `list` is the draw list the layer belongs to. `material.transparent` is what
 * actually decides an object's list, and the opaque and transparent lists never
 * interleave, so `order` only sorts within one list. That is why a background
 * mesh left `transparent: true` cannot be pulled back by any order value, and
 * why `placeInLayer` warns about the mismatch instead of silently misplacing it.
 *
 * Orders are spaced 10 apart so `offset` can fan several meshes across one
 * layer without leaking into the next. `sceneTransparent` sits at 0 because
 * that is three.js' default renderOrder — unplaced host content lands there,
 * which is where it belongs.
 */
export const RenderLayer = Object.freeze({
  background: Object.freeze({ list: 'opaque', order: -1000 }),
  backgroundOverlay: Object.freeze({ list: 'transparent', order: -990 }),
  worldSurface: Object.freeze({ list: 'transparent', order: -980 }),
  atmosphereOverlay: Object.freeze({ list: 'transparent', order: -970 }),
  sceneTransparent: Object.freeze({ list: 'transparent', order: 0 }),
  foreground: Object.freeze({ list: 'transparent', order: 1000 }),
});

/** Layer names in draw order. */
export const RENDER_LAYER_NAMES = Object.freeze(Object.keys(RenderLayer));

export const RENDER_LISTS = Object.freeze(['opaque', 'transparent']);

/** Width of one layer's sort band; `offset` must stay inside it. */
export const RENDER_LAYER_BAND = 10;

export const RENDER_LAYER_USAGE = Object.freeze({
  atmosphereOverlay: 'An overlay that depth-tests against worldSurface.',
  background: 'A full-screen backdrop. Nothing draws behind it.',
  backgroundOverlay: 'A blended backdrop that writes no depth.',
  foreground: 'Always-on-top overlays — HUD, gizmos.',
  sceneTransparent: 'Host glass, particles, and decals.',
  worldSurface: 'A transparent surface that writes depth, such as water.',
});

export function getRenderLayer(name) {
  return RenderLayer[String(name ?? '')] ?? null;
}

function isRenderLayerSpec(layer) {
  return Boolean(layer)
    && typeof layer === 'object'
    && RENDER_LISTS.includes(layer.list)
    && Number.isFinite(layer.order);
}

function materialsOf(object) {
  const material = object?.material;
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
}

// Only renderables carry a meaningful renderOrder. A Group's own renderOrder is
// not inherited by its children during list sorting, so placing a group has to
// reach every drawable descendant or the placement silently does nothing.
function isRenderable(object) {
  return Boolean(object?.isMesh
    || object?.isLine
    || object?.isPoints
    || object?.isSprite
    || object?.isInstancedMesh
    || object?.isBatchedMesh);
}

function warnListMismatch(object, layer, name) {
  for (const material of materialsOf(object)) {
    const expected = layer.list === 'transparent';
    if (Boolean(material.transparent) === expected) continue;
    console.warn(
      `[renderLayers] "${object.name || object.type}" was placed in the ${name} layer `
      + `(${layer.list} list) but its material has transparent: ${Boolean(material.transparent)}. `
      + `The list, not the order, decides which pass it draws in.`,
    );
  }
}

/**
 * Assigns `object` to a layer. `offset` fans several meshes across one layer; a
 * higher offset draws later. Keep it in [0, 10) so the mesh stays in the band.
 */
export function placeInLayer(object, layer, offset = 0) {
  if (!object || typeof object !== 'object') {
    console.warn('[renderLayers] placeInLayer needs an Object3D.');
    return;
  }
  const spec = typeof layer === 'string' ? getRenderLayer(layer) : layer;
  if (!isRenderLayerSpec(spec)) {
    console.warn('[renderLayers] placeInLayer needs a RenderLayer member.');
    return;
  }
  const name = RENDER_LAYER_NAMES.find((key) => RenderLayer[key] === spec)
    ?? RENDER_LAYER_NAMES.find((key) => RenderLayer[key].order === spec.order)
    ?? 'custom';
  const shift = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  if (shift < 0 || shift >= RENDER_LAYER_BAND) {
    console.warn(
      `[renderLayers] offset ${shift} leaves the ${name} layer's band; keep it in [0, ${RENDER_LAYER_BAND}).`,
    );
  }
  const renderOrder = spec.order + shift;
  object.renderOrder = renderOrder;
  if (isRenderable(object)) warnListMismatch(object, spec, name);
  if (typeof object.traverse === 'function') {
    object.traverse((child) => {
      if (child === object || !isRenderable(child)) return;
      child.renderOrder = renderOrder;
      warnListMismatch(child, spec, name);
    });
  }
}
