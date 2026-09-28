// Leaf style section for the Look stage: species presets (shape + seasonal
// palette), season switching, multi-color palette editing, and a
// draw-your-own leaf silhouette dialog. All writes flow through the store:
// shape → leafShape (rebuild), palette/density → the normal color/leaves
// schema fields, style bookkeeping → leafStyle.

import { useEffect, useRef, useState } from 'react';
import {
  TREE_SETTING_FIELD_SCHEMA, traceLeafShapePath,
} from '../../../src/vegetation/experimental.js';
import { Button, Modal } from '../../shared/ui/index.js';
import { LEAF_STYLES, SEASONS, resolveLeafSeason } from './leafStyles.js';
import { LEAF_PALETTES, paletteSwatches } from './leafPalettes.js';

function hexToTriplet(hex) {
  const raw = hex.replace('#', '');
  return [
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  ];
}

/** Mini canvas preview of one leaf silhouette, tinted with a palette color. */
function LeafPreview({ outline = null, shape, tint }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.clearRect(0, 0, 44, 44);
    ctx.save();
    ctx.translate(22, 22);
    ctx.fillStyle = tint;
    traceLeafShapePath(ctx, shape, 36, 28, outline);
    ctx.fill();
    ctx.restore();
  }, [outline, shape, tint]);
  return <canvas ref={ref} height={44} width={44} />;
}

/** Draw a closed silhouette; saved as normalized points (-0.5..0.5).
 *  Shared by the leaf-shape and flower-petal editors. */
export function CustomShapeDialog({ onClose, onSave, title = 'Draw a leaf shape' }) {
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const drawingRef = useRef(false);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    const points = pointsRef.current;
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 223, 125, 0.7)';
    ctx.fill();
  }

  useEffect(redraw, []);

  return (
    <Modal onClose={onClose} title={title} width={320}>
      <p style={{ color: 'var(--text-secondary)', font: 'var(--type-caption)', marginBottom: 8 }}>
        Draw one closed leaf outline — tip pointing up. It becomes the
        silhouette every leaf in the crown stamps from.
      </p>
      <canvas
        ref={canvasRef}
        data-testid="leaf-draw-canvas"
        height={240}
        width={240}
        style={{
          background: 'var(--surface-2)', borderRadius: 8, cursor: 'crosshair', touchAction: 'none',
        }}
        onPointerDown={(event) => {
          drawingRef.current = true;
          pointsRef.current = [];
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch { /* synthetic pointers */ }
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          pointsRef.current.push([event.clientX - rect.left, event.clientY - rect.top]);
          redraw();
        }}
        onPointerUp={() => {
          drawingRef.current = false;
          redraw();
        }}
      />
      <div className="td-export-actions">
        <Button kind="ghost" onClick={() => { pointsRef.current = []; redraw(); }}>Clear</Button>
        <Button
          kind="primary"
          onClick={() => {
            const points = pointsRef.current;
            if (points.length < 8) return;
            // Normalize into -0.5..0.5 leaf space (canvas y-down = leaf
            // base-down, so flip Y to keep the tip pointing up).
            const xs = points.map((p) => p[0]);
            const ys = points.map((p) => p[1]);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const spanX = Math.max(maxX - minX, 1);
            const spanY = Math.max(maxY - minY, 1);
            // Cap point count so recipes stay small.
            const step = Math.max(1, Math.floor(points.length / 48));
            const outline = points
              .filter((_, index) => index % step === 0)
              .map(([x, y]) => [
                Number((((x - minX) / spanX) - 0.5).toFixed(3)),
                Number((0.5 - ((y - minY) / spanY)).toFixed(3)),
              ]);
            onSave(outline);
            onClose();
          }}
          testId="leaf-draw-save"
        >
          Use this shape
        </Button>
      </div>
    </Modal>
  );
}

export function LeafPaletteSection({ actions, state }) {
  const schema = TREE_SETTING_FIELD_SCHEMA.color;
  function applyPalette(palette) {
    const canopyValue = Array.isArray(palette.canopy)
      ? palette.canopy
      : hexToTriplet(palette.canopy);
    // One undo snapshot for the whole palette, then pin/unpin each tone so a
    // previous palette's pins never linger.
    actions.setField(schema.canopy, canopyValue);
    for (const tone of ['lit', 'shadow', 'crown']) {
      const pinField = schema[`pin${tone[0].toUpperCase()}${tone.slice(1)}`];
      if (palette[tone]) {
        actions.setField(pinField, true, { snapshot: false });
        actions.setField(schema[tone], hexToTriplet(palette[tone]), { snapshot: false });
      } else {
        actions.setField(pinField, false, { snapshot: false });
      }
    }
    actions.setStatus(`Leaf palette: ${palette.label}.`);
  }
  const current = JSON.stringify(state.settings.color.canopy);
  return (
    <section className="tk-section" data-testid="leaf-palette-section">
      <div className="tk-section-title">Leaf Colors</div>
      <div className="tk-section-caption">
        One-click palettes — base color plus pinned highlight/shadow tones.
        Seasonal, blossom, and stylized combos; tweak any tone after.
      </div>
      <div className="td-leaf-grid">
        {LEAF_PALETTES.map((palette) => {
          const active = current === JSON.stringify(
            Array.isArray(palette.canopy) ? palette.canopy : hexToTriplet(palette.canopy));
          return (
            <button
              key={palette.id}
              type="button"
              className="td-leaf-card"
              data-active={active}
              data-testid={`leaf-palette-${palette.id}`}
              onClick={() => applyPalette(palette)}
              title={palette.label}
            >
              <span style={{ display: 'flex', gap: 2 }}>
                {paletteSwatches(palette).map((swatch, index) => (
                  <span
                    key={index}
                    style={{
                      background: swatch,
                      borderRadius: 4,
                      display: 'inline-block',
                      height: 18,
                      width: 18,
                    }}
                  />
                ))}
              </span>
              <span>{palette.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LeafStyleSection({ actions, state }) {
  const [drawOpen, setDrawOpen] = useState(false);
  const activeStyle = state.leafStyle?.presetId ?? null;
  const season = state.leafStyle?.season ?? 'summer';
  const currentShape = state.leafShape?.preset ?? 'teardrop';

  function applyStyle(style, nextSeason) {
    const resolved = resolveLeafSeason(style, nextSeason);
    // Shape (rebuild) + bookkeeping in one commit, then palette + density.
    actions.setLeafShape({ preset: style.shape }, {
      leafStyle: { presetId: style.id, season: nextSeason },
    });
    const canopyValue = Array.isArray(resolved.canopyColor)
      ? resolved.canopyColor
      : hexToTriplet(resolved.canopyColor);
    actions.setField(TREE_SETTING_FIELD_SCHEMA.color.canopy, canopyValue, { snapshot: false });
    if (resolved.density !== null) {
      actions.setField(TREE_SETTING_FIELD_SCHEMA.leaves.density, resolved.density, { snapshot: false });
    }
  }

  return (
    <section className="tk-section" data-testid="leaf-style-section">
      <div className="tk-section-title">Leaf Style</div>
      <div className="tk-section-caption">
        Species shape + palette. Seasons repaint deciduous species — autumn
        palettes are multi-color.
      </div>
      <div className="td-leaf-grid">
        {LEAF_STYLES.map((style) => {
          const preview = resolveLeafSeason(style, season);
          const tint = Array.isArray(preview.canopyColor)
            ? preview.canopyColor[0]
            : preview.canopyColor;
          return (
            <button
              key={style.id}
              type="button"
              className="td-leaf-card"
              data-active={activeStyle === style.id}
              data-testid={`leaf-style-${style.id}`}
              // First engagement opens the style on its SIGNATURE season
              // (sakura = spring pink); once the user has picked a season
              // themselves, style clicks respect it.
              onClick={() => applyStyle(
                style,
                state.leafStyle ? season : style.signatureSeason ?? season,
              )}
            >
              <LeafPreview shape={style.shape} tint={tint} />
              <span>{style.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="td-leaf-card"
          data-active={currentShape === 'custom'}
          data-testid="leaf-style-custom"
          onClick={() => setDrawOpen(true)}
        >
          {currentShape === 'custom'
            ? <LeafPreview outline={state.leafShape.outline} shape="custom" tint="#7ddf7d" />
            : <span className="td-leaf-draw-hint">✏️</span>}
          <span>Draw…</span>
        </button>
      </div>
      <div className="tk-field" style={{ gridTemplateColumns: '104px 1fr' }}>
        <span className="tk-field-label"><span className="tk-field-label-text">Season</span></span>
        <div className="tk-segmented">
          {SEASONS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={season === entry}
              data-testid={`season-${entry}`}
              title={entry[0].toUpperCase() + entry.slice(1)}
              onClick={() => {
                const style = LEAF_STYLES.find((candidate) => candidate.id === activeStyle);
                if (style) applyStyle(style, entry);
                else actions.setLeafStyle({ presetId: null, season: entry });
              }}
            >
              {{ autumn: 'Fall', spring: 'Spr', summer: 'Sum', winter: 'Win' }[entry]}
            </button>
          ))}
        </div>
      </div>
      {drawOpen && (
        <CustomShapeDialog
          onClose={() => setDrawOpen(false)}
          onSave={(outline) => actions.setLeafShape(
            { outline, preset: 'custom' },
            { leafStyle: { presetId: null, season } },
          )}
        />
      )}
    </section>
  );
}
