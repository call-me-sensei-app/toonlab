import type { Object3D } from 'three';

export const SCENE_COLLISION_RUNTIME_VERSION: 1;
export const DEFAULT_SOLID_STYLE_DOMAINS: readonly [
  'manufactured.environment',
  'manufactured.surface',
  'natural.rock',
  'prop',
  'vegetation.tree',
];

export interface SceneCollisionWorld {
  readonly circles?: readonly unknown[];
  addCircles(list: readonly { x: number; z: number; radius: number }[]): unknown;
  removeCircles?(list: readonly unknown[]): number;
  groundHeight?(x: number, z: number): number;
  resolve(position: { x: number; y?: number; z: number }, radius?: number): unknown;
}

export interface SceneCollisionAdapter {
  readonly id: string;
  readonly kinds: readonly string[];
  register(input: {
    collision: SceneCollisionWorld;
    metadata: Readonly<Record<string, unknown>>;
    subject: Object3D;
    targetId: string | null;
  }): unknown | Promise<unknown>;
}

export interface SceneCollisionTargetReport {
  readonly adapterId: string | null;
  readonly domain: string;
  readonly kind: string;
  readonly registered: number;
  readonly source: 'domain-default' | 'explicit' | 'explicit-none' | 'explicit-solid';
  readonly targetId: string;
}

export interface SceneCollisionIssue {
  readonly code: string;
  readonly domain: string | null;
  readonly message: string;
  readonly severity: 'error';
  readonly targetId: string | null;
  readonly [key: string]: unknown;
}

export interface SceneCollisionReport {
  readonly issues: readonly SceneCollisionIssue[];
  readonly ok: boolean;
  readonly stats: Readonly<{
    registered: number;
    solid: number;
    targets: number;
    unresolved: number;
  }>;
  readonly targets: readonly SceneCollisionTargetReport[];
}

export interface SceneCollisionRuntime {
  assertReady(): SceneCollisionReport;
  dispose(): boolean;
  refresh(options?: {
    discoveryReport?: unknown;
    mode?: 'advisory' | 'strict';
  }): Promise<SceneCollisionReport>;
  readonly report: SceneCollisionReport;
  readonly scene: Object3D;
  readonly version: 1;
  readonly world: SceneCollisionWorld;
}

export interface CreateSceneCollisionRuntimeOptions {
  adapter?: SceneCollisionAdapter;
  adapters?: readonly SceneCollisionAdapter[];
  collision?: SceneCollisionWorld | null;
  heightAt?: ((x: number, z: number) => number) | null;
  scene: Object3D;
  solidDomains?: readonly string[];
}

export class SceneCollisionRuntimeError extends Error {
  constructor(report: SceneCollisionReport);
  readonly report: SceneCollisionReport;
}

export function createSceneCollisionRuntime(
  options: CreateSceneCollisionRuntimeOptions,
): SceneCollisionRuntime;

export function sceneCollisionRuntimeFor(
  scene: Object3D | null | undefined,
): SceneCollisionRuntime | null;
