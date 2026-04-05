-- =============================================
-- Allow landlords to update applications for their own units
-- =============================================

DROP POLICY IF EXISTS "Landlord can update applications for their units" ON public.tenant_applications;

CREATE POLICY "Landlord can update applications for their units" ON public.tenant_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = tenant_applications.unit_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = tenant_applications.unit_id
        AND p.landlord_id = auth.uid()
    )
  );
