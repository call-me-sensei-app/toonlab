# Post-processing

An optional single-pipeline compositor (`@call-me-sensei/toonlab/post`). Disabled by
default — the character shader stays responsible for face quality, and raw
shader output remains easy to evaluate. When disabled, the pipeline renders
the scene straight through with zero overhead.

The compositor targets the TSL renderer stack. Native WebGPU is the default;
`?renderer=webgl` exercises the WebGL2 fallback through the same node graph.

## Pipeline

```js
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';

const post = createPostProcessingPipeline({
  renderer, scene, camera,
  // false by default: the host app owns canvas/CSS sizing.
  ownsRenderer: false,
  settings: { preset: 'softAnime' },
});

// render loop — replaces renderer.render(scene, camera):
post.render(delta);

// on resize:
post.setSize(window.innerWidth, window.innerHeight, window.devicePixelRatio);

// live re-tune:
post.setSettings({ features: { bloom: true }, parameters: { bloomStrength: 0.35 } });

// character-aware bloom (mask from createCharacterRenderPasses):
post.setCharacterMask(passes.characterMaskTexture);
```

(Inside this repo the labs import from `../../src/post/...`.)

The pipeline renders the scene into a color+depth target and composites in
one screen pass. `post.enabled` and `post.settings` are live getters;
`isPostProcessingEnabled(settings)` answers the same question for a plain
settings object. `setSize()` resizes only pipeline render targets by default;
set `ownsRenderer: true` only when this pipeline is also responsible for the
renderer canvas. `post.compositeScene` and `post.compositeCamera` are exposed
for compilation and diagnostics.

## Features and parameters

Settings are `{ preset, features, parameters }`, normalized by
`createPostProcessingSettings(options)`. Features (all `false` by default):

| Feature | Parameters |
|---|---|
| `bloom` | `bloomStrength/Threshold/Radius`, `bloomMode` (`'single'` one-pass 9-tap, or `'pyramid'` dual-filter mip chain + `bloomLevels`), character-aware `bloomCharacterBoost` / `bloomBackgroundSuppress` / `bloomCharacterSaturation` (keeps character bloom in the character's own hue instead of washing skin to white) |
| `colorGrade` | `exposure`, `contrast`, `saturation`, `warmth`, plus the LUT: `lutMap` (2D-strip texture), `lutSize`, `lutStrength` |
| `verticalGrade` | `topLight`, `bottomDark` |
| `vignette` | `vignetteStrength/Radius/Softness` |
| `screenOutline` | `outlineStrength`, `outlineDepthStrength`, `outlineLumaStrength`, `outlineColor` |
| `depthCue` | `depthCueStrength/Near/Far`, `depthCueColor` — distance haze tint |
| `motionBlur` | `motionBlurStrength` — camera-reprojection blur (camera movement only; there is no per-bone velocity buffer) |
| `enabled` | master switch; `strength` scales the whole composite |

Current fields with ranges and defaults:
[settings reference](settings-reference.md#post-processing)
(`POST_PROCESSING_SETTING_GROUPS` / `POST_PROCESSING_SETTING_FIELD_SCHEMA`).
`lutMap` is a runtime texture object and is not JSON-serializable.

## Presets and preset documents

Built-ins in `POST_PROCESSING_PRESETS`: `off`, `custom`, `softAnime` (subtle
presentation grade), `call_me_sensei` (studio-managed signature grade,
updated over releases), `showcase` (feature tour with demo values), and
`debugEdges` (outline diagnosis). Select with
`createPostProcessingSettings({ preset: 'softAnime' })`, or in the labs
`?post=1&postPreset=softAnime` (`?postAdvanced=1` exposes the raw controls).

Register your own, in code or as a versioned JSON document
(`toonlab/post-processing-preset`), matching the toon/water/environment
preset document pattern:

```js
import {
  registerPostProcessingPreset,
  createPostProcessingPresetDocument,
  validatePostProcessingPresetDocument,
  getPostProcessingPresetOptions,
} from '@call-me-sensei/toonlab/post';

registerPostProcessingPreset('filmicNight', {
  label: 'Filmic Night',
  features: { bloom: true, colorGrade: true, vignette: true },
  parameters: { bloomStrength: 0.4, warmth: -0.08, vignetteStrength: 0.3 },
});

const document = createPostProcessingPresetDocument('filmicNight');
// share JSON.stringify(document); load elsewhere:
const result = validatePostProcessingPresetDocument(document);
if (result.ok) registerPostProcessingPreset(result.value.id, result.value, { overwrite: true });

getPostProcessingPresetOptions(); // [{ id, label, description }] for HUDs
```

`sanitizePostProcessingPresetSettings` clamps and filters a raw settings
object against the schema.
