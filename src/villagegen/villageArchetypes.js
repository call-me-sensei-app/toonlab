// POI archetypes as data, not code: each entry describes how a place picks
// its site, what it builds, and what dresses it. Hosts can register custom
// archetypes with `registerPoiArchetype` — villagegen only ever reads this
// table.

// siteScore(x, z, context) → 0..∞ (higher = better site; ≤ 0 rejects).
// context: { heightAt, waterLevel, slopeAt(x, z), shoreDistance(x, z) }.

const flatness = (slope) => Math.max(0, 1 - slope / 0.22);

export const POI_ARCHETYPES = {
  village: {
    buildings: [
      { type: 'cottage', weight: 0.62 },
      { type: 'farmhouse', weight: 0.18 },
      { type: 'shed', weight: 0.2 },
    ],
    id: 'village',
    label: 'Village',
    layout: {
      buildingCount: [9, 15],
      branchChance: 0.7,
      parcelSetback: [0.8, 2.2],
      streetStyle: 'dirt',
    },
    minRadius: 26,
    props: {
      benches: 2,
      crates: 3,
      fenceParcelChance: 0.45,
      firewood: 2,
      lanternSpacing: 16,
      well: true,
    },
    siteScore(x, z, { heightAt, waterLevel, slopeAt }) {
      const y = heightAt(x, z);
      if (y < waterLevel + 1) return 0;
      return flatness(slopeAt(x, z)) * (y < waterLevel + 14 ? 1.2 : 1);
    },
  },
  pierHamlet: {
    buildings: [
      { type: 'cottage', weight: 0.55 },
      { type: 'shed', weight: 0.45 },
    ],
    id: 'pierHamlet',
    label: 'Fishing hamlet',
    layout: {
      buildingCount: [4, 7],
      branchChance: 0.2,
      parcelSetback: [0.7, 1.6],
      streetStyle: 'planks',
    },
    minRadius: 18,
    props: {
      benches: 1,
      crates: 4,
      fenceParcelChance: 0.15,
      firewood: 1,
      lanternSpacing: 14,
      pier: true,
      well: false,
    },
    siteScore(x, z, { heightAt, waterLevel, slopeAt, shoreDistance }) {
      const y = heightAt(x, z);
      if (y < waterLevel + 0.8 || y > waterLevel + 7) return 0;
      const shore = shoreDistance(x, z);
      if (shore > 26) return 0; // hamlets live on the waterline
      return flatness(slopeAt(x, z)) * (1.6 - shore / 26);
    },
  },
  shrine: {
    buildings: [{ type: 'shrine', weight: 1 }],
    id: 'shrine',
    label: 'Shrine',
    layout: {
      buildingCount: [1, 1],
      branchChance: 0,
      parcelSetback: [0, 0],
      streetStyle: 'stone',
    },
    minRadius: 12,
    props: {
      approachLanterns: true,
      benches: 0,
      crates: 0,
      fenceParcelChance: 0,
      firewood: 0,
      lanternSpacing: 7,
      torii: true,
      well: false,
    },
    siteScore(x, z, { heightAt, waterLevel, slopeAt }) {
      const y = heightAt(x, z);
      if (y < waterLevel + 2) return 0;
      // hilltop bonus: shrines overlook
      return flatness(slopeAt(x, z)) * (0.6 + Math.min((y - waterLevel) / 45, 1.4));
    },
  },
  campsite: {
    buildings: [],
    id: 'campsite',
    label: 'Campsite',
    layout: {
      buildingCount: [0, 0],
      branchChance: 0,
      parcelSetback: [0, 0],
      streetStyle: 'dirt',
    },
    minRadius: 8,
    props: {
      benches: 1,
      campfire: true,
      crates: 1,
      fenceParcelChance: 0,
      firewood: 1,
      lanternSpacing: 0,
      well: false,
    },
    siteScore(x, z, { heightAt, waterLevel, slopeAt }) {
      const y = heightAt(x, z);
      if (y < waterLevel + 1) return 0;
      return flatness(slopeAt(x, z));
    },
  },
  ruin: {
    buildings: [],
    id: 'ruin',
    label: 'Ruin',
    layout: {
      buildingCount: [0, 0],
      branchChance: 0,
      parcelSetback: [0, 0],
      streetStyle: 'stone',
    },
    minRadius: 10,
    props: {
      benches: 0,
      brokenWalls: true,
      crates: 0,
      fenceParcelChance: 0,
      firewood: 0,
      lanternSpacing: 0,
      milestone: true,
      well: false,
    },
    siteScore(x, z, { heightAt, waterLevel, slopeAt }) {
      const y = heightAt(x, z);
      if (y < waterLevel + 1.5) return 0;
      return flatness(slopeAt(x, z)) * 0.9;
    },
  },
};

/** Hosts register custom archetypes; id collisions replace (deliberately). */
export function registerPoiArchetype(archetype) {
  if (!archetype?.id) throw new Error('registerPoiArchetype needs an { id }.');
  POI_ARCHETYPES[archetype.id] = archetype;
  return archetype;
}
