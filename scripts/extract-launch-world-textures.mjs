import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_ROOT = resolve(ROOT, 'assets-local/launch-world/textures');
const OUTPUT_ROOT = resolve(SOURCE_ROOT, 'tiles');

const atlases = [
  {
    id: 'anime-city',
    file: 'anime-city-facade-atlas.png',
    inset: 8,
    names: [
      'turquoise-awning-storefront', 'blue-glass-storefront', 'warm-noodle-bar', 'cream-blue-ceramic-tile',
      'coral-painted-concrete', 'graphic-transit-panel', 'turquoise-vending-panel', 'garden-balcony-screen',
      'frosted-glass', 'wave-shutter-mural', 'geometric-graffiti', 'utility-door',
      'geometric-neon-panel', 'cream-charcoal-wall', 'charcoal-gold-wall', 'perforated-concrete',
    ],
  },
  {
    id: 'anime-coastal',
    file: 'anime-coastal-park-atlas.png',
    inset: 4,
    names: [
      'pale-boardwalk', 'warm-dry-sand', 'wet-sand', 'turquoise-caustics',
      'pale-limestone', 'coastal-retaining-tile', 'weathered-blue-metal', 'navy-cream-fabric',
      'coral-cream-awning', 'broadleaf-groundcover', 'flower-meadow', 'clipped-lawn',
      'blue-ceramic', 'pebble-beach', 'cloud-reflection-glass', 'tropical-mural',
    ],
  },
];

mkdirSync(OUTPUT_ROOT, { recursive: true });

for (const atlas of atlases) {
  const atlasOutput = resolve(OUTPUT_ROOT, atlas.id);
  mkdirSync(atlasOutput, { recursive: true });
  atlas.names.forEach((name, index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const cell = 1254 / 4;
    const x = Math.round(column * cell + atlas.inset);
    const y = Math.round(row * cell + atlas.inset);
    const size = Math.floor(cell - atlas.inset * 2);
    const result = spawnSync('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-i', resolve(SOURCE_ROOT, atlas.file),
      '-vf', `crop=${size}:${size}:${x}:${y}`,
      '-frames:v', '1',
      resolve(atlasOutput, `${name}.png`),
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`Unable to extract ${atlas.id}/${name}: ${result.stderr}`);
    }
  });
}

console.log(`Extracted ${atlases.reduce((sum, atlas) => sum + atlas.names.length, 0)} launch-world textures.`);
