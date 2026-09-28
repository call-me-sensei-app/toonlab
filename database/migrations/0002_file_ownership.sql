-- Content-addressed bytes may be referenced by more than one creation.
-- Deduplicate the physical object while retaining one ownership row per
-- creation (and one unlinked row for newly generated/imported files).

alter table files drop constraint if exists files_object_key_key;
alter table files drop constraint if exists files_creation_id_object_key_key;
alter table files
  add constraint files_creation_object_unique
  unique nulls not distinct (creation_id, object_key);

create index if not exists files_object_key on files (object_key);
