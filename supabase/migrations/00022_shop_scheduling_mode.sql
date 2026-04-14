-- =============================================================================
-- 00021_shop_scheduling_mode.sql
--
-- Adds scheduling configuration to shop_settings:
--   scheduling_mode      — 'off' | 'native' | 'external'
--                          off:      scheduling disabled; barber cards non-interactive
--                          native:   in-app booking sheet opens on barber card tap
--                          external: barber card tap deep-links to third-party scheduler
--   external_booking_url — base URL for Acuity / Booksy / Square / etc.
--                          may include {barber_name} for interpolation in the future
--
-- Default 'off' preserves existing behavior for all current shops.
-- =============================================================================

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS scheduling_mode      TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS external_booking_url TEXT;

-- Constrain to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_settings_scheduling_mode_check'
  ) THEN
    ALTER TABLE shop_settings
      ADD CONSTRAINT shop_settings_scheduling_mode_check
        CHECK (scheduling_mode IN ('off', 'native', 'external'));
  END IF;
END
$$;
