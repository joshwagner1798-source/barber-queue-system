-- =============================================================================
-- Add client_name, kind, notes columns to provider_appointments
-- =============================================================================

ALTER TABLE provider_appointments
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS kind        TEXT NOT NULL DEFAULT 'appointment',
  ADD COLUMN IF NOT EXISTS notes       TEXT;

-- Index: speeds up TV API "current window" and "next appointment" queries
CREATE INDEX IF NOT EXISTS idx_provider_appt_barber_kind_start
  ON provider_appointments (barber_id, kind, start_at);

-- =============================================================================
-- Backfill client_name from Acuity payload_json
-- Only runs for rows that have payload_json with a firstName field.
-- Does NOT overwrite rows that already have client_name set.
-- =============================================================================
UPDATE provider_appointments
SET client_name = trim(
  coalesce(payload_json->>'firstName', '') ||
  CASE
    WHEN coalesce(payload_json->>'lastName', '') != ''
      THEN ' ' || (payload_json->>'lastName')
    ELSE ''
  END
)
WHERE client_name IS NULL
  AND kind = 'appointment'
  AND payload_json IS NOT NULL
  AND coalesce(payload_json->>'firstName', '') != '';
