-- =============================================
-- Allow landlords to view tenant profiles
-- for applications to their properties
-- =============================================

-- Drop existing problematic policy if it exists
DROP POLICY IF EXISTS "Landlords can view applicant profiles" ON public.profiles;

-- Create helper function to check if user can view a tenant's profile
-- Uses SECURITY DEFINER to avoid infinite recursion
CREATE OR REPLACE FUNCTION is_landlord_of_tenant_applicant(tenant_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_applications ta
    JOIN public.units u ON ta.unit_id = u.id
    JOIN public.properties p ON u.property_id = p.id
    WHERE ta.tenant_id = tenant_id
    AND p.landlord_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_landlord_of_tenant_applicant(uuid) TO authenticated;

-- Add policy to allow landlords to view tenant profiles
CREATE POLICY "Landlords can view applicant profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    -- User is looking at their own profile
    id = auth.uid()
    -- OR user is a landlord viewing a tenant's profile
    OR is_landlord_of_tenant_applicant(id)
  );
