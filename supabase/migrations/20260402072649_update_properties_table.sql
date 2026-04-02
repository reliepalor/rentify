-- Update properties table for better Philippine address and image support

-- 1. Add new address columns
ALTER TABLE public.properties 
ADD COLUMN barangay TEXT,
ADD COLUMN municipality TEXT,
ADD COLUMN province TEXT;

-- 2. Add image support
ALTER TABLE public.properties 
ADD COLUMN image_url TEXT;   -- will store Supabase Storage path

-- 3. (Optional) Drop the old generic location column if you no longer need it
-- ALTER TABLE public.properties DROP COLUMN IF EXISTS location;

-- 4. Add comment for documentation
COMMENT ON COLUMN public.properties.barangay IS 'Barangay name';
COMMENT ON COLUMN public.properties.municipality IS 'Municipality or City';
COMMENT ON COLUMN public.properties.province IS 'Province';
COMMENT ON COLUMN public.properties.image_url IS 'Path to property image in Supabase Storage';

-- Update RLS policy if needed (to allow updating new columns)
-- Since we already have "Landlords can manage own properties" policy, it should cover the new columns.