# Getting started

ToonLab supplies rendering, character, surface and asset runtimes for Three.js
games. For a new game, build a playable host-game slice and integrate the
needed systems. For an existing game, preserve its architecture while applying
the requested treatment. The package does not automatically author a finished
world.

Before integrating a scene, read [What ToonLab 0.5.0 can and cannot
do](capability-status.md). It defines the supported first-pass contract, which
responsibilities the Call Me Sensei bundle owns, what the host must provide,
how imported-material uncertainty is handled, and which checks must pass before
the result is considered ready.

For a walkable scene, also read [Collision defaults](collision.md). Labeled
trees, rocks, manufactured surfaces/environments, and props become conservative
static blockers through `createSceneStyleRuntime()`; the walkable character
uses that service automatically. Precise compound colliders and navigation
remain explicit host decisions.

## Install into a game

```bash
npm install @call-me-sensei/toonlab three
```

Read the installed `NPM-LIBRARY.md` and `agents/codex/AGENTS.md`. Optional React,
VRM, physics and AO peers are only needed for the features that use them. Use
the `game-dev` skill and copyable game foundation for a new project; a source
checkout or paid MCP subscription is not required.

## Clone and run the authoring Labs

```bash
git clone https://github.com/call-me-sensei-app/toonlab.git
cd toonlab
npm install
npm run dev
```

Open `http://localhost:5175`. The home page lists the
[15 live ToonLab Labs](live-labs.md), grouped into Shaders, Asset Generation,
and Source & Texture Generation.

Rendering uses Three's `WebGPURenderer` by default. Add `?renderer=webgl` for
the TSL WebGL2 fallback or `?renderer=webgpu` to require WebGPU explicitly.

## Choose a Lab

Every live Lab documents:

- what users can edit;
- what is preview-only;
- which portable artifact is saved;
- which runtime consumes that artifact;
- how to reopen and export the result.

Open **Help → Documentation** inside a Lab to jump directly to its user guide.
See [Lab responsibilities](lab-architecture.md) for the shared ownership rules.

Rock Lab has two starting paths:

1. generate procedurally without a physical template; or
2. choose a physical GLB template from either the 480-entry Stylized rock
   catalog or the 100-item Nature Reference Rocks collection and use its
   control mesh as the editable starting point. Nature Reference Rocks retain
   separate realistic PBR, Call Me Sensei, retained-high, LOD, collision, and
   rebake metadata through the official-catalog package API.

## Prepare a package from the source checkout

```bash
npm run verify:release
npm pack --dry-run
```

`npm run build` builds the authoring website; the public runtime ships source
modules and generated declarations. The npm package contains the focused runtime modules, MCP server, local database
setup, agent guidance, and public creation schemas. Lab UIs and optional media
are repository tools rather than npm runtime files.

## Connect MCP

```bash
npm run setup
```

Use the command shown on `/settings/` to connect your MCP client. Start with
`get_workspace_info`, `list_live_labs`, and `get_lab_features`. Search local
and official assets before importing external CC0 content or generating a new
recipe.

## Load user-owned models

Character and material Labs can load supported files from their import controls.
For repeatable local development, keep private models under `assets-local/`;
that directory is ignored by Git and excluded from the npm package. See
[Characters and animation](characters.md) for supported model and animation
workflows.

## Reset and deep links

Lab controls write supported choices into the URL so users can share a focused
view. A bare URL restores the Lab's local browser state. **Reset Lab** clears
that Lab's stored state and reloads its defaults.
