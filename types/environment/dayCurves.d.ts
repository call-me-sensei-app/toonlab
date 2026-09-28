/**
 * Maps a cycle clock (seconds since sunrise, wrapping every
 * dayLength + nightLength) onto day-cycle progress. Transitions live at the
 * edges of each half: sunrise finishes at the start of the day span, sunset
 * occupies its tail; dusk opens the night span, dawn closes it.
 */
export function dayCycleProgressFromTime(time: any, { dayLength, nightLength, sunriseDuration, sunsetDuration, duskDuration, dawnDuration, }?: {
    dayLength?: number;
    nightLength?: number;
    sunriseDuration?: number;
    sunsetDuration?: number;
    duskDuration?: number;
    dawnDuration?: number;
}): number;
/**
 * Companion pseudo-hour for consumers keyed to a 24h clock
 * (LightingSystem.setTimeOfDay): the day span maps to 06:00-18:00 and the
 * night span to 18:00-06:00 regardless of the configured span lengths.
 */
export function hourFromDayCycleTime(time: any, { dayLength, nightLength }?: {
    dayLength?: number;
    nightLength?: number;
}): number;
/**
 * Samples a looping curve at progress in [0, 1). Stops need not be sorted;
 * interpolation wraps from the last stop back to the first (at + 1).
 * `ease: 'smooth'` applies smoothstep between stops. Pass `target` (a
 * THREE.Color or array) to write color results without allocating.
 */
export function sampleDayCurve(stops: any, progress: any, { ease, target }?: {
    ease?: string;
    target?: any;
}): any;
/**
 * The four-phase convenience constructor: one value per phase, wrapping from
 * sunrise back to day. This is the shape most style-preset curves use.
 */
export function fiveStopCurve(day: any, sunset: any, night: any, sunrise: any): {
    at: number;
    value: any;
}[];
export namespace DAY_CYCLE_PHASE {
    let day: number;
    let sunset: number;
    let night: number;
    let sunrise: number;
}
