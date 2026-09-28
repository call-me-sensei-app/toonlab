const surfaceMaterialModes = new WeakMap();

export const SURFACE_MATERIAL_MODE = Object.freeze({
  authored: 'authored',
  neutralLit: 'neutral-lit',
  rawTexture: 'raw-texture',
});

function serializableModeDescriptor(mode, descriptor) {
  return {
    family: descriptor.family ?? null,
    keepsLighting: descriptor.keepsLighting !== false,
    keepsTextures: descriptor.keepsTextures !== false,
    mode,
    vertexDeformation: descriptor.vertexDeformation === true,
  };
}

/**
 * Registers an inert presentation mode without attaching comparison-only TSL
 * nodes to the compiled authored material.
 */
export function registerSurfaceMaterialMode(material, mode, descriptor = {}) {
  if (!material?.isMaterial) {
    throw new TypeError('registerSurfaceMaterialMode requires a material.');
  }
  if (!mode) throw new TypeError('registerSurfaceMaterialMode requires a mode.');
  let modes = surfaceMaterialModes.get(material);
  if (!modes) {
    modes = new Map();
    surfaceMaterialModes.set(material, modes);
  }
  modes.set(mode, { ...descriptor });
  material.userData ??= {};
  material.userData.surfaceMaterialModes ??= {};
  material.userData.surfaceMaterialModes[mode] =
    serializableModeDescriptor(mode, descriptor);
  if (descriptor.family) {
    material.userData.surfaceMaterialFamily = descriptor.family;
  }
  return material;
}

export function resolveSurfaceMaterialMode(material, mode) {
  return surfaceMaterialModes.get(material)?.get(mode) ?? null;
}

export function copySurfaceMaterialModes(source, target) {
  const sourceModes = surfaceMaterialModes.get(source);
  if (!sourceModes || !target?.isMaterial) return target;
  surfaceMaterialModes.set(
    target,
    new Map([...sourceModes].map(([mode, descriptor]) => [
      mode,
      { ...descriptor },
    ])),
  );
  return target;
}

export function resolveSurfaceMaterialFamily(material) {
  return material?.userData?.surfaceMaterialFamily
    ?? material?.userData?.toonLabSource?.family
    ?? (material?.userData?.toonlabRockSourceMaterial ? 'rock' : null)
    ?? (material?.userData?.toonLabRockProfile ? 'rock' : null)
    ?? 'unclassified';
}

export function listSurfaceMaterialModes(material) {
  return [...(surfaceMaterialModes.get(material)?.keys() ?? [])];
}
