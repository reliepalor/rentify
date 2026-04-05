-- Break RLS recursion between payments INSERT checks and billings SELECT policy.
-- Root cause: billings landlord visibility policy referenced public.payments,
-- while payments INSERT policy checks ownership via public.billings.

DROP POLICY IF EXISTS "Landlord can view billings for their properties" ON public.billings;

CREATE POLICY "Landlord can view billings for their properties" ON public.billings
  FOR SELECT TO authenticated
  USING (
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
      FROM public.properties p
      WHERE p.id = billings.property_id
        AND p.landlord_id = auth.uid()
    )
  );
