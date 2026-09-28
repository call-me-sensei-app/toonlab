#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WOODY_BASELINE_CONTROLS,
  WOODY_BASELINE_CONTROL_BY_ID,
  WOODY_BASELINE_DEFAULT_CONTROLS,
  WOODY_BASELINE_ENUM_OPTIONS,
  WOODY_BASELINE_SPECIES_PROFILE_VERSION,
  resolveWoodyBaselineThreeRuntime,
  woodyBaselineInheritedControlsForSpecies,
} from '../src/vegetation/woodyBaselineControls.js';
import { TREE_SPECIES_PROFILES } from '../src/vegetation/treeSpeciesProfiles.js';
import { ProceduralSpeciesTree } from '../src/vegetation/proceduralSpeciesTree.js';
import {
  createTreeSpeciesRecipe,
  recipeFromSettings,
  settingsFromRecipe,
  validateTreeRecipeDocument,
} from '../src/vegetation/treeRecipe.js';

const root = resolve(import.meta.dirname, '..');
const privateRoot = resolve(root, 'assets-local', 'TreeDesigner');
const inspectionPath = resolve(
  process.env.TOONLAB_WOODY_BASELINE_INSPECTION
    ?? resolve(privateRoot, 'research', 'inspection-2026-07-29.json'),
);
const adapterPath = resolve(
  process.env.TOONLAB_WOODY_BASELINE_ADAPTER
    ?? resolve(privateRoot, 'toonlab-woody-adapter.json'),
);

const inspection = JSON.parse(readFileSync(inspectionPath, 'utf8'));
const adapter = JSON.parse(readFileSync(adapterPath, 'utf8'));
const group = inspection.nodeGroups?.TreeDesigner;
if (!group) throw new Error('Licensed woody inspection is missing its primary node graph.');

const inputSockets = group.interface.filter(
  (item) => item.itemType === 'SOCKET' && item.inOut === 'INPUT',
);
const linkedSockets = new Set(
  group.links
    .filter((link) => link.fromNode.startsWith('Group Input'))
    .map((link) => link.fromSocket),
);
const meaningfulInputs = inputSockets.filter((socket) => linkedSockets.has(socket.identifier));
const interfaceOnly = inputSockets.filter((socket) => !linkedSockets.has(socket.identifier));
const sourceSockets = new Set(meaningfulInputs.map((socket) => socket.identifier));
const controlEntries = Object.entries(adapter.controlMap ?? {});
const adapterSockets = new Set(controlEntries.map(([, spec]) => spec.socket));
const errors = [];

if (inputSockets.length !== 137) {
  errors.push(`Expected 137 total source inputs; received ${inputSockets.length}.`);
}
if (meaningfulInputs.length !== 131) {
  errors.push(`Expected 131 graph-connected controls; received ${meaningfulInputs.length}.`);
}
if (interfaceOnly.length !== 6 || interfaceOnly.some((socket) => socket.socketType !== 'NodeSocketString')) {
  errors.push('The six excluded source inputs must remain unlinked section-label strings.');
}
if (controlEntries.length !== WOODY_BASELINE_CONTROLS.length) {
  errors.push(
    `Private adapter/public registry size mismatch: ${controlEntries.length} vs `
    + `${WOODY_BASELINE_CONTROLS.length}.`,
  );
}
if (adapterSockets.size !== controlEntries.length) {
  errors.push('Every neutral control must map to a unique source input.');
}
for (const socket of sourceSockets) {
  if (!adapterSockets.has(socket)) errors.push(`A graph-connected source input is unmapped: ${socket}.`);
}
for (const socket of adapterSockets) {
  if (!sourceSockets.has(socket)) errors.push(`Adapter maps a disconnected or unknown source input: ${socket}.`);
}

const expectedCoverage = {
  exact: 'exact-graph',
  toonlab: 'toonlab-replacement',
  resource: 'local-resource',
  host: 'host-integration',
};
for (const [id, spec] of controlEntries) {
  const publicControl = WOODY_BASELINE_CONTROL_BY_ID[id];
  if (!publicControl) {
    errors.push(`Private adapter control "${id}" has no neutral public contract.`);
    continue;
  }
  if (expectedCoverage[spec.mode] !== publicControl.coverage) {
    errors.push(
      `Coverage mismatch for "${id}": adapter=${spec.mode}, public=${publicControl.coverage}.`,
    );
  }
  const publicOptions = WOODY_BASELINE_ENUM_OPTIONS[id];
  if (publicOptions) {
    const mappedOptions = Object.keys(spec.enum ?? {});
    if (mappedOptions.length !== publicOptions.length
      || publicOptions.some((option) => !mappedOptions.includes(option))) {
      errors.push(`Enum mapping for "${id}" does not cover every neutral option.`);
    }
  }
}

const assets = inspection.assets ?? [];
if (assets.length !== 400) errors.push(`Expected 400 inspected source assets; received ${assets.length}.`);
for (const asset of assets) {
  const inputs = asset.modifiers?.find((modifier) => modifier.nodeGroup === 'TreeDesigner')?.inputs;
  if (!inputs) {
    errors.push('An inspected source asset has no procedural modifier inputs.');
    break;
  }
  for (const socket of sourceSockets) {
    if (!Object.hasOwn(inputs, socket)) {
      errors.push('At least one inspected source asset is missing a graph-connected input value.');
      break;
    }
  }
  if (errors.at(-1)?.startsWith('At least one')) break;
}

const counts = Object.fromEntries(
  ['exact-graph', 'toonlab-replacement', 'local-resource', 'host-integration']
    .map((coverage) => [
      coverage,
      WOODY_BASELINE_CONTROLS.filter((control) => control.coverage === coverage).length,
    ]),
);
const grouped = Object.fromEntries(
  [...new Set(WOODY_BASELINE_CONTROLS.map((control) => control.group))]
    .map((controlGroup) => [
      controlGroup,
      WOODY_BASELINE_CONTROLS.filter((control) => control.group === controlGroup).length,
    ]),
);

const serializableControls = WOODY_BASELINE_CONTROLS.filter((control) => control.recipe);
if (Object.keys(WOODY_BASELINE_DEFAULT_CONTROLS).length !== serializableControls.length) {
  errors.push('The neutral default set does not cover every serializable control.');
}
const woodyProfiles = TREE_SPECIES_PROFILES.filter(
  (profile) => ['woody-axis', 'whorled-conifer'].includes(profile.engine),
);
const inheritedFingerprints = new Set();
for (const profile of woodyProfiles) {
  const inherited = woodyBaselineInheritedControlsForSpecies(profile);
  if (!inherited) {
    errors.push(`Woody species ${profile.id} has no inherited baseline controls.`);
    continue;
  }
  const validation = validateTreeRecipeDocument(createTreeSpeciesRecipe(profile.id));
  if (!validation.ok) {
    errors.push(`Woody species ${profile.id} failed recipe validation.`);
    continue;
  }
  const baseline = validation.value.options.woodyBaseline;
  if (baseline.speciesProfileVersion !== WOODY_BASELINE_SPECIES_PROFILE_VERSION) {
    errors.push(`Woody species ${profile.id} has the wrong inherited-profile version.`);
  }
  if (serializableControls.some((control) => !Object.hasOwn(inherited, control.id))) {
    errors.push(`Woody species ${profile.id} does not resolve every serializable control.`);
  }
  inheritedFingerprints.add(JSON.stringify(inherited));
}
if (inheritedFingerprints.size !== woodyProfiles.length) {
  errors.push('Every woody/conifer species must resolve a distinct Toonlab-owned baseline.');
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

const roundTripControls = {
  'branching.crownProfile': 'spherical',
  'foliage.geometryVariant': 'single',
  'reproductive.petalCount': 7,
  'roots.complexity': 1.15,
};
const roundTripRecipe = createTreeSpeciesRecipe('quercus-robur', { seed: 41 });
roundTripRecipe.options.woodyBaseline.controls = roundTripControls;
const roundTripValidation = validateTreeRecipeDocument(roundTripRecipe);
if (!roundTripValidation.ok) {
  throw new Error(`Woody baseline recipe validation failed: ${roundTripValidation.errors.join(' ')}`);
}
const roundTripped = recipeFromSettings(settingsFromRecipe(roundTripValidation.value));
if (JSON.stringify(roundTripped.options.woodyBaseline?.controls) !== JSON.stringify(roundTripControls)) {
  throw new Error('Woody baseline controls did not survive treeRecipe v3 round-tripping.');
}

const oakProfile = TREE_SPECIES_PROFILES.find((profile) => profile.id === 'quercus-robur');
const defaultRuntime = resolveWoodyBaselineThreeRuntime(
  oakProfile,
  createTreeSpeciesRecipe('quercus-robur', { seed: 41 }).options,
);
if (!defaultRuntime
  || defaultRuntime.traits.height !== oakProfile.structuralTraits.height
  || defaultRuntime.traits.levels !== oakProfile.structuralTraits.levels) {
  throw new Error('Natural species defaults must fully evaluate the researched Toonlab baseline.');
}
const mappedRecipe = createTreeSpeciesRecipe('quercus-robur', { seed: 41 });
mappedRecipe.options.woodyBaseline.controls = {
  'dimensions.height': 14,
  'dimensions.baseRadius': 0.72,
  'branching.crownProfile': 'spherical',
  'foliage.scale': 1.8,
  'resolution.trunkRadialSegments': 14,
};
const mappedRuntime = resolveWoodyBaselineThreeRuntime(oakProfile, mappedRecipe.options);
if (mappedRuntime.traits.height !== 14
  || mappedRuntime.traits.trunkRadius !== 0.72
  || mappedRuntime.traits.crownMode !== 'decurrent'
  || mappedRuntime.radialSegments !== 14
  || mappedRuntime.canopy.cardSizeRange[0]
    <= oakProfile.structuralTraits.foliageCardSizeRange[0]) {
  throw new Error('Woody controls are not mapped into the Three.js plant-graph runtime.');
}

const nativeTree = new ProceduralSpeciesTree({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  developmentProgress: 0.5,
  geometrySeed: 41,
});
if (nativeTree.plantGraph.growthModel !== 'toonlab-recursive-woody-v3'
  || nativeTree.trunkMesh.userData.generationPipeline !== 'recursive-woody-v3'
  || nativeTree.canopyMesh.userData.generationPipeline !== 'recursive-woody-v3'
  || nativeTree.trunkMesh.geometry.userData.generator
    !== 'toonlab-recursive-woody-mesh-v1'
  || nativeTree.canopyMesh.geometry.userData.generator
    !== 'toonlab-recursive-woody-foliage-v2') {
  throw new Error('A v3 woody recipe reached a legacy structure or foliage generator.');
}

console.log(JSON.stringify({
  sourceAssetsAudited: assets.length,
  sourceCohortsAudited: Object.keys(inspection.assetFamilies ?? {}).length,
  sourceInputs: inputSockets.length,
  graphConnectedControls: meaningfulInputs.length,
  interfaceOnlyLabels: interfaceOnly.length,
  neutralControls: WOODY_BASELINE_CONTROLS.length,
  serializableControls: serializableControls.length,
  toonlabSpeciesBaselines: woodyProfiles.length,
  distinctSpeciesBaselines: inheritedFingerprints.size,
  neutralEnums: Object.keys(WOODY_BASELINE_ENUM_OPTIONS).length,
  coverage: counts,
  groups: grouped,
}, null, 2));
console.log('Woody baseline coverage contract passed.');
