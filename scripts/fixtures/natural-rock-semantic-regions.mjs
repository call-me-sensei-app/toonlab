// Authored test geometry: horizontal UV bands with three explicit material roles.
export function createSemanticRegionFixture(size = 1024, geometrySha256 = 'b'.repeat(64)) {
  const roles = [
    ['granite', 'clast-material-groups', 'coarse-granite-jointed'],
    ['sandstone', 'clast-material-groups', 'red-sandstone-bedded'],
    ['ground', 'matrix-or-ground', 'fault-scarp-regolith'],
  ];
  return {
    schema: 'toonlab/c8-semantic-surface-regions', version: 1,
    coordinateSpace: 'geometry-uv0', geometrySha256, width: size, height: size,
    regions: roles.map(([id, role, materialProfileId], index) => {
      const mask = new Uint8Array(size * size);
      const start = Math.ceil(index * size * size / roles.length);
      const end = Math.ceil((index + 1) * size * size / roles.length);
      mask.fill(255, start, end);
      return { id, role, materialProfileId, mask, geometryRegionId: `mesh-region:${id}`, sourceKind: 'authored-geometry-semantic-mask' };
    }),
  };
}
