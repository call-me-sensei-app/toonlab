# Lab preview environment

Every ToonLab Lab uses the same preview controls so users can judge a saved
artifact under comparable conditions. Preview state helps evaluate an artifact;
it is never added to the portable document unless that Lab explicitly lists the
field as editable content.

The shared contract is `toonlab/lab-preview-environment`, version 1, implemented
in `labs/shared/previewEnvironmentContract.js`.

## Time-of-day controls

The preview provides:

1. a continuous 0–24 hour control;
2. Dawn (06:00), Day (13:00), Sunset (18:00), and Night (22:00) shortcuts;
3. freeze and automatic-cycle modes;
4. resolved light and shadow information for inspection; and
5. a four-state comparison capture.

Changing preview time updates the relevant sun or moon direction, direct light,
ambient fill, shadows, sky, clouds, fog, exposure, emissive response, water,
vegetation, and other visible context. A Lab consumes only the inputs relevant
to its artifact.

The current time is preview state. A reusable shader may save how it responds
throughout the day, but it does not save the hour currently shown in the Lab.

## Preview styles and assets

Shader Labs can preview one complete style bundle and optionally override a
supported domain such as Ground, Grass, Tree, Flowers, Objects, Sky, Clouds, or
Lighting. Choosing **From bundle** removes that domain override. Bundle choice
and overrides remain preview-only.

Labs that accept source assets also provide a **Preview assets** selector.
Users can compare the current artifact on suitable procedural, project, saved,
or imported assets without changing the artifact's schema. Asset identity,
recipe, seed, geometry, texture inputs, palette, and placement stay in preview
state unless the Lab's own documentation explicitly makes one of them part of
the saved artifact.

## Daylight reference

At the Day reference state:

- direct sunlight is neutral to warm;
- ambient and sky fill are cool;
- cast and self shadows visibly retain a blue/cool relationship instead of
  becoming black, neutral gray, or merely darker albedo; and
- shadow detail remains readable.

The shared harness uses `#647fbd` as its daylight shadow-tint reference. A
style can tune the exact curve while preserving that cool-shadow relationship.
For Rock Shader Lab, the illumination belongs to the preview environment; the
portable rock shader continues to own only the reusable rock-surface response.

## What a saved artifact excludes

Unless a Lab explicitly documents otherwise, saving or exporting does not
include:

- preview camera, orbit, zoom, or stage;
- current time or transient weather;
- comparison style or domain overrides;
- selected comparison fixture;
- debug view, isolation mode, or component visibility; or
- capture and automation metadata.

Use **Help → Documentation** inside a Lab to see its precise editable and
preview-only boundaries.
