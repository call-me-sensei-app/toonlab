// Tree Lab blossom stage: optional petal heads attached to real canopy cards.
// Standalone stems and flower assets are authored in Flower Lab.

import { useState } from 'react';
import { ColorWell } from '../../../shared/ui/index.js';
import { FLOWER_PLACEMENTS, FLOWER_SPECIES } from '../../engine/flowerPatch.js';
import { CustomShapeDialog } from '../LeafStylePanel.jsx';

const DEFAULT_FLOWERS = {
  color: [0.93, 0.4, 0.45],
  petal: { preset: 'tulip' },
  preset: 'none',
};

export function FlowersPanel({ actions, state }) {
  const [drawOpen, setDrawOpen] = useState(false);
  const current = state.flowers ?? DEFAULT_FLOWERS;

  function patch(changes) {
    const next = { ...current, ...changes };
    actions.setFlowers(next.preset === 'none' ? null : next);
  }

  return (
    <>
      <section className="tk-section" data-testid="flowers-section">
        <div className="tk-section-title">Placement</div>
        <div className="tk-section-caption">
          Blossoms attach to the tree&apos;s own canopy (sakura, magnolia).
          Choose the coverage, then draw or select the petal repeated across it.
        </div>
        <div className="td-leaf-grid">
          <button
            type="button"
            className="td-leaf-card"
            data-active={!state.flowers}
            data-testid="flowers-none"
            onClick={() => actions.setFlowers(null)}
          >
            <span className="td-leaf-draw-hint">∅</span>
            <span>None</span>
          </button>
          {FLOWER_PLACEMENTS.map((placement) => (
            <button
              key={placement.id}
              type="button"
              className="td-leaf-card"
              data-active={current.preset === placement.id && Boolean(state.flowers)}
              data-testid={`flowers-${placement.id}`}
              onClick={() => patch({ preset: placement.id })}
            >
              <span className="td-leaf-draw-hint">🌸</span>
              <span>{placement.label}</span>
            </button>
          ))}
        </div>
      </section>
      {state.flowers && (
        <section className="tk-section">
          <div className="tk-section-title">Blossom</div>
          <div className="td-leaf-grid">
            {FLOWER_SPECIES.map((species) => (
              <button
                key={species.id}
                type="button"
                className="td-leaf-card"
                data-active={current.petal?.preset === species.id}
                data-testid={`petal-${species.id}`}
                onClick={() => patch({
                  color: [...species.color],
                  petal: { preset: species.id },
                })}
              >
                <span className="td-leaf-draw-hint">{species.icon}</span>
                <span>{species.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="td-leaf-card"
              data-active={current.petal?.preset === 'custom'}
              data-testid="petal-custom"
              onClick={() => setDrawOpen(true)}
            >
              <span className="td-leaf-draw-hint">✏️</span>
              <span>Draw…</span>
            </button>
          </div>
          <div className="tk-field">
            <span className="tk-field-label"><span className="tk-field-label-text">Petal Color</span></span>
            <ColorWell
              onChange={(color) => patch({ color })}
              testId="flower-color"
              value={Array.isArray(current.color) ? current.color : [0.93, 0.4, 0.45]}
            />
            <span />
          </div>
        </section>
      )}
      {drawOpen && (
        <CustomShapeDialog
          onClose={() => setDrawOpen(false)}
          onSave={(outline) => patch({ petal: { outline, preset: 'custom' } })}
          title="Draw a petal shape"
        />
      )}
    </>
  );
}
