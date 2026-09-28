export function createSkyDayCycle({ sky, world, lighting, environmentRoot, fog, weather, water, curves, dayLength, nightLength, startTime, timeScale, updateInterval, }?: {
    sky?: any;
    world?: any;
    lighting?: any;
    environmentRoot?: any;
    fog?: any;
    weather?: any;
    water?: any;
    curves?: {};
    dayLength?: number;
    nightLength?: number;
    startTime?: any;
    timeScale?: number;
    updateInterval?: number;
}): {
    readonly time: any;
    readonly progress: any;
    /** Pins the cycle at a fixed progress (0 day, .25 sunset, .5 night, .75 sunrise); null resumes. */
    pinProgress(progress?: any): void;
    setTime(next: any): void;
    setTimeScale(next: any): void;
    update(delta?: number): void;
    apply: () => any;
};
export const DEFAULT_DAY_CYCLE_CURVES: Readonly<{
    zenithColor: {
        at: number;
        value: any;
    }[];
    horizonColor: {
        at: number;
        value: any;
    }[];
    groundColor: {
        at: number;
        value: any;
    }[];
    sunColor: {
        at: number;
        value: any;
    }[];
    cloudColor: {
        at: number;
        value: any;
    }[];
    cloudShadeColor: {
        at: number;
        value: any;
    }[];
    fogColor: {
        at: number;
        value: any;
    }[];
    glowColor: {
        at: number;
        value: any;
    }[];
    glowIntensity: {
        at: number;
        value: any;
    }[];
    sunIntensity: {
        at: number;
        value: any;
    }[];
    starsStrength: {
        at: number;
        value: any;
    }[];
    skyLightColor: {
        at: number;
        value: any;
    }[];
    skyGroundTint: {
        at: number;
        value: any;
    }[];
    skyTopTint: {
        at: number;
        value: any;
    }[];
    exposureScale: {
        at: number;
        value: any;
    }[];
}>;
