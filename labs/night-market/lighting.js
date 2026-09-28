// Night Market street — lighting, atmosphere and post.
//
// SCOPE: plain Three.js only. Nothing from src/ (ToonLab). See scene.js.
//
// This module owns everything that turns the other four owners' geometry into
// the reference frame: the single emissive scale, the practical lights, fog and
// sky, the damp-ground return, steam, bloom, tone mapping and exposure.
//
// Spec: launch-plan/22-night-market-replica-spec.md §7 and §9.
//
// ---------------------------------------------------------------------------
// THE THREE DECISIONS THAT MATTER HERE, AND WHY
//
// 1. ONE EMISSIVE SCALE, NORMALISED PER KIND.
//    Every owner registers emissive surfaces on ctx.emissives with a `kind` and
//    an `intensity`. Those intensities are in four different authors' private
//    units — one owner picking 40 where another picked 1.2 would own the frame.
//    So the raw intensity is only ever read as a RATIO WITHIN ITS OWN KIND: each
//    kind is divided by its own maximum, then multiplied by the one budget in
//    KIND_BUDGET below. Relative variation an owner authored is preserved; the
//    absolute level is mine. Nobody can blow out the frame by typing a big
//    number.
//
// 2. MOST LANTERNS ARE NOT LIGHTS.
//    §4 wants 20+ lanterns per row, two rows — roughly 48 emissive lanterns.
//    Making 48 real point lights would put a 48-iteration light loop in every
//    fragment shader in the scene for no visible return: with decay 2, a lantern
//    20 m down the street delivers under 3% of a near lantern's irradiance to
//    anything the camera can resolve. So the nearest ~14 m of both rows get real
//    PointLights and everything beyond is emissive + bloom only. The far rows
//    still read as the brightest thing in frame — they just stop costing.
//    Measured, at 1600x900 against the assembled 711k-triangle scene: 20 point
//    lights cost 45 ms of a 69 ms frame — 65% — because every one of them adds
//    an iteration to the light loop of every fragment shaded. Cutting to 14 with
//    compensating intensity and range recovered most of that for no measurable
//    change in the frame's value or colour statistics.
//
// 3. THE DAMP GROUND IS SOLD TWICE, BOTH TIMES CHEAPLY.
//    street.js owns the paving roughness; a rough-metal-free damp surface needs
//    something to reflect. It gets a procedural PMREM environment (warm lantern
//    band above the horizon, red frontage bias on +X, cool tower note) so the
//    roughness street.js chose produces a physically-shaped warm smear, plus
//    flat additive pools laid on the paving under the near lanterns and along
//    the frontage for the broad wet glow that a reflection probe alone misses.
//    No render-target reflector, no second scene pass.
// ---------------------------------------------------------------------------
//
// ===========================================================================
// MEASUREMENT DEFINITION — the one recipe all four owners measure with
// ===========================================================================
//
// WHY THIS IS IN A SOURCE FILE. Four owners have been steering four modules by
// numbers, and twice now a number has been wrong in a way that sent work in the
// wrong direction:
//
//   * Non-warm share. One owner reported this frame at 19.6% against the
//     reference's 16.6% — an overshoot, and an owner was told to pull back.
//     Another, measuring like for like, got 14.3% against 15.2% — an
//     undershoot. Green agreed to two decimals in both, so the disagreement was
//     never in the pixels; it was in where the warm/non-warm hue boundary sits
//     and in whether the amber/yellow band falls inside it.
//   * Near-left corner. dressing.js's D9 note has the reference at mean L 106
//     there. Masked correctly it is 34.6. The 106 is the reference's own minimap
//     HUD. See 4b-ii.
//
// Both are recipe bugs, not render bugs, and both cost a day. So: this is the
// recipe. It is not "a" recipe — it is the one that REPRODUCES the published
// difference audit's tables, which is the only property that makes a shared
// definition worth anything. Verified against
// launch-plan/review/night-market-difference-audit.md:
//
//         audit   this recipe          audit   this recipe
//   p1     8.4      8.4        blue     7.52      7.48
//   clip   0.00%    0.00%      violet   4.90      4.93
//   sat    0.470    0.467      green    1.05      0.99
//   bright 5.88%    5.88%      non-warm 16.59    16.74
//
// ---------------------------------------------------------------------------
// 1. FRAMES
//    Reference  launch-plan/ananta-refererence/11-night-market-street.png,
//               true size 2294x1490.
//    Replica    the hero shot, rendered at 1920x1080, used whole.
//
// 2. LETTERBOX — EXCLUDED. The reference carries a genuine 50-row pure-black
//    letterbox at the top (rows 0-49, max pixel value exactly 0). Crop it: the
//    content frame is rows 50-1489, i.e. 2294x1440, aspect 1.593. Leaving it in
//    is not a rounding error — it is what made one eave band read L 52.7 where
//    the correct figure is 90.3.
//
// 3. RESAMPLE — BOTH FRAMES TO 1600x1000, Lanczos. Not 1600x900, not native.
//    The two aspects differ (1.593 vs 1.778) and are deliberately NOT letterboxed
//    or cropped to match; region fractions are of each frame's own content box.
//    D13 in the audit covers what that costs. The filter matters at the third
//    decimal of the hue bands, so name it: PIL Image.LANCZOS.
//
// 4. HUD MASK — the reference's minimap, x 2.4-19.8%, y 74.2-91.0% of the
//    content frame, is EXCLUDED from every statistic. It is a near-white game
//    overlay, not scene content, and it sits inside the near-left corner box.
//    The replica's own HUD is removed from the DOM before capture instead —
//    #hud, #loading AND #readout. Leaving #readout in (the shot-name strip at
//    bottom left) is worth 0.11 of a hue-band point and 1.5 of the near-left
//    corner's mean L, which is above this recipe's noise floor.
//
// 5. COLOUR MODEL. All thresholds are on the 0-255 sRGB values as stored — no
//    linearisation. L is Rec.709 luma, 0.2126 R + 0.7152 G + 0.0722 B, quoted on
//    0-255. "sat" and "value" are HSV S and V on 0-1.
//
// 6. COLOURFUL PIXEL — the population every hue percentage is a share OF:
//
//        HSV saturation > 0.18  AND  Rec.709 luma > 0.06  (i.e. L > 15.3)
//
//    Both thresholds, not one. Using V instead of luma is the single biggest
//    source of divergence between owners after the warm boundary: it admits ~6%
//    more of the frame and moves the reference's blue band from 7.48 to 9.46.
//
// 7. HUE BANDS, in HSV degrees. Half-open [lo, hi); red wraps.
//
//        red          345-15      warm
//        red-orange    15-30      warm
//        orange        30-45      warm
//        amber/yellow  45-70      NON-WARM
//        green         70-160     NON-WARM
//        cyan         160-200     NON-WARM
//        blue         200-260     NON-WARM
//        violet       260-345     NON-WARM
//
// 8. NON-WARM = hue in [45, 345) — everything outside the 90-degree warm wedge.
//    THE AMBER/YELLOW BAND IS NON-WARM. That is the whole disagreement: amber is
//    2.83% of the reference and 2.70% of this frame, and counting it as warm
//    turns the reference's 16.6% into 13.8% and moves both owners' verdicts.
//    The audit's own arithmetic settles it — 2.83 + 1.05 + 0.29 + 7.52 + 4.90 =
//    16.59, its published non-warm total, to the second decimal. Amber is in.
//
// 9. THE CAPTURE IS NOT BIT-EXACT. Two runs of an identical build gave mean L
//    67.04 and 67.06. Treat anything under ~0.1 of mean L, or ~0.05 of a hue
//    band percentage, as noise; an A/B of an unchanged build will never diff to
//    exactly zero. Everything quoted in this file is at 1920x1080 after
//    data-market-ready (900 settled frames), with the steam plume frame-locked
//    and held — see section 6.
// ===========================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Lens vignette, applied in LINEAR light before the tone map so it behaves like
 * optical falloff rather than a painted-on dark border. The reference frame
 * loses roughly a stop into the corners; without this the street edges hold
 * more value than anything in the reference does.
 */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.34 },
    softness: { value: 0.62 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float softness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(1.0, 0.86);
      float r = length(p) * 1.41421;
      float v = 1.0 - amount * smoothstep(softness, 1.05, r);
      gl_FragColor = vec4(texel.rgb * v, texel.a);
    }
  `,
};

/**
 * Display grade — the LAST pass, after OutputPass, so it works on the same
 * 0-255 sRGB values the difference audit measures.
 *
 * This exists because three of the audit's targets are numeric properties of the
 * final image, not of the lighting:
 *
 *   floor / ceiling (D4)  the reference never reaches black and never clips:
 *                         p1 = 8.4, brightest pixel ~234, 0.00% above 245. No
 *                         arrangement of lights guarantees that. Remapping the
 *                         display range to [floor, ceiling] does, exactly, and
 *                         is what a film print transfer does with its toe and
 *                         shoulder.
 *   saturation (D6)       the reference measures mean HSV saturation 0.470;
 *                         this frame measured 0.695, a 48% overshoot spread
 *                         evenly across every region, which makes it a global
 *                         setting rather than any one material.
 *
 * Doing it here rather than by dimming lights keeps the lighting physical and
 * the grade honest and separately auditable.
 */
const DisplayGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 0.74 },
    blackFloor: { value: 0.043 }, // ~L11 of 255
    whiteCeil: { value: 0.918 }, // ~L234 of 255
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float blackFloor;
    uniform float whiteCeil;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = blackFloor + c * (whiteCeil - blackFloor);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// Palette. §7: warm practicals ~2700-3000 K, navy-to-black field, red accents
// on the frontage, cool confined to the tower and sky.
// ---------------------------------------------------------------------------

// NOTE ON SATURATION. MARKET.warmLight (0xffb46b) is the right hue for a raw
// 2700-3000 K source, and the lantern EMISSIVES keep it. The light those
// lanterns cast does not: a frame lit by pure 0xffb46b renders every cream
// noren and white umbrella orange, and measured against the reference it came
// out at mean R/B 2.83 where the reference sits at 2.00. The reference is
// partly white-balanced, as any camera pointed at a night market is. So the
// LIGHT colours below are pulled toward neutral while the SOURCES stay
// saturated — which is also what makes a lantern read as a lantern.
const WARM_3000K = 0xffd0a4; // lantern rows — the dominant source
const WARM_2700K = 0xffc08a; // stall pockets under the eaves, warmer and closer
const RED_ACCENT = 0xff5a2a; // frontage chochin and poster wash
const COOL_MOON = 0x8fa8d8; // the only cool key, kept near-invisible
const SKY_NAVY = 0x142e66; // horizon / cool fill — blue-dominant, feeds D5+D6
const GROUND_BOUNCE = 0x161210; // paving return — near-neutral on purpose, see hemi note

// Emissive budget per kind, in linear emissive units before tone mapping.
// This is THE emissive scale. Kinds are matched loosely (substring, lowercased)
// so an owner naming theirs `redLantern`, `red-lantern` or `lantern_red` all
// land in the same bucket, and anything unrecognised gets DEFAULT rather than
// whatever number they happened to type.
//
// THE NUMBER THAT MATTERS IS TUNE.bloomThreshold (1.8, linear). A kind budgeted
// ABOVE it glows; a kind below it is merely a bright surface. That split is the
// difference between the reference frame and a warm smear:
//
//   above threshold  lanterns, red lanterns, soffit lamps, strip lights, neon,
//                    the distant tower — sources, and only sources
//   below threshold  posters, menu boards, noren, banners, fascia signs, stall
//                    interiors, crates — LIT things, dense and bright, no halo
//
// The first pass had every sign class at 2.2. frontage.js registers ~150 of
// them, so the entire right-hand mass bloomed at once, clipped 5.2% of the frame
// (the reference clips 0.1%) and the lanterns stopped being the brightest thing
// in shot — which is the one job §4 gives them.
const KIND_BUDGET = [
  [['redlantern', 'lanternred', 'chochinred', 'redchochin'], 2.1],
  [['frontagelantern'], 2.1],
  [['lantern', 'chochin'], 2.6], // §4 primary source — the brightest thing in frame
  [['neon', 'tube', 'striplight', 'lightbox', 'bulb', 'lamp'], 1.5],
  [['tower', 'distant', 'skyline'], 2.0], // §6/D12 the one cool note — must read at L120-150
  [['sign', 'signboard', 'billboard', 'menu', 'fascia', 'blade', 'pilaster'], 0.62],
  [['stall', 'interior', 'counter', 'awning', 'soffit', 'pocket'], 0.75],
  [['poster', 'panel', 'placard', 'aframe', 'board', 'banner', 'noren'], 0.55],
  [['ice', 'display', 'cooler', 'crate'], 0.6],
  [['window', 'building', 'facade'], 0.35],
];
const DEFAULT_BUDGET = 0.8;

function budgetFor(kind) {
  const k = String(kind ?? '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [names, budget] of KIND_BUDGET) {
    for (const n of names) if (k.includes(n)) return budget;
  }
  return DEFAULT_BUDGET;
}

// ---------------------------------------------------------------------------
// Tunables. Grouped so a later pass can move one number and know what it costs.
// ---------------------------------------------------------------------------

const TUNE = {
  exposure: 0.46,
  // §7 wants strong bloom. Strong bloom on SOURCES — the threshold below is in
  // LINEAR pre-tone-map units, so a value of 1.15 sits above any diffuse
  // surface however brightly lit and below every emissive budget above. At the
  // 0.52 this started on, lit brick and lit signage bloomed too and the whole
  // frame went to a warm mid-grey wash with no lantern reading as a lantern.
  // Radius is the sky's contrast, not the lanterns'. At 0.48 the halos of 84
  // chochin merged into one sheet and turned the §6 navy sky warm brown — the
  // frame measured 0% cool where the reference measures 5.8%. Tight halos +
  // more strength keeps the glow per-source and leaves the sky black.
  bloomStrength: 0.19, // D7: audit measured bright area at 1.97x the reference
  bloomRadius: 0.14,
  bloomThreshold: 1.8, // only the chochin, red lanterns and lamps clear this
  // §6 values drop into the distance, but the reference's VANISHING POINT is the
  // warmest, haziest part of the frame, not the darkest. At 0.017 the fog closed
  // the far street to black and threw away the depth the converging lantern rows
  // exist to create.
  fogDensity: 0.0125,
  envIntensity: 0.26,
  distanceHaze: 0.3,
  lanternLightIntensity: 17.0, // candela; decay 2
  lanternLightDistance: 22,
  stallLightIntensity: 14.0,
  stallLightDistance: 11,
  redLightIntensity: 4.0,
  // The ONLY cool light in the scene, and the reason the frame is not monochrome
  // orange. §9 wants 30% deep navy and the reference measures 5.8% cool / 15.5%
  // neutral pixels; with warm practicals alone this frame measured 0% / 0.8%.
  hemiIntensity: 0.46,
  moonIntensity: 0.22,
  // The navy sky has to survive the exposure or it tone-maps to black and the
  // §6 contrast field disappears behind bloom.
  skyIntensity: 5.0,
  spotIntensity: 22,
  // street.js's paving plus the PMREM probe already produce the sharp specular
  // streaks. These broad cards are only the soft underlay; at 0.24 they read as
  // painted blobs sitting ON the brick instead of light coming off it.
  poolOpacity: 0.13,
  steamOpacity: 0.24,
  vignette: 0.16,
  // D6 / D4 display-grade targets. See DisplayGradeShader.
  saturation: 0.99,
  blackFloor: 0.038,
  whiteCeil: 0.93,
  ambientFloor: 0.072,
};

// ---------------------------------------------------------------------------
// Procedural textures. All deterministic — every capture must be reproducible.
// ---------------------------------------------------------------------------

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

/**
 * Equirect environment. Not a sky — a *light probe* for the damp paving and for
 * the ambient the practicals cannot reach. Warm band sits where the lantern rows
 * are, the +X half is pushed red because that is where the frontage is, and one
 * small pale patch stands in for the §6 tower.
 */
function buildEnvTexture() {
  const { c, g } = canvas2d(512, 256);

  // Sky half: zenith near-black to navy horizon.
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#060a14');
  sky.addColorStop(0.62, '#131f3c');
  sky.addColorStop(1, '#22355e');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 128);

  // Ground half: warm brown return off the wet paving.
  const gnd = g.createLinearGradient(0, 128, 0, 256);
  gnd.addColorStop(0, '#4a2a12');
  gnd.addColorStop(0.45, '#24150a');
  gnd.addColorStop(1, '#0b0705');
  g.fillStyle = gnd;
  g.fillRect(0, 128, 512, 128);

  // The lantern band. Two soft horizontal bands above the horizon — this is what
  // the damp paving actually reflects.
  const band = g.createLinearGradient(0, 52, 0, 132);
  band.addColorStop(0, 'rgba(255,150,60,0)');
  band.addColorStop(0.45, 'rgba(255,168,86,0.7)');
  band.addColorStop(0.72, 'rgba(255,120,50,0.4)');
  band.addColorStop(1, 'rgba(255,110,50,0)');
  g.fillStyle = band;
  g.fillRect(0, 52, 512, 80);

  // Frontage bias: the +X half of the probe carries more red-orange. Equirect u
  // 0..1 wraps azimuth; the frontage occupies roughly a quarter of it.
  const front = g.createLinearGradient(288, 0, 448, 0);
  front.addColorStop(0, 'rgba(255,70,30,0)');
  front.addColorStop(0.5, 'rgba(255,86,36,0.42)');
  front.addColorStop(1, 'rgba(255,70,30,0)');
  g.fillStyle = front;
  g.fillRect(288, 60, 160, 130);

  // §6 the one cool architectural note.
  const tower = g.createRadialGradient(96, 84, 2, 96, 84, 30);
  tower.addColorStop(0, 'rgba(198,220,255,0.85)');
  tower.addColorStop(1, 'rgba(150,180,240,0)');
  g.fillStyle = tower;
  g.fillRect(60, 50, 76, 76);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Background sky only. §6 calls this "deep navy, essentially black at the top of
 * frame", and the first version read that as literally black — which is what a
 * side-by-side exposed as the biggest remaining gap. In the reference the whole
 * upper-left is a clearly BLUE field with the treeline and distant blocks legible
 * inside it, not a void. Near-black belongs at the very top of frame only.
 *
 * ---------------------------------------------------------------------------
 * THE SKY IS VIOLET AT THE TOP, NOT BLUE. (D5b)
 *
 * D5 got the frame from an orange sky to a blue one, and there it stopped being
 * wrong and started being *incomplete*. Measured on the canonical recipe below,
 * the reference puts **4.93%** of its colourful pixels in the violet/magenta band
 * (260-345 deg) against this frame's **0.74%** — a 6.7x shortfall and, with blue
 * and green already on target, the largest single colour gap left in the frame.
 *
 * It is the SKY's own colour, not signage. The reference's violet pixels have a
 * y median of 0.038 — the very top of the content frame — a mean RGB of
 * (46.3, 36.1, 41.8) and a mean HSV value of 0.184. Row by row, violet's share of
 * colourful pixels runs 59% / 61% / 35% over y 0.00-0.06 and collapses to under
 * 3% by y 0.06, where blue takes over and climbs to 39% by y 0.20. The reference
 * sky is a dusky violet overhead grading to navy toward the horizon. Chasing this
 * with coloured practicals or panels would put the violet in the lower half of
 * frame, which is exactly where the reference does not have it.
 *
 * WHERE THE STOPS LAND IN FRAME, AND WHY THE HINGE IS WHERE IT IS.
 *
 * This is an equirect background: CanvasTexture flips Y, so canvas row 0 is
 * v = 1 (zenith) and canvas y = 0.5 is the horizon. Elevation maps as
 * canvas_y = 0.5 - elevation_deg / 180. Both shots that matter look very nearly
 * level (hero pitch -0.6 deg, fov 52; wide pitch -0.7, fov 62), so the sky the
 * camera can actually see is a narrow strip of this gradient — the whole visible
 * range is 14 hundredths of the canvas:
 *
 *   hero  frame y 0.00 -> canvas 0.359      wide  frame y 0.00 -> canvas 0.332
 *         frame y 0.10 -> canvas 0.385            horizon      -> canvas 0.504
 *         frame y 0.30 -> canvas 0.442
 *         frame y 0.50 -> canvas 0.503 (horizon)
 *
 * Everything above canvas 0.33 is off the top of every shot; everything below
 * 0.51 is behind the street. So the violet plateau ends at canvas 0.375 and the
 * whole swing back to navy is squeezed into 0.375-0.405 — three hundredths of the
 * canvas doing all the work, which is why these stops look absurdly close
 * together and why moving one by 0.004 is a visible, measurable change.
 *
 * The hinge position is a MEASURED TRADE, not a taste call, because the sky is
 * the frame's only large cool mass and violet can only be bought out of blue.
 * Every capture below is the hero shot at 1920x1080 on the canonical recipe:
 *
 *   hinge canvas   frame y   violet %   blue %    (reference: 4.93 / 7.48)
 *      0.445        0.30       5.90      4.37
 *      0.412        0.19       5.66      5.11
 *      0.400        0.16       5.05      5.78
 *      0.389        0.13       4.82      5.67   <- shipped
 *      0.385        0.12       4.53      6.22
 *     ~0.37        ~0.08      ~3.5      ~7.3    (extrapolated)
 *
 * Sky pixels moved out of blue land in violet one for one; no setting satisfies
 * both, because this frame's total cool mass is ~10.7% of its colourful pixels
 * against the reference's 12.4%. Violet was the named gap and was 6.7x out; blue
 * was 39% OVER on this recipe (10.38 against 7.48) before this change. So the
 * hinge is set to land violet exactly on the reference and let blue take the
 * residual — it passes through the target on the way and settles 1.7 points
 * under. The remaining cool deficit is AREA, not hue, and it is not the sky's to
 * fix: the reference sources much of its blue from a dark treeline and distant
 * blocks, which are street.js's and dressing.js's geometry.
 *
 * THE HEX VALUES ARE SOLVED, NOT PICKED. A texel here is multiplied by
 * backgroundIntensity 5.0, tone-mapped by ACES at exposure 0.46, then remapped by
 * DisplayGradeShader — so the authored colour and the measured colour are a long
 * way apart, and eyeballing the hex gets the hue wrong by tens of degrees. Each
 * stop below was obtained by numerically inverting that whole chain for a chosen
 * OUTPUT colour, and the OUTPUT colour is what is quoted:
 *
 *   canvas 0.30  #291c2c -> (53, 35, 58)  hue 286  sat 0.39   zenith violet
 *   canvas 0.375 #271b2b -> (50, 34, 56)  hue 282  sat 0.40   plateau
 *   canvas 0.389 #201926 -> (39, 31, 48)  hue 270  sat 0.36   violet/blue hinge
 *   canvas 0.405 #1b202f -> (33, 40, 63)  hue 225  sat 0.47   navy resumes
 *   canvas 0.50  #1d2433 -> (36, 47, 70)  hue 221  sat 0.48   horizon navy
 *
 * Two things those numbers are doing at once. D5's constraint survives — every
 * one has B > R, so no sky patch reads warm — and the violet ones clear the
 * 260 deg band edge by 10-26 deg, which is the margin that keeps them counted as
 * violet after the 1600x1000 resample smears them against whatever is next to
 * them in frame. Note the measured hue lands ~12 deg ABOVE the authored one
 * (285 -> ~297 in the assembled frame); ACES does that, which is the other reason
 * for solving rather than picking.
 *
 * The whole ramp is also 22% darker than the blue sky it replaces. The reference
 * sky sits at L 26-40 and this one was reading L 52 at top-centre; the previous
 * pass had lifted it hard to escape D5's "essentially black" and overshot. That
 * darkening is worth 0.6 of mean L and it pulled the violet band's mean HSV value
 * from 0.268 to 0.223 against the reference's 0.184 — i.e. it fixed a value error
 * at the same time as the hue error, and cost nothing else in the frame.
 *
 * RESULT, hero shot, canonical recipe: violet 0.74% -> 4.82% against the
 * reference's 4.93%, y median 0.095, mean value 0.226 (reference 0.184). Nothing
 * else moved: p1 10.4, clipped 0.00%, bright 5.78% (ref 5.88), mean saturation
 * 0.484 (was 0.486), green 0.73 (was 0.75), every sky patch still B > R.
 * ---------------------------------------------------------------------------
 */
function buildSkyTexture() {
  const { c, g } = canvas2d(64, 256);
  // D5 target: every sky patch must measure B > R, and top-centre lands at
  // L~30-45, NOT black. The spec's "essentially black at the top of frame" is
  // measurably wrong against the reference and produced an orange void here.
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#251929'); // above every shot; kept on the violet ramp
  sky.addColorStop(0.30, '#291c2c'); // zenith violet — top of the wide shot
  sky.addColorStop(0.375, '#271b2b'); // violet plateau — upper sixth of the hero
  sky.addColorStop(0.389, '#201926'); // hinge: hue 270, half way out of the band
  sky.addColorStop(0.405, '#1b202f'); // navy resumes — hue crosses 260 at frame y~0.16
  sky.addColorStop(0.50, '#1d2433'); // horizon
  sky.addColorStop(0.60, '#171d2a');
  sky.addColorStop(0.82, '#131822');
  sky.addColorStop(1, '#0e1219');
  g.fillStyle = sky;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial falloff — used for the wet-ground pools. */
function buildPoolTexture() {
  const { c, g } = canvas2d(256, 256);
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.22, 'rgba(255,255,255,0.62)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Irregular soft puff for the steam. Deterministic blobs, no noise library. */
function buildPuffTexture(rand) {
  const { c, g } = canvas2d(256, 256);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = 18 + rand() * 58;
    const x = 128 + Math.cos(a) * d;
    const y = 128 + Math.sin(a) * d * 0.85;
    const rr = 34 + rand() * 54;
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,0.30)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.11)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // Trim to a circle so sprite corners never show a hard edge.
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.7, 'rgba(255,255,255,0.75)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Emissive normalisation
// ---------------------------------------------------------------------------

function eachMaterial(object, fn) {
  const visit = (o) => {
    const m = o?.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach(fn);
    else fn(m);
  };
  if (!object) return;
  if (object.isMesh || object.isPoints || object.isLine || object.isSprite) visit(object);
  else if (object.traverse) object.traverse((o) => { if (o.isMesh || o.isSprite) visit(o); });
}

/**
 * Apply the one emissive scale. Returns a per-kind summary for the report.
 * See decision (1) at the top of the file for why raw intensities are treated
 * as within-kind ratios rather than absolute values.
 */
function normaliseEmissives(entries) {
  const peak = new Map();
  for (const e of entries) {
    const kind = String(e?.kind ?? 'default');
    const raw = Number.isFinite(e?.intensity) ? Math.abs(e.intensity) : 1;
    peak.set(kind, Math.max(peak.get(kind) ?? 0, raw));
  }

  const summary = {};
  for (const e of entries) {
    const kind = String(e?.kind ?? 'default');
    const raw = Number.isFinite(e?.intensity) ? Math.abs(e.intensity) : 1;
    const top = Math.max(peak.get(kind) ?? 1, 1e-4);
    const budget = budgetFor(kind);
    // Ratio within the owner's own set, then my budget. Floor at 25% so a value
    // an owner meant as "dim" still reads as lit rather than dead.
    const level = budget * (0.25 + 0.75 * Math.min(1, raw / top));
    const color = new THREE.Color(e?.color ?? WARM_3000K);

    let touched = 0;
    eachMaterial(e?.mesh, (m) => {
      if (!m) return;
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) {
        if (m.emissive) m.emissive.copy(color);
        m.emissiveIntensity = level;
        m.toneMapped = true;
        m.needsUpdate = true;
        touched += 1;
      } else if (m.isMeshBasicMaterial || m.isSpriteMaterial || m.isPointsMaterial) {
        // No emissive channel — drive base colour into HDR instead so the value
        // still lands above the bloom threshold.
        m.color.copy(color).multiplyScalar(level);
        m.toneMapped = true;
        m.needsUpdate = true;
        touched += 1;
      }
    });

    const s = (summary[kind] ??= { count: 0, budget, materials: 0, rawPeak: top, level: 0 });
    s.count += 1;
    s.materials += touched;
    s.level = Math.max(s.level, level);
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Light placement
// ---------------------------------------------------------------------------

/**
 * World positions of the lantern-row emissives, if lanterns.js registered any.
 * Falls back to the shared MARKET geometry so the frame is still lit when a
 * neighbouring module is mid-edit and failed to load.
 */
function lanternAnchors(scene, entries, MARKET) {
  scene.updateMatrixWorld(true);
  const found = [];
  for (const e of entries) {
    const k = String(e?.kind ?? '').toLowerCase();
    if (!k.includes('lantern') && !k.includes('chochin')) continue;
    if (k.includes('red')) continue; // handled separately as an accent
    const o = e.mesh;
    if (!o?.getWorldPosition) continue;
    const p = o.getWorldPosition(new THREE.Vector3());
    if (!Number.isFinite(p.x)) continue;
    if (p.y < 3) continue; // frontage lanterns, not the overhead rows
    found.push(p);
  }
  if (found.length >= 6) return { anchors: found, source: 'registry' };

  const anchors = [];
  for (const x of MARKET.lanternRowX) {
    for (let i = 0; i < MARKET.lanternCount; i += 1) {
      anchors.push(new THREE.Vector3(x, MARKET.lanternRowY, 2 - i * MARKET.lanternSpacing));
    }
  }
  return { anchors, source: 'MARKET' };
}

// The stretch of street that gets real lights, in world Z. Deliberately NOT
// derived from camera.position: main.js calls buildNightMarket() BEFORE it
// applies the shot, so at build time the camera is still at the origin. Keying
// light placement off it put every light in the wrong half of the street and
// the near lanterns went dark. All four shots look down -Z from z >= 2, so a
// fixed window serves every one of them.
const LIT_Z_NEAR = 4;
const LIT_Z_FAR = -15;

/**
 * Pick real-light positions from the anchors: nearest z-slices only, both rows,
 * thinned so the pools overlap without stacking. Decision (2).
 */
function pickLanternLights(anchors) {
  const near = anchors
    .filter((p) => p.z > LIT_Z_FAR && p.z < LIT_Z_NEAR)
    .sort((a, b) => b.z - a.z);

  const chosen = [];
  const MIN_GAP = 4.5;
  for (const p of near) {
    const clash = chosen.some((c) => Math.abs(c.z - p.z) < MIN_GAP && Math.sign(c.x) === Math.sign(p.x));
    if (!clash) chosen.push(p);
    if (chosen.length >= 6) break;
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export async function build(ctx) {
  const { scene, camera, renderer, MARKET, onProgress = () => {} } = ctx;
  const entries = ctx.emissives?.entries ?? [];
  const rand = (ctx.rng ?? (() => Math.random))(0x4e4d4c01);
  ctx.updaters ??= [];

  const group = new THREE.Group();
  group.name = 'lighting';
  scene.add(group);

  // -- 1. Tone mapping and exposure -----------------------------------------
  // main.js sets ACESFilmic/1.0 as a starting state; overriding it here is the
  // point. ACES is kept — its highlight roll-off is what turns a lantern core
  // near-white without going flat magenta the way Reinhard does at this
  // saturation — but exposure is pushed so the frontage clips and the unlit
  // mass falls to near-black. OutputPass reads both from the renderer each
  // frame, so these are the values that actually land.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TUNE.exposure;
  // main.js asks for PCFSoftShadowMap, which r185 deprecates and silently
  // downgrades to PCFShadowMap — one of the "verify the resolved value" traps.
  // Set it explicitly so what is configured is what runs.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // -- 2. Sky, fog, environment ---------------------------------------------
  onProgress('Lighting: atmosphere…');
  if (!scene.background) {
    scene.background = buildSkyTexture();
    scene.backgroundIntensity = TUNE.skyIntensity;
  }
  // §6 values drop into the distance. The fog colour is a dark WARM neutral, not
  // the navy it started as: the navy contrast field in this frame comes from the
  // sky and the hemisphere fill, whereas the air down the street is full of
  // lantern light and cooking smoke, and a navy fog turned the far market into a
  // black hole where the reference has its warmest, haziest passage.
  scene.fog = new THREE.FogExp2(new THREE.Color(0x1b1e26), TUNE.fogDensity);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envSource = buildEnvTexture();
  const envRT = pmrem.fromEquirectangular(envSource);
  scene.environment = envRT.texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = TUNE.envIntensity;
  envSource.dispose();
  pmrem.dispose();

  // -- 3. The single emissive scale -----------------------------------------
  onProgress('Lighting: emissive scale…');
  const emissiveSummary = normaliseEmissives(entries);

  // -- 4. Practical lights ---------------------------------------------------
  onProgress('Lighting: practicals…');
  const { anchors, source: anchorSource } = lanternAnchors(scene, entries, MARKET);
  const lanternLightPositions = pickLanternLights(anchors);

  const lights = [];
  const addLight = (light, role) => {
    light.userData.role = role;
    group.add(light);
    lights.push(light);
    return light;
  };

  // 4a. The lantern rows — the primary source. Overlapping warm pools, §7.
  for (const p of lanternLightPositions) {
    const l = new THREE.PointLight(WARM_3000K, TUNE.lanternLightIntensity, TUNE.lanternLightDistance, 2);
    l.position.copy(p).setY(p.y - 0.25); // just under the paper, where a chochin emits
    addLight(l, 'lantern');
  }

  // 4b. Stall pockets under the eaves on the right, §3. Warmer and closer in, so
  //     the frontage is the brightest lit mass in frame after the lanterns.
  const stallZ = [2.2, -3.4, -9.0];
  for (const z of stallZ) {
    const l = new THREE.PointLight(WARM_2700K, TUNE.stallLightIntensity, TUNE.stallLightDistance, 2);
    l.position.set(MARKET.frontageRight - 1.0, MARKET.awningHeight - 0.45, z);
    addLight(l, 'stall');
  }

  // 4b-ii. LEFT-SIDE POCKETS, §5. This is the counterpart to 4b and it was the
  // single largest remaining gap in the assembled frame.
  //
  // Every stall pocket in 4b sits at frontageRight, so the left half of the
  // street had no light of its own and the tables, benches, kegs and seated
  // figures fell one to two stops under the reference — measured at luma 0.14
  // against the reference's 0.29 over the same region. dressing.js had been
  // compensating with emissive FIXTURES (a festoon, umbrella bulbs, a self-lit
  // truck fascia), which is bloom standing in for illumination: it makes the
  // fixtures glow without putting light on anything near them. Emissives do not
  // illuminate. Only these do.
  //
  // Positions are the ones dressing.js asked for, so the seating, the kegs and
  // the truck all sit inside a pocket.
  //
  // THE FOURTH POCKET (z = 5.5) IS THE NEAR ONE AND IT IS NEW. The first three
  // stopped at z = 3.0 because that is where dressing.js's seating stopped. Its
  // near communal table now reaches z = 6.5 — a metre and a half in front of the
  // nearest pocket — so every seated figure at that end was lit only from behind,
  // by the tail of a source 3.5 m up-street of it. That is a real shaping fault
  // and it is what this light fixes.
  //
  // IT IS DELIBERATELY SMALL, AND THE NUMBER THAT ASKED FOR A BIG ONE IS WRONG.
  // The brief for this light was "the near-left corner measures L 40 against the
  // reference's 106". The reference does not measure 106 there. That figure comes
  // from the reference's own MINIMAP HUD, a near-white overlay occupying
  // x 2.4-19.8%, y 74.2-91.0% — which lands almost entirely inside the near-left
  // corner box (x 0-17%, y 67-100%) that dressing.js's D9 note defines. Measured
  // on that exact box:
  //
  //   reference, HUD masked out   mean L  34.6   median 17.8   45.3% below L16
  //   reference, HUD left in      mean L  93.2   median 72.2   25.5% below L16
  //   this frame, before          mean L  38.5   median 43.2   22.9% below L16
  //
  // So the corner was already AT the reference and the 2.6x lift the brief asked
  // for would have been a 2.6x overshoot. Sizing this light to the phantom target
  // was tried first: at intensity 15 / range 11 the corner went to 55 and the
  // whole frame's mean L went 66.9 -> 74.0 against the reference's 65.1, wiping
  // out an exposure match three owners had converged on, and washing enough navy
  // out of the left-hand shadows to cost 1.7 points of blue and 0.6 of green.
  //
  // Shipped at 3.5 / 6.5 instead: about half a stall pocket's irradiance at 1.5 m,
  // enough to put light on the front faces of the near table and the two figures
  // at it, and no further. Corner 38.5 -> 44.0 (reference 34.6), frame mean L
  // 66.9 -> 67.2, and 0.4 ms of a 11.1 ms frame at 1600x900. It is a fill, not a
  // key. See the MEASUREMENT DEFINITION block
  // at the top of this file — masking that HUD is rule 4 in it, and this is the
  // second defect in this build traced to a recipe disagreement rather than to
  // the render.
  for (const [x, y, z, i, d] of [
    [-2.6, 2.45, 5.5, 3.5, 6.5],
    [-2.4, 2.3, 3.0, 13.0, 10],
    [-2.3, 2.25, -1.2, 13.0, 10],
    [-2.2, 2.2, -5.8, 13.0, 10],
  ]) {
    const l = new THREE.PointLight(WARM_2700K, i, d, 2);
    l.position.set(x, y, z);
    addLight(l, 'seating');
  }

  // 4c. Red accents, §7. Small radius — these are colour, not illumination.
  const redZ = [0.6, -6.6];
  for (const z of redZ) {
    const l = new THREE.PointLight(RED_ACCENT, TUNE.redLightIntensity, 5.5, 2);
    l.position.set(MARKET.frontageRight - 0.55, MARKET.redLanternHeight - 0.15, z);
    addLight(l, 'red');
  }

  // 4d. One shadow caster for the whole scene. A wide, soft spot hung above the
  //     street reads as the aggregate downward throw of the lantern canopy and
  //     gives tables, crates and figures ground contact. Point-light shadows
  //     would be 6 cube faces EACH — this is one depth pass total.
  const spot = new THREE.SpotLight(WARM_3000K, TUNE.spotIntensity, 42, 0.95, 1.0, 1.4);
  spot.position.set(0.4, MARKET.lanternRowY + 2.6, -3);
  spot.target.position.set(-0.2, 0, -11);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 1.5;
  spot.shadow.camera.far = 44;
  spot.shadow.bias = -0.0007;
  spot.shadow.normalBias = 0.022;
  group.add(spot.target);
  addLight(spot, 'canopy');

  // 4e. Fill. Deliberately tiny: §7 wants near-black shadow, so this only stops
  //     unlit mass reading as a dead black hole, and tints it navy not grey.
  const hemi = new THREE.HemisphereLight(SKY_NAVY, GROUND_BOUNCE, TUNE.hemiIntensity);
  addLight(hemi, 'fill');

  // D4: an explicit black floor. The reference's darkest 1% still sits at L 8.4
  // and only 10.7% of it is below L16; this frame was bottoming out at literal
  // zero over 21% of its area. A small COOL ambient is the cheapest floor and it
  // pays for D5 and D6 at the same time, because the blue it adds is exactly
  // what the paving's B/R ratio was missing.
  const ambient = new THREE.AmbientLight(SKY_NAVY, TUNE.ambientFloor);
  addLight(ambient, 'floor');

  const moon = new THREE.DirectionalLight(COOL_MOON, TUNE.moonIntensity);
  moon.position.set(-9, 16, 7);
  addLight(moon, 'moon');

  // -- 5. Damp ground return -------------------------------------------------
  // street.js owns the paving roughness; the PMREM above gives that roughness
  // something warm to reflect. These flat additive cards add the broad wet glow
  // underneath each near lantern and along the frontage — elongated toward the
  // camera because a reflection of a source above stretches along the view ray.
  onProgress('Lighting: wet ground…');
  const poolTex = buildPoolTexture();
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  const pools = new THREE.Group();
  pools.name = 'lighting:ground-pools';
  pools.renderOrder = 4;
  group.add(pools);

  const addPool = (x, z, sx, sz, hex, opacity) => {
    const mat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: new THREE.Color(hex),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
      // Additive + fog would ADD the navy fog colour into the distance and lift
      // the far street instead of dropping it. Distance falloff is done by the
      // per-pool opacity below instead.
      fog: false,
    });
    const m = new THREE.Mesh(poolGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.022, z);
    m.scale.set(sx, sz, 1);
    m.renderOrder = 4;
    pools.add(m);
    return m;
  };

  for (const p of lanternLightPositions) {
    const fade = THREE.MathUtils.clamp(1 - (LIT_Z_NEAR - p.z) / 26, 0.35, 1);
    addPool(p.x * 0.85, p.z, 2.3, 6.2, WARM_3000K, TUNE.poolOpacity * fade);
  }
  // Frontage spill: a continuous warm-red smear where the stall light hits the
  // wet paving, not discrete blobs.
  for (let i = 0; i < 7; i += 1) {
    const z = 3.5 - i * 3.1;
    addPool(MARKET.frontageRight - 1.35, z, 2.2, 5.0, 0xff8438, TUNE.poolOpacity * 0.9);
  }

  // -- 5b. Distance haze -----------------------------------------------------
  // The market does not stop at the end of the geometry. In the reference the
  // vanishing point is the brightest, softest passage in the frame — lantern
  // light hanging in cooking smoke over a crowd. One broad additive card at the
  // far end supplies that, seen only through the gap between the frontages.
  const hazeTex = buildPoolTexture();
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: hazeTex,
      color: new THREE.Color(0xffbe92),
      transparent: true,
      opacity: TUNE.distanceHaze,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
      fog: false,
    }),
  );
  haze.name = 'lighting:distance-haze';
  haze.position.set(-0.4, 2.2, -40);
  haze.scale.set(20, 7, 1);
  haze.renderOrder = 3;
  group.add(haze);

  // -- 6. Steam ---------------------------------------------------------------
  // §7 "rising from the stalls, visible as warm haze mid-left". Sprites, not a
  // volumetric — 54 sprites cost nothing, sit inside the light pools, and pick
  // up bloom at their warm base exactly as the reference's plume does.
  onProgress('Lighting: steam…');
  const puffTex = buildPuffTexture(rand);
  const steamGroup = new THREE.Group();
  steamGroup.name = 'lighting:steam';
  group.add(steamGroup);

  // Placed where the reference puts the plume: lower-LEFT FOREGROUND, in front
  // of the communal tables, not out in the middle distance. A plume further down
  // the street just veils the depth the lantern rows are building.
  const EMITTERS = [
    { x: -1.25, z: 4.4, rise: 2.1, spread: 0.5, warm: 1.0 },
    { x: -1.85, z: 2.4, rise: 2.4, spread: 0.6, warm: 0.9 },
    { x: -0.85, z: 0.9, rise: 1.9, spread: 0.45, warm: 1.0 },
  ];
  const WARM_STEAM = new THREE.Color(0xffa268);
  const COOL_STEAM = new THREE.Color(0x8c93a4);
  const puffs = [];
  for (const em of EMITTERS) {
    for (let i = 0; i < 18; i += 1) {
      const mat = new THREE.SpriteMaterial({
        map: puffTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: THREE.NormalBlending,
        toneMapped: true,
        fog: true,
      });
      const s = new THREE.Sprite(mat);
      s.renderOrder = 6;
      steamGroup.add(s);
      puffs.push({
        s,
        mat,
        em,
        phase: rand(),
        speed: 0.09 + rand() * 0.075,
        drift: (rand() - 0.5) * 0.55,
        driftZ: (rand() - 0.5) * 0.35,
        wobble: rand() * Math.PI * 2,
        s0: 0.4 + rand() * 0.32,
        s1: 1.6 + rand() * 1.1,
        peak: (0.55 + rand() * 0.55) * TUNE.steamOpacity,
        ox: (rand() - 0.5) * em.spread,
        oz: (rand() - 0.5) * em.spread,
      });
    }
  }

  // FRAME-LOCKED AND SETTLE-HELD. Two separate problems, both of which made
  // captures of this scene incomparable:
  //
  //   1. It advanced off the wall-clock elapsed time main.js passes in, so the
  //      plume sat somewhere different in every run.
  //   2. Frame-locking alone was NOT enough, and the measurement proves it: two
  //      900-frame runs still differed, because rendering does not stop when
  //      main.js sets data-market-ready — a harness takes a variable number of
  //      further frames removing HUD nodes and reading state before it
  //      screenshots, and the plume kept moving through all of them.
  //
  // So the plume advances on a fixed 1/60 step for exactly the settle window and
  // then HOLDS. Every capture of a ready scene is then identical no matter how
  // long the harness takes to get to the screenshot. `?steam=live` opts back in
  // to continuous motion for interactive viewing.
  const STEAM_STEP = 1 / 60;
  const steamParams = new URLSearchParams(globalThis.location?.search ?? '');
  const steamLive = steamParams.get('steam') === 'live';
  const steamHoldAt = Number(steamParams.get('settle') ?? 900);
  let steamFrame = 0;
  const tmpColor = new THREE.Color();
  ctx.updaters.push(() => {
    const t = steamFrame * STEAM_STEP;
    if (steamLive || steamFrame < steamHoldAt) steamFrame += 1;
    for (const p of puffs) {
      const life = (t * p.speed + p.phase) % 1;
      const y = 0.35 + life * p.em.rise;
      const w = Math.sin(p.wobble + life * 3.1) * 0.18;
      p.s.position.set(
        p.em.x + p.ox + p.drift * life + w,
        y,
        p.em.z + p.oz + p.driftZ * life,
      );
      const k = THREE.MathUtils.lerp(p.s0, p.s1, life);
      p.s.scale.set(k, k * 1.12, 1);
      // In and out, weighted so the plume is densest low where the light is.
      const fade = Math.sin(Math.PI * Math.min(1, life * 1.08)) ** 1.35;
      p.mat.opacity = p.peak * fade * (1 - 0.35 * life);
      tmpColor.copy(WARM_STEAM).lerp(COOL_STEAM, Math.min(1, life * 1.25) * (1 - p.em.warm * 0.35));
      p.mat.color.copy(tmpColor);
    }
  });

  // -- 7. Post: bloom, then tone map ----------------------------------------
  // The composer render target is HalfFloat and RenderPass writes to it, so the
  // renderer skips tone mapping and sRGB encode at material level (r152+
  // behaviour). Bloom therefore thresholds LINEAR HDR values, and OutputPass at
  // the end is what applies ACES + exposure + sRGB. Getting that order wrong is
  // what makes bloom look like a grey wash instead of a source glow.
  onProgress('Lighting: post…');
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  // main.js reads renderer.info.render.triangles straight after its render call
  // to fill the HUD. Once the composer is installed, the LAST thing rendered is
  // OutputPass's fullscreen triangle, so that readout collapsed to "1 tris".
  // Record the real scene totals as the RenderPass finishes and restore them
  // after compositing, so another owner's readout keeps telling the truth.
  const renderPass = new RenderPass(scene, camera);
  let sceneTriangles = 0;
  let sceneCalls = 0;
  const renderPassRender = renderPass.render.bind(renderPass);
  renderPass.render = (...args) => {
    renderPassRender(...args);
    sceneTriangles = renderer.info.render.triangles;
    sceneCalls = renderer.info.render.calls;
  };
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    TUNE.bloomStrength,
    TUNE.bloomRadius,
    TUNE.bloomThreshold,
  );
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.amount.value = TUNE.vignette;
  composer.addPass(vignette);

  composer.addPass(new OutputPass());

  // After OutputPass, so it grades display-referred sRGB — see DisplayGradeShader.
  const grade = new ShaderPass(DisplayGradeShader);
  grade.uniforms.saturation.value = TUNE.saturation;
  grade.uniforms.blackFloor.value = TUNE.blackFloor;
  grade.uniforms.whiteCeil.value = TUNE.whiteCeil;
  composer.addPass(grade);

  ctx.composer = composer;
  ctx.bloom = bloom;
  ctx.grade = grade;

  // main.js calls renderer.render(scene, camera) directly and is owned by
  // someone else, so the composer is installed by wrapping render rather than by
  // editing that file. The guard keeps RenderPass's own inner render (and any
  // PMREM/cube-camera render from another module) on the raw path.
  let composing = false;
  const rawRender = renderer.render.bind(renderer);
  renderer.render = function patchedRender(sc, cam) {
    if (composing || sc !== scene || cam !== camera) return rawRender(sc, cam);
    composing = true;
    try {
      composer.render();
      renderer.info.render.triangles = sceneTriangles;
      renderer.info.render.calls = sceneCalls;
    } finally {
      composing = false;
    }
  };

  addEventListener('resize', () => {
    const w = innerWidth;
    const h = innerHeight;
    composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    composer.setSize(w, h);
    bloom.setSize(w, h);
  });

  // -- 8. Resolved-value report ----------------------------------------------
  // Days have been lost in this repo to settings that were silently overridden,
  // so this reports what the renderer and materials ACTUALLY hold after every
  // module has run, not what was passed in.
  const report = () => {
    const toneNames = {
      [THREE.NoToneMapping]: 'None',
      [THREE.LinearToneMapping]: 'Linear',
      [THREE.ReinhardToneMapping]: 'Reinhard',
      [THREE.CineonToneMapping]: 'Cineon',
      [THREE.ACESFilmicToneMapping]: 'ACESFilmic',
      [THREE.AgXToneMapping]: 'AgX',
      [THREE.NeutralToneMapping]: 'Neutral',
    };
    const byRole = {};
    for (const l of lights) byRole[l.userData.role] = (byRole[l.userData.role] ?? 0) + 1;
    // Census the WHOLE scene, not just my group: if another owner adds a light
    // it silently escapes the one lighting budget, and the only way to notice
    // is to count what the renderer will actually shade with.
    const census = {};
    let foreign = 0;
    scene.traverse((o) => {
      if (!o.isLight) return;
      census[o.type] = (census[o.type] ?? 0) + 1;
      if (!lights.includes(o)) foreign += 1;
    });
    // Read the level back off a real material rather than trusting the write.
    const sampled = [];
    for (const e of entries.slice(0, 400)) {
      eachMaterial(e.mesh, (m) => {
        if (sampled.length < 6 && m && (m.emissiveIntensity !== undefined || m.isMeshBasicMaterial)) {
          sampled.push({
            kind: e.kind,
            type: m.type,
            emissiveIntensity: m.emissiveIntensity,
            color: m.isMeshBasicMaterial ? m.color.toArray().map((v) => +v.toFixed(3)) : undefined,
          });
        }
      });
    }
    return {
      toneMapping: toneNames[renderer.toneMapping] ?? renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      outputColorSpace: renderer.outputColorSpace,
      passes: composer.passes.map((p) => p.constructor.name),
      composerRTType: composer.renderTarget1?.texture?.type,
      bloom: { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold },
      vignette: vignette.uniforms.amount.value,
      fog: { type: scene.fog?.constructor?.name, density: scene.fog?.density },
      environmentIntensity: scene.environmentIntensity,
      backgroundSetByLighting: scene.background?.isTexture === true,
      lights: { total: lights.length, byRole, anchorSource, sceneCensus: census, notOwnedByLighting: foreign },
      shadowCasters: lights.filter((l) => l.castShadow).length,
      emissives: { total: entries.length, byKind: emissiveSummary },
      sampledMaterials: sampled,
      steamSprites: puffs.length,
      groundPools: pools.children.length,
    };
  };

  ctx.lighting = { group, lights, composer, bloom, report, TUNE };
  if (typeof window !== 'undefined') window.__nightMarketLighting = ctx.lighting;
  console.info('[night-market/lighting]', report());
}

export default { build };
