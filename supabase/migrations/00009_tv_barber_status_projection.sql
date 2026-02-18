-- =============================================
-- TV BARBER STATUS PROJECTION + REPLICA IDENTITY
--
-- Problem: barber_status has anon SELECT via RLS but
-- DELETE payloads are empty without REPLICA IDENTITY FULL,
-- and subscribing directly to barber_status couples the TV
-- to the internal table. Mirror it like tv_walkins.
-- =============================================

-- =============================================
-- 1. tv_barber_status — realtime-safe mirror
-- =============================================
CREATE TABLE tv_barber_status (
  shop_id         UUID NOT NULL,
  barber_id       UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'UNKNOWN',
  status_detail   TEXT,
  free_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (shop_id, barber_id)
);

-- RLS: anon can SELECT (no PII in this table)
ALTER TABLE tv_barber_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tv_barber_status_anon_select" ON tv_barber_status
  FOR SELECT TO anon USING (true);

CREATE POLICY "tv_barber_status_auth_select" ON tv_barber_status
  FOR SELECT TO authenticated USING (true);

-- =============================================
-- 2. Trigger: sync barber_status → tv_barber_status
-- =============================================
CREATE OR REPLACE FUNCTION sync_tv_barber_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM tv_barber_status
     WHERE barber_id = OLD.barber_id;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE
  INSERT INTO tv_barber_status (shop_id, barber_id, status, status_detail, free_at, updated_at)
  VALUES (NEW.shop_id, NEW.barber_id, NEW.status, NEW.status_detail, NEW.free_at, now())
  ON CONFLICT (barber_id) DO UPDATE SET
    shop_id       = EXCLUDED.shop_id,
    status        = EXCLUDED.status,
    status_detail = EXCLUDED.status_detail,
    free_at       = EXCLUDED.free_at,
    updated_at    = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_tv_barber_status
  AFTER INSERT OR UPDATE OR DELETE ON barber_status
  FOR EACH ROW EXECUTE FUNCTION sync_tv_barber_status();

-- =============================================
-- 3. Backfill from existing barber_status rows
-- =============================================
INSERT INTO tv_barber_status (shop_id, barber_id, status, status_detail, free_at, updated_at)
SELECT shop_id, barber_id, status, status_detail, free_at, now()
FROM barber_status
ON CONFLICT (barber_id) DO NOTHING;

-- =============================================
-- 4. Publication + replica identity
--    REPLICA IDENTITY FULL ensures DELETE payloads
--    include all column values (not just PK).
-- =============================================
ALTER TABLE tv_walkins        REPLICA IDENTITY FULL;
ALTER TABLE tv_barber_status  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE tv_barber_status;

-- Remove barber_status from publication (replaced by mirror)
ALTER PUBLICATION supabase_realtime DROP TABLE barber_status;
