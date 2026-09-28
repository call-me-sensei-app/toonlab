import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  downloadProviderAsset,
  pollMeshyTask,
  runProvider,
} from '../database/providers.mjs';
import { resolveGenerationPlan } from '../database/generation-service.mjs';

const originalFetch = globalThis.fetch;
const originalKeys = {
  ARK_API_KEY: process.env.ARK_API_KEY,
  FAL_KEY: process.env.FAL_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MESHY_API_KEY: process.env.MESHY_API_KEY,
  TRIPO_API_KEY: process.env.TRIPO_API_KEY,
};

process.env.ARK_API_KEY = 'test-ark';
process.env.FAL_KEY = 'test-fal';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.MESHY_API_KEY = 'test-meshy';
process.env.TRIPO_API_KEY = 'test-tripo';

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json' },
  status,
});

try {
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: Buffer.from('gemini-image').toString('base64'),
              mimeType: 'image/png',
            },
          }],
        },
      }],
    });
  };
  const gemini = await runProvider('gemini', {
    aspectRatio: '16:9',
    kind: 'concept_image',
    model: 'gemini-image-test',
    prompt: 'lantern',
    referenceImages: [{ bytes: Uint8Array.of(1, 2, 3), mimeType: 'image/png' }],
    resolution: '2k',
  });
  assert.equal(Buffer.from(gemini.bytes).toString(), 'gemini-image');
  assert.match(calls[0].url, /gemini-image-test:generateContent$/);
  const geminiBody = JSON.parse(calls[0].init.body);
  assert.match(geminiBody.contents[0].parts[0].text, /^Game asset concept: lantern/);
  assert.equal(geminiBody.contents[0].parts[1].inlineData.data, 'AQID');
  assert.equal(geminiBody.generationConfig.imageConfig.aspectRatio, '16:9');
  assert.equal(geminiBody.generationConfig.imageConfig.imageSize, '2K');

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      data: [{ b64_json: Buffer.from('openai-image').toString('base64') }],
    });
  };
  const openai = await runProvider('openai', {
    aspectRatio: '4:3',
    kind: 'image',
    model: 'gpt-image-test',
    prompt: 'painted shrine',
    referenceImages: [{ bytes: Uint8Array.of(4, 5, 6), mimeType: 'image/webp' }],
    resolution: '2k',
  });
  assert.equal(Buffer.from(openai.bytes).toString(), 'openai-image');
  assert.match(calls[0].url, /\/images\/edits$/);
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.body.get('size'), '2048x1536');
  assert.equal(calls[0].init.body.getAll('image[]').length, 1);

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      data: [{ b64_json: Buffer.from('ark-image').toString('base64') }],
    });
  };
  await runProvider('ark', {
    aspectRatio: '3:4',
    kind: 'image',
    model: 'seedream-test',
    prompt: 'painted shrine',
    resolution: '4k',
  });
  assert.equal(JSON.parse(calls[0].init.body).size, '2880x3840');

  calls = [];
  let uploadIndex = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    if (String(url).endsWith('/upload')) {
      uploadIndex += 1;
      return jsonResponse({ code: 0, data: { image_token: `view-${uploadIndex}` } });
    }
    return jsonResponse({ code: 0, data: { task_id: 'tripo-task' } });
  };
  const tripo = await runProvider('tripo', {
    kind: 'multiview_to_model',
    viewImages: [
      { bytes: Uint8Array.of(1), mimeType: 'image/png' },
      { bytes: Uint8Array.of(2), mimeType: 'image/jpeg' },
      null,
      null,
    ],
  });
  assert.equal(tripo.taskId, 'tripo-task');
  assert.equal(calls.filter((call) => call.url.endsWith('/upload')).length, 2);
  const tripoTask = calls.find((call) => call.url.endsWith('/task'));
  const tripoBody = JSON.parse(tripoTask.init.body);
  assert.equal(tripoBody.type, 'multiview_to_model');
  assert.equal(tripoBody.model_version, 'v2.5-20250123');
  assert.deepEqual(tripoBody.files, [
    { file_token: 'view-1', type: 'png' },
    { file_token: 'view-2', type: 'jpg' },
    {},
    {},
  ]);

  calls = [];
  uploadIndex = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    if (String(url).endsWith('/upload')) {
      uploadIndex += 1;
      return jsonResponse({ code: 0, data: { image_token: `p1-view-${uploadIndex}` } });
    }
    return jsonResponse({ code: 0, data: { task_id: 'tripo-p1-task' } });
  };
  const tripoP1 = await runProvider('tripo', {
    exportUv: true,
    faceLimit: 20_000,
    kind: 'multiview_to_model',
    modelSeed: 260817,
    modelVersion: 'P1-20260311',
    pbr: true,
    texture: true,
    textureAlignment: 'original_image',
    textureQuality: 'extreme',
    textureSeed: 260818,
    viewImages: [
      { bytes: Uint8Array.of(1), mimeType: 'image/png' },
      { bytes: Uint8Array.of(2), mimeType: 'image/png' },
    ],
  });
  assert.equal(tripoP1.modelVersion, 'P1-20260311');
  assert.equal(tripoP1.taskId, 'tripo-p1-task');
  const tripoP1Task = calls.find((call) => call.url.endsWith('/task'));
  assert.deepEqual(JSON.parse(tripoP1Task.init.body), {
    type: 'multiview_to_model',
    model_version: 'P1-20260311',
    files: [
      { file_token: 'p1-view-1', type: 'png' },
      { file_token: 'p1-view-2', type: 'png' },
    ],
    face_limit: 20_000,
    model_seed: 260817,
    texture_seed: 260818,
    texture: true,
    pbr: true,
    export_uv: true,
    texture_quality: 'extreme',
    texture_alignment: 'original_image',
  });

  calls = [];
  uploadIndex = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    if (String(url).endsWith('/upload')) {
      uploadIndex += 1;
      return jsonResponse({ code: 0, data: { image_token: `v31-view-${uploadIndex}` } });
    }
    return jsonResponse({ code: 0, data: { task_id: 'tripo-v31-ultra-task' } });
  };
  const tripoV31 = await runProvider('tripo', {
    exportUv: true,
    faceLimit: 2_000_000,
    geometryQuality: 'detailed',
    kind: 'multiview_to_model',
    modelSeed: 260817,
    modelVersion: 'v3.1-20260211',
    pbr: true,
    texture: true,
    textureAlignment: 'original_image',
    textureQuality: 'extreme',
    textureSeed: 260818,
    viewImages: [
      { bytes: Uint8Array.of(1), mimeType: 'image/png' },
      { bytes: Uint8Array.of(2), mimeType: 'image/png' },
    ],
  });
  assert.equal(tripoV31.modelVersion, 'v3.1-20260211');
  assert.equal(tripoV31.taskId, 'tripo-v31-ultra-task');
  const tripoV31Task = calls.find((call) => call.url.endsWith('/task'));
  assert.deepEqual(JSON.parse(tripoV31Task.init.body), {
    type: 'multiview_to_model',
    model_version: 'v3.1-20260211',
    files: [
      { file_token: 'v31-view-1', type: 'png' },
      { file_token: 'v31-view-2', type: 'png' },
    ],
    face_limit: 2_000_000,
    model_seed: 260817,
    texture_seed: 260818,
    texture: true,
    pbr: true,
    export_uv: true,
    texture_quality: 'extreme',
    texture_alignment: 'original_image',
    geometry_quality: 'detailed',
  });

  await assert.rejects(
    runProvider('tripo', {
      kind: 'image_to_model',
      modelVersion: 'P1-20260311',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
      textureQuality: 'maximum',
    }),
    /standard, detailed, or extreme/,
  );

  await assert.rejects(
    runProvider('tripo', {
      faceLimit: 20_001,
      kind: 'image_to_model',
      modelVersion: 'P1-20260311',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
    }),
    /48 through 20000/,
  );

  await assert.rejects(
    runProvider('tripo', {
      faceLimit: 2_000_001,
      geometryQuality: 'detailed',
      kind: 'image_to_model',
      modelVersion: 'v3.1-20260211',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
    }),
    /48 through 2000000/,
  );

  await assert.rejects(
    runProvider('tripo', {
      geometryQuality: 'detailed',
      kind: 'image_to_model',
      modelVersion: 'P1-20260311',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
    }),
    /supported only/,
  );

  await assert.rejects(
    runProvider('tripo', {
      kind: 'image_to_model',
      modelVersion: 'P1 bad value',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
    }),
    /snapshot identifier/,
  );

  calls = [];
  const meshyImageTaskId = 'meshy-image-task';
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({ result: meshyImageTaskId });
  };
  const meshyImage = await runProvider('meshy', {
    kind: 'image_to_model',
    referenceImages: [{ bytes: Uint8Array.of(1, 2, 3), mimeType: 'image/png' }],
  });
  assert.equal(meshyImage.taskId, 'meshy-image-task');
  const meshyImageBody = JSON.parse(calls[0].init.body);
  assert.equal(meshyImageBody.ai_model, 'meshy-7');
  assert.match(meshyImageBody.image_url, /^data:image\/png;base64,/);
  assert.deepEqual(meshyImageBody.target_formats, ['glb']);

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({ result: 'meshy-multi-task' });
  };
  const meshyMulti = await runProvider('meshy', {
    alphaThumbnail: true,
    imageEnhancement: false,
    kind: 'multiview_to_model',
    pbr: true,
    removeLighting: true,
    shouldRemesh: false,
    texture: true,
    texturePrompt: 'Claron Formation orange-pink limestone, neutral albedo, no baked shadows.',
    textureResolution: '8k',
    viewImages: [
      { bytes: Uint8Array.of(1), mimeType: 'image/png' },
      { bytes: Uint8Array.of(2), mimeType: 'image/jpeg' },
    ],
  });
  assert.equal(meshyMulti.taskId, 'meshy-multi-task');
  assert.match(calls[0].url, /\/openapi\/v1\/multi-image-to-3d$/);
  const meshyMultiBody = JSON.parse(calls[0].init.body);
  assert.equal(meshyMultiBody.ai_model, 'meshy-7');
  assert.equal(meshyMultiBody.image_urls.length, 2);
  assert.equal(meshyMultiBody.texture_resolution, '8k');
  assert.equal(meshyMultiBody.image_enhancement, false);
  assert.equal(meshyMultiBody.remove_lighting, true);
  assert.equal(meshyMultiBody.should_remesh, false);
  assert.match(meshyMultiBody.texture_prompt, /Claron Formation/);

  await assert.rejects(
    runProvider('meshy', {
      kind: 'image_to_model',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
      textureResolution: '16k',
    }),
    /2k, 4k, or 8k/,
  );

  await assert.rejects(
    runProvider('meshy', {
      kind: 'image_to_model',
      referenceImages: [{ bytes: Uint8Array.of(1), mimeType: 'image/png' }],
      texturePrompt: 'x'.repeat(601),
    }),
    /at most 600 characters/,
  );

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      images: [
        { url: 'https://fal.media/preview.png' },
        { url: 'https://fal.media/base.png', map_type: 'basecolor', width: 8192, height: 8192 },
        { url: 'https://fal.media/normal.png', map_type: 'normal' },
      ],
      prompt: 'expanded weathered copper',
      seed: 42,
    });
  };
  const material = await runProvider('fal', {
    kind: 'material',
    prompt: 'weathered copper',
    resolution: '8k',
    maps: ['basecolor', 'normal'],
  });
  assert.equal(calls[0].url, 'https://fal.run/fal-ai/patina/material');
  assert.equal(calls[0].init.headers.authorization, 'Key test-fal');
  const patinaBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(patinaBody.image_size, { width: 2048, height: 2048 });
  assert.equal(patinaBody.upscale_factor, 4);
  assert.deepEqual(patinaBody.maps, ['basecolor', 'normal']);
  assert.deepEqual(material.material.images.map((image) => image.mapType), [null, 'basecolor', 'normal']);
  assert.equal(material.material.seed, 42);

  const configuration = {
    providers: { fal: true, gemini: true, meshy: true, tripo: true },
    imageModels: [
      {
        configured: true,
        id: 'nano-banana-2',
        label: 'Nano Banana 2',
        model: 'gemini-3.1-flash-image',
        provider: 'gemini',
        resolutions: ['1k', '2k', '4k'],
      },
    ],
  };
  const textPlan = resolveGenerationPlan({
    image_model: 'nano-banana-2',
    kind: 'text_to_model',
    model_provider: 'meshy',
    resolution: '2k',
  }, configuration);
  assert.equal(textPlan.textViaImage, true);
  assert.equal(textPlan.provider, 'meshy');
  assert.equal(textPlan.imageModel.model, 'gemini-3.1-flash-image');
  assert.equal(textPlan.resolution, '2k');
  const materialPlan = resolveGenerationPlan({ kind: 'material', resolution: '8k' }, configuration);
  assert.equal(materialPlan.provider, 'fal');
  assert.equal(materialPlan.resolution, '8k');

  globalThis.fetch = async () => jsonResponse({
    model_urls: { glb: 'https://assets.meshy.ai/model.glb' },
    progress: 100,
    status: 'SUCCEEDED',
    thumbnail_url: 'https://assets.meshy.ai/preview.png',
  });
  const meshyTask = await pollMeshyTask('meshy-image-task', 'image_to_model');
  assert.equal(meshyTask.status, 'success');
  assert.equal(meshyTask.output.model, 'https://assets.meshy.ai/model.glb');

  let unsafeFetchCalled = false;
  globalThis.fetch = async () => {
    unsafeFetchCalled = true;
    return new Response();
  };
  await assert.rejects(
    downloadProviderAsset('http://127.0.0.1/private'),
    /unsafe asset URL/,
  );
  assert.equal(unsafeFetchCalled, false);

  const app = await readFile(new URL('../labs/generate/App.jsx', import.meta.url), 'utf8');
  const route = await readFile(new URL('../mcp/vite-plugin.mjs', import.meta.url), 'utf8');
  const provider = await readFile(new URL('../database/providers.mjs', import.meta.url), 'utf8');
  const patina = await readFile(new URL('../database/fal-patina.mjs', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../database/repository.mjs', import.meta.url), 'utf8');
  const mcp = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  const primitives = await readFile(new URL('../labs/shared/proPrimitives.css', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /character/i);
  assert.match(app, /Multi-view/);
  assert.match(app, /AI Enhance/);
  assert.match(app, /Generate 3D automatically/);
  assert.match(app, /textViaImage/);
  assert.match(app, /Concept image model/);
  assert.match(app, /Save to Library/);
  assert.match(app, /PBR material/);
  assert.match(app, /Combine into one model/);
  assert.match(route, /\/api\/toonlab\/reference-url/);
  assert.match(route, /\/api\/toonlab\/generate\/enhance/);
  assert.match(route, /\/api\/toonlab\/generation\//);
  assert.match(route, /OSS image generation currently supports Gemini only/);
  assert.match(provider, /\/images\/edits/);
  assert.match(provider, /multiview_to_model/);
  assert.match(provider, /meshy-7/);
  assert.match(provider, /fal\.run/);
  assert.match(patina, /fal-ai\/patina\/material/);
  assert.match(mcp, /generate_ai_asset/);
  assert.match(mcp, /save_generated_asset/);
  assert.match(repository, /modelProviders/);
  assert.match(repository, /materialModels/);
  assert.match(provider, /mesh_segmentation/);
  assert.doesNotMatch(repository, /Seedream 5\.0 Lite/);
  assert.doesNotMatch(repository, /GPT Image 2/);
  assert.match(primitives, /\.tl-btn--primary/);
  assert.match(primitives, /\.tl-empty/);

  console.log('Local Generate provider and UI verification passed.');
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
