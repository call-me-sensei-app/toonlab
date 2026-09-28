import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import {
  createDebrisAsset, createDebrisRecipeDocument, disposeDebrisAsset, settleDebrisPhysics,
} from '../../src/debrisgen/index.js';
import { downloadBlob } from '../shared/download.js';

function filename(name, extension) {
  const safe = String(name || 'debris').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'debris'}.${extension}`;
}

export function downloadDebrisRecipe(settings, name) {
  const document = createDebrisRecipeDocument(settings, { name });
  const json = JSON.stringify(document, null, 2);
  downloadBlob(json, filename(name, 'json'), 'application/json');
  return json;
}

export async function downloadDebrisGLB(settings, name) {
  const asset = createDebrisAsset(settings);
  try {
    // Match the viewport: exports carry the physics-settled rest pose.
    await settleDebrisPhysics(asset).catch(() => {});
    const buffer = await new GLTFExporter().parseAsync(asset, { binary: true, onlyVisible: true });
    downloadBlob(buffer, filename(name, 'glb'), 'model/gltf-binary');
    return buffer.byteLength;
  } finally {
    disposeDebrisAsset(asset);
  }
}
