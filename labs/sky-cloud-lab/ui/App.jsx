import { useEffect, useRef, useState } from 'react';

import { rasterizeHeroCloudFootprint } from '../../../src/cloud/index.js';
import {
  SKY_PARAMS_FIELD_SCHEMA,
} from '../../../src/sky/index.js';
import { CALL_ME_SENSEI_SYSTEM_STYLE_ID } from '../../../src/core/systemStylePolicy.js';
import { downloadBlob } from '../../shared/download.js';
import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEntryChooser,
  LabEditorHeader,
  Modal,
  Popover,
  PreviewBar,
  RendererToggle,
  SchemaField,
  SearchSelect,
  SegmentedControl,
  Select,
  StyleBundleExportPrompt,
  ToastStack,
  Toggle,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import {
  CAMERA_VIEW_OPTIONS,
  LIGHTING_VIEW_OPTIONS,
} from './comparisonViews.js';
import { SKY_WEATHER_OPTIONS } from './store.js';
import {
  CLOUD_WORKSPACE,
  SKY_CLOUD_WORKSPACE,
  SKY_WORKSPACE,
  resolveLabWorkspace,
} from './labWorkspaces.js';

const QUALITY_OPTIONS = [
  ['low', 'Draft'],
  ['medium', 'Balanced'],
  ['high', 'High'],
  ['ultra', 'Maximum'],
];

const TAB_ICONS = Object.freeze({
  atmosphere: 'stage-look',
  celestial: 'stage-animation',
  environment: 'tool-move',
  generation: 'dice',
  'cloud-look': 'stage-shape',
  'cloud-style': 'stage-leaves',
  'cloud-world': 'tool-move',
  'hero-cloud': 'sketch',
  preview: 'stage-look',
  'sky-style': 'stage-flowers',
});

const CLOUD_LOOK_FIELDS = {
  shape: [
    'density', 'baseStrength', 'erosionScaleBaseMultiplier', 'erosionShape',
    'erosionStrengthBase', 'erosionStrengthPeak', 'edgeSoftness', 'edgeSoftnessFalloff',
  ],
  lighting: Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.lighting),
  fade: Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.fade),
};

const WORLD_SHAPE_FIELDS = [
  'altitude', 'thickness', 'coverage', 'baseScale', 'weatherScale',
  'baseWeatherStrength', 'baseWeatherHeightStart', 'baseWeatherHeightEnd',
  'horizonCoverageAmount', 'horizonCoverageStart', 'horizonCoverageRamp',
];

function getPath(source, path) {
  return path.reduce((value, key) => value?.[key], source);
}

function groupDescription(path, title) {
  const owner = path[0] === 'cloud' ? 'cloud renderer' : path[0] === 'noise' ? 'procedural field generator' : 'sky runtime';
  return `${title} parameters are validated, saved in the SkyParams style document, and applied directly by the ${owner}. Hover or focus a control label for its contract.`;
}

function Field({ actions, descriptor, params, path }) {
  const value = getPath(params, path);
  return (
    <SchemaField
      disabled={Boolean(descriptor.derived)}
      disabledReason={descriptor.derived ? 'This value is derived by the runtime.' : null}
      field={{
        ...descriptor,
        defaultValue: descriptor.value,
        group: path.slice(0, -1).join('-'),
        id: path.join('.'),
        key: path[path.length - 1],
        label: descriptor.label ?? path[path.length - 1],
        unit: descriptor.unit?.length > 8 ? null : descriptor.unit,
      }}
      onChange={(next) => actions.setParam(path, next)}
      value={value}
    />
  );
}

function Group({ actions, fields, params, path, title }) {
  const schema = getPath(SKY_PARAMS_FIELD_SCHEMA, path);
  return (
    <section className="vs-section">
      <h2>{title}</h2>
      <p className="vs-section-copy">{groupDescription(path, title)}</p>
      {fields.map((key) => (
        <Field
          key={key}
          actions={actions}
          descriptor={schema[key]}
          params={params}
          path={[...path, key]}
        />
      ))}
    </section>
  );
}

function Preview({ workspace }) {
  const copy = {
    [CLOUD_WORKSPACE]: {
      eyebrow: 'Cloud review',
      title: 'One volume, before and after stylization.',
      body: 'Physical and Stylized use the same density, erosion, light march, sky, weather, camera, and fixed exposure. Preset and custom lighting use the authored exposure. Only the optional cloud color treatment changes.',
    },
    [SKY_WORKSPACE]: {
      eyebrow: 'Sky review',
      title: 'Author the atmosphere around a stable cloud context.',
      body: 'Atmosphere, palettes, celestial appearance, and the night field live here. Cloud shape remains a preview context so sky decisions stay readable.',
    },
    [SKY_CLOUD_WORKSPACE]: {
      eyebrow: 'Environment integration',
      title: 'Compose the cloud field inside the finished sky system.',
      body: 'This workspace owns coverage, shell height, procedural generation, wind, current scene state, and cross-system qualification—not cloud or sky look authoring.',
    },
  }[workspace];
  return (
    <div className="vs-stack">
      <section className="vs-hero">
        <span>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </section>
      <section className="vs-section">
        <h2>Review controls moved to Preview</h2>
        <p>The amber bar below the viewport now owns comparison mode, weather, render quality, light, camera angle, and navigation. Those choices never rewrite the saved style.</p>
      </section>
      <section className="vs-note">
        <strong>Fair comparison</strong>
        <p>Selecting an environment preset loads its authored baseline. After that, comparison light, camera, weather context, and render quality affect only the review and never rewrite the shared SkyParams.</p>
      </section>
      {workspace === SKY_CLOUD_WORKSPACE && (
        <section className="vs-section vs-handoffs">
          <h2>Authoring workspaces</h2>
          <p>Use the focused labs for reusable look development, then return here to qualify the combination.</p>
          <div className="vs-actions">
            <a href="/cloud-shader-lab/">Open Cloud Lab</a>
            <a href="/sky-lab/">Open Sky Lab</a>
          </div>
        </section>
      )}
    </div>
  );
}

function HeroRange({ help, label, max, min, onChange, step, unit, value }) {
  const description = help ?? `${label} is stored in the portable HeroCloudRecipe and validated when it is imported.`;
  return (
    <SchemaField
      field={{
        description,
        group: 'hero-cloud',
        id: `hero-cloud.${label.toLowerCase().replace(/\s+/g, '-')}`,
        key: label.toLowerCase().replace(/\s+/g, '-'),
        label,
        range: { max, min, step },
        type: 'number',
        unit,
      }}
      onChange={onChange}
      value={value}
    />
  );
}

function HeroCloudDoodle({ actions, recipe }) {
  const canvasRef = useRef(null);
  const strokeRef = useRef(null);
  const [brushRadius, setBrushRadius] = useState(0.085);
  const [draftStroke, setDraftStroke] = useState(null);
  const [mode, setMode] = useState('add');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const previewRecipe = draftStroke
      ? {
        ...recipe,
        footprint: {
          ...recipe.footprint,
          strokes: [...recipe.footprint.strokes, draftStroke],
        },
      }
      : recipe;
    const field = rasterizeHeroCloudFootprint(previewRecipe, { resolution: 160 });
    const source = document.createElement('canvas');
    source.width = field.width;
    source.height = field.height;
    const sourceContext = source.getContext('2d');
    const image = sourceContext.createImageData(field.width, field.height);
    for (let index = 0; index < field.data.length; index += 1) {
      const value = field.data[index] / 255;
      const offset = index * 4;
      image.data[offset] = Math.round(12 + value * 192);
      image.data[offset + 1] = Math.round(22 + value * 218);
      image.data[offset + 2] = Math.round(34 + value * 221);
      image.data[offset + 3] = 255;
    }
    sourceContext.putImageData(image, 0, 0);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255,255,255,.1)';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }, [draftStroke, recipe]);

  function pointFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    ];
  }

  function beginStroke(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = {
      mode,
      points: [pointFromEvent(event)],
      radius: brushRadius,
      strength: 1,
    };
    strokeRef.current = stroke;
    setDraftStroke(stroke);
  }

  function extendStroke(event) {
    if (!strokeRef.current || event.buttons === 0) return;
    const point = pointFromEvent(event);
    const previous = strokeRef.current.points.at(-1);
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.006) return;
    const stroke = {
      ...strokeRef.current,
      points: [...strokeRef.current.points, point],
    };
    strokeRef.current = stroke;
    setDraftStroke(stroke);
  }

  function finishStroke() {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setDraftStroke(null);
    if (stroke?.points.length) actions.addHeroStroke(stroke);
  }

  return (
    <section className="vs-section vs-doodle-section">
      <div className="vs-section-heading">
        <div>
          <h2>Footprint doodle</h2>
          <p>Top view: paint where cloud columns may develop. This is not a flat cloud image.</p>
        </div>
        <div className="vs-segmented" aria-label="Doodle mode">
          <button type="button" data-active={mode === 'add'} onClick={() => setMode('add')}>Draw</button>
          <button type="button" data-active={mode === 'erase'} onClick={() => setMode('erase')}>Erase</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Hero cloud top-down footprint"
        className="vs-doodle"
        height="288"
        width="288"
        onPointerCancel={finishStroke}
        onPointerDown={beginStroke}
        onPointerMove={extendStroke}
        onPointerUp={finishStroke}
      />
      <HeroRange
        label="Brush size"
        max={0.22}
        min={0.02}
        step={0.005}
        unit="footprint"
        value={brushRadius}
        onChange={setBrushRadius}
      />
      <div className="vs-actions">
        <button type="button" onClick={actions.clearHeroFootprint}>Clear</button>
        <button type="button" onClick={actions.resetHeroRecipe}>Restore example</button>
      </div>
    </section>
  );
}

function HeroCloudPanel({ actions, state }) {
  const recipe = state.heroRecipe;
  const [text, setText] = useState(() => JSON.stringify(recipe, null, 2));

  useEffect(() => {
    setText(JSON.stringify(recipe, null, 2));
  }, [recipe]);

  async function copyRecipe() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
      actions.adoptEngineState({ status: 'Hero-cloud recipe copied.' });
    } catch {
      actions.adoptEngineState({ status: 'Copy unavailable; select the JSON manually.' });
    }
  }

  function downloadRecipe() {
    const fileName = recipe.id || 'hero_cloud';
    downloadBlob(
      JSON.stringify(recipe, null, 2),
      `${fileName}.hero-cloud.json`,
      'application/json',
    );
    actions.adoptEngineState({ status: 'Hero-cloud recipe downloaded.' });
  }

  function downloadFootprint() {
    const field = rasterizeHeroCloudFootprint(recipe, { resolution: 512 });
    const canvas = document.createElement('canvas');
    canvas.width = field.width;
    canvas.height = field.height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(field.width, field.height);
    for (let index = 0; index < field.data.length; index += 1) {
      const offset = index * 4;
      const value = field.data[index];
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = value;
    }
    context.putImageData(image, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast('Could not rasterize the hero-cloud footprint.', { tone: 'danger' });
        return;
      }
      downloadBlob(blob, `${recipe.id || 'hero_cloud'}.footprint.png`, 'image/png');
      toast('Hero-cloud footprint PNG exported.', { tone: 'success' });
    }, 'image/png');
  }

  return (
    <div className="vs-stack">
      <section className="vs-hero">
        <span>Hero cloud authoring</span>
        <h1>Doodle the footprint. The volume builds the cloud.</h1>
        <p>The mark limits the broad cloud mass; 3D noise, erosion, density integration, and physical light produce the detailed result.</p>
      </section>
      <section className="vs-section">
        <label className="vs-text-field">
          <span>Name</span>
          <input
            className="tk-text-field"
            type="text"
            maxLength="80"
            value={recipe.label}
            onChange={(event) => actions.setHeroRecipe(['label'], event.target.value)}
          />
        </label>
        <label className="vs-feature-toggle">
          <span>Preview authored cloud</span>
          <Toggle
            checked={state.heroPreview}
            onChange={actions.setHeroPreview}
            testId="hero-cloud-preview"
          />
        </label>
      </section>
      <HeroCloudDoodle actions={actions} recipe={recipe} />
      <section className="vs-section">
        <div className="vs-section-heading">
          <div><h2>Volume</h2><p>Broad dimensions; the doodle stays normalized inside them.</p></div>
          <button type="button" onClick={actions.stepHeroSeed}>New seed</button>
        </div>
        <HeroRange label="Diameter" max={30000} min={500} step={100} unit="m" value={recipe.bounds.diameter} onChange={(value) => actions.setHeroRecipe(['bounds', 'diameter'], value)} />
        <HeroRange label="Vertical growth" max={12000} min={100} step={50} unit="m" value={recipe.bounds.height} onChange={(value) => actions.setHeroRecipe(['bounds', 'height'], value)} />
        <HeroRange label="Development" max={1} min={0} step={0.01} unit="shape" value={recipe.footprint.development} onChange={(value) => actions.setHeroRecipe(['footprint', 'development'], value)} />
        <HeroRange label="Edge softness" max={0.95} min={0.01} step={0.01} unit="brush" value={recipe.footprint.softness} onChange={(value) => actions.setHeroRecipe(['footprint', 'softness'], value)} />
        <HeroRange label="Breakup" max={1} min={0} step={0.01} unit="shape" value={recipe.footprint.breakup} onChange={(value) => actions.setHeroRecipe(['footprint', 'breakup'], value)} />
        <p className="vs-seed">Seed {recipe.seed}</p>
      </section>
      <section className="vs-note">
        <strong>Authored here; placed by the scene</strong>
        <p>The recipe stores footprint, dimensions, and variation only. It deliberately contains no world position, rotation, terrain collision, or gameplay collider.</p>
      </section>
      <section className="vs-section vs-export vs-hero-export">
        <h2>HeroCloudRecipe JSON</h2>
        <p>Portable authoring data. Importing clamps and normalizes every field.</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} />
        <div className="vs-actions">
          <button type="button" onClick={copyRecipe}>Copy JSON</button>
          <button type="button" onClick={downloadRecipe}>Download</button>
          <button type="button" onClick={downloadFootprint}>Export footprint PNG</button>
          <button type="button" onClick={() => actions.importHeroJson(text)}>Import</button>
        </div>
      </section>
    </div>
  );
}

function CloudLook({ actions, params }) {
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={CLOUD_LOOK_FIELDS.shape} params={params} path={['cloud', 'shape']} title="Density & shape" />
      <Group actions={actions} fields={CLOUD_LOOK_FIELDS.lighting} params={params} path={['cloud', 'lighting']} title="Light transport" />
      <Group actions={actions} fields={CLOUD_LOOK_FIELDS.fade} params={params} path={['cloud', 'fade']} title="Aerial perspective" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.cirrus)} params={params} path={['cloud', 'cirrus']} title="Cirrus layer" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.haze)} params={params} path={['cloud', 'haze']} title="Cloud haze" />
      <Group actions={actions} fields={['multipleScattering']} params={params} path={['atmosphere']} title="Scattering coupling" />
    </div>
  );
}

function CloudStyle({ actions, params }) {
  return (
    <div className="vs-stack">
      <section className="vs-note">
        <Button onClick={actions.preserveCloudVolumeDetail}>Preserve billow detail</Button>
        <p>Reduces interior paint and retains more shading in white cloud tops. Density, shape, and your palette stay the same.</p>
      </section>
      <Group actions={actions} fields={['enabled', 'amount']} params={params} path={['cloud', 'style']} title="Cloud stylization" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.tone)} params={params} path={['cloud', 'style', 'tone']} title="Tone" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.blueShadow)} params={params} path={['cloud', 'style', 'blueShadow']} title="Blue shadow" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.shadowWash)} params={params} path={['cloud', 'style', 'shadowWash']} title="Shadow wash" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.innerPaint)} params={params} path={['cloud', 'style', 'innerPaint']} title="Inner paint" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.whiteTop)} params={params} path={['cloud', 'style', 'whiteTop']} title="White top" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.topLight)} params={params} path={['cloud', 'style', 'topLight']} title="Top light" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.surfaceLight)} params={params} path={['cloud', 'style', 'surfaceLight']} title="Exterior surface light" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.style.lightBlend)} params={params} path={['cloud', 'style', 'lightBlend']} title="Light blend" />
      <Group actions={actions} fields={['enabled']} params={params} path={['cloud', 'style', 'timePalette']} title="Time palettes" />
      <Group actions={actions} fields={['morningEnabled', 'morningTop', 'morningBottom', 'morningAmount', 'morningDetail', 'morningBrightness']} params={params} path={['cloud', 'style', 'timePalette']} title="Morning cloud" />
      <Group actions={actions} fields={['eveningEnabled', 'eveningTop', 'eveningBottom', 'eveningAmount', 'eveningDetail', 'eveningBrightness']} params={params} path={['cloud', 'style', 'timePalette']} title="Evening cloud" />
      <Group actions={actions} fields={['nightEnabled', 'nightTop', 'nightBottom', 'nightAmount', 'nightDetail', 'nightContrast', 'nightBrightness']} params={params} path={['cloud', 'style', 'timePalette']} title="Night cloud" />
      <section className="vs-note">
        <strong>Cloud-only contract</strong>
        <p>These controls change cloud color and lighting treatment without rewriting the density field, coverage, transmittance, or silhouette.</p>
      </section>
    </div>
  );
}

function Atmosphere({ actions, params }) {
  const fields = Object.keys(SKY_PARAMS_FIELD_SCHEMA.atmosphere)
    .filter((key) => !['style', 'multipleScattering'].includes(key));
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={fields} params={params} path={['atmosphere']} title="Physical atmosphere" />
      <p className="vs-note">Exposure scales the preview brightness around the selected comparison light or automatic exposure. A value of 1 keeps its neutral brightness.</p>
      <section className="vs-note">
        <strong>Sky-owned appearance</strong>
        <p>Cloud multiple scattering remains in Cloud Lab because it changes how the participating cloud medium shades. The clear-air sky controls live here.</p>
      </section>
    </div>
  );
}

function SkyStyle({ actions, params }) {
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={['enabled', 'amount']} params={params} path={['atmosphere', 'style']} title="Sky palette" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.atmosphere.style.palette)} params={params} path={['atmosphere', 'style', 'palette']} title="Daylight palette" />
      <Group actions={actions} fields={['enabled']} params={params} path={['atmosphere', 'style', 'timePalette']} title="Time palettes" />
      <Group actions={actions} fields={['morningEnabled', 'morningZenith', 'morningHorizon', 'morningAmount', 'morningFill']} params={params} path={['atmosphere', 'style', 'timePalette']} title="Morning sky" />
      <Group actions={actions} fields={['eveningEnabled', 'eveningZenith', 'eveningHorizon', 'eveningAmount', 'eveningFill']} params={params} path={['atmosphere', 'style', 'timePalette']} title="Evening sky" />
      <Group actions={actions} fields={['nightEnabled', 'nightZenith', 'nightHorizon', 'nightAmount', 'nightFill', 'nightStars']} params={params} path={['atmosphere', 'style', 'timePalette']} title="Night sky" />
    </div>
  );
}

function Celestial({ actions, params }) {
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.sun)} params={params} path={['sun']} title="Sun" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.time.moon)} params={params} path={['time', 'moon']} title="Moon" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.nightSky)} params={params} path={['nightSky']} title="Night panorama" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.atmosphere.style.starField)} params={params} path={['atmosphere', 'style', 'starField']} title="Stylized star field" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.godRays)} params={params} path={['godRays']} title="Celestial rays" />
      <section className="vs-note">
        <strong>Panorama-driven stars</strong>
        <p>The host supplies the celestial panorama. This treatment extracts sparse crisp star anchors and a restrained diffuse band; it does not generate random screen-space dots.</p>
      </section>
    </div>
  );
}

function CloudWorld({ actions, params }) {
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={WORLD_SHAPE_FIELDS} params={params} path={['cloud', 'shape']} title="Cloud shell & coverage" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.cloud.wind)} params={params} path={['cloud', 'wind']} title="Wind" />
    </div>
  );
}

function Environment({ actions, params }) {
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.sun)} params={params} path={['sun']} title="Sun" />
      <Group actions={actions} fields={Object.keys(SKY_PARAMS_FIELD_SCHEMA.time).filter((key) => key !== 'moon')} params={params} path={['time']} title="Time of day" />
      <section className="vs-note">
        <strong>Scene state, not look development</strong>
        <p>This clock and celestial bearing qualify the composed environment. Reusable sky palette and cloud shading are authored in their focused labs.</p>
      </section>
    </div>
  );
}

function Generation({ actions, params }) {
  const weatherSchema = SKY_PARAMS_FIELD_SCHEMA.noise.weather;
  return (
    <div className="vs-stack">
      <Group actions={actions} fields={['resolution', 'seed']} params={params} path={['noise', 'weather']} title="Weather map" />
      <section className="vs-section">
        <h2>Weather profile</h2>
        {Object.keys(weatherSchema.profile).map((key) => (
          <Field key={key} actions={actions} descriptor={weatherSchema.profile[key]} params={params} path={['noise', 'weather', 'profile', key]} />
        ))}
      </section>
    </div>
  );
}

function ExportPanel({ actions, engine, heroPreview, params, workspace }) {
  const [text, setText] = useState(() => actions.exportStyleDocument());
  const workspaceName = resolveLabWorkspace(workspace).label;

  useEffect(() => {
    setText(actions.exportStyleDocument());
  }, [actions, params]);

  function exportPreview() {
    engine.renderer.domElement.toBlob((blob) => {
      if (!blob) {
        toast('Could not capture the sky preview.', { tone: 'danger' });
        return;
      }
      downloadBlob(blob, `${workspace.replace(/\s+/g, '-')}-preview.png`, 'image/png');
      toast('Preview PNG exported.', { tone: 'success' });
    }, 'image/png');
  }

  return (
    <section className="vs-section vs-export">
      <h2>Runtime SkyParams style</h2>
      {heroPreview && <p className="vs-note">This exports the cloud treatment and sky settings. The hero footprint is a separate recipe; use Download in Hero Cloud to keep that shape too.</p>}
      <p>{workspaceName} edits its owned section of one validated <code>toonlab/sky-params</code> document. Apply this document directly to <code>SkySystem</code> for the exact integrated result.</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <div className="vs-actions">
        <button type="button" onClick={() => setText(actions.exportStyleDocument())}>Refresh</button>
        <button
          type="button"
          onClick={() => downloadBlob(text, `${workspace}.sky-params.json`, 'application/json')}
        >
          Export runtime style
        </button>
        {workspace !== SKY_WORKSPACE && (
          <button type="button" onClick={() => downloadBlob(actions.exportStyleBundle(), `${workspace}.style-bundle.json`, 'application/json')}>Export cloud treatment bundle</button>
        )}
        <button type="button" onClick={exportPreview}>Export preview PNG</button>
        <button type="button" onClick={() => actions.importJson(text)}>Import</button>
      </div>
      <p className="vs-export-note">{workspace === SKY_WORKSPACE
        ? 'Use Export runtime style to preserve your sky palette, atmosphere, sun, moon, and stars. Sky-only style bundles are not supported yet.'
        : 'The cloud treatment bundle contains the cloud parameter groups. It excludes the scattering coupling, noise field, sky, and hero footprint. Keep the full SkyParams document for scattering and sky settings, and the Hero Cloud recipe for a custom footprint.'}</p>
      {workspace !== SKY_WORKSPACE && <StyleBundleExportPrompt />}
    </section>
  );
}

function styleLibraryOptions(state) {
  return [
    { label: 'Call Me Sensei · system · read-only', value: CALL_ME_SENSEI_SYSTEM_STYLE_ID },
    ...state.savedStyles.map((entry) => ({
      label: `${entry.label} · ${resolveLabWorkspace(entry.workspace).label}`,
      value: entry.id,
    })),
  ];
}

function DocumentMenu({ actions, anchor, onClose, onOpenDialog, state }) {
  const [recentOpen, setRecentOpen] = useState(false);
  const systemStyleActive = state.activeStyleId === CALL_ME_SENSEI_SYSTEM_STYLE_ID;
  const canMutate = Boolean(state.activeStyleId) && !systemStyleActive;
  const recentStyles = state.savedStyles.slice(0, 5);

  function openDialog(dialog) {
    onClose();
    onOpenDialog(dialog);
  }

  function quickOpen(entry) {
    if (!actions.openStyle(entry.id)) {
      toast(`Could not open “${entry.label}”.`, { tone: 'danger' });
      return;
    }
    toast(`Opened “${entry.label}”.`, { tone: 'success' });
    onClose();
  }

  return (
    <Popover anchor={anchor} onClose={onClose} testId="sky-document-menu" title={state.styleName} width={300}>
      <div className="vs-document-menu" role="menu" aria-label="Style document actions">
        <button type="button" role="menuitem" onClick={() => openDialog('open')}>
          <span>Open style…</span>
          <small>Browse</small>
        </button>
        <button
          type="button"
          role="menuitem"
          aria-expanded={recentOpen}
          aria-haspopup="menu"
          disabled={recentStyles.length === 0}
          onClick={() => setRecentOpen((open) => !open)}
          title={recentStyles.length ? 'Show the five most recently saved styles' : 'No recent saved styles'}
        >
          <span>Recent</span>
          <small>{recentStyles.length ? (recentOpen ? '▾' : '›') : 'Empty'}</small>
        </button>
        {recentOpen && recentStyles.length > 0 && (
          <div className="vs-document-menu__recent" role="menu" aria-label="Recent styles">
            {recentStyles.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                onClick={() => quickOpen(entry)}
                title={`Open ${entry.label} immediately`}
              >
                <span>{entry.label}</span>
                <small>{resolveLabWorkspace(entry.workspace).label}</small>
              </button>
            ))}
          </div>
        )}
        <div className="vs-document-menu__separator" role="separator" />
        <button
          type="button"
          role="menuitem"
          disabled={!canMutate}
          onClick={() => openDialog('update')}
          title={systemStyleActive ? 'Call Me Sensei is a read-only system style' : 'Update the open saved style'}
        >
          <span>Update…</span>
          <small>{systemStyleActive ? 'Read-only' : 'Replace'}</small>
        </button>
        <button type="button" role="menuitem" onClick={() => openDialog('save-as')}>
          <span>Save As…</span>
          <small>New copy</small>
        </button>
        <button
          type="button"
          role="menuitem"
          className="vs-document-menu__danger"
          disabled={!canMutate}
          onClick={() => openDialog('delete')}
          title={systemStyleActive ? 'Call Me Sensei cannot be deleted' : 'Delete the open saved style'}
        >
          <span>Delete…</span>
          <small>{systemStyleActive ? 'Protected' : 'Confirm'}</small>
        </button>
        <div className="vs-document-menu__separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => openDialog('export')}>
          <span>Export…</span>
          <small>Options</small>
        </button>
      </div>
    </Popover>
  );
}

function OpenStyleDialog({ actions, onClose, state }) {
  const options = styleLibraryOptions(state);
  const [selectedId, setSelectedId] = useState(
    state.activeStyleId ?? CALL_ME_SENSEI_SYSTEM_STYLE_ID,
  );
  const systemSelected = selectedId === CALL_ME_SENSEI_SYSTEM_STYLE_ID;
  const selectedEntry = state.savedStyles.find((entry) => entry.id === selectedId);

  function openSelected() {
    if (!selectedId || !actions.openStyle(selectedId)) {
      toast('Could not open the selected style.', { tone: 'danger' });
      return;
    }
    toast(`Opened “${systemSelected ? 'Call Me Sensei' : selectedEntry?.label}”.`, { tone: 'success' });
    onClose();
  }

  return (
    <Modal onClose={onClose} testId="sky-open-style-dialog" title="Open style" width={620}>
      <div className="vs-style-dialog">
        <p>Search the shared Sky, Cloud, and Sky &amp; Cloud style library. Selecting an entry only stages it here; the current document stays unchanged until you choose Open.</p>
        <SearchSelect
          onChange={setSelectedId}
          options={options}
          placeholder="Search saved styles…"
          testId="sky-style-search"
          value={selectedId}
        />
        <section className="vs-style-selection" aria-live="polite">
          <span className="vs-style-selection__marker" aria-hidden="true" />
          <div>
            <strong>{systemSelected ? 'Call Me Sensei' : (selectedEntry?.label ?? 'Choose a style')}</strong>
            <small>
              {systemSelected
                ? 'System style · canonical baseline · read-only'
                : selectedEntry
                  ? `${resolveLabWorkspace(selectedEntry.workspace).label} · editable saved style`
                  : 'Search for a saved style above.'}
            </small>
          </div>
        </section>
        <div className="vs-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button disabled={!selectedId} kind="primary" onClick={openSelected} testId="sky-style-open">Open</Button>
        </div>
      </div>
    </Modal>
  );
}

function SaveStyleDialog({ actions, mode, onClose, state }) {
  const isUpdate = mode === 'update';
  const initialName = !isUpdate && state.activeStyleId === CALL_ME_SENSEI_SYSTEM_STYLE_ID
    ? 'Call Me Sensei Copy'
    : state.styleName;
  const [name, setName] = useState(initialName);

  function submit(event) {
    event.preventDefault();
    const result = isUpdate ? actions.updateStyle(name) : actions.saveStyleAs(name);
    if (!result?.ok) {
      for (const error of result?.errors ?? ['Could not save the style.']) toast(error, { tone: 'danger' });
      return;
    }
    toast(`${isUpdate ? 'Updated' : 'Saved'} “${name.trim()}”.`, { tone: 'success' });
    onClose();
  }

  return (
    <Modal onClose={onClose} testId={`sky-${mode}-style-dialog`} title={isUpdate ? 'Update style' : 'Save style as'} width={520}>
      <form className="vs-style-dialog" onSubmit={submit}>
        <p>
          {isUpdate
            ? 'Replace the open saved entry with the current validated SkyParams. You may rename it at the same time.'
            : 'Create a new searchable style from the current validated SkyParams. The open style is not overwritten.'}
        </p>
        <label className="vs-style-name-field">
          <span>Style name</span>
          <input
            autoFocus
            className="tk-text-field"
            onChange={(event) => setName(event.target.value)}
            placeholder="Style name…"
            type="text"
            value={name}
          />
        </label>
        <div className="vs-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <button
            type="submit"
            className="tk-button"
            data-kind="primary"
            data-testid={`sky-${mode}-style-submit`}
            disabled={!name.trim()}
          >
            {isUpdate ? <span>Update</span> : <span>Save As…</span>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteStyleDialog({ actions, onClose, state }) {
  function confirmDelete() {
    if (!actions.deleteStyle(state.activeStyleId)) {
      toast('This style could not be deleted.', { tone: 'danger' });
      return;
    }
    toast(`Deleted “${state.styleName}”. Call Me Sensei restored.`, { tone: 'success' });
    onClose();
  }

  return (
    <Modal onClose={onClose} testId="sky-delete-style-dialog" title="Delete style?" width={500}>
      <div className="vs-style-dialog">
        <p><strong>“{state.styleName}”</strong> will be removed from the browser style library. This cannot be undone.</p>
        <p>After deletion, the protected Call Me Sensei system style will open as the safe baseline.</p>
        <div className="vs-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="danger" onClick={confirmDelete} testId="sky-style-delete-confirm">Delete style</Button>
        </div>
      </div>
    </Modal>
  );
}

function TopBar({ config, onOpenExport, onOpenHome, onOpenStyleMenu, state }) {
  const menus = createLabEditorMenus({
    onDocument: onOpenStyleMenu,
    onHome: onOpenHome,
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: onOpenExport }],
  });
  return (
    <LabEditorHeader className="vs-topbar" menus={menus}>
      <BrandLockup labName={config.label} onLabNameClick={onOpenHome} />
      <button
        type="button"
        className="vs-title"
        data-testid="doc-title"
        onClick={onOpenStyleMenu}
        title="Save, update, or reopen a named runtime style"
      >
        <span>{state.styleName}</span>
        {state.styleDirty && <span className="vs-dirty">●</span>}
        <Icon name="chevron-down" />
      </button>
      <span className="vs-topbar-spacer" />
      <Button
        icon="stage-export"
        kind="primary"
        onClick={onOpenExport}
        testId="export-open"
      >
        Export
      </Button>
      <RendererToggle />
    </LabEditorHeader>
  );
}

function SectionRail({ config, onChange, value }) {
  return (
    <nav className="vs-rail tk" data-testid="section-rail" aria-label={`${config.label} workflow`}>
      {config.tabs.map(({ description, id, label }) => (
        <button
          key={id}
          type="button"
          className="vs-rail-stage"
          data-active={value === id}
          data-testid={`section-${id}`}
          title={`${label} — ${description}`}
          onClick={() => onChange(id)}
        >
          <Icon name={TAB_ICONS[id] ?? 'stage-shape'} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ config, panel, state }) {
  const active = config.tabs.find((tab) => tab.id === state.activeTab) ?? config.tabs[0];
  return (
    <aside className="vs-inspector tk" data-testid="inspector">
      <div className="vs-inspector-heading">
        <span>{config.subtitle}</span>
        <h1 data-testid="inspector-title">{active.label}</h1>
        <p>{active.description}</p>
      </div>
      <div className="vs-inspector-content">
        {state.entryError && <p className="vs-note" role="alert">{state.entryError}</p>}
        {panel}
      </div>
    </aside>
  );
}

function ReviewBar({ actions, engine, state, workspace }) {
  const [mode, setMode] = useState('rotate');
  const [setupAnchor, setSetupAnchor] = useState(null);
  useEffect(() => engine.setCameraMode(mode), [engine, mode]);
  const lightingOptions = [
    ...(state.lightingView === 'custom' ? [{ label: 'Custom light', value: 'custom' }] : []),
    ...LIGHTING_VIEW_OPTIONS.map(({ label, value }) => ({ label, value })),
  ];
  return (
    <>
      <PreviewBar title="Preview only — comparison, weather, quality, lighting, camera angle, and navigation are not saved into the SkyParams style.">
        {workspace === CLOUD_WORKSPACE && (
          <SegmentedControl
            onChange={actions.setComparisonMode}
            options={[
              { label: 'Physical volume', value: 'physical' },
              { label: 'Stylized result', value: 'styled' },
            ]}
            testId="cloud-comparison"
            value={state.comparisonMode}
          />
        )}
        <button
          type="button"
          className="vs-review-button"
          data-testid="review-setup"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSetupAnchor({ x: rect.left, y: rect.top });
          }}
          title="Weather, renderer quality, comparison light, and qualification view"
        >
          <Icon name="stage-look" />
          Review setup
        </button>
        <span className="vs-camera-mode" title="Choose what left-drag does. Wheel zoom and right-drag pan remain available.">
          <span>Camera</span>
          <SegmentedControl
            onChange={setMode}
            options={[
              { label: 'Rotate', value: 'rotate' },
              { label: 'Pan', value: 'pan' },
              { label: 'Zoom', value: 'zoom' },
            ]}
            testId="camera-mode"
            value={mode}
          />
        </span>
        <IconButton icon="reset" label="Reset camera" onClick={() => engine.resetCamera()} />
      </PreviewBar>
      {setupAnchor && (
        <Popover anchor={setupAnchor} onClose={() => setSetupAnchor(null)} title="Review setup" width={320}>
          <div className="vs-review-popover">
            <label className="vs-review-field">
              <span>Weather</span>
              <Select
                disabled={state.heroPreview}
                onChange={actions.setWeatherCondition}
                options={SKY_WEATHER_OPTIONS.map(({ id, label }) => ({ label, value: id }))}
                testId="weather-context"
                value={state.weatherCondition}
              />
            </label>
            <label className="vs-review-field">
              <span>Quality</span>
              <Select
                onChange={actions.setQuality}
                options={QUALITY_OPTIONS.map(([value, label]) => ({ label, value }))}
                testId="review-quality"
                value={state.quality}
              />
            </label>
            <label className="vs-review-field">
              <span>Comparison light</span>
              <Select
                onChange={actions.setLightingView}
                options={lightingOptions}
                testId="comparison-light"
                value={state.lightingView}
              />
            </label>
            <label className="vs-review-field">
              <span>Camera angle</span>
              <Select
                disabled={state.heroPreview}
                onChange={actions.setCameraView}
                options={CAMERA_VIEW_OPTIONS.map(({ label, value }) => ({ label, value }))}
                testId="camera-view"
                value={state.cameraView}
              />
            </label>
            {state.heroPreview && <p>Hero Cloud uses a dry, automatically framed stage. Turn off Preview authored cloud in Hero Cloud to use weather and camera presets.</p>}
            <p>These controls qualify the preview. They are never written into the saved SkyParams style.</p>
          </div>
        </Popover>
      )}
    </>
  );
}

function StatusBar({ config, state }) {
  return (
    <footer className="vs-status tk" data-testid="status-bar">
      <span className="vs-status-message" title={state.status}>{state.status}</span>
      <span className="vs-status-spacer" />
      <span className="vs-status-meta">{config.subtitle}</span>
      <span className="vs-live" data-busy={state.applying}>{state.applying ? 'Applying…' : 'Live'}</span>
    </footer>
  );
}

export function App({ engine, showEntryChooser = true, store, workspace = SKY_CLOUD_WORKSPACE }) {
  const state = useStoreState(store);
  const { actions } = store;
  const config = resolveLabWorkspace(workspace);
  const [styleMenuAnchor, setStyleMenuAnchor] = useState(null);
  const [styleDialog, setStyleDialog] = useState(null);
  const [entryChooserOpen, setEntryChooserOpen] = useState(showEntryChooser);
  const entryOptions = [
    { label: 'Call Me Sensei · system · read-only', value: CALL_ME_SENSEI_SYSTEM_STYLE_ID },
    ...state.savedStyles.map((entry) => ({
      label: `${entry.label} · ${resolveLabWorkspace(entry.workspace).label}`,
      value: entry.id,
    })),
  ];
  const panel = {
    preview: <Preview workspace={config.id} />,
    'hero-cloud': <HeroCloudPanel actions={actions} state={state} />,
    'cloud-look': <CloudLook actions={actions} params={state.params} />,
    'cloud-style': <CloudStyle actions={actions} params={state.params} />,
    atmosphere: <Atmosphere actions={actions} params={state.params} />,
    'sky-style': <SkyStyle actions={actions} params={state.params} />,
    celestial: <Celestial actions={actions} params={state.params} />,
    'cloud-world': <CloudWorld actions={actions} params={state.params} />,
    generation: <Generation actions={actions} params={state.params} />,
    environment: <Environment actions={actions} params={state.params} />,
  }[state.activeTab];

  return (
    <>
      {entryChooserOpen && (
        <LabEntryChooser
          currentDescription="Continue the SkyParams draft restored from this browser."
          currentName={state.styleName}
          entries={entryOptions}
          labName={config.label}
          newDescription={`Start from the clean ${config.label} default without changing any saved style.`}
          newLabel={`New ${config.label.replace(' Lab', '')} style`}
          onContinue={() => setEntryChooserOpen(false)}
          onCreate={() => {
            actions.createNewStyle();
            setEntryChooserOpen(false);
          }}
          onOpenEntry={(id) => {
            if (actions.openStyle(id)) setEntryChooserOpen(false);
          }}
        />
      )}
      <div className="vs-root">
        <TopBar
          config={config}
          onOpenExport={() => setStyleDialog('export')}
          onOpenHome={() => setEntryChooserOpen(true)}
          onOpenStyleMenu={() => setStyleMenuAnchor({ x: 12, y: 80 })}
          state={state}
        />
        <SectionRail config={config} onChange={actions.setActiveTab} value={state.activeTab} />
        <Inspector config={config} panel={panel} state={state} />
        <StatusBar config={config} state={state} />
      </div>
      {styleMenuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={styleMenuAnchor}
          onClose={() => setStyleMenuAnchor(null)}
          onOpenDialog={setStyleDialog}
          state={state}
        />
      )}
      {styleDialog === 'open' && (
        <OpenStyleDialog actions={actions} onClose={() => setStyleDialog(null)} state={state} />
      )}
      {(styleDialog === 'save-as' || styleDialog === 'update') && (
        <SaveStyleDialog
          actions={actions}
          mode={styleDialog}
          onClose={() => setStyleDialog(null)}
          state={state}
        />
      )}
      {styleDialog === 'delete' && (
        <DeleteStyleDialog actions={actions} onClose={() => setStyleDialog(null)} state={state} />
      )}
      {styleDialog === 'export' && (
        <Modal
          onClose={() => setStyleDialog(null)}
          testId="sky-export-dialog"
          title={`Export ${config.label.replace(' Lab', '')}`}
          width={720}
        >
          <div className="vs-export-dialog">
            <ExportPanel actions={actions} engine={engine} heroPreview={state.heroPreview} params={state.params} workspace={config.id} />
            <div className="vs-dialog-actions">
              <Button onClick={() => setStyleDialog(null)}>Done</Button>
            </div>
          </div>
        </Modal>
      )}
      <ReviewBar actions={actions} engine={engine} state={state} workspace={config.id} />
      <ToastStack />
    </>
  );
}
