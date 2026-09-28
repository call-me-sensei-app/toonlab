// Floating tool strip + contextual options bar. Tool state lives in the
// store; the engine's SketchTools follows it. Stage relevance is expressed
// by emphasis (dimming), never by hiding — Photoshop rules.

import {
  Button, Icon, SegmentedControl, Slider, Toggle,
} from '../../shared/ui/index.js';
import { TOOLS } from './stageMap.js';

// CONTEXTUAL strip: each stage shows only its tools, so the strip itself
// tells you what the stage is for (Move lives in the rail — it's global
// camera navigation, not a stage tool). Stages with no tools hide the strip.
const STAGE_TOOLS = {
  animation: [],
  leaves: ['leaves', 'erase'],
  look: [],
  shape: ['crown'],
  wood: ['trunk', 'branch', 'thicken', 'erase'],
};

const TOOL_CAPTIONS = {
  branch: 'Branch',
  crown: 'Crown',
  erase: 'Erase',
  leaves: 'Leaves',
  orbit: 'Move',
  thicken: 'Size',
  trunk: 'Trunk',
};

const FLOWER_TOOL_COPY = {
  branch: { caption: 'Branch Stem', title: 'Branch Stem (B) — draw a secondary stem' },
  crown: { caption: 'Silhouette', title: 'Silhouette (C) — outline the supporting plant shape' },
  trunk: { caption: 'Stem', title: 'Stem (T) — drag up from the ground' },
};

/** Sketch mode: two crayon brushes + Convert. The whole 5-year-old promise. */
export function SketchModeBar({ actions, sketchBindings, state }) {
  const pending = state.pendingStrokes.length;
  return (
    <div className="td-optionsbar td-sketchbar" data-testid="sketch-bar">
      <span style={{ font: 'var(--type-label)' }}>✏️ Sketch mode</span>
      <button
        type="button"
        className="tk-button"
        data-kind={state.tool === 'doodleWood' ? 'primary' : 'secondary'}
        data-testid="brush-wood"
        onClick={() => actions.setTool('doodleWood')}
      >
        🪵 Wood
      </button>
      <button
        type="button"
        className="tk-button"
        data-kind={state.tool === 'doodleRoot' ? 'primary' : 'secondary'}
        data-testid="brush-root"
        onClick={() => actions.setTool('doodleRoot')}
      >
        🫚 Root
      </button>
      <button
        type="button"
        className="tk-button"
        data-kind={state.tool === 'doodleLeaves' ? 'primary' : 'secondary'}
        data-testid="brush-leaves"
        onClick={() => actions.setTool('doodleLeaves')}
      >
        🍃 Leaves
      </button>
      <button
        type="button"
        className="tk-button"
        data-kind={state.tool === 'doodleErase' ? 'primary' : 'secondary'}
        data-testid="brush-erase"
        title="Drag across ink to erase those strokes"
        onClick={() => actions.setTool('doodleErase')}
      >
        ⌫ Erase
      </button>
      <span>Brush</span>
      <Slider
        defaultValue={30}
        max={100}
        min={10}
        onChange={(value) => actions.setBrush({ doodleSizePx: Math.round(value) })}
        step={5}
        testId="doodle-brush-size"
        value={state.brush.doodleSizePx}
      />
      <span
        aria-hidden="true"
        style={{
          background: state.tool === 'doodleLeaves' ? '#7ddf7d'
            : state.tool === 'doodleRoot' ? '#8a5a3a'
              : state.tool === 'doodleErase' ? '#f07a6a' : '#b07a4a',
          borderRadius: '50%',
          height: Math.max(state.brush.doodleSizePx * 0.32, 6),
          opacity: 0.8,
          width: Math.max(state.brush.doodleSizePx * 0.32, 6),
        }}
      />
      <span style={{ opacity: 0.6 }}>{pending ? `${pending} stroke${pending === 1 ? '' : 's'}` : 'paint the areas'}</span>
      <Button disabled={!pending} kind="ghost" onClick={() => actions.clearPendingStrokes()}>
        Clear
      </Button>
      <Button
        disabled={!pending}
        kind="primary"
        onClick={() => sketchBindings.convertPendingStrokes()}
        testId="convert-tree"
      >
        ✨ Convert to Tree
      </Button>
      <Button
        disabled={!pending}
        kind="primary"
        onClick={() => sketchBindings.growPendingStrokes()}
        testId="grow-tree"
        title="Use the longest wood stroke as the trunk and grow a full branching tree along it"
      >
        🌱 Grow from Doodle
      </Button>
      <Button kind="ghost" onClick={() => actions.setSketchMode(false)} testId="sketch-done">
        Done
      </Button>
    </div>
  );
}

export function ToolStrip({ actions, labKind = 'tree', state }) {
  const isFlowerLab = labKind === 'flower';
  // Direct stem/branch tools work for both plant families. The broad doodle
  // conversion workflow remains a Tree Lab responsibility.
  const acceptsDrawingTools = state.settings.plant.type !== 'bush';
  const toolIds = STAGE_TOOLS[state.stage] ?? [];
  const tools = toolIds.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);
  if (!tools.length) return null;
  return (
    <div className="td-toolstrip" data-testid="tool-strip">
      {!isFlowerLab && (
        <>
          <button
            type="button"
            className="td-tool"
            data-testid="tool-sketchmode"
            title="Sketch mode — doodle wood + leaves, then Convert to Tree"
            onClick={() => actions.setSketchMode(true)}
          >
            <Icon name="sketch" />
            <span>Sketch</span>
          </button>
          <div className="td-toolstrip-divider" />
        </>
      )}
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="td-tool"
          data-active={state.tool === tool.id || (tool.id === 'thicken' && state.tool === 'thin')}
          data-testid={`tool-${tool.id}`}
          disabled={!acceptsDrawingTools}
          title={acceptsDrawingTools
            ? `${isFlowerLab && FLOWER_TOOL_COPY[tool.id]
              ? FLOWER_TOOL_COPY[tool.id].title
              : tool.label} — click again to put the tool down`
            : 'Sketch tools work on trees — switch Type to Tree first.'}
          // Toggle semantics: re-clicking the active tool puts it down and
          // you're back to default camera navigation.
          onClick={() => actions.setTool(
            state.tool === tool.id || (tool.id === 'thicken' && state.tool === 'thin')
              ? 'orbit'
              : tool.id,
          )}
        >
          <Icon name={tool.icon} />
          <span>{isFlowerLab && FLOWER_TOOL_COPY[tool.id]
            ? FLOWER_TOOL_COPY[tool.id].caption
            : TOOL_CAPTIONS[tool.id]}</span>
        </button>
      ))}
    </div>
  );
}

export function OptionsBar({ actions, labKind = 'tree', state }) {
  const { brush, sketch, tool } = state;

  if (tool === 'move') {
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>✥ Move</span>
        <SegmentedControl
          onChange={(mode) => actions.setMoveMode(mode)}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="move-mode"
          value={state.moveMode}
        />
        <span style={{ opacity: 0.6 }}>left-drag · middle always zooms, right always pans</span>
      </div>
    );
  }
  if (tool === 'trunk' || tool === 'branch') {
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>{tool === 'trunk' ? `🪵 ${labKind === 'flower' ? 'Stem' : 'Trunk'}` : '✏️ Branch'}</span>
        <span>Size</span>
        <Slider
          defaultValue={0.07}
          max={0.2}
          min={0.03}
          onChange={(value) => actions.setBrush({ branchRadius: value })}
          step={0.005}
          testId="brush-size"
          value={brush.branchRadius}
        />
        <span style={{ font: 'var(--type-value)' }}>{brush.branchRadius.toFixed(3)}</span>
        {tool === 'branch' && (
          <>
            <span>Leaf tip</span>
            <Toggle
              checked={brush.leafTip}
              onChange={(leafTip) => actions.setBrush({ leafTip })}
              testId="brush-leaftip"
            />
          </>
        )}
        {tool === 'trunk' && <span style={{ opacity: 0.6 }}>drawn 2.4× thicker, no leaf tip</span>}
      </div>
    );
  }
  if (tool === 'thicken' || tool === 'thin') {
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>⇕ Size</span>
        <SegmentedControl
          onChange={(mode) => actions.setTool(mode)}
          options={[
            { label: 'Thicken', value: 'thicken' },
            { label: 'Thin', value: 'thin' },
          ]}
          value={tool}
        />
        <span style={{ opacity: 0.6 }}>Alt-click also thins</span>
      </div>
    );
  }
  if (tool === 'leaves') {
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>🍃 Leaves</span>
        <span style={{ opacity: 0.6 }}>Open stroke = tuft run · closed loop = fill</span>
      </div>
    );
  }
  if (tool === 'crown') {
    const isFlowerLab = labKind === 'flower';
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>🔵 {isFlowerLab ? 'Silhouette' : 'Crown'}</span>
        <span style={{ opacity: 0.6 }}>
          {isFlowerLab
            ? 'Draw a closed outline around the supporting plant shape'
            : 'Draw a closed outline around the crown'}
        </span>
        {sketch.crownBlobs.length > 0 && (
          <Button kind="ghost" onClick={() => actions.clearCrownBlobs()} testId="clear-crown">
            Clear drawn {isFlowerLab ? 'silhouette' : 'crown'}
          </Button>
        )}
      </div>
    );
  }
  if (tool === 'erase') {
    const hasStrokes = sketch.branchSpines.length || sketch.extraBlobs.length
      || sketch.extraAttachments.length || sketch.crownBlobs.length;
    return (
      <div className="td-optionsbar" data-testid="options-bar">
        <span>Erase</span>
        {hasStrokes
          ? <Button kind="ghost" onClick={() => actions.clearStrokes()} testId="clear-strokes">Clear all strokes</Button>
          : <span style={{ opacity: 0.6 }}>No drawn strokes yet</span>}
      </div>
    );
  }
  return null;
}
