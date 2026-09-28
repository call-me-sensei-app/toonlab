export class WaterInteractionManager {
    constructor(surface: any, { wakeInterval, entrySplashSpeed, exitSplashSpeed, minWakeSpeed, }?: {
        wakeInterval?: number;
        entrySplashSpeed?: number;
        exitSplashSpeed?: number;
        minWakeSpeed?: number;
    });
    surface: any;
    wakeInterval: number;
    entrySplashSpeed: number;
    exitSplashSpeed: number;
    minWakeSpeed: number;
    interactors: Map<any, any>;
    nextId: number;
    resolvePosition(source: any, out: any): any;
    add(source: any, options?: {}): any;
    remove(id: any): void;
    clear(): void;
    update(delta: any): void;
    updateInteractor(interactor: any, delta: any): void;
}
