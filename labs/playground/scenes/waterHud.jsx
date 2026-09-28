import React, { useCallback, useEffect, useState } from 'react';

import { TOONLAB_VERSION } from '@call-me-sensei/toonlab';
import {
  createWaterSettings,
  sanitizeWaterPresetSettings,
  WATER_COLOR_TONE_NAMES,
  WATER_DEBUG_MODES,
  WATER_PRESET_NAMES,
} from '@call-me-sensei/toonlab/water-settings';
import {
  CHARACTER_MODEL_OPTIONS,
  navigateSceneHub,
  navigateToCharacterModel,
  normalizeModelPath,
  SCENE_HUB_OPTIONS,
} from '../../shared/sceneHub.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { modelLabelFromUrl } from '../hud.js';
import { MODEL_URL } from '../params.js';
import {
  WATER_ENVIRONMENT_PRESETS,
  WATER_ENVIRONMENT_PRESET_NAMES,
} from './stage.js';

function initialStyleBundles() {
  const injected = Array.isArray(window.__toonlabStyleBundleOptions)
    ? window.__toonlabStyleBundleOptions
    : [];
  const options = new Map([
    ['call-me-sensei', { id: 'call-me-sensei', label: 'Call Me Sensei' }],
  ]);
  for (const entry of injected) {
    if (entry?.id) options.set(entry.id, { id: entry.id, label: entry.label || entry.id });
  }
  return [...options.values()];
}

export function formatWaterValue(value, digits = 2) {
  return Number(value).toFixed(digits);
}

export function WalkableSampleHud({
  cameraMode = 'follow',
  envPreset = 'noon',
  inspector = null,
  onCameraModeChange,
  onEnvPresetChange,
  onStyleBundleChange,
}) {
  const [styleBundles, setStyleBundles] = useState(initialStyleBundles);
  const [styleBundleId, setStyleBundleId] = useState(() => (
    new URLSearchParams(window.location.search).get('styleBundle')
      || window.__toonlabActiveStyleBundleId
      || 'call-me-sensei'
  ));
  const [inspectorReport, setInspectorReport] = useState(null);
  const [inspectorBusy, setInspectorBusy] = useState(null);
  const [inspectorError, setInspectorError] = useState('');

  useEffect(() => {
    if (!inspector) {
      setInspectorReport(null);
      return undefined;
    }
    return inspector.subscribe(setInspectorReport);
  }, [inspector]);

  const toggleDomain = useCallback(async (domain, enabled) => {
    if (!inspector) return;
    setInspectorBusy(domain);
    setInspectorError('');
    try {
      await inspector.setDomainEnabled(domain, enabled);
    } catch (error) {
      setInspectorError(error?.message ?? String(error));
    } finally {
      setInspectorBusy(null);
    }
  }, [inspector]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/toonlab/library')
      .then((response) => (response.ok ? response.json() : { entries: [] }))
      .then(({ entries = [] }) => {
        if (cancelled) return;
        const available = entries
          .filter((entry) => entry?.type === 'style-bundle' || entry?.schema === 'toonlab/style-bundle')
          .filter((entry) => entry.id && entry.id !== 'call-me-sensei')
          .map((entry) => ({ id: entry.id, label: entry.label || entry.id }));
        setStyleBundles((current) => {
          const merged = new Map(current.map((entry) => [entry.id, entry]));
          for (const entry of available) merged.set(entry.id, entry);
          return [...merged.values()];
        });
      })
      .catch(() => {
        // Anonymous/standalone OSS sessions retain the protected system style.
      });
    return () => { cancelled = true; };
  }, []);

  const selectStyleBundle = useCallback((id) => {
    const nextId = styleBundles.some((bundle) => bundle.id === id) ? id : 'call-me-sensei';
    setStyleBundleId(nextId);
    const params = new URLSearchParams(window.location.search);
    if (nextId === 'call-me-sensei') params.delete('styleBundle');
    else params.set('styleBundle', nextId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    document.body.dataset.styleBundle = nextId;
  }, [styleBundles]);

  useEffect(() => {
    if (!styleBundles.some((bundle) => bundle.id === styleBundleId)) {
      selectStyleBundle('call-me-sensei');
      return;
    }
    document.body.dataset.styleBundle = styleBundleId;
    onStyleBundleChange?.(styleBundleId);
  }, [onStyleBundleChange, selectStyleBundle, styleBundleId, styleBundles]);

  return (
    <div className="water-hud">
      <div className="water-hud-title">Walkable Sample</div>
      <div className="water-hud-grid">
        <label htmlFor="sampleModel">Character</label>
        <select
          id="sampleModel"
          value={CHARACTER_MODEL_OPTIONS.find((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL))?.model ?? MODEL_URL}
          onChange={(event) => navigateToCharacterModel(event.target.value)}
        >
          {CHARACTER_MODEL_OPTIONS.map((option) => (
            <option key={option.model} value={option.model}>{option.label}</option>
          ))}
          {!CHARACTER_MODEL_OPTIONS.some((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL)) && (
            <option value={MODEL_URL}>{`Custom: ${modelLabelFromUrl(MODEL_URL)}`}</option>
          )}
        </select>
        <output htmlFor="sampleModel">{modelLabelFromUrl(MODEL_URL)}</output>

        <label htmlFor="sampleStyleBundle">Style Bundle</label>
        <select
          id="sampleStyleBundle"
          value={styleBundleId}
          onChange={(event) => selectStyleBundle(event.target.value)}
        >
          {styleBundles.map((bundle) => (
            <option key={bundle.id} value={bundle.id}>{bundle.label}</option>
          ))}
        </select>
        <output htmlFor="sampleStyleBundle">
          {styleBundles.find((bundle) => bundle.id === styleBundleId)?.label ?? 'Call Me Sensei'}
        </output>

        <label htmlFor="sampleTimeOfDay">Time of Day</label>
        <select
          id="sampleTimeOfDay"
          value={envPreset}
          onChange={(event) => onEnvPresetChange?.(event.target.value)}
        >
          {WATER_ENVIRONMENT_PRESET_NAMES.map((name) => (
            <option key={name} value={name}>{WATER_ENVIRONMENT_PRESETS[name].label}</option>
          ))}
        </select>
        <output htmlFor="sampleTimeOfDay">{WATER_ENVIRONMENT_PRESETS[envPreset]?.label ?? envPreset}</output>

        <label htmlFor="sampleCamera">Camera</label>
        <select
          id="sampleCamera"
          value={cameraMode}
          onChange={(event) => onCameraModeChange?.(event.target.value)}
        >
          <option value="follow">Follow (3rd person)</option>
          <option value="free">Free (pan / zoom)</option>
        </select>
        <output htmlFor="sampleCamera">{cameraMode} · V</output>

        <span className="water-hud-label">Package</span>
        <strong className="water-hud-package">@call-me-sensei/toonlab</strong>
        <output>v{TOONLAB_VERSION}</output>
      </div>
      <div className="style-inspector" data-testid="toonlab-style-inspector">
        <div className="style-inspector-heading">
          <strong>Shader Inspector</strong>
          <span>{inspectorReport ? `${inspectorReport.targets.length} targets` : 'Connecting…'}</span>
        </div>
        <div className="style-inspector-domains">
          {(inspectorReport?.domains ?? []).map((domain) => (
            <label key={domain.domain} className="style-inspector-toggle">
              <input
                type="checkbox"
                checked={domain.enabled}
                disabled={!domain.controllable || inspectorBusy === domain.domain}
                onChange={(event) => toggleDomain(domain.domain, event.target.checked)}
              />
              <span>{formatInspectorDomain(domain.domain)}</span>
              <small>{domain.targets.length}</small>
            </label>
          ))}
          {inspectorReport && inspectorReport.domains.length === 0 && (
            <span className="style-inspector-empty">No styled targets registered yet.</span>
          )}
        </div>
        <div className="style-inspector-note">Off restores the exact pre-ToonLab state.</div>
        {inspectorError && <div className="style-inspector-error" role="alert">{inspectorError}</div>}
      </div>
    </div>
  );
}

const INSPECTOR_DOMAIN_LABELS = Object.freeze({
  lighting: 'Lighting',
  'natural.rock': 'Rock Shader',
  sky: 'Sky & Cloud',
  'terrain.ground': 'Ground Shader',
  'vegetation.flower': 'Flower Shader',
  'vegetation.grass': 'Grass Shader',
  'vegetation.tree': 'Tree Shader',
  water: 'Water Shader',
});

function formatInspectorDomain(domain) {
  return INSPECTOR_DOMAIN_LABELS[domain] ?? domain
    .split(/[.\-_]/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function WaterHud({ cameraMode = 'follow', debugMode, envPreset, onCameraModeChange, onDebugModeChange, onDropBall, onDropSinker, onEnvPresetChange, onSettingsChange, settings }) {
  const sceneHubId = 'waterPlayground';
  const sceneHubLabel = SCENE_HUB_OPTIONS.find((option) => option.id === sceneHubId)?.label || 'Water Playground';

  // Round trip with the standalone Water Lab: carry the live settings over so
  // in-scene tweaks keep editing from where they left off.
  const editInWaterLab = useCallback(() => {
    setLabHandoff('water-lab-import', {
      preset: settings.mode ?? null,
      settings: sanitizeWaterPresetSettings(settings),
    });
    window.location.href = '/water-lab/';
  }, [settings]);
  const updateSetting = useCallback((key, value) => {
    if (key === 'mode') {
      // Fresh preset load, re-tinted by the active environment preset. The
      // chosen color tone survives the reload.
      const environment = WATER_ENVIRONMENT_PRESETS[envPreset];
      onSettingsChange(createWaterSettings({
        mode: value,
        ...(environment?.water ?? {}),
        colorTone: settings.colorTone,
      }));
      return;
    }

    if (key === 'colorTone') {
      // Drop the palette values the previous tone forced, then rebuild with
      // the environment tint so 'classic' returns to the preset/env colors.
      const {
        shallowColor, midColor, deepColor,
        depthFadeDistance, deepFadeDistance, fresnelColor,
        fresnelBias, reflectionStrength, reflectionSoftness, causticsStrength,
        detailNormalStrength,
        ...rest
      } = settings;
      const environment = WATER_ENVIRONMENT_PRESETS[envPreset];
      onSettingsChange(createWaterSettings({
        ...rest,
        ...(environment?.water ?? {}),
        colorTone: value,
      }));
      return;
    }

    onSettingsChange(createWaterSettings({
      ...settings,
      [key]: value,
    }));
  }, [envPreset, onSettingsChange, settings]);

  return (
    <div className="water-hud">
      <div className="water-hud-title">Water Lab</div>
      <div className="water-hud-grid">
        <label htmlFor="waterSceneHub">Scene</label>
        <select
          id="waterSceneHub"
          value={sceneHubId}
          onChange={(event) => navigateSceneHub(event.target.value)}
        >
          {SCENE_HUB_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <output htmlFor="waterSceneHub">{sceneHubLabel}</output>

        <label htmlFor="waterModel">Model</label>
        <select
          id="waterModel"
          value={CHARACTER_MODEL_OPTIONS.find((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL))?.model ?? MODEL_URL}
          onChange={(event) => navigateToCharacterModel(event.target.value)}
        >
          {CHARACTER_MODEL_OPTIONS.map((option) => (
            <option key={option.model} value={option.model}>{option.label}</option>
          ))}
          {!CHARACTER_MODEL_OPTIONS.some((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL)) && (
            <option value={MODEL_URL}>{`Custom: ${modelLabelFromUrl(MODEL_URL)}`}</option>
          )}
        </select>
        <output htmlFor="waterModel">{modelLabelFromUrl(MODEL_URL)}</output>

        <label htmlFor="waterMode">Mode</label>
        <select
          id="waterMode"
          value={settings.mode}
          onChange={(event) => updateSetting('mode', event.target.value)}
        >
          {WATER_PRESET_NAMES.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
          {!WATER_PRESET_NAMES.includes(settings.mode) && (
            <option value={settings.mode}>{settings.mode}</option>
          )}
        </select>
        <output htmlFor="waterMode">{settings.mode}</output>

        <label htmlFor="waterTone">Tone</label>
        <select
          id="waterTone"
          value={settings.colorTone}
          onChange={(event) => updateSetting('colorTone', event.target.value)}
        >
          {WATER_COLOR_TONE_NAMES.map((tone) => (
            <option key={tone} value={tone}>{tone}</option>
          ))}
        </select>
        <output htmlFor="waterTone">{settings.colorTone}</output>

        <label htmlFor="waterEnv">Env</label>
        <select
          id="waterEnv"
          value={envPreset}
          onChange={(event) => onEnvPresetChange(event.target.value)}
        >
          {WATER_ENVIRONMENT_PRESET_NAMES.map((name) => (
            <option key={name} value={name}>{WATER_ENVIRONMENT_PRESETS[name].label}</option>
          ))}
        </select>
        <output htmlFor="waterEnv">{envPreset}</output>

        <label htmlFor="waterCamera">Camera</label>
        <select
          id="waterCamera"
          value={cameraMode}
          onChange={(event) => onCameraModeChange?.(event.target.value)}
        >
          <option value="follow">Follow (3rd person)</option>
          <option value="free">Free (pan / zoom)</option>
        </select>
        <output htmlFor="waterCamera">{cameraMode} · V</output>

        <label htmlFor="waterIntensity">Intensity</label>
        <input
          id="waterIntensity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.waveIntensity}
          onChange={(event) => updateSetting('waveIntensity', Number(event.target.value))}
        />
        <output htmlFor="waterIntensity">{formatWaterValue(settings.waveIntensity)}</output>

        <label htmlFor="waterBreakers">Breakers</label>
        <input
          id="waterBreakers"
          type="checkbox"
          checked={settings.breakerEnabled !== false}
          onChange={(event) => updateSetting('breakerEnabled', event.target.checked)}
        />
        <output htmlFor="waterBreakers">{settings.breakerEnabled !== false ? 'on' : 'off'}</output>

        <label htmlFor="waterSurf">Surf</label>
        <input
          id="waterSurf"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.breakerAmount}
          onChange={(event) => updateSetting('breakerAmount', Number(event.target.value))}
        />
        <output htmlFor="waterSurf">{formatWaterValue(settings.breakerAmount)}</output>

        <label htmlFor="waterHeight">Height</label>
        <input
          id="waterHeight"
          type="range"
          min="0.05"
          max="5"
          step="0.05"
          value={settings.waveAmplitude}
          onChange={(event) => updateSetting('waveAmplitude', Number(event.target.value))}
        />
        <output htmlFor="waterHeight">{formatWaterValue(settings.waveAmplitude)}</output>

        <label htmlFor="waterSets">Sets</label>
        <input
          id="waterSets"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.waveSetStrength}
          onChange={(event) => updateSetting('waveSetStrength', Number(event.target.value))}
        />
        <output htmlFor="waterSets">{formatWaterValue(settings.waveSetStrength)}</output>

        <label htmlFor="waterSetTime">Set Time</label>
        <input
          id="waterSetTime"
          type="range"
          min="10"
          max="300"
          step="5"
          value={settings.waveSetPeriod}
          onChange={(event) => updateSetting('waveSetPeriod', Number(event.target.value))}
        />
        <output htmlFor="waterSetTime">{Math.round(settings.waveSetPeriod)}s</output>

        <label htmlFor="waterCurl">Curl</label>
        <input
          id="waterCurl"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.breakerCurl}
          onChange={(event) => updateSetting('breakerCurl', Number(event.target.value))}
        />
        <output htmlFor="waterCurl">{formatWaterValue(settings.breakerCurl)}</output>

        <label htmlFor="waterLevel">Level</label>
        <input
          id="waterLevel"
          type="range"
          min="0.12"
          max="0.68"
          step="0.01"
          value={settings.waterLevel}
          onChange={(event) => updateSetting('waterLevel', Number(event.target.value))}
        />
        <output htmlFor="waterLevel">{formatWaterValue(settings.waterLevel)}</output>

        <label htmlFor="waterSplash">Splash</label>
        <input
          id="waterSplash"
          type="range"
          min="0"
          max="2.5"
          step="0.05"
          value={settings.splashStrength}
          onChange={(event) => updateSetting('splashStrength', Number(event.target.value))}
        />
        <output htmlFor="waterSplash">{formatWaterValue(settings.splashStrength)}</output>

        <label htmlFor="waterFlowSpeed">Flow</label>
        <input
          id="waterFlowSpeed"
          type="range"
          min="0"
          max="1.25"
          step="0.01"
          value={settings.flowSpeed}
          onChange={(event) => updateSetting('flowSpeed', Number(event.target.value))}
        />
        <output htmlFor="waterFlowSpeed">{formatWaterValue(settings.flowSpeed)}</output>

        <label htmlFor="waterFoam">Foam</label>
        <input
          id="waterFoam"
          type="range"
          min="0"
          max="1.2"
          step="0.01"
          value={settings.foamAmount}
          onChange={(event) => updateSetting('foamAmount', Number(event.target.value))}
        />
        <output htmlFor="waterFoam">{formatWaterValue(settings.foamAmount)}</output>

        <label htmlFor="waterReflection">Reflect</label>
        <input
          id="waterReflection"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.reflectionStrength}
          onChange={(event) => updateSetting('reflectionStrength', Number(event.target.value))}
        />
        <output htmlFor="waterReflection">{formatWaterValue(settings.reflectionStrength)}</output>

        <label htmlFor="waterDamping">Damping</label>
        <input
          id="waterDamping"
          type="range"
          min="0.94"
          max="0.998"
          step="0.001"
          value={settings.rippleDamping}
          onChange={(event) => updateSetting('rippleDamping', Number(event.target.value))}
        />
        <output htmlFor="waterDamping">{formatWaterValue(settings.rippleDamping, 3)}</output>

        <label htmlFor="waterImpulse">Impulse</label>
        <input
          id="waterImpulse"
          type="range"
          min="0.1"
          max="2.5"
          step="0.01"
          value={settings.rippleStrength}
          onChange={(event) => updateSetting('rippleStrength', Number(event.target.value))}
        />
        <output htmlFor="waterImpulse">{formatWaterValue(settings.rippleStrength)}</output>

        <label htmlFor="waterDebug">Debug</label>
        <select
          id="waterDebug"
          value={debugMode}
          onChange={(event) => onDebugModeChange(event.target.value)}
        >
          {Object.keys(WATER_DEBUG_MODES).map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
        <output htmlFor="waterDebug">{debugMode}</output>
      </div>
      <div className="water-drop-buttons">
        <button className="water-drop-button" type="button" onClick={onDropBall}>Drop Ball</button>
        <button className="water-sinker-button" type="button" onClick={onDropSinker}>Drop Sinker</button>
        <button className="water-drop-button" type="button" onClick={editInWaterLab}>Edit in Water Lab</button>
      </div>
    </div>
  );
}
