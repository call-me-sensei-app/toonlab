export type StyleTargetDomain =
  | 'character'
  | 'cloud'
  | 'equipment'
  | 'lighting'
  | 'manufactured.environment'
  | 'manufactured.surface'
  | 'natural.rock'
  | 'post'
  | 'prop'
  | 'sky'
  | 'terrain.ground'
  | 'vegetation.flower'
  | 'vegetation.grass'
  | 'vegetation.tree'
  | 'water';

export type StyleBundleApplicationMode = 'strict' | 'advisory';

export interface StyleTargetAdapter<TSubject = unknown, TSettings = unknown> {
  readonly id: string;
  readonly custom?: boolean;
  apply(subject: TSubject, settings: TSettings, context: StyleApplyContext): unknown | Promise<unknown>;
  capture?(subject: TSubject, context: StyleTargetSnapshotContext): unknown | Promise<unknown>;
  restore?(subject: TSubject, snapshot: unknown, context: StyleTargetSnapshotContext): unknown | Promise<unknown>;
}

export interface StyleTargetSnapshotContext {
  domain: StyleTargetDomain;
  slot: string;
  target: StyleTarget;
  targetId: string;
}

export interface StyleApplyContext extends StyleTargetSnapshotContext {
  bundle: unknown;
  resolvedSettings: Readonly<Record<string, unknown>>;
}

export interface StyleTarget<TSubject = unknown> {
  adapter: StyleTargetAdapter<TSubject> | null;
  domain: StyleTargetDomain;
  id: string;
  labels: Readonly<Record<string, unknown>>;
  renderer: unknown;
  subject: TSubject;
}

export interface StyleTargetControl {
  readonly adapterId: string | null;
  readonly domain: StyleTargetDomain;
  readonly enabled: boolean;
  readonly slot: string;
  readonly targetId: string;
}

export interface StyleApplicationResult {
  readonly applied: readonly { domain: StyleTargetDomain; slot: string; targetId: string }[];
  readonly gaps: readonly unknown[];
  readonly issues: readonly unknown[];
  readonly ok: boolean;
  readonly skipped: readonly { domain: StyleTargetDomain; reason: string; slot: string; targetId: string }[];
  readonly targetControls: readonly StyleTargetControl[];
  revert(): Promise<Readonly<Record<string, unknown>>>;
  setTargetEnabled(targetId: string, enabled: boolean): Promise<Readonly<Record<string, unknown>>>;
}
