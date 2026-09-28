// Generate the reference directly from runtime schemas; no browser/server required.
// Run with --check to detect drift without rewriting the generated document.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'docs', 'settings-reference.md');
const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));

// Every settings module that follows the groups + field-schema convention.
// `module` is a repository source path; `groups`/`schema` are the export names.
const MODULES = [
  {
    title: 'Character toon shading',
    subpath: 'toonlab/toon',
    module: '/src/toon/toonSettings.js',
    groups: 'TOON_SETTING_GROUPS',
    schema: 'TOON_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group; dotted keys are nested objects: `createToonSettings({ preset: \'call_me_sensei\', rim: { intensity: { hair: 0.3 } } })`. Colours are `[r, g, b]` 0–1; shadow tones, band colours, tints and inks are display-space (sRGB) multipliers. Texture fields are runtime-only.',
  },
  {
    title: 'Environment shading',
    subpath: 'toonlab/environment',
    module: '/src/environment/environmentSettings.js',
    groups: 'ENVIRONMENT_SETTING_GROUPS',
    schema: 'ENVIRONMENT_SETTING_FIELD_SCHEMA',
    note: 'Settings are `{ features, parameters }`: `createEnvironmentSettings({ parameters: { exposure: 0.95 } })`.',
  },
  {
    title: 'Rock shader profile',
    subpath: 'toonlab/rock-shader',
    module: '/src/rock-shader/rockShaderSettings.js',
    groups: 'ROCK_SHADER_SETTING_GROUPS',
    schema: 'ROCK_SHADER_FIELD_SCHEMA',
    note: 'Reusable grouped material settings consumed by `applyRockShader(root, settings)`. Rock geometry, erosion, seed, LOD, collision, and current scene conditions remain separate.',
  },
  {
    title: 'Ground shader profile',
    subpath: 'toonlab/ground-shader',
    module: '/src/ground-shader/groundShaderSettings.js',
    groups: 'GROUND_SHADER_SETTING_GROUPS',
    schema: 'GROUND_SHADER_FIELD_SCHEMA',
    note: 'Reusable grouped terrain-material settings consumed by `createGroundShaderMaterial(settings)` and `createGroundShaderMesh({ geometry, settings })`. Terrain geometry, coverage, LOD, collision, and current scene conditions remain separate.',
  },
  {
    title: 'Water',
    subpath: 'toonlab/water',
    module: '/src/water/waterSettings.js',
    groups: 'WATER_SETTING_GROUPS',
    schema: 'WATER_SETTING_FIELD_SCHEMA_BY_GROUP',
    note: 'Flat authored settings for `WaterSurface`; live sun/sky and Weather wave energy compose through transient scene layers without changing portable `water.settings`. Quality is a construction-time graph policy.',
  },
  {
    title: 'Post-processing',
    subpath: 'toonlab/post',
    module: '/src/post/postProcessing.js',
    groups: 'POST_PROCESSING_SETTING_GROUPS',
    schema: 'POST_PROCESSING_SETTING_FIELD_SCHEMA',
    note: 'Settings are `{ features, parameters }`: `createPostProcessingSettings({ preset: "softAnime" })`.',
  },
  {
    title: 'Vegetation shader family',
    subpath: 'toonlab/vegetation-shaders',
    module: '/src/vegetation/vegetationShaders.js',
    groups: 'VEGETATION_SHADER_SETTING_GROUPS',
    schema: 'VEGETATION_SHADER_FIELD_SCHEMA',
    note: 'Shared field registry for three independent portable profiles: Tree uses Shared/Foliage/Bark groups, Grass uses Shared/Grass groups, and Flower uses Shared/Foliage/Flower/Stem groups. Asset geometry, species, albedo, and current scene weather remain separate.',
  },
  {
    title: 'Grass',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedGrass.js',
    groups: 'GRASS_SETTING_GROUPS',
    schema: 'GRASS_SETTING_FIELD_SCHEMA',
    note: 'Flat settings consumed by `new StylizedGrassField(options)` and `grass.applySettings(options)`. Portable grass preset v2 stores asset geometry, palette/material, and `windResponse` / `gustResponse`; current light, wind/gust field, cloud field, and push radius are scene/runtime inputs.',
  },
  {
    title: 'Flowers',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedFlowers.js',
    groups: 'FLOWER_SETTING_GROUPS',
    schema: 'FLOWER_SETTING_FIELD_SCHEMA',
    note: 'Flat settings consumed by `new StylizedFlowerField(options)` and `flowers.applySettings(options)`.',
  },
  {
    title: 'Trees',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedTree.js',
    groups: 'STYLIZED_TREE_SETTING_GROUPS',
    schema: 'STYLIZED_TREE_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `new StylizedTree(options)` and `tree.applySettings(options)`.',
  },
  {
    title: 'SkySystem atmosphere and clouds',
    subpath: 'toonlab/sky',
    module: '/src/sky/skyParams.js',
    schema: 'SKY_PARAMS_FIELD_SCHEMA',
    note: 'Current versioned SkySystem document. Nested field paths are relative to the named block; use createSkyParams() and the exported schema version. Quality remains a separate runtime policy.',
  },
  {
    title: 'Legacy StylizedSky compatibility',
    subpath: 'toonlab/sky',
    module: '/src/sky/stylizedSky.js',
    groups: 'SKY_SETTING_GROUPS',
    schema: 'SKY_SETTING_FIELD_SCHEMA',
    note: 'Compatibility schema for StylizedSky, not the modern SkySystem document. See the SkySystem section for current integrated sky/cloud authoring.',
  },
  {
    title: 'Paths, roads & bridges',
    subpath: 'toonlab/pathgen',
    module: '/src/pathgen/pathSettings.js',
    groups: 'PATH_SETTING_GROUPS',
    schema: 'PATH_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `createStylizedPaths({ settings })` and serialized in path recipes.',
  },
  {
    title: 'Ambient VFX',
    subpath: 'toonlab/ambientfx',
    module: '/src/ambientfx/ambientFxSettings.js',
    groups: 'AMBIENTFX_SETTING_GROUPS',
    schema: 'AMBIENTFX_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `densityScale` multiplies the authored per-m³ density (`density` remains a compatibility alias). Call `emitNow(camera)` when build-time stats or a settled first capture are required before the first update.',
  },
  {
    title: 'Gameplay VFX',
    subpath: 'toonlab/vfxgen',
    module: '/src/vfxgen/vfxSettings.js',
    groups: 'VFX_SETTING_GROUPS',
    schema: 'VFX_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createVfxSystem({ settings: { impact: { sparkCount: 40 } } })`. Per-spawn `look` overrides re-tint one spawn without touching settings.',
  },
  {
    title: 'Fauna',
    subpath: 'toonlab/fauna',
    module: '/src/fauna/faunaSettings.js',
    groups: 'FAUNA_SETTING_GROUPS',
    schema: 'FAUNA_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.',
  },
  {
    title: 'Buildings',
    subpath: 'toonlab/buildinggen',
    module: '/src/buildinggen/buildingSettings.js',
    groups: 'BUILDING_SETTING_GROUPS',
    schema: 'BUILDING_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `createBuildingFromRecipe(...)` / `buildingAsset(...)`; `{ type, seed }` ride alongside the groups.',
  },
  {
    title: 'Procedural textures',
    subpath: 'toonlab/texgen',
    module: '/src/texgen/textureSettings.js',
    groups: 'TEXTURE_SETTING_GROUPS',
    schema: 'TEXTURE_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `evaluateTextureMaps(settings)` and serialized in texture recipes (`createTextureSettings`).',
  },
];

// Import the module and flatten groups + schema into
// JSON-safe data. Field shape is shared across every settings module
// (id, key, label, description, type, range, defaultValue, options,
// serializable). Runtime/preview inputs remain documented but are marked so
// they cannot be mistaken for portable preset fields.
async function extractModuleData({ module, groups, schema }) {
  const mod = await import(pathToFileURL(path.join(ROOT, module.replace(/^\//, ''))).href);
  const groupList = groups ? mod[groups] : Object.keys(mod[schema]);
  const fieldSchema = mod[schema];
  if (!groupList || !fieldSchema) {
    throw new Error(`${module}: missing export ${!groupList ? groups : schema}`);
  }

  function safeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(safeValue);
    return JSON.stringify(value);
  }

  function flatten(value, prefix = '') {
    if (value && typeof value.type === 'string') return [{ ...value, key: prefix || value.key }];
    if (Array.isArray(value)) return value.flatMap((child) => flatten(child, prefix ? `${prefix}.${child.key}` : child.key));
    return Object.entries(value ?? {}).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return groupList.map((definition) => {
    const group = typeof definition === 'string' ? { id: definition, label: definition } : definition;
    const fields = fieldSchema[group.id] ?? {};
    const fieldList = flatten(fields);
    return {
      id: group.id,
      label: group.label,
      description: group.description ?? '',
      scene: Boolean(group.scene),
      fields: fieldList.map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description ?? '',
        type: field.type,
        range: field.range ? { min: field.range.min, max: field.range.max, step: field.range.step } : null,
        options: field.options ? field.options.map(String) : null,
        defaultValue: safeValue(Object.hasOwn(field, 'defaultValue') ? field.defaultValue : field.value),
        serializable: field.serializable !== false && !field.derived && !group.scene,
        scope: group.scene
          ? 'scene/runtime'
          : (field.serializable === false && /construction-only/i.test(field.description ?? '')
            ? 'local/construction'
            : 'local/runtime'),
      })),
    };
  });
}

function formatDefault(value, type) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    return `\`[${value.join(', ')}]\``;
  }
  if (typeof value === 'string') return `\`'${value}'\``;
  return `\`${String(value)}\``;
}

function formatRange(field) {
  // Plain '|' here; escapeCell escapes it for the table cell.
  if (field.options) return field.options.map((option) => `\`${option}\``).join(' | ');
  if (field.range) return `${field.range.min} – ${field.range.max}`;
  return '—';
}

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderMarkdown(sections) {
  const lines = [];
  lines.push('# Settings reference');
  lines.push('');
  lines.push('<!-- GENERATED FILE — do not edit by hand. -->');
  lines.push('<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->');
  lines.push('');
  lines.push('Fields in the selected runtime and repository settings schemas, generated from the');
  lines.push('exported field schemas (including the modern SkyParams envelope). The same schemas');
  lines.push('drive the Lab controls and inspectors. A Lab may place');
  lines.push('scene/runtime inputs in its Preview controls instead of the saved editor;');
  lines.push('the **Portable** column makes that ownership explicit.');
  lines.push('');

  // Table of contents.
  for (const section of sections) {
    lines.push(`- [${section.title}](#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
  }
  lines.push('');

  for (const section of sections) {
    const fieldCount = section.groups.reduce((sum, group) => sum + group.fields.length, 0);
    lines.push(`## ${section.title}`);
    lines.push('');
    const key = `./${section.subpath.slice('toonlab/'.length)}`;
    const publicEntry = Boolean(packageJson.exports[key]);
    lines.push(publicEntry
      ? `Module: \`@call-me-sensei/${section.subpath}\` — ${section.groups.length} groups, ${fieldCount} fields.`
      : `Repository-only module: \`${section.module.slice(1)}\` — ${section.groups.length} groups, ${fieldCount} fields. **Not an npm entry point.**`);
    if (section.note) {
      lines.push('');
      lines.push(section.note);
    }
    lines.push('');

    for (const group of section.groups) {
      if (group.fields.length === 0) continue;
      lines.push(`### ${section.title}: ${group.label}`);
      lines.push('');
      if (group.description) {
        lines.push(escapeCell(group.description));
        lines.push('');
      }
      lines.push('| Field | Type | Default | Range / options | Portable | Description |');
      lines.push('|---|---|---|---|---|---|');
      for (const field of group.fields) {
        lines.push([
          '',
          `\`${field.key}\``,
          field.type,
          escapeCell(formatDefault(field.defaultValue, field.type)),
          escapeCell(formatRange(field)),
          field.serializable ? 'Yes' : `No — ${field.scope}`,
          escapeCell(field.description),
          '',
        ].join(' | ').trim());
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const sections = [];
  for (const spec of MODULES) {
    const groups = await extractModuleData(spec);
    sections.push({ ...spec, groups });
    console.log(`${spec.title}: ${groups.length} groups, ${groups.reduce((sum, group) => sum + group.fields.length, 0)} fields`);
  }
  const output = renderMarkdown(sections);
  if (process.argv.includes('--check')) {
    if (await readFile(OUTPUT_PATH, 'utf8') !== output) throw new Error('Settings reference is stale; run node scripts/generate-settings-reference.mjs');
  } else await writeFile(OUTPUT_PATH, output);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
