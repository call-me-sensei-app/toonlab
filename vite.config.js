import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { toonlabWorkspacePlugin } from './mcp/vite-plugin.mjs';

// Licensed/private reference assets live outside public/ so production builds
// can never copy them by accident. Serve that gitignored tree in dev only.
function localAssetsDevPlugin(rootDirectory) {
  const localRoot = resolve(rootDirectory, 'assets-local');
  const mimeTypes = {
    '.bin': 'application/octet-stream',
    '.fbx': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.ktx2': 'image/ktx2',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  // These roots are ToonLab-owned asset collections, not producer namespaces.
  // Keep them in the structural identity so an environment source manifest
  // cannot collide with the separate rock-reference material manifest.
  const canonicalAssetCollections = new Set([
    'environments',
    'imports',
    'labs',
    'models',
    'parity',
    'props',
    'rock-references',
  ]);

  const retainedAssetIdentity = (assetPath) => {
    const segments = String(assetPath).replaceAll('\\', '/').split('/');
    if (segments.length > 1 && !canonicalAssetCollections.has(segments[0])) {
      segments[0] = '{source}';
    }

    const textureRoot = segments.findIndex((segment, index) =>
      segment === 'textures' && segments[index - 1] === 'material-source');
    if (textureRoot >= 0 && segments[textureRoot + 1]) {
      segments[textureRoot + 1] = '{namespace}';
    }

    for (const collection of ['landscape-heightfields', 'landscape-weight-layers']) {
      const collectionIndex = segments.indexOf(collection);
      if (collectionIndex >= 0 && segments[collectionIndex + 1]) {
        segments[collectionIndex + 1] = '{scene}';
      }
    }

    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index].endsWith('temporal-dither')) {
        segments[index] = '{temporal-dither}';
      }
    }

    const fileIndex = segments.length - 1;
    segments[fileIndex] = segments[fileIndex].replace(
      /^(p\d+)-[^-]+-(.+-contract\.json)$/,
      '$1-{source}-$2',
    );
    return segments.join('/');
  };

  const addUnique = (index, key, value) => {
    if (!index.has(key)) {
      index.set(key, value);
    } else if (index.get(key) !== value) {
      index.set(key, null);
    }
  };

  const retainedAssetsByIdentity = new Map();
  const retainedAssetsByBasename = new Map();
  const indexRetainedAssets = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        indexRetainedAssets(absolutePath);
      } else if (entry.isFile()) {
        const retainedPath = relative(localRoot, absolutePath).replaceAll('\\', '/');
        addUnique(
          retainedAssetsByIdentity,
          retainedAssetIdentity(retainedPath),
          retainedPath,
        );
        addUnique(retainedAssetsByBasename, basename(retainedPath), retainedPath);
      }
    }
  };
  indexRetainedAssets(localRoot);

  // Product code addresses only canonical ToonLab URLs. The private dev bridge
  // resolves a retained asset by structural identity, never by a producer,
  // project, scene, or engine name.
  const compatibilityCandidates = (requestPath) => {
    const candidates = [requestPath];
    const identityMatch = retainedAssetsByIdentity.get(
      retainedAssetIdentity(requestPath),
    );
    const basenameMatch = retainedAssetsByBasename.get(basename(requestPath));
    if (identityMatch) candidates.push(identityMatch);
    if (basenameMatch && basenameMatch !== identityMatch) {
      candidates.push(basenameMatch);
    }
    return candidates;
  };

  return {
    name: 'toonlab-local-assets-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/assets-local', (request, response, next) => {
        const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0])
          .replace(/^\/+/, '');
        const candidatePaths = compatibilityCandidates(requestPath);
        const absolutePaths = candidatePaths.map((candidatePath) =>
          resolve(localRoot, candidatePath));
        if (absolutePaths.some((absolutePath) =>
          absolutePath !== localRoot && !absolutePath.startsWith(`${localRoot}${sep}`))) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }
        const absolutePath = absolutePaths.find((candidatePath) =>
          existsSync(candidatePath) && statSync(candidatePath).isFile());
        if (!absolutePath) {
          // Never let a missing JSON asset fall through to Vite's HTML SPA
          // fallback. Besides being semantically correct, this preserves the
          // requested URL in diagnostics instead of producing a misleading
          // "Unexpected token '<'" parse error.
          if (extname(requestPath).toLowerCase() === '.json') {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({
              error: 'ToonLab local asset is unavailable.',
              path: `/assets-local/${requestPath}`,
            }));
            return;
          }
          next();
          return;
        }
        const stats = statSync(absolutePath);
        response.statusCode = 200;
        response.setHeader('Content-Length', stats.size);
        response.setHeader('Content-Type', mimeTypes[extname(absolutePath).toLowerCase()]
          ?? 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        if (absolutePath !== absolutePaths[0]) {
          response.setHeader('X-ToonLab-Asset-Compatibility', 'retained-source');
        }
        createReadStream(absolutePath).pipe(response);
      });
    },
  };
}

// Private comparison pages are intentionally kept in the gitignored
// .local-reference tree, but their long-lived review URLs still live under
// /examples. Rewrite only those dev requests so Vite continues to transform
// their modules (including imports from the public src/ tree) without copying
// private reference code into production inputs.
function localReferenceExamplesDevPlugin() {
  const mountedExamples = new Set(['tri-engine-parity']);

  return {
    name: 'toonlab-local-reference-examples-dev',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replaceAll('\\', '/').split('?')[0];
      if (!normalizedId.includes('/.local-reference/examples/tri-engine-parity/')) {
        return null;
      }

      // The comparison page was moved one directory deeper when external
      // authority code was isolated from the product. Keep its old, stable
      // review URL without making that private page own a second copy of
      // ToonLab: imports that previously resolved to ../../src must continue
      // to resolve to the product's canonical source tree.
      const transformed = code.replace(
        /(['"])\.\.\/\.\.\/src\//g,
        '$1/src/',
      );
      return transformed === code ? null : { code: transformed, map: null };
    },
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const requestUrl = request.url ?? '/';
        const [pathname, query = ''] = requestUrl.split('?');
        const match = pathname.match(/^\/examples\/([^/]+)(\/.*)?$/);
        if (!match || !mountedExamples.has(match[1])) {
          next();
          return;
        }

        const suffix = match[2] || '/';
        request.url =
          `/.local-reference/examples/${match[1]}${suffix}${query ? `?${query}` : ''}`;
        next();
      });
    },
  };
}

function googleAnalyticsHtmlPlugin() {
  return {
    name: 'toonlab-google-analytics',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{
          attrs: {
            src: '/src/analytics/googleAnalytics.js',
            type: 'module',
          },
          injectTo: 'head',
          tag: 'script',
        }];
      },
    },
  };
}

// examples/ import ToonLab by its published package name so they read
// exactly like consumer code; these aliases resolve those specifiers to the
// in-repo source. Subpath entries must come before the bare root entry.
const packageAliases = [
  {
    find: '@call-me-sensei/toonlab/official-catalog',
    replacement: resolve(__dirname, 'src/catalog/officialCatalog.js'),
  },
  {
    find: '@call-me-sensei/toonlab/world-collision',
    replacement: resolve(__dirname, 'src/worldCollision.js'),
  },
  ...['toon', 'environment', 'lighting', 'water', 'landscape', 'vegetation', 'sky', 'cloud', 'weather', 'post', 'camera',
    'game-feel', 'ground-shader', 'rock-shader', 'rockgen', 'renderer', 'runtime', 'styles', 'asset-policy',
    'debrisgen', 'pathgen', 'propgen', 'buildinggen', 'villagegen', 'ambientfx',
    'vfxgen', 'fauna', 'catalog', 'texgen', 'assetlib', 'character', 'loaders', 'debug'].map((subpath) => ({
    find: `@call-me-sensei/toonlab/${subpath}`,
    replacement: resolve(__dirname, `src/${subpath}/index.js`),
  })),
  { find: '@call-me-sensei/toonlab/toon-settings', replacement: resolve(__dirname, 'src/toon/toonSettings.js') },
  { find: '@call-me-sensei/toonlab/water-settings', replacement: resolve(__dirname, 'src/water/waterSettings.js') },
  { find: '@call-me-sensei/toonlab/grass', replacement: resolve(__dirname, 'src/vegetation/grass.js') },
  { find: '@call-me-sensei/toonlab/post-processing', replacement: resolve(__dirname, 'src/post/postProcessing.js') },
  { find: '@call-me-sensei/toonlab', replacement: resolve(__dirname, 'src/index.js') },
];

export default defineConfig(({ mode }) => {
  // BYO keys come from .env / shell env — read here so proxies can inject
  // them server-side (they never reach client code or bundles).
  const env = { ...loadEnv(mode, __dirname, ''), ...process.env };
  const polyPizzaKey = env.TOONLAB_POLYPIZZA_KEY ?? env.POLYPIZZA_API_KEY ?? '';
  const assetApiUserAgent = 'ToonLab/0.2 (+https://toonlab.io; contact=jack@hyperbond.studio)';

  return {
  // Fast Refresh for the React HUD (labs/**/ui). Vanilla .js modules —
  // engines, generators, shaders — pass through untouched.
  plugins: [
    googleAnalyticsHtmlPlugin(),
    localAssetsDevPlugin(__dirname),
    localReferenceExamplesDevPlugin(),
    toonlabWorkspacePlugin({ rootDirectory: __dirname }),
    react(),
  ],
  resolve: {
    alias: packageAliases,
    dedupe: ['three'],
  },
  server: {
    host: env.TOONLAB_BIND_HOST || '127.0.0.1',
    open: true,
    port: 5175,
    // ambientCG sends no CORS headers, so the browser reaches it through
    // these dev-server routes (a real backend takes them over if the labs
    // ever ship with one — the client only knows the /api/… paths).
    // NOTE: '-get' must stay listed before the plain prefix (first match
    // wins), and followRedirects is required — /get 302s to their CDN,
    // which the browser could not follow cross-origin.
    proxy: {
      // Poly Haven requires a unique application User-Agent on every API
      // request. Browsers cannot set it, so metadata calls go through this
      // identifying proxy; asset bytes still download from their CORS CDN.
      '/api/polyhaven': {
        changeOrigin: true,
        headers: { 'user-agent': assetApiUserAgent },
        rewrite: (path) => path.replace(/^\/api\/polyhaven/, ''),
        target: 'https://api.polyhaven.com',
      },
      '/api/ambientcg-get': {
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api\/ambientcg-get/, '/get'),
        target: 'https://ambientcg.com',
      },
      '/api/ambientcg': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ambientcg/, '/api/v2/full_json'),
        target: 'https://ambientcg.com',
      },
      // Poly Pizza wants an x-auth-token header AND sends no CORS — the key
      // is injected here from TOONLAB_POLYPIZZA_KEY so it never reaches the
      // browser. '-static' proxies the GLB downloads. ('-static' before the
      // plain prefix — first match wins.)
      '/api/polypizza-static': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/polypizza-static/, ''),
        target: 'https://static.poly.pizza',
      },
      '/api/polypizza': {
        changeOrigin: true,
        headers: polyPizzaKey ? { 'x-auth-token': polyPizzaKey } : {},
        rewrite: (path) => path.replace(/^\/api\/polypizza/, ''),
        target: 'https://api.poly.pizza/v1.1',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // WebGPU-first pages: every supported browser is evergreen, and the
    // examples use top-level await (vite's default es2020 target rejects it).
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        shaderLab: resolve(__dirname, 'shader-lab/index.html'),
        environmentLab: resolve(__dirname, 'environment-lab/index.html'),
        grassLab: resolve(__dirname, 'grass-lab/index.html'),
        treeShaderLab: resolve(__dirname, 'tree-shader-lab/index.html'),
        grassShaderLab: resolve(__dirname, 'grass-shader-lab/index.html'),
        flowerShaderLab: resolve(__dirname, 'flower-shader-lab/index.html'),
        rockShaderLab: resolve(__dirname, 'rock-shader-lab/index.html'),
        groundShaderLab: resolve(__dirname, 'ground-shader-lab/index.html'),
        transparentShaderLab: resolve(__dirname, 'transparent-shader-lab/index.html'),
        rockGenerationLab: resolve(__dirname, 'rock-lab/index.html'),
        skyAtmosphereSourceLab: resolve(__dirname, 'sky-atmosphere-source-lab/index.html'),
        shaderLabLegacy: resolve(__dirname, 'shader-lab/legacy/index.html'),
        playground: resolve(__dirname, 'playground/index.html'),
        treeLab: resolve(__dirname, 'tree-lab/index.html'),
        flowerLab: resolve(__dirname, 'flower-lab/index.html'),
        debrisLab: resolve(__dirname, 'debris-lab/index.html'),
        propLab: resolve(__dirname, 'prop-lab/index.html'),
        fbxLab: resolve(__dirname, 'fbx-lab/index.html'),
        buildingLab: resolve(__dirname, 'building-lab/index.html'),
        textureLab: resolve(__dirname, 'texture-lab/index.html'),
        gallery: resolve(__dirname, 'gallery/index.html'),
        generate: resolve(__dirname, 'generate/index.html'),
        library: resolve(__dirname, 'library/index.html'),
        styles: resolve(__dirname, 'styles/index.html'),
        // Gallery detail page + the unlisted embed stage it iframes.
        assetPage: resolve(__dirname, 'asset/index.html'),
        assetLab: resolve(__dirname, 'asset-lab/index.html'),
        skyCloudLab: resolve(__dirname, 'sky-cloud-lab/index.html'),
        skySmoke: resolve(__dirname, 'sky-smoke/index.html'),
        skyLab: resolve(__dirname, 'sky-lab/index.html'),
        cloudShaderLab: resolve(__dirname, 'cloud-shader-lab/index.html'),
        waterLab: resolve(__dirname, 'water-lab/index.html'),
        landscapeLab: resolve(__dirname, 'landscape-lab/index.html'),
        lightingLab: resolve(__dirname, 'lighting-lab/index.html'),
        weatherLab: resolve(__dirname, 'weather-lab/index.html'),
        atmosphericConditionLab: resolve(__dirname, 'atmospheric-condition-lab/index.html'),
        settings: resolve(__dirname, 'settings/index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
        vfxLab: resolve(__dirname, 'vfx-lab/index.html'),
        treeLabLegacy: resolve(__dirname, 'tree-designer/index.html'),
        outdoorWorld: resolve(__dirname, 'examples/outdoor-world/index.html'),
        walkableReference: resolve(__dirname, 'examples/walkable-reference/index.html'),
        vfxArena: resolve(__dirname, 'examples/vfx-arena/index.html'),
        // Hub-listed demos — without inputs they resolve in dev but 404 in
        // production builds.
        faunaDemo: resolve(__dirname, 'examples/fauna-demo/index.html'),
        ambientFxDemo: resolve(__dirname, 'examples/ambientfx-demo/index.html'),
        manufacturedMaterialLab: resolve(__dirname, 'manufactured-material-lab/index.html'),
        manufacturedMaterialLabLegacy: resolve(__dirname, 'manufactured-material-lab/legacy/index.html'),
        urbanPropShaderLegacy: resolve(__dirname, 'examples/urban-prop-shader/index.html'),
      },
    },
  },
  };
});
