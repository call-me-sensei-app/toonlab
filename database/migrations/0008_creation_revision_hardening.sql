-- Repair creations imported after 0007 ran but before the import path began
-- committing its initial snapshot.
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
    'hardening-backfill'
  from creations c
  where c.current_revision_id is null
    and not exists (select 1 from creation_revisions r where r.creation_id = c.id)
  returning id, creation_id
)
update creations c
set current_revision_id = inserted.id
from inserted
where c.id = inserted.creation_id;

create or replace function toonlab_guard_creation_revision_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.creation_id is distinct from old.creation_id
    or new.revision_number is distinct from old.revision_number
    or new.label is distinct from old.label
    or new.description is distinct from old.description
    or new.tags is distinct from old.tags
    or new.document is distinct from old.document
    or new.ai_generated is distinct from old.ai_generated
    or new.content_hash is distinct from old.content_hash
    or new.save_source is distinct from old.save_source
    or new.dependency_snapshot is distinct from old.dependency_snapshot
    or new.restored_from_revision_id is distinct from old.restored_from_revision_id
    or new.created_at is distinct from old.created_at then
    raise exception 'creation revision snapshots are immutable';
  end if;
  return new;
end;
$$;

create trigger creation_revisions_immutable_snapshot
before update on creation_revisions
for each row execute function toonlab_guard_creation_revision_snapshot();

create or replace function toonlab_guard_creation_revision_links()
returns trigger
language plpgsql
as $$
begin
  if new.restored_from_revision_id is not null and not exists (
    select 1 from creation_revisions r
    where r.id = new.restored_from_revision_id and r.creation_id = new.creation_id
  ) then
    raise exception 'restored revision must belong to the same creation';
  end if;
  return new;
end;
$$;

create trigger creation_revisions_same_creation_restore
before insert or update of restored_from_revision_id, creation_id on creation_revisions
for each row execute function toonlab_guard_creation_revision_links();

create or replace function toonlab_guard_current_creation_revision()
returns trigger
language plpgsql
as $$
begin
  if new.current_revision_id is not null and not exists (
    select 1 from creation_revisions r
    where r.id = new.current_revision_id and r.creation_id = new.id
  ) then
    raise exception 'current revision must belong to the same creation';
  end if;
  return new;
end;
$$;

create trigger creations_same_current_revision
before insert or update of current_revision_id, id on creations
for each row execute function toonlab_guard_current_creation_revision();
