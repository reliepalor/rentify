-- Auto-create rental rows when an application is approved.
-- This supports manual SQL inserts/updates to tenant_applications.

CREATE OR REPLACE FUNCTION public.create_rental_from_approved_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly_rent numeric(12,2);
BEGIN
  -- Only react to approved applications.
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  -- Ignore updates that were already approved before.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  -- Ensure only one active rental exists per unit.
  IF EXISTS (
    SELECT 1
    FROM public.rentals r
    WHERE r.unit_id = NEW.unit_id
      AND r.status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT u.monthly_rent
  INTO v_monthly_rent
  FROM public.units u
  WHERE u.id = NEW.unit_id;

  IF v_monthly_rent IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.rentals (
    tenant_id,
    unit_id,
    start_date,
    monthly_rent,
    status
  )
  VALUES (
    NEW.tenant_id,
    NEW.unit_id,
    COALESCE(NEW.application_date::date, CURRENT_DATE),
    v_monthly_rent,
    'active'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_rental_from_approved_application ON public.tenant_applications;

CREATE TRIGGER trg_create_rental_from_approved_application
AFTER INSERT OR UPDATE OF status
ON public.tenant_applications
FOR EACH ROW
EXECUTE FUNCTION public.create_rental_from_approved_application();

-- Backfill rentals for already approved applications that do not yet have active rentals.
INSERT INTO public.rentals (
  tenant_id,
  unit_id,
  start_date,
  monthly_rent,
  status
)
SELECT
  ta.tenant_id,
  ta.unit_id,
  COALESCE(ta.application_date::date, CURRENT_DATE),
  u.monthly_rent,
  'active'
FROM (
  SELECT DISTINCT ON (a.unit_id)
    a.tenant_id,
    a.unit_id,
    a.application_date,
    a.created_at,
    a.id
  FROM public.tenant_applications a
  WHERE a.status = 'approved'
  ORDER BY a.unit_id, a.application_date DESC, a.created_at DESC, a.id DESC
) ta
JOIN public.units u
  ON u.id = ta.unit_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rentals r
  WHERE r.unit_id = ta.unit_id
    AND r.status = 'active'
);
