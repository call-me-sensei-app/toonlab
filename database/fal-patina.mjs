export const PATINA_MATERIAL_MODEL = 'fal-ai/patina/material';
export const PATINA_MAP_TYPES = Object.freeze(['basecolor', 'normal', 'roughness', 'metalness', 'height']);
export const PATINA_RESOLUTIONS = Object.freeze(['1k', '2k', '4k', '8k']);
export const PATINA_IMAGE_SIZE_PRESETS = Object.freeze([
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
]);
export const PATINA_UPSCALE_FACTORS = Object.freeze([0, 2, 4]);

export function patinaResolutionPlan(resolution = '2k') {
  const normalized = String(resolution).toLowerCase();
  if (normalized === '1k') return { imageSize: { width: 1024, height: 1024 }, upscaleFactor: 0 };
  if (normalized === '2k') return { imageSize: { width: 2048, height: 2048 }, upscaleFactor: 0 };
  if (normalized === '4k') return { imageSize: { width: 2048, height: 2048 }, upscaleFactor: 2 };
  if (normalized === '8k') return { imageSize: { width: 2048, height: 2048 }, upscaleFactor: 4 };
  throw new Error(`Fal Patina does not support resolution "${resolution}".`);
}

function integer(value, fallback, min, max, label) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return resolved;
}

function imageSize(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    if (!PATINA_IMAGE_SIZE_PRESETS.includes(value)) throw new Error('Invalid Fal Patina image_size preset.');
    return value;
  }
  if (!value || typeof value !== 'object') throw new Error('image_size must be a preset or { width, height }.');
  return {
    width: integer(value.width, NaN, 256, 2048, 'image_size.width'),
    height: integer(value.height, NaN, 256, 2048, 'image_size.height'),
  };
}

/** Validate and translate ToonLab's camelCase request into Fal's wire schema. */
export function createPatinaInput(request = {}) {
  const prompt = String(request.prompt ?? '').trim();
  if (!prompt) throw new Error('A material prompt is required.');
  const plan = patinaResolutionPlan(request.resolution ?? '2k');
  const requestedMaps = request.maps === undefined ? PATINA_MAP_TYPES : request.maps;
  if (!Array.isArray(requestedMaps)) throw new Error('maps must be an array.');
  const maps = [...new Set(requestedMaps.map(String))];
  if (maps.some((map) => !PATINA_MAP_TYPES.includes(map))) throw new Error('Fal Patina maps contain an unsupported map type.');
  const tilingMode = request.tilingMode ?? request.tiling_mode ?? 'both';
  if (!['both', 'horizontal', 'vertical'].includes(tilingMode)) throw new Error('tiling_mode must be both, horizontal, or vertical.');
  const outputFormat = request.outputFormat ?? request.output_format ?? 'png';
  if (!['png', 'jpeg', 'webp'].includes(outputFormat)) throw new Error('output_format must be png, jpeg, or webp.');
  const upscaleFactor = request.upscaleFactor ?? request.upscale_factor ?? plan.upscaleFactor;
  if (!PATINA_UPSCALE_FACTORS.includes(Number(upscaleFactor))) throw new Error('upscale_factor must be 0, 2, or 4.');
  const input = {
    prompt,
    image_size: imageSize(request.imageSize ?? request.image_size, plan.imageSize),
    num_inference_steps: integer(request.numInferenceSteps ?? request.num_inference_steps, 8, 1, 8, 'num_inference_steps'),
    num_images: integer(request.numImages ?? request.num_images, 1, 1, 4, 'num_images'),
    enable_prompt_expansion: (request.enablePromptExpansion ?? request.enable_prompt_expansion) !== false,
    enable_safety_checker: (request.enableSafetyChecker ?? request.enable_safety_checker) !== false,
    tiling_mode: tilingMode,
    tile_size: integer(request.tileSize ?? request.tile_size, 128, 32, 256, 'tile_size'),
    tile_stride: integer(request.tileStride ?? request.tile_stride, 64, 16, 128, 'tile_stride'),
    maps,
    upscale_factor: Number(upscaleFactor),
    output_format: outputFormat,
  };
  const seed = request.seed;
  if (seed !== undefined) input.seed = integer(seed, 0, -2147483648, 2147483647, 'seed');
  const imageUrl = request.imageUrl ?? request.image_url;
  const maskUrl = request.maskUrl ?? request.mask_url;
  if (imageUrl) {
    if (!/^https:\/\//i.test(String(imageUrl))) throw new Error('image_url must be a public HTTPS URL.');
    input.image_url = String(imageUrl);
    const strength = Number(request.strength ?? 0.6);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error('strength must be from 0 to 1.');
    input.strength = strength;
  }
  if (maskUrl) {
    if (!imageUrl) throw new Error('mask_url requires image_url.');
    if (!/^https:\/\//i.test(String(maskUrl))) throw new Error('mask_url must be a public HTTPS URL.');
    input.mask_url = String(maskUrl);
  }
  return input;
}

export function normalizePatinaResult(data, input) {
  if (!Array.isArray(data?.images)) throw new Error('Fal Patina returned no material images.');
  const images = data.images.map((image) => {
        if (!image || typeof image.url !== 'string' || !/^https:\/\//i.test(image.url)) {
          throw new Error('Fal Patina returned an invalid material image URL.');
        }
        if (image.map_type != null && !PATINA_MAP_TYPES.includes(image.map_type)) {
          throw new Error(`Fal Patina returned an unsupported map type: ${String(image.map_type)}.`);
        }
        return {
          url: image.url,
          mapType: image.map_type == null ? null : image.map_type,
          contentType: typeof image.content_type === 'string' ? image.content_type : null,
          name: typeof image.file_name === 'string' ? image.file_name : null,
          byteSize: Number.isFinite(Number(image.file_size)) ? Number(image.file_size) : null,
          width: Number.isFinite(Number(image.width)) ? Number(image.width) : null,
          height: Number.isFinite(Number(image.height)) ? Number(image.height) : null,
        };
      });
  const variants = Number(input.num_images ?? 1);
  const requestedMaps = Array.isArray(input.maps) ? input.maps : PATINA_MAP_TYPES;
  const previewCount = images.filter((image) => image.mapType === null).length;
  if (previewCount !== variants) {
    throw new Error(`Fal Patina returned ${previewCount} previews; expected ${variants}.`);
  }
  for (const mapType of PATINA_MAP_TYPES) {
    const count = images.filter((image) => image.mapType === mapType).length;
    const expected = requestedMaps.includes(mapType) ? variants : 0;
    if (count !== expected) {
      throw new Error(`Fal Patina returned ${count} ${mapType} maps; expected ${expected}.`);
    }
  }
  return {
    images,
    input,
    prompt: typeof data.prompt === 'string' ? data.prompt : input.prompt,
    seed: Number.isFinite(Number(data.seed)) ? Number(data.seed) : null,
    timings: data.timings && typeof data.timings === 'object' ? data.timings : null,
  };
}
