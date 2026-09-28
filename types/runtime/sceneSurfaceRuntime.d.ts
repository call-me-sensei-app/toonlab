import type { Camera, Object3D } from 'three';
import type { WaterSurface } from '../water/waterSurface.js';

export type SceneSurfaceBounds = {
  min?: { x: number; z: number };
  max?: { x: number; z: number };
  minX?: number;
  minZ?: number;
  maxX?: number;
  maxZ?: number;
};

export type SceneSurfacePlacement = {
  x: number;
  y?: number;
  z: number;
  [key: string]: unknown;
};

export type SceneSurfaceAuditIssue = {
  code: string;
  message: string;
  severity: 'error';
  domain?: string;
};

export type SceneSurfaceAudit = {
  ok: boolean;
  issues: readonly SceneSurfaceAuditIssue[];
  stats: {
    grassFields: number;
    objectPlacements: number;
    placements: number;
    waterBodies: number;
  };
};

export type SceneSurfaceWaterBody = {
  footprint: Readonly<{
    maxX: number;
    maxZ: number;
    minX: number;
    minZ: number;
  }>;
  water: WaterSurface;
  y: number;
};

export type SceneSurfaceStyleRuntime = {
  readonly sky?: unknown;
  readonly shadowPass?: {
    readonly casterCoverage?: unknown;
    readonly receiverCoverage?: unknown;
    readonly ready?: boolean;
    readonly renderCount?: number;
    readonly shadowTexture?: unknown;
  } | null;
};

export type SceneSurfaceAuditOptions = {
  camera?: Camera | null;
  requireShadowDomains?: string[];
  requireVisibleSky?: boolean;
  styleRuntime?: SceneSurfaceStyleRuntime | null;
  tolerance?: number;
};

export declare function createSceneSurfaceRuntime(options: {
  bounds: SceneSurfaceBounds;
  heightAt: (x: number, z: number) => number;
  waterLevel?: number;
}): {
  readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  readonly waterLevel: number;
  heightAt(x: number, z: number): number;
  contains(x: number, z: number): boolean;
  waterBodyAt(x: number, z: number): SceneSurfaceWaterBody | null;
  groundPlacements(placements: SceneSurfacePlacement[], options?: { offset?: number }): SceneSurfacePlacement[];
  createGrassField(options?: Record<string, unknown>): Promise<Object3D & { placements: SceneSurfacePlacement[] }>;
  createWaterSurface(options?: Record<string, unknown>): WaterSurface;
  place<T extends Object3D>(object: T, options: {
    x: number;
    z: number;
    offset?: number;
    anchor?: 'origin' | 'bounds';
    preserveTextures?: boolean;
  }): T;
  audit(options?: SceneSurfaceAuditOptions): SceneSurfaceAudit;
  assertReady(options?: SceneSurfaceAuditOptions): SceneSurfaceAudit;
};
