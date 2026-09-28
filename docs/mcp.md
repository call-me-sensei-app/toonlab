# Local MCP and `.toonlab` workspace

The open-source ToonLab server is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server that lets coding agents use the same assets and recipes as the browser
labs. It uses the stdio transport and does not require a ToonLab account,
OAuth, or a hosted service.

## Start and connect

```bash
npm install
npm run dev
```

Open `http://localhost:5175/settings/` and copy the generated JSON into your
client's local MCP configuration. The paths are absolute so the client can
start the server from any working directory.

You can also start the server directly:

```bash
npm run mcp -- --workspace /absolute/path/to/project/.toonlab
```

When installed from npm, the package exposes the `toonlab-mcp` binary:

```bash
npx -y --package=@call-me-sensei/toonlab@latest toonlab-mcp --workspace /absolute/path/to/project/.toonlab
```

## Workspace layout

`.toonlab/` is the local source of truth and is ignored by Git by default.

```text
.toonlab/
  assets/           # project-owned asset files
  creations/        # MCP-created recipes and documents
  exports/          # copies of files exported from browser labs
  imports/          # downloaded CC0 bundles and attribution manifests
  library/entries/  # catalog entries saved from any lab
  presets/          # portable preset files
  storage/          # browser lab documents mirrored as JSON
  toonlab.json      # workspace version and migration markers
```

Existing ToonLab `localStorage` and IndexedDB catalog data is imported the
first time the local Vite server sees it. After that, disk wins at startup and
browser changes are mirrored back to disk. The current synchronous lab stores
therefore keep working without hiding data from MCP.

Provider API keys are excluded from portable workspace documents. Local MCP
provider generation uses server-side keys configured by the developer; browser
storage is not a mechanism for delivering those keys to the MCP process.

## Tools

The OSS server currently exposes:

- `get_workspace_info` — workspace path, version, and migration status.
- `list_live_labs` / `get_lab_features` — every public Beta Lab going live and
  its complete machine-readable settings schema, full portable-document
  structure, source/output capabilities, and supported semantic operations.
- `create_lab_document` — build a valid starter for any live Lab. Passing an
  official Rock template creates a template-based procedural project with that
  GLB as its editable starting mesh.
- `search_assets` / `get_asset` — approved built-in generator/settings entries,
  saved library, installed released catalog, lab documents, presets, imports,
  and exports. Use `source: "official"` for installed R2-backed assets. Official
  rock search summaries include `metadata.dimensionsMeters` (`width`,
  `height`, and `depth` in meters), family/profile, taxonomy, release wave,
  revision, and recipe hash. Follow `nextOffset` until null, use this compact
  metadata to shortlist, then call `get_asset` only for the finalists that
  need the full recipe and file list.
- `search_public_gallery` / `get_public_gallery_asset` — public authored
  assets with license, attribution, tags, preview, immutable files, and the
  complete portable document. Reviewed tree recipes live on this surface, not
  in the npm runtime; use `type: "tree-recipe"` and paginate to `nextOffset:
  null`.
- `list_my_creations` / `get_my_creation` / `save_creation` /
  `update_creation` / `delete_creation` — full CRUD for the local project
  library. `update_creation` accepts a complete portable document or an RFC
  7396 merge patch; destructive deletion requires `confirm: true`.
- `mutate_lab_creation` — validated `set_feature` edits for all 15 Labs plus
  structural Rock edits such as piece management, sculpt operations,
  source-GLB changes, independent top finishes, and source-mesh vertex edits.
- `list_lab_state` / `get_lab_state` / `set_lab_state` / `delete_lab_state` —
  unrestricted local management for drafts and browser-compatible lab stores
  that have not yet been normalized into library creations. Secret-looking
  keys and provider credentials are rejected; deletion requires
  `confirm: true`.
- `generate_asset` — deterministic seeded recipes from built-in catalog
  entries, saved into `.toonlab/creations` by default.
- `search_cc0_assets` / `get_cc0_asset` / `import_cc0_asset` — public CC0
  models, textures, and HDRIs from Poly Haven and ambientCG, including source
  and attribution metadata.
- `get_generation_capabilities` — a machine-readable description of what is
  local versus hosted-Pro functionality.

The server also exposes assets as `toonlab://asset/...` MCP resources. Small
JSON/text files and binaries can be read inline; every disk file includes an
absolute path so local development tools can consume larger files directly.

Lab authoring is a design-time workflow. The MCP feature schemas let an agent
reason about every supported control without forcing a user to learn the
configuration surface first; the `@call-me-sensei/toonlab/*` npm subpaths own
the shipping runtime.

## API conventions

The local server implements MCP over stdio. Tool input is a JSON object. A
successful `tools/call` returns the documented value in `structuredContent`
and a JSON text copy in `content[0].text`. Invalid input, a missing target, an
ambiguous creation key, or a policy denial returns an MCP tool result with
`isError: true`; the server process remains available.

Creation and Lab-state mutation tools are idempotent; `generate_asset` creates
a new seeded artifact unless the caller controls its save target. Both
deletion tools require the literal boolean `confirm: true`. JSON merge patches use
[RFC 7396](https://www.rfc-editor.org/rfc/rfc7396): an object is merged
recursively, and `null` removes a property.

### Live Lab directory

`list_live_labs({})` returns the supported authoring boundary. Every returned
lab supports creation CRUD through the creation tools.

| Lab id | Portable creation type | Runtime |
|---|---|---|
| `shader` | `toon-preset` | `@call-me-sensei/toonlab/toon` |
| `tree-shader` | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| `grass-shader` | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| `flower-shader` | `vegetation-shader-preset` | `@call-me-sensei/toonlab/vegetation-shaders` |
| `rock-shader` | `rock-shader-preset` | `@call-me-sensei/toonlab/rock-shader` |
| `terrain-shader` | `ground-shader-preset` | `@call-me-sensei/toonlab/ground-shader` |
| `manufactured-material` | `manufactured-surface-profile` | `@call-me-sensei/toonlab/environment` |
| `water` | `water-preset` | `@call-me-sensei/toonlab/water` |
| `sky` | `sky-params` | `@call-me-sensei/toonlab/sky` |
| `cloud-shader` | `sky-params` | `@call-me-sensei/toonlab/cloud` |
| `sky-cloud` | `sky-params` | `@call-me-sensei/toonlab/sky` |
| `rock` | `rock-project` | `@call-me-sensei/toonlab/rockgen` |
| `tree` | `tree-recipe` | `@call-me-sensei/toonlab/vegetation` |
| `grass` | `grass-preset` | `@call-me-sensei/toonlab/grass` |
| `texture` | `texture-recipe` | `@call-me-sensei/toonlab/texgen` |

`get_lab_features({ lab })` returns:

```json
{
  "lab": { "id": "rock-shader", "creationTypes": ["rock-shader-preset"] },
  "capabilities": {
    "authoring": { "featureMutation": "set_feature", "structuralOperations": [] },
    "outputs": ["portable-preset", "runtime-style-bundle"],
    "preview": { "clientOwned": true, "persisted": false }
  },
  "featureCount": 68,
  "schema": { "material": { "tint": { "type": "color" } } },
  "documentContract": {
    "creationType": "rock-shader-preset",
    "discriminator": { "path": "schema", "value": "toonlab/rock-shader-preset" },
    "schemaVersion": 1,
    "versionPath": "version",
    "idPath": "id",
    "labelPath": "label",
    "featureRoot": "settings",
    "featureApplication": "direct",
    "docKey": { "path": "id", "requiredSeparately": false },
    "jsonSchema": {},
    "starterDocument": {}
  }
}
```

The actual response contains the complete field schema, a structural JSON
Schema, capabilities, and a fully populated valid `starterDocument`. Use
`create_lab_document` for a fresh document and `mutate_lab_creation` for
validated edits; direct JSON editing remains available for advanced clients.
Tree authoring reports
`featureApplication: "compiled-authoring-state"`: its UI fields compile into
the recipe `options` object. Rock projects have no document-level id, so their
`docKey.requiredSeparately` is `true`.

Rock reports its complete structural operation list and source/output
contract. Source-mesh sculpt deltas serialize as `base64-f32le-v1` float32
data, with at most 200 edit operations and 10,000 vertex deltas in one
portable project. This keeps normal sculpt sessions inside the hosted 256 KiB
creation limit while restoring editable delta arrays when the document is
opened. Adaptive meadow grass, camera, lighting, and viewport navigation are
explicitly preview-only and are not persisted.

### Creation management

| Tool | Input | Result |
|---|---|---|
| `list_my_creations` | `query?`, `tags?`, `kind?`, `offset?`, `limit?` | Gallery-style private Library search. Text covers names, descriptions, and tags; `tags` uses exact AND matching. Follow `nextOffset`. Entries include `id` (portable document key), `type`, and `managementId`. |
| `get_my_creation` | `id`, `type?` | Complete library document or workspace file. |
| `save_creation` | `name`, `document`, `kind?`, `filename?`, `description?`, `tags?` | A JSON/text creation with durable searchable metadata. Up to 10 lowercase slug tags, 32 characters each. |
| `update_creation` | `id`, exactly one of `document?` or `patch?`, plus `label?`, `description?`, `tags?`, `type?` | Updated creation and searchable metadata. |
| `mutate_lab_creation` | `id`, `lab`, `operation`, operation arguments | Semantically validated, persisted Lab edit. |
| `delete_creation` | `id`, `confirm: true`, `type?` | `{ deleted, id }`. |

`create_lab_document` does not persist by itself. For an official Rock asset,
pass its complete `get_asset` result as `source`, or pass its id as
`source_id`. The returned project uses the released GLB identity, original
Call Me Sensei material, deterministic deformation seed, and source top
finish. Save that result with `save_creation`; subsequent surface, top,
piece, and mesh operations can use `mutate_lab_creation`.

Use `managementId` for reads, edits, and deletes. It is the immutable database
row UUID in the default local Postgres workspace and avoids collisions when
two creation types intentionally use the same portable document `id`. A legacy
document key remains accepted when it is unique; otherwise the server refuses
the operation and asks for `managementId` or `type`. File targets use their
`file:creations/...` id and only files below `.toonlab/creations` are editable
through creation management.

Saved creations are first-class discovery candidates. Human developers search
the Library page; agents call `list_my_creations` or
`search_assets({ source: "library" })` with the same text/tag vocabulary. Tags
are normalized to lowercase slugs, persisted separately from the document, and
survive edits, reloads, and Lab synchronization. Always assign concrete role,
location, project, and lifecycle tags when saving reusable objects—for example
`["bench", "village", "outdoor", "hero-prop"]`.

Example create-from-contract flow:

```json
{
  "name": "get_lab_features",
  "arguments": { "lab": "water" }
}
```

Take the returned `documentContract.starterDocument`, change its label and
settings, then call:

```json
{
  "name": "save_creation",
  "arguments": {
    "name": "Harbor water",
    "kind": "water-preset",
    "document": {
      "type": "toonlab/water-preset",
      "version": 2,
      "id": "harbor_water",
      "label": "Harbor water",
      "description": "",
      "settings": {}
    }
  }
}
```

The abbreviated `{}` settings above are illustrative; copy the populated
starter returned by the server rather than replacing it with an empty object.

### Raw Lab state (OSS only)

Raw state management exists for drafts and historical Lab stores that are not
yet normalized creations.

| Tool | Input | Result |
|---|---|---|
| `list_lab_state` | `query?` | `{ count, items: [{ key, value }] }` |
| `get_lab_state` | `key` | `{ key, value }` |
| `set_lab_state` | `key`, `value` | The normalized stored value. |
| `delete_lab_state` | `key`, `confirm: true` | `{ deleted, key }` |

Allowed keys use the `toonlab.` or legacy `threejs-toon-shader.` prefix and
contain only letters, numbers, dots, underscores, and dashes. Thumbnail/probe
keys, secret-looking keys, and known provider credential stores are never
listed or persisted. Values may be JSON or strings and are limited to 4 MiB
of UTF-8 data.

### Asset, policy, and generation tools

| Tool | Principal input | Notes |
|---|---|---|
| `get_anime_game_profile` | none | Canonical bundle, art direction, routing, and discovery policy. |
| `get_workspace_info` | none | Workspace mode, path, database counts, or legacy migration state. |
| `search_assets` | `query?`, `source?`, `kind?`, `cluster?`, `tags?`, `offset?`, `limit?`, `domain?`, `policy?` | Unified local/built-in/official discovery. Follow `nextOffset`. |
| `get_asset` | `id`, `source?`, `domain?`, `policy?` | Complete selected record. |
| `search_public_gallery` | `query?`, `type?`, `offset?`, `limit?`, `domain?`, `policy?` | Public authored assets. Use `type: "tree-recipe"` for trees and follow `nextOffset`. |
| `get_public_gallery_asset` | `id`, `domain?`, `policy?` | Complete public portable document and immutable files by publication id or slug. |
| `generate_asset` | `catalog_id`, `seed?`, `name?`, `save?`, `domain?`, `policy?` | Local deterministic recipe generation; it does not call a hosted model. |
| `search_cc0_assets` | `query?`, `kind?`, `source?`, `limit?`, `domain?`, `policy?` | Searches Poly Haven and ambientCG. |
| `get_cc0_asset` | `source`, `id`, `kind?`, `resolution?`, `domain?`, `policy?` | Resolves one downloadable CC0 asset. |
| `import_cc0_asset` | `source`, `id`, `kind?`, `resolution?`, `name?`, `domain?`, `policy?` | Downloads files and writes attribution/provenance into the workspace. |
| `validate_asset_candidate` | normalized candidate plus `policy?` | Returns the policy decision without hiding denied candidates. |
| `record_asset_gap` | `id`, `domain`, `kind`, `reason`, optional evidence fields | Returns canonical JSON and Markdown gap records for the client to write. |
| `get_generation_capabilities` | none | Reports the locally configured image, Fal Patina material, and 3D providers, supported kinds, models, and limits. |
| `generate_ai_asset` | `kind`, provider/model inputs, prompt or source images | Uses the developer's server-side provider keys. `kind: "material"` creates one Fal Patina unit containing its preview, variants, requested typed PBR maps, and manifest. Meshy 7 accepts image or 2–4 view inputs; Meshy text mode first creates a PNG/JPEG concept through the selected `image_model`, then submits it to Meshy as one trackable local workflow. Tripo supports direct text/image/multiview generation and segmentation. |
| `get_generation_job` | `job_id` | Returns one local provider workflow, including parent/child stages and ready artifacts. |
| `get_generation_jobs` | optional filters | Lists local generation workflows for polling and recovery. |
| `save_generated_asset` | `job_id`, optional name/tags | Persists a ready generated artifact and provenance into the local Library. |

Search tools can access the network; creation and Lab-state tools operate only
inside the selected local workspace. Imported files retain their source URL,
license, attribution, stable id, and policy decision.

## OSS and Pro boundary

Open source owns the local workflow: disk persistence, procedural generation,
CC0 discovery/import, stdio MCP, and optional bring-your-own-key image/3D
generation. ToonLab Pro uses the same conceptual tool schemas with hosted
adapters, adding remote Streamable HTTP + OAuth, managed provider credentials,
credits and refunds, durable isolated workers, private cloud libraries, and
cross-device/team sync.

For OSS, provider credentials stay in the local Node environment. Configure
`FAL_KEY` for Patina materials and only the other providers you intend to use.
Patina supports 1K–8K output and stores every returned map under one generated
material record. Meshy 7 supports image-to-3D and
multi-image-to-3D; a text request is explicitly a two-stage selected-image-
model concept followed by Meshy. Meshy does not provide model segmentation,
so choose Tripo when segmentation is required.

There is intentionally no per-user ownership boundary in the OSS server: the
developer who grants an MCP client access to a `.toonlab` workspace grants it
permission to edit any non-secret creation or lab-state entry in that local
workspace. ToonLab Pro is different: authenticated MCP clients may mutate only
creations owned by the signed-in user.
