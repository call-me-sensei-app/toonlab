// Landscape Lab pointer tools — ToonLab Landscape/Foliage interaction model over
// the rock-lab pointer plumbing:
//
//   Sculpt mode — raise (Shift lowers), smooth, flatten (target sampled at
//     stroke start), noise, terrace, and the two-click ramp gesture
//     (click A, click B, Esc cancels).
//   Paint mode — splat weight painting toward the selected target layer;
//     Shift erases the layer (weight redistributes).
//   Foliage mode — scatter-paints every ACTIVE palette entry inside the
//     brush; Shift-drag erases active entries by radius.
//
// The store owns mode/tool/brush settings; this module owns pointer state,
// the ring cursor, live dirty-rect geometry updates during a stroke, and the
// stroke→command commits into the hybrid history. While a brush is armed the
// left mouse button paints and the right button still orbits (ToonLab-style);
// the Orbit tool returns the left button to the camera.

import * as THREE from 'three';

import {
  applyBrushSample,
  applyHoleSample,
  applyRamp,
  applySplatSample,
  applyWaterSample,
  beginHoleStroke,
  beginSplatStroke,
  beginStroke,
  beginWaterStroke,
  commitHoleStroke,
  commitSplatStroke,
  commitStroke,
  commitWaterStroke,
  mergeDirtyRects,
  planFoliagePaint,
  buildTunnelPath,
  createTunnel,
  planTunnelBore,
  tunnelProfilePreset,
} from '../../../src/landscape/index.js';

const STROKE_SCREEN_STEP = 4;
const CURSOR_COLOR = 0x8fc6ff;
const CURSOR_INVERT_COLOR = 0xf07a6a;
const RAMP_COLOR = 0xf0c05a;

const SCULPT_TOOLS = new Set(['raise', 'smooth', 'flatten', 'noise', 'terrace']);

export function installLandscapeTools({ engine, store }) {
  const element = engine.renderer.domElement;
  const field = () => store.getDocument().field;

  // --- brush cursor: outline DRAPED over the terrain -------------------------
  // Every brush acts in map view (the vertical column under its footprint).
  // The outline samples heightAt around the footprint, so on flat ground it
  // reads as the usual ring/square, and on a cliff face it stretches down
  // the wall — showing exactly the column a stroke will affect instead of a
  // meaningless flat sliver.

  const CURSOR_SEGMENTS = 64;
  const cursor = new THREE.Group();
  cursor.name = 'LandscapeBrushCursor';
  cursor.visible = false;
  const ringMaterial = new THREE.LineBasicMaterial({
    color: CURSOR_COLOR, depthTest: false, transparent: true, opacity: 0.95,
  });
  // A closed Line (first point repeated) — WebGPURenderer rejects LineLoop.
  const outlinePositions = new Float32Array((CURSOR_SEGMENTS + 1) * 3);
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));
  const ring = new THREE.Line(outlineGeometry, ringMaterial);
  ring.name = 'BrushOutline';
  ring.frustumCulled = false;
  ring.renderOrder = 999;
  const discMaterial = new THREE.MeshBasicMaterial({
    color: CURSOR_COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), discMaterial);
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 998;
  const squareFill = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), discMaterial);
  squareFill.rotation.x = -Math.PI / 2;
  squareFill.renderOrder = 998;
  cursor.add(ring, disc, squareFill);
  engine.scene.add(cursor);

  // Unit footprint perimeter (per shape), scaled by radius at update time.
  function footprintPoint(shape, t, out) {
    if (shape === 'square') {
      // t in [0,1) walks the square perimeter edge by edge.
      const leg = (t * 4) % 4;
      const along = leg % 1;
      if (leg < 1) out.set(-1 + 2 * along, 0, -1);
      else if (leg < 2) out.set(1, 0, -1 + 2 * along);
      else if (leg < 3) out.set(1 - 2 * along, 0, 1);
      else out.set(-1, 0, 1 - 2 * along);
    } else {
      const angle = t * Math.PI * 2;
      out.set(Math.cos(angle), 0, Math.sin(angle));
    }
    return out;
  }

  const footprintScratch = new THREE.Vector3();
  function drapeOutline(hit, radius, shape) {
    const currentField = field();
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < CURSOR_SEGMENTS; i += 1) {
      footprintPoint(shape, i / CURSOR_SEGMENTS, footprintScratch);
      const px = hit.point.x + footprintScratch.x * radius;
      const pz = hit.point.z + footprintScratch.z * radius;
      const py = currentField.heightAt(px, pz) + 0.08;
      outlinePositions[i * 3] = px;
      outlinePositions[i * 3 + 1] = py;
      outlinePositions[i * 3 + 2] = pz;
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    // Close the loop.
    outlinePositions[CURSOR_SEGMENTS * 3] = outlinePositions[0];
    outlinePositions[CURSOR_SEGMENTS * 3 + 1] = outlinePositions[1];
    outlinePositions[CURSOR_SEGMENTS * 3 + 2] = outlinePositions[2];
    outlineGeometry.attributes.position.needsUpdate = true;
    // The translucent fill only makes sense while the footprint is roughly
    // flat; on relief it would cut through the ground and lie about the
    // affected area, so the draped outline takes over alone.
    return maxY - minY < Math.max(radius * 0.5, 0.6);
  }

  const rampPreview = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: RAMP_COLOR, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  rampPreview.renderOrder = 999;
  rampPreview.visible = false;
  engine.scene.add(rampPreview);

  let stroke = null; // { kind, data, lastScreen, params }
  let rampAnchor = null; // { x, y, z }
  let tunnelAnchor = null; // { x, y, z } — first click of the Tunnel gesture
  let lastPointer = null;
  let shiftHeld = false;

  const settings = () => store.getState().settings;
  const activeTool = () => store.getState().tool;
  const activeMode = () => store.getState().mode;
  const brushArmed = () => activeTool() !== 'orbit';

  function syncCamera() {
    const armed = brushArmed();
    // The camera-bar mode decides what an unarmed left-drag does; while a
    // brush is armed the left button paints and the right button rotates.
    const mode = store.getState().cameraMode;
    const leftNav = mode === 'pan' ? THREE.MOUSE.PAN
      : mode === 'zoom' ? THREE.MOUSE.DOLLY
        : THREE.MOUSE.ROTATE;
    engine.controls.mouseButtons = {
      LEFT: armed ? -1 : leftNav,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: armed ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    element.style.cursor = armed ? 'crosshair' : '';
    if (!armed) {
      cursor.visible = false;
      cancelRamp();
    }
    if (activeTool() !== 'ramp') cancelRamp();
    if (activeTool() !== 'tunnel') cancelTunnel();
  }
  store.subscribe(syncCamera);
  syncCamera();

  function updateCursor(event) {
    if (!brushArmed()) {
      cursor.visible = false;
      return;
    }
    const tool = activeTool();
    // The Single tool sticks to any surface (terrain or placed meshes).
    const hit = tool === 'placeFoliage' ? engine.raycastPlacement(event) : engine.raycastTerrain(event);
    cursor.visible = Boolean(hit);
    if (!hit) return;
    const radius = Math.max(tool === 'ramp' ? settings().rampWidth
      : tool === 'placeFoliage' ? 0.7
        : settings().brushRadius, 0.1);
    // Ramp and single-place always use the round footprint; brushes follow
    // the Brush Shape setting.
    const shape = settings().brushShape === 'square'
      && tool !== 'ramp' && tool !== 'placeFoliage' && tool !== 'tunnel'
      ? 'square'
      : 'round';
    // Outline drapes in world space; the fill stays flat at the hit point
    // and only shows while the footprint is roughly level.
    const flatEnough = drapeOutline(hit, radius, shape);
    disc.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
    disc.scale.setScalar(radius);
    squareFill.position.copy(disc.position);
    squareFill.scale.setScalar(radius);
    disc.visible = flatEnough && shape === 'round';
    squareFill.visible = flatEnough && shape === 'square';
    const inverted = shiftHeld
      && (tool === 'raise' || tool === 'hole' || tool === 'dry'
        || activeMode() === 'paint' || activeMode() === 'foliage');
    ringMaterial.color.setHex(inverted ? CURSOR_INVERT_COLOR : CURSOR_COLOR);
    discMaterial.color.setHex(inverted ? CURSOR_INVERT_COLOR : CURSOR_COLOR);
    const gestureAnchor = rampAnchor ?? tunnelAnchor;
    if (gestureAnchor) {
      rampPreview.geometry.dispose();
      rampPreview.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(gestureAnchor.x, gestureAnchor.y + 0.1, gestureAnchor.z),
        new THREE.Vector3(hit.point.x, hit.point.y + 0.1, hit.point.z),
      ]);
    }
  }

  function cancelRamp() {
    rampAnchor = null;
    if (!tunnelAnchor) rampPreview.visible = false;
  }

  function cancelTunnel() {
    tunnelAnchor = null;
    if (!rampAnchor) rampPreview.visible = false;
  }

  // --- the Tunnel gesture: two clicks, then the planner modal ---------------
  // Click the entrance, click the exit (or end point) — the planner modal
  // opens with both portals pinned so the cross-section and route can be
  // doodled. The actual bore goes through boreTunnel() below.

  function applyTunnelGesture(hit) {
    if (!tunnelAnchor) {
      tunnelAnchor = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      rampPreview.visible = true;
      store.actions.setStatus('Tunnel: click the end point — the far side for a through-tunnel, or anywhere past the hill face for a cave (Esc cancels).');
      return;
    }
    const a = tunnelAnchor;
    const b = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    cancelTunnel();
    if (Math.hypot(b.x - a.x, b.z - a.z) < 2) {
      store.actions.setStatus('Tunnel points are too close together — click further apart.');
      return;
    }
    store.actions.openTunnelPlanner({ a, b });
  }

  // --- sculpt strokes --------------------------------------------------------

  function sculptParams(event) {
    const current = settings();
    const tool = activeTool();
    const invert = tool === 'raise' && (event.shiftKey || shiftHeld);
    return {
      tool,
      radius: current.brushRadius,
      strength: (invert ? -1 : 1) * current.brushStrength
        * (tool === 'raise' ? 0.35 : 1), // raise applies per sample; keep it controllable
      hardness: current.brushHardness,
      shape: current.brushShape,
      noiseScale: current.noiseScale,
      noiseAmplitude: current.noiseAmplitude,
      terraceStep: current.terraceStep,
      seed: 1,
    };
  }

  function applySculptSample(hit, event) {
    const params = sculptParams(event);
    if (params.tool === 'flatten') params.flattenTarget = stroke.flattenTarget;
    const rect = applyBrushSample(field(), stroke.data, {
      ...params,
      x: hit.point.x,
      z: hit.point.z,
    });
    if (rect) engine.updateTerrainRect(rect);
  }

  function beginSculptStroke(event, hit) {
    stroke = {
      kind: 'terrain',
      data: beginStroke(field()),
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
      flattenTarget: hit.point.y,
    };
    applySculptSample(hit, event);
  }

  // --- hole strokes (cave/tunnel openings) -----------------------------------

  function applyHoleStrokeSample(hit, event) {
    const restore = event.shiftKey || shiftHeld;
    const rect = applyHoleSample(field(), stroke.data, {
      x: hit.point.x,
      z: hit.point.z,
      radius: settings().brushRadius,
      restore,
      shape: settings().brushShape,
    });
    if (rect) engine.rebuildHoleIndices(rect);
    // Dry-cave holes also paint the dry mask in the same stroke (one undo).
    if (stroke.waterData) {
      const waterRect = applyWaterSample(field(), stroke.waterData, {
        x: hit.point.x,
        z: hit.point.z,
        radius: settings().brushRadius,
        restore,
        shape: settings().brushShape,
      });
      if (waterRect) engine.refreshWaterMask();
    }
  }

  function beginHoleStrokeLocal(event, hit) {
    stroke = {
      kind: 'holes',
      data: beginHoleStroke(field()),
      waterData: store.getState().holeDry ? beginWaterStroke(field()) : null,
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
    };
    applyHoleStrokeSample(hit, event);
  }

  // --- dry-zone strokes (suppress the stage water) ---------------------------

  function applyDryStrokeSample(hit, event) {
    const rect = applyWaterSample(field(), stroke.data, {
      x: hit.point.x,
      z: hit.point.z,
      radius: settings().brushRadius,
      restore: event.shiftKey || shiftHeld,
      shape: settings().brushShape,
    });
    if (rect) engine.refreshWaterMask();
  }

  function beginDryStrokeLocal(event, hit) {
    stroke = {
      kind: 'water',
      data: beginWaterStroke(field()),
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
    };
    applyDryStrokeSample(hit, event);
  }

  // --- single surface placement (stalactites & friends) ----------------------

  async function placeSingle(event) {
    const state = store.getState();
    const entry = state.palette.find((candidate) => candidate.id === state.selectedPaletteId)
      ?? state.palette[0];
    if (!entry) {
      store.actions.setStatus('Palette is empty — add an asset first.');
      return;
    }
    const layer = await engine.foliage.ensureLayer(entry.id);
    if (!layer) return;
    const hit = engine.raycastPlacement(event);
    if (!hit) {
      store.actions.setStatus('Aim at the terrain or a placed mesh to place.');
      return;
    }
    if (event.shiftKey || shiftHeld) {
      const nearby = layer.queryCircle(hit.point.x, hit.point.z, Math.max(1, settings().brushRadius * 0.4));
      if (!nearby.length) return;
      nearby.sort((a, b) => (
        Math.hypot(a.x - hit.point.x, a.z - hit.point.z) - Math.hypot(b.x - hit.point.x, b.z - hit.point.z)
      ));
      const removed = layer.removeInstances([nearby[0].id]).map((record) => ({ ...record }));
      store.actions.commitFoliageStroke(
        { layers: [{ paletteId: entry.id, added: [], removed }] },
        { status: `Removed one ${entry.label}.` },
      );
      return;
    }
    // Explicit placement ignores the paint rules (ToonLab single-place): full
    // surface alignment, so a downward normal hangs the asset from a
    // prop-built cave ceiling.
    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
    const tiltQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const scaleRange = entry.rules?.scaleRange ?? [0.85, 1.25];
    const record = {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
      yaw: entry.rules?.yawRandom !== false ? Math.random() * Math.PI * 2 : 0,
      scale: scaleRange[0] + (scaleRange[1] - scaleRange[0]) * Math.random(),
      tilt: [tiltQuaternion.x, tiltQuaternion.y, tiltQuaternion.z, tiltQuaternion.w],
    };
    const added = layer.addInstances([record]).map((instance) => ({ ...instance }));
    store.actions.commitFoliageStroke(
      { layers: [{ paletteId: entry.id, added, removed: [] }] },
      { status: `Placed ${entry.label} on the ${hit.kind === 'mesh' ? 'mesh surface' : 'terrain'}.` },
    );
  }

  // --- splat strokes ---------------------------------------------------------

  function applySplatStrokeSample(hit, event) {
    const current = settings();
    const erase = event.shiftKey || shiftHeld;
    const rect = applySplatSample(field(), stroke.data, {
      layer: store.getState().paintLayer,
      x: hit.point.x,
      z: hit.point.z,
      radius: current.brushRadius,
      strength: (erase ? -1 : 1) * current.brushStrength,
      hardness: current.brushHardness,
      shape: current.brushShape,
    });
    if (rect) engine.refreshSplat();
  }

  function beginSplatStrokeLocal(event, hit) {
    stroke = {
      kind: 'splat',
      data: beginSplatStroke(field()),
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
    };
    applySplatStrokeSample(hit, event);
  }

  // --- foliage strokes -------------------------------------------------------

  function activePaletteEntries() {
    return store.getState().palette.filter((entry) => entry.active !== false);
  }

  async function beginFoliageStroke(event, hit) {
    const entries = activePaletteEntries();
    if (!entries.length) {
      store.actions.setStatus('No active palette entries — check at least one asset to paint.');
      return;
    }
    // Resolve every active layer up front so the stroke itself stays sync.
    const layers = new Map();
    for (const entry of entries) {
      const layer = await engine.foliage.ensureLayer(entry.id);
      if (layer) layers.set(entry.id, { entry, layer });
    }
    if (!layers.size) return;
    stroke = {
      kind: 'foliage',
      layers,
      addedBy: new Map(),
      removedBy: new Map(),
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
      lastWorld: null,
      sampleSeed: Math.floor(Math.random() * 0xffff) + 1,
    };
    applyFoliageSample(hit, event);
  }

  function applyFoliageSample(hit, event) {
    const current = settings();
    const radius = current.brushRadius;
    // Foliage samples space out by half the brush so a drag doesn't replan
    // the same disc dozens of times.
    if (stroke.lastWorld) {
      const dx = hit.point.x - stroke.lastWorld.x;
      const dz = hit.point.z - stroke.lastWorld.z;
      if (dx * dx + dz * dz < (radius * 0.5) ** 2) return;
    }
    stroke.lastWorld = { x: hit.point.x, z: hit.point.z };
    const erase = event.shiftKey || shiftHeld;
    for (const { entry, layer } of stroke.layers.values()) {
      if (erase) {
        const found = layer.queryCircle(hit.point.x, hit.point.z, radius);
        if (!found.length) continue;
        const removed = layer.removeInstances(found.map((record) => record.id));
        const bucket = stroke.removedBy.get(entry.id) ?? [];
        // A record added earlier in this same stroke and now erased cancels
        // out instead of appearing in both command halves.
        const addedBucket = stroke.addedBy.get(entry.id);
        for (const record of removed) {
          const addedIndex = addedBucket?.findIndex((candidate) => candidate.id === record.id) ?? -1;
          if (addedIndex >= 0) addedBucket.splice(addedIndex, 1);
          else bucket.push({ ...record });
        }
        stroke.removedBy.set(entry.id, bucket);
      } else {
        stroke.sampleSeed += 1;
        const planned = planFoliagePaint({
          field: field(),
          layer,
          x: hit.point.x,
          z: hit.point.z,
          radius,
          density: entry.density,
          densityMultiplier: current.foliageDensity,
          waterLevel: current.showWater ? current.waterLevel : null,
          groundwaterLevel: current.showWater && current.groundwaterOffset > 0
            ? current.waterLevel - current.groundwaterOffset
            : null,
          seed: stroke.sampleSeed,
          shape: current.brushShape,
        });
        if (!planned.length) continue;
        const added = layer.addInstances(planned);
        const bucket = stroke.addedBy.get(entry.id) ?? [];
        for (const record of added) bucket.push({ ...record });
        stroke.addedBy.set(entry.id, bucket);
      }
    }
  }

  // --- stroke lifecycle ------------------------------------------------------

  function moveStroke(event, { force = false } = {}) {
    if (!stroke) return;
    const screen = new THREE.Vector2(event.clientX, event.clientY);
    if (!force && screen.distanceTo(stroke.lastScreen) < STROKE_SCREEN_STEP) return;
    const hit = engine.raycastTerrain(event);
    if (!hit) return;
    stroke.lastScreen.copy(screen);
    if (stroke.kind === 'terrain') applySculptSample(hit, event);
    else if (stroke.kind === 'holes') applyHoleStrokeSample(hit, event);
    else if (stroke.kind === 'water') applyDryStrokeSample(hit, event);
    else if (stroke.kind === 'splat') applySplatStrokeSample(hit, event);
    else if (stroke.kind === 'foliage') applyFoliageSample(hit, event);
  }

  function endStroke() {
    if (!stroke) return;
    const finished = stroke;
    stroke = null;
    if (finished.kind === 'terrain') {
      const command = commitStroke(field(), finished.data);
      store.actions.commitTerrainStroke(command, {
        status: command ? `Sculpted ${command.indices.length} samples.` : null,
      });
    } else if (finished.kind === 'holes') {
      const command = commitHoleStroke(field(), finished.data);
      const waterCommand = finished.waterData ? commitWaterStroke(field(), finished.waterData) : null;
      store.actions.commitHoleStroke(command, {
        waterCommand,
        status: command
          ? `${command.after[0] === 0 ? 'Punched' : 'Restored'} ${command.indices.length} quads${waterCommand ? ' (dry)' : ''}.`
          : null,
      });
    } else if (finished.kind === 'water') {
      const command = commitWaterStroke(field(), finished.data);
      store.actions.commitWaterStroke(command, {
        status: command
          ? `${command.after[0] === 0 ? 'Dried' : 'Re-wet'} ${command.indices.length} quads.`
          : null,
      });
    } else if (finished.kind === 'splat') {
      const command = commitSplatStroke(field(), finished.data);
      store.actions.commitSplatStroke(command, {
        status: command ? `Painted ${command.indices.length} texels.` : null,
      });
    } else if (finished.kind === 'foliage') {
      const layers = [];
      const paletteIds = new Set([...finished.addedBy.keys(), ...finished.removedBy.keys()]);
      for (const paletteId of paletteIds) {
        const added = finished.addedBy.get(paletteId) ?? [];
        const removed = finished.removedBy.get(paletteId) ?? [];
        if (added.length || removed.length) layers.push({ paletteId, added, removed });
      }
      if (layers.length) {
        const addedTotal = layers.reduce((sum, layer) => sum + layer.added.length, 0);
        const removedTotal = layers.reduce((sum, layer) => sum + layer.removed.length, 0);
        store.actions.commitFoliageStroke({ layers }, {
          status: removedTotal && !addedTotal
            ? `Erased ${removedTotal} instances.`
            : `Painted ${addedTotal} instances.`,
        });
      }
    }
  }

  function applyRampGesture(hit) {
    if (!rampAnchor) {
      rampAnchor = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      rampPreview.visible = true;
      store.actions.setStatus('Ramp: click the end point (Esc cancels).');
      return;
    }
    const current = settings();
    const data = beginStroke(field());
    const rect = applyRamp(field(), data, {
      fromX: rampAnchor.x,
      fromZ: rampAnchor.z,
      fromH: rampAnchor.y,
      toX: hit.point.x,
      toZ: hit.point.z,
      toH: hit.point.y,
      width: current.rampWidth,
      hardness: current.brushHardness,
      strength: 1,
    });
    if (rect) engine.updateTerrainRect(rect);
    const command = commitStroke(field(), data);
    store.actions.commitTerrainStroke(command, { status: command ? 'Ramp applied.' : 'Ramp changed nothing.' });
    cancelRamp();
  }

  // --- pointer + keyboard wiring --------------------------------------------

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !brushArmed()) return;
    const tool = activeTool();
    if (tool === 'placeFoliage') {
      // Single placement targets ANY surface — no terrain-hit gate.
      placeSingle(event);
      return;
    }
    const hit = engine.raycastTerrain(event);
    if (!hit) return;
    element.setPointerCapture(event.pointerId);
    if (tool === 'ramp') {
      applyRampGesture(hit);
    } else if (tool === 'tunnel') {
      applyTunnelGesture(hit);
    } else if (SCULPT_TOOLS.has(tool)) {
      beginSculptStroke(event, hit);
    } else if (tool === 'hole') {
      beginHoleStrokeLocal(event, hit);
    } else if (tool === 'dry') {
      beginDryStrokeLocal(event, hit);
    } else if (tool === 'paintSplat') {
      beginSplatStrokeLocal(event, hit);
    } else if (tool === 'paintFoliage') {
      beginFoliageStroke(event, hit);
    }
  });
  element.addEventListener('pointermove', (event) => {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    updateCursor(event);
    if (stroke) moveStroke(event);
  });
  element.addEventListener('pointerup', (event) => {
    if (stroke) moveStroke(event, { force: true });
    endStroke();
  });
  element.addEventListener('pointerleave', () => {
    lastPointer = null;
    cursor.visible = false;
    endStroke();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
      shiftHeld = true;
      if (lastPointer) updateCursor(lastPointer);
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      shiftHeld = false;
      if (lastPointer) updateCursor(lastPointer);
    }
  });

  return {
    cancelRamp() {
      cancelRamp();
      store.actions.setStatus('Ramp cancelled.');
    },
    cancelTunnel() {
      cancelTunnel();
      store.actions.setStatus('Tunnel cancelled.');
    },
    hasRampAnchor: () => Boolean(rampAnchor),
    hasTunnelAnchor: () => Boolean(tunnelAnchor),
  };
}

/**
 * Executes a planned tunnel: punches the portal quads (dry), registers the
 * swept tunnel record, and commits everything as ONE history entry. Called
 * by the planner modal and the scripted probe entry.
 */
export function boreTunnel({ engine, store, profile, path, endOpen = true }) {
  const field = store.getDocument().field;
  const tunnel = createTunnel({ profile, path, endOpen });
  const plan = planTunnelBore(field, tunnel);
  const holeQuads = [];
  const waterQuads = [];
  for (const quad of plan.holeQuads) {
    if (field.holes[quad] === 1) {
      holeQuads.push(quad);
      field.holes[quad] = 0;
    }
    if (field.water[quad] === 1) {
      waterQuads.push(quad);
      field.water[quad] = 0;
    }
  }
  const rect = (quads) => {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const quad of quads) {
      minX = Math.min(minX, quad % field.splatW);
      maxX = Math.max(maxX, quad % field.splatW);
      minZ = Math.min(minZ, Math.floor(quad / field.splatW));
      maxZ = Math.max(maxZ, Math.floor(quad / field.splatW));
    }
    return { minX, minZ, maxX, maxZ };
  };
  const holeCommand = holeQuads.length ? {
    kind: 'holes',
    indices: Uint32Array.from(holeQuads),
    before: new Uint8Array(holeQuads.length).fill(1),
    after: new Uint8Array(holeQuads.length),
    dirtyRect: rect(holeQuads),
  } : null;
  const waterCommand = waterQuads.length ? {
    kind: 'water',
    indices: Uint32Array.from(waterQuads),
    before: new Uint8Array(waterQuads.length).fill(1),
    after: new Uint8Array(waterQuads.length),
    dirtyRect: rect(waterQuads),
  } : null;
  if (holeCommand) engine.rebuildHoleIndices(holeCommand.dirtyRect);
  if (waterCommand) engine.refreshWaterMask();
  store.actions.commitTunnel({ holeCommand, waterCommand, tunnels: [tunnel] });
  return { bored: holeQuads.length, tunnelId: tunnel.id };
}

/** Automation: straight arch bore from a to b (same pipeline as the modal). */
export function runScriptedTunnel({ engine, store, a, b, width = null, height = null, stopAt = 1, route = null }) {
  const current = store.getState().settings;
  const terrain = store.getDocument().field;
  a = { ...a, y: Number.isFinite(a.y) ? a.y : terrain.heightAt(a.x, a.z) };
  b = { ...b, y: Number.isFinite(b.y) ? b.y : terrain.heightAt(b.x, b.z) };
  const profile = tunnelProfilePreset(
    'arch',
    width ?? Math.max(3, current.brushRadius * 2),
    height ?? current.tunnelHeight,
  );
  const built = buildTunnelPath({ a, b, route, stopAt });
  if (!built) return { bored: 0, tunnelId: null };
  return boreTunnel({ engine, store, profile, path: built.path, endOpen: built.endOpen });
}

/** Automation: punches (or restores) holes along scripted points. */
export function runScriptedHoleStroke({ engine, store, worldPoints, restore = false, dry = false }) {
  const field = store.getDocument().field;
  const current = store.getState().settings;
  const data = beginHoleStroke(field);
  const waterData = dry ? beginWaterStroke(field) : null;
  let rect = null;
  for (const point of worldPoints) {
    rect = mergeDirtyRects(rect, applyHoleSample(field, data, {
      x: point.x,
      z: point.z,
      radius: current.brushRadius,
      restore,
      shape: current.brushShape,
    }));
    if (waterData) {
      applyWaterSample(field, waterData, {
        x: point.x,
        z: point.z,
        radius: current.brushRadius,
        restore,
        shape: current.brushShape,
      });
    }
  }
  if (rect) engine.rebuildHoleIndices(rect);
  if (waterData) engine.refreshWaterMask();
  const command = commitHoleStroke(field, data);
  const waterCommand = waterData ? commitWaterStroke(field, waterData) : null;
  store.actions.commitHoleStroke(command, { waterCommand, status: 'Scripted hole stroke applied.' });
  return { changed: command?.indices.length ?? 0 };
}

/** Automation: paints (or Shift-restores) dry zones along scripted points. */
export function runScriptedDryStroke({ engine, store, worldPoints, restore = false }) {
  const field = store.getDocument().field;
  const current = store.getState().settings;
  const data = beginWaterStroke(field);
  for (const point of worldPoints) {
    applyWaterSample(field, data, {
      x: point.x,
      z: point.z,
      radius: current.brushRadius,
      restore,
      shape: current.brushShape,
    });
  }
  engine.refreshWaterMask();
  const command = commitWaterStroke(field, data);
  store.actions.commitWaterStroke(command, { status: 'Scripted dry stroke applied.' });
  return { changed: command?.indices.length ?? 0 };
}

/** Automation: paints a scripted splat stroke toward `layer`. */
export function runScriptedSplatStroke({ engine, store, worldPoints, layer = 0, strength = null }) {
  const field = store.getDocument().field;
  const current = store.getState().settings;
  const data = beginSplatStroke(field);
  for (const point of worldPoints) {
    applySplatSample(field, data, {
      layer,
      x: point.x,
      z: point.z,
      radius: current.brushRadius,
      strength: strength ?? current.brushStrength,
      hardness: current.brushHardness,
      shape: current.brushShape,
    });
  }
  engine.refreshSplat();
  const command = commitSplatStroke(field, data);
  store.actions.commitSplatStroke(command, { status: 'Scripted splat stroke applied.' });
  return { changed: command?.indices.length ?? 0 };
}

/** Automation: paints (or erases) active palette entries at each point. */
export async function runScriptedFoliageStroke({ engine, store, worldPoints, erase = false }) {
  const field = store.getDocument().field;
  const current = store.getState().settings;
  const entries = store.getState().palette.filter((entry) => entry.active !== false);
  const layers = [];
  for (const entry of entries) {
    const layer = await engine.foliage.ensureLayer(entry.id);
    if (layer) layers.push({ entry, layer, added: [], removed: [] });
  }
  let seed = 1;
  for (const point of worldPoints) {
    for (const bucket of layers) {
      if (erase) {
        const found = bucket.layer.queryCircle(point.x, point.z, current.brushRadius);
        const removed = bucket.layer.removeInstances(found.map((record) => record.id));
        bucket.removed.push(...removed.map((record) => ({ ...record })));
      } else {
        seed += 1;
        const planned = planFoliagePaint({
          field,
          layer: bucket.layer,
          x: point.x,
          z: point.z,
          radius: current.brushRadius,
          density: bucket.entry.density,
          densityMultiplier: current.foliageDensity,
          waterLevel: current.showWater ? current.waterLevel : null,
          groundwaterLevel: current.showWater && current.groundwaterOffset > 0
            ? current.waterLevel - current.groundwaterOffset
            : null,
          seed,
          shape: current.brushShape,
        });
        const added = bucket.layer.addInstances(planned);
        bucket.added.push(...added.map((record) => ({ ...record })));
      }
    }
  }
  const commandLayers = layers
    .filter((bucket) => bucket.added.length || bucket.removed.length)
    .map((bucket) => ({ paletteId: bucket.entry.id, added: bucket.added, removed: bucket.removed }));
  if (commandLayers.length) {
    store.actions.commitFoliageStroke({ layers: commandLayers }, { status: 'Scripted foliage stroke applied.' });
  }
  return {
    added: commandLayers.reduce((sum, layer) => sum + layer.added.length, 0),
    removed: commandLayers.reduce((sum, layer) => sum + layer.removed.length, 0),
  };
}

/**
 * Automation entry: applies a scripted stroke through the same brush/commit
 * path as pointer input. `worldPoints` = [{x, z}]; sculpt tools only.
 */
export function runScriptedStroke({ engine, store, worldPoints, tool = 'raise', invert = false }) {
  const field = store.getDocument().field;
  const current = store.getState().settings;
  const data = beginStroke(field);
  let flattenTarget = null;
  let rect = null;
  for (const point of worldPoints) {
    if (tool === 'flatten' && flattenTarget === null) flattenTarget = field.heightAt(point.x, point.z);
    const sampleRect = applyBrushSample(field, data, {
      tool,
      x: point.x,
      z: point.z,
      radius: current.brushRadius,
      strength: (invert ? -1 : 1) * current.brushStrength * (tool === 'raise' ? 0.35 : 1),
      hardness: current.brushHardness,
      shape: current.brushShape,
      noiseScale: current.noiseScale,
      noiseAmplitude: current.noiseAmplitude,
      terraceStep: current.terraceStep,
      flattenTarget,
      seed: 1,
    });
    rect = mergeDirtyRects(rect, sampleRect);
  }
  if (rect) engine.updateTerrainRect(rect);
  const command = commitStroke(field, data);
  store.actions.commitTerrainStroke(command, { status: 'Scripted stroke applied.' });
  return { changed: command?.indices.length ?? 0 };
}
