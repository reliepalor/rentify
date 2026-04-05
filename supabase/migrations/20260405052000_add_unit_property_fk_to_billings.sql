-- Add direct foreign keys so billings can fetch property/unit by id.

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS property_id uuid;

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS unit_id uuid;

-- Backfill property_id and unit_id from rental -> unit -> property.
UPDATE public.billings b
SET
  unit_id = u.id,
  property_id = p.id
FROM public.rentals r
JOIN public.units u ON u.id = r.unit_id
JOIN public.properties p ON p.id = u.property_id
WHERE b.rental_id = r.id
  AND (b.unit_id IS NULL OR b.property_id IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billings_property_id_fkey'
  ) THEN
    ALTER TABLE public.billings
      ADD CONSTRAINT billings_property_id_fkey
      FOREIGN KEY (property_id)
      REFERENCES public.properties(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billings_unit_id_fkey'
  ) THEN
    ALTER TABLE public.billings
      ADD CONSTRAINT billings_unit_id_fkey
      FOREIGN KEY (unit_id)
      REFERENCES public.units(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_billings_property_id ON public.billings(property_id);
CREATE INDEX IF NOT EXISTS idx_billings_unit_id ON public.billings(unit_id);

-- Keep ownership and unit/property ids synchronized from rental_id.
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

  SELECT
    r.tenant_id,
    p.landlord_id,
    p.id AS property_id,
    u.id AS unit_id,
    p.name AS property_name,
    u.room_number AS unit_label
  INTO rental_record
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = NEW.rental_id;

  NEW.tenant_id := rental_record.tenant_id;
  NEW.landlord_id := rental_record.landlord_id;
  NEW.property_id := rental_record.property_id;
  NEW.unit_id := rental_record.unit_id;
  NEW.property_name := rental_record.property_name;
  NEW.unit_label := rental_record.unit_label;

  RETURN NEW;
END
$$;
