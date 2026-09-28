import {
  createAtmosphericConditionDirector,
} from '../../../src/atmospheric-condition/index.js';
import {
  SKY_CLOUD_ATMOSPHERE_PREVIEW_DOMAINS,
  atmosphericPreviewPhaseForHour,
  createSkyCloudAtmospherePreview,
} from '../../shared/skyCloudAtmospherePreview.js';

function profileFromState(state) {
  return {
    id: state.conditionId ?? 'custom',
    label: state.name,
    ...state.settings,
  };
}

export function createAtmosphericConditionLabEngine({ mount, store }) {
  let preview = null;
  let director = null;
  let unsubscribe = null;
  let animationFrame = null;
  let previousTime = null;
  let appliedKey = null;
  let disposed = false;

  function applyState() {
    if (!preview || !director) return;
    const state = store.getState();
    const key = JSON.stringify({
      conditionId: state.conditionId,
      name: state.name,
      previewHour: state.previewHour,
      settings: state.settings,
      view: state.view,
    });
    if (key === appliedKey) return;
    appliedKey = key;
    director.setProfile(profileFromState(state));
    director.setDayPhase(atmosphericPreviewPhaseForHour(state.previewHour));
    director.setExposure(state.view.exposure);
    const nativeReference = state.view.previewMode === 'native';
    preview.setAuthoredBaselinesEnabled(nativeReference);
    preview.setEffectsEnabled(!nativeReference && state.view.effectsEnabled);
    document.body.dataset.previewTimeOfDay =
      `${String(Math.floor(state.previewHour)).padStart(2, '0')}:${
        String(Math.round((state.previewHour % 1) * 60)).padStart(2, '0')
      }`;
    document.body.dataset.atmosphericCondition =
      state.conditionId ?? 'custom';
    document.body.dataset.atmosphericConditionSet = state.setId;
    document.body.dataset.atmosphericPreviewMode =
      nativeReference ? 'native' : 'diagnostic';
  }

  function tick(time) {
    if (disposed) return;
    const state = store.getState();
    if (state.previewAutoCycle) {
      const delta = previousTime === null
        ? 0
        : Math.min((time - previousTime) / 1000, 0.1);
      // One preview day every 48 seconds.
      store.actions.setPreviewHour((state.previewHour + delta * 0.5) % 24);
    }
    previousTime = time;
    animationFrame = requestAnimationFrame(tick);
  }

  return {
    get preview() {
      return preview;
    },

    async start() {
      if (preview || disposed) return;
      preview = await createSkyCloudAtmospherePreview({
        container: mount,
        effectsEnabled: store.getState().view.effectsEnabled,
        mode: store.getState().view.previewMode,
      });
      if (disposed) {
        preview.dispose();
        preview = null;
        return;
      }
      director = createAtmosphericConditionDirector({
        dayPhase: atmosphericPreviewPhaseForHour(
          store.getState().previewHour,
        ),
        exposure: store.getState().view.exposure,
        profile: profileFromState(store.getState()),
        sink: (frame) => preview?.setFrame(frame),
      });
      preview.setFrame(director.frame).start();
      unsubscribe = store.subscribe(applyState);
      applyState();
      animationFrame = requestAnimationFrame(tick);
      document.body.dataset.atmosphericConditionLabReady = 'true';
      document.body.dataset.atmosphericPreviewDomains =
        SKY_CLOUD_ATMOSPHERE_PREVIEW_DOMAINS.join(',');
      store.actions.adoptEngineState({
        engineReady: true,
        status: 'Live shared environment preview ready.',
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      unsubscribe?.();
      director?.dispose();
      preview?.dispose();
      director = null;
      preview = null;
    },
  };
}
