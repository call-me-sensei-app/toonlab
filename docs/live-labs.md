# The 15 live ToonLab Labs

ToonLab ships fifteen user-facing Labs. Each Lab edits one portable artifact
that can be saved, reopened, used through MCP, and consumed through a documented
runtime entry point. Preview cameras, stages, lights, playback, and comparison
helpers are not saved unless the Lab documentation explicitly says otherwise.

| Lab | Saved artifact | Runtime |
| --- | --- | --- |
| Character & Creature Shader Lab | `toon-preset` | `@call-me-sensei/toonlab/toon` |
| Tree Shader Lab | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| Grass Shader Lab | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| Flower Shader Lab | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| Rock & Geology Shader Lab | `rock-shader-preset` | `@call-me-sensei/toonlab/rock-shader` |
| Terrain & Ground Shader Lab | `ground-shader-preset` | `@call-me-sensei/toonlab/ground-shader` |
| Manufactured Surface Shader Lab | `manufactured-surface-profile` | `@call-me-sensei/toonlab/environment` |
| Water & Liquid Shader Lab | `water-preset` | `@call-me-sensei/toonlab/water` |
| Sky Shader Lab | `sky-params` | `@call-me-sensei/toonlab/sky` |
| Cloud Shader Lab | `sky-params` | `@call-me-sensei/toonlab/cloud` |
| Sky & Cloud Lab | `sky-params` | `@call-me-sensei/toonlab/sky` and `@call-me-sensei/toonlab/cloud` |
| Rock & Cliff Generation Lab | `rock-project` | `@call-me-sensei/toonlab/rockgen` |
| Tree & Shrub Generation Lab | `tree-recipe` | `@call-me-sensei/toonlab/vegetation` |
| Grass & Groundcover Generation Lab | `grass-preset` | `@call-me-sensei/toonlab/vegetation` |
| Texture & Material Map Generation Lab | `texture-recipe` | `@call-me-sensei/toonlab/texgen` |

## Rock generation choices

Rock Lab provides two clear starting paths:

1. **Procedural generation without a physical template.** Choose a procedural
   shape preset and edit every generator stage.
2. **Template-based procedural generation.** Choose one of the 580 physical
   templates in the combined official catalog (the Stylized rock catalog with
   480 entries plus 100 Nature Reference rocks) as the starting mesh, then
   reshape, surface, compose, and export it through the same editor.

Selecting a template loads that GLB as editable source geometry. It is not a
request to generate an unrelated rock and it does not describe the catalog as
a collection of generated variations.

## Documentation from a Lab

Open **Help → Documentation** in any Lab to jump directly to its detailed
workflow, editable controls, preview-only state, saved artifact, and runtime.
MCP users can call `list_live_labs` and `get_lab_features` for the same product
boundary in machine-readable form.

## Availability boundary

Only the Labs in this document are part of the public OSS Labs surface.
Examples elsewhere in the repository demonstrate integration; they are not
additional Labs and do not create additional saved artifact contracts.
