-- Older OSS builds mirrored object-shaped lab autosave stores into Library as
-- a synthetic numeric entry (usually "0"). Draft state remains in lab_state;
-- only the incorrectly promoted Library rows are removed.
delete from creations
where source = 'lab-state'
  and jsonb_typeof(document -> 'document') = 'object'
  and (document -> 'document') ? '__current__';
