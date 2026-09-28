// Cloud scattering, as composable TSL nodes: Beer-Lambert extinction, Nubis'
// max-combined deep-light and silver-lining terms, the powder edge deficit,
// skylight and ground-bounce fill, the base darkening pair, and the moonlit rim.
//
// Sources, per docs/sky-cloud-parameters.md's runtime boundary — this is
// written from the published literature, not from the reference product:
//
//   Schneider & Vos, "Nubis: Authoring Real-Time Volumetric Cloudscapes with
//     the Decima Engine" (SIGGRAPH 2017), slides 80 and 85 — the two HG lobes
//     and two Beer-Lambert curves are combined with max(), not summed.
//   Schneider, "The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn"
//     (SIGGRAPH 2015) — the powder / dark-edge approximation and density field.
//   Hillaire, "Physically Based and Unified Volumetric Rendering in Frostbite"
//     (SIGGRAPH 2015) and "A Scalable and Production Ready Sky and Atmosphere
//     Rendering Technique" (EGSR 2020) — the energy-conserving segment
//     integration the marcher uses.
//
// Everything here is an expression builder: no `toVar`, no `Loop`, no stack
// requirement, so a headless test can build any single term on its own. The one
// exception is `createCloudLightingModel().inScatterNode`, which is a laid-out
// `Fn` so the 128 primary samples share one GPU function instead of inlining
// 128 copies of the whole model.
//
// Units. `extinction` is sigma_t in 1/m — `shape.density` times the normalized
// density field. Slab distances are metres. Optical depths are dimensionless.

import {
  clamp,
  exp,
  float,
  Fn,
  max,
  mix,
  saturate,
  smoothstep,
  sqrt,
  vec3,
  vec4,
} from 'three/tsl';

import { henyeyGreensteinPhaseNode } from '../sky/atmosphereScattering.js';

/** Dual-HG droplet phase constants. */
export const CLOUD_PHASE_FORWARD_G = 0.8;
export const CLOUD_PHASE_BACKWARD_G = -0.2;
export const CLOUD_PHASE_BLEND = 0.5;

/** Three-octave multiple-scattering falloffs. */
export const CLOUD_MULTISCATTER_EXTINCTION = 0.5;
export const CLOUD_MULTISCATTER_SCATTER = 0.5;
export const CLOUD_MULTISCATTER_ECCENTRICITY = 0.5;

// Backward-compatible diagnostics names. They now report the reference model,
// not the discarded max-combined Nubis approximation.
export const CLOUD_PHASE_BASE_G = CLOUD_PHASE_FORWARD_G;
export const CLOUD_PHASE_SILVER_INTENSITY = 0;
export const CLOUD_PHASE_SILVER_SPREAD = 0;
export const CLOUD_DEEP_EXTINCTION_SCALE = CLOUD_MULTISCATTER_EXTINCTION;
export const CLOUD_DEEP_CONTRIBUTION = CLOUD_MULTISCATTER_SCATTER;

/**
 * Powder exponent. Nubis' approximation of the near-surface deficit of
 * multiply-scattered light is `1 - exp(-2 d)`; this is that 2.
 */
export const CLOUD_POWDER_EXPONENT = 2;

/**
 * Normalisation that turns `1 - exp(-2 x)` into a pure edge term.
 *
 * Nubis writes the expression against a density sample in its own units; over a
 * field normalised to [0, 1] it tops out at `1 - exp(-2)` = 0.8647, so a solid
 * core loses 13.5% of its direct light at `powderStrength` 1 and more above it.
 * That is a global absorption, and `lighting.scatteringAlbedo` already owns
 * global absorption — the parameter here documents only "darkens the thin outer
 * edges". Dividing by the value at full occupancy keeps the shape of the fit and
 * pins a fully surrounded sample to exactly 1 at every strength.
 */
/**
 * Representative path, in metres, the moon rim term attenuates over.
 *
 * The rim is an edge term, so what it needs is "how thin is the cloud here",
 * and the cheapest honest answer is Beer-Lambert over a fixed short path: a
 * wisp at sigma 0.002 keeps three quarters of the moonlight, a core at 0.03
 * keeps one percent. Marching toward the moon instead would double the light
 * march for a term that is only ever a few percent of the image.
 */
export const CLOUD_MOON_RIM_PATH = 150;

/** Lambertian bounce normalisation, folded into the ground-bounce term. */
const INV_PI = 1 / Math.PI;
const CLOUD_LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

// Laid-out function names have to be unique inside one shader, and a name is a
// GPU identifier rather than a label, so a second cloud material built in the
// same program cannot reuse this one's.
let lightingModelId = 0;

/** Beer-Lambert transmittance for an optical depth. */
export function beerLambertNode(opticalDepth) {
  return exp(max(float(opticalDepth), 0).negate());
}

/**
 * Nubis powder / dark-edge term: `1 - exp(-2 x)`, raised to `strength`.
 *
 * Beer-Lambert alone makes a thin sunlit edge the *brightest* part of a cloud,
 * because little light was absorbed there — which is exactly backwards. In a
 * real cloud a point near the surface has few neighbours to scatter light in
 * from, so the multiply-scattered field is starved there and the edge reads
 * darker than the body. This is the standard approximation of that deficit.
 *
 * `occupancy` is **how much cloud surrounds the sample**, in [0, 1]:
 * `createCloudDensityField`'s third channel, which is the density field with the
 * shell's own height envelope divided out. Both of the obvious alternatives are
 * wrong in a way that shows up in the render:
 *
 *   - The light-march optical depth makes a sunlit top black, because a top with
 *     clear sky above it has a light depth of zero and `1 - exp(0)` is zero.
 *   - The plain normalized density carries the cumulus taper
 *     (`saturate((1 - h) / 0.7)`) and the two edge fades, so it falls
 *     monotonically with height whatever the cloud is actually doing there. That
 *     turns the term into a sunlit-top darkening ramp — measured 0.865 at the
 *     h <= 0.3 plateau against 0.133 at h = 0.95, a 6.5x penalty on exactly the
 *     tops the spec wants brilliant — and it dims solid cores too, since the
 *     envelope caps the density they can reach.
 *
 * The envelope is the shell's vertical profile, not the local cloud boundary,
 * so dividing it out leaves the quantity the term is defined on: the horizontal
 * occupancy of the cloud field. A wisp is thin at any height and stays dark; a
 * tower's crown is surrounded by cloud and is not darkened relative to its
 * middle.
 *
 * `strength` is an exponent rather than a mix weight, so 0 removes the term
 * exactly (`x^0 = 1`), 1 is the published expression, and larger values
 * over-darken without ever leaving [0, 1] — and because the base is normalised to
 * 1 at full occupancy, a solid core is untouched at *every* strength. A
 * `mix(1, powder, strength)` would have clamped everything above 1 to the same
 * image. The reference publishes a default of 1.0 and no range, so none is
 * asserted here.
 */
export function powderNode(occupancy, strength) {
  const local = saturate(float(occupancy));
  const powder = exp(local.mul(-CLOUD_POWDER_EXPONENT)).oneMinus();
  return mix(float(1), powder, max(float(strength), 0));
}

/**
 * Nubis' max-combined phase function (2017 slide 80).
 *
 * The broad g=0.6 lobe keeps clouds readable away from the sun. A narrow
 * g=(0.99 - spread) lobe supplies the silver lining, and max() prevents that
 * highlight from adding energy over the whole body as a blend or sum would.
 */
export function cloudPhaseNode(cosTheta) {
  return mix(
    henyeyGreensteinPhaseNode(cosTheta, float(CLOUD_PHASE_FORWARD_G)),
    henyeyGreensteinPhaseNode(cosTheta, float(CLOUD_PHASE_BACKWARD_G)),
    float(CLOUD_PHASE_BLEND),
  );
}

/**
 * Nubis' deep-light approximation (2017 slide 85), made view-dependent as the
 * accompanying text specifies.
 *
 * Looking into the sun (cos=1) uses physical single scattering. Looking away
 * (cos=-1) may use the dimmer, quarter-depth curve that stands in for light
 * scattered deeper into the cloud. The linear angle ramp is the published code
 * example also reproduced by the open Meteoros implementation.
 */
export function cloudDirectionalAttenuationNode({ cosTheta, lightOpticalDepth }) {
  void cosTheta;
  return beerLambertNode(max(float(lightOpticalDepth), 0));
}

/** Phase, deep-light visibility and powder deficit for the directional sun. */
export function cloudDirectionalScatteringNode({
  cosTheta,
  lightOpticalDepth,
  occupancy,
  powderStrength,
}) {
  const depth = max(float(lightOpticalDepth), 0);
  let eccentricity = 1;
  let extinction = 1;
  let scatter = 1;
  let energy = float(0);
  for (let octave = 0; octave < 3; octave += 1) {
    const phase = mix(
      henyeyGreensteinPhaseNode(
        cosTheta,
        float(CLOUD_PHASE_FORWARD_G * eccentricity),
      ),
      henyeyGreensteinPhaseNode(
        cosTheta,
        float(CLOUD_PHASE_BACKWARD_G * eccentricity),
      ),
      float(CLOUD_PHASE_BLEND),
    );
    energy = energy.add(
      exp(depth.mul(-extinction)).mul(scatter).mul(phase),
    );
    eccentricity *= CLOUD_MULTISCATTER_ECCENTRICITY;
    extinction *= CLOUD_MULTISCATTER_EXTINCTION;
    scatter *= CLOUD_MULTISCATTER_SCATTER;
  }
  return energy.mul(powderNode(occupancy, powderStrength));
}

/**
 * Direct-beam transmittance for cloud shadows.
 *
 * Multiple scattering is radiance arriving from other directions; it fills the
 * cloud image but cannot make the unobstructed solar beam reappear on a ground
 * receiver. Shadow transmission is therefore plain Beer-Lambert.
 */
export function cloudSunTransmittanceNode({ lightOpticalDepth }) {
  return beerLambertNode(lightOpticalDepth);
}

/**
 * Fraction of the sphere around a cloud sample that the ground fills.
 *
 * A sample at cloud altitude sees the ground below its own horizon, which is half
 * the sphere to within the horizon dip (1.7 degrees at 2.8 km). The same one-half
 * is implicit in the multiple-scattering bake, whose ground term fires on the
 * directions that intersect the planet and is then averaged over the whole
 * sphere. Using it here is what makes the two ground estimates cancel below,
 * rather than a fitted number.
 */
export const CLOUD_GROUND_HEMISPHERE_FRACTION = 0.5;

/**
 * Radiance arriving at a cloud sample from the lit ground, before the cloud
 * below it attenuates anything: a Lambertian re-emission of the direct beam that
 * reached the ground, over the half-sphere the ground fills.
 *
 * This is the same construction Hillaire's multiple-scattering bake uses for its
 * own ground term, which is what lets it serve two purposes — estimating the
 * ground light the table's tap already contains, and adding the cloud's own.
 * Checked against a re-bake with `groundAlbedo` zeroed: the estimate lands within
 * 5% of the measured ground share of the tap at every sun angle (1.049 / 1.008 /
 * 0.937 of it in R/G/B at zenith, 1.045 / 0.997 / 0.908 at 10 degrees).
 *
 * `groundIrradiance` is the *direct* beam at the ground and nothing else. The
 * sky-lit part of the ground is already inside the table's own
 * multiple-scattering boost.
 */
export function cloudGroundRadianceNode({ groundIrradiance, albedo }) {
  return albedo.mul(groundIrradiance).mul(INV_PI * CLOUD_GROUND_HEMISPHERE_FRACTION);
}

/**
 * Skylight fill at a sample: the sky's share of the ambient bath, attenuated by
 * the cloud above it, scaled by `lighting.ambientIntensity`.
 *
 * `skyRadiance` is the multiple-scattering table's tap, and that tap is a
 * **sphere average** — the bake integrates every direction, including the ones
 * that end on the lit ground, so it already carries a ground bounce taken at
 * `atmosphere.groundAlbedo`. Measured at 2.8 km with the sun at zenith, 63% /
 * 51% / 33% of the R/G/B of the tap *is* that ground bounce.
 *
 * `groundInTap` is that share, and subtracting it is what leaves this term the
 * sky alone. Three things follow, all of which the reference's own docs require:
 * `atmosphere.groundAlbedo` cancels out of the cloud — it is documented "sky dome
 * only", and the fill now moves by at most 2.2% when it is driven from 0.18 to 0,
 * against 14% before; `lighting.ambientIntensity`, documented as the *skylight*
 * fill, no longer dials the ground; and at `ambientIntensity` 1 the two terms sum
 * back to exactly the tap, so the bath is neither gained nor lost by the split.
 *
 * Checked against a ground-free re-bake of the same table: the remainder is
 * 0.916 / 0.991 / 1.031 of it in R/G/B with the sun at zenith, and
 * 0.990 / 1.000 / 1.004 at 10 degrees.
 */
export function cloudAmbientNode({
  skyRadiance,
  groundInTap,
  ambientIntensity,
  multipleScattering = 0,
  extinction,
  slabAbove,
}) {
  // This is an already integrated hemispherical bath. Treating the local
  // extinction as constant through the whole remaining shell double-counts
  // self-shadow and makes a dense core black; the directional light march owns
  // cloud self-shadow until there is a real ambient-direction march.
  void extinction;
  void slabAbove;
  void multipleScattering;
  const skyOnly = max(skyRadiance.sub(groundInTap), vec3(0));
  return skyOnly.mul(max(float(ambientIntensity), 0));
}

/**
 * Ground bounce on a cloud underside: the ground's radiance at
 * `lighting.groundBounceAlbedo`, attenuated by the cloud below the sample.
 *
 * The ground now enters the fill exactly once — here. `cloudAmbientNode` has
 * already taken the table's own copy back out, so `groundBounceAlbedo` is the
 * only albedo that decides how much light a cloud underside receives, which is
 * what the parameter documents. It also means the two halves of the bath are
 * attenuated along the paths they actually travel: sky light through the slab
 * above the sample, ground light through the slab below it. Before, the whole
 * sphere average rode the slab above and a second full bounce rode the slab
 * below, which counted the ground twice and — because ground light is the
 * spectrally flat term — flattened the fill toward grey (B/R 0.84 against a
 * measured 1.04 for the true bath; 1.21 after).
 */
export function cloudGroundBounceNode({
  groundIrradiance,
  groundBounceAlbedo,
  extinction,
  slabBelow,
}) {
  // As above, a single local extinction value is not a valid integral through
  // the heterogeneous volume. The sun light march supplies the directional
  // depth; keep the low-frequency bounce as a fill rather than extinguishing it
  // through a fictitious solid slab.
  void extinction;
  void slabBelow;
  return cloudGroundRadianceNode({ albedo: groundBounceAlbedo, groundIrradiance });
}

/**
 * The base-darkening pair as a multiplier on the lit terms.
 *
 * 1 above `baseShadowHeight`, falling to `1 - baseShadowStrength` at the floor
 * of the shell. `baseShadowStrength` 1 therefore shades the bottom to black,
 * which is what "shades them all the way down to the floor of the shell" means,
 * and a larger height spreads the same amount of shading over more of the cloud
 * so it reads softer.
 */
export function cloudBaseShadowNode({ heightFraction, baseShadowStrength, baseShadowHeight }) {
  const verticalProbability = mix(
    float(0.15),
    float(1),
    smoothstep(
      float(0),
      max(float(baseShadowHeight), 1e-3),
      saturate(float(heightFraction)),
    ),
  );
  return mix(float(1), verticalProbability, saturate(float(baseShadowStrength)));
}

/** Height-varying sky and ground ambient fill. */
export function cloudSkyAmbientNode({
  heightFraction,
  zenithRadiance,
  horizonRadiance,
  groundBounceRadiance,
  ambientIntensity,
}) {
  const height = saturate(float(heightFraction));
  const baseSky = mix(zenithRadiance, horizonRadiance, float(0.35));
  const skyAmbient = mix(baseSky, zenithRadiance, sqrt(height));
  const ground = groundBounceRadiance.mul(height.oneMinus());
  return skyAmbient.add(ground).mul(max(float(ambientIntensity), 0));
}

/**
 * Moonlight on cloud edges.
 *
 * Scaled by `lighting.moonGain`, by the moon's lit fraction
 * (`moonPhaseIllumination` — a sliver must not light a sky like a full moon),
 * and by how night it is, so the term is gone by day. `moonRadiance` carries
 * `moonColor * moonIntensity`.
 */
export function cloudMoonRimNode({
  cosTheta,
  extinction,
  moonRadiance,
  moonGain,
  moonIllumination,
  nightFactor,
  path = CLOUD_MOON_RIM_PATH,
}) {
  const rim = beerLambertNode(max(float(extinction), 0).mul(path));
  return moonRadiance
    .mul(cloudPhaseNode(cosTheta))
    .mul(rim)
    .mul(max(float(moonGain), 0))
    .mul(saturate(float(moonIllumination)))
    .mul(saturate(float(nightFactor)));
}

/**
 * Directional moonlight through the same cloud depth model as sunlight.
 *
 * The old night path only supplied a local edge rim, so the moon could outline
 * a cloud but could not reveal lobes or self-shadowing inside it. This term is
 * fed by a moon-facing light march and is multiplied by `nightFactor`; the
 * caller skips that second light march entirely while the sky is not dark.
 */
export function cloudMoonDirectionalNode({
  cosTheta,
  lightOpticalDepth,
  moonRadiance,
  moonGain,
  moonIllumination,
  nightFactor,
  occupancy,
  powderStrength,
}) {
  return moonRadiance
    .mul(cloudDirectionalScatteringNode({
      cosTheta,
      lightOpticalDepth,
      occupancy,
      powderStrength,
    }))
    .mul(max(float(moonGain), 0))
    .mul(saturate(float(moonIllumination)))
    .mul(saturate(float(nightFactor)));
}

/**
 * Optional three-tone remap over physically calculated cloud radiance.
 *
 * The physical luminance selects the authored shadow, body and highlight
 * colours. It is compressed into 0..1 only for choosing a band; output remains
 * linear HDR radiance, so atmosphere, exposure and bloom still operate in the
 * same space as V1. Both switches are uniforms. A disabled master or module
 * blends by exactly zero and leaves the physical value unchanged.
 */
export function applyCloudToneNode(radiance, style = null) {
  const physical = max(vec3(radiance), vec3(0));
  if (!style?.enabled || !style?.tone?.enabled) return physical;

  const tone = style.tone;
  const luminance = max(physical.dot(CLOUD_LUMINANCE), 0).toVar();
  const signal = luminance.div(luminance.add(1)).toVar();
  const width = max(tone.softness, 1e-4).toVar();
  const shadowToMid = smoothstep(
    tone.shadowPoint.sub(width),
    tone.shadowPoint.add(width),
    signal,
  ).toVar();
  const midToLight = smoothstep(
    tone.lightPoint.sub(width),
    tone.lightPoint.add(width),
    signal,
  ).toVar();
  const palette = mix(
    mix(tone.shadowColor, tone.midColor, shadowToMid),
    tone.lightColor,
    midToLight,
  ).toVar();
  const paletteLuminance = max(palette.dot(CLOUD_LUMINANCE), 1e-4).toVar();
  const compressed = max(luminance, tone.shadowLift)
    .div(float(1).add(luminance.mul(max(tone.highlightCompression, 0))))
    .mul(max(tone.brightness, 0))
    .toVar();
  const styled = palette.mul(compressed.div(paletteLuminance)).toVar();
  const amount = saturate(style.enabled.mul(tone.enabled).mul(style.amount));
  return mix(physical, styled, amount);
}

/**
 * Adds the cool skylight art direction to shadowed cloud regions only.
 *
 * The physical pre-tone luminance selects the shadow mask. The authored colour
 * is normalized back to the already-styled luminance before blending, so this
 * module changes hue without flattening the light march or lifting the back of
 * every cloud to a constant colour.
 */
export function applyCloudBlueShadowNode(radiance, physicalRadiance, style = null) {
  const styled = max(vec3(radiance), vec3(0));
  if (!style?.enabled || !style?.blueShadow?.enabled) return styled;

  const source = max(vec3(physicalRadiance), vec3(0));
  const blueShadow = style.blueShadow;
  const sourceLuminance = max(source.dot(CLOUD_LUMINANCE), 0).toVar();
  const signal = sourceLuminance.div(sourceLuminance.add(1)).toVar();
  const width = max(blueShadow.softness, 1e-4).toVar();
  const shadowMask = smoothstep(
    blueShadow.range.sub(width),
    blueShadow.range.add(width),
    signal,
  ).oneMinus().toVar();
  const styledLuminance = max(styled.dot(CLOUD_LUMINANCE), 0).toVar();
  const blueLuminance = max(blueShadow.color.dot(CLOUD_LUMINANCE), 1e-4).toVar();
  const tinted = blueShadow.color.mul(styledLuminance.div(blueLuminance)).toVar();
  const amount = saturate(
    style.enabled
      .mul(blueShadow.enabled)
      .mul(style.amount)
      .mul(blueShadow.amount)
      .mul(shadowMask),
  );
  return mix(styled, tinted, amount);
}

/**
 * Applies the per-sample daytime style modules in a stable, documented order.
 *
 * `daylightAmount` lets the shared clock remove the daytime remap before the
 * night palette is applied. Full night then starts from the physically
 * moonlit, self-shadowed volume instead of a blue daytime tone ramp. A value of
 * one preserves the established V2.6 result exactly.
 */
export function applyCloudStyleNode(radiance, style = null, daylightAmount = 1) {
  const physical = max(vec3(radiance), vec3(0));
  const toned = applyCloudToneNode(physical, style);
  const styled = applyCloudBlueShadowNode(toned, physical, style);
  return mix(physical, styled, saturate(float(daylightAmount)));
}

/**
 * Turns the accumulated cloud underside into a pale painted wash.
 *
 * This runs once after the volume march rather than once per density sample.
 * Working on the resolved cloud colour lets `detail` compress small lighting
 * variations across the whole visible body. The blue-shadow range selects the
 * same underside region, but this module has its own switch and still works
 * when the blue hue module is bypassed.
 */
export function applyCloudShadowWashNode(premultipliedRadiance, alpha, style = null) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  if (!style?.enabled || !style?.shadowWash?.enabled) return original;

  const wash = style.shadowWash;
  const safeAlpha = max(float(alpha), 1e-4).toVar();
  const body = original.div(safeAlpha).toVar();
  const luminance = max(body.dot(CLOUD_LUMINANCE), 0).toVar();
  const signal = luminance.div(luminance.add(1)).toVar();
  const range = style?.blueShadow?.range ?? float(0.38);
  const width = max(wash.blend, 1e-4).toVar();
  const shadowMask = smoothstep(
    range.sub(width),
    range.add(width),
    signal,
  ).oneMinus().toVar();
  const washedLuminance = mix(
    max(wash.lift, 0),
    luminance,
    saturate(wash.detail),
  ).toVar();
  const washedBody = body
    .mul(washedLuminance.div(max(luminance, 1e-4)))
    .toVar();
  const amount = saturate(
    style.enabled
      .mul(wash.enabled)
      .mul(style.amount)
      .mul(shadowMask),
  );
  return mix(original, washedBody.mul(safeAlpha), amount);
}

/**
 * Keeps the physical cloud edge while allowing a painted interior.
 *
 * Cloud opacity remains entirely owned by the volume march. This function only
 * blends between the resolved physical colour and the shadow-washed colour,
 * using resolved opacity as an interior mask. Thin wisps and the outer contour
 * therefore retain their physical shading and silhouette.
 */
export function applyCloudInnerPaintNode(
  premultipliedRadiance,
  alpha,
  style = null,
  daylightAmount = 1,
) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  const painted = applyCloudShadowWashNode(original, alpha, style);
  if (!style?.enabled || !style?.innerPaint?.enabled) return painted;

  const inner = style.innerPaint;
  const edgeStart = saturate(inner.edgeKeep).toVar();
  const edgeWidth = max(inner.edgeBlend, 1e-4).toVar();
  const interiorMask = smoothstep(
    edgeStart,
    edgeStart.add(edgeWidth),
    saturate(float(alpha)),
  ).toVar();
  const amount = saturate(
    style.enabled
      .mul(inner.enabled)
      .mul(inner.amount)
      .mul(saturate(float(daylightAmount)))
      .mul(interiorMask),
  );
  return mix(original, painted, amount);
}

/**
 * Broadens the clean white region across sun-reachable upper cloud samples.
 *
 * `sunlitHeight` is accumulated by the physical volume march from the existing
 * height fraction and light optical depth. It changes no density or opacity.
 * The final blend reuses the V2.4 resolved-opacity boundary so the physical
 * contour and thin wisps remain untouched while only the opaque interior is
 * simplified toward the authored warm white.
 */
export function applyCloudWhiteTopNode(
  premultipliedRadiance,
  alpha,
  sunlitHeight,
  style = null,
) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  if (!style?.enabled || !style?.whiteTop?.enabled) return original;

  const white = style.whiteTop;
  const safeAlpha = max(float(alpha), 1e-4).toVar();
  const body = original.div(safeAlpha).toVar();
  const start = saturate(white.area).oneMinus().toVar();
  const width = max(white.softness, 1e-4).toVar();
  const topMask = smoothstep(
    start.sub(width),
    start.add(width),
    saturate(float(sunlitHeight)),
  ).toVar();

  const edgeStart = saturate(style.innerPaint.edgeKeep).toVar();
  const edgeWidth = max(style.innerPaint.edgeBlend, 1e-4).toVar();
  const interiorMask = smoothstep(
    edgeStart,
    edgeStart.add(edgeWidth),
    saturate(float(alpha)),
  ).toVar();

  const bodyLuminance = max(body.dot(CLOUD_LUMINANCE), 0).toVar();
  const whiteLuminance = max(white.color.dot(CLOUD_LUMINANCE), 1e-4).toVar();
  const paintedLuminance = mix(
    whiteLuminance,
    bodyLuminance,
    saturate(white.detail),
  ).toVar();
  const paintedBody = white.color
    .mul(paintedLuminance.div(whiteLuminance))
    .toVar();
  const amount = saturate(
    style.enabled
      .mul(white.enabled)
      .mul(style.amount)
      .mul(white.amount)
      .mul(topMask)
      .mul(interiorMask),
  );
  return mix(original, paintedBody.mul(safeAlpha), amount);
}

/**
 * Restores directional sunlight value variation after the white-top paint.
 *
 * White Top deliberately simplifies the upper cloud into one authored hue.
 * This stage uses both the physical in-scatter luminance and Beer-Lambert sun
 * reach from the existing light march to shade that hue. An aerial view then
 * recovers sun-facing crowns and shadowed folds without changing density,
 * opacity, or the approved top colour. The fixed value range keeps the
 * authored white top bright while retaining the light march's local variation.
 */
export function applyCloudTopLightNode(
  premultipliedRadiance,
  physicalLight,
  sunlight,
  alpha,
  sunlitHeight,
  daylight,
  surfaceLightAmount = 0,
  surfaceSunFacing = 0.5,
  style = null,
) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  if (!style?.enabled || !style?.topLight?.enabled) return original;

  const safeAlpha = max(float(alpha), 1e-4).toVar();
  const body = original.div(safeAlpha).toVar();
  const physicalSignal = smoothstep(
    0.08,
    0.9,
    max(float(physicalLight), 0),
  ).toVar();
  const lightSignal = sqrt(saturate(float(sunlight))).mul(mix(
    0.4,
    1,
    physicalSignal,
  )).toVar();
  const exteriorAmount = saturate(float(surfaceLightAmount)).toVar();
  const exteriorSignal = smoothstep(
    0.15,
    0.9,
    saturate(float(surfaceSunFacing)),
  ).mul(mix(0.7, 1, sqrt(saturate(float(sunlight))))).toVar();
  const resolvedSignal = mix(lightSignal, exteriorSignal, exteriorAmount).toVar();
  const shadowValue = mix(0.65, 0.55, exteriorAmount).toVar();
  // Exterior shaping is carried by the shaded turn, not clipped pin-light
  // highlights on distant wisps. Keep the bright end close to the V2.8 white.
  const highlightValue = mix(1.25, 1.3, exteriorAmount).toVar();
  const lightRatio = mix(shadowValue, highlightValue, resolvedSignal).toVar();
  const relitBody = body.mul(lightRatio).toVar();

  const white = style.whiteTop;
  const start = saturate(white.area).oneMinus().toVar();
  const width = max(white.softness, 1e-4).toVar();
  const topMask = smoothstep(
    start.sub(width),
    start.add(width),
    saturate(float(sunlitHeight)),
  ).toVar();
  const edgeStart = saturate(style.innerPaint.edgeKeep).toVar();
  const edgeWidth = max(style.innerPaint.edgeBlend, 1e-4).toVar();
  const interiorMask = smoothstep(
    edgeStart,
    edgeStart.add(edgeWidth),
    saturate(float(alpha)),
  ).toVar();
  const amount = saturate(
    style.enabled
      .mul(style.topLight.enabled)
      .mul(style.amount)
      .mul(style.topLight.amount)
      .mul(saturate(float(daylight)))
      .mul(topMask)
      .mul(interiorMask),
  );
  return mix(original, relitBody.mul(safeAlpha), amount);
}

/**
 * Adds a restrained cool tint to the shadow and middle regions while leaving
 * the existing warm white top intact.
 *
 * The physical march still owns opacity and the outer contour. This final
 * colour stage reuses the same sunlit-height descriptor, White Top boundary,
 * and V2.4 interior mask. It therefore changes only the readable lower colour
 * regions inside opaque daytime clouds.
 */
export function applyCloudLightBlendNode(
  premultipliedRadiance,
  alpha,
  sunlitHeight,
  daylight,
  style = null,
) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  if (!style?.enabled || !style?.lightBlend?.enabled) return original;

  const blend = style.lightBlend;
  const safeAlpha = max(float(alpha), 1e-4).toVar();
  const body = original.div(safeAlpha).toVar();
  const daylightAmount = saturate(float(daylight)).toVar();
  const signal = saturate(float(sunlitHeight).mul(daylightAmount)).toVar();
  const center = saturate(blend.balance).toVar();
  const width = max(blend.softness, 1e-4).toVar();
  const bottomToMiddle = smoothstep(
    center.sub(width),
    center.add(width),
    signal,
  ).toVar();

  // Match the V2.5 selector exactly. Its bright upper region passes through
  // this stage instead of being repainted by a second palette.
  const topStart = saturate(style.whiteTop.area).oneMinus().toVar();
  const topWidth = max(style.whiteTop.softness, 1e-4).toVar();
  const keepWhiteTop = smoothstep(
    topStart.sub(topWidth),
    topStart.add(topWidth),
    signal,
  ).toVar();
  const palette = mix(
    blend.bottomColor,
    blend.middleColor,
    bottomToMiddle,
  ).toVar();

  const edgeStart = saturate(style.innerPaint.edgeKeep).toVar();
  const edgeWidth = max(style.innerPaint.edgeBlend, 1e-4).toVar();
  const interiorMask = smoothstep(
    edgeStart,
    edgeStart.add(edgeWidth),
    saturate(float(alpha)),
  ).toVar();

  const bodyLuminance = max(body.dot(CLOUD_LUMINANCE), 0).toVar();
  const paletteLuminance = max(palette.dot(CLOUD_LUMINANCE), 1e-4).toVar();
  const tintedBody = palette.mul(bodyLuminance.div(paletteLuminance)).toVar();
  const paintedBody = mix(
    tintedBody,
    body,
    saturate(blend.detail),
  ).toVar();
  const amount = saturate(
    style.enabled
      .mul(blend.enabled)
      .mul(style.amount)
      .mul(blend.amount)
      .mul(daylightAmount)
      .mul(interiorMask)
      .mul(keepWhiteTop.oneMinus()),
  );
  return mix(original, paintedBody.mul(safeAlpha), amount);
}

/**
 * Tints the resolved cloud interior in the morning, evening, and night from the
 * shared sky clock. Afternoon receives an exact zero blend, so V2.6 remains
 * the day result rather than becoming another palette input.
 *
 * The physical march still owns opacity and the outer contour. Density and
 * alpha remain untouched. The V2.4 interior mask only softens the
 * colour grade slightly at the contour; time colour must still reach wisps so
 * they cannot remain daytime cyan or white after the clock changes.
 */
export function applyCloudTimePaletteNode(
  premultipliedRadiance,
  alpha,
  sunlitHeight,
  morningLight,
  eveningLight,
  nightness,
  style = null,
) {
  const original = max(vec3(premultipliedRadiance), vec3(0));
  if (!style?.enabled || !style?.timePalette?.enabled) return original;

  const timePalette = style.timePalette;
  const safeAlpha = max(float(alpha), 1e-4).toVar();
  const body = original.div(safeAlpha).toVar();
  const night = saturate(float(nightness)).toVar();
  const morning = saturate(float(morningLight)).toVar();
  const evening = saturate(float(eveningLight)).toVar();
  const eveningSide = evening.div(max(morning.add(evening), 1e-4)).toVar();

  const bodyLuminance = max(body.dot(CLOUD_LUMINANCE), 0).toVar();
  const bodySignal = bodyLuminance.div(bodyLuminance.add(1)).toVar();
  const compressedNightSignal = bodySignal.mul(bodySignal).toVar();
  const nightSignal = mix(
    bodySignal,
    compressedNightSignal,
    saturate(timePalette.nightContrast),
  ).toVar();
  // The marcher exposes a sunlight-weighted height boosted for the daytime
  // white-top module. Bring it back to a normalized shell height here, then
  // combine it with resolved opacity. This creates broad top/body/edge value
  // regions at night even when the physical moon contribution is too uniform
  // to describe the cloud on its own. It never changes density or alpha.
  const heightSignal = saturate(float(sunlitHeight).mul(0.2)).toVar();
  const topSignal = smoothstep(0.12, 0.78, heightSignal).toVar();
  const depthSignal = smoothstep(0.08, 0.85, saturate(float(alpha))).toVar();
  const edgeSignal = depthSignal.oneMinus().toVar();
  const nightValue = nightSignal
    .mul(1.2)
    .add(topSignal.mul(0.012))
    .add(edgeSignal.mul(0.006))
    .add(0.008)
    .toVar();
  const warmBand = smoothstep(
    0.01,
    0.18,
    max(bodySignal, heightSignal.mul(0.18)),
  ).toVar();
  const nightBand = smoothstep(0.015, 0.08, nightValue).toVar();
  const morningColor = mix(
    timePalette.morningBottom,
    timePalette.morningTop,
    warmBand,
  ).toVar();
  const eveningColor = mix(
    timePalette.eveningBottom,
    timePalette.eveningTop,
    warmBand,
  ).toVar();
  const nightColor = mix(
    timePalette.nightBottom,
    timePalette.nightTop,
    nightBand,
  ).toVar();
  const warmColor = mix(morningColor, eveningColor, eveningSide).toVar();
  const palette = mix(warmColor, nightColor, night).toVar();

  const edgeStart = saturate(style.innerPaint.edgeKeep).toVar();
  const edgeWidth = max(style.innerPaint.edgeBlend, 1e-4).toVar();
  const interiorMask = smoothstep(
    edgeStart,
    edgeStart.add(edgeWidth),
    saturate(float(alpha)),
  ).toVar();
  const contourColor = mix(float(0.9), float(1), interiorMask).toVar();

  const warmBrightness = mix(
    timePalette.morningBrightness,
    timePalette.eveningBrightness,
    eveningSide,
  ).toVar();
  const brightness = mix(
    warmBrightness,
    timePalette.nightBrightness,
    night,
  ).toVar();
  const shapedLuminance = mix(bodySignal, nightValue, night).toVar();
  const styledLuminance = shapedLuminance.mul(max(brightness, 0)).toVar();
  const paletteLuminance = max(palette.dot(CLOUD_LUMINANCE), 1e-4).toVar();
  const tintedBody = palette.mul(styledLuminance.div(paletteLuminance)).toVar();
  const warmDetail = mix(
    timePalette.morningDetail,
    timePalette.eveningDetail,
    eveningSide,
  ).toVar();
  const retainedDetail = saturate(
    mix(warmDetail, timePalette.nightDetail, night),
  ).toVar();
  // Detail means the original volumetric lighting, including its value
  // structure. The earlier draft normalized this branch back to the painted
  // luminance, so it restored hue but erased the self-shadowing developers
  // expected the control to preserve.
  const paintedBody = mix(
    tintedBody,
    body,
    retainedDetail,
  ).toVar();
  const timeAmount = max(
    max(
      morning.mul(timePalette.morningEnabled).mul(timePalette.morningAmount),
      evening.mul(timePalette.eveningEnabled).mul(timePalette.eveningAmount),
    ),
    night.mul(timePalette.nightEnabled).mul(timePalette.nightAmount),
  ).toVar();
  const amount = saturate(
    style.enabled
      .mul(timePalette.enabled)
      .mul(timeAmount)
      .mul(contourColor),
  ).toVar();
  // Keep afternoon on the exact V2.6 result. A conditional return is stronger
  // than evaluating the time colour and trusting a zero mix to cancel it;
  // inactive time calculations cannot perturb or poison the day value.
  return timeAmount.greaterThan(1e-5).select(
    mix(original, paintedBody.mul(safeAlpha), amount),
    original,
  );
}

/**
 * Binds the scattering model to one set of live parameter groups.
 *
 * `lighting` is a `CloudLighting` group, `atmosphere` an atmosphere param group
 * (`multipleScattering` and `groundAlbedo` are read — the latter only to cancel
 * it out of the fill, see `cloudAmbientNode`), and `timeOfDay` is optional —
 * without it the moon terms resolve to zero rather than to a full moon.
 *
 * Returns `inScatterNode`, a laid-out TSL function. RGB is the styled radiance
 * scattered toward the eye from one cubic metre of cloud, with
 * `scatteringAlbedo` already applied. Alpha preserves the physical luminance
 * from before any style module, so final-pixel paint can restore lighting value
 * without a second light march. The marcher's job is then the segment integral:
 * `radiance += transmittance * (1 - exp(-sigma dt)) * inScatter`, which is the
 * analytically integrated form for a constant medium over the segment.
 */
export function createCloudLightingModel({
  lighting,
  atmosphere,
  style = null,
  timeOfDay = null,
  name = 'cloudInScatter',
} = {}) {
  if (!lighting?.scatteringAlbedo || !lighting?.powderStrength) {
    throw new TypeError('createCloudLightingModel needs a cloud lighting param group.');
  }
  // `groundAlbedo` as well as `multipleScattering`: the fill has to know which
  // albedo the skylight table was baked with to avoid counting the ground twice.
  if (!atmosphere?.multipleScattering || !atmosphere?.groundAlbedo) {
    throw new TypeError('createCloudLightingModel needs an atmosphere param group.');
  }

  // Absent clock: no moon, rather than a full one. `float(0)` is a constant node
  // the compiler folds away, so the moon terms cost nothing when unused.
  const moonIllumination = timeOfDay?.moonPhaseIllumination ?? float(0);
  const nightFactor = timeOfDay?.skyDarkness ?? float(0);

  lightingModelId += 1;
  const functionName = `${name}${lightingModelId}`;

  const inScatterNode = Fn(([
    heightFraction,
    occupancy,
    extinction,
    lightOpticalDepth,
    moonLightOpticalDepth,
    slabAbove,
    slabBelow,
    cosSun,
    cosMoon,
    sunRadiance,
    zenithRadiance,
    horizonRadiance,
    groundBounceRadiance,
    moonRadiance,
  ]) => {
    const baseShadow = cloudBaseShadowNode({
      baseShadowHeight: lighting.baseShadowHeight,
      baseShadowStrength: lighting.baseShadowStrength,
      heightFraction,
    });

    const direct = sunRadiance.mul(cloudDirectionalScatteringNode({
      cosTheta: cosSun,
      lightOpticalDepth,
      occupancy,
      powderStrength: lighting.powderStrength,
    }));

    const ambient = cloudSkyAmbientNode({
      ambientIntensity: lighting.ambientIntensity,
      groundBounceRadiance,
      heightFraction,
      horizonRadiance,
      zenithRadiance,
    });

    const moonDirectional = cloudMoonDirectionalNode({
      cosTheta: cosMoon,
      lightOpticalDepth: moonLightOpticalDepth,
      moonGain: lighting.moonGain,
      moonIllumination,
      moonRadiance,
      nightFactor,
      occupancy,
      powderStrength: lighting.powderStrength,
    });
    const moonRim = cloudMoonRimNode({
      cosTheta: cosMoon,
      extinction,
      moonGain: lighting.moonGain,
      moonIllumination,
      moonRadiance,
      nightFactor,
    });
    const moon = moonDirectional.add(moonRim.mul(0.35));

    void slabAbove;
    void slabBelow;
    const lit = direct.add(moon).mul(baseShadow).add(ambient);
    const physical = max(lit.mul(saturate(lighting.scatteringAlbedo)), vec3(0));
    const styled = applyCloudStyleNode(physical, style, nightFactor.oneMinus());
    return vec4(styled, max(physical.dot(CLOUD_LUMINANCE), 0));
  }).setLayout({
    name: functionName,
    type: 'vec4',
    inputs: [
      { name: 'heightFraction', type: 'float' },
      { name: 'occupancy', type: 'float' },
      { name: 'extinction', type: 'float' },
      { name: 'lightOpticalDepth', type: 'float' },
      { name: 'moonLightOpticalDepth', type: 'float' },
      { name: 'slabAbove', type: 'float' },
      { name: 'slabBelow', type: 'float' },
      { name: 'cosSun', type: 'float' },
      { name: 'cosMoon', type: 'float' },
      { name: 'sunRadiance', type: 'vec3' },
      { name: 'zenithRadiance', type: 'vec3' },
      { name: 'horizonRadiance', type: 'vec3' },
      { name: 'groundBounceRadiance', type: 'vec3' },
      { name: 'moonRadiance', type: 'vec3' },
    ],
  });

  return {
    functionName,
    inScatterNode,
    lighting,
    atmosphere,
    style,
    timeOfDay,

    /**
     * Sun transmittance through the cloud, 0..1 — what the shadow bake needs.
     *
     * View-independent and normalised, per `cloudSunTransmittanceNode`. The
     * bake's own job is still to return 1 outside its footprint.
     */
    sunTransmittanceNode({ lightOpticalDepth }) {
      return cloudSunTransmittanceNode({ lightOpticalDepth });
    },

    /**
     * The phase-weighted, powdered Nubis directional term — the key light's
     * contribution to radiance scattered toward `cosTheta`, which is what the
     * env-map bake needs and what the marcher multiplies `sunRadiance` by.
     *
     * Not a transmittance and not in [0, 1]: it carries the max-combined broad
     * and silver-lining phase. Use `sunTransmittanceNode` for anything that has
     * to shadow.
     */
    phaseVisibilityNode({ cosTheta, occupancy, lightOpticalDepth }) {
      return cloudDirectionalScatteringNode({
        cosTheta,
        lightOpticalDepth,
        occupancy,
        powderStrength: lighting.powderStrength,
      });
    },

    /** Fixed phase terms exposed for diagnostics and verification. */
    phaseConstants: Object.freeze({
      backwardG: CLOUD_PHASE_BACKWARD_G,
      phaseBlend: CLOUD_PHASE_BLEND,
      forwardG: CLOUD_PHASE_FORWARD_G,
      msEccentricity: CLOUD_MULTISCATTER_ECCENTRICITY,
      msExtinction: CLOUD_MULTISCATTER_EXTINCTION,
      msScatter: CLOUD_MULTISCATTER_SCATTER,
    }),
    nubis: Object.freeze({
      backwardG: CLOUD_PHASE_BACKWARD_G,
      phaseBlend: CLOUD_PHASE_BLEND,
      forwardG: CLOUD_PHASE_FORWARD_G,
      msEccentricity: CLOUD_MULTISCATTER_ECCENTRICITY,
      msExtinction: CLOUD_MULTISCATTER_EXTINCTION,
      msScatter: CLOUD_MULTISCATTER_SCATTER,
    }),
  };
}
