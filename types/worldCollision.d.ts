export function createWorldCollision({ heightAt, cellSize }?: {
    heightAt?: any;
    cellSize?: number;
}): {
    addCircle: (x: any, z: any, radius: any) => {
        radius: number;
        x: number;
        z: number;
    };
    addCircles: (list?: any[]) => {
        radius: number;
        x: number;
        z: number;
    }[];
    circles: any[];
    clear: () => number;
    groundHeight: (x: any, z: any) => number;
    removeCircle: (circle: any) => boolean;
    removeCircles: (list?: any[]) => number;
    resolve: (position: any, radius?: number) => any;
};
export { COLLISION_METADATA_KINDS, COLLISION_METADATA_VERSION, createCollisionAdapter, createCollisionMetadata, createRapierCollisionAdapter, collectObjectTrimesh, LIGHTWEIGHT_WORLD_COLLISION_ADAPTER, registerCollisionTarget, TRIMESH_DATA_COLLISION_ADAPTER, validateCollisionMetadata } from "./collisionMetadata.js";
