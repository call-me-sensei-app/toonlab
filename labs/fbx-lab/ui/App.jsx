import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  LabEditorHeader,
  RendererToggle,
  SegmentedControl,
  TextField,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { pickFile } from '../../shared/download.js';

const GIZMO_OPTIONS = [
  { label: 'Move', title: 'Translate (W)', value: 'translate' },
  { label: 'Rotate', title: 'Rotate (E)', value: 'rotate' },
  { label: 'Scale', title: 'Scale (R)', value: 'scale' },
];

const NODE_GLYPHS = { bone: '⌐', group: '▹', mesh: '◆', skinned: '◈' };

function formatCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export async function openFbxFile(engine) {
  const file = await pickFile('.fbx');
  if (!file) return;
  const buffer = await file.arrayBuffer();
  engine.actions.loadFromArrayBuffer(buffer, file.name);
}

function OutlinerNode({ actions, depth, node, selectedId }) {
  const [editing, setEditing] = useState(false);
  const selected = node.id === selectedId;
  return (
    <>
      <div
        className="fx-node"
        data-hidden={!node.visible || undefined}
        data-kind={node.kind}
        data-selected={selected || undefined}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => actions.selectById(node.id)}
        onDoubleClick={() => setEditing(true)}
      >
        <span className="fx-node-glyph">{NODE_GLYPHS[node.kind]}</span>
        {editing ? (
          <input
            autoFocus
            className="fx-rename-input"
            defaultValue={node.name}
            onBlur={(event) => {
              actions.renameObject(node.id, event.target.value);
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditing(false);
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="fx-node-name" title={node.name}>{node.name}</span>
        )}
        {node.kind === 'mesh' && !editing && (
          <span className="fx-node-meta">{formatCount(node.triangles)}△</span>
        )}
        <button
          type="button"
          className="fx-node-eye"
          data-off={!node.visible || undefined}
          title={node.visible ? 'Hide' : 'Show'}
          onClick={(event) => {
            event.stopPropagation();
            actions.setVisible(node.id, !node.visible);
          }}
        >
          {node.visible ? '●' : '○'}
        </button>
      </div>
      {node.children.map((child) => (
        <OutlinerNode
          key={child.id}
          actions={actions}
          depth={depth + 1}
          node={child}
          selectedId={selectedId}
        />
      ))}
    </>
  );
}

function VectorRow({ label, onChange, step, unit, values }) {
  return (
    <div className="fx-vector-row">
      <span className="fx-vector-label">{label}</span>
      {['x', 'y', 'z'].map((axis, index) => (
        <ScrubValue
          key={axis}
          max={100000}
          min={-100000}
          onChange={(value) => onChange(axis, value)}
          step={step}
          unit={unit}
          value={values[index]}
        />
      ))}
    </div>
  );
}

function Inspector({ engine, info }) {
  const { actions } = engine;
  return (
    <aside className="fx-panel fx-inspector">
      <div className="fx-panel-header">{info.name}</div>
      <div className="fx-panel-body">
        <div className="fx-section">
          <div className="fx-section-title">Transform</div>
          <VectorRow
            label="Position"
            onChange={actions.setPosition}
            step={0.01}
            values={info.position}
          />
          <VectorRow
            label="Rotation"
            onChange={actions.setRotationDeg}
            step={0.5}
            unit="°"
            values={info.rotationDeg}
          />
          <VectorRow
            label="Scale"
            onChange={actions.setScale}
            step={0.01}
            values={info.scale}
          />
        </div>
        {info.isMesh && (
          <div className="fx-section">
            <div className="fx-section-title">Mesh</div>
            <div className="fx-selection-counts">
              {formatCount(info.vertices)} vertices · {formatCount(info.triangles)} triangles
            </div>
            <div className="fx-actions">
              <Button onClick={() => actions.recomputeNormals(info.id)} title="Rebuild smooth vertex normals from faces">
                Recompute normals
              </Button>
              <Button onClick={() => actions.flipNormals(info.id)} title="Reverse face winding and negate normals">
                Flip normals
              </Button>
              <Button onClick={() => actions.centerPivot(info.id)} title="Move this mesh's pivot to its bounding-box center (keeps world position)">
                Center pivot
              </Button>
              <Button onClick={() => actions.bakeTransform(info.id)} title="Bake position/rotation/scale into the vertices and reset the transform">
                Bake transform
              </Button>
            </div>
          </div>
        )}
        <div className="fx-section">
          <div className="fx-actions">
            <Button
              onClick={() => actions.setVisible(info.id, !info.visible)}
            >
              {info.visible ? 'Hide' : 'Show'}
            </Button>
            <Button kind="danger" icon="trash" onClick={() => actions.deleteObject(info.id)} title="Delete (⌫) — undo with ⌘Z">
              Delete
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = engine;

  useEffect(() => {
    if (state.status === 'error' && state.error) {
      toast(`Could not read FBX: ${state.error}`, { tone: 'danger' });
    }
  }, [state.status, state.error]);

  async function handleExportFBX() {
    try {
      const result = await engine.exportFBX(state.exportName);
      toast(
        `Exported ${result.fileName} — ${result.geometryCount} mesh${result.geometryCount === 1 ? '' : 'es'}, ${result.materialCount} material${result.materialCount === 1 ? '' : 's'}${result.skipped ? `, ${result.skipped} object(s) skipped` : ''}`,
        { tone: 'success' },
      );
    } catch (error) {
      console.error('FBX export failed:', error);
      toast(`FBX export failed: ${error?.message ?? error}`, { tone: 'danger' });
    }
  }

  async function handleExportGLB() {
    try {
      const result = await engine.exportGLB(state.exportName);
      toast(`Exported ${result.fileName}`, { tone: 'success' });
    } catch (error) {
      console.error('GLB export failed:', error);
      toast(`GLB export failed: ${error?.message ?? error}`, { tone: 'danger' });
    }
  }

  const hasModel = state.status === 'ready';
  const menus = createLabEditorMenus({
    fileItems: [
      { label: 'Open FBX…', onSelect: () => { void openFbxFile(engine); } },
      { disabled: !hasModel || state.exporting, icon: 'download', label: 'Export GLB…', onSelect: () => { void handleExportGLB(); } },
      { disabled: !hasModel || state.exporting, icon: 'download', label: 'Download FBX…', onSelect: () => { void handleExportFBX(); } },
    ],
    editItems: [
      { disabled: state.undoCount === 0, icon: 'undo', label: 'Undo Delete', onSelect: actions.undoDelete, shortcut: '⌘Z' },
    ],
    viewItems: [
      { disabled: !hasModel, label: 'Frame Selection', onSelect: actions.frameSelection, shortcut: 'F' },
      ...GIZMO_OPTIONS.map((option) => ({ checked: state.gizmoMode === option.value, label: option.label, onSelect: () => actions.setGizmoMode(option.value) })),
    ],
  });

  return (
    <>
      <LabEditorHeader className="fx-topbar" menus={menus}>
        <BrandLockup labName="FBX Editor" />
        {state.fileName && <span className="fx-file" title={state.fileName}>{state.fileName}</span>}
        <div className="fx-topbar-spacer" />
        {hasModel && (
          <>
            <div className="fx-export-name">
              <TextField
                onCommit={(value) => store.setState({ exportName: value })}
                placeholder="export name"
                value={state.exportName}
              />
            </div>
          </>
        )}
        <RendererToggle supportedKinds={['webgl']} unsupportedReason="The FBX editor currently uses WebGL." />
      </LabEditorHeader>

      {state.status !== 'ready' && state.status !== 'loading' && (
        <div className="fx-empty">
          <div className="fx-drop-hint">
            <strong>Drop an .fbx file anywhere</strong>
            <br />
            load it, edit meshes, download it back as FBX
          </div>
          <Button kind="primary" onClick={() => openFbxFile(engine)}>Open FBX…</Button>
        </div>
      )}
      {state.status === 'loading' && (
        <div className="fx-empty"><span>Parsing {state.fileName}…</span></div>
      )}
      {state.status === 'error' && state.error && (
        <div className="fx-error">Could not read this FBX: {state.error}</div>
      )}

      {hasModel && state.tree && (
        <aside className="fx-panel fx-outliner">
          <div className="fx-panel-header">Outliner</div>
          <div className="fx-panel-body">
            {state.tree.map((topLevelNode) => (
              <OutlinerNode
                key={topLevelNode.id}
                actions={actions}
                depth={0}
                node={topLevelNode}
                selectedId={state.selectedId}
              />
            ))}
            <p className="fx-hint" style={{ padding: '8px 4px 2px' }}>
              Click to select · double-click to rename · W/E/R gizmo · F frame · ⌫ delete
            </p>
          </div>
        </aside>
      )}

      {hasModel && state.selectedInfo && <Inspector engine={engine} info={state.selectedInfo} />}

      {hasModel && state.stats && (
        <div className="fx-stats">
          {state.stats.nodes} nodes · {state.stats.meshes} meshes · {formatCount(state.stats.vertices)} verts · {formatCount(state.stats.triangles)} tris · {state.stats.materials} materials
        </div>
      )}

      {state.warnings.length > 0 && hasModel && (
        <div className="fx-warnings">
          {state.warnings.map((warning) => (
            <div key={warning} className="fx-warning">{warning}</div>
          ))}
        </div>
      )}

      <ToastStack />
    </>
  );
}
