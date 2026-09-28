create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);

create table if not exists catalog_seed_batches (
  name text primary key,
  sha256 text not null,
  release text,
  asset_count integer not null default 0 check (asset_count >= 0),
  applied_at timestamptz not null default now()
);

create table if not exists creations (
  id uuid primary key default gen_random_uuid(),
  doc_key text not null,
  type text not null,
  label text not null,
  description text,
  document jsonb not null,
  tags text[] not null default '{}',
  source text not null default 'local',
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, doc_key)
);

create index if not exists creations_updated on creations (updated_at desc);
create index if not exists creations_search on creations using gin (
  to_tsvector('simple', label || ' ' || coalesce(description, ''))
);

create table if not exists lab_drafts (
  lab_id text not null,
  draft_key text not null default 'current',
  document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (lab_id, draft_key)
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid references creations(id) on delete cascade,
  kind text not null,
  object_key text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  source_url text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (creation_id, object_key)
);

create index if not exists files_object_key on files (object_key);

create table if not exists catalog_assets (
  id text primary key,
  release text not null,
  source text not null,
  source_id text,
  kind text not null,
  name text not null,
  description text,
  license text not null,
  attribution text,
  source_url text,
  download_url text not null,
  thumbnail_url text,
  sha256 text not null,
  byte_size bigint not null check (byte_size >= 0),
  content_type text not null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  search_tsv tsvector generated always as (
    to_tsvector('simple', name || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists catalog_assets_release on catalog_assets (release, id);
create index if not exists catalog_assets_search on catalog_assets using gin (search_tsv);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  kind text not null,
  status text not null check (status in (
    'queued', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  request jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_status on generation_jobs (status, created_at);

-- Compatibility state for labs that still expose synchronous localStorage
-- APIs. The browser is only a memory/cache surface; durable values live here.
create table if not exists lab_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists legacy_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  imported integer not null default 0,
  skipped integer not null default 0,
  failures jsonb not null default '[]',
  committed_at timestamptz not null default now()
);
