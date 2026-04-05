-- Store tenant ownership directly on billings so rows can be tied to the tenant
-- even when the rental join is not expanded in the UI.

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill tenant_id from the rental when billings already have a rental_id.
UPDATE public.billings b
SET tenant_id = r.tenant_id
FROM public.rentals r
WHERE b.rental_id = r.id
  AND b.tenant_id IS NULL;

-- Keep both tenant_id and landlord_id in sync from rental_id whenever possible.
CREATE OR REPLACE FUNCTION public.sync_billings_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rental_record record;
BEGIN
  IF NEW.rental_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.tenant_id, p.landlord_id
  INTO rental_record
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = NEW.rental_id;

  NEW.tenant_id := rental_record.tenant_id;
  NEW.landlord_id := rental_record.landlord_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_billings_landlord_id ON public.billings;
DROP TRIGGER IF EXISTS trg_sync_billings_ownership ON public.billings;

CREATE TRIGGER trg_sync_billings_ownership
BEFORE INSERT OR UPDATE OF rental_id ON public.billings
FOR EACH ROW
EXECUTE FUNCTION public.sync_billings_ownership();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billings_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.billings
      ADD CONSTRAINT billings_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_billings_tenant_id ON public.billings(tenant_id);

DROP POLICY IF EXISTS "Tenant can view own billings" ON public.billings;

CREATE POLICY "Tenant can view own billings" ON public.billings
  FOR SELECT TO authenticated USING (
    billings.tenant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rentals
      WHERE id = billings.rental_id
        AND tenant_id = auth.uid()
    )
  );
