-- Fix landlord payments RLS policy join path.
-- payments.billing_id references billings.id, not rentals.id.
DROP POLICY IF EXISTS "Landlord can view payments for their tenants" ON public.payments;

CREATE POLICY "Landlord can view payments for their tenants" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.billings b
      JOIN public.rentals r ON r.id = b.rental_id
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE b.id = payments.billing_id
        AND p.landlord_id = auth.uid()
    )
  );
