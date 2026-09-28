import {
  Button,
  Modal,
  PreviewToggle,
  Select,
} from '../../shared/ui/index.js';
import {
  VEGETATION_PREVIEW_COMPONENTS,
  VEGETATION_PREVIEW_COMPONENT_STYLE_OPTIONS,
  VEGETATION_PREVIEW_SCENE_PRESETS,
  VEGETATION_PREVIEW_STYLE_BUNDLES,
} from './previewSettings.js';

export function VegetationPreviewStylesModal({
  actions,
  artifactLabel,
  authoredComponent,
  onClose,
  state,
}) {
  const authoredComponents = new Set(
    (Array.isArray(authoredComponent) ? authoredComponent : [authoredComponent]).filter(Boolean),
  );
  const contextComponents = VEGETATION_PREVIEW_COMPONENTS
    .filter((component) => !authoredComponents.has(component.id));
  const overrideCount = contextComponents.filter((component) => (
    state.preview.componentStyles[component.id] !== 'inherit'
  )).length;

  return (
    <Modal onClose={onClose} testId="preview-styles-modal" title="Preview styles" width={680}>
      <div className="vegetation-preview-settings">
        <p>
          Choose a first-party procedural review bundle, then override or hide
          surrounding domains. Preview choices are never included in the exported {artifactLabel}.
        </p>
        <div className="vegetation-preview-settings__primary">
          <label>
            <span>Validation scene</span>
            <Select
              onChange={actions.setPreviewScenePreset}
              options={VEGETATION_PREVIEW_SCENE_PRESETS.map(({ id, label }) => ({ label, value: id }))}
              testId="preview-scene-preset"
              value={state.preview.scenePreset}
            />
          </label>
          <label>
            <span>Style bundle</span>
            <Select
              onChange={actions.setPreviewBundle}
              options={VEGETATION_PREVIEW_STYLE_BUNDLES.map(({ id, label }) => ({ label, value: id }))}
              testId="preview-style-bundle"
              value={state.preview.bundle}
            />
          </label>
        </div>
        <div className="vegetation-preview-settings__divider" />
        <div className="vegetation-preview-settings__heading-row">
          <div>
            <div className="vegetation-preview-settings__heading">Surrounding shaders</div>
            <div className="vegetation-preview-settings__caption">
              “From bundle” follows the selected bundle. Visibility stays preview-only.
            </div>
          </div>
          <span className="vegetation-preview-settings__override-count">
            {overrideCount} override{overrideCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="vegetation-preview-settings__domains">
          {contextComponents.map((component) => (
            <label key={component.id}>
              <span><strong>{component.label}</strong><small>{component.description}</small></span>
              <Select
                onChange={(style) => actions.setPreviewComponentStyle(component.id, style)}
                options={VEGETATION_PREVIEW_COMPONENT_STYLE_OPTIONS}
                testId={`preview-style-${component.id}`}
                value={state.preview.componentStyles[component.id]}
              />
              <PreviewToggle
                checked={state.preview.componentVisibility[component.id]}
                label="Show"
                onChange={(visible) => actions.setPreviewComponentVisible(component.id, visible)}
                testId={`preview-visible-${component.id}`}
                title={`Show or hide ${component.label} in this preview only.`}
              />
            </label>
          ))}
        </div>
        <div className="vegetation-preview-settings__actions">
          <Button kind="secondary" onClick={actions.resetPreviewSettings} testId="reset-preview-settings">
            Reset preview
          </Button>
          <Button kind="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
