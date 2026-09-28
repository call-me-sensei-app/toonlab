// Procedural stylized weapons — the "extensive range of weapons" the VFX
// rides on. Each weapon is a small flat-shaded mesh group (grip at the
// group origin, blade/head along local +Y) plus the two things the VFX
// system needs from ANY weapon:
//   anchors  — trail ribbon base/tip points in weapon-local space
//   profile  — length + weight; weight scales move timing and hit power
//              (a dagger flicks, a hammer commits)
// External weapon models slot in the same way: wrap the mesh, give it
// anchors + a profile, and every move in moves/ works unchanged.

import * as THREE from 'three';

export const WEAPON_IDS = Object.freeze(['sword', 'greatsword', 'spear', 'dagger', 'hammer']);

const PALETTE = {
  blade: 0xc7d2e4,
  bladeDark: 0x9aa8bf,
  grip: 0x3d3630,
  guard: 0x8a7748,
  shaft: 0x6b5138,
};

function part(geometry, color) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  return mesh;
}

/** Tapered blade: a 4-sided cylinder reads as a stylized flat blade. */
function blade(length, width, thickness, color = PALETTE.blade) {
  const geometry = new THREE.CylinderGeometry(width * 0.18, width, length, 4, 1);
  geometry.scale(1, 1, thickness / width);
  geometry.translate(0, length / 2, 0);
  return part(geometry, color);
}

const BUILDERS = {
  sword({ length = 1.05 } = {}) {
    const root = new THREE.Group();
    const edge = blade(length, 0.085, 0.02);
    edge.position.y = 0.16;
    const guard = part(new THREE.BoxGeometry(0.26, 0.045, 0.06), PALETTE.guard);
    guard.position.y = 0.16;
    const grip = part(new THREE.CylinderGeometry(0.028, 0.032, 0.22, 8), PALETTE.grip);
    grip.position.y = 0.03;
    const pommel = part(new THREE.SphereGeometry(0.045, 8, 6), PALETTE.guard);
    pommel.position.y = -0.09;
    root.add(edge, guard, grip, pommel);
    return {
      anchors: { base: [0, 0.28, 0], tip: [0, 0.16 + length, 0] },
      profile: { label: 'Sword', length, weight: 1.0 },
      root,
    };
  },
  greatsword({ length = 1.5 } = {}) {
    const root = new THREE.Group();
    const edge = blade(length, 0.15, 0.03);
    edge.position.y = 0.2;
    const guard = part(new THREE.BoxGeometry(0.42, 0.06, 0.08), PALETTE.guard);
    guard.position.y = 0.2;
    const grip = part(new THREE.CylinderGeometry(0.034, 0.038, 0.34, 8), PALETTE.grip);
    grip.position.y = 0.01;
    root.add(edge, guard, grip);
    return {
      anchors: { base: [0, 0.42, 0], tip: [0, 0.2 + length, 0] },
      profile: { label: 'Greatsword', length, weight: 1.4 },
      root,
    };
  },
  spear({ length = 1.9 } = {}) {
    const root = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.024, 0.028, length, 8), PALETTE.shaft);
    shaft.position.y = length / 2 - 0.35;
    const head = blade(0.38, 0.075, 0.018);
    head.position.y = length - 0.35;
    const collar = part(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), PALETTE.guard);
    collar.position.y = length - 0.36;
    root.add(shaft, head, collar);
    return {
      // Spear trails ride the head, not the whole shaft.
      anchors: { base: [0, length - 0.5, 0], tip: [0, length + 0.03, 0] },
      profile: { label: 'Spear', length, weight: 1.1 },
      root,
    };
  },
  dagger({ length = 0.48 } = {}) {
    const root = new THREE.Group();
    const edge = blade(length, 0.06, 0.016);
    edge.position.y = 0.1;
    const guard = part(new THREE.BoxGeometry(0.14, 0.03, 0.045), PALETTE.guard);
    guard.position.y = 0.1;
    const grip = part(new THREE.CylinderGeometry(0.024, 0.028, 0.16, 8), PALETTE.grip);
    grip.position.y = 0;
    root.add(edge, guard, grip);
    return {
      anchors: { base: [0, 0.16, 0], tip: [0, 0.1 + length, 0] },
      profile: { label: 'Dagger', length, weight: 0.65 },
      root,
    };
  },
  hammer({ length = 1.0 } = {}) {
    const root = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.03, 0.035, length, 8), PALETTE.shaft);
    shaft.position.y = length / 2 - 0.15;
    const head = part(new THREE.BoxGeometry(0.42, 0.24, 0.24), PALETTE.bladeDark);
    head.position.y = length - 0.15;
    const band = part(new THREE.BoxGeometry(0.44, 0.06, 0.26), PALETTE.guard);
    band.position.y = length - 0.15;
    root.add(shaft, head, band);
    return {
      // Hammer trails hug the head so the arc reads as mass, not edge.
      anchors: { base: [0, length - 0.3, 0], tip: [0, length + 0.02, 0] },
      profile: { label: 'Hammer', length, weight: 1.6 },
      root,
    };
  },
};

/**
 * Builds a stylized weapon: `{ root, anchors, profile }`. Grip sits at the
 * group origin with the business end along +Y — the pose convention every
 * move in moves/moveLibrary.js is authored against.
 */
export function createStylizedWeapon({ type = 'sword', ...options } = {}) {
  const builder = BUILDERS[type] ?? BUILDERS.sword;
  const weapon = builder(options);
  weapon.root.name = `StylizedWeapon:${type}`;
  weapon.type = BUILDERS[type] ? type : 'sword';
  return weapon;
}

/** `{ id, label, weight }` list for pickers. */
export function getWeaponOptions() {
  return WEAPON_IDS.map((id) => {
    const { profile } = BUILDERS[id]();
    return { id, label: profile.label, weight: profile.weight };
  });
}
