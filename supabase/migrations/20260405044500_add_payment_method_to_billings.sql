-- Add a stored payment method to billings so the UI can read it directly.

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS payment_method text;

-- Backfill from the most recent payment for each billing.
UPDATE public.billings b
SET payment_method = latest_payment.method
FROM (
  SELECT DISTINCT ON (billing_id)
    billing_id,
    method
  FROM public.payments
  WHERE billing_id IS NOT NULL
  ORDER BY billing_id, payment_date DESC, created_at DESC
) AS latest_payment
WHERE b.id = latest_payment.billing_id;

CREATE OR REPLACE FUNCTION public.sync_billings_payment_method()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_method text;
BEGIN
  IF NEW.billing_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.method
  INTO latest_method
  FROM public.payments p
  WHERE p.billing_id = NEW.billing_id
  ORDER BY p.payment_date DESC, p.created_at DESC
  LIMIT 1;

  UPDATE public.billings
  SET payment_method = latest_method
  WHERE id = NEW.billing_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_billings_payment_method ON public.payments;

CREATE TRIGGER trg_sync_billings_payment_method
AFTER INSERT OR UPDATE OF billing_id, method, payment_date ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_billings_payment_method();
