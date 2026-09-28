// AI assist panel: natural language -> texture parameters. Three providers:
// the built-in offline keyword mapper (no key needed), Google Gemini, and
// OpenAI — provider credentials stay on the server.

import { useState } from 'react';

import { Button, SegmentedControl, toast } from '../../shared/ui/index.js';
import { DEFAULT_AI_MODELS } from '../textureProjectStore.js';
import { runTexturePrompt } from '../ai/aiClient.js';

const EXAMPLES = [
  'old leather jacket',
  'mossy castle bricks',
  'molten lava with glowing cracks',
  'sci-fi hull panels with grime streaks',
  'pastel knitted sweater',
  'wet cobblestone street at night',
];

const PROVIDER_OPTIONS = [
  { label: 'Built-in', title: 'Offline keyword mapper — no key needed', value: 'offline' },
  { label: 'Gemini', title: 'Google Gemini (Flash-Lite class) with your key', value: 'gemini' },
  { label: 'OpenAI', title: 'OpenAI (mini class) with your key', value: 'openai' },
];

export function AiPanel({ actions, state }) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('new');
  const ai = state.ai;
  const hosted = window.location.pathname.startsWith('/labs/');

  async function generate(text) {
    const clean = String(text ?? prompt).trim();
    if (!clean || ai.busy) return;
    actions.setAi({ busy: true, notes: '' });
    actions.setStatus(ai.provider === 'offline' ? 'Mapping your description…' : `Asking ${ai.provider === 'gemini' ? 'Gemini' : 'OpenAI'}…`);
    try {
      const recipe = await runTexturePrompt({
        config: ai,
        mode,
        prompt: clean,
        settings: state.settings,
      });
      actions.applyRecipe(
        { name: mode === 'refine' ? state.name : recipe.name, presetId: recipe.presetId, settings: recipe.settings },
        recipe.notes ? `“${recipe.name}” — ${recipe.notes}` : `Applied “${recipe.name}”.`,
      );
      actions.setAi({ busy: false, notes: recipe.notes ?? '' });
      if (recipe.ignored?.length) toast(`Ignored ${recipe.ignored.length} unknown parameter(s) from the model.`, { tone: 'neutral' });
    } catch (error) {
      actions.setAi({ busy: false, notes: '' });
      actions.setStatus('');
      toast(error.message || 'Texture mapping failed.', { tone: 'danger' });
    }
  }

  return (
    <section className="tx-ai tk-section">
      <h3 className="tk-section-title">Describe a texture</h3>
      <p className="tx-ai-caption">
        Type any material — “{EXAMPLES[0]}” — and it becomes generator parameters you can keep tuning.
      </p>

      <SegmentedControl
        onChange={(provider) => actions.setAi({ provider })}
        options={PROVIDER_OPTIONS}
        value={ai.provider}
      />

      {ai.provider !== 'offline' && (
        <div className="tx-ai-config">
          <label className="tx-ai-label">
            <span>Model</span>
            <input
              className="tk-text-field"
              placeholder={DEFAULT_AI_MODELS[ai.provider]}
              spellCheck={false}
              type="text"
              readOnly={hosted}
              value={hosted ? DEFAULT_AI_MODELS[ai.provider] : ai.models[ai.provider]}
              onChange={(event) => actions.setAi({ models: { ...ai.models, [ai.provider]: event.target.value } })}
            />
          </label>
          <p className="tx-ai-note">
            {hosted ? 'Uses the hosted recipe assistant for Pro and Team accounts.' : <>Configure {ai.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} in
            the local server environment. The key never reaches browser code.</>}
          </p>
        </div>
      )}
      {ai.provider === 'offline' && (
        <p className="tx-ai-note">
          No key needed: a built-in mapper matches your words against the preset library and
          wear/color modifiers. Configure a Gemini or OpenAI server key for smarter mapping.
        </p>
      )}

      <textarea
        className="tx-json tx-ai-prompt"
        placeholder="e.g. old leather jacket, sun-bleached with scuffed seams"
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            generate();
          }
        }}
      />

      <div className="tx-ai-row">
        <SegmentedControl
          onChange={setMode}
          options={[
            { label: 'New texture', title: 'Start from the best-matching archetype', value: 'new' },
            { label: 'Refine current', title: 'Patch the texture you are editing', value: 'refine' },
          ]}
          value={mode}
        />
        <Button disabled={ai.busy || !prompt.trim()} icon="sketch" kind="primary" onClick={() => generate()}>
          {ai.busy ? 'Generating…' : 'Generate'}
        </Button>
      </div>

      <div className="tx-ai-examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="tx-chip"
            disabled={ai.busy}
            onClick={() => { setPrompt(example); generate(example); }}
          >
            {example}
          </button>
        ))}
      </div>

      {ai.notes && <p className="tx-ai-notes">“{ai.notes}”</p>}
    </section>
  );
}
