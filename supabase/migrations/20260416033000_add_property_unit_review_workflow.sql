-- Property and unit draft review workflow

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS approval_remarks text,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.units
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS approval_remarks text,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);

UPDATE public.properties
SET approval_status = 'approved'
WHERE approval_status IS NULL;

UPDATE public.units
SET approval_status = 'approved'
WHERE approval_status IS NULL;

ALTER TABLE public.properties
ALTER COLUMN approval_status SET NOT NULL,
ALTER COLUMN approval_status SET DEFAULT 'pending';

ALTER TABLE public.units
ALTER COLUMN approval_status SET NOT NULL,
ALTER COLUMN approval_status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_approval_status_check'
  ) THEN
    ALTER TABLE public.properties
    ADD CONSTRAINT properties_approval_status_check
    CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_approval_status_check'
  ) THEN
    ALTER TABLE public.units
    ADD CONSTRAINT units_approval_status_check
    CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_approval_status
ON public.properties (approval_status);

CREATE INDEX IF NOT EXISTS idx_units_approval_status
ON public.units (approval_status);

DROP POLICY IF EXISTS "Anyone can view active properties" ON public.properties;
CREATE POLICY "Anyone can view active properties" ON public.properties
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND is_active = true
    AND approval_status = 'approved'
  );

DROP POLICY IF EXISTS "Anyone can view available units" ON public.units;
CREATE POLICY "Anyone can view available units" ON public.units
  FOR SELECT TO authenticated
  USING (
    approval_status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = units.property_id
        AND p.status = 'active'
        AND p.is_active = true
        AND p.approval_status = 'approved'
    )
  );
