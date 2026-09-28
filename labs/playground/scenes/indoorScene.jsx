import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

import { loadModelAsset } from '../../../src/character/modelLoader.js';
import { applyEnvironmentShader } from '../../../src/environment/environmentMaterialAdapter.js';
import {
  applyEnvironmentSettingsToMaterial,
  createEnvironmentSettings,
  ENVIRONMENT_SETTING_FIELD_SCHEMA,
  ENVIRONMENT_SETTING_GROUPS,
} from '../../../src/environment/environmentSettings.js';
import {
  applyEnvironmentLampEmissive,
  createEnvironmentLampRig,
} from '../../../src/environment/environmentRigs.js';
import {
  applyEnvironmentTimeOfDay,
  sampleEnvironmentTimeOfDay,
} from '../../../src/environment/environmentTimeOfDay.js';
import { setLabParams } from '../../shared/labParams.js';
import { colorToHex, createSettingsPanel } from '../../../src/debug/index.js';
import {
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../../../src/toon/toonMaterialAdapter.js';
import {
  INDOOR_BACKDROP_URL,
  INDOOR_ENVIRONMENT_SIZE,
  INDOOR_ENVIRONMENT_URL,
  INDOOR_ROOM_YAW,
} from '../params.js';

// ---------------------------------------------------------------------------
// Liyue indoor walkabout ("/playground/?scene=liyue")
//
// Loads the same FBX room + anime-style environment shader as the viewer's
// indoor room scene, then makes it walkable: every opaque environment mesh is baked
// into a fixed trimesh collider (floor to walk on, walls/furniture to bump
// into), and the standard ecctrl capsule + retargeted locomotion drop in
// exactly as in the water scenes.
// ---------------------------------------------------------------------------

// Scale the room's largest dimension to targetSize, center it on the origin,
// and rest its lowest point at y=0 — the same staging the viewer applies.
function fitEnvironmentRootToStage(root, targetSize) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const referenceSize = Math.max(size.x, size.y, size.z);
  if (referenceSize > 0) root.scale.multiplyScalar(targetSize / referenceSize);
  root.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(root);
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fittedBox.min.y;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

// Interior floors sit above the room's bounding-box bottom (plinths, terraces),
// so find the walkable height with a downward ray at the given spot.
function findIndoorFloorY(root, box, x, z) {
  const size = box.getSize(new THREE.Vector3());
  const origin = new THREE.Vector3(x, box.max.y - size.y * 0.05, z);
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, size.y * 1.5);
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry) meshes.push(obj);
  });
  const walkableCeiling = box.min.y + size.y * 0.36;
  const normalMatrix = new THREE.Matrix3();
  const worldNormal = new THREE.Vector3();
  let floorY = null;
  for (const hit of raycaster.intersectObjects(meshes, false)) {
    if (!hit.face || hit.point.y > walkableCeiling) continue;
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
    if (worldNormal.y < 0.35) continue;
    floorY = floorY === null ? hit.point.y : Math.max(floorY, hit.point.y);
  }
  return floorY ?? box.min.y;
}

// Bakes all opaque environment meshes into ONE sanitized world-space trimesh.
// Run BEFORE the environment shader converts materials, so adapter-generated
// overlay meshes (AO decals, shadow overlays) never become duplicate
// colliders. Sanitizing is load-bearing: FBX interiors routinely contain
// zero-area or non-finite triangles (collapsed nodes, mirrored zero-scale
// transforms), and rapier's BVH build panics the whole wasm module on them
// ("RuntimeError: unreachable", after which every physics call fails and the
// capsule gets launched by garbage contacts).
function collectEnvironmentTrimesh(root) {
  const vertexChunks = [];
  const triangleChunks = [];
  let vertexOffset = 0;
  let droppedTriangles = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    // Hidden authored LOD meshes are render alternatives, not additional
    // physical layers. Respect visibility through the full parent chain so a
    // catalog asset contributes exactly its active LOD to collision baking.
    for (let current = obj; current; current = current.parent) {
      if (current.visible === false) return;
      if (current === root) break;
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    // Fully transparent meshes (glass panes, effect cards) shouldn't block
    // the capsule; window frames and walls remain solid.
    if (materials.length > 0 && materials.every((mat) => mat?.transparent === true)) return;

    const position = obj.geometry.attributes.position;
    if (position.count < 3) return;
    const vertices = new Float32Array(position.count * 3);
    let finite = true;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z)) {
        finite = false;
        break;
      }
      vertices[i * 3] = vertex.x;
      vertices[i * 3 + 1] = vertex.y;
      vertices[i * 3 + 2] = vertex.z;
    }
    if (!finite) return;

    const sourceIndices = obj.geometry.index ? obj.geometry.index.array : null;
    const triangleCount = Math.floor((sourceIndices ? sourceIndices.length : position.count) / 3);
    const triangles = [];
    for (let t = 0; t < triangleCount; t++) {
      const i0 = sourceIndices ? sourceIndices[t * 3] : t * 3;
      const i1 = sourceIndices ? sourceIndices[t * 3 + 1] : t * 3 + 1;
      const i2 = sourceIndices ? sourceIndices[t * 3 + 2] : t * 3 + 2;
      if (i0 === i1 || i1 === i2 || i0 === i2) {
        droppedTriangles += 1;
        continue;
      }
      a.fromArray(vertices, i0 * 3);
      b.fromArray(vertices, i1 * 3);
      c.fromArray(vertices, i2 * 3);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      // Cross-product magnitude = 2x area; drop slivers below ~1 cm².
      if (ab.cross(ac).lengthSq() < 1e-8) {
        droppedTriangles += 1;
        continue;
      }
      triangles.push(i0 + vertexOffset, i1 + vertexOffset, i2 + vertexOffset);
    }
    if (triangles.length === 0) return;

    vertexChunks.push(vertices);
    triangleChunks.push(triangles);
    vertexOffset += position.count;
  });

  if (vertexChunks.length === 0) return null;
  const totalFloats = vertexChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mergedVertices = new Float32Array(totalFloats);
  let writeOffset = 0;
  for (const chunk of vertexChunks) {
    mergedVertices.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  const totalIndices = triangleChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mergedIndices = new Uint32Array(totalIndices);
  writeOffset = 0;
  for (const chunk of triangleChunks) {
    mergedIndices.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  document.body.dataset.environmentColliderTriangles = String(totalIndices / 3);
  document.body.dataset.environmentColliderDropped = String(droppedTriangles);
  return { indices: mergedIndices, vertices: mergedVertices };
}

// The walkabout's ambient floor: the viewer's interior brightness leans on
// its sun/ceiling rigs; this scene uses simpler R3F lights, so lift the
// adapter's ambient default to land in the same readable range.
const INDOOR_DEFAULT_PARAMETERS = Object.freeze({ ambientStrength: 0.52 });

// Environment Settings HUD: the same schema-generated panel the Shader Lab
// uses (toonlab/debug + the environment field schema), applied live to the
// adapter-converted materials. Returns an unmount function.
function mountEnvironmentSettingsPanel(environmentRoot) {
  const container = document.getElementById('environmentSettingGroups');
  if (!container || container.childElementCount > 0) return () => {};

  let draft = createEnvironmentSettings({ parameters: { ...INDOOR_DEFAULT_PARAMETERS } });

  const updateStatus = () => {
    const output = document.getElementById('environmentSettingsStatus');
    const overrides = Object.values(draft.parameters)
      .filter((value) => value !== null && value !== undefined).length +
      Object.entries(draft.features)
        .filter(([key, value]) => value !== createEnvironmentSettings().features[key]).length;
    const label = overrides === 0
      ? 'Auto material defaults'
      : `${overrides} shader override${overrides === 1 ? '' : 's'}`;
    if (output) {
      output.value = label;
      output.textContent = label;
    }
    document.body.dataset.environmentSettingsOverrideCount = String(overrides);
  };

  const applyDraft = () => {
    updateStatus();
    environmentRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        if (mat?.userData?.environmentMaterial) {
          applyEnvironmentSettingsToMaterial(mat, draft);
        } else if (mat?.userData?.environmentAoOverlay) {
          mat.visible = draft.features.aoOverlay;
        } else if (mat?.userData?.environmentShadow) {
          mat.visible = draft.features.shadowMesh;
        }
      }
    });
  };

  createSettingsPanel({
    container,
    dataAttribute: 'environmentField',
    fieldSchema: ENVIRONMENT_SETTING_FIELD_SCHEMA,
    formatValue: (value, field) => {
      const isAuto = field.group === 'parameters' &&
        (draft.parameters[field.key] === null || draft.parameters[field.key] === undefined);
      if (isAuto) return 'Auto';
      if (field.type === 'boolean') return value ? 'On' : 'Off';
      if (field.type === 'color') return colorToHex(value);
      const number = Number(value);
      return Number.isFinite(number)
        ? number.toFixed(field.range?.step < 0.01 ? 3 : 2)
        : String(value ?? '');
    },
    getValue: (field) => {
      if (field.group === 'features') return Boolean(draft.features[field.key]);
      const overrideValue = draft.parameters[field.key];
      if (overrideValue !== null && overrideValue !== undefined) return overrideValue;
      if (field.type === 'color') return [1, 1, 1];
      if (field.type === 'number') return field.defaultValue ?? field.range?.min ?? 0;
      return field.defaultValue;
    },
    groupClassName: 'toon-setting-group environment-setting-group',
    groups: ENVIRONMENT_SETTING_GROUPS,
    idPrefix: 'environmentSetting',
    isGroupOpen: (group) => group.id === 'features',
    onChange: (field, value) => {
      draft = createEnvironmentSettings({
        ...draft,
        [field.group]: {
          ...(draft[field.group] ?? {}),
          [field.key]: value,
        },
      });
      applyDraft();
    },
    rowClassName: 'hud-control environment-field-control',
  });

  container.hidden = false;
  updateStatus();
  return () => {
    container.hidden = true;
    container.innerHTML = '';
  };
}

// Demo Settings tab: ceiling lamp rig, time of day, and room orientation —
// the same controls (same ids) as the Shader Lab's demo tab, wired to the
// walkabout's runtime. Returns an unmount function.
function mountIndoorDemoControls({ scene, root, box }) {
  const toggle = document.getElementById('ceilingLightToggle');
  const strengthInput = document.getElementById('ceilingLightStrength');
  const strengthOutput = document.getElementById('ceilingLightStrengthValue');
  const timeInput = document.getElementById('timeOfDay');
  const timeOutput = document.getElementById('timeOfDayValue');
  const yawInput = document.getElementById('roomYaw');
  const yawOutput = document.getElementById('roomYawValue');

  const lampRig = createEnvironmentLampRig({
    scene,
    environmentBox: box,
    root,
    detectPattern: /^Indoor_Ly_Light_Common_07_Lod0/,
  });

  let ceilingEnabled = false;
  let ceilingStrength = Number(strengthInput?.value) || 1;
  lampRig?.setEnabled(false);

  const syncToggle = () => {
    if (!toggle) return;
    toggle.disabled = !lampRig;
    toggle.textContent = ceilingEnabled ? 'Ceiling Light On' : 'Ceiling Light Off';
    toggle.setAttribute('aria-pressed', ceilingEnabled ? 'true' : 'false');
    document.body.dataset.environmentCeilingLight = lampRig
      ? (ceilingEnabled ? 'on' : 'off')
      : 'none';
  };
  const onToggle = () => {
    ceilingEnabled = !ceilingEnabled;
    lampRig?.setEnabled(ceilingEnabled);
    if (ceilingEnabled) {
      lampRig?.setIntensity(ceilingStrength);
      applyEnvironmentLampEmissive(root, ceilingStrength);
    } else {
      applyEnvironmentLampEmissive(root, 0.15);
    }
    syncToggle();
  };
  toggle?.addEventListener('click', onToggle);
  syncToggle();

  const onStrength = () => {
    ceilingStrength = Number(strengthInput.value) || 1;
    if (strengthOutput) strengthOutput.textContent = `${ceilingStrength.toFixed(2)}x`;
    if (ceilingEnabled) {
      lampRig?.setIntensity(ceilingStrength);
      applyEnvironmentLampEmissive(root, ceilingStrength);
    }
  };
  if (strengthInput) {
    strengthInput.disabled = !lampRig;
    strengthInput.addEventListener('input', onStrength);
  }

  const onTime = () => {
    const hour = Number(timeInput.value) || 0;
    const minutes = Math.round((hour % 1) * 60);
    const label = `${String(Math.floor(hour)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (timeOutput) timeOutput.textContent = label;
    document.body.dataset.environmentTimeOfDay = label;
    applyEnvironmentTimeOfDay(sampleEnvironmentTimeOfDay(hour), {
      environmentRoot: root,
      lampRig: ceilingEnabled ? lampRig : null,
    });
  };
  if (timeInput) {
    timeInput.disabled = false;
    timeInput.addEventListener('input', onTime);
  }

  // Room yaw rotates the room BEFORE the collider bake, so the slider commits
  // on release and reloads with ?roomYaw=.
  if (yawInput) {
    yawInput.disabled = false;
    yawInput.value = String(INDOOR_ROOM_YAW);
    if (yawOutput) yawOutput.textContent = `${Math.round(INDOOR_ROOM_YAW)} deg`;
    yawInput.addEventListener('input', () => {
      if (yawOutput) yawOutput.textContent = `${Math.round(Number(yawInput.value))} deg`;
    });
    yawInput.addEventListener('change', () => {
      const yaw = Math.round(Number(yawInput.value)) % 360;
      setLabParams({ roomYaw: yaw === 0 ? null : String(yaw) });
    });
  }
  document.body.dataset.environmentRoomYaw = String(Math.round(INDOOR_ROOM_YAW));

  return () => {
    toggle?.removeEventListener('click', onToggle);
    strengthInput?.removeEventListener('input', onStrength);
    timeInput?.removeEventListener('input', onTime);
    lampRig?.dispose();
  };
}

function useIndoorEnvironment() {
  const { gl, scene } = useThree();
  const [environment, setEnvironment] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let unmountSettingsPanel = () => {};
    let unmountDemoControls = () => {};
    (async () => {
      try {
        const asset = await loadModelAsset(INDOOR_ENVIRONMENT_URL, { renderer: gl });
        await waitForObjectTextures(asset.root);
        setObjectTextureColorSpaces(asset.root);
        asset.root.rotation.y = THREE.MathUtils.degToRad(INDOOR_ROOM_YAW);
        const box = fitEnvironmentRootToStage(asset.root, INDOOR_ENVIRONMENT_SIZE);
        const trimesh = collectEnvironmentTrimesh(asset.root);
        const floorY = findIndoorFloorY(asset.root, box, 0, 0);

        const shaderReport = await applyEnvironmentShader(asset.root, {
          environmentBox: box,
          hasSun: true,
          openWindows: true,
          shaderMode: 'anime',
          parameters: { ...INDOOR_DEFAULT_PARAMETERS },
        });

        if (cancelled) return;
        unmountSettingsPanel = mountEnvironmentSettingsPanel(asset.root);
        unmountDemoControls = mountIndoorDemoControls({ scene, root: asset.root, box });
        document.body.dataset.environmentReady = 'true';
        document.body.dataset.environmentWindowCutouts = String(shaderReport?.windowCutoutMaterialCount ?? 0);
        document.body.dataset.environmentMeshCount = String(shaderReport?.convertedMeshCount ?? 0);
        document.body.dataset.environmentUrl = INDOOR_ENVIRONMENT_URL;
        document.body.dataset.environmentFloorY = floorY.toFixed(3);
        setEnvironment({ box, floorY, root: asset.root, trimesh });
      } catch (error) {
        console.error('Indoor environment failed to load:', error);
        document.body.dataset.environmentReady = 'error';
      }
    })();
    return () => {
      cancelled = true;
      unmountSettingsPanel();
      unmountDemoControls();
    };
  }, [gl, scene]);

  return environment;
}

// Painterly mountain backdrop seen through the windows — a large textured
// plane past the window wall, mirroring the viewer's backdrop staging.
function IndoorBackdrop({ box }) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!INDOOR_BACKDROP_URL) {
      document.body.dataset.environmentBackdropReady = 'none';
      return undefined;
    }
    let cancelled = false;
    document.body.dataset.environmentBackdropReady = 'loading';
    new THREE.TextureLoader().load(
      INDOOR_BACKDROP_URL,
      (loaded) => {
        if (cancelled) return;
        loaded.colorSpace = THREE.SRGBColorSpace;
        setTexture(loaded);
        document.body.dataset.environmentBackdropReady = 'true';
      },
      undefined,
      (error) => {
        document.body.dataset.environmentBackdropReady = 'error';
        console.warn('Indoor backdrop failed to load:', error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!texture || !box) return null;
  // The viewer's exact backdrop staging: distance, cover-fit dimensions at
  // the photo's own aspect ratio (no stretching), and the 0.57-height anchor
  // that lines the mountain band up with the window openings.
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const imageAspect = texture.image?.width && texture.image?.height
    ? texture.image.width / texture.image.height
    : 16 / 9;
  const distance = Math.max(size.z * 2.1, size.y * 2.8);
  const scale = Math.max(3.2, 1.0 + (distance / Math.max(size.z, 0.001)) * 1.35);
  const minimumWidth = Math.max(size.x * 1.08, size.x * scale, distance * 1.55);
  const minimumHeight = size.y * Math.max(1.15, scale * 0.38);
  let width = minimumWidth;
  let height = width / imageAspect;
  if (height < minimumHeight) {
    height = minimumHeight;
    width = height * imageAspect;
  }
  // The viewer only ever frames the -z window wall, so one plane suffices
  // there. A walkable interior sees windows on every wall — ring the room
  // with four planes so no opening looks into the void.
  const backdropY = box.min.y + size.y * 0.57;
  const sides = [
    { position: [center.x, backdropY, box.min.z - distance], rotationY: 0 },
    { position: [center.x, backdropY, box.max.z + distance], rotationY: Math.PI },
    { position: [box.min.x - distance, backdropY, center.z], rotationY: Math.PI / 2 },
    { position: [box.max.x + distance, backdropY, center.z], rotationY: -Math.PI / 2 },
  ];
  return (
    <group>
      {sides.map((side, index) => (
        <mesh
          key={index}
          position={side.position}
          rotation={[0, side.rotationY, 0]}
          renderOrder={-10}
          frustumCulled={false}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// Debug hook: exposes the R3F scene/camera so headless checks can raycast
// through windows and inspect staging (harmless in production).
function IndoorSceneDebugProbe() {
  const { camera, scene } = useThree();
  useEffect(() => {
    window.__INDOOR_SCENE = scene;
    window.__INDOOR_CAMERA = camera;
    window.__THREE = THREE;
    return () => {
      delete window.__INDOOR_SCENE;
      delete window.__INDOOR_CAMERA;
    };
  }, [camera, scene]);
  return null;
}

export {
  fitEnvironmentRootToStage,
  findIndoorFloorY,
  collectEnvironmentTrimesh,
  useIndoorEnvironment,
  IndoorBackdrop,
  IndoorSceneDebugProbe,
};
