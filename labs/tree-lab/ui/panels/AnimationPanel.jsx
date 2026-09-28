// Animation stage: engine-side falling-leaf effects. Presets are motion
// personalities (fall/drift/flutter); intensity scales particle count and
// pace. Live-applied — never baked into geometry or GLB (like wind).

import { LEAF_ANIMATION_PRESETS } from '../../engine/leafParticles.js';
import { Slider } from '../../../shared/ui/index.js';
import { ScrubValue } from '../../../shared/ui/components/Slider.jsx';

export function AnimationPanel({ actions, state }) {
  const current = state.animation ?? { intensity: 0.5, preset: 'none' };

  function setPreset(preset) {
    actions.setAnimation(preset === 'none'
      ? null
      : { intensity: current.intensity ?? 0.5, preset });
  }

  return (
    <>
      <section className="tk-section" data-testid="animation-section">
        <div className="tk-section-title">Effect</div>
        <div className="tk-section-caption">
          Leaves shed from the crown using the tree's own leaf shape and
          palette — a sakura sheds pink petals. Live in-engine; not baked
          into GLB exports.
        </div>
        <div className="td-leaf-grid">
          <button
            type="button"
            className="td-leaf-card"
            data-active={!state.animation || current.preset === 'none'}
            data-testid="animation-none"
            onClick={() => setPreset('none')}
          >
            <span className="td-leaf-draw-hint">∅</span>
            <span>None</span>
          </button>
          {LEAF_ANIMATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="td-leaf-card"
              data-active={current.preset === preset.id}
              data-testid={`animation-${preset.id}`}
              title={preset.description}
              onClick={() => setPreset(preset.id)}
            >
              <span className="td-leaf-draw-hint">
                {preset.id === 'falling' ? '🍂' : preset.id === 'drifting' ? '💨' : '🌸'}
              </span>
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
        {state.animation && (
          <div className="tk-field">
            <span className="tk-field-label"><span className="tk-field-label-text">Intensity</span></span>
            <Slider
              defaultValue={0.5}
              max={1}
              min={0.05}
              onChange={(intensity) => actions.setAnimation({ ...current, intensity })}
              step={0.05}
              testId="animation-intensity"
              value={current.intensity ?? 0.5}
            />
            <ScrubValue
              max={1}
              min={0.05}
              onChange={(intensity) => actions.setAnimation({ ...current, intensity })}
              step={0.05}
              value={current.intensity ?? 0.5}
            />
          </div>
        )}
      </section>
    </>
  );
}
