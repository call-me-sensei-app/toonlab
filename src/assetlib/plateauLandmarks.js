import {
  PLATEAU_ATTRIBUTION,
  PLATEAU_LICENSE,
  PLATEAU_OPEN_DATA_URL,
  PLATEAU_SITE_POLICY_URL,
} from "./plateau.js";

export const PLATEAU_LANDMARK_ASSET_BASE = "/plateau-landmarks";

const TOKYO_TOWER = Object.freeze({
  address: "4 Chome Shibakoen, Minato City, Tokyo",
  aliases: Object.freeze([
    "Tokyo Tower",
    "東京タワー",
    "とうきょうタワー",
    "Nippon Denpatō",
  ]),
  areaCode: "13103",
  artifactSizeBytes: 950_796,
  boundsMetres: Object.freeze([126, 332.13, 122.52]),
  buildingId: "13103-bldg-6915",
  city: "Minato City",
  citygmlUrl:
    "https://assets.cms.plateau.reearth.io/assets/ea/d75459-6d62-4a1f-8081-317603bd5f8d/13103_minato-ku_pref_2025_citygml_1_op/udx/bldg/53393599_bldg_6697_op.gml",
  id: "tokyo-tower",
  latitude: 35.6586,
  longitude: 139.7454,
  measuredHeight: 332.1,
  name: "Tokyo Tower",
  nameJa: "東京タワー",
  prefecture: "Tokyo",
  sourceGmlId: "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8",
  sourceTileUrl:
    "https://assets.cms.plateau.reearth.io/assets/c7/ffcc73-1d33-434b-a49a-aa0289160814/13103_minato-ku_pref_2025_citygml_1_op_bldg_3dtiles_13103_minato-ku_lod3/data/data248.b3dm",
  sourceTilesetUrl:
    "https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13103-bldg-lod3-texture-latest/tileset.json",
  wikidataId: "Q183536",
  triangleCount: 460,
  vertexCount: 1_380,
});

export const PLATEAU_LANDMARKS = Object.freeze([TOKYO_TOWER]);

export function plateauLandmarkAssetRef(landmark) {
  const attributionText =
    `出典：国土交通省 Project PLATEAU（${landmark.prefecture} ${landmark.city} 3D都市モデル）` +
    "を加工して作成";
  const assetUrl = `${PLATEAU_LANDMARK_ASSET_BASE}/${landmark.id}.glb`;
  return {
    attribution: Object.freeze({
      ...PLATEAU_ATTRIBUTION,
      text: attributionText,
    }),
    authors: ["Project PLATEAU"],
    categories: [
      "Japanese architecture",
      "landmark",
      "tower",
      landmark.prefecture,
      landmark.city,
    ],
    citygml: {
      featureId: landmark.sourceGmlId,
      url: landmark.citygmlUrl,
    },
    download: {
      format: "glb",
      resources: {},
      sizeBytes: landmark.artifactSizeBytes,
      url: assetUrl,
    },
    id: `landmark-${landmark.id}`,
    kind: "model",
    metadata: {
      address: landmark.address,
      aliases: [...landmark.aliases],
      areaCode: landmark.areaCode,
      buildingId: landmark.buildingId,
      boundsMetres: [...landmark.boundsMetres],
      city: landmark.city,
      coordinateSystem: "local Y-up metres",
      latitude: landmark.latitude,
      licenseUrl: PLATEAU_SITE_POLICY_URL,
      longitude: landmark.longitude,
      measuredHeight: landmark.measuredHeight,
      nameJa: landmark.nameJa,
      payloadType: "glb",
      prefecture: landmark.prefecture,
      processed: true,
      sourceGmlId: landmark.sourceGmlId,
      sourceTileUrl: landmark.sourceTileUrl,
      sourceTilesetUrl: landmark.sourceTilesetUrl,
      wikidataId: landmark.wikidataId,
      triangleCount: landmark.triangleCount,
      vertexCount: landmark.vertexCount,
    },
    name: `${landmark.name} — ${landmark.nameJa}`,
    openAccess: true,
    pageUrl: PLATEAU_OPEN_DATA_URL,
    source: "plateau",
    streamOnly: false,
    tags: [
      ...landmark.aliases,
      "Japan",
      "Japanese",
      "architecture",
      "building",
      "landmark",
      "tower",
      "Tokyo",
      "Minato",
      "PLATEAU",
      landmark.buildingId,
      landmark.sourceGmlId,
    ].map((value) => value.toLowerCase()),
    thumbnailUrl: `${PLATEAU_LANDMARK_ASSET_BASE}/${landmark.id}.png`,
  };
}

export function listPlateauLandmarks() {
  return PLATEAU_LANDMARKS.map(plateauLandmarkAssetRef);
}

export function findPlateauLandmark(id) {
  const safeId = String(id ?? "").replace(/^landmark-/, "").toLowerCase();
  const landmark = PLATEAU_LANDMARKS.find((item) => item.id === safeId);
  return landmark ? plateauLandmarkAssetRef(landmark) : null;
}

export function searchPlateauLandmarks(query = "") {
  const terms = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return listPlateauLandmarks().filter((ref) => {
    const haystack = [
      ref.id,
      ref.name,
      ...ref.tags,
      ...ref.categories,
      ref.metadata.address,
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export { PLATEAU_LICENSE };
