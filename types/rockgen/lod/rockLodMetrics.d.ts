export function getGeometryTriangleCount(geometry: any): number;
export function getGeometryBounds(geometry: any): {
    center: number[];
    diagonal: number;
    max: any[];
    min: any[];
    size: number[];
};
export function compareGeometryBounds(referenceGeometry: any, candidateGeometry: any): {
    candidate: {
        center: number[];
        diagonal: number;
        max: any[];
        min: any[];
        size: number[];
    };
    centerDrift: number;
    maxSizeError: number;
    reference: {
        center: number[];
        diagonal: number;
        max: any[];
        min: any[];
        size: number[];
    };
    relativeSizeError: number[];
};
export function compareGeometrySilhouettes(referenceGeometry: any, candidateGeometry: any, { gridSize, }?: {
    gridSize?: number;
}): {
    gridSize: number;
    mean: number;
    min: number;
    views: {};
};
export function compareRockLodGeometry(referenceGeometry: any, candidateGeometry: any, options?: {}): {
    bounds: {
        candidate: {
            center: number[];
            diagonal: number;
            max: any[];
            min: any[];
            size: number[];
        };
        centerDrift: number;
        maxSizeError: number;
        reference: {
            center: number[];
            diagonal: number;
            max: any[];
            min: any[];
            size: number[];
        };
        relativeSizeError: number[];
    };
    silhouette: {
        gridSize: number;
        mean: number;
        min: number;
        views: {};
    };
};
