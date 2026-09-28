import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  analyzeRgbaContent,
  compareRgbaImages,
  contentPass,
  metricsPass,
} from './golden-image-metrics.mjs';

const matrix = JSON.parse(await readFile(
  new URL('../quality/call-me-sensei-golden-matrix.json', import.meta.url),
  'utf8',
));

const image = (values) => ({ data: Uint8Array.from(values), height: 1, width: 2 });
const reference = image([20, 90, 30, 255, 90, 130, 210, 255]);
const identical = compareRgbaImages(reference, image(reference.data), matrix.capture.thresholds);
assert.equal(identical.comparable, true);
assert.equal(identical.meanDeltaE, 0);
assert.equal(identical.p95DeltaE, 0);
assert.equal(identical.pixelRatioAboveDeltaE, 0);
assert.equal(identical.ssim, 1);
assert.equal(metricsPass(identical, matrix.capture.thresholds), true);
const blankContent = analyzeRgbaContent(image([0, 0, 0, 255, 0, 0, 0, 255]));
assert.equal(contentPass(blankContent, matrix.capture.contentThresholds), false);
const visibleContent = analyzeRgbaContent(image([20, 90, 30, 255, 210, 230, 255, 255]));
assert.equal(contentPass(visibleContent, {
  maxClippedPixelRatio: 0.18,
  minLumaStandardDeviation: 8,
  minNonBlackPixelRatio: 0.1,
}), true);
const clippedContent = analyzeRgbaContent(image([255, 255, 255, 255, 20, 90, 30, 255]));
assert.equal(contentPass(clippedContent, matrix.capture.contentThresholds), false);

const changed = compareRgbaImages(
  reference,
  image([220, 190, 20, 255, 240, 240, 240, 255]),
  matrix.capture.thresholds,
);
assert.ok(changed.meanDeltaE > matrix.capture.thresholds.meanDeltaE);
assert.ok(changed.p95DeltaE > matrix.capture.thresholds.p95DeltaE);
assert.ok(changed.pixelRatioAboveDeltaE > matrix.capture.thresholds.pixelRatioAboveDeltaE);
assert.ok(changed.ssim < matrix.capture.thresholds.ssim);
assert.equal(metricsPass(changed, matrix.capture.thresholds), false);

const mismatch = compareRgbaImages(reference, {
  data: new Uint8Array(4), height: 1, width: 1,
});
assert.equal(mismatch.comparable, false);
assert.equal(metricsPass(mismatch, matrix.capture.thresholds), false);

const captureSource = await readFile(
  new URL('./capture-golden-fixtures.mjs', import.meta.url), 'utf8');
const captureBoundarySource = await readFile(
  new URL('../labs/shared/goldenSceneCapture.js', import.meta.url), 'utf8');
assert.match(captureSource, /__toonlabGoldenCapture\.freeze/,
  'capture must use the host-owned deterministic frame protocol');
assert.doesNotMatch(captureSource, /page\.clock/,
  'capture must not clear GPU surfaces by replacing the browser clock');
assert.match(captureSource, /rendererBackend/,
  'capture must reject silent renderer fallback');
assert.match(captureSource, /sceneQuality === quality/,
  'capture must reject a requested quality tier that the scene did not apply');
assert.match(captureSource, /repeatIndex < repeatCount/,
  'capture must honor the matrix repeat count instead of hard-coding two frames');
assert.match(captureSource, /advanceFrames\(count\)/,
  'capture must advance the matrix-owned deterministic simulation frame count');
assert.match(captureSource, /primeIndex < capturePrimeCount/,
  'capture must honor the matrix-owned GPU compositor prime count');
assert.match(captureSource, /__toonlabGoldenCapture\.readPng/,
  'capture must read the host-frozen bitmap without triggering another temporal render');
assert.match(captureSource, /GOLDEN_RENDERERS/,
  'capture must support bounded renderer-axis smoke and CI jobs');
assert.match(captureSource, /url\.searchParams\.set\('freecam'/,
  'integrated multipass captures must pin the real host camera before package passes run');
assert.match(captureSource, /job\.fixture\.cameraControl \? null : cameraPose/,
  'integrated captures must not render through a detached review-camera clone');
assert.match(captureSource, /telemetry/,
  'capture must record the runtime state that produced each frame');
assert.match(captureSource, /contentValid/,
  'capture must fail a blank or content-free GPU frame');
assert.match(captureSource, /releaseEvidence/,
  'capture report must preserve fixture evidence classification');
assert.doesNotMatch(captureSource, /update.*baseline|copyFile/i,
  'the harness must never auto-approve or overwrite reference images');
assert.match(captureBoundarySource,
  /requestAnimationFrame\(resolve\)[\s\S]*renderAsync\(state\.scene, activeCamera\)[\s\S]*const source = state\.gl\.domElement/,
  'the frozen bitmap must be copied after the explicit review-camera render');
assert.doesNotMatch(captureBoundarySource,
  /renderAsync\(state\.scene, activeCamera\)[\s\S]{0,180}requestAnimationFrame/,
  'the host loop must not overwrite the review-camera frame before snapshot');

console.log(JSON.stringify({
  changed: {
    meanDeltaE: changed.meanDeltaE,
    p95DeltaE: changed.p95DeltaE,
    pixelRatioAboveDeltaE: changed.pixelRatioAboveDeltaE,
    ssim: changed.ssim,
  },
  identical,
  schema: 'toonlab/golden-harness-verification@1',
}, null, 2));
