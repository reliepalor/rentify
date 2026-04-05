-- =============================================
-- FIX: Replace broken function with corrected parameter naming
-- =============================================

-- Drop the old broken function
DROP FUNCTION IF EXISTS is_landlord_of_tenant_applicant(uuid) CASCADE;

-- Recreate with correct parameter name (p_tenant_id to avoid ambiguity)
CREATE FUNCTION is_landlord_of_tenant_applicant(p_tenant_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_applications ta
    JOIN public.units u ON ta.unit_id = u.id
    JOIN public.properties p ON u.property_id = p.id
    WHERE ta.tenant_id = p_tenant_id
    AND p.landlord_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_landlord_of_tenant_applicant(uuid) TO authenticated;
