-- =============================================================================
-- 00023_clients_email.sql
--
-- Adds nullable email column to clients table.
-- Used for post-booking opt-in: customer can save email after confirming a
-- booking for faster future booking via email OTP (Phase 2).
--
-- No uniqueness constraint here — that comes when the OTP identity path is
-- built and we need to enforce one account per (shop_id, email).
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Partial index — only index non-null emails; keeps the index small
CREATE INDEX IF NOT EXISTS idx_clients_shop_email
  ON public.clients(shop_id, email)
  WHERE email IS NOT NULL;
