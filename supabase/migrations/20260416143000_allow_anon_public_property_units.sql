-- Allow public (anon) users to view approved active listings on landing pages.
-- Keeps visibility restricted to approved and active records.

DROP POLICY IF EXISTS "Anyone can view active properties" ON public.properties;
CREATE POLICY "Anyone can view active properties" ON public.properties
  FOR SELECT TO anon, authenticated
  USING (
    status = 'active'
    AND is_active = true
    AND approval_status = 'approved'
  );

DROP POLICY IF EXISTS "Anyone can view available units" ON public.units;
CREATE POLICY "Anyone can view available units" ON public.units
  FOR SELECT TO anon, authenticated
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
