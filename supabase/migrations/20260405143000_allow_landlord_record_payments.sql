-- Allow landlords to record payments for billings they own.
-- Also allow landlords to mark their own billings as paid.

DROP POLICY IF EXISTS "Landlord can insert payments for own billings" ON public.payments;
CREATE POLICY "Landlord can insert payments for own billings" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.billings b
      LEFT JOIN public.rentals r ON r.id = b.rental_id
      LEFT JOIN public.units u ON u.id = COALESCE(b.unit_id, r.unit_id)
      LEFT JOIN public.properties p ON p.id = COALESCE(b.property_id, u.property_id)
      WHERE b.id = payments.billing_id
        AND (b.landlord_id = auth.uid() OR p.landlord_id = auth.uid())
        AND (b.tenant_id IS NULL OR b.tenant_id = payments.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Landlord can update billings for own properties" ON public.billings;
CREATE POLICY "Landlord can update billings for own properties" ON public.billings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.id = billings.rental_id
        AND p.landlord_id = auth.uid()
    )
    OR billings.landlord_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.id = billings.rental_id
        AND p.landlord_id = auth.uid()
    )
    OR billings.landlord_id = auth.uid()
  );
