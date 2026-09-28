#!/usr/bin/env node

/**
 * Fail-closed structural audit for Blender-exported mobile rock GLBs.
 *
 * The package manifest remains the source of truth for expected object names,
 * triangle totals, material usage, and export hashes. This script verifies the
 * bytes that will actually be handed to a runtime rather than trusting the
 * Blender operator's return status.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const options = { packageDir: null, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--package-dir") {
      options.packageDir = argv[++index];
    } else if (value === "--report") {
      options.report = argv[++index];
    } else if (value === "--help" || value === "-h") {
      console.log(
        "Usage: node scripts/audit-rock-mobile-glb.mjs --package-dir <dir> [--report <json>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (!options.packageDir) {
    throw new Error("--package-dir is required");
  }
  return options;
}

function parseGlb(buffer, file) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${file}: invalid GLB magic or truncated header`);
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) {
    throw new Error(`${file}: expected GLB version 2, found ${version}`);
  }
  if (declaredLength !== buffer.length) {
    throw new Error(
      `${file}: declared byte length ${declaredLength} does not match ${buffer.length}`,
    );
  }

  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      throw new Error(`${file}: truncated chunk header`);
    }
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) {
      throw new Error(`${file}: chunk exceeds declared file bounds`);
    }
    chunks.push({ type, data: buffer.subarray(start, end) });
    offset = end;
  }
  if (offset !== buffer.length) {
    throw new Error(`${file}: chunk alignment does not end at file boundary`);
  }
  const jsonChunks = chunks.filter((chunk) => chunk.type === JSON_CHUNK);
  const binChunks = chunks.filter((chunk) => chunk.type === BIN_CHUNK);
  if (jsonChunks.length !== 1 || binChunks.length > 1) {
    throw new Error(
      `${file}: expected one JSON chunk and at most one BIN chunk; found ${jsonChunks.length}/${binChunks.length}`,
    );
  }
  const jsonText = jsonChunks[0].data.toString("utf8").replace(/[\u0000\u0020]+$/u, "");
  return {
    json: JSON.parse(jsonText),
    version,
    chunkCount: chunks.length,
    binaryBytes: binChunks[0]?.data.length ?? 0,
  };
}

function primitiveTriangles(gltf, primitive, failures, context) {
  const mode = primitive.mode ?? 4;
  let elementCount = null;
  if (Number.isInteger(primitive.indices)) {
    elementCount = gltf.accessors?.[primitive.indices]?.count;
  } else if (Number.isInteger(primitive.attributes?.POSITION)) {
    elementCount = gltf.accessors?.[primitive.attributes.POSITION]?.count;
  }
  if (!Number.isInteger(elementCount)) {
    failures.push(`${context}: primitive has no countable index or POSITION accessor`);
    return 0;
  }
  if (mode === 4) {
    if (elementCount % 3 !== 0) {
      failures.push(`${context}: TRIANGLES element count ${elementCount} is not divisible by 3`);
    }
    return Math.floor(elementCount / 3);
  }
  if (mode === 5 || mode === 6) {
    return Math.max(0, elementCount - 2);
  }
  failures.push(`${context}: unsupported non-triangle primitive mode ${mode}`);
  return 0;
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function inspectDocument(gltf, expectedObjects, expectedTriangles, expectsMaterial) {
  const failures = [];
  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const materials = gltf.materials ?? [];
  const images = gltf.images ?? [];
  const meshNodes = nodes.filter((node) => Number.isInteger(node.mesh));
  const meshNodeNames = meshNodes.map((node) => node.name ?? "");
  const extraObjects = setDifference(meshNodeNames, expectedObjects);
  const missingObjects = setDifference(expectedObjects, meshNodeNames);
  if (extraObjects.length || missingObjects.length || meshNodeNames.length !== expectedObjects.length) {
    failures.push(
      `mesh-node identity mismatch; expected=${JSON.stringify(expectedObjects)} actual=${JSON.stringify(meshNodeNames)}`,
    );
  }

  const defaultHelperNames = [...nodes, ...meshes]
    .map((entry) => entry.name ?? "")
    .filter((name) => /^(Cube|Plane|Sphere|Cylinder|Camera|Light)(?:\.|$)/u.test(name));
  if (defaultHelperNames.length) {
    failures.push(`default/helper names remain in export: ${JSON.stringify(defaultHelperNames)}`);
  }
  if ((gltf.cameras ?? []).length !== 0 || nodes.some((node) => Number.isInteger(node.camera))) {
    failures.push("camera data is present");
  }
  if (gltf.extensions?.KHR_lights_punctual || nodes.some((node) => node.extensions?.KHR_lights_punctual)) {
    failures.push("KHR_lights_punctual data is present");
  }

  let triangles = 0;
  let primitiveCount = 0;
  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      primitiveCount += 1;
      triangles += primitiveTriangles(
        gltf,
        primitive,
        failures,
        `mesh ${meshIndex} primitive ${primitiveIndex}`,
      );
      if (expectsMaterial && !Number.isInteger(primitive.material)) {
        failures.push(`mesh ${meshIndex} primitive ${primitiveIndex}: visual primitive has no material`);
      }
      if (!expectsMaterial && Number.isInteger(primitive.material)) {
        failures.push(`mesh ${meshIndex} primitive ${primitiveIndex}: collision primitive unexpectedly has a material`);
      }
    }
  }
  if (triangles !== expectedTriangles) {
    failures.push(`triangle total mismatch; expected=${expectedTriangles} actual=${triangles}`);
  }

  const externalImages = images.filter((image) => typeof image.uri === "string");
  const nonEmbeddedImages = images.filter((image) => !Number.isInteger(image.bufferView));
  if (externalImages.length) {
    failures.push(`external image URIs are present (${externalImages.length})`);
  }
  if (nonEmbeddedImages.length) {
    failures.push(`images without embedded bufferView are present (${nonEmbeddedImages.length})`);
  }

  if (expectsMaterial) {
    if (materials.length === 0) failures.push("visual export has no materials");
    if (images.length < 3) failures.push(`visual export has ${images.length} images; expected Base/Normal/ORM`);
    for (const [index, material] of materials.entries()) {
      const pbr = material.pbrMetallicRoughness;
      if (!pbr?.baseColorTexture) failures.push(`material ${index}: missing baseColorTexture`);
      if (!pbr?.metallicRoughnessTexture) failures.push(`material ${index}: missing metallicRoughnessTexture`);
      if (!material.normalTexture) failures.push(`material ${index}: missing normalTexture`);
      if (!material.occlusionTexture) failures.push(`material ${index}: missing occlusionTexture`);
      if (
        pbr?.metallicRoughnessTexture &&
        material.occlusionTexture &&
        pbr.metallicRoughnessTexture.index !== material.occlusionTexture.index
      ) {
        failures.push(`material ${index}: occlusion and metallic-roughness do not share the ORM texture`);
      }
    }
  } else if (materials.length || images.length || (gltf.textures ?? []).length) {
    failures.push("collision export contains material or texture payload");
  }

  return {
    passed: failures.length === 0,
    failures,
    meshNodeNames,
    meshNames: meshes.map((mesh) => mesh.name ?? ""),
    nodeCount: nodes.length,
    meshCount: meshes.length,
    primitiveCount,
    triangles,
    materialCount: materials.length,
    imageCount: images.length,
    textureCount: (gltf.textures ?? []).length,
    embeddedImageCount: images.length - nonEmbeddedImages.length,
    externalImageCount: externalImages.length,
    defaultHelperNames,
    cameraCount: (gltf.cameras ?? []).length,
    hasPunctualLights: Boolean(gltf.extensions?.KHR_lights_punctual),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageDir = path.resolve(options.packageDir);
  const manifestPath = path.join(packageDir, "mobile-package-audit.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const records = [];
  const failures = [];

  for (const entry of manifest.exports ?? []) {
    const file = path.resolve(entry.file);
    const buffer = await readFile(file);
    const actualSha256 = sha256(buffer);
    const expectedObjects = entry.objects ?? [];
    const expectedTriangles = expectedObjects.reduce((sum, objectName) => {
      const count = manifest.audits?.[objectName]?.triangles;
      if (!Number.isInteger(count)) {
        throw new Error(`${path.basename(file)}: no manifest triangle count for ${objectName}`);
      }
      return sum + count;
    }, 0);
    const expectsMaterial = expectedObjects.some(
      (name) => (manifest.audits?.[name]?.materialSlots ?? []).length > 0,
    );
    const parsed = parseGlb(buffer, file);
    const document = inspectDocument(parsed.json, expectedObjects, expectedTriangles, expectsMaterial);
    const recordFailures = [...document.failures];
    if (entry.sha256 !== actualSha256) {
      recordFailures.push(`manifest SHA-256 mismatch; expected=${entry.sha256} actual=${actualSha256}`);
    }
    if (entry.bytes !== buffer.length) {
      recordFailures.push(`manifest byte-size mismatch; expected=${entry.bytes} actual=${buffer.length}`);
    }
    const record = {
      file,
      bytes: buffer.length,
      sha256: actualSha256,
      expectedObjects,
      expectedTriangles,
      glbVersion: parsed.version,
      chunkCount: parsed.chunkCount,
      binaryBytes: parsed.binaryBytes,
      ...document,
      passed: recordFailures.length === 0,
      failures: recordFailures,
    };
    records.push(record);
    failures.push(...recordFailures.map((failure) => `${path.basename(file)}: ${failure}`));
  }

  const report = {
    schema: "toonlab/rock-mobile-glb-audit",
    version: 1,
    manifest: manifestPath,
    passed: failures.length === 0,
    exportCount: records.length,
    failures,
    records,
  };
  const reportPath = path.resolve(options.report ?? path.join(packageDir, "glb-audit.json"));
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ report: reportPath, passed: report.passed, failures }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
