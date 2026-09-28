export function cloneSerializable(value: any): any;
/** Stable FNV-1a hash. Strings and numbers are accepted as public seeds. */
export function hashSeed(value: any): number;
export function deriveSeed(seed: any, namespace: any): number;
/**
 * Creates a deterministic stream. `fork(label)` is derived from the stream's
 * root seed rather than its current cursor, so adding an unrelated field does
 * not perturb existing generated values.
 */
export function createSeededRandom(seed?: number, namespace?: string): {
    seed: number;
    next(): number;
    float(min?: number, max?: number): number;
    int(min?: number, max?: number): number;
    bool(probability?: number): boolean;
    normal(mean?: number, deviation?: number): number;
    pick(values?: any[]): any;
    weighted(options?: any[]): any;
    fork(label: any): /*elided*/ any;
};
/** Samples a domain leaf. Domain leaves are explicitly tagged with `$type`. */
export function sampleDomain(domain: any, random?: {
    seed: number;
    next(): number;
    float(min?: number, max?: number): number;
    int(min?: number, max?: number): number;
    bool(probability?: number): boolean;
    normal(mean?: number, deviation?: number): number;
    pick(values?: any[]): any;
    weighted(options?: any[]): any;
    fork(label: any): /*elided*/ any;
}): any;
/**
 * Resolves a nested domain tree. Each leaf receives a named path stream, so
 * schema additions are deterministic and backward-friendly.
 */
export function generateDomainValues(domains?: {}, { current, locks, seed, }?: {
    current?: {};
    locks?: any[];
    seed?: number;
}): any;
export function deepMerge(...sources: any[]): {};
export function stableStringify(value: any, space?: number): string;
export function hashValue(value: any): string;
/**
 * Validates the shared open-domain grammar before a recipe reaches sampling.
 * This keeps malformed MCP/imported recipes from validating successfully and
 * then failing later inside a lab or runtime generation call.
 */
export function validateGeneratorDomains(input: any): {
    errors: any[];
    ok: boolean;
    warnings: any[];
};
export function validateGeneratorRecipeDocument(input: any, { domain, sanitizeConfiguration, }?: {
    sanitizeConfiguration?: (value: any) => any;
}): {
    errors: any[];
    ok: boolean;
    value: {
        basePreset: string;
        configuration: {};
        description: string;
        domains: {};
        id: string;
        label: string;
        locks: any[];
        seed: number;
        type: string;
        version: number;
    };
    warnings: any[];
};
export function createGeneratorRecipeDocument(domain: any, id: any, definition?: {}, options?: {}): {
    basePreset: string;
    configuration: {};
    description: string;
    domains: {};
    id: string;
    label: string;
    locks: any[];
    seed: number;
    type: string;
    version: number;
};
export function parseGeneratorRecipeDocument(input: any, options?: {}): any;
export function serializeGeneratorRecipeDocument(domain: any, idOrDocument: any, definition?: {}, { pretty, ...options }?: {
    pretty?: boolean;
}): string;
/** Resolves a recipe into flat settings ready for a runtime normalizer. */
export function resolveGeneratorRecipe(recipe: any, { baseSettings, sanitizeSettings, }?: {
    baseSettings?: {};
    sanitizeSettings?: (value: any) => any;
}): any;
export const GENERATOR_RECIPE_SCHEMA_VERSION: 1;
