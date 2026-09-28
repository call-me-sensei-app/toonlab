import { useEffect, useMemo, useState } from 'react';

import {
  getRockgenPresetOptions,
  getRockgenStyleOptions,
  isRockHelperPiece,
  ROCKGEN_SETTING_FIELD_SCHEMA,
  ROCKGEN_SETTING_GROUPS,
} from '../../../src/rockgen/index.js';
import { pickFile } from '../../shared/download.js';
import { isLabEditorLocation, syncLabHomeRoute } from '../../shared/labViewRouting.js';
import '../../shared/siteHeader.js';
import {
  BrandLockup,
  Button,
  Icon,
  IconButton,
  LabEditorHeader,
  PresetRowShell,
  PreviewBar,
  RendererToggle,
  SchemaGroup,
  SearchSelect,
  SegmentedControl,
  Select,
  StyleBundlePicker,
  TextField,
  ToastStack,
  Toggle,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import {
  ROCK_VARIATION_CATALOG,
  ROCK_VARIATION_FAMILIES,
  getRockVariationCatalogEntry,
  loadRockVariationCatalog,
  searchRockVariationCatalog,
} from './catalog.js';
import { ROCK_PRESET_THUMBNAILS } from './thumbnailAssets.js';
import { createC8CustomMeshCatalogEntry } from './catalogSourceMesh.js';
import {
  catalogSurfacePresetValue,
  CATALOG_SURFACE_PRESET_OPTIONS,
  CATALOG_TOP_FINISH_OPTIONS,
  ROCK_GENERATION_PREVIEW_RESOLUTIONS,
} from './store.js';

const GROUPS = Object.fromEntries(ROCKGEN_SETTING_GROUPS.map((entry) => [entry.id, entry]));
const CATALOG_TOP_FIELD_KEYS = new Set([
  'topColor',
  'topCoatStrength',
  'topHeightStart',
  'topSlopeStart',
]);
const CATALOG_PBR_FIELD_KEYS = new Set([
  'pbrNormalStrength',
  'pbrRoughness',
  'pbrTexturePreset',
  'pbrTextureScale',
]);
const CATALOG_WEATHERING_FIELD_KEYS = new Set([
  'lichenColor',
  'lichenCoverage',
  'mossColor',
  'mossCoverage',
  'stainColor',
  'stainStrength',
  'textureScale',
  'veinColor',
  'veinStrength',
]);
const SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Primitive proportions, landform profile, and overall silhouette.',
    groups: ['shape', 'heightfield', 'falloff'],
    icon: 'stage-shape',
    id: 'form',
    label: 'Form',
  }),
  Object.freeze({
    description: 'Noise, planar cuts, fractures, strata, and column structure.',
    groups: ['noise', 'warp', 'cuts', 'facet', 'cracks', 'strata', 'columns'],
    icon: 'stage-detail',
    id: 'detail',
    label: 'Detail',
  }),
  Object.freeze({
    description: 'Baked first-party color zones and ambient occlusion.',
    groups: ['surface'],
    icon: 'stage-surface',
    id: 'surface',
    label: 'Surface',
  }),
  Object.freeze({
    description: 'Mesh quality, normals, and LOD settings.',
    groups: ['meshing'],
    icon: 'stage-export',
    id: 'mesh',
    label: 'Mesh',
  }),
]);
const CATALOG_TOOL_GROUPS = Object.freeze([
  { id: 'select', label: 'Select', icon: 'tool-component', description: 'Choose connected components or paint protected regions.', tools: ['select', 'mask'] },
  { id: 'transform', label: 'Transform', icon: 'tool-move', description: 'Move, resize, rotate, mirror, and place rock components.', tools: ['grab', 'resize', 'rotate', 'mirror', 'settle'] },
  { id: 'sculpt', label: 'Sculpt', icon: 'stage-detail', description: 'Reshape and weather the surface with brushes.', tools: ['inflate', 'clay', 'deflate', 'scrape', 'smooth', 'pinch', 'flatten', 'crack', 'roughen', 'erode', 'terrace'] },
  { id: 'cut', label: 'Cut & Join', icon: 'tool-fracture', description: 'Drill, slice, split, fill openings, and join rock shells.', tools: ['drill', 'trim', 'fracture', 'fill', 'union'] },
  { id: 'mesh', label: 'Mesh', icon: 'tool-remesh', description: 'Rebuild or change the mesh resolution.', tools: ['remesh', 'subdivide', 'decimate'] },
  { id: 'inspect', label: 'Inspect', icon: 'tool-measure', description: 'Measure the rock without changing it.', tools: ['measure'] },
]);
const SOURCE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Bounded deformation of the selected official catalog GLB.',
    icon: 'stage-shape',
    id: 'form',
    label: 'Variation',
  }),
  ...CATALOG_TOOL_GROUPS.filter((group) => group.id !== 'inspect'),
  Object.freeze({
    description: 'The same editable surface stack used by procedural rocks.',
    icon: 'stage-surface',
    id: 'surface',
    label: 'Surface',
  }),
  ...CATALOG_TOOL_GROUPS.filter((group) => group.id === 'inspect'),
]);
const CATALOG_MESH_TOOLS = Object.freeze([
  Object.freeze({ description: 'Move the brush center 1:1; high falloff moves a fully covered separate tier as one piece.', icon: 'tool-move', label: 'Grab / move', value: 'grab' }),
  Object.freeze({ description: 'Select one connected shell for move, resize, rotate, mirror, and settle.', icon: 'tool-component', label: 'Select component', value: 'select' }),
  Object.freeze({ description: 'Drag the visible side or corner handles to resize the rock.', icon: 'tool-size', label: 'Resize', value: 'resize' }),
  Object.freeze({ description: 'Drag sideways to rotate the selected connected rock or tier.', icon: 'tool-rotate', label: 'Rotate', value: 'rotate' }),
  Object.freeze({ description: 'Add volume along each vertex’s smoothed surface normal.', icon: 'tool-inflate', label: 'Inflate', value: 'inflate' }),
  Object.freeze({ description: 'Fill low areas toward a raised brush plane to build a broad clay pad.', icon: 'tool-clay', label: 'Clay build-up', value: 'clay' }),
  Object.freeze({ description: 'Carve volume inward along each vertex’s smoothed surface normal.', icon: 'tool-deflate', label: 'Deflate', value: 'deflate' }),
  Object.freeze({ description: 'Shave high points into a harder planar rock face.', icon: 'tool-scrape', label: 'Scrape / chisel', value: 'scrape' }),
  Object.freeze({ description: 'Average neighboring vertices to remove peaks and creases.', icon: 'tool-smooth', label: 'Smooth', value: 'smooth' }),
  Object.freeze({ description: 'Pull the surrounding surface inward to sharpen a ridge.', icon: 'tool-pinch', label: 'Pinch / crease', value: 'pinch' }),
  Object.freeze({ description: 'Move vertices toward the tangent plane locked at stroke start.', icon: 'tool-flatten', label: 'Flatten', value: 'flatten' }),
  Object.freeze({ description: 'Draw a narrow recessed fissure with concentrated falloff.', icon: 'tool-crack', label: 'Crack', value: 'crack' }),
  Object.freeze({ description: 'Add deterministic small-scale breakup along the surface normals.', icon: 'tool-roughen', label: 'Noise / roughen', value: 'roughen' }),
  Object.freeze({ description: 'Relax exposed vertices while lowering them like weathered material.', icon: 'tool-erode', label: 'Erode', value: 'erode' }),
  Object.freeze({ description: 'Quantize brushed heights into sedimentary ledges.', icon: 'tool-terrace', label: 'Terrace / strata', value: 'terrace' }),
  Object.freeze({ description: 'Carve a rough cavity by clicking or dragging, optionally all the way through.', icon: 'tool-drill', label: 'Drill', value: 'drill' }),
  Object.freeze({ description: 'Slice beneath the picked surface using the specified trim depth.', icon: 'tool-trim', label: 'Trim / slice', value: 'trim' }),
  Object.freeze({ description: 'Cut a persistent plane through the rock to separate its shell.', icon: 'tool-fracture', label: 'Split / fracture', value: 'fracture' }),
  Object.freeze({ description: 'Restore the nearest drilled opening while retaining later mesh edits.', icon: 'tool-fill-hole', label: 'Fill hole', value: 'fill' }),
  Object.freeze({ description: 'Boolean-union disconnected overlapping shells into one result.', icon: 'tool-union', label: 'Boolean union', value: 'union' }),
  Object.freeze({ description: 'Rebuild and relax topology toward your chosen triangle count.', icon: 'tool-remesh', label: 'Remesh', value: 'remesh' }),
  Object.freeze({ description: 'Split every triangle into four editable faces.', icon: 'tool-subdivide', label: 'Subdivide', value: 'subdivide' }),
  Object.freeze({ description: 'Reduce the current topology toward the chosen percentage of triangles.', icon: 'tool-decimate', label: 'Decimate', value: 'decimate' }),
  Object.freeze({ description: 'Reflect the selected connected component across the chosen local axis.', icon: 'tool-mirror', label: 'Mirror', value: 'mirror' }),
  Object.freeze({ description: 'Move the selected connected component down onto local ground level.', icon: 'tool-settle', label: 'Settle / ground', value: 'settle' }),
  Object.freeze({ description: 'Paint a protected region ignored by later deformation brushes.', icon: 'tool-mask', label: 'Mask / protect', value: 'mask' }),
  Object.freeze({ description: 'Click two points to report their world-space distance.', icon: 'tool-measure', label: 'Measure', value: 'measure' }),
]);
const CATALOG_RADIUS_TOOLS = new Set([
  'grab', 'inflate', 'clay', 'deflate', 'scrape', 'smooth', 'pinch', 'flatten', 'crack',
  'roughen', 'erode', 'terrace', 'drill', 'mask',
]);
const CATALOG_STRENGTH_TOOLS = new Set([
  'grab', 'inflate', 'clay', 'deflate', 'scrape', 'smooth', 'pinch', 'flatten', 'crack',
  'roughen', 'erode', 'terrace',
]);
const CATALOG_TOOL_HINTS = Object.freeze({
  decimate: 'Click a rock to reduce its triangle count toward the selected percentage. Topology validity may prevent reaching the exact target.',
  fill: 'Click near a drilled opening to fill it without discarding later sculpt edits.',
  fracture: 'Click the surface to split along a plane through that point. The cut will keep its position and direction.',
  mask: 'Drag over vertices to protect them from deformation brushes. Clear the mask to paint a new protected area.',
  measure: 'Click two surface points to measure their world-space distance.',
  mirror: 'Click a component to reflect it across the selected local axis.',
  remesh: 'Click to rebuild toward the target triangle count (0 keeps comparable density). Targets are approximate; high counts cost more memory and time.',
  rotate: 'Drag sideways to rotate the selected component without an angle limit.',
  select: 'Selection scopes move, resize, rotate, mirror, and settle. Topology tools act on the whole picked mesh.',
  settle: 'Click a component to place its lowest point on local ground.',
  subdivide: 'Click a rock to split every triangle into four editable faces.',
  trim: 'Click the surface to cut at its tangent plane.',
  union: 'Click a mesh to merge its overlapping disconnected shells.',
});

function editablePiece(document) {
  return document.pieces.find((piece) => !isRockHelperPiece(piece)) ?? document.pieces[0];
}

function fieldTarget(document, field) {
  return field.group === 'surface' || field.group === 'meshing'
    ? document
    : editablePiece(document);
}

function fieldValue(document, field) {
  return fieldTarget(document, field)?.[field.group]?.[field.key];
}

function disabledReason(document, field) {
  const group = fieldTarget(document, field)?.[field.group];
  if (!group) return 'This setting is unavailable for the current piece.';
  if (field.key !== 'enabled' && typeof group.enabled === 'boolean' && !group.enabled) {
    return 'Turn this generator stage on first.';
  }
  if (field.group === 'heightfield' && editablePiece(document).shape.type !== 'heightfield') {
    return 'Choose Heightfield as the base shape to use these settings.';
  }
  if (field.group === 'shape') {
    if (field.key === 'capsuleLength' && group.type !== 'capsule') return 'Capsule shapes only.';
    if (field.key === 'cornerRadius' && !['box', 'sketch'].includes(group.type)) {
      return 'Box and sketch shapes only.';
    }
  }
  return false;
}

function TopBar({ actions, engine, navigationMode, onNavigationMode, onExportInfo, state, editing = false }) {
  function promptName(prompt, initial = state.document.name) {
    return window.prompt(prompt, initial)?.trim() ?? '';
  }

  function saveAs() {
    const name = promptName('Save this rock as…');
    if (name && actions.saveLocalAs(name)) toast(`Saved “${name}”.`, { tone: 'success' });
  }

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) toast('Rock document imported.', { tone: 'success' });
    else toast(result.error, { tone: 'danger' });
  }

  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { icon: 'home', label: 'New / Open…', onSelect: () => actions.setHomeOpen(true) },
        {
          label: 'Rename…',
          onSelect: () => {
            const name = promptName('Rename this rock…');
            if (name) actions.setName(name);
          },
        },
        { separator: true },
        {
          id: state.selectedLocalId ? 'update-local' : 'save-local',
          icon: 'save',
          label: 'Save',
          onSelect: state.selectedLocalId ? actions.saveLocal : saveAs,
        },
        { id: 'save-local-as', label: 'Save As…', onSelect: saveAs },
        {
          id: 'delete-local',
          danger: true,
          disabled: !state.selectedLocalId,
          icon: 'trash',
          label: 'Delete Saved Version…',
          onSelect: () => {
            if (window.confirm('Delete this local save? The open document will remain available.')) {
              actions.deleteLocal();
            }
          },
        },
        { separator: true },
        { label: 'Import Document JSON…', onSelect: () => { void importJson(); } },
        { icon: 'download', label: 'Export Document JSON', onSelect: actions.exportJson },
        { label: 'Export settings & information…', onSelect: onExportInfo },
        {
          id: 'export-glb',
          disabled: state.exporting,
          icon: 'download',
          label: state.exporting
            ? 'Building GLB…'
            : state.document.reference?.sourceMode === 'c8-custom-mesh'
              ? 'Export Edited GLB (surface not baked)…'
              : 'Export GLB…',
          onSelect: actions.exportGlb,
        },
        { separator: true },
        {
          danger: true,
          icon: 'reset',
          label: 'Reset Editor…',
          onSelect: () => {
            if (window.confirm('Reset this editor to a new default rock? Unsaved changes will be lost.')) {
              actions.resetLab();
            }
          },
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { disabled: !state.canUndo, icon: 'undo', label: 'Undo', onSelect: actions.undo, shortcut: '⌘Z' },
        { disabled: !state.canRedo, icon: 'redo', label: 'Redo', onSelect: actions.redo, shortcut: '⇧⌘Z' },
        { separator: true },
        {
          disabled: ['meshEdits', 'meshCuts', 'meshSnapshots'].every((key) => !state.document.reference?.[key]?.length),
          icon: 'reset',
          label: 'Clear Mesh Edits',
          onSelect: actions.clearCatalogMeshEdits,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...['rotate', 'pan', 'zoom'].map((mode) => ({
          disabled: editing,
          checked: navigationMode === mode,
          label: `${mode[0].toUpperCase()}${mode.slice(1)} navigation`,
          onSelect: () => onNavigationMode(mode),
        })),
        { separator: true },
        { icon: 'reset', label: 'Reset Camera', onSelect: engine.resetCamera, shortcut: 'C' },
        { label: 'Frame selection / rock', onSelect: engine.frameSelection, shortcut: 'F' },
      ],
    },
  ];

  return (
    <LabEditorHeader className="rg-topbar" menus={menus}>
        <BrandLockup
          labName="Rock & Cliff Generation"
          onLabNameClick={() => actions.setHomeOpen(true)}
        />
        <span
          className="rg-title"
          data-testid="document-title"
          title={state.document.name}
        >
          {state.document.name}{state.dirty && <span className="rg-dirty">●</span>}
        </span>
        <span className="rg-topbar-spacer" />
        <StyleBundlePicker onChange={({ id }) => actions.applyStyleBundle(id)} />
        <RendererToggle supportedKinds={['webgpu', 'webgl']} />
    </LabEditorHeader>
  );
}

function RockHome({ actions, state }) {
  const [catalogQuery, setCatalogQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [limit, setLimit] = useState(72);
  const [savedId, setSavedId] = useState(state.selectedLocalId ?? '');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogError, setCatalogError] = useState('');
  const matches = useMemo(
    () => searchRockVariationCatalog({ family, text: catalogQuery }),
    [catalogQuery, family, catalogRevision],
  );
  useEffect(() => {
    let active = true;
    loadRockVariationCatalog().then(() => {
      if (active) setCatalogRevision((value) => value + 1);
    }).catch((error) => {
      if (active) setCatalogError(error.message);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { setLimit(72); }, [catalogQuery, family]);
  const savedOptions = state.library.length
    ? state.library.map((entry) => ({
      label: `${entry.name} — ${new Date(entry.updatedAt).toLocaleDateString()}`,
      value: entry.id,
    }))
    : [{ disabled: true, label: 'No saved rocks yet', value: '' }];
  const currentThumbnail = ROCK_PRESET_THUMBNAILS[state.document.preset]
    ?? ROCK_PRESET_THUMBNAILS.boulder;

  return (
    <>
    <toonlab-site-header active="labs" />
    <main className="rg-home tk" data-testid="rock-home-screen">
      <div className="rg-home__content">
        <section className="rg-home__hero">
          <div className="rg-home__hero-copy">
            <span className="rg-home__eyebrow">Rock &amp; Cliff Generation · First-party source geometry</span>
            <h1>Shape production-ready stone.</h1>
            <p>
              Start with a designed formation or load any of ToonLab’s
              {` ${ROCK_VARIATION_CATALOG.length || 580}`} Gallery rock GLBs as the source for a bounded variation.
              Every result remains deterministic and ready for runtime JSON or GLB export.
            </p>
            <div className="rg-home__hero-tags" aria-label="Rock generation capabilities">
              <span>Editable topology</span>
              <span>Deterministic variations</span>
              <span>Runtime GLB + JSON</span>
            </div>
          </div>
          <button
            className="rg-home__resume"
            data-testid="home-continue"
            onClick={() => actions.setHomeOpen(false)}
            type="button"
          >
            <img alt="" src={currentThumbnail} />
            <span className="rg-home__resume-shade" />
            <span className="rg-home__resume-copy">
              <small>Current editable draft</small>
              <strong>{state.document.name}</strong>
              <span>Continue in the rock editor <Icon name="play" /></span>
            </span>
          </button>
        </section>

        {state.library.length > 0 ? (
          <section className="rg-home__section rg-home__saved-section">
            <div className="rg-home__section-title">
              <div>
                <span className="rg-home__section-kicker">Your library</span>
                <h2>Saved projects</h2>
                <p>Search and reopen an editable local rock document.</p>
              </div>
              <strong>{state.library.length} saved</strong>
            </div>
            <div className="rg-home__saved">
              <SearchSelect
                onChange={setSavedId}
                options={savedOptions}
                testId="home-saved-search"
                value={savedId}
              />
              <Button
                disabled={!savedId}
                kind="primary"
                onClick={() => { if (actions.loadLocal(savedId)) actions.setHomeOpen(false); }}
                testId="home-open-saved"
              >
                Open project
              </Button>
            </div>
          </section>
        ) : (
          <div className="rg-home__empty-library">
            <Icon name="stage-export" />
            <div>
              <strong>No saved projects yet</strong>
              <span>Use Save As in the editor and your rocks will appear here.</span>
            </div>
          </div>
        )}

        <section className="rg-home__section">
          <div className="rg-home__section-title">
            <div>
              <span className="rg-home__section-kicker">Procedural generation</span>
              <h2>Generate without a physical template</h2>
              <p>Choose a procedural shape preset, then edit every generator stage.</p>
            </div>
            <strong>{getRockgenPresetOptions().length} presets</strong>
          </div>
          <div className="rg-home__preset-grid">
            {getRockgenPresetOptions().map((entry) => (
              <button
                key={entry.value}
                className="rg-home__preset-card"
                type="button"
                onClick={() => { actions.applyPreset(entry.value); actions.setHomeOpen(false); }}
              >
                <img
                  alt={`${entry.label} procedural rock preview`}
                  loading="lazy"
                  src={ROCK_PRESET_THUMBNAILS[entry.value] ?? ROCK_PRESET_THUMBNAILS.boulder}
                />
                <span className="rg-home__card-copy">
                  <strong>{entry.label}</strong>
                  <small>Editable procedural foundation</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rg-home__section rg-home__catalog-section">
        <div className="rg-home__section-title">
          <div>
            <span className="rg-home__section-kicker">Template-based procedural generation</span>
            <h2>Stylized rock catalog</h2>
            <p>Choose one of {ROCK_VARIATION_CATALOG.length || 580} physical rock templates as the starting mesh, then procedurally reshape and finish it in the editor.</p>
          </div>
          <strong data-testid="catalog-result-count">{matches.length} matches</strong>
        </div>
        <div className="rg-home__filters">
          <input
            aria-label="Search the rock catalog"
            className="tk-text-field"
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Search by template ID, file, family, geology, or tag…"
            type="search"
            value={catalogQuery}
          />
          <Select
            onChange={setFamily}
            options={[{
              label: `All ${ROCK_VARIATION_FAMILIES.length} families`,
              value: 'all',
            }, ...ROCK_VARIATION_FAMILIES]}
            testId="catalog-family-filter"
            value={family}
          />
        </div>
        <div className="rg-home__catalog-grid" data-testid="variation-catalog">
          {catalogError && <p role="alert">Gallery unavailable: {catalogError}</p>}
          {matches.slice(0, limit).map((entry) => (
            <button
              key={entry.id}
              className="rg-home__catalog-card"
              data-family={entry.familyId}
              data-geology={entry.geology ?? 'unclassified'}
              onClick={() => actions.startCatalogVariation(entry.id)}
              title={`${entry.label} · ${entry.file} · ${entry.geology ?? 'unclassified'} · ${entry.tags.join(', ')}`}
              type="button"
            >
              <img
                alt={`${entry.label} Gallery preview`}
                loading="lazy"
                src={entry.thumbnailUrl}
              />
              <span className="rg-home__card-copy">
                <strong>{entry.label}</strong>
                <small>{entry.variationId}</small>
                <small>{entry.familyLabel} · {entry.geology ?? 'unclassified'}</small>
                {entry.natureProvenance ? <small className="rg-home__nature-badge">Nature referenced</small> : null}
              </span>
            </button>
          ))}
        </div>
        {matches.length > limit && (
          <Button kind="secondary" onClick={() => setLimit(limit + 72)} testId="catalog-more">
            Show more ({matches.length - limit} remaining)
          </Button>
        )}
        </section>
      </div>
    </main>
    </>
  );
}

function SectionRail({ active, onChange, onSculptChange, sculpt, sourceMesh = false }) {
  const sections = sourceMesh ? SOURCE_SECTIONS : SECTIONS;
  return (
    <nav className="rg-rail tk" data-testid="section-rail" aria-label="Rock tools">
      {sections.map((section) => {
        const tools = section.tools?.map((value) => CATALOG_MESH_TOOLS.find((tool) => tool.value === value));
        const columns = Math.min(3, tools?.length ?? 1);
        return (
          <div className="rg-rail-section" key={section.id}>
            <button
              type="button"
              className="rg-rail-stage"
              data-active={active === section.id}
              aria-pressed={active === section.id}
              data-testid={`section-${section.id}`}
              onClick={() => onChange(section.id)}
              title={`${section.label} — ${section.description}`}
            >
              <Icon name={section.icon} />
              <span>{section.label}</span>
            </button>
            {sourceMesh && active === section.id && tools ? (
              <div
                aria-label={`${section.label} tools`}
                className="rg-sculpt-tool-menu"
                data-testid="catalog-sculpt-tool"
                data-tool-group={section.id}
                role="group"
                style={{ '--rg-tool-columns': columns }}
              >
                {tools.map((tool, index) => (
                  <button
                    key={tool.value}
                    aria-label={`${tool.label}. ${tool.description}`}
                    aria-pressed={sculpt.tool === tool.value}
                    className="rg-sculpt-tool-button"
                    data-active={sculpt.tool === tool.value}
                    data-testid={`catalog-sculpt-tool-${tool.value}`}
                    onClick={() => onSculptChange({ tool: tool.value })}
                    style={{ '--rg-tooltip-columns': columns - (index % columns) }}
                    title={`${tool.label} — ${tool.description}`}
                    type="button"
                  >
                    <Icon name={tool.icon} />
                    <span aria-hidden="true" className="rg-sculpt-tool-tooltip" role="tooltip">
                      <strong>{tool.label}</strong>
                      <small>{tool.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function GeneratorControls({ actions, state }) {
  const presets = getRockgenPresetOptions();
  const presetValue = state.document.preset ?? 'custom';
  const presetOptions = state.document.preset === null
    ? [{ disabled: true, label: 'Custom document', value: 'custom' }, ...presets]
    : presets;
  const styles = getRockgenStyleOptions();
  return (
    <div className="rg-generator-controls">
      <PresetRowShell label="Preset" title="Switching presets starts a new deterministic procedural document.">
        <Select
          onChange={(value) => { if (value !== 'custom') actions.applyPreset(value); }}
          options={presetOptions}
          testId="preset-select"
          value={presetValue}
        />
      </PresetRowShell>
      <div className="rg-quick-field">
        <span>Style</span>
        <Select
          onChange={actions.applyStyle}
          options={styles}
          testId="style-select"
          value={state.document.style}
        />
      </div>
      <div className="rg-quick-field">
        <span>Seed</span>
        <div className="rg-quick-field__row">
          <TextField
            key={state.document.seed}
            onCommit={actions.setSeed}
            testId="seed-input"
            value={String(state.document.seed)}
          />
          <IconButton icon="dice" label="Randomize seed" onClick={actions.randomizeSeed} />
        </div>
      </div>
      <div className="rg-quick-field">
        <span>Preview resolution</span>
        <Select
          onChange={actions.setResolution}
          options={ROCK_GENERATION_PREVIEW_RESOLUTIONS}
          testId="resolution-select"
          value={state.document.meshing.previewResolution}
        />
      </div>
    </div>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = SECTIONS.find((entry) => entry.id === sectionId) ?? SECTIONS[0];
  return (
    <aside className="rg-inspector tk" data-testid="inspector">
      <GeneratorControls actions={actions} state={state} />
      <div className="rg-inspector-divider" />
      <h2>{section.label}</h2>
      <p>{section.description}</p>
      {section.groups.map((groupId) => (
        <SchemaGroup
          key={groupId}
          fields={ROCKGEN_SETTING_FIELD_SCHEMA[groupId]}
          getValue={(field) => fieldValue(state.document, field)}
          group={GROUPS[groupId]}
          fieldFilter={(field) => groupId !== 'surface' || !CATALOG_PBR_FIELD_KEYS.has(field.key)}
          isDisabled={(field) => disabledReason(state.document, field)}
          onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
        />
      ))}
    </aside>
  );
}

function validNatureUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function NatureEvidenceCard({ provenance }) {
  if (!provenance) return null;
  const sourceUrl = validNatureUrl(provenance.sourcePageUrl);
  const licenseUrl = validNatureUrl(provenance.photoLicenseUrl);
  const credit = [provenance.author, provenance.photoLicense].filter(Boolean).join(' · ');
  return (
    <section className="rg-nature-evidence" data-testid="nature-evidence">
      <div>
        <strong>Nature evidence</strong>
        <span>Morphology reference — not a copied texture</span>
        {sourceUrl ? (
          <a href={sourceUrl} rel="noreferrer" target="_blank">
            {provenance.title || 'Open nature source'} ↗
          </a>
        ) : <b>{provenance.title || 'Nature source recorded'}</b>}
        {credit ? (
          licenseUrl
            ? <a className="rg-nature-evidence__credit" href={licenseUrl} rel="noreferrer" target="_blank">{credit} ↗</a>
            : <small>{credit}</small>
        ) : null}
        {provenance.featureRationale ? <p>{provenance.featureRationale}</p> : null}
      </div>
    </section>
  );
}

function CatalogSourceInspector({ actions, engine, entry, onSculptChange, sculpt, sectionId, state }) {
  entry = { ...entry, thumbnailUrl: state.templateThumbnailUrl || entry.thumbnailUrl };
  const toolGroup = CATALOG_TOOL_GROUPS.find((group) => group.id === sectionId);
  const customC8 = entry.sourceMode === 'c8-custom-glb';
  const maximumVariationPercent = customC8
    ? Math.round(entry.maxVariationStrength * 100)
    : 100;
  const strength = Math.round((state.document.reference?.variation ?? 0) * 100);
  const storedTopFinish = state.document.reference?.topFinish ?? 'source';
  const topFinish = storedTopFinish === 'source' ? 'bare' : storedTopFinish;
  const finishOptions = topFinish === 'custom'
    ? [...CATALOG_TOP_FINISH_OPTIONS, { disabled: true, label: 'Custom surface', value: 'custom' }]
    : CATALOG_TOP_FINISH_OPTIONS;
  const surfacePreset = catalogSurfacePresetValue(state.document);
  const surfacePresetOptions = surfacePreset === 'custom'
    ? [...CATALOG_SURFACE_PRESET_OPTIONS, { disabled: true, label: 'Custom', value: 'custom' }]
    : CATALOG_SURFACE_PRESET_OPTIONS;
  const usesAuthoredGlbSurface = state.document.style === 'call_me_sensei'
    || state.document.reference?.surfaceMode === 'source';

  if (sectionId === 'output') return (
    <aside className="rg-inspector tk" data-testid="catalog-output-inspector">
      <TemplateCard entry={entry} detail="Output & portability" />
      <h2>Save & export</h2>
      <p>The editable JSON preserves the template, variation settings, sculpted geometry, and holes. Local drafts autosave; Save creates a named library entry.</p>
      <Button onClick={() => { const name = window.prompt('Save this rock as…', state.document.name); if (name) actions.saveLocalAs(name); }}>Save to local library…</Button>
      <Button onClick={actions.exportJson}>Export editable JSON</Button>
      <Button disabled={state.exporting} onClick={actions.exportGlb}>Export edited GLB</Button>
      <h3>Surface status</h3>
      <p>{state.document.reference?.surfacePackage
        ? 'Geology is reprojected onto edits for the live preview. This is not a high-to-low bake; do not assume the exported GLB reproduces the preview shader in another engine.'
        : 'The GLB carries compatible materials and texture maps. Runtime shader effects may differ in other engines.'}</p>
      <h3>Production readiness</h3>
      <p>Preview grass is not exported. Mesh edits do not automatically generate and qualify a new LOD0–LOD4 ladder or collision mesh. Review those before production use.</p>
    </aside>
  );

  if (sectionId === 'surface') {
    return (
      <aside className="rg-inspector tk" data-testid="catalog-surface-inspector">
        <div className="rg-source-card">
          {entry.thumbnailUrl && <img alt={`${entry.label} template preview`} src={entry.thumbnailUrl} />}
          <div>
            <span>Editable GLB surface</span>
            <strong>{entry.label}</strong>
            <small>Geometry and UVs stay unchanged</small>
          </div>
        </div>
        <h2>{customC8 ? 'C7 surface reprojection' : 'Surface & top finish'}</h2>
        <p>
          {customC8
            ? 'This reapplies the deterministic metre-triplanar geology recipe to the edited control mesh for preview/runtime use. It is not a Blender high-to-low texture bake, and exporting the GLB does not create portable baked maps.'
            : 'Keep the generated GLB material, select a real Texture Lab PBR map set, or apply the procedural surface stack to this GLB.'}
        </p>
        {!customC8 ? <div className="rg-quick-field">
          <span>Top finish</span>
          <Select
            onChange={actions.applyCatalogTopFinish}
            options={finishOptions}
            testId="catalog-top-finish"
            value={topFinish}
          />
        </div> : null}
        <div className="rg-quick-field">
          <span>Surface preset</span>
          <Select
            onChange={actions.applyCatalogSurfacePreset}
            options={surfacePresetOptions}
            testId="catalog-surface-preset"
            value={surfacePreset}
          />
        </div>
        <div className="rg-inspector-divider" />
        {!customC8 ? <SchemaGroup
          fieldFilter={(field) => CATALOG_PBR_FIELD_KEYS.has(field.key)}
          fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
          getValue={(field) => fieldValue(state.document, field)}
          group={{
            ...GROUPS.surface,
            description: 'Tileable albedo, normal, and roughness maps generated from a Texture Lab material recipe.',
            label: 'PBR texture maps',
          }}
          isDisabled={(field) => (
            field.key !== 'pbrTexturePreset' && state.document.surface.pbrTexturePreset === 'none'
              ? 'Select a texture map first.'
              : false
          )}
          onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
        /> : null}
        <div className="rg-grass-preview" data-testid="catalog-grass-preview">
          <div className="rg-grass-preview__header">
            <div>
              <strong>Preview meadow grass</strong>
              <span>Surface-following Call Me Sensei clumps</span>
            </div>
            <Toggle
              checked={state.grassPreview.enabled}
              onChange={(enabled) => actions.setCatalogGrassPreview({ enabled })}
              testId="catalog-grass-preview-toggle"
            />
          </div>
          <p>
            Preview only. Clumps plant on actual upward-facing triangles and sample the rock beneath
            them, so grass follows the GLB, top finish, vertex colors, and selected PBR texture.
          </p>
          <div className="rg-grass-preview__controls">
            {[
              ['density', 'Density', 0, 240, 1, (value) => `${Math.round(value)} / m²`],
              ['coverage', 'Coverage', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['bladeHeight', 'Blade height', 0.02, 0.5, 0.01, (value) => `${value.toFixed(2)} m`],
              ['heightStart', 'Top height start', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['slopeStart', 'Upward slope', 0, 1, 0.01, (value) => value.toFixed(2)],
              ['spacing', 'Minimum spacing', 0, 0.4, 0.005, (value) => `${value.toFixed(3)} m`],
              ['uprightness', 'Uprightness', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['colorAdaptation', 'Surface color adaptation', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['windStrength', 'Wind strength', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['maxClumps', 'Clump limit', 20, 1200, 20, (value) => Math.round(value).toLocaleString()],
            ].map(([key, label, min, max, step, format]) => (
              <label key={key}>
                <span>{label} <strong>{format(state.grassPreview[key])}</strong></span>
                <input
                  aria-label={`Grass preview ${label.toLowerCase()}`}
                  disabled={!state.grassPreview.enabled}
                  max={max}
                  min={min}
                  onChange={(event) => actions.setCatalogGrassPreview({ [key]: Number(event.target.value) })}
                  step={step}
                  type="range"
                  value={state.grassPreview[key]}
                />
              </label>
            ))}
          </div>
          <small>
            {state.grassPreviewStats.clumps.toLocaleString()} clumps · {state.grassPreviewStats.blades.toLocaleString()} blades · excluded from GLB export
          </small>
        </div>
        {!customC8 && usesAuthoredGlbSurface ? (
          <>
            <SchemaGroup
              fieldFilter={(field) => CATALOG_TOP_FIELD_KEYS.has(field.key)}
              fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
              getValue={(field) => fieldValue(state.document, field)}
              group={{
                ...GROUPS.surface,
                description: 'Masks grass, sand, snow, or another tint to upward-facing cap vertices only.',
                label: 'Top finish mask',
              }}
              isDisabled={(field) => disabledReason(state.document, field)}
              onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
            />
            <SchemaGroup
              fieldFilter={(field) => CATALOG_WEATHERING_FIELD_KEYS.has(field.key)}
              fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
              getValue={(field) => fieldValue(state.document, field)}
              group={{
                ...GROUPS.surface,
                description: 'Optional mineral veins, rain stains, moss, and lichen layered over the authored material.',
                label: 'Weathering overlays',
              }}
              isDisabled={(field) => disabledReason(state.document, field)}
              onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
            />
          </>
        ) : !customC8 ? (
          <SchemaGroup
            fieldFilter={(field) => !CATALOG_PBR_FIELD_KEYS.has(field.key)}
            fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
            getValue={(field) => fieldValue(state.document, field)}
            group={GROUPS.surface}
            isDisabled={(field) => disabledReason(state.document, field)}
            onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
          />
        ) : null}
      </aside>
    );
  }

  if (toolGroup) {
    const sculptEditCount = state.document.reference?.meshEdits?.length ?? 0;
    const drillCutCount = state.document.reference?.meshCuts?.length ?? 0;
    const topologySnapshotCount = state.document.reference?.meshSnapshots?.length ?? 0;
    const editCount = sculptEditCount + drillCutCount + topologySnapshotCount;
    const selectedTool = CATALOG_MESH_TOOLS.find((tool) => tool.value === sculpt.tool);
    return (
      <aside className="rg-inspector tk" data-testid="catalog-sculpt-inspector">
        <div className="rg-source-card">
          {entry.thumbnailUrl && <img alt={`${entry.label} template preview`} src={entry.thumbnailUrl} />}
          <div>
            <span>Decoded editable mesh</span>
            <strong>{entry.label}</strong>
            <small>
              {sculptEditCount} sculpt edit{sculptEditCount === 1 ? '' : 's'} · {drillCutCount} drill cut{drillCutCount === 1 ? '' : 's'} · {topologySnapshotCount} topology mesh{topologySnapshotCount === 1 ? '' : 'es'}
            </small>
          </div>
        </div>
        <h2>{toolGroup.label}</h2>
        <p className="rg-edit-state">{state.selectionSummary ?? 'Selection: whole brush area'} · {state.maskSummary ?? 'No protected vertices'}</p>
        <p>
          <strong>{selectedTool?.label}.</strong> {selectedTool?.description}
          {' '}{toolGroup.id === 'inspect'
            ? 'Measurements are in world metres and do not change the mesh.'
            : toolGroup.id === 'select'
              ? 'Choose a component or protect vertices before editing.'
              : 'Geometry edits are included in local saves, JSON, undo, and GLB export.'}
        </p>
        <div className="rg-sculpt-controls">
          {['rotate', 'mirror', 'fracture'].includes(sculpt.tool) && <label>
            <span>{sculpt.tool === 'fracture' ? 'Cut plane normal' : 'Axis'}</span>
            <select aria-label={`${sculpt.tool} axis`} value={sculpt[`${sculpt.tool}Axis`] ?? (sculpt.tool === 'fracture' ? 'surface' : sculpt.tool === 'rotate' ? 'y' : 'x')}
              onChange={(event) => onSculptChange({ [`${sculpt.tool}Axis`]: event.target.value })}>
              {sculpt.tool === 'fracture' && <option value="surface">Automatic from surface</option>}
              <option value="x">Local X</option><option value="y">Local Y</option><option value="z">Local Z</option>
            </select>
          </label>}
          {sculpt.tool === 'fracture' && <label><span>Fracture gap (m)</span>
            <input aria-label="Fracture gap" type="number" min="0.001" step="0.01" value={sculpt.fractureGap ?? 0.075}
              onChange={(event) => onSculptChange({ fractureGap: Number(event.target.value) })} />
          </label>}
          {sculpt.tool === 'decimate' && <label><span>Triangles to keep (%)</span>
            <input aria-label="Triangles to keep" type="number" min="0" max="100" step="any" value={sculpt.decimatePercent ?? 50}
              onChange={(event) => onSculptChange({ decimatePercent: Number(event.target.value) })} />
          </label>}
          {sculpt.tool === 'remesh' && <label><span>Target triangles (0 = current density)</span>
            <input aria-label="Remesh target triangles" type="number" min="0" step="100" value={sculpt.remeshTarget ?? 0}
              onChange={(event) => onSculptChange({ remeshTarget: Number(event.target.value) })} />
          </label>}
          {CATALOG_STRENGTH_TOOLS.has(sculpt.tool) && sculpt.tool !== 'grab' && <>
            <label className="rg-sculpt-toggle-row"><span>Limit deformation</span>
              <Toggle checked={Boolean(sculpt.protectDeformation)} testId="catalog-brush-limit-deformation"
                onChange={(protectDeformation) => onSculptChange({ protectDeformation })} />
            </label>
            <p className="rg-sculpt-hint">Hold to build up; drag to paint. Limits off allows large edits and overlapping faces. Smooth/Flatten converge on a target; use Move for cursor-following displacement.</p>
          </>}
          {sculpt.tool === 'trim' && <label>
            <span>Trim depth <strong>{sculpt.trimDepth.toFixed(2)} m</strong></span>
            <input type="number" aria-label="Trim depth" min="0.001" step="0.05" value={sculpt.trimDepth}
              onChange={(event) => onSculptChange({ trimDepth: Number(event.target.value) })} />
          </label>}
          {CATALOG_RADIUS_TOOLS.has(sculpt.tool) ? (
            <label>
              <span>Brush radius <strong>{sculpt.radius.toFixed(2)} m</strong></span>
              <input
                aria-label="Sculpt brush radius"
                min="0.01"
                onChange={(event) => onSculptChange({ radius: Number(event.target.value) })}
                step="0.05"
                type="number"
                value={sculpt.radius}
              />
            </label>
          ) : null}
          {sculpt.tool === 'drill' ? (
            <>
              <label>
                <span>Wall roughness <strong>{Math.round(sculpt.drillRoughness * 100)}%</strong></span>
                <input
                  aria-label="Drill wall roughness"
                  max="1"
                  min="0"
                  onChange={(event) => onSculptChange({ drillRoughness: Number(event.target.value) })}
                  step="0.05"
                  type="range"
                  value={sculpt.drillRoughness}
                />
              </label>
              <label>
                <span>Hole depth <strong>{sculpt.drillDepth.toFixed(2)} m</strong></span>
                <input
                  aria-label="Drill hole depth"
                  disabled={sculpt.drillThrough}
                  min="0.01"
                  onChange={(event) => onSculptChange({ drillDepth: Number(event.target.value) })}
                  step="0.05"
                  type="number"
                  value={sculpt.drillDepth}
                />
              </label>
              <div className="rg-sculpt-toggle-row">
                <span>Drill all the way through</span>
                <Toggle
                  checked={sculpt.drillThrough}
                  onChange={(drillThrough) => onSculptChange({ drillThrough })}
                  testId="catalog-drill-through"
                />
              </div>
            </>
          ) : CATALOG_STRENGTH_TOOLS.has(sculpt.tool) ? (
            <label>
              <span>
                {sculpt.tool === 'grab' ? 'Falloff' : 'Strength'}
                <strong>{sculpt.tool === 'grab' ? `${Math.round(sculpt.strength * 100)}%` : `${sculpt.strength.toFixed(2)}×`}</strong>
              </span>
              <input
                aria-label="Sculpt brush strength"
                max={sculpt.tool === 'grab' ? '1' : undefined}
                min="0"
                onChange={(event) => onSculptChange({ strength: Number(event.target.value) })}
                step="0.05"
                type={sculpt.tool === 'grab' ? 'range' : 'number'}
                value={sculpt.strength}
              />
            </label>
          ) : null}
          {sculpt.tool === 'grab' ? <>
            <label className="rg-sculpt-toggle-row">
              <span>Prevent face folding</span>
              <Toggle checked={Boolean(sculpt.preventFaceFlips)}
                onChange={(preventFaceFlips) => onSculptChange({ preventFaceFlips })}
                testId="catalog-grab-prevent-folds" />
            </label>
            <p className="rg-sculpt-hint">Off: unrestricted dragging; faces may stretch or overlap. On: stops before faces turn past their starting orientation. Use Select component to move a whole rock or tier.</p>
          </> : null}
          {sculpt.tool === 'resize' ? <>
            <div className="rg-resize-modes" role="group" aria-label="Resize mode">
              <button type="button" aria-pressed={sculpt.resizeProportional !== false} onClick={() => onSculptChange({ resizeProportional: true })}>Proportional</button>
              <button type="button" aria-pressed={sculpt.resizeProportional === false} onClick={() => onSculptChange({ resizeProportional: false })}>Free</button>
            </div>
            <p className="rg-sculpt-hint">Drag a handle on the rock’s outline. Proportional keeps its shape; Free stretches the side or corner you drag. The opposite side stays fixed. Click a rock part to select it.</p>
            <Button kind="secondary" onClick={() => engine.clearSculptSelection()}>Resize whole mesh</Button>
          </> : null}
          {CATALOG_TOOL_HINTS[sculpt.tool] ? (
            <p className="rg-sculpt-hint">{CATALOG_TOOL_HINTS[sculpt.tool]}</p>
          ) : null}
          {sculpt.tool === 'select' ? (
            <Button icon="reset" kind="secondary" onClick={() => engine.clearSculptSelection()} testId="catalog-selection-clear">
              Clear selection
            </Button>
          ) : null}
          {sculpt.tool === 'mask' ? (
            <Button icon="reset" kind="secondary" onClick={() => engine.clearSculptMasks()} testId="catalog-mask-clear">
              Clear mask
            </Button>
          ) : null}
          {!['inspect', 'select'].includes(toolGroup.id) ? (
            <Button
              disabled={editCount === 0}
              icon="reset"
              kind="secondary"
              onClick={actions.clearCatalogMeshEdits}
              testId="catalog-sculpt-reset"
            >
              Reset mesh edits
            </Button>
          ) : null}
        </div>
        <div className="rg-inspector-divider" />
        <p className="rg-source-note">
          Hover over any floating tool icon for its name and behavior.
          {toolGroup.id === 'cut' && ' With Drill, click for one bore or drag to carve a connected freeform opening.'}
          {' '}Alt + left-drag or arrow keys orbit; right-drag pans; wheel zooms. Click the viewport to focus keyboard shortcuts. F frames the selection or rock. Camera shortcuts finish the current stroke before moving the view.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rg-inspector tk" data-testid="catalog-source-inspector">
      <div className="rg-source-card">
        {entry.thumbnailUrl && <img alt={`${entry.label} template preview`} src={entry.thumbnailUrl} />}
        <div>
          <span>{customC8 ? 'Content-bound C8 control GLB' : 'Official Gallery GLB source'}</span>
          <strong>{entry.label}</strong>
          <small>{entry.variationId} · {entry.geology ?? 'unclassified'}</small>
        </div>
      </div>
      <NatureEvidenceCard provenance={entry.natureProvenance} />
      <h2>Template variation</h2>
      <p>
        This starts from the exact {customC8 ? 'hash-verified C8 control' : 'first-party ToonLab Gallery'} GLB and decodes it before editing.
        Variation deforms the decoded vertices while preserving topology and material slots.
        The asset’s deterministic geology maps and current rock shader are reapplied after every rebuild.
      </p>
      <div className="rg-source-controls">
        <label>
          <span>Variation strength <strong>{strength}%</strong></span>
          <input
            aria-label="Catalog variation strength"
            disabled={state.comparingOriginal}
            max={maximumVariationPercent}
            min="0"
            onChange={(event) => actions.setCatalogVariationStrength(Number(event.target.value) / 100)}
            onPointerDown={actions.beginVariationGesture}
            onPointerUp={actions.endVariationGesture}
            onPointerCancel={actions.endVariationGesture}
            onBlur={actions.endVariationGesture}
            step="1"
            type="range"
            value={strength}
          />
        </label>
        <Button kind="secondary" onClick={() => engine.setComparison(!state.comparingOriginal)}>
          {state.comparingOriginal ? 'Return to current rock' : 'Compare with original'}
        </Button>
        <Button icon="dice" kind="primary" onClick={actions.varyCurrentRock} disabled={state.comparingOriginal}>
          Vary current rock
        </Button>
        <Button kind="secondary" onClick={() => {
          if (window.confirm('Create a fresh variation from the template? This replaces the current edits and surface settings. Save a named copy first to keep both. Undo can restore the current rock.')) actions.regenerateCatalogVariation();
        }}>Fresh variation from template…</Button>
        <VariationAdvanced actions={actions} reference={state.document.reference} disabled={state.comparingOriginal} />
        <DimensionControls actions={actions} dimensions={state.meshDimensions} disabled={state.comparingOriginal} />
        <p role="status">{state.comparingOriginal ? 'Original shape in the current surface style — read-only. Edits and export still refer to your current rock.' : 'Variation affects the current edited rock. Existing holes and edits are retained.'}</p>
        <span className="rg-source-origin">{customC8 ? 'C8 editable source' : 'Gallery release'} · {entry.sourceVersion}</span>
      </div>
      <div className="rg-inspector-divider" />
      <p className="rg-source-note">
        SDF shape, cut, and noise controls apply only to procedural presets. They are hidden here because
        replacing this mesh with a preset would no longer be a variation of the selected asset. Surface edits
        and mesh edits remain available because they work directly on the decoded GLB.
      </p>
    </aside>
  );
}

function TemplateCard({ entry, detail }) {
  return <div className="rg-source-card">
    {entry.thumbnailUrl && <img alt={`${entry.label} template preview`} src={entry.thumbnailUrl} />}
    <div><strong>{entry.label}</strong><small>{detail}</small></div>
  </div>;
}

function DimensionControls({ actions, dimensions, disabled }) {
  const [values, setValues] = useState({});
  useEffect(() => { setValues(Object.fromEntries(Object.entries(dimensions ?? {}).map(([key, value]) => [key, Number(value.toFixed(3))]))); }, [dimensions]);
  if (!dimensions) return null;
  return <details className="rg-variation-advanced"><summary>Exact dimensions</summary>
    <fieldset disabled={disabled}>
      <p>Resize the current mesh independently of variation strength. The bottom stays at its current height.</p>
      {['width', 'height', 'depth'].map((key) => <label key={key}>{key} (m)<input aria-label={`Target ${key} metres`} type="number" min="0.001" step="0.1"
        value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
      <Button onClick={() => actions.resizeCatalogDimensions(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])))}>Apply dimensions</Button>
    </fieldset>
  </details>;
}

function VariationAdvanced({ actions, reference, disabled }) {
  const settings = reference?.variationSettings ?? {};
  const update = (patch) => actions.setCatalogVariationOptions({ settings: patch });
  return <details className="rg-variation-advanced">
    <summary>Advanced shape controls</summary>
    <fieldset disabled={disabled}>
      <label>Seed<input aria-label="Variation seed" type="number" min="0" step="1" value={reference.variationSeed}
        onChange={(event) => actions.setCatalogVariationOptions({ seed: Number(event.target.value) })} /></label>
      <label>Deformation frame<select aria-label="Variation scope" value={settings.scope ?? 'whole'} onChange={(event) => update({ scope: event.target.value })}>
        <option value="whole">Whole rock</option><option value="component">Each connected component</option>
      </select></label>
      <label><input type="checkbox" checked={settings.anchorBase !== false} onChange={(event) => update({ anchorBase: event.target.checked })} /> Anchor base height</label>
      <p>Shape values blend with overall strength. Empty fields use the seed. Explicit values stay fixed; locks retain automatic values when rerolling.</p>
      {[
        ['width', 'Width proportion ×', 0.01], ['height', 'Height proportion ×', 0.01], ['depth', 'Depth proportion ×', 0.01],
        ['leanX', 'Lean X / height', null], ['leanZ', 'Lean Z / height', null], ['twist', 'Twist radians', null],
        ['taper', 'Taper', null], ['bulge', 'Bulge', null], ['noiseAmplitude', 'Irregularity amount', 0], ['noiseFrequency', 'Irregularity frequency', 0.01],
      ].map(([key, label, min]) => <div className="rg-variation-field" key={key}>
        <label>{label}<input type="number" aria-label={label} placeholder="Auto" min={min ?? undefined} step="0.05" value={settings[key] ?? ''}
          onPointerDown={actions.beginVariationGesture} onPointerUp={actions.endVariationGesture} onBlur={actions.endVariationGesture}
          onChange={(event) => update({ [key]: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label title={`Keep ${label} when rerolling`}><input type="checkbox" aria-label={`Lock ${label}`} checked={Boolean(settings.locks?.[key])}
          onChange={(event) => update({ locks: { ...settings.locks, [key]: event.target.checked } })} /> Lock</label>
      </div>)}
    </fieldset>
  </details>;
}

function StatusBar({ state }) {
  const stats = state.meshStats;
  return (
    <footer className="rg-status tk" data-testid="status-bar">
      <span role={state.draftSaveError ? 'alert' : undefined} title={state.draftSaveError ?? state.status}>
        {state.draftSaveError ?? state.status}
      </span>
      <span className="rg-status-spacer" />
      <span data-testid="mesh-stats">
        {stats.triangles.toLocaleString()} tris · {stats.vertices.toLocaleString()} vertices · {stats.bounds} · {stats.milliseconds} ms
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('form');
  const [navigationMode, setNavigationMode] = useState('rotate');
  const [groupTools, setGroupTools] = useState(() => Object.fromEntries(
    CATALOG_TOOL_GROUPS.map((group) => [group.id, group.tools[0]]),
  ));
  const [sculpt, setSculpt] = useState({
    resizeProportional: true,
    protectDeformation: false,
    rotateAxis: 'y', mirrorAxis: 'x', fractureAxis: 'surface', fractureGap: 0.075,
    decimatePercent: 50, remeshTarget: 0,
    preventFaceFlips: false,
    resizeAxis: 'uniform',
    trimDepth: 0.25,
    drillDepth: 0.75,
    drillRoughness: 0.4,
    drillThrough: false,
    radius: 0.5,
    strength: 0.35,
    tool: 'grab',
  });
  const [toolSettings, setToolSettings] = useState({});

  useEffect(() => {
    document.title = `${state.document.name} — Rock & Cliff Generation`;
  }, [state.document.name]);

  const homeRoute = !isLabEditorLocation({ directParams: ['rockPreset', 'rockSeed', 'rockRes'] });
  useEffect(() => {
    syncLabHomeRoute(state.view.home, { directParams: ['rockPreset', 'rockSeed', 'rockRes'] });
  }, [state.view.home]);

  const catalogEntry = state.document.reference?.sourceMode === 'c8-custom-mesh'
    ? createC8CustomMeshCatalogEntry(state.document.reference)
    : getRockVariationCatalogEntry(state.catalogSourceId);
  const toolGroup = CATALOG_TOOL_GROUPS.find((group) => group.id === sectionId);
  const selectedTool = CATALOG_MESH_TOOLS.find((tool) => tool.value === sculpt.tool);
  const sculptEnabled = Boolean(catalogEntry) && Boolean(toolGroup) && !homeRoute;

  function changeSection(id) {
    setSectionId(id);
    if (groupTools[id]) changeToolOptions({ tool: groupTools[id] });
  }

  function changeToolOptions(patch) {
    setToolSettings((current) => ({ ...current, [sculpt.tool]: sculpt }));
    setSculpt((current) => patch.tool && patch.tool !== current.tool
      ? { resizeProportional: true, protectDeformation: false, rotateAxis: 'y', mirrorAxis: 'x', fractureAxis: 'surface', fractureGap: 0.075, decimatePercent: 50, remeshTarget: 0, preventFaceFlips: false, resizeAxis: 'uniform', trimDepth: 0.25, drillDepth: 0.75, drillRoughness: 0.4, drillThrough: false, radius: 0.5, strength: 0.35, ...toolSettings[patch.tool], ...patch }
      : { ...current, ...patch });
    if (patch.tool) {
      const group = CATALOG_TOOL_GROUPS.find((entry) => entry.tools.includes(patch.tool));
      if (group) setGroupTools((current) => ({ ...current, [group.id]: patch.tool }));
    }
  }

  useEffect(() => {
    engine?.setSculptOptions({ ...sculpt, enabled: sculptEnabled });
  }, [engine, sculpt, sculptEnabled]);

  useEffect(() => {
    if (catalogEntry && sectionId !== 'output' && !SOURCE_SECTIONS.some((section) => section.id === sectionId)) {
      setSectionId('form');
    }
  }, [catalogEntry, sectionId]);

  if (homeRoute) return <RockHome actions={actions} state={state} />;

  return (
    <div className="rg-root tk">
      <TopBar
        actions={actions}
        engine={engine}
        onExportInfo={() => changeSection(catalogEntry ? 'output' : 'mesh')}
        navigationMode={navigationMode}
        onNavigationMode={(mode) => {
          setNavigationMode(mode);
          engine.setNavigationMode(mode);
        }}
        state={state}
        editing={sculptEnabled && !state.comparingOriginal}
      />
      <SectionRail
        active={sectionId}
        onChange={changeSection}
        onSculptChange={changeToolOptions}
        sculpt={sculpt}
        sourceMesh={Boolean(catalogEntry)}
      />
      {catalogEntry
        ? (
          <CatalogSourceInspector
            actions={actions}
            engine={engine}
            entry={catalogEntry}
            onSculptChange={changeToolOptions}
            sculpt={sculpt}
            sectionId={sectionId}
            state={state}
          />
        )
        : <Inspector actions={actions} sectionId={sectionId} state={state} />}
      <StatusBar state={state} />
      <PreviewBar
        hint={sculptEnabled
          ? 'Alt-drag / arrows orbit · wheel zoom · right-drag pan · F frame'
          : 'Left-drag rotate · wheel zoom · right-drag pan'}
        title={sculptEnabled
          ? (toolGroup.id === 'inspect' ? 'Inspect the mesh without changing it.' : selectedTool.description)
          : 'Camera and stage are preview-only. Preset, style, seed, geometry, surface, and meshing settings are saved in the document.'}
      >
        {state.comparingOriginal && <button className="rg-compare-badge" onClick={() => engine.setComparison(false)}>Original · return to editing</button>}
        <span className="rg-preview-meta">
          {catalogEntry
            ? catalogEntry.sourceMode === 'c8-custom-glb'
              ? 'C8 content-bound editable control mesh'
              : 'Official Gallery GLB variation'
            : 'First-party procedural mesh'}
        </span>
        <SegmentedControl
          disabled={sculptEnabled && !state.comparingOriginal}
          onChange={(mode) => {
            setNavigationMode(mode);
            engine.setNavigationMode(mode);
          }}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="navigation-mode"
          value={navigationMode}
        />
        <IconButton icon="reset" label="Reset camera (C)" onClick={engine.resetCamera} />
      </PreviewBar>
      <ToastStack />
    </div>
  );
}
