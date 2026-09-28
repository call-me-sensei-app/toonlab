import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../agents', import.meta.url));
const skillRoot = join(root, 'skills');

async function collectSkillPaths(agent) {
  const agentRoot = join(skillRoot, agent);
  const directories = await readdir(agentRoot, { withFileTypes: true });
  return directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(agentRoot, entry.name, 'SKILL.md'))
    .sort();
}

function parseFrontmatter(source, path) {
  assert.match(source, /^---\r?\n/, `${path} must start with YAML frontmatter`);
  const end = source.indexOf('\n---', 4);
  assert.notEqual(end, -1, `${path} must close its YAML frontmatter`);
  const values = {};
  for (const line of source.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([a-z][a-z0-9_-]*):\s*(.+)$/i);
    assert.ok(match, `${path} contains unsupported or empty frontmatter: ${line}`);
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  assert.deepEqual(
    Object.keys(values).sort(),
    ['description', 'name'],
    `${path} frontmatter may contain only name and description`,
  );
  assert.match(values.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${path} has an invalid skill name`);
  assert.ok(values.description.length >= 20 && values.description.length <= 1024,
    `${path} description must contain 20–1024 characters`);
  return values;
}

function localMarkdownTargets(source) {
  return [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^<|>$/g, '').split('#')[0])
    .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
}

async function verifySkill(path, expectedAgent) {
  const source = await readFile(path, 'utf8');
  const frontmatter = parseFrontmatter(source, relative(root, path));
  assert.equal(frontmatter.name, dirname(path).split(sep).at(-1),
    `${path} name must equal its directory name`);
  for (const target of localMarkdownTargets(source)) {
    const absolute = resolve(dirname(path), target);
    assert.ok(absolute.startsWith(`${root}${sep}`), `${path} link escapes packaged agents/: ${target}`);
    const info = await stat(absolute).catch(() => null);
    assert.ok(info?.isFile(), `${path} has a missing local reference: ${target}`);
  }
  return { expectedAgent, frontmatter, source };
}

const codexPaths = await collectSkillPaths('codex');
const claudePaths = await collectSkillPaths('claude');
assert.equal(codexPaths.length, 18, 'the repository must contain all 18 paired user and research skills');
assert.deepEqual(
  codexPaths.map((path) => dirname(path).split(sep).at(-1)),
  claudePaths.map((path) => dirname(path).split(sep).at(-1)),
  'Codex and Claude skill directories must stay paired',
);

const [codexSkills, claudeSkills] = await Promise.all([
  Promise.all(codexPaths.map((path) => verifySkill(path, 'codex'))),
  Promise.all(claudePaths.map((path) => verifySkill(path, 'claude'))),
]);
const sceneStyleSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'scene-style-application');
assert.ok(sceneStyleSkill, 'scene-style-application skill must be packaged');
assert.match(sceneStyleSkill.source, /strict.*advisory/is);
assert.match(sceneStyleSkill.source, /Never import from a ToonLab `labs\//);
assert.match(sceneStyleSkill.source, /public package exports are the runtime authority/i);
assert.match(sceneStyleSkill.source, /every material\s+slot/i);
assert.match(sceneStyleSkill.source, /root domain label by\s+itself is incomplete/i);
assert.match(sceneStyleSkill.source, /missing material IDs\/roles.*blocking failure/is);
assert.match(sceneStyleSkill.source, /proposeManufacturedStyleTargetLabel/);
assert.match(sceneStyleSkill.source, /strict.*live material slots.*before mutation/is);
assert.match(sceneStyleSkill.source, /styleRuntime\.collision\.assertReady\(\)/);
assert.match(sceneStyleSkill.source, /createRapierCollisionAdapter\(\)/);
for (let index = 0; index < codexSkills.length; index += 1) {
  assert.equal(
    codexSkills[index].source,
    claudeSkills[index].source,
    `${codexSkills[index].frontmatter.name} skill differs between Codex and Claude`,
  );
}

const assetSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'asset-sourcing');
assert.ok(assetSkill, 'asset-sourcing skill must be packaged');
assert.match(assetSkill.source, /automatic\s+and assisted results separately/i);
assert.match(assetSkill.source, /applyManufacturedStyleTargetLabelProposal/);
for (const token of [
  'get_workspace_info',
  'search_cc0_assets',
  'get_runtime_guide',
  'search_public_gallery',
  'get_toonlab_asset',
]) {
  assert.ok(
    assetSkill.source.includes(token),
    `asset-sourcing skill must feature-detect OSS and Pro (${token})`,
  );
}
assert.match(assetSkill.source, /surface-specific\s+schemas/);
assert.match(assetSkill.source, /source: 'official'/);
assert.match(assetSkill.source, /dimensionsMeters/);
assert.match(assetSkill.source, /never render a GLB merely to\s+discover its size/);
assert.match(assetSkill.source, /Every reusable saved object must include up to ten concise\s+lowercase slug tags/);
assert.match(assetSkill.source, /semantic role, material or asset family/);
assert.match(assetSkill.source, /never save an\s+object with only a filename or generic `asset` tag/);
assert.match(assetSkill.source, /Follow `nextOffset` until\s+null when checking for an existing saved object/);
assert.match(
  assetSkill.source,
  /Pro does not expose `search_cc0_assets` or `import_cc0_asset`/,
  'asset-sourcing skill must not prescribe OSS-only tools to Pro users',
);

const grassSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'vegetation-sky');
assert.ok(grassSkill, 'vegetation-sky skill must be packaged');
assert.match(grassSkill.source, /first-party procedural grass/);
assert.match(grassSkill.source, /no GLB,/);
assert.match(grassSkill.source, /clean npm tarball contains no grass media files/);
assert.match(grassSkill.source, /call_me_sensei_clump/);
assert.match(grassSkill.source, /40\s+upright overlapping blades/);
assert.match(grassSkill.source, /full ground-field adoption/);
assert.match(grassSkill.source, /texture-free watercolor lift/);
assert.match(grassSkill.source, /Reject dark or dirty roots/);
assert.match(grassSkill.source, /frozen controlled\s+source mode/);
assert.match(grassSkill.source, /green ground produces only shades of green/);
assert.match(grassSkill.source, /LOD0\/1\/2 reduce 40\/14\/6 primary blades/);
assert.match(grassSkill.source, /terrain appear to change color/);
assert.match(grassSkill.source, /createCapEdgeWeight\(\{ rimBias: 0\.05/);
// Was `createDefaultCloudStrokes(preset)`: the painted cloud pipeline that
// guidance described no longer exists, so the skill has to name the volumetric
// entry point instead — an agent told to paint strokes would call a deleted
// function.
assert.match(grassSkill.source, /SkySystem\.create\(\{ renderer, scene, camera \}\)/);
assert.match(grassSkill.source, /applyPreset\(skyParams\)/);
// Named only as retired. A call form would be an instruction to use them.
assert.doesNotMatch(grassSkill.source, /createDefaultCloudStrokes\(|createCloudField\(/);
assert.match(grassSkill.source, /`createCloudField` and\s+`createCloudShaderSettings` no longer exist/);
assert.match(grassSkill.source, /call its `update\(\)` every frame before grass/);
assert.match(grassSkill.source, /Its current crown is tip-driven:[\s\S]*fixed by the wrapper/);

const discoveryReference = await readFile(join(root, 'references', 'mcp-asset-discovery.md'), 'utf8');
assert.match(discoveryReference, /ToonLab OSS local sequence/);
assert.match(discoveryReference, /ToonLab Pro remote sequence/);
assert.match(discoveryReference, /common\s+names such as `search_assets`/i);
assert.match(discoveryReference, /source: 'official'/);
assert.match(discoveryReference, /dimensionsMeters\.width/);
assert.match(discoveryReference, /both OSS and Pro catalog searches/);
assert.match(discoveryReference, /assign up to ten stable lowercase slug tags/);

const outdoorSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'outdoor-world');
assert.ok(outdoorSkill, 'outdoor-world research skill must remain available in the repository');
assert.match(outdoorSkill.frontmatter.description, /Experimentally construct/);
assert.match(outdoorSkill.source, /# Experimental stylized outdoor-world construction/);
assert.match(outdoorSkill.source, /not evidence that ToonLab or\s+an LLM can currently produce a polished world from one prompt/);
assert.match(outdoorSkill.source, /search_assets\(\{ source: 'official' \}\)/);
assert.match(outdoorSkill.source, /transformed scene dimensions/);
assert.match(outdoorSkill.source, /continuous\s+coverage at the grazing camera/);
assert.match(outdoorSkill.source, /bright watercolor wash/);
assert.match(outdoorSkill.source, /Never approve by color\s+values alone/);
assert.match(outdoorSkill.source, /ground blending as an LOD invariant/i);
assert.match(outdoorSkill.source, /preset: 'call_me_sensei'[\s\S]*scenario: 'exteriorDay'/);
assert.match(outdoorSkill.source, /qualified authored\s+clumps such as the 0\.82 m Call Me Sensei primary/);
assert.match(outdoorSkill.source, /continuously ramp ground/);
assert.match(outdoorSkill.source, /Never snap or clamp `heightAt\(\)`/);
assert.match(outdoorSkill.source, /styleRuntime\.collision\.assertReady\(\)/);

const surfaceSkill = codexSkills.find(({ frontmatter }) => (
  frontmatter.name === 'rock-ground-shaders'
));
assert.ok(surfaceSkill, 'rock-ground-shaders skill must be packaged');
assert.match(surfaceSkill.source, /applyRockShader/);
assert.match(surfaceSkill.source, /setRockShaderSceneState/);
assert.match(surfaceSkill.source, /first-party generated rock maps/);
assert.match(surfaceSkill.source, /castShadow.*receiveShadow/s);
assert.match(surfaceSkill.source, /lighting\.sunIntensity/);
assert.match(surfaceSkill.source, /pass\.writerCount > 0/);
assert.match(surfaceSkill.source, /pass\.invalidate\(\)/);
assert.match(surfaceSkill.source, /self-shadow acne/);

const karstSkill = codexSkills.find(({ frontmatter }) => (
  frontmatter.name === 'karst-cliff-construction'
));
assert.ok(karstSkill, 'karst-cliff-construction research skill must remain available in the repository');
assert.match(karstSkill.frontmatter.description, /experimental research/i);
assert.match(karstSkill.source, /not a supported automatic cliff builder/);
assert.match(karstSkill.source, /dimensionsMeters\.width/);
assert.match(karstSkill.source, /createModelAssetTranscoders/);
assert.match(karstSkill.source, /shared \*\*face plane\*\*/);
assert.match(karstSkill.source, /explicit and refusable/);
assert.doesNotMatch(karstSkill.source, /catalog record carries no bounding box/i);
assert.doesNotMatch(karstSkill.source, /64²/);
assert.doesNotMatch(karstSkill.source, /480-rock catalog/i);

const styleSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'style-presets');
assert.ok(styleSkill, 'style-presets skill must be packaged');
// Cloud dropped out of this list with the volumetric rebuild: it has no named
// style to default to, so promising one would send an agent looking for a
// preset id that does not exist.
assert.match(styleSkill.source, /Rock and Ground already default to Call Me Sensei/);
assert.match(styleSkill.source, /Cloud has no named style at all since the volumetric rebuild/);
assert.match(styleSkill.source, /first-party generated 256 px data/);
assert.match(styleSkill.source, /honou?rs an explicit (?:alternate )?preset/);
assert.match(styleSkill.source, /`applyEnvironmentShader` \| `preset: 'call_me_sensei'`/);
assert.doesNotMatch(styleSkill.source, /every style-aware factory.*neutral/i);
assert.match(styleSkill.source, /Sky and Cloud focused authoring is live/);
assert.match(styleSkill.source, /Weather and Climate engines remain repository-only/);

const gameDevSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'game-dev');
assert.ok(gameDevSkill, 'game-dev skill must be packaged');
assert.match(gameDevSkill.frontmatter.description, /new playable game.*existing Three.js game/);
assert.match(gameDevSkill.source, /playable vertical slice/);
assert.match(gameDevSkill.source, /one update owner per system and one final render owner/);
assert.match(gameDevSkill.source, /material IDs and roles/);
assert.match(gameDevSkill.source, /proposeManufacturedStyleTargetLabel/);
assert.match(gameDevSkill.source, /Do not maintain a second\s+blocker list/);
assert.match(gameDevSkill.source, /styleRuntime\.collision\.assertReady\(\)/);

const weatherSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'weather');
assert.ok(weatherSkill, 'weather research skill must remain available in the repository');
assert.match(weatherSkill.frontmatter.description, /repository weather tools in a user-authored scene/);
assert.match(weatherSkill.source, /Not a public npm entry point and not one of the 15 live Labs/);
assert.match(weatherSkill.source, /not automatic full-world composition|automatically compose Sky/);

const waterSkill = codexSkills.find(({ frontmatter }) => frontmatter.name === 'water');
assert.ok(waterSkill, 'water skill must be packaged');
assert.match(waterSkill.source, /three authored axes/);
assert.match(waterSkill.source, /`classic`, `anime`,\s+`teal`, `caribbean`, `lagoon`, or `deepOcean`/);
assert.match(waterSkill.source, /A non-`classic` tone owns its coherent optical block/);
assert.match(waterSkill.source, /`opacity` controls only the fallback path/);

const visualSkill = codexSkills.find(({ frontmatter }) => (
  frontmatter.name === 'visual-verification'
));
assert.ok(visualSkill, 'visual-verification skill must be packaged');
assert.match(visualSkill.source, /await every readiness promise/i);
assert.match(visualSkill.source, /necessary signal, not proof/);
assert.match(visualSkill.source, /hero, wide, close, flyover, top-down/);
assert.match(visualSkill.source, /authorization permit an independent agent\/thread/);
assert.match(visualSkill.source, /small `readPixels` grid or the captured image/);
assert.match(visualSkill.source, /Do not\s+hardcode black/);

const geologyReference = await readFile(join(root, 'references', 'geology-playbook.md'), 'utf8');
assert.match(geologyReference, /continuous terrain\/heightfield silhouette/i);
assert.match(geologyReference, /dimensionsMeters/);
assert.match(geologyReference, /face plane\/standoff/);
assert.match(geologyReference, /rendered multi-view evidence/i);

const sharedGuide = await readFile(join(root, 'codex', 'AGENTS.md'), 'utf8');
const cursorGuide = await readFile(join(root, 'cursor', 'toonlab.mdc'), 'utf8');
const resourceGuide = await readFile(join(root, 'README.md'), 'utf8');
const styleBundleReference = await readFile(join(root, 'references', 'style-bundles.md'), 'utf8');
for (const [label, source] of [
  ['shared agent guide', sharedGuide],
  ['Cursor guide', cursorGuide],
  ['agent resource index', resourceGuide],
]) {
  for (const route of ['style-presets', 'visual-verification']) {
    assert.ok(source.includes(route), `${label} must route agents to ${route}`);
  }
  assert.equal(
    source.includes('karst-cliff-construction'),
    false,
    `${label} must not route package users to the repository-only karst skill`,
  );
}
for (const [label, source] of [
  ['shared agent guide', sharedGuide],
  ['Cursor guide', cursorGuide],
  ['agent resource index', resourceGuide],
  ['style-bundle reference', styleBundleReference],
]) {
  assert.match(source, /every (?:newly modeled, generated, or imported )?material slot|every material slot/i,
    `${label} must require complete per-material labeling`);
  assert.match(source, /root(?:-only|\s+domain)\s+label.*(?:incomplete|not sufficient|does not substitute|do not make.*bundle-ready)/is,
    `${label} must reject root-only labeling for multi-material assets`);
  assert.match(source, /strict.*(?:block|fail)|(?:block|fail).*strict/is,
    `${label} must make incomplete material coverage blocking in strict mode`);
}
assert.match(styleBundleReference, /createStyleMaterialContract/);
assert.match(styleBundleReference, /toonlabMaterialId/);

console.log(`Agent skills verified: ${codexSkills.length} paired skills, valid frontmatter, and no broken local references.`);
