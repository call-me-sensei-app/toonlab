import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const entry = await source('../labs/playground/ecctrlMain.jsx');
const character = await source('../labs/playground/ShowcaseCharacter.jsx');
const controllerScene = await source('../labs/playground/scenes/showcases/controllerScene.jsx');
const indoorScene = await source('../labs/playground/scenes/showcases/indoorRoomScene.jsx');
const walkableHost = await source('../labs/playground/scenes/showcases/WalkableSceneHost.jsx');
const sceneRegistry = await source('../labs/playground/scenes/showcases/sceneRegistry.js');
const referenceHtml = await source('../examples/walkable-reference/index.html');
const referenceScene = await source('../examples/walkable-reference/main.js');
const polishExperiments = await source('../examples/walkable-reference/polishExperiments.js');
const playgroundHtml = await source('../playground/index.html');
const physicsReadiness = await source('../labs/playground/scenes/showcases/walkablePhysicsReadiness.jsx');
const indoorInfrastructure = await source('../labs/playground/scenes/indoorScene.jsx');
const waterSceneComponents = await source('../labs/playground/scenes/waterScenes.jsx');
const waterRuntimeView = await source('../labs/playground/scenes/waterRuntimeView.jsx');
const catalogRock = await source('../labs/playground/scenes/officialCatalogRock.jsx');
const waterHud = await source('../labs/playground/scenes/waterHud.jsx');

assert.match(character, /createWalkableCharacterRuntime/);
assert.match(character, /styleTarget:\s*\{\s*targetId:\s*'walkable\/character'\s*\}/,
  'Walkable character must expose one stable package style target id');
assert.match(character, /toon:\s*false/,
  'Walkable character source materials must remain neutral until the bundle owns styling');
assert.doesNotMatch(character, /SHADER_MODE|applyToonShader/,
  'Walkable character must not pre-apply a second scene-local character shader');
assert.match(character, /walkableRuntime\.update/);
assert.match(character, /walkableRuntimeRef\.current\?\.enforce/);
assert.match(character, /groundStabilizer:\s*\{\s*lockGrounded:\s*false\s*\}/,
  'Ecctrl adapter must not enable a second grounded-body lock');
assert.match(character, /upright:\s*false/,
  'Ecctrl adapter must leave upright balance to the physics controller');
assert.match(controllerScene, /ground=\{FLAT_GROUND\}/);
assert.match(indoorScene, /ground=\{ground\}/);
assert.match(walkableHost, /createWalkableCharacterRuntime|<Character/);
assert.match(walkableHost, /<Ecctrl/);
assert.match(walkableHost, /<KeyboardControls/);
assert.match(walkableHost, /<Physics/);
assert.match(walkableHost, /timeStep="vary"/,
  'shared walkable physics must use the stable variable-step contract');
assert.match(walkableHost, /WalkablePhysicsReadinessProvider/,
  'shared walkable host must own async collider readiness');
assert.match(walkableHost, /paused=\{physicsProps\.paused === true \|\| pendingPhysicsAssets > 0\}/,
  'Rapier must remain paused while any async collider producer is pending');
assert.match(physicsReadiness, /useLayoutEffect/,
  'async collider producers must register before the first animation frame');
assert.match(physicsReadiness, /gate\.begin\(token\)/);
assert.match(physicsReadiness, /gate\?\.complete\(token\)/);
assert.doesNotMatch(physicsReadiness, /setTimeout|requestAnimationFrame/,
  'physics readiness must be lifecycle-driven rather than timing-driven');
assert.match(entry, /examples\/walkable-reference/,
  'The retired water playground route must redirect to the independent reference scene');
assert.doesNotMatch(sceneRegistry, /walkable-sample|WalkableSampleScene/,
  'The old playground-composed walkable scene must not remain registered');
assert.match(playgroundHtml, /params\.get\('scene'\) !== 'water'/,
  'Legacy scene=water links must redirect before the old playground mounts');
assert.match(referenceHtml, /id="time"/);
assert.match(referenceHtml, /id="style-bundle"/);
assert.match(referenceHtml, /id="character-url"/);
assert.match(referenceHtml, /aria-label="Shader domains"/);
assert.match(referenceHtml, /aria-label="Polish experiments"/);
assert.match(referenceHtml, /class="back-link"/);
assert.doesNotMatch(referenceHtml, /Cloud shadow|Tree bark|Tree shadow/,
  'Internal QA telemetry must not leak into the public reference panel');
assert.match(referenceScene, /createWalkableCharacterRuntime/);
assert.match(referenceScene, /createCharacterControllerProfile/);
assert.match(referenceScene, /let jumpRequested = false/,
  'Stationary jump input must be queued until the animation frame consumes it');
assert.match(referenceScene, /const groundedAtFrameStart = body\.userData\.canJump/,
  'Jump animation must receive the pre-launch grounded state');
assert.match(referenceScene, /landed: landedThisFrame/,
  'The reference must explicitly signal jump landing to the shared character runtime');
assert.match(referenceScene, /createSceneSurfaceRuntime/);
assert.match(referenceScene, /createSceneStyleRuntime/);
assert.match(referenceScene, /resolveWalkablePolishExperiments/);
assert.equal(
  [...polishExperiments.matchAll(/^\s+\['[a-z-]+',/gm)].length,
  15,
  'Scene Three must expose exactly fifteen stable polish experiments',
);
assert.match(polishExperiments, /implemented:\s*true/,
  'Scene Three polish experiments must be interactive after their implementations land');
assert.match(referenceScene,
  /discovery:\s*'scene-labels',[\s\S]{0,160}mode:\s*'strict',[\s\S]{0,160}watch:\s*!isWalkablePolishExperimentEnabled/,
  'The reference scene must demonstrate strict discovery and only disable watching for its isolated lifecycle experiment');
assert.match(referenceScene, /runtime\.collision\.assertReady\(\)/,
  'The reference scene must fail closed when package-owned collision is incomplete');
assert.match(referenceScene, /createOfficialCatalogAssetRuntime/);
assert.match(referenceScene, /rock-0002/);
assert.match(referenceScene, /rock-0005/);
assert.match(referenceScene, /rock-0362/);
assert.match(referenceScene, /runtime\.inspector\.setDomainEnabled/,
  'The reference scene must expose per-domain shader comparison');
assert.match(referenceScene, /surface\.audit\(/,
  'The reference scene must enforce the package surface integration audit');
assert.match(referenceScene, /requestedSkyCondition[\s\S]*partly_cloudy/,
  'The default reference sky must remain visibly partly cloudy');
assert.match(character, /ENABLE_NATIVE_ANIMATION \|\| ENABLE_IDLE_ANIMATION \|\| ENABLE_WALKING_ANIMATION/,
  'native animation mode must initialize the shared character animation runtime');
assert.match(waterHud, /toonlab-style-inspector/);
assert.match(waterHud, /setDomainEnabled/);
assert.match(waterHud, /exact pre-ToonLab state/);
assert.match(waterRuntimeView, /BODY_CENTER_AT_REST/,
  'water interaction callbacks must import the shared character body offset');
assert.doesNotMatch(waterSceneComponents, /applyManufacturedFurnitureShader/,
  'Manufactured props must be styled by the bundle adapter, not scene-local shader code');
assert.match(waterSceneComponents, /setTrimesh\(collectEnvironmentTrimesh\(model\)\);\s*completePhysicsReadiness\(\);/,
  'manufactured collider readiness must complete in the trimesh commit');
assert.match(catalogRock, /loadOfficialCatalogAsset\(\{[\s\S]*inspector,/,
  'Playground catalog rocks must register through the package placement runtime');
assert.match(catalogRock, /useWalkablePhysicsReadiness\([\s\S]*collidable/,
  'async catalog colliders must participate in the shared physics gate');
assert.match(catalogRock, /setPlacement\(next\);\s*completePhysicsReadiness\(\);/,
  'catalog physics readiness must complete in the collider placement commit');
assert.doesNotMatch(catalogRock, /inspector\.registerApplication/,
  'Playground must not duplicate package inspector registration');
for (const scene of [controllerScene, indoorScene]) {
  assert.match(scene, /<WalkableSceneHost/);
  assert.doesNotMatch(scene, /<Ecctrl|<KeyboardControls|<Physics/,
    'showcase scene files must consume the shared controller host');
}

for (const retiredImplementation of [
  'ControllerGroundStabilizer',
  'FlatGroundRecovery',
  'IndoorGroundRecovery',
  'SwimController',
  'blendRef',
  'setLocomotionActionWeights',
]) {
  assert.equal(
    [entry, character, controllerScene, indoorScene, referenceScene, indoorInfrastructure]
      .some((text) => text.includes(retiredImplementation)),
    false,
    `Playground must not restore ${retiredImplementation}`,
  );
}

assert.ok(entry.split('\n').length < 500, 'Playground entry remains orchestration-sized');
assert.ok(character.split('\n').length < 400, 'R3F character binding remains adapter-sized');
assert.ok(waterSceneComponents.split('\n').length < 900,
  'water showcase helpers stay split by HUD, sky, atmosphere, and water runtime concerns');
for (const scene of [controllerScene, indoorScene]) {
  assert.ok(scene.split('\n').length < 260, 'individual showcase scene files remain composition-sized');
}

await assert.rejects(
  access(new URL('../labs/playground/scenes/showcases/walkableSampleScene.jsx', import.meta.url)),
  'The retired playground walkable composition must be deleted, not hidden behind another option',
);
assert.ok(referenceScene.split('\n').length < 1_050,
  'The independent reference must remain reviewable as one scene composition file');

console.log('Independent walkable reference and retired playground migration verification passed.');
