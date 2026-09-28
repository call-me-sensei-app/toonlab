# Lab responsibilities

ToonLab separates user-facing authoring tools by the portable artifact they
produce. A Lab is named after the reusable thing a user saves and ships, not
every shader, preview object, or helper used inside the editor.

The complete public surface is listed in [The 15 live ToonLab Labs](live-labs.md).

## Artifact ownership

Every Lab must have:

- one documented creation type;
- one save/open round trip;
- explicit editable controls;
- explicit preview-only state;
- a documented runtime consumer;
- MCP feature metadata and valid starter documents;
- export behavior appropriate to its artifact.

A preview can include cameras, lighting, backgrounds, weather, time, example
models, animation, comparison stages, or interaction probes. Those helpers are
not silently written into the portable artifact.

## Shader Labs

Shader Labs save reusable visual treatments. They do not own model identity,
scene placement, level layout, current time, or current weather. Apply their
artifacts to semantically labeled targets through the documented focused
runtime or a Style Bundle.

## Generation Labs

Generation Labs save deterministic recipes or editable projects. Rock Lab can
start without a physical template or from one of the 580 physical GLB templates
in the combined official rock catalog. Tree, Grass, and Texture Labs save their
focused portable recipes. The host application remains responsible for scene
layout, collision, gameplay, and final asset placement.

## Integration examples

Example scenes can combine multiple ToonLab artifacts to demonstrate runtime
use. They are examples rather than additional Labs because they do not own a
new portable artifact contract.
