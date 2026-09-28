# Local database and public asset releases

ToonLab OSS uses local Postgres as the authoritative structured store. The
browser is an editing surface, not a durable database. `.toonlab/objects`
contains opaque binaries only; `files` rows carry their identity, checksum,
type, size, and relationship to a creation.

## Setup

```sh
cp .env.example .env
npm install
npm run setup
npm run dev
```

`npm run setup` starts the bundled Postgres 17 Compose service when
`DATABASE_URL` is unset or points at the bundled local service. For an
existing Postgres installation, set `DATABASE_URL`; setup skips Compose,
applies schema migrations, applies catalog seeds, and reports which provider
keys are enabled.

Docker Desktop users must start the application and complete its first-run
setup before running ToonLab setup. The runner accepts `docker compose`,
Docker Desktop's bundled macOS Compose binary, or `docker-compose`, and emits
a targeted error if the engine is not running.

For every later release:

```sh
git pull --ff-only
npm install
npm run update
```

`npm run update` uses the same idempotent migration and seed runner as setup.
End users never choose individual SQL files. Fresh databases apply every
versioned catalog batch; existing databases apply only batches missing from
`catalog_seed_batches`. Released seed files are append-only history and must
not be edited or replaced.

The development server binds to `127.0.0.1` by default. Provider keys remain
in the Node environment and are never returned to browser code:

- `TRIPO_API_KEY`
- `MESHY_API_KEY` or comma-separated `MESHY_API_KEYS`
- `GEMINI_API_KEY`
- `FAL_KEY` or comma-separated `FAL_KEYS` for Fal Patina PBR materials
- `OPENAI_API_KEY`
- `ARK_API_KEY`
- `POLYPIZZA_API_KEY`

## Durable data

- `creations`: named lab documents, imported/generated assets, style profiles,
  and style bundles.
- `lab_drafts`: explicit in-progress documents.
- `lab_state`: a compatibility bridge for synchronous lab stores. Values are
  held only in browser memory while the app is running and are committed to
  Postgres.
- `files`: metadata for content-addressed binaries in `.toonlab/objects`.
- `catalog_assets`: official public release metadata and R2 URLs.
- `generation_jobs`: local provider requests and results.
- `schema_migrations` and `catalog_seed_batches`: independent idempotency
  ledgers.

On first connection, browser localStorage and the old IndexedDB library are
imported in transactions. Import runs record imported/skipped counts and
validation failures. After a successful browser-state commit, durable browser
copies are removed.

## Official asset release procedure

Official assets use:

```text
official/<release>/<asset-id>/<filename>
```

Redistributable asset packs use stable subtrees without flattening extracted
paths:

```text
official/<release>/<asset-id>/
  original/<original-archive-name>.zip
  files/<preserved-relative-path>
  thumbnails/catalog.webp
  notices/<original-readme-and-license-files>
```

Do not overwrite or reuse release keys.

The ToonLab OSS public bucket is `toonlab-oss`. Official release manifests and
catalog seeds must use `https://assets.toonlab.io` as their public base. The
private CDN, signed URLs, `creation-files` paths, `r2.dev`, and the
credentials-protected S3 API endpoint are rejected by the release and seed
validators.

1. Verify license, attribution, original-archive redistribution, extracted-file
   redistribution, preview rights, quality, and OSS eligibility for every
   asset. Custom terms must have an approved checked-in reviewed-license
   record and evidence; site-wide terms alone are not enough when a pack
   README or contributed creator may govern.
2. Normalize the distributable file and thumbnails.
3. Upload the immutable objects to R2.
4. Verify CDN GET/HEAD behavior, CORS, SHA-256, byte size, and content type.
5. Download the verified `toonlab.oss-catalog-release.v2` manifest from
   ToonLab Pro and run:

   ```sh
   npm run catalog:seed:generate -- \
     --manifest release.json \
     --out database/seeds/catalog/NNNN_release_name.sql
   ```

6. Run `npm run db:seed` against both a clean database and an upgraded
   database.

The generator rejects unsafe or duplicate extracted paths, missing review
fields, invalid content types/checksums, non-public or non-immutable URLs,
files outside the approved scope, and unapproved custom licenses. It emits an
upsert so a later immutable release can move an existing stable asset ID to its
new verified URL while leaving omitted catalog entries untouched. See
`docs/catalog-asset-pack-manifest.example.json` for the manifest shape.

Catalog withdrawals are append-only metadata releases. A withdrawal hides the
primary and individual download URLs and records a reason. A legal takedown may
also remove the corresponding R2 objects despite the normal immutable-object
rule.

Schema migrations never contain catalog content. A seed filename and digest
are immutable once applied. `catalog_seed_batches` prevents upgrades from
resetting or deleting local Library data.

Each official dataset is a new numbered content seed, not a schema migration
and not a replacement for one mutable master seed. Keeping all batches in the
repository ensures a clean installation and a fully upgraded installation
converge on the same catalog.

## Current starter Gallery

As of September 8, 2026, setup installs **8,464 published, OSS-eligible assets**:

| Dataset | Assets | Current release |
| --- | ---: | --- |
| Open Gallery assets | 7,683 | `2026-08-open-assets` |
| C7 rocks | 480 | `2026-08-c7-v2` |
| Nature Reference C8 rocks | 100 | `2026-09-c8-first100-profile-r1` |
| CC0 community tree recipes | 201 | `2026-09-community-trees-v1` |

`0008_2026-08-c7-v2.sql` updates the existing C7 identities to their verified
model and material files. `0009_2026-09-c8-first100-profiles.sql` updates the
100 C8 identities, including 13 revised material configurations. Unchanged
models retain their existing immutable URLs and checksums.

`0010_2026-09-community-trees.sql` adds the 201 published CC0 tree recipes
and their thumbnails. Gallery supports filtering these recipes, previewing
them, downloading their JSON, and opening them in Tree Lab.

Both `npm run setup` and `npm run update` apply these batches automatically.
They update catalog metadata without replacing personal Library rows. Earlier
numbered batches remain unchanged so fresh and upgraded installations converge
on the same Gallery.

For a metadata release that reuses files from an earlier verified release,
pass its exported base manifest to the seed generator:

```sh
npm run catalog:seed:generate -- \
  --manifest release.json --base-manifest previous-release.json \
  --out database/seeds/catalog/NNNN_release_name.sql
```

Reused files must retain their asset ID, immutable URL, checksum, byte size,
content type, license, and redistribution scope. Withdrawn base assets cannot
be reused. New files must use the new release's own immutable prefix.

Community publications enter the starter Gallery through an explicit
published-asset allowlist with an approved redistribution license. The
September tree batch includes all 201 published CC0 tree recipes present at
export time. Pro first exports that allowlist. Redistributable files are copied into an immutable
`official/` release prefix; external-delivery assets retain their original
public download URL while their verified release metadata and preview
artifacts use the official CDN. First-party ToonLab rocks and trees plus
eligible open assets are official OSS datasets; there is currently no premium
asset tier. Pro releases them from the
exact-email-controlled OSS release page after their published revisions,
license scope, and public delivery verify. Character Setup,
private/team content, retracted/taken-down publications, prompts, reports,
references, and generation attempts remain excluded.

First-party rock rows must include `metadata.dimensionsMeters` with positive
numeric `width`, `height`, and `depth`. These are the realized LOD0 target
bounds in meters. Gallery and MCP search results expose this compact spatial
metadata with family/profile and taxonomy so an agent can shortlist rocks
without downloading or rendering each GLB; the detail call retains the full
recipe, lineage, and immutable artifact list.
