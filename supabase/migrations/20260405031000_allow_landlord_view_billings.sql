-- Allow landlords to view billings connected to their own properties.
DROP POLICY IF EXISTS "Landlord can view billings for their properties" ON public.billings;

CREATE POLICY "Landlord can view billings for their properties" ON public.billings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.id = billings.rental_id
        AND p.landlord_id = auth.uid()
    )
  );
