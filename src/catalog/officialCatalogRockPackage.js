import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

export const OFFICIAL_ROCK_GALLERY_RECIPE_SCHEMA = 'toonlab/rock-gallery-recipe';
export const OFFICIAL_ROCK_MATERIAL_SCHEMA = 'toonlab.pro-rock-material';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (!isRecord(value)) return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)]),
  ));
}

function artifactName(value) {
  return String(value ?? '').trim().replace(/^\.\//u, '').toLowerCase();
}

export function findOfficialCatalogArtifact(asset, ...names) {
  const wanted = new Set(names.map(artifactName));
  return asset?.artifacts?.find((artifact) => wanted.has(artifactName(artifact.name))) ?? null;
}

export function getOfficialCatalogArtifactUrl(asset, ...names) {
  return findOfficialCatalogArtifact(asset, ...names)?.url ?? null;
}

async function fetchJson(fetchImpl, url, label) {
  if (!url) return null;
  if (typeof fetchImpl !== 'function') throw new TypeError(`${label} requires fetch().`);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response?.ok) {
    throw new Error(`${label} returned HTTP ${response?.status ?? 'unknown'}: ${url}`);
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`${label} returned invalid JSON: ${url}`, { cause });
  }
}

function validateRecipe(asset, recipe) {
  if (!recipe) return null;
  if (recipe.schema !== OFFICIAL_ROCK_GALLERY_RECIPE_SCHEMA || recipe.version !== 1) {
    throw new Error(`${asset.id} has an unsupported editable rock recipe.`);
  }
  if (recipe.generator?.unit !== 'metre') {
    throw new Error(`${asset.id} editable recipe must use metres.`);
  }
  return frozenCopy(recipe);
}

function validateMaterialConfig(asset, materialConfig) {
  if (!materialConfig) return null;
  if (materialConfig.schema !== OFFICIAL_ROCK_MATERIAL_SCHEMA || materialConfig.version !== 2) {
    throw new Error(`${asset.id} has an unsupported Call Me Sensei material package.`);
  }
  if (materialConfig.assetId !== asset.id || materialConfig.shader?.preset !== 'call_me_sensei') {
    throw new Error(`${asset.id} material package failed identity or preset validation.`);
  }
  if (!isRecord(materialConfig.textures)) {
    throw new Error(`${asset.id} material package has no texture bindings.`);
  }
  return frozenCopy(materialConfig);
}

/**
 * Load the immutable documents associated with a nature-reference rock.
 * Legacy 480 rocks remain valid and simply return null for documents they do
 * not publish.
 */
export async function loadOfficialCatalogRockPackage(asset, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  includeManifest = false,
  includeNatureProvenance = false,
} = {}) {
  if (!asset || asset.domain !== 'natural.rock') {
    throw new TypeError('Official rock package loading requires a normalized natural.rock asset.');
  }
  const files = asset.packageFiles ?? {};
  const [recipeDocument, materialDocument, manifest, natureProvenance] = await Promise.all([
    files.recipeUrl ? fetchJson(fetchImpl, files.recipeUrl, `${asset.id} recipe`) : asset.recipe,
    fetchJson(fetchImpl, files.materialConfigUrl, `${asset.id} material package`),
    includeManifest ? fetchJson(fetchImpl, files.manifestUrl, `${asset.id} manifest`) : null,
    includeNatureProvenance
      ? fetchJson(fetchImpl, files.natureProvenanceUrl, `${asset.id} nature provenance`)
      : null,
  ]);
  const recipe = recipeDocument?.schema === OFFICIAL_ROCK_GALLERY_RECIPE_SCHEMA
    ? validateRecipe(asset, recipeDocument)
    : frozenCopy(asset.recipe);
  const materialConfig = validateMaterialConfig(asset, materialDocument);
  return Object.freeze({
    asset,
    files,
    manifest: frozenCopy(manifest),
    materialConfig,
    natureProvenance: frozenCopy(natureProvenance),
    recipe,
  });
}

function configureRockTexture(texture, descriptor, role) {
  texture.name = `ToonLab ${role} · ${descriptor.url}`;
  texture.colorSpace = descriptor.srgb === true ? SRGBColorSpace : NoColorSpace;
  texture.flipY = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.userData.toonlabOfficialRockRole = role;
  texture.userData.toonlabOfficialRockUrl = descriptor.url;
  texture.needsUpdate = true;
  return texture;
}

/** Load the exact texture slots consumed by applyRockShader(). */
export async function loadOfficialCatalogRockShaderInput(rockPackage, {
  textureLoader = new TextureLoader(),
} = {}) {
  const config = rockPackage?.materialConfig;
  if (!config) return null;
  const textures = {};
  await Promise.all(Object.entries(config.textures).map(async ([role, descriptor]) => {
    if (!descriptor?.url) throw new Error(`${config.assetId}/${role} has no immutable texture URL.`);
    const texture = await textureLoader.loadAsync(descriptor.url);
    textures[role] = configureRockTexture(texture, descriptor, role);
  }));
  return Object.freeze({
    materialConfig: config,
    settings: frozenCopy(config.shader?.settings ?? {}),
    textures: Object.freeze(textures),
  });
}

/**
 * Portable hand-off for Rock Lab or another editor. Geometry derivatives are
 * deliberately separate: edits target control.glb, while retained high, LODs,
 * collision, and baked/runtime outputs can be regenerated or replaced.
 */
export function createOfficialCatalogRockEditorDescriptor(asset, rockPackage = null) {
  if (!asset || asset.domain !== 'natural.rock') {
    throw new TypeError('Official rock editor descriptors require a normalized natural.rock asset.');
  }
  const recipe = rockPackage?.recipe ?? asset.recipe;
  const files = asset.packageFiles ?? {};
  if (recipe?.schema !== OFFICIAL_ROCK_GALLERY_RECIPE_SCHEMA) return null;
  return Object.freeze({
    assetId: asset.id,
    controlModelUrl: files.controlModelUrl,
    cullBelowPixels: asset.lod?.cullBelowPixels ?? recipe.output?.cullBelowPixels ?? 0,
    editing: frozenCopy(recipe.editing ?? {}),
    lodModelUrls: asset.lod?.urls ?? files.lodModelUrls ?? Object.freeze([]),
    materialConfigUrl: files.materialConfigUrl,
    recipe: frozenCopy(recipe),
    recipeUrl: files.recipeUrl,
    retainedHighModelUrl: files.retainedHighModelUrl,
    collisionModelUrl: files.collisionModelUrl,
    worldUnitMetres: recipe.generator?.unit === 'metre' ? 1 : null,
  });
}
