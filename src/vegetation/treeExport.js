import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLB-export baking for stylized trees/bushes: the runtime canopy is a
// billboard quad soup driven by a ShaderMaterial (wind, toon ramp, backlit),
// none of which glTF can carry. prepareTreeForExport() converts a live plant
// into a plain-material THREE.Group any engine can import:
//
//   - Foliage cards become STATIC quads oriented by each card's baked
//     shading normal ('normal' mode) or crossed quad pairs ('crossed',
//     default — view-robust from every angle at 2× the triangles).
//   - Every vertex keeps aShadeNormal as its normal, so the imported mesh
//     still lights as one soft volume — the core of the stylized look.
//   - The three-tone palette is baked into vertex colors exactly as the leaf
//     fragment shader computes it under the plant's current sun.
//   - Wind does not survive (it lives in the vertex shader): exports are
//     static meshes, like every tree-tool GLB.
//
// The group also carries the plant's recipe in userData.treeRecipe, which
// GLTFExporter serializes into glTF `extras` — a GLB can always be traced
// back to (and regenerated from) its recipe.

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Expand the canopy quad soup (4 verts/card: position = center, aCorner,
// aShadeNormal, aInfo = [worldSize, phase, tint, heightT]) into static quads.
//   matrix — applied to card centers (canopy-local → export space). Card
//            extents deliberately are NOT scaled: aInfo.x is world size, the
//            same convention the billboard shader uses.
export function bakeFoliageGeometry(canopyGeometry, {
  mode = 'crossed',
  palette,
  sunDirection = [0.35, 0.72, 0.42],
  sunColor = [1.0, 0.96, 0.84],
  matrix = null,
  cardRetention = 1,
  cardScale = 1,
  triangleBudget = Infinity,
} = {}) {
  const positions = canopyGeometry.attributes.position;
  const shadeNormals = canopyGeometry.attributes.aShadeNormal;
  const infos = canopyGeometry.attributes.aInfo;
  const cardShapes = canopyGeometry.attributes.aCardShape;
  const cardFrames = canopyGeometry.attributes.aCardFrame;
  const attachmentIds = canopyGeometry.attributes.aAttachment;
  const sourcePartIds = canopyGeometry.attributes.toonlabPartId;
  const sourceCardCount = Math.floor(positions.count / 4);
  const allCardsWorldOriented = Boolean(cardFrames) && Array.from(
    { length: sourceCardCount },
    (_, card) => (cardFrames.getW(card * 4) ?? 0) >= 0.5,
  ).every(Boolean);
  const requestedCardCount = Math.min(
    sourceCardCount,
    Math.max(0, Math.round(sourceCardCount * THREE.MathUtils.clamp(cardRetention, 0, 1))),
  );
  const trianglesForCards = (count) => {
    // Authored frond, bamboo, and other organ blades are already fixed in
    // world space and bake to one quad regardless of billboard mode. Charging
    // them as crossed pairs discards half the usable leaves before the actual
    // card builder correctly emits one quad each.
    if (allCardsWorldOriented) return count * 2;
    if (mode === 'crossed') return count * 4;
    if (mode === 'hybrid') return (count + Math.round(count * 0.3)) * 2;
    return count * 2;
  };
  let budgetCardCount = requestedCardCount;
  if (Number.isFinite(triangleBudget)) {
    const budget = Math.max(0, Math.floor(triangleBudget));
    while (budgetCardCount > 0 && trianglesForCards(budgetCardCount) > budget) {
      budgetCardCount -= 1;
    }
  }

  // Source cards are grouped by branch attachment. Sampling only the global
  // array can empty short tufts, so reserve one representative from every
  // authored attachment first. Every later choice uses a target-independent
  // stable priority. This makes a smaller LOD's foliage a true subset of the
  // preceding LOD instead of selecting a different crown and visibly popping.
  const selectedCards = new Set();
  const stablePriority = (card) => {
    // Bit reversal produces a nested low-discrepancy order over the authored
    // card stream: 0, midpoint, quarter points, eighth points... A prefix is
    // therefore distributed across the complete crown instead of forming the
    // random holes that a hash-ranked subset can leave in silhouette views.
    let value = card >>> 0;
    value = ((value >>> 1) & 0x55555555) | ((value & 0x55555555) << 1);
    value = ((value >>> 2) & 0x33333333) | ((value & 0x33333333) << 2);
    value = ((value >>> 4) & 0x0f0f0f0f) | ((value & 0x0f0f0f0f) << 4);
    value = ((value >>> 8) & 0x00ff00ff) | ((value & 0x00ff00ff) << 8);
    return (((value >>> 16) | (value << 16)) >>> 0);
  };
  const stableOrder = (indices) => [...indices].sort((left, right) =>
    stablePriority(left) - stablePriority(right) || left - right);
  const addUntilFull = (indices) => {
    for (const card of indices) {
      if (selectedCards.size >= budgetCardCount) break;
      selectedCards.add(card);
    }
  };
  if (budgetCardCount >= sourceCardCount) {
    for (let card = 0; card < sourceCardCount; card += 1) selectedCards.add(card);
  } else if (budgetCardCount > 0) {
    const groups = new Map();
    if (attachmentIds) {
      for (let card = 0; card < sourceCardCount; card += 1) {
        const attachment = Math.round(attachmentIds.getX(card * 4));
        if (attachment < 0) continue;
        const entries = groups.get(attachment) ?? [];
        entries.push(card);
        groups.set(attachment, entries);
      }
    }
    const groupEntries = [...groups.entries()].sort((left, right) => left[0] - right[0]);
    const groupRepresentatives = groupEntries.map(([, indices]) =>
      indices[Math.floor(indices.length / 2)]);
    addUntilFull(stableOrder(groupRepresentatives));

    // Keep fixed directional extrema so front/side/top silhouettes do not
    // shrink inward. The order is fixed, preserving the nested-subset rule
    // even when an unusually small budget cannot retain every extreme.
    const directions = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
      [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
    ];
    for (const direction of directions) {
      if (selectedCards.size >= budgetCardCount) break;
      let bestCard = 0;
      let bestScore = -Infinity;
      for (let card = 0; card < sourceCardCount; card += 1) {
        const base = card * 4;
        const score = positions.getX(base) * direction[0]
          + positions.getY(base) * direction[1]
          + positions.getZ(base) * direction[2]
          + infos.getX(base) * 0.5;
        if (score > bestScore) {
          bestCard = card;
          bestScore = score;
        }
      }
      selectedCards.add(bestCard);
    }

    const allCards = Array.from({ length: sourceCardCount }, (_, card) => card);
    addUntilFull(stableOrder(allCards));
  }
  const retainedCards = [...selectedCards].sort((left, right) => left - right)
    .slice(0, budgetCardCount);
  const cardCount = retainedCards.length;
  const budgetScaleCompensation = cardCount > 0
    ? Math.sqrt(Math.max(requestedCardCount, 1) / cardCount)
    : 1;
  const resolvedCardScale = Math.max(0.01, cardScale)
    * Math.min(1.24, budgetScaleCompensation);
  const hybridCrossedCount = mode === 'hybrid' ? Math.round(cardCount * 0.3) : 0;
  const cardQuadCounts = retainedCards.map((card, retainedCard) => {
    if ((cardFrames?.getW(card * 4) ?? 0) >= 0.5) return 1;
    const hybridCrossed = mode === 'hybrid'
      && Math.floor((retainedCard + 1) * hybridCrossedCount / Math.max(cardCount, 1))
        > Math.floor(retainedCard * hybridCrossedCount / Math.max(cardCount, 1));
    return mode === 'crossed' || hybridCrossed ? 2 : 1;
  });
  const quadCount = cardQuadCounts.reduce((total, count) => total + count, 0);

  const outPositions = new Float32Array(quadCount * 4 * 3);
  const outNormals = new Float32Array(quadCount * 4 * 3);
  const outUvs = new Float32Array(quadCount * 4 * 2);
  const outColors = new Float32Array(quadCount * 4 * 3);
  const outIndices = new Uint32Array(quadCount * 6);
  const outPartIds = sourcePartIds ? new Float32Array(quadCount * 4) : null;

  const cornerOffsets = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const cornerUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];

  const worldUp = new THREE.Vector3(0, 1, 0);
  const sun = new THREE.Vector3(...sunDirection).normalize();
  const sunTint = new THREE.Color(...sunColor);
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rolledRight = new THREE.Vector3();
  const rolledUp = new THREE.Vector3();
  const quadRight = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const color = new THREE.Color();

  let quadIndex = 0;
  for (let retainedCard = 0; retainedCard < cardCount; retainedCard += 1) {
    const card = retainedCards[retainedCard];
    const worldOriented = (cardFrames?.getW(card * 4) ?? 0) >= 0.5;
    const quadsPerCard = cardQuadCounts[retainedCard];
    const base = card * 4;
    center.fromBufferAttribute(positions, base);
    if (matrix) center.applyMatrix4(matrix);
    normal.fromBufferAttribute(shadeNormals, base).normalize();
    const size = infos.getX(base) * resolvedCardScale;
    const phase = infos.getY(base);
    const tint = infos.getZ(base);
    const heightT = infos.getW(base);

    if (worldOriented && cardFrames) {
      rolledUp.fromBufferAttribute(cardFrames, base);
      if (matrix) {
        rolledUp.transformDirection(matrix);
      }
      rolledUp.normalize();
      rolledRight.crossVectors(rolledUp, normal).normalize();
    } else {
      // Stable tangent frame from the shading normal; the fallback covers
      // straight-up/down normals where the up-cross degenerates.
      right.crossVectors(worldUp, normal);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(normal, right);

      // Keep each card's static roll (aInfo.y drives it in the shader too) so
      // the baked crown keeps its shimmered variety instead of gridded quads.
      const roll = phase * Math.PI * 2;
      const rollCos = Math.cos(roll);
      const rollSin = Math.sin(roll);
      rolledRight.copy(right).multiplyScalar(rollCos).addScaledVector(up, rollSin);
      rolledUp.copy(up).multiplyScalar(rollCos).addScaledVector(right, -rollSin);
    }

    // Vertex color = the leaf fragment shader's palette math under this sun
    // (treeLeaf.frag.glsl): two-band wrap ramp + height-gated crown crest +
    // per-card tint jitter. Sprite luminance multiplies at render via `map`;
    // view-dependent terms (rim, backlit, sky fill) can't bake.
    const wrap = normal.dot(sun) * 0.5 + 0.5;
    const litBand = smoothstep(0.38, 0.56, wrap);
    const crestBand = smoothstep(0.66, 0.78, wrap) *
      smoothstep(0.3, 0.8, heightT * (0.7 + 0.3 * (normal.y * 0.5 + 0.5)));
    color.copy(palette.shadow).lerp(palette.lit, litBand);
    color.lerp(palette.crown, crestBand);
    color.r *= THREE.MathUtils.lerp(1, sunTint.r, litBand * 0.35);
    color.g *= THREE.MathUtils.lerp(1, sunTint.g, litBand * 0.35);
    color.b *= THREE.MathUtils.lerp(1, sunTint.b, litBand * 0.35);
    color.multiplyScalar(0.92 + tint * 0.16);

    for (let quad = 0; quad < quadsPerCard; quad += 1) {
      if (quad === 0) {
        quadRight.copy(rolledRight);
      } else {
        // Second quad: the card plane rotated 90° around its up axis, so the
        // pair reads solid from every heading.
        quadRight.crossVectors(rolledUp, rolledRight);
      }
      for (let corner = 0; corner < 4; corner += 1) {
        const out = (quadIndex * 4 + corner) * 3;
        const shapeX = cardShapes?.getX(base) ?? 1;
        const shapeY = cardShapes?.getY(base) ?? 1;
        vertex.copy(center)
          .addScaledVector(quadRight, cornerOffsets[corner][0] * size * shapeX)
          .addScaledVector(rolledUp, cornerOffsets[corner][1] * size * shapeY);
        outPositions[out] = vertex.x;
        outPositions[out + 1] = vertex.y;
        outPositions[out + 2] = vertex.z;
        outNormals[out] = normal.x;
        outNormals[out + 1] = normal.y;
        outNormals[out + 2] = normal.z;
        outColors[out] = color.r;
        outColors[out + 1] = color.g;
        outColors[out + 2] = color.b;
        if (outPartIds) outPartIds[quadIndex * 4 + corner] = sourcePartIds.getX(base);
        const uvOut = (quadIndex * 4 + corner) * 2;
        outUvs[uvOut] = cornerUvs[corner][0];
        outUvs[uvOut + 1] = cornerUvs[corner][1];
      }
      const vertexBase = quadIndex * 4;
      outIndices.set([
        vertexBase, vertexBase + 1, vertexBase + 2,
        vertexBase, vertexBase + 2, vertexBase + 3,
      ], quadIndex * 6);
      quadIndex += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(outIndices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(outPositions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(outUvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(outColors, 3));
  if (outPartIds) {
    geometry.setAttribute('toonlabPartId', new THREE.BufferAttribute(outPartIds, 1));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

// Export copy of the leaf sprite with the fragment shader's luminance remap
// (color *= 0.78 + sprite.r * 0.36) baked into the pixels: a standard
// material multiplies the RAW map, which reads ~25% darker than the shader.
// The 1.14 ceiling clamps — the lost top sliver is invisible in practice.
export function createBakedLeafTexture(sourceTexture) {
  const image = sourceTexture?.image;
  if (!image) return sourceTexture;
  if (sourceTexture.isDataTexture && image.data) {
    const data = new Uint8Array(image.data);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, 0.78 * 255 + data[i] * 0.36);
      data[i + 1] = Math.min(255, 0.78 * 255 + data[i + 1] * 0.36);
      data[i + 2] = Math.min(255, 0.78 * 255 + data[i + 2] * 0.36);
    }
    const texture = new THREE.DataTexture(
      data, image.width, image.height, sourceTexture.format, sourceTexture.type,
    );
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    texture.userData.bakedLeafTexture = true;
    return texture;
  }
  if (typeof document === 'undefined') return sourceTexture;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, 0.78 * 255 + data[i] * 0.36);
    data[i + 1] = Math.min(255, 0.78 * 255 + data[i + 1] * 0.36);
    data[i + 2] = Math.min(255, 0.78 * 255 + data[i + 2] * 0.36);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = sourceTexture.anisotropy ?? 4;
  // Owned by the export group; disposeExportGroup frees it (shared source
  // textures like the bark map are left alone).
  texture.userData.bakedLeafTexture = true;
  return texture;
}

// Standard-material counterpart of the leaf shader: the (remapped) sprite RGB
// carries per-leaf luminance, so map × vertex color approximates the shader's
// palette-times-sprite shading. alphaTest exports as glTF MASK/alphaCutoff.
export function createBakedFoliageMaterial({ leafMap = null, alphaTest = 0.3 } = {}) {
  return new THREE.MeshStandardMaterial({
    name: 'BakedFoliage',
    map: leafMap ? createBakedLeafTexture(leafMap) : null,
    color: 0xffffff,
    vertexColors: true,
    alphaTest,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
}

// Live plant (StylizedTree | StylizedBush | StylizedFlower) → export-ready group with plain
// materials, world scale baked into the vertices (identity transforms), and
// the recipe attached as userData.treeRecipe (→ glTF extras).
export function prepareTreeForExport(plant, {
  foliageMode = 'crossed',
  foliageCardRetention = 1,
  foliageCardScale = 1,
  foliageTriangleBudget = Infinity,
} = {}) {
  const group = new THREE.Group();
  group.name = plant.name || 'StylizedPlant';
  const size = plant.scale.x;

  if (plant.trunkMesh) {
    const trunkGeometry = plant.trunkMesh.geometry.clone()
      .applyMatrix4(new THREE.Matrix4().makeScale(size, size, size));
    const source = plant.trunkMesh.material;
    const trunkMaterial = new THREE.MeshStandardMaterial({
      name: 'BakedBark',
      color: source.color?.clone() ?? new THREE.Color(0xc9ab8a),
      map: source.map ?? null,
      roughness: 1,
      metalness: 0,
      vertexColors: Boolean(trunkGeometry.getAttribute('color'))
        && !source.userData?.treeSurfaceTextureOwnsColor,
    });
    trunkMaterial.userData.treeSurfaceProfileId = source.userData?.treeSurfaceProfileId ?? null;
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.name = 'Trunk';
    trunk.userData.toonlabSemanticRole = 'structure';
    if (plant.trunkMesh.userData.toonlabSemanticParts) {
      trunk.userData.toonlabSemanticParts = plant.trunkMesh.userData.toonlabSemanticParts;
    }
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
  }

  const canopyMesh = plant.canopyMesh;
  let canopyMatrix = new THREE.Matrix4();
  if (
    !plant.userData.curvePreviewOnly
    && canopyMesh?.geometry.getAttribute('position')?.count
  ) {
    const uniforms = canopyMesh.material.uniforms;
    // Canopy-local point → plant-root space: scale by (size × canopyScale)
    // around the anchor. Card extents stay world-sized (see bakeFoliageGeometry).
    canopyMatrix = new THREE.Matrix4().compose(
      canopyMesh.position.clone().multiplyScalar(size),
      new THREE.Quaternion(),
      new THREE.Vector3().setScalar(size * canopyMesh.scale.x),
    );
    const foliageGeometry = bakeFoliageGeometry(canopyMesh.geometry, {
      mode: foliageMode,
      palette: {
        lit: uniforms.uLitColor.value,
        shadow: uniforms.uShadowColor.value,
        crown: uniforms.uCrownColor.value,
      },
      sunDirection: uniforms.uSunDirection.value.toArray(),
      sunColor: uniforms.uSunColor.value.toArray(),
      matrix: canopyMatrix,
      cardRetention: foliageCardRetention,
      cardScale: foliageCardScale,
      triangleBudget: foliageTriangleBudget,
    });
    const foliage = new THREE.Mesh(foliageGeometry, createBakedFoliageMaterial({
      leafMap: uniforms.uLeafMap.value,
      alphaTest: uniforms.uAlphaCutoff.value,
    }));
    foliage.name = 'Foliage';
    foliage.userData.toonlabSemanticRole = 'organs';
    if (canopyMesh.userData.toonlabSemanticParts) {
      foliage.userData.toonlabSemanticParts = canopyMesh.userData.toonlabSemanticParts;
    }
    foliage.castShadow = true;
    group.add(foliage);
  }

  if (
    !plant.userData.curvePreviewOnly
    && plant.reproductiveMesh?.geometry.getAttribute('position')?.count
  ) {
    const reproductiveGeometry = plant.reproductiveMesh.geometry.clone()
      .applyMatrix4(new THREE.Matrix4().makeScale(size, size, size));
    const reproductiveMaterial = new THREE.MeshStandardMaterial({
      name: 'BakedReproductiveOrgans',
      color: 0xffffff,
      metalness: 0,
      roughness: 0.72,
      side: THREE.DoubleSide,
      vertexColors: Boolean(reproductiveGeometry.getAttribute('color')),
    });
    const reproductive = new THREE.Mesh(
      reproductiveGeometry,
      reproductiveMaterial,
    );
    reproductive.name = 'ReproductiveOrgans';
    reproductive.userData.toonlabSemanticRole = 'reproductive-organs';
    if (plant.reproductiveMesh.userData.toonlabSemanticParts) {
      reproductive.userData.toonlabSemanticParts =
        plant.reproductiveMesh.userData.toonlabSemanticParts;
    }
    reproductive.castShadow = true;
    group.add(reproductive);
  }

  // Flower plants: bake the instanced 3D bloom meshes (vertex-colored
  // petals, canopy-local matrices) into one static mesh so blooms survive
  // the GLB.
  if (plant.headsMesh) {
    const headsMesh = plant.headsMesh;
    const instanceMatrix = new THREE.Matrix4();
    const pieces = [];
    for (let i = 0; i < headsMesh.count; i += 1) {
      headsMesh.getMatrixAt(i, instanceMatrix);
      pieces.push(headsMesh.geometry.clone()
        .applyMatrix4(instanceMatrix)
        .applyMatrix4(canopyMatrix));
    }
    if (pieces.length) {
      const headMaterial = new THREE.MeshStandardMaterial({
        name: 'BakedBlooms',
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      });
      const blooms = new THREE.Mesh(mergeGeometries(pieces), headMaterial);
      pieces.forEach((piece) => piece.dispose());
      blooms.name = 'Blooms';
      blooms.castShadow = true;
      group.add(blooms);
    }
  }

  if (typeof plant.toJSON === 'function') {
    group.userData.treeRecipe = plant.toJSON();
  }
  if (plant.plantGraph) {
    group.userData.plantGraph = plant.plantGraph;
    group.userData.structuralHash = plant.plantGraph.structuralHash;
  }
  return group;
}

// Free everything prepareTreeForExport allocated (baked geometry + materials;
// shared textures are left alone).
export function disposeExportGroup(group) {
  group.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose();
      if (node.material.map?.userData?.bakedLeafTexture) node.material.map.dispose();
      node.material.dispose();
    }
  });
}


