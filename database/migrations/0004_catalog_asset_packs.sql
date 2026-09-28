alter table catalog_assets
  alter column download_url drop not null;

alter table catalog_assets
  add column if not exists license_url text,
  add column if not exists attribution_required boolean not null default false,
  add column if not exists redistribution_scope text not null default 'archive',
  add column if not exists license_reviewed_at date,
  add column if not exists availability_status text not null default 'active',
  add column if not exists withdrawal_reason text;

alter table catalog_assets
  drop constraint if exists catalog_assets_redistribution_scope_check;
alter table catalog_assets
  add constraint catalog_assets_redistribution_scope_check
  check (redistribution_scope in ('external-only', 'archive', 'archive-and-files'));

alter table catalog_assets
  drop constraint if exists catalog_assets_availability_status_check;
alter table catalog_assets
  add constraint catalog_assets_availability_status_check
  check (availability_status in ('active', 'withdrawn'));

create table if not exists catalog_asset_files (
  asset_id text not null references catalog_assets(id) on delete cascade,
  relative_path text not null,
  kind text not null default 'file',
  download_url text,
  sha256 text not null,
  byte_size bigint not null check (byte_size >= 0),
  content_type text not null,
  notice text,
  compatibility jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (asset_id, relative_path)
);

create index if not exists catalog_asset_files_asset
  on catalog_asset_files (asset_id, relative_path);
