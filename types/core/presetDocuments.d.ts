export function isPlainPresetObject(value: any): boolean;
export function cleanPresetObject(value: any): any;
export function parsePresetDocument(input: any, validateDocument: any, { invalidJsonLabel }?: {
    invalidJsonLabel?: string;
}): any;
export function validateSettingsPresetDocument(input: any, { collectWarnings, documentType, normalizeId, sanitizeSettings, schemaVersion, migrateDocument, }?: {
    collectWarnings?: () => any[];
}): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: any;
        label: string;
        settings: any;
        type: any;
        version: any;
    };
    warnings: any[];
};
export function createSettingsPresetDocument(id: any, definition?: {}, { collectSettings, documentType, schemaVersion, validateDocument, }?: {}): any;
export function serializePresetDocument(idOrDocument: any, definition?: {}, { argumentCount, createDocument, pretty, }?: {
    argumentCount?: number;
    pretty?: boolean;
}): string;
