-- Allow landlords to update rental end dates without granting broad update access.

CREATE OR REPLACE FUNCTION public.update_rental_end_date(p_rental_id uuid, p_end_date date)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.rentals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.*
  INTO v_rental
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = p_rental_id
    AND r.status = 'active'
    AND p.landlord_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found or access denied';
  END IF;

  UPDATE public.rentals
  SET end_date = p_end_date,
      updated_at = now()
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_rental(p_rental_id uuid)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.rentals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.*
  INTO v_rental
  FROM public.rentals r
  JOIN public.units u ON u.id = r.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE r.id = p_rental_id
    AND r.status = 'active'
    AND p.landlord_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found or access denied';
  END IF;

  UPDATE public.rentals
  SET status = 'ended',
      end_date = current_date,
      updated_at = now()
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_rental_end_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_rental(uuid) TO authenticated;
