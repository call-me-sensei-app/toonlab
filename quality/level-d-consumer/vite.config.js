import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    fs: { allow: [resolve(root, '../..')] },
  },
  // Vite otherwise prebundles `three` and `three/webgpu` as independent
  // dependency entries. Both wrap three.core.js, so the browser observes two
  // module identities even though npm has correctly deduped the package.
  // Let native ESM/Rollup share the common core module instead.
  optimizeDeps: {
    exclude: ['@call-me-sensei/toonlab', 'three'],
  },
  resolve: {
    dedupe: ['three'],
  },
  build: {
    rollupOptions: {
      input: {
        levelD: resolve(root, 'index.html'),
        meadowCrossing: resolve(root, 'scene-two.html'),
        strictBundleBaseline: resolve(root, 'scene-three.html'),
      },
    },
  },
});
