import {
  useEffect, useMemo, useRef, useState,
} from 'react';

import {
  Badge,
  BrandLockup,
  Button,
  createLabEditorMenus,
  IconButton,
  Kbd,
  LabTimeOfDayControl,
  LabEditorHeader,
  Modal,
  PreviewBar,
  RendererToggle,
  ScrubValue,
  Select,
  TextField,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaField } from '../../shared/ui/schema/SchemaField.jsx';
import { downloadBlob } from '../../shared/download.js';
import {
  getVfxEffectTemplate,
  getVfxEffectTemplateOptions,
  getVfxEnergyMotionThemeOptions,
  getVfxIntentOptions,
  getVfxSourceGeneratorOptions,
  getVfxStyleOptions,
  createVfxAxialProfile,
  normalizeVfxSilhouetteProfile,
  VFX_ENERGY_MOTION_CUSTOM_THEME_ID,
} from '../../../src/vfxgen/index.js';

const EDITOR_SECTIONS = [
  { icon: '◆', id: 'design', label: 'Design' },
  { icon: '◎', id: 'renderers', label: 'Renderers' },
  { icon: '◒', id: 'shape', label: 'Shape' },
  { icon: 'ϟ', id: 'motion', label: 'Motion' },
  { icon: '▶', id: 'sequence', label: 'Sequence' },
  { icon: '▧', id: 'sources', label: 'Sources' },
  { icon: '☰', id: 'layers', label: 'Layers' },
  { icon: '◫', id: 'quality', label: 'Quality' },
];

const RENDERER_PARAMETER_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Emission and surface treatment applied by the referenced core, shell, and filament renderers.',
    id: 'appearance',
    label: 'Energy appearance',
  }),
  Object.freeze({
    description: 'Shared colors resolved through the selected VFX style before effect-local overrides.',
    id: 'palette',
    label: 'Renderer palette',
  }),
  Object.freeze({
    description: 'Portable advice for the host lighting and post-processing integrations.',
    id: 'lighting',
    label: 'Local lighting',
  }),
  Object.freeze({
    description: 'Recommended contribution to compatible host post stacks; the preview post stack remains host-owned.',
    id: 'post',
    label: 'Post contribution',
  }),
]);

function titleCase(value) {
  return String(value).replace(/(^|-)(\w)/g, (_, space, letter) => (
    `${space ? ' ' : ''}${letter.toUpperCase()}`
  ));
}

function parameterField(parameter) {
  return {
    control: parameter.type === 'enum' ? 'select' : undefined,
    defaultValue: parameter.default,
    description: parameter.description,
    group: `effect-${parameter.group}`,
    id: `effect-${parameter.id}`,
    key: parameter.id,
    label: parameter.label,
    options: parameter.options,
    range: parameter.type === 'number'
      ? { max: parameter.max, min: parameter.min, step: parameter.step }
      : undefined,
    type: parameter.type === 'enum' ? 'select' : parameter.type,
  };
}

function MirroredProfileEditor({
  active,
  guidedProfile,
  onActiveChange,
  onChange,
  onCommit,
  profile,
}) {
  const canvasRef = useRef(null);
  const draftRef = useRef(normalizeVfxSilhouetteProfile(profile));
  const lastIndexRef = useRef(null);
  const displayedProfile = active
    ? normalizeVfxSilhouetteProfile(profile)
    : normalizeVfxSilhouetteProfile(guidedProfile);

  useEffect(() => {
    draftRef.current = displayedProfile;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 280);
      const height = Math.max(rect.height, 150);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext('2d');
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const padX = 18;
      const centerY = height * 0.52;
      const radialScale = centerY - 25;
      const xAt = (index) => padX + (index / (displayedProfile.length - 1)) * (width - padX * 2);
      const yAt = (radius, sign = -1) => centerY + sign * radius * radialScale;

      context.fillStyle = '#0b1019';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = 'rgba(136, 168, 218, .13)';
      context.lineWidth = 1;
      for (let division = 0; division <= 4; division += 1) {
        const x = padX + (division / 4) * (width - padX * 2);
        context.beginPath();
        context.moveTo(x, 14);
        context.lineTo(x, height - 17);
        context.stroke();
      }
      context.setLineDash([5, 5]);
      context.strokeStyle = 'rgba(139, 181, 255, .42)';
      context.beginPath();
      context.moveTo(padX, centerY);
      context.lineTo(width - padX, centerY);
      context.stroke();
      context.setLineDash([]);

      context.beginPath();
      displayedProfile.forEach((radius, index) => {
        const x = xAt(index);
        const y = yAt(radius);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      for (let index = displayedProfile.length - 1; index >= 0; index -= 1) {
        context.lineTo(xAt(index), yAt(displayedProfile[index], 1));
      }
      context.closePath();
      const fill = context.createLinearGradient(padX, 0, width - padX, 0);
      fill.addColorStop(0, 'rgba(78, 148, 255, .28)');
      fill.addColorStop(0.55, 'rgba(123, 224, 255, .52)');
      fill.addColorStop(1, 'rgba(78, 148, 255, .22)');
      context.fillStyle = fill;
      context.fill();

      const strokeHalf = (sign, alpha) => {
        context.beginPath();
        displayedProfile.forEach((radius, index) => {
          const x = xAt(index);
          const y = yAt(radius, sign);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = `rgba(140, 222, 255, ${alpha})`;
        context.lineWidth = sign < 0 ? 2.2 : 1.2;
        context.stroke();
      };
      strokeHalf(-1, 1);
      strokeHalf(1, 0.48);

      context.fillStyle = 'rgba(205, 220, 244, .58)';
      context.font = '10px ui-monospace, monospace';
      context.fillText('FRONT / NOSE', padX, height - 5);
      const rear = 'REAR / TAIL';
      context.fillText(rear, width - padX - context.measureText(rear).width, height - 5);
      context.fillStyle = 'rgba(139, 181, 255, .7)';
      context.fillText('DRAW THIS HALF', padX + 5, 16);
      context.fillStyle = 'rgba(205, 220, 244, .38)';
      context.fillText('MIRRORED', padX + 5, centerY + 17);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active, displayedProfile.join(',')]);

  const writePointer = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const padX = 18;
    const centerY = rect.height * 0.52;
    const radialScale = centerY - 25;
    const x = Math.min(Math.max(event.clientX - rect.left, padX), rect.width - padX);
    const y = event.clientY - rect.top;
    const position = (x - padX) / Math.max(rect.width - padX * 2, 1);
    const radius = Math.min(Math.max((centerY - y) / Math.max(radialScale, 1), 0), 1);
    const next = draftRef.current.slice();
    const index = Math.round(position * (next.length - 1));
    const previous = lastIndexRef.current;
    if (previous === null || previous === index) {
      next[index] = radius;
    } else {
      const start = Math.min(previous, index);
      const end = Math.max(previous, index);
      const startValue = next[previous];
      for (let cursor = start; cursor <= end; cursor += 1) {
        const mix = (cursor - previous) / (index - previous);
        next[cursor] = startValue + (radius - startValue) * mix;
      }
    }
    next[0] = 0;
    next[next.length - 1] = 0;
    lastIndexRef.current = index;
    draftRef.current = next;
    onChange(next);
  };

  return (
    <div className="vl-profile-editor" data-active={active} data-testid="mirrored-profile-editor">
      <div className="vl-profile-heading">
        <div>
          <strong>Mirrored half-profile</strong>
          <span>Draw the upper contour from nose to tail. The lower half is generated automatically.</span>
        </div>
        <Badge tone={active ? 'positive' : 'neutral'}>{active ? 'Drawn shape active' : 'Guided shape active'}</Badge>
      </div>
      <canvas
        aria-label="Draw one half of the projectile silhouette; the other half is mirrored"
        className="vl-profile-canvas"
        onPointerDown={(event) => {
          const startingProfile = active
            ? normalizeVfxSilhouetteProfile(profile)
            : normalizeVfxSilhouetteProfile(guidedProfile);
          if (!active) onActiveChange(true);
          draftRef.current = startingProfile;
          lastIndexRef.current = null;
          event.currentTarget.setPointerCapture(event.pointerId);
          writePointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) writePointer(event);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          lastIndexRef.current = null;
          onCommit();
        }}
        ref={canvasRef}
      />
      <div className="vl-profile-actions">
        <Button
          kind={active ? 'secondary' : 'primary'}
          onClick={() => {
            onChange(guidedProfile);
            onActiveChange(true);
            onCommit();
          }}
        >
          Start from guided shape
        </Button>
        <Button
          disabled={!active}
          kind="ghost"
          onClick={() => {
            onActiveChange(false);
            onCommit();
          }}
        >
          Use taper controls
        </Button>
        <span>Axial revolve · vertical mirror · normalized 0–1</span>
      </div>
    </div>
  );
}

function DesignPanel({ actions, state }) {
  const template = getVfxEffectTemplate(state.templateId);
  const effect = state.effectDocument;
  const parameterGroups = [...new Set(effect.parameters
    .map((parameter) => parameter.group)
    .filter((group) => ![
      'appearance',
      'energy-motion',
      'lighting',
      'palette',
      'post',
      'release',
      'shape',
    ].includes(group)))];
  return (
    <>
      <section className="tk-section vl-effect-summary" data-testid="effect-workspace-summary">
        <div className="vl-eyebrow">Effect document</div>
        <div className="vl-effect-summary-title">
          <span>{effect.label}</span>
          <Badge tone="positive">Isolated</Badge>
        </div>
        <div className="tk-section-caption">
          {template?.description} This workspace previews and exports only this effect.
        </div>
        <div className="vl-effect-meta">
          <span>{effect.intent.path.join(' / ')}</span>
          <span>{effect.id}</span>
        </div>
      </section>

      <section className="tk-section">
        <div className="tk-section-title">Structure</div>
        <div className="tk-section-caption">
          These answers define the effect’s lifecycle and composition. Planned variants are not
          mixed into the working controls.
        </div>
        <div className="vl-question-list">
          {(template?.questions ?? []).map((question) => {
            const supported = question.options.filter((option) => option.supported !== false);
            return (
              <div className="vl-question" key={question.id}>
                <span>{question.label}</span>
                <Select
                  disabled={supported.length < 2}
                  onChange={(value) => actions.setTemplateAnswer(question.id, value)}
                  options={supported.map((option) => ({ label: option.label, value: option.value }))}
                  testId={`template-question-${question.id}`}
                  value={state.templateAnswers[question.id]}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="tk-section">
        <div className="tk-section-title">Runtime preview input</div>
        <div className="tk-section-caption">
          Charge changes preview playback but is not baked into the reusable effect.
        </div>
        <SchemaField
          field={{
            defaultValue: 1,
            description: 'Runtime charge supplied to the next preview.',
            group: 'preview',
            key: 'charge',
            label: 'Charge',
            range: { max: 1, min: 0, step: 0.01 },
            type: 'number',
          }}
          onChange={actions.setChargePreview}
          value={state.chargePreview}
        />
      </section>

      {parameterGroups.map((groupId) => (
        <section className="tk-section" key={groupId} data-testid={`effect-parameters-${groupId}`}>
          <div className="tk-section-title">{titleCase(groupId)}</div>
          <div className="tk-section-fields">
            {effect.parameters
              .filter((parameter) => parameter.group === groupId)
              .map((parameter) => (
                <SchemaField
                  field={parameterField(parameter)}
                  key={parameter.id}
                  onChange={(value) => actions.setEffectParameter(parameter.id, value)}
                  value={parameter.value}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function RendererProfilesPanel({ actions, state }) {
  const profiles = [];
  const profilesById = new Map();
  for (const layer of state.effectDocument.layers) {
    const profileId = layer.renderer?.profile;
    if (!profileId) continue;
    let profile = profilesById.get(profileId);
    if (!profile) {
      profile = {
        id: profileId,
        layers: [],
        sources: new Set(),
        types: new Set(),
      };
      profilesById.set(profileId, profile);
      profiles.push(profile);
    }
    profile.layers.push(layer);
    profile.types.add(layer.type);
    if (layer.source?.asset) profile.sources.add(layer.source.asset);
  }

  return (
    <>
      <section className="tk-section vl-renderer-intro" data-testid="renderer-profiles-workspace">
        <div className="vl-eyebrow">VFX renderer profiles</div>
        <div className="vl-renderer-heading">
          <div>
            <div className="tk-section-title">Render this effect without owning its behavior</div>
            <div className="tk-section-caption">
              These stable renderer references control presentation. Effect intent, phases,
              spawning, timing, and source-asset identity stay in their own workspaces.
            </div>
          </div>
          <Badge tone="positive">{profiles.length} referenced</Badge>
        </div>
      </section>

      <section className="tk-section">
        <div className="tk-section-title">VFX style</div>
        <div className="tk-section-caption">
          Select the reusable project-wide renderer treatment. Existing effect-local overrides
          remain intact when the style changes.
        </div>
        <Select
          onChange={actions.applyStyle}
          options={getVfxStyleOptions().map((entry) => ({
            label: entry.label,
            value: entry.id,
          }))}
          testId="renderer-style"
          value={state.styleId}
        />
      </section>

      <section className="tk-section">
        <div className="tk-section-title">Referenced profiles</div>
        <div className="tk-section-caption">
          The active projectile references these renderers by id. Multiple effect layers can reuse
          the same renderer profile without copying shader implementation.
        </div>
        <div className="vl-renderer-profile-list">
          {profiles.map((profile) => (
            <article className="vl-renderer-profile-card" key={profile.id}>
              <div className="vl-renderer-profile-head">
                <strong>{profile.id.replace('toonlab.vfx.', '')}</strong>
                <Badge tone="neutral">{[...profile.types].join(' + ')}</Badge>
              </div>
              <code>{profile.id}</code>
              <div className="vl-renderer-profile-layers">
                {profile.layers.map((layer) => (
                  <span key={layer.id}>{layer.label} · {layer.phases.join(', ')}</span>
                ))}
              </div>
              {[...profile.sources].map((source) => (
                <small key={source}>Source · {source}</small>
              ))}
            </article>
          ))}
        </div>
      </section>

      {RENDERER_PARAMETER_GROUPS.map((group) => {
        const parameters = state.effectDocument.parameters
          .filter((parameter) => parameter.group === group.id);
        if (parameters.length === 0) return null;
        return (
          <section className="tk-section" key={group.id}>
            <div className="tk-section-title">{group.label}</div>
            <div className="tk-section-caption">{group.description}</div>
            <div className="tk-section-fields">
              {parameters.map((parameter) => (
                <SchemaField
                  field={parameterField(parameter)}
                  key={parameter.id}
                  onChange={(value) => actions.setEffectParameter(parameter.id, value)}
                  value={parameter.value}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function ShapePanel({ actions, engine, state }) {
  const effect = state.effectDocument;
  const shapeParameters = effect.parameters.filter((parameter) => parameter.group === 'shape');
  const parameterValues = Object.fromEntries(
    shapeParameters.map((parameter) => [parameter.id, parameter.value]),
  );
  const guidedProfile = createVfxAxialProfile({
    backTaper: parameterValues.backTaper,
    frontTaper: parameterValues.frontTaper,
    widestPoint: parameterValues.widestPoint,
  });
  const previewShape = () => {
    requestAnimationFrame(() => engine.trigger('activeEffect', 'travel'));
  };
  return (
    <>
      <section className="tk-section vl-shape-intro">
        <div className="vl-eyebrow">Volume silhouette</div>
        <div className="tk-section-title">Control the nose and tail independently</div>
        <div className="tk-section-caption">
          Guided controls generate an asymmetric axial profile. Drawing replaces that profile with
          your own upper contour, mirrored vertically and revolved through depth.
        </div>
      </section>
      <section className="tk-section">
        <div className="tk-section-title">Guided shape</div>
        <div className="tk-section-caption">
          These controls remain available as a non-destructive starting shape.
        </div>
        <div className="tk-section-fields">
          {shapeParameters
            .filter((parameter) => (
              parameter.type !== 'profile' && parameter.id !== 'customProfileEnabled'
            ))
            .map((parameter) => (
              <SchemaField
                field={parameterField(parameter)}
                key={parameter.id}
                onChange={(value) => actions.setEffectParameter(parameter.id, value)}
                value={parameter.value}
              />
            ))}
        </div>
      </section>
      <section className="tk-section">
        <MirroredProfileEditor
          active={parameterValues.customProfileEnabled}
          guidedProfile={guidedProfile}
          onActiveChange={(value) => actions.setEffectParameter('customProfileEnabled', value)}
          onChange={(value) => actions.setEffectParameter('silhouetteProfile', value)}
          onCommit={previewShape}
          profile={parameterValues.silhouetteProfile}
        />
      </section>
    </>
  );
}

const ENERGY_MOTION_CONTROL_GROUPS = Object.freeze([
  Object.freeze({
    description: 'How far the orbit sits from the body, how much it occupies, and where paths travel.',
    ids: Object.freeze([
      'circulationCount',
      'circulationCoverage',
      'circulationSurfaceOffset',
      'circulationAxialWander',
      'circulationPlaneVariation',
    ]),
    label: 'Path layout',
  }),
  Object.freeze({
    description: 'How the paths circulate. Direction does not change projectile travel.',
    ids: Object.freeze(['circulationSpeed', 'circulationDirection']),
    label: 'Circulation',
  }),
  Object.freeze({
    description: 'Break uniformity with seeded deviation, connected forks, and reformation.',
    ids: Object.freeze([
      'circulationIrregularity',
      'circulationBranching',
      'circulationThickness',
      'circulationFlicker',
    ]),
    label: 'Lightning character',
  }),
]);

function MotionPanel({ actions, engine, state }) {
  const motionParameters = state.effectDocument.parameters
    .filter((parameter) => parameter.group === 'energy-motion');
  const parameterById = new Map(motionParameters.map((parameter) => [parameter.id, parameter]));
  const values = Object.fromEntries(
    motionParameters.map((parameter) => [parameter.id, parameter.value]),
  );
  const themes = getVfxEnergyMotionThemeOptions();
  const selectedTheme = themes.find((theme) => theme.id === values.energyMotionTheme);
  const previewMotion = () => {
    requestAnimationFrame(() => engine.trigger('activeEffect', 'travel'));
  };
  const applyTheme = (theme) => {
    actions.setEffectParameters({
      circulationEnabled: true,
      energyMotionTheme: theme.id,
      ...theme.settings,
    });
    previewMotion();
  };
  const setCustomValue = (id, value) => {
    actions.setEffectParameters({
      energyMotionTheme: VFX_ENERGY_MOTION_CUSTOM_THEME_ID,
      [id]: value,
    });
  };

  return (
    <>
      <section className="tk-section vl-motion-intro">
        <div className="vl-eyebrow">Intra-effect motion</div>
        <div className="vl-motion-title">
          <div>
            <div className="tk-section-title">Energy circulating over the volume</div>
            <div className="tk-section-caption">
              This layer orbits the authored main body at an explicit clearance on seeded
              three-dimensional planes. It is independent from the decorative shell, projectile travel, charge sequencing, textures,
              and particle shedding.
            </div>
          </div>
          <Badge tone={values.circulationEnabled ? 'positive' : 'neutral'}>
            {values.circulationEnabled ? 'Layer active' : 'Layer disabled'}
          </Badge>
        </div>
        <div className="vl-motion-actions">
          <Button kind="primary" onClick={previewMotion}>▶ Preview travel</Button>
          <Button kind="secondary" onClick={actions.randomizeSeed}>New deterministic seed</Button>
        </div>
      </section>

      <section className="tk-section">
        <SchemaField
          field={parameterField(parameterById.get('circulationEnabled'))}
          onChange={(value) => actions.setEffectParameter('circulationEnabled', value)}
          value={values.circulationEnabled}
        />
      </section>

      <section className="tk-section">
        <div className="tk-section-title">Starting themes</div>
        <div className="tk-section-caption">
          Themes write normal editable parameters. They are not locked shader presets.
        </div>
        <div className="vl-motion-themes">
          {themes.map((theme) => (
            <button
              aria-pressed={theme.id === values.energyMotionTheme}
              className="vl-motion-theme"
              data-active={theme.id === values.energyMotionTheme}
              data-theme={theme.id}
              key={theme.id}
              onClick={() => applyTheme(theme)}
              type="button"
            >
              <span className="vl-motion-theme-visual" aria-hidden="true">
                <i />
                <i />
                <i />
                <b>{theme.icon}</b>
              </span>
              <span className="vl-motion-theme-copy">
                <strong>{theme.label}</strong>
                <small>{theme.description}</small>
                <span>{theme.tags.join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
        {values.energyMotionTheme === VFX_ENERGY_MOTION_CUSTOM_THEME_ID && (
          <div className="vl-custom-motion-note">
            <Badge tone="positive">Custom motion</Badge>
            The values below are the source of truth. Pick a theme at any time to replace them.
          </div>
        )}
      </section>

      {ENERGY_MOTION_CONTROL_GROUPS.map((group) => (
        <section className="tk-section" key={group.label}>
          <div className="tk-section-title">{group.label}</div>
          <div className="tk-section-caption">{group.description}</div>
          <div className="tk-section-fields">
            {group.ids.map((id) => {
              const parameter = parameterById.get(id);
              return (
                <SchemaField
                  field={parameterField(parameter)}
                  key={id}
                  onChange={(value) => setCustomValue(id, value)}
                  value={parameter.value}
                />
              );
            })}
          </div>
        </section>
      ))}

      <section className="tk-section vl-motion-contract">
        <div className="tk-section-title">Runtime contract</div>
        <dl>
          <div><dt>Randomness</dt><dd>Deterministic from the project seed</dd></div>
          <div><dt>Geometry</dt><dd>Bounded ribbon pool; no per-frame allocation</dd></div>
          <div><dt>Reference volume</dt><dd>Main body plus authored Orbit Clearance</dd></div>
          <div><dt>Spatial path</dt><dd>Seeded plane + non-planar X/Y/Z wobble</dd></div>
          <div><dt>Quality</dt><dd>0 / 4 / 8 / 12 primary arcs by tier</dd></div>
          <div><dt>Current theme</dt><dd>{selectedTheme?.label ?? 'Custom authored values'}</dd></div>
        </dl>
      </section>
    </>
  );
}

function SequencePanel({ actions, engine, state }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 100);
    return () => clearInterval(timer);
  }, []);
  const livePhase = document.body.dataset.vfxMovePhase ?? '';
  const releaseParameters = state.effectDocument.parameters
    .filter((parameter) => parameter.group === 'release');
  const previewRelease = () => {
    requestAnimationFrame(() => engine.trigger('activeEffect', 'release'));
  };

  return (
    <>
      <section className="tk-section vl-sequence-intro">
        <div className="vl-eyebrow">Lifecycle editor</div>
        <div className="tk-section-title">Build segments separately. Judge the complete flow together.</div>
        <div className="tk-section-caption">
          Selecting a segment filters the layer stack and previews only that responsibility.
          Full sequence runs charge → release → travel → impact → cleanup against the capsule.
        </div>
        <Button
          kind={state.previewSegment === 'sequence' ? 'primary' : 'secondary'}
          onClick={() => {
            actions.setPreviewSegment('sequence');
            engine.trigger('activeEffect', 'sequence');
          }}
          testId="preview-full-sequence"
        >
          ▶ Preview full sequence
        </Button>
      </section>
      <section className="tk-section" data-testid="release-ring-controls">
        <div className="tk-section-title">Release ring</div>
        <div className="tk-section-caption">
          A compact closed loop with authored firing-axis depth and restrained seeded unevenness.
          It remains anchored at the source while the projectile leaves.
        </div>
        <Button kind="secondary" onClick={() => engine.trigger('activeEffect', 'release')}>
          ▶ Preview release only
        </Button>
        <div className="tk-section-fields">
          {releaseParameters.map((parameter) => (
            <SchemaField
              field={parameterField(parameter)}
              key={parameter.id}
              onChange={(value) => {
                actions.setEffectParameter(parameter.id, value);
                previewRelease();
              }}
              value={parameter.value}
            />
          ))}
        </div>
      </section>
      <div className="vl-phase-flow" data-testid="effect-phase-flow">
        {state.effectDocument.phases.map((phase, index) => {
          const supported = phase.id !== 'pierce';
          const selected = state.previewSegment === phase.id;
          const playing = livePhase === phase.id;
          return (
            <button
              className="vl-phase-card"
              data-playing={playing}
              data-selected={selected}
              disabled={!supported}
              key={phase.id}
              onClick={() => {
                actions.setPreviewSegment(phase.id);
                engine.trigger('activeEffect', phase.id);
              }}
              data-testid={`preview-phase-${phase.id}`}
              type="button"
            >
              <span className="vl-phase-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="vl-phase-copy">
                <strong>{phase.label}</strong>
                <small>{phase.description}</small>
                <span>
                  {phase.mode === 'loop' ? 'Loop / held' : `${phase.duration.toFixed(2)} s`}
                  {!supported ? ' · reserved' : ''}
                </span>
              </span>
              {playing && <Badge tone="positive">Playing</Badge>}
            </button>
          );
        })}
      </div>
      <section className="tk-section vl-sequence-contract">
        <div className="tk-section-title">Transition contract</div>
        <dl>
          <div><dt>Charge → Release</dt><dd>Input released or authored preview hold completes</dd></div>
          <div><dt>Release → Travel</dt><dd>Projectile clears the anchored 3D source ring after 0.28 s</dd></div>
          <div><dt>Travel → Impact</dt><dd>Host collision adapter reports target contact</dd></div>
          <div><dt>Travel → Expire</dt><dd>Maximum lifetime/range completes without contact</dd></div>
          <div><dt>Impact/Expire → Done</dt><dd>Child layers fade, then pooled resources reset</dd></div>
        </dl>
      </section>
    </>
  );
}

function activeSourceForSlot(state, slot) {
  const layer = state.effectDocument.layers.find((entry) => entry.id === slot.layer);
  const assetId = layer?.settings?.[slot.settingsPath[0]];
  return {
    assetId,
    runtime: state.sourceRuntimeUrls[assetId],
    source: state.sourceAssets[assetId],
  };
}

function SourcePreview({ runtime, source }) {
  if (source?.mode === 'file' && runtime?.url) {
    return source.file.mimeType.startsWith('video/')
      ? <video autoPlay className="vl-source-media" loop muted playsInline src={runtime.url} />
      : <img alt="" className="vl-source-media" src={runtime.url} />;
  }
  return (
    <div
      className="vl-source-procedural"
      data-generator={source?.procedural?.generator ?? 'flow-bands'}
      aria-label={`Procedural ${source?.procedural?.generator ?? 'source'} preview`}
    >
      <i /><i /><i /><i />
    </div>
  );
}

function SourceSlot({ actions, slot, state }) {
  const { runtime, source } = activeSourceForSlot(state, slot);
  const generators = getVfxSourceGeneratorOptions()
    .filter((entry) => slot.generators.includes(entry.id));
  const generatorOptions = generators.map((entry) => ({ label: entry.label, value: entry.id }));
  const activeGenerator = generators.find((entry) => entry.id === source?.procedural?.generator);
  const [loading, setLoading] = useState(false);

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLoading(true);
    try {
      await actions.importSourceFile(slot.id, file);
      toast(`Imported ${file.name}.`);
    } catch (error) {
      actions.setStatus(error.message);
      toast(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="vl-source-card" data-testid={`source-slot-${slot.id}`}>
      <div className="vl-source-preview">
        <SourcePreview runtime={runtime} source={source} />
        <Badge tone={source?.mode === 'file' ? 'positive' : 'neutral'}>
          {source?.mode === 'file' ? 'Uploaded' : 'Procedural'}
        </Badge>
      </div>
      <div className="vl-source-body">
        <div className="vl-source-title">{slot.label}</div>
        <p>{slot.description}</p>
        <div className="vl-source-target">Feeds {slot.layer} · {slot.channel}</div>
        {source?.mode === 'file' ? (
          <div className="vl-source-file">
            <strong>{source.file.name}</strong>
            <span>
              {source.file.width || '?'}×{source.file.height || '?'} ·{' '}
              {(source.file.byteLength / 1048576).toFixed(2)} MB
            </span>
          </div>
        ) : (
          <>
            <div className="vl-source-controls">
              <Select
                onChange={(generator) => actions.setSourceGenerator(slot.id, generator)}
                options={generatorOptions}
                testId={`source-generator-${slot.id}`}
                value={source?.procedural?.generator ?? generatorOptions[0]?.value}
              />
              <IconButton
                icon="dice"
                label={`Regenerate ${slot.label}`}
                onClick={() => actions.randomizeSource(slot.id)}
              />
            </div>
            <div className="vl-source-parameters">
              {(activeGenerator?.parameters ?? []).map((parameter) => (
                <SchemaField
                  field={{
                    defaultValue: activeGenerator.defaults[parameter.id],
                    description: `${activeGenerator.label} ${parameter.label.toLowerCase()}.`,
                    group: `source-${slot.id}`,
                    id: `source-${slot.id}-${parameter.id}`,
                    key: parameter.id,
                    label: parameter.label,
                    range: { max: parameter.max, min: parameter.min, step: parameter.step },
                    type: 'number',
                  }}
                  key={parameter.id}
                  onChange={(value) => actions.setSourceParameter(slot.id, parameter.id, value)}
                  value={source?.procedural?.parameters?.[parameter.id]}
                />
              ))}
            </div>
          </>
        )}
        <div className="vl-source-actions">
          <label className="tk-button vl-upload-button" data-kind="secondary">
            {loading ? 'Reading source…' : 'Upload image / GIF / video'}
            <input
              accept={slot.acceptedMimeTypes.join(',')}
              disabled={loading}
              onChange={importFile}
              type="file"
            />
          </label>
          {source?.mode === 'file' && (
            <Button
              kind="ghost"
              onClick={() => actions.setSourceGenerator(slot.id, slot.generators[0])}
            >
              Use procedural
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function SourcesPanel({ actions, state }) {
  const template = getVfxEffectTemplate(state.templateId);
  return (
    <>
      <section className="tk-section vl-source-intro">
        <div className="tk-section-title">Visual sources</div>
        <div className="tk-section-caption">
          Each slot belongs to this effect. Supply an animated grayscale source or generate one
          deterministically; the active source is sampled by the live shell shader.
        </div>
        <div className="vl-source-support">
          PNG · JPEG · WebP · animated GIF · MP4 · WebM · maximum 16 MB
        </div>
      </section>
      <div className="vl-source-list">
        {(template?.sourceSlots ?? []).map((slot) => (
          <SourceSlot actions={actions} key={slot.id} slot={slot} state={state} />
        ))}
      </div>
    </>
  );
}

function LayersPanel({ state }) {
  const visibleLayers = state.previewSegment === 'sequence'
    ? state.effectDocument.layers
    : state.effectDocument.layers.filter((layer) => layer.phases.includes(state.previewSegment));
  return (
    <section className="tk-section">
      <div className="tk-section-title">Layer composition</div>
      <div className="tk-section-caption">
        {state.previewSegment === 'sequence'
          ? `This is the complete ordered stack for ${state.effectDocument.label}.`
          : `Showing only layers active during ${titleCase(state.previewSegment)}.`}
        {' '}No other effect’s layers appear in this workspace.
      </div>
      <ol className="vl-layer-list">
        {visibleLayers.map((layer) => (
          <li key={layer.id}>
            <span>{layer.label}</span>
            <small>{layer.type} · {layer.phases.join(', ')}</small>
            <code>{layer.renderer?.profile ?? layer.settings?.effect ?? 'host layer'}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

function QualityPanel({ actions, state }) {
  const selected = state.templateAnswers.targetTier;
  return (
    <>
      <section className="tk-section">
        <div className="tk-section-title">Target quality</div>
        <div className="tk-section-caption">
          Quality changes hard budgets and layer availability for this effect only.
        </div>
        <Select
          onChange={(value) => actions.setTemplateAnswer('targetTier', value)}
          options={state.effectDocument.quality.tiers.map((tier) => ({
            label: tier.label,
            value: tier.id,
          }))}
          testId="quality-tier"
          value={selected}
        />
      </section>
      <div className="vl-quality-list">
        {state.effectDocument.quality.tiers.map((tier) => (
          <article className="vl-quality-card" data-active={tier.id === selected} key={tier.id}>
            <div><strong>{tier.label}</strong>{tier.id === selected && <Badge tone="positive">Active</Badge>}</div>
            <dl>
              {Object.entries(tier.budgets).map(([key, value]) => (
                <div key={key}><dt>{titleCase(key)}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <p>
              {Object.entries(tier.features)
                .map(([key, value]) => `${titleCase(key)} ${value ? 'on' : 'off'}`)
                .join(' · ')}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}

function CreateEffectDialog({ actions, onClose, onCreated }) {
  const intents = getVfxIntentOptions();
  const templates = getVfxEffectTemplateOptions();
  const [intentId, setIntentId] = useState('charged-projectile');
  const [label, setLabel] = useState('Charged Energy Shot');
  const intent = intents.find((entry) => entry.id === intentId);
  const template = templates.find((entry) => entry.intent?.id === intentId);
  return (
    <Modal onClose={onClose} title="Create a separate VFX effect" width={560}>
      <p className="vl-modal-copy">
        One project owns one effect document, its sources, layers, preview, and export.
      </p>
      <label className="vl-modal-field">
        <span>What are you making?</span>
        <Select
          onChange={(value) => {
            setIntentId(value);
            const match = templates.find((entry) => entry.intent?.id === value);
            if (match) setLabel(match.label);
          }}
          options={intents.map((entry) => ({
            label: `${entry.groupLabel} · ${entry.label}${entry.status === 'available' ? '' : ' — planned'}`,
            value: entry.id,
          }))}
          testId="new-effect-intent"
          value={intentId}
        />
      </label>
      <label className="vl-modal-field">
        <span>Effect name</span>
        <TextField onCommit={setLabel} placeholder="Effect name" value={label} />
      </label>
      {template ? (
        <div className="vl-create-template">
          <Badge tone="positive">Available</Badge>
          <span>{template.description}</span>
        </div>
      ) : (
        <div className="vl-create-unavailable">
          {intent?.label} is documented, but its production template is not implemented yet.
        </div>
      )}
      <div className="vl-export-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!template}
          kind="primary"
          onClick={() => {
            const id = actions.createProject({ label, templateId: template.id });
            if (id) onCreated(id);
          }}
          testId="create-effect-project"
        >
          Create isolated effect
        </Button>
      </div>
    </Modal>
  );
}

function ProjectBrowser({ actions, onCreate, onOpen, state }) {
  return (
    <main className="vl-library" data-testid="vfx-project-browser">
      <div className="vl-library-heading">
        <div>
          <div className="vl-eyebrow">VFX authoring</div>
          <h1>Effects</h1>
          <p>Open one effect at a time. Sources, layers, playback, and export stay isolated.</p>
        </div>
        <Button kind="primary" onClick={onCreate} testId="new-effect">＋ New effect</Button>
      </div>
      <div className="vl-project-grid">
        {state.effectProjects.map((effect) => (
          <article className="vl-project-card" key={effect.id}>
            <div className="vl-project-thumb">
              <div className="vl-project-orb"><i /><i /><i /></div>
              <Badge tone="positive">Ready to edit</Badge>
            </div>
            <div className="vl-project-info">
              <div className="vl-project-title">{effect.label}</div>
              <p>{effect.description}</p>
              <div className="vl-project-tags">
                {effect.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <div className="vl-project-actions">
                <Button kind="primary" onClick={() => onOpen(effect.id)} testId={`open-effect-${effect.id}`}>
                  Open effect
                </Button>
                <Button
                  kind="ghost"
                  onClick={() => {
                    actions.openProject(effect.id);
                    const copyId = actions.duplicateActiveProject();
                    if (copyId) onOpen(copyId);
                  }}
                >
                  Duplicate
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function ExportDialog({ actions, onClose }) {
  const snippet = actions.getCodeSnippet();
  const effect = actions.getEffectDocument();
  const project = actions.getProjectDocument();
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast('Integration code copied.');
    } catch {
      toast('Clipboard unavailable — select and copy the code below.');
    }
  }
  return (
    <Modal onClose={onClose} title={`Export ${effect.label}`} width={640}>
      <p className="vl-export-note">
        The project export keeps the effect and its visual-source documents together. Uploaded
        binaries remain project files referenced by their SHA-256-backed <code>project://</code> URI.
      </p>
      <pre className="vl-snippet">{snippet}</pre>
      <div className="vl-export-actions">
        <Button kind="secondary" onClick={() => {
          downloadBlob(JSON.stringify(project, null, 2), `${effect.id}.vfx-project.json`, 'application/json');
          toast('VFX project manifest downloaded.');
        }}>
          Project + sources
        </Button>
        <Button kind="ghost" onClick={() => {
          downloadBlob(JSON.stringify(effect, null, 2), `${effect.id}.vfx.json`, 'application/json');
          toast('Effect document downloaded.');
        }}>
          Effect only
        </Button>
        <Button kind="primary" onClick={copyCode}>Copy code</Button>
      </div>
    </Modal>
  );
}

function TopBar({ actions, editor, onBack, onExport, state }) {
  async function share() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('effect', state.effectDocument.id);
    url.searchParams.set('vfxEffect', JSON.stringify(actions.getEffectDocument()));
    url.searchParams.set('vfxSources', JSON.stringify(actions.getSourceDocuments()));
    url.searchParams.set('seed', String(state.seed));
    if (!state.loop) url.searchParams.set('loop', '0');
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      actions.setStatus('Share link copied. Uploaded file binaries must travel with the project.');
    } catch {
      actions.setStatus('Share link written to the address bar.');
    }
  }
  const menus = createLabEditorMenus({
    onHome: editor ? onBack : undefined,
    fileItems: editor ? [
      { icon: 'link', label: 'Copy Share Link', onSelect: () => { void share(); } },
      { icon: 'stage-export', label: 'Export…', onSelect: onExport },
    ] : [],
    editItems: editor ? [
      { icon: 'dice', label: 'Randomize Seed', onSelect: actions.randomizeSeed },
    ] : [],
  });
  return (
    <LabEditorHeader className="vl-topbar" menus={menus}>
      <BrandLockup labName="VFX Lab" />
      {editor ? (
        <>
          <Button kind="ghost" onClick={onBack}>Effects</Button>
          <span aria-hidden="true" className="vl-breadcrumb-divider">/</span>
          <span className="vl-title-editor">
            <TextField
              onCommit={actions.renameActiveProject}
              placeholder="Effect name"
              testId="effect-name"
              value={state.effectDocument.label}
            />
            <small>{state.effectDocument.id}</small>
          </span>
        </>
      ) : <span className="vl-library-title">Effects</span>}
      <span className="vl-topbar-spacer" />
      {editor && (
        <>
          <span className="vl-seed">
            seed
            <ScrubValue max={99999} min={1} onChange={actions.setSeed} step={1} value={state.seed} />
            <IconButton icon="dice" label="New seed" onClick={actions.randomizeSeed} />
          </span>
          <Button icon="link" kind="ghost" onClick={share}>Share</Button>
          <Button icon="stage-export" kind="primary" onClick={onExport} testId="export">Export</Button>
        </>
      )}
      <RendererToggle />
    </LabEditorHeader>
  );
}

function PlaybackBar({ actions, engine, state }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 400);
    return () => clearInterval(timer);
  }, []);
  const charged = document.body.dataset.vfxLiveChargedShots ?? '0';
  const draws = document.body.dataset.vfxDrawCalls ?? '0';
  const previewLabel = state.previewSegment === 'sequence'
    ? 'Preview full flow'
    : `Preview ${titleCase(state.previewSegment)}`;
  return (
    <footer className="vl-playback tk">
      <Button
        kind="primary"
        onClick={() => engine.trigger('activeEffect', state.previewSegment)}
        testId="preview-active-effect"
      >
        ▶ {previewLabel} <Kbd keys="Space" />
      </Button>
      <Button
        kind={state.loop ? 'secondary' : 'ghost'}
        onClick={() => actions.setLoop(!state.loop)}
        testId="loop-toggle"
      >
        {state.loop ? '⏸ Loop on' : '↻ Loop off'}
      </Button>
      <span className="vl-playback-divider" />
      <span className="vl-playback-charge">
        Charge
        <ScrubValue max={1} min={0} onChange={actions.setChargePreview} step={0.01} value={state.chargePreview} />
      </span>
      <span className="vl-status">{state.status || 'Editing only the active effect.'}</span>
      <span className="vl-stats">{charged} active · {draws} draws</span>
    </footer>
  );
}

function PreviewControls({ actions, state }) {
  return (
    <PreviewBar hint="Preview environment · excluded from this effect">
      <LabTimeOfDayControl
        autoCycle={state.previewAutoCycle}
        hour={state.previewHour}
        onAutoCycleChange={actions.setPreviewAutoCycle}
        onHourChange={actions.setPreviewHour}
      />
    </PreviewBar>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const initialSection = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('workspace') === 'renderers' ? 'renderers' : 'design';
  }, []);
  const initialEditor = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.has('effect')
      || params.has('vfxEffect')
      || params.get('workspace') === 'renderers'
    );
  }, []);
  const [workspace, setWorkspace] = useState(initialEditor ? 'editor' : 'library');
  const [section, setSection] = useState(initialSection);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  function openProject(id) {
    store.actions.openProject(id);
    const url = new URL(window.location.href);
    url.searchParams.set('effect', id);
    url.searchParams.delete('workspace');
    window.history.replaceState(null, '', url);
    setWorkspace('editor');
    setSection('design');
  }

  function selectSection(id) {
    const url = new URL(window.location.href);
    if (id === 'renderers') url.searchParams.set('workspace', 'renderers');
    else url.searchParams.delete('workspace');
    window.history.replaceState(null, '', url);
    setSection(id);
  }

  function showLibrary() {
    const url = new URL(window.location.href);
    url.searchParams.delete('effect');
    url.searchParams.delete('vfxEffect');
    url.searchParams.delete('vfxSources');
    url.searchParams.delete('workspace');
    window.history.replaceState(null, '', url);
    setWorkspace('library');
  }

  const panel = section === 'sources'
    ? <SourcesPanel actions={store.actions} state={state} />
    : section === 'renderers'
      ? <RendererProfilesPanel actions={store.actions} state={state} />
    : section === 'shape'
      ? <ShapePanel actions={store.actions} engine={engine} state={state} />
    : section === 'motion'
      ? <MotionPanel actions={store.actions} engine={engine} state={state} />
    : section === 'sequence'
      ? <SequencePanel actions={store.actions} engine={engine} state={state} />
    : section === 'layers'
      ? <LayersPanel state={state} />
      : section === 'quality'
        ? <QualityPanel actions={store.actions} state={state} />
        : <DesignPanel actions={store.actions} state={state} />;

  return (
    <div className="tk">
      <div className="vl-root" data-workspace={workspace}>
        <TopBar
          actions={store.actions}
          editor={workspace === 'editor'}
          onBack={showLibrary}
          onExport={() => setExporting(true)}
          state={state}
        />
        {workspace === 'library' ? (
          <ProjectBrowser
            actions={store.actions}
            onCreate={() => setCreating(true)}
            onOpen={openProject}
            state={state}
          />
        ) : (
          <>
            <nav className="vl-rail tk" aria-label="Active effect editor">
              {EDITOR_SECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="vl-rail-item"
                  data-active={section === entry.id}
                  data-testid={`section-${entry.id}`}
                  onClick={() => selectSection(entry.id)}
                >
                  <span>{entry.icon}</span>{entry.label}
                </button>
              ))}
            </nav>
            <aside className="vl-inspector tk">{panel}</aside>
            <PlaybackBar actions={store.actions} engine={engine} state={state} />
            <PreviewControls actions={store.actions} state={state} />
          </>
        )}
      </div>
      {creating && (
        <CreateEffectDialog
          actions={store.actions}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            openProject(id);
          }}
        />
      )}
      {exporting && <ExportDialog actions={store.actions} onClose={() => setExporting(false)} />}
      <ToastStack />
    </div>
  );
}
