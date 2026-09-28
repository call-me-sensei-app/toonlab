export function isRockSourceMeshReference(reference: any): boolean;
/** Deterministic browser-safe identity for the complete saved C8 control/high/semantic authority. */
export function createC8ReferenceAuthoritySourceId(reference: any): string;
/** Deterministic browser-safe identity for the exact live C8 control geometry. */
export function createC8ReferenceGeometrySourceId(reference: any): string;
/** Surface derivative identity, separate from geometry and explicit about the C7 recipe. */
export function createC8ReferenceSurfaceSourceId(reference: any): string;
/**
 * Portable identity for a source-GLB project. Geometry stays outside the JSON
 * document; the document stores either the stable catalog id or the exact C8
 * control/high hashes, plus deterministic edit state needed to rebuild and
 * decode the source GLB.
 */
export function createRockReferenceIdentity(options?: any): {
    variationSettings?: {
        version: number;
        scope: string;
        anchorBase: boolean;
        locks: {};
    };
    role: string;
    series: string;
    sourceMode: string;
    surfacePackage: any;
    surfaceMode: string;
    targetTriangles: number;
    topFinish: any;
    variation: number;
    variationSeed: number;
    authoritySourceId?: string;
    customMeshSource?: {
        authority: string;
        control: {
            boundsMetres: {
                max: any[];
                min: any[];
            };
            byteLength: number;
            contentHash: any;
            coordinateSystem: string;
            dimensionsMetres: any[];
            geometryAudit: {
                topologyHash: any;
                meshVertexCounts: any;
                triangleCount: number;
                vertexCount: number;
            };
            id: string;
            metreUnitScale: number;
            mimeType: string;
            role: any;
            sourceRevision: number;
            topologyHash: any;
            unit: string;
            uri: string;
        };
        editEnvelope: {
            maximumDisplacementMetres: number;
            maximumVariationStrength: number;
            mode: string;
        };
        highDetail: {
            boundsMetres: {
                max: any[];
                min: any[];
            };
            byteLength: number;
            contentHash: any;
            coordinateSystem: string;
            dimensionsMetres: any[];
            geometryAudit: {
                topologyHash: any;
                meshVertexCounts: any;
                triangleCount: number;
                vertexCount: number;
            };
            id: string;
            metreUnitScale: number;
            mimeType: string;
            role: any;
            sourceRevision: number;
            topologyHash: any;
            unit: string;
            uri: string;
        };
        schema: string;
        semanticRegions: {
            id: string;
            label: string;
            landmarkIds: any;
            role: string;
            selector: {
                attribute: string;
                kind: string;
                value: number;
            };
        }[];
        version: number;
    };
    derivedArtifactState?: {
        surfaceReprojection: {
            authoritySourceId: any;
            contentHash: any;
            geometrySourceId: any;
            method: any;
            sourceRevision: any;
            status: string;
            surfaceSourceId: any;
            trueHighToLowBake: boolean;
            reason?: undefined;
        } | {
            authoritySourceId: any;
            contentHash: any;
            geometrySourceId: any;
            reason: string;
            sourceRevision: any;
            status: string;
            surfaceSourceId: any;
            trueHighToLowBake: boolean;
            method?: undefined;
        };
    };
    geology?: string;
    geometrySourceId?: string;
    identityLandmarks?: {
        id: string;
        positionMetres: any[];
        role: string;
    }[];
    label?: string;
    sourceRevision?: number;
    surfaceSourceId?: string;
    surfaceReprojection?: {
        reprojectionContentId: string;
        authoritySourceId: any;
        controlContentHash: any;
        dimensionsMetres: any[];
        editOperationCount: any;
        geology: string;
        geometrySourceId: any;
        mapResolution: number;
        method: string;
        projection: Readonly<{
            characteristicMetres: number;
            dimensionsMetres: readonly number[];
            mode: "world-metre-triplanar-isotropic";
            nearDetailScaleMetres: number;
            scaleMetres: number;
            axisScale: readonly number[];
            tileSpan: readonly number[];
        }>;
        schema: string;
        seed: number;
        sourceContentId: any;
        sourceId: any;
        sourceRevision: any;
        surfaceSourceId: any;
        trueHighToLowBake: boolean;
        version: number;
    };
    thumbnailUrl?: string;
    archetype: string;
    catalogVersion: number;
    family: string;
    id: string;
    lodRatios: any;
    lodTriangles: any;
    meshCuts: {
        depth: number;
        meshIndex: number;
        normal: any;
        point: any;
        radius: number;
        roughness: number;
        seed: number;
        through: boolean;
    }[];
    meshEdits: {
        deltas: any;
        meshIndex: any;
    }[];
    meshOperationOrder: any[];
    meshSnapshots: any[];
};
/**
 * Creates one rock piece. Accepts a registered piece-preset name, or a
 * partial piece object (`{ name, seed, combine, transform, shape, noise,
 * warp, facet, strata, falloff }`). Ids are assigned when the piece is
 * added to a document.
 */
export function createRockPiece(optionsOrPresetName?: any): {
    columns: {};
    cracks: {};
    cuts: {};
    facet: {};
    heightfield: {};
    falloff: {};
    noise: {};
    shape: {};
    strata: {};
    warp: {};
    hidden: boolean;
    id: any;
    name: string;
    outline: number[][];
    seed: number;
    transform: {
        position: any[];
        rotation: any[];
        scale: number[];
    };
    helper?: {
        kind: string;
    };
    combine: {
        blend: number;
        op: any;
    };
};
/**
 * Creates a rock document. `options` may be a preset name string or
 * `{ seed, preset, style, reference, name, pieces, sculptEdits, surface,
 * meshing }`.
 * With no explicit pieces, one piece is built from the preset (default
 * 'boulder').
 */
export function createRockDocument(options?: any): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        variationSettings?: {
            version: number;
            scope: string;
            anchorBase: boolean;
            locks: {};
        };
        role: string;
        series: string;
        sourceMode: string;
        surfacePackage: any;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
        authoritySourceId?: string;
        customMeshSource?: {
            authority: string;
            control: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            editEnvelope: {
                maximumDisplacementMetres: number;
                maximumVariationStrength: number;
                mode: string;
            };
            highDetail: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            schema: string;
            semanticRegions: {
                id: string;
                label: string;
                landmarkIds: any;
                role: string;
                selector: {
                    attribute: string;
                    kind: string;
                    value: number;
                };
            }[];
            version: number;
        };
        derivedArtifactState?: {
            surfaceReprojection: {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                method: any;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                reason?: undefined;
            } | {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                reason: string;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                method?: undefined;
            };
        };
        geology?: string;
        geometrySourceId?: string;
        identityLandmarks?: {
            id: string;
            positionMetres: any[];
            role: string;
        }[];
        label?: string;
        sourceRevision?: number;
        surfaceSourceId?: string;
        surfaceReprojection?: {
            reprojectionContentId: string;
            authoritySourceId: any;
            controlContentHash: any;
            dimensionsMetres: any[];
            editOperationCount: any;
            geology: string;
            geometrySourceId: any;
            mapResolution: number;
            method: string;
            projection: Readonly<{
                characteristicMetres: number;
                dimensionsMetres: readonly number[];
                mode: "world-metre-triplanar-isotropic";
                nearDetailScaleMetres: number;
                scaleMetres: number;
                axisScale: readonly number[];
                tileSpan: readonly number[];
            }>;
            schema: string;
            seed: number;
            sourceContentId: any;
            sourceId: any;
            sourceRevision: any;
            surfaceSourceId: any;
            trueHighToLowBake: boolean;
            version: number;
        };
        thumbnailUrl?: string;
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshCuts: {
            depth: number;
            meshIndex: number;
            normal: any;
            point: any;
            radius: number;
            roughness: number;
            seed: number;
            through: boolean;
        }[];
        meshEdits: {
            deltas: any;
            meshIndex: any;
        }[];
        meshOperationOrder: any[];
        meshSnapshots: any[];
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/**
 * Apply another IP-wide rock style without replacing the selected asset or
 * destroying edits. Values still equal to the old style baseline adopt the
 * new baseline; authored differences remain intact.
 */
export function rebaseRockDocumentStyle(document: any, style?: string): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        variationSettings?: {
            version: number;
            scope: string;
            anchorBase: boolean;
            locks: {};
        };
        role: string;
        series: string;
        sourceMode: string;
        surfacePackage: any;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
        authoritySourceId?: string;
        customMeshSource?: {
            authority: string;
            control: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            editEnvelope: {
                maximumDisplacementMetres: number;
                maximumVariationStrength: number;
                mode: string;
            };
            highDetail: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            schema: string;
            semanticRegions: {
                id: string;
                label: string;
                landmarkIds: any;
                role: string;
                selector: {
                    attribute: string;
                    kind: string;
                    value: number;
                };
            }[];
            version: number;
        };
        derivedArtifactState?: {
            surfaceReprojection: {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                method: any;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                reason?: undefined;
            } | {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                reason: string;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                method?: undefined;
            };
        };
        geology?: string;
        geometrySourceId?: string;
        identityLandmarks?: {
            id: string;
            positionMetres: any[];
            role: string;
        }[];
        label?: string;
        sourceRevision?: number;
        surfaceSourceId?: string;
        surfaceReprojection?: {
            reprojectionContentId: string;
            authoritySourceId: any;
            controlContentHash: any;
            dimensionsMetres: any[];
            editOperationCount: any;
            geology: string;
            geometrySourceId: any;
            mapResolution: number;
            method: string;
            projection: Readonly<{
                characteristicMetres: number;
                dimensionsMetres: readonly number[];
                mode: "world-metre-triplanar-isotropic";
                nearDetailScaleMetres: number;
                scaleMetres: number;
                axisScale: readonly number[];
                tileSpan: readonly number[];
            }>;
            schema: string;
            seed: number;
            sourceContentId: any;
            sourceId: any;
            sourceRevision: any;
            surfaceSourceId: any;
            trueHighToLowBake: boolean;
            version: number;
        };
        thumbnailUrl?: string;
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshCuts: {
            depth: number;
            meshIndex: number;
            normal: any;
            point: any;
            radius: number;
            roughness: number;
            seed: number;
            through: boolean;
        }[];
        meshEdits: {
            deltas: any;
            meshIndex: any;
        }[];
        meshOperationOrder: any[];
        meshSnapshots: any[];
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/** Marks the document dirty after direct settings mutation. */
export function bumpDocumentRevision(document: any): any;
/** Adds a piece (assigning a unique id if needed) and returns it. */
export function addPieceToDocument(document: any, piece: any): any;
/** Removes a piece by id; returns true when a piece was removed. */
export function removePieceFromDocument(document: any, pieceId: any): boolean;
/** Appends a sculpt edit (assigning a unique id) and returns it. */
export function applySculptEdit(document: any, edit: any): {
    blend: number;
    center: any[];
    end: any[];
    id: any;
    radius: number;
    shape: string;
    tool: string;
};
/** Removes the most recent sculpt edit; returns it (or null). */
export function undoLastSculptEdit(document: any): any;
/** World-space AABB of the document's surface: `{ min: [3], max: [3] }`. */
export function computeDocumentBounds(document: any): {
    max: any[];
    min: any[];
};
/** Serializes a document to JSON (dropping the runtime `revision`). */
export function serializeRockDocument(document: any, { pretty }?: {
    pretty?: boolean;
}): string;
/**
 * Parses, validates, and coerces a rock document from JSON (string or
 * already-parsed object). Unknown fields are dropped, missing fields get
 * defaults, and older schema versions are migrated. Throws with a
 * descriptive message on structural problems.
 */
export function deserializeRockDocument(jsonOrObject: any): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        variationSettings?: {
            version: number;
            scope: string;
            anchorBase: boolean;
            locks: {};
        };
        role: string;
        series: string;
        sourceMode: string;
        surfacePackage: any;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
        authoritySourceId?: string;
        customMeshSource?: {
            authority: string;
            control: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            editEnvelope: {
                maximumDisplacementMetres: number;
                maximumVariationStrength: number;
                mode: string;
            };
            highDetail: {
                boundsMetres: {
                    max: any[];
                    min: any[];
                };
                byteLength: number;
                contentHash: any;
                coordinateSystem: string;
                dimensionsMetres: any[];
                geometryAudit: {
                    topologyHash: any;
                    meshVertexCounts: any;
                    triangleCount: number;
                    vertexCount: number;
                };
                id: string;
                metreUnitScale: number;
                mimeType: string;
                role: any;
                sourceRevision: number;
                topologyHash: any;
                unit: string;
                uri: string;
            };
            schema: string;
            semanticRegions: {
                id: string;
                label: string;
                landmarkIds: any;
                role: string;
                selector: {
                    attribute: string;
                    kind: string;
                    value: number;
                };
            }[];
            version: number;
        };
        derivedArtifactState?: {
            surfaceReprojection: {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                method: any;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                reason?: undefined;
            } | {
                authoritySourceId: any;
                contentHash: any;
                geometrySourceId: any;
                reason: string;
                sourceRevision: any;
                status: string;
                surfaceSourceId: any;
                trueHighToLowBake: boolean;
                method?: undefined;
            };
        };
        geology?: string;
        geometrySourceId?: string;
        identityLandmarks?: {
            id: string;
            positionMetres: any[];
            role: string;
        }[];
        label?: string;
        sourceRevision?: number;
        surfaceSourceId?: string;
        surfaceReprojection?: {
            reprojectionContentId: string;
            authoritySourceId: any;
            controlContentHash: any;
            dimensionsMetres: any[];
            editOperationCount: any;
            geology: string;
            geometrySourceId: any;
            mapResolution: number;
            method: string;
            projection: Readonly<{
                characteristicMetres: number;
                dimensionsMetres: readonly number[];
                mode: "world-metre-triplanar-isotropic";
                nearDetailScaleMetres: number;
                scaleMetres: number;
                axisScale: readonly number[];
                tileSpan: readonly number[];
            }>;
            schema: string;
            seed: number;
            sourceContentId: any;
            sourceId: any;
            sourceRevision: any;
            surfaceSourceId: any;
            trueHighToLowBake: boolean;
            version: number;
        };
        thumbnailUrl?: string;
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshCuts: {
            depth: number;
            meshIndex: number;
            normal: any;
            point: any;
            radius: number;
            roughness: number;
            seed: number;
            through: boolean;
        }[];
        meshEdits: {
            deltas: any;
            meshIndex: any;
        }[];
        meshOperationOrder: any[];
        meshSnapshots: any[];
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/** Document type tag stamped on saved rockgen project JSON. */
export const ROCKGEN_PROJECT_DOCUMENT_TYPE: "toonlab/rockgen-project";
/** Current schema version for rockgen project documents. */
export const ROCKGEN_PROJECT_SCHEMA_VERSION: 9;
/** Legacy MCP request budgets. The interactive Rock Lab editor no longer uses
 * these as sculpt, drill, persistence, or replay ceilings. */
export const ROCKGEN_MAX_MESH_EDIT_OPERATIONS: 200;
export const ROCKGEN_MAX_MESH_EDIT_DELTAS: 10000;
export const ROCKGEN_MAX_MESH_CUT_OPERATIONS: 64;
export const ROCKGEN_MESH_EDIT_ENCODING: "base64-f32le-v1";
