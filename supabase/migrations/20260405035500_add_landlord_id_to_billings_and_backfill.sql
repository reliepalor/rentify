-- Add landlord ownership column to billings so orphan rows (rental_id IS NULL)
-- can still be scoped and fetched per landlord.

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS landlord_id uuid;

-- Backfill landlord_id from rental linkage when rental_id exists.
UPDATE public.billings b
SET landlord_id = p.landlord_id
FROM public.rentals r
JOIN public.units u ON u.id = r.unit_id
JOIN public.properties p ON p.id = u.property_id
WHERE b.rental_id = r.id
  AND b.landlord_id IS NULL;

-- If this environment currently has exactly one landlord, safely assign orphan rows to that landlord.
DO $$
DECLARE
  landlord_count int;
  single_landlord uuid;
BEGIN
  SELECT COUNT(DISTINCT landlord_id)
  INTO landlord_count
  FROM public.properties;

  SELECT landlord_id
  INTO single_landlord
  FROM public.properties
  WHERE landlord_id IS NOT NULL
  LIMIT 1;

  IF landlord_count = 1 THEN
    UPDATE public.billings
    SET landlord_id = single_landlord
    WHERE rental_id IS NULL
      AND landlord_id IS NULL;
  END IF;
END
$$;

-- Keep landlord_id synced whenever rental_id is provided.
CREATE OR REPLACE FUNCTION public.sync_billings_landlord_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rental_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.landlord_id
  INTO NEW.landlord_id
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = NEW.rental_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_billings_landlord_id ON public.billings;
CREATE TRIGGER trg_sync_billings_landlord_id
BEFORE INSERT OR UPDATE OF rental_id ON public.billings
FOR EACH ROW
EXECUTE FUNCTION public.sync_billings_landlord_id();

-- Add FK and index for filtering performance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billings_landlord_id_fkey'
  ) THEN
    ALTER TABLE public.billings
      ADD CONSTRAINT billings_landlord_id_fkey
      FOREIGN KEY (landlord_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_billings_landlord_id ON public.billings(landlord_id);

-- Recreate landlord billing policy to include landlord_id fallback.
DROP POLICY IF EXISTS "Landlord can view billings for their properties" ON public.billings;

CREATE POLICY "Landlord can view billings for their properties" ON public.billings
  FOR SELECT TO authenticated USING (
    billings.landlord_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.id = billings.rental_id
        AND p.landlord_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.payments pay
      JOIN public.rentals r ON r.tenant_id = pay.tenant_id
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE pay.billing_id = billings.id
        AND p.landlord_id = auth.uid()
    )
  );
