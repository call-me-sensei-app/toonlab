import type { StyleTargetDomain } from './styleTypes.js';

export interface StyleTargetLabelDefinition {
  assetId?: string;
  collision?: string | Readonly<Record<string, unknown>>;
  extensions?: Readonly<Record<string, unknown>>;
  materials?: Readonly<Record<string, unknown>>;
  targetId?: string;
}

export interface StyleTargetLabel extends StyleTargetLabelDefinition {
  domain: StyleTargetDomain;
  schemaVersion: number;
}

export interface StyleTargetLabelValidation {
  errors: string[];
  ok: boolean;
  value: StyleTargetLabel | null;
  warnings: string[];
}

export const STYLE_TARGET_LABEL_KEY: 'toonlab';
export const STYLE_TARGET_LABEL_SCHEMA_VERSION: number;
export function createStyleTargetLabel(
  domain: StyleTargetDomain,
  definition?: StyleTargetLabelDefinition,
): StyleTargetLabel;
export function migrateStyleTargetLabel(input: unknown): unknown;
export function parseStyleTargetLabel(input: string | unknown): StyleTargetLabelValidation;
export function serializeStyleTargetLabel(label: StyleTargetLabel, options?: { pretty?: boolean }): string;
export function validateStyleTargetLabel(input: unknown): StyleTargetLabelValidation;
