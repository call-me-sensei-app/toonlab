// Browser download glue for Tree Lab. The baking itself is library
// code (src/vegetation/treeExport.js); this file only owns DOM concerns.

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { disposeExportGroup, prepareTreeForExport } from '../../src/vegetation/experimental.js';
import { downloadBlob } from '../shared/download.js';

export { downloadBlob };

export function downloadJSON(object, filename) {
  const json = JSON.stringify(object, null, 2);
  downloadBlob(json, filename, 'application/json');
  return json;
}

export async function downloadGLB(plant, { filename = 'plant.glb', mode = 'crossed' } = {}) {
  const group = prepareTreeForExport(plant, { foliageMode: mode });
  try {
    const buffer = await new GLTFExporter().parseAsync(group, { binary: true });
    downloadBlob(buffer, filename, 'model/gltf-binary');
    return buffer.byteLength;
  } finally {
    disposeExportGroup(group);
  }
}
