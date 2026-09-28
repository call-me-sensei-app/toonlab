// Yua — the launch world's hero character, as one importable module.
//
// Both launch scenes (`labs/launch-world/city/`, `labs/launch-world/coast/`)
// import this; neither owns character code. It also backs the §11 S02/S07
// neutral-to-ToonLab wipe, which is why the whole module is built around a
// SINGLE load whose materials can be swapped in place:
//
//   const yua = await createYuaCharacter({ heightAt, parent: scene, renderer });
//   yua.placeAt({ bearing: 202.5, x: 0, z: 4 });
//   // per frame
//   yua.update(delta);
//   // inside one frame, between two renderer.render calls
//   yua.setMaterialMode('neutral');   // scissored half
//   yua.setMaterialMode('toon');      // full frame
//
// One skeleton, one AnimationMixer, one set of geometry buffers. `setMaterialMode`
// rebinds `mesh.material` references and toggles the outline/fur children; it does
// not reload, re-skin, or re-run the style transaction.
//
// Plan reference: 18-launch-video-world-production-plan §5 (character contract),
// §10.1/§10.2 (hero marks), §11 (shot plan and the wipe), §4 (material separation).

import * as THREE from 'three';

import { createCharacterRuntime } from '../../../src/character/characterRuntime.js';
import { setLocomotionActionWeights } from '../../../src/character/locomotionActions.js';
import { resolveYuaToonOptions } from './yuaToonStyle.js';

/** CHAR-YUA-01 (§5). Served by the dev server straight out of the asset workspace. */
export const YUA_URL = '/assets-local/models/yua/yua.glb';

const TEXTURE_ROOT = '/assets-local/models/yua/textures';

/**
 * §5 requires "1.745 m source scale". The GLB's own rest-pose bound measures
 * 1.74551 m sole-to-hair-tip, so this is the value that makes
 * `fitModelForController` a no-op scale of 1.0000 rather than a 0.03 % shrink.
 * Passing the rounded 1.745 would silently rescale the source.
 */
export const YUA_SOURCE_HEIGHT = 1.7455;

/**
 * §5 requires idle, walk, and one stronger movement clip. `run` is the third.
 * Yua's GLB ships **no** clips of its own, so all three are retargeted from
 * ToonLab's packaged mannequin (`TOONLAB_MANNEQUIN_ASSET_URL`, resolved by the
 * package — deliberately not hard-coded here).
 */
export const YUA_LOCOMOTION_ROLES = Object.freeze(['idle', 'walk', 'run']);

/**
 * Both launch scenes author their worlds with **north = -Z** (the coast module
 * says so explicitly; the city's S01 camera sits at +Z looking up the avenue).
 * The plan text uses "+Z is north", so every compass bearing in §10 has to be
 * converted through this one function rather than eyeballed per scene.
 *
 * Yua's model forward is +Z (ponytail and hairband occupy -Z, toes occupy +Z),
 * so a bearing b maps to yaw = atan2(sin b, -cos b) = b - 180 degrees.
 */
export function bearingToYaw(bearingDegrees) {
  const bearing = THREE.MathUtils.degToRad(bearingDegrees);
  return Math.atan2(Math.sin(bearing), -Math.cos(bearing));
}

/** §10 hero marks, in each scene's own coordinate frame. */
export const YUA_MARKS = Object.freeze({
  // §10.1 — plaza mark, facing south-southwest for the establishing shot.
  city: Object.freeze({ bearing: 202.5, x: 0, y: 0, z: 4 }),
  // §10.2 — overlook mark, facing west-northwest toward the water.
  coast: Object.freeze({ bearing: 292.5, x: 4, y: 2.2, z: 18 }),
});

/**
 * Leather is the family the role vocabulary cannot express — there is no
 * `leather` role, and shoes are legitimately `costume`, which shades as cloth.
 * The `call_me_sensei` preset turns on `highlights.specular.clothNeedsMask`
 * (with `highlights.specular.mask.fromSource`): a cloth material carrying a
 * `toonSpecularMaskMap` takes the specular highlight, its role-mates without
 * one stay matte. The mask ships alongside the GLB and is bound here.
 */
const SPECULAR_MASKED_MATERIALS = Object.freeze(['costume_shoes', 'costume_headband']);

/**
 * The ONLY material on Yua whose alpha channel is a real coverage mask.
 *
 * Measured by histogramming each material's sampled alpha at 256x256: the
 * shoes put ~0.5 % of their texels in the intermediate band (0.06–0.94), which
 * is a binary cutout. `costume_outerwear` puts 38.8 % there — it is a
 * wrinkle/AO channel pack riding in the alpha slot of a Blender glTF
 * "RGB from image A, alpha from image B" pairing, and cutting it at 0.5
 * discards the entire soft middle. Four more of Yua's materials have no alpha
 * channel at all.
 *
 * `YUA_LAUNCH_TOON_STYLE.alpha` switches off every role/token cutout rule, so
 * `alpha.preserveSourceAlphaTest` reading this value off the source material
 * is the single remaining route to a cutout — which is exactly the evidence
 * gate, authored where the evidence lives instead of inferred in the shader.
 */
const ALPHA_CUTOUT_MATERIALS = Object.freeze({ costume_shoes: 0.35 });

function loadTexture(loader, url, { colorSpace = THREE.NoColorSpace } = {}) {
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false;
    return texture;
  });
}

/**
 * Loads the auxiliary masks. Deliberately separate from binding them: the
 * runtime's `onStage` callback is invoked synchronously and its return value is
 * discarded, so anything asynchronous done from inside it lands *after*
 * conversion — silently, with the roles apparently set on materials nobody draws
 * any more. The textures therefore have to exist before the load starts.
 */
async function loadAuxiliaryMasks() {
  const loader = new THREE.TextureLoader();
  const specularMask = await loadTexture(loader, `${TEXTURE_ROOT}/specular-mask.png`);
  return { specularMask };
}

/**
 * Binds Yua's specular mask, authored cutouts and the metal role onto the
 * imported materials. Must run before conversion — `applyToonShader` reads
 * `userData` and `alphaTest` off the source material when it builds the toon
 * material.
 */
function bindSourceMaterials(root, { specularMask }) {
  const bound = { alphaCutout: 0, metal: 0, specular: 0 };
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      material.userData ??= {};
      if (object.name.startsWith('Buckles')) {
        material.userData.toonRole = 'metal';
        material.userData.toonSpecularMaskMap = specularMask;
        bound.metal += 1;
        bound.specular += 1;
        continue;
      }
      if (SPECULAR_MASKED_MATERIALS.includes(material.name)) {
        material.userData.toonSpecularMaskMap = specularMask;
        bound.specular += 1;
      }
      // Author the cutout where the evidence is, and clear it everywhere else.
      // The source GLB leaves `alphaTest` at 0 on every material, so without
      // the explicit set the shoes' genuine mask would be lost along with the
      // eight false positives.
      const cutoff = ALPHA_CUTOUT_MATERIALS[material.name];
      if (cutoff === undefined) {
        material.alphaTest = 0;
        material.transparent = false;
      } else {
        material.alphaTest = cutoff;
        bound.alphaCutout += 1;
      }
    }
  });
  return bound;
}

/**
 * The imported material set is shared between meshes (`Buckles_low`,
 * `Pants_low`, `Pants2_low` and `Top_low` all reference `costume_cloth`), so
 * promoting the buckles to `metal` by writing `userData` on that shared material
 * would drag the trousers with it. Cloning first keeps the promotion local.
 */
function isolateMeshMaterials(root, meshNamePrefixes) {
  for (const object of collectMeshes(root)) {
    if (!meshNamePrefixes.some((prefix) => object.name.startsWith(prefix))) continue;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => cloneNamedMaterial(material, object.name))
      : cloneNamedMaterial(object.material, object.name);
  }
}

function cloneNamedMaterial(material, meshName) {
  if (!material) return material;
  const clone = material.clone();
  clone.name = `${material.name || 'material'}__${meshName}`;
  clone.userData = { ...material.userData };
  return clone;
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object?.isMesh && object.material) meshes.push(object);
  });
  return meshes;
}

/**
 * Draws every inverted-hull outline BEFORE the mesh it belongs to, not after.
 *
 * D19-150. The inverted hull assumes CLOSED geometry: cull the front faces and
 * what survives sits behind the model except where it spills past the
 * silhouette. Single-layer cloth breaks that assumption — an open jacket panel,
 * a skirt, a cape and a hair card have no inside, so the hull's back faces are
 * the very faces the camera is looking at. Drawn after the mesh at
 * `renderOrder + 1`, that coincident hull wins the LEQUAL depth test across the
 * whole surface and paints an entire garment panel in outline ink. It scales
 * with outline width, so it gets dramatically worse the moment the contours are
 * made thick enough to read — which is what produced the "navy panel" that
 * looked like a shading bug and was not one.
 *
 * Drawing the hull first inverts the tie-break with no depth bias at all: the
 * mesh overwrites its own coincident hull, while silhouette spill has no mesh
 * over it and survives untouched. (A depth bias WAS tried and rejected — it
 * needed roughly 8x expansion to clear, which eroded the hair and jaw contours.)
 *
 * The ordering belongs in `addOutlinePass` in the shader package, and that is
 * recorded as a recommendation. `src/toon/**` is not ours to edit, so the
 * launch world corrects it on its own model after conversion: `renderOrder` is
 * plain Object3D state, and the outline children are tagged
 * `userData.isToonOutline`, so this is complete and stable without reaching
 * into the shader. Re-applied after every `setMaterialMode`, because the wipe
 * rebuilds the outline child set on each flip.
 */
function drawOutlineHullsFirst(root) {
  let corrected = 0;
  root.traverse((object) => {
    if (!object?.userData?.isToonOutline) return;
    const owner = object.parent;
    const ownerOrder = Number.isFinite(owner?.renderOrder) ? owner.renderOrder : 0;
    const target = ownerOrder - 1;
    if (object.renderOrder === target) return;
    object.renderOrder = target;
    corrected += 1;
  });
  return corrected;
}

/**
 * Measures where the shoes actually are, relative to the carrier origin.
 *
 * `fitModelForController` recentres the model on its **whole-body** XZ bounding
 * centre, and Yua's silhouette is not symmetric in Z: the ponytail reaches
 * 0.29 m behind her while her toes reach 0.14 m in front. The bbox centre
 * therefore sits behind her feet, and the carrier origin ends up roughly 0.1 m
 * behind the ground contact. On flat ground that is a placement error; on the
 * coastal overlook it is also a *height sampling* error, because the height is
 * sampled at the origin and the feet stand somewhere else.
 *
 * This returns the correction, so the caller can put the feet on the mark.
 */
function measureFootOffset(root) {
  const box = new THREE.Box3();
  let found = false;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object?.isMesh || !object.name.startsWith('Shoes')) return;
    object.geometry.computeBoundingBox();
    box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    found = true;
  });
  if (!found) return { valid: false, x: 0, y: 0, z: 0 };
  const center = box.getCenter(new THREE.Vector3());
  return { valid: true, x: center.x, y: box.min.y, z: center.z };
}

/**
 * Per-foot ground contact.
 *
 * A single height sample under the body origin is only correct on a plane. On
 * the garden's stepping stones — irregular, close to camera, and read at 70-85 mm
 * — the two feet routinely stand on surfaces at different heights, and a
 * body-origin sample puts one foot inside the stone and the other in the air.
 * §13 rejects "floating contacts" and both failures are the same defect.
 *
 * This measures each shoe's own sole and footprint from the live skeleton, so a
 * caller can ground against the higher of the two (never penetrate) and *report*
 * the clearance under the other rather than assume it away.
 */
function measureFeet(root, carrier) {
  const boxes = { left: new THREE.Box3(), right: new THREE.Box3() };
  carrier.updateMatrixWorld(true);
  const toCarrier = new THREE.Matrix4().copy(carrier.matrixWorld).invert();
  const world = new THREE.Vector3();
  const local = new THREE.Vector3();

  root.traverse((shoe) => {
    if (!shoe?.isMesh || !shoe.name.startsWith('Shoes')) return;
    if (shoe.userData?.isToonOutline || shoe.userData?.isToonFurShell) return;
    const position = shoe.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      world.fromBufferAttribute(position, index);
      // `applyBoneTransform` returns mesh-local space with the bind matrices
      // already applied, so only the mesh's world matrix remains.
      if (shoe.isSkinnedMesh) shoe.applyBoneTransform(index, world);
      world.applyMatrix4(shoe.matrixWorld);
      // The shoes are a single skinned mesh spanning both feet, so the split has
      // to be geometric: which side of Yua's own centre line the vertex is on.
      local.copy(world).applyMatrix4(toCarrier);
      boxes[local.x >= 0 ? 'left' : 'right'].expandByPoint(world);
    }
  });

  const describe = (box) => {
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    return { soleY: box.min.y, x: center.x, z: center.z };
  };
  return { left: describe(boxes.left), right: describe(boxes.right) };
}

/**
 * Loads Yua once, in both looks, ready for grounding and locomotion.
 *
 * @param {object} options
 * @param {(x: number, z: number) => number} [options.heightAt] Scene height field.
 *   Defaults to flat ground. The character is grounded against it at the *feet*,
 *   not at the carrier origin.
 * @param {THREE.Object3D} options.parent Scene or group to attach to.
 * @param {THREE.WebGPURenderer} options.renderer Required for toon conversion.
 * @param {object} [options.renderPasses] `createCharacterRenderPasses` result, if
 *   the host runs the depth prepass / character shadow map.
 * @param {'neutral'|'toon'} [options.materialMode] Initial look.
 */
export async function createYuaCharacter({
  heightAt = () => 0,
  materialMode = 'toon',
  onProgress = null,
  parent,
  renderPasses = null,
  renderer,
  signal = null,
  /**
   * The launch world's hero style: the shipped `call_me_sensei` preset plus
   * this world's own SCENE-SIDE override layer (`./yuaToonStyle.js`). The
   * preset itself is never edited — pass `toonStyle: { preset: 'call_me_sensei' }`
   * to render Yua on the bare shipped preset for an A/B.
   */
  toonStyle = resolveYuaToonOptions(),
  url = YUA_URL,
} = {}) {
  if (!renderer) throw new TypeError('createYuaCharacter requires a renderer.');

  onProgress?.('Loading Yua material masks…');
  const masks = await loadAuxiliaryMasks();
  let boundMaterialMasks = { alphaCutout: 0, metal: 0, specular: 0 };
  const runtime = await createCharacterRuntime({
    animation: { freestyle: false, roles: [...YUA_LOCOMOTION_ROLES] },
    materialModes: true,
    name: 'Yua',
    // Synchronous by contract: `stage()` calls this and discards the result.
    onStage({ detail, stage }) {
      if (stage === 'model') onProgress?.('Loading Yua…');
      if (stage === 'animation') onProgress?.('Retargeting locomotion…');
      if (stage !== 'style') return;
      // The style stage fires with the imported materials still mounted and the
      // model already fitted — the only point where source-material authoring
      // is both possible and final.
      onProgress?.('Binding material roles…');
      isolateMeshMaterials(detail.asset.root, ['Buckles']);
      boundMaterialMasks = bindSourceMaterials(detail.asset.root, masks);
    },
    parent,
    renderer,
    renderPasses,
    signal,
    styleTarget: { targetId: 'launch-world/yua' },
    targetHeight: YUA_SOURCE_HEIGHT,
    toon: toonStyle,
    url,
  });

  const footOffset = measureFootOffset(runtime.modelRoot);
  const placement = { bearing: 0, groundY: 0, x: 0, z: 0 };

  function placeAt({ bearing = placement.bearing, x = placement.x, z = placement.z } = {}) {
    placement.bearing = bearing;
    placement.x = x;
    placement.z = z;
    const yaw = bearingToYaw(bearing);
    // Rotate the measured foot offset with the character, then subtract it, so
    // the SHOES land on (x, z) at any facing.
    const offsetX = footOffset.x * Math.cos(yaw) + footOffset.z * Math.sin(yaw);
    const offsetZ = -footOffset.x * Math.sin(yaw) + footOffset.z * Math.cos(yaw);
    const groundY = heightAt(x, z);
    placement.groundY = groundY;
    runtime.carrier.rotation.set(0, yaw, 0);
    runtime.carrier.position.set(x - offsetX, groundY - footOffset.y, z - offsetZ);
    runtime.carrier.updateMatrixWorld(true);

    // Second pass: re-ground against the FEET, on the surface under each of
    // them. On a flat plate this is a no-op; on stepping stones, gravel and
    // moss it is the difference between standing on the path and standing
    // through it. Lift to the higher of the two supports — a foot in the air
    // is a visible defect, a foot inside a stone is a worse one — and let
    // `groundReport` publish the clearance under the other.
    const feet = measureFeet(runtime.modelRoot, runtime.carrier);
    const supports = ['left', 'right']
      .map((side) => (feet[side] ? heightAt(feet[side].x, feet[side].z) : null))
      .filter((height) => Number.isFinite(height));
    if (supports.length) {
      const soles = ['left', 'right']
        .map((side) => feet[side]?.soleY)
        .filter((value) => Number.isFinite(value));
      const lift = Math.max(...supports) - Math.min(...soles);
      runtime.carrier.position.y += lift;
      runtime.carrier.updateMatrixWorld(true);
      placement.groundY = Math.max(...supports);
    }
    return { ...placement, yaw };
  }

  /**
   * Measured, not asserted. `measureFootOffset` walks the live world matrices,
   * so after `placeAt` it reports the shoes' true world position — which is what
   * §5's "correct floor contact" has to be checked against.
   */
  function groundReport() {
    runtime.carrier.updateMatrixWorld(true);
    const bounds = measureFootOffset(runtime.modelRoot);
    const feet = measureFeet(runtime.modelRoot, runtime.carrier);
    const perFoot = {};
    for (const side of ['left', 'right']) {
      const foot = feet[side];
      if (!foot) continue;
      const support = heightAt(foot.x, foot.z);
      perFoot[side] = {
        // Positive = floating, negative = penetrating. Both are §13 defects.
        clearance: foot.soleY - support,
        soleY: foot.soleY,
        support,
        x: foot.x,
        z: foot.z,
      };
    }
    return {
      carrier: runtime.carrier.position.toArray(),
      contactError: bounds.y - placement.groundY,
      feet: perFoot,
      footprint: { x: bounds.x, z: bounds.z },
      groundY: placement.groundY,
      mark: { x: placement.x, z: placement.z },
      markError: Math.hypot(bounds.x - placement.x, bounds.z - placement.z),
      soleY: bounds.y,
    };
  }

  function setLocomotion(weights) {
    setLocomotionActionWeights(runtime.actions, weights);
  }

  setLocomotion({ idle: 1 });
  runtime.setMaterialMode(materialMode);
  let outlineHullsCorrected = drawOutlineHullsFirst(runtime.modelRoot);

  return {
    /** Material families actually bound, for the §5 evidence record. */
    boundMaterialMasks,
    carrier: runtime.carrier,
    dispose() {
      for (const texture of Object.values(masks)) texture.dispose();
      runtime.dispose();
    },
    footOffset,
    groundReport,
    get materialMode() {
      return runtime.materialMode;
    },
    placeAt,
    runtime,
    setLocomotion,
    /** Outline hulls moved ahead of their mesh, for the §5 evidence record. */
    get outlineHullsCorrected() {
      return outlineHullsCorrected;
    },
    /** The §11 wipe lever. Safe to call twice per frame. */
    setMaterialMode(mode) {
      const result = runtime.setMaterialMode(mode);
      // The flip rebuilds the outline child set, so the D19-150 ordering has to
      // be re-asserted. Idempotent and O(nodes) — this runs twice per frame in
      // the wipe and costs nothing after the first pass, because every node
      // already carries the target renderOrder and returns early.
      outlineHullsCorrected = drawOutlineHullsFirst(runtime.modelRoot);
      return result;
    },
    update(delta) {
      runtime.update(delta);
    },
  };
}
