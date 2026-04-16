-- Landlord Verification Management Module
-- Adds verification tables, workflow constraints, storage bucket policies, and audit logging.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'landlord_verification_status') THEN
    CREATE TYPE public.landlord_verification_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'resubmission_required'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'landlord_document_type') THEN
    CREATE TYPE public.landlord_document_type AS ENUM (
      'business_permit',
      'barangay_clearance',
      'valid_id'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_verification_action') THEN
    CREATE TYPE public.admin_verification_action AS ENUM (
      'approved',
      'rejected',
      'resubmission_requested'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.landlords (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  contact_number text,
  status public.landlord_verification_status NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL REFERENCES public.landlords(id) ON DELETE CASCADE,
  type public.landlord_document_type NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT documents_landlord_type_unique UNIQUE (landlord_id, type)
);

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL REFERENCES public.landlords(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action public.admin_verification_action NOT NULL,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS landlords_status_created_at_idx
  ON public.landlords (status, created_at DESC);

CREATE INDEX IF NOT EXISTS documents_landlord_uploaded_idx
  ON public.documents (landlord_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_landlord_created_idx
  ON public.admin_actions (landlord_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_landlords_updated_at'
  ) THEN
    CREATE TRIGGER trg_landlords_updated_at
    BEFORE UPDATE ON public.landlords
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_landlord_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'resubmission_required') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'resubmission_required' AND NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid landlord status transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_landlord_status_transition ON public.landlords;
CREATE TRIGGER trg_validate_landlord_status_transition
BEFORE UPDATE OF status ON public.landlords
FOR EACH ROW
EXECUTE FUNCTION public.validate_landlord_status_transition();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_admin_action()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_action public.admin_verification_action;
BEGIN
  SELECT action
  INTO latest_action
  FROM public.admin_actions
  WHERE landlord_id = NEW.landlord_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF latest_action = NEW.action THEN
    RAISE EXCEPTION 'Duplicate admin action for this landlord is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_admin_action ON public.admin_actions;
CREATE TRIGGER trg_prevent_duplicate_admin_action
BEFORE INSERT ON public.admin_actions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_admin_action();

CREATE OR REPLACE FUNCTION public.mark_landlord_pending_after_resubmission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.landlords
  SET status = 'pending',
      updated_at = timezone('utc', now())
  WHERE id = NEW.landlord_id
    AND status = 'resubmission_required';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_landlord_verification_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  IF lower(trim(COALESCE(NEW.role, ''))) <> 'landlord' THEN
    RETURN NEW;
  END IF;

  SELECT email
  INTO user_email
  FROM auth.users
  WHERE id = NEW.id;

  INSERT INTO public.landlords (id, full_name, email, contact_number, status, is_active)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.full_name), ''), split_part(COALESCE(user_email, ''), '@', 1), 'Landlord User'),
    COALESCE(user_email, CONCAT(NEW.id::text, '@placeholder.local')),
    NEW.contact_number,
    'pending'::public.landlord_verification_status,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      contact_number = EXCLUDED.contact_number,
      updated_at = timezone('utc', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_landlord_pending_after_resubmission ON public.documents;
CREATE TRIGGER trg_mark_landlord_pending_after_resubmission
AFTER INSERT OR UPDATE OF file_url, uploaded_at ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.mark_landlord_pending_after_resubmission();

DROP TRIGGER IF EXISTS trg_sync_landlord_verification_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_landlord_verification_from_profile
AFTER INSERT OR UPDATE OF role, full_name, contact_number ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_landlord_verification_from_profile();

-- Seed landlords from existing profile + auth records.
INSERT INTO public.landlords (id, full_name, email, contact_number, status, is_active)
SELECT
  p.id,
  COALESCE(NULLIF(trim(p.full_name), ''), split_part(u.email, '@', 1), 'Landlord User') AS full_name,
  u.email,
  p.contact_number,
  'pending'::public.landlord_verification_status,
  false
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(trim(p.role)) = 'landlord'
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    contact_number = EXCLUDED.contact_number,
    updated_at = timezone('utc', now());

ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read all landlords" ON public.landlords;
CREATE POLICY "Admin can read all landlords" ON public.landlords
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Landlord can read own verification record" ON public.landlords;
CREATE POLICY "Landlord can read own verification record" ON public.landlords
FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Admin can update landlords" ON public.landlords;
CREATE POLICY "Admin can update landlords" ON public.landlords
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can read all documents" ON public.documents;
CREATE POLICY "Admin can read all documents" ON public.documents
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Landlord can read own documents" ON public.documents;
CREATE POLICY "Landlord can read own documents" ON public.documents
FOR SELECT TO authenticated
USING (landlord_id = auth.uid());

DROP POLICY IF EXISTS "Landlord can insert own documents" ON public.documents;
CREATE POLICY "Landlord can insert own documents" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (landlord_id = auth.uid());

DROP POLICY IF EXISTS "Landlord can update own documents" ON public.documents;
CREATE POLICY "Landlord can update own documents" ON public.documents
FOR UPDATE TO authenticated
USING (landlord_id = auth.uid())
WITH CHECK (landlord_id = auth.uid());

DROP POLICY IF EXISTS "Landlord can delete own documents" ON public.documents;
CREATE POLICY "Landlord can delete own documents" ON public.documents
FOR DELETE TO authenticated
USING (landlord_id = auth.uid());

DROP POLICY IF EXISTS "Admin can read action logs" ON public.admin_actions;
CREATE POLICY "Admin can read action logs" ON public.admin_actions
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert action logs" ON public.admin_actions;
CREATE POLICY "Admin can insert action logs" ON public.admin_actions
FOR INSERT TO authenticated
WITH CHECK (public.is_admin() AND admin_id = auth.uid());

INSERT INTO storage.buckets (id, name, public)
VALUES ('landlord-documents', 'landlord-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin can view landlord documents" ON storage.objects;
CREATE POLICY "Admin can view landlord documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'landlord-documents'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "Landlord can view own landlord documents" ON storage.objects;
CREATE POLICY "Landlord can view own landlord documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'landlord-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "Landlord can upload own landlord documents" ON storage.objects;
CREATE POLICY "Landlord can upload own landlord documents"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'landlord-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Landlord can update own landlord documents" ON storage.objects;
CREATE POLICY "Landlord can update own landlord documents"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'landlord-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'landlord-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Landlord can delete own landlord documents" ON storage.objects;
CREATE POLICY "Landlord can delete own landlord documents"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'landlord-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Admin can manage landlord documents" ON storage.objects;
CREATE POLICY "Admin can manage landlord documents"
ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'landlord-documents'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'landlord-documents'
  AND public.is_admin()
);
