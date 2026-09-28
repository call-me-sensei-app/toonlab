import {
  createPatinaInput,
  normalizePatinaResult,
  PATINA_MATERIAL_MODEL,
} from './fal-patina.mjs';

const IMAGE_KINDS = new Set(['image', 'texture_image', 'concept_image']);
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';
const TRIPO_MODEL_VERSION = 'v2.5-20250123';
const MESHY_API_BASE = 'https://api.meshy.ai/openapi';
export const MESHY_MODEL_VERSION = 'meshy-7';

const KIND_PROMPTS = {
  image: { prefix: '', suffix: '' },
  texture_image: {
    prefix: 'Seamless tileable game texture, top-down orthographic view: ',
    suffix: '. Flat even lighting, no shadows cast by external objects, no vignette, edge-to-edge pattern that tiles perfectly, stylized hand-painted look suitable for a toon-shaded game.',
  },
  concept_image: {
    prefix: 'Game asset concept: ',
    suffix: '. Single object centered on a plain light neutral background, three-quarter view, full object in frame, no cropping, stylized hand-painted game-art look, clean silhouette, no text or watermarks.',
  },
};

const TRIPO_STYLES = {
  stylized: ', stylized low-poly game asset, clean silhouette, simple flat shapes',
  cartoon: ', cartoon style, cel shaded look, bold flat colors, chunky proportions',
  raw: '',
};

const IMAGE_SIZES = {
  '1k': {
    '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280',
    '4:3': '1152x864', '3:4': '864x1152',
  },
  '2k': {
    '1:1': '2048x2048', '16:9': '1920x1088', '9:16': '1088x1920',
    '4:3': '2048x1536', '3:4': '1536x2048',
  },
  '4k': {
    '1:1': '2880x2880', '16:9': '3840x2160', '9:16': '2160x3840',
    '4:3': '3072x2304', '3:4': '2304x3072',
  },
};

const ARK_IMAGE_SIZES = {
  ...IMAGE_SIZES,
  '2k': {
    '1:1': '2048x2048', '16:9': '2848x1600', '9:16': '1600x2848',
    '4:3': '2400x1800', '3:4': '1800x2400',
  },
  '4k': {
    '1:1': '4096x4096', '16:9': '3840x2160', '9:16': '2160x3840',
    '4:3': '3840x2880', '3:4': '2880x3840',
  },
};

function providerKey(provider) {
  const names = {
    ark: ['ARK_API_KEY', 'ARK_API_KEYS'],
    fal: ['FAL_KEY', 'FAL_KEYS'],
    gemini: ['GEMINI_API_KEY', 'GEMINI_API_KEYS'],
    openai: ['OPENAI_API_KEY', 'OPENAI_API_KEYS'],
    tripo: ['TRIPO_API_KEY', 'TRIPO_API_KEYS'],
    meshy: ['MESHY_API_KEY', 'MESHY_API_KEYS'],
  }[provider] ?? [];
  for (const name of names) {
    const key = String(process.env[name] ?? '').split(',')[0].trim();
    if (key) return key;
  }
  throw new Error(`${provider} is not configured in the server environment`);
}

async function runFalPatina(request, key) {
  if (request.kind !== 'material') throw new Error(`Fal cannot serve generation kind ${request.kind}.`);
  const input = createPatinaInput(request);
  const response = await fetch(`https://fal.run/${PATINA_MATERIAL_MODEL}`, {
    body: JSON.stringify(input),
    headers: {
      authorization: `Key ${key}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(15 * 60_000),
  });
  const data = await checkedJson(response, 'Fal Patina');
  return {
    material: normalizePatinaResult(data, input),
    provider: 'fal',
  };
}

function boundedProviderText(value, maximumLength = 500) {
  if (value === undefined || value === null) return null;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximumLength) || null;
}

function sanitizedTraceId(value) {
  const traceId = boundedProviderText(value, 160);
  if (!traceId) return null;
  return /^[A-Za-z0-9._:/-]+$/.test(traceId) ? traceId : '[redacted-invalid-trace-id]';
}

function providerErrorMetadata(response, body, context = {}) {
  const providerCode = body?.error?.code ?? body?.code ?? null;
  return {
    providerCode: typeof providerCode === 'number' || typeof providerCode === 'string'
      ? providerCode
      : null,
    providerMessage: boundedProviderText(body?.error?.message ?? body?.message),
    providerRequestPhase: boundedProviderText(context.requestPhase, 64),
    providerResponseReceived: true,
    providerStatus: response.status,
    providerSuggestion: boundedProviderText(body?.error?.suggestion ?? body?.suggestion),
    retryAfter: boundedProviderText(response.headers.get('retry-after'), 160),
    traceId: sanitizedTraceId(response.headers.get('x-tripo-trace-id')),
  };
}

function createProviderResponseError(provider, response, body, context = {}) {
  const metadata = providerErrorMetadata(response, body, context);
  return Object.assign(new Error(`${provider} request failed (${response.status}): ${
    metadata.providerMessage ?? 'unknown provider error'
  }`), metadata);
}

export async function checkedJson(response, provider, context = {}) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw createProviderResponseError(provider, response, body, context);
  }
  return body;
}

function steeredPrompt(request) {
  const steering = KIND_PROMPTS[request.kind] ?? KIND_PROMPTS.image;
  return `${steering.prefix}${request.prompt ?? request.user ?? ''}${steering.suffix}`;
}

function imageSize(request, { ark = false } = {}) {
  const resolution = request.resolution ?? '1k';
  const aspect = request.kind === 'texture_image' ? '1:1' : (request.aspectRatio ?? '1:1');
  const sizes = ark ? ARK_IMAGE_SIZES : IMAGE_SIZES;
  return sizes[resolution]?.[aspect] ?? sizes['1k']['1:1'];
}

function decodeImage(body, provider) {
  const encoded = body?.data?.find?.((entry) => entry?.b64_json)?.b64_json;
  if (!encoded) throw new Error(`${provider} returned no image`);
  return {
    bytes: Uint8Array.from(Buffer.from(encoded, 'base64')),
    contentType: 'image/png',
    provider,
  };
}

async function runGemini(request, key) {
  const imageRequest = IMAGE_KINDS.has(request.kind);
  const resolution = request.resolution ?? '1k';
  const model = request.model || (imageRequest
    ? (resolution === '1k' ? 'gemini-3.1-flash-lite-image' : 'gemini-3-pro-image')
    : 'gemini-2.5-flash');
  const aspectRatio = request.kind === 'texture_image' ? '1:1' : (request.aspectRatio ?? undefined);
  const imageSizeValue = resolution === '2k' ? '2K' : resolution === '4k' ? '4K' : undefined;
  const parts = imageRequest
    ? [
        { text: steeredPrompt(request) },
        ...(request.referenceImages ?? []).slice(0, 6).map((reference) => ({
          inlineData: {
            data: Buffer.from(reference.bytes).toString('base64'),
            mimeType: reference.mimeType,
          },
        })),
      ]
    : [{ text: request.user ?? request.prompt ?? '' }];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      body: JSON.stringify({
        contents: [{ parts, role: 'user' }],
        generationConfig: imageRequest
          ? {
              responseModalities: ['IMAGE'],
              ...((aspectRatio || imageSizeValue)
                ? {
                    imageConfig: {
                      ...(aspectRatio ? { aspectRatio } : {}),
                      ...(imageSizeValue ? { imageSize: imageSizeValue } : {}),
                    },
                  }
                : {}),
            }
          : {
              maxOutputTokens: request.maxOutputTokens ?? 4096,
              responseMimeType: request.responseMimeType ?? 'text/plain',
              temperature: request.temperature ?? 0.35,
            },
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      }),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      method: 'POST',
      signal: AbortSignal.timeout(4 * 60_000),
    },
  );
  const body = await checkedJson(response, 'Gemini');
  if (imageRequest) {
    const inline = body?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error('Gemini returned no image');
    return {
      bytes: Uint8Array.from(Buffer.from(inline.data, 'base64')),
      contentType: inline.mimeType || 'image/png',
      provider: 'gemini',
    };
  }
  return {
    provider: 'gemini',
    text: body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
  };
}

async function runOpenAiOrArk(provider, request, key) {
  if (IMAGE_KINDS.has(request.kind)) {
    const isArk = provider === 'ark';
    const baseUrl = isArk
      ? (process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3')
      : 'https://api.openai.com/v1';
    const model = request.model || (isArk
      ? 'seedream-5-0-260128'
      : 'gpt-image-2-2026-04-21');
    const prompt = steeredPrompt(request);
    const references = (request.referenceImages ?? []).slice(0, isArk ? 5 : 16);
    let response;
    if (!isArk && references.length) {
      const form = new FormData();
      form.set('model', model);
      form.set('prompt', prompt);
      form.set('size', imageSize(request));
      form.set('output_format', 'png');
      form.set('n', '1');
      for (const reference of references) {
        form.append(
          'image[]',
          new Blob([reference.bytes], { type: reference.mimeType }),
          `reference.${reference.mimeType.split('/')[1] ?? 'png'}`,
        );
      }
      response = await fetch(`${baseUrl}/images/edits`, {
        body: form,
        headers: { authorization: `Bearer ${key}` },
        method: 'POST',
        signal: AbortSignal.timeout(5 * 60_000),
      });
    } else {
      const encodedReferences = references.map(
        (reference) => `data:${reference.mimeType};base64,${Buffer.from(reference.bytes).toString('base64')}`,
      );
      response = await fetch(`${baseUrl}/images/generations`, {
        body: JSON.stringify({
          model,
          prompt,
          size: imageSize(request, { ark: isArk }),
          ...(isArk
            ? {
                response_format: 'b64_json',
                sequential_image_generation: 'disabled',
                watermark: false,
                ...(encodedReferences.length === 1
                  ? { image: encodedReferences[0] }
                  : encodedReferences.length > 1 ? { image: encodedReferences } : {}),
              }
            : { n: 1, output_format: 'png' }),
        }),
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(5 * 60_000),
      });
    }
    return decodeImage(await checkedJson(response, provider), provider);
  }

  const baseUrl = provider === 'ark'
    ? (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3')
    : 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        ...(request.system ? [{ content: request.system, role: 'system' }] : []),
        { content: request.user ?? request.prompt ?? '', role: 'user' },
      ],
      model: request.model || (provider === 'openai' ? 'gpt-5-mini' : ''),
      ...(request.kind === 'texture-recipe' ? { max_completion_tokens: 4096 } : {}),
      ...(request.jsonMode === true ? { response_format: { type: 'json_object' } } : {}),
    }),
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(2 * 60_000),
  });
  const body = await checkedJson(response, provider);
  return {
    provider,
    text: body?.choices?.[0]?.message?.content ?? '',
  };
}

async function tripoJson(path, key, init = {}) {
  const response = await fetch(`${TRIPO_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(2 * 60_000),
  });
  const requestPhase = path === '/task' && init.method === 'POST'
    ? 'task-create'
    : path === '/upload' && init.method === 'POST'
      ? 'image-upload'
      : path.startsWith('/task/') && init.method === 'GET'
        ? 'task-poll'
        : 'tripo-request';
  const envelope = await checkedJson(response, 'Tripo', { requestPhase });
  if (envelope?.code !== 0 || !envelope?.data) {
    throw createProviderResponseError('Tripo', response, envelope, { requestPhase });
  }
  return envelope.data;
}

async function uploadTripoImage(reference, key) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([reference.bytes], { type: reference.mimeType }),
    `reference.${reference.mimeType.split('/')[1] ?? 'png'}`,
  );
  const data = await tripoJson('/upload', key, { body: form, method: 'POST' });
  if (!data.image_token) throw new Error('Tripo upload returned no image token');
  return {
    file_token: data.image_token,
    type: reference.mimeType.includes('jpeg') ? 'jpg' : reference.mimeType.split('/')[1] || 'png',
  };
}

function tripoModelVersion(request) {
  const modelVersion = request.modelVersion ?? TRIPO_MODEL_VERSION;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(modelVersion)) {
    throw new RangeError('Tripo modelVersion must be a provider snapshot identifier.');
  }
  return modelVersion;
}

function tripoGenerationOptions(request, modelVersion) {
  const options = {};
  if (request.faceLimit !== undefined) {
    const geometryQuality = request.geometryQuality ?? 'standard';
    const maximumByModel = {
      'P1-20260311': 20_000,
      'v2.5-20250123': 500_000,
      'v3.0-20250812': geometryQuality === 'detailed' ? 2_000_000 : 1_500_000,
      'v3.1-20260211': geometryQuality === 'detailed' ? 2_000_000 : 1_500_000,
    };
    const maximum = maximumByModel[modelVersion];
    if (maximum === undefined) {
      throw new RangeError(`Explicit Tripo faceLimit is not verified for model ${modelVersion}.`);
    }
    if (!Number.isInteger(request.faceLimit) || request.faceLimit < 48 || request.faceLimit > maximum) {
      throw new RangeError(`Tripo ${modelVersion} faceLimit must be an integer from 48 through ${maximum}.`);
    }
    options.face_limit = request.faceLimit;
  }
  if (request.modelSeed !== undefined) {
    if (!Number.isSafeInteger(request.modelSeed)) throw new RangeError('Tripo modelSeed must be a safe integer.');
    options.model_seed = request.modelSeed;
  }
  if (request.textureSeed !== undefined) {
    if (!Number.isSafeInteger(request.textureSeed)) throw new RangeError('Tripo textureSeed must be a safe integer.');
    options.texture_seed = request.textureSeed;
  }
  for (const [requestKey, payloadKey] of [
    ['texture', 'texture'],
    ['pbr', 'pbr'],
    ['exportUv', 'export_uv'],
  ]) {
    if (request[requestKey] !== undefined) {
      if (typeof request[requestKey] !== 'boolean') {
        throw new TypeError(`Tripo ${requestKey} must be boolean.`);
      }
      options[payloadKey] = request[requestKey];
    }
  }
  if (request.textureQuality !== undefined) {
    if (!['standard', 'detailed', 'extreme'].includes(request.textureQuality)) {
      throw new RangeError('Tripo textureQuality must be standard, detailed, or extreme.');
    }
    options.texture_quality = request.textureQuality;
  }
  if (request.textureAlignment !== undefined) {
    if (!['original_image', 'geometry'].includes(request.textureAlignment)) {
      throw new RangeError('Tripo textureAlignment must be original_image or geometry.');
    }
    options.texture_alignment = request.textureAlignment;
  }
  if (request.geometryQuality !== undefined) {
    if (!['standard', 'detailed'].includes(request.geometryQuality)) {
      throw new RangeError('Tripo geometryQuality must be standard or detailed.');
    }
    if (!['v3.0-20250812', 'v3.1-20260211'].includes(modelVersion)) {
      throw new RangeError('Tripo geometryQuality is supported only for v3.0-20250812 and v3.1-20260211.');
    }
    options.geometry_quality = request.geometryQuality;
  }
  return options;
}

async function runTripo(request, key) {
  let payload;
  const modelVersion = tripoModelVersion(request);
  if (request.kind === 'image_to_model') {
    const reference = request.referenceImages?.[0];
    if (!reference) throw new Error('Image-to-3D requires one reference image');
    payload = {
      type: 'image_to_model',
      model_version: modelVersion,
      file: await uploadTripoImage(reference, key),
      ...tripoGenerationOptions(request, modelVersion),
    };
  } else if (request.kind === 'multiview_to_model') {
    const views = request.viewImages ?? [];
    if (!views[0] || views.filter(Boolean).length < 2) {
      throw new Error('Multi-view generation requires a front view and at least one additional view');
    }
    payload = {
      type: 'multiview_to_model',
      model_version: modelVersion,
      files: await Promise.all(
        views.slice(0, 4).map((view) => view ? uploadTripoImage(view, key) : {}),
      ),
      ...tripoGenerationOptions(request, modelVersion),
    };
  } else if (request.kind === 'model_segment') {
    if (!request.originalTaskId) throw new Error('Model segmentation requires the original Tripo task id');
    payload = {
      type: 'mesh_segmentation',
      original_model_task_id: request.originalTaskId,
    };
  } else {
    const styleSuffix = TRIPO_STYLES[request.style] ?? TRIPO_STYLES.stylized;
    payload = {
      type: 'text_to_model',
      model_version: modelVersion,
      prompt: `${request.prompt ?? request.user ?? ''}${styleSuffix}`,
      ...tripoGenerationOptions(request, modelVersion),
    };
  }
  const data = await tripoJson('/task', key, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!data.task_id) throw new Error('Tripo task creation returned no task id');
  return {
    modelVersion: request.kind === 'model_segment' ? null : modelVersion,
    pending: true,
    provider: 'tripo',
    taskId: data.task_id,
  };
}

function meshyImageDataUri(reference) {
  if (!reference) throw new Error('Meshy image generation requires a reference image');
  if (!['image/png', 'image/jpeg'].includes(reference.mimeType)) {
    throw new Error('Meshy 7 accepts PNG or JPEG reference images');
  }
  return `data:${reference.mimeType};base64,${Buffer.from(reference.bytes).toString('base64')}`;
}

async function meshyJson(path, key, init = {}) {
  const response = await fetch(`${MESHY_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(2 * 60_000),
  });
  return checkedJson(response, 'Meshy');
}

function meshyGenerationOptions(request) {
  const textureResolution = request.textureResolution ?? '2k';
  if (!['2k', '4k', '8k'].includes(textureResolution)) {
    throw new RangeError('Meshy textureResolution must be 2k, 4k, or 8k.');
  }
  const options = {
    alpha_thumbnail: request.alphaThumbnail ?? true,
    enable_pbr: request.pbr ?? true,
    image_enhancement: request.imageEnhancement ?? true,
    remove_lighting: request.removeLighting ?? true,
    should_remesh: request.shouldRemesh ?? false,
    should_texture: request.texture ?? true,
    target_formats: ['glb'],
    texture_resolution: textureResolution,
  };
  for (const [requestKey, payloadKey] of [
    ['alphaThumbnail', 'alpha_thumbnail'],
    ['imageEnhancement', 'image_enhancement'],
    ['pbr', 'enable_pbr'],
    ['removeLighting', 'remove_lighting'],
    ['shouldRemesh', 'should_remesh'],
    ['texture', 'should_texture'],
  ]) {
    if (request[requestKey] !== undefined && typeof request[requestKey] !== 'boolean') {
      throw new TypeError(`Meshy ${requestKey} must be boolean.`);
    }
    if (request[requestKey] !== undefined) options[payloadKey] = request[requestKey];
  }
  if (request.texturePrompt !== undefined) {
    if (typeof request.texturePrompt !== 'string' || request.texturePrompt.length > 600) {
      throw new RangeError('Meshy texturePrompt must be a string of at most 600 characters.');
    }
    if (request.texturePrompt.trim()) options.texture_prompt = request.texturePrompt.trim();
  }
  return options;
}

async function runMeshy(request, key) {
  let path;
  let payload;
  const shared = {
    ai_model: MESHY_MODEL_VERSION,
    ...meshyGenerationOptions(request),
  };
  if (request.kind === 'image_to_model') {
    path = '/v1/image-to-3d';
    payload = {
      ...shared,
      image_url: meshyImageDataUri(request.referenceImages?.[0]),
      ultra_mode: request.ultraMode === true,
    };
  } else if (request.kind === 'multiview_to_model') {
    const views = (request.viewImages ?? []).filter(Boolean).slice(0, 4);
    if (views.length < 2) throw new Error('Meshy multi-image generation requires at least two views');
    path = '/v1/multi-image-to-3d';
    payload = {
      ...shared,
      image_urls: views.map(meshyImageDataUri),
    };
  } else {
    throw new Error('Meshy 7 does not support this generation kind');
  }
  const data = await meshyJson(path, key, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!data?.result) throw new Error('Meshy task creation returned no task id');
  return {
    modelVersion: MESHY_MODEL_VERSION,
    pending: true,
    provider: 'meshy',
    taskId: data.result,
  };
}

export async function runProvider(provider, request) {
  const key = providerKey(provider);
  if (provider === 'fal') return runFalPatina(request, key);
  if (provider === 'gemini') return runGemini(request, key);
  if (provider === 'openai' || provider === 'ark') {
    return runOpenAiOrArk(provider, request, key);
  }
  if (provider === 'tripo') return runTripo(request, key);
  if (provider === 'meshy') return runMeshy(request, key);
  throw new Error(`Unsupported generation provider: ${provider}`);
}

export async function pollTripoTask(taskId) {
  return tripoJson(`/task/${encodeURIComponent(taskId)}`, providerKey('tripo'), {
    method: 'GET',
  });
}

export async function pollMeshyTask(taskId, kind) {
  const resource = kind === 'multiview_to_model' ? 'v1/multi-image-to-3d' : 'v1/image-to-3d';
  const task = await meshyJson(`/${resource}/${encodeURIComponent(taskId)}`, providerKey('meshy'), {
    method: 'GET',
  });
  const status = {
    PENDING: 'queued',
    IN_PROGRESS: 'running',
    SUCCEEDED: 'success',
    FAILED: 'failed',
    CANCELED: 'cancelled',
  }[task?.status] ?? 'failed';
  return {
    ...task,
    status,
    output: {
      model: task?.model_urls?.glb,
      rendered_image: task?.thumbnail_url ?? task?.alpha_thumbnail_url,
    },
  };
}

export async function downloadProviderAsset(value, { maxBytes = 128 * 1024 * 1024 } = {}) {
  let url = new URL(String(value ?? ''));
  const assertSafe = (candidate) => {
    const host = candidate.hostname.toLowerCase();
    if (
      candidate.protocol !== 'https:'
      || host === 'localhost'
      || host === '::1'
      || /^(?:0\.|127\.|10\.|192\.168\.|169\.254\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    ) {
      throw new Error('Provider returned an unsafe asset URL');
    }
  };
  let response;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    assertSafe(url);
    response = await fetch(url, { redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect === 5) throw new Error('Provider asset redirect was invalid');
    url = new URL(location, url);
  }
  if (!response) throw new Error('Provider asset download failed');
  if (!response.ok) throw new Error(`Provider asset download failed (${response.status})`);
  const announcedBytes = Number(response.headers.get('content-length') ?? 0);
  if (announcedBytes > maxBytes) throw new Error('Provider asset exceeds the download limit');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error('Provider asset was empty');
  if (bytes.byteLength > maxBytes) throw new Error('Provider asset exceeds the download limit');
  return {
    bytes,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    name: url.pathname.split('/').pop() || 'generated-asset',
  };
}
