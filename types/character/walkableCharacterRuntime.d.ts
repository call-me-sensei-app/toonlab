export function createCharacterControllerProfile(input?: {}): Readonly<{
    bodyCenterAtRest: any;
    capsuleHalfHeight: any;
    capsuleRadius: any;
    floatHeight: any;
    modelOffsetY: any;
    springSag: any;
    targetHeight: any;
}>;
/**
 * High-level, framework-neutral composition of character loading, animation,
 * controller offsets, uneven ground, and water interaction.
 */
export function createWalkableCharacterRuntime(options?: {}): Promise<Readonly<{
    character: any;
    collision: any;
    readonly frame: any;
    ground: Readonly<{
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
    locomotion: Readonly<{
        config: Readonly<{
            blendDamping: 10;
            jumpBlendDamping: 14;
            jumpDuration: 1.25;
            landingGrace: 0.15;
            runSpeed: 3.1;
            sitBlendDamping: 8;
            swimBlendDamping: 8;
            swimSprintSpeed: 3;
            swimStrokeGrace: 0.6;
            walkSpeed: 1.45;
        }>;
        readonly frame: any;
        reset: () => void;
        update: (input?: {}, deltaInput?: number) => Readonly<{
            events: readonly (Readonly<{
                type: "land" | "jump-end";
            }> | Readonly<{
                type: "jump-start";
            }>)[];
            revision: number;
            state: "idle" | "walk" | "run" | "jump" | "swim" | "dive" | "tread" | "sit" | "freestyle" | "airborne";
            timeScales: Readonly<{
                freestyle: number;
                run: number;
                swim: number;
                walk: number;
            }>;
            weights: Readonly<{
                dive: number;
                freestyle: number;
                idle: number;
                jump: number;
                run: number;
                sit: number;
                swim: number;
                tread: number;
                walk: number;
            }>;
        }>;
    }>;
    profile: Readonly<{
        bodyCenterAtRest: any;
        capsuleHalfHeight: any;
        capsuleRadius: any;
        floatHeight: any;
        modelOffsetY: any;
        springSag: any;
        targetHeight: any;
    }>;
    renderPasses: any;
    update: (input?: {}, delta?: number) => Readonly<{
        collision: Readonly<{
            corrected: boolean;
            enabled: boolean;
            position: Readonly<{
                x: number;
                y: number;
                z: number;
            }>;
            radius: any;
        }>;
        ground: Readonly<{
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
        locomotion: Readonly<{
            events: readonly (Readonly<{
                type: "land" | "jump-end";
            }> | Readonly<{
                type: "jump-start";
            }>)[];
            revision: number;
            state: "idle" | "walk" | "run" | "jump" | "swim" | "dive" | "tread" | "sit" | "freestyle" | "airborne";
            timeScales: Readonly<{
                freestyle: number;
                run: number;
                swim: number;
                walk: number;
            }>;
            weights: Readonly<{
                dive: number;
                freestyle: number;
                idle: number;
                jump: number;
                run: number;
                sit: number;
                swim: number;
                tread: number;
                walk: number;
            }>;
        }>;
        position: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
        profile: Readonly<{
            bodyCenterAtRest: any;
            capsuleHalfHeight: any;
            capsuleRadius: any;
            floatHeight: any;
            modelOffsetY: any;
            springSag: any;
            targetHeight: any;
        }>;
        revision: number;
        velocity: Readonly<{
            x: number;
            y: number;
            z: number;
        }>;
        water: Readonly<{
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
    water: Readonly<{
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
    enforce(body: any): any;
    dispose(options: any): void;
    setAnimationEnabled(enabled: any): any;
}>>;
/** Safe replace-in-place owner for character picker and scene transitions. */
export function createWalkableCharacterSlot({ createRuntime }?: {
    createRuntime?: typeof createWalkableCharacterRuntime;
}): Readonly<{
    readonly current: any;
    replace(options: any): Promise<any>;
    dispose(): void;
}>;
export const DEFAULT_CHARACTER_CONTROLLER_PROFILE: Readonly<{
    capsuleHalfHeight: 0.54;
    capsuleRadius: 0.28;
    floatHeight: 0.18;
    springSag: 0.04;
    targetHeight: 1.7;
}>;
