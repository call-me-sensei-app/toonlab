// Landscape Lab store — document state + the HYBRID undo history. Settings
// and palette edits are JSON snapshots (the water-lab pattern); terrain,
// splat, and foliage strokes are compact invertible commands. Both kinds
// interleave chronologically in ONE stack. The bulk typed arrays live in a
// mutable document object owned here but OUTSIDE React state — the store
// hands the engine `getDocument()` plus `lastChange { changeKind, dirtyRect }`
// so the engine refreshes only what a change touched.
//
// Invariants that keep the hybrid history correct:
//   - snapshots contain ONLY { name, settings, palette } — never arrays, so a
//     settings-undo can never clobber terrain state;
//   - one history entry per stroke (pointerup) — strokes NEVER go through the
//     500 ms slider coalescing;
//   - a byte budget (~48 MB) evicts the oldest entries so long sessions
//     cannot exhaust memory.

import { createStore } from '../../shared/ui/index.js';
import {
  applyCommand,
  applyHoleCommand,
  applySplatCommand,
  applyWaterCommand,
  createDefaultMaterialLayers,
  createLandscapeField,
  createLandscapeSettings,
  generateTerrainRegion,
  BUILTIN_FOLIAGE_ENTRIES,
  parseLandscapeProjectDocument,
  resizeLandscapeField,
  revertCommand,
  revertHoleCommand,
  revertSplatCommand,
  revertWaterCommand,
  sanitizeMaterialLayers,
  seedFieldFromArchetype,
  serializeLandscapeProject,
  deserializeTunnel,
  serializeTunnel,
} from '../../../src/landscape/index.js';
import {
  clearLandscapeProject,
  saveLandscapeProject,
} from '../landscapeProjectStore.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const HISTORY_BYTE_BUDGET = 48 * 1024 * 1024;
const AUTOSAVE_DEBOUNCE_MS = 2000;

function clonePalette(palette) {
  return palette.map((entry) => ({
    ...entry,
    source: { ...entry.source },
    rules: { ...entry.rules, scaleRange: [...(entry.rules.scaleRange ?? [0.85, 1.25])] },
  }));
}

function freshField() {
  return createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 128, spacing: 0.5 });
}

function commandBytes(entry) {
  if (entry.kind === 'terrain' || entry.kind === 'splat' || entry.kind === 'holes' || entry.kind === 'water') {
    const { indices, before, after } = entry.command;
    return indices.byteLength + before.byteLength + after.byteLength;
  }
  if (entry.kind === 'tunnel') {
    let bytes = 0;
    for (const command of [entry.holeCommand, entry.waterCommand]) {
      if (command) bytes += command.indices.byteLength + command.before.byteLength + command.after.byteLength;
    }
    for (const tunnel of entry.tunnels) {
      bytes += (tunnel.profile.length * 2 + tunnel.path.length * 3) * 8;
    }
    return bytes;
  }
  if (entry.kind === 'generate') {
    let bytes = 0;
    for (const command of [entry.terrainCommand, entry.splatCommand]) {
      if (command) bytes += command.indices.byteLength + command.before.byteLength + command.after.byteLength;
    }
    return bytes;
  }
  if (entry.kind === 'holes' && entry.waterCommand) {
    const { indices, before, after } = entry.waterCommand;
    const base = entry.command.indices.byteLength + entry.command.before.byteLength + entry.command.after.byteLength;
    return base + indices.byteLength + before.byteLength + after.byteLength;
  }
  if (entry.kind === 'resize') {
    // Both whole fields are retained for the swap.
    return entry.before.heights.byteLength + entry.before.splat.byteLength
      + entry.after.heights.byteLength + entry.after.splat.byteLength;
  }
  if (entry.kind === 'foliage') {
    let records = 0;
    for (const layer of entry.command.layers) {
      records += (layer.added?.length ?? 0) + (layer.removed?.length ?? 0);
    }
    return records * 64;
  }
  return (entry.snapshot?.length ?? 0) * 2;
}

function bootDocument(saved) {
  if (saved?.terrain?.heights) {
    try {
      return {
        bootSource: 'persisted',
        name: typeof saved.name === 'string' ? saved.name : 'Untitled landscape',
        settings: createLandscapeSettings(saved.settings ?? {}),
        palette: Array.isArray(saved.palette) && saved.palette.length
          ? clonePalette(saved.palette)
          : clonePalette(BUILTIN_FOLIAGE_ENTRIES),
        materialLayers: sanitizeMaterialLayers(saved.materialLayers),
        field: createLandscapeField({
          tilesX: saved.terrain.tilesX,
          tilesZ: saved.terrain.tilesZ,
          quadsPerTile: saved.terrain.quadsPerTile,
          spacing: saved.terrain.spacing,
          origin: saved.terrain.origin,
          heights: saved.terrain.heights,
          splat: saved.terrain.splat,
          holes: saved.terrain.holes instanceof Uint8Array ? saved.terrain.holes : null,
          water: saved.terrain.water instanceof Uint8Array ? saved.terrain.water : null,
        }),
        pendingFoliageLayers: Array.isArray(saved.foliageLayers) ? saved.foliageLayers : [],
        // Autosaves from the short-lived slab era just lose their bores.
        tunnels: Array.isArray(saved.tunnels)
          ? saved.tunnels.map(deserializeTunnel).filter(Boolean)
          : [],
      };
    } catch {
      // Corrupt autosave: fall through to a fresh project.
    }
  }
  return {
    bootSource: 'fresh',
    name: 'Untitled landscape',
    settings: createLandscapeSettings(),
    palette: clonePalette(BUILTIN_FOLIAGE_ENTRIES),
    materialLayers: createDefaultMaterialLayers(),
    field: freshField(),
    pendingFoliageLayers: [],
    tunnels: [],
  };
}

export function createLandscapeStore({
  urlParams = new URLSearchParams(window.location.search),
  saved = null,
} = {}) {
  const boot = bootDocument(saved);
  // The live bulk document — owned by the store, mutated by tools/commands,
  // read by the engine. Never placed into React state.
  const document = {
    field: boot.field,
    pendingFoliageLayers: boot.pendingFoliageLayers,
    // Swept-mesh tunnels (see landscapeTunnel.js).
    tunnels: boot.tunnels ?? [],
  };
  let foliageHost = null;

  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;
  let autosaveTimer = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    lastChange: { changeKind: 'boot', immediate: false },
    mode: urlParams.get('mode') === 'paint' ? 'paint'
      : urlParams.get('mode') === 'foliage' ? 'foliage' : 'sculpt',
    materialLayers: boot.materialLayers,
    name: boot.name,
    paintLayer: 0,
    palette: boot.palette,
    selectedPaletteId: boot.palette[0]?.id ?? null,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last landscape.' : '',
    // Boot with the camera armed — nobody should accidentally sculpt on
    // their first click after opening or refreshing the lab.
    tool: 'orbit',
    holeDry: true,
    cameraMode: 'rotate',
    foliageTotal: 0,
    walkPreview: false,
    walkCamera: 'third',
    // { a: {x,y,z}, b: {x,y,z} } while the tunnel planner modal is open.
    tunnelPlanner: null,
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    palette: state().palette,
    settings: state().settings,
  });

  store.getDocument = () => document;
  store.attachFoliageHost = (host) => { foliageHost = host; };
  store.getFoliageHost = () => foliageHost;

  function scheduleAutosave() {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      const field = document.field;
      saveLandscapeProject({
        name: state().name,
        settings: state().settings,
        palette: state().palette,
        materialLayers: state().materialLayers,
        terrain: {
          tilesX: field.tilesX,
          tilesZ: field.tilesZ,
          quadsPerTile: field.quadsPerTile,
          spacing: field.spacing,
          origin: { ...field.origin },
          heights: field.heights,
          splat: field.splat,
          holes: field.holes,
          water: field.water,
        },
        foliageLayers: foliageHost?.serializeLayers() ?? [],
        tunnels: document.tunnels.map(serializeTunnel),
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function trimHistory() {
    while (undoStack.length > UNDO_LIMIT) undoStack.shift();
    let bytes = 0;
    for (const entry of undoStack) bytes += commandBytes(entry);
    while (bytes > HISTORY_BYTE_BUDGET && undoStack.length > 1) {
      bytes -= commandBytes(undoStack.shift());
    }
  }

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function commit(patch, { immediate = false, status = null, changeKind = 'settings', dirtyRect = null } = {}) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      lastChange: { changeKind, dirtyRect, immediate },
      ...(status === null ? {} : { status }),
    }));
    scheduleAutosave();
    updateHistoryFlags();
  }

  /** Snapshot history for settings/palette edits (slider-coalesced). */
  function pushSnapshotHistory(key = null) {
    const now = Date.now();
    if (key && lastHistoryKey === key && now - lastHistoryTime < HISTORY_COALESCE_MS) {
      lastHistoryTime = now;
      return;
    }
    undoStack.push({ kind: 'snapshot', snapshot: snapshot() });
    trimHistory();
    redoStack.length = 0;
    lastHistoryKey = key;
    lastHistoryTime = now;
  }

  /** Command history for strokes — one entry per stroke, never coalesced. */
  function pushCommandHistory(entry) {
    undoStack.push(entry);
    trimHistory();
    redoStack.length = 0;
    lastHistoryKey = null;
    lastHistoryTime = 0;
  }

  function applyFoliage(command, direction) {
    if (!foliageHost) return;
    foliageHost.apply(command, direction);
    store.setState({ foliageTotal: foliageHost.totalCount() });
  }

  function stepHistory(from, to, direction) {
    const entry = from.pop();
    if (!entry) return;
    if (entry.kind === 'snapshot') {
      to.push({ kind: 'snapshot', snapshot: snapshot() });
      const restored = JSON.parse(entry.snapshot);
      commit({
        name: restored.name,
        palette: restored.palette,
        settings: createLandscapeSettings(restored.settings),
      }, { immediate: true, status: 'History restored.', changeKind: 'settings' });
    } else if (entry.kind === 'terrain') {
      to.push(entry);
      const rect = direction === 'undo'
        ? revertCommand(document.field, entry.command)
        : applyCommand(document.field, entry.command);
      commit({}, { immediate: true, changeKind: 'terrain', dirtyRect: rect, status: 'History restored.' });
    } else if (entry.kind === 'splat') {
      to.push(entry);
      const rect = direction === 'undo'
        ? revertSplatCommand(document.field, entry.command)
        : applySplatCommand(document.field, entry.command);
      commit({}, { immediate: true, changeKind: 'splat', dirtyRect: rect, status: 'History restored.' });
    } else if (entry.kind === 'holes') {
      to.push(entry);
      const rect = direction === 'undo'
        ? revertHoleCommand(document.field, entry.command)
        : applyHoleCommand(document.field, entry.command);
      // Dry-hole strokes are compound: their water-mask half travels in the
      // SAME history entry so one undo restores both.
      if (entry.waterCommand) {
        if (direction === 'undo') revertWaterCommand(document.field, entry.waterCommand);
        else applyWaterCommand(document.field, entry.waterCommand);
      }
      commit({}, { immediate: true, changeKind: 'holes', dirtyRect: rect, status: 'History restored.' });
    } else if (entry.kind === 'water') {
      to.push(entry);
      const rect = direction === 'undo'
        ? revertWaterCommand(document.field, entry.command)
        : applyWaterCommand(document.field, entry.command);
      commit({}, { immediate: true, changeKind: 'water', dirtyRect: rect, status: 'History restored.' });
    } else if (entry.kind === 'tunnel') {
      to.push(entry);
      if (entry.holeCommand) {
        if (direction === 'undo') revertHoleCommand(document.field, entry.holeCommand);
        else applyHoleCommand(document.field, entry.holeCommand);
      }
      if (entry.waterCommand) {
        if (direction === 'undo') revertWaterCommand(document.field, entry.waterCommand);
        else applyWaterCommand(document.field, entry.waterCommand);
      }
      if (direction === 'undo') {
        const removed = new Set(entry.tunnels.map((tunnel) => tunnel.id));
        document.tunnels = document.tunnels.filter((tunnel) => !removed.has(tunnel.id));
      } else {
        document.tunnels.push(...entry.tunnels);
      }
      commit({}, {
        immediate: true,
        changeKind: 'tunnel',
        dirtyRect: entry.holeCommand?.dirtyRect ?? null,
        status: 'History restored.',
      });
    } else if (entry.kind === 'generate') {
      to.push(entry);
      if (entry.terrainCommand) {
        if (direction === 'undo') revertCommand(document.field, entry.terrainCommand);
        else applyCommand(document.field, entry.terrainCommand);
      }
      if (entry.splatCommand) {
        if (direction === 'undo') revertSplatCommand(document.field, entry.splatCommand);
        else applySplatCommand(document.field, entry.splatCommand);
      }
      commit({}, {
        immediate: true,
        changeKind: 'terrain', // dirty-rect tile update + splat refresh
        dirtyRect: entry.terrainCommand?.dirtyRect ?? entry.splatCommand?.dirtyRect ?? null,
        status: 'History restored.',
      });
    } else if (entry.kind === 'resize') {
      to.push(entry);
      document.field = direction === 'undo' ? entry.before : entry.after;
      commit({}, { immediate: true, changeKind: 'resize', status: 'History restored.' });
    } else if (entry.kind === 'foliage') {
      to.push(entry);
      applyFoliage(entry.command, direction === 'undo' ? 'revert' : 'apply');
      commit({}, { immediate: true, changeKind: 'foliageHistory', status: 'History restored.' });
    }
    updateHistoryFlags();
  }

  function replaceDocument({ field, name, settings, palette, materialLayers, pendingFoliageLayers, tunnels, status }) {
    window.clearTimeout(autosaveTimer);
    document.field = field;
    document.pendingFoliageLayers = pendingFoliageLayers ?? [];
    document.tunnels = tunnels ?? [];
    undoStack.length = 0;
    redoStack.length = 0;
    store.setState({
      name,
      palette,
      selectedPaletteId: palette[0]?.id ?? null,
      settings,
      materialLayers: sanitizeMaterialLayers(materialLayers),
      paintLayer: 0,
      foliageTotal: 0,
    });
    commit({}, { immediate: true, changeKind: 'load', status });
  }

  store.actions = {
    setMode(mode) {
      const tool = mode === 'sculpt' ? 'raise' : mode === 'paint' ? 'paintSplat' : 'paintFoliage';
      store.setState({ mode, tool });
    },

    setTool(tool) {
      store.setState({ tool });
    },

    /** What left-drag does when no brush is armed: rotate | pan | zoom. */
    setCameraMode(cameraMode) {
      store.setState({
        cameraMode: ['rotate', 'pan', 'zoom'].includes(cameraMode) ? cameraMode : 'rotate',
      });
    },

    // Tools stay armed while walking — WASD moves, left-drag paints, so you
    // can dress a cave from inside it.
    setWalkPreview(walkPreview) {
      store.setState({ walkPreview: Boolean(walkPreview) });
    },

    /** 'third' = free orbit · 'follow' = TPS lock (character centered) · 'first'. */
    setWalkCamera(walkCamera) {
      store.setState({
        walkCamera: walkCamera === 'first' || walkCamera === 'follow' ? walkCamera : 'third',
      });
    },

    setPaintLayer(index) {
      store.setState({ paintLayer: Math.min(3, Math.max(0, Math.round(index))) });
    },

    /** Hole tool option: dry caves (also paints the dry mask) vs wet pits. */
    setHoleDry(holeDry) {
      store.setState({ holeDry: Boolean(holeDry) });
    },

    /**
     * Assigns a layer's texture ref (texgen preset, imported data-url, Pro
     * texture). Deliberately outside the undo history — material assignment
     * is a rare explicit action, and embedded data-urls would bloat
     * snapshots.
     */
    setLayerTexture(index, textureRef) {
      const materialLayers = state().materialLayers.map((layer, i) => (i === index
        ? { ...layer, textureRef: textureRef?.kind ? { ...textureRef } : null }
        : layer));
      commit({ materialLayers }, { changeKind: 'layers' });
    },

    setLayerRepeat(index, repeat) {
      const materialLayers = state().materialLayers.map((layer, i) => (i === index
        ? { ...layer, repeat: Math.max(0.01, Number(repeat) || layer.repeat) }
        : layer));
      commit({ materialLayers }, { changeKind: 'layers' });
    },

    selectPaletteEntry(id) {
      store.setState({ selectedPaletteId: id });
    },

    /** Single schema-field edit (snapshot history, slider-coalesced). */
    setSetting(key, value) {
      pushSnapshotHistory(`setting:${key}`);
      commit({
        settings: createLandscapeSettings({ ...state().settings, [key]: value }),
      }, { changeKind: 'settings' });
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next });
      scheduleAutosave();
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    /** Palette entry edit: rules, density, label, active flag. */
    updatePaletteEntry(id, patch) {
      pushSnapshotHistory(`palette:${id}`);
      const palette = state().palette.map((entry) => (entry.id === id
        ? {
          ...entry,
          ...patch,
          rules: patch.rules ? { ...entry.rules, ...patch.rules } : entry.rules,
        }
        : entry));
      commit({ palette }, { changeKind: 'palette' });
    },

    addPaletteEntry(entry) {
      if (!entry?.id || state().palette.some((existing) => existing.id === entry.id)) {
        return { ok: false, errors: ['Palette entry id missing or already present.'] };
      }
      pushSnapshotHistory();
      commit({
        palette: [...state().palette, entry],
        selectedPaletteId: entry.id,
      }, { changeKind: 'palette', status: `Added ${entry.label} to the palette.` });
      return { ok: true };
    },

    /** Removes an entry AND its painted instances (two undoable entries). */
    removePaletteEntry(id) {
      const entry = state().palette.find((existing) => existing.id === id);
      if (!entry) return;
      const layerRecords = foliageHost?.recordsFor(id) ?? [];
      if (layerRecords.length) {
        const command = { layers: [{ paletteId: id, added: [], removed: layerRecords }] };
        applyFoliage(command, 'apply');
        pushCommandHistory({ kind: 'foliage', command });
      }
      pushSnapshotHistory();
      const palette = state().palette.filter((existing) => existing.id !== id);
      commit({
        palette,
        selectedPaletteId: state().selectedPaletteId === id
          ? (palette[0]?.id ?? null)
          : state().selectedPaletteId,
      }, { changeKind: 'palette', status: `Removed ${entry.label}.` });
    },

    /** One committed sculpt stroke (already applied live by the tools). */
    commitTerrainStroke(command, { status = null } = {}) {
      if (!command) return;
      pushCommandHistory({ kind: 'terrain', command });
      commit({}, { changeKind: 'terrainCommitted', dirtyRect: command.dirtyRect, status });
    },

    /** One committed splat stroke (already applied live by the tools). */
    commitSplatStroke(command, { status = null } = {}) {
      if (!command) return;
      pushCommandHistory({ kind: 'splat', command });
      commit({}, { changeKind: 'splatCommitted', dirtyRect: command.dirtyRect, status });
    },

    /**
     * One committed hole stroke (geometry already rebuilt by the tools).
     * `waterCommand` carries the dry-mask half of a DRY hole stroke so the
     * pair undoes as one entry.
     */
    commitHoleStroke(command, { status = null, waterCommand = null } = {}) {
      if (!command && !waterCommand) return;
      if (command) {
        pushCommandHistory({ kind: 'holes', command, waterCommand });
        commit({}, { changeKind: 'holesCommitted', dirtyRect: command.dirtyRect, status });
      } else {
        pushCommandHistory({ kind: 'water', command: waterCommand });
        commit({}, { changeKind: 'waterCommitted', dirtyRect: waterCommand.dirtyRect, status });
      }
    },

    /** One committed dry-zone stroke (mask already live via the tools). */
    commitWaterStroke(command, { status = null } = {}) {
      if (!command) return;
      pushCommandHistory({ kind: 'water', command });
      commit({}, { changeKind: 'waterCommitted', dirtyRect: command.dirtyRect, status });
    },

    /**
     * One committed foliage stroke. `command.layers` =
     * `[{ paletteId, added: records, removed: records }]`; instances are
     * already live in the layers — this records history + autosaves.
     */
    commitFoliageStroke(command, { status = null } = {}) {
      const total = command?.layers?.reduce(
        (sum, layer) => sum + layer.added.length + layer.removed.length,
        0,
      ) ?? 0;
      if (!total) return;
      pushCommandHistory({ kind: 'foliage', command });
      store.setState({ foliageTotal: foliageHost?.totalCount() ?? state().foliageTotal });
      commit({}, { changeKind: 'foliageCommitted', status });
    },

    /**
     * Photoshop-style canvas resize: a new tile grid with the existing block
     * placed at the chosen tile offset. World positions are preserved (the
     * origin shifts), so painted foliage stays aligned. One undoable entry.
     */
    resizeTerrain({ tilesX, tilesZ, offsetTilesX = 0, offsetTilesZ = 0 } = {}) {
      const before = document.field;
      let after;
      try {
        after = resizeLandscapeField(before, { tilesX, tilesZ, offsetTilesX, offsetTilesZ });
      } catch (error) {
        store.setState({ status: `Resize failed: ${error.message}` });
        return { ok: false, errors: [error.message] };
      }
      document.field = after;
      pushCommandHistory({ kind: 'resize', before, after });
      const cropped = after.tilesX < before.tilesX || after.tilesZ < before.tilesZ;
      commit({}, {
        immediate: true,
        changeKind: 'resize',
        status: `Terrain resized to ${after.tilesX}×${after.tilesZ} tiles (${Math.round(after.extentX)}×${Math.round(after.extentZ)} m).${cropped ? ' Foliage outside the new bounds keeps floating — erase it if unwanted.' : ''}`,
      });
      return { ok: true };
    },

    /**
     * One committed tunnel bore: portal hole + dry commands (already applied
     * by the caller) plus the swept tunnel record, as ONE history entry.
     */
    commitTunnel({ holeCommand = null, waterCommand = null, tunnels = [] } = {}) {
      if (!holeCommand && !tunnels.length) return;
      document.tunnels.push(...tunnels);
      pushCommandHistory({ kind: 'tunnel', holeCommand, waterCommand, tunnels });
      commit({}, {
        immediate: true,
        changeKind: 'tunnel',
        dirtyRect: holeCommand?.dirtyRect ?? null,
        status: `Tunnel bored${tunnels.some((tunnel) => !tunnel.endOpen) ? ' (dead-end cave)' : ''}.`,
      });
    },

    /** Opens the tunnel planner modal for two clicked portal points. */
    openTunnelPlanner(portals) {
      store.setState({ tunnelPlanner: portals ?? null });
    },

    closeTunnelPlanner() {
      store.setState({ tunnelPlanner: null });
    },

    /**
     * Controlled procedural generation of SELECTED tiles: terrain type,
     * elevation range, roughness, features, seed. Heights + surface repaint
     * land as ONE compound undo entry; edges feather into the surroundings.
     */
    generateTerrain({ tiles, ...options } = {}) {
      if (!tiles?.length) return { ok: false, errors: ['Select at least one tile.'] };
      const { terrainCommand, splatCommand } = generateTerrainRegion(document.field, {
        tiles,
        ...options,
        waterLevel: state().settings.waterLevel,
      });
      if (!terrainCommand && !splatCommand) {
        store.setState({ status: 'Generation produced no change.' });
        return { ok: false, errors: ['Generation produced no change.'] };
      }
      pushCommandHistory({ kind: 'generate', terrainCommand, splatCommand });
      commit({}, {
        immediate: true,
        changeKind: 'terrain',
        dirtyRect: terrainCommand?.dirtyRect ?? splatCommand?.dirtyRect ?? null,
        status: `Generated ${tiles.length} tile${tiles.length === 1 ? '' : 's'} (${options.type ?? 'hills'}).`,
      });
      return { ok: true };
    },

    /** Bakes a stylizedTerrain archetype into the field (one undo entry). */
    seedFromArchetype(archetype, seed = Math.floor(Math.random() * 10000) + 1) {
      const { command } = seedFieldFromArchetype(document.field, { archetype, seed });
      if (!command) {
        store.setState({ status: 'Seeding produced no change.' });
        return;
      }
      pushCommandHistory({ kind: 'terrain', command });
      commit({}, {
        immediate: true,
        changeKind: 'terrain',
        dirtyRect: command.dirtyRect,
        status: `Seeded terrain from the ${archetype} archetype.`,
      });
    },

    undo() {
      stepHistory(undoStack, redoStack, 'undo');
    },

    redo() {
      stepHistory(redoStack, undoStack, 'redo');
    },

    /** Serialized project JSON (async: arrays deflate+base64 encode). */
    async exportDocument() {
      return serializeLandscapeProject({
        label: state().name,
        settings: state().settings,
        materialLayers: state().materialLayers,
        field: document.field,
        tunnels: document.tunnels,
        foliage: {
          palette: state().palette,
          layers: foliageHost?.serializeLayers() ?? [],
        },
      });
    },

    async importDocument(text) {
      const result = await parseLandscapeProjectDocument(text);
      if (!result.ok) return result;
      replaceDocument({
        field: result.value.field,
        name: result.value.label,
        settings: result.value.settings,
        materialLayers: result.value.materialLayers,
        tunnels: result.value.tunnels,
        palette: result.value.foliage.palette.length
          ? clonePalette(result.value.foliage.palette)
          : clonePalette(BUILTIN_FOLIAGE_ENTRIES),
        pendingFoliageLayers: result.value.foliage.layers,
        status: `Imported ${result.value.label}.`,
      });
      return result;
    },

    resetLab() {
      clearLandscapeProject();
      replaceDocument({
        field: freshField(),
        name: 'Untitled landscape',
        settings: createLandscapeSettings(),
        materialLayers: createDefaultMaterialLayers(),
        palette: clonePalette(BUILTIN_FOLIAGE_ENTRIES),
        pendingFoliageLayers: [],
        status: 'Landscape Lab reset.',
      });
    },
  };

  return store;
}
