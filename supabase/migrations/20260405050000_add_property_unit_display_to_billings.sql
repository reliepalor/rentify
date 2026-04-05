-- Add display fields for billing rows so the UI can always render "Property - Unit".

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS property_name text;

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS unit_label text;

-- Backfill display values from rental -> unit -> property.
UPDATE public.billings b
SET
  property_name = p.name,
  unit_label = u.room_number
FROM public.rentals r
JOIN public.units u ON u.id = r.unit_id
JOIN public.properties p ON p.id = u.property_id
WHERE b.rental_id = r.id
  AND (b.property_name IS NULL OR b.unit_label IS NULL);

-- Keep tenant/landlord/property/unit display data synchronized from rental_id.
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
    p.name AS property_name,
    u.room_number AS unit_label
  INTO rental_record
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = NEW.rental_id;

  NEW.tenant_id := rental_record.tenant_id;
  NEW.landlord_id := rental_record.landlord_id;
  NEW.property_name := rental_record.property_name;
  NEW.unit_label := rental_record.unit_label;

  RETURN NEW;
END
$$;
