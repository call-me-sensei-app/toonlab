/** Normalize a height function or richer surface query to one ground sampler. */
export function createGroundSampler(sampleGround: any): Readonly<{
    sample(x: any, z: any): Readonly<{
        height: number;
        normal: any;
    }>;
}>;
/**
 * Pure uneven-ground stabilizer. It decides corrections but never imports or
 * calls a renderer, physics engine, controller, input system, or scene.
 */
export function createGroundStabilizer(options?: {}): Readonly<{
    config: Readonly<{
        bodyOffset: 1;
        fallThroughDepth: 1.2;
        groundedTolerance: 0.1;
        lockGrounded: true;
        lockTolerance: 0.34;
        maxLockVerticalSpeed: 1.25;
    }>;
    ground: any;
    update: (input?: {}) => Readonly<{
        canJump: boolean;
        correction: string;
        enabled: boolean;
        error: number;
        groundHeight: any;
        groundNormal: any;
        position: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
        revision: number;
        targetY: any;
        velocity: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
    }>;
}>;
/** Apply a pure stabilizer frame to a Rapier-like rigid body adapter. */
export function applyGroundStabilizerFrame(body: any, frame: any, { upright, wake }?: {
    upright?: boolean;
    wake?: boolean;
}): any;
export const DEFAULT_GROUND_STABILIZER_CONFIG: Readonly<{
    bodyOffset: 1;
    fallThroughDepth: 1.2;
    groundedTolerance: 0.1;
    lockGrounded: true;
    lockTolerance: 0.34;
    maxLockVerticalSpeed: 1.25;
}>;
