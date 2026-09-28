# ToonLab agent prompts

These prompts are included with the npm package. They use only the supported
0.5.0 runtime, agent skills, and MCP workflows.

## New playable game

```text
Use the installed ToonLab game-dev skill to build the game described in my
request. Implement the host gameplay, input, camera, UI and level structure;
use ToonLab's public APIs for the supported visual and runtime systems. Start
with a playable slice that has movement, collision, one objective and restart,
then replace placeholders and apply the selected style. Use the installed
version's export map, preserve asset/material identities, assign one update
owner per system, and verify actual keyboard/pointer input, resize and teardown.
Do not invent package APIs or describe the result as polished before inspecting
it at the gameplay camera. Report remaining limitations concretely.
```

## Existing-scene integration

```text
Using the ToonLab game-dev skill, integrate @call-me-sensei/toonlab into this
existing Three.js scene. Inventory every renderable root and material. Assign
stable ToonLab target ids, rendering domains, material ids, and semantic roles.
Apply the Call Me Sensei bundle in strict mode through the documented focused
runtimes for the domains actually present. Preserve the scene's geometry, XZ
layout, cameras, gameplay, dynamic physics, navigation, and frame loop. Run the
app's typecheck, tests, build, and visual smoke check. Finish only when the
style audit is ready or report each remaining blocker with a concrete fix.
```

## Character or manufactured-material before/after

```text
Using the ToonLab toon-shading or environment skill as appropriate, create a
true before/after comparison for the supplied model. The before side must use
its normal Three.js PBR material and the same camera, pose, lights, exposure,
background, and source textures as the after side. The after side may change
only the selected ToonLab shader/profile. Do not flatten, unlight, or otherwise
degrade the before side. Verify that the comparison demonstrates the shader's
effect rather than a scene-lighting difference.
```

## Policy-aware asset discovery

```text
Using the ToonLab asset-sourcing skill and whichever ToonLab MCP servers are
connected, load get_anime_game_profile and confirm the project's sourcing
policy. Search project/local Library first, then ToonLab Gallery, then allowed
external open sources. Validate provenance, license, anime-style support, and
policy decision before selection. Generate only after the searches fail and a
custom asset gap has been recorded and approved. Report the selected stable id,
source, license, dimensions, semantic domain, and material-role readiness.
```

## Author a portable Lab document

```text
Use ToonLab MCP to call list_live_labs, choose the named public Lab, and call
get_lab_features before editing. Create a schema-valid starter with
create_lab_document, make only requested semantic changes, and validate the
result. Save it to my Library only if I asked for persistence. Keep preview
camera, stage, lighting, playback, and comparison state out of the portable
document.
```

## Tree or grass generation

```text
Using the ToonLab vegetation-sky skill, create the requested tree, shrub,
grass, or groundcover. For an existing authored tree, search the public Gallery
through MCP first and retrieve its portable recipe; the npm package contains
tree construction/shader capability but no predefined tree asset collection.
Author a new `StylizedTree` or `BranchTree` only when requested or when accepted
discovery does not close the role. Keep recipe, seed, geometry, palette, and
placement separate from the Tree/Grass/Flower shader profile. Emit stable
modeled-part and material-role labels, preserve the recipe for regeneration,
and verify LOD and shadow behavior. Do not use the repository-only experimental
species engine.
```

## Rock generation and shader separation

```text
Using the ToonLab rockgen and rock-ground-shaders skills, create or edit the
requested rock asset with @call-me-sensei/toonlab/rockgen and style it with
@call-me-sensei/toonlab/rock-shader. Preserve geometry identity, seed, surface recipe, authored masks, LOD,
collision, and bake provenance; keep reusable appearance in
the rock shader profile. Validate the portable documents and verify the result
from multiple useful views. Do not deep-import repository compilers or test
fixtures.
```

## Apply a Style Bundle

```text
Using the ToonLab scene-style-application skill, load the selected portable
Style Bundle. Inventory and explicitly label only the domains present in this
scene, audit in strict mode, and stop before mutation if any target, material
role, required mask, or adapter is missing. Apply the accepted plan atomically,
preserve asset identity and current scene conditions, then verify that every
populated slot has an owning runtime and that teardown restores the source
materials.
```
