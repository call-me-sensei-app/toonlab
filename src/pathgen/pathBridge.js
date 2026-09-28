// Parametric plank bridges for water crossings. Generated like a debrisgen
// piece: deterministic, vertex-colored wood, one merged geometry per bridge
// (a single draw call each), rails registered as collision circles so a
// character crosses the deck and never strolls off the side.

import * as THREE from 'three';

import { hashCombine } from '../rockgen/noise/prng.js';
import { valueNoise3 } from '../rockgen/noise/valueNoise3.js';
import { mergePathGeometries } from './pathRibbon.js';

const WOOD = Object.freeze({
  dark: Object.freeze([0.3, 0.2, 0.12]),
  base: Object.freeze([0.44, 0.3, 0.18]),
  light: Object.freeze([0.56, 0.4, 0.24]),
});

function paintBox(geometry, rgb, shade) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = Math.min(rgb[0] * shade, 1);
    colors[index * 3 + 1] = Math.min(rgb[1] * shade, 1);
    colors[index * 3 + 2] = Math.min(rgb[2] * shade, 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Builds one bridge over a crossing (bank sample to bank sample).
 *
 * @param {Object} options
 * @param {Array} options.samples Route samples (from buildRouteProfile).
 * @param {{startIndex: number, endIndex: number, span: number}} options.crossing
 * @param {Object} options.settings Path settings (bridge group used).
 * @param {Function} [options.heightAt] Bed sampler for pier depth.
 * @param {number} [options.waterLevel]
 * @param {number} [options.seed]
 * @returns {{ geometry: THREE.BufferGeometry, blockers: Array<{x,z,radius}>,
 *   deckWidth: number, span: number }}
 */
export function buildBridge({
  samples,
  crossing,
  settings,
  heightAt = null,
  waterLevel = 0,
  seed = 1,
}) {
  const { bridge } = settings;
  const deck = samples.slice(crossing.startIndex, crossing.endIndex + 1);
  const span = crossing.span;
  const halfWidth = deck[0].half + 0.12;
  const random = (value, salt = 0) => valueNoise3(hashCombine(seed, 419 + salt), value * 5.13, 0.3, 0.7);

  const geometries = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const euler = new THREE.Euler();

  // Deck position/heading at arclength t along the crossing.
  const atLength = (target) => {
    let index = 0;
    while (index < deck.length - 2 && deck[index + 1].s - deck[0].s < target) index += 1;
    const a = deck[index];
    const b = deck[Math.min(index + 1, deck.length - 1)];
    const t = (target - (a.s - deck[0].s)) / Math.max(b.s - a.s, 1e-6);
    const clamped = Math.min(Math.max(t, 0), 1);
    return {
      heading: Math.atan2(b.x - a.x, b.z - a.z),
      pitch: Math.atan2(b.profile - a.profile, Math.max(b.s - a.s, 1e-6)),
      sideX: a.sideX + (b.sideX - a.sideX) * clamped,
      sideZ: a.sideZ + (b.sideZ - a.sideZ) * clamped,
      x: a.x + (b.x - a.x) * clamped,
      y: a.profile + (b.profile - a.profile) * clamped,
      z: a.z + (b.z - a.z) * clamped,
    };
  };

  const addBox = (rgb, shade, px, py, pz, sx, sy, sz, yaw, pitch = 0) => {
    const geometry = unitBox.clone();
    euler.set(pitch, yaw, 0, 'YXZ');
    quaternion.setFromEuler(euler);
    position.set(px, py, pz);
    scale.set(sx, sy, sz);
    matrix.compose(position, quaternion, scale);
    geometry.applyMatrix4(matrix);
    paintBox(geometry, rgb, shade);
    geometries.push(geometry);
  };

  // Planks across the walking direction, following the arc.
  const plankPitchGap = 0.42;
  const plankCount = Math.max(Math.round(span / plankPitchGap), 3);
  for (let index = 0; index < plankCount; index += 1) {
    const along = (index + 0.5) * (span / plankCount);
    const at = atLength(along);
    addBox(
      WOOD.base, 0.9 + random(index) * 0.18,
      at.x, at.y + 0.045, at.z,
      halfWidth * 2, 0.09, span / plankCount * 0.82,
      at.heading, -at.pitch,
    );
  }

  // Two stringer beams under the planks, segment per deck sample pair.
  for (let index = 0; index < deck.length - 1; index += 1) {
    const a = deck[index];
    const b = deck[index + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z, b.profile - a.profile);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const pitch = Math.atan2(b.profile - a.profile, Math.hypot(b.x - a.x, b.z - a.z));
    for (const side of [-1, 1]) {
      const offset = halfWidth * 0.56 * side;
      addBox(
        WOOD.dark, 0.9,
        (a.x + b.x) / 2 + a.sideX * offset,
        (a.profile + b.profile) / 2 - 0.09,
        (a.z + b.z) / 2 + a.sideZ * offset,
        0.14, 0.16, length + 0.05,
        heading, -pitch,
      );
    }
  }

  // Rails: posts + top rail (and a mid beam for the 'beams' style).
  const blockers = [];
  if (bridge.railStyle !== 'none') {
    const postCount = Math.max(Math.round(span / bridge.postSpacing), 2);
    const railHeight = 0.98;
    for (const side of [-1, 1]) {
      const posts = [];
      for (let index = 0; index <= postCount; index += 1) {
        const along = index * (span / postCount);
        const at = atLength(along);
        const px = at.x + at.sideX * (halfWidth - 0.05) * side;
        const pz = at.z + at.sideZ * (halfWidth - 0.05) * side;
        addBox(
          WOOD.dark, 0.86 + random(index, side + 2) * 0.14,
          px, at.y + railHeight / 2, pz,
          0.11, railHeight, 0.11,
          at.heading,
        );
        posts.push({ x: px, y: at.y, z: pz });
      }
      for (let index = 0; index < posts.length - 1; index += 1) {
        const a = posts[index];
        const b = posts[index + 1];
        const length = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
        const heading = Math.atan2(b.x - a.x, b.z - a.z);
        const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
        addBox(
          WOOD.light, 0.95,
          (a.x + b.x) / 2, (a.y + b.y) / 2 + railHeight - 0.06, (a.z + b.z) / 2,
          0.09, 0.09, length + 0.06,
          heading, -pitch,
        );
        if (bridge.railStyle === 'beams') {
          addBox(
            WOOD.base, 0.92,
            (a.x + b.x) / 2, (a.y + b.y) / 2 + railHeight * 0.5, (a.z + b.z) / 2,
            0.07, 0.07, length + 0.06,
            heading, -pitch,
          );
        }
      }
      // Collision: a fence of circles along the rail line keeps the
      // character on the deck without blocking the deck itself.
      const blockerSpacing = 0.7;
      const blockerCount = Math.max(Math.round(span / blockerSpacing), 2);
      for (let index = 0; index <= blockerCount; index += 1) {
        const at = atLength(index * (span / blockerCount));
        blockers.push({
          radius: 0.3,
          x: at.x + at.sideX * (halfWidth + 0.18) * side,
          z: at.z + at.sideZ * (halfWidth + 0.18) * side,
        });
      }
    }
  }

  // Abutments: a grounded block under each deck end, so the first planks
  // never hover over the bank.
  for (const endIndex of [0, deck.length - 1]) {
    const at = deck[endIndex];
    const bankY = typeof heightAt === 'function'
      ? Number(heightAt(at.x, at.z)) || at.profile
      : at.profile;
    const top = at.profile + 0.02;
    const bottom = Math.min(bankY, top) - 0.55;
    addBox(
      WOOD.dark, 0.85,
      at.x, (top + bottom) / 2, at.z,
      halfWidth * 2 - 0.06, top - bottom, 1.15,
      Math.atan2(
        deck[Math.min(endIndex + 1, deck.length - 1)].x - deck[Math.max(endIndex - 1, 0)].x,
        deck[Math.min(endIndex + 1, deck.length - 1)].z - deck[Math.max(endIndex - 1, 0)].z,
      ),
    );
  }

  // Piers on long crossings: post pairs down to the bed.
  if (span > bridge.pierSpacing * 1.4) {
    const pierCount = Math.floor(span / bridge.pierSpacing);
    const bed = typeof heightAt === 'function' ? heightAt : () => waterLevel - 2;
    for (let index = 1; index <= pierCount; index += 1) {
      const along = index * (span / (pierCount + 1));
      const at = atLength(along);
      for (const side of [-1, 1]) {
        const px = at.x + at.sideX * halfWidth * 0.56 * side;
        const pz = at.z + at.sideZ * halfWidth * 0.56 * side;
        const bedY = Math.min(Number(bed(px, pz)) || waterLevel - 2, waterLevel - 0.2);
        const top = at.y - 0.12;
        addBox(
          WOOD.dark, 0.82 + random(index, side + 7) * 0.1,
          px, (top + bedY - 0.5) / 2, pz,
          0.16, top - bedY + 0.5, 0.16,
          at.heading,
        );
      }
    }
  }

  unitBox.dispose();
  const geometry = mergePathGeometries(geometries);
  for (const piece of geometries) piece.dispose();
  return { blockers, deckWidth: halfWidth * 2, geometry, span };
}
