import * as THREE from 'three';

export const GROUND_PRINT_SHAPES = Object.freeze([
  Object.freeze({ id: 'boot-left', label: 'Left Boot' }),
  Object.freeze({ id: 'boot-right', label: 'Right Boot' }),
  Object.freeze({ id: 'bare-foot', label: 'Bare Foot' }),
  Object.freeze({ id: 'paw', label: 'Paw' }),
  Object.freeze({ id: 'hoof', label: 'Hoof' }),
  Object.freeze({ id: 'tire', label: 'Tire' }),
  Object.freeze({ id: 'drag', label: 'Drag' }),
  Object.freeze({ id: 'impact', label: 'Impact' }),
  Object.freeze({ id: 'ellipse', label: 'Generic Ellipse' }),
]);

const GROUND_PRINT_SHAPE_IDS = new Set(GROUND_PRINT_SHAPES.map(({ id }) => id));

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0, edge1, value) {
  const delta = edge1 - edge0;
  const range = Math.abs(delta) < Number.EPSILON
    ? (delta < 0 ? -Number.EPSILON : Number.EPSILON)
    : delta;
  const t = clamp01((value - edge0) / range);
  return t * t * (3 - 2 * t);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback, minimum = 0.0001) {
  return Math.max(finite(value, fallback), minimum);
}

function normalizeResolution(value) {
  const width = Math.round(positive(
    typeof value === 'object' ? value?.width : value,
    512,
    8,
  ));
  const height = Math.round(positive(
    typeof value === 'object' ? value?.height : value,
    width,
    8,
  ));
  return {
    height: Math.min(height, 4096),
    width: Math.min(width, 4096),
  };
}

function normalizeBounds(input) {
  const bounds = input?.isBox3
    ? {
      maxX: input.max.x,
      maxZ: input.max.z,
      minX: input.min.x,
      minZ: input.min.z,
    }
    : {
      maxX: input?.maxX ?? input?.max?.x,
      maxZ: input?.maxZ ?? input?.max?.z,
      minX: input?.minX ?? input?.min?.x,
      minZ: input?.minZ ?? input?.min?.z,
    };
  const minX = finite(bounds.minX, -16);
  const maxX = finite(bounds.maxX, 16);
  const minZ = finite(bounds.minZ, -16);
  const maxZ = finite(bounds.maxZ, 16);
  if (maxX <= minX || maxZ <= minZ) {
    throw new RangeError('Ground Print Layer bounds need positive X and Z extents.');
  }
  return Object.freeze({ maxX, maxZ, minX, minZ });
}

function normalizePosition(position) {
  if (Array.isArray(position)) {
    return { x: finite(position[0], 0), z: finite(position[2] ?? position[1], 0) };
  }
  return { x: finite(position?.x, 0), z: finite(position?.z, 0) };
}

function normalizeSize(size) {
  if (Array.isArray(size)) {
    return {
      length: positive(size[1], 0.28),
      width: positive(size[0], 0.12),
    };
  }
  return {
    length: positive(size?.length ?? size?.y, 0.28),
    width: positive(size?.width ?? size?.x, 0.12),
  };
}

function resolveYaw({ direction, forward, rotation, yaw }) {
  const explicit = finite(yaw ?? rotation, NaN);
  if (Number.isFinite(explicit)) return explicit;
  const vector = forward ?? direction;
  const x = finite(Array.isArray(vector) ? vector[0] : vector?.x, 0);
  const z = finite(Array.isArray(vector) ? vector[2] ?? vector[1] : vector?.z, 1);
  return Math.atan2(x, z);
}

function ellipseCoverage(x, y, radiusX = 1, radiusY = 1, softness = 0.08) {
  const distance = Math.hypot(x / radiusX, y / radiusY);
  return smoothstep(1 + softness, 1 - softness, distance);
}

function boxCoverage(x, y, radiusX = 1, radiusY = 1, softness = 0.08) {
  const distance = Math.max(Math.abs(x) / radiusX, Math.abs(y) / radiusY);
  return smoothstep(1 + softness, 1 - softness, distance);
}

function rawShapeCoverage(shape, x, y, softness) {
  if (shape === 'boot-left' || shape === 'boot-right') {
    const side = shape === 'boot-left' ? -1 : 1;
    const toeShift = side * smoothstep(-0.1, 1, y) * 0.12;
    const toe = ellipseCoverage(x - toeShift, y - 0.42, 0.84, 0.6, softness);
    const waist = boxCoverage(x + side * 0.035, y + 0.05, 0.58, 0.48, softness);
    const heel = ellipseCoverage(x + side * 0.04, y + 0.65, 0.62, 0.35, softness);
    let coverage = Math.max(toe, waist, heel);
    const treadGap = Math.abs(Math.sin((y + 1.08) * Math.PI * 4.2));
    if (treadGap < 0.18) coverage *= 0.58;
    return coverage;
  }
  if (shape === 'bare-foot') {
    const heel = ellipseCoverage(x, y + 0.64, 0.53, 0.34, softness);
    const arch = ellipseCoverage(x + 0.08, y + 0.12, 0.42, 0.46, softness);
    const ball = ellipseCoverage(x, y - 0.32, 0.74, 0.43, softness);
    let toes = 0;
    for (let index = 0; index < 5; index += 1) {
      const offset = (index - 2) * 0.28;
      const toeY = -0.82 + Math.abs(index - 2) * 0.045;
      toes = Math.max(toes, ellipseCoverage(x - offset, y - toeY, 0.15, 0.13, softness));
    }
    return Math.max(heel, arch, ball, toes);
  }
  if (shape === 'paw') {
    const pad = ellipseCoverage(x, y + 0.2, 0.62, 0.52, softness);
    let toes = 0;
    const toeCenters = [[-0.62, -0.4], [-0.22, -0.58], [0.22, -0.58], [0.62, -0.4]];
    toeCenters.forEach(([toeX, toeY]) => {
      toes = Math.max(toes, ellipseCoverage(x - toeX, y - toeY, 0.24, 0.3, softness));
    });
    return Math.max(pad, toes);
  }
  if (shape === 'hoof') {
    const shell = ellipseCoverage(x, y, 0.88, 0.94, softness);
    const hollow = ellipseCoverage(x, y + 0.06, 0.48, 0.58, softness);
    const split = 1 - smoothstep(0.02, 0.13, Math.abs(x));
    return clamp01(shell * (1 - hollow * 0.72) * (1 - split * 0.72));
  }
  if (shape === 'tire') {
    let coverage = boxCoverage(x, y, 0.94, 1, softness);
    const centerGap = 1 - smoothstep(0.07, 0.15, Math.abs(x));
    const treadGap = 1 - smoothstep(0.04, 0.12, Math.abs(Math.sin((y + x * 0.3) * Math.PI * 5)));
    coverage *= 1 - Math.max(centerGap * 0.62, treadGap * 0.52);
    return coverage;
  }
  if (shape === 'drag') {
    const body = boxCoverage(x, y, 0.58, 0.88, softness);
    const capA = ellipseCoverage(x, y - 0.82, 0.58, 0.3, softness);
    const capB = ellipseCoverage(x, y + 0.82, 0.58, 0.3, softness);
    return Math.max(body, capA, capB);
  }
  if (shape === 'impact') {
    const angle = Math.atan2(y, x);
    const radius = Math.hypot(x, y);
    const irregularEdge = 0.78 + Math.sin(angle * 7 + 0.8) * 0.08 + Math.sin(angle * 11) * 0.05;
    const crater = smoothstep(irregularEdge + softness, irregularEdge - softness, radius);
    const center = 1 - smoothstep(0.08, 0.3, radius);
    return clamp01(crater * (0.72 + center * 0.28));
  }
  return ellipseCoverage(x, y, 0.92, 0.98, softness);
}

function shapeCoverage(shape, x, y, softness, scale = 1) {
  return rawShapeCoverage(shape, x / scale, y / scale, softness);
}

function configureTexture(texture) {
  texture.name = 'ToonLab Ground Print Layer';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A bounded, UV-aligned interaction field for footprints, tracks, drags, and
 * impacts. It owns stamp history; Ground Shader settings only own how a
 * printable surface responds to that history.
 */
export class GroundPrintLayer {
  constructor({
    bounds,
    recoverySeconds = 0,
    resolution = 512,
  } = {}) {
    this.bounds = normalizeBounds(bounds);
    const { height, width } = normalizeResolution(resolution);
    this.height = height;
    this.width = width;
    this.data = new Uint8Array(width * height * 4);
    this.texture = configureTexture(new THREE.DataTexture(
      this.data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    ));
    this.isGroundPrintLayer = true;
    this.recoverySeconds = Math.max(finite(recoverySeconds, 0), 0);
    this.revision = 0;
    this.stampCount = 0;
    this._activeOffsets = new Set();
    this._hasActivePrints = false;
  }

  clear() {
    this.data.fill(0);
    this.texture.needsUpdate = true;
    this.revision += 1;
    this.stampCount = 0;
    this._activeOffsets.clear();
    this._hasActivePrints = false;
    return this;
  }

  dispose() {
    this.texture.dispose();
  }

  sample(position) {
    const { x, z } = normalizePosition(position);
    const u = clamp01((x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX));
    const v = clamp01((this.bounds.maxZ - z) / (this.bounds.maxZ - this.bounds.minZ));
    const column = Math.min(Math.round(u * (this.width - 1)), this.width - 1);
    const row = Math.min(Math.round(v * (this.height - 1)), this.height - 1);
    const offset = (row * this.width + column) * 4;
    return {
      compaction: this.data[offset + 2] / 255,
      depression: this.data[offset] / 255,
      rim: this.data[offset + 1] / 255,
    };
  }

  setRecovery(recoverySeconds = 0) {
    this.recoverySeconds = Math.max(finite(recoverySeconds, 0), 0);
    return this;
  }

  stamp({
    direction,
    forward,
    position,
    pressure = 1,
    rim = 0.16,
    rotation,
    shape = 'ellipse',
    size,
    softness = 0.07,
    yaw,
  } = {}) {
    const id = GROUND_PRINT_SHAPE_IDS.has(shape) ? shape : 'ellipse';
    const center = normalizePosition(position);
    const dimensions = normalizeSize(size);
    const angle = resolveYaw({ direction, forward, rotation, yaw });
    const intensity = clamp01(finite(pressure, 1));
    const rimWidth = clamp01(finite(rim, 0.16));
    const edgeSoftness = Math.max(finite(softness, 0.07), 0.001);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = Math.hypot(dimensions.width, dimensions.length) * (0.58 + rimWidth);
    const worldWidth = this.bounds.maxX - this.bounds.minX;
    const worldDepth = this.bounds.maxZ - this.bounds.minZ;
    const minColumn = Math.max(0, Math.floor(
      ((center.x - radius - this.bounds.minX) / worldWidth) * this.width,
    ));
    const maxColumn = Math.min(this.width - 1, Math.ceil(
      ((center.x + radius - this.bounds.minX) / worldWidth) * this.width,
    ));
    const minRow = Math.max(0, Math.floor(
      ((this.bounds.maxZ - (center.z + radius)) / worldDepth) * this.height,
    ));
    const maxRow = Math.min(this.height - 1, Math.ceil(
      ((this.bounds.maxZ - (center.z - radius)) / worldDepth) * this.height,
    ));

    let touched = 0;
    for (let row = minRow; row <= maxRow; row += 1) {
      const worldZ = this.bounds.maxZ - ((row + 0.5) / this.height) * worldDepth;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const worldX = this.bounds.minX + ((column + 0.5) / this.width) * worldWidth;
        const dx = worldX - center.x;
        const dz = worldZ - center.z;
        const localX = dx * cos - dz * sin;
        const localY = dx * sin + dz * cos;
        const normalizedX = localX / (dimensions.width * 0.5);
        const normalizedY = localY / (dimensions.length * 0.5);
        const depression = shapeCoverage(id, normalizedX, normalizedY, edgeSoftness);
        const outer = shapeCoverage(
          id,
          normalizedX,
          normalizedY,
          edgeSoftness,
          1 + rimWidth,
        );
        const raisedRim = clamp01(outer - depression);
        if (depression <= 0 && raisedRim <= 0) continue;
        const offset = (row * this.width + column) * 4;
        this.data[offset] = Math.max(this.data[offset], Math.round(depression * intensity * 255));
        this.data[offset + 1] = Math.max(this.data[offset + 1], Math.round(raisedRim * intensity * 255));
        this.data[offset + 2] = Math.max(this.data[offset + 2], Math.round(
          Math.max(depression, raisedRim * 0.35) * intensity * 255,
        ));
        this.data[offset + 3] = 255;
        this._activeOffsets.add(offset);
        touched += 1;
      }
    }

    if (touched > 0) {
      this.texture.needsUpdate = true;
      this.revision += 1;
      this.stampCount += 1;
      this._hasActivePrints = true;
    }
    return {
      position: center,
      revision: this.revision,
      shape: id,
      stampCount: this.stampCount,
      touchedPixels: touched,
    };
  }

  update(deltaSeconds = 0) {
    const delta = Math.max(finite(deltaSeconds, 0), 0);
    if (!this._hasActivePrints || this.recoverySeconds <= 0 || delta <= 0) return false;
    const multiplier = Math.exp(-delta / this.recoverySeconds);
    let active = false;
    for (const offset of this._activeOffsets) {
      let pixelActive = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const next = this.data[offset + channel] * multiplier;
        this.data[offset + channel] = next < 1 ? 0 : Math.round(next);
        pixelActive ||= this.data[offset + channel] > 0;
      }
      active ||= pixelActive;
      if (!pixelActive) {
        this.data[offset + 3] = 0;
        this._activeOffsets.delete(offset);
      }
    }
    this._hasActivePrints = active;
    this.texture.needsUpdate = true;
    this.revision += 1;
    return true;
  }
}

export function createGroundPrintLayer(options = {}) {
  return new GroundPrintLayer(options);
}
