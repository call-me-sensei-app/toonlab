import { generateCloudSourceMaps } from '../../../src/cloud/cloudSource.js';

self.addEventListener('message', (event) => {
  const { id, resolution, source } = event.data ?? {};
  try {
    const maps = generateCloudSourceMaps(source, { resolution });
    self.postMessage({
      id,
      maps: {
        hashes: maps.hashes,
        height: maps.height,
        paintedPixels: maps.paintedPixels,
        surface: maps.surface,
        volume: maps.volume,
        width: maps.width,
      },
    }, [maps.surface.buffer, maps.volume.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message ?? String(error) });
  }
});
