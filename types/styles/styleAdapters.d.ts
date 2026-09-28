import type { StyleTarget, StyleTargetAdapter, StyleTargetDomain } from './styleTypes.js';

export const BUILT_IN_STYLE_ADAPTERS: Readonly<Record<StyleTargetDomain, StyleTargetAdapter>>;
export function createStyleTarget<TSubject>(
  id: string,
  domain: StyleTargetDomain,
  subject: TSubject,
  options?: {
    adapter?: StyleTargetAdapter<TSubject> | null;
    labels?: Readonly<Record<string, unknown>>;
    renderer?: unknown;
  },
): StyleTarget<TSubject>;
export function resolveStyleTargetAdapter(domain: StyleTargetDomain): StyleTargetAdapter | null;
