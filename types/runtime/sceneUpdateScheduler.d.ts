export function createSceneUpdateScheduler({ clock, errorMode, maxFrameMs, }?: {
    clock?: typeof defaultClock;
    errorMode?: string;
    maxFrameMs?: number;
}): Readonly<{
    register(input: any): Readonly<{
        id: string;
        dispose(): boolean;
    }>;
    update(context?: {}): any;
    dispose(): boolean;
    setFrameBudget(nextMaxFrameMs: any): /*elided*/ any;
    readonly frameBudgetMs: number;
    readonly disposed: boolean;
    readonly lastFrame: any;
    readonly size: number;
}>;
export const SCENE_UPDATE_SCHEDULER_VERSION: 1;
export const SCENE_UPDATE_PHASES: readonly string[];
export class SceneUpdateSchedulerError extends Error {
    constructor(task: any, cause: any, frame: any);
    cause: any;
    frame: any;
    phase: any;
    taskId: any;
}
declare function defaultClock(): number;
export {};
