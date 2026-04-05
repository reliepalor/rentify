-- Backfill tenant ownership for orphan billing rows.
-- These rows currently have no rental_id, so assign them to the provided tenant.

UPDATE public.billings
SET tenant_id = 'c93ac47d-1b43-4f35-bd48-9147feffe919'
WHERE rental_id IS NULL
  AND tenant_id IS NULL;
