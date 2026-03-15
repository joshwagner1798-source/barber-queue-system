-- 00019_booking_urls.sql
-- Adds booking URL fields:
--   users.direct_booking_url         — per-barber Acuity scheduling link
--   shop_settings.fallback_booking_url — shop-level fallback Acuity link
--
-- Using IF NOT EXISTS so this is safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS direct_booking_url text;

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS fallback_booking_url text;
