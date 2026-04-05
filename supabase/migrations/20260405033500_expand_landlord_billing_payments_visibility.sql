-- Expand landlord visibility for orphan billing rows (rental_id is NULL)
-- by inferring ownership through payments.tenant_id -> rentals -> units -> properties.

DROP POLICY IF EXISTS "Landlord can view payments for their tenants" ON public.payments;

CREATE POLICY "Landlord can view payments for their tenants" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.tenant_id = payments.tenant_id
        AND p.landlord_id = auth.uid()
    )
  );

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
