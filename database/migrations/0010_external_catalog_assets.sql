-- Catalog-only entries intentionally retain an upstream or independently
-- mirrored public URL. They have no release-owned byte payload, so storing a
-- fabricated SHA-256, byte count, or content type would be misleading.
alter table catalog_assets
  alter column sha256 drop not null,
  alter column byte_size drop not null,
  alter column content_type drop not null;

alter table catalog_assets
  drop constraint if exists catalog_assets_integrity_matches_scope;

alter table catalog_assets
  add constraint catalog_assets_integrity_matches_scope
  check (
    (
      redistribution_scope = 'external-only'
      and sha256 is null
      and byte_size is null
      and content_type is null
    )
    or
    (
      redistribution_scope <> 'external-only'
      and sha256 is not null
      and byte_size is not null
      and content_type is not null
    )
  );
