-- The first seed deliberately contains no binary catalog rows. Official
-- releases append idempotent INSERT ... ON CONFLICT statements in later
-- versioned seed files after their R2 objects pass release verification.
select 1;
