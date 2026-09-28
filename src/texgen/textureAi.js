// Natural-language -> texture-recipe mapping. Two paths share one output
// contract:
//   - buildTextureAiPrompt / compileTextureAiRecipe: prompt + response
//     handling for a small hosted LLM (Gemini Flash-Lite, GPT mini tiers).
//     The prompt is generated from the live field schema and preset list,
//     so the parameter space the model sees can never drift from the code.
//   - keywordTextureRecipe: a deterministic offline fallback (preset
//     scoring + adjective modifiers) so the prompt box works with no key.
//
// Network calls live in the lab (labs/texture-lab/ai/); this module is
// pure string/JSON work and stays headless-safe.

import {
  applyTextureSettingsPatch,
  createTextureSettings,
  flattenTextureSettings,
  hexToRgb01,
  TEXTURE_SETTING_FIELD_SCHEMA,
} from './textureSettings.js';
import { BUILT_IN_TEXTURE_PRESETS, findTexturePreset } from './texturePresets.js';
import { srgbToLinear, linearToSrgb } from './evaluateTexture.js';

// --- prompt ------------------------------------------------------------------

function fieldLine(field) {
  if (field.type === 'number') {
    return `${field.group}.${field.key} number ${field.range.min}..${field.range.max}`;
  }
  if (field.type === 'boolean') return `${field.group}.${field.key} boolean`;
  if (field.type === 'select') return `${field.group}.${field.key} one of [${field.options.join('|')}]`;
  if (field.type === 'color') return `${field.group}.${field.key} hex color`;
  return `${field.group}.${field.key}`;
}

function schemaCatalog() {
  const lines = [];
  for (const fields of Object.values(TEXTURE_SETTING_FIELD_SCHEMA)) {
    for (const field of Object.values(fields)) lines.push(fieldLine(field));
  }
  return lines.join('\n');
}

function presetCatalog() {
  return BUILT_IN_TEXTURE_PRESETS
    .map((preset) => `${preset.id}: ${preset.label} (${preset.tags.join(', ')})`)
    .join('\n');
}

const RESPONSE_CONTRACT = `Respond with ONLY a JSON object (no markdown fences, no prose):
{
  "name": "short display name for the texture",
  "basePreset": "<preset id from the catalog that is closest, or null>",
  "palette": ["#hex", ...] | null,   // 2-5 albedo ramp colors, DARKEST first -> LIGHTEST last
  "patch": { "<group.key>": value, ... } | null,   // only keys from the parameter table
  "notes": "one short sentence about the interpretation"
}
Rules:
- Prefer starting from the closest basePreset, then override only what the request changes.
- palette drives the 5-stop height ramp (crevices -> ridges). Keep a believable dark-to-light ladder.
- Layer generators drive height AND color banding. Overlays (accentA/accentB) are masked colored effects: moss, rust, grime, snow, patina, stains.
- surface.roughness: 0 mirror gloss, 1 matte. surface.metalness only for metals. emissive.* only when it should glow.
- Numbers are clamped to their documented range; unknown keys are ignored.`;

const EXAMPLES = `Example request: "old leather jacket"
Example response: {"name":"Old Leather Jacket","basePreset":"worn-leather","palette":["#170c06","#2e1a0c","#432712","#573619","#684522"],"patch":{"wear.damage":0.55,"wear.dirt":0.35,"color.saturation":0.8,"color.sheen":0.5,"surface.roughness":0.65},"notes":"Cracked grain, desaturated, scuffed with worn sheen on ridges."}

Example request: "glowing blue crystal cave wall"
Example response: {"name":"Crystal Cave Wall","basePreset":"cliff-rock","palette":["#0b1026","#15204a","#233a78","#3c62b0","#7ea6e0"],"patch":{"base.generator":"ridged","base.scale":7,"surface.roughness":0.2,"surface.roughnessContrast":-0.4,"emissive.enabled":true,"emissive.source":"crevices","emissive.color":"#3f8dff","emissive.intensity":3,"color.sheen":0.45},"notes":"Ridged rock with glowing blue crevices and glassy facets."}`;

/**
 * Builds { system, user } for a JSON-mode chat call. `mode` is 'new' or
 * 'refine'; refine embeds the current flattened settings so the model
 * patches relative to what the user already sees.
 */
export function buildTextureAiPrompt({ prompt, mode = 'new', settings = null } = {}) {
  const system = [
    'You translate material descriptions into parameters for ToonLab\'s seamless procedural texture generator (stylized/anime look).',
    '',
    'PRESET CATALOG (id: label (tags)):',
    presetCatalog(),
    '',
    'PARAMETER TABLE (path type range):',
    schemaCatalog(),
    '',
    RESPONSE_CONTRACT,
    '',
    EXAMPLES,
  ].join('\n');

  let user = `Request: ${String(prompt ?? '').trim()}`;
  if (mode === 'refine' && settings) {
    user += `\n\nThe user is REFINING this existing texture — keep its character, change only what the request asks, and set basePreset to null:\n${JSON.stringify(flattenTextureSettings(settings))}`;
  }
  return { system, user };
}

// --- response handling --------------------------------------------------------

/** Parses model text into a recipe object; tolerates markdown fences. */
export function parseTextureAiResponse(text) {
  let body = String(text ?? '').trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('The model returned no JSON object.');
  const recipe = JSON.parse(body.slice(start, end + 1));
  if (typeof recipe !== 'object' || recipe === null) throw new Error('The model returned invalid JSON.');
  return recipe;
}

/** Expands a 2..5 color palette to exactly five ramp stops (linear lerp). */
function paletteToRampPatch(palette) {
  const stops = (Array.isArray(palette) ? palette : [])
    .map((hex) => hexToRgb01(hex))
    .filter(Boolean);
  if (stops.length < 2) return null;
  const linear = stops.map((rgb) => rgb.map(srgbToLinear));
  const sample = (t) => {
    const f = t * (linear.length - 1);
    const i = Math.min(linear.length - 2, Math.floor(f));
    const k = f - i;
    return linear[i].map((c, ch) => linearToSrgb(c + (linear[i + 1][ch] - c) * k));
  };
  const patch = {};
  for (let s = 0; s < 5; s += 1) patch[`color.color${s}`] = sample(s / 4);
  return patch;
}

/**
 * Compiles a parsed AI recipe into clamped settings.
 * mode 'new' starts from recipe.basePreset (or defaults); mode 'refine'
 * starts from `currentSettings`. Returns { settings, name, notes, applied,
 * ignored, presetId }.
 */
export function compileTextureAiRecipe(recipe, { mode = 'new', currentSettings = null } = {}) {
  const preset = mode === 'new' && recipe.basePreset ? findTexturePreset(String(recipe.basePreset)) : null;
  const start = mode === 'refine' && currentSettings
    ? createTextureSettings(currentSettings)
    : createTextureSettings(preset?.settings ?? {});

  const patch = { ...(recipe.patch && typeof recipe.patch === 'object' ? recipe.patch : {}) };
  const rampPatch = paletteToRampPatch(recipe.palette);
  const merged = { ...(rampPatch ?? {}), ...patch };
  const { settings, applied, ignored } = applyTextureSettingsPatch(start, merged);
  return {
    applied,
    ignored,
    name: typeof recipe.name === 'string' && recipe.name.trim() ? recipe.name.trim() : 'AI texture',
    notes: typeof recipe.notes === 'string' ? recipe.notes : '',
    presetId: preset?.id ?? null,
    settings,
  };
}

// --- offline keyword mapper ----------------------------------------------------

function hslToRgb(h, s, l) {
  const hue = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0) => {
    let t = ((t0 % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
}

function hueLadder(h, s = 0.45) {
  const lights = [0.13, 0.28, 0.44, 0.6, 0.78];
  const patch = {};
  lights.forEach((l, i) => { patch[`color.color${i}`] = hslToRgb(h, s, l); });
  return patch;
}

const COLOR_WORDS = {
  black: () => hueLadder(0.6, 0.04),
  blue: () => hueLadder(0.6),
  brown: () => hueLadder(0.07, 0.42),
  crimson: () => hueLadder(0.98, 0.55),
  cyan: () => hueLadder(0.5),
  gold: () => ({ ...hueLadder(0.12, 0.62), 'surface.metalness': 1, 'surface.roughness': 0.25 }),
  gray: () => hueLadder(0.6, 0.05),
  green: () => hueLadder(0.33),
  grey: () => hueLadder(0.6, 0.05),
  magenta: () => hueLadder(0.87),
  orange: () => hueLadder(0.07, 0.6),
  pink: () => hueLadder(0.93, 0.5),
  purple: () => hueLadder(0.76),
  red: () => hueLadder(0.01, 0.55),
  silver: () => ({ ...hueLadder(0.58, 0.06), 'surface.metalness': 1, 'surface.roughness': 0.3 }),
  teal: () => hueLadder(0.46),
  violet: () => hueLadder(0.8),
  white: () => hueLadder(0.58, 0.05),
  yellow: () => hueLadder(0.14, 0.6),
};

const MODIFIERS = [
  {
    words: ['old', 'worn', 'aged', 'ancient', 'weathered', 'vintage', 'antique', 'ruined'],
    note: 'aged',
    patch: () => ({
      'wear.damage': 0.5, 'wear.dirt': 0.4,
      'color.saturation': 0.85, 'color.jitterValue': 0.14, 'color.sheen': 0.35, 'surface.aoStrength': 0.7,
    }),
  },
  {
    words: ['scratched', 'scuffed', 'damaged', 'battle', 'beaten', 'chipped'],
    note: 'damaged',
    patch: () => ({ 'wear.damage': 0.65 }),
  },
  {
    words: ['wet', 'glossy', 'shiny', 'polished', 'slick', 'lacquered'],
    note: 'glossy',
    patch: () => ({ 'surface.roughness': 0.18, 'surface.roughnessContrast': 0.3, 'color.sheen': 0.4 }),
  },
  {
    words: ['rough', 'matte', 'dry', 'dusty', 'chalky'],
    note: 'matte',
    patch: () => ({ 'surface.roughness': 0.95, 'color.sheen': 0.1 }),
  },
  {
    words: ['mossy', 'overgrown', 'lichen', 'jungle'],
    note: 'mossy',
    patch: () => ({
      'accentA.enabled': true, 'accentA.generator': 'fbm', 'accentA.color': '#3f5a26', 'accentA.colorB': '#6c8a38',
      'accentA.coverage': 0.45, 'accentA.creviceBias': 0.7, 'accentA.warp': 0.4, 'accentA.roughnessShift': 0.2,
    }),
  },
  {
    words: ['rusty', 'rusted', 'corroded', 'oxidized'],
    note: 'rusted',
    patch: () => ({
      'accentA.enabled': true, 'accentA.generator': 'turbulence', 'accentA.color': '#6e3312', 'accentA.colorB': '#b06a2a',
      'accentA.coverage': 0.5, 'accentA.creviceBias': 0.45, 'accentA.roughnessShift': 0.45, 'accentA.metalShift': -0.8,
      'accentA.heightShift': 0.04, 'accentA.warp': 0.5,
    }),
  },
  {
    words: ['snowy', 'snow', 'frosted', 'frozen', 'icy'],
    note: 'frosted',
    patch: () => ({
      'accentA.enabled': true, 'accentA.generator': 'fbm', 'accentA.color': '#e8f2fb', 'accentA.colorB': '#ffffff',
      'accentA.coverage': 0.45, 'accentA.creviceBias': -0.6, 'accentA.roughnessShift': -0.2, 'accentA.heightShift': 0.06,
    }),
  },
  {
    words: ['dirty', 'grimy', 'muddy', 'stained', 'sooty', 'greasy'],
    note: 'grimy',
    patch: () => ({ 'wear.dirt': 0.6 }),
  },
  {
    words: ['cracked', 'shattered', 'fractured', 'broken'],
    note: 'cracked',
    patch: (settings) => ({
      'detailB.enabled': true, 'detailB.generator': 'cracks', 'detailB.blend': 'min', 'detailB.amount': 0.45,
      'detailB.scale': Math.max(4, Math.round(settings.base.scale * 0.9)), 'detailB.edgeWidth': 0.06,
    }),
  },
  {
    words: ['glowing', 'glow', 'neon', 'radioactive', 'magical', 'luminous'],
    note: 'glowing',
    patch: () => ({
      'emissive.enabled': true, 'emissive.source': 'crevices', 'emissive.intensity': 3, 'emissive.width': 0.3,
    }),
  },
  {
    words: ['chunky', 'large', 'big', 'huge', 'coarse'],
    note: 'coarser',
    patch: (settings) => ({ 'base.scale': Math.max(1, Math.round(settings.base.scale * 0.55)) }),
  },
  {
    words: ['fine', 'tiny', 'small', 'dense', 'micro'],
    note: 'finer',
    patch: (settings) => ({ 'base.scale': Math.min(64, Math.round(settings.base.scale * 1.8)) }),
  },
  {
    words: ['dark', 'gloomy', 'shadowy'],
    note: 'darker',
    patch: () => ({ 'color.brightness': 0.72 }),
  },
  {
    words: ['bright', 'sunny', 'vivid', 'vibrant', 'saturated'],
    note: 'brighter',
    patch: () => ({ 'color.brightness': 1.18, 'color.saturation': 1.25 }),
  },
];

function tokenize(prompt) {
  return String(prompt ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Scores a preset against the prompt via tags + label words. */
function scorePreset(preset, promptText, tokens) {
  let score = 0;
  for (const tag of preset.tags) {
    if (promptText.includes(tag)) score += tag.split(' ').length * 3;
    // Stem credit: "mossy" should still light up the "moss" tag.
    else if (tokens.some((token) => token.length > 3 && token.startsWith(tag))) score += 2;
  }
  for (const word of preset.label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length > 2 && tokens.includes(word)) score += 2;
  }
  if (tokens.includes(preset.id)) score += 4;
  return score;
}

// Ramp stops per preset, normalized once (hex -> triplets) and cached.
const presetStopsCache = new Map();
function presetRampStops(preset) {
  let stops = presetStopsCache.get(preset.id);
  if (!stops) {
    const color = createTextureSettings(preset.settings).color;
    stops = [color.color0, color.color1, color.color2, color.color3, color.color4];
    presetStopsCache.set(preset.id, stops);
  }
  return stops;
}

function luma(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Perceptually-weighted distance between two palettes (dark->light). */
function paletteDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < 5; i += 1) {
    const dr = a[i][0] - b[i][0];
    const dg = a[i][1] - b[i][1];
    const db = a[i][2] - b[i][2];
    sum += Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
  }
  return sum / 5;
}

/** Expands 2..N colors to 5 stops sorted dark -> light. */
function normalizePalette(palette) {
  const colors = (Array.isArray(palette) ? palette : [])
    .map((entry) => (Array.isArray(entry) ? entry : hexToRgb01(entry)))
    .filter(Boolean)
    .sort((a, b) => luma(a) - luma(b));
  if (colors.length < 2) return null;
  return [0, 1, 2, 3, 4].map((i) => {
    const f = (i / 4) * (colors.length - 1);
    const lo = Math.min(colors.length - 2, Math.floor(f));
    const k = f - lo;
    return colors[lo].map((c, ch) => c + (colors[lo + 1][ch] - c) * k);
  });
}

/**
 * Ranks presets against a description and/or a palette — the "existing
 * texture you could use instead" seam (plan 09). `palette` accepts hex
 * strings or [r, g, b] triplets in any order; `presets` defaults to the
 * built-ins but takes any preset-shaped list (user library, catalog).
 * Returns [{ preset, score }] best-first, empty when nothing relates.
 */
export function matchTexturePresets({ text = '', palette = null, presets = BUILT_IN_TEXTURE_PRESETS, limit = 5 } = {}) {
  const promptText = String(text ?? '').toLowerCase();
  const tokens = tokenize(promptText);
  const query = normalizePalette(palette);
  const scored = [];
  for (const preset of presets) {
    let score = text ? scorePreset(preset, promptText, tokens) : 0;
    if (query) {
      const stops = [...presetRampStops(preset)].sort((a, b) => luma(a) - luma(b));
      score += Math.max(0, 1 - paletteDistance(query, stops) * 2.4) * 6;
    }
    if (score > 0.5) scored.push({ preset, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Deterministic offline prompt mapper: best-matching preset + adjective
 * modifiers + color words. Same result shape as compileTextureAiRecipe.
 * mode 'refine' skips preset matching and only applies modifiers/colors
 * on top of `currentSettings`.
 */
export function keywordTextureRecipe(prompt, { mode = 'new', currentSettings = null } = {}) {
  const promptText = String(prompt ?? '').toLowerCase();
  const tokens = tokenize(promptText);
  const notes = [];

  let start;
  let presetId = null;
  if (mode === 'refine' && currentSettings) {
    start = createTextureSettings(currentSettings);
    notes.push('refined current texture');
  } else {
    let best = null;
    let bestScore = 0;
    for (const preset of BUILT_IN_TEXTURE_PRESETS) {
      const score = scorePreset(preset, promptText, tokens);
      if (score > bestScore) {
        best = preset;
        bestScore = score;
      }
    }
    start = createTextureSettings(best?.settings ?? {});
    presetId = best?.id ?? null;
    notes.push(best ? `matched “${best.label}”` : 'no preset matched — started from defaults');
  }

  let patch = {};
  for (const modifier of MODIFIERS) {
    if (modifier.words.some((word) => tokens.includes(word))) {
      patch = { ...patch, ...modifier.patch(start) };
      notes.push(modifier.note);
    }
  }
  for (const [word, make] of Object.entries(COLOR_WORDS)) {
    if (tokens.includes(word)) {
      patch = { ...patch, ...make() };
      notes.push(word);
      break;
    }
  }

  const { settings, applied, ignored } = applyTextureSettingsPatch(start, patch);
  const name = String(prompt ?? '').trim().slice(0, 48) || 'Untitled texture';
  return {
    applied,
    ignored,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    notes: `Offline mapper: ${notes.join(', ')}.`,
    presetId,
    settings,
  };
}
