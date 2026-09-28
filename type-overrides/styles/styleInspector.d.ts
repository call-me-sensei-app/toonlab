import type { StyleApplicationResult, StyleTargetDomain } from './styleTypes.js';

export interface ToonLabInspectorTarget {
  adapterId: string | null;
  controllable: boolean;
  domain: StyleTargetDomain;
  enabled: boolean;
  participation: Readonly<Record<string, unknown>>;
  slot: string;
  targetId: string;
  transactionCount: number;
}
export interface ToonLabInspectorDomain {
  controllable: boolean;
  domain: StyleTargetDomain;
  enabled: boolean;
  targets: string[];
}
export interface ToonLabInspectorSnapshot {
  active: Readonly<Record<'bundle' | 'content' | 'quality' | 'scenario', unknown>>;
  diagnostics: Readonly<Record<string, unknown>>;
  domains: ToonLabInspectorDomain[];
  gaps: unknown[];
  issues: unknown[];
  package: { name: '@call-me-sensei/toonlab'; version: string };
  targets: ToonLabInspectorTarget[];
  telemetry: Readonly<Record<string, unknown>>;
  type: typeof TOONLAB_INSPECTOR_DOCUMENT_TYPE;
  version: typeof TOONLAB_INSPECTOR_VERSION;
}
export interface ToonLabInspector {
  dispose(): void;
  registerApplication(
    application: StyleApplicationResult,
    options?: { participation?: Readonly<Record<string, Readonly<Record<string, unknown>>>> },
  ): () => void;
  serialize(options?: { pretty?: boolean }): string;
  setContext(context?: Readonly<Record<string, unknown>>): ToonLabInspectorSnapshot;
  setDomainEnabled(domain: StyleTargetDomain, enabled: boolean): Promise<Readonly<Record<string, unknown>>>;
  setTargetEnabled(targetId: string, enabled: boolean): Promise<Readonly<Record<string, unknown>>>;
  snapshot(): ToonLabInspectorSnapshot;
  subscribe(listener: (snapshot: ToonLabInspectorSnapshot) => void): () => boolean;
  updateTelemetry(telemetry?: Readonly<Record<string, unknown>>): ToonLabInspectorSnapshot;
}

export const TOONLAB_INSPECTOR_DOCUMENT_TYPE: 'toonlab/runtime-inspector';
export const TOONLAB_INSPECTOR_VERSION: 1;
export class ToonLabInspectorToggleError extends Error {
  readonly cause: unknown;
  readonly rollbackErrors: readonly unknown[];
  readonly rolledBack: boolean;
}
export function createToonLabInspector(options?: {
  bundle?: unknown;
  content?: unknown;
  diagnostics?: Readonly<Record<string, unknown>> | (() => Readonly<Record<string, unknown>>);
  quality?: unknown;
  scenario?: unknown;
}): ToonLabInspector;
