-- =============================================
-- PUBLIC READ-MODEL VIEWS
-- Replaces the minimal views from 00005 with richer
-- display-safe views for kiosk + TV.
-- No PII exposed (no phone, email, auth_id, client_id).
-- =============================================

-- =============================================
-- 1. public_barbers — active barbers with computed display_name
--    DROP first because column order changed from 00005 definition
-- =============================================
DROP VIEW IF EXISTS public_barbers;
CREATE VIEW public_barbers AS
SELECT
  u.id,
  u.shop_id,
  u.first_name,
  u.last_name,
  u.first_name || ' ' || u.last_name  AS display_name,
  u.avatar_url,
  u.display_order
FROM users u
WHERE u.role = 'barber'
  AND u.is_active = true;

-- =============================================
-- 2. public_walkins — active queue entries with assigned barber name
--    DROP first because column list changed from 00005 definition
-- =============================================
DROP VIEW IF EXISTS public_walkins;
CREATE VIEW public_walkins AS
SELECT
  w.id,
  w.shop_id,
  w.status,
  w.position,
  w.display_name,
  w.preference_type,
  w.preferred_barber_id,
  w.assigned_barber_id,
  b.first_name || ' ' || b.last_name  AS assigned_barber_name,
  w.called_at,
  w.service_type,
  w.created_at
FROM walkins w
LEFT JOIN users b
  ON b.id = w.assigned_barber_id
WHERE w.status IN ('WAITING', 'CALLED', 'IN_SERVICE');

-- =============================================
-- 3. Grants — anon + authenticated can SELECT views
--    (views run as the definer / migration role so
--     underlying RLS on users/walkins does not block them)
-- =============================================
GRANT SELECT ON public_barbers  TO anon;
GRANT SELECT ON public_barbers  TO authenticated;

GRANT SELECT ON public_walkins  TO anon;
GRANT SELECT ON public_walkins  TO authenticated;

-- Base tables remain locked down:
--   users   — RLS via 00002 (only staff roles visible to authenticated)
--   walkins — RLS via 00004 (shop-scoped, authenticated only)
--   clients — RLS via 00005 (admin only)
-- No anon SELECT policies exist on users, walkins, or clients.
