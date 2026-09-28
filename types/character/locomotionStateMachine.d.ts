/**
 * Framework-neutral locomotion role blender. It consumes controller facts and
 * produces animation-role weights; it never reads keys, Rapier, Three actions,
 * scene refs, or model-specific clip names.
 */
export function createLocomotionStateMachine(configInput?: {}): Readonly<{
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
/** Apply a state-machine frame to normalized ToonLab locomotion actions. */
export function applyLocomotionFrame(actions: any, frame: any): any;
export const LOCOMOTION_ROLES: readonly string[];
export const DEFAULT_LOCOMOTION_STATE_MACHINE_CONFIG: Readonly<{
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
