// Canonical humanoid bone roles and per-convention name adapters.
//
// The retarget pipeline in ecctrlMain.jsx does a world-space bake that only
// needs to know WHICH target bone plays WHICH humanoid role — everything else
// (rest-pose differences, hierarchy mismatches) is solved numerically. This
// module owns that role knowledge so the pipeline itself stays rig-agnostic:
// roles follow the VRM humanoid naming (the only spec'd humanoid standard in
// the glTF world), and each supported convention (VRM, MMD/PMX, Mixamo-named
// skeletons) contributes a small name table mapping onto those roles.
//
// Animation sources are Mixamo FBX clips, so each role also carries its
// Mixamo bone name; a resolved rig is ultimately a pair of maps between
// target bone names and Mixamo source names.

// Mixamo bone per VRM humanoid role. Also the source-side chain map used for
// rest-pose direction corrections lives on these names (MIXAMO_CHAIN_CHILD).
/**
 * The humanoid contract itself: role -> canonical Mixamo bone name. Exported so
 * a host can audit a rig against it (which roles resolved, which are missing)
 * rather than inferring the answer from a bone count.
 */
export const MIXAMO_BONE_BY_ROLE = Object.freeze({
  hips: 'mixamorigHips',
  spine: 'mixamorigSpine',
  chest: 'mixamorigSpine1',
  upperChest: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  head: 'mixamorigHead',

  leftShoulder: 'mixamorigLeftShoulder',
  leftUpperArm: 'mixamorigLeftArm',
  leftLowerArm: 'mixamorigLeftForeArm',
  leftHand: 'mixamorigLeftHand',
  rightShoulder: 'mixamorigRightShoulder',
  rightUpperArm: 'mixamorigRightArm',
  rightLowerArm: 'mixamorigRightForeArm',
  rightHand: 'mixamorigRightHand',

  leftThumbMetacarpal: 'mixamorigLeftHandThumb1',
  leftThumbProximal: 'mixamorigLeftHandThumb2',
  leftThumbDistal: 'mixamorigLeftHandThumb3',
  leftIndexProximal: 'mixamorigLeftHandIndex1',
  leftIndexIntermediate: 'mixamorigLeftHandIndex2',
  leftIndexDistal: 'mixamorigLeftHandIndex3',
  leftMiddleProximal: 'mixamorigLeftHandMiddle1',
  leftMiddleIntermediate: 'mixamorigLeftHandMiddle2',
  leftMiddleDistal: 'mixamorigLeftHandMiddle3',
  leftRingProximal: 'mixamorigLeftHandRing1',
  leftRingIntermediate: 'mixamorigLeftHandRing2',
  leftRingDistal: 'mixamorigLeftHandRing3',
  leftLittleProximal: 'mixamorigLeftHandPinky1',
  leftLittleIntermediate: 'mixamorigLeftHandPinky2',
  leftLittleDistal: 'mixamorigLeftHandPinky3',

  rightThumbMetacarpal: 'mixamorigRightHandThumb1',
  rightThumbProximal: 'mixamorigRightHandThumb2',
  rightThumbDistal: 'mixamorigRightHandThumb3',
  rightIndexProximal: 'mixamorigRightHandIndex1',
  rightIndexIntermediate: 'mixamorigRightHandIndex2',
  rightIndexDistal: 'mixamorigRightHandIndex3',
  rightMiddleProximal: 'mixamorigRightHandMiddle1',
  rightMiddleIntermediate: 'mixamorigRightHandMiddle2',
  rightMiddleDistal: 'mixamorigRightHandMiddle3',
  rightRingProximal: 'mixamorigRightHandRing1',
  rightRingIntermediate: 'mixamorigRightHandRing2',
  rightRingDistal: 'mixamorigRightHandRing3',
  rightLittleProximal: 'mixamorigRightHandPinky1',
  rightLittleIntermediate: 'mixamorigRightHandPinky2',
  rightLittleDistal: 'mixamorigRightHandPinky3',

  leftUpperLeg: 'mixamorigLeftUpLeg',
  leftLowerLeg: 'mixamorigLeftLeg',
  leftFoot: 'mixamorigLeftFoot',
  leftToes: 'mixamorigLeftToeBase',
  rightUpperLeg: 'mixamorigRightUpLeg',
  rightLowerLeg: 'mixamorigRightLeg',
  rightFoot: 'mixamorigRightFoot',
  rightToes: 'mixamorigRightToeBase',
});

export const HUMANOID_ROLES = Object.freeze(Object.keys(MIXAMO_BONE_BY_ROLE));

// Source-side chain children for rest-pose direction corrections (Mixamo rigs
// are T-pose; targets are often A-pose). Keyed by Mixamo names because the
// correction compares source bone directions against target bone directions.
export const MIXAMO_CHAIN_CHILD = Object.freeze({
  mixamorigLeftShoulder: 'mixamorigLeftArm',
  mixamorigLeftArm: 'mixamorigLeftForeArm',
  mixamorigLeftForeArm: 'mixamorigLeftHand',
  mixamorigLeftHand: 'mixamorigLeftHandMiddle1',
  mixamorigRightShoulder: 'mixamorigRightArm',
  mixamorigRightArm: 'mixamorigRightForeArm',
  mixamorigRightForeArm: 'mixamorigRightHand',
  mixamorigRightHand: 'mixamorigRightHandMiddle1',
  mixamorigLeftUpLeg: 'mixamorigLeftLeg',
  mixamorigLeftLeg: 'mixamorigLeftFoot',
  mixamorigLeftFoot: 'mixamorigLeftToeBase',
  mixamorigRightUpLeg: 'mixamorigRightLeg',
  mixamorigRightLeg: 'mixamorigRightFoot',
  mixamorigRightFoot: 'mixamorigRightToeBase',
});

// MMD/PMX bone names per role. Multiple entries per role are all animated:
// many rigs (incl. many anime-game models) bind the leg skin weights to the "D"
// deform bones, which only follow the FK bones through MMD's grant system
// (needs MMDAnimationHelper) — animating both moves every variant. The LAST
// existing entry is the preferred one for chain/inverse lookups, matching the
// deform-bone preference the old hardcoded tables had.
const MMD_BONES_BY_ROLE = Object.freeze({
  hips: ['下半身'],
  spine: ['上半身'],
  chest: ['上半身3'],
  upperChest: ['上半身2'],
  neck: ['首'],
  head: ['頭'],

  leftShoulder: ['左肩'],
  leftUpperArm: ['左腕'],
  leftLowerArm: ['左ひじ'],
  leftHand: ['左手首'],
  rightShoulder: ['右肩'],
  rightUpperArm: ['右腕'],
  rightLowerArm: ['右ひじ'],
  rightHand: ['右手首'],

  leftThumbMetacarpal: ['左親指０'],
  leftThumbProximal: ['左親指１'],
  leftThumbDistal: ['左親指２'],
  leftIndexProximal: ['左人指１'],
  leftIndexIntermediate: ['左人指２'],
  leftIndexDistal: ['左人指３'],
  leftMiddleProximal: ['左中指１'],
  leftMiddleIntermediate: ['左中指２'],
  leftMiddleDistal: ['左中指３'],
  leftRingProximal: ['左薬指１'],
  leftRingIntermediate: ['左薬指２'],
  leftRingDistal: ['左薬指３'],
  leftLittleProximal: ['左小指１'],
  leftLittleIntermediate: ['左小指２'],
  leftLittleDistal: ['左小指３'],

  rightThumbMetacarpal: ['右親指０'],
  rightThumbProximal: ['右親指１'],
  rightThumbDistal: ['右親指２'],
  rightIndexProximal: ['右人指１'],
  rightIndexIntermediate: ['右人指２'],
  rightIndexDistal: ['右人指３'],
  rightMiddleProximal: ['右中指１'],
  rightMiddleIntermediate: ['右中指２'],
  rightMiddleDistal: ['右中指３'],
  rightRingProximal: ['右薬指１'],
  rightRingIntermediate: ['右薬指２'],
  rightRingDistal: ['右薬指３'],
  rightLittleProximal: ['右小指１'],
  rightLittleIntermediate: ['右小指２'],
  rightLittleDistal: ['右小指３'],

  leftUpperLeg: ['左足', '左足D'],
  leftLowerLeg: ['左ひざ', '左ひざD'],
  leftFoot: ['左足首', '左足首D'],
  leftToes: ['左つま先', '左足先EX'],
  rightUpperLeg: ['右足', '右足D'],
  rightLowerLeg: ['右ひざ', '右ひざD'],
  rightFoot: ['右足首', '右足首D'],
  rightToes: ['右つま先', '右足先EX'],
});

// Blender Rigify deform-bone names (the bundled mannequin and other
// Rigify-exported GLBs). GLTFLoader sanitizes node names on load (dots and
// other reserved characters are stripped: "DEF-upper_arm.L" arrives as
// "DEF-upper_armL"), so this table is matched loosely — see looseBoneName().
const RIGIFY_BONES_BY_ROLE = Object.freeze({
  hips: ['DEF-hips'],
  spine: ['DEF-spine.001'],
  chest: ['DEF-spine.002'],
  upperChest: ['DEF-spine.003'],
  neck: ['DEF-neck'],
  head: ['DEF-head'],

  leftShoulder: ['DEF-shoulder.L'],
  leftUpperArm: ['DEF-upper_arm.L'],
  leftLowerArm: ['DEF-forearm.L'],
  leftHand: ['DEF-hand.L'],
  rightShoulder: ['DEF-shoulder.R'],
  rightUpperArm: ['DEF-upper_arm.R'],
  rightLowerArm: ['DEF-forearm.R'],
  rightHand: ['DEF-hand.R'],

  leftThumbMetacarpal: ['DEF-thumb.01.L'],
  leftThumbProximal: ['DEF-thumb.02.L'],
  leftThumbDistal: ['DEF-thumb.03.L'],
  leftIndexProximal: ['DEF-f_index.01.L'],
  leftIndexIntermediate: ['DEF-f_index.02.L'],
  leftIndexDistal: ['DEF-f_index.03.L'],
  leftMiddleProximal: ['DEF-f_middle.01.L'],
  leftMiddleIntermediate: ['DEF-f_middle.02.L'],
  leftMiddleDistal: ['DEF-f_middle.03.L'],
  leftRingProximal: ['DEF-f_ring.01.L'],
  leftRingIntermediate: ['DEF-f_ring.02.L'],
  leftRingDistal: ['DEF-f_ring.03.L'],
  leftLittleProximal: ['DEF-f_pinky.01.L'],
  leftLittleIntermediate: ['DEF-f_pinky.02.L'],
  leftLittleDistal: ['DEF-f_pinky.03.L'],

  rightThumbMetacarpal: ['DEF-thumb.01.R'],
  rightThumbProximal: ['DEF-thumb.02.R'],
  rightThumbDistal: ['DEF-thumb.03.R'],
  rightIndexProximal: ['DEF-f_index.01.R'],
  rightIndexIntermediate: ['DEF-f_index.02.R'],
  rightIndexDistal: ['DEF-f_index.03.R'],
  rightMiddleProximal: ['DEF-f_middle.01.R'],
  rightMiddleIntermediate: ['DEF-f_middle.02.R'],
  rightMiddleDistal: ['DEF-f_middle.03.R'],
  rightRingProximal: ['DEF-f_ring.01.R'],
  rightRingIntermediate: ['DEF-f_ring.02.R'],
  rightRingDistal: ['DEF-f_ring.03.R'],
  rightLittleProximal: ['DEF-f_pinky.01.R'],
  rightLittleIntermediate: ['DEF-f_pinky.02.R'],
  rightLittleDistal: ['DEF-f_pinky.03.R'],

  leftUpperLeg: ['DEF-thigh.L'],
  leftLowerLeg: ['DEF-shin.L'],
  leftFoot: ['DEF-foot.L'],
  leftToes: ['DEF-toe.L'],
  rightUpperLeg: ['DEF-thigh.R'],
  rightLowerLeg: ['DEF-shin.R'],
  rightFoot: ['DEF-foot.R'],
  rightToes: ['DEF-toe.R'],
});

// MMD's translation carrier: hip sway/bob is baked onto センター so any stance
// stays balanced over the capsule. Non-MMD rigs carry it on the hips bone.
const MMD_CENTER_BONE = 'センター';

function looseBoneName(name) {
  return String(name || '').replace(/[^0-9A-Za-z_\-぀-ヿ一-鿿！-｠]/g, '');
}

export function normalizeMixamoBoneName(name) {
  return String(name || '')
    .replace(/^mixamorig:/, 'mixamorig')
    .replace(/:/g, '');
}

function buildRig(type, entries, { hipCarrierName = null } = {}) {
  // entries: [{ targetName, mixamoName }] in preference order per mixamo name
  // (later entries override earlier ones in the inverse map).
  const targetToMixamo = new Map();
  const mixamoToTarget = new Map();
  for (const { targetName, mixamoName } of entries) {
    if (!targetToMixamo.has(targetName)) targetToMixamo.set(targetName, mixamoName);
    mixamoToTarget.set(mixamoName, targetName);
  }
  if (targetToMixamo.size === 0) return null;

  return {
    type,
    targetToMixamo,
    mixamoToTarget,
    hipCarrierName: hipCarrierName || mixamoToTarget.get(MIXAMO_BONE_BY_ROLE.hips) || null,
  };
}

function resolveVrmRig(vrm) {
  const humanoid = vrm?.humanoid;
  if (!humanoid?.getRawBoneNode) return null;

  const entries = [];
  for (const [role, mixamoName] of Object.entries(MIXAMO_BONE_BY_ROLE)) {
    const node = humanoid.getRawBoneNode(role);
    if (node?.name) entries.push({ targetName: node.name, mixamoName });
  }

  return buildRig('vrm', entries);
}

function resolveMmdRig(boneNames) {
  const entries = [];
  for (const [role, targetNames] of Object.entries(MMD_BONES_BY_ROLE)) {
    const mixamoName = MIXAMO_BONE_BY_ROLE[role];
    for (const targetName of targetNames) {
      if (boneNames.has(targetName)) entries.push({ targetName, mixamoName });
    }
  }

  return buildRig('mmd', entries, {
    hipCarrierName: boneNames.has(MMD_CENTER_BONE) ? MMD_CENTER_BONE : null,
  });
}

function resolveRigifyRig(boneNames) {
  const actualByLooseName = new Map();
  for (const boneName of boneNames) actualByLooseName.set(looseBoneName(boneName), boneName);

  const entries = [];
  for (const [role, candidates] of Object.entries(RIGIFY_BONES_BY_ROLE)) {
    const mixamoName = MIXAMO_BONE_BY_ROLE[role];
    for (const candidate of candidates) {
      const targetName = actualByLooseName.get(looseBoneName(candidate));
      if (targetName) entries.push({ targetName, mixamoName });
    }
  }

  return buildRig('rigify', entries);
}

function resolveMixamoNamedRig(boneNames) {
  const mixamoNames = new Set(Object.values(MIXAMO_BONE_BY_ROLE));
  const entries = [];
  for (const boneName of boneNames) {
    const normalized = normalizeMixamoBoneName(boneName);
    if (mixamoNames.has(normalized)) entries.push({ targetName: boneName, mixamoName: normalized });
  }

  return buildRig('mixamo', entries);
}

// Resolves how a loaded character's bones map onto the canonical roles.
// Returns { type, targetToMixamo, mixamoToTarget, hipCarrierName } or null
// when no known convention matches (retargeting is impossible then).
export function resolveCharacterRig(targetMesh, { vrm = null } = {}) {
  if (vrm) {
    const rig = resolveVrmRig(vrm);
    if (rig) return rig;
  }

  const bones = targetMesh?.skeleton?.bones || [];
  const boneNames = new Set(bones.map((bone) => bone.name));
  if (boneNames.size === 0) return null;

  const mmdRig = boneNames.has('下半身') || boneNames.has(MMD_CENTER_BONE)
    ? resolveMmdRig(boneNames)
    : null;
  if (mmdRig) return mmdRig;

  return resolveMixamoNamedRig(boneNames) || resolveRigifyRig(boneNames);
}

// Preferred target bone name for a canonical role (the skin-weighted variant
// on rigs that split FK/deform bones), or null when the model lacks it.
export function targetBoneNameForRole(rig, role) {
  const mixamoName = MIXAMO_BONE_BY_ROLE[role];
  return (mixamoName && rig?.mixamoToTarget.get(mixamoName)) || null;
}

// Every target bone playing a canonical role — MMD leg roles return both the
// FK bone and its "D" deform twin, so procedural clips can drive all variants
// the way the retarget bake does.
export function targetBoneNamesForRole(rig, role) {
  const mixamoName = MIXAMO_BONE_BY_ROLE[role];
  if (!mixamoName || !rig) return [];

  const names = [];
  for (const [targetName, candidateMixamoName] of rig.targetToMixamo) {
    if (candidateMixamoName === mixamoName) names.push(targetName);
  }
  return names;
}
