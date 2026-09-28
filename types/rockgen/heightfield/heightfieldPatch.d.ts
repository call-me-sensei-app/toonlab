/**
 * Builds (or returns cached) an eroded patch for one heightfield piece.
 *
 * @param {number} seed Combined document+piece seed (uint32).
 * @param {object} hf The piece's `heightfield` settings group.
 * @returns {{ heights: Float32Array, masks: object, resolution: number,
 *   sample(u: number, v: number): number }} heights normalized to [0, 1].
 */
export function getHeightfieldPatch(seed: number, hf: object): {
    heights: Float32Array;
    masks: object;
    resolution: number;
    sample(u: number, v: number): number;
};
export const HEIGHTFIELD_PROFILES: readonly string[];
