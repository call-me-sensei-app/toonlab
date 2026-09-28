import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractB3dmFeature } from "./plateau/extract-b3dm-feature.mjs";
import { PLATEAU_LANDMARKS } from "../src/assetlib/plateauLandmarks.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith("--")) args.set(process.argv[i].slice(2), process.argv[i + 1]);
}

const only = args.get("only");
const sourceFile = args.get("source-file");
const selected = PLATEAU_LANDMARKS.filter((landmark) => !only || landmark.id === only);
if (selected.length === 0) throw new Error(`Unknown PLATEAU landmark: ${only}`);

const outputDirectory = resolve(root, "public/plateau-landmarks");
await mkdir(outputDirectory, { recursive: true });

for (const landmark of selected) {
  const result = await extractB3dmFeature({
    sourceFile: selected.length === 1 ? sourceFile : undefined,
    sourceUrl: landmark.sourceTileUrl,
    gmlId: landmark.sourceGmlId,
    latitude: landmark.latitude,
    longitude: landmark.longitude,
    name: `${landmark.name} — ${landmark.nameJa}`,
    metadata: {
      attribution:
        `出典：国土交通省 Project PLATEAU（${landmark.prefecture} ${landmark.city} 3D都市モデル）を加工して作成`,
      buildingId: landmark.buildingId,
      citygmlUrl: landmark.citygmlUrl,
      license: "PLATEAU site policy / PDL 1.0",
      measuredHeightMetres: landmark.measuredHeight,
      wikidataId: landmark.wikidataId,
    },
  });
  const output = resolve(outputDirectory, `${landmark.id}.glb`);
  await writeFile(output, result.bytes);
  console.log(JSON.stringify({
    output,
    batchId: result.batchId,
    bytes: result.bytes.byteLength,
    triangles: result.triangleCount,
    vertices: result.vertexCount,
    boundsMetres: result.bounds.size.map((value) => Number(value.toFixed(2))),
  }));
}

