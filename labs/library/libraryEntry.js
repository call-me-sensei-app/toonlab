const MODEL_KINDS = new Set([
  'generated-model',
  'image_to_model',
  'model_segment',
  'multiview_to_model',
  'text_to_model',
]);

const TYPE_INFO = Object.freeze({
  'toon-preset': ['Toon preset', '/shader-lab/', 'Open in Shader Lab'],
  'tree-recipe': ['Tree', '/tree-lab/', 'Open in Tree Lab'],
  'rock-project': ['Rock', '/rock-lab/', 'Open in Rock Lab'],
  'rockLab-project': ['Rock', '/rock-lab/', 'Open in Rock Lab'],
  'debris-project': ['Debris', '/debris-lab/', 'Open in Debris Lab'],
  'grass-preset': ['Grass', '/grass-lab/', 'Open in Grass Lab'],
  'water-preset': ['Water', '/water-lab/', 'Open in Water Lab'],
  'sky-preset': ['Sky', '/sky-lab/', 'Open in Sky Lab'],
  'weather-preset': ['Weather', '/weather-lab/', 'Open in Weather Lab'],
  'world-preset': ['World', '/playground/', 'Open Playground'],
  'prop-asset': ['Prop', null, null],
  'environment-preset': ['Environment', '/environment-lab/', 'Open in Environment Lab'],
  'manufactured-surface-profile': ['Manufactured surface', '/manufactured-material-lab/', 'Open in Manufactured Surface Lab'],
  'vegetation-shader-preset': ['Vegetation shader', '/vegetation-shader-lab/', 'Open in Vegetation Shader Lab'],
  'tree-shader-preset': ['Tree shader', '/tree-shader-lab/', 'Open in Tree Shader Lab'],
  'grass-shader-preset': ['Grass shader', '/grass-shader-lab/', 'Open in Grass Shader Lab'],
  'flower-shader-preset': ['Flower shader', '/flower-shader-lab/', 'Open in Flower Shader Lab'],
  'rock-shader-preset': ['Rock shader', '/rock-shader-lab/', 'Open in Rock Shader Lab'],
  'ground-shader-preset': ['Ground shader', '/ground-shader-lab/', 'Open in Ground Shader Lab'],
  'sky-params': ['Sky & cloud', '/sky-cloud-lab/', 'Open in Sky & Cloud Lab'],
  'cloud-shader-preset': ['Cloud shader', '/cloud-shader-lab/', 'Open in Cloud Shader Lab'],
  'texture-recipe': ['Texture', '/texture-lab/', 'Open in Texture Lab'],
  'texture-lab-preset': ['Texture', '/texture-lab/', 'Open in Texture Lab'],
  'style-bundle': ['Style bundle', '/styles/', 'Open style bundle'],
  'generated-image': ['Generated image', null, null],
});

const ICONS = Object.freeze({
  Building: '🏯', Debris: '🪵', Environment: '🏯', Flower: '🌸',
  Grass: '🌿', Image: '🖼️', Rock: '🪨', Sky: '🌤️', Texture: '🧱',
  Tree: '🌳', Water: '🌊', Weather: '🌦️', World: '🗺️',
});

function typeInfo(label, href, actionLabel) {
  return { actionLabel, href, icon: ICONS[label] ?? '🎨', label };
}

export function rawLibraryDocument(entry) {
  if (entry?.document && typeof entry.document === 'object') return entry.document;
  const { _local, ...document } = entry ?? {};
  return document;
}

export function libraryEntryInfo(entry) {
  const payload = rawLibraryDocument(entry);
  if ((entry?.type === 'tree-recipe' || payload?.schema === 'treeRecipe') && payload?.type === 'flower') {
    return typeInfo('Flower', '/flower-lab/', 'Open in Flower Lab');
  }
  for (const candidate of [payload?.schema, payload?.type, entry?.type, entry?.kind]) {
    const normalized = String(candidate ?? '').replace(/^toonlab\//, '');
    if (TYPE_INFO[normalized]) return typeInfo(...TYPE_INFO[normalized]);
  }
  const cluster = {
    buildinggen: ['Building', '/building-lab/', 'Open in Building Lab'],
    debrisgen: TYPE_INFO['debris-project'],
    lighting: ['Lighting', '/lighting-lab/', 'Open in Lighting Lab'],
    propgen: ['Prop', '/prop-lab/', 'Open in Prop Lab'],
    rockgen: TYPE_INFO['rock-project'],
    sky: TYPE_INFO['sky-preset'],
    toon: TYPE_INFO['toon-preset'],
    vegetation: TYPE_INFO['tree-recipe'],
    water: TYPE_INFO['water-preset'],
  }[entry?.cluster];
  if (cluster) return typeInfo(...cluster);
  if (MODEL_KINDS.has(entry?.type) || MODEL_KINDS.has(entry?.kind)) {
    return typeInfo('Generated model', null, null);
  }
  return typeInfo(String(entry?.type ?? entry?.kind ?? 'Creation').replaceAll('-', ' '), null, null);
}

export function libraryResultFile(entry) {
  return entry?.result?.file ?? entry?.file ?? entry?.recipe?.download ?? entry?.download ?? null;
}

export function isLibraryModel(entry) {
  const file = libraryResultFile(entry);
  const contentType = String(file?.contentType ?? file?.content_type ?? file?.mimeType ?? '');
  const url = String(file?.url ?? '');
  return MODEL_KINDS.has(entry?.type)
    || MODEL_KINDS.has(entry?.kind)
    || entry?.kind === 'imported-glb'
    || entry?.recipe?.kind === 'model'
    || contentType === 'model/gltf-binary'
    || contentType === 'model/gltf+json'
    || /\.(?:glb|gltf)(?:\?|$)/i.test(url);
}

export function libraryImageUrl(entry) {
  const file = libraryResultFile(entry);
  const candidates = [
    entry?.result?.previewFile?.url,
    entry?.thumbnail_url,
    entry?.thumbnailUrl,
    entry?.thumbUrl,
    entry?.thumbnail,
    String(file?.contentType ?? file?.content_type ?? '').startsWith('image/') ? file?.url : null,
  ];
  const candidate = candidates.find(Boolean);
  if (!candidate) return null;
  const url = String(candidate);
  return /^(?:[a-z]+:|\/)/i.test(url) ? url : `/labs/catalog/${url.replace(/^\.\//, '')}`;
}

export function libraryTextureRecipe(entry) {
  const document = rawLibraryDocument(entry);
  const identifiers = [document?.kind, document?.schema, document?.type, entry?.kind, entry?.type]
    .filter(Boolean).join(' ').toLowerCase();
  if (!identifiers.includes('texture') || !document?.settings) return null;
  return document.kind === 'toonlab.textureRecipe' && Number(document.version) === 1
    ? document
    : {
        kind: 'toonlab.textureRecipe',
        name: document.label ?? document.name ?? entry.label ?? entry.name ?? 'Library texture',
        settings: document.settings,
        version: 1,
      };
}

export function libraryWaterDocument(entry) {
  const document = rawLibraryDocument(entry);
  const identifiers = [document?.kind, document?.schema, document?.type, entry?.kind, entry?.type]
    .filter(Boolean).join(' ').toLowerCase();
  if (!identifiers.includes('water') || !document?.settings) return null;
  return document.type === 'toonlab/water-preset' && Number(document.version) === 2
    ? document
    : {
        description: document.description ?? entry.description ?? '',
        id: document.id ?? entry.id,
        label: document.label ?? document.name ?? entry.label ?? entry.name ?? 'Library water',
        settings: document.settings,
        type: 'toonlab/water-preset',
        version: 2,
      };
}

function creationType(entry) {
  const document = rawLibraryDocument(entry);
  const aliases = {
    'rockLab-project': 'rock-project',
    treeRecipe: 'tree-recipe',
    'texture-lab-preset': 'texture-recipe',
  };
  const known = new Set(Object.keys(TYPE_INFO));
  for (const candidate of [entry?.type, document?.schema, document?.type, entry?.kind]) {
    const normalized = String(candidate ?? '').replace(/^toonlab\//, '');
    const canonical = aliases[normalized] ?? normalized;
    if (known.has(canonical)) return canonical;
  }
  return null;
}

function documentId(entry, document) {
  return String(document?.id ?? entry?._local?.docKey ?? entry?.id ?? '').trim();
}

function setParam(url, key, value) {
  const target = new URL(url, window.location.origin);
  target.searchParams.set(key, value);
  return `${target.pathname}${target.search}`;
}

/**
 * Resolve every saved creation type to its real renderer. Recipe types that
 * support portable deep links receive the complete document; the remaining
 * labs read the exact staged document by id from their native local store.
 */
export function libraryLivePreview(entry) {
  const document = rawLibraryDocument(entry);
  const type = creationType(entry);
  const id = documentId(entry, document);
  const encodedDocument = JSON.stringify(document);
  const vegetationScope = String(document?.type ?? '');
  const direct = (kind, url, supportsCompare = false) => ({ kind, labUrl: url, mode: 'lab', supportsCompare });

  switch (type) {
    case 'toon-preset': return direct('toon shader', setParam('/shader-lab/', 'toonPreset', id));
    case 'tree-recipe': return direct(
      document?.type === 'flower' ? 'flower' : 'tree',
      setParam(document?.type === 'flower' ? '/flower-lab/' : '/tree-lab/', 'recipe', encodedDocument),
    );
    case 'rock-project': return direct('rock', setParam('/rock-lab/', 'rockProject', id));
    case 'debris-project': return direct('debris', setParam('/debris-lab/', 'debrisRecipe', encodedDocument));
    case 'grass-preset': return direct('grass', setParam('/grass-lab/', 'grassPreset', id));
    case 'water-preset': return direct('water', setParam('/water-lab/', 'waterDoc', encodedDocument));
    case 'sky-preset': return direct('sky', setParam('/sky-lab/', 'skyStyle', id));
    case 'weather-preset': return direct('weather', setParam('/weather-lab/', 'weatherCondition', id));
    case 'world-preset': return direct('world', setParam('/playground/', 'worldPreset', id));
    case 'prop-asset': return { kind: 'model', mode: 'model', supportsCompare: true };
    case 'environment-preset': return direct('environment', setParam('/environment-lab/', 'envStyle', id));
    case 'manufactured-surface-profile': return direct('manufactured material', setParam('/manufactured-material-lab/', 'manufacturedStyle', id), true);
    case 'vegetation-shader-preset': {
      if (vegetationScope === 'toonlab/tree-shader-preset') {
        return direct('tree shader', setParam('/tree-shader-lab/', 'treeShader', id));
      }
      if (vegetationScope === 'toonlab/grass-shader-preset') {
        return direct('grass shader', setParam('/grass-shader-lab/', 'grassShader', id));
      }
      if (vegetationScope === 'toonlab/flower-shader-preset') {
        return direct('flower shader', setParam('/flower-shader-lab/', 'flowerShader', id));
      }
      return direct('vegetation shader', setParam('/vegetation-shader-lab/', 'vegetationShader', id));
    }
    case 'tree-shader-preset': return direct('tree shader', setParam('/tree-shader-lab/', 'treeShader', id));
    case 'grass-shader-preset': return direct('grass shader', setParam('/grass-shader-lab/', 'grassShader', id));
    case 'flower-shader-preset': return direct('flower shader', setParam('/flower-shader-lab/', 'flowerShader', id));
    case 'rock-shader-preset': return direct('rock shader', setParam('/rock-shader-lab/', 'rockShader', id));
    case 'ground-shader-preset': return direct('ground shader', setParam('/ground-shader-lab/', 'groundShader', id));
    case 'sky-params': return direct('sky and cloud', setParam('/sky-cloud-lab/', 'skyStyle', id));
    case 'cloud-shader-preset': return direct('cloud shader', setParam('/cloud-shader-lab/', 'skyStyle', id));
    case 'texture-recipe': return direct('texture', setParam('/texture-lab/', 'textureRecipe', encodedDocument), true);
    case 'style-bundle': return direct('style bundle', setParam('/shader-lab/', 'styleBundle', id));
    case 'generated-image': return { kind: 'image', mode: 'image', supportsCompare: false };
    default: return null;
  }
}

function readArray(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function upsertArray(key, id, value, identify = (entry) => entry?.id) {
  const entries = readArray(key);
  const index = entries.findIndex((entry) => String(identify(entry) ?? '') === id);
  if (index >= 0) entries[index] = value;
  else entries.push(value);
  window.localStorage.setItem(key, JSON.stringify(entries));
}

/** Stage the server-backed Library document into the exact OSS lab store. */
export function stageLibraryLivePreview(entry) {
  const document = rawLibraryDocument(entry);
  const type = creationType(entry);
  const id = documentId(entry, document);
  if (!type || !id) return;
  try {
    if (type === 'toon-preset') upsertArray('toonlab.toonPresets.v1', id, document);
    else if (type === 'rock-project') {
      upsertArray('toonlab.rockGeneration.library.v1', id, {
        document: JSON.stringify(document), id, name: document.name ?? entry.label ?? id,
        updatedAt: new Date().toISOString(),
      });
    } else if (type === 'grass-preset') upsertArray('toonlab.grassPresets.v1', id, document);
    else if (type === 'sky-preset') upsertArray('toonlab.skyShaderLab.presets.v2', id, document);
    else if (type === 'weather-preset') upsertArray('toonlab.weatherPresets.v1', id, document);
    else if (type === 'world-preset') upsertArray('toonlab.worldPresets.v1', id, document);
    else if (type === 'environment-preset') upsertArray('toonlab.environmentPresets.v1', id, document);
    else if (type === 'manufactured-surface-profile') upsertArray('toonlab.manufacturedSurface.library.v1', id, document);
    else if (['vegetation-shader-preset', 'tree-shader-preset', 'grass-shader-preset', 'flower-shader-preset'].includes(type)) {
      const scope = String(document?.type ?? '').includes('tree-') ? 'tree'
        : String(document?.type ?? '').includes('grass-') ? 'grass'
          : String(document?.type ?? '').includes('flower-') ? 'flower' : null;
      upsertArray(scope ? `toonlab.vegetationShaderProfiles.${scope}.v1` : 'toonlab.vegetationShaderProfiles.v1', id, document);
    } else if (type === 'rock-shader-preset') {
      upsertArray('toonlab.rockShaderLibrary.v1', id, {
        document: JSON.stringify(document), id, name: document.label ?? entry.label ?? id,
        updatedAt: new Date().toISOString(),
      });
    } else if (type === 'ground-shader-preset') upsertArray('toonlab.groundShaderLibrary.v1', id, document);
    else if (type === 'sky-params' || type === 'cloud-shader-preset') {
      upsertArray('toonlab.skyCloudLab.styles.v1', id, { document, workspace: 'integration' }, (record) => record?.document?.id);
    }
  } catch (error) {
    console.warn('[library-preview] Could not stage the saved document for its lab.', error);
  }
}

export function libraryFormat(entry) {
  if (isLibraryModel(entry)) return '3D model';
  if (entry?.type === 'generated-image') return 'Image';
  if (entry?.type === 'style-bundle' || rawLibraryDocument(entry)?.schema === 'toonlab/style-bundle') return 'Style bundle';
  if (entry?.type === 'prop-asset') return 'Asset document';
  return 'ToonLab recipe';
}
