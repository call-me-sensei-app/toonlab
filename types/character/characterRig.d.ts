export function normalizeMixamoBoneName(name: any): string;
export function resolveCharacterRig(targetMesh: any, { vrm }?: {
    vrm?: any;
}): {
    type: any;
    targetToMixamo: Map<any, any>;
    mixamoToTarget: Map<any, any>;
    hipCarrierName: any;
};
export function targetBoneNameForRole(rig: any, role: any): any;
export function targetBoneNamesForRole(rig: any, role: any): any[];
/**
 * The humanoid contract itself: role -> canonical Mixamo bone name. Exported so
 * a host can audit a rig against it (which roles resolved, which are missing)
 * rather than inferring the answer from a bone count.
 */
export const MIXAMO_BONE_BY_ROLE: Readonly<{
    hips: "mixamorigHips";
    spine: "mixamorigSpine";
    chest: "mixamorigSpine1";
    upperChest: "mixamorigSpine2";
    neck: "mixamorigNeck";
    head: "mixamorigHead";
    leftShoulder: "mixamorigLeftShoulder";
    leftUpperArm: "mixamorigLeftArm";
    leftLowerArm: "mixamorigLeftForeArm";
    leftHand: "mixamorigLeftHand";
    rightShoulder: "mixamorigRightShoulder";
    rightUpperArm: "mixamorigRightArm";
    rightLowerArm: "mixamorigRightForeArm";
    rightHand: "mixamorigRightHand";
    leftThumbMetacarpal: "mixamorigLeftHandThumb1";
    leftThumbProximal: "mixamorigLeftHandThumb2";
    leftThumbDistal: "mixamorigLeftHandThumb3";
    leftIndexProximal: "mixamorigLeftHandIndex1";
    leftIndexIntermediate: "mixamorigLeftHandIndex2";
    leftIndexDistal: "mixamorigLeftHandIndex3";
    leftMiddleProximal: "mixamorigLeftHandMiddle1";
    leftMiddleIntermediate: "mixamorigLeftHandMiddle2";
    leftMiddleDistal: "mixamorigLeftHandMiddle3";
    leftRingProximal: "mixamorigLeftHandRing1";
    leftRingIntermediate: "mixamorigLeftHandRing2";
    leftRingDistal: "mixamorigLeftHandRing3";
    leftLittleProximal: "mixamorigLeftHandPinky1";
    leftLittleIntermediate: "mixamorigLeftHandPinky2";
    leftLittleDistal: "mixamorigLeftHandPinky3";
    rightThumbMetacarpal: "mixamorigRightHandThumb1";
    rightThumbProximal: "mixamorigRightHandThumb2";
    rightThumbDistal: "mixamorigRightHandThumb3";
    rightIndexProximal: "mixamorigRightHandIndex1";
    rightIndexIntermediate: "mixamorigRightHandIndex2";
    rightIndexDistal: "mixamorigRightHandIndex3";
    rightMiddleProximal: "mixamorigRightHandMiddle1";
    rightMiddleIntermediate: "mixamorigRightHandMiddle2";
    rightMiddleDistal: "mixamorigRightHandMiddle3";
    rightRingProximal: "mixamorigRightHandRing1";
    rightRingIntermediate: "mixamorigRightHandRing2";
    rightRingDistal: "mixamorigRightHandRing3";
    rightLittleProximal: "mixamorigRightHandPinky1";
    rightLittleIntermediate: "mixamorigRightHandPinky2";
    rightLittleDistal: "mixamorigRightHandPinky3";
    leftUpperLeg: "mixamorigLeftUpLeg";
    leftLowerLeg: "mixamorigLeftLeg";
    leftFoot: "mixamorigLeftFoot";
    leftToes: "mixamorigLeftToeBase";
    rightUpperLeg: "mixamorigRightUpLeg";
    rightLowerLeg: "mixamorigRightLeg";
    rightFoot: "mixamorigRightFoot";
    rightToes: "mixamorigRightToeBase";
}>;
export const HUMANOID_ROLES: readonly string[];
export const MIXAMO_CHAIN_CHILD: Readonly<{
    mixamorigLeftShoulder: "mixamorigLeftArm";
    mixamorigLeftArm: "mixamorigLeftForeArm";
    mixamorigLeftForeArm: "mixamorigLeftHand";
    mixamorigLeftHand: "mixamorigLeftHandMiddle1";
    mixamorigRightShoulder: "mixamorigRightArm";
    mixamorigRightArm: "mixamorigRightForeArm";
    mixamorigRightForeArm: "mixamorigRightHand";
    mixamorigRightHand: "mixamorigRightHandMiddle1";
    mixamorigLeftUpLeg: "mixamorigLeftLeg";
    mixamorigLeftLeg: "mixamorigLeftFoot";
    mixamorigLeftFoot: "mixamorigLeftToeBase";
    mixamorigRightUpLeg: "mixamorigRightLeg";
    mixamorigRightLeg: "mixamorigRightFoot";
    mixamorigRightFoot: "mixamorigRightToeBase";
}>;
