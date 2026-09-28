export function finite(value: any, fallback?: number): number;
export function isPlainObject(value: any): boolean;
export function vector(value: any, fallback: any, size?: any): any[];
export function slug(value: any, fallback?: string): string;
/** Deep-clones a JSON-compatible value without requiring structuredClone. */
export function cloneJson(value: any): any;
/** Recursively freezes an object registry exposed as a public constant. */
export function deepFreeze(value: any): any;
export function mergePlain(base: any, overrides: any): any;
export function uniqueId(preferred: any, used: any, fallbackPrefix?: string): string;
export function createValidationResult(errors: any, warnings?: any[]): Readonly<{
    errors: readonly any[];
    ok: boolean;
    valid: boolean;
    warnings: readonly any[];
}>;
export function formatValidationErrors(label: any, result: any): string;
export function clamp(value: any, min: any, max: any): number;
