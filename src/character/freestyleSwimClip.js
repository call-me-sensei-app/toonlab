import * as THREE from 'three';
import { targetBoneNameForRole, targetBoneNamesForRole } from './characterRig.js';

// Procedurally generated freestyle (front crawl) swim clip — no FBX source.
// Motion is authored in the character's rest frame (standing): arms windmill
// in the sagittal plane with a catch-up glide (hands meet at full front
// extension), legs flutter-kick, the torso rolls around its long axis, and a
// prone pitch on the torso roots lays the whole body flat in the water. Each
// bone's offset is a world-space rotation delta accumulated down the
// hierarchy (D(bone) = D(parent) * offset(bone), world = D * restWorld), so
// the result is independent of the bones' local axes — the same world-space
// solve the Mixamo retargeter relies on. Which bone plays which humanoid role
// comes from the resolved `rig` (characterRig.js), so the clip bakes onto any
// supported skeleton (MMD, VRM, Rigify, Mixamo-named).
//
// The caller must put the skeleton in its bind pose before calling; the clip
// is baked against the bone world rotations found at call time.

const FPS = 30;
const STROKE_DURATION = 0.8;  // seconds per single arm stroke
const STROKES_PER_CLIP = 4;   // one breath per clip => breathe every 4th stroke
const DURATION = STROKE_DURATION * STROKES_PER_CLIP;

const PRONE_PITCH = 1.28;      // torso pitch to horizontal (slightly head-up)
const BODY_ROLL = 0.3;         // roll around the spine axis, synced to arms
const HANDS_MEET_BIAS = 0.06;  // extra convergence past the computed centerline
                               // angle so the hands visibly land at the center
const RECOVERY_OUT = 0.35;     // elbow swings wide during the over-air recovery
const ARM_GLIDE = 0.85;        // dwell at full front extension (catch-up feel)
const ELBOW_PULL_BEND = 0.45;  // elbow flex during the underwater pull
const ELBOW_RECOVERY_BEND = 1.35; // high-elbow flex keeps the hand low over water
const ENTRY_ELBOW_BEND = 0.15; // slight relaxed bend while extended out front
const PALM_DOWN_TWIST = Math.PI / 2; // forearm pronation: rigs whose bind palms
                                     // face the body need a quarter twist to
                                     // land them palm-down at the water entry
const FINGER_CURL = 0.28;  // gentle joint curl cups the hand into a paddle
const THUMB_CURL = 0.22;   // thumb tucks toward the palm edge
const KICK_BEATS = 3;          // flutter kicks per windmill (6-beat kick)
const KICK_SWING = 0.26;       // thigh swing amplitude
const KNEE_BEND = 0.5;         // knee whip on the downbeat
const ANKLE_POINT = 0.5;       // pointed toes
const HEAD_TUCK = 0.1;         // extra neck+head pitch: face looks straight down
const BREATH_TURN = 0.55;      // head roll to the side for the breath
const BREATH_LIFT = 0.35;      // face pitches out of the water while breathing
const BREATH_ROLL = 0.18;      // extra body roll supporting the breath
const CENTER_BOB = 0.02;       // vertical hip bob, in world meters

const SIDES = Object.freeze({
  right: Object.freeze({ key: 'right', mmd: '右', sign: -1 }),
  left: Object.freeze({ key: 'left', mmd: '左', sign: 1 }),
});

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const FINGER_JOINTS = ['Proximal', 'Intermediate', 'Distal'];
const THUMB_JOINTS = ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'];

function findBone(targetMesh, name) {
  if (!name) return null;
  return targetMesh.skeleton.bones.find((bone) => bone.name === name) || null;
}

function isDescendantOf(bone, ancestor) {
  for (let node = bone.parent; node; node = node.parent) {
    if (node === ancestor) return true;
  }
  return false;
}

export function createFreestyleSwimClip(targetMesh, rig, {
  clipName = 'FreestyleSwim',
  // 'skeleton' emits ".bones[name].prop" tracks for mixers rooted at the
  // skinned mesh (the retarget path); 'node' emits "name.prop" tracks for
  // mixers rooted at the model scene (the native-clip path).
  trackNameStyle = 'skeleton',
} = {}) {
  targetMesh.updateMatrixWorld(true);

  const roleBoneName = (role) => targetBoneNameForRole(rig, role);
  const roleBone = (role) => findBone(targetMesh, roleBoneName(role));
  const trackName = (boneName, property) => (trackNameStyle === 'node'
    ? `${boneName}.${property}`
    : `.bones[${boneName}].${property}`);

  // Character frame at rest: lateral axis from the shoulder line, up from the
  // world, forward completing the basis. The rig's bind pose faces the
  // opposite of the direction ecctrl drives it (the Mixamo world-baked clips
  // set that runtime convention), so the shoulder line is mirrored — without
  // the flip the swimmer travels feet-first on her back.
  const up = new THREE.Vector3(0, 1, 0);
  const leftArm = roleBone('leftUpperArm');
  const rightArm = roleBone('rightUpperArm');
  const right = new THREE.Vector3(1, 0, 0);
  if (leftArm && rightArm) {
    right.subVectors(
      leftArm.getWorldPosition(new THREE.Vector3()),
      rightArm.getWorldPosition(new THREE.Vector3()),
    );
    right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
  }
  const forward = new THREE.Vector3().crossVectors(up, right).normalize();

  const rotX = (angle) => new THREE.Quaternion().setFromAxisAngle(right, angle);
  const rotY = (angle) => new THREE.Quaternion().setFromAxisAngle(up, angle);
  const rotZ = (angle) => new THREE.Quaternion().setFromAxisAngle(forward, angle);
  const compose = (...quats) => quats.reduce((result, q) => result.multiply(q), new THREE.Quaternion());

  // Many binds are A-poses: the arms hang splayed outward, and a windmill
  // baked on top of that splay traces a wide cone (arms flap out sideways).
  // Align each upper arm to point straight down first so the stroke stays in
  // a plane, then steer that plane per phase (inward at entry, out on recovery).
  // The entry convergence is computed from the rig's own proportions: the hand
  // lands on the centerline when the arm angles in by atan(shoulder offset /
  // arm reach), so it adapts to anime-scale shoulders and arm lengths.
  const armGeometry = (side) => {
    const shoulder = roleBone(`${side.key}UpperArm`);
    const elbow = roleBone(`${side.key}LowerArm`);
    const wrist = roleBone(`${side.key}Hand`);
    const geometry = {
      align: new THREE.Quaternion(),
      inward: 0.3 + HANDS_MEET_BIAS,
      // Bind-frame forearm axis: the pronation twist rotates about it, and the
      // accumulated chain delta carries it to the current forearm direction at
      // every phase, so the twist always stays a twist about the forearm.
      forearmAxis: new THREE.Vector3(0, -1, 0),
      twistCarrier: wrist?.name ?? null,
    };
    if (!shoulder || !elbow) return geometry;
    const shoulderPos = shoulder.getWorldPosition(new THREE.Vector3());
    const elbowPos = elbow.getWorldPosition(new THREE.Vector3());
    const dir = elbowPos.clone().sub(shoulderPos);
    if (dir.lengthSq() < 1e-10) return geometry;
    geometry.align.setFromUnitVectors(dir.clone().normalize(), new THREE.Vector3(0, -1, 0));
    const upperLength = dir.length();
    // Hand adds roughly a third of a forearm to the reach.
    const forearmLength = wrist ? wrist.getWorldPosition(new THREE.Vector3()).distanceTo(elbowPos) : upperLength;
    const reach = upperLength + forearmLength * 1.35;
    const halfShoulderWidth = Math.abs(shoulderPos.dot(right)
      - (leftArm && rightArm
        ? leftArm.getWorldPosition(new THREE.Vector3()).add(rightArm.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5).dot(right)
        : shoulderPos.dot(right)));
    if (reach > 1e-6 && halfShoulderWidth > 1e-6) {
      geometry.inward = Math.atan2(halfShoulderWidth, reach) + HANDS_MEET_BIAS;
    }
    if (wrist) {
      const forearmDir = wrist.getWorldPosition(new THREE.Vector3()).sub(elbowPos);
      if (forearmDir.lengthSq() > 1e-10) geometry.forearmAxis.copy(forearmDir.normalize());
      // Standard MMD rigs put a dedicated twist bone (手捩) on the forearm with
      // gradient skin weights — palm rotation belongs there when it drives the
      // hand; otherwise twist the wrist bone directly.
      if (rig?.type === 'mmd') {
        const twistBone = findBone(targetMesh, `${side.mmd}手捩`);
        if (twistBone && isDescendantOf(wrist, twistBone)) geometry.twistCarrier = twistBone.name;
      }
    }
    return geometry;
  };

  // Bind-pose palm normal. MMD rigs bind in an A-pose with the palms facing
  // the body, so the palm normal is the horizontal medial direction — that
  // path is kept verbatim (tuned against the reference rig). Other rigs bind in
  // arbitrary conventions (Rigify/Mixamo T-poses palm-down), so the normal is
  // estimated from the hand's own geometry: fingers × knuckle line.
  const medialPalmNormal = (side) => {
    const wrist = roleBone(`${side.key}Hand`);
    const otherWrist = roleBone(`${side.key === 'right' ? 'left' : 'right'}Hand`);
    if (!wrist || !otherWrist) return null;
    const normal = otherWrist.getWorldPosition(new THREE.Vector3())
      .sub(wrist.getWorldPosition(new THREE.Vector3()));
    normal.y = 0;
    return normal.lengthSq() > 1e-10 ? normal.normalize() : null;
  };

  const geometricPalmNormal = (side) => {
    const wrist = roleBone(`${side.key}Hand`);
    const middle = roleBone(`${side.key}MiddleProximal`);
    const index = roleBone(`${side.key}IndexProximal`);
    const little = roleBone(`${side.key}LittleProximal`);
    if (!wrist || !middle || !index || !little) return null;
    const fingerDir = middle.getWorldPosition(new THREE.Vector3())
      .sub(wrist.getWorldPosition(new THREE.Vector3()));
    const knuckleLine = little.getWorldPosition(new THREE.Vector3())
      .sub(index.getWorldPosition(new THREE.Vector3()));
    // Right hand flat on a table, fingers away: index→little runs right,
    // fingers run forward, (index→little) × fingers points down = palm side.
    // The left hand mirrors.
    const normal = new THREE.Vector3().crossVectors(knuckleLine, fingerDir);
    if (normal.lengthSq() < 1e-10) return null;
    normal.normalize();
    if (side.key === 'left') normal.negate();
    return normal;
  };

  const palmNormalFor = (side) => (rig?.type === 'mmd'
    ? medialPalmNormal(side)
    : geometricPalmNormal(side) || medialPalmNormal(side));

  // Shape the hand into a swimmer's paddle: fingers pressed together (each
  // finger steered parallel to the middle finger within the palm plane) and
  // every joint curled gently toward the palm so the hand cups the water.
  // Static offsets — the shape holds through the whole stroke and the loop
  // stays seamless.
  const handFor = (side) => {
    const wrist = roleBone(`${side.key}Hand`);
    if (!wrist) return [];
    const palmNormal = palmNormalFor(side);
    if (!palmNormal) return [];

    const jointDir = (bone) => {
      const child = bone.children.find((node) => node.isBone);
      const pos = bone.getWorldPosition(new THREE.Vector3());
      return child
        ? child.getWorldPosition(new THREE.Vector3()).sub(pos)
        : pos.sub(bone.parent.getWorldPosition(new THREE.Vector3()));
    };
    const inPalmPlane = (dir) => {
      const projected = dir.clone().addScaledVector(palmNormal, -dir.dot(palmNormal));
      return projected.lengthSq() > 1e-10 ? projected.normalize() : null;
    };

    const middleBase = roleBone(`${side.key}MiddleProximal`);
    const middleDir = middleBase ? inPalmPlane(jointDir(middleBase)) : null;

    const specs = [];
    const addJoint = (bone, curl, adductTo) => {
      if (!bone) return;
      const dir = jointDir(bone);
      if (dir.lengthSq() < 1e-10) return;
      dir.normalize();
      // Rotating about dir × palmNormal moves the fingertip toward the palm.
      const curlAxis = dir.clone().cross(palmNormal);
      if (curlAxis.lengthSq() < 1e-10) return;
      const shape = new THREE.Quaternion().setFromAxisAngle(curlAxis.normalize(), curl);
      const flatDir = adductTo ? inPalmPlane(dir) : null;
      if (flatDir && adductTo) {
        shape.multiply(new THREE.Quaternion().setFromUnitVectors(flatDir, adductTo));
      }
      specs.push({ name: bone.name, offset: () => shape.clone() });
    };

    for (const finger of FINGERS) {
      for (const joint of FINGER_JOINTS) {
        addJoint(
          roleBone(`${side.key}${finger}${joint}`),
          FINGER_CURL,
          joint === 'Proximal' && finger !== 'Middle' ? middleDir : null,
        );
      }
    }
    // Tuck the thumb against the index finger: swing the thumb base to run
    // parallel with the index finger's bind direction, add the same base curl
    // the index gets so it hugs the curled finger, then curl the outer joints.
    const indexBase = roleBone(`${side.key}IndexProximal`);
    const indexDir = indexBase ? jointDir(indexBase) : null;
    let isThumbBase = true;
    for (const joint of THUMB_JOINTS) {
      const bone = roleBone(`${side.key}${joint}`);
      if (!bone) continue;
      if (isThumbBase && indexDir && indexDir.lengthSq() > 1e-10) {
        isThumbBase = false;
        const dir = jointDir(bone);
        if (dir.lengthSq() > 1e-10) {
          const shape = new THREE.Quaternion()
            .setFromUnitVectors(dir.normalize(), indexDir.clone().normalize());
          const curlAxis = indexDir.clone().normalize().cross(palmNormal);
          if (curlAxis.lengthSq() > 1e-10) {
            shape.premultiply(new THREE.Quaternion().setFromAxisAngle(curlAxis.normalize(), FINGER_CURL));
          }
          specs.push({ name: bone.name, offset: () => shape.clone() });
          continue;
        }
      }
      isThumbBase = false;
      addJoint(bone, THUMB_CURL, null);
    }
    return specs;
  };

  // armPhase 0 = hand entry (arm extended past the head). (0, PI) is the
  // underwater pull, (PI, 2*PI) the over-air recovery. The rest pose arm
  // hangs down, so the swing starts PI away from it. ARM_GLIDE slows the
  // swing near entry: with the arms half a cycle apart, both dwell extended
  // in front at the same time — the catch-up moment where the hands meet.
  const armSwing = (armPhase) => Math.PI + armPhase - ARM_GLIDE * Math.sin(armPhase);
  const elbowBend = (armPhase) => {
    const s = Math.sin(armPhase);
    const entry = Math.max(0, Math.cos(armPhase));
    // A touch of relaxed elbow while the arm is extended out front.
    return (s >= 0 ? ELBOW_PULL_BEND * s : -ELBOW_RECOVERY_BEND * s) + ENTRY_ELBOW_BEND * entry * entry;
  };
  // Lateral steering of the stroke plane: negative = toward the centerline.
  const armLateral = (armPhase, inward) => {
    const entry = Math.max(0, Math.cos(armPhase));
    const recovery = Math.max(0, -Math.sin(armPhase));
    return -inward * entry * entry + RECOVERY_OUT * recovery;
  };
  // One breath per clip, timed to the right arm's second recovery. Zero at
  // the clip boundaries so the loop stays seamless.
  const breathPulse = (phase) => {
    const s = Math.max(0, Math.sin(2 * phase - 3 * Math.PI));
    return s * s;
  };

  // The clip spans STROKES_PER_CLIP single-arm strokes: the windmill phase
  // runs twice as fast as the clip phase. One entry per animated bone;
  // offset(phase) returns the world-frame delta for the clip phase [0, 2*PI).
  const windmill = (phase) => 2 * phase;

  // Pronation: the palm should land flat on the water at entry and stay
  // facing backward through the pull — palming the water, not slicing it.
  // MMD keeps the tuned quarter turn (bind palms face the body); other rigs
  // compute the twist that maps their actual bind palm normal to straight
  // down at the entry pose, absorbing whatever the bind convention is (and
  // the twist ambiguity of the upper-arm align). Held constant so the loop
  // stays seamless.
  const pronationFor = (side, { align, inward, forearmAxis }) => {
    const fallback = new THREE.Quaternion().setFromAxisAngle(forearmAxis, side.sign * PALM_DOWN_TWIST);
    if (rig?.type === 'mmd') return fallback;
    const bindPalm = palmNormalFor(side);
    if (!bindPalm) return fallback;
    // Full world delta carrying the hand at entry (armPhase 0): the torso's
    // prone pitch and chest counter-pitch (their phase terms are zero at
    // entry), the arm swing/steer/align, and the entry elbow bend. Pull the
    // world-down target back into the bind frame the offsets compose in.
    const entryDelta = compose(
      rotX(PRONE_PITCH),
      rotX(-0.1),
      rotZ(side.sign * armLateral(0, inward)),
      rotX(armSwing(0)),
      align.clone(),
      rotX(elbowBend(0)),
    );
    const targetBind = new THREE.Vector3(0, -1, 0).applyQuaternion(entryDelta.clone().invert());
    const project = (v) => v.clone().addScaledVector(forearmAxis, -v.dot(forearmAxis));
    const from = project(bindPalm);
    const to = project(targetBind);
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return fallback;
    from.normalize();
    to.normalize();
    let angle = Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1));
    if (new THREE.Vector3().crossVectors(from, to).dot(forearmAxis) < 0) angle = -angle;
    return new THREE.Quaternion().setFromAxisAngle(forearmAxis, angle);
  };

  const armFor = (side, phaseShift) => {
    // Sign of the lateral steer. The steer rotates about the forward axis and
    // acts while the arm points up/forward (entry and recovery) — a Z-rotation
    // moves an up-pointing arm the opposite way from a hanging one, so the
    // right arm converges with a positive rotation, not a negative one.
    const { sign } = side;
    const geometry = armGeometry(side);
    const { align, inward, twistCarrier } = geometry;
    const arm = (p) => windmill(p) + phaseShift;
    const wristName = roleBoneName(`${side.key}Hand`);
    const palmDown = pronationFor(side, geometry);
    const wristFlap = (p) => rotX(0.15 * Math.sin(arm(p)));
    return [
      { name: roleBoneName(`${side.key}Shoulder`), offset: (p) => rotX(0.18 * Math.sin(arm(p))) },
      {
        name: roleBoneName(`${side.key}UpperArm`),
        offset: (p) => compose(rotZ(sign * armLateral(arm(p), inward)), rotX(armSwing(arm(p))), align.clone()),
      },
      { name: roleBoneName(`${side.key}LowerArm`), offset: (p) => rotX(elbowBend(arm(p))) },
      ...(twistCarrier === wristName
        ? [{ name: wristName, offset: (p) => compose(palmDown.clone(), wristFlap(p)) }]
        : [
          { name: twistCarrier, offset: () => palmDown.clone() },
          { name: wristName, offset: (p) => wristFlap(p) },
        ]),
    ];
  };

  // Roles that expand to several bones (MMD FK/D leg pairs) share a motion;
  // the D bones are siblings of the FK bones on standard rigs and both drive
  // skin weights depending on the model.
  const legFor = (side, phaseShift) => {
    const kick = (p) => windmill(p) * KICK_BEATS + phaseShift;
    const role = (suffix) => `${side.key}${suffix}`;
    const expand = (roleName, offset) => targetBoneNamesForRole(rig, roleName)
      .map((name) => ({ name, offset, role: roleName }));
    return [
      ...expand(role('UpperLeg'), (p) => rotX(KICK_SWING * Math.sin(kick(p)) + 0.06)),
      ...expand(role('LowerLeg'), (p) => rotX(KNEE_BEND * Math.max(0, Math.cos(kick(p))))),
      ...expand(role('Foot'), (p) => rotX(ANKLE_POINT + 0.1 * Math.sin(kick(p)))),
    ];
  };

  const specs = [
    { name: roleBoneName('hips'), offset: (p) => compose(rotX(PRONE_PITCH + 0.12), rotY(0.15 * Math.sin(windmill(p)))) },
    {
      name: roleBoneName('spine'),
      offset: (p) => compose(
        rotX(PRONE_PITCH),
        rotY(BODY_ROLL * Math.sin(windmill(p)) - BREATH_ROLL * breathPulse(p)),
      ),
    },
    { name: roleBoneName('upperChest'), offset: (p) => compose(rotX(-0.1), rotY(0.4 * BODY_ROLL * Math.sin(windmill(p)))) },
    { name: roleBoneName('chest'), offset: (p) => rotY(0.2 * BODY_ROLL * Math.sin(windmill(p))) },
    { name: roleBoneName('neck'), offset: (p) => rotX(HEAD_TUCK - 0.3 * BREATH_LIFT * breathPulse(p)) },
    {
      name: roleBoneName('head'),
      offset: (p) => compose(
        rotX(HEAD_TUCK - 0.7 * BREATH_LIFT * breathPulse(p)),
        rotY(-BREATH_TURN * breathPulse(p)),
      ),
    },
    ...armFor(SIDES.right, 0),
    ...armFor(SIDES.left, Math.PI),
    ...handFor(SIDES.right),
    ...handFor(SIDES.left),
    ...legFor(SIDES.right, 0),
    ...legFor(SIDES.left, Math.PI),
  ];

  const animated = [];
  const offsetsByBone = new Map();
  for (const spec of specs) {
    const bone = findBone(targetMesh, spec.name);
    if (!bone || offsetsByBone.has(bone)) continue;
    animated.push({
      bone,
      role: spec.role ?? null,
      offset: spec.offset,
      restWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
      parentRestWorldQuat: bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion(),
    });
    offsetsByBone.set(bone, spec.offset);
  }

  // Guard against non-standard rigs where one of a role's bones is a child of
  // another (e.g. an MMD D bone under its FK counterpart) — the inherited
  // delta already carries the motion there.
  for (let i = animated.length - 1; i >= 0; i -= 1) {
    const { bone, role } = animated[i];
    if (!role) continue;
    const roleAncestor = animated.find((other) => other !== animated[i]
      && other.role === role
      && isDescendantOf(bone, other.bone));
    if (roleAncestor) {
      offsetsByBone.delete(bone);
      animated.splice(i, 1);
    }
  }

  if (animated.length === 0) {
    throw new Error('Freestyle swim clip: no animatable humanoid bones were found.');
  }

  // The specs author world-space intents per branch assuming the MMD layout,
  // where hips (下半身) and spine (上半身) are SIBLINGS under センター. Standard
  // humanoid rigs (Rigify/VRM/Mixamo) parent the spine under the hips, so the
  // accumulated delta would stack the hips' prone pitch on top of the spine's
  // own — folding the body in half and driving the head underwater. Rebase
  // the spine offset by the inverse of the hips offset so its accumulated
  // world delta matches the authored intent on either hierarchy.
  const hipsEntry = animated.find((node) => node.bone.name === roleBoneName('hips'));
  const spineEntry = animated.find((node) => node.bone.name === roleBoneName('spine'));
  if (hipsEntry && spineEntry && isDescendantOf(spineEntry.bone, hipsEntry.bone)) {
    const hipsOffset = hipsEntry.offset;
    const spineOffset = spineEntry.offset;
    const rebasedOffset = (p) => hipsOffset(p).invert().multiply(spineOffset(p));
    spineEntry.offset = rebasedOffset;
    offsetsByBone.set(spineEntry.bone, rebasedOffset);
  }

  const frameCount = Math.round(FPS * DURATION) + 1;
  const times = new Float32Array(frameCount);
  for (const node of animated) node.values = new Float32Array(frameCount * 4);

  const centerBone = findBone(targetMesh, rig?.hipCarrierName);
  const centerState = centerBone ? {
    values: new Float32Array(frameCount * 3),
    restLocalPos: centerBone.position.clone(),
    parentWorldQuatInverse: centerBone.parent
      ? centerBone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      : new THREE.Quaternion(),
    parentWorldScale: centerBone.parent
      ? centerBone.parent.getWorldScale(new THREE.Vector3())
      : new THREE.Vector3(1, 1, 1),
  } : null;

  const identity = new THREE.Quaternion();
  const deltaCache = new Map();
  const getDelta = (node) => {
    if (!node || node === targetMesh || !node.isBone) return identity;
    let delta = deltaCache.get(node);
    if (!delta) {
      delta = getDelta(node.parent).clone();
      const offset = offsetsByBone.get(node);
      if (offset) delta.multiply(offset.__current);
      deltaCache.set(node, delta);
    }
    return delta;
  };

  const worldQuat = new THREE.Quaternion();
  const parentWorldQuat = new THREE.Quaternion();
  const bobVector = new THREE.Vector3();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const phase = (2 * Math.PI * frame) / (frameCount - 1);
    times[frame] = frame / FPS;

    deltaCache.clear();
    for (const node of animated) node.offset.__current = node.offset(phase);

    for (const node of animated) {
      const parentDelta = getDelta(node.bone.parent);
      worldQuat.copy(parentDelta).multiply(node.offset.__current).multiply(node.restWorldQuat);
      parentWorldQuat.copy(parentDelta).multiply(node.parentRestWorldQuat);
      parentWorldQuat.invert().multiply(worldQuat).normalize();
      parentWorldQuat.toArray(node.values, frame * 4);
    }

    if (centerState) {
      bobVector.set(0, CENTER_BOB * Math.sin(2 * windmill(phase) - 0.5), 0)
        .applyQuaternion(centerState.parentWorldQuatInverse)
        .divide(centerState.parentWorldScale)
        .add(centerState.restLocalPos);
      bobVector.toArray(centerState.values, frame * 3);
    }
  }

  const tracks = animated.map((node) => new THREE.QuaternionKeyframeTrack(
    trackName(node.bone.name, 'quaternion'),
    times.slice(),
    node.values,
  ));
  if (centerState) {
    tracks.push(new THREE.VectorKeyframeTrack(
      trackName(centerBone.name, 'position'),
      times.slice(),
      centerState.values,
    ));
  }

  return new THREE.AnimationClip(clipName, DURATION, tracks);
}
