// Repository-only C8 first-100 surface routing.
//
// Every subtype is bound explicitly to the lithology admitted by its retained
// nature/source record. Morphology names and family membership never infer a
// material. The accepted first-12 binding objects are reused byte-for-byte.

import fs from 'node:fs';
import path from 'node:path';

import {
  C8_FIRST12_ASSET_SURFACE_BINDINGS,
  C8_FIRST12_LITHOLOGY_PROFILES,
  C8_FIRST12_MAP_ROLES,
  createC8First12GeologyMapData,
  createC8First12SurfaceSpecification,
  resolveC8First12Projection,
} from './c8First12Surface.node.js';

const taxonomyPath = path.resolve(import.meta.dirname, '..', 'morphology-taxonomy.v1.json');
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
const subtypeById = new Map(taxonomy.subtypes.map((subtype) => [subtype.id, subtype]));

export const C8_FIRST100_SURFACE_SCHEMA = 'toonlab/c8-first100-geology-surface';
export const C8_FIRST100_SURFACE_VERSION = 3;
export const C8_FIRST100_MAP_ROLES = C8_FIRST12_MAP_ROLES;
export const C8_FIRST100_ASSET_IDS = Object.freeze(taxonomy.subtypes.map(({ id }) => id));
export const C8_FIRST100_ROUTING_AUTHORITY = 'explicit-admitted-evidence-binding-v1';

/** Exact audit-approved asset-to-profile table in canonical taxonomy order. */
export const C8_FIRST100_EXPLICIT_PROFILE_BINDINGS = Object.freeze({
  'pebble-rounded': 'mixed-clast-abraded',
  'pebble-discoid': 'mixed-clast-abraded',
  'cobble-rounded': 'mixed-clast-abraded',
  'cobble-discoid': 'mixed-clast-abraded',
  'boulder-rounded': 'weathered-monzogranite',
  'boulder-subrounded': 'weathered-monzogranite',
  'boulder-angular': 'phonolite-porphyry-cooling',
  'boulder-tabular': 'neutral-structural-clast',
  'boulder-river-worn': 'river-abraded-sandstone',
  'slab-bedded': 'red-sandstone-bedded',
  'slab-cleavage': 'schist-phyllite-cleavage',
  'block-jointed': 'coarse-granite-jointed',
  'block-fractured': 'phonolite-porphyry-cooling',
  'shard-platy': 'fissile-shale',
  'shard-splintery': 'glassy-volcanic-vitrophyre',
  'erratic-glacial': 'mixed-clast-glacial',
  'corestone-spheroidal': 'weathered-monzogranite',
  'outcrop-massive': 'coarse-granite-jointed',
  'outcrop-jointed': 'coarse-granite-jointed',
  'outcrop-bedded': 'red-sandstone-bedded',
  'outcrop-foliated': 'gneiss-foliated',
  'outcrop-clastic': 'conglomerate-clastic',
  'outcrop-pillow': 'basalt-mafic-cooling',
  'tor-block-pile': 'coarse-granite-jointed',
  'tor-castellated': 'coarse-granite-jointed',
  'tor-freestanding': 'coarse-granite-jointed',
  'monolith-massive': 'coarse-granite-jointed',
  'monolith-jointed': 'phonolite-porphyry-cooling',
  'dome-exfoliation': 'weathered-monzogranite',
  'fin-sandstone': 'red-sandstone-bedded',
  'blade-narrow': 'quartzite-jointed',
  'spire-rock-needle': 'quartz-sandstone-pillar',
  'volcanic-spine': 'viscous-lava-spine',
  'pinnacle-residual': 'volcanic-breccia',
  'pillar-residual': 'quartz-sandstone-pillar',
  'karst-spire-singular': 'kaibab-limestone-ledge',
  'karst-tower-tiered': 'kaibab-limestone-ledge',
  'hoodoo-caprock': 'claron-carbonate-bedded',
  'hoodoo-tapered': 'volcaniclastic-tuff',
  'pavement-jointed': 'grey-siltstone-jointed',
  'pavement-karst': 'kaibab-limestone-ledge',
  'mound-massive': 'weathered-monzogranite',
  'mound-depositional': 'travertine-tufa-accretionary',
  'terrace-rock': 'neutral-sedimentary-bedded',
  'terrace-travertine': 'travertine-tufa-accretionary',
  'ledge-resistant': 'kaibab-limestone-ledge',
  'bench-erosional': 'neutral-sedimentary-bedded',
  'wall-broad': 'coarse-granite-jointed',
  'cliff-massive': 'kaibab-limestone-ledge',
  'cliff-jointed': 'coarse-granite-jointed',
  'cliff-bedded': 'red-sandstone-bedded',
  'cliff-foliated': 'gneiss-foliated',
  'cliff-columnar': 'basalt-mafic-cooling',
  'sea-cliff-massive': 'neutral-coastal-bedrock',
  'sea-cliff-bedded': 'coastal-sandstone-stack',
  'overhang-supported': 'red-sandstone-bedded',
  'canyon-wall': 'neutral-sedimentary-bedded',
  'gorge-paired': 'gneiss-foliated',
  'escarpment-continuous': 'neutral-sedimentary-bedded',
  'fault-scarp': 'fault-scarp-regolith',
  'slope-bedrock': 'coarse-granite-jointed',
  'cliff-module-straight': 'coarse-granite-jointed',
  'cliff-module-corner': 'red-sandstone-bedded',
  'cliff-module-termination': 'coastal-sandstone-stack',
  'cave-mouth-karst': 'kaibab-limestone-ledge',
  'cave-mouth-volcanic': 'basalt-mafic-cooling',
  'sea-cave': 'basalt-mafic-cooling',
  'arch-sandstone': 'red-sandstone-bedded',
  'arch-sea': 'basalt-mafic-cooling',
  'natural-bridge': 'red-sandstone-bedded',
  'sea-stack': 'coastal-sandstone-stack',
  'sea-stump': 'neutral-coastal-bedrock',
  'mesa-tabular': 'red-sandstone-bedded',
  'butte-tabular': 'red-sandstone-bedded',
  'badlands-dissected': 'soft-bedded-mudstone',
  'dyke-wall': 'diabase-intrusion-host-contact',
  'sill-sheet': 'diabase-intrusion-host-contact',
  'vein-rib': 'quartz-vein-phyllite-contact',
  'volcanic-neck': 'phonolite-porphyry-cooling',
  'lava-dome-blocky': 'silicic-lava-blocky',
  'lava-dome-flow-banded': 'silicic-lava-flow-banded',
  'column-colonnade': 'basalt-mafic-cooling',
  'column-entablature': 'basalt-mafic-cooling',
  'column-tiered-flow': 'basalt-mafic-cooling',
  'column-radial': 'basalt-mafic-cooling',
  'ridge-massive': 'neutral-massive-bedrock',
  'ridge-stratified': 'red-sandstone-bedded',
  'ridge-folded': 'neutral-sedimentary-bedded',
  'ridge-shattered-alpine': 'neutral-massive-bedrock',
  'massif-exfoliation': 'coarse-granite-jointed',
  'massif-volcanic': 'phonolite-porphyry-cooling',
  'karst-tower-field': 'kaibab-limestone-ledge',
  'mountain-modular-bedrock': 'coarse-granite-jointed',
  'field-boulder': 'mixed-clast-angular',
  'fan-talus': 'mixed-clast-angular',
  'sheet-scree': 'mixed-clast-angular',
  'deposit-rockfall': 'mixed-clast-angular',
  'moraine-bouldery': 'mixed-clast-glacial',
  'bar-river': 'mixed-clast-abraded',
  'ridge-beach': 'mixed-clast-abraded',
});

const PROFILE_RATIONALES = Object.freeze({
  'basalt-mafic-cooling': 'Fine dark mafic fabric and cooling joints are admitted; pillows, caves, arches, and column geometry remain mesh-owned.',
  'claron-carbonate-bedded': 'Iron-stained carbonate beds and differential resistance support the admitted caprock hoodoo.',
  'coarse-granite-jointed': 'Coarse crystalline variation and finite persistent joints support the admitted massive or jointed granite bedrock.',
  'coastal-sandstone-stack': 'Salt-weathered sandstone beds and joints support the admitted coastal sedimentary remnants.',
  'conglomerate-clastic': 'Rounded to subrounded clasts in a finer matrix support the admitted conglomeratic outcrop.',
  'diabase-intrusion-host-contact': 'The admitted dark intrusion and distinct host/contact must be separate semantic regions; one homogeneous material is geologically false.',
  'fault-scarp-regolith': 'Only neutral weathered bedrock, regolith, and damage-zone fracture are admitted; no host lithology is inferred.',
  'fissile-shale': 'Fine dark laminae and fissility support the admitted platy shale fracture fabric.',
  'glassy-volcanic-vitrophyre': 'Dark glass-rich volcanic fabric and conchoidal fracture support the admitted splintery vitrophyre.',
  'gneiss-foliated': 'Compositionally banded crystalline foliation and cross-joints support the admitted gneissic fabric.',
  'grey-siltstone-jointed': 'Fine neutral-grey clastic texture and persistent joints support the admitted pavement without inventing carbonate karst.',
  'kaibab-limestone-ledge': 'Pale carbonate texture, finite joints, and restrained bedding support the admitted limestone forms.',
  'mixed-clast-abraded': 'The admitted transported assembly contains multiple clast lithologies and a distinct substrate; semantic regions are mandatory.',
  'mixed-clast-angular': 'The admitted talus or rockfall assembly contains multiple angular clasts and a distinct substrate; semantic regions are mandatory.',
  'mixed-clast-glacial': 'The admitted glacial assembly contains mixed erratics, matrix, and face histories; semantic regions are mandatory.',
  'neutral-coastal-bedrock': 'Wave and salt weathering are admitted while the source does not justify a named parent lithology or sandstone bands.',
  'neutral-massive-bedrock': 'Massive neutral bedrock and sparse joints are admitted; bedding, foliation, and volcanic banding remain forbidden inferences.',
  'neutral-sedimentary-bedded': 'Coherent sedimentary bedding is admitted, but the evidence does not justify naming sandstone, carbonate, or mudstone.',
  'neutral-structural-clast': 'Planar structural control is admitted while parent lithology and specific fabric remain unresolved.',
  'phonolite-porphyry-cooling': 'Dark porphyritic fabric and cooling joints support the admitted phonolitic and related source rocks.',
  'quartz-sandstone-pillar': 'Iron-stained quartz-sandstone beds and joints support the admitted residual pillar or needle.',
  'quartz-vein-phyllite-contact': 'The admitted quartz vein, phyllitic host, and contact must be separate semantic regions; a painted homogeneous rib is forbidden.',
  'quartzite-jointed': 'Hard pale quartzose fabric and sparse joints support the admitted narrow quartzite blade.',
  'red-sandstone-bedded': 'Non-periodic iron-rich beds and finite cross-joints support the admitted sandstone forms.',
  'river-abraded-sandstone': 'Subdued sandstone bedding, impact traces, and abrasion support the admitted river-worn boulder.',
  'schist-phyllite-cleavage': 'Penetrative fine metamorphic cleavage supports the admitted cleavage-bounded slab.',
  'silicic-lava-blocky': 'Dense silicic volcanic fabric and irregular cooling fractures support the admitted blocky lava dome.',
  'silicic-lava-flow-banded': 'Coherent warped flow bands and cross-fractures support the admitted flow-banded lava dome.',
  'soft-bedded-mudstone': 'Weak fine-grained beds and differential erosion support the admitted dissected badlands.',
  'travertine-tufa-accretionary': 'Porous precipitated carbonate and irregular accretionary laminae support the admitted depositional mound or terrace.',
  'viscous-lava-spine': 'Dense fine volcanic fabric and steep shear fractures support the admitted viscous lava spine.',
  'volcanic-breccia': 'Angular volcanic fragments in matrix support the admitted breccia pinnacle without painting a sedimentary bed set.',
  'volcaniclastic-tuff': 'Weak ash-rich volcaniclastic fabric and subdued depositional zones support the admitted tapered fairy chimney.',
  'weathered-monzogranite': 'Broad mineral patches, granular weathering, and sparse relict joints support the admitted rounded granitic forms.',
});

export const C8_FIRST100_COMPOSITE_PROFILE_IDS = Object.freeze([
  'diabase-intrusion-host-contact',
  'quartz-vein-phyllite-contact',
  'mixed-clast-abraded',
  'mixed-clast-angular',
  'mixed-clast-glacial',
]);
const compositeProfileIds = new Set(C8_FIRST100_COMPOSITE_PROFILE_IDS);

const explicitIds = Object.keys(C8_FIRST100_EXPLICIT_PROFILE_BINDINGS);
if (explicitIds.length !== 100 || explicitIds.some((id, index) => id !== C8_FIRST100_ASSET_IDS[index])) {
  throw new Error('C8 first-100 explicit lithology table must contain the 100 taxonomy IDs in canonical order.');
}

function admittedEvidenceFor(assetId) {
  return Object.freeze({
    generatedViewsAreGeologyEvidence: false,
    recordId: assetId,
    recordLocator: `checkpoint-08-basis-families/morphology/reference-final/**/${assetId}/source.json`,
    role: 'exact retained nature/source record plus its geology authority',
  });
}

export const C8_FIRST100_ADMITTED_EVIDENCE_ROUTING = Object.freeze(Object.fromEntries(
  C8_FIRST100_ASSET_IDS.map((assetId) => [assetId, Object.freeze({
    admittedEvidence: admittedEvidenceFor(assetId),
    profileId: C8_FIRST100_EXPLICIT_PROFILE_BINDINGS[assetId],
    routingAuthority: C8_FIRST100_ROUTING_AUTHORITY,
    surfaceRationale: PROFILE_RATIONALES[C8_FIRST100_EXPLICIT_PROFILE_BINDINGS[assetId]],
  })]),
));

function createExplicitBinding(assetId) {
  const accepted = C8_FIRST12_ASSET_SURFACE_BINDINGS[assetId];
  if (accepted) return accepted;
  const subtype = subtypeById.get(assetId);
  const route = C8_FIRST100_ADMITTED_EVIDENCE_ROUTING[assetId];
  if (!subtype || !route || !C8_FIRST12_LITHOLOGY_PROFILES[route.profileId]) {
    throw new RangeError(`Incomplete explicit C8 first-100 lithology binding for ${assetId}.`);
  }
  return Object.freeze({
    admittedEvidence: route.admittedEvidence,
    familyId: subtype.familyId,
    profileId: route.profileId,
    requiresSemanticRegions: compositeProfileIds.has(route.profileId),
    routingAuthority: route.routingAuthority,
    surfaceRationale: route.surfaceRationale,
  });
}

export const C8_FIRST100_ASSET_SURFACE_BINDINGS = Object.freeze(Object.fromEntries(
  C8_FIRST100_ASSET_IDS.map((assetId) => [assetId, createExplicitBinding(assetId)]),
));

export function c8First100SurfaceBinding(assetId) {
  const binding = C8_FIRST100_ASSET_SURFACE_BINDINGS[assetId];
  if (!binding) throw new RangeError(`Unknown C8 first-100 subtype “${String(assetId)}”.`);
  return binding;
}

export function resolveC8First100Projection({
  assetId,
  editedBoundsMetres,
  geometrySha256 = null,
  mapResolution = 1024,
  semanticRegions = null,
} = {}) {
  const binding = c8First100SurfaceBinding(assetId);
  if (binding.requiresSemanticRegions === true) {
    return createC8First12SurfaceSpecification({
      assetId,
      binding,
      editedBoundsMetres,
      geometrySha256,
      mapResolution,
      semanticRegions,
    }).projection;
  }
  return resolveC8First12Projection({
    assetId,
    binding,
    editedBoundsMetres,
  });
}

export function createC8First100GeologyMapData(options = {}) {
  const binding = c8First100SurfaceBinding(options.assetId);
  const generated = createC8First12GeologyMapData({ ...options, binding });
  const route = C8_FIRST100_ADMITTED_EVIDENCE_ROUTING[options.assetId];
  return Object.freeze({
    ...generated,
    audit: Object.freeze({
      ...generated.audit,
      admittedEvidence: route.admittedEvidence,
      routingAuthority: route.routingAuthority,
      surfaceRationale: route.surfaceRationale,
    }),
  });
}

export function createC8First100SurfaceSpecification(options = {}) {
  const binding = c8First100SurfaceBinding(options.assetId);
  const route = C8_FIRST100_ADMITTED_EVIDENCE_ROUTING[options.assetId];
  return Object.freeze({
    ...createC8First12SurfaceSpecification({ ...options, binding }),
    admittedEvidence: route.admittedEvidence,
    routingAuthority: route.routingAuthority,
    schema: C8_FIRST100_SURFACE_SCHEMA,
    version: C8_FIRST100_SURFACE_VERSION,
  });
}
