/**
 * Framework-neutral swim controller. The host supplies a water-query object,
 * a ground sampler, controller facts, and a camera-relative move vector.
 */
export function createWaterInteractionController(options?: {}): Readonly<{
    config: Readonly<{
        bedClearance: 0.88;
        enterDepth: 1.25;
        enterSurfaceAllowance: 0.35;
        exitDepth: 1.02;
        facingMinimum: 0.12;
        flowDamping: 2;
        inputDamping: 6;
        idleDamping: 3;
        maxDelta: 0.05;
        speed: 2;
        sprintSpeed: 3;
        diveSpeed: 1.7;
        surfaceGain: 3.2;
        surfaceOffset: 0.2;
        surfaceTolerance: 0.35;
        verticalSpeed: 1.7;
    }>;
    readonly swimming: boolean;
    reset: () => void;
    update: (input?: {}, deltaInput?: number) => Readonly<{
        active: false;
        constraints: any;
        depth: number;
        diving: false;
        gravityScale: 1;
        groundHeight: number;
        inWater: boolean;
        planarSpeed: number;
        position: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
        revision: number;
        sprinting: false;
        state: "ground";
        surfaced: false;
        surfaceTargetY: any;
        swimming: false;
        transition: "enter" | "exit";
        velocity: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
        waterHeight: number;
        waterLevel: number;
    }> | Readonly<{
        active: true;
        constraints: Readonly<{
            maxPlanarSpeed: number;
            maxY: number;
            minY: number;
        }>;
        depth: number;
        diving: boolean;
        facingError: number;
        gravityScale: 0;
        groundHeight: number;
        inWater: boolean;
        planarSpeed: number;
        position: Readonly<{
            y: number;
            x: number;
            z: number;
        }>;
        revision: number;
        sprinting: boolean;
        state: "surface" | "dive";
        surfaced: boolean;
        surfaceTargetY: number;
        swimming: true;
        transition: "enter" | "exit";
        velocity: Readonly<{
            x: number;
            y: 0;
            z: number;
        }>;
        waterHeight: number;
        waterLevel: number;
    }>;
}>;
/** Apply the current swim target before the physics step. */
export function applyWaterInteractionFrame(body: any, frame: any, { wake }?: {
    wake?: boolean;
}): any;
/** Re-apply swim constraints after third-party controller forces run. */
export function enforceWaterInteractionFrame(body: any, frame: any, { wake }?: {
    wake?: boolean;
}): any;
export const DEFAULT_WATER_INTERACTION_CONFIG: Readonly<{
    bedClearance: 0.88;
    enterDepth: 1.25;
    enterSurfaceAllowance: 0.35;
    exitDepth: 1.02;
    facingMinimum: 0.12;
    flowDamping: 2;
    inputDamping: 6;
    idleDamping: 3;
    maxDelta: 0.05;
    speed: 2;
    sprintSpeed: 3;
    diveSpeed: 1.7;
    surfaceGain: 3.2;
    surfaceOffset: 0.2;
    surfaceTolerance: 0.35;
    verticalSpeed: 1.7;
}>;
