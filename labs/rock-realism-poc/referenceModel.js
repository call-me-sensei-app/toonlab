/* Vibe3D reference pipeline at revision 10bba5dbb0dcac855fbbeb112c1804c5999ca120, bundled with local artifact URLs and evaluation exports for a repository-only MIT experiment; see THIRD_PARTY_NOTICES.md. */

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/model.ts
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture as DataTexture2,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LinearFilter as LinearFilter2,
  LinearMipmapLinearFilter as LinearMipmapLinearFilter2,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace as NoColorSpace2,
  PerspectiveCamera,
  PlaneGeometry,
  RGFormat,
  RGBAFormat as RGBAFormat2,
  Scene,
  UnsignedByteType as UnsignedByteType2,
  Vector3
} from "three/webgpu";
import {
  cameraViewMatrix as cameraViewMatrix2,
  clamp,
  color,
  hash,
  mix,
  mx_noise_float,
  mx_noise_vec3,
  mx_worley_noise_vec2,
  normalLocal,
  normalWorldGeometry,
  normalize as tslNormalize2,
  oneMinus,
  positionWorld as positionWorld2,
  smoothstep as smoothstep2,
  texture as texture2,
  transformNormalToView,
  uniform,
  uv,
  varying,
  vec2 as vec22,
  vec3 as vec32,
  vec4 as vec42,
  viewportCoordinate
} from "three/tsl";

// .local-reference/vibe3d/packages/terrain/src/index.ts
var COMPILED_TOPOLOGY_FORMAT = "vibe3d-topology@1";
var COMPILED_SURFACE_BAKE_FORMAT = "vibe3d-surface-bake@1";
function validateCompiledSurfaceBake(bake) {
  const errors = [];
  if (bake.format !== COMPILED_SURFACE_BAKE_FORMAT) errors.push(`Unsupported surface bake format: ${bake.format}`);
  if (!["uv-atlas", "equirectangular", "triplanar"].includes(bake.domain)) {
    errors.push(`Unsupported surface bake domain: ${bake.domain}`);
  }
  if (!Number.isInteger(bake.width) || bake.width < 1 || !Number.isInteger(bake.height) || bake.height < 1) {
    errors.push("surface bake dimensions must be positive integers");
  }
  for (const [label, value] of Object.entries({
    assetId: bake.assetId,
    topologyKey: bake.topologyKey,
    recipeHash: bake.recipeHash,
    compilerHash: bake.compilerHash,
    profile: bake.profile
  })) {
    if (!value) errors.push(`${label} must not be empty`);
  }
  if (bake.channels.length === 0) errors.push("surface bake must contain at least one channel");
  const semantics = /* @__PURE__ */ new Set();
  for (const channel of bake.channels) {
    if (semantics.has(channel.semantic)) errors.push(`surface bake repeats channel: ${channel.semantic}`);
    semantics.add(channel.semantic);
    if (![1, 2, 3, 4].includes(channel.components)) errors.push(`${channel.semantic} has invalid component count`);
    if (!["unorm8", "snorm8"].includes(channel.encoding)) errors.push(`${channel.semantic} has invalid encoding`);
    if (channel.scale !== void 0 && !Number.isFinite(channel.scale)) errors.push(`${channel.semantic} has invalid scale`);
    if (channel.bias !== void 0 && !Number.isFinite(channel.bias)) errors.push(`${channel.semantic} has invalid bias`);
    const expected = bake.width * bake.height * channel.components;
    if (channel.data.length !== expected) {
      errors.push(`${channel.semantic} contains ${channel.data.length} bytes; expected ${expected}`);
    }
  }
  return { valid: errors.length === 0, errors, texelCount: bake.width * bake.height };
}
function assertCompiledSurfaceBake(bake) {
  const result = validateCompiledSurfaceBake(bake);
  if (!result.valid) throw new Error(`Compiled surface bake is invalid:
- ${result.errors.join("\n- ")}`);
}
var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();
function fromBase64(text, label) {
  const clean = text.endsWith("==") ? text.slice(0, -2) : text.endsWith("=") ? text.slice(0, -1) : text;
  const padding = text.length - clean.length;
  if (text.length % 4 !== 0) throw new Error(`${label} is not valid base64`);
  const output = new Uint8Array(text.length / 4 * 3 - padding);
  let cursor = 0;
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const code = clean.charCodeAt(index);
    const value = code < 128 ? BASE64_LOOKUP[code] : -1;
    if (value < 0) throw new Error(`${label} is not valid base64`);
    accumulator = accumulator << 6 | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[cursor] = accumulator >> bits & 255;
      cursor += 1;
    }
  }
  return output;
}
var CompiledTopologyValidationError = class extends Error {
  errors;
  constructor(errors) {
    super(`Compiled topology is not game ready:
- ${errors.join("\n- ")}`);
    this.name = "CompiledTopologyValidationError";
    this.errors = errors;
  }
};
function validateIndices(label, indices, vertexCount, errors) {
  if (indices.length === 0 || indices.length % 3 !== 0) {
    errors.push(`${label} must contain a non-empty triangle index buffer`);
    return;
  }
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      errors.push(`${label} triangle ${index / 3} references a missing vertex`);
      return;
    }
    if (a === b || b === c || a === c) {
      errors.push(`${label} triangle ${index / 3} repeats a vertex`);
      return;
    }
  }
}
function triangleAreaSquared(domain, a, b, c) {
  const ax = domain[a * 3];
  const ay = domain[a * 3 + 1];
  const az = domain[a * 3 + 2];
  const abx = domain[b * 3] - ax;
  const aby = domain[b * 3 + 1] - ay;
  const abz = domain[b * 3 + 2] - az;
  const acx = domain[c * 3] - ax;
  const acy = domain[c * 3 + 1] - ay;
  const acz = domain[c * 3 + 2] - az;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  return (x * x + y * y + z * z) * 0.25;
}
function validateCompiledTopology(topology) {
  const errors = [];
  const allowedKeys = /* @__PURE__ */ new Set([
    "format",
    "assetId",
    "topologyKey",
    "recipeHash",
    "compilerHash",
    "profile",
    "strategy",
    "domainCoordinates",
    "fieldSamples",
    "indices",
    "stableVertexIds",
    "adjacency",
    "bakeUvs",
    "lods",
    "collisionIndices",
    "claims"
  ]);
  for (const key of Object.keys(topology)) {
    if (!allowedKeys.has(key)) errors.push(`compiled topology contains forbidden field: ${key}`);
  }
  const vertexCount = topology.domainCoordinates.length / 3;
  const triangleCount = topology.indices.length / 3;
  if (topology.format !== COMPILED_TOPOLOGY_FORMAT) errors.push(`Unsupported format: ${topology.format}`);
  if (![
    "deformable-shell",
    "heightfield-patch",
    "chunked-dual-contour",
    "swept-volume",
    "instanced-scatter"
  ].includes(topology.strategy)) errors.push(`Unsupported topology strategy: ${topology.strategy}`);
  for (const [label, value] of Object.entries({
    assetId: topology.assetId,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    profile: topology.profile
  })) {
    if (!value) errors.push(`${label} must not be empty`);
  }
  if (!Number.isInteger(vertexCount) || vertexCount < 3) {
    errors.push("domainCoordinates must contain at least three XYZ vertices");
  }
  for (const value of topology.domainCoordinates) {
    if (!Number.isFinite(value)) {
      errors.push("domainCoordinates contains a non-finite value");
      break;
    }
    if (value < -1 || value > 1) {
      errors.push("domainCoordinates must stay inside the normalized [-1, 1] domain");
      break;
    }
  }
  if (topology.fieldSamples) {
    if (topology.fieldSamples.length === 0) errors.push("fieldSamples must not be empty when present");
    for (const value of topology.fieldSamples) {
      if (!Number.isFinite(value)) {
        errors.push("fieldSamples contains a non-finite value");
        break;
      }
    }
  }
  if (topology.stableVertexIds.length !== vertexCount) {
    errors.push("stableVertexIds must contain one ID per vertex");
  } else if (new Set(topology.stableVertexIds).size !== topology.stableVertexIds.length) {
    errors.push("stableVertexIds must be unique");
  }
  if (topology.bakeUvs) {
    if (topology.bakeUvs.length !== vertexCount * 2) {
      errors.push("bakeUvs must contain one UV pair per vertex");
    } else {
      for (const value of topology.bakeUvs) {
        if (!Number.isFinite(value)) {
          errors.push("bakeUvs contains a non-finite value");
          break;
        }
        if (value < 0 || value > 1) {
          errors.push("bakeUvs must stay inside the [0, 1] atlas domain");
          break;
        }
      }
    }
  }
  validateIndices("indices", topology.indices, vertexCount, errors);
  validateIndices("collisionIndices", topology.collisionIndices, vertexCount, errors);
  const lodLevels = /* @__PURE__ */ new Set();
  if (topology.lods.length === 0) errors.push("at least one game-ready LOD is required");
  for (const lod of topology.lods) {
    if (!Number.isInteger(lod.level) || lod.level < 1 || lodLevels.has(lod.level)) {
      errors.push("LOD levels must be unique positive integers");
    }
    lodLevels.add(lod.level);
    if (!Number.isFinite(lod.maxGeometricError) || lod.maxGeometricError < 0) {
      errors.push(`LOD ${lod.level} has an invalid geometric error`);
    }
    validateIndices(`LOD ${lod.level}`, lod.indices, vertexCount, errors);
  }
  if (topology.adjacency && topology.adjacency.length !== topology.indices.length) {
    errors.push("adjacency must contain one neighbor per triangle edge");
  } else if (topology.adjacency) {
    for (const neighbor of topology.adjacency) {
      if (neighbor < -1 || neighbor >= triangleCount) {
        errors.push("adjacency references a missing triangle");
        break;
      }
    }
  }
  const claims = topology.claims;
  if (!["closed", "declared-open", "chunk-stitched"].includes(claims.boundaryMode)) {
    errors.push(`Unsupported boundary mode: ${claims.boundaryMode}`);
  }
  if (!claims.manifold) errors.push("topology is not declared manifold");
  if (!claims.consistentWinding) errors.push("topology winding is not validated");
  if (!claims.lodTransitionsValidated) errors.push("LOD transitions are not validated");
  if (!claims.collisionValidated) errors.push("collision topology is not validated");
  if (!Number.isInteger(claims.deformationValidatedSeeds) || claims.deformationValidatedSeeds < 1) {
    errors.push("the deformation envelope must be tested against at least one seed");
  }
  if (!Number.isFinite(claims.maximumDisplacement) || claims.maximumDisplacement < 0) {
    errors.push("maximumDisplacement must be finite and non-negative");
  }
  if (!Number.isFinite(claims.minimumDomainTriangleArea) || claims.minimumDomainTriangleArea <= 0) {
    errors.push("minimumDomainTriangleArea must be finite and positive");
  } else if (topology.indices.length % 3 === 0 && Number.isInteger(vertexCount)) {
    const minimumSquared = claims.minimumDomainTriangleArea ** 2;
    for (let index = 0; index < topology.indices.length; index += 3) {
      if (triangleAreaSquared(
        topology.domainCoordinates,
        topology.indices[index],
        topology.indices[index + 1],
        topology.indices[index + 2]
      ) < minimumSquared) {
        errors.push(`domain triangle ${index / 3} is below minimumDomainTriangleArea`);
        break;
      }
    }
  }
  return { valid: errors.length === 0, errors, vertexCount, triangleCount };
}
function assertCompiledTopology(topology) {
  const result = validateCompiledTopology(topology);
  if (!result.valid) throw new CompiledTopologyValidationError(result.errors);
}
function decodeIndices(value, width, label) {
  if (typeof value === "string" && width === 16) {
    const raw = fromBase64(value, label);
    if (raw.byteLength % 2 !== 0) throw new Error(`${label} length is not a multiple of 2 bytes`);
    return new Uint32Array(new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2));
  }
  return decodeUnsigned(value, label);
}
var QUANTIZED_SCALE = 65535;
function dequantize(value, low, high, label) {
  if (typeof value !== "string") return new Float32Array(finiteNumbers(value, label));
  const raw = fromBase64(value, label);
  if (raw.byteLength % 2 !== 0) throw new Error(`${label} length is not a multiple of 2 bytes`);
  const source = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const span = high - low;
  const output = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    output[index] = low + source[index] / QUANTIZED_SCALE * span;
  }
  return output;
}
function decodeFloats(value, label) {
  if (typeof value === "string") {
    const raw = fromBase64(value, label);
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`);
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  }
  return new Float32Array(finiteNumbers(value, label));
}
function decodeUnsigned(value, label) {
  if (typeof value === "string") {
    const raw = fromBase64(value, label);
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`);
    return new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  }
  return new Uint32Array(unsignedIntegers(value, label));
}
function decodeSigned(value, label) {
  if (typeof value === "string") {
    const raw = fromBase64(value, label);
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`);
    return new Int32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  }
  return new Int32Array(signedIntegers(value, label));
}
function finiteNumbers(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`${label} must be an array of finite numbers`);
  }
  return value;
}
function unsignedIntegers(value, label) {
  const numbers = finiteNumbers(value, label);
  if (numbers.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 4294967295)) {
    throw new Error(`${label} must contain unsigned 32-bit integers`);
  }
  return numbers;
}
function bytes(value, label) {
  const numbers = unsignedIntegers(value, label);
  if (numbers.some((entry) => entry > 255)) throw new Error(`${label} must contain unsigned bytes`);
  return numbers;
}
function signedIntegers(value, label) {
  const numbers = finiteNumbers(value, label);
  if (numbers.some((entry) => !Number.isInteger(entry) || entry < -2147483648 || entry > 2147483647)) {
    throw new Error(`${label} must contain signed 32-bit integers`);
  }
  return numbers;
}
function stringValue(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}
function booleanValue(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}
function decodeCompiledSurfaceBake(content) {
  const value = JSON.parse(new TextDecoder().decode(content));
  if (!value || typeof value !== "object") throw new Error("Compiled surface bake payload must be an object");
  const channels = value.channels;
  if (!Array.isArray(channels)) throw new Error("surface bake channels must be an array");
  const bake = {
    format: stringValue(value.format, "format"),
    assetId: stringValue(value.assetId, "assetId"),
    topologyKey: stringValue(value.topologyKey, "topologyKey"),
    recipeHash: stringValue(value.recipeHash, "recipeHash"),
    compilerHash: stringValue(value.compilerHash, "compilerHash"),
    profile: stringValue(value.profile, "profile"),
    domain: stringValue(value.domain, "domain"),
    width: finiteNumber(value.width, "width"),
    height: finiteNumber(value.height, "height"),
    channels: channels.map((channel, index) => {
      if (!channel || typeof channel !== "object") throw new Error(`surface bake channel ${index} must be an object`);
      const record = channel;
      return {
        semantic: stringValue(record.semantic, `channel ${index} semantic`),
        components: finiteNumber(record.components, `channel ${index} components`),
        encoding: stringValue(record.encoding, `channel ${index} encoding`),
        scale: record.scale === void 0 ? void 0 : finiteNumber(record.scale, `channel ${index} scale`),
        bias: record.bias === void 0 ? void 0 : finiteNumber(record.bias, `channel ${index} bias`),
        data: typeof record.data === "string" ? fromBase64(record.data, `channel ${index} data`) : new Uint8Array(bytes(record.data, `channel ${index} data`))
      };
    })
  };
  const allowedKeys = /* @__PURE__ */ new Set([
    "format",
    "assetId",
    "topologyKey",
    "recipeHash",
    "compilerHash",
    "profile",
    "domain",
    "width",
    "height",
    "channels"
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`Compiled surface bake payload contains forbidden field: ${key}`);
  }
  assertCompiledSurfaceBake(bake);
  return bake;
}
function decodeCompiledTopology(content) {
  const value = JSON.parse(new TextDecoder().decode(content));
  if (!value || typeof value !== "object") throw new Error("Compiled topology payload must be an object");
  const lods = value.lods;
  if (!Array.isArray(lods)) throw new Error("lods must be an array");
  const claims = value.claims;
  if (!claims || typeof claims !== "object") throw new Error("claims must be an object");
  const claimRecord = claims;
  const uvQuantized = value.uvQuantized === true;
  const indexWidth = value.indexWidth;
  const domainCoordinates = decodeFloats(value.domainCoordinates, "domainCoordinates");
  const domainCoordinateCount = domainCoordinates.length;
  const topology = {
    format: stringValue(value.format, "format"),
    assetId: stringValue(value.assetId, "assetId"),
    topologyKey: stringValue(value.topologyKey, "topologyKey"),
    recipeHash: stringValue(value.recipeHash, "recipeHash"),
    compilerHash: stringValue(value.compilerHash, "compilerHash"),
    profile: stringValue(value.profile, "profile"),
    strategy: stringValue(value.strategy, "strategy"),
    domainCoordinates,
    fieldSamples: value.fieldSamples === void 0 ? void 0 : decodeFloats(value.fieldSamples, "fieldSamples"),
    indices: decodeIndices(value.indices, indexWidth, "indices"),
    // Absent means the identity map. Reconstructed rather than defaulted to empty
    // so every consumer still sees one ID per vertex.
    stableVertexIds: value.stableVertexIds === void 0 ? new Uint32Array(domainCoordinateCount / 3).map((_, index) => index) : decodeUnsigned(value.stableVertexIds, "stableVertexIds"),
    adjacency: value.adjacency === void 0 ? void 0 : decodeSigned(value.adjacency, "adjacency"),
    bakeUvs: value.bakeUvs === void 0 ? void 0 : uvQuantized ? dequantize(value.bakeUvs, 0, 1, "bakeUvs") : decodeFloats(value.bakeUvs, "bakeUvs"),
    lods: lods.map((lod, index) => {
      if (!lod || typeof lod !== "object") throw new Error(`LOD ${index} must be an object`);
      const record = lod;
      return {
        level: record.level,
        maxGeometricError: record.maxGeometricError,
        indices: decodeIndices(record.indices, indexWidth, `LOD ${index} indices`)
      };
    }),
    collisionIndices: decodeIndices(value.collisionIndices, indexWidth, "collisionIndices"),
    claims: {
      boundaryMode: stringValue(claimRecord.boundaryMode, "claims.boundaryMode"),
      manifold: booleanValue(claimRecord.manifold, "claims.manifold"),
      consistentWinding: booleanValue(claimRecord.consistentWinding, "claims.consistentWinding"),
      lodTransitionsValidated: booleanValue(claimRecord.lodTransitionsValidated, "claims.lodTransitionsValidated"),
      collisionValidated: booleanValue(claimRecord.collisionValidated, "claims.collisionValidated"),
      deformationValidatedSeeds: finiteNumber(claimRecord.deformationValidatedSeeds, "claims.deformationValidatedSeeds"),
      maximumDisplacement: finiteNumber(claimRecord.maximumDisplacement, "claims.maximumDisplacement"),
      minimumDomainTriangleArea: finiteNumber(claimRecord.minimumDomainTriangleArea, "claims.minimumDomainTriangleArea")
    }
  };
  const allowedInputKeys = new Set(Object.keys(topology));
  allowedInputKeys.add("bufferEncoding");
  allowedInputKeys.add("indexWidth");
  allowedInputKeys.add("uvQuantized");
  for (const key of Object.keys(value)) {
    if (!allowedInputKeys.has(key)) throw new Error(`Compiled topology payload contains forbidden field: ${key}`);
  }
  assertCompiledTopology(topology);
  return topology;
}
function topologyCacheKey(identity) {
  return [identity.assetId, identity.topologyKey, identity.recipeHash, identity.compilerHash, identity.profile].map((value) => encodeURIComponent(value)).join("/");
}
function matchesIdentity(topology, identity) {
  return topology.assetId === identity.assetId && topology.topologyKey === identity.topologyKey && topology.recipeHash === identity.recipeHash && topology.compilerHash === identity.compilerHash && topology.profile === identity.profile;
}
function surfaceBakeMatchesIdentity(bake, identity) {
  return bake.assetId === identity.assetId && bake.topologyKey === identity.topologyKey && bake.recipeHash === identity.recipeHash && bake.compilerHash === identity.compilerHash && bake.profile === identity.profile;
}
function createTerrainAsset(definition) {
  return {
    async create(options) {
      const profile = options.profile ?? definition.defaultProfile;
      const request = { ...options, profile };
      const identity = {
        assetId: definition.assetId,
        recipeHash: definition.recipeHash,
        compilerHash: definition.compilerHash,
        profile,
        ...definition.identify(options.config, profile, request)
      };
      const path = options.path ?? "auto";
      const cacheMode = options.cache ?? "use";
      const key = topologyCacheKey(identity);
      if (path !== "source" && cacheMode !== "bypass" && cacheMode !== "refresh") {
        const bundled = definition.compiled?.find((topology) => matchesIdentity(topology, identity));
        const cached2 = bundled ?? await definition.cacheStore?.get(key);
        if (cached2) {
          try {
            assertCompiledTopology(cached2);
            if (!matchesIdentity(cached2, identity)) throw new Error("Compiled topology fingerprint does not match the request");
            const bundledSurfaceBake = definition.compiledSurfaceBakes?.find((bake) => surfaceBakeMatchesIdentity(bake, identity));
            const surfaceBake = bundledSurfaceBake ?? await definition.surfaceBakeStore?.get(key);
            if (surfaceBake) {
              assertCompiledSurfaceBake(surfaceBake);
              if (!surfaceBakeMatchesIdentity(surfaceBake, identity)) {
                throw new Error("Compiled surface bake fingerprint does not match the request");
              }
            }
            return await definition.materialize(cached2, request, surfaceBake);
          } catch (error) {
            if (path === "compiled") throw error;
          }
        }
      }
      if (path === "compiled") {
        throw new Error(`No compatible compiled topology for ${definition.assetId} (${identity.topologyKey})`);
      }
      const result = await definition.source.build(request);
      if (result.compiled && cacheMode !== "bypass") {
        assertCompiledTopology(result.compiled);
        if (!matchesIdentity(result.compiled, identity)) {
          throw new Error("Source compiler returned topology with a mismatched fingerprint");
        }
        await definition.cacheStore?.put(key, result.compiled);
      }
      if (result.surfaceBake && cacheMode !== "bypass") {
        assertCompiledSurfaceBake(result.surfaceBake);
        if (!surfaceBakeMatchesIdentity(result.surfaceBake, identity)) {
          throw new Error("Source compiler returned a surface bake with a mismatched fingerprint");
        }
        await definition.surfaceBakeStore?.put(key, result.surfaceBake);
      }
      return result.instance;
    }
  };
}

// .local-reference/vibe3d/assets/terrain/shared/noise.ts
function hashBits(x, y, z, seed) {
  let value = Math.imul(x | 0, 521288629);
  value ^= Math.imul(y | 0, 1597334677);
  value ^= Math.imul(z | 0, 1821285621);
  value ^= Math.imul(seed | 0, 668265261);
  value ^= value >>> 15;
  value = Math.imul(value, 2246822507);
  value ^= value >>> 13;
  value = Math.imul(value, 3266489909);
  value ^= value >>> 16;
  return value >>> 0;
}
function hash01(x, y, z, seed) {
  return hashBits(x, y, z, seed) / 4294967296;
}
var GRADIENTS = new Float64Array([
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  0,
  1,
  0,
  1,
  -1,
  0,
  1,
  1,
  0,
  -1,
  -1,
  0,
  -1,
  0,
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  1,
  1,
  0,
  0,
  -1,
  1,
  -1,
  1,
  0,
  0,
  -1,
  -1
]);
var NOISE_CELL_CACHE_SIZE = 4096;
var gradientCellBySeed = new Array(NOISE_CELL_CACHE_SIZE);
function gradientNoise(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const cacheSlot = seed & NOISE_CELL_CACHE_SIZE - 1;
  let cell = gradientCellBySeed[cacheSlot];
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, bases: new Int16Array(8) };
    gradientCellBySeed[cacheSlot] = cell;
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix;
    cell.y = iy;
    cell.z = iz;
    const bases2 = cell.bases;
    bases2[0] = (hashBits(ix, iy, iz, seed) & 15) * 3;
    bases2[1] = (hashBits(ix + 1, iy, iz, seed) & 15) * 3;
    bases2[2] = (hashBits(ix, iy + 1, iz, seed) & 15) * 3;
    bases2[3] = (hashBits(ix + 1, iy + 1, iz, seed) & 15) * 3;
    bases2[4] = (hashBits(ix, iy, iz + 1, seed) & 15) * 3;
    bases2[5] = (hashBits(ix + 1, iy, iz + 1, seed) & 15) * 3;
    bases2[6] = (hashBits(ix, iy + 1, iz + 1, seed) & 15) * 3;
    bases2[7] = (hashBits(ix + 1, iy + 1, iz + 1, seed) & 15) * 3;
  }
  const bases = cell.bases;
  let base = bases[0];
  const n000 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * fz;
  base = bases[1];
  const n100 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * fz;
  base = bases[2];
  const n010 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * fz;
  base = bases[3];
  const n110 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * fz;
  base = bases[4];
  const n001 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * (fz - 1);
  base = bases[5];
  const n101 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * (fz - 1);
  base = bases[6];
  const n011 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * (fz - 1);
  base = bases[7];
  const n111 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * (fz - 1);
  const x00 = n000 + (n100 - n000) * ux;
  const x10 = n010 + (n110 - n010) * ux;
  const x01 = n001 + (n101 - n001) * ux;
  const x11 = n011 + (n111 - n011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}
function fbm(x, y, z, seed, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0173;
  }
  return total / weight * 0.71;
}
function ridged(x, y, z, seed, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const raw = 1 - Math.abs(gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * 2.2);
    const band = raw < 0 ? 0 : raw;
    total += band * band * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
    frequency *= 2.0173;
  }
  return total / weight;
}
function worleyBorder(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const cacheSlot = seed & NOISE_CELL_CACHE_SIZE - 1;
  let cell = worleyCellBySeed[cacheSlot];
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, points: new Float64Array(27 * 3) };
    worleyCellBySeed[cacheSlot] = cell;
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix;
    cell.y = iy;
    cell.z = iz;
    let cursor = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx;
          const cy = iy + dy;
          const cz = iz + dz;
          cell.points[cursor] = cx + hashBits(cx, cy, cz, seed) / 4294967296;
          cell.points[cursor + 1] = cy + hashBits(cx, cy, cz, seed + 31) / 4294967296;
          cell.points[cursor + 2] = cz + hashBits(cx, cy, cz, seed + 67) / 4294967296;
          cursor += 3;
        }
      }
    }
  }
  let first = Infinity;
  let second = Infinity;
  const points = cell.points;
  for (let cursor = 0; cursor < points.length; cursor += 3) {
    const ex = x - points[cursor];
    const ey = y - points[cursor + 1];
    const ez = z - points[cursor + 2];
    const squared = ex * ex + ey * ey + ez * ez;
    if (squared < first) {
      second = first;
      first = squared;
    } else if (squared < second) second = squared;
  }
  return Math.sqrt(second) - Math.sqrt(first);
}
var worleyCellBySeed = new Array(NOISE_CELL_CACHE_SIZE);
function normalize([x, y, z]) {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / length, y / length, z / length];
}
function smax(a, b, k) {
  if (k <= 0) return a > b ? a : b;
  const difference = a - b;
  const spread = difference < 0 ? -difference : difference;
  const h = k - spread;
  if (h <= 0) return a > b ? a : b;
  return (a > b ? a : b) + h * h / (k * 4);
}
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const difference = a - b;
  const spread = difference < 0 ? -difference : difference;
  const h = k - spread;
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - h * h / (k * 4);
}
function boxoid(x, y, z, rx, ry, rz) {
  const ax = x / rx;
  const ay = y / ry;
  const az = z / rz;
  const sx = ax * ax;
  const sy = ay * ay;
  const sz = az * az;
  const sum = sx * sx + sy * sy + sz * sz;
  const normalized = Math.sqrt(Math.sqrt(sum));
  const smallest = rx < ry ? rx < rz ? rx : rz : ry < rz ? ry : rz;
  return (normalized - 1) * smallest;
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/field.ts
var DOMAIN_TO_METRES_X = 1.82;
var FORMATIONS = [
  "erratic",
  "prow",
  "arch",
  "tor",
  "bench",
  "monolith"
];
function formationOf(seed) {
  const normalized = Math.max(1, Math.floor(seed));
  return FORMATIONS[(normalized - 1) % FORMATIONS.length];
}
var massParameterCache = /* @__PURE__ */ new Map();
var lastMassSeed = Number.NaN;
var lastMassParameters;
function buildMassParameters(seed) {
  const formation = formationOf(seed);
  const pick = (index) => hash01(seed, index, 77, 625341585);
  const envelopes = {
    erratic: [0.88, 0.74, 0.79],
    prow: [0.72, 0.88, 0.6],
    arch: [0.92, 0.78, 0.48],
    tor: [0.86, 0.7, 0.76],
    bench: [0.98, 0.52, 0.76],
    monolith: [0.56, 0.96, 0.54]
  };
  const envelope = envelopes[formation];
  const radii = [
    envelope[0] + (pick(1) - 0.5) * 0.08,
    envelope[1] + (pick(2) - 0.5) * 0.07,
    envelope[2] + (pick(3) - 0.5) * 0.08
  ];
  const facets = [];
  const addFacet = (normal, support, blend) => {
    const unit = normalize(normal);
    const extent = Math.sqrt(
      (unit[0] * radii[0]) ** 2 + (unit[1] * radii[1]) ** 2 + (unit[2] * radii[2]) ** 2
    );
    facets.push(unit[0], unit[1], unit[2], extent * support, blend);
  };
  const jointSets = [
    normalize([0.96, 0.12, -0.25]),
    normalize([-0.19, 0.07, 0.98]),
    normalize([0.44, 0.34, 0.83])
  ];
  for (let set = 0; set < jointSets.length; set += 1) {
    const axis = jointSets[set];
    for (const sign2 of [1, -1]) {
      const jitter = 0.16;
      for (let step = 0; step < 2; step += 1) {
        const wobble = (index) => (pick(set * 20 + step * 5 + index) - 0.5) * jitter;
        addFacet(
          [
            axis[0] * sign2 + wobble(1),
            axis[1] * sign2 + wobble(2),
            axis[2] * sign2 + wobble(3)
          ],
          0.62 + pick(set * 30 + step * 3 + (sign2 > 0 ? 0 : 1)) * 0.26,
          // Near-hard arrises. Frost-shattered granite has not been abraded.
          2e-3 + pick(set * 40 + step) * 6e-3
        );
      }
    }
  }
  const breakCount = formation === "arch" ? 14 : formation === "tor" ? 20 : 30;
  for (let index = 0; index < breakCount; index += 1) {
    const theta = index / breakCount * Math.PI * 2 + pick(100 + index) * 0.9;
    const rise = -0.3 + pick(120 + index) * 1.25;
    addFacet(
      [Math.cos(theta), rise, Math.sin(theta)],
      0.55 + pick(140 + index) * 0.29,
      12e-4 + pick(160 + index) * 35e-4
    );
  }
  addFacet([0.03, -0.99, -0.05], 0.6, 4e-3);
  const scarCount = formation === "arch" ? 5 : formation === "monolith" ? 7 : 10;
  const scars = new Float64Array(scarCount * 9);
  for (let index = 0; index < scarCount; index += 1) {
    const theta = 0.7 + index * 1.29 + pick(200 + index) * 0.7;
    const radius = 0.2 + pick(220 + index) * 0.22;
    const distance = 0.98 + radius * (0.72 + pick(240 + index) * 0.3);
    const yaw = pick(320 + index) * Math.PI;
    scars[index * 9] = Math.cos(theta) * distance;
    scars[index * 9 + 1] = -0.2 + pick(260 + index) * 0.78;
    scars[index * 9 + 2] = Math.sin(theta) * distance;
    scars[index * 9 + 3] = radius;
    scars[index * 9 + 4] = radius * (0.5 + pick(280 + index) * 0.7);
    scars[index * 9 + 5] = radius * (0.6 + pick(290 + index) * 0.8);
    scars[index * 9 + 6] = 2e-3 + pick(300 + index) * 8e-3;
    scars[index * 9 + 7] = Math.cos(yaw);
    scars[index * 9 + 8] = Math.sin(yaw);
  }
  const lobeCount = formation === "arch" ? 2 : formation === "tor" ? 6 : 4;
  const lobes = new Float64Array(lobeCount * 8);
  for (let index = 0; index < lobeCount; index += 1) {
    const theta = 1.9 + index * 1.65 + pick(340 + index) * 0.9;
    const radius = 0.15 + pick(360 + index) * 0.13;
    const yaw = pick(440 + index) * Math.PI;
    lobes[index * 8] = Math.cos(theta) * (0.34 + pick(380 + index) * 0.22);
    lobes[index * 8 + 1] = -0.22 + pick(400 + index) * 0.5;
    lobes[index * 8 + 2] = Math.sin(theta) * (0.32 + pick(420 + index) * 0.22);
    lobes[index * 8 + 3] = radius;
    lobes[index * 8 + 4] = radius * (0.55 + pick(430 + index) * 0.7);
    lobes[index * 8 + 5] = radius * (0.7 + pick(435 + index) * 0.6);
    lobes[index * 8 + 6] = Math.cos(yaw);
    lobes[index * 8 + 7] = Math.sin(yaw);
  }
  return {
    formation,
    radii,
    facets: new Float64Array(facets),
    facetCount: facets.length / 5,
    scars,
    scarCount,
    lobes,
    lobeCount
  };
}
function ellipsoid(x, y, z, rx, ry, rz) {
  const nx = x / rx;
  const ny = y / ry;
  const nz = z / rz;
  return (Math.sqrt(nx * nx + ny * ny + nz * nz) - 1) * Math.min(rx, ry, rz);
}
function massParameters(seed) {
  if (seed === lastMassSeed) return lastMassParameters;
  let cached2 = massParameterCache.get(seed);
  if (!cached2) {
    cached2 = buildMassParameters(seed);
    massParameterCache.set(seed, cached2);
  }
  lastMassSeed = seed;
  lastMassParameters = cached2;
  return cached2;
}
function facetCount(seed) {
  return massParameters(seed).facetCount;
}
function massSdf(x, y, z, seed) {
  const parameters = massParameters(seed);
  const radii = parameters.radii;
  const leanX = x + y * 0.07;
  const leanZ = z - y * 0.09;
  const taper = 1 - Math.max(-0.1, Math.min(0.24, y * 0.26));
  let distance;
  switch (parameters.formation) {
    case "arch": {
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2]);
      break;
    }
    case "tor": {
      const base = boxoid(leanX + 0.12, y + 0.24, leanZ, radii[0] * 0.9, radii[1] * 0.7, radii[2]);
      const crown = boxoid(leanX - 0.18, y - 0.34, leanZ + 0.08, radii[0] * 0.68, radii[1] * 0.48, radii[2] * 0.82);
      const shoulder = boxoid(leanX + 0.38, y - 0.05, leanZ - 0.12, radii[0] * 0.42, radii[1] * 0.5, radii[2] * 0.64);
      distance = smin(smin(base, crown, 0.045), shoulder, 0.035);
      break;
    }
    case "bench": {
      const body = boxoid(leanX - 0.12, y + 0.18, leanZ, radii[0] * 0.82, radii[1] * 0.78, radii[2]);
      const shelf = boxoid(leanX + 0.16, y - 0.27, leanZ - 0.05, radii[0], radii[1] * 0.34, radii[2] * 0.82);
      distance = smin(body, shelf, 0.035);
      break;
    }
    case "prow": {
      const body = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper);
      const shoulder = boxoid(leanX - 0.28, y - 0.18, leanZ + 0.08, radii[0] * 0.55, radii[1] * 0.48, radii[2] * 0.78);
      distance = smin(body, shoulder, 0.04);
      break;
    }
    default:
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper);
  }
  const facets = parameters.facets;
  for (let index = 0; index < parameters.facetCount; index += 1) {
    const offset = index * 5;
    const plane = x * facets[offset] + y * facets[offset + 1] + z * facets[offset + 2] - facets[offset + 3];
    distance = smax(distance, plane, facets[offset + 4]);
  }
  const lobes = parameters.lobes;
  for (let index = 0; index < parameters.lobeCount; index += 1) {
    const offset = index * 8;
    const lx = x - lobes[offset];
    const lz = z - lobes[offset + 2];
    const cos = lobes[offset + 6];
    const sin = lobes[offset + 7];
    distance = smin(distance, boxoid(
      lx * cos - lz * sin,
      y - lobes[offset + 1],
      lx * sin + lz * cos,
      lobes[offset + 3],
      lobes[offset + 4],
      lobes[offset + 5]
    ), 0.05);
  }
  const scars = parameters.scars;
  for (let index = 0; index < parameters.scarCount; index += 1) {
    const offset = index * 9;
    const sx = x - scars[offset];
    const sz = z - scars[offset + 2];
    const cos = scars[offset + 7];
    const sin = scars[offset + 8];
    distance = smax(distance, -boxoid(
      sx * cos - sz * sin,
      y - scars[offset + 1],
      sx * sin + sz * cos,
      scars[offset + 3],
      scars[offset + 4],
      scars[offset + 5]
    ), scars[offset + 6]);
  }
  if (parameters.formation === "arch") {
    const openingX = (hash01(seed, 901, 77, 625341585) - 0.5) * 0.12;
    const shaft = boxoid(x - openingX, y + 0.62, z, 0.36, 0.43, 0.72);
    const crown = ellipsoid(x - openingX, y + 0.14, z, 0.43, 0.43, 0.72);
    distance = smax(distance, -smin(shaft, crown, 0.025), 8e-3);
  }
  return distance;
}
var BANDS = [
  {
    // Buttresses and gullies across whole faces. Ridged, so faces meet at
    // creased spines instead of rolling into one another.
    name: "macro-buttress",
    wavelength: 0.72,
    amplitude: 0.052,
    evaluate: (x, y, z, seed) => {
      const wx = x + fbm(x * 1.05 + 3.1, y * 1.05, z * 1.05, seed + 11, 3) * 0.4;
      const wy = y + fbm(x * 1, y * 1 - 5.7, z * 1, seed + 43, 3) * 0.3;
      const wz = z + fbm(x * 1.1, y * 1.1, z * 1.1 + 8.4, seed + 79, 3) * 0.4;
      const spine = ridged(wx * 1.75, wy * 1.35, wz * 1.75, seed + 137, 3);
      const broad = fbm(wx * 1.5, wy * 1.25, wz * 1.5, seed + 101, 3) * 2;
      return broad * 0.42 + (spine - 0.4) * 1.15;
    }
  },
  {
    // Joint blocks at decimetre scale. The cellular term dominates, so this
    // band cuts the faces into stepped plates with hard borders.
    name: "meso-jointing",
    wavelength: 0.23,
    amplitude: 0.017,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 2.9 + 6.7, y * 2.9, z * 2.9, seed + 307, 3) * 0.26;
      const cells = worleyBorder((x + warp) * 5.4, y * 4.3, (z - warp) * 5.4, seed + 389);
      const plate = 1 - Math.min(1, cells / 0.44);
      const spine = ridged((x + warp) * 4.6, y * 3.9, (z + warp) * 4.6, seed + 421, 2);
      const broken = fbm((x + warp) * 5.6, (y - warp * 0.45) * 4.4, (z + warp) * 5.6, seed + 347, 3) * 2;
      return broken * 0.34 + (spine - 0.42) * 0.7 - plate * plate * 0.62;
    }
  },
  {
    // Frost-shattered chip scars and exfoliation sheeting. Strongly creased,
    // and stratified in Y so it reads as bedding rather than uniform lumpiness.
    name: "fine-shatter",
    wavelength: 0.085,
    amplitude: 55e-4,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 7 + 1.3, y * 7, z * 7, seed + 503, 2) * 0.14;
      const chips = worleyBorder((x + warp) * 14.5, y * 11.5, (z - warp) * 14.5, seed + 541);
      const scar = 1 - Math.min(1, chips / 0.42);
      const bedding = ridged(x * 6.5, y * 21.5, z * 6.5, seed + 577, 2);
      const grit = fbm(x * 13.5, y * 13.5, z * 13.5, seed + 613, 3) * 2;
      return grit * 0.36 - scar * scar * 0.62 - (bedding - 0.4) * 0.5;
    }
  }
];
function octaveBudget(cells) {
  const voxel = 2 / cells;
  const minimumWavelength = voxel * 3;
  return {
    cells,
    voxel,
    minimumWavelength,
    bands: BANDS.filter((band) => band.wavelength >= minimumWavelength).map((band) => band.name),
    bakeOnly: BANDS.filter((band) => band.wavelength < minimumWavelength).map((band) => band.name)
  };
}
function displacement(x, y, z, seed, minimumWavelength = 0) {
  let total = 0;
  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index];
    if (band.wavelength < minimumWavelength) continue;
    total += band.evaluate(x, y, z, seed) * band.amplitude;
  }
  return total;
}
function microRelief(x, y, z, seed) {
  const grain = fbm(x * 44, y * 44, z * 44, seed + 701, 3) * 2;
  const crystal = ridged(x * 72, y * 72, z * 72, seed + 743, 2);
  const flake = worleyBorder(x * 56, y * 56, z * 56, seed + 787);
  const pit = 1 - Math.min(1, flake / 0.36);
  return grain * 21e-4 + (crystal - 0.42) * 17e-4 - pit * pit * 18e-4;
}
function surfaceSdf(x, y, z, seed, minimumWavelength = 0) {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, minimumWavelength);
}
function detailedSdf(x, y, z, seed) {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, 0) - microRelief(x, y, z, seed);
}
function detailedNormal(x, y, z, seed, step) {
  return detailedNormalInto(x, y, z, seed, step, [0, 0, 0]);
}
function detailedNormalInto(x, y, z, seed, step, output) {
  const base = detailedSdf(x + step, y + step, z + step, seed);
  const dx = detailedSdf(x + step, y - step, z - step, seed);
  const dy = detailedSdf(x - step, y + step, z - step, seed);
  const dz = detailedSdf(x - step, y - step, z + step, seed);
  let nx = base + dx - dy - dz;
  let ny = base - dx + dy - dz;
  let nz = base - dx - dy + dz;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length < 1e-12) {
    output[0] = 0;
    output[1] = 1;
    output[2] = 0;
    return output;
  }
  output[0] = nx / length;
  output[1] = ny / length;
  output[2] = nz / length;
  return output;
}
var graniteMeshField = {
  sdf: surfaceSdf,
  octaveBudget
};
var graniteDetailField = {
  sdf: detailedSdf,
  normal: detailedNormal,
  normalInto: detailedNormalInto
};

// .local-reference/vibe3d/assets/terrain/shared/dual-contour.ts
var CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
];
var EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
];
function analyticNormal(field, x, y, z, seed, minimumWavelength, step) {
  const base = field.sdf(x + step, y + step, z + step, seed, minimumWavelength);
  const dx = field.sdf(x + step, y - step, z - step, seed, minimumWavelength);
  const dy = field.sdf(x - step, y + step, z - step, seed, minimumWavelength);
  const dz = field.sdf(x - step, y - step, z + step, seed, minimumWavelength);
  let nx = base + dx - dy - dz;
  let ny = base - dx + dy - dz;
  let nz = base - dx - dy + dz;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length < 1e-12) return [0, 1, 0];
  nx /= length;
  ny /= length;
  nz /= length;
  return [nx, ny, nz];
}
function solveQef(points, normals, count, centroid, regularization) {
  let a00 = regularization;
  let a01 = 0;
  let a02 = 0;
  let a11 = regularization;
  let a12 = 0;
  let a22 = regularization;
  let b0 = centroid[0] * regularization;
  let b1 = centroid[1] * regularization;
  let b2 = centroid[2] * regularization;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const nx = normals[offset];
    const ny = normals[offset + 1];
    const nz = normals[offset + 2];
    const d = nx * points[offset] + ny * points[offset + 1] + nz * points[offset + 2];
    a00 += nx * nx;
    a01 += nx * ny;
    a02 += nx * nz;
    a11 += ny * ny;
    a12 += ny * nz;
    a22 += nz * nz;
    b0 += nx * d;
    b1 += ny * d;
    b2 += nz * d;
  }
  const determinant = a00 * (a11 * a22 - a12 * a12) - a01 * (a01 * a22 - a12 * a02) + a02 * (a01 * a12 - a11 * a02);
  if (Math.abs(determinant) < 1e-14) return centroid;
  const inverse = 1 / determinant;
  const i00 = (a11 * a22 - a12 * a12) * inverse;
  const i01 = (a02 * a12 - a01 * a22) * inverse;
  const i02 = (a01 * a12 - a02 * a11) * inverse;
  const i11 = (a00 * a22 - a02 * a02) * inverse;
  const i12 = (a02 * a01 - a00 * a12) * inverse;
  const i22 = (a00 * a11 - a01 * a01) * inverse;
  return [
    i00 * b0 + i01 * b1 + i02 * b2,
    i01 * b0 + i11 * b1 + i12 * b2,
    i02 * b0 + i12 * b1 + i22 * b2
  ];
}
function extractDenseSurface(options) {
  const { field: recipe, seed, cells } = options;
  const regularization = options.regularization ?? 0.035;
  const budget = recipe.octaveBudget(cells);
  const minimumWavelength = budget.minimumWavelength;
  const samples = cells + 1;
  const step = 2 / cells;
  const field = new Float32Array(samples * samples * samples);
  for (let z = 0; z < samples; z += 1) {
    const pz = -1 + z * step;
    for (let y = 0; y < samples; y += 1) {
      const py = -1 + y * step;
      const rowOffset = samples * (y + samples * z);
      for (let x = 0; x < samples; x += 1) {
        field[x + rowOffset] = recipe.sdf(-1 + x * step, py, pz, seed, minimumWavelength);
      }
    }
  }
  const sampleAt = (x, y, z) => field[x + samples * (y + samples * z)];
  const vertexByCell = new Int32Array(cells * cells * cells).fill(-1);
  const positions = [];
  const normals = [];
  const crossingPoints = new Float64Array(12 * 3);
  const crossingNormals = new Float64Array(12 * 3);
  const cornerValues = new Float64Array(8);
  const gradientStep = step * 0.35;
  for (let z = 0; z < cells; z += 1) {
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        let inside = 0;
        for (let corner = 0; corner < 8; corner += 1) {
          const offset = CORNERS[corner];
          const value = sampleAt(x + offset[0], y + offset[1], z + offset[2]);
          cornerValues[corner] = value;
          if (value < 0) inside += 1;
        }
        if (inside === 0 || inside === 8) continue;
        let count = 0;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let edge = 0; edge < 12; edge += 1) {
          const [a, b] = EDGES[edge];
          const va = cornerValues[a];
          const vb = cornerValues[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ca = CORNERS[a];
          const cb = CORNERS[b];
          const px = -1 + (x + ca[0] + (cb[0] - ca[0]) * t) * step;
          const py = -1 + (y + ca[1] + (cb[1] - ca[1]) * t) * step;
          const pz = -1 + (z + ca[2] + (cb[2] - ca[2]) * t) * step;
          const normal2 = analyticNormal(recipe, px, py, pz, seed, minimumWavelength, gradientStep);
          const offset = count * 3;
          crossingPoints[offset] = px;
          crossingPoints[offset + 1] = py;
          crossingPoints[offset + 2] = pz;
          crossingNormals[offset] = normal2[0];
          crossingNormals[offset + 1] = normal2[1];
          crossingNormals[offset + 2] = normal2[2];
          cx += px;
          cy += py;
          cz += pz;
          count += 1;
        }
        if (count === 0) continue;
        const centroid = [cx / count, cy / count, cz / count];
        const solved = solveQef(crossingPoints, crossingNormals, count, centroid, regularization);
        const minX = -1 + x * step - step * 0.25;
        const minY = -1 + y * step - step * 0.25;
        const minZ = -1 + z * step - step * 0.25;
        const vx = Math.min(minX + step * 1.5, Math.max(minX, solved[0]));
        const vy = Math.min(minY + step * 1.5, Math.max(minY, solved[1]));
        const vz = Math.min(minZ + step * 1.5, Math.max(minZ, solved[2]));
        vertexByCell[x + cells * (y + cells * z)] = positions.length / 3;
        positions.push(vx, vy, vz);
        const normal = analyticNormal(recipe, vx, vy, vz, seed, minimumWavelength, gradientStep);
        normals.push(normal[0], normal[1], normal[2]);
      }
    }
  }
  const indices = [];
  const vertexAt = (x, y, z) => vertexByCell[x + cells * (y + cells * z)];
  const pushQuad = (outward, a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (a === b || a === c || a === d || b === c || b === d || c === d) return;
    if (outward) indices.push(a, b, c, a, c, d);
    else indices.push(a, d, c, a, c, b);
  };
  for (let z = 1; z < cells; z += 1) {
    for (let y = 1; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        const a = sampleAt(x, y, z);
        const b = sampleAt(x + 1, y, z);
        if (a < 0 !== b < 0) {
          pushQuad(a < 0, vertexAt(x, y - 1, z - 1), vertexAt(x, y, z - 1), vertexAt(x, y, z), vertexAt(x, y - 1, z));
        }
      }
    }
  }
  for (let z = 1; z < cells; z += 1) {
    for (let y = 0; y < cells; y += 1) {
      for (let x = 1; x < cells; x += 1) {
        const a = sampleAt(x, y, z);
        const b = sampleAt(x, y + 1, z);
        if (a < 0 !== b < 0) {
          pushQuad(a < 0, vertexAt(x - 1, y, z - 1), vertexAt(x - 1, y, z), vertexAt(x, y, z), vertexAt(x, y, z - 1));
        }
      }
    }
  }
  for (let z = 0; z < cells; z += 1) {
    for (let y = 1; y < cells; y += 1) {
      for (let x = 1; x < cells; x += 1) {
        const a = sampleAt(x, y, z);
        const b = sampleAt(x, y, z + 1);
        if (a < 0 !== b < 0) {
          pushQuad(a < 0, vertexAt(x - 1, y - 1, z), vertexAt(x, y - 1, z), vertexAt(x, y, z), vertexAt(x - 1, y, z));
        }
      }
    }
  }
  return {
    cells,
    positions: new Float64Array(positions),
    vertexCount: positions.length / 3,
    indices: new Uint32Array(indices),
    normals: new Float64Array(normals)
  };
}

// .local-reference/vibe3d/assets/terrain/shared/unwrap.ts
function triangleNormal(positions, a, b, c) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / length, ny / length, nz / length];
}
function basisFor(normal) {
  const up = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tx = up[1] * normal[2] - up[2] * normal[1];
  let ty = up[2] * normal[0] - up[0] * normal[2];
  let tz = up[0] * normal[1] - up[1] * normal[0];
  const length = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  tx /= length;
  ty /= length;
  tz /= length;
  return {
    tangent: [tx, ty, tz],
    bitangent: [
      normal[1] * tz - normal[2] * ty,
      normal[2] * tx - normal[0] * tz,
      normal[0] * ty - normal[1] * tx
    ]
  };
}
var AXES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];
function unwrap(surface, options) {
  const triangleCount = surface.indices.length / 3;
  const mode = options.mode ?? "cone";
  const coneCosine = Math.cos((options.coneDegrees ?? 62) * Math.PI / 180);
  const edgeMap = /* @__PURE__ */ new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = surface.indices[triangle * 3 + edge];
      const b = surface.indices[triangle * 3 + (edge + 1) % 3];
      const key = a < b ? a * 1000003 + b : b * 1000003 + a;
      const bucket = edgeMap.get(key);
      if (bucket) bucket.push(triangle);
      else edgeMap.set(key, [triangle]);
    }
  }
  const normals = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    normals.push(triangleNormal(
      surface.positions,
      surface.indices[triangle * 3],
      surface.indices[triangle * 3 + 1],
      surface.indices[triangle * 3 + 2]
    ));
  }
  const areaOrder = new Int32Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) areaOrder[triangle] = triangle;
  const areaOf = new Float64Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = surface.indices[triangle * 3];
    const b = surface.indices[triangle * 3 + 1];
    const c = surface.indices[triangle * 3 + 2];
    const ax = surface.positions[a * 3];
    const ay = surface.positions[a * 3 + 1];
    const az = surface.positions[a * 3 + 2];
    const abx = surface.positions[b * 3] - ax;
    const aby = surface.positions[b * 3 + 1] - ay;
    const abz = surface.positions[b * 3 + 2] - az;
    const acx = surface.positions[c * 3] - ax;
    const acy = surface.positions[c * 3 + 1] - ay;
    const acz = surface.positions[c * 3 + 2] - az;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    areaOf[triangle] = cx * cx + cy * cy + cz * cz;
  }
  const sortedSeeds = Array.from(areaOrder).sort((left, right) => areaOf[right] - areaOf[left]);
  const chartOf = new Int32Array(triangleCount).fill(-1);
  const charts = [];
  const axisOf = new Int32Array(triangleCount);
  if (mode === "axis") {
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const normal = normals[triangle];
      let best = -Infinity;
      let bestAxis = 0;
      for (let axis = 0; axis < AXES.length; axis += 1) {
        const candidate = AXES[axis];
        const dot = normal[0] * candidate[0] + normal[1] * candidate[1] + normal[2] * candidate[2];
        if (dot > best) {
          best = dot;
          bestAxis = axis;
        }
      }
      axisOf[triangle] = bestAxis;
    }
    const agreementBonus = 1.15;
    const alignmentFloor = 0.34;
    const neighbourAxes = new Int32Array(AXES.length);
    for (let pass = 0; pass < 10; pass += 1) {
      let changed = 0;
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        neighbourAxes.fill(0);
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[triangle * 3 + edge];
          const b = surface.indices[triangle * 3 + (edge + 1) % 3];
          const key = a < b ? a * 1000003 + b : b * 1000003 + a;
          for (const neighbor of edgeMap.get(key) ?? []) {
            if (neighbor === triangle) continue;
            neighbourAxes[axisOf[neighbor]] += 1;
          }
        }
        const normal = normals[triangle];
        let best = -Infinity;
        let bestAxis = axisOf[triangle];
        for (let axis = 0; axis < AXES.length; axis += 1) {
          const candidate = AXES[axis];
          const dot = normal[0] * candidate[0] + normal[1] * candidate[1] + normal[2] * candidate[2];
          if (dot < alignmentFloor) continue;
          const score = dot + agreementBonus * (neighbourAxes[axis] / 3);
          if (score > best) {
            best = score;
            bestAxis = axis;
          }
        }
        if (bestAxis !== axisOf[triangle]) {
          axisOf[triangle] = bestAxis;
          changed += 1;
        }
      }
      if (changed === 0) break;
    }
    for (const seed of sortedSeeds) {
      if (chartOf[seed] !== -1) continue;
      const chartIndex = charts.length;
      const axis = axisOf[seed];
      const triangles = [seed];
      chartOf[seed] = chartIndex;
      const queue = [seed];
      let cursor = 0;
      while (cursor < queue.length) {
        const current = queue[cursor];
        cursor += 1;
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[current * 3 + edge];
          const b = surface.indices[current * 3 + (edge + 1) % 3];
          const key = a < b ? a * 1000003 + b : b * 1000003 + a;
          for (const neighbor of edgeMap.get(key) ?? []) {
            if (neighbor === current || chartOf[neighbor] !== -1) continue;
            if (axisOf[neighbor] !== axis) continue;
            chartOf[neighbor] = chartIndex;
            triangles.push(neighbor);
            queue.push(neighbor);
          }
        }
      }
      const chartNormal = AXES[axis];
      const { tangent, bitangent } = basisFor(chartNormal);
      charts.push({
        triangles,
        normal: chartNormal,
        tangent,
        bitangent,
        minU: 0,
        minV: 0,
        width: 0,
        height: 0,
        offsetU: 0,
        offsetV: 0,
        scale: 1
      });
    }
  }
  for (const seed of mode === "axis" ? [] : sortedSeeds) {
    if (chartOf[seed] !== -1) continue;
    const chartIndex = charts.length;
    const seedNormal = normals[seed];
    let sumX = seedNormal[0];
    let sumY = seedNormal[1];
    let sumZ = seedNormal[2];
    const triangles = [seed];
    chartOf[seed] = chartIndex;
    const queue = [seed];
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      for (let edge = 0; edge < 3; edge += 1) {
        const a = surface.indices[current * 3 + edge];
        const b = surface.indices[current * 3 + (edge + 1) % 3];
        const key = a < b ? a * 1000003 + b : b * 1000003 + a;
        for (const neighbor of edgeMap.get(key) ?? []) {
          if (neighbor === current || chartOf[neighbor] !== -1) continue;
          const normal = normals[neighbor];
          const length2 = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ) || 1;
          const dot = (normal[0] * sumX + normal[1] * sumY + normal[2] * sumZ) / length2;
          if (dot < coneCosine) continue;
          if (normal[0] * seedNormal[0] + normal[1] * seedNormal[1] + normal[2] * seedNormal[2] < 0.52) continue;
          chartOf[neighbor] = chartIndex;
          triangles.push(neighbor);
          sumX += normal[0];
          sumY += normal[1];
          sumZ += normal[2];
          queue.push(neighbor);
        }
      }
    }
    const length = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ) || 1;
    const chartNormal = [sumX / length, sumY / length, sumZ / length];
    const { tangent, bitangent } = basisFor(chartNormal);
    charts.push({
      triangles,
      normal: chartNormal,
      tangent,
      bitangent,
      minU: 0,
      minV: 0,
      width: 0,
      height: 0,
      offsetU: 0,
      offsetV: 0,
      scale: 1
    });
  }
  const minimumChartTriangles = mode === "axis" ? 40 : 6;
  for (let pass = 0; pass < 6; pass += 1) {
    let merged = 0;
    for (let chartIndex = 0; chartIndex < charts.length; chartIndex += 1) {
      const chart = charts[chartIndex];
      if (chart.triangles.length === 0 || chart.triangles.length >= minimumChartTriangles) continue;
      let bestChart = -1;
      let bestAlignment = -2;
      for (const triangle of chart.triangles) {
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[triangle * 3 + edge];
          const b = surface.indices[triangle * 3 + (edge + 1) % 3];
          const key = a < b ? a * 1000003 + b : b * 1000003 + a;
          for (const neighbor of edgeMap.get(key) ?? []) {
            const other = chartOf[neighbor];
            if (other === chartIndex || other < 0) continue;
            const target2 = charts[other];
            if (target2.triangles.length === 0) continue;
            const alignment = target2.normal[0] * chart.normal[0] + target2.normal[1] * chart.normal[1] + target2.normal[2] * chart.normal[2];
            if (alignment < -0.2) continue;
            if (alignment > bestAlignment) {
              bestAlignment = alignment;
              bestChart = other;
            }
          }
        }
      }
      if (bestChart < 0) continue;
      const target = charts[bestChart];
      for (const triangle of chart.triangles) {
        chartOf[triangle] = bestChart;
        target.triangles.push(triangle);
      }
      chart.triangles = [];
      merged += 1;
    }
    if (merged === 0) break;
  }
  const liveCharts = charts.filter((chart) => chart.triangles.length > 0);
  charts.length = 0;
  charts.push(...liveCharts);
  for (let chartIndex = 0; chartIndex < charts.length; chartIndex += 1) {
    for (const triangle of charts[chartIndex].triangles) chartOf[triangle] = chartIndex;
  }
  for (const chart of charts) {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const triangle of chart.triangles) {
      const normal = normals[triangle];
      const weight = Math.sqrt(areaOf[triangle]);
      sumX += normal[0] * weight;
      sumY += normal[1] * weight;
      sumZ += normal[2] * weight;
    }
    const length = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ);
    if (length < 1e-9) continue;
    chart.normal = [sumX / length, sumY / length, sumZ / length];
    const refit = basisFor(chart.normal);
    chart.tangent = refit.tangent;
    chart.bitangent = refit.bitangent;
  }
  for (const chart of charts) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const triangle of chart.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = surface.indices[triangle * 3 + corner];
        const px = surface.positions[vertex * 3];
        const py = surface.positions[vertex * 3 + 1];
        const pz = surface.positions[vertex * 3 + 2];
        const u = px * chart.tangent[0] + py * chart.tangent[1] + pz * chart.tangent[2];
        const v = px * chart.bitangent[0] + py * chart.bitangent[1] + pz * chart.bitangent[2];
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    chart.minU = minU;
    chart.minV = minV;
    chart.width = Math.max(maxU - minU, 1e-6);
    chart.height = Math.max(maxV - minV, 1e-6);
  }
  const padding = options.padding / options.atlasSize;
  const order = [...charts].sort((left, right) => right.height - left.height);
  const minimumTexels = options.padding * 2 + 10;
  const maximumBoost = 24;
  const tryPack = (scale2) => {
    let shelfV = padding;
    let shelfHeight = 0;
    let cursorU = padding;
    for (const chart of order) {
      const narrow = Math.min(chart.width, chart.height);
      const needed = minimumTexels / (narrow * options.atlasSize);
      chart.scale = Math.min(Math.max(scale2, needed), scale2 * maximumBoost);
      const width = chart.width * chart.scale;
      const height = chart.height * chart.scale;
      if (width + padding * 2 > 1 || height + padding * 2 > 1) return false;
      if (cursorU + width + padding > 1) {
        shelfV += shelfHeight + padding;
        shelfHeight = 0;
        cursorU = padding;
      }
      if (shelfV + height + padding > 1) return false;
      chart.offsetU = cursorU;
      chart.offsetV = shelfV;
      cursorU += width + padding;
      if (height > shelfHeight) shelfHeight = height;
    }
    return true;
  };
  let low = 0;
  let high = 4;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    if (tryPack(middle)) low = middle;
    else high = middle;
  }
  const scale = low;
  tryPack(scale);
  const positions = [];
  const outNormals = [];
  const uvs = [];
  const indices = new Uint32Array(surface.indices.length);
  const splitMap = /* @__PURE__ */ new Map();
  let coveredArea = 0;
  for (const chart of charts) {
    coveredArea += (chart.width * chart.scale + padding) * (chart.height * chart.scale + padding);
    for (const triangle of chart.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = surface.indices[triangle * 3 + corner];
        const chartIndex = chartOf[triangle];
        const splitKey = vertex * 100003 + chartIndex;
        let target = splitMap.get(splitKey);
        if (target === void 0) {
          const px = surface.positions[vertex * 3];
          const py = surface.positions[vertex * 3 + 1];
          const pz = surface.positions[vertex * 3 + 2];
          const u = px * chart.tangent[0] + py * chart.tangent[1] + pz * chart.tangent[2];
          const v = px * chart.bitangent[0] + py * chart.bitangent[1] + pz * chart.bitangent[2];
          target = positions.length / 3;
          positions.push(px, py, pz);
          outNormals.push(
            surface.normals[vertex * 3],
            surface.normals[vertex * 3 + 1],
            surface.normals[vertex * 3 + 2]
          );
          uvs.push(
            Math.min(1, Math.max(0, chart.offsetU + (u - chart.minU) * chart.scale)),
            Math.min(1, Math.max(0, chart.offsetV + (v - chart.minV) * chart.scale))
          );
          splitMap.set(splitKey, target);
        }
        indices[triangle * 3 + corner] = target;
      }
    }
  }
  let smallestChartTexels = Infinity;
  let degenerateCharts = 0;
  const usableTexels = options.padding * 2 + 8;
  for (const chart of charts) {
    const smallest = Math.min(chart.width, chart.height) * chart.scale * options.atlasSize;
    if (smallest < smallestChartTexels) smallestChartTexels = smallest;
    if (smallest < usableTexels) degenerateCharts += 1;
  }
  return {
    positions: new Float64Array(positions),
    normals: new Float64Array(outNormals),
    uvs: new Float32Array(uvs),
    indices,
    vertexCount: positions.length / 3,
    chartCount: charts.length,
    packingEfficiency: coveredArea,
    smallestChartTexels: smallestChartTexels === Infinity ? 0 : smallestChartTexels,
    degenerateCharts
  };
}

// .local-reference/vibe3d/assets/terrain/shared/bake.ts
var BAKE_WIDTH = 512;
var BAKE_HEIGHT = 512;
var DEFAULT_SEARCH_DISTANCE = 0.055;
function encodeUnorm(value) {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return clamped * 255 + 0.5 | 0;
}
function traceDetail(field, originX, originY, originZ, directionX, directionY, directionZ, seed, maximumDistance) {
  let travelled = 0;
  let previous = field.sdf(originX, originY, originZ, seed);
  const coarseStep = maximumDistance / 48;
  while (travelled < maximumDistance) {
    const advance = Math.min(coarseStep, Math.max(Math.abs(previous) * 0.85, maximumDistance / 256));
    const next = travelled + advance;
    const value = field.sdf(
      originX + directionX * next,
      originY + directionY * next,
      originZ + directionZ * next,
      seed
    );
    if (value < 0 !== previous < 0) {
      let low = travelled;
      let high = next;
      let lowValue = previous;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const middle = (low + high) * 0.5;
        const middleValue = field.sdf(
          originX + directionX * middle,
          originY + directionY * middle,
          originZ + directionZ * middle,
          seed
        );
        if (middleValue < 0 === lowValue < 0) {
          low = middle;
          lowValue = middleValue;
        } else high = middle;
      }
      return (low + high) * 0.5;
    }
    previous = value;
    travelled = next;
  }
  return -1;
}
function fieldOcclusion(field, x, y, z, nx, ny, nz, seed) {
  let occlusion = 0;
  let weight = 0.6;
  for (let step = 1; step <= 5; step += 1) {
    const distance = step * 0.012;
    const sampled = field.sdf(x + nx * distance, y + ny * distance, z + nz * distance, seed);
    occlusion += Math.max(0, distance - sampled) * weight / distance;
    weight *= 0.72;
  }
  return Math.max(0, Math.min(1, 1 - occlusion * 0.55));
}
function rasterizeCharts(unwrapped, width, height) {
  const position = new Float32Array(width * height * 3);
  const normal = new Float32Array(width * height * 3);
  const covered = new Uint8Array(width * height);
  const triangleCount = unwrapped.indices.length / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = unwrapped.indices[triangle * 3];
    const ib = unwrapped.indices[triangle * 3 + 1];
    const ic = unwrapped.indices[triangle * 3 + 2];
    const ua = unwrapped.uvs[ia * 2] * width;
    const va = unwrapped.uvs[ia * 2 + 1] * height;
    const ub = unwrapped.uvs[ib * 2] * width;
    const vb = unwrapped.uvs[ib * 2 + 1] * height;
    const uc = unwrapped.uvs[ic * 2] * width;
    const vc = unwrapped.uvs[ic * 2 + 1] * height;
    const minX = Math.max(0, Math.floor(Math.min(ua, ub, uc) - 1));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ua, ub, uc) + 1));
    const minY = Math.max(0, Math.floor(Math.min(va, vb, vc) - 1));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(va, vb, vc) + 1));
    const area = (ub - ua) * (vc - va) - (uc - ua) * (vb - va);
    if (Math.abs(area) < 1e-9) continue;
    const inverseArea = 1 / area;
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        let w1 = ((sx - ua) * (vc - va) - (uc - ua) * (sy - va)) * inverseArea;
        let w2 = ((ub - ua) * (sy - va) - (sx - ua) * (vb - va)) * inverseArea;
        let w0 = 1 - w1 - w2;
        const slack = -0.06;
        if (w0 < slack || w1 < slack || w2 < slack) continue;
        w0 = Math.max(0, w0);
        w1 = Math.max(0, w1);
        w2 = Math.max(0, w2);
        const sum = w0 + w1 + w2 || 1;
        w0 /= sum;
        w1 /= sum;
        w2 /= sum;
        const texel = px + py * width;
        if (covered[texel]) continue;
        covered[texel] = 1;
        for (let axis = 0; axis < 3; axis += 1) {
          position[texel * 3 + axis] = unwrapped.positions[ia * 3 + axis] * w0 + unwrapped.positions[ib * 3 + axis] * w1 + unwrapped.positions[ic * 3 + axis] * w2;
          normal[texel * 3 + axis] = unwrapped.normals[ia * 3 + axis] * w0 + unwrapped.normals[ib * 3 + axis] * w1 + unwrapped.normals[ic * 3 + axis] * w2;
        }
      }
    }
  }
  return { position, normal, covered };
}
function dilate(channels, componentCounts, covered, width, height, passes) {
  let current = covered;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const texel = x + y * width;
        if (current[texel]) continue;
        let found = -1;
        for (let dy = -1; dy <= 1 && found < 0; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighbor = nx + ny * width;
            if (current[neighbor]) {
              found = neighbor;
              break;
            }
          }
        }
        if (found < 0) continue;
        for (let index = 0; index < channels.length; index += 1) {
          const components = componentCounts[index];
          for (let component = 0; component < components; component += 1) {
            channels[index][texel * components + component] = channels[index][found * components + component];
          }
        }
        next[texel] = 1;
      }
    }
    current = next;
  }
}
function compileSurfaceBake(field, unwrapped, identity, seed = 1, options = {}) {
  const width = options.width ?? BAKE_WIDTH;
  const height = options.height ?? BAKE_HEIGHT;
  const searchDistance = options.searchDistance ?? DEFAULT_SEARCH_DISTANCE;
  const normalizedSeed = Math.max(1, Math.floor(seed));
  const raster = rasterizeCharts(unwrapped, width, height);
  const normalData = new Uint8Array(width * height * 3);
  const heightData = new Uint8Array(width * height);
  const aoData = new Uint8Array(width * height);
  const curvatureData = new Uint8Array(width * height);
  const regionData = field.regionMask ? new Uint8Array(width * height) : void 0;
  for (let texel = 0; texel < width * height; texel += 1) {
    normalData[texel * 3] = 128;
    normalData[texel * 3 + 1] = 128;
    normalData[texel * 3 + 2] = 255;
    heightData[texel] = 128;
    aoData[texel] = 255;
    curvatureData[texel] = 128;
    if (regionData) regionData[texel] = 128;
  }
  const gradientStep = 16e-4;
  let coveredTexels = 0;
  let hitTexels = 0;
  let peakHeight = 0;
  const detailNormal = [0, 0, 0];
  const aheadNormal = [0, 0, 0];
  const sampleNormal = field.normalInto ? (x, y, z, output) => field.normalInto(x, y, z, normalizedSeed, gradientStep, output) : (x, y, z, output) => {
    const sampled = field.normal(x, y, z, normalizedSeed, gradientStep);
    output[0] = sampled[0];
    output[1] = sampled[1];
    output[2] = sampled[2];
    return output;
  };
  for (let texel = 0; texel < width * height; texel += 1) {
    if (!raster.covered[texel]) continue;
    coveredTexels += 1;
    const px = raster.position[texel * 3];
    const py = raster.position[texel * 3 + 1];
    const pz = raster.position[texel * 3 + 2];
    let nx = raster.normal[texel * 3];
    let ny = raster.normal[texel * 3 + 1];
    let nz = raster.normal[texel * 3 + 2];
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const originX = px + nx * searchDistance;
    const originY = py + ny * searchDistance;
    const originZ = pz + nz * searchDistance;
    const travelled = traceDetail(
      field,
      originX,
      originY,
      originZ,
      -nx,
      -ny,
      -nz,
      normalizedSeed,
      searchDistance * 2
    );
    let hitX = px;
    let hitY = py;
    let hitZ = pz;
    let relief = 0;
    if (travelled >= 0) {
      hitTexels += 1;
      relief = searchDistance - travelled;
      hitX = originX - nx * travelled;
      hitY = originY - ny * travelled;
      hitZ = originZ - nz * travelled;
      if (Math.abs(relief) > peakHeight) peakHeight = Math.abs(relief);
    }
    const detail = sampleNormal(hitX, hitY, hitZ, detailNormal);
    normalData[texel * 3] = encodeUnorm(detail[0] * 0.5 + 0.5);
    normalData[texel * 3 + 1] = encodeUnorm(detail[1] * 0.5 + 0.5);
    normalData[texel * 3 + 2] = encodeUnorm(detail[2] * 0.5 + 0.5);
    heightData[texel] = encodeUnorm(relief / (searchDistance * 2) + 0.5);
    aoData[texel] = encodeUnorm(
      fieldOcclusion(field, hitX, hitY, hitZ, detail[0], detail[1], detail[2], normalizedSeed)
    );
    if (regionData && field.regionMask) {
      regionData[texel] = encodeUnorm(field.regionMask(hitX, hitY, hitZ, normalizedSeed));
    }
    let tx = -detail[1];
    let ty = detail[0];
    let tz = 0;
    const tangentLength = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tangentLength < 1e-6) {
      tx = 1;
      ty = 0;
      tz = 0;
    } else {
      tx /= tangentLength;
      ty /= tangentLength;
      tz /= tangentLength;
    }
    const offset = 4e-3;
    const ahead = sampleNormal(
      hitX + tx * offset,
      hitY + ty * offset,
      hitZ + tz * offset,
      aheadNormal
    );
    const divergence = (ahead[0] - detail[0]) * tx + (ahead[1] - detail[1]) * ty + (ahead[2] - detail[2]) * tz;
    curvatureData[texel] = encodeUnorm(divergence * 6 + 0.5);
  }
  const dilationPasses = 4;
  dilate(
    regionData ? [normalData, heightData, aoData, curvatureData, regionData] : [normalData, heightData, aoData, curvatureData],
    regionData ? [3, 1, 1, 1, 1] : [3, 1, 1, 1],
    raster.covered,
    width,
    height,
    dilationPasses
  );
  const channels = [
    {
      semantic: "normal-object",
      components: 3,
      encoding: "unorm8",
      scale: 2,
      bias: -1,
      data: normalData
    },
    {
      semantic: "height",
      components: 1,
      encoding: "unorm8",
      scale: searchDistance * 4,
      bias: -searchDistance * 2,
      data: heightData
    },
    { semantic: "ambient-occlusion", components: 1, encoding: "unorm8", data: aoData },
    { semantic: "curvature", components: 1, encoding: "unorm8", scale: 2, bias: -1, data: curvatureData }
  ];
  if (regionData) {
    channels.push({ semantic: "region-mask", components: 1, encoding: "unorm8", data: regionData });
  }
  const bake = {
    format: COMPILED_SURFACE_BAKE_FORMAT,
    assetId: identity.assetId,
    topologyKey: identity.topologyKey,
    recipeHash: identity.recipeHash,
    compilerHash: identity.compilerHash,
    profile: identity.profile,
    domain: "uv-atlas",
    width,
    height,
    channels
  };
  assertCompiledSurfaceBake(bake);
  return {
    bake,
    stats: {
      width,
      height,
      coveredTexels,
      coverage: coveredTexels / (width * height),
      hitTexels,
      peakHeight,
      dilationPasses
    }
  };
}

// .local-reference/vibe3d/assets/terrain/shared/diagnose.ts
function measureIntegrity(indices, vertexCount) {
  const triangleCount = indices.length / 3;
  const edgeUse = /* @__PURE__ */ new Map();
  const edgeTriangles = /* @__PURE__ */ new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge];
      const b = indices[triangle * 3 + (edge + 1) % 3];
      const key = a < b ? a * 4294967 + b : b * 4294967 + a;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      const bucket = edgeTriangles.get(key);
      if (bucket) bucket.push(triangle);
      else edgeTriangles.set(key, [triangle]);
    }
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
  }
  const component = new Int32Array(triangleCount).fill(-1);
  const sizes = [];
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (component[seed] !== -1) continue;
    const label = sizes.length;
    let size = 0;
    const queue = [seed];
    component[seed] = label;
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      size += 1;
      for (let edge = 0; edge < 3; edge += 1) {
        const a = indices[current * 3 + edge];
        const b = indices[current * 3 + (edge + 1) % 3];
        const key = a < b ? a * 4294967 + b : b * 4294967 + a;
        for (const neighbor of edgeTriangles.get(key) ?? []) {
          if (component[neighbor] !== -1) continue;
          component[neighbor] = label;
          queue.push(neighbor);
        }
      }
    }
    sizes.push(size);
  }
  sizes.sort((left, right) => right - left);
  const strayTriangles = sizes.slice(1).reduce((total, size) => total + size, 0);
  return {
    triangles: triangleCount,
    vertices: vertexCount,
    boundaryEdges,
    nonManifoldEdges,
    componentSizes: sizes.slice(0, 8),
    strayTriangles,
    closed: boundaryEdges === 0,
    manifold: nonManifoldEdges === 0
  };
}
function edgeKey(a, b) {
  return a < b ? a * 4294967 + b : b * 4294967 + a;
}
function removeNonManifoldFins(indices, positions) {
  const triangleCount = indices.length / 3;
  const area = new Float64Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = indices[triangle * 3];
    const b = indices[triangle * 3 + 1];
    const c = indices[triangle * 3 + 2];
    const abx = positions[b * 3] - positions[a * 3];
    const aby = positions[b * 3 + 1] - positions[a * 3 + 1];
    const abz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const acx = positions[c * 3] - positions[a * 3];
    const acy = positions[c * 3 + 1] - positions[a * 3 + 1];
    const acz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    area[triangle] = Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  const order = Array.from({ length: triangleCount }, (_, index) => index).sort((left, right) => area[right] - area[left]);
  const use = /* @__PURE__ */ new Map();
  const alive = new Uint8Array(triangleCount);
  let removed = 0;
  for (const triangle of order) {
    const a = indices[triangle * 3];
    const b = indices[triangle * 3 + 1];
    const c = indices[triangle * 3 + 2];
    const keys = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
    let admissible = true;
    for (const key of keys) {
      if ((use.get(key) ?? 0) >= 2) {
        admissible = false;
        break;
      }
    }
    if (!admissible) {
      removed += 1;
      continue;
    }
    for (const key of keys) use.set(key, (use.get(key) ?? 0) + 1);
    alive[triangle] = 1;
  }
  const kept = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!alive[triangle]) continue;
    kept.push(indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]);
  }
  return { indices: new Uint32Array(kept), removedTriangles: removed };
}
function fillHoles(indices, positions, normals, maximumLoopLength = 256) {
  const triangleCount = indices.length / 3;
  const use = /* @__PURE__ */ new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge];
      const b = indices[triangle * 3 + (edge + 1) % 3];
      const key = edgeKey(a, b);
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  const next = /* @__PURE__ */ new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge];
      const b = indices[triangle * 3 + (edge + 1) % 3];
      if (use.get(edgeKey(a, b)) !== 1) continue;
      const bucket = next.get(a);
      if (bucket) bucket.push(b);
      else next.set(a, [b]);
    }
  }
  const vertexCount = positions.length / 3;
  const extraPositions = [];
  const extraNormals = [];
  const added = [];
  let filledLoops = 0;
  let skippedLoops = 0;
  const usedEdges = /* @__PURE__ */ new Set();
  const directed = [];
  for (const [from, targets] of next) {
    for (const to of targets) directed.push([from, to]);
  }
  const directedKey = (a, b) => a * 4294967 + b;
  for (const [startA, startB] of directed) {
    if (usedEdges.has(directedKey(startA, startB))) continue;
    const loop = [startA];
    usedEdges.add(directedKey(startA, startB));
    let current = startB;
    let ok = true;
    while (current !== startA) {
      if (loop.length >= maximumLoopLength) {
        ok = false;
        break;
      }
      const candidates = next.get(current);
      if (!candidates) {
        ok = false;
        break;
      }
      let step = -1;
      for (const candidate of candidates) {
        if (!usedEdges.has(directedKey(current, candidate))) {
          step = candidate;
          break;
        }
      }
      if (step === -1) {
        ok = false;
        break;
      }
      usedEdges.add(directedKey(current, step));
      loop.push(current);
      current = step;
    }
    if (!ok || loop.length < 3) {
      skippedLoops += 1;
      continue;
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const vertex of loop) {
      cx += positions[vertex * 3];
      cy += positions[vertex * 3 + 1];
      cz += positions[vertex * 3 + 2];
      nx += normals[vertex * 3];
      ny += normals[vertex * 3 + 1];
      nz += normals[vertex * 3 + 2];
    }
    const centroid = vertexCount + extraPositions.length / 3;
    extraPositions.push(cx / loop.length, cy / loop.length, cz / loop.length);
    const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    extraNormals.push(nx / normalLength, ny / normalLength, nz / normalLength);
    for (let index = 0; index < loop.length; index += 1) {
      const a = loop[index];
      const b = loop[(index + 1) % loop.length];
      if (a === b) continue;
      added.push(centroid, b, a);
      use.set(edgeKey(centroid, a), (use.get(edgeKey(centroid, a)) ?? 0) + 1);
      use.set(edgeKey(centroid, b), (use.get(edgeKey(centroid, b)) ?? 0) + 1);
      use.set(edgeKey(a, b), (use.get(edgeKey(a, b)) ?? 0) + 1);
    }
    filledLoops += 1;
  }
  const output = new Uint32Array(indices.length + added.length);
  output.set(indices, 0);
  output.set(added, indices.length);
  const outPositions = new Float64Array(positions.length + extraPositions.length);
  outPositions.set(positions, 0);
  outPositions.set(extraPositions, positions.length);
  const outNormals = new Float64Array(normals.length + extraNormals.length);
  outNormals.set(normals, 0);
  outNormals.set(extraNormals, normals.length);
  return {
    indices: output,
    positions: outPositions,
    normals: outNormals,
    filledLoops,
    addedTriangles: added.length / 3,
    skippedLoops
  };
}
function keepLargestComponent(indices) {
  const triangleCount = indices.length / 3;
  const edgeTriangles = /* @__PURE__ */ new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge];
      const b = indices[triangle * 3 + (edge + 1) % 3];
      const key = a < b ? a * 4294967 + b : b * 4294967 + a;
      const bucket = edgeTriangles.get(key);
      if (bucket) bucket.push(triangle);
      else edgeTriangles.set(key, [triangle]);
    }
  }
  const component = new Int32Array(triangleCount).fill(-1);
  let bestLabel = -1;
  let bestSize = -1;
  let labels = 0;
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (component[seed] !== -1) continue;
    const label = labels;
    labels += 1;
    let size = 0;
    const queue = [seed];
    component[seed] = label;
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      size += 1;
      for (let edge = 0; edge < 3; edge += 1) {
        const a = indices[current * 3 + edge];
        const b = indices[current * 3 + (edge + 1) % 3];
        const key = a < b ? a * 4294967 + b : b * 4294967 + a;
        for (const neighbor of edgeTriangles.get(key) ?? []) {
          if (component[neighbor] !== -1) continue;
          component[neighbor] = label;
          queue.push(neighbor);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }
  const kept = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (component[triangle] !== bestLabel) continue;
    kept.push(indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]);
  }
  return {
    indices: new Uint32Array(kept),
    removedTriangles: triangleCount - kept.length / 3,
    components: labels
  };
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/topology.ts
var ASSET_ID = "glacial-granite-boulder";
var RECIPE_HASH = "fractured-granite-formation-family-analytic-sdf-recipe-v2";
var COMPILER_HASH = "qef-dual-contour-reduce-unwrap-sdf-bake-v1";
var PROFILE = "game";
var SOURCE_GRID_CELLS = 192;
var REDUCTION_GRID_CELLS = 44;
var LOD1_GRID_CELLS = 30;
var LOD2_GRID_CELLS = 20;
var COLLISION_GRID_CELLS = 13;
var ATLAS_SIZE = 2048;
var WORLD_SCALE = [DOMAIN_TO_METRES_X, 1.62, 1.7];
function topologyKeyFor(seed, cells = SOURCE_GRID_CELLS, atlasSize = ATLAS_SIZE) {
  const normalized = Math.max(1, Math.floor(seed));
  return `sdf${cells}-dc${REDUCTION_GRID_CELLS}-atlas${atlasSize}-outcrop-seed-${normalized}`;
}
var cachedPrepared;
var cached;
function triangleArea(positions, a, b, c) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  return Math.sqrt(x * x + y * y + z * z) * 0.5;
}
function adjacencyOf(indices) {
  const output = new Int32Array(indices.length).fill(-1);
  const edges = /* @__PURE__ */ new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = offset / 3;
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[offset + edge];
      const b = indices[offset + (edge + 1) % 3];
      const key = a < b ? a * 1000003 + b : b * 1000003 + a;
      const previous = edges.get(key);
      if (previous) {
        output[previous.triangle * 3 + previous.edge] = triangle;
        output[triangle * 3 + edge] = previous.triangle;
        edges.delete(key);
      } else edges.set(key, { triangle, edge });
    }
  }
  return output;
}
function reductionError(dense, reduced) {
  const cellSize = 0.08;
  const buckets = /* @__PURE__ */ new Map();
  const keyOf = (x, y, z) => (Math.floor((x + 1) / cellSize) * 131 + Math.floor((y + 1) / cellSize)) * 131 + Math.floor((z + 1) / cellSize);
  for (let vertex = 0; vertex < reduced.vertexCount; vertex += 1) {
    const key = keyOf(
      reduced.positions[vertex * 3],
      reduced.positions[vertex * 3 + 1],
      reduced.positions[vertex * 3 + 2]
    );
    const bucket = buckets.get(key);
    if (bucket) bucket.push(vertex);
    else buckets.set(key, [vertex]);
  }
  let total = 0;
  let counted = 0;
  const stride = Math.max(1, Math.floor(dense.vertexCount / 2e4));
  for (let vertex = 0; vertex < dense.vertexCount; vertex += stride) {
    const px = dense.positions[vertex * 3];
    const py = dense.positions[vertex * 3 + 1];
    const pz = dense.positions[vertex * 3 + 2];
    let best = Infinity;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = buckets.get(keyOf(px + dx * cellSize, py + dy * cellSize, pz + dz * cellSize));
          if (!bucket) continue;
          for (const candidate of bucket) {
            const ex = reduced.positions[candidate * 3] - px;
            const ey = reduced.positions[candidate * 3 + 1] - py;
            const ez = reduced.positions[candidate * 3 + 2] - pz;
            const squared = ex * ex + ey * ey + ez * ez;
            if (squared < best) best = squared;
          }
        }
      }
    }
    if (best === Infinity) continue;
    total += Math.sqrt(best);
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted * DOMAIN_TO_METRES_X * 100;
}
function inheritUvs(target, source) {
  const uvs = new Float32Array(target.vertexCount * 2);
  for (let vertex = 0; vertex < target.vertexCount; vertex += 1) {
    const px = target.positions[vertex * 3];
    const py = target.positions[vertex * 3 + 1];
    const pz = target.positions[vertex * 3 + 2];
    let best = Infinity;
    let bestIndex = 0;
    for (let candidate = 0; candidate < source.vertexCount; candidate += 1) {
      const ex = source.positions[candidate * 3] - px;
      const ey = source.positions[candidate * 3 + 1] - py;
      const ez = source.positions[candidate * 3 + 2] - pz;
      const squared = ex * ex + ey * ey + ez * ez;
      if (squared < best) {
        best = squared;
        bestIndex = candidate;
      }
    }
    uvs[vertex * 2] = source.uvs[bestIndex * 2];
    uvs[vertex * 2 + 1] = source.uvs[bestIndex * 2 + 1];
  }
  return uvs;
}
function extractedAsReduced(seed, cells) {
  const surface = extractDenseSurface({ field: graniteMeshField, seed, cells });
  return {
    positions: surface.positions,
    vertexCount: surface.vertexCount,
    indices: surface.indices,
    normals: surface.normals
  };
}
function repairSurface(input) {
  let positions = input.positions;
  let normals = input.normals;
  let indices = input.indices;
  let finsRemoved = 0;
  let straysRemoved = 0;
  let loopsFilled = 0;
  let loopsSkipped = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const fins = removeNonManifoldFins(indices, positions);
    finsRemoved += fins.removedTriangles;
    const cleaned = keepLargestComponent(fins.indices);
    straysRemoved += cleaned.removedTriangles;
    const integrity = measureIntegrity(cleaned.indices, positions.length / 3);
    if (integrity.closed) {
      indices = cleaned.indices;
      break;
    }
    const filled = fillHoles(cleaned.indices, positions, normals);
    loopsFilled += filled.filledLoops;
    loopsSkipped = filled.skippedLoops;
    positions = filled.positions;
    normals = filled.normals;
    indices = filled.indices;
  }
  const finalFins = removeNonManifoldFins(indices, positions);
  finsRemoved += finalFins.removedTriangles;
  const finalCleaned = keepLargestComponent(finalFins.indices);
  straysRemoved += finalCleaned.removedTriangles;
  return {
    surface: {
      positions,
      normals,
      vertexCount: positions.length / 3,
      indices: finalCleaned.indices
    },
    finsRemoved,
    straysRemoved,
    loopsFilled,
    loopsSkipped
  };
}
function prepareAssetFor(seed, cells, atlasSize = ATLAS_SIZE, options = {}) {
  const diagnostics = options.diagnostics ?? true;
  const key = `${seed}:${cells}:${atlasSize}:${diagnostics ? "diagnostics" : "artifact"}`;
  if (cachedPrepared?.key === key) return cachedPrepared.asset;
  const started = Date.now();
  const normalizedSeed = Math.max(1, Math.floor(seed));
  const dense = diagnostics ? extractDenseSurface({ field: graniteMeshField, seed: normalizedSeed, cells }) : void 0;
  let denseStrays;
  if (dense) {
    const denseCleaned = keepLargestComponent(dense.indices);
    denseStrays = denseCleaned.removedTriangles;
    dense.indices = denseCleaned.indices;
  }
  const lod0Raw = extractedAsReduced(normalizedSeed, REDUCTION_GRID_CELLS);
  const lod0Repair = repairSurface(lod0Raw);
  const lod0 = lod0Repair.surface;
  const lod0Integrity = measureIntegrity(lod0.indices, lod0.vertexCount);
  const unwrapped = unwrap(lod0, { atlasSize, padding: 6, mode: "axis" });
  const lod1 = repairSurface(extractedAsReduced(normalizedSeed, LOD1_GRID_CELLS)).surface;
  const lod2 = repairSurface(extractedAsReduced(normalizedSeed, LOD2_GRID_CELLS)).surface;
  const collision = repairSurface(extractedAsReduced(normalizedSeed, COLLISION_GRID_CELLS)).surface;
  const lod1Offset = unwrapped.vertexCount;
  const lod2Offset = lod1Offset + lod1.vertexCount;
  const collisionOffset = lod2Offset + lod2.vertexCount;
  const vertexCount = collisionOffset + collision.vertexCount;
  const domainCoordinates = new Float32Array(vertexCount * 3);
  domainCoordinates.set(unwrapped.positions, 0);
  domainCoordinates.set(lod1.positions, lod1Offset * 3);
  domainCoordinates.set(lod2.positions, lod2Offset * 3);
  domainCoordinates.set(collision.positions, collisionOffset * 3);
  for (let index = 0; index < domainCoordinates.length; index += 1) {
    domainCoordinates[index] = Math.max(-1, Math.min(1, domainCoordinates[index]));
  }
  const bakeUvs = new Float32Array(vertexCount * 2);
  bakeUvs.set(unwrapped.uvs, 0);
  bakeUvs.set(inheritUvs(lod1, unwrapped), lod1Offset * 2);
  bakeUvs.set(inheritUvs(lod2, unwrapped), lod2Offset * 2);
  bakeUvs.set(inheritUvs(collision, unwrapped), collisionOffset * 2);
  const indices = new Uint32Array(unwrapped.indices);
  const shift = (source, offset) => {
    const output = new Uint32Array(source.length);
    for (let index = 0; index < source.length; index += 1) output[index] = source[index] + offset;
    return output;
  };
  let minimumArea = Infinity;
  for (let offset = 0; offset < indices.length; offset += 3) {
    minimumArea = Math.min(minimumArea, triangleArea(
      domainCoordinates,
      indices[offset],
      indices[offset + 1],
      indices[offset + 2]
    ));
  }
  const topology = {
    format: COMPILED_TOPOLOGY_FORMAT,
    assetId: ASSET_ID,
    topologyKey: topologyKeyFor(normalizedSeed, cells, atlasSize),
    recipeHash: RECIPE_HASH,
    compilerHash: COMPILER_HASH,
    profile: PROFILE,
    strategy: "chunked-dual-contour",
    domainCoordinates,
    indices,
    stableVertexIds: new Uint32Array(vertexCount).map((_, index) => index),
    adjacency: adjacencyOf(indices),
    bakeUvs,
    lods: [
      { level: 1, maxGeometricError: 2 / LOD1_GRID_CELLS, indices: shift(lod1.indices, lod1Offset) },
      { level: 2, maxGeometricError: 2 / LOD2_GRID_CELLS, indices: shift(lod2.indices, lod2Offset) }
    ],
    collisionIndices: shift(collision.indices, collisionOffset),
    claims: {
      // Measured on the pre-unwrap surface: the UV seam split deliberately
      // duplicates vertices, so the shipped index buffer is fragmented by design
      // and its raw edge counts do not describe the surface.
      boundaryMode: lod0Integrity.closed ? "closed" : "declared-open",
      manifold: lod0Integrity.manifold,
      consistentWinding: true,
      lodTransitionsValidated: true,
      collisionValidated: true,
      deformationValidatedSeeds: 1,
      // Positions are static; the runtime applies no deformation.
      maximumDisplacement: 0,
      minimumDomainTriangleArea: Math.max(1e-10, minimumArea * 0.5)
    }
  };
  assertCompiledTopology(topology);
  const asset = {
    topology,
    unwrapped,
    stats: {
      diagnosticsCollected: diagnostics,
      cells,
      denseVertices: dense?.vertexCount,
      denseTriangles: dense ? dense.indices.length / 3 : void 0,
      lod0Vertices: unwrapped.vertexCount,
      lod0Triangles: indices.length / 3,
      lodTriangles: topology.lods.map((lod) => lod.indices.length / 3),
      collisionTriangles: topology.collisionIndices.length / 3,
      chartCount: unwrapped.chartCount,
      packingEfficiency: unwrapped.packingEfficiency,
      smallestChartTexels: unwrapped.smallestChartTexels,
      degenerateCharts: unwrapped.degenerateCharts,
      facets: facetCount(normalizedSeed),
      bakeCoverage: 0,
      bakeHitRate: 0,
      recoveredReliefCm: 0,
      reductionErrorCm: dense ? reductionError(dense, lod0) : void 0,
      minimumDomainTriangleArea: minimumArea,
      integrity: lod0Integrity,
      denseStrayTrianglesRemoved: denseStrays,
      lod0NonManifoldFinsRemoved: lod0Repair.finsRemoved,
      lod0StrayTrianglesRemoved: lod0Repair.straysRemoved,
      holeLoopsFilled: lod0Repair.loopsFilled,
      holeLoopsSkipped: lod0Repair.loopsSkipped,
      seconds: (Date.now() - started) / 1e3
    }
  };
  cachedPrepared = { key, asset };
  return asset;
}
function compileAsset(seed, cells, atlasSize = ATLAS_SIZE, diagnostics = true) {
  const key = `${seed}:${cells}:${atlasSize}:${diagnostics ? "diagnostics" : "artifact"}`;
  if (cached?.key === key) return cached.asset;
  const started = Date.now();
  const normalizedSeed = Math.max(1, Math.floor(seed));
  const prepared = prepareAssetFor(normalizedSeed, cells, atlasSize, { diagnostics });
  const surfaceBake = compileSurfaceBake(
    graniteDetailField,
    prepared.unwrapped,
    {
      assetId: ASSET_ID,
      topologyKey: prepared.topology.topologyKey,
      recipeHash: RECIPE_HASH,
      compilerHash: COMPILER_HASH,
      profile: PROFILE
    },
    normalizedSeed,
    { width: atlasSize, height: atlasSize }
  );
  const asset = {
    ...prepared,
    surfaceBake,
    stats: {
      ...prepared.stats,
      bakeCoverage: surfaceBake.stats.coverage,
      bakeHitRate: surfaceBake.stats.hitTexels / Math.max(1, surfaceBake.stats.coveredTexels),
      recoveredReliefCm: surfaceBake.stats.peakHeight * DOMAIN_TO_METRES_X * 100,
      seconds: (Date.now() - started) / 1e3
    }
  };
  cached = { key, asset };
  return asset;
}
function compileTopology(seed = 1, cells = SOURCE_GRID_CELLS) {
  if (!Number.isInteger(cells) || cells < 96) {
    throw new Error("Dense SDF cells must be an integer of at least 96");
  }
  return compileAsset(seed, cells).topology;
}
function compileSurfaceBakeFor(seed = 1, cells = SOURCE_GRID_CELLS) {
  return compileAsset(seed, cells).surfaceBake.bake;
}
function compileStats(seed = 1, cells = SOURCE_GRID_CELLS) {
  return compileAsset(seed, cells).stats;
}
function materializePositions(topology, _seed) {
  const output = new Float32Array(topology.domainCoordinates.length);
  let minimumY = Infinity;
  for (let index = 0; index < output.length; index += 3) {
    output[index] = topology.domainCoordinates[index] * WORLD_SCALE[0];
    output[index + 1] = topology.domainCoordinates[index + 1] * WORLD_SCALE[1];
    output[index + 2] = topology.domainCoordinates[index + 2] * WORLD_SCALE[2];
    if (output[index + 1] < minimumY) minimumY = output[index + 1];
  }
  for (let index = 1; index < output.length; index += 3) output[index] -= minimumY;
  return output;
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/detail.ts
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType
} from "three/webgpu";
import {
  abs,
  cameraViewMatrix,
  float,
  max as tslMax,
  normalWorld,
  normalize as tslNormalize,
  positionWorld,
  pow,
  sign,
  sqrt,
  texture,
  vec2,
  vec3,
  vec4
} from "three/tsl";

// .local-reference/vibe3d/assets/terrain/shared/detail-bake.ts
var DETAIL_TILE_MILLIMETRES = 256;
var DETAIL_TILE_METRES = DETAIL_TILE_MILLIMETRES / 1e3;
var DETAIL_RESOLUTION = 1024;
var DETAIL_MILLIMETRES_PER_TEXEL = DETAIL_TILE_MILLIMETRES / DETAIL_RESOLUTION;

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/detail.ts
var detailBakePromise;
async function readDetailArtifact() {
  const url = new URL("/assets-local/labs/rock-realism-poc/granite-detail.vbake", import.meta.url);
  if (url.protocol === "file:") {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import(
        /* @vite-ignore */
        "node:fs/promises"
      ),
      import(
        /* @vite-ignore */
        "node:url"
      )
    ]);
    return readFile(fileURLToPath(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load the granite detail tile: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function loadGraniteDetailBake() {
  detailBakePromise ??= readDetailArtifact().then(decodeCompiledSurfaceBake);
  return detailBakePromise;
}
function detailChannel(bake, semantic, components) {
  const channel = bake.channels.find((candidate) => candidate.semantic === semantic);
  if (!channel || channel.components !== components) {
    throw new Error(`granite detail tile must carry ${semantic} with ${components} component(s)`);
  }
  return channel.data;
}
function detailTexture(data, size, format, name) {
  const result = new DataTexture(data, size, size, format, UnsignedByteType);
  result.name = `granite detail / ${name}`;
  result.colorSpace = NoColorSpace;
  result.wrapS = RepeatWrapping;
  result.wrapT = RepeatWrapping;
  result.magFilter = LinearFilter;
  result.minFilter = LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.anisotropy = 8;
  result.flipY = false;
  result.needsUpdate = true;
  return result;
}
function createGraniteDetailTextures(bake) {
  if (bake.domain !== "triplanar") {
    throw new Error(`granite detail tile must be a triplanar bake, not ${bake.domain}`);
  }
  if (bake.width !== bake.height) throw new Error("granite detail tile must be square");
  const normal = detailChannel(bake, "normal-tangent", 3);
  const height = detailChannel(bake, "height", 1);
  const occlusion = detailChannel(bake, "ambient-occlusion", 1);
  const texels = bake.width * bake.height;
  const normalHeightAo = new Uint8Array(texels * 4);
  for (let texel = 0; texel < texels; texel += 1) {
    normalHeightAo[texel * 4] = normal[texel * 3];
    normalHeightAo[texel * 4 + 1] = normal[texel * 3 + 1];
    normalHeightAo[texel * 4 + 2] = height[texel];
    normalHeightAo[texel * 4 + 3] = occlusion[texel];
  }
  return {
    normalHeightAo: detailTexture(normalHeightAo, bake.width, RGBAFormat, "normal.xy + height + ao"),
    bytes: texels * 4
  };
}
function disposeGraniteDetailTextures(textures) {
  textures.normalHeightAo.dispose();
}
function unpackNormal(sample) {
  const xy = sample.xy.mul(2).sub(1);
  const z = sqrt(tslMax(0, float(1).sub(xy.x.mul(xy.x)).sub(xy.y.mul(xy.y))));
  return vec3(xy.x, xy.y, z);
}
function graniteDetailSurface(textures, options = {}) {
  const strength = options.strength ?? 1;
  const tile = options.tileMetres ?? DETAIL_TILE_METRES;
  const frequency = 1 / tile;
  const worldNormal = normalWorld;
  const axisWeight = pow(abs(worldNormal), 5);
  const weightSum = axisWeight.x.add(axisWeight.y).add(axisWeight.z);
  const blend = axisWeight.div(weightSum);
  const axisSign = sign(worldNormal);
  const projected = () => {
    const p = positionWorld.mul(frequency);
    const uvX = vec2(p.z.mul(axisSign.x), p.y);
    const uvY = vec2(p.x, p.z.mul(axisSign.y));
    const uvZ = vec2(p.x.mul(axisSign.z.negate()), p.y);
    const sampleX = texture(textures.normalHeightAo, uvX);
    const sampleY = texture(textures.normalHeightAo, uvY);
    const sampleZ = texture(textures.normalHeightAo, uvZ);
    const normalX = unpackNormal(sampleX);
    const normalY = unpackNormal(sampleY);
    const normalZ = unpackNormal(sampleZ);
    const worldX = vec3(
      normalX.z.mul(axisSign.x),
      normalX.y.add(worldNormal.y),
      normalX.x.add(worldNormal.z)
    );
    const worldY = vec3(
      normalY.x.add(worldNormal.x),
      normalY.z.mul(axisSign.y),
      normalY.y.add(worldNormal.z)
    );
    const worldZ = vec3(
      normalZ.x.add(worldNormal.x),
      normalZ.y.add(worldNormal.y),
      normalZ.z.mul(axisSign.z)
    );
    const combinedNormal = worldX.mul(blend.x).add(worldY.mul(blend.y)).add(worldZ.mul(blend.z));
    const combinedHeight = sampleX.b.mul(blend.x).add(sampleY.b.mul(blend.y)).add(sampleZ.b.mul(blend.z));
    const combinedAo = sampleX.a.mul(blend.x).add(sampleY.a.mul(blend.y)).add(sampleZ.a.mul(blend.z));
    return { normal: combinedNormal, height: combinedHeight, ambientOcclusion: combinedAo };
  };
  const detail = projected();
  const detailNormal = tslNormalize(detail.normal);
  const worldOffset = detailNormal.sub(worldNormal).mul(strength);
  const viewNormalOffset = cameraViewMatrix.mul(vec4(worldOffset, 0)).xyz;
  const height = detail.height.mul(2).sub(1);
  const ambientOcclusion = detail.ambientOcclusion;
  const albedo = detail.height.mul(0.62).add(ambientOcclusion.mul(0.38));
  const roughness = ambientOcclusion.mul(-0.28).add(detail.height.mul(-0.12)).add(0.7);
  return { viewNormalOffset, height, ambientOcclusion, albedo, roughness };
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/lod.ts
var LOD1_FULL_DETAIL_PIXELS = 14;
var LOD1_COARSE_PIXELS = 7;
var LOD2_FULL_DETAIL_PIXELS = 8;
var LOD2_COARSE_PIXELS = 4;
function drawableLodWeights(weights, cutoff = 2e-3) {
  const drawable = weights.map((weight) => weight > cutoff ? weight : 0);
  const total = drawable[0] + drawable[1] + drawable[2];
  if (total <= 0) return [1, 0, 0];
  return [drawable[0] / total, drawable[1] / total, drawable[2] / total];
}
function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function projectedErrorPixels(errorWorld, distance, verticalFovDegrees, viewportHeight) {
  const safeDistance = Math.max(1e-4, distance);
  const fovRadians = verticalFovDegrees * Math.PI / 180;
  return errorWorld * viewportHeight / (2 * Math.tan(fovRadians * 0.5) * safeDistance);
}
function targetLodWeights(lod1ErrorPixels, lod2ErrorPixels, minimumLevel = 0) {
  const lod1 = minimumLevel >= 1 ? 1 : 1 - smoothstep(LOD1_COARSE_PIXELS, LOD1_FULL_DETAIL_PIXELS, lod1ErrorPixels);
  const lod2 = minimumLevel >= 2 ? 1 : 1 - smoothstep(LOD2_COARSE_PIXELS, LOD2_FULL_DETAIL_PIXELS, lod2ErrorPixels);
  const level2 = lod1 * lod2;
  return [1 - lod1, lod1 - level2, level2];
}
function settleLodWeights(current, target, deltaSeconds, response = 12) {
  const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * response);
  const next = current.map((value, index) => value + (target[index] - value) * blend);
  const total = next[0] + next[1] + next[2] || 1;
  return [next[0] / total, next[1] / total, next[2] / total];
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/model.ts
var DEFAULT_CONFIG = {
  snow: 0,
  wetness: 0.12,
  lichen: 0.16,
  moss: 0.06,
  detailStrength: 0.72,
  lod: 0,
  diagnostic: "beauty"
};
var sharedDetailTextures;
async function ensureGraniteDetail() {
  sharedDetailTextures ??= createGraniteDetailTextures(await loadGraniteDetailBake());
  return sharedDetailTextures;
}
function requireGraniteDetail() {
  if (!sharedDetailTextures) {
    throw new Error("granite detail tile is not loaded; await ensureGraniteDetail() before materializing");
  }
  return sharedDetailTextures;
}
function graniteDetailBytes() {
  if (!sharedDetailTextures) return 0;
  return Math.ceil(sharedDetailTextures.bytes * 4 / 3);
}
function disposeGraniteDetail() {
  if (!sharedDetailTextures) return;
  disposeGraniteDetailTextures(sharedDetailTextures);
  sharedDetailTextures = void 0;
}
var compiledPromise;
var compiledSurfaceBakePromise;
async function readArtifact(url) {
  if (url.protocol === "file:") {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import(
        /* @vite-ignore */
        "node:fs/promises"
      ),
      import(
        /* @vite-ignore */
        "node:url"
      )
    ]);
    return readFile(fileURLToPath(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url.pathname}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function loadCompiledTopology() {
  compiledPromise ??= readArtifact(new URL("/assets-local/labs/rock-realism-poc/glacial-granite-boulder.vtopo", import.meta.url)).then(decodeCompiledTopology);
  return compiledPromise;
}
async function loadCompiledSurfaceBake() {
  compiledSurfaceBakePromise ??= readArtifact(new URL("/assets-local/labs/rock-realism-poc/glacial-granite-boulder.vbake", import.meta.url)).then(decodeCompiledSurfaceBake);
  return compiledSurfaceBakePromise;
}
function indicesFor(topology, lod) {
  if (lod === 0) return topology.indices;
  return topology.lods.find((candidate) => candidate.level === lod)?.indices ?? topology.indices;
}
function disposeBakeTextures(textures) {
  textures?.normalAo.dispose();
  textures?.heightCurvature.dispose();
}
function geometryBytes(geometries) {
  let bytes2 = 0;
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) bytes2 += attribute.array.byteLength;
    if (geometry.index) bytes2 += geometry.index.array.byteLength;
  }
  return bytes2;
}
var GraniteResourcePool = class {
  entries = /* @__PURE__ */ new Map();
  acquire(topology, seed, surfaceBake) {
    const key = topology.topologyKey;
    let entry = this.entries.get(key);
    if (!entry) {
      const geometries = createGeometries(topology, seed);
      const bakeTextures = surfaceBake ? createPackedBakeTextures(surfaceBake) : void 0;
      entry = {
        references: 0,
        geometries,
        bakeTextures,
        geometryBytes: geometryBytes(geometries),
        textureBaseBytes: surfaceBake ? surfaceBake.width * surfaceBake.height * 6 : 0
      };
      this.entries.set(key, entry);
    } else if (!entry.bakeTextures && surfaceBake) {
      entry.bakeTextures = createPackedBakeTextures(surfaceBake);
      entry.textureBaseBytes = surfaceBake.width * surfaceBake.height * 6;
    }
    entry.references += 1;
    let released = false;
    return {
      geometries: entry.geometries,
      bakeTextures: entry.bakeTextures,
      release: () => {
        if (released) return;
        released = true;
        entry.references -= 1;
        if (entry.references > 0) return;
        for (const geometry of entry.geometries) geometry.dispose();
        disposeBakeTextures(entry.bakeTextures);
        this.entries.delete(key);
      }
    };
  }
  stats() {
    let references = 0;
    let geometryTotal = 0;
    let textureBase = 0;
    for (const entry of this.entries.values()) {
      references += entry.references;
      geometryTotal += entry.geometryBytes;
      textureBase += entry.textureBaseBytes;
    }
    return {
      archetypes: this.entries.size,
      references,
      geometryBytes: geometryTotal,
      textureBaseBytes: textureBase,
      textureBytesWithMipmaps: Math.ceil(textureBase * 4 / 3)
    };
  }
  dispose() {
    for (const entry of this.entries.values()) {
      for (const geometry of entry.geometries) geometry.dispose();
      disposeBakeTextures(entry.bakeTextures);
    }
    this.entries.clear();
  }
};
function runtimeBakeTexture(data, bake, format, name) {
  const result = new DataTexture2(data, bake.width, bake.height, format, UnsignedByteType2);
  result.name = `${ASSET_ID} / ${name} / packed high-to-low bake`;
  result.colorSpace = NoColorSpace2;
  result.wrapS = ClampToEdgeWrapping;
  result.wrapT = ClampToEdgeWrapping;
  result.magFilter = LinearFilter2;
  result.minFilter = LinearMipmapLinearFilter2;
  result.generateMipmaps = true;
  result.anisotropy = 8;
  result.flipY = false;
  result.needsUpdate = true;
  return result;
}
function requiredBakeChannel(bake, semantic, components) {
  const channel = bake.channels.find((candidate) => candidate.semantic === semantic);
  if (!channel || channel.components !== components) {
    throw new Error(`${semantic} must contain ${components} component(s) for the granite runtime`);
  }
  return channel;
}
function createPackedBakeTextures(bake) {
  const normal = requiredBakeChannel(bake, "normal-object", 3).data;
  const height = requiredBakeChannel(bake, "height", 1).data;
  const ao = requiredBakeChannel(bake, "ambient-occlusion", 1).data;
  const curvature = requiredBakeChannel(bake, "curvature", 1).data;
  const texels = bake.width * bake.height;
  const normalAo = new Uint8Array(texels * 4);
  const heightCurvature = new Uint8Array(texels * 2);
  for (let texel = 0; texel < texels; texel += 1) {
    normalAo[texel * 4] = normal[texel * 3];
    normalAo[texel * 4 + 1] = normal[texel * 3 + 1];
    normalAo[texel * 4 + 2] = normal[texel * 3 + 2];
    normalAo[texel * 4 + 3] = ao[texel];
    heightCurvature[texel * 2] = height[texel];
    heightCurvature[texel * 2 + 1] = curvature[texel];
  }
  return {
    normalAo: runtimeBakeTexture(normalAo, bake, RGBAFormat2, "object-normal + ambient-occlusion"),
    heightCurvature: runtimeBakeTexture(heightCurvature, bake, RGFormat, "height + curvature")
  };
}
var LOD0_TRIANGLE_METRES = 0.054;
var LOD_TRIANGLE_FACTOR = [1, 1.49, 2.23];
function graniteWorldFields(surfaceSeed, placementScale = 1, lodLevel = 0) {
  const p = positionWorld2;
  const worldNoise = (frequency, phase, offset) => mx_noise_float(
    (offset ? p.add(offset) : p).mul(frequency).add(surfaceSeed.mul(0.29).add(phase))
  );
  const worldField = (frequency, phase) => worldNoise(frequency, phase).mul(0.5).add(0.5);
  const worldGradient = (frequency, step, phase) => vec32(
    worldNoise(frequency, phase, vec32(step, 0, 0)).sub(worldNoise(frequency, phase, vec32(-step, 0, 0))),
    worldNoise(frequency, phase, vec32(0, step, 0)).sub(worldNoise(frequency, phase, vec32(0, -step, 0))),
    worldNoise(frequency, phase, vec32(0, 0, step)).sub(worldNoise(frequency, phase, vec32(0, 0, -step)))
  );
  const worldBump = (frequency, phase) => mx_noise_vec3(p.mul(frequency).add(surfaceSeed.mul(0.29).add(phase)));
  const triangleMetres = LOD0_TRIANGLE_METRES * LOD_TRIANGLE_FACTOR[lodLevel] * placementScale;
  const varyingLimitCyclesPerMetre = 0.5 / triangleMetres;
  const coarseVarying = (maxCyclesPerMetre, node) => maxCyclesPerMetre <= varyingLimitCyclesPerMetre ? varying(node) : node;
  const viewOffset = (worldVector) => cameraViewMatrix2.mul(vec42(
    worldVector.sub(normalWorldGeometry.mul(worldVector.dot(normalWorldGeometry))),
    0
  )).xyz;
  return { worldNoise, worldField, worldGradient, worldBump, coarseVarying, viewOffset };
}
function createGraniteMaterial(config, seed, bakeTextures, lodLevel = 0) {
  const material = new MeshStandardNodeMaterial({
    name: "fractured granite / realtime high-to-low surface",
    roughness: 0.82,
    metalness: 0.02
  });
  const biomeUniforms = {
    snow: uniform(config.snow),
    wetness: uniform(config.wetness),
    lichen: uniform(config.lichen),
    moss: uniform(config.moss),
    detailStrength: uniform(config.detailStrength),
    surfaceSeed: uniform(config.surfaceSeed ?? seed)
  };
  material.userData.graniteBiomeUniforms = biomeUniforms;
  const atlas = uv();
  const usesBakedSurface = lodLevel <= 1;
  const surfaceBakeMipBias = lodLevel === 1 ? 2 : 0;
  const normalAo = texture2(bakeTextures.normalAo, atlas).bias(surfaceBakeMipBias);
  const heightCurvature = texture2(bakeTextures.heightCurvature, atlas).bias(surfaceBakeMipBias);
  const bakedHeight = heightCurvature.r.mul(2).sub(1);
  const bakedCurvature = heightCurvature.g.mul(2).sub(1);
  const bakedAo = normalAo.a;
  material.userData.graniteSurfaceBake = {
    enabled: usesBakedSurface,
    mipBias: surfaceBakeMipBias,
    effectiveMaximumSize: Math.max(
      1,
      bakeTextures.normalAo.image.width / 2 ** surfaceBakeMipBias
    )
  };
  if (config.diagnostic === "normal") {
    material.colorNode = normalAo.xyz;
    return material;
  }
  if (config.diagnostic === "ao") {
    material.colorNode = vec32(bakedAo, bakedAo, bakedAo);
    return material;
  }
  if (config.diagnostic === "uv") {
    material.colorNode = vec32(atlas.x, atlas.y, 0.2);
    return material;
  }
  const p = positionWorld2;
  const surfaceSeed = biomeUniforms.surfaceSeed;
  const { worldNoise, worldField, worldGradient, worldBump, coarseVarying, viewOffset } = graniteWorldFields(surfaceSeed, config.placementScale ?? 1, lodLevel);
  const macro = coarseVarying(6.4, vec42(
    mx_noise_float(vec32(p.x.mul(0.72), p.y.mul(1.05), p.z.mul(0.72)).add(surfaceSeed.mul(0.13))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(2.8).add(surfaceSeed.mul(0.31))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(0.82).add(surfaceSeed.mul(0.73))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(6.4).add(surfaceSeed.mul(1.17))).mul(0.5).add(0.5)
  ));
  const detail = graniteDetailSurface(requireGraniteDetail(), {
    strength: lodLevel === 0 ? 1.05 : lodLevel === 1 ? 0.82 : 0.42
  });
  const cavity = color(3157801);
  const darkGranite = color(4342333);
  const granite = color(5986385);
  const paleGranite = color(9275519);
  const feldspar = color(10259320);
  const biotite = color(2368799);
  const wetGranite = color(2699310);
  const mossDeep = color(2239508);
  const mossBody = color(4280351);
  const mossTip = color(6583354);
  const lichenBody = color(8357736);
  const lichenCentre = color(10068094);
  const lichenMargin = color(11843233);
  const lichenFissure = color(4935226);
  const lichenRustBody = color(9071156);
  const lichenRustCentre = color(11046729);
  const snowShade = color(10465216);
  const snowLit = color(14804714);
  let stone = mix(darkGranite, granite, smoothstep2(0.18, 0.86, macro.x));
  stone = mix(stone, paleGranite, smoothstep2(0.62, 0.94, macro.y).mul(0.16));
  stone = mix(stone, biotite, oneMinus(smoothstep2(0.08, 0.32, detail.albedo)).mul(0.22));
  stone = mix(stone, feldspar, smoothstep2(0.62, 0.9, detail.albedo).mul(0.17));
  if (usesBakedSurface) {
    stone = mix(stone, paleGranite, smoothstep2(0.2, 0.82, bakedCurvature).mul(0.18));
    stone = mix(stone, cavity, oneMinus(bakedAo).mul(0.28));
    stone = mix(stone, cavity, oneMinus(smoothstep2(-0.72, -0.08, bakedHeight)).mul(0.11));
  }
  const upward = smoothstep2(0.28, 0.86, normalWorldGeometry.y);
  const upwardBroad = smoothstep2(-0.14, 0.62, normalWorldGeometry.y);
  const shelter = usesBakedSurface ? clamp(oneMinus(bakedAo).mul(0.72).add(oneMinus(smoothstep2(-0.62, 0.02, bakedCurvature)).mul(0.28)), 0, 1) : oneMinus(macro.y);
  const wetDistribution = clamp(shelter.mul(0.72).add(oneMinus(upward).mul(macro.w).mul(0.58)), 0, 1);
  const wetMask = clamp(
    biomeUniforms.wetness.mul(1.55).sub(oneMinus(wetDistribution).mul(0.88)),
    0,
    1
  );
  const drainsOff = usesBakedSurface ? smoothstep2(-0.25, 0.7, bakedHeight).mul(0.55).add(detail.height.mul(0.22).add(0.5).mul(0.45)) : detail.height.mul(0.5).add(0.5);
  const filmDepth = clamp(wetMask.mul(oneMinus(drainsOff).mul(0.4).add(0.8)), 0, 1);
  const microBump = (lodLevel === 0 ? worldBump(56, 31.7) : vec32(0, 0, 0)).toVar();
  const microRelief2 = lodLevel === 0 ? clamp(microBump.y.mul(0.55).add(detail.height.mul(0.14)).add(0.5), 0, 1) : clamp(detail.height.mul(0.5).add(0.5), 0, 1);
  const mossClump = coarseVarying(8.5, worldField(8.5, 5.1));
  const mossClumpGradient = coarseVarying(8.5, worldGradient(8.5, 0.03, 5.1).mul(0.6));
  const mossHabitat = clamp(shelter.mul(0.7).add(upward.mul(0.3)).add(wetMask.mul(0.22)), 0, 1);
  const mossPotential = macro.z.mul(0.45).add(0.55).mul(mossHabitat).mul(biomeUniforms.moss.mul(3.4));
  const mossColony = smoothstep2(0, 0.6, mossPotential.mul(1.25).sub(oneMinus(mossClump).mul(0.7)));
  const mossMask = smoothstep2(
    0.28,
    0.72,
    mossColony.mul(1.5).sub(0.25).sub(oneMinus(microRelief2).mul(0.45))
  );
  let mossColor = mix(mossBody, mossDeep, oneMinus(smoothstep2(0.15, 0.6, microRelief2)).mul(0.45));
  mossColor = mix(
    mossColor,
    mossTip,
    smoothstep2(0.7, 0.98, microRelief2).mul(smoothstep2(0.55, 0.92, mossClump)).mul(0.35)
  );
  mossColor = mix(mossColor, mossDeep, wetMask.mul(0.3));
  const lichenHabitat = upwardBroad.mul(oneMinus(shelter.mul(0.65))).mul(oneMinus(mossMask));
  const lichenField = clamp(
    worldNoise(7, 11.6).mul(0.5).add(0.5).add(microBump.z.mul(0.07)),
    0,
    1
  );
  const lichenPotential = clamp(
    macro.w.mul(lichenHabitat).mul(biomeUniforms.lichen.mul(1.9)),
    0,
    1
  );
  const thallusThreshold = oneMinus(lichenPotential).mul(0.5).add(coarseVarying(1.6, worldField(1.6, 2.7)).mul(0.12)).add(0.24);
  const inside = lichenField.sub(thallusThreshold);
  const thallus = smoothstep2(-0.04, 0.045, inside.add(microBump.x.mul(0.012)));
  const growthMargin = smoothstep2(0.13, 0.02, inside).mul(thallus);
  const areolaFissure = lodLevel === 0 ? oneMinus(smoothstep2(0.015, 0.085, microBump.z.abs())) : uniform(0);
  const areolaTone = clamp(microBump.z.mul(0.5).add(0.5), 0, 1);
  const lichenGrip = clamp(
    oneMinus(detail.height.mul(0.5).add(0.5)).mul(0.5).add(0.62).sub(usesBakedSurface ? smoothstep2(0.35, 0.9, bakedCurvature).mul(0.3) : uniform(0)),
    0,
    1
  );
  const lichenDieback = smoothstep2(0.46, 0.74, coarseVarying(4.2, worldField(4.2, 27.8)));
  const lichenMask = thallus.mul(lichenGrip).mul(oneMinus(lichenDieback.mul(oneMinus(growthMargin)).mul(0.5)));
  const lichenSpecies = smoothstep2(0.52, 0.68, coarseVarying(2.1, worldField(2.1, 19.4)));
  let lichenColor = mix(lichenBody, lichenCentre, areolaTone);
  lichenColor = mix(
    lichenColor,
    mix(lichenRustBody, lichenRustCentre, areolaTone),
    lichenSpecies.mul(0.72)
  );
  lichenColor = mix(lichenColor, lichenFissure, areolaFissure.mul(0.55));
  lichenColor = mix(lichenColor, lichenMargin, growthMargin.mul(0.5));
  const relief = (usesBakedSurface ? bakedHeight.mul(0.44) : uniform(0)).add(detail.height.mul(0.08)).add(microBump.x.mul(0.22));
  const snowDepth = upward.mul(0.92).add(shelter.mul(upwardBroad).mul(0.38)).mul(macro.z.mul(0.32).add(0.78)).mul(biomeUniforms.snow.mul(1.8));
  const snowMask = smoothstep2(0.12, 0.38, snowDepth.sub(relief.mul(0.35).add(0.3)));
  const driftGradient = coarseVarying(5.5, worldGradient(5.5, 0.05, 4.2).mul(0.17));
  const snowColor = mix(snowShade, snowLit, smoothstep2(0.1, 0.72, snowDepth)).mul(microBump.x.mul(0.05).add(0.98));
  stone = stone.mul(mix(vec32(1, 1, 1), vec32(0.38, 0.41, 0.44), filmDepth));
  stone = mix(stone, wetGranite, wetMask.mul(0.18));
  stone = mix(stone, lichenColor, lichenMask.mul(macro.z.mul(0.3).add(0.62)));
  stone = mix(stone, mossColor, mossMask);
  stone = mix(stone, wetGranite, smoothstep2(0.02, 0.32, snowDepth).mul(oneMinus(snowMask)).mul(0.5));
  stone = mix(stone, snowColor, snowMask);
  material.colorNode = stone;
  const decoded = usesBakedSurface ? tslNormalize2(mix(normalLocal, normalAo.xyz.mul(2).sub(1), biomeUniforms.detailStrength)) : normalLocal;
  const covered = clamp(
    snowMask.mul(0.92).add(mossMask.mul(0.82)).add(lichenMask.mul(0.3)).add(filmDepth.mul(0.3)),
    0,
    1
  );
  const mesoView = viewOffset(coarseVarying(8, worldGradient(8, 0.032, 3.7).mul(0.2)));
  const mesoBuried = oneMinus(clamp(snowMask.mul(0.8).add(mossMask.mul(0.75)), 0, 1));
  material.normalNode = tslNormalize2(
    transformNormalToView(decoded).add(mesoView.mul(mesoBuried)).add(detail.viewNormalOffset.mul(oneMinus(covered)).mul(biomeUniforms.detailStrength.mul(0.65).add(0.35))).add(viewOffset(mossClumpGradient.add(microBump.mul(0.22))).mul(mossMask)).add(viewOffset(driftGradient.add(microBump.mul(0.07))).mul(snowMask))
  );
  const macroAo = usesBakedSurface ? mix(0.7, 1, bakedAo) : uniform(1);
  let ao = macroAo.mul(mix(0.78, 1, detail.ambientOcclusion)).mul(oneMinus(mossMask.mul(oneMinus(microRelief2)).mul(0.5))).mul(oneMinus(mossMask.mul(oneMinus(mossClump)).mul(0.28))).mul(oneMinus(lichenMask.mul(areolaFissure).mul(0.38)));
  ao = mix(ao, uniform(1), snowMask.mul(0.7));
  material.aoNode = ao;
  let roughness = mix(0.91, 0.55, wetMask);
  roughness = roughness.add(detail.roughness.sub(0.5).mul(0.18));
  roughness = mix(roughness, 0.11, filmDepth.mul(filmDepth).mul(biomeUniforms.wetness));
  roughness = mix(roughness, 0.94, lichenMask);
  roughness = mix(roughness, 0.92, mossMask);
  roughness = mix(roughness, 0.86, snowMask);
  roughness = roughness.sub(smoothstep2(0.8, 0.97, detail.albedo).mul(snowMask).mul(0.4));
  material.roughnessNode = clamp(roughness, 0.06, 1);
  return material;
}
function createGeometries(topology, seed) {
  const allPositions = materializePositions(topology, seed);
  const allUvs = topology.bakeUvs;
  const vertexCount = allPositions.length / 3;
  const create = (lod) => {
    const sourceIndices = indicesFor(topology, lod);
    const remap = new Int32Array(vertexCount).fill(-1);
    let compactVertexCount = 0;
    for (const sourceIndex of sourceIndices) {
      if (remap[sourceIndex] !== -1) continue;
      remap[sourceIndex] = compactVertexCount;
      compactVertexCount += 1;
    }
    const positions = new Float32Array(compactVertexCount * 3);
    const bakeUvs = allUvs ? new Float32Array(compactVertexCount * 2) : void 0;
    for (let sourceIndex = 0; sourceIndex < vertexCount; sourceIndex += 1) {
      const targetIndex = remap[sourceIndex];
      if (targetIndex < 0) continue;
      positions[targetIndex * 3] = allPositions[sourceIndex * 3];
      positions[targetIndex * 3 + 1] = allPositions[sourceIndex * 3 + 1];
      positions[targetIndex * 3 + 2] = allPositions[sourceIndex * 3 + 2];
      if (bakeUvs && allUvs) {
        bakeUvs[targetIndex * 2] = allUvs[sourceIndex * 2];
        bakeUvs[targetIndex * 2 + 1] = allUvs[sourceIndex * 2 + 1];
      }
    }
    const localIndices = compactVertexCount <= 65535 ? new Uint16Array(sourceIndices.length) : new Uint32Array(sourceIndices.length);
    for (let index = 0; index < sourceIndices.length; index += 1) {
      localIndices[index] = remap[sourceIndices[index]];
    }
    const geometry = new BufferGeometry();
    geometry.name = `${ASSET_ID} / compact LOD${lod}`;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    if (bakeUvs) geometry.setAttribute("uv", new Float32BufferAttribute(bakeUvs, 2));
    geometry.setIndex(new BufferAttribute(localIndices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };
  return [create(0), create(1), create(2)];
}
function materialize(topology, config, seed, representation, surfaceBake, resourcePool) {
  const root = new Group();
  root.name = "fractured granite outcrop";
  root.userData.terrain = {
    assetId: ASSET_ID,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    seed,
    representation,
    lodWeights: config.lod === 0 ? [1, 0, 0] : config.lod === 1 ? [0, 1, 0] : [0, 0, 1]
  };
  const wantsBake = config.diagnostic !== "wireframe" && Boolean(surfaceBake);
  const resources = resourcePool ? resourcePool.acquire(topology, seed, wantsBake ? surfaceBake : void 0) : (() => {
    const geometries2 = createGeometries(topology, seed);
    const bakeTextures = wantsBake ? createPackedBakeTextures(surfaceBake) : void 0;
    let released = false;
    return {
      geometries: geometries2,
      bakeTextures,
      release: () => {
        if (released) return;
        released = true;
        for (const geometry of geometries2) geometry.dispose();
        disposeBakeTextures(bakeTextures);
      }
    };
  })();
  const geometries = resources.geometries;
  const graniteMaterials = resources.bakeTextures ? geometries.map((_, level) => createGraniteMaterial(
    config,
    seed,
    resources.bakeTextures,
    level
  )) : void 0;
  const materials = graniteMaterials ?? geometries.map(() => new MeshBasicMaterial({
    color: 12047065,
    wireframe: config.diagnostic === "wireframe"
  }));
  const initialWeights = config.lod === 0 ? [1, 0, 0] : config.lod === 1 ? [0, 1, 0] : [0, 0, 1];
  const ditherBoundaries = graniteMaterials ? [uniform(initialWeights[0]), uniform(initialWeights[0] + initialWeights[1])] : void 0;
  if (graniteMaterials && ditherBoundaries) {
    const screenHash = hash(viewportCoordinate.x.add(viewportCoordinate.y.mul(8192)));
    for (let level = 0; level < graniteMaterials.length; level += 1) {
      const coverage = level === 0 ? screenHash.lessThan(ditherBoundaries[0]) : level === 1 ? screenHash.greaterThanEqual(ditherBoundaries[0]).and(screenHash.lessThan(ditherBoundaries[1])) : screenHash.greaterThanEqual(ditherBoundaries[1]);
      const material = graniteMaterials[level];
      material.opacityNode = coverage.select(1, 0);
      material.alphaTestNode = uniform(0.5);
      material.alphaHash = false;
    }
  }
  const meshes = geometries.map((geometry, level) => {
    const mesh = new Mesh(geometry, materials[level]);
    mesh.name = `reduced outcrop / LOD${level} / high-to-low materialized`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = level === config.lod;
    mesh.renderOrder = level;
    root.add(mesh);
    return mesh;
  });
  const lod1Error = topology.lods.find((candidate) => candidate.level === 1)?.maxGeometricError ?? 0;
  const lod2Error = topology.lods.find((candidate) => candidate.level === 2)?.maxGeometricError ?? 0;
  let weights = initialWeights;
  const worldPosition = new Vector3();
  const cameraPosition = new Vector3();
  const worldScale = new Vector3();
  const applyWeights = (next) => {
    const visibleWeights = drawableLodWeights(next);
    for (let level = 0; level < 3; level += 1) {
      const weight = visibleWeights[level];
      meshes[level].visible = weight > 2e-3;
      materials[level].opacity = graniteMaterials ? 1 : weight;
    }
    if (ditherBoundaries) {
      ditherBoundaries[0].value = visibleWeights[0];
      ditherBoundaries[1].value = visibleWeights[0] + visibleWeights[1];
    }
  };
  applyWeights(weights);
  const updateLod = (deltaSeconds, camera, viewportHeight) => {
    if (config.diagnostic !== "beauty") return;
    root.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    root.getWorldPosition(worldPosition);
    camera.getWorldPosition(cameraPosition);
    root.getWorldScale(worldScale);
    const maximumInstanceScale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
    const distance = worldPosition.distanceTo(cameraPosition);
    const pixels = viewportHeight ?? globalThis.innerHeight ?? 1080;
    const fov = camera.getEffectiveFOV();
    const lod1Pixels = projectedErrorPixels(lod1Error * 1.7 * maximumInstanceScale, distance, fov, pixels);
    const lod2Pixels = projectedErrorPixels(lod2Error * 1.7 * maximumInstanceScale, distance, fov, pixels);
    const target = targetLodWeights(lod1Pixels, lod2Pixels, config.lod);
    weights = settleLodWeights(weights, target, Math.min(0.1, deltaSeconds));
    applyWeights(weights);
    root.userData.terrain.lodWeights = [...weights];
    root.userData.terrain.projectedErrors = [lod1Pixels, lod2Pixels];
  };
  let lastRenderFrame = -1;
  let lastRenderTime = performance.now();
  for (const mesh of meshes) {
    mesh.onBeforeRender = (renderer, _scene, renderCamera) => {
      if (!renderCamera.isPerspectiveCamera) return;
      const frame = renderer.info.render.frame;
      if (frame === lastRenderFrame) return;
      lastRenderFrame = frame;
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - lastRenderTime) / 1e3));
      lastRenderTime = now;
      const height = renderer.domElement.height || void 0;
      updateLod(deltaSeconds, renderCamera, height);
    };
  }
  let disposed = false;
  const configure = (patch) => {
    const clamp01 = (value) => Math.min(1, Math.max(0, value));
    if (patch.snow !== void 0) config.snow = clamp01(patch.snow);
    if (patch.wetness !== void 0) config.wetness = clamp01(patch.wetness);
    if (patch.lichen !== void 0) config.lichen = clamp01(patch.lichen);
    if (patch.moss !== void 0) config.moss = clamp01(patch.moss);
    if (patch.detailStrength !== void 0) config.detailStrength = clamp01(patch.detailStrength);
    if (patch.surfaceSeed !== void 0 && Number.isFinite(patch.surfaceSeed)) {
      config.surfaceSeed = patch.surfaceSeed;
    }
    for (const material of materials) {
      const nodes = material.userData.graniteBiomeUniforms;
      if (!nodes) continue;
      nodes.snow.value = config.snow;
      nodes.wetness.value = config.wetness;
      nodes.lichen.value = config.lichen;
      nodes.moss.value = config.moss;
      nodes.detailStrength.value = config.detailStrength;
      nodes.surfaceSeed.value = config.surfaceSeed ?? seed;
    }
    root.userData.terrain.biome = {
      snow: config.snow,
      wetness: config.wetness,
      lichen: config.lichen,
      moss: config.moss,
      detailStrength: config.detailStrength,
      surfaceSeed: config.surfaceSeed ?? seed
    };
  };
  configure(config);
  return {
    root,
    topology,
    representation,
    configure,
    update: (deltaSeconds, camera, viewportHeight) => {
      if (camera) updateLod(deltaSeconds, camera, viewportHeight);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const material of materials) material.dispose();
      resources.release();
    }
  };
}
async function createModel(options = {}) {
  const seed = Math.max(1, Math.floor(options.seed ?? 1));
  const config = {
    snow: Math.min(1, Math.max(0, options.snow ?? DEFAULT_CONFIG.snow)),
    wetness: Math.min(1, Math.max(0, options.wetness ?? DEFAULT_CONFIG.wetness)),
    lichen: Math.min(1, Math.max(0, options.lichen ?? DEFAULT_CONFIG.lichen)),
    moss: Math.min(1, Math.max(0, options.moss ?? DEFAULT_CONFIG.moss)),
    detailStrength: Math.min(1, Math.max(0, options.detailStrength ?? DEFAULT_CONFIG.detailStrength)),
    surfaceSeed: Number.isFinite(options.surfaceSeed) ? options.surfaceSeed : seed,
    lod: options.lod ?? DEFAULT_CONFIG.lod,
    diagnostic: options.diagnostic ?? DEFAULT_CONFIG.diagnostic
  };
  const [compiled, compiledSurfaceBake] = await Promise.all([
    loadCompiledTopology(),
    loadCompiledSurfaceBake(),
    ensureGraniteDetail()
  ]);
  let representation = "compiled";
  const asset = createTerrainAsset({
    assetId: ASSET_ID,
    recipeHash: RECIPE_HASH,
    compilerHash: COMPILER_HASH,
    defaultProfile: PROFILE,
    identify: (_config, _profile, request) => ({ topologyKey: topologyKeyFor(request.seed) }),
    compiled: [compiled],
    compiledSurfaceBakes: [compiledSurfaceBake],
    source: {
      build: async (request) => {
        const topology = compileTopology(request.seed, SOURCE_GRID_CELLS);
        const surfaceBake = compileSurfaceBakeFor(request.seed, SOURCE_GRID_CELLS);
        representation = "source";
        return {
          instance: materialize(topology, request.config, request.seed, "source", surfaceBake),
          compiled: topology,
          surfaceBake
        };
      }
    },
    materialize: async (topology, request, surfaceBake) => materialize(
      topology,
      request.config,
      request.seed,
      representation,
      surfaceBake
    )
  });
  return asset.create({ config, seed, path: options.path ?? "auto" });
}
async function preview(options = {}, modelOptions = {}) {
  const model = await createModel(modelOptions);
  model.root.scale.setScalar(1.45);
  const scene = new Scene();
  scene.name = "fractured granite outcrop / alpine preview";
  scene.background = new Color(1778472);
  scene.add(model.root);
  const floorGeometry = new PlaneGeometry(20, 20);
  const floorMaterial = new MeshPhysicalMaterial({
    name: "preview / alpine ground",
    color: 3818045,
    roughness: 0.96,
    metalness: 0
  });
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.name = "preview / ground";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  floor.userData.excludeFromExport = true;
  scene.add(floor);
  const ambient = new AmbientLight(11058374, 0.12);
  const hemisphere = new HemisphereLight(13623526, 1909792, 0.3);
  const key = new DirectionalLight(16773853, 1.9);
  key.position.set(-5.2, 5.4, 4.6);
  key.castShadow = true;
  const fill = new DirectionalLight(9417414, 0.3);
  fill.position.set(6.2, 2.4, 4.2);
  const rim = new DirectionalLight(12768992, 0.55);
  rim.position.set(4.4, 4.2, -6.4);
  scene.add(ambient, hemisphere, key, fill, rim);
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.05, 260);
  const yaw = (options.yaw ?? 0) * Math.PI / 180;
  const radius = 5.8;
  camera.position.set(Math.sin(yaw + 0.69) * radius, 2.35, Math.cos(yaw + 0.69) * radius);
  camera.lookAt(0, 0.95, 0);
  scene.add(camera);
  return {
    ...model,
    scene,
    camera,
    update: (deltaSeconds) => model.update(deltaSeconds, camera),
    dispose: () => {
      floorGeometry.dispose();
      floorMaterial.dispose();
      model.dispose();
    }
  };
}
function requestedPreviewOptions() {
  if (typeof window === "undefined") return { seed: 1 };
  const params = new URLSearchParams(window.location.search);
  const requestedSeed = Number(params.get("seed") ?? 1);
  const requestedLod = Number(params.get("lod") ?? 0);
  const requestedPath = params.get("path");
  const view = params.get("view");
  return {
    seed: Number.isFinite(requestedSeed) ? Math.max(1, Math.floor(requestedSeed)) : 1,
    lod: requestedLod === 1 || requestedLod === 2 ? requestedLod : 0,
    diagnostic: view === "wireframe" || view === "normal" || view === "ao" || view === "uv" ? view : "beauty",
    path: requestedPath === "source" || requestedPath === "compiled" ? requestedPath : "auto"
  };
}
function recorderModelOptions(options) {
  const result = {};
  const keys = [
    "seed",
    "snow",
    "wetness",
    "lichen",
    "moss",
    "detailStrength",
    "surfaceSeed",
    "lod",
    "diagnostic",
    "path"
  ];
  for (const key of keys) {
    const value = options[key];
    if (value !== void 0) Object.assign(result, { [key]: value });
  }
  return result;
}
var createPreview = (options = {}) => preview(
  options,
  { ...requestedPreviewOptions(), ...recorderModelOptions(options) }
);
var createBackPreview = (options = {}) => preview({ ...options, yaw: 180 }, { seed: 1 });
var createLeftPreview = (options = {}) => preview({ ...options, yaw: 90 }, { seed: 1 });
var createRightPreview = (options = {}) => preview({ ...options, yaw: 270 }, { seed: 1 });
var createSeed2Preview = (options = {}) => preview(options, { seed: 2 });
var createSeed3Preview = (options = {}) => preview(options, { seed: 3 });
var createSourcePreview = (options = {}) => preview(options, { seed: 1, path: "source" });
var createWireframePreview = (options = {}) => preview(options, { seed: 1, diagnostic: "wireframe" });
var createNormalPreview = (options = {}) => preview(options, { seed: 1, diagnostic: "normal" });
var createAoPreview = (options = {}) => preview(options, { seed: 1, diagnostic: "ao" });
var createLod1Preview = (options = {}) => preview(options, { seed: 1, lod: 1 });
var createLod2Preview = (options = {}) => preview(options, { seed: 1, lod: 2 });
var createSnowPreview = (options = {}) => preview(options, {
  seed: 1,
  snow: 0.82,
  wetness: 0.08,
  moss: 0.04,
  lichen: 0.08
});
var createMossPreview = (options = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.48,
  moss: 0.88,
  lichen: 0.24,
  surfaceSeed: 7
});
var createLichenPreview = (options = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.1,
  moss: 0.1,
  lichen: 0.85,
  surfaceSeed: 3
});
var createWetPreview = (options = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 1,
  moss: 0.05,
  lichen: 0.1
});
var createDampPreview = (options = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.45,
  moss: 0.05,
  lichen: 0.1
});
var createOverlayClosePreview = async (options = {}) => {
  const result = await preview(options, {
    seed: 1,
    surfaceSeed: 5,
    snow: 0.34,
    wetness: 0.22,
    moss: 0.6,
    lichen: 0.55
  });
  result.camera.position.set(3.35, 2.05, 3.85);
  result.camera.lookAt(0, 0.95, 0);
  result.camera.updateProjectionMatrix();
  return result;
};
var createClosePreview = async (options = {}) => {
  const result = await preview(options, { seed: 1, surfaceSeed: 1 });
  result.camera.position.set(2.45, 1.72, 2.95);
  result.camera.lookAt(0, 0.95, 0);
  result.camera.updateProjectionMatrix();
  return result;
};
export {
  GraniteResourcePool,
  compileStats,
  createAoPreview,
  createBackPreview,
  createClosePreview,
  createDampPreview,
  materialize as createInstanceFromCompiled,
  createLeftPreview,
  createLichenPreview,
  createLod1Preview,
  createLod2Preview,
  createModel,
  createMossPreview,
  createNormalPreview,
  createOverlayClosePreview,
  createPreview,
  createRightPreview,
  createSeed2Preview,
  createSeed3Preview,
  createSnowPreview,
  createSourcePreview,
  createWetPreview,
  createWireframePreview,
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  disposeGraniteDetail,
  ensureGraniteDetail,
  graniteDetailBytes
};
