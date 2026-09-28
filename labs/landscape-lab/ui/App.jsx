// Landscape Lab workspace — deliberately mirrors ToonLab's Landscape/Foliage
// editors (mode rail: Sculpt / Paint / Foliage; the Brush Size / Falloff /
// Strength triplet always on top; Paint target-layer list; Foliage palette
// grid with checkbox activation and per-mesh settings) rendered with the
// ToonLab shared kit chrome.

import { useEffect, useRef, useState } from 'react';

import {
  BrandLockup,
  Button,
  ColorWell,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  Modal,
  Popover,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  Slider,
  TextField,
  Toggle,
  toast,
  ToastStack,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  BUILTIN_FOLIAGE_ENTRIES,
  GENERATE_FEATURES,
  GENERATE_TERRAIN_TYPES,
  planFoliagePaint,
  buildTunnelPath,
  normalizeTunnelProfile,
  tunnelProfilePreset,
  LANDSCAPE_LAYER_DEFAULTS,
  LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP,
  LANDSCAPE_SETTING_GROUPS,
  texgenOptionsForSurface,
} from '../../../src/landscape/index.js';
import { getTerrainArchetypeOptions } from '../../../src/stylizedTerrain.js';
import { LANDSCAPE_GUIDE_SECTIONS } from './guideContent.js';
import {
  detectProAssetLibrary,
  paletteEntryFromLibraryModel,
  paletteEntryFromPolyhaven,
  searchPolyhavenModels,
  searchProAssets,
} from '../proAssets.js';
import { listLocalLabAssets } from '../localLabAssets.js';
import { boreTunnel } from '../engine/landscapeTools.js';

const MODES = Object.freeze([
  Object.freeze({ id: 'sculpt', label: 'Sculpt', icon: 'tool-sculpt-add', key: '1' }),
  Object.freeze({ id: 'paint', label: 'Paint', icon: 'stage-look', key: '2' }),
  Object.freeze({ id: 'foliage', label: 'Foliage', icon: 'stage-leaves', key: '3' }),
]);

const TOOLS_BY_MODE = Object.freeze({
  sculpt: [
    { id: 'raise', label: 'Sculpt', icon: 'tool-sculpt-add', hint: 'Raise terrain — hold Shift to lower.' },
    { id: 'smooth', label: 'Smooth', icon: 'stage-detail', hint: 'Relax bumps toward the local average.' },
    { id: 'flatten', label: 'Flatten', icon: 'stage-shape', hint: 'Flatten toward the height sampled at stroke start.' },
    { id: 'ramp', label: 'Ramp', icon: 'sketch', hint: 'Click a start point, then an end point. Esc cancels.' },
    { id: 'tunnel', label: 'Tunnel', icon: 'link', hint: 'Horizontal bore: click the ENTRANCE, then the END point — the planner opens to doodle the cross-section and route (straight or curved), and to stop short for a dead-end cave. Esc cancels.' },
    { id: 'noise', label: 'Noise', icon: 'dice', hint: 'World-anchored fractal detail.' },
    { id: 'terrace', label: 'Terrace', icon: 'stage-pieces', hint: 'Quantize slopes into stepped bands.' },
    { id: 'hole', label: 'Hole', icon: 'tool-erase', hint: 'Punch through the terrain for cave and tunnel openings — hold Shift to restore. Build interiors from placed meshes.' },
    { id: 'dry', label: 'Dry', icon: 'close', hint: 'Suppress the stage water here — dug caves stay dry below the waterline. Hold Shift to re-wet. Groundwater Depth still floods far enough down.' },
  ],
  paint: [
    { id: 'paintSplat', label: 'Paint', icon: 'stage-look', hint: 'Paint the target layer — hold Shift to erase it.' },
  ],
  foliage: [
    { id: 'paintFoliage', label: 'Paint', icon: 'stage-leaves', hint: 'Paint active palette assets — hold Shift to erase.' },
    { id: 'placeFoliage', label: 'Single', icon: 'pin', hint: 'Click any surface — terrain or placed meshes — to place one instance of the SELECTED asset, aligned to the surface (stalactites on cave ceilings). Shift-click removes.' },
  ],
});

const BRUSH_TRIPLET = new Set(['brushRadius', 'brushStrength', 'brushHardness']);
const LAYER_TINT_KEYS = ['grassTint', 'dirtTint', 'rockTint', 'sandTint'];

function LandscapeSchemaGroup({ actions, groupId, settings, fieldFilter, showCaption = false }) {
  const group = LANDSCAPE_SETTING_GROUPS.find((entry) => entry.id === groupId);
  if (!group) return null;
  return (
    <SchemaGroup
      fieldFilter={fieldFilter}
      fields={LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP[groupId]}
      getValue={(field) => settings[field.key]}
      group={group}
      onChange={(field, value) => actions.setSetting(field.key, value)}
      showCaption={showCaption}
    />
  );
}

function DocumentMenu({ actions, anchor, onClose, onOpenGenerate, onOpenResize, state }) {
  const [name, setName] = useState(state.name);
  const [archetype, setArchetype] = useState(getTerrainArchetypeOptions()[0]?.id ?? 'rollingPlains');

  async function exportProject() {
    try {
      const json = await actions.exportDocument();
      downloadBlob(json, `${state.name.replace(/\s+/g, '-').toLowerCase() || 'landscape'}.landscape-project.json`, 'application/json');
      onClose();
    } catch (error) {
      toast(`Export failed: ${error.message}`, { tone: 'danger' });
    }
  }

  async function importProject() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = await actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors) toast(error, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Project" width={300}>
      <div className="ll-doc-menu">
        <div className="ll-save-row">
          <TextField onCommit={(value) => { setName(value); actions.setName(value); }} placeholder="Landscape name…" value={name} />
        </div>
        <div className="ll-seed-row" title="Bake a procedural archetype into the editable terrain — one undoable history entry.">
          <Select
            onChange={setArchetype}
            options={getTerrainArchetypeOptions().map((entry) => ({ label: entry.label, value: entry.id }))}
            value={archetype}
          />
          <Button kind="secondary" onClick={() => { actions.seedFromArchetype(archetype); onClose(); }} testId="seed-terrain">
            Seed terrain
          </Button>
        </div>
        <Button kind="secondary" onClick={onOpenResize} testId="open-terrain-size">Terrain size…</Button>
        <Button kind="secondary" onClick={onOpenGenerate} testId="open-terrain-generate">Generate tiles…</Button>
        <Button kind="secondary" onClick={exportProject} testId="export-project">Export project JSON</Button>
        <Button kind="secondary" onClick={importProject}>Import project JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

// Full-screen guide: every tool + the workflow recipes (caves, dry water,
// underground pools, tunnels). Content lives in guideContent.js so the
// hosted docs section can render the same source.
function GuideModal({ onClose }) {
  const [sectionId, setSectionId] = useState(LANDSCAPE_GUIDE_SECTIONS[0].id);
  const section = LANDSCAPE_GUIDE_SECTIONS.find((entry) => entry.id === sectionId)
    ?? LANDSCAPE_GUIDE_SECTIONS[0];
  return (
    <Modal onClose={onClose} testId="landscape-guide" title="Landscape Lab Guide" width={4000}>
      <div className="ll-guide">
        <nav className="ll-guide-nav">
          {LANDSCAPE_GUIDE_SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="ll-guide-nav-item"
              data-active={entry.id === section.id}
              data-testid={`guide-${entry.id}`}
              onClick={() => setSectionId(entry.id)}
            >
              {entry.title}
            </button>
          ))}
        </nav>
        <article className="ll-guide-body">
          <h2>{section.title}</h2>
          {section.blocks.map((block, index) => {
            if (block.h) return <h3 key={index}>{block.h}</h3>;
            if (block.img) {
              return (
                <figure key={index} className="ll-guide-figure">
                  <img alt={block.caption ?? ''} src={block.img} />
                  {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
              );
            }
            if (block.list) {
              return (
                <ul key={index}>
                  {block.list.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                </ul>
              );
            }
            return <p key={index}>{block.p}</p>;
          })}
        </article>
      </div>
    </Modal>
  );
}

const MAX_TERRAIN_TILES = 8;
const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)));

// Top-down terrain map: height-shaded (water blue, holes black) with the
// tile grid overlaid; used by the Generate modal for tile selection.
function drawTerrainMap(canvas, field, waterLevel, selected) {
  const scale = Math.max(1, Math.floor(Math.max(field.splatW, field.splatD) / 256));
  const width = Math.floor(field.splatW / scale);
  const depth = Math.floor(field.splatD / scale);
  canvas.width = width;
  canvas.height = depth;
  // The element must keep the bitmap's aspect so pointer→tile math needs no
  // letterbox correction.
  canvas.style.aspectRatio = `${width} / ${depth}`;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, depth);
  const { min, max } = field.heightBounds;
  const span = Math.max(1e-3, max - Math.min(min, waterLevel));
  for (let py = 0; py < depth; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const qx = Math.min(field.splatW - 1, px * scale);
      const qz = Math.min(field.splatD - 1, py * scale);
      const quad = qz * field.splatW + qx;
      const offset = (py * width + px) * 4;
      if (field.holes[quad] === 0) {
        image.data[offset] = 8;
        image.data[offset + 1] = 8;
        image.data[offset + 2] = 10;
      } else {
        const worldX = field.origin.x + (qx + 0.5) * field.spacing;
        const worldZ = field.origin.z + (qz + 0.5) * field.spacing;
        const height = field.heightAt(worldX, worldZ);
        if (height <= waterLevel && field.water[quad] !== 0) {
          const depthT = Math.min(1, (waterLevel - height) / 6);
          image.data[offset] = 42 - depthT * 20;
          image.data[offset + 1] = 98 - depthT * 40;
          image.data[offset + 2] = 156 - depthT * 40;
        } else {
          const t = Math.min(1, Math.max(0, (height - min) / span));
          image.data[offset] = 96 + t * 120;
          image.data[offset + 1] = 138 + t * 90;
          image.data[offset + 2] = 84 + t * 110;
        }
      }
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  // Tile grid + selection overlay.
  const tileW = width / field.tilesX;
  const tileD = depth / field.tilesZ;
  context.strokeStyle = 'rgba(255,255,255,0.25)';
  context.lineWidth = 1;
  for (let tx = 1; tx < field.tilesX; tx += 1) {
    context.beginPath();
    context.moveTo(tx * tileW, 0);
    context.lineTo(tx * tileW, depth);
    context.stroke();
  }
  for (let tz = 1; tz < field.tilesZ; tz += 1) {
    context.beginPath();
    context.moveTo(0, tz * tileD);
    context.lineTo(width, tz * tileD);
    context.stroke();
  }
  context.strokeStyle = 'rgba(143,198,255,0.95)';
  context.fillStyle = 'rgba(143,198,255,0.22)';
  context.lineWidth = 2;
  for (const key of selected) {
    const [tx, tz] = key.split(',').map(Number);
    context.fillRect(tx * tileW, tz * tileD, tileW, tileD);
    context.strokeRect(tx * tileW + 1, tz * tileD + 1, tileW - 2, tileD - 2);
  }
}

// Controlled procedural generation for SELECTED tiles: map view + extensive
// options (type, elevation range, roughness, features, seed, per-asset
// amounts) — deliberate control, not a random roll.
function GenerateModal({ actions, onClose, state }) {
  const field = window.__landscapeLab?.store?.getDocument?.()?.field;
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [dragSetTo, setDragSetTo] = useState(null);
  const [type, setType] = useState('hills');
  const [minElevation, setMinElevation] = useState(0);
  const [maxElevation, setMaxElevation] = useState(14);
  const [roughness, setRoughness] = useState(0.5);
  const [features, setFeatures] = useState(() => new Set());
  const [seed, setSeed] = useState(7);
  const [amounts, setAmounts] = useState({}); // paletteId -> 0..100
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (canvasRef.current && field) {
      drawTerrainMap(canvasRef.current, field, state.settings.waterLevel, selected);
    }
  });

  if (!field) return null;

  const tileFromEvent = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    const tx = clampInt(Math.floor(((event.clientX - bounds.left) / bounds.width) * field.tilesX), 0, field.tilesX - 1);
    const tz = clampInt(Math.floor(((event.clientY - bounds.top) / bounds.height) * field.tilesZ), 0, field.tilesZ - 1);
    return `${tx},${tz}`;
  };
  const setTile = (key, on) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  async function apply() {
    const tiles = [...selected].map((key) => {
      const [tx, tz] = key.split(',').map(Number);
      return { tx, tz };
    });
    setBusy(true);
    try {
      const result = actions.generateTerrain({
        tiles,
        type,
        minElevation,
        maxElevation: Math.max(maxElevation, minElevation + 1),
        roughness,
        features: [...features],
        seed,
      });
      if (!result.ok) {
        for (const error of result.errors) toast(error, { tone: 'danger' });
        return;
      }
      // Auto-paint the chosen assets over the generated tiles (their rules —
      // slope, water placement, spacing — still apply; second undo entry).
      const engine = window.__landscapeLab.engine;
      const quads = field.quadsPerTile;
      const layers = [];
      for (const entry of state.palette) {
        const amount = amounts[entry.id] ?? 0;
        if (amount <= 0) continue;
        const layer = await engine.foliage.ensureLayer(entry.id);
        if (!layer) continue;
        const added = [];
        let planSeed = seed * 31 + entry.id.length;
        for (const { tx, tz } of tiles) {
          const centerX = field.origin.x + (tx + 0.5) * quads * field.spacing;
          const centerZ = field.origin.z + (tz + 0.5) * quads * field.spacing;
          const half = (quads * field.spacing) / 2;
          planSeed += 1;
          const planned = planFoliagePaint({
            field,
            layer,
            x: centerX,
            z: centerZ,
            radius: half * 1.35,
            density: entry.density,
            densityMultiplier: amount / 50,
            waterLevel: state.settings.showWater ? state.settings.waterLevel : null,
            groundwaterLevel: state.settings.showWater && state.settings.groundwaterOffset > 0
              ? state.settings.waterLevel - state.settings.groundwaterOffset
              : null,
            seed: planSeed,
          }).filter((record) => (
            Math.abs(record.x - centerX) <= half && Math.abs(record.z - centerZ) <= half
          ));
          added.push(...layer.addInstances(planned).map((record) => ({ ...record })));
        }
        if (added.length) layers.push({ paletteId: entry.id, added, removed: [] });
      }
      if (layers.length) {
        actions.commitFoliageStroke({ layers }, {
          status: `Generated + planted ${layers.reduce((sum, layer) => sum + layer.added.length, 0)} instances.`,
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} testId="terrain-generate" title="Generate Tiles" width={4000}>
      <div className="ll-generate">
        <div className="ll-generate-map">
          <p className="ll-size-caption">Click or drag tiles to select the area to generate — everything outside stays untouched (edges blend in).</p>
          <canvas
            ref={canvasRef}
            className="ll-generate-canvas"
            data-testid="generate-map"
            onPointerDown={(event) => {
              const key = tileFromEvent(event);
              const on = !selected.has(key);
              setDragSetTo(on);
              setTile(key, on);
            }}
            onPointerMove={(event) => {
              if (dragSetTo !== null && event.buttons === 1) setTile(tileFromEvent(event), dragSetTo);
            }}
            onPointerUp={() => setDragSetTo(null)}
            onPointerLeave={() => setDragSetTo(null)}
          />
          <div className="ll-generate-mapactions">
            <Button kind="secondary" onClick={() => setSelected(new Set(
              Array.from({ length: field.tilesX * field.tilesZ }, (_, index) => `${index % field.tilesX},${Math.floor(index / field.tilesX)}`),
            ))}
            >
              All
            </Button>
            <Button kind="secondary" onClick={() => setSelected(new Set())}>None</Button>
            <span className="ll-manager-count">{selected.size} tile{selected.size === 1 ? '' : 's'} selected</span>
          </div>
        </div>
        <div className="ll-generate-options">
          <label className="ll-rule-row">
            <span className="ll-rule-label">Terrain</span>
            <Select
              onChange={setType}
              options={GENERATE_TERRAIN_TYPES.map((entry) => ({ label: entry.label, value: entry.id }))}
              testId="generate-type"
              value={type}
            />
          </label>
          <RuleSlider label="Min Elev" max={60} min={-20} step={0.5} value={minElevation} onChange={setMinElevation}
            title="Lowest generated ground (meters). Below the water level means water." />
          <RuleSlider label="Max Elev" max={80} min={-20} step={0.5} value={maxElevation} onChange={setMaxElevation}
            title="Highest generated ground (meters) — crank it for real mountains." />
          <RuleSlider label="Roughness" max={1} min={0} step={0.01} value={roughness} onChange={setRoughness}
            title="High-frequency surface detail on top of the base relief." />
          <label className="ll-rule-row">
            <span className="ll-rule-label">Seed</span>
            <input
              type="number"
              className="tk-text-field ll-generate-seed"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value) || 1)}
            />
            <IconButton icon="dice" label="Random seed" onClick={() => setSeed(Math.floor(Math.random() * 99999) + 1)} />
          </label>
          <div className="tk-section-title">Features</div>
          {GENERATE_FEATURES.map((feature) => (
            <label key={feature.id} className="ll-rule-row" title={feature.hint}>
              <span className="ll-rule-label">{feature.label}</span>
              <Toggle
                checked={features.has(feature.id)}
                onChange={(on) => setFeatures((current) => {
                  const next = new Set(current);
                  if (on) next.add(feature.id);
                  else next.delete(feature.id);
                  return next;
                })}
                testId={`generate-feature-${feature.id}`}
              />
            </label>
          ))}
          <div className="tk-section-title">Assets</div>
          <p className="ll-size-caption">How much of each palette asset to plant (0–100). Placement respects each asset’s rules — slope, spacing, water.</p>
          {state.palette.map((entry) => (
            <RuleSlider
              key={entry.id}
              label={entry.label}
              max={100}
              min={0}
              step={1}
              value={amounts[entry.id] ?? 0}
              onChange={(value) => setAmounts((current) => ({ ...current, [entry.id]: Math.round(value) }))}
            />
          ))}
          <div className="ll-size-actions">
            <Button kind="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={selected.size === 0 || busy} kind="primary" testId="generate-apply" onClick={apply}>
              {busy ? 'Generating…' : `Generate ${selected.size || ''} tile${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// The tunnel planner: doodle the cross-section, doodle the route between
// the two clicked portals, choose how far to bore. The bore itself is a
// swept tube mesh + portal-only terrain punching (see landscapeTunnel.js).
function drawProfileCanvas(canvas, profile, rawStroke) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(10, 12, 16, 0.9)';
  context.fillRect(0, 0, width, height);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of profile) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const spanU = Math.max(1e-3, maxU - minU);
  const spanV = Math.max(1e-3, maxV - minV);
  const pad = 26;
  const scale = Math.min((width - pad * 2) / spanU, (height - pad * 2) / spanV);
  const toX = (u) => width / 2 + (u - (minU + maxU) / 2) * scale;
  const toY = (v) => height - pad - (v - minV) * scale;
  // Floor line.
  context.strokeStyle = 'rgba(255,255,255,0.18)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(10, toY(0));
  context.lineTo(width - 10, toY(0));
  context.stroke();
  // The profile.
  context.beginPath();
  profile.forEach(([u, v], index) => {
    if (index === 0) context.moveTo(toX(u), toY(v));
    else context.lineTo(toX(u), toY(v));
  });
  context.closePath();
  context.fillStyle = 'rgba(143,198,255,0.18)';
  context.fill();
  context.strokeStyle = 'rgba(143,198,255,0.95)';
  context.lineWidth = 2;
  context.stroke();
  // A live doodle overlays in amber until the pointer lifts.
  if (rawStroke && rawStroke.length > 1) {
    context.beginPath();
    rawStroke.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = 'rgba(240,192,90,0.9)';
    context.lineWidth = 2;
    context.stroke();
  }
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.font = '11px sans-serif';
  context.fillText(`${spanU.toFixed(1)} m wide - ${spanV.toFixed(1)} m tall`, 12, 16);
}

function TunnelModal({ actions, onClose, planner, state }) {
  const field = window.__landscapeLab?.store?.getDocument?.()?.field;
  const profileCanvasRef = useRef(null);
  const routeCanvasRef = useRef(null);
  const strokeRef = useRef(null); // live profile doodle, canvas px
  const routeStrokeRef = useRef(false);
  const [source, setSource] = useState({ kind: 'preset', preset: 'arch' });
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(() => state.settings.tunnelHeight ?? 4);
  const [stopAt, setStopAt] = useState(100);
  const [route, setRoute] = useState([]); // doodled XZ world points
  const [, bump] = useState(0); // imperative canvas repaint trigger

  const profile = source.kind === 'doodle'
    ? normalizeTunnelProfile(source.points, width, height)
    : tunnelProfilePreset(source.preset, width, height);

  useEffect(() => {
    if (profileCanvasRef.current) drawProfileCanvas(profileCanvasRef.current, profile, strokeRef.current);
  });

  const mapScale = field ? Math.max(1, Math.floor(Math.max(field.splatW, field.splatD) / 256)) : 1;
  const worldToPx = (x, z) => [
    (x - field.origin.x) / (field.spacing * mapScale),
    (z - field.origin.z) / (field.spacing * mapScale),
  ];

  useEffect(() => {
    const canvas = routeCanvasRef.current;
    if (!canvas || !field) return;
    drawTerrainMap(canvas, field, state.settings.waterLevel, new Set());
    const context = canvas.getContext('2d');
    const points = route.length >= 2 ? route : [[planner.a.x, planner.a.z], [planner.b.x, planner.b.z]];
    context.beginPath();
    points.forEach(([x, z], index) => {
      const [px, pz] = worldToPx(x, z);
      if (index === 0) context.moveTo(px, pz);
      else context.lineTo(px, pz);
    });
    context.strokeStyle = 'rgba(240,192,90,0.95)';
    context.lineWidth = 2;
    context.stroke();
    for (const [point, label] of [[planner.a, 'A'], [planner.b, 'B']]) {
      const [px, pz] = worldToPx(point.x, point.z);
      context.beginPath();
      context.arc(px, pz, 5, 0, Math.PI * 2);
      context.fillStyle = 'rgba(143,198,255,0.95)';
      context.fill();
      context.fillStyle = '#0a0c10';
      context.font = 'bold 8px sans-serif';
      context.fillText(label, px - 2.5, pz + 3);
    }
  });

  if (!field || !planner) return null;

  const profilePoint = (event) => {
    const bounds = profileCanvasRef.current.getBoundingClientRect();
    return [
      ((event.clientX - bounds.left) / bounds.width) * profileCanvasRef.current.width,
      ((event.clientY - bounds.top) / bounds.height) * profileCanvasRef.current.height,
    ];
  };

  const routePoint = (event) => {
    const canvas = routeCanvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return [
      field.origin.x + ((event.clientX - bounds.left) / bounds.width) * canvas.width * mapScale * field.spacing,
      field.origin.z + ((event.clientY - bounds.top) / bounds.height) * canvas.height * mapScale * field.spacing,
    ];
  };

  function bore() {
    const built = buildTunnelPath({
      a: planner.a,
      b: planner.b,
      route: route.length >= 2 ? route : null,
      stopAt: stopAt / 100,
    });
    if (!built) {
      toast('The route is too short to bore.', { tone: 'danger' });
      return;
    }
    const { engine, store } = window.__landscapeLab;
    const result = boreTunnel({ engine, store, profile, path: built.path, endOpen: built.endOpen });
    if (result.bored === 0) {
      toast('The bore never breaks the surface — it still exists underground.', { tone: 'default' });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} testId="tunnel-planner" title="Plan Tunnel" width={4000}>
      <div className="ll-tunnel">
        <div className="ll-tunnel-profile">
          <div className="tk-section-title">Cross-section</div>
          <p className="ll-size-caption">Pick a preset or doodle the bore shape — it is smoothed, closed, and scaled to the width/height below.</p>
          <canvas
            ref={profileCanvasRef}
            className="ll-tunnel-profile-canvas"
            data-testid="tunnel-profile"
            width={340}
            height={250}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              strokeRef.current = [profilePoint(event)];
              bump((value) => value + 1);
            }}
            onPointerMove={(event) => {
              if (!strokeRef.current) return;
              strokeRef.current.push(profilePoint(event));
              bump((value) => value + 1);
            }}
            onPointerUp={() => {
              const stroke = strokeRef.current;
              strokeRef.current = null;
              if (stroke && stroke.length >= 8) {
                setSource({ kind: 'doodle', points: stroke.map(([x, y]) => [x, -y]) });
              }
              bump((value) => value + 1);
            }}
          />
          <div className="ll-tunnel-presets">
            {[['arch', 'Arch'], ['round', 'Round'], ['box', 'Box']].map(([kind, label]) => (
              <Button
                key={kind}
                kind={source.kind === 'preset' && source.preset === kind ? 'primary' : 'secondary'}
                onClick={() => setSource({ kind: 'preset', preset: kind })}
                testId={`tunnel-preset-${kind}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <RuleSlider label="Width" max={16} min={2} step={0.5} value={width} onChange={setWidth} />
          <RuleSlider label="Height" max={12} min={2} step={0.5} value={height} onChange={setHeight} />
          <RuleSlider
            label="Bore %"
            max={100}
            min={15}
            step={5}
            value={stopAt}
            onChange={setStopAt}
            title="100% drills through to the end point; less stops short — a dead-end cave with a closed back wall."
          />
          <p className="ll-size-caption">
            {stopAt >= 100
              ? 'Bores all the way through - both ends open.'
              : `Stops at ${stopAt}% of the route - a dead-end cave.`}
          </p>
        </div>
        <div className="ll-generate-map">
          <div className="tk-section-title">Route</div>
          <p className="ll-size-caption">A → B is straight by default — doodle on the map to curve the route (ends stay pinned to your clicked points). Depth ramps evenly from A to B.</p>
          <canvas
            ref={routeCanvasRef}
            className="ll-generate-canvas"
            data-testid="tunnel-route"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              routeStrokeRef.current = true;
              setRoute([[planner.a.x, planner.a.z], routePoint(event)]);
            }}
            onPointerMove={(event) => {
              if (!routeStrokeRef.current || event.buttons !== 1) return;
              const point = routePoint(event);
              setRoute((current) => [...current, point]);
            }}
            onPointerUp={() => {
              routeStrokeRef.current = false;
              setRoute((current) => [...current, [planner.b.x, planner.b.z]]);
            }}
          />
          <div className="ll-generate-mapactions">
            <Button kind="secondary" onClick={() => setRoute([])} testId="tunnel-route-reset">Straight route</Button>
            <span className="ll-manager-count">{route.length >= 2 ? 'Doodled route' : 'Straight route'}</span>
            <span style={{ flex: 1 }} />
            <Button kind="secondary" onClick={onClose}>Cancel</Button>
            <Button kind="primary" onClick={bore} testId="tunnel-bore">Bore tunnel</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Photoshop canvas-size, generalized: pick the new tile grid, then drag the
// existing tile block anywhere inside it. Existing terrain keeps its world
// position; new tiles come in flat.
function TerrainSizeModal({ actions, onClose }) {
  const field = window.__landscapeLab?.store?.getDocument?.()?.field;
  const oldX = field?.tilesX ?? 2;
  const oldZ = field?.tilesZ ?? 2;
  const tileMeters = field ? Math.round(field.quadsPerTile * field.spacing) : 64;
  const [tilesX, setTilesX] = useState(oldX);
  const [tilesZ, setTilesZ] = useState(oldZ);
  // K = the kept slice's position along each axis, in [0, |new − old|]. It is
  // the ONE draggable quantity whether an axis grows (block slides inside the
  // new grid) or shrinks (the crop window slides over the old block).
  const [kept, setKept] = useState({ x: 0, z: 0 });
  const [grab, setGrab] = useState(null);

  const spanX = Math.abs(tilesX - oldX);
  const spanZ = Math.abs(tilesZ - oldZ);
  const place = (cellX, cellZ, grip) => {
    setKept({
      x: clampInt(cellX - grip.x, 0, spanX),
      z: clampInt(cellZ - grip.z, 0, spanZ),
    });
  };
  const setSize = (axis, value) => {
    const next = clampInt(value, 1, MAX_TERRAIN_TILES);
    if (axis === 'x') {
      setTilesX(next);
      setKept((current) => ({ ...current, x: clampInt(current.x, 0, Math.abs(next - oldX)) }));
    } else {
      setTilesZ(next);
      setKept((current) => ({ ...current, z: clampInt(current.z, 0, Math.abs(next - oldZ)) }));
    }
  };

  useEffect(() => {
    if (!grab) return undefined;
    const end = () => setGrab(null);
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, [grab]);

  const sizeOptions = () => Array.from(
    { length: MAX_TERRAIN_TILES },
    (_, index) => ({ label: `${index + 1} tiles`, value: String(index + 1) }),
  );

  // Canvas covers the union of old block and new grid.
  const canvasW = Math.max(tilesX, oldX);
  const canvasD = Math.max(tilesZ, oldZ);
  const windowPos = { x: tilesX >= oldX ? 0 : kept.x, z: tilesZ >= oldZ ? 0 : kept.z };
  const blockPos = { x: tilesX >= oldX ? kept.x : 0, z: tilesZ >= oldZ ? kept.z : 0 };
  const cropping = tilesX < oldX || tilesZ < oldZ;

  const cells = [];
  for (let cz = 0; cz < canvasD; cz += 1) {
    for (let cx = 0; cx < canvasW; cx += 1) {
      const inWindow = cx >= windowPos.x && cx < windowPos.x + tilesX
        && cz >= windowPos.z && cz < windowPos.z + tilesZ;
      const inBlock = cx >= blockPos.x && cx < blockPos.x + oldX
        && cz >= blockPos.z && cz < blockPos.z + oldZ;
      const state = inWindow && inBlock ? 'kept'
        : inBlock ? 'cropped'
          : inWindow ? 'new' : 'empty';
      cells.push(
        <button
          key={`${cx},${cz}`}
          type="button"
          className="ll-size-cell"
          data-state={state}
          data-testid={`size-cell-${cx}-${cz}`}
          title={state === 'kept' ? 'Kept terrain — drag to reposition'
            : state === 'cropped' ? 'This slice would be CROPPED away — drag to keep it instead'
              : state === 'new' ? 'New flat tiles' : ''}
          onPointerDown={() => {
            const grip = { x: cx - kept.x, z: cz - kept.z };
            setGrab(grip);
            place(cx, cz, grip);
          }}
          onPointerEnter={() => {
            if (grab) place(cx, cz, grab);
          }}
        />,
      );
    }
  }

  return (
    <Modal onClose={onClose} testId="terrain-size" title="Terrain Size" width={560}>
      <div className="ll-size">
        <div className="ll-size-row">
          <label className="ll-rule-row">
            <span className="ll-rule-label">Width</span>
            <Select onChange={(value) => setSize('x', Number(value))} options={sizeOptions()} testId="size-tiles-x" value={String(tilesX)} />
          </label>
          <label className="ll-rule-row">
            <span className="ll-rule-label">Depth</span>
            <Select onChange={(value) => setSize('z', Number(value))} options={sizeOptions()} testId="size-tiles-z" value={String(tilesZ)} />
          </label>
        </div>
        <p className="ll-size-caption">
          {tilesX}×{tilesZ} tiles · {tilesX * tileMeters}×{tilesZ * tileMeters} m — drag the highlighted
          block (your current {oldX}×{oldZ} terrain). Bright = kept, plain = new flat tiles
          {cropping ? ', dim = cropped away' : ''}.
        </p>
        <div
          className="ll-size-grid"
          data-testid="size-grid"
          style={(() => {
            // Tiles are square terrain tiles — render them square whatever
            // the canvas shape: pick the largest square cell that fits the
            // 320px box in both axes and size the grid explicitly (explicit
            // px rows/columns also sidestep Safari's uneven auto-row
            // distribution).
            const gap = 3;
            const cell = Math.floor(Math.min(
              (320 - gap * (canvasW - 1)) / canvasW,
              (320 - gap * (canvasD - 1)) / canvasD,
            ));
            return {
              gridTemplateColumns: `repeat(${canvasW}, ${cell}px)`,
              gridTemplateRows: `repeat(${canvasD}, ${cell}px)`,
              width: `${cell * canvasW + gap * (canvasW - 1)}px`,
              height: `${cell * canvasD + gap * (canvasD - 1)}px`,
            };
          })()}
        >
          {cells}
        </div>
        <div className="ll-size-actions">
          <Button kind="secondary" onClick={onClose}>Cancel</Button>
          <Button
            kind="primary"
            disabled={tilesX === oldX && tilesZ === oldZ}
            testId="size-apply"
            onClick={() => {
              const result = actions.resizeTerrain({
                tilesX,
                tilesZ,
                offsetTilesX: tilesX >= oldX ? kept.x : -kept.x,
                offsetTilesZ: tilesZ >= oldZ ? kept.z : -kept.z,
              });
              if (result.ok) onClose();
            }}
          >
            {cropping ? 'Resize terrain' : 'Expand terrain'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo, canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onRedo: () => actions.redo(), onUndo: () => actions.undo(),
    viewItems: [
      { icon: 'info', label: 'Landscape Guide', onSelect: () => setGuideOpen(true) },
      { label: 'Resize Terrain…', onSelect: () => setResizeOpen(true) },
      { label: 'Generate Landscape…', onSelect: () => setGenerateOpen(true) },
    ],
  });
  return (
    <LabEditorHeader className="ll-topbar" menus={menus}>
      <BrandLockup labName="Landscape Lab" />
      <button
        type="button"
        className="ll-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}<Icon name="chevron-down" />
      </button>
      <span className="ll-topbar-spacer" />
      <IconButton icon="info" label="Guide — every tool, plus cave/water/tunnel recipes" onClick={() => setGuideOpen(true)} testId="open-guide" />
      <RendererToggle />
      {menuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onOpenResize={() => {
            setMenuAnchor(null);
            setResizeOpen(true);
          }}
          onOpenGenerate={() => {
            setMenuAnchor(null);
            setGenerateOpen(true);
          }}
          state={state}
        />
      )}
      {resizeOpen && <TerrainSizeModal actions={actions} onClose={() => setResizeOpen(false)} />}
      {generateOpen && <GenerateModal actions={actions} onClose={() => setGenerateOpen(false)} state={state} />}
      {state.tunnelPlanner && (
        <TunnelModal
          actions={actions}
          onClose={() => actions.closeTunnelPlanner()}
          planner={state.tunnelPlanner}
          state={state}
        />
      )}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </LabEditorHeader>
  );
}

function ModeRail({ actions, state }) {
  return (
    <nav className="ll-rail tk" data-testid="mode-rail">
      <button
        type="button"
        className="ll-rail-stage"
        data-active={state.tool === 'orbit'}
        data-testid="rail-camera"
        title="Camera — puts the active tool down; left-drag then navigates (choose Rotate, Pan, or Zoom in the bar above the viewport)."
        onClick={() => actions.setTool('orbit')}
      >
        <Icon name="tool-move" />
        <span>Camera</span>
      </button>
      <div className="ll-rail-divider" />
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className="ll-rail-stage"
          data-active={state.mode === mode.id}
          data-testid={`mode-${mode.id}`}
          title={`${mode.label} mode (${mode.key})`}
          onClick={() => actions.setMode(mode.id)}
        >
          <Icon name={mode.icon} />
          <span>{mode.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Floating camera bar above the viewport (the water-lab convention): the
// segmented control maps what an unarmed left-drag does.
function CameraBar({ actions, engine, state }) {
  return (
    <div className="ll-camerabar tk" data-testid="camera-bar">
      <span>Camera</span>
      <SegmentedControl
        onChange={(cameraMode) => actions.setCameraMode(cameraMode)}
        options={[
          { label: 'Rotate', value: 'rotate' },
          { label: 'Pan', value: 'pan' },
          { label: 'Zoom', value: 'zoom' },
        ]}
        testId="camera-mode"
        value={state.cameraMode}
      />
      <IconButton icon="reset" label="Reset camera" onClick={() => engine.resetCamera()} />
      <Button kind="secondary" onClick={() => engine.setCameraView('top')} testId="camera-top">Top</Button>
      <Button kind="secondary" onClick={() => engine.setCameraView('low')} testId="camera-low">Low</Button>
      <span className="ll-camerabar-hint">Left-drag selected mode · wheel zoom · right-drag pan · right-drag rotates while a tool is armed</span>
    </div>
  );
}

// Floating tool palette to the right of the rail (the tree-lab convention):
// clicking the active tool puts it down and returns to camera navigation.
function ToolStrip({ actions, state }) {
  const tools = TOOLS_BY_MODE[state.mode] ?? [];
  // A single-tool mode needs no picker — entering the mode already armed it
  // (the Camera rail button puts it down).
  if (tools.length <= 1) return null;
  return (
    <div className="ll-toolstrip tk" data-testid="tool-strip">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="ll-tool"
          data-active={state.tool === tool.id}
          data-testid={`tool-${tool.id}`}
          title={`${tool.label} — ${tool.hint} Click again to put the tool down.`}
          onClick={() => actions.setTool(state.tool === tool.id ? 'orbit' : tool.id)}
        >
          <Icon name={tool.icon} />
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );
}

// Imported layer images are downscaled to keep the embedded data-url (and
// therefore the exported project document) small.
async function readImageAsDataUrl(file, maxSize = 512) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read the image.'));
      img.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The four paintable SURFACE TYPES of the terrain (ToonLab calls these "target
// layers"): pick which surface the brush paints, edit its tint inline, and
// assign its texture — the picker offers presets that fit the selected
// surface (a Grass surface lists grasses/ground covers, not cliff rock),
// plus your own generated/imported textures.
function TargetLayers({ actions, library, state }) {
  const selectedLayer = state.materialLayers[state.paintLayer];
  const textureValue = selectedLayer?.textureRef?.kind === 'texgen'
    ? selectedLayer.textureRef.presetId
    : selectedLayer?.textureRef?.kind === 'pro-texture'
      ? `pro:${selectedLayer.textureRef.jobId}`
      : selectedLayer?.textureRef?.kind === 'data-url' ? '__imported' : '';

  async function importLayerImage() {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      actions.setLayerTexture(state.paintLayer, { kind: 'data-url', dataUrl });
    } catch (error) {
      toast(error.message, { tone: 'danger' });
    }
  }

  return (
    <section className="tk-section">
      <div className="tk-section-title">Surface Types</div>
      <div className="tk-section-caption">The brush paints the selected surface; tint and texture below define how it looks.</div>
      <div className="ll-layer-list">
        {LANDSCAPE_LAYER_DEFAULTS.map((layer, index) => (
          <button
            key={layer.id}
            type="button"
            className="ll-layer-row"
            data-active={state.paintLayer === index}
            data-testid={`layer-${layer.id}`}
            onClick={() => actions.setPaintLayer(index)}
          >
            <ColorWell
              size="small"
              value={state.settings[LAYER_TINT_KEYS[index]]}
              onChange={(value) => actions.setSetting(LAYER_TINT_KEYS[index], value)}
            />
            <span className="ll-layer-name">{layer.label}</span>
            {state.materialLayers[index]?.textureRef && <Icon name="pin" />}
            {state.paintLayer === index && <Icon name="check" />}
          </button>
        ))}
      </div>
      <div className="ll-layer-texture" data-testid="layer-texture">
        <label className="ll-rule-row" title="Tileable albedo for this layer — a texgen preset or your own image; tint multiplies over it.">
          <span className="ll-rule-label">Texture</span>
          <Select
            onChange={(value) => {
              if (value === '__import') importLayerImage();
              else if (value === '') actions.setLayerTexture(state.paintLayer, null);
              else if (value.startsWith('pro:')) actions.setLayerTexture(state.paintLayer, { kind: 'pro-texture', jobId: value.slice(4) });
              else actions.setLayerTexture(state.paintLayer, { kind: 'texgen', presetId: value });
            }}
            options={[
              { label: 'None (flat tint)', value: '' },
              ...texgenOptionsForSurface(LANDSCAPE_LAYER_DEFAULTS[state.paintLayer]?.id)
                .map((preset) => ({ label: preset.label, value: preset.id })),
              ...(library?.textures ?? []).map((texture) => ({
                label: `Yours · ${texture.label}`,
                value: `pro:${texture.jobId}`,
              })),
              ...(textureValue === '__imported' ? [{ label: 'Imported image', value: '__imported' }] : []),
              // A texgen ref from outside the surface's suggestions (or set
              // before this filter existed) must stay selectable.
              ...(selectedLayer?.textureRef?.kind === 'texgen'
                && !texgenOptionsForSurface(LANDSCAPE_LAYER_DEFAULTS[state.paintLayer]?.id)
                  .some((preset) => preset.id === selectedLayer.textureRef.presetId)
                ? [{ label: `Current · ${selectedLayer.textureRef.presetId}`, value: selectedLayer.textureRef.presetId }]
                : []),
              { label: 'Import image…', value: '__import' },
            ]}
            testId="layer-texture-select"
            value={textureValue}
          />
        </label>
        {selectedLayer?.textureRef && (
          <RuleSlider
            label="Tex Scale"
            max={2}
            min={0.02}
            step={0.01}
            title="World-space repeats per meter for this layer's texture."
            value={selectedLayer.repeat}
            onChange={(repeat) => actions.setLayerRepeat(state.paintLayer, repeat)}
          />
        )}
      </div>
    </section>
  );
}

function RuleSlider({ label, max, min, onChange, step = 0.05, value, title }) {
  return (
    <label className="ll-rule-row" title={title}>
      <span className="ll-rule-label">{label}</span>
      <Slider max={max} min={min} onChange={onChange} step={step} value={value} />
      <span className="ll-rule-value">{Number(value).toFixed(2)}</span>
    </label>
  );
}

function builtinGlyphName(entry) {
  return entry.source?.kind === 'builtin' && entry.source.builtinId?.startsWith('rock')
    ? 'stage-shape'
    : 'tool-leaves';
}

// Full-screen palette manager: current palette on the left (toggle/remove),
// a searchable asset browser on the right — Built-in always, My Library and
// Gallery when signed in on Pro (ToonLab's foliage-palette add/remove workflow).
function PaletteManagerModal({ actions, library, onClose, state }) {
  // Every source is always listed — picking WHERE you search is the point.
  // Library/Gallery show a sign-in empty state when the Pro endpoints are
  // absent instead of hiding.
  const tabs = [
    { label: 'Built-in', value: 'builtin', title: 'Procedural assets that ship with the lab' },
    { label: 'Saved in Labs', value: 'labs', title: 'Trees, grass, and rocks you saved in the other labs in this browser — no export/import needed' },
    { label: 'My Library', value: 'library', title: 'Your saved generated assets (toonlab.io)' },
    { label: 'Gallery', value: 'gallery', title: 'Public assets from every creator (toonlab.io)' },
  ];
  const [tab, setTab] = useState(library ? 'library' : 'builtin');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (tab === 'builtin') {
      setResults(BUILTIN_FOLIAGE_ENTRIES
        .filter((entry) => !needle || entry.label.toLowerCase().includes(needle))
        .map((entry) => ({ builtin: entry })));
      return undefined;
    }
    if (tab === 'labs') {
      setResults(listLocalLabAssets()
        .filter((entry) => !needle || entry.label.toLowerCase().includes(needle))
        .map((entry) => ({ labEntry: entry })));
      return undefined;
    }
    if (tab === 'library' && !library) {
      // Signed out / OSS: the personal library needs a Pro session. The
      // GALLERY is public and searches regardless.
      setResults(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (tab === 'gallery') {
        // The gallery searches BOTH: ToonLab public creations and the Poly
        // Haven CC0 model catalog (the OSS gallery's source).
        const [creations, polyhaven] = await Promise.all([
          searchProAssets({ scope: 'gallery', q: query.trim() }),
          searchPolyhavenModels({ q: query.trim() }),
        ]);
        if (cancelled) return;
        if (creations === null && polyhaven === null) setResults(null);
        else {
          setResults([
            ...(creations ?? []).map((model) => ({ model })),
            ...(polyhaven ?? []).map((ph) => ({ ph })),
          ]);
        }
        setLoading(false);
        return;
      }
      const assets = await searchProAssets({ scope: tab, q: query.trim() });
      if (cancelled) return;
      // null = source unreachable (distinct from "no matches").
      setResults(assets === null ? null : assets.map((model) => ({ model })));
      setLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, query, library]);

  function addResult(result) {
    const entry = result.builtin
      ? JSON.parse(JSON.stringify(result.builtin))
      : result.labEntry
        ? JSON.parse(JSON.stringify(result.labEntry))
        : result.ph
          ? paletteEntryFromPolyhaven(result.ph)
          : paletteEntryFromLibraryModel(result.model);
    const added = actions.addPaletteEntry(entry);
    if (!added.ok) for (const error of added.errors) toast(error, { tone: 'danger' });
  }

  function resultId(result) {
    if (result.builtin) return result.builtin.id;
    if (result.labEntry) return result.labEntry.id;
    if (result.ph) return `ph-${result.ph.polyhavenId}`;
    return `pro-${result.model.creationId}`;
  }

  return (
    <Modal onClose={onClose} testId="palette-manager" title="Foliage Palette" width={4000}>
      <div className="ll-manager">
        <aside className="ll-manager-current">
          <div className="ll-manager-heading">In palette · {state.palette.length}</div>
          <div className="ll-manager-list">
            {state.palette.map((entry) => (
              <div key={entry.id} className="ll-manager-row" data-testid={`manager-entry-${entry.id}`}>
                {entry.thumbnail
                  ? <img alt="" className="ll-manager-thumb" src={entry.thumbnail} />
                  : <span className="ll-manager-glyph"><Icon name={builtinGlyphName(entry)} /></span>}
                <span className="ll-manager-name" title={entry.label}>{entry.label}</span>
                <Toggle
                  checked={entry.active !== false}
                  onChange={(active) => actions.updatePaletteEntry(entry.id, { active })}
                  testId={`manager-active-${entry.id}`}
                />
                <IconButton
                  icon="trash"
                  label="Remove — also erases every painted instance of this asset (undoable)"
                  onClick={() => actions.removePaletteEntry(entry.id)}
                />
              </div>
            ))}
            {state.palette.length === 0 && (
              <p className="ll-library-empty">Palette is empty — add assets from the browser on the right.</p>
            )}
          </div>
        </aside>
        <section className="ll-manager-browser">
          <div className="ll-manager-controls">
            <SegmentedControl onChange={setTab} options={tabs} testId="manager-tabs" value={tab} />
            <input
              type="text"
              className="tk-text-field ll-manager-search"
              data-testid="manager-search"
              placeholder={tab === 'builtin' ? 'Search built-in assets…'
                : tab === 'library' ? 'Search your saved props…'
                  : 'Search public gallery props…'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {results && <span className="ll-manager-count">{results.length} result{results.length === 1 ? '' : 's'}</span>}
          </div>
          <div className="ll-library-grid ll-manager-results">
            {(results ?? []).map((result) => {
              const added = state.palette.some((entry) => entry.id === resultId(result));
              const label = result.builtin?.label ?? result.labEntry?.label ?? result.ph?.label ?? result.model.label;
              const thumbnail = result.ph?.thumbnailUrl ?? result.model?.thumbnailUrl ?? null;
              return (
                <button
                  key={resultId(result)}
                  type="button"
                  className="ll-library-tile"
                  disabled={added}
                  title={added ? 'Already in the palette' : `Add ${label} to the palette`}
                  onClick={() => addResult(result)}
                >
                  {thumbnail
                    ? <img alt="" className="ll-palette-thumb" src={thumbnail} />
                    : (
                      <span className="ll-palette-glyph">
                        <Icon name={result.builtin ? builtinGlyphName(result.builtin) : 'drawer'} />
                      </span>
                    )}
                  <span className="ll-palette-name">{label}</span>
                  {result.model?.owner && <span className="ll-manager-owner">by {result.model.owner}</span>}
                  {result.labEntry?.origin && <span className="ll-manager-owner">{result.labEntry.origin}</span>}
                  {result.ph && <span className="ll-manager-owner">Poly Haven CC0</span>}
                  {added && <span className="ll-library-added">In palette</span>}
                </button>
              );
            })}
            {!loading && results === null && (
              <p className="ll-library-empty">
                {tab === 'library'
                  ? 'Your library is available on toonlab.io when signed in.'
                  : 'Couldn’t reach the public gallery from this build — open the lab on toonlab.io (or run the local Pro server) to browse it.'}
              </p>
            )}
            {!loading && results && results.length === 0 && (
              <p className="ll-library-empty">
                {tab === 'builtin'
                  ? 'No built-in assets match.'
                  : tab === 'labs'
                    ? 'Nothing saved yet — presets you save in Tree Lab, Grass Lab, and Rock Lab (this browser) appear here.'
                    : tab === 'library'
                      ? 'Nothing found — generate a model and save it to your library, then it appears here.'
                      : 'No public gallery assets match.'}
              </p>
            )}
            {loading && <p className="ll-library-empty">Searching…</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ToonLab foliage palette: checkbox-activated asset tiles + per-mesh settings for
// the selected tile.
function FoliagePalette({ actions, library, state }) {
  const [managerOpen, setManagerOpen] = useState(false);
  const selected = state.palette.find((entry) => entry.id === state.selectedPaletteId)
    ?? state.palette[0]
    ?? null;
  return (
    <section className="tk-section">
      <div className="tk-section-title">Foliage Palette</div>
      <div className="tk-section-caption">Checked assets paint together; select a tile to edit its rules. Shift-drag erases.</div>
      <div className="ll-library-row">
        <Button icon="plus" kind="secondary" onClick={() => setManagerOpen(true)} testId="manage-palette">
          Manage palette…
        </Button>
      </div>
      {managerOpen && (
        <PaletteManagerModal
          actions={actions}
          library={library}
          onClose={() => setManagerOpen(false)}
          state={state}
        />
      )}
      <div className="ll-palette-grid" data-testid="foliage-palette">
        {state.palette.map((entry) => (
          <div
            key={entry.id}
            className="ll-palette-tile"
            data-selected={selected?.id === entry.id}
            data-testid={`palette-${entry.id}`}
          >
            <button
              type="button"
              className="ll-palette-body"
              onClick={() => actions.selectPaletteEntry(entry.id)}
              title={entry.label}
            >
              {entry.thumbnail
                ? <img alt="" className="ll-palette-thumb" src={entry.thumbnail} />
                : <span className="ll-palette-glyph"><Icon name={entry.source?.kind === 'builtin' && entry.source.builtinId?.startsWith('rock') ? 'stage-shape' : 'tool-leaves'} /></span>}
              <span className="ll-palette-name">{entry.label}</span>
            </button>
            <span className="ll-palette-check" title="Include in the paint brush">
              <Toggle
                checked={entry.active !== false}
                onChange={(active) => actions.updatePaletteEntry(entry.id, { active })}
                testId={`palette-active-${entry.id}`}
              />
            </span>
          </div>
        ))}
      </div>
      {selected && (
        <div className="ll-rules" data-testid="palette-rules">
          <div className="ll-rules-header">
            <span>{selected.label}</span>
            <IconButton
              icon="trash"
              label="Remove from palette (also erases its painted instances)"
              onClick={() => actions.removePaletteEntry(selected.id)}
            />
          </div>
          <RuleSlider
            label="Density"
            max={1}
            min={0.005}
            step={0.005}
            title="Instances per square meter at full brush coverage."
            value={selected.density}
            onChange={(density) => actions.updatePaletteEntry(selected.id, { density })}
          />
          <RuleSlider
            label="Min Spacing"
            max={10}
            min={0}
            title="No two instances of this asset closer than this (meters)."
            value={selected.rules.minSpacing}
            onChange={(minSpacing) => actions.updatePaletteEntry(selected.id, { rules: { minSpacing } })}
          />
          <RuleSlider
            label="Scale Min"
            max={3}
            min={0.2}
            value={selected.rules.scaleRange[0]}
            onChange={(value) => actions.updatePaletteEntry(selected.id, {
              rules: { scaleRange: [value, Math.max(value, selected.rules.scaleRange[1])] },
            })}
          />
          <RuleSlider
            label="Scale Max"
            max={3}
            min={0.2}
            value={selected.rules.scaleRange[1]}
            onChange={(value) => actions.updatePaletteEntry(selected.id, {
              rules: { scaleRange: [Math.min(value, selected.rules.scaleRange[0]), value] },
            })}
          />
          <RuleSlider
            label="Max Slope"
            max={2}
            min={0}
            title="Reject placements steeper than this rise-over-run."
            value={selected.rules.maxSlope}
            onChange={(maxSlope) => actions.updatePaletteEntry(selected.id, { rules: { maxSlope } })}
          />
          <RuleSlider
            label="Align to Slope"
            max={1}
            min={0}
            title="0 keeps instances upright; higher tilts them into the surface."
            value={selected.rules.alignToSlope}
            onChange={(alignToSlope) => actions.updatePaletteEntry(selected.id, { rules: { alignToSlope } })}
          />
          <label className="ll-rule-row" title="How this asset relates to water: avoid it, ignore it, plant only on submerged ground (kelp), or float on the surface (lily pads).">
            <span className="ll-rule-label">Water</span>
            <Select
              onChange={(waterPlacement) => actions.updatePaletteEntry(selected.id, {
                rules: { waterPlacement, avoidWater: waterPlacement === 'avoid' },
              })}
              options={[
                { label: 'Avoid water', value: 'avoid' },
                { label: 'Ignore water', value: 'any' },
                { label: 'Riverbed only', value: 'bed' },
                { label: 'Float on surface', value: 'surface' },
              ]}
              value={selected.rules.waterPlacement
                ?? (selected.rules.avoidWater !== false ? 'avoid' : 'any')}
            />
          </label>
        </div>
      )}
    </section>
  );
}

function Inspector({ actions, library, state }) {
  const mode = MODES.find((entry) => entry.id === state.mode) ?? MODES[0];
  return (
    <aside className="ll-inspector tk" data-testid="inspector">
      <h2 className="ll-inspector-header" data-testid="inspector-title">{mode.label}</h2>
      {state.mode === 'sculpt' && (
        <>
          <LandscapeSchemaGroup actions={actions} groupId="brush" settings={state.settings} />
          {state.tool === 'hole' && (
            <label className="ll-rule-row ll-hole-mode" data-testid="hole-mode" title="Dry cave: the opening also suppresses the stage water. Water-filled: the water plane shows through (wells, lake pits).">
              <span className="ll-rule-label">Hole fills</span>
              <SegmentedControl
                onChange={(value) => actions.setHoleDry(value === 'dry')}
                options={[
                  { label: 'Dry cave', value: 'dry' },
                  { label: 'Water-filled', value: 'wet' },
                ]}
                value={state.holeDry ? 'dry' : 'wet'}
              />
            </label>
          )}
        </>
      )}
      {state.mode === 'paint' && (
        <>
          <LandscapeSchemaGroup
            actions={actions}
            fieldFilter={(field) => BRUSH_TRIPLET.has(field.key)}
            groupId="brush"
            settings={state.settings}
          />
          <TargetLayers actions={actions} library={library} state={state} />
          <LandscapeSchemaGroup
            actions={actions}
            fieldFilter={(field) => !field.key.endsWith('Tint')}
            groupId="material"
            settings={state.settings}
          />
        </>
      )}
      {state.mode === 'foliage' && (
        <>
          <LandscapeSchemaGroup
            actions={actions}
            fieldFilter={(field) => BRUSH_TRIPLET.has(field.key)}
            groupId="brush"
            settings={state.settings}
          />
          <LandscapeSchemaGroup actions={actions} groupId="foliage" settings={state.settings} />
          <FoliagePalette actions={actions} library={library} state={state} />
        </>
      )}
    </aside>
  );
}

function LandscapePreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar hint="[ and ] resize the brush · Shift inverts · right-drag orbits while painting">
      <PreviewToggle
        checked={state.walkPreview}
        label="Walk"
        onChange={(walkPreview) => actions.setWalkPreview(walkPreview)}
        testId="stage-walk"
        title="Walk the terrain: WASD/arrows move, Shift runs, Space jumps. Collides with painted foliage — and your tools keep working while you walk."
      />
      {state.walkPreview && (
        <SegmentedControl
          onChange={(walkCamera) => actions.setWalkCamera(walkCamera)}
          options={[
            { label: 'Free', value: 'third', title: 'Free orbit — the camera only follows while you move' },
            { label: 'Follow', value: 'follow', title: 'Locked third-person: the character stays centered, drag orbits around them (full up/down range)' },
            { label: '1st', value: 'first', title: 'First-person view — drag to look around (full up/down range)' },
          ]}
          testId="walk-camera"
          value={state.walkCamera}
        />
      )}
      <PreviewToggle
        checked={state.settings.showWater}
        label="Water"
        onChange={(showWater) => actions.setSetting('showWater', showWater)}
        testId="stage-water"
        title="Translucent stage water plane at the water level"
      />
      <span className="tk-previewbar-slider" title="Stage water level (also drives Avoid-water foliage rules)">
        <span>Level</span>
        <Slider
          max={10}
          min={-10}
          onChange={(waterLevel) => actions.setSetting('waterLevel', waterLevel)}
          step={0.05}
          value={state.settings.waterLevel}
        />
      </span>
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const doc = window.__landscapeLab?.store?.getDocument?.();
  const field = doc?.field;
  return (
    <footer className="ll-status tk" data-testid="status-bar">
      <span className="ll-status-message">{state.status}</span>
      <span className="ll-status-spacer" />
      <span className="ll-status-meta">
        {field ? `${field.tilesX}×${field.tilesZ} tiles · ${field.gridW}×${field.gridD}` : ''}
        {state.foliageTotal ? ` · ${state.foliageTotal} foliage` : ''}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [library, setLibrary] = useState(null);

  useEffect(() => { document.title = `${state.name} — Landscape Lab`; }, [state.name]);
  // Pro asset library probe — null on OSS/signed-out, so the library UI
  // simply never appears there.
  useEffect(() => {
    let cancelled = false;
    detectProAssetLibrary().then((result) => {
      if (!cancelled) setLibrary(result);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="tk">
      <div className="ll-root">
        <TopBar actions={actions} state={state} />
        <ModeRail actions={actions} state={state} />
        <ToolStrip actions={actions} state={state} />
        <CameraBar actions={actions} engine={engine} state={state} />
        <Inspector actions={actions} library={library} state={state} />
        <StatusBar state={state} />
      </div>
      <LandscapePreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
