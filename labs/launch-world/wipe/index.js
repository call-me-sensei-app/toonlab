// The §11 signature product moment, as a module the Stillwater Garden scene
// mounts rather than re-implements.
//
// FILL-001. The renderer primitive underneath this — `createStyleComparison`
// and `verifyStyleComparisonIdentity` — landed in the package
// (`src/renderer/styleComparison.js`, D19-001 FIXED). What lives here is the
// launch-world BINDING: which subjects a scene contributes, how the neutral
// baseline is captured before the style is applied, the draggable boundary, and
// the §11 shot rig. See docs/capability-status.md.
//
// THE CONTRACT WITH A SCENE OWNER
//
//   A scene hands the wipe `subjects`: objects that are already in the scene,
//   each with the function that applies its ToonLab treatment IN PLACE. The
//   wipe captures the neutral state, calls every `applyStyle()`, captures the
//   styled state, and from then on swaps between them by assigning material
//   references. No scene loads anything twice, and no scene owns any wipe code.
//
//   ONE RULE for `applyStyle()`: install a PRE-BUILT styled material, do not
//   mutate the neutral one. Domains that style by mutating settings in place
//   (ground shader, rock shader, water) leave both variants holding the same
//   material reference, and the wipe becomes a silent no-op. `wipe.report()`
//   surfaces that as "No tracked node has a different material between
//   variants" rather than letting it ship. `groundSubject.js` is the worked
//   example.
//
//     const wipe = await createLaunchStyleWipe({
//       camera, renderer, scene,
//       subjects: [
//         { id: 'yua', root: character.carrier, applyStyle: () => character.applyToonLab() },
//         { id: 'ground', root: garden.ground, applyStyle: () => garden.applyGroundStyle() },
//         { id: 'stones', root: garden.setStones, applyStyle: () => garden.applyRockStyle() },
//       ],
//     });
//     // per frame, INSTEAD of renderer.render(scene, camera):
//     wipe.render();

import {
  createStyleComparison,
  verifyStyleComparisonIdentity,
} from '../../../src/renderer/styleComparison.js';
import { createLaunchShotRig, resolveLaunchShot, shotRenderPolicy } from './shots.js';

export {
  GARDEN_FOOTPRINT,
  LAUNCH_FILM_GAUGE_MM,
  LAUNCH_MASTER_FORMAT,
  LAUNCH_SHOTS,
  LAUNCH_SHOT_IDS,
  assertShotFitsFootprint,
  createLaunchShotRig,
  resolveLaunchShot,
  shotRenderPolicy,
  solveDistanceForSubjectBand,
  verticalFovForLens,
} from './shots.js';

export const LAUNCH_WIPE_VARIANTS = Object.freeze({ after: 'toonlab', before: 'neutral' });

/**
 * Builds the single-load A/B for a launch scene.
 *
 * @param {object} options
 * @param {import('three').Camera} options.camera
 * @param {object} options.renderer A WebGPURenderer or WebGLRenderer.
 * @param {import('three').Scene} options.scene
 * @param {Array<{applyStyle: Function, id: string, mixer?: object, root: object}>} options.subjects
 *   Already-in-scene roots plus the function that styles each one IN PLACE.
 * @param {Array<{apply: Function, capture: Function, id: string}>} [options.sceneState]
 *   Non-material scene state that legitimately differs between treatments —
 *   a neutral sky, a neutral fog colour. Exposure is deliberately not
 *   trackable: §11 requires both halves to share it.
 * @param {'vertical'|'horizontal'} [options.axis]
 * @param {number} [options.split]
 * @param {(stage: string) => void} [options.onProgress]
 */
export async function createLaunchStyleWipe({
  axis = 'vertical',
  camera,
  onProgress = null,
  renderer,
  scene,
  sceneState = [],
  split = 0.5,
  subjects = [],
} = {}) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new TypeError('createLaunchStyleWipe requires at least one subject.');
  }

  const comparison = createStyleComparison({
    axis, camera, renderer, scene, split, variants: LAUNCH_WIPE_VARIANTS,
  });

  for (const subject of subjects) {
    if (!subject?.root?.isObject3D) {
      throw new TypeError(`Wipe subject "${subject?.id}" has no Object3D root.`);
    }
    comparison.track(subject.root, { mixer: subject.mixer ?? null });
  }
  for (const state of sceneState) {
    comparison.trackState(state.id, { apply: state.apply, capture: state.capture });
  }

  onProgress?.('Capturing the neutral baseline…');
  const neutral = comparison.capture(LAUNCH_WIPE_VARIANTS.before, { label: 'Neutral (standard PBR)' });

  onProgress?.('Applying the ToonLab treatment…');
  const styled = [];
  for (const subject of subjects) {
    styled.push({ id: subject.id, result: await subject.applyStyle() ?? null });
  }

  onProgress?.('Capturing the ToonLab variant…');
  const toonlab = comparison.capture(LAUNCH_WIPE_VARIANTS.after, { label: 'ToonLab Pro' });
  comparison.activate(LAUNCH_WIPE_VARIANTS.after);

  const identity = comparison.auditIdentity();

  return {
    comparison,
    get axis() { return comparison.axis; },
    get split() { return comparison.split; },
    dispose() { comparison.dispose(); },
    /** Structural + capture report, for `document.body.dataset` and Gate 3. */
    report() {
      return {
        axis: comparison.axis,
        identity: comparison.auditIdentity(),
        split: comparison.split,
        styled: styled.map(({ id }) => id),
        subjects: subjects.map(({ id }) => id),
        variants: {
          neutral: { ...neutral },
          toonlab: { ...toonlab },
        },
      };
    },
    render(options) { return comparison.render(options); },
    renderVariant(variantId, options) { return comparison.renderVariant(variantId, options); },
    setAxis(next) { return comparison.setAxis(next); },
    setSplit(next) { return comparison.setSplit(next); },
    get structural() { return identity; },
    subjects,
    /** The reusable pixel-identity proof. See src/renderer/styleComparison.js. */
    verify(options) { return verifyStyleComparisonIdentity(comparison, options); },
  };
}

/**
 * Draggable boundary over the render surface. Pointer capture keeps the drag
 * alive outside the element, and the divider is positioned from the SAME
 * fraction the renderer scissors with, so the visible line and the pixel seam
 * can never disagree.
 */
export function mountWipeDivider(host, wipe, {
  labels = { after: 'ToonLab Pro', before: 'Neutral' },
  onChange = null,
} = {}) {
  if (!host) throw new TypeError('mountWipeDivider requires a host element.');
  const layer = document.createElement('div');
  layer.className = 'wipe-layer';
  layer.dataset.axis = wipe.axis;

  const divider = document.createElement('div');
  divider.className = 'wipe-divider';
  divider.setAttribute('role', 'slider');
  divider.setAttribute('aria-label', 'Neutral to ToonLab comparison boundary');
  divider.setAttribute('aria-valuemin', '0');
  divider.setAttribute('aria-valuemax', '100');
  divider.tabIndex = 0;

  const grip = document.createElement('span');
  grip.className = 'wipe-grip';
  divider.append(grip);

  const beforeTag = document.createElement('span');
  beforeTag.className = 'wipe-tag wipe-tag--before';
  beforeTag.textContent = labels.before;
  const afterTag = document.createElement('span');
  afterTag.className = 'wipe-tag wipe-tag--after';
  afterTag.textContent = labels.after;

  layer.append(beforeTag, afterTag, divider);
  host.append(layer);

  function paint() {
    const fraction = wipe.split;
    const percent = `${(fraction * 100).toFixed(3)}%`;
    layer.dataset.axis = wipe.axis;
    if (wipe.axis === 'vertical') {
      divider.style.left = percent;
      divider.style.bottom = '';
    } else {
      // The renderer scissors from the bottom edge, so the divider is placed
      // from the bottom too — otherwise the line and the seam disagree.
      divider.style.bottom = percent;
      divider.style.left = '';
    }
    divider.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    onChange?.(fraction);
  }

  function fractionFromEvent(event) {
    const rect = host.getBoundingClientRect();
    if (wipe.axis === 'vertical') {
      return (event.clientX - rect.left) / Math.max(1, rect.width);
    }
    return 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
  }

  function onPointerMove(event) {
    wipe.setSplit(fractionFromEvent(event));
    paint();
  }

  function endDrag(event) {
    layer.releasePointerCapture?.(event.pointerId);
    layer.removeEventListener('pointermove', onPointerMove);
  }

  layer.addEventListener('pointerdown', (event) => {
    layer.setPointerCapture?.(event.pointerId);
    onPointerMove(event);
    layer.addEventListener('pointermove', onPointerMove);
  });
  layer.addEventListener('pointerup', endDrag);
  layer.addEventListener('pointercancel', endDrag);
  divider.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') wipe.setSplit(wipe.split - step);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') wipe.setSplit(wipe.split + step);
    else if (event.key === 'Home') wipe.setSplit(0);
    else if (event.key === 'End') wipe.setSplit(1);
    else return;
    event.preventDefault();
    paint();
  });

  paint();
  return { element: layer, paint, remove() { layer.remove(); } };
}
