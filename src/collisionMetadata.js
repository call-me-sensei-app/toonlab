import { Box3, Vector3 } from 'three';

export const COLLISION_METADATA_VERSION = 1;
export const COLLISION_METADATA_KINDS = Object.freeze([
  'none',
  'bounds',
  'convex',
  'trimesh',
  'blockers',
]);

const SOURCE_VALUES = Object.freeze(['render-mesh', 'collider']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCircle(input, index, errors) {
  if (!isPlainObject(input)) {
    errors.push(`collision.circles[${index}] must be an object.`);
    return null;
  }
  const radius = finite(input.radius, NaN);
  if (!(radius > 0)) errors.push(`collision.circles[${index}].radius must be greater than 0.`);
  return {
    radius: radius > 0 ? radius : 0,
    x: finite(input.x),
    y: finite(input.y),
    z: finite(input.z),
  };
}

export function validateCollisionMetadata(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { errors: ['Collision metadata must be a JSON object.'], ok: false, value: null };
  }
  const version = Number(input.version);
  if (version !== COLLISION_METADATA_VERSION) {
    errors.push(`Collision metadata version must be ${COLLISION_METADATA_VERSION}.`);
  }
  const kind = String(input.kind ?? '').trim();
  if (!COLLISION_METADATA_KINDS.includes(kind)) {
    errors.push(`Collision metadata kind must be one of: ${COLLISION_METADATA_KINDS.join(', ')}.`);
  }
  const padding = Math.max(finite(input.padding), 0);
  const source = String(input.source ?? 'render-mesh').trim();
  if (['convex', 'trimesh'].includes(kind) && !SOURCE_VALUES.includes(source)) {
    errors.push(`Collision ${kind} source must be "render-mesh" or "collider".`);
  }
  const circles = kind === 'blockers'
    ? (Array.isArray(input.circles)
      ? input.circles.map((circle, index) => normalizeCircle(circle, index, errors)).filter(Boolean)
      : (errors.push('Collision blockers need a circles array.'), []))
    : [];
  if (kind === 'blockers' && circles.length === 0) {
    errors.push('Collision blockers need at least one circle.');
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length ? null : {
      kind,
      version: COLLISION_METADATA_VERSION,
      ...(kind === 'bounds' ? { padding } : {}),
      ...(['convex', 'trimesh'].includes(kind) ? { source } : {}),
      ...(kind === 'blockers' ? { circles } : {}),
    },
  };
}

export function createCollisionMetadata(kind, definition = {}) {
  const result = validateCollisionMetadata({ ...definition, kind, version: COLLISION_METADATA_VERSION });
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return result.value;
}

export function createCollisionAdapter(id, { kinds = [], register } = {}) {
  const adapterId = String(id ?? '').trim();
  const supportedKinds = [...new Set(kinds.map((kind) => String(kind).trim()))];
  if (!adapterId) throw new TypeError('A collision adapter needs a stable id.');
  if (supportedKinds.some((kind) => !COLLISION_METADATA_KINDS.includes(kind))) {
    throw new TypeError('Collision adapter kinds must use the public collision metadata kinds.');
  }
  if (typeof register !== 'function') throw new TypeError('A collision adapter needs register().');
  return Object.freeze({ id: adapterId, kinds: Object.freeze(supportedKinds), register });
}

const boundsBox = new Box3();
const boundsCenter = new Vector3();
const boundsSize = new Vector3();
const blockerPoint = new Vector3();
const blockerScale = new Vector3();

/** Build one indexed world-space trimesh from the visible opaque meshes. */
export function collectObjectTrimesh(root) {
  if (!root?.traverse) throw new TypeError('Trimesh extraction requires an Object3D root.');
  const vertexChunks = [];
  const indexChunks = [];
  const vertex = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  let vertexOffset = 0;
  root.updateWorldMatrix?.(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    for (let current = object; current; current = current.parent) {
      if (current.visible === false) return;
      if (current === root) break;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length > 0 && materials.every((material) => material?.transparent === true)) return;
    const position = object.geometry.attributes.position;
    if (position.count < 3) return;
    const vertices = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) return;
      vertex.toArray(vertices, index * 3);
    }
    const sourceIndices = object.geometry.index?.array ?? null;
    const triangleCount = Math.floor((sourceIndices?.length ?? position.count) / 3);
    const indices = [];
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const i0 = sourceIndices ? sourceIndices[triangle * 3] : triangle * 3;
      const i1 = sourceIndices ? sourceIndices[triangle * 3 + 1] : triangle * 3 + 1;
      const i2 = sourceIndices ? sourceIndices[triangle * 3 + 2] : triangle * 3 + 2;
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      a.fromArray(vertices, i0 * 3);
      b.fromArray(vertices, i1 * 3);
      c.fromArray(vertices, i2 * 3);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      if (ab.cross(ac).lengthSq() < 1e-8) continue;
      indices.push(i0 + vertexOffset, i1 + vertexOffset, i2 + vertexOffset);
    }
    if (indices.length === 0) return;
    vertexChunks.push(vertices);
    indexChunks.push(indices);
    vertexOffset += position.count;
  });
  if (vertexChunks.length === 0) return null;
  const vertices = new Float32Array(vertexChunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let writeOffset = 0;
  vertexChunks.forEach((chunk) => {
    vertices.set(chunk, writeOffset);
    writeOffset += chunk.length;
  });
  const indices = new Uint32Array(indexChunks.reduce((sum, chunk) => sum + chunk.length, 0));
  writeOffset = 0;
  indexChunks.forEach((chunk) => {
    indices.set(chunk, writeOffset);
    writeOffset += chunk.length;
  });
  return { indices, vertices };
}

/** Framework-neutral adapter that returns collision data for Rapier bindings. */
export const TRIMESH_DATA_COLLISION_ADAPTER = createCollisionAdapter(
  'toonlab/trimesh-data',
  {
    kinds: ['trimesh'],
    register({ subject }) {
      const trimesh = collectObjectTrimesh(subject);
      if (!trimesh) throw new TypeError('Collision subject has no usable visible triangles.');
      return { dispose() {}, registered: 1, trimesh };
    },
  },
);

export const LIGHTWEIGHT_WORLD_COLLISION_ADAPTER = createCollisionAdapter(
  'toonlab/lightweight-world-collision',
  {
    kinds: ['none', 'bounds', 'blockers'],
    register({ collision, metadata, subject }) {
      if (metadata.kind === 'none') return { blockers: [], registered: 0 };
      if (!collision || typeof collision.addCircles !== 'function') {
        throw new TypeError('The lightweight collision adapter needs addCircles().');
      }
      if (!subject?.isObject3D) {
        throw new TypeError('The lightweight collision adapter needs an Object3D subject.');
      }
      subject.updateWorldMatrix?.(true, true);
      let blockers;
      if (metadata.kind === 'bounds') {
        boundsBox.setFromObject(subject, true);
        if (boundsBox.isEmpty()) return { blockers: [], registered: 0 };
        boundsBox.getCenter(boundsCenter);
        boundsBox.getSize(boundsSize);
        blockers = [{
          radius: Math.hypot(boundsSize.x, boundsSize.z) * 0.5 + metadata.padding,
          x: boundsCenter.x,
          z: boundsCenter.z,
        }];
      } else {
        subject.getWorldScale(blockerScale);
        const radiusScale = Math.max(Math.abs(blockerScale.x), Math.abs(blockerScale.z));
        blockers = metadata.circles.map((circle) => {
          blockerPoint.set(circle.x, circle.y, circle.z);
          subject.localToWorld(blockerPoint);
          return {
            radius: circle.radius * radiusScale,
            x: blockerPoint.x,
            z: blockerPoint.z,
          };
        });
      }
      const registrations = collision.addCircles(blockers) ?? blockers;
      let disposed = false;
      return {
        blockers,
        dispose() {
          if (disposed) return false;
          disposed = true;
          return typeof collision.removeCircles === 'function'
            ? collision.removeCircles(registrations) > 0
            : false;
        },
        registered: blockers.length,
      };
    },
  },
);

/**
 * Create a fixed-collider adapter for an existing Rapier world. ToonLab does
 * not create or step the physics world; it translates labeled collision
 * metadata into fixed colliders and removes them on refresh or disposal.
 */
export function createRapierCollisionAdapter({
  id = 'toonlab/rapier-fixed-collision',
  rapier,
  world,
} = {}) {
  const RAPIER = rapier?.default ?? rapier;
  if (!RAPIER?.ColliderDesc) {
    throw new TypeError('createRapierCollisionAdapter needs the initialized Rapier module.');
  }
  if (typeof world?.createCollider !== 'function' || typeof world?.removeCollider !== 'function') {
    throw new TypeError('createRapierCollisionAdapter needs a Rapier World.');
  }
  return createCollisionAdapter(id, {
    kinds: ['bounds', 'blockers', 'convex', 'trimesh'],
    register({ metadata, subject }) {
      subject.updateWorldMatrix?.(true, true);
      const descriptions = [];
      if (metadata.kind === 'bounds') {
        boundsBox.setFromObject(subject, true);
        if (boundsBox.isEmpty()) return { colliders: [], dispose() {}, registered: 0 };
        boundsBox.getCenter(boundsCenter);
        boundsBox.getSize(boundsSize).multiplyScalar(0.5);
        descriptions.push(RAPIER.ColliderDesc.cuboid(
          Math.max(boundsSize.x + metadata.padding, 0.001),
          Math.max(boundsSize.y + metadata.padding, 0.001),
          Math.max(boundsSize.z + metadata.padding, 0.001),
        ).setTranslation(boundsCenter.x, boundsCenter.y, boundsCenter.z));
      } else if (metadata.kind === 'blockers') {
        subject.getWorldScale(blockerScale);
        const radiusScale = Math.max(Math.abs(blockerScale.x), Math.abs(blockerScale.z));
        for (const circle of metadata.circles) {
          blockerPoint.set(circle.x, circle.y, circle.z);
          subject.localToWorld(blockerPoint);
          descriptions.push(RAPIER.ColliderDesc.cylinder(
            10,
            Math.max(circle.radius * radiusScale, 0.001),
          ).setTranslation(blockerPoint.x, blockerPoint.y, blockerPoint.z));
        }
      } else {
        const trimesh = collectObjectTrimesh(subject);
        if (!trimesh) return { colliders: [], dispose() {}, registered: 0 };
        const description = metadata.kind === 'convex'
          ? RAPIER.ColliderDesc.convexHull(trimesh.vertices)
          : RAPIER.ColliderDesc.trimesh(trimesh.vertices, trimesh.indices);
        if (!description) return { colliders: [], dispose() {}, registered: 0 };
        descriptions.push(description);
      }
      const colliders = descriptions.map((description) => world.createCollider(description));
      let disposed = false;
      return {
        colliders,
        dispose() {
          if (disposed) return false;
          disposed = true;
          for (const collider of colliders) world.removeCollider(collider, true);
          return colliders.length > 0;
        },
        registered: colliders.length,
      };
    },
  });
}

export async function registerCollisionTarget({
  adapter = LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  collision,
  metadata: metadataInput,
  subject,
  targetId = null,
} = {}) {
  const validation = validateCollisionMetadata(metadataInput);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  const metadata = validation.value;
  if (!adapter?.kinds?.includes(metadata.kind)) {
    throw new TypeError(
      `Collision adapter "${adapter?.id ?? '(missing)'}" does not support "${metadata.kind}".`,
    );
  }
  const result = await adapter.register({ collision, metadata, subject, targetId });
  return { adapterId: adapter.id, kind: metadata.kind, targetId, ...result };
}
