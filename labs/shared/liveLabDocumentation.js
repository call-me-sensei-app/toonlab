// Canonical human-facing documentation inventory for the 15 public Beta Labs.
// OSS and Pro render this same data. Keep detailed machine fields in the
// get_lab_features MCP response; this file explains workflows and boundaries.

function lab(definition) {
  return Object.freeze({
    ...definition,
    controls: Object.freeze(definition.controls),
    previewOnly: Object.freeze(definition.previewOnly ?? []),
    relatedDocs: Object.freeze(definition.relatedDocs ?? []),
    workflow: Object.freeze(definition.workflow),
  });
}

export const LIVE_LAB_DOCUMENTATION = Object.freeze([
  lab({
    artifact: 'Toon material profile',
    controls: ['light response, terminator, and per-surface shadow tones', 'face maps, nose shadow, and eye-white shade', 'base texture policy', 'skin, face, eyes, hair, cloth, fur, and equipment roles', 'cast shadows, rim, highlights, material maps, alpha, and outlines'],
    creationType: 'toon-preset',
    id: 'shader',
    previewOnly: ['preview model, pose, camera, lighting, and background'],
    relatedDocs: ['toon-shading.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/toon',
    summary: 'Author the reusable character and creature surface treatment applied to semantically classified materials.',
    title: 'Character & Creature Shader Lab',
    workflow: ['Choose or import a representative character.', 'Tune the shared treatment and inspect every important material role.', 'Save the toon preset, then assign it to the character slot of a Style Bundle.'],
  }),
  lab({
    artifact: 'Tree shader profile',
    controls: ['canopy and leaf color response', 'thin-surface transmission', 'bark and woody lighting', 'wind, seasonal, weather, distance, and shadow response'],
    creationType: 'vegetation-shader-preset',
    id: 'tree-shader',
    previewOnly: ['preview species, camera, time, lighting, and wind scene'],
    relatedDocs: ['vegetation-sky.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/vegetation-shaders',
    summary: 'Define the reusable material treatment for leaves, needles, canopies, bark, trunks, and branches.',
    title: 'Tree Shader Lab',
    workflow: ['Inspect the treatment on broadleaf, needle, bark, and branch samples.', 'Tune foliage and woody scopes independently.', 'Save the tree shader profile and assign it to the tree Style Bundle slot.'],
  }),
  lab({
    artifact: 'Grass shader profile',
    controls: ['root-to-tip gradients', 'blade lighting and transmission', 'dense-field shading', 'wind sheen, bending, interaction, weather, distance, and shadow response'],
    creationType: 'vegetation-shader-preset',
    id: 'grass-shader',
    previewOnly: ['preview field layout, camera, time, lighting, wind, and interaction probe'],
    relatedDocs: ['vegetation-sky.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/vegetation-shaders',
    summary: 'Define the reusable material treatment for blades and thin groundcover surfaces.',
    title: 'Grass Shader Lab',
    workflow: ['Inspect isolated blades and a dense field.', 'Tune color, lighting, motion response, and distance behavior.', 'Save the grass shader profile and assign it to the grass Style Bundle slot.'],
  }),
  lab({
    artifact: 'Flower shader profile',
    controls: ['petal, center, leaf, and stem palettes', 'cup and thin-surface shading', 'transmission and highlights', 'wind, weather, distance, and shadow response'],
    creationType: 'vegetation-shader-preset',
    id: 'flower-shader',
    previewOnly: ['preview species, layout, camera, lighting, time, and wind'],
    relatedDocs: ['vegetation-sky.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/vegetation-shaders',
    summary: 'Define the reusable material treatment for petals, flower centers, leaves, and herbaceous stems.',
    title: 'Flower Shader Lab',
    workflow: ['Inspect several petal and flower-center structures.', 'Tune petal, center, leaf, and stem scopes.', 'Save the flower shader profile and assign it to the flower Style Bundle slot.'],
  }),
  lab({
    artifact: 'Rock shader profile',
    controls: ['world-space projection and source-albedo policy', 'base geology, striping, veins, stains, moss, lichen, grass, sand, and snow layers', 'normal, roughness, distance, weather, and shadow response'],
    creationType: 'rock-shader-preset',
    id: 'rock-shader',
    previewOnly: ['preview rock meshes, camera, lighting, time, and weather state'],
    relatedDocs: ['rock-shader.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/rock-shader',
    summary: 'Author a geology treatment independently from the shape of any particular rock asset.',
    title: 'Rock & Geology Shader Lab',
    workflow: ['Inspect the material on multiple silhouettes and scales.', 'Build the base geology, optional layers, and distance response.', 'Save the rock shader profile and assign it to the rock Style Bundle slot.'],
  }),
  lab({
    artifact: 'Ground shader profile',
    controls: ['terrain splat and authored texture layers', 'height and slope masks', 'paths and prints', 'wetness, puddles, snow, macro/micro detail, ground-field output, distance, and shadows'],
    creationType: 'ground-shader-preset',
    id: 'terrain-shader',
    previewOnly: ['preview terrain shape, paths, prints, camera, lighting, time, and weather'],
    relatedDocs: ['ground-shader.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/ground-shader',
    summary: 'Author the reusable surface treatment for host-owned terrain and ground meshes.',
    title: 'Terrain & Ground Shader Lab',
    workflow: ['Inspect flat, sloped, elevated, path, wet, and snowy areas.', 'Tune material layers and the shared ground-field response.', 'Save the ground shader profile and assign it to the ground Style Bundle slot.'],
  }),
  lab({
    artifact: 'Manufactured-surface profile',
    controls: ['wood, paint, metal, plastic, ceramic, masonry, fabric, glass-like, emissive, and decal roles', 'source-map retention', 'wear, edge, roughness, reflection, distance, and lighting response'],
    creationType: 'manufactured-surface-profile',
    id: 'manufactured-material',
    previewOnly: ['preview prop, architecture, vehicle, camera, lighting, and comparison stage'],
    relatedDocs: ['environment.md', 'urban-prop-surface-roles.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/environment',
    summary: 'Author semantic material treatments for props, architecture, equipment, and vehicles while preserving authored maps.',
    title: 'Manufactured Surface Shader Lab',
    workflow: ['Load a representative multi-material asset.', 'Classify materials by semantic role and compare source PBR with the stylized result.', 'Save the profile and assign it to the manufactured-surface Style Bundle slot.'],
  }),
  lab({
    artifact: 'Water shader/style profile',
    controls: ['surface color, opacity, and absorption', 'waves, ripples, currents, foam, breakers, shore state, and rain response', 'reflections, refraction, caustics, underwater optics, vegetation, and quality'],
    creationType: 'water-preset',
    id: 'water',
    previewOnly: ['waterbody footprint, shore geometry, bed geometry, camera, lighting, time, weather, and interaction probes'],
    relatedDocs: ['water.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/water',
    summary: 'Author reusable liquid rendering and simulation response independently from host-owned waterbody layout.',
    title: 'Water & Liquid Shader Lab',
    workflow: ['Inspect open water, shore, breaker, rainfall, and underwater views.', 'Tune the surface, nearshore, interaction, underwater, and quality groups.', 'Save the water preset and assign it to the water Style Bundle slot.'],
  }),
  lab({
    artifact: 'Sky parameter document',
    controls: ['sky gradients and atmospheric scattering', 'sun, moon, stars, night sky, and god rays', 'exposure, time response, style snapshots, and quality'],
    creationType: 'sky-params',
    id: 'sky',
    previewOnly: ['current time, camera, scene lighting, weather, cloud state, and comparison layout'],
    relatedDocs: ['sky.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/sky',
    summary: 'Author the reusable visual sky treatment without baking in the current time, weather, or scene scale.',
    title: 'Sky Shader Lab',
    workflow: ['Inspect daylight, horizon, sunset, night, moon, and star conditions.', 'Tune the authored sky blocks and quality behavior.', 'Save the sky parameters and assign the sky treatment to a Style Bundle.'],
  }),
  lab({
    artifact: 'Cloud parameter document',
    controls: ['placement-independent cloud shape', 'base and erosion noise', 'density, edges, undersides, white tops, lighting, wind response, shadows, reprojection, and quality'],
    creationType: 'sky-params',
    id: 'cloud-shader',
    previewOnly: ['cloud placement, current weather, time, camera, lighting, and comparison layout'],
    relatedDocs: ['cloud-shader.md', 'sky.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/cloud',
    summary: 'Author the reusable volumetric cloud treatment independently from the current sky and atmospheric condition.',
    title: 'Cloud Shader Lab',
    workflow: ['Inspect cumulus, stratus, layered, backlit, and distant conditions.', 'Tune shape, erosion, density, lighting, motion, shadow, and quality blocks.', 'Save the cloud parameters and assign the cloud treatment to a Style Bundle.'],
  }),
  lab({
    artifact: 'Integrated sky and cloud parameter document',
    controls: ['coordinated sky, atmosphere, sun, moon, and stars', 'cloud shape, density, erosion, lighting, motion, and shadows', 'shared time response, comparison views, reprojection, and temporal quality'],
    creationType: 'sky-params',
    id: 'sky-cloud',
    previewOnly: ['current weather, camera, scene lighting, comparison views, and transient playback time'],
    relatedDocs: ['sky.md', 'cloud-shader.md', 'styles-and-bundles.md'],
    runtime: '@call-me-sensei/toonlab/sky',
    summary: 'Author and validate the coordinated sky/cloud system while keeping transient atmospheric conditions out of the saved style.',
    title: 'Sky & Cloud Lab',
    workflow: ['Choose the Sky, Cloud, or Integration workspace.', 'Check coordinated behavior across times, lighting views, and quality tiers.', 'Save the shared sky-parameter document and export its style slots deliberately.'],
  }),
  lab({
    artifact: 'Rock project',
    controls: ['procedural generation without a physical template', 'template-based procedural generation from the combined 580-entry official rock catalog', 'editable source-mesh vertex deltas', 'shape, cuts, cracks, strata, columns, erosion, sculpt edits, meshing, LOD, surface, PBR texture recipes, independent top finish, and weathering'],
    creationType: 'rock-project',
    id: 'rock',
    previewOnly: ['camera, lighting, background, renderer diagnostics, and meadow-grass visualization'],
    relatedDocs: ['rock-shader.md', 'texture-lab.md'],
    runtime: '@call-me-sensei/toonlab/rockgen',
    summary: 'Create one rock, a reusable cliff module, or a composed formation procedurally, with or without a physical GLB template.',
    title: 'Rock & Cliff Generation Lab',
    workflow: ['Generate without a physical template, or choose a GLB from the Stylized rock catalog as the editable starting mesh.', 'Edit shape, topology deltas, surface, top finish, weathering, textures, composition, and LODs.', 'Save the rock project and export the GLB; preview meadow grass is deliberately excluded.'],
  }),
  lab({
    artifact: 'Tree recipe',
    controls: ['species and architecture', 'trunk, roots, branching, twigs, foliage, flowers and fruit where supported', 'growth, pruning, asymmetry, wind preparation, materials, LODs, and export'],
    creationType: 'tree-recipe',
    id: 'tree',
    previewOnly: ['camera, lighting, ground, time, weather, wind playback, and forest context'],
    relatedDocs: ['vegetation-sky.md'],
    runtime: '@call-me-sensei/toonlab/vegetation',
    summary: 'Create deterministic tree and shrub assets from portable species and architecture recipes.',
    title: 'Tree & Shrub Generation Lab',
    workflow: ['Choose a species or start from an architecture preset.', 'Tune trunk, roots, branching, foliage, growth, materials, and LOD behavior.', 'Save the tree recipe and export the compiled asset.'],
  }),
  lab({
    artifact: 'Grass preset',
    controls: ['blade and clump shape', 'density, spacing, patch distribution, masks, and terrain conformity', 'palette, wind response, interaction preparation, and LOD behavior'],
    creationType: 'grass-preset',
    id: 'grass',
    previewOnly: ['preview field footprint, terrain, camera, lighting, time, cloud shadow, wind playback, and walk mode'],
    relatedDocs: ['vegetation-sky.md'],
    runtime: '@call-me-sensei/toonlab/vegetation',
    summary: 'Create reusable grass and groundcover geometry/placement response without saving a particular scene field.',
    title: 'Grass & Groundcover Generation Lab',
    workflow: ['Choose a grass preset or continue an existing document.', 'Tune blades, clumps, field response, palette, wind, interaction, and LODs.', 'Save the grass preset for placement by a host-authored terrain or field.'],
  }),
  lab({
    artifact: 'Texture recipe',
    controls: ['generator, deterministic seed, palette, scale, and structure', 'pattern, noise, surface detail, relief, edge treatment, and wear', 'roughness, metalness, AO, normal/height response, and map packing'],
    creationType: 'texture-recipe',
    id: 'texture',
    previewOnly: ['preview mesh, UV mode, camera, lighting, tiling view, and map-channel inspection'],
    relatedDocs: ['texture-lab.md'],
    runtime: '@call-me-sensei/toonlab/texgen',
    summary: 'Create deterministic seamless material textures and coordinated PBR map sets.',
    title: 'Texture & Material Map Generation Lab',
    workflow: ['Choose a material preset, image input, or empty recipe.', 'Tune the generator while checking tiling and every output channel.', 'Save the recipe and export albedo, normal, roughness, metalness, AO, ORM, and height maps as needed.'],
  }),
]);

export const LIVE_LAB_DOCUMENTATION_BY_ID = Object.freeze(Object.fromEntries(
  LIVE_LAB_DOCUMENTATION.map((entry) => [entry.id, entry]),
));

const OSS_PATH_TO_LAB = Object.freeze({
  'cloud-shader-lab': 'cloud-shader',
  'flower-shader-lab': 'flower-shader',
  'grass-lab': 'grass',
  'grass-shader-lab': 'grass-shader',
  'ground-shader-lab': 'terrain-shader',
  'manufactured-material-lab': 'manufactured-material',
  'rock-lab': 'rock',
  'rock-shader-lab': 'rock-shader',
  'shader-lab': 'shader',
  'sky-cloud-lab': 'sky-cloud',
  'sky-lab': 'sky',
  'texture-lab': 'texture',
  'tree-lab': 'tree',
  'tree-shader-lab': 'tree-shader',
  'water-lab': 'water',
});

export function resolveLiveLabDocumentationId(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname ?? '');
  const hosted = pathname.match(/^\/labs\/([^/]+)/);
  if (hosted && LIVE_LAB_DOCUMENTATION_BY_ID[hosted[1]]) return hosted[1];
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  return OSS_PATH_TO_LAB[firstSegment] ?? null;
}

export function liveLabDocumentationHref(locationLike = globalThis.location) {
  const id = resolveLiveLabDocumentationId(locationLike);
  const suffix = id ? `#${id}` : '';
  return String(locationLike?.pathname ?? '').startsWith('/labs')
    ? `/docs/labs${suffix}`
    : `/docs/#/labs${id ? `/${id}` : ''}`;
}
