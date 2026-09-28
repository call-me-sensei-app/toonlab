// Rockgen determinism + mesh sanity checks (no browser needed).
//
//   npm run verify:rockgen
//
// Meshes fixture documents twice and asserts: run-to-run hash equality,
// agreement with the committed golden hashes below, no NaN data, indices in
// range, outward-consistent winding (face normals vs field gradient), a
// watertight Euler characteristic for the genus-0 fixture, and a
// serialize/deserialize round-trip that re-meshes identically.

import {
  compileDocument,
  createC7GeologyMapData,
  createC7SurfaceSpecification,
  createRockDocument,
  deserializeRockDocument,
  getRockgenPresetOptions,
  getRockgenStyleOptions,
  hashGeometry,
  meshDocument,
  rebaseRockDocumentStyle,
  serializeRockDocument,
  resolveRockgenPreset,
} from '../src/rockgen/index.js';

const RESOLUTION = 64;

// Golden hashes: update deliberately (and re-baseline the rock lab captures)
// whenever generation math changes on purpose.
const EXPECTED = {
  'boulder-seed7': '5eb2fb4c',
  'boulder-seed8': '6c059e1d',
  'cliff-face-seed2': '764db65b',
  'cliff-wall-seed4': '229d8658',
  'column-arch-seed7': '06f97c40',
  'eroded-mesa-seed9': '2e82fc62',
  'karst-spire-seed3': '06f99041',
  'sea-stack-seed5': 'ed052cc1',
  'sketch-slab-seed3': '431d0cd2',
  'smooth-sphere': 'd2b53d83',
};

// All fixtures pin gradient normals: the script's index-based checks need
// indexed output, and most presets now default to flat (de-indexed).
const FIXTURES = {
  'boulder-seed7': () => createRockDocument({ meshing: { normalsMode: 'gradient' }, preset: 'boulder', seed: 7 }),
  'boulder-seed8': () => createRockDocument({ meshing: { normalsMode: 'gradient' }, preset: 'boulder', seed: 8 }),
  'karst-spire-seed3': () => createRockDocument({ meshing: { normalsMode: 'gradient' }, preset: 'karst-spire', seed: 3 }),
  'sea-stack-seed5': () => createRockDocument({ meshing: { normalsMode: 'gradient' }, preset: 'sea-stack', seed: 5 }),
  // Planar-cuts coverage: single piece, then the multi-slab hard-union
  // composition. Both pin gradient normals for the index-based checks.
  'cliff-wall-seed4': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    preset: 'cliff-wall',
    seed: 4,
  }),
  'cliff-face-seed2': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    preset: 'cliff-face',
    seed: 2,
  }),
  // Multi-piece composition: exercises the union + smoothUnion + subtract
  // fold, per-piece transforms, and document presets. Meshing is pinned to
  // gradient normals — the script's index-based checks need indexed output.
  'column-arch-seed7': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    preset: 'column-arch',
    seed: 7,
  }),
  // Eroded heightfield coverage: exercises ToonLab's first-party stylized
  // drainage and thermal settling end to end (patch generation is seeded +
  // cached).
  'eroded-mesa-seed9': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    preset: 'eroded-mesa',
    seed: 9,
  }),
  // Drawn-outline coverage: a concave pentagon extruded via shape type
  // 'sketch' (the doodle-to-rock path), with the usual displacement on top.
  'sketch-slab-seed3': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    pieces: [{
      falloff: { bottomFlatten: 0.3 },
      noise: { amplitude: 0.06, frequency: 1.6, octaves: 3 },
      outline: [[-1.2, -0.8], [-0.2, -1.0], [1.1, -0.7], [0.9, 0.9], [0.1, 0.3], [-0.9, 0.8]],
      shape: { cornerRadius: 0.3, sizeZ: 0.6, type: 'sketch' },
      warp: { enabled: false },
    }],
    seed: 3,
  }),
  // Genus-0 reference for the topology check: gentle noise, no facet/strata.
  'smooth-sphere': () => createRockDocument({
    meshing: { normalsMode: 'gradient' },
    pieces: [{
      falloff: { bottomFlatten: 0 },
      noise: { amplitude: 0.05, frequency: 1.2, octaves: 2 },
      shape: { sizeX: 1, type: 'sphere' },
      warp: { enabled: false },
    }],
    seed: 1,
  }),
};

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ok  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

const c7First = createC7GeologyMapData({ geology: 'weathered-limestone', seed: 101, size: 64 });
const c7Second = createC7GeologyMapData({ geology: 'weathered-limestone', seed: 101, size: 64 });
check(c7First.audit.hash === 'ba9fd094', 'C7 accepted-method golden map hash');
check(c7First.audit.hash === c7Second.audit.hash, 'C7 map generation is deterministic');
const c7Surface = createC7SurfaceSpecification({
  assetId: 'rock-0001',
  dimensionsMetres: { depth: 0.64299, height: 0.54127, width: 0.67524 },
  geology: 'weathered-limestone',
});
check(new Set(c7Surface.projection.axisScale).size === 1, 'C7 projection is isotropic and cannot UV-stretch');

const rockPresetIds = getRockgenPresetOptions().map((entry) => entry.value);
const rockStyleIds = getRockgenStyleOptions().map((entry) => entry.value);
check(!rockPresetIds.includes('call_me_sensei'), 'Call Me Sensei is not an asset preset');
check(
  rockStyleIds.includes('default') && rockStyleIds.includes('call_me_sensei'),
  'rock styles expose Default and Call Me Sensei',
);
check(
  rockPresetIds.every((preset) => resolveRockgenPreset(preset, { style: 'call_me_sensei' }).surface.textureStyle === 'limestone'),
  'Call Me Sensei style resolves over every rock preset',
);
check(
  JSON.stringify(resolveRockgenPreset('call_me_sensei'))
    === JSON.stringify(resolveRockgenPreset('boulder', { style: 'call_me_sensei' })),
  'legacy Call Me Sensei preset calls resolve to the styled boulder',
);
const portableIdentity = deserializeRockDocument(serializeRockDocument(createRockDocument({
  preset: 'sea-stack',
  seed: 12,
  style: 'call_me_sensei',
})));
check(
  portableIdentity.preset === 'sea-stack' && portableIdentity.style === 'call_me_sensei',
  'rock project JSON preserves separate preset and style identity',
);
const editedRock = createRockDocument({ preset: 'sea-stack', seed: 12, style: 'default' });
editedRock.pieces[0].noise.amplitude = 0.123;
const styledEditedRock = rebaseRockDocumentStyle(editedRock, 'call_me_sensei');
check(
  styledEditedRock.preset === 'sea-stack'
    && styledEditedRock.style === 'call_me_sensei'
    && styledEditedRock.pieces[0].noise.amplitude === 0.123
    && styledEditedRock.surface.textureStyle === 'limestone',
  'style rebasing preserves rock identity and edits while applying the new rendition',
);
const customRock = createRockDocument({
  pieces: [{ name: 'Hand drawn', shape: { sizeX: 2.2, type: 'sphere' } }],
  preset: null,
  style: 'default',
});
const styledCustomRock = rebaseRockDocumentStyle(customRock, 'call_me_sensei');
check(
  styledCustomRock.preset === null
    && styledCustomRock.pieces[0].name === 'Hand drawn'
    && styledCustomRock.pieces[0].shape.sizeX === 2.2
    && styledCustomRock.surface.textureStyle === 'limestone',
  'Call Me Sensei styles custom Rock documents without replacing them with Boulder',
);
const legacyV1 = JSON.parse(serializeRockDocument(portableIdentity));
legacyV1.schemaVersion = 1;
delete legacyV1.preset;
delete legacyV1.style;
const migratedV1 = deserializeRockDocument(legacyV1);
check(
  migratedV1.preset === null && migratedV1.style === 'default',
  'v1 rock projects migrate to custom geometry with the Default style',
);

function assertFinite(name, geometry) {
  for (const attribute of Object.values(geometry.attributes)) {
    for (let i = 0; i < attribute.array.length; i += 1) {
      if (!Number.isFinite(attribute.array[i])) return false;
    }
  }
  return true;
}

function assertIndicesInRange(geometry) {
  const vertexCount = geometry.getAttribute('position').count;
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i] >= vertexCount) return false;
  }
  return true;
}

// Fraction of triangles whose face normal disagrees with the field gradient
// at the triangle centroid. Catches inverted or mixed winding.
function windingMismatchFraction(geometry, evaluate, cellSize) {
  const positions = geometry.getAttribute('position').array;
  const indices = geometry.index.array;
  const epsilon = cellSize * 0.5;
  let mismatches = 0;
  const triangleCount = indices.length / 3;
  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const ux = positions[i1] - positions[i0];
    const uy = positions[i1 + 1] - positions[i0 + 1];
    const uz = positions[i1 + 2] - positions[i0 + 2];
    const vx = positions[i2] - positions[i0];
    const vy = positions[i2 + 1] - positions[i0 + 1];
    const vz = positions[i2 + 2] - positions[i0 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const cx = (positions[i0] + positions[i1] + positions[i2]) / 3;
    const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3;
    const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3;
    const gx = evaluate(cx + epsilon, cy, cz) - evaluate(cx - epsilon, cy, cz);
    const gy = evaluate(cx, cy + epsilon, cz) - evaluate(cx, cy - epsilon, cz);
    const gz = evaluate(cx, cy, cz + epsilon) - evaluate(cx, cy, cz - epsilon);
    if (nx * gx + ny * gy + nz * gz < 0) mismatches += 1;
  }
  return mismatches / triangleCount;
}

function eulerCharacteristic(geometry) {
  const vertexCount = geometry.getAttribute('position').count;
  const indices = geometry.index.array;
  const edges = new Set();
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = indices[t + e];
      const b = indices[t + ((e + 1) % 3)];
      edges.add(a < b ? a * vertexCount + b : b * vertexCount + a);
    }
  }
  return vertexCount - edges.size + indices.length / 3;
}

for (const [name, build] of Object.entries(FIXTURES)) {
  console.log(`\n${name}`);
  const first = meshDocument(build(), { resolution: RESOLUTION });
  const second = meshDocument(build(), { resolution: RESOLUTION });
  const hash = hashGeometry(first);
  const vertexCount = first.getAttribute('position').count;
  console.log(`  hash ${hash}  (${vertexCount} verts, ${first.index.count / 3} tris)`);

  check(hash === hashGeometry(second), 'run-to-run hash equality');
  if (EXPECTED[name]) {
    if (hash === EXPECTED[name]) {
      check(true, `golden hash ${EXPECTED[name]}`);
    } else {
      check(false, `golden hash ${EXPECTED[name]}`);
    }
  } else {
    console.log('  note  no golden hash committed yet — copy the hash above into EXPECTED');
  }
  check(assertFinite(name, first), 'attributes are finite');
  check(assertIndicesInRange(first), 'indices in range');

  const document = build();
  const program = compileDocument(document);
  const longest = Math.max(
    program.bounds.max[0] - program.bounds.min[0],
    program.bounds.max[1] - program.bounds.min[1],
    program.bounds.max[2] - program.bounds.min[2],
  );
  // Threshold rationale: a genuinely flipped axis reads ~33% and a global
  // flip ~100%; a few percent is normal near ridged-noise creases where the
  // centroid gradient legitimately disagrees with the face plane.
  const mismatch = windingMismatchFraction(first, program.evaluate, longest / RESOLUTION);
  check(mismatch < 0.05, `winding matches field gradient (mismatch ${(mismatch * 100).toFixed(2)}%)`);

  const roundTrip = deserializeRockDocument(serializeRockDocument(document));
  check(
    hashGeometry(meshDocument(roundTrip, { resolution: RESOLUTION })) === hash,
    'serialize/deserialize round-trip re-meshes identically',
  );

  if (name === 'smooth-sphere') {
    check(eulerCharacteristic(first) === 2, 'Euler characteristic V - E + F = 2 (watertight, genus 0)');
  }
}

console.log(failures === 0 ? '\nverify-rockgen: all checks passed' : `\nverify-rockgen: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
