import { clamp, hash01 } from '../structure/math.node.js';

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function valueNoise3(seed, x, y, z, channel = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const sample = (ox, oy, oz) => hash01(seed, ix + ox, iy + oy, iz + oz, channel) * 2 - 1;
  const lerp = (a, b, t) => a + (b - a) * t;
  const x00 = lerp(sample(0, 0, 0), sample(1, 0, 0), fx);
  const x10 = lerp(sample(0, 1, 0), sample(1, 1, 0), fx);
  const x01 = lerp(sample(0, 0, 1), sample(1, 0, 1), fx);
  const x11 = lerp(sample(0, 1, 1), sample(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function fractal3(seed, point, frequency, octaves, channel) {
  let amplitude = 1;
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise3(
      seed ^ Math.imul(octave + 1, 0x45d9f3b),
      point[0] * frequency,
      point[1] * frequency,
      point[2] * frequency,
      channel + octave * 17,
    ) * amplitude;
    weight += amplitude;
    frequency *= 2.07;
    amplitude *= 0.51;
  }
  return sum / weight;
}

const PALETTES = Object.freeze({
  granite: [[0.26, 0.245, 0.225], [0.52, 0.49, 0.45], [0.72, 0.69, 0.63]],
  granodiorite: [[0.22, 0.22, 0.21], [0.48, 0.47, 0.44], [0.7, 0.69, 0.65]],
  'quartz-arenite': [[0.31, 0.19, 0.11], [0.59, 0.39, 0.22], [0.78, 0.61, 0.39]],
  sandstone: [[0.3, 0.18, 0.1], [0.58, 0.38, 0.22], [0.76, 0.59, 0.39]],
  basalt: [[0.035, 0.042, 0.044], [0.105, 0.115, 0.115], [0.22, 0.205, 0.18]],
  limestone: [[0.27, 0.27, 0.235], [0.55, 0.54, 0.47], [0.73, 0.72, 0.64]],
  'micritic-limestone': [[0.22, 0.235, 0.21], [0.48, 0.49, 0.43], [0.7, 0.69, 0.59]],
  shale: [[0.055, 0.06, 0.06], [0.16, 0.17, 0.16], [0.31, 0.3, 0.27]],
  slate: [[0.045, 0.055, 0.062], [0.13, 0.15, 0.16], [0.27, 0.28, 0.28]],
  gneiss: [[0.1, 0.09, 0.085], [0.4, 0.37, 0.34], [0.72, 0.69, 0.62]],
  schist: [[0.09, 0.085, 0.075], [0.36, 0.34, 0.3], [0.65, 0.62, 0.53]],
  conglomerate: [[0.14, 0.115, 0.095], [0.39, 0.32, 0.25], [0.67, 0.56, 0.43]],
  'volcanic-breccia': [[0.055, 0.05, 0.045], [0.22, 0.19, 0.16], [0.46, 0.38, 0.3]],
  quartzite: [[0.19, 0.18, 0.17], [0.47, 0.44, 0.4], [0.75, 0.71, 0.64]],
  tuff: [[0.2, 0.17, 0.135], [0.46, 0.38, 0.28], [0.66, 0.56, 0.41]],
});

function paletteFor(lithology) {
  const exact = PALETTES[lithology];
  if (exact) return exact;
  const match = Object.keys(PALETTES).find((key) => lithology.includes(key));
  return PALETTES[match] ?? PALETTES.granite;
}

function mix3(a, b, t) {
  return a.map((value, axis) => value + (b[axis] - value) * t);
}

/**
 * Add bounded, deterministic erosion/mineral detail to the approved C6 field.
 * This remains geometry-first: texture channels sample this same field rather
 * than inventing lighting or unrelated image detail.
 */
export function createDenseDetailField(recipe, processField, options = {}) {
  const scale = Math.max(...recipe.targetDimensionsMetres);
  const seed = options.seed ?? recipe.seed;
  const amplitudeMetres = options.amplitudeMetres ?? scale * 0.0048;
  const baseFrequency = options.baseFrequency ?? 18 / scale;
  const palette = paletteFor(recipe.lithology);
  const basisDescriptor = processField.descriptor ?? null;
  const isSandstoneCliff = basisDescriptor?.familyId === 'cross-bedded-sandstone'
    && basisDescriptor?.variantId === 'sandstone-cliff';

  function basisAt(point) {
    return typeof processField.surfaceSemantics === 'function'
      ? processField.surfaceSemantics(point)
      : null;
  }

  function detailAt(point) {
    const broad = fractal3(seed, point, baseFrequency, 4, 101);
    const grain = fractal3(seed, point, baseFrequency * 5.6, 3, 223);
    const pits = Math.max(fractal3(seed, point, baseFrequency * 2.8, 3, 349) - 0.42, 0) / 0.58;
    const basis = basisAt(point);
    if (isSandstoneCliff) {
      const contact = basis?.contactRecession ?? 0;
      const sandstoneCavity = basis?.cavity ?? 0;
      const sandstoneGrain = basis?.grain ?? (grain * 0.5 + 0.5);
      const grainRelief = basis?.grainRelief ?? 0.5;
      return {
        basis,
        broad,
        displacementMetres: amplitudeMetres * clamp(
          0.21 + broad * 0.035 + grain * 0.035 + pits * 0.07
            + contact * 0.54 + sandstoneCavity * 0.16 + (1 - sandstoneGrain) * 0.075
            + (1 - (basis?.cement ?? 0.5)) * 0.08 + (grainRelief - 0.5) * 0.16,
          0.035,
          1.24,
        ),
        grain,
        pits,
      };
    }
    const geologicalRecession = basis
      ? amplitudeMetres * (
        (basis.coolingFracture ?? 0) * 0.24
        + (basis.cleavage ?? 0) * 0.055
        + (basis.clastEdge ?? 0) * 0.11
        + (basis.joint ?? 0) * 0.12
      )
      : 0;
    return {
      basis,
      broad,
      displacementMetres: amplitudeMetres * (0.42 + broad * 0.28 + grain * 0.12 + pits * 0.5)
        + geologicalRecession,
      grain,
      pits,
    };
  }

  function evaluate(x, y, z) {
    const point = [x, y, z];
    return processField.evaluate(x, y, z) + detailAt(point).displacementMetres;
  }

  function sample(point, normal = [0, 1, 0], ao = 1, curvature = 0) {
    const process = processField.sample(point);
    const detail = detailAt(point);
    const mineral = clamp(detail.grain * 0.5 + 0.5, 0, 1);
    const darkMineral = clamp((fractal3(seed, point, baseFrequency * 8.5, 2, 521) - 0.54) * 4.2, 0, 1);
    const quartz = clamp((fractal3(seed, point, baseFrequency * 7.2, 2, 587) - 0.42) * 2.8, 0, 1);
    let baseColor = mix3(palette[0], palette[1], clamp(mineral * 1.15, 0, 1));
    baseColor = mix3(baseColor, palette[2], quartz * 0.62);
    baseColor = mix3(baseColor, palette[0], darkMineral * 0.72);
    const basis = detail.basis;
    if (basisDescriptor?.familyId === 'jointed-exfoliating-granite') {
      baseColor = mix3(baseColor, palette[0], (basis?.joint ?? 0) * 0.32);
    } else if (isSandstoneCliff) {
      const packageTone = basis?.packageTone ?? 0.5;
      const cement = basis?.cement ?? 0.5;
      const ironOxide = basis?.ironOxide ?? 0.5;
      const contact = basis?.bedContact ?? basis?.bedding ?? 0;
      const sandstoneGrain = basis?.grain ?? mineral;
      const earthyLow = [0.155, 0.073, 0.031];
      const areniteBody = [0.47, 0.255, 0.105];
      const quartzCement = [0.64, 0.47, 0.285];
      const ferricWarmth = [0.56, 0.19, 0.055];
      baseColor = mix3(earthyLow, areniteBody, clamp(0.37 + packageTone * 0.48, 0, 1));
      baseColor = mix3(baseColor, quartzCement, cement * 0.1);
      baseColor = mix3(baseColor, ferricWarmth, ironOxide * 0.1);
      baseColor = mix3(baseColor, earthyLow, contact * 0.18);
      baseColor = baseColor.map((value, axis) => clamp(
        value + detail.grain * [0.004, 0.003, 0.002][axis],
        0,
        1,
      ));
    } else if (basisDescriptor?.familyId === 'cross-bedded-sandstone') {
      const bedTone = clamp((basis?.bedding ?? 0.5) * 0.72 + detail.broad * 0.12 + 0.14, 0, 1);
      baseColor = mix3(baseColor, mix3(palette[0], palette[2], bedTone), 0.38);
    } else if (basisDescriptor?.familyId === 'columnar-entablature-basalt') {
      baseColor = mix3(baseColor, palette[0], (basis?.coolingFracture ?? 0) * 0.58);
    } else if (basisDescriptor?.familyId === 'bedded-karst-limestone') {
      baseColor = mix3(baseColor, mix3(palette[0], palette[2], basis?.bedding ?? 0.5), 0.17);
    } else if (basisDescriptor?.familyId === 'fissile-shale-slate') {
      baseColor = mix3(baseColor, palette[0], (basis?.cleavage ?? 0) * 0.22);
    } else if (basisDescriptor?.familyId === 'folded-foliated-metamorphic') {
      const foliationColor = mix3(palette[0], palette[2], basis?.foliation ?? 0.5);
      baseColor = mix3(baseColor, foliationColor, basisDescriptor.variantId === 'gneiss-outcrop' ? 0.38 : 0.18);
    } else if (basisDescriptor?.familyId === 'coarse-clastic-conglomerate-breccia') {
      const clastVariation = clamp(fractal3(seed, point, baseFrequency * 0.42, 2, 907) * 0.5 + 0.5, 0, 1);
      const clastWarmth = clamp(fractal3(seed ^ 0x510e527f, point, baseFrequency * 0.31, 2, 919) * 0.5 + 0.5, 0, 1);
      const clastLow = basisDescriptor.variantId === 'conglomerate-outcrop' ? [0.2, 0.23, 0.22] : [0.09, 0.085, 0.08];
      const clastHigh = basisDescriptor.variantId === 'conglomerate-outcrop'
        ? mix3([0.58, 0.42, 0.28], [0.68, 0.64, 0.54], clastWarmth)
        : mix3([0.27, 0.25, 0.23], [0.45, 0.4, 0.34], clastWarmth);
      const clastColor = mix3(clastLow, clastHigh, clastVariation);
      baseColor = mix3(baseColor, clastColor, (basis?.clast ?? 0) * 0.9);
      baseColor = mix3(baseColor, palette[0], (basis?.clastEdge ?? 0) * 0.48);
    }
    const environment = process.environment;
    const exposure = clamp(environment.exposure, 0, 1);
    const wetness = clamp((recipe.weathering.moistureNormalized ?? 0.4) * (1 - exposure * 0.58) * (0.55 + (1 - normal[1]) * 0.45), 0, 1);
    const deposition = clamp((1 - normal[1]) * 0.15 + Math.max(normal[1], 0) * (1 - exposure) * 0.35, 0, 1);
    const fracture = clamp(environment.fractureInfluence ?? 0, 0, 1);
    const fabric = clamp(environment.fabricWeakness ?? 0, 0, 1);
    const material = clamp(environment.materialWeakness ?? 0, 0, 1);
    const weathering = clamp(process.damageNormalized, 0, 1);
    const cavity = clamp(
      -curvature * 0.5 + (1 - ao) * 0.72 + (isSandstoneCliff ? (basis?.cavity ?? 0) * 0.34 : 0),
      0,
      1,
    );
    const geologicalRoughness = (basis?.coolingFracture ?? 0) * 0.08
      + (basis?.clastEdge ?? 0) * 0.07
      + (basis?.cleavage ?? 0) * 0.035
      + (basis?.foliation ?? 0) * 0.018;
    const roughness = isSandstoneCliff
      ? clamp(0.59 + (basis?.roughnessBias ?? 0) + detail.grain * 0.075
        + weathering * 0.07 + cavity * 0.055 - wetness * 0.13, 0.38, 0.92)
      : clamp(0.58 + detail.grain * 0.13 + weathering * 0.12 + cavity * 0.08
        + geologicalRoughness - wetness * 0.16, 0.28, 0.94);
    return {
      ao,
      baseColorLinear: baseColor,
      cavity,
      deposition,
      exposure,
      fabric,
      fracture,
      material,
      roughness,
      weathering,
      wetness,
    };
  }

  return Object.freeze({
    amplitudeMetres,
    baseFrequencyCyclesPerMetre: baseFrequency,
    evaluate,
    processField,
    sample,
    seed,
  });
}
