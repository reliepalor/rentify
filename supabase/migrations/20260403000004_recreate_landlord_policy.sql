-- =============================================
-- Recreate the landlords applicant profile policy
-- =============================================

-- Recreate the policy that was dropped
CREATE POLICY "Landlords can view applicant profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_landlord_of_tenant_applicant(id));
