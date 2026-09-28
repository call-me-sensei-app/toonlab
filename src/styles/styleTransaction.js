const MATERIAL_STATE_KEYS = Object.freeze([
  'alphaTest',
  'blending',
  'depthTest',
  'depthWrite',
  'metalness',
  'opacity',
  'roughness',
  'side',
  'toneMapped',
  'transparent',
  'vertexColors',
  'visible',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneRuntimeValue(value) {
  if (Array.isArray(value)) return value.map(cloneRuntimeValue);
  if (ArrayBuffer.isView(value)) return value.slice?.() ?? value;
  if (value?.isTexture || value?.isMaterial || value?.isObject3D) return value;
  if (typeof value?.clone === 'function') return value.clone();
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneRuntimeValue(entry)]),
    );
  }
  return value;
}

function restoreRuntimeValue(current, snapshot) {
  // Runtime resources are identity-bearing owners, not value objects. Copying
  // a captured Texture into the currently bound render-target Texture mutates
  // the live attachment in place and can leave WebGPU command buffers sampling
  // a destroyed/recreated allocation. Transaction restore means restoring the
  // exact pre-ToonLab resource reference.
  if (snapshot?.isTexture || snapshot?.isMaterial || snapshot?.isObject3D) {
    return snapshot;
  }
  if (current && snapshot && typeof current.copy === 'function'
    && current.constructor === snapshot.constructor) {
    current.copy(snapshot);
    return current;
  }
  return cloneRuntimeValue(snapshot);
}

function captureUniforms(material) {
  return Object.fromEntries(Object.entries(material?.uniforms ?? {}).map(([key, uniform]) => [
    key,
    cloneRuntimeValue(uniform?.value),
  ]));
}

function restoreUniforms(material, values) {
  for (const [key, snapshot] of Object.entries(values)) {
    const uniform = material?.uniforms?.[key];
    if (!uniform) continue;
    uniform.value = restoreRuntimeValue(uniform.value, snapshot);
  }
}

function captureMaterial(material) {
  const properties = {};
  for (const key of MATERIAL_STATE_KEYS) properties[key] = cloneRuntimeValue(material?.[key]);
  return {
    color: cloneRuntimeValue(material?.color),
    emissive: cloneRuntimeValue(material?.emissive),
    groundSettings: cloneRuntimeValue(material?.userData?.toonlabGroundShader?.settings),
    material,
    properties,
    uniforms: captureUniforms(material),
  };
}

function restoreMaterial(snapshot) {
  const { material } = snapshot;
  if (!material) return;
  for (const [key, value] of Object.entries(snapshot.properties)) {
    material[key] = cloneRuntimeValue(value);
  }
  if (material.color && snapshot.color) material.color.copy(snapshot.color);
  if (material.emissive && snapshot.emissive) material.emissive.copy(snapshot.emissive);
  const groundAdapter = material.userData?.toonlabGroundShader;
  if (snapshot.groundSettings && typeof groundAdapter?.applySettings === 'function') {
    groundAdapter.applySettings(snapshot.groundSettings);
  }
  restoreUniforms(material, snapshot.uniforms);
  material.needsUpdate = true;
}

function captureObject3D(root) {
  const materialSnapshots = new Map();
  const nodes = [];
  root.traverse((node) => {
    const materials = node?.material
      ? (Array.isArray(node.material) ? node.material : [node.material])
      : [];
    for (const material of materials) {
      if (material && !materialSnapshots.has(material)) {
        materialSnapshots.set(material, captureMaterial(material));
      }
    }
    nodes.push({
      attributes: node.geometry ? { ...node.geometry.attributes } : null,
      castShadow: node.castShadow,
      frustumCulled: node.frustumCulled,
      groups: node.geometry?.groups?.map((group) => ({ ...group })) ?? null,
      index: node.geometry?.index ?? null,
      material: node.material,
      node,
      onBeforeRender: node.onBeforeRender,
      receiveShadow: node.receiveShadow,
      renderOrder: node.renderOrder,
      userData: { ...(node.userData ?? {}) },
    });
  });
  const originalNodes = new Set(nodes.map(({ node }) => node));
  return {
    restore() {
      // Toon conversion may add outline/fur children after the snapshot. They
      // are owned by the style transaction and must not survive an inspector
      // "off" or accumulate across repeated off→on cycles.
      const generatedNodes = [];
      root.traverse((node) => {
        if (originalNodes.has(node)) return;
        if (node.userData?.isToonOutline || node.userData?.isToonFurShell) {
          generatedNodes.push(node);
        }
      });
      for (const node of generatedNodes.reverse()) node.parent?.remove(node);
      const originalMaterials = new Set(materialSnapshots.keys());
      const generatedMaterials = new Set();
      root.traverse((node) => {
        const materials = node?.material
          ? (Array.isArray(node.material) ? node.material : [node.material])
          : [];
        for (const material of materials) {
          if (material?.userData?.toonlabManagedMaterial && !originalMaterials.has(material)) {
            generatedMaterials.add(material);
          }
        }
      });
      for (const material of generatedMaterials) material.dispose?.();
      for (const snapshot of materialSnapshots.values()) restoreMaterial(snapshot);
      for (const entry of nodes) {
        const { node } = entry;
        node.material = entry.material;
        node.castShadow = entry.castShadow;
        node.frustumCulled = entry.frustumCulled;
        node.onBeforeRender = entry.onBeforeRender;
        node.receiveShadow = entry.receiveShadow;
        node.renderOrder = entry.renderOrder;
        for (const key of Object.keys(node.userData ?? {})) delete node.userData[key];
        Object.assign(node.userData, entry.userData);
        if (node.geometry && entry.attributes) {
          for (const key of Object.keys(node.geometry.attributes)) {
            if (!Object.hasOwn(entry.attributes, key)) node.geometry.deleteAttribute(key);
          }
          for (const [key, attribute] of Object.entries(entry.attributes)) {
            node.geometry.setAttribute(key, attribute);
          }
          node.geometry.setIndex(entry.index);
          if (entry.groups) {
            node.geometry.clearGroups();
            entry.groups.forEach(({ count, materialIndex, start }) => {
              node.geometry.addGroup(start, count, materialIndex);
            });
          }
        }
      }
    },
  };
}

function capturePlainSubject(subject) {
  const values = Object.fromEntries(
    Object.entries(subject).map(([key, value]) => [key, cloneRuntimeValue(value)]),
  );
  return {
    restore() {
      for (const key of Object.keys(subject)) delete subject[key];
      for (const [key, value] of Object.entries(values)) {
        subject[key] = cloneRuntimeValue(value);
      }
    },
  };
}

function captureSemanticSubject(subject, domain) {
  if (['cloud', 'sky'].includes(domain)
    && typeof subject?.toParams === 'function'
    && typeof subject?.applyPreset === 'function') {
    const params = cloneRuntimeValue(subject.toParams());
    return { restore: () => subject.applyPreset(params) };
  }
  if (domain === 'lighting' && subject?.style && typeof subject?.setStyle === 'function') {
    const style = cloneRuntimeValue(subject.style);
    return { restore: () => subject.setStyle(style) };
  }
  if (domain === 'post' && subject?.settings && typeof subject?.setSettings === 'function') {
    const settings = cloneRuntimeValue(subject.settings);
    return { restore: () => subject.setSettings(settings) };
  }
  if (subject?.settings && typeof subject?.applySettings === 'function') {
    const settings = cloneRuntimeValue(subject.settings);
    return { restore: () => subject.applySettings(settings) };
  }
  return null;
}

/**
 * Captures one runtime target before mutation. Custom adapters may implement
 * `capture(subject, context)` and `restore(subject, snapshot, context)`;
 * package Object3D and system targets use the built-in snapshot paths.
 */
export async function captureStyleTargetSnapshot(entry) {
  const target = entry?.target ?? {};
  const adapter = target.adapter ?? {};
  const capture = target.capture ?? adapter.capture;
  const restore = target.restore ?? adapter.restore;
  const afterRestore = target.afterRestore ?? adapter.afterRestore;
  const context = {
    domain: entry.domain,
    slot: entry.slot,
    target,
    targetId: entry.targetId,
  };
  if (capture || restore) {
    if (typeof capture !== 'function' || typeof restore !== 'function') {
      throw new TypeError(`Style target "${entry.targetId}" must provide both capture() and restore().`);
    }
    const value = await capture.call(adapter, entry.subject, context);
    return {
      restore: () => restore.call(adapter, entry.subject, value, context),
      targetId: entry.targetId,
    };
  }

  const snapshots = [];
  const semantic = captureSemanticSubject(entry.subject, entry.domain);
  if (semantic) snapshots.push(semantic);
  if (entry.subject?.isObject3D && typeof entry.subject.traverse === 'function') {
    snapshots.push(captureObject3D(entry.subject));
  }
  if (snapshots.length === 0 && isPlainObject(entry.subject)) {
    snapshots.push(capturePlainSubject(entry.subject));
  }
  if (snapshots.length === 0) {
    throw new TypeError(
      `Style target "${entry.targetId}" cannot be snapshotted; provide adapter capture() and restore().`,
    );
  }
  return {
    async restore() {
      for (const snapshot of [...snapshots].reverse()) await snapshot.restore();
      await afterRestore?.call(adapter, entry.subject, context);
    },
    targetId: entry.targetId,
  };
}

export async function restoreStyleTargetSnapshot(snapshot) {
  if (typeof snapshot?.restore !== 'function') {
    throw new TypeError('Expected a ToonLab runtime style-target snapshot.');
  }
  return snapshot.restore();
}
