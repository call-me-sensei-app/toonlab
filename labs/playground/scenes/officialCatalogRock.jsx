import React, { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';

import {
  createOfficialCatalogAssetRuntime,
  createOfficialCatalogProvider,
  loadOfficialCatalogAsset,
} from '@call-me-sensei/toonlab/official-catalog';
import { TRIMESH_DATA_COLLISION_ADAPTER } from '@call-me-sensei/toonlab/world-collision';
import { CALL_ME_SENSEI_STYLE_BUNDLE } from '@call-me-sensei/toonlab/styles';
import { useWalkablePhysicsReadiness } from './showcases/walkablePhysicsReadiness.jsx';

const runtimePools = new WeakMap();

function acquirePlaygroundCatalogRuntime(renderer) {
  let pool = runtimePools.get(renderer);
  if (!pool) {
    const baseUrl = new URL(import.meta.env.BASE_URL ?? '/', window.location.origin).href;
    const provider = createOfficialCatalogProvider({ baseUrl, transport: 'workspace' });
    pool = {
      refs: 0,
      runtime: createOfficialCatalogAssetRuntime({
        decoderBasePath: baseUrl,
        provider,
        renderer,
      }),
    };
    runtimePools.set(renderer, pool);
  }
  pool.refs += 1;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      pool.refs -= 1;
      if (pool.refs > 0) return;
      runtimePools.delete(renderer);
      void pool.runtime.dispose();
    },
    runtime: pool.runtime,
  };
}

export function OfficialCatalogRock({
  assetId,
  // Catalog rocks are solid by default. Background-only composition must opt
  // out explicitly so a new placement cannot silently become walk-through.
  collidable = true,
  inspector = null,
  maxLodLevel = Number.POSITIVE_INFINITY,
  position = [0, 0, 0],
  rotation = 0,
  scale = 1,
  targetId = `walkable/${assetId}`,
}) {
  const camera = useThree((state) => state.camera);
  const renderer = useThree((state) => state.gl);
  const [placement, setPlacement] = useState(null);
  const completePhysicsReadiness = useWalkablePhysicsReadiness(
    collidable,
    `catalog:${assetId}:${targetId}`,
  );

  useEffect(() => {
    let cancelled = false;
    let current = null;
    const lease = acquirePlaygroundCatalogRuntime(renderer);
    document.body.dataset.rockCatalogSource = '480';
    const pending = loadOfficialCatalogAsset({
      assetId,
      assetRuntime: lease.runtime,
      collision: collidable ? 'auto' : false,
      collisionAdapter: TRIMESH_DATA_COLLISION_ADAPTER,
      inspector,
      maxLodLevel,
      position,
      rotation,
      scale,
      styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
      targetId,
    }).then(async (next) => {
      if (cancelled) {
        await next.release();
        return;
      }
      current = next;
      document.body.dataset[`${assetId.replace('-', '')}Ready`] = 'true';
      document.body.dataset[`${assetId.replace('-', '')}Collider`] = String(Boolean(next.collision));
      document.body.dataset[`${assetId.replace('-', '')}Shader`] = 'call_me_sensei';
      document.body.dataset[`${assetId.replace('-', '')}TextureSource`] = 'first-party-generated';
      setPlacement(next);
      completePhysicsReadiness();
    }).catch((error) => {
      if (cancelled) return;
      completePhysicsReadiness();
      document.body.dataset.rockCatalogError = `${assetId}: ${error.message}`;
      console.error(`Official catalog rock ${assetId} failed to load:`, error);
    });

    return () => {
      cancelled = true;
      setPlacement(null);
      void pending.finally(async () => {
        if (current) await current.release();
        lease.release();
      });
    };
  }, [assetId, collidable, completePhysicsReadiness, inspector, maxLodLevel, position, renderer, rotation, scale, targetId]);

  useFrame(() => {
    placement?.updateLod({ camera });
  });

  if (!placement) return null;
  return (
    <>
      <primitive object={placement.container} />
      {placement.collision?.trimesh && (
        <RigidBody type="fixed" colliders={false}>
          <TrimeshCollider
            args={[
              placement.collision.trimesh.vertices,
              placement.collision.trimesh.indices,
            ]}
            friction={0.9}
          />
        </RigidBody>
      )}
    </>
  );
}
