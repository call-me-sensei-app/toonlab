// The `atmosphere` param group of SkyParams, and per the spec's module-ownership
// table the sole definition of it: anything that needs these defaults imports
// them from here instead of re-declaring them.
//
// Eleven fields, and the names/defaults/units are a compatibility surface:
// presets authored in either lab round-trip through this group, so nothing here
// may be renamed or re-scaled.
//
// This is the *live* representation, so `groundAlbedo` is a THREE.Color in
// linear RGB — the renderer's working space, never sRGB-converted here. A
// serialized document carries `[r, g, b]` triples instead and the schema layer
// converts at that boundary, which is why `applyParams` accepts both forms
// while `toParams` returns the live one, exactly as the sibling `sun` and
// `cloud` groups do. `JSON.stringify` on the result of `toParams` is therefore
// not the serialization path: it would collapse the Color to an sRGB hex
// integer, which is a form this group deliberately refuses.
//
// rayleigh, turbidity and groundAlbedo describe the *medium* and are baked into
// the scattering tables. Instead of an event bus the group publishes a revision
// counter that only those three bump, so `atmosphereScattering` can re-bake
// lazily once per frame and everything else stays a free per-frame uniform.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

// The one narrow number reader the param layer shares, imported rather than
// re-implemented. `Number(value)` is not that reader: `Number(null)`,
// `Number('')`, `Number([])` and `Number(false)` are all 0 and all pass
// `Number.isFinite`, so this group used to clamp every one of them into range —
// `rayleigh: null` zeroed Rayleigh scattering outright and took the blue out of
// the sky, `fogDensity: ''` switched aerial perspective off, and nothing was
// reported. A preset that round-tripped through JSON carries `null` for every
// untouched field, so that is not a hypothetical input. The document layer
// (./skyParams.js) has always read numbers this way, so sharing the reader is
// also what makes the live group and the serialized form agree about what
// "readable" means. Numeric strings stay legal: lab inputs and URL parameters
// arrive as text.
// isObject/hasValue/describe come from the same place and for the same reason:
// the whole-argument guard below has to agree with the document layer about what
// counts as a params block and how a rejected one is named.
import {
  describe, finiteNumber, hasValue, isObject,
} from '../cloud/paramSchema.js';

export const ATMOSPHERE_PARAM_SCHEMA = Object.freeze({
  rayleigh: Object.freeze({
    description: 'Scattering by air molecules — what makes the sky blue and a low sun red. 1 matches Earth.',
    label: 'Rayleigh',
    range: Object.freeze({ max: 3, min: 0, step: 0.01 }),
    rebake: true,
    type: 'number',
    unit: '',
    value: 1,
  }),
  turbidity: Object.freeze({
    description: 'Aerosol haze load. 1 is a clear day, 15 heavy smog. Washes out sky color and broadens the sun halo.',
    label: 'Turbidity',
    range: Object.freeze({ max: 15, min: 1, step: 0.01 }),
    rebake: true,
    type: 'number',
    unit: '',
    value: 3.3,
  }),
  mieDirectionalG: Object.freeze({
    description: 'Forward-peak of the Henyey-Greenstein haze lobe. 0 spreads the glow over the whole sky, higher pulls it into a tight halo.',
    label: 'Mie Directional G',
    range: Object.freeze({ max: 0.999, min: 0, step: 0.001 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 0.7,
  }),
  mieScatteringStrength: Object.freeze({
    description: 'Art multiplier on halo brightness only. Does not change haze density or sky color.',
    label: 'Mie Scattering Strength',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 1,
  }),
  multipleScattering: Object.freeze({
    description: 'Skylight filling cloud undersides and shadowed interiors, applied as 1 + this. Clouds only.',
    label: 'Cloud Multiple Scattering',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 0.2,
  }),
  skyMultipleScattering: Object.freeze({
    description: 'Scale on the sky dome multiply-scattered term. This light pools near the horizon, so it is the daytime horizon-brightness control.',
    label: 'Sky Multiple Scattering',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 0.5,
  }),
  exposure: Object.freeze({
    description: 'Master brightness on the linear HDR image. The post chain applies it; the sky dome itself never does.',
    label: 'Exposure',
    range: Object.freeze({ max: 5, min: 0.05, step: 0.01 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 1,
  }),
  groundAlbedo: Object.freeze({
    description: 'Reflectance of the ground under the atmosphere. Bounce light feeds the dome multiple scattering, so brighter ground lifts the horizon.',
    label: 'Ground Albedo',
    rebake: true,
    type: 'color',
    unit: 'linear RGB',
    value: Object.freeze([0.18, 0.17, 0.15]),
  }),
  fogDensity: Object.freeze({
    description: 'How fast distance fades geometry into the sky. 1 half-fades near 23 km; 0 disables aerial perspective.',
    label: 'Fog Density',
    range: Object.freeze({ max: 5, min: 0, step: 0.01 }),
    rebake: false,
    type: 'number',
    unit: '',
    value: 1.25,
  }),
  fogFarFadeStart: Object.freeze({
    description: 'Distance at which geometry starts being replaced by sky outright. Hides the rim of a finite world.',
    label: 'Fog Far Fade Start',
    range: Object.freeze({ max: 100000000, min: 0, step: 1000 }),
    rebake: false,
    type: 'number',
    unit: 'm',
    value: 1000000,
  }),
  fogFarFadeEnd: Object.freeze({
    description: 'Distance at which geometry is fully replaced by sky. Always kept above fogFarFadeStart; the gap is the ramp.',
    label: 'Fog Far Fade End',
    range: Object.freeze({ max: 100000000, min: 0, step: 1000 }),
    rebake: false,
    type: 'number',
    unit: 'm',
    value: 1100000,
  }),
});

export const ATMOSPHERE_PARAM_KEYS = Object.freeze(Object.keys(ATMOSPHERE_PARAM_SCHEMA));

/** Fields whose value invalidates the precomputed scattering tables. */
export const ATMOSPHERE_REBAKE_KEYS = Object.freeze(
  ATMOSPHERE_PARAM_KEYS.filter((key) => ATMOSPHERE_PARAM_SCHEMA[key].rebake),
);

export const DEFAULT_ATMOSPHERE_PARAMS = Object.freeze(
  Object.fromEntries(ATMOSPHERE_PARAM_KEYS.map((key) => {
    const field = ATMOSPHERE_PARAM_SCHEMA[key];
    return [key, field.type === 'color' ? Object.freeze([...field.value]) : field.value];
  })),
);

// The far-fade band is a ramp, so its end has to stay strictly above its start
// or the smoothstep that consumes it divides by zero.
const FOG_FAR_FADE_MIN_SPAN = 1;

function clampNumber(value, fallback, range) {
  const next = finiteNumber(value);
  if (next === null) return fallback;
  if (!range) return next;
  return Math.min(Math.max(next, range.min), range.max);
}

function describeValue(value) {
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'number') return `the number ${value}`;
  if (value && typeof value === 'object') return value.constructor?.name ?? 'an object';
  return typeof value;
}

// The whole-argument guard, shared by createAtmosphereParams and applyParams.
//
// Every field test below is `'rayleigh' in next`, and `in` throws a TypeError on
// anything that is not an object — null, '', NaN, 'abc', false and 0 all took the
// group down instead of being ignored, and `params = {}` only fires for
// `undefined`, so the factory took it too. A preset that failed to load, a
// `JSON.parse` of "null" and a host passing a cleared field all deliver exactly
// that. A non-object carries no subset of the eleven fields, so it writes nothing
// and says so, the way the cloud groups and the SkyParams envelope already do.
// `null` and `undefined` mean "not supplied" (paramSchema's hasValue) and pass
// quietly, as they do there.
//
// The shared `describe` names the value rather than the local `describeValue`,
// which names *shapes* for the colour slots below and would report a null
// argument as "object" — the one thing a caller here most needs told apart.
function readParamBlock(value) {
  if (isObject(value)) return value;
  if (hasValue(value)) {
    console.warn(
      `[atmosphereParams] atmosphere params must be an object (got ${describe(value)}); `
      + 'keeping the current values.',
    );
  }
  return {};
}

/**
 * Channels of a linear-RGB colour in any form the contract actually carries: the
 * live `THREE.Color`, the serialized `[r, g, b]` triple, or the plain
 * `{ r, g, b }` object left behind by a structured clone or a lab store. Null
 * for anything else — including the sRGB hex integer `Color.toJSON()` produces,
 * which cannot be read back as linear RGB without guessing a transfer function.
 */
function colorChannelsOf(value) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value)) return value.length >= 3 ? [value[0], value[1], value[2]] : null;
  if (value && typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    return [value.r, value.g, value.b];
  }
  return null;
}

// A dropped colour write is the worst kind here: groundAlbedo re-bakes the
// scattering tables, so losing one leaves the baked sky disagreeing with the
// document that was applied, with nothing on screen to say so. Unusable input
// therefore keeps the current value *and* says so, the way the sibling groups do.
function readColorChannels(key, value, fallback) {
  if (value === undefined || value === null) return fallback;
  const channels = colorChannelsOf(value);
  if (!channels) {
    console.warn(
      `[atmosphereParams] ${key} takes a THREE.Color, an [r, g, b] triple, or an { r, g, b } `
      + `object in linear RGB — got ${describeValue(value)}. Keeping `
      + `(${fallback.join(', ')}). Serialized documents carry triples; an sRGB hex integer `
      + `is not a supported form.`,
    );
    return fallback;
  }
  return [0, 1, 2].map((index) => {
    const channel = finiteNumber(channels[index]);
    if (channel === null) {
      console.warn(
        `[atmosphereParams] ${key} channel ${index} is not a finite number `
        + `(${describeValue(channels[index])}); keeping ${fallback[index]}.`,
      );
      return fallback[index];
    }
    return Math.min(Math.max(channel, 0), 1);
  });
}

/**
 * Builds the atmosphere param group.
 *
 * Every field is exposed as a TSL uniform under its own name so shader graphs
 * read `atmosphere.turbidity` directly and hosts poke `.value`, matching the
 * documented surface. `applyParams` takes any subset; `toParams` returns all
 * eleven, and the pair round-trips exactly because every clamp is idempotent.
 */
export function createAtmosphereParams(params = {}) {
  const uniforms = {
    rayleigh: uniform(DEFAULT_ATMOSPHERE_PARAMS.rayleigh),
    turbidity: uniform(DEFAULT_ATMOSPHERE_PARAMS.turbidity),
    mieDirectionalG: uniform(DEFAULT_ATMOSPHERE_PARAMS.mieDirectionalG),
    mieScatteringStrength: uniform(DEFAULT_ATMOSPHERE_PARAMS.mieScatteringStrength),
    multipleScattering: uniform(DEFAULT_ATMOSPHERE_PARAMS.multipleScattering),
    skyMultipleScattering: uniform(DEFAULT_ATMOSPHERE_PARAMS.skyMultipleScattering),
    exposure: uniform(DEFAULT_ATMOSPHERE_PARAMS.exposure),
    groundAlbedo: uniform(new THREE.Color().setRGB(...DEFAULT_ATMOSPHERE_PARAMS.groundAlbedo)),
    fogDensity: uniform(DEFAULT_ATMOSPHERE_PARAMS.fogDensity),
    fogFarFadeStart: uniform(DEFAULT_ATMOSPHERE_PARAMS.fogFarFadeStart),
    fogFarFadeEnd: uniform(DEFAULT_ATMOSPHERE_PARAMS.fogFarFadeEnd),
  };

  let bakeRevision = 0;
  const listeners = new Set();

  const group = {
    ...uniforms,

    /** Bumped whenever rayleigh, turbidity or groundAlbedo actually change. */
    get bakeRevision() {
      return bakeRevision;
    },

    /** Registers a re-bake listener. Returns the unsubscribe. */
    onBakeInvalidated(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    applyParams(next = {}) {
      const source = readParamBlock(next);
      let mediumChanged = false;

      if ('rayleigh' in source) {
        const value = clampNumber(
          source.rayleigh,
          uniforms.rayleigh.value,
          ATMOSPHERE_PARAM_SCHEMA.rayleigh.range,
        );
        mediumChanged = mediumChanged || value !== uniforms.rayleigh.value;
        uniforms.rayleigh.value = value;
      }
      if ('turbidity' in source) {
        const value = clampNumber(
          source.turbidity,
          uniforms.turbidity.value,
          ATMOSPHERE_PARAM_SCHEMA.turbidity.range,
        );
        mediumChanged = mediumChanged || value !== uniforms.turbidity.value;
        uniforms.turbidity.value = value;
      }
      if ('groundAlbedo' in source) {
        const albedo = uniforms.groundAlbedo.value;
        const [r, g, b] = readColorChannels(
          'groundAlbedo',
          source.groundAlbedo,
          [albedo.r, albedo.g, albedo.b],
        );
        mediumChanged = mediumChanged || r !== albedo.r || g !== albedo.g || b !== albedo.b;
        albedo.setRGB(r, g, b);
      }

      for (const key of ['mieDirectionalG', 'mieScatteringStrength', 'multipleScattering',
        'skyMultipleScattering', 'exposure', 'fogDensity']) {
        if (!(key in source)) continue;
        uniforms[key].value = clampNumber(
          source[key],
          uniforms[key].value,
          ATMOSPHERE_PARAM_SCHEMA[key].range,
        );
      }

      // The far band is coupled: whichever end the caller moved, the other may
      // have to follow, and applying the result again must be a no-op.
      if ('fogFarFadeStart' in source) {
        uniforms.fogFarFadeStart.value = clampNumber(
          source.fogFarFadeStart,
          uniforms.fogFarFadeStart.value,
          ATMOSPHERE_PARAM_SCHEMA.fogFarFadeStart.range,
        );
      }
      if ('fogFarFadeEnd' in source) {
        uniforms.fogFarFadeEnd.value = clampNumber(
          source.fogFarFadeEnd,
          uniforms.fogFarFadeEnd.value,
          ATMOSPHERE_PARAM_SCHEMA.fogFarFadeEnd.range,
        );
      }
      // Resolving the coupling has to stay inside both declared ranges. The old
      // `max(end, start + span)` ran after the clamps and so could push `end`
      // past its own schema max, and a slider built from the exported schema
      // then cannot represent the value it reads back. `start` normally leads and
      // `end` follows; at the very top of the range there is no room above
      // `start` for the ramp, so there `start` is what gives way.
      const startRange = ATMOSPHERE_PARAM_SCHEMA.fogFarFadeStart.range;
      const endRange = ATMOSPHERE_PARAM_SCHEMA.fogFarFadeEnd.range;
      const bandEnd = Math.min(
        Math.max(
          uniforms.fogFarFadeEnd.value,
          uniforms.fogFarFadeStart.value + FOG_FAR_FADE_MIN_SPAN,
        ),
        endRange.max,
      );
      uniforms.fogFarFadeEnd.value = bandEnd;
      uniforms.fogFarFadeStart.value = Math.min(
        uniforms.fogFarFadeStart.value,
        Math.max(bandEnd - FOG_FAR_FADE_MIN_SPAN, startRange.min),
      );

      if (mediumChanged) {
        bakeRevision += 1;
        for (const listener of listeners) listener(bakeRevision);
      }
      return group;
    },

    toParams() {
      const albedo = uniforms.groundAlbedo.value;
      return {
        rayleigh: uniforms.rayleigh.value,
        turbidity: uniforms.turbidity.value,
        mieDirectionalG: uniforms.mieDirectionalG.value,
        mieScatteringStrength: uniforms.mieScatteringStrength.value,
        multipleScattering: uniforms.multipleScattering.value,
        skyMultipleScattering: uniforms.skyMultipleScattering.value,
        exposure: uniforms.exposure.value,
        groundAlbedo: new THREE.Color().setRGB(albedo.r, albedo.g, albedo.b),
        fogDensity: uniforms.fogDensity.value,
        fogFarFadeStart: uniforms.fogFarFadeStart.value,
        fogFarFadeEnd: uniforms.fogFarFadeEnd.value,
      };
    },
  };

  return group.applyParams(params);
}
