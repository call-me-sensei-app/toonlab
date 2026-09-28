import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readWorkspaceFile, resolveWorkspacePath } from './workspace.mjs';
import {
  clearLabState,
  annotateCreationRevision,
  cancelGenerationJob,
  createGenerationJob,
  databaseInfo,
  deleteLabState,
  deleteLibraryEntry,
  hasLegacyImport,
  finishGenerationJob,
  getCatalogAsset,
  getCreationRevision,
  getGenerationJob,
  listCatalogAssets,
  listCatalogFacets,
  listGenerationJobs,
  listCreationRevisions,
  listLibraryEntries,
  migrateLegacy,
  providerConfiguration,
  readLabState,
  readObject,
  resolveStyleBundleEntry,
  restoreCreationRevision,
  saveLibraryEntry,
  saveObject,
  setLabState,
  updateGenerationJob,
} from '../database/repository.mjs';
import {
  downloadProviderAsset,
  pollMeshyTask,
  pollTripoTask,
  runProvider,
} from '../database/providers.mjs';
import { storeManagedMaterial } from '../database/generation-service.mjs';

const JSON_LIMIT = 8 * 1024 * 1024;
const FILE_LIMIT = 128 * 1024 * 1024;

function readBody(request, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function readJsonBody(request) {
  const body = await readBody(request, JSON_LIMIT);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(`${JSON.stringify(value)}\n`);
}

function methodNotAllowed(response, methods) {
  response.setHeader('allow', methods.join(', '));
  sendJson(response, 405, { error: 'Method not allowed.' });
}

function clientFile(file) {
  if (!file) return null;
  const relativePath = String(file.relativePath ?? '');
  return {
    byteSize: Number(file.byteSize ?? file.sizeBytes ?? file.byte_size ?? 0),
    contentType: file.mimeType ?? file.content_type ?? 'application/octet-stream',
    id: file.id,
    kind: file.kind,
    name: file.name ?? relativePath.split('/').pop() ?? 'asset',
    relativePath,
    url: relativePath
      ? `/api/toonlab/files/${encodeURIComponent(relativePath)}`
      : null,
  };
}

function clientJob(job) {
  if (!job) return null;
  const result = job.result && typeof job.result === 'object'
    ? {
        ...job.result,
        ...(job.result.file ? { file: clientFile(job.result.file) } : {}),
        ...(job.result.previewFile ? { previewFile: clientFile(job.result.previewFile) } : {}),
        ...(job.result.materialBundle ? {
          materialBundle: {
            ...job.result.materialBundle,
            manifestFile: clientFile(job.result.materialBundle.manifestFile),
            variants: (job.result.materialBundle.variants ?? []).map((variant) => ({
              ...variant,
              preview: clientFile(variant.preview),
              maps: Object.fromEntries(Object.entries(variant.maps ?? {}).map(([key, file]) => [key, clientFile(file)])),
            })),
          },
        } : {}),
      }
    : job.result;
  return {
    ...job,
    prompt: job.request?.prompt ?? job.request?.user ?? '',
    result,
  };
}

export function toonlabWorkspacePlugin({ rootDirectory = process.cwd(), workspace = '.toonlab' } = {}) {
  const projectRoot = resolve(rootDirectory);
  const workspacePath = resolveWorkspacePath(workspace, projectRoot);
  const serverPath = join(projectRoot, 'mcp', 'server.mjs');

  async function referenceImage(relativePath) {
    const file = await readObject(workspacePath, relativePath);
    if (!String(file.mimeType).startsWith('image/')) {
      throw Object.assign(new Error('Generation references must be images.'), { statusCode: 400 });
    }
    return {
      bytes: new Uint8Array(file.data),
      mimeType: file.mimeType,
    };
  }

  async function runGeneration(body) {
    const provider = String(body.provider ?? '');
    const kind = String(body.kind ?? '');
    if (!['ark', 'fal', 'gemini', 'meshy', 'openai', 'tripo'].includes(provider)) {
      throw Object.assign(new Error('Unsupported provider.'), { statusCode: 400 });
    }
    const imageKinds = new Set(['image', 'texture_image', 'concept_image']);
    const materialKinds = new Set(['material']);
    const modelKinds = new Set([
      'text_to_model',
      'image_to_model',
      'multiview_to_model',
      'model_segment',
    ]);
    if (kind === 'texture-recipe' && !['gemini', 'openai'].includes(provider)) {
      throw Object.assign(new Error('Texture recipes require Gemini or OpenAI.'), { statusCode: 400 });
    }
    if (kind !== 'texture-recipe' && !imageKinds.has(kind) && !modelKinds.has(kind) && !materialKinds.has(kind)) {
      throw Object.assign(new Error('Unsupported generation kind.'), { statusCode: 400 });
    }
    const providerKinds = {
      meshy: new Set(['image_to_model', 'multiview_to_model']),
      tripo: modelKinds,
    };
    if (modelKinds.has(kind) && !providerKinds[provider]?.has(kind)) {
      throw Object.assign(new Error(`${kind} is not supported by ${provider}.`), { statusCode: 400 });
    }
    if (imageKinds.has(kind) && provider !== 'gemini') {
      throw Object.assign(new Error('OSS image generation currently supports Gemini only.'), { statusCode: 400 });
    }
    if (materialKinds.has(kind) && provider !== 'fal') {
      throw Object.assign(new Error('PBR material generation requires Fal Patina.'), { statusCode: 400 });
    }
    const requestBody = body.request && typeof body.request === 'object'
      ? body.request
      : {};
    const prompt = String(requestBody.prompt ?? requestBody.user ?? '').trim();
    if (
      !['image_to_model', 'multiview_to_model', 'model_segment'].includes(kind)
      && !prompt
    ) {
      throw Object.assign(new Error('A prompt is required.'), { statusCode: 400 });
    }
    const persistedRequest = {
      ...requestBody,
      prompt,
    };
    const job = await createGenerationJob(provider, kind, persistedRequest);
    try {
      const referencePaths = Array.isArray(requestBody.referencePaths)
        ? requestBody.referencePaths.slice(0, 6)
        : [];
      if (kind === 'image_to_model' && requestBody.imagePath) {
        referencePaths.unshift(requestBody.imagePath);
      }
      const referenceImages = await Promise.all(
        referencePaths.map((path) => referenceImage(String(path))),
      );
      const viewPaths = Array.isArray(requestBody.views)
        ? requestBody.views.slice(0, 4)
        : [];
      const viewImages = await Promise.all(
        viewPaths.map((path) => path ? referenceImage(String(path)) : null),
      );
      const result = await runProvider(provider, {
        ...requestBody,
        ...(kind === 'texture-recipe' ? { jsonMode: true, responseMimeType: 'application/json', maxOutputTokens: 4096 } : {}),
        kind,
        prompt,
        referenceImages,
        viewImages,
      });
      if (result.pending) {
        return {
          job: clientJob(await updateGenerationJob(job.id, {
            ...result,
          })),
          status: 202,
        };
      }
      if (result.bytes instanceof Uint8Array) {
        const extension = result.contentType === 'image/jpeg'
          ? 'jpg'
          : result.contentType === 'image/webp' ? 'webp' : 'png';
        const file = await saveObject(workspacePath, result.bytes, {
          contentType: result.contentType,
          kind: 'generated-image',
          name: `generation-${job.id}.${extension}`,
        });
        return {
          job: clientJob(await finishGenerationJob(job.id, {
            result: {
              file: clientFile(file),
              provider: result.provider,
            },
          })),
          status: 200,
        };
      }
      if (result.material) {
        return {
          job: clientJob(await finishGenerationJob(job.id, {
            result: await storeManagedMaterial(workspacePath, job.id, result),
          })),
          status: 200,
        };
      }
      return {
        job: clientJob(await finishGenerationJob(job.id, { result })),
        status: 200,
      };
    } catch (error) {
      await finishGenerationJob(job.id, { error: error?.message ?? String(error) });
      throw error;
    }
  }

  async function advanceGenerationJob(job) {
    if (!['tripo', 'meshy'].includes(job?.provider) || job.status !== 'running' || !job.result?.taskId) {
      return job;
    }
    let task;
    try {
      task = job.provider === 'meshy'
        ? await pollMeshyTask(job.result.taskId, job.kind)
        : await pollTripoTask(job.result.taskId);
    } catch (error) {
      const pollFailures = Number(job.result.pollFailures ?? 0) + 1;
      if (
        Number(error?.providerStatus) >= 400
        && Number(error?.providerStatus) < 500
        && Number(error?.providerStatus) !== 429
      ) {
        return finishGenerationJob(job.id, {
          error: error?.message ?? String(error),
          result: { ...job.result, pollFailures },
        });
      }
      if (pollFailures >= 5) {
        return finishGenerationJob(job.id, {
          error: `${job.provider} polling failed repeatedly: ${error?.message ?? String(error)}`,
          result: { ...job.result, pollFailures },
        });
      }
      return updateGenerationJob(job.id, {
        ...job.result,
        lastPollError: error?.message ?? String(error),
        pollFailures,
      });
    }

    try {
      if (task.status === 'success') {
        const outputUrl = task.output?.pbr_model ?? task.output?.model ?? task.output?.base_model;
        if (!outputUrl) throw new Error(`${job.provider} completed without a downloadable model`);
        const downloaded = await downloadProviderAsset(outputUrl);
        const file = await saveObject(workspacePath, downloaded.bytes, {
          contentType: downloaded.contentType,
          kind: 'generated-model',
          name: downloaded.name,
        });
        let previewFile = null;
        if (task.output?.rendered_image) {
          try {
            const preview = await downloadProviderAsset(task.output.rendered_image, {
              maxBytes: 16 * 1024 * 1024,
            });
            if (preview.contentType.startsWith('image/')) {
              previewFile = await saveObject(workspacePath, preview.bytes, {
                contentType: preview.contentType,
                kind: 'generated-preview',
                name: preview.name,
              });
            }
          } catch {
            // A missing optional provider preview must not discard the GLB.
          }
        }
        return finishGenerationJob(job.id, {
          result: {
            file: clientFile(file),
            previewFile: clientFile(previewFile),
            provider: job.provider,
            task,
            taskId: job.result.taskId,
          },
        });
      }
      if (['failed', 'cancelled', 'banned', 'expired'].includes(task.status)) {
        return finishGenerationJob(job.id, {
          error: `${job.provider} task ended with status ${task.status}`,
          result: { provider: job.provider, task, taskId: job.result.taskId },
        });
      }
      return updateGenerationJob(job.id, {
        provider: job.provider,
        task,
        taskId: job.result.taskId,
      });
    } catch (error) {
      return finishGenerationJob(job.id, {
        error: `${job.provider} result could not be stored: ${error?.message ?? String(error)}`,
        result: { ...job.result, task },
      });
    }
  }

  async function middleware(request, response, next) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/toonlab/')) return next();

    try {
      if (url.pathname === '/api/toonlab/workspace') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        await mkdir(join(workspacePath, 'objects'), { recursive: true });
        const database = await databaseInfo();
        return sendJson(response, 200, {
          database,
          path: workspacePath,
          mode: 'postgres',
          version: 2,
          ...providerConfiguration(),
          mcp: {
            args: [serverPath, '--workspace', workspacePath],
            command: process.execPath,
            transport: 'stdio',
          },
          projectRoot,
        });
      }

      if (url.pathname === '/api/toonlab/storage') {
        if (request.method === 'GET') {
          return sendJson(response, 200, {
            entries: await readLabState(),
            initialized: await hasLegacyImport('browser-storage'),
          });
        }
        if (request.method === 'DELETE') {
          await clearLabState();
          return sendJson(response, 200, { entries: {} });
        }
        return methodNotAllowed(response, ['GET', 'DELETE']);
      }

      if (url.pathname === '/api/toonlab/storage/import') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        const report = await migrateLegacy({ browserEntries: body.entries, source: 'browser-storage' });
        const initialized = Array.isArray(report.failures) && report.failures.length === 0;
        return sendJson(response, initialized ? 200 : 422, {
          entries: await readLabState(),
          initialized,
          report,
        });
      }

      if (url.pathname.startsWith('/api/toonlab/storage/')) {
        const key = decodeURIComponent(url.pathname.slice('/api/toonlab/storage/'.length));
        if (request.method === 'PUT') {
          const body = await readJsonBody(request);
          await setLabState(key, body.value);
          return sendJson(response, 200, { entries: await readLabState() });
        }
        if (request.method === 'DELETE') {
          await deleteLabState(key);
          return sendJson(response, 200, { entries: await readLabState() });
        }
        return methodNotAllowed(response, ['PUT', 'DELETE']);
      }

      if (url.pathname === '/api/toonlab/library') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        return sendJson(response, 200, {
          entries: await listLibraryEntries(),
          migrated: await hasLegacyImport('indexeddb-library'),
        });
      }

      if (url.pathname === '/api/toonlab/library/migrate') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        const report = await migrateLegacy({
          libraryEntries: body.entries,
          source: 'indexeddb-library',
        });
        const migrated = Array.isArray(report.failures) && report.failures.length === 0;
        return sendJson(response, 200, {
          entries: await listLibraryEntries(),
          migrated,
          report,
        });
      }

      if (url.pathname === '/api/toonlab/migrate') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        return sendJson(response, 200, {
          report: await migrateLegacy(await readJsonBody(request)),
        });
      }

      if (url.pathname === '/api/toonlab/catalog') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        return sendJson(response, 200, await listCatalogAssets({
          kind: url.searchParams.get('kind') ?? '',
          license: url.searchParams.get('license') ?? '',
          limit: url.searchParams.get('limit') ?? 60,
          offset: url.searchParams.get('offset') ?? 0,
          q: url.searchParams.get('q') ?? '',
          size: url.searchParams.get('size') ?? '',
          source: url.searchParams.get('source') ?? '',
        }));
      }

      if (url.pathname === '/api/toonlab/catalog-facets') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        return sendJson(response, 200, await listCatalogFacets());
      }

      if (url.pathname.startsWith('/api/toonlab/catalog/')) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const id = decodeURIComponent(url.pathname.slice('/api/toonlab/catalog/'.length));
        const asset = await getCatalogAsset(id);
        return asset
          ? sendJson(response, 200, { asset })
          : sendJson(response, 404, { error: 'Catalog asset not found.' });
      }

      if (url.pathname === '/api/toonlab/providers') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        return sendJson(response, 200, providerConfiguration());
      }

      if (url.pathname === '/api/toonlab/generations') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const jobs = await listGenerationJobs({
          kind: url.searchParams.get('kind') ?? '',
          limit: url.searchParams.get('limit') ?? 60,
          q: url.searchParams.get('q') ?? '',
        });
        return sendJson(response, 200, {
          jobs: jobs.map(clientJob),
        });
      }

      if (url.pathname === '/api/toonlab/generate/enhance') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        const prompt = String(body.prompt ?? '').trim();
        if (!prompt) {
          throw Object.assign(new Error('A prompt is required.'), { statusCode: 400 });
        }
        const configured = providerConfiguration().providers;
        const provider = configured.gemini
          ? 'gemini'
          : configured.openai ? 'openai' : null;
        if (!provider) {
          return sendJson(response, 409, {
            error: 'Configure Gemini or OpenAI to enhance prompts.',
          });
        }
        const result = await runProvider(provider, {
          jsonMode: false,
          maxOutputTokens: 500,
          model: provider === 'gemini'
            ? 'gemini-2.5-flash'
            : provider === 'openai' ? 'gpt-5-mini' : '',
          responseMimeType: 'text/plain',
          system: 'Rewrite the user description as one concise, production-quality image-generation prompt. Preserve the subject and intent. Return only the improved prompt.',
          user: prompt,
        });
        return sendJson(response, 200, { prompt: result.text ?? '' });
      }

      if (url.pathname === '/api/toonlab/reference-url') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        const downloaded = await downloadProviderAsset(body.url, {
          maxBytes: 16 * 1024 * 1024,
        });
        if (!downloaded.contentType.startsWith('image/')) {
          throw Object.assign(new Error('Reference URL did not return an image.'), { statusCode: 400 });
        }
        const file = await saveObject(workspacePath, downloaded.bytes, {
          contentType: downloaded.contentType,
          kind: 'generation-reference',
          name: downloaded.name,
        });
        return sendJson(response, 200, { file: clientFile(file) });
      }

      if (url.pathname === '/api/toonlab/generate') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const generated = await runGeneration(await readJsonBody(request));
        return sendJson(response, generated.status, { job: generated.job });
      }

      if (url.pathname.startsWith('/api/toonlab/generation/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/toonlab/generation/'.length));
        if (request.method === 'DELETE') {
          const cancelled = await cancelGenerationJob(id);
          return cancelled
            ? sendJson(response, 200, { job: clientJob(cancelled) })
            : sendJson(response, 404, { error: 'Generation job not found.' });
        }
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET', 'DELETE']);
        let job = await getGenerationJob(id);
        job = await advanceGenerationJob(job);
        return job
          ? sendJson(response, 200, { job: clientJob(job) })
          : sendJson(response, 404, { error: 'Generation job not found.' });
      }

      if (url.pathname.startsWith('/api/toonlab/library/')) {
        const resolvedMatch = url.pathname.match(/^\/api\/toonlab\/library\/([^/]+)\/resolved$/);
        if (resolvedMatch) {
          if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
          return sendJson(response, 200, {
            bundle: await resolveStyleBundleEntry(decodeURIComponent(resolvedMatch[1])),
          });
        }
        const revisionMatch = url.pathname.match(/^\/api\/toonlab\/library\/([^/]+)\/revisions(?:\/([^/]+))?(?:\/(restore))?$/);
        if (revisionMatch) {
          const creationId = decodeURIComponent(revisionMatch[1]);
          const revisionId = revisionMatch[2] ? decodeURIComponent(revisionMatch[2]) : null;
          if (!revisionId && request.method === 'GET') {
            const history = await listCreationRevisions(creationId, {
              limit: url.searchParams.get('limit'),
              offset: url.searchParams.get('offset'),
            });
            return sendJson(response, 200, history);
          }
          if (revisionId && !revisionMatch[3] && request.method === 'GET') {
            return sendJson(response, 200, {
              revision: await getCreationRevision(creationId, revisionId),
            });
          }
          if (revisionId && revisionMatch[3] === 'restore' && request.method === 'POST') {
            return sendJson(response, 200, {
              entry: await restoreCreationRevision(creationId, revisionId),
            });
          }
          if (revisionId && !revisionMatch[3] && request.method === 'PATCH') {
            return sendJson(response, 200, {
              revision: await annotateCreationRevision(
                creationId,
                revisionId,
                await readJsonBody(request),
              ),
            });
          }
          return methodNotAllowed(response, revisionId ? ['GET', 'PATCH', 'POST'] : ['GET']);
        }
        const id = decodeURIComponent(url.pathname.slice('/api/toonlab/library/'.length));
        if (request.method === 'PUT') {
          const entry = await readJsonBody(request);
          if (entry.id !== id) throw Object.assign(new Error('Library entry id does not match the URL.'), { statusCode: 400 });
          return sendJson(response, 200, { entry: await saveLibraryEntry(entry) });
        }
        if (request.method === 'DELETE') {
          return sendJson(response, 200, { deleted: await deleteLibraryEntry(id) });
        }
        return methodNotAllowed(response, ['PUT', 'DELETE']);
      }

      if (url.pathname.startsWith('/api/toonlab/files/')) {
        const relativePath = decodeURIComponent(url.pathname.slice('/api/toonlab/files/'.length));
        if (request.method === 'PUT') {
          const body = await readBody(request, FILE_LIMIT);
          const contentType = request.headers['content-type'] ?? 'application/octet-stream';
          if (
            relativePath.startsWith('generation-reference/')
            && !String(contentType).startsWith('image/')
          ) {
            throw Object.assign(new Error('Generation references must be images.'), { statusCode: 400 });
          }
          return sendJson(response, 200, {
            file: clientFile(await saveObject(workspacePath, body, {
              contentType,
              kind: relativePath.startsWith('generation-reference/')
                ? 'generation-reference'
                : 'asset',
              name: relativePath.split('/').pop() || 'asset.bin',
            })),
          });
        }
        if (request.method === 'GET') {
          const file = relativePath.startsWith('objects/')
            ? await readObject(workspacePath, relativePath)
            : await readWorkspaceFile(workspacePath, relativePath);
          response.statusCode = 200;
          response.setHeader('content-type', file.mimeType);
          response.setHeader('content-length', String(file.data.length));
          if (url.searchParams.get('download') === '1') {
            response.setHeader(
              'content-disposition',
              `attachment; filename="${String(file.name).replaceAll('"', '')}"`,
            );
          }
          response.end(file.data);
          return;
        }
        return methodNotAllowed(response, ['PUT', 'GET']);
      }

      return sendJson(response, 404, { error: 'Unknown ToonLab workspace route.' });
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.code === 'ENOENT' ? 404 : 500);
      return sendJson(response, status, { error: error?.message ?? String(error) });
    }
  }

  return {
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    name: 'toonlab-workspace',
    async transformIndexHtml() {
      return [{
        children: await readFile(join(projectRoot, 'labs', 'shared', 'workspace-bootstrap.js'), 'utf8'),
        injectTo: 'head-prepend',
        tag: 'script',
      }];
    },
  };
}
