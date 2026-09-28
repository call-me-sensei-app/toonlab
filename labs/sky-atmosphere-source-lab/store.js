import { createStore } from '../shared/ui/createStore.js';
import {
  createSkyAtmosphereSourceDocument,
  createSkyAtmosphereSourceRecipe,
  serializeSkyAtmosphereSourceDocument,
  validateSkyAtmosphereSourceDocument,
} from './document.js';
import {
  deleteSavedSourceDocument,
  loadSavedSourceDocuments,
  loadWorkingSourceDocument,
  saveWorkingSourceDocument,
  upsertSavedSourceDocument,
} from './projectStore.js';
import { bakeSkyAtmosphereSource } from './sourceGenerator.js';

function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sky-source';
}

function recipeFingerprint(recipe) {
  return JSON.stringify(createSkyAtmosphereSourceRecipe(recipe));
}

export function createSkyAtmosphereSourceStore() {
  const document = loadWorkingSourceDocument() ?? createSkyAtmosphereSourceDocument();
  const store = createStore({
    bakeError: null,
    bakeStatus: 'idle',
    bakedFingerprint: null,
    document,
    result: null,
    savedDocuments: loadSavedSourceDocuments(),
    selectedSavedId: null,
    status: 'Ready to bake a deterministic source.',
  });
  let bakeToken = 0;

  function replaceDocument(next, status) {
    const canonical = createSkyAtmosphereSourceDocument(next);
    saveWorkingSourceDocument(canonical);
    store.setState({ document: canonical, status });
  }

  const actions = {
    bake() {
      const token = ++bakeToken;
      const recipe = store.getState().document.recipe;
      const fingerprint = recipeFingerprint(recipe);
      store.setState({ bakeError: null, bakeStatus: 'baking', status: 'Baking source…' });
      globalThis.setTimeout(() => {
        try {
          const started = performance.now();
          const result = bakeSkyAtmosphereSource(recipe);
          if (token !== bakeToken) return;
          const elapsedMs = performance.now() - started;
          store.setState({
            bakeStatus: 'ready',
            bakedFingerprint: fingerprint,
            result: { ...result, elapsedMs },
            status: `${result.label} baked in ${Math.max(1, Math.round(elapsedMs))} ms.`,
          });
        } catch (error) {
          if (token !== bakeToken) return;
          store.setState({
            bakeError: error.message,
            bakeStatus: 'error',
            status: `Bake failed: ${error.message}`,
          });
        }
      }, 0);
    },

    deleteSaved(id) {
      deleteSavedSourceDocument(id);
      store.setState({
        savedDocuments: loadSavedSourceDocuments(),
        selectedSavedId: store.getState().selectedSavedId === id ? null : store.getState().selectedSavedId,
        status: 'Saved source deleted.',
      });
    },

    exportDocument() {
      return serializeSkyAtmosphereSourceDocument(store.getState().document);
    },

    importDocument(input) {
      const result = validateSkyAtmosphereSourceDocument(input);
      if (!result.ok) return result;
      replaceDocument(result.value, `Imported “${result.value.label}”. Bake to refresh the output.`);
      store.setState({ selectedSavedId: null });
      return result;
    },

    loadSaved(id) {
      const found = loadSavedSourceDocuments().find((entry) => entry.id === id);
      if (!found) return false;
      replaceDocument(found, `Opened “${found.label}”. Bake to refresh the output.`);
      store.setState({ selectedSavedId: id });
      return true;
    },

    reseed() {
      actions.setRecipe({ seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    },

    reset() {
      replaceDocument(createSkyAtmosphereSourceDocument(), 'New source recipe.');
      store.setState({ selectedSavedId: null });
    },

    saveAs(label) {
      const name = String(label ?? '').trim();
      if (!name) return { errors: ['Give the source recipe a name.'], ok: false };
      const state = store.getState();
      const current = state.document;
      const nameMatch = state.savedDocuments.find(
        (entry) => entry.label.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      const id = state.selectedSavedId
        ?? nameMatch?.id
        ?? `${slug(name)}-${Date.now().toString(36)}`;
      const saved = upsertSavedSourceDocument({ ...current, id, label: name });
      if (!saved) return { errors: ['Local storage is unavailable or full.'], ok: false };
      saveWorkingSourceDocument(saved);
      store.setState({
        document: saved,
        savedDocuments: loadSavedSourceDocuments(),
        selectedSavedId: saved.id,
        status: `Saved “${saved.label}” locally.`,
      });
      return { ok: true, value: saved };
    },

    setAtmosphere(patch) {
      const current = store.getState().document;
      actions.setRecipe({
        atmosphere: { ...current.recipe.atmosphere, ...patch },
      });
    },

    setRecipe(patch) {
      const current = store.getState().document;
      replaceDocument({
        ...current,
        recipe: createSkyAtmosphereSourceRecipe({ ...current.recipe, ...patch }),
      }, 'Recipe changed. Bake to refresh the source.');
    },

    setWeather(patch) {
      const current = store.getState().document;
      actions.setRecipe({ weather: { ...current.recipe.weather, ...patch } });
    },
  };

  store.actions = actions;
  Object.defineProperty(store, 'isSourceDirty', {
    value() {
      const state = store.getState();
      return state.bakedFingerprint !== recipeFingerprint(state.document.recipe);
    },
  });
  return store;
}
