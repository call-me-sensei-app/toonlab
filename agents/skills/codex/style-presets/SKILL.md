---
name: style-presets
description: Explicitly select and record the intended ToonLab style or preset at every style-aware call site, distinguish neutral-default factories from Call Me Sensei-default factories, and audit overrides before reporting a custom integration note. Use before authoring environment, vegetation, grass, water, rock, ground, sky, cloud, or post settings, and whenever a subsystem looks unexpectedly unstyled.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Name the preset

This skill makes an individual call site explicit; it does not imply that every
listed subsystem is part of a live Lab. Sky and Cloud focused authoring is live.
Weather and Climate engines remain repository-only; agents may author host
scene conditions without claiming unsupported npm entry points.

Style-aware ToonLab factories take a `preset`, a `style`, or both. Some
factories intentionally resolve a neutral/default treatment when the selector
is omitted; Rock and Ground already default to Call Me Sensei, while
Cloud has no named style at all since the volumetric rebuild retired them.
Pass the intended selector where the API has one; do not invent a selector
for a parameter-only API. Never claim that every omitted selector falls back to neutral.

Omitting a selector on the neutral-default factories is one of the most
expensive mistakes a ToonLab agent can make. In one capability test it hit
three independent subsystems, each investigated as a custom integration note when the
actual cause was a missing selector or an overridden preset field.

## The rule

```js
// WRONG for a Call Me Sensei scene — resolves the vegetation baseline.
createVegetationShaderScopeSettings('tree', { foliage: { ... } });

// RIGHT
createVegetationShaderScopeSettings('tree', {
  preset: 'call_me_sensei',
  foliage: { ... },
});
```

Do this for every domain, on the **first** call, not as a later refinement.

## Where it bites

| Factory | Name this | Actual default behavior |
|---|---|---|
| `applyEnvironmentShader` | `preset: 'call_me_sensei'`, plus the intended `scenario` | The adapter accepts the selectors directly and composes preset, `settings`, then explicit overrides. `resolveEnvironmentPreset` remains available when plain settings data is needed elsewhere. |
| `createVegetationShaderScopeSettings` | `preset: 'call_me_sensei'` | Omitting it resolves the neutral vegetation baseline. |
| `createGrassSettings` / grass fields | `preset: 'call_me_sensei_clump'` for the first-party meadow, or `'anime_clump'` for the short narrow tuft recipe | Omitting it resolves neutral grass settings. These presets differ in geometry/coverage, not only colour. `createCallMeSenseiGrassField` defaults to the meadow and honors an explicit alternate preset. |
| `createWaterSettings` | `preset: <water body>` **and** `style: 'call_me_sensei'` | Omitting selectors resolves Lake with the default rendition. The Call Me Sensei style owns `colorTone: 'anime'`; any non-`classic` tone intentionally owns its palette/fade/reflection block, while `classic` leaves those per-key values authorable. |
| `createRockShaderSettings` / `applyRockShader` | `preset: 'call_me_sensei'` | Already defaults to Call Me Sensei. Textures are optional: the fallback is first-party generated 256 px data and the application report identifies its source. |
| `createGroundShaderSettings` | `preset: 'call_me_sensei'` | Already defaults to Call Me Sensei. |
| `createSkySettings` | `style: 'call_me_sensei'`, plus the intended `scenario` | Omitting style resolves the default sky rendition. |
| `createCloudParams` / `SkySystem.applyPreset` | no preset id | The volumetric rebuild retired the named cloud styles; the eight replacement looks are whole-sky presets. Omitting parameters resolves the published schema defaults. |
| `createPostProcessingSettings` | `preset: 'call_me_sensei'` | Omitting it resolves `off`. |

## Overriding a preset field is a deliberate act

Changing one key of a first-party preset is indistinguishable, at the call site,
from configuring an unstyled system. Real examples, all of which produced a bug
report against ToonLab before the cause was found:

- `groundAdoptStrength: 0.04` over the shipped meadow's `1` — grass then never adopted
  the ground colour, and the *mechanism* was reported as broken.
- `colorTone: 'classic'` over the studio `'anime'` — the lagoon deliberately
  left the studio tone, after which its palette/fade/reflection values needed
  explicit authorship.
- A bare `createVegetationShaderScopeSettings()` plus ~25 hand-authored fields —
  three revisions of look development on the wrong base.

Document meaningful overrides with the scene requirement they serve, such as
bed depth, camera distance, material identity or the requested art direction.
Routine art iteration is allowed; do not add an approval step for every value.

## When a subsystem looks wrong

Before concluding that ToonLab lacks a capability, check, in this order:

1. **Was a preset named?** Not "is a preset applied somewhere" — was one passed
   to *this* factory, at *this* call site.
2. **Was a preset field overridden?** Diff your options against the shipped
   preset's settings in the package source.
3. **Does the package or repository lab do it differently?** Inspect the
   installed preset registry/source first. If working in a ToonLab repository
   checkout, open the matching lab and compare the public API call and values it
   boots. Labs are not present in the npm tarball and are never runtime imports.
4. **Only then** record a custom integration note.

Steps 1–3 take minutes. Skipping them cost, in one run, several days of agent
time and produced register entries claiming gaps that did not exist.

## Introspection is limited, so be explicit

Not every resolved settings object records which preset produced it. Water and
Rock retain selector identity, while scoped vegetation, Grass, Ground, and
Cloud settings are normalized value objects. A few options are
**compile flags** rather than settings and never appear on the resolved object
at all — `groundField` on grass is one, so `'groundField' in settings` reports
`false` in a fully working scene.

Therefore: log the preset id you passed, at construction, next to the subsystem
name. It is the only durable record, and it makes a wrong base obvious in the
console instead of three revisions later in a render.
