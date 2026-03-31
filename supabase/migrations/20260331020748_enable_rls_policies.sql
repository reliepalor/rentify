-- =============================================
-- Enable RLS and Basic Policies
-- For Boarding House Integrated Billing System
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- PROPERTIES POLICIES
-- =============================================
CREATE POLICY "Anyone can view active properties" ON public.properties
  FOR SELECT TO authenticated USING (status = 'active');

CREATE POLICY "Landlord can manage own properties" ON public.properties
  FOR ALL TO authenticated USING (
    landlord_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- UNITS POLICIES
-- =============================================
CREATE POLICY "Anyone can view available units" ON public.units
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Landlord can manage own units" ON public.units
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.properties 
      WHERE id = units.property_id AND landlord_id = auth.uid()
    ) 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- TENANT APPLICATIONS POLICIES
-- =============================================
CREATE POLICY "Tenant can manage own applications" ON public.tenant_applications
  FOR ALL TO authenticated USING (tenant_id = auth.uid());

CREATE POLICY "Landlord can view applications for their units" ON public.tenant_applications
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON u.property_id = p.id
      WHERE u.id = tenant_applications.unit_id 
      AND p.landlord_id = auth.uid()
    )
  );

-- =============================================
-- RENTALS POLICIES
-- =============================================
CREATE POLICY "Tenant can view own rentals" ON public.rentals
  FOR SELECT TO authenticated USING (tenant_id = auth.uid());

CREATE POLICY "Landlord can view rentals of their properties" ON public.rentals
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON u.property_id = p.id
      WHERE u.id = rentals.unit_id AND p.landlord_id = auth.uid()
    )
  );

-- =============================================
-- BILLINGS & PAYMENTS POLICIES (Critical)
-- =============================================
CREATE POLICY "Tenant can view own billings" ON public.billings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.rentals WHERE id = billings.rental_id AND tenant_id = auth.uid())
  );

CREATE POLICY "Tenant can view own payments" ON public.payments
  FOR SELECT TO authenticated USING (tenant_id = auth.uid());

CREATE POLICY "Landlord can view payments for their tenants" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rentals r
      JOIN public.units u ON r.unit_id = u.id
      JOIN public.properties p ON u.property_id = p.id
      WHERE r.id = payments.billing_id 
        AND p.landlord_id = auth.uid()
    )
  );

-- Admin can see everything
CREATE POLICY "Admin full access on billings" ON public.billings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin full access on payments" ON public.payments
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );