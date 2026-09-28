// Shared capture guards (D19-154).
//
// WHY THIS EXISTS
//
// Two wipe plates in `launch-plan/review/captures/wipe/` were 13 KB and 15 KB
// against ~330 KB siblings. They were screenshots of the lab's "Preparing the
// comparison" overlay, and they were *precisely* the two plates showing the
// full-frame ToonLab variant — the headline evidence for the signature product
// moment. The project was carrying fake evidence for its most important shot
// and nothing reported it.
//
// The mechanism has three independent parts, and a guard has to cover all
// three or it just moves the hole:
//
//   1. READINESS IS NOT PAINTEDNESS. `verify-style-comparison.mjs` waited on
//      `document.body.dataset.wipeReady` and nothing else. That flag is set at
//      the end of module evaluation, BEFORE the first composite frame and
//      before the loading overlay's 260 ms opacity transition has run — and
//      that transition does not advance while the main thread is compiling
//      shaders. Reproduced twice while working on this shot: a first-compile
//      frame stalls ~2 s past `wipeReady`, and a fixed `waitForTimeout(900)`
//      lands the shutter squarely on the overlay.
//
//   2. A MISSING REPORT CRASHES THE RUN. `JSON.parse(await page.evaluate(...))`
//      on a `dataset.*Report` the page only writes on success throws
//      `SyntaxError: "undefined" is not valid JSON` — killing the run before
//      the manifest is written, so the previous run's manifest stays on disk
//      describing plates that no longer match it.
//
//   3. THE 41 MB GLB INTERMITTENTLY FAILS TO FETCH. Observed live during this
//      session: `TypeError: Failed to fetch` from the loader, after which the
//      page still reports ready and screenshots a near-empty frame.
//
// `capture-launch-garden.mjs` already had the readiness and file-size halves;
// this module generalises them, adds the paintedness wait and the safe dataset
// read, and gives every capture script one import instead of a private
// re-derivation. Several agents wrote their own harness and every one of them
// re-opened some part of this hole.

import { statSync } from 'node:fs';

/**
 * Minimum plausible PNG size for a rendered frame, in bytes.
 *
 * A frame that is nearly uniform compresses to almost nothing, which catches
 * the loading overlay, a black canvas and a camera pointed at nothing alike.
 *
 * Reading the canvas back through a 2D context does NOT work as an alternative:
 * a WebGPU canvas has no preserved drawing buffer, so it reports pure black on
 * a perfectly good frame and cries wolf on every capture. The PNG's own size is
 * the honest signal.
 *
 * The threshold MUST scale with resolution. `capture-launch-garden.mjs` used a
 * flat 40 KB, tuned at 1600x900; at 1920x1080 the overlay screenshot measured
 * 42 KB and would have passed it. Real frames at that size run 310–360 KB, so
 * pixels/32 (≈65 KB at 1080p) separates them by a factor of five while staying
 * under any legitimately sparse frame.
 */
export function minimumFrameBytes(width, height) {
  return Math.max(40_000, Math.round((width * height) / 32));
}

/**
 * Waits for the page to be ready AND for its loading overlay to have finished
 * fading, then settles.
 *
 * `readyExpression` and `errorExpression` are strings evaluated in the page so
 * callers keep their own dataset contract. Returns `{ ok, error, dataset }` —
 * it does NOT throw on timeout, because a capture run that dies on shot 3 of 10
 * leaves the earlier plates on disk with no manifest describing them.
 *
 * @param {import('playwright').Page} page
 * @param {object} options
 * @param {() => boolean} options.ready Page-side readiness predicate.
 * @param {() => unknown} [options.error] Page-side error predicate.
 * @param {string} [options.overlaySelector] Loading overlay to wait out.
 * @param {number} [options.timeout]
 * @param {number} [options.settleMs]
 */
export async function waitForPaintedFrame(page, {
  error = null,
  overlaySelector = '#loading',
  ready,
  settleMs = 700,
  timeout = 300_000,
} = {}) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      ([readySrc, errorSrc]) => {
        // eslint-disable-next-line no-new-func
        const readyFn = new Function(`return (${readySrc})`)();
        const errorFn = errorSrc ? new Function(`return (${errorSrc})`)() : null;
        return Boolean(readyFn()) || Boolean(errorFn?.());
      },
      [String(ready), error ? String(error) : null],
      { timeout },
    );
  } catch {
    return {
      dataset: await readDataset(page),
      error: `readiness timed out after ${((Date.now() - started) / 1000).toFixed(1)}s`,
      ok: false,
    };
  }

  // Readiness is not paintedness. The overlay hides on a CSS opacity
  // transition that does not advance while the main thread is compiling
  // shaders, so the flag can lead the visible frame by seconds.
  if (overlaySelector) {
    try {
      await page.waitForFunction(
        (selector) => {
          const node = document.querySelector(selector);
          if (!node) return true;
          const style = getComputedStyle(node);
          return style.display === 'none'
            || style.visibility === 'hidden'
            || Number(style.opacity) < 0.01;
        },
        overlaySelector,
        { timeout: 120_000 },
      );
    } catch {
      return {
        dataset: await readDataset(page),
        error: `loading overlay "${overlaySelector}" never cleared`,
        ok: false,
      };
    }
  }

  await page.waitForTimeout(settleMs);
  return { dataset: await readDataset(page), error: null, ok: true };
}

/** D19-067. A shared dev server pops a full-screen overlay on EVERY page it
 * serves when ANY lab fails to compile, and readiness still reports true — so a
 * neighbour's syntax error gets filed as this scene. Strip it before the
 * shutter and say so. */
export async function stripViteErrorOverlay(page, label = '') {
  const stripped = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('vite-error-overlay')];
    for (const node of nodes) node.remove();
    return nodes.length;
  });
  if (stripped > 0) {
    console.log(`${label}: WARNING — a vite error overlay was stripped before capture.`);
  }
  return stripped > 0;
}

/**
 * Reads a `document.body.dataset.*` value and JSON-parses it, returning null
 * rather than throwing.
 *
 * `JSON.parse(await page.evaluate(() => document.body.dataset.fooReport))`
 * throws `SyntaxError: "undefined" is not valid JSON` whenever the page renders
 * but fails to publish its report, which kills the run before the manifest is
 * written. The manifest is the thing that makes the plates auditable, so it
 * must survive a missing report.
 */
export async function readDatasetJson(page, key) {
  const raw = await page.evaluate((name) => document.body.dataset[name] ?? null, key);
  if (raw === null || raw === undefined || raw === 'undefined') return null;
  try {
    return JSON.parse(raw);
  } catch (cause) {
    return { error: `dataset.${key} is not valid JSON: ${String(cause).slice(0, 200)}` };
  }
}

/** Whole `document.body.dataset`, for failure diagnostics. */
export async function readDataset(page) {
  return page.evaluate(() => ({ ...document.body.dataset }));
}

/**
 * Screenshots and verifies the PNG is not a nearly-uniform frame.
 *
 * Returns `{ bytes, ok, path, minimum }`. Callers decide whether a suspect
 * plate fails the run — but no caller gets to be unaware of one.
 */
export async function screenshotWithFloor(page, path, { height, label = '', width } = {}) {
  await page.screenshot({ path });
  const bytes = statSync(path).size;
  const minimum = minimumFrameBytes(width, height);
  const ok = bytes >= minimum;
  if (!ok) {
    console.error(
      `${label || path}: SUSPECT PLATE — ${(bytes / 1024).toFixed(0)} KB is below the `
      + `${(minimum / 1024).toFixed(0)} KB floor for ${width}x${height}. The frame is nearly `
      + 'uniform, which is what a loading overlay, a black canvas or a failed asset fetch '
      + 'looks like. NOT filed as evidence.',
    );
  }
  return { bytes, minimum, ok, path };
}
