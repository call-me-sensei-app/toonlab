import type {
  StyleApplicationResult,
  StyleBundleApplicationMode,
  StyleTarget,
  StyleTargetDomain,
} from './styleTypes.js';

export const STYLE_DOMAIN_SLOT_ROUTES: Readonly<Record<StyleTargetDomain, string>>;
export const STYLE_TARGET_DOMAINS: readonly StyleTargetDomain[];

export interface StyleApplicationAudit {
  bundle?: unknown;
  gaps: unknown[];
  issues: { code: string; message: string; severity: string; targetId: string | null }[];
  ok: boolean;
  plan: unknown[];
  settings: Readonly<Record<string, unknown>>;
  warnings?: string[];
}

export class StyleBundleApplicationError extends Error {
  readonly audit: StyleApplicationAudit;
}
export class StyleBundleTransactionError extends Error {
  readonly applied: readonly unknown[];
  readonly audit: StyleApplicationAudit;
  readonly cause: unknown;
  readonly rollbackErrors: readonly unknown[];
  readonly rolledBack: boolean;
  readonly stage: 'snapshot' | 'apply' | 'toggle' | 'revert';
}

export function auditStyleBundleApplication(
  bundle: unknown,
  targets: readonly StyleTarget[],
  options?: { allowCustomAdapters?: boolean },
): StyleApplicationAudit;
export function applyStyleBundle(
  bundle: unknown,
  options?: {
    allowCustomAdapters?: boolean;
    mode?: StyleBundleApplicationMode;
    targets?: readonly StyleTarget[];
  },
): Promise<StyleApplicationResult>;

export type { StyleApplicationResult, StyleBundleApplicationMode, StyleTargetDomain };
