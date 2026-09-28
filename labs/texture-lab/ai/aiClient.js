// Recipe assistance uses server-side provider credentials. Hosted and local labs
// share the prompt/recipe contract but use their own authenticated API routes.

import {
  buildTextureAiPrompt,
  compileTextureAiRecipe,
  keywordTextureRecipe,
  parseTextureAiResponse,
} from '../../../src/texgen/index.js';

/**
 * Maps a natural-language prompt to a compiled texture recipe using the
 * configured provider. mode 'new' starts from the best archetype; 'refine'
 * patches the current settings. Always resolves to
 * { settings, name, notes, presetId } or throws with a friendly message.
 */
export async function runTexturePrompt({ prompt, mode = 'new', settings = null, config }) {
  const clean = String(prompt ?? '').trim();
  if (!clean) throw new Error('Describe the texture first.');

  if (config.provider === 'offline') {
    return keywordTextureRecipe(clean, { currentSettings: settings, mode });
  }

  const model = config.models[config.provider]?.trim();
  if (!model) throw new Error('Set a model id first.');

  const { system, user } = buildTextureAiPrompt({ mode, prompt: clean, settings });
  let text;
  const hosted = typeof window !== 'undefined' && window.location.pathname.startsWith('/labs/');
  try {
    const response = await fetch(hosted ? '/api/texture-recipe' : '/api/toonlab/generate', {
      body: JSON.stringify(hosted ? { provider: config.provider, prompt: clean, mode, settings: settings ? { ...settings, image: null } : null } : {
        kind: 'texture-recipe',
        provider: config.provider,
        request: { model, system, user },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error ?? `${config.provider}: local provider request failed (${response.status})`);
    }
    text = body?.job?.result?.text ?? '';
    if (!text) throw new Error(`${config.provider} returned no text.`);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(hosted ? 'Recipe assistant unavailable. Please retry later.' : `${config.provider}: local server unavailable — run ToonLab with npm run dev.`);
    }
    throw error;
  }

  let recipe;
  try {
    recipe = parseTextureAiResponse(text);
  } catch (error) {
    throw new Error(`The model reply was not valid recipe JSON (${error.message}). Try again or a different model.`);
  }
  return compileTextureAiRecipe(recipe, { currentSettings: settings, mode });
}
