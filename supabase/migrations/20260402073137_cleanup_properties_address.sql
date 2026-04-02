-- Cleanup properties table address fields
-- Remove old generic 'location' column and keep detailed Philippine address

-- Drop the old 'location' column
ALTER TABLE public.properties 
DROP COLUMN IF EXISTS location;

-- Make sure the new address columns exist (in case they weren't added before)
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS barangay TEXT,
ADD COLUMN IF NOT EXISTS municipality TEXT,
ADD COLUMN IF NOT EXISTS province TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add helpful comments
COMMENT ON COLUMN public.properties.address IS 'Full street address or landmark';
COMMENT ON COLUMN public.properties.barangay IS 'Barangay';
COMMENT ON COLUMN public.properties.municipality IS 'Municipality or City';
COMMENT ON COLUMN public.properties.province IS 'Province';
COMMENT ON COLUMN public.properties.image_url IS 'URL/path to main property image in Supabase Storage';

-- Optional: Add indexes for better performance on address searches
CREATE INDEX IF NOT EXISTS idx_properties_barangay ON public.properties(barangay);
CREATE INDEX IF NOT EXISTS idx_properties_municipality ON public.properties(municipality);
CREATE INDEX IF NOT EXISTS idx_properties_province ON public.properties(province);