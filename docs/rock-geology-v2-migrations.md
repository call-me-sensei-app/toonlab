# Rock geology v2 schema and migration status

## Released representative contract

`toonlab.rock-region-binding` version 1 is the first release-candidate binding.
It is limited to profile `hoodoo-caprock-normalized-height-v1` with the fixed
`base`, `shaft`, `neck`, and `cap` channel order. There is no earlier released
binding to migrate, and there is no supported version 2 today. Unknown versions
fail closed.

Rollback is byte based: retain the neutral parent GLB and its SHA-256, discard
the derived semantic GLB, and recompile with the pinned package/compiler
version. The compiler never mutates the parent file. Disabling reversible
stylization restores the exact neutral material/geometry state; it does not
rewrite semantic bytes.

## Repository-only contracts

The geology-v2 recipe compiler, artifact-manifest schema, Unreal import
contract, family ontology, and full bake/formation documents remain research
artifacts. They are not npm APIs and have no public migration guarantee while
C9, C10, C12, and the broader adversarial qualification remain open.

Before promoting a successor binding, define semantic channel IDs and multiple
`VEC4` pages, then add an explicit v1 hoodoo-to-v2 fixture. The migration must
preserve original accessor bytes and map all four old roles without silently
reinterpreting them. Any GLB or shader contract byte change requires refreshed
C11 visual/restore evidence and separate C12 engine qualification.

No database migration or catalog seed is part of the representative slice. A
future hosted asset needs visual approval, license review, immutable public R2
URLs, engine qualification, and the next append-only catalog seed; existing
released seeds must not be edited.
