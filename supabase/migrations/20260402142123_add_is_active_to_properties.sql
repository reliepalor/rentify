-- Add soft delete support for properties
ALTER TABLE public.properties 
ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Update existing records
UPDATE public.properties SET is_active = true;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON public.properties(is_active);

