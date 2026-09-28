import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { assertScalarGrid } from './scalarGrid.node.js';
import { orientMeshToField } from './meshContract.node.js';

const INPUT_MAGIC = Buffer.from('TLGRDv1\0', 'ascii');
const OUTPUT_MAGIC = Buffer.from('TLMSHv1\0', 'ascii');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status, signal) => {
      if (status !== 0) {
        reject(new Error(
          `MC33 reference exited with ${signal ? `signal ${signal}` : `status ${status}`}: `
          + Buffer.concat(stderr).toString('utf8').trim(),
        ));
        return;
      }
      resolve({ stderr: Buffer.concat(stderr), stdout: Buffer.concat(stdout) });
    });
  });
}

function encodeGrid(grid) {
  const headerBytes = 8 + 3 * 4 + 3 * 8 + 3 * 8;
  const buffer = Buffer.allocUnsafe(headerBytes + grid.values.length * 8);
  INPUT_MAGIC.copy(buffer, 0);
  let offset = 8;
  for (const dimension of grid.pointDims) {
    buffer.writeUInt32LE(dimension, offset);
    offset += 4;
  }
  for (const value of grid.origin) {
    buffer.writeDoubleLE(value, offset);
    offset += 8;
  }
  for (const value of grid.spacing) {
    buffer.writeDoubleLE(value, offset);
    offset += 8;
  }
  for (const value of grid.values) {
    buffer.writeDoubleLE(value, offset);
    offset += 8;
  }
  return buffer;
}

function decodeMesh(buffer, cellSize) {
  if (buffer.length < 16 || !buffer.subarray(0, 8).equals(OUTPUT_MAGIC)) {
    throw new Error('MC33 reference returned an invalid mesh header.');
  }
  const vertexCount = buffer.readUInt32LE(8);
  const triangleCount = buffer.readUInt32LE(12);
  const expected = 16 + vertexCount * 3 * 8 + triangleCount * 3 * 4;
  if (buffer.length !== expected) {
    throw new Error(`MC33 reference returned ${buffer.length} bytes; expected ${expected}.`);
  }
  const positions = new Float64Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  let offset = 16;
  for (let i = 0; i < positions.length; i += 1) {
    positions[i] = buffer.readDoubleLE(offset);
    offset += 8;
  }
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = buffer.readUInt32LE(offset);
    offset += 4;
  }
  return {
    indices,
    metadata: {
      algorithm: 'vega-mc33-c-v5.5-reference',
      cellSize,
      license: 'MIT',
      referenceCommit: 'eef8f8f4d70527af74b988869e34f887ef9ed7ba',
      role: 'bake-off reference; external source is not copied into ToonLab',
      topologyGuarantee: 'MC33 trilinear face and interior disambiguation',
    },
    positions,
  };
}

export async function extractMc33Reference(grid, { binaryPath, evaluate = null } = {}) {
  assertScalarGrid(grid);
  if (!binaryPath) {
    throw new TypeError('MC33 reference binaryPath is required for the repository-only bake-off.');
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'toonlab-mc33-'));
  const inputPath = path.join(directory, 'field.tlgrid');
  const outputPath = path.join(directory, 'mesh.tlmesh');
  try {
    await writeFile(inputPath, encodeGrid(grid));
    await run(binaryPath, [inputPath, outputPath]);
    return orientMeshToField(decodeMesh(await readFile(outputPath), grid.cellSize), evaluate);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
