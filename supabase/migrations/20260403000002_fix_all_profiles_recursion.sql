-- =============================================
-- COMPREHENSIVE FIX for all profiles RLS recursion
-- Drop all problematic policies and recreate with SECURITY DEFINER functions
-- =============================================

-- Drop all existing policies that might cause recursion
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Landlords can view applicant profiles" ON public.profiles;

-- Drop existing helper functions if they exist
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS is_landlord_of_tenant_applicant(uuid) CASCADE;

-- =============================================
-- Helper Functions (SECURITY DEFINER to avoid recursion)
-- =============================================

-- Check if current user is admin
CREATE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() ->> 'user_role') = 'admin' OR
         (auth.jwt() ->> 'role') = 'authenticated' AND
         EXISTS (
           SELECT 1 FROM (
             SELECT auth.uid() as user_id
           ) u
           JOIN auth.users au ON au.id = u.user_id
           WHERE au.raw_user_meta_data ->> 'role' = 'admin'
         );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if current user is a landlord viewing a tenant's profile
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_landlord_of_tenant_applicant(uuid) TO authenticated;

-- =============================================
-- Safe RLS Policies (using SECURITY DEFINER functions)
-- =============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Admin can view all profiles (using safe helper)
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_admin());

-- Landlords can view tenant profiles if they have applications
CREATE POLICY "Landlords can view applicant profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_landlord_of_tenant_applicant(id));
