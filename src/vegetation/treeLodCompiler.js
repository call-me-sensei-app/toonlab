import * as THREE from 'three';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

import { createPlantFromRecipe, parseTreeRecipeDocument } from './treeRecipe.js';
import { disposeExportGroup, prepareTreeForExport } from './treeExport.js';
import {
  COMPILED_TREE_MANIFEST_SCHEMA,
  COMPILED_TREE_MANIFEST_VERSION,
} from './compiledTree.js';

export const TREE_LOD_TRIANGLE_CAPS = Object.freeze([12000, 7000, 3500, 140]);
export const TREE_LOD_SCREEN_COVERAGE = Object.freeze([0.16, 0.075, 0.025, 0]);
// Engine budgets are introduced only after a representative reviewed
// benchmark exists. A clumping bamboo asset contains several complete culms,
// node rings, and node-born branch complements, so forcing it through the
// single-tree cap either invalidates every mature stage or destroys the
// architecture. The Bambusa vulgaris benchmark establishes this first
// architecture-specific envelope; other engines retain the conservative
// default until their own benchmark wave is reviewed.
export const TREE_LOD_ENGINE_TRIANGLE_CAPS = Object.freeze({
  // The reviewed English-oak benchmark uses individually oriented leaves and
  // a four-order decurrent scaffold. Its authored close source is naturally
  // denser than the legacy aggregate-card tree. Give woody-axis trees an
  // engine envelope that can retain the 55–78% / 24–42% family ratios while
  // preserving the 140-triangle ultra-far ceiling.
  'woody-axis': Object.freeze([40000, 21000, 11000, 140]),
  'culm-colony': Object.freeze([110000, 35000, 14000, 140]),
  // BranchTree is not a legacy aggregate-card tree: it hard-sets the recursive
  // `branching` generator, so a four-level scaffold at 12+ radial segments
  // spends 14.7k-15.6k triangles on wood alone, before a single leaf. Its LOD0
  // is also exported with crossed leaf cards (4 triangles each), so the close
  // source lands well above the legacy default of 12000 by construction, not
  // by over-authoring.
  //
  // Reviewed benchmark: the nine launch-world BranchTree families
  // (TREE-CITY-HQ-A/B, TREE-COAST-HQ-A, three seed variants each), measured at
  // four levels / 12 radial segments / 6 children / leaf density 1.1-1.25:
  // wood 14,740-15,622, leaf cards 5,274-6,683, LOD0 35,962-41,598 triangles.
  // See launch-plan/review/tree-replacement-authoring.md for the full table.
  // LOD0 takes an 11% margin over the measured maximum; LOD1 and LOD2 sit at
  // 59% and 28% of it, inside the 55-78% / 24-42% family ratios the woody-axis
  // envelope established.
  'branch-tree': Object.freeze([46000, 27000, 13000, 140]),
  // Native conifers keep explicit annual whorls, curved boughs, and three
  // semantic needle-spray axes per bough. The reviewed Norway-spruce source
  // stays below 40k triangles; LOD1 is targeted to 68% of the actual source
  // below, while the proxy levels retain the compact gameplay budgets.
  'whorled-conifer': Object.freeze([40000, 24000, 3500, 140]),
});

// Branch LOD follows the same structural rule as EZ-Tree 2: grow the full
// tree, then remesh every branch from the identical centerline data. Larger
// longitudinal strides and radial factors provide the reduction; branch
// levels are never deleted, because doing so destroys conifer silhouettes.
// LOD1 remains the close gameplay mesh: preserve authored cross-sections so
// sparse palm trunks/frond axes and broad old-tree scaffolds do not collapse
// below their architecture-family envelopes. Its longitudinal stride supplies
// the reduction. LOD2 keeps the aggressive far-mesh factor and is independently
// protected by the silhouette gate.
const LOD_RADIAL_FACTORS = Object.freeze([1, 1, 0.4]);
const LOD_SECTION_STRIDES = Object.freeze([1, 2, 6]);
const LOD_ENGINE_MESHING = Object.freeze({
  // Sparse broadleaf branches encode silhouette in their complete curved
  // centerlines. Reduce tube sides, not centerline samples; skipping spans
  // caused mature decurrent crowns to fall to 40% at LOD1 even before their
  // individually oriented foliage was simplified.
  'woody-axis': Object.freeze({
    radialFactors: Object.freeze([1, 0.75, 0.4]),
    sectionStrides: Object.freeze([1, 1, 1]),
  }),
  // BranchTree grows the same kind of four-level decurrent broadleaf scaffold,
  // and its silhouette lives in the complete curved centerlines for the same
  // reason. It also already tapers its own branch cross-sections per level
  // (radialSegments, then -2, then -4, then 3), so longitudinal decimation on
  // top of that reaches the three-side floor and squares off the twigs.
  // Reduce tube sides only.
  'branch-tree': Object.freeze({
    radialFactors: Object.freeze([1, 0.75, 0.4]),
    sectionStrides: Object.freeze([1, 1, 1]),
  }),
  // Annual whorls also depend on complete drooping/upturned centerlines.
  // Six-sided stylized source tubes reduce cleanly to four/three sides while
  // preserving every whorl and spray attachment.
  'whorled-conifer': Object.freeze({
    radialFactors: Object.freeze([1, 2 / 3, 0.5]),
    sectionStrides: Object.freeze([1, 1, 1]),
  }),
  // Culms are already low-sided, mostly straight tubes. Keeping the generic
  // close policy would retain nearly all of LOD0, so bamboo uses a stronger
  // longitudinal/radial reduction while preserving every node and attachment.
  'culm-colony': Object.freeze({
    radialFactors: Object.freeze([1, 0.75, 0.375]),
    sectionStrides: Object.freeze([1, 3, 6]),
  }),
  // A terminal crown has few axes, but each palm/fern rachis is a long,
  // authored curve. Combining every pair at the close gameplay level makes
  // mature fronds visibly angular and sheds too much of the species-defining
  // crown. Preserve those sections at LOD1; its hard triangle cap can thin
  // individual pinnae before it damages the rachis silhouette.
  'terminal-crown': Object.freeze({
    radialFactors: Object.freeze([1, 0.875, 0.4]),
    sectionStrides: Object.freeze([1, 1, 6]),
  }),
  // Rosette and pseudostem silhouettes depend on a few large axes rather than
  // hundreds of woody twigs. Their far mesh needs one extra radial step to
  // stay inside the architecture envelope from side and oblique views.
  'branched-rosette': Object.freeze({
    radialFactors: Object.freeze([1, 1, 0.5]),
    sectionStrides: LOD_SECTION_STRIDES,
  }),
  'pseudostem-fan': Object.freeze({
    radialFactors: Object.freeze([1, 1, 0.5]),
    sectionStrides: LOD_SECTION_STRIDES,
  }),
  // Succulents expose their structural surface directly. Reduce rib/pad
  // tessellation and areole/spine sampling together so LODs remain visibly
  // three-dimensional without carrying every close-up ridge bundle.
  'succulent-axis': Object.freeze({
    radialFactors: Object.freeze([1, 0.75, 0.4]),
    sectionStrides: Object.freeze([1, 2, 4]),
  }),
});
// Static export cards lose the live shader's camera-facing behavior. Retain
// more authored cards than EZ-Tree's generic every-other-leaf default, then
// use modest scale compensation; the triangle budget remains the hard cap.
const LOD_FOLIAGE_RETENTION = Object.freeze([1, 1, 1]);
const LOD_FOLIAGE_SCALE = Object.freeze([1, 1, 1]);

function foliageScaleFor(engine, level) {
  // A conifer branchlet alpha card is much narrower than its quad. Hybrid
  // LOD2 turns most crossed pairs into one world-oriented plane; a restrained
  // scale compensation restores the needle envelope without adding geometry
  // or inflating broadleaf crowns.
  if (engine === 'whorled-conifer' && level === 2) return 1.2;
  return LOD_FOLIAGE_SCALE[level];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function semanticChild(root, role, legacyName) {
  return root.children.find((child) =>
    child.userData?.toonlabSemanticRole === role || child.name === legacyName);
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3);
}

function rootTriangles(root) {
  let total = 0;
  root.traverse((object) => {
    if (object.isMesh && object.geometry) total += triangleCount(object.geometry);
  });
  return total;
}

function rootMaterialCount(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => materials.add(material));
  });
  return materials.size;
}

export function createProceduralTreeLeafTexture({ resolution = 128, seed = 1 } = {}) {
  const size = Math.max(16, Math.min(512, Math.round(resolution)));
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let value = (Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
      ^ Math.imul(Math.round(seed) + 1, 2246822519)) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const taper = Math.max(0, 1 - Math.abs(v) * 0.34);
      const leaf = (u / Math.max(taper, 0.05)) ** 2 + (v * 0.92) ** 2;
      const serration = Math.sin((Math.atan2(v, u) + 3.2) * 11) * 0.045;
      const alpha = leaf <= 0.76 + serration ? 255 : leaf <= 0.88 ? 128 : 0;
      const luminance = Math.round(180 + hash(x, y) * 65);
      const index = (y * size + x) * 4;
      data[index] = luminance;
      data[index + 1] = luminance;
      data[index + 2] = luminance;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'ToonLabTreeLeafAtlas';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createTreeLodRecipe(recipeInput, level) {
  const recipe = parseTreeRecipeDocument(recipeInput);
  const lod = THREE.MathUtils.clamp(Math.round(level), 0, 2);
  const meshing = LOD_ENGINE_MESHING[recipe.architecture?.engine];
  let radialFactor = meshing?.radialFactors?.[lod] ?? LOD_RADIAL_FACTORS[lod];
  let sectionStride = meshing?.sectionStrides?.[lod] ?? LOD_SECTION_STRIDES[lod];
  if (
    recipe.architecture?.engine === 'woody-axis'
    && recipe.lifeStageSlot === 'juvenile'
  ) {
    // A young broadleaf has too few centerline spans for stride decimation:
    // skipping every second or fourth sample collapses its already-small
    // scaffold to roughly 20%/10% of LOD0. Preserve its authored centerline
    // and reduce only the tube cross-section. This keeps the close/far family
    // ratios stable while remaining comfortably below the absolute caps.
    radialFactor = [1, 0.75, 0.4][lod];
    sectionStride = 1;
  }
  if (
    recipe.architecture?.engine === 'woody-axis'
    && recipe.lifeStageSlot === 'young'
  ) {
    // Young crowns still have too few branch spans for stride decimation.
    // Preserve their centerlines at both gameplay levels and reduce only the
    // tube cross-section, including the fine-branch cross-sections.
    radialFactor = [1, 2 / 3, 1 / 3][lod];
    sectionStride = 1;
  }
  // A Joshua tree's first fork has only a few terminal heads and a dense
  // sleeve of retained leaf bases. Applying the mature multi-head stride to
  // this stage deletes most of that defining sleeve and makes LOD1/2 read as
  // a bare fork. Preserve all close sections and half the far sections while
  // still reducing their radial cross-sections. Mature/old crowns keep the
  // stronger generic policy so their many heads remain inside the hard caps.
  if (
    recipe.architecture?.engine === 'branched-rosette'
    && recipe.lifeStageSlot === 'first-branching'
  ) {
    radialFactor = [1, 0.7, 0.5][lod];
    sectionStride = [1, 1, 2][lod];
  }
  if (
    recipe.architecture?.engine === 'succulent-axis'
    && recipe.lifeStageSlot === 'first-branch'
  ) {
    // One newly emerged arm or a seven-pad young crown has little redundant
    // geometry. Keep a denser rib/pad cross-section than mature specimens so
    // the defining first branch survives both gameplay LODs.
    radialFactor = [1, 0.875, 0.7][lod];
    sectionStride = [1, 2, 2][lod];
  }
  const options = cloneJson(recipe.options);
  options.canopy = { ...(options.canopy ?? {}) };
  options.skeleton = { ...(options.skeleton ?? {}) };
  options.trunk = { ...(options.trunk ?? {}) };
  // The skeleton grower still computes every source centerline and foliage
  // attachment at every LOD. Only the meshing density changes, so transitions
  // do not re-roll the tree or delete complete limb levels.
  options.skeleton.meshSectionStride = sectionStride;
  delete options.skeleton.meshLevelLimit;
  if (recipe.architecture?.engine === 'culm-colony') {
    // Keep the semantic graph and stable part IDs at every level, but do not
    // remesh fine dendroid branchlet tubes once their leaf cards carry the
    // far silhouette. LOD1 retains primary and terminal twigs; LOD2 retains
    // culms, nodes, and the node-born primary branch complement.
    options.skeleton.bambooMaxStructuralLevel = [Infinity, 3, 2][lod];
  }
  // Species baselines own the source resolution for the native woody
  // evaluator. Falling back to the old hard-coded eight-sided skeleton here
  // silently made every catalog species look like the legacy low-poly
  // generator as soon as it entered the LOD compiler.
  const nativeWoodyEngine = ['woody-axis', 'whorled-conifer']
    .includes(recipe.architecture?.engine);
  const inheritedTrunkRadialSegments = nativeWoodyEngine
    ? Number(
      options.woodyBaseline?.controls?.['resolution.trunkRadialSegments']
        ?? options.woodyBaseline?.inheritedControls?.['resolution.trunkRadialSegments'],
    )
    : NaN;
  const skeletonRadialSegments = Number(options.skeleton.radialSegments)
    || inheritedTrunkRadialSegments
    || 8;
  options.skeleton.radialSegments = Math.max(
    3,
    Math.round(skeletonRadialSegments * radialFactor),
  );
  const trunkRadialSegments = Number(options.trunk.radialSegments) || 10;
  options.trunk.radialSegments = Math.max(
    3,
    Math.round(trunkRadialSegments * radialFactor),
  );
  options.trunk.heightSegments = Math.max(
    6,
    Math.round((Number(options.trunk.heightSegments) || 14) * (1 - lod * 0.2)),
  );
  if (lod >= 1) options.foliage = { ...(options.foliage ?? {}), windStrength: 0.025 };
  if (lod >= 2) options.foliage = { ...(options.foliage ?? {}), windStrength: 0 };
  return { ...recipe, options };
}

function groundTreeLevel(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 1e-6) {
    root.position.y -= bounds.min.y;
    root.updateWorldMatrix(true, true);
  }
  return root;
}

function ensureAttribute(geometry, name, itemSize, fill) {
  if (geometry.getAttribute(name)) return;
  const values = new Float32Array(geometry.attributes.position.count * itemSize);
  for (let index = 0; index < geometry.attributes.position.count; index += 1) {
    const entry = Array.isArray(fill) ? fill : [fill];
    for (let component = 0; component < itemSize; component += 1) {
      values[index * itemSize + component] = entry[component] ?? entry[0] ?? 0;
    }
  }
  geometry.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
}

function remapUvColumn(geometry, offset, scale) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setX(index, offset + THREE.MathUtils.clamp(uv.getX(index), 0, 1) * scale);
  }
  uv.needsUpdate = true;
}

function textureData(texture) {
  const image = texture?.image;
  if (!texture?.isDataTexture || !image?.data || !image.width || !image.height) return null;
  return {
    data: image.data,
    height: image.height,
    width: image.width,
  };
}

function createSingleMaterialAtlas(trunkMap, foliageMap) {
  const trunk = textureData(trunkMap);
  const foliage = textureData(foliageMap);
  const tileWidth = Math.max(16, trunk?.width ?? 0, foliage?.width ?? 0, 128);
  const tileHeight = Math.max(16, trunk?.height ?? 0, foliage?.height ?? 0, 128);
  const data = new Uint8Array(tileWidth * 2 * tileHeight * 4);
  const sample = (source, x, y, fallback) => {
    if (!source) return fallback;
    const sourceX = Math.min(source.width - 1, Math.floor(x / tileWidth * source.width));
    const sourceY = Math.min(source.height - 1, Math.floor(y / tileHeight * source.height));
    const offset = (sourceY * source.width + sourceX) * 4;
    return [
      source.data[offset] ?? 255,
      source.data[offset + 1] ?? 255,
      source.data[offset + 2] ?? 255,
      source.data[offset + 3] ?? 255,
    ];
  };
  for (let y = 0; y < tileHeight; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      const bark = sample(trunk, x, y, [255, 255, 255, 255]);
      const barkOffset = (y * tileWidth * 2 + x) * 4;
      data.set(bark, barkOffset);

      let leaf;
      if (foliage) {
        leaf = sample(foliage, x, y, [255, 255, 255, 0]);
      } else {
        const u = (x + 0.5) / tileWidth * 2 - 1;
        const v = (y + 0.5) / tileHeight * 2 - 1;
        const taper = Math.max(0.05, 1 - Math.abs(v) * 0.34);
        const shape = (u / taper) ** 2 + (v * 0.92) ** 2;
        leaf = [255, 255, 255, shape <= 0.8 ? 255 : shape <= 0.9 ? 128 : 0];
      }
      const leafOffset = (y * tileWidth * 2 + tileWidth + x) * 4;
      data.set(leaf, leafOffset);
    }
  }
  const atlas = new THREE.DataTexture(
    data,
    tileWidth * 2,
    tileHeight,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  atlas.name = 'TreeLod2SurfaceAtlas';
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.flipY = false;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;
  atlas.userData.bakedLeafTexture = true;
  return atlas;
}

function combinedSingleMaterialLevel(exported) {
  const trunk = semanticChild(exported, 'structure', 'Trunk');
  const foliage = semanticChild(exported, 'organs', 'Foliage');
  const pieces = [trunk, foliage].filter(Boolean).map((mesh, index) => {
    const geometry = mesh.geometry.clone();
    ensureAttribute(geometry, 'normal', 3, [0, 1, 0]);
    ensureAttribute(geometry, 'uv', 2, [0, 0]);
    const materialColor = mesh.material?.color ?? new THREE.Color(1, 1, 1);
    ensureAttribute(
      geometry,
      'color',
      3,
      index === 0
        ? [materialColor.r, materialColor.g, materialColor.b]
        : [1, 1, 1],
    );
    remapUvColumn(geometry, index === 0 ? 0 : 0.5, 0.5);
    ensureAttribute(geometry, 'treeMaterialSelector', 1, index === 0 ? 0 : 1);
    return geometry;
  });
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error('Could not merge the single-material tree LOD.');
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createSingleMaterialAtlas(trunk?.material?.map, foliage?.material?.map),
    alphaTest: foliage?.material?.alphaTest ?? 0.3,
    metalness: 0,
    roughness: 1,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'TreeSingleMaterial';
  const root = new THREE.Group();
  root.userData = cloneJson(exported.userData);
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'TreeSingleMaterialMesh';
  mesh.userData.toonlabSemanticRole = 'plant';
  mesh.userData.toonlabSemanticParts = exported.userData?.plantGraph
    ? Object.fromEntries(exported.userData.plantGraph.parts.map((part) => [part.id, part]))
    : undefined;
  mesh.castShadow = true;
  root.add(mesh);
  return root;
}

function averageFoliageColor(root) {
  const color = new THREE.Color(0.26, 0.56, 0.24);
  const foliage = semanticChild(root, 'organs', 'Foliage');
  const colors = foliage?.geometry?.attributes?.color;
  if (!colors?.count) return color;
  color.setRGB(0, 0, 0);
  const stride = Math.max(1, Math.floor(colors.count / 2048));
  let samples = 0;
  for (let index = 0; index < colors.count; index += stride) {
    color.r += colors.getX(index);
    color.g += colors.getY(index);
    color.b += colors.getZ(index);
    samples += 1;
  }
  return color.multiplyScalar(1 / Math.max(samples, 1));
}

function createCrownEnvelopeGeometry(
  sourceRoot,
  bounds,
  color,
  minimumY = -Infinity,
  maximumY = Infinity,
) {
  const size = bounds.getSize(new THREE.Vector3());
  const ringCount = 8;
  const radialSegments = 8;
  const pointsXY = [];
  const pointsZY = [];
  const pointsXZ = [];
  const points3D = [];
  const addPoint = (point) => {
    if (point.y < minimumY || point.y > maximumY) return;
    pointsXY.push([point.x, point.y]);
    pointsZY.push([point.z, point.y]);
    pointsXZ.push([point.x, point.z]);
    points3D.push(point.clone());
  };
  sourceRoot?.updateWorldMatrix(true, true);
  sourceRoot?.traverse((object) => {
    const position = object?.geometry?.attributes?.position;
    if (!position) return;
    const uv = object.geometry.getAttribute('uv');
    const vertex = new THREE.Vector3();
    if (/foliage|leaf/i.test(object.name) && uv && position.count % 4 === 0) {
      const corners = new Array(4);
      for (let offset = 0; offset < position.count; offset += 4) {
        corners.fill(null);
        for (let corner = 0; corner < 4; corner += 1) {
          const index = offset + corner;
          const u = Math.round(uv.getX(index));
          const v = Math.round(uv.getY(index));
          corners[v * 2 + u] = vertex.fromBufferAttribute(position, index).clone();
        }
        if (corners.some((corner) => !corner)) continue;
        // Sample the same analytical alpha contour used by the leaf atlas.
        // Export-card corners are transparent; including them would inflate a
        // far proxy even though those pixels never contribute to the source
        // silhouette.
        for (let sample = 0; sample <= 16; sample += 1) {
          const leafY = sample / 16 * 2 - 1;
          const taper = Math.max(0.05, 1 - Math.abs(leafY) * 0.34);
          const leafX = taper * Math.sqrt(Math.max(0, 0.88 - (leafY * 0.92) ** 2));
          for (const signedX of [-leafX, leafX]) {
            const u = (signedX + 1) * 0.5;
            const v = (leafY + 1) * 0.5;
            vertex.copy(corners[0]).multiplyScalar((1 - u) * (1 - v))
              .addScaledVector(corners[1], u * (1 - v))
              .addScaledVector(corners[2], (1 - u) * v)
              .addScaledVector(corners[3], u * v)
              .applyMatrix4(object.matrixWorld);
            addPoint(vertex);
          }
        }
      }
      return;
    }
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      addPoint(vertex);
    }
  });
  const projectedHull = (points, firstAxis, secondAxis) => {
    const unique = new Map();
    for (const point of points) {
      const first = point[firstAxis];
      const second = point[secondAxis];
      unique.set(`${first.toFixed(6)}:${second.toFixed(6)}`, { first, second, point });
    }
    const sorted = [...unique.values()].sort((left, right) => (
      left.first - right.first || left.second - right.second
    ));
    if (sorted.length < 3) return sorted;
    const turn = (a, b, c) => (b.first - a.first) * (c.second - a.second)
      - (b.second - a.second) * (c.first - a.first);
    const lower = [];
    for (const entry of sorted) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], entry) <= 0) {
        lower.pop();
      }
      lower.push(entry);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const entry = sorted[index];
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], entry) <= 0) {
        upper.pop();
      }
      upper.push(entry);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  if (points3D.length >= 4) {
    // Preserve every extreme point in the three authored review projections.
    // A convex hull built from this union has the same front, side and top
    // convex envelopes as the source geometry, while remaining a genuinely
    // camera-independent 3D proxy. Most stylized crowns need fewer than 40
    // triangles; keep 12 triangles in reserve for the grounded trunk.
    const projectionSupports = new Map();
    for (const [firstAxis, secondAxis] of [['x', 'y'], ['z', 'y'], ['x', 'z']]) {
      for (const entry of projectedHull(points3D, firstAxis, secondAxis)) {
        const point = entry.point;
        projectionSupports.set(
          `${point.x.toFixed(5)}:${point.y.toFixed(5)}:${point.z.toFixed(5)}`,
          point,
        );
      }
    }
    if (projectionSupports.size >= 4) {
      const exactGeometry = new ConvexGeometry([...projectionSupports.values()]);
      if (triangleCount(exactGeometry) <= 128) {
        ensureAttribute(exactGeometry, 'uv', 2, [0, 0]);
        ensureAttribute(exactGeometry, 'color', 3, [color.r, color.g, color.b]);
        return exactGeometry;
      }
      exactGeometry.dispose();
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    half.set(Math.max(half.x, 1e-5), Math.max(half.y, 1e-5), Math.max(half.z, 1e-5));
    const directions = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
    for (const latitude of [-60, -30, 0, 30, 60]) {
      const polar = THREE.MathUtils.degToRad(latitude);
      for (let segment = 0; segment < 8; segment += 1) {
        const angle = segment / 8 * Math.PI * 2;
        directions.push(new THREE.Vector3(
          Math.cos(polar) * Math.cos(angle),
          Math.sin(polar),
          Math.cos(polar) * Math.sin(angle),
        ));
      }
    }
    const supports = new Map();
    for (const direction of directions) {
      let best = null;
      let bestScore = -Infinity;
      for (const point of points3D) {
        const score = ((point.x - center.x) / half.x) * direction.x
          + ((point.y - center.y) / half.y) * direction.y
          + ((point.z - center.z) / half.z) * direction.z;
        if (score > bestScore) {
          bestScore = score;
          best = point;
        }
      }
      if (best) supports.set(`${best.x.toFixed(5)}:${best.y.toFixed(5)}:${best.z.toFixed(5)}`, best);
    }
    if (supports.size >= 4) {
      const geometry = new ConvexGeometry([...supports.values()]);
      ensureAttribute(geometry, 'uv', 2, [0, 0]);
      ensureAttribute(geometry, 'color', 3, [color.r, color.g, color.b]);
      return geometry;
    }
  }
  const hull = (points) => {
    if (points.length < 3) return points;
    const sorted = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  const rangeAt = (polygon, y, fallbackMin, fallbackMax) => {
    const values = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (Math.abs(a[1] - y) < 1e-5) values.push(a[0]);
      if ((a[1] < y && b[1] > y) || (b[1] < y && a[1] > y)) {
        values.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    if (values.length >= 2) return [Math.min(...values), Math.max(...values)];
    if (values.length === 1) {
      const padding = (fallbackMax - fallbackMin) * 0.025;
      return [values[0] - padding, values[0] + padding];
    }
    return [fallbackMin, fallbackMax];
  };
  const hullXY = hull(pointsXY);
  const hullZY = hull(pointsZY);
  const hullXZ = hull(pointsXZ);
  const overallCx = (bounds.min.x + bounds.max.x) * 0.5;
  const overallCz = (bounds.min.z + bounds.max.z) * 0.5;
  const overallRx = Math.max((bounds.max.x - bounds.min.x) * 0.5, 1e-5);
  const overallRz = Math.max((bounds.max.z - bounds.min.z) * 0.5, 1e-5);
  const radialShape = Array.from({ length: radialSegments }, (_, segment) => {
    const angle = segment / radialSegments * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const support = hullXZ.reduce((best, point) => {
      const score = ((point[0] - overallCx) / overallRx) * dx
        + ((point[1] - overallCz) / overallRz) * dz;
      return !best || score > best.score ? { point, score } : best;
    }, null);
    return support
      ? [(support.point[0] - overallCx) / overallRx, (support.point[1] - overallCz) / overallRz]
      : [dx, dz];
  });
  const rings = Array.from({ length: ringCount }, (_, ring) => {
    const y = THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, ring / (ringCount - 1));
    const [minX, maxX] = rangeAt(hullXY, y, bounds.min.x, bounds.max.x);
    const [minZ, maxZ] = rangeAt(hullZY, y, bounds.min.z, bounds.max.z);
    return { y, minX, maxX, minZ, maxZ };
  });
  const positions = [];
  const colors = [];
  const uvs = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const band = rings[ring];
    const cx = (band.minX + band.maxX) * 0.5;
    const cz = (band.minZ + band.maxZ) * 0.5;
    const rx = Math.max((band.maxX - band.minX) * 0.5, size.x * 0.12);
    const rz = Math.max((band.maxZ - band.minZ) * 0.5, size.z * 0.12);
    for (let segment = 0; segment < radialSegments; segment += 1) {
      positions.push(
        cx + radialShape[segment][0] * rx,
        band.y,
        cz + radialShape[segment][1] * rz,
      );
      colors.push(color.r, color.g, color.b);
      uvs.push(segment / radialSegments, ring / (ringCount - 1));
    }
  }
  const indices = [];
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + segment;
      indices.push(a, b, c, a, c, d);
    }
  }
  const bottomCenter = positions.length / 3;
  const bottomBand = rings[0];
  const topBand = rings[ringCount - 1];
  positions.push(
    (bottomBand.minX + bottomBand.maxX) * 0.5, bounds.min.y,
    (bottomBand.minZ + bottomBand.maxZ) * 0.5,
  );
  colors.push(color.r, color.g, color.b);
  uvs.push(0.5, 0);
  const topCenter = positions.length / 3;
  positions.push(
    (topBand.minX + topBand.maxX) * 0.5, bounds.max.y,
    (topBand.minZ + topBand.maxZ) * 0.5,
  );
  colors.push(color.r, color.g, color.b);
  uvs.push(0.5, 1);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenter, next, segment);
    const topOffset = (ringCount - 1) * radialSegments;
    indices.push(topCenter, topOffset + segment, topOffset + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function upperBounds(reference, minimumY) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  reference.traverse((object) => {
    const position = object?.geometry?.attributes?.position;
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (vertex.y >= minimumY) bounds.expandByPoint(vertex);
    }
  });
  return bounds;
}

function boundsBetween(reference, minimumY, maximumY) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  reference.traverse((object) => {
    const position = object?.geometry?.attributes?.position;
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (vertex.y >= minimumY && vertex.y <= maximumY) bounds.expandByPoint(vertex);
    }
  });
  return bounds;
}

function trunkBase(reference, fullBounds) {
  const trunk = semanticChild(reference, 'structure', 'Trunk');
  const position = trunk?.geometry?.attributes?.position;
  if (!position) return new THREE.Vector3(
    (fullBounds.min.x + fullBounds.max.x) * 0.5,
    fullBounds.min.y,
    (fullBounds.min.z + fullBounds.max.z) * 0.5,
  );
  const threshold = fullBounds.min.y + Math.max(fullBounds.max.y - fullBounds.min.y, 0.1) * 0.035;
  const result = new THREE.Vector3();
  let count = 0;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    if (y > threshold) continue;
    result.x += position.getX(index);
    result.y += y;
    result.z += position.getZ(index);
    count += 1;
  }
  return count ? result.multiplyScalar(1 / count) : new THREE.Vector3(0, fullBounds.min.y, 0);
}

function createWhorledConiferMidProxy(reference) {
  reference.updateWorldMatrix(true, true);
  const fullBounds = new THREE.Box3().setFromObject(reference);
  if (fullBounds.isEmpty()) return null;
  const size = fullBounds.getSize(new THREE.Vector3());
  const color = averageFoliageColor(reference);
  const crownBottom = THREE.MathUtils.lerp(fullBounds.min.y, fullBounds.max.y, 0.1);
  const crownBounds = boundsBetween(reference, crownBottom, fullBounds.max.y);
  if (crownBounds.isEmpty()) return null;
  // Begin with the exact three-projection support hull used by the proven
  // far proxy. It preserves the authored front, side and top silhouette
  // without view-facing billboards or a camera-dependent mesh.
  const pieces = [createCrownEnvelopeGeometry(
    reference,
    crownBounds,
    color,
    crownBottom,
    fullBounds.max.y,
  )];
  // LOD2 carries more architectural information than LOD3: three very thin,
  // open whorl skirts mark the annual crown tiers. Because the skirts have no
  // caps, they do not turn the top view into a filled ellipse; their radii
  // come from narrow source bands rather than from a generic cone.
  const lifeStage = reference.userData?.plantGraph?.lifeStageSlot;
  // A juvenile has only its first annual tier. Encoding three proxy skirts
  // fabricated maturity that is absent from the source and made the far mesh
  // denser than its tiny close mesh. Later stages retain the three-band
  // architecture cue.
  const matureWhorlProxy = ['mature', 'old', 'ancient'].includes(lifeStage);
  const whorlFractions = lifeStage === 'juvenile'
    ? [0.68]
    : matureWhorlProxy
      ? [0.35, 0.52, 0.69, 0.84]
      : [0.42, 0.62, 0.8];
  const matureSkirtSegments = lifeStage === 'old'
    ? 14
    : lifeStage === 'ancient'
      ? 15
      : 12;
  for (const fraction of whorlFractions) {
    const centerY = THREE.MathUtils.lerp(crownBottom, fullBounds.max.y, fraction);
    const halfWindow = size.y * 0.035;
    const bandBounds = boundsBetween(
      reference,
      centerY - halfWindow,
      centerY + halfWindow,
    );
    if (bandBounds.isEmpty()) continue;
    const bandSize = bandBounds.getSize(new THREE.Vector3());
    const bandCenter = bandBounds.getCenter(new THREE.Vector3());
    const skirtHeight = Math.max(size.y * 0.012, 0.02);
    const skirt = new THREE.CylinderGeometry(
      0.88,
      1,
      skirtHeight,
      matureWhorlProxy ? matureSkirtSegments : 8,
      1,
      true,
    );
    skirt.scale(
      Math.max(bandSize.x * 0.5, size.x * 0.06),
      1,
      Math.max(bandSize.z * 0.5, size.z * 0.06),
    );
    skirt.translate(bandCenter.x, centerY, bandCenter.z);
    ensureAttribute(skirt, 'color', 3, [
      color.r * 0.88,
      color.g * 0.88,
      color.b * 0.88,
    ]);
    pieces.push(skirt);
  }

  const base = trunkBase(reference, fullBounds);
  const join = new THREE.Vector3(
    (fullBounds.min.x + fullBounds.max.x) * 0.5,
    crownBottom + size.y * 0.08,
    (fullBounds.min.z + fullBounds.max.z) * 0.5,
  );
  const direction = join.clone().sub(base);
  const trunkRadius = Math.max(Math.min(size.x, size.z) * 0.038, 0.04);
  const trunkSource = new THREE.CylinderGeometry(
    trunkRadius * 0.56,
    trunkRadius,
    Math.max(direction.length(), size.y * 0.2),
    6,
    1,
    true,
  );
  trunkSource.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  ));
  trunkSource.translate(
    (base.x + join.x) * 0.5,
    (base.y + join.y) * 0.5,
    (base.z + join.z) * 0.5,
  );
  ensureAttribute(trunkSource, 'uv', 2, [0, 0]);
  ensureAttribute(trunkSource, 'color', 3, [0.34, 0.24, 0.15]);
  pieces.push(trunkSource);

  // Sparse juvenile/young crowns can leave one or more sampled source bands
  // empty. Guarantee a small but useful proxy floor with narrow architecture
  // rings rather than allowing LOD2 to collapse below the tested silhouette
  // envelope.
  const sourceTriangles = () => pieces.reduce((sum, piece) => (
    sum + Math.floor((piece.index?.count ?? piece.attributes.position.count) / 3)
  ), 0);
  const minimumProxyTriangles = lifeStage === 'juvenile' ? 110 : 130;
  let supportRing = 0;
  while (sourceTriangles() < minimumProxyTriangles && supportRing < 4) {
    const fraction = 0.46 + supportRing * 0.16;
    const support = new THREE.CylinderGeometry(
      0.9,
      1,
      Math.max(size.y * 0.01, 0.015),
      6,
      1,
      true,
    );
    support.scale(
      Math.max(size.x * (0.13 - supportRing * 0.012), 0.04),
      1,
      Math.max(size.z * (0.13 - supportRing * 0.012), 0.04),
    );
    support.translate(
      (fullBounds.min.x + fullBounds.max.x) * 0.5,
      THREE.MathUtils.lerp(crownBottom, fullBounds.max.y, fraction),
      (fullBounds.min.z + fullBounds.max.z) * 0.5,
    );
    ensureAttribute(support, 'color', 3, [
      color.r * 0.86,
      color.g * 0.86,
      color.b * 0.86,
    ]);
    pieces.push(support);
    supportRing += 1;
  }

  const mergeable = pieces.map((piece) => {
    if (!piece.index) return piece;
    const nonIndexed = piece.toNonIndexed();
    piece.dispose();
    return nonIndexed;
  });
  const geometry = mergeGeometries(mergeable, false);
  mergeable.forEach((piece) => piece.dispose());
  ensureAttribute(geometry, 'toonlabPartId', 1, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'TreeWhorledConiferMidProxy';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TreeWhorledConiferMidProxyMesh';
  mesh.userData.toonlabSemanticRole = 'plant-proxy';
  mesh.userData.toonlabSemanticParts = { 0: { id: 0, semantic: 'whole-plant-proxy' } };
  root.add(mesh);
  root.userData = cloneJson(reference.userData);
  return root;
}

function createSucculentAxisProxy(reference) {
  const graph = reference.userData?.plantGraph;
  const padSegments = graph?.segments?.filter((entry) => entry.geometryKind === 'pad') ?? [];
  const shallowRootSegments = graph?.segments?.filter(
    (entry) => entry.semantic === 'shallow-root',
  ) ?? [];
  const axisKindById = new Map(
    (graph?.axes ?? []).map((entry) => [entry.id, entry.kind]),
  );
  const succulentArmAxisCount = [...axisKindById.values()]
    .filter((kind) => kind === 'succulent-arm').length;
  const sourceSegments = graph?.segments?.filter((entry) => (
    entry.semantic === 'succulent-stem'
    || entry.semantic === 'succulent-arm'
    || (
      entry.semantic === 'succulent-cork'
      && (
        axisKindById.get(entry.axisId) === 'succulent-cork-trunk'
        || axisKindById.get(entry.axisId) === 'pad-primary'
      )
    )
  )) ?? [];
  if (!sourceSegments.length && !padSegments.length) return null;
  const pieces = [];
  const up = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const segmentsByAxis = new Map();
  for (const entry of sourceSegments) {
    const entries = segmentsByAxis.get(entry.axisId) ?? [];
    entries.push(entry);
    segmentsByAxis.set(entry.axisId, entries);
  }
  const segments = [];
  for (const entries of segmentsByAxis.values()) {
    if (
      entries[0]?.semantic === 'succulent-arm'
      && entries.length >= 5
      && succulentArmAxisCount <= 3
    ) {
      // A saguaro arm is a quarter-curve, not two disconnected sticks. Keep
      // three contiguous spans so the outward reach remains visible from the
      // top/oblique QA cameras while still fitting comfortably under LOD3's
      // 140-triangle budget.
      segments.push({
        ...entries[0],
        end: entries[1].end,
        radiusEnd: entries[1].radiusEnd,
      });
      segments.push(entries[2]);
      segments.push({
        ...entries[3],
        end: entries.at(-1).end,
        radiusEnd: entries.at(-1).radiusEnd,
      });
    } else if (entries[0]?.semantic === 'succulent-arm' && entries.length >= 5) {
      // Dense old crowns spend the same fixed budget across more arms. Two
      // connected chords retain every arm's reach and upright tip without
      // dropping the six shallow roots from the semantic/top-view proxy.
      segments.push({
        ...entries[0],
        end: entries[2].end,
        radiusEnd: entries[2].radiusEnd,
      });
      segments.push({
        ...entries[3],
        end: entries.at(-1).end,
        radiusEnd: entries.at(-1).radiusEnd,
      });
    } else if (entries[0]?.semantic === 'succulent-arm' && entries.length >= 3) {
      segments.push(...entries);
    } else if (entries.length > 1) {
      segments.push({
        ...entries[0],
        end: entries.at(-1).end,
        radiusEnd: entries.at(-1).radiusEnd,
      });
    } else if (entries.length === 1) {
      segments.push(entries[0]);
    }
  }
  // These feeder roots sit below grade in the live scene, but they are still
  // part of the exported semantic plant and of the top-view silhouette gate.
  // Keep the six authored radials instead of collapsing their shared root
  // axis into one chord.
  segments.push(...shallowRootSegments);
  const terminalSegments = new Map();
  for (const entry of segments) terminalSegments.set(entry.axisId, entry.id);
  const radialSegments = segments.length > 9 ? 3 : 4;
  let graphMinimumY = Infinity;
  for (const entry of segments) {
    graphMinimumY = Math.min(graphMinimumY, entry.start[1], entry.end[1]);
    start.fromArray(entry.start);
    end.fromArray(entry.end);
    direction.copy(end).sub(start);
    const length = direction.length();
    if (length <= 1e-6) continue;
    const source = new THREE.CylinderGeometry(
      Math.max(Number(entry.radiusEnd) || 0, 0.015),
      Math.max(Number(entry.radiusStart) || 0, 0.02),
      length,
      radialSegments,
      1,
      true,
    );
    source.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      up,
      direction.normalize(),
    ));
    source.translate(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    );
    const proxyColor = entry.semantic === 'shallow-root'
      ? [0.22, 0.31, 0.16]
      : [0.32, 0.56, 0.25];
    ensureAttribute(source, 'color', 3, proxyColor);
    pieces.push(source);
    if (terminalSegments.get(entry.axisId) === entry.id) {
      const cap = new THREE.CircleGeometry(
        Math.max(Number(entry.radiusEnd) || 0, 0.015),
        radialSegments,
      );
      cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction,
      ));
      cap.translate(end.x, end.y, end.z);
      ensureAttribute(cap, 'color', 3, proxyColor);
      pieces.push(cap);
    }
  }
  for (const entry of padSegments) {
    graphMinimumY = Math.min(graphMinimumY, entry.start[1], entry.end[1]);
    start.fromArray(entry.start);
    end.fromArray(entry.end);
    direction.copy(end).sub(start);
    const length = direction.length();
    if (length <= 1e-6) continue;
    const yAxis = direction.normalize();
    const requestedNormal = Array.isArray(entry.padNormal)
      ? new THREE.Vector3(...entry.padNormal).normalize()
      : new THREE.Vector3(0, 0, 1);
    const xAxis = new THREE.Vector3().crossVectors(yAxis, requestedNormal).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const pad = new THREE.PlaneGeometry(
      Math.max((Number(entry.padWidth) || Number(entry.radiusStart) || 0.08) * 2, 0.04),
      length,
      1,
      1,
    );
    pad.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
    ));
    pad.translate(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    );
    ensureAttribute(pad, 'color', 3, [0.38, 0.56, 0.34]);
    pieces.push(pad);
  }
  if (!pieces.length) return null;
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  geometry.translate(0, Number.isFinite(graphMinimumY) ? -graphMinimumY : 0, 0);
  ensureAttribute(geometry, 'uv', 2, [0, 0]);
  ensureAttribute(geometry, 'toonlabPartId', 1, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'TreeVolumetricProxy';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TreeSucculentAxisProxyMesh';
  mesh.userData.toonlabSemanticRole = 'plant-proxy';
  mesh.userData.toonlabSemanticParts = { 0: { id: 0, semantic: 'whole-plant-proxy' } };
  root.add(mesh);
  root.userData = cloneJson(reference.userData);
  return root;
}

function createUltraFarProxy(reference) {
  const foliage = semanticChild(reference, 'organs', 'Foliage');
  reference.updateWorldMatrix(true, true);
  const fullBounds = new THREE.Box3().setFromObject(reference);
  const foliageBounds = new THREE.Box3().setFromObject(foliage ?? reference);
  const fullSize = fullBounds.getSize(new THREE.Vector3());
  const foliageSize = foliageBounds.getSize(new THREE.Vector3());
  const architecture = reference.userData?.treeRecipe?.architecture?.engine
    ?? reference.userData?.treeRecipe?.options?.canopy?.architecture;
  const engine = reference.userData?.treeRecipe?.architecture?.engine;
  if (engine === 'succulent-axis') {
    const succulentProxy = createSucculentAxisProxy(reference);
    if (succulentProxy) return succulentProxy;
  }
  const radialFronds = architecture === 'radial-fronds'
    || engine === 'terminal-crown' || engine === 'pseudostem-fan'
    || engine === 'branched-rosette';
  const needleWhorls = architecture === 'needle-whorls' || engine === 'whorled-conifer';
  const hasOrgans = Boolean(foliage?.geometry?.attributes?.position?.count);
  const terminalCrown = engine === 'terminal-crown' || engine === 'pseudostem-fan'
    || engine === 'branched-rosette';
  const culmColony = engine === 'culm-colony';
  const sparseUpperCrown = foliageSize.y / Math.max(fullSize.y, 1e-5) < 0.25;
  const wholeTreeEnvelope = !hasOrgans
    || (sparseUpperCrown && !radialFronds && !needleWhorls);
  const useUpperSkeleton = radialFronds || needleWhorls || terminalCrown
    || culmColony || sparseUpperCrown;
  const crownStart = needleWhorls || culmColony ? 0.12
    : radialFronds || terminalCrown ? 0.28 : 0.1;
  const minimumCrownY = useUpperSkeleton
    ? THREE.MathUtils.lerp(fullBounds.min.y, fullBounds.max.y, crownStart)
    : -Infinity;
  const upper = useUpperSkeleton ? upperBounds(reference, minimumCrownY) : null;
  const bounds = wholeTreeEnvelope
    ? fullBounds.clone()
    : upper && !upper.isEmpty()
      ? upper
      : new THREE.Box3().setFromObject(foliage ?? reference);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const color = averageFoliageColor(reference);
  const pieces = [createCrownEnvelopeGeometry(
    useUpperSkeleton ? reference : foliage,
    bounds,
    color,
    wholeTreeEnvelope ? -Infinity : minimumCrownY,
  )];
  // A real volumetric far tree still needs a grounded trunk. Six radial
  // segments keep the crown-plus-trunk proxy below 140 triangles, below the
  // 140-triangle contract, while retaining the upright silhouette from every
  // camera direction (a billboard cannot do this).
  if (wholeTreeEnvelope) {
    const geometry = pieces[0];
    ensureAttribute(geometry, 'toonlabPartId', 1, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    material.name = 'TreeVolumetricProxy';
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'TreeVolumetricProxyMesh';
    mesh.userData.toonlabSemanticRole = 'plant-proxy';
    mesh.userData.toonlabSemanticParts = { 0: { id: 0, semantic: 'whole-plant-proxy' } };
    root.add(mesh);
    root.userData = cloneJson(reference.userData);
    return root;
  }
  const base = trunkBase(reference, fullBounds);
  const join = new THREE.Vector3(center.x, bounds.min.y + size.y * 0.18, center.z);
  const trunkDirection = join.clone().sub(base);
  const trunkHeight = Math.max(trunkDirection.length(), size.y * 0.28);
  const trunkRadius = Math.max(Math.min(size.x, size.z) * 0.045, 0.045);
  const trunkSource = new THREE.CylinderGeometry(
    trunkRadius * 0.58,
    trunkRadius,
    trunkHeight,
    6,
    1,
    true,
  );
  trunkSource.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    trunkDirection.normalize(),
  ));
  trunkSource.translate(
    (base.x + join.x) * 0.5,
    (base.y + join.y) * 0.5,
    (base.z + join.z) * 0.5,
  );
  const trunk = trunkSource.toNonIndexed();
  trunkSource.dispose();
  ensureAttribute(trunk, 'uv', 2, [0, 0]);
  ensureAttribute(trunk, 'color', 3, [0.34, 0.24, 0.15]);
  pieces.push(trunk);
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  material.name = 'TreeVolumetricProxy';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TreeVolumetricProxyMesh';
  ensureAttribute(mesh.geometry, 'toonlabPartId', 1, 0);
  mesh.userData.toonlabSemanticRole = 'plant-proxy';
  mesh.userData.toonlabSemanticParts = { 0: { id: 0, semantic: 'whole-plant-proxy' } };
  root.add(mesh);
  root.userData = cloneJson(reference.userData);
  return root;
}

function createLowBudgetFarProxy(reference) {
  reference.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(reference);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const color = averageFoliageColor(reference);
  const radialSegments = 6;
  const rings = [
    { radius: 0.16, y: bounds.min.y },
    { radius: 0.82, y: THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, 0.34) },
    { radius: 1, y: THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, 0.72) },
    { radius: 0.12, y: bounds.max.y },
  ];
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let ring = 0; ring < rings.length; ring += 1) {
    const entry = rings[ring];
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const angle = radial / radialSegments * Math.PI * 2;
      positions.push(
        center.x + Math.cos(angle) * size.x * 0.5 * entry.radius,
        entry.y,
        center.z + Math.sin(angle) * size.z * 0.5 * entry.radius,
      );
      colors.push(color.r, color.g, color.b);
      uvs.push(radial / radialSegments, ring / (rings.length - 1));
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      const lower = ring * radialSegments + radial;
      const lowerNext = ring * radialSegments + next;
      const upper = (ring + 1) * radialSegments + radial;
      const upperNext = (ring + 1) * radialSegments + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  ensureAttribute(geometry, 'toonlabPartId', 1, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'TreeLowBudgetVolumetricProxy';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TreeLowBudgetVolumetricProxyMesh';
  mesh.userData.toonlabSemanticRole = 'plant-proxy';
  mesh.userData.toonlabSemanticParts = { 0: { id: 0, semantic: 'whole-plant-proxy' } };
  root.add(mesh);
  root.userData = cloneJson(reference.userData);
  return root;
}

function boundsForLevels(levels) {
  const box = new THREE.Box3().setFromObject(levels[0]);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    box: { min: box.min.toArray(), max: box.max.toArray() },
    center: sphere.center.toArray(),
    radius: sphere.radius,
  };
}

export function compileTreeLodLevels(recipeInput, { leafTexture = null } = {}) {
  const recipe = parseTreeRecipeDocument(recipeInput);
  const triangleCaps = TREE_LOD_ENGINE_TRIANGLE_CAPS[recipe.architecture?.engine]
    ?? TREE_LOD_TRIANGLE_CAPS;
  const ownedLeafTexture = leafTexture ?? createProceduralTreeLeafTexture({
    seed: recipe.options.seed ?? 1,
  });
  const levels = [];
  try {
    for (let level = 0; level < 3; level += 1) {
      const lodRecipe = createTreeLodRecipe(recipe, level);
      const runtimeRecipe = {
        ...lodRecipe,
        options: {
          ...lodRecipe.options,
          foliage: { ...(lodRecipe.options.foliage ?? {}), leafMap: ownedLeafTexture },
        },
      };
      const plant = createPlantFromRecipe(runtimeRecipe);
      let exported;
      try {
        const trunkTriangles = plant.trunkMesh?.geometry
          ? triangleCount(plant.trunkMesh.geometry)
          : 0;
        let foliageTriangleBudget = level === 0
          ? Infinity
          : Math.max(0, triangleCaps[level] - trunkTriangles);
        if (
          level === 1
          && recipe.architecture?.engine === 'whorled-conifer'
          && levels[0]
        ) {
          const closeTarget = Math.min(
            triangleCaps[level],
            Math.floor(rootTriangles(levels[0]) * 0.68),
          );
          foliageTriangleBudget = Math.max(0, closeTarget - trunkTriangles);
        }
        exported = prepareTreeForExport(plant, {
          // LOD1 keeps the exact authored crossed-card crown. LOD2 retains
          // every card center but converts most pairs to one plane, with a
          // distributed crossed subset for view robustness. Hard caps still
          // invoke nested card thinning on exceptionally dense trees.
          foliageMode: level < 2 ? 'crossed' : 'hybrid',
          foliageCardRetention: LOD_FOLIAGE_RETENTION[level],
          foliageCardScale: foliageScaleFor(recipe.architecture?.engine, level),
          // LOD0 remains the exact authored high-detail source. Lower levels
          // distribute their leaf-card budget after the continuous bark mesh
          // has been accounted for, so neither can exceed its contract merely
          // because a species has an unusually complex skeleton.
          foliageTriangleBudget,
        });
      } finally {
        plant.dispose();
      }
      if (level === 2) {
        const combined = recipe.architecture?.engine === 'whorled-conifer'
          // Derive the compact support hull from LOD1 before needle-card
          // thinning removes sparse branch-tip extrema. The proxy itself is
          // still the only geometry exported at LOD2.
          ? createWhorledConiferMidProxy(levels[1])
          : combinedSingleMaterialLevel(exported);
        if (!combined) throw new Error('Unable to create the conifer LOD2 proxy.');
        disposeExportGroup(exported);
        exported = combined;
      }
      groundTreeLevel(exported);
      exported.name = `Tree_LOD${level}`;
      levels.push(exported);
    }
    // LOD2 is deliberately merged to one material, so retain LOD1's named
    // trunk/foliage separation while constructing the silhouette envelope.
    let far = createUltraFarProxy(levels[1]);
    if (rootTriangles(far) >= rootTriangles(levels[2])) {
      disposeExportGroup(far);
      far = createLowBudgetFarProxy(levels[1]);
    }
    far.name = 'Tree_LOD3';
    levels.push(far);
    const report = levels.map((root, level) => ({
      level,
      materials: rootMaterialCount(root),
      minScreenCoverage: TREE_LOD_SCREEN_COVERAGE[level],
      node: root.name,
      triangleCap: triangleCaps[level],
      triangles: rootTriangles(root),
    }));
    const valid = report.every((entry) => entry.triangles <= entry.triangleCap)
      && report[0].materials <= 2 && report[1].materials <= 2
      && report[2].materials === 1 && report[3].materials === 1;
    return {
      levels,
      leafTexture: ownedLeafTexture,
      ownsLeafTexture: !leafTexture,
      report: { valid, levels: report },
      manifestBase: {
        schema: COMPILED_TREE_MANIFEST_SCHEMA,
        version: COMPILED_TREE_MANIFEST_VERSION,
        bounds: boundsForLevels(levels),
        lods: report,
        surfaceLooks: cloneJson(recipe.surfaceLooks ?? []),
      },
      dispose() {
        levels.forEach((root) => disposeExportGroup(root));
        if (!leafTexture) ownedLeafTexture.dispose();
      },
    };
  } catch (error) {
    levels.forEach((root) => disposeExportGroup(root));
    if (!leafTexture) ownedLeafTexture.dispose();
    throw error;
  }
}

export function createCompiledTreeScene(compilation, { styleTarget = {} } = {}) {
  const scene = new THREE.Group();
  scene.name = 'ToonLabCompiledTree';
  compilation.levels.forEach((level) => scene.add(level));
  scene.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => markFactoryStyleMaterial(
      material,
      'CompiledTreeArtifactSurface',
    ));
  });
  attachFactoryStyleTarget(scene, 'vegetation.tree', {
    targetId: 'toonlab/compiled-tree-artifact',
    ...styleTarget,
    materials: {
      assignments: {
        CompiledTreeArtifactSurface: {
          exemptionId: 'CompiledTreeArtifactSingleRole',
          roles: ['foliageCard', 'woodySurface'],
        },
      },
      exemptions: {
        CompiledTreeArtifactSingleRole: {
          approved: true,
          fallbackRole: 'foliageCard',
          reason: 'The export artifact contains merged proxy LODs whose foliage is the safe fallback treatment.',
          strategy: 'single-role',
        },
      },
      ...(styleTarget.materials ?? {}),
    },
  });
  return scene;
}
