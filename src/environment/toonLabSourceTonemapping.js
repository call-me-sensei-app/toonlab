import {
  Fn,
  abs,
  atan,
  clamp,
  dot,
  exp,
  exp2,
  float,
  log,
  mat3,
  max,
  min,
  mix,
  sign,
  smoothstep,
  sqrt,
  vec3,
} from 'three/tsl';

// A project-local renderer enum. Three reserves its built-in tone-mapping
// values below 10; using a distinct value lets its normal output pipeline
// perform color-space encoding after this source-specific film curve.
export const TOONLAB_SOURCE_TONE_MAPPING = 1001;

/**
 * Output-device state used by the supplied macOS ToonLabShowcase reference capture.
 *
 * `r.HDR.Display.OutputDevice=0` initially requests SDR sRGB, but
 * GetTonemapperOutputDeviceParameters() resolves `r.TonemapperGamma=0` to
 * gamma 2.2 on Apple and changes the device to SDR_ExplicitGammaMapping.
 * ToonLab therefore writes power-2.2 codes. The screenshot helper only tags
 * those bytes with an sRGB PNG chunk; it does not convert the transfer curve.
 */
export const TOONLAB_SOURCE_TOONLAB_SHOWCASE_CAPTURE_OUTPUT = Object.freeze({
  displayGamma: 2.2,
  engine: 'ToonLab',
  inverseGamma: 1 / 2.2,
  mode: 'SDR_ExplicitGammaMapping',
  platform: 'Apple',
  pngTag: 'sRGB',
  requestedOutputDevice: 'SDR_sRGB',
  tonemapperGamma: 0,
});

/** CPU oracle for the explicit output-device branch in CombineLUTs. */
export function evaluateToonLabSourceOutputTransfer(
  linearColor,
  output = TOONLAB_SOURCE_TOONLAB_SHOWCASE_CAPTURE_OUTPUT,
) {
  const inverseGamma = Number.isFinite(Number(output?.inverseGamma))
    ? Number(output.inverseGamma)
    : 1 / Math.max(Number(output?.displayGamma) || 1, 1);
  return linearColor.map((channel) => Math.max(Number(channel) || 0, 0) ** inverseGamma);
}

const AP1_LUMA = vec3(0.2722287168, 0.6740817658, 0.0536895174);

// TSL's scalar mat3() overload follows THREE.Matrix3 and accepts row-major
// values; its backend performs the required column-major shader-constructor
// reordering. Keep these in the same row-major order as ToonLab's HLSL sources.
const LINEAR_SRGB_TO_AP1 = mat3(
  0.6130974024, 0.3395231461, 0.0473794514,
  0.0701937225, 0.9163538791, 0.0134523986,
  0.0206155929, 0.1095697729, 0.8698146341,
);
const AP1_TO_LINEAR_SRGB = mat3(
  1.7050509926, -0.6217921205, -0.0832588722,
  -0.1302564175, 1.1408047365, -0.0105483190,
  -0.0240033568, -0.1289689761, 1.1529723328,
);
const AP1_TO_AP0 = mat3(
  0.6954522414, 0.1406786965, 0.1638690622,
  0.0447945634, 0.8596711185, 0.0955343182,
  -0.0055258826, 0.0040252103, 1.0015006723,
);
const AP0_TO_AP1 = mat3(
  1.4514393161, -0.2365107469, -0.2149285693,
  -0.0765537734, 1.1762296998, -0.0996759264,
  0.0083161484, -0.0060324498, 0.9977163014,
);
const BLUE_CORRECT_AP1 = mat3(
  0.9386393778, 0, 0.0613606221,
  0, 0.8307941330, 0.1692058671,
  0, 0, 1,
);
const BLUE_CORRECT_INV_AP1 = mat3(
  1.0653748755, 0.0000014467, -0.0653710053,
  -0.0000003456, 1.2036635245, -0.2036677199,
  0.0000000198, 0.0000000212, 0.9999996001,
);
// PostProcessCombineLUTs.usf constructs this as
//   Wide_2_AP1 * AP1_2_sRGB.
// It deliberately expands bright saturated sRGB colors toward a gamut between
// P3 and AP1 before color correction.
export const TOONLAB_SOURCE_EXPAND_GAMUT_AP1 = Object.freeze([
  Object.freeze([1.3704123718, -0.3292921877, -0.0636831194]),
  Object.freeze([-0.0834334917, 1.0970927480, -0.0108613795]),
  Object.freeze([-0.0257933209, -0.0986257988, 1.2036949526]),
]);
const EXPAND_GAMUT_AP1 = mat3(
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[0][0],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[0][1],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[0][2],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[1][0],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[1][1],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[1][2],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[2][0],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[2][1],
  TOONLAB_SOURCE_EXPAND_GAMUT_AP1[2][2],
);

const LOG10_018 = Math.log10(0.18);

function scalarSetting(settings, key, fallback) {
  const value = Number(settings?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function vector4Setting(settings, key, fallback) {
  const value = settings?.[key];
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((fallbackChannel, index) => {
    const channel = Number(value[index]);
    return Number.isFinite(channel) ? channel : fallbackChannel;
  });
}

export function resolveToonLabSourceFilmSettings(settings = {}) {
  const blackClip = scalarSetting(settings, 'film_black_clip', 0);
  const shoulder = scalarSetting(settings, 'film_shoulder', 0.26);
  const slope = Math.max(scalarSetting(settings, 'film_slope', 0.88), 1e-5);
  const toe = scalarSetting(settings, 'film_toe', 0.55);
  const whiteClip = scalarSetting(settings, 'film_white_clip', 0.04);
  const toeScale = Math.max(1 + blackClip - toe, 1e-5);
  const shoulderScale = Math.max(1 + whiteClip - shoulder, 1e-5);
  const toeMatch = toe > 0.8
    ? (1 - toe - 0.18) / slope + LOG10_018
    : LOG10_018 - 0.5 * Math.log(
      (1 + ((0.18 + blackClip) / toeScale - 1))
      / (1 - ((0.18 + blackClip) / toeScale - 1)),
    ) * (toeScale / slope);
  const straightMatch = (1 - toe) / slope - toeMatch;
  const shoulderMatch = shoulder / slope - straightMatch;
  const saturation = vector4Setting(
    settings,
    'color_saturation',
    [1, 1, 1, 1],
  );
  const contrast = vector4Setting(settings, 'color_contrast', [1, 1, 1, 1]);
  const gamma = vector4Setting(settings, 'color_gamma', [1, 1, 1, 1]);
  const gain = vector4Setting(settings, 'color_gain', [1, 1, 1, 1]);
  const offset = vector4Setting(settings, 'color_offset', [0, 0, 0, 0]);
  return {
    blackClip,
    blueCorrection: scalarSetting(settings, 'blue_correction', 0.6),
    colorContrast: contrast.slice(0, 3).map((channel) => channel * contrast[3]),
    colorGain: gain.slice(0, 3).map((channel) => channel * gain[3]),
    colorGamma: gamma.slice(0, 3).map((channel) => channel * gamma[3]),
    colorOffset: offset.slice(0, 3).map((channel) => channel + offset[3]),
    colorSaturation: saturation.slice(0, 3).map((channel) => channel * saturation[3]),
    expandGamut: scalarSetting(settings, 'expand_gamut', 1),
    shoulder,
    shoulderMatch,
    shoulderScale,
    slope,
    straightMatch,
    toe,
    toeMatch,
    toeScale,
    toneCurveAmount: scalarSetting(settings, 'tone_curve_amount', 1),
    whiteClip,
  };
}

/**
 * ToonLab's filmic tonemapper, including ACES glow/red modifiers, the source
 * film controls, AP1 saturation, and the legacy blue correction/un-correction.
 * The implementation follows TonemapCommon.ush and
 * PostProcessCombineLUTs.usf rather than approximating them with Three's
 * stock ACES fit.
 */
export function createToonLabSourceToneMapping(settings = {}, {
  outputTransfer = null,
} = {}) {
  const film = resolveToonLabSourceFilmSettings(settings);
  const blackClip = float(film.blackClip);
  const blueCorrection = float(film.blueCorrection);
  const colorContrast = vec3(...film.colorContrast);
  const colorGain = vec3(...film.colorGain);
  const colorGamma = vec3(...film.colorGamma);
  const colorOffset = vec3(...film.colorOffset);
  const colorSaturation = vec3(...film.colorSaturation);
  const expandGamut = float(film.expandGamut);
  const shoulderMatch = float(film.shoulderMatch);
  const shoulderScale = float(film.shoulderScale);
  const slope = float(film.slope);
  const straightMatch = float(film.straightMatch);
  const toeMatch = float(film.toeMatch);
  const toeScale = float(film.toeScale);
  const toneCurveAmount = float(film.toneCurveAmount);
  const whiteClip = float(film.whiteClip);
  const outputInverseGamma = outputTransfer?.mode === 'SDR_ExplicitGammaMapping'
    ? float(
      Number.isFinite(Number(outputTransfer.inverseGamma))
        ? Number(outputTransfer.inverseGamma)
        : 1 / Math.max(Number(outputTransfer.displayGamma) || 1, 1),
    )
    : null;

  // These values are deliberately compiled as constants. Tone mapping runs in
  // both the scene pass and RenderPipeline's output pass; generic TSL uniforms
  // are object-scoped and are not available in both pipelines. Constants keep
  // the authored post-process volume deterministic across those render paths.
  return Fn(([inputColor, exposure]) => {
  let colorAP1 = LINEAR_SRGB_TO_AP1
    .mul(inputColor.mul(exposure))
    .max(0)
    .toVar('toonLabColorAP1');

  // Expand bright saturated colors outside sRGB before color correction. The
  // zero-luminance select is the analytic limit of ToonLab's expression and avoids
  // a 0/0 when this function is evaluated directly rather than through its LUT.
  const gradeLuma = dot(colorAP1, AP1_LUMA);
  const safeGradeLuma = max(gradeLuma, 1e-10);
  const chromaDelta = colorAP1.div(safeGradeLuma).sub(1);
  const chromaDistanceSquared = dot(chromaDelta, chromaDelta);
  let expandAmount = float(1).sub(exp2(chromaDistanceSquared.mul(-4)))
    .mul(float(1).sub(exp2(
      expandGamut.mul(gradeLuma).mul(gradeLuma).mul(-4),
    )))
    .toVar('toonLabExpandAmount');
  expandAmount.assign(gradeLuma.lessThanEqual(1e-10).select(0, expandAmount));
  colorAP1.assign(mix(
    colorAP1,
    EXPAND_GAMUT_AP1.mul(colorAP1),
    expandAmount,
  ));

  // Source shadow/midtone/highlight controls are all their neutral defaults,
  // so ColorCorrectAll collapses exactly to one application of the exported
  // global controls. ToonLab treats FVector4.w as an overall multiplier/addend;
  // notably ToonLabShowcase [1.1,1.1,1.1,1.1] therefore means 1.21 saturation.
  const correctedLuma = dot(colorAP1, AP1_LUMA);
  colorAP1.assign(max(
    mix(vec3(correctedLuma), colorAP1, colorSaturation),
    0,
  ));
  colorAP1.assign(
    colorAP1.mul(1 / 0.18).pow(colorContrast).mul(0.18),
  );
  colorAP1.assign(colorAP1.pow(colorGamma.reciprocal()));
  colorAP1.assign(colorAP1.mul(colorGain).add(colorOffset));
  colorAP1.assign(mix(
    colorAP1,
    BLUE_CORRECT_AP1.mul(colorAP1),
    blueCorrection,
  ));
  const preToneColor = colorAP1.toVar('toonLabPreToneColor');

  let colorAP0 = AP1_TO_AP0.mul(colorAP1).toVar('toonLabColorAP0');
  const minimumRgb = min(colorAP0.r, colorAP0.g, colorAP0.b);
  const maximumRgb = max(colorAP0.r, colorAP0.g, colorAP0.b);
  const saturation = max(maximumRgb, 1e-10)
    .sub(max(minimumRgb, 1e-10))
    .div(max(maximumRgb, 1e-2));
  const chroma = sqrt(max(
    colorAP0.b.mul(colorAP0.b.sub(colorAP0.g))
      .add(colorAP0.g.mul(colorAP0.g.sub(colorAP0.r)))
      .add(colorAP0.r.mul(colorAP0.r.sub(colorAP0.b))),
    0,
  ));
  const ycIn = colorAP0.r.add(colorAP0.g).add(colorAP0.b)
    .add(chroma.mul(1.75))
    .div(3);
  const sigmoidInput = saturation.sub(0.4).div(0.2);
  const sigmoidT = max(float(1).sub(abs(sigmoidInput.mul(0.5))), 0);
  const sigmoid = float(0.5).mul(
    float(1).add(sign(sigmoidInput).mul(float(1).sub(sigmoidT.mul(sigmoidT)))),
  );
  const glowGainIn = sigmoid.mul(0.05);
  const glowGain = ycIn.lessThanEqual(2 * 0.08 / 3).select(
    glowGainIn,
    ycIn.greaterThanEqual(2 * 0.08).select(
      0,
      glowGainIn.mul(float(0.08).div(max(ycIn, 1e-6)).sub(0.5)),
    ),
  );
  colorAP0.assign(colorAP0.mul(glowGain.add(1)));

  const hueDenominator = colorAP0.r.mul(2).sub(colorAP0.g).sub(colorAP0.b);
  let hue = atan(
    colorAP0.g.sub(colorAP0.b).mul(Math.sqrt(3)),
    hueDenominator,
  ).mul(180 / Math.PI).toVar('toonLabHue');
  hue.assign(hue.lessThan(0).select(hue.add(360), hue));
  const isNeutral = colorAP0.r.equal(colorAP0.g).and(colorAP0.g.equal(colorAP0.b));
  hue.assign(isNeutral.select(0, hue.clamp(0, 360)));
  let centeredHue = hue.toVar('toonLabCenteredHue');
  centeredHue.assign(centeredHue.greaterThan(180).select(
    centeredHue.sub(360),
    centeredHue,
  ));
  const hueWeight = smoothstep(
    0,
    1,
    float(1).sub(abs(centeredHue.mul(2 / 135))),
  ).pow(2);
  const modifiedRed = colorAP0.r.add(
    hueWeight.mul(saturation).mul(float(0.03).sub(colorAP0.r)).mul(0.18),
  );
  colorAP0 = vec3(modifiedRed, colorAP0.g, colorAP0.b);

  let workingColor = AP0_TO_AP1.mul(colorAP0).max(0).toVar('toonLabWorkingColor');
  let workingLuma = dot(workingColor, AP1_LUMA);
  workingColor.assign(mix(vec3(workingLuma), workingColor, 0.96));

  const logColor = log(max(workingColor, 1e-6)).div(Math.LN10);
  const straightColor = slope.mul(logColor.add(straightMatch));
  const toeColor = blackClip.negate().add(
    toeScale.mul(2).div(
      float(1).add(exp(clamp(
        slope.mul(-2).div(toeScale).mul(logColor.sub(toeMatch)),
        -80,
        80,
      ))),
    ),
  );
  const shoulderColor = float(1).add(whiteClip).sub(
    shoulderScale.mul(2).div(
      float(1).add(exp(clamp(
        slope.mul(2).div(shoulderScale).mul(logColor.sub(shoulderMatch)),
        -80,
        80,
      ))),
    ),
  );
  const resolvedToe = logColor.lessThan(vec3(toeMatch)).select(toeColor, straightColor);
  const resolvedShoulder = logColor.greaterThan(vec3(shoulderMatch))
    .select(shoulderColor, straightColor);
  let curveBlend = logColor.sub(toeMatch)
    .div(max(abs(shoulderMatch.sub(toeMatch)), 1e-5))
    .clamp(0, 1)
    .toVar('toonLabCurveBlend');
  curveBlend.assign(shoulderMatch.lessThan(toeMatch).select(
    curveBlend.oneMinus(),
    curveBlend,
  ));
  curveBlend.assign(float(3).sub(curveBlend.mul(2)).mul(curveBlend).mul(curveBlend));
  let toneColor = mix(resolvedToe, resolvedShoulder, curveBlend).toVar('toonLabToneColor');
  workingLuma = dot(toneColor, AP1_LUMA);
  toneColor.assign(max(mix(vec3(workingLuma), toneColor, 0.93), 0));

  colorAP1.assign(mix(
    preToneColor,
    toneColor,
    toneCurveAmount,
  ));
  colorAP1.assign(mix(
    colorAP1,
    BLUE_CORRECT_INV_AP1.mul(colorAP1),
    blueCorrection,
  ));

  const linearOutput = AP1_TO_LINEAR_SRGB.mul(colorAP1).max(0).clamp(0, 1);
  // PostProcessCombineLUTs.usf performs this in its output-device branch,
  // after grading and the film curve. When enabled, the RenderPipeline must
  // use LinearSRGBColorSpace so Three does not append a second sRGB OETF.
  return outputInverseGamma === null
    ? linearOutput
    : linearOutput.pow(outputInverseGamma);
  }).setLayout({
    name: 'toonLabSourceToneMapping',
    type: 'vec3',
    inputs: [
      { name: 'color', type: 'vec3' },
      { name: 'exposure', type: 'float' },
    ],
  });
}

export const toonLabSourceToneMapping = createToonLabSourceToneMapping();
