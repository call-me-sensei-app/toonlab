import { writeRequiredLocalJson } from '../shared/browserStorage.js';
// Local tree/bush recipe-preset persistence (browser localStorage), plus the
// built-in presets derived from STYLIZED_TREE_EXAMPLES. Same document flow as
// labs/shader-lab/toonPresetStore.js, validated by validateTreeRecipeDocument.

import {
  BUILT_IN_TREE_PRESETS,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  validateTreeRecipeDocument,
} from '../../src/vegetation/experimental.js';

export { BUILT_IN_TREE_PRESETS };

const LOCAL_TREE_PRESETS_STORAGE_KEY = 'toonlab.treePresets.v1';
const GALLERY_COLOR_VERSION = 2;

// The batch generator deliberately stays inside four restrained, botanical
// hue families. A candidate owns one base color plus same-hue light/shadow
// tones; renderer hue variation is disabled for this marked gallery set, so
// a green candidate cannot turn yellow, orange, or red from card to card.
const GALLERY_COLOR_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'green',
    colors: Object.freeze([
      '#2f6b3d', '#3e7d45', '#508f4d', '#62a253', '#76ad59', '#89b65a',
    ]),
  }),
  Object.freeze({
    id: 'yellow',
    colors: Object.freeze([
      '#b39a2c', '#c2a536', '#d1b443', '#dec050', '#e6ca63', '#d8b737',
    ]),
  }),
  Object.freeze({
    id: 'orange',
    colors: Object.freeze([
      '#b95f27', '#c96d2b', '#d77a32', '#e28739', '#ec984b', '#cb622d',
    ]),
  }),
  Object.freeze({
    id: 'red',
    colors: Object.freeze([
      '#9e3734', '#ad3f38', '#bb4940', '#c95547', '#d46350', '#b13b3a',
    ]),
  }),
]);

const GALLERY_LEAF_SHAPES = Object.freeze(['teardrop', 'round', 'maple', 'gingko']);
const GALLERY_BARK_TEXTURES = Object.freeze(['classic', 'birch', 'beech', 'oak', 'pine', 'ash']);
const GALLERY_SIZE_VARIANTS = Object.freeze([0.9, 0.96, 1, 1.05, 1.1]);
const GALLERY_NAME_PREFIXES = Object.freeze([
  'Whispering', 'Sunlit', 'Mossbound', 'Silverleaf', 'Verdant',
  'Meadow', 'Riverbend', 'Highland', 'Golden', 'Moonlit',
]);
const GALLERY_NAME_SPECIES = Object.freeze([
  'Oak', 'Ash', 'Aspen', 'Pine', 'Maple',
  'Ginkgo', 'Birch', 'Beech', 'Willow', 'Cedar',
]);

function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleHexColor(hex, scale) {
  const value = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const channels = [0, 2, 4].map((offset) => (
    Math.round(Math.min(255, Math.max(0, parseInt(value.slice(offset, offset + 2), 16) * scale)))
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function varyNumber(value, amount, step, index, min, max) {
  const base = Number.isFinite(Number(value)) ? Number(value) : 0;
  const offset = ((index % 5) - 2) * amount;
  const next = clamp(base + offset, min, max);
  return Math.round(next / step) * step;
}

function galleryLeafShapeFor(templateId, index) {
  // Pines keep their needle-like organ; broadleaf families rotate through
  // the four authored silhouettes so the library has readable shape variety.
  if (/pine/i.test(templateId)) return 'needle';
  if (/aspen/i.test(templateId)) return index % 2 ? 'round' : 'teardrop';
  return GALLERY_LEAF_SHAPES[index % GALLERY_LEAF_SHAPES.length];
}

function galleryColorFor(index) {
  // Four-candidate blocks make the family rotation visible in the library
  // without sacrificing deterministic per-candidate color variation.
  const family = GALLERY_COLOR_FAMILIES[Math.floor(index / 4) % GALLERY_COLOR_FAMILIES.length];
  const color = family.colors[Math.floor(index / (GALLERY_COLOR_FAMILIES.length * 4)) % family.colors.length];
  return {
    color,
    family,
    palette: {
      crown: scaleHexColor(color, 1.12),
      lit: color,
      shadow: scaleHexColor(color, 0.62),
    },
  };
}

function galleryBarkTextureFor(templateId, index) {
  if (/pine/i.test(templateId)) return index % 3 ? 'pine' : 'classic';
  if (/aspen/i.test(templateId)) return index % 3 ? 'birch' : 'beech';
  if (/ash/i.test(templateId)) return 'ash';
  if (/oak/i.test(templateId)) return index % 3 ? 'oak' : 'beech';
  return GALLERY_BARK_TEXTURES[index % GALLERY_BARK_TEXTURES.length];
}

function galleryNameFor(index) {
  const prefix = GALLERY_NAME_PREFIXES[index % GALLERY_NAME_PREFIXES.length];
  const species = GALLERY_NAME_SPECIES[
    Math.floor(index / GALLERY_NAME_PREFIXES.length) % GALLERY_NAME_SPECIES.length
  ];
  return `${prefix} ${species}`;
}

function galleryNameForId(id) {
  const index = galleryIndexForId(id);
  if (index === null) return null;
  return index >= 0 && index < 100 ? galleryNameFor(index) : null;
}

function galleryIndexForId(id) {
  const match = /^local_gallery_tree_(\d+)$/.exec(String(id ?? ''));
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= 100) return null;
  return index;
}

export function normalizeGalleryCandidate(document) {
  const index = galleryIndexForId(document.id);
  if (index === null) return { changed: false, document };
  const marker = document.options?.galleryMonochrome;
  if (marker?.version >= GALLERY_COLOR_VERSION) return { changed: false, document };

  const { color, family, palette } = galleryColorFor(index);
  return {
    changed: true,
    document: {
      ...document,
      options: {
        ...(document.options ?? {}),
        canopyColor: color,
        canopyPalette: palette,
        galleryMonochrome: { family: family.id, version: GALLERY_COLOR_VERSION },
        vegetationShader: document.options?.vegetationShader ?? 'call_me_sensei',
      },
    },
  };
}

function curatedOptionsFor(template, index) {
  const source = cloneJSON(template.options ?? {});
  const templateId = String(template.id ?? 'tree');
  const { color, family, palette } = galleryColorFor(index);
  const scale = GALLERY_SIZE_VARIANTS[index % GALLERY_SIZE_VARIANTS.length];

  source.seed = 1001 + index * 37;
  source.size = clamp((Number(source.size) || 1.7) * scale, 1.15, 3.8);
  source.canopyColor = color;
  // Keep all three renderer tones inside the same hue family. This prevents
  // the default crown rotation from turning a warm tree into a different
  // color family while preserving readable toon-lighting bands.
  source.canopyPalette = palette;
  source.galleryMonochrome = { family: family.id, version: GALLERY_COLOR_VERSION };
  source.leafDensity = clamp((Number(source.leafDensity) || 0.9)
    + ((index % 4) - 1.5) * 0.025, 0.78, 1);
  source.vegetationShader = 'call_me_sensei';

  const trunk = { ...(source.trunk ?? {}) };
  trunk.bend = varyNumber(trunk.bend, 0.012, 0.001, index, 0, 0.3);
  trunk.lean = varyNumber(trunk.lean, 0.016, 0.001, index + 1, 0, 0.34);
  trunk.twist = varyNumber(trunk.twist, 0.06, 0.01, index + 2, 0, 1.1);
  trunk.gnarl = varyNumber(trunk.gnarl, 0.045, 0.005, index + 3, 0, 0.85);
  source.trunk = trunk;

  if (source.skeleton && typeof source.skeleton === 'object') {
    const skeleton = { ...source.skeleton };
    if (skeleton.childrenCount !== undefined) {
      skeleton.childrenCount = Math.round(varyNumber(
        skeleton.childrenCount, 1, 1, index, 2, templateId.includes('pine') ? 60 : 14,
      ));
    }
    if (skeleton.levels !== undefined) {
      skeleton.levels = Math.round(varyNumber(skeleton.levels, 0.35, 1, index + 1, 1, 4));
    }
    if (skeleton.branchAngle !== undefined) {
      skeleton.branchAngle = varyNumber(skeleton.branchAngle, 3.5, 1, index + 2, 25, 110);
    }
    if (skeleton.branchStart !== undefined) {
      skeleton.branchStart = varyNumber(skeleton.branchStart, 0.025, 0.01, index + 3, 0.18, 0.72);
    }
    if (skeleton.lengthRatio !== undefined) {
      skeleton.lengthRatio = varyNumber(skeleton.lengthRatio, 0.018, 0.005, index + 4, 0.18, 0.72);
    }
    if (skeleton.radiusRatio !== undefined) {
      skeleton.radiusRatio = varyNumber(skeleton.radiusRatio, 0.018, 0.005, index + 5, 0.28, 0.78);
    }
    if (skeleton.gnarliness !== undefined) {
      skeleton.gnarliness = varyNumber(skeleton.gnarliness, 0.018, 0.005, index + 6, 0, 0.55);
    }
    source.skeleton = skeleton;
  }

  if (source.canopyLayout && typeof source.canopyLayout === 'object') {
    source.canopyLayout = { ...source.canopyLayout };
    if (source.canopyLayout.lobeCount !== undefined) {
      source.canopyLayout.lobeCount = Math.round(varyNumber(
        source.canopyLayout.lobeCount, 0.5, 1, index, 4, 10,
      ));
    }
    if (source.canopyLayout.spread !== undefined) {
      source.canopyLayout.spread = varyNumber(
        source.canopyLayout.spread, 0.05, 0.01, index + 1, 0.8, 1.8,
      );
    }
    if (source.canopyLayout.flatten !== undefined) {
      source.canopyLayout.flatten = varyNumber(
        source.canopyLayout.flatten, 0.035, 0.01, index + 2, 0.2, 0.8,
      );
    }
  }

  if (source.canopy && typeof source.canopy === 'object') {
    source.canopy = { ...source.canopy };
    if (Array.isArray(source.canopy.blobs)) {
      source.canopy.blobs = source.canopy.blobs.map((blob, blobIndex) => ({
        ...blob,
        radius: clamp(
          (Number(blob.radius) || 0.3) * (0.94 + ((index + blobIndex) % 4) * 0.04),
          0.1,
          1.25,
        ),
      }));
    }
    if (Array.isArray(source.canopy.cardSizeRange)) {
      const [min, max] = source.canopy.cardSizeRange;
      source.canopy.cardSizeRange = [
        clamp((Number(min) || 0.34) * (0.94 + (index % 3) * 0.03), 0.22, 0.8),
        clamp((Number(max) || 0.5) * (0.94 + (index % 3) * 0.03), 0.28, 0.95),
      ];
    }
  }

  // These side-channels are consumed by the lab renderer and survive recipe
  // import/export. They intentionally stay simple so candidates remain easy
  // to review and later publish individually.
  source.leafShape = { preset: galleryLeafShapeFor(templateId, index) };
  source.leafStyle = { presetId: null, season: 'summer' };
  source.barkTexture = { id: galleryBarkTextureFor(templateId, index) };
  source.woodDetails = {
    knots: Number((0.08 + (index % 5) * 0.06).toFixed(2)),
    scars: Number((0.06 + ((index + 2) % 5) * 0.05).toFixed(2)),
  };
  return source;
}

/**
 * Build deterministic, review-ready tree documents for the local gallery.
 * The output is intentionally not published: it is a local candidate set the
 * artist can inspect, edit, and publish one-by-one later.
 */
export function createCuratedTreePresetDocuments(count = 100) {
  const total = Math.max(1, Math.min(500, Math.round(Number(count) || 100)));
  const templates = BUILT_IN_TREE_PRESETS.filter((preset) => preset.type === 'tree');
  if (!templates.length) return [];

  return Array.from({ length: total }, (_, index) => {
    const template = templates[index % templates.length];
    const ordinal = String(index + 1).padStart(3, '0');
    const name = galleryNameFor(index);
    const document = {
      schema: TREE_RECIPE_SCHEMA,
      version: TREE_RECIPE_VERSION,
      type: 'tree',
      architecture: template.architecture ?? { id: 'legacy-woody', engine: 'legacy-woody', version: 2 },
      id: `local_gallery_tree_${ordinal}`,
      label: name,
      description: `Curated monochrome ${name.toLowerCase()} with restrained shape, branch, and bark variation.`,
      options: curatedOptionsFor(template, index),
    };
    const result = validateTreeRecipeDocument(document, { requireIdentity: true });
    if (!result.ok) throw new Error(`Could not build gallery candidate ${ordinal}: ${result.errors.join(' ')}`);
    return result.value;
  });
}

// Built-in roster now ships in the package (src/vegetation/treeRecipePresets.js)
// so consumer games get the same signature plants the labs show.

function readLocalTreePresetDocuments() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_TREE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read local tree presets:', error);
    return [];
  }
}

function writeLocalTreePresetDocuments(documents) {
  writeRequiredLocalJson(LOCAL_TREE_PRESETS_STORAGE_KEY, documents);
}

export function loadLocalTreePresets() {
  const raw = readLocalTreePresetDocuments();
  const validDocuments = [];
  let changed = false;
  for (const entry of raw) {
    const result = validateTreeRecipeDocument(entry, { requireIdentity: true });
    if (!result.ok) {
      console.warn('Ignoring invalid local tree preset:', result.errors.join(' '));
      continue;
    }
    const normalized = normalizeGalleryCandidate(result.value);
    if (normalized.changed) changed = true;
    const value = normalized.document;
    const migratedName = galleryNameForId(value.id);
    if (migratedName && value.label !== migratedName) {
      changed = true;
      validDocuments.push({
        ...value,
        label: migratedName,
        description: value.description?.startsWith('Curated monochrome')
          ? `Curated monochrome ${migratedName.toLowerCase()} with restrained shape, branch, and bark variation.`
          : value.description,
      });
    } else {
      validDocuments.push(value);
    }
  }
  if (changed || validDocuments.length !== raw.length) {
    try { writeLocalTreePresetDocuments(validDocuments); } catch { /* Keep reading the original collection. */ }
  }
  document.body.dataset.localTreePresetCount = String(validDocuments.length);
  return validDocuments;
}

export function upsertLocalTreePreset(presetDocument) {
  const result = validateTreeRecipeDocument(presetDocument, { requireIdentity: true });
  if (!result.ok) throw new Error(result.errors.join(' '));

  upsertLocalTreePresets([result.value]);
  return result.value;
}

/** Persist a group of validated local documents in one localStorage write. */
export function upsertLocalTreePresets(presetDocuments) {
  if (!Array.isArray(presetDocuments) || !presetDocuments.length) return [];
  const validated = presetDocuments.map((presetDocument) => {
    const result = validateTreeRecipeDocument(presetDocument, { requireIdentity: true });
    if (!result.ok) throw new Error(result.errors.join(' '));
    return result.value;
  });
  const incomingIds = new Set(validated.map((entry) => entry.id));
  const existing = readLocalTreePresetDocuments()
    .map((entry) => validateTreeRecipeDocument(entry, { requireIdentity: true }))
    .filter((entry) => entry.ok)
    .map((entry) => entry.value)
    .filter((entry) => !incomingIds.has(entry.id));
  const nextDocuments = [...existing, ...validated];
  nextDocuments.sort((a, b) => a.label.localeCompare(b.label));
  writeLocalTreePresetDocuments(nextDocuments);
  if (typeof document !== 'undefined') {
    document.body.dataset.localTreePresetCount = String(nextDocuments.length);
  }
  return validated;
}

export function deleteLocalTreePreset(id) {
  const nextDocuments = readLocalTreePresetDocuments().filter((entry) => entry?.id !== id);
  writeLocalTreePresetDocuments(nextDocuments);
  document.body.dataset.localTreePresetCount = String(nextDocuments.length);
}

export function findTreePreset(id, localPresets = loadLocalTreePresets()) {
  return BUILT_IN_TREE_PRESETS.find((preset) => preset.id === id) ??
    localPresets.find((preset) => preset.id === id) ?? null;
}
