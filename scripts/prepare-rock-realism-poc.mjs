import { copyFile, mkdir, stat } from 'node:fs/promises';

const sourceRoot = new URL(
  '../.local-reference/vibe3d/assets/terrain/glacial-granite-boulder/',
  import.meta.url,
);
const outputRoot = new URL('../assets-local/labs/rock-realism-poc/', import.meta.url);
const artifacts = [
  'glacial-granite-boulder.vtopo',
  'glacial-granite-boulder.vbake',
  'granite-detail.vbake',
];

await mkdir(outputRoot, { recursive: true });
const copied = [];
for (const name of artifacts) {
  const source = new URL(name, sourceRoot);
  const output = new URL(name, outputRoot);
  await copyFile(source, output);
  const info = await stat(output);
  copied.push({ bytes: info.size, name });
}

const cliffVariants = new Map([
  [2, 'cliff-seed2-c80-a512'],
  [3, 'cliff-seed3-c80-a512'],
  [4, 'cliff-seed4-c80-a512'],
  [5, 'cliff-seed5-c80-a512'],
  [6, 'cliff-seed6-c80-a512'],
  [7, 'cliff-seed7-c80-a512'],
]);
for (const [seed, sourceName] of cliffVariants) {
  for (const extension of ['vtopo', 'vbake']) {
    const source = new URL(`cliff/${sourceName}.${extension}`, sourceRoot);
    const name = `cliff-seed-${seed}.${extension}`;
    const output = new URL(name, outputRoot);
    await copyFile(source, output);
    const info = await stat(output);
    copied.push({ bytes: info.size, name });
  }
}

console.log(JSON.stringify({ copied, output: outputRoot.pathname }, null, 2));
