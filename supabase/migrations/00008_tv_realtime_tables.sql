-- =============================================
-- TV REALTIME MIRROR TABLES
--
-- Problem: walkins has RLS (no anon SELECT) and neither
-- walkins nor barber_status are in the supabase_realtime
-- publication → postgres_changes never fires for the TV.
--
-- Fix: create tv_walkins (display-safe, anon-readable) synced
-- via trigger, and add both tv_walkins and barber_status to the
-- realtime publication.
-- =============================================

-- =============================================
-- 1. tv_walkins — realtime-safe mirror of active walkins
--    Contains only display fields. No client_id, no PII.
-- =============================================
CREATE TABLE tv_walkins (
  id                  UUID PRIMARY KEY,           -- same PK as walkins.id
  shop_id             UUID NOT NULL,
  status              TEXT NOT NULL,
  position            INT NOT NULL,
  display_name        VARCHAR(110),
  preference_type     TEXT NOT NULL DEFAULT 'ANY',
  preferred_barber_id UUID,
  assigned_barber_id  UUID,
  called_at           TIMESTAMPTZ,
  service_type        TEXT NOT NULL DEFAULT 'cut',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tv_walkins_shop_status ON tv_walkins(shop_id, status);

-- RLS: anon can SELECT (display-safe data only)
ALTER TABLE tv_walkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tv_walkins_anon_select" ON tv_walkins
  FOR SELECT TO anon USING (true);

CREATE POLICY "tv_walkins_auth_select" ON tv_walkins
  FOR SELECT TO authenticated USING (true);

-- =============================================
-- 2. Trigger function: sync walkins → tv_walkins
--    Only active statuses are mirrored.
-- =============================================
CREATE OR REPLACE FUNCTION sync_tv_walkins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DELETE from base table → remove mirror row
  IF TG_OP = 'DELETE' THEN
    DELETE FROM tv_walkins WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE
  IF NEW.status IN ('WAITING', 'CALLED', 'IN_SERVICE') THEN
    INSERT INTO tv_walkins (
      id, shop_id, status, position, display_name,
      preference_type, preferred_barber_id, assigned_barber_id,
      called_at
    )
    VALUES (
      NEW.id, NEW.shop_id, NEW.status, NEW.position, NEW.display_name,
      NEW.preference_type, NEW.preferred_barber_id, NEW.assigned_barber_id,
      NEW.called_at
    )
    ON CONFLICT (id) DO UPDATE SET
      status              = EXCLUDED.status,
      position            = EXCLUDED.position,
      display_name        = EXCLUDED.display_name,
      preference_type     = EXCLUDED.preference_type,
      preferred_barber_id = EXCLUDED.preferred_barber_id,
      assigned_barber_id  = EXCLUDED.assigned_barber_id,
      called_at           = EXCLUDED.called_at;
  ELSE
    -- Status left the active set → remove from mirror
    DELETE FROM tv_walkins WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_tv_walkins
  AFTER INSERT OR UPDATE OR DELETE ON walkins
  FOR EACH ROW EXECUTE FUNCTION sync_tv_walkins();

-- =============================================
-- 3. Backfill tv_walkins from existing active walkins
-- =============================================
INSERT INTO tv_walkins (
  id, shop_id, status, position, display_name,
  preference_type, preferred_barber_id, assigned_barber_id,
  called_at
)
SELECT
  id, shop_id, status, position, display_name,
  preference_type, preferred_barber_id, assigned_barber_id,
  called_at
FROM walkins
WHERE status IN ('WAITING', 'CALLED', 'IN_SERVICE')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 4. Add tables to supabase_realtime publication
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE tv_walkins;
ALTER PUBLICATION supabase_realtime ADD TABLE barber_status;
