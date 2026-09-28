// Volumetric sky & cloud foundation verification.
//
// The regression gate for the user contract in docs/sky-cloud-parameters.md:
// contract before the raymarcher, the presets and the labs are built on top of
// it: the two barrels, every parameter name/default/unit, round-trip identity,
// the derived march ceiling, the fixed march budget, noise determinism and
// tiling, the 8-cubed volume floor, the celestial arc, hostile-input robustness,
// and the five specific defects that produced a document disagreeing with the
// thing it generated.
//
// The parameter tables are read out of the user reference rather than transcribed here.
// `docs/sky-cloud-parameters.md` is the compatibility surface, so a name,
// default or unit that drifts in either direction — code edited without the doc,
// or doc edited without the code — has to fail. Transcribing the tables into
// this file would only prove that two copies in the repo agree with each other.
//
// Reading the atmosphere LUTs, a trap worth naming: `transmittanceTexture.image
// .data` is a Uint16Array of IEEE-754 HALF-FLOAT BIT PATTERNS, not numbers.
// Range-checking it directly reports tens of thousands of channels "exceeding 1"
// and a maximum of 15360, which is 0x3C00 — half-float 1.0. Decoded, or read
// through the module's own transmittanceAt() accessor, the table is exactly
// inside [0, 1]. Every LUT assertion below goes through the accessor, the
// Float32Array the bake actually wrote, or THREE.DataUtils.fromHalfFloat; the
// half-float encoding is itself asserted so nobody "fixes" the check back.
//
// Run with: node scripts/verify-volumetric-sky.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import * as cloudBarrel from '../src/cloud/index.js';
import * as cloudParams from '../src/cloud/cloudParams.js';
import * as paramSchema from '../src/cloud/paramSchema.js';
import * as baseShapeVolume from '../src/cloud/noise/baseShapeVolume.js';
import * as cirrusMap from '../src/cloud/noise/cirrusMap.js';
import * as curlNoise from '../src/cloud/noise/curlNoise.js';
import * as erosionVolume from '../src/cloud/noise/erosionVolume.js';
import * as noiseVolume from '../src/cloud/noise/noiseVolume.js';
import * as periodicNoise3 from '../src/cloud/noise/periodicNoise3.js';
import * as weatherMap from '../src/cloud/noise/weatherMap.js';
import * as skyBarrel from '../src/sky/index.js';
import * as atmosphereDome from '../src/sky/atmosphereDome.js';
import * as atmosphereParams from '../src/sky/atmosphereParams.js';
import * as atmosphereScattering from '../src/sky/atmosphereScattering.js';
import * as godRays from '../src/sky/godRays.js';
import * as nightSky from '../src/sky/nightSky.js';
import * as skyParams from '../src/sky/skyParams.js';
import * as skyQualityTiers from '../src/sky/skyQualityTiers.js';
import * as sunDriver from '../src/sky/sunDriver.js';
import * as timeOfDay from '../src/sky/timeOfDay.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let checks = 0;
let failures = 0;

function check(label, callback) {
  try {
    callback();
    checks += 1;
    console.log(`ok   ${label}`);
  } catch (error) {
    failures += 1;
    const detail = String(error?.message ?? error).split('\n').slice(0, 12).join('\n     ');
    console.error(`FAIL ${label}\n     ${detail}`);
  }
}

function section(title) {
  console.log(`\n--- ${title}`);
}

// Diagnostics are collected rather than printed: clamping, unknown keys and
// replaced derived values are things this script deliberately provokes, and a
// hundred lines of expected warnings would bury a real failure. Several checks
// assert on what was captured, so a clamp that stops explaining itself fails.
const realWarn = console.warn;
const warningLog = [];
console.warn = (...args) => { warningLog.push(args.map(String).join(' ')); };

function watch(callback) {
  const from = warningLog.length;
  const value = callback();
  return { value, warnings: warningLog.slice(from) };
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const readRepositoryFile = (path) => readFileSync(new URL(path, `file://${repositoryRoot}`), 'utf8');

// ---------------------------------------------------------------------------
// Parameter-table parsing — the user reference is the source of truth
// ---------------------------------------------------------------------------

const SPEC_PATH = 'docs/sky-cloud-parameters.md';
const spec = readRepositoryFile(SPEC_PATH);
const specLines = spec.split('\n');
const EM_DASH = '—';
const EN_DASH = '–';

function specTable(headingPrefix) {
  const start = specLines.findIndex((line) => line.startsWith(headingPrefix));
  assert.ok(start >= 0, `${SPEC_PATH} has no heading starting "${headingPrefix}".`);
  let cursor = start + 1;
  while (cursor < specLines.length && !specLines[cursor].startsWith('|')) {
    assert.ok(
      !specLines[cursor].startsWith('#'),
      `${SPEC_PATH}: "${headingPrefix}" is followed by another heading before any table.`,
    );
    cursor += 1;
  }
  const rows = [];
  for (; cursor < specLines.length && specLines[cursor].startsWith('|'); cursor += 1) {
    const cells = specLines[cursor].split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  assert.ok(rows.length > 1, `${SPEC_PATH}: "${headingPrefix}" table has no data rows.`);
  return { header: rows[0], rows: rows.slice(1) };
}

/** Strips the markdown a cell carries so only the value is left. */
const plain = (cell) => cell.replace(/\*\*/g, '').replace(/`/g, '').trim();

/** A spec default cell as a value. `null` means the spec publishes none. */
function specValue(cell) {
  const text = plain(cell);
  if (text === '' || text === EM_DASH || text === '-') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  const color = /^Color\(([^)]+)\)$/.exec(text);
  if (color) return color[1].split(',').map((channel) => Number(channel.trim()));
  const cube = /^(\d+)³$/.exec(text);
  if (cube) return Number(cube[1]);
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

/**
 * A spec unit cell as a unit. The tables gloss units with a parenthetical
 * ("m (cloud base above ground)") or an em-dash aside ("m — derived,
 * read-only"), and write dimensionless as an em dash; the code writes it as ''.
 */
function specUnit(cell) {
  const text = plain(cell).split('(')[0].split(EM_DASH)[0].trim();
  // `bool` is the spec's way of saying "a flag"; the schema types it and leaves
  // the unit empty rather than inventing a unit for a boolean.
  return text === 'bool' ? '' : text;
}

const normalizeUnit = (unit) => {
  const text = String(unit ?? '').trim();
  return text === EM_DASH || text === '-' ? '' : text;
};

function specFields(headingPrefix, { ignore = [] } = {}) {
  const { header, rows } = specTable(headingPrefix);
  assert.deepEqual(
    header,
    ['Param', 'Default', 'Unit'],
    `${SPEC_PATH}: "${headingPrefix}" table columns changed.`,
  );
  const fields = new Map();
  for (const [nameCell, defaultCell, unitCell] of rows) {
    const name = plain(nameCell);
    if (ignore.includes(name)) continue;
    assert.ok(!fields.has(name), `${SPEC_PATH}: "${headingPrefix}" lists ${name} twice.`);
    fields.set(name, { default: specValue(defaultCell), unit: specUnit(unitCell) });
  }
  return fields;
}

/** Splits a table that prefixes its rows (`cirrus.scale`, `moon.phase`). */
function specSubset(fields, prefix) {
  const subset = new Map();
  for (const [name, cell] of fields) {
    if (prefix === '') {
      if (!name.includes('.')) subset.set(name, cell);
    } else if (name.startsWith(`${prefix}.`)) {
      subset.set(name.slice(prefix.length + 1), cell);
    }
  }
  assert.ok(subset.size > 0, `No spec rows with prefix "${prefix}".`);
  return subset;
}

const channelsOf = (value) => (value?.isColor ? [value.r, value.g, value.b] : value);

/**
 * Compares one spec table against one code group, cell for cell: the field set,
 * every published default (against both the schema descriptor and the resolved
 * default tree) and every published unit.
 */
function compareGroup(path, cells, schema, resolved, { schemaKeys = null } = {}) {
  assert.deepEqual(
    [...cells.keys()].sort(),
    (schemaKeys ?? Object.keys(schema)).sort(),
    `${path}: ${SPEC_PATH} and the code schema list different parameters.`,
  );
  for (const [key, cell] of cells) {
    const field = schema[key];
    assert.ok(field, `${path}.${key} has no schema entry.`);
    assert.equal(
      normalizeUnit(field.unit),
      normalizeUnit(cell.unit),
      `${path}.${key} unit: spec "${cell.unit}", code "${field.unit}".`,
    );
    // elevation/azimuth publish no default: the clock owns the sun's position,
    // and the code's standing pose is checked against the clock's solve instead.
    if (cell.default === null) continue;
    const declared = channelsOf(field.value);
    const live = channelsOf(resolved[key]);
    if (Array.isArray(cell.default)) {
      assert.deepEqual(
        [...declared],
        cell.default,
        `${path}.${key} declared default channels.`,
      );
      assert.deepEqual([...live], cell.default, `${path}.${key} resolved default channels.`);
    } else {
      assert.equal(declared, cell.default, `${path}.${key} declared default.`);
      assert.equal(live, cell.default, `${path}.${key} resolved default.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DEFAULTS = skyParams.DEFAULT_SKY_PARAMS;
const TIER_NAMES = skyQualityTiers.QUALITY_LEVEL_NAMES;

/** Colours become `[r, g, b]` so params trees compare with deepEqual. */
function plainParams(value) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value)) return value.map(plainParams);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plainParams(entry)]));
  }
  return value;
}

// Authored values, deliberately nowhere near the defaults and inside every
// published range, so a clamp that moves an authored value cannot hide behind a
// default that happens to be a fixed point.
const AUTHORED_CLOUD = Object.freeze({
  shape: {
    altitude: 1234,
    thickness: 3456,
    coverage: 0.73,
    density: 0.0912,
    baseScale: 6543,
    baseStrength: 1.7,
    weatherScale: 55500,
    erosionScaleBaseMultiplier: 0.31,
    erosionShape: 0.66,
    erosionStrengthBase: 2.4,
    erosionStrengthPeak: 3.1,
    edgeSoftness: 0.123,
    edgeSoftnessFalloff: 2.5,
    baseWeatherStrength: 1.1,
    baseWeatherHeightStart: 0.077,
    baseWeatherHeightEnd: 0.313,
    horizonCoverageAmount: 0.9,
    horizonCoverageStart: 13400,
    horizonCoverageRamp: 24600,
  },
  lighting: {
    scatteringAlbedo: 0.83,
    powderStrength: 2.2,
    ambientIntensity: 1.4,
    groundBounceAlbedo: [0.31, 0.22, 0.11],
    baseShadowStrength: 0.44,
    baseShadowHeight: 0.37,
    moonGain: 1.9,
  },
  wind: { heading: 137.5, speed: 12.3, evolutionSpeed: 4.5, skew: -1234 },
  cirrus: { scale: 41000, strength: 0.85 },
  haze: { density: 2.3, scale: 37000 },
  fade: { hazeDensityScale: 1.8, horizonMeltStart: 18000, horizonMeltEnd: 47000 },
});

const AUTHORED_SKY = Object.freeze({
  atmosphere: {
    rayleigh: 1.4,
    turbidity: 7.2,
    mieDirectionalG: 0.82,
    mieScatteringStrength: 1.3,
    multipleScattering: 0.44,
    skyMultipleScattering: 0.71,
    exposure: 1.46,
    groundAlbedo: [0.29, 0.24, 0.19],
    fogDensity: 2.1,
    fogFarFadeStart: 900000,
    fogFarFadeEnd: 1050000,
  },
  cloud: AUTHORED_CLOUD,
  godRays: {
    enabled: false,
    strength: 3.5,
    sharpness: 4.5,
    extinction: 0.00045,
    maxDistance: 15000,
    moonGodRayScale: 0.7,
  },
  nightSky: { intensity: 0.62 },
  noise: {
    weather: {
      resolution: 512,
      seed: 4242,
      profile: {
        octaves: 6,
        period: 5,
        lacunarity: 2.3,
        gain: 0.55,
        warp: 0.4,
        warpPeriod: 3,
        coverageContrast: 1.6,
        coverageBias: -0.12,
        typePeriod: 4,
        typeBias: 0.2,
        precipitationPeriod: 3,
        precipitationBias: -0.05,
      },
    },
  },
  sun: {
    elevation: 12.5, azimuth: -117.3, intensity: 8.4, color: [1, 0.82, 0.6], discSize: 0.00042,
  },
  time: {
    time: 0.7361,
    autoAdvanceSecondsPerDay: 1200,
    latitude: -35.2,
    azimuth: 44.5,
    moon: {
      phase: 0.31,
      intensity: 1.6,
      discBrightness: 12.5,
      angularSize: 0.00051,
      color: [0.6, 0.71, 0.99],
      ambient: 0.033,
    },
  },
});

// Non-numbers. Every one of these must HOLD the current value: they are what a
// cleared input, a JSON round-trip, or a stray array actually delivers, and
// `Number()` maps four of them onto a perfectly finite 0.
const UNREADABLE = Object.freeze([
  null, undefined, '', ' ', NaN, [], [7], {}, 'abc', false, true, 'Infinity', '1e400',
  Infinity, -Infinity,
]);
// A real number, so it is honoured — but it must land on each field's own
// minimum, never on a 0 the field forbids (a 0 thickness or baseScale divides).
const ZERO = 0;

// `true`, `false`, `0` and `1` are legitimate writes to a *flag*, so a boolean
// field gets an unreadable string in their place. Otherwise this would be
// asserting that a real boolean write does nothing.
const junkForField = (field, junk) => (
  field?.type === 'boolean' && (typeof junk === 'boolean' || junk === 0 || junk === 1)
    ? ''
    : junk
);

const describeJunk = (value) => {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return JSON.stringify(value) ?? String(value);
};

function walkSchemaFields(node, params, visit, path = '') {
  for (const [key, child] of Object.entries(node)) {
    const at = path ? `${path}.${key}` : key;
    if (child?.type) visit(at, child, params?.[key]);
    else walkSchemaFields(child, params?.[key], visit, at);
  }
}

/** A schema-shaped object with `map(field)` in every leaf slot. */
function junkTree(node, map) {
  if (node?.type) return map(node);
  return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, junkTree(child, map)]));
}

function assertAllFinite(value, path) {
  if (value?.isColor) {
    for (const [index, channel] of [value.r, value.g, value.b].entries()) {
      assert.ok(Number.isFinite(channel), `${path} channel ${index} is ${channel}.`);
    }
    return;
  }
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${value}.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertAllFinite(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertAllFinite(entry, `${path}.${key}`);
  }
}

// ===========================================================================
section('1. barrels');
// ===========================================================================

// The modules each barrel REPUBLISHES, which is exactly the set where a name
// matters: two `export *` sources declaring the same name does not error, the
// ambiguous binding just vanishes from the namespace object. Files that merely
// sit under src/cloud or src/sky are deliberately out of scope — the retired
// texture-dome/2.5D-card graph is still on disk by design (see the barrel
// headers) and the spec has already condemned it, so holding it to the
// volumetric foundation's contract would gate this work on a migration.
function barrelSources(directory) {
  const source = readFileSync(join(directory, 'index.js'), 'utf8');
  const resolve = (pattern) => [...source.matchAll(pattern)].map((match) => join(directory, match[1]));
  return {
    named: resolve(/export\s*\{[^}]*\}\s*from\s+'([^']+)'/g),
    stars: resolve(/export\s+\*\s+from\s+'([^']+)'/g),
  };
}

const cloudDirectory = join(repositoryRoot, 'src/cloud');
const skyDirectory = join(repositoryRoot, 'src/sky');
const BARRELS = [
  { directory: cloudDirectory, label: 'cloud', namespace: cloudBarrel, ...barrelSources(cloudDirectory) },
  { directory: skyDirectory, label: 'sky', namespace: skyBarrel, ...barrelSources(skyDirectory) },
];
const republished = [...new Set(BARRELS.flatMap(({ named, stars }) => [...stars, ...named]))];
const moduleExports = new Map();
const importFailures = [];
for (const file of republished) {
  try {
    // eslint-disable-next-line no-await-in-loop
    moduleExports.set(file, await import(file));
  } catch (error) {
    importFailures.push(`${relative(repositoryRoot, file)}: ${String(error.message).split('\n')[0]}`);
  }
}

check(`every module the barrels republish imports (${republished.length} files)`, () => {
  assert.deepEqual(importFailures, []);
  // Sanity on the scan itself: a barrel rewritten in a form this regex cannot
  // read would make every check below vacuous.
  for (const { label, stars } of BARRELS) {
    assert.ok(stars.length > 0, `no \`export *\` found in the ${label} barrel.`);
  }
  // Only files under src/cloud or src/sky, so a barrel cannot quietly start
  // republishing another subsystem's surface.
  for (const file of republished) {
    const path = relative(repositoryRoot, file);
    assert.ok(
      path.startsWith('src/cloud/') || path.startsWith('src/sky/'),
      `a barrel republishes ${path}, outside the volumetric sky modules.`,
    );
  }
});

check('both barrels resolve every name they publish', () => {
  for (const [label, barrel] of [['cloud', cloudBarrel], ['sky', skyBarrel]]) {
    const names = Object.keys(barrel);
    assert.ok(names.length > 0, `the ${label} barrel exports nothing.`);
    assert.deepEqual(
      names.filter((name) => barrel[name] === undefined),
      [],
      `the ${label} barrel publishes undefined bindings.`,
    );
  }
  // Both barrels flatten into the package root (src/index.js), so a name they
  // share would collide there even though neither barrel notices.
  assert.deepEqual(
    Object.keys(cloudBarrel).filter((name) => name in skyBarrel),
    [],
    'the cloud and sky barrels publish the same name.',
  );
});

check('no name is declared by two modules that feed the same barrel', () => {
  for (const { label, named, stars } of BARRELS) {
    const declaredBy = new Map();
    for (const source of stars) {
      for (const name of Object.keys(moduleExports.get(source) ?? {})) {
        if (name === 'default') continue;
        if (!declaredBy.has(name)) declaredBy.set(name, []);
        declaredBy.get(name).push(relative(repositoryRoot, source));
      }
    }
    assert.deepEqual(
      [...declaredBy].filter(([, files]) => files.length > 1)
        .map(([name, files]) => `${name}: ${files.join(' , ')}`),
      [],
      `${label}: two \`export *\` sources declare the same name, so it silently vanishes.`,
    );
    // An explicitly named re-export shadows a star export of the same name
    // instead of erroring, which is the same silent loss wearing a different hat.
    for (const source of named) {
      for (const name of Object.keys(moduleExports.get(source) ?? {})) {
        if (name === 'default' || !(name in BARRELS.find((b) => b.label === label).namespace)) continue;
        const alsoStarred = declaredBy.get(name);
        assert.ok(
          !alsoStarred,
          `${label}: ${name} is both named-re-exported from ${relative(repositoryRoot, source)} `
          + `and star-exported from ${alsoStarred?.join(' , ')}.`,
        );
      }
    }
  }
});

check('every star-exported name is identity-equal to its owner binding', () => {
  for (const { label, namespace, stars } of BARRELS) {
    const missing = [];
    const mismatched = [];
    for (const source of stars) {
      const owner = moduleExports.get(source);
      assert.ok(owner, `${relative(repositoryRoot, source)} is star-exported but did not import.`);
      for (const name of Object.keys(owner)) {
        if (name === 'default') continue;
        if (!(name in namespace)) missing.push(`${name} (${relative(repositoryRoot, source)})`);
        else if (namespace[name] !== owner[name]) {
          mismatched.push(`${name} (${relative(repositoryRoot, source)})`);
        }
      }
    }
    // A star export dropped by an ambiguous binding vanishes silently; an
    // identity mismatch means the barrel is handing out somebody else's value.
    assert.deepEqual(missing, [], `${label}: names lost between owner and barrel.`);
    assert.deepEqual(mismatched, [], `${label}: barrel binding is not the owner's.`);
  }
});

check('the modules held out of the sky barrel still reach it through their consumer', () => {
  // skyQuality.js and sceneOverrideLayers.js are deliberately NOT star-exported:
  // the legacy stylizedSky.js re-exports the same four names, so adding either
  // file would make all four ambiguous and drop them from the namespace without
  // an error. Asserting they arrive, from the one owner, is what makes that
  // arrangement a contract rather than a comment.
  const heldOut = [
    ['./skyQuality.js', ['SKY_QUALITY_OPTIONS', 'SKY_QUALITY_TIERS', 'resolveSkyQuality']],
    ['./sceneOverrideLayers.js', ['SKY_SCENE_OVERRIDE_PRIORITIES']],
  ];
  const stars = BARRELS.find((barrel) => barrel.label === 'sky').stars
    .map((file) => relative(skyDirectory, file));
  for (const [module, names] of heldOut) {
    assert.ok(
      !stars.includes(relative(skyDirectory, join(skyDirectory, module))),
      `${module} is star-exported by the sky barrel; ${names.join(', ')} will vanish.`,
    );
    // eslint-disable-next-line no-await-in-loop
    for (const name of names) {
      assert.notEqual(skyBarrel[name], undefined, `${name} was dropped from the sky barrel.`);
    }
  }
});

check('the package exports both barrels at their spec paths', () => {
  const packageJson = JSON.parse(readRepositoryFile('package.json'));
  assert.equal(packageJson.exports['./cloud']?.default, './src/cloud/index.js');
  assert.equal(packageJson.exports['./sky']?.default, './src/sky/index.js');
  assert.equal(packageJson.scripts['verify:volumetric-sky'], 'node scripts/verify-volumetric-sky.mjs');
});

// ===========================================================================
section('2. parameter tables, cell for cell against the spec');
// ===========================================================================

check('cloud.shape matches the spec table', () => {
  compareGroup(
    'cloud.shape',
    specFields('### cloud.shape'),
    cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.shape,
    DEFAULTS.cloud.shape,
  );
});

check('cloud.lighting matches the spec table', () => {
  compareGroup(
    'cloud.lighting',
    specFields('### cloud.lighting'),
    cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.lighting,
    DEFAULTS.cloud.lighting,
  );
});

check('cloud.wind matches the spec table', () => {
  compareGroup(
    'cloud.wind',
    specFields('### cloud.wind'),
    cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.wind,
    DEFAULTS.cloud.wind,
  );
});

check('cloud.cirrus / cloud.haze / cloud.fade match the spec table', () => {
  const table = specFields('### cloud.cirrus / cloud.haze / cloud.fade');
  for (const group of ['cirrus', 'haze', 'fade']) {
    compareGroup(
      `cloud.${group}`,
      specSubset(table, group),
      cloudParams.CLOUD_PARAMS_FIELD_SCHEMA[group],
      DEFAULTS.cloud[group],
    );
  }
  assert.deepEqual(
    [...cloudParams.CLOUD_PARAM_GROUP_IDS],
    ['shape', 'lighting', 'wind', 'cirrus', 'haze', 'fade'],
    'the spec fixes six cloud param groups.',
  );
});

check('atmosphere matches the spec table', () => {
  const { style: atmosphereStyle, ...physicalAtmosphereSchema } = skyParams.SKY_PARAMS_FIELD_SCHEMA.atmosphere;
  compareGroup(
    'atmosphere',
    specFields('### atmosphere'),
    atmosphereParams.ATMOSPHERE_PARAM_SCHEMA,
    DEFAULTS.atmosphere,
  );
  // The envelope adopts the owner's table rather than re-stating it.
  compareGroup(
    'SkyParams.atmosphere',
    specFields('### atmosphere'),
    physicalAtmosphereSchema,
    DEFAULTS.atmosphere,
  );
  assert.equal(atmosphereStyle.enabled.type, 'boolean');
  assert.equal(atmosphereStyle.palette.enabled.type, 'boolean');
  assert.equal(DEFAULTS.atmosphere.style.enabled, false);
  assert.equal(DEFAULTS.atmosphere.style.palette.enabled, false);
  assert.deepEqual(
    [...atmosphereParams.ATMOSPHERE_REBAKE_KEYS],
    ['rayleigh', 'turbidity', 'groundAlbedo'],
    'the spec names exactly these three as re-baking the scattering LUTs.',
  );
});

check('sun matches the spec table', () => {
  compareGroup(
    'sun',
    specFields('### sun'),
    skyParams.SKY_PARAMS_FIELD_SCHEMA.sun,
    DEFAULTS.sun,
  );
  assert.deepEqual(
    Object.keys(sunDriver.DEFAULT_SUN_PARAMS).sort(),
    Object.keys(skyParams.SKY_PARAMS_FIELD_SCHEMA.sun).sort(),
    'sunDriver owns the sun group; the envelope must not add or drop a field.',
  );
});

check('time and time.moon match the spec table', () => {
  const table = specFields('### time');
  const timeSchema = skyParams.SKY_PARAMS_FIELD_SCHEMA.time;
  compareGroup('time', specSubset(table, ''), timeSchema, DEFAULTS.time, {
    schemaKeys: Object.keys(timeSchema).filter((key) => key !== 'moon'),
  });
  compareGroup('time.moon', specSubset(table, 'moon'), timeSchema.moon, DEFAULTS.time.moon);
  assert.deepEqual(
    Object.keys(timeOfDay.DEFAULT_MOON_PARAMS).sort(),
    Object.keys(timeSchema.moon).sort(),
    'timeOfDay owns the nested moon block.',
  );
});

check('godRays matches the spec table, and steps is not a params field', () => {
  compareGroup(
    'godRays',
    // The spec lists `steps` in the same table and says it is a tier-driven
    // uniform, "**not** a params field".
    specFields('### godRays', { ignore: ['steps'] }),
    godRays.GOD_RAYS_PARAM_SCHEMA,
    DEFAULTS.godRays,
  );
  assert.equal(godRays.GOD_RAYS_PARAM_SCHEMA.steps, undefined);
  assert.ok('godRaySteps' in skyQualityTiers.QUALITY_LEVEL_FIELDS);
  assert.match(spec, /\|\s*`steps`\s*\|\s*24\s*\|[^|]*not\*\* a params field/);
});

check('nightSky matches the spec', () => {
  const published = /\{ intensity: ([0-9.]+) \}/.exec(spec.slice(spec.indexOf('### nightSky')));
  assert.ok(published, `${SPEC_PATH}: the nightSky default is not stated as { intensity: n }.`);
  assert.equal(nightSky.NIGHT_SKY_PARAM_SCHEMA.intensity.value, Number(published[1]));
  assert.equal(DEFAULTS.nightSky.intensity, Number(published[1]));
  assert.deepEqual(Object.keys(nightSky.NIGHT_SKY_PARAM_SCHEMA), ['intensity']);
});

check('the SkyParams envelope carries exactly the spec blocks', () => {
  const envelope = /\{\s*atmosphere,\s*sun,\s*time,\s*cloud:\s*\{([^}]+)\},\s*noise,\s*godRays,\s*nightSky\s*\}/
    .exec(spec);
  assert.ok(envelope, `${SPEC_PATH}: the SkyParams envelope shape is not stated.`);
  assert.deepEqual(
    [...skyParams.SKY_PARAMS_BLOCK_IDS].sort(),
    ['atmosphere', 'cloud', 'godRays', 'nightSky', 'noise', 'sun', 'time'],
  );
  assert.deepEqual(
    envelope[1].split(',').map((name) => name.trim()),
    [...cloudParams.CLOUD_PARAM_GROUP_IDS, 'style'],
  );
  // `noise` is the one block the spec states as a snippet, not a table.
  assert.match(spec, /noise:\s*\{\s*weather:\s*\{\s*resolution:\s*number,\s*profile:\s*WeatherMapProfile\s*\}\s*\}/);
  assert.deepEqual(Object.keys(DEFAULTS.noise), ['weather']);
  assert.deepEqual(Object.keys(DEFAULTS.noise.weather).sort(), ['profile', 'resolution', 'seed']);
  assert.deepEqual(
    Object.keys(DEFAULTS.noise.weather.profile).sort(),
    Object.keys(weatherMap.WEATHER_MAP_PROFILE_FIELDS).sort(),
  );
  assert.ok(Object.isFrozen(DEFAULTS) && Object.isFrozen(DEFAULTS.cloud.shape));
});

check('the 4-tier quality table matches the spec, field for field', () => {
  const { header, rows } = specTable('## Quality tiers');
  assert.deepEqual(header, ['Field', ...TIER_NAMES]);
  const fields = rows.map(([nameCell]) => plain(nameCell));
  assert.deepEqual(
    fields.slice().sort(),
    Object.keys(skyQualityTiers.resolveQuality('high')).sort(),
    'the tier config and the spec table list different fields.',
  );
  assert.equal(fields.length, 13, 'the spec publishes a 13-field tier table.');
  // The tier literals too, not only what resolveQuality hands back: it rebuilds
  // its config from QUALITY_LEVEL_FIELDS, so a stray field added to a tier is
  // invisible from the outside and drifts unnoticed until someone reads it.
  for (const tier of TIER_NAMES) {
    const literal = skyQualityTiers.QUALITY_LEVELS[tier];
    assert.ok(literal, `the ${tier} tier is missing from QUALITY_LEVELS.`);
    assert.ok(Object.isFrozen(literal), `the ${tier} tier literal is mutable.`);
    assert.deepEqual(
      Object.keys(literal).sort(),
      fields.slice().sort(),
      `the ${tier} tier literal and the spec table list different fields.`,
    );
  }
  for (const [nameCell, ...valueCells] of rows) {
    const key = plain(nameCell);
    TIER_NAMES.forEach((tier, index) => {
      const want = specValue(valueCells[index]);
      const got = skyQualityTiers.resolveQuality(tier)[key];
      if (key === 'baseShapeDims') {
        assert.deepEqual(
          { x: got.x, y: got.y, z: got.z },
          { x: want, y: want, z: want },
          `tier ${tier}.${key}`,
        );
      } else {
        assert.equal(got, want, `tier ${tier}.${key}`);
      }
    });
  }
  const defaultTier = /`(\w+)` is the default\./.exec(spec);
  assert.ok(defaultTier, `${SPEC_PATH}: the default tier is not stated.`);
  assert.equal(skyQualityTiers.DEFAULT_QUALITY_LEVEL, defaultTier[1]);
  const envMap = /`width` (\d+),\s*`cloudMarchSteps` (\d+), `cloudMipBase` (\d+), `skipFrames` (\d+)/
    .exec(spec);
  assert.ok(envMap, `${SPEC_PATH}: the direct env-map defaults are not stated.`);
  assert.deepEqual(skyQualityTiers.DEFAULT_ENV_MAP_OPTIONS, {
    cloudMarchSteps: Number(envMap[2]),
    cloudMipBase: Number(envMap[3]),
    includeClouds: true,
    skipFrames: Number(envMap[4]),
    width: Number(envMap[1]),
  });
});

check('every field descriptor is authorable (range inside limit, default inside limit)', () => {
  // assertSchemaInvariants runs at import; calling it here states the contract
  // rather than relying on a side effect, and covers both schema trees.
  paramSchema.assertSchemaInvariants('cloudParams', cloudParams.CLOUD_PARAMS_FIELD_SCHEMA);
  paramSchema.assertSchemaInvariants('skyParams', skyParams.SKY_PARAMS_FIELD_SCHEMA);
});

check('wind publishes plain numbers, a uniform skew, and read-only driven state', () => {
  // Spec: "`heading`, `speed`, `evolutionSpeed` are plain numbers; `skew` is a
  // uniform. `wind.advance(dt)` integrates and refreshes read-only `direction`,
  // `offset`, `evolutionOffset` uniforms."
  const fields = cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.wind;
  for (const key of ['heading', 'speed', 'evolutionSpeed']) {
    assert.equal(fields[key].uniform, false, `wind.${key} must not be a uniform.`);
  }
  assert.equal(fields.skew.uniform, true);
  const wind = cloudParams.createCloudParams().wind;
  for (const key of ['direction', 'offset', 'evolutionOffset']) {
    assert.ok(wind[key]?.value, `wind.${key} must be a driven uniform.`);
    assert.equal(Object.getOwnPropertyDescriptor(wind, key), undefined);
    assert.throws(() => { wind[key] = null; }, TypeError, `wind.${key} must be read-only.`);
    assert.equal(wind.toParams()[key], undefined, `wind.${key} is driven, not a param.`);
  }
});

// ===========================================================================
section('3. round-trip identity');
// ===========================================================================

check('CloudParams round-trips at defaults, group by group and whole', () => {
  const params = cloudParams.createCloudParams();
  const first = plainParams(params.toParams());
  params.applyParams(first);
  assert.deepEqual(plainParams(params.toParams()), first);
  for (const id of cloudParams.CLOUD_PARAM_GROUP_IDS) {
    const group = cloudParams.createCloudParams()[id];
    const before = plainParams(group.toParams());
    group.applyParams(before);
    assert.deepEqual(plainParams(group.toParams()), before, `cloud.${id}`);
  }
});

check('CloudParams round-trips at authored values and preserves every one', () => {
  for (const [id, authored] of Object.entries(AUTHORED_CLOUD)) {
    const group = cloudParams.createCloudParams()[id];
    group.applyParams(authored);
    const first = plainParams(group.toParams());
    group.applyParams(first);
    assert.deepEqual(plainParams(group.toParams()), first, `cloud.${id} is not idempotent.`);
    for (const [key, want] of Object.entries(authored)) {
      assert.deepEqual(first[key], plainParams(want), `cloud.${id}.${key} moved.`);
    }
  }
  const whole = cloudParams.createCloudParams(AUTHORED_CLOUD);
  const first = plainParams(whole.toParams());
  whole.applyParams(first);
  assert.deepEqual(plainParams(whole.toParams()), first);
});

check('the SkyParams envelope is idempotent and serializes byte-identically at defaults', () => {
  const once = skyParams.createSkyParams({});
  assert.deepEqual(plainParams(skyParams.createSkyParams(plainParams(once))), plainParams(once));
  const first = skyParams.serializeSkyParams(once);
  const reloaded = skyParams.validateSkyParams(first);
  assert.equal(reloaded.ok, true, reloaded.errors.join(' '));
  assert.deepEqual(reloaded.warnings, [], 'reloading our own default serialization warns.');
  assert.equal(skyParams.serializeSkyParams(reloaded.value), first);
});

check('the SkyParams envelope round-trips a fully authored preset verbatim', () => {
  const resolved = skyParams.createSkyParams(AUTHORED_SKY);
  assert.deepEqual(
    plainParams(skyParams.createSkyParams(plainParams(resolved))),
    plainParams(resolved),
  );
  const first = skyParams.serializeSkyParams(resolved);
  const reloaded = skyParams.validateSkyParams(first);
  assert.equal(reloaded.ok, true, reloaded.errors.join(' '));
  assert.deepEqual(reloaded.warnings, [], 'reloading an authored serialization warns.');
  assert.equal(skyParams.serializeSkyParams(reloaded.value), first);
  // Every authored leaf survived, not just the tree shape.
  const lost = [];
  const compare = (want, got, path) => {
    for (const [key, value] of Object.entries(want)) {
      const at = `${path}.${key}`;
      if (Array.isArray(value)) {
        const channels = channelsOf(got?.[key]);
        if (!Array.isArray(channels) || value.some((c, i) => channels[i] !== c)) {
          lost.push(`${at}: want [${value}] got ${JSON.stringify(channels)}`);
        }
      } else if (value && typeof value === 'object') compare(value, got?.[key], at);
      else if (got?.[key] !== value) lost.push(`${at}: want ${value} got ${JSON.stringify(got?.[key])}`);
    }
  };
  compare(AUTHORED_SKY, resolved, 'SkyParams');
  assert.deepEqual(lost, []);
});

check('a SkyParams document round-trips byte-identically', () => {
  const document = skyParams.createSkyParamsDocument('verify_volumetric_sky', {
    label: 'Verify Volumetric Sky',
    params: AUTHORED_SKY,
  });
  assert.equal(document.type, skyParams.SKY_PARAMS_DOCUMENT_TYPE);
  assert.equal(document.version, skyParams.SKY_PARAMS_SCHEMA_VERSION);
  const first = skyParams.serializeSkyParamsDocument(document);
  const reloaded = skyParams.validateSkyParamsDocument(first);
  assert.equal(reloaded.ok, true, reloaded.errors.join(' '));
  assert.equal(skyParams.serializeSkyParamsDocument(reloaded.value), first);
  const wrongType = skyParams.validateSkyParamsDocument({ ...document, type: 'toonlab/sky-preset' });
  assert.equal(wrongType.ok, false, 'a foreign document type must not be retagged.');
});

check('the document layer and the live cloud class agree field for field', () => {
  const authored = { shape: { altitude: 1750, coverage: 0.6 }, fade: { horizonMeltEnd: 51000 } };
  const { style: authoredStyle, ...documentCloud } = skyParams.createSkyParams({ cloud: authored }).cloud;
  const { style: defaultStyle, ...defaultCloud } = DEFAULTS.cloud;
  assert.ok(authoredStyle && defaultStyle, 'the optional style block belongs to the document, not CloudParams');
  assert.deepEqual(
    plainParams(documentCloud),
    plainParams(cloudParams.createCloudParams(authored).toParams()),
  );
  assert.deepEqual(
    plainParams(cloudParams.createCloudParams().toParams()),
    plainParams(defaultCloud),
  );
});

check('a colour channel past its maximum clamps the same live and in the document', () => {
  // The live readers used to clamp nothing at all, so `{ color: [7, 0, 0] }` left
  // the sun holding r = 7 while the serializer wrote the field's declared 4: the
  // sun lighting the lab and the preset captured from it were different colours,
  // and nothing said so. Both paths clamp to the same descriptor now, which is
  // the owner's — there is no second copy of the maximum to drift.
  const cases = [
    ['sun.color', skyParams.SKY_PARAMS_FIELD_SCHEMA.sun.color,
      (color) => sunDriver.createSun({ color }).toParams().color,
      (color) => skyParams.createSkyParams({ sun: { color } }).sun.color],
    ['time.moon.color', skyParams.SKY_PARAMS_FIELD_SCHEMA.time.moon.color,
      (color) => timeOfDay.createTimeOfDay({ moon: { color } }).toParams().moon.color,
      (color) => skyParams.createSkyParams({ time: { moon: { color } } }).time.moon.color],
  ];
  for (const [path, field, live, document] of cases) {
    const { max, min } = field.limit;
    // An emissive tint keeps HDR headroom, so the maximum is above white and a
    // clamp at 1 would be as wrong as no clamp at all.
    assert.ok(Number.isFinite(max) && max > 1, `${path} declares no HDR channel maximum.`);
    for (const authored of [[max + 3, max + 3, max + 3], [max * 2, min - 1, max], [max, min, 1]]) {
      const want = authored.map((channel) => Math.min(Math.max(channel, min), max));
      assert.deepEqual(channelsOf(live(authored)), want, `${path} live path clamp`);
      assert.deepEqual(channelsOf(document(authored)), want, `${path} document path clamp`);
    }
  }
  // End to end, which is the shape the defect actually took: a preset written
  // from a live sun must be the colour that sun is standing in.
  const sun = sunDriver.createSun({ color: [7, 0.95, 0.85] });
  assert.deepEqual(
    JSON.parse(skyParams.serializeSkyParams({ sun: sun.toParams() })).sun.color,
    channelsOf(sun.toParams().color),
    'the serialized sun colour is not the colour the live sun holds.',
  );
});

// ===========================================================================
section('4. the derived march ceiling and the melt window');
// ===========================================================================

const MELT_CASES = [0, 1, 100, 0.5, 25000, 40000, 99999, 100000, 1e6];

check('fade.maxMarchDist is horizonMeltEnd + the spec margin on both paths', () => {
  const published = /always `horizonMeltEnd \+ (\d+)`/.exec(spec);
  assert.ok(published, `${SPEC_PATH}: the maxMarchDist rule is not stated.`);
  assert.equal(cloudParams.MAX_MARCH_DIST_MARGIN, Number(published[1]));
  const margin = cloudParams.MAX_MARCH_DIST_MARGIN;
  for (const end of MELT_CASES) {
    const group = cloudParams.createCloudParams().fade;
    group.applyParams({ horizonMeltStart: 0, horizonMeltEnd: end });
    const live = group.toParams();
    assert.equal(live.maxMarchDist, live.horizonMeltEnd + margin, `class path, end ${end}`);
    const { fade } = skyParams.createSkyParams({
      cloud: { fade: { horizonMeltStart: 0, horizonMeltEnd: end } },
    }).cloud;
    assert.equal(fade.maxMarchDist, fade.horizonMeltEnd + margin, `document path, end ${end}`);
  }
  // Inside the published slider domain the derived value stays inside its own.
  const endRange = cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.fade.horizonMeltEnd.range;
  const marchRange = cloudParams.CLOUD_PARAMS_FIELD_SCHEMA.fade.maxMarchDist.range;
  assert.ok(endRange.max + margin <= marchRange.max);
});

check('fade.maxMarchDist is read-only and a supplied value is replaced and reported', () => {
  const group = cloudParams.createCloudParams().fade;
  const descriptor = Object.getOwnPropertyDescriptor(group, 'maxMarchDist');
  assert.equal(descriptor.set, undefined, 'maxMarchDist must have no setter.');
  assert.equal(typeof descriptor.get, 'function');
  assert.throws(() => { group.maxMarchDist = 1; }, TypeError);
  const written = watch(() => {
    group.applyParams({ horizonMeltEnd: 30000, maxMarchDist: 999 });
    return group.toParams();
  });
  assert.equal(written.value.maxMarchDist, 32000, 'a supplied maxMarchDist survived the class path.');
  assert.ok(
    written.warnings.some((warning) => warning.includes('maxMarchDist is derived')),
    'replacing a supplied derived value must be reported.',
  );
  const forced = skyParams.createSkyParams({
    cloud: { fade: { horizonMeltEnd: 30000, maxMarchDist: 999 } },
  });
  assert.equal(forced.cloud.fade.maxMarchDist, 32000, 'a supplied maxMarchDist survived the document path.');
});

check('horizonMeltEnd is raised to horizonMeltStart, with the march resynced', () => {
  for (const [start, end] of [[50000, 10000], [40000, 0], [100000, 25000], [1, 0], [25000, 25000]]) {
    const written = watch(() => {
      const group = cloudParams.createCloudParams().fade;
      group.applyParams({ horizonMeltStart: start, horizonMeltEnd: end });
      return group.toParams();
    });
    const live = written.value;
    assert.ok(live.horizonMeltEnd >= live.horizonMeltStart, `class path ${start}/${end}`);
    assert.equal(live.maxMarchDist, live.horizonMeltEnd + cloudParams.MAX_MARCH_DIST_MARGIN);
    if (end < start) {
      assert.ok(
        written.warnings.some((warning) => warning.includes('was raised to horizonMeltStart')),
        `raising horizonMeltEnd from ${end} must be reported.`,
      );
    }
    const { fade } = skyParams.createSkyParams({
      cloud: { fade: { horizonMeltStart: start, horizonMeltEnd: end } },
    }).cloud;
    assert.ok(fade.horizonMeltEnd >= fade.horizonMeltStart, `document path ${start}/${end}`);
    assert.equal(fade.maxMarchDist, fade.horizonMeltEnd + cloudParams.MAX_MARCH_DIST_MARGIN);
  }
});

// ===========================================================================
section('5. the fixed march budget');
// ===========================================================================

check('the march budget is 128 primary / 6 light on every tier', () => {
  const published = /\*\*(\d+) primary steps, (\d+) light steps\*\*/.exec(spec);
  assert.ok(published, `${SPEC_PATH}: the fixed march budget is not stated.`);
  const primary = Number(published[1]);
  const light = Number(published[2]);
  assert.equal(skyQualityTiers.CLOUD_PRIMARY_MARCH_STEPS, primary);
  assert.equal(skyQualityTiers.CLOUD_LIGHT_MARCH_STEPS, light);
  assert.deepEqual(skyQualityTiers.CLOUD_MARCH_BUDGET, { lightSteps: light, primarySteps: primary });
  assert.ok(Object.isFrozen(skyQualityTiers.CLOUD_MARCH_BUDGET));
  assert.deepEqual(skyQualityTiers.assertFixedMarchBudget(), skyQualityTiers.CLOUD_MARCH_BUDGET);
  for (const tier of TIER_NAMES) {
    assert.deepEqual(skyQualityTiers.resolveMarchBudget(tier), { lightSteps: light, primarySteps: primary });
    const config = skyQualityTiers.resolveQuality(tier);
    assert.deepEqual(
      Object.keys(config).filter((key) => /step/i.test(key)),
      ['godRaySteps', 'envMapMarchSteps'],
      `tier ${tier} carries an unexpected step count.`,
    );
  }
});

check('a tier cannot be asked to scale the march budget', () => {
  for (const key of ['primarySteps', 'lightSteps', 'cloudMarchSteps', 'cloudPrimarySteps',
    'cloudLightSteps', 'marchSteps']) {
    const attempt = watch(() => skyQualityTiers.resolveQuality('high', { [key]: 999 }));
    assert.equal(attempt.value[key], undefined, `${key} entered the tier config.`);
    assert.ok(
      attempt.warnings.some((warning) => warning.includes(key) && warning.includes('fixed at')),
      `overriding ${key} must be reported, not swallowed.`,
    );
  }
  const unknown = watch(() => skyQualityTiers.resolveQuality('high', { nonsense: 1 }));
  assert.equal(unknown.value.nonsense, undefined);
  assert.ok(unknown.warnings.some((warning) => warning.includes('Unknown quality field')));
});

// ===========================================================================
section('6. determinism');
// ===========================================================================

const bytesEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const fnv1a32 = (bytes) => {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const channelAt = (data, offset) => {
  const out = [];
  for (let index = offset; index < data.length; index += 4) out.push(data[index]);
  return out;
};

check('seeded auxiliary noise varies while canonical fields remain fixed', () => {
  const canonicalBakers = [
    ['base shape 32^3', (seed) => baseShapeVolume.createCloudBaseShapeData({ dims: 32, seed }).data],
    ['weather 256', (seed) => weatherMap.createWeatherMapData({ resolution: 256, seed }).data],
  ];
  for (const [label, bake] of canonicalBakers) {
    const first = bake(7);
    assert.ok(bytesEqual(first, bake(7)), `${label}: the same seed produced different bytes.`);
    assert.ok(bytesEqual(first, bake(8)), `${label}: compatibility seed changed the canonical field.`);
  }

  const seededBakers = [
    ['erosion 32^3', (seed) => erosionVolume.createCloudErosionData({ dims: 32, seed }).data],
    ['curl 32^3', (seed) => curlNoise.createCurlNoiseData({ dims: 32, seed }).data],
    ['cirrus 128', (seed) => cirrusMap.createCloudCirrusMapData({ width: 128, height: 128, seed }).data],
  ];
  for (const [label, bake] of seededBakers) {
    const first = bake(7);
    assert.ok(bytesEqual(first, bake(7)), `${label}: the same seed produced different bytes.`);
    assert.ok(!bytesEqual(first, bake(8)), `${label}: seeds 7 and 8 are byte-identical.`);
  }
});

check('the base-shape bake matches the canonical packed inverted-Worley volume', () => {
  const baked = baseShapeVolume.createCloudBaseShapeData({ dims: 32, seed: 7 });
  const red = channelAt(baked.data, 0);
  const redMean = red.reduce((sum, value) => sum + value, 0) / (red.length * 255);

  // Digest and channel statistics lock the canonical 32^3 field.
  assert.equal(fnv1a32(baked.data), 'b7dd3628');
  assert.ok(Math.min(...red) >= 16, 'Packed Worley R gained impossible near-zero voids.');
  assert.ok(Math.max(...red) >= 220, 'Packed Worley R lost its high-density cells.');
  assert.ok(redMean > 0.479 && redMean < 0.482, `Packed Worley R mean drifted to ${redMean}.`);
  assert.deepEqual(baked.perlinPeriods, []);
  assert.deepEqual(baked.worleyCells, [4, 8, 16, 32, 64]);
  assert.deepEqual(
    baked.levels.map((level) => level.length),
    [131072, 16384, 2048, 256, 32, 4],
    'The complete 3D box-filtered mip chain changed.',
  );
});

check('the density field keeps Nubis\' three weather-type height profiles', () => {
  const profiles = [
    ['stratus', cloudBarrel.CLOUD_STRATUS_HEIGHT_GRADIENT, [0.02, 0.05, 0.09, 0.11]],
    ['stratocumulus', cloudBarrel.CLOUD_STRATOCUMULUS_HEIGHT_GRADIENT, [0.02, 0.2, 0.48, 0.625]],
    ['cumulus', cloudBarrel.CLOUD_CUMULUS_HEIGHT_GRADIENT, [0.01, 0.0625, 0.78, 1]],
  ];
  for (const [name, actual, expected] of profiles) {
    assert.deepEqual(actual, expected, `${name}: profile breakpoints drifted.`);
    assert.ok(actual[0] < actual[1], `${name}: bottom fade is inverted.`);
    assert.ok(actual[1] <= actual[2], `${name}: plateau has negative height.`);
    assert.ok(actual[2] < actual[3], `${name}: top fade is inverted.`);
  }

  const weights = (type) => [
    1 - Math.min(Math.max(type * 2, 0), 1),
    1 - Math.abs(type - 0.5) * 2,
    Math.min(Math.max(type - 0.5, 0), 1) * 2,
  ];
  assert.deepEqual(weights(0), [1, 0, 0]);
  assert.deepEqual(weights(0.25), [0.5, 0.5, 0]);
  assert.deepEqual(weights(0.5), [0, 1, 0]);
  assert.deepEqual(weights(0.75), [0, 0.5, 0.5]);
  assert.deepEqual(weights(1), [0, 0, 1]);
  for (let type = 0; type <= 1; type += 0.01) {
    const sum = weights(type).reduce((total, weight) => total + weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `height-profile weights sum to ${sum} at ${type}.`);
  }
});

check('the erosion volume is not a copy of the base shape at a shared cell count', () => {
  // The Worley ladder seeds each band by its cell count, so a frequency is the
  // same field in every volume that asks for it. Without a per-volume seed
  // namespace, erosion.A came out byte-identical to base.B at 32^3 — carving a
  // cloud with a copy of its own erosion basis.
  const base = baseShapeVolume.createCloudBaseShapeData({ dims: 32, seed: 7 }).data;
  const erosion = erosionVolume.createCloudErosionData({ dims: 32, seed: 7 }).data;
  const shared = [];
  for (const [baseOffset, baseName] of [[1, 'G'], [2, 'B'], [3, 'A']]) {
    for (const [erosionOffset, erosionName] of [[0, 'R'], [1, 'G'], [2, 'B'], [3, 'A']]) {
      if (bytesEqual(channelAt(base, baseOffset), channelAt(erosion, erosionOffset))) {
        shared.push(`base.${baseName} === erosion.${erosionName}`);
      }
    }
  }
  assert.deepEqual(shared, []);
  assert.notEqual(
    baseShapeVolume.CLOUD_BASE_SHAPE_SEED_NAMESPACE,
    erosionVolume.CLOUD_EROSION_SEED_NAMESPACE,
  );
});

check('wind drift is a function of the dt sequence alone, and reset() rewinds it', () => {
  const steps = [0.016, 0.033, 0.016, 0.25, 0.016];
  const run = () => {
    const wind = cloudParams.createCloudParams({
      wind: { heading: 137.5, speed: 12.3, evolutionSpeed: 4.5 },
    }).wind;
    for (const dt of steps) wind.advance(dt);
    return [wind.offset.value.toArray(), wind.evolutionOffset.value.toArray()];
  };
  assert.deepEqual(run(), run());
  const wind = cloudParams.createCloudParams({ wind: { speed: 9, evolutionSpeed: 3 } }).wind;
  for (const dt of steps) wind.advance(dt);
  assert.notDeepEqual(wind.offset.value.toArray(), [0, 0, 0]);
  wind.reset();
  // The capture contract requires drift frozen at t=0 for a reproducible frame.
  assert.deepEqual(wind.offset.value.toArray(), [0, 0, 0]);
  assert.deepEqual(wind.evolutionOffset.value.toArray(), [0, 0, 0]);
});

// ===========================================================================
section('7. tiling — no seam on any axis');
// ===========================================================================

// A seam is a wrap step categorically larger than the steps the field takes
// inside. Two statistics say so together, and both were checked against a
// deliberately seamed volume (one face replaced from another seed) before being
// used here: the seamed volume fails both.
//
// The max comparison carries one byte of quantization slack and a 5% outlier
// band. A periodic near-Nyquist Worley rung can put the largest sampled adjacent
// step on the wrap pair simply by chance (175 versus an interior 171 in the
// exact-periodic 32³ reference packing); requiring the single global maxima to
// be ordered is not a continuity test. The mean remains the systematic guard:
// measured honest fields stay below 1.20 while a deliberately replaced face
// reads 3.0 and up.
const WRAP_MAX_SLACK = 1;
const WRAP_MAX_RATIO = 1.05;
const WRAP_MEAN_RATIO = 1.25;

function wrapStats(sample, count) {
  let wrapMax = 0;
  let wrapSum = 0;
  let wrapCount = 0;
  let interiorMax = 0;
  let interiorSum = 0;
  let interiorCount = 0;
  const wrap = Math.abs(sample(0) - sample(count - 1));
  wrapMax = Math.max(wrapMax, wrap);
  wrapSum += wrap;
  wrapCount += 1;
  for (let index = 0; index + 1 < count; index += 1) {
    const step = Math.abs(sample(index + 1) - sample(index));
    interiorMax = Math.max(interiorMax, step);
    interiorSum += step;
    interiorCount += 1;
  }
  return { interiorCount, interiorMax, interiorSum, wrapCount, wrapMax, wrapSum };
}

function accumulate(into, next) {
  into.wrapMax = Math.max(into.wrapMax, next.wrapMax);
  into.wrapSum += next.wrapSum;
  into.wrapCount += next.wrapCount;
  into.interiorMax = Math.max(into.interiorMax, next.interiorMax);
  into.interiorSum += next.interiorSum;
  into.interiorCount += next.interiorCount;
  return into;
}

const emptyStats = () => ({
  interiorCount: 0, interiorMax: 0, interiorSum: 0, wrapCount: 0, wrapMax: 0, wrapSum: 0,
});

function assertSeamless(label, axis, stats) {
  assert.ok(
    stats.wrapMax <= stats.interiorMax * WRAP_MAX_RATIO + WRAP_MAX_SLACK,
    `${label} ${axis}: wrap step ${stats.wrapMax} exceeds the largest interior step `
    + `${stats.interiorMax} — a discontinuity across the repeat.`,
  );
  const wrapMean = stats.wrapSum / stats.wrapCount;
  const interiorMean = stats.interiorSum / stats.interiorCount;
  assert.ok(
    wrapMean <= interiorMean * WRAP_MEAN_RATIO,
    `${label} ${axis}: mean wrap step ${wrapMean.toFixed(3)} against mean interior step `
    + `${interiorMean.toFixed(3)} — the repeat is systematically a bigger jump.`,
  );
}

function assertVolumeTiles(label, data, dims) {
  const at = (x, y, z, channel) => data[(((z * dims.y + y) * dims.x + x) * 4) + channel];
  for (const axis of ['x', 'y', 'z']) {
    const count = dims[axis];
    const outerMax = axis === 'x' ? dims.y : dims.x;
    const innerMax = axis === 'z' ? dims.y : dims.z;
    const stats = emptyStats();
    for (let outer = 0; outer < outerMax; outer += 1) {
      for (let inner = 0; inner < innerMax; inner += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          const sample = (index) => {
            if (axis === 'x') return at(index, outer, inner, channel);
            if (axis === 'y') return at(outer, index, inner, channel);
            return at(outer, inner, index, channel);
          };
          accumulate(stats, wrapStats(sample, count));
        }
      }
    }
    assertSeamless(label, axis, stats);
  }
}

function assertMapTiles(label, data, size) {
  const at = (x, y, channel) => data[((y * size + x) * 4) + channel];
  for (const axis of ['x', 'y']) {
    const stats = emptyStats();
    for (let line = 0; line < size; line += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        const sample = (index) => (axis === 'x' ? at(index, line, channel) : at(line, index, channel));
        accumulate(stats, wrapStats(sample, size));
      }
    }
    assertSeamless(label, axis, stats);
  }
}

check('the analytic 3D samplers are exactly periodic over the unit tile', () => {
  const perlin = periodicNoise3.createPeriodicPerlin3(12345, 8);
  const worley = periodicNoise3.createPeriodicWorley3(12345, 8, 1);
  let worst = 0;
  for (let sample = 0; sample < 2000; sample += 1) {
    const x = (sample * 0.37) % 1;
    const y = (sample * 0.11) % 1;
    const z = (sample * 0.73) % 1;
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [1, -1, 2]]) {
      worst = Math.max(worst, Math.abs(perlin.sample(x, y, z) - perlin.sample(x + dx, y + dy, z + dz)));
      worst = Math.max(worst, Math.abs(worley.sample(x, y, z) - worley.sample(x + dx, y + dy, z + dz)));
    }
  }
  assert.ok(worst < 1e-12, `the samplers are not periodic: max |f(x) - f(x+1)| = ${worst}.`);
});

check('the analytic base-shape field is exactly periodic before quantization', () => {
  const plan = baseShapeVolume.CLOUD_BASE_SHAPE_PLAN;
  const bands = periodicNoise3.createWorleyLadder3(999, plan.worleyCells, {
    dim: 64, jitter: plan.worleyJitter, texelsPerCell: plan.worleyTexelsPerCell,
  });
  const perlin = periodicNoise3.createPeriodicPerlinFbm3(999, { ...plan.perlin, dim: 64 });
  const field = (x, y, z) => {
    const floor = periodicNoise3.invertedWorleyFbm3(bands, 0, x, y, z);
    const perlin01 = perlin.sample(x, y, z) * 0.5 + 0.5;
    return Math.min(Math.max((perlin01 - floor) / Math.max(1 - floor, 1e-6), 0), 1);
  };
  let worst = 0;
  for (let sample = 0; sample < 1500; sample += 1) {
    const x = (sample * 0.37) % 1;
    const y = (sample * 0.11) % 1;
    const z = (sample * 0.73) % 1;
    worst = Math.max(worst, Math.abs(field(x, y, z) - field(x + 1, y, z)));
    worst = Math.max(worst, Math.abs(field(x, y, z) - field(x, y + 1, z)));
    worst = Math.max(worst, Math.abs(field(x, y, z) - field(x, y, z + 1)));
  }
  assert.ok(worst < 1e-12, `the base-shape field is not periodic: max delta ${worst}.`);
});

check('every baked volume tiles on every axis', () => {
  for (const dims of [16, 32]) {
    const base = baseShapeVolume.createCloudBaseShapeData({ dims, seed: 7 });
    assertVolumeTiles(`base-shape ${dims}^3`, base.data, base.dims);
    const erosion = erosionVolume.createCloudErosionData({ dims, seed: 7 });
    assertVolumeTiles(`erosion ${dims}^3`, erosion.data, erosion.dims);
    const curl = curlNoise.createCurlNoiseData({ dims, seed: 7 });
    assertVolumeTiles(`curl ${dims}^3`, curl.data, curl.dims);
  }
});

check(`the weather map tiles at every legal resolution (${weatherMap.WEATHER_MAP_RESOLUTIONS.join(', ')})`, () => {
  for (const resolution of weatherMap.WEATHER_MAP_RESOLUTIONS) {
    const map = weatherMap.createWeatherMapData({ resolution, seed: 7 });
    assert.equal(map.resolution, resolution);
    assertMapTiles(`weather ${resolution}`, map.data, map.resolution);
  }
});

check('the procedural cirrus mask is periodic and contains veil, fibre and clear sky', () => {
  const map = cirrusMap.createCloudCirrusMapData({ width: 128, height: 128, seed: 7 });
  const red = channelAt(map.data, 0);
  assert.ok(red.some((value) => value === 0), 'cirrus has no genuinely clear texels.');
  assert.ok(red.some((value) => value > 192), 'cirrus has no bright fibres.');
  assert.ok(map.mean > 0.05 && map.mean < 0.8, `cirrus mean ${map.mean} is degenerate.`);
  let worst = 0;
  for (let sample = 0; sample < 2000; sample += 1) {
    const u = (sample * 0.37) % 1;
    const v = (sample * 0.11) % 1;
    const density = cirrusMap.sampleCloudCirrusDensity(map.fieldSeed, u, v);
    worst = Math.max(worst, Math.abs(
      density - cirrusMap.sampleCloudCirrusDensity(map.fieldSeed, u + 1, v),
    ));
    worst = Math.max(worst, Math.abs(
      density - cirrusMap.sampleCloudCirrusDensity(map.fieldSeed, u, v + 1),
    ));
  }
  assert.ok(worst < 1e-12, `cirrus is not periodic: max delta ${worst}.`);
});

check('every sampler wraps on every axis and follows its intentional mip policy', () => {
  // wrapR defaults to ClampToEdge, which puts a seam in the sky that reads as a
  // shader bug; and a raymarch has no coherent derivative, so an implicit mip
  // selection inside the march dissolves the field.
  const volumes = [
    ['base shape', baseShapeVolume.getCloudBaseShapeVolume({ dims: 16, seed: 5 })],
    ['erosion', erosionVolume.getCloudErosionVolume({ dims: 16, seed: 5 })],
    ['curl', curlNoise.getCurlNoiseVolume({ dims: 16, seed: 5 })],
  ];
  for (const [label, texture] of volumes) {
    for (const axis of ['wrapS', 'wrapT', 'wrapR']) {
      assert.equal(texture[axis], THREE.RepeatWrapping, `${label}.${axis}`);
    }
    assert.equal(texture.generateMipmaps, false, `${label} GPU mip generation must stay disabled.`);
    assert.equal(
      texture.minFilter,
      label === 'base shape' ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      `${label}.minFilter`,
    );
    if (label === 'base shape') {
      assert.equal(texture.mipmaps.length, 5, 'base shape must publish its 16^3→1^3 mip descriptors.');
      assert.equal(
        texture.userData.toonlabVolumeMipChain.levels.length,
        5,
        'base shape must retain every authored mip payload for WebGPU upload.',
      );
    }
    assert.equal(texture.colorSpace, THREE.NoColorSpace, `${label}.colorSpace`);
  }
  const map = weatherMap.getWeatherMap({ resolution: 256, seed: 5 });
  assert.equal(map.wrapS, THREE.RepeatWrapping);
  assert.equal(map.wrapT, THREE.RepeatWrapping);
  assert.equal(map.generateMipmaps, false);
  const cirrus = cirrusMap.getCloudCirrusMap({ width: 128, height: 64, seed: 5 });
  assert.equal(cirrus.wrapS, THREE.RepeatWrapping);
  assert.equal(cirrus.wrapT, THREE.RepeatWrapping);
  assert.equal(cirrus.generateMipmaps, true);
  assert.equal(cirrus.colorSpace, THREE.NoColorSpace);
  // The caches are keyed by configuration, so a tier switch back pays nothing.
  assert.equal(weatherMap.getWeatherMap({ resolution: 256, seed: 5 }), map);
  assert.equal(cirrusMap.getCloudCirrusMap({ width: 128, height: 64, seed: 5 }), cirrus);
  assert.equal(baseShapeVolume.getCloudBaseShapeVolume({ dims: 16, seed: 5 }), volumes[0][1]);
});

check('every baked byte is a finite integer in 0..255', () => {
  const bakes = [
    ['base-shape 8^3', baseShapeVolume.createCloudBaseShapeData({ dims: 8, seed: 3 }).data],
    ['base-shape 64^3', baseShapeVolume.createCloudBaseShapeData({ dims: 64, seed: 3 }).data],
    ['erosion 32^3', erosionVolume.createCloudErosionData({ dims: 32, seed: 3 }).data],
    ['curl 32^3', curlNoise.createCurlNoiseData({ dims: 32, seed: 3 }).data],
    ['cirrus 128', cirrusMap.createCloudCirrusMapData({ width: 128, height: 128, seed: 3 }).data],
    ['weather 1024', weatherMap.createWeatherMapData({ resolution: 1024, seed: 3 }).data],
  ];
  for (const [label, data] of bakes) {
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        assert.fail(`${label}: byte ${index} is ${value}.`);
      }
    }
  }
  // The curl A channel must be exactly the length of the vector RGB decodes to,
  // and nothing may sit at an encoding limit: a clipped |curl| is no longer the
  // length of the RGB it ships with.
  const curl = curlNoise.createCurlNoiseData({ dims: 32, seed: 3 });
  assert.equal(curl.clippedTexels, 0, 'the curl encoding clips.');
  let worst = 0;
  for (let index = 0; index < curl.data.length; index += 4) {
    const x = (curl.data[index] / 255) * 2 - 1;
    const y = (curl.data[index + 1] / 255) * 2 - 1;
    const z = (curl.data[index + 2] / 255) * 2 - 1;
    worst = Math.max(worst, Math.abs((curl.data[index + 3] / 255) - Math.min(Math.hypot(x, y, z), 1)));
  }
  // Two independent 8-bit quantizations, so twice one step is the honest bound.
  assert.ok(worst <= 2 / 255, `curl A disagrees with |decode(rgb)| by ${worst}.`);
});

// ===========================================================================
section('8. the 8-cubed volume floor');
// ===========================================================================

const FLOOR = noiseVolume.NOISE_VOLUME_MIN_DIM;

check('the spec floor is the code floor', () => {
  const published = /Floor every resolved volume at \*\*(\d+)³\*\*/.exec(spec);
  assert.ok(published, `${SPEC_PATH}: the volume floor is not stated.`);
  assert.equal(FLOOR, Number(published[1]));
  assert.equal(baseShapeVolume.CLOUD_BASE_SHAPE_MIN_DIM, Number(published[1]));
  assert.equal(skyQualityTiers.QUALITY_LEVEL_FIELDS.baseShapeDims.min, Number(published[1]));
  assert.equal(baseShapeVolume.CLOUD_BASE_SHAPE_MASTER_DIM, 64);
});

// Each entry point gets its own sub-floor size, because the diagnostic is
// deduplicated per distinct configuration — sharing a size between two entry
// points would silence the second one and prove nothing about it.
check('a clamp to the floor warns, at every entry point that can resolve a volume', () => {
  const entryPoints = [
    [1, 'resolveNoiseDims', () => noiseVolume.resolveNoiseDims(1)],
    [2, 'createCloudBaseShapeData', () => baseShapeVolume.createCloudBaseShapeData({ dims: 2, seed: 1 }).dims],
    [3, 'createCloudErosionData', () => erosionVolume.createCloudErosionData({ dims: 3, seed: 1 }).dims],
    [4, 'createCurlNoiseData', () => curlNoise.createCurlNoiseData({ dims: 4, seed: 1 }).dims],
    [5, 'getCloudBaseShapeVolume', () => baseShapeVolume.getCloudBaseShapeVolume({ dims: 5, seed: 1 }).image],
    [6, 'getCloudErosionVolume', () => erosionVolume.getCloudErosionVolume({ dims: 6, seed: 1 }).image],
    [7, 'getCurlNoiseVolume', () => curlNoise.getCurlNoiseVolume({ dims: 7, seed: 1 }).image],
  ];
  for (const [size, label, resolve] of entryPoints) {
    const attempt = watch(resolve);
    const dims = attempt.value;
    for (const axis of [dims.x ?? dims.width, dims.y ?? dims.height, dims.z ?? dims.depth]) {
      assert.equal(axis, FLOOR, `${label} resolved ${size} to ${axis}, not the ${FLOOR} floor.`);
    }
    assert.ok(
      attempt.warnings.some((warning) => warning.includes(`${FLOOR}-texel floor`)),
      `${label} clamped ${size} to ${FLOOR} silently.`,
    );
  }
  // The diagnostic is deduplicated per configuration on purpose: a lab bound to
  // a slider re-bakes on every drag, and a warning repeated a hundred times
  // buries the first one.
  const repeat = watch(() => noiseVolume.resolveNoiseDims(1));
  assert.deepEqual(repeat.warnings, []);
});

check('no entry point can resolve a volume below the floor', () => {
  const below = [1, 2, 3, 4, 5, 6, 7, 0, -8, 0.5, null, '', false, [], {}, 'abc', NaN];
  for (const request of below) {
    const dims = noiseVolume.resolveNoiseDims(request, 64);
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(dims[axis] >= FLOOR, `resolveNoiseDims(${describeJunk(request)}).${axis} = ${dims[axis]}`);
    }
  }
  // Array and object forms, including an anisotropic request that is only short
  // on one axis.
  assert.deepEqual(noiseVolume.resolveNoiseDims([4, 64, 64]), { x: FLOOR, y: 64, z: 64 });
  assert.deepEqual(noiseVolume.resolveNoiseDims({ x: 3, y: 64, z: 64 }), { x: FLOOR, y: 64, z: 64 });
  assert.deepEqual(noiseVolume.resolveNoiseDims({ x: 4, y: 4, z: 4 }), { x: FLOOR, y: FLOOR, z: FLOOR });
  for (const dims of [1, 4, 7, { x: 2, y: 64, z: 64 }]) {
    const base = baseShapeVolume.createCloudBaseShapeData({ dims, seed: 1 });
    assert.ok(Math.min(base.dims.x, base.dims.y, base.dims.z) >= FLOOR, 'base shape baked below the floor.');
    assert.equal(base.data.length, base.dims.x * base.dims.y * base.dims.z * 4);
    const erosion = erosionVolume.createCloudErosionData({ dims, seed: 1 });
    assert.ok(Math.min(erosion.dims.x, erosion.dims.y, erosion.dims.z) >= FLOOR, 'erosion baked below the floor.');
    const curl = curlNoise.createCurlNoiseData({ dims, seed: 1 });
    assert.ok(Math.min(curl.dims.x, curl.dims.y, curl.dims.z) >= FLOOR, 'curl baked below the floor.');
  }
  for (const [label, texture] of [
    ['base shape', baseShapeVolume.getCloudBaseShapeVolume({ dims: 2, seed: 2 })],
    ['erosion', erosionVolume.getCloudErosionVolume({ dims: 2, seed: 2 })],
    ['curl', curlNoise.getCurlNoiseVolume({ dims: 2, seed: 2 })],
  ]) {
    const { depth, height, width } = texture.image;
    assert.ok(Math.min(width, height, depth) >= FLOOR, `${label} cache returned ${width}x${height}x${depth}.`);
  }
});

check('the mip path counts from the 64-cubed master plan and floors at 8', () => {
  // Spec: the level is relative to the 64-cubed master plan, never to a tier's
  // already-reduced baseShapeDims — a level-3 shift on a 16-cubed tier volume
  // would yield 2-cubed, which is not a cloud field.
  for (const tier of TIER_NAMES) {
    const config = skyQualityTiers.resolveQuality(tier);
    for (const level of [config.cloudShadowMipLevel, config.envMapMipBase]) {
      const dims = baseShapeVolume.cloudBaseShapeDimsForMip(config.baseShapeDims, level);
      const master = Math.floor(baseShapeVolume.CLOUD_BASE_SHAPE_MASTER_DIM / 2 ** level);
      const want = Math.max(FLOOR, Math.min(config.baseShapeDims.x, master));
      assert.deepEqual({ x: dims.x, y: dims.y, z: dims.z }, { x: want, y: want, z: want },
        `tier ${tier} at mip ${level}`);
      assert.ok(dims.x >= FLOOR);
    }
  }
  for (const level of [4, 5, 8, 30, 100]) {
    const attempt = watch(() => baseShapeVolume.cloudBaseShapeDimsForMip(64, level));
    assert.equal(attempt.value.x, FLOOR, `mip ${level} of 64^3`);
    assert.ok(
      attempt.warnings.some((warning) => warning.includes('below the')),
      `mip ${level} clamped to ${FLOOR} silently.`,
    );
  }
  // `64 >> 32` is 64 in JavaScript: the shift operand is masked to five bits, so
  // a wild level once resolved the full master volume instead of the floor.
  assert.equal(baseShapeVolume.cloudBaseShapeDimsForMip(64, 32).x, FLOOR);
  // A coarser read must never cost more than the volume it stands in for.
  assert.equal(baseShapeVolume.cloudBaseShapeDimsForMip(16, 0).x, 16);
});

check('the tier override path cannot reach below the floor', () => {
  for (const request of [1, 2, 4, 6, 7, -1, 0]) {
    const attempt = watch(() => skyQualityTiers.resolveQuality('low', { baseShapeDims: request }));
    assert.equal(attempt.value.baseShapeDims.x, 16, `baseShapeDims ${request} must keep the tier value.`);
    assert.ok(
      attempt.warnings.some((warning) => warning.includes('baseShapeDims')),
      `rejecting baseShapeDims ${request} must be reported.`,
    );
  }
  assert.equal(skyQualityTiers.resolveQuality('low', { baseShapeDims: 8 }).baseShapeDims.x, FLOOR);
  const anisotropic = watch(() => skyQualityTiers.resolveQuality('low', {
    baseShapeDims: { x: 4, y: 64, z: 64 },
  }));
  assert.deepEqual(
    { ...anisotropic.value.baseShapeDims },
    { x: 16, y: 64, z: 64 },
    'a short axis must fall back to the tier value, not bake an 8-texel axis.',
  );
  assert.ok(anisotropic.warnings.some((warning) => warning.includes('baseShapeDims.x')));
});

// ===========================================================================
section('9. sun and moon geometry');
// ===========================================================================

const LATITUDES = [0, 45, -35, 90];
const elevationOf = (direction) => sunDriver.elevationOf(direction);
const azimuthOf = (direction) => sunDriver.azimuthOf(direction);
const bearingDelta = (a, b) => {
  let delta = (a - b) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};
const angleBetween = (a, b) => Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * (180 / Math.PI);
const ANGLE_TOLERANCE = 1e-6;

check('the sun rises due east at time 0.25 at every latitude', () => {
  for (const latitude of LATITUDES) {
    const direction = sunDriver.sunDirectionAt(0.25, latitude, 0);
    assert.ok(Math.abs(elevationOf(direction)) < ANGLE_TOLERANCE,
      `latitude ${latitude}: elevation ${elevationOf(direction)} at t=0.25`);
    assert.ok(Math.abs(bearingDelta(azimuthOf(direction), 90)) < ANGLE_TOLERANCE,
      `latitude ${latitude}: azimuth ${azimuthOf(direction)} at t=0.25, want 90 (due east)`);
  }
});

check('the noon sun peaks at 90 - |latitude|, transiting the meridian', () => {
  for (const latitude of LATITUDES) {
    const direction = sunDriver.sunDirectionAt(0.5, latitude, 0);
    assert.ok(
      Math.abs(elevationOf(direction) - (90 - Math.abs(latitude))) < ANGLE_TOLERANCE,
      `latitude ${latitude}: noon elevation ${elevationOf(direction)}, want ${90 - Math.abs(latitude)}`,
    );
    // The transit swings to due north in the southern hemisphere, which is why
    // the formula is written against |latitude| and never the raw value.
    if (Math.abs(latitude) > 1e-9 && Math.abs(latitude) < 90) {
      const want = latitude > 0 ? 180 : 0;
      assert.ok(Math.abs(bearingDelta(azimuthOf(direction), want)) < ANGLE_TOLERANCE,
        `latitude ${latitude}: transit bearing ${azimuthOf(direction)}, want ${want}`);
    }
  }
  // Midnight is the same angle below the horizon: the arc is the equinox arc.
  for (const latitude of LATITUDES) {
    const direction = sunDriver.sunDirectionAt(0, latitude, 0);
    assert.ok(Math.abs(elevationOf(direction) + (90 - Math.abs(latitude))) < ANGLE_TOLERANCE,
      `latitude ${latitude}: midnight elevation ${elevationOf(direction)}`);
  }
});

check('the sun sets due west at time 0.75 at every latitude', () => {
  for (const latitude of LATITUDES) {
    const direction = sunDriver.sunDirectionAt(0.75, latitude, 0);
    assert.ok(Math.abs(elevationOf(direction)) < ANGLE_TOLERANCE,
      `latitude ${latitude}: elevation ${elevationOf(direction)} at t=0.75`);
    assert.ok(Math.abs(bearingDelta(azimuthOf(direction), 270)) < ANGLE_TOLERANCE,
      `latitude ${latitude}: azimuth ${azimuthOf(direction)} at t=0.75, want 270 (due west)`);
  }
});

check('the moon is the exact antipode of the sun, at every time and latitude', () => {
  let worst = 0;
  for (const latitude of LATITUDES) {
    for (let step = 0; step < 240; step += 1) {
      const time = step / 240;
      const sun = sunDriver.sunDirectionAt(time, latitude, 0);
      const moon = sunDriver.moonDirectionAt(time, latitude, 0);
      worst = Math.max(worst, Math.abs(angleBetween(sun, moon) - 180));
    }
  }
  assert.ok(worst < ANGLE_TOLERANCE, `the moon is ${worst} degrees off antipodal.`);
});

check('at the poles the sun circles the horizon and nothing goes non-finite', () => {
  for (const latitude of [90, -90]) {
    let worst = 0;
    for (let step = 0; step < 48; step += 1) {
      const direction = sunDriver.sunDirectionAt(step / 48, latitude, 0);
      assert.ok([direction.x, direction.y, direction.z].every(Number.isFinite),
        `latitude ${latitude}: non-finite direction at t=${step / 48}`);
      worst = Math.max(worst, Math.abs(elevationOf(direction)));
    }
    assert.ok(worst < 1e-9, `latitude ${latitude}: the sun leaves the horizon by ${worst} degrees.`);
  }
});

check('the live driver agrees with the closed-form solver and keeps the moon opposite', () => {
  for (const latitude of LATITUDES) {
    for (const time of [0, 0.25, 0.5, 0.75, 0.123, 0.877]) {
      const clock = timeOfDay.createTimeOfDay({
        time, latitude, azimuth: 0, autoAdvanceSecondsPerDay: 600,
      });
      const sun = sunDriver.createSun();
      const state = sunDriver.createSunDriver({ sun, timeOfDay: clock }).apply();
      const want = sunDriver.sunDirectionAt(time, latitude, 0);
      assert.ok(angleBetween(want, sun.direction.value) < ANGLE_TOLERANCE,
        `driver latitude ${latitude} t=${time} left the solved arc.`);
      assert.ok(
        Math.abs(angleBetween(sun.direction.value, clock.moonDirection.value) - 180) < ANGLE_TOLERANCE,
        `driver latitude ${latitude} t=${time}: the moon is not antipodal.`,
      );
      assert.ok(Math.abs(state.sunElevationDeg - elevationOf(sun.direction.value)) < ANGLE_TOLERANCE);
      const styleWeights = sunDriver.timeStyleWeightsFor(sun.direction.value.y, time);
      assert.equal(clock.morningLight.value, styleWeights.morning);
      assert.equal(clock.eveningLight.value, styleWeights.evening);
      assert.equal(clock.skyDarkness.value, styleWeights.night);
      assert.equal(state.time, time);
    }
  }
});

check('time styling is isolated to morning, evening, and night', () => {
  for (const [label, elevation, time, active] of [
    ['morning', 3, 0.26, 'morning'],
    ['midday', 65, 0.5, null],
    ['afternoon', 40, 0.625, null],
    ['evening', 3, 0.74, 'evening'],
    ['night', -65, 0, 'night'],
  ]) {
    const weights = sunDriver.timeStyleWeightsFor(Math.sin(elevation * Math.PI / 180), time);
    for (const key of ['morning', 'evening', 'night']) {
      if (key === active) assert.ok(weights[key] > 0, `${label}: ${key} must be active`);
      else assert.equal(weights[key], 0, `${label}: ${key} leaked with weight ${weights[key]}`);
    }
  }
});

check('the standing sun pose is the default clock pose, sign included', () => {
  // The spec publishes no sun.elevation / sun.azimuth default because the clock
  // owns the direction, so the code's standing pose is checked against the arc.
  const direction = sunDriver.sunDirectionAt(
    timeOfDay.DEFAULT_TIME_OF_DAY_PARAMS.time,
    timeOfDay.DEFAULT_TIME_OF_DAY_PARAMS.latitude,
    timeOfDay.DEFAULT_TIME_OF_DAY_PARAMS.azimuth,
  );
  assert.ok(Math.abs(elevationOf(direction) - sunDriver.DEFAULT_SUN_PARAMS.elevation) < ANGLE_TOLERANCE);
  assert.ok(
    Math.abs(bearingDelta(azimuthOf(direction), sunDriver.DEFAULT_SUN_PARAMS.azimuth)) < ANGLE_TOLERANCE,
  );
  // A direction solved on the meridian carries a signed zero in x, and atan2
  // reads -0 as the negative branch: a driven northern transit would report
  // -180 where the identical pose built from angles reads +180.
  const driven = sunDriver.createSunDriver({
    sun: sunDriver.createSun(), timeOfDay: timeOfDay.createTimeOfDay({}),
  }).apply();
  assert.ok(!Object.is(driven.sunAzimuthDeg, -180), 'the driver leaked a signed zero into the bearing.');
  assert.equal(driven.sunAzimuthDeg, sunDriver.DEFAULT_SUN_PARAMS.azimuth);
});

check('moon phase illumination is correct before any driver exists', () => {
  for (const [phase, illumination] of [[0, 0], [0.25, 0.5], [0.5, 1], [0.75, 0.5], [1, 0]]) {
    const clock = timeOfDay.createTimeOfDay({ moon: { phase } });
    assert.ok(Math.abs(clock.moonPhaseIllumination.value - illumination) < 1e-9,
      `phase ${phase}: illumination ${clock.moonPhaseIllumination.value}, want ${illumination}`);
  }
});

// ===========================================================================
section('10. robustness against hostile input');
// ===========================================================================

check('the atmosphere LUTs are finite, and transmittance is inside [0, 1]', () => {
  // Read through the module's own accessor and the Float32Array the bake wrote.
  // `transmittanceTexture.image.data` is a Uint16Array of half-float BIT
  // PATTERNS — see the header note.
  const grid = [];
  for (const rayleigh of [0, 1, 3]) {
    for (const turbidity of [1, 15]) {
      for (const groundAlbedo of [[0, 0, 0], [1, 1, 1]]) grid.push({ groundAlbedo, rayleigh, turbidity });
    }
  }
  grid.push({ groundAlbedo: [0.18, 0.17, 0.15], rayleigh: 1, turbidity: 3.3 });
  for (const medium of grid) {
    const scattering = atmosphereScattering.createAtmosphereScattering({
      params: atmosphereParams.createAtmosphereParams(medium),
    });
    scattering.bakeIfNeeded();
    const label = `rayleigh ${medium.rayleigh} turbidity ${medium.turbidity} albedo [${medium.groundAlbedo}]`;
    for (let index = 0; index < scattering.transmittanceData.length; index += 1) {
      const value = scattering.transmittanceData[index];
      assert.ok(Number.isFinite(value), `transmittance[${index}] is ${value} at ${label}.`);
      assert.ok(value >= 0 && value <= 1, `transmittance[${index}] is ${value} at ${label}.`);
    }
    for (let index = 0; index < scattering.multiScatteringData.length; index += 1) {
      const value = scattering.multiScatteringData[index];
      assert.ok(Number.isFinite(value) && value >= 0,
        `multiScattering[${index}] is ${value} at ${label}.`);
    }
    scattering.dispose();
  }
  const reference = atmosphereScattering.createAtmosphereScattering({
    params: atmosphereParams.createAtmosphereParams({}),
  });
  reference.bakeIfNeeded();
  // The accessor is the honest read of the table: same bilinear tap as the
  // shader, on the floats the bake produced.
  for (const altitude of [0, 1, 10, 60]) {
    for (const mu of [-1, -0.5, 0, 0.5, 1]) {
      const sample = reference.transmittanceAt(altitude, mu);
      for (const [channel, value] of sample.entries()) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1,
          `transmittanceAt(${altitude}, ${mu})[${channel}] is ${value}.`);
      }
    }
  }
  // Rayleigh removes short wavelengths hardest, so a zenith ray transmits more
  // red than green than blue. A table that lost its wavelength dependence would
  // still be inside [0, 1].
  const zenith = reference.transmittanceAt(0, 1);
  assert.ok(zenith[0] > zenith[1] && zenith[1] > zenith[2],
    `the ground-zenith transmittance is not wavelength-ordered: (${zenith}).`);
  // The upload is half float, and the raw buffer is bit patterns. Asserted so a
  // future range check cannot quietly read 0x3C00 as the number 15360.
  const raw = reference.transmittanceTexture.image.data;
  assert.ok(raw instanceof Uint16Array, 'the LUT upload is no longer half float.');
  assert.equal(reference.transmittanceTexture.type, THREE.HalfFloatType);
  assert.equal(THREE.DataUtils.fromHalfFloat(0x3c00), 1);
  assert.ok(raw.includes(0x3c00), 'the raw half-float buffer no longer contains 1.0 as 0x3C00.');
  let decodedMax = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const value = THREE.DataUtils.fromHalfFloat(raw[index]);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1,
      `the decoded transmittance texel ${index} is ${value}.`);
    decodedMax = Math.max(decodedMax, value);
  }
  assert.equal(decodedMax, 1);
  reference.dispose();
});

check('unreadable input holds every live cloud parameter, and never zeroes one', () => {
  const params = cloudParams.createCloudParams(AUTHORED_CLOUD);
  const before = plainParams(params.toParams());
  for (const junk of UNREADABLE) {
    for (const id of cloudParams.CLOUD_PARAM_GROUP_IDS) {
      const block = Object.fromEntries(Object.keys(params[id].toParams()).map((key) => [key, junk]));
      params[id].applyParams(block);
    }
    assert.deepEqual(plainParams(params.toParams()), before, `${describeJunk(junk)} moved a cloud parameter.`);
  }
  // Whole-block junk too, at both the group and the container level.
  for (const junk of UNREADABLE) {
    params.applyParams(junk);
    for (const id of cloudParams.CLOUD_PARAM_GROUP_IDS) params[id].applyParams(junk);
    assert.deepEqual(plainParams(params.toParams()), before, `${describeJunk(junk)} as a block moved a parameter.`);
  }
});

check('a real 0 lands on each field minimum, never on a forbidden 0', () => {
  const params = cloudParams.createCloudParams(AUTHORED_CLOUD);
  for (const id of cloudParams.CLOUD_PARAM_GROUP_IDS) {
    const block = Object.fromEntries(Object.keys(params[id].toParams()).map((key) => [key, ZERO]));
    params[id].applyParams(block);
  }
  const zeroed = params.toParams();
  for (const id of cloudParams.CLOUD_PARAM_GROUP_IDS) {
    for (const [key, field] of Object.entries(cloudParams.CLOUD_PARAMS_FIELD_SCHEMA[id])) {
      if (field.derived || field.type === 'color') continue;
      const value = zeroed[id][key];
      assert.equal(value, paramSchema.clampNumber(field, 0), `cloud.${id}.${key} after 0`);
      if (field.limit.min > 0) {
        assert.ok(value > 0,
          `cloud.${id}.${key} accepted 0 despite a minimum of ${field.limit.min}; it divides.`);
      }
    }
  }
  assertAllFinite(zeroed, 'cloud');
  // Same through the document layer, where a 0 is a legitimate authored value.
  const document = skyParams.createSkyParams(junkTree(skyParams.SKY_PARAMS_FIELD_SCHEMA, () => ZERO));
  assertAllFinite(document, 'SkyParams');
  walkSchemaFields(skyParams.SKY_PARAMS_FIELD_SCHEMA, document, (path, field, value) => {
    if (field.type !== 'number' || field.derived) return;
    if (field.limit.min > 0) assert.ok(value > 0, `${path} accepted 0 below its minimum ${field.limit.min}.`);
  });
});

check('unreadable input holds the whole SkyParams envelope', () => {
  const authored = skyParams.createSkyParams(AUTHORED_SKY);
  const expected = plainParams(authored);
  for (const junk of UNREADABLE) {
    const leaves = skyParams.createSkyParams(
      junkTree(skyParams.SKY_PARAMS_FIELD_SCHEMA, (field) => junkForField(field, junk)),
      authored,
    );
    assert.deepEqual(plainParams(leaves), expected, `${describeJunk(junk)} moved a SkyParams leaf.`);
    // Junk whole blocks, and a junk document, must fall back rather than break.
    const blocks = skyParams.createSkyParams(
      Object.fromEntries(skyParams.SKY_PARAMS_BLOCK_IDS.map((id) => [id, junk])),
      authored,
    );
    assert.deepEqual(plainParams(blocks), expected, `${describeJunk(junk)} as a block moved a leaf.`);
    const whole = skyParams.validateSkyParams(junk, authored);
    assertAllFinite(whole.value ?? {}, 'SkyParams');
    if (whole.ok) assert.deepEqual(plainParams(whole.value), expected);
    const document = skyParams.validateSkyParamsDocument(junk);
    assert.equal(document.ok, false, `a ${describeJunk(junk)} document must be rejected, not accepted.`);
    assert.ok(document.errors.length > 0);
  }
});

check('unreadable input holds the atmosphere, sun and clock groups', () => {
  const atmosphere = atmosphereParams.createAtmosphereParams(AUTHORED_SKY.atmosphere);
  const atmosphereBefore = plainParams(atmosphere.toParams());
  const sun = sunDriver.createSun(AUTHORED_SKY.sun);
  const sunBefore = plainParams(sun.toParams());
  const clock = timeOfDay.createTimeOfDay(AUTHORED_SKY.time);
  const clockBefore = plainParams(clock.toParams());
  for (const junk of UNREADABLE) {
    const atmosphereBlock = Object.fromEntries(
      atmosphereParams.ATMOSPHERE_PARAM_KEYS.map((key) => [key, junk]),
    );
    atmosphere.applyParams(atmosphereBlock);
    // A colour whose channels are individually unreadable must hold too.
    atmosphere.applyParams({ groundAlbedo: [junk, junk, junk] });
    assert.deepEqual(plainParams(atmosphere.toParams()), atmosphereBefore,
      `${describeJunk(junk)} moved an atmosphere parameter.`);
    assert.ok(atmosphere.fogFarFadeEnd.value > atmosphere.fogFarFadeStart.value,
      `${describeJunk(junk)} inverted the far-fade band.`);

    sun.applyParams({
      elevation: junk,
      azimuth: junk,
      intensity: junk,
      discSize: junk,
      color: junk,
    });
    sun.applyParams({ color: [junk, junk, junk] });
    assert.deepEqual(plainParams(sun.toParams()), sunBefore, `${describeJunk(junk)} moved a sun parameter.`);
    assertAllFinite(sun.direction.value.toArray(), 'sun.direction');

    clock.applyParams({
      time: junk,
      autoAdvanceSecondsPerDay: junk,
      latitude: junk,
      azimuth: junk,
      moon: {
        phase: junk,
        intensity: junk,
        discBrightness: junk,
        angularSize: junk,
        ambient: junk,
        color: junk,
      },
    });
    assert.deepEqual(plainParams(clock.toParams()), clockBefore, `${describeJunk(junk)} moved the clock.`);
    const folded = clock.foldTime();
    assert.ok(folded >= 0 && folded < 1, `${describeJunk(junk)} put the clock at ${folded}.`);
  }
  // A junk write straight into the uniform holds the last readable reading
  // rather than snapping the whole sky to noon.
  const scrubbed = timeOfDay.createTimeOfDay({ time: 0.85 });
  scrubbed.time.value = NaN;
  assert.equal(scrubbed.foldTime(), 0.85);
  scrubbed.time.value = 1e300;
  assert.equal(scrubbed.foldTime(), 0.85);
});

check('a junk whole argument holds the sun, clock and atmosphere groups, and is reported', () => {
  // The checks above hand junk to individual FIELD SLOTS and to whole BLOCKS.
  // This is the whole ARGUMENT, which is where these three used to be alone in
  // throwing: `next.elevation !== undefined` dereferences null, `'rayleigh' in
  // next` throws on every non-object there is, and the `params = {}` default
  // only fires for `undefined`, so the factories took the same TypeError as the
  // setters. A preset that failed to load, a `JSON.parse` of "null" and a
  // cleared host field all arrive as exactly this, and none of them may take the
  // sky down — nor move it. The sibling layers (cloudParams, skyParams) have
  // always fallen back to an empty block and reported the shape; these now do.
  const groups = [
    ['[sunDriver]', (params) => sunDriver.createSun(params), AUTHORED_SKY.sun],
    ['[timeOfDay]', (params) => timeOfDay.createTimeOfDay(params), AUTHORED_SKY.time],
    ['[atmosphereParams]', (params) => atmosphereParams.createAtmosphereParams(params),
      AUTHORED_SKY.atmosphere],
  ];
  for (const [scope, create, authored] of groups) {
    const defaults = plainParams(create(undefined).toParams());
    const group = create(authored);
    const before = plainParams(group.toParams());
    // Otherwise a fixture that happened to equal the defaults would make every
    // "held its values" assertion below pass without holding anything.
    assert.notDeepEqual(before, defaults, `${scope} the authored fixture is the default tree.`);
    for (const junk of UNREADABLE) {
      const built = watch(() => create(junk));
      assert.deepEqual(
        plainParams(built.value.toParams()),
        defaults,
        `${scope} construction from ${describeJunk(junk)} did not fall back to the defaults.`,
      );
      const applied = watch(() => group.applyParams(junk));
      assert.deepEqual(
        plainParams(group.toParams()),
        before,
        `${scope} applyParams(${describeJunk(junk)}) moved a parameter.`,
      );
      assertAllFinite(plainParams(group.toParams()), scope);
      // A shape the group cannot read is reported rather than swallowed. Two
      // members of the list are not bad shapes at all and must stay silent: `{}`
      // is a legitimate empty params block, and null/undefined are what the whole
      // param layer reads as "not supplied" (paramSchema.hasValue). Everything
      // else — including `[]`, which isObject rejects — has to say so.
      const reported = paramSchema.hasValue(junk) && !paramSchema.isObject(junk);
      const names = (warnings) => warnings.some((warning) => warning.startsWith(scope));
      assert.equal(
        names(built.warnings),
        reported,
        `${scope} construction from ${describeJunk(junk)}: shape ${reported ? 'went unreported' : 'was reported as bad'}.`,
      );
      assert.equal(
        names(applied.warnings),
        reported,
        `${scope} applyParams(${describeJunk(junk)}): shape ${reported ? 'went unreported' : 'was reported as bad'}.`,
      );
    }
  }
  // A rejected argument must not invalidate the scattering LUTs either: a
  // re-bake for every junk apply is a frame-time cliff with nothing on screen to
  // explain it, and `mediumChanged` is only supposed to answer for a real move.
  const atmosphere = atmosphereParams.createAtmosphereParams(AUTHORED_SKY.atmosphere);
  const revision = atmosphere.bakeRevision;
  for (const junk of UNREADABLE) atmosphere.applyParams(junk);
  assert.equal(atmosphere.bakeRevision, revision, 'a junk argument re-baked the atmosphere LUTs.');
});

check('the atmosphere LUTs stay finite after hostile input', () => {
  for (const junk of [...UNREADABLE, ZERO]) {
    const params = atmosphereParams.createAtmosphereParams({});
    params.applyParams(Object.fromEntries(
      atmosphereParams.ATMOSPHERE_PARAM_KEYS.map((key) => [key, junk]),
    ));
    // A cheap bake: the assertion is about finiteness, not table fidelity.
    const scattering = atmosphereScattering.createAtmosphereScattering({
      params, multiScatteringDirections: 8, multiScatteringSteps: 8,
    });
    scattering.bakeIfNeeded();
    for (let index = 0; index < scattering.transmittanceData.length; index += 1) {
      assert.ok(Number.isFinite(scattering.transmittanceData[index]),
        `transmittance went non-finite after ${describeJunk(junk)}.`);
    }
    for (let index = 0; index < scattering.multiScatteringData.length; index += 1) {
      assert.ok(Number.isFinite(scattering.multiScatteringData[index]),
        `multiScattering went non-finite after ${describeJunk(junk)}.`);
    }
    scattering.dispose();
  }
});

check('the sky dome holds its ground level against unreadable input', () => {
  const params = atmosphereParams.createAtmosphereParams({});
  const scattering = atmosphereScattering.createAtmosphereScattering({
    params, multiScatteringDirections: 8, multiScatteringSteps: 8,
  });
  const dome = atmosphereDome.createAtmosphereDome({
    params, scattering, sun: sunDriver.createSun(),
  });
  for (const junk of UNREADABLE) {
    dome.groundLevel = 7.5;
    dome.groundLevel = junk;
    assert.equal(dome.groundLevel, 7.5,
      `${describeJunk(junk)} moved the ground plane, and with it the horizon.`);
  }
  dome.groundLevel = '12.5';
  assert.equal(dome.groundLevel, 12.5, 'a numeric string is what a lab input carries.');
  dome.dispose();
  scattering.dispose();
});

check('the noise generators clamp hostile input into range and still bake', () => {
  for (const junk of [...UNREADABLE, ZERO]) {
    const profile = weatherMap.createWeatherMapProfile(Object.fromEntries(
      Object.keys(weatherMap.WEATHER_MAP_PROFILE_FIELDS).map((key) => [key, junk]),
    ));
    for (const [key, value] of Object.entries(profile)) {
      const { range } = weatherMap.WEATHER_MAP_PROFILE_FIELDS[key];
      assert.ok(Number.isFinite(value), `profile.${key} is ${value} for ${describeJunk(junk)}.`);
      assert.ok(value >= range.min && value <= range.max,
        `profile.${key} is ${value}, outside [${range.min}, ${range.max}].`);
    }
    const map = weatherMap.createWeatherMapData({ profile, resolution: 256, seed: junk });
    assert.ok(weatherMap.WEATHER_MAP_RESOLUTIONS.includes(map.resolution));
    assert.ok(Number.isFinite(map.coverageMean) && map.coverageMean >= 0 && map.coverageMean <= 1);
    assert.equal(map.data.length, 256 * 256 * 4);
    // Whole-object junk, not just junk leaves.
    const bare = weatherMap.createWeatherMapProfile(junk);
    assert.deepEqual(bare, weatherMap.WEATHER_MAP_PROFILE_DEFAULTS,
      `createWeatherMapProfile(${describeJunk(junk)}) must return the defaults.`);
    assertAllFinite(skyQualityTiers.resolveQuality(junk, junk), 'quality');
    assertAllFinite(baseShapeVolume.cloudBaseShapeDimsForMip(junk, junk), 'mip dims');
  }
});

// ===========================================================================
section('11. the five regressions that let a document disagree with its output');
// ===========================================================================

check('a weather-map resolution snaps to the legal set on every path', () => {
  const legal = weatherMap.WEATHER_MAP_RESOLUTIONS;
  assert.deepEqual(
    [...skyParams.SKY_PARAMS_FIELD_SCHEMA.noise.weather.resolution.options],
    [...legal],
    'the document schema must constrain resolution to the generator\'s legal set, not to a range spanning it.',
  );
  assert.deepEqual([...skyQualityTiers.QUALITY_LEVEL_FIELDS.weatherMapResolution.options], [...legal]);
  for (const request of [64, 128, 200, 384, 700, 2048, 1e9, 0, -5, null, '', 'abc', [], {}, NaN]) {
    const stored = skyParams.createSkyParams({ noise: { weather: { resolution: request } } })
      .noise.weather.resolution;
    assert.ok(legal.includes(stored), `a request of ${describeJunk(request)} stored ${stored}.`);
    // The invariant: whatever the document stores, the generator bakes exactly
    // that. A range once accepted 384 while the texture came out 256, so a
    // preset round-tripped as 384 with the pixels disagreeing and nothing said so.
    assert.equal(
      weatherMap.createWeatherMapData({ resolution: stored, seed: 1 }).resolution,
      stored,
      `the document stored ${stored} but the generator baked something else.`,
    );
    assert.equal(weatherMap.resolveWeatherMapResolution(stored), stored);
    assert.ok(legal.includes(weatherMap.resolveWeatherMapResolution(request)));
  }
  // A numeric in-between request snaps the same way on both sides, so a preset
  // and a direct bake cannot land on different textures.
  for (const request of [64, 128, 200, 384, 700, 2048]) {
    assert.equal(
      skyParams.createSkyParams({ noise: { weather: { resolution: request } } }).noise.weather.resolution,
      weatherMap.resolveWeatherMapResolution(request),
      `the document and the generator snap ${request} differently.`,
    );
  }
  // The tier field rejects an illegal value outright rather than snapping it,
  // because a tier is cost policy the author chose from a list.
  const rejected = watch(() => skyQualityTiers.resolveQuality('high', { weatherMapResolution: 384 }));
  assert.equal(rejected.value.weatherMapResolution, 1024);
  assert.ok(rejected.warnings.some((warning) => warning.includes('weatherMapResolution')));
  // A round-trip of an authored in-between value must not claim it survived.
  const document = skyParams.serializeSkyParams(
    skyParams.createSkyParams({ noise: { weather: { resolution: 384 } } }),
  );
  assert.equal(JSON.parse(document).noise.weather.resolution, 256);
});

check('fogFarFadeEnd never serializes outside its own maximum', () => {
  const limit = skyParams.SKY_PARAMS_FIELD_SCHEMA.atmosphere.fogFarFadeEnd.limit.max;
  assert.equal(limit, atmosphereParams.ATMOSPHERE_PARAM_SCHEMA.fogFarFadeEnd.range.max);
  for (const start of [0, 1000, 1e6, limit - 1, limit, limit + 1, 1e9, Infinity]) {
    const resolved = skyParams.createSkyParams({ atmosphere: { fogFarFadeStart: start } });
    const { fogFarFadeEnd, fogFarFadeStart } = resolved.atmosphere;
    assert.ok(fogFarFadeEnd <= limit, `start ${start} pushed the end to ${fogFarFadeEnd}, past ${limit}.`);
    assert.ok(fogFarFadeEnd > fogFarFadeStart, `start ${start} left the band inverted or empty.`);
    assert.equal(
      JSON.parse(skyParams.serializeSkyParams(resolved)).atmosphere.fogFarFadeEnd,
      fogFarFadeEnd,
    );
    // The pair once settled on a stable fixed point outside the schema, so it
    // never converged back in; re-applying has to be a no-op inside the range.
    assert.deepEqual(
      plainParams(skyParams.createSkyParams(resolved).atmosphere),
      plainParams(resolved.atmosphere),
      `the far-fade coupling is not idempotent at start ${start}.`,
    );
    // The owner group couples the band the same way.
    const owner = atmosphereParams.createAtmosphereParams({ fogFarFadeStart: start }).toParams();
    assert.ok(owner.fogFarFadeEnd <= limit && owner.fogFarFadeEnd > owner.fogFarFadeStart,
      `the owner group left the band at ${owner.fogFarFadeStart}/${owner.fogFarFadeEnd}.`);
  }
});

check('cloudShadowResolution and cloudShadowMipLevel are bounded by the spec', () => {
  const { rows } = specTable('### cloudShadow');
  const knobs = new Map(rows.map(([nameCell, valueCell]) => [plain(nameCell), plain(valueCell)]));
  for (const [knob, field] of [
    ['resolution', skyQualityTiers.QUALITY_LEVEL_FIELDS.cloudShadowResolution],
    ['mipLevel', skyQualityTiers.QUALITY_LEVEL_FIELDS.cloudShadowMipLevel],
  ]) {
    const published = knobs.get(knob);
    assert.ok(published, `${SPEC_PATH}: the cloudShadow ${knob} row is missing.`);
    const bounds = new RegExp(`tier-driven, (\\d+)${EN_DASH}(\\d+)`).exec(published);
    assert.ok(bounds, `${SPEC_PATH}: cloudShadow ${knob} publishes no bounds ("${published}").`);
    const [low, high] = [Number(bounds[1]), Number(bounds[2])];
    // Unbounded, an override of 4096 was accepted silently — a 16x ultra
    // allocation for the shadow bake, which nobody reaches for on purpose.
    assert.equal(field.max, high, `cloudShadow ${knob} must cap at the published ${high}.`);
    assert.ok(field.min <= low, `cloudShadow ${knob} cannot reach the published low end ${low}.`);
    for (const tier of TIER_NAMES) {
      const value = skyQualityTiers.resolveQuality(tier)[
        knob === 'resolution' ? 'cloudShadowResolution' : 'cloudShadowMipLevel'];
      assert.ok(value >= low && value <= high, `tier ${tier} ${knob} is ${value}, outside ${low}-${high}.`);
    }
  }
  for (const [key, outOfRange] of [
    ['cloudShadowResolution', [4096, 2048, 64, 0, -1]],
    ['cloudShadowMipLevel', [99, 4, -1]],
  ]) {
    const tierValue = skyQualityTiers.resolveQuality('high')[key];
    for (const request of outOfRange) {
      const attempt = watch(() => skyQualityTiers.resolveQuality('high', { [key]: request }));
      assert.equal(attempt.value[key], tierValue, `${key}: ${request} was accepted.`);
      assert.ok(
        attempt.warnings.some((warning) => warning.includes(key)),
        `${key}: rejecting ${request} must be reported.`,
      );
    }
  }
});

check('the weather-map generator default is the schema default', () => {
  // When they disagreed, "the default weather map" was two different textures
  // depending on whether you arrived through a preset or a direct bake call.
  const schemaDefault = DEFAULTS.noise.weather.resolution;
  assert.equal(weatherMap.WEATHER_MAP_DEFAULT_RESOLUTION, schemaDefault);
  assert.equal(
    skyQualityTiers.resolveQuality(skyQualityTiers.DEFAULT_QUALITY_LEVEL).weatherMapResolution,
    schemaDefault,
    'the default tier and the default preset must ask for the same coverage map.',
  );
  assert.equal(weatherMap.resolveWeatherMapResolution(), schemaDefault);
  assert.equal(weatherMap.createWeatherMapData({ seed: 1 }).resolution, schemaDefault);
  assert.equal(
    skyParams.SKY_PARAMS_FIELD_SCHEMA.noise.weather.resolution.value,
    schemaDefault,
  );
  // The profile has one definition too: the generator's.
  assert.deepEqual(weatherMap.createWeatherMapProfile(), weatherMap.WEATHER_MAP_PROFILE_DEFAULTS);
  assert.deepEqual(plainParams(DEFAULTS.noise.weather.profile), weatherMap.WEATHER_MAP_PROFILE_DEFAULTS);
});

// ---------------------------------------------------------------------------

console.warn = realWarn;

console.log(
  failures === 0
    ? `\nverify-volumetric-sky: ${checks} checks passed `
      + `(${warningLog.length} expected diagnostics captured)`
    : `\nverify-volumetric-sky: ${failures} failure(s) across ${checks + failures} checks`,
);
process.exit(failures === 0 ? 0 : 1);
