-- =============================================================================
-- 00024_walkin_duration_settings.sql
--
-- Adds walk-in duration configuration to shop_settings:
--   default_walkin_minutes      — estimated service duration used by canFitWalkin
--                                  and wait-time calculations (default: 30 min)
--   transition_buffer_minutes   — cleanup/prep buffer between services (default: 5 min)
--
-- These replace the scattered in-code constants:
--   WALKIN_PROVIDER_BUFFER_MINUTES = 30  (queue_assignment.ts)
--   WALKIN_ELIGIBILITY_BUFFER_MINUTES = 15  (eligible_barbers.ts)
--   DEFAULT_SERVICE_MINUTES = 30  (multiple files)
--   AVG_WALKIN_MINUTES = 30  (wait_time_estimator.ts)
--
-- All callers use .maybeSingle() with ?? 30 / ?? 5 fallbacks, so this migration
-- is safe to apply before or after code deployment with no breaking changes.
-- Existing shops receive the default values automatically.
-- =============================================================================

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS default_walkin_minutes    integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS transition_buffer_minutes integer NOT NULL DEFAULT 5;
