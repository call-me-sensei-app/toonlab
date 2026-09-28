import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { buildingRecipeFromSettings, createBuildingFromRecipe } from '../../src/buildinggen/index.js';
import { downloadBlob } from '../shared/download.js';

function filename(name, extension) {
  const safe = String(name || 'building').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'building'}.${extension}`;
}

export function downloadBuildingRecipe(settings, name) {
  const document = buildingRecipeFromSettings(settings);
  const json = JSON.stringify(document, null, 2);
  downloadBlob(json, filename(name, 'json'), 'application/json');
  return json;
}

export async function downloadBuildingGLB(settings, name) {
  const root = createBuildingFromRecipe(settings, { detail: 'hi' }).object3D;
  try {
    const buffer = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
    downloadBlob(buffer, filename(name, 'glb'), 'model/gltf-binary');
    return buffer.byteLength;
  } finally {
    // Role materials are cache-owned (shared by every build) — dispose only
    // the geometry this export created.
    root.traverse((object) => {
      if (object.isMesh) object.geometry?.dispose();
    });
  }
}
