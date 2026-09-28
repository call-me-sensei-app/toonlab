import { canonicalizeJson, contentId, deriveNamespacedSeed } from '../canonical.node.js';
import { hash01 } from '../structure/math.node.js';

export const FORMATION_PROGRAM_SCHEMA = 'toonlab/rock-formation-domain-program';
export const FORMATION_PROGRAM_VERSION = 1;

export const FORMATION_MODULE_ROLES = Object.freeze([
  'slab', 'wedge', 'ledge', 'crown', 'pillar', 'buttress', 'talus',
]);

function round(value, digits = 9) {
  return Number(value.toFixed(digits));
}

function moduleRole(index, seed, x, z) {
  if (index < FORMATION_MODULE_ROLES.length) return FORMATION_MODULE_ROLES[index];
  return FORMATION_MODULE_ROLES[Math.floor(hash01(seed, x, z, 0, 31) * FORMATION_MODULE_ROLES.length) % FORMATION_MODULE_ROLES.length];
}

function socket(axis, side, coordinate, span) {
  return {
    axis,
    coordinateMetres: round(coordinate),
    side,
    spanMetres: span.map((value) => round(value)),
  };
}

export function compileFormationProgram(fixture, structuralProgram, options = {}) {
  if (structuralProgram.recipeContentId !== contentId(fixture.recipe)) {
    throw new RangeError('Formation fixture and structural program must reference the same canonical recipe.');
  }
  const dimensions = fixture.recipe.targetDimensionsMetres;
  const [length, height, depth] = dimensions;
  const requestedChunkMetres = options.chunkMetres ?? 80;
  if (!(requestedChunkMetres >= 10 && requestedChunkMetres <= 200)) {
    throw new RangeError('C9 chunk size must remain inside the declared 10–200 metre module range.');
  }
  const countX = Math.max(1, Math.ceil(length / requestedChunkMetres));
  const countZ = Math.max(1, Math.ceil(depth / requestedChunkMetres));
  const moduleSizeX = length / countX;
  const moduleSizeZ = depth / countZ;
  if (Math.min(moduleSizeX, moduleSizeZ) < 10 || Math.max(moduleSizeX, moduleSizeZ) > 200) {
    throw new RangeError('Compiled C9 module span fell outside 10–200 metres.');
  }
  const overlapMetres = options.overlapMetres ?? Math.max(2, Math.min(moduleSizeX, moduleSizeZ) * 0.055);
  const origin = fixture.recipe.geologyTransform.originMetres;
  const formationBounds = {
    min: [origin[0] - length * 0.5, origin[1] - height * 0.42, origin[2] - depth * 0.5],
    max: [origin[0] + length * 0.5, origin[1] + height * 0.64, origin[2] + depth * 0.5],
  };
  const seed = deriveNamespacedSeed(fixture.recipe.seed, `${fixture.recipe.seedNamespaces.structure}/formation-c9`);
  const modules = [];
  for (let z = 0; z < countZ; z += 1) for (let x = 0; x < countX; x += 1) {
    const index = z * countX + x;
    const coreMinX = formationBounds.min[0] + x * moduleSizeX;
    const coreMaxX = formationBounds.min[0] + (x + 1) * moduleSizeX;
    const coreMinZ = formationBounds.min[2] + z * moduleSizeZ;
    const coreMaxZ = formationBounds.min[2] + (z + 1) * moduleSizeZ;
    const coreBounds = {
      min: [round(coreMinX), round(formationBounds.min[1]), round(coreMinZ)],
      max: [round(coreMaxX), round(formationBounds.max[1]), round(coreMaxZ)],
    };
    const cropBounds = {
      min: [round(coreMinX - overlapMetres), round(formationBounds.min[1] - overlapMetres), round(coreMinZ - overlapMetres)],
      max: [round(coreMaxX + overlapMetres), round(formationBounds.max[1] + overlapMetres), round(coreMaxZ + overlapMetres)],
    };
    const role = moduleRole(index, seed, x, z);
    const id = `${fixture.definition.id}/x${String(x).padStart(2, '0')}-z${String(z).padStart(2, '0')}`;
    modules.push({
      buriedBackMetres: round(overlapMetres),
      buriedBaseMetres: round(overlapMetres),
      coordinate: { lod: 0, x, z },
      coreBounds,
      cropBounds,
      id,
      index,
      neighbors: {
        east: x + 1 < countX ? `${fixture.definition.id}/x${String(x + 1).padStart(2, '0')}-z${String(z).padStart(2, '0')}` : null,
        north: z + 1 < countZ ? `${fixture.definition.id}/x${String(x).padStart(2, '0')}-z${String(z + 1).padStart(2, '0')}` : null,
        south: z > 0 ? `${fixture.definition.id}/x${String(x).padStart(2, '0')}-z${String(z - 1).padStart(2, '0')}` : null,
        west: x > 0 ? `${fixture.definition.id}/x${String(x - 1).padStart(2, '0')}-z${String(z).padStart(2, '0')}` : null,
      },
      overlapMetres: round(overlapMetres),
      role,
      sockets: [
        socket('x', 'west', coreMinX, [coreMinZ, coreMaxZ]),
        socket('x', 'east', coreMaxX, [coreMinZ, coreMaxZ]),
        socket('z', 'south', coreMinZ, [coreMinX, coreMaxX]),
        socket('z', 'north', coreMaxZ, [coreMinX, coreMaxX]),
      ],
      streamingKey: `formation/${fixture.definition.id}/0/${x}/${z}`,
    });
  }
  const talusLineage = modules.filter((module) => module.role === 'talus').map((module) => {
    const source = modules.find((candidate) => candidate.coordinate.x === module.coordinate.x
      && candidate.coordinate.z === Math.max(0, module.coordinate.z - 1)
      && candidate.role !== 'talus')
      ?? modules.find((candidate) => candidate.role !== 'talus');
    return {
      depositionModuleId: module.id,
      sourceFormationId: fixture.recipe.formationId,
      sourceLithology: fixture.recipe.lithology,
      sourceModuleId: source.id,
      transport: 'gravity-rockfall-and-slope-accumulation',
    };
  });
  const base = {
    schema: FORMATION_PROGRAM_SCHEMA,
    version: FORMATION_PROGRAM_VERSION,
    boundary: 'repository-only experimental formation compiler; not a shipping package API',
    fixtureId: fixture.definition.id,
    formationBounds,
    formationSeed: seed,
    globalMaterialCoordinates: 'world-space formation coordinates; never reset per module',
    grid: { countX, countZ, moduleSizeX: round(moduleSizeX), moduleSizeZ: round(moduleSizeZ) },
    moduleRangeMetres: [10, 200],
    modules,
    overlapMetres: round(overlapMetres),
    parentStructuralProgramContentId: structuralProgram.programContentId,
    profile: fixture.profile,
    recipeContentId: structuralProgram.recipeContentId,
    talusLineage,
  };
  return canonicalizeJson({ ...base, programContentId: contentId(base) });
}
