-- A revision snapshot must never be rewritten merely because its source
-- revision is deleted. NO ACTION also permits a whole creation (and all of
-- its mutually-related revisions) to be removed by the parent cascade.
alter table creation_revisions
  drop constraint creation_revisions_restored_from_revision_id_fkey;

alter table creation_revisions
  add constraint creation_revisions_restored_from_revision_id_fkey
  foreign key (restored_from_revision_id)
  references creation_revisions(id)
  on delete no action;
