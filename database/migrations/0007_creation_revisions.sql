create table if not exists creation_revisions (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references creations(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  label text not null,
  description text,
  tags text[] not null default '{}',
  document jsonb not null,
  ai_generated boolean not null default false,
  content_hash text not null,
  save_source text not null default 'manual',
  dependency_snapshot jsonb not null default '{}',
  restored_from_revision_id uuid references creation_revisions(id) on delete set null,
  version_name text,
  version_tags text[] not null default '{}',
  version_note text,
  pinned boolean not null default false,
  annotation_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creation_id, revision_number),
  check (version_name is null or char_length(version_name) between 1 and 120),
  check (version_note is null or char_length(version_note) <= 2000),
  check (cardinality(version_tags) <= 10)
);

create index if not exists creation_revisions_creation_created
  on creation_revisions (creation_id, revision_number desc);
create index if not exists creation_revisions_pinned
  on creation_revisions (creation_id, pinned, revision_number desc);
create unique index if not exists creation_revisions_unique_name
  on creation_revisions (creation_id, lower(version_name))
  where version_name is not null;

alter table creations
  add column if not exists current_revision_id uuid references creation_revisions(id) on delete set null;

with inserted as (
  insert into creation_revisions (
    creation_id, revision_number, label, description, tags, document,
    ai_generated, content_hash, save_source
  )
  select
    c.id,
    1,
    c.label,
    c.description,
    c.tags,
    c.document,
    c.ai_generated,
    encode(digest(convert_to(jsonb_build_object(
      'label', c.label,
      'description', c.description,
      'tags', c.tags,
      'document', c.document,
      'aiGenerated', c.ai_generated,
      'dependencies', '{}'::jsonb
    )::text, 'UTF8'), 'sha256'), 'hex'),
    'migration'
  from creations c
  where c.current_revision_id is null
    and not exists (
      select 1 from creation_revisions r where r.creation_id = c.id
    )
  returning id, creation_id
)
update creations c
set current_revision_id = inserted.id
from inserted
where c.id = inserted.creation_id;

update creations c
set current_revision_id = (
  select r.id
  from creation_revisions r
  where r.creation_id = c.id
  order by r.revision_number desc
  limit 1
)
where c.current_revision_id is null
  and exists (select 1 from creation_revisions r where r.creation_id = c.id);
