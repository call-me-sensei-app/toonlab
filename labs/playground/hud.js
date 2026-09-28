// DOM HUD glue shared by the playground modules: the mode label line, and the
// animation-toggle button wiring.
import {
  INDOOR_SCENE_ENABLED,
  MODEL_URL,
  SHADER_MODE,
  WATER_SCENE_ENABLED,
} from './params.js';

function modelLabelFromUrl(url) {
  const cleanUrl = url.split(/[?#]/)[0];
  const fileName = cleanUrl.slice(cleanUrl.lastIndexOf('/') + 1) || cleanUrl;
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function updateModeLabel(state = 'loading') {
  const el = document.getElementById('mode');
  if (!el) return;
  const title = document.querySelector('#info h1');
  if (title) {
    title.textContent = WATER_SCENE_ENABLED
      ? 'Water Lab'
      : INDOOR_SCENE_ENABLED
        ? 'Environment Playground (Indoor)'
        : 'Playground';
  }
  const sceneLabel = WATER_SCENE_ENABLED ? 'Water' : INDOOR_SCENE_ENABLED ? 'Environment' : 'Controller';
  el.textContent = `Model: ${modelLabelFromUrl(MODEL_URL)} · Shader: ${SHADER_MODE} · ${sceneLabel}: ecctrl · ${state}`;
}

function updateAnimationToggle({ action = null, actions = null, enabled = false, label = 'Controller On' } = {}) {
  const button = document.getElementById('animationToggle');
  if (!button) return () => {};

  const controlledActions = actions || (action ? [action] : []);
  if (controlledActions.length === 0) {
    button.textContent = label;
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    return () => {};
  }

  let playbackEnabled = enabled;
  const syncButton = () => {
    button.textContent = playbackEnabled ? 'Animation On' : 'Animation Off';
    button.disabled = false;
    button.setAttribute('aria-pressed', playbackEnabled ? 'true' : 'false');
    document.body.dataset.animationPlayback = playbackEnabled ? 'on' : 'off';
  };
  const onClick = () => {
    playbackEnabled = !playbackEnabled;
    for (const controlledAction of controlledActions) {
      controlledAction.paused = !playbackEnabled;
      if (playbackEnabled) controlledAction.play();
    }
    syncButton();
  };

  syncButton();
  button.addEventListener('click', onClick);

  return () => {
    button.removeEventListener('click', onClick);
  };
}

export {
  modelLabelFromUrl,
  updateModeLabel,
  updateAnimationToggle,
};
