#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  createToonSettings,
  sanitizeToonPresetSettings,
  serializeToonPreset,
} from '../src/toon/toonSettings.js';

const outputDir = path.resolve(process.argv[2] || 'assets-local/models/yua');
const outputPath = path.join(outputDir, 'yua-launch.toon.json');
const settings = sanitizeToonPresetSettings(createToonSettings({ preset: 'call_me_sensei' }));
const document = serializeToonPreset('yua_launch', {
  description: 'Portable launch-review look for Yua. The neutral yua.glb remains preset-independent.',
  label: 'Yua Launch',
  settings,
});

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${document.trim()}\n`);
console.log(`Wrote ${outputPath}`);
